import { initGraph, refreshGraph, rescanNodes, saveLayout, resetLayout, toggleBoxes, toggleLegend, toggleFilter, togglePulseScope, pulseEdgesByStatus } from "./learning-graph";
import { initTables } from "./data-tables";
import { initBrainChat } from "./brain-chat";
import { closeSidePanel } from "./side-panel";
import { loadProjectInfo } from "./summary-bar";
import { initWorkerButtons } from "./worker-buttons";
import { initLearningPipeline } from "./learning-pipeline";
import { initMcpButtons } from "./mcp-buttons";
import { initInspectButtons } from "./inspect-buttons";
import { initSessionButtons } from "./session-buttons";
const tabs = document.querySelectorAll(".tab");
const views = document.querySelectorAll(".view");
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
  setInterval(async () => {
    await refreshGraph();
  }, 1e3);
}
init().catch(console.error);
