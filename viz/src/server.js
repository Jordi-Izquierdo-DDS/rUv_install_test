import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import { registerRoutes } from './api.js';
import { getDataRoot } from './helpers.js';
import { initControllerStatus, getCachedStatusMap } from './controller-status.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3100;

const app = express();
app.use(express.json());

// Inline favicon (purple circle) — prevents browser 404 spam on any page load
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#8b5cf6"/></svg>`;
app.get('/favicon.ico', (req, res) => res.type('image/svg+xml').send(FAVICON_SVG));

// Serve v5 dashboard at root (standalone — no brain-chat override needed)
app.get('/', (req, res) => {
  const htmlPath = join(__dirname, '..', 'public', 'v5.html');
  const html = readFileSync(htmlPath, 'utf8');
  res.type('html').send(html);
});

// Legacy v4 dashboard with brain-chat override injected before </body>
app.get('/legacy', (req, res) => {
  const htmlPath = join(__dirname, '..', 'public', 'index.html');
  let html = readFileSync(htmlPath, 'utf8');
  const brainOverride = `<script type="module">
import { initBrainChat } from '/js/brain-chat.js';
// Re-run after bundle's DOMContentLoaded to override its initBrainChat
window.__initBrainChat = initBrainChat;
setTimeout(() => { try { initBrainChat(); } catch {} }, 0);
</script>`;
  html = html.replace('</body>', brainOverride + '\n</body>');
  res.type('html').send(html);
});

app.use(express.static(join(__dirname, '..', 'public'), { etag: false, lastModified: false, maxAge: 0 }));

registerRoutes(app);

app.listen(PORT, async () => {
  console.log(`IT095 Learning Viz — http://localhost:${PORT}`);
  console.log(`DATA_ROOT: ${getDataRoot()}`);
  // Warm the controller-status composite (7 MCP tools, ~50ms) + start 30s refresh
  await initControllerStatus();
  const statusMap = getCachedStatusMap();
  const active   = [...statusMap.values()].filter(e => e.status === 'active').length;
  const idle     = [...statusMap.values()].filter(e => e.status === 'idle').length;
  const degraded = [...statusMap.values()].filter(e => e.status === 'degraded').length;
  const broken   = [...statusMap.values()].filter(e => e.status === 'broken').length;
  console.log(`Controllers: ${statusMap.size} total — ${active} active, ${idle} idle, ${degraded} degraded, ${broken} broken (MCP composite)`);
});
