(() => {
  const VERSION = "v0.34.0";
  const LABELS = { "fixed-units": "Fixed Units", "fixed-duration": "Fixed Duration", "fixed-work": "Fixed Work" };
  const MSP = { "fixed-units": 0, "fixed-duration": 1, "fixed-work": 2 };
  const FROM_MSP = { 0: "fixed-units", 1: "fixed-duration", 2: "fixed-work" };
  let tries = 0;
  let calculating = false;

  function boot() {
    if (window.__taskTypesEffortDrivenLoaded) return;
    if (!ready()) {
      if (++tries < 120) setTimeout(boot, 75);
      return;
    }
    window.__taskTypesEffortDrivenLoaded = true;
    styles();
    dom();
    patch();
    normalizeAll();
    selfTest();
    render();
  }

  function ready() {
    return typeof state !== "undefined" && typeof render === "function" && typeof normalizeDurationMinutes === "function" &&
      typeof parseWorkInput === "function" && typeof formatWork === "function" && typeof normalizeAssignment === "function" &&
      typeof setTaskStartKeepDuration === "function" && typeof getCalendar === "function" && window.__durationLogicV2Loaded &&
      window.__taskInformationPanelV3Installed && window.__assignmentRecordsFixedUnitsPatched;
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, { once: true }) : boot();

  function styles() {
    if (document.getElementById("taskTypesEffortDrivenStyles")) return;
    const s = document.createElement("style");
    s.id = "taskTypesEffortDrivenStyles";
    s.textContent = `.task-type-panel{display:grid;gap:10px;margin-top:12px;padding:12px;border:1px solid #d9e2ee;border-radius:14px;background:#f8fafc}.task-type-panel .checkbox-line{align-self:end;min-height:40px;margin:0}.task-type-formula{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0;color:#344054}.task-type-chip,.task-type-badge,.task-type-acceptance{display:inline-flex;align-items:center;border-radius:999px;font-size:10px;font-weight:850;white-space:nowrap}.task-type-chip{gap:5px;padding:2px 8px;border:1px solid #bfdbfe;background:#eff6ff;color:#1d4ed8}.task-type-badge{margin-left:6px;padding:1px 6px;border:1px solid rgba(24,90,157,.24);background:#eef6ff;color:#185a9d}.task-type-acceptance{margin-left:6px;padding:1px 6px;border:1px solid rgba(16,124,65,.20);background:#e8f5ee;color:#107c41}`;
    document.head.appendChild(s);
  }

  function dom() {
    const page = document.querySelector('[data-task-info-page="advanced"]');
    if (!page) return;
    if (!document.getElementById("tiTaskType")) {
      page.insertAdjacentHTML("beforeend", `<div class="task-type-panel"><div class="task-info-grid"><label>Task type<select id="tiTaskType">${opts("fixed-units")}</select></label><label>Work<input id="tiTaskWork" placeholder="40h, 5d, 2400m" type="text"/></label><label class="checkbox-line"><input id="tiEffortDriven" type="checkbox"/>Effort-driven</label></div><p class="task-info-help task-type-formula" id="tiTaskTypeMath"><span class="task-type-chip">Duration = Work ÷ Units</span><span>Fixed Work keeps Work fixed as resources change.</span></p></div>`);
      ["tiTaskType", "tiTaskWork", "tiEffortDriven"].forEach((id) => document.getElementById(id)?.addEventListener("change", preview));
      document.getElementById("tiTaskWork")?.addEventListener("input", preview);
    }
    if (typeof els === "object") {
      els.tiTaskType = document.getElementById("tiTaskType");
      els.tiTaskWork = document.getElementById("tiTaskWork");
      els.tiEffortDriven = document.getElementById("tiEffortDriven");
      els.tiTaskTypeMath = document.getElementById("tiTaskTypeMath");
    }
  }

  function patch() {
    const oldFormatDuration = formatDuration;
    formatDuration = (mins) => {
      const m = dur(mins, getCalendar().minutesPerDay);
      const day = Math.max(1, getCalendar().minutesPerDay);
      return m && m >= day && m % day ? `${round(m / day)}d` : oldFormatDuration(m);
    };

    const oldEnsure = ensureDecorations;
    ensureDecorations = () => { oldEnsure(); normalizeAll(); };

    const oldSetStart = setTaskStartKeepDuration;
    setTaskStartKeepDuration = (task, start, duration = task?.durationMinutes ?? getCalendar().minutesPerDay) => {
      const r = oldSetStart(task, start, duration);
      if (!calculating) durationEdit(task);
      return r;
    };

    const oldSetFinish = setTaskFinishKeepDuration;
    setTaskFinishKeepDuration = (task, finish, duration = task?.durationMinutes ?? getCalendar().minutesPerDay) => {
      const r = oldSetFinish(task, finish, duration);
      if (!calculating) durationEdit(task);
      return r;
    };

    const oldAdd = addAssignmentToTask;
    addAssignmentToTask = (index = taskInfoIndex) => {
      const task = state.tasks?.[index];
      const before = task ? work(task) : 0;
      const r = oldAdd(index);
      const updated = state.tasks?.[index];
      if (updated) {
        if (type(updated) === "fixed-work" && effort(updated, true)) updated.workMinutes = before || work(updated);
        calculate(updated, "resource-change");
        render();
      }
      return r;
    };

    const oldUpdateAssignment = updateTaskAssignment;
    updateTaskAssignment = (taskIndex, assignmentIndex, field, value) => {
      const task = state.tasks?.[taskIndex];
      const before = task ? work(task) : 0;
      const r = oldUpdateAssignment(taskIndex, assignmentIndex, field, value);
      const updated = state.tasks?.[taskIndex];
      if (!updated) return r;
      if (field === "workMinutes") updated.workMinutes = assignmentWork(updated) || before;
      if (["resourceUid", "units"].includes(field) && type(updated) === "fixed-work" && effort(updated, true)) updated.workMinutes = before || work(updated);
      if (["resourceUid", "units", "workMinutes"].includes(field)) calculate(updated, field === "workMinutes" ? "work-edit" : "resource-change");
      render();
      return r;
    };

    const oldDelete = deleteTaskAssignment;
    deleteTaskAssignment = (taskIndex, assignmentIndex) => {
      const task = state.tasks?.[taskIndex];
      const before = task ? work(task) : 0;
      const r = oldDelete(taskIndex, assignmentIndex);
      const updated = state.tasks?.[taskIndex];
      if (updated) {
        if (type(updated) === "fixed-work" && effort(updated, true)) updated.workMinutes = before;
        calculate(updated, "resource-change");
        render();
      }
      return r;
    };

    const oldUpdateTask = updateTask;
    updateTask = (index, field, value) => {
      const r = oldUpdateTask(index, field, value);
      if (["start", "finish", "duration"].includes(field)) {
        const task = state.tasks?.[index];
        if (task) calculate(task, "schedule-edit");
        render();
      }
      return r;
    };

    const oldApply = applyTaskInfoForm;
    applyTaskInfoForm = () => {
      const index = taskInfoIndex;
      const task = state.tasks?.[index];
      const values = task ? formValues(task) : null;
      if (task && values) write(task, values);
      const r = oldApply();
      const updated = state.tasks?.[index];
      if (updated && values) {
        write(updated, values);
        calculate(updated, "info", values.workMinutes);
        render();
      }
      return r;
    };

    const oldRefresh = refreshTaskInfoPanel;
    refreshTaskInfoPanel = (force = false) => { dom(); const r = oldRefresh(force); fill(); badges(); return r; };

    const oldBuild = buildProjectXml;
    buildProjectXml = () => xmlOut(oldBuild());

    const oldImport = importProjectXml;
    importProjectXml = (text) => {
      const meta = xmlIn(text);
      const r = oldImport(text);
      (state.tasks || []).forEach((task) => {
        const item = meta.get(Number(task.uid));
        if (!item) return;
        task.taskType = item.taskType;
        task.effortDriven = item.effortDriven;
        task.workMinutes = item.workMinutes || inferWork(task);
        calculate(task, "import", task.workMinutes);
      });
      render();
      return r;
    };

    const oldRender = render;
    render = () => { const r = oldRender(); dom(); fill(); badges(); version(); return r; };
  }

  function normalizeAll() {
    (state.tasks || []).forEach((task) => {
      task.taskType = type(task);
      task.effortDriven = effort(task, task.taskType === "fixed-work");
      task.workMinutes = dur(task.workMinutes, inferWork(task));
    });
  }

  function calculate(task, reason, explicitWork = null) {
    if (!task || calculating) return false;
    const index = state.tasks?.indexOf(task) ?? -1;
    if (index >= 0 && typeof isSummaryIndex === "function" && isSummaryIndex(index)) return false;
    task.taskType = type(task);
    task.effortDriven = effort(task, task.taskType === "fixed-work");
    if (explicitWork !== null && explicitWork !== undefined) task.workMinutes = dur(explicitWork, work(task));
    calculating = true;
    try {
      const u = Math.max(units(task), 100);
      if (task.taskType === "fixed-work" && task.effortDriven) {
        const w = work(task);
        task.workMinutes = w;
        distribute(task, w, u);
        setTaskStartKeepDuration(task, task.start || state.projectStart || today, w ? Math.ceil(w / (u / 100)) : 0);
      } else if (task.taskType === "fixed-units" && assignmentWork(task) && ["resource-change", "work-edit"].includes(reason)) {
        task.workMinutes = assignmentWork(task);
        setTaskStartKeepDuration(task, task.start || state.projectStart || today, Math.ceil(task.workMinutes / (u / 100)));
      } else {
        durationToWork(task);
      }
      normalizeAssignments(task);
      return true;
    } finally {
      calculating = false;
    }
  }

  function durationEdit(task) {
    if (!task || calculating) return;
    if (type(task) === "fixed-work" && effort(task, true)) {
      const w = work(task), d = dur(task.durationMinutes, workingSpanMinutes(task.start, task.finish));
      const assignees = assignments(task);
      if (!w || !d || !assignees.length) return;
      const need = Math.max(1, Math.round((w / d) * 100));
      const old = units(task) || assignees.length * 100;
      assignees.forEach((a) => a.units = Math.max(1, Math.round(need * normalizeAssignmentUnits(a.units) / old)));
      distribute(task, w, need);
    } else durationToWork(task);
    normalizeAssignments(task);
  }

  function durationToWork(task) {
    const d = dur(task.durationMinutes, workingSpanMinutes(task.start, task.finish));
    let total = 0;
    assignments(task).forEach((a) => {
      const w = Math.round(d * normalizeAssignmentUnits(a.units) / 100);
      setWork(a, w);
      total += w;
    });
    task.workMinutes = total || d;
  }

  function distribute(task, totalWork, totalUnits) {
    const assignees = assignments(task);
    if (!assignees.length) return;
    let used = 0;
    assignees.forEach((a, i) => {
      const share = i === assignees.length - 1 ? Math.max(0, totalWork - used) : Math.round(totalWork * normalizeAssignmentUnits(a.units) / Math.max(1, totalUnits));
      used += share;
      setWork(a, share);
    });
  }

  function setWork(a, w) {
    a.workMinutes = dur(w, 0);
    a.actualWorkMinutes = Math.min(dur(a.actualWorkMinutes, 0), a.workMinutes);
    a.remainingWorkMinutes = Math.max(0, a.workMinutes - a.actualWorkMinutes);
    if (typeof assignmentCost === "function") a.cost = assignmentCost(a);
  }

  function normalizeAssignments(task) {
    if (!Array.isArray(task.assignments)) return;
    task.assignments = task.assignments.map((a, i) => normalizeAssignment(a, i)).filter((a) => Number(a.resourceUid) > 0);
  }

  function type(taskOrValue) {
    const v = typeof taskOrValue === "object" ? taskOrValue.taskType ?? taskOrValue.type ?? taskOrValue.task_type : taskOrValue;
    if (typeof v === "number" && FROM_MSP[v]) return FROM_MSP[v];
    const c = String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (["fixedduration", "duration", "1"].includes(c)) return "fixed-duration";
    if (["fixedwork", "work", "2"].includes(c)) return "fixed-work";
    return "fixed-units";
  }

  function effort(taskOrValue, fallback = false) {
    const v = typeof taskOrValue === "object" ? taskOrValue.effortDriven ?? taskOrValue.effort_driven : taskOrValue;
    if (typeof v === "boolean") return v;
    if (v === undefined || v === null || v === "") return Boolean(fallback);
    const text = String(v).toLowerCase();
    if (["1", "true", "yes", "on"].includes(text)) return true;
    if (["0", "false", "no", "off"].includes(text)) return false;
    return Boolean(fallback);
  }

  function dur(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.round(n) : normalizeDurationMinutes(fallback, 0);
  }

  function work(task) { return dur(task?.workMinutes, inferWork(task)); }
  function inferWork(task) { const aw = assignmentWork(task); return aw || Math.round(dur(task?.durationMinutes, workingSpanMinutes(task?.start, task?.finish)) * Math.max(units(task), 100) / 100); }
  function assignments(task) { return (task?.assignments || []).filter((a) => { const r = typeof getResourceByUid === "function" ? getResourceByUid(a.resourceUid) : null; return !r || r.type === "Work"; }); }
  function units(task) { return assignments(task).reduce((sum, a) => sum + normalizeAssignmentUnits(a.units), 0); }
  function assignmentWork(task) { return (task?.assignments || []).reduce((sum, a) => sum + dur(a.workMinutes, 0), 0); }
  function round(n) { return String(Math.round(Number(n) * 100) / 100).replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1"); }
  function safe(v) { return typeof escapeXml === "function" ? escapeXml(v) : String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

  function formValues(task) {
    return {
      taskType: type(document.getElementById("tiTaskType")?.value || task.taskType),
      effortDriven: document.getElementById("tiEffortDriven")?.checked ?? effort(task, type(task) === "fixed-work"),
      workMinutes: parseWorkInput(document.getElementById("tiTaskWork")?.value || formatWork(work(task)), work(task)),
    };
  }
  function write(task, v) { task.taskType = v.taskType; task.effortDriven = Boolean(v.effortDriven); task.workMinutes = dur(v.workMinutes, work(task)); }
  function opts(selected) { const t = type(selected); return Object.entries(LABELS).map(([k, label]) => `<option value="${k}"${k === t ? " selected" : ""}>${label}</option>`).join(""); }

  function fill() {
    if (!Number.isInteger(taskInfoIndex) || !state.tasks?.[taskInfoIndex]) return;
    dom();
    const task = state.tasks[taskInfoIndex];
    if (els.tiTaskType) els.tiTaskType.innerHTML = opts(task.taskType);
    if (els.tiTaskWork) els.tiTaskWork.value = formatWork(work(task));
    if (els.tiEffortDriven) els.tiEffortDriven.checked = effort(task, type(task) === "fixed-work");
    preview();
  }

  function preview() {
    const el = document.getElementById("tiTaskTypeMath");
    if (!el) return;
    const task = Number.isInteger(taskInfoIndex) ? state.tasks?.[taskInfoIndex] : null;
    const t = type(document.getElementById("tiTaskType")?.value || task?.taskType);
    const ed = document.getElementById("tiEffortDriven")?.checked ?? effort(task, t === "fixed-work");
    const w = document.getElementById("tiTaskWork")?.value || (task ? formatWork(work(task)) : "0h");
    const u = round((task ? Math.max(units(task), 100) : 100) / 100);
    const d = task ? formatDuration(dur(task.durationMinutes, 0)) : "0d";
    el.innerHTML = `<span class="task-type-chip">${safe(LABELS[t])}${ed ? " · effort-driven" : ""}</span><strong>Duration = Work ÷ Units</strong><span>${safe(w)} ÷ ${u} = ${safe(d)}</span><span class="task-type-acceptance">40h + two 100% resources → 2.5d</span>`;
  }

  function badges() {
    document.querySelectorAll('.planner-row[data-row-index]').forEach((row) => {
      const task = state.tasks?.[Number(row.dataset.rowIndex)], cell = row.querySelector(".task-name-cell");
      if (!task || !cell) return;
      let b = cell.querySelector(".task-type-badge");
      if (!b) { b = document.createElement("span"); b.className = "task-type-badge"; cell.appendChild(b); }
      const t = type(task), ed = effort(task, t === "fixed-work");
      b.textContent = `${LABELS[t].replace("Fixed ", "F")}${ed ? " ED" : ""}`;
      b.title = `${LABELS[t]}${ed ? " · Effort-driven" : ""} · Work ${formatWork(work(task))}`;
    });
  }

  function xmlOut(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.getElementsByTagName("parsererror")[0]) return xmlText;
    setXml(doc, doc.documentElement, "DefaultTaskType", "0", "DaysPerMonth");
    setXml(doc, doc.documentElement, "NewTasksEffortDriven", "0", "MultipleCriticalPaths");
    const byUid = new Map((state.tasks || []).map((task) => [Number(task.uid), task]));
    [...doc.getElementsByTagName("Task")].forEach((node) => {
      const task = byUid.get(Number(childText(node, "UID")));
      if (!task) return;
      const t = type(task);
      setXml(doc, node, "Type", String(MSP[t]), "Notes");
      setXml(doc, node, "EffortDriven", effort(task, t === "fixed-work") ? "1" : "0", "Type");
      setXml(doc, node, "Work", minutesToProjectDuration(work(task)), "DurationFormat");
    });
    return new XMLSerializer().serializeToString(doc);
  }

  function xmlIn(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml"), map = new Map();
    if (doc.getElementsByTagName("parsererror")[0]) return map;
    [...doc.getElementsByTagName("Task")].forEach((node) => {
      const uid = Number(childText(node, "UID"));
      if (uid) map.set(uid, { taskType: type(childText(node, "Type")), effortDriven: effort(childText(node, "EffortDriven"), false), workMinutes: durationToMinutes(childText(node, "Work") || "PT0H0M0S") });
    });
    return map;
  }

  function setXml(doc, parent, name, value, afterName = "") {
    let node = [...parent.children].find((child) => child.localName === name);
    if (!node) {
      node = doc.createElementNS(typeof MS_PROJECT_NS !== "undefined" ? MS_PROJECT_NS : parent.namespaceURI, name);
      const after = afterName ? [...parent.children].find((child) => child.localName === afterName) : null;
      after?.nextSibling ? parent.insertBefore(node, after.nextSibling) : parent.appendChild(node);
    }
    node.textContent = value;
  }

  function version() {
    const label = `${VERSION} · Task types + effort-driven`;
    const ribbon = document.getElementById("ribbonVersionText"), badge = document.getElementById("appVersionBadge"), footer = document.getElementById("appVersionFooter"), compat = document.getElementById("compatChip");
    if (ribbon) ribbon.textContent = `${label} · Fixed Work ready`;
    if (badge) { badge.textContent = label; badge.title = `Build 2026-06-24`; }
    if (footer) footer.textContent = `${label} · Build 2026-06-24`;
    if (compat && !compat.classList.contains("has-issues")) compat.lastChild.textContent = " Task types + effort-driven ready";
  }

  function selfTest() {
    window.__taskTypesEffortDrivenSelfTest = () => {
      const saved = JSON.parse(JSON.stringify(state)), selected = selectedTaskIndex, info = taskInfoIndex;
      try {
        state.calendar = normalizeCalendar({ name: "Standard", workingDays: [1, 2, 3, 4, 5], exceptions: [], minutesPerDay: 480 });
        state.resources = [normalizeResource({ uid: 1, name: "Dev A", type: "Work" }, 0), normalizeResource({ uid: 2, name: "Dev B", type: "Work" }, 1)];
        state.tasks = [{ uid: 1, id: 1, name: "Fixed Work acceptance", start: "2026-07-06", finish: "2026-07-10", durationMinutes: 2400, durationDays: 5, percent: 0, predecessors: [], links: [], outlineLevel: 1, isSummary: false, expanded: true, constraintType: "ASAP", constraintDate: "", deadline: "", assignments: [normalizeAssignment({ uid: 1, resourceUid: 1, units: 100, workMinutes: 2400 }, 0), normalizeAssignment({ uid: 2, resourceUid: 2, units: 100, workMinutes: 2400 }, 1)], taskType: "fixed-work", effortDriven: true, workMinutes: 2400 }];
        calculate(state.tasks[0], "resource-change", 2400);
        return { durationMinutes: state.tasks[0].durationMinutes, duration: formatDuration(state.tasks[0].durationMinutes), totalWork: formatWork(work(state.tasks[0])), assignmentWork: state.tasks[0].assignments.map((a) => formatWork(a.workMinutes)), passed: state.tasks[0].durationMinutes === 1200 && formatDuration(state.tasks[0].durationMinutes) === "2.5d", version: VERSION };
      } finally {
        state = saved;
        selectedTaskIndex = selected;
        taskInfoIndex = info;
        render();
      }
    };
  }
})();
