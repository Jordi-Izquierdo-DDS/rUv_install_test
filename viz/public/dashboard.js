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
      const [res] = await Promise.all([
        fetch(`/api/node/${node.id}`),
        ensureFallbackStatus(),
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
    if (detail.fallbackChain) html += renderFallbackChain2(detail);
    if (detail.controllerStatus || node.controllerStatus || node.level || node.meta?.level) {
      html += renderControllerBadge(node, detail);
    }
    html += renderFallbackDetail(node.id || node.meta?.id);
    if (detail.routingLevels) html += renderRoutingPipeline(detail.routingLevels, detail.routingTotal);
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
    if (detail.filesTree?.length && !detail.parsed) {
      const realFiles = detail.filesTree.filter(f => !f.isDir);
      const totalSize = realFiles.reduce((s, f) => s + (f.size || 0), 0);
      html += `<div style="font-weight:600;margin:8px 0 4px">Files (${realFiles.length}) \xB7 ${fmtSz(totalSize)}</div>`;
      for (const f of detail.filesTree.slice(0, 30)) {
        if (f.isDir) {
          html += `<div style="color:#94a3b8;margin-top:4px;font-size:12px">\uD83D\uDCC1 ${escapeHtml(f.name)}</div>`;
        } else {
          const szColor = f.size > 10485760 ? "#eab308" : "var(--text-dim)";
          html += `<div style="display:flex;justify-content:space-between;font-size:12px;padding:1px 0"><span style="color:var(--text-dim)">${escapeHtml(f.name)}</span><span style="color:${szColor};min-width:60px;text-align:right">${fmtSz(f.size)}</span></div>`;
        }
      }
    } else if (detail.files?.length && !detail.parsed) {
      html += `<div style="font-weight:600;margin:8px 0 4px">Files (${detail.fileCount || detail.files.length})</div>`;
      for (const f of detail.files.slice(0, 20)) {
        html += `<div style="color:var(--text-dim);font-size:12px">${escapeHtml(typeof f === "string" ? f : f.name || JSON.stringify(f))}</div>`;
      }
      if (detail.files.length > 20) html += `<div style="color:var(--text-dim);font-size:11px">...and ${detail.files.length - 20} more</div>`;
    }
    if (detail.fileSize !== void 0 && !detail.workerState && !detail.filesTree) {
      const size = detail.fileSize < 1024 ? `${detail.fileSize} B` : `${(detail.fileSize / 1024).toFixed(1)} KB`;
      html += `<div style="margin:8px 0;font-size:12px;color:var(--text-dim)">${size}`;
      if (detail.lineCount) html += ` \xB7 ${detail.lineCount} lines`;
      if (detail.lastMod) html += ` \xB7 ${new Date(detail.lastMod).toLocaleString()}`;
      html += `</div>`;
    }
    return html;
  }
  function fmtSz(bytes) {
    if (!bytes || bytes === 0) return "\u2014";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }
  function renderFallbackChain2(detail) {
    if (!detail.fallbackChain) return "";
    const al = detail.activeLevel ?? 4;
    const colors = { 1: "#22c55e", 2: "#3b82f6", 3: "#f59e0b", 4: "#ef4444" };
    const labels = { 1: "Optimal", 2: "Good", 3: "Heavy", 4: "Degraded" };
    let html = `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
      <div style="font-weight:600;margin-bottom:8px;color:#eab308">Model Resolution Chain</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:8px">Active level: <span style="color:${colors[al]};font-weight:700">L${al}</span> ${labels[al] || ""}</div>`;
    for (const e of detail.fallbackChain) {
      const isA = e.level === al;
      const c = e.exists ? (isA ? colors[e.level] : "#6b7280") : "#ef4444";
      const icon = !e.exists ? "\u2717" : isA ? "\u25C6" : "\u2713";
      const badge = isA ? `<span style="color:${c};font-weight:700;font-size:10px;margin-left:6px;padding:1px 5px;border:1px solid ${c};border-radius:3px">ACTIVE</span>` : "";
      const sz = e.size ? ` \xB7 ${fmtSz(e.size)}` : "";
      const tt = e.type === "quantized" ? '<span style="color:#8b5cf6;font-size:10px"> quantized</span>'
        : e.type === "unquantized" ? '<span style="color:#f59e0b;font-size:10px"> full</span>'
        : e.type === "hash-fallback" ? '<span style="color:#ef4444;font-size:10px"> no model</span>' : "";
      html += `<div style="padding:4px 0;${isA ? "background:rgba(255,255,255,0.03);margin:0 -4px;padding:4px" : ""}">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="color:${c};font-weight:700;font-size:13px;min-width:22px">L${e.level}</span>
          <span style="color:${c}">${icon}</span>
          <span style="font-size:12px;${isA ? "color:#e2e8f0;font-weight:600" : "color:#94a3b8"}">${e.label}${tt}${sz}</span>
          ${badge}
        </div>
        ${e.path ? `<div style="font-size:10px;color:#64748b;margin-left:28px;word-break:break-all">${e.path}</div>` : ""}
      </div>`;
    }
    html += `</div>`;
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
    // 4-state composite status mapping per doc/VIZ-CONTROLLER-STATUS-AUTO.md
    const statusColors = {
      active: "#22c55e",
      idle: "#eab308",
      degraded: "#f59e0b",
      broken: "#ef4444",
      installed: "#9ca3af",
      missing: "#ef4444",
      unknown: "#6b7280"
    };
    const lvl = node.level || node.meta?.level;
    if (lvl) {
      html += `<div style="margin-bottom:8px">
      <span style="background:#22c55e22;color:#22c55e;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">Level ${lvl}</span>
    </div>`;
    }
    // Derive runtime status from signals (set by scanNodeSignals from controller-status cache)
    const s = node.signals || {};
    let runtimeStatus = null;
    if (s.active) runtimeStatus = "active";
    else if (s.degraded) runtimeStatus = "degraded";
    else if (s.notLoaded) runtimeStatus = "broken";
    else if (s.healthy) runtimeStatus = "idle";
    else if (s.exists === false && !node.meta?.phantom) runtimeStatus = "missing";
    if (runtimeStatus) {
      const color = statusColors[runtimeStatus] || "#6b7280";
      html += `<div style="margin-bottom:8px;color:${color};font-weight:600">Status: ${runtimeStatus.toUpperCase()}</div>`;
    }
    const statusNote = node.meta?.statusNote;
    if (statusNote) {
      html += `<div style="margin-bottom:8px;color:var(--text-dim);font-size:11px;font-family:monospace">${statusNote}</div>`;
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
    let html = `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="font-weight:600;color:#f59e0b">Learning Engine</div>
        <span style="font-size:10px;padding:2px 8px;border-radius:3px;background:${qualityColor}22;color:${qualityColor};border:1px solid ${qualityColor}44;font-weight:700">${activeCount}/${capDefs.length} ${qualityLabel}</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${isRust ? "#22c55e" : "#eab308"}"></span>
        <span style="font-size:12px;color:#e2e8f0;font-weight:600">${isRust ? "Rust SONA (@ruvector/sona)" : "JS Fallback"}</span>
      </div>`;
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
    backend: { fill: "#0a1e2a", stroke: "#0ea5e9", text: "#bae6fd" },
    util: { fill: "#1a1a1a", stroke: "#9ca3af", text: "#e5e7eb" },
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
    { id: "backends", label: "Backends (stateful)", color: "#0a1e2a", borderColor: "#0ea5e988" },
    { id: "static_utils", label: "Static Utilities", color: "#1a1a1a", borderColor: "#9ca3af88" },
    { id: "daemons", label: "Background Daemons", color: "#1a0a2a", borderColor: "#a855f788" },
    { id: "bridges", label: "Bridge Layer", color: "#0a1a2a", borderColor: "#3b82f688" },
    { id: "workers", label: "CLI Tools (on-demand)", color: "#0a1a2a", borderColor: "#60a5fa88" },
    { id: "utilities", label: "Unexpected / Utility", color: "#111", borderColor: "#44444488" }
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
      case "backend":
        return "backends";
      case "util":
        return "static_utils";
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
      case "backend":
        return "cylinder";
      case "util":
        return "rect";
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
    if (n.type === "controller") {
      // Status comes from the composite cache via meta.statusNote
      const statusNote = n.meta?.statusNote || "";
      if (lvl && statusNote) return `L${lvl} \xB7 ${statusNote.split(' \xB7 ')[1] || statusNote}`;
      if (lvl) return `L${lvl}`;
      return statusNote || "ctrl";
    }
    if (n.type === "backend") {
      return "backend" + (lvl ? ` \xB7 L${lvl}` : "");
    }
    if (n.type === "util") {
      return "static util";
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
  // ── Fallback level data (fetched once, used by drawNodes + side panel) ──
  var _fallbackStatus = null;
  var FALLBACK_LEVEL_COLORS = { 1: "#22c55e", 2: "#3b82f6", 3: "#f59e0b", 4: "#ef4444" };
  var FALLBACK_LEVEL_LABELS = { 1: "L1", 2: "L2", 3: "L3", 4: "L4" };
  var FB_LEVEL_NAMES = { 1: "Optimal", 2: "Good", 3: "Degraded", 4: "Critical" };
  var FALLBACK_NODE_MAP = {
    native_core: "embedding", mdl_onnx: "embedding",
    ctrl_hybrid_search: "vectorSearch", ctrl_vector_backend: "vectorSearch", bin_hnsw_index: "vectorSearch", mdl_hnsw: "vectorSearch",
    native_router: "routing", ctrl_semantic_router: "routing", eng_router: "routing",
    eng_sona_optimizer: "sona", ctrl_sona_trajectory: "sona",
    ctrl_gnn_service: "gnn",
    wasm_lora: "lora", eng_ewc_consolidation: "lora",
    wasm_attention: "attention", eng_memory_bridge: "attention",
    mcp_ruvector: "embedding",
  };
  async function ensureFallbackStatus() {
    if (_fallbackStatus) return _fallbackStatus;
    try {
      var r = await fetch("/api/system/fallback-status");
      if (r.ok) _fallbackStatus = await r.json();
    } catch {}
    return _fallbackStatus;
  }
  function renderFallbackDetail(nodeId) {
    if (!_fallbackStatus) return "";
    var component = FALLBACK_NODE_MAP[nodeId];
    if (!component) return "";
    var data = _fallbackStatus.components?.[component];
    if (!data) return "";
    var color = FALLBACK_LEVEL_COLORS[data.activeLevel] || "#6b7280";
    var html = `<div style="margin-bottom:12px;padding:10px;border-radius:6px;background:#1e1e2e;border:1px solid #333">
      <div style="font-weight:600;margin-bottom:8px;color:${color}">Fallback Level: L${data.activeLevel} ${FB_LEVEL_NAMES[data.activeLevel] || ""}</div>
      <div style="font-size:11px;color:#94a3b8;margin-bottom:8px">Component: <b>${component}</b></div>`;
    for (var level of data.levels) {
      var isActive = level.level === data.activeLevel;
      var lColor = level.available ? (isActive ? FALLBACK_LEVEL_COLORS[level.level] : "#6b7280") : "#ef4444";
      var icon = !level.available ? "\u2717" : isActive ? "\u25C6" : "\u2713";
      var badge = isActive ? `<span style="color:${lColor};font-weight:700;font-size:10px;margin-left:6px;padding:1px 5px;border:1px solid ${lColor};border-radius:3px">ACTIVE</span>` : "";
      var deprecatedTag = level.deprecated ? ' <span style="color:#6b7280;font-size:10px">(deprecated)</span>' : "";
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
      label: "ADR-053",
      groups: [
        { id: "controllers", label: "Controllers", color: "#22c55e" },
        { id: "backends", label: "Backends", color: "#0ea5e9" },
        { id: "static_utils", label: "Static Utilities", color: "#9ca3af" }
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
        { id: "utilities", label: "Unexpected", color: "#444444" }
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
    ${d.meta.fileSize ? `<div>Size: ${d.meta.fileSize >= 1048576 ? (d.meta.fileSize / 1048576).toFixed(1) + " MB" : (d.meta.fileSize / 1024).toFixed(1) + " KB"}</div>` : ""}
    ${d.meta.activeLevel != null ? `<div style="margin-top:4px;color:${d.meta.activeLevel <= 1 ? STATUS_DOT.active : d.meta.activeLevel <= 2 ? "#3b82f6" : d.meta.activeLevel <= 3 ? STATUS_DOT.unhealthy : STATUS_DOT.missing}">&#9670; Fallback level: <b>L${d.meta.activeLevel}</b> ${["","Optimal","Good","Heavy","Degraded"][d.meta.activeLevel] || ""}</div>` : ""}
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
      // ── Fallback level badge (L1-L4) ──
      var fbComponent = FALLBACK_NODE_MAP[node.id];
      if (fbComponent && _fallbackStatus?.components?.[fbComponent]) {
        var fbLevel = _fallbackStatus.components[fbComponent].activeLevel;
        var fbColor = FALLBACK_LEVEL_COLORS[fbLevel] || "#6b7280";
        var fbLabel = FALLBACK_LEVEL_LABELS[fbLevel] || "L" + fbLevel;
        var fbG = ng.append("g").style("cursor", "help");
        fbG.append("rect").attr("x", -hw).attr("y", -hh).attr("width", 18).attr("height", 12).attr("rx", 3).attr("fill", fbColor).attr("opacity", 0.9);
        fbG.append("text").attr("x", -hw + 9).attr("y", -hh + 9).attr("text-anchor", "middle").attr("fill", "#fff").attr("font-size", 8).attr("font-weight", "bold").text(fbLabel);
        var fbLevelData = _fallbackStatus.components[fbComponent].levels.find(function(l) { return l.level === fbLevel; });
        fbG.append("title").text("Fallback: " + fbLabel + " \u2014 " + (fbLevelData ? fbLevelData.label : "unknown"));
      }
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
      "T1 Reactive\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nCJS hooks layer: intelligence.cjs, PageRank, JSON files.\nLatency: <15ms per hook call.\nSelf-contained \u2014 no DB or MCP needed.",
      "T2 Adaptive\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n28 AgentDB controllers across 6 levels.\nESM modules, memory-bridge, SQLite (memory.db).\nIncludes SONA, EWC++, SemanticRouter, ReasoningBank.",
      "T3 Deliberative\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nNative @ruvector Rust packages.\nHNSW vector index, ONNX 384D embeddings.\nGNN 8-head attention, LoRA weight updates."
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
          const daemonDescs = { 'metrics-daemon': 'Collects performance metrics every 60s into SQLite', 'swarm-monitor': 'Monitors swarm agent health every 30s', 'mcp-http': 'MCP JSON-RPC server on port 8917' };
          const desc = daemonDescs[k] || k;
          return `<span style="color:${c}" title="${k}: ${on ? "RUNNING" : "STOPPED"}\n${desc}">${dot} ${short}</span>`;
        }).join(" ");
        html += `<div class="tier" title="Daemons: ${daemonTip}">${badges}</div>`;
        html += `<div class="tier"><span title="ops \u2014 Bridge Operations\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nTotal T2 bridge writes, consolidations,\nand L1\u2192L2 promotions this session.">ops:${p.totalPipelineOps || 0}</span> &middot; <span title="Q \u2014 Q-Table Entries\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nRouting state-action pairs learned by\nThompson Sampling bandit. Higher = more\ntask types recognized.">Q:${q.entries || 0}</span> &middot; <span title="mem \u2014 Vector Memories\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nEmbeddings stored in ruvector.db.\nSearchable via HNSW similarity.">mem:${q.memories || 0}</span></div>`;
      }
    }
    html += `<div class="tier" style="margin-left:auto"><span title="found \u2014 Nodes Found\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nFiles, packages, and services detected\non disk or in node_modules.">${data.summary.foundCount} found</span> &middot; <span title="missing \u2014 Missing Nodes\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\nExpected nodes not found on disk.\nShown as red dots in the graph.">${data.summary.missingCount} missing</span> &middot; <span title="Last graph refresh time">${(/* @__PURE__ */ new Date()).toLocaleTimeString()}</span></div>`;
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
    const [res, fbRes] = await Promise.all([
      fetch("/api/graph"),
      fetch("/api/system/fallback-status").catch(() => null),
    ]);
    const data = await res.json();
    if (fbRes && fbRes.ok) { try { _fallbackStatus = await fbRes.json(); } catch {} }
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
      html += '<table class="data"><tr><th>Task</th><th>Status</th><th>Verdict</th><th>Steps</th><th>Learned Reward</th><th>Started</th></tr>';
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
      <span class="badge badge-purple">Episodes: ${data.counts?.episodes ?? 0}</span>
      <span class="badge badge-blue">Policies: ${data.counts?.policies ?? 0}</span>
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
    if (data.hierarchical) {
      const h = data.hierarchical;
      const total = (h.working || 0) + (h.episodic || 0) + (h.semantic || 0);
      if (total > 0) {
        html += '<div style="font-weight:600;margin:12px 0 8px">Hierarchical Memory</div>';
        html += '<div style="display:flex;gap:12px;margin-bottom:8px">';
        html += `<div style="flex:1;padding:8px;background:#1e293b;border-radius:6px;text-align:center"><div style="font-size:20px;font-weight:700;color:#38bdf8">${h.working || 0}</div><div style="font-size:10px;color:#94a3b8">Working</div></div>`;
        html += `<div style="flex:1;padding:8px;background:#1e293b;border-radius:6px;text-align:center"><div style="font-size:20px;font-weight:700;color:#a78bfa">${h.episodic || 0}</div><div style="font-size:10px;color:#94a3b8">Episodic</div></div>`;
        html += `<div style="flex:1;padding:8px;background:#1e293b;border-radius:6px;text-align:center"><div style="font-size:20px;font-weight:700;color:#22c55e">${h.semantic || 0}</div><div style="font-size:10px;color:#94a3b8">Semantic</div></div>`;
        html += '</div>';
      }
    }
    if (data.episodes?.length) {
      html += '<div style="font-weight:600;margin:12px 0 8px">Episodes (ReflexionMemory)</div>';
      html += '<table class="data"><tr><th>Task</th><th>Success</th><th>Learned Reward</th><th>Critique</th><th>Created</th></tr>';
      for (const e of data.episodes.slice(0, 20)) {
        const successIcon = e.success ? '<span style="color:#22c55e">\u2713</span>' : '<span style="color:#ef4444">\u2717</span>';
        const reward = e.reward != null ? Number(e.reward).toFixed(2) : "\u2014";
        const critique = e.critique ? (e.critique.length > 60 ? e.critique.slice(0, 60) + "..." : e.critique) : "\u2014";
        const task = e.task ? (e.task.length > 50 ? e.task.slice(0, 50) + "..." : e.task) : "\u2014";
        html += `<tr><td title="${(e.task || "").replace(/"/g, "&quot;")}">${task}</td><td>${successIcon}</td><td>${reward}</td><td style="font-size:10px;color:#94a3b8" title="${(e.critique || "").replace(/"/g, "&quot;")}">${critique}</td><td>${formatDt(e.created_at)}</td></tr>`;
      }
      html += "</table>";
    }
    if (data.policies?.length) {
      html += '<div style="font-weight:600;margin:12px 0 8px">Learning Policies (RL)</div>';
      html += '<table class="data"><tr><th>Session</th><th>Version</th><th>Created</th></tr>';
      for (const p of data.policies) {
        const sid = p.session_id ? (p.session_id.length > 25 ? "..." + p.session_id.slice(-18) : p.session_id) : "\u2014";
        html += `<tr><td>${sid}</td><td>v${p.version ?? "\u2014"}</td><td>${formatDt(p.created_at)}</td></tr>`;
      }
      html += "</table>";
    }
    if (data.learningSessions?.length) {
      html += '<div style="font-weight:600;margin:12px 0 8px">RL Sessions</div>';
      html += '<table class="data"><tr><th>ID</th><th>Status</th><th>Started</th><th>Ended</th></tr>';
      for (const ls of data.learningSessions) {
        const sid = ls.id ? (ls.id.length > 25 ? "..." + ls.id.slice(-18) : ls.id) : "\u2014";
        const statusColor = ls.status === "completed" ? "#22c55e" : ls.status === "active" ? "#38bdf8" : "#94a3b8";
        html += `<tr><td>${sid}</td><td><span style="color:${statusColor}">${ls.status || "\u2014"}</span></td><td>${formatDt(ls.start_time)}</td><td>${formatDt(ls.end_time)}</td></tr>`;
      }
      html += "</table>";
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
      html += '<table class="data"><tr><th>Task</th><th>Status</th><th>Verdict</th><th>Steps</th><th>Learned Reward</th><th>Started</th></tr>';
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
    // Only add filter bar if not already present (brain-chat.js override may have added it)
    if (!document.querySelector(".brain-source-filters")) {
      const filterBar = document.createElement("div");
      filterBar.className = "brain-source-filters";
      filterBar.style.cssText = "display:flex;gap:12px;margin:8px 0;font-size:0.85em;align-items:center";
      filterBar.innerHTML = `
        <span style="color:var(--text-dim)">Sources:</span>
        <label style="cursor:pointer"><input type="checkbox" class="brain-src-cb" value="pi-brain" checked> Pi Brain</label>
        <label style="cursor:pointer"><input type="checkbox" class="brain-src-cb" value="ruflo-memory"> Ruflo Memory</label>
        <label style="cursor:pointer"><input type="checkbox" class="brain-src-cb" value="auto-memory"> Auto Memory</label>
      `;
      results.parentNode.insertBefore(filterBar, results);
    }
    loadBrainStatus(results);
    btn.addEventListener("click", () => doSearch(input, results));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") doSearch(input, results);
    });
  }
  function getSelectedSources() {
    return Array.from(document.querySelectorAll(".brain-src-cb:checked")).map((cb) => cb.value);
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
    const sources = getSelectedSources();
    if (!sources.length) {
      container.innerHTML = '<div style="color:var(--color-degraded)">Select at least one source.</div>';
      return;
    }
    container.innerHTML = '<div style="color:var(--text-dim)">Searching...</div>';
    try {
      const res = await fetch("/api/brain/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, sources })
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
          <span style="display:flex;gap:8px;align-items:center">
            <span style="font-size:0.75em;padding:1px 6px;border-radius:3px;background:var(--bg-card,#2a2a3e);border:1px solid var(--text-dim,#555);color:var(--text-dim,#aaa)">${escapeHtml3(r.source || "")}</span>
            ${r.score !== void 0 ? `<span class="score">${(r.score * 100).toFixed(1)}%</span>` : ""}
          </span>
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
  function rewardColorSmooth(r) {
    // Smooth gradient: deep red -> warm orange -> gold -> teal -> bright cyan
    if (r <= 0)   return "#7f1d1d";
    if (r >= 1)   return "#06d6a0";
    if (r < 0.25) { const t = r / 0.25;       return lerpColor("#991b1b", "#ea580c", t); }
    if (r < 0.5)  { const t = (r - 0.25) / 0.25; return lerpColor("#ea580c", "#eab308", t); }
    if (r < 0.75) { const t = (r - 0.5) / 0.25;  return lerpColor("#eab308", "#14b8a6", t); }
    const t = (r - 0.75) / 0.25; return lerpColor("#14b8a6", "#06d6a0", t);
  }
  function lerpColor(a, b, t) {
    const pa = [parseInt(a.slice(1,3),16), parseInt(a.slice(3,5),16), parseInt(a.slice(5,7),16)];
    const pb = [parseInt(b.slice(1,3),16), parseInt(b.slice(3,5),16), parseInt(b.slice(5,7),16)];
    const r = Math.round(pa[0] + (pb[0]-pa[0])*t), g = Math.round(pa[1] + (pb[1]-pa[1])*t), bl = Math.round(pa[2] + (pb[2]-pa[2])*t);
    return "#" + [r,g,bl].map(c => c.toString(16).padStart(2,"0")).join("");
  }
  var GRADIENT_STOPS = [
    { at: 0, color: "#991b1b", label: "0.0" },
    { at: 0.25, color: "#ea580c", label: "0.25" },
    { at: 0.5, color: "#eab308", label: "0.50" },
    { at: 0.75, color: "#14b8a6", label: "0.75" },
    { at: 1, color: "#06d6a0", label: "1.0" }
  ];
  var currentMode = "timeline";
  function parseMeta(row) {
    try { return JSON.parse(row.metadata || "{}"); } catch { return {}; }
  }
  function formatTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  function rewardLabel(r) {
    if (r >= 0.95) return "Excellent";
    if (r >= 0.8) return "Good";
    if (r >= 0.6) return "Average";
    if (r >= 0.3) return "Below avg";
    return "Poor";
  }

  // ── Shared: gradient legend bar ──
  function gradientLegendHTML() {
    return `<div style="display:flex;align-items:center;gap:8px;font-size:10px;color:#94a3b8">
      <span>Poor</span>
      <div style="flex:1;max-width:180px;height:8px;border-radius:4px;background:linear-gradient(90deg,#991b1b,#ea580c,#eab308,#14b8a6,#06d6a0)"></div>
      <span>Excellent</span>
    </div>`;
  }

  // ── Shared: summary stats row ──
  function summaryStatsHTML(sorted, extra) {
    const avg = sorted.reduce((s,r) => s+r.reward, 0) / sorted.length;
    const best = Math.max(...sorted.map(r => r.reward));
    const worst = Math.min(...sorted.map(r => r.reward));
    const successes = sorted.filter(r => r.reward >= 0.8).length;
    const pct = Math.round(successes / sorted.length * 100);
    const captured = extra && extra.captured || {};
    const learned = extra && extra.learned || {};
    let html = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:16px">
      <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">Captured <span style="opacity:0.6">(AgentDB)</span></div>
        <div style="font-size:20px;font-weight:700;color:#38bdf8">${captured.count || sorted.length}</div>
        ${captured.byType ? '<div style="font-size:9px;color:#64748b;margin-top:2px">' + Object.entries(captured.byType).map(([k,v]) => k + ':' + v).join(' \u00b7 ') + '</div>' : ''}
      </div>
      <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">Learned <span style="opacity:0.6">(SONA)</span></div>
        <div style="font-size:20px;font-weight:700;color:#a78bfa">${learned.count || 0}</div>
        ${learned.confidenceRange ? '<div style="font-size:9px;color:#64748b;margin-top:2px">conf ' + learned.confidenceRange[0].toFixed(3) + ' \u2013 ' + learned.confidenceRange[1].toFixed(3) + '</div>' : ''}
      </div>
      <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">Avg Success Rate</div>
        <div style="font-size:20px;font-weight:700;color:${rewardColorSmooth(avg)}">${avg.toFixed(3)}</div>
      </div>
      <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">Best / Worst</div>
        <div style="font-size:14px;font-weight:600"><span style="color:${rewardColorSmooth(best)}">${best.toFixed(2)}</span> <span style="color:#475569">/</span> <span style="color:${rewardColorSmooth(worst)}">${worst.toFixed(2)}</span></div>
      </div>
      <div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 12px">
        <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">Success Rate</div>
        <div style="font-size:20px;font-weight:700;color:${pct >= 70 ? "#06d6a0" : pct >= 40 ? "#eab308" : "#ef4444"}">${pct}%</div>
      </div>
    </div>`;
    // Confidence distribution histogram for learned patterns
    if (learned.confidenceBuckets && learned.count > 0) {
      const buckets = learned.confidenceBuckets;
      const maxB = Math.max(1, ...buckets);
      const labels = ['0-.2', '.2-.4', '.4-.6', '.6-.8', '.8-1'];
      const colors = ['#991b1b', '#ea580c', '#eab308', '#14b8a6', '#06d6a0'];
      html += '<div style="background:#1e293b;border:1px solid #334155;border-radius:8px;padding:10px 12px;margin-bottom:16px">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.05em">Learned Confidence Distribution</span>';
      if (learned.byType) {
        html += '<span style="font-size:9px;color:#64748b;margin-left:auto">' + Object.entries(learned.byType).map(([k,v]) => k + ':' + v).join(' ') + '</span>';
      }
      html += '</div>';
      html += '<div style="display:flex;align-items:flex-end;gap:4px;height:40px">';
      for (let i = 0; i < 5; i++) {
        const h = Math.round((buckets[i] / maxB) * 36) + 4;
        html += `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px">
          <span style="font-size:9px;color:#94a3b8;font-weight:600">${buckets[i]}</span>
          <div style="width:100%;height:${h}px;background:${colors[i]};border-radius:3px;opacity:0.85"></div>
          <span style="font-size:8px;color:#475569">${labels[i]}</span>
        </div>`;
      }
      html += '</div></div>';
    }
    return html;
  }

  // ── Mode tabs ──
  function modeTabsHTML() {
    const modes = [
      { id: "timeline", label: "Timeline" },
      { id: "heatmap", label: "Heatmap" },
      { id: "by-tool", label: "By Tool" },
    ];
    let h = '<div style="display:flex;gap:2px;margin-bottom:14px;background:#0f172a;border-radius:6px;padding:2px">';
    for (const m of modes) {
      const active = m.id === currentMode;
      h += `<button class="heatmap-mode-btn" data-mode="${m.id}" style="flex:1;padding:6px 12px;font-size:11px;border:none;border-radius:4px;cursor:pointer;font-family:inherit;transition:all 0.15s;${active ? "background:#8b5cf6;color:#fff;font-weight:600" : "background:transparent;color:#64748b"}">${m.label}</button>`;
    }
    h += "</div>";
    return h;
  }

  // ── Timeline mode: area chart with gradient fill + rolling avg ──
  function renderTimelineMode(sorted, width) {
    const chartH = 200, padL = 40, padR = 12, padT = 12, padB = 30;
    const cw = width - padL - padR;
    const ch = chartH - padT - padB;
    const minTs = sorted[0].timestamp, maxTs = sorted[sorted.length-1].timestamp;
    const tsRange = maxTs - minTs || 1;
    const x = (ts) => padL + ((ts - minTs) / tsRange) * cw;
    const y = (r) => padT + (1 - Math.min(1, Math.max(0, r))) * ch;
    // Rolling avg
    const windowSize = Math.max(3, Math.round(sorted.length * 0.08));
    const avgs = [];
    for (let i = 0; i < sorted.length; i++) {
      const start = Math.max(0, i - windowSize + 1);
      const slice = sorted.slice(start, i + 1);
      avgs.push(slice.reduce((s,r) => s + r.reward, 0) / slice.length);
    }
    let svg = `<svg width="${width}" height="${chartH}" style="display:block;margin-bottom:8px">`;
    // Defs: gradient for area fill
    svg += `<defs>
      <linearGradient id="reward-area-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#8b5cf6" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.02"/>
      </linearGradient>
    </defs>`;
    // Grid lines
    for (let v = 0; v <= 1; v += 0.25) {
      const ly = y(v);
      svg += `<line x1="${padL}" y1="${ly}" x2="${width-padR}" y2="${ly}" stroke="#1e293b" stroke-width="1"/>`;
      svg += `<text x="${padL-6}" y="${ly+3}" fill="#475569" font-size="9" text-anchor="end" font-family="inherit">${v.toFixed(2)}</text>`;
    }
    // Area fill under rolling avg
    let areaPath = `M${x(sorted[0].timestamp)},${y(avgs[0])}`;
    for (let i = 1; i < sorted.length; i++) areaPath += ` L${x(sorted[i].timestamp)},${y(avgs[i])}`;
    areaPath += ` L${x(sorted[sorted.length-1].timestamp)},${padT+ch} L${x(sorted[0].timestamp)},${padT+ch} Z`;
    svg += `<path d="${areaPath}" fill="url(#reward-area-grad)"/>`;
    // Individual reward dots
    for (let i = 0; i < sorted.length; i++) {
      const row = sorted[i], meta = parseMeta(row);
      const cx = x(row.timestamp), cy = y(row.reward);
      const tip = `${rewardLabel(row.reward)} (${row.reward?.toFixed(3)})&#10;${meta.toolName || row.action || "?"}&#10;${formatTime(row.timestamp)}`;
      svg += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${rewardColorSmooth(row.reward)}" opacity="0.7" style="cursor:pointer"><title>${tip}</title></circle>`;
    }
    // Rolling avg line
    let linePath = `M${x(sorted[0].timestamp)},${y(avgs[0])}`;
    for (let i = 1; i < sorted.length; i++) linePath += ` L${x(sorted[i].timestamp)},${y(avgs[i])}`;
    svg += `<path d="${linePath}" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" opacity="0.9"/>`;
    // Time labels on x-axis
    const timeLabels = [0, Math.floor(sorted.length * 0.25), Math.floor(sorted.length * 0.5), Math.floor(sorted.length * 0.75), sorted.length - 1];
    for (const idx of timeLabels) {
      if (idx < 0 || idx >= sorted.length) continue;
      const tx = x(sorted[idx].timestamp);
      svg += `<text x="${tx}" y="${chartH - 4}" fill="#475569" font-size="9" text-anchor="middle" font-family="inherit">${formatTime(sorted[idx].timestamp)}</text>`;
    }
    svg += "</svg>";
    svg += `<div style="display:flex;align-items:center;gap:12px;font-size:10px;color:#64748b;margin-bottom:4px">
      <span style="display:flex;align-items:center;gap:4px"><span style="width:14px;height:2px;background:#a78bfa;border-radius:1px;display:inline-block"></span> Rolling avg (window ${windowSize})</span>
      <span style="display:flex;align-items:center;gap:4px"><span style="width:7px;height:7px;border-radius:50%;background:#14b8a6;display:inline-block"></span> Learned rewards</span>
    </div>`;
    return svg;
  }

  // ── Heatmap mode: dense calendar-style grid ──
  function renderHeatmapMode(sorted, width) {
    const cellSize = 14, cellGap = 2, step = cellSize + cellGap;
    const cols = Math.max(1, Math.floor((width - 16) / step));
    const rows = Math.ceil(sorted.length / cols);
    const svgW = cols * step, svgH = rows * step;
    let svg = `<svg width="${svgW}" height="${svgH}" style="display:block;margin-bottom:8px">`;
    for (let i = 0; i < sorted.length; i++) {
      const row = sorted[i], meta = parseMeta(row);
      const col = i % cols, r = Math.floor(i / cols);
      const xp = col * step, yp = r * step;
      const tip = `${rewardLabel(row.reward)} (${row.reward?.toFixed(3)})&#10;${meta.toolName || row.action || "?"}&#10;${formatTime(row.timestamp)}`;
      svg += `<rect x="${xp}" y="${yp}" width="${cellSize}" height="${cellSize}" rx="3" fill="${rewardColorSmooth(row.reward)}" opacity="0.85" style="cursor:pointer"><title>${tip}</title></rect>`;
    }
    svg += "</svg>";
    return svg;
  }

  // ── By-tool mode: horizontal bar chart + sparklines ──
  function renderByToolMode(sorted, width) {
    const byTool = {};
    for (const row of sorted) {
      const meta = parseMeta(row);
      const tool = meta.toolName || row.action || "unknown";
      (byTool[tool] ?? (byTool[tool] = [])).push(row);
    }
    const entries = Object.entries(byTool).sort((a,b) => b[1].length - a[1].length);
    const maxCount = Math.max(1, ...entries.map(e => e[1].length));
    let html = '<div style="display:flex;flex-direction:column;gap:6px">';
    for (const [tool, toolRows] of entries) {
      const avg = toolRows.reduce((s,r) => s+r.reward, 0) / toolRows.length;
      const barW = Math.round((toolRows.length / maxCount) * 100);
      // Mini sparkline
      const sparkW = 80, sparkH = 20;
      let spark = `<svg width="${sparkW}" height="${sparkH}" style="flex-shrink:0">`;
      if (toolRows.length > 1) {
        const pts = toolRows.map((r, i) => {
          const sx = (i / (toolRows.length - 1)) * sparkW;
          const sy = sparkH - r.reward * sparkH;
          return `${sx},${sy}`;
        });
        spark += `<polyline points="${pts.join(" ")}" fill="none" stroke="${rewardColorSmooth(avg)}" stroke-width="1.5" stroke-linecap="round"/>`;
      } else {
        spark += `<circle cx="${sparkW/2}" cy="${sparkH - toolRows[0].reward * sparkH}" r="2" fill="${rewardColorSmooth(avg)}"/>`;
      }
      spark += "</svg>";
      html += `<div style="background:#1e293b;border:1px solid #1e293b;border-radius:8px;padding:10px 12px;transition:border-color 0.15s" onmouseenter="this.style.borderColor='#334155'" onmouseleave="this.style.borderColor='#1e293b'">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
          <span style="font-weight:600;font-size:12px;color:#e2e8f0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${tool}</span>
          ${spark}
          <span style="font-size:11px;color:#64748b;white-space:nowrap">${toolRows.length} calls</span>
          <span style="font-size:12px;font-weight:600;color:${rewardColorSmooth(avg)};min-width:40px;text-align:right">${avg.toFixed(3)}</span>
        </div>
        <div style="height:6px;background:#0f172a;border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${barW}%;background:linear-gradient(90deg,${rewardColorSmooth(Math.max(0,avg-0.15))},${rewardColorSmooth(avg)});border-radius:3px;transition:width 0.3s"></div>
        </div>
      </div>`;
    }
    html += "</div>";
    return html;
  }

  function renderHeatmap(container, rows, extra) {
    if (!rows.length) {
      container.innerHTML = '<div style="color:#64748b;padding:48px 24px;text-align:center;line-height:1.6"><div style="font-size:24px;margin-bottom:8px;opacity:0.4">No data yet</div>No learning experiences found. Run some operations to generate learned reward data.</div>';
      return;
    }
    const sorted = [...rows].sort((a, b) => a.timestamp - b.timestamp);
    const width = Math.max(200, container.clientWidth - 32);
    let html = "";
    html += summaryStatsHTML(sorted, extra);
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">';
    html += modeTabsHTML();
    html += '<div style="flex:1"></div>';
    html += gradientLegendHTML();
    html += '</div>';
    if (currentMode === "timeline") {
      html += renderTimelineMode(sorted, width);
    } else if (currentMode === "heatmap") {
      html += renderHeatmapMode(sorted, width);
    } else {
      html += renderByToolMode(sorted, width);
    }
    container.innerHTML = html;
    container.querySelectorAll(".heatmap-mode-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentMode = btn.dataset.mode;
        renderHeatmap(container, rows, extra);
      });
    });
  }
  var refreshInterval = null;
  var _lastRewardsJSON = "";
  function initRewardHeatmap() {
    const container = document.getElementById("rewards-content");
    if (!container) return;
    async function load() {
      if (!container.clientWidth) return;
      try {
        const resp = await fetch("/api/rewards?limit=500");
        const raw = await resp.text();
        if (raw === _lastRewardsJSON) return;
        _lastRewardsJSON = raw;
        const data = JSON.parse(raw);
        renderHeatmap(container, data.rewards || [], { captured: data.captured, learned: data.learned });
      } catch (err) {
        container.innerHTML = `<div style="color:#ef4444;padding:16px">Error loading rewards: ${err}</div>`;
      }
    }
    load();
    refreshInterval = setInterval(load, 5e3);
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
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  function formatDuration(startTs, endTs) {
    if (!startTs || !endTs) return "";
    const ms = new Date(endTs).getTime() - new Date(startTs).getTime();
    if (ms < 0 || isNaN(ms)) return "";
    if (ms < 1e3) return `${ms}ms`;
    const s = Math.floor(ms / 1e3);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
  }
  function rewardDot(r) {
    if (r >= 0.95) return "#4ade80";
    if (r >= 0.8) return "#22c55e";
    if (r >= 0.6) return "#eab308";
    if (r >= 0.3) return "#f59e0b";
    return "#ef4444";
  }
  function escHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function truncate(s, max) {
    if (!s) return "";
    return s.length > max ? s.slice(0, max) + "..." : s;
  }
  var expandedTrajs = /* @__PURE__ */ new Set();
  var stepsCache = /* @__PURE__ */ new Map();
  function stepCount(t) {
    return t.actual_steps != null ? t.actual_steps : t.total_steps;
  }
  function renderStepDetail(step) {
    const m = step.meta;
    let html = "";
    html += `<div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;font-size:11px;border-bottom:1px solid #1e293b">`;
    html += `<span style="color:#64748b;width:32px;flex-shrink:0;text-align:right">#${step.step_number}</span>`;
    html += `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${rewardDot(step.reward)};flex-shrink:0;margin-top:3px"></span>`;
    html += `<div style="flex:1;min-width:0">`;
    // Inline edit format: "edit <path>\n-: <old>\n+: <new>" — detect BEFORE meta branch
    // because metadata only has {timestamp,quality} for these rows.
    // Use single literal space after "-:" / "+:" to preserve leading indentation in code diffs.
    const inlineEdit = (step.action || "").match(/^edit ([^\n]+)\n-: ?([\s\S]*?)\n\+: ?([\s\S]*)$/);
    if (inlineEdit) {
      const [, path, oldStr, newStr] = inlineEdit;
      const shortFile = path.split("/").slice(-2).join("/");
      html += `<span style="color:#a78bfa;font-weight:600">Edit</span>`;
      html += ` <span style="color:#94a3b8" title="${escHtml(path)}">${escHtml(shortFile)}</span>`;
      html += `<div style="margin-top:4px;font-size:10px;font-family:monospace;line-height:1.4">`;
      html += `<div style="padding:4px 8px;background:rgba(239,68,68,0.08);border-left:2px solid #ef4444;margin-bottom:2px;white-space:pre-wrap;word-break:break-word;max-height:150px;overflow-y:auto;color:#fca5a5">${escHtml(oldStr)}</div>`;
      html += `<div style="padding:4px 8px;background:rgba(34,197,94,0.08);border-left:2px solid #22c55e;white-space:pre-wrap;word-break:break-word;max-height:150px;overflow-y:auto;color:#86efac">${escHtml(newStr)}</div>`;
      html += `</div>`;
      html += `</div>`;
      html += `<span style="color:${rewardDot(step.reward)};font-size:10px;flex-shrink:0;width:42px;text-align:right">${step.reward?.toFixed(2) ?? "?"}</span>`;
      html += `</div>`;
      return html;
    }
    // Inline edit with path only (no diff body): "edit <path>"
    const inlineEditPath = (step.action || "").match(/^edit\s+(.+)$/);
    if (inlineEditPath && !step.action.includes("\n")) {
      const path = inlineEditPath[1];
      const shortFile = path.split("/").slice(-2).join("/");
      html += `<span style="color:#a78bfa;font-weight:600">Edit</span>`;
      html += ` <span style="color:#94a3b8" title="${escHtml(path)}">${escHtml(shortFile)}</span>`;
      html += `</div>`;
      html += `<span style="color:${rewardDot(step.reward)};font-size:10px;flex-shrink:0;width:42px;text-align:right">${step.reward?.toFixed(2) ?? "?"}</span>`;
      html += `</div>`;
      return html;
    }
    if (m) {
      const tool = m.tool || step.action?.split(":")[0]?.trim() || "?";
      const toolColor = tool === "Edit" ? "#a78bfa" : tool === "Bash" ? "#38bdf8" : tool === "Read" ? "#94a3b8" : tool === "Write" ? "#fb923c" : tool === "Grep" ? "#fbbf24" : tool === "Glob" ? "#fbbf24" : "#e2e8f0";
      html += `<span style="color:${toolColor};font-weight:600">${escHtml(tool)}</span>`;
      if (m.file) {
        const shortFile = m.file.split("/").slice(-2).join("/");
        html += ` <span style="color:#94a3b8" title="${escHtml(m.file)}">${escHtml(shortFile)}</span>`;
      }
      if (m.pattern) {
        html += ` <span style="color:#fbbf24;font-family:monospace;font-size:10px" title="pattern: ${escHtml(m.pattern)}">/${escHtml(truncate(m.pattern, 50))}/</span>`;
      }
      if (m.path && !m.file) {
        const shortPath = m.path.split("/").slice(-2).join("/");
        html += ` <span style="color:#94a3b8;font-size:10px" title="${escHtml(m.path)}">in ${escHtml(shortPath)}</span>`;
      }
      if (m.glob) {
        html += ` <span style="color:#94a3b8;font-size:10px">(${escHtml(m.glob)})</span>`;
      }
      if (m.offset != null || m.limit != null) {
        const parts = [];
        if (m.offset != null) parts.push(`offset:${m.offset}`);
        if (m.limit != null) parts.push(`limit:${m.limit}`);
        html += ` <span style="color:#64748b;font-size:10px">[${parts.join(", ")}]</span>`;
      }
      if (m.command) {
        html += ` <span style="color:#94a3b8;font-family:monospace;font-size:10px" title="${escHtml(m.command)}">${escHtml(truncate(m.command, 80))}</span>`;
      }
      if (m.description) {
        html += ` <span style="color:#64748b;font-size:10px" title="${escHtml(m.description)}">${escHtml(truncate(m.description, 60))}</span>`;
      }
      const extras = [];
      if (m.duration_ms != null && m.duration_ms > 0) extras.push(`${m.duration_ms}ms`);
      if (m.success === false) extras.push('<span style="color:#ef4444">FAILED</span>');
      if (m.exit_code != null && m.exit_code !== 0) extras.push(`exit=${m.exit_code}`);
      if (extras.length) {
        html += ` <span style="color:#64748b;font-size:10px">(${extras.join(", ")})</span>`;
      }
      if (m.model) {
        const isActual = m.model.includes('claude-');
        const shortMdl = isActual ? (m.model.includes('opus') ? 'opus' : m.model.includes('sonnet') ? 'sonnet' : m.model.includes('haiku') ? 'haiku' : m.model) : m.model;
        const mc = shortMdl === "haiku" ? "#22c55e" : shortMdl === "sonnet" ? "#3b82f6" : shortMdl === "opus" ? "#a855f7" : "#94a3b8";
        const lbl = isActual ? shortMdl : 'rec:' + shortMdl;
        html += ` <span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${mc}22;color:${mc};border:1px solid ${mc}44;font-weight:600" title="${isActual ? 'Actual model (from Claude Code)' : 'Recommended by router (not confirmed actual)'}">${escHtml(lbl)}</span>`;
        if (m.claudeModel && m.claudeModel !== m.model) {
          html += ` <span style="font-size:9px;color:#64748b">\u2192 ${escHtml(m.claudeModel)}</span>`;
        }
      }
      if (m.old_string && m.new_string) {
        html += `<div style="margin-top:4px;font-size:10px;font-family:monospace;line-height:1.4">`;
        html += `<div style="padding:4px 8px;background:rgba(239,68,68,0.08);border-left:2px solid #ef4444;margin-bottom:2px;white-space:pre-wrap;word-break:break-word;max-height:150px;overflow-y:auto;color:#fca5a5">${escHtml(m.old_string)}</div>`;
        html += `<div style="padding:4px 8px;background:rgba(34,197,94,0.08);border-left:2px solid #22c55e;white-space:pre-wrap;word-break:break-word;max-height:150px;overflow-y:auto;color:#86efac">${escHtml(m.new_string)}</div>`;
        html += `</div>`;
      }
    } else {
      // Parse inline action format: "edit <path>\n-: <old>\n+: <new>"
      const act = step.action || "-";
      const editMatch = act.match(/^edit\s+(.+?)\n-:\s*([\s\S]*?)\n\+:\s*([\s\S]*)$/);
      if (editMatch) {
        const [, path, oldStr, newStr] = editMatch;
        const shortFile = path.split("/").slice(-2).join("/");
        html += `<span style="color:#a78bfa;font-weight:600">Edit</span>`;
        html += ` <span style="color:#94a3b8" title="${escHtml(path)}">${escHtml(shortFile)}</span>`;
        html += `<div style="margin-top:4px;font-size:10px;font-family:monospace;line-height:1.4">`;
        html += `<div style="padding:4px 8px;background:rgba(239,68,68,0.08);border-left:2px solid #ef4444;margin-bottom:2px;white-space:pre-wrap;word-break:break-word;max-height:150px;overflow-y:auto;color:#fca5a5">${escHtml(oldStr)}</div>`;
        html += `<div style="padding:4px 8px;background:rgba(34,197,94,0.08);border-left:2px solid #22c55e;white-space:pre-wrap;word-break:break-word;max-height:150px;overflow-y:auto;color:#86efac">${escHtml(newStr)}</div>`;
        html += `</div>`;
      } else {
        // Generic multi-line action: preserve whitespace
        html += `<span style="color:#e2e8f0;word-break:break-word;white-space:pre-wrap">${escHtml(act)}</span>`;
      }
    }
    html += `</div>`;
    html += `<span style="color:${rewardDot(step.reward)};font-size:10px;flex-shrink:0;width:42px;text-align:right">${step.reward?.toFixed(2) ?? "?"}</span>`;
    html += `</div>`;
    return html;
  }
  function renderStepsInto(stepsDiv, steps) {
    if (!steps.length) {
      stepsDiv.innerHTML = '<div style="color:#64748b;font-size:10px;padding:4px 0">No steps recorded</div>';
      return;
    }
    const sorted = [...steps].sort((a, b) => a.step_number - b.step_number);
    stepsDiv.innerHTML = sorted.map(renderStepDetail).join("");
  }
  async function loadSteps(trajId, stepsDiv) {
    if (stepsCache.has(trajId)) {
      renderStepsInto(stepsDiv, stepsCache.get(trajId));
      return;
    }
    stepsDiv.innerHTML = '<div style="color:#64748b;font-size:10px">Loading steps...</div>';
    try {
      const resp = await fetch(`/api/trajectories/${encodeURIComponent(trajId)}/steps`);
      const data = await resp.json();
      const steps = data.steps || [];
      stepsCache.set(trajId, steps);
      if (data.corrupted) {
        stepsDiv.innerHTML = '<div style="color:#ef4444;font-size:10px;font-weight:600;padding:2px 0;margin-bottom:4px">CORRUPTED — partial data recovered from damaged DB pages</div>';
        stepsDiv.innerHTML += '<div>' + (steps.length ? steps.map(renderStepDetail).join("") : '<span style="color:#64748b;font-size:10px">No steps recoverable</span>') + '</div>';
      } else {
        renderStepsInto(stepsDiv, steps);
      }
    } catch (err) {
      stepsDiv.innerHTML = `<div style="color:#ef4444;font-size:10px">Error: ${err}</div>`;
    }
  }
  function renderTimeline(container, trajectories) {
    if (!trajectories.length) {
      container.innerHTML = '<div style="color:#94a3b8;padding:24px;text-align:center">No trajectories found. Trajectories are recorded during Claude sessions.</div>';
      return;
    }
    const bySession = {};
    for (const t of trajectories) {
      const sid = t.session_id || "unknown";
      (bySession[sid] ?? (bySession[sid] = [])).push(t);
    }
    const maxSteps = Math.max(1, ...trajectories.map((t) => stepCount(t) || 1));
    let html = "";
    html += `<div style="font-size:11px;color:#94a3b8;margin-bottom:12px">${trajectories.length} trajectories across ${Object.keys(bySession).length} sessions</div>`;
    const sessionEntries = Object.entries(bySession).sort((a, b) => {
      const latestA = Math.max(...a[1].map((t) => new Date(t.started_at).getTime() || 0));
      const latestB = Math.max(...b[1].map((t) => new Date(t.started_at).getTime() || 0));
      return latestB - latestA;
    });
    for (const [sessionId, trajs] of sessionEntries) {
      const shortSid = sessionId.length > 25 ? "..." + sessionId.slice(-18) : sessionId;
      const totalSessionSteps = trajs.reduce((sum, t) => sum + stepCount(t), 0);
      html += `<div style="margin-bottom:16px">`;
      html += `<div style="font-size:12px;font-weight:600;color:#e2e8f0;margin-bottom:6px;display:flex;align-items:center;gap:6px">`;
      html += `<span style="color:#64748b">Session</span> ${shortSid}`;
      html += `<span style="font-size:10px;color:#64748b;font-weight:400">(${trajs.length} traj, ${totalSessionSteps} steps)</span>`;
      html += `</div>`;
      for (const t of trajs) {
        const steps = stepCount(t);
        const barWidth = Math.max(20, steps / maxSteps * 100);
        const avgReward = steps > 0 ? t.total_reward / steps : 0;
        const expanded = expandedTrajs.has(t.id);
        const shortId = t.id.length > 20 ? t.id.slice(0, 8) + "..." : t.id;
        const dur = formatDuration(t.started_at, t.ended_at);
        html += `<div style="margin-left:16px;margin-bottom:6px">`;
        if (t.task) {
          html += `<div style="font-size:11px;color:#cbd5e1;margin-bottom:2px;margin-left:78px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escHtml(t.task)}">`;
          html += `<span style="color:#64748b">Prompt:</span> ${escHtml(truncate(t.task, 120))}`;
          html += `</div>`;
        }
        html += `<div class="traj-row" data-traj-id="${t.id}" style="display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:4px;cursor:pointer;transition:background 0.15s" onmouseover="this.style.background='#1e293b'" onmouseout="this.style.background='transparent'">`;
        html += `<span style="font-size:10px;color:#64748b;width:12px;flex-shrink:0">${expanded ? "\u25BC" : "\u25B6"}</span>`;
        html += `<span style="font-size:10px;color:#64748b;width:60px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis" title="${t.id}">[${shortId}]</span>`;
        html += `<div style="width:${barWidth}%;height:14px;border-radius:3px;background:${verdictBg(t.verdict)};border:1px solid ${verdictColor(t.verdict)};position:relative;min-width:20px">`;
        html += `<div style="position:absolute;inset:0;border-radius:3px;background:${verdictColor(t.verdict)};opacity:0.3"></div>`;
        html += `</div>`;
        html += `<span style="font-size:11px;color:#e2e8f0;white-space:nowrap">${steps} steps</span>`;
        html += `<span style="font-size:10px;padding:1px 6px;border-radius:3px;background:${verdictBg(t.verdict)};color:${verdictColor(t.verdict)}">${t.verdict || t.status}</span>`;
        if (steps > 0) {
          html += `<span style="font-size:10px;color:#94a3b8">(${avgReward.toFixed(2)} avg)</span>`;
        }
        if (dur) {
          html += `<span style="font-size:10px;color:#64748b">${dur}</span>`;
        }
        {
          const mdl = t.dominantModel || 'Unknown';
          const isActual = t.modelSource === 'transcript';
          const dmc = mdl === "haiku" ? "#22c55e" : mdl === "sonnet" ? "#3b82f6" : mdl === "opus" ? "#a855f7" : "#64748b";
          const countsStr = t.modelCounts ? Object.entries(t.modelCounts).map(([k,v]) => k+':'+v).join(', ') : 'model data unavailable';
          const lbl = isActual ? mdl : (mdl === 'Unknown' ? mdl : 'rec:' + mdl);
          const srcTip = isActual ? ' (actual — from transcript)' : mdl === 'Unknown' ? '' : ' (recommended — not confirmed actual)';
          html += `<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${dmc}22;color:${dmc};border:1px solid ${dmc}44;font-weight:600" title="${countsStr}${srcTip}">${escHtml(lbl)}</span>`;
        }
        if (t.routingLevel) {
          const rlLabels = { 'agentdb-semanticRouter': 'L0 semantic', 'sona-native': 'L1 sona', 'sona-pattern': 'L2 pattern', 'q-learning': 'L3 q-learn', 'keyword': 'L4 keyword', 'default': 'L5 default' };
          const rlColors = { 'agentdb-semanticRouter': '#22c55e', 'sona-native': '#22c55e', 'sona-pattern': '#eab308', 'q-learning': '#eab308', 'keyword': '#ef4444', 'default': '#ef4444' };
          const rlc = rlColors[t.routingLevel] || '#64748b';
          const rlLbl = rlLabels[t.routingLevel] || t.routingLevel;
          html += `<span style="font-size:9px;padding:1px 5px;border-radius:3px;background:${rlc}22;color:${rlc};border:1px solid ${rlc}44;font-weight:600" title="Routing level: ${t.routingLevel} (${t.routingCount || 1} route events)">${escHtml(rlLbl)}</span>`;
        }
        html += `<span style="font-size:10px;color:#64748b;margin-left:auto">${formatTs(t.started_at)}\u2013${formatTs(t.ended_at)}</span>`;
        html += `</div>`;
        html += `<div class="traj-steps" data-traj-id="${t.id}" style="display:${expanded ? "block" : "none"};margin-left:24px;margin-top:2px;margin-bottom:6px;padding:6px 10px;background:#0f172a;border-radius:4px;border:1px solid #1e293b">`;
        html += `<div style="color:#64748b;font-size:10px">Loading steps...</div>`;
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
          const indicator2 = row.querySelector("span");
          if (indicator2) indicator2.textContent = "\u25B6";
          return;
        }
        expandedTrajs.add(trajId);
        stepsDiv.style.display = "block";
        const indicator = row.querySelector("span");
        if (indicator) indicator.textContent = "\u25BC";
        await loadSteps(trajId, stepsDiv);
      });
    });
    for (const trajId of expandedTrajs) {
      const stepsDiv = container.querySelector(`.traj-steps[data-traj-id="${trajId}"]`);
      if (stepsDiv && stepsDiv.style.display !== "none") {
        loadSteps(trajId, stepsDiv);
      }
    }
  }
  function renderRoutingStats(container, stats) {
    if (!stats || !stats.available) {
      container.innerHTML = '<div style="color:#64748b;font-size:11px">ModelRouter not available</div>';
      return;
    }
    let html = '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px">';
    // Model distribution bar
    const dist = stats.modelDistribution || {};
    const total = Object.values(dist).reduce((s, v) => s + v, 0) || 1;
    const tierColor = { haiku: "#22c55e", sonnet: "#3b82f6", opus: "#a855f7" };
    html += '<div style="flex:1;min-width:200px">';
    html += '<div style="font-size:11px;color:#94a3b8;margin-bottom:4px">Model Distribution</div>';
    html += '<div style="display:flex;height:18px;border-radius:4px;overflow:hidden;background:#1e293b">';
    for (const [model, count] of Object.entries(dist)) {
      const pct = (count / total * 100).toFixed(1);
      const c = tierColor[model] || "#94a3b8";
      if (count > 0) {
        html += `<div style="width:${pct}%;background:${c};display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:600;min-width:${count > 0 ? '24px' : '0'}" title="${model}: ${count} (${pct}%)">${pct > 10 ? model : ''}</div>`;
      }
    }
    html += '</div>';
    html += '<div style="display:flex;gap:10px;margin-top:4px;font-size:10px">';
    for (const [model, count] of Object.entries(dist)) {
      const c = tierColor[model] || "#94a3b8";
      html += `<span style="color:${c}">\u25CF ${model}: ${count}</span>`;
    }
    html += '</div></div>';
    // Stats cards
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
    html += `<div style="padding:6px 12px;background:#1e293b;border-radius:4px;text-align:center;cursor:help" title="Total model-routing decisions made this session. Each prompt triggers one decision to pick haiku, sonnet, or opus based on task complexity."><div style="font-size:16px;color:#e2e8f0;font-weight:700">${stats.totalDecisions ?? 0}</div><div style="font-size:9px;color:#64748b">Decisions</div></div>`;
    html += `<div style="padding:6px 12px;background:#1e293b;border-radius:4px;text-align:center;cursor:help" title="Average task complexity (0\u20131) across all routed prompts. Lower values route to cheaper/faster models (haiku), higher values to more capable ones (sonnet/opus)."><div style="font-size:16px;color:#e2e8f0;font-weight:700">${(stats.avgComplexity ?? 0).toFixed(2)}</div><div style="font-size:9px;color:#64748b">Avg Complexity</div></div>`;
    if (stats.latestRecommendation?.astComplexity != null) {
      const astC = stats.latestRecommendation.astComplexity;
      const astFile = stats.latestRecommendation.file || '';
      html += `<div style="padding:6px 12px;background:#1e293b;border:1px solid #8b5cf6;border-radius:4px;text-align:center;cursor:help" title="AST-informed complexity from static analysis of ${astFile || 'current file'}. Parsed from [TASK_MODEL_RECOMMENDATION] tag."><div style="font-size:16px;color:#c4b5fd;font-weight:700">${astC.toFixed(0)}%</div><div style="font-size:9px;color:#8b5cf6">AST Complexity</div></div>`;
    }
    const trips = stats.circuitBreakerTrips ?? (stats.learningHistory || []).filter((h) => h.circuitBreaker).length;
    html += `<div style="padding:6px 12px;background:#1e293b;border-radius:4px;text-align:center;cursor:help" title="Circuit Breaker trips. When a model tier fails repeatedly, the router 'trips' its breaker and stops sending requests to that tier temporarily to prevent cascading failures. 0 = all tiers healthy."><div style="font-size:16px;color:${trips > 0 ? '#f59e0b' : '#e2e8f0'};font-weight:700">${trips}</div><div style="font-size:9px;color:#64748b">CB Trips</div></div>`;
    html += '</div>';
    html += '</div>';
    container.innerHTML = html;
  }
  var refreshInterval2 = null;
  var _lastTrajectoryJSON = "";
  var _lastRoutingJSON = "";
  function initTrajectoryTimeline() {
    const container = document.getElementById("trajectory-content");
    if (!container) return;
    // Prevent layout collapse during refresh
    container.style.minHeight = (container.offsetHeight || 100) + "px";
    // Insert routing stats widget above timeline
    let routingWidget = document.getElementById("routing-stats-widget");
    if (!routingWidget) {
      routingWidget = document.createElement("div");
      routingWidget.id = "routing-stats-widget";
      routingWidget.style.cssText = "margin-bottom:12px;padding:10px;background:#0f172a;border:1px solid #1e293b;border-radius:6px";
      container.parentNode.insertBefore(routingWidget, container);
    }
    async function loadRoutingStats() {
      try {
        const resp = await fetch("/api/routing-stats");
        const raw = await resp.text();
        if (raw === _lastRoutingJSON) return;
        _lastRoutingJSON = raw;
        const stats = JSON.parse(raw);
        renderRoutingStats(routingWidget, stats);
      } catch {
        routingWidget.innerHTML = '<div style="color:#64748b;font-size:10px">Routing stats unavailable</div>';
      }
    }
    async function load() {
      try {
        const resp = await fetch("/api/trajectories?limit=100");
        const raw = await resp.text();
        if (raw === _lastTrajectoryJSON) return;
        _lastTrajectoryJSON = raw;
        stepsCache.clear();
        const data = JSON.parse(raw);
        renderTimeline(container, data.trajectories || []);
        container.style.minHeight = (container.offsetHeight || 100) + "px";
      } catch (err) {
        container.innerHTML = `<div style="color:#ef4444;padding:16px">Error loading trajectories: ${err}</div>`;
      }
    }
    load();
    loadRoutingStats();
    refreshInterval2 = setInterval(() => {
      load();
      loadRoutingStats();
    }, 5e3);
  }

  // src/panels/controller-health.ts
  var currentSort = "level";
  var showDisabledOnly = false;
  function levelOrder(lvl) {
    if (lvl == null) return 99;
    if (typeof lvl === "number") return lvl;
    const m = String(lvl).match(/L?(\d+)/);
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
      const levelVal = ctrl.level != null ? typeof ctrl.level === "number" ? `L${ctrl.level}` : ctrl.level : null;
      const levelColor = levelVal ? "#e2e8f0" : "#475569";
      html += `<td style="padding:6px 8px;color:${levelColor};font-size:11px">${levelVal || "\u2014"}</td>`;
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

  // src/panels/learning-cycle.ts
  // 6-node ring layout: ROUTE(top) → EXECUTE(2h) → CAPTURE(4h) → STORE(6h) → LEARN(8h) → RECALL(10h) → ROUTE
  var CYCLE_NODES = [
    { id: 'route',   label: 'ROUTE',   clock: 0,   color: '#a855f7', desc: 'AST / RL / SONA' },
    { id: 'execute', label: 'EXECUTE', clock: 60,  color: '#3b82f6', desc: 'Agent / Swarm' },
    { id: 'capture', label: 'CAPTURE', clock: 120, color: '#f97316', desc: 'Steps / Errors' },
    { id: 'store',   label: 'STORE',   clock: 180, color: '#10b981', desc: 'Patterns / Vectors' },
    { id: 'learn',   label: 'LEARN',   clock: 240, color: '#ef4444', desc: 'RL / EWC++ / SONA' },
    { id: 'recall',  label: 'RECALL',  clock: 300, color: '#06b6d4', desc: 'Critique / Errors' },
  ];
  var CYCLE_EDGES = [
    { from: 'route',   to: 'execute', fromColor: '#a855f7', toColor: '#3b82f6' },
    { from: 'execute', to: 'capture', fromColor: '#3b82f6', toColor: '#f97316' },
    { from: 'capture', to: 'store',   fromColor: '#f97316', toColor: '#10b981' },
    { from: 'store',   to: 'learn',   fromColor: '#10b981', toColor: '#ef4444' },
    { from: 'learn',   to: 'recall',  fromColor: '#ef4444', toColor: '#06b6d4' },
    { from: 'recall',  to: 'route',   fromColor: '#06b6d4', toColor: '#a855f7', feedback: true },
  ];

  var _cycleData = null;
  var _cyclePrev = null;
  var _cycleInterval = null;

  function cycleNodePos(clockDeg) {
    var cx = 350, cy = 330, r = 230;
    var rad = (clockDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function buildCycleSvg() {
    var svg = document.getElementById('cycle-svg');
    if (!svg) return;
    var html = '';
    var CX = 350, CY = 330, R = 230; // ring center + radius (must match cycleNodePos)
    var NR = 60; // node circle radius

    // Defs: gradients for edges + glow filter
    html += '<defs>';
    CYCLE_EDGES.forEach(function(e, i) {
      html += '<linearGradient id="cg-' + i + '" gradientUnits="userSpaceOnUse"';
      var p1 = cycleNodePos(CYCLE_NODES.find(function(n){return n.id===e.from}).clock);
      var p2 = cycleNodePos(CYCLE_NODES.find(function(n){return n.id===e.to}).clock);
      html += ' x1="' + p1.x + '" y1="' + p1.y + '" x2="' + p2.x + '" y2="' + p2.y + '">';
      html += '<stop offset="0%" stop-color="' + e.fromColor + '"/>';
      html += '<stop offset="100%" stop-color="' + e.toColor + '"/>';
      html += '</linearGradient>';
    });
    html += '<filter id="cycle-glow-filter"><feGaussianBlur stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>';
    // Arrow markers for each edge
    CYCLE_EDGES.forEach(function(e, i) {
      html += '<marker id="ca-' + i + '" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,1 L10,5 L0,9 Z" fill="' + e.toColor + '"/></marker>';
    });
    html += '</defs>';

    // Draw edges as SVG arcs following the ring circle
    CYCLE_EDGES.forEach(function(e, i) {
      var fromNode = CYCLE_NODES.find(function(n){return n.id===e.from});
      var toNode = CYCLE_NODES.find(function(n){return n.id===e.to});
      // Start/end angles on the ring
      var a1rad = (fromNode.clock - 90) * Math.PI / 180;
      var a2rad = (toNode.clock - 90) * Math.PI / 180;
      // Offset start/end by node radius along the arc
      var nodeAngle = Math.asin(NR / R); // angular size of the node radius
      var startAngle = a1rad + nodeAngle;
      var endAngle = a2rad - nodeAngle;
      var sx = CX + R * Math.cos(startAngle), sy = CY + R * Math.sin(startAngle);
      var ex = CX + R * Math.cos(endAngle), ey = CY + R * Math.sin(endAngle);
      // SVG arc: A rx ry x-rotation large-arc-flag sweep-flag x y
      // For the feedback edge RECALL→ROUTE (300°→0°), the clockwise short arc
      // spans 120° — same as the others. large-arc=0, sweep=1 is correct for all.
      var sw = e.feedback ? 3.5 : 2;
      var dash = e.feedback ? ' stroke-dasharray="10,5"' : '';
      var cls = e.feedback ? ' class="cycle-feedback-glow"' : '';
      var filterAttr = e.feedback ? ' filter="url(#cycle-glow-filter)"' : '';
      html += '<path id="ce-' + i + '" d="M' + sx.toFixed(1) + ',' + sy.toFixed(1) + ' A' + R + ',' + R + ' 0 0,1 ' + ex.toFixed(1) + ',' + ey.toFixed(1) + '"';
      html += ' fill="none" stroke="url(#cg-' + i + ')" stroke-width="' + sw + '"' + dash;
      html += ' marker-end="url(#ca-' + i + ')" opacity="0.6"' + cls + filterAttr + '/>';
    });

    // Draw nodes (larger radius=50) — clickable for fractal detail
    CYCLE_NODES.forEach(function(n) {
      var p = cycleNodePos(n.clock);
      html += '<g class="cycle-node" data-node="' + n.id + '" transform="translate(' + p.x + ',' + p.y + ')" style="cursor:pointer">';
      // Outer circle
      html += '<circle r="' + NR + '" fill="#0f0a1a" stroke="' + n.color + '" stroke-width="2.5" opacity="0.95"/>';
      // Node label
      html += '<text text-anchor="middle" y="-16" fill="' + n.color + '" font-size="16" font-weight="700">' + n.label + '</text>';
      // Sub-label
      html += '<text text-anchor="middle" y="4" fill="#94a3b8" font-size="11">' + n.desc + '</text>';
      // Badge (filled in by update)
      html += '<text id="cb-' + n.id + '" text-anchor="middle" y="22" fill="#cbd5e1" font-size="10"></text>';
      // Behavior dot
      html += '<circle id="cd-' + n.id + '" cx="46" cy="-46" r="6" fill="#333" stroke="#555" stroke-width="1"/>';
      html += '</g>';
    });

    // ── 7-Layer Promotion Pipeline (between STORE→LEARN arc) ──
    var RING_LAYERS = [
      { id: 'L1', name: 'Threshold Gate', desc: 'Filters raw steps by minimum reward before promotion', angle: 192, color: '#10b981' },
      { id: 'L2', name: 'SQL Consolidator', desc: 'Aggregates step metadata into structured memory_entries', angle: 201, color: '#10b981' },
      { id: 'L3', name: 'Hierarchical Memory', desc: 'Promotes working→episodic→semantic across 3 tiers', angle: 210, color: '#10b981' },
      { id: 'L4', name: 'Memory Consolidation', desc: 'Merges duplicate patterns and prunes stale entries', angle: 219, color: '#10b981' },
      { id: 'L5', name: 'ReasoningBank', desc: 'Extracts reusable reasoning strategies from episodes', angle: 228, color: '#ef4444' },
      { id: 'L6', name: 'EWC++ Consolidation', desc: 'Updates neural weights without forgetting prior knowledge', angle: 237, color: '#ef4444' },
      { id: 'L7', name: 'Skills / NightlyLearner', desc: 'Distills consolidated knowledge into reusable skill templates', angle: 246, color: '#ef4444' },
    ];
    // Pipeline track (arc between STORE and LEARN)
    var pipeR = R - 20;
    var pipeStart = (180 - 90) * Math.PI / 180, pipeEnd = (240 - 90) * Math.PI / 180;
    html += '<path d="M' + (CX + pipeR * Math.cos(pipeStart)).toFixed(1) + ',' + (CY + pipeR * Math.sin(pipeStart)).toFixed(1);
    html += ' A' + pipeR + ',' + pipeR + ' 0 0,1 ' + (CX + pipeR * Math.cos(pipeEnd)).toFixed(1) + ',' + (CY + pipeR * Math.sin(pipeEnd)).toFixed(1) + '"';
    html += ' fill="none" stroke="#1e293b" stroke-width="12" opacity="0.5" stroke-linecap="round"/>';
    // Layer dots on the arc
    RING_LAYERS.forEach(function(layer, i) {
      var rad = (layer.angle - 90) * Math.PI / 180;
      var lx = CX + pipeR * Math.cos(rad), ly = CY + pipeR * Math.sin(rad);
      html += '<g class="ring-layer-dot" data-layer="' + i + '" style="cursor:pointer">';
      html += '<circle id="rl-' + i + '" cx="' + lx.toFixed(1) + '" cy="' + ly.toFixed(1) + '" r="8"';
      html += ' fill="#0f0a1a" stroke="' + layer.color + '" stroke-width="2"/>';
      html += '<text x="' + lx.toFixed(1) + '" y="' + (ly + 3).toFixed(1) + '" fill="' + layer.color + '" font-size="7" font-weight="600" text-anchor="middle">' + layer.id + '</text>';
      html += '</g>';
    });

    // Center panel background
    var cpW = 200, cpH = 120;
    var cpX = CX - cpW/2, cpY = CY - cpH/2;
    html += '<rect x="' + cpX + '" y="' + cpY + '" width="' + cpW + '" height="' + cpH + '" rx="8" fill="#0f0a1a" stroke="#334155" stroke-width="1" opacity="0.95"/>';
    html += '<text id="cc-title" x="' + CX + '" y="' + (cpY + 20) + '" text-anchor="middle" fill="#f8fafc" font-size="12" font-weight="700">LIVE SESSION</text>';
    html += '<text id="cc-line1" x="' + CX + '" y="' + (cpY + 38) + '" text-anchor="middle" fill="#94a3b8" font-size="10"></text>';
    html += '<text id="cc-line2" x="' + CX + '" y="' + (cpY + 54) + '" text-anchor="middle" fill="#94a3b8" font-size="10"></text>';
    html += '<text id="cc-line3" x="' + CX + '" y="' + (cpY + 70) + '" text-anchor="middle" fill="#94a3b8" font-size="10"></text>';
    html += '<text id="cc-line4" x="' + CX + '" y="' + (cpY + 86) + '" text-anchor="middle" fill="#94a3b8" font-size="10"></text>';
    html += '<text id="cc-line5" x="' + CX + '" y="' + (cpY + 100) + '" text-anchor="middle" fill="#94a3b8" font-size="10"></text>';
    html += '<text id="cc-line6" x="' + CX + '" y="' + (cpY + 114) + '" text-anchor="middle" fill="#64748b" font-size="9"></text>';

    // Fractal overlay container (shared with nautilus)
    html += '<g id="fractal-container"></g>';
    // Layer tooltip container
    html += '<g id="ring-tooltip"></g>';

    svg.innerHTML = html;

    // Click handlers: ring nodes → fractal detail panels (reuse nautilus infrastructure)
    svg.querySelectorAll('.cycle-node').forEach(function(g) {
      g.addEventListener('click', function(evt) {
        evt.stopPropagation();
        var nodeId = g.dataset.node;
        toggleRingFractal(nodeId);
      });
    });

    // Click handlers: layer dots → tooltip
    svg.querySelectorAll('.ring-layer-dot').forEach(function(g) {
      g.addEventListener('click', function(evt) {
        evt.stopPropagation();
        var idx = parseInt(g.dataset.layer);
        toggleLayerTooltip(idx, RING_LAYERS);
      });
    });

    // Click background → close all
    svg.addEventListener('click', function() {
      closeRingFractal();
      closeLayerTooltip();
    });
  }

  // ── Ring fractal panels (reuse STAGE_ARCS data + same layout as nautilus) ──

  var _ringFractalOpen = null;

  function toggleRingFractal(nodeId) {
    if (_ringFractalOpen === nodeId) { closeRingFractal(); return; }
    closeRingFractal();
    closeLayerTooltip();
    _ringFractalOpen = nodeId;
    var fc = document.getElementById('fractal-container');
    if (!fc) return;
    var arc = STAGE_ARCS.find(function(a) { return a.id === nodeId; });
    if (!arc) return;
    var data = _cycleData;

    // Position near the node
    var node = CYCLE_NODES.find(function(n) { return n.id === nodeId; });
    if (!node) return;
    var pos = cycleNodePos(node.clock);
    var pw = 420, subs = arc.fractal || [];
    var hasTiers = arc.tiers && data;
    var ph = 80 + subs.length * 44 + (hasTiers ? 70 : 0);
    // Shift toward center
    var px = pos.x + (350 - pos.x) * 0.3 - pw / 2;
    var py = pos.y + (330 - pos.y) * 0.3 - ph / 2;
    px = Math.max(10, Math.min(270, px));
    py = Math.max(10, Math.min(690 - ph, py));
    var h = '';

    // Glass panel
    h += '<rect x="' + px + '" y="' + py + '" width="' + pw + '" height="' + ph + '" rx="14"';
    h += ' fill="#0a0618" stroke="' + arc.color + '" stroke-width="2" opacity="0.97" filter="url(#cycle-glow-filter)"/>';

    // Title
    h += '<text x="' + (px + pw / 2) + '" y="' + (py + 22) + '" text-anchor="middle" fill="' + arc.color + '" font-size="14" font-weight="700">' + arc.label + ' \u2014 Detail</text>';
    h += '<text x="' + (px + pw / 2) + '" y="' + (py + 36) + '" text-anchor="middle" fill="#64748b" font-size="9">' + arc.desc + '</text>';
    h += '<line x1="' + (px + 16) + '" y1="' + (py + 44) + '" x2="' + (px + pw - 16) + '" y2="' + (py + 44) + '" stroke="' + arc.color + '" stroke-width="0.5" opacity="0.3"/>';

    // Sub-nodes as vertical list
    var listX = px + 80, listStartY = py + 64;
    subs.forEach(function(sub, i) {
      var ny = listStartY + i * 44;
      var val = sub.v && data ? resolveVal(nodeId, sub.v, data) : '';
      // Node circle
      h += '<circle cx="' + listX + '" cy="' + (ny + 12) + '" r="14" fill="#0f0a1a" stroke="' + arc.color + '" stroke-width="1.5"/>';
      h += '<text x="' + listX + '" y="' + (ny + 15) + '" fill="' + arc.color + '" font-size="8" font-weight="600" text-anchor="middle">' + (i + 1) + '</text>';
      // Name + value
      h += '<text x="' + (listX + 22) + '" y="' + (ny + 8) + '" fill="#e2e8f0" font-size="11" font-weight="600">' + sub.n + '</text>';
      if (val !== '') {
        h += '<rect x="' + (listX + 22) + '" y="' + (ny + 14) + '" width="' + Math.min(200, String(val).length * 8 + 16) + '" height="18" rx="4" fill="' + arc.color + '" opacity="0.12"/>';
        h += '<text x="' + (listX + 30) + '" y="' + (ny + 27) + '" fill="' + arc.color + '" font-size="11" font-weight="700">' + val + '</text>';
      }
      // Connector to next
      if (i < subs.length - 1) {
        h += '<line x1="' + listX + '" y1="' + (ny + 26) + '" x2="' + listX + '" y2="' + (ny + 44) + '" stroke="' + arc.color + '" stroke-width="1" opacity="0.2"/>';
      }
    });

    // STORE: 3-tier bars
    if (hasTiers) {
      var t = data.nodes.store.tiers || {};
      var total = Math.max(1, (t.working||0) + (t.episodic||0) + (t.semantic||0));
      var bx = px + 24, by = py + ph - 60, bw = pw - 48;
      h += '<line x1="' + bx + '" y1="' + (by - 8) + '" x2="' + (bx + bw) + '" y2="' + (by - 8) + '" stroke="' + arc.color + '" stroke-width="0.5" opacity="0.3"/>';
      h += '<text x="' + bx + '" y="' + (by + 2) + '" fill="#94a3b8" font-size="9" font-weight="600">3-Tier Memory Distribution</text>';
      [{n:'Working',c:t.working||0,o:0.4,d:'Short-term'},{n:'Episodic',c:t.episodic||0,o:0.65,d:'Promoted'},{n:'Semantic',c:t.semantic||0,o:0.95,d:'Consolidated'}].forEach(function(tr, i) {
        var yy = by + 10 + i * 16, w = Math.max(6, bw * 0.6 * tr.c / total);
        h += '<text x="' + bx + '" y="' + (yy + 9) + '" fill="#10b981" font-size="8" opacity="' + tr.o + '">' + tr.n + '</text>';
        h += '<rect x="' + (bx + 64) + '" y="' + yy + '" width="' + w.toFixed(1) + '" height="11" rx="3" fill="#10b981" opacity="' + tr.o + '"/>';
        h += '<text x="' + (bx + 68 + w) + '" y="' + (yy + 9) + '" fill="#10b981" font-size="8" font-weight="600">' + tr.c + '</text>';
        h += '<text x="' + (bx + bw) + '" y="' + (yy + 9) + '" fill="#475569" font-size="7" text-anchor="end">' + tr.d + '</text>';
      });
    }

    // Close button
    h += '<circle cx="' + (px + pw - 18) + '" cy="' + (py + 18) + '" r="10" fill="#0f0a1a" stroke="#475569" stroke-width="1" style="cursor:pointer" class="ring-fractal-close"/>';
    h += '<text x="' + (px + pw - 18) + '" y="' + (py + 22) + '" fill="#94a3b8" font-size="12" text-anchor="middle" style="pointer-events:none">\u00d7</text>';

    fc.innerHTML = h;
    fc.querySelectorAll('.ring-fractal-close').forEach(function(el) {
      el.addEventListener('click', function(evt) { evt.stopPropagation(); closeRingFractal(); });
    });
  }

  function closeRingFractal() {
    _ringFractalOpen = null;
    var c = document.getElementById('fractal-container');
    if (c) c.innerHTML = '';
  }

  // ── Layer tooltip (click on L1-L7 dots) ──

  var _layerTooltipOpen = null;

  function toggleLayerTooltip(idx, layers) {
    if (_layerTooltipOpen === idx) { closeLayerTooltip(); return; }
    closeLayerTooltip();
    closeRingFractal();
    _layerTooltipOpen = idx;
    var tc = document.getElementById('ring-tooltip');
    if (!tc || !layers[idx]) return;
    var layer = layers[idx];
    var CX = 350, CY = 330, pipeR = 210;
    var rad = (layer.angle - 90) * Math.PI / 180;
    var lx = CX + pipeR * Math.cos(rad), ly = CY + pipeR * Math.sin(rad);

    var tw = 260, th = 70;
    // Position tooltip toward center from the dot
    var tx = lx + (CX - lx) * 0.3 - tw / 2;
    var ty = ly + (CY - ly) * 0.3 - th / 2;
    tx = Math.max(10, Math.min(430, tx));
    ty = Math.max(10, Math.min(620, ty));
    var h = '';
    h += '<rect x="' + tx + '" y="' + ty + '" width="' + tw + '" height="' + th + '" rx="10"';
    h += ' fill="#0a0618" stroke="' + layer.color + '" stroke-width="1.5" opacity="0.97"/>';
    h += '<text x="' + (tx + tw / 2) + '" y="' + (ty + 18) + '" text-anchor="middle" fill="' + layer.color + '" font-size="12" font-weight="700">' + layer.id + ': ' + layer.name + '</text>';
    h += '<text x="' + (tx + tw / 2) + '" y="' + (ty + 36) + '" text-anchor="middle" fill="#94a3b8" font-size="9">' + layer.desc.slice(0, 50) + '</text>';
    if (layer.desc.length > 50) {
      h += '<text x="' + (tx + tw / 2) + '" y="' + (ty + 50) + '" text-anchor="middle" fill="#94a3b8" font-size="9">' + layer.desc.slice(50) + '</text>';
    }
    h += '<text x="' + (tx + tw - 12) + '" y="' + (ty + 14) + '" fill="#64748b" font-size="11" style="cursor:pointer" class="layer-tip-close">\u00d7</text>';
    tc.innerHTML = h;
    tc.querySelector('.layer-tip-close')?.addEventListener('click', function(evt) {
      evt.stopPropagation(); closeLayerTooltip();
    });
  }

  function closeLayerTooltip() {
    _layerTooltipOpen = null;
    var c = document.getElementById('ring-tooltip');
    if (c) c.innerHTML = '';
  }

  function updateCycleBadges(data) {
    if (!data) return;
    var n = data.nodes;
    // ROUTE badge — short form
    var routeEl = document.getElementById('cb-route');
    if (routeEl) {
      var m = n.route.model || '?';
      var cplx = data.modelRouter.avgComplexity ? ' ' + data.modelRouter.avgComplexity.toFixed(0) + '%' : '';
      routeEl.textContent = m + cplx;
    }
    // EXECUTE badge
    var execEl = document.getElementById('cb-execute');
    if (execEl) {
      execEl.textContent = (n.execute.activeSteps || 0) + ' stp ' + (n.execute.activeStatus || 'idle');
    }
    // CAPTURE badge
    var capEl = document.getElementById('cb-capture');
    if (capEl) {
      capEl.textContent = n.capture.steps + 's ' + n.capture.errors + 'e ' + n.capture.coEdits + 'c';
    }
    // STORE badge
    var storeEl = document.getElementById('cb-store');
    if (storeEl) {
      var t = n.store.tiers || {};
      storeEl.textContent = (t.working||0) + 'W>' + (t.episodic||0) + 'E>' + (t.semantic||0) + 'S';
    }
    // LEARN badge
    var learnEl = document.getElementById('cb-learn');
    if (learnEl) {
      learnEl.textContent = n.learn.policies + 'p ' + n.learn.qValues + 'Q';
    }
    // RECALL badge
    var recallEl = document.getElementById('cb-recall');
    if (recallEl) {
      recallEl.textContent = n.recall.episodes + 'ep ' + n.recall.mailbox + 'mail';
    }

    // Center panel
    var c = data.center || {};
    var setT = function(id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; };
    setT('cc-line1', 'Goal: ' + (c.goal || 'none').slice(0, 22));
    setT('cc-line2', 'Steps: ' + (c.steps||0) + ' | Success: ' + (c.avgReward||'?'));
    var cplxParts = [];
    if (c.complexity) cplxParts.push(c.complexity);
    if (c.astComplexity) cplxParts.push('AST ' + c.astComplexity);
    var modelVal = c.model || '?';
    var modelLabel = modelVal.includes('claude-') ? 'Model' : 'Recommended';
    if (modelVal.includes('claude-')) modelVal = modelVal.includes('opus') ? 'opus' : modelVal.includes('sonnet') ? 'sonnet' : modelVal.includes('haiku') ? 'haiku' : modelVal;
    setT('cc-line3', modelLabel + ': ' + modelVal + (cplxParts.length ? ' (' + cplxParts.join(' / ') + ')' : ''));
    setT('cc-line4', 'RL: Q=' + (c.qValues||0) + ' values');
    setT('cc-line5', 'Tier: ' + (c.tierSummary||'?') + ' | Mail: ' + (c.mailbox||0));

    // Improvement
    if (data.improvement && data.improvement.ready) {
      setT('cc-line6', 'Improvement: success rate ' + (parseFloat(data.improvement.rewardDelta) >= 0 ? '+' : '') + data.improvement.rewardDelta + '%');
    } else {
      setT('cc-line6', 'Collecting... (need 10+ sessions)');
    }

    // Behavior dots — combine explicit behaviors + data-presence for all nodes
    var behaviors = data.behaviors || [];
    var nodeStatus = {};
    behaviors.forEach(function(b) {
      var where = b.where.split('-')[0];
      if (!nodeStatus[where] || b.status === 'active') nodeStatus[where] = b.status;
    });
    // Data-presence: light up nodes that have real data flowing
    if (n.execute.totalTrajectories > 0) nodeStatus['execute'] = nodeStatus['execute'] || 'active';
    if (n.capture.steps > 0) nodeStatus['capture'] = nodeStatus['capture'] || 'active';
    if (n.store.memEntries > 0) nodeStatus['store'] = nodeStatus['store'] || 'active';
    CYCLE_NODES.forEach(function(nd) {
      var dot = document.getElementById('cd-' + nd.id);
      if (!dot) return;
      var st = nodeStatus[nd.id] || 'inactive';
      dot.setAttribute('fill', st === 'active' ? '#22c55e' : st === 'indirect' ? '#3b82f6' : '#333');
      dot.setAttribute('stroke', st === 'active' ? '#22c55e' : st === 'indirect' ? '#3b82f6' : '#555');
    });
  }

  // (Nautilus code removed — ring-only mode)

  // STAGE_ARCS + resolveVal kept for ring fractal panels
  var STAGE_ARCS = [
    { id: 'execute', label: 'EXECUTE', s: 0,   e: 45,  color: '#3b82f6', desc: 'Agent / Swarm',
      fractal: [{n:'Swarm',v:'activeStatus'},{n:'Steps',v:'activeSteps'},{n:'Trajectories',v:'totalTrajectories'}] },
    { id: 'capture', label: 'CAPTURE', s: 45,  e: 90,  color: '#f97316', desc: 'Steps / Errors',
      fractal: [{n:'Steps',v:'steps'},{n:'Errors',v:'errors'},{n:'Co-edits',v:'coEdits'}] },
    { id: 'store',   label: 'STORE',   s: 90,  e: 180, color: '#10b981', desc: '3-Tier + 7-Layer',
      fractal: [{n:'L1 threshold'},{n:'L2 SQL'},{n:'L3 HM'},{n:'L4 consol'},{n:'L5 reason'},{n:'L6 EWC'},{n:'L7 skills'}],
      tiers: true },
    { id: 'learn',   label: 'LEARN',   s: 180, e: 270, color: '#ef4444', desc: 'RL / EWC++ / SONA',
      fractal: [{n:'RL Train',v:'policies'},{n:'EWC++',v:'qValues'},{n:'SONA',v:'successEpisodes'}] },
    { id: 'recall',  label: 'RECALL',  s: 270, e: 315, color: '#06b6d4', desc: 'Critique / Errors',
      fractal: [{n:'Episodes',v:'episodes'},{n:'Errors',v:'errorsRecalled'},{n:'Mailbox',v:'mailbox'}] },
    { id: 'route',   label: 'ROUTE',   s: 315, e: 360, color: '#a855f7', desc: 'AST / RL / SONA',
      fractal: [{n:'ModelRouter'},{n:'RL predict'},{n:'SONA suggest'}] },
  ];

  function resolveVal(stageId, key, data) {
    var obj = data.nodes[stageId];
    if (!obj && stageId === 'route') obj = Object.assign({}, data.nodes.route, data.modelRouter || {});
    if (!obj) return '?';
    return obj[key] !== undefined ? obj[key] : '?';
  }

  // nautilus code removed — ring only
  // (bulk removed: spiralR, arcD, shellWidth, miniArcD, buildNautilusSvg,
  //  toggleFractal, closeFractal, updateNautilusBadges, animateShell,
  //  cascadeLayers, pulseNautilusChanges, switchCycleView)
  // ── END OF NAUTILUS REMOVAL MARKER ──
  function pulseChangedEdges(prev, curr) {
    if (!prev || !curr) return;
    var checks = [
      { idx: 0, field: function(d) { return d.modelRouter.totalDecisions; } },           // ROUTE→EXECUTE
      { idx: 1, field: function(d) { return d.nodes.capture.steps; } },                   // EXECUTE→CAPTURE
      { idx: 2, field: function(d) { return d.nodes.store.memEntries; } },                // CAPTURE→STORE
      { idx: 3, field: function(d) { return d.nodes.learn.policies; } },                  // STORE→LEARN
      { idx: 4, field: function(d) { return d.nodes.recall.episodes; } },                 // LEARN→RECALL
      { idx: 5, field: function(d) { return d.nodes.recall.episodes + d.nodes.recall.errorsRecalled; } }, // RECALL→ROUTE
    ];
    checks.forEach(function(c) {
      var prevVal = c.field(prev);
      var currVal = c.field(curr);
      if (currVal > prevVal) {
        var el = document.getElementById('ce-' + c.idx);
        if (el) {
          el.classList.remove('cycle-edge-pulse');
          void el.offsetWidth; // force reflow
          el.classList.add('cycle-edge-pulse');
          el.setAttribute('opacity', '1');
          setTimeout(function() {
            el.setAttribute('opacity', '0.6');
            el.classList.remove('cycle-edge-pulse');
          }, 3000);
        }
      }
    });
  }

  var CYCLE_EDGE_LABELS = [
    { from: 'ROUTE', to: 'EXECUTE', verb: 'Prompt classified and dispatched to execution tier' },
    { from: 'EXECUTE', to: 'CAPTURE', verb: 'Tool calls and reasoning steps captured as trajectory' },
    { from: 'CAPTURE', to: 'STORE', verb: 'Trajectory vectorized and persisted to memory tiers' },
    { from: 'STORE', to: 'LEARN', verb: 'Reward signal computed, RL policy weights updated' },
    { from: 'LEARN', to: 'RECALL', verb: 'Episode finalized with verdict and strategy distilled' },
    { from: 'RECALL', to: 'ROUTE', verb: 'Learned context and critique injected into next routing decision' },
  ];

  function cycleLog(msg, color) {
    var log = document.getElementById('cycle-log');
    if (!log) return;
    var ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    var line = document.createElement('div');
    line.style.cssText = 'opacity:0;transform:translateY(8px);transition:opacity 0.3s,transform 0.3s;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.6';
    line.innerHTML = '<span style="color:#475569">' + ts + '</span> <span style="color:' + (color || '#94a3b8') + '">' + msg + '</span>';
    log.insertBefore(line, log.firstChild);
    requestAnimationFrame(function() { line.style.opacity = '1'; line.style.transform = 'translateY(0)'; });
    // Keep max 20 lines
    while (log.children.length > 20) log.removeChild(log.lastChild);
    // Fade older lines
    for (var i = 0; i < log.children.length; i++) {
      log.children[i].style.opacity = Math.max(0.2, 1 - i * 0.15).toFixed(2);
    }
  }

  async function fetchCycleData() {
    try {
      var resp = await fetch('/api/architecture-live');
      var data = await resp.json();
      if (_cycleData) {
        // Detect changes and log them
        var checks = [
          { idx: 0, field: function(d) { return d.modelRouter.totalDecisions; }, delta: function(p,c) { return c.modelRouter.totalDecisions - p.modelRouter.totalDecisions; } },
          { idx: 1, field: function(d) { return d.nodes.capture.steps; }, delta: function(p,c) { return c.nodes.capture.steps - p.nodes.capture.steps; } },
          { idx: 2, field: function(d) { return d.nodes.store.memEntries; }, delta: function(p,c) { return c.nodes.store.memEntries - p.nodes.store.memEntries; } },
          { idx: 3, field: function(d) { return d.nodes.learn.policies; }, delta: function(p,c) { return c.nodes.learn.policies - p.nodes.learn.policies; } },
          { idx: 4, field: function(d) { return d.nodes.recall.episodes; }, delta: function(p,c) { return c.nodes.recall.episodes - p.nodes.recall.episodes; } },
          { idx: 5, field: function(d) { return d.nodes.recall.episodes + d.nodes.recall.errorsRecalled; }, delta: function(p,c) { return (c.nodes.recall.episodes + c.nodes.recall.errorsRecalled) - (p.nodes.recall.episodes + p.nodes.recall.errorsRecalled); } },
        ];
        checks.forEach(function(c) {
          var prevVal = c.field(_cycleData);
          var currVal = c.field(data);
          if (currVal > prevVal) {
            var lbl = CYCLE_EDGE_LABELS[c.idx];
            var d = c.delta(_cycleData, data);
            var edge = CYCLE_EDGES[c.idx];
            cycleLog(lbl.from + ' \u2192 ' + lbl.to + ': ' + lbl.verb + ' (+' + d + ')', edge.toColor);
          }
        });
        pulseChangedEdges(_cycleData, data);
      } else {
        // First load — log initial state
        cycleLog('Learning cycle live — 6-stage feedback loop polling every 3s', '#22c55e');
        cycleLog('Trajectory depth: ' + data.center.steps + ' steps | Q-value estimates: ' + data.center.qValues + ' | Tier distribution: ' + data.center.tierSummary, '#64748b');
        if (data.improvement && data.improvement.ready) {
          cycleLog('Reward delta: ' + (parseFloat(data.improvement.rewardDelta) >= 0 ? '+' : '') + data.improvement.rewardDelta + '% cumulative improvement over ' + data.improvement.sessions + ' learning sessions', '#a855f7');
        }
      }
      _cyclePrev = _cycleData;
      _cycleData = data;
      updateCycleBadges(data);
    } catch (err) {
      console.error('[Cycle] fetch error:', err);
    }
  }

  function initLearningCycle() {
    if (!document.getElementById('cycle-svg')) return;
    buildCycleSvg();
    fetchCycleData();
    _cycleInterval = setInterval(fetchCycleData, 3000);
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
    initLearningCycle();
    setInterval(async () => {
      await refreshGraph();
    }, 5e3);
  }
  init().catch(console.error);
})();
//# sourceMappingURL=dashboard.js.map
