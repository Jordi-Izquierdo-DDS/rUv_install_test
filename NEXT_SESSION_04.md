# Next Session 04: Viz Alignment Audit — Protocol 2 Compliance

**Project:** `/mnt/data/dev/RFV3_v5_test`
**Scope:** viz code review — `.claude/helpers/` is OFF-LIMITS
**Context:** NEXT_SESSION_02 completed (trajectories.js, shims replaced). This doc audits what's correct, what's wrong, and what's missing.

---

## What viz folk did well

### trajectories.js (490 LOC) — solid read-only implementation

1. **JSONL step reconstruction** works correctly — maps C4 `startedAt` windows to tool_use events
2. **Privacy guard** — caps Edit content at 2KB, no user messages or assistant reasoning exposed
3. **Step cache** with 30s TTL — avoids re-parsing JSONL on every request
4. **Multi-JSONL support** — `findAllProjectJsonls()` scans all session files, not just latest
5. **Dashboard-compat shape** — dual fields (v5 + v4 field names) so legacy dashboard.js renders without changes
6. **Activity timeline** — daemon.log + hook-debug.log parsed into typed events (trajectory/learn/error/step)
7. **Session endpoint** — real composed data from sona + rbank + C4 + metrics, replaces empty shim

### legacy-shims.js rewrite (357 LOC) — proper v5-to-v4 translation

1. **`buildArchitectureLive()`** — composes real data for all 6 v4 cycle nodes from v5 stores
2. **Inspect endpoints** — all return real data (pattern counts, EWC state, memory tiers)
3. **No `shim: 'v4-legacy'` markers** — fully replaced
4. **Correct data sources** — reads from state.json/patterns.json/memory.db, not fabricated

---

## What needs fixing

### 1. v5 cycle model is 7 nodes, not 6

**Problem:** `buildArchitectureLive()` maps v5 data into the v4 **6-node** model (route, execute, capture, store, learn, recall). But the v5 architecture is a **7-node** cycle per foxref §3.4:

```
CAPTURE → RETRIEVE → ROUTE → EXECUTE → JUDGE → LEARN → PERSIST
   (+ REFINE gap, deferred ADR-004)
```

The v4 mapping loses:
- **RETRIEVE** (findPatterns + sona boost) — collapsed into "recall"
- **JUDGE** (VerdictAnalyzer) — collapsed into "learn"
- **PERSIST** (5-layer storage) — collapsed into "store"

**Fix:** The Learning Graph should render the 7-node v5 cycle, not force v5 data into v4's 6-node shape. The `/api/v5/cycle` endpoint (v5.js:246-362) already returns the correct 7-node model. Use it directly instead of `/api/architecture-live`.

### 2. "revolutions" metric is misleading

**Problem:** `buildArchitectureLive()` sets `revolutions: trajectoryCount`. In the v4 cycle, a "revolution" was a complete learning cycle (capture → store → learn → recall → improved routing). In v5, `trajectoryCount` is just the number of C4 entries — not verified full-cycle passes.

**Fix:** Don't report trajectoryCount as revolutions. A real revolution requires: trajectory captured + forceLearn produced patterns + pattern accessed via findPatterns. Count only trajectories where `learnStatus` contains "completed" (not "skipped").

### 3. Missing degradation info in architecture-live

**Problem:** The `/api/architecture-live` response has no degradation information. The foxref architecture (§1) specifies graceful degradation as a core property:

```
Full → -rbank → -sona → -SR → -ONNX → -daemon
```

The `/api/v5/degradation` endpoint (v5.js:408-448) returns this. The architecture-live response should include it or the dashboard should fetch both.

### 4. Session bucketing by date is lossy

**Problem:** `sessionBucket()` groups trajectories by UTC date. But multiple sessions can run on the same day, and one session can span midnight. The daemon DOES have session boundaries (SessionStart/SessionEnd hooks in hook-debug.log).

**Fix:** Parse hook-debug.log for `parse(SessionStart)` and `parse(SessionEnd)` timestamps. Use those as session boundaries instead of calendar dates.

---

## What should be deprecated / removed

### 1. `/api/session/end-sim` — dead endpoint

Returns `{ ok: false, simulated: false }`. V4 had simulated session-end for testing. V5 sessions end via the real SessionEnd hook. Remove it.

### 2. Duplicated memory tier logic

`readMemoryTiers()` is implemented in BOTH `legacy-shims.js:38-61` AND `trajectories.js:428-447`. Same logic, same queries. Extract to a shared helper in `helpers.js`.

### 3. Controller-status MCP polling

`api.js` polls MCP tools for controller status every 30s (`initControllerStatus`). This is v4-era — the v5 daemon health is visible via daemon.log and `/api/v5/services`. Check if the MCP polling is still needed or if it can be replaced by daemon log parsing (lighter, no MCP dependency).

---

## What's missing (not built yet)

### 1. Pulse system connected to real events

The Learning Graph has a pulse animation system (`learning-graph.js:buildPulseMaps()`, `startPulseSystem()`) that animates edges when activity flows through them. Currently no activity data feeds it.

**Data available:** `/api/trajectories/activity` returns classified events from daemon.log + hook-debug.log. The pulse system needs to map these to edge IDs in the graph.

**Mapping:**
| Event type | Edge to pulse |
|---|---|
| `prompt` (UserPromptSubmit) | → CAPTURE edge |
| `step` (PreToolUse/PostToolUse) | → EXECUTE edge |
| `trajectory` (C4 stored) | → PERSIST edge |
| `learn` (rbank persist) | → JUDGE/LEARN edge |
| `session-start` | → boot node |
| `session-end` | → PERSIST → CAPTURE feedback edge |

### 2. v5 service nodes in the graph

The node registry (`node-registry.js`) has v4 infrastructure nodes. Add v5 daemon services so they appear:

| Service | Node ID | Health check |
|---|---|---|
| SonaEngine | `svc_sona` | state.json exists + patterns > 0 |
| VerdictAnalyzer | `svc_verdict` | reasoning-bank/patterns.json exists |
| SemanticRouter | `svc_router` | daemon.log contains "semanticRouter: 11 agents" |
| AdaptiveEmbedder | `svc_embedder` | daemon.log contains "384-dim" + "real ONNX" |
| TensorCompress | `svc_tc` | tensor-compress.json exists |
| IntelligenceEngine | `svc_ie` | daemon.log contains "IntelligenceEngine: ready" |
| NeuralSubstrate | `svc_substrate` | daemon.log contains "NeuralSubstrate: ready" |
| SQLiteBackend | `svc_sqlite` | memory.db exists + > 0 rows |

### 3. Quality trend over time

The dashboard shows current quality but no trend. With gradient quality now flowing (Fix 19a), the viz should show quality over time:
- X axis: trajectory index or timestamp
- Y axis: quality (0-1)
- Source: `/api/rewards` endpoint (already built, returns per-trajectory quality)

---

## Protocol 2 compliance checklist

| foxref §3.4 Phase | v5 daemon | viz coverage | Gap |
|---|---|---|---|
| CAPTURE (beginTrajectory) | Done | `/api/trajectories` shows step count | OK |
| RETRIEVE (findPatterns) | Done | Not shown — no "patterns accessed" metric in viz | **Missing** |
| ROUTE (SemanticRouter) | Done | `architecture-live` shows modelDistribution | OK |
| EXECUTE (hook steps) | Done | `/api/trajectories/:id/steps` from JSONL | OK |
| JUDGE (VerdictAnalyzer) | Done | rbank count shown, but no verdict detail | Partial |
| LEARN (forceLearn) | Done | `learnStatus` in metrics, pattern count | OK |
| PERSIST (5 layers) | Done | C4 + sona + rbank counts shown | OK |
| REFINE (deferred) | ADR-004 | Gap node in v5 cycle | OK (deferred) |

**Key gap:** RETRIEVE phase has no viz coverage. The daemon calls findPatterns every prompt, but the viz doesn't show whether patterns were found, which ones, or if they influenced routing. This is the "closed loop" visibility — without it, the operator can't verify the system is actually self-improving.

---

## Important notes

- **`.claude/helpers/` is OFF-LIMITS** — read-only consumer only
- **Use `/api/v5/cycle`** for the 7-node model, not `/api/architecture-live` for the 6-node one
- **foxref-architecture-guide.md** (§1-2) is the reference for loop/phase alignment
- **Don't invent metrics** — show what the data says, not computed scores

---

## Priority order

1. **Switch to 7-node cycle** (uses existing `/api/v5/cycle`) — highest impact, corrects the architecture
2. **Wire pulse system** to `/api/trajectories/activity` — makes the graph feel alive
3. **Add RETRIEVE visibility** — show findPatterns results per trajectory
4. **Add v5 service nodes** — daemon services visible in graph
5. **Quality trend chart** — time-series from `/api/rewards`
6. **Cleanup** — dedupe tiers helper, remove end-sim, fix session bucketing
