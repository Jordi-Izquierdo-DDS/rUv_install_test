// ═══════════════════════════════════════════════════════════════
// Controller Status — implements doc/VIZ-CONTROLLER-STATUS-AUTO.md
//
// Composite runtime status for controllers, backends, utils, and daemons.
// Fetches 7 MCP tools in parallel, walks priorities, returns a normalized
// status map: { name → { enabled, level, status, metric, lastActivity,
//                        source, backend } }
//
// Status values: active | idle | degraded | broken | unknown
//
// Cadence:
//   - ctrl_*     : every 30s (MCP composite)
//   - svc_*      : every 5s  (PID + socket checks)
//   - util_*     : every 5 min (file existsSync)
//   - backend_*  : inherits from parent controller (no separate fetch)
// ═══════════════════════════════════════════════════════════════

import { existsSync, readFileSync } from 'fs';
import { resolve, join } from 'path';
import { callMcp } from './mcp-client.js';

const DATA_ROOT = process.env.DATA_ROOT || process.cwd();
const NODE_MODULES = resolve(DATA_ROOT, 'node_modules');

// ── Cache ────────────────────────────────────────────────────────
let _ctrlCache = null;       // Map<mcpName, statusEntry>
let _ctrlCacheTs = 0;
const CTRL_CACHE_TTL = 30_000; // 30s
let _refreshInFlight = null;
let _refreshTimer = null;

export function getCachedCtrlStatus(mcpName) {
  if (!_ctrlCache) return null;
  return _ctrlCache.get(mcpName) || null;
}

export function getCachedStatusMap() {
  return _ctrlCache || new Map();
}

// ── The composite itself ─────────────────────────────────────────
export async function getAllControllerStatus() {
  // Parallel fetch all 7 sources
  const [controllers, intelligence, bridgeStatus, memoryStats, neuralStatus, hooksMetrics, systemHealth] =
    await Promise.all([
      callMcp('agentdb_controllers', {}).catch(() => null),
      callMcp('hooks_intelligence', {}).catch(() => null),
      callMcp('memory_bridge_status', {}).catch(() => null),
      callMcp('memory_stats', {}).catch(() => null),
      callMcp('neural_status', {}).catch(() => null),
      callMcp('hooks_metrics', {}).catch(() => null),
      callMcp('system_health', {}).catch(() => null),
    ]);

  const statusMap = new Map();

  // Priority 1 — base availability
  const ctrlList = controllers?.controllers || [];
  for (const c of ctrlList) {
    statusMap.set(c.name, {
      name: c.name,
      enabled: c.enabled,
      level: c.level,
      status: c.enabled ? 'idle' : 'broken',
      metric: null,
      lastActivity: null,
      source: 'agentdb_controllers',
      backend: null,
    });
  }

  // Priority 2 — intelligence components → upgrade status for related ctrls
  if (intelligence?.components) {
    const componentToController = {
      sona: ['reasoningBank', 'sonaTrajectory', 'learningSystem'],
      hnsw: ['vectorBackend', 'hybridSearch'],
      moe: ['gnnService'],
      flashAttention: ['gnnService'],
    };
    for (const [compName, compData] of Object.entries(intelligence.components)) {
      const targets = componentToController[compName] || [];
      for (const ctrlName of targets) {
        const entry = statusMap.get(ctrlName);
        if (!entry) continue;
        const metric = compData.trajectoriesRecorded
          ?? compData.patternsLearned
          ?? compData.indexSize
          ?? 0;
        if (compData.enabled === false) {
          entry.status = 'broken';
        } else if (metric > 0) {
          entry.status = 'active';
        } else {
          entry.status = 'idle';
        }
        entry.metric = metric;
        entry.source = 'hooks_intelligence';
      }
    }
  }

  // Priority 3 — bridge intelligence → reasoningBank activity
  if (bridgeStatus?.intelligence?.patternsLearned > 0) {
    const entry = statusMap.get('reasoningBank');
    if (entry) {
      entry.status = 'active';
      entry.metric = bridgeStatus.intelligence.patternsLearned;
      entry.source = 'memory_bridge_status';
    }
  }

  // Priority 4 — memory_stats → vectorBackend + hierarchicalMemory
  if (memoryStats?.initialized) {
    for (const ctrlName of ['vectorBackend', 'hierarchicalMemory']) {
      const entry = statusMap.get(ctrlName);
      if (!entry) continue;
      entry.status = memoryStats.totalEntries > 0 ? 'active' : 'idle';
      entry.metric = memoryStats.totalEntries;
      entry.backend = memoryStats.backend || null;
    }
  }

  // Priority 5 — neural → patterns / embeddings
  if (neuralStatus?.patterns?.total > 0) {
    for (const ctrlName of ['reasoningBank', 'learningSystem']) {
      const entry = statusMap.get(ctrlName);
      if (!entry) continue;
      entry.metric = Math.max(entry.metric || 0, neuralStatus.patterns.total);
      if (entry.status !== 'active') entry.status = 'active';
    }
  }

  // Priority 6 — hooks_metrics → lastActivity
  if (hooksMetrics?.patterns?.total > 0) {
    for (const ctrlName of ['reasoningBank', 'learningBridge', 'hierarchicalMemory']) {
      const entry = statusMap.get(ctrlName);
      if (entry) entry.lastActivity = 'recent-24h';
    }
  }

  // Priority 7 — system_health → degraded markers (override)
  if (Array.isArray(systemHealth?.checks)) {
    for (const check of systemHealth.checks) {
      if (check.status !== 'degraded' && check.status !== 'unhealthy') continue;
      if (check.name === 'memory') {
        for (const ctrlName of ['hierarchicalMemory', 'vectorBackend', 'memoryConsolidation']) {
          const entry = statusMap.get(ctrlName);
          if (entry) {
            entry.status = 'degraded';
            entry.source = 'system_health';
            entry.reason = check.message || check.name;
          }
        }
      }
    }
  }

  _ctrlCache = statusMap;
  _ctrlCacheTs = Date.now();
  return statusMap;
}

// ── Backend inheritance ──────────────────────────────────────────
// backend_* status comes from its parent controller via this map.
export const BACKEND_PARENT = {
  backend_graph_database_adapter: 'memoryGraph',
  backend_hnsw_index: 'vectorBackend',
  backend_wasm_vector_search: 'vectorBackend',
};

export function getBackendStatus(backendId) {
  const parentMcpName = BACKEND_PARENT[backendId];
  if (!parentMcpName) return { status: 'unknown', source: 'no-parent-mapping' };
  const parent = getCachedCtrlStatus(parentMcpName);
  if (!parent) return { status: 'unknown', source: 'parent-not-cached' };
  return {
    status: parent.status,
    source: 'inherit:' + parentMcpName,
    parentStatus: parent.status,
    level: parent.level,
  };
}

// ── Utility installed-check ──────────────────────────────────────
export function getUtilStatus(utilId, sourceFile) {
  if (!sourceFile) return { status: 'unknown', source: 'no-source-path' };
  const installed = existsSync(sourceFile);
  return {
    status: installed ? 'installed' : 'missing',
    source: 'filesystem',
    sourceFile,
  };
}

// ── Daemon PID / socket / port ───────────────────────────────────
const DAEMONS = {
  svc_mcp_http: {
    pid: '.claude-flow/pids/mcp-http.pid',
    // Also recognized by port 8310 listening
  },
  svc_sona_daemon: {
    pid: '/tmp/ruvector-runtime.pid',
    socket: '/tmp/ruvector-runtime.sock',
  },
  svc_swarm_monitor: {
    pid: '.claude-flow/pids/swarm-monitor.pid',
  },
  svc_metrics_daemon: {
    pid: '.claude-flow/pids/metrics-daemon.pid',
  },
};

export function getDaemonStatus(daemonId) {
  const cfg = DAEMONS[daemonId];
  if (!cfg) return { status: 'unknown', source: 'no-daemon-config' };

  // Resolve PID file
  const pidPath = cfg.pid.startsWith('/') ? cfg.pid : resolve(DATA_ROOT, cfg.pid);
  if (!existsSync(pidPath)) return { status: 'broken', source: 'no-pid-file' };

  let pid;
  try {
    pid = parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
  } catch {
    return { status: 'broken', source: 'unreadable-pid' };
  }
  if (!Number.isFinite(pid) || pid <= 0) return { status: 'broken', source: 'invalid-pid' };

  // Check process alive
  try {
    process.kill(pid, 0);
  } catch {
    return { status: 'broken', source: 'dead-process', pid };
  }

  // Socket check (degraded if PID alive but socket missing)
  if (cfg.socket && !existsSync(cfg.socket)) {
    return { status: 'degraded', source: 'missing-socket', pid };
  }

  return { status: 'active', source: 'pid+socket', pid };
}

// ── Init / background refresh ────────────────────────────────────
export async function initControllerStatus({ refreshMs = CTRL_CACHE_TTL } = {}) {
  // Kick off first load (don't block startup on failure)
  if (!_refreshInFlight) {
    _refreshInFlight = getAllControllerStatus()
      .catch(err => { console.error('[ctrl-status] initial fetch failed:', err.message); return null; })
      .finally(() => { _refreshInFlight = null; });
  }
  await _refreshInFlight;

  // Background refresh
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = setInterval(() => {
    if (_refreshInFlight) return;
    _refreshInFlight = getAllControllerStatus()
      .catch(err => { console.error('[ctrl-status] refresh failed:', err.message); return null; })
      .finally(() => { _refreshInFlight = null; });
  }, refreshMs);
  _refreshTimer.unref?.();
}

export function stopControllerStatus() {
  if (_refreshTimer) clearInterval(_refreshTimer);
  _refreshTimer = null;
}
