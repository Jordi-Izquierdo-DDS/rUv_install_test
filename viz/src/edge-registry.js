// ═══════════════════════════════════════════════════════════════
// Edge Registry — v05 QUEUE + INGEST + SESSION STATE UPDATE
// Updated 2026-03-25: hook-queue data flow, ingest worker, session
// state edges, consolidation worker store edges, SONA trajectory queue.
//
// NEW FIELD per edge:
//   origin: which upstream system defines this edge
//           ('ruflo', 'ruvector', 'both', 'turboflow', 'runtime')
//
// Types: fires | calls | reads | writes | uses | configures | loads
// ═══════════════════════════════════════════════════════════════

export const EXPECTED_EDGES = [

  // ══════════════════════════════════════════════════════════════
  // HOOK -> ENGINE EDGES (from settings.json + ruvector hooks)
  // ══════════════════════════════════════════════════════════════

  // ── SessionStart (P14: daemon-manager replaces npx claude-flow) ──
  { sourceId: 'evt_session_start', targetId: 'eng_daemon_manager', type: 'fires', label: 'start 3 daemons (swarm+metrics+hooks)', origin: 'sparkling' },
  { sourceId: 'evt_session_start', targetId: 'eng_auto_memory',    type: 'fires', label: 'import', origin: 'ruflo' },
  // ── SessionEnd ────────────────────────────────────────────────
  { sourceId: 'evt_session_end', targetId: 'eng_hook_handler',     type: 'fires', label: 'session-end + intelligence consolidate', origin: 'ruflo' },

  // ── PostToolUse ─────────────────────────────────────────────
  { sourceId: 'evt_post_tool_use', targetId: 'eng_auto_memory',    type: 'fires', label: 'record (RFP-007)', origin: 'ruflo' },

  // ── PreToolUse ──────────────────────────────────────────────

  // ── UserPromptSubmit ──────────────────────────────────────────

  // ── Stop ──────────────────────────────────────────────────────
  { sourceId: 'evt_stop', targetId: 'eng_auto_memory',             type: 'fires', label: 'sync', origin: 'ruflo' },

  // ── PreCompact ────────────────────────────────────────────────

  // ── SubagentStart/Stop ────────────────────────────────────────

  // ── Notification ──────────────────────────────────────────────

  // ══════════════════════════════════════════════════════════════
  // DAEMON + ENGINE INTERNAL EDGES
  // ══════════════════════════════════════════════════════════════

  // daemon-manager.sh → sub-daemons

  // swarm-monitor → metrics output

  // learning-service.mjs → patterns.db (P18)

  // controllers → memory.db (L3-L7 silo)

  // ══════════════════════════════════════════════════════════════
  // MEMORY-BRIDGE → CONTROLLERS (actual T2 data path, replaces daemon)
  // ══════════════════════════════════════════════════════════════

  // L1 Foundation
  { sourceId: 'eng_memory_bridge', targetId: 'ctrl_learning_bridge',   type: 'calls', label: 'bridgeLearning',          origin: 'ruflo' },
  // L3 Skills & Recall
  // L4 Learning & Routing
  // L5 Advanced
  { sourceId: 'eng_memory_bridge', targetId: 'ctrl_sona_trajectory',   type: 'calls', label: 'bridgeTrajectory',        origin: 'ruflo', bugRefs: ['B2'] },

  // Leaf controllers → db_memory (bridge-called but missing outgoing edges)

  // Controller-to-controller internal dependencies (L1→L2 calls)
  { sourceId: 'ctrl_hybrid_search',     targetId: 'ctrl_vector_backend',    type: 'uses', label: 'vector similarity search', origin: 'sparkleideas-cli' },
  { sourceId: 'ctrl_reasoning_bank',    targetId: 'ctrl_memory_graph',      type: 'uses', label: 'pattern graph ops', origin: 'sparkleideas-cli' },
  { sourceId: 'ctrl_hierarchical_memory',  targetId: 'ctrl_agent_memory_scope', type: 'uses', label: 'agent-scoped paths', origin: 'sparkleideas-cli' },
  { sourceId: 'ctrl_vector_backend',    targetId: 'ctrl_guarded_vector_backend',    type: 'uses', label: 'guarded access layer', origin: 'sparkleideas-cli' },
  { sourceId: 'ctrl_nightly_learner',   targetId: 'ctrl_gnn_service',       type: 'uses', label: 'GNN graph features', origin: 'sparkleideas-cli', bugRefs: ['B5'] },
  { sourceId: 'ctrl_memory_consolidation', targetId: 'ctrl_batch_operations',  type: 'uses', label: 'batch ops for 6-step pipeline', origin: 'sparkleideas-cli' },
  { sourceId: 'ctrl_memory_consolidation', targetId: 'ctrl_reflexion',         type: 'uses', label: 'self-reflection during consolidation', origin: 'sparkleideas-cli' },
  { sourceId: 'ctrl_nightly_learner',   targetId: 'ctrl_skills',            type: 'uses', label: 'skill extraction from sessions', origin: 'sparkleideas-cli' },
  { sourceId: 'ctrl_hybrid_search',     targetId: 'util_context_synthesizer', type: 'uses', label: 'context synthesis (static utility)', origin: 'sparkleideas-cli' },
  { sourceId: 'ctrl_hybrid_search',     targetId: 'util_mmr_diversity_ranker', type: 'uses', label: 'MMR diversity re-ranking (static utility)', origin: 'sparkleideas-cli' },
  { sourceId: 'ctrl_reasoning_bank',    targetId: 'ctrl_graph_transformer', type: 'uses', label: '8-module proof analysis', origin: 'sparkleideas-cli' },
  { sourceId: 'ctrl_memory_graph',      targetId: 'backend_graph_database_adapter', type: 'uses', label: 'stateful graph DB backend', origin: 'sparkleideas-cli' },
  { sourceId: 'ctrl_learning_system',   targetId: 'ctrl_rvf_optimizer',     type: 'uses', label: 'quantization + dedup for RL', origin: 'sparkleideas-cli' },
  { sourceId: 'db_memory',              targetId: 'ctrl_attestation_log',   type: 'fires', label: 'auto-fire on any mutation', origin: 'sparkleideas-cli' },

  // ══════════════════════════════════════════════════════════════
  // SONA LOOPS + RJDC PIPELINE EDGES
  // ══════════════════════════════════════════════════════════════

  // SONA trajectory events (sonaBeginTrajectory/sonaAddStep/sonaEndTrajectory)
  // queued through hook-queue.jsonl — covered by eng_hook_handler→store_hook_queue:writes below

  // ruvector MCP -> memory.graph
  { sourceId: 'svc_ruvector',    targetId: 'bin_memory_graph',    type: 'writes', label: 'redb binary HNSW graph', origin: 'ruvector' },
  { sourceId: 'svc_ruvector',    targetId: 'bin_memory_graph',    type: 'reads',  label: 'graph vector search', origin: 'ruvector' },

  // ══════════════════════════════════════════════════════════════
  // NATIVE @RUVECTOR + MCP GATEWAY EDGES (v103)
  // ══════════════════════════════════════════════════════════════

  // hook-handler → MCP gateway → native packages
  { sourceId: 'eng_hook_handler', targetId: 'mcp_ruvector',       type: 'calls', label: 'MCP tool calls (bypass env vars)', origin: 'ruvector' },
  { sourceId: 'mcp_ruvector',     targetId: 'native_router',      type: 'calls', label: 'semantic route (GNN 8-head)', origin: 'ruvector' },
  { sourceId: 'mcp_ruvector',     targetId: 'native_core',        type: 'calls', label: 'ONNX 384D embeddings', origin: 'ruvector' },
  { sourceId: 'mcp_ruvector',     targetId: 'db_memory',          type: 'writes', label: 'store via native pipeline', origin: 'ruvector' },
  { sourceId: 'mcp_ruvector',     targetId: 'db_memory',          type: 'reads',  label: 'search via native pipeline', origin: 'ruvector' },

  // hook-handler → WASM modules
  { sourceId: 'eng_hook_handler', targetId: 'wasm_lora',          type: 'calls', label: 'MicroLoRA instant adapt', origin: 'ruvector' },
  { sourceId: 'wasm_lora',        targetId: 'ctrl_learning_system', type: 'writes', label: 'LoRA weight deltas → 9-RL state', origin: 'ruvector' },
  { sourceId: 'wasm_lora',        targetId: 'store_patterns_db',  type: 'writes', label: 'adapted patterns', origin: 'ruvector' },

  // WASM attention (ATT-001 L2 deprecated, bridge search preferred)
  { sourceId: 'mcp_ruvector',     targetId: 'wasm_attention',     type: 'calls', label: 'attention scoring (L2 fallback)', origin: 'ruvector' },
  { sourceId: 'wasm_attention',   targetId: 'eng_memory_bridge',  type: 'calls', label: 'attention-weighted context', origin: 'ruvector' },

  // native packages → downstream
  { sourceId: 'native_core',      targetId: 'mdl_onnx',           type: 'uses',  label: 'ONNX MiniLM 384D', origin: 'ruvector' },
  { sourceId: 'native_router',    targetId: 'ctrl_gnn_service',   type: 'uses',  label: 'GNN graph features (8 heads)', origin: 'ruvector' },
  { sourceId: 'native_router',    targetId: 'ctrl_semantic_router', type: 'uses', label: 'HNSW route lookup', origin: 'ruvector' },

  // ══════════════════════════════════════════════════════════════
  // MCP-FIRST v5 EDGES (hook-handler → MCP HTTP daemon → controllers)
  // ══════════════════════════════════════════════════════════════

  // Primary path: hook-handler calls MCP HTTP daemon via callMcp()
  // Fallback path: coldFallback() when MCP daemon is unreachable (!_mcp)
  // Cold fallback → lazy bridge import
  // MCP HTTP daemon → ruvector gateway (internal sub-node)
  { sourceId: 'svc_mcp_http',     targetId: 'mcp_ruvector',       type: 'uses',  label: 'native @ruvector routing (4 fallback levels)', origin: 'ruvector' },

  // MCP HTTP daemon → controllers (warm access via tools/call)
  { sourceId: 'svc_mcp_http', targetId: 'util_context_synthesizer', type: 'uses', label: 'agentdb_context-synthesize (static utility)', origin: 'ruflo' },
  { sourceId: 'svc_mcp_http', targetId: 'ctrl_learning_bridge',   type: 'uses', label: 'agentdb_feedback (bridge)', origin: 'ruflo' },
  { sourceId: 'svc_mcp_http', targetId: 'ctrl_explainable_recall', type: 'uses', label: 'agentdb_context-synthesize', origin: 'ruflo' },

  // ══════════════════════════════════════════════════════════════
  // hook-handler.cjs INTERNAL CALLS (safeRequire)
  // ══════════════════════════════════════════════════════════════

  { sourceId: 'eng_hook_handler', targetId: 'eng_memory_handler', type: 'loads', label: 'safeRequire (loaded but never called)', dormant: true, origin: 'ruflo' },

  // hook-handler.cjs → queue + session state (09_architecture)
  { sourceId: 'eng_hook_handler', targetId: 'store_hook_queue',   type: 'writes', label: 'appendFileSync per-event incl. SONA trajectory events (transient JSONL)', origin: 'ruflo' },

  // ══════════════════════════════════════════════════════════════
  // ENGINE -> STORE EDGES (data flow)
  // ══════════════════════════════════════════════════════════════

  // intelligence.cjs
  { sourceId: 'eng_intelligence',    targetId: 'json_current_session',type: 'reads',  label: 'load session', origin: 'ruflo' },
  { sourceId: 'eng_intelligence',    targetId: 'json_current_session',type: 'writes', label: 'save session', origin: 'ruflo' },

  // intelligence.cjs → SONA learning store (distillLearning: EMA confidence + EWC protection)
  { sourceId: 'eng_intelligence',    targetId: 'json_neural_patterns', type: 'reads',  label: 'distillLearning: load learned patterns', origin: 'ruflo' },
  { sourceId: 'eng_intelligence',    targetId: 'json_neural_patterns', type: 'writes', label: 'distillLearning: EMA confidence update', origin: 'ruflo' },

  // session.js

  // hook-handler.cjs -> DB (P3-2: direct SQL INSERT/UPDATE to sessions table)

  // learning-service.mjs

  // metrics-db.mjs

  // statusline.cjs

  // auto-memory-hook.mjs
  { sourceId: 'eng_auto_memory',     targetId: 'eng_intelligence',   type: 'calls',  label: 'bridge auto-memory to intelligence', deprecated: true, origin: 'ruflo', statusNote: 'Replaced by RFP-007 (direct bridge call)' },

  // memory.js
  // REMOVED: json_memory edges — file never existed

  // ══════════════════════════════════════════════════════════════
  // CONFIG -> TARGET EDGES
  // ══════════════════════════════════════════════════════════════

  // settings.json configures triggers + statusline + daemon

  // .mcp.json configures services
  { sourceId: 'cfg_mcp', targetId: 'svc_ruvector',    type: 'configures', label: 'MCP server', origin: 'ruvector' },

  // config.yaml -> learning-service

  // hook-handler reads settings.json for dispatch config
  { sourceId: 'eng_hook_handler', targetId: 'cfg_settings',       type: 'reads', label: 'hook dispatch config', origin: 'ruflo' },

  // ruvector hooks.json configures ruvector service behavior

  // ══════════════════════════════════════════════════════════════
  // SERVICE -> ENGINE/STORE EDGES (MCP tool paths)
  // ══════════════════════════════════════════════════════════════

  // REMOVED: db_agentdb, db_agentdb_root, db_agentdb_memory edges — AgentDB runs inside memory.db
  { sourceId: 'svc_claude_flow', targetId: 'db_claude_memory',    type: 'reads',  label: 'fallback query', origin: 'ruflo' },


  // ruvector MCP
  { sourceId: 'svc_ruvector', targetId: 'json_intelligence',   type: 'uses',   label: 'hooks_intelligence_stats MCP', origin: 'ruvector' },

  // ══════════════════════════════════════════════════════════════
  // CLI DAEMON -> WORKERS + STORES
  // ══════════════════════════════════════════════════════════════

  { sourceId: 'eng_cli_tools', targetId: 'json_daemon_state', type: 'reads',  label: 'load workers config', origin: 'ruflo' },
  { sourceId: 'eng_cli_tools', targetId: 'json_daemon_state', type: 'writes', label: 'save worker state', origin: 'ruflo' },
  { sourceId: 'eng_cli_tools', targetId: 'json_daemon_log',   type: 'writes', label: 'daemon lifecycle log', origin: 'ruflo' },
  { sourceId: 'eng_cli_tools', targetId: 'json_neural_stats', type: 'writes', label: 'neural stats (on-demand)', origin: 'ruflo' },
  { sourceId: 'eng_cli_tools', targetId: 'json_neural_patterns', type: 'writes', label: 'neural train/import', origin: 'ruflo' },

  // CLI daemon -> scheduled workers (ingest every 10s, consolidate every 30min)
  { sourceId: 'eng_cli_daemon', targetId: 'wrk_ingest',       type: 'calls', label: 'every 10s: drain queue', origin: 'ruflo' },
  { sourceId: 'eng_cli_daemon', targetId: 'wrk_consolidate',  type: 'calls', label: 'every 30min: HNSW + EWC + tiers', origin: 'ruflo' },

  // CLI tools -> workers (on-demand via viz buttons, no scheduling)

  // workers -> stores
  { sourceId: 'wrk_testgaps',    targetId: 'json_daemon_logs',    type: 'writes', label: 'test gap report', origin: 'ruflo' },

  // ingest worker -> queue + bridge (09_architecture)
  { sourceId: 'wrk_ingest',     targetId: 'json_daemon_logs',     type: 'writes', label: 'result log', origin: 'ruflo' },

  // consolidate worker -> stores (09_architecture: HNSW rebuild + tier promotion + EWC + pattern extraction)

  // worker logs
  { sourceId: 'wrk_map',         targetId: 'json_daemon_logs',    type: 'writes', label: 'result log', origin: 'ruflo' },
  { sourceId: 'wrk_audit',       targetId: 'json_daemon_logs',    type: 'writes', label: 'result log', origin: 'ruflo' },
  { sourceId: 'wrk_optimize',    targetId: 'json_daemon_logs',    type: 'writes', label: 'result log', origin: 'ruflo' },
  { sourceId: 'wrk_consolidate', targetId: 'json_daemon_logs',    type: 'writes', label: 'result log', origin: 'ruflo' },
  { sourceId: 'wrk_ultralearn',  targetId: 'json_daemon_logs',    type: 'writes', label: 'result log', origin: 'ruflo' },
  { sourceId: 'wrk_deepdive',    targetId: 'json_daemon_logs',    type: 'writes', label: 'result log', origin: 'ruflo' },
  { sourceId: 'wrk_document',    targetId: 'json_daemon_logs',    type: 'writes', label: 'result log', origin: 'ruflo' },
  { sourceId: 'wrk_refactor',    targetId: 'json_daemon_logs',    type: 'writes', label: 'result log', origin: 'ruflo' },
  { sourceId: 'wrk_benchmark',   targetId: 'json_daemon_logs',    type: 'writes', label: 'result log', origin: 'ruflo' },
  { sourceId: 'wrk_predict',     targetId: 'json_daemon_logs',    type: 'writes', label: 'result log', origin: 'ruflo' },

  // pattern-consolidator → patterns.db (deprecated — session-end now via warm daemon)
  { sourceId: 'scr_pattern_consolidator', targetId: 'store_patterns_db', type: 'writes', label: 'consolidation at session-end (deprecated)', origin: 'turboflow' },

  // ══════════════════════════════════════════════════════════════
  // SHELL SCRIPT CHAINS (entry-point scripts, terminal context)
  // ══════════════════════════════════════════════════════════════

  // Entry-point registrations

  // daemon-manager.sh chains

  // swarm-monitor.sh chains

  // swarm-hooks.sh

  // worker-manager.sh scheduling (DEPRECATED — superseded by Node.js daemon)

  // v3.sh dispatcher (DEPRECATED — V3 dev tooling, not wired)

  // Script -> store edges (deprecated scripts → stores)
  // REMOVED: hook-handler no longer calls pattern-consolidator (L2 layer removed; session-end via agentdb_session-end MCP)

  // ══════════════════════════════════════════════════════════════
  // LEARNING LOOP EDGES (T1 -> T2 -> T3 tiers)
  // ══════════════════════════════════════════════════════════════

  // T2 MemoryBridge (ADR-053 — via MCP tools + hook-handler per-event + auto-memory-hook)

  // RFP-010: hook-handler.cjs → T2 bridge (per-event via fireBridge)
  { sourceId: 'eng_hook_handler',    targetId: 'eng_memory_bridge',    type: 'calls',  label: 'RFP-010: fireBridge per-event (feedback, causal, hierarchical, session, route)', origin: 'ruflo', patchRef: 'RFP-010' },

  // RFP-007+008: auto-memory-hook.mjs → T2 bridge (record + consolidate commands)

  // Learning service -> sub-engines

  // SONA optimizer -> stores (P28: wired in hooks-daemon)
  { sourceId: 'eng_sona_optimizer',    targetId: 'db_memory',                type: 'writes', label: 'SONA routing patterns', origin: 'ruflo' },

  // EWC consolidation (P28: wired in hooks-daemon)
  { sourceId: 'eng_ewc_consolidation', targetId: 'db_memory',                type: 'writes', label: 'Fisher-weighted consolidated patterns', origin: 'ruflo' },

  // Viz learning triggers → engines (via /api/learning/trigger)

  // hook-handler → learning-service (session-end L1 promotion)
  { sourceId: 'eng_hook_handler', targetId: 'eng_learning_service', type: 'calls', label: 'session-end L1 pattern promotion', origin: 'ruflo' },

  // viz_api → viz_helpers edge removed with viz exclusion

  // ══════════════════════════════════════════════════════════════
  // CLI DAEMON EDGES (ruflo daemon — manages workers)
  // ══════════════════════════════════════════════════════════════

  { sourceId: 'eng_cli_daemon',    targetId: 'eng_cli_tools',        type: 'calls',  label: 'manages workers (map, audit, optimize, ...)', origin: 'ruflo' },
  { sourceId: 'eng_cli_daemon',    targetId: 'json_daemon_state',    type: 'writes', label: 'persist worker state', origin: 'ruflo' },

  // ══════════════════════════════════════════════════════════════
  // VIZ SERVER EDGES (REMOVED — viz excluded from learning graph)
  // ══════════════════════════════════════════════════════════════

  // ══════════════════════════════════════════════════════════════
  // DISCONNECTED CONTROLLERS → db_memory (L2-L6)
  // All controllers operate on memory.db via AgentDB ControllerRegistry.
  // L1 controllers already have edges above; these complete the set.
  // ══════════════════════════════════════════════════════════════

  // Level 2: Graph & Vector

  // Level 3: Skills & Recall (disconnected — no bridge callers)

  // Level 5: Advanced

  // Level 6: Federation
  { sourceId: 'ctrl_federated_session', targetId: 'db_memory', type: 'reads',  label: 'federated session (null stub)', origin: 'sparkleideas-cli' },
  // backend_graph_database_adapter reads/writes through its parent (ctrl_memory_graph)
  { sourceId: 'backend_graph_database_adapter', targetId: 'db_memory', type: 'writes', label: 'graph DB adapter writes', origin: 'sparkleideas-cli' },
  { sourceId: 'backend_graph_database_adapter', targetId: 'db_memory', type: 'reads',  label: 'graph DB adapter reads', origin: 'sparkleideas-cli' },

  // ══════════════════════════════════════════════════════════════
  // DISCONNECTED CONFIGS → TARGETS
  // ══════════════════════════════════════════════════════════════

  { sourceId: 'cfg_config_yaml',  targetId: 'eng_cli_daemon',    type: 'configures', label: 'swarm topology, memory backend, hooks', origin: 'ruflo' },
  { sourceId: 'cfg_capabilities', targetId: 'svc_claude_flow',    type: 'configures', label: 'V3 capability manifest', origin: 'ruflo' },
  { sourceId: 'cfg_cf_gitignore', targetId: 'json_daemon_state',   type: 'configures', label: 'excludes runtime data from git', origin: 'ruflo' },

  // ══════════════════════════════════════════════════════════════
  // DISCONNECTED ENGINES + SCRIPTS
  // ══════════════════════════════════════════════════════════════

  // statusline-hook.sh → statusline.cjs

  // github-safe.js — standalone helper available for hook scripts
  { sourceId: 'eng_hook_handler', targetId: 'eng_github_safe', type: 'loads', label: 'available for gh operations', dormant: true, origin: 'ruflo' },

  // Dormant setup scripts — loaded by settings but not wired to hooks
  { sourceId: 'eng_hook_handler', targetId: 'scr_std_checkpoint', type: 'loads', label: 'git checkpoint functions (dormant)', dormant: true, origin: 'ruflo' },

  // ══════════════════════════════════════════════════════════════
  // DISCONNECTED SERVICES (optional MCP servers)
  // ══════════════════════════════════════════════════════════════

  { sourceId: 'cfg_mcp', targetId: 'svc_ruv_swarm',  type: 'configures', label: 'MCP server (optional)', origin: 'ruflo' },
  { sourceId: 'cfg_mcp', targetId: 'svc_flow_nexus',  type: 'configures', label: 'MCP server (optional)', origin: 'ruflo' },

  // ruv-swarm MCP outgoing: swarm coordination, agent metrics, memory
  { sourceId: 'svc_ruv_swarm', targetId: 'db_memory',     type: 'reads',  label: 'swarm state + memory queries', origin: 'ruflo' },
  { sourceId: 'svc_ruv_swarm', targetId: 'db_memory',     type: 'writes', label: 'agent spawn + task results', origin: 'ruflo' },
  { sourceId: 'svc_ruv_swarm', targetId: 'json_metrics',  type: 'writes', label: 'agent + swarm metrics', origin: 'ruflo' },

  // flow-nexus MCP outgoing: cloud platform reads local context
  { sourceId: 'svc_flow_nexus', targetId: 'db_memory',    type: 'reads',  label: 'local context for cloud ops', origin: 'ruflo' },

  // ══════════════════════════════════════════════════════════════
  // DISCONNECTED MODELS + VIZ
  // ══════════════════════════════════════════════════════════════

  // In-memory HNSW (T2) — used by vector controllers
  { sourceId: 'ctrl_hybrid_search',  targetId: 'mdl_hnsw', type: 'uses', label: 'in-memory HNSW (384D cosine)', origin: 'sparkleideas-cli' },
  { sourceId: 'ctrl_vector_backend', targetId: 'mdl_hnsw', type: 'uses', label: 'in-memory HNSW vectors', origin: 'sparkleideas-cli' },

  // HNSW metadata (phantom — in-memory only, no file on disk)
  { sourceId: 'mdl_hnsw', targetId: 'json_hnsw_meta', type: 'writes', label: 'runtime metadata (phantom)', origin: 'sparkleideas-cli' },

  // viz_server → viz_api (Express route registration)
];

// Quick lookup -- keyed by sourceId->targetId:type to avoid collisions
export const EDGE_BY_KEY = Object.fromEntries(
  EXPECTED_EDGES.map(e => [`${e.sourceId}\u2192${e.targetId}:${e.type}`, e])
);

// Fallback lookup: find edge by sourceId->targetId (without type suffix).
export function findEdge(key) {
  if (EDGE_BY_KEY[key]) return EDGE_BY_KEY[key];
  return Object.values(EDGE_BY_KEY).find(e =>
    (e.sourceId + '\u2192' + e.targetId) === key
  );
}

export const EDGE_COUNT = EXPECTED_EDGES.length;
