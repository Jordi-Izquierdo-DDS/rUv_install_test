// ═══════════════════════════════════════════════════════════════
// Symbol Classifier — implements doc/VIZ-SYMBOL-CLASSIFICATION.md
//
// Walks node_modules/agentdb/dist/{controllers,src/backends/graph}/*.d.ts,
// source-parses each, and classifies as:
//   - util_*    : static-only (no constructor, no instance state) — Rule 3
//   - backend_* : has initialize()/close() + stateful props       — Rule 2
//   - ctrl_*    : registered in the agentdb_controllers MCP list   — Rule 1
//   - hide      : plain functions, not a class, etc.
//
// RULE ORDER: 3 → 2 → 1 (static-only wins even if the name is listed as
// a controller, because registry inclusion doesn't imply stateful lifecycle.
// Canonical example: MMRDiversityRanker IS in agentdb_controllers but has
// only static methods — it's a utility, not a controller.)
// ═══════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { BACKEND_PARENT } from './controller-status.js';

const DATA_ROOT = process.env.DATA_ROOT || process.cwd();
const NODE_MODULES = resolve(DATA_ROOT, 'node_modules');

// Directories scanned for candidate classes
const SCAN_DIRS = [
  'agentdb/dist/controllers',
  'agentdb/dist/src/backends/graph',
  'agentdb/dist/src/controllers',
  'agentdb/dist/src/backends',
];

// camelCase / PascalCase → snake_case for node ids.
// Handles leading-acronym runs: MMRDiversityRanker → mmr_diversity_ranker
function toSnake(name) {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z\d])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

// Parse a .d.ts file and return classification hints.
function parseSource(srcPath) {
  let src;
  try { src = readFileSync(srcPath, 'utf8'); } catch { return null; }
  if (!/\bexport\s+(declare\s+)?class\s+/.test(src)) return null;

  // Constructor presence
  const hasConstructor = /\bconstructor\s*\(/.test(src);

  // Lifecycle — init AND close (per doc Rule 2)
  const hasInit  = /\b(initialize|init|connect|start|open)\s*\(/.test(src);
  const hasClose = /\b(close|shutdown|stop|disconnect|destroy)\s*\(/.test(src);
  const hasLifecycle = hasInit && hasClose;

  // Stateful instance fields (private/protected/readonly declarations)
  const hasStatefulProps =
    /(?:^|\n)\s*(?:private|protected|readonly)\s+(db|connection|client|pool|embedder|agentdb|adapter|store|config)[\s:;]/m
      .test(src);

  // Static-vs-instance method counts (Rule 3)
  const staticCount   = (src.match(/\n\s*static\s+\w+\s*\(/g) || []).length;
  // Instance methods in a .d.ts look like "methodName(args): returnType;".
  // Exclude keywords and the constructor.
  const instancePattern =
    /\n\s{2,}(?!static\b|constructor\b|private\s|protected\s|readonly\s|declare\s)[a-z_]\w*\s*(?:\?|!)?\s*\(/g;
  const instanceCount = (src.match(instancePattern) || []).length;

  return { hasConstructor, hasLifecycle, hasStatefulProps, staticCount, instanceCount };
}

// Walk SCAN_DIRS and build className → { sourceFile, parsed }
let _classCache = null;
let _classCacheTs = 0;
const CLASS_CACHE_TTL = 5 * 60 * 1000; // 5 min per doc

export function getClassCache() {
  const now = Date.now();
  if (_classCache && now - _classCacheTs < CLASS_CACHE_TTL) return _classCache;

  const cache = new Map();
  const seen = new Set();
  for (const rel of SCAN_DIRS) {
    const dir = resolve(NODE_MODULES, rel);
    if (!existsSync(dir)) continue;
    let files;
    try { files = readdirSync(dir); } catch { continue; }
    for (const f of files) {
      if (!f.endsWith('.d.ts') || f.endsWith('.d.ts.map')) continue;
      if (f === 'index.d.ts' || f.startsWith('frontier-')) continue;
      const className = f.replace(/\.d\.ts$/, '');
      if (seen.has(className)) continue;
      const parsed = parseSource(join(dir, f));
      if (!parsed) continue;
      seen.add(className);
      cache.set(className, { className, sourceFile: join(dir, f), parsed });
    }
  }
  _classCache = cache;
  _classCacheTs = now;
  return cache;
}

export function invalidateClassifierCache() {
  _classCache = null;
  _classCacheTs = 0;
}

// Apply rules (in corrected order 3 → 2 → 1) to produce the final node map.
// mcpControllerList: [{ name, enabled, level }, ...] from agentdb_controllers
// Returns Map<nodeId, { nodeType, className, sourceFile, mcpName, enabled, level, phantom }>
export function classifyAll(mcpControllerList) {
  const classes = getClassCache();
  const mcpByLower = new Map();
  for (const c of (mcpControllerList || [])) mcpByLower.set(c.name.toLowerCase(), c);

  const results = new Map();
  const consumedClasses = new Set();

  // Pass 1 — every class from node_modules gets classified
  for (const { className, sourceFile, parsed } of classes.values()) {
    const lower = className.toLowerCase();
    const mcp = mcpByLower.get(lower);
    const snake = toSnake(className);

    // Rule 3 — static-only → util (wins even if in MCP list)
    if (!parsed.hasConstructor && parsed.staticCount > 0 && parsed.instanceCount === 0) {
      const id = 'util_' + snake;
      results.set(id, {
        nodeType: 'util',
        className,
        sourceFile,
        mcpName: mcp?.name || null,
        level: mcp?.level ?? null,
      });
      consumedClasses.add(lower);
      continue;
    }

    // Rule 2 — lifecycle + stateful → backend. Only emit if we know which
    // parent controller it belongs to (via BACKEND_PARENT). Unknown backends
    // (e.g. protocol-layer QUIC clients) would render as disconnected nodes
    // on the graph, so we skip them.
    if (parsed.hasLifecycle && (parsed.hasStatefulProps || parsed.hasConstructor) && !mcp) {
      const id = 'backend_' + snake;
      if (!BACKEND_PARENT[id]) {
        // No parent mapping → skip (not relevant to the learning graph)
        continue;
      }
      results.set(id, {
        nodeType: 'backend',
        className,
        sourceFile,
        mcpName: null,
      });
      consumedClasses.add(lower);
      continue;
    }

    // Rule 1 — in MCP list AND has constructor → ctrl
    if (mcp && parsed.hasConstructor) {
      const id = 'ctrl_' + toSnake(mcp.name);
      results.set(id, {
        nodeType: 'ctrl',
        className,
        sourceFile,
        mcpName: mcp.name,
        enabled: mcp.enabled,
        level: mcp.level,
      });
      consumedClasses.add(lower);
      continue;
    }

    // Otherwise: skip (not emitted as a node)
  }

  // Pass 2 — MCP list members with NO source file → phantom ctrl (e.g. graphAdapter)
  for (const mcp of (mcpControllerList || [])) {
    const lower = mcp.name.toLowerCase();
    if (consumedClasses.has(lower)) continue;
    const id = 'ctrl_' + toSnake(mcp.name);
    if (results.has(id)) continue;
    results.set(id, {
      nodeType: 'ctrl',
      className: mcp.name,
      sourceFile: null,
      mcpName: mcp.name,
      enabled: mcp.enabled,
      level: mcp.level,
      phantom: true,
    });
  }

  return results;
}
