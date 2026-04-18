# Next Session: Update Viz + Validate Learning System

**Project:** `/mnt/data/dev/RFV3_v5_test`
**Goal:** Update the viz/monitoring dashboard from v4 to v5 architecture, AND validate the self-learning system works by doing real coding work that generates trajectories.

---

## Context

This project has a self-learning self-improving hook system installed (ruflo v5). Every action you take (Edit, Bash, Read, etc.) generates trajectories that the system learns from. The viz dashboard at `viz/` shows the learning state but is built for v4 architecture — it needs updating.

### What's installed (v5 architecture)
- **8 services:** SonaEngine, VerdictAnalyzer (ruvllm NAPI), SemanticRouter, TensorCompress, AdaptiveEmbedder, IntelligenceEngine, NeuralSubstrate, SQLiteBackend
- **Learning cycle:** CAPTURE → RETRIEVE → ROUTE → EXECUTE → JUDGE → LEARN → PERSIST (7 nodes)
- **Data locations:**
  - `.claude-flow/sona/state.json` — SonaEngine patterns (modelRoute + avgQuality)
  - `.claude-flow/reasoning-bank/patterns.json` — ruvllm ReasoningBank (VerdictAnalysis)
  - `.swarm/memory.db` — SQLite C4 episodic memory
  - `.agentic-flow/intelligence.json` — upstream pretrain Q-learning graph
  - `.claude-flow/data/daemon.log` — daemon events
  - `.claude-flow/metrics/session-latest.json` — session metrics
- **Daemon:** `.claude/helpers/ruvector-daemon.mjs` (735L) — IPC on `.claude-flow/ruvector-daemon.sock`
- **Handler:** `.claude/helpers/hook-handler.cjs` (300L) — parses Claude Code hook events

### What viz currently shows (v4 — needs updating)
The viz dashboard at `viz/` was built for v4 which had:
- Different node/edge model (v4 phases vs v5's 7-node cycle)
- No SemanticRouter, no VerdictAnalyzer, no TensorCompress
- Different data locations and formats

---

## Tasks (in order)

### 1. Read and understand the current viz
- Read `viz/src/` — understand the data model, API, and rendering
- Read `viz/public/` — understand the dashboard UI
- Identify what's hardcoded for v4 vs what's data-driven

### 2. Update viz data sources to v5
The viz API (`viz/src/api.js`) needs to read from v5 data locations:
- **Sona patterns:** read `.claude-flow/sona/state.json` → parse patterns with modelRoute + avgQuality
- **ReasoningBank:** read `.claude-flow/reasoning-bank/patterns.json` → VerdictAnalysis data
- **SQLite memory:** query `.swarm/memory.db` → trajectory entries
- **Daemon log:** parse `.claude-flow/data/daemon.log` → events timeline
- **Session metrics:** read `.claude-flow/metrics/session-latest.json`
- **Intelligence graph:** read `.agentic-flow/intelligence.json` → Q-learning state from pretrain

### 3. Update viz nodes/edges to v5 cycle
The v5 learning cycle has 7 nodes (foxref §3.4 aligned):
1. CAPTURE (beginTrajectory) — @ruvector/sona NAPI
2. RETRIEVE (findPatterns → boost/penalize) — @ruvector/sona NAPI
3. ROUTE (SemanticRouter 8/10) — ruvector · @ruvector/router
4. EXECUTE (agent works, steps tracked) — hook-handler.cjs
5. JUDGE (VerdictAnalyzer) — @ruvector/ruvllm-native
6. LEARN (3 loops: MicroLoRA/BaseLoRA/EWC++) — @ruvector/sona NAPI
7. PERSIST (5 layers) — @claude-flow/memory + ruvector

Plus: REFINE (deferred, ADR-004) as a dashed/grey gap node.

The viz should show this cycle with quality % per node and data flowing through edges.

### 4. Add Venn center metrics
Show in the center of the cycle:
- **Quality:** embedding dimension, ONNX density
- **Coverage:** phases wired (15/15), services count
- **Persistence:** layers count, cross-session status

### 5. Add degradation chain view
Show the graceful degradation levels:
- Full stack → -rbank → -sona → -SR → -ONNX → -daemon
- Each level: what works, what breaks, routing quality

### 6. Test the learning system while doing this work
As you do the viz updates (editing files, running commands, testing), the hook system is running. After completing the viz work:
- Check daemon log for trajectories recorded
- Check sona patterns — did they update?
- Check [INTELLIGENCE] output — does it show useful modelRoute info?
- Run the viz dashboard and verify it shows real data from this session

### 7. E2E validation
After viz is updated:
- Start the viz server (`cd viz && npm start` or similar)
- Take a screenshot of the dashboard showing real learning data
- Compare session-start patterns vs session-end patterns — did the system learn from the viz work?

---

## Important notes

- **Protocol 2:** Before architecture decisions, research: foxref → pi-brain → gitnexus → catalog → source
- **Don't invent:** Use upstream components. If a feature exists in @ruvector/*, use it.
- **Brutal honesty:** If something doesn't work, report it honestly. Don't hide degradation.
- **LOC cap:** The daemon+handler total must stay under 1200 LOC. Viz has no cap but keep it clean.
- **Visual summary:** The reference diagram is at `_doc/visual-summary_v5.html` — the cycle diagram there is what viz should represent dynamically.

---

## Success criteria

1. Viz dashboard renders the v5 7-node learning cycle with live data
2. Viz shows real sona patterns, rbank verdicts, and SQLite entries from this session
3. The learning system generated trajectories from the viz update work
4. Session-end sona state is larger than session-start (learning happened)
5. Everything committed and pushed to https://github.com/Jordi-Izquierdo-DDS/rUv_install_test
