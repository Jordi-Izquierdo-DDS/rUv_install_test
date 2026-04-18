// Brain route module — extracted from api.js (2026-04-18).
//
// Routes:
//   GET  /api/brain/status  — upstream pi.ruv.io connectivity + local Ruflo memory
//   POST /api/brain/search  — fan-out search across pi-brain / ruflo-memory / auto-memory
//
// Pure move — no business logic change.

import {
  openDb, countRows, readJson, fileStat,
} from '../helpers.js';

const PI_BRAIN_URL = 'https://pi.ruv.io';

export function registerBrainStatus(app) {
  // Brain status — checks local .ruvector/ AND external brain source
  // Real brain source is at /mnt/data/dev/ruvector_brain_src (Rust crate)
  // Ruflo memory (.swarm/memory.db) serves as the live semantic brain
  app.get('/api/brain/status', async (req, res) => {
    try {
      // Check upstream pi.ruv.io connectivity
      let upstream = { reachable: false, url: PI_BRAIN_URL };
      try {
        const piKey = process.env.PI_BRAIN_API_KEY || null;
        if (!piKey) throw new Error('PI_BRAIN_API_KEY not set');
        const ping = await fetch('https://pi.ruv.io/v1/memories/search?q=ping', {
          headers: { 'Authorization': `Bearer ${piKey}` },
          signal: AbortSignal.timeout(5000),
        });
        upstream.reachable = ping.ok;
        if (ping.ok) { const d = await ping.json(); upstream.sampleCount = Array.isArray(d) ? d.length : 0; }
      } catch {}

      // Local Ruflo memory
      const db = openDb('.swarm/memory.db');
      let memoryEntries = 0, vectorIndexes = [];
      if (db) {
        try { memoryEntries = countRows(db, 'memory_entries'); } catch {}
        try { vectorIndexes = db.prepare('SELECT id, name, dimensions, metric, total_vectors FROM vector_indexes').all(); } catch {}
        db.close();
      }

      // HNSW index status
      const hnswStat = fileStat('.swarm/memory.hnsw');
      const hnswMeta = readJson('.swarm/memory.hnsw.mappings.json');

      res.json({
        configured: upstream.reachable || memoryEntries > 0,
        brain: { url: upstream.url, hasKey: true },
        upstream,
        rufloMemory: {
          entries: memoryEntries,
          vectorIndexes,
          hnswIndex: { exists: hnswStat.exists, size: hnswStat.size, metadata: hnswMeta },
        },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

export function registerBrainSearch(app) {
  // Brain search — queries upstream pi.ruv.io collective brain API
  // Falls back to local sources if upstream is unreachable
  const PI_BRAIN_KEY = process.env.PI_BRAIN_API_KEY || null;

  app.post('/api/brain/search', async (req, res) => {
    try {
      const { query, sources } = req.body;
      if (!query) return res.status(400).json({ error: 'query required' });

      const allSources = ['pi-brain', 'ruflo-memory', 'auto-memory'];
      const activeSources = Array.isArray(sources) && sources.length
        ? sources.filter(s => allSources.includes(s))
        : ['pi-brain']; // default: upstream only

      const results = [];

      // 1. Search upstream pi.ruv.io collective brain (primary source)
      if (activeSources.includes('pi-brain')) try {
        if (!PI_BRAIN_KEY) throw new Error('PI_BRAIN_API_KEY not set');
        const upstreamRes = await fetch(
          `${PI_BRAIN_URL}/v1/memories/search?q=${encodeURIComponent(query)}`,
          { headers: { 'Authorization': `Bearer ${PI_BRAIN_KEY}` }, signal: AbortSignal.timeout(8000) }
        );
        if (upstreamRes.ok) {
          const upstream = await upstreamRes.json();
          if (Array.isArray(upstream)) {
            for (const m of upstream) {
              results.push({
                source: 'pi-brain', id: m.id, title: m.title,
                content: m.content, tags: m.tags, category: m.category,
                score: m.score ?? m.quality_score?.alpha / (m.quality_score?.alpha + m.quality_score?.beta) ?? 0.5,
              });
            }
          }
        }
      } catch {}

      // 2. Local — search memory_entries in .swarm/memory.db
      const q = query.toLowerCase();
      const db = activeSources.includes('ruflo-memory') ? openDb('.swarm/memory.db') : null;
      if (db) {
        try {
          const rows = db.prepare(
            "SELECT key, namespace, content, type FROM memory_entries ORDER BY updated_at DESC"
          ).all();
          for (const r of rows) {
            if ((r.content || '').toLowerCase().includes(q) || (r.key || '').toLowerCase().includes(q)) {
              results.push({ source: 'ruflo-memory', id: r.key, content: r.content, namespace: r.namespace, type: r.type, score: 0.6 });
            }
          }
        } catch {}
        db.close();
      }

      // 3. Local — auto-memory-store
      const autoMem = activeSources.includes('auto-memory') ? readJson('.claude-flow/data/auto-memory-store.json') : null;
      if (Array.isArray(autoMem)) {
        for (const entry of autoMem) {
          const text = (entry.content || entry.summary || entry.key || '').toLowerCase();
          if (text.includes(q)) {
            results.push({
              source: 'auto-memory', id: entry.key || entry.id,
              content: entry.summary || entry.content?.slice(0, 200),
              namespace: entry.namespace, type: entry.type, score: 0.4,
            });
          }
        }
      }

      res.json({ results: results.slice(0, 50), query, count: results.length, sources: activeSources });
    } catch (err) {
      res.json({ results: [], query: req.body.query, error: err.message?.substring(0, 200) });
    }
  });
}

export function registerBrainRoutes(app, _deps = {}) {
  registerBrainStatus(app);
  registerBrainSearch(app);
}
