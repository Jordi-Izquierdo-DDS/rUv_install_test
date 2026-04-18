// src/panels/data-tables.ts
var ACTIVE_TABLE = { current: "patterns" };
function initTables() {
  const tabs = document.querySelectorAll(".table-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
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
    }
  } catch (err) {
    container.innerHTML = `<div style="color:var(--color-missing);padding:20px">Error: ${err}</div>`;
  }
}
async function renderPatterns(el) {
  const res = await fetch("/api/patterns");
  const data = await res.json();
  let html = `
    <div style="margin-bottom:12px;display:flex;gap:16px">
      <span class="badge badge-green">Short-term: ${data.counts.short}</span>
      <span class="badge badge-cyan">Long-term: ${data.counts.long}</span>
      <span class="badge badge-yellow">Promotion candidates: ${data.promotion.candidates}</span>
      <span style="color:var(--text-dim)">Threshold: usage\u2265${data.promotion.threshold.usage}, confidence\u2265${data.promotion.threshold.confidence}</span>
    </div>
  `;
  if (data.short.length) {
    html += '<div style="font-weight:600;margin:8px 0">Short-term Patterns</div>';
    html += '<table class="data"><tr><th>ID</th><th>Strategy</th><th>Domain</th><th>Quality</th><th>Usage</th><th>Updated</th></tr>';
    for (const p of data.short) {
      const isCandidate = p.usage_count >= 3 && p.quality >= 0.7;
      html += `<tr${isCandidate ? ' style="background:rgba(234,179,8,0.08)"' : ""}>
        <td>${p.id}</td><td>${p.strategy || "\u2014"}</td><td>${p.domain || "\u2014"}</td>
        <td>${(p.quality ?? 0).toFixed(2)}</td><td>${p.usage_count}</td>
        <td>${p.updated_at ? new Date(p.updated_at).toLocaleString() : "\u2014"}</td></tr>`;
    }
    html += "</table>";
  }
  if (data.long.length) {
    html += '<div style="font-weight:600;margin:16px 0 8px">Long-term Patterns (promoted)</div>';
    html += '<table class="data"><tr><th>ID</th><th>Strategy</th><th>Domain</th><th>Quality</th><th>Usage</th><th>Promoted</th></tr>';
    for (const p of data.long) {
      html += `<tr><td>${p.id}</td><td>${p.strategy || "\u2014"}</td><td>${p.domain || "\u2014"}</td>
        <td>${(p.quality ?? 0).toFixed(2)}</td><td>${p.usage_count}</td>
        <td>${p.promoted_at ? new Date(p.promoted_at).toLocaleString() : "\u2014"}</td></tr>`;
    }
    html += "</table>";
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
      html += `<pre class="code" style="max-height:200px">${escapeHtml(JSON.stringify(info.preview, null, 2))}</pre>`;
    }
  }
  el.innerHTML = html;
}
async function renderSession(el) {
  const res = await fetch("/api/session");
  const data = await res.json();
  let html = `
    <div style="margin-bottom:12px;display:flex;gap:16px">
      <span class="badge badge-green">Metrics: ${data.counts.metrics}</span>
      <span class="badge badge-cyan">Exports: ${data.counts.exports}</span>
    </div>
  `;
  if (data.sessionState?.length) {
    html += '<div style="font-weight:600;margin:8px 0">Session State</div>';
    html += '<table class="data"><tr><th>Key</th><th>Value</th><th>Updated</th></tr>';
    for (const s of data.sessionState) {
      html += `<tr><td>${s.key}</td><td>${s.value}</td><td>${s.updated_at || "\u2014"}</td></tr>`;
    }
    html += "</table>";
  }
  if (data.metrics?.length) {
    html += '<div style="font-weight:600;margin:16px 0 8px">Learning Metrics (latest)</div>';
    html += '<table class="data"><tr><th>Type</th><th>Name</th><th>Value</th><th>Timestamp</th></tr>';
    for (const m of data.metrics.slice(0, 30)) {
      html += `<tr><td>${m.metric_type || "\u2014"}</td><td>${m.metric_name || "\u2014"}</td><td>${m.metric_value}</td><td>${m.timestamp ? new Date(m.timestamp).toLocaleString() : "\u2014"}</td></tr>`;
    }
    html += "</table>";
  }
  if (data.exports?.length) {
    html += '<div style="font-weight:600;margin:16px 0 8px">Session Exports</div>';
    html += '<table class="data"><tr><th>File</th><th>Size</th><th>Modified</th></tr>';
    for (const f of data.exports.slice(0, 20)) {
      html += `<tr><td>${f.file}</td><td>${f.size ? (f.size / 1024).toFixed(1) + " KB" : "\u2014"}</td><td>${f.mtime ? new Date(f.mtime).toLocaleString() : "\u2014"}</td></tr>`;
    }
    html += "</table>";
  }
  el.innerHTML = html;
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export {
  initTables,
  loadTable
};
