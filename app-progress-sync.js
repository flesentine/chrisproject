(() => {
  if (typeof updateTask !== "function" || typeof state === "undefined") return;

  function autoRemainingMinutes(task) {
    const duration = Number.isFinite(Number(task?.durationMinutes)) ? Math.max(0, Math.round(Number(task.durationMinutes))) : 0;
    const percent = Math.min(100, Math.max(0, Math.round(Number(task?.percent) || 0)));
    return percent >= 100 ? 0 : Math.max(0, Math.round(duration * (100 - percent) / 100));
  }

  function syncAutomaticRemaining(task) {
    if (!task) return;
    task.remainingDurationManual = false;
    task.remainingDurationMinutes = autoRemainingMinutes(task);
    const duration = Number.isFinite(Number(task.durationMinutes)) ? Math.max(0, Math.round(Number(task.durationMinutes))) : 0;
    task.actualDurationMinutes = Math.max(0, duration - task.remainingDurationMinutes);
    if (Number(task.percent) >= 100 && !task.actualFinish) task.actualFinish = task.finish || "";
  }

  const baseUpdateTask = updateTask;
  updateTask = function progressSyncedUpdateTask(index, field, value) {
    const task = state.tasks?.[index];
    if (task && ["percent", "duration", "start", "finish"].includes(field) && task.remainingDurationManual !== true) {
      delete task.remainingDurationMinutes;
      delete task.actualDurationMinutes;
    }
    return baseUpdateTask(index, field, value);
  };

  if (typeof applyTaskInfoForm === "function") {
    const baseApplyTaskInfoForm = applyTaskInfoForm;
    applyTaskInfoForm = function progressSyncedApplyTaskInfoForm() {
      const index = taskInfoIndex;
      const tab = taskInfoActiveTab;
      baseApplyTaskInfoForm();
      const task = state.tasks?.[index];
      if (task && tab !== "progress") {
        syncAutomaticRemaining(task);
        if (typeof render === "function") render();
      }
    };
  }
})();

(() => {
  const STITCH_VERSION = "v0.24.1";
  const STITCH_VERSION_NAME = "Stitch layout polish";
  const STITCH_PREF_FLAG = "projecthub-stitch-theme-prefs-v2";

  function bootStitchTheme() {
    if (typeof state === "undefined") return;
    loadStitchThemeCss();
    document.body.classList.add("projecthub-stitch-theme");
    installSidebar();
    installHealthCard();
    installTaskDetailCard();
    applyStitchDefaultLayout();
    updateStitchCopy();
    patchStitchRender();
    refreshStitchChrome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootStitchTheme, { once: true });
  } else {
    bootStitchTheme();
  }

  function loadStitchThemeCss() {
    loadCssOnce("stitchThemeCss", `stitch-theme.css?${STITCH_VERSION}`);
    loadCssOnce("stitchPolishCss", `stitch-polish.css?${STITCH_VERSION}`);
  }

  function loadCssOnce(id, href) {
    const existing = document.getElementById(id);
    if (existing) {
      existing.href = href;
      return;
    }
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function patchStitchRender() {
    if (window.__stitchThemeRenderPatched || typeof render !== "function") return;
    window.__stitchThemeRenderPatched = true;
    const baseRender = render;
    render = function stitchThemeRender() {
      baseRender();
      refreshStitchChrome();
    };
  }

  function applyStitchDefaultLayout() {
    if (typeof uiPrefs === "undefined") return;
    const alreadyApplied = localStorage.getItem(STITCH_PREF_FLAG) === "1";
    const totalFieldWidth = typeof getTotalFieldColumnWidth === "function" ? getTotalFieldColumnWidth() : 1250;
    const currentPane = Number(uiPrefs.fieldPaneWidth || totalFieldWidth);
    const shouldTighten = !alreadyApplied || currentPane > 660;
    if (!shouldTighten) return;
    if (uiPrefs.fieldColumns) {
      uiPrefs.fieldColumns.name = Math.min(Number(uiPrefs.fieldColumns.name) || 430, 340);
      uiPrefs.fieldColumns.predecessors = Math.min(Number(uiPrefs.fieldColumns.predecessors) || 138, 112);
      uiPrefs.fieldColumns.actions = Math.min(Number(uiPrefs.fieldColumns.actions) || 86, 60);
    }
    const refreshedTotal = typeof getTotalFieldColumnWidth === "function" ? getTotalFieldColumnWidth() : totalFieldWidth;
    uiPrefs.fieldPaneWidth = Math.min(refreshedTotal, 620);
    uiPrefs.rowHeight = Math.max(Number(uiPrefs.rowHeight) || 56, 64);
    uiPrefs.dayWidth = Math.max(Number(uiPrefs.dayWidth) || 58, 60);
    document.documentElement.style.setProperty("--stitch-left-pane", `${uiPrefs.fieldPaneWidth}px`);
    localStorage.setItem(STITCH_PREF_FLAG, "1");
    if (typeof saveUiPrefs === "function") saveUiPrefs();
  }

  function installSidebar() {
    if (document.getElementById("stitchSidebar")) return;
    const sidebar = document.createElement("aside");
    sidebar.className = "stitch-sidebar";
    sidebar.id = "stitchSidebar";
    sidebar.setAttribute("aria-label", "ProjectHub navigation");
    sidebar.innerHTML = `
      <nav class="stitch-rail-list">
        <span class="stitch-rail-item"><i>⌂</i></span>
        <span class="stitch-rail-item"><i>▦</i></span>
        <span class="stitch-rail-item"><i>□</i></span>
        <span class="stitch-rail-item is-active"><i>▦</i><small>Grid</small></span>
        <span class="stitch-rail-item"><i>☑</i></span>
        <span class="stitch-rail-item"><i>◇</i><small>Board</small></span>
        <span class="stitch-rail-item"><i>☰</i><small>Gantt</small></span>
        <span class="stitch-rail-item"><i>◷</i></span>
        <span class="stitch-rail-item"><i>▥</i></span>
        <span class="stitch-rail-item"><i>⚙</i></span>
      </nav>`;
    document.body.prepend(sidebar);
  }

  function installHealthCard() {
    if (document.getElementById("stitchHealthCard")) return;
    const card = document.createElement("aside");
    card.className = "stitch-health-card";
    card.id = "stitchHealthCard";
    card.setAttribute("aria-label", "Project health");
    const main = document.querySelector("main");
    main?.prepend(card);
  }

  function installTaskDetailCard() {
    if (document.getElementById("stitchTaskCard")) return;
    const card = document.createElement("aside");
    card.className = "stitch-task-card";
    card.id = "stitchTaskCard";
    card.setAttribute("aria-label", "Selected task summary");
    const host = document.querySelector(".unified-card");
    host?.appendChild(card);
  }

  function updateStitchCopy() {
    const heroTitle = document.querySelector(".hero-copy h2");
    if (heroTitle) heroTitle.textContent = "Interactive Project Canvas View";
    const heroCopy = document.querySelector(".hero-copy p");
    if (heroCopy) heroCopy.textContent = "Task cards, Project-style progress tracking, and a cleaner Gantt canvas inspired by the Stitch ProjectHub screens.";
    const cardTitle = document.querySelector(".unified-card .card-header h2");
    if (cardTitle) cardTitle.textContent = "Task List + Gantt Chart View";
    const ribbonVersion = document.getElementById("ribbonVersionText");
    if (ribbonVersion) ribbonVersion.textContent = `${STITCH_VERSION} · ${STITCH_VERSION_NAME}`;
  }

  function refreshStitchChrome() {
    document.body.classList.add("projecthub-stitch-theme");
    if (typeof uiPrefs !== "undefined" && uiPrefs.fieldPaneWidth) {
      document.documentElement.style.setProperty("--stitch-left-pane", `${uiPrefs.fieldPaneWidth}px`);
    }
    updateVersionLabels();
    updateHealthCard();
    updateTaskDetailCard();
    updateStitchCopy();
  }

  function updateVersionLabels() {
    const label = `${STITCH_VERSION} · ${STITCH_VERSION_NAME}`;
    ["appVersionBadge", "appVersionFooter"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = id === "appVersionFooter" ? `${label} · Build 2026-06-23` : label;
    });
  }

  function updateHealthCard() {
    const card = document.getElementById("stitchHealthCard");
    if (!card) return;
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    const leafTasks = getLeafTasks(tasks);
    const percent = getProjectPercent(leafTasks.length ? leafTasks : tasks);
    const warnings = countWarnings(tasks);
    const late = countLateTasks(tasks);
    const statusClass = late > 0 ? "is-bad" : warnings > 0 ? "is-warn" : "is-good";
    const statusText = late > 0 ? "Needs Attention" : warnings > 0 ? "Watch" : "On Track";
    const budgetText = getBudgetText(tasks);
    card.innerHTML = `
      <strong>Project Health</strong>
      <p>Progress: ${percent}% <span class="${statusClass}">(${statusText})</span></p>
      <p>${budgetText}</p>
      <p>Risks: <span class="${late ? "is-bad" : "is-good"}">${late} Late</span>, <span class="${warnings ? "is-warn" : "is-good"}">${warnings} Warning${warnings === 1 ? "" : "s"}</span></p>`;
  }

  function updateTaskDetailCard() {
    const card = document.getElementById("stitchTaskCard");
    if (!card) return;
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    if (!tasks.length) {
      card.innerHTML = `<p class="stitch-task-kicker">Task</p><h3>No task selected</h3><dl><div><dt>Status</dt><dd>Add a task to populate this ProjectHub detail card.</dd></div></dl>`;
      return;
    }
    const index = getDisplayTaskIndex(tasks);
    const task = tasks[index] || tasks[0];
    const percent = normalizePercentValue(task.percent);
    const status = percent >= 100 ? "Completed" : percent > 0 ? "In Progress" : "Not Started";
    const due = friendlyDate(task.finish || task.deadline);
    const assignees = getAssigneeText(task);
    const deps = task.links?.length && typeof formatLinks === "function" ? formatLinks(task.links) : "None";
    const description = String(task.notes || "No description yet. Add notes in Task Information to fill this panel.").trim();
    const resourceRows = getResourceRows(task);
    const predecessor = task.links?.length && typeof formatLinks === "function" ? formatLinks(task.links) : "None";
    card.innerHTML = `
      <p class="stitch-task-kicker">Task</p>
      <h3>${escapeHtml(task.name || `Task ${index + 1}`)}</h3>
      <dl>
        <div><dt>Status</dt><dd>${escapeHtml(status)} · ${percent}% complete</dd></div>
        <div><dt>Due</dt><dd>${escapeHtml(due)}</dd></div>
        <div><dt>Assignees</dt><dd>${escapeHtml(assignees)}</dd></div>
        <div><dt>Dependencies</dt><dd>${escapeHtml(deps)}</dd></div>
        <div><dt>Description</dt><dd>${escapeHtml(description)}</dd></div>
        <div><dt>Resource Allocation</dt><dd>${resourceRows}</dd></div>
        <div><dt>Predecessors</dt><dd><span class="stitch-link-pill">${escapeHtml(predecessor)} 🔗</span></dd></div>
      </dl>`;
  }

  function getDisplayTaskIndex(tasks) {
    if (Number.isInteger(selectedTaskIndex) && tasks[selectedTaskIndex]) return selectedTaskIndex;
    const inProgress = tasks.findIndex((task, index) => !isSummaryTask(index) && normalizePercentValue(task.percent) > 0 && normalizePercentValue(task.percent) < 100);
    if (inProgress >= 0) return inProgress;
    const firstLeaf = tasks.findIndex((_, index) => !isSummaryTask(index));
    return firstLeaf >= 0 ? firstLeaf : 0;
  }

  function getLeafTasks(tasks) {
    return tasks.filter((_, index) => !isSummaryTask(index));
  }

  function isSummaryTask(index) {
    return typeof isSummaryIndex === "function" ? isSummaryIndex(index) : false;
  }

  function normalizePercentValue(value) {
    const n = Math.round(Number(value) || 0);
    return Math.min(100, Math.max(0, n));
  }

  function getProjectPercent(tasks) {
    if (!tasks.length) return 0;
    if (typeof calculateWeightedPercent === "function") return calculateWeightedPercent(tasks);
    return Math.round(tasks.reduce((sum, task) => sum + normalizePercentValue(task.percent), 0) / tasks.length);
  }

  function countLateTasks(tasks) {
    return tasks.reduce((count, task) => {
      const baselineFinish = parseDateValue(task.baseline?.finish);
      const currentFinish = parseDateValue(task.finish);
      if (baselineFinish && currentFinish && currentFinish > baselineFinish) return count + 1;
      return count;
    }, 0);
  }

  function countWarnings(tasks) {
    return tasks.reduce((count, task) => {
      const deadline = parseDateValue(task.deadline);
      const finish = parseDateValue(task.finish);
      const deadlineMiss = deadline && finish && finish > deadline;
      const constraintWarnings = typeof getTaskConstraintWarnings === "function" ? getTaskConstraintWarnings(task).length : 0;
      return count + (deadlineMiss || constraintWarnings ? 1 : 0);
    }, 0);
  }

  function getBudgetText(tasks) {
    const cost = tasks.reduce((sum, task) => {
      if (typeof summarizeTaskAssignments === "function") {
        return sum + (Number(summarizeTaskAssignments(task).totalCost) || 0);
      }
      return sum;
    }, 0);
    if (!cost) return "Budget: Costs module next";
    const formatted = typeof formatMoney === "function" ? formatMoney(cost) : `$${Math.round(cost).toLocaleString()}`;
    return `Budget: ${formatted} used`;
  }

  function getAssigneeText(task) {
    const assignments = Array.isArray(task.assignments) ? task.assignments : [];
    const names = assignments.map((assignment) => getResourceName(assignment.resourceUid)).filter(Boolean);
    return names.length ? names.join(", ") : "No resources assigned";
  }

  function getResourceRows(task) {
    const assignments = Array.isArray(task.assignments) ? task.assignments : [];
    if (!assignments.length) return `<span>No resources assigned yet.</span>`;
    return assignments.slice(0, 4).map((assignment) => {
      const name = getResourceName(assignment.resourceUid) || "Resource";
      const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "R";
      const work = typeof formatWork === "function" ? formatWork(assignment.workMinutes || 0) : `${Math.round((Number(assignment.workMinutes) || 0) / 60)}h`;
      return `<span class="stitch-resource-row"><span class="stitch-resource-person"><span class="stitch-avatar">${escapeHtml(initials)}</span>${escapeHtml(name)}</span><span>${escapeHtml(work)}</span></span>`;
    }).join("");
  }

  function getResourceName(uid) {
    const resource = Array.isArray(state.resources) ? state.resources.find((item) => Number(item.uid) === Number(uid)) : null;
    return resource?.name || "";
  }

  function friendlyDate(value) {
    if (!value) return "No date";
    if (typeof formatFriendlyDate === "function") return formatFriendlyDate(value);
    const date = parseDateValue(value);
    return date ? date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "No date";
  }

  function parseDateValue(value) {
    if (!value) return null;
    if (typeof dateOnly === "function") return dateOnly(value);
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[char]));
  }
})();
