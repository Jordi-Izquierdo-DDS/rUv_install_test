# Next Session 02: Trajectory Panel — Read-Only from Existing Data

**Status:** ✅ DONE (2026-04-19) — all 5 tasks implemented in `viz/src/routes/trajectories.js`; four shims removed from `viz/src/routes/legacy-shims.js`; smoke-tested against live viz on port 3199.

**Project:** `/mnt/data/dev/RFV3_v5_test`
**Depends on:** NEXT_SESSION.md (viz graph update) — can be done independently
**Scope:** viz code ONLY — `.claude/helpers/` is OFF-LIMITS

---

## Constraint

The learning system (daemon + handler in `.claude/helpers/`) is owned separately. The viz is a **read-only consumer** — it reads whatever data the daemon already persists. Do NOT modify the daemon, add IPC endpoints, or request features from the daemon to satisfy viz display needs.

---

## Available data (read-only)

| Source | Path | What's in it |
|---|---|---|
| C4 SQLite | `.swarm/memory.db` table `memory_entries` | Per-trajectory: key, prompt (content), type, tags (positive/negative/neutral, category), metadata JSON |
| C4 metadata | (inside metadata JSON column) | `{ trajectoryId, reward, category, steps, learnStatus, startedAt }` |
| Sona state | `.claude-flow/sona/state.json` | Patterns with model_route, avg_quality, cluster_size, access_count |
| Reasoning bank | `.claude-flow/reasoning-bank/patterns.json` | VerdictAnalyzer output patterns |
| Daemon log | `.claude-flow/data/daemon.log` | Timestamped events: C4 store, rbank persist, daemon start, service init, errors |
| Hook debug log | `.claude-flow/data/hook-debug.log` | Per-hook timing: event type + latency in ms |
| Session | `.claude-flow/data/current-session.json` | `{ sessionId, stepCount, failCount }` |
| Session metrics | `.claude-flow/metrics/session-*.json` | Session-end exports: sonaStats, learnStatus, trajectoryCount |
| Intelligence | `.agentic-flow/intelligence.json` | Q-learning pretrain patterns |

### What's NOT available (in-memory only, discarded)

These exist during trajectory execution but are NOT persisted:
- `routedAgent` — which agent was routed to
- `stepActions[]` — per-step tool name, success/fail, confidence
- `verdict` — rootCause, lessons, improvements from VerdictAnalyzer
- Model used — not captured at all

The viz must work WITHOUT these fields. If the learning system team decides to persist them later (for learning system reasons, not viz reasons), the viz can consume them then.

---

## Tasks

### 1. Build `/api/trajectories` endpoint from C4

**File:** `viz/src/routes/v5.js` or new `viz/src/routes/trajectories.js`

Read directly from `.swarm/memory.db` (read-only, using `better-sqlite3`):

```javascript
app.get('/api/trajectories', (req, res) => {
  const db = openDb('.swarm/memory.db');
  if (!db) return res.json({ trajectories: [], count: 0 });
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const rows = db.prepare(
    "SELECT * FROM memory_entries WHERE namespace='ruflo-v4' AND type='episodic' ORDER BY id DESC LIMIT ?"
  ).all(limit);
  db.close();
  const trajectories = rows.map(r => {
    const m = JSON.parse(r.metadata || '{}');
    return {
      id: r.key,
      prompt: r.content?.slice(0, 200),
      tags: JSON.parse(r.tags || '[]'),
      quality: m.reward,
      category: m.category,
      stepCount: m.steps,
      startedAt: m.startedAt,
      createdAt: r.created_at,
    };
  });
  res.json({ trajectories, count: trajectories.length });
});
```

### 2. Build `/api/trajectories/activity` from logs

Parse daemon.log + hook-debug.log for a live activity feed (read-only):

```javascript
app.get('/api/trajectories/activity', (req, res) => {
  // Read last N lines of daemon.log
  // Classify: "C4 stored" → trajectory event, "rbank persist" → learn event, etc.
  // Read last N lines of hook-debug.log  
  // Classify: PreToolUse/PostToolUse → step events, UserPromptSubmit → trajectory start
  // Return as timeline: [{ timestamp, type, detail }, ...]
});
```

This gives real-time activity without needing daemon changes.

### 3. Build session overview from current-session.json + metrics

**Endpoint:** `/api/session` (replace the shim in `legacy-shims.js:73-80`)

Compose from existing files:
- `current-session.json` → sessionId, stepCount, failCount
- `session-latest.json` → last session metrics (sonaStats, learnStatus, trajectoryCount)
- Sona state → pattern count, route distribution
- Rbank → verdict count

### 4. Replace trajectory shims with real endpoints

**File:** `viz/src/routes/legacy-shims.js`

Remove and replace:
- `/api/trajectories` shim (line 22-24) → real C4 query from task 1
- `/api/trajectories/:id/steps` shim (line 25-27) → return `stepCount` from metadata (no per-step detail available)
- `/api/rewards` shim (line 28-30) → derive from trajectory quality values
- `/api/session` shim (line 73-80) → real composed data from task 3

### 5. Wire the trajectory panel in the Learning Graph

The legacy dashboard (`dashboard.js`) already has trajectory panel rendering code. Verify it works with the response shape from task 1. Adapt field name mappings if needed.

What the panel CAN show (from available data):
- Trajectory list with prompt preview, quality score, category, step count
- Timeline from daemon.log activity
- Session summary with pattern counts

What the panel CANNOT show (data not persisted):
- Per-step drill-down (tool name, success/fail per step)
- Agent routed per trajectory
- Verdict details (rootCause, lessons)

---

## Important notes

- **`.claude/helpers/` is OFF-LIMITS** — do not modify daemon or handler
- **Read-only access** — viz opens SQLite in read-only mode, reads JSON files, parses logs
- **Fix 19a is applied** — new trajectories will have gradient quality (0.1–1.0), not all 1.0
- **State was cleaned** — fresh start, data accumulates as real sessions run
- **Single-writer rule** — the daemon is the sole writer to memory.db. Viz ONLY reads.

---

## Success criteria

1. `/api/trajectories` returns real C4 trajectory entries with prompt, quality, category, step count
2. `/api/trajectories/activity` returns live activity feed from log parsing
3. `/api/session` returns real session data (not shimmed zeros)
4. Trajectory panel in Learning Graph populates with available data
5. No `shim: 'v4-legacy'` markers in trajectory/session API responses
6. Zero changes to `.claude/helpers/*`
