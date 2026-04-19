# Next Session: Fix Legacy Learning Graph for v5

**Project:** `/mnt/data/dev/RFV3_v5_test`
**Priority:** Update the legacy Learning Graph view at `http://localhost:3199/` to show real v5 activity

---

## Context

The Learning Graph view (`viz/public/js/learning-graph.js`, 2043 LOC) is a D3-based force graph that shows:
- **Nodes** — hooks, services, stores, engines (discovered from filesystem)
- **Edges** — relationships: fires, calls, reads, writes, uses, loads
- **Pulses** — cyan animations on edges when activity flows through them
- **Status dots** — green/cyan/yellow/red per node health

It was built for v4 architecture. After v5 migration, it shows "almost empty" because:

1. **13 API endpoints return empty shims** (`viz/src/routes/legacy-shims.js`) — they used to query v4 SQLite tables that no longer exist
2. **Node discovery** (`viz/src/node-discover.js`) scans real files but the v4 node registry (`viz/src/node-registry.js`) doesn't include v5 services
3. **Edge activity** (`viz/src/edge-activity.js`) evaluates edges via a 3-layer waterfall but shimmed endpoints return 0 counts
4. **Pulse system** needs real activity events to animate — shimmed zeros = no pulses

### What works (keep these)
- `/api/graph` — returns 38 discovered nodes + 39 edges from filesystem scan
- `/api/graph/pulse` — lightweight status polling (but only checks EXPECTED_NODES from registry)
- `/api/system/fallback-status` — degradation chain
- `/api/daemon-health` — daemon PID check
- D3 rendering, zoom, drag, side panel, brain-chat — all functional

### What's broken (fix these)
- `/api/architecture-live` → returns zeroed v4 skeleton instead of v5 cycle data
- `/api/trajectories` → empty shim, should read from `.claude-flow/metrics/session-*.json`
- `/api/intelligence` → empty shim, should read from `.agentic-flow/intelligence.json`
- `/api/session` → minimal stub, should include sona stats + rbank counts
- `/api/inspect/*` → empty shims, should read v5 stores
- Pulse system has no events to pulse on

---

## Architecture: What's Where

### Data sources (v5)
| File | Content | Read by |
|---|---|---|
| `.claude-flow/sona/state.json` | Sona patterns (model_route + avg_quality + cluster) | `/api/sona` (v5.js:49) |
| `.claude-flow/reasoning-bank/patterns.json` | ReasoningBank verdicts (VerdictAnalyzer output) | `/api/reasoningbank` (v5.js:104) |
| `.swarm/memory.db` | C4 episodic memory (SQLite, better-sqlite3) | `/api/v5/cycle` (v5.js:256) |
| `.agentic-flow/intelligence.json` | Q-learning patterns from pretrain | `/api/v5/intel` (v5.js:507) |
| `.claude-flow/metrics/session-*.json` | Session export metrics | `/api/v5/trajectories` (v5.js:451) |
| `.claude-flow/data/daemon.log` | Daemon events (startup, C4 store, rbank persist, errors) | `/api/v5/events` (v5.js:568) |
| `.claude-flow/data/current-session.json` | Current session stepCount/failCount | `/api/architecture-live` (shim) |

### Viz code structure
| File | LOC | Purpose |
|---|---|---|
| `viz/src/server.js` | ~50 | Express server, `/` → v5.html, `/legacy` → index.html |
| `viz/src/routes/graph.js` | ~280 | `/api/graph` + `/api/graph/pulse` — node/edge discovery |
| `viz/src/routes/v5.js` | ~616 | v5 API: `/api/sona`, `/api/v5/cycle`, `/api/v5/services`, etc. |
| `viz/src/routes/legacy-shims.js` | 82 | 13 empty shim endpoints (THE PROBLEM) |
| `viz/src/node-registry.js` | ? | EXPECTED_NODES — v4 node IDs and metadata |
| `viz/src/node-discover.js` | ? | Filesystem scan for real nodes |
| `viz/src/edge-discover.js` | ? | Static + dynamic edge discovery |
| `viz/src/edge-activity.js` | ? | 3-layer waterfall: telemetry → file-watch → static |
| `viz/public/js/learning-graph.js` | 2043 | D3 force graph renderer (client-side) |
| `viz/public/js/side-panel.js` | 1071 | Node detail panel |
| `viz/public/js/data-tables.js` | 165 | Table renderers |
| `viz/public/dashboard.js` | 5883 | Compiled v4 dashboard bundle (includes cycle widget) |

### How the legacy graph fetches data
1. **Boot:** `learning-graph.js:1810` → `fetch("/api/graph")` → gets 38 nodes + 39 edges → `render(data)` → D3 force layout
2. **Pulse:** `learning-graph.js:1831` → `buildPulseMaps(nodes, edges)` → `startPulseSystem()` → animates edges with cyan pulses when activity detected
3. **Rescan:** `learning-graph.js:1842` → `fetch("/api/graph?rescan=1")` → re-discovers nodes from filesystem
4. **Cycle widget:** `dashboard.js` → `fetch("/api/architecture-live")` → renders the 6-node cycle overlay → ALL ZEROED (shim)
5. **Side panel inspect:** opens on node click → fetches `/api/inspect/*` → ALL EMPTY (shims)

---

## Tasks

### 1. Replace legacy-shims.js with real v5 data

The cleanest approach: replace each shim with a handler that reads v5 data and returns it in the v4 shape. The legacy graph expects v4 field names — translate on the fly.

**File:** `viz/src/routes/legacy-shims.js`

| Shim endpoint | Read from | Return shape |
|---|---|---|
| `/api/architecture-live` | Compose from sona state + rbank + session + intel | v4 6-node format (map v5 7-node → v4 6-node) |
| `/api/trajectories` | `.claude-flow/metrics/session-*.json` | `{ trajectories: [...], count: N }` |
| `/api/intelligence` | `.agentic-flow/intelligence.json` | `{ graphState: {...}, rankedContext: [...] }` |
| `/api/session` | sona stats + rbank + memory.db | Full session object with real counts |
| `/api/inspect/patterns-stats` | sona state + rbank | `{ shortTerm: sonaCount, longTerm: rbankCount }` |
| `/api/inspect/ewc-fisher` | sona state (ewc_task_count) | `{ fisher: {...}, parameters: N }` |
| `/api/inspect/hm-tiers` | memory.db namespace counts | `{ tiers: {working: N, episodic: N}, total: N }` |

The key one is `/api/architecture-live` — this drives the cycle widget in the dashboard.

### 2. Feed pulse system with real events

The pulse system in `learning-graph.js` animates edges when it detects activity. Currently no activity because shimmed counts are 0.

Options:
- **A.** Have `/api/graph/pulse` read daemon.log tail for recent events and map them to edge IDs
- **B.** Add a `/api/v5/events/stream` SSE endpoint that pushes events as they happen
- **C.** Simply make `/api/graph/pulse` return node signal changes (file mtime comparison)

Option A is simplest: parse last 20 lines of daemon.log, classify events (C4 store → PERSIST edge, rbank persist → JUDGE edge, trajectory begin → CAPTURE edge), return as pulse data.

### 3. Add v5 service nodes to node registry

The node registry (`viz/src/node-registry.js`) has v4 infrastructure nodes. Add v5 services so they appear in the graph:

```
SonaEngine, VerdictAnalyzer, SemanticRouter, TensorCompress,
AdaptiveEmbedder, IntelligenceEngine, NeuralSubstrate, SQLiteBackend
```

Each maps to a daemon service with health checkable via daemon.log presence or socket test.

### 4. Add v5 edges

Connect the new service nodes with edges reflecting the actual data flow:
- hook-handler → (fires) → ruvector-daemon
- ruvector-daemon → (calls) → SonaEngine
- ruvector-daemon → (calls) → VerdictAnalyzer  
- ruvector-daemon → (calls) → SemanticRouter
- SonaEngine → (writes) → sona/state.json
- VerdictAnalyzer → (writes) → reasoning-bank/patterns.json
- SQLiteBackend → (writes) → memory.db

---

## Important notes

- **Fix 19a applied:** Quality gradient now flows through (VerdictAnalyzer used for metadata only). New patterns will have varied avg_quality (0.1–1.0), not all 1.0.
- **Fix 19b applied:** TensorCompress export() now wraps with JSON.stringify().
- **State was cleaned:** All learning state was wiped. First session starts fresh.
- **Don't modify the daemon or handler** — those are correct. Only viz code needs updating.
- **v5 API routes already exist** in `viz/src/routes/v5.js` with all the data you need. Reuse those helpers (`readJson`, `openDb`, `parseSonaStats`).
- **Route swap applied:** Learning Graph is now at `/` (main), v5 data dashboard moved to `/v5`. See `viz/src/server.js`.
- **Original v4 viz source** is at `/mnt/data/dev/rufloV3_bootstrap_v4/viz/` for reference.

---

## Success criteria

1. Legacy graph at `http://localhost:3199/` shows populated nodes with real status dots
2. Cycle widget shows v5 data (sona patterns, rbank verdicts, C4 entries) not zeroes
3. Pulses animate on edges when learning activity occurs (trajectory → store → learn)
4. Side panel inspect shows real pattern/memory counts
5. No more `shim: 'v4-legacy'` markers in any API response
