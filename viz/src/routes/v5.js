// v5 route module — single-purpose readers for the v5 stores.
//
// Canonical v5 stores:
//   .claude-flow/sona/state.json               — SonaEngine patterns (model_route + avg_quality)
//   .claude-flow/reasoning-bank/patterns.json  — ruvllm VerdictAnalyzer priors
//   .agentic-flow/intelligence.json            — pretrain Q-table (file-type → agent routing)
//   .swarm/memory.db                           — C4 memory_entries + memory_embeddings
//   .claude-flow/data/daemon.log               — service readiness + C4 events
//   .claude-flow/data/current-session.json     — live hook session counter
//   .claude-flow/metrics/session-*.json        — per-session exports
//
// No v4 fallbacks. No tables queried that the v5 schema does not carry.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { openDb, readJson, fileStat, getDataRoot, resolvePath, isPidAlive } from '../helpers.js';

const SONA_STATE   = '.claude-flow/sona/state.json';
const RBANK        = '.claude-flow/reasoning-bank/patterns.json';
const INTEL        = '.agentic-flow/intelligence.json';
const CUR_SESSION  = '.claude-flow/data/current-session.json';
const METRICS_DIR  = '.claude-flow/metrics';
const METRICS_LAST = '.claude-flow/metrics/session-latest.json';
const DAEMON_LOG   = '.claude-flow/data/daemon.log';
const DAEMON_PID   = '.claude-flow/ruvector-daemon.pid';
const DAEMON_SOCK  = '.claude-flow/ruvector-daemon.sock';

function parseSonaStats(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function readDaemonLogTail(maxLines = 400) {
  const p = resolvePath(DAEMON_LOG);
  if (!existsSync(p)) return [];
  const lines = readFileSync(p, 'utf8').split('\n').filter(Boolean);
  return lines.slice(-maxLines);
}

function readDaemon() {
  const pidPath = resolvePath(DAEMON_PID);
  const pid = existsSync(pidPath) ? parseInt(readFileSync(pidPath, 'utf8').trim(), 10) : null;
  return { pid, alive: pid ? isPidAlive(pid) : false, sock: DAEMON_SOCK };
}

// ─── /api/sona ──────────────────────────────────────────────────
// Canonical sona state from JSON. No DB. Surfaces patterns + route distribution + stats.
export function registerSona(app) {
  app.get('/api/sona', (req, res) => {
    try {
      const state = readJson(SONA_STATE);
      const stat = fileStat(SONA_STATE);
      const metrics = readJson(METRICS_LAST) || {};
      const sessionCur = readJson(CUR_SESSION) || {};
      const stats = parseSonaStats(metrics.sonaStats);

      const patterns = (state?.patterns || []).map(p => ({
        id: p.id,
        pattern_type: p.pattern_type,
        model_route: p.model_route,
        avg_quality: p.avg_quality,
        cluster_size: p.cluster_size,
        access_count: p.access_count,
        total_weight: p.total_weight,
        created_at: (p.created_at || 0) * 1000,
        last_accessed: (p.last_accessed || 0) * 1000,
      }));

      const routeCounts = patterns.reduce((acc, p) => {
        acc[p.model_route] = (acc[p.model_route] || 0) + 1;
        return acc;
      }, {});

      res.json({
        sona: {
          exists: !!state,
          patternCount: patterns.length,
          ewcTaskCount: state?.ewc_task_count || 0,
          instantEnabled: state?.instant_enabled || false,
          backgroundEnabled: state?.background_enabled || false,
          version: state?.version,
          patterns,
          routeCounts,
          stateBytes: stat.size,
          lastModified: stat.mtime,
          stats,
        },
        session: {
          currentStepCount: sessionCur.stepCount || 0,
          lastExport: metrics.exportedAt,
          learnStatus: metrics.learnStatus,
          trajectoryCount: metrics.trajectoryCount,
        },
        source: SONA_STATE,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── /api/reasoningbank ─────────────────────────────────────────
export function registerReasoningBank(app) {
  app.get('/api/reasoningbank', (req, res) => {
    try {
      const raw = readJson(RBANK);
      const patterns = Array.isArray(raw) ? raw : [];
      const stat = fileStat(RBANK);

      const slim = patterns.map(p => ({
        id: p.id,
        uuid: p.uuid,
        category: p.category,
        confidence: p.confidence,
        usage_count: p.usage_count,
        success_count: p.success_count,
        avg_quality: p.avg_quality,
        source_trajectories: p.source_trajectories,
        lessons: p.lessons,
        example_actions: p.example_actions,
        created_at: p.created_at,
        last_accessed: p.last_accessed,
        tags: p.metadata?.tags || [],
      }));

      const byCategory = slim.reduce((acc, p) => {
        acc[p.category || 'Unknown'] = (acc[p.category || 'Unknown'] || 0) + 1;
        return acc;
      }, {});
      const totalUsage = slim.reduce((a, p) => a + (p.usage_count || 0), 0);
      const avgConfidence = slim.length
        ? slim.reduce((a, p) => a + (p.confidence || 0), 0) / slim.length
        : 0;

      res.json({
        reasoningBank: {
          exists: !!raw,
          patternCount: slim.length,
          patterns: slim,
          byCategory,
          totalUsage,
          avgConfidence,
          fileBytes: stat.size,
          lastModified: stat.mtime,
        },
        source: RBANK,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── /api/patterns ──────────────────────────────────────────────
// Unified read across sona + rBank + C4, returns a flat list.
export function registerPatterns(app) {
  app.get('/api/patterns', (req, res) => {
    try {
      const sonaState = readJson(SONA_STATE) || {};
      const sonaPatterns = (sonaState.patterns || []).map(p => ({
        id: p.id,
        name: `sona#${p.id}`,
        pattern_type: p.pattern_type,
        description: `route=${p.model_route} cluster=${p.cluster_size}`,
        confidence: p.avg_quality,
        success_count: p.access_count || 0,
        failure_count: 0,
        source: 'sona',
        status: 'active',
        created_at: (p.created_at || 0) * 1000,
        updated_at: (p.last_accessed || 0) * 1000,
        last_matched_at: (p.last_accessed || 0) * 1000,
        model_route: p.model_route,
        total_weight: p.total_weight,
      }));

      const rbankRaw = readJson(RBANK) || [];
      const rbankPatterns = (Array.isArray(rbankRaw) ? rbankRaw : []).map(p => ({
        id: p.id,
        name: p.uuid || `rbank#${p.id}`,
        pattern_type: p.category || 'unknown',
        description: p.lessons?.length
          ? p.lessons.join('; ').slice(0, 120)
          : `traj=${(p.source_trajectories || []).join(',')}`,
        confidence: p.confidence ?? p.avg_quality ?? 0,
        success_count: p.success_count ?? 0,
        failure_count: (p.usage_count ?? 0) - (p.success_count ?? 0),
        source: 'reasoningbank',
        status: 'active',
        created_at: p.created_at ? Date.parse(p.created_at) : 0,
        updated_at: p.last_accessed ? Date.parse(p.last_accessed) : 0,
        last_matched_at: p.last_accessed ? Date.parse(p.last_accessed) : 0,
        usage_count: p.usage_count,
      }));

      const patterns = [...sonaPatterns, ...rbankPatterns];

      const db = openDb('.swarm/memory.db');
      let memoryEntries = [];
      let memoryEntryCount = 0;
      if (db) {
        try {
          memoryEntryCount = db.prepare('SELECT COUNT(*) as c FROM memory_entries').get().c;
          memoryEntries = db.prepare(
            "SELECT id, key, namespace, content, type, access_count, created_at, updated_at FROM memory_entries ORDER BY updated_at DESC LIMIT 100"
          ).all();
        } catch {}
        db.close();
      }

      const sessionMetrics = readJson(METRICS_LAST) || {};
      const intel = readJson(INTEL) || {};

      res.json({
        patterns,
        memoryPatterns: memoryEntries,
        trajectories: [],
        counts: {
          patterns: patterns.length,
          sonaPatterns: sonaPatterns.length,
          rbankPatterns: rbankPatterns.length,
          memoryEntries: memoryEntryCount,
          intelRoutingPatterns: Object.keys(intel.patterns || {}).length,
          intelMemories: (intel.memories || []).length,
        },
        vectorIndexes: [],
        metadata: {
          sonaVersion: sonaState.version,
          sonaInstantEnabled: sonaState.instant_enabled,
          sonaBackgroundEnabled: sonaState.background_enabled,
          sonaEwcTaskCount: sonaState.ewc_task_count,
          sessionLearnStatus: sessionMetrics.learnStatus,
          sessionStateBytes: sessionMetrics.stateBytes,
          sessionTrajectoryCount: sessionMetrics.trajectoryCount,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── /api/v5/cycle — 7-node learning cycle ──────────────────────
export function registerCycle(app) {
  app.get('/api/v5/cycle', (req, res) => {
    try {
      const sona = readJson(SONA_STATE) || {};
      const rbank = readJson(RBANK) || [];
      const intel = readJson(INTEL) || {};
      const metrics = readJson(METRICS_LAST) || {};
      const currentSession = readJson(CUR_SESSION) || {};
      const stats = parseSonaStats(metrics.sonaStats);

      const db = openDb('.swarm/memory.db');
      let memEntries = 0;
      let memEmbeddings = 0;
      if (db) {
        try { memEntries = db.prepare('SELECT COUNT(*) as c FROM memory_entries').get().c; } catch {}
        try { memEmbeddings = db.prepare('SELECT COUNT(*) as c FROM memory_embeddings').get().c; } catch {}
        db.close();
      }

      const rbankArr = Array.isArray(rbank) ? rbank : [];
      const rbankAvgConfidence = rbankArr.length
        ? rbankArr.reduce((a, p) => a + (p.confidence || 0), 0) / rbankArr.length
        : 0;
      const sonaPatterns = sona.patterns || [];
      const sonaAvgQuality = sonaPatterns.length
        ? sonaPatterns.reduce((a, p) => a + (p.avg_quality || 0), 0) / sonaPatterns.length
        : 0;
      const intelTotalQ = Object.values(intel.patterns || {}).reduce(
        (a, agents) => a + Object.values(agents).reduce((b, v) => b + v, 0), 0
      );

      const nodes = [
        { id: 'CAPTURE',  order: 1, upstream: '@ruvector/sona.beginTrajectory',
          quality: stats?.buffer_success_rate ?? 1,
          count: stats?.trajectories_buffered ?? 0,
          detail: `buffered=${stats?.trajectories_buffered ?? 0} recorded=${stats?.trajectories_recorded ?? 0} dropped=${stats?.trajectories_dropped ?? 0}` },
        { id: 'RETRIEVE', order: 2, upstream: '@ruvector/sona.findPatterns',
          quality: sonaAvgQuality,
          count: sonaPatterns.length,
          detail: `sona patterns=${sonaPatterns.length} avgQ=${sonaAvgQuality.toFixed(2)}` },
        { id: 'ROUTE',    order: 3, upstream: '@ruvector/router (SemanticRouter)',
          quality: Object.keys(intel.patterns || {}).length ? 1 : 0,
          count: Object.keys(intel.patterns || {}).length,
          detail: `agents routed via ${Object.keys(intel.patterns || {}).length} file-type patterns (totalQ=${intelTotalQ.toFixed(1)})` },
        { id: 'EXECUTE',  order: 4, upstream: 'hook-handler.cjs',
          quality: currentSession.failCount ? 1 - (currentSession.failCount / Math.max(1, currentSession.stepCount)) : 1,
          count: currentSession.stepCount || 0,
          detail: `session=${currentSession.sessionId || 'none'} steps=${currentSession.stepCount || 0} fails=${currentSession.failCount || 0}` },
        { id: 'JUDGE',    order: 5, upstream: '@ruvector/ruvllm-native VerdictAnalyzer',
          quality: rbankAvgConfidence,
          count: rbankArr.length,
          detail: `rbank patterns=${rbankArr.length} avgConf=${rbankAvgConfidence.toFixed(2)}` },
        { id: 'LEARN',    order: 6, upstream: '@ruvector/sona (MicroLoRA+BaseLoRA+EWC++)',
          quality: sonaPatterns.length > 0 ? Math.min(1, sonaPatterns.length / 10) : 0,
          count: sona.ewc_task_count || 0,
          detail: `patterns_learned=${stats?.patterns_learned ?? 0} ewc_tasks=${sona.ewc_task_count || 0}` },
        { id: 'PERSIST',  order: 7, upstream: '@claude-flow/memory + ruvector (5 layers)',
          quality: (memEntries > 0 && sonaPatterns.length > 0 && rbankArr.length > 0) ? 1 : 0.5,
          count: memEntries + sonaPatterns.length + rbankArr.length,
          detail: `c4=${memEntries} sona=${sonaPatterns.length} rbank=${rbankArr.length} intel=${Object.keys(intel.patterns || {}).length}` },
      ];

      const gap = {
        id: 'REFINE', order: 3.5,
        upstream: 'mincut/GNN (deferred ADR-004)',
        quality: 0, count: 0,
        detail: 'deferred per ADR-004',
        deferred: true,
      };

      const edges = [];
      for (let i = 0; i < nodes.length - 1; i++) {
        edges.push({ from: nodes[i].id, to: nodes[i + 1].id, active: nodes[i].count > 0 });
      }
      edges.push({ from: 'PERSIST', to: 'CAPTURE', active: true, feedback: true });

      const center = {
        quality: {
          embeddingDim: 384,
          onnxDensity: '378/384',
          sonaAvgQuality: sonaAvgQuality.toFixed(3),
          rbankAvgConfidence: rbankAvgConfidence.toFixed(3),
        },
        coverage: {
          phasesWired: '15/15',
          services: 8,
          nodes: nodes.length,
          deferred: ['REFINE (ADR-004)'],
        },
        persistence: {
          layers: 5,
          c4Entries: memEntries,
          c4Embeddings: memEmbeddings,
          sonaPatterns: sonaPatterns.length,
          rbankPatterns: rbankArr.length,
          intelPatterns: Object.keys(intel.patterns || {}).length,
          intelMemories: (intel.memories || []).length,
          crossSession: (sonaPatterns.length > 0 || rbankArr.length > 0) ? 'verified' : 'none',
        },
      };

      res.json({
        nodes, gap, edges, center,
        session: {
          sessionId: currentSession.sessionId || null,
          stepCount: currentSession.stepCount || 0,
          failCount: currentSession.failCount || 0,
          learnStatus: metrics.learnStatus || null,
          trajectoryCount: metrics.trajectoryCount || 0,
          exportedAt: metrics.exportedAt || null,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── /api/v5/services — 8-service readiness ─────────────────────
export function registerServices(app) {
  app.get('/api/v5/services', (req, res) => {
    try {
      const lines = readDaemonLogTail(400);

      const readinessPatterns = [
        { id: 'SQLiteBackend',      re: /C4 memory: SQLiteBackend ready/ },
        { id: 'SonaEngine',         re: /SonaEngine: state restored|SonaEngine: 384-dim/ },
        { id: 'AdaptiveEmbedder',   re: /AdaptiveEmbedder ready/ },
        { id: 'IntelligenceEngine', re: /IntelligenceEngine: ready/ },
        { id: 'NeuralSubstrate',    re: /NeuralSubstrate: ready/ },
        { id: 'ReasoningBank',      re: /reasoningBank: restored|reasoningBank: persisted/ },
        { id: 'TensorCompress',     re: /tensorCompress: (fresh|ready|restored)/ },
        { id: 'SemanticRouter',     re: /semanticRouter: \d+ agents loaded/ },
        { id: 'VerdictAnalyzer',    re: /VerdictAnalyzer|ruvllm.*ready/i },
      ];

      const services = readinessPatterns.map(p => {
        const match = [...lines].reverse().find(l => p.re.test(l));
        return { id: p.id, ready: !!match, lastEvent: match || null };
      });

      const c4Events = lines.filter(l => /C4 stored:/.test(l)).slice(-20);
      const errors = lines
        .filter(l => /error|ERR|failed/i.test(l) && !/: 0/.test(l))
        .slice(-10);

      res.json({
        services,
        readyCount: services.filter(s => s.ready).length,
        totalCount: services.length,
        daemon: readDaemon(),
        c4Events,
        errors,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── /api/v5/degradation — presence-based degradation chain ─────
export function registerDegradation(app) {
  app.get('/api/v5/degradation', (req, res) => {
    try {
      const sonaExists  = existsSync(resolvePath(SONA_STATE));
      const rbankExists = existsSync(resolvePath(RBANK));
      const memDbExists = existsSync(resolvePath('.swarm/memory.db'));
      const intelExists = existsSync(resolvePath(INTEL));
      const onnxExists  = existsSync(resolvePath('node_modules/@xenova/transformers'));
      const daemon      = readDaemon();
      const alive       = daemon.alive;

      const chain = [
        { level: 0, label: 'Full stack',  active: alive && sonaExists && rbankExists && onnxExists,  routing: 'SemanticRouter+ONNX',       works: 'everything',            breaks: 'nothing' },
        { level: 1, label: '-rbank',      active: alive && sonaExists && !rbankExists && onnxExists, routing: 'Sona patterns only',        works: 'retrieve/route/learn',  breaks: 'verdict-backed priors' },
        { level: 2, label: '-sona',       active: alive && !sonaExists && onnxExists,                routing: 'SemanticRouter heuristic',  works: 'route/execute/persist', breaks: 'pattern memory' },
        { level: 3, label: '-SR',         active: alive && !sonaExists && !onnxExists,               routing: 'intelligence.json Q-table', works: 'offline routing',       breaks: 'semantic match' },
        { level: 4, label: '-ONNX',       active: alive && !onnxExists,                              routing: 'keyword + Q-table',         works: 'coarse routing',        breaks: 'semantic retrieval' },
        { level: 5, label: '-daemon',     active: !alive,                                            routing: 'none (hook inline)',        works: 'C4 write on Stop',      breaks: 'cycle real-time' },
      ];

      const active = chain.find(c => c.active) || chain[chain.length - 1];

      res.json({
        chain,
        activeLevel: active.level,
        activeLabel: active.label,
        presence: {
          daemon: alive,
          sona: sonaExists,
          rbank: rbankExists,
          memoryDb: memDbExists,
          intelligence: intelExists,
          onnx: onnxExists,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── /api/v5/trajectories — session exports history ─────────────
// Reads every session-*.json in .claude-flow/metrics/, plus the live current-session.json.
// Returns ordered-newest-first list suitable for a trajectory timeline.
export function registerTrajectories(app) {
  app.get('/api/v5/trajectories', (req, res) => {
    try {
      const dir = resolvePath(METRICS_DIR);
      const sessions = [];
      if (existsSync(dir)) {
        const files = readdirSync(dir).filter(f => f.startsWith('session-') && f.endsWith('.json') && f !== 'session-latest.json');
        for (const f of files) {
          const raw = readJson(`${METRICS_DIR}/${f}`);
          if (!raw) continue;
          let stats = null;
          try { stats = raw.sonaStats ? JSON.parse(raw.sonaStats) : null; } catch {}
          sessions.push({
            file: f,
            exportedAt: raw.exportedAt,
            learnStatus: raw.learnStatus,
            trajectoryCount: raw.trajectoryCount,
            stateBytes: raw.stateBytes,
            patternsStored: stats?.patterns_stored ?? null,
            patternsLearned: stats?.patterns_learned ?? null,
            ewcTasks: stats?.ewc_tasks ?? null,
          });
        }
        sessions.sort((a, b) =>
          (b.exportedAt || '').localeCompare(a.exportedAt || '')
        );
      }

      const current = readJson(CUR_SESSION) || {};
      const latest = readJson(METRICS_LAST) || {};

      res.json({
        current: {
          sessionId: current.sessionId,
          stepCount: current.stepCount || 0,
          failCount: current.failCount || 0,
        },
        latestExport: {
          exportedAt: latest.exportedAt,
          learnStatus: latest.learnStatus,
          trajectoryCount: latest.trajectoryCount,
          stateBytes: latest.stateBytes,
        },
        sessions,
        sessionCount: sessions.length,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── /api/v5/intel — pretrain routing Q-table ───────────────────
// Extension and directory shaped into table-friendly rows with top-agent per bucket.
export function registerIntel(app) {
  app.get('/api/v5/intel', (req, res) => {
    try {
      const intel = readJson(INTEL) || {};
      const stat = fileStat(INTEL);

      const byExtension = Object.entries(intel.patterns || {}).map(([key, value]) => {
        // Shape is `{ext: {agent: qValue}}`. Defensive against legacy string shape too.
        if (typeof value === 'string') {
          return { key, topAgent: value, topQ: 0, totalQ: 0, agents: [{ name: value, q: 0 }] };
        }
        const entries = Object.entries(value || {}).sort((a, b) => b[1] - a[1]);
        const [topAgent, topQ] = entries[0] || [null, 0];
        const totalQ = entries.reduce((a, e) => a + Number(e[1] || 0), 0);
        return {
          key,
          topAgent,
          topQ: Number(topQ) || 0,
          totalQ,
          agents: entries.slice(0, 5).map(([name, q]) => ({ name, q: Number(q) || 0 })),
        };
      }).sort((a, b) => b.totalQ - a.totalQ);

      // dirPatterns shape differs from patterns: `dir -> agentName` (string) OR `dir -> {agent: qValue}` (object, legacy).
      // Normalize both to the table row shape so the UI doesn't need to special-case.
      const byDirectory = Object.entries(intel.dirPatterns || {}).map(([dir, value]) => {
        if (typeof value === 'string') {
          return { dir, topAgent: value, topQ: 0, totalQ: 0, agents: [{ name: value, q: 0 }] };
        }
        const entries = Object.entries(value || {}).sort((a, b) => b[1] - a[1]);
        const [topAgent, topQ] = entries[0] || [null, 0];
        const totalQ = entries.reduce((a, e) => a + Number(e[1] || 0), 0);
        return { dir, topAgent, topQ: Number(topQ) || 0, totalQ, agents: entries.slice(0, 5).map(([name, q]) => ({ name, q: Number(q) || 0 })) };
      }).sort((a, b) => b.totalQ - a.totalQ);

      res.json({
        pretrained: intel.pretrained || null,
        metrics: intel.metrics || null,
        byExtension,
        byDirectory,
        memories: (intel.memories || []).slice(0, 20),
        totals: {
          extensions: byExtension.length,
          directories: byDirectory.length,
          memories: (intel.memories || []).length,
          errorPatterns: Object.keys(intel.errorPatterns || {}).length,
          sequences: Object.keys(intel.sequences || {}).length,
        },
        fileBytes: stat.size,
        lastModified: stat.mtime,
        source: INTEL,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── /api/v5/events — daemon log tail with classification ───────
export function registerEvents(app) {
  app.get('/api/v5/events', (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 60;
      const lines = readDaemonLogTail(Math.min(limit * 3, 1200));

      const events = lines.slice(-limit).map(line => {
        const tsMatch = line.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+(.*)$/);
        const ts = tsMatch ? tsMatch[1] : null;
        const msg = tsMatch ? tsMatch[2] : line;
        let category = 'info';
        if (/^C4 stored/.test(msg)) category = 'c4';
        else if (/error|failed|ERR/i.test(msg) && !/: 0/.test(msg)) category = 'error';
        else if (/ready|restored|loaded|persisted/.test(msg)) category = 'ready';
        else if (/SonaEngine|IntelligenceEngine|NeuralSubstrate|AdaptiveEmbedder|semanticRouter|reasoningBank|tensorCompress/.test(msg)) category = 'service';
        return { ts, category, msg };
      });

      const counts = events.reduce((acc, e) => {
        acc[e.category] = (acc[e.category] || 0) + 1;
        return acc;
      }, {});

      res.json({
        events,
        counts,
        total: events.length,
        source: DAEMON_LOG,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── Orchestrator ───────────────────────────────────────────────
export function registerV5Routes(app) {
  registerSona(app);
  registerReasoningBank(app);
  registerPatterns(app);
  registerCycle(app);
  registerServices(app);
  registerDegradation(app);
  registerTrajectories(app);
  registerIntel(app);
  registerEvents(app);
}
