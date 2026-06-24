(() => {
  const ASSIGNMENT_VERSION = "v0.24.0";
  const ASSIGNMENT_VERSION_NAME = "Assignment records + fixed units";
  const ASSIGNMENT_BUILD_DATE = "2026-06-24";
  const FIXED_UNIT_FIELDS = new Set(["resourceUid", "units", "workMinutes"]);
  let applyingFixedUnitDuration = false;
  let pendingManualDurationIndex = null;

  function bootAssignmentRecordsModule() {
    if (window.__assignmentRecordsFixedUnitsPatched) return;
    if (typeof state === "undefined" || typeof render !== "function" || typeof normalizeAssignment !== "function" || !window.__taskInformationPanelV3Installed) {
      setTimeout(bootAssignmentRecordsModule, 80);
      return;
    }

    window.__assignmentRecordsFixedUnitsPatched = true;
    injectAssignmentStyles();
    patchAssignmentRuntime();
    patchAssignmentInfoDom();
    ensureAssignmentRecordsForAll();
    syncAllAssignmentDrivenDurations();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootAssignmentRecordsModule, { once: true });
  } else {
    bootAssignmentRecordsModule();
  }

  function injectAssignmentStyles() {
    if (document.getElementById("assignmentRecordsFixedUnitsStyles")) return;
    const style = document.createElement("style");
    style.id = "assignmentRecordsFixedUnitsStyles";
    style.textContent = `
      .assignment-grid-heading,
      .assignment-row.assignment-record-row {
        grid-template-columns: minmax(150px, 1.35fr) 76px 92px 92px 104px 86px 76px;
      }
      .assignment-row.assignment-record-row { position: relative; }
      .assignment-row.assignment-record-row input,
      .assignment-row.assignment-record-row select { min-width: 0; }
      .assignment-cost { font-variant-numeric: tabular-nums; }
      .assignment-record-row::after {
        content: attr(data-assignment-meta);
        position: absolute;
        left: 10px;
        bottom: -16px;
        color: #667085;
        font-size: 9px;
        font-weight: 800;
        letter-spacing: 0.02em;
        pointer-events: none;
      }
      .assignment-fixed-units-note {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 8px;
        padding: 6px 9px;
        border: 1px solid #bfdbfe;
        border-radius: 999px;
        color: #1d4ed8;
        background: #eff6ff;
        font-size: 11px;
        font-weight: 850;
      }
      .assignment-test-chip {
        display: inline-flex;
        margin-left: 6px;
        padding: 1px 6px;
        border-radius: 999px;
        background: #e8f5ee;
        color: #107c41;
        border: 1px solid rgba(16, 124, 65, 0.20);
        font-size: 10px;
        font-weight: 850;
      }
    `;
    document.head.appendChild(style);
  }

  function patchAssignmentRuntime() {
    const baseNormalizeAssignment = normalizeAssignment;
    normalizeAssignment = function assignmentRecordsNormalizeAssignment(assignment = {}, index = 0) {
      const normalized = baseNormalizeAssignment(assignment, index);
      const explicitTaskUid = Number(assignment.taskUid ?? assignment.taskUID ?? assignment.task_uid ?? assignment.TaskUID ?? 0);
      normalized.taskUid = Number.isFinite(explicitTaskUid) && explicitTaskUid > 0 ? explicitTaskUid : Number(normalized.taskUid || 0);
      normalized.actualWorkMinutes = Math.min(normalizeDurationMinutes(normalized.actualWorkMinutes, 0), normalizeDurationMinutes(normalized.workMinutes, 0));
      const fallbackRemaining = Math.max(0, normalizeDurationMinutes(normalized.workMinutes, 0) - normalized.actualWorkMinutes);
      normalized.remainingWorkMinutes = Math.min(
        normalizeDurationMinutes(assignment.remainingWorkMinutes ?? assignment.remainingWork ?? assignment.remaining_work_minutes ?? normalized.remainingWorkMinutes, fallbackRemaining),
        normalizeDurationMinutes(normalized.workMinutes, 0)
      );
      normalized.cost = roundMoney(Number(assignment.cost ?? assignment.assignmentCost ?? assignment.assignment_cost ?? 0));
      return normalized;
    };

    const baseAssignmentCost = assignmentCost;
    assignmentCost = function assignmentRecordsCost(assignment) {
      const calculated = roundMoney(baseAssignmentCost(assignment));
      if (calculated) return calculated;
      return roundMoney(Number(assignment?.cost ?? assignment?.assignmentCost ?? 0));
    };

    const baseEnsureAssignmentUids = ensureAssignmentUids;
    ensureAssignmentUids = function assignmentRecordsEnsureAssignmentUids() {
      const result = baseEnsureAssignmentUids();
      stampAssignmentRecords();
      return result;
    };

    const baseSetTaskStartKeepDuration = setTaskStartKeepDuration;
    setTaskStartKeepDuration = function assignmentRecordsSetTaskStartKeepDuration(task, start, durationMinutes = task?.durationMinutes ?? getCalendar().minutesPerDay) {
      const result = baseSetTaskStartKeepDuration(task, start, durationMinutes);
      if (!applyingFixedUnitDuration) syncAssignmentWorkFromDuration(task);
      return result;
    };

    const baseSetTaskFinishKeepDuration = setTaskFinishKeepDuration;
    setTaskFinishKeepDuration = function assignmentRecordsSetTaskFinishKeepDuration(task, finish, durationMinutes = task?.durationMinutes ?? getCalendar().minutesPerDay) {
      const result = baseSetTaskFinishKeepDuration(task, finish, durationMinutes);
      if (!applyingFixedUnitDuration) syncAssignmentWorkFromDuration(task);
      return result;
    };

    const baseRenderTaskInfoAssignments = renderTaskInfoAssignments;
    renderTaskInfoAssignments = function assignmentRecordsRenderTaskInfoAssignments(task) {
      if (!els.tiAssignmentBody) return baseRenderTaskInfoAssignments(task);
      ensureResources();
      stampAssignmentRecords();
      const assignments = Array.isArray(task?.assignments) ? task.assignments : [];
      if (!state.resources.length) {
        els.tiAssignmentBody.innerHTML = `<div class="assignment-empty"><strong>No resources yet.</strong><span>Create resources on the Resource Sheet first, then assign them here.</span></div>`;
        return;
      }
      if (!assignments.length) {
        els.tiAssignmentBody.innerHTML = `<div class="assignment-empty"><strong>No assignments yet.</strong><span>Click Add assignment to create a real assignment record for this task.</span></div>`;
        return;
      }
      els.tiAssignmentBody.innerHTML = assignments.map((assignment, index) => {
        const resource = getResourceByUid(assignment.resourceUid);
        const meta = `A${assignment.uid || "?"} · T${task.uid || "?"} · R${assignment.resourceUid || "?"}`;
        return `
          <div class="assignment-row assignment-record-row" data-assignment-index="${index}" data-assignment-meta="${escapeXml(meta)}" title="Assignment UID ${escapeXml(assignment.uid || "?")} · Task UID ${escapeXml(task.uid || "?")} · Resource UID ${escapeXml(assignment.resourceUid || "?")}">
            <select data-assignment-field="resourceUid" data-assignment-index="${index}" aria-label="Assigned resource">${resourceOptions(assignment.resourceUid)}</select>
            <input data-assignment-field="units" data-assignment-index="${index}" type="text" value="${assignment.units}%" aria-label="Assignment units" />
            <input data-assignment-field="workMinutes" data-assignment-index="${index}" type="text" value="${escapeXml(formatWork(assignment.workMinutes))}" aria-label="Assignment work" />
            <input data-assignment-field="actualWorkMinutes" data-assignment-index="${index}" type="text" value="${escapeXml(formatWork(assignment.actualWorkMinutes))}" aria-label="Actual work" />
            <input data-assignment-field="remainingWorkMinutes" data-assignment-index="${index}" type="text" value="${escapeXml(formatWork(assignment.remainingWorkMinutes))}" aria-label="Remaining work" />
            <span class="assignment-cost" title="${escapeXml(resource ? `${resource.name} cost` : "Unassigned")}" aria-label="Assignment cost">${escapeXml(formatMoney(assignmentCost(assignment)))}</span>
            <button type="button" class="delete-btn" data-assignment-action="delete" data-assignment-index="${index}">Remove</button>
          </div>`;
      }).join("");
    };

    const baseRefreshTaskInfoPanel = refreshTaskInfoPanel;
    refreshTaskInfoPanel = function assignmentRecordsRefreshTaskInfoPanel(force = false) {
      const result = baseRefreshTaskInfoPanel(force);
      refreshAssignmentSummaryText(force);
      patchAssignmentInfoDom();
      return result;
    };

    const baseAddAssignmentToTask = addAssignmentToTask;
    addAssignmentToTask = function assignmentRecordsAddAssignmentToTask(index = taskInfoIndex) {
      const task = state.tasks?.[index];
      const beforeCount = task?.assignments?.length || 0;
      const result = baseAddAssignmentToTask(index);
      const updatedTask = state.tasks?.[index];
      const assignment = updatedTask?.assignments?.[beforeCount];
      if (updatedTask && assignment) {
        assignment.workMinutes = workFromDurationAndUnits(updatedTask.durationMinutes, assignment.units);
        assignment.actualWorkMinutes = Math.min(normalizeDurationMinutes(assignment.actualWorkMinutes, 0), assignment.workMinutes);
        assignment.remainingWorkMinutes = Math.max(0, assignment.workMinutes - assignment.actualWorkMinutes);
        stampAssignmentRecords(updatedTask);
        refreshTaskInfoPanel(true);
        renderResourceSheet();
        save();
      }
      return result;
    };

    const baseUpdateTaskAssignment = updateTaskAssignment;
    updateTaskAssignment = function assignmentRecordsUpdateTaskAssignment(taskIndex, assignmentIndex, field, value) {
      const task = state.tasks?.[taskIndex];
      const assignment = task?.assignments?.[assignmentIndex];
      if (!task || !assignment) return baseUpdateTaskAssignment(taskIndex, assignmentIndex, field, value);

      if (field === "remainingWorkMinutes") {
        const work = normalizeDurationMinutes(assignment.workMinutes, 0);
        assignment.remainingWorkMinutes = Math.min(parseWorkInput(value, assignment.remainingWorkMinutes || Math.max(0, work - assignment.actualWorkMinutes)), work);
        assignment.actualWorkMinutes = Math.min(normalizeDurationMinutes(assignment.actualWorkMinutes, 0), work);
        task.assignments[assignmentIndex] = normalizeAssignment(assignment, assignmentIndex);
        stampAssignmentRecords(task);
        refreshTaskInfoPanel(true);
        renderResourceSheet();
        renderValidation();
        save();
        return;
      }

      const result = baseUpdateTaskAssignment(taskIndex, assignmentIndex, field, value);
      const updatedTask = state.tasks?.[taskIndex];
      if (updatedTask && FIXED_UNIT_FIELDS.has(field)) {
        syncTaskDurationFromFixedUnits(updatedTask, "start");
      }
      stampAssignmentRecords(updatedTask);
      refreshTaskInfoPanel(true);
      renderResourceSheet();
      renderValidation();
      render();
      return result;
    };

    const baseDeleteTaskAssignment = deleteTaskAssignment;
    deleteTaskAssignment = function assignmentRecordsDeleteTaskAssignment(taskIndex, assignmentIndex) {
      const result = baseDeleteTaskAssignment(taskIndex, assignmentIndex);
      const task = state.tasks?.[taskIndex];
      stampAssignmentRecords(task);
      render();
      return result;
    };

    const baseImportProjectXml = importProjectXml;
    importProjectXml = function assignmentRecordsImportProjectXml(text) {
      const result = baseImportProjectXml(text);
      ensureAssignmentRecordsForAll();
      syncAllAssignmentDrivenDurations();
      render();
      return result;
    };

    const baseBuildProjectXml = buildProjectXml;
    buildProjectXml = function assignmentRecordsBuildProjectXml() {
      ensureAssignmentRecordsForAll();
      const xmlText = baseBuildProjectXml();
      return addAssignmentRecordFieldsToProjectXml(xmlText);
    };

    const baseValidateProject = validateProject;
    validateProject = function assignmentRecordsValidateProject() {
      const issues = baseValidateProject();
      const extra = [];
      (state.tasks || []).forEach((task) => {
        (task.assignments || []).forEach((assignment) => {
          const label = `Task ${task.id} assignment ${assignment.uid || "?"}`;
          const work = normalizeDurationMinutes(assignment.workMinutes, 0);
          const actual = normalizeDurationMinutes(assignment.actualWorkMinutes, 0);
          const remaining = normalizeDurationMinutes(assignment.remainingWorkMinutes, 0);
          if (!Number(task.uid)) extra.push(`Task ${task.id} is missing a task UID for assignment round-trip.`);
          if (!Number(assignment.uid)) extra.push(`${label} is missing an assignment UID.`);
          if (!Number(assignment.resourceUid)) extra.push(`${label} is missing a resource UID.`);
          if (work > 0 && normalizeAssignmentUnits(assignment.units) <= 0) extra.push(`${label} has work but 0% units.`);
          if (actual > work) extra.push(`${label} has actual work greater than total work.`);
          if (remaining > work) extra.push(`${label} has remaining work greater than total work.`);
        });
      });
      return [...new Set([...issues, ...extra])];
    };

    const baseExportCsv = exportCsv;
    exportCsv = function assignmentRecordsExportCsv() {
      exportAssignmentRecordsCsv(baseExportCsv);
    };

    const baseRender = render;
    render = function assignmentRecordsRender() {
      const result = baseRender();
      patchAssignmentInfoDom();
      refreshAssignmentSummaryText(true);
      updateAssignmentVersionLabels();
      return result;
    };

    installManualDurationCapture();
  }

  function patchAssignmentInfoDom() {
    const heading = document.querySelector(".assignment-grid-heading");
    if (heading && heading.dataset.assignmentRecords !== "1") {
      heading.dataset.assignmentRecords = "1";
      heading.innerHTML = `<span>Resource</span><span>Units</span><span>Work</span><span>Actual</span><span>Remaining</span><span>Cost</span><span>Action</span>`;
    }
    const help = document.querySelector('[data-task-info-page="resources"] .task-info-help');
    if (help) {
      help.innerHTML = `Assignments are real records: assignment UID, task UID, resource UID, units, work, actual work, remaining work, and calculated cost. Fixed-units math is active: <strong>Work ÷ Units = Duration</strong>. <span class="assignment-test-chip">40h @ 50% = 10d</span>`;
    }
    const page = document.querySelector('[data-task-info-page="resources"]');
    if (page && !page.querySelector(".assignment-fixed-units-note")) {
      const note = document.createElement("div");
      note.className = "assignment-fixed-units-note";
      note.textContent = "Fixed Units: editing assignment Work or Units recalculates task Duration.";
      page.querySelector(".assignment-summary-bar")?.insertAdjacentElement("afterend", note);
    }
  }

  function refreshAssignmentSummaryText(force = false) {
    if (!els.tiAssignmentSummary) return;
    if (!Number.isInteger(taskInfoIndex) || taskInfoIndex < 0 || taskInfoIndex >= state.tasks.length) return;
    if (els.taskInfoModal?.hidden && !force) return;
    const task = state.tasks[taskInfoIndex];
    const summary = summarizeTaskAssignments(task);
    if (!summary.count) {
      els.tiAssignmentSummary.textContent = "No resources assigned yet.";
      return;
    }
    els.tiAssignmentSummary.textContent = `${summary.count} assignment${summary.count === 1 ? "" : "s"} · ${formatWork(summary.totalWork)} work · ${formatWork(summary.actualWork)} actual · ${formatWork(summary.remainingWork)} remaining · ${formatMoney(summary.totalCost)} cost`;
  }

  function ensureAssignmentRecordsForAll() {
    ensureResources();
    if (!Array.isArray(state.tasks)) return;
    state.tasks.forEach((task) => stampAssignmentRecords(task));
    ensureAssignmentUids();
    stampAssignmentRecords();
  }

  function stampAssignmentRecords(targetTask = null) {
    const tasks = targetTask ? [targetTask] : (state.tasks || []);
    tasks.forEach((task) => {
      task.assignments = Array.isArray(task.assignments) ? task.assignments.map((assignment, index) => normalizeAssignment(assignment, index)).filter((assignment) => assignment.resourceUid > 0) : [];
      task.assignments.forEach((assignment) => {
        assignment.taskUid = Number(task.uid) || 0;
        const work = normalizeDurationMinutes(assignment.workMinutes, 0);
        assignment.actualWorkMinutes = Math.min(normalizeDurationMinutes(assignment.actualWorkMinutes, 0), work);
        assignment.remainingWorkMinutes = Math.min(normalizeDurationMinutes(assignment.remainingWorkMinutes, Math.max(0, work - assignment.actualWorkMinutes)), work);
        if (assignment.actualWorkMinutes + assignment.remainingWorkMinutes > work) {
          assignment.remainingWorkMinutes = Math.max(0, work - assignment.actualWorkMinutes);
        }
        assignment.cost = assignmentCost(assignment);
      });
    });
  }

  function isWorkResourceAssignment(assignment) {
    const resource = getResourceByUid(assignment?.resourceUid);
    return !resource || resource.type === "Work";
  }

  function workFromDurationAndUnits(durationMinutes, units) {
    const duration = normalizeDurationMinutes(durationMinutes, 0);
    const normalizedUnits = normalizeAssignmentUnits(units);
    if (!duration || !normalizedUnits) return 0;
    return Math.round(duration * normalizedUnits / 100);
  }

  function durationFromWorkAndUnits(workMinutes, units) {
    const work = normalizeDurationMinutes(workMinutes, 0);
    const normalizedUnits = normalizeAssignmentUnits(units);
    if (!work || !normalizedUnits) return 0;
    return Math.ceil(work / (normalizedUnits / 100));
  }

  function getFixedUnitsDurationMinutes(task) {
    if (!task || isSummaryIndex(state.tasks.indexOf(task))) return null;
    const durations = (task.assignments || [])
      .filter(isWorkResourceAssignment)
      .map((assignment) => durationFromWorkAndUnits(assignment.workMinutes, assignment.units))
      .filter((minutes) => minutes > 0);
    return durations.length ? Math.max(...durations) : null;
  }

  function syncTaskDurationFromFixedUnits(task, anchor = "start") {
    if (!task) return false;
    const nextDuration = getFixedUnitsDurationMinutes(task);
    if (nextDuration === null) return false;
    const currentDuration = normalizeDurationMinutes(task.durationMinutes, workingSpanMinutes(task.start, task.finish));
    if (currentDuration === nextDuration) return false;
    applyingFixedUnitDuration = true;
    try {
      if (anchor === "finish") setTaskFinishKeepDuration(task, task.finish || task.start || state.projectStart || today, nextDuration);
      else setTaskStartKeepDuration(task, task.start || state.projectStart || today, nextDuration);
    } finally {
      applyingFixedUnitDuration = false;
    }
    stampAssignmentRecords(task);
    return true;
  }

  function syncAllAssignmentDrivenDurations() {
    let changed = false;
    (state.tasks || []).forEach((task) => {
      if (syncTaskDurationFromFixedUnits(task, "start")) changed = true;
    });
    return changed;
  }

  function syncAssignmentWorkFromDuration(task) {
    if (!task || !Array.isArray(task.assignments) || !task.assignments.length) return false;
    const duration = normalizeDurationMinutes(task.durationMinutes, workingSpanMinutes(task.start, task.finish));
    let changed = false;
    task.assignments.forEach((assignment) => {
      if (!isWorkResourceAssignment(assignment)) return;
      const nextWork = workFromDurationAndUnits(duration, assignment.units);
      if (normalizeDurationMinutes(assignment.workMinutes, 0) === nextWork) return;
      assignment.workMinutes = nextWork;
      assignment.actualWorkMinutes = Math.min(normalizeDurationMinutes(assignment.actualWorkMinutes, 0), nextWork);
      assignment.remainingWorkMinutes = Math.max(0, nextWork - assignment.actualWorkMinutes);
      changed = true;
    });
    if (changed) stampAssignmentRecords(task);
    return changed;
  }

  function installManualDurationCapture() {
    function rememberDrag() {
      if (typeof activeBarDrag !== "object" || !activeBarDrag) return;
      if (activeBarDrag.mode === "resize-start" || activeBarDrag.mode === "resize-finish") pendingManualDurationIndex = activeBarDrag.index;
    }
    function reconcileDrag() {
      if (pendingManualDurationIndex === null) return;
      const index = pendingManualDurationIndex;
      pendingManualDurationIndex = null;
      setTimeout(() => {
        const task = state.tasks?.[index];
        if (task && syncAssignmentWorkFromDuration(task)) render();
      }, 0);
    }
    window.addEventListener("pointerup", rememberDrag, true);
    window.addEventListener("pointercancel", rememberDrag, true);
    window.addEventListener("pointerup", reconcileDrag);
    window.addEventListener("pointercancel", reconcileDrag);
  }

  function addAssignmentRecordFieldsToProjectXml(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.getElementsByTagName("parsererror")[0]) return xmlText;
    const taskByUid = new Map((state.tasks || []).map((task) => [Number(task.uid), task]));
    const assignmentByUid = new Map();
    (state.tasks || []).forEach((task) => {
      (task.assignments || []).forEach((assignment) => assignmentByUid.set(Number(assignment.uid), { task, assignment }));
    });

    [...doc.getElementsByTagName("Task")].forEach((taskNode) => {
      const uid = Number(childText(taskNode, "UID"));
      const task = taskByUid.get(uid);
      if (!task) return;
      const summary = summarizeTaskAssignments(task);
      if (!summary.count) return;
      setXmlChild(doc, taskNode, "Work", minutesToProjectDuration(summary.totalWork), "Duration");
      setXmlChild(doc, taskNode, "ActualWork", minutesToProjectDuration(summary.actualWork), "Work");
      setXmlChild(doc, taskNode, "RemainingWork", minutesToProjectDuration(summary.remainingWork), "ActualWork");
      setXmlChild(doc, taskNode, "Cost", String(roundMoney(summary.totalCost)), "RemainingWork");
    });

    [...doc.getElementsByTagName("Assignment")].forEach((assignmentNode) => {
      const uid = Number(childText(assignmentNode, "UID"));
      const record = assignmentByUid.get(uid);
      if (!record) return;
      const { task, assignment } = record;
      setXmlChild(doc, assignmentNode, "TaskUID", String(task.uid), "UID");
      setXmlChild(doc, assignmentNode, "ResourceUID", String(assignment.resourceUid), "TaskUID");
      setXmlChild(doc, assignmentNode, "Units", (normalizeAssignmentUnits(assignment.units) / 100).toFixed(2), "ResourceUID");
      setXmlChild(doc, assignmentNode, "Work", minutesToProjectDuration(assignment.workMinutes), "Units");
      setXmlChild(doc, assignmentNode, "ActualWork", minutesToProjectDuration(assignment.actualWorkMinutes), "Work");
      setXmlChild(doc, assignmentNode, "RemainingWork", minutesToProjectDuration(assignment.remainingWorkMinutes), "ActualWork");
      setXmlChild(doc, assignmentNode, "Cost", String(roundMoney(assignmentCost(assignment))), "RemainingWork");
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

  function exportAssignmentRecordsCsv(fallbackExportCsv) {
    try {
      ensureDecorations();
      rollupSummaryTasks();
      rollupBaselineSummaryTasks();
      ensureAssignmentRecordsForAll();
      const rows = [];
      rows.push(["Tasks"]);
      rows.push(["ID", "TaskUID", "WBS", "Task Name", "Start", "Finish", "Duration", "% Complete", "Resources", "Work", "Actual Work", "Remaining Work", "Cost", "Predecessors", "Notes"]);
      (state.tasks || []).forEach((task) => {
        const summary = summarizeTaskAssignments(task);
        rows.push([
          task.id,
          task.uid,
          task.wbs,
          task.name,
          task.start,
          task.finish,
          formatDuration(task.durationMinutes),
          `${normalizePercent(task.percent)}%`,
          formatAssignmentResourceNames(task),
          formatWork(summary.totalWork),
          formatWork(summary.actualWork),
          formatWork(summary.remainingWork),
          formatMoney(summary.totalCost),
          formatLinks(task.links || []),
          task.notes || "",
        ]);
      });
      rows.push([]);
      rows.push(["Assignments"]);
      rows.push(["AssignmentUID", "TaskUID", "TaskID", "TaskName", "ResourceUID", "ResourceName", "Units", "Work", "ActualWork", "RemainingWork", "Cost"]);
      (state.tasks || []).forEach((task) => {
        (task.assignments || []).forEach((assignment) => {
          const resource = getResourceByUid(assignment.resourceUid);
          rows.push([
            assignment.uid,
            task.uid,
            task.id,
            task.name,
            assignment.resourceUid,
            resource?.name || "Missing resource",
            `${normalizeAssignmentUnits(assignment.units)}%`,
            formatWork(assignment.workMinutes),
            formatWork(assignment.actualWorkMinutes),
            formatWork(assignment.remainingWorkMinutes),
            formatMoney(assignmentCost(assignment)),
          ]);
        });
      });
      rows.push([]);
      rows.push(["Resources"]);
      rows.push(["ResourceUID", "ID", "Name", "Type", "Initials", "MaxUnits", "StandardRate", "CostPerUse", "AssignedTasks", "AssignedWork", "AssignedCost"]);
      ensureResources();
      (state.resources || []).forEach((resource) => {
        const usage = getResourceUsageSummary(resource.uid);
        rows.push([resource.uid, resource.id, resource.name, resource.type, resource.initials, `${resource.maxUnits}%`, resource.standardRate, resource.costPerUse, usage.count, formatWork(usage.workMinutes), formatMoney(usage.cost)]);
      });
      const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
      const fileBase = typeof safeFileName === "function" ? safeFileName(state.projectName) : String(state.projectName || "project").replace(/[^a-z0-9-_]+/gi, "-");
      downloadText(csv, `${fileBase}-assignments.csv`, "text/csv");
    } catch (error) {
      console.warn("Assignment CSV export failed; using previous CSV exporter.", error);
      fallbackExportCsv?.();
    }
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function roundMoney(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  function updateAssignmentVersionLabels() {
    const text = `${ASSIGNMENT_VERSION} · ${ASSIGNMENT_VERSION_NAME}`;
    const ribbon = document.getElementById("ribbonVersionText");
    const badge = document.getElementById("appVersionBadge");
    const footer = document.getElementById("appVersionFooter");
    const compat = document.getElementById("compatChip");
    if (ribbon) ribbon.textContent = `${text} · fixed-units scheduling`;
    if (badge) {
      badge.textContent = text;
      badge.title = `Build ${ASSIGNMENT_BUILD_DATE}`;
    }
    if (footer) footer.textContent = `${text} · Build ${ASSIGNMENT_BUILD_DATE}`;
    if (compat && !compat.classList.contains("has-issues")) compat.lastChild.textContent = " XML + assignment records ready";
  }
})();
