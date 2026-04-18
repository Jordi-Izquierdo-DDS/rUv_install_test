// Activity route module — extracted from api.js (2026-04-18).
//
// Routes:
//   GET /api/activity           — Claude transcript + learning JSONL tail/parse
//   GET /api/activity-stream    — Incremental JSONL reader for edge pulses (?scope=all|project)
//   GET /api/projects           — List known projects
//   GET /api/ruflo-intelligence — Pattern store + confidence distribution + brain MCP stats
//   GET /api/auto-memory        — auto-memory-store.json entries
//
// All routes are read-only observers of activity/learning data. /api/ruflo-intelligence
// depends on vizMcpCall (injected via deps) for the brain-intel MCP call.

import { existsSync, readFileSync, readdirSync, statSync, openSync, readSync, closeSync } from 'fs';
import { resolve, join } from 'path';
import { homedir } from 'os';

import {
  openDb, countRows, readJson, fileStat, readGraphState,
  getDataRoot, findLatestJsonl, findAllLatestJsonls, findLearningActivity,
} from '../helpers.js';

// ─── GET /api/activity — Claude log tail/parse ──
export function registerActivity(app) {
  app.get('/api/activity', (req, res) => {
    try {
      const mode = req.query.mode || 'realtime';
      const limit = parseInt(req.query.limit) || 100;

      // Find Claude JSONL files
      const claudeDir = resolve(homedir(), '.claude', 'projects');
      if (!existsSync(claudeDir)) return res.json({ events: [], mode });

      let slugDirs;
      try {
        slugDirs = readdirSync(claudeDir).filter(d => {
          try { return statSync(join(claudeDir, d)).isDirectory(); } catch { return false; }
        });
      } catch { return res.json({ events: [], mode }); }

      // Find latest JSONL
      let latestFile = null, latestMtime = 0;
      for (const dir of slugDirs) {
        try {
          const jsonls = readdirSync(join(claudeDir, dir)).filter(f => f.endsWith('.jsonl'));
          for (const f of jsonls) {
            const fp = join(claudeDir, dir, f);
            const mt = statSync(fp).mtimeMs;
            if (mt > latestMtime) { latestMtime = mt; latestFile = fp; }
          }
        } catch {}
      }

      // Parse Claude transcript events
      const transcriptEvents = [];
      if (latestFile) {
        const content = readFileSync(latestFile, 'utf8');
        const lines = content.trim().split('\n').filter(Boolean);
        const parseLines = mode === 'realtime' ? lines.slice(-limit) : lines;
        for (const line of parseLines) {
          try { transcriptEvents.push(JSON.parse(line)); } catch {}
        }
      }

      // Merge learning-activity.jsonl events (P2.3)
      const learningFile = findLearningActivity();
      const learningEvents = [];
      if (learningFile) {
        try {
          const lContent = readFileSync(learningFile.path, 'utf8');
          const lLines = lContent.trim().split('\n').filter(Boolean);
          const lParseLines = lLines.slice(-limit);
          for (const line of lParseLines) {
            try {
              const evt = JSON.parse(line);
              // Normalize: ensure a timestamp field exists for sorting
              if (!evt.timestamp && evt.ts) evt.timestamp = evt.ts;
              evt._source = 'learning';
              learningEvents.push(evt);
            } catch {}
          }
        } catch {}
      }

      // Merge and sort by timestamp descending (newest first)
      let events;
      if (learningEvents.length > 0) {
        // Tag transcript events with source for client disambiguation
        for (const e of transcriptEvents) { if (!e._source) e._source = 'transcript'; }
        const merged = [...transcriptEvents, ...learningEvents];
        // Sort descending by timestamp (ts or timestamp field)
        merged.sort((a, b) => {
          const tsA = a.timestamp || a.ts || '';
          const tsB = b.timestamp || b.ts || '';
          return tsA > tsB ? -1 : tsA < tsB ? 1 : 0;
        });
        events = merged.slice(0, limit);
      } else {
        events = transcriptEvents;
      }

      res.json({ events, mode, file: latestFile, totalLines: events.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── GET /api/activity-stream — Incremental JSONL for edge pulses ──
export function registerActivityStream(app) {
  function readJsonlChunk(filePath, offset, isTail) {
    const MAX = 262144;
    const size = statSync(filePath).size;
    const start = isTail ? Math.max(0, size - MAX) : Math.max(0, offset);
    if (start >= size) return { offset: size, lines: [] };

    const fd = openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(Math.min(MAX, size - start));
      const n = readSync(fd, buf, 0, buf.length, start);
      closeSync(fd);
      if (n === 0) return { offset: size, lines: [] };

      const raw = buf.toString('utf8', 0, n);
      const first = (isTail && start > 0) ? raw.indexOf('\n') + 1 : 0;
      const last = raw.lastIndexOf('\n');
      if (last <= first) return { offset: start + n, lines: [] };

      const chunk = raw.substring(first, last);
      // No content filter — send all lines, let the client decide what's actionable.
      // The chunk is already bounded by MAX (256KB) and offset tracking,
      // so bandwidth is naturally limited.
      const lines = chunk.split('\n').filter(Boolean);
      return { offset: start + last + 1, lines };
    } catch {
      try { closeSync(fd); } catch {}
      return { offset: statSync(filePath).size, lines: [] };
    }
  }

  app.get('/api/activity-stream', (req, res) => {
    try {
      const scope = req.query.scope || 'project';
      const tail = req.query.tail === '1';

      if (scope === 'all') {
        // Read from all recent project JSONLs (tail mode only for all-scope)
        const allJsonls = findAllLatestJsonls();
        // Only include projects active in the last hour
        const cutoff = Date.now() - 3600000;
        const recent = allJsonls.filter(j => j.mtimeMs > cutoff).slice(0, 10);
        const allLines = [];
        for (const j of recent) {
          const { lines } = readJsonlChunk(j.path, 0, true);
          allLines.push(...lines);
        }

        // P2.3: Also merge learning-activity.jsonl into all-scope
        const learningFile = findLearningActivity();
        if (learningFile) {
          try {
            const { lines: lLines } = readJsonlChunk(learningFile.path, 0, true);
            allLines.push(...lLines);
          } catch {}
        }

        return res.json({ offset: 0, lines: allLines, scope: 'all', projects: recent.map(j => j.project) });
      }

      // Default: project-specific with offset tracking
      const jsonl = findLatestJsonl();
      if (!jsonl) return res.json({ offset: 0, lines: [], scope: 'project' });

      // skip=1: return current EOF offset without reading lines (for initial sync)
      if (req.query.skip === '1') {
        const size = statSync(jsonl.path).size;
        // P2.3: Also report learning file offset for skip sync
        let learningOffset = 0;
        const learningFile = findLearningActivity();
        if (learningFile) {
          try { learningOffset = statSync(learningFile.path).size; } catch {}
        }
        return res.json({ offset: size, learningOffset, lines: [], scope: 'project', skipped: true });
      }

      const offset = tail ? 0 : Math.max(0, parseInt(req.query.offset) || 0);
      const result = readJsonlChunk(jsonl.path, offset, tail);
      result.scope = 'project';

      // P2.3: Merge lines from learning-activity.jsonl sidecar
      const learningFile = findLearningActivity();
      if (learningFile) {
        try {
          const lOffset = tail ? 0 : Math.max(0, parseInt(req.query.learningOffset) || 0);
          const lResult = readJsonlChunk(learningFile.path, lOffset, tail);
          if (lResult.lines.length > 0) {
            result.lines.push(...lResult.lines);
            // Sort merged lines by timestamp descending so newest events come first
            result.lines.sort((a, b) => {
              // Lines are raw strings — parse ts for comparison
              try {
                const objA = JSON.parse(a);
                const objB = JSON.parse(b);
                const tsA = objA.timestamp || objA.ts || '';
                const tsB = objB.timestamp || objB.ts || '';
                return tsA > tsB ? -1 : tsA < tsB ? 1 : 0;
              } catch { return 0; }
            });
          }
          result.learningOffset = lResult.offset;
        } catch {
          result.learningOffset = 0;
        }
      } else {
        result.learningOffset = 0;
      }

      res.json(result);
    } catch (err) {
      res.json({ offset: 0, learningOffset: 0, lines: [], error: err.message });
    }
  });
}

// ─── GET /api/projects — List known projects ──
export function registerProjects(app) {
  app.get('/api/projects', (req, res) => {
    try {
      const all = findAllLatestJsonls();
      const dataRoot = getDataRoot();
      const currentMangled = dataRoot.replace(/[^a-zA-Z0-9]/g, '-');
      res.json({
        current: currentMangled,
        projects: all.map(j => ({
          name: j.project,
          lastActivity: new Date(j.mtimeMs).toISOString(),
          isCurrent: j.project === currentMangled,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── GET /api/ruflo-intelligence — Pattern store + confidence ─
// Reads from REAL sources:
//   .claude-flow/data/intelligence-snapshot.json — learning progress snapshots
//   .claude-flow/data/graph-state.json           — PageRank intelligence graph
//   .swarm/memory.db → patterns + memory_entries — ReasoningBank patterns
//   hooks_intelligence_stats MCP — live brain intelligence (replaces external intelligence.json)
export function registerRufloIntelligence(app, deps = {}) {
  const vizMcpCall = deps.vizMcpCall || (async () => { throw new Error('vizMcpCall not wired'); });

  app.get('/api/ruflo-intelligence', async (req, res) => {
    try {
      // Intelligence graph (REAL — PageRank nodes + confidence)
      const gs = readGraphState();
      const allNodes = gs?.nodes ? Object.values(gs.nodes) : [];
      const confidenceBuckets = { high: 0, medium: 0, low: 0, unknown: 0 };
      for (const n of allNodes) {
        const c = n.confidence ?? -1;
        if (c >= 0.7) confidenceBuckets.high++;
        else if (c >= 0.4) confidenceBuckets.medium++;
        else if (c >= 0) confidenceBuckets.low++;
        else confidenceBuckets.unknown++;
      }

      // Patterns from REAL DB (.swarm/memory.db)
      const db = openDb('.swarm/memory.db');
      let patternStats = { reasoningBank: 0, semantic: 0, trajectories: 0 };
      if (db) {
        try { patternStats.reasoningBank = countRows(db, 'patterns'); } catch {}
        try { patternStats.semantic = countRows(db, 'memory_entries'); } catch {}
        try { patternStats.trajectories = countRows(db, 'trajectories'); } catch {}
        db.close();
      }

      // Intelligence snapshots (REAL — learning progress over time)
      const snapshots = readJson('.claude-flow/data/intelligence-snapshot.json');
      const latest = Array.isArray(snapshots) && snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;

      // External brain intelligence via MCP (replaces .ruvector/intelligence.json file read)
      let brainPatterns = 0;
      let brainIntel = null;
      try {
        brainIntel = await vizMcpCall('hooks_intelligence_stats', { detailed: true });
        brainPatterns = brainIntel?.sona?.patternsLearned || 0;
      } catch {}

      res.json({
        patternStats,
        confidenceDistribution: confidenceBuckets,
        graphNodeCount: allNodes.length,
        snapshot: latest ? {
          nodes: latest.nodes, edges: latest.edges,
          pageRankSum: latest.pageRankSum,
          topPatterns: (latest.topPatterns || []).slice(0, 10),
          timestamp: latest.timestamp ? new Date(latest.timestamp).toISOString() : null,
        } : null,
        snapshotCount: Array.isArray(snapshots) ? snapshots.length : 0,
        brainIntel: brainPatterns > 0 ? {
          patternCount: brainPatterns,
          trajectoryCount: brainIntel?.sona?.trajectoriesTotal || 0,
          source: 'hooks_intelligence_stats (MCP)',
        } : null,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ─── GET /api/auto-memory — auto-memory-store entries ─
export function registerAutoMemory(app) {
  app.get('/api/auto-memory', (req, res) => {
    try {
      const data = readJson('.claude-flow/data/auto-memory-store.json');
      const stat = fileStat('.claude-flow/data/auto-memory-store.json');
      let entries = [], entryCount = 0;
      if (data) {
        if (Array.isArray(data)) { entries = data; entryCount = data.length; }
        else if (data.entries) {
          entries = Array.isArray(data.entries) ? data.entries : Object.values(data.entries);
          entryCount = entries.length;
        } else {
          entries = Object.entries(data).map(([k, v]) => ({ key: k, value: v }));
          entryCount = entries.length;
        }
      }
      res.json({
        exists: data !== null, entryCount,
        entries: entries.slice(-100),
        fileSize: stat.size, lastModified: stat.mtime,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

export function registerActivityRoutes(app, deps = {}) {
  registerActivity(app);
  registerActivityStream(app);
  registerProjects(app);
  registerRufloIntelligence(app, deps);
  registerAutoMemory(app);
}
