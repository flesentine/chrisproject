(() => {
  const PROJECT_RIBBON_VERSION = "v0.31.0";

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
    const label = `${PROJECT_RIBBON_VERSION} · constraints + deadlines`;
    const ribbon = document.getElementById("ribbonVersionText");
    const badge = document.getElementById("appVersionBadge");
    const footer = document.getElementById("appVersionFooter");
    if (ribbon) ribbon.textContent = label;
    if (badge) badge.textContent = label;
    if (footer) footer.textContent = `${label} · Build 2026-06-24`;
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

(() => {
  const CONSTRAINTS_DEADLINES_VERSION = "v0.31.0";
  const CONSTRAINTS_DEADLINES_NAME = "Constraints + deadlines";
  const CONSTRAINTS_BUILD_DATE = "2026-06-24";
  const SCHEDULE_FIELDS = new Set(["start", "finish", "duration", "predecessors", "constraintType", "constraintDate", "deadline"]);
  let bootAttempts = 0;

  function bootConstraintsDeadlinesV2() {
    if (window.__constraintsDeadlinesV2Loaded) return;
    if (
      typeof state === "undefined" ||
      typeof render !== "function" ||
      typeof getTaskLinks !== "function" ||
      typeof applyConstraintsToDates !== "function" ||
      typeof applyDatesToTask !== "function"
    ) {
      retryBoot();
      return;
    }

    window.__constraintsDeadlinesV2Loaded = true;
    injectConstraintStyles();
    patchConstraintRuntime();
    normalizeConstraintDeadlineData();
    exposeConstraintSelfTest();
    render();
  }

  function retryBoot() {
    bootAttempts += 1;
    if (bootAttempts <= 80) window.setTimeout(bootConstraintsDeadlinesV2, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootConstraintsDeadlinesV2, { once: true });
  } else {
    bootConstraintsDeadlinesV2();
  }

  function injectConstraintStyles() {
    if (document.getElementById("constraintsDeadlinesV2Styles")) return;
    const style = document.createElement("style");
    style.id = "constraintsDeadlinesV2Styles";
    style.textContent = `
      .indicator-dot.is-constraint-conflict { background: #fff1f2; color: #be123c; border-color: rgba(190,18,60,0.24); }
      .planner-row.has-constraint-conflict .planner-fields { box-shadow: inset 3px 0 0 #be123c; }
      .planner-row.has-constraint-conflict .constraint-warning-badge { background: #be123c; }
      .constraint-explain-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border: 1px solid rgba(190,18,60,0.22);
        background: #fff1f2;
        color: #9f1239;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 11px;
        font-weight: 850;
      }
    `;
    document.head.appendChild(style);
  }

  function patchConstraintRuntime() {
    const baseEnsureDecorations = ensureDecorations;
    ensureDecorations = function constraintsV2EnsureDecorations() {
      baseEnsureDecorations();
      normalizeConstraintDeadlineData();
    };

    const baseGetTaskConstraintWarnings = getTaskConstraintWarnings;
    getTaskConstraintWarnings = function constraintsV2GetTaskConstraintWarnings(task) {
      const base = typeof baseGetTaskConstraintWarnings === "function" ? baseGetTaskConstraintWarnings(task) : [];
      return uniqueWarnings([...base, ...getDependencyConstraintWarnings(task)]);
    };

    const baseUpdateTask = updateTask;
    updateTask = function constraintsV2UpdateTask(index, field, value) {
      const beforeTask = state.tasks?.[index];
      const stableId = beforeTask?.id;
      const result = baseUpdateTask(index, field, value);
      const task = getTaskByStableId(stableId, index);
      if (!task || isSummaryTask(task)) return result;

      if (SCHEDULE_FIELDS.has(field)) {
        const changedByConstraint = enforceConstraintsOnTask(task);
        const changedByCascade = cascadeSuccessorsSafely(task);
        if ((changedByConstraint || changedByCascade) && typeof render === "function") render();
      }
      return result;
    };

    if (typeof applyTaskInfoForm === "function") {
      const baseApplyTaskInfoForm = applyTaskInfoForm;
      applyTaskInfoForm = function constraintsV2ApplyTaskInfoForm() {
        const index = taskInfoIndex;
        const beforeTask = state.tasks?.[index];
        const stableId = beforeTask?.id;
        const result = baseApplyTaskInfoForm();
        const task = getTaskByStableId(stableId, index);
        if (task && !isSummaryTask(task)) {
          const changedByConstraint = enforceConstraintsOnTask(task);
          const changedByCascade = cascadeSuccessorsSafely(task);
          if ((changedByConstraint || changedByCascade) && typeof render === "function") render();
        }
        return result;
      };
    }

    if (typeof renderTaskIndicators === "function") {
      const baseRenderTaskIndicators = renderTaskIndicators;
      renderTaskIndicators = function constraintsV2RenderTaskIndicators(task, index, context = {}) {
        const html = baseRenderTaskIndicators(task, index, context);
        const conflicts = getDependencyConstraintWarnings(task);
        if (!conflicts.length || !html.includes("</button>")) return html;
        const title = escapeXml(conflicts.join(" "));
        const chip = `<span class="indicator-dot is-constraint-conflict" title="${title}">⚠</span>`;
        return html.replace("</button>", `${chip}</button>`);
      };
    }

    if (typeof renderGantt === "function") {
      const baseRenderGantt = renderGantt;
      renderGantt = function constraintsV2RenderGantt() {
        baseRenderGantt();
        decorateConstraintConflictRows();
      };
    }

    const baseRenderVersion = renderVersion;
    renderVersion = function constraintsV2RenderVersion() {
      baseRenderVersion();
      const text = `${CONSTRAINTS_DEADLINES_VERSION} · ${CONSTRAINTS_DEADLINES_NAME}`;
      if (els.appVersionBadge) {
        els.appVersionBadge.textContent = text;
        els.appVersionBadge.title = `Build ${CONSTRAINTS_BUILD_DATE}`;
      }
      if (els.appVersionFooter) {
        els.appVersionFooter.textContent = `${text} · Build ${CONSTRAINTS_BUILD_DATE}`;
      }
      const ribbonVersionText = document.getElementById("ribbonVersionText");
      if (ribbonVersionText) ribbonVersionText.textContent = `${CONSTRAINTS_DEADLINES_VERSION} · constraints/deadlines`;
      const compatChip = document.getElementById("compatChip");
      if (compatChip) compatChip.lastChild.textContent = " Constraints/deadlines ready";
    };
  }

  function normalizeConstraintDeadlineData() {
    if (!Array.isArray(state.tasks)) return;
    state.tasks.forEach((task) => {
      task.constraintType = normalizeConstraintType(task.constraintType);
      task.constraintDate = normalizeDateValue(task.constraintDate);
      task.deadline = normalizeDateValue(task.deadline);
      if (!constraintNeedsDate(task.constraintType)) task.constraintDate = "";
    });
  }

  function isSummaryTask(task) {
    if (!task) return false;
    const index = state.tasks?.indexOf(task) ?? -1;
    return index >= 0 && typeof isSummaryIndex === "function" ? isSummaryIndex(index) : Boolean(task.isSummary);
  }

  function getTaskByStableId(id, fallbackIndex) {
    return (state.tasks || []).find((task) => task.id === id) || state.tasks?.[fallbackIndex] || null;
  }

  function enforceConstraintsOnTask(task) {
    if (!task || isSummaryTask(task)) return false;
    const dates = {
      start: task.start,
      finish: task.finish,
      durationMinutes: normalizeDurationMinutes(task.durationMinutes, workingSpanMinutes(task.start, task.finish)),
    };
    const constrained = applyConstraintsToDates(task, dates);
    return applyDatesToTask(task, constrained);
  }

  function cascadeSuccessorsSafely(task) {
    if (!task || typeof cascadeScheduleFromTask !== "function") return false;
    if (typeof detectCycles === "function" && detectCycles().length) return false;
    return cascadeScheduleFromTask(task.id, { silent: true, render: false });
  }

  function uniqueWarnings(warnings) {
    return [...new Set((warnings || []).filter(Boolean))];
  }

  function compareDates(a, b) {
    const left = dateOnly(a);
    const right = dateOnly(b);
    if (!left || !right) return 0;
    return Math.round((left - right) / 86400000);
  }

  function fmt(value) {
    return typeof formatFriendlyDate === "function" ? formatFriendlyDate(value) : normalizeDateValue(value);
  }

  function latestWorkingDate(items) {
    const dates = (items || []).map((item) => dateOnly(item)).filter(Boolean);
    if (!dates.length) return null;
    return new Date(Math.max(...dates.map(Number)));
  }

  function requirementFromLink(task, link, byId) {
    const pred = byId.get(link.id);
    if (!pred) return null;
    const predStart = dateOnly(pred.start);
    const predFinish = dateOnly(pred.finish);
    if (!predStart || !predFinish) return null;
    const type = normalizeLinkType(link.type);
    if (type === "FS") {
      return { kind: "start", date: applyLagToWorkingDate(addWorkingDaysAfter(predFinish, 1), link.lagMinutes), link, predecessor: pred };
    }
    if (type === "SS") {
      return { kind: "start", date: applyLagToWorkingDate(predStart, link.lagMinutes), link, predecessor: pred };
    }
    if (type === "FF") {
      return { kind: "finish", date: applyLagToWorkingDate(predFinish, link.lagMinutes), link, predecessor: pred };
    }
    if (type === "SF") {
      return { kind: "finish", date: applyLagToWorkingDate(predStart, link.lagMinutes), link, predecessor: pred };
    }
    return null;
  }

  function calculateRawDependencyDates(task) {
    const links = getTaskLinks(task);
    if (!links.length) return null;
    const byId = new Map((state.tasks || []).map((candidate) => [candidate.id, candidate]));
    const requirements = links.map((link) => requirementFromLink(task, link, byId)).filter(Boolean);
    if (!requirements.length) return null;

    const durationMinutes = normalizeDurationMinutes(task.durationMinutes, workingSpanMinutes(task.start, task.finish));
    const latestStartRequirement = latestWorkingDate(requirements.filter((row) => row.kind === "start").map((row) => row.date));
    const latestFinishRequirement = latestWorkingDate(requirements.filter((row) => row.kind === "finish").map((row) => row.date));
    const finishDrivenStart = latestFinishRequirement ? startFromFinishByDuration(latestFinishRequirement, durationMinutes) : null;
    const desiredStart = latestWorkingDate([latestStartRequirement, finishDrivenStart]) || dateOnly(task.start) || dateOnly(state.projectStart) || dateOnly(today);
    const desiredFinish = finishFromStartByDuration(desiredStart, durationMinutes);

    return {
      start: toDateInputValue(desiredStart),
      finish: toDateInputValue(desiredFinish),
      durationMinutes,
      requirements,
    };
  }

  function getDependencyConstraintWarnings(task) {
    if (!task || isSummaryTask(task)) return [];
    const raw = calculateRawDependencyDates(task);
    if (!raw) return getDeadlineOnlyWarnings(task);

    const warnings = [];
    const type = normalizeConstraintType(task.constraintType);
    const constraintDate = dateOnly(task.constraintDate);
    const deadlineDate = dateOnly(task.deadline);
    const rawStart = dateOnly(raw.start);
    const rawFinish = dateOnly(raw.finish);
    const finalFinish = dateOnly(task.finish);
    const constraintLabel = formatConstraintType(type);

    if (constraintDate) {
      raw.requirements.forEach((requirement) => {
        const direction = requirement.kind === "start" ? "Start" : "Finish";
        const linkLabel = formatLink(requirement.link);
        if (requirement.kind === "start") {
          if (type === "SNET" && compareDates(requirement.date, constraintDate) < 0) warnings.push(`Dependency ${linkLabel} wants ${direction} ${fmt(requirement.date)}, but ${constraintLabel} holds it at ${fmt(constraintDate)}.`);
          if (type === "SNLT" && compareDates(requirement.date, constraintDate) > 0) warnings.push(`Dependency ${linkLabel} wants ${direction} ${fmt(requirement.date)}, but ${constraintLabel} limits it to ${fmt(constraintDate)}.`);
          if (type === "MSO" && compareDates(requirement.date, constraintDate) !== 0) warnings.push(`Dependency ${linkLabel} wants ${direction} ${fmt(requirement.date)}, but ${constraintLabel} fixes it at ${fmt(constraintDate)}.`);
        }
        if (requirement.kind === "finish") {
          if (type === "FNET" && compareDates(requirement.date, constraintDate) < 0) warnings.push(`Dependency ${linkLabel} wants ${direction} ${fmt(requirement.date)}, but ${constraintLabel} holds it at ${fmt(constraintDate)}.`);
          if (type === "FNLT" && compareDates(requirement.date, constraintDate) > 0) warnings.push(`Dependency ${linkLabel} wants ${direction} ${fmt(requirement.date)}, but ${constraintLabel} limits it to ${fmt(constraintDate)}.`);
          if (type === "MFO" && compareDates(requirement.date, constraintDate) !== 0) warnings.push(`Dependency ${linkLabel} wants ${direction} ${fmt(requirement.date)}, but ${constraintLabel} fixes it at ${fmt(constraintDate)}.`);
        }
      });

      if (type === "SNET" && rawStart && compareDates(rawStart, constraintDate) < 0) warnings.push(`Predecessors calculate Start ${fmt(rawStart)}, but ${constraintLabel} prevents this task from moving before ${fmt(constraintDate)}.`);
      if (type === "SNLT" && rawStart && compareDates(rawStart, constraintDate) > 0) warnings.push(`Predecessors calculate Start ${fmt(rawStart)}, which violates ${constraintLabel} ${fmt(constraintDate)}.`);
      if (type === "MSO" && rawStart && compareDates(rawStart, constraintDate) !== 0) warnings.push(`Predecessors calculate Start ${fmt(rawStart)}, but ${constraintLabel} fixes Start at ${fmt(constraintDate)}.`);
      if (type === "FNET" && rawFinish && compareDates(rawFinish, constraintDate) < 0) warnings.push(`Predecessors calculate Finish ${fmt(rawFinish)}, but ${constraintLabel} prevents this task from finishing before ${fmt(constraintDate)}.`);
      if (type === "FNLT" && rawFinish && compareDates(rawFinish, constraintDate) > 0) warnings.push(`Predecessors calculate Finish ${fmt(rawFinish)}, which violates ${constraintLabel} ${fmt(constraintDate)}.`);
      if (type === "MFO" && rawFinish && compareDates(rawFinish, constraintDate) !== 0) warnings.push(`Predecessors calculate Finish ${fmt(rawFinish)}, but ${constraintLabel} fixes Finish at ${fmt(constraintDate)}.`);
    }

    if (type === "ALAP" && deadlineDate && rawFinish && compareDates(rawFinish, deadlineDate) < 0) {
      warnings.push(`As Late As Possible keeps Finish near the deadline (${fmt(deadlineDate)}) instead of the earlier dependency date ${fmt(rawFinish)}.`);
    }

    if (deadlineDate) {
      const drivenFinish = rawFinish || finalFinish;
      if (drivenFinish && compareDates(drivenFinish, deadlineDate) > 0) warnings.push(`Dependency path pushes Finish to ${fmt(drivenFinish)}, after the deadline ${fmt(deadlineDate)}.`);
      if (finalFinish && compareDates(finalFinish, deadlineDate) > 0) warnings.push(`Deadline warning: Finish ${fmt(finalFinish)} is after ${fmt(deadlineDate)}.`);
    }

    return uniqueWarnings(warnings);
  }

  function getDeadlineOnlyWarnings(task) {
    const deadlineDate = dateOnly(task?.deadline);
    const finishDate = dateOnly(task?.finish);
    if (deadlineDate && finishDate && compareDates(finishDate, deadlineDate) > 0) {
      return [`Deadline warning: Finish ${fmt(finishDate)} is after ${fmt(deadlineDate)}.`];
    }
    return [];
  }

  function decorateConstraintConflictRows() {
    const rows = document.querySelectorAll(".planner-row[data-row-index]");
    rows.forEach((row) => {
      const index = Number(row.dataset.rowIndex);
      const task = state.tasks?.[index];
      const conflicts = getDependencyConstraintWarnings(task);
      row.classList.toggle("has-constraint-conflict", conflicts.length > 0);
      const nameCell = row.querySelector(".task-name-cell");
      if (!nameCell) return;
      let chip = nameCell.querySelector(".constraint-explain-chip");
      if (!conflicts.length) {
        chip?.remove();
        return;
      }
      if (!chip) {
        chip = document.createElement("span");
        chip.className = "constraint-explain-chip";
        nameCell.appendChild(chip);
      }
      chip.textContent = "constraint";
      chip.title = conflicts.join(" ");
    });
  }

  function exposeConstraintSelfTest() {
    window.__constraintsDeadlinesV2SelfTest = () => {
      const savedState = JSON.parse(JSON.stringify(state));
      const savedSelected = selectedTaskIndex;
      const results = {};
      try {
        state.calendar = normalizeCalendar({ name: "Standard", workingDays: [1, 2, 3, 4, 5], exceptions: [], minutesPerDay: 480 });
        state.projectStart = "2026-07-06";
        state.tasks = [
          {
            uid: 1,
            id: 1,
            name: "Predecessor",
            notes: "",
            start: "2026-07-06",
            finish: "2026-07-07",
            durationMinutes: parseDurationInput("2d"),
            durationDays: 2,
            percent: 0,
            predecessors: [],
            links: [],
            outlineLevel: 1,
            isSummary: false,
            expanded: true,
            constraintType: "ASAP",
            constraintDate: "",
            deadline: "",
            assignments: [],
          },
          {
            uid: 2,
            id: 2,
            name: "SNET successor",
            notes: "",
            start: "2026-07-10",
            finish: "2026-07-13",
            durationMinutes: parseDurationInput("2d"),
            durationDays: 2,
            percent: 0,
            predecessors: [1],
            links: [{ id: 1, type: "FS", lagMinutes: 0 }],
            outlineLevel: 1,
            isSummary: false,
            expanded: true,
            constraintType: "SNET",
            constraintDate: "2026-07-10",
            deadline: "2026-07-09",
            assignments: [],
          },
        ];
        state.nextUid = 3;
        ensureDecorations();
        scheduleAllLinkedTasks({ render: false, silent: true });
        const task = state.tasks[1];
        const warnings = getTaskConstraintWarnings(task);
        results.snetStart = task.start;
        results.snetHeldAtOrAfterConstraint = compareDates(task.start, "2026-07-10") >= 0;
        results.showsDependencyConstraintWarning = warnings.some((warning) => /SNET|Start No Earlier Than|prevents.*moving before|Dependency 1FS/i.test(warning));
        results.showsDeadlineWarning = warnings.some((warning) => /deadline/i.test(warning));
        results.acceptancePassed = results.snetHeldAtOrAfterConstraint && results.showsDependencyConstraintWarning;
        results.warnings = warnings;
        results.version = CONSTRAINTS_DEADLINES_VERSION;
        return results;
      } finally {
        state = savedState;
        selectedTaskIndex = savedSelected;
        render();
      }
    };
  }
})();