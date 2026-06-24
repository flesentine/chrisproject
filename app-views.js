(() => {
  const VIEWS_VERSION = "v0.40.0";
  const VIEWS_NAME = "MS Project view switching";
  const VIEWS_BUILD_DATE = "2026-06-24";
  const CUSTOM_WORKSPACE_ID = "msProjectViewsWorkspace";
  const VIEW_BUTTON_SELECTOR = "[data-ms-app-view]";
  const VIEW_DEFINITIONS = [
    { id: "gantt-chart", label: "Gantt Chart", icon: "▤", group: "task" },
    { id: "task-sheet", label: "Task Sheet", icon: "▦", group: "task" },
    { id: "task-usage", label: "Task Usage", icon: "▥", group: "task" },
    { id: "resource-sheet", label: "Resource Sheet", icon: "👥", group: "resource" },
    { id: "resource-usage", label: "Resource Usage", icon: "▧", group: "resource" },
    { id: "calendar", label: "Calendar View", icon: "□", group: "task" },
    { id: "timeline", label: "Timeline", icon: "▬", group: "task" },
    { id: "network-diagram", label: "Network Diagram", icon: "◇", group: "later" },
  ];
  const CUSTOM_VIEW_IDS = new Set(["task-sheet", "task-usage", "resource-usage", "calendar", "timeline", "network-diagram"]);

  let bootAttempts = 0;

  function bootViewsModule() {
    if (window.__msProjectViewsInstalled) return;
    if (typeof state === "undefined" || typeof render !== "function") {
      bootAttempts += 1;
      if (bootAttempts < 80) window.setTimeout(bootViewsModule, 50);
      return;
    }

    window.__msProjectViewsInstalled = true;
    installCustomWorkspace();
    installViewRibbonControls();
    patchViewRuntime();
    wireViewCommands();
    patchVersion();
    applyActiveView();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootViewsModule, { once: true });
  } else {
    bootViewsModule();
  }

  function normalizeViewId(view) {
    const raw = String(view || "gantt-chart").trim().toLowerCase();
    const aliases = {
      schedule: "gantt-chart",
      gantt: "gantt-chart",
      ganttchart: "gantt-chart",
      "gantt chart": "gantt-chart",
      resources: "resource-sheet",
      resource: "resource-sheet",
      resource_sheet: "resource-sheet",
      tasksheet: "task-sheet",
      "task sheet": "task-sheet",
      taskusage: "task-usage",
      "task usage": "task-usage",
      resourceusage: "resource-usage",
      "resource usage": "resource-usage",
      calendarview: "calendar",
      "calendar view": "calendar",
      timelineview: "timeline",
      network: "network-diagram",
      "network diagram": "network-diagram",
    };
    const id = aliases[raw] || raw;
    return VIEW_DEFINITIONS.some((viewDef) => viewDef.id === id) ? id : "gantt-chart";
  }

  function getViewDef(id) {
    const normalized = normalizeViewId(id);
    return VIEW_DEFINITIONS.find((view) => view.id === normalized) || VIEW_DEFINITIONS[0];
  }

  function patchViewRuntime() {
    if (window.__msProjectViewsRuntimePatched) return;
    window.__msProjectViewsRuntimePatched = true;

    setActiveView = function msProjectViewsSetActiveView(view) {
      state.activeView = normalizeViewId(view);
      applyActiveView();
      if (typeof save === "function") save();
    };

    updateActiveView = function msProjectViewsUpdateActiveView() {
      applyActiveView();
    };
  }

  function installCustomWorkspace() {
    if (document.getElementById(CUSTOM_WORKSPACE_ID)) return document.getElementById(CUSTOM_WORKSPACE_ID);
    const main = document.querySelector("main");
    const resourceWorkspace = document.getElementById("resourceWorkspace");
    const workspace = document.createElement("section");
    workspace.id = CUSTOM_WORKSPACE_ID;
    workspace.className = "workspace ms-project-view-workspace";
    workspace.hidden = true;
    workspace.setAttribute("aria-live", "polite");
    workspace.innerHTML = `<article class="work-card ms-view-card"><div class="card-header"><div><h2 id="msProjectViewTitle">View</h2><p id="msProjectViewSubtitle">Switch views from the View ribbon.</p></div><span class="card-badge" id="msProjectViewBadge">Views</span></div><div class="ms-view-content" id="msProjectViewContent"></div></article>`;
    if (resourceWorkspace?.parentNode) resourceWorkspace.insertAdjacentElement("afterend", workspace);
    else main?.appendChild(workspace);
    return workspace;
  }

  function installViewRibbonControls() {
    const viewPanel = document.querySelector('[data-ribbon-panel="view"]');
    if (!viewPanel || viewPanel.dataset.msProjectViewsInstalled === "1") return;
    viewPanel.dataset.msProjectViewsInstalled = "1";

    const firstGroup = viewPanel.querySelector(".command-group") || viewPanel.firstElementChild;
    if (!firstGroup) return;
    firstGroup.classList.add("ms-view-picker-group");
    firstGroup.innerHTML = `
      <span class="group-label">Views</span>
      <div class="ms-view-picker" aria-label="Switch Project views" role="group">
        ${VIEW_DEFINITIONS.map((view) => `
          <button type="button" data-ms-app-view="${view.id}" class="ms-view-button${view.group === "later" ? " is-later" : ""}">
            <span aria-hidden="true">${escapeHtml(view.icon)}</span>
            <strong>${escapeHtml(view.label)}</strong>
            ${view.group === "later" ? "<small>later</small>" : ""}
          </button>`).join("")}
      </div>`;
  }

  function wireViewCommands() {
    document.addEventListener("click", (event) => {
      const viewButton = event.target.closest(VIEW_BUTTON_SELECTOR);
      if (viewButton) {
        event.preventDefault();
        setActiveView(viewButton.dataset.msAppView);
        return;
      }

      const infoButton = event.target.closest("[data-ms-view-task-info]");
      if (infoButton) {
        const index = Number(infoButton.dataset.msViewTaskInfo);
        if (typeof openTaskInfo === "function" && Number.isInteger(index)) openTaskInfo(index);
        return;
      }

      const openGantt = event.target.closest("[data-ms-view-open-gantt]");
      if (openGantt) {
        setActiveView("gantt-chart");
        return;
      }

      const addResource = event.target.closest("[data-ms-view-add-resource]");
      if (addResource) {
        document.getElementById("addResourceBtn")?.click();
      }
    });
  }

  function patchVersion() {
    const text = `${VIEWS_VERSION} · ${VIEWS_NAME}`;
    const ribbon = document.getElementById("ribbonVersionText");
    const badge = document.getElementById("appVersionBadge");
    const footer = document.getElementById("appVersionFooter");
    const compatChip = document.getElementById("compatChip");
    if (ribbon) ribbon.textContent = text;
    if (badge) {
      badge.textContent = text;
      badge.title = `Build ${VIEWS_BUILD_DATE}`;
    }
    if (footer) footer.textContent = `${text} · Build ${VIEWS_BUILD_DATE}`;
    if (compatChip) compatChip.lastChild.textContent = " Views ready";
  }

  function applyActiveView() {
    if (typeof state === "undefined") return;
    const viewId = normalizeViewId(state.activeView);
    state.activeView = viewId;
    const customWorkspace = installCustomWorkspace();
    const ganttWorkspace = document.getElementById("workspace");
    const resourceWorkspace = document.getElementById("resourceWorkspace");
    const showGantt = viewId === "gantt-chart";
    const showResourceSheet = viewId === "resource-sheet";
    const showCustom = CUSTOM_VIEW_IDS.has(viewId);

    if (ganttWorkspace) ganttWorkspace.hidden = !showGantt;
    if (resourceWorkspace) resourceWorkspace.hidden = !showResourceSheet;
    if (customWorkspace) customWorkspace.hidden = !showCustom;

    document.body.dataset.msProjectActiveView = viewId;
    document.getElementById("scheduleViewBtn")?.classList.toggle("is-active", showGantt);
    document.getElementById("resourceViewBtn")?.classList.toggle("is-active", showResourceSheet);
    document.querySelectorAll(VIEW_BUTTON_SELECTOR).forEach((button) => {
      button.classList.toggle("is-active", normalizeViewId(button.dataset.msAppView) === viewId);
      button.setAttribute("aria-pressed", normalizeViewId(button.dataset.msAppView) === viewId ? "true" : "false");
    });
    document.querySelectorAll("[data-view-proxy]").forEach((button) => {
      const proxyView = normalizeViewId(button.dataset.viewProxy);
      button.classList.toggle("is-active", proxyView === viewId);
    });

    if (showCustom) renderCustomView(viewId);
  }

  function renderCustomView(viewId) {
    const title = document.getElementById("msProjectViewTitle");
    const subtitle = document.getElementById("msProjectViewSubtitle");
    const badge = document.getElementById("msProjectViewBadge");
    const content = document.getElementById("msProjectViewContent");
    if (!content) return;

    const view = getViewDef(viewId);
    if (title) title.textContent = view.label;
    if (subtitle) subtitle.textContent = viewSubtitle(view.id);
    if (badge) badge.textContent = view.group === "later" ? "Planned" : `${getTasks().length} task${getTasks().length === 1 ? "" : "s"}`;

    if (view.id === "task-sheet") content.innerHTML = renderTaskSheetView();
    else if (view.id === "task-usage") content.innerHTML = renderTaskUsageView();
    else if (view.id === "resource-usage") content.innerHTML = renderResourceUsageView();
    else if (view.id === "calendar") content.innerHTML = renderCalendarView();
    else if (view.id === "timeline") content.innerHTML = renderTimelineView();
    else if (view.id === "network-diagram") content.innerHTML = renderNetworkPlaceholder();
  }

  function viewSubtitle(viewId) {
    const subtitles = {
      "task-sheet": "Table-only task view, no Gantt chart. Use Info to edit full task details.",
      "task-usage": "Tasks grouped with assignment rows for work, actual work, remaining work, and cost.",
      "resource-usage": "Resources grouped with the task assignments consuming their work/cost.",
      calendar: "Month-style schedule view using task start and finish dates.",
      timeline: "High-level timeline strip for communicating the plan.",
      "network-diagram": "Reserved for the later dependency graph build.",
    };
    return subtitles[viewId] || "Switch views from the View ribbon.";
  }

  function getTasks() {
    return Array.isArray(state?.tasks) ? state.tasks : [];
  }

  function getResources() {
    if (typeof ensureResources === "function") ensureResources();
    return Array.isArray(state?.resources) ? state.resources : [];
  }

  function getCalendarSafe() {
    try {
      return typeof getCalendar === "function" ? getCalendar() : state.calendar || {};
    } catch {
      return state?.calendar || {};
    }
  }

  function findResource(uid) {
    const numeric = Number(uid);
    try {
      if (typeof getResourceByUid === "function") return getResourceByUid(numeric);
    } catch {}
    return getResources().find((resource) => Number(resource.uid) === numeric) || null;
  }

  function getAssignmentsForTask(task) {
    return Array.isArray(task?.assignments) ? task.assignments : [];
  }

  function getAssignmentsForResource(resourceUid) {
    const uid = Number(resourceUid);
    return getTasks().flatMap((task, taskIndex) => getAssignmentsForTask(task)
      .filter((assignment) => Number(assignment.resourceUid) === uid)
      .map((assignment) => ({ task, taskIndex, assignment })));
  }

  function renderTaskSheetView() {
    const tasks = getTasks();
    if (!tasks.length) return renderEmpty("No tasks yet.", "Click Task on the ribbon to add your first row.");
    return `
      <div class="ms-view-toolbar"><strong>Task Sheet</strong><span>Table-only task view</span><button type="button" data-ms-view-open-gantt>Back to Gantt</button></div>
      <div class="ms-sheet-scroll">
        <table class="ms-view-table ms-task-sheet-table">
          <thead><tr><th>ID</th><th>i</th><th>Task Name</th><th>Duration</th><th>Start</th><th>Finish</th><th>%</th><th>Predecessors</th><th>Resources</th><th>Baseline</th><th>Info</th></tr></thead>
          <tbody>
            ${tasks.map((task, index) => `
              <tr class="${task.isSummary ? "is-summary" : ""}">
                <td>${escapeHtml(task.id || index + 1)}</td>
                <td>${taskIndicatorsText(task, index)}</td>
                <td style="padding-left:${Math.max(0, Number(task.outlineLevel || 1) - 1) * 18 + 10}px"><strong>${escapeHtml(task.name || `Task ${index + 1}`)}</strong><small>${escapeHtml(task.wbs || "")}</small></td>
                <td>${escapeHtml(formatDurationSafe(task.durationMinutes, task))}</td>
                <td>${escapeHtml(task.start || "")}</td>
                <td>${escapeHtml(task.finish || "")}</td>
                <td>${escapeHtml(task.percent ?? 0)}%</td>
                <td>${escapeHtml(formatLinksSafe(task))}</td>
                <td>${escapeHtml(formatAssignmentNames(task))}</td>
                <td>${escapeHtml(formatBaselineRange(task))}</td>
                <td><button type="button" data-ms-view-task-info="${index}">Info</button></td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  function renderTaskUsageView() {
    const tasks = getTasks();
    if (!tasks.length) return renderEmpty("No tasks yet.", "Task Usage fills in after tasks and assignments exist.");
    return `
      <div class="ms-view-toolbar"><strong>Task Usage</strong><span>${countAssignments()} assignment${countAssignments() === 1 ? "" : "s"}</span></div>
      <div class="ms-usage-list">
        ${tasks.map((task, taskIndex) => {
          const assignments = getAssignmentsForTask(task);
          return `<section class="ms-usage-group">
            <header><div><strong>${escapeHtml(task.id || taskIndex + 1)}. ${escapeHtml(task.name || "Task")}</strong><small>${escapeHtml(task.start || "")} → ${escapeHtml(task.finish || "")} · ${escapeHtml(formatDurationSafe(task.durationMinutes, task))}</small></div><span>${assignments.length || "No"} assignment${assignments.length === 1 ? "" : "s"}</span></header>
            ${assignments.length ? renderAssignmentRows(assignments, task) : `<div class="ms-usage-empty-row">Unassigned task. Add assignments in Task Information → Resources.</div>`}
          </section>`;
        }).join("")}
      </div>`;
  }

  function renderResourceUsageView() {
    const resources = getResources();
    if (!resources.length) return renderEmpty("No resources yet.", "Create work, material, or cost resources first.", "Add Resource", "data-ms-view-add-resource");
    return `
      <div class="ms-view-toolbar"><strong>Resource Usage</strong><span>${resources.length} resource${resources.length === 1 ? "" : "s"}</span></div>
      <div class="ms-usage-list">
        ${resources.map((resource) => {
          const rows = getAssignmentsForResource(resource.uid);
          const totalWork = rows.reduce((sum, row) => sum + minutesValue(row.assignment.workMinutes), 0);
          const totalCost = rows.reduce((sum, row) => sum + assignmentCostSafe(row.assignment), 0);
          return `<section class="ms-usage-group">
            <header><div><strong>${escapeHtml(resource.name)}</strong><small>${escapeHtml(resource.type || "Work")} · ${escapeHtml(resource.maxUnits ?? 100)}% max units</small></div><span>${formatWorkSafe(totalWork)} · ${formatMoneySafe(totalCost)}</span></header>
            ${rows.length ? renderResourceAssignmentRows(rows) : `<div class="ms-usage-empty-row">No tasks assigned to this resource.</div>`}
          </section>`;
        }).join("")}
      </div>`;
  }

  function renderAssignmentRows(assignments, task) {
    return `<div class="ms-usage-table"><div class="ms-usage-heading"><span>Resource</span><span>Units</span><span>Work</span><span>Actual</span><span>Remaining</span><span>Cost</span></div>
      ${assignments.map((assignment) => {
        const resource = findResource(assignment.resourceUid);
        return `<div class="ms-usage-row"><span>${escapeHtml(resource?.name || "Missing resource")}</span><span>${escapeHtml(assignment.units ?? 100)}%</span><span>${formatWorkSafe(assignment.workMinutes)}</span><span>${formatWorkSafe(assignment.actualWorkMinutes)}</span><span>${formatWorkSafe(assignment.remainingWorkMinutes)}</span><span>${formatMoneySafe(assignmentCostSafe(assignment))}</span></div>`;
      }).join("")}</div>`;
  }

  function renderResourceAssignmentRows(rows) {
    return `<div class="ms-usage-table"><div class="ms-usage-heading"><span>Task</span><span>Units</span><span>Work</span><span>Actual</span><span>Remaining</span><span>Cost</span></div>
      ${rows.map((row) => `<div class="ms-usage-row"><span>${escapeHtml(row.task.id)}. ${escapeHtml(row.task.name || "Task")}</span><span>${escapeHtml(row.assignment.units ?? 100)}%</span><span>${formatWorkSafe(row.assignment.workMinutes)}</span><span>${formatWorkSafe(row.assignment.actualWorkMinutes)}</span><span>${formatWorkSafe(row.assignment.remainingWorkMinutes)}</span><span>${formatMoneySafe(assignmentCostSafe(row.assignment))}</span></div>`).join("")}</div>`;
  }

  function renderCalendarView() {
    const tasks = getTasks();
    const anchor = dateValue(tasks[0]?.start || state?.projectStart || new Date());
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const monthLabel = monthStart.toLocaleDateString([], { month: "long", year: "numeric" });
    const gridStart = addDaysLocal(monthStart, -monthStart.getDay());
    const days = Array.from({ length: 42 }, (_, index) => addDaysLocal(gridStart, index));
    return `
      <div class="ms-view-toolbar"><strong>${escapeHtml(monthLabel)}</strong><span>Calendar View</span></div>
      <div class="ms-calendar-grid">
        ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<div class="ms-calendar-heading">${day}</div>`).join("")}
        ${days.map((day) => {
          const inMonth = day.getMonth() === monthStart.getMonth();
          const working = isWorkingDaySafe(day);
          const dayTasks = tasks.filter((task) => dateInRange(day, task.start, task.finish)).slice(0, 4);
          return `<div class="ms-calendar-cell${inMonth ? "" : " is-other-month"}${working ? "" : " is-nonworking"}"><strong>${day.getDate()}</strong>${dayTasks.map((task) => `<span title="${escapeHtml(task.name || "Task")}">${escapeHtml(task.id)}. ${escapeHtml(task.name || "Task")}</span>`).join("")}${tasks.filter((task) => dateInRange(day, task.start, task.finish)).length > 4 ? `<em>+ more</em>` : ""}</div>`;
        }).join("")}
      </div>`;
  }

  function renderTimelineView() {
    const tasks = getTasks().filter((task) => task.start && task.finish);
    if (!tasks.length) return renderEmpty("No dated tasks yet.", "Timeline view needs task start and finish dates.");
    const starts = tasks.map((task) => dateValue(task.start).getTime());
    const finishes = tasks.map((task) => dateValue(task.finish).getTime());
    const min = Math.min(...starts);
    const max = Math.max(...finishes);
    const span = Math.max(1, max - min);
    return `
      <div class="ms-view-toolbar"><strong>Timeline</strong><span>${escapeHtml(formatShortDateSafe(new Date(min)))} → ${escapeHtml(formatShortDateSafe(new Date(max)))}</span></div>
      <div class="ms-timeline-view">
        ${tasks.map((task) => {
          const left = ((dateValue(task.start).getTime() - min) / span) * 100;
          const width = Math.max(4, ((dateValue(task.finish).getTime() - dateValue(task.start).getTime()) / span) * 100);
          return `<div class="ms-timeline-lane"><span>${escapeHtml(task.id)}. ${escapeHtml(task.name || "Task")}</span><div class="ms-timeline-track"><i style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%"><b>${escapeHtml(task.percent ?? 0)}%</b></i></div><small>${escapeHtml(task.start)} → ${escapeHtml(task.finish)}</small></div>`;
        }).join("")}
      </div>`;
  }

  function renderNetworkPlaceholder() {
    const linkCount = getTasks().reduce((sum, task) => sum + getTaskLinksSafe(task).length, 0);
    return `<div class="ms-network-placeholder"><strong>Network Diagram is reserved for later.</strong><p>This build wires the view switcher and keeps a placeholder here. Current dependency data is ready for the later node-and-arrow graph: ${linkCount} link${linkCount === 1 ? "" : "s"} found.</p><button type="button" data-ms-view-open-gantt>Use Gantt Chart for dependencies now</button></div>`;
  }

  function renderEmpty(title, copy, buttonText = "Back to Gantt", buttonAttr = "data-ms-view-open-gantt") {
    return `<div class="ms-view-empty"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(copy)}</p><button type="button" ${buttonAttr}>${escapeHtml(buttonText)}</button></div>`;
  }

  function taskIndicatorsText(task, index) {
    const pieces = [];
    if (task.isSummary) pieces.push("Σ");
    if (Number(task.durationMinutes) === 0 || task.isMilestone) pieces.push("◆");
    if (task.deadline) pieces.push("D");
    if (task.baseline?.start || task.baseline?.finish) pieces.push("B");
    if (getAssignmentsForTask(task).length) pieces.push("👥");
    if (getTaskLinksSafe(task).length) pieces.push("←");
    if (typeof formatSuccessorLinks === "function" && formatSuccessorLinks(task.id)) pieces.push("→");
    return pieces.length ? pieces.join(" ") : "i";
  }

  function getTaskLinksSafe(task) {
    try {
      if (typeof getTaskLinks === "function") return getTaskLinks(task) || [];
    } catch {}
    return Array.isArray(task?.links) ? task.links : [];
  }

  function formatLinksSafe(task) {
    try {
      if (typeof formatLinks === "function") return formatLinks(getTaskLinksSafe(task));
    } catch {}
    return getTaskLinksSafe(task).map((link) => `${link.id}${link.type || "FS"}`).join(", ");
  }

  function formatAssignmentNames(task) {
    const names = getAssignmentsForTask(task).map((assignment) => findResource(assignment.resourceUid)?.name).filter(Boolean);
    return names.length ? names.join(", ") : "Unassigned";
  }

  function formatBaselineRange(task) {
    const baseline = task?.baseline || {};
    if (!baseline.start && !baseline.finish) return "—";
    return `${baseline.start || "?"} → ${baseline.finish || "?"}`;
  }

  function countAssignments() {
    return getTasks().reduce((sum, task) => sum + getAssignmentsForTask(task).length, 0);
  }

  function assignmentCostSafe(assignment) {
    try {
      if (typeof assignmentCost === "function") return assignmentCost(assignment);
    } catch {}
    return 0;
  }

  function formatDurationSafe(minutes, task = null) {
    try {
      if (typeof formatDuration === "function") return formatDuration(minutes);
    } catch {}
    const safeMinutes = minutesValue(minutes);
    const calendar = getCalendarSafe();
    const minutesPerDay = Math.max(1, Number(calendar.minutesPerDay) || 480);
    if (safeMinutes === 0) return "0d";
    if (safeMinutes % minutesPerDay === 0) return `${safeMinutes / minutesPerDay}d`;
    if (safeMinutes % 60 === 0) return `${safeMinutes / 60}h`;
    return `${safeMinutes}m`;
  }

  function formatWorkSafe(minutes) {
    try {
      if (typeof formatWork === "function") return formatWork(minutes);
    } catch {}
    const safe = minutesValue(minutes);
    if (safe === 0) return "0h";
    return safe % 60 === 0 ? `${safe / 60}h` : `${safe}m`;
  }

  function formatMoneySafe(value) {
    try {
      if (typeof formatMoney === "function") return formatMoney(value);
    } catch {}
    const n = Number(value) || 0;
    return `$${n.toFixed(n % 1 ? 2 : 0)}`;
  }

  function minutesValue(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }

  function dateValue(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    try {
      if (typeof dateOnly === "function") {
        const parsed = dateOnly(value);
        if (parsed) return parsed;
      }
    } catch {}
    const text = String(value || "").slice(0, 10);
    const [year, month, day] = text.split("-").map(Number);
    const fallback = new Date();
    return year && month && day ? new Date(year, month - 1, day) : new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
  }

  function addDaysLocal(date, amount) {
    const next = dateValue(date);
    next.setDate(next.getDate() + amount);
    return next;
  }

  function dateInRange(date, start, finish) {
    const day = dateValue(date).getTime();
    const s = dateValue(start).getTime();
    const f = dateValue(finish || start).getTime();
    return day >= Math.min(s, f) && day <= Math.max(s, f);
  }

  function isWorkingDaySafe(date) {
    try {
      if (typeof isWorkingDay === "function") return isWorkingDay(date);
    } catch {}
    const calendar = getCalendarSafe();
    const workingDays = Array.isArray(calendar.workingDays) ? calendar.workingDays : [1, 2, 3, 4, 5];
    return workingDays.includes(dateValue(date).getDay());
  }

  function formatShortDateSafe(value) {
    const date = dateValue(value);
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
