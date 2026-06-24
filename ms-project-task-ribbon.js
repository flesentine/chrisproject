(() => {
  const TASK_RIBBON_VERSION = "v0.27.0";
  let taskClipboard = null;

  function boot() {
    const taskPanel = document.querySelector('[data-ribbon-panel="task"]');
    if (!taskPanel) {
      setTimeout(boot, 100);
      return;
    }
    installTaskRibbon(taskPanel);
    patchVersion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  function installTaskRibbon(taskPanel) {
    if (taskPanel.dataset.msTaskRibbonEnhanced === "1") return;
    taskPanel.dataset.msTaskRibbonEnhanced = "1";
    taskPanel.innerHTML = `
      <div class="ms-task-ribbon" aria-label="Task ribbon commands">
        <div class="command-group ms-view-group">
          <div class="ms-command-body">
            <details class="ms-ribbon-menu">
              <summary class="ms-large-button"><i>▦</i>Gantt Chart ▾</summary>
              <div class="ms-ribbon-popover">
                <button type="button" data-ms-task-command="view-gantt">Gantt Chart</button>
                <button type="button" data-ms-task-command="view-resource">Resource Sheet</button>
              </div>
            </details>
          </div>
          <span class="group-label">View</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <button class="ms-large-button" type="button" data-ms-task-command="paste"><i>📋</i>Paste</button>
            <div class="ms-command-stack">
              <button class="ms-icon-button" type="button" data-ms-task-command="cut"><i>✂</i>Cut</button>
              <button class="ms-icon-button" type="button" data-ms-task-command="copy"><i>⧉</i>Copy</button>
              <button class="ms-icon-button" type="button" data-ms-task-command="format-painter"><i>▣</i>Format Painter</button>
            </div>
          </div>
          <span class="group-label">Clipboard</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <div class="ms-font-grid">
              <select aria-label="Font family" data-ms-task-command="font-family"><option>Calibri</option><option>Arial</option><option>Aptos</option><option>Segoe UI</option></select>
              <select aria-label="Font size" data-ms-task-command="font-size"><option>11</option><option>10</option><option>12</option><option>14</option></select>
              <div class="ms-font-buttons">
                <button type="button" data-ms-task-command="font-bold">B</button>
                <button type="button" data-ms-task-command="font-italic"><em>I</em></button>
                <button type="button" data-ms-task-command="font-underline"><u>U</u></button>
                <button type="button" data-ms-task-command="font-highlight">▰</button>
                <button type="button" data-ms-task-command="font-color">A</button>
              </div>
            </div>
          </div>
          <span class="group-label">Font</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <div class="ms-command-stack">
              <div class="ms-percent-row">
                <button type="button" data-ms-task-command="percent" data-percent="0">0%</button>
                <button type="button" data-ms-task-command="percent" data-percent="25">25%</button>
                <button type="button" data-ms-task-command="percent" data-percent="50">50%</button>
                <button type="button" data-ms-task-command="percent" data-percent="75">75%</button>
                <button type="button" data-ms-task-command="percent" data-percent="100">100%</button>
              </div>
              <button class="ms-icon-button" type="button" data-ms-task-command="mark-on-track"><i>✓</i>Mark on Track</button>
              <button class="ms-icon-button" type="button" data-ms-task-command="respect-links"><i>↔</i>Respect Links</button>
              <button class="ms-icon-button" type="button" data-ms-task-command="inactivate"><i>⊘</i>Inactivate</button>
            </div>
          </div>
          <span class="group-label">Schedule</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <button class="ms-large-button" type="button" data-ms-task-command="manual-schedule"><i>📌</i>Manually<br/>Schedule</button>
            <button class="ms-large-button ms-primary-tile" type="button" data-ms-task-command="auto-schedule"><i>→</i>Auto<br/>Schedule</button>
          </div>
          <span class="group-label">Tasks</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <div class="ms-command-stack">
              <button class="ms-icon-button" type="button" data-ms-task-command="inspect"><i>?</i>Inspect</button>
              <details class="ms-ribbon-menu">
                <summary class="ms-icon-button"><i>↔</i>Move ▾</summary>
                <div class="ms-ribbon-popover">
                  <button type="button" data-ms-task-command="move-earlier">Move 1 day earlier</button>
                  <button type="button" data-ms-task-command="move-later">Move 1 day later</button>
                </div>
              </details>
              <button class="ms-icon-button" type="button" data-ms-task-command="mode"><i>?</i>Mode</button>
            </div>
          </div>
          <span class="group-label">Tasks</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <details class="ms-ribbon-menu">
              <summary class="ms-large-button"><i>＋</i>Task ▾</summary>
              <div class="ms-ribbon-popover">
                <button type="button" data-ms-task-command="insert-task">Task</button>
                <button type="button" data-ms-task-command="insert-summary">Summary</button>
                <button type="button" data-ms-task-command="insert-milestone">Milestone</button>
                <button type="button" data-ms-task-command="insert-deliverable">Deliverable</button>
              </div>
            </details>
            <button class="ms-large-button" type="button" data-ms-task-command="insert-summary"><i>＋</i>Summary</button>
            <button class="ms-large-button" type="button" data-ms-task-command="insert-milestone"><i>◆</i>Milestone</button>
            <button class="ms-large-button ms-muted-command" type="button" data-ms-task-command="insert-deliverable"><i>□</i>Deliverable</button>
          </div>
          <span class="group-label">Insert</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <button class="ms-large-button" type="button" data-ms-task-command="information"><i>▤</i>Information</button>
            <div class="ms-command-stack">
              <button class="ms-icon-button" type="button" data-ms-task-command="notes"><i>🗒</i>Notes</button>
              <button class="ms-icon-button" type="button" data-ms-task-command="details"><i>▥</i>Details</button>
              <button class="ms-icon-button" type="button" data-ms-task-command="timeline"><i>＋</i>Add to Timeline</button>
            </div>
          </div>
          <span class="group-label">Properties</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <button class="ms-large-button" type="button" data-ms-task-command="scroll-to-task"><i>⇥</i>Scroll<br/>to Task</button>
            <div class="ms-command-stack">
              <button class="ms-icon-button" type="button" data-ms-task-command="find"><i>⌕</i>Find</button>
              <button class="ms-icon-button" type="button" data-ms-task-command="clear"><i>⌫</i>Clear</button>
              <button class="ms-icon-button" type="button" data-ms-task-command="fill"><i>▾</i>Fill</button>
            </div>
          </div>
          <span class="group-label">Editing</span>
        </div>
      </div>`;
    taskPanel.addEventListener("click", handleTaskRibbonClick);
    taskPanel.addEventListener("change", handleTaskRibbonChange);
  }

  function patchVersion() {
    const label = `${TASK_RIBBON_VERSION} · full Task ribbon`;
    const ribbon = document.getElementById("ribbonVersionText");
    const badge = document.getElementById("appVersionBadge");
    const footer = document.getElementById("appVersionFooter");
    if (ribbon) ribbon.textContent = label;
    if (badge) badge.textContent = label;
    if (footer) footer.textContent = `${label} · Build 2026-06-23`;
  }

  function handleTaskRibbonChange(event) {
    const command = event.target?.dataset?.msTaskCommand;
    if (!command) return;
    toast(`${event.target.value} selected. Row-level font rendering is not a real Project feature yet.`);
  }

  function handleTaskRibbonClick(event) {
    const commandEl = event.target.closest("[data-ms-task-command]");
    if (!commandEl || commandEl.tagName === "SELECT") return;
    const command = commandEl.dataset.msTaskCommand;
    const index = getSelectedIndex();
    const task = index == null ? null : state.tasks[index];

    switch (command) {
      case "view-gantt": return clickId("scheduleViewBtn") || toast("Already in Gantt Chart view.");
      case "view-resource": return clickId("resourceViewBtn");
      case "copy": return copyTask(index);
      case "cut": return cutTask(index);
      case "paste": return pasteTask(index);
      case "format-painter": return toast("Format Painter placeholder added. Bar style formatting comes later.");
      case "percent": return setPercent(index, Number(commandEl.dataset.percent));
      case "mark-on-track": return setPercent(index, 100, "Marked selected task on track.");
      case "respect-links": return clickId("autoScheduleBtn");
      case "inactivate": return inactivateTask(index);
      case "manual-schedule": return setScheduleMode(index, "manual");
      case "auto-schedule": return setScheduleMode(index, "auto", true);
      case "inspect":
      case "information": return clickId("taskInfoBtn");
      case "move-earlier": return moveTask(index, -1);
      case "move-later": return moveTask(index, 1);
      case "mode": return toggleMode(index);
      case "insert-task": return clickId("addTaskBtn");
      case "insert-summary": return insertSummary(index);
      case "insert-milestone": return insertMilestone(index);
      case "insert-deliverable": return toast("Deliverables are shown as task metadata later. Use Milestone for now.");
      case "notes": return openTaskInfoTab("notes");
      case "details": return openTaskInfoTab("advanced");
      case "timeline": return toast("Add to Timeline placeholder added. Timeline rendering comes later.");
      case "scroll-to-task": return scrollToSelected(index);
      case "find": return findTask();
      case "clear": return clearSelectedTask(index);
      case "fill": return toast("Fill Down placeholder added. Multi-select fill comes later.");
      case "font-bold":
      case "font-italic":
      case "font-underline":
      case "font-highlight":
      case "font-color": return toast("Font command captured. Per-row font styling comes later.");
      default: return toast("Command added.");
    }
  }

  function getSelectedIndex() {
    if (typeof getSelectedTaskIndex === "function") return getSelectedTaskIndex();
    return Number.isInteger(window.selectedTaskIndex) ? window.selectedTaskIndex : 0;
  }

  function selectedRequired(index) {
    if (index == null || !state.tasks?.[index]) {
      toast("Select a task first.");
      return false;
    }
    return true;
  }

  function clickId(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    el.click();
    return true;
  }

  function copyTask(index) {
    if (!selectedRequired(index)) return;
    taskClipboard = { mode: "copy", task: cloneTask(state.tasks[index]) };
    toast(`Copied task ${state.tasks[index].id}.`);
  }

  function cutTask(index) {
    if (!selectedRequired(index)) return;
    taskClipboard = { mode: "cut", index, task: cloneTask(state.tasks[index]) };
    toast(`Cut task ${state.tasks[index].id}. Paste to duplicate, then remove the original manually if needed.`);
  }

  function pasteTask(index) {
    if (!taskClipboard?.task) {
      toast("Nothing to paste yet.");
      return;
    }
    const insertAt = Number.isInteger(index) ? index + 1 : state.tasks.length;
    const pasted = cloneTask(taskClipboard.task);
    pasted.uid = state.nextUid++;
    pasted.id = insertAt + 1;
    pasted.name = `${pasted.name || "Task"} copy`;
    pasted.links = [];
    pasted.predecessors = [];
    state.tasks.splice(insertAt, 0, pasted);
    renumberTasks();
    if (typeof selectTask === "function") selectTask(insertAt);
    renderSafe();
    toast("Pasted task copy.");
  }

  function setPercent(index, percent, message = null) {
    if (!selectedRequired(index)) return;
    state.tasks[index].percent = Math.min(100, Math.max(0, Math.round(percent)));
    renderSafe();
    toast(message || `Set selected task to ${state.tasks[index].percent}%.`);
  }

  function inactivateTask(index) {
    if (!selectedRequired(index)) return;
    const task = state.tasks[index];
    task.inactive = !task.inactive;
    task.notes = `${task.notes || ""}${task.notes ? "\n" : ""}${task.inactive ? "Inactive" : "Reactivated"} from Task ribbon.`;
    renderSafe();
    toast(task.inactive ? "Task marked inactive." : "Task reactivated.");
  }

  function setScheduleMode(index, mode, autoRun = false) {
    if (!selectedRequired(index)) return;
    state.tasks[index].scheduleMode = mode;
    if (autoRun) clickId("autoScheduleBtn");
    else renderSafe();
    toast(mode === "auto" ? "Task set to Auto Scheduled." : "Task set to Manually Scheduled.");
  }

  function toggleMode(index) {
    if (!selectedRequired(index)) return;
    const current = state.tasks[index].scheduleMode === "manual" ? "auto" : "manual";
    setScheduleMode(index, current, current === "auto");
  }

  function moveTask(index, days) {
    if (!selectedRequired(index)) return;
    const task = state.tasks[index];
    if (typeof addDays !== "function" || typeof toDateInputValue !== "function") {
      toast("Move command needs the date helpers.");
      return;
    }
    task.start = toDateInputValue(addDays(task.start, days));
    task.finish = toDateInputValue(addDays(task.finish, days));
    renderSafe();
    toast(days < 0 ? "Moved task earlier." : "Moved task later.");
  }

  function insertSummary(index) {
    const beforeCount = state.tasks.length;
    clickId("addTaskBtn");
    const newIndex = state.tasks.length > beforeCount ? state.tasks.length - 1 : getSelectedIndex();
    if (state.tasks[newIndex]) {
      state.tasks[newIndex].name = "New summary task";
      state.tasks[newIndex].outlineLevel = Math.max(1, Number(state.tasks[index]?.outlineLevel || 1));
    }
    renderSafe();
    toast("Inserted summary placeholder. Indent child tasks under it to create the rollup.");
  }

  function insertMilestone(index) {
    const beforeCount = state.tasks.length;
    clickId("addTaskBtn");
    const newIndex = state.tasks.length > beforeCount ? state.tasks.length - 1 : getSelectedIndex();
    if (state.tasks[newIndex]) {
      state.tasks[newIndex].name = "New milestone";
      state.tasks[newIndex].durationDays = 0;
      state.tasks[newIndex].durationMinutes = 0;
      state.tasks[newIndex].isMilestone = true;
      state.tasks[newIndex].finish = state.tasks[newIndex].start;
    }
    renderSafe();
    toast("Inserted milestone.");
  }

  function openTaskInfoTab(tab) {
    clickId("taskInfoBtn");
    setTimeout(() => {
      if (typeof setTaskInfoTab === "function") setTaskInfoTab(tab);
      else document.querySelector(`[data-task-info-tab="${tab}"]`)?.click();
    }, 0);
  }

  function scrollToSelected(index) {
    if (!selectedRequired(index)) return;
    const row = document.querySelector(`[data-row-index="${index}"]`);
    row?.scrollIntoView({ block: "center", inline: "nearest" });
    toast("Scrolled to selected task.");
  }

  function findTask() {
    const query = prompt("Find task name:");
    if (!query) return;
    const index = state.tasks.findIndex((task) => String(task.name || "").toLowerCase().includes(query.toLowerCase()));
    if (index < 0) {
      toast("No matching task found.");
      return;
    }
    if (typeof selectTask === "function") selectTask(index);
    renderSafe();
    setTimeout(() => scrollToSelected(index), 0);
  }

  function clearSelectedTask(index) {
    if (!selectedRequired(index)) return;
    const task = state.tasks[index];
    task.name = "";
    task.percent = 0;
    renderSafe();
    toast("Cleared selected task name and progress.");
  }

  function cloneTask(task) {
    return JSON.parse(JSON.stringify(task || {}));
  }

  function renumberTasks() {
    state.tasks.forEach((task, i) => { task.id = i + 1; });
  }

  function renderSafe() {
    if (typeof render === "function") render();
  }

  function toast(message) {
    let el = document.getElementById("msTaskToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "msTaskToast";
      el.className = "ms-task-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    clearTimeout(el._hideTimer);
    el.hidden = false;
    el._hideTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }
})();
