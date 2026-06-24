(() => {
  const TASK_RIBBON_VERSION = "v0.31.0";
  const TASK_RIBBON_LABEL = `${TASK_RIBBON_VERSION} · WBS outline tools`;
  let taskClipboard = null;

  function boot() {
    installOutlineRuntimePatch();
    installOutlineStyles();
    const taskPanel = document.querySelector('[data-ribbon-panel="task"]');
    if (!taskPanel) {
      setTimeout(boot, 100);
      return;
    }
    installTaskRibbon(taskPanel);
    patchVersion();
    updateOutlineUi();
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
        <div class="command-group ms-outline-group">
          <div class="ms-command-body">
            <button class="ms-large-button" type="button" data-ms-task-command="outdent" title="Outdent selected task: Ctrl/Cmd+[ or Alt+Shift+Left"><i>←</i>Outdent</button>
            <button class="ms-large-button ms-primary-tile" type="button" data-ms-task-command="indent" title="Indent selected task: Ctrl/Cmd+] or Alt+Shift+Right"><i>→</i>Indent</button>
            <div class="ms-command-stack">
              <button class="ms-icon-button" type="button" data-ms-task-command="toggle-summary-override" title="Allow manual editing of a summary task schedule"><i>Σ</i>Override rollup</button>
              <span class="ms-outline-status" id="msOutlineStatus">WBS auto</span>
            </div>
          </div>
          <span class="group-label">Outline</span>
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

  function installOutlineRuntimePatch() {
    if (window.__wbsOutlineToolsPatched || typeof state === "undefined") return;
    window.__wbsOutlineToolsPatched = true;

    const baseEnsureDecorations = typeof ensureDecorations === "function" ? ensureDecorations : null;
    ensureDecorations = function wbsEnsureDecorations() {
      if (baseEnsureDecorations) baseEnsureDecorations();
      applyWbsAndOutlineNumbers();
    };

    const baseRollupSummaryTasks = typeof rollupSummaryTasks === "function" ? rollupSummaryTasks : null;
    if (baseRollupSummaryTasks) {
      rollupSummaryTasks = function wbsRollupSummaryTasks() {
        const manual = captureManualSummarySchedules();
        baseRollupSummaryTasks();
        restoreManualSummarySchedules(manual);
        applyWbsAndOutlineNumbers();
      };
    }

    const baseRender = typeof render === "function" ? render : null;
    if (baseRender) {
      render = function wbsRender() {
        const result = baseRender();
        updateOutlineUi();
        return result;
      };
    }

    const baseRenderGantt = typeof renderGantt === "function" ? renderGantt : null;
    if (baseRenderGantt) {
      renderGantt = function wbsRenderGantt() {
        const result = baseRenderGantt();
        unlockManualSummaryRows();
        updateOutlineUi();
        return result;
      };
    }

    const baseRefreshTaskInfoPanel = typeof refreshTaskInfoPanel === "function" ? refreshTaskInfoPanel : null;
    if (baseRefreshTaskInfoPanel) {
      refreshTaskInfoPanel = function wbsRefreshTaskInfoPanel(force = false) {
        const result = baseRefreshTaskInfoPanel(force);
        syncTaskInfoSummaryLock();
        return result;
      };
    }

    const baseUpdateTask = typeof updateTask === "function" ? updateTask : null;
    if (baseUpdateTask) {
      updateTask = function wbsUpdateTask(index, field, value) {
        const task = state.tasks?.[index];
        if (task && isSummaryTask(index) && ["start", "finish", "duration", "percent"].includes(field)) {
          if (task.summaryManualOverride !== true) {
            toast("Summary dates, duration, and percent roll up from child tasks. Use Override rollup first if you need a manual summary value.");
            renderSafe();
            return;
          }
          return updateManualSummaryField(index, field, value);
        }
        return baseUpdateTask(index, field, value);
      };
    }

    const baseApplyTaskInfoForm = typeof applyTaskInfoForm === "function" ? applyTaskInfoForm : null;
    if (baseApplyTaskInfoForm) {
      applyTaskInfoForm = function wbsApplyTaskInfoForm() {
        const index = typeof taskInfoIndex === "number" ? taskInfoIndex : null;
        const task = index == null ? null : state.tasks?.[index];
        const manualSummary = task && isSummaryTask(index) && task.summaryManualOverride === true;
        const values = manualSummary ? captureTaskInfoScheduleValues() : null;
        const result = baseApplyTaskInfoForm();
        if (manualSummary) applyManualSummaryValues(index, values);
        return result;
      };
    }

    indentSelectedTask = function wbsIndentSelectedTask() { return moveOutlineLevel(1); };
    outdentSelectedTask = function wbsOutdentSelectedTask() { return moveOutlineLevel(-1); };
  }

  function installOutlineStyles() {
    if (document.getElementById("wbsOutlineToolsStyles")) return;
    const style = document.createElement("style");
    style.id = "wbsOutlineToolsStyles";
    style.textContent = `
      .ms-outline-group .ms-command-body { gap: 6px; }
      .ms-outline-status {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 22px;
        max-width: 150px;
        padding: 2px 8px;
        border-radius: 999px;
        background: #eef6ff;
        border: 1px solid #c7dcf6;
        color: #185a9d;
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
      }
      .planner-row.is-summary-override .planner-fields { box-shadow: inset 3px 0 0 #7c3aed; }
      .summary-rollup-badge.is-overridden { background: #f3e8ff; color: #6d28d9; border-color: #d8b4fe; }
    `;
    document.head.appendChild(style);
  }

  function applyWbsAndOutlineNumbers() {
    if (!Array.isArray(state.tasks)) return;
    const counters = [];
    state.tasks.forEach((task, index) => {
      const previousLevel = index > 0 ? normalizeLevelSafe(state.tasks[index - 1].outlineLevel) : 1;
      let level = normalizeLevelSafe(task.outlineLevel);
      if (index === 0) level = 1;
      level = Math.min(level, previousLevel + 1);
      task.outlineLevel = level;
      counters.length = level;
      for (let i = 0; i < level - 1; i += 1) if (!counters[i]) counters[i] = 1;
      counters[level - 1] = (counters[level - 1] || 0) + 1;
      task.wbs = counters.join(".");
      task.outlineNumber = task.wbs;
      const next = state.tasks[index + 1];
      const hasChildren = Boolean(next && normalizeLevelSafe(next.outlineLevel) > level);
      task.isSummary = hasChildren;
      if (hasChildren) task.expanded = task.expanded !== false;
      else {
        task.expanded = true;
        task.summaryManualOverride = false;
      }
    });
  }

  function captureManualSummarySchedules() {
    const manual = new Map();
    (state.tasks || []).forEach((task) => {
      if (task.summaryManualOverride === true && Number.isInteger(Number(task.uid))) {
        manual.set(Number(task.uid), {
          start: task.start,
          finish: task.finish,
          durationDays: task.durationDays,
          durationMinutes: task.durationMinutes,
          percent: task.percent,
          isMilestone: task.isMilestone,
        });
      }
    });
    return manual;
  }

  function restoreManualSummarySchedules(manual) {
    (state.tasks || []).forEach((task) => {
      if (task.summaryManualOverride !== true || !manual.has(Number(task.uid))) return;
      Object.assign(task, manual.get(Number(task.uid)));
    });
  }

  function getSubtreeIndexesSafe(rootIndex) {
    const root = state.tasks?.[rootIndex];
    if (!root) return [];
    const rootLevel = normalizeLevelSafe(root.outlineLevel);
    const indexes = [rootIndex];
    for (let i = rootIndex + 1; i < state.tasks.length; i += 1) {
      const level = normalizeLevelSafe(state.tasks[i].outlineLevel);
      if (level <= rootLevel) break;
      indexes.push(i);
    }
    return indexes;
  }

  function moveOutlineLevel(delta) {
    const index = getSelectedIndex();
    const task = state.tasks?.[index];
    if (!task) return toast("Select a task first.");
    const currentLevel = normalizeLevelSafe(task.outlineLevel);
    if (delta > 0) {
      if (index <= 0) return toast("The first task cannot be indented.");
      const previousLevel = normalizeLevelSafe(state.tasks[index - 1]?.outlineLevel);
      if (currentLevel >= Math.min(10, previousLevel + 1)) return toast("That task is already at the deepest valid level under the row above.");
      getSubtreeIndexesSafe(index).forEach((i) => { state.tasks[i].outlineLevel = normalizeLevelSafe(state.tasks[i].outlineLevel + 1); });
      state.tasks[index - 1].expanded = true;
    } else {
      if (currentLevel <= 1) return toast("That task is already at outline level 1.");
      getSubtreeIndexesSafe(index).forEach((i) => { state.tasks[i].outlineLevel = normalizeLevelSafe(state.tasks[i].outlineLevel - 1); });
    }
    applyWbsAndOutlineNumbers();
    if (typeof selectTask === "function") selectTask(index);
    renderSafe();
    toast(delta > 0 ? `Indented task ${state.tasks[index].id} to WBS ${state.tasks[index].wbs}.` : `Outdented task ${state.tasks[index].id} to WBS ${state.tasks[index].wbs}.`);
  }

  function toggleSummaryOverride(index) {
    if (!selectedRequired(index)) return;
    const task = state.tasks[index];
    if (!isSummaryTask(index)) return toast("Select a summary task first. A task becomes a summary when another task is indented under it.");
    task.summaryManualOverride = task.summaryManualOverride !== true;
    renderSafe();
    toast(task.summaryManualOverride ? "Summary schedule override is on. You can edit summary Start, Finish, Duration, and %." : "Summary schedule override is off. Values roll up from child tasks again.");
  }

  function unlockManualSummaryRows() {
    (state.tasks || []).forEach((task, index) => {
      const row = document.querySelector(`.planner-row[data-row-index="${index}"]`);
      if (!row) return;
      row.classList.toggle("is-summary-override", isSummaryTask(index) && task.summaryManualOverride === true);
      if (!isSummaryTask(index) || task.summaryManualOverride !== true) return;
      row.querySelectorAll('input[data-field="duration"], input[data-field="start"], input[data-field="finish"], input[data-field="percent"]').forEach((input) => {
        input.removeAttribute("readonly");
        input.removeAttribute("aria-readonly");
        input.title = "Manual summary override is on. Turn off Override rollup to calculate from children again.";
      });
      row.querySelectorAll(".summary-rollup-badge").forEach((badge) => {
        badge.classList.add("is-overridden");
        badge.textContent = "override";
      });
    });
  }

  function syncTaskInfoSummaryLock() {
    const index = typeof taskInfoIndex === "number" ? taskInfoIndex : null;
    const task = index == null ? null : state.tasks?.[index];
    if (!task || !isSummaryTask(index)) return;
    const unlocked = task.summaryManualOverride === true;
    ["tiStart", "tiFinish", "tiDuration", "tiPercent", "tiMilestone"].forEach((id) => {
      const field = document.getElementById(id);
      if (field) field.disabled = !unlocked;
    });
    const notice = document.getElementById("tiRollupNotice");
    if (notice) notice.textContent = unlocked
      ? "Manual summary override is on. This summary task can be edited directly until you turn off Override rollup."
      : "Summary task dates, duration, and percent complete are rollups from children. Edit the child tasks to change those values.";
  }

  function updateManualSummaryField(index, field, value) {
    const task = state.tasks?.[index];
    if (!task) return;
    if (field === "percent") task.percent = normalizePercentSafe(value);
    else if (field === "duration") {
      const minutes = parseDurationInputSafe(value, task.durationMinutes);
      if (typeof setTaskStartKeepDuration === "function") setTaskStartKeepDuration(task, task.start || state.projectStart, minutes);
      else task.durationMinutes = minutes;
    } else if (field === "start") {
      if (typeof setTaskStartKeepDuration === "function") setTaskStartKeepDuration(task, value || state.projectStart, task.durationMinutes);
      else task.start = value;
    } else if (field === "finish") {
      task.finish = value;
      if (typeof workingSpanMinutes === "function") task.durationMinutes = workingSpanMinutes(task.start, task.finish);
    }
    task.durationDays = typeof durationMinutesToWorkingDays === "function" ? durationMinutesToWorkingDays(task.durationMinutes) : task.durationDays;
    task.isMilestone = Number(task.durationMinutes) === 0;
    renderSafe();
  }

  function captureTaskInfoScheduleValues() {
    return {
      start: valueOf("tiStart"),
      finish: valueOf("tiFinish"),
      duration: valueOf("tiDuration"),
      percent: valueOf("tiPercent"),
      milestone: Boolean(document.getElementById("tiMilestone")?.checked),
    };
  }

  function applyManualSummaryValues(index, values) {
    const task = state.tasks?.[index];
    if (!task || !values) return;
    task.summaryManualOverride = true;
    task.percent = normalizePercentSafe(values.percent);
    const minutes = values.milestone ? 0 : parseDurationInputSafe(values.duration, task.durationMinutes);
    if (values.finish && values.finish !== task.finish) {
      task.start = values.start || task.start;
      task.finish = values.finish;
      task.durationMinutes = typeof workingSpanMinutes === "function" ? workingSpanMinutes(task.start, task.finish) : minutes;
    } else if (typeof setTaskStartKeepDuration === "function") {
      setTaskStartKeepDuration(task, values.start || task.start || state.projectStart, minutes);
    } else {
      task.start = values.start || task.start;
      task.durationMinutes = minutes;
    }
    task.durationDays = typeof durationMinutesToWorkingDays === "function" ? durationMinutesToWorkingDays(task.durationMinutes) : task.durationDays;
    task.isMilestone = task.durationMinutes === 0;
    renderSafe();
  }

  function updateOutlineUi() {
    applyWbsAndOutlineNumbers();
    const index = getSelectedIndex();
    const task = state.tasks?.[index];
    const status = document.getElementById("msOutlineStatus");
    if (status) status.textContent = task ? `WBS ${task.wbs || task.outlineNumber || task.id} · L${normalizeLevelSafe(task.outlineLevel)}` : "WBS auto";
    document.querySelectorAll('[data-ms-task-command="outdent"]').forEach((button) => { button.disabled = !task || normalizeLevelSafe(task.outlineLevel) <= 1; });
    document.querySelectorAll('[data-ms-task-command="indent"]').forEach((button) => { button.disabled = !task || index <= 0; });
    document.querySelectorAll('[data-ms-task-command="toggle-summary-override"]').forEach((button) => {
      button.disabled = !task || !isSummaryTask(index);
      button.classList.toggle("is-active", Boolean(task && task.summaryManualOverride === true));
    });
  }

  function isSummaryTask(index) {
    if (typeof isSummaryIndex === "function") return isSummaryIndex(index);
    const task = state.tasks?.[index];
    const next = state.tasks?.[index + 1];
    return Boolean(task && next && normalizeLevelSafe(next.outlineLevel) > normalizeLevelSafe(task.outlineLevel));
  }

  function normalizeLevelSafe(value) {
    if (typeof normalizeLevel === "function") return normalizeLevel(value);
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : 1;
  }

  function patchVersion() {
    const ribbon = document.getElementById("ribbonVersionText");
    const badge = document.getElementById("appVersionBadge");
    const footer = document.getElementById("appVersionFooter");
    if (ribbon) ribbon.textContent = TASK_RIBBON_LABEL;
    if (badge) badge.textContent = TASK_RIBBON_LABEL;
    if (footer) footer.textContent = `${TASK_RIBBON_LABEL} · Build 2026-06-24`;
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
      case "indent": return indentSelectedTask();
      case "outdent": return outdentSelectedTask();
      case "toggle-summary-override": return toggleSummaryOverride(index);
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
    if (!taskClipboard?.task) return toast("Nothing to paste yet.");
    const insertAt = Number.isInteger(index) ? index + 1 : state.tasks.length;
    const pasted = cloneTask(taskClipboard.task);
    pasted.uid = state.nextUid++;
    pasted.id = insertAt + 1;
    pasted.name = `${pasted.name || "Task"} copy`;
    pasted.links = [];
    pasted.predecessors = [];
    pasted.summaryManualOverride = false;
    state.tasks.splice(insertAt, 0, pasted);
    renumberTasks();
    if (typeof selectTask === "function") selectTask(insertAt);
    renderSafe();
    toast("Pasted task copy.");
  }

  function setPercent(index, percent, message = null) {
    if (!selectedRequired(index)) return;
    const task = state.tasks[index];
    if (isSummaryTask(index) && task.summaryManualOverride !== true) return toast("Summary percent rolls up from child tasks. Use Override rollup first if you need a manual value.");
    task.percent = normalizePercentSafe(percent);
    renderSafe();
    toast(message || `Set selected task to ${task.percent}%.`);
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
    if (isSummaryTask(index) && task.summaryManualOverride !== true) return toast("Summary dates roll up from children. Move child tasks, or turn on Override rollup first.");
    if (typeof addDays !== "function" || typeof toDateInputValue !== "function") return toast("Move command needs the date helpers.");
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
      state.tasks[newIndex].expanded = true;
      state.tasks[newIndex].summaryManualOverride = false;
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
    if (index < 0) return toast("No matching task found.");
    if (typeof selectTask === "function") selectTask(index);
    renderSafe();
    setTimeout(() => scrollToSelected(index), 0);
  }

  function clearSelectedTask(index) {
    if (!selectedRequired(index)) return;
    const task = state.tasks[index];
    task.name = "";
    if (!isSummaryTask(index) || task.summaryManualOverride === true) task.percent = 0;
    renderSafe();
    toast("Cleared selected task name and progress.");
  }

  function cloneTask(task) {
    return JSON.parse(JSON.stringify(task || {}));
  }

  function renumberTasks() {
    state.tasks.forEach((task, i) => { task.id = i + 1; });
  }

  function parseDurationInputSafe(text, fallback) {
    return typeof parseDurationInput === "function" ? parseDurationInput(text, fallback) : Math.max(0, Number(fallback) || 0);
  }

  function normalizePercentSafe(value) {
    if (typeof normalizePercent === "function") return normalizePercent(value);
    const n = Number(value);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0;
  }

  function valueOf(id) {
    return document.getElementById(id)?.value || "";
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
