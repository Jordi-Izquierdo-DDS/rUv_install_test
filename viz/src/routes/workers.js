// Workers route module — extracted from api.js (2026-04-18).
//
// Routes:
//   POST /api/daemon/trigger    — trigger an in-session worker (map, audit, optimize, etc.)
//   POST /api/learning/trigger  — fire a learning-system action (sona/ewc/intelligence/pretrain/…)
//
// Both routes are MCP-first (vizMcpCall injected from api.js) with an
// in-process (workers) or cold-bridge (learning) fallback. Pure move — no
// business logic change.

import { existsSync, readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';

import {
  readJson, resolvePath, getDataRoot, globFiles,
} from '../helpers.js';

const require = createRequire(import.meta.url);

// ─── 4b. POST /api/daemon/trigger — Trigger a CLI daemon worker ──
// Replaces old pattern-consolidator.sh / learning-optimizer.sh shell script calls.
// Uses the live CLI daemon: npx @claude-flow/cli daemon trigger --worker <type>
// deps: { vizMcpCall } — MCP-first dispatch, in-process runner fallback.
export function registerDaemonTrigger(app, deps = {}) {
  const vizMcpCall = deps.vizMcpCall || (async () => { throw new Error('vizMcpCall not wired'); });

  const VALID_WORKERS = new Set(['map', 'audit', 'optimize', 'consolidate', 'testgaps', 'preload', 'ultralearn', 'deepdive', 'document', 'refactor', 'benchmark', 'predict']);

  // ALL workers run in-process — no CLI daemon, no API key, session-only.
  // map + consolidate use local scripts. Others use lightweight analysis.
  // (IN_PROCESS_WORKERS kept as alias for future differentiation.)
  // eslint-disable-next-line no-unused-vars
  const IN_PROCESS_WORKERS = VALID_WORKERS; // everything runs in-process

  // In-session workers — use ruvector CLI tools (local binary, no API key).
  // Each worker calls the real analysis tool and returns structured results.
  const rvBin = join(getDataRoot(), 'node_modules', '.bin', 'ruvector');

  // Helper: run ruvector CLI and parse JSON output
  function runRv(args, timeout = 10_000) {
    try {
      const out = execSync(`"${rvBin}" ${args}`, {
        timeout, encoding: 'utf8', cwd: getDataRoot(),
        env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null' },
      });
      // Find JSON in output (may have non-JSON preamble)
      const jsonStart = out.indexOf('{');
      if (jsonStart >= 0) return JSON.parse(out.slice(jsonStart));
      const arrStart = out.indexOf('[');
      if (arrStart >= 0) return JSON.parse(out.slice(arrStart));
      return { raw: out.trim() };
    } catch (e) {
      return { error: e.message?.slice(0, 200), raw: e.stdout?.trim()?.slice(0, 500) };
    }
  }

  const IN_PROCESS_RUNNERS = {
    map: async () => {
      // Real codebase scan: AST analyze all helpers + src files
      const helpers = [...globFiles('.claude/helpers', '*.cjs'), ...globFiles('.claude/helpers', '*.mjs'), ...globFiles('.claude/helpers', '*.sh'), ...globFiles('.claude/helpers', '*.js')];
      const srcFiles = [...globFiles('src', '*.js'), ...globFiles('src', '*.ts'), ...globFiles('src', '*.mjs')];
      const allFiles = [...helpers, ...srcFiles].slice(0, 30); // cap at 30
      const analyses = [];
      for (const f of allFiles) {
        const result = runRv(`hooks ast-analyze ${f} --json`, 5000);
        if (result.success) {
          analyses.push({
            file: f, functions: result.functions, classes: result.classes,
            complexity: result.complexity?.cyclomatic, lines: result.complexity?.lines,
            imports: (result.imports || []).length,
          });
        }
      }
      analyses.sort((a, b) => (b.complexity || 0) - (a.complexity || 0));
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        filesAnalyzed: analyses.length, totalFiles: helpers.length + srcFiles.length,
        topComplexity: analyses.slice(0, 10),
        totalFunctions: analyses.reduce((s, a) => s + (a.functions || 0), 0),
        totalImports: analyses.reduce((s, a) => s + (a.imports || 0), 0),
      };
    },

    audit: async () => {
      // Real security scan: check files for unsafe patterns + exposed secrets
      const issues = [];
      // .env check
      if (existsSync(resolvePath('.env'))) issues.push({ severity: 'HIGH', file: '.env', issue: '.env file exists — may contain secrets' });
      // Check all helpers for hardcoded secrets patterns
      const helpers = globFiles('.claude/helpers', '*.{cjs,mjs,js}');
      for (const f of helpers) {
        try {
          const content = readFileSync(resolvePath(f), 'utf8');
          if (/api[_-]?key\s*[:=]\s*['"][^'"]{10,}/i.test(content))
            issues.push({ severity: 'HIGH', file: f, issue: 'Possible hardcoded API key' });
          if (/password\s*[:=]\s*['"][^'"]+/i.test(content))
            issues.push({ severity: 'HIGH', file: f, issue: 'Possible hardcoded password' });
          if (/eval\s*\(/.test(content))
            issues.push({ severity: 'MEDIUM', file: f, issue: 'eval() usage — potential code injection' });
          if (/child_process.*exec\(/.test(content) && !/execSync|execFile/.test(content))
            issues.push({ severity: 'MEDIUM', file: f, issue: 'exec() with dynamic input — potential command injection' });
        } catch {}
      }
      // Check settings.json permissions
      const settings = readJson('.claude/settings.json');
      const denyCount = settings?.permissions?.deny?.length || 0;
      const allowCount = settings?.permissions?.allow?.length || 0;
      // Verify hook
      const verify = runRv('hooks verify', 5000);
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        issues: issues.length, findings: issues,
        permissions: { allow: allowCount, deny: denyCount },
        hookVerification: verify.raw || verify,
      };
    },

    optimize: async () => {
      // Optimization analysis: MoE routing + pipeline health + learning stats via MCP
      const daemonState = readJson('.claude-flow/data/hooks-daemon-state.json') || {};
      let intel = {};
      try { intel = await vizMcpCall('hooks_intelligence_stats') || {}; } catch {}
      const routingDecisions = intel.moe?.routingDecisions || 0;
      const successRate = intel.sona?.successRate || 0;
      const patternsLearned = intel.sona?.patternsLearned || 0;
      const learningStats = runRv('hooks learning-stats', 5000);
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        routing: { decisions: routingDecisions, successRate, patternsLearned, moeConfidence: (intel.moe?.avgConfidence || 0).toFixed(3) },
        pipeline: {
          processed: daemonState.totalProcessed || 0, t2: daemonState.totalT2Written || 0,
          t3: daemonState.totalT3Updates || 0, ops: daemonState.totalPipelineOps || 0,
          consolidations: daemonState.totalConsolidations || 0, l1: daemonState.totalL1Stored || 0,
        },
        learningAlgorithms: learningStats,
        recommendations: [
          successRate < 0.55 ? 'Success rate is low — more session activity will improve routing' : null,
          (daemonState.totalConsolidations || 0) < 3 ? 'Few consolidation cycles — consider running Consolidate' : null,
          patternsLearned < 20 ? 'Few patterns learned — run Pretrain to seed more patterns' : null,
        ].filter(Boolean),
      };
    },

    consolidate: async () => {
      // Signal hooks-daemon + wait + return actual results
      const pidFile = resolvePath('.claude-flow/pids/hooks-daemon.pid');
      const stateBefore = readJson('.claude-flow/data/hooks-daemon-state.json') || {};
      let signalled = false;
      if (pidFile && existsSync(pidFile)) {
        try {
          const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
          process.kill(pid, 'SIGUSR1');
          signalled = true;
        } catch {}
      }
      // Wait for daemon to process
      if (signalled) await new Promise(r => setTimeout(r, 2000));
      const stateAfter = readJson('.claude-flow/data/hooks-daemon-state.json') || {};
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        daemonSignalled: signalled,
        before: { consolidations: stateBefore.totalConsolidations || 0, ops: stateBefore.totalPipelineOps || 0 },
        after: { consolidations: stateAfter.totalConsolidations || 0, ops: stateAfter.totalPipelineOps || 0 },
        delta: {
          consolidations: (stateAfter.totalConsolidations || 0) - (stateBefore.totalConsolidations || 0),
          ops: (stateAfter.totalPipelineOps || 0) - (stateBefore.totalPipelineOps || 0),
        },
      };
    },

    testgaps: async () => {
      // Real analysis: AST scan src files, compare exports vs test coverage
      const srcFiles = [...globFiles('src', '*.js'), ...globFiles('src', '*.ts'), ...globFiles('src', '*.mjs')];
      const testFiles = [...globFiles('tests', '*.test.js'), ...globFiles('tests', '*.spec.js'), ...globFiles('tests', '*.test.ts'), ...globFiles('tests', '*.test.mjs')];
      const untestedFiles = [];
      for (const f of srcFiles) {
        const base = f.replace(/\.(js|ts|mjs)$/, '');
        const hasTest = testFiles.some(t => t.includes(base.split('/').pop()));
        if (!hasTest) untestedFiles.push(f);
      }
      // AST analyze untested files to get function counts
      const untestedDetail = [];
      for (const f of untestedFiles.slice(0, 10)) {
        const ast = runRv(`hooks ast-analyze ${f} --json`, 3000);
        if (ast.success) {
          untestedDetail.push({ file: f, functions: ast.functions, complexity: ast.complexity?.cyclomatic });
        }
      }
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        srcFiles: srcFiles.length, testFiles: testFiles.length,
        ratio: srcFiles.length > 0 ? (testFiles.length / srcFiles.length * 100).toFixed(0) + '%' : 'N/A',
        untestedFiles: untestedFiles.length,
        topUntested: untestedDetail,
      };
    },

    predict: async () => {
      // Routing prediction: MoE expert distribution via MCP
      let intel = {};
      try { intel = await vizMcpCall('hooks_intelligence_stats') || {}; } catch {}
      const routeCache = readJson('.claude-flow/data/route-cache.json') || {};
      const expertUsage = intel.moe?.loadBalance?.expertUsage || {};
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        routingDecisions: intel.moe?.routingDecisions || 0,
        agentDistribution: expertUsage,
        lastRoute: routeCache,
        moeConfidence: intel.moe?.avgConfidence || 0,
      };
    },

    preload: async () => {
      // Check what's actually warm
      const daemonState = readJson('.claude-flow/data/hooks-daemon-state.json') || {};
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        onnxWarm: !!daemonState.bridgeReady,
        bridgeWarm: !!daemonState.bridgeReady,
        intelligenceWarm: !!daemonState.intelligenceReady,
        learningServiceWarm: !!daemonState.learningServiceReady,
        allWarm: !!(daemonState.bridgeReady && daemonState.intelligenceReady && daemonState.learningServiceReady),
      };
    },

    ultralearn: async () => {
      // Full learning system report across ALL tiers
      const root = getDataRoot();
      let intel = {};
      try { intel = await vizMcpCall('hooks_intelligence_stats') || {}; } catch {}
      const daemonState = readJson('.claude-flow/data/hooks-daemon-state.json') || {};
      const autoMem = readJson('.claude-flow/data/auto-memory-store.json');
      let patternsDb = { short: 0, long: 0, topLong: [] };
      try {
        const Database = require('better-sqlite3');
        const dbPath = join(root, '.claude-flow', 'learning', 'patterns.db');
        if (existsSync(dbPath)) {
          const db = new Database(dbPath, { readonly: true });
          try { patternsDb.short = db.prepare('SELECT count(*) as c FROM short_term_patterns').get()?.c || 0; } catch {}
          try { patternsDb.long = db.prepare('SELECT count(*) as c FROM long_term_patterns').get()?.c || 0; } catch {}
          try { patternsDb.topLong = db.prepare('SELECT strategy, domain, usage_count, quality FROM long_term_patterns ORDER BY quality DESC LIMIT 5').all(); } catch {}
          db.close();
        }
      } catch {}
      const learningStats = runRv('hooks learning-stats', 5000);
      const confs = Array.isArray(autoMem) ? autoMem.map(e => e.metadata?.confidence || 0) : [];
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        t1: {
          autoMemory: Array.isArray(autoMem) ? autoMem.length : 0,
          above07: confs.filter(c => c >= 0.7).length,
          meanConfidence: confs.length > 0 ? (confs.reduce((a, b) => a + b, 0) / confs.length).toFixed(3) : 'N/A',
        },
        t2: { written: daemonState.totalT2Written || 0, pipelineOps: daemonState.totalPipelineOps || 0, consolidations: daemonState.totalConsolidations || 0 },
        t3: { patternsLearned: intel.sona?.patternsLearned || 0, routingDecisions: intel.moe?.routingDecisions || 0, successRate: intel.sona?.successRate || 0 },
        l1: { short: patternsDb.short, long: patternsDb.long, topPromoted: patternsDb.topLong },
        learning: learningStats,
        daemon: { processed: daemonState.totalProcessed || 0, cycles: daemonState.cycles || 0 },
      };
    },

    deepdive: async () => {
      // Real AST complexity analysis via ruvector
      const helpers = globFiles('.claude/helpers', '*.{cjs,mjs,js}');
      const srcFiles = [...globFiles('src', '*.js'), ...globFiles('src', '*.ts'), ...globFiles('src', '*.mjs')];
      const allFiles = [...helpers, ...srcFiles];
      // Run AST complexity on all files
      const complexity = runRv(`hooks ast-complexity ${allFiles.slice(0, 20).join(' ')}`, 15000);
      // Also analyze individual files for import chains
      const importMap = {};
      for (const f of allFiles.slice(0, 15)) {
        const ast = runRv(`hooks ast-analyze ${f} --json`, 3000);
        if (ast.success && ast.imports) {
          importMap[f] = ast.imports.map(i => i.source);
        }
      }
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        filesAnalyzed: allFiles.length,
        complexity: complexity.results || complexity,
        importGraph: importMap,
        highComplexity: (complexity.results || []).filter(r => r.warning).map(r => ({
          file: r.file, cyclomatic: r.cyclomatic, lines: r.lines, functions: r.functions,
        })),
      };
    },

    refactor: async () => {
      // Real refactoring analysis: duplicates + .js/.cjs + complexity hotspots
      const helpers = [...globFiles('.claude/helpers', '*.cjs'), ...globFiles('.claude/helpers', '*.mjs'), ...globFiles('.claude/helpers', '*.sh'), ...globFiles('.claude/helpers', '*.js')];
      // Old .js with .cjs counterparts (can clean up)
      const jsFiles = helpers.filter(f => f.endsWith('.js') && !f.endsWith('.cjs') && !f.endsWith('.mjs'));
      const cjsCounterparts = jsFiles.filter(f => helpers.includes(f.replace('.js', '.cjs')));
      // Size duplicates
      const sizeMap = {};
      for (const f of helpers) {
        try {
          const fullPath = resolvePath(f);
          if (fullPath && existsSync(fullPath)) {
            const size = statSync(fullPath).size;
            if (!sizeMap[size]) sizeMap[size] = [];
            sizeMap[size].push(f);
          }
        } catch {}
      }
      const potentialDupes = Object.entries(sizeMap).filter(([, v]) => v.length > 1).map(([size, files]) => ({ sizeBytes: parseInt(size), files }));
      // High complexity files that need splitting
      const complexity = runRv(`hooks ast-complexity ${helpers.filter(f => f.endsWith('.mjs') || f.endsWith('.cjs')).slice(0, 10).join(' ')}`, 10000);
      const needsSplitting = (complexity.results || []).filter(r => r.cyclomatic > 100).map(r => ({
        file: r.file, cyclomatic: r.cyclomatic, functions: r.functions,
        recommendation: `${r.cyclomatic} cyclomatic complexity — consider splitting into smaller modules`,
      }));
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        totalHelpers: helpers.length,
        oldJsWithCjs: cjsCounterparts.length > 0 ? { count: cjsCounterparts.length, files: cjsCounterparts, action: 'Delete .js files — .cjs versions are active' } : null,
        potentialDuplicates: potentialDupes.length > 0 ? potentialDupes : null,
        highComplexity: needsSplitting.length > 0 ? needsSplitting : null,
        recommendations: [
          cjsCounterparts.length > 0 ? `Remove ${cjsCounterparts.length} old .js files (have .cjs counterparts)` : null,
          potentialDupes.length > 0 ? `${potentialDupes.length} potential duplicate file groups detected` : null,
          needsSplitting.length > 0 ? `${needsSplitting.length} files with >100 cyclomatic complexity need splitting` : null,
        ].filter(Boolean),
      };
    },
    benchmark: async () => {
      const mem = process.memoryUsage();
      const cpu = process.cpuUsage();
      const benchmarkFile = resolvePath('.claude-flow/metrics/benchmark.json');
      const result = {
        timestamp: new Date().toISOString(), mode: 'local',
        benchmarks: {
          memoryUsage: mem, cpuUsage: cpu, uptime: process.uptime(),
          heapMB: (mem.heapUsed / 1048576).toFixed(1),
          rssMB: (mem.rss / 1048576).toFixed(1),
        },
      };
      try { writeFileSync(benchmarkFile, JSON.stringify(result, null, 2)); } catch {}
      return result;
    },

    document: async () => {
      // Documentation analysis: check which files have JSDoc, exports, and descriptions
      const helpers = [...globFiles('.claude/helpers', '*.cjs'), ...globFiles('.claude/helpers', '*.mjs'), ...globFiles('.claude/helpers', '*.js')];
      const srcFiles = [...globFiles('src', '*.js'), ...globFiles('src', '*.ts'), ...globFiles('src', '*.mjs')];
      const docs = [...globFiles('docs', '*.md'), ...globFiles('docs/01-install+fixes', '*.md')];
      const undocumented = [];
      for (const f of [...helpers, ...srcFiles].slice(0, 30)) {
        try {
          const content = readFileSync(resolvePath(f), 'utf8');
          const hasJsdoc = /\/\*\*[\s\S]*?\*\//.test(content);
          const lineCount = content.split('\n').length;
          if (!hasJsdoc && lineCount > 50) {
            undocumented.push({ file: f, lines: lineCount });
          }
        } catch {}
      }
      undocumented.sort((a, b) => b.lines - a.lines);
      return {
        timestamp: new Date().toISOString(), mode: 'in-session',
        sourceFiles: helpers.length + srcFiles.length,
        docFiles: docs.length,
        undocumented: undocumented.length,
        topUndocumented: undocumented.slice(0, 10),
      };
    },
  };

  app.post('/api/daemon/trigger', async (req, res) => {
    const worker = req.body?.worker;
    if (!worker || !VALID_WORKERS.has(worker)) {
      return res.status(400).json({ error: `Invalid worker. Must be one of: ${[...VALID_WORKERS].join(', ')}` });
    }

    // Helper: persist result/error to daemon-state.json
    function persistResult(output, error) {
      try {
        const ds = readJson('.claude-flow/daemon-state.json') || { workers: {} };
        if (!ds.workers) ds.workers = {};
        if (!ds.workers[worker]) ds.workers[worker] = { runCount: 0, successCount: 0, failureCount: 0, averageDurationMs: 0, isRunning: false };
        ds.workers[worker].lastTriggeredAt = new Date().toISOString();
        ds.workers[worker].runCount = (ds.workers[worker].runCount || 0) + 1;
        if (error) { ds.workers[worker].failureCount = (ds.workers[worker].failureCount || 0) + 1; ds.workers[worker].lastError = error; }
        else { ds.workers[worker].successCount = (ds.workers[worker].successCount || 0) + 1; ds.workers[worker].lastResult = output; ds.workers[worker].lastError = null; }
        writeFileSync(resolvePath('.claude-flow/daemon-state.json'), JSON.stringify(ds, null, 2));
      } catch { /* non-critical */ }
    }

    // MCP-first routing: try MCP HTTP daemon, fall back to in-process runner
    // (preload stays in-process — no MCP equivalent, just checks warm state)
    if (worker !== 'preload') {
      try {
        const result = await vizMcpCall('hooks_worker-dispatch', { worker });
        const output = JSON.stringify(result, null, 2);
        persistResult(output, null);
        return res.json({ ok: true, worker, via: 'mcp', output });
      } catch { /* MCP unavailable — fall through to in-process */ }
    }

    // In-process fallback
    const runner = IN_PROCESS_RUNNERS[worker];
    if (runner) {
      try {
        const result = await runner();
        const output = JSON.stringify(result, null, 2);
        persistResult(output, null);
        res.json({ ok: true, worker, via: 'in-process', output });
      } catch (e) {
        persistResult(null, e.message);
        res.status(500).json({ error: e.message, worker });
      }
    } else {
      res.status(400).json({ error: 'Worker not available', worker });
    }
  });
}

// ─── 4c. POST /api/learning/trigger — Force-fire learning system actions ──
// Routes through MCP HTTP daemon when available; cold bridge as fallback.
// deps: { vizMcpCall, getBridge } — both injected from api.js.
export function registerLearningTrigger(app, deps = {}) {
  const vizMcpCall = deps.vizMcpCall || (async () => { throw new Error('vizMcpCall not wired'); });
  const getBridge = deps.getBridge || (async () => ({}));

  const LEARNING_ACTIONS = new Set([
    'sona',           // Fire SONA trajectory processing (same as post-task)
    'ewc',            // Fire EWC++ consolidation (same as session-end)
    'intelligence',   // Run intelligence.consolidate() + feedback()
    'pretrain',       // Run neural train -p coordination
    'promote',        // Promote eligible short-term patterns to long-term
    'full-cycle',     // All of the above in sequence
    'layer-L1', 'layer-L2', 'layer-L3', 'layer-L4', 'layer-L5', 'layer-L6', 'layer-L7',
    'all-layers',
  ]);

  app.post('/api/learning/trigger', async (req, res) => {
    const action = req.body?.action;
    if (!action || !LEARNING_ACTIONS.has(action)) {
      return res.status(400).json({ error: `Invalid action. Must be one of: ${[...LEARNING_ACTIONS].join(', ')}` });
    }

    const results = [];
    const root = getDataRoot();

    try {
      // readIntelData removed — .ruvector/intelligence.json no longer written; use vizMcpCall('hooks_intelligence_stats')

      // Helper: run intelligence.cjs (T1 graph — fast, <200ms)
      const runIntelligence = (method) => {
        const intFile = join(root, '.claude', 'helpers', 'intelligence.cjs');
        const output = execSync(
          `node -e "const i=require('${intFile.replace(/'/g, "\\'")}');const r=i.${method}?i.${method}():null;console.log(JSON.stringify(r||{}))"`,
          { timeout: 10_000, encoding: 'utf8', cwd: root }
        );
        return output.trim();
      };

      // ── MCP-first with cold bridge fallback ──────────────────
      // Each action tries MCP HTTP daemon first; falls back to bridge on failure.

      async function mcpOrBridge(step, mcpTool, mcpArgs, bridgeFn) {
        try {
          const result = await vizMcpCall(mcpTool, mcpArgs || {});
          results.push({ step, ok: true, via: 'mcp', output: JSON.stringify(result).slice(0, 500) });
        } catch (mcpErr) {
          // MCP failed — fall back to cold bridge
          try {
            const bridge = await getBridge();
            const fn = bridge[bridgeFn];
            if (typeof fn === 'function') {
              const result = await fn();
              results.push({ step, ok: true, via: 'bridge-fallback', output: JSON.stringify(result).slice(0, 500) });
            } else {
              results.push({ step, ok: false, error: `MCP: ${mcpErr.message}. Bridge: ${bridgeFn} not found` });
            }
          } catch (bridgeErr) {
            results.push({ step, ok: false, error: `MCP: ${mcpErr.message}. Bridge: ${bridgeErr.message}` });
          }
        }
      }

      // Full-cycle order: Seed → Learn → Protect → Consolidate → Promote
      if (action === 'pretrain' || action === 'full-cycle') {
        await mcpOrBridge('pretrain', 'hooks_pretrain', {}, 'bridgePatternPromote');
      }

      if (action === 'sona' || action === 'full-cycle') {
        await mcpOrBridge('sona', 'hooks_intelligence_learn', {}, 'bridgePatternPromote');
        // Neural adaptation pipeline (embeddings_neural)
        try {
          const adapt = await vizMcpCall('embeddings_neural', { action: 'adapt' });
          results.push({ step: 'neural-adapt', ok: true, via: 'mcp', output: JSON.stringify(adapt).slice(0, 500) });
        } catch (e) {
          results.push({ step: 'neural-adapt', ok: false, error: e.message });
        }
        try {
          const cons = await vizMcpCall('embeddings_neural', { action: 'consolidate' });
          results.push({ step: 'neural-consolidate', ok: true, via: 'mcp', output: JSON.stringify(cons).slice(0, 500) });
        } catch (e) {
          results.push({ step: 'neural-consolidate', ok: false, error: e.message });
        }
      }

      if (action === 'ewc' || action === 'full-cycle') {
        await mcpOrBridge('ewc', 'agentdb_consolidate', {}, 'bridgeEWCConsolidate');
      }

      if (action === 'intelligence' || action === 'full-cycle') {
        // Intelligence: T1 graph — fast, local, no MCP needed
        try {
          const fb = runIntelligence('feedback');
          const cons = runIntelligence('consolidate');
          results.push({ step: 'intelligence', ok: true, via: 'local', output: JSON.stringify({ feedback: fb, consolidate: cons }) });
        } catch (e) {
          results.push({ step: 'intelligence', ok: false, error: e.message });
        }
      }

      if (action === 'promote' || action === 'full-cycle') {
        await mcpOrBridge('promote', 'agentdb_consolidate', {}, 'bridgePromotionSweep');
      }

      // ── Layer-specific actions ──
      const layerMcpMap = {
        'layer-L1': { mcp: 'agentdb_consolidate', bridge: 'bridgePatternPromote' },
        'layer-L2': { mcp: 'agentdb_consolidate', bridge: 'bridgeSQLConsolidate' },
        'layer-L3': { mcp: 'agentdb_consolidate', bridge: 'bridgePromotionSweep' },
        'layer-L4': { mcp: 'agentdb_consolidate', bridge: 'bridgeConsolidationSweep' },
        'layer-L5': { mcp: 'agentdb_consolidate', bridge: 'bridgeReasoningStore' },
        'layer-L6': { mcp: 'agentdb_consolidate', bridge: 'bridgeEWCConsolidate' },
        'layer-L7': { mcp: 'agentdb_consolidate', bridge: 'bridgeSkillExtract' },
      };

      if (action.startsWith('layer-') && layerMcpMap[action]) {
        const { mcp, bridge } = layerMcpMap[action];
        await mcpOrBridge(action, mcp, { layer: action.replace('layer-', '') }, bridge);
      }

      if (action === 'all-layers') {
        for (const [layer, { mcp, bridge }] of Object.entries(layerMcpMap)) {
          await mcpOrBridge(layer, mcp, { layer: layer.replace('layer-', '') }, bridge);
        }
      }

      // ── Full-cycle: run all 7 layers at the end ──
      if (action === 'full-cycle') {
        for (const [layer, { mcp, bridge }] of Object.entries(layerMcpMap)) {
          await mcpOrBridge(layer, mcp, { layer: layer.replace('layer-', '') }, bridge);
        }
      }

      const allOk = results.every(r => r.ok);
      res.json({ ok: allOk, action, results, timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(500).json({ error: err.message, action, results });
    }
  });
}

// ─── Orchestrator ───────────────────────────────────────────────
export function registerWorkerRoutes(app, deps = {}) {
  registerDaemonTrigger(app, deps);
  registerLearningTrigger(app, deps);
}
