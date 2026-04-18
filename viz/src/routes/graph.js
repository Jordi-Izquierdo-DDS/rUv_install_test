// Graph route module — extracted from api.js (2026-04-18).
//
// Routes:
//   GET /api/graph              — full node + edge + status payload
//   GET /api/graph/pulse        — lightweight status-only
//   GET /api/graph/config       — learning bridge config
//   GET /api/graph/summary      — computed graph stats
//   GET /api/pipeline-overview  — learning pipeline status (controller levels)
//   GET /api/node/:id           — type-specific drill-down per node
//
// Pure move — no business logic change. Depends on a handful of api.js-side
// helpers (vizMcpCall) which are passed in via `deps`.

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

import {
  openDb, withDb, countRows, readJson,
  tableSchema, tablePreview, listTables, globFiles,
  resolvePath,
  readJsonSafe,
  scanNodeSignals, discoverNodes,
} from '../helpers.js';
import { evaluateEdge } from '../edge-activity.js';
import { EXPECTED_NODES, NODE_BY_ID } from '../node-registry.js';
import { getAllEdges, invalidateEdgeCache } from '../edge-discover.js';
import { BUG_CATALOG, CONTROLLER_LEVELS, CONTROLLER_META, BUG_BY_ID } from '../controller-registry.js';
import { getCachedStatusMap } from '../controller-status.js';

// ─── Cached discovered nodes (shared across graph routes) ───
// 10s TTL cache, invalidated on ?rescan.
let _discoveredCache = null;
let _discoveredCacheTs = 0;
const DISCOVER_TTL = 10_000;

function getDiscoveredNodes() {
  const now = Date.now();
  if (!_discoveredCache || now - _discoveredCacheTs > DISCOVER_TTL) {
    _discoveredCache = discoverNodes(EXPECTED_NODES);
    _discoveredCacheTs = now;
  }
  return _discoveredCache;
}

function invalidateDiscoveredCache() {
  _discoveredCache = null;
  _discoveredCacheTs = 0;
}

// ─── 1. GET /api/graph — Full node + edge + status payload ──
export function registerGraph(app) {
  app.get('/api/graph', (req, res) => {
    try {
      // Force re-discovery on rescan
      if (req.query.rescan) invalidateEdgeCache();
      // Auto-discover nodes from reality (filesystem, settings.json, processes)
      // Registry used only for stable IDs + enrichment (descriptions, bugRefs)
      if (req.query.rescan) invalidateDiscoveredCache();
      const discovered = getDiscoveredNodes();
      const nodes = discovered.map(n => scanNodeSignals(n));

      // Dedupe by id (discovery handles merging, but be safe)
      const nodeMap = new Map();
      for (const n of nodes) nodeMap.set(n.id, n);
      const allNodes = Array.from(nodeMap.values());

      // ── Merge fallback-level nodes into their parent ─────────
      // Nodes with mergedInto are removed; their edges redirect to the parent.
      const mergeMap = new Map(); // childId → parentId
      for (const n of allNodes) {
        if (n.mergedInto) mergeMap.set(n.id, n.mergedInto);
      }
      // (No runtime renames — mergedInto handles everything)

      // Remove merged nodes from the list
      const filteredNodes = allNodes.filter(n => !mergeMap.has(n.id));

      const nodeSignalMap = Object.fromEntries(filteredNodes.map(n => [n.id, n.signals]));

      // Full edge list from edge-discover (static registry + dynamically parsed edges, deduped internally)
      const allEdgeDefs = getAllEdges(discovered);

      // Redirect edges: if source or target was merged, point to parent
      for (const e of allEdgeDefs) {
        if (mergeMap.has(e.sourceId)) e.sourceId = mergeMap.get(e.sourceId);
        if (mergeMap.has(e.targetId)) e.targetId = mergeMap.get(e.targetId);
      }

      // Dedupe edges by source→target→type, drop edges with missing endpoints
      const nodeIdSet = new Set(filteredNodes.map(n => n.id));
      const edgeMap = new Map();
      for (const e of allEdgeDefs) {
        if (!nodeIdSet.has(e.sourceId) || !nodeIdSet.has(e.targetId)) continue;
        if (e.sourceId === e.targetId) continue; // drop self-loops from merge
        const key = `${e.sourceId}→${e.targetId}→${e.type}`;
        if (!edgeMap.has(key)) edgeMap.set(key, e);
      }

      // Build deprecated node set for auto-propagation to edges
      const deprecatedNodes = new Set(allNodes.filter(n => n.deprecated).map(n => n.id));

      const edges = Array.from(edgeMap.values()).map(e => {
        // Auto-deprecate edges touching deprecated nodes
        const autoDeprecated = !e.deprecated && (deprecatedNodes.has(e.sourceId) || deprecatedNodes.has(e.targetId));
        if (autoDeprecated) e = { ...e, deprecated: true, autoDeprecated: true };

        // 3-layer waterfall edge evaluation (see src/edge-activity.js)
        const telemetry = evaluateEdge(e, nodeSignalMap, filteredNodes);
        return { ...e, telemetry };
      });

      const tiers = {};
      for (const tier of [1, 2, 3]) {
        const tn = filteredNodes.filter(n => n.tier === tier);
        const active = tn.filter(n => n.signals.active).length;
        tiers[tier] = {
          status: active === tn.length ? 'active' : active > 0 ? 'partial' : 'inactive',
          nodeCount: tn.length,
          activeCount: active,
        };
      }

      const phantomCount = filteredNodes.filter(n => n.meta?.phantom).length;
      const discoveredCount = filteredNodes.filter(n => n.discovered).length;
      const mergedCount = mergeMap.size;
      res.json({
        nodes: filteredNodes,
        edges,
        summary: {
          totalCount: filteredNodes.length,
          discoveredCount,
          registryOnlyCount: filteredNodes.length - discoveredCount,
          foundCount: filteredNodes.filter(n => n.signals.exists).length,
          missingCount: filteredNodes.filter(n => !n.signals.exists && !n.meta?.phantom).length,
          phantomCount,
          mergedCount,
          tiers,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── 2. GET /api/graph/pulse — Lightweight status-only ──────
export function registerGraphPulse(app) {
  app.get('/api/graph/pulse', (req, res) => {
    try {
      const nodes = EXPECTED_NODES.map(n => {
        const s = scanNodeSignals(n);
        return { id: n.id, signals: s.signals, actual: s.actual, meta: s.meta };
      });
      res.json({ nodes, timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── 2b. GET /api/graph/config — Learning bridge config ─────
export function registerGraphConfig(app) {
  app.get('/api/graph/config', (req, res) => {
    try {
      const config = readJson('.claude-flow/config.json') || {};
      const memory = config.memory || {};
      res.json({
        learningBridge: memory.learningBridge || {},
        memoryGraph: memory.memoryGraph || {},
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── 2c. GET /api/graph/summary — Computed graph stats ────
export function registerGraphSummary(app) {
  app.get('/api/graph/summary', (req, res) => {
    try {
      const nodes = EXPECTED_NODES.map(n => scanNodeSignals(n));
      const found = nodes.filter(n => n.signals.exists).length;
      const active = nodes.filter(n => n.signals.active).length;
      const phantom = nodes.filter(n => n.meta?.phantom).length;
      const missing = nodes.filter(n => !n.signals.exists && !n.meta?.phantom).length;
      const edgeCount = getAllEdges(getDiscoveredNodes()).length;
      res.json({ total: nodes.length, found, active, missing, phantom, edges: edgeCount });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── 2d. GET /api/pipeline-overview — Learning pipeline status ──
export function registerPipelineOverview(app) {
  app.get('/api/pipeline-overview', (req, res) => {
    try {
      // Read runtime status from the composite cache populated by controller-status.js
      const statusMap = getCachedStatusMap();
      const controllerStatus = [];
      for (const [mcpName, entry] of statusMap.entries()) {
        const meta = CONTROLLER_META[mcpName] || {};
        controllerStatus.push({
          id: 'ctrl_' + mcpName.replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').replace(/([a-z\d])([A-Z])/g, '$1_$2').toLowerCase(),
          label: mcpName,
          level: entry.level,
          status: entry.status,
          metric: entry.metric,
          lastActivity: entry.lastActivity,
          source: entry.source,
          backend: entry.backend,
          description: meta.description || '',
          bugRefs: meta.bugRefs || [],
        });
      }

      const byLevel = {};
      for (const c of controllerStatus) {
        if (!byLevel[c.level]) byLevel[c.level] = [];
        byLevel[c.level].push(c);
      }

      const sonaLoops = {
        A: { label: 'Instant (MicroLoRA)', status: 'working', reason: 'B2 fixed: record command via RFP-007 + native @ruvector/sona' },
        B: { label: 'Background (EWC++)', status: 'broken', reason: 'B7: consolidation worker still no-op (scaffolding)' },
        C: { label: 'Coordinator (RJDC)', status: 'working', reason: 'B1+B8 fixed: native @ruvector/core provides ONNX 384D embedder' },
      };

      const rjdc = {
        retrieve: { status: 'working', reason: 'B1 fixed: native ONNX 384D embeddings → real cosine similarity' },
        judge: { status: 'working', reason: 'Connected via MCP gateway bridge calls' },
        distill: { status: 'working', reason: 'Trajectory data via native @ruvector/sona' },
        consolidate: { status: 'broken', reason: 'B7: worker no-op (scaffolding only)' },
      };

      const tiers = {
        T1: { status: 'working', description: 'CJS PageRank + JSON files (self-contained)' },
        T2: { status: 'working', description: '23 controllers connected via native @ruvector MCP gateway' },
        T3: { status: 'working', description: 'Native @ruvector/core ONNX 384D (B6 fixed)' },
      };

      const silos = [
        { name: 'patterns.db', path: '.claude-flow/learning/patterns.db', accessors: ['learning-service.mjs'], exists: existsSync(resolvePath('.claude-flow/learning/patterns.db')) },
        { name: 'memory.db', path: '.swarm/memory.db', accessors: ['All L3-L7 controllers'], exists: existsSync(resolvePath('.swarm/memory.db')) },
      ];

      res.json({ levels: CONTROLLER_LEVELS, controllers: byLevel, bugs: BUG_CATALOG, sonaLoops, rjdc, tiers, silos, timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── 3. GET /api/node/:id — Type-specific drill-down ───────
// deps: { vizMcpCall } — injected from api.js because vizMcpCall is a
// stateful closure (initialized-once flag) shared with other api.js routes.
export function registerNodeDetail(app, deps = {}) {
  const vizMcpCall = deps.vizMcpCall || (async () => { throw new Error('vizMcpCall not wired'); });

  app.get('/api/node/:id', async (req, res) => {
    try {
      // Use same discovery as /api/graph — single source of truth
      const allDiscovered = getDiscoveredNodes();
      let node = allDiscovered.find(n => n.id === req.params.id);

      // Fallback: static registry (in case discovery hasn't cached it yet)
      if (!node) node = NODE_BY_ID[req.params.id];

      if (!node) return res.status(404).json({ error: `Node '${req.params.id}' not found` });

      // Full edge list (static + dynamic) for incoming/outgoing lookups below
      const allEdges = getAllEdges(allDiscovered);

      const scanned = scanNodeSignals(node);
      const detail = {};

      switch (node.type) {
        case 'store_db': {
          if (!node.path) break;
          const db = openDb(node.path);
          if (!db) break;
          const targetTable = req.query.table || node.table;
          if (targetTable) {
            // Validate table exists in DB before querying
            const validTables = listTables(db);
            if (!validTables.includes(targetTable)) {
              db.close();
              return res.status(400).json({ error: `Table '${targetTable}' not found` });
            }
            detail.tableName = targetTable;
            detail.schema = tableSchema(db, targetTable);
            detail.rowCount = countRows(db, targetTable);
            detail.preview = tablePreview(db, targetTable, 100);
          } else {
            detail.tables = listTables(db).map(t => ({ name: t, rowCount: countRows(db, t) }));
          }
          db.close();
          break;
        }
        case 'store_json': {
          if (!node.path) break;
          if (node.path.includes('*')) {
            const dir = node.path.substring(0, node.path.lastIndexOf('/'));
            const pattern = node.path.split('/').pop();
            const files = globFiles(dir, pattern);
            detail.files = files;
            detail.fileCount = files.length;
          } else {
            const data = readJson(node.path);
            if (data) {
              detail.preview = JSON.stringify(data, null, 2).slice(0, 5000);
              detail.parsedContent = data;
              detail.fileExt = 'json';
              detail.entryCount = Array.isArray(data) ? data.length
                : data.entries ? (Array.isArray(data.entries) ? data.entries.length : Object.keys(data.entries).length)
                : Object.keys(data).length;
            }
          }
          break;
        }
        case 'trigger': {
          const settings = readJson('.claude/settings.json');
          const eventMap = {
            'SessionStart': 'SessionStart', 'SessionEnd': 'SessionEnd',
            'PreToolUse': 'PreToolUse', 'PostToolUse': 'PostToolUse',
            'PostToolUseFailure': 'PostToolUseFailure', 'UserPromptSubmit': 'UserPromptSubmit',
            'Stop': 'Stop', 'PreCompact': 'PreCompact',
            'SubagentStart': 'SubagentStart', 'SubagentStop': 'SubagentStop',
            'Notification': 'Notification',
          };
          const evt = eventMap[node.label];
          if (evt && settings?.hooks?.[evt]) {
            detail.hookConfig = settings.hooks[evt];
            detail.eventName = evt;
          }
          // Connected edges
          detail.outgoingEdges = allEdges.filter(e => e.sourceId === node.id).map(e => ({
            target: e.targetId, type: e.type, label: e.label,
          }));
          break;
        }
        case 'script':
        case 'engine': {
          if (node.path) {
            const fullPath = resolvePath(node.path);
            if (existsSync(fullPath)) {
              const content = readFileSync(fullPath, 'utf8');
              detail.preview = content.split('\n').slice(0, 50).join('\n');
              detail.lineCount = content.split('\n').length;
              detail.fileSize = content.length;
            }
          }
          // Enrich daemon worker nodes with state from daemon-state.json
          if (node.logKeys?.length) {
            const ds = readJson('.claude-flow/daemon-state.json');
            const workerKey = node.logKeys[0];
            const ws = ds?.workers?.[workerKey];
            if (ws) {
              detail.workerState = {
                worker: workerKey,
                runCount: ws.runCount || 0,
                successCount: ws.successCount || 0,
                failureCount: ws.failureCount || 0,
                averageDurationMs: ws.averageDurationMs || 0,
                isRunning: !!ws.isRunning,
                lastRun: ws.lastRun || null,
                nextRun: ws.nextRun || null,
                lastResult: ws.lastResult || null,
                lastError: ws.lastError || null,
              };
            } else {
              detail.workerState = { worker: workerKey, notStarted: true };
            }
          }
          detail.incomingEdges = allEdges.filter(e => e.targetId === node.id).map(e => ({
            source: e.sourceId, type: e.type, label: e.label,
          }));
          detail.outgoingEdges = allEdges.filter(e => e.sourceId === node.id).map(e => ({
            target: e.targetId, type: e.type, label: e.label,
          }));
          break;
        }
        case 'config': {
          if (node.path) {
            const data = readJson(node.path);
            if (data) {
              if (node.label === 'settings.json' && data.hooks) {
                detail.hookEvents = Object.keys(data.hooks).length;
                detail.hookCount = Object.values(data.hooks).reduce((sum, arr) =>
                  sum + (Array.isArray(arr) ? arr.length : 1), 0);
              } else if (node.label === '.mcp.json' && data.mcpServers) {
                detail.mcpServers = Object.keys(data.mcpServers);
              }
              detail.parsed = data;
            }
          }
          break;
        }
        case 'service': {
          const mcp = readJson('.mcp.json');
          const map = {
            'claude-flow MCP': 'claude-flow', 'ruvector MCP': 'ruvector',
            'agentdb MCP': 'agentdb', 'pi-brain MCP': 'pi-brain',
            'ruv-swarm MCP': 'ruv-swarm', 'flow-nexus MCP': 'flow-nexus',
          };
          const name = map[node.label];
          if (name && mcp?.mcpServers?.[name]) {
            detail.serverConfig = mcp.mcpServers[name];
          }
          break;
        }
        case 'model': {
          detail.patchRef = node.patchRef;
          if (node.path) {
            const expanded = node.path.startsWith('~')
              ? node.path.replace('~', process.env.HOME || '/root')
              : resolvePath(node.path);
            detail.resolved = expanded;
            detail.found = existsSync(expanded);
            // Recursive file listing with sizes
            if (detail.found) {
              try {
                const st = statSync(expanded);
                if (st.isDirectory()) {
                  const walkDir = (dir, prefix) => {
                    const result = [];
                    for (const entry of readdirSync(dir)) {
                      const full = join(dir, entry);
                      const rel = prefix ? `${prefix}/${entry}` : entry;
                      try {
                        const s = statSync(full);
                        if (s.isDirectory()) {
                          result.push({ name: rel + '/', size: 0, isDir: true });
                          result.push(...walkDir(full, rel));
                        } else {
                          result.push({ name: rel, size: s.size, isDir: false });
                        }
                      } catch { /* skip unreadable */ }
                    }
                    return result;
                  };
                  detail.filesTree = walkDir(expanded, '');
                  // Legacy flat list for backwards compat
                  detail.files = readdirSync(expanded);
                } else {
                  detail.filesTree = [{ name: expanded.split('/').pop(), size: st.size, isDir: false }];
                  detail.files = [expanded.split('/').pop()];
                }
              } catch {}
            }
            // Fallback chain (from scanNodeSignals)
            if (node._fallbackChain) {
              detail.fallbackChain = node._fallbackChain;
              detail.activeLevel = node._activeLevel;
            }
          }
          break;
        }
        case 'controller': {
          detail.level = node.level;
          detail.controllerStatus = node.controllerStatus;
          if (node.bugRefs?.length) {
            detail.bugs = node.bugRefs.map(ref => BUG_BY_ID[ref]).filter(Boolean);
          }
          detail.incomingEdges = allEdges.filter(e => e.targetId === node.id).map(e => ({
            source: e.sourceId, type: e.type, label: e.label, bugRefs: e.bugRefs,
          }));
          detail.outgoingEdges = allEdges.filter(e => e.sourceId === node.id).map(e => ({
            target: e.targetId, type: e.type, label: e.label, bugRefs: e.bugRefs,
          }));
          break;
        }
      }

      // ── Universal fallback: read file content for any node with a path ──
      if (!detail.preview && !detail.tables?.length && !detail.parsed && !detail.hookConfig && !detail.serverConfig && !detail.workerState) {
        const nodePath = node.path || node.meta?.path;
        if (nodePath) {
          if (nodePath.includes('*')) {
            const dir = nodePath.substring(0, nodePath.lastIndexOf('/'));
            const pattern = nodePath.split('/').pop();
            const files = globFiles(dir, pattern);
            detail.files = files;
            detail.fileCount = files.length;
          } else {
            const fullPath = resolvePath(nodePath);
            if (existsSync(fullPath)) {
              try {
                const stat = statSync(fullPath);
                detail.fileSize = stat.size;
                detail.lastMod = stat.mtime.toISOString();
                const ext = (fullPath.match(/\.([^./]+)$/) || [])[1] || '';
                detail.fileExt = ext.toLowerCase();
                if (stat.size < 512_000 && !fullPath.match(/\.(db|rvf|index|onnx|bin|wasm|png|jpg)$/i)) {
                  const content = readFileSync(fullPath, 'utf8');
                  detail.preview = content.split('\n').slice(0, 80).join('\n');
                  detail.lineCount = content.split('\n').length;
                  // For JSON files, also send parsed object for foldable tree
                  if (ext === 'json' || ext === 'jsonl') {
                    try { detail.parsedContent = JSON.parse(content); } catch {}
                  }
                }
              } catch {}
            }
          }
        }
      }
      // Also set fileExt for nodes that already have preview from type-specific handlers
      if (!detail.fileExt) {
        const nodePath = node.path || node.meta?.path || '';
        const ext = (nodePath.match(/\.([^./]+)$/) || [])[1] || '';
        if (ext) detail.fileExt = ext.toLowerCase();
      }

      // ── Domain-specific enrichment for ruvector / HNSW nodes ──
      if (req.params.id === 'db_ruvector') {
        // ruvector.db is redb format — can't open with SQLite.
        // Pull live stats from the same sources the /api/ endpoints use.
        const ruvDetail = { format: 'redb', vectorCount: 0, entryCount: 0, graphNodes: 0, graphEdges: 0, confidenceDistribution: {}, topPatterns: [], embeddingsConfig: {} };
        // Intelligence stats via MCP (replaces .ruvector/intelligence.json)
        let _intelMcp = null;
        try {
          _intelMcp = await vizMcpCall('hooks_intelligence_stats');
          if (_intelMcp) {
            ruvDetail.entryCount = (_intelMcp.sona?.patternsLearned || 0) + (_intelMcp.sona?.trajectoriesTotal || 0);
            ruvDetail.graphNodes = _intelMcp.ruvllm?.graphDatabase?.totalNodes || 0;
            ruvDetail.graphEdges = _intelMcp.ruvllm?.graphDatabase?.totalEdges || 0;
          }
        } catch {}
        try {
          const embConf = readJsonSafe('.claude-flow/embeddings.json', null);
          if (embConf) {
            ruvDetail.embeddingsConfig = { model: embConf.model, dimension: embConf.dimension || 384, initialized: embConf.initialized };
          }
        } catch {}
        try {
          const ruvDbPath = resolvePath('ruvector.db');
          if (existsSync(ruvDbPath)) {
            const stat = statSync(ruvDbPath);
            ruvDetail.hnswSize = stat.size;
            // Check if native redb is held by ruvector process (L1 active)
            try {
              const lsofOut = execSync(`lsof "${ruvDbPath}" 2>/dev/null`, { timeout: 2000 }).toString();
              if (lsofOut.includes('ruvector') || lsofOut.includes('node')) {
                ruvDetail.nativeActive = true;
                const pidMatch = lsofOut.match(/node\s+(\d+)/);
                if (pidMatch) ruvDetail.nativePid = parseInt(pidMatch[1]);
              }
            } catch {}
            const mappings = readJsonSafe('.swarm/memory.hnsw.mappings.json', null);
            ruvDetail.vectorCount = mappings ? Object.keys(mappings).length : 0;
          }
        } catch {}
        // T1 graph stats — from auto-memory SQLite backend
        try {
          const amDb = openDb('.swarm/memory.db');
          if (amDb) {
            try { ruvDetail.entryCount = amDb.prepare('SELECT count(*) as c FROM memory_entries').get()?.c || 0; } catch {}
            try {
              const cd = { high: 0, medium: 0, low: 0 };
              const rows = amDb.prepare('SELECT confidence FROM memory_entries WHERE confidence IS NOT NULL').all();
              for (const r of rows) {
                if (r.confidence >= 0.8) cd.high++;
                else if (r.confidence >= 0.3) cd.medium++;
                else cd.low++;
              }
              ruvDetail.confidenceDistribution = cd;
            } catch {}
            try { ruvDetail.graphEdges = amDb.prepare('SELECT count(*) as c FROM causal_edges').get()?.c || 0; } catch {}
            ruvDetail.graphNodes = ruvDetail.entryCount;
            amDb.close();
          }
        } catch {}
        // Intelligence session stats via MCP
        if (_intelMcp) {
          ruvDetail.sessionCount = _intelMcp.sona?.trajectoriesTotal || 0;
          ruvDetail.totalErrors = 0;
        }
        detail.ruvectorStats = ruvDetail;
      }

      if (req.params.id === 'bin_hnsw_index' || req.params.id === 'mdl_hnsw') {
        const hnswDetail = { vectorCount: 0, dimension: 384, metric: 'cosine', indexSize: 0, memoryDbSize: 0 };
        try {
          const idxPath = resolvePath('.swarm/memory.hnsw');
          if (existsSync(idxPath)) {
            hnswDetail.indexSize = statSync(idxPath).size;
          }
        } catch {}
        try {
          const memPath = resolvePath('.swarm/memory.db');
          if (existsSync(memPath)) {
            hnswDetail.memoryDbSize = statSync(memPath).size;
            const mdb = openDb('.swarm/memory.db');
            if (mdb) {
              // Count vectors from memory_entries
              try { hnswDetail.vectorCount = mdb.prepare('SELECT count(*) as c FROM memory_entries WHERE embedding IS NOT NULL').get()?.c || 0; } catch {}
              // Count patterns
              try { hnswDetail.patternCount = countRows(mdb, 'patterns'); } catch {}
              // Count trajectories
              try { hnswDetail.trajectoryCount = countRows(mdb, 'sona_trajectories') || countRows(mdb, 'trajectories'); } catch {}
              mdb.close();
            }
          }
        } catch {}
        try {
          const embConf = readJsonSafe('.claude-flow/embeddings.json', null);
          if (embConf) {
            hnswDetail.dimension = embConf.dimension || 384;
            hnswDetail.model = embConf.model || 'all-MiniLM-L6-v2';
          }
        } catch {}
        detail.hnswStats = hnswDetail;
      }

      // ── Domain-specific enrichment for SONA / EWC engines ────
      if (req.params.id === 'eng_sona_optimizer') {
        const daemonState = readJsonSafe('.claude-flow/data/hooks-daemon-state.json', null);
        // Detect native SONA from startup log (SonaTrajectoryService loaded)
        const nativeLoaded = scanned?.statusNote?.includes('@ruvector/sona') || scanned?._dynamicStatusNote?.includes('@ruvector/sona');
        const sonaDetail = {
          patternCount: 0, trajectoryCount: 0, lastOptimization: null, topPatterns: [],
          sonaReady: !!daemonState?.sonaReady || nativeLoaded,
          totalSonaProcessed: daemonState?.totalSonaProcessed || 0,
          lastSonaBatch: daemonState?.lastSonaBatch || 0,
        };
        try {
          const sonaData = readJsonSafe('.swarm/sona-patterns.json', null);
          if (sonaData) {
            const patterns = Array.isArray(sonaData) ? sonaData
              : sonaData.patterns ? (Array.isArray(sonaData.patterns) ? sonaData.patterns : [])
              : [];
            sonaDetail.patternCount = patterns.length;
            sonaDetail.lastOptimization = sonaData.lastOptimization || sonaData.updated_at || sonaData.timestamp || null;
            sonaDetail.topPatterns = patterns
              .filter(p => p.confidence !== undefined)
              .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
              .slice(0, 5)
              .map(p => ({ name: p.name || p.id || 'unnamed', confidence: p.confidence, successCount: p.success_count || 0 }));
          }
        } catch {}
        try {
          withDb('.swarm/memory.db', db => {
            sonaDetail.trajectoryCount = countRows(db, 'sona_trajectories') || countRows(db, 'trajectories');
            const tables = listTables(db);
            if (tables.includes('pattern_embeddings')) {
              sonaDetail.patternEmbeddingCount = countRows(db, 'pattern_embeddings');
            }
          });
        } catch {}
        // Native SONA engine stats via MCP daemon
        try {
          const resp = await fetch('http://localhost:8917/rpc', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call',
              params: { name: 'hooks_intelligence_stats', arguments: {} } }),
            signal: AbortSignal.timeout(2000),
          });
          const rpc = await resp.json();
          const statsText = rpc?.result?.content?.[0]?.text;
          if (statsText) {
            const stats = JSON.parse(statsText);
            sonaDetail.nativeStats = stats.sona || null;
            // Merge native buffer stats if available from engine
            if (stats.sona?.trajectories_buffered !== undefined) {
              sonaDetail.nativeBuffer = {
                buffered: stats.sona.trajectories_buffered,
                dropped: stats.sona.trajectories_dropped || 0,
                successRate: stats.sona.buffer_success_rate ?? 1.0,
                patternsStored: stats.sona.patterns_stored || 0,
                ewcTasks: stats.sona.ewc_tasks || 0,
                bufferSize: 32,
              };
            }
          }
        } catch {}
        // Fallback: estimate buffer from completed trajectories since last forceLearn
        if (!sonaDetail.nativeBuffer) {
          try {
            withDb('.swarm/memory.db', db => {
              const tables = listTables(db);
              if (tables.includes('trajectories')) {
                const lastLearn = sonaDetail.ewc?.lastConsolidation || 0;
                const buffered = lastLearn
                  ? db.prepare("SELECT COUNT(*) as c FROM trajectories WHERE (status='completed' OR ended_at IS NOT NULL) AND started_at > ?").get(lastLearn)
                  : db.prepare("SELECT COUNT(*) as c FROM trajectories WHERE status='completed' OR ended_at IS NOT NULL").get();
                sonaDetail.nativeBuffer = {
                  buffered: Math.min(buffered?.c || 0, 32),
                  dropped: 0,
                  successRate: (buffered?.c || 0) > 0 ? 1.0 : 0,
                  patternsStored: sonaDetail.patternCount || 0,
                  ewcTasks: sonaDetail.ewc?.taskCount || 0,
                  bufferSize: 32,
                };
              }
            });
          } catch {}
        }
        // EWC Fisher state (Rust native multi-task EWC++)
        try {
          const fisher = readJsonSafe('.swarm/ewc-fisher.json', null);
          if (fisher) {
            sonaDetail.ewc = {
              dimension: fisher.globalFisher?.length || fisher.config?.dimensions || 0,
              lambda: fisher.config?.lambda || 0,
              taskCount: fisher.consolidationHistory?.length || 0,
              lastConsolidation: fisher.consolidationHistory?.length
                ? fisher.consolidationHistory[fisher.consolidationHistory.length - 1].timestamp : null,
              engine: fisher.globalFisher ? 'rust-native' : 'js',
            };
          }
        } catch {}
        // Parse hook-activity.jsonl: routing levels + learning capability detection
        try {
          const actPath = resolvePath('.claude-flow/data/hook-activity.jsonl');
          if (existsSync(actPath)) {
            const levels = { 'agentdb-semanticRouter': 0, 'sona-native': 0, 'sona-pattern': 0, 'q-learning': 0, 'keyword': 0, 'default': 0 };
            let routeTotal = 0;
            const toolsSeen = new Set();
            for (const line of readFileSync(actPath, 'utf8').split('\n')) {
              if (!line) continue;
              try {
                const ev = JSON.parse(line);
                if (ev.c) for (const t of ev.c) toolsSeen.add(t);
                if (ev.e === 'route') {
                  const calls = ev.c || [];
                  const rl = ev.rl || (calls.includes('agentdb_semantic-route') ? 'agentdb-semanticRouter'
                    : calls.includes('hooks_route') ? 'keyword' : 'default');
                  levels[rl] = (levels[rl] || 0) + 1;
                  routeTotal++;
                }
              } catch {}
            }
            sonaDetail.routingLevels = levels;
            sonaDetail.routingTotal = routeTotal;
            // Learning quality: which capabilities are confirmed active
            sonaDetail.capabilities = {
              trajectoryTracking:  toolsSeen.has('hooks_intelligence_trajectory-start'),
              forceLearn:          toolsSeen.has('hooks_intelligence_learn'),
              patternSearch:       toolsSeen.has('hooks_intelligence_pattern-search'),
              patternStore:        toolsSeen.has('hooks_intelligence_pattern-store'),
              vectorEmbeddings:    toolsSeen.has('embeddings_neural') || toolsSeen.has('embeddings_generate'),
              ewcConsolidation:    toolsSeen.has('agentdb_consolidate'),
              causalGraph:         toolsSeen.has('agentdb_causal-edge'),
              semanticRouting:     toolsSeen.has('agentdb_semantic-route'),
              hierarchicalMemory:  toolsSeen.has('agentdb_hierarchical-store'),
              feedback:            toolsSeen.has('agentdb_feedback'),
            };
          }
        } catch {}
        detail.sonaDetail = sonaDetail;
      }

      if (req.params.id === 'eng_ewc_consolidation') {
        const daemonState = readJsonSafe('.claude-flow/data/hooks-daemon-state.json', null);
        const ewcDetail = {
          taskCount: 0, fisherDimension: 0, lastConsolidation: null, consolidatedParamCount: 0,
          ewcReady: !!daemonState?.ewcReady,
          totalEwcRecorded: daemonState?.totalEwcRecorded || 0,
          lastEwcBatch: daemonState?.lastEwcBatch || 0,
        };
        try {
          const fisherData = readJsonSafe('.swarm/ewc-fisher.json', null);
          if (fisherData) {
            ewcDetail.taskCount = fisherData.taskCount || fisherData.task_count || (fisherData.tasks ? Object.keys(fisherData.tasks).length : 0);
            ewcDetail.fisherDimension = fisherData.fisherDimension || fisherData.fisher_dimension
              || (fisherData.fisher_diagonal ? (Array.isArray(fisherData.fisher_diagonal) ? fisherData.fisher_diagonal.length : 0) : 0);
            ewcDetail.lastConsolidation = fisherData.lastConsolidation || fisherData.last_consolidation || fisherData.updated_at || null;
            ewcDetail.consolidatedParamCount = fisherData.consolidatedParamCount || fisherData.consolidated_param_count || fisherData.paramCount || 0;
            ewcDetail.version = fisherData.version || null;
          }
        } catch {}
        detail.ewcDetail = ewcDetail;
      }

      // Routing pipeline stats for semantic router / SONA nodes
      if (['ctrl_semantic_router', 'native_router', 'eng_router'].includes(req.params.id)) {
        try {
          const actPath = resolvePath('.claude-flow/data/hook-activity.jsonl');
          if (existsSync(actPath)) {
            const levels = { 'agentdb-semanticRouter': 0, 'sona-native': 0, 'sona-pattern': 0, 'q-learning': 0, 'keyword': 0, 'default': 0 };
            let total = 0;
            for (const line of readFileSync(actPath, 'utf8').split('\n')) {
              if (!line || !line.includes('"route"')) continue;
              try {
                const ev = JSON.parse(line);
                if (ev.e !== 'route') continue;
                const calls = ev.c || [];
                const rl = ev.rl || (calls.includes('agentdb_semantic-route') ? 'agentdb-semanticRouter'
                  : calls.includes('hooks_route') ? 'keyword' : 'default');
                levels[rl] = (levels[rl] || 0) + 1;
                total++;
              } catch {}
            }
            detail.routingLevels = levels;
            detail.routingTotal = total;
          }
        } catch {}
      }

      res.json({ node: scanned, detail });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── Orchestrator ───────────────────────────────────────────────
// Accepts an optional deps bag so api.js can inject vizMcpCall into
// /api/node/:id (used for domain-specific enrichment on a few node ids).
export function registerGraphRoutes(app, deps = {}) {
  registerGraph(app);
  registerGraphPulse(app);
  registerGraphConfig(app);
  registerGraphSummary(app);
  registerPipelineOverview(app);
  registerNodeDetail(app, deps);
}
