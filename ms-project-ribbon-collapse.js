(() => {
  const COLLAPSE_KEY = "ms-project-ribbon-collapsed-v1";

  function boot() {
    const tabs = document.getElementById("ribbonTabs");
    const ribbon = document.querySelector(".office-ribbon");
    if (!tabs || !ribbon) {
      setTimeout(boot, 100);
      return;
    }
    installToggle(tabs);
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

  function applyCollapsed(collapsed) {
    document.body.classList.toggle("ms-ribbon-collapsed", collapsed);
    const button = document.getElementById("msRibbonCollapseToggle");
    if (!button) return;
    button.textContent = collapsed ? "Show Ribbon ▾" : "Hide Ribbon ▴";
    button.setAttribute("aria-expanded", String(!collapsed));
    button.title = collapsed ? "Show the command ribbon" : "Hide the command ribbon to save vertical space";
  }
})();
