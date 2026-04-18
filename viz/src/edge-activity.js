// ═══════════════════════════════════════════════════════════════
// Edge Activity Detection — 3-layer waterfall
//
// Layer 1: hook-queue.jsonl + learning-activity.jsonl (precise)
// Layer 2: hook-activity.jsonl (hook-handler's own activity log)
// Layer 3: Filesystem polling — mtimes, daemon logs, processes (universal)
//
// Observation-only. Reads existing traces, never modifies the system.
// ═══════════════════════════════════════════════════════════════

import { existsSync, statSync, readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';

const DATA_ROOT = process.env.DATA_ROOT || process.cwd();
const FIVE_MIN = 300000;
const ONE_HOUR = 3600000;
const TWO_HOURS = 7200000;

// ── Bridge function → controller mapping (from install team spec) ──
const BRIDGE_TO_CONTROLLER = {
  bridgeStoreEntry:          null,                  // direct SQL, no controller
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
  bridgeTrajectory:          'sonaTrajectory',
  bridgeLearning:            'learningSystem',
  bridgeCache:               'tieredCache',
  bridgeSearch:              'hybridSearch',
  bridgeExplainableRecall:   'explainableRecall',
  bridgeLearningSystem:      'learningSystem',
  bridgeContextSynthesize:   'contextSynthesizer',
};

// ── MCP tool → controller mapping (MCP-first architecture v5) ──
const MCP_TO_CONTROLLER = {
  'agentdb_feedback':                     ['learningSystem', 'reasoningBank'],
  'agentdb_hierarchical-store':           ['hierarchicalMemory'],
  'agentdb_hierarchical-recall':          ['hierarchicalMemory', 'tieredCache'],
  'agentdb_consolidate':                  ['memoryConsolidation', 'nightlyLearner'],
  'agentdb_session-start':                ['reflexion'],
  'agentdb_session-end':                  ['nightlyLearner'],
  'agentdb_context-synthesize':           ['contextSynthesizer', 'hybridSearch'],
  'agentdb_causal-edge':                  ['causalGraph'],
  'agentdb_pattern-search':               ['reasoningBank'],
  'hooks_intelligence_trajectory-start':  ['sonaTrajectory'],
  'hooks_intelligence_trajectory-step':   ['sonaTrajectory'],
  'hooks_intelligence_trajectory-end':    ['sonaTrajectory'],
  'hooks_intelligence_learn':             ['sonaTrajectory', 'learningSystem'],
  'hooks_intelligence_pattern-store':     ['reasoningBank'],
  'hooks_model-outcome':                  ['semanticRouter'],
  'hooks_model-route':                    ['semanticRouter', 'gnnService'],
  'embeddings_generate':                  ['vectorBackend'],
  'sona_judge':                           ['reasoningBank'],
  'adaptive_embed_learn':                 ['semanticRouter'],
  'hooks_intelligence_pattern-search':    ['reasoningBank'],
};

// ── Learning action → edge mapping ──
const LEARNING_ACTION_MAP = {
  pattern_store:           { src: 'eng_learning_service', tgt: 'store_patterns_db' },
  intelligence_consolidate:{ src: 'eng_intelligence', tgt: 'json_graph_state' },
  sona_trajectory:         { src: 'svc_ruvector', tgt: 'json_ruvector_hooks' },
  ewc_consolidation:       { src: 'eng_ewc_consolidation', tgt: null },
  cross_tier_bridge:       { src: 'eng_hook_handler', tgt: 'store_patterns_db' },
};

// ── Trigger event → ID mapping ──
const TRIGGER_ID_MAP = {
  SessionStart: 'evt_session_start', SessionEnd: 'evt_session_end',
  PreToolUse: 'evt_pre_tool_use', PostToolUse: 'evt_post_tool_use',
  PostToolUseFailure: 'evt_post_tool_fail', UserPromptSubmit: 'evt_user_prompt',
  Stop: 'evt_stop', PreCompact: 'evt_pre_compact',
  SubagentStart: 'evt_subagent_start', SubagentStop: 'evt_subagent_stop',
  Notification: 'evt_notification',
  // Hook-handler command names (from hook-activity.jsonl)
  'post-edit': 'evt_post_tool_use', 'post-task': 'evt_post_tool_use',
  'post-tool': 'evt_post_tool_use', route: 'evt_user_prompt',
  'session-restore': 'evt_session_start', 'session-stop': 'evt_stop',
  'session-end': 'evt_session_end', notify: 'evt_notification',
  'compact-manual': 'evt_pre_compact', 'compact-auto': 'evt_pre_compact',
  status: 'evt_notification',
  // SONA hook-handler command names (Process 3)
  'sona-load': 'evt_session_start', 'sona-route': 'evt_user_prompt',
  'sona-record-step': 'evt_post_tool_use', 'sona-save': 'evt_session_end',
};

// Helper: controller camelCase → ctrl_snake_case ID
function ctrlId(name) {
  if (!name) return null;
  return 'ctrl_' + name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

// Helper: safe JSON read
function readJson(relPath) {
  try {
    const fp = resolve(DATA_ROOT, relPath);
    if (!existsSync(fp)) return null;
    return JSON.parse(readFileSync(fp, 'utf8'));
  } catch { return null; }
}

// Helper: safe stat
function safeStat(relPath) {
  try {
    const fp = resolve(DATA_ROOT, relPath);
    if (!existsSync(fp)) return null;
    return statSync(fp);
  } catch { return null; }
}

// Helper: check if timestamp is recent
function isRecent(ts, window = ONE_HOUR) {
  return ts > 0 && (Date.now() - ts) < window;
}

// ═══════════════════════════════════════════════════════════════
// Activity cache — gathered once per request cycle, shared across edges
// ═══════════════════════════════════════════════════════════════

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 30000; // 30s

export function gatherActivity() {
  const now = Date.now();
  if (_cache && (now - _cacheTime) < CACHE_TTL) return _cache;

  const activity = {
    // Layer 1
    bridgeCalls: new Map(),      // bridgeFn → lastTs
    learningEvents: new Map(),   // action → lastTs
    sessionStepCount: 0,
    mcpToolCalls: new Map(),     // mcpToolName → lastTs (MCP-first v5)

    // Layer 2
    hookEvents: new Map(),       // eventName → lastTs
    scriptsCalled: new Set(),    // script basenames
    mcpCalls: new Set(),         // MCP server prefixes

    // Layer 3
    storeMtimes: new Map(),      // relPath → mtimeMs
    daemonEvents: new Map(),     // name → lastTs
    daemonState: null,           // hooks-daemon-state.json contents
    cliState: null,              // daemon-state.json contents
  };

  // ── Layer 1: direct-import bridge activity ─────────────────
  // Direct-import: hooks call bridge directly (no hook-queue.jsonl).
  // Detect from: memory.db mtime, current-session.json mtime, last-edit.json mtime.
  try {
    const bridgeFns = [
      'bridgeStoreEntry', 'bridgeHierarchicalStore', 'bridgeConsolidate',
      'bridgeRecordCausalEdge', 'bridgeStorePattern', 'bridgeSearchPatterns',
      'bridgeRecordFeedback', 'bridgeRouteTask', 'bridgeCache',
      'bridgeSessionStart', 'bridgeSessionEnd', 'bridgeLearningSystem',
    ];
    // memory.db mtime — bridge writes land here
    const memPath = resolve(DATA_ROOT, '.swarm/memory.db');
    if (existsSync(memPath) && isRecent(statSync(memPath).mtimeMs)) {
      const ts = statSync(memPath).mtimeMs;
      for (const fn of bridgeFns) activity.bridgeCalls.set(fn, ts);
    }
    // current-session.json mtime — hooks update stepCount on every call
    const sessPath = resolve(DATA_ROOT, '.claude-flow/data/current-session.json');
    if (existsSync(sessPath) && isRecent(statSync(sessPath).mtimeMs)) {
      const ts = statSync(sessPath).mtimeMs;
      // Session file update proves hook-handler + auto-memory are active
      activity.bridgeCalls.set('bridgeStoreEntry', Math.max(activity.bridgeCalls.get('bridgeStoreEntry') || 0, ts));
    }
    // last-edit.json mtime — auto-memory-hook writes on every edit
    const editPath = resolve(DATA_ROOT, '.claude-flow/data/last-edit.json');
    if (existsSync(editPath) && isRecent(statSync(editPath).mtimeMs)) {
      const ts = statSync(editPath).mtimeMs;
      activity.bridgeCalls.set('bridgeStoreEntry', Math.max(activity.bridgeCalls.get('bridgeStoreEntry') || 0, ts));
      activity.bridgeCalls.set('bridgeRecordCausalEdge', Math.max(activity.bridgeCalls.get('bridgeRecordCausalEdge') || 0, ts));
    }
  } catch {}

  // ── Layer 1: learning-activity.jsonl ──────────────────────
  try {
    const lPath = resolve(DATA_ROOT, '.claude-flow/data/learning-activity.jsonl');
    if (existsSync(lPath) && isRecent(statSync(lPath).mtimeMs)) {
      for (const line of readFileSync(lPath, 'utf8').split('\n')) {
        if (!line) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.action && obj.ts) {
            const prev = activity.learningEvents.get(obj.action) || 0;
            const ts = typeof obj.ts === 'string' ? new Date(obj.ts).getTime() : obj.ts;
            if (ts > prev) activity.learningEvents.set(obj.action, ts);
          }
        } catch {}
      }
    }
  } catch {}

  // ── Layer 1: session step count ───────────────────────────
  try {
    const session = readJson('.claude-flow/data/current-session.json');
    activity.sessionStepCount = session?.stepCount || 0;
  } catch {}

  // ── Layer 2: hook-activity.jsonl (replaces broken transcript parsing) ──
  try {
    const actPath = resolve(DATA_ROOT, '.claude-flow/data/hook-activity.jsonl');
    if (existsSync(actPath) && isRecent(statSync(actPath).mtimeMs)) {
      for (const line of readFileSync(actPath, 'utf8').split('\n').slice(-200)) {
        if (!line) continue;
        try {
          const { ts, e, m, c } = JSON.parse(line);
          if (!isRecent(ts, FIVE_MIN)) continue;
          // Hook event → trigger mapping
          const evtId = TRIGGER_ID_MAP[e] || TRIGGER_ID_MAP[e.replace(/-/g, '')];
          if (evtId) activity.hookEvents.set(e, Math.max(activity.hookEvents.get(e) || 0, ts));
          // Script evidence
          activity.scriptsCalled.add('hook-handler.cjs');
          // MCP tool calls (only when m=1)
          if (m === 1) {
            activity.mcpCalls.add('claude-flow');
            for (const tool of c) {
              activity.mcpToolCalls.set(tool, Math.max(activity.mcpToolCalls.get(tool) || 0, ts));
            }
          }
        } catch {}
      }
    }
  } catch {}

  // Bridge calls also prove hook-handler ran
  if (activity.bridgeCalls.size > 0) activity.scriptsCalled.add('hook-handler.cjs');

  // ── Layer 1b: MCP tool calls from hook debug log ─────────
  // Parse .claude-flow/data/hook-debug.log for [mcp-*] entries proving MCP path was used
  try {
    const debugLogPath = resolve(DATA_ROOT, '.claude-flow/data/hook-debug.log');
    if (existsSync(debugLogPath) && isRecent(statSync(debugLogPath).mtimeMs)) {
      const content = readFileSync(debugLogPath, 'utf8');
      const lines = content.split('\n').slice(-200);
      for (const line of lines) {
        // Match lines like: [mcp-post-edit] agentdb_feedback → ok
        const m = line.match(/\[mcp[^\]]*\]\s*(agentdb_\S+|hooks_\S+|embeddings_\S+)/);
        if (m) {
          const tool = m[1];
          const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
          const ts = tsMatch ? new Date(tsMatch[1]).getTime() : Date.now();
          const prev = activity.mcpToolCalls.get(tool) || 0;
          if (ts > prev) activity.mcpToolCalls.set(tool, ts);
        }
      }
    }
  } catch {}

  // MCP tool calls from current-session.json mcpTrajectoryId
  try {
    const sess = readJson('.claude-flow/data/current-session.json');
    if (sess?.mcpTrajectoryId) {
      // MCP SONA trajectory is active
      const ts = sess.lastUpdate ? new Date(sess.lastUpdate).getTime() : Date.now();
      activity.mcpToolCalls.set('hooks_intelligence_trajectory-start', ts);
      if (sess.stepCount > 0) {
        activity.mcpToolCalls.set('hooks_intelligence_trajectory-step', ts);
        activity.mcpToolCalls.set('agentdb_feedback', ts);
      }
    }
  } catch {}

  // ── Layer 3: File mtimes ──────────────────────────────────
  try {
    for (const dir of ['.claude-flow/data', '.claude-flow/metrics', '.claude-flow/logs', '.swarm']) {
      const fullDir = resolve(DATA_ROOT, dir);
      if (!existsSync(fullDir)) continue;
      try {
        for (const f of readdirSync(fullDir)) {
          try { activity.storeMtimes.set(`${dir}/${f}`, statSync(resolve(fullDir, f)).mtimeMs); } catch {}
        }
      } catch {}
    }
    // SONA daemon state file
    try {
      const sonaStatePath = resolve(DATA_ROOT, '.ruvector/sona-state.json');
      if (existsSync(sonaStatePath)) {
        activity.storeMtimes.set('.ruvector/sona-state.json', statSync(sonaStatePath).mtimeMs);
      }
    } catch {}
    for (const p of ['.swarm/memory.db', 'ruvector.db']) {
      try { const fp = resolve(DATA_ROOT, p); if (existsSync(fp)) activity.storeMtimes.set(p, statSync(fp).mtimeMs); } catch {}
    }
  } catch {}

  // ── Layer 3: Daemon logs ──────────────────────────────────
  try {
    const logDir = resolve(DATA_ROOT, '.claude-flow/logs');
    if (existsSync(logDir)) {
      for (const [file, name] of [['daemon.log', 'daemon'], ['swarm-monitor.log', 'swarm-monitor'], ['metrics-daemon.log', 'metrics-daemon']]) {
        try {
          const lp = resolve(logDir, file);
          if (!existsSync(lp)) continue;
          for (const line of readFileSync(lp, 'utf8').split('\n').filter(Boolean).slice(-10)) {
            const m = line.match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/);
            if (m) {
              const ts = new Date(m[1]).getTime();
              if (!isNaN(ts)) {
                const prev = activity.daemonEvents.get(name) || 0;
                if (ts > prev) activity.daemonEvents.set(name, ts);
              }
            }
          }
        } catch {}
      }
    }
  } catch {}

  // ── Layer 3: State JSON files ─────────────────────────────
  try { activity.daemonState = readJson('.claude-flow/data/hooks-daemon-state.json'); } catch {}
  try { activity.cliState = readJson('.claude-flow/daemon-state.json'); } catch {}

  _cache = activity;
  _cacheTime = now;
  return activity;
}

// ═══════════════════════════════════════════════════════════════
// Edge evidence — given an edge, determine if it's alive
// ═══════════════════════════════════════════════════════════════

export function evaluateEdge(edge, nodeSignalMap, allNodes) {
  const activity = gatherActivity();
  const srcSig = nodeSignalMap[edge.sourceId];
  const tgtSig = nodeSignalMap[edge.targetId];
  const bothExist = srcSig?.exists && tgtSig?.exists;

  let lastFired = null;
  let count = 0;
  let source = null; // which layer provided evidence

  // ── fires edges ───────────────────────────────────────────
  if (edge.type === 'fires') {
    // Layer 2: hook events from hook-activity.jsonl (real hook invocation log)
    const matchingEvts = Object.entries(TRIGGER_ID_MAP)
      .filter(([, id]) => id === edge.sourceId)
      .map(([name]) => name);
    for (const evtName of matchingEvts) {
      const ts = activity.hookEvents.get(evtName);
      if (ts && isRecent(ts, FIVE_MIN)) {
        lastFired = new Date(ts).toISOString();
        count = 1;
        source = 'layer2';
        break;
      }
    }
    // Note: events not in hook-activity.jsonl (e.g. SubagentStart/Stop) stay idle.
    // Layer 3: daemon log evidence for daemon targets
    if (!count) {
      const dTargets = { eng_daemon_manager: 'daemon', eng_swarm_monitor: 'swarm-monitor', eng_metrics_db: 'metrics-daemon' };
      const dName = dTargets[edge.targetId];
      if (dName) {
        const ts = activity.daemonEvents.get(dName);
        if (ts && isRecent(ts, FIVE_MIN)) {
          lastFired = new Date(ts).toISOString();
          count = 1;
          source = 'layer3';
        }
      }
    }
  }

  // ── writes edges ──────────────────────────────────────────
  // Only pulse when the target mtime CHANGED since last poll (not just "recent")
  if (edge.type === 'writes' && tgtSig?.exists && srcSig?.active) {
    const tgtNode = allNodes.find(n => n.id === edge.targetId);
    // Layer 1: bridge call proves a specific write to memory.db
    if (!count && activity.bridgeCalls.size > 0 && edge.targetId === 'db_memory') {
      let latest = 0;
      for (const ts of activity.bridgeCalls.values()) if (ts > latest) latest = ts;
      if (isRecent(latest, FIVE_MIN)) {
        count = 1;
        lastFired = new Date(latest).toISOString();
        source = 'layer1';
      }
    }
    // Layer 1: intelligence→patterns.json (distillLearning via trajectory-end MCP)
    if (!count && edge.sourceId === 'eng_intelligence' && edge.targetId === 'json_neural_patterns') {
      const trajEndTs = activity.mcpToolCalls.get('hooks_intelligence_trajectory-end');
      const learnTs = activity.mcpToolCalls.get('hooks_intelligence_learn');
      const bestTs = Math.max(trajEndTs || 0, learnTs || 0);
      if (bestTs && isRecent(bestTs, FIVE_MIN)) {
        count = 1;
        lastFired = new Date(bestTs).toISOString();
        source = 'layer1';
      }
    }
    // Layer 3: SONA daemon → sona-state.json writes
    if (!count && edge.sourceId === 'svc_sona_daemon' && edge.targetId === 'json_sona_state') {
      const mt = activity.storeMtimes.get('.ruvector/sona-state.json');
      if (mt && isRecent(mt, FIVE_MIN)) {
        count = 1;
        lastFired = new Date(mt).toISOString();
        source = 'layer3';
      }
    }
    // Layer 3: target file mtime — report it, frontend detects changes via _lastSeenFired
    if (!count && tgtNode?.path) {
      const mt = tgtNode.meta?.lastMod ? new Date(tgtNode.meta.lastMod).getTime() : null;
      const storeMt = activity.storeMtimes.get(tgtNode.path);
      const bestMt = Math.max(mt || 0, storeMt || 0);
      if (bestMt && isRecent(bestMt, FIVE_MIN)) {
        lastFired = new Date(bestMt).toISOString();
        count = 1;
        source = 'layer3';
      }
    }
  }

  // ── reads edges ───────────────────────────────────────────
  // Reads are invisible — no filesystem trace. Only viz reads are provable.
  if (edge.type === 'reads') {
    if (edge.sourceId.startsWith('viz_') && tgtSig?.exists) {
      count = 1;
      source = 'layer3';
    }
    // intelligence reads patterns.json during distillLearning (triggered by trajectory-end/learn)
    if (!count && edge.sourceId === 'eng_intelligence' && edge.targetId === 'json_neural_patterns') {
      const trajEndTs = activity.mcpToolCalls.get('hooks_intelligence_trajectory-end');
      const learnTs = activity.mcpToolCalls.get('hooks_intelligence_learn');
      const bestTs = Math.max(trajEndTs || 0, learnTs || 0);
      if (bestTs && isRecent(bestTs, FIVE_MIN)) {
        count = 1;
        lastFired = new Date(bestTs).toISOString();
        source = 'layer1';
      }
    }
    // Everything else: no evidence of a read → stays idle
  }

  // ── calls edges ───────────────────────────────────────────
  if (edge.type === 'calls') {
    // Layer 1: bridge→controller (precise, from hook-queue)
    if (edge.sourceId === 'eng_memory_bridge' && activity.bridgeCalls.size > 0) {
      const ts = activity.bridgeCalls.get(edge.label);
      if (ts && isRecent(ts, FIVE_MIN)) {
        count = 1;
        lastFired = new Date(ts).toISOString();
        source = 'layer1';
      }
      if (!count) {
        for (const [fn, ctrlName] of Object.entries(BRIDGE_TO_CONTROLLER)) {
          const fnTs = activity.bridgeCalls.get(fn);
          if (!fnTs || !isRecent(fnTs, FIVE_MIN)) continue;
          if (ctrlName && edge.targetId === ctrlId(ctrlName)) {
            count = 1;
            lastFired = new Date(fnTs).toISOString();
            source = 'layer1';
            break;
          }
        }
      }
    }
    // Layer 1: MCP tool→controller (MCP-first v5 — replaces bridge grep evidence)
    if (!count && activity.mcpToolCalls.size > 0) {
      // svc_mcp_http→controller edges
      if (edge.sourceId === 'svc_mcp_http') {
        for (const [tool, ctrls] of Object.entries(MCP_TO_CONTROLLER)) {
          const ts = activity.mcpToolCalls.get(tool);
          if (!ts || !isRecent(ts, FIVE_MIN)) continue;
          for (const ctrlName of ctrls) {
            if (edge.targetId === ctrlId(ctrlName)) {
              count = 1;
              lastFired = new Date(ts).toISOString();
              source = 'layer1';
              break;
            }
          }
          if (count) break;
        }
      }
      // eng_hook_handler→svc_mcp_http edge
      if (!count && edge.sourceId === 'eng_hook_handler' && edge.targetId === 'svc_mcp_http') {
        let latest = 0;
        for (const ts of activity.mcpToolCalls.values()) if (ts > latest) latest = ts;
        if (isRecent(latest, FIVE_MIN)) {
          count = 1;
          lastFired = new Date(latest).toISOString();
          source = 'layer1';
        }
      }
    }
    // Layer 1: *→bridge (any bridge call proves pipeline active)
    if (!count && edge.targetId === 'eng_memory_bridge' && activity.bridgeCalls.size > 0) {
      let latest = 0;
      for (const ts of activity.bridgeCalls.values()) if (ts > latest) latest = ts;
      if (isRecent(latest, FIVE_MIN)) {
        count = 1;
        lastFired = new Date(latest).toISOString();
        source = 'layer1';
      }
    }

    // Layer 2: script evidence removed — was blanket "hook-handler ran → all calls pulse".
    // Specific calls are already covered by MCP tool→controller mapping (layer 1) above.

    // Layer 3: daemon log for daemon→sub-daemon calls
    if (!count && edge.sourceId === 'eng_daemon_manager' && activity.daemonEvents.size > 0) {
      const dTargets = { eng_swarm_monitor: 'swarm-monitor', eng_metrics_db: 'metrics-daemon' };
      const dName = dTargets[edge.targetId];
      if (dName) {
        const ts = activity.daemonEvents.get(dName);
        if (ts && isRecent(ts)) {
          count = 1;
          lastFired = new Date(ts).toISOString();
          source = 'layer3';
        }
      }
    }

    // CLI tools → worker calls
    if (!count && edge.sourceId === 'eng_cli_tools') {
      const tgtNode = allNodes.find(n => n.id === edge.targetId);
      const workerKey = tgtNode?.logKeys?.[0];
      const wInfo = workerKey && activity.cliState?.workers?.[workerKey];
      if (wInfo) {
        const lt = wInfo.lastTriggeredAt ? new Date(wInfo.lastTriggeredAt).getTime() : 0;
        const lr = wInfo.lastRun ? new Date(wInfo.lastRun).getTime() : 0;
        const newest = Math.max(lt, lr);
        if (isRecent(newest, FIVE_MIN)) {
          count = 1;
          lastFired = new Date(newest).toISOString();
          source = 'layer3';
        }
      }
    }

    // SONA daemon (Process 3) — Layer 3: PID + socket + sona-state.json mtime
    if (!count && (edge.sourceId === 'svc_sona_daemon' || edge.targetId === 'svc_sona_daemon'
        || edge.sourceId === 'eng_sona_hook_handler' || edge.sourceId === 'eng_ruvector_ipc_client')) {
      const pidPath = '/tmp/ruvector-runtime.pid';
      const sockPath = '/tmp/ruvector-runtime.sock';
      if (existsSync(pidPath) && existsSync(sockPath)) {
        const statePath = resolve(DATA_ROOT, '.ruvector/sona-state.json');
        if (existsSync(statePath)) {
          const mt = statSync(statePath).mtimeMs;
          if (isRecent(mt, FIVE_MIN)) {
            count = 1;
            lastFired = new Date(mt).toISOString();
            source = 'layer3';
          }
        }
        // Even without recent state write, daemon running = edge alive for IPC edges
        if (!count && (edge.sourceId === 'eng_ruvector_ipc_client' && edge.targetId === 'svc_sona_daemon')) {
          count = 1;
          source = 'layer3';
        }
      }
    }

    // Viz → engine: always active (we ARE the viz)
    if (!count && edge.sourceId.startsWith('viz_')) {
      count = 1;
      source = 'layer3';
    }
  }

  // ── uses edges ────────────────────────────────────────────
  // Only pulse when a SPECIFIC tool→controller mapping matches (no blanket rules)
  if (edge.type === 'uses' && srcSig?.active && tgtSig?.active && !count) {
    // MCP tool → controller (precise mapping only)
    if (edge.sourceId === 'svc_mcp_http' && activity.mcpToolCalls.size > 0) {
      for (const [tool, ctrls] of Object.entries(MCP_TO_CONTROLLER)) {
        const ts = activity.mcpToolCalls.get(tool);
        if (!ts || !isRecent(ts, FIVE_MIN)) continue;
        for (const ctrlName of ctrls) {
          if (edge.targetId === ctrlId(ctrlName)) {
            count = 1;
            lastFired = new Date(ts).toISOString();
            source = 'layer1';
            break;
          }
        }
        if (count) break;
      }
    }
    // Bridge → specific controller (precise mapping)
    if (!count && activity.bridgeCalls.size > 0) {
      for (const [fn, ctrlName] of Object.entries(BRIDGE_TO_CONTROLLER)) {
        if (!ctrlName) continue;
        const fnTs = activity.bridgeCalls.get(fn);
        if (!fnTs || !isRecent(fnTs, FIVE_MIN)) continue;
        if (edge.targetId === ctrlId(ctrlName) || edge.sourceId === ctrlId(ctrlName)) {
          count = 1;
          lastFired = new Date(fnTs).toISOString();
          source = 'layer1';
          break;
        }
      }
    }
  }

  // ── configures edges ──────────────────────────────────────
  // Pulse when the source config file was recently modified (config changed → targets reconfigured)
  if (edge.type === 'configures') {
    let cfgCount = 0, cfgFired = null, cfgSource = null;
    const srcNode = allNodes.find(n => n.id === edge.sourceId);
    if (srcNode?.path) {
      const mt = srcNode.meta?.lastMod ? new Date(srcNode.meta.lastMod).getTime() : null;
      const storeMt = activity.storeMtimes.get(srcNode.path);
      const bestMt = Math.max(mt || 0, storeMt || 0);
      if (bestMt && isRecent(bestMt, FIVE_MIN)) {
        cfgCount = 1;
        cfgFired = new Date(bestMt).toISOString();
        cfgSource = 'layer3';
      }
    }
    // Only pulse if the target is also active — no point pulsing config to an idle node
    const cfgAlive = cfgCount > 0 && tgtSig?.active;
    return {
      lastFired: cfgAlive ? cfgFired : null, countThisSession: cfgAlive ? cfgCount : 0, alive: cfgAlive,
      srcExists: !!srcSig?.exists, tgtExists: !!tgtSig?.exists,
      lastStatus: cfgAlive ? 'active' : bothExist ? 'idle' : 'broken',
      source: cfgAlive ? cfgSource : null,
    };
  }

  // ── Learning activity evidence (Layer 1) ──────────────────
  if (!count && activity.learningEvents.size > 0) {
    for (const [action, ts] of activity.learningEvents) {
      if (!isRecent(ts, FIVE_MIN)) continue;
      const mapping = LEARNING_ACTION_MAP[action];
      if (!mapping) continue;
      if (edge.sourceId === mapping.src || edge.targetId === mapping.tgt) {
        count = 1;
        lastFired = new Date(ts).toISOString();
        source = 'layer1';
        break;
      }
    }
  }

  // ── Determine final status ────────────────────────────────
  const srcNode = allNodes.find(n => n.id === edge.sourceId);
  const tgtNode = allNodes.find(n => n.id === edge.targetId);
  const srcOnDemand = srcNode?.onDemand || srcNode?.meta?.onDemand || srcNode?.meta?.phantom;
  const tgtOnDemand = tgtNode?.onDemand || tgtNode?.meta?.onDemand || tgtNode?.meta?.phantom;
  const srcMissing = !srcSig?.exists;
  const tgtMissing = !tgtSig?.exists;

  let lastStatus;
  if (count > 0) lastStatus = 'active';
  else if (bothExist) lastStatus = 'idle';
  else if ((srcMissing && srcOnDemand) || (tgtMissing && tgtOnDemand)) lastStatus = 'pending';
  else lastStatus = 'broken';

  return {
    lastFired,
    countThisSession: count,
    alive: count > 0,
    srcExists: !!srcSig?.exists,
    tgtExists: !!tgtSig?.exists,
    lastStatus,
    source,
  };
}
