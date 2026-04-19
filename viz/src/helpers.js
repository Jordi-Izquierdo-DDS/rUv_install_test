import { existsSync, statSync, readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { execSync } from 'child_process';
import { homedir } from 'os';
import Database from 'better-sqlite3';
import { getCachedStatusMap, getBackendStatus, getUtilStatus, getDaemonStatus, BACKEND_PARENT } from './controller-status.js';
import { classifyAll } from './symbol-classifier.js';
import { CONTROLLER_META, BACKEND_META, UTIL_META } from './controller-registry.js';

const DATA_ROOT = process.env.DATA_ROOT || process.cwd();

// ── Process-based service detection (passive: ps + lsof only) ─
let _servicePidCache = null;
let _servicePidCacheTime = 0;
const SERVICE_PID_TTL = 15000; // 15s cache

export function detectServicePids() {
  const now = Date.now();
  if (_servicePidCache && (now - _servicePidCacheTime) < SERVICE_PID_TTL) return _servicePidCache;

  const result = { services: [], daemonPids: {} };
  try {
    // Scan process table for MCP servers + daemons belonging to this project
    const psOut = execSync(
      `ps aux 2>/dev/null | grep -E 'mcp start|daemon|monitor|metrics' | grep -v grep`,
      { timeout: 2000, encoding: 'utf8' }
    );
    for (const line of psOut.split('\n').filter(Boolean)) {
      // Only include processes whose cwd or cmdline references this project
      if (!line.includes(DATA_ROOT)) continue;
      const pidMatch = line.match(/\S+\s+(\d+)/);
      if (!pidMatch) continue;
      const pid = parseInt(pidMatch[1]);
      const entry = { pid, alive: true, cmdline: line.trim() };
      if (line.includes('mcp start')) entry.type = 'mcp';
      else if (line.includes('monitor')) entry.type = 'swarm-monitor';
      else if (line.includes('metrics')) entry.type = 'metrics-db';
      else entry.type = 'daemon';
      result.services.push(entry);
      result.daemonPids[entry.type] = pid;
    }
  } catch {}

  // Also check PID files as fallback
  try {
    const pidDir = resolve(DATA_ROOT, '.claude-flow/pids');
    if (existsSync(pidDir)) {
      for (const f of readdirSync(pidDir)) {
        if (!f.endsWith('.pid')) continue;
        const pid = parseInt(readFileSync(resolve(pidDir, f), 'utf8').trim());
        if (pid && !result.services.find(s => s.pid === pid)) {
          const alive = isPidAlive(pid);
          result.services.push({ pid, alive, type: f.replace('.pid', ''), source: 'pidfile' });
        }
      }
    }
  } catch {}

  _servicePidCache = result;
  _servicePidCacheTime = now;
  return result;
}

// ── Latest JSONL finder ──────────────────────────────────────
// Claude Code mangles paths: /foo/bar_baz → -foo-bar-baz (all non-alphanumeric → hyphen)
// Returns { path, mtimeMs } for the newest .jsonl in this project's transcript dir, or null.

let _jsonlCache = null;
let _jsonlCacheTime = 0;
const JSONL_CACHE_TTL = 5000; // 5s — lightweight stat-only check

export function findLatestJsonl() {
  const now = Date.now();
  if (_jsonlCache && (now - _jsonlCacheTime) < JSONL_CACHE_TTL) return _jsonlCache;

  const mangledDir = DATA_ROOT.replace(/[^a-zA-Z0-9]/g, '-');
  const projectDir = resolve(homedir(), '.claude', 'projects', mangledDir);
  if (!existsSync(projectDir)) { _jsonlCache = null; _jsonlCacheTime = now; return null; }

  let best = null, bestMtime = 0;
  try {
    for (const f of readdirSync(projectDir)) {
      if (!f.endsWith('.jsonl')) continue;
      const fp = join(projectDir, f);
      const mt = statSync(fp).mtimeMs;
      if (mt > bestMtime) { bestMtime = mt; best = fp; }
    }
  } catch {}

  const result = best ? { path: best, mtimeMs: bestMtime } : null;
  _jsonlCache = result;
  _jsonlCacheTime = now;
  return result;
}

// Returns latest JSONL per project dir under ~/.claude/projects/
// Each entry: { path, mtimeMs, project } where project is the dir name (mangled path)
let _allJsonlCache = null;
let _allJsonlCacheTime = 0;

export function findAllLatestJsonls() {
  const now = Date.now();
  if (_allJsonlCache && (now - _allJsonlCacheTime) < JSONL_CACHE_TTL) return _allJsonlCache;

  const projectsRoot = resolve(homedir(), '.claude', 'projects');
  if (!existsSync(projectsRoot)) { _allJsonlCache = []; _allJsonlCacheTime = now; return []; }

  const results = [];
  try {
    for (const dir of readdirSync(projectsRoot)) {
      const dirPath = join(projectsRoot, dir);
      try { if (!statSync(dirPath).isDirectory()) continue; } catch { continue; }
      let best = null, bestMtime = 0;
      try {
        for (const f of readdirSync(dirPath)) {
          if (!f.endsWith('.jsonl')) continue;
          const fp = join(dirPath, f);
          const mt = statSync(fp).mtimeMs;
          if (mt > bestMtime) { bestMtime = mt; best = fp; }
        }
      } catch {}
      if (best) results.push({ path: best, mtimeMs: bestMtime, project: dir });
    }
  } catch {}

  // Sort by mtime descending so most recent project comes first
  results.sort((a, b) => b.mtimeMs - a.mtimeMs);
  _allJsonlCache = results;
  _allJsonlCacheTime = now;
  return results;
}

// ── Activity Evidence Cache ──────────────────────────────────
// Scans the most recent Claude JSONL transcript for evidence of
// recent hook fires and tool_use events. Cached for 30 seconds.

let _activityCache = null;
let _activityCacheTime = 0;
const ACTIVITY_CACHE_TTL = 30000; // 30s

export function getRecentActivity() {
  const now = Date.now();
  if (_activityCache && (now - _activityCacheTime) < ACTIVITY_CACHE_TTL) return _activityCache;

  const result = {
    hookEvents: new Map(),   // eventName → lastTimestamp
    toolUses: new Set(),     // tool names seen
    scriptsCalled: new Set(),// script basenames called by hooks
    mcpCalls: new Set(),     // MCP server prefixes used (e.g. 'ruvector', 'claude-flow')
    latestTimestamp: 0,
  };

  try {
    const jsonl = findLatestJsonl();
    if (!jsonl) { _activityCache = result; _activityCacheTime = now; return result; }

    // Only check if modified in last hour
    if ((now - jsonl.mtimeMs) > 3600000) { _activityCache = result; _activityCacheTime = now; return result; }

    // Read last 256KB of the file
    const content = readFileSync(jsonl.path, 'utf8');
    const lines = content.split('\n');
    // Scan last 2000 lines max
    const scanLines = lines.slice(-2000);

    for (const line of scanLines) {
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        const ts = obj.timestamp ? new Date(obj.timestamp).getTime() : 0;
        if (ts > result.latestTimestamp) result.latestTimestamp = ts;

        // Hook progress events → evidence of trigger fires + script calls
        if (obj.type === 'progress' && obj.data?.type === 'hook_progress') {
          const d = obj.data;
          const rawEvt = d.hookName || d.hookEvent || '';
          // JSONL stores compound names like "PostToolUse:Edit" — extract base event
          const evt = rawEvt.split(':')[0];
          if (evt) {
            const prev = result.hookEvents.get(evt) || 0;
            if (ts > prev) result.hookEvents.set(evt, ts);
          }
          const cmd = d.command || '';
          // Extract script basename from command
          const m = cmd.match(/helpers\/([a-zA-Z0-9._-]+)/);
          if (m) result.scriptsCalled.add(m[1]);
        }

        // Assistant tool_use → evidence of MCP service activity
        if (obj.type === 'assistant' && obj.message?.content) {
          for (const b of obj.message.content) {
            if (b.type !== 'tool_use') continue;
            const name = b.name || '';
            result.toolUses.add(name);
            if (name.startsWith('mcp__ruvector')) result.mcpCalls.add('ruvector');
            if (name.startsWith('mcp__claude-flow') || name.startsWith('mcp__claude_flow')) result.mcpCalls.add('claude-flow');
            if (name.startsWith('mcp__agentdb')) result.mcpCalls.add('agentdb');
            if (name.startsWith('mcp__pi-brain') || name.startsWith('mcp__pi_brain')) result.mcpCalls.add('pi-brain');
          }
        }
      } catch {}
    }
  } catch {}

  // Enrich scriptsCalled from direct-import evidence
  // In direct-import: hooks call bridge directly, so check memory.db mtime
  try {
    const memPath = resolve(DATA_ROOT, '.swarm/memory.db');
    if (existsSync(memPath) && (Date.now() - statSync(memPath).mtimeMs) < 3600000) {
      result.scriptsCalled.add('hook-handler.cjs');
      result.scriptsCalled.add('hook-bridge.cjs');
      result.scriptsCalled.add('auto-memory-hook.mjs');
    }
  } catch {}

  _activityCache = result;
  _activityCacheTime = now;
  return result;
}

// ── Parse latest [TASK_MODEL_RECOMMENDATION] from transcript ─
// Returns { tier, complexity, astComplexity, file, reason } or null.
let _modelRecCache = null;
let _modelRecCacheTime = 0;

export function getLatestModelRecommendation() {
  const now = Date.now();
  if (_modelRecCache && (now - _modelRecCacheTime) < 30000) return _modelRecCache;

  try {
    const jsonl = findLatestJsonl();
    if (!jsonl || (now - jsonl.mtimeMs) > 3600000) return null;

    const content = readFileSync(jsonl.path, 'utf8');
    // Scan last 500 lines for the most recent tag
    const lines = content.split('\n').slice(-500);
    let latest = null;
    const tagRe = /\[TASK_MODEL_RECOMMENDATION\]\s+tier=(\S+)\s+complexity=([0-9.]+)%?\s*(.*)/;
    for (const line of lines) {
      const m = line.match(tagRe);
      if (!m) continue;
      const rec = { tier: m[1], complexity: parseFloat(m[2]) };
      const rest = m[3] || '';
      const astM = rest.match(/ast_complexity=([0-9.]+)%?/);
      if (astM) rec.astComplexity = parseFloat(astM[1]);
      const fileM = rest.match(/file=([a-zA-Z0-9_.\/\-]+)/);
      if (fileM) rec.file = fileM[1];
      const reasonM = rest.match(/reason=(.*?)(?:\\n|$)/);
      if (reasonM) rec.reason = reasonM[1];
      latest = rec;
    }
    _modelRecCache = latest;
    _modelRecCacheTime = now;
    return latest;
  } catch { return null; }
}

// ── Learning Activity JSONL finder ───────────────────────────
// Returns the path to .claude-flow/data/learning-activity.jsonl if it exists,
// or null otherwise. Uses the same DATA_ROOT resolution as other helpers.

let _learningActivityCache = null;
let _learningActivityCacheTime = 0;
const LEARNING_ACTIVITY_CACHE_TTL = 5000; // 5s

export function findLearningActivity() {
  const now = Date.now();
  if (_learningActivityCache !== undefined && _learningActivityCache !== null
      && (now - _learningActivityCacheTime) < LEARNING_ACTIVITY_CACHE_TTL) {
    return _learningActivityCache;
  }
  // Also handle the cached-null case (file didn't exist last time we checked)
  if (_learningActivityCacheTime > 0 && (now - _learningActivityCacheTime) < LEARNING_ACTIVITY_CACHE_TTL) {
    return _learningActivityCache;
  }

  const filePath = resolve(DATA_ROOT, '.claude-flow', 'data', 'learning-activity.jsonl');
  if (!existsSync(filePath)) {
    _learningActivityCache = null;
    _learningActivityCacheTime = now;
    return null;
  }

  try {
    const st = statSync(filePath);
    const result = { path: filePath, mtimeMs: st.mtimeMs };
    _learningActivityCache = result;
    _learningActivityCacheTime = now;
    return result;
  } catch {
    _learningActivityCache = null;
    _learningActivityCacheTime = now;
    return null;
  }
}

// ── Process Check Cache ──────────────────────────────────────
// Checks if processes matching a pattern are running. Cached for 10s.

let _processCache = null;
let _processCacheTime = 0;
const PROCESS_CACHE_TTL = 10000;

function getRunningProcesses() {
  const now = Date.now();
  if (_processCache && (now - _processCacheTime) < PROCESS_CACHE_TTL) return _processCache;

  let psList = '';
  try {
    psList = execSync('ps aux 2>/dev/null', { timeout: 3000, encoding: 'utf8' });
  } catch {}

  _processCache = psList;
  _processCacheTime = now;
  return psList;
}

function isProcessRunning(pattern) {
  const ps = getRunningProcesses();
  return ps.includes(pattern);
}

export function getDataRoot() { return DATA_ROOT; }

// ── P3.1: Reusable helpers for data store endpoints ─────────

/**
 * Read a JSON file relative to DATA_ROOT, returning fallback if missing/invalid.
 * Unlike readJson (which returns null), this returns a provided default value.
 */
export function readJsonSafe(relPath, fallback = {}) {
  const data = readJson(relPath);
  return data !== null ? data : fallback;
}

/**
 * Check if a process with the given PID is alive.
 * Uses process.kill(pid, 0) which sends no signal but throws if PID doesn't exist.
 */
export function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function resolvePath(relPath) {
  if (relPath.startsWith('~')) return relPath.replace('~', process.env.HOME);
  return resolve(DATA_ROOT, relPath);
}

// ── DB helpers ─────────────────────────────────────────────────

export function openDb(relPath) {
  const fullPath = resolve(DATA_ROOT, relPath);
  try {
    if (!existsSync(fullPath)) return null;
    return new Database(fullPath, { readonly: true, fileMustExist: true });
  } catch { return null; }
}

// Safe DB access — guarantees close even on error
export function withDb(relPath, fn) {
  const db = openDb(relPath);
  if (!db) return null;
  try { return fn(db); }
  finally { db.close(); }
}

export function countRows(db, table) {
  if (!db) return 0;
  try {
    // Check table exists first
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);
    if (!exists) return 0;
    return db.prepare(`SELECT count(*) as c FROM "${table}"`).get().c;
  } catch { return 0; }
}

export function tableSchema(db, table) {
  if (!db) return [];
  try {
    return db.prepare(`PRAGMA table_info("${table}")`).all();
  } catch { return []; }
}

export function tablePreview(db, table, limit = 5) {
  if (!db) return [];
  try {
    const exists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    ).get(table);
    if (!exists) return [];
    return db.prepare(`SELECT * FROM "${table}" ORDER BY rowid DESC LIMIT ?`).all(limit);
  } catch { return []; }
}

export function listTables(db) {
  if (!db) return [];
  try {
    return db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
      .map(r => r.name);
  } catch { return []; }
}

// ── JSON helpers ───────────────────────────────────────────────

export function readJson(relPath) {
  const fullPath = resolve(DATA_ROOT, relPath);
  try {
    if (!existsSync(fullPath)) return null;
    return JSON.parse(readFileSync(fullPath, 'utf8'));
  } catch { return null; }
}

// ── File helpers ───────────────────────────────────────────────

export function fileStat(relPath) {
  const fullPath = resolve(DATA_ROOT, relPath);
  try {
    if (!existsSync(fullPath)) return { exists: false, size: 0, mtime: null, path: fullPath };
    const s = statSync(fullPath);
    return { exists: true, size: s.size, mtime: s.mtime.toISOString(), path: fullPath };
  } catch { return { exists: false, size: 0, mtime: null, path: fullPath }; }
}

export function globFiles(relDir, pattern) {
  const fullDir = resolve(DATA_ROOT, relDir);
  try {
    if (!existsSync(fullDir)) return [];
    return readdirSync(fullDir)
      .filter(f => {
        if (pattern.includes('*')) {
          const prefix = pattern.split('*')[0];
          const suffix = pattern.split('*').pop();
          return f.startsWith(prefix) && f.endsWith(suffix);
        }
        return f === pattern;
      })
      .map(f => join(relDir, f));
  } catch { return []; }
}

// ── Graph-state cache ──────────────────────────────────────────

let _graphCache = null;
let _graphMtime = null;

export function readGraphState() {
  const stat = fileStat('.claude-flow/data/graph-state.json');
  if (!stat.exists) return null;
  if (_graphCache && _graphMtime === stat.mtime) return _graphCache;
  _graphCache = readJson('.claude-flow/data/graph-state.json');
  _graphMtime = stat.mtime;
  return _graphCache;
}

// ── Node signal scanner ────────────────────────────────────────

export function scanNodeSignals(node) {
  const signals = { exists: false, healthy: false, active: false };
  let rowCount, fileSize, lastMod;
  const tierNames = { 1: 'Reactive', 2: 'Adaptive', 3: 'Deliberative', 9: 'Unexpected' };

  // Helper: build full return with meta (required by frontend)
  function buildResult() {
    return {
      ...node,
      expected: true,
      actual: signals.exists,
      signals,
      onDemand: !!node.onDemand,
      dormant: !!node.dormant,
      conceptual: !!node.conceptual,
      meta: {
        path: node.path ? resolvePath(node.path) : undefined,
        table: node.table,
        rowCount,
        countLabel: node._countLabel || null,
        fileSize,
        lastMod,
        description: node.description || '',
        tier: tierNames[node.tier] || 'Unknown',
        archTier: node.archTier || '',
        statusNote: node._dynamicStatusNote || node.statusNote || '',
        patchRef: node.patchRef,
        onDemand: !!node.onDemand,
        dormant: !!node.dormant,
        phantom: !!node.phantom,
        conceptual: !!node.conceptual,
        level: node.level || null,
        bugRefs: node.bugRefs || null,
        controllerStatus: node.controllerStatus || null,
        silo: node.silo || null,
        fallbackChain: node._fallbackChain || null,
        activeLevel: node._activeLevel ?? null,
      },
    };
  }

  // ── absent: true — node is known to not exist in this project layout ──
  if (node.absent) {
    node._dynamicStatusNote = `Not present in ruflo direct init (origin: ${node.origin || 'unknown'})`;
    return buildResult();
  }

  // ── detectVia: 'classifier' — ctrl_/backend_/util_ emitted by discoverNodes ──
  // Driven by the symbol classifier + controller-status composite cache.
  if (node.detectVia === 'classifier') {
    // util_* — static-only library, just check the source file exists
    if (node.id.startsWith('util_')) {
      const result = getUtilStatus(node.id, node.sourceFile || null);
      signals.exists  = result.status === 'installed';
      signals.healthy = signals.exists;
      signals.active  = false; // utils don't have an "active" concept
      const parts = ['util'];
      if (result.status) parts.push(result.status);
      if (node.className) parts.push(node.className);
      node._dynamicStatusNote = parts.join(' · ');
      return buildResult();
    }

    // backend_* — inherit status from parent controller via BACKEND_PARENT
    if (node.id.startsWith('backend_')) {
      const inh = getBackendStatus(node.id);
      const st = inh.status;
      signals.exists  = st !== 'unknown';
      signals.healthy = st === 'active' || st === 'idle';
      signals.active  = st === 'active';
      signals.degraded = st === 'degraded';
      signals.notLoaded = st === 'broken';
      const parts = ['backend'];
      if (node.className) parts.push(node.className);
      if (inh.source) parts.push(inh.source);
      if (inh.level) parts.push(`L${inh.level}`);
      node._dynamicStatusNote = parts.join(' · ');
      return buildResult();
    }

    // ctrl_* — read the 4-state composite from controller-status cache
    if (node.id.startsWith('ctrl_')) {
      const statusMap = getCachedStatusMap();
      const entry = node.mcpName ? statusMap.get(node.mcpName) : null;

      if (!entry) {
        // Cache not warm yet, or name not in MCP list
        signals.exists = false;
        signals.healthy = false;
        signals.active = false;
        node._dynamicStatusNote = node.mcpName
          ? `${node.mcpName} · (status cache warming)`
          : 'unclassified';
        return buildResult();
      }

      // Map 4-state → signals
      signals.exists    = entry.status !== 'broken' || entry.enabled === true;
      signals.healthy   = entry.status === 'active' || entry.status === 'idle';
      signals.notLoaded = entry.status === 'broken';
      signals.degraded  = entry.status === 'degraded';
      signals.active    = entry.status === 'active';

      const parts = [];
      if (entry.level) parts.push(`L${entry.level}`);
      parts.push(entry.status);
      if (entry.metric != null) parts.push(`metric:${entry.metric}`);
      if (entry.source) parts.push(entry.source.replace(/^agentdb_/, ''));
      if (entry.backend) parts.push(entry.backend);
      if (entry.lastActivity) parts.push(entry.lastActivity);
      if (node.phantom) parts.push('phantom');
      if (entry.reason) parts.push(entry.reason);
      node._dynamicStatusNote = parts.join(' · ');
      return buildResult();
    }
  }

  // ── detectVia: 'npm-package' — check node_modules for the package ──
  // Non-controller npm nodes (engines, models, services tied to @ruvector/*, ruvector).
  if (node.detectVia === 'npm-package' && node.npmPackage && !node.phantom) {
    const pkgPath = resolve(DATA_ROOT, 'node_modules', node.npmPackage, 'package.json');
    const pkgExists = existsSync(pkgPath);
    signals.exists = pkgExists;
    signals.healthy = pkgExists;
    if (pkgExists) {
      const parts = [];
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        parts.push(`${node.npmPackage}@${pkg.version || '?'}`);
        lastMod = statSync(pkgPath).mtime.toISOString();
      } catch { parts.push(node.npmPackage); }
      node._dynamicStatusNote = parts.join(' · ');
      signals.active = false;
      // Engine/model mapping: inherit activity from related ctrl via runtime status cache
      const ENGINE_TO_CTRL = {
        eng_sona_optimizer: ['sonaTrajectory'],
        eng_ewc_consolidation: ['learningSystem'],
        eng_intelligence: ['reasoningBank'],
        native_core: ['vectorBackend'],
        native_router: ['semanticRouter', 'gnnService'],
        wasm_lora: ['learningSystem'],
        wasm_attention: ['learningSystem', 'hierarchicalMemory'],
      };
      const mapped = ENGINE_TO_CTRL[node.id];
      if (mapped) {
        const statusMap = getCachedStatusMap();
        signals.active = mapped.some(mcpName => statusMap.get(mcpName)?.status === 'active');
      }
      // Fallback: ruvector data files recently written
      if (!signals.active && (node.npmPackage === 'ruvector' || node.npmPackage?.startsWith('@ruvector/'))) {
        const rvDb = fileStat('ruvector.db');
        const rvMt = rvDb.mtime ? new Date(rvDb.mtime).getTime() : 0;
        signals.active = rvMt > 0 && (Date.now() - rvMt) < 3600000;
      }
      // Bundled services: active if the host MCP process is running
      if (!signals.active && node.dormant) {
        const hostMcp = isProcessRunning('claude-flow');
        if (hostMcp) signals.active = true;
      }
    } else {
      node._dynamicStatusNote = `${node.npmPackage} not installed`;
    }
    return buildResult();
  }

  // ── detectVia: 'mcp-config' — check .mcp.json for server key ──
  if (node.detectVia === 'mcp-config' && node.mcpKey) {
    const mcpConfig = readJson('.mcp.json');
    const serverExists = !!(mcpConfig?.mcpServers?.[node.mcpKey]);
    signals.exists = serverExists;
    signals.healthy = serverExists;
    if (serverExists) {
      node._dynamicStatusNote = `Configured in .mcp.json`;
      // Check if the MCP server process is actually running
      const mcpCmd = mcpConfig.mcpServers[node.mcpKey];
      const cmdStr = [mcpCmd?.command, ...(mcpCmd?.args || [])].filter(Boolean).join(' ');
      const processName = cmdStr.split('/').pop()?.split(' ')[0] || node.mcpKey;
      signals.active = isProcessRunning(processName) || isProcessRunning(node.mcpKey);
      if (signals.active) node._dynamicStatusNote += ' · Running';
    } else {
      node._dynamicStatusNote = `Not configured in .mcp.json`;
    }
    return buildResult();
  }

  // ── detectVia: 'ruvector-daemon-v5' — v5 ruvector daemon PID+sock ──
  // The v5 daemon runs under .claude-flow/ruvector-daemon.{pid,sock}; all
  // in-process services (SonaEngine, VerdictAnalyzer, etc.) live inside it.
  if (node.detectVia === 'ruvector-daemon-v5') {
    const pidPath = resolvePath('.claude-flow/ruvector-daemon.pid');
    const sockPath = resolvePath('.claude-flow/ruvector-daemon.sock');
    signals.exists = existsSync(pidPath);
    if (signals.exists) {
      try {
        const pid = parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
        process.kill(pid, 0);
        signals.healthy = true;
        signals.active = existsSync(sockPath);
        node._dynamicStatusNote = signals.active
          ? `PID ${pid} · socket open`
          : `PID ${pid} · no socket`;
      } catch {
        signals.healthy = false;
        node._dynamicStatusNote = 'PID file exists but process not running';
      }
    } else {
      node._dynamicStatusNote = 'Not running';
    }
    return buildResult();
  }

  // ── detectVia: 'daemon-log' — service readiness from daemon.log ──
  // Services embedded inside the v5 ruvector daemon don't have their own
  // PID; their presence is confirmed by a readiness line in daemon.log.
  // Active = daemon PID alive AND the readiness pattern has been seen.
  if (node.detectVia === 'daemon-log' && node.logPattern) {
    const logPath = resolvePath('.claude-flow/data/daemon.log');
    let match = null;
    if (existsSync(logPath)) {
      try {
        const lines = readFileSync(logPath, 'utf8').split('\n').filter(Boolean).slice(-400);
        const re = new RegExp(node.logPattern);
        match = [...lines].reverse().find(l => re.test(l));
      } catch {}
    }
    signals.exists = !!match;
    signals.healthy = !!match;
    if (match) {
      const pidPath = resolvePath('.claude-flow/ruvector-daemon.pid');
      if (existsSync(pidPath)) {
        try {
          const pid = parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
          process.kill(pid, 0);
          signals.active = true;
        } catch {}
      }
      const msg = match.replace(/^[\d-]+T[\d:.]+Z\s+/, '').slice(0, 90);
      node._dynamicStatusNote = signals.active ? `ready · ${msg}` : `seen · ${msg}`;
      lastMod = (match.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/) || [])[1] || undefined;
    } else {
      node._dynamicStatusNote = 'not seen in daemon.log';
    }
    return buildResult();
  }

  if (node.type === 'trigger') {
    const settings = readJson('.claude/settings.json');
    if (settings?.hooks) {
      const eventMap = {
        'SessionStart': 'SessionStart', 'SessionEnd': 'SessionEnd',
        'PreToolUse': 'PreToolUse', 'PostToolUse': 'PostToolUse',
        'PostToolUseFailure': 'PostToolUseFailure', 'UserPromptSubmit': 'UserPromptSubmit',
        'Stop': 'Stop', 'PreCompact': 'PreCompact',
        'SubagentStart': 'SubagentStart', 'SubagentStop': 'SubagentStop',
        'Notification': 'Notification',
      };
      const evt = eventMap[node.label];
      if (evt && settings.hooks[evt]) {
        signals.exists = true;  // configured in settings.json
        signals.healthy = true; // hook definition is valid
        // active = fired recently (JSONL transcript OR daemon state as fallback)
        const activity = getRecentActivity();
        const lastFired = activity.hookEvents.get(evt) || 0;
        signals.active = lastFired > 0 && (Date.now() - lastFired) < 3600000;
        if (lastFired > 0) lastMod = new Date(lastFired).toISOString();
        // Fallback: if hooks-daemon is running and processing events, triggers are active
        if (!signals.active) {
          const daemonState = readJson('.claude-flow/data/hooks-daemon-state.json');
          if (daemonState?.lastRun) {
            const daemonTime = new Date(daemonState.lastRun).getTime();
            if (daemonTime > 0 && (Date.now() - daemonTime) < 3600000) {
              signals.active = true;
              if (!lastMod) lastMod = daemonState.lastRun;
            }
          }
        }
      }
    }
  } else if (node.type === 'worker') {
    // CLI Tools workers: on-demand, detected via daemon-state.json worker entries
    // Workers exist only if the CLI tool (ruflo) is installed
    let cliExists = existsSync(resolve(DATA_ROOT, 'node_modules/.bin/ruflo'));
    if (!cliExists) {
      try { execSync('which ruflo 2>/dev/null', { timeout: 2000, encoding: 'utf8' }); cliExists = true; } catch {}
    }
    signals.exists = cliExists;
    signals.healthy = cliExists;
    if (node.logKeys) {
      const daemonState = readJson('.claude-flow/daemon-state.json');
      const workerKey = node.logKeys[0];
      const workerInfo = daemonState?.workers?.[workerKey];
      if (workerInfo) {
        // Prefer most recent timestamp — lastTriggeredAt (viz button) vs lastRun (old daemon)
        const t1 = workerInfo.lastTriggeredAt ? new Date(workerInfo.lastTriggeredAt).getTime() : 0;
        const t2 = workerInfo.lastRun ? new Date(workerInfo.lastRun).getTime() : 0;
        const lastRun = t1 > t2 ? workerInfo.lastTriggeredAt : (workerInfo.lastRun || workerInfo.lastTriggeredAt);
        const lastTime = lastRun ? new Date(lastRun).getTime() : 0;
        signals.active = lastTime > 0 && (Date.now() - lastTime) < 3600000;
        if (lastRun) lastMod = new Date(lastRun).toISOString();
        const total = workerInfo.runCount || 0;
        const ok = workerInfo.successCount || 0;
        const fail = workerInfo.failureCount || 0;
        rowCount = total;
        const parts = [];
        if (total > 0) parts.push(`Runs: ${total} (${ok} ok, ${fail} fail)`);
        if (workerInfo.lastTriggeredAt) parts.push(`Last: ${new Date(workerInfo.lastTriggeredAt).toLocaleString()}`);
        node._dynamicStatusNote = parts.join(' · ') || 'Available (on-demand)';
      } else {
        signals.active = false;
        node._dynamicStatusNote = 'Available (never triggered)';
      }
    }
  } else if (node.type === 'bridge') {
    // Bridge: exists if file is there, active if memory.db was written recently (direct-import)
    if (node.path) {
      const s = fileStat(node.path);
      signals.exists = s.exists;
      signals.healthy = s.exists && s.size > 0;
      fileSize = s.size;
      lastMod = s.mtime;
      if (s.exists) {
        // Direct-import: bridge writes go to memory.db, not hook-queue.jsonl
        const memStat = fileStat('.swarm/memory.db');
        signals.active = memStat.mtime && (Date.now() - new Date(memStat.mtime).getTime()) < 3600000;
      }
    }
  } else if (node.type === 'script' || node.type === 'engine') {
    // eng_cold_fallback: no path — exists if hook-handler.cjs contains coldFallback()
    if (node.id === 'eng_cold_fallback') {
      try {
        const src = readFileSync(resolve(DATA_ROOT, '.claude/helpers/hook-handler.cjs'), 'utf8');
        signals.exists = src.includes('coldFallback');
        signals.healthy = signals.exists;
        // Active only when MCP daemon is NOT running (fallback path)
        if (signals.exists) {
          const pidPath = resolve(DATA_ROOT, '.claude-flow/pids/mcp-http.pid');
          const daemonRunning = existsSync(pidPath);
          signals.active = !daemonRunning; // cold fallback is active when MCP is down
          node._dynamicStatusNote = daemonRunning ? 'Standby (MCP daemon running)' : 'Active (MCP daemon offline)';
        }
      } catch {
        signals.exists = false;
      }
      return buildResult();
    }
    if (node.path) {
      const s = fileStat(node.path);
      // Fallback: if local binary not found, check global PATH (e.g. ruflo installed globally)
      if (!s.exists && node.path.startsWith('node_modules/.bin/')) {
        const binName = node.path.split('/').pop();
        try { execSync(`which ${binName} 2>/dev/null`, { timeout: 2000, encoding: 'utf8' }); s.exists = true; s.size = 1; } catch {}
      }
      signals.exists = s.exists;
      signals.healthy = s.exists && s.size > 0;
      fileSize = s.size;
      lastMod = s.mtime;

      // active = was called/used recently (evidence from JSONL transcript)
      if (s.exists) {
        const activity = getRecentActivity();
        const basename = node.path.split('/').pop();
        signals.active = activity.scriptsCalled.has(basename);

        // Engines called directly by hooks — check if hook-handler.cjs ran (it safeRequire's them)
        if (!signals.active && node.type === 'engine') {
          const engineCallers = {
            'intelligence.cjs':       ['hook-handler.cjs'],
            'session.cjs':            ['hook-handler.cjs'],
            'router.cjs':             ['hook-handler.cjs'],
            'learning-service.mjs':   ['hooks-daemon.mjs', 'hook-handler.cjs'],
            'metrics-db.mjs':         ['hook-handler.cjs'],
            'statusline.cjs':         ['hook-handler.cjs'],
            'auto-memory-hook.mjs':   ['auto-memory-hook.mjs', 'hook-handler.cjs'],
            'server.js':              ['server.js'],  // viz server — always active if API responds
            'api.js':                 ['server.js'],
          };
          const callers = engineCallers[basename];
          if (callers) {
            signals.active = callers.some(c => activity.scriptsCalled.has(c));
          }
        }

        // Fallback: if file was modified in last hour, also consider active
        if (!signals.active && s.mtime && (Date.now() - new Date(s.mtime).getTime()) < 3600000) {
          signals.active = true;
        }

        // CLI Tools engine — active if any worker was triggered in the last 2 hours
        if (!signals.active && node.id === 'eng_cli_tools') {
          const ds = readJson('.claude-flow/daemon-state.json');
          if (ds?.workers) {
            let newest = 0;
            for (const w of Object.values(ds.workers)) {
              const lt = w.lastTriggeredAt ? new Date(w.lastTriggeredAt).getTime() : 0;
              const lr = w.lastRun ? new Date(w.lastRun).getTime() : 0;
              newest = Math.max(newest, lt, lr);
            }
            if (newest > 0 && (Date.now() - newest) < 7200000) {
              signals.active = true;
              lastMod = new Date(newest).toISOString();
            }
          }
        }

        // Viz server/api — if this code is running, the server is active
        if (!signals.active && (basename === 'server.js' || basename === 'api.js') && node.path?.startsWith('src/')) {
          signals.active = true;
        }
      }
    } else {
      // Engines without path — fallback checks
      if (node.logKeys) {
        // ADR-TF05: CLI Daemon workers — detect from daemon-state.json
        const daemonState = readJson('.claude-flow/daemon-state.json');
        const workerKey = node.logKeys[0]; // e.g. 'map', 'audit', 'consolidate'
        const workerInfo = daemonState?.workers?.[workerKey];
        if (workerInfo) {
          signals.exists = true;
          // Count: runCount tracks daemon+viz triggers. If 0 but lastResult exists, worker ran at least once (pre-fix data).
          const hasResult = !!workerInfo.lastResult;
          const hasError = !!workerInfo.lastError;
          const total = (workerInfo.runCount || 0) || (hasResult || hasError ? 1 : 0);
          const ok = (workerInfo.successCount || 0) || (hasResult && !hasError ? 1 : 0);
          const fail = (workerInfo.failureCount || 0) || (hasError ? 1 : 0);
          // healthy = has run at least once successfully
          signals.healthy = ok > 0 || !!node.dormant;
          // active = ran in the last 2 hours OR currently running (check both daemon-scheduled and viz-triggered)
          const lastRun = workerInfo.lastRun ? new Date(workerInfo.lastRun).getTime() : 0;
          const lastTriggered = workerInfo.lastTriggeredAt ? new Date(workerInfo.lastTriggeredAt).getTime() : 0;
          const lastActivity = Math.max(lastRun, lastTriggered);
          signals.active = !!workerInfo.isRunning || (lastActivity > 0 && (Date.now() - lastActivity) < 7200000);
          if (lastActivity > 0) lastMod = new Date(lastActivity).toISOString();
          rowCount = total; // total runs as "row count" for display
          // Dynamic statusNote from daemon state
          const parts = [`Runs: ${total} (${ok} ok, ${fail} fail)`];
          if (workerInfo.isRunning) parts.push('RUNNING NOW');
          if (workerInfo.averageDurationMs) parts.push(`avg ${workerInfo.averageDurationMs.toFixed(0)}ms`);
          if (workerInfo.nextRun) {
            const next = new Date(workerInfo.nextRun);
            const diff = next.getTime() - Date.now();
            if (diff > 0) parts.push(`next in ${Math.round(diff / 60000)}m`);
          }
          node._dynamicStatusNote = parts.join(' · ');
        } else {
          // Worker defined in registry but not in daemon-state (daemon never started it)
          signals.exists = false;
          signals.healthy = false;
          signals.active = false;
          node._dynamicStatusNote = 'Not started — daemon has not scheduled this worker yet';
        }
      } else {
        signals.exists = false;
        signals.healthy = false;
        signals.active = false;
      }
    }
  } else if (node.type === 'store_db') {
    if (node.path) {
      const s = fileStat(node.path);
      signals.exists = s.exists;
      signals.healthy = s.exists && s.size > 0;
      fileSize = s.size;
      lastMod = s.mtime;

      if (s.exists) {
        if (node.format === 'redb') {
          // REDB — locked by ruvector MCP server, cannot query directly
          signals.healthy = s.size > 4096;
          rowCount = null; // show file size instead (set below)
        } else {
          const db = openDb(node.path);
          if (db) {
            if (node.table) {
              rowCount = countRows(db, node.table);
            } else {
              // Sum rows across target tables (or all non-internal tables)
              const targetTables = node.tables;
              const tables = targetTables || listTables(db);
              let totalRows = 0;
              for (const t of (targetTables || tables)) {
                if (t.startsWith('sqlite_')) continue;
                totalRows += countRows(db, t);
              }
              rowCount = totalRows;
            }
            db.close();
          }
        }
        // Active = has data AND recently modified (check WAL too — SQLite WAL mode delays .db mtime)
        const dbMtime = s.mtime ? new Date(s.mtime).getTime() : 0;
        const walStat = fileStat(node.path + '-wal');
        const walMtime = walStat.mtime ? new Date(walStat.mtime).getTime() : 0;
        const latestMtime = Math.max(dbMtime, walMtime);
        const recentlyModified = latestMtime > 0 && (Date.now() - latestMtime) < 3600000;
        signals.active = (rowCount === null || rowCount > 0) && recentlyModified;
        if (walMtime > dbMtime) lastMod = new Date(walMtime).toISOString();
      }
    }
  } else if (node.type === 'store_bin') {
    // Binary stores (redb, hnsw index, etc.) — just check file existence + size
    if (node.path) {
      const s = fileStat(node.path);
      signals.exists = s.exists;
      signals.healthy = s.exists && s.size > 0;
      fileSize = s.size;
      lastMod = s.mtime;
      if (s.exists) {
        signals.active = s.mtime && (Date.now() - new Date(s.mtime).getTime()) < 3600000;
      }
      // HNSW fresh-install: no index file but vector_indexes table exists → "ready (empty)"
      if (!s.exists && (node.id === 'bin_hnsw_index' || node.path?.includes('hnsw'))) {
        try {
          const memDb = openDb('.swarm/memory.db');
          if (memDb) {
            const hasTable = memDb.prepare(
              "SELECT name FROM sqlite_master WHERE type='table' AND name='vector_indexes'"
            ).get();
            if (hasTable) {
              signals.exists = true;
              signals.healthy = true;
              node._dynamicStatusNote = 'ready (no vectors yet)';
              node._hnswState = 'initializing';
            }
            memDb.close();
          }
        } catch {}
      }
    }
  } else if (node.type === 'store_json' || node.type === 'store_jsonl') {
    if (node.path?.includes('*')) {
      const dir = node.path.substring(0, node.path.lastIndexOf('/'));
      const pattern = node.path.split('/').pop();
      const files = globFiles(dir, pattern);
      signals.exists = files.length > 0;
      signals.healthy = files.length > 0;
      rowCount = files.length;
      node._countLabel = 'files';
      // active = at least one file was modified in the last hour
      if (files.length > 0) {
        let newestMtime = 0;
        for (const f of files) {
          const fs = fileStat(f);
          if (fs.mtime) {
            const mt = new Date(fs.mtime).getTime();
            if (mt > newestMtime) newestMtime = mt;
          }
        }
        if (newestMtime > 0) {
          signals.active = (Date.now() - newestMtime) < 3600000;
          lastMod = new Date(newestMtime).toISOString();
        }
      }
    } else if (node.path) {
      const s = fileStat(node.path);
      signals.exists = s.exists;
      // JSONL/log files: empty is valid (append-only, starts empty)
      const isAppendLog = node.path.endsWith('.jsonl') || node.path.endsWith('.log');
      signals.healthy = s.exists && (isAppendLog || s.size > 0);
      fileSize = s.size;
      lastMod = s.mtime;

      if (s.exists) {
        const isJsonl = node.path.endsWith('.jsonl');
        if (isJsonl) {
          // JSONL: one JSON object per line — count non-empty lines
          try {
            const fullPath = resolve(DATA_ROOT, node.path);
            const content = readFileSync(fullPath, 'utf8');
            rowCount = content.split('\n').filter(l => l.trim().length > 0).length;
          } catch { rowCount = 0; }
        } else {
          const data = readJson(node.path);
          if (data) {
            if (Array.isArray(data)) {
              rowCount = data.length;
            } else if (node.entityKey && data[node.entityKey]) {
              const v = data[node.entityKey];
              rowCount = Array.isArray(v) ? v.length : Object.keys(v).length;
              node._countLabel = node.entityKey;
            } else if (data.entries) {
              rowCount = Array.isArray(data.entries) ? data.entries.length : Object.keys(data.entries).length;
            } else {
              // Find the largest array property as the likely entity list
              let bestKey = null, bestLen = 0;
              for (const k of Object.keys(data)) {
                if (Array.isArray(data[k]) && data[k].length > bestLen) {
                  bestLen = data[k].length;
                  bestKey = k;
                }
              }
              rowCount = bestLen > 0 ? bestLen : Object.keys(data).length;
            }
          }
        }
        // active = file was modified in the last hour OR daemon is actively running
        signals.active = s.mtime && (Date.now() - new Date(s.mtime).getTime()) < 3600000;
        if (!signals.active && s.exists) {
          const ds = readJson('.claude-flow/data/hooks-daemon-state.json');
          if (ds?.lastRun && (Date.now() - new Date(ds.lastRun).getTime()) < 3600000 && (ds.totalPipelineOps || 0) > 0) {
            signals.active = true;
          }
        }
      }
    }
  } else if (node.type === 'config') {
    if (node.path) {
      const s = fileStat(node.path);
      signals.exists = s.exists;
      fileSize = s.size;
      lastMod = s.mtime;


      if (s.exists) {
        const ext = node.path.split('.').pop().toLowerCase();
        if (ext === 'yaml' || ext === 'yml' || ext === 'sql') {
          signals.healthy = s.exists && s.size > 0;
        } else {
          const data = readJson(node.path);
          signals.healthy = data !== null; // parseable JSON = healthy
        }
        // active = config is consumed by a process that ran recently
        if (signals.healthy) {
          const activity = getRecentActivity();
          if (node.path.includes('.mcp.json')) {
            // .mcp.json is active if any MCP server was called
            signals.active = activity.mcpCalls.size > 0;
          } else if (node.path.includes('settings.json')) {
            // settings.json is active if any hook fired
            signals.active = activity.hookEvents.size > 0;
          } else if (node.path.includes('ruvector') || node.path.includes('brain')) {
            // ruvector configs active if ruvector MCP was called
            signals.active = activity.mcpCalls.has('ruvector');
          } else {
            // other configs: active if modified in last hour (someone wrote to it)
            signals.active = s.mtime && (Date.now() - new Date(s.mtime).getTime()) < 3600000;
          }
        }
      }
    }
  } else if (node.type === 'model') {
    if (node.path && node.id === 'mdl_onnx') {
      // ── ONNX MiniLM: hierarchical fallback chain probe ──
      const HOME = process.env.HOME || '/root';
      const fallbackChain = [
        { level: 1, label: 'Project-local quantized', type: 'quantized',
          path: resolve(DATA_ROOT, 'node_modules/@xenova/transformers/.cache/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx') },
        { level: 2, label: 'Global quantized (~/.ruvector)', type: 'quantized',
          path: resolve(HOME, '.ruvector/models/Xenova/all-MiniLM-L6-v2/onnx/model_quantized.onnx') },
        { level: 3, label: 'Global unquantized (~/.ruvector)', type: 'unquantized',
          path: resolve(HOME, '.ruvector/models/all-MiniLM-L6-v2-model.onnx') },
        { level: 4, label: 'Hash-based fallback', type: 'hash-fallback', path: null },
      ];
      let activeLevel = 4; // worst case: hash fallback
      for (const entry of fallbackChain) {
        if (!entry.path) { entry.exists = false; entry.size = 0; continue; }
        try {
          const st = statSync(entry.path);
          entry.exists = true;
          entry.size = st.size;
          entry.lastMod = st.mtime.toISOString();
          if (activeLevel === 4) activeLevel = entry.level; // first existing wins
        } catch {
          entry.exists = false;
          entry.size = 0;
        }
      }
      // Hash fallback is always "available" — it's code, not a file
      fallbackChain[3].exists = true;
      fallbackChain[3].size = 0;

      signals.exists = activeLevel <= 3; // real model exists somewhere
      signals.healthy = activeLevel <= 2; // quantized = healthy; unquantized or hash = degraded
      // Active = daemon bridge warm OR ruvector MCP in use
      const activity = getRecentActivity();
      signals.active = activity.mcpCalls.has('ruvector');
      if (!signals.active) {
        const daemonState = readJson('.claude-flow/data/hooks-daemon-state.json');
        if (daemonState && daemonState.bridgeReady) signals.active = true;
      }
      if (!signals.active) {
        const active = fallbackChain.find(e => e.level === activeLevel);
        if (active && active.lastMod && (Date.now() - new Date(active.lastMod).getTime()) < 3600000) {
          signals.active = true;
        }
      }
      // Compute total size from the active model + its directory siblings
      const activeEntry = fallbackChain.find(e => e.level === activeLevel);
      fileSize = activeEntry ? activeEntry.size : 0;
      if (activeEntry && activeEntry.lastMod) lastMod = activeEntry.lastMod;

      // Stash chain on the node so buildResult() can include it in meta
      node._fallbackChain = fallbackChain;
      node._activeLevel = activeLevel;
    } else if (node.path) {
      const expanded = node.path.startsWith('~')
        ? node.path.replace('~', process.env.HOME || '/root')
        : resolve(DATA_ROOT, node.path);
      signals.exists = existsSync(expanded);
      if (signals.exists) {
        try {
          const st = statSync(expanded);
          if (st.isDirectory()) {
            const entries = readdirSync(expanded);
            signals.healthy = entries.some(f => f.endsWith('.onnx') || f.endsWith('.json') || f.endsWith('.bin'));
          } else {
            signals.healthy = st.size > 0;
            fileSize = st.size;
            lastMod = st.mtime.toISOString();
          }
        } catch { signals.healthy = false; }
      }
      const activity = getRecentActivity();
      signals.active = activity.mcpCalls.has('ruvector');
      if (!signals.active) {
        const daemonState = readJson('.claude-flow/data/hooks-daemon-state.json');
        if (daemonState && daemonState.bridgeReady) signals.active = true;
      }
      if (!signals.active && lastMod && (Date.now() - new Date(lastMod).getTime()) < 3600000) {
        signals.active = true;
      }
    } else if (node.phantom) {
      // In-memory models (e.g. T2 HNSW) — inherit status from parent engine
      // T2 HNSW lives inside learning-service.mjs. When the engine is active, the index is active.
      const parentId = node.parentEngine || 'eng_learning_service';
      const parentPath = `.claude/helpers/${parentId.replace('eng_', '').replace(/_/g, '-')}.mjs`;
      const parentStat = fileStat(parentPath);
      signals.exists = parentStat.exists;
      signals.healthy = parentStat.exists && parentStat.size > 0;
      // Active = parent engine was called recently
      const activity = getRecentActivity();
      const parentBasename = parentPath.split('/').pop();
      signals.active = activity.scriptsCalled.has(parentBasename);
      if (!signals.active && parentStat.mtime) {
        signals.active = (Date.now() - new Date(parentStat.mtime).getTime()) < 3600000;
      }
    }
  } else if (node.type === 'daemon') {
    // Background daemons: check PID file + process alive
    const daemonNames = {
      'hooks-daemon.mjs': 'hooks-daemon',
      'metrics-db.mjs': 'metrics-daemon',
      'swarm-monitor.sh': 'swarm-monitor',
    };
    const basename = node.label || '';
    const pidName = daemonNames[basename];

    // CLI daemon (ruflo daemon): PID in .claude-flow/daemon.pid (not in pids/ subdir)
    if (node.id === 'eng_cli_daemon') {
      const pidFile = resolvePath('.claude-flow/daemon.pid');
      signals.exists = pidFile ? existsSync(pidFile) : false;
      if (signals.exists) {
        try {
          const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
          process.kill(pid, 0);
          signals.healthy = true;
          signals.active = true;
          // Read daemon state for worker stats
          const stateFile = resolvePath('.claude-flow/daemon-state.json');
          if (stateFile && existsSync(stateFile)) {
            try {
              const state = JSON.parse(readFileSync(stateFile, 'utf8'));
              fileSize = JSON.stringify(state).length;
              node._dynamicStatusNote = `PID ${pid}, ${Object.keys(state.workers || {}).length} workers, running since ${state.startedAt || 'unknown'}`;
            } catch {}
          }
        } catch {
          signals.healthy = false;
          signals.active = false;
          node._dynamicStatusNote = 'PID file exists but process not running';
        }
      }
      return buildResult();
    }

    signals.exists = node.path ? existsSync(resolvePath(node.path)) : true;
    if (pidName) {
      const pidFile = resolvePath(`.claude-flow/pids/${pidName}.pid`);
      if (pidFile && existsSync(pidFile)) {
        try {
          const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
          process.kill(pid, 0);
          signals.healthy = true;
          signals.active = true;
        } catch {
          signals.healthy = false;
        }
      }
    }

  } else if (node.type === 'bridge') {
    // Bridge: exists if module file present, healthy if callers are wired, active if called recently
    const bridgePath = node.path ? resolvePath(node.path) : null;
    signals.exists = bridgePath ? existsSync(bridgePath) : false;

    if (signals.exists) {
      // RFP-010: hook-handler.cjs calls bridge directly via fireBridge()
      // Check sentinel in hook-handler.cjs as evidence of healthy wiring
      const hhPath = resolvePath('.claude/helpers/hook-handler.cjs');
      let rfp010Wired = false;
      if (hhPath && existsSync(hhPath)) {
        try {
          const hhContent = readFileSync(hhPath, 'utf8');
          rfp010Wired = hhContent.includes('BOOTSTRAP_PATCH_BRIDGE_WIRE');
        } catch {}
      }

      // Also check hooks-daemon PID (sparkling path, optional)
      let daemonAlive = false;
      const pidFile = resolvePath('.claude-flow/pids/hooks-daemon.pid');
      if (pidFile && existsSync(pidFile)) {
        try {
          const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
          process.kill(pid, 0);
          daemonAlive = true;
        } catch {}
      }

      signals.healthy = rfp010Wired || daemonAlive;
      if (!signals.healthy) {
        node._dynamicStatusNote = 'Installed but not wired — no callers from hooks (B2: record command missing, RFP-007 needed)';
      } else {
        node._dynamicStatusNote = rfp010Wired ? 'Wired via hook-handler (RFP-010)' : 'Wired via hooks-daemon';
      }

      // active = hook-handler was called recently (RFP-010 path) OR daemon bridge is warm
      if (rfp010Wired) {
        const activity = getRecentActivity();
        signals.active = activity.scriptsCalled.has('hook-handler.cjs');
      }
      if (!signals.active && daemonAlive) {
        const stateFile = resolvePath('.claude-flow/data/hooks-daemon-state.json');
        if (stateFile && existsSync(stateFile)) {
          try {
            const state = JSON.parse(readFileSync(stateFile, 'utf8'));
            signals.active = !!state.bridgeReady;
          } catch {}
        }
      }
    }

  } else if (node.type === 'controller') {
    // ADR-053 controllers: reachable via bridge (RFP-010: hook-handler calls bridge per-event)
    // exists = bridge module file present
    // healthy = bridge is wired (RFP-010 sentinel OR hooks-daemon running)
    // active = hook-handler called recently (RFP-010 path) OR daemon pipeline ops > 0
    const bridgePath = resolvePath('node_modules/@claude-flow/cli/dist/src/memory/memory-bridge.js');
    signals.exists = bridgePath ? existsSync(bridgePath) : false;

    if (signals.exists) {
      // RFP-010: hook-handler.cjs calls bridge directly
      const hhPath = resolvePath('.claude/helpers/hook-handler.cjs');
      let rfp010Wired = false;
      if (hhPath && existsSync(hhPath)) {
        try {
          const hhContent = readFileSync(hhPath, 'utf8');
          rfp010Wired = hhContent.includes('BOOTSTRAP_PATCH_BRIDGE_WIRE');
        } catch {}
      }

      // Also check hooks-daemon (sparkling path, optional)
      let daemonAlive = false;
      const pidFile = resolvePath('.claude-flow/pids/hooks-daemon.pid');
      if (pidFile && existsSync(pidFile)) {
        try {
          const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
          process.kill(pid, 0);
          daemonAlive = true;
        } catch {}
      }

      signals.healthy = rfp010Wired || daemonAlive;

      // active = hook-handler was called recently (bridge is reachable per-event)
      if (rfp010Wired) {
        const activity = getRecentActivity();
        signals.active = activity.scriptsCalled.has('hook-handler.cjs');
      }
      if (!signals.active && daemonAlive) {
        const stateFile = resolvePath('.claude-flow/data/hooks-daemon-state.json');
        if (stateFile && existsSync(stateFile)) {
          try {
            const state = JSON.parse(readFileSync(stateFile, 'utf8'));
            signals.active = (state.totalPipelineOps || 0) > 0;
          } catch {}
        }
      }
    }

  } else if (node.type === 'service') {
    // ── svc_mcp_http: PID file + health endpoint ──────────────
    if (node.id === 'svc_mcp_http') {
      const pidPath = resolve(DATA_ROOT, '.claude-flow/pids/mcp-http.pid');
      signals.exists = existsSync(pidPath);
      if (signals.exists) {
        try {
          const pid = parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
          process.kill(pid, 0); // passive: signal 0 just checks if process exists
          signals.healthy = true;
          // Active = process is alive and has open file descriptors
          signals.active = true;
          node._dynamicStatusNote = `PID ${pid} · running`;
        } catch {
          signals.healthy = false;
          node._dynamicStatusNote = 'PID file exists but process not running';
        }
      } else {
        // Fallback: check process table for MCP server without PID file
        const svcPids = detectServicePids();
        const mcpSvc = svcPids.services.find(s => s.type === 'mcp');
        if (mcpSvc?.alive) {
          signals.exists = true;
          signals.healthy = true;
          signals.active = true;
          node._dynamicStatusNote = `PID ${mcpSvc.pid} · detected via ps`;
        } else {
          node._dynamicStatusNote = 'Not running (no PID file)';
        }
      }
      return buildResult();
    }
    // ── svc_sona_daemon: PID file + Unix socket ──────────────
    if (node.id === 'svc_sona_daemon') {
      const pidPath = '/tmp/ruvector-runtime.pid';
      const sockPath = '/tmp/ruvector-runtime.sock';
      signals.exists = existsSync(pidPath);
      if (signals.exists) {
        try {
          const pid = parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
          process.kill(pid, 0);
          signals.healthy = true;
          signals.active = existsSync(sockPath);
          node._dynamicStatusNote = `PID ${pid} · ${signals.active ? 'socket open' : 'no socket'}`;
          // Check sona-state.json for pattern count
          const state = readJson('.ruvector/sona-state.json');
          if (state?.patterns) {
            node._dynamicStatusNote += ` · ${state.patterns.length} patterns`;
          }
        } catch {
          signals.healthy = false;
          node._dynamicStatusNote = 'PID file exists but process not running';
        }
      } else {
        node._dynamicStatusNote = 'Not running (idle or not started)';
      }
      return buildResult();
    }
    const mcp = readJson('.mcp.json');
    if (mcp?.mcpServers) {
      const map = {
        'claude-flow MCP': 'claude-flow', 'ruvector MCP': 'ruvector',
        'agentdb MCP': 'agentdb', 'pi-brain MCP': 'pi-brain',
        'ruv-swarm MCP': 'ruv-swarm', 'flow-nexus MCP': 'flow-nexus',
      };
      const name = map[node.label];
      if (name && mcp.mcpServers[name]) {
        const cfg = mcp.mcpServers[name];
        signals.exists = true; // defined in .mcp.json

        // healthy = the command binary exists and can be found
        const cmd = cfg.command || '';
        if (cmd === 'npx' || cmd === 'node') {
          signals.healthy = true; // npx/node are always available
        } else if (cmd) {
          try {
            execSync(`which ${cmd} 2>/dev/null`, { timeout: 2000, encoding: 'utf8' });
            signals.healthy = true;
          } catch { signals.healthy = false; }
        }

        // active = process running for this project (ps scan) OR tool_use in JSONL
        const svcPids = detectServicePids();
        const running = svcPids.services.find(s => s.cmdline?.includes(name));
        if (running?.alive) {
          signals.active = true;
        } else {
          const activity = getRecentActivity();
          signals.active = activity.mcpCalls.has(name);
        }
      }
    }
  }

  return buildResult();
}

// ── Unexpected node scanner ────────────────────────────────────

export function scanUnexpectedNodes(expectedPaths) {
  const unexpected = [];
  const knownPaths = new Set(expectedPaths);

  // Build glob matchers from expectedPaths entries containing '*'
  const globPats = [...expectedPaths].filter(p => p.includes('*')).map(p => {
    const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  });

  function isKnownPath(rel) {
    if (knownPaths.has(rel)) return true;
    return globPats.some(re => re.test(rel));
  }

  // Scan .claude/helpers/ for unknown scripts
  const helpersDir = '.claude/helpers';
  const s = fileStat(helpersDir);
  if (s.exists) {
    try {
      const files = readdirSync(resolve(DATA_ROOT, helpersDir));
      for (const f of files) {
        const rel = `${helpersDir}/${f}`;
        if (!isKnownPath(rel) && (f.endsWith('.js') || f.endsWith('.cjs') || f.endsWith('.mjs') || f.endsWith('.sh'))) {
          const uStat = fileStat(rel);
          const uActivity = getRecentActivity();
          const uBasename = f;
          const uActive = uActivity.scriptsCalled.has(uBasename);

          unexpected.push({
            id: `unexpected_${f.replace(/[^a-zA-Z0-9]/g, '_')}`,
            label: f,
            type: f.endsWith('.sh') ? 'script' : 'engine',
            tier: 9,
            layer: f.endsWith('.sh') ? 1 : 2,
            path: rel,
            expected: false,
            actual: true,
            signals: { exists: true, healthy: uStat.size > 0, active: !!uActive },
            meta: { path: resolvePath(rel), description: 'Unexpected file — not in architecture registry', tier: 'Unexpected' },
          });
        }
      }
    } catch {}
  }

  // Scan .claude-flow/data/ for unknown JSON files
  const dataDir = '.claude-flow/data';
  const ds = fileStat(dataDir);
  if (ds.exists) {
    try {
      const files = readdirSync(resolve(DATA_ROOT, dataDir)).filter(f => f.endsWith('.json'));
      for (const f of files) {
        const rel = `${dataDir}/${f}`;
        if (!isKnownPath(rel)) {
          const jStat = fileStat(rel);
          // Unexpected JSON: active only if written to in the last hour by a real process
          // (check JSONL transcript for writes to this file)
          const jActivity = getRecentActivity();
          const jActive = jActivity.scriptsCalled.has(f);
          unexpected.push({
            id: `unexpected_${f.replace(/[^a-zA-Z0-9]/g, '_')}`,
            label: f,
            type: 'store_json',
            tier: 9,
            layer: 3,
            path: rel,
            expected: false,
            actual: true,
            signals: { exists: true, healthy: jStat.size > 0, active: !!jActive },
            meta: { path: resolvePath(rel), description: 'Unexpected JSON store', tier: 'Unexpected' },
          });
        }
      }
    } catch {}
  }

  return unexpected;
}

// ── Dynamic hook/edge discovery from settings.json ─────────────

export function parseHooksFromSettings() {
  const settings = readJson('.claude/settings.json');
  if (!settings?.hooks) return { scripts: [], edges: [] };

  const scripts = new Set();
  const edges = [];

  // Extract script paths from hook commands
  const extractScripts = (cmd) => {
    // Match .claude/helpers/*.sh or .claude/helpers/*.js patterns
    const matches = cmd.match(/\.claude\/helpers\/[a-zA-Z0-9._-]+\.(sh|js|cjs|mjs)/g) || [];
    // Also match relative paths like helpers/*.sh
    const relMatches = cmd.match(/helpers\/[a-zA-Z0-9._-]+\.(sh|js|cjs|mjs)/g) || [];
    return [...matches, ...relMatches.map(m => `.claude/${m}`)];
  };

  // Map event names to registry IDs
  const eventIdMap = {
    'PreToolUse': 'evt_pre_tool_use',
    'PostToolUse': 'evt_post_tool_use',
    'PostToolUseFailure': 'evt_post_tool_fail',
    'SessionStart': 'evt_session_start',
    'SessionEnd': 'evt_session_end',
    'UserPromptSubmit': 'evt_user_prompt',
    'Stop': 'evt_stop',
    'PreCompact': 'evt_pre_compact',
    'SubagentStart': 'evt_subagent_start',
    'SubagentStop': 'evt_subagent_stop',
  };

  // Map script/engine filenames to registry IDs
  // Includes both .sh scripts AND .cjs/.mjs engines (hooks call engines directly)
  const scriptIdMap = {
    'guidance-hooks.sh': 'scr_guidance_hooks',
    'guidance-hook.sh': 'scr_guidance_hook',
    'swarm-hooks.sh': 'scr_swarm_hooks',
    'swarm-monitor.sh': 'scr_swarm_monitor',
    'swarm-comms.sh': 'scr_swarm_comms',
    'learning-hooks.sh': 'scr_learning_hooks',
    'auto-commit.sh': 'scr_auto_commit',
    'daemon-manager.sh': 'eng_daemon_manager',
    'hook-relay.sh': 'eng_hook_relay',
    'context-persistence-hook.mjs': 'eng_context_persist',
    'checkpoint-manager.sh': 'scr_checkpoint_manager',
    'update-v3-progress.sh': 'scr_update_v3_progress',
    'hook-handler.cjs': 'eng_hook_handler',
    'auto-memory-hook.mjs': 'eng_auto_memory',
    'intelligence.cjs': 'eng_intelligence',
    'statusline.cjs': 'eng_statusline',
    'router.js': 'eng_router',
    'session.js': 'eng_session',
    'memory.js': 'eng_memory_handler',
    'learning-service.mjs': 'eng_learning_service',
    'metrics-db.mjs': 'eng_metrics_db',
    'github-safe.js': 'eng_github_safe',
  };

  for (const [eventName, hookGroups] of Object.entries(settings.hooks)) {
    const eventId = eventIdMap[eventName] || `evt_${eventName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

    for (const group of hookGroups) {
      const hooks = group.hooks || [group];
      for (const hook of hooks) {
        if (hook.command) {
          const foundScripts = extractScripts(hook.command);
          for (const scriptPath of foundScripts) {
            scripts.add(scriptPath);
            const scriptName = scriptPath.split('/').pop();
            const scriptId = scriptIdMap[scriptName] || `scr_${scriptName.replace(/[^a-zA-Z0-9]/g, '_')}`;
            edges.push({
              sourceId: eventId,
              targetId: scriptId,
              type: 'fires',
              label: `${eventName} hook`,
              dynamic: true
            });
          }
        }
      }
    }
  }

  return {
    scripts: Array.from(scripts),
    edges
  };
}

// ── Dynamic MCP service discovery from .mcp.json ───────────────

export function parseMcpServers() {
  const mcp = readJson('.mcp.json');
  if (!mcp?.mcpServers) return [];

  return Object.keys(mcp.mcpServers).map(name => ({
    id: `svc_${name.replace(/[^a-zA-Z0-9]/g, '_')}`,
    label: `${name} MCP`,
    type: 'service',
    tier: 2,
    layer: 4,
    dynamic: true,
    config: mcp.mcpServers[name]
  }));
}

// ── Scan additional directories for stores ─────────────────────

export function scanAdditionalStores(expectedPaths) {
  const stores = [];
  const knownPaths = new Set(expectedPaths);

  // Build glob matchers from expectedPaths entries containing '*'
  const globPatterns = [...expectedPaths].filter(p => p.includes('*')).map(p => {
    const escaped = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  });

  function isKnown(rel) {
    if (knownPaths.has(rel)) return true;
    return globPatterns.some(re => re.test(rel));
  }

  // Directories to scan
  const scanDirs = [
    { dir: '.claude-flow/learning', type: 'store_db', ext: '.db' },
    { dir: '.claude-flow/learning', type: 'store_json', ext: '.json' },
    { dir: '.swarm', type: 'store_db', ext: '.db' },
    { dir: '.ruvector', type: 'store_json', ext: '.json' },
  ];

  for (const { dir, type, ext } of scanDirs) {
    const s = fileStat(dir);
    if (!s.exists) continue;

    try {
      const files = readdirSync(resolve(DATA_ROOT, dir)).filter(f => f.endsWith(ext));
      for (const f of files) {
        const rel = `${dir}/${f}`;
        if (isKnown(rel)) continue;

        const fStat = fileStat(rel);
        stores.push({
          id: `store_${f.replace(/[^a-zA-Z0-9]/g, '_')}`,
          label: f,
          type,
          tier: 9,
          layer: 3,
          path: rel,
          expected: false,
          actual: true,
          dynamic: true,
          signals: { exists: true, healthy: fStat.size > 0, active: false },
          meta: { path: resolvePath(rel), description: 'Auto-detected store', tier: 'Dynamic' },
        });
      }
    } catch {}
  }

  return stores;
}

// ═══════════════════════════════════════════════════════════════
// Auto-Discovery: Build node list from reality, not from registry
// Registry is used ONLY for stable IDs + enrichment (descriptions, bugRefs)
// ═══════════════════════════════════════════════════════════════

export function discoverNodes(registryNodes) {
  const nodes = new Map(); // id → node

  // Registry lookups for stable IDs + enrichment
  const regByPath = new Map();
  const regById = new Map();
  for (const n of registryNodes) {
    if (n.path && !n.path.includes('*')) regByPath.set(n.path, n);
    regById.set(n.id, n);
  }

  // Merge discovered node with registry enrichment (strips `absent`)
  function add(id, base) {
    const reg = regById.get(id) || (base.path ? regByPath.get(base.path) : null);
    if (reg) {
      const { absent, ...enrichment } = reg;
      nodes.set(reg.id, { ...base, ...enrichment, discovered: true });
    } else {
      nodes.set(id, { ...base, discovered: true });
    }
  }

  // ── 1. Triggers from settings.json ────────────────────────────
  try {
    const settings = readJson('.claude/settings.json');
    if (settings?.hooks) {
      const idMap = {
        'PreToolUse': 'evt_pre_tool_use', 'PostToolUse': 'evt_post_tool_use',
        'PostToolUseFailure': 'evt_post_tool_fail',
        'SessionStart': 'evt_session_start', 'SessionEnd': 'evt_session_end',
        'UserPromptSubmit': 'evt_user_prompt', 'Stop': 'evt_stop',
        'PreCompact': 'evt_pre_compact',
        'SubagentStart': 'evt_subagent_start', 'SubagentStop': 'evt_subagent_stop',
        'Notification': 'evt_notification',
      };
      for (const eventName of Object.keys(settings.hooks)) {
        const id = idMap[eventName] || `evt_${eventName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        add(id, { id, label: eventName, type: 'trigger', tier: 1, layer: 0 });
      }
    }
  } catch {}

  // ── 2. Scripts/Engines from .claude/helpers/ ──────────────────
  try {
    const helpersDir = resolve(DATA_ROOT, '.claude/helpers');
    if (existsSync(helpersDir)) {
      for (const f of readdirSync(helpersDir)) {
        if (!/\.(sh|js|cjs|mjs)$/.test(f)) continue;
        try { if (statSync(resolve(helpersDir, f)).isDirectory()) continue; } catch { continue; }
        const isShell = f.endsWith('.sh');
        const basename = f.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_');
        const prefix = isShell ? 'scr' : 'eng';
        const id = `${prefix}_${basename}`;
        const path = `.claude/helpers/${f}`;
        add(id, { id, label: f, type: isShell ? 'script' : 'engine',
          tier: isShell ? 1 : 2, layer: isShell ? 1 : 2, path });
      }
    }
  } catch {}

  // ── 3. Stores from filesystem scan ────────────────────────────
  // glob: true → treat entire directory as one node (count files, not list them)
  // Used for dirs that accumulate timestamped files (sessions, exports, logs)
  const storeScans = [
    { dir: '.claude-flow/data', defaultTier: 1 },
    { dir: '.claude-flow/learning', defaultTier: 2, glob: true },
    { dir: '.claude-flow/metrics', defaultTier: 2, glob: true },
    { dir: '.claude-flow/neural', defaultTier: 2 },
    { dir: '.claude-flow/logs', defaultTier: 2, glob: true },
    { dir: '.claude-flow/sessions', defaultTier: 1, glob: true },
    { dir: '.claude-flow/security', defaultTier: 2 },
    { dir: '.swarm', defaultTier: 2 },
    { dir: '.ruvector', defaultTier: 3 },
  ];
  // Track glob dirs so later passes don't create individual nodes for their files
  const globDirs = new Set(storeScans.filter(s => s.glob).map(s => s.dir));

  for (const { dir, defaultTier, glob } of storeScans) {
    const fullDir = resolve(DATA_ROOT, dir);
    if (!existsSync(fullDir)) continue;
    try {
      if (glob) {
        // Glob mode: one node for the whole directory (e.g. sessions/, learning/)
        const files = readdirSync(fullDir).filter(f => {
          try { return !statSync(resolve(fullDir, f)).isDirectory(); } catch { return false; }
        });
        if (files.length === 0) continue;
        const dirName = dir.split('/').pop();
        const globPath = `${dir}/*.json`;
        const reg = regByPath.get(globPath);
        const id = reg?.id || `store_${dirName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        add(id, { id, label: `${dirName}/ (${files.length} files)`, type: 'store_json', tier: defaultTier, layer: 3, path: globPath });
        continue;
      }
      for (const f of readdirSync(fullDir)) {
        try { if (statSync(resolve(fullDir, f)).isDirectory()) continue; } catch { continue; }
        // Skip timestamp-based files (e.g. session-1774781705705.json) — covered by glob node
        if (/\d{10,}/.test(f) || /^\d{4}-\d{2}/.test(f)) continue;
        const ext = f.split('.').pop();
        let type;
        if (ext === 'db') type = 'store_db';
        else if (ext === 'jsonl') type = 'store_jsonl';
        else if (ext === 'json') type = 'store_json';
        else if (ext === 'log') type = 'store_json';
        else if (ext === 'graph' || ext === 'index') type = 'store_bin';
        else if (ext === 'sql') type = 'config';
        else if (ext === 'pid') continue;
        else continue;

        const path = `${dir}/${f}`;
        const reg = regByPath.get(path);
        const id = reg?.id || `store_${f.replace(/[^a-zA-Z0-9]/g, '_')}`;
        add(id, { id, label: f, type, tier: defaultTier, layer: 3, path });
      }
    } catch {}
  }

  // Root-level stores
  try {
    for (const path of ['ruvector.db']) {
      if (!existsSync(resolve(DATA_ROOT, path))) continue;
      const f = path.split('/').pop();
      const reg = regByPath.get(path);
      const id = reg?.id || `store_${f.replace(/[^a-zA-Z0-9]/g, '_')}`;
      add(id, { id, label: f, type: 'store_db', tier: 3, layer: 3, path });
    }
  } catch {}

  // ── 4. Configs (check known paths) ───────────────────────────
  const configPaths = [
    '.claude/settings.json', '.mcp.json', '.claude-flow/config.yaml',
    'CLAUDE.md', '.claude-flow/embeddings.json', '.swarm/schema.sql',
    'src/config/viz-layout.json', '.claude-flow/CAPABILITIES.md', '.claude-flow/.gitignore',
  ];
  try {
    for (const path of configPaths) {
      if (!existsSync(resolve(DATA_ROOT, path))) continue;
      const reg = regByPath.get(path);
      const f = path.split('/').pop();
      const id = reg?.id || `cfg_${f.replace(/[^a-zA-Z0-9]/g, '_')}`;
      add(id, { id, label: f, type: 'config', tier: reg?.tier ?? 1, layer: 4, path });
    }
  } catch {}

  // ── 5. MCP services from .mcp.json ───────────────────────────
  try {
    const mcp = readJson('.mcp.json');
    if (mcp?.mcpServers) {
      for (const name of Object.keys(mcp.mcpServers)) {
        const id = `svc_${name.replace(/[^a-zA-Z0-9]/g, '_')}`;
        add(id, { id, label: `${name} MCP`, type: 'service', tier: 2, layer: 4,
          detectVia: 'mcp-config', mcpKey: name });
      }
    }
  } catch {}

  // ── 6. Workers from daemon-state.json or VALID_WORKERS fallback ──
  try {
    // Try daemon-state first (has run history)
    const daemonState = readJson('.claude-flow/daemon-state.json')
      || readJson('.claude-flow/data/hooks-daemon-state.json');
    const workerNames = daemonState?.workers
      ? Object.keys(daemonState.workers)
      : ['map','audit','optimize','consolidate','testgaps','preload','ultralearn','deepdive','document','refactor','benchmark','predict','ingest'];
    for (const w of workerNames) {
      const id = `wrk_${w}`;
      if (nodes.has(id)) continue;
      add(id, { id, label: w, type: 'worker', tier: 2, layer: 2,
        logKeys: [w], detectVia: 'daemon-state' });
    }
  } catch {}

  // ── 7. Controllers / backends / utils via symbol-classifier ──
  // Walks the live agentdb_controllers MCP list + source-parses node_modules
  // to classify each symbol as ctrl_*, backend_*, or util_*. Runtime status
  // comes from the controller-status composite cache.
  try {
    const statusMap = getCachedStatusMap();
    const mcpList = Array.from(statusMap.values()).map(e => ({
      name: e.name, enabled: e.enabled, level: e.level,
    }));
    const classifications = classifyAll(mcpList);
    for (const [id, info] of classifications.entries()) {
      if (nodes.has(id)) continue;
      const { nodeType, className, sourceFile, mcpName, enabled, level, phantom } = info;

      if (nodeType === 'ctrl') {
        const meta = CONTROLLER_META[mcpName] || {};
        add(id, {
          id, label: className, type: 'controller',
          tier: 2, layer: 4,
          level: level ?? null,
          mcpName, sourceFile, phantom: !!phantom,
          detectVia: 'classifier',
          description: meta.description || '',
          bugRefs: meta.bugRefs || [],
        });
      } else if (nodeType === 'backend') {
        const meta = BACKEND_META[id] || {};
        // Layer 4 backends are sub-nodes of their parent controller
        add(id, {
          id, label: className, type: 'backend',
          tier: 2, layer: 4,
          className, sourceFile,
          parentMcpName: BACKEND_PARENT[id] || null,
          detectVia: 'classifier',
          description: meta.description || '',
          bugRefs: meta.bugRefs || [],
        });
      } else if (nodeType === 'util') {
        const meta = UTIL_META[id] || {};
        add(id, {
          id, label: className, type: 'util',
          tier: 2, layer: 5,
          className, sourceFile, mcpName: mcpName || null,
          detectVia: 'classifier',
          description: meta.description || '',
          bugRefs: meta.bugRefs || [],
        });
      }
    }
  } catch (err) {
    // Silent — classifier runs best-effort; cache may not be warm yet
  }

  // ── 8. Memory bridge from npm package ──────────────────────
  try {
    const bridgePath = 'node_modules/@claude-flow/cli/dist/src/memory/memory-bridge.js';
    if (existsSync(resolve(DATA_ROOT, bridgePath))) {
      const id = 'eng_memory_bridge';
      if (!nodes.has(id)) {
        add(id, { id, label: 'MemoryBridge', type: 'bridge', tier: 2, layer: 3,
          path: bridgePath, detectVia: 'npm-package' });
      }
    }
  } catch {}

  // ── 9. ONNX model + HNSW (external paths) ─────────────────
  try {
    const onnxDir = resolve(process.env.HOME || '/root', '.ruvector/models');
    if (existsSync(onnxDir)) {
      const id = 'mdl_onnx';
      if (!nodes.has(id)) {
        add(id, { id, label: 'ONNX MiniLM', type: 'model', tier: 3, layer: 5,
          path: onnxDir, detectVia: 'filesystem' });
      }
    }
  } catch {}
  try {
    // In-memory HNSW — phantom, always present if agentdb is installed
    const agentdbPkg = resolve(DATA_ROOT, 'node_modules/agentdb');
    if (existsSync(agentdbPkg)) {
      const id = 'mdl_hnsw';
      if (!nodes.has(id)) {
        add(id, { id, label: 'HNSW index (T2)', type: 'model', tier: 2, layer: 5,
          phantom: true, detectVia: 'npm-package' });
      }
    }
  } catch {}

  // ── 10. Viz self-reference (REMOVED) ────────────────────────
  // Viz infrastructure is an external observer and must not appear
  // in the learning graph. Detection of src/server.js, src/api.js,
  // src/helpers.js has been intentionally disabled.

  // ── 11. (removed — glob-pattern stores now handled by pass 3 glob mode)

  // ── 12. Extra stores: .claude/memory.db, individual files in glob dirs ──
  try {
    const extraStores = [
      { path: '.claude/memory.db', id: 'db_claude_memory', label: 'memory.db (claude)', type: 'store_db', tier: 1 },
    ];
    for (const s of extraStores) {
      if (nodes.has(s.id)) continue;
      if (existsSync(resolve(DATA_ROOT, s.path))) {
        add(s.id, { id: s.id, label: s.label, type: s.type, tier: s.tier, layer: 3, path: s.path });
      }
    }
    // Individual files inside glob dirs are NOT expanded — they're covered by the glob node
  } catch {}

  // ── 12. CLI tools (ruvector binary, SONA/EWC subsystems) ───
  try {
    const ruvBin = resolve(DATA_ROOT, 'node_modules/.bin/ruvector');
    if (existsSync(ruvBin)) {
      if (!nodes.has('eng_cli_tools')) {
        add('eng_cli_tools', { id: 'eng_cli_tools', label: 'ruvector CLI', type: 'engine',
          tier: 2, layer: 2, detectVia: 'npm-package' });
      }
      if (!nodes.has('svc_ruvector')) {
        add('svc_ruvector', { id: 'svc_ruvector', label: 'ruvector (bundled)', type: 'service',
          tier: 3, layer: 4, detectVia: 'npm-package' });
      }
      // SONA and EWC are runtime subsystems inside ruvector
      for (const sub of [
        { id: 'eng_sona_optimizer', label: 'SONA Optimizer' },
        { id: 'eng_ewc_consolidation', label: 'EWC Consolidation' },
      ]) {
        if (!nodes.has(sub.id)) {
          add(sub.id, { id: sub.id, label: sub.label, type: 'engine',
            tier: 3, layer: 3, detectVia: 'npm-package' });
        }
      }
    }
  } catch {}

  // ── 12b. SONA daemon (Process 3) runtime nodes ─────────────
  try {
    const sonaPkg = resolve(DATA_ROOT, 'node_modules/@ruvector/sona/package.json');
    const hasSona = existsSync(sonaPkg);
    // svc_sona_daemon: detected via PID file
    if (!nodes.has('svc_sona_daemon')) {
      const pidExists = existsSync('/tmp/ruvector-runtime.pid');
      if (pidExists || hasSona) {
        add('svc_sona_daemon', { id: 'svc_sona_daemon', label: 'SONA Daemon (P3)', type: 'service',
          tier: 2, layer: 2, detectVia: 'pid-file' });
      }
    }
    // Runtime engines internal to SONA daemon
    if (hasSona) {
      for (const sub of [
        { id: 'eng_sona_engine', label: 'Rust SonaEngine' },
        { id: 'eng_ewc_pp', label: 'EWC++' },
        { id: 'eng_micro_lora', label: 'MicroLoRA' },
        { id: 'eng_reasoning_bank', label: 'ReasoningBank' },
      ]) {
        if (!nodes.has(sub.id)) {
          add(sub.id, { id: sub.id, label: sub.label, type: 'engine',
            tier: 2, layer: 2, detectVia: 'npm-package' });
        }
      }
    }
  } catch {}

  // ── 13. Daemon engines (metrics, swarm monitor) ────────────
  try {
    const daemons = [
      { id: 'eng_metrics_db', label: 'Metrics Daemon', path: '.claude/helpers/metrics-db.mjs' },
      { id: 'eng_swarm_monitor', label: 'Swarm Monitor', path: '.claude/helpers/swarm-monitor.sh' },
    ];
    for (const d of daemons) {
      if (nodes.has(d.id)) continue;
      if (existsSync(resolve(DATA_ROOT, d.path))) {
        add(d.id, { id: d.id, label: d.label, type: 'daemon', tier: 2, layer: 2,
          path: d.path, detectVia: 'filesystem' });
      }
    }
  } catch {}

  // ── FALLBACK: registry nodes not yet discovered ────────────
  // Only for nodes that truly can't be detected any other way.
  const discoveredPaths = new Set([...nodes.values()].filter(n => n.path).map(n => n.path));
  for (const n of registryNodes) {
    if (nodes.has(n.id)) continue;
    if (n.path && discoveredPaths.has(n.path)) continue;
    // Skip nodes whose path falls inside a glob dir (already covered by glob node)
    if (n.path && !n.path.includes('*')) {
      const parentDir = n.path.substring(0, n.path.lastIndexOf('/'));
      if (globDirs.has(parentDir)) continue;
    }
    const { absent, ...clean } = n;
    const checked = scanNodeSignals(clean);
    if (checked.signals.exists) {
      nodes.set(n.id, { ...clean, discovered: false });
    }
  }

  return Array.from(nodes.values());
}
