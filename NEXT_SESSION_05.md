# Next Session 05: Viz Upgrades — Consume Sprint 0 Telemetry

**Project:** `/mnt/data/dev/RFV3_v5_test`
**Scope:** viz code only — `.claude/helpers/` is OFF-LIMITS
**Context:** Learning system Sprint 0 shipped Fix 21 + 22 + 23. New data is now available via the daemon that the viz can render. This doc turns that new data into UX wins.

---

## What the learning system just shipped (new data for viz)

### 1. findPatterns telemetry (Fix 21) — `daemon.log`

Every retrieval now logs one line:
```
2026-04-19T10:11:07.708Z findPatterns: q="implement rust function" hits=3 top=backend-developer@q1.00
```

Parseable format: `timestamp findPatterns: q="<query>" hits=<N> top=<agent>@q<quality>`.

### 2. rbank `usage_count` evolution (Fix 22) — `reasoning-bank/patterns.json`

Patterns retrieved during route() now get explicit feedback on end_trajectory via `record_usage`. Over time, each pattern accumulates:
- `usage_count` — incremented every use
- `success_count` — incremented when trajectory quality ≥ 0.5
- `confidence` — updated by upstream QualityScoringEngine

Fresh state: all patterns at `usage_count: 0, success_count: 0, confidence: 0.5`.
After use: usage grows, confidence diverges toward high-quality patterns.

### 3. EWC++ progress (Fix 23) — daemon `status` IPC

New field in `/api/daemon-health` (or whatever endpoint proxies `status`):
```json
{
  "sona": "{\"trajectories_recorded\":0,...}",
  "ewc": {
    "samples_seen": 4,
    "task_count": 0,
    "remaining_to_detection": 46
  }
}
```

`samples_seen` progresses toward 50 — first EWC consolidation happens when it crosses.

---

## Tasks

### 1. Retrieval Quality dashboard widget (Fix 21 consumer)

**Source:** parse `.claude-flow/data/daemon.log` for `findPatterns:` lines.

**Widget:**
```
Retrieval Quality (last 50 queries)
─────────────────────────────────────
  12.5 queries/session  |  avg hits: 4.2/5
  top-1 quality: 0.85 avg (σ 0.15)
  
  Distribution by top route:
    backend-developer  ████████░░░░  60%
    rust-developer     ████░░░░░░░░  25%
    devops             ██░░░░░░░░░░  10%
    other              █░░░░░░░░░░░   5%
```

**Endpoint:** new `GET /api/retrieval-stats` in `viz/src/routes/trajectories.js`:

```javascript
app.get('/api/retrieval-stats', (req, res) => {
  const lines = readLastLines('.claude-flow/data/daemon.log', 2000);
  const queries = lines
    .map(l => l.match(/findPatterns: q="([^"]*)" hits=(\d+) top=(\S+)@q([\d.]+)/))
    .filter(Boolean)
    .map(([, q, hits, top, quality]) => ({ q, hits: +hits, top, quality: +quality }));
  
  const byTop = {}; queries.forEach(q => { byTop[q.top] = (byTop[q.top]||0)+1; });
  const avgQ = queries.reduce((s,q) => s + q.quality, 0) / (queries.length||1);
  const avgHits = queries.reduce((s,q) => s + q.hits, 0) / (queries.length||1);
  
  res.json({
    count: queries.length,
    avgQuality: avgQ,
    avgHits,
    byTopRoute: byTop,
    recent: queries.slice(-20).reverse(),  // last 20 for live feed
  });
});
```

### 2. Pattern Evolution widget (Fix 22 consumer)

**Source:** `.claude-flow/reasoning-bank/patterns.json` — read `usage_count`, `success_count`, `confidence` per pattern.

**Widget:**
```
Pattern Evolution (12 rbank patterns)
─────────────────────────────────────
  Most used:
    #10  "General"  used 7× / 6 success  (confidence 0.86 ↑)
    #4   "General"  used 5× / 5 success  (confidence 1.00 ↑)
    #8   "General"  used 3× / 1 success  (confidence 0.33 ↓)
  
  Unused (0 usage):
    9 patterns — candidates for pruneLowQuality
```

**Endpoint:** extend `/api/reasoningbank` (already exists in `v5.js`) or new `/api/rbank-evolution`:

```javascript
app.get('/api/rbank-evolution', (req, res) => {
  const rbank = readJson('.claude-flow/reasoning-bank/patterns.json') || [];
  const sorted = [...rbank].sort((a, b) => (b.usage_count||0) - (a.usage_count||0));
  const used = sorted.filter(p => (p.usage_count||0) > 0);
  const unused = sorted.filter(p => (p.usage_count||0) === 0);
  res.json({
    total: rbank.length,
    used: used.length,
    unused: unused.length,
    topUsed: used.slice(0, 10).map(p => ({
      id: p.id,
      category: p.category,
      usage: p.usage_count || 0,
      success: p.success_count || 0,
      confidence: p.confidence || 0,
      trend: (p.success_count||0) / (p.usage_count||1),  // success rate
    })),
  });
});
```

### 3. EWC Progress widget (Fix 23 consumer)

**Source:** call daemon IPC `status`, read `data.ewc`.

**Widget:**
```
EWC++ Consolidation Progress
────────────────────────────
  samples_seen:  ████████░░░░░░░░░░░░  4 / 50
  task_count:    0
  
  First consolidation in ~46 cycles.
  (At ~1 cycle per session = ~46 sessions)
```

Add to the existing daemon-health endpoint or new `/api/ewc-progress` — the daemon already exposes it.

### 4. Switch cycle widget to 7-node v5 (NEXT_SESSION_04 gap)

`buildArchitectureLive()` in `legacy-shims.js` still maps v5 data onto v4's 6-node model. The v5 `/api/v5/cycle` endpoint returns the correct 7-node model (CAPTURE → RETRIEVE → ROUTE → EXECUTE → JUDGE → LEARN → PERSIST + REFINE gap).

**Options:**
- **A.** Have the dashboard render `/api/v5/cycle` directly (switch source, change JS keys)
- **B.** Keep `buildArchitectureLive()` but add a 7th node: rename fields to match v5 phases

Option A cleaner. The compiled `dashboard.js` needs a bundle update — but `public/v5.html` (the v5 dashboard) already does this. Consider whether the legacy `/` view should just redirect to or embed what `/v5` shows for the cycle.

### 5. Session timeline with quality trend

**Source:** `.claude-flow/metrics/session-*.json` (multiple files, each is a session_end snapshot).

**Widget:**
```
Sessions — Quality Trend
────────────────────────
  session 22:55  patterns  2  learn:completed  avgQ —
  session 23:45  patterns 10  learn:completed  avgQ 0.85
  session 00:55  patterns 10  learn:skipped
  session 01:03  patterns 10  learn:skipped
  session 01:20  patterns 15  learn:completed  avgQ 0.87
  session 01:23  patterns 22  learn:completed  avgQ 0.91
  
  Trend: patterns +20 across 6 sessions, quality stable 0.85–0.91
```

**Endpoint:** new `/api/sessions/trend`:

```javascript
app.get('/api/sessions/trend', (req, res) => {
  const dir = '.claude-flow/metrics';
  const files = readdirSync(dir)
    .filter(f => f.startsWith('session-') && f.endsWith('.json') && f !== 'session-latest.json')
    .sort();
  const sessions = files.map(f => {
    const j = readJson(`${dir}/${f}`);
    if (!j) return null;
    const stats = JSON.parse(j.sonaStats || '{}');
    return {
      timestamp: j.exportedAt,
      patterns: stats.patterns_stored || 0,
      trajectories: j.trajectoryCount || 0,
      learnStatus: j.learnStatus || '',
      ewcTasks: stats.ewc_tasks || 0,
    };
  }).filter(Boolean);
  res.json({ sessions, count: sessions.length });
});
```

### 6. Cleanup — dedupe `readMemoryTiers()`

Exists in BOTH `legacy-shims.js:38-61` AND `trajectories.js:428-447`. Same query, same logic. Extract to shared helper in `viz/src/helpers.js`.

---

## What NOT to build

These were in the original backlog but no longer apply:

- **`sona access_count` viewer** — upstream design doesn't track retrieval access on sona patterns. Field is vestigial. Don't render it prominently.
- **TC compression tier display** — TC receives 22 tensors but stays at `level: none` because nobody calls `tc.get()`. Viz showing "0% savings" is accurate but misleading. Hide the TC panel or label it "not active for this workload".
- **"revolutions" metric** — fabricated number. Remove from `architecture-live` response.

---

## Optional — improvement metric script (learning system side)

If the viz team wants a trend chart that's more than session deltas, the learning system team can build a small `scripts/improvement-metric.mjs` (~100 LOC Node) that computes:

- Per-session avg quality
- Pattern growth rate
- findPatterns hit rate from daemon.log
- Flag sessions with regressions

Output is JSON; viz can consume via a new endpoint. **Not needed for the work above — everything above uses data that already exists.**

---

## Priority order

1. **EWC progress widget** (easy, high-value — makes "why no consolidation" self-explanatory)
2. **Retrieval quality widget** (easy, parses daemon.log)
3. **Pattern evolution widget** (easy, reads rbank JSON)
4. **Session trend widget** (easy, reads metrics JSON)
5. **7-node cycle swap** (medium, touches dashboard bundle)
6. **Cleanup + hide misleading panels** (small, but improves signal/noise)

1-4 are all "read a file/IPC, render a widget" — half-day each max. 5 is bigger.

---

## Important notes

- **`.claude/helpers/` is OFF-LIMITS** — everything here reads daemon outputs, nothing modifies the daemon
- **New data is already flowing** — Fix 21/22/23 shipped in daemon (commit `bd96635` → sync `05069a7`). Restart daemon if pre-fix; otherwise already active.
- **Sessions need to accumulate** before widgets 2 and 3 show rich numbers. Early data = mostly zeros. That's not a bug.
- **ewcStats always starts at 0/50** — incremented by background `run_cycle`. Will tick up over sessions.

---

## Success criteria

1. `/api/retrieval-stats` returns last-N findPatterns with route distribution
2. `/api/rbank-evolution` returns per-pattern usage/success/confidence
3. Dashboard shows EWC progress bar (X/50)
4. Dashboard shows session trend (patterns + quality over time)
5. Cycle widget shows 7 v5 nodes (not 6 v4 nodes)
6. TC panel either hidden or labeled "idle — workload doesn't generate cache hits"
