// Real read-only endpoints for trajectory/session/rewards/activity views.
//
// The viz is a read-only consumer — the daemon is the sole writer to
// `.swarm/memory.db` (single-writer rule). Every endpoint here composes
// already-persisted data from:
//
//   .swarm/memory.db (C4 memory_entries) — per-trajectory rows
//   .claude-flow/sona/state.json          — SonaEngine patterns
//   .claude-flow/reasoning-bank/patterns.json — ReasoningBank priors
//   .claude-flow/metrics/session-*.json   — per-session exports
//   .claude-flow/data/current-session.json — live hook counter
//   .claude-flow/data/daemon.log          — daemon events
//   .claude-flow/data/hook-debug.log      — per-hook timing events
//
// Replaces shims in legacy-shims.js that previously returned fabricated or
// metrics-only data. Fields the daemon doesn't persist (per-step tool name,
// routed agent, verdict detail) are omitted — spec calls this out.

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';
import net from 'net';
import { openDb, readJson, resolvePath } from '../helpers.js';

const DATA_ROOT = process.env.DATA_ROOT || process.cwd();

// All JSONL transcripts for this project, newest-first.
// Mirrors findLatestJsonl() in helpers.js but returns every .jsonl, not just
// the latest — older trajectories live in rolled-over session files.
function findAllProjectJsonls() {
  const mangled = DATA_ROOT.replace(/[^a-zA-Z0-9]/g, '-');
  const dir = resolve(homedir(), '.claude', 'projects', mangled);
  if (!existsSync(dir)) return [];
  const out = [];
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const fp = join(dir, f);
      try { out.push({ path: fp, mtimeMs: statSync(fp).mtimeMs }); } catch {}
    }
  } catch {}
  out.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return out;
}

// Step cache — keyed by "trajectory/N" string. Per-trajectory drill-down is
// read-heavy on JSONL parse, so cache for STEPS_CACHE_TTL.
const _stepsCache = new Map();
const STEPS_CACHE_TTL = 30000;
const STEPS_LIMIT = 200;
const STEPS_SCAN_LINES = 5000;

function extractToolUseSteps(startMs, endMs) {
  const jsonls = findAllProjectJsonls();
  const steps = [];
  for (const { path: p, mtimeMs } of jsonls) {
    // File last written before window opens → can't contain events in range.
    if (mtimeMs < startMs) continue;
    let content;
    try { content = readFileSync(p, 'utf8'); } catch { continue; }
    const lines = content.split('\n');
    const scan = lines.length > STEPS_SCAN_LINES ? lines.slice(-STEPS_SCAN_LINES) : lines;
    for (const line of scan) {
      if (!line) continue;
      let obj;
      try { obj = JSON.parse(line); } catch { continue; }
      if (obj.type !== 'assistant' || !obj.message?.content) continue;
      const ts = obj.timestamp ? new Date(obj.timestamp).getTime() : 0;
      if (!ts || ts < startMs || ts >= endMs) continue;
      for (const b of obj.message.content) {
        if (b.type !== 'tool_use') continue;
        const inp = b.input || {};
        // Project only tool-intent fields — NO old/new_string content,
        // NO user messages, NO assistant reasoning. Privacy + payload size.
        const tool = b.name;
        const file = typeof inp.file_path === 'string' ? inp.file_path : null;
        // Full Bash command (renderer truncates display to 80ch + shows full in title tooltip).
        const command = tool === 'Bash' && typeof inp.command === 'string'
          ? inp.command.slice(0, 4000) : null;
        const pattern = (tool === 'Grep' || tool === 'Glob') && typeof inp.pattern === 'string'
          ? inp.pattern : null;
        const path = (tool === 'Grep' || tool === 'Glob') && typeof inp.path === 'string'
          ? inp.path : null;
        const description = tool === 'Bash' && typeof inp.description === 'string'
          ? inp.description : null;
        // Edit diffs render inline when both old/new are present. Cap at 2KB each
        // to bound payload — a single pathological Edit could be MBs otherwise.
        const EDIT_CAP = 2000;
        const truncMark = '\n…[truncated]';
        const old_string = tool === 'Edit' && typeof inp.old_string === 'string'
          ? (inp.old_string.length > EDIT_CAP ? inp.old_string.slice(0, EDIT_CAP) + truncMark : inp.old_string)
          : null;
        const new_string = tool === 'Edit' && typeof inp.new_string === 'string'
          ? (inp.new_string.length > EDIT_CAP ? inp.new_string.slice(0, EDIT_CAP) + truncMark : inp.new_string)
          : null;
        // Compact action label used by the renderer as a fallback when meta
        // isn't consulted. Keep it concise.
        const actionTarget = file || pattern || command || '';
        const action = actionTarget ? `${tool}: ${actionTarget}` : tool;
        steps.push({
          // Flat shape (for future viz use / external consumers)
          timestamp: obj.timestamp,
          tool,
          file,
          command,
          pattern,
          hasEdit: tool === 'Edit' && !!inp.old_string,
          // Dashboard-compat shape: viz/public/dashboard.js renderStepDetail()
          // reads step_number, reward, action, meta.{tool,file,pattern,command,path}.
          // reward is null — JSONL has no per-step reward signal.
          step_number: steps.length + 1,
          reward: null,
          action,
          meta: { tool, file, pattern, command, path, description, old_string, new_string },
        });
        if (steps.length >= STEPS_LIMIT) return steps;
      }
    }
  }
  return steps;
}

const MEMORY_DB    = '.swarm/memory.db';
const SONA_STATE   = '.claude-flow/sona/state.json';
const RBANK        = '.claude-flow/reasoning-bank/patterns.json';
const CUR_SESSION  = '.claude-flow/data/current-session.json';
const METRICS_DIR  = '.claude-flow/metrics';
const METRICS_LAST = '.claude-flow/metrics/session-latest.json';
const DAEMON_LOG   = '.claude-flow/data/daemon.log';
const HOOK_LOG     = '.claude-flow/data/hook-debug.log';
const DAEMON_SOCK  = '.claude-flow/ruvector-daemon.sock';
const EWC_TARGET_SAMPLES = 50;

// One-shot line-framed IPC to the ruvector daemon — mirror of the client in
// .claude/helpers/hook-handler.cjs:108 (sendCommand). Read-only here; the
// daemon stays the sole writer (single-writer rule). Timeout short so a dead
// socket never hangs the dashboard poll.
function daemonStatus(timeoutMs = 1500) {
  return new Promise((resolve) => {
    const sockPath = resolvePath(DAEMON_SOCK);
    if (!existsSync(sockPath)) return resolve(null);
    let done = false;
    const settle = (v) => { if (!done) { done = true; resolve(v); } };
    const sock = net.createConnection(sockPath, () => {
      sock.write(JSON.stringify({ command: 'status' }) + '\n');
    });
    const timer = setTimeout(() => { sock.destroy(); settle(null); }, timeoutMs);
    let buf = '';
    sock.on('data', (d) => {
      buf += d.toString();
      const i = buf.indexOf('\n');
      if (i !== -1) {
        clearTimeout(timer);
        try { settle(JSON.parse(buf.slice(0, i))); } catch { settle(null); }
        sock.destroy();
      }
    });
    sock.on('error', () => { clearTimeout(timer); settle(null); });
  });
}

// ─── findPatterns retrieval-stats log parser ──────────────────────
// Fix 21: the daemon logs one line per findPatterns call, format:
//   <iso-ts> findPatterns: q="<query>" hits=<N> top=<agent>@q<quality>
// Parse the tail of daemon.log, aggregate, and cache for RETRIEVAL_TTL so
// dashboard polls don't hammer the filesystem.
const RETRIEVAL_LINES   = 2000;
const RETRIEVAL_TTL_MS  = 10000;
const RETRIEVAL_RECENT  = 20;
const RETRIEVAL_REGEX   = /findPatterns: q="([^"]*)" hits=(\d+) top=(\S+)@q([\d.]+)/;
let _retrievalCache = null; // { ts, sig, payload }

function computeRetrievalStats() {
  const p = resolvePath(DAEMON_LOG);
  if (!existsSync(p)) {
    return { count: 0, avgQuality: 0, avgHits: 0, byTopRoute: {}, recent: [], source: DAEMON_LOG, present: false };
  }
  const stat = statSync(p);
  const sig = `${stat.size}:${stat.mtimeMs}`;
  const now = Date.now();
  if (_retrievalCache && _retrievalCache.sig === sig && (now - _retrievalCache.ts) < RETRIEVAL_TTL_MS) {
    return _retrievalCache.payload;
  }

  let content;
  try { content = readFileSync(p, 'utf8'); }
  catch { return { count: 0, avgQuality: 0, avgHits: 0, byTopRoute: {}, recent: [], source: DAEMON_LOG, present: false }; }

  const lines = content.split('\n');
  const scan = lines.length > RETRIEVAL_LINES ? lines.slice(-RETRIEVAL_LINES) : lines;
  const queries = [];
  for (const line of scan) {
    if (!line || line.indexOf('findPatterns:') === -1) continue;
    const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+/);
    const m = line.match(RETRIEVAL_REGEX);
    if (!m) continue;
    queries.push({
      timestamp: tsMatch ? tsMatch[1] : null,
      q: m[1],
      hits: Number(m[2]),
      top: m[3],
      quality: Number(m[4]),
    });
  }

  const n = queries.length;
  const avgQuality = n ? queries.reduce((s, q) => s + q.quality, 0) / n : 0;
  const avgHits = n ? queries.reduce((s, q) => s + q.hits, 0) / n : 0;
  const byTopRoute = {};
  for (const q of queries) byTopRoute[q.top] = (byTopRoute[q.top] || 0) + 1;

  const payload = {
    count: n,
    avgQuality: Number(avgQuality.toFixed(3)),
    avgHits: Number(avgHits.toFixed(2)),
    byTopRoute,
    recent: queries.slice(-RETRIEVAL_RECENT).reverse(),
    source: DAEMON_LOG,
    present: true,
    cachedAt: now,
  };
  _retrievalCache = { ts: now, sig, payload };
  return payload;
}

function safeJson(s, fallback) {
  if (s == null || s === '') return fallback;
  try { return JSON.parse(s); } catch { return fallback; }
}

function verdictLabel(q) {
  if (q == null) return 'unknown';
  if (q >= 0.6) return 'success';
  if (q < 0.4) return 'abandoned';
  return 'partial';
}

// Bucket trajectories into session-like groups by calendar date (UTC). The
// daemon doesn't persist a session_id in metadata, and the dashboard renders
// Session → Trajectory headers — bucketing by day is a stable proxy.
function sessionBucket(ms) {
  if (!ms) return 'unknown';
  const d = new Date(ms);
  if (isNaN(d.getTime())) return 'unknown';
  return d.toISOString().slice(0, 10);
}

function readTrajectoriesFromC4(limit) {
  const db = openDb(MEMORY_DB);
  if (!db) return [];
  try {
    return db.prepare(
      "SELECT id as memId, key, content, tags, metadata, created_at " +
      "FROM memory_entries " +
      "WHERE namespace='ruflo-v4' AND type='episodic' " +
      "ORDER BY created_at DESC LIMIT ?"
    ).all(limit);
  } catch { return []; }
  finally { db.close(); }
}

function toTrajectory(row) {
  const m = safeJson(row.metadata, {});
  const tags = safeJson(row.tags, []);
  const quality = typeof m.reward === 'number' ? m.reward : null;
  const stepCount = typeof m.steps === 'number' ? m.steps : 0;
  const startedMs = typeof m.startedAt === 'number' ? m.startedAt : row.created_at;
  const endedMs = row.created_at;
  const verdict = verdictLabel(quality);
  const bucket = sessionBucket(startedMs);
  const idStr = m.trajectoryId != null ? String(m.trajectoryId) : row.key;
  return {
    // Spec-mandated shape
    id: idStr,
    memId: row.memId,
    key: row.key,
    prompt: (row.content || '').slice(0, 200),
    tags,
    quality,
    category: m.category || 'unknown',
    stepCount,
    startedAt: startedMs,
    createdAt: row.created_at,
    learnStatus: m.learnStatus ?? null,
    // Dashboard-compat aliases (viz/public/dashboard.js expects v4 field names).
    // No new data — just different labels on the same values.
    task: row.content || '',
    session_id: bucket,
    total_steps: stepCount,
    actual_steps: stepCount,
    total_reward: quality != null ? quality * stepCount : 0,
    verdict,
    status: 'ended',
    started_at: new Date(startedMs).toISOString(),
    ended_at: new Date(endedMs).toISOString(),
  };
}

export function registerTrajectoryRoutes(app) {
  // ─── /api/trajectories ────────────────────────────────────────
  app.get('/api/trajectories', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
      const rows = readTrajectoriesFromC4(limit);
      const trajectories = rows.map(toTrajectory);
      res.json({ trajectories, count: trajectories.length, source: MEMORY_DB });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── /api/trajectories/activity ───────────────────────────────
  // Live-ish timeline built from two log tails, classified into event kinds
  // the UI can render without knowing log formats. MUST come before
  // /api/trajectories/:id/steps so Express doesn't match 'activity' as :id.
  app.get('/api/trajectories/activity', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 120, 600);
      const events = [];

      const daemonPath = resolvePath(DAEMON_LOG);
      if (existsSync(daemonPath)) {
        const lines = readFileSync(daemonPath, 'utf8').split('\n').filter(Boolean).slice(-limit);
        for (const line of lines) {
          const m = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)$/);
          if (!m) continue;
          const [, ts, msg] = m;
          let type = 'info';
          let detail = msg;
          if (/^C4 stored: trajectory\/(\d+) quality=(\S+)/.test(msg)) {
            const cm = msg.match(/^C4 stored: trajectory\/(\d+) quality=(\S+)/);
            type = 'trajectory';
            detail = `trajectory ${cm[1]} stored (quality ${cm[2]})`;
          } else if (/reasoningBank|patterns/.test(msg)) {
            type = 'learn';
          } else if (/error|FAILED|failed/i.test(msg)) {
            type = 'error';
          } else if (/ready|loaded|restored|patched|warm/.test(msg)) {
            type = 'ready';
          }
          events.push({ timestamp: ts, source: 'daemon', type, detail });
        }
      }

      const hookPath = resolvePath(HOOK_LOG);
      if (existsSync(hookPath)) {
        const lines = readFileSync(hookPath, 'utf8').split('\n').filter(Boolean).slice(-limit);
        for (const line of lines) {
          const m = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+\[timing\]\s+(.*?)\+(\d+)ms$/);
          if (!m) continue;
          const [, ts, stage, ms] = m;
          const evt = stage.match(/^parse\(([^)]+)\)/);
          if (!evt) continue;
          const hook = evt[1];
          let type = 'step';
          if (hook === 'UserPromptSubmit') type = 'prompt';
          else if (hook === 'Stop' || hook === 'SubagentStop') type = 'stop';
          else if (hook === 'SessionStart') type = 'session-start';
          else if (hook === 'SessionEnd') type = 'session-end';
          events.push({ timestamp: ts, source: 'hook', type, detail: hook, latencyMs: Number(ms) });
        }
      }

      events.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
      const top = events.slice(0, limit);
      const counts = top.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {});
      res.json({ events: top, counts, count: top.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── /api/trajectories/:id/steps ──────────────────────────────
  // Reconstruct per-step drill-down by joining C4 trajectory boundaries with
  // Claude Code JSONL tool_use events. The daemon doesn't persist per-step
  // detail, but the JSONL transcript does (read-only, Claude-Code-owned).
  //   window   = [this.startedAt, next.startedAt or now)
  //   events   = assistant.message.content[].type === 'tool_use' in window
  //   project  = tool name, file_path, command (Bash, truncated), pattern (Grep)
  // No old/new_string content, no user/assistant text — privacy + payload.
  app.get('/api/trajectories/:id/steps', (req, res) => {
    try {
      // :id accepts three forms:
      //   "trajectory/N" or "N"  → legacy key (may have duplicates across sessions;
      //                            we pick the most recent by id DESC)
      //   "mem_..."              → unique C4 row id (preferred, no ambiguity)
      const rawId = String(req.params.id);
      const isMemId = rawId.startsWith('mem_');
      const key = isMemId
        ? rawId
        : (rawId.startsWith('trajectory/') ? rawId : `trajectory/${rawId}`);

      const cacheKey = isMemId ? `mem:${key}` : `key:${key}`;
      const cached = _stepsCache.get(cacheKey);
      if (cached && (Date.now() - cached.ts) < STEPS_CACHE_TTL) {
        return res.json(cached.payload);
      }

      const db = openDb(MEMORY_DB);
      if (!db) {
        return res.json({ trajectoryId: req.params.id, steps: [], stepCount: 0, count: 0, found: false });
      }

      let found = false, stepCount = 0, startMs = null, endMs = Date.now();
      try {
        const row = isMemId
          ? db.prepare(
              "SELECT metadata FROM memory_entries WHERE id=? AND namespace='ruflo-v4'"
            ).get(key)
          : db.prepare(
              // Most recent duplicate wins — daemon resets trajectory counter per session.
              "SELECT metadata FROM memory_entries WHERE key=? AND namespace='ruflo-v4' ORDER BY id DESC LIMIT 1"
            ).get(key);
        if (row) {
          found = true;
          const m = safeJson(row.metadata, {});
          stepCount = typeof m.steps === 'number' ? m.steps : 0;
          if (typeof m.startedAt === 'number') startMs = m.startedAt;
        }

        if (startMs != null) {
          // Find the next trajectory's startedAt to bound the window.
          const others = db.prepare(
            "SELECT metadata FROM memory_entries WHERE namespace='ruflo-v4' AND type='episodic'"
          ).all();
          let nextStart = null;
          for (const r of others) {
            const mm = safeJson(r.metadata, {});
            if (typeof mm.startedAt === 'number' && mm.startedAt > startMs) {
              if (nextStart == null || mm.startedAt < nextStart) nextStart = mm.startedAt;
            }
          }
          if (nextStart != null) endMs = nextStart;
        }
      } finally { db.close(); }

      const steps = (found && startMs != null) ? extractToolUseSteps(startMs, endMs) : [];
      const payload = {
        trajectoryId: req.params.id,
        steps,
        count: steps.length,
        stepCount,
        found,
        window: startMs != null ? { startMs, endMs } : null,
        source: 'jsonl-transcript',
      };
      _stepsCache.set(key, { ts: Date.now(), payload });
      res.json(payload);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── /api/rewards ─────────────────────────────────────────────
  // Derive a reward point per trajectory from C4 quality. Dashboard reward
  // heatmap expects rows with {timestamp, reward, …} — sorted ascending by
  // timestamp at the consumer, but we hand back newest-first for consistency.
  app.get('/api/rewards', (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit, 10) || 500, 2000);
      const rows = readTrajectoriesFromC4(limit);
      const rewards = rows
        .map(r => {
          const m = safeJson(r.metadata, {});
          if (typeof m.reward !== 'number') return null;
          return {
            timestamp: r.created_at,
            trajectoryId: m.trajectoryId ?? r.key,
            reward: m.reward,
            category: m.category || 'unknown',
            stepCount: m.steps || 0,
            source: 'c4-trajectory',
          };
        })
        .filter(Boolean);
      res.json({
        rewards,
        count: rewards.length,
        captured: rewards.length > 0,
        learned: rewards.length,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── /api/retrieval-stats ─────────────────────────────────────
  // Fix 21: per-query findPatterns telemetry from daemon.log. Read-only,
  // parses the last ~2000 lines, cached for 10s (keyed on file size+mtime so
  // growing the log invalidates faster than the TTL).
  app.get('/api/retrieval-stats', (req, res) => {
    try {
      res.json(computeRetrievalStats());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── /api/rbank-evolution ─────────────────────────────────────
  // Fix 22: per-pattern usage/success/confidence evolution from rbank JSON.
  // Patterns accumulate record_usage feedback across trajectories — this
  // endpoint surfaces which ones actually fired, how often, and how their
  // confidence has moved vs the 0.5 starting prior. Early sessions are all
  // zeros by design (no trajectories have ended yet); the UI labels that.
  app.get('/api/rbank-evolution', (req, res) => {
    try {
      const raw = readJson(RBANK) || [];
      const rbank = Array.isArray(raw) ? raw : [];
      const sorted = [...rbank].sort(
        (a, b) => (b.usage_count || 0) - (a.usage_count || 0)
      );
      const used = sorted.filter(p => (p.usage_count || 0) > 0);
      const unused = sorted.filter(p => (p.usage_count || 0) === 0);
      const BASELINE = 0.5; // rbank starting prior
      const topUsed = used.slice(0, 10).map(p => {
        const usage = p.usage_count || 0;
        const success = p.success_count || 0;
        const confidence = typeof p.confidence === 'number' ? p.confidence : 0;
        const successRate = usage > 0 ? success / usage : 0;
        const delta = confidence - BASELINE;
        const trend = delta > 0.05 ? 'up' : delta < -0.05 ? 'down' : 'flat';
        return {
          id: p.id,
          uuid: p.uuid,
          category: p.category || 'unknown',
          usage,
          success,
          successRate: Number(successRate.toFixed(3)),
          confidence: Number(confidence.toFixed(3)),
          avgQuality: typeof p.avg_quality === 'number' ? Number(p.avg_quality.toFixed(3)) : null,
          trend,
          confidenceDelta: Number(delta.toFixed(3)),
          lastAccessed: p.last_accessed || null,
          sourceTrajectories: Array.isArray(p.source_trajectories) ? p.source_trajectories : [],
        };
      });
      res.json({
        total: rbank.length,
        used: used.length,
        unused: unused.length,
        baseline: BASELINE,
        topUsed,
        source: RBANK,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── /api/sessions/trend ──────────────────────────────────────
  // NEXT_SESSION_05 task 5: chronological session snapshots for a trend
  // widget. Each session_end emits `.claude-flow/metrics/session-<ts>.json`;
  // this endpoint composes that directory (skipping session-latest.json,
  // which is a symlink-style copy) into an ordered series. Pattern-count
  // deltas drive the growth annotation, and any negative delta is flagged
  // as a regression candidate so the dashboard can light it up.
  app.get('/api/sessions/trend', (req, res) => {
    try {
      const dir = resolvePath(METRICS_DIR);
      if (!existsSync(dir)) {
        return res.json({ sessions: [], count: 0, regressions: 0, source: METRICS_DIR, present: false });
      }
      const files = readdirSync(dir)
        .filter(f => f.startsWith('session-') && f.endsWith('.json') && f !== 'session-latest.json')
        .sort(); // filenames carry ms timestamp — lexical sort == chronological
      // learnStatus in the raw snapshot is a verbose sentence
      // ("Forced learning: N trajectories -> M patterns, status: completed").
      // Classify into a normalized token for counters + badge colors; keep
      // the original string as learnStatusRaw for tooltips.
      const classifyLearn = (s) => {
        if (!s || typeof s !== 'string') return 'unknown';
        const m = s.match(/status:\s*([a-z_]+)/i);
        if (m) return m[1].toLowerCase();
        if (/completed/i.test(s)) return 'completed';
        if (/skipped/i.test(s)) return 'skipped';
        if (/failed|error/i.test(s)) return 'failed';
        return 'unknown';
      };
      const rows = [];
      for (const f of files) {
        const raw = readJson(`${METRICS_DIR}/${f}`);
        if (!raw) continue;
        let stats = {};
        try { stats = raw.sonaStats ? JSON.parse(raw.sonaStats) : {}; } catch {}
        rows.push({
          file: f,
          id: f.replace(/^session-/, '').replace(/\.json$/, ''),
          exportedAt: raw.exportedAt || null,
          timestampMs: raw.exportedAt ? new Date(raw.exportedAt).getTime() : null,
          patterns: Number(stats.patterns_stored) || 0,
          patternsLearned: Number(stats.patterns_learned) || 0,
          trajectories: Number(raw.trajectoryCount) || 0,
          trajectoriesRecorded: Number(stats.trajectories_recorded) || 0,
          learnStatus: classifyLearn(raw.learnStatus),
          learnStatusRaw: raw.learnStatus || null,
          ewcTasks: Number(stats.ewc_tasks) || 0,
          stateBytes: Number(raw.stateBytes) || 0,
        });
      }
      // Deltas + regression flag. Pattern count is cumulative across sessions,
      // so a negative delta = patterns dropped (prune, corruption, or reset).
      let regressions = 0;
      let prevPatterns = null;
      let prevEwcTasks = null;
      for (const r of rows) {
        r.patternDelta = prevPatterns == null ? null : r.patterns - prevPatterns;
        r.regression = r.patternDelta != null && r.patternDelta < 0;
        r.ewcBoundary = prevEwcTasks != null && r.ewcTasks > prevEwcTasks;
        if (r.regression) regressions += 1;
        prevPatterns = r.patterns;
        prevEwcTasks = r.ewcTasks;
      }
      const last = rows[rows.length - 1];
      const first = rows[0];
      const totals = {
        sessions: rows.length,
        regressions,
        patternGrowth: first && last ? last.patterns - first.patterns : 0,
        firstPatterns: first?.patterns ?? 0,
        lastPatterns: last?.patterns ?? 0,
        learnCompleted: rows.filter(r => r.learnStatus === 'completed').length,
        learnSkipped: rows.filter(r => r.learnStatus === 'skipped').length,
      };
      res.json({ sessions: rows, count: rows.length, totals, source: METRICS_DIR, present: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── /api/ewc-progress ────────────────────────────────────────
  // Live EWC++ consolidation progress from the daemon (Fix 23). The 50-sample
  // gate is upstream calibration: the first consolidation fires once
  // samples_seen crosses EWC_TARGET_SAMPLES. Before then, ewc_task_count stays
  // at 0 — that's expected, not a bug. This endpoint surfaces the progress so
  // the dashboard can show "4/50 samples" instead of a misleading "0 tasks".
  app.get('/api/ewc-progress', async (req, res) => {
    try {
      const status = await daemonStatus();
      const ewc = status?.ok && status?.data?.ewc ? status.data.ewc : null;
      if (!ewc) {
        return res.json({
          available: false,
          samplesSeen: 0,
          taskCount: 0,
          remainingToDetection: EWC_TARGET_SAMPLES,
          percent: 0,
          target: EWC_TARGET_SAMPLES,
          reason: existsSync(resolvePath(DAEMON_SOCK)) ? 'daemon-unreachable' : 'no-socket',
        });
      }
      const samplesSeen = Number(ewc.samples_seen) || 0;
      const remaining = ewc.remaining_to_detection != null
        ? Number(ewc.remaining_to_detection)
        : Math.max(0, EWC_TARGET_SAMPLES - samplesSeen);
      const percent = Math.min(100, Math.round((samplesSeen / EWC_TARGET_SAMPLES) * 100));
      res.json({
        available: true,
        samplesSeen,
        taskCount: Number(ewc.task_count) || 0,
        remainingToDetection: remaining,
        percent,
        target: EWC_TARGET_SAMPLES,
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─── /api/session ─────────────────────────────────────────────
  // Composed session overview from already-persisted sources. Replaces the
  // legacy-shim version so the endpoint reflects real state rather than a
  // v4-shaped fabrication. Shape preserves the keys dashboard.js reads
  // (current, sessions, episodes, policies, memoryStats) so the panel keeps
  // rendering without needing parallel changes in the compiled bundle.
  app.get('/api/session', (req, res) => {
    try {
      const current = readJson(CUR_SESSION) || {};
      const latest = readJson(METRICS_LAST) || {};
      const sona = readJson(SONA_STATE) || {};
      const rbankRaw = readJson(RBANK) || [];
      const rbank = Array.isArray(rbankRaw) ? rbankRaw : [];
      let stats = null;
      try { stats = latest.sonaStats ? JSON.parse(latest.sonaStats) : null; } catch {}

      const sessions = [];
      const dir = resolvePath(METRICS_DIR);
      if (existsSync(dir)) {
        const files = readdirSync(dir)
          .filter(f => f.startsWith('session-') && f.endsWith('.json') && f !== 'session-latest.json')
          .sort().reverse().slice(0, 20);
        for (const f of files) {
          const raw = readJson(`${METRICS_DIR}/${f}`);
          if (!raw) continue;
          sessions.push({
            id: f.replace('.json', ''),
            sessionId: raw.sessionId || f,
            createdAt: raw.exportedAt,
            stepCount: raw.trajectoryCount || 0,
            learnStatus: raw.learnStatus,
          });
        }
      }

      // Memory totals + tier grouping from C4 (namespace heuristic).
      const db = openDb(MEMORY_DB);
      let memEntries = 0;
      const tiers = { working: 0, episodic: 0, semantic: 0 };
      if (db) {
        try {
          memEntries = db.prepare('SELECT COUNT(*) as c FROM memory_entries').get().c;
          const groups = db.prepare(
            "SELECT namespace, COUNT(*) as c FROM memory_entries GROUP BY namespace"
          ).all();
          for (const { namespace, c } of groups) {
            const ns = (namespace || '').toLowerCase();
            if (ns.includes('semantic') || ns.includes('long')) tiers.semantic += c;
            else if (ns.includes('episodic') || ns.includes('session')) tiers.episodic += c;
            else tiers.working += c;
          }
        } finally { db.close(); }
      }
      if (tiers.working + tiers.episodic + tiers.semantic === 0 && memEntries > 0) {
        tiers.working = memEntries;
      }

      const sonaPatterns = sona.patterns || [];
      res.json({
        current: {
          ...current,
          sonaPatterns: sonaPatterns.length,
          rbankPatterns: rbank.length,
          memEntries,
        },
        sessions,
        episodes: rbank.map(p => ({
          id: p.id,
          uuid: p.uuid,
          category: p.category,
          confidence: p.confidence,
          usageCount: p.usage_count,
          successCount: p.success_count,
          createdAt: p.created_at,
        })),
        policies: sonaPatterns.map(p => ({
          id: p.id,
          patternType: p.pattern_type,
          modelRoute: p.model_route,
          avgQuality: p.avg_quality,
          clusterSize: p.cluster_size,
          accessCount: p.access_count,
        })),
        learningSessions: sessions,
        hierarchical: tiers,
        memoryStats: {
          total: memEntries,
          patternsLearned: stats?.patterns_learned ?? 0,
          patternsStored: stats?.patterns_stored ?? 0,
          trajectoriesBuffered: stats?.trajectories_buffered ?? 0,
          trajectoriesRecorded: stats?.trajectories_recorded ?? 0,
          ewcTasks: sona.ewc_task_count || 0,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
