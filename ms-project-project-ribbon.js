(() => {
  const PROJECT_RIBBON_VERSION = "v0.28.0";

  function boot() {
    const projectPanel = document.querySelector('[data-ribbon-panel="project"]');
    if (!projectPanel) {
      setTimeout(boot, 100);
      return;
    }
    installProjectRibbon(projectPanel);
    patchVersion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  function installProjectRibbon(projectPanel) {
    if (projectPanel.dataset.msProjectRibbonEnhanced === "1") return;
    projectPanel.dataset.msProjectRibbonEnhanced = "1";
    projectPanel.innerHTML = `
      <div class="ms-project-ribbon" aria-label="Project ribbon commands">
        <div class="command-group">
          <div class="ms-command-body">
            <button class="ms-large-button ms-primary-tile" type="button" data-ms-project-command="subproject"><i>▣</i>Subproject</button>
          </div>
          <span class="group-label">Insert</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <div class="ms-command-stack">
              <button class="ms-icon-button" type="button" data-ms-project-command="get-addins"><i>＋</i>Get Add-ins</button>
              <details class="ms-ribbon-menu">
                <summary class="ms-icon-button"><i>◆</i>My Add-ins ▾</summary>
                <div class="ms-ribbon-popover">
                  <button type="button" data-ms-project-command="my-addins">Manage add-ins</button>
                  <button type="button" data-ms-project-command="addins-placeholder">No installed add-ins</button>
                </div>
              </details>
            </div>
          </div>
          <span class="group-label">Add-ins</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <button class="ms-large-button" type="button" data-ms-project-command="project-information"><i>▤</i>Project<br/>Information</button>
            <button class="ms-large-button" type="button" data-ms-project-command="custom-fields"><i>▦</i>Custom<br/>Fields</button>
            <button class="ms-large-button" type="button" data-ms-project-command="links-between-projects"><i>🔗</i>Links Between<br/>Projects</button>
            <details class="ms-ribbon-menu">
              <summary class="ms-large-button"><i>WBS</i>WBS ▾</summary>
              <div class="ms-ribbon-popover">
                <button type="button" data-ms-project-command="wbs-view">Show selected WBS</button>
                <button type="button" data-ms-project-command="wbs-renumber">Renumber WBS</button>
                <button type="button" data-ms-project-command="wbs-code">Define code placeholder</button>
              </div>
            </details>
            <button class="ms-large-button" type="button" data-ms-project-command="change-working-time"><i>◷</i>Change<br/>Working Time</button>
          </div>
          <span class="group-label">Properties</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <button class="ms-large-button" type="button" data-ms-project-command="calculate-project"><i>▦</i>Calculate<br/>Project</button>
            <details class="ms-ribbon-menu">
              <summary class="ms-large-button"><i>▾</i>Set<br/>Baseline ▾</summary>
              <div class="ms-ribbon-popover">
                <button type="button" data-ms-project-command="set-baseline">Set Baseline</button>
                <button type="button" data-ms-project-command="clear-baseline">Clear Baseline placeholder</button>
              </div>
            </details>
            <button class="ms-large-button" type="button" data-ms-project-command="move-project"><i>⇥</i>Move<br/>Project</button>
          </div>
          <span class="group-label">Schedule</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <label class="ms-status-date">Status Date:<input id="msProjectStatusDate" type="date" data-ms-project-command="status-date"/></label>
            <button class="ms-large-button" type="button" data-ms-project-command="update-project"><i>↻</i>Update<br/>Project</button>
          </div>
          <span class="group-label">Status</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <button class="ms-large-button" type="button" data-ms-project-command="spelling"><i>ABC✓</i>Spelling</button>
          </div>
          <span class="group-label">Proofing</span>
        </div>
      </div>`;
    projectPanel.addEventListener("click", handleProjectRibbonClick);
    projectPanel.addEventListener("change", handleProjectRibbonChange);
    syncStatusDateInput();
  }

  function patchVersion() {
    const label = `${PROJECT_RIBBON_VERSION} · Project tab ribbon`;
    const ribbon = document.getElementById("ribbonVersionText");
    const badge = document.getElementById("appVersionBadge");
    const footer = document.getElementById("appVersionFooter");
    if (ribbon) ribbon.textContent = label;
    if (badge) badge.textContent = label;
    if (footer) footer.textContent = `${label} · Build 2026-06-23`;
  }

  function handleProjectRibbonChange(event) {
    const command = event.target?.dataset?.msProjectCommand;
    if (command !== "status-date") return;
    state.statusDate = event.target.value || "";
    if (Array.isArray(state.tasks)) {
      state.tasks.forEach((task) => {
        if (!task.statusDate) task.statusDate = state.statusDate;
      });
    }
    renderSafe();
    toast(state.statusDate ? `Status Date set to ${state.statusDate}.` : "Status Date cleared.");
  }

  function handleProjectRibbonClick(event) {
    const commandEl = event.target.closest("[data-ms-project-command]");
    if (!commandEl || commandEl.tagName === "INPUT") return;
    const command = commandEl.dataset.msProjectCommand;
    switch (command) {
      case "subproject": return subproject();
      case "get-addins": return toast("Get Add-ins placeholder added. Add-in marketplace support comes later.");
      case "my-addins": return toast("No app add-ins are installed yet.");
      case "addins-placeholder": return toast("Add-ins are placeholders for now.");
      case "project-information": return projectInformation();
      case "custom-fields": return toast("Custom Fields are build item 14. This button is now reserved for that module.");
      case "links-between-projects": return toast("Links Between Projects placeholder added. External project linking comes later.");
      case "wbs-view": return showWbs();
      case "wbs-renumber": return renumberWbs();
      case "wbs-code": return toast("WBS code masks come later. Current WBS auto-rolls from outline level.");
      case "change-working-time": return changeWorkingTime();
      case "calculate-project": return calculateProject();
      case "set-baseline": return clickId("setBaselineBtn");
      case "clear-baseline": return clearBaselinePlaceholder();
      case "move-project": return moveProject();
      case "update-project": return updateProject();
      case "spelling": return spellingCheck();
      default: return toast("Project command added.");
    }
  }

  function subproject() {
    const input = document.getElementById("importXmlInput");
    if (input) {
      toast("Choose a Project XML file to insert/import as a subproject-style plan.");
      input.click();
      return;
    }
    toast("Subproject import uses Project XML in this browser build.");
  }

  function projectInformation() {
    const projectName = document.getElementById("projectName")?.value || state.projectName || "New Project";
    const start = document.getElementById("projectStart")?.value || state.projectStart || "not set";
    const taskCount = Array.isArray(state.tasks) ? state.tasks.length : 0;
    toast(`${projectName}: ${taskCount} tasks · Start ${start}. Use Project tab fields for calendar settings.`);
    document.getElementById("projectStart")?.focus();
  }

  function showWbs() {
    const index = getSelectedIndex();
    const task = index == null ? null : state.tasks?.[index];
    if (!task) return toast("Select a task first.");
    const wbs = task.wbs || task.outlineNumber || task.id || index + 1;
    toast(`Selected WBS: ${wbs}`);
  }

  function renumberWbs() {
    if (typeof repairOutlineHierarchy === "function") repairOutlineHierarchy();
    renderSafe();
    toast("WBS/outline hierarchy refreshed.");
  }

  function changeWorkingTime() {
    const workingDays = document.getElementById("workingDaysInput");
    if (workingDays) {
      workingDays.focus();
      toast("Edit Working days and Holidays in the Project ribbon fields.");
      return;
    }
    toast("Working time fields are not visible in this layout.");
  }

  function calculateProject() {
    if (clickId("autoScheduleBtn")) return;
    renderSafe();
    toast("Project recalculated.");
  }

  function clearBaselinePlaceholder() {
    const confirmClear = confirm("Clear saved baseline values from all tasks? This cannot be undone.");
    if (!confirmClear) return;
    (state.tasks || []).forEach((task) => { delete task.baseline; });
    renderSafe();
    toast("Baseline values cleared.");
  }

  function moveProject() {
    if (!Array.isArray(state.tasks) || !state.tasks.length) return toast("No tasks to move.");
    const raw = prompt("Move project by how many working days? Use negative numbers to move earlier.", "1");
    if (raw == null || raw.trim() === "") return;
    const days = Number(raw);
    if (!Number.isFinite(days) || !Number.isInteger(days)) return toast("Enter a whole number of days.");
    state.tasks.forEach((task) => {
      task.start = shiftDateValue(task.start, days);
      task.finish = shiftDateValue(task.finish, days);
      if (task.actualStart) task.actualStart = shiftDateValue(task.actualStart, days);
      if (task.actualFinish) task.actualFinish = shiftDateValue(task.actualFinish, days);
      if (task.deadline) task.deadline = shiftDateValue(task.deadline, days);
    });
    if (state.projectStart) state.projectStart = shiftDateValue(state.projectStart, days);
    const startInput = document.getElementById("projectStart");
    if (startInput && state.projectStart) startInput.value = state.projectStart;
    renderSafe();
    toast(days < 0 ? `Moved project ${Math.abs(days)} day(s) earlier.` : `Moved project ${days} day(s) later.`);
  }

  function updateProject() {
    const statusDate = document.getElementById("msProjectStatusDate")?.value || state.statusDate || "";
    if (statusDate) state.statusDate = statusDate;
    (state.tasks || []).forEach((task) => {
      if (statusDate) task.statusDate = statusDate;
      if (Number(task.percent) >= 100 && !task.actualFinish) task.actualFinish = task.finish || statusDate;
      if (Number(task.percent) > 0 && !task.actualStart) task.actualStart = task.start || statusDate;
    });
    calculateProject();
    toast(statusDate ? `Project updated through ${statusDate}.` : "Project updated.");
  }

  function spellingCheck() {
    const unnamed = (state.tasks || []).filter((task) => !String(task.name || "").trim()).length;
    const doubleSpaces = (state.tasks || []).filter((task) => /\s{2,}/.test(String(task.name || ""))).length;
    if (!unnamed && !doubleSpaces) return toast("Spelling check complete. No obvious task-name issues found.");
    toast(`Spelling check: ${unnamed} blank task name(s), ${doubleSpaces} task name(s) with double spaces.`);
  }

  function syncStatusDateInput() {
    const input = document.getElementById("msProjectStatusDate");
    if (!input) return;
    input.value = state.statusDate || "";
  }

  function shiftDateValue(value, days) {
    if (!value) return value;
    const base = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(base.getTime())) return value;
    base.setDate(base.getDate() + days);
    return base.toISOString().slice(0, 10);
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
    let el = document.getElementById("msProjectToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "msProjectToast";
      el.className = "ms-project-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    clearTimeout(el._hideTimer);
    el.hidden = false;
    el._hideTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }
})();
