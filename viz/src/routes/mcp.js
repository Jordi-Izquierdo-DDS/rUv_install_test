// MCP proxy route module — extracted from api.js (2026-04-18).
//
// Route:
//   POST /api/mcp/:server/:tool — execute a whitelisted MCP tool via stdio JSON-RPC
//
// Spawns MCP servers per-config (.mcp.json) and caches the running process
// for reuse. Read-only tool whitelist enforced before dispatch. Pure move —
// no behavior change.

import { spawn } from 'child_process';
import { readJson, getDataRoot } from '../helpers.js';

// Read MCP server configs from .mcp.json
const mcpConfigRaw = readJson('.mcp.json') || { mcpServers: {} };
const MCP_SERVER_CONFIGS = mcpConfigRaw.mcpServers || {};

// Cache running MCP server processes (reuse across requests)
const mcpProcesses = new Map();  // server → { proc, pending, buffer, ready }

function getMcpProcess(serverName) {
  if (mcpProcesses.has(serverName)) {
    const cached = mcpProcesses.get(serverName);
    if (!cached.proc.killed) return Promise.resolve(cached);
    mcpProcesses.delete(serverName);
  }

  const cfg = MCP_SERVER_CONFIGS[serverName];
  if (!cfg) return Promise.reject(new Error(`No MCP config for: ${serverName}`));

  return new Promise((resolve, reject) => {
    const cleanEnv = { ...process.env, ...(cfg.env || {}) };
    delete cleanEnv.CLAUDECODE;

    const proc = spawn(cfg.command, cfg.args || [], {
      cwd: getDataRoot(),
      env: cleanEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const state = { proc, pending: new Map(), buffer: '', ready: false, reqId: 1 };

    proc.stdout.on('data', (chunk) => {
      state.buffer += chunk.toString();
      // MCP uses newline-delimited JSON-RPC
      let nl;
      while ((nl = state.buffer.indexOf('\n')) !== -1) {
        const line = state.buffer.slice(0, nl).trim();
        state.buffer = state.buffer.slice(nl + 1);
        if (!line) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id != null && state.pending.has(msg.id)) {
            const { resolve: res } = state.pending.get(msg.id);
            state.pending.delete(msg.id);
            res(msg);
          }
        } catch { /* skip non-JSON lines */ }
      }
    });

    proc.on('error', (err) => {
      if (!state.ready) reject(err);
    });
    proc.on('exit', () => {
      mcpProcesses.delete(serverName);
      // Reject all pending
      for (const [, { reject: rej }] of state.pending) rej(new Error('MCP process exited'));
      state.pending.clear();
    });

    // Send initialize handshake
    const initId = state.reqId++;
    const initMsg = JSON.stringify({
      jsonrpc: '2.0', id: initId, method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'turboflow-viz', version: '4.0.5' },
      },
    }) + '\n';
    proc.stdin.write(initMsg);

    state.pending.set(initId, {
      resolve: (msg) => {
        // Send initialized notification
        proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        state.ready = true;
        mcpProcesses.set(serverName, state);
        resolve(state);
      },
      reject,
    });

    // Timeout init after 15s
    setTimeout(() => {
      if (!state.ready) {
        proc.kill();
        reject(new Error('MCP server init timeout'));
      }
    }, 15000);
  });
}

function mcpCall(state, method, params) {
  return new Promise((resolve, reject) => {
    const id = state.reqId++;
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
    state.pending.set(id, { resolve, reject });
    state.proc.stdin.write(msg);
    setTimeout(() => {
      if (state.pending.has(id)) {
        state.pending.delete(id);
        reject(new Error('MCP call timeout (30s)'));
      }
    }, 30000);
  });
}

// Read-only tool whitelist — only these tools can be called via the generic proxy
const MCP_SAFE_TOOLS = new Set([
  'system_health', 'system_info', 'system_status', 'system_metrics',
  'agentdb_health', 'agentdb_controllers',
  'hooks_intelligence', 'hooks_intelligence_stats', 'hooks_stats',
  'hooks_model-stats', 'hooks_learning_stats', 'hooks_learning_config',
  'hooks_route', 'hooks_route_enhanced',
  'hooks_recall', 'hooks_suggest_context', 'hooks_rag_context',
  'hooks_diff_analyze', 'hooks_diff_classify', 'hooks_diff_similar',
  'hooks_ast_analyze', 'hooks_ast_complexity',
  'hooks_gnn_info', 'hooks_attention_info',
  'hooks_graph_cluster', 'hooks_graph_mincut',
  'hooks_compress_stats', 'hooks_compress_get',
  'hooks_coverage_route', 'hooks_coverage_suggest',
  'hooks_error_suggest', 'hooks_coedit_suggest',
  'hooks_git_churn', 'hooks_algorithms_list',
  'hooks_watch_status', 'hooks_doctor', 'hooks_verify',
  'hooks_capabilities', 'hooks_export',
  'hooks_swarm_recommend',
  'embeddings_status', 'embeddings_compare',
  'memory_list', 'memory_search', 'memory_stats', 'memory_retrieve',
  'agentdb_pattern-search', 'agentdb_hierarchical-recall',
  'agentdb_context-synthesize', 'agentdb_feedback',
  'neural_status', 'neural_patterns',
  'brain_search', 'brain_list', 'brain_status', 'brain_get',
  'rvf_status', 'rvf_query', 'rvf_segments',
  'rvlite_sql', 'rvlite_sparql', 'rvlite_cypher',
  'decompile_search',
]);

export function registerMcpRoutes(app, _deps = {}) {
  app.post('/api/mcp/:server/:tool', async (req, res) => {
    const { server, tool } = req.params;
    const args = req.body?.args || {};

    if (!MCP_SERVER_CONFIGS[server]) {
      return res.status(400).json({ error: `Unknown MCP server: ${server}. Available: ${Object.keys(MCP_SERVER_CONFIGS).join(', ')}` });
    }

    if (!MCP_SAFE_TOOLS.has(tool)) {
      return res.status(403).json({ error: `Tool '${tool}' not in read-only whitelist. Use action buttons for mutations.` });
    }

    try {
      const state = await getMcpProcess(server);
      const response = await mcpCall(state, 'tools/call', { name: tool, arguments: args });

      if (response.error) {
        return res.status(500).json({ ok: false, server, tool, error: response.error.message || JSON.stringify(response.error) });
      }

      // Extract text content from MCP response
      const result = response.result;
      let output = '';
      if (result?.content) {
        output = result.content.map(c => c.text || JSON.stringify(c)).join('\n');
      } else {
        output = JSON.stringify(result, null, 2);
      }

      res.json({ ok: true, server, tool, output });
    } catch (err) {
      res.status(500).json({ ok: false, server, tool, error: err.message });
    }
  });

  // Clean up MCP processes on exit
  process.on('exit', () => {
    for (const [, state] of mcpProcesses) {
      try { state.proc.kill(); } catch {}
    }
  });
}
