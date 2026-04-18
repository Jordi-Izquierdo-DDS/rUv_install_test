// ═══════════════════════════════════════════════════════════════
// Edge Discovery — derive ALL edges from reality, zero manual entries
//
// Sources:
//   1. settings.json → fires + configures edges
//   2. hook-handler.cjs source → loads/calls edges (safeRequire + fireBridge)
//   3. hook-bridge.cjs source → calls edges (queue + bridge)
//   4. BRIDGE_TO_CONTROLLER → bridge→controller calls
//   5. Controller runtime properties → ctrl→ctrl uses
//   6. Controller hasDb → ctrl→db writes/reads
//   7. .mcp.json → service configures
//   8. Viz self-reference → viz→engine calls/reads
// ═══════════════════════════════════════════════════════════════

import { existsSync, readFileSync, writeFileSync, statSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { EXPECTED_EDGES } from './edge-registry.js';
import { getCachedStatusMap } from './controller-status.js';

const DATA_ROOT = process.env.DATA_ROOT || process.cwd();
const CACHE_PATH = resolve(DATA_ROOT, '.claude-flow/data/discovered-edges.json');

// Source files to watch — if any changed, re-discover
const WATCH_SOURCES = [
  '.claude/settings.json',
  '.claude/helpers/hook-handler.cjs',
  '.claude/helpers/hook-bridge.cjs',
  '.claude/helpers/auto-memory-hook.mjs',
  '.claude/helpers/daemon-manager.sh',
  '.claude/helpers/sona-hook-handler.mjs',
  '.claude/helpers/ruvector-ipc-client.mjs',
  '.claude/helpers/ruvector-runtime-daemon.mjs',
  '.mcp.json',
];

let _cachedEdges = null;
let _cacheSourceMtimes = null;

function readJson(relPath) {
  try {
    const fp = resolve(DATA_ROOT, relPath);
    if (!existsSync(fp)) return null;
    return JSON.parse(readFileSync(fp, 'utf8'));
  } catch { return null; }
}

function readFile(relPath) {
  try {
    const fp = resolve(DATA_ROOT, relPath);
    if (!existsSync(fp)) return null;
    return readFileSync(fp, 'utf8');
  } catch { return null; }
}

// Bridge function → controller mapping (from install team spec 13_controller_map.md)
// This is the one external input — bridge source is compiled, can't reliably parse.
// Updated when install team changes bridge routing.
const BRIDGE_TO_CONTROLLER = {
  bridgeStoreEntry:          null,
  bridgeHierarchicalStore:   'hierarchicalMemory',
  bridgeHierarchicalRecall:  'hierarchicalMemory',
  bridgeConsolidate:         'memoryConsolidation',
  bridgeRecordCausalEdge:    'causalGraph',
  bridgeStorePattern:        'reasoningBank',
  bridgeSearchPatterns:      'reasoningBank',
  bridgeRecordFeedback:      'learningSystem',
  bridgeSessionStart:        'reflexion',
  bridgeSessionEnd:          'nightlyLearner',
  bridgeRouteTask:           'semanticRouter',
  bridgeCache:               'tieredCache',
  bridgeSearch:              'hybridSearch',
  bridgeExplainableRecall:   'explainableRecall',
  bridgeLearningSystem:      'learningSystem',
  bridgeContextSynthesize:   'contextSynthesizer',
  bridgeRunAllLayers:        null,
};

// Event name → node ID
const EVENT_ID_MAP = {
  PreToolUse: 'evt_pre_tool_use', PostToolUse: 'evt_post_tool_use',
  PostToolUseFailure: 'evt_post_tool_fail',
  SessionStart: 'evt_session_start', SessionEnd: 'evt_session_end',
  UserPromptSubmit: 'evt_user_prompt', Stop: 'evt_stop',
  PreCompact: 'evt_pre_compact',
  SubagentStart: 'evt_subagent_start', SubagentStop: 'evt_subagent_stop',
  Notification: 'evt_notification',
};

// Script filename → node ID (derived from filename, same as discoverNodes)
function scriptId(filename) {
  const isShell = filename.endsWith('.sh');
  const basename = filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_');
  return (isShell ? 'scr_' : 'eng_') + basename;
}

// Controller camelCase → ctrl_snake_case
function ctrlId(name) {
  return 'ctrl_' + name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

// ═══════════════════════════════════════════════════════════════

// Check if any source file changed since last discovery
function sourcesChanged() {
  const current = {};
  for (const p of WATCH_SOURCES) {
    try { current[p] = statSync(resolve(DATA_ROOT, p)).mtimeMs; } catch { current[p] = 0; }
  }
  if (!_cacheSourceMtimes) return { changed: true, mtimes: current };
  for (const p of WATCH_SOURCES) {
    if (current[p] !== _cacheSourceMtimes[p]) return { changed: true, mtimes: current };
  }
  return { changed: false, mtimes: current };
}

// Force next call to re-discover (called by rescan)
export function invalidateEdgeCache() {
  _cachedEdges = null;
  _cacheSourceMtimes = null;
}

// Single entry point — returns the full merged edge list (static registry + dynamically parsed).
// Consumers should call this instead of importing EXPECTED_EDGES directly so the
// static-vs-dynamic split stays a private implementation detail of this module.
export function getAllEdges(discoveredNodes) {
  return [...EXPECTED_EDGES, ...discoverEdges(discoveredNodes)];
}

// Accept discovered nodes so we can derive worker list, not hardcode it.
// Controller runtime status comes from the composite cache (controller-status.js)
// accessed internally — no parameter needed.
export function discoverEdges(discoveredNodes) {
  // Return cached edges if source files haven't changed
  const { changed, mtimes } = sourcesChanged();
  if (!changed && _cachedEdges) return _cachedEdges;

  const result = _discoverEdgesImpl(discoveredNodes);

  // Cache in memory + persist to disk
  _cachedEdges = result;
  _cacheSourceMtimes = mtimes;
  try {
    const dir = dirname(CACHE_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(CACHE_PATH, JSON.stringify({ edges: result, mtimes, ts: Date.now() }));
  } catch {}

  return result;
}

// Load from disk cache on first call (cold start)
try {
  if (existsSync(CACHE_PATH)) {
    const cached = JSON.parse(readFileSync(CACHE_PATH, 'utf8'));
    if (cached.edges && cached.mtimes) {
      _cachedEdges = cached.edges;
      _cacheSourceMtimes = cached.mtimes;
    }
  }
} catch {}

function _discoverEdgesImpl(discoveredNodes) {
  // Controller runtime status — shared composite cache (populated by controller-status.js)
  const controllerStatus = getCachedStatusMap();
  const edges = [];
  const seen = new Set();

  function add(sourceId, targetId, type, label) {
    const key = `${sourceId}→${targetId}→${type}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ sourceId, targetId, type, label: label || '', discovered: true });
  }

  // ── 1. settings.json → fires + configures ────────────────────
  const settings = readJson('.claude/settings.json');
  if (settings?.hooks) {
    for (const [eventName, hookGroups] of Object.entries(settings.hooks)) {
      const eventId = EVENT_ID_MAP[eventName] || `evt_${eventName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

      // configures: settings.json configures each trigger
      add('cfg_settings', eventId, 'configures', `${eventName} hook config`);

      for (const group of hookGroups) {
        const hooks = group.hooks || [group];
        for (const hook of hooks) {
          if (!hook.command) continue;
          // Extract script paths from command
          const matches = hook.command.match(/\.claude\/helpers\/([a-zA-Z0-9._-]+\.(sh|js|cjs|mjs))/g) || [];
          const relMatches = hook.command.match(/helpers\/([a-zA-Z0-9._-]+\.(sh|js|cjs|mjs))/g) || [];
          const scripts = [...matches, ...relMatches.map(m => `.claude/${m}`)];
          for (const scriptPath of scripts) {
            const name = scriptPath.split('/').pop();
            const targetId = scriptId(name);
            add(eventId, targetId, 'fires', `${eventName} hook`);
          }
        }
      }
    }
  }

  // ── 1b. MCP-first architecture edges (v5) ──────────────────
  // hook-handler calls MCP daemon (primary) or coldFallback (when !_mcp)
  const handlerSrcPeek = readFile('.claude/helpers/hook-handler.cjs');
  if (handlerSrcPeek) {
    if (handlerSrcPeek.includes('callMcp')) {
      add('eng_hook_handler', 'svc_mcp_http', 'calls', 'callMcp() (primary path)');
    }
    if (handlerSrcPeek.includes('coldFallback')) {
      add('eng_hook_handler', 'eng_cold_fallback', 'calls', 'coldFallback() (when !_mcp)');
      add('eng_cold_fallback', 'eng_memory_bridge', 'calls', 'lazy bridge import');
    }
  }
  // MCP HTTP daemon → all controllers (warm access)
  const MCP_TO_CTRL = {
    'agentdb_feedback': ['learningSystem', 'reasoningBank'],
    'agentdb_hierarchical-store': ['hierarchicalMemory'],
    'agentdb_hierarchical-recall': ['hierarchicalMemory', 'tieredCache'],
    'agentdb_consolidate': ['memoryConsolidation', 'nightlyLearner'],
    'agentdb_session-start': ['reflexion'],
    'agentdb_session-end': ['nightlyLearner'],
    'agentdb_context-synthesize': ['contextSynthesizer', 'hybridSearch'],
    'agentdb_causal-edge': ['causalGraph'],
    'agentdb_pattern-search': ['reasoningBank'],
    'hooks_intelligence_trajectory-start': ['sonaTrajectory'],
    'hooks_intelligence_trajectory-step': ['sonaTrajectory'],
    'hooks_intelligence_trajectory-end': ['sonaTrajectory'],
    'hooks_intelligence_learn': ['sonaTrajectory', 'learningSystem'],
    'hooks_intelligence_pattern-store': ['reasoningBank'],
    'hooks_model-outcome': ['semanticRouter'],
    'hooks_model-route': ['semanticRouter', 'gnnService'],
    'embeddings_generate': ['vectorBackend'],
  };
  const mcpCtrlsSeen = new Set();
  for (const ctrls of Object.values(MCP_TO_CTRL)) {
    for (const c of ctrls) {
      if (mcpCtrlsSeen.has(c)) continue;
      mcpCtrlsSeen.add(c);
      add('svc_mcp_http', ctrlId(c), 'uses', `warm controller access`);
    }
  }

  // ── 2. hook-handler.cjs → loads/calls edges ──────────────────
  const handlerSrc = readFile('.claude/helpers/hook-handler.cjs');
  if (handlerSrc) {
    // safeRequire calls → loads edges
    const requireMatches = handlerSrc.matchAll(/safeRequire\(path\.join\(helpersDir,\s*'([^']+)'\)\)/g);
    for (const m of requireMatches) {
      const targetId = scriptId(m[1]);
      add('eng_hook_handler', targetId, 'calls', `safeRequire('${m[1]}')`);
    }
    // require('./hook-bridge.cjs') → calls
    if (handlerSrc.includes("require('./hook-bridge.cjs')")) {
      add('eng_hook_handler', 'eng_hook_bridge', 'calls', 'require hook-bridge');
    }
    // fireBridge calls → hook-handler calls bridge functions → calls to memory-bridge
    const fireBridgeMatches = handlerSrc.matchAll(/fireBridge\('([^']+)'/g);
    const bridgeFns = new Set();
    for (const m of fireBridgeMatches) bridgeFns.add(m[1]);
    if (bridgeFns.size > 0) {
      add('eng_hook_handler', 'eng_memory_bridge', 'calls', `fireBridge (${bridgeFns.size} functions)`);
    }
    // hook-handler writes to hook-queue.jsonl
    if (handlerSrc.includes('hook-queue.jsonl') || handlerSrc.includes('_queuePath')) {
      add('eng_hook_handler', 'store_hook_queue', 'writes', 'appendFileSync per event');
    }
    // hook-handler reads/writes session state
    if (handlerSrc.includes('current-session.json')) {
      add('eng_hook_handler', 'json_hook_session', 'reads', 'session state');
      add('eng_hook_handler', 'json_hook_session', 'writes', 'session state');
    }
    // hook-handler writes to memory.db
    if (handlerSrc.includes('memory.db') || bridgeFns.size > 0) {
      add('eng_hook_handler', 'db_memory', 'writes', 'via bridge');
    }
    // intelligence writes
    if (handlerSrc.includes('intelligence')) {
      add('eng_hook_handler', 'eng_intelligence', 'calls', 'safeRequire intelligence');
      // intelligence.cjs writes to these stores
      add('eng_intelligence', 'json_graph_state', 'writes', 'graph state persistence');
      add('eng_intelligence', 'json_graph_state', 'reads', 'graph state load');
      add('eng_intelligence', 'json_ranked_context', 'writes', 'ranked context');
      add('eng_intelligence', 'json_ranked_context', 'reads', 'ranked context');
    }
  }

  // ── 3. hook-bridge.cjs → calls edges ─────────────────────────
  const bridgeSrc = readFile('.claude/helpers/hook-bridge.cjs');
  if (bridgeSrc) {
    // queue() calls → which bridge functions are queued
    const queueMatches = bridgeSrc.matchAll(/queue\('([^']+)'/g);
    for (const m of queueMatches) {
      const fn = m[1];
      const ctrl = BRIDGE_TO_CONTROLLER[fn];
      if (ctrl) {
        add('eng_memory_bridge', ctrlId(ctrl), 'calls', fn);
      }
    }
    // Direct bridge calls (await bridge.X)
    const directMatches = bridgeSrc.matchAll(/bridge\.(\w+)\?\.\(/g);
    for (const m of directMatches) {
      const fn = m[1];
      const ctrl = BRIDGE_TO_CONTROLLER[fn];
      if (ctrl) {
        add('eng_memory_bridge', ctrlId(ctrl), 'calls', fn);
      }
    }
    // hook-bridge → memory-bridge calls
    add('eng_auto_memory', 'eng_memory_bridge', 'calls', 'bridge import');
    // hook-bridge writes session state
    if (bridgeSrc.includes('current-session.json')) {
      add('eng_auto_memory', 'json_hook_session', 'writes', 'saveState');
    }
  }

  // ── 4. auto-memory-hook.mjs → calls/writes ──────────────────
  const autoMemSrc = readFile('.claude/helpers/auto-memory-hook.mjs');
  if (autoMemSrc) {
    if (autoMemSrc.includes('auto-memory-store.json')) {
      add('eng_auto_memory', 'json_auto_memory', 'reads', 'import entries');
      add('eng_auto_memory', 'json_auto_memory', 'writes', 'sync entries');
    }
    if (autoMemSrc.includes('intelligence')) {
      add('eng_auto_memory', 'eng_intelligence', 'calls', 'intelligence bridge');
    }
  }

  // ── 5. Bridge→controller calls (from mapping) ───────────────
  for (const [fn, ctrlName] of Object.entries(BRIDGE_TO_CONTROLLER)) {
    if (!ctrlName) continue;
    add('eng_memory_bridge', ctrlId(ctrlName), 'calls', fn);
  }
  // Bridge writes to memory.db
  add('eng_memory_bridge', 'db_memory', 'writes', 'ControllerRegistry → AgentDB');

  // ── 6. Controller runtime → ctrl→db_memory writes/reads ──
  // Every non-broken controller reads and writes memory.db through the bridge.
  // (Cross-reference detection was dropped along with the old runtime probe —
  // without reflection on live class instances we can't derive ctrl→ctrl uses.)
  if (controllerStatus?.size > 0) {
    for (const [name, entry] of controllerStatus) {
      if (entry.status === 'broken') continue;
      const srcId = ctrlId(name);
      add(srcId, 'db_memory', 'writes', `${name} → tables`);
      add(srcId, 'db_memory', 'reads',  `${name} queries`);
    }
  }

  // ── 7. .mcp.json → service configures ───────────────────────
  const mcp = readJson('.mcp.json');
  if (mcp?.mcpServers) {
    add('cfg_mcp', 'cfg_mcp', 'configures', ''); // self-ref removed below
    for (const name of Object.keys(mcp.mcpServers)) {
      const svcId = `svc_${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
      add('cfg_mcp', svcId, 'configures', `${name} MCP config`);
      // MCP services read/write memory.db via bridge
      add(svcId, 'eng_memory_bridge', 'calls', `MCP → bridge`);
      add(svcId, 'db_memory', 'reads', `${name} queries`);
      add(svcId, 'db_memory', 'writes', `${name} writes`);
    }
  }

  // ── 8. Config files → configures edges (code-defined relationships) ──
  add('cfg_embeddings', 'eng_memory_bridge', 'configures', 'ONNX model config');
  add('cfg_embeddings', 'mdl_onnx', 'configures', 'embedding dimensions');
  add('cfg_config_yaml', 'svc_claude_flow', 'configures', 'runtime config');
  add('sql_schema', 'db_memory', 'configures', 'table schema');
  add('cfg_claude_md', 'cfg_settings', 'configures', 'project config');

  // ── 9. Daemon manager → sub-daemons ─────────────────────────
  const daemonSrc = readFile('.claude/helpers/daemon-manager.sh');
  if (daemonSrc) {
    if (daemonSrc.includes('swarm-monitor')) {
      add('eng_daemon_manager', 'eng_swarm_monitor', 'calls', 'start/stop swarm-monitor');
    }
    if (daemonSrc.includes('metrics-db') || daemonSrc.includes('metrics-daemon')) {
      add('eng_daemon_manager', 'eng_metrics_db', 'calls', 'start/stop metrics-daemon');
    }
  }

  // ── 10. Daemon outputs ──────────────────────────────────────
  add('eng_swarm_monitor', 'json_metrics', 'writes', 'swarm-activity.json');
  add('eng_metrics_db', 'json_metrics', 'writes', 'metrics collection');

  // ── 11. Viz self-reference (REMOVED) ────────────────────────
  // Viz infrastructure is an external observer and excluded from the graph.

  // ── 12. CLI tools → workers ─────────────────────────────────
  // Workers from discovered nodes — no hardcoded list
  const workers = (discoveredNodes || []).filter(n => n.type === 'worker');
  for (const w of workers) {
    add('eng_cli_tools', w.id, 'calls', `ruflo ${w.id.replace('wrk_', '')}`);
  }
  // Ingest worker reads hook-queue, writes via bridge
  add('wrk_ingest', 'eng_memory_bridge', 'calls', 'bridge functions with warm ONNX');

  // ── 13. Learning service → patterns.db ──────────────────────
  add('eng_learning_service', 'store_patterns_db', 'writes', 'pattern storage');
  add('eng_learning_service', 'store_patterns_db', 'reads', 'pattern queries');

  // ── 14. Intelligence engine → store relationships ─────────
  const intelSrc = readFile('.claude/helpers/intelligence.cjs');
  if (intelSrc) {
    for (const [pattern, nodeId] of [
      ['auto-memory-store', 'json_auto_memory'],
      ['current-session', 'json_current_session'],
      ['intelligence-snapshot', 'json_intelligence_snapshot'],
      ['pending-insights', 'json_pending_insights'],
    ]) {
      if (intelSrc.includes(pattern)) {
        add('eng_intelligence', nodeId, 'writes', pattern);
        add('eng_intelligence', nodeId, 'reads', pattern);
      }
    }
  }

  // ── 15. Session engine → session store ───────────────────────
  add('eng_session', 'json_current_session', 'reads', 'restore state');
  add('eng_session', 'json_current_session', 'writes', 'save state');

  // ── 16. Settings configures non-trigger targets ──────────────
  if (settings?.statusLine) add('cfg_settings', 'eng_statusline', 'configures', 'statusLine command');
  add('cfg_settings', 'eng_statusline_hook', 'configures', 'statusLine hook');
  add('cfg_settings', 'scr_github_setup', 'configures', 'onboarding script');
  add('cfg_settings', 'scr_setup_mcp', 'configures', 'MCP setup');
  add('cfg_settings', 'scr_quick_start', 'configures', 'quickstart guide');
  add('cfg_settings', 'eng_cli_tools', 'configures', 'daemon workers + schedules');

  // ── 17. Ruvector service → specific stores ───────────────────
  add('svc_ruvector', 'db_ruvector', 'reads', 'brain/edge query');
  add('svc_ruvector', 'db_ruvector', 'writes', 'brain/edge store');
  add('svc_ruvector', 'json_ruvector_hooks', 'reads', 'hooks config');
  add('svc_ruvector', 'json_ruvector_hooks', 'writes', 'hooks data');
  add('json_ruvector_hooks', 'svc_ruvector', 'configures', 'Q-learning params');
  add('svc_ruvector', 'bin_hnsw_index', 'uses', 'HNSW vector index');
  add('svc_ruvector', 'mdl_onnx', 'uses', 'ONNX embedding 384D');

  // ── 18. Worker → store outputs ───────────────────────────────
  // Specific worker outputs (from worker source analysis — these are code-defined relationships)
  add('wrk_ingest', 'store_hook_queue', 'reads', 'drain queue');
  add('wrk_ingest', 'eng_memory_bridge', 'calls', 'bridge functions with warm ONNX');
  add('wrk_map', 'json_graph_state', 'writes', 'codebase map');
  add('wrk_audit', 'json_security_audit', 'writes', 'vuln report');
  add('wrk_consolidate', 'store_patterns_db', 'writes', 'pattern extraction');
  add('wrk_consolidate', 'json_graph_state', 'writes', 'consolidate graph');
  add('wrk_consolidate', 'json_auto_memory', 'writes', 'consolidate memory');
  add('wrk_consolidate', 'bin_hnsw_index', 'writes', 'getHNSWIndex({ forceRebuild })');
  add('wrk_preload', 'mdl_onnx', 'uses', 'warm ONNX');
  add('wrk_preload', 'bin_hnsw_index', 'reads', 'warm HNSW');

  // ── 19. Statusline engine ────────────────────────────────────
  add('eng_statusline', 'db_memory', 'reads', 'memory size');
  add('eng_statusline_hook', 'eng_statusline', 'calls', 'shell wrapper');

  // ── 20. Pattern consolidator (L2 removed — session-end now via warm daemon) ──
  // add('eng_hook_handler', 'scr_pattern_consolidator', 'calls', ...); // REMOVED: L2 layer deleted
  // add('scr_pattern_consolidator', 'store_patterns_db', 'writes', ...); // REMOVED: now via agentdb_session-end MCP

  // ── 21. Viz helpers → config reads (REMOVED) ────────────────
  // Viz infrastructure is an external observer and excluded from the graph.

  // ── 22. SONA daemon (Process 3) — discover edges from source ── // does not work yet
  const sonaSrc = readFile('.claude/helpers/sona-hook-handler.mjs');
  const daemonRtSrc = readFile('.claude/helpers/ruvector-runtime-daemon.mjs');
  const ipcSrc = readFile('.claude/helpers/ruvector-ipc-client.mjs');

  // 22a. sona-hook-handler.mjs → discover all sendCommand() calls + MCP calls
  if (sonaSrc) {
    // Discover IPC: all sendCommand({command: 'X'}) calls
    if (sonaSrc.includes('sendCommand')) {
      add('eng_sona_hook_handler', 'eng_ruvector_ipc_client', 'calls', 'sendCommand()');
      // Extract each command name sent via IPC
      const ipcCmds = sonaSrc.matchAll(/sendCommand\(\{\s*command:\s*'([^']+)'/g);
      for (const m of ipcCmds) {
        add('eng_sona_hook_handler', 'svc_sona_daemon', 'calls', 'IPC: ' + m[1]);
      }
    }

    // Discover MCP: all callMcp('tool_name') or agentdb_ references
    const mcpCalls = sonaSrc.matchAll(/callMcp\(\s*'([^']+)'/g);
    for (const m of mcpCalls) {
      add('eng_sona_hook_handler', 'svc_mcp_http', 'calls', m[1]);
    }

    // Discover file I/O: any path patterns in the source
    const pathRefs = sonaSrc.matchAll(/(?:readFileSync|writeFileSync|existsSync|mkdirSync)\(\s*(?:[^,)]*?['"]([^'"]+)['"]|(\w+Path))/g);
    for (const m of pathRefs) {
      const ref = m[1] || m[2];
      if (ref?.includes('sona-trajectories')) {
        add('eng_sona_hook_handler', 'json_sona_trajectories', 'writes', 'trajectory metadata');
        add('eng_sona_hook_handler', 'json_sona_trajectories', 'reads', 'trajectory metadata');
      }
    }
  }

  // 22b. ruvector-ipc-client.mjs → discover socket/spawn
  if (ipcSrc) {
    // Socket path
    const sockMatch = ipcSrc.match(/SOCKET_PATH\s*=\s*'([^']+)'/);
    if (sockMatch) {
      add('eng_ruvector_ipc_client', 'svc_sona_daemon', 'calls', 'Unix socket: ' + sockMatch[1]);
    }
    // Daemon spawn
    if (ipcSrc.includes('spawn')) {
      add('eng_ruvector_ipc_client', 'svc_sona_daemon', 'calls', 'ensureDaemon() auto-start');
    }
  }

  // 22c. ruvector-runtime-daemon.mjs → discover all imports + IPC commands
  if (daemonRtSrc) {
    // Discover npm imports → component edges
    const imports = daemonRtSrc.matchAll(/import\(\s*'([^']+)'\s*\)|require\(\s*'([^']+)'\s*\)/g);
    for (const m of imports) {
      const pkg = m[1] || m[2];
      if (pkg === '@ruvector/sona') add('svc_sona_daemon', 'eng_sona_engine', 'uses', 'Rust NAPI SonaEngine');
      if (pkg === 'ruvector') add('svc_sona_daemon', 'eng_adaptive_embedder', 'uses', 'AdaptiveEmbedder + LoRA');
      if (pkg === '@xenova/transformers') add('svc_sona_daemon', 'mdl_onnx', 'uses', 'ONNX 384-dim pipeline');
    }

    // Discover file I/O → store edges
    if (daemonRtSrc.includes('sona-state.json')) {
      add('svc_sona_daemon', 'json_sona_state', 'writes', 'saveState()');
      add('svc_sona_daemon', 'json_sona_state', 'reads', 'loadState()');
    }

    // Discover IPC command handlers → engine calls (parse the switch/case block)
    const cmdCases = daemonRtSrc.matchAll(/case\s+'(\w+)':\s*return\s+(?:await\s+)?(\w+)\(/g);
    for (const m of cmdCases) {
      add('svc_sona_daemon', 'eng_sona_engine', 'calls', 'IPC: ' + m[1] + ' → ' + m[2] + '()');
    }

    // Discover sona.METHOD() calls → engine internal edges
    const sonaCalls = daemonRtSrc.matchAll(/sona\.(\w+)\(/g);
    const sonaMethodsSeen = new Set();
    for (const m of sonaCalls) {
      if (sonaMethodsSeen.has(m[1])) continue;
      sonaMethodsSeen.add(m[1]);
      add('svc_sona_daemon', 'eng_sona_engine', 'calls', 'sona.' + m[1] + '()');
    }

    // Discover embedder.METHOD() calls → embedder edges
    const embedCalls = daemonRtSrc.matchAll(/embedder\.(\w+)\(/g);
    const embedMethodsSeen = new Set();
    for (const m of embedCalls) {
      if (embedMethodsSeen.has(m[1])) continue;
      embedMethodsSeen.add(m[1]);
      add('svc_sona_daemon', 'eng_adaptive_embedder', 'calls', 'embedder.' + m[1] + '()');
    }
  }

  // 22d. SonaEngine internal component edges
  add('eng_sona_engine', 'eng_ewc_pp', 'uses', 'EWC++ constraints');
  add('eng_sona_engine', 'eng_micro_lora', 'uses', 'weight updates');
  add('eng_sona_engine', 'eng_reasoning_bank', 'uses', 'pattern extraction');

  // Remove self-referential edges
  return edges.filter(e => e.sourceId !== e.targetId);
}
