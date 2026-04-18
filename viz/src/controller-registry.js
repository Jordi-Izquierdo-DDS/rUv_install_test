// ═══════════════════════════════════════════════════════════════
// Controller Registry — ADR-053 AgentDB metadata
//
// Pure metadata map. The authoritative list of controllers comes from
// the `agentdb_controllers` MCP tool at runtime (see controller-status.js),
// and classification (ctrl / backend / util) happens in symbol-classifier.js.
//
// This file only provides enrichment — descriptions + bug references —
// keyed by the MCP controller name (camelCase). Discovery does NOT use
// this file to decide what controllers exist.
//
// RULE: READ-ONLY observation of the system.
// ═══════════════════════════════════════════════════════════════

// ── Upstream Bug Catalog (B1-B10) ──────────────────────────────

export const BUG_CATALOG = [
  { id: 'B1', severity: 'critical', title: 'memory-bridge omits embeddingGenerator → zero-vector stubs',
    affects: ['L1','L3','L4','L5','L7'], fixed: true, fixRef: 'RFP-005',
    fixNote: 'Native @ruvector/core provides embeddingGenerator via MCP gateway' },
  { id: 'B2', severity: 'critical', title: 'auto-memory-hook.mjs missing record command (ADR-048 TODO)',
    affects: ['T2'], fixed: true, fixRef: 'RFP-007',
    fixNote: 'RFP-007: record command calls bridgeStoreEntry with ONNX 384D embeddings' },
  { id: 'B3', severity: 'critical', title: 'require(path) in ESM module kills AgentDB init',
    affects: ['T2'], fixed: true, fixRef: 'RFP-002' },
  { id: 'B4', severity: 'medium', title: 'VectorDB/VectorDb casing mismatch in agentdb-fast',
    affects: ['L5'], fixed: true, fixRef: 'RFP-003' },
  { id: 'B5', severity: 'medium', title: 'GNN heads:3 fails 128%3 validation (layers/heads confusion)',
    affects: ['L2'], fixed: true, fixRef: 'RFP-004' },
  { id: 'B6', severity: 'high', title: 'IntelligenceEngine defaults to 256D hash (not 384D ONNX)',
    affects: ['T3'], fixed: true, fixRef: 'RFP-011',
    fixNote: 'Native @ruvector/core ONNX 384D replaces 256D hash default' },
  { id: 'B7', severity: 'medium', title: 'worker-daemon consolidation is a no-op (scaffolding only)',
    affects: ['L4','L5','L6','L7'], fixed: false, fixRef: 'RFP-008' },
  { id: 'B8', severity: 'high', title: 'ReasoningBank constructed without embedder → hash fallback',
    affects: ['L5'], fixed: true, fixRef: 'RFP-006',
    fixNote: 'Native @ruvector/core provides embedder to ReasoningBank constructor' },
  { id: 'B9', severity: 'medium', title: 'storePattern() missing _checkPromotion() call',
    affects: ['L1'], fixed: false, fixRef: 'RFP-009' },
  { id: 'B10', severity: 'high', title: 'ruvector hooks use empty $TOOL_INPUT_* env vars',
    affects: ['T3'], fixed: false, fixRef: null,
    statusNote: 'MCP gateway bypasses env vars for most paths, but raw hook env vars still empty' },
];

export const BUG_BY_ID = Object.fromEntries(BUG_CATALOG.map(b => [b.id, b]));

// ── Controller Levels (ADR-053) ────────────────────────────────

export const CONTROLLER_LEVELS = [
  { level: 1, label: 'Foundation',     controllers: ['reasoningBank','hierarchicalMemory','learningBridge','hybridSearch','tieredCache'] },
  { level: 2, label: 'Graph & Vector', controllers: ['memoryGraph','agentMemoryScope','vectorBackend','mutationGuard','gnnService'] },
  { level: 3, label: 'Skills & Recall', controllers: ['skills','reflexion','explainableRecall','attestationLog','batchOperations','memoryConsolidation'] },
  { level: 4, label: 'Learning & Routing', controllers: ['causalGraph','nightlyLearner','learningSystem','semanticRouter'] },
  { level: 5, label: 'Advanced',       controllers: ['graphTransformer','sonaTrajectory','contextSynthesizer','rvfOptimizer','guardedVectorBackend'] },
  { level: 6, label: 'Federation',     controllers: ['federatedSession','graphAdapter'] },
];

// ── Per-controller metadata (description + bugRefs) ────────────
// Keyed by the MCP name (camelCase). Used for enrichment only —
// DO NOT derive "does this controller exist" from this map.

export const CONTROLLER_META = {
  reasoningBank:      { description: 'L1: RJDC pattern matching + outcome recording.',         bugRefs: ['B1','B8'] },
  hierarchicalMemory: { description: 'L1: working→episodic→semantic tiers.',                   bugRefs: ['B1'] },
  learningBridge:     { description: 'L1: connected via native @ruvector/core MCP gateway.',   bugRefs: [] },
  hybridSearch:       { description: 'L1: BM25 + vector search, ONNX 384D embeddings.',        bugRefs: ['B1'] },
  tieredCache:        { description: 'L1: cache-only, no embeddings needed.',                  bugRefs: [] },

  memoryGraph:        { description: 'L2: PageRank pure math.',                                bugRefs: [] },
  agentMemoryScope:   { description: 'L2: path resolution only.',                              bugRefs: [] },
  vectorBackend:      { description: 'L2: native HNSW backend (VectorDB casing fixed RFP-003).', bugRefs: ['B4'] },
  mutationGuard:      { description: 'L2: proof validation, no embeddings.',                   bugRefs: [] },
  gnnService:         { description: 'L2: native @ruvector/gnn (v0.1.25+) with 8 heads.',      bugRefs: ['B5'] },

  skills:             { description: 'L3: connected via MCP gateway bridge calls.',            bugRefs: [] },
  reflexion:          { description: 'L3: self-reflection during consolidation.',              bugRefs: [] },
  explainableRecall:  { description: 'L3: Merkle provenance certificates.',                    bugRefs: [] },
  attestationLog:     { description: 'L3: auto-fires on mutations.',                           bugRefs: [] },
  batchOperations:    { description: 'L3: batch ops for consolidation pipeline.',              bugRefs: [] },
  memoryConsolidation: { description: 'L3: 6-step CLS pipeline (worker no-op per B7).',        bugRefs: ['B7'] },

  causalGraph:        { description: 'L4: temporal edges between edits.',                      bugRefs: [] },
  nightlyLearner:     { description: 'L4: causal edge discovery + A/B experiments.',           bugRefs: [] },
  learningSystem:     { description: 'L4: 9 RL algorithms via native @ruvector MCP gateway.',  bugRefs: [] },
  semanticRouter:     { description: 'L4: HNSW-based routing (route hook uses keyword fallback).', bugRefs: [] },

  graphTransformer:   { description: 'L5: 8 modules, 3-tier proof.',                           bugRefs: [] },
  sonaTrajectory:     { description: 'L5: begin/step/end lifecycle using native @ruvector/sona.', bugRefs: ['B2'] },
  contextSynthesizer: { description: 'L5: context synthesis for search.',                      bugRefs: [] },
  rvfOptimizer:       { description: 'L5: quantization + dedup.',                              bugRefs: [] },
  guardedVectorBackend: { description: 'L5: Buffer type fixed (RFP-003). Native ONNX embeddings.', bugRefs: ['B4'] },

  federatedSession:   { description: 'L6: null stub — not implemented upstream.',              bugRefs: [] },
  graphAdapter:       { description: 'L6: registry alias for optional graph storage (phantom — has no concrete class).', bugRefs: [] },
};

// Metadata for non-controller nodes the classifier emits
export const BACKEND_META = {
  backend_graph_database_adapter: {
    description: 'L6: Stateful graph database backend (initialize/close lifecycle, private db handle). Used by MemoryGraph controller.',
    bugRefs: [],
  },
};

export const UTIL_META = {
  util_mmr_diversity_ranker: {
    description: 'Static-only MMR diversity re-ranking (no lifecycle, no state). Called by hybridSearch.',
    bugRefs: [],
  },
  util_context_synthesizer: {
    description: 'Static-only context synthesis from multiple memories. Called by hybridSearch and the context-synthesize MCP tool.',
    bugRefs: [],
  },
  util_metadata_filter: {
    description: 'Static-only MongoDB-style metadata filter for episodes and patterns.',
    bugRefs: [],
  },
};
