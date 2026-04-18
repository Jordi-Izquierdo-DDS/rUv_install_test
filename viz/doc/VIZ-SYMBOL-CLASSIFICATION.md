# Viz — Automatic Symbol Classification Guide

> How to automatically classify symbols as controllers, backends, utilities, or plumbing
> so the viz shows each with the right node type, status check, and edges.

---

## Problem

Not every class in `node_modules/agentdb/dist/controllers/` is a real controller. Examples:

- **`MMRDiversityRanker`** — lives in `controllers/` but is a **static utility** (no state, no lifecycle). Shouldn't be shown as a controller.
- **`GraphDatabaseAdapter`** — lives in `backends/` and IS stateful (DB handle, lifecycle), but isn't in the `agentdb_controllers` MCP list either.
- **`HierarchicalMemory`** — real controller, registered, has runtime state.

Hardcoding each one is brittle. This doc defines rules to auto-classify.

---

## The Authoritative Source

**`agentdb_controllers` MCP tool** is the only authoritative source for "what's a real controller":

```javascript
const result = await callMcp('agentdb_controllers', {});
// Returns: { available: true, controllers: [{ name, enabled, level }, ...] }
```

Anything NOT in that response is either a backend, utility, or plumbing. Show those differently (or hide).

---

## Classification Rules (source-parsing)

Apply these rules in order. First match wins.

### Rule 1: Is it in `agentdb_controllers`?

```javascript
const controllers = await mcpCall('agentdb_controllers');
const controllerNames = new Set(controllers.map(c => c.name));

if (controllerNames.has(symbolName)) {
  return { nodeType: 'ctrl', hasLifecycle: true, status: c.enabled ? 'active' : 'disabled' };
}
```

Result: **`ctrl_*` node** (current convention). Status from MCP response.

### Rule 2: Does it have lifecycle methods?

Parse the source file (`.d.ts` or `.js`) for:

```javascript
const lifecyclePattern = /\b(initialize|init|connect|start|open)\s*\(.*?\)[\s\S]*?\b(close|shutdown|stop|disconnect|destroy)\s*\(/;
```

If BOTH init AND close are present → it's a **backend or service**:

```javascript
if (hasInit && hasClose) {
  // Further: does it hold state (private db, config, connection properties)?
  const hasStatefulProps = /private\s+(db|connection|client|pool|embedder):/m.test(source);
  return {
    nodeType: hasStatefulProps ? 'backend' : 'svc',
    hasLifecycle: true,
    statusCheck: 'derive-from-parent-controller'
  };
}
```

Result: **`backend_*` or `svc_*` node**. Status is derived from the controller that uses it (e.g., `memoryGraph` → `graph_db_adapter` means if `memoryGraph` is enabled, the adapter is active).

### Rule 3: Is it static-only?

Parse the source file for:

```javascript
// Count static vs instance methods
const staticMethods = (source.match(/^\s*static\s+\w+\s*\(/gm) || []).length;
const instanceMethods = (source.match(/^\s*(public\s+)?(async\s+)?\w+\s*\(/gm) || []).length - staticMethods;
const hasConstructor = /\bconstructor\s*\(/.test(source);

if (staticMethods > 0 && instanceMethods === 0 && !hasConstructor) {
  return { nodeType: 'util', hasLifecycle: false, statusCheck: 'module-loadable' };
}
```

Result: **`util_*` node**. Status = can the module be imported? No active/idle — only "installed ✓" / "missing ✗".

### Rule 4: Pure function / standalone helper?

```javascript
// Not a class, just exported functions
const isFunction = /^export\s+(async\s+)?function\s+\w+/m.test(source);
const hasNoClass = !/^export\s+class/m.test(source);

if (isFunction && hasNoClass) {
  return { nodeType: 'hide' }; // or 'helper_*' if completeness is needed
}
```

Result: **Hide**. These are plumbing (cosine similarity, path joiners, etc.).

---

## Node Type Reference

| Node type | Purpose | Status check | Has lifecycle? | Examples |
|-----------|---------|--------------|---------------|----------|
| `ctrl_*` | Registered controllers (in `agentdb_controllers` list) | MCP tool response | Yes | `ctrl_reasoning_bank`, `ctrl_hierarchical_memory`, `ctrl_tiered_cache` |
| `svc_*` | Running daemons/processes | PID file + port | Yes | `svc_mcp_http`, `svc_sona_daemon`, `svc_swarm_monitor` |
| `backend_*` | Stateful classes used BY controllers (not top-level) | Inherit from parent controller's status | Yes | `backend_graph_db_adapter`, `backend_hnswlib`, `backend_sqlite` |
| `util_*` | Static utility classes | Module loadable? | No | `util_mmr_diversity_ranker`, `util_bm25_scorer` |
| `eng_*` | Engines (hook scripts, in-process helpers) | Script exists + syntax OK | No | `eng_hook_handler`, `eng_sona_hook_handler` |
| *hidden* | Pure functions, helpers, plumbing | — | — | `cosineSimilarity`, `generateId`, path helpers |

---

## Automatic Discovery Script

Add this to `edge-discover.js` (or a new `symbol-classifier.js`):

```javascript
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const NODE_MODULES = resolve(DATA_ROOT, 'node_modules');

async function classifySymbol(symbolName, mcpCall) {
  // Rule 1: Check agentdb_controllers MCP response
  try {
    const result = await mcpCall('agentdb_controllers', {});
    const ctrls = result?.controllers || [];
    const match = ctrls.find(c => c.name === symbolName ||
                                   c.name.toLowerCase() === symbolName.toLowerCase());
    if (match) {
      return { nodeType: 'ctrl', status: match.enabled ? 'active' : 'disabled', level: match.level };
    }
  } catch {}

  // Find the source file in node_modules
  const candidates = [
    `agentdb/dist/controllers/${symbolName}.js`,
    `agentdb/dist/backends/graph/${symbolName}.js`,
    `agentdb/dist/src/controllers/${symbolName}.js`,
    `agentdb/dist/src/backends/graph/${symbolName}.js`,
    `@claude-flow/memory/dist/${symbolName}.js`,
  ];

  let src = null;
  for (const rel of candidates) {
    const fp = join(NODE_MODULES, rel);
    if (existsSync(fp)) {
      try { src = readFileSync(fp, 'utf8'); break; } catch {}
    }
  }

  if (!src) {
    return { nodeType: 'unknown', available: false };
  }

  // Rule 2: Lifecycle methods → backend/svc
  const hasInit = /\b(initialize|init|connect|start|open)\s*\(/.test(src);
  const hasClose = /\b(close|shutdown|stop|disconnect|destroy)\s*\(/.test(src);
  if (hasInit && hasClose) {
    return { nodeType: 'backend', available: true, statusSource: 'parent-controller' };
  }

  // Rule 3: Static-only → util
  const staticMatches = src.match(/\bstatic\s+\w+\s*\(/g) || [];
  const constructorMatch = /\bconstructor\s*\(/.test(src);
  if (staticMatches.length > 0 && !constructorMatch) {
    return { nodeType: 'util', available: true, statusSource: 'module-loadable' };
  }

  // Rule 4: Plain class with methods — default to backend or hide
  if (/\bclass\s+\w+/.test(src)) {
    return { nodeType: 'backend', available: true, statusSource: 'unknown' };
  }

  // Rule 5: No class, just functions → hide
  return { nodeType: 'hide' };
}
```

---

## Specific Examples (verified via GitNexus MCP)

### `MMRDiversityRanker`

```
Source: node_modules/agentdb/dist/controllers/MMRDiversityRanker.js
Rule matches:
  Rule 1: NOT in agentdb_controllers → skip
  Rule 2: has no initialize() or close() → skip
  Rule 3: all methods are static (rerankWithMMR, calculateDiversityScore) → MATCH
Classification: util_mmr_diversity_ranker
Status: "module-loadable" (installed ✓ / missing ✗)
Edge: ctrl_reasoning_bank → util_mmr_diversity_ranker : uses (optional library)
```

### `GraphDatabaseAdapter`

```
Source: node_modules/agentdb/dist/backends/graph/GraphDatabaseAdapter.js
Rule matches:
  Rule 1: NOT in agentdb_controllers → skip
  Rule 2: has initialize() AND close() → MATCH
Classification: backend_graph_database_adapter
Status: inherit from ctrl_memory_graph (if enabled → adapter active)
Edge: ctrl_memory_graph → backend_graph_database_adapter : uses (DB backend)
Sub-edges:
  backend_graph_database_adapter → json_graph_state : writes (graph-state.json)
  backend_graph_database_adapter → bin_graph_db : uses (ruvector.db)
```

### `ReasoningBank`

```
Source: node_modules/@claude-flow/cli/dist/src/memory/intelligence.js
Rule matches:
  Rule 1: "reasoningBank" IN agentdb_controllers → MATCH
Classification: ctrl_reasoning_bank
Status: active (from MCP response)
Edge: svc_mcp_http → ctrl_reasoning_bank : uses (via registry.get)
```

### `HierarchicalMemory`

```
Rule 1: "hierarchicalMemory" IN agentdb_controllers → MATCH
Classification: ctrl_hierarchical_memory
Status: active (from MCP response)
```

### `cosineSimilarity` (from agentic-flow/src/reasoningbank/utils/mmr.js)

```
Rule 1: NOT in agentdb_controllers → skip
Rule 2: no lifecycle → skip
Rule 3: no class → skip
Rule 5: just a function → HIDE
```

---

## Implementation Steps for the Viz

1. **Add `agentdb_controllers` call on startup** — cache the result for 5 min
2. **Run `classifySymbol()` for each discovered symbol** in node-registry.js
3. **Store classification** in node metadata (`node.symbolType`)
4. **Render accordingly**:
   - `ctrl_*` → current controller rendering (active/idle/broken)
   - `backend_*` → new type: show as sub-node under parent controller
   - `util_*` → new type: small icon, only "installed" badge
   - `hide` → don't add to graph
5. **Edge rules** also use classification:
   - ctrl → backend: `uses` (always)
   - ctrl → util: `uses` (conditional — only if method actually called)
   - backend → store: `reads`/`writes` (based on source parse)

---

## Why This Matters

**Without classification**, the viz shows `MMRDiversityRanker` as a dead/broken controller (because it's not in `agentdb_controllers` and has no health endpoint). Users get confused thinking something is wrong.

**With classification**:
- Users see `ctrl_reasoning_bank` as active (with `util_mmr_ranker` attached as a library indicator)
- Users see `ctrl_memory_graph` as active (with `backend_graph_db_adapter` as its DB backend)
- Plumbing stays hidden
- The viz stops showing false-negative "broken" status for non-controller symbols

---

## Related

- `scripts/patches/daemon-manager.sh` — manages `svc_*` daemons (swarm-monitor, metrics, mcp-http, sona-daemon)
- `_gitNexus_Implemantion_plan_v1/VIZ-SONA-EDGES-SPEC.md` — how to auto-discover edges
- `node_modules/@claude-flow/cli/dist/src/mcp-tools/agentdb-tools.js` — `agentdb_controllers` MCP tool
- `node_modules/@claude-flow/memory/dist/controller-registry.js` — the actual registry
