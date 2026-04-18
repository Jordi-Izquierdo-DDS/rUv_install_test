# Viz — Symbol Classification + Runtime Status Implementation

> Implementation notes for `VIZ-SYMBOL-CLASSIFICATION.md` and `VIZ-CONTROLLER-STATUS-AUTO.md`.
> What got built, where it lives, what was deleted, and how to verify it.

---

## Module layout

| File | Role | Size |
|------|------|------|
| `src/mcp-client.js` | Minimal JSON-RPC client for the claude-flow MCP HTTP daemon (`http://localhost:8310/rpc`). Exports `callMcp(tool, args, { timeoutMs })`. Parses the `{ result.content[0].text }` wrapper. | ~40 lines |
| `src/symbol-classifier.js` | Walks `node_modules/agentdb/dist/{controllers,src/backends/graph}/**/*.d.ts`, source-parses each class, applies the 3 classification rules, emits a `Map<nodeId, info>`. 5-min TTL cache. | ~180 lines |
| `src/controller-status.js` | The 7-source runtime composite per the status doc. Parallel-fetches all 7 MCP tools, walks priorities 1→7, upgrades status. Also provides `getBackendStatus`, `getUtilStatus`, `getDaemonStatus` helpers. 30s TTL + background refresh loop. | ~230 lines |
| `src/controller-registry.js` | **Metadata only.** `BUG_CATALOG`, `CONTROLLER_LEVELS`, and three keyed-by-name enrichment maps: `CONTROLLER_META`, `BACKEND_META`, `UTIL_META`. The authoritative controller list comes from the MCP tool at runtime. | ~100 lines |

Backend integration touchpoints:
- `src/helpers.js` — `scanNodeSignals()` gained a new `detectVia: 'classifier'` branch (ctrl/backend/util sub-branches). `discoverNodes()` pass 7 is now classifier-driven.
- `src/api.js` — `initControllerStatus()` called on route registration; new endpoints `/api/controllers/status` and `/api/controllers/classification`; `/api/controllers` and `/api/pipeline-overview` rewritten to read from the composite cache.
- `src/edge-discover.js` — `getAllEdges(nodes)` reads the composite cache directly (no more `controllerStubMap` parameter).
- `src/server.js` — calls `initControllerStatus()` at boot instead of the old runtime probe.

Frontend (`public/dashboard.js`):
- `STYLE` — added `backend` (blue `#0ea5e9`) and `util` (gray `#9ca3af`) entries.
- `SUBGRAPHS` — added `backends` and `static_utils` groups.
- `nodeGroup` / `nodeShape` — route the new types to the new groups and pick shapes (backend → cylinder, util → rect).
- `FILTER_CATEGORIES` — new "ADR-053" category with Controllers / Backends / Static Utilities filters.
- `nodeSublabel` — handles `backend` and `util` types; no longer reads the dead `controllerStatus` field.
- `renderControllerBadge` — derives runtime status from `node.signals` + renders the `meta.statusNote` inline. 4-state color map: active=green, idle=yellow, degraded=orange, broken=red; plus util-specific installed=gray / missing=red.

---

## Classification rule order (corrected from the spec)

The classification doc lists Rule 1 first, but that alone misclassifies `MMRDiversityRanker` (it IS in `agentdb_controllers` but the class has only static methods). Our implementation runs the rules in the order **3 → 2 → 1**:

1. **Rule 3 — static-only → `util_*`.** Wins even if the name is in the MCP list.
   - Matched by: no constructor AND `staticCount > 0` AND `instanceCount === 0` (counted from `.d.ts`).
   - Example: `MMRDiversityRanker`, `ContextSynthesizer`, `MetadataFilter`.
2. **Rule 2 — lifecycle + stateful → `backend_*`.** Only emitted when the id is in `BACKEND_PARENT` — otherwise it would render as an orphan node on the graph.
   - Matched by: has `initialize/init/connect/start/open` AND `close/shutdown/stop/disconnect/destroy` AND either `private db|connection|client|pool|embedder|agentdb|adapter|store|config` or a constructor, AND not in the MCP list.
   - Example: `GraphDatabaseAdapter` → `backend_graph_database_adapter` (parent `memoryGraph`).
3. **Rule 1 — in MCP list + has constructor → `ctrl_*`.**
   - MCP-list members with no source file become phantom `ctrl_*` (e.g. `graphAdapter` in the v202 environment — listed with `enabled: false` but no concrete class).

The snake-case node id generator handles leading-acronym runs correctly:
```js
function toSnake(name) {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')   // MMR + Diversity → MMR_Diversity
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')       // Diversity + Ranker → Diversity_Ranker
    .toLowerCase();                              // → mmr_diversity_ranker
}
```

---

## Runtime status cascade

`getAllControllerStatus()` in `src/controller-status.js` walks the 7 priorities per the status doc:

1. `agentdb_controllers` → seeds every entry with `status: enabled ? 'idle' : 'broken'`
2. `hooks_intelligence` → upgrades `sona / hnsw / moe / flashAttention` component controllers: metric > 0 ⇒ active, else idle.
3. `memory_bridge_status` → `intelligence.patternsLearned > 0` ⇒ reasoningBank active.
4. `memory_stats` → `vectorBackend` + `hierarchicalMemory` get `totalEntries` as metric and `backend` string.
5. `neural_status` → `reasoningBank` + `learningSystem` pick up `patterns.total`.
6. `hooks_metrics` → `lastActivity: 'recent-24h'` on core controllers.
7. `system_health` → `checks[].status === 'degraded' | 'unhealthy'` overrides to `degraded` with a `reason` string.

Cadence (per the doc):
- `ctrl_*`: 30 s (MCP composite, ~50 ms wall time via `Promise.all`)
- `svc_*`: 5 s (PID + socket + `process.kill(0)`)
- `util_*`: 5 min (filesystem `existsSync` only)
- `backend_*`: inherited from parent controller via `BACKEND_PARENT`, no separate fetch

Signals → frontend mapping (derived in `renderControllerBadge`):
```
signals.active     → "active"   green
signals.degraded   → "degraded" orange
signals.notLoaded  → "broken"   red
signals.healthy    → "idle"     yellow
(exists=false)     → "missing"  red
```

---

## What got deleted (no back-compat)

From `src/helpers.js`:
- `_controllerStatusMap`, `loadControllerRegistry()`, `getControllerMap()` — the old runtime probe that imported `memory-bridge.js` and instantiated controllers via `reg.get(name)`.
- `_getControllerActivity()`, `TABLE_TO_CONTROLLER`, `_ctrlActivityCache` — the 3-layer waterfall that inferred activity from SQLite table mtimes. The composite tools carry activity now.
- The `detectVia: 'npm-package'` controller-specific branch with its camelKey lookup and className fallback scan. `detectVia: 'npm-package'` still exists for engines/models tied to `@ruvector/*` and `ruvector`.

From `src/controller-registry.js`:
- The entire `EXPECTED_CONTROLLERS` static list (28 hand-maintained entries with stale `controllerStatus` annotations like `'working'` / `'broken'` / `'stub'`).
- `CONTROLLER_BY_ID` lookup.
- `CTRL_DEFAULTS`.

From `src/node-registry.js`:
- The `import { EXPECTED_CONTROLLERS } from './controller-registry.js'` and the `...EXPECTED_CONTROLLERS` spread in `EXPECTED_NODES`.

From `src/edge-registry.js`:
- Edges that referenced reclassified nodes:
  - `ctrl_mmr_diversity → db_memory (reads)` — static utils don't read the DB
  - `ctrl_graph_adapter → db_memory (reads)` — phantom alias, no concrete class
  - `ctrl_graph_adapter → ctrl_federated_session (uses)` — dead since graphAdapter is phantom
  - `ctrl_context_synthesizer → db_memory (reads)` — static util

Edges rewritten (MCP / source-parsed IDs replacing truncated ones):
- `ctrl_hierarchical_mem` → `ctrl_hierarchical_memory` (12 edges)
- `ctrl_mem_consolidation` → `ctrl_memory_consolidation` (5 edges)
- `ctrl_guarded_vector` → `ctrl_guarded_vector_backend` (2 edges)
- `ctrl_mmr_diversity` (in `ctrl_hybrid_search → ctrl_mmr_diversity`) → `util_mmr_diversity_ranker`
- `ctrl_context_synthesizer` (2 edges) → `util_context_synthesizer`
- `ctrl_graph_adapter` (in `ctrl_memory_graph → ctrl_graph_adapter`) → `backend_graph_database_adapter`

Edges added:
- `backend_graph_database_adapter → db_memory (writes)`
- `backend_graph_database_adapter → db_memory (reads)`

`src/config/viz-layout.json`: 5 keys renamed in place (`ctrl_hierarchical_mem`, `ctrl_mem_consolidation`, `ctrl_guarded_vector`, `ctrl_mmr_diversity`, `ctrl_context_synthesizer`, `ctrl_graph_adapter`).

Cross-reference edge detection in `edge-discover.js` was dropped along with the runtime probe — without reflection on live class instances we can't derive `ctrl → ctrl (uses)` relationships. The static registry edges in `edge-registry.js` still cover the important ones.

---

## New endpoints

```
GET /api/controllers/status              → raw composite map
GET /api/controllers/status?refresh=1    → force re-fetch before reading cache
GET /api/controllers/classification      → { counts, byType, classifications }
GET /api/controllers                     → rewritten; 4-state vocabulary
```

Example:
```jsonc
// GET /api/controllers/classification
{
  "count": 29,
  "counts": { "ctrl": 25, "backend": 1, "util": 3 },
  "byType": {
    "ctrl": ["ctrl_reasoning_bank", "ctrl_hierarchical_memory", ...],
    "backend": ["backend_graph_database_adapter"],
    "util": ["util_mmr_diversity_ranker", "util_context_synthesizer", "util_metadata_filter"]
  }
}
```

---

## Verifying it works

```bash
# Restart the viz server
pkill -f "node src/server.js"; node src/server.js &
# Expected boot log:
#   Controllers: 27 total — 0 active, 23 idle, 3 degraded, 1 broken (MCP composite)

# Classification
curl -s localhost:3100/api/controllers/classification | jq '.counts'
# → { "ctrl": 25, "backend": 1, "util": 3 }

# Runtime status
curl -s localhost:3100/api/controllers | jq '{total, active, idle, degraded, broken}'
# → { "total": 27, "active": 0, "idle": 23, "degraded": 3, "broken": 1 }

# MMR is now a static util (not a controller)
curl -s localhost:3100/api/node/util_mmr_diversity_ranker | jq '.node.type, .node.signals'
# → "util", { exists: true, healthy: true, active: false }

# GraphDatabaseAdapter is a backend inheriting from memoryGraph
curl -s localhost:3100/api/node/backend_graph_database_adapter | jq '.node.meta.statusNote'
# → "backend · GraphDatabaseAdapter · inherit:memoryGraph · L2"

# Phantom graphAdapter registry alias
curl -s localhost:3100/api/node/ctrl_graph_adapter | jq '.node.signals, .node.meta.statusNote'
# → { exists: false, notLoaded: true }, "L6 · broken · controllers · phantom"

# MemoryConsolidation reflects runtime degraded state from system_health
curl -s localhost:3100/api/node/ctrl_memory_consolidation | jq '.node.meta.statusNote'
# → "L3 · degraded · system_health · Memory store not found — run memory init"
```

---

## Known rough edges

- `util_metadata_filter` has no inbound edges in `edge-registry.js` (no caller currently references it). It appears as a floating node in the graph. Fine for now — it documents that the class exists.
- The frontend `renderControllerBadge` still displays `node.signals`-derived status, not the `entry.lastActivity` field from `hooks_metrics` priority 6. If you want a "Last seen: recent-24h" badge, pull `node.meta.statusNote` which already contains it.
- `BACKEND_PARENT` is a static map in `controller-status.js`. When new stateful backends appear in agentdb, add their id → parent mcpName there; otherwise the classifier will silently skip them.
- The composite cache TTL is 30s by default. `/api/controllers/status?refresh=1` forces a re-fetch.

---

## Related files

- `doc/VIZ-SYMBOL-CLASSIFICATION.md` — the spec this implementation follows (with the Rule 3 ordering correction noted above).
- `doc/VIZ-CONTROLLER-STATUS-AUTO.md` — the 7-source composite spec.
- `node_modules/@claude-flow/cli/dist/src/mcp-tools/agentdb-tools.js` — `agentdb_controllers` tool source.
- `node_modules/@claude-flow/memory/dist/controller-registry.js` — upstream controller registry (source of the 27 names).
