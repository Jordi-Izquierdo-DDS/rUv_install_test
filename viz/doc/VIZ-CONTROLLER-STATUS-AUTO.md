# Viz — Automatic Controller Status Detection

> How to get runtime status (active/idle/degraded/broken) for EVERY controller node automatically,
> without hardcoding per-controller status checks.

---

## The Challenge

The viz needs to show each `ctrl_*` node with accurate runtime state:
- **active** — controller is working, recent activity
- **idle** — controller is loaded but no activity
- **degraded** — controller partially working (fallback mode)
- **broken** — controller failed to initialize

`agentdb_controllers` gives you `enabled: true/false` — but that only means "the registry tried to instantiate it," not whether it's actually functional or doing work.

---

## Status Sources (Priority Order)

The viz should check status for each controller by walking down this list. First hit wins.

### Priority 1: `agentdb_controllers` (base availability)

```javascript
const result = await mcpCall('agentdb_controllers', {});
// [{ name, enabled, level }]
```

**Gives you**: `enabled: true/false` per controller
**Maps to**: `broken` (disabled) OR continue to next priority

**Level** also matters — it's the initialization tier:
- **level 1** (learningBridge, tieredCache, reasoningBank, hierarchicalMemory, hybridSearch) — core, always should be up
- **level 2** (vectorBackend, memoryGraph, agentMemoryScope, mutationGuard, gnnService) — advanced features
- **level 3** (skills, reflexion, explainableRecall, attestationLog, batchOperations, memoryConsolidation) — extended
- **level 4** (causalGraph, nightlyLearner, ...) — specialized

If a level-1 is disabled, that's a bigger problem than a level-4.

### Priority 2: `hooks_intelligence` (intelligence-layer controllers)

```javascript
const result = await mcpCall('hooks_intelligence', {});
// { mode, status, components: { sona, moe, hnsw, flashAttention, ... } }
```

Each component has:
```javascript
{
  enabled: true,
  status: "active",      // "active" | "idle" | "disabled"
  implemented: true,
  trajectoriesRecorded: 385,
  trajectoriesSuccessful: 0,
  patternsLearned: 7,
  // ... component-specific metrics
}
```

**Maps to these controllers**:
- `components.sona` → `ctrl_sona` (also feeds `ctrl_reasoning_bank`, `ctrl_learning_system`)
- `components.moe` → `ctrl_moe_router` (if you expose it)
- `components.hnsw` → `ctrl_vector_backend` (HNSW is the vector backend)
- `components.flashAttention` → `ctrl_flash_attention` (attention layer)

**Status logic**:
- `status: "active"` + metric > 0 → `active`
- `status: "active"` + metric === 0 → `idle`
- `enabled: false` → `broken`

### Priority 3: `memory_bridge_status` (bridge + intelligence stats)

```javascript
const result = await mcpCall('memory_bridge_status', {});
// {
//   claudeCode: { memoryFiles, projects },
//   agentdb: { totalEntries, claudeMemoryEntries, backend },
//   intelligence: { sonaEnabled, patternsLearned, trajectoriesRecorded },
//   bridge: { ... }
// }
```

**Maps to**:
- `intelligence.sonaEnabled` → confirms SONA bridge is wired
- `intelligence.patternsLearned > 0` → `active`
- `intelligence.trajectoriesRecorded` → activity counter
- `agentdb.backend` → identifies which backend (`sql.js + HNSW`, `graph-node`, etc.)

### Priority 4: `memory_stats` (per-backend memory status)

```javascript
const result = await mcpCall('memory_stats', {});
// {
//   initialized: true,
//   totalEntries: 119,
//   entriesWithEmbeddings: 82,
//   embeddingCoverage: "68%",
//   namespaces: { ... },
//   backend: "sql.js + HNSW"
// }
```

**Maps to**:
- `ctrl_memory_store` (or whatever memory node) — `initialized` + `totalEntries`
- `backend: "sql.js + HNSW"` proves `vectorBackend` controller is functional

### Priority 5: `neural_status` (neural-layer controllers)

```javascript
const result = await mcpCall('neural_status', {});
// {
//   embeddingProvider: "@claude-flow/embeddings (agentic-flow/reasoningbank)",
//   models: { total, ready, training, avgAccuracy },
//   patterns: { total, byType, totalEmbeddingDims: 384 },
//   features: { ... }
// }
```

**Maps to**:
- `embeddingProvider` → confirms `ctrl_embedder` is active
- `patterns.total` → activity counter
- `models.ready > 0` → neural controllers ready

### Priority 6: `hooks_metrics` (24h activity window)

```javascript
const result = await mcpCall('hooks_metrics', {});
// {
//   period: "24h",
//   patterns: { total, successful, failed, avgConfidence },
//   agents: { ... }
// }
```

**Maps to**: Activity liveness. If no hooks fired in 24h → session is quiet, controllers are idle (not broken).

### Priority 7: `system_health` (overall)

```javascript
const result = await mcpCall('system_health', {});
// {
//   overall: "healthy" | "degraded" | "unhealthy",
//   score: 20,
//   checks: [{ name, status, latency, message }]
// }
```

**Maps to**: Top-level banner in the viz. Each `checks[]` entry maps to one subsystem.

---

## The Composite Status Function

```javascript
/**
 * Get runtime status for every controller by composing multiple MCP calls.
 * Returns a map: { controllerName: { status, metric, lastActivity, source } }
 */
async function getAllControllerStatus(mcpCall) {
  // Parallel fetch all status sources
  const [controllers, intelligence, bridgeStatus, memoryStats, neuralStatus, hooksMetrics, systemHealth] =
    await Promise.all([
      mcpCall('agentdb_controllers', {}).catch(() => null),
      mcpCall('hooks_intelligence', {}).catch(() => null),
      mcpCall('memory_bridge_status', {}).catch(() => null),
      mcpCall('memory_stats', {}).catch(() => null),
      mcpCall('neural_status', {}).catch(() => null),
      mcpCall('hooks_metrics', {}).catch(() => null),
      mcpCall('system_health', {}).catch(() => null),
    ]);

  const statusMap = {};

  // Priority 1: Base enablement
  if (controllers?.controllers) {
    for (const c of controllers.controllers) {
      statusMap[c.name] = {
        enabled: c.enabled,
        level: c.level,
        status: c.enabled ? 'idle' : 'broken',
        metric: null,
        lastActivity: null,
        source: 'agentdb_controllers',
      };
    }
  }

  // Priority 2: Intelligence components — upgrade status with activity
  if (intelligence?.components) {
    const componentToController = {
      sona: ['reasoningBank', 'learningBridge'],
      hnsw: ['vectorBackend'],
      moe: ['gnnService'],
    };
    for (const [compName, compData] of Object.entries(intelligence.components)) {
      const targetControllers = componentToController[compName] || [];
      for (const ctrlName of targetControllers) {
        if (statusMap[ctrlName]) {
          const metric = compData.trajectoriesRecorded ?? compData.patternsLearned ?? compData.indexSize ?? 0;
          statusMap[ctrlName].status = compData.enabled && metric > 0 ? 'active'
                                     : compData.enabled ? 'idle' : 'broken';
          statusMap[ctrlName].metric = metric;
          statusMap[ctrlName].source = 'hooks_intelligence';
        }
      }
    }
  }

  // Priority 3: Bridge intelligence — reasoningBank activity override
  if (bridgeStatus?.intelligence?.patternsLearned > 0) {
    if (statusMap.reasoningBank) {
      statusMap.reasoningBank.status = 'active';
      statusMap.reasoningBank.metric = bridgeStatus.intelligence.patternsLearned;
      statusMap.reasoningBank.source = 'memory_bridge_status';
    }
  }

  // Priority 4: Memory store — vectorBackend + hierarchicalMemory
  if (memoryStats?.initialized) {
    for (const ctrl of ['vectorBackend', 'hierarchicalMemory']) {
      if (statusMap[ctrl]) {
        statusMap[ctrl].status = memoryStats.totalEntries > 0 ? 'active' : 'idle';
        statusMap[ctrl].metric = memoryStats.totalEntries;
        statusMap[ctrl].backend = memoryStats.backend;
      }
    }
  }

  // Priority 5: Neural → patterns / embeddings
  if (neuralStatus?.patterns?.total > 0) {
    // Update whichever neural controllers exist
    for (const ctrl of ['reasoningBank', 'learningSystem']) {
      if (statusMap[ctrl] && statusMap[ctrl].status !== 'active') {
        statusMap[ctrl].metric = Math.max(statusMap[ctrl].metric || 0, neuralStatus.patterns.total);
      }
    }
  }

  // Priority 6: Hooks metrics — fills "lastActivity"
  if (hooksMetrics?.patterns?.total > 0) {
    // Activity in the last 24h — mark top controllers as active
    for (const ctrl of ['reasoningBank', 'learningBridge', 'hierarchicalMemory']) {
      if (statusMap[ctrl]) {
        statusMap[ctrl].lastActivity = 'recent-24h';
      }
    }
  }

  // Priority 7: Degraded markers from system_health
  if (systemHealth?.checks) {
    for (const check of systemHealth.checks) {
      // Map check.name → relevant controllers
      if (check.name === 'memory' && check.status === 'degraded') {
        for (const ctrl of ['hierarchicalMemory', 'vectorBackend', 'memoryConsolidation']) {
          if (statusMap[ctrl]) statusMap[ctrl].status = 'degraded';
        }
      }
    }
  }

  return statusMap;
}
```

---

## Status Value Mapping

| MCP Signal | Viz Status | Color |
|-----------|-----------|-------|
| `enabled: true` + activity metric > 0 | `active` | green |
| `enabled: true` + metric === 0 | `idle` | yellow |
| `enabled: true` + `system_health.check.status === 'degraded'` | `degraded` | orange |
| `enabled: false` | `broken` | red |
| Not in `agentdb_controllers` response | `unknown` | gray |

---

## Backend-Type Nodes (not in `agentdb_controllers`)

For `backend_*` nodes (e.g., `backend_graph_db_adapter`), status is **inherited from the parent controller**:

```javascript
// Example mapping — static definition once
const BACKEND_PARENT = {
  'backend_graph_db_adapter': 'memoryGraph',  // uses memoryGraph controller's status
  'backend_hnswlib': 'vectorBackend',           // uses vectorBackend's status
  'backend_sqlite': 'vectorBackend',
};

function getBackendStatus(backendName, statusMap) {
  const parent = BACKEND_PARENT[backendName];
  if (parent && statusMap[parent]) {
    return statusMap[parent].status;
  }
  return 'unknown';
}
```

---

## Utility-Type Nodes (not in any status API)

For `util_*` nodes (e.g., `util_mmr_diversity_ranker`), status is **"installed" check only**:

```javascript
import { existsSync } from 'fs';
import { join } from 'path';

function getUtilStatus(utilName, nodeModules) {
  const CANDIDATES = {
    'util_mmr_diversity_ranker': 'agentdb/dist/controllers/MMRDiversityRanker.js',
    'util_bm25_scorer':           'agentdb/dist/utils/bm25.js',
  };
  const path = CANDIDATES[utilName];
  if (!path) return 'unknown';
  return existsSync(join(nodeModules, path)) ? 'installed' : 'missing';
}
```

---

## Daemon-Type Nodes (`svc_*`)

Status from file/socket/port checks (not MCP tools):

```javascript
function getDaemonStatus(daemonName, projectRoot) {
  const DAEMONS = {
    svc_mcp_http: { pid: '.claude-flow/pids/mcp-http.pid', port: null /* computed */ },
    svc_sona_daemon: { pid: '/tmp/ruvector-runtime.pid', socket: '/tmp/ruvector-runtime.sock' },
    svc_swarm_monitor: { pid: '.claude-flow/pids/swarm-monitor.pid' },
    svc_metrics_daemon: { pid: '.claude-flow/pids/metrics-daemon.pid' },
  };
  const cfg = DAEMONS[daemonName];
  if (!cfg) return 'unknown';

  // Check PID file
  const pidPath = cfg.pid.startsWith('/') ? cfg.pid : join(projectRoot, cfg.pid);
  if (!existsSync(pidPath)) return 'broken';
  const pid = parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
  if (isNaN(pid)) return 'broken';

  // Check process alive
  try { process.kill(pid, 0); } catch { return 'broken'; }

  // Check socket if applicable
  if (cfg.socket && !existsSync(cfg.socket)) return 'degraded';

  return 'active';
}
```

---

## Refresh Cadence

- **`ctrl_*` status**: Poll every **30s** (cheap MCP calls, cacheable)
- **`backend_*` status**: Poll every **30s** (inherited from controllers)
- **`svc_*` status**: Poll every **5s** (cheap file checks, critical for detecting crashes)
- **`util_*` status**: Poll every **5 min** (rarely changes)

Cache results in `nodeSignalMap` keyed by node ID.

---

## What Each MCP Tool Costs

| Tool | Latency | Cost | Poll OK? |
|------|---------|------|---------|
| `agentdb_controllers` | ~5ms | Low | Every 30s |
| `hooks_intelligence` | ~10ms | Low | Every 30s |
| `memory_bridge_status` | ~20ms | Medium | Every 60s |
| `memory_stats` | ~10ms | Low | Every 60s |
| `neural_status` | ~10ms | Low | Every 60s |
| `hooks_metrics` | ~30ms | Medium | Every 60s |
| `system_health` | ~50ms | Medium | Every 60s |

**Parallel fetch**: Call all 7 in parallel with `Promise.all` — total wall time ~50ms.

---

## Example Output

```
{
  "learningBridge":       { enabled: true, level: 1, status: "idle",   metric: 0 },
  "tieredCache":          { enabled: true, level: 1, status: "idle",   metric: 0 },
  "reasoningBank":        { enabled: true, level: 1, status: "active", metric: 7, lastActivity: "recent-24h", source: "memory_bridge_status" },
  "hierarchicalMemory":   { enabled: true, level: 1, status: "active", metric: 269, source: "memory_stats", backend: "sql.js + HNSW" },
  "hybridSearch":         { enabled: true, level: 1, status: "idle",   metric: 0 },
  "vectorBackend":        { enabled: true, level: 2, status: "active", metric: 269, backend: "sql.js + HNSW" },
  "memoryGraph":          { enabled: true, level: 2, status: "active", source: "memory_bridge_status" },
  "gnnService":           { enabled: true, level: 2, status: "idle",   metric: 0 },
  "memoryConsolidation":  { enabled: true, level: 3, status: "degraded", source: "system_health", reason: "memory check failed" },
  "reflexion":            { enabled: true, level: 3, status: "idle",   metric: 0 }
}
```

---

## Implementation Checklist

- [ ] Add `getAllControllerStatus()` to viz server
- [ ] Cache results in memory with 30s TTL
- [ ] Expose via `GET /api/controllers/status` endpoint
- [ ] Update `node-registry.js` to read status from this map instead of hardcoded checks
- [ ] Map `backend_*` nodes to parent controllers via `BACKEND_PARENT` dict
- [ ] Map `util_*` nodes to file existence checks
- [ ] Map `svc_*` nodes to PID/socket/port checks
- [ ] Add color legend: green (active), yellow (idle), orange (degraded), red (broken), gray (unknown)

---

## Related Files

- `doc/VIZ-SYMBOL-CLASSIFICATION.md` — how to classify symbols (controller vs backend vs util)
- `_gitNexus_Implemantion_plan_v1/VIZ-SONA-EDGES-SPEC.md` — edge auto-discovery
- `node_modules/@claude-flow/cli/dist/src/mcp-tools/agentdb-tools.js` — controller tools source
- `node_modules/@claude-flow/cli/dist/src/mcp-tools/hooks-tools.js` — intelligence tools source
