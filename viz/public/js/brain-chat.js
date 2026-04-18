// src/panels/brain-chat.ts — v2 with source filters
function initBrainChat() {
  const input = document.getElementById("brain-query");
  const btn = document.getElementById("brain-search-btn");
  const results = document.getElementById("brain-results");

  // Remove any prior filter bar (from bundle's initBrainChat)
  const old = document.querySelector(".brain-source-filters");
  if (old) old.remove();

  // Replace button/input listeners by cloning nodes
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);

  // Insert source filter checkboxes above results
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

  loadBrainStatus(results);
  newBtn.addEventListener("click", () => doSearch(newInput, results));
  newInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch(newInput, results);
  });
}

function getSelectedSources() {
  return Array.from(document.querySelectorAll(".brain-src-cb:checked")).map(cb => cb.value);
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
          <span style="font-weight:600">${escapeHtml(r.title || r.id || "Result")}</span>
          <span style="display:flex;gap:8px;align-items:center">
            <span class="brain-source-tag" data-source="${r.source}">${escapeHtml(r.source)}</span>
            ${r.score !== void 0 ? `<span class="score">${(r.score * 100).toFixed(1)}%</span>` : ""}
          </span>
        </div>
        <div>${escapeHtml(r.content || r.text || JSON.stringify(r).slice(0, 500))}</div>
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
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
export {
  initBrainChat
};
