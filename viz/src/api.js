import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, openSync, readSync, closeSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
import {
  openDb, withDb, countRows, readJson, fileStat, readGraphState,
  scanNodeSignals, scanUnexpectedNodes,
  tableSchema, tablePreview, listTables, globFiles,
  getDataRoot, resolvePath, getRecentActivity, getLatestModelRecommendation, findLatestJsonl, findAllLatestJsonls, findLearningActivity,
  parseHooksFromSettings, parseMcpServers, scanAdditionalStores,
  readJsonSafe, isPidAlive,
  discoverNodes,
} from './helpers.js';
import { evaluateEdge } from './edge-activity.js';
const LAYOUT_FILE = resolve(__dirname, 'config', 'viz-layout.json');
const THEME_FILE = resolve(__dirname, 'config', 'viz-theme.json');
import { EXPECTED_NODES, NODE_BY_ID, EXPECTED_PATHS } from './node-registry.js';
import { getAllEdges, invalidateEdgeCache } from './edge-discover.js';
import { BUG_CATALOG, CONTROLLER_LEVELS, CONTROLLER_META, BUG_BY_ID } from './controller-registry.js';
import { getAllControllerStatus, getCachedStatusMap, getBackendStatus, getUtilStatus, getDaemonStatus, initControllerStatus } from './controller-status.js';
import { classifyAll, invalidateClassifierCache } from './symbol-classifier.js';
import { registerV5Routes } from './routes/v5.js';

import { homedir } from 'os';
export function registerRoutes(app) {

  // Kick off controller-status background refresh. Runs once, stays warm.
  initControllerStatus().catch(err => console.error('[api] controller-status init:', err.message));

  // ── Cached discovered nodes (refreshed by /api/graph, used by /api/node/:id) ──
  let _discoveredCache = null;
  let _discoveredCacheTs = 0;
  const DISCOVER_TTL = 10_000; // 10s cache

  function getDiscoveredNodes() {
    const now = Date.now();
    if (!_discoveredCache || now - _discoveredCacheTs > DISCOVER_TTL) {
      _discoveredCache = discoverNodes(EXPECTED_NODES);
      _discoveredCacheTs = now;
    }
    return _discoveredCache;
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

  // ─── 1. GET /api/graph — Full node + edge + status payload ──

  app.get('/api/graph', (req, res) => {
    try {
      // Force re-discovery on rescan
      if (req.query.rescan) invalidateEdgeCache();
      // Auto-discover nodes from reality (filesystem, settings.json, processes)
      // Registry used only for stable IDs + enrichment (descriptions, bugRefs)
      if (req.query.rescan) { _discoveredCache = null; _discoveredCacheTs = 0; }
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

  // ─── 2. GET /api/graph/pulse — Lightweight status-only ──────

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

  // ─── 2b. GET /api/graph/config — Learning bridge config ─────

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

  // ─── 2c. GET /api/graph/summary — Computed graph stats ────

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

  // ─── 2d. GET /api/pipeline-overview — Learning pipeline status ──

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

  // ─── 3. GET /api/node/:id — Type-specific drill-down ───────

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

  // ─── 4b. POST /api/daemon/trigger — Trigger a CLI daemon worker ──
  // Replaces old pattern-consolidator.sh / learning-optimizer.sh shell script calls.
  // Uses the live CLI daemon: npx @claude-flow/cli daemon trigger --worker <type>

  const VALID_WORKERS = new Set(['map', 'audit', 'optimize', 'consolidate', 'testgaps', 'preload', 'ultralearn', 'deepdive', 'document', 'refactor', 'benchmark', 'predict']);

  // ALL workers run in-process — no CLI daemon, no API key, session-only.
  // map + consolidate use local scripts. Others use lightweight analysis.
  const IN_PROCESS_WORKERS = VALID_WORKERS; // everything runs in-process

  // In-session workers — use ruvector CLI tools (local binary, no API key).
  // Each worker calls the real analysis tool and returns structured results.
  const rvBin = join(getDataRoot(), 'node_modules', '.bin', 'ruvector');

  // Helper: run ruvector CLI and parse JSON output
  function runRv(args, timeout = 10_000) {
    try {
      const out = execSync(`"${rvBin}" ${args}`, {
        timeout, encoding: 'utf8', cwd: getDataRoot(),
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
      });
      // Find JSON in output (may have non-JSON preamble)
      const jsonStart = out.indexOf('{');
      if (jsonStart >= 0) return JSON.parse(out.slice(jsonStart));
      const arrStart = out.indexOf('[');
      if (arrStart >= 0) return JSON.parse(out.slice(arrStart));
      return { raw: out.trim() };
    } catch (e) {
      return { error: e.message?.slice(0, 200), raw: e.stdout?.trim()?.slice(0, 500) };
    }
  }

  const IN_PROCESS_RUNNERS = {
    map: async () => {
      // Real codebase scan: AST analyze all helpers + src files
      const helpers = [...globFiles('.claude/helpers', '*.cjs'), ...globFiles('.claude/helpers', '*.mjs'), ...globFiles('.claude/helpers', '*.sh'), ...globFiles('.claude/helpers', '*.js')];
      const srcFiles = [...globFiles('src', '*.js'), ...globFiles('src', '*.ts'), ...globFiles('src', '*.mjs')];
      const allFiles = [...helpers, ...srcFiles].slice(0, 30); // cap at 30
      const analyses = [];
      for (const f of allFiles) {
        const result = runRv(`hooks ast-analyze ${f} --json`, 5000);
        if (result.success) {
          analyses.push({
            file: f, functions: result.functions, classes: result.classes,
            complexity: result.complexity?.cyclomatic, lines: result.complexity?.lines,
            imports: (result.imports || []).length,
          });
        }
      }
      analyses.sort((a, b) => (b.complexity || 0) - (a.complexity || 0));
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        filesAnalyzed: analyses.length, totalFiles: helpers.length + srcFiles.length,
        topComplexity: analyses.slice(0, 10),
        totalFunctions: analyses.reduce((s, a) => s + (a.functions || 0), 0),
        totalImports: analyses.reduce((s, a) => s + (a.imports || 0), 0),
      };
    },

    audit: async () => {
      // Real security scan: check files for unsafe patterns + exposed secrets
      const root = getDataRoot();
      const issues = [];
      // .env check
      if (existsSync(resolvePath('.env'))) issues.push({ severity: 'HIGH', file: '.env', issue: '.env file exists — may contain secrets' });
      // Check all helpers for hardcoded secrets patterns
      const helpers = globFiles('.claude/helpers', '*.{cjs,mjs,js}');
      for (const f of helpers) {
        try {
          const content = readFileSync(resolvePath(f), 'utf8');
          if (/api[_-]?key\s*[:=]\s*['"][^'"]{10,}/i.test(content))
            issues.push({ severity: 'HIGH', file: f, issue: 'Possible hardcoded API key' });
          if (/password\s*[:=]\s*['"][^'"]+/i.test(content))
            issues.push({ severity: 'HIGH', file: f, issue: 'Possible hardcoded password' });
          if (/eval\s*\(/.test(content))
            issues.push({ severity: 'MEDIUM', file: f, issue: 'eval() usage — potential code injection' });
          if (/child_process.*exec\(/.test(content) && !/execSync|execFile/.test(content))
            issues.push({ severity: 'MEDIUM', file: f, issue: 'exec() with dynamic input — potential command injection' });
        } catch {}
      }
      // Check settings.json permissions
      const settings = readJson('.claude/settings.json');
      const denyCount = settings?.permissions?.deny?.length || 0;
      const allowCount = settings?.permissions?.allow?.length || 0;
      // Verify hook
      const verify = runRv('hooks verify', 5000);
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        issues: issues.length, findings: issues,
        permissions: { allow: allowCount, deny: denyCount },
        hookVerification: verify.raw || verify,
      };
    },

    optimize: async () => {
      // Optimization analysis: MoE routing + pipeline health + learning stats via MCP
      const daemonState = readJson('.claude-flow/data/hooks-daemon-state.json') || {};
      let intel = {};
      try { intel = await vizMcpCall('hooks_intelligence_stats') || {}; } catch {}
      const routingDecisions = intel.moe?.routingDecisions || 0;
      const successRate = intel.sona?.successRate || 0;
      const patternsLearned = intel.sona?.patternsLearned || 0;
      const learningStats = runRv('hooks learning-stats', 5000);
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        routing: { decisions: routingDecisions, successRate, patternsLearned, moeConfidence: (intel.moe?.avgConfidence || 0).toFixed(3) },
        pipeline: {
          processed: daemonState.totalProcessed || 0, t2: daemonState.totalT2Written || 0,
          t3: daemonState.totalT3Updates || 0, ops: daemonState.totalPipelineOps || 0,
          consolidations: daemonState.totalConsolidations || 0, l1: daemonState.totalL1Stored || 0,
        },
        learningAlgorithms: learningStats,
        recommendations: [
          successRate < 0.55 ? 'Success rate is low — more session activity will improve routing' : null,
          (daemonState.totalConsolidations || 0) < 3 ? 'Few consolidation cycles — consider running Consolidate' : null,
          patternsLearned < 20 ? 'Few patterns learned — run Pretrain to seed more patterns' : null,
        ].filter(Boolean),
      };
    },

    consolidate: async () => {
      // Signal hooks-daemon + wait + return actual results
      const pidFile = resolvePath('.claude-flow/pids/hooks-daemon.pid');
      const stateBefore = readJson('.claude-flow/data/hooks-daemon-state.json') || {};
      let signalled = false;
      if (pidFile && existsSync(pidFile)) {
        try {
          const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
          process.kill(pid, 'SIGUSR1');
          signalled = true;
        } catch {}
      }
      // Wait for daemon to process
      if (signalled) await new Promise(r => setTimeout(r, 2000));
      const stateAfter = readJson('.claude-flow/data/hooks-daemon-state.json') || {};
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        daemonSignalled: signalled,
        before: { consolidations: stateBefore.totalConsolidations || 0, ops: stateBefore.totalPipelineOps || 0 },
        after: { consolidations: stateAfter.totalConsolidations || 0, ops: stateAfter.totalPipelineOps || 0 },
        delta: {
          consolidations: (stateAfter.totalConsolidations || 0) - (stateBefore.totalConsolidations || 0),
          ops: (stateAfter.totalPipelineOps || 0) - (stateBefore.totalPipelineOps || 0),
        },
      };
    },

    testgaps: async () => {
      // Real analysis: AST scan src files, compare exports vs test coverage
      const srcFiles = [...globFiles('src', '*.js'), ...globFiles('src', '*.ts'), ...globFiles('src', '*.mjs')];
      const testFiles = [...globFiles('tests', '*.test.js'), ...globFiles('tests', '*.spec.js'), ...globFiles('tests', '*.test.ts'), ...globFiles('tests', '*.test.mjs')];
      const untestedFiles = [];
      for (const f of srcFiles) {
        const base = f.replace(/\.(js|ts|mjs)$/, '');
        const hasTest = testFiles.some(t => t.includes(base.split('/').pop()));
        if (!hasTest) untestedFiles.push(f);
      }
      // AST analyze untested files to get function counts
      const untestedDetail = [];
      for (const f of untestedFiles.slice(0, 10)) {
        const ast = runRv(`hooks ast-analyze ${f} --json`, 3000);
        if (ast.success) {
          untestedDetail.push({ file: f, functions: ast.functions, complexity: ast.complexity?.cyclomatic });
        }
      }
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        srcFiles: srcFiles.length, testFiles: testFiles.length,
        ratio: srcFiles.length > 0 ? (testFiles.length / srcFiles.length * 100).toFixed(0) + '%' : 'N/A',
        untestedFiles: untestedFiles.length,
        topUntested: untestedDetail,
      };
    },

    predict: async () => {
      // Routing prediction: MoE expert distribution via MCP
      let intel = {};
      try { intel = await vizMcpCall('hooks_intelligence_stats') || {}; } catch {}
      const routeCache = readJson('.claude-flow/data/route-cache.json') || {};
      const expertUsage = intel.moe?.loadBalance?.expertUsage || {};
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        routingDecisions: intel.moe?.routingDecisions || 0,
        agentDistribution: expertUsage,
        lastRoute: routeCache,
        moeConfidence: intel.moe?.avgConfidence || 0,
      };
    },

    preload: async () => {
      // Check what's actually warm
      const daemonState = readJson('.claude-flow/data/hooks-daemon-state.json') || {};
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        onnxWarm: !!daemonState.bridgeReady,
        bridgeWarm: !!daemonState.bridgeReady,
        intelligenceWarm: !!daemonState.intelligenceReady,
        learningServiceWarm: !!daemonState.learningServiceReady,
        allWarm: !!(daemonState.bridgeReady && daemonState.intelligenceReady && daemonState.learningServiceReady),
      };
    },

    ultralearn: async () => {
      // Full learning system report across ALL tiers
      const root = getDataRoot();
      let intel = {};
      try { intel = await vizMcpCall('hooks_intelligence_stats') || {}; } catch {}
      const daemonState = readJson('.claude-flow/data/hooks-daemon-state.json') || {};
      const autoMem = readJson('.claude-flow/data/auto-memory-store.json');
      let patternsDb = { short: 0, long: 0, topLong: [] };
      try {
        const Database = require('better-sqlite3');
        const dbPath = join(root, '.claude-flow', 'learning', 'patterns.db');
        if (existsSync(dbPath)) {
          const db = new Database(dbPath, { readonly: true });
          try { patternsDb.short = db.prepare('SELECT count(*) as c FROM short_term_patterns').get()?.c || 0; } catch {}
          try { patternsDb.long = db.prepare('SELECT count(*) as c FROM long_term_patterns').get()?.c || 0; } catch {}
          try { patternsDb.topLong = db.prepare('SELECT strategy, domain, usage_count, quality FROM long_term_patterns ORDER BY quality DESC LIMIT 5').all(); } catch {}
          db.close();
        }
      } catch {}
      const learningStats = runRv('hooks learning-stats', 5000);
      const confs = Array.isArray(autoMem) ? autoMem.map(e => e.metadata?.confidence || 0) : [];
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        t1: {
          autoMemory: Array.isArray(autoMem) ? autoMem.length : 0,
          above07: confs.filter(c => c >= 0.7).length,
          meanConfidence: confs.length > 0 ? (confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(3) : 'N/A',
        },
        t2: { written: daemonState.totalT2Written || 0, pipelineOps: daemonState.totalPipelineOps || 0, consolidations: daemonState.totalConsolidations || 0 },
        t3: { patternsLearned: intel.sona?.patternsLearned || 0, routingDecisions: intel.moe?.routingDecisions || 0, successRate: intel.sona?.successRate || 0 },
        l1: { short: patternsDb.short, long: patternsDb.long, topPromoted: patternsDb.topLong },
        learning: learningStats,
        daemon: { processed: daemonState.totalProcessed || 0, cycles: daemonState.cycles || 0 },
      };
    },

    deepdive: async () => {
      // Real AST complexity analysis via ruvector
      const helpers = globFiles('.claude/helpers', '*.{cjs,mjs,js}');
      const srcFiles = [...globFiles('src', '*.js'), ...globFiles('src', '*.ts'), ...globFiles('src', '*.mjs')];
      const allFiles = [...helpers, ...srcFiles];
      // Run AST complexity on all files
      const complexity = runRv(`hooks ast-complexity ${allFiles.slice(0, 20).join(' ')}`, 15000);
      // Also analyze individual files for import chains
      const importMap = {};
      for (const f of allFiles.slice(0, 15)) {
        const ast = runRv(`hooks ast-analyze ${f} --json`, 3000);
        if (ast.success && ast.imports) {
          importMap[f] = ast.imports.map(i => i.source);
        }
      }
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        filesAnalyzed: allFiles.length,
        complexity: complexity.results || complexity,
        importGraph: importMap,
        highComplexity: (complexity.results || []).filter(r => r.warning).map(r => ({
          file: r.file, cyclomatic: r.cyclomatic, lines: r.lines, functions: r.functions,
        })),
      };
    },

    refactor: async () => {
      // Real refactoring analysis: duplicates + .js/.cjs + complexity hotspots
      const helpers = [...globFiles('.claude/helpers', '*.cjs'), ...globFiles('.claude/helpers', '*.mjs'), ...globFiles('.claude/helpers', '*.sh'), ...globFiles('.claude/helpers', '*.js')];
      // Old .js with .cjs counterparts (can clean up)
      const jsFiles = helpers.filter(f => f.endsWith('.js') && !f.endsWith('.cjs') && !f.endsWith('.mjs'));
      const cjsCounterparts = jsFiles.filter(f => helpers.includes(f.replace('.js', '.cjs')));
      // Size duplicates
      const sizeMap = {};
      for (const f of helpers) {
        try {
          const fullPath = resolvePath(f);
          if (fullPath && existsSync(fullPath)) {
            const size = statSync(fullPath).size;
            if (!sizeMap[size]) sizeMap[size] = [];
            sizeMap[size].push(f);
          }
        } catch {}
      }
      const potentialDupes = Object.entries(sizeMap).filter(([, v]) => v.length > 1).map(([size, files]) => ({ sizeBytes: parseInt(size), files }));
      // High complexity files that need splitting
      const complexity = runRv(`hooks ast-complexity ${helpers.filter(f => f.endsWith('.mjs') || f.endsWith('.cjs')).slice(0, 10).join(' ')}`, 10000);
      const needsSplitting = (complexity.results || []).filter(r => r.cyclomatic > 100).map(r => ({
        file: r.file, cyclomatic: r.cyclomatic, functions: r.functions,
        recommendation: `${r.cyclomatic} cyclomatic complexity — consider splitting into smaller modules`,
      }));
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        totalHelpers: helpers.length,
        oldJsWithCjs: cjsCounterparts.length > 0 ? { count: cjsCounterparts.length, files: cjsCounterparts, action: 'Delete .js files — .cjs versions are active' } : null,
        potentialDuplicates: potentialDupes.length > 0 ? potentialDupes : null,
        highComplexity: needsSplitting.length > 0 ? needsSplitting : null,
        recommendations: [
          cjsCounterparts.length > 0 ? `Remove ${cjsCounterparts.length} old .js files (have .cjs counterparts)` : null,
          potentialDupes.length > 0 ? `${potentialDupes.length} potential duplicate file groups detected` : null,
          needsSplitting.length > 0 ? `${needsSplitting.length} files with >100 cyclomatic complexity need splitting` : null,
        ].filter(Boolean),
      };
    },
    benchmark: async () => {
      const mem = process.memoryUsage();
      const cpu = process.cpuUsage();
      const benchmarkFile = resolvePath('.claude-flow/metrics/benchmark.json');
      const result = {
        timestamp: new Date().toISOString(), mode: 'local',
        benchmarks: {
          memoryUsage: mem, cpuUsage: cpu, uptime: process.uptime(),
          heapMB: (mem.heapUsed / 1048576).toFixed(1),
          rssMB: (mem.rss / 1048576).toFixed(1),
        },
      };
      try { writeFileSync(benchmarkFile, JSON.stringify(result, null, 2)); } catch {}
      return result;
    },

    document: async () => {
      // Documentation analysis: check which files have JSDoc, exports, and descriptions
      const helpers = [...globFiles('.claude/helpers', '*.cjs'), ...globFiles('.claude/helpers', '*.mjs'), ...globFiles('.claude/helpers', '*.js')];
      const srcFiles = [...globFiles('src', '*.js'), ...globFiles('src', '*.ts'), ...globFiles('src', '*.mjs')];
      const docs = [...globFiles('docs', '*.md'), ...globFiles('docs/01-install+fixes', '*.md')];
      const undocumented = [];
      for (const f of [...helpers, ...srcFiles].slice(0, 30)) {
        try {
          const content = readFileSync(resolvePath(f), 'utf8');
          const hasJsdoc = /\/\*\*[\s\S]*?\*\//.test(content);
          const lineCount = content.split('\n').length;
          if (!hasJsdoc && lineCount > 50) {
            undocumented.push({ file: f, lines: lineCount });
          }
        } catch {}
      }
      undocumented.sort((a, b) => b.lines - a.lines);
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        sourceFiles: helpers.length + srcFiles.length,
        docFiles: docs.length,
        undocumented: undocumented.length,
        topUndocumented: undocumented.slice(0, 10),
      };
    },
  };

  app.post('/api/daemon/trigger', async (req, res) => {
    const worker = req.body?.worker;
    if (!worker || !VALID_WORKERS.has(worker)) {
      return res.status(400).json({ error: `Invalid worker. Must be one of: ${[...VALID_WORKERS].join(', ')}` });
    }

    // Helper: persist result/error to daemon-state.json
    function persistResult(output, error) {
      try {
        const ds = readJson('.claude-flow/daemon-state.json') || { workers: {} };
        if (!ds.workers) ds.workers = {};
        if (!ds.workers[worker]) ds.workers[worker] = { runCount: 0, successCount: 0, failureCount: 0, averageDurationMs: 0, isRunning: false };
        ds.workers[worker].lastTriggeredAt = new Date().toISOString();
        ds.workers[worker].runCount = (ds.workers[worker].runCount || 0) + 1;
        if (error) { ds.workers[worker].failureCount = (ds.workers[worker].failureCount || 0) + 1; ds.workers[worker].lastError = error; }
        else { ds.workers[worker].successCount = (ds.workers[worker].successCount || 0) + 1; ds.workers[worker].lastResult = output; ds.workers[worker].lastError = null; }
        writeFileSync(resolvePath('.claude-flow/daemon-state.json'), JSON.stringify(ds, null, 2));
      } catch { /* non-critical */ }
    }

    // MCP-first routing: try MCP HTTP daemon, fall back to in-process runner
    // (preload stays in-process — no MCP equivalent, just checks warm state)
    if (worker !== 'preload') {
      try {
        const result = await vizMcpCall('hooks_worker-dispatch', { worker });
        const output = JSON.stringify(result, null, 2);
        persistResult(output, null);
        return res.json({ ok: true, worker, via: 'mcp', output });
      } catch { /* MCP unavailable — fall through to in-process */ }
    }

    // In-process fallback
    const runner = IN_PROCESS_RUNNERS[worker];
    if (runner) {
      try {
        const result = await runner();
        const output = JSON.stringify(result, null, 2);
        persistResult(output, null);
        res.json({ ok: true, worker, via: 'in-process', output });
      } catch (e) {
        persistResult(null, e.message);
        res.status(500).json({ error: e.message, worker });
      }
    } else {
      res.status(400).json({ error: 'Worker not available', worker });
    }
  });

  // ─── 4c. POST /api/learning/trigger — Force-fire learning system actions ──
  // Routes through MCP HTTP daemon when available; cold bridge as fallback.

  // ── MCP HTTP daemon call helper ──────────────────────────────
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

  const LEARNING_ACTIONS = new Set([
    'sona',           // Fire SONA trajectory processing (same as post-task)
    'ewc',            // Fire EWC++ consolidation (same as session-end)
    'intelligence',   // Run intelligence.consolidate() + feedback()
    'pretrain',       // Run neural train -p coordination
    'promote',        // Promote eligible short-term patterns to long-term
    'full-cycle',     // All of the above in sequence
    'layer-L1', 'layer-L2', 'layer-L3', 'layer-L4', 'layer-L5', 'layer-L6', 'layer-L7',
    'all-layers',
  ]);

  app.post('/api/learning/trigger', async (req, res) => {
    const action = req.body?.action;
    if (!action || !LEARNING_ACTIONS.has(action)) {
      return res.status(400).json({ error: `Invalid action. Must be one of: ${[...LEARNING_ACTIONS].join(', ')}` });
    }

    const results = [];
    const root = getDataRoot();

    try {
      // Helpers: local binaries + actual daemon state location
      const ruvectorBin = join(root, 'node_modules', '.bin', 'ruvector');

      // Read daemon state from actual location (.claude-flow/daemon-state.json)
      const readDaemonState = () => {
        for (const p of [
          join(root, '.claude-flow', 'daemon-state.json'),
          join(root, '.claude-flow', 'data', 'hooks-daemon-state.json'),
        ]) {
          if (existsSync(p)) {
            try { return JSON.parse(readFileSync(p, 'utf8')); } catch {}
          }
        }
        return null;
      };

      // readIntelData removed — .ruvector/intelligence.json no longer written; use vizMcpCall('hooks_intelligence_stats')

      // Helper: run intelligence.cjs (T1 graph — fast, <200ms)
      const runIntelligence = (method) => {
        const intFile = join(root, '.claude', 'helpers', 'intelligence.cjs');
        const output = execSync(
          `node -e "const i=require('${intFile.replace(/'/g, "\\'")}');const r=i.${method}?i.${method}():null;console.log(JSON.stringify(r||{}))"`,
          { timeout: 10_000, encoding: 'utf8', cwd: root }
        );
        return output.trim();
      };

      // ── MCP-first with cold bridge fallback ──────────────────
      // Each action tries MCP HTTP daemon first; falls back to bridge on failure.

      async function mcpOrBridge(step, mcpTool, mcpArgs, bridgeFn) {
        try {
          const result = await vizMcpCall(mcpTool, mcpArgs || {});
          results.push({ step, ok: true, via: 'mcp', output: JSON.stringify(result).slice(0, 500) });
        } catch (mcpErr) {
          // MCP failed — fall back to cold bridge
          try {
            const bridge = await getBridge();
            const fn = bridge[bridgeFn];
            if (typeof fn === 'function') {
              const result = await fn();
              results.push({ step, ok: true, via: 'bridge-fallback', output: JSON.stringify(result).slice(0, 500) });
            } else {
              results.push({ step, ok: false, error: `MCP: ${mcpErr.message}. Bridge: ${bridgeFn} not found` });
            }
          } catch (bridgeErr) {
            results.push({ step, ok: false, error: `MCP: ${mcpErr.message}. Bridge: ${bridgeErr.message}` });
          }
        }
      }

      // Full-cycle order: Seed → Learn → Protect → Consolidate → Promote
      if (action === 'pretrain' || action === 'full-cycle') {
        await mcpOrBridge('pretrain', 'hooks_pretrain', {}, 'bridgePatternPromote');
      }

      if (action === 'sona' || action === 'full-cycle') {
        await mcpOrBridge('sona', 'hooks_intelligence_learn', {}, 'bridgePatternPromote');
        // Neural adaptation pipeline (embeddings_neural)
        try {
          const adapt = await vizMcpCall('embeddings_neural', { action: 'adapt' });
          results.push({ step: 'neural-adapt', ok: true, via: 'mcp', output: JSON.stringify(adapt).slice(0, 500) });
        } catch (e) {
          results.push({ step: 'neural-adapt', ok: false, error: e.message });
        }
        try {
          const cons = await vizMcpCall('embeddings_neural', { action: 'consolidate' });
          results.push({ step: 'neural-consolidate', ok: true, via: 'mcp', output: JSON.stringify(cons).slice(0, 500) });
        } catch (e) {
          results.push({ step: 'neural-consolidate', ok: false, error: e.message });
        }
      }

      if (action === 'ewc' || action === 'full-cycle') {
        await mcpOrBridge('ewc', 'agentdb_consolidate', {}, 'bridgeEWCConsolidate');
      }

      if (action === 'intelligence' || action === 'full-cycle') {
        // Intelligence: T1 graph — fast, local, no MCP needed
        try {
          const fb = runIntelligence('feedback');
          const cons = runIntelligence('consolidate');
          results.push({ step: 'intelligence', ok: true, via: 'local', output: JSON.stringify({ feedback: fb, consolidate: cons }) });
        } catch (e) {
          results.push({ step: 'intelligence', ok: false, error: e.message });
        }
      }

      if (action === 'promote' || action === 'full-cycle') {
        await mcpOrBridge('promote', 'agentdb_consolidate', {}, 'bridgePromotionSweep');
      }

      // ── Layer-specific actions ──
      const layerMcpMap = {
        'layer-L1': { mcp: 'agentdb_consolidate', bridge: 'bridgePatternPromote' },
        'layer-L2': { mcp: 'agentdb_consolidate', bridge: 'bridgeSQLConsolidate' },
        'layer-L3': { mcp: 'agentdb_consolidate', bridge: 'bridgePromotionSweep' },
        'layer-L4': { mcp: 'agentdb_consolidate', bridge: 'bridgeConsolidationSweep' },
        'layer-L5': { mcp: 'agentdb_consolidate', bridge: 'bridgeReasoningStore' },
        'layer-L6': { mcp: 'agentdb_consolidate', bridge: 'bridgeEWCConsolidate' },
        'layer-L7': { mcp: 'agentdb_consolidate', bridge: 'bridgeSkillExtract' },
      };

      if (action.startsWith('layer-') && layerMcpMap[action]) {
        const { mcp, bridge } = layerMcpMap[action];
        await mcpOrBridge(action, mcp, { layer: action.replace('layer-', '') }, bridge);
      }

      if (action === 'all-layers') {
        for (const [layer, { mcp, bridge }] of Object.entries(layerMcpMap)) {
          await mcpOrBridge(layer, mcp, { layer: layer.replace('layer-', '') }, bridge);
        }
      }

      // ── Full-cycle: run all 7 layers at the end ──
      if (action === 'full-cycle') {
        for (const [layer, { mcp, bridge }] of Object.entries(layerMcpMap)) {
          await mcpOrBridge(layer, mcp, { layer: layer.replace('layer-', '') }, bridge);
        }
      }

      const allOk = results.every(r => r.ok);
      res.json({ ok: allOk, action, results, timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: err.message, action, results });
    }
  });

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
