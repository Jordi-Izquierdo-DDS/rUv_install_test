// Config route module — extracted from api.js (2026-04-18).
//
// Routes:
//   GET  /api/layout — load saved node positions + pan/zoom transform
//   POST /api/layout — save node positions (detached list + transform optional)
//   GET  /api/theme  — load saved color palette
//   POST /api/theme  — save color palette
//
// Pure move — no business logic change. Files live in ../config/ (relative to src/).

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAYOUT_FILE = resolve(__dirname, '..', 'config', 'viz-layout.json');
const THEME_FILE  = resolve(__dirname, '..', 'config', 'viz-theme.json');

export function registerLayoutRoutes(app) {
  // GET /api/layout — Load saved node positions
  app.get('/api/layout', (req, res) => {
    try {
      if (existsSync(LAYOUT_FILE)) {
        const data = JSON.parse(readFileSync(LAYOUT_FILE, 'utf8'));
        res.json(data);
      } else {
        res.json({ positions: {} });
      }
    } catch {
      res.json({ positions: {} });
    }
  });

  // POST /api/layout — Save node positions
  app.post('/api/layout', (req, res) => {
    try {
      const { positions, detached, transform } = req.body;
      if (!positions || typeof positions !== 'object') {
        return res.status(400).json({ error: 'positions object required' });
      }
      const payload = { positions };
      if (Array.isArray(detached)) payload.detached = detached;
      if (transform && typeof transform === 'object') payload.transform = transform;
      writeFileSync(LAYOUT_FILE, JSON.stringify(payload, null, 2));
      res.json({ ok: true, count: Object.keys(positions).length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

export function registerThemeRoutes(app) {
  // GET /api/theme — Load saved color palette
  app.get('/api/theme', (req, res) => {
    try {
      if (existsSync(THEME_FILE)) {
        res.json(JSON.parse(readFileSync(THEME_FILE, 'utf8')));
      } else {
        res.json({});
      }
    } catch {
      res.json({});
    }
  });

  // POST /api/theme — Save color palette
  app.post('/api/theme', (req, res) => {
    try {
      const theme = req.body;
      if (!theme || typeof theme !== 'object') {
        return res.status(400).json({ error: 'theme object required' });
      }
      writeFileSync(THEME_FILE, JSON.stringify(theme, null, 2));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

export function registerConfigRoutes(app, _deps = {}) {
  registerLayoutRoutes(app);
  registerThemeRoutes(app);
}
