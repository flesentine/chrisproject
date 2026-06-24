(() => {
  const COLLAPSE_KEY = "ms-project-ribbon-collapsed-v1";
  const VIEW_ASSET_VERSION = "v0.29.0";
  const GANTT_FORMAT_VERSION = "v0.30.0";

  function boot() {
    const tabs = document.getElementById("ribbonTabs");
    const ribbon = document.querySelector(".office-ribbon");
    if (!tabs || !ribbon) {
      setTimeout(boot, 100);
      return;
    }
    installToggle(tabs);
    loadViewRibbonAssets();
    loadGanttFormatAssets();
    applyCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  function installToggle(tabs) {
    if (document.getElementById("msRibbonCollapseToggle")) return;
    const button = document.createElement("button");
    button.id = "msRibbonCollapseToggle";
    button.className = "ms-ribbon-collapse-toggle";
    button.type = "button";
    button.addEventListener("click", () => {
      const collapsed = !document.body.classList.contains("ms-ribbon-collapsed");
      applyCollapsed(collapsed);
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    });
    tabs.appendChild(button);
  }

  function loadViewRibbonAssets() {
    loadCss("msProjectViewRibbonCss", `ms-project-view-ribbon.css?${VIEW_ASSET_VERSION}`);
    loadScript("msProjectViewRibbonJs", `ms-project-view-ribbon.js?${VIEW_ASSET_VERSION}`);
  }

  function loadGanttFormatAssets() {
    loadCss("msProjectGanttFormatRibbonCss", `ms-project-gantt-format-ribbon.css?${GANTT_FORMAT_VERSION}`);
    loadScript("msProjectGanttFormatRibbonJs", `ms-project-gantt-format-ribbon.js?${GANTT_FORMAT_VERSION}`);
  }

  function loadCss(id, href) {
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(id, src) {
    if (document.getElementById(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.defer = true;
    document.body.appendChild(script);
  }

  function applyCollapsed(collapsed) {
    document.body.classList.toggle("ms-ribbon-collapsed", collapsed);
    const button = document.getElementById("msRibbonCollapseToggle");
    if (!button) return;
    button.textContent = collapsed ? "Show Ribbon ▾" : "Hide Ribbon ▴";
    button.setAttribute("aria-expanded", String(!collapsed));
    button.title = collapsed ? "Show the command ribbon" : "Hide the command ribbon to save vertical space";
  }
})();
