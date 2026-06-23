(() => {
  const COMMANDS = [
    {
      title: "Home",
      actions: [
        { label: "Blank project", target: "newProjectBtn", primary: true },
        { label: "Sample plan", target: "sampleBtn" },
      ],
    },
    {
      title: "Apps",
      actions: [
        { label: "Task canvas", view: "schedule", primary: true },
        { label: "Resource sheet", view: "resources" },
      ],
    },
    {
      title: "Files",
      actions: [
        { label: "Import Project XML", file: "importXmlInput", primary: true },
        { label: "Convert MPP locally", file: "importMppInput" },
        { label: "Export Project XML", target: "exportXmlBtn" },
        { label: "Export CSV actuals", target: "exportCsvBtn" },
        { label: "Standalone converter", href: "mpp-local-converter.html" },
      ],
    },
    {
      title: "Grid",
      actions: [
        { label: "Show task canvas", view: "schedule", primary: true },
        { label: "Add task", target: "addTaskBtn" },
        { label: "Task information", target: "taskInfoBtn" },
      ],
    },
    {
      title: "Tasks",
      actions: [
        { label: "Add task", target: "addTaskBtn", primary: true },
        { label: "Indent selected", target: "indentTaskBtn" },
        { label: "Outdent selected", target: "outdentTaskBtn" },
        { label: "Auto schedule", target: "autoScheduleBtn" },
      ],
    },
    {
      title: "Board",
      actions: [
        { label: "Resource sheet", view: "resources", primary: true },
        { label: "Add resource", target: "addResourceBtn" },
      ],
    },
    {
      title: "Gantt",
      actions: [
        { label: "Show Gantt canvas", view: "schedule", primary: true },
        { label: "Auto schedule", target: "autoScheduleBtn" },
        { label: "Set baseline", target: "setBaselineBtn" },
      ],
    },
    {
      title: "Calendar",
      actions: [
        { label: "Set baseline", target: "setBaselineBtn", primary: true },
        { label: "Focus project start", focus: "projectStart" },
        { label: "Focus working days", focus: "workingDaysInput" },
        { label: "Focus holidays", focus: "holidayInput" },
      ],
    },
    {
      title: "Reports",
      actions: [
        { label: "Export CSV actuals", target: "exportCsvBtn", primary: true },
        { label: "Export Project XML", target: "exportXmlBtn" },
      ],
    },
    {
      title: "Settings",
      actions: [
        { label: "Resource sheet", view: "resources" },
        { label: "Task canvas", view: "schedule", primary: true },
      ],
    },
  ];

  function boot() {
    const sidebar = document.getElementById("stitchSidebar");
    if (!sidebar) {
      window.setTimeout(boot, 100);
      return;
    }
    installDrawer();
    sidebar.querySelectorAll(".stitch-rail-item").forEach((item, index) => {
      item.dataset.commandIndex = String(index);
      item.setAttribute("role", "button");
      item.setAttribute("tabindex", "0");
      item.setAttribute("aria-label", COMMANDS[index]?.title || "Command");
      item.addEventListener("click", () => openDrawer(index, item));
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDrawer(index, item);
        }
      });
    });
    document.addEventListener("click", (event) => {
      const drawer = document.getElementById("stitchCommandDrawer");
      if (!drawer || drawer.hidden) return;
      if (drawer.contains(event.target) || sidebar.contains(event.target)) return;
      drawer.hidden = true;
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDrawer();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  function installDrawer() {
    if (document.getElementById("stitchCommandDrawer")) return;
    const drawer = document.createElement("aside");
    drawer.id = "stitchCommandDrawer";
    drawer.className = "stitch-command-drawer";
    drawer.hidden = true;
    drawer.setAttribute("aria-label", "ProjectHub commands");
    document.body.appendChild(drawer);
    drawer.addEventListener("click", handleCommandClick);
  }

  function openDrawer(index, item) {
    const config = COMMANDS[index] || COMMANDS[0];
    const drawer = document.getElementById("stitchCommandDrawer");
    if (!drawer) return;
    document.querySelectorAll(".stitch-rail-item").forEach((rail) => rail.classList.remove("is-active"));
    item?.classList.add("is-active");
    drawer.innerHTML = `
      <header>
        <h3>${escapeHtml(config.title)}</h3>
        <button class="stitch-command-close" type="button" data-command-close aria-label="Close commands">×</button>
      </header>
      <div class="stitch-command-list">
        ${config.actions.map(actionMarkup).join("")}
      </div>`;
    drawer.hidden = false;
  }

  function closeDrawer() {
    const drawer = document.getElementById("stitchCommandDrawer");
    if (drawer) drawer.hidden = true;
  }

  function actionMarkup(action) {
    const primary = action.primary ? " primary-command" : "";
    if (action.href) {
      return `<a class="${primary.trim()}" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}<small>Open</small></a>`;
    }
    if (action.file) {
      return `<label class="${primary.trim()}">${escapeHtml(action.label)}<small>Choose file</small><input type="file" data-proxy-file="${escapeHtml(action.file)}"></label>`;
    }
    const attrs = Object.entries(action)
      .filter(([key]) => key !== "label" && key !== "primary")
      .map(([key, value]) => `data-${toKebab(key)}="${escapeHtml(value)}"`)
      .join(" ");
    return `<button class="${primary.trim()}" type="button" ${attrs}>${escapeHtml(action.label)}<small>Run</small></button>`;
  }

  function handleCommandClick(event) {
    if (event.target.closest("[data-command-close]")) {
      closeDrawer();
      return;
    }
    const fileProxy = event.target.closest("input[data-proxy-file]");
    if (fileProxy) {
      const real = document.getElementById(fileProxy.dataset.proxyFile);
      real?.click();
      closeDrawer();
      return;
    }
    const button = event.target.closest("button[data-target], button[data-view], button[data-focus]");
    if (!button) return;
    if (button.dataset.view && typeof setActiveView === "function") setActiveView(button.dataset.view);
    if (button.dataset.target) document.getElementById(button.dataset.target)?.click();
    if (button.dataset.focus) document.getElementById(button.dataset.focus)?.focus();
    closeDrawer();
  }

  function toKebab(value) {
    return String(value).replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }
})();
