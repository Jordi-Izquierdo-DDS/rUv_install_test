# Next Session 03: Step Drill-Down from JSONL Transcripts

**Project:** `/mnt/data/dev/RFV3_v5_test`
**Depends on:** NEXT_SESSION_02 (trajectory endpoints) — builds on top
**Scope:** viz code ONLY — `.claude/helpers/` is OFF-LIMITS

---

## Problem

The trajectory panel (NEXT_SESSION_02) shows session → trajectory with prompt, quality, category, step count. But no per-step drill-down — the daemon doesn't persist individual steps.

The data IS available read-only in Claude Code's JSONL transcripts.

---

## The mapping (verified)

```
JSONL transcript (one file per session)
  └─ tool_use events: { timestamp, name, input: { file_path, command, old_string, new_string } }

C4 memory.db (trajectory boundaries)
  └─ memory_entries: { key: "trajectory/N", metadata: { startedAt: timestamp, steps: count } }

Match: tool_use events WHERE timestamp BETWEEN trajectory[N].startedAt AND trajectory[N+1].startedAt
```

Verified on live data:
- trajectory/5 (57 daemon steps) → 30 JSONL tool_use events matched by time window
- Each event has: tool name (Read/Edit/Bash/Grep), file_path, command, old/new strings

---

## Available data

### JSONL location
- Path: `~/.claude/projects/<project-hash>/*.jsonl`
- Project hash for v5_test: `-mnt-data-dev-RFV3-v5-test`
- The viz already has `findLatestJsonl()` in `viz/src/helpers.js:64-92`

### JSONL tool_use event structure
```json
{
  "type": "assistant",
  "timestamp": "2026-04-18T23:27:42.565Z",
  "message": {
    "content": [
      {
        "type": "tool_use",
        "name": "Edit",
        "input": {
          "file_path": "/mnt/data/dev/RFV3_v5_test/viz/src/routes/trajectories.js",
          "old_string": "...",
          "new_string": "..."
        }
      }
    ]
  }
}
```

### Tool types and their input fields
| Tool | Key fields |
|---|---|
| Read | `file_path` |
| Edit | `file_path`, `old_string`, `new_string` |
| Write | `file_path`, `content` (large) |
| Bash | `command` |
| Grep | `pattern`, `path` |
| Glob | `pattern`, `path` |

---

## Tasks

### 1. Build `/api/trajectories/:id/steps` endpoint

**File:** `viz/src/routes/trajectories.js`

```javascript
app.get('/api/trajectories/:id/steps', (req, res) => {
  const trajId = parseInt(req.params.id);
  
  // 1. Get trajectory boundaries from C4
  const db = openDb('.swarm/memory.db');
  if (!db) return res.json({ steps: [], count: 0 });
  const rows = db.prepare(
    "SELECT metadata FROM memory_entries WHERE namespace='ruflo-v4' AND type='episodic' ORDER BY id"
  ).all();
  db.close();
  
  const trajectories = rows.map(r => JSON.parse(r.metadata || '{}'));
  const traj = trajectories[trajId];
  if (!traj?.startedAt) return res.json({ steps: [], count: 0 });
  
  const startMs = traj.startedAt;
  const endMs = trajId < trajectories.length - 1 
    ? trajectories[trajId + 1].startedAt 
    : Date.now();
  
  // 2. Read JSONL and extract tool_use events in this time window
  const jsonl = findLatestJsonl(); // already in helpers.js
  if (!jsonl) return res.json({ steps: [], count: 0 });
  
  const content = readFileSync(jsonl.path, 'utf8');
  const steps = [];
  for (const line of content.split('\n')) {
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      const ts = new Date(obj.timestamp).getTime();
      if (ts < startMs || ts >= endMs) continue;
      if (obj.type === 'assistant' && obj.message?.content) {
        for (const b of obj.message.content) {
          if (b.type !== 'tool_use') continue;
          steps.push({
            timestamp: obj.timestamp,
            tool: b.name,
            file: b.input?.file_path || null,
            command: b.name === 'Bash' ? b.input?.command?.slice(0, 200) : null,
            pattern: b.name === 'Grep' ? b.input?.pattern : null,
            // Don't send full old/new strings — too large. Just indicate presence.
            hasEdit: b.name === 'Edit' && !!b.input?.old_string,
          });
        }
      }
    } catch {}
  }
  
  res.json({ steps, count: steps.length, trajectoryId: trajId });
});
```

### 2. Update the trajectory panel to fetch steps on click

When a user clicks a trajectory row in the panel, fetch `/api/trajectories/:id/steps` and render:

```
▶ trajectory/5 — "refactor database queries" (q=1.00, 57 steps, feature)
    23:27:42  Read    ruvector-daemon.mjs
    23:27:43  Read    legacy-shims.js
    23:27:44  Grep    pattern="classifyChange"
    23:27:45  Edit    trajectories.js  ✏️
    23:27:50  Bash    "npm start"
    ...
```

### 3. Handle multi-JSONL (multiple sessions)

`findLatestJsonl()` returns the most recent JSONL. For older trajectories, the viz needs to scan ALL JSONLs. Use `findAllJsonlFiles()` (already in helpers.js:96-126) and match by timestamp range.

### 4. Performance guard

JSONL files can be large (1MB+). Don't parse the entire file for every step request:
- Read from the end (`content.split('\n').slice(-5000)`) for recent trajectories
- Cache parsed events for 30s (like the existing `_activityCache` pattern in helpers.js:136)
- Limit response to 200 steps max

---

## Important notes

- **`.claude/helpers/` is OFF-LIMITS** — all data comes from JSONL + C4, read-only
- **Don't send full edit content** — old/new strings can be huge. Send `hasEdit: true` flag; let UI fetch full diff on demand if needed
- **JSONL path** uses Claude Code's project hash convention: all non-alphanumeric chars → `-`
- **`findLatestJsonl()`** is already in `viz/src/helpers.js:64` — reuse it
- **Privacy:** JSONL contains the full conversation. The step endpoint should only expose tool_use events (tool name, file path, command), NOT user messages or assistant reasoning

---

## Success criteria

1. `/api/trajectories/:id/steps` returns timestamped tool_use events for a given trajectory
2. Clicking a trajectory in the panel shows step drill-down: tool name, file, timestamp
3. Edit steps show file_path + edit indicator (not full content)
4. Bash steps show command preview (truncated)
5. Multi-session JSONL lookup works for older trajectories
6. No daemon changes, no JSONL writes — pure read-only
