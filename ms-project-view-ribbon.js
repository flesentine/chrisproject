(() => {
  const VIEW_RIBBON_VERSION = "v0.29.0";

  function boot() {
    const viewPanel = document.querySelector('[data-ribbon-panel="view"]');
    if (!viewPanel) {
      setTimeout(boot, 100);
      return;
    }
    installViewRibbon(viewPanel);
    patchVersion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  function installViewRibbon(viewPanel) {
    if (viewPanel.dataset.msViewRibbonEnhanced === "1") return;
    viewPanel.dataset.msViewRibbonEnhanced = "1";
    viewPanel.innerHTML = `
      <div class="ms-view-ribbon" aria-label="View ribbon commands">
        <div class="command-group">
          <div class="ms-command-body">
            <details class="ms-ribbon-menu" open>
              <summary class="ms-large-button ms-primary-tile"><i>▦</i>Gantt<br/>Chart ▾</summary>
              <div class="ms-ribbon-popover">
                <button type="button" data-ms-view-command="gantt-chart">Gantt Chart</button>
                <button type="button" data-ms-view-command="task-usage">Task Usage</button>
                <button type="button" data-ms-view-command="network-diagram">Network Diagram</button>
                <button type="button" data-ms-view-command="calendar">Calendar</button>
                <button type="button" data-ms-view-command="other-task-views">Other Views</button>
              </div>
            </details>
            <div class="ms-command-stack">
              <button class="ms-icon-button" type="button" data-ms-view-command="task-usage"><i>▤</i>Task Usage</button>
              <button class="ms-icon-button" type="button" data-ms-view-command="network-diagram"><i>▧</i>Network Diagram</button>
              <button class="ms-icon-button" type="button" data-ms-view-command="calendar"><i>□</i>Calendar</button>
              <details class="ms-ribbon-menu">
                <summary class="ms-icon-button"><i>▾</i>Other Views ▾</summary>
                <div class="ms-ribbon-popover">
                  <button type="button" data-ms-view-command="task-sheet">Task Sheet</button>
                  <button type="button" data-ms-view-command="tracking-gantt">Tracking Gantt</button>
                  <button type="button" data-ms-view-command="classic-grid">Classic Grid</button>
                </div>
              </details>
            </div>
          </div>
          <span class="group-label">Task Views</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <button class="ms-large-button" type="button" data-ms-view-command="team-planner"><i>▥</i>Team<br/>Planner</button>
            <div class="ms-command-stack">
              <details class="ms-ribbon-menu">
                <summary class="ms-icon-button"><i>▧</i>Resource Usage ▾</summary>
                <div class="ms-ribbon-popover">
                  <button type="button" data-ms-view-command="resource-usage">Resource Usage</button>
                  <button type="button" data-ms-view-command="resource-sheet">Resource Sheet</button>
                </div>
              </details>
              <button class="ms-icon-button" type="button" data-ms-view-command="resource-sheet"><i>▦</i>Resource Sheet</button>
              <details class="ms-ribbon-menu">
                <summary class="ms-icon-button"><i>▾</i>Other Views ▾</summary>
                <div class="ms-ribbon-popover">
                  <button type="button" data-ms-view-command="resource-graph">Resource Graph placeholder</button>
                  <button type="button" data-ms-view-command="resource-form">Resource Form placeholder</button>
                </div>
              </details>
            </div>
          </div>
          <span class="group-label">Resource Views</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <div class="ms-command-stack">
              <button class="ms-icon-button" type="button" data-ms-view-command="sort"><i>A↧Z</i>Sort</button>
              <details class="ms-ribbon-menu">
                <summary class="ms-icon-button"><i>↳</i>Outline ▾</summary>
                <div class="ms-ribbon-popover">
                  <button type="button" data-ms-view-command="outline-all">All Subtasks</button>
                  <button type="button" data-ms-view-command="outline-level-1">Level 1</button>
                  <button type="button" data-ms-view-command="outline-level-2">Level 2</button>
                  <button type="button" data-ms-view-command="outline-collapse-selected">Collapse Selected</button>
                  <button type="button" data-ms-view-command="outline-expand-selected">Expand Selected</button>
                </div>
              </details>
              <details class="ms-ribbon-menu">
                <summary class="ms-icon-button"><i>▦</i>Tables ▾</summary>
                <div class="ms-ribbon-popover">
                  <button type="button" data-ms-view-command="table-entry">Entry</button>
                  <button type="button" data-ms-view-command="table-schedule">Schedule</button>
                  <button type="button" data-ms-view-command="table-actuals">Actuals</button>
                  <button type="button" data-ms-view-command="table-variance">Variance</button>
                </div>
              </details>
            </div>
            <div class="ms-data-controls">
              <label for="msViewHighlight">Highlight:</label>
              <select id="msViewHighlight" data-ms-view-command="highlight">
                <option value="none">[No Highlight]</option>
                <option value="critical">Late / warning tasks</option>
                <option value="complete">Completed tasks</option>
                <option value="in-progress">In Progress</option>
              </select>
              <label for="msViewFilter">Filter:</label>
              <select id="msViewFilter" data-ms-view-command="filter">
                <option value="none">[No Filter]</option>
                <option value="incomplete">Incomplete Tasks</option>
                <option value="complete">Completed Tasks</option>
                <option value="milestones">Milestones</option>
                <option value="late">Late Against Baseline</option>
              </select>
              <label for="msViewGroup">Group by:</label>
              <select id="msViewGroup" data-ms-view-command="group">
                <option value="none">[No Group]</option>
                <option value="status">Status</option>
                <option value="outline">Outline Level</option>
                <option value="resource">Resource</option>
              </select>
            </div>
          </div>
          <span class="group-label">Data</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <label class="ms-timescale-control">Timescale:
              <select class="ms-timescale-select" id="msViewTimescale" data-ms-view-command="timescale">
                <option value="5">[5] Days</option>
                <option value="1">[1] Day</option>
                <option value="7">[1] Week</option>
                <option value="14">[2] Weeks</option>
                <option value="30">[1] Month</option>
              </select>
            </label>
            <button class="ms-large-button" type="button" data-ms-view-command="zoom"><i>⌕</i>Zoom</button>
            <button class="ms-large-button" type="button" data-ms-view-command="entire-project"><i>▣</i>Entire<br/>Project</button>
            <button class="ms-large-button" type="button" data-ms-view-command="selected-tasks"><i>■</i>Selected<br/>Tasks</button>
          </div>
          <span class="group-label">Zoom</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <div class="ms-checkbox-stack">
              <label><input type="checkbox" data-ms-view-command="timeline"/> Timeline</label>
              <label><input type="checkbox" data-ms-view-command="details"/> Details</label>
            </div>
          </div>
          <span class="group-label">Split View</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <button class="ms-large-button" type="button" data-ms-view-command="new-window"><i>▣</i>New<br/>Window</button>
            <div class="ms-command-stack">
              <details class="ms-ribbon-menu">
                <summary class="ms-icon-button"><i>▤</i>Switch Windows ▾</summary>
                <div class="ms-ribbon-popover">
                  <button type="button" data-ms-view-command="switch-gantt">Gantt Chart</button>
                  <button type="button" data-ms-view-command="switch-resource">Resource Sheet</button>
                </div>
              </details>
              <button class="ms-icon-button" type="button" data-ms-view-command="arrange-all"><i>▥</i>Arrange All</button>
              <details class="ms-ribbon-menu">
                <summary class="ms-icon-button"><i>▾</i>Hide ▾</summary>
                <div class="ms-ribbon-popover">
                  <button type="button" data-ms-view-command="hide-ribbon">Hide Ribbon</button>
                  <button type="button" data-ms-view-command="hide-summary">Hide Summary</button>
                </div>
              </details>
            </div>
          </div>
          <span class="group-label">Window</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <details class="ms-ribbon-menu">
              <summary class="ms-large-button"><i>▤</i>Macros ▾</summary>
              <div class="ms-ribbon-popover">
                <button type="button" data-ms-view-command="macro-export-csv">Export Actuals CSV</button>
                <button type="button" data-ms-view-command="macro-update-project">Update Project</button>
                <button type="button" data-ms-view-command="macro-placeholder">Macro recorder placeholder</button>
              </div>
            </details>
          </div>
          <span class="group-label">Macros</span>
        </div>
      </div>`;
    viewPanel.addEventListener("click", handleViewRibbonClick);
    viewPanel.addEventListener("change", handleViewRibbonChange);
  }

  function patchVersion() {
    const label = `${VIEW_RIBBON_VERSION} · View tab ribbon`;
    const ribbon = document.getElementById("ribbonVersionText");
    const badge = document.getElementById("appVersionBadge");
    const footer = document.getElementById("appVersionFooter");
    if (ribbon) ribbon.textContent = label;
    if (badge) badge.textContent = label;
    if (footer) footer.textContent = `${label} · Build 2026-06-23`;
  }

  function handleViewRibbonChange(event) {
    const command = event.target?.dataset?.msViewCommand;
    if (!command) return;
    if (command === "timescale") return setTimescale(Number(event.target.value));
    if (command === "highlight") return setHighlight(event.target.value);
    if (command === "filter") return setFilter(event.target.value);
    if (command === "group") return setGroup(event.target.value);
    if (command === "timeline") return toggleTimeline(event.target.checked);
    if (command === "details") return toggleDetails(event.target.checked);
  }

  function handleViewRibbonClick(event) {
    const commandEl = event.target.closest("[data-ms-view-command]");
    if (!commandEl || commandEl.tagName === "SELECT" || commandEl.tagName === "INPUT") return;
    const command = commandEl.dataset.msViewCommand;
    switch (command) {
      case "gantt-chart":
      case "classic-grid":
      case "switch-gantt": return clickId("scheduleViewBtn") || toast("Already in Gantt Chart view.");
      case "resource-sheet":
      case "resource-usage":
      case "switch-resource": return clickId("resourceViewBtn");
      case "task-usage": return toast("Task Usage placeholder added. Assignment usage rows come with the resource leveling/cost modules.");
      case "network-diagram": return toast("Network Diagram placeholder added. Dependency graph view can be a later view module.");
      case "calendar": return focusCalendar();
      case "other-task-views": return toast("Other task views menu added. More views come later.");
      case "team-planner": return toast("Team Planner placeholder added. Resource leveling comes later.");
      case "resource-graph": return toast("Resource Graph placeholder added.");
      case "resource-form": return toast("Resource Form placeholder added.");
      case "sort": return sortTasksByStart();
      case "outline-all": return outlineAll();
      case "outline-level-1": return outlineToLevel(1);
      case "outline-level-2": return outlineToLevel(2);
      case "outline-collapse-selected": return collapseSelected(true);
      case "outline-expand-selected": return collapseSelected(false);
      case "table-entry": return tableToast("Entry");
      case "table-schedule": return tableToast("Schedule");
      case "table-actuals": return tableToast("Actuals");
      case "table-variance": return tableToast("Variance");
      case "zoom": return zoomPrompt();
      case "entire-project": return setTimescale(14, "Entire Project zoom applied.");
      case "selected-tasks": return scrollToSelected();
      case "new-window": return window.open(location.href, "_blank");
      case "arrange-all": return toast("Arrange All placeholder added. Browser windows are controlled by the OS.");
      case "hide-ribbon": return document.getElementById("msRibbonCollapseToggle")?.click();
      case "hide-summary": return toggleSummary();
      case "macro-export-csv": return clickId("exportCsvBtn");
      case "macro-update-project": return runUpdateProjectMacro();
      case "macro-placeholder": return toast("Macro recorder placeholder added.");
      default: return toast("View command added.");
    }
  }

  function focusCalendar() {
    const projectTab = document.querySelector('[data-ribbon-tab="project"]');
    projectTab?.click();
    setTimeout(() => {
      document.getElementById("workingDaysInput")?.focus();
      toast("Calendar settings are on the Project tab.");
    }, 0);
  }

  function setTimescale(value, message = null) {
    const dayWidth = value <= 1 ? 96 : value <= 5 ? 64 : value <= 7 ? 54 : value <= 14 ? 42 : 30;
    const control = document.getElementById("dayWidthControl");
    if (control) {
      control.value = String(dayWidth);
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }
    toast(message || `Timescale set to ${value} day${value === 1 ? "" : "s"}.`);
  }

  function setHighlight(value) {
    document.body.classList.toggle("ms-view-highlight-critical", value === "critical");
    toast(value === "none" ? "Highlight cleared." : `Highlight set to ${value}.`);
  }

  function setFilter(value) {
    document.body.dataset.msViewFilter = value;
    toast(value === "none" ? "Filter cleared." : `Filter selected: ${value}. Filtering rows visually is next.`);
  }

  function setGroup(value) {
    document.body.dataset.msViewGroup = value;
    toast(value === "none" ? "Grouping cleared." : `Group by ${value} selected. Grouped row rendering comes later.`);
  }

  function toggleTimeline(checked) {
    document.body.classList.toggle("ms-view-show-timeline", checked);
    toast(checked ? "Timeline placeholder shown in command state." : "Timeline hidden.");
  }

  function toggleDetails(checked) {
    if (checked) clickId("taskInfoBtn");
    toast(checked ? "Details opened as Task Information." : "Details unchecked.");
  }

  function sortTasksByStart() {
    if (!Array.isArray(state.tasks)) return;
    state.tasks.sort((a, b) => String(a.start || "").localeCompare(String(b.start || "")) || Number(a.id || 0) - Number(b.id || 0));
    state.tasks.forEach((task, index) => { task.id = index + 1; });
    renderSafe();
    toast("Tasks sorted by Start date.");
  }

  function outlineAll() {
    if (Array.isArray(state.collapsedTaskUids)) state.collapsedTaskUids.length = 0;
    if (state.collapsedTaskUids instanceof Set) state.collapsedTaskUids.clear();
    renderSafe();
    toast("Showing all subtasks.");
  }

  function outlineToLevel(level) {
    if (!Array.isArray(state.tasks)) return;
    state.tasks.forEach((task) => {
      if (Number(task.outlineLevel || 1) >= level && typeof task.uid !== "undefined") {
        state.collapsedTaskUids = state.collapsedTaskUids || [];
        if (Array.isArray(state.collapsedTaskUids) && !state.collapsedTaskUids.includes(task.uid)) state.collapsedTaskUids.push(task.uid);
      }
    });
    renderSafe();
    toast(`Outline collapsed near level ${level}.`);
  }

  function collapseSelected(collapsed) {
    const index = getSelectedIndex();
    const task = index == null ? null : state.tasks?.[index];
    if (!task) return toast("Select a summary task first.");
    state.collapsedTaskUids = state.collapsedTaskUids || [];
    if (Array.isArray(state.collapsedTaskUids)) {
      state.collapsedTaskUids = collapsed
        ? Array.from(new Set([...state.collapsedTaskUids, task.uid]))
        : state.collapsedTaskUids.filter((uid) => uid !== task.uid);
    }
    renderSafe();
    toast(collapsed ? "Collapsed selected outline." : "Expanded selected outline.");
  }

  function tableToast(name) {
    toast(`${name} table selected. Current grid keeps all key columns visible for now.`);
  }

  function zoomPrompt() {
    const raw = prompt("Day cell width in pixels:", document.getElementById("dayWidthControl")?.value || "64");
    if (!raw) return;
    const value = Math.max(24, Math.min(160, Number(raw) || 64));
    const control = document.getElementById("dayWidthControl");
    if (control) {
      control.value = String(value);
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }
    toast(`Zoom set to ${value}px day cells.`);
  }

  function scrollToSelected() {
    const index = getSelectedIndex();
    const row = document.querySelector(`[data-row-index="${index}"]`);
    row?.scrollIntoView({ block: "center", inline: "nearest" });
    toast("Scrolled to selected task.");
  }

  function toggleSummary() {
    const summary = document.querySelector(".summary-grid");
    if (!summary) return toast("Summary cards are already hidden in this layout.");
    summary.hidden = !summary.hidden;
    toast(summary.hidden ? "Summary hidden." : "Summary shown.");
  }

  function runUpdateProjectMacro() {
    const projectTab = document.querySelector('[data-ribbon-tab="project"]');
    projectTab?.click();
    setTimeout(() => {
      const button = document.querySelector('[data-ms-project-command="update-project"]');
      button?.click();
    }, 0);
  }

  function getSelectedIndex() {
    if (typeof getSelectedTaskIndex === "function") return getSelectedTaskIndex();
    return Number.isInteger(window.selectedTaskIndex) ? window.selectedTaskIndex : 0;
  }

  function clickId(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.click();
    return true;
  }

  function renderSafe() {
    if (typeof render === "function") render();
  }

  function toast(message) {
    let el = document.getElementById("msViewToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "msViewToast";
      el.className = "ms-view-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    clearTimeout(el._hideTimer);
    el.hidden = false;
    el._hideTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }
})();
