import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import {
  getDataRoot,
} from './helpers.js';
import { CONTROLLER_META } from './controller-registry.js';
import { getAllControllerStatus, getCachedStatusMap, initControllerStatus } from './controller-status.js';
import { classifyAll, invalidateClassifierCache } from './symbol-classifier.js';
import { registerV5Routes } from './routes/v5.js';
import { registerGraphRoutes } from './routes/graph.js';
import { registerWorkerRoutes } from './routes/workers.js';
import { registerBrainRoutes } from './routes/brain.js';
import { registerConfigRoutes } from './routes/config.js';
import { registerActivityRoutes } from './routes/activity.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerMcpRoutes } from './routes/mcp.js';
import { registerTrajectoryRoutes } from './routes/trajectories.js';
import { registerLegacyShims } from './routes/legacy-shims.js';

export function registerRoutes(app) {

  // Kick off controller-status background refresh. Runs once, stays warm.
  initControllerStatus().catch(err => console.error('[api] controller-status init:', err.message));

  // ── MCP HTTP daemon call helper (moved here so route modules can use it) ──
  // User-initiated only (button clicks). Not used for passive detection.
  function _vizMcpPort() {
    const root = getDataRoot();
    let hash = 0;
    for (let i = 0; i < root.length; i++) {
      hash = ((hash << 5) - hash) + root.charCodeAt(i);
      hash |= 0;
    }
    return (Math.abs(hash) % 1000) + 8000;
  }

  let _vizMcpInitialized = false;
  async function vizMcpCall(toolName, args = {}) {
    const port = _vizMcpPort();
    const http = await import('http');

    function post(body) {
      return new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.default.request({ hostname: 'localhost', port, path: '/rpc', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
          timeout: 15000 }, (res) => {
          let d = ''; res.on('data', c => d += c);
          res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('MCP timeout')); });
        req.write(data); req.end();
      });
    }

    // Initialize once per server lifetime
    if (!_vizMcpInitialized) {
      await post({ jsonrpc: '2.0', id: 0, method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'viz', version: '1.0' } } });
      _vizMcpInitialized = true;
    }

    const res = await post({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
      params: { name: toolName, arguments: args } });
    if (res?.error) throw new Error(res.error.message || JSON.stringify(res.error));
    try { return JSON.parse(res?.result?.content?.[0]?.text || '{}'); }
    catch { return res?.result?.content?.[0]?.text || res?.result || {}; }
  }

  // ── Bridge lazy-loader — fallback when MCP daemon is unreachable ──
  let _bridge = null;
  async function getBridge() {
    if (!_bridge) {
      try {
        const bridgePath = join(getDataRoot(), 'node_modules', '@claude-flow', 'cli', 'dist', 'src', 'memory', 'memory-bridge.js');
        _bridge = await import('file://' + bridgePath);
      } catch (e) {
        console.error('[Bridge] Failed to load:', e.message);
        _bridge = {};
      }
    }
    return _bridge;
  }

  // ── Diagnostic endpoints (classifier + status composite) — kept in api.js ──

  app.get('/api/controllers/status', async (req, res) => {
    try {
      // Always refresh on explicit probe — TTL cache stays fresh via background refresh
      if (req.query.refresh) await getAllControllerStatus();
      const statusMap = getCachedStatusMap();
      const out = {};
      for (const [name, entry] of statusMap.entries()) out[name] = entry;
      res.json({ count: statusMap.size, controllers: out, timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/controllers/classification', async (req, res) => {
    try {
      if (req.query.refresh) invalidateClassifierCache();
      // Make sure the MCP list is fresh
      if (req.query.refresh || getCachedStatusMap().size === 0) {
        await getAllControllerStatus();
      }
      const statusMap = getCachedStatusMap();
      const mcpList = Array.from(statusMap.values()).map(e => ({ name: e.name, enabled: e.enabled, level: e.level }));
      const classifications = classifyAll(mcpList);
      const byType = { ctrl: [], backend: [], util: [] };
      const out = {};
      for (const [id, info] of classifications.entries()) {
        out[id] = info;
        if (byType[info.nodeType]) byType[info.nodeType].push(id);
      }
      res.json({
        count: classifications.size,
        counts: { ctrl: byType.ctrl.length, backend: byType.backend.length, util: byType.util.length },
        byType,
        classifications: out,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── Graph routes (extracted to routes/graph.js 2026-04-18) ──
  //   /api/graph /api/graph/pulse /api/graph/config /api/graph/summary
  //   /api/pipeline-overview /api/node/:id
  registerGraphRoutes(app, { vizMcpCall });

  // ─── Worker routes (extracted to routes/workers.js 2026-04-18) ──
  //   POST /api/daemon/trigger  POST /api/learning/trigger
  registerWorkerRoutes(app, { vizMcpCall, getBridge });

  // ─── 4d. GET /api/daemon-health — Warm daemon + pipeline status ──

  app.get('/api/daemon-health', async (req, res) => {
    const root = getDataRoot();
    try {
      const health = { daemons: {}, pipeline: {}, qtable: {}, patterns: {} };

      // Check managed daemons (PID files)
      for (const name of ['metrics-daemon', 'swarm-monitor']) {
        const pidFile = join(root, '.claude-flow', 'pids', `${name}.pid`);
        let running = false;
        if (existsSync(pidFile)) {
          try {
            const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
            process.kill(pid, 0);
            running = true;
          } catch {}
        }
        health.daemons[name] = running;
      }

      // CLI daemon is dormant — workers run in-session only via MCP/viz buttons

      // Daemon state (pipeline stats) — actual location is .claude-flow/daemon-state.json
      for (const sf of [join(root, '.claude-flow', 'daemon-state.json'), join(root, '.claude-flow', 'data', 'hooks-daemon-state.json')]) {
        if (existsSync(sf)) {
          try { health.pipeline = JSON.parse(readFileSync(sf, 'utf8')); break; } catch {}
        }
      }

      // Intelligence stats via MCP (replaces .ruvector/intelligence.json Q-table)
      try {
        const intelStats = await vizMcpCall('hooks_intelligence_stats');
        if (intelStats) {
          health.qtable = {
            patternsLearned: intelStats.sona?.patternsLearned || 0,
            routingDecisions: intelStats.moe?.routingDecisions || 0,
            successRate: intelStats.sona?.successRate || 0,
            dataSource: intelStats.dataSource || 'unknown',
          };
        }
      } catch {}

      // Patterns.db counts
      try {
        const Database = require('better-sqlite3');
        const dbPath = join(root, '.claude-flow', 'learning', 'patterns.db');
        if (existsSync(dbPath)) {
          const db = new Database(dbPath, { readonly: true });
          let shortTerm = 0, longTerm = 0;
          try { shortTerm = db.prepare('SELECT count(*) as c FROM short_term_patterns').get()?.c || 0; } catch {}
          try { longTerm = db.prepare('SELECT count(*) as c FROM long_term_patterns').get()?.c || 0; } catch {}
          health.patterns = { shortTerm, longTerm };
          db.close();
        }
      } catch {}

      // Queue size
      const queueFile = join(root, '.claude-flow', 'data', 'hook-queue.jsonl');
      if (existsSync(queueFile)) {
        try {
          const content = readFileSync(queueFile, 'utf8').trim();
          health.queueSize = content ? content.split('\n').length : 0;
        } catch { health.queueSize = 0; }
      }

      // Route cache
      const cacheFile = join(root, '.claude-flow', 'data', 'route-cache.json');
      if (existsSync(cacheFile)) {
        try { health.routeCache = JSON.parse(readFileSync(cacheFile, 'utf8')); } catch {}
      }

      res.json(health);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/daemon/control — Daemon lifecycle ──

  app.post('/api/daemon/control', (req, res) => {
    const { daemon, action } = req.body || {};
    const VALID_DAEMONS = { 'hooks-daemon': 'start-hooks', 'metrics-daemon': 'start-metrics', 'swarm-monitor': 'start-swarm' };
    if (!daemon || !VALID_DAEMONS[daemon]) {
      return res.status(400).json({ error: `Invalid daemon. Must be: ${Object.keys(VALID_DAEMONS).join(', ')}` });
    }
    if (!action || !['start', 'stop', 'restart'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Must be: start, stop, restart' });
    }

    try {
      const managerPath = join(getDataRoot(), '.claude', 'helpers', 'daemon-manager.sh');
      const cmd = action === 'stop' ? 'stop' : action === 'restart' ? 'restart' : VALID_DAEMONS[daemon];
      const output = execSync(
        `bash "${managerPath}" ${cmd}`,
        { timeout: 15_000, encoding: 'utf8', cwd: getDataRoot() }
      );
      res.json({ ok: true, daemon, action, output: output.trim().slice(-200) });
    } catch (err) {
      res.status(500).json({ error: err.message, daemon, action });
    }
  });

  // ─── GET /api/current-session — Live session id ──

  app.get('/api/current-session', (req, res) => {
    try {
      const sessPath = join(getDataRoot(), '.claude-flow', 'data', 'current-session.json');
      if (existsSync(sessPath)) {
        res.json(JSON.parse(readFileSync(sessPath, 'utf-8')));
      } else {
        res.json({ sessionId: null });
      }
    } catch (err) { res.json({ error: err.message }); }
  });

  // ─── Brain routes (extracted to routes/brain.js 2026-04-18) ──
  //   GET /api/brain/status   POST /api/brain/search
  registerBrainRoutes(app, { vizMcpCall });

  // ─── Config routes (extracted to routes/config.js 2026-04-18) ──
  //   GET+POST /api/layout   GET+POST /api/theme
  registerConfigRoutes(app);

  // ─── Activity routes (extracted to routes/activity.js 2026-04-18) ──
  //   /api/activity /api/activity-stream /api/projects
  //   /api/ruflo-intelligence /api/auto-memory
  registerActivityRoutes(app, { vizMcpCall });

  // ─── Health / diagnostic routes (extracted to routes/health.js 2026-04-18) ──
  //   /api/mcp-health /api/worker-logs /api/embeddings-config /api/swarm-state
  //   /api/metrics/:name /api/session-metadata /api/security-audit /api/neural-stats
  //   /api/routing-stats /api/system/fallback-status
  registerHealthRoutes(app);

  // ─── MCP generic proxy (extracted to routes/mcp.js 2026-04-18) ──
  //   POST /api/mcp/:server/:tool  (read-only whitelist enforced)
  registerMcpRoutes(app);

  // ── Controller Health (reads from controller-status composite cache) ─
  app.get('/api/controllers', async (req, res) => {
    try {
      // Warm the cache if empty
      if (getCachedStatusMap().size === 0) await getAllControllerStatus();
      const statusMap = getCachedStatusMap();

      const controllers = [];
      for (const [name, entry] of statusMap) {
        const meta = CONTROLLER_META[name] || {};
        controllers.push({
          name,
          enabled: entry.enabled,
          status: entry.status,          // active | idle | degraded | broken
          level: entry.level || null,
          metric: entry.metric ?? null,
          lastActivity: entry.lastActivity || null,
          source: entry.source || null,
          backend: entry.backend || null,
          reason: entry.reason || null,
          description: meta.description || '',
          bugRefs: meta.bugRefs || [],
        });
      }

      res.json({
        total: controllers.length,
        active: controllers.filter(c => c.status === 'active').length,
        idle: controllers.filter(c => c.status === 'idle').length,
        degraded: controllers.filter(c => c.status === 'degraded').length,
        broken: controllers.filter(c => c.status === 'broken').length,
        controllers,
      });
    } catch (err) {
      res.status(500).json({ error: err.message, controllers: [] });
    }
  });

  // v5 routes (cycle, services, degradation, sona, reasoningbank, patterns, trajectories, intel, events).
  registerV5Routes(app);

  // Real trajectory/session/rewards/activity endpoints (read-only consumers of
  // already-persisted data). Registered BEFORE legacy-shims so the real routes
  // win for /api/trajectories, /api/rewards, /api/session etc.
  registerTrajectoryRoutes(app);

  // Shims for the legacy v4 dashboard — return valid empty JSON instead of 404s
  // so dashboard.js doesn't spam console with `.json()` parse errors.
  registerLegacyShims(app);
}
