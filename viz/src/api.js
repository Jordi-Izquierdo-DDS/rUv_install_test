import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, openSync, readSync, closeSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
import {
  openDb, withDb, countRows, readJson, fileStat, readGraphState,
  tableSchema, tablePreview, listTables, globFiles,
  getDataRoot, resolvePath, getRecentActivity, getLatestModelRecommendation, findLatestJsonl, findAllLatestJsonls, findLearningActivity,
  parseHooksFromSettings, parseMcpServers, scanAdditionalStores,
  readJsonSafe, isPidAlive,
} from './helpers.js';
const LAYOUT_FILE = resolve(__dirname, 'config', 'viz-layout.json');
const THEME_FILE = resolve(__dirname, 'config', 'viz-theme.json');
import { CONTROLLER_META } from './controller-registry.js';
import { getAllControllerStatus, getCachedStatusMap, getBackendStatus, getUtilStatus, getDaemonStatus, initControllerStatus } from './controller-status.js';
import { classifyAll, invalidateClassifierCache } from './symbol-classifier.js';
import { registerV5Routes } from './routes/v5.js';
import { registerGraphRoutes } from './routes/graph.js';
import { registerWorkerRoutes } from './routes/workers.js';

import { homedir } from 'os';
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

  // ── New diagnostic endpoints (classifier + status composite) ──

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

  // ─── 4d-i. GET /api/inspect/hm-tiers — HierarchicalMemory tier distribution ──

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

  // ─── 5. GET /api/intelligence — Graph-state + ranked-context ─

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

  // ─── 8. GET /api/brain/status — Brain connectivity ──────────

  // Brain status — checks local .ruvector/ AND external brain source
  // Real brain source is at /mnt/data/dev/ruvector_brain_src (Rust crate)
  // Ruflo memory (.swarm/memory.db) serves as the live semantic brain

  app.get('/api/brain/status', async (req, res) => {
    try {
      // Check upstream pi.ruv.io connectivity
      let upstream = { reachable: false, url: 'https://pi.ruv.io' };
      try {
        const piKey = process.env.PI_BRAIN_API_KEY || null;
        if (!piKey) throw new Error('PI_BRAIN_API_KEY not set');
        const ping = await fetch('https://pi.ruv.io/v1/memories/search?q=ping', {
          headers: { 'Authorization': `Bearer ${piKey}` },
          signal: AbortSignal.timeout(5000),
        });
        upstream.reachable = ping.ok;
        if (ping.ok) { const d = await ping.json(); upstream.sampleCount = Array.isArray(d) ? d.length : 0; }
      } catch {}

      // Local Ruflo memory
      const db = openDb('.swarm/memory.db');
      let memoryEntries = 0, vectorIndexes = [];
      if (db) {
        try { memoryEntries = countRows(db, 'memory_entries'); } catch {}
        try { vectorIndexes = db.prepare('SELECT id, name, dimensions, metric, total_vectors FROM vector_indexes').all(); } catch {}
        db.close();
      }

      // HNSW index status
      const hnswStat = fileStat('.swarm/memory.hnsw');
      const hnswMeta = readJson('.swarm/memory.hnsw.mappings.json');

      res.json({
        configured: upstream.reachable || memoryEntries > 0,
        brain: { url: upstream.url, hasKey: true },
        upstream,
        rufloMemory: {
          entries: memoryEntries,
          vectorIndexes,
          hnswIndex: { exists: hnswStat.exists, size: hnswStat.size, metadata: hnswMeta },
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── 9. POST /api/brain/search — Brain search query ─────────

  // Brain search — queries upstream pi.ruv.io collective brain API
  // Falls back to local sources if upstream is unreachable

  const PI_BRAIN_URL = 'https://pi.ruv.io';
  const PI_BRAIN_KEY = process.env.PI_BRAIN_API_KEY || null;

  app.post('/api/brain/search', async (req, res) => {
    try {
      const { query, sources } = req.body;
      if (!query) return res.status(400).json({ error: 'query required' });

      const allSources = ['pi-brain', 'ruflo-memory', 'auto-memory'];
      const activeSources = Array.isArray(sources) && sources.length
        ? sources.filter(s => allSources.includes(s))
        : ['pi-brain']; // default: upstream only

      const results = [];

      // 1. Search upstream pi.ruv.io collective brain (primary source)
      if (activeSources.includes('pi-brain')) try {
        if (!PI_BRAIN_KEY) throw new Error('PI_BRAIN_API_KEY not set');
        const upstreamRes = await fetch(
          `${PI_BRAIN_URL}/v1/memories/search?q=${encodeURIComponent(query)}`,
          { headers: { 'Authorization': `Bearer ${PI_BRAIN_KEY}` }, signal: AbortSignal.timeout(8000) }
        );
        if (upstreamRes.ok) {
          const upstream = await upstreamRes.json();
          if (Array.isArray(upstream)) {
            for (const m of upstream) {
              results.push({
                source: 'pi-brain', id: m.id, title: m.title,
                content: m.content, tags: m.tags, category: m.category,
                score: m.score ?? m.quality_score?.alpha / (m.quality_score?.alpha + m.quality_score?.beta) ?? 0.5,
              });
            }
          }
        }
      } catch {}

      // 2. Local — search memory_entries in .swarm/memory.db
      const q = query.toLowerCase();
      const db = activeSources.includes('ruflo-memory') ? openDb('.swarm/memory.db') : null;
      if (db) {
        try {
          const rows = db.prepare(
            "SELECT key, namespace, content, type FROM memory_entries ORDER BY updated_at DESC"
          ).all();
          for (const r of rows) {
            if ((r.content || '').toLowerCase().includes(q) || (r.key || '').toLowerCase().includes(q)) {
              results.push({ source: 'ruflo-memory', id: r.key, content: r.content, namespace: r.namespace, type: r.type, score: 0.6 });
            }
          }
        } catch {}
        db.close();
      }

      // 3. Local — auto-memory-store
      const autoMem = activeSources.includes('auto-memory') ? readJson('.claude-flow/data/auto-memory-store.json') : null;
      if (Array.isArray(autoMem)) {
        for (const entry of autoMem) {
          const text = (entry.content || entry.summary || entry.key || '').toLowerCase();
          if (text.includes(q)) {
            results.push({
              source: 'auto-memory', id: entry.key || entry.id,
              content: entry.summary || entry.content?.slice(0, 200),
              namespace: entry.namespace, type: entry.type, score: 0.4,
            });
          }
        }
      }

      res.json({ results: results.slice(0, 50), query, count: results.length, sources: activeSources });
    } catch (err) {
      res.json({ results: [], query: req.body.query, error: err.message?.substring(0, 200) });
    }
  });

  // ─── 10. GET /api/layout — Load saved node positions ────────

  app.get('/api/layout', (req, res) => {
    try {
      if (existsSync(LAYOUT_FILE)) {
        const data = JSON.parse(readFileSync(LAYOUT_FILE, 'utf8'));
        res.json(data);
      } else {
        res.json({ positions: {} });
      }
    } catch {
      res.json({ positions: {} });
    }
  });

  // ─── 11. POST /api/layout — Save node positions ───────────

  app.post('/api/layout', (req, res) => {
    try {
      const { positions, detached, transform } = req.body;
      if (!positions || typeof positions !== 'object') {
        return res.status(400).json({ error: 'positions object required' });
      }
      const payload = { positions };
      if (Array.isArray(detached)) payload.detached = detached;
      if (transform && typeof transform === 'object') payload.transform = transform;
      writeFileSync(LAYOUT_FILE, JSON.stringify(payload, null, 2));
      res.json({ ok: true, count: Object.keys(positions).length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── 11b. GET /api/theme — Load saved color palette ─────────

  app.get('/api/theme', (req, res) => {
    try {
      if (existsSync(THEME_FILE)) {
        res.json(JSON.parse(readFileSync(THEME_FILE, 'utf8')));
      } else {
        res.json({});
      }
    } catch {
      res.json({});
    }
  });

  // ─── 11c. POST /api/theme — Save color palette ────────────

  app.post('/api/theme', (req, res) => {
    try {
      const theme = req.body;
      if (!theme || typeof theme !== 'object') {
        return res.status(400).json({ error: 'theme object required' });
      }
      writeFileSync(THEME_FILE, JSON.stringify(theme, null, 2));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── 12. GET /api/activity — Claude log tail/parse ──────────

  app.get('/api/activity', (req, res) => {
    try {
      const mode = req.query.mode || 'realtime';
      const limit = parseInt(req.query.limit) || 100;

      // Find Claude JSONL files
      const claudeDir = resolve(homedir(), '.claude', 'projects');
      if (!existsSync(claudeDir)) return res.json({ events: [], mode });

      let slugDirs;
      try {
        slugDirs = readdirSync(claudeDir).filter(d => {
          try { return statSync(join(claudeDir, d)).isDirectory(); } catch { return false; }
        });
      } catch { return res.json({ events: [], mode }); }

      // Find latest JSONL
      let latestFile = null, latestMtime = 0;
      for (const dir of slugDirs) {
        try {
          const jsonls = readdirSync(join(claudeDir, dir)).filter(f => f.endsWith('.jsonl'));
          for (const f of jsonls) {
            const fp = join(claudeDir, dir, f);
            const mt = statSync(fp).mtimeMs;
            if (mt > latestMtime) { latestMtime = mt; latestFile = fp; }
          }
        } catch {}
      }

      // Parse Claude transcript events
      const transcriptEvents = [];
      if (latestFile) {
        const content = readFileSync(latestFile, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);
        const parseLines = mode === 'realtime' ? lines.slice(-limit) : lines;
        for (const line of parseLines) {
          try { transcriptEvents.push(JSON.parse(line)); } catch {}
        }
      }

      // Merge learning-activity.jsonl events (P2.3)
      const learningFile = findLearningActivity();
      const learningEvents = [];
      if (learningFile) {
        try {
          const lContent = readFileSync(learningFile.path, 'utf8');
          const lLines = lContent.trim().split('\n').filter(Boolean);
          const lParseLines = lLines.slice(-limit);
          for (const line of lParseLines) {
            try {
              const evt = JSON.parse(line);
              // Normalize: ensure a timestamp field exists for sorting
              if (!evt.timestamp && evt.ts) evt.timestamp = evt.ts;
              evt._source = 'learning';
              learningEvents.push(evt);
            } catch {}
          }
        } catch {}
      }

      // Merge and sort by timestamp descending (newest first)
      let events;
      if (learningEvents.length > 0) {
        // Tag transcript events with source for client disambiguation
        for (const e of transcriptEvents) { if (!e._source) e._source = 'transcript'; }
        const merged = [...transcriptEvents, ...learningEvents];
        // Sort descending by timestamp (ts or timestamp field)
        merged.sort((a, b) => {
          const tsA = a.timestamp || a.ts || '';
          const tsB = b.timestamp || b.ts || '';
          return tsA > tsB ? -1 : tsA < tsB ? 1 : 0;
        });
        events = merged.slice(0, limit);
      } else {
        events = transcriptEvents;
      }

      res.json({ events, mode, file: latestFile, totalLines: events.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── 14. GET /api/activity-stream — Incremental JSONL for edge pulses ──
  // ?scope=all reads from all project dirs; default reads only this project

  function readJsonlChunk(filePath, offset, isTail) {
    const MAX = 262144;
    const size = statSync(filePath).size;
    const start = isTail ? Math.max(0, size - MAX) : Math.max(0, offset);
    if (start >= size) return { offset: size, lines: [] };

    const fd = openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(Math.min(MAX, size - start));
      const n = readSync(fd, buf, 0, buf.length, start);
      closeSync(fd);
      if (n === 0) return { offset: size, lines: [] };

      const raw = buf.toString('utf8', 0, n);
      const first = (isTail && start > 0) ? raw.indexOf('\n') + 1 : 0;
      const last = raw.lastIndexOf('\n');
      if (last <= first) return { offset: start + n, lines: [] };

      const chunk = raw.substring(first, last);
      // No content filter — send all lines, let the client decide what's actionable.
      // The chunk is already bounded by MAX (256KB) and offset tracking,
      // so bandwidth is naturally limited.
      const lines = chunk.split('\n').filter(Boolean);
      return { offset: start + last + 1, lines };
    } catch {
      try { closeSync(fd); } catch {}
      return { offset: statSync(filePath).size, lines: [] };
    }
  }

  app.get('/api/activity-stream', (req, res) => {
    try {
      const scope = req.query.scope || 'project';
      const tail = req.query.tail === '1';

      if (scope === 'all') {
        // Read from all recent project JSONLs (tail mode only for all-scope)
        const allJsonls = findAllLatestJsonls();
        // Only include projects active in the last hour
        const cutoff = Date.now() - 3600000;
        const recent = allJsonls.filter(j => j.mtimeMs > cutoff).slice(0, 10);
        const allLines = [];
        for (const j of recent) {
          const { lines } = readJsonlChunk(j.path, 0, true);
          allLines.push(...lines);
        }

        // P2.3: Also merge learning-activity.jsonl into all-scope
        const learningFile = findLearningActivity();
        if (learningFile) {
          try {
            const { lines: lLines } = readJsonlChunk(learningFile.path, 0, true);
            allLines.push(...lLines);
          } catch {}
        }

        return res.json({ offset: 0, lines: allLines, scope: 'all', projects: recent.map(j => j.project) });
      }

      // Default: project-specific with offset tracking
      const jsonl = findLatestJsonl();
      if (!jsonl) return res.json({ offset: 0, lines: [], scope: 'project' });

      // skip=1: return current EOF offset without reading lines (for initial sync)
      if (req.query.skip === '1') {
        const size = statSync(jsonl.path).size;
        // P2.3: Also report learning file offset for skip sync
        let learningOffset = 0;
        const learningFile = findLearningActivity();
        if (learningFile) {
          try { learningOffset = statSync(learningFile.path).size; } catch {}
        }
        return res.json({ offset: size, learningOffset, lines: [], scope: 'project', skipped: true });
      }

      const offset = tail ? 0 : Math.max(0, parseInt(req.query.offset) || 0);
      const result = readJsonlChunk(jsonl.path, offset, tail);
      result.scope = 'project';

      // P2.3: Merge lines from learning-activity.jsonl sidecar
      const learningFile = findLearningActivity();
      if (learningFile) {
        try {
          const lOffset = tail ? 0 : Math.max(0, parseInt(req.query.learningOffset) || 0);
          const lResult = readJsonlChunk(learningFile.path, lOffset, tail);
          if (lResult.lines.length > 0) {
            result.lines.push(...lResult.lines);
            // Sort merged lines by timestamp descending so newest events come first
            result.lines.sort((a, b) => {
              // Lines are raw strings — parse ts for comparison
              try {
                const objA = JSON.parse(a);
                const objB = JSON.parse(b);
                const tsA = objA.timestamp || objA.ts || '';
                const tsB = objB.timestamp || objB.ts || '';
                return tsA > tsB ? -1 : tsA < tsB ? 1 : 0;
              } catch { return 0; }
            });
          }
          result.learningOffset = lResult.offset;
        } catch {
          result.learningOffset = 0;
        }
      } else {
        result.learningOffset = 0;
      }

      res.json(result);
    } catch (err) {
      res.json({ offset: 0, learningOffset: 0, lines: [], error: err.message });
    }
  });

  // ─── 15. GET /api/projects — List known projects ──────────

  app.get('/api/projects', (req, res) => {
    try {
      const all = findAllLatestJsonls();
      const dataRoot = getDataRoot();
      const currentMangled = dataRoot.replace(/[^a-zA-Z0-9]/g, '-');
      res.json({
        current: currentMangled,
        projects: all.map(j => ({
          name: j.project,
          lastActivity: new Date(j.mtimeMs).toISOString(),
          isCurrent: j.project === currentMangled,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // GAP-FIX ENDPOINTS — Added to cover self-learning blind spots
  // ═══════════════════════════════════════════════════════════════

  // ─── 16. GET /api/ruflo-intelligence — Pattern store + confidence ─

  // Reads from REAL sources:
  //   .claude-flow/data/intelligence-snapshot.json — learning progress snapshots
  //   .claude-flow/data/graph-state.json           — PageRank intelligence graph
  //   .swarm/memory.db → patterns + memory_entries — ReasoningBank patterns
  //   hooks_intelligence_stats MCP — live brain intelligence (replaces external intelligence.json)

  app.get('/api/ruflo-intelligence', async (req, res) => {
    try {
      // Intelligence graph (REAL — PageRank nodes + confidence)
      const gs = readGraphState();
      const allNodes = gs?.nodes ? Object.values(gs.nodes) : [];
      const confidenceBuckets = { high: 0, medium: 0, low: 0, unknown: 0 };
      for (const n of allNodes) {
        const c = n.confidence ?? -1;
        if (c >= 0.7) confidenceBuckets.high++;
        else if (c >= 0.4) confidenceBuckets.medium++;
        else if (c >= 0) confidenceBuckets.low++;
        else confidenceBuckets.unknown++;
      }

      // Patterns from REAL DB (.swarm/memory.db)
      const db = openDb('.swarm/memory.db');
      let patternStats = { reasoningBank: 0, semantic: 0, trajectories: 0 };
      if (db) {
        try { patternStats.reasoningBank = countRows(db, 'patterns'); } catch {}
        try { patternStats.semantic = countRows(db, 'memory_entries'); } catch {}
        try { patternStats.trajectories = countRows(db, 'trajectories'); } catch {}
        db.close();
      }

      // Intelligence snapshots (REAL — learning progress over time)
      const snapshots = readJson('.claude-flow/data/intelligence-snapshot.json');
      const latest = Array.isArray(snapshots) && snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

      // External brain intelligence via MCP (replaces .ruvector/intelligence.json file read)
      let brainPatterns = 0;
      let brainIntel = null;
      try {
        brainIntel = await vizMcpCall('hooks_intelligence_stats', { detailed: true });
        brainPatterns = brainIntel?.sona?.patternsLearned || 0;
      } catch {}

      res.json({
        patternStats,
        confidenceDistribution: confidenceBuckets,
        graphNodeCount: allNodes.length,
        snapshot: latest ? {
          nodes: latest.nodes, edges: latest.edges,
          pageRankSum: latest.pageRankSum,
          topPatterns: (latest.topPatterns || []).slice(0, 10),
          timestamp: latest.timestamp ? new Date(latest.timestamp).toISOString() : null,
        } : null,
        snapshotCount: Array.isArray(snapshots) ? snapshots.length : 0,
        brainIntel: brainPatterns > 0 ? {
          patternCount: brainPatterns,
          trajectoryCount: brainIntel?.sona?.trajectoriesTotal || 0,
          source: 'hooks_intelligence_stats (MCP)',
        } : null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── 17. GET /api/agentdb — AgentDB memory tables + HNSW ─────

  // AgentDB — reads from REAL .swarm/memory.db (the actual ReasoningBank store)
  // Also reads .claude/memory.db (Claude's local memory) for cross-reference

  app.get('/api/auto-memory', (req, res) => {
    try {
      const data = readJson('.claude-flow/data/auto-memory-store.json');
      const stat = fileStat('.claude-flow/data/auto-memory-store.json');
      let entries = [], entryCount = 0;
      if (data) {
        if (Array.isArray(data)) { entries = data; entryCount = data.length; }
        else if (data.entries) {
          entries = Array.isArray(data.entries) ? data.entries : Object.values(data.entries);
          entryCount = entries.length;
        } else {
          entries = Object.entries(data).map(([k, v]) => ({ key: k, value: v }));
          entryCount = entries.length;
        }
      }
      res.json({
        exists: data !== null, entryCount,
        entries: entries.slice(-100),
        fileSize: stat.size, lastModified: stat.mtime,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── 21. GET /api/insights-queue — Pending insights pipeline ──

  app.get('/api/mcp-health', (req, res) => {
    try {
      const activity = getRecentActivity();

      // 1. Check .mcp.json stdio servers (may be empty)
      const mcp = readJson('.mcp.json');
      const stdioServers = [];
      if (mcp?.mcpServers) {
        for (const [name, cfg] of Object.entries(mcp.mcpServers)) {
          const cmd = cfg.command || '';
          let binaryExists = (cmd === 'npx' || cmd === 'node' || cmd === 'bun');
          if (!binaryExists && cmd) {
            try { execSync(`which ${cmd} 2>/dev/null`, { timeout: 2000, encoding: 'utf8' }); binaryExists = true; } catch {}
          }
          const recentlyUsed = activity.mcpCalls.has(name);
          let toolCount = 0;
          for (const toolName of activity.toolUses) {
            if (toolName.startsWith(`mcp__${name.replace(/-/g, '_')}`)) toolCount++;
          }
          stdioServers.push({
            name, command: cmd, args: (cfg.args || []).slice(0, 3),
            binaryExists, recentlyUsed, toolsUsed: toolCount, type: 'stdio',
            status: recentlyUsed ? 'active' : binaryExists ? 'configured' : 'broken',
          });
        }
      }

      // 2. Detect Ruflo framework MCP tools from JSONL evidence
      const rufloTools = new Map();
      for (const toolName of activity.toolUses) {
        if (toolName.startsWith('mcp__ruflo__')) {
          const prefix = toolName.split('__').slice(0, 3).join('__');
          rufloTools.set(prefix, (rufloTools.get(prefix) || 0) + 1);
        }
      }
      const rufloServers = [...rufloTools.entries()].map(([prefix, count]) => ({
        name: prefix.replace('mcp__ruflo__', 'ruflo/'),
        toolsUsed: count, type: 'framework', status: 'active',
        recentlyUsed: true, binaryExists: true,
      }));

      // 3. CLI daemon status
      const daemonState = readJson('.claude-flow/daemon-state.json');
      const cliAvailable = existsSync(resolve(getDataRoot(), 'node_modules/@claude-flow/cli'));

      const allServers = [...stdioServers, ...rufloServers];

      res.json({
        servers: allServers,
        count: allServers.length,
        active: allServers.filter(s => s.status === 'active').length,
        configured: allServers.filter(s => s.status === 'configured').length,
        broken: allServers.filter(s => s.status === 'broken').length,
        cliDaemon: {
          installed: cliAvailable,
          running: daemonState?.running || false,
          workers: daemonState?.workers ? Object.keys(daemonState.workers).length : 0,
        },
        note: stdioServers.length === 0 ? 'No stdio MCP servers in .mcp.json — MCP tools provided by Ruflo framework' : null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── 23. GET /api/worker-logs — CLI daemon worker log history ─

  app.get('/api/worker-logs', (req, res) => {
    try {
      const logDir = '.claude-flow/logs/headless';
      const logDirStat = fileStat(logDir);
      if (!logDirStat.exists) return res.json({ logs: [], count: 0, summary: 'No headless log directory' });
      const logFiles = globFiles(logDir, '*.log');
      const logs = logFiles.map(f => {
        const s = fileStat(f);
        const basename = f.split('/').pop();
        let preview = '';
        if (s.exists && s.size > 0) {
          try { preview = readFileSync(resolvePath(f), 'utf8').slice(-500); } catch {}
        }
        const workerType = basename.replace(/-\d{4}.*$/, '').replace(/\.log$/, '');
        return {
          file: basename, path: f, workerType, size: s.size,
          sizeHuman: s.size ? (s.size / 1024).toFixed(1) + ' KB' : '0',
          lastModified: s.mtime, preview,
        };
      }).sort((a, b) => {
        if (!a.lastModified || !b.lastModified) return 0;
        return new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime();
      });
      const daemonState = readJson('.claude-flow/daemon-state.json');
      res.json({
        logs: logs.slice(0, 50), count: logs.length,
        daemonState: daemonState ? {
          running: daemonState.running || false,
          workers: daemonState.workers || [],
          lastRun: daemonState.lastRun, pid: daemonState.pid,
        } : null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── P3.1: Data Store Endpoints ────────────────────────────────
  // Serve data from stores that have no visualization path yet.
  // ADR-TF02-VIZ upgrade — 8 endpoints for raw store access.

  // ─── P3.1-1. GET /api/ewc-status — EWC Fisher state + pattern count ─

  app.get('/api/embeddings-config', (req, res) => {
    try {
      const config = readJsonSafe('.claude-flow/embeddings.json', null);
      if (!config) {
        return res.json({ model: null, dimensions: null, provider: null });
      }
      res.json({
        model: config.model || null,
        dimensions: config.dimensions || null,
        provider: config.provider || null,
        ...config,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── P3.1-3. GET /api/swarm-state — Swarm state snapshot ─────

  app.get('/api/swarm-state', (req, res) => {
    try {
      const state = readJson('.swarm/state.json');
      if (!state) return res.json({ state: null });
      res.json(state);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── P3.1-5. GET /api/metrics/:name — Named metrics files ────

  const METRICS_WHITELIST = new Set(['performance', 'learning', 'v3-progress', 'codebase-map', 'consolidation', 'security-audit', 'swarm-activity', 'test-gaps']);

  app.get('/api/metrics/:name', (req, res) => {
    try {
      const name = req.params.name;

      // Validate against whitelist — prevents path traversal and arbitrary reads
      if (!METRICS_WHITELIST.has(name)) {
        return res.status(404).json({
          error: `Unknown metric '${name}'. Valid names: ${[...METRICS_WHITELIST].join(', ')}`,
        });
      }

      const data = readJson(`.claude-flow/metrics/${name}.json`);
      if (!data) {
        return res.status(404).json({ error: `Metric '${name}' not found` });
      }

      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── P3.1-6. GET /api/session-metadata — Current session info ─

  app.get('/api/session-metadata', (req, res) => {
    try {
      const session = readJson('.claude-flow/sessions/current.json');
      if (!session) {
        return res.json({
          sessionId: null, startTime: null, cwd: null,
          hookCount: 0, editCount: 0,
        });
      }

      res.json({
        sessionId: session.id || session.sessionId || null,
        startTime: session.startedAt || session.startTime || null,
        cwd: session.cwd || null,
        hookCount: session.hookCount ?? session.hooks ?? 0,
        editCount: session.editCount ?? session.edits ?? 0,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── P3.1-7. GET /api/security-audit — Security audit status ──

  app.get('/api/security-audit', (req, res) => {
    try {
      const audit = readJson('.claude-flow/security/audit-status.json');
      if (!audit) {
        return res.json({
          lastScan: null, cveCount: 0, severities: {},
          status: 'no-data',
        });
      }

      res.json({
        lastScan: audit.lastScan || audit.timestamp || null,
        cveCount: audit.cveCount ?? audit.vulnerabilities ?? 0,
        severities: audit.severities || {},
        ...audit,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── P3.1-8. GET /api/neural-stats — Neural network statistics ─

  app.get('/api/neural-stats', (req, res) => {
    try {
      const stats = readJsonSafe('.claude-flow/neural/stats.json', null);
      const patterns = readJsonSafe('.claude-flow/neural/patterns.json', null);

      const patternCount = patterns
        ? (Array.isArray(patterns) ? patterns.length
          : (patterns.patterns ? (Array.isArray(patterns.patterns) ? patterns.patterns.length : Object.keys(patterns.patterns).length)
          : Object.keys(patterns).length))
        : 0;

      const spread = { ...(stats || {}) };
      // Clarify: trajectoriesRecorded is from the pretrain counter, not real SONA trajectories
      if (spread.trajectoriesRecorded != null) {
        spread.patternsProcessedPretrain = spread.trajectoriesRecorded;
        delete spread.trajectoriesRecorded;
      }

      res.json({
        patternCount,
        trainingStats: stats?.training || stats?.trainingStats || null,
        modelInfo: stats?.model || stats?.modelInfo || null,
        ...spread,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── POST /api/mcp/:server/:tool — Execute MCP tool via CLI ─────
  //
  // Supported servers: ruvector, claude-flow
  // Tool names map to CLI subcommands, e.g.:
  //   ruvector hooks_stats  → npx ruvector hooks stats
  //   claude-flow memory_store → npx @claude-flow/cli memory store
  //
  // Body: { args?: Record<string,string> } — optional key/value args passed as --key value

  // ─── MCP JSON-RPC Client ─────────────────────────────────────
  // Spawns MCP servers via stdio and sends tools/call requests
  // using the real MCP protocol — no CLI shelling.

  // Read MCP server configs from .mcp.json
  const mcpConfigRaw = readJson('.mcp.json') || { mcpServers: {} };
  const MCP_SERVER_CONFIGS = mcpConfigRaw.mcpServers || {};

  // Cache running MCP server processes (reuse across requests)
  const mcpProcesses = new Map();  // server → { proc, pending, buffer, ready }

  function getMcpProcess(serverName) {
    if (mcpProcesses.has(serverName)) {
      const cached = mcpProcesses.get(serverName);
      if (!cached.proc.killed) return Promise.resolve(cached);
      mcpProcesses.delete(serverName);
    }

    const cfg = MCP_SERVER_CONFIGS[serverName];
    if (!cfg) return Promise.reject(new Error(`No MCP config for: ${serverName}`));

    return new Promise((resolve, reject) => {
      const cleanEnv = { ...process.env, ...(cfg.env || {}) };
      delete cleanEnv.CLAUDECODE;

      const proc = spawn(cfg.command, cfg.args || [], {
        cwd: getDataRoot(),
        env: cleanEnv,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const state = { proc, pending: new Map(), buffer: '', ready: false, reqId: 1 };

      proc.stdout.on('data', (chunk) => {
        state.buffer += chunk.toString();
        // MCP uses newline-delimited JSON-RPC
        let nl;
        while ((nl = state.buffer.indexOf('\n')) !== -1) {
          const line = state.buffer.slice(0, nl).trim();
          state.buffer = state.buffer.slice(nl + 1);
          if (!line) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.id != null && state.pending.has(msg.id)) {
              const { resolve: res } = state.pending.get(msg.id);
              state.pending.delete(msg.id);
              res(msg);
            }
          } catch { /* skip non-JSON lines */ }
        }
      });

      proc.on('error', (err) => {
        if (!state.ready) reject(err);
      });
      proc.on('exit', () => {
        mcpProcesses.delete(serverName);
        // Reject all pending
        for (const [, { reject: rej }] of state.pending) rej(new Error('MCP process exited'));
        state.pending.clear();
      });

      // Send initialize handshake
      const initId = state.reqId++;
      const initMsg = JSON.stringify({
        jsonrpc: '2.0', id: initId, method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'turboflow-viz', version: '4.0.5' },
        },
      }) + '\n';
      proc.stdin.write(initMsg);

      state.pending.set(initId, {
        resolve: (msg) => {
          // Send initialized notification
          proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
          state.ready = true;
          mcpProcesses.set(serverName, state);
          resolve(state);
        },
        reject,
      });

      // Timeout init after 15s
      setTimeout(() => {
        if (!state.ready) {
          proc.kill();
          reject(new Error('MCP server init timeout'));
        }
      }, 15000);
    });
  }

  function mcpCall(state, method, params) {
    return new Promise((resolve, reject) => {
      const id = state.reqId++;
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      state.pending.set(id, { resolve, reject });
      state.proc.stdin.write(msg);
      setTimeout(() => {
        if (state.pending.has(id)) {
          state.pending.delete(id);
          reject(new Error('MCP call timeout (30s)'));
        }
      }, 30000);
    });
  }

  // Read-only tool whitelist — only these tools can be called via the generic proxy
  const MCP_SAFE_TOOLS = new Set([
    'system_health', 'system_info', 'system_status', 'system_metrics',
    'agentdb_health', 'agentdb_controllers',
    'hooks_intelligence', 'hooks_intelligence_stats', 'hooks_stats',
    'hooks_model-stats', 'hooks_learning_stats', 'hooks_learning_config',
    'hooks_route', 'hooks_route_enhanced',
    'hooks_recall', 'hooks_suggest_context', 'hooks_rag_context',
    'hooks_diff_analyze', 'hooks_diff_classify', 'hooks_diff_similar',
    'hooks_ast_analyze', 'hooks_ast_complexity',
    'hooks_gnn_info', 'hooks_attention_info',
    'hooks_graph_cluster', 'hooks_graph_mincut',
    'hooks_compress_stats', 'hooks_compress_get',
    'hooks_coverage_route', 'hooks_coverage_suggest',
    'hooks_error_suggest', 'hooks_coedit_suggest',
    'hooks_git_churn', 'hooks_algorithms_list',
    'hooks_watch_status', 'hooks_doctor', 'hooks_verify',
    'hooks_capabilities', 'hooks_export',
    'hooks_swarm_recommend',
    'embeddings_status', 'embeddings_compare',
    'memory_list', 'memory_search', 'memory_stats', 'memory_retrieve',
    'agentdb_pattern-search', 'agentdb_hierarchical-recall',
    'agentdb_context-synthesize', 'agentdb_feedback',
    'neural_status', 'neural_patterns',
    'brain_search', 'brain_list', 'brain_status', 'brain_get',
    'rvf_status', 'rvf_query', 'rvf_segments',
    'rvlite_sql', 'rvlite_sparql', 'rvlite_cypher',
    'decompile_search',
  ]);

  app.post('/api/mcp/:server/:tool', async (req, res) => {
    const { server, tool } = req.params;
    const args = req.body?.args || {};

    if (!MCP_SERVER_CONFIGS[server]) {
      return res.status(400).json({ error: `Unknown MCP server: ${server}. Available: ${Object.keys(MCP_SERVER_CONFIGS).join(', ')}` });
    }

    if (!MCP_SAFE_TOOLS.has(tool)) {
      return res.status(403).json({ error: `Tool '${tool}' not in read-only whitelist. Use action buttons for mutations.` });
    }

    try {
      const state = await getMcpProcess(server);
      const response = await mcpCall(state, 'tools/call', { name: tool, arguments: args });

      if (response.error) {
        return res.status(500).json({ ok: false, server, tool, error: response.error.message || JSON.stringify(response.error) });
      }

      // Extract text content from MCP response
      const result = response.result;
      let output = '';
      if (result?.content) {
        output = result.content.map(c => c.text || JSON.stringify(c)).join('\n');
      } else {
        output = JSON.stringify(result, null, 2);
      }

      res.json({ ok: true, server, tool, output });
    } catch (err) {
      res.status(500).json({ ok: false, server, tool, error: err.message });
    }
  });

  // ─── GET /api/rewards — Captured (SQL) + Learned (neural JSON) reward data ──

  app.get('/api/routing-stats', async (req, res) => {
    try {
      const { getModelRouter } = await import(
        'file://' + join(process.cwd(), 'node_modules/@claude-flow/cli/dist/src/ruvector/model-router.js')
      );
      const router = getModelRouter();
      if (!router) return res.json({ available: false });
      const stats = router.getStats();
      const rec = getLatestModelRecommendation();
      res.json({ available: true, ...stats, latestRecommendation: rec || null });
    } catch (err) {
      res.json({ available: false, error: err.message });
    }
  });

  // ─── GET /api/system/fallback-status — Per-component graceful degradation ──
  //   Reuses: ONNX fallback chain (helpers.js:1020-1073), controller registry,
  //   detectBackends(). Returns L1-L4 fallback levels for each component.

  app.get('/api/system/fallback-status', async (req, res) => {
    try {
      const HOME = process.env.HOME || '/root';

      // ── Embedding fallback chain (reuse ONNX probe logic) ──
      const embeddingChain = [
        { level: 1, label: 'Native @ruvector/core ONNX 384D', method: 'native-onnx',
          check: () => { try { require.resolve('@ruvector/core'); return true; } catch { return false; } } },
        { level: 2, label: 'Project-local quantized ONNX', method: 'local-onnx',
          check: () => existsSync(resolve(getDataRoot(), 'node_modules/@xenova/transformers/.cache/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx')) },
        { level: 3, label: 'Global quantized (~/.ruvector)', method: 'global-onnx',
          check: () => existsSync(resolve(HOME, '.ruvector/models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx')) },
        { level: 4, label: 'Hash-based 256D fallback', method: 'hash-fallback', check: () => true },
      ];

      // ── Vector search fallback chain ──
      // L1: native redb HNSW lives inside ruvector.db, held by ruvector MCP server
      const vectorSearchChain = [
        { level: 1, label: 'Native HNSW (redb)', method: 'native-hnsw',
          check: () => {
            const redbPath = resolvePath('ruvector.db');
            if (!existsSync(redbPath)) return false;
            // Confirm native redb is in use — process must hold the lock
            try {
              const lsofOut = execSync(`lsof "${redbPath}" 2>/dev/null`, { timeout: 2000 }).toString();
              return lsofOut.includes('ruvector') || lsofOut.includes('node');
            } catch { return false; }
          } },
        { level: 2, label: 'HNSWLib in-memory (AgentDB)', method: 'hnswlib',
          check: () => {
            // memory.hnsw on disk OR hnswlib-node importable
            if (existsSync(resolvePath('.swarm/memory.hnsw'))) return true;
            try { require.resolve('hnswlib-node'); return true; } catch { return false; }
          } },
        { level: 3, label: 'SQLite FTS5 text search', method: 'fts5',
          check: () => existsSync(resolvePath('.swarm/memory.db')) },
        { level: 4, label: 'String.includes() scan', method: 'string-scan', check: () => true },
      ];

      // ── Routing fallback chain ──
      const routingChain = [
        { level: 1, label: 'Native @ruvector/router (GNN 8-head)', method: 'native-gnn',
          check: () => { try { require.resolve('@ruvector/router'); return true; } catch { return false; } } },
        { level: 2, label: 'AgentDB SemanticRouter (HNSW)', method: 'semantic-hnsw',
          check: () => { const e = getCachedStatusMap().get('semanticRouter'); return !!e && e.status !== 'broken'; } },
        { level: 3, label: 'Keyword router (router.js)', method: 'keyword',
          check: () => existsSync(resolvePath('.claude/helpers/router.js')) },
        { level: 4, label: 'Default route (no routing)', method: 'default', check: () => true },
      ];

      // ── SONA fallback chain ──
      const sonaChain = [
        { level: 1, label: 'Native @ruvector/sona', method: 'native-sona',
          check: () => { try { require.resolve('@ruvector/sona'); return true; } catch { return false; } } },
        { level: 2, label: 'AgentDB SonaTrajectory controller', method: 'agentdb-sona',
          check: () => { const e = getCachedStatusMap().get('sonaTrajectory'); return !!e && e.status !== 'broken'; } },
        { level: 3, label: 'JSON trajectory log', method: 'json-log',
          check: () => existsSync(resolvePath('.claude-flow/data/hook-queue.jsonl')) },
        { level: 4, label: 'No trajectory tracking', method: 'none', check: () => true },
      ];

      // ── GNN fallback chain ──
      const gnnChain = [
        { level: 1, label: 'Native @ruvector/gnn (8 heads)', method: 'native-gnn',
          check: () => { try { require.resolve('@ruvector/gnn'); return true; } catch { return false; } } },
        { level: 2, label: 'AgentDB GNNService', method: 'agentdb-gnn',
          check: () => { const e = getCachedStatusMap().get('gnnService'); return !!e && e.status !== 'broken'; } },
        { level: 3, label: 'PageRank graph (intelligence.cjs)', method: 'pagerank',
          check: () => existsSync(resolvePath('.claude-flow/data/graph-state.json')) },
        { level: 4, label: 'No graph analysis', method: 'none', check: () => true },
      ];

      // ── LoRA fallback chain ──
      const loraChain = [
        { level: 1, label: 'WASM MicroLoRA (@ruvector/learning-wasm)', method: 'wasm-lora',
          check: () => { try { require.resolve('@ruvector/learning-wasm'); return true; } catch { return false; } } },
        { level: 2, label: 'EWC++ consolidation', method: 'ewc',
          check: () => { const ds = readJsonSafe('.claude-flow/data/hooks-daemon-state.json', null); return !!ds?.ewcReady; } },
        { level: 3, label: 'Pattern promotion (L1 learning-service)', method: 'pattern-promote',
          check: () => existsSync(resolvePath('.claude/helpers/learning-service.mjs')) },
        { level: 4, label: 'No adaptation', method: 'none', check: () => true },
      ];

      // ── Attention fallback chain ──
      const attentionChain = [
        { level: 1, label: 'Bridge search (replaces ATT-001)', method: 'bridge-search',
          check: () => existsSync(resolve(getDataRoot(), 'node_modules/@claude-flow/cli/dist/src/memory/memory-bridge.js')) },
        { level: 2, label: 'WASM Attention (@ruvector/learning-wasm)', method: 'wasm-attention',
          deprecated: true, deprecatedNote: 'ATT-001: Redundant with bridge search',
          check: () => { try { require.resolve('@ruvector/learning-wasm'); return true; } catch { return false; } } },
        { level: 3, label: 'Intelligence.cjs context ranking', method: 'intel-rank',
          check: () => existsSync(resolvePath('.claude/helpers/intelligence.cjs')) },
        { level: 4, label: 'No attention weighting', method: 'none', check: () => true },
      ];

      function resolveChain(chain) {
        let activeLevel = 4;
        const levels = chain.map(entry => {
          const available = entry.check();
          if (available && entry.level < activeLevel) activeLevel = entry.level;
          return { level: entry.level, label: entry.label, method: entry.method, available, ...(entry.deprecated ? { deprecated: true, deprecatedNote: entry.deprecatedNote } : {}) };
        });
        return { activeLevel, levels };
      }

      const components = {
        embedding:    resolveChain(embeddingChain),
        vectorSearch: resolveChain(vectorSearchChain),
        routing:      resolveChain(routingChain),
        sona:         resolveChain(sonaChain),
        gnn:          resolveChain(gnnChain),
        lora:         resolveChain(loraChain),
        attention:    resolveChain(attentionChain),
      };

      // Summary: overall system health
      const levels = Object.values(components).map(c => c.activeLevel);
      const worstLevel = Math.max(...levels);
      const bestLevel = Math.min(...levels);
      const avgLevel = levels.reduce((a, b) => a + b, 0) / levels.length;

      res.json({
        components,
        summary: {
          worstLevel,
          bestLevel,
          avgLevel: Math.round(avgLevel * 10) / 10,
          overallStatus: worstLevel <= 1 ? 'optimal' : worstLevel <= 2 ? 'good' : worstLevel <= 3 ? 'degraded' : 'critical',
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

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

  // Clean up MCP processes on exit
  process.on('exit', () => {
    for (const [, state] of mcpProcesses) {
      try { state.proc.kill(); } catch {}
    }
  });
}
