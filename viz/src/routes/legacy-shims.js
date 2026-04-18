// Legacy v4 dashboard console-quieting shims.
//
// The compiled v4 dashboard bundle (viz/public/dashboard.js) polls a set of
// endpoints that were removed in the v5 rewrite because they queried tables
// (trajectories, episodes, hierarchical_memory, vector_indexes, etc.) that
// no longer exist. Returning 404 causes the dashboard to spam the browser
// console with `SyntaxError: Unexpected token '<', "<!DOCTYPE "...` because
// its code calls `.json()` on the 404 HTML page.
//
// Each shim returns valid JSON with the v4 shape but empty payloads and a
// `shim: 'v4-legacy'` marker, so the legacy UI renders "0 items" gracefully.
// The v5 dashboard at `/` does not hit any of these routes.

import { readJson } from '../helpers.js';

function shim(payload) {
  return { ...payload, shim: 'v4-legacy', note: 'endpoint removed in v5 — see /api/v5/* for canonical data' };
}

export function registerLegacyShims(app) {
  // ── Trajectory/episode tables: removed entirely in v5 ──
  app.get('/api/trajectories', (req, res) => {
    res.json(shim({ trajectories: [], count: 0 }));
  });
  app.get('/api/trajectories/:id/steps', (req, res) => {
    res.json(shim({ steps: [], trajectoryId: req.params.id }));
  });
  app.get('/api/rewards', (req, res) => {
    res.json(shim({ rewards: [], count: 0, captured: false }));
  });

  // ── 6-node architecture-live: replaced by /api/v5/cycle (7-node) ──
  // Return a zeroed skeleton with the v4 shape so the legacy cycle widget
  // renders without crashing. Live v5 data is at /api/v5/cycle.
  app.get('/api/architecture-live', (req, res) => {
    const currentSession = readJson('.claude-flow/data/current-session.json') || {};
    res.json(shim({
      nodes: {
        route:   { model: 'v5', routingReason: '', sessionGoal: '', totalDecisions: 0, modelDistribution: {}, circuitBreakerTrips: 0 },
        execute: { activeTask: null, activeSteps: currentSession.stepCount || 0, activeStatus: 'v5', totalTrajectories: 0 },
        capture: { steps: currentSession.stepCount || 0, errors: 0, coEdits: 0 },
        store:   { tiers: {}, memEntries: 0, reasoningPatterns: 0 },
        learn:   { policies: 0, qValues: 0, successEpisodes: 0 },
        recall:  { episodes: 0, errorsRecalled: 0, mailbox: 0 },
      },
      session: currentSession,
      modelRouter: { available: false },
      center: {
        sessionId: currentSession.sessionId || null,
        goal: '', steps: currentSession.stepCount || 0,
        avgReward: '—', model: 'v5', complexity: '', astComplexity: '',
        routedFile: '', qValues: 0, tierSummary: '', mailbox: 0, revolutions: 0,
      },
      behaviors: [],
      revolutions: 0,
      improvement: { ready: false, sessions: 0 },
      timestamp: new Date().toISOString(),
    }));
  });

  // ── v4 SQLite table inspections ──
  app.get('/api/inspect/hm-tiers',       (req, res) => res.json(shim({ tiers: {}, total: 0 })));
  app.get('/api/inspect/patterns-stats', (req, res) => res.json(shim({ shortTerm: 0, longTerm: 0 })));
  app.get('/api/inspect/ewc-fisher',     (req, res) => res.json(shim({ fisher: null, parameters: 0 })));
  app.get('/api/inspect/skills',         (req, res) => res.json(shim({ skills: [], count: 0 })));

  // ── Store inspections removed in v5 ──
  app.get('/api/agentdb',       (req, res) => res.json(shim({ tables: {}, tableCount: 0, totalRows: 0 })));
  app.get('/api/hnsw',          (req, res) => res.json(shim({ index: null, metadata: {}, vectorCount: 0 })));
  app.get('/api/ewc-status',    (req, res) => res.json(shim({ fisherState: null, patternCount: 0, lastConsolidation: null })));
  app.get('/api/intelligence',  (req, res) => res.json(shim({ graphState: {}, rankedContext: [] })));
  app.get('/api/insights-queue',(req, res) => res.json(shim({ insights: [], count: 0 })));
  app.get('/api/session',       (req, res) => {
    res.json(shim({
      current: readJson('.claude-flow/data/current-session.json') || {},
      sessions: [], episodes: [], policies: [], learningSessions: [],
      hierarchical: { working: 0, episodic: 0, semantic: 0 },
      memoryStats: {},
    }));
  });
  app.post('/api/session/end-sim', (req, res) => res.json(shim({ ok: true, simulated: false })));
}
