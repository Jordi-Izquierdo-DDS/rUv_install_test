// Legacy v4 endpoint adapters — serve real v5 data in v4 wire shape.
//
// The compiled v4 dashboard bundle (viz/public/dashboard.js) and the legacy
// Learning Graph both poll endpoints that used to query v4 SQLite tables
// (trajectories, episodes, hierarchical_memory, ewc_fisher). Those tables
// don't exist in v5. Rather than return empty shims, we read the canonical
// v5 stores and translate on the fly so the legacy UI renders real state.
//
// Data sources (see viz/src/routes/v5.js for the canonical readers):
//   .claude-flow/sona/state.json               — Sona patterns + ewc_task_count
//   .claude-flow/reasoning-bank/patterns.json  — ReasoningBank verdicts
//   .agentic-flow/intelligence.json            — pretrain Q-table
//   .swarm/memory.db                           — C4 memory_entries
//   .claude-flow/metrics/session-*.json        — session exports
//   .claude-flow/data/current-session.json     — live session counter
//   .claude-flow/data/daemon.log               — service events

import { existsSync, readdirSync } from 'fs';
import { openDb, readJson, fileStat, resolvePath } from '../helpers.js';

const SONA_STATE   = '.claude-flow/sona/state.json';
const RBANK        = '.claude-flow/reasoning-bank/patterns.json';
const INTEL        = '.agentic-flow/intelligence.json';
const CUR_SESSION  = '.claude-flow/data/current-session.json';
const METRICS_DIR  = '.claude-flow/metrics';
const METRICS_LAST = '.claude-flow/metrics/session-latest.json';
const MEMORY_DB    = '.swarm/memory.db';

function parseSonaStats(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

// ─── Tier composition for the STORE node ─────────────────────────
// Memory is bucketed by namespace; if nothing is grouped yet, report
// all entries as working (short-term), matching v4's "short-term first"
// mental model.
function readMemoryTiers() {
  const db = openDb(MEMORY_DB);
  if (!db) return { tiers: { working: 0, episodic: 0, semantic: 0 }, total: 0 };
  let total = 0;
  const tiers = { working: 0, episodic: 0, semantic: 0 };
  try {
    total = db.prepare('SELECT COUNT(*) as c FROM memory_entries').get().c;
    const rows = db.prepare(
      "SELECT namespace, COUNT(*) as c FROM memory_entries GROUP BY namespace"
    ).all();
    for (const { namespace, c } of rows) {
      const ns = (namespace || '').toLowerCase();
      if (ns.includes('semantic') || ns.includes('long')) tiers.semantic += c;
      else if (ns.includes('episodic') || ns.includes('session')) tiers.episodic += c;
      else tiers.working += c;
    }
  } catch {}
  db.close();
  // Fallback: if nothing grouped, treat all as working
  if (tiers.working + tiers.episodic + tiers.semantic === 0 && total > 0) {
    tiers.working = total;
  }
  return { tiers, total };
}

// ─── v4 6-node architecture snapshot composed from v5 stores ─────
// Legacy dashboard (dashboard.js:5766) reads fields:
//   nodes.route.*, nodes.execute.*, nodes.capture.steps, nodes.store.memEntries,
//   nodes.store.tiers.{working,episodic,semantic}, nodes.learn.policies,
//   nodes.recall.episodes, nodes.recall.errorsRecalled
function buildArchitectureLive() {
  const sona = readJson(SONA_STATE) || {};
  const rbankRaw = readJson(RBANK) || [];
  const rbank = Array.isArray(rbankRaw) ? rbankRaw : [];
  const intel = readJson(INTEL) || {};
  const latest = readJson(METRICS_LAST) || {};
  const session = readJson(CUR_SESSION) || {};
  const stats = parseSonaStats(latest.sonaStats);
  const { tiers, total: memEntries } = readMemoryTiers();

  const sonaPatterns = sona.patterns || [];
  const intelPatternCount = Object.keys(intel.patterns || {}).length;
  const intelTotalQ = Object.values(intel.patterns || {}).reduce(
    (a, agents) => a + (typeof agents === 'object'
      ? Object.values(agents).reduce((b, v) => b + Number(v || 0), 0)
      : 0),
    0
  );
  const errorPatternCount = Object.keys(intel.errorPatterns || {}).length;

  const modelDistribution = sonaPatterns.reduce((acc, p) => {
    const route = p.model_route || 'unknown';
    acc[route] = (acc[route] || 0) + 1;
    return acc;
  }, {});
  const activeRoute = Object.entries(modelDistribution)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'v5';

  const trajectoryCount = latest.trajectoryCount || 0;
  const steps = session.stepCount || 0;
  const fails = session.failCount || 0;

  const rbankSuccess = rbank.reduce((a, p) => a + (p.success_count || 0), 0);
  const rbankAvgConfidence = rbank.length
    ? rbank.reduce((a, p) => a + (p.confidence || 0), 0) / rbank.length
    : 0;
  const sonaAvgQuality = sonaPatterns.length
    ? sonaPatterns.reduce((a, p) => a + (p.avg_quality || 0), 0) / sonaPatterns.length
    : 0;

  return {
    nodes: {
      route: {
        model: activeRoute,
        routingReason: intelPatternCount
          ? `pretrain Q-table (${intelPatternCount} file-type patterns)`
          : 'no route history',
        sessionGoal: session.sessionId || '',
        totalDecisions: trajectoryCount,
        modelDistribution,
        circuitBreakerTrips: 0,
      },
      execute: {
        activeTask: session.sessionId || null,
        activeSteps: steps,
        activeStatus: steps > 0 ? 'running' : 'idle',
        totalTrajectories: trajectoryCount,
      },
      capture: {
        steps,
        errors: fails,
        coEdits: stats?.trajectories_recorded ?? 0,
      },
      store: {
        tiers,
        memEntries,
        reasoningPatterns: rbank.length,
      },
      learn: {
        policies: sonaPatterns.length,
        qValues: Math.round(intelTotalQ * 100) / 100,
        successEpisodes: rbankSuccess,
      },
      recall: {
        episodes: rbank.length,
        errorsRecalled: errorPatternCount,
        mailbox: (intel.memories || []).length,
      },
    },
    session,
    modelRouter: {
      available: sonaPatterns.length > 0 || intelPatternCount > 0,
      activeRoute,
      distribution: modelDistribution,
    },
    center: {
      sessionId: session.sessionId || null,
      goal: '',
      steps,
      avgReward: rbankAvgConfidence
        ? rbankAvgConfidence.toFixed(2)
        : sonaAvgQuality.toFixed(2),
      model: activeRoute,
      complexity: '',
      astComplexity: '',
      routedFile: '',
      qValues: intelTotalQ,
      tierSummary: `w:${tiers.working} e:${tiers.episodic} s:${tiers.semantic}`,
      mailbox: (intel.memories || []).length,
      revolutions: trajectoryCount,
    },
    behaviors: [],
    revolutions: trajectoryCount,
    improvement: {
      ready: sonaPatterns.length > 0 && rbank.length > 0,
      sessions: trajectoryCount,
    },
    timestamp: new Date().toISOString(),
  };
}

// ─── Sessions history for /api/trajectories ─────────────────────
// Legacy field names: id, sessionId, goal, createdAt, stepCount, reward, model.
function readTrajectoryHistory(limit = 100) {
  const dir = resolvePath(METRICS_DIR);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter(f => f.startsWith('session-') && f.endsWith('.json') && f !== 'session-latest.json')
    .sort()
    .reverse()
    .slice(0, limit);
  const out = [];
  for (const f of files) {
    const raw = readJson(`${METRICS_DIR}/${f}`);
    if (!raw) continue;
    const stats = parseSonaStats(raw.sonaStats);
    out.push({
      id: f.replace('.json', ''),
      sessionId: raw.sessionId || f,
      goal: raw.goal || '',
      createdAt: raw.exportedAt,
      stepCount: raw.trajectoryCount || 0,
      reward: stats?.buffer_success_rate ?? null,
      model: raw.model || 'v5',
      learnStatus: raw.learnStatus,
      stateBytes: raw.stateBytes,
      patternsStored: stats?.patterns_stored ?? null,
      patternsLearned: stats?.patterns_learned ?? null,
      ewcTasks: stats?.ewc_tasks ?? null,
    });
  }
  return out;
}

export function registerLegacyShims(app) {
  // ── Trajectory history ─────────────────────────────────────────
  app.get('/api/trajectories', (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 100;
      const trajectories = readTrajectoryHistory(limit);
      res.json({ trajectories, count: trajectories.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  app.get('/api/trajectories/:id/steps', (req, res) => {
    // Per-step data is not persisted in v5 exports — return an empty array
    // with the wrapping shape the v4 UI expects.
    res.json({ steps: [], trajectoryId: req.params.id });
  });
  app.get('/api/rewards', (req, res) => {
    try {
      const latest = readJson(METRICS_LAST) || {};
      const stats = parseSonaStats(latest.sonaStats);
      const rewards = stats ? [{
        timestamp: latest.exportedAt,
        sessionId: latest.sessionId || null,
        reward: stats.buffer_success_rate ?? null,
        patternsLearned: stats.patterns_learned ?? null,
        source: 'sonaStats',
      }] : [];
      res.json({ rewards, count: rewards.length, captured: rewards.length > 0 });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── 6-node architecture-live (drives cycle widget) ─────────────
  app.get('/api/architecture-live', (req, res) => {
    try { res.json(buildArchitectureLive()); }
    catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── v4 inspect endpoints ───────────────────────────────────────
  app.get('/api/inspect/hm-tiers', (req, res) => {
    try {
      const { tiers, total } = readMemoryTiers();
      res.json({ tiers, total });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/inspect/patterns-stats', (req, res) => {
    try {
      const sona = readJson(SONA_STATE) || {};
      const rbankRaw = readJson(RBANK) || [];
      const rbank = Array.isArray(rbankRaw) ? rbankRaw : [];
      const shortTerm = (sona.patterns || []).length;
      const longTerm = rbank.length;
      res.json({
        shortTerm, longTerm,
        total: shortTerm + longTerm,
        sonaEwcTaskCount: sona.ewc_task_count || 0,
        rbankAvgConfidence: rbank.length
          ? rbank.reduce((a, p) => a + (p.confidence || 0), 0) / rbank.length
          : 0,
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/inspect/ewc-fisher', (req, res) => {
    try {
      const sona = readJson(SONA_STATE) || {};
      const patterns = sona.patterns || [];
      res.json({
        fisher: sona.ewc_task_count
          ? { taskCount: sona.ewc_task_count, engine: '@ruvector/sona EWC++' }
          : null,
        parameters: patterns.length,
        version: sona.version,
        instantEnabled: sona.instant_enabled || false,
        backgroundEnabled: sona.background_enabled || false,
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/inspect/skills', (req, res) => {
    // Skills table was v4-only; in v5 the closest analogue is intel.patterns
    // (file-type → agent Q-values). Expose as skills with q as score.
    try {
      const intel = readJson(INTEL) || {};
      const skills = [];
      for (const [key, value] of Object.entries(intel.patterns || {})) {
        if (typeof value !== 'object') continue;
        for (const [agent, q] of Object.entries(value)) {
          skills.push({ key, agent, score: Number(q) || 0 });
        }
      }
      skills.sort((a, b) => b.score - a.score);
      res.json({ skills: skills.slice(0, 200), count: skills.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ── Legacy store inspections — map v4 names to v5 equivalents ──
  app.get('/api/agentdb', (req, res) => {
    try {
      const db = openDb(MEMORY_DB);
      const tables = {};
      let totalRows = 0;
      if (db) {
        try {
          const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
          for (const { name } of names) {
            try {
              const c = db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get().c;
              tables[name] = c;
              totalRows += c;
            } catch {}
          }
        } catch {}
        db.close();
      }
      res.json({ tables, tableCount: Object.keys(tables).length, totalRows, source: MEMORY_DB });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/hnsw', (req, res) => {
    try {
      const db = openDb(MEMORY_DB);
      let vectorCount = 0;
      if (db) {
        try { vectorCount = db.prepare('SELECT COUNT(*) as c FROM memory_embeddings').get().c; } catch {}
        db.close();
      }
      const stat = fileStat(MEMORY_DB);
      res.json({
        index: vectorCount > 0 ? 'memory_embeddings' : null,
        metadata: { dimension: 384, metric: 'cosine', backend: 'sqlite+xenova' },
        vectorCount,
        dbBytes: stat.size,
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/ewc-status', (req, res) => {
    try {
      const sona = readJson(SONA_STATE) || {};
      const stat = fileStat(SONA_STATE);
      res.json({
        fisherState: sona.ewc_task_count
          ? { taskCount: sona.ewc_task_count, version: sona.version }
          : null,
        patternCount: (sona.patterns || []).length,
        lastConsolidation: stat.mtime,
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/intelligence', (req, res) => {
    try {
      const intel = readJson(INTEL) || {};
      const rankedContext = (intel.memories || []).slice(0, 20).map(m => ({
        key: m.key || m.id,
        content: m.content || m.value,
        score: m.score ?? m.relevance ?? null,
        tags: m.tags || [],
      }));
      res.json({
        graphState: {
          pretrained: intel.pretrained || false,
          patternCount: Object.keys(intel.patterns || {}).length,
          dirPatternCount: Object.keys(intel.dirPatterns || {}).length,
          errorPatternCount: Object.keys(intel.errorPatterns || {}).length,
          memoryCount: (intel.memories || []).length,
          metrics: intel.metrics || null,
        },
        rankedContext,
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/insights-queue', (req, res) => {
    // v5 surfaces insights via /api/v5/events. Map daemon log events that
    // look like insights (learned pattern, consolidation) into an insights
    // list so legacy consumers still render something.
    try {
      const latest = readJson(METRICS_LAST) || {};
      const stats = parseSonaStats(latest.sonaStats);
      const insights = [];
      if (stats?.patterns_learned) {
        insights.push({
          ts: latest.exportedAt,
          kind: 'patterns_learned',
          detail: `${stats.patterns_learned} pattern(s) learned this session`,
        });
      }
      if (stats?.ewc_tasks) {
        insights.push({
          ts: latest.exportedAt,
          kind: 'ewc_consolidation',
          detail: `${stats.ewc_tasks} EWC task(s) consolidated`,
        });
      }
      res.json({ insights, count: insights.length });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.get('/api/session', (req, res) => {
    try {
      const current = readJson(CUR_SESSION) || {};
      const latest = readJson(METRICS_LAST) || {};
      const sona = readJson(SONA_STATE) || {};
      const rbankRaw = readJson(RBANK) || [];
      const rbank = Array.isArray(rbankRaw) ? rbankRaw : [];
      const stats = parseSonaStats(latest.sonaStats);
      const { tiers, total: memEntries } = readMemoryTiers();

      const sessions = [];
      const dir = resolvePath(METRICS_DIR);
      if (existsSync(dir)) {
        for (const f of readdirSync(dir)
          .filter(f => f.startsWith('session-') && f.endsWith('.json') && f !== 'session-latest.json')
          .sort().reverse().slice(0, 20)) {
          const r = readJson(`${METRICS_DIR}/${f}`);
          if (!r) continue;
          sessions.push({
            id: f.replace('.json', ''),
            sessionId: r.sessionId || f,
            createdAt: r.exportedAt,
            stepCount: r.trajectoryCount || 0,
            learnStatus: r.learnStatus,
          });
        }
      }

      res.json({
        current: {
          ...current,
          sonaPatterns: (sona.patterns || []).length,
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
        policies: (sona.patterns || []).map(p => ({
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
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  app.post('/api/session/end-sim', (req, res) => {
    // v5 sessions end via daemon consolidation; no simulation endpoint.
    res.json({ ok: false, simulated: false, note: 'use SessionEnd hook to trigger real consolidation' });
  });
}
