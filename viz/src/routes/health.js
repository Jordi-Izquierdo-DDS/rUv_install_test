// Health / diagnostic route module — extracted from api.js (2026-04-18).
//
// Routes:
//   GET /api/mcp-health             — .mcp.json stdio servers + Ruflo framework MCP + CLI daemon
//   GET /api/worker-logs            — CLI daemon worker log history
//   GET /api/embeddings-config      — .claude-flow/embeddings.json
//   GET /api/swarm-state            — .swarm/state.json snapshot
//   GET /api/metrics/:name          — whitelisted metrics from .claude-flow/metrics/
//   GET /api/session-metadata       — .claude-flow/sessions/current.json
//   GET /api/security-audit         — .claude-flow/security/audit-status.json
//   GET /api/neural-stats           — .claude-flow/neural/stats.json + patterns.json
//   GET /api/routing-stats          — model-router live stats + last recommendation
//   GET /api/system/fallback-status — per-component graceful degradation chain (L1-L4)
//
// Pure move — no business logic change.

import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';

import {
  readJson, fileStat, globFiles,
  getDataRoot, resolvePath, getRecentActivity, getLatestModelRecommendation,
  readJsonSafe,
} from '../helpers.js';
import { getCachedStatusMap } from '../controller-status.js';

const require = createRequire(import.meta.url);

// ─── GET /api/mcp-health — MCP servers + framework detection + CLI daemon ──
export function registerMcpHealth(app) {
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
}

// ─── GET /api/worker-logs — CLI daemon worker log history ─
export function registerWorkerLogs(app) {
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
}

// ─── GET /api/embeddings-config ─
export function registerEmbeddingsConfig(app) {
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
}

// ─── GET /api/swarm-state ─
export function registerSwarmState(app) {
  app.get('/api/swarm-state', (req, res) => {
    try {
      const state = readJson('.swarm/state.json');
      if (!state) return res.json({ state: null });
      res.json(state);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── GET /api/metrics/:name — whitelisted named metrics ─
export function registerMetrics(app) {
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
}

// ─── GET /api/session-metadata ─
export function registerSessionMetadata(app) {
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
}

// ─── GET /api/security-audit ─
export function registerSecurityAudit(app) {
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
}

// ─── GET /api/neural-stats ─
export function registerNeuralStats(app) {
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
}

// ─── GET /api/routing-stats — model-router stats + latest recommendation ─
export function registerRoutingStats(app) {
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
}

// ─── GET /api/system/fallback-status — per-component graceful degradation ─
//   Reuses: ONNX fallback chain (helpers.js:1020-1073), controller registry,
//   detectBackends(). Returns L1-L4 fallback levels for each component.
export function registerFallbackStatus(app) {
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
}

export function registerHealthRoutes(app, _deps = {}) {
  registerMcpHealth(app);
  registerWorkerLogs(app);
  registerEmbeddingsConfig(app);
  registerSwarmState(app);
  registerMetrics(app);
  registerSessionMetadata(app);
  registerSecurityAudit(app);
  registerNeuralStats(app);
  registerRoutingStats(app);
  registerFallbackStatus(app);
}
