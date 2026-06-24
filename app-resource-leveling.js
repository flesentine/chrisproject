(() => {
  "use strict";

  const LEVELING_VERSION = "v0.40.0";
  const LEVELING_VERSION_NAME = "Resource leveling";
  const LEVELING_BUILD_DATE = "2026-06-24";
  const LEVELING_COLUMN_KEY = "levelingDelay";
  const LEVELING_COLUMN = { key: LEVELING_COLUMN_KEY, label: "Level Delay", defaultWidth: 102, min: 86, max: 170 };
  const MAX_DELAY_WORKING_DAYS = 260;
  let bootAttempts = 0;
  let levelingHandlersBound = false;
  let levelingObserverInstalled = false;
  let levelingRenderTimer = 0;

  function bootResourceLeveling() {
    if (window.__resourceLevelingV1Loaded) return;
    if (!resourceLevelingReady()) {
      bootAttempts += 1;
      if (bootAttempts < 180) setTimeout(bootResourceLeveling, 75);
      return;
    }

    window.__resourceLevelingV1Loaded = true;
    injectLevelingStyles();
    installResourceLevelingRibbon();
    ensureLevelingTaskInfoDom();
    syncLevelingColumn();
    patchResourceLevelingRuntime();
    bindLevelingInputs();
    installLevelingObserver();
    ensureLevelingState();
    exposeResourceLevelingSelfTest();
    render();
    setTimeout(afterRenderLeveling, 200);
    setTimeout(afterRenderLeveling, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootResourceLeveling, { once: true });
  else bootResourceLeveling();

  function resourceLevelingReady() {
    return typeof state !== "undefined" && Array.isArray(state.tasks) && typeof render === "function" && typeof renderGantt === "function" &&
      typeof validateProject === "function" && typeof FIELD_COLUMNS !== "undefined" && typeof FIELD_COLUMN_MAP !== "undefined" && typeof uiPrefs !== "undefined" &&
      typeof getCalendar === "function" && typeof normalizeDurationMinutes === "function" && typeof parseDurationInput === "function" &&
      typeof formatDuration === "function" && typeof isWorkingDay === "function" && typeof isSummaryIndex === "function" && typeof getResourceByUid === "function";
  }

  function safeEscape(value) {
    if (typeof escapeXml === "function") return escapeXml(value);
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function safeFormatDate(value) {
    if (typeof formatFriendlyDate === "function") return formatFriendlyDate(value);
    const date = typeof dateOnly === "function" ? dateOnly(value) : new Date(value);
    return date && !Number.isNaN(date.valueOf()) ? date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : String(value || "?");
  }

  function safeStatus(message) {
    const saveStatus = document.getElementById("saveStatus");
    if (saveStatus) saveStatus.textContent = message;
  }

  function injectLevelingStyles() {
    if (document.getElementById("resourceLevelingStyles")) return;
    const style = document.createElement("style");
    style.id = "resourceLevelingStyles";
    style.textContent = `
      .resource-leveling-group { min-width: 170px; }
      .resource-leveling-status { color: #475467; font-size: 11px; font-weight: 850; white-space: nowrap; }
      .resource-leveling-note { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; padding: 9px 11px; border: 1px solid #fed7aa; border-radius: 12px; background: #fff7ed; color: #9a3412; font-size: 12px; font-weight: 750; }
      .resource-leveling-note strong { color: #7c2d12; }
      .leveling-delay-grid-cell { background: rgba(255,247,237,.76); }
      .planner-row:nth-child(even) .leveling-delay-grid-cell { background: rgba(255,237,213,.50); }
      .leveling-delay-grid-cell input { width: 100%; min-width: 0; }
      .planner-row.has-resource-conflict .planner-fields { box-shadow: inset 4px 0 0 #f97316; }
      .planner-row.has-resource-conflict .name-input { border-color: #fdba74; background: #fff7ed; }
      .resource-conflict-badge { display: inline-flex; align-items: center; margin-left: 6px; padding: 1px 7px; border-radius: 999px; border: 1px solid #fed7aa; background: #ffedd5; color: #9a3412; font-size: 10px; font-weight: 900; white-space: nowrap; }
      .indicator-dot.is-resource-conflict { background: #fff7ed; border-color: #fb923c; color: #c2410c; }
      .gantt-bar.has-resource-conflict { box-shadow: 0 0 0 2px rgba(249,115,22,.45), 0 8px 16px rgba(154,52,18,.18); }
      .gantt-leveling-label { position: absolute; right: 8px; top: -18px; z-index: 8; padding: 1px 7px; border-radius: 999px; border: 1px solid #fed7aa; background: rgba(255,255,255,.96); color: #9a3412; font-size: 10px; font-weight: 900; pointer-events: none; white-space: nowrap; }
      .resource-row.has-resource-conflict { background: #fff7ed; box-shadow: inset 4px 0 0 #f97316; }
      .resource-row.has-resource-conflict input, .resource-row.has-resource-conflict select { border-color: #fdba74; }
      .resource-cell.has-resource-conflict { color: #9a3412; font-weight: 900; }
      .leveling-conflict-notice { margin: 10px 0 0; padding: 9px 11px; border-radius: 12px; border: 1px solid #fed7aa; background: #fff7ed; color: #9a3412; font-size: 12px; font-weight: 750; }
      .leveling-conflict-notice[hidden] { display: none; }
      .leveling-delay-field input { font-variant-numeric: tabular-nums; }
    `;
    document.head.appendChild(style);
  }

  function syncLevelingColumn() {
    if (!Array.isArray(FIELD_COLUMNS)) return;
    const existing = FIELD_COLUMNS.find((column) => column.key === LEVELING_COLUMN_KEY);
    if (!existing) {
      const predIndex = FIELD_COLUMNS.findIndex((column) => column.key === "predecessors");
      const insertAt = predIndex >= 0 ? predIndex : FIELD_COLUMNS.length;
      FIELD_COLUMNS.splice(insertAt, 0, { ...LEVELING_COLUMN });
    } else {
      Object.assign(existing, { ...LEVELING_COLUMN, ...existing, label: existing.label || LEVELING_COLUMN.label });
    }
    FIELD_COLUMN_MAP.set(LEVELING_COLUMN_KEY, FIELD_COLUMNS.find((column) => column.key === LEVELING_COLUMN_KEY));
    uiPrefs.fieldColumns = uiPrefs.fieldColumns || {};
    if (!Number.isFinite(Number(uiPrefs.fieldColumns[LEVELING_COLUMN_KEY]))) {
      uiPrefs.fieldColumns[LEVELING_COLUMN_KEY] = LEVELING_COLUMN.defaultWidth;
      if (typeof getTotalFieldColumnWidth === "function") uiPrefs.fieldPaneWidth = getTotalFieldColumnWidth();
      if (typeof saveUiPrefs === "function") saveUiPrefs();
    }
    if (typeof applyUiPrefs === "function") applyUiPrefs();
  }

  function patchResourceLevelingRuntime() {
    if (window.__resourceLevelingRuntimePatched) return;
    window.__resourceLevelingRuntimePatched = true;

    const baseRenderGantt = renderGantt;
    renderGantt = function resourceLevelingRenderGantt(...args) {
      ensureLevelingState();
      syncLevelingColumn();
      const result = baseRenderGantt.apply(this, args);
      afterRenderLeveling();
      return result;
    };

    const baseRenderResourceSheet = typeof renderResourceSheet === "function" ? renderResourceSheet : null;
    if (baseRenderResourceSheet) {
      renderResourceSheet = function resourceLevelingRenderResourceSheet(...args) {
        const result = baseRenderResourceSheet.apply(this, args);
        decorateResourceSheetConflicts();
        return result;
      };
    }

    const baseRender = render;
    render = function resourceLevelingRender(...args) {
      ensureLevelingState();
      syncLevelingColumn();
      ensureLevelingTaskInfoDom();
      const result = baseRender.apply(this, args);
      afterRenderLeveling();
      refreshLevelingTaskInfo(true);
      updateLevelingVersionLabels();
      return result;
    };

    const baseRefreshTaskInfoPanel = typeof refreshTaskInfoPanel === "function" ? refreshTaskInfoPanel : null;
    if (baseRefreshTaskInfoPanel) {
      refreshTaskInfoPanel = function resourceLevelingRefreshTaskInfoPanel(force = false) {
        ensureLevelingTaskInfoDom();
        const result = baseRefreshTaskInfoPanel.call(this, force);
        refreshLevelingTaskInfo(force);
        return result;
      };
    }

    const baseApplyTaskInfoForm = typeof applyTaskInfoForm === "function" ? applyTaskInfoForm : null;
    if (baseApplyTaskInfoForm) {
      applyTaskInfoForm = function resourceLevelingApplyTaskInfoForm(...args) {
        const index = Number.isInteger(taskInfoIndex) ? taskInfoIndex : null;
        const task = index !== null ? state.tasks?.[index] : null;
        const oldDelay = normalizeLevelingDelay(task?.levelingDelayMinutes ?? 0);
        const rawDelay = document.getElementById("tiLevelingDelay")?.value;
        const nextDelay = rawDelay == null ? oldDelay : parseLevelingDelayInput(rawDelay, oldDelay);
        const result = baseApplyTaskInfoForm.apply(this, args);
        const updated = index !== null ? state.tasks?.[index] : null;
        if (updated && !isSummaryIndex(index)) {
          const currentAfterBase = normalizeLevelingDelay(updated.levelingDelayMinutes ?? oldDelay);
          const delta = nextDelay - currentAfterBase;
          updated.levelingDelayMinutes = nextDelay;
          if (delta) shiftTaskByDelayDelta(updated, delta);
          if (delta || currentAfterBase !== nextDelay) render();
        }
        return result;
      };
    }

    const baseValidateProject = validateProject;
    validateProject = function resourceLevelingValidateProject(...args) {
      const baseIssues = baseValidateProject.apply(this, args) || [];
      const analysis = buildLevelingAnalysis();
      const extra = analysis.conflicts.slice(0, 20).map((conflict) => `Overallocated resource: ${summarizeConflict(conflict)} Resolve manually with Leveling Delay or by moving assignments; auto-leveling is not active yet.`);
      if (analysis.conflicts.length > 20) extra.push(`${analysis.conflicts.length - 20} more resource overallocations are hidden from this list.`);
      return [...new Set([...baseIssues, ...extra])];
    };

    const baseBuildProjectXml = typeof buildProjectXml === "function" ? buildProjectXml : null;
    if (baseBuildProjectXml) {
      buildProjectXml = function resourceLevelingBuildProjectXml(...args) {
        ensureLevelingState();
        return addLevelingFieldsToProjectXml(baseBuildProjectXml.apply(this, args));
      };
      window.buildProjectXml = buildProjectXml;
    }

    const baseImportProjectXml = typeof importProjectXml === "function" ? importProjectXml : null;
    if (baseImportProjectXml) {
      importProjectXml = function resourceLevelingImportProjectXml(text, ...args) {
        const importedDelays = parseLevelingDelaysFromXml(text);
        const result = baseImportProjectXml.call(this, text, ...args);
        applyImportedLevelingDelays(importedDelays);
        return result;
      };
      window.importProjectXml = importProjectXml;
    }
  }

  function ensureLevelingState() {
    (state.tasks || []).forEach((task) => {
      const raw = task.levelingDelayMinutes ?? task.levelingDelay ?? task.LevelingDelay ?? (Number(task.levelingDelayDays) ? Number(task.levelingDelayDays) * getCalendar().minutesPerDay : 0);
      task.levelingDelayMinutes = normalizeLevelingDelay(raw);
    });
  }

  function normalizeLevelingDelay(value) {
    const fallbackMax = (typeof getCalendar === "function" ? getCalendar().minutesPerDay : 480) * MAX_DELAY_WORKING_DAYS;
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(fallbackMax, Math.max(0, Math.round(n)));
  }

  function parseLevelingDelayInput(value, fallbackMinutes = 0) {
    const text = String(value ?? "").trim();
    if (!text) return 0;
    if (/^0+(?:\.0+)?\s*[a-z%]*$/i.test(text)) return 0;
    try {
      return normalizeLevelingDelay(parseDurationInput(text, fallbackMinutes || 0));
    } catch {
      return normalizeLevelingDelay(fallbackMinutes);
    }
  }

  function workingDateKeysBetween(start, finish) {
    const s = typeof dateOnly === "function" ? dateOnly(start) : null;
    const f = typeof dateOnly === "function" ? dateOnly(finish) : null;
    if (!s || !f) return [];
    const forward = s <= f;
    let cursor = forward ? s : f;
    const end = forward ? f : s;
    const dates = [];
    let guard = 0;
    while (cursor <= end && guard < 4000) {
      if (isWorkingDay(cursor)) dates.push(toDateInputValue(cursor));
      cursor = addDays(cursor, 1);
      guard += 1;
    }
    return dates.length ? dates : [toDateInputValue(s)];
  }

  function buildLevelingAnalysis() {
    ensureLevelingState();
    if (typeof ensureResources === "function") ensureResources();
    const buckets = new Map();
    (state.tasks || []).forEach((task, index) => {
      if (!task || isSummaryIndex(index) || normalizeDurationMinutes(task.durationMinutes, 0) === 0) return;
      const workDates = workingDateKeysBetween(task.start, task.finish);
      (task.assignments || []).forEach((assignment) => {
        const resource = getResourceByUid(assignment.resourceUid);
        if (!resource || resource.type !== "Work") return;
        const units = typeof normalizeAssignmentUnits === "function" ? normalizeAssignmentUnits(assignment.units) : Math.max(0, Number(assignment.units) || 0);
        if (units <= 0) return;
        workDates.forEach((date) => {
          const key = `${resource.uid}:${date}`;
          if (!buckets.has(key)) {
            const maxUnits = typeof normalizeMaxUnits === "function" ? normalizeMaxUnits(resource.maxUnits) : Math.max(0, Number(resource.maxUnits) || 100);
            buckets.set(key, { resourceUid: Number(resource.uid), resourceName: resource.name, maxUnits, date, units: 0, assignments: [] });
          }
          const bucket = buckets.get(key);
          bucket.units += units;
          bucket.assignments.push({ index, id: task.id, name: task.name, units });
        });
      });
    });

    const conflicts = [...buckets.values()]
      .filter((bucket) => bucket.units > bucket.maxUnits)
      .map((bucket) => ({ ...bucket, units: Math.round(bucket.units), overBy: Math.round(bucket.units - bucket.maxUnits) }))
      .sort((a, b) => String(a.resourceName).localeCompare(String(b.resourceName)) || String(a.date).localeCompare(String(b.date)));
    const taskConflicts = new Map();
    const resourceConflicts = new Map();
    conflicts.forEach((conflict) => {
      if (!resourceConflicts.has(conflict.resourceUid)) resourceConflicts.set(conflict.resourceUid, []);
      resourceConflicts.get(conflict.resourceUid).push(conflict);
      conflict.assignments.forEach((assignment) => {
        if (!taskConflicts.has(assignment.index)) taskConflicts.set(assignment.index, []);
        taskConflicts.get(assignment.index).push(conflict);
      });
    });
    return { conflicts, taskConflicts, resourceConflicts };
  }

  function summarizeConflict(conflict) {
    const taskList = conflict.assignments
      .slice(0, 3)
      .map((assignment) => `${assignment.id}. ${assignment.name}`)
      .join(", ");
    const extra = conflict.assignments.length > 3 ? `, +${conflict.assignments.length - 3} more` : "";
    return `${conflict.resourceName} ${safeFormatDate(conflict.date)}: ${conflict.units}% assigned vs ${conflict.maxUnits}% max across ${taskList}${extra}.`;
  }

  function conflictTitle(conflicts) {
    const unique = [...new Map((conflicts || []).map((conflict) => [`${conflict.resourceUid}:${conflict.date}`, conflict])).values()];
    const text = unique.slice(0, 3).map(summarizeConflict).join(" ");
    return `${text}${unique.length > 3 ? ` +${unique.length - 3} more conflict day${unique.length - 3 === 1 ? "" : "s"}.` : ""}`;
  }

  function afterRenderLeveling() {
    clearTimeout(levelingRenderTimer);
    injectLevelingGridCells();
    decorateLevelingConflicts();
    decorateResourceSheetConflicts();
    refreshLevelingTaskInfo(true);
    updateLevelingVersionLabels();
  }

  function scheduleAfterRenderLeveling() {
    clearTimeout(levelingRenderTimer);
    levelingRenderTimer = setTimeout(afterRenderLeveling, 60);
  }

  function injectLevelingGridCells() {
    if (!document.getElementById("taskBody")) return;
    document.querySelectorAll(".planner-row[data-row-index]").forEach((row) => {
      row.querySelectorAll(".leveling-delay-grid-cell").forEach((node) => node.remove());
      const index = Number(row.dataset.rowIndex);
      const task = state.tasks?.[index];
      const predecessorCell = row.querySelector('input[data-field="predecessors"]')?.closest(".planner-cell");
      if (!task || !predecessorCell) return;
      const delay = normalizeLevelingDelay(task.levelingDelayMinutes ?? 0);
      const disabled = isSummaryIndex(index) ? " readonly aria-readonly=\"true\"" : "";
      const title = isSummaryIndex(index)
        ? "Summary tasks roll up from children. Level child tasks instead."
        : "Manual Leveling Delay. Increase this to push the task later and resolve overallocated resources.";
      const cell = document.createElement("div");
      cell.className = "planner-cell leveling-delay-grid-cell";
      cell.innerHTML = `<input data-leveling-delay data-index="${index}" value="${safeEscape(formatDuration(delay))}" title="${safeEscape(title)}"${disabled} />`;
      predecessorCell.before(cell);
    });
  }

  function decorateLevelingConflicts() {
    const analysis = buildLevelingAnalysis();
    document.querySelectorAll(".planner-row[data-row-index]").forEach((row) => {
      const index = Number(row.dataset.rowIndex);
      const conflicts = analysis.taskConflicts.get(index) || [];
      const title = conflictTitle(conflicts);
      row.classList.toggle("has-resource-conflict", conflicts.length > 0);
      row.querySelectorAll(".resource-conflict-badge,.gantt-leveling-label,.indicator-dot.is-resource-conflict").forEach((node) => node.remove());
      const bar = row.querySelector(".gantt-bar");
      if (bar) bar.classList.toggle("has-resource-conflict", conflicts.length > 0);
      if (!conflicts.length) return;

      row.title = title;
      const nameCell = row.querySelector(".task-name-cell");
      if (nameCell) {
        const badge = document.createElement("span");
        badge.className = "resource-conflict-badge";
        badge.textContent = "overallocated";
        badge.title = title;
        nameCell.appendChild(badge);
      }
      const indicatorButton = row.querySelector(".indicator-button");
      if (indicatorButton) {
        const dot = document.createElement("span");
        dot.className = "indicator-dot is-resource-conflict";
        dot.textContent = "⚠";
        dot.title = title;
        indicatorButton.appendChild(dot);
        indicatorButton.title = `${indicatorButton.title || ""} Resource conflict: ${title}`.trim();
      }
      if (bar) {
        const label = document.createElement("small");
        label.className = "gantt-leveling-label";
        label.textContent = "Level manually";
        label.title = title;
        bar.appendChild(label);
        bar.title = `${bar.title || ""} Resource conflict: ${title}`.trim();
      }
    });
    updateLevelingStatus(analysis);
  }

  function decorateResourceSheetConflicts() {
    const shell = document.querySelector(".resource-sheet-shell");
    if (!shell) return;
    let note = shell.querySelector(".resource-leveling-note");
    if (!note) {
      note = document.createElement("div");
      note.className = "resource-leveling-note";
      shell.insertBefore(note, shell.firstChild);
    }
    note.innerHTML = `<strong>Manual resource leveling:</strong><span>Overallocated resources are highlighted. Resolve conflicts by dragging tasks or entering Leveling Delay. Auto-level comes later.</span>`;

    const analysis = buildLevelingAnalysis();
    document.querySelectorAll(".resource-row[data-resource-index]").forEach((row) => {
      const resource = state.resources?.[Number(row.dataset.resourceIndex)];
      const conflicts = resource ? (analysis.resourceConflicts.get(Number(resource.uid)) || []) : [];
      const title = conflictTitle(conflicts);
      row.classList.toggle("has-resource-conflict", conflicts.length > 0);
      row.querySelectorAll(".resource-leveling-warning").forEach((node) => node.remove());
      row.querySelectorAll(".resource-cell.has-resource-conflict").forEach((cell) => cell.classList.remove("has-resource-conflict"));
      if (!conflicts.length) return;
      row.title = title;
      const indicator = row.querySelector(".resource-indicator");
      if (indicator) {
        indicator.classList.add("has-resource-conflict");
        indicator.insertAdjacentHTML("beforeend", `<span class="resource-leveling-warning" title="${safeEscape(title)}"> ⚠</span>`);
      }
      const assigned = row.querySelector(".assignment-count-cell");
      if (assigned) {
        assigned.classList.add("has-resource-conflict");
        const uniqueTasks = new Set(conflicts.flatMap((conflict) => conflict.assignments.map((assignment) => assignment.id)));
        assigned.textContent = `${uniqueTasks.size} task${uniqueTasks.size === 1 ? "" : "s"} · ${conflicts.length} conflict day${conflicts.length === 1 ? "" : "s"}`;
        assigned.title = title;
      }
    });
    updateLevelingStatus(analysis);
  }

  function updateLevelingStatus(analysis = buildLevelingAnalysis()) {
    const status = document.getElementById("resourceLevelingStatus");
    if (!status) return;
    const resources = new Set(analysis.conflicts.map((conflict) => conflict.resourceUid)).size;
    status.textContent = analysis.conflicts.length
      ? `${analysis.conflicts.length} conflict day${analysis.conflicts.length === 1 ? "" : "s"} · ${resources} resource${resources === 1 ? "" : "s"}`
      : "No overallocations";
  }

  function bindLevelingInputs() {
    if (levelingHandlersBound) return;
    levelingHandlersBound = true;
    document.getElementById("taskBody")?.addEventListener("change", (event) => {
      const input = event.target?.closest?.("[data-leveling-delay]");
      if (!input) return;
      event.preventDefault();
      event.stopPropagation();
      updateTaskLevelingDelay(Number(input.dataset.index), input.value);
    }, true);
  }

  function shiftTaskByDelayDelta(task, deltaMinutes) {
    if (!task || !deltaMinutes) return false;
    const duration = normalizeDurationMinutes(task.durationMinutes, typeof workingSpanMinutes === "function" ? workingSpanMinutes(task.start, task.finish) : getCalendar().minutesPerDay);
    const currentStart = typeof dateOnly === "function" ? dateOnly(task.start) : null;
    if (!currentStart) return false;
    const shiftedStart = typeof applyLagToWorkingDate === "function"
      ? applyLagToWorkingDate(currentStart, deltaMinutes)
      : currentStart;
    if (!shiftedStart) return false;
    if (typeof setTaskStartKeepDuration === "function") setTaskStartKeepDuration(task, shiftedStart, duration);
    else {
      task.start = toDateInputValue(shiftedStart);
      task.finish = toDateInputValue(finishFromStartByDuration(shiftedStart, duration));
      task.durationMinutes = duration;
    }
    task.durationDays = durationMinutesToWorkingDays(task.durationMinutes);
    task.isMilestone = task.durationMinutes === 0;
    return true;
  }

  function updateTaskLevelingDelay(index, rawValue) {
    const task = state.tasks?.[index];
    if (!task || isSummaryIndex(index)) return;
    if (typeof selectTask === "function") selectTask(index);
    const oldDelay = normalizeLevelingDelay(task.levelingDelayMinutes ?? 0);
    const nextDelay = parseLevelingDelayInput(rawValue, oldDelay);
    const delta = nextDelay - oldDelay;
    task.levelingDelayMinutes = nextDelay;
    if (delta) shiftTaskByDelayDelta(task, delta);
    safeStatus(delta ? `Leveling delay set to ${formatDuration(nextDelay)}; task moved manually.` : `Leveling delay is ${formatDuration(nextDelay)}.`);
    render();
  }

  function ensureLevelingTaskInfoDom() {
    const page = document.querySelector('[data-task-info-page="advanced"]');
    const grid = page?.querySelector(".task-info-grid");
    if (!page || !grid) return;
    if (!document.getElementById("tiLevelingDelay")) {
      const label = document.createElement("label");
      label.className = "leveling-delay-field";
      label.innerHTML = `Leveling delay<input id="tiLevelingDelay" type="text" placeholder="0d" title="Manual delay added by resource leveling" />`;
      grid.appendChild(label);
      if (typeof els === "object") els.tiLevelingDelay = label.querySelector("input");
    }
    if (!document.getElementById("tiLevelingConflictNotice")) {
      const notice = document.createElement("p");
      notice.className = "leveling-conflict-notice";
      notice.id = "tiLevelingConflictNotice";
      notice.hidden = true;
      grid.insertAdjacentElement("afterend", notice);
    }
  }

  function refreshLevelingTaskInfo(force = false) {
    ensureLevelingTaskInfoDom();
    if (!Number.isInteger(taskInfoIndex) || !state.tasks?.[taskInfoIndex]) return;
    if (document.getElementById("taskInfoModal")?.hidden && !force) return;
    const task = state.tasks[taskInfoIndex];
    const isSummary = isSummaryIndex(taskInfoIndex);
    const input = document.getElementById("tiLevelingDelay");
    if (input) {
      input.value = formatDuration(normalizeLevelingDelay(task.levelingDelayMinutes ?? 0));
      input.disabled = isSummary;
      input.title = isSummary ? "Level child tasks instead of summary rows." : "Manual Leveling Delay. Increase this to move the task later.";
    }
    const notice = document.getElementById("tiLevelingConflictNotice");
    if (!notice) return;
    const conflicts = buildLevelingAnalysis().taskConflicts.get(taskInfoIndex) || [];
    notice.hidden = !conflicts.length;
    notice.textContent = conflicts.length
      ? `Resource conflict detected: ${conflictTitle(conflicts)} Increase Leveling delay or move the bar manually. Auto-leveling comes later.`
      : "";
  }

  function installResourceLevelingRibbon() {
    if (document.getElementById("resourceLevelingGroup")) return;
    const resourcePanel = document.querySelector(".ribbon-panel[data-ribbon-panel='resource']");
    if (!resourcePanel) return;
    const group = document.createElement("div");
    group.className = "command-group compact-group resource-leveling-group";
    group.id = "resourceLevelingGroup";
    group.innerHTML = `
      <span class="group-label">Leveling</span>
      <button id="findResourceConflictsBtn" type="button" title="Highlight overallocated resources and tasks">Find conflicts</button>
      <button id="autoLevelLaterBtn" type="button" disabled title="Automatic leveling is intentionally saved for a later build">Auto-level later</button>
      <span class="resource-leveling-status" id="resourceLevelingStatus">Manual only</span>`;
    const note = resourcePanel.querySelector(".ribbon-note-group");
    resourcePanel.insertBefore(group, note || null);
    group.querySelector("#findResourceConflictsBtn")?.addEventListener("click", () => {
      const analysis = buildLevelingAnalysis();
      if (typeof setActiveView === "function") setActiveView("resources");
      afterRenderLeveling();
      safeStatus(analysis.conflicts.length
        ? `Found ${analysis.conflicts.length} resource conflict day${analysis.conflicts.length === 1 ? "" : "s"}. Use Leveling Delay or drag tasks manually.`
        : "No resource overallocations found.");
    });
    updateLevelingStatus();
  }

  function installLevelingObserver() {
    if (levelingObserverInstalled) return;
    const taskBody = document.getElementById("taskBody");
    if (!taskBody) return;
    levelingObserverInstalled = true;
    new MutationObserver(scheduleAfterRenderLeveling).observe(taskBody, { childList: true, subtree: true });
  }

  function updateLevelingVersionLabels() {
    const text = `${LEVELING_VERSION} · ${LEVELING_VERSION_NAME}`;
    const badge = document.getElementById("appVersionBadge");
    const footer = document.getElementById("appVersionFooter");
    const ribbon = document.getElementById("ribbonVersionText");
    const compat = document.getElementById("compatChip");
    const cardBadge = document.querySelector(".unified-card .card-badge");
    if (badge) {
      badge.textContent = text;
      badge.title = `Build ${LEVELING_BUILD_DATE}`;
    }
    if (footer) footer.textContent = `${text} · Build ${LEVELING_BUILD_DATE}`;
    if (ribbon) ribbon.textContent = `${LEVELING_VERSION} · manual resource leveling`;
    if (compat && !compat.classList.contains("has-issues")) compat.lastChild.textContent = " XML + manual leveling ready";
    if (cardBadge) cardBadge.textContent = "Entry + Leveling";
  }

  function addLevelingFieldsToProjectXml(xmlText) {
    if (!xmlText || !state.tasks?.some((task) => normalizeLevelingDelay(task.levelingDelayMinutes) > 0)) return xmlText;
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.getElementsByTagName("parsererror")[0]) return xmlText;
    const taskByUid = new Map((state.tasks || []).map((task) => [String(task.uid), task]));
    [...doc.getElementsByTagName("Task")].forEach((taskNode) => {
      const uid = childTextLocal(taskNode, "UID");
      const task = taskByUid.get(String(uid));
      const delay = normalizeLevelingDelay(task?.levelingDelayMinutes ?? 0);
      if (!task || delay <= 0) return;
      setXmlChild(doc, taskNode, "LevelingDelay", String(delay), "Manual");
      setXmlChild(doc, taskNode, "LevelingDelayFormat", "7", "LevelingDelay");
    });
    return new XMLSerializer().serializeToString(doc);
  }

  function parseLevelingDelaysFromXml(xmlText) {
    const delays = new Map();
    try {
      const doc = new DOMParser().parseFromString(xmlText, "application/xml");
      if (doc.getElementsByTagName("parsererror")[0]) return delays;
      [...doc.getElementsByTagName("Task")].forEach((taskNode) => {
        const uid = childTextLocal(taskNode, "UID");
        const raw = childTextLocal(taskNode, "LevelingDelay");
        if (!uid || !raw) return;
        delays.set(String(uid), parseProjectLevelingDelay(raw));
      });
    } catch {
      // Leave core XML import behavior alone.
    }
    return delays;
  }

  function applyImportedLevelingDelays(delays) {
    if (!delays?.size) return;
    (state.tasks || []).forEach((task) => {
      if (delays.has(String(task.uid))) task.levelingDelayMinutes = normalizeLevelingDelay(delays.get(String(task.uid)));
    });
    safeStatus("Imported leveling delay fields from Project XML.");
    render();
  }

  function parseProjectLevelingDelay(raw) {
    const text = String(raw || "").trim();
    if (!text) return 0;
    if (/^P/i.test(text) && typeof durationToMinutes === "function") return normalizeLevelingDelay(durationToMinutes(text));
    const numeric = Number(text);
    if (Number.isFinite(numeric)) return normalizeLevelingDelay(numeric);
    return parseLevelingDelayInput(text, 0);
  }

  function childTextLocal(node, localName) {
    const child = [...(node?.children || [])].find((candidate) => candidate.localName === localName);
    return child ? child.textContent.trim() : "";
  }

  function setXmlChild(doc, parent, localName, value, afterLocalName = "") {
    if (!parent) return null;
    let child = [...parent.children].find((node) => node.localName === localName);
    if (!child) {
      child = doc.createElementNS(typeof MS_PROJECT_NS !== "undefined" ? MS_PROJECT_NS : null, localName);
      const after = afterLocalName ? [...parent.children].find((node) => node.localName === afterLocalName) : null;
      if (after?.nextSibling) parent.insertBefore(child, after.nextSibling);
      else parent.appendChild(child);
    }
    child.textContent = value;
    return child;
  }

  function exposeResourceLevelingSelfTest() {
    window.__resourceLevelingSelfTest = () => {
      const savedState = JSON.parse(JSON.stringify(state));
      const savedSelected = typeof selectedTaskIndex !== "undefined" ? selectedTaskIndex : null;
      try {
        state.resources = [{ uid: 1, id: 1, name: "Designer", type: "Work", initials: "D", maxUnits: 100, standardRate: 0, overtimeRate: 0, costPerUse: 0, baseCalendar: "Standard", notes: "" }];
        state.tasks = [
          { uid: 1, id: 1, name: "Layout", start: "2026-07-06", finish: "2026-07-08", durationMinutes: 1440, durationDays: 3, percent: 0, links: [], predecessors: [], outlineLevel: 1, isSummary: false, expanded: true, assignments: [{ uid: 1, resourceUid: 1, units: 100, workMinutes: 1440, actualWorkMinutes: 0, remainingWorkMinutes: 1440 }], levelingDelayMinutes: 0 },
          { uid: 2, id: 2, name: "Prototype", start: "2026-07-07", finish: "2026-07-09", durationMinutes: 1440, durationDays: 3, percent: 0, links: [], predecessors: [], outlineLevel: 1, isSummary: false, expanded: true, assignments: [{ uid: 2, resourceUid: 1, units: 100, workMinutes: 1440, actualWorkMinutes: 0, remainingWorkMinutes: 1440 }], levelingDelayMinutes: 0 },
        ];
        if (typeof selectedTaskIndex !== "undefined") selectedTaskIndex = 0;
        ensureLevelingState();
        render();
        const analysis = buildLevelingAnalysis();
        const flaggedRows = document.querySelectorAll(".planner-row.has-resource-conflict").length;
        return { version: LEVELING_VERSION, conflicts: analysis.conflicts.length, flaggedRows, passed: analysis.conflicts.length >= 1 && flaggedRows >= 2 };
      } finally {
        state = savedState;
        if (typeof selectedTaskIndex !== "undefined") selectedTaskIndex = savedSelected;
        render();
      }
    };
  }
})();
