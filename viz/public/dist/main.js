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
    html += renderUnified(node, detail);
    if (node.type === "engine" || node.type === "script" || node.type === "controller") {
      html += renderActions(node.id);
    }
    if (node.type === "service") {
      html += renderMcpTools(node.id);
    }
    return html;
  }
  function renderUnified(node, detail) {
    let html = "";
    if (detail.ruvectorStats) html += renderRuvectorStats(detail.ruvectorStats);
    if (detail.hnswStats) html += renderHnswStats(detail.hnswStats);
    if (detail.controllerStatus || node.controllerStatus || node.level || node.meta?.level) {
      html += renderControllerBadge(node, detail);
    }
    if (detail.workerState) html += renderWorkerState(detail.workerState);
    if (detail.hookConfig) {
      html += `<div style="font-weight:600;margin-bottom:4px">Hook Config (${detail.eventName})</div>`;
      html += `<pre class="code">${escapeHtml(JSON.stringify(detail.hookConfig, null, 2))}</pre>`;
    }
    if (detail.serverConfig) {
      html += `<div style="font-weight:600;margin-bottom:4px">MCP Server Config</div>`;
      html += `<pre class="code">${escapeHtml(JSON.stringify(detail.serverConfig, null, 2))}</pre>`;
    }
    if (detail.sonaDetail) html += renderSonaDetail(detail.sonaDetail);
    if (detail.ewcDetail) html += renderEwcDetail(detail.ewcDetail);
    if (detail.tables?.length) {
      const withData = detail.tables.filter((t) => t.rowCount > 0).length;
      html += `<div style="font-weight:600;margin-bottom:4px">Tables (${withData}/${detail.tables.length})</div>`;
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
    }
    if (detail.schema) {
      html += `<div style="font-weight:600;margin-bottom:4px">Schema (${detail.rowCount} rows)</div>`;
      html += '<table class="data" style="margin-bottom:12px"><tr><th>Column</th><th>Type</th></tr>';
      for (const col of detail.schema) html += `<tr><td>${col.name}</td><td>${col.type || "any"}</td></tr>`;
      html += "</table>";
    }
    const filePath = (node.meta?.path || node.path || "").toLowerCase();
    const effectivePath = detail.fileExt ? `file.${detail.fileExt}` : filePath;
    if (detail.parsed || detail.parsedContent) {
      if (detail.hookEvents) html += `<div><b>${detail.hookEvents}</b> hook events \xB7 <b>${detail.hookCount}</b> total hooks</div>`;
      if (detail.mcpServers) html += `<div>MCP Servers: ${detail.mcpServers.join(", ")}</div>`;
      if (detail.entryCount !== void 0) html += `<div style="margin-bottom:4px;color:var(--text-dim)">${detail.entryCount} entries</div>`;
      html += `<div style="font-weight:600;margin:8px 0 4px">Content</div>`;
      html += renderFoldableJson(detail.parsedContent || detail.parsed);
    } else if (detail.preview && !detail.hookConfig && !detail.ruvectorStats) {
      html += renderSmartContent(detail.preview, effectivePath, detail.lineCount);
    }
    if (detail.outgoingEdges?.length) {
      html += `<div style="font-weight:600;margin:12px 0 4px">Outgoing (${detail.outgoingEdges.length})</div>`;
      for (const e of detail.outgoingEdges) html += `<div>\u2192 ${e.target} <span style="color:var(--text-dim)">(${e.type})</span></div>`;
    }
    if (detail.incomingEdges?.length) {
      html += `<div style="font-weight:600;margin:12px 0 4px">Incoming (${detail.incomingEdges.length})</div>`;
      for (const e of detail.incomingEdges) html += `<div>\u2190 ${e.source} <span style="color:var(--text-dim)">(${e.type})</span></div>`;
    }
    if (detail.files?.length && !detail.parsed) {
      html += `<div style="font-weight:600;margin:8px 0 4px">Files (${detail.fileCount || detail.files.length})</div>`;
      for (const f of detail.files.slice(0, 20)) {
        html += `<div style="color:var(--text-dim);font-size:12px">${escapeHtml(typeof f === "string" ? f : f.name || JSON.stringify(f))}</div>`;
      }
      if (detail.files.length > 20) html += `<div style="color:var(--text-dim);font-size:11px">...and ${detail.files.length - 20} more</div>`;
    }
    if (detail.fileSize !== void 0 && !detail.workerState) {
      const size = detail.fileSize < 1024 ? `${detail.fileSize} B` : `${(detail.fileSize / 1024).toFixed(1)} KB`;
      html += `<div style="margin:8px 0;font-size:12px;color:var(--text-dim)">${size}`;
      if (detail.lineCount) html += ` \xB7 ${detail.lineCount} lines`;
      if (detail.lastMod) html += ` \xB7 ${new Date(detail.lastMod).toLocaleString()}`;
      html += `</div>`;
    }
    return html;
  }
  function renderRuvectorStats(rv) {
    let html = `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
    <div style="font-weight:600;margin-bottom:8px;color:#10b981">RuVector Store (${rv.format})</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 12px;font-size:12px">
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
        ${cd.high ? `<div><span style="color:#22c55e">\u25CF</span> High: <b>${cd.high}</b></div>` : ""}
        ${cd.medium ? `<div><span style="color:#f59e0b">\u25CF</span> Medium: <b>${cd.medium}</b></div>` : ""}
        ${cd.low ? `<div><span style="color:#ef4444">\u25CF</span> Low: <b>${cd.low}</b></div>` : ""}
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
  function renderHnswStats(h) {
    let html = `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
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
    return html;
  }
  function renderWorkerState(ws) {
    let html = "";
    if (ws.notStarted) {
      html += `<div style="margin-bottom:12px;padding:8px 10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
      <div style="font-weight:600;margin-bottom:4px;color:#94a3b8">Worker: ${ws.worker}</div>
      <div style="color:#64748b">Daemon has not scheduled this worker yet</div>
    </div>`;
    } else {
      const successRate = ws.runCount > 0 ? Math.round(ws.successCount / ws.runCount * 100) : 0;
      const rateColor = successRate >= 80 ? "#10b981" : successRate >= 50 ? "#f59e0b" : "#ef4444";
      const statusBadge2 = ws.isRunning ? '<span style="color:#f59e0b;font-weight:600">RUNNING</span>' : '<span style="color:#10b981">idle</span>';
      html += `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
      <div style="font-weight:600;margin-bottom:8px;color:#e2e8f0">Worker: ${ws.worker} \xB7 ${statusBadge2}</div>
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
        html += `<div style="margin-bottom:12px"><div style="font-weight:600;margin-bottom:4px;color:#10b981">Last Result</div>
        <pre class="code" style="max-height:200px;overflow:auto">${resultBody}</pre></div>`;
      }
      if (ws.lastError) {
        html += `<div style="margin-bottom:12px"><div style="font-weight:600;margin-bottom:4px;color:#ef4444">Last Error</div>
        <pre class="code" style="color:#fca5a5;max-height:120px;overflow:auto">${escapeHtml(String(ws.lastError).slice(0, 1500))}</pre></div>`;
      }
    }
    return html;
  }
  var _contentId = 0;
  var EXT_TO_PRISM = {
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    md: "markdown",
    js: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    ts: "typescript",
    py: "python",
    css: "css",
    html: "html"
  };
  function renderSmartContent(preview, filePath, lineCount) {
    const ext = (filePath.match(/\.([^./]+)$/) || [])[1]?.toLowerCase() || "";
    const containerId = `content-${++_contentId}`;
    if (ext === "json" || ext === "jsonl") {
      try {
        const parsed = JSON.parse(preview);
        requestAnimationFrame(() => {
          const el = document.getElementById(containerId);
          if (el && typeof renderjson !== "undefined") {
            renderjson.set_show_to_level(1);
            renderjson.set_sort_objects(false);
            renderjson.set_max_string_length(120);
            el.innerHTML = "";
            el.appendChild(renderjson(parsed));
          }
        });
        return `<div style="font-weight:600;margin:8px 0 4px">Content</div>
        <div id="${containerId}" style="max-height:400px;overflow:auto;font-size:11px">Loading...</div>`;
      } catch {
      }
    }
    const lang = EXT_TO_PRISM[ext];
    if (lang && typeof Prism !== "undefined" && Prism.languages[lang]) {
      const highlighted = Prism.highlight(preview.slice(0, 8e3), Prism.languages[lang], lang);
      return `<div style="font-weight:600;margin:8px 0 4px">Content</div>
      <pre class="language-${lang}" style="max-height:300px;overflow:auto"><code class="language-${lang}">${highlighted}</code></pre>`;
    }
    if (filePath.includes("gitignore") || filePath.includes("npmrc")) {
      let html = '<div style="font-weight:600;margin:8px 0 4px">Content</div>';
      html += '<div style="font-size:12px;line-height:1.5">';
      for (const line of preview.split("\n").slice(0, 40)) {
        if (line.trim().startsWith("#") || line.trim() === "") {
          html += `<div style="color:#6b7280">${escapeHtml(line) || "&nbsp;"}</div>`;
        } else if (line.startsWith("!")) {
          html += `<div><span style="color:#22c55e">\u2713</span> <span style="color:#a5d6ff">${escapeHtml(line.slice(1))}</span> <span style="color:#6b7280">(include)</span></div>`;
        } else {
          html += `<div><span style="color:#ef4444">\u2717</span> ${escapeHtml(line)} <span style="color:#6b7280">(ignore)</span></div>`;
        }
      }
      html += "</div>";
      return html;
    }
    return `<div style="font-weight:600;margin:8px 0 4px">Content</div>
    <pre class="code" style="max-height:300px;overflow:auto">${escapeHtml(preview)}</pre>`;
  }
  function renderFoldableJson(obj) {
    const containerId = `content-${++_contentId}`;
    requestAnimationFrame(() => {
      const el = document.getElementById(containerId);
      if (el && typeof renderjson !== "undefined") {
        renderjson.set_show_to_level(1);
        renderjson.set_sort_objects(false);
        renderjson.set_max_string_length(120);
        el.innerHTML = "";
        el.appendChild(renderjson(obj));
      }
    });
    return `<div id="${containerId}" style="max-height:400px;overflow:auto;font-size:11px">Loading...</div>`;
  }
  function renderControllerBadge(node, detail) {
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
  var _lastSeenFired = /* @__PURE__ */ new Map();
  var edgeLayer = null;
  var nodeLayer = null;
  var activeEdgeLayer = null;
  var rafId = 0;
  var edgeIndexMap = null;
  var nodeEnergy = /* @__PURE__ */ new Map();
  var PULSE_NODE_TYPES = /* @__PURE__ */ new Set(["store_db", "store_json"]);
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
    for (const idx of indices) {
      edgeEnergy.set(idx, Math.min(1, (edgeEnergy.get(idx) || 0) + energy));
      if (color) edgePulseColor.set(idx, color);
    }
    const targetId = edgeKey.split("\u2192")[1]?.split(":")[0];
    if (targetId && currentData) {
      const tgt = currentData.nodes.find((n) => n.id === targetId);
      if (tgt && PULSE_NODE_TYPES.has(tgt.type)) {
        nodeEnergy.set(targetId, Math.min(1, (nodeEnergy.get(targetId) || 0) + energy));
      }
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
    for (const e of matching) {
      const key = `${e.sourceId}\u2192${e.targetId}`;
      const s = e.telemetry?.lastStatus || "idle";
      const color = status === "all" ? STATUS_PULSE_COLORS[s] || STATUS_PULSE_COLORS.idle : STATUS_PULSE_COLORS[status] || EDGE_STATUS.pulse;
      pulseEdge(key, 0.7, color);
    }
    return matching.length;
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
        hideTooltip();
      }).on("drag", function(ev) {
        dragDist += Math.abs(ev.dx) + Math.abs(ev.dy);
        node.x = ev.x;
        node.y = ev.y;
        d3.select(this).attr("transform", `translate(${ev.x},${ev.y})`);
        updateDetach(node, nodes);
        refreshSubgraphs(mainG, nodes, edges, nodeMap);
        refreshEdges(mainG, edges, nodeMap);
      }).on("end", function() {
        d3.select(this).attr("cursor", "pointer");
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
    edgeEnergy.clear();
    nodeEnergy.clear();
    resetEdgeLayers();
    _lastSeenFired.clear();
    startEnergyLoop();
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
    edgeEnergy.clear();
    nodeEnergy.clear();
    resetEdgeLayers();
    _lastSeenFired.clear();
    return "server";
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
      const res = await fetch("/api/graph?rescan=1");
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
      const res = await fetch("/api/graph");
      const fresh = await res.json();
      if (!currentData || !fresh.nodes) return;
      const pulseMap = new Map(fresh.nodes.map((n) => [n.id, n]));
      for (const node of currentData.nodes) {
        const p = pulseMap.get(node.id);
        if (p) {
          node.signals = p.signals;
          node.actual = p.actual;
          if (p.meta) node.meta = { ...node.meta, ...p.meta };
        }
      }
      if (fresh.edges) {
        const edgeTelemetry = new Map(fresh.edges.map((e) => [`${e.sourceId}\u2192${e.targetId}:${e.type}`, e.telemetry]));
        for (const e of currentData.edges) {
          const t = edgeTelemetry.get(`${e.sourceId}\u2192${e.targetId}:${e.type}`);
          if (t) e.telemetry = t;
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
      if (edgeIndexMap) {
        for (const e of currentData.edges) {
          const key = `${e.sourceId}\u2192${e.targetId}`;
          const fired = e.telemetry?.lastFired;
          if (!fired) continue;
          const prev = _lastSeenFired.get(key);
          if (fired !== prev) {
            console.log("[pulse]", key, "fired:", fired, "prev:", prev || "none");
            pulseEdge(key, 0.7);
            _lastSeenFired.set(key, fired);
          }
        }
      }
    } catch {
    }
  }

  // src/panels/data-tables.ts
  var ACTIVE_TABLE = { current: "patterns" };
  function initTables() {
    const tabs2 = document.querySelectorAll(".table-tab");
    tabs2.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs2.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        ACTIVE_TABLE.current = tab.dataset.table;
        loadTable(ACTIVE_TABLE.current);
      });
    });
    loadTable("patterns");
  }
  async function loadTable(name) {
    const container = document.getElementById("table-content");
    container.innerHTML = '<div style="color:var(--text-dim);padding:20px">Loading...</div>';
    try {
      switch (name) {
        case "patterns":
          await renderPatterns(container);
          break;
        case "intelligence":
          await renderIntelligence(container);
          break;
        case "reasoningbank":
          await renderReasoningBank(container);
          break;
        case "session":
          await renderSession(container);
          break;
        case "ruflo-intel":
          await renderRufloIntelligence(container);
          break;
        case "agentdb":
          await renderAgentDb(container);
          break;
        case "hnsw":
          await renderHnsw(container);
          break;
        case "sona":
          await renderSona(container);
          break;
        case "auto-memory":
          await renderAutoMemory(container);
          break;
        case "insights":
          await renderInsightsQueue(container);
          break;
        case "mcp-health":
          await renderMcpHealth(container);
          break;
        case "worker-logs":
          await renderWorkerLogs(container);
          break;
        case "ewc-fisher":
          await renderEwcFisher(container);
          break;
        case "embeddings-config":
          await renderEmbeddingsConfig(container);
          break;
        case "learning-bridge":
          await renderLearningBridge(container);
          break;
        case "swarm-state":
          await renderSwarmState(container);
          break;
        case "metrics-performance":
          await renderMetricsPerformance(container);
          break;
        case "metrics-learning":
          await renderMetricsLearning(container);
          break;
        case "metrics-v3":
          await renderMetricsV3(container);
          break;
        case "daemon-health":
          await renderDaemonHealth(container);
          break;
        case "security-audit":
          await renderSecurityAudit(container);
          break;
      }
    } catch (err) {
      container.innerHTML = `<div style="color:var(--color-missing);padding:20px">Error: ${err}</div>`;
    }
  }
  async function renderPatterns(el) {
    const res = await fetch("/api/patterns");
    const data = await res.json();
    let html = `
    <div style="margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap">
      <span class="badge badge-green">ReasoningBank: ${data.counts.patterns}</span>
      <span class="badge badge-cyan">Semantic (HNSW): ${data.counts.memoryPatterns}</span>
      <span class="badge badge-yellow">Trajectories: ${data.counts.trajectories}</span>
      <span style="color:var(--text-dim)">Backend: ${data.metadata?.backend || "\u2014"} \xB7 Schema: ${data.metadata?.schema_version || "\u2014"}</span>
    </div>
  `;
    if (data.vectorIndexes?.length) {
      html += '<div style="font-weight:600;margin:8px 0">HNSW Vector Indexes</div>';
      html += '<table class="data"><tr><th>Name</th><th>Dimensions</th><th>Metric</th><th>M</th><th>efConstruction</th><th>Vectors</th></tr>';
      for (const vi of data.vectorIndexes) {
        html += `<tr><td>${vi.name}</td><td>${vi.dimensions}</td><td>${vi.metric}</td>
        <td>${vi.hnsw_m}</td><td>${vi.hnsw_ef_construction}</td><td>${vi.total_vectors}</td></tr>`;
      }
      html += "</table>";
    }
    if (data.patterns.length) {
      html += '<div style="font-weight:600;margin:16px 0 8px">ReasoningBank Patterns</div>';
      html += '<table class="data"><tr><th>Name</th><th>Type</th><th>Confidence</th><th>Success</th><th>Fail</th><th>Source</th><th>Status</th><th>Updated</th></tr>';
      for (const p of data.patterns) {
        const confColor = (p.confidence ?? 0) >= 0.7 ? "var(--color-found)" : (p.confidence ?? 0) >= 0.4 ? "#eab308" : "var(--color-missing)";
        html += `<tr>
        <td>${p.name || p.id}</td><td>${p.pattern_type || "\u2014"}</td>
        <td style="color:${confColor}">${(p.confidence ?? 0).toFixed(2)}</td>
        <td>${p.success_count ?? 0}</td><td>${p.failure_count ?? 0}</td>
        <td>${p.source || "\u2014"}</td><td>${p.status || "\u2014"}</td>
        <td>${formatDt(p.updated_at)}</td></tr>`;
      }
      html += "</table>";
    }
    if (data.memoryPatterns.length) {
      html += '<div style="font-weight:600;margin:16px 0 8px">Semantic Memory Patterns</div>';
      html += '<table class="data"><tr><th>Key</th><th>Content</th><th>Model</th><th>Dims</th><th>Accesses</th><th>Status</th><th>Updated</th></tr>';
      for (const m of data.memoryPatterns) {
        html += `<tr>
        <td>${m.key}</td><td>${(m.content || "").slice(0, 80)}${(m.content || "").length > 80 ? "..." : ""}</td>
        <td>${m.embedding_model || "\u2014"}</td><td>${m.embedding_dimensions || "\u2014"}</td>
        <td>${m.access_count ?? 0}</td><td>${m.status || "\u2014"}</td>
        <td>${formatDt(m.updated_at)}</td></tr>`;
      }
      html += "</table>";
    }
    if (data.trajectories.length) {
      html += '<div style="font-weight:600;margin:16px 0 8px">SONA Trajectories</div>';
      html += '<table class="data"><tr><th>Task</th><th>Status</th><th>Verdict</th><th>Steps</th><th>Reward</th><th>Started</th></tr>';
      for (const t of data.trajectories) {
        const verdictColor2 = t.verdict === "success" ? "var(--color-found)" : t.verdict === "failure" ? "var(--color-missing)" : "#eab308";
        html += `<tr>
        <td>${(t.task || t.id || "\u2014").slice(0, 50)}</td>
        <td>${t.status || "\u2014"}</td>
        <td style="color:${verdictColor2}">${t.verdict || "\u2014"}</td>
        <td>${t.total_steps ?? 0}</td><td>${(t.total_reward ?? 0).toFixed(2)}</td>
        <td>${formatDt(t.started_at)}</td></tr>`;
      }
      html += "</table>";
    }
    if (!data.patterns.length && !data.memoryPatterns.length && !data.trajectories.length) {
      html += '<div style="color:var(--text-dim);margin-top:12px">No patterns learned yet. The system populates this as hooks fire and SONA trajectories complete.</div>';
    }
    el.innerHTML = html;
  }
  async function renderIntelligence(el) {
    const res = await fetch("/api/intelligence");
    const data = await res.json();
    let html = `
    <div style="margin-bottom:12px;display:flex;gap:16px">
      <span class="badge badge-green">Nodes: ${data.graphState.nodeCount}</span>
      <span class="badge badge-cyan">Edges: ${data.graphState.edgeCount}</span>
    </div>
  `;
    if (data.graphState.topPageRank?.length) {
      html += '<div style="font-weight:600;margin:8px 0">Top PageRank Nodes</div>';
      html += '<table class="data"><tr><th>#</th><th>Node ID</th><th>PageRank</th></tr>';
      data.graphState.topPageRank.forEach((n, i) => {
        html += `<tr><td>${i + 1}</td><td>${n.id}</td><td>${n.score.toFixed(6)}</td></tr>`;
      });
      html += "</table>";
    }
    if (data.graphState.nodes?.length) {
      html += '<div style="font-weight:600;margin:16px 0 8px">All Graph Nodes</div>';
      html += '<table class="data"><tr><th>ID</th><th>Category</th><th>Confidence</th><th>Access Count</th></tr>';
      for (const n of data.graphState.nodes.slice(0, 50)) {
        html += `<tr><td>${n.id}</td><td>${n.category || "\u2014"}</td><td>${(n.confidence ?? 0).toFixed(2)}</td><td>${n.accessCount ?? 0}</td></tr>`;
      }
      html += "</table>";
    }
    if (data.rankedContext?.entries?.length) {
      html += `<div style="font-weight:600;margin:16px 0 8px">Ranked Context (${data.rankedContext.entries.length} entries)</div>`;
    }
    el.innerHTML = html;
  }
  async function renderReasoningBank(el) {
    const res = await fetch("/api/reasoningbank");
    const data = await res.json();
    let html = '<div style="font-weight:600;margin-bottom:8px">memory.db Tables</div>';
    html += '<table class="data"><tr><th>Table</th><th>Rows</th><th>Preview</th></tr>';
    for (const [name, info] of Object.entries(data.tables)) {
      const hasData = info.count > 0;
      html += `<tr>
      <td>${name}</td>
      <td><span class="badge ${hasData ? "badge-green" : "badge-yellow"}">${info.count}</span></td>
      <td>${info.preview?.length ? info.preview.length + " rows shown" : "\u2014"}</td>
    </tr>`;
    }
    html += "</table>";
    for (const [name, info] of Object.entries(data.tables)) {
      if (info.preview?.length) {
        html += `<div style="font-weight:600;margin:16px 0 8px">${name} Preview</div>`;
        html += `<pre class="code" style="max-height:200px">${escapeHtml2(formatJsonDates(JSON.stringify(info.preview, null, 2)))}</pre>`;
      }
    }
    el.innerHTML = html;
  }
  async function renderSession(el) {
    const res = await fetch("/api/session");
    const data = await res.json();
    let html = "";
    if (data.current) {
      html += '<div style="font-weight:600;margin:0 0 8px">Session Metadata</div>';
      html += '<table class="data"><tr><th>Property</th><th>Value</th></tr>';
      html += `<tr><td>Session ID</td><td>${data.current.id || "\u2014"}</td></tr>`;
      html += `<tr><td>Started</td><td>${formatDt(data.current.startedAt)}</td></tr>`;
      html += `<tr><td>Working Directory</td><td>${data.current.cwd || "\u2014"}</td></tr>`;
      if (data.current.metrics) {
        html += `<tr><td>Tasks</td><td>${data.current.metrics.tasks ?? 0}</td></tr>`;
        html += `<tr><td>Edits</td><td>${data.current.metrics.edits ?? 0}</td></tr>`;
      }
      html += "</table>";
    }
    html += `
    <div style="margin:16px 0 12px;display:flex;gap:16px;flex-wrap:wrap">
      <span class="badge badge-green">Workers: ${data.counts.workers}</span>
      <span class="badge badge-cyan">Sessions: ${data.counts.sessions}</span>
      <span class="badge badge-yellow">Snapshots: ${data.counts.snapshots}</span>
    </div>
  `;
    html += '<div style="font-weight:600;margin:12px 0 8px">Daemon Workers</div>';
    if (data.workers?.length) {
      html += '<table class="data"><tr><th>Worker</th><th>Runs</th><th>OK</th><th>Fail</th><th>Enabled</th><th>Last Run</th></tr>';
      for (const w of data.workers) {
        const statusClass = w.runs > 0 ? w.failures > 0 ? "badge-yellow" : "badge-green" : "badge-cyan";
        html += `<tr>
        <td><span class="badge ${statusClass}">${w.name}</span></td>
        <td>${w.runs}</td><td>${w.successes}</td><td>${w.failures}</td>
        <td>${w.enabled ? "\u2713" : "\u2717"}</td>
        <td>${formatDt(w.lastRun)}</td></tr>`;
      }
      html += "</table>";
    } else {
      html += '<div style="color:var(--text-dim);font-size:12px;margin-bottom:8px">No daemon workers registered.</div>';
    }
    if (data.memoryStats && Object.keys(data.memoryStats).length) {
      html += '<div style="font-weight:600;margin:12px 0 8px">Memory Backend</div>';
      html += '<table class="data"><tr><th>Key</th><th>Value</th></tr>';
      for (const [k, v] of Object.entries(data.memoryStats)) {
        html += `<tr><td>${k}</td><td>${v}</td></tr>`;
      }
      html += "</table>";
    }
    if (data.snapshots?.length) {
      html += '<div style="font-weight:600;margin:12px 0 8px">Learning Snapshots (latest)</div>';
      html += '<table class="data"><tr><th>Time</th><th>Nodes</th><th>Edges</th><th>PageRank</th></tr>';
      for (const s of data.snapshots.slice(-10).reverse()) {
        html += `<tr><td>${formatDt(s.timestamp)}</td><td>${s.nodes}</td><td>${s.edges}</td><td>${(s.pageRankSum ?? 0).toFixed(3)}</td></tr>`;
      }
      html += "</table>";
    }
    el.innerHTML = html;
  }
  async function renderRufloIntelligence(el) {
    const res = await fetch("/api/ruflo-intelligence");
    const data = await res.json();
    const cd = data.confidenceDistribution || {};
    const ps = data.patternStats || {};
    let html = `
    <div style="margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap">
      <span class="badge badge-green">Graph Nodes: ${data.graphNodeCount}</span>
      <span class="badge badge-cyan">ReasoningBank: ${ps.reasoningBank ?? 0}</span>
      <span class="badge badge-cyan">Semantic: ${ps.semantic ?? 0}</span>
      <span class="badge badge-yellow">Trajectories: ${ps.trajectories ?? 0}</span>
      <span class="badge badge-green">Snapshots: ${data.snapshotCount ?? 0}</span>
    </div>
    <div style="font-weight:600;margin:8px 0">Confidence Distribution</div>
    <div style="display:flex;gap:8px;margin-bottom:16px">
  `;
    const bar = (label, count, color) => `<div style="flex:${count || 0.5};background:${color};padding:4px 8px;border-radius:4px;font-size:11px;text-align:center;min-width:40px">${label}: ${count}</div>`;
    html += bar("High", cd.high || 0, "rgba(34,197,94,0.25)");
    html += bar("Med", cd.medium || 0, "rgba(234,179,8,0.25)");
    html += bar("Low", cd.low || 0, "rgba(239,68,68,0.25)");
    html += bar("N/A", cd.unknown || 0, "rgba(100,116,139,0.25)");
    html += "</div>";
    if (data.snapshot) {
      html += '<div style="font-weight:600;margin:8px 0">Latest Intelligence Snapshot</div>';
      html += `<div style="font-size:12px;color:var(--text-dim);margin-bottom:8px">
      ${data.snapshot.nodes} nodes, ${data.snapshot.edges} edges \xB7 PageRank sum: ${(data.snapshot.pageRankSum ?? 0).toFixed(3)} \xB7 ${data.snapshot.timestamp || "\u2014"}
    </div>`;
      if (data.snapshot.topPatterns?.length) {
        html += '<table class="data"><tr><th>Pattern</th><th>Confidence</th><th>PageRank</th></tr>';
        for (const p of data.snapshot.topPatterns) {
          const confColor = (p.confidence ?? 0) >= 0.7 ? "var(--color-found)" : (p.confidence ?? 0) >= 0.4 ? "#eab308" : "var(--color-missing)";
          html += `<tr><td>${p.summary || p.id}</td><td style="color:${confColor}">${(p.confidence ?? 0).toFixed(2)}</td><td>${(p.pageRank ?? 0).toFixed(4)}</td></tr>`;
        }
        html += "</table>";
      }
    }
    if (data.brainIntel) {
      html += '<div style="font-weight:600;margin:16px 0 8px">External Brain (RuVector)</div>';
      html += `<div style="font-size:12px;color:var(--text-dim)">${data.brainIntel.patternCount} Q-value patterns, ${data.brainIntel.memoryCount} memories \xB7 Source: ${data.brainIntel.source}</div>`;
    }
    el.innerHTML = html;
  }
  async function renderAgentDb(el) {
    const res = await fetch("/api/agentdb");
    const data = await res.json();
    let html = `
    <div style="margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap">
      <span class="badge badge-green">Tables: ${data.tableCount ?? 0}</span>
      <span class="badge badge-cyan">Rows: ${data.totalRows ?? 0}</span>
      ${data.claudeMemory ? `<span class="badge badge-yellow">Claude local: ${data.claudeMemory.totalRows ?? 0} rows</span>` : ""}
      <span style="color:var(--text-dim);font-size:11px">Source: ${data.source || ".swarm/memory.db"}</span>
    </div>
  `;
    if (data.hnsw) {
      html += '<div style="font-weight:600;margin:8px 0">HNSW Index</div>';
      html += `<div style="font-size:12px;color:var(--text-dim);margin-bottom:12px">
      Exists: ${data.hnsw.indexExists ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-red">No</span>'}
      &nbsp; Size: ${data.hnsw.indexSize ? (data.hnsw.indexSize / 1024).toFixed(1) + " KB" : "0"}
      &nbsp; Modified: ${formatDt(data.hnsw.lastModified)}
    </div>`;
      if (data.hnsw.metadata) {
        html += `<pre class="code" style="max-height:150px">${escapeHtml2(JSON.stringify(data.hnsw.metadata, null, 2))}</pre>`;
      }
    }
    html += '<div style="font-weight:600;margin:16px 0 8px">ReasoningBank Tables (.swarm/memory.db)</div>';
    html += '<table class="data"><tr><th>Table</th><th>Rows</th><th>Columns</th></tr>';
    for (const [name, info] of Object.entries(data.tables || {})) {
      html += `<tr><td>${name}</td>
      <td><span class="badge ${info.count > 0 ? "badge-green" : "badge-yellow"}">${info.count}</span></td>
      <td>${info.schema?.map((c) => c.name).join(", ") || "\u2014"}</td></tr>`;
    }
    html += "</table>";
    for (const [name, info] of Object.entries(data.tables || {})) {
      if (info.preview?.length) {
        html += `<div style="font-weight:600;margin:16px 0 8px">${name} Preview</div>`;
        html += `<pre class="code" style="max-height:200px">${escapeHtml2(formatJsonDates(JSON.stringify(info.preview, null, 2)))}</pre>`;
      }
    }
    el.innerHTML = html;
  }
  async function renderHnsw(el) {
    const res = await fetch("/api/hnsw");
    const data = await res.json();
    let html = `
    <div style="margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap">
      <span class="badge ${data.index?.exists ? "badge-green" : "badge-red"}">Index: ${data.index?.exists ? "Found" : "Missing"}</span>
      <span class="badge badge-cyan">Size: ${data.index?.sizeHuman || "0"}</span>
      <span class="badge badge-green">Vectors: ${data.vectorCount}</span>
    </div>
  `;
    html += '<div style="font-weight:600;margin:8px 0">Index Details</div>';
    html += '<table class="data"><tr><th>Property</th><th>Value</th></tr>';
    html += `<tr><td>File exists</td><td>${data.index?.exists ? "Yes" : "No"}</td></tr>`;
    html += `<tr><td>File size</td><td>${data.index?.sizeHuman || "0"}</td></tr>`;
    html += `<tr><td>Last modified</td><td>${formatDt(data.index?.lastModified)}</td></tr>`;
    html += `<tr><td>Vector count</td><td>${data.vectorCount}</td></tr>`;
    html += `<tr><td>memory.db</td><td>${data.stores?.memoryDb?.exists ? (data.stores.memoryDb.size / 1024).toFixed(1) + " KB" : "Missing"}</td></tr>`;
    html += `<tr><td>agentdb-memory.db</td><td>${data.stores?.agentDb?.exists ? (data.stores.agentDb.size / 1024).toFixed(1) + " KB" : "Missing"}</td></tr>`;
    html += `<tr><td>memory.graph (redb)</td><td>${data.stores?.memoryGraph?.exists ? (data.stores.memoryGraph.size / 1024).toFixed(1) + " KB" : "Missing"}</td></tr>`;
    if (data.stores?.memoryGraph?.lastModified) {
      html += `<tr><td>memory.graph modified</td><td>${formatDt(data.stores.memoryGraph.lastModified)}</td></tr>`;
    }
    html += "</table>";
    if (data.metadata && Object.keys(data.metadata).length) {
      html += '<div style="font-weight:600;margin:16px 0 8px">HNSW Metadata</div>';
      html += `<pre class="code" style="max-height:300px">${escapeHtml2(JSON.stringify(data.metadata, null, 2))}</pre>`;
    }
    el.innerHTML = html;
  }
  async function renderSona(el) {
    const res = await fetch("/api/sona");
    const data = await res.json();
    let html = `
    <div style="margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap">
      <span class="badge ${data.sona?.trajectoryCount > 0 ? "badge-green" : "badge-yellow"}">SONA: ${data.sona?.trajectoryCount ?? 0} trajectories, ${data.sona?.stepCount ?? 0} steps</span>
      <span class="badge ${data.ewc?.patternCount > 0 ? "badge-green" : "badge-yellow"}">EWC: ${data.ewc?.patternCount ?? 0} patterns</span>
      <span style="color:var(--text-dim);font-size:11px">Source: ${data.source || ".swarm/memory.db"}</span>
    </div>
  `;
    if (data.sona?.trajectories?.length) {
      html += '<div style="font-weight:600;margin:8px 0">SONA Trajectories</div>';
      html += '<table class="data"><tr><th>Task</th><th>Status</th><th>Verdict</th><th>Steps</th><th>Reward</th><th>Started</th></tr>';
      for (const t of data.sona.trajectories) {
        const verdictColor2 = t.verdict === "success" ? "var(--color-found)" : t.verdict === "failure" ? "var(--color-missing)" : "#eab308";
        html += `<tr>
        <td>${(t.task || t.id || "\u2014").slice(0, 50)}</td>
        <td>${t.status || "\u2014"}</td>
        <td style="color:${verdictColor2}">${t.verdict || "\u2014"}</td>
        <td>${t.total_steps ?? 0}</td><td>${(t.total_reward ?? 0).toFixed(2)}</td>
        <td>${formatDt(t.started_at)}</td></tr>`;
      }
      html += "</table>";
    }
    if (data.sona?.steps?.length) {
      html += '<div style="font-weight:600;margin:16px 0 8px">Recent Steps</div>';
      html += `<pre class="code" style="max-height:200px">${escapeHtml2(formatJsonDates(JSON.stringify(data.sona.steps, null, 2)))}</pre>`;
    }
    if (data.ewc?.patterns?.length) {
      html += '<div style="font-weight:600;margin:16px 0 8px">EWC++ Consolidated Patterns</div>';
      html += '<table class="data"><tr><th>Name</th><th>Type</th><th>Confidence</th><th>Success</th><th>Fail</th><th>Status</th></tr>';
      for (const p of data.ewc.patterns) {
        const confColor = (p.confidence ?? 0) >= 0.7 ? "var(--color-found)" : (p.confidence ?? 0) >= 0.4 ? "#eab308" : "var(--color-missing)";
        html += `<tr><td>${p.name || p.id}</td><td>${p.pattern_type || "\u2014"}</td>
        <td style="color:${confColor}">${(p.confidence ?? 0).toFixed(2)}</td>
        <td>${p.success_count ?? 0}</td><td>${p.failure_count ?? 0}</td><td>${p.status || "\u2014"}</td></tr>`;
      }
      html += "</table>";
    }
    if (!data.ewc?.patterns?.length && data.ewc?.fisherState) {
      html += '<div style="font-weight:600;margin:16px 0 8px">EWC++ Fisher State</div>';
      html += '<table class="data"><tr><th>Property</th><th>Value</th></tr>';
      html += `<tr><td>Task Count</td><td>${data.ewc.fisherState.taskCount ?? 0}</td></tr>`;
      html += `<tr><td>Last Consolidation</td><td>${data.ewc.fisherState.lastConsolidation ? formatDt(data.ewc.fisherState.lastConsolidation) : "None yet"}</td></tr>`;
      html += `<tr><td>Fisher Diagonal</td><td>${Array.isArray(data.ewc.fisherState.fisherDiagonal) ? data.ewc.fisherState.fisherDiagonal.length + " entries" : "\u2014"}</td></tr>`;
      html += `<tr><td>Consolidated Params</td><td>${Array.isArray(data.ewc.fisherState.consolidatedParams) ? data.ewc.fisherState.consolidatedParams.length + " entries" : "\u2014"}</td></tr>`;
      html += `<tr><td>Version</td><td>${data.ewc.fisherState._version || "\u2014"}</td></tr>`;
      html += "</table>";
    }
    if (!data.sona?.trajectories?.length && data.sona?.jsonSeedExists) {
      html += '<div style="font-weight:600;margin:16px 0 8px">SONA Patterns Seed</div>';
      html += `<div style="font-size:12px;color:var(--text-dim);margin-bottom:4px">
      sona-patterns.json: ${Array.isArray(data.sona.jsonSeed) ? data.sona.jsonSeed.length + " patterns" : "present"}
    </div>`;
    }
    if (!data.sona?.trajectories?.length && !data.ewc?.patterns?.length) {
      html += `<div style="color:var(--text-dim);padding:16px 0;line-height:1.6">
      SONA learns from real task outcomes. As the agent completes tasks, the learning pipeline
      records trajectories, extracts patterns, and consolidates them via EWC++ into long-term memory.
      The EWC fisher state and SONA seed file above confirm the pipeline is initialized and ready.
      <br><br>
      <strong>Run a Full Cycle from the toolbar to trigger the learning pipeline.</strong>
    </div>`;
    }
    el.innerHTML = html;
  }
  async function renderAutoMemory(el) {
    const res = await fetch("/api/auto-memory");
    const data = await res.json();
    let html = `
    <div style="margin-bottom:12px;display:flex;gap:16px">
      <span class="badge ${data.exists ? "badge-green" : "badge-yellow"}">${data.exists ? data.entryCount + " entries" : "Not found"}</span>
      <span class="badge badge-cyan">${data.fileSize ? (data.fileSize / 1024).toFixed(1) + " KB" : "0"}</span>
      <span style="color:var(--text-dim);font-size:11px">Modified: ${formatDt(data.lastModified)}</span>
    </div>
  `;
    if (data.entries?.length) {
      html += '<div style="font-weight:600;margin:8px 0">Memory Entries</div>';
      html += '<table class="data"><tr><th>#</th><th>Key/Type</th><th>Content</th></tr>';
      data.entries.forEach((entry, i) => {
        const key = entry.key || entry.type || entry.id || entry.name || `entry-${i}`;
        const val = entry.value || entry.content || entry.data || JSON.stringify(entry).slice(0, 200);
        html += `<tr><td>${i + 1}</td><td>${escapeHtml2(String(key))}</td><td style="max-width:500px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml2(String(val).slice(0, 200))}</td></tr>`;
      });
      html += "</table>";
    }
    el.innerHTML = html;
  }
  async function renderInsightsQueue(el) {
    const res = await fetch("/api/insights-queue");
    const data = await res.json();
    let html = `
    <div style="margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap">
      <span class="badge ${data.exists ? data.totalCount > 0 ? "badge-green" : "badge-yellow" : "badge-red"}">${data.exists ? data.totalCount + " pending" : "No queue file"}</span>
      <span class="badge badge-cyan">${data.fileSize ? (data.fileSize / 1024).toFixed(1) + " KB" : "0"}</span>
    </div>
  `;
    if (data.byType && Object.keys(data.byType).length) {
      html += '<div style="font-weight:600;margin:8px 0">By Type</div>';
      html += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">';
      for (const [type, count] of Object.entries(data.byType)) {
        html += `<span class="badge badge-cyan">${type}: ${count}</span>`;
      }
      html += "</div>";
    }
    if (data.recentInsights?.length) {
      html += '<div style="font-weight:600;margin:8px 0">Recent Insights (newest last)</div>';
      html += `<pre class="code" style="max-height:400px">${escapeHtml2(formatJsonDates(JSON.stringify(data.recentInsights, null, 2)))}</pre>`;
    }
    el.innerHTML = html;
  }
  async function renderMcpHealth(el) {
    const res = await fetch("/api/mcp-health");
    const data = await res.json();
    let html = `
    <div style="margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap">
      <span class="badge badge-green">Active: ${data.active ?? 0}</span>
      <span class="badge badge-yellow">Configured: ${data.configured ?? 0}</span>
      <span class="badge badge-red">Broken: ${data.broken ?? 0}</span>
      <span class="badge badge-cyan">Total: ${data.count ?? 0}</span>
    </div>
  `;
    if (data.note) {
      html += `<div style="color:var(--text-dim);font-size:11px;margin-bottom:12px">${data.note}</div>`;
    }
    if (data.cliDaemon) {
      html += '<div style="font-weight:600;margin:8px 0">CLI Daemon</div>';
      html += `<div style="font-size:12px;margin-bottom:12px">
      Installed: ${data.cliDaemon.installed ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-red">No</span>'}
      &nbsp; Running: ${data.cliDaemon.running ? '<span class="badge badge-green">Yes</span>' : '<span class="badge badge-yellow">No</span>'}
      &nbsp; Workers: ${data.cliDaemon.workers}
    </div>`;
    }
    if (data.servers?.length) {
      html += '<div style="font-weight:600;margin:8px 0">MCP Servers</div>';
      html += '<table class="data"><tr><th>Server</th><th>Type</th><th>Status</th><th>Tools Used</th></tr>';
      for (const s of data.servers) {
        const statusClass = s.status === "active" ? "badge-green" : s.status === "configured" ? "badge-yellow" : "badge-red";
        const typeClass = s.type === "framework" ? "badge-cyan" : "badge-yellow";
        html += `<tr>
        <td style="font-weight:600">${s.name}</td>
        <td><span class="badge ${typeClass}">${s.type || "stdio"}</span></td>
        <td><span class="badge ${statusClass}">${s.status}</span></td>
        <td>${s.toolsUsed}</td>
      </tr>`;
      }
      html += "</table>";
    }
    el.innerHTML = html;
  }
  async function renderWorkerLogs(el) {
    const res = await fetch("/api/worker-logs");
    const data = await res.json();
    let html = "";
    if (data.daemonState) {
      html += `<div style="margin-bottom:12px;display:flex;gap:16px">
      <span class="badge ${data.daemonState.running ? "badge-green" : "badge-yellow"}">Daemon: ${data.daemonState.running ? "Running" : "Stopped"}</span>
      ${data.daemonState.pid ? `<span class="badge badge-cyan">PID: ${data.daemonState.pid}</span>` : ""}
      <span class="badge badge-cyan">Logs: ${data.count}</span>
    </div>`;
    } else {
      html += `<div style="margin-bottom:12px"><span class="badge badge-yellow">No daemon state found</span> <span class="badge badge-cyan">Logs: ${data.count}</span></div>`;
    }
    if (data.logs?.length) {
      html += '<table class="data"><tr><th>Worker</th><th>File</th><th>Size</th><th>Modified</th></tr>';
      for (const log of data.logs) {
        html += `<tr>
        <td><span class="badge badge-cyan">${log.workerType}</span></td>
        <td>${log.file}</td>
        <td>${log.sizeHuman}</td>
        <td>${formatDt(log.lastModified)}</td>
      </tr>`;
      }
      html += "</table>";
      for (const log of data.logs.slice(0, 5)) {
        if (log.preview) {
          html += `<div style="font-weight:600;margin:16px 0 8px">${log.file} (tail)</div>`;
          html += `<pre class="code" style="max-height:150px">${escapeHtml2(log.preview)}</pre>`;
        }
      }
    } else {
      html += '<div style="color:var(--text-dim);padding:20px">No worker logs found. Start the CLI daemon to generate logs.</div>';
    }
    el.innerHTML = html;
  }
  async function renderEwcFisher(el) {
    const res = await fetch("/api/ewc-status");
    const data = await res.json();
    let html = '<div style="font-weight:600;margin-bottom:8px">EWC++ Fisher State</div>';
    html += '<table class="data"><tr><th>Property</th><th>Value</th></tr>';
    const fs = data.fisherState || data;
    html += `<tr><td>Task Count</td><td>${fs.taskCount ?? 0}</td></tr>`;
    html += `<tr><td>Last Consolidation</td><td>${fs.lastConsolidation ? formatDt(fs.lastConsolidation) : "None yet"}</td></tr>`;
    html += `<tr><td>Fisher Diagonal</td><td>${Array.isArray(fs.fisherDiagonal) ? fs.fisherDiagonal.length + " entries" : "\u2014"}</td></tr>`;
    html += `<tr><td>Consolidated Params</td><td>${Array.isArray(fs.consolidatedParams) ? fs.consolidatedParams.length + " entries" : "\u2014"}</td></tr>`;
    html += `<tr><td>Version</td><td>${fs._version || fs.version || "\u2014"}</td></tr>`;
    html += `<tr><td>Pattern Count</td><td>${data.patternCount ?? fs.patternCount ?? "\u2014"}</td></tr>`;
    html += "</table>";
    el.innerHTML = html;
  }
  async function renderEmbeddingsConfig(el) {
    const res = await fetch("/api/embeddings-config");
    const data = await res.json();
    let html = '<div style="font-weight:600;margin-bottom:8px">Embeddings Configuration</div>';
    html += '<table class="data"><tr><th>Property</th><th>Value</th></tr>';
    for (const [k, v] of Object.entries(data)) {
      html += `<tr><td>${escapeHtml2(String(k))}</td><td>${escapeHtml2(String(v))}</td></tr>`;
    }
    html += "</table>";
    el.innerHTML = html;
  }
  async function renderLearningBridge(el) {
    const res = await fetch("/api/graph/config");
    const data = await res.json();
    const cfg = data.learningBridge || data;
    let html = '<div style="font-weight:600;margin-bottom:8px">Learning Bridge Config</div>';
    html += '<table class="data"><tr><th>Property</th><th>Value</th></tr>';
    html += `<tr><td>SONA Mode</td><td>${cfg.sonaMode ?? "\u2014"}</td></tr>`;
    html += `<tr><td>Confidence Decay Rate</td><td>${cfg.confidenceDecayRate ?? "\u2014"}</td></tr>`;
    html += `<tr><td>Access Boost Amount</td><td>${cfg.accessBoostAmount ?? "\u2014"}</td></tr>`;
    html += `<tr><td>PageRank Damping</td><td>${cfg.pageRankDamping ?? "\u2014"}</td></tr>`;
    html += "</table>";
    el.innerHTML = html;
  }
  async function renderSwarmState(el) {
    const res = await fetch("/api/swarm-state");
    const data = await res.json();
    if (!data || typeof data === "object" && !Object.keys(data).length) {
      el.innerHTML = '<div style="color:var(--text-dim);padding:20px">No swarm state available.</div>';
      return;
    }
    let html = '<div style="font-weight:600;margin-bottom:8px">Swarm State</div>';
    html += '<table class="data"><tr><th>Property</th><th>Value</th></tr>';
    for (const [k, v] of Object.entries(data)) {
      const display = typeof v === "object" ? JSON.stringify(v) : String(v);
      html += `<tr><td>${escapeHtml2(String(k))}</td><td>${escapeHtml2(display)}</td></tr>`;
    }
    html += "</table>";
    el.innerHTML = html;
  }
  async function renderMetricsPerformance(el) {
    const res = await fetch("/api/metrics/performance");
    const data = await res.json();
    let html = '<div style="font-weight:600;margin-bottom:8px">Performance Metrics</div>';
    html += '<table class="data"><tr><th>Metric</th><th>Value</th></tr>';
    for (const [k, v] of Object.entries(data)) {
      const display = typeof v === "object" ? JSON.stringify(v) : String(v);
      html += `<tr><td>${escapeHtml2(String(k))}</td><td>${escapeHtml2(display)}</td></tr>`;
    }
    html += "</table>";
    el.innerHTML = html;
  }
  async function renderMetricsLearning(el) {
    const res = await fetch("/api/metrics/learning");
    const data = await res.json();
    let html = '<div style="font-weight:600;margin-bottom:8px">Learning Metrics</div>';
    html += '<table class="data"><tr><th>Metric</th><th>Value</th></tr>';
    for (const [k, v] of Object.entries(data)) {
      const display = typeof v === "object" ? JSON.stringify(v) : String(v);
      html += `<tr><td>${escapeHtml2(String(k))}</td><td>${escapeHtml2(display)}</td></tr>`;
    }
    html += "</table>";
    el.innerHTML = html;
  }
  async function renderMetricsV3(el) {
    const res = await fetch("/api/metrics/v3-progress");
    const data = await res.json();
    let html = '<div style="font-weight:600;margin-bottom:8px">V3 Progress Metrics</div>';
    html += '<table class="data"><tr><th>Metric</th><th>Value</th></tr>';
    for (const [k, v] of Object.entries(data)) {
      const display = typeof v === "object" ? JSON.stringify(v) : String(v);
      html += `<tr><td>${escapeHtml2(String(k))}</td><td>${escapeHtml2(display)}</td></tr>`;
    }
    html += "</table>";
    el.innerHTML = html;
  }
  async function renderDaemonHealth(el) {
    const res = await fetch("/api/daemon-health");
    const data = await res.json();
    const daemons = Object.entries(data.daemons || {});
    const running = daemons.filter(([, v]) => v).length;
    const total = daemons.length;
    let html = `
    <div style="margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap">
      <span class="badge ${running === total ? "badge-green" : running > 0 ? "badge-yellow" : "badge-red"}">${running}/${total} daemons running</span>
      <span class="badge badge-cyan">Queue: ${data.queueSize ?? 0} pending</span>
    </div>
  `;
    html += '<div style="font-weight:600;margin:8px 0">Daemons</div>';
    html += '<table class="data"><tr><th>Daemon</th><th>Status</th></tr>';
    for (const [name, alive] of daemons) {
      html += `<tr><td>${name}</td><td><span class="badge ${alive ? "badge-green" : "badge-red"}">${alive ? "Running" : "Stopped"}</span></td></tr>`;
    }
    html += "</table>";
    const p = data.pipeline || {};
    if (Object.keys(p).length) {
      html += '<div style="font-weight:600;margin:16px 0 8px">Pipeline Counters</div>';
      html += '<table class="data"><tr><th>Counter</th><th>Value</th></tr>';
      html += `<tr><td>Total Processed</td><td>${p.totalProcessed ?? 0}</td></tr>`;
      html += `<tr><td>T2 Written</td><td>${p.totalT2Written ?? 0}</td></tr>`;
      html += `<tr><td>T3 Updates</td><td>${p.totalT3Updates ?? 0}</td></tr>`;
      html += `<tr><td>Pipeline Ops</td><td>${p.totalPipelineOps ?? 0}</td></tr>`;
      html += `<tr><td>L1 Stored</td><td>${p.totalL1Stored ?? 0}</td></tr>`;
      html += `<tr><td>Consolidations</td><td>${p.totalConsolidations ?? 0}</td></tr>`;
      html += "</table>";
    }
    const q = data.qtable || {};
    if (Object.keys(q).length) {
      html += '<div style="font-weight:600;margin:16px 0 8px">Q-Table</div>';
      html += '<table class="data"><tr><th>Property</th><th>Value</th></tr>';
      html += `<tr><td>Entries</td><td>${q.entries ?? 0}</td></tr>`;
      html += `<tr><td>Memories</td><td>${q.memories ?? 0}</td></tr>`;
      html += `<tr><td>Version</td><td>${q.version ?? "\u2014"}</td></tr>`;
      html += "</table>";
    }
    const pat = data.patterns || {};
    if (Object.keys(pat).length) {
      html += '<div style="font-weight:600;margin:16px 0 8px">Patterns.db</div>';
      html += '<table class="data"><tr><th>Property</th><th>Value</th></tr>';
      html += `<tr><td>Short-term</td><td>${pat.shortTerm ?? 0}</td></tr>`;
      html += `<tr><td>Long-term</td><td>${pat.longTerm ?? 0}</td></tr>`;
      html += "</table>";
    }
    html += '<div style="font-weight:600;margin:16px 0 8px">Hook Queue</div>';
    html += '<table class="data"><tr><th>Property</th><th>Value</th></tr>';
    html += `<tr><td>Pending items (hook-queue.jsonl)</td><td><span class="badge ${(data.queueSize ?? 0) > 0 ? "badge-yellow" : "badge-green"}">${data.queueSize ?? 0}</span></td></tr>`;
    html += "</table>";
    if (data.routeCache) {
      html += '<div style="font-weight:600;margin:16px 0 8px">Route Cache</div>';
      html += `<pre class="code" style="max-height:150px">${escapeHtml2(JSON.stringify(data.routeCache, null, 2))}</pre>`;
    }
    el.innerHTML = html;
  }
  async function renderSecurityAudit(el) {
    const res = await fetch("/api/security-audit");
    const data = await res.json();
    if (!data || !data.lastScan && !data.cveCount && !Object.keys(data).length) {
      el.innerHTML = '<div style="color:var(--text-dim);padding:20px">No security audit data available.</div>';
      return;
    }
    let html = '<div style="font-weight:600;margin-bottom:8px">Security Audit</div>';
    html += '<table class="data"><tr><th>Property</th><th>Value</th></tr>';
    html += `<tr><td>Last Scan</td><td>${formatDt(data.lastScan)}</td></tr>`;
    html += `<tr><td>CVE Count</td><td>${data.cveCount ?? 0}</td></tr>`;
    if (data.severity && typeof data.severity === "object") {
      for (const [level, count] of Object.entries(data.severity)) {
        const badge = level === "critical" || level === "high" ? "badge-red" : level === "medium" ? "badge-yellow" : "badge-green";
        html += `<tr><td>Severity: ${escapeHtml2(level)}</td><td><span class="badge ${badge}">${count}</span></td></tr>`;
      }
    }
    for (const [k, v] of Object.entries(data)) {
      if (["lastScan", "cveCount", "severity"].includes(k)) continue;
      const display = typeof v === "object" ? JSON.stringify(v) : String(v);
      html += `<tr><td>${escapeHtml2(String(k))}</td><td>${escapeHtml2(display)}</td></tr>`;
    }
    html += "</table>";
    el.innerHTML = html;
  }
  function escapeHtml2(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function formatDt(raw) {
    if (!raw) return "\u2014";
    const d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, "0");
    const D = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    const s = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    const tz = new Intl.DateTimeFormat("en", { timeZoneName: "shortOffset" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? new Intl.DateTimeFormat("en", { timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "";
    return `${Y}${M}${D} ${h}:${m}:${s}.${ms} ${tz}`.trim();
  }
  var ISO_RE = /"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[^"]*"/g;
  function formatJsonDates(json) {
    return json.replace(ISO_RE, (match) => {
      const raw = match.slice(1, -1);
      return `"${formatDt(raw)}"`;
    });
  }

  // src/panels/brain-chat.ts
  function initBrainChat() {
    const input = document.getElementById("brain-query");
    const btn = document.getElementById("brain-search-btn");
    const results = document.getElementById("brain-results");
    loadBrainStatus(results);
    btn.addEventListener("click", () => doSearch(input, results));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch(input, results);
    });
  }
  async function loadBrainStatus(container) {
    try {
      const res = await fetch("/api/brain/status");
      const data = await res.json();
      container.innerHTML = `
      <div class="brain-result" style="border-color:${data.configured ? "var(--color-found)" : "var(--color-missing)"}">
        <div style="font-weight:600;margin-bottom:4px">Brain Status</div>
        <div>Configured: ${data.configured ? "\u2713 Yes" : "\u2717 No"}</div>
        ${data.brain?.url ? `<div>URL: ${data.brain.url}</div>` : ""}
        ${data.brain?.hasKey ? "<div>API Key: \u2713 present</div>" : ""}
        ${data.seed ? `<div>Seed: ${JSON.stringify(data.seed).slice(0, 100)}</div>` : ""}
        <div>Writes: ${data.writeCount || 0}</div>
      </div>
      <div style="color:var(--text-dim);margin-top:8px">Type a query above and press Enter to search the collective brain.</div>
    `;
    } catch (err) {
      container.innerHTML = `<div style="color:var(--color-missing)">Failed to load brain status: ${err}</div>`;
    }
  }
  async function doSearch(input, container) {
    const query = input.value.trim();
    if (!query) return;
    container.innerHTML = '<div style="color:var(--text-dim)">Searching...</div>';
    try {
      const res = await fetch("/api/brain/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      const data = await res.json();
      if (data.error) {
        container.innerHTML = `<div style="color:var(--color-degraded)">${data.error}</div>`;
        return;
      }
      if (!data.results?.length) {
        container.innerHTML = '<div style="color:var(--text-dim)">No results found.</div>';
        return;
      }
      container.innerHTML = data.results.map((r, i) => `
      <div class="brain-result">
        <div style="display:flex;justify-content:space-between;margin-bottom:4px">
          <span style="font-weight:600">${escapeHtml3(r.title || r.id || "Result")}</span>
          ${r.score !== void 0 ? `<span class="score">${(r.score * 100).toFixed(1)}%</span>` : ""}
        </div>
        <div>${escapeHtml3(r.content || r.text || JSON.stringify(r).slice(0, 500))}</div>
        ${r.tags ? `<div style="margin-top:4px;color:var(--text-dim)">${r.tags.join(", ")}</div>` : ""}
        <button class="brain-investigate-btn" data-idx="${i}"
          style="margin-top:6px;padding:3px 10px;font-size:0.85em;cursor:pointer;
                 background:var(--bg-card,#1e1e2e);color:var(--text-dim,#aaa);
                 border:1px solid var(--text-dim,#555);border-radius:4px">
          Investigate further
        </button>
      </div>
    `).join("");
      container.querySelectorAll(".brain-investigate-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.dataset.idx);
          const r = data.results[idx];
          const deeper = r.title || r.content || r.text || "";
          input.value = deeper;
          doSearch(input, container);
        });
      });
    } catch (err) {
      container.innerHTML = `<div style="color:var(--color-missing)">Search failed: ${err}</div>`;
    }
  }
  function escapeHtml3(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // src/panels/summary-bar.ts
  var projectName = "";
  async function loadProjectInfo() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      const current = data.projects?.find((p) => p.isCurrent);
      if (current) {
        const parts = current.name.split("-").filter(Boolean);
        projectName = parts.length > 3 ? parts.slice(3).join("-") : parts.join("-");
      }
    } catch {
    }
  }

  // src/panels/toast.ts
  function showMcpOutput(text, success) {
    document.getElementById("mcp-toast")?.remove();
    let formatted;
    try {
      const parsed = JSON.parse(text);
      formatted = JSON.stringify(parsed, null, 2);
    } catch {
      formatted = text;
    }
    const toast = document.createElement("div");
    toast.id = "mcp-toast";
    toast.style.cssText = `
    position: fixed; top: 80px; right: 16px; z-index: 200;
    max-width: 480px; max-height: 350px; overflow: auto;
    background: #1e293b; border: 1px solid ${success ? "#d97706" : "#ef4444"};
    border-radius: 8px; padding: 12px; font-size: 11px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5); color: #e2e8f0;
  `;
    const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    toast.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-weight:600;color:${success ? "#fbbf24" : "#ef4444"}">${success ? "MCP Result" : "MCP Error"}</span>
      <span style="cursor:pointer;color:#94a3b8;font-size:16px" id="mcp-toast-close">&times;</span>
    </div>
    <pre style="white-space:pre-wrap;word-break:break-all;max-height:280px;overflow:auto;font-size:11px;margin:0;color:#cbd5e1">${esc(formatted.slice(0, 5e3))}</pre>
  `;
    document.body.appendChild(toast);
    document.getElementById("mcp-toast-close").addEventListener("click", () => toast.remove());
    setTimeout(() => toast.remove(), 15e3);
  }

  // src/panels/pulse-map.ts
  var WORKER_BUTTONS = [
    {
      btnId: "wrk-map-btn",
      worker: "map",
      label: "Map",
      pulseEdges: ["eng_cli_tools\u2192wrk_map", "wrk_map\u2192json_graph_state"]
    },
    {
      btnId: "wrk-audit-btn",
      worker: "audit",
      label: "Audit",
      pulseEdges: ["eng_cli_tools\u2192wrk_audit", "wrk_audit\u2192json_security_audit"]
    },
    {
      btnId: "wrk-optimize-btn",
      worker: "optimize",
      label: "Optimize",
      pulseEdges: ["eng_cli_tools\u2192wrk_optimize", "wrk_optimize\u2192db_patterns"]
    },
    {
      btnId: "wrk-consolidate-btn",
      worker: "consolidate",
      label: "Consolidate",
      pulseEdges: ["eng_cli_tools\u2192wrk_consolidate", "wrk_consolidate\u2192json_graph_state", "wrk_consolidate\u2192json_auto_memory"]
    },
    {
      btnId: "wrk-testgaps-btn",
      worker: "testgaps",
      label: "TestGaps",
      pulseEdges: ["eng_cli_tools\u2192wrk_testgaps", "wrk_testgaps\u2192json_daemon_logs"]
    },
    {
      btnId: "wrk-preload-btn",
      worker: "preload",
      label: "Preload",
      pulseEdges: ["eng_cli_tools\u2192wrk_preload", "wrk_preload\u2192mdl_onnx", "wrk_preload\u2192bin_hnsw_index"]
    },
    {
      btnId: "wrk-ultralearn-btn",
      worker: "ultralearn",
      label: "UltraLearn",
      pulseEdges: ["eng_cli_tools\u2192wrk_ultralearn"]
    },
    {
      btnId: "wrk-deepdive-btn",
      worker: "deepdive",
      label: "DeepDive",
      pulseEdges: ["eng_cli_tools\u2192wrk_deepdive"]
    },
    {
      btnId: "wrk-document-btn",
      worker: "document",
      label: "Document",
      pulseEdges: ["eng_cli_tools\u2192wrk_document"]
    }
  ];
  var BRIDGE_EDGES = [
    "eng_hook_handler\u2192eng_memory_bridge",
    "eng_auto_memory\u2192eng_memory_bridge",
    "eng_memory_bridge\u2192db_memory"
  ];
  var LEARNING_BUTTONS = [
    {
      btnId: "lrn-pretrain-btn",
      action: "pretrain",
      label: "Seed",
      pulseEdges: ["eng_intelligence\u2192json_intelligence_snapshot", "eng_intelligence\u2192json_graph_state"]
    },
    {
      btnId: "lrn-sona-btn",
      action: "sona",
      label: "Learn",
      pulseEdges: [...BRIDGE_EDGES, "eng_sona_optimizer\u2192db_memory"]
    },
    {
      btnId: "lrn-ewc-btn",
      action: "ewc",
      label: "Protect",
      pulseEdges: [...BRIDGE_EDGES, "eng_ewc_consolidation\u2192db_memory", "eng_intelligence\u2192json_intelligence_snapshot"]
    },
    {
      btnId: "lrn-intel-btn",
      action: "intelligence",
      label: "Consolidate",
      pulseEdges: ["eng_intelligence\u2192json_intelligence_snapshot", "eng_intelligence\u2192json_graph_state"]
    },
    {
      btnId: "lrn-promote-btn",
      action: "promote",
      label: "Promote",
      pulseEdges: [...BRIDGE_EDGES, "eng_memory_bridge\u2192ctrl_mem_consolidation", "eng_memory_bridge\u2192ctrl_reasoning_bank"]
    },
    {
      btnId: "lrn-full-btn",
      action: "full-cycle",
      label: "Full Cycle",
      pulseEdges: [...BRIDGE_EDGES, "eng_memory_bridge\u2192ctrl_reasoning_bank", "eng_memory_bridge\u2192ctrl_mem_consolidation", "eng_memory_bridge\u2192ctrl_hierarchical_mem", "eng_memory_bridge\u2192ctrl_causal_graph", "eng_memory_bridge\u2192ctrl_semantic_router", "eng_intelligence\u2192json_intelligence_snapshot", "eng_intelligence\u2192json_graph_state", "eng_sona_optimizer\u2192db_memory", "eng_ewc_consolidation\u2192db_memory"]
    }
  ];
  var LAYER_BUTTONS = [
    { id: "layer-L1-btn", layer: "L1", action: "layer-L1", label: "L1 Pat" },
    { id: "layer-L2b-btn", layer: "L2b", action: "layer-L2", label: "L2b Dup" },
    { id: "layer-L3-btn", layer: "L3", action: "layer-L3", label: "L3 Mem" },
    { id: "layer-L4-btn", layer: "L4", action: "layer-L4", label: "L4 Cons" },
    { id: "layer-L5-btn", layer: "L5", action: "layer-L5", label: "L5 Reas" },
    { id: "layer-L6-btn", layer: "L6", action: "layer-L6", label: "L6 EWC" },
    { id: "layer-L7-btn", layer: "L7", action: "layer-L7", label: "L7 Nght" }
  ];
  var FULL_CYCLE_STEPS = ["pretrain", "sona", "ewc", "intelligence", "promote"];
  var STEP_TO_PIPELINE = {
    pretrain: "lrn-pretrain-btn",
    sona: "lrn-sona-btn",
    ewc: "lrn-ewc-btn",
    intelligence: "lrn-intel-btn",
    promote: "lrn-promote-btn"
  };
  var STEP_TO_LAYERS = {
    pretrain: [],
    sona: ["layer-L1-btn", "layer-L5-btn"],
    ewc: ["layer-L6-btn"],
    intelligence: ["layer-L4-btn"],
    promote: ["layer-L1-btn", "layer-L2b-btn", "layer-L3-btn", "layer-L5-btn", "layer-L7-btn"]
  };
  var MCP_BUTTONS = [
    // All tools go through claude-flow MCP (ruvector is bundled inside it)
    { btnId: "mcp-intel-btn", server: "claude-flow", tool: "hooks_intelligence_stats", label: "Intelligence", icon: "\u{1F9E0}" },
    { btnId: "mcp-recall-btn", server: "claude-flow", tool: "hooks_intelligence_pattern-search", label: "Recall", icon: "\u{1F50D}", promptArg: "query" },
    { btnId: "mcp-metrics-btn", server: "claude-flow", tool: "hooks_metrics", label: "Metrics", icon: "\u{1F4CA}" },
    { btnId: "mcp-memstats-btn", server: "claude-flow", tool: "memory_stats", label: "Memory Stats", icon: "\u{1F4BE}" },
    { btnId: "mcp-doctor-btn", server: "claude-flow", tool: "hooks_intelligence", label: "Doctor", icon: "\u{1FA7A}" },
    { btnId: "mcp-learn-btn", server: "claude-flow", tool: "hooks_intelligence_learn", label: "Force Learn", icon: "\u26A1" },
    { btnId: "mcp-sona-btn", server: "claude-flow", tool: "hooks_intelligence_learn", label: "SONA+EWC", icon: "\u{1F9E0}", args: { consolidate: true } },
    { btnId: "mcp-ast-btn", server: "claude-flow", tool: "hooks_intelligence_attention", label: "Attention", icon: "\u{1F333}" },
    { btnId: "mcp-cluster-btn", server: "claude-flow", tool: "memory_search", label: "Search", icon: "\u{1F517}", promptArg: "query" },
    { btnId: "mcp-route-btn", server: "claude-flow", tool: "hooks_model-route", label: "Route", icon: "\u{1F9ED}", promptArg: "task" }
  ];

  // src/panels/worker-buttons.ts
  function initWorkerButtons() {
    for (const wb of WORKER_BUTTONS) {
      const btn = document.getElementById(wb.btnId);
      if (!btn) continue;
      btn.addEventListener("click", async () => {
        btn.textContent = "\u23F3 " + wb.label + "...";
        btn.setAttribute("disabled", "");
        try {
          const res = await fetch("/api/daemon/trigger", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ worker: wb.worker })
          });
          const data = await res.json();
          btn.textContent = data.ok ? "\u2713 " + wb.label : "\u2717 " + wb.label;
          if (data.ok) {
            for (const ek of wb.pulseEdges) pulseEdge(ek, 0.8);
          }
          if (data.output || data.error) {
            showMcpOutput(data.output || data.error, data.ok !== false);
          }
        } catch {
          btn.textContent = "\u2717 " + wb.label;
        }
        btn.removeAttribute("disabled");
        setTimeout(() => {
          btn.textContent = "\u2699 " + wb.label;
        }, 3e3);
      });
    }
  }

  // src/panels/learning-pipeline.ts
  function initPipelineButtons() {
    for (const lb of LEARNING_BUTTONS) {
      const btn = document.getElementById(lb.btnId);
      if (!btn) continue;
      btn.dataset.label = lb.label;
      btn.addEventListener("click", async () => {
        btn.textContent = "\u23F3 " + lb.label + "...";
        btn.setAttribute("disabled", "");
        try {
          const res = await fetch("/api/learning/trigger", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: lb.action })
          });
          const data = await res.json();
          const ok = data.ok;
          btn.textContent = (ok ? "\u2713 " : "\u2717 ") + lb.label;
          if (ok) {
            for (const ek of lb.pulseEdges) pulseEdge(ek, 0.9);
          }
          if (data.results) {
            const summary = data.results.map(
              (r) => `${r.ok ? "\u2713" : "\u2717"} ${r.step}: ${r.output || r.error || ""}`
            ).join("\n");
            showMcpOutput(summary, ok);
          }
        } catch (e) {
          btn.textContent = "\u2717 " + lb.label;
          console.error("[Learning]", e);
        }
        btn.removeAttribute("disabled");
        setTimeout(() => {
          btn.textContent = "\u26A1 " + lb.label;
        }, 4e3);
      });
    }
  }
  async function triggerLayer(lb) {
    const btn = document.getElementById(lb.id);
    if (!btn) return { ok: false };
    btn.textContent = "\u23F3 " + lb.label + "...";
    btn.setAttribute("disabled", "");
    btn.style.background = "rgba(250,204,21,0.15)";
    try {
      const res = await fetch("/api/learning/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: lb.action })
      });
      const data = await res.json();
      btn.textContent = (data.ok ? "\u2713 " : "\u2717 ") + lb.label;
      btn.style.background = data.ok ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)";
      return data;
    } catch {
      btn.textContent = "\u2717 " + lb.label;
      btn.style.background = "rgba(239,68,68,0.2)";
      return { ok: false };
    }
  }
  function resetLayerBtn(lb, delayMs) {
    const btn = document.getElementById(lb.id);
    if (!btn) return;
    setTimeout(() => {
      btn.textContent = lb.label;
      btn.style.background = "";
      btn.removeAttribute("disabled");
    }, delayMs);
  }
  function initLayerButtons() {
    for (const lb of LAYER_BUTTONS) {
      document.getElementById(lb.id)?.addEventListener("click", async () => {
        await triggerLayer(lb);
        resetLayerBtn(lb, 4e3);
      });
    }
  }
  function initFullCycle() {
    const fullBtn = document.getElementById("lrn-full-btn");
    if (!fullBtn) return;
    const newFullBtn = fullBtn.cloneNode(true);
    fullBtn.parentNode.replaceChild(newFullBtn, fullBtn);
    newFullBtn.addEventListener("click", async () => {
      newFullBtn.textContent = "\u23F3 Full Cycle...";
      newFullBtn.setAttribute("disabled", "");
      const panel = document.getElementById("layer-panel");
      if (panel) panel.open = true;
      const allResults = [];
      for (const step of FULL_CYCLE_STEPS) {
        const pBtn = document.getElementById(STEP_TO_PIPELINE[step]);
        if (pBtn) {
          pBtn.style.background = "rgba(250,204,21,0.15)";
          pBtn.textContent = "\u23F3 " + pBtn.dataset.label;
        }
        for (const lId of STEP_TO_LAYERS[step] || []) {
          const lb = document.getElementById(lId);
          if (lb) {
            lb.style.background = "rgba(250,204,21,0.15)";
          }
        }
        let stepOk = false;
        let stepResults = [];
        try {
          const res = await fetch("/api/learning/trigger", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: step })
          });
          const data = await res.json();
          stepOk = !!data.ok;
          stepResults = data.results || [];
          for (const r of stepResults) allResults.push(r);
        } catch {
          stepOk = false;
          allResults.push({ step, ok: false, error: "fetch failed" });
        }
        const bg = stepOk ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)";
        const icon = stepOk ? "\u2713" : "\u2717";
        if (pBtn) {
          pBtn.style.background = bg;
          pBtn.textContent = icon + " " + (pBtn.dataset.label || step);
        }
        for (const lId of STEP_TO_LAYERS[step] || []) {
          const lb = document.getElementById(lId);
          if (lb) {
            lb.style.background = bg;
            lb.textContent = icon + " " + (LAYER_BUTTONS.find((l) => l.id === lId)?.label || "");
          }
        }
        const matchingLB = LEARNING_BUTTONS.find((l) => l.action === step);
        if (stepOk && matchingLB) {
          for (const ek of matchingLB.pulseEdges) pulseEdge(ek, 0.9);
        }
      }
      const allOk = allResults.every((r) => r.ok);
      newFullBtn.textContent = (allOk ? "\u2713" : "\u26A0") + " Full Cycle";
      const summary = allResults.map((r) => `${r.ok ? "\u2713" : "\u2717"} ${r.step}: ${r.output || r.error || ""}`).join("\n");
      showMcpOutput(summary, allOk);
      setTimeout(() => {
        for (const [, id] of Object.entries(STEP_TO_PIPELINE)) {
          const b = document.getElementById(id);
          if (b) {
            b.style.background = "";
            b.textContent = "\u26A1 " + (b.dataset.label || "");
          }
        }
        for (const lb of LAYER_BUTTONS) resetLayerBtn(lb, 0);
        newFullBtn.textContent = "\u26A1 Full Cycle";
        newFullBtn.removeAttribute("disabled");
      }, 6e3);
    });
  }
  function initLearningPipeline() {
    initPipelineButtons();
    initLayerButtons();
    initFullCycle();
  }

  // src/panels/mcp-buttons.ts
  function initMcpButtons() {
    for (const mb of MCP_BUTTONS) {
      const btn = document.getElementById(mb.btnId);
      if (!btn) continue;
      btn.addEventListener("click", async () => {
        let args = mb.args ? { ...mb.args } : {};
        if (mb.promptArg) {
          const val = prompt(`Enter ${mb.promptArg}:`);
          if (!val) return;
          args[mb.promptArg] = val;
        }
        btn.textContent = "\u23F3 " + mb.label + "...";
        btn.setAttribute("disabled", "");
        try {
          const res = await fetch(`/api/mcp/${mb.server}/${mb.tool}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ args })
          });
          const data = await res.json();
          btn.textContent = data.ok ? "\u2713 " + mb.label : "\u2717 " + mb.label;
          if (data.output || data.error) {
            showMcpOutput(data.output || data.error, data.ok !== false);
          }
        } catch {
          btn.textContent = "\u2717 " + mb.label;
        }
        btn.removeAttribute("disabled");
        setTimeout(() => {
          btn.textContent = mb.icon + " " + mb.label;
        }, 4e3);
      });
    }
  }

  // src/panels/inspect-buttons.ts
  var INSPECT_BUTTONS = [
    { btnId: "inspect-hm-btn", endpoint: "/api/inspect/hm-tiers", label: "HM Tiers" },
    { btnId: "inspect-patterns-btn", endpoint: "/api/inspect/patterns-stats", label: "Patterns" },
    { btnId: "inspect-ewc-btn", endpoint: "/api/inspect/ewc-fisher", label: "EWC Fisher" },
    { btnId: "inspect-skills-btn", endpoint: "/api/inspect/skills", label: "Skills" }
  ];
  function initInspectButtons() {
    for (const ib of INSPECT_BUTTONS) {
      const btn = document.getElementById(ib.btnId);
      if (!btn) continue;
      btn.addEventListener("click", async () => {
        btn.textContent = "\u23F3 " + ib.label + "...";
        btn.setAttribute("disabled", "");
        try {
          const res = await fetch(ib.endpoint);
          const data = await res.json();
          btn.textContent = data.ok ? "\u2713 " + ib.label : "\u2717 " + ib.label;
          showMcpOutput(JSON.stringify(data, null, 2), data.ok !== false);
        } catch {
          btn.textContent = "\u2717 " + ib.label;
        }
        btn.removeAttribute("disabled");
        setTimeout(() => {
          btn.textContent = ib.label;
        }, 4e3);
      });
    }
  }

  // src/panels/session-buttons.ts
  var BRIDGE_EDGES2 = [
    "eng_hook_handler\u2192eng_memory_bridge",
    "eng_auto_memory\u2192eng_memory_bridge",
    "eng_memory_bridge\u2192db_memory"
  ];
  function initSessionButtons() {
    document.getElementById("session-end-btn")?.addEventListener("click", async () => {
      const btn = document.getElementById("session-end-btn");
      btn.textContent = "\u23F3 Session End...";
      btn.setAttribute("disabled", "");
      try {
        const res = await fetch("/api/session/end-sim", { method: "POST" });
        const data = await res.json();
        btn.textContent = data.ok ? "\u2713 Done" : "\u26A0 Partial";
        if (data.ok) {
          for (const ek of BRIDGE_EDGES2) pulseEdge(ek, 0.9);
        }
        const summary = (data.results || []).map(
          (r) => `${r.ok ? "\u2713" : "\u2717"} ${r.step}: ${r.output || r.error || ""}`
        ).join("\n");
        showMcpOutput(summary, data.ok);
      } catch {
        btn.textContent = "\u2717 Failed";
      }
      btn.removeAttribute("disabled");
      setTimeout(() => {
        btn.textContent = "\u26A0 Session End";
      }, 6e3);
    });
  }

  // src/panels/reward-heatmap.ts
  var COLORS = [
    { max: 0.3, color: "#ef4444", label: "Poor" },
    { max: 0.6, color: "#f59e0b", label: "Below avg" },
    { max: 0.8, color: "#eab308", label: "Average" },
    { max: 0.95, color: "#22c55e", label: "Good" },
    { max: 1.01, color: "#4ade80", label: "Excellent" }
  ];
  function rewardColor(r) {
    for (const c of COLORS) if (r <= c.max) return c.color;
    return "#4ade80";
  }
  var currentMode = "raw";
  function parseMeta(row) {
    try {
      return JSON.parse(row.metadata || "{}");
    } catch {
      return {};
    }
  }
  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  function renderHeatmap(container, rows) {
    if (!rows.length) {
      container.innerHTML = '<div style="color:#94a3b8;padding:24px;text-align:center">No learning experiences found. Run some operations to generate reward data.</div>';
      return;
    }
    const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
    const width = Math.max(100, container.clientWidth - 32);
    const dotR = 6;
    const dotGap = 3;
    const dotsPerRow = Math.max(1, Math.floor(width / (dotR * 2 + dotGap)));
    const svgRows = Math.ceil(sorted.length / dotsPerRow);
    const rowH = dotR * 2 + dotGap + 14;
    const svgH = svgRows * rowH + 60;
    let html = "";
    html += '<div style="display:flex;gap:6px;margin-bottom:12px">';
    for (const m of ["raw", "rolling", "by-tool"]) {
      const active = m === currentMode ? "background:#8b5cf6;color:#fff;border-color:#8b5cf6" : "";
      html += `<button class="heatmap-mode-btn" data-mode="${m}" style="padding:3px 10px;font-size:11px;border:1px solid #334155;border-radius:4px;background:#1e293b;color:#94a3b8;cursor:pointer;font-family:inherit;${active}">${m === "by-tool" ? "By Tool" : m.charAt(0).toUpperCase() + m.slice(1)}</button>`;
    }
    html += "</div>";
    html += '<div style="display:flex;gap:12px;margin-bottom:10px;font-size:10px;color:#94a3b8">';
    for (const c of COLORS) {
      html += `<span><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.color};vertical-align:middle"></span> ${c.label}</span>`;
    }
    html += `<span style="margin-left:auto">${sorted.length} experiences</span>`;
    html += "</div>";
    if (currentMode === "raw") {
      html += `<svg width="${width}" height="${svgH}" style="display:block">`;
      sorted.forEach((row, i) => {
        const col = i % dotsPerRow;
        const rowIdx = Math.floor(i / dotsPerRow);
        const cx = col * (dotR * 2 + dotGap) + dotR + 4;
        const cy = rowIdx * rowH + dotR + 4;
        const meta = parseMeta(row);
        const tip = `reward: ${row.reward?.toFixed(3)}&#10;tool: ${meta.toolName || row.action}&#10;latency: ${meta.latencyMs || "?"}ms&#10;time: ${formatTime(row.timestamp)}`;
        html += `<circle cx="${cx}" cy="${cy}" r="${dotR}" fill="${rewardColor(row.reward)}" opacity="0.85" style="cursor:pointer"><title>${tip}</title></circle>`;
      });
      html += "</svg>";
    } else if (currentMode === "rolling") {
      const windowSize = 10;
      const avgs = [];
      for (let i = 0; i < sorted.length; i++) {
        const start = Math.max(0, i - windowSize + 1);
        const window2 = sorted.slice(start, i + 1);
        const avg = window2.reduce((s, r) => s + r.reward, 0) / window2.length;
        avgs.push({ ts: sorted[i].timestamp, avg });
      }
      const chartW = width - 16;
      const chartH = 160;
      const minTs = avgs[0]?.ts || 0;
      const maxTs = avgs[avgs.length - 1]?.ts || 1;
      const range = maxTs - minTs || 1;
      html += `<svg width="${chartW}" height="${chartH + 30}" style="display:block">`;
      for (let y = 0; y <= 1; y += 0.25) {
        const py = chartH - y * chartH;
        html += `<line x1="0" y1="${py}" x2="${chartW}" y2="${py}" stroke="#334155" stroke-width="0.5"/>`;
        html += `<text x="${chartW - 2}" y="${py - 3}" fill="#64748b" font-size="9" text-anchor="end">${y.toFixed(2)}</text>`;
      }
      const points = avgs.map((a) => {
        const x = (a.ts - minTs) / range * chartW;
        const y = chartH - a.avg * chartH;
        return `${x},${y}`;
      });
      html += `<polyline points="${points.join(" ")}" fill="none" stroke="#8b5cf6" stroke-width="2"/>`;
      avgs.forEach((a) => {
        const x = (a.ts - minTs) / range * chartW;
        const y = chartH - a.avg * chartH;
        html += `<circle cx="${x}" cy="${y}" r="3" fill="${rewardColor(a.avg)}"><title>avg: ${a.avg.toFixed(3)}</title></circle>`;
      });
      html += `<text x="${chartW / 2}" y="${chartH + 22}" fill="#64748b" font-size="10" text-anchor="middle">Rolling average (window=${windowSize})</text>`;
      html += "</svg>";
    } else {
      const byTool = {};
      for (const row of sorted) {
        const meta = parseMeta(row);
        const tool = meta.toolName || row.action || "unknown";
        (byTool[tool] ??= []).push(row);
      }
      html += '<div style="display:flex;flex-direction:column;gap:10px">';
      for (const [tool, toolRows] of Object.entries(byTool).sort((a, b) => b[1].length - a[1].length)) {
        const avg = toolRows.reduce((s, r) => s + r.reward, 0) / toolRows.length;
        html += `<div style="border:1px solid #334155;border-radius:6px;padding:8px">`;
        html += `<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-weight:600;font-size:12px">${tool}</span><span style="font-size:11px;color:#94a3b8">${toolRows.length} calls, avg ${avg.toFixed(3)}</span></div>`;
        html += '<div style="display:flex;gap:2px;flex-wrap:wrap">';
        for (const r of toolRows) {
          html += `<span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${rewardColor(r.reward)}" title="reward: ${r.reward?.toFixed(3)}"></span>`;
        }
        html += "</div></div>";
      }
      html += "</div>";
    }
    container.innerHTML = html;
    container.querySelectorAll(".heatmap-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentMode = btn.dataset.mode;
        renderHeatmap(container, rows);
      });
    });
  }
  var refreshInterval = null;
  function initRewardHeatmap() {
    const container = document.getElementById("rewards-content");
    if (!container) return;
    async function load() {
      if (!container.clientWidth) return;
      try {
        const resp = await fetch("/api/rewards?limit=500");
        const data = await resp.json();
        renderHeatmap(container, data.rewards || []);
      } catch (err) {
        container.innerHTML = `<div style="color:#ef4444;padding:16px">Error loading rewards: ${err}</div>`;
      }
    }
    load();
    refreshInterval = setInterval(load, 15e3);
  }

  // src/panels/trajectory-timeline.ts
  function verdictColor(verdict) {
    if (verdict === "success") return "#22c55e";
    if (verdict === "partial") return "#94a3b8";
    if (verdict === "abandoned") return "#f59e0b";
    return "#6b7280";
  }
  function verdictBg(verdict) {
    if (verdict === "success") return "rgba(34,197,94,0.15)";
    if (verdict === "partial") return "rgba(148,163,184,0.1)";
    if (verdict === "abandoned") return "rgba(245,158,11,0.15)";
    return "rgba(107,114,128,0.1)";
  }
  function formatTs(ts) {
    if (!ts) return "?";
    const d = new Date(typeof ts === "number" ? ts : ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function rewardDot(r) {
    if (r >= 0.95) return "#4ade80";
    if (r >= 0.8) return "#22c55e";
    if (r >= 0.6) return "#eab308";
    if (r >= 0.3) return "#f59e0b";
    return "#ef4444";
  }
  var expandedTrajs = /* @__PURE__ */ new Set();
  function renderTimeline(container, trajectories) {
    if (!trajectories.length) {
      container.innerHTML = '<div style="color:#94a3b8;padding:24px;text-align:center">No trajectories found. Trajectories are recorded during Claude sessions.</div>';
      return;
    }
    const bySession = {};
    for (const t of trajectories) {
      const sid = t.session_id || "unknown";
      (bySession[sid] ??= []).push(t);
    }
    const maxSteps = Math.max(1, ...trajectories.map((t) => t.total_steps || 1));
    let html = "";
    html += `<div style="font-size:11px;color:#94a3b8;margin-bottom:12px">${trajectories.length} trajectories across ${Object.keys(bySession).length} sessions</div>`;
    const sessionEntries = Object.entries(bySession).sort((a, b) => {
      const latestA = Math.max(...a[1].map(t => new Date(t.started_at).getTime() || 0));
      const latestB = Math.max(...b[1].map(t => new Date(t.started_at).getTime() || 0));
      return latestB - latestA;
    });
    for (const [sessionId, trajs] of sessionEntries) {
      const shortSid = sessionId.length > 25 ? "..." + sessionId.slice(-18) : sessionId;
      html += `<div style="margin-bottom:16px">`;
      html += `<div style="font-size:12px;font-weight:600;color:#e2e8f0;margin-bottom:6px;display:flex;align-items:center;gap:6px">`;
      html += `<span style="color:#64748b">Session</span> ${shortSid}`;
      html += `<span style="font-size:10px;color:#64748b;font-weight:400">(${trajs.length} traj)</span>`;
      html += `</div>`;
      for (const t of trajs) {
        const barWidth = Math.max(20, t.total_steps / maxSteps * 100);
        const avgReward = t.total_steps > 0 ? t.total_reward / t.total_steps : 0;
        const expanded = expandedTrajs.has(t.id);
        const shortId = t.id.length > 20 ? t.id.slice(0, 8) + "..." : t.id;
        html += `<div style="margin-left:16px;margin-bottom:4px">`;
        html += `<div class="traj-row" data-traj-id="${t.id}" style="display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:4px;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='#1e293b'" onmouseout="this.style.background='transparent'">`;
        html += `<span style="font-size:10px;color:#64748b;width:70px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis" title="${t.id}">[${shortId}]</span>`;
        html += `<div style="width:${barWidth}%;height:14px;border-radius:3px;background:${verdictBg(t.verdict)};border:1px solid ${verdictColor(t.verdict)};position:relative;min-width:20px">`;
        html += `<div style="position:absolute;inset:0;border-radius:3px;background:${verdictColor(t.verdict)};opacity:0.3"></div>`;
        html += `</div>`;
        html += `<span style="font-size:11px;color:#e2e8f0;white-space:nowrap">${t.total_steps} steps</span>`;
        html += `<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${verdictBg(t.verdict)};color:${verdictColor(t.verdict)}">${t.verdict || t.status}</span>`;
        if (t.total_steps > 0) {
          html += `<span style="font-size:10px;color:#94a3b8">(${avgReward.toFixed(2)} avg)</span>`;
        }
        html += `<span style="font-size:10px;color:#64748b;margin-left:auto">[${formatTs(t.started_at)}-${formatTs(t.ended_at)}]</span>`;
        html += `</div>`;
        html += `<div class="traj-steps" data-traj-id="${t.id}" style="display:${expanded ? "block" : "none"};margin-left:24px;margin-top:2px;margin-bottom:6px;padding:6px 10px;background:#0f172a;border-radius:4px;border:1px solid #1e293b">`;
        if (expanded) {
          html += `<div style="color:#64748b;font-size:10px">Loading steps...</div>`;
        }
        html += `</div>`;
        html += `</div>`;
      }
      html += `</div>`;
    }
    container.innerHTML = html;
    container.querySelectorAll(".traj-row").forEach((row) => {
      row.addEventListener("click", async () => {
        const trajId = row.dataset.trajId;
        const stepsDiv = container.querySelector(`.traj-steps[data-traj-id="${trajId}"]`);
        if (!stepsDiv) return;
        if (expandedTrajs.has(trajId)) {
          expandedTrajs.delete(trajId);
          stepsDiv.style.display = "none";
          return;
        }
        expandedTrajs.add(trajId);
        stepsDiv.style.display = "block";
        stepsDiv.innerHTML = '<div style="color:#64748b;font-size:10px">Loading steps...</div>';
        try {
          const resp = await fetch(`/api/trajectories/${encodeURIComponent(trajId)}/steps`);
          const data = await resp.json();
          const steps = data.steps || [];
          if (!steps.length) {
            stepsDiv.innerHTML = '<div style="color:#64748b;font-size:10px">No steps recorded</div>';
            return;
          }
          const sortedSteps = [...steps].sort((a, b) => b.step_number - a.step_number);
          let stepsHtml = "";
          for (const step of sortedSteps) {
            stepsHtml += `<div style="display:flex;align-items:flex-start;gap:8px;padding:3px 0;font-size:11px">`;
            stepsHtml += `<span style="color:#64748b;width:50px;flex-shrink:0">Step ${step.step_number}</span>`;
            stepsHtml += `<span style="color:#e2e8f0;flex:1;word-break:break-word;white-space:pre-wrap">${step.action || "-"}</span>`;
            stepsHtml += `<span style="color:${rewardDot(step.reward)};font-size:10px">reward=${step.reward?.toFixed(3) ?? "?"}</span>`;
            stepsHtml += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${rewardDot(step.reward)}"></span>`;
            stepsHtml += `</div>`;
          }
          stepsDiv.innerHTML = stepsHtml;
        } catch (err) {
          stepsDiv.innerHTML = `<div style="color:#ef4444;font-size:10px">Error: ${err}</div>`;
        }
      });
    });
  }
  var refreshInterval2 = null;
  function initTrajectoryTimeline() {
    const container = document.getElementById("trajectory-content");
    if (!container) return;
    async function load() {
      try {
        const resp = await fetch("/api/trajectories?limit=100");
        const data = await resp.json();
        renderTimeline(container, data.trajectories || []);
      } catch (err) {
        container.innerHTML = `<div style="color:#ef4444;padding:16px">Error loading trajectories: ${err}</div>`;
      }
    }
    load();
    refreshInterval2 = setInterval(load, 15e3);
  }

  // src/panels/controller-health.ts
  var currentSort = "level";
  var showDisabledOnly = false;
  function levelOrder(lvl) {
    if (!lvl) return 99;
    const m = lvl.match(/L(\d+)/);
    return m ? parseInt(m[1], 10) : 99;
  }
  function sortControllers(list) {
    const sorted = [...list];
    switch (currentSort) {
      case "level":
        sorted.sort((a, b) => levelOrder(a.level) - levelOrder(b.level) || a.name.localeCompare(b.name));
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "methods":
        sorted.sort((a, b) => b.methods - a.methods || a.name.localeCompare(b.name));
        break;
      case "status":
        sorted.sort((a, b) => (a.enabled === b.enabled ? 0 : a.enabled ? -1 : 1) || a.name.localeCompare(b.name));
        break;
    }
    return sorted;
  }
  function statusBadge(ctrl) {
    if (ctrl.error) return '<span style="color:#ef4444" title="' + ctrl.error + '">&#10007;</span>';
    if (!ctrl.enabled) return '<span style="color:#64748b">&#8211;</span>';
    return '<span style="color:#22c55e">&#10003;</span>';
  }
  function renderGrid(container, data) {
    if (data.error && !data.controllers?.length) {
      container.innerHTML = `<div style="color:#ef4444;padding:16px">${data.error}</div>`;
      return;
    }
    let filtered = data.controllers || [];
    if (showDisabledOnly) {
      filtered = filtered.filter((c) => !c.enabled || !!c.error);
    }
    const sorted = sortControllers(filtered);
    let html = "";
    const dead = data.controllers.filter((c) => !c.enabled).length;
    const resurrected = data.controllers.filter((c) => c.wasDeadBeforeFix && c.enabled).length;
    html += '<div style="display:flex;gap:16px;align-items:center;margin-bottom:12px;flex-wrap:wrap">';
    html += `<span style="font-size:13px;font-weight:600;color:#e2e8f0">${data.alive}/${data.total} controllers alive</span>`;
    if (resurrected > 0) {
      html += `<span style="font-size:11px;color:#60a5fa">&#9733; ${resurrected} resurrected (BREAK-5/6/7)</span>`;
    }
    if (dead > 0) {
      html += `<span style="font-size:11px;color:#f59e0b">${dead} disabled</span>`;
    }
    html += "</div>";
    html += '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">';
    for (const key of ["level", "name", "methods", "status"]) {
      const active = key === currentSort ? "background:#8b5cf6;color:#fff;border-color:#8b5cf6" : "";
      html += `<button class="ctrl-sort-btn" data-sort="${key}" style="padding:3px 10px;font-size:11px;border:1px solid #334155;border-radius:4px;background:#1e293b;color:#94a3b8;cursor:pointer;font-family:inherit;${active}">Sort: ${key}</button>`;
    }
    const disabledActive = showDisabledOnly ? "background:#f59e0b;color:#000;border-color:#f59e0b" : "";
    html += `<button class="ctrl-disabled-btn" style="padding:3px 10px;font-size:11px;border:1px solid #334155;border-radius:4px;background:#1e293b;color:#94a3b8;cursor:pointer;font-family:inherit;margin-left:auto;${disabledActive}">Show disabled only</button>`;
    html += "</div>";
    html += '<div style="overflow-x:auto">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr style="border-bottom:1px solid #334155;text-align:left">';
    html += '<th style="padding:6px 8px;color:#94a3b8;font-weight:600">Controller</th>';
    html += '<th style="padding:6px 8px;color:#94a3b8;font-weight:600;width:60px;text-align:center">Status</th>';
    html += '<th style="padding:6px 8px;color:#94a3b8;font-weight:600;width:50px">Level</th>';
    html += '<th style="padding:6px 8px;color:#94a3b8;font-weight:600;width:40px;text-align:center">DB</th>';
    html += '<th style="padding:6px 8px;color:#94a3b8;font-weight:600;width:70px;text-align:right">Methods</th>';
    html += '<th style="padding:6px 8px;color:#94a3b8;font-weight:600">Backend</th>';
    html += '<th style="padding:6px 8px;color:#94a3b8;font-weight:600;width:80px;text-align:right">Init (ms)</th>';
    html += "</tr></thead><tbody>";
    for (const ctrl of sorted) {
      const rowBg = ctrl.wasDeadBeforeFix && ctrl.enabled ? "background:rgba(96,165,250,0.06)" : "";
      const rowBorder = "border-bottom:1px solid #1e293b";
      html += `<tr style="${rowBorder};${rowBg};transition:background 0.15s" onmouseover="this.style.background='#1e293b'" onmouseout="this.style.background='${ctrl.wasDeadBeforeFix && ctrl.enabled ? "rgba(96,165,250,0.06)" : "transparent"}'">`;
      html += `<td style="padding:6px 8px;color:#e2e8f0;font-weight:500">`;
      html += ctrl.name;
      if (ctrl.wasDeadBeforeFix) {
        html += ' <span style="color:#60a5fa;font-size:10px" title="Resurrected by BREAK-5/6/7 fixes">&#9733;</span>';
      }
      if (ctrl.className && ctrl.className !== ctrl.name) {
        html += ` <span style="color:#64748b;font-size:10px">(${ctrl.className})</span>`;
      }
      html += "</td>";
      html += `<td style="padding:6px 8px;text-align:center">${statusBadge(ctrl)}</td>`;
      const levelColor = ctrl.level ? "#e2e8f0" : "#475569";
      html += `<td style="padding:6px 8px;color:${levelColor};font-size:11px">${ctrl.level || "\u2014"}</td>`;
      html += `<td style="padding:6px 8px;text-align:center;color:${ctrl.hasDb ? "#22c55e" : "#475569"};font-size:11px">${ctrl.hasDb ? "&#10003;" : ""}</td>`;
      const methodColor = ctrl.methods > 0 ? "#e2e8f0" : "#475569";
      html += `<td style="padding:6px 8px;text-align:right;color:${methodColor}">${ctrl.methods || "\u2014"}</td>`;
      html += `<td style="padding:6px 8px;color:${ctrl.backend ? "#06b6d4" : "#475569"};font-size:11px">${ctrl.backend || ""}</td>`;
      const initStr = ctrl.initTimeMs != null ? ctrl.initTimeMs.toFixed(0) : "\u2014";
      const initColor = ctrl.initTimeMs != null ? ctrl.initTimeMs > 500 ? "#f59e0b" : "#e2e8f0" : "#475569";
      html += `<td style="padding:6px 8px;text-align:right;color:${initColor};font-size:11px">${initStr}</td>`;
      html += "</tr>";
    }
    html += "</tbody></table></div>";
    html += '<div style="display:flex;gap:16px;margin-top:12px;font-size:10px;color:#64748b">';
    html += '<span><span style="color:#22c55e">&#10003;</span> Enabled</span>';
    html += '<span><span style="color:#64748b">&#8211;</span> Disabled</span>';
    html += '<span><span style="color:#60a5fa">&#9733;</span> Resurrected (BREAK-5/6/7)</span>';
    html += '<span style="margin-left:auto">' + sorted.length + " shown</span>";
    html += "</div>";
    container.innerHTML = html;
    container.querySelectorAll(".ctrl-sort-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentSort = btn.dataset.sort;
        renderGrid(container, data);
      });
    });
    container.querySelector(".ctrl-disabled-btn")?.addEventListener("click", () => {
      showDisabledOnly = !showDisabledOnly;
      renderGrid(container, data);
    });
  }
  var refreshInterval3 = null;
  function initControllerHealth() {
    const container = document.getElementById("controllers-content");
    if (!container) return;
    async function load() {
      try {
        const resp = await fetch("/api/controllers");
        const data = await resp.json();
        renderGrid(container, data);
      } catch (err) {
        container.innerHTML = `<div style="color:#ef4444;padding:16px">Error loading controllers: ${err}</div>`;
      }
    }
    load();
    refreshInterval3 = setInterval(load, 3e4);
  }

  // src/panels/main.ts
  var tabs = document.querySelectorAll(".tab");
  var views = document.querySelectorAll(".view");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const viewId = tab.dataset.view;
      tabs.forEach((t) => t.classList.remove("active"));
      views.forEach((v) => v.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(viewId).classList.add("active");
      closeSidePanel();
    });
  });
  function initToolbar() {
    document.getElementById("save-layout-btn")?.addEventListener("click", saveLayout);
    document.getElementById("reset-layout-btn")?.addEventListener("click", resetLayout);
    document.getElementById("rescan-btn")?.addEventListener("click", rescanNodes);
    const filterBtn = document.getElementById("filter-btn");
    filterBtn?.addEventListener("click", () => {
      toggleFilter();
      filterBtn.classList.toggle("active");
    });
    const legendBtn = document.getElementById("legend-btn");
    legendBtn?.addEventListener("click", () => {
      toggleLegend();
      legendBtn.classList.toggle("active");
    });
    const boxesBtn = document.getElementById("boxes-btn");
    boxesBtn?.addEventListener("click", () => {
      toggleBoxes();
      boxesBtn.classList.toggle("active");
    });
    const scopeBtn = document.getElementById("scope-btn");
    scopeBtn?.addEventListener("click", () => {
      const scope = togglePulseScope();
      scopeBtn.classList.toggle("active", scope === "all");
      scopeBtn.textContent = scope === "all" ? "\u25CF All Projects" : "\u25CB This Project";
    });
    for (const status of ["active", "idle", "broken", "all"]) {
      const btn = document.getElementById(`pulse-${status}-btn`);
      btn?.addEventListener("click", () => {
        const count = pulseEdgesByStatus(status);
        btn.textContent = `${count} pulsed`;
        setTimeout(() => {
          const icons = { active: "\u25CF", idle: "\u25CB", broken: "\u2717", all: "\u2605" };
          btn.textContent = `${icons[status] || ""} ${status.charAt(0).toUpperCase() + status.slice(1)}`;
        }, 2e3);
      });
    }
  }
  async function init() {
    await loadProjectInfo();
    await initGraph();
    initTables();
    initBrainChat();
    initToolbar();
    initWorkerButtons();
    initLearningPipeline();
    initMcpButtons();
    initInspectButtons();
    initSessionButtons();
    initRewardHeatmap();
    initTrajectoryTimeline();
    initControllerHealth();
    setInterval(async () => {
      await refreshGraph();
    }, 5e3);
  }
  init().catch(console.error);
})();
