# Ready-to-send prompts for viz team

Copy-paste into a session running in `/mnt/data/dev/RFV3_v5_test`. Each prompt is self-contained but references `NEXT_SESSION_05.md` for full context.

---

## Prompt 1 — EWC Progress widget (easiest, high-value)

```
Read NEXT_SESSION_05.md task 3. The daemon now exposes EWC++ consolidation progress 
via its status IPC — new field `data.ewc = { samples_seen, task_count, remaining_to_detection }`. 
The 50-sample gate is upstream calibration, not a bug.

Currently the legacy viz shows "ewc_tasks: 0" which looks broken. Fix it:

1. Add `/api/ewc-progress` endpoint in viz/src/routes/trajectories.js that calls 
   the daemon status IPC (sendCommand pattern, see how /api/daemon-health does it) 
   and returns { samplesSeen, taskCount, remainingToDetection, percent }

2. Expose it in the dashboard as a progress bar replacing the current ewc_tasks 
   display. Show "X/50 samples → first consolidation in ~(50-X) cycles".

3. Test against the running daemon (port depends on viz config). 
   Confirm it updates as sessions run.

The daemon source for this is `sona.ewcStats()` — already live. Just proxy it read-only.

Zero changes to .claude/helpers/.
```

---

## Prompt 2 — Retrieval Quality widget (easy, live data)

```
Read NEXT_SESSION_05.md task 1. The daemon now logs every findPatterns call:

  2026-04-19T10:11:07.708Z findPatterns: q="implement rust function" hits=3 top=backend-developer@q1.00

Build a retrieval-quality widget that parses these from `.claude-flow/data/daemon.log`:

1. Add `/api/retrieval-stats` in viz/src/routes/trajectories.js
   - Tail last ~2000 lines of daemon.log
   - Regex: /findPatterns: q="([^"]*)" hits=(\d+) top=(\S+)@q([\d.]+)/
   - Return: { count, avgQuality, avgHits, byTopRoute, recent[last 20] }

2. Dashboard widget showing:
   - Total queries this session / last N
   - Avg hits, avg top-1 quality
   - Route distribution bar chart (backend-dev, rust-dev, etc.)
   - Scrolling list of last 20 queries with their top route

3. Cache parsed entries with ~10s TTL — don't re-parse the log file on every poll.

Read-only. No daemon changes.
```

---

## Prompt 3 — Pattern Evolution widget

```
Read NEXT_SESSION_05.md task 2. Rbank patterns now evolve via recordUsage feedback.
Each pattern in `.claude-flow/reasoning-bank/patterns.json` has:
  - usage_count (grows each time pattern is retrieved + used)
  - success_count (grows when trajectory quality >= 0.5)
  - confidence (evolves with QualityScoringEngine)

Build a pattern-evolution widget:

1. Add `/api/rbank-evolution` in viz/src/routes/trajectories.js (or extend /api/reasoningbank)
   - Read reasoning-bank/patterns.json
   - Sort by usage_count desc
   - Return: { total, used, unused, topUsed[10 with success_rate + confidence] }

2. Dashboard widget:
   - "Most used" table: id, category, uses, success rate, confidence trend arrow
   - "Unused" count with a note "candidates for pruneLowQuality"

3. Early sessions will show all zeros (no usage yet). That's correct, not a bug — 
   the widget should label this gracefully ("no patterns used yet — run more sessions").

Read-only. No daemon changes.
```

---

## Prompt 4 — Session Trend widget

```
Read NEXT_SESSION_05.md task 5. Each session_end writes a snapshot to 
`.claude-flow/metrics/session-*.json`. Currently there are 7+ files. Each has:
  { exportedAt, sonaStats (JSON string), learnStatus, trajectoryCount, stateBytes }

Build a session trend view:

1. Add `/api/sessions/trend` endpoint:
   - readdirSync(metrics), filter session-*.json (skip session-latest.json)
   - Sort chronologically
   - Parse sonaStats to extract patterns_stored, patterns_learned, ewc_tasks
   - Return array: [{ timestamp, patterns, trajectories, learnStatus, ewcTasks }]

2. Dashboard timeline widget:
   - X axis: session timestamps
   - Y axis: pattern count
   - Annotations: learnStatus (completed/skipped), ewc task boundaries
   - Show pattern growth delta between sessions

3. Bonus: flag any session where patterns DECREASED (regression signal).

Read-only. No daemon changes.
```

---

## Prompt 5 — Switch cycle widget to v5 7-node

```
Read NEXT_SESSION_05.md task 4 AND NEXT_SESSION_04.md task 1. The dashboard's 
cycle widget currently renders v4's 6-node model (route/execute/capture/store/learn/recall) 
via buildArchitectureLive() in legacy-shims.js. But v5's actual cycle is 7 nodes:

  CAPTURE → RETRIEVE → ROUTE → EXECUTE → JUDGE → LEARN → PERSIST
  (+ REFINE gap, deferred per ADR-004)

The correct 7-node data is already returned by /api/v5/cycle (in viz/src/routes/v5.js:246).
Switch the dashboard to render the 7-node version.

Two paths — pick the lighter one:

Option A: add a new "v5 cycle" section in the dashboard that fetches /api/v5/cycle 
and renders it alongside the legacy 6-node (transitional).

Option B: modify the legacy buildArchitectureLive() to return 7-node shape with 
v5 field names (RETRIEVE, JUDGE, PERSIST added). The dashboard.js bundle will need 
to know the new keys — probably a dashboard recompile.

If Option B is too invasive, go with A. Don't rebuild the bundle unless necessary.

Also: remove the "revolutions" field from the response — it's a fabricated metric 
(= trajectoryCount). Show real trajectory count directly.

Read-only. No daemon changes.
```

---

## Prompt 6 — Cleanup pass

```
Read NEXT_SESSION_05.md task 6 + "What NOT to build" section. Three small cleanups:

1. Dedupe readMemoryTiers() — exists in both viz/src/routes/legacy-shims.js:38-61 
   AND viz/src/routes/trajectories.js:428-447. Same queries, same logic. 
   Extract to viz/src/helpers.js as a shared export, import from both.

2. Hide or relabel the TensorCompress panel if it exists. TC stores 22 sona pattern 
   centroids but stays at "level: none" (0% compression) because nobody calls tc.get() 
   in our workload. "0.0% savings" is misleading. Either:
     - Hide the TC panel, OR
     - Label it "idle — workload doesn't generate cache hits" with upstream link

3. Remove "revolutions" metric from /api/architecture-live response — it's 
   fabricated (= trajectoryCount). Show real trajectoryCount directly.

These are low-LOC polish that improve signal/noise.

Read-only. No daemon changes.
```

---

## Suggested batch order

Send them in this order (each prompt independent, can be done in separate sessions):

1. **Prompt 1** (EWC progress) — fastest win, removes "looks broken" confusion
2. **Prompt 2** (retrieval quality) — showcases Fix 21 data, great live demo
3. **Prompt 3** (pattern evolution) — shows Fix 22 working over time
4. **Prompt 4** (session trend) — historical view
5. **Prompt 6** (cleanup) — do before 5 to avoid conflicts
6. **Prompt 5** (7-node cycle) — biggest change, save for last

Or send 1-3 first (they all leverage Sprint 0 new data) and hold 4-6 for a follow-up.

---

## Meta prompt (if you want them to plan first)

```
Read these files in order:
  /mnt/data/dev/RFV3_v5_test/NEXT_SESSION_05.md
  /mnt/data/dev/RFV3_v5_test/NEXT_SESSION_04.md (for context on what was already audited)

Then outline your implementation plan for tasks 1-6 in NEXT_SESSION_05. 
For each task:
  - Which file(s) you'd touch
  - Which existing helpers you'd reuse
  - Estimated LOC
  - Any dependencies between tasks

Do NOT start coding yet — I want to review the plan first.
Zero changes to .claude/helpers/.
```

This lets them think before writing, useful if they want to batch related changes.
