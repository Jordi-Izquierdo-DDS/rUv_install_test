const TYPE_COLORS = {
  trigger: "#f59e0b",
  script: "#3b82f6",
  engine: "#8b5cf6",
  store_db: "#10b981",
  store_json: "#14b8a6",
  config: "#6b7280",
  model: "#eab308",
  service: "#06b6d4"
};
let currentNodeId = null;
function closeSidePanel() {
  document.getElementById("side-panel").classList.remove("open");
}
async function openSidePanel(node) {
  const panel = document.getElementById("side-panel");
  const title = document.getElementById("sp-title");
  const body = document.getElementById("sp-body");
  currentNodeId = node.id;
  title.innerHTML = `<span style="color:${TYPE_COLORS[node.type] || "#fff"}">${node.label}</span>`;
  body.innerHTML = '<div style="color:var(--text-dim)">Loading...</div>';
  panel.classList.add("open");
  try {
    const [res] = await Promise.all([
      fetch(`/api/node/${node.id}`),
      getFallbackStatus(),
    ]);
    const data = await res.json();
    body.innerHTML = renderDetail(data.node, data.detail);
    requestAnimationFrame(() => {
      attachActionHandlers();
      attachMcpHandlers();
    });
  } catch (err) {
    body.innerHTML = `<div style="color:var(--color-missing)">Failed to load: ${err}</div>`;
  }
}
window.__expandTable = async function(row, tableName) {
  const detailEl = row.nextElementSibling;
  if (!detailEl) return;
  if (detailEl.style.display !== "none") {
    detailEl.style.display = "none";
    row.querySelector(".tbl-arrow").textContent = "\u25B6";
    return;
  }
  row.querySelector(".tbl-arrow").textContent = "\u25BC";
  detailEl.style.display = "block";
  detailEl.innerHTML = '<div style="color:var(--text-dim);padding:4px 8px">Loading...</div>';
  try {
    const res = await fetch(`/api/node/${currentNodeId}?table=${encodeURIComponent(tableName)}`);
    const data = await res.json();
    const d = data.detail;
    let html = "";
    if (d.schema?.length) {
      html += '<div style="font-weight:600;margin:4px 0">Schema</div>';
      html += '<table class="data"><tr><th>Column</th><th>Type</th></tr>';
      for (const col of d.schema) {
        html += `<tr><td>${col.name}</td><td>${col.type || "any"}</td></tr>`;
      }
      html += "</table>";
    }
    if (d.preview?.length) {
      html += `<div style="font-weight:600;margin:8px 0 4px">Last ${d.preview.length} rows</div>`;
      html += '<pre class="code">' + escapeHtml(JSON.stringify(d.preview, null, 2).slice(0, 2e4)) + "</pre>";
    } else {
      html += '<div style="color:var(--text-dim)">Table is empty</div>';
    }
    detailEl.innerHTML = html;
  } catch (err) {
    detailEl.innerHTML = `<div style="color:var(--color-missing)">Failed to load: ${err}</div>`;
  }
};
document.getElementById("sp-close")?.addEventListener("click", closeSidePanel);
const LEARNING_ACTIONS = {
  eng_sona_optimizer: { action: "sona", label: "Run SONA (signal daemon)" },
  eng_ewc_consolidation: { action: "ewc", label: "Run EWC + Consolidate" },
  eng_intelligence: { action: "intelligence", label: "Consolidate Intelligence (T1)" },
  eng_learning_service: { action: "promote", label: "Promote Patterns (L1+bridge)" },
  eng_hooks_daemon: { action: "full-cycle", label: "Full Learning Cycle" },
  eng_memory_bridge: { action: "promote", label: "Bridge Consolidation (7-layer)" },
  ctrl_mem_consolidation: { action: "promote", label: "Consolidate (6-step pipeline)" },
  ctrl_reasoning_bank: { action: "promote", label: "ReasoningBank Consolidate" },
  ctrl_nightly_learner: { action: "ewc", label: "NightlyLearner Consolidate" },
  eng_cli_tools: { action: "pretrain", label: "Pretrain (local binary)" }
};
const DAEMON_PROCESSES = {
  eng_hooks_daemon: { daemon: "hooks-daemon", label: "Hooks Daemon (ONNX + bridge + 7-layer)" },
  eng_metrics_db: { daemon: "metrics-daemon", label: "Metrics Daemon (SQLite sync)" },
  eng_swarm_monitor: { daemon: "swarm-monitor", label: "Swarm Monitor (process detection)" },
  eng_daemon_manager: { daemon: "all", label: "All 3 Daemons" }
};
const DAEMON_WORKERS = {
  wrk_map: { worker: "map", label: "Run Codebase Map" },
  wrk_audit: { worker: "audit", label: "Run Security Audit" },
  wrk_optimize: { worker: "optimize", label: "Run Optimization" },
  wrk_consolidate: { worker: "consolidate", label: "Run Consolidation" },
  wrk_testgaps: { worker: "testgaps", label: "Run Test Gaps" },
  wrk_ultralearn: { worker: "ultralearn", label: "Run Ultra Learn" },
  wrk_deepdive: { worker: "deepdive", label: "Run Deep Dive" },
  wrk_document: { worker: "document", label: "Run Auto-Document" },
  wrk_refactor: { worker: "refactor", label: "Run Refactor" },
  wrk_benchmark: { worker: "benchmark", label: "Run Benchmark" },
  wrk_preload: { worker: "preload", label: "Run Preload" },
  wrk_predict: { worker: "predict", label: "Run Predict" }
};
function renderActions(nodeId) {
  let html = "";
  const learning = LEARNING_ACTIONS[nodeId];
  if (learning) {
    html += `
      <div class="side-panel-actions" style="margin-top:12px;padding-top:12px;border-top:1px solid #333">
        <button class="action-btn" data-action="${learning.action}" style="
          width:100%;padding:8px 12px;border:none;border-radius:6px;
          background:#8b5cf6;color:#fff;font-size:13px;font-weight:600;
          cursor:pointer;transition:opacity .15s
        ">${learning.label}</button>
      </div>`;
  }
  const proc = DAEMON_PROCESSES[nodeId];
  if (proc) {
    const isAll = proc.daemon === "all";
    html += `
      <div class="side-panel-actions" style="margin-top:${html ? "8" : "12"}px;padding-top:${html ? "8" : "12"}px;border-top:1px solid #333">
        <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${proc.label}</div>
        <div style="display:flex;gap:6px">
          <button class="action-btn daemon-control" data-daemon="${isAll ? "all" : proc.daemon}" data-ctrl-action="start" style="
            flex:1;padding:6px 10px;border:none;border-radius:5px;
            background:#10b981;color:#fff;font-size:11px;font-weight:600;
            cursor:pointer
          ">&#9654; Start</button>
          <button class="action-btn daemon-control" data-daemon="${isAll ? "all" : proc.daemon}" data-ctrl-action="stop" style="
            flex:1;padding:6px 10px;border:none;border-radius:5px;
            background:#ef4444;color:#fff;font-size:11px;font-weight:600;
            cursor:pointer
          ">&#9632; Stop</button>
          <button class="action-btn daemon-control" data-daemon="${isAll ? "all" : proc.daemon}" data-ctrl-action="restart" style="
            flex:1;padding:6px 10px;border:none;border-radius:5px;
            background:#f59e0b;color:#fff;font-size:11px;font-weight:600;
            cursor:pointer
          ">&#8635; Restart</button>
        </div>
      </div>`;
  }
  const daemon = DAEMON_WORKERS[nodeId];
  if (daemon) {
    html += `
      <div class="side-panel-actions" style="margin-top:${html ? "8" : "12"}px;padding-top:${html ? "8" : "12"}px;border-top:1px solid #333">
        <button class="action-btn daemon-trigger" data-worker="${daemon.worker}" style="
          width:100%;padding:8px 12px;border:none;border-radius:6px;
          background:#60a5fa;color:#fff;font-size:13px;font-weight:600;
          cursor:pointer;transition:opacity .15s
        ">${daemon.label}</button>
      </div>`;
  }
  return html;
}
function attachActionHandlers() {
  document.querySelectorAll(".side-panel-actions .action-btn[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const action = btn.dataset.action;
      if (!action) return;
      const origLabel = btn.textContent || "";
      btn.disabled = true;
      btn.textContent = "Running...";
      btn.style.opacity = "0.7";
      try {
        const res = await fetch("/api/learning/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        btn.textContent = "Done";
        btn.style.background = "#10b981";
        const resultsDiv = btn.parentElement?.querySelector(".trigger-results") || document.createElement("div");
        resultsDiv.className = "trigger-results";
        resultsDiv.style.cssText = "margin:8px 0;padding:8px;background:rgba(0,0,0,0.3);border-radius:6px;font-size:12px;color:var(--text-dim);max-height:200px;overflow-y:auto";
        let html = "";
        if (data.results) {
          for (const r of data.results) {
            const icon = r.ok ? '<span style="color:#10b981">&#10003;</span>' : '<span style="color:#ef4444">&#10007;</span>';
            html += `<div style="margin:4px 0">${icon} <b>${r.step}</b>: ${escapeHtml(r.output || r.error || "")}</div>`;
            if (r.topPatterns?.length) {
              html += '<table class="data" style="margin:4px 0 4px 16px;font-size:11px"><tr><th>Pattern</th><th>Conf</th><th>Wins</th></tr>';
              for (const p of r.topPatterns) {
                html += `<tr><td>${escapeHtml(p.name)}</td><td>${typeof p.confidence === "number" ? (p.confidence * 100).toFixed(0) + "%" : "\u2014"}</td><td>${p.successCount}</td></tr>`;
              }
              html += "</table>";
            }
          }
        }
        resultsDiv.innerHTML = html;
        if (!btn.parentElement?.querySelector(".trigger-results")) {
          btn.parentElement?.appendChild(resultsDiv);
        }
      } catch {
        btn.textContent = "Failed";
        btn.style.background = "#ef4444";
      }
      setTimeout(() => {
        btn.textContent = origLabel;
        btn.style.background = "#8b5cf6";
        btn.style.opacity = "1";
        btn.disabled = false;
      }, 5e3);
    });
  });
  document.querySelectorAll(".side-panel-actions .daemon-trigger[data-worker]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const worker = btn.dataset.worker;
      if (!worker) return;
      const origLabel = btn.textContent || "";
      btn.disabled = true;
      btn.textContent = "Running...";
      btn.style.opacity = "0.7";
      const actionsDiv = btn.closest(".side-panel-actions");
      let outputEl = actionsDiv.querySelector(".daemon-output");
      if (!outputEl) {
        outputEl = document.createElement("div");
        outputEl.className = "daemon-output";
        outputEl.style.cssText = "margin-top:8px;max-height:250px;overflow:auto;font-size:11px";
        actionsDiv.appendChild(outputEl);
      }
      outputEl.innerHTML = '<div style="color:#94a3b8">Running worker...</div>';
      try {
        const res = await fetch("/api/daemon/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ worker })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        btn.textContent = "Done";
        btn.style.background = "#10b981";
        let outputHtml = "";
        if (data.output) {
          let formatted;
          try {
            const parsed = JSON.parse(data.output);
            formatted = escapeHtml(JSON.stringify(parsed, null, 2));
          } catch {
            formatted = escapeHtml(data.output);
          }
          outputHtml = `<div style="font-weight:600;margin-bottom:4px;color:#10b981">Output</div>
            <pre class="code" style="max-height:200px;overflow:auto;font-size:11px">${formatted}</pre>`;
        }
        outputEl.innerHTML = outputHtml;
      } catch (e) {
        btn.textContent = "Failed";
        btn.style.background = "#ef4444";
        outputEl.innerHTML = `<div style="color:#ef4444;font-size:11px">${escapeHtml(e.message || "Unknown error")}</div>`;
      }
      setTimeout(() => {
        btn.textContent = origLabel;
        btn.style.background = "#0ea5e9";
        btn.style.opacity = "1";
        btn.disabled = false;
      }, 3e3);
    });
  });
  document.querySelectorAll(".side-panel-actions .daemon-control").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const daemon = btn.dataset.daemon;
      const action = btn.dataset.ctrlAction;
      if (!daemon || !action) return;
      const origLabel = btn.textContent || "";
      const origBg = btn.style.background;
      btn.disabled = true;
      btn.textContent = action === "start" ? "Starting..." : action === "stop" ? "Stopping..." : "Restarting...";
      btn.style.opacity = "0.7";
      try {
        if (daemon === "all") {
          const res = await fetch("/api/daemon/control", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ daemon: "hooks-daemon", action })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed");
        } else {
          const res = await fetch("/api/daemon/control", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ daemon, action })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed");
        }
        btn.textContent = "\u2713 Done";
      } catch (e) {
        btn.textContent = "\u2717 " + (e.message || "Failed");
      }
      setTimeout(() => {
        btn.textContent = origLabel;
        btn.style.background = origBg;
        btn.style.opacity = "1";
        btn.disabled = false;
      }, 3e3);
    });
  });
}
function nodeStatus(node) {
  const s = node.signals || {};
  if (node.deprecated) return { status: "DEPRECATED", hint: "Intentionally removed from the system", color: "#4b5563" };
  if (node.meta?.phantom && !s.exists) return { status: "PHANTOM", hint: "Optional \u2014 not installed in this configuration", color: "#6b7280" };
  if (node.meta?.dormant && !s.exists) return { status: "DORMANT", hint: "Configured but not scheduled by the daemon", color: "#22D3EE" };
  if (!s.exists) return { status: "MISSING", hint: "Should exist but file not found", color: "#ef4444" };
  if (!s.healthy) return { status: "DEGRADED", hint: "Exists but not fully healthy", color: "#fbbf24" };
  if (s.active) return { status: "ACTIVE", hint: "Running and recently used", color: "#22c55e" };
  return { status: "IDLE", hint: "Ready, waiting to be used", color: "#22D3EE" };
}
function renderDetail(node, detail) {
  const s = node.signals || { exists: false, healthy: false, active: false };
  const info = nodeStatus(node);
  const isAbsent = node.deprecated || node.meta?.phantom && !s.exists || node.meta?.dormant && !s.exists;
  const sig = (v, label) => isAbsent ? `<span style="color:${info.color}">\u2014</span> ${label}` : v ? `<span style="color:var(--color-found)">&#10003;</span> ${label}` : `<span style="color:var(--color-missing)">&#10007;</span> ${label}`;
  let html = `
    <div style="margin-bottom:12px">
      <div><b>Type:</b> ${node.type} \xB7 <b>Tier:</b> ${node.meta.tier}${node.meta.archTier ? ` \xB7 <span style="color:#a78bfa"><b>${node.meta.archTier}</b></span>` : ""}</div>
      ${node.meta.patchRef ? `<div><b>Patch:</b> ${node.meta.patchRef}</div>` : ""}
      ${node.meta.description ? `<div style="color:var(--text-dim);margin-top:4px">${node.meta.description}</div>` : ""}
    </div>
    <div style="margin-bottom:12px">
      <div style="font-weight:600;margin-bottom:4px">Status: <span style="color:${info.color}">${info.status}</span></div>
      <div>${sig(s.exists, "exists")} \xB7 ${sig(s.healthy, "healthy")} \xB7 ${sig(s.active, "active")}</div>
      <div style="color:${info.color};font-size:11px;margin-top:2px">${info.hint}</div>
    </div>
    ${node.meta.statusNote ? `
    <div style="margin-bottom:12px;padding:8px 10px;border-radius:6px;background:#78350f33;border:1px solid #92400e55">
      <div style="font-weight:600;margin-bottom:4px;color:#fbbf24">Status Note</div>
      <div style="color:#fde68a;font-size:12px;line-height:1.4">${node.meta.statusNote}</div>
    </div>` : ""}
  `;
  if (node.meta.path) {
    html += `<div style="margin-bottom:8px;color:var(--text-dim);font-size:11px;word-break:break-all">${node.meta.path}</div>`;
  }
  switch (node.type) {
    case "store_db":
      html += renderStoreDb(detail);
      break;
    case "store_json":
      html += renderStoreJson(detail);
      break;
    case "trigger":
      html += renderTrigger(detail);
      break;
    case "script":
    case "engine":
      html += renderScriptEngine(detail);
      html += renderFallbackDetail(node.id || node.meta?.id);
      if (detail.sonaDetail) html += renderSonaDetail(detail.sonaDetail);
      if (detail.ewcDetail) html += renderEwcDetail(detail.ewcDetail);
      break;
    case "config":
      html += renderConfig(detail);
      break;
    case "service":
      html += renderService(detail);
      break;
    case "model":
      html += renderModel(detail);
      html += renderFallbackDetail(node.id || node.meta?.id);
      break;
    case "controller":
      html += renderController(node, detail);
      break;
  }
  if (node.type === "engine" || node.type === "script" || node.type === "controller") {
    html += renderActions(node.id);
  }
  if (node.type === "service") {
    html += renderMcpTools(node.id);
  }
  return html;
}
function renderStoreDb(detail) {
  if (detail.ruvectorStats) {
    const rv = detail.ruvectorStats;
    let html = `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
      <div style="font-weight:600;margin-bottom:8px;color:#10b981">RuVector Store (redb)</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px">
        <div>Format: <b>${rv.format}</b></div>
        <div>Entries: <b>${rv.entryCount}</b></div>
        <div>Memory nodes: <b>${rv.graphNodes}</b></div>
        <div>Causal edges: <b>${rv.graphEdges}</b></div>
        ${rv.sessionCount ? `<div>Sessions: <b>${rv.sessionCount}</b></div>` : ""}
      </div>
    </div>`;
    if (rv.embeddingsConfig?.model) {
      html += `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
        <div style="font-weight:600;margin-bottom:4px;color:#eab308">Embeddings</div>
        <div style="font-size:12px">Model: <b>${rv.embeddingsConfig.model}</b> \xB7 Dim: <b>${rv.embeddingsConfig.dimension}</b></div>
        ${rv.embeddingsConfig.initialized ? `<div style="font-size:11px;color:var(--text-dim)">Initialized: ${new Date(rv.embeddingsConfig.initialized).toLocaleString()}</div>` : ""}
      </div>`;
    }
    if (rv.confidenceDistribution && Object.keys(rv.confidenceDistribution).length) {
      const cd = rv.confidenceDistribution;
      html += `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
        <div style="font-weight:600;margin-bottom:4px;color:#8b5cf6">Confidence Distribution</div>
        <div style="display:flex;gap:12px;font-size:12px">
          ${cd.high ? `<div><span style="color:#22c55e">&#9679;</span> High: <b>${cd.high}</b></div>` : ""}
          ${cd.medium ? `<div><span style="color:#f59e0b">&#9679;</span> Medium: <b>${cd.medium}</b></div>` : ""}
          ${cd.low ? `<div><span style="color:#ef4444">&#9679;</span> Low: <b>${cd.low}</b></div>` : ""}
        </div>
      </div>`;
    }
    if (rv.topPatterns?.length) {
      html += `<div style="font-weight:600;margin-bottom:4px">Top Patterns</div>`;
      html += '<table class="data"><tr><th>Pattern</th><th>Conf</th><th>Hits</th></tr>';
      for (const p of rv.topPatterns) {
        const conf = typeof p.confidence === "number" ? (p.confidence * 100).toFixed(0) + "%" : "\u2014";
        html += `<tr><td>${escapeHtml(p.name)}</td><td>${conf}</td><td>${p.accessCount || 0}</td></tr>`;
      }
      html += "</table>";
    }
    return html;
  }
  if (detail.schema) {
    let html = `<div style="font-weight:600;margin-bottom:4px">Schema (${detail.rowCount} rows)</div>`;
    html += '<table class="data" style="margin-bottom:12px"><tr><th>Column</th><th>Type</th></tr>';
    for (const col of detail.schema) {
      html += `<tr><td>${col.name}</td><td>${col.type || "any"}</td></tr>`;
    }
    html += "</table>";
    if (detail.preview?.length) {
      html += '<div style="font-weight:600;margin-bottom:4px">Preview (last rows)</div>';
      html += '<pre class="code">' + escapeHtml(JSON.stringify(detail.preview, null, 2).slice(0, 3e3)) + "</pre>";
    }
    return html;
  }
  if (detail.tables?.length) {
    const withData = detail.tables.filter((t) => t.rowCount > 0).length;
    let html = `<div style="font-weight:600;margin-bottom:4px">Tables (${withData}/${detail.tables.length})</div>`;
    for (const t of detail.tables) {
      const safeName = escapeHtml(t.name);
      html += `<div class="db-table-row" data-table="${safeName}" style="cursor:pointer;padding:6px 8px;border-radius:4px;margin-bottom:2px;display:flex;justify-content:space-between;align-items:center;border:1px solid #ffffff10" onmouseover="this.style.background='#ffffff10'" onmouseout="this.style.background=''">
        <span><span class="tbl-arrow">\u25B6</span> ${safeName}</span>
        <span style="color:var(--text-dim)">${t.rowCount} rows</span>
      </div>
      <div style="display:none;margin:0 0 8px 8px;padding-left:8px;border-left:2px solid #ffffff15"></div>`;
    }
    requestAnimationFrame(() => {
      document.querySelectorAll(".db-table-row[data-table]").forEach((row) => {
        row.addEventListener("click", () => {
          window.__expandTable(row, row.dataset.table);
        });
      });
    });
    return html;
  }
  return "<div>Database not accessible</div>";
}
function renderStoreJson(detail) {
  if (detail.files) {
    return `<div style="font-weight:600;margin-bottom:4px">Files (${detail.fileCount})</div>` + detail.files.slice(0, 20).map((f) => `<div style="color:var(--text-dim)">${f}</div>`).join("");
  }
  if (detail.preview) {
    return `<div style="font-weight:600;margin-bottom:4px">Content (${detail.entryCount} entries)</div><pre class="code">${escapeHtml(detail.preview.slice(0, 5e3))}</pre>`;
  }
  return "<div>File not found or empty</div>";
}
function renderTrigger(detail) {
  let html = "";
  if (detail.hookConfig) {
    html += `<div style="font-weight:600;margin-bottom:4px">Hook Config (${detail.eventName})</div>`;
    html += `<pre class="code">${escapeHtml(JSON.stringify(detail.hookConfig, null, 2))}</pre>`;
  }
  if (detail.outgoingEdges?.length) {
    html += `<div style="font-weight:600;margin:12px 0 4px">Outgoing Edges (${detail.outgoingEdges.length})</div>`;
    for (const e of detail.outgoingEdges) {
      html += `<div>\u2192 ${e.target} <span style="color:var(--text-dim)">(${e.type}: ${e.label})</span></div>`;
    }
  }
  return html;
}
function renderScriptEngine(detail) {
  let html = "";
  if (detail.workerState) {
    const ws = detail.workerState;
    if (ws.notStarted) {
      html += `<div style="margin-bottom:12px;padding:8px 10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
        <div style="font-weight:600;margin-bottom:4px;color:#94a3b8">Worker: ${ws.worker}</div>
        <div style="color:#64748b">Daemon has not scheduled this worker yet</div>
      </div>`;
    } else {
      const successRate = ws.runCount > 0 ? Math.round(ws.successCount / ws.runCount * 100) : 0;
      const rateColor = successRate >= 80 ? "#10b981" : successRate >= 50 ? "#f59e0b" : "#ef4444";
      const statusBadge = ws.isRunning ? '<span style="color:#f59e0b;font-weight:600">RUNNING</span>' : '<span style="color:#10b981">idle</span>';
      html += `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
        <div style="font-weight:600;margin-bottom:8px;color:#e2e8f0">Worker: ${ws.worker} \xB7 ${statusBadge}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px">
          <div>Runs: <b>${ws.runCount}</b></div>
          <div>Success: <span style="color:${rateColor}"><b>${successRate}%</b></span> (${ws.successCount}/${ws.runCount})</div>
          <div>Failures: <b style="color:${ws.failureCount ? "#ef4444" : "inherit"}">${ws.failureCount}</b></div>
          <div>Avg: <b>${ws.averageDurationMs ? ws.averageDurationMs.toFixed(0) + "ms" : "\u2014"}</b></div>
          ${ws.lastRun ? `<div>Last run: <span style="color:var(--text-dim)">${new Date(ws.lastRun).toLocaleString()}</span></div>` : ""}
          ${ws.nextRun ? `<div>Next run: <span style="color:var(--text-dim)">${new Date(ws.nextRun).toLocaleString()}</span></div>` : ""}
        </div>
      </div>`;
      if (ws.lastResult) {
        let resultBody;
        try {
          const parsed = typeof ws.lastResult === "string" ? JSON.parse(ws.lastResult) : ws.lastResult;
          resultBody = escapeHtml(JSON.stringify(parsed, null, 2).slice(0, 3e3));
        } catch {
          resultBody = escapeHtml(String(ws.lastResult).slice(0, 3e3));
        }
        html += `<div style="margin-bottom:12px">
          <div style="font-weight:600;margin-bottom:4px;color:#10b981">Last Result</div>
          <pre class="code" style="max-height:200px;overflow:auto">${resultBody}</pre>
        </div>`;
      }
      if (ws.lastError) {
        html += `<div style="margin-bottom:12px">
          <div style="font-weight:600;margin-bottom:4px;color:#ef4444">Last Error</div>
          <pre class="code" style="color:#fca5a5;max-height:120px;overflow:auto">${escapeHtml(String(ws.lastError).slice(0, 1500))}</pre>
        </div>`;
      }
    }
  }
  if (detail.lineCount) {
    html += `<div style="margin-bottom:8px"><b>${detail.lineCount}</b> lines \xB7 <b>${(detail.fileSize / 1024).toFixed(1)}</b> KB</div>`;
  }
  if (detail.preview) {
    html += `<div style="font-weight:600;margin-bottom:4px">Preview (first 50 lines)</div>`;
    html += `<pre class="code">${escapeHtml(detail.preview)}</pre>`;
  }
  if (detail.incomingEdges?.length) {
    html += `<div style="font-weight:600;margin:12px 0 4px">Incoming (${detail.incomingEdges.length})</div>`;
    for (const e of detail.incomingEdges) {
      html += `<div>\u2190 ${e.source} <span style="color:var(--text-dim)">(${e.type})</span></div>`;
    }
  }
  if (detail.outgoingEdges?.length) {
    html += `<div style="font-weight:600;margin:12px 0 4px">Outgoing (${detail.outgoingEdges.length})</div>`;
    for (const e of detail.outgoingEdges) {
      html += `<div>\u2192 ${e.target} <span style="color:var(--text-dim)">(${e.type})</span></div>`;
    }
  }
  return html;
}
function renderConfig(detail) {
  let html = "";
  if (detail.hookEvents) html += `<div><b>${detail.hookEvents}</b> hook events \xB7 <b>${detail.hookCount}</b> total hooks</div>`;
  if (detail.mcpServers) html += `<div>MCP Servers: ${detail.mcpServers.join(", ")}</div>`;
  if (detail.parsed) {
    html += `<div style="font-weight:600;margin:12px 0 4px">Content</div>`;
    html += `<pre class="code">${escapeHtml(JSON.stringify(detail.parsed, null, 2).slice(0, 5e3))}</pre>`;
  }
  return html;
}
function renderService(detail) {
  let html = "";
  if (detail.serverConfig) {
    html += `<div style="font-weight:600;margin-bottom:4px">MCP Server Config</div><pre class="code">${escapeHtml(JSON.stringify(detail.serverConfig, null, 2))}</pre>`;
  } else {
    html += "<div>No server config found</div>";
  }
  return html;
}
function fmtSize(bytes) {
  if (!bytes || bytes === 0) return "\u2014";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}
function renderFallbackChain(detail) {
  if (!detail.fallbackChain) return "";
  const activeLevel = detail.activeLevel ?? 4;
  const levelColors = { 1: "#22c55e", 2: "#3b82f6", 3: "#f59e0b", 4: "#ef4444" };
  const levelLabels = { 1: "Optimal", 2: "Good", 3: "Heavy", 4: "Degraded" };
  let html = `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
    <div style="font-weight:600;margin-bottom:8px;color:#eab308">Model Resolution Chain</div>
    <div style="font-size:11px;color:#94a3b8;margin-bottom:8px">Active level: <span style="color:${levelColors[activeLevel]};font-weight:700">L${activeLevel}</span> ${levelLabels[activeLevel]}</div>`;
  for (const entry of detail.fallbackChain) {
    const isActive = entry.level === activeLevel;
    const color = entry.exists ? (isActive ? levelColors[entry.level] : "#6b7280") : "#ef4444";
    const icon = !entry.exists ? "\u2717" : isActive ? "\u25C6" : "\u2713";
    const badge = isActive ? `<span style="color:${color};font-weight:700;font-size:10px;margin-left:6px;padding:1px 5px;border:1px solid ${color};border-radius:3px">ACTIVE</span>` : "";
    const sizeStr = entry.size ? ` \xB7 ${fmtSize(entry.size)}` : "";
    const typeTag = entry.type === "quantized" ? '<span style="color:#8b5cf6;font-size:10px"> quantized</span>'
      : entry.type === "unquantized" ? '<span style="color:#f59e0b;font-size:10px"> full</span>'
      : entry.type === "hash-fallback" ? '<span style="color:#ef4444;font-size:10px"> no model</span>' : "";
    html += `<div style="padding:4px 0;${isActive ? "background:rgba(255,255,255,0.03);margin:0 -4px;padding:4px" : ""}">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="color:${color};font-weight:700;font-size:13px;min-width:22px">L${entry.level}</span>
        <span style="color:${color}">${icon}</span>
        <span style="font-size:12px;${isActive ? "color:#e2e8f0;font-weight:600" : "color:#94a3b8"}">${entry.label}${typeTag}${sizeStr}</span>
        ${badge}
      </div>
      ${entry.path ? `<div style="font-size:10px;color:#64748b;margin-left:28px;word-break:break-all">${entry.path}</div>` : ""}
    </div>`;
  }
  html += `</div>`;
  return html;
}
function renderModel(detail) {
  let html = "";
  if (detail.hnswStats) {
    const h = detail.hnswStats;
    html += `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
      <div style="font-weight:600;margin-bottom:8px;color:#eab308">HNSW Vector Index</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px">
        <div>Vectors: <b>${h.vectorCount}</b></div>
        <div>Dimension: <b>${h.dimension}D</b></div>
        <div>Metric: <b>${h.metric || "cosine"}</b></div>
        <div>Index size: <b>${(h.indexSize / 1024).toFixed(1)} KB</b></div>
        ${h.model ? `<div>Model: <b>${h.model}</b></div>` : ""}
        ${h.memoryDbSize ? `<div>Memory DB: <b>${(h.memoryDbSize / 1024).toFixed(0)} KB</b></div>` : ""}
      </div>
    </div>`;
    if (h.patternCount !== void 0 || h.trajectoryCount !== void 0) {
      html += `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
        <div style="font-weight:600;margin-bottom:4px;color:#8b5cf6">Indexed Data</div>
        <div style="font-size:12px">
          ${h.patternCount !== void 0 ? `<div>Patterns: <b>${h.patternCount}</b></div>` : ""}
          ${h.trajectoryCount !== void 0 ? `<div>Trajectories: <b>${h.trajectoryCount}</b></div>` : ""}
        </div>
      </div>`;
    }
  }
  // Fallback chain (ONNX MiniLM)
  html += renderFallbackChain(detail);
  if (detail.patchRef) html += `<div>Patch: <b>${detail.patchRef}</b></div>`;
  if (detail.resolved) html += `<div style="margin-bottom:4px">Base path: <span style="color:#94a3b8">${detail.resolved}</span></div>`;
  if (detail.found !== void 0) html += `<div>Found: ${detail.found ? "\u2713" : "\u2717"}</div>`;
  // Recursive file tree with sizes
  if (detail.filesTree?.length) {
    const totalSize = detail.filesTree.filter(f => !f.isDir).reduce((s, f) => s + f.size, 0);
    const fileCount = detail.filesTree.filter(f => !f.isDir).length;
    html += `<div style="font-weight:600;margin:8px 0 4px">Files (${fileCount}) \xB7 ${fmtSize(totalSize)}</div>`;
    detail.filesTree.slice(0, 30).forEach((f) => {
      if (f.isDir) {
        html += `<div style="color:#94a3b8;margin-top:4px;font-size:12px">\uD83D\uDCC1 ${f.name}</div>`;
      } else {
        const sizeColor = f.size > 10485760 ? "#eab308" : "var(--text-dim)";
        html += `<div style="display:flex;justify-content:space-between;font-size:12px;padding:1px 0">
          <span style="color:var(--text-dim)">${f.name}</span>
          <span style="color:${sizeColor};min-width:60px;text-align:right">${fmtSize(f.size)}</span>
        </div>`;
      }
    });
  } else if (detail.files?.length) {
    html += `<div style="font-weight:600;margin:8px 0 4px">Files (${detail.files.length})</div>`;
    detail.files.slice(0, 20).forEach((f) => {
      html += `<div style="color:var(--text-dim)">${f}</div>`;
    });
  }
  return html;
}
// ── Fallback status cache (fetched on first controller/engine click) ──
let _fallbackCache = null;
async function getFallbackStatus() {
  if (_fallbackCache) return _fallbackCache;
  try {
    const res = await fetch("/api/system/fallback-status");
    if (res.ok) _fallbackCache = await res.json();
  } catch {}
  return _fallbackCache;
}
const FALLBACK_NODE_MAP = {
  native_core: "embedding", mdl_onnx: "embedding",
  ctrl_hybrid_search: "vectorSearch", ctrl_vector_backend: "vectorSearch", bin_hnsw_index: "vectorSearch", mdl_hnsw: "vectorSearch",
  native_router: "routing", ctrl_semantic_router: "routing", eng_router: "routing",
  eng_sona_optimizer: "sona", ctrl_sona_trajectory: "sona",
  ctrl_gnn_service: "gnn",
  wasm_lora: "lora", eng_ewc_consolidation: "lora",
  wasm_attention: "attention", eng_memory_bridge: "attention",
  mcp_ruvector: "embedding",
};
const FB_LEVEL_COLORS = { 1: "#22c55e", 2: "#3b82f6", 3: "#f59e0b", 4: "#ef4444" };
const FB_LEVEL_LABELS = { 1: "Optimal", 2: "Good", 3: "Degraded", 4: "Critical" };
function renderFallbackDetail(nodeId) {
  if (!_fallbackCache) return "";
  const component = FALLBACK_NODE_MAP[nodeId];
  if (!component) return "";
  const data = _fallbackCache.components?.[component];
  if (!data) return "";
  const color = FB_LEVEL_COLORS[data.activeLevel] || "#6b7280";
  let html = `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
    <div style="font-weight:600;margin-bottom:8px;color:${color}">Fallback Level: L${data.activeLevel} ${FB_LEVEL_LABELS[data.activeLevel] || ""}</div>
    <div style="font-size:11px;color:#94a3b8;margin-bottom:8px">Component: <b>${component}</b></div>`;
  for (const level of data.levels) {
    const isActive = level.level === data.activeLevel;
    const lColor = level.available ? (isActive ? FB_LEVEL_COLORS[level.level] : "#6b7280") : "#ef4444";
    const icon = !level.available ? "\u2717" : isActive ? "\u25C6" : "\u2713";
    const badge = isActive ? `<span style="color:${lColor};font-weight:700;font-size:10px;margin-left:6px;padding:1px 5px;border:1px solid ${lColor};border-radius:3px">ACTIVE</span>` : "";
    const deprecatedTag = level.deprecated ? ' <span style="color:#6b7280;font-size:10px">(deprecated)</span>' : "";
    html += `<div style="padding:3px 0;${isActive ? "background:rgba(255,255,255,0.03);margin:0 -4px;padding:3px 4px" : ""}">
      <div style="display:flex;align-items:center;gap:6px">
        <span style="color:${lColor};font-weight:700;font-size:13px;min-width:22px">L${level.level}</span>
        <span style="color:${lColor}">${icon}</span>
        <span style="font-size:12px;${isActive ? "color:#e2e8f0;font-weight:600" : "color:#94a3b8"}">${level.label}${deprecatedTag}</span>
        ${badge}
      </div>
      <div style="font-size:10px;color:#64748b;margin-left:28px">${level.method}</div>
    </div>`;
  }
  html += "</div>";
  return html;
}
function renderController(node, detail) {
  let html = "";
  const statusColors = {
    working: "#22c55e",
    broken: "#ef4444",
    disconnected: "#f59e0b",
    stub: "#6b7280"
  };
  const lvl = node.level || node.meta?.level;
  if (lvl) {
    html += `<div style="margin-bottom:8px">
      <span style="background:#22c55e22;color:#22c55e;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">Level ${lvl}</span>
    </div>`;
  }
  const cs = node.controllerStatus || node.meta?.controllerStatus || detail.controllerStatus;
  if (cs) {
    const color = statusColors[cs] || "#6b7280";
    html += `<div style="margin-bottom:8px;color:${color};font-weight:600">Status: ${cs.toUpperCase()}</div>`;
  }
  const bugs = detail.bugs || [];
  const bugRefs = node.bugRefs || node.meta?.bugRefs || [];
  if (bugs.length || bugRefs.length) {
    html += `<div style="margin-bottom:12px;padding:8px 10px;border-radius:6px;background:#7f1d1d33;border:1px solid #991b1b55">
      <div style="font-weight:600;margin-bottom:4px;color:#fca5a5">Upstream Bugs (${bugs.length || bugRefs.length})</div>`;
    if (bugs.length) {
      for (const b of bugs) {
        const fixBadge = b.fixed ? '<span style="color:#22c55e;margin-left:4px">FIXED</span>' : "";
        html += `<div style="color:#fecaca;font-size:12px;margin:2px 0">${b.id} [${b.severity}]: ${b.title}${fixBadge}</div>`;
      }
    } else {
      for (const ref of bugRefs) html += `<div style="color:#fecaca;font-size:12px">${ref}</div>`;
    }
    html += `</div>`;
  }
  // Routing pipeline distribution (for semantic router / SONA nodes)
  if (detail.routingLevels) html += renderRoutingPipeline(detail.routingLevels, detail.routingTotal);
  // Fallback degradation level detail
  html += renderFallbackDetail(node.id || node.meta?.id);
  if (detail.incomingEdges?.length) {
    html += `<div style="font-weight:600;margin:12px 0 4px">Incoming (${detail.incomingEdges.length})</div>`;
    for (const e of detail.incomingEdges) {
      const bugTag = e.bugRefs?.length ? ` <span style="color:#fca5a5">[${e.bugRefs.join(",")}]</span>` : "";
      html += `<div style="font-size:12px;color:var(--text-dim)">&#8592; ${e.source} (${e.type}: ${e.label})${bugTag}</div>`;
    }
  }
  if (detail.outgoingEdges?.length) {
    html += `<div style="font-weight:600;margin:12px 0 4px">Outgoing (${detail.outgoingEdges.length})</div>`;
    for (const e of detail.outgoingEdges) {
      const bugTag = e.bugRefs?.length ? ` <span style="color:#fca5a5">[${e.bugRefs.join(",")}]</span>` : "";
      html += `<div style="font-size:12px;color:var(--text-dim)">&#8594; ${e.target} (${e.type}: ${e.label})${bugTag}</div>`;
    }
  }
  return html;
}
function renderRoutingPipeline(levels, total) {
  if (!levels || !total) return "";
  const chain = [
    { key: "agentdb-semanticRouter", label: "AgentDB Semantic", level: 0, color: "#22c55e" },
    { key: "sona-native", label: "Rust SONA HNSW", level: 1, color: "#22c55e" },
    { key: "sona-pattern", label: "JS Pattern + EMA", level: 2, color: "#eab308" },
    { key: "q-learning", label: "Q-Learning", level: 3, color: "#eab308" },
    { key: "keyword", label: "Regex Heuristic", level: 4, color: "#ef4444" },
    { key: "default", label: "Default (no match)", level: 5, color: "#ef4444" },
  ];
  let html = `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
    <div style="font-weight:600;margin-bottom:8px;color:#8b5cf6">Routing Pipeline (${total} decisions)</div>
    <div style="display:flex;height:16px;border-radius:4px;overflow:hidden;background:#0f172a;margin-bottom:8px">`;
  for (const c of chain) {
    const count = levels[c.key] || 0;
    if (count === 0) continue;
    const pct = (count / total * 100);
    html += `<div style="width:${pct}%;background:${c.color};display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:600;min-width:${pct > 8 ? "20px" : "0"}" title="L${c.level} ${c.label}: ${count} (${pct.toFixed(1)}%)">${pct > 12 ? "L" + c.level : ""}</div>`;
  }
  html += `</div>`;
  for (const c of chain) {
    const count = levels[c.key] || 0;
    const pct = total > 0 ? (count / total * 100).toFixed(1) : "0";
    const isActive = count > 0;
    const icon = isActive ? "\u25C6" : "\u25CB";
    html += `<div style="display:flex;align-items:center;gap:6px;padding:2px 0;${isActive ? "" : "opacity:0.4"}">
      <span style="color:${c.color};font-weight:700;font-size:12px;min-width:22px">L${c.level}</span>
      <span style="color:${c.color};font-size:11px">${icon}</span>
      <span style="font-size:11px;color:${isActive ? "#e2e8f0" : "#64748b"}">${c.label}</span>
      <span style="font-size:10px;color:#64748b;margin-left:auto">${count} (${pct}%)</span>
    </div>`;
  }
  html += `</div>`;
  return html;
}
function renderSonaDetail(data) {
  const caps = data.capabilities || {};
  const hasNativeActivity = caps.trajectoryTracking || caps.forceLearn || caps.vectorEmbeddings;
  const ready = data.sonaReady || hasNativeActivity;
  const ewc = data.ewc;
  const isRust = ewc?.engine === 'rust-native' || hasNativeActivity;

  // Count active capabilities for quality level
  const capDefs = [
    { key: "trajectoryTracking",  rust: "SONA trajectory tracking",     js: "Step counting only" },
    { key: "forceLearn",          rust: "7-step extract\u2192EWC++\u2192LoRA", js: "Confidence bump only" },
    { key: "vectorEmbeddings",    rust: "HNSW 384D vector search",      js: "Keyword overlap" },
    { key: "ewcConsolidation",    rust: "Multi-task Fisher EMA",        js: "Single-task fixed \u03BB" },
    { key: "patternStore",        rust: "Pattern + embedding persist",  js: "Text-only patterns" },
    { key: "semanticRouting",     rust: "HNSW semantic routing",        js: "Regex heuristic" },
    { key: "causalGraph",         rust: "Causal edge recording",        js: "\u2014" },
    { key: "hierarchicalMemory",  rust: "Tiered memory store/recall",   js: "\u2014" },
  ];
  const activeCount = capDefs.filter(c => caps[c.key]).length;
  const qualityPct = capDefs.length > 0 ? Math.round(activeCount / capDefs.length * 100) : 0;
  const qualityColor = qualityPct >= 75 ? "#22c55e" : qualityPct >= 40 ? "#eab308" : "#ef4444";
  const qualityLabel = qualityPct >= 75 ? "Full Pipeline" : qualityPct >= 40 ? "Partial" : "Degraded";

  // Learning engine indicator
  let html = `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
      <div style="font-weight:600;color:#f59e0b">Learning Engine</div>
      <span style="font-size:10px;padding:2px 8px;border-radius:3px;background:${qualityColor}22;color:${qualityColor};border:1px solid ${qualityColor}44;font-weight:700">${activeCount}/${capDefs.length} ${qualityLabel}</span>
    </div>
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
      <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${isRust ? "#22c55e" : "#eab308"}"></span>
      <span style="font-size:12px;color:#e2e8f0;font-weight:600">${isRust ? "Rust SONA (@ruvector/sona)" : "JS Fallback"}</span>
    </div>`;
  // Capability checklist
  for (const c of capDefs) {
    const active = caps[c.key];
    const icon = active ? "\u2713" : "\u2717";
    const color = active ? "#22c55e" : "#ef4444";
    const desc = active ? c.rust : c.js;
    html += `<div style="display:flex;align-items:center;gap:6px;padding:1px 0;font-size:11px">
      <span style="color:${color};font-weight:700;min-width:14px">${icon}</span>
      <span style="color:${active ? "#e2e8f0" : "#64748b"}">${desc}</span>
    </div>`;
  }
  // EWC + embeddings stats
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px;margin-top:8px;padding-top:8px;border-top:1px solid #333">`;
  if (ewc) {
    html += `<div style="color:var(--text-dim)">EWC++ Tasks</div><div style="font-weight:600">${ewc.taskCount}</div>`;
    html += `<div style="color:var(--text-dim)">Fisher Dim</div><div>${ewc.dimension}D</div>`;
    html += `<div style="color:var(--text-dim)">Lambda</div><div>${ewc.lambda}</div>`;
    if (ewc.lastConsolidation) {
      html += `<div style="color:var(--text-dim)">Last EWC</div><div>${new Date(ewc.lastConsolidation).toLocaleTimeString()}</div>`;
    }
  }
  if (data.patternEmbeddingCount) {
    html += `<div style="color:var(--text-dim)">Embeddings</div><div>${data.patternEmbeddingCount} (384D)</div>`;
  }
  html += `</div>`;
  // Buffer fill progress bar (Loop B batch extraction)
  if (data.nativeBuffer) {
    const nb = data.nativeBuffer;
    const pct = nb.bufferSize > 0 ? Math.min(100, Math.round(nb.buffered / nb.bufferSize * 100)) : 0;
    const barColor = pct >= 90 ? "#22c55e" : pct >= 50 ? "#eab308" : "#3b82f6";
    html += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #333">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px">
        <span style="color:#94a3b8">Loop B Buffer</span>
        <span style="color:${barColor};font-weight:600">${nb.buffered}/${nb.bufferSize} trajectories</span>
      </div>
      <div style="height:10px;border-radius:5px;background:#0f172a;overflow:hidden">
        <div style="width:${pct}%;height:100%;border-radius:5px;background:${barColor};transition:width 0.3s"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;margin-top:4px;color:#64748b">
        <span>Patterns: ${nb.patternsStored}</span>
        <span>Dropped: ${nb.dropped}</span>
        <span>Quality: ${(nb.successRate * 100).toFixed(0)}%</span>
      </div>
    </div>`;
  }
  html += `</div>`;

  // SONA Optimizer stats
  html += `
    <div style="font-weight:600;margin:12px 0 4px;color:#f59e0b">SONA Optimizer</div>
    <table class="data">
      <tr><td style="color:var(--text-dim)">Status</td><td style="color:${ready ? "#10b981" : "#ef4444"}">${ready ? "WARM" : "COLD"}</td></tr>
      <tr><td style="color:var(--text-dim)">Processed (daemon)</td><td>${data.totalSonaProcessed || 0}</td></tr>
      <tr><td style="color:var(--text-dim)">Last batch</td><td>${data.lastSonaBatch || 0}</td></tr>
      <tr><td style="color:var(--text-dim)">Patterns (persisted)</td><td>${data.patternCount}</td></tr>
      <tr><td style="color:var(--text-dim)">Trajectories</td><td>${data.trajectoryCount}</td></tr>
      <tr><td style="color:var(--text-dim)">Last optimization</td><td>${data.lastOptimization ? new Date(data.lastOptimization).toLocaleString() : "Never"}</td></tr>
    </table>`;
  if (data.topPatterns?.length) {
    html += `<div style="font-weight:600;margin:8px 0 4px">Top Patterns</div>`;
    html += '<table class="data"><tr><th>Pattern</th><th>Conf</th><th>Wins</th></tr>';
    for (const p of data.topPatterns) {
      const conf = typeof p.confidence === "number" ? (p.confidence * 100).toFixed(0) + "%" : "\u2014";
      html += `<tr><td>${escapeHtml(p.name)}</td><td>${conf}</td><td>${p.successCount}</td></tr>`;
    }
    html += "</table>";
  }
  html += renderRoutingPipeline(data.routingLevels, data.routingTotal);
  return html;
}
function renderEwcDetail(data) {
  const ready = data.ewcReady;
  let html = `
    <div style="font-weight:600;margin:12px 0 4px;color:#3b82f6">EWC++ Consolidation</div>
    <table class="data">
      <tr><td style="color:var(--text-dim)">Status</td><td style="color:${ready ? "#10b981" : "#ef4444"}">${ready ? "WARM" : "COLD"}</td></tr>
      <tr><td style="color:var(--text-dim)">Gradients recorded (daemon)</td><td>${data.totalEwcRecorded || 0}</td></tr>
      <tr><td style="color:var(--text-dim)">Last batch</td><td>${data.lastEwcBatch || 0}</td></tr>
      <tr><td style="color:var(--text-dim)">Tasks</td><td>${data.taskCount}</td></tr>
      <tr><td style="color:var(--text-dim)">Fisher dimension</td><td>${data.fisherDimension}</td></tr>
      <tr><td style="color:var(--text-dim)">Consolidated params</td><td>${data.consolidatedParamCount}</td></tr>
      <tr><td style="color:var(--text-dim)">Last consolidation</td><td>${data.lastConsolidation ? new Date(data.lastConsolidation).toLocaleString() : "Never"}</td></tr>
      ${data.version ? `<tr><td style="color:var(--text-dim)">Version</td><td>${escapeHtml(String(data.version))}</td></tr>` : ""}
    </table>`;
  return html;
}
const RUVECTOR_TOOL_GROUPS = [
  { name: "Core", tools: [
    { tool: "hooks_stats", label: "Stats" },
    { tool: "hooks_route", label: "Route" },
    { tool: "hooks_remember", label: "Remember", promptArg: "content" },
    { tool: "hooks_recall", label: "Recall", promptArg: "query" },
    { tool: "hooks_verify", label: "Verify" },
    { tool: "hooks_doctor", label: "Doctor" }
  ] },
  { name: "Trajectory", tools: [
    { tool: "hooks_trajectory_begin", label: "Start" },
    { tool: "hooks_trajectory_step", label: "Step" },
    { tool: "hooks_trajectory_end", label: "End" }
  ] },
  { name: "Analysis", tools: [
    { tool: "hooks_ast_complexity", label: "Complexity" },
    { tool: "hooks_security_scan", label: "Security" },
    { tool: "hooks_coverage_route", label: "Coverage" },
    { tool: "hooks_coverage_suggest", label: "Suggest" }
  ] },
  { name: "Brain", tools: [
    { tool: "brain_search", label: "Search", promptArg: "query" },
    { tool: "brain_share", label: "Share" },
    { tool: "brain_status", label: "Status" },
    { tool: "brain_drift", label: "Drift" }
  ] },
  { name: "Workers", tools: [
    { tool: "workers_presets", label: "List" },
    { tool: "workers_status", label: "Status" },
    { tool: "workers_dispatch", label: "Dispatch" }
  ] }
];
const CLAUDE_FLOW_TOOL_GROUPS = [
  { name: "Memory", tools: [
    { tool: "memory_store", label: "Store", promptArg: "key" },
    { tool: "memory_search", label: "Search", promptArg: "query" },
    { tool: "memory_list", label: "List" },
    { tool: "memory_stats", label: "Stats" }
  ] },
  { name: "Agent", tools: [
    { tool: "agent_spawn", label: "Spawn" },
    { tool: "agent_list", label: "List" },
    { tool: "agent_status", label: "Status" }
  ] },
  { name: "Swarm", tools: [
    { tool: "swarm_init", label: "Init" },
    { tool: "swarm_status", label: "Status" },
    { tool: "swarm_health", label: "Health" }
  ] },
  { name: "Hooks", tools: [
    { tool: "hooks_intelligence", label: "Intelligence" },
    { tool: "hooks_metrics", label: "Metrics" },
    { tool: "hooks_session-start", label: "Session Start" },
    { tool: "hooks_session-end", label: "Session End" }
  ] }
];
const MCP_TOOL_MAP = {
  svc_ruvector: { server: "claude-flow", groups: RUVECTOR_TOOL_GROUPS },
  svc_claude_flow: { server: "claude-flow", groups: CLAUDE_FLOW_TOOL_GROUPS }
};
function renderMcpTools(nodeId) {
  const cfg = MCP_TOOL_MAP[nodeId];
  if (!cfg) return "";
  let html = `<div class="mcp-tools-section">
    <h4>MCP Tools</h4>`;
  for (const group of cfg.groups) {
    const gid = `mcp-grp-${cfg.server}-${group.name.toLowerCase().replace(/\s+/g, "-")}`;
    html += `
      <div class="mcp-group-header" data-group="${gid}">
        <span class="arrow">&#9654;</span> ${escapeHtml(group.name)}
      </div>
      <div class="mcp-group-body" id="${gid}">`;
    for (const t of group.tools) {
      const dataAttrs = `data-server="${cfg.server}" data-tool="${t.tool}"${t.promptArg ? ` data-prompt-arg="${t.promptArg}"` : ""}${t.args ? ` data-args='${JSON.stringify(t.args)}'` : ""}`;
      html += `<button class="mcp-tool-btn" ${dataAttrs}>${escapeHtml(t.label)}</button>`;
    }
    html += "</div>";
  }
  html += '<div class="mcp-output" id="mcp-panel-output"></div></div>';
  return html;
}
function attachMcpHandlers() {
  document.querySelectorAll(".mcp-group-header[data-group]").forEach((hdr) => {
    hdr.addEventListener("click", () => {
      const gid = hdr.dataset.group;
      const body = document.getElementById(gid);
      if (!body) return;
      const isOpen = body.classList.contains("open");
      body.classList.toggle("open", !isOpen);
      hdr.classList.toggle("open", !isOpen);
    });
  });
  const firstHdr = document.querySelector(".mcp-group-header[data-group]");
  if (firstHdr) {
    firstHdr.classList.add("open");
    const firstBody = document.getElementById(firstHdr.dataset.group);
    if (firstBody) firstBody.classList.add("open");
  }
  document.querySelectorAll(".mcp-tool-btn[data-server]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const server = btn.dataset.server;
      const tool = btn.dataset.tool;
      const promptArg = btn.dataset.promptArg;
      let args = {};
      if (btn.dataset.args) {
        try {
          args = JSON.parse(btn.dataset.args);
        } catch {
        }
      }
      if (promptArg) {
        const val = prompt(`Enter ${promptArg}:`);
        if (!val) return;
        args[promptArg] = val;
      }
      const origLabel = btn.textContent || "";
      btn.disabled = true;
      btn.textContent = "...";
      const outputEl = document.getElementById("mcp-panel-output");
      try {
        const res = await fetch(`/api/mcp/${server}/${tool}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ args })
        });
        const data = await res.json();
        btn.textContent = data.ok ? "\u2713" : "\u2717";
        if (outputEl && (data.output || data.error)) {
          const text = data.output || data.error;
          let formatted;
          try {
            const parsed = JSON.parse(text);
            formatted = escapeHtml(JSON.stringify(parsed, null, 2));
          } catch {
            formatted = escapeHtml(text);
          }
          const color = data.ok ? "#fbbf24" : "#ef4444";
          outputEl.innerHTML = `
            <div style="font-weight:600;margin-bottom:4px;color:${color}">${escapeHtml(tool)}</div>
            <pre class="code" style="max-height:200px;overflow:auto;font-size:11px">${formatted}</pre>`;
        }
      } catch (e) {
        btn.textContent = "\u2717";
        if (outputEl) {
          outputEl.innerHTML = `<div style="color:#ef4444;font-size:11px">${escapeHtml(e.message || "Unknown error")}</div>`;
        }
      }
      setTimeout(() => {
        btn.textContent = origLabel;
        btn.disabled = false;
      }, 2e3);
    });
  });
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export {
  closeSidePanel,
  openSidePanel
};
