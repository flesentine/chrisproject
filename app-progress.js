(() => {
  const PROGRESS_VERSION = "v0.23.0";
  const PROGRESS_VERSION_NAME = "Progress + actuals";
  const PROGRESS_BUILD_DATE = "2026-06-23";
  const PROGRESS_TAB = "progress";

  function bootProgressModule() {
    if (typeof state === "undefined" || typeof render !== "function") {
      console.warn("Progress module could not find the planner runtime.");
      return;
    }

    injectProgressStyles();
    installProjectStatusDateControl();
    installProgressTaskInfoUi();
    patchPlannerRuntime();
    restoreProgressStateFromStorage();
    ensureProgressForAll();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootProgressModule, { once: true });
  } else {
    bootProgressModule();
  }

  function injectProgressStyles() {
    if (document.getElementById("progressActualsStyles")) return;
    const style = document.createElement("style");
    style.id = "progressActualsStyles";
    style.textContent = `
      .progress-ribbon-field input { min-width: 150px; }
      .progress-info-page .task-info-grid { align-items: start; }
      .progress-info-page input[readonly],
      .progress-info-page input:disabled { background: #eef3f8; color: #5b6677; }
      .progress-summary-pill {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        max-width: 100%;
        color: #0f5132;
        background: #e8f5ee;
        border: 1px solid rgba(16, 124, 65, 0.18);
        border-radius: 999px;
        padding: 5px 9px;
        font-size: 12px;
        font-weight: 750;
      }
      .progress-summary-pill.is-behind {
        color: #92400e;
        background: #fff7ed;
        border-color: rgba(180, 83, 9, 0.28);
      }
      .progress-summary-pill.is-early {
        color: #075985;
        background: #e0f2fe;
        border-color: rgba(14, 165, 233, 0.24);
      }
      .progress-quick-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .progress-quick-actions button {
        min-height: 32px;
        padding: 6px 9px;
        font-size: 12px;
      }
      .progress-inline-chip {
        display: inline-flex;
        justify-content: center;
        align-items: center;
        min-height: 18px;
        border-radius: 999px;
        color: #344054;
        background: #eef2f7;
        border: 1px solid #d9e2ee;
        font-size: 10px;
        font-weight: 800;
        line-height: 1;
      }
      .planner-row.is-in-progress .gantt-bar {
        box-shadow: 0 12px 24px rgba(37, 99, 235, 0.20), 0 0 0 1px rgba(255,255,255,0.48) inset;
      }
      .planner-row.is-behind-baseline .planner-fields {
        box-shadow: inset 3px 0 0 #f59e0b;
      }
      .planner-row.is-early-baseline .planner-fields {
        box-shadow: inset 3px 0 0 #0ea5e9;
      }
      .gantt-bar .gantt-progress-label {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        z-index: 3;
        color: #ffffff;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.01em;
        text-shadow: 0 1px 2px rgba(0,0,0,0.38);
        pointer-events: none;
      }
      .gantt-bar .gantt-remaining-label {
        position: absolute;
        left: 10px;
        bottom: -15px;
        z-index: 3;
        color: #475467;
        background: rgba(255,255,255,0.94);
        border: 1px solid #d9e2ee;
        border-radius: 999px;
        padding: 1px 6px;
        font-size: 9px;
        font-weight: 800;
        white-space: nowrap;
        pointer-events: none;
      }
      .gantt-bar.is-behind-baseline {
        outline: 2px solid rgba(245, 158, 11, 0.72);
        outline-offset: 2px;
      }
      .gantt-bar.is-early-baseline {
        outline: 2px solid rgba(14, 165, 233, 0.55);
        outline-offset: 2px;
      }
      .indicator-dot.is-progress { background: #e8f5ee; color: #107c41; }
      .indicator-dot.is-progress-warning { background: #fff7ed; color: #b45309; }
      .indicator-dot.is-progress-early { background: #e0f2fe; color: #0369a1; }
    `;
    document.head.appendChild(style);
  }

  function installProjectStatusDateControl() {
    if (document.getElementById("statusDateInput")) {
      els.statusDateInput = document.getElementById("statusDateInput");
      return;
    }
    const projectStartInput = document.getElementById("projectStart");
    const projectStartLabel = projectStartInput?.closest("label");
    if (!projectStartLabel) return;
    const label = document.createElement("label");
    label.className = "ribbon-field progress-ribbon-field";
    label.innerHTML = `Status date<input id="statusDateInput" type="date"/>`;
    projectStartLabel.insertAdjacentElement("afterend", label);
    els.statusDateInput = label.querySelector("input");
    els.statusDateInput.addEventListener("change", () => {
      state.statusDate = normalizeDateValue(els.statusDateInput.value) || today;
      state.tasks.forEach((task) => {
        if (!task.statusDate) task.statusDate = state.statusDate;
      });
      render();
    });
  }

  function installProgressTaskInfoUi() {
    if (document.querySelector(`[data-task-info-tab="${PROGRESS_TAB}"]`)) {
      bindProgressTaskInfoEls();
      return;
    }
    const tabs = document.querySelector(".task-info-tabs");
    const generalTab = document.querySelector('[data-task-info-tab="general"]');
    const generalPage = document.querySelector('[data-task-info-page="general"]');
    if (!tabs || !generalPage) return;

    const tabButton = document.createElement("button");
    tabButton.className = "task-info-tab";
    tabButton.dataset.taskInfoTab = PROGRESS_TAB;
    tabButton.type = "button";
    tabButton.textContent = "Progress";
    (generalTab || tabs.lastElementChild)?.insertAdjacentElement("afterend", tabButton);

    const page = document.createElement("fieldset");
    page.className = "task-info-page progress-info-page";
    page.dataset.taskInfoPage = PROGRESS_TAB;
    page.innerHTML = `
      <legend>Progress / actuals</legend>
      <div class="assignment-summary-bar">
        <span id="tiProgressSummary" class="progress-summary-pill">No progress recorded.</span>
        <span class="progress-quick-actions">
          <button class="primary small-primary" data-progress-action="start" id="tiSetActualStartBtn" type="button">Start today</button>
          <button class="small-primary" data-progress-action="complete" id="tiMarkCompleteBtn" type="button">Mark complete</button>
        </span>
      </div>
      <div class="task-info-grid">
        <label>
          Actual Start
          <input id="tiActualStart" type="date"/>
        </label>
        <label>
          Actual Finish
          <input id="tiActualFinish" type="date"/>
        </label>
        <label>
          Actual Duration
          <input id="tiActualDuration" placeholder="0d, 4h, 3d" type="text"/>
        </label>
        <label>
          Remaining Duration
          <input id="tiRemainingDuration" placeholder="0d, 4h, 3d" type="text"/>
        </label>
        <label>
          % Complete
          <input id="tiProgressPercent" max="100" min="0" type="number"/>
        </label>
        <label>
          % Work Complete
          <input id="tiPercentWorkComplete" max="100" min="0" type="number"/>
        </label>
        <label>
          Status Date
          <input id="tiStatusDate" type="date"/>
        </label>
      </div>
      <p class="task-info-help">Actual fields track what happened, remaining duration tracks what is left, and baseline warnings show whether the current plan is ahead or behind the approved baseline.</p>
    `;
    generalPage.insertAdjacentElement("afterend", page);
    bindProgressTaskInfoEls();

    page.addEventListener("click", (event) => {
      const button = event.target.closest("[data-progress-action]");
      if (!button) return;
      const task = state.tasks[taskInfoIndex];
      if (!task || isSummaryIndex(taskInfoIndex)) return;
      if (button.dataset.progressAction === "start") {
        const statusDate = normalizeDateValue(state.statusDate) || today;
        task.actualStart = task.actualStart || statusDate;
        task.statusDate = statusDate;
        if (normalizePercent(task.percent) === 0) task.percent = 1;
      }
      if (button.dataset.progressAction === "complete") {
        const statusDate = normalizeDateValue(state.statusDate) || normalizeDateValue(task.finish) || today;
        task.actualStart = task.actualStart || normalizeDateValue(task.start) || statusDate;
        task.actualFinish = statusDate;
        task.statusDate = statusDate;
        task.percent = 100;
        task.percentWorkComplete = 100;
        task.remainingDurationMinutes = 0;
        task.remainingDurationManual = true;
      }
      normalizeTaskProgress(task, taskInfoIndex, { preserveManualRemaining: true });
      refreshTaskInfoPanel(true);
      render();
    });
  }

  function bindProgressTaskInfoEls() {
    Object.assign(els, {
      statusDateInput: document.getElementById("statusDateInput"),
      tiProgressSummary: document.getElementById("tiProgressSummary"),
      tiActualStart: document.getElementById("tiActualStart"),
      tiActualFinish: document.getElementById("tiActualFinish"),
      tiActualDuration: document.getElementById("tiActualDuration"),
      tiRemainingDuration: document.getElementById("tiRemainingDuration"),
      tiProgressPercent: document.getElementById("tiProgressPercent"),
      tiPercentWorkComplete: document.getElementById("tiPercentWorkComplete"),
      tiStatusDate: document.getElementById("tiStatusDate"),
      tiSetActualStartBtn: document.getElementById("tiSetActualStartBtn"),
      tiMarkCompleteBtn: document.getElementById("tiMarkCompleteBtn"),
    });
  }

  function patchPlannerRuntime() {
    if (window.__progressActualsPatched) return;
    window.__progressActualsPatched = true;

    const baseEnsureDecorations = ensureDecorations;
    ensureDecorations = function patchedEnsureDecorations() {
      baseEnsureDecorations();
      ensureProgressForAll();
    };

    const baseRollupSummaryTasks = rollupSummaryTasks;
    rollupSummaryTasks = function patchedRollupSummaryTasks() {
      baseRollupSummaryTasks();
      rollupProgressSummaryTasks();
    };

    const baseSetTaskInfoTab = setTaskInfoTab;
    setTaskInfoTab = function patchedSetTaskInfoTab(tab = "general") {
      if (tab !== PROGRESS_TAB) {
        baseSetTaskInfoTab(tab);
        return;
      }
      taskInfoActiveTab = PROGRESS_TAB;
      els.taskInfoModal?.querySelectorAll("[data-task-info-tab]").forEach((button) => {
        const active = button.dataset.taskInfoTab === PROGRESS_TAB;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
      });
      els.taskInfoModal?.querySelectorAll("[data-task-info-page]").forEach((page) => {
        page.classList.toggle("is-active", page.dataset.taskInfoPage === PROGRESS_TAB);
      });
    };

    const baseRefreshTaskInfoPanel = refreshTaskInfoPanel;
    refreshTaskInfoPanel = function patchedRefreshTaskInfoPanel(force = false) {
      baseRefreshTaskInfoPanel(force);
      refreshProgressTaskInfoPanel(force);
    };

    const baseApplyTaskInfoForm = applyTaskInfoForm;
    applyTaskInfoForm = function patchedApplyTaskInfoForm() {
      applyProgressTaskInfoForm();
      baseApplyTaskInfoForm();
    };

    const baseRenderTaskIndicators = renderTaskIndicators;
    renderTaskIndicators = function patchedRenderTaskIndicators(task, index, context = {}) {
      const original = baseRenderTaskIndicators(task, index, context);
      const chips = [];
      const progress = getProgressSnapshot(task);
      const baselineStatus = getBaselineTimingStatus(task);
      if (progress.percent > 0 && progress.percent < 100) {
        chips.push({ label: "◐", className: "is-progress", title: `${progress.percent}% complete · ${formatDuration(progress.remainingDurationMinutes)} remaining.` });
      }
      if (baselineStatus?.kind === "behind") {
        chips.push({ label: "L", className: "is-progress-warning", title: baselineStatus.title });
      } else if (baselineStatus?.kind === "early") {
        chips.push({ label: "E", className: "is-progress-early", title: baselineStatus.title });
      }
      if (!chips.length) return original;
      const markup = chips.map((chip) => `<span class="indicator-dot ${chip.className}" title="${escapeXml(chip.title)}">${escapeXml(chip.label)}</span>`).join("");
      return original.replace("</button>", `${markup}</button>`);
    };

    const baseBuildProjectXml = buildProjectXml;
    buildProjectXml = function patchedBuildProjectXml() {
      ensureProgressForAll();
      const xmlText = baseBuildProjectXml();
      return addActualFieldsToProjectXml(xmlText);
    };

    const baseImportProjectXml = importProjectXml;
    importProjectXml = function patchedImportProjectXml(text) {
      const actualPayload = readActualFieldsFromProjectXml(text);
      baseImportProjectXml(text);
      state.statusDate = actualPayload.statusDate || state.statusDate || today;
      state.tasks.forEach((task) => {
        const actual = actualPayload.byId.get(Number(task.id));
        if (actual) Object.assign(task, actual);
      });
      ensureProgressForAll();
      render();
    };

    const baseUpdateTaskAssignment = updateTaskAssignment;
    updateTaskAssignment = function patchedUpdateTaskAssignment(taskIndex, assignmentIndex, field, value) {
      baseUpdateTaskAssignment(taskIndex, assignmentIndex, field, value);
      const task = state.tasks[taskIndex];
      if (task) {
        normalizeTaskProgress(task, taskIndex, { preserveManualRemaining: true });
        refreshProgressTaskInfoPanel(true);
        decorateProgressRows();
        save();
      }
    };

    exportCsv = exportActualsCsv;

    const baseRender = render;
    render = function patchedRender() {
      baseRender();
      updateProgressVersionLabels();
      refreshProjectStatusControl();
      decorateProgressRows();
    };
  }

  function restoreProgressStateFromStorage() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (parsed.statusDate) state.statusDate = normalizeDateValue(parsed.statusDate) || state.statusDate;
    } catch {
      // Older saved projects simply did not have progress status metadata yet.
    }
  }

  function ensureProgressForAll() {
    state.statusDate = normalizeDateValue(state.statusDate) || today;
    if (!Array.isArray(state.tasks)) return;
    state.tasks.forEach((task, index) => normalizeTaskProgress(task, index));
  }

  function normalizeTaskProgress(task, index = 0, options = {}) {
    if (!task) return task;
    const durationMinutes = normalizeDurationMinutes(task.durationMinutes, workingSpanMinutes(task.start, task.finish));
    const percent = normalizePercent(task.percent);
    const assignmentSummary = summarizeTaskAssignments(task);
    const hasAssignments = assignmentSummary.totalWork > 0;
    const importedRemaining = durationToMinutesLike(task.remainingDurationMinutes ?? task.remainingDuration, NaN);
    const importedActual = durationToMinutesLike(task.actualDurationMinutes ?? task.actualDuration, NaN);
    const autoRemaining = Math.max(0, Math.round(durationMinutes * (100 - percent) / 100));
    const manualRemaining = task.remainingDurationManual === true && Number.isFinite(Number(task.remainingDurationMinutes));
    let remainingDurationMinutes = manualRemaining || options.preserveManualRemaining
      ? normalizeDurationMinutes(task.remainingDurationMinutes, autoRemaining)
      : Number.isFinite(importedRemaining)
        ? normalizeDurationMinutes(importedRemaining, autoRemaining)
        : autoRemaining;

    let actualStart = normalizeDateValue(task.actualStart ?? task.ActualStart);
    let actualFinish = normalizeDateValue(task.actualFinish ?? task.ActualFinish);
    if (!actualStart && percent > 0) actualStart = normalizeDateValue(task.start);
    if (actualFinish && percent < 100) task.percent = 100;
    if (!actualFinish && normalizePercent(task.percent) >= 100) actualFinish = normalizeDateValue(task.finish);
    if (normalizePercent(task.percent) >= 100) remainingDurationMinutes = 0;

    let actualDurationMinutes = Number.isFinite(importedActual) ? normalizeDurationMinutes(importedActual, 0) : Math.max(0, durationMinutes - remainingDurationMinutes);
    if (actualStart && actualFinish) actualDurationMinutes = workingSpanMinutes(actualStart, actualFinish);
    actualDurationMinutes = Math.min(durationMinutes || actualDurationMinutes, actualDurationMinutes);

    const workPercent = normalizePercent(
      task.percentWorkComplete ?? task.workPercentComplete ?? task.percent_work_complete ??
      (hasAssignments ? Math.round((assignmentSummary.actualWork / assignmentSummary.totalWork) * 100) : task.percent)
    );

    task.actualStart = actualStart;
    task.actualFinish = actualFinish;
    task.actualDurationMinutes = normalizeDurationMinutes(actualDurationMinutes, 0);
    task.remainingDurationMinutes = normalizeDurationMinutes(remainingDurationMinutes, 0);
    task.percent = normalizePercent(task.percent);
    task.percentWorkComplete = workPercent;
    task.statusDate = normalizeDateValue(task.statusDate) || state.statusDate;
    return task;
  }

  function rollupProgressSummaryTasks() {
    for (let i = state.tasks.length - 1; i >= 0; i -= 1) {
      const task = state.tasks[i];
      if (!task || !isSummaryIndex(i)) continue;
      const leaves = getRollupLeafTasks(i);
      const pool = leaves.length ? leaves : getDirectChildIndexes(i).map((childIndex) => state.tasks[childIndex]).filter(Boolean);
      if (!pool.length) continue;
      const actualStarts = pool.map((child) => dateOnly(child.actualStart)).filter(Boolean);
      const actualFinishes = pool.map((child) => dateOnly(child.actualFinish)).filter(Boolean);
      task.actualStart = actualStarts.length ? toDateInputValue(new Date(Math.min(...actualStarts.map(Number)))) : "";
      task.actualFinish = actualFinishes.length && pool.every((child) => normalizePercent(child.percent) >= 100)
        ? toDateInputValue(new Date(Math.max(...actualFinishes.map(Number))))
        : "";
      task.actualDurationMinutes = pool.reduce((sum, child) => sum + normalizeDurationMinutes(child.actualDurationMinutes, 0), 0);
      task.remainingDurationMinutes = pool.reduce((sum, child) => sum + normalizeDurationMinutes(child.remainingDurationMinutes, 0), 0);
      const workTotal = pool.reduce((sum, child) => sum + Math.max(1, summarizeTaskAssignments(child).totalWork || normalizeDurationMinutes(child.durationMinutes, 0)), 0);
      const weightedWork = pool.reduce((sum, child) => {
        const weight = Math.max(1, summarizeTaskAssignments(child).totalWork || normalizeDurationMinutes(child.durationMinutes, 0));
        return sum + normalizePercent(child.percentWorkComplete ?? child.percent) * weight;
      }, 0);
      task.percentWorkComplete = workTotal ? Math.round(weightedWork / workTotal) : normalizePercent(task.percent);
      task.statusDate = state.statusDate;
    }
  }

  function getProgressSnapshot(task) {
    normalizeTaskProgress(task);
    return {
      percent: normalizePercent(task.percent),
      workPercent: normalizePercent(task.percentWorkComplete ?? task.percent),
      actualStart: normalizeDateValue(task.actualStart),
      actualFinish: normalizeDateValue(task.actualFinish),
      actualDurationMinutes: normalizeDurationMinutes(task.actualDurationMinutes, 0),
      remainingDurationMinutes: normalizeDurationMinutes(task.remainingDurationMinutes, 0),
      statusDate: normalizeDateValue(task.statusDate) || state.statusDate,
    };
  }

  function getBaselineTimingStatus(task) {
    if (!task || !hasBaseline(task)) return null;
    const baseline = normalizeBaseline(task.baseline, task);
    const startDelta = dayDelta(baseline.start, task.start);
    const finishDelta = dayDelta(baseline.finish, task.finish);
    if (startDelta > 0 || finishDelta > 0) {
      return {
        kind: "behind",
        startDelta,
        finishDelta,
        title: `Behind baseline: start ${formatSignedDays(startDelta)}, finish ${formatSignedDays(finishDelta)}.`,
      };
    }
    if (startDelta < 0 || finishDelta < 0) {
      return {
        kind: "early",
        startDelta,
        finishDelta,
        title: `Ahead of baseline: start ${formatSignedDays(startDelta)}, finish ${formatSignedDays(finishDelta)}.`,
      };
    }
    return { kind: "on", startDelta: 0, finishDelta: 0, title: "On baseline." };
  }

  function dayDelta(base, current) {
    const b = dateOnly(base);
    const c = dateOnly(current);
    if (!b || !c) return 0;
    return Math.round((c - b) / 86400000);
  }

  function formatSignedDays(days) {
    const n = Number(days) || 0;
    if (!n) return "0d";
    return `${n > 0 ? "+" : ""}${n}d`;
  }

  function durationToMinutesLike(value, fallback = 0) {
    if (value === undefined || value === null || value === "") return fallback;
    if (Number.isFinite(Number(value))) return normalizeDurationMinutes(value, fallback);
    return parseDurationInput(value, fallback);
  }

  function refreshProjectStatusControl() {
    if (!els.statusDateInput) return;
    els.statusDateInput.value = normalizeDateValue(state.statusDate) || today;
  }

  function refreshProgressTaskInfoPanel(force = false) {
    if (!els.taskInfoModal || (els.taskInfoModal.hidden && !force)) return;
    if (!Number.isInteger(taskInfoIndex) || taskInfoIndex < 0 || taskInfoIndex >= state.tasks.length) return;
    const task = state.tasks[taskInfoIndex];
    const isSummary = isSummaryIndex(taskInfoIndex);
    const progress = getProgressSnapshot(task);
    const baselineStatus = getBaselineTimingStatus(task);

    if (els.tiProgressSummary) {
      els.tiProgressSummary.classList.toggle("is-behind", baselineStatus?.kind === "behind");
      els.tiProgressSummary.classList.toggle("is-early", baselineStatus?.kind === "early");
      const baselineText = baselineStatus?.kind === "behind"
        ? ` · behind baseline (${formatSignedDays(baselineStatus.finishDelta)} finish)`
        : baselineStatus?.kind === "early"
          ? ` · ahead of baseline (${formatSignedDays(baselineStatus.finishDelta)} finish)`
          : hasBaseline(task) ? " · on baseline" : "";
      els.tiProgressSummary.textContent = `${progress.percent}% complete · ${formatDuration(progress.remainingDurationMinutes)} remaining${baselineText}`;
    }
    if (els.tiActualStart) els.tiActualStart.value = progress.actualStart;
    if (els.tiActualFinish) els.tiActualFinish.value = progress.actualFinish;
    if (els.tiActualDuration) els.tiActualDuration.value = formatDuration(progress.actualDurationMinutes);
    if (els.tiRemainingDuration) els.tiRemainingDuration.value = formatDuration(progress.remainingDurationMinutes);
    if (els.tiProgressPercent) els.tiProgressPercent.value = progress.percent;
    if (els.tiPercentWorkComplete) els.tiPercentWorkComplete.value = progress.workPercent;
    if (els.tiStatusDate) els.tiStatusDate.value = progress.statusDate;

    [els.tiActualStart, els.tiActualFinish, els.tiActualDuration, els.tiRemainingDuration, els.tiProgressPercent, els.tiPercentWorkComplete, els.tiStatusDate, els.tiSetActualStartBtn, els.tiMarkCompleteBtn].forEach((field) => {
      if (field) field.disabled = isSummary;
    });
  }

  function applyProgressTaskInfoForm() {
    if (!Number.isInteger(taskInfoIndex) || taskInfoIndex < 0 || taskInfoIndex >= state.tasks.length) return;
    const task = state.tasks[taskInfoIndex];
    if (!task || isSummaryIndex(taskInfoIndex)) return;
    const percent = normalizePercent(els.tiProgressPercent?.value ?? task.percent);
    task.actualStart = normalizeDateValue(els.tiActualStart?.value);
    task.actualFinish = normalizeDateValue(els.tiActualFinish?.value);
    task.actualDurationMinutes = parseDurationInput(els.tiActualDuration?.value || "0d", task.actualDurationMinutes || 0);
    task.remainingDurationMinutes = parseDurationInput(els.tiRemainingDuration?.value || "0d", task.remainingDurationMinutes || Math.max(0, task.durationMinutes - task.actualDurationMinutes));
    task.remainingDurationManual = true;
    task.percent = percent;
    task.percentWorkComplete = normalizePercent(els.tiPercentWorkComplete?.value ?? task.percentWorkComplete ?? percent);
    task.statusDate = normalizeDateValue(els.tiStatusDate?.value) || state.statusDate || today;
    if (els.tiPercent) els.tiPercent.value = task.percent;
    normalizeTaskProgress(task, taskInfoIndex, { preserveManualRemaining: true });
  }

  function decorateProgressRows() {
    const rows = document.querySelectorAll(".planner-row[data-row-index]");
    rows.forEach((row) => {
      const index = Number(row.dataset.rowIndex);
      const task = state.tasks[index];
      if (!task) return;
      const progress = getProgressSnapshot(task);
      const baselineStatus = getBaselineTimingStatus(task);
      row.classList.toggle("is-in-progress", progress.percent > 0 && progress.percent < 100);
      row.classList.toggle("is-behind-baseline", baselineStatus?.kind === "behind");
      row.classList.toggle("is-early-baseline", baselineStatus?.kind === "early");

      const percentCell = row.querySelector(".percent-cell");
      if (percentCell) {
        let chip = percentCell.querySelector(".progress-inline-chip");
        if (!chip) {
          chip = document.createElement("span");
          chip.className = "progress-inline-chip";
          percentCell.appendChild(chip);
        }
        chip.textContent = progress.percent === 100 ? "done" : progress.percent > 0 ? `${formatDuration(progress.remainingDurationMinutes)} left` : "not started";
        chip.title = `% Work Complete: ${progress.workPercent}% · Status Date: ${progress.statusDate || "none"}`;
      }

      const bar = row.querySelector(".gantt-bar");
      if (!bar) return;
      bar.classList.toggle("is-behind-baseline", baselineStatus?.kind === "behind");
      bar.classList.toggle("is-early-baseline", baselineStatus?.kind === "early");
      bar.style.setProperty("--done", `${progress.percent}%`);
      let label = bar.querySelector(".gantt-progress-label");
      if (!label) {
        label = document.createElement("strong");
        label.className = "gantt-progress-label";
        bar.appendChild(label);
      }
      label.textContent = progress.percent > 0 ? `${progress.percent}%` : "";
      let remaining = bar.querySelector(".gantt-remaining-label");
      if (!remaining) {
        remaining = document.createElement("small");
        remaining.className = "gantt-remaining-label";
        bar.appendChild(remaining);
      }
      remaining.hidden = !(progress.percent > 0 && progress.percent < 100);
      remaining.textContent = `${formatDuration(progress.remainingDurationMinutes)} remaining`;
      const statusText = baselineStatus?.title ? ` ${baselineStatus.title}` : "";
      bar.title = `${task.name}: ${progress.percent}% complete, ${formatDuration(progress.remainingDurationMinutes)} remaining.${statusText}`;
    });
  }

  function updateProgressVersionLabels() {
    const text = `${PROGRESS_VERSION} · ${PROGRESS_VERSION_NAME}`;
    if (els.appVersionBadge) {
      els.appVersionBadge.textContent = text;
      els.appVersionBadge.title = `Build ${PROGRESS_BUILD_DATE}`;
    }
    if (els.appVersionFooter) {
      els.appVersionFooter.textContent = `${text} · Build ${PROGRESS_BUILD_DATE}`;
    }
    const ribbon = document.getElementById("ribbonVersionText");
    if (ribbon) ribbon.textContent = `${text} · actual tracking`;
    const compat = document.getElementById("compatChip");
    if (compat && !compat.classList.contains("has-issues")) compat.lastChild.textContent = " XML + actuals ready";
  }

  function addActualFieldsToProjectXml(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    const parserError = doc.getElementsByTagName("parsererror")[0];
    if (parserError) return xmlText;
    const projectNode = doc.documentElement;
    setXmlChild(doc, projectNode, "StatusDate", toProjectDate(state.statusDate || state.projectStart));

    [...doc.getElementsByTagName("Task")].forEach((taskNode) => {
      const id = Number(childText(taskNode, "ID"));
      if (!id) return;
      const task = state.tasks[id - 1];
      if (!task) return;
      const progress = getProgressSnapshot(task);
      const assignmentSummary = summarizeTaskAssignments(task);
      const actualWork = assignmentSummary.totalWork ? assignmentSummary.actualWork : progress.actualDurationMinutes;
      const remainingWork = assignmentSummary.totalWork ? assignmentSummary.remainingWork : progress.remainingDurationMinutes;
      if (progress.actualStart) setXmlChild(doc, taskNode, "ActualStart", toProjectDate(progress.actualStart), "PercentComplete");
      if (progress.actualFinish) setXmlChild(doc, taskNode, "ActualFinish", toProjectDate(progress.actualFinish, true), "ActualStart");
      setXmlChild(doc, taskNode, "ActualDuration", minutesToProjectDuration(progress.actualDurationMinutes), "ActualFinish");
      setXmlChild(doc, taskNode, "RemainingDuration", minutesToProjectDuration(progress.remainingDurationMinutes), "ActualDuration");
      setXmlChild(doc, taskNode, "PercentWorkComplete", String(progress.workPercent), "PercentComplete");
      setXmlChild(doc, taskNode, "ActualWork", minutesToProjectDuration(actualWork), "Work");
      setXmlChild(doc, taskNode, "RemainingWork", minutesToProjectDuration(remainingWork), "ActualWork");
    });
    return new XMLSerializer().serializeToString(doc);
  }

  function setXmlChild(doc, parent, localName, value, afterLocalName = "") {
    if (!parent) return null;
    let child = [...parent.children].find((node) => node.localName === localName);
    if (!child) {
      child = doc.createElementNS(MS_PROJECT_NS, localName);
      const after = afterLocalName ? [...parent.children].find((node) => node.localName === afterLocalName) : null;
      if (after?.nextSibling) parent.insertBefore(child, after.nextSibling);
      else parent.appendChild(child);
    }
    child.textContent = value;
    return child;
  }

  function readActualFieldsFromProjectXml(text) {
    const payload = { statusDate: "", byId: new Map() };
    try {
      const xml = new DOMParser().parseFromString(text, "application/xml");
      const parserError = xml.getElementsByTagName("parsererror")[0];
      if (parserError) return payload;
      const projectNode = [...xml.children].find((node) => node.localName === "Project") || xml.documentElement;
      payload.statusDate = normalizeDateValue(childText(projectNode, "StatusDate").slice(0, 10));
      [...xml.getElementsByTagName("Task")].forEach((node) => {
        const id = Number(childText(node, "ID"));
        const name = childText(node, "Name");
        if (!id || id === 0 || !name) return;
        const actual = {
          actualStart: normalizeDateValue(childText(node, "ActualStart").slice(0, 10)),
          actualFinish: normalizeDateValue(childText(node, "ActualFinish").slice(0, 10)),
          actualDurationMinutes: durationToMinutes(childText(node, "ActualDuration") || "PT0H0M0S"),
          remainingDurationMinutes: durationToMinutes(childText(node, "RemainingDuration") || childText(node, "RemainingWork") || "PT0H0M0S"),
          percentWorkComplete: normalizePercent(childText(node, "PercentWorkComplete") || childText(node, "PercentComplete") || 0),
          statusDate: payload.statusDate,
        };
        payload.byId.set(id, actual);
      });
    } catch {
      return payload;
    }
    return payload;
  }

  function exportActualsCsv() {
    ensureDecorations();
    rollupSummaryTasks();
    rollupBaselineSummaryTasks();
    ensureResources();
    ensureAssignmentUids();
    ensureProgressForAll();
    const header = [
      "ID", "WBS", "Task Name", "Outline Level", "Summary", "Start", "Finish", "Duration", "% Complete", "% Work Complete",
      "Actual Start", "Actual Finish", "Actual Duration", "Remaining Duration", "Status Date", "Progress Status",
      "Baseline Start", "Baseline Finish", "Baseline Duration", "Start Variance", "Finish Variance", "Duration Variance", "Late/Early Warning",
      "Predecessors", "Resources", "Work", "Actual Work", "Remaining Work", "Cost", "Notes"
    ];
    const rows = state.tasks.map((task, index) => {
      const progress = getProgressSnapshot(task);
      const assignmentSummary = summarizeTaskAssignments(task);
      const baseline = normalizeBaseline(task.baseline, task);
      const variance = baselineVariance(task);
      const baselineStatus = getBaselineTimingStatus(task);
      const status = progress.percent >= 100 ? "Complete" : progress.percent > 0 ? "In progress" : "Not started";
      return [
        task.id,
        task.wbs,
        task.name,
        task.outlineLevel,
        isSummaryIndex(index) ? "Yes" : "No",
        task.start,
        task.finish,
        formatDuration(task.durationMinutes),
        `${progress.percent}%`,
        `${progress.workPercent}%`,
        progress.actualStart,
        progress.actualFinish,
        formatDuration(progress.actualDurationMinutes),
        formatDuration(progress.remainingDurationMinutes),
        progress.statusDate,
        status,
        baseline.start,
        baseline.finish,
        hasBaseline(task) ? formatDuration(baseline.durationMinutes) : "",
        variance.hasBaseline ? formatDayVariance(variance.startDays) : "",
        variance.hasBaseline ? formatDayVariance(variance.finishDays) : "",
        variance.hasBaseline ? formatDurationVariance(variance.durationMinutes) : "",
        baselineStatus?.kind === "behind" ? baselineStatus.title : baselineStatus?.kind === "early" ? baselineStatus.title : "",
        formatLinks(task.links || []),
        formatAssignmentResourceNames(task),
        formatWork(assignmentSummary.totalWork),
        formatWork(assignmentSummary.actualWork || progress.actualDurationMinutes),
        formatWork(assignmentSummary.remainingWork || progress.remainingDurationMinutes),
        formatMoney(assignmentSummary.totalCost),
        task.notes || "",
      ];
    });
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const fileBase = typeof safeFileName === "function" ? safeFileName(state.projectName) : String(state.projectName || "project").replace(/[^a-z0-9-_]+/gi, "-");
    downloadText(csv, `${fileBase}-actuals.csv`, "text/csv");
  }

  function csvCell(value) {
    const text = String(value ?? "");
    if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
  }
})();
