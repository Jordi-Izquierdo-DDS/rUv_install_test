(() => {
  // src/panels/side-panel.ts
  var TYPE_COLORS = {
    trigger: "#f59e0b",
    script: "#3b82f6",
    engine: "#8b5cf6",
    store_db: "#10b981",
    store_json: "#14b8a6",
    config: "#6b7280",
    model: "#eab308",
    service: "#06b6d4"
  };
  var currentNodeId = null;
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
      const res = await fetch(`/api/node/${node.id}`);
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
  var LEARNING_ACTIONS = {
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
  var DAEMON_PROCESSES = {
    eng_hooks_daemon: { daemon: "hooks-daemon", label: "Hooks Daemon (ONNX + bridge + 7-layer)" },
    eng_metrics_db: { daemon: "metrics-daemon", label: "Metrics Daemon (SQLite sync)" },
    eng_swarm_monitor: { daemon: "swarm-monitor", label: "Swarm Monitor (process detection)" },
    eng_daemon_manager: { daemon: "all", label: "All 3 Daemons" }
  };
  var DAEMON_WORKERS = {
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
  function renderModel(detail) {
    let html = "";
    if (detail.patchRef) html += `<div>Patch: <b>${detail.patchRef}</b></div>`;
    if (detail.resolved) html += `<div>Path: ${detail.resolved}</div>`;
    if (detail.found !== void 0) html += `<div>Found: ${detail.found ? "\u2713" : "\u2717"}</div>`;
    if (detail.files?.length) {
      html += `<div style="font-weight:600;margin:8px 0 4px">Files</div>`;
      detail.files.slice(0, 20).forEach((f) => {
        html += `<div style="color:var(--text-dim)">${f}</div>`;
      });
    }
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
  function renderSonaDetail(data) {
    const ready = data.sonaReady;
    let html = `
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
  var RUVECTOR_TOOL_GROUPS = [
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
  var CLAUDE_FLOW_TOOL_GROUPS = [
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
  var MCP_TOOL_MAP = {
    svc_ruvector: { server: "ruvector", groups: RUVECTOR_TOOL_GROUPS },
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

  // src/panels/learning-graph.ts
  var EDGE_COLORS = {
    fires: "#f59e0b",
    calls: "#3b82f6",
    reads: "#c084fc",
    writes: "#60a5fa",
    uses: "#eab308",
    loads: "#a78bfa",
    configures: "#6b7280"
  };
  var EDGE_COLOR_DEFAULT = "#555555";
  var EDGE_STATUS = {
    broken: "#ef4444",
    deprecated: "#6b7280",
    pulse: "#22D3EE"
    // cyan active pulse
  };
  var EDGE_OPACITY = {
    active: 0.75,
    idle: 0.35,
    broken: 0.5,
    deprecated: 0.15
  };
  var EDGE_REVERSE_VISUAL = /* @__PURE__ */ new Set(["reads", "uses"]);
  var STATUS_DOT = {
    active: "#22c55e",
    idle: "#22D3EE",
    unhealthy: "#fbbf24",
    missing: "#ef4444",
    onDemand: "#a78bfa",
    phantom: "#6b7280",
    deprecated: "#4b5563"
  };
  var TIER_COLORS = {
    0: "#f97316",
    // T0 Infrastructure — orange
    1: "#3b82f6",
    // T1 Reactive — blue
    2: "#8b5cf6",
    // T2 Adaptive — purple
    3: "#14b8a6",
    // T3 Deliberative — teal
    9: "#6b7280"
    // Unexpected / CLI — gray
  };
  var TIER_COLOR_DEFAULT = "#6b7280";
  function getThemeSnapshot() {
    return {
      edgeColors: { ...EDGE_COLORS },
      edgeStatus: { ...EDGE_STATUS },
      edgeOpacity: { ...EDGE_OPACITY },
      statusDot: { ...STATUS_DOT },
      tierColors: Object.fromEntries(Object.entries(TIER_COLORS))
    };
  }
  function applyThemeData(t) {
    if (t.edgeColors) Object.assign(EDGE_COLORS, t.edgeColors);
    if (t.edgeStatus) Object.assign(EDGE_STATUS, t.edgeStatus);
    if (t.edgeOpacity) Object.assign(EDGE_OPACITY, t.edgeOpacity);
    if (t.statusDot) Object.assign(STATUS_DOT, t.statusDot);
    if (t.tierColors) {
      for (const [k, v] of Object.entries(t.tierColors)) TIER_COLORS[Number(k)] = v;
    }
  }
  async function loadTheme() {
    try {
      const res = await fetch("/api/theme");
      const data = await res.json();
      if (data && typeof data === "object") applyThemeData(data);
    } catch {
    }
  }
  async function saveTheme() {
    try {
      await fetch("/api/theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(getThemeSnapshot())
      });
    } catch {
    }
  }
  function rebuildArrowMarkers() {
    if (!mainG) return;
    mainG.selectAll("defs marker").remove();
    const defs = mainG.select("defs");
    if (defs.empty()) return;
    for (const [et, color] of Object.entries(EDGE_COLORS)) {
      defs.append("marker").attr("id", `arrow-${et}`).attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto-start-reverse").append("path").attr("d", "M0,0 L10,5 L0,10 Z").attr("fill", color);
    }
    defs.append("marker").attr("id", "arrow-broken").attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto-start-reverse").append("path").attr("d", "M0,0 L10,5 L0,10 Z").attr("fill", EDGE_STATUS.broken);
    defs.append("marker").attr("id", "arrow-deprecated").attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto-start-reverse").append("path").attr("d", "M0,0 L10,5 L0,10 Z").attr("fill", EDGE_STATUS.deprecated);
    defs.append("marker").attr("id", "arrow-active").attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto-start-reverse").append("path").attr("d", "M0,0 L10,5 L0,10 Z").attr("fill", EDGE_STATUS.pulse);
  }
  function applyThemeLive() {
    rebuildArrowMarkers();
    if (!currentData || !mainG) return;
    const nodeMap = new Map(currentData.nodes.map((n) => [n.id, n]));
    currentData.edges.forEach((e, idx) => {
      const eG = mainG.select(`.edge-${idx}`);
      if (eG.empty()) return;
      eG.select(".edge-path").attr("stroke", edgeStrokeColor(e)).attr("opacity", edgeOpacity(e)).attr("marker-end", edgeArrowUrl(e));
    });
    for (const node of currentData.nodes) {
      const ng = mainG.select(`.node-${node.id}`);
      if (ng.empty()) continue;
      ng.select(".status-dot").attr("fill", statusColor(node));
      const s = STYLE[node.type] || STYLE.config;
      const shape = ng.select(".shape-main");
      if (!node.deprecated && shape.node()) {
        shape.attr("stroke", s.stroke);
      }
      const dotTiers = nodeTiersTouched.get(node.id);
      const sorted = dotTiers ? [...dotTiers].sort() : [node.tier];
      ng.selectAll(".tier-dot").each(function(_d, i) {
        const t = sorted[i];
        if (t != null) d3.select(this).attr("fill", TIER_COLORS[t] || TIER_COLOR_DEFAULT);
      });
    }
  }
  var STYLE = {
    trigger: { fill: "#2a1a0a", stroke: "#f59e0b", text: "#fde68a" },
    script: { fill: "#16213e", stroke: "#3b82f6", text: "#a8c8ff" },
    engine: { fill: "#2a0a1a", stroke: "#8b5cf6", text: "#c4b5fd" },
    store_db: { fill: "#0a1a3a", stroke: "#10b981", text: "#a7f3d0" },
    store_json: { fill: "#2d1f0e", stroke: "#14b8a6", text: "#99f6e4" },
    config: { fill: "#1a1a2a", stroke: TIER_COLOR_DEFAULT, text: "#d1d5db" },
    model: { fill: "#2d1f0e", stroke: "#eab308", text: "#fef08a" },
    service: { fill: "#2a0a2a", stroke: "#06b6d4", text: "#a5f3fc" },
    controller: { fill: "#0a2a1a", stroke: "#22c55e", text: "#bbf7d0" },
    daemon: { fill: "#1a0a2a", stroke: "#a855f7", text: "#d8b4fe" },
    bridge: { fill: "#0a1a2a", stroke: "#3b82f6", text: "#93c5fd" },
    worker: { fill: "#0a1a2a", stroke: "#60a5fa", text: "#93c5fd" }
  };
  var OVERLAY_COLORS = {
    found: STATUS_DOT.active,
    degraded: "#eab308",
    missing: STATUS_DOT.missing,
    unexpected: "#06b6d4"
  };
  var SUBGRAPHS = [
    { id: "triggers", label: "Hook Triggers", color: "#2a1a0a", borderColor: "#f59e0b88" },
    { id: "scripts", label: "Hook Scripts", color: "#16213e", borderColor: "#3b82f688" },
    { id: "engines", label: "Processing Engines", color: "#2a0a1a", borderColor: "#8b5cf688" },
    { id: "stores", label: "Data Stores", color: "#0a1a3a", borderColor: "#10b98188" },
    { id: "services", label: "MCP Services", color: "#2a0a2a", borderColor: "#06b6d488" },
    { id: "configs", label: "Configuration", color: "#1a1a2a", borderColor: "#6b728088" },
    { id: "models", label: "Models", color: "#2d1f0e", borderColor: "#eab30888" },
    { id: "controllers", label: "ADR-053 Controllers", color: "#0a2a1a", borderColor: "#22c55e88" },
    { id: "daemons", label: "Background Daemons", color: "#1a0a2a", borderColor: "#a855f788" },
    { id: "bridges", label: "Bridge Layer", color: "#0a1a2a", borderColor: "#3b82f688" },
    { id: "workers", label: "CLI Tools (on-demand)", color: "#0a1a2a", borderColor: "#60a5fa88" },
    { id: "utilities", label: "Utilities", color: "#111", borderColor: "#44444488" }
  ];
  function nodeGroup(type, id) {
    if (id === "eng_cli_tools") return "workers";
    switch (type) {
      case "trigger":
        return "triggers";
      case "script":
        return "scripts";
      case "engine":
        return "engines";
      case "store_db":
      case "store_json":
        return "stores";
      case "service":
        return "services";
      case "config":
        return "configs";
      case "model":
        return "models";
      case "controller":
        return "controllers";
      case "daemon":
        return "daemons";
      case "bridge":
        return "bridges";
      case "worker":
        return "workers";
      default:
        return "stores";
    }
  }
  function nodeShape(type, id) {
    if (id === "eng_cli_tools") return "stadium";
    switch (type) {
      case "trigger":
        return "parallelogram";
      case "store_db":
        return "cylinder";
      case "controller":
        return "hexagon";
      case "daemon":
        return "stadium";
      case "bridge":
        return "diamond";
      case "worker":
        return "hexagon";
      default:
        return "rect";
    }
  }
  var TIER_LABELS = { 1: "T1 React.", 2: "T2 Adapt.", 3: "T3 Delib.", 9: "T9 N/A" };
  function nodeSublabel(n) {
    const lvl = n.level || n.meta?.level;
    const cs = n.controllerStatus || n.meta?.controllerStatus;
    if (n.type === "controller" && lvl) {
      return `L${lvl}` + (cs ? ` \xB7 ${cs}` : "");
    }
    if (n.type === "trigger") {
      const tiers = nodeTiersTouched.get(n.id);
      if (tiers && tiers.size > 2) {
        return [...tiers].sort().map((t) => `T${t}`).join(" + ");
      }
      if (tiers && tiers.size > 1) {
        return [...tiers].sort().map((t) => TIER_LABELS[t] || `T${t}`).join(" + ");
      }
      return TIER_LABELS[n.tier] || n.meta.tier;
    }
    if (n.meta.path) {
      const parts = n.meta.path.split("/");
      return parts[parts.length - 1] || n.meta.path;
    }
    return n.meta.tier;
  }
  var NODE_W = 150;
  var NODE_H = 48;
  var LAYER_Y = { 0: 80, 1: 240, 2: 430, 3: 640, 4: 830, 5: 970 };
  var LAYER_LABELS = ["Triggers", "Scripts", "Engines", "Stores", "Services / Configs", "Models"];
  var svg;
  var mainG;
  var tooltip;
  var zoomBehavior;
  var currentData = null;
  var savedPositions = {};
  var nodeTiersTouched = /* @__PURE__ */ new Map();
  var showBoxes = true;
  var detachedNodes = /* @__PURE__ */ new Set();
  var satelliteCounter = 0;
  var satelliteGroups = /* @__PURE__ */ new Map();
  var FILTER_CATEGORIES = [
    {
      label: "Flow",
      groups: [
        { id: "triggers", label: "Hook Triggers", color: "#a855f7" },
        { id: "scripts", label: "Hook Scripts", color: "#3b82f6" }
      ]
    },
    {
      label: "Processing",
      groups: [
        { id: "engines", label: "Engines", color: "#8b5cf6" },
        { id: "services", label: "MCP Services", color: "#06b6d4" }
      ]
    },
    {
      label: "Data",
      groups: [
        { id: "stores", label: "Data Stores", color: "#10b981" },
        { id: "configs", label: "Configuration", color: "#6b7280" },
        { id: "models", label: "Models", color: "#eab308" }
      ]
    },
    {
      label: "Other",
      groups: [
        { id: "utilities", label: "Unexpected / Utility", color: "#444444" }
      ]
    }
  ];
  var hiddenGroups = /* @__PURE__ */ new Set();
  var hiddenNodes = /* @__PURE__ */ new Set();
  var openCategories = /* @__PURE__ */ new Set();
  var openNodeLists = /* @__PURE__ */ new Set();
  var showExpected = true;
  var showUnexpected = true;
  var hiddenTiers = /* @__PURE__ */ new Set();
  var filterPanel = null;
  var edgeEnergy = /* @__PURE__ */ new Map();
  var raisedEdges = /* @__PURE__ */ new Set();
  var edgeLayer = null;
  var nodeLayer = null;
  var activeEdgeLayer = null;
  var transcriptOffset = 0;
  var pulseTimer = null;
  var rafId = 0;
  var edgeIndexMap = null;
  var pulseScope = "project";
  var nodeEnergy = /* @__PURE__ */ new Map();
  var PULSE_NODE_TYPES = /* @__PURE__ */ new Set(["store_db", "store_json"]);
  var _processedLineHashes = /* @__PURE__ */ new Set();
  var _signalPulsedNodes = /* @__PURE__ */ new Set();
  function lineHash(line) {
    let h = 2166136261;
    for (let i = 0; i < line.length; i++) {
      h ^= line.charCodeAt(i);
      h = h * 16777619 >>> 0;
    }
    return h.toString(36);
  }
  var eventToNodeId;
  var scriptBaseToNodeId;
  var mcpPrefixToServiceId;
  var outgoingEdges;
  var incomingEdges;
  var configuresTriggerId;
  var configuresServiceId;
  var userPromptNodeId;
  function buildPulseMaps(nodes, edges) {
    eventToNodeId = /* @__PURE__ */ new Map();
    scriptBaseToNodeId = /* @__PURE__ */ new Map();
    mcpPrefixToServiceId = /* @__PURE__ */ new Map();
    outgoingEdges = /* @__PURE__ */ new Map();
    incomingEdges = /* @__PURE__ */ new Map();
    configuresTriggerId = /* @__PURE__ */ new Map();
    configuresServiceId = /* @__PURE__ */ new Map();
    userPromptNodeId = null;
    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    for (const n of nodes) {
      const keys = n.logKeys || [n.label];
      if (n.type === "trigger") {
        for (const k of keys) eventToNodeId.set(k, n.id);
        if (keys.includes("UserPromptSubmit")) userPromptNodeId = n.id;
      } else if (n.type === "script" || n.type === "engine") {
        for (const k of keys) scriptBaseToNodeId.set(k, n.id);
      } else if (n.type === "service") {
        for (const k of keys) mcpPrefixToServiceId.set(k, n.id);
      }
    }
    for (const e of edges) {
      const key = `${e.sourceId}\u2192${e.targetId}:${e.type}`;
      const out = outgoingEdges.get(e.sourceId) || [];
      out.push(key);
      outgoingEdges.set(e.sourceId, out);
      const inc = incomingEdges.get(e.targetId) || [];
      inc.push(key);
      incomingEdges.set(e.targetId, inc);
      if (e.type === "configures") {
        const target = nodeById.get(e.targetId);
        if (target?.type === "trigger") configuresTriggerId.set(e.targetId, e.sourceId);
        if (target?.type === "service") configuresServiceId.set(e.targetId, e.sourceId);
      }
    }
  }
  function resolveEdgeKeys(edgeKey) {
    if (!edgeIndexMap) return [];
    const direct = edgeIndexMap.get(edgeKey);
    if (direct !== void 0) return [direct];
    const indices = [];
    for (const [k, idx] of edgeIndexMap) {
      if (k.startsWith(edgeKey + ":")) indices.push(idx);
    }
    return indices;
  }
  var edgePulseColor = /* @__PURE__ */ new Map();
  function pulseEdge(edgeKey, energy, color) {
    if (!edgeIndexMap || energy < 0.05) return;
    const indices = resolveEdgeKeys(edgeKey);
    if (indices.length === 0) return;
    for (const idx of indices) {
      edgeEnergy.set(idx, Math.min(1, (edgeEnergy.get(idx) || 0) + energy));
      if (color) edgePulseColor.set(idx, color);
    }
    const parts = edgeKey.split("\u2192");
    const targetId = parts[1]?.split(":")[0];
    if (targetId && currentData) {
      const tgt = currentData.nodes.find((n) => n.id === targetId);
      if (tgt && PULSE_NODE_TYPES.has(tgt.type)) {
        nodeEnergy.set(targetId, Math.min(1, (nodeEnergy.get(targetId) || 0) + energy));
      }
    }
  }
  var _cascadeVisited = /* @__PURE__ */ new Set();
  function pulseWithCascade(edgeKey, energy, _isRoot = true) {
    if (!edgeIndexMap || energy < 0.05) return;
    if (_isRoot) _cascadeVisited.clear();
    if (_cascadeVisited.has(edgeKey)) return;
    _cascadeVisited.add(edgeKey);
    pulseEdge(edgeKey, energy);
    const targetId = edgeKey.split("\u2192")[1]?.split(":")[0];
    const downstream = outgoingEdges.get(targetId);
    if (downstream) {
      for (const dk of downstream) pulseWithCascade(dk, energy * 0.3, false);
    }
  }
  var STATUS_PULSE_COLORS = {
    active: "#22D3EE",
    // cyan
    idle: "#A78BFA",
    // purple
    broken: "#EF4444",
    // red
    pending: "#EF4444"
    // red (same as broken)
  };
  function pulseEdgesByStatus(status) {
    if (!currentData) return 0;
    const matching = currentData.edges.filter((e) => {
      if (status === "all") return true;
      const s = e.telemetry?.lastStatus || "idle";
      if (status === "broken") return s === "broken" || s === "pending";
      return s === status;
    });
    _cascadeVisited.clear();
    for (const e of matching) {
      const key = `${e.sourceId}\u2192${e.targetId}`;
      const s = e.telemetry?.lastStatus || "idle";
      const color = status === "all" ? STATUS_PULSE_COLORS[s] || STATUS_PULSE_COLORS.idle : STATUS_PULSE_COLORS[status] || EDGE_STATUS.pulse;
      pulseEdge(key, 0.7, color);
    }
    return matching.length;
  }
  function processLines(lines) {
    if (!edgeIndexMap || !eventToNodeId) return;
    _cascadeVisited.clear();
    for (const raw of lines) {
      const h = lineHash(raw);
      if (_processedLineHashes.has(h)) continue;
      _processedLineHashes.add(h);
      if (_processedLineHashes.size > 5e3) {
        const iter = _processedLineHashes.values();
        for (let i = 0; i < 1e3; i++) {
          const v = iter.next().value;
          if (v) _processedLineHashes.delete(v);
        }
      }
      try {
        const obj = JSON.parse(raw);
        if (obj.type === "progress" && obj.data?.type === "hook_progress") {
          const d = obj.data;
          const rawEvt = (d.hookName || d.hookEvent || "").split(":")[0];
          const sourceId = eventToNodeId.get(rawEvt);
          const cmd = d.command || "";
          if (cmd === "callback") continue;
          const cmdMatch = cmd.match(/helpers\/([a-zA-Z0-9._-]+)/);
          const targetId = cmdMatch ? scriptBaseToNodeId.get(cmdMatch[1]) : void 0;
          if (sourceId && targetId) {
            pulseWithCascade(`${sourceId}\u2192${targetId}`, 0.7);
          }
          continue;
        }
        if (obj.type === "user" && obj.userType === "external" && userPromptNodeId) {
          const content = obj.message?.content;
          const hasText = typeof content === "string" || Array.isArray(content) && content.some((c) => c.type === "text");
          if (hasText) {
            const edges = outgoingEdges.get(userPromptNodeId);
            if (edges) {
              for (const ek of edges) pulseWithCascade(ek, 0.7);
            }
          }
          continue;
        }
        const lp = obj.type === "learning_progress" ? obj : obj.data?.type === "learning_progress" ? obj.data : null;
        if (lp) {
          const action = lp.action || "";
          const pulseNode = (id, e = 0.6) => nodeEnergy.set(id, Math.min(1, (nodeEnergy.get(id) || 0) + e));
          switch (action) {
            case "sona_trajectory":
              pulseNode("eng_sona_optimizer");
              pulseWithCascade("eng_learning_service\u2192eng_sona_optimizer", 0.7);
              pulseWithCascade("eng_sona_optimizer\u2192json_sona_patterns", 0.7);
              pulseWithCascade("eng_sona_optimizer\u2192db_memory", 0.7);
              break;
            case "ewc_consolidation":
              pulseNode("eng_ewc_consolidation");
              pulseWithCascade("eng_learning_service\u2192eng_ewc_consolidation", 0.7);
              pulseWithCascade("eng_ewc_consolidation\u2192json_ewc_fisher", 0.7);
              pulseWithCascade("eng_ewc_consolidation\u2192db_memory", 0.7);
              break;
            case "intelligence_consolidate":
              pulseNode("eng_intelligence");
              pulseWithCascade("eng_intelligence\u2192json_intelligence_snapshot", 0.7);
              pulseWithCascade("eng_auto_memory\u2192eng_intelligence", 0.7);
              break;
            case "intelligence_feedback":
              pulseNode("eng_intelligence");
              break;
            case "neural_pretrain":
              pulseNode("eng_cli_tools");
              pulseWithCascade("eng_learning_service\u2192eng_sona_optimizer", 0.7);
              break;
            case "pattern_store":
              pulseNode("db_memory");
              pulseWithCascade("eng_ewc_consolidation\u2192db_memory", 0.7);
              break;
            case "pattern_store_t2":
              pulseNode("db_patterns");
              pulseWithCascade("eng_hook_handler\u2192db_patterns", 0.7);
              break;
            case "cross_tier_bridge":
              pulseNode("eng_intelligence");
              pulseNode("db_patterns");
              pulseWithCascade("eng_intelligence\u2192db_patterns", 0.8);
              pulseWithCascade("eng_intelligence\u2192json_last_matched_patterns", 0.5);
              break;
            case "trajectory_start":
              pulseNode("eng_hook_handler");
              pulseWithCascade("eng_hook_handler\u2192json_current_trajectory", 0.6);
              break;
            case "trajectory_end":
              pulseNode("eng_hook_handler");
              pulseNode("db_patterns");
              pulseWithCascade("eng_hook_handler\u2192db_patterns", 0.7);
              pulseWithCascade("eng_hook_handler\u2192json_current_trajectory", 0.5);
              break;
            case "trajectory_step":
              pulseNode("eng_hook_handler");
              pulseWithCascade("eng_hook_handler\u2192json_current_trajectory", 0.5);
              break;
          }
          continue;
        }
        if (obj.type === "assistant" && obj.message?.content) {
          for (const b of obj.message.content) {
            if (b.type !== "tool_use") continue;
            const name = b.name || "";
            if (!name.startsWith("mcp__")) continue;
            const server = name.split("__")[1];
            if (!server) continue;
            const svcId = mcpPrefixToServiceId.get(server);
            if (!svcId) continue;
            const svcEdges = outgoingEdges.get(svcId);
            if (svcEdges) {
              for (const ek of svcEdges) pulseWithCascade(ek, 0.5);
            }
          }
        }
      } catch {
      }
    }
  }
  function nodePorts(n) {
    const hw = n.w / 2, hh = n.h / 2;
    const cylExt = n.shape === "cylinder" ? 6 : 0;
    return {
      top: { x: n.x, y: n.y - hh },
      bottom: { x: n.x, y: n.y + hh + cylExt },
      left: { x: n.x - hw, y: n.y },
      right: { x: n.x + hw, y: n.y }
    };
  }
  function edgePath(src, tgt, offset = 0) {
    const sp = nodePorts(src), tp = nodePorts(tgt);
    const dx = tgt.x - src.x, dy = tgt.y - src.y;
    let from, to;
    let isVertical;
    if (Math.abs(dy) > 40) {
      isVertical = true;
      if (dy >= 0) {
        from = sp.bottom;
        to = tp.top;
      } else {
        from = sp.top;
        to = tp.bottom;
      }
    } else if (Math.abs(dx) > 20) {
      isVertical = false;
      if (dx >= 0) {
        from = sp.right;
        to = tp.left;
      } else {
        from = sp.left;
        to = tp.right;
      }
    } else {
      isVertical = true;
      from = sp.bottom;
      to = tp.top;
    }
    if (offset !== 0) {
      const spacing = 6;
      const shift = offset * spacing;
      if (isVertical) {
        from = { x: from.x + shift, y: from.y };
        to = { x: to.x + shift, y: to.y };
      } else {
        from = { x: from.x, y: from.y + shift };
        to = { x: to.x, y: to.y + shift };
      }
    }
    return { d: `M${from.x},${from.y} L${to.x},${to.y}`, lx: (from.x + to.x) / 2, ly: (from.y + to.y) / 2 - 4 };
  }
  var _edgeOffsets = [];
  function computeEdgeOffsets(edges) {
    _edgeOffsets = new Array(edges.length).fill(0);
    if (!currentData) return;
    const visualSrc = (e) => EDGE_REVERSE_VISUAL.has(e.type) ? e.targetId : e.sourceId;
    const visualTgt = (e) => EDGE_REVERSE_VISUAL.has(e.type) ? e.sourceId : e.targetId;
    const pairs = /* @__PURE__ */ new Map();
    for (let i = 0; i < edges.length; i++) {
      const a = visualSrc(edges[i]), b = visualTgt(edges[i]);
      const k = a < b ? `${a}\u2194${b}` : `${b}\u2194${a}`;
      if (!pairs.has(k)) pairs.set(k, []);
      pairs.get(k).push(i);
    }
    for (const indices of pairs.values()) {
      if (indices.length <= 1) continue;
      for (let j = 0; j < indices.length; j++) {
        _edgeOffsets[indices[j]] = j - (indices.length - 1) / 2;
      }
    }
  }
  function groupBounds(nodes, groupId) {
    const members = nodes.filter((n) => n.group === groupId && !detachedNodes.has(n.id));
    if (!members.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of members) {
      x1 = Math.min(x1, n.x - n.w / 2 - 16);
      y1 = Math.min(y1, n.y - n.h / 2 - 16);
      x2 = Math.max(x2, n.x + n.w / 2 + 16);
      y2 = Math.max(y2, n.y + n.h / 2 + 16);
    }
    return { x: x1 - 10, y: y1 - 24, w: x2 - x1 + 20, h: y2 - y1 + 34 };
  }
  function statusColor(d) {
    if (d.deprecated) return STATUS_DOT.deprecated;
    if (d.meta?.phantom && !d.signals.exists) return STATUS_DOT.phantom;
    if (d.meta?.dormant && !d.signals.exists) return STATUS_DOT.idle;
    if (!d.signals.exists) return STATUS_DOT.missing;
    if (!d.signals.healthy) return STATUS_DOT.unhealthy;
    if (d.signals.active) return STATUS_DOT.active;
    return STATUS_DOT.idle;
  }
  function showTooltip(event, html) {
    tooltip.innerHTML = html;
    tooltip.style.display = "block";
    tooltip.style.left = event.pageX + 12 + "px";
    tooltip.style.top = event.pageY + 12 + "px";
  }
  function hideTooltip() {
    tooltip.style.display = "none";
  }
  function nodeStatusInfo(d) {
    if (d.deprecated) return { status: "DEPRECATED", hint: "Intentionally removed from the system", color: STATUS_DOT.deprecated };
    if (d.meta?.phantom && !d.signals.exists) return { status: "PHANTOM", hint: "Optional \u2014 not installed in this configuration", color: STATUS_DOT.phantom };
    if (d.meta?.dormant && !d.signals.exists) return { status: "DORMANT", hint: "Configured but not scheduled by the daemon", color: STATUS_DOT.idle };
    if (!d.signals.exists) return { status: "MISSING", hint: "Should exist but file not found", color: STATUS_DOT.missing };
    if (!d.signals.healthy) return { status: "DEGRADED", hint: "Exists but not fully healthy", color: STATUS_DOT.unhealthy };
    if (d.signals.active) return { status: "ACTIVE", hint: "Running and recently used", color: STATUS_DOT.active };
    return { status: "IDLE", hint: "Ready, waiting to be used", color: STATUS_DOT.idle };
  }
  function nodeTooltipHtml(d) {
    const s = d.signals;
    const info = nodeStatusInfo(d);
    const isAbsent = d.deprecated || d.meta?.phantom && !s.exists || d.meta?.dormant && !s.exists;
    const sig = (ok, label) => isAbsent ? `<span style="color:${info.color}">\u2014</span> ${label}` : ok ? `<span style="color:${STATUS_DOT.active}">&#10003;</span> ${label}` : `<span style="color:${STATUS_DOT.missing}">&#10007;</span> ${label}`;
    return `
    <div style="font-weight:600;margin-bottom:4px;color:${STYLE[d.type]?.stroke || "#fff"}">${d.label}</div>
    <div>Type: <b>${d.type}</b> &middot; Tier: <b>${d.meta.tier}</b></div>
    <div style="margin:4px 0">${sig(s.exists, "exists")} &middot; ${sig(s.healthy, "healthy")} &middot; ${sig(s.active, "active")} &rarr; <span style="color:${info.color};font-weight:600">${info.status}</span></div>
    <div style="color:${info.color};font-size:10px;margin-top:2px">${info.hint}</div>
    ${d.meta.path ? `<div style="margin-top:4px;color:#94a3b8">${d.meta.path}</div>` : ""}
    ${d.meta.description ? `<div style="margin-top:4px;color:#cbd5e1;font-style:italic">${d.meta.description}</div>` : ""}
    ${d.meta.rowCount !== void 0 && (d.type === "store_db" || d.type === "store_json") ? `<div>${(d.meta.countLabel || "Rows").charAt(0).toUpperCase() + (d.meta.countLabel || "rows").slice(1)}: ${d.meta.rowCount}</div>` : ""}
    ${d.meta.rowCount !== void 0 && d.type === "worker" ? `<div>Runs: ${d.meta.rowCount}</div>` : ""}
    ${d.meta.fileSize ? `<div>Size: ${(d.meta.fileSize / 1024).toFixed(1)} KB</div>` : ""}
    ${d.meta.archTier ? `<div style="margin-top:4px;color:${STATUS_DOT.onDemand}">&#9638; ${d.meta.archTier}</div>` : ""}
    ${d.meta.statusNote ? `<div style="margin-top:4px;color:${STATUS_DOT.unhealthy};max-width:360px;line-height:1.3">&#9888; ${d.meta.statusNote}</div>` : ""}
    ${d.bugRefs?.length || d.meta?.bugRefs?.length ? `<div style="color:#fca5a5;margin-top:4px">&#9888; Bugs: ${(d.bugRefs || d.meta?.bugRefs || []).join(", ")}</div>` : ""}
    ${!d.expected ? '<div style="color:#06b6d4;margin-top:4px">&#9888; Unexpected</div>' : ""}`;
  }
  function layoutNodes(nodes) {
    const expectedNodes = nodes.filter((n) => n.expected);
    const unexpectedNodes = nodes.filter((n) => !n.expected);
    const byLayer = {};
    for (const n of expectedNodes) {
      const layer = n.layer ?? 3;
      if (!byLayer[layer]) byLayer[layer] = [];
      byLayer[layer].push(n);
    }
    for (const [layer, layerNodes] of Object.entries(byLayer)) {
      const y = LAYER_Y[Number(layer)] || 700;
      layerNodes.sort((a, b) => a.tier - b.tier || a.type.localeCompare(b.type));
      const spacing = Math.max(NODE_W + 20, 170);
      const startX = -(layerNodes.length - 1) * spacing / 2;
      layerNodes.forEach((n, i) => {
        const saved = savedPositions[n.id];
        if (saved) {
          n.x = saved.x;
          n.y = saved.y;
        } else {
          n.x = startX + i * spacing;
          n.y = y;
        }
      });
    }
    if (unexpectedNodes.length > 0) {
      const maxExpectedY = Math.max(...Object.values(LAYER_Y), 700);
      const unexpectedY = maxExpectedY + 100;
      unexpectedNodes.sort((a, b) => a.tier - b.tier || a.type.localeCompare(b.type));
      const spacing = Math.max(NODE_W + 20, 170);
      const startX = -(unexpectedNodes.length - 1) * spacing / 2;
      unexpectedNodes.forEach((n, i) => {
        const saved = savedPositions[n.id];
        if (saved) {
          n.x = saved.x;
          n.y = saved.y;
        } else {
          n.x = startX + i * spacing;
          n.y = unexpectedY;
        }
      });
    }
  }
  function enrichNode(n) {
    n.w = NODE_W;
    n.h = NODE_H;
    n.shape = nodeShape(n.type, n.id);
    n.group = n.expected ? nodeGroup(n.type, n.id) : "utilities";
    n.sublabel = nodeSublabel(n);
    return n;
  }
  function drawSubgraphs(g, nodes, edges, nodeMap) {
    for (const sg of SUBGRAPHS) {
      const bounds = groupBounds(nodes, sg.id);
      if (!bounds) continue;
      const sgG = g.append("g").attr("class", `sg-${sg.id}`).attr("cursor", "grab");
      sgG.append("rect").attr("class", "sg-bg").attr("x", bounds.x).attr("y", bounds.y).attr("width", bounds.w).attr("height", bounds.h).attr("rx", 10).attr("fill", sg.color).attr("stroke", sg.borderColor).attr("stroke-width", 2).attr("opacity", showBoxes ? 0.3 : 0);
      sgG.append("text").attr("class", "sg-label").attr("x", bounds.x + 8).attr("y", bounds.y + 14).attr("fill", sg.borderColor).attr("font-size", 11).attr("font-weight", "bold").attr("opacity", showBoxes ? 1 : 0).text(sg.label);
      let dragStartX = 0, dragStartY = 0;
      const startPositions = [];
      const drag = d3.drag().on("start", function(ev) {
        sgG.attr("cursor", "grabbing");
        dragStartX = ev.x;
        dragStartY = ev.y;
        startPositions.length = 0;
        const members = nodes.filter((n) => n.group === sg.id && !detachedNodes.has(n.id));
        for (const m of members) startPositions.push({ node: m, sx: m.x, sy: m.y });
      }).on("drag", function(ev) {
        const dx = ev.x - dragStartX, dy = ev.y - dragStartY;
        for (const { node, sx, sy } of startPositions) {
          node.x = sx + dx;
          node.y = sy + dy;
          g.select(`.node-${node.id}`).attr("transform", `translate(${node.x},${node.y})`);
        }
        refreshSubgraphs(g, nodes, edges, nodeMap);
        refreshEdges(g, edges, nodeMap);
      }).on("end", function() {
        sgG.attr("cursor", "grab");
        markDirty();
      });
      sgG.call(drag);
    }
  }
  var SPLIT_DIST = 160;
  var MERGE_DIST = 120;
  function distToCluster(node, members) {
    if (members.length === 0) return Infinity;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const s of members) {
      x1 = Math.min(x1, s.x - s.w / 2);
      y1 = Math.min(y1, s.y - s.h / 2);
      x2 = Math.max(x2, s.x + s.w / 2);
      y2 = Math.max(y2, s.y + s.h / 2);
    }
    const nL = node.x - node.w / 2, nR = node.x + node.w / 2;
    const nT = node.y - node.h / 2, nB = node.y + node.h / 2;
    const dx = Math.max(x1 - nR, 0, nL - x2);
    const dy = Math.max(y1 - nB, 0, nT - y2);
    return Math.hypot(dx, dy);
  }
  function updateDetach(node, allNodes) {
    const sameGroup = allNodes.filter((n) => n.group === node.group && n.id !== node.id);
    const mainMembers = sameGroup.filter((n) => !detachedNodes.has(n.id));
    const distToMain = distToCluster(node, mainMembers);
    if (!detachedNodes.has(node.id)) {
      if (distToMain > SPLIT_DIST) detachedNodes.add(node.id);
    } else {
      if (distToMain < MERGE_DIST) {
        detachedNodes.delete(node.id);
      } else {
        for (const [sid, sat] of satelliteGroups) {
          if (sat.parentGroup !== node.group || !sat.members.has(node.id)) continue;
          const satSiblings = sameGroup.filter((n) => sat.members.has(n.id) && n.id !== node.id);
          if (distToCluster(node, satSiblings) > SPLIT_DIST) {
            sat.members.delete(node.id);
            if (sat.members.size < 2) satelliteGroups.delete(sid);
          }
          break;
        }
      }
    }
    rebuildSatellites(node.group, allNodes);
  }
  function rebuildSatellites(parentGroup, allNodes) {
    for (const [sid, sat] of satelliteGroups) {
      if (sat.parentGroup === parentGroup) satelliteGroups.delete(sid);
    }
    const detached = allNodes.filter((n) => n.group === parentGroup && detachedNodes.has(n.id));
    if (!detached.length) return;
    const assigned = /* @__PURE__ */ new Set();
    for (const node of detached) {
      if (assigned.has(node.id)) continue;
      const cluster = [node];
      assigned.add(node.id);
      let i = 0;
      while (i < cluster.length) {
        const current = cluster[i++];
        for (const other of detached) {
          if (assigned.has(other.id)) continue;
          if (distToCluster(other, cluster) < MERGE_DIST) {
            cluster.push(other);
            assigned.add(other.id);
          }
        }
      }
      const sid = `sat_${parentGroup}_${++satelliteCounter}`;
      satelliteGroups.set(sid, { parentGroup, members: new Set(cluster.map((n) => n.id)) });
    }
  }
  function satelliteBounds(nodes, memberIds) {
    const members = nodes.filter((n) => memberIds.has(n.id));
    if (!members.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const n of members) {
      x1 = Math.min(x1, n.x - n.w / 2 - 12);
      y1 = Math.min(y1, n.y - n.h / 2 - 12);
      x2 = Math.max(x2, n.x + n.w / 2 + 12);
      y2 = Math.max(y2, n.y + n.h / 2 + 12);
    }
    return { x: x1 - 6, y: y1 - 20, w: x2 - x1 + 12, h: y2 - y1 + 26 };
  }
  var liveSatelliteSvgs = /* @__PURE__ */ new Map();
  function refreshSubgraphs(g, nodes, edges, nodeMap) {
    for (const sg of SUBGRAPHS) {
      const bounds = groupBounds(nodes, sg.id);
      const sgG = g.select(`.sg-${sg.id}`);
      if (!bounds) {
        sgG.select(".sg-bg").attr("opacity", 0);
        sgG.select(".sg-label").attr("opacity", 0);
        continue;
      }
      sgG.select(".sg-bg").attr("x", bounds.x).attr("y", bounds.y).attr("width", bounds.w).attr("height", bounds.h).attr("opacity", showBoxes ? 0.3 : 0);
      sgG.select(".sg-label").attr("x", bounds.x + 8).attr("y", bounds.y + 14).attr("opacity", showBoxes ? 1 : 0);
    }
    if (!showBoxes) {
      g.selectAll(".satellite-group").remove();
      liveSatelliteSvgs.clear();
      return;
    }
    const activeSids = new Set(satelliteGroups.keys());
    for (const sid of liveSatelliteSvgs.keys()) {
      if (!activeSids.has(sid)) {
        g.select(`.sat-${sid}`).remove();
        liveSatelliteSvgs.delete(sid);
      }
    }
    for (const [sid, sat] of satelliteGroups) {
      const parentSg = SUBGRAPHS.find((s) => s.id === sat.parentGroup);
      if (!parentSg) continue;
      const bounds = satelliteBounds(nodes, sat.members);
      if (!bounds) continue;
      const memberKey = [...sat.members].sort().join(",");
      let satG = g.select(`.sat-${sid}`);
      if (satG.empty() || liveSatelliteSvgs.get(sid) !== memberKey) {
        if (!satG.empty()) satG.remove();
        const insertBefore = edgeLayer?.node() || null;
        const parent = insertBefore ? insertBefore.parentNode : g.node();
        const newG = document.createElementNS("http://www.w3.org/2000/svg", "g");
        if (insertBefore) parent.insertBefore(newG, insertBefore);
        else parent.appendChild(newG);
        satG = d3.select(newG).attr("class", `satellite-group sat-${sid}`).attr("cursor", "grab");
        satG.append("rect").attr("class", "sat-bg").attr("x", bounds.x).attr("y", bounds.y).attr("width", bounds.w).attr("height", bounds.h).attr("rx", 8).attr("fill", parentSg.color).attr("stroke", parentSg.borderColor).attr("stroke-width", 1.5).attr("stroke-dasharray", "6,3").attr("opacity", 0.3);
        satG.append("text").attr("class", "sat-label").attr("x", bounds.x + 6).attr("y", bounds.y + 12).attr("fill", parentSg.borderColor).attr("font-size", 9).attr("font-style", "italic").attr("opacity", 0.8).text(`${parentSg.label} (${sat.members.size})`);
        let dragStartX = 0, dragStartY = 0;
        const startPositions = [];
        const satDrag = d3.drag().on("start", function(ev) {
          satG.attr("cursor", "grabbing");
          dragStartX = ev.x;
          dragStartY = ev.y;
          startPositions.length = 0;
          for (const nid of sat.members) {
            const n = nodes.find((nd) => nd.id === nid);
            if (n) startPositions.push({ node: n, sx: n.x, sy: n.y });
          }
        }).on("drag", function(ev) {
          const dx = ev.x - dragStartX, dy = ev.y - dragStartY;
          for (const { node, sx, sy } of startPositions) {
            node.x = sx + dx;
            node.y = sy + dy;
            g.select(`.node-${node.id}`).attr("transform", `translate(${node.x},${node.y})`);
          }
          const b = satelliteBounds(nodes, sat.members);
          if (b) {
            satG.select(".sat-bg").attr("x", b.x).attr("y", b.y).attr("width", b.w).attr("height", b.h);
            satG.select(".sat-label").attr("x", b.x + 6).attr("y", b.y + 12);
          }
          if (edges && nodeMap) refreshEdges(g, edges, nodeMap);
        }).on("end", function() {
          satG.attr("cursor", "grab");
          markDirty();
        });
        satG.call(satDrag);
        liveSatelliteSvgs.set(sid, memberKey);
      } else {
        satG.select(".sat-bg").attr("x", bounds.x).attr("y", bounds.y).attr("width", bounds.w).attr("height", bounds.h);
        satG.select(".sat-label").attr("x", bounds.x + 6).attr("y", bounds.y + 12).text(`${parentSg.label} (${sat.members.size})`);
      }
    }
  }
  function edgeStrokeColor(e) {
    if (e.deprecated) return EDGE_STATUS.deprecated;
    if (e.telemetry?.lastStatus === "broken") return EDGE_STATUS.broken;
    if (e.bugRefs?.length) return "#ff6b6b";
    return EDGE_COLORS[e.type] || EDGE_COLOR_DEFAULT;
  }
  var EDGE_GROUP_OPACITY = {
    workers: 0.3,
    // CLI Tools edges (dimmed by default — many edges, on-demand)
    controllers: 0.5
    // ADR-053 controller edges (dimmed — internal wiring)
  };
  function edgeGroupKey(e) {
    if (e.sourceId?.startsWith("wrk_") || e.targetId?.startsWith("wrk_") || e.sourceId === "eng_cli_tools") return "workers";
    if (e.sourceId?.startsWith("ctrl_") || e.targetId?.startsWith("ctrl_")) return "controllers";
    return null;
  }
  function edgeOpacity(e) {
    if (e.deprecated) return EDGE_OPACITY.deprecated;
    const s = e.telemetry?.lastStatus || "idle";
    let base;
    if (s === "broken") base = EDGE_OPACITY.broken;
    else if (s === "active") base = EDGE_OPACITY.active;
    else base = EDGE_OPACITY.idle;
    const gk = edgeGroupKey(e);
    if (gk && EDGE_GROUP_OPACITY[gk] !== void 0) base *= EDGE_GROUP_OPACITY[gk];
    return Math.max(0.03, base);
  }
  function edgeArrowUrl(e) {
    if (e.deprecated) return "url(#arrow-deprecated)";
    if (e.telemetry?.lastStatus === "broken") return "url(#arrow-broken)";
    return `url(#arrow-${e.type})`;
  }
  function drawEdges(g, edges, nodeMap) {
    computeEdgeOffsets(edges);
    edgeIndexMap = /* @__PURE__ */ new Map();
    edges.forEach((e, idx) => {
      const src = nodeMap.get(e.sourceId), tgt = nodeMap.get(e.targetId);
      if (!src || !tgt) return;
      edgeIndexMap.set(`${e.sourceId}\u2192${e.targetId}:${e.type}`, idx);
      const reversed = EDGE_REVERSE_VISUAL.has(e.type);
      const route = edgePath(reversed ? tgt : src, reversed ? src : tgt, _edgeOffsets[idx]);
      const eG = g.append("g").attr("class", `edge-g edge-${idx}`);
      eG.append("path").attr("class", "edge-hit").attr("d", route.d).attr("fill", "none").attr("stroke", "transparent").attr("stroke-width", 12).style("cursor", "help");
      const eStroke = edgeStrokeColor(e);
      const eOpacity = edgeOpacity(e);
      eG.append("path").attr("class", "edge-path").attr("d", route.d).attr("fill", "none").attr("stroke", eStroke).attr("stroke-width", e.deprecated ? 1 : 1.5).attr("opacity", eOpacity).style("pointer-events", "none").attr("marker-end", edgeArrowUrl(e)).attr("stroke-dasharray", e.deprecated ? "4,4" : null);
      if (e.label) {
        eG.append("text").attr("class", "edge-label").attr("x", route.lx).attr("y", route.ly).attr("text-anchor", "middle").attr("fill", e.deprecated ? STATUS_DOT.deprecated : "#555").attr("font-size", 8).text(e.label.length > 24 ? e.label.slice(0, 22) + ".." : e.label);
      }
      const hitPath = eG.select(".edge-hit");
      hitPath.on("mouseenter", (event) => {
        const typeColor = EDGE_COLORS[e.type] || EDGE_COLOR_DEFAULT;
        eG.select(".edge-path").attr("stroke-width", 3).attr("opacity", 0.9);
        const tooltipStatusColors = { active: STATUS_DOT.active, idle: "#94a3b8", broken: EDGE_STATUS.broken };
        const statusLabel = e.telemetry.lastStatus || "unknown";
        const sColor = tooltipStatusColors[statusLabel] || "#94a3b8";
        const html = `
        <div style="font-weight:600;color:${typeColor}">${e.type.toUpperCase()}</div>
        <div>${src.label} &rarr; ${tgt.label}</div>
        ${e.label ? `<div style="color:#94a3b8">${e.label}</div>` : ""}
        <div style="margin-top:4px">Fired: <b>${e.telemetry.countThisSession ?? 0}</b>x this session</div>
        ${e.telemetry.lastFired ? `<div>Last: ${new Date(e.telemetry.lastFired).toLocaleTimeString()}</div>` : ""}
        <div>Status: <b style="color:${sColor}">${statusLabel.toUpperCase()}</b></div>`;
        showTooltip(event, html);
      }).on("mousemove", (event) => {
        tooltip.style.left = event.pageX + 12 + "px";
        tooltip.style.top = event.pageY + 12 + "px";
      }).on("mouseleave", () => {
        eG.select(".edge-path").attr("stroke-width", e.deprecated ? 1 : 1.5).attr("opacity", edgeOpacity(e));
        hideTooltip();
      });
    });
  }
  function refreshEdges(g, edges, nodeMap) {
    edges.forEach((e, idx) => {
      const src = nodeMap.get(e.sourceId), tgt = nodeMap.get(e.targetId);
      if (!src || !tgt) return;
      const reversed = EDGE_REVERSE_VISUAL.has(e.type);
      const route = edgePath(reversed ? tgt : src, reversed ? src : tgt, _edgeOffsets[idx]);
      const eG = g.select(`.edge-${idx}`);
      eG.select(".edge-hit").attr("d", route.d);
      const strokeColor = edgeStrokeColor(e);
      const opacity = edgeOpacity(e);
      eG.select(".edge-path").attr("d", route.d).attr("stroke", strokeColor).attr("opacity", opacity).attr("marker-end", edgeArrowUrl(e));
      const txt = eG.select("text");
      if (!txt.empty()) txt.attr("x", route.lx).attr("y", route.ly);
    });
  }
  function drawNodes(g, nodes, edges, nodeMap) {
    for (const node of nodes) {
      const style = STYLE[node.type] || STYLE.config;
      const borderColor = style.stroke;
      const borderWidth = 2;
      const hw = node.w / 2, hh = node.h / 2;
      const ng = g.append("g").attr("class", `node-${node.id} node-group`).attr("transform", `translate(${node.x},${node.y})`).attr("cursor", "pointer").style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.5))").datum(node);
      if (node.shape === "cylinder") {
        const ry = 6;
        ng.append("rect").attr("class", "shape-main").attr("x", -hw).attr("y", -hh + ry).attr("width", node.w).attr("height", node.h - ry).attr("rx", 4).attr("fill", style.fill).attr("stroke", borderColor).attr("stroke-width", borderWidth);
        ng.append("ellipse").attr("cx", 0).attr("cy", -hh + ry).attr("rx", hw).attr("ry", ry).attr("fill", style.fill).attr("stroke", borderColor).attr("stroke-width", borderWidth);
        ng.append("ellipse").attr("cx", 0).attr("cy", hh).attr("rx", hw).attr("ry", ry).attr("fill", style.fill).attr("stroke", borderColor).attr("stroke-width", borderWidth);
      } else if (node.shape === "parallelogram") {
        const sk = 15;
        ng.append("polygon").attr("class", "shape-main").attr("points", `${-hw + sk},${-hh} ${hw + sk},${-hh} ${hw - sk},${hh} ${-hw - sk},${hh}`).attr("fill", style.fill).attr("stroke", borderColor).attr("stroke-width", borderWidth);
      } else if (node.shape === "hexagon") {
        const sx = hw * 0.25;
        ng.append("polygon").attr("class", "shape-main").attr("points", `${-hw + sx},${-hh} ${hw - sx},${-hh} ${hw},0 ${hw - sx},${hh} ${-hw + sx},${hh} ${-hw},0`).attr("fill", style.fill).attr("stroke", borderColor).attr("stroke-width", borderWidth);
      } else if (node.shape === "stadium") {
        ng.append("rect").attr("class", "shape-main").attr("x", -hw).attr("y", -hh).attr("width", node.w).attr("height", node.h).attr("rx", hh).attr("ry", hh).attr("fill", style.fill).attr("stroke", borderColor).attr("stroke-width", borderWidth);
      } else if (node.shape === "diamond") {
        ng.append("polygon").attr("class", "shape-main").attr("points", `0,${-hh} ${hw},0 0,${hh} ${-hw},0`).attr("fill", style.fill).attr("stroke", borderColor).attr("stroke-width", borderWidth);
      } else {
        ng.append("rect").attr("class", "shape-main").attr("x", -hw).attr("y", -hh).attr("width", node.w).attr("height", node.h).attr("rx", 6).attr("fill", style.fill).attr("stroke", borderColor).attr("stroke-width", borderWidth);
      }
      if (node.conceptual || node.meta?.conceptual) {
        ng.selectAll(".shape-main, rect, polygon, ellipse").attr("stroke-dasharray", "4,4");
        ng.style("opacity", "0.7");
      }
      if (node.deprecated) {
        ng.selectAll(".shape-main, rect, polygon, ellipse").attr("stroke", TIER_COLOR_DEFAULT).attr("stroke-dasharray", "6,3").attr("opacity", 0.25);
        ng.selectAll("text").attr("fill", TIER_COLOR_DEFAULT);
        ng.style("opacity", "0.3");
      } else if (node.expected && !node.signals.exists) {
        if (node.meta?.phantom) {
          ng.selectAll(".shape-main, rect, polygon, ellipse").attr("stroke-dasharray", "4,4").attr("opacity", 0.3);
        } else if (node.onDemand) {
          ng.select(".shape-main, rect, polygon, ellipse").attr("stroke-dasharray", "2,4").attr("opacity", 0.5);
        } else {
          ng.select(".shape-main, rect, polygon, ellipse").attr("stroke-dasharray", "5,3");
        }
      }
      const dotTiers = nodeTiersTouched.get(node.id);
      const sortedTiers = dotTiers ? [...dotTiers].sort() : [node.tier];
      {
        const badgeX = -hw + 6;
        const badgeY = hh - 6;
        sortedTiers.forEach((t, i) => {
          ng.append("circle").attr("class", "tier-dot").attr("cx", badgeX + i * 10).attr("cy", badgeY).attr("r", 3.5).attr("fill", TIER_COLORS[t] || TIER_COLOR_DEFAULT).attr("stroke", "#111").attr("stroke-width", 0.8);
        });
        ng.append("title").text(`Tier: ${sortedTiers.map((t) => `T${t}`).join(", ")}`);
      }
      ng.append("text").attr("text-anchor", "middle").attr("y", node.sublabel ? -4 : 4).attr("fill", style.text).attr("font-size", 11).attr("font-weight", "bold").text(node.label.length > 18 ? node.label.slice(0, 16) + ".." : node.label);
      if (node.sublabel) {
        ng.append("text").attr("text-anchor", "middle").attr("y", 10).attr("fill", style.text).attr("font-size", 9).attr("opacity", 0.7).text(node.sublabel.length > 22 ? node.sublabel.slice(0, 20) + ".." : node.sublabel);
      }
      const dotColor = statusColor(node);
      const dotG = ng.append("g").style("cursor", "help");
      dotG.append("circle").attr("class", "status-dot").attr("cx", hw - 8).attr("cy", -hh + 8).attr("r", 7).attr("fill", dotColor).attr("stroke", "#222").attr("stroke-width", 1.5);
      dotG.append("title").text(`${node.label}: ${node.signals.exists ? "exists" : "missing"}, ${node.signals.active ? "active" : "idle"}${node.meta.statusNote ? " \u2014 " + node.meta.statusNote.slice(0, 80) : ""}`);
      ng.append("text").attr("class", "live-data").attr("text-anchor", "middle").attr("y", hh + 14).attr("fill", EDGE_STATUS.pulse).attr("font-size", 9).text(node.meta.rowCount != null && (node.type === "store_db" || node.type === "store_json") ? `${node.meta.rowCount} ${node.meta.countLabel || "rows"}` : node.meta.rowCount != null && node.type === "worker" ? `${node.meta.rowCount} runs` : node.meta.fileSize ? `${(node.meta.fileSize / 1024).toFixed(1)} KB` : "");
      if (!node.expected) {
        ng.append("text").attr("x", hw - 12).attr("y", -hh + 14).attr("font-size", 10).attr("fill", OVERLAY_COLORS.unexpected).text("?");
      }
      if (node.deprecated) {
      } else if (!node.signals.exists) ng.style("opacity", "0.35");
      else if (!node.signals.active) ng.style("opacity", "0.65");
      let dragDist = 0;
      const drag = d3.drag().on("start", function(ev) {
        dragDist = 0;
        ev.sourceEvent.stopPropagation();
        d3.select(this).attr("cursor", "grabbing").raise();
        showTooltip(ev.sourceEvent, nodeTooltipHtml(node));
      }).on("drag", function(ev) {
        dragDist += Math.abs(ev.dx) + Math.abs(ev.dy);
        node.x = ev.x;
        node.y = ev.y;
        d3.select(this).attr("transform", `translate(${ev.x},${ev.y})`);
        updateDetach(node, nodes);
        refreshSubgraphs(mainG, nodes, edges, nodeMap);
        refreshEdges(mainG, edges, nodeMap);
        if (ev.sourceEvent) {
          tooltip.style.left = ev.sourceEvent.pageX + 12 + "px";
          tooltip.style.top = ev.sourceEvent.pageY + 12 + "px";
        }
      }).on("end", function() {
        d3.select(this).attr("cursor", "pointer");
        hideTooltip();
        if (dragDist < 4) {
          mainG.selectAll(".shape-main").attr("stroke-width", 2);
          d3.select(this).select(".shape-main").attr("stroke-width", 3.5);
          openSidePanel(node);
        } else {
          markDirty();
        }
      });
      ng.call(drag);
      ng.on("mouseenter", function(event) {
        d3.select(this).select(".shape-main").transition().duration(120).attr("stroke-width", 3);
        showTooltip(event, nodeTooltipHtml(node));
      }).on("mousemove", (event) => {
        tooltip.style.left = event.pageX + 12 + "px";
        tooltip.style.top = event.pageY + 12 + "px";
      }).on("mouseleave", function() {
        const sw = d3.select(this).select(".shape-main").attr("stroke-width");
        if (sw !== "3.5") d3.select(this).select(".shape-main").transition().duration(120).attr("stroke-width", 2);
        hideTooltip();
      });
    }
  }
  function render(data) {
    currentData = data;
    mainG.selectAll("*").remove();
    const nodes = data.nodes.map(enrichNode);
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    layoutNodes(nodes);
    const defs = mainG.append("defs");
    for (const [et, color] of Object.entries(EDGE_COLORS)) {
      defs.append("marker").attr("id", `arrow-${et}`).attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto-start-reverse").append("path").attr("d", "M0,0 L10,5 L0,10 Z").attr("fill", color);
    }
    defs.append("marker").attr("id", "arrow-broken").attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto-start-reverse").append("path").attr("d", "M0,0 L10,5 L0,10 Z").attr("fill", EDGE_STATUS.broken);
    defs.append("marker").attr("id", "arrow-deprecated").attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto-start-reverse").append("path").attr("d", "M0,0 L10,5 L0,10 Z").attr("fill", EDGE_STATUS.deprecated);
    for (const [status, color] of Object.entries(STATUS_PULSE_COLORS)) {
      defs.append("marker").attr("id", `arrow-pulse-${status}`).attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto-start-reverse").append("path").attr("d", "M0,0 L10,5 L0,10 Z").attr("fill", color);
    }
    const glowF = defs.append("filter").attr("id", "edge-glow").attr("filterUnits", "userSpaceOnUse").attr("x", "-50%").attr("y", "-50%").attr("width", "200%").attr("height", "200%");
    glowF.append("feGaussianBlur").attr("in", "SourceGraphic").attr("stdDeviation", 2.5).attr("result", "blur");
    const glowM = glowF.append("feMerge");
    glowM.append("feMergeNode").attr("in", "blur");
    glowM.append("feMergeNode").attr("in", "SourceGraphic");
    defs.append("marker").attr("id", "arrow-active").attr("viewBox", "0 0 10 10").attr("refX", 10).attr("refY", 5).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto-start-reverse").append("path").attr("d", "M0,0 L10,5 L0,10 Z").attr("fill", EDGE_STATUS.pulse);
    nodeTiersTouched = /* @__PURE__ */ new Map();
    for (const n of nodes) {
      nodeTiersTouched.set(n.id, /* @__PURE__ */ new Set([n.tier]));
    }
    for (const e of data.edges) {
      const src = nodeMap.get(e.sourceId), tgt = nodeMap.get(e.targetId);
      if (src && tgt && src.tier !== tgt.tier) {
        nodeTiersTouched.get(src.id).add(tgt.tier);
        nodeTiersTouched.get(tgt.id).add(src.tier);
      }
    }
    for (const n of nodes) {
      if (n.type === "trigger") n.sublabel = nodeSublabel(n);
    }
    for (const [nid, tiers] of nodeTiersTouched) {
      if (tiers.size < 2) continue;
      const sorted = [...tiers].sort();
      const gradId = `grad-${sorted.join("-")}`;
      if (!defs.select(`#${gradId}`).empty()) continue;
      const grad = defs.append("linearGradient").attr("id", gradId).attr("x1", "0%").attr("y1", "0%").attr("x2", "100%").attr("y2", "100%");
      const colors = sorted.map((t) => TIER_COLORS[t] || TIER_COLOR_DEFAULT);
      const step = 100 / colors.length;
      colors.forEach((c, i) => {
        grad.append("stop").attr("offset", `${i * step}%`).attr("stop-color", c);
        grad.append("stop").attr("offset", `${(i + 1) * step}%`).attr("stop-color", c);
      });
    }
    drawSubgraphs(mainG, nodes, data.edges, nodeMap);
    edgeLayer = mainG.append("g").attr("class", "layer-edges");
    nodeLayer = mainG.append("g").attr("class", "layer-nodes");
    activeEdgeLayer = mainG.append("g").attr("class", "layer-active-edges");
    drawEdges(edgeLayer, data.edges, nodeMap);
    drawNodes(nodeLayer, nodes, data.edges, nodeMap);
    for (const [layer, y] of Object.entries(LAYER_Y)) {
      const label = LAYER_LABELS[Number(layer)];
      if (!label) continue;
      mainG.append("text").attr("x", -nodes.length * 85 - 60).attr("y", y + 4).attr("fill", "#333").attr("font-size", 10).attr("font-weight", 600).text(label);
    }
    updateSummaryBar(data);
  }
  var _healthCache = null;
  function refreshHealthCache() {
    fetch("/api/daemon-health").then((r) => r.json()).then((d) => {
      _healthCache = d;
      if (currentData) updateSummaryBar(currentData);
    }).catch(() => {
    });
  }
  refreshHealthCache();
  setInterval(refreshHealthCache, 15e3);
  function updateSummaryBar(data) {
    const tierLabels = ["", "T1 Reactive", "T2 Adaptive", "T3 Deliberative"];
    const tierTips = [
      "",
      "T1 Reactive: CJS hooks layer (intelligence.cjs, PageRank, JSON files). Fast (<15ms), self-contained.",
      "T2 Adaptive: 28 AgentDB controllers across 6 levels. ESM, memory-bridge, memory.db.",
      "T3 Deliberative: ruvector IntelligenceEngine, HNSW vector index, ONNX 384D embeddings."
    ];
    let html = "";
    for (let t = 1; t <= 3; t++) {
      const tier = data.summary.tiers[t];
      if (!tier) continue;
      html += `<div class="tier" title="${tierTips[t]} ${tier.activeCount} of ${tier.nodeCount} active."><span class="tier-dot ${tier.status}"></span>${tierLabels[t]}: ${tier.activeCount}/${tier.nodeCount}</div>`;
    }
    {
      const h = _healthCache;
      if (h) {
        const p = h.pipeline || {};
        const q = h.qtable || {};
        const daemonList = Object.entries(h.daemons || {});
        const daemonTip = daemonList.map(([k, v]) => `${v ? "\u2713" : "\u2717"} ${k}`).join(", ");
        const badges = daemonList.map(([k, v]) => {
          const on = !!v;
          const c = on ? "#22c55e" : "#ef4444";
          const dot = on ? "\u25CF" : "\u25CB";
          const short = k.replace("-daemon", "").replace("-monitor", "-mon");
          return `<span style="color:${c}" title="${k}: ${on ? "RUNNING" : "STOPPED"}">${dot} ${short}</span>`;
        }).join(" ");
        html += `<div class="tier" title="Daemons: ${daemonTip}">${badges}</div>`;
        html += `<div class="tier"><span title="Total bridge operations (T2 writes, consolidations, L1 promotions)">ops:${p.totalPipelineOps || 0}</span> &middot; <span title="Q-table routing patterns (state-action pairs)">Q:${q.entries || 0}</span> &middot; <span title="Vector memories in ruvector.db (HNSW search)">mem:${q.memories || 0}</span></div>`;
      }
    }
    html += `<div class="tier" style="margin-left:auto"><span title="Nodes found on disk">${data.summary.foundCount} found</span> &middot; <span title="Expected nodes not found (red dots)">${data.summary.missingCount} missing</span> &middot; <span title="Last refresh">${(/* @__PURE__ */ new Date()).toLocaleTimeString()}</span></div>`;
    const bar = document.getElementById("summary-bar");
    if (bar) bar.innerHTML = html;
  }
  function applyEdgeVisual(idx, energy, now) {
    const eG = mainG.select(`.edge-${idx}`);
    if (eG.empty()) return;
    const path = eG.select(".edge-path");
    if (!path.node()) return;
    if (energy <= 0) {
      const d = currentData?.edges[idx];
      const restColor = d ? edgeStrokeColor(d) : EDGE_COLOR_DEFAULT;
      const restOpacity = d ? edgeOpacity(d) : EDGE_OPACITY.idle;
      path.attr("stroke", restColor).attr("stroke-width", d?.deprecated ? 1 : 1.5).attr("stroke-dasharray", d?.deprecated ? "4,4" : "none").attr("stroke-dashoffset", 0).attr("filter", null).attr("opacity", restOpacity).attr("marker-end", d ? edgeArrowUrl(d) : "url(#arrow-calls)");
      eG.select(".edge-hit").attr("stroke", "transparent").attr("filter", null);
      if (raisedEdges.has(idx) && edgeLayer) {
        edgeLayer.node().appendChild(eG.node());
      }
      return;
    }
    const brightness = 0.5 + energy * 0.5;
    const width = 1.5 + energy * 2.5;
    const offset = -(now * 0.04) % 24;
    if (!raisedEdges.has(idx)) {
      raisedEdges.add(idx);
      if (activeEdgeLayer) activeEdgeLayer.node().appendChild(eG.node());
      else eG.raise();
    }
    const pulseColor = edgePulseColor.get(idx) || EDGE_STATUS.pulse;
    const arrowId = Object.entries(STATUS_PULSE_COLORS).find(([, c]) => c === pulseColor)?.[0];
    const markerRef = arrowId ? `url(#arrow-pulse-${arrowId})` : "url(#arrow-active)";
    path.attr("stroke", pulseColor).attr("stroke-width", width).attr("stroke-dasharray", "8,4").attr("stroke-dashoffset", offset).attr("filter", energy > 0.1 ? "url(#edge-glow)" : null).attr("opacity", brightness).attr("marker-end", markerRef);
  }
  function applyNodeVisual(nodeId, energy, now) {
    const nG = mainG.select(`.node-${nodeId}`);
    if (nG.empty()) return;
    const shape = nG.select(".shape-main");
    if (!shape.node()) return;
    const node = nG.datum();
    if (energy <= 0) {
      if (node) {
        const style = STYLE[node.type] || STYLE.config;
        shape.attr("stroke", style.stroke).attr("stroke-width", 2);
      }
      nG.style("filter", "drop-shadow(0 2px 4px rgba(0,0,0,0.5))");
      if (node && node.x != null && node.y != null) {
        nG.attr("transform", `translate(${node.x},${node.y})`);
      }
      return;
    }
    const glowIntensity = 0.4 + energy * 0.6;
    const strokeW = 2 + energy * 2.5;
    const scale = 1 + energy * 0.03 * Math.sin(now * 6e-3);
    shape.attr("stroke", EDGE_STATUS.pulse).attr("stroke-width", strokeW);
    nG.style("filter", energy > 0.1 ? `drop-shadow(0 0 ${4 + energy * 8}px rgba(34,211,238,${glowIntensity}))` : "drop-shadow(0 2px 4px rgba(0,0,0,0.5))");
    const d = nG.datum();
    if (d?.x != null && d?.y != null) {
      nG.attr("transform", `translate(${d.x},${d.y}) scale(${scale.toFixed(4)})`);
    }
  }
  function startEnergyLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    let lastFrame = 0;
    const loop = (now) => {
      rafId = requestAnimationFrame(loop);
      if (now - lastFrame < 33) return;
      lastFrame = now;
      if (edgeEnergy.size === 0 && nodeEnergy.size === 0) return;
      for (const [idx, energy] of edgeEnergy) {
        const next = energy * 0.982;
        if (next < 0.02) {
          edgeEnergy.delete(idx);
          edgePulseColor.delete(idx);
          applyEdgeVisual(idx, 0, now);
          raisedEdges.delete(idx);
        } else {
          edgeEnergy.set(idx, next);
          applyEdgeVisual(idx, next, now);
        }
      }
      for (const [nid, energy] of nodeEnergy) {
        const next = energy * 0.978;
        if (next < 0.02) {
          nodeEnergy.delete(nid);
          applyNodeVisual(nid, 0, now);
        } else {
          nodeEnergy.set(nid, next);
          applyNodeVisual(nid, next, now);
        }
      }
    };
    rafId = requestAnimationFrame(loop);
  }
  var firstPoll = true;
  async function pollTranscript() {
    if (!edgeIndexMap) return;
    try {
      let url;
      if (pulseScope === "all") {
        url = "/api/activity-stream?scope=all&tail=1";
      } else if (firstPoll) {
        url = "/api/activity-stream?tail=1&skip=1";
      } else {
        url = `/api/activity-stream?offset=${transcriptOffset}`;
      }
      firstPoll = false;
      const data = await (await fetch(url)).json();
      if (data.offset) transcriptOffset = data.offset;
      if (!data.skipped && data.lines?.length) processLines(data.lines);
    } catch {
    }
  }
  function resetEdgeLayers() {
    if (edgeLayer && activeEdgeLayer) {
      for (const idx of raisedEdges) {
        const eG = mainG.select(`.edge-${idx}`);
        if (!eG.empty()) edgeLayer.node().appendChild(eG.node());
      }
    }
    raisedEdges.clear();
  }
  function startPulseSystem() {
    if (pulseTimer) clearInterval(pulseTimer);
    edgeEnergy.clear();
    nodeEnergy.clear();
    resetEdgeLayers();
    _processedLineHashes.clear();
    _signalPulsedNodes.clear();
    firstPoll = true;
    transcriptOffset = 0;
    startEnergyLoop();
    pollTranscript();
    pulseTimer = setInterval(pollTranscript, 1500);
  }
  function markDirty() {
    const btn = document.getElementById("save-layout-btn");
    if (btn) btn.classList.add("dirty");
  }
  async function saveLayout() {
    if (!currentData) return;
    const positions = {};
    for (const n of currentData.nodes) {
      if (n.x != null && n.y != null) positions[n.id] = { x: n.x, y: n.y };
    }
    savedPositions = positions;
    const t = d3.zoomTransform(svg.node());
    const transform = { x: t.x, y: t.y, k: t.k };
    try {
      await fetch("/api/layout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positions, detached: [...detachedNodes], transform })
      });
      const btn = document.getElementById("save-layout-btn");
      if (btn) {
        btn.classList.remove("dirty");
        btn.textContent = "\u2713 Saved";
        setTimeout(() => {
          btn.textContent = "Save Layout";
        }, 1200);
      }
    } catch {
    }
  }
  async function resetLayout() {
    try {
      const lr = await fetch("/api/layout");
      const ld = await lr.json();
      if (ld.positions && Object.keys(ld.positions).length > 0) {
        savedPositions = ld.positions;
        detachedNodes.clear();
        satelliteGroups.clear();
        liveSatelliteSvgs.clear();
        if (Array.isArray(ld.detached)) {
          for (const id of ld.detached) detachedNodes.add(id);
        }
        if (currentData) render(currentData);
        if (detachedNodes.size > 0 && currentData) {
          const groups = new Set(currentData.nodes.filter((n) => detachedNodes.has(n.id)).map((n) => n.group));
          for (const g of groups) rebuildSatellites(g, currentData.nodes);
          refreshSubgraphs(
            mainG,
            currentData.nodes,
            currentData.edges,
            new Map(currentData.nodes.map((n) => [n.id, n]))
          );
        }
        if (ld.transform && typeof ld.transform.k === "number") {
          const t = d3.zoomIdentity.translate(ld.transform.x, ld.transform.y).scale(ld.transform.k);
          svg.call(zoomBehavior.transform, t);
        }
        return;
      }
    } catch {
    }
    savedPositions = {};
    detachedNodes.clear();
    satelliteGroups.clear();
    liveSatelliteSvgs.clear();
    if (svg && zoomBehavior) svg.call(zoomBehavior.transform, d3.zoomIdentity);
    if (currentData) render(currentData);
  }
  function toggleBoxes() {
    showBoxes = !showBoxes;
    if (!mainG) return;
    for (const sg of SUBGRAPHS) {
      mainG.select(`.sg-${sg.id}`).select(".sg-bg").attr("opacity", showBoxes ? 0.3 : 0);
      mainG.select(`.sg-${sg.id}`).select(".sg-label").attr("opacity", showBoxes ? 1 : 0);
    }
    mainG.selectAll(".satellite-group").attr("display", showBoxes ? null : "none");
  }
  function togglePulseScope() {
    pulseScope = pulseScope === "project" ? "all" : "project";
    firstPoll = true;
    transcriptOffset = 0;
    edgeEnergy.clear();
    nodeEnergy.clear();
    resetEdgeLayers();
    _cascadeVisited.clear();
    _processedLineHashes.clear();
    _signalPulsedNodes.clear();
    return pulseScope;
  }
  async function replaySession() {
    if (!edgeIndexMap) return;
    edgeEnergy.clear();
    nodeEnergy.clear();
    resetEdgeLayers();
    _cascadeVisited.clear();
    _processedLineHashes.clear();
    _signalPulsedNodes.clear();
    try {
      const url = pulseScope === "all" ? "/api/activity-stream?scope=all&tail=1" : "/api/activity-stream?tail=1";
      const data = await (await fetch(url)).json();
      if (data.offset) transcriptOffset = data.offset;
      if (data.lines?.length) processLines(data.lines);
    } catch {
    }
  }
  function isNodeHidden(n) {
    if (hiddenGroups.has(n.group)) return true;
    if (hiddenNodes.has(n.id)) return true;
    if (!showExpected && n.expected) return true;
    if (!showUnexpected && !n.expected) return true;
    if (hiddenTiers.has(n.tier)) return true;
    return false;
  }
  function applyVisibility() {
    if (!mainG || !currentData) return;
    const nodeMap = new Map(currentData.nodes.map((n) => [n.id, n]));
    for (const node of currentData.nodes) {
      mainG.select(`.node-${node.id}`).attr("display", isNodeHidden(node) ? "none" : null);
    }
    currentData.edges.forEach((edge, idx) => {
      const src = nodeMap.get(edge.sourceId), tgt = nodeMap.get(edge.targetId);
      const srcHidden = src && isNodeHidden(src);
      const tgtHidden = tgt && isNodeHidden(tgt);
      mainG.select(`.edge-${idx}`).attr("display", srcHidden || tgtHidden ? "none" : null);
    });
    for (const sg of SUBGRAPHS) {
      const members = currentData.nodes.filter((n) => n.group === sg.id);
      const allHidden = hiddenGroups.has(sg.id) || members.every((n) => isNodeHidden(n));
      mainG.select(`.sg-${sg.id}`).attr("display", allHidden ? "none" : null);
    }
  }
  function buildFilterTree() {
    if (!filterPanel || !currentData) return;
    filterPanel.innerHTML = "";
    const nodes = currentData.nodes;
    const header = document.createElement("div");
    header.style.cssText = "margin-bottom:10px";
    header.innerHTML = `<div style="font-size:12px;font-weight:bold;color:#f8fafc;margin-bottom:8px">Layers</div>`;
    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display:flex;gap:1px;background:#334155;border-radius:6px;overflow:hidden";
    for (const [label, action] of [
      ["All On", () => {
        hiddenGroups.clear();
        hiddenNodes.clear();
        hiddenTiers.clear();
        showExpected = true;
        showUnexpected = true;
        buildFilterTree();
        applyVisibility();
      }],
      ["All Off", () => {
        for (const cat of FILTER_CATEGORIES) for (const g of cat.groups) hiddenGroups.add(g.id);
        hiddenTiers.add(0);
        hiddenTiers.add(1);
        hiddenTiers.add(2);
        hiddenTiers.add(3);
        hiddenTiers.add(9);
        showExpected = false;
        showUnexpected = false;
        buildFilterTree();
        applyVisibility();
      }],
      ["Expand", () => {
        for (const cat of FILTER_CATEGORIES) {
          openCategories.add(cat.label);
          for (const g of cat.groups) openNodeLists.add(g.id);
        }
        buildFilterTree();
      }],
      ["Collapse", () => {
        openCategories.clear();
        openNodeLists.clear();
        buildFilterTree();
      }]
    ]) {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "flex:1;background:#1e293b;color:#94a3b8;border:none;padding:5px 2px;font-size:9px;cursor:pointer;font-family:inherit";
      b.addEventListener("mouseenter", () => {
        b.style.background = "#334155";
        b.style.color = "#f8fafc";
      });
      b.addEventListener("mouseleave", () => {
        b.style.background = "#1e293b";
        b.style.color = "#94a3b8";
      });
      b.addEventListener("click", action);
      btnRow.appendChild(b);
    }
    header.appendChild(btnRow);
    filterPanel.appendChild(header);
    const div1 = document.createElement("div");
    div1.style.cssText = "height:1px;background:#334155;margin-bottom:8px";
    filterPanel.appendChild(div1);
    const tierEl = document.createElement("div");
    tierEl.style.cssText = "margin-bottom:10px";
    tierEl.innerHTML = `<div style="font-size:11px;font-weight:bold;color:#f8fafc;margin-bottom:6px">Cycles</div>`;
    const tierDefs = [
      [0, "T0 Infrastructure", TIER_COLORS[0] || TIER_COLOR_DEFAULT, "Shared infra: memory DB, daemon, viz"],
      [1, "T1 Reactive", TIER_COLORS[1], "Hook-driven, <1ms, PageRank context"],
      [2, "T2 Adaptive", TIER_COLORS[2], "Online learning, ONNX, ~100ms"],
      [3, "T3 Deliberative", TIER_COLORS[3], "Reasoning, MCP, ControllerRegistry"],
      [9, "CLI / Utilities", TIER_COLORS[9], "Unexpected scripts, not in registry"]
    ];
    for (const [tier, label, color, desc] of tierDefs) {
      const count = nodes.filter((n) => n.tier === tier).length;
      if (count === 0) continue;
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:6px;padding:2px 0";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !hiddenTiers.has(tier);
      cb.style.cssText = `accent-color:${color};cursor:pointer;width:12px;height:12px`;
      cb.addEventListener("change", () => {
        if (cb.checked) hiddenTiers.delete(tier);
        else hiddenTiers.add(tier);
        applyVisibility();
        buildFilterTree();
      });
      row.appendChild(cb);
      const dot = document.createElement("span");
      dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}`;
      row.appendChild(dot);
      const lbl = document.createElement("span");
      lbl.style.cssText = `font-size:10px;color:${!hiddenTiers.has(tier) ? color : "#555"}`;
      lbl.title = desc;
      lbl.textContent = `${label} (${count})`;
      row.appendChild(lbl);
      tierEl.appendChild(row);
    }
    filterPanel.appendChild(tierEl);
    const divT = document.createElement("div");
    divT.style.cssText = "height:1px;background:#334155;margin-bottom:8px";
    filterPanel.appendChild(divT);
    const statusEl = document.createElement("div");
    statusEl.style.cssText = "margin-bottom:10px";
    statusEl.innerHTML = `<div style="font-size:11px;font-weight:bold;color:#f8fafc;margin-bottom:6px">Status</div>`;
    const expCount = nodes.filter((n) => n.expected).length;
    const unexpCount = nodes.filter((n) => !n.expected).length;
    for (const [label, count, color, getter, setter] of [
      ["Expected", expCount, STATUS_DOT.active, () => showExpected, (v) => {
        showExpected = v;
      }],
      ["Unexpected", unexpCount, "#06b6d4", () => showUnexpected, (v) => {
        showUnexpected = v;
      }]
    ]) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:6px;padding:2px 0";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = getter();
      cb.style.cssText = `accent-color:${color};cursor:pointer;width:12px;height:12px`;
      cb.addEventListener("change", () => {
        setter(cb.checked);
        applyVisibility();
        buildFilterTree();
      });
      row.appendChild(cb);
      const dot = document.createElement("span");
      dot.style.cssText = `display:inline-block;width:8px;height:8px;border-radius:50%;background:${color}`;
      row.appendChild(dot);
      const lbl = document.createElement("span");
      lbl.style.cssText = `font-size:10px;color:${getter() ? color : "#555"}`;
      lbl.textContent = `${label} (${count})`;
      row.appendChild(lbl);
      statusEl.appendChild(row);
    }
    filterPanel.appendChild(statusEl);
    const div2 = document.createElement("div");
    div2.style.cssText = "height:1px;background:#334155;margin-bottom:8px";
    filterPanel.appendChild(div2);
    for (const cat of FILTER_CATEGORIES) {
      const catEl = document.createElement("div");
      catEl.style.cssText = "margin-bottom:6px";
      const catHeader = document.createElement("div");
      catHeader.style.cssText = "display:flex;align-items:center;gap:4px;cursor:pointer;padding:3px 0;color:#f8fafc;font-size:11px;font-weight:bold";
      const arrow = document.createElement("span");
      arrow.style.cssText = "font-size:8px;transition:transform 0.2s;display:inline-block";
      arrow.textContent = "\u25B6";
      catHeader.appendChild(arrow);
      catHeader.appendChild(document.createTextNode(cat.label));
      const catOpen = openCategories.has(cat.label);
      const catBody = document.createElement("div");
      catBody.style.cssText = `display:${catOpen ? "block" : "none"};padding-left:8px`;
      if (catOpen) arrow.style.transform = "rotate(90deg)";
      catHeader.addEventListener("click", () => {
        const isOpen = openCategories.has(cat.label);
        if (isOpen) openCategories.delete(cat.label);
        else openCategories.add(cat.label);
        catBody.style.display = isOpen ? "none" : "block";
        arrow.style.transform = isOpen ? "" : "rotate(90deg)";
      });
      catEl.appendChild(catHeader);
      for (const grp of cat.groups) {
        const members = nodes.filter((n) => n.group === grp.id);
        if (members.length === 0) continue;
        const groupHidden = hiddenGroups.has(grp.id);
        const hiddenCount = members.filter((n) => hiddenNodes.has(n.id)).length;
        const grpRow = document.createElement("div");
        grpRow.style.cssText = "display:flex;align-items:center;gap:4px;padding:2px 0";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !groupHidden;
        cb.indeterminate = !groupHidden && hiddenCount > 0 && hiddenCount < members.length;
        cb.style.cssText = `accent-color:${grp.color};cursor:pointer;width:12px;height:12px`;
        cb.addEventListener("change", () => {
          if (cb.checked) {
            hiddenGroups.delete(grp.id);
            for (const m of members) hiddenNodes.delete(m.id);
          } else hiddenGroups.add(grp.id);
          applyVisibility();
          buildFilterTree();
        });
        grpRow.appendChild(cb);
        const grpLabel = document.createElement("span");
        grpLabel.style.cssText = `font-size:10px;color:${groupHidden ? "#555" : grp.color};cursor:pointer;flex:1`;
        grpLabel.textContent = `${grp.label} (${members.length})`;
        grpRow.appendChild(grpLabel);
        const nodeArrow = document.createElement("span");
        nodeArrow.style.cssText = "font-size:7px;color:#94a3b8;cursor:pointer;padding:2px 4px";
        nodeArrow.textContent = "\u25B6";
        grpRow.appendChild(nodeArrow);
        catBody.appendChild(grpRow);
        const nlOpen = openNodeLists.has(grp.id);
        const nodeList = document.createElement("div");
        nodeList.style.cssText = `display:${nlOpen ? "block" : "none"};padding-left:20px`;
        if (nlOpen) nodeArrow.style.transform = "rotate(90deg)";
        const toggleNL = (e) => {
          e.stopPropagation();
          const isOpen = openNodeLists.has(grp.id);
          if (isOpen) openNodeLists.delete(grp.id);
          else openNodeLists.add(grp.id);
          nodeList.style.display = isOpen ? "none" : "block";
          nodeArrow.style.transform = isOpen ? "" : "rotate(90deg)";
        };
        nodeArrow.addEventListener("click", toggleNL);
        grpLabel.addEventListener("click", toggleNL);
        for (const node of members) {
          const nodeHidden = groupHidden || hiddenNodes.has(node.id);
          const nodeRow = document.createElement("div");
          nodeRow.style.cssText = "display:flex;align-items:center;gap:4px;padding:1px 0";
          const ncb = document.createElement("input");
          ncb.type = "checkbox";
          ncb.checked = !nodeHidden;
          ncb.disabled = groupHidden;
          ncb.style.cssText = "cursor:pointer;width:10px;height:10px";
          ncb.addEventListener("change", () => {
            if (ncb.checked) hiddenNodes.delete(node.id);
            else hiddenNodes.add(node.id);
            applyVisibility();
            buildFilterTree();
          });
          nodeRow.appendChild(ncb);
          const style = STYLE[node.type] || STYLE.config;
          const dot = document.createElement("span");
          dot.style.cssText = `display:inline-block;width:6px;height:6px;border-radius:50%;background:${nodeHidden ? "#444" : style.stroke}`;
          nodeRow.appendChild(dot);
          const nlbl = document.createElement("span");
          nlbl.style.cssText = `font-size:9px;color:${nodeHidden ? "#555" : "#94a3b8"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px`;
          nlbl.textContent = node.sublabel ? `${node.label} ${node.sublabel}` : node.label;
          nodeRow.appendChild(nlbl);
          if (!node.expected) {
            const badge = document.createElement("span");
            badge.style.cssText = "font-size:7px;color:#06b6d4;margin-left:2px";
            badge.textContent = "?";
            badge.title = "Unexpected \u2014 not in architecture registry";
            nodeRow.appendChild(badge);
          }
          nodeList.appendChild(nodeRow);
        }
        catBody.appendChild(nodeList);
      }
      catEl.appendChild(catBody);
      filterPanel.appendChild(catEl);
    }
  }
  var filterVisible = false;
  var FILTER_CSS = "position:absolute;top:94px;right:8px;z-index:7;background:#1e293bee;border:1px solid #334155;border-radius:8px;padding:12px 16px;font-size:11px;color:#e2e8f0;width:240px;box-shadow:0 4px 16px rgba(0,0,0,0.5);max-height:calc(100vh - 200px);overflow-y:auto;display:none;";
  function toggleFilter() {
    if (!filterPanel) {
      filterPanel = document.createElement("div");
      filterPanel.id = "graph-filter";
      document.getElementById("graph-view").appendChild(filterPanel);
    }
    filterPanel.style.cssText = FILTER_CSS;
    filterVisible = !filterVisible;
    if (filterVisible) {
      if (legendVisible) {
        legendVisible = false;
        const legend = document.getElementById("graph-legend");
        if (legend) legend.style.display = "none";
        document.getElementById("legend-btn")?.classList.remove("active");
      }
      buildFilterTree();
    }
    filterPanel.style.display = filterVisible ? "block" : "none";
  }
  var legendVisible = false;
  function toggleLegend() {
    legendVisible = !legendVisible;
    if (legendVisible) {
      if (filterVisible) {
        filterVisible = false;
        if (filterPanel) filterPanel.style.display = "none";
        document.getElementById("filter-btn")?.classList.remove("active");
      }
    }
    let panel = document.getElementById("graph-legend");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "graph-legend";
      panel.style.cssText = `
      position:absolute; top:94px; right:8px; z-index:6;
      background:#1e293bee; border:1px solid #334155; border-radius:8px;
      padding:12px 16px; font-size:11px; color:#e2e8f0; width:240px;
      box-shadow:0 4px 16px rgba(0,0,0,0.5); max-height:calc(100vh - 200px); overflow-y:auto;
    `;
      document.getElementById("graph-view").appendChild(panel);
    }
    buildLegendPanel(panel);
    panel.style.display = legendVisible ? "block" : "none";
  }
  function buildLegendPanel(panel) {
    const pickerCSS = "width:20px;height:14px;border:1px solid #555;border-radius:2px;padding:0;cursor:pointer;background:none;";
    const rowCSS = "display:flex;align-items:center;gap:6px;margin-bottom:3px";
    let html = '<div style="font-weight:600;margin-bottom:8px;font-size:12px;color:#f8fafc">Legend <span style="color:#64748b;font-weight:400">(editable)</span></div>';
    html += '<div style="font-weight:600;margin-bottom:4px;color:#94a3b8">Node Types</div>';
    const nodeTypes = [
      { type: "trigger", shape: "parallelogram", label: "Hook Trigger" },
      { type: "script", shape: "rect", label: "Hook Script" },
      { type: "engine", shape: "rect", label: "Engine" },
      { type: "store_db", shape: "cylinder", label: "Database" },
      { type: "store_json", shape: "rect", label: "JSON Store" },
      { type: "config", shape: "rect", label: "Config" },
      { type: "model", shape: "rect", label: "Model" },
      { type: "service", shape: "rect", label: "MCP Service" }
    ];
    for (const nt of nodeTypes) {
      const s = STYLE[nt.type];
      let shapeStyle = `display:inline-block;width:16px;height:10px;background:${s.fill};border:2px solid ${s.stroke};`;
      if (nt.shape === "parallelogram") shapeStyle += "transform:skewX(-12deg);border-radius:2px;";
      else if (nt.shape === "cylinder") shapeStyle += "border-radius:50%/25%;";
      else shapeStyle += "border-radius:2px;";
      html += `<div style="${rowCSS}"><span style="${shapeStyle}"></span><span style="color:${s.text}">${nt.label}</span></div>`;
    }
    html += '<div style="font-weight:600;margin:8px 0 4px;color:#94a3b8">Edge Types</div>';
    const edgeTypeKeys = ["fires", "calls", "reads", "writes", "uses", "loads", "configures"];
    const edgeTypeLabels = { fires: "Fires", calls: "Calls", reads: "Reads", writes: "Writes", uses: "Uses", loads: "Loads", configures: "Configures" };
    for (const et of edgeTypeKeys) {
      html += `<div style="${rowCSS}"><input type="color" id="lp-edge-${et}" value="${EDGE_COLORS[et]}" style="${pickerCSS}" /><span>${edgeTypeLabels[et]}</span></div>`;
    }
    html += `<div style="${rowCSS}"><input type="color" id="lp-pulse" value="${EDGE_STATUS.pulse}" style="${pickerCSS}" /><span>Active (pulse)</span></div>`;
    html += `<div style="${rowCSS}"><input type="color" id="lp-broken" value="${EDGE_STATUS.broken}" style="${pickerCSS}" /><span>Broken</span></div>`;
    html += '<div style="font-weight:600;margin:8px 0 4px;color:#94a3b8">Edge Opacity</div>';
    const opacityKeys = ["active", "idle", "broken", "deprecated"];
    const opacityLabels = { active: "Active", idle: "Idle", broken: "Broken", deprecated: "Deprecated" };
    for (const ok of opacityKeys) {
      const pct = Math.round(EDGE_OPACITY[ok] * 100);
      html += `<div style="${rowCSS}">
      <input type="range" id="lp-op-${ok}" min="5" max="100" value="${pct}" style="width:50px;height:10px;cursor:pointer;accent-color:#64748b" />
      <span id="lp-op-${ok}-val" style="width:24px;text-align:right;color:#94a3b8">${pct}%</span>
      <span>${opacityLabels[ok]}</span>
    </div>`;
    }
    html += '<div style="font-weight:600;margin:8px 0 4px;color:#94a3b8">Group Opacity</div>';
    const groupKeys = ["workers", "controllers"];
    const groupLabels = { workers: "CLI Tools", controllers: "ADR-053 Controllers" };
    for (const gk of groupKeys) {
      const pct = Math.round((EDGE_GROUP_OPACITY[gk] ?? 1) * 100);
      html += `<div style="${rowCSS}">
      <input type="range" id="lp-gop-${gk}" min="0" max="100" value="${pct}" style="width:50px;height:10px;cursor:pointer;accent-color:#60a5fa" />
      <span id="lp-gop-${gk}-val" style="width:24px;text-align:right;color:#94a3b8">${pct}%</span>
      <span>${groupLabels[gk]}</span>
    </div>`;
    }
    html += '<div style="font-weight:600;margin:8px 0 4px;color:#94a3b8">Tier Dots</div>';
    html += `<div style="font-size:9px;color:#64748b;margin-bottom:4px">Colored dots at each node's bottom-left</div>`;
    const tierDefs = [
      { tier: 0, label: "T0 \u2014 Infrastructure" },
      { tier: 1, label: "T1 \u2014 Reactive" },
      { tier: 2, label: "T2 \u2014 Adaptive" },
      { tier: 3, label: "T3 \u2014 Deliberative" },
      { tier: 9, label: "T9 \u2014 Unexpected" }
    ];
    for (const td of tierDefs) {
      html += `<div style="${rowCSS}">
      <input type="color" id="lp-tier-${td.tier}" value="${TIER_COLORS[td.tier]}" style="${pickerCSS}" />
      <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${TIER_COLORS[td.tier]};border:1px solid #333"></span>
      <span>${td.label}</span>
    </div>`;
    }
    html += '<div style="font-weight:600;margin:8px 0 4px;color:#94a3b8">Status Dot</div>';
    const dotKeys = ["active", "idle", "unhealthy", "missing", "onDemand", "phantom", "deprecated"];
    const dotLabels = { active: "Active", idle: "Idle", unhealthy: "Unhealthy", missing: "Missing", onDemand: "On-demand", phantom: "Phantom", deprecated: "Deprecated" };
    for (const dk of dotKeys) {
      html += `<div style="${rowCSS}">
      <input type="color" id="lp-dot-${dk}" value="${STATUS_DOT[dk]}" style="${pickerCSS}" />
      <span>${dotLabels[dk]}</span>
    </div>`;
    }
    html += `<div style="margin-top:12px;display:flex;gap:6px">
    <button id="lp-save" style="flex:1;padding:4px 8px;background:#1d4ed8;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:10px">Save Theme</button>
    <button id="lp-reset" style="flex:1;padding:4px 8px;background:#334155;color:#e2e8f0;border:none;border-radius:4px;cursor:pointer;font-size:10px">Reset</button>
  </div>
  <div id="lp-status" style="margin-top:4px;font-size:9px;color:#64748b;text-align:center"></div>`;
    panel.innerHTML = html;
    for (const et of edgeTypeKeys) {
      const el = document.getElementById(`lp-edge-${et}`);
      if (el) el.addEventListener("input", () => {
        EDGE_COLORS[et] = el.value;
        applyThemeLive();
      });
    }
    const pulseEl = document.getElementById("lp-pulse");
    if (pulseEl) pulseEl.addEventListener("input", () => {
      EDGE_STATUS.pulse = pulseEl.value;
      applyThemeLive();
    });
    const brokenEl = document.getElementById("lp-broken");
    if (brokenEl) brokenEl.addEventListener("input", () => {
      EDGE_STATUS.broken = brokenEl.value;
      applyThemeLive();
    });
    for (const ok of opacityKeys) {
      const el = document.getElementById(`lp-op-${ok}`);
      const valEl = document.getElementById(`lp-op-${ok}-val`);
      if (el) el.addEventListener("input", () => {
        EDGE_OPACITY[ok] = parseInt(el.value) / 100;
        if (valEl) valEl.textContent = el.value + "%";
        applyThemeLive();
      });
    }
    for (const gk of groupKeys) {
      const el = document.getElementById(`lp-gop-${gk}`);
      const valEl = document.getElementById(`lp-gop-${gk}-val`);
      if (el) el.addEventListener("input", () => {
        EDGE_GROUP_OPACITY[gk] = parseInt(el.value) / 100;
        if (valEl) valEl.textContent = el.value + "%";
        applyThemeLive();
      });
    }
    for (const td of tierDefs) {
      const el = document.getElementById(`lp-tier-${td.tier}`);
      if (el) el.addEventListener("input", () => {
        TIER_COLORS[td.tier] = el.value;
        applyThemeLive();
      });
    }
    for (const dk of dotKeys) {
      const el = document.getElementById(`lp-dot-${dk}`);
      if (el) el.addEventListener("input", () => {
        STATUS_DOT[dk] = el.value;
        applyThemeLive();
      });
    }
    document.getElementById("lp-save")?.addEventListener("click", async () => {
      await saveTheme();
      const st = document.getElementById("lp-status");
      if (st) {
        st.textContent = "Saved";
        st.style.color = STATUS_DOT.active;
        setTimeout(() => {
          st.textContent = "";
        }, 2e3);
      }
    });
    document.getElementById("lp-reset")?.addEventListener("click", async () => {
      try {
        await fetch("/api/theme", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      } catch {
      }
      EDGE_COLORS = { fires: "#f59e0b", calls: "#3b82f6", reads: "#c084fc", writes: "#60a5fa", uses: "#eab308", loads: "#a78bfa", configures: "#6b7280" };
      EDGE_STATUS = { broken: "#ef4444", deprecated: "#6b7280", pulse: "#22D3EE" };
      EDGE_OPACITY = { active: 0.75, idle: 0.35, broken: 0.5, deprecated: 0.15 };
      STATUS_DOT = { active: "#22c55e", idle: "#22D3EE", unhealthy: "#fbbf24", missing: "#ef4444", onDemand: "#a78bfa", phantom: "#6b7280", deprecated: "#4b5563" };
      TIER_COLORS = { 0: "#f97316", 1: "#3b82f6", 2: "#8b5cf6", 3: "#14b8a6", 9: "#6b7280" };
      applyThemeLive();
      buildLegendPanel(panel);
      const st = document.getElementById("lp-status");
      if (st) {
        st.textContent = "Reset to defaults";
        st.style.color = "#94a3b8";
        setTimeout(() => {
          st.textContent = "";
        }, 2e3);
      }
    });
  }
  async function initGraph() {
    await loadTheme();
    tooltip = document.getElementById("tooltip");
    svg = d3.select("#graph-svg");
    svg.style("background", "#080410");
    zoomBehavior = d3.zoom().scaleExtent([0.15, 3]).on("zoom", (event) => mainG.attr("transform", event.transform));
    svg.call(zoomBehavior);
    svg.on("dblclick.zoom", null);
    svg.on("click", (event) => {
      if (event.target === svg.node()) {
        closeSidePanel();
        mainG.selectAll(".shape-main").attr("stroke-width", 2);
      }
    });
    mainG = svg.append("g");
    edgeLayer = null;
    nodeLayer = null;
    activeEdgeLayer = null;
    let savedTransform = null;
    try {
      const lr = await fetch("/api/layout");
      const ld = await lr.json();
      savedPositions = ld.positions || {};
      detachedNodes.clear();
      if (Array.isArray(ld.detached)) {
        for (const id of ld.detached) detachedNodes.add(id);
      }
      if (ld.transform && typeof ld.transform.k === "number") {
        savedTransform = ld.transform;
      }
    } catch {
    }
    const res = await fetch("/api/graph");
    const data = await res.json();
    render(data);
    if (detachedNodes.size > 0 && currentData) {
      const groups = new Set(currentData.nodes.filter((n) => detachedNodes.has(n.id)).map((n) => n.group));
      for (const g of groups) rebuildSatellites(g, currentData.nodes);
      refreshSubgraphs(
        mainG,
        currentData.nodes,
        currentData.edges,
        new Map(currentData.nodes.map((n) => [n.id, n]))
      );
    }
    if (savedTransform) {
      const t = d3.zoomIdentity.translate(savedTransform.x, savedTransform.y).scale(savedTransform.k);
      svg.call(zoomBehavior.transform, t);
    }
    buildPulseMaps(data.nodes, data.edges);
    startPulseSystem();
  }
  async function rescanNodes() {
    try {
      const oldNodes = /* @__PURE__ */ new Map();
      const oldEdgeStatus = /* @__PURE__ */ new Map();
      if (currentData) {
        for (const n of currentData.nodes) oldNodes.set(n.id, { signals: { ...n.signals }, actual: n.actual });
        for (const e of currentData.edges) oldEdgeStatus.set(`${e.sourceId}->${e.targetId}`, e.telemetry?.lastStatus || "");
      }
      const res = await fetch("/api/graph");
      const data = await res.json();
      try {
        const lr = await fetch("/api/layout");
        const ld = await lr.json();
        savedPositions = ld.positions || {};
        detachedNodes.clear();
        if (Array.isArray(ld.detached)) {
          for (const id of ld.detached) detachedNodes.add(id);
        }
      } catch {
      }
      const diff = computeRescanDiff(oldNodes, oldEdgeStatus, data);
      render(data);
      buildPulseMaps(data.nodes, data.edges);
      if (detachedNodes.size > 0 && currentData) {
        const groups = new Set(currentData.nodes.filter((n) => detachedNodes.has(n.id)).map((n) => n.group));
        for (const g of groups) rebuildSatellites(g, currentData.nodes);
        refreshSubgraphs(
          mainG,
          currentData.nodes,
          currentData.edges,
          new Map(currentData.nodes.map((n) => [n.id, n]))
        );
      }
      if (diff.changedIds.size > 0) {
        for (const id of diff.changedIds) {
          const ng = mainG.select(`.node-${id}`);
          if (ng.empty()) continue;
          const shape = ng.select(".shape-main");
          if (!shape.empty()) {
            const origStroke = shape.attr("stroke");
            const origWidth = shape.attr("stroke-width");
            shape.attr("stroke", "#fff").attr("stroke-width", 4);
            shape.transition().duration(1500).attr("stroke", origStroke).attr("stroke-width", origWidth);
          }
        }
      }
      showRescanToast(diff);
    } catch (err) {
      console.error("Rescan failed:", err);
      showRescanToast(null);
    }
  }
  function computeRescanDiff(oldNodes, oldEdgeStatus, newData) {
    const diff = {
      added: [],
      removed: [],
      recovered: [],
      lost: [],
      activated: [],
      deactivated: [],
      edgesRewired: 0,
      changedIds: /* @__PURE__ */ new Set(),
      unchanged: true
    };
    if (oldNodes.size === 0) {
      return diff;
    }
    const newNodeIds = new Set(newData.nodes.map((n) => n.id));
    for (const n of newData.nodes) {
      const old = oldNodes.get(n.id);
      if (!old) {
        diff.added.push(n.label);
        diff.changedIds.add(n.id);
        diff.unchanged = false;
        continue;
      }
      if (!old.signals.exists && n.signals.exists) {
        diff.recovered.push(n.label);
        diff.changedIds.add(n.id);
        diff.unchanged = false;
      } else if (old.signals.exists && !n.signals.exists) {
        diff.lost.push(n.label);
        diff.changedIds.add(n.id);
        diff.unchanged = false;
      }
      if (!old.signals.active && n.signals.active) {
        diff.activated.push(n.label);
        diff.changedIds.add(n.id);
        diff.unchanged = false;
      } else if (old.signals.active && !n.signals.active) {
        diff.deactivated.push(n.label);
        diff.changedIds.add(n.id);
        diff.unchanged = false;
      }
    }
    for (const [id, old] of oldNodes) {
      if (!newNodeIds.has(id)) {
        diff.removed.push(id);
        diff.unchanged = false;
      }
    }
    for (const e of newData.edges) {
      const key = `${e.sourceId}->${e.targetId}`;
      const oldStatus = oldEdgeStatus.get(key);
      const newStatus = e.telemetry?.lastStatus || "";
      if (oldStatus !== void 0 && oldStatus !== newStatus) {
        diff.edgesRewired++;
        diff.unchanged = false;
        diff.changedIds.add(e.sourceId);
        diff.changedIds.add(e.targetId);
      }
    }
    return diff;
  }
  function showRescanToast(diff) {
    document.getElementById("rescan-toast")?.remove();
    const toast = document.createElement("div");
    toast.id = "rescan-toast";
    toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: #1a1a2e; border: 1px solid #333; border-radius: 8px;
    padding: 10px 20px; color: #e0e0e0; font-size: 12px; z-index: 9999;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5); max-width: 600px;
    transition: opacity 0.3s; font-family: monospace;
  `;
    if (!diff) {
      toast.innerHTML = `<span style="color:${STATUS_DOT.missing}">Rescan failed</span>`;
    } else if (diff.unchanged) {
      toast.innerHTML = `<span style="color:${TIER_COLOR_DEFAULT}">Rescan: no changes detected</span>`;
    } else {
      const parts = [];
      if (diff.recovered.length) parts.push(`<span style="color:${STATUS_DOT.active}">+${diff.recovered.length} recovered</span> (${diff.recovered.join(", ")})`);
      if (diff.added.length) parts.push(`<span style="color:${OVERLAY_COLORS.unexpected}">+${diff.added.length} new</span> (${diff.added.join(", ")})`);
      if (diff.lost.length) parts.push(`<span style="color:${STATUS_DOT.missing}">-${diff.lost.length} lost</span> (${diff.lost.join(", ")})`);
      if (diff.removed.length) parts.push(`<span style="color:${STATUS_DOT.missing}">-${diff.removed.length} removed</span>`);
      if (diff.activated.length) parts.push(`<span style="color:${STATUS_DOT.active}">${diff.activated.length} activated</span>`);
      if (diff.deactivated.length) parts.push(`<span style="color:${STATUS_DOT.unhealthy}">${diff.deactivated.length} deactivated</span>`);
      if (diff.edgesRewired) parts.push(`<span style="color:${STATUS_DOT.onDemand}">${diff.edgesRewired} edges rewired</span>`);
      toast.innerHTML = `Rescan: ${parts.join(" \xB7 ")}`;
    }
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
    }, 5e3);
    setTimeout(() => {
      toast.remove();
    }, 5400);
  }
  async function refreshGraph() {
    try {
      const res = await fetch("/api/graph/pulse");
      const pulse = await res.json();
      if (!currentData) return;
      const pulseMap = new Map(pulse.nodes.map((n) => [n.id, n]));
      for (const node of currentData.nodes) {
        const p = pulseMap.get(node.id);
        if (p) {
          node.signals = p.signals;
          node.actual = p.actual;
          if (p.meta) node.meta = { ...node.meta, ...p.meta };
        }
      }
      for (const node of currentData.nodes) {
        const ng = mainG.select(`.node-${node.id}`);
        if (ng.empty()) continue;
        ng.select(".status-dot").transition().duration(300).attr("fill", statusColor(node));
        if (node.deprecated) ng.style("opacity", "0.3");
        else if (!node.signals.exists) ng.style("opacity", "0.35");
        else if (!node.signals.active) ng.style("opacity", "0.65");
        else ng.style("opacity", "1");
        const liveText = node.meta.rowCount != null && (node.type === "store_db" || node.type === "store_json") ? `${node.meta.rowCount} ${node.meta.countLabel || "rows"}` : node.meta.rowCount != null && node.type === "worker" ? `${node.meta.rowCount} runs` : node.meta.fileSize ? `${(node.meta.fileSize / 1024).toFixed(1)} KB` : "";
        ng.select(".live-data").text(liveText);
      }
      updateSummaryBar(currentData);
      if (outgoingEdges && edgeIndexMap) {
        const COVERED_TYPES = /* @__PURE__ */ new Set(["trigger", "script", "engine", "service", "config"]);
        for (const node of currentData.nodes) {
          if (!node.signals.active) {
            _signalPulsedNodes.delete(node.id);
            continue;
          }
          if (COVERED_TYPES.has(node.type)) continue;
          if (_signalPulsedNodes.has(node.id)) continue;
          _signalPulsedNodes.add(node.id);
          const edges = outgoingEdges.get(node.id);
          if (!edges) continue;
          for (const ek of edges) {
            const idx = edgeIndexMap.get(ek);
            if (idx !== void 0) {
              pulseEdge(ek, 0.25);
            }
          }
        }
      }
    } catch {
    }
  }
})();
//# sourceMappingURL=learning-graph.js.map
