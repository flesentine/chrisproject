(() => {
  const COLLAPSE_KEY = "ms-project-ribbon-collapsed-v1";
  const VIEW_ASSET_VERSION = "v0.29.0";
  const GANTT_FORMAT_VERSION = "v0.30.0";

  function boot() {
    const tabs = document.getElementById("ribbonTabs");
    const ribbon = document.querySelector(".office-ribbon");
    if (!tabs || !ribbon) {
      setTimeout(boot, 100);
      return;
    }
    installToggle(tabs);
    loadViewRibbonAssets();
    loadGanttFormatAssets();
    applyCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  function installToggle(tabs) {
    if (document.getElementById("msRibbonCollapseToggle")) return;
    const button = document.createElement("button");
    button.id = "msRibbonCollapseToggle";
    button.className = "ms-ribbon-collapse-toggle";
    button.type = "button";
    button.addEventListener("click", () => {
      const collapsed = !document.body.classList.contains("ms-ribbon-collapsed");
      applyCollapsed(collapsed);
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    });
    tabs.appendChild(button);
  }

  function loadViewRibbonAssets() {
    loadCss("msProjectViewRibbonCss", `ms-project-view-ribbon.css?${VIEW_ASSET_VERSION}`);
    loadScript("msProjectViewRibbonJs", `ms-project-view-ribbon.js?${VIEW_ASSET_VERSION}`);
  }

  function loadGanttFormatAssets() {
    loadCss("msProjectGanttFormatRibbonCss", `ms-project-gantt-format-ribbon.css?${GANTT_FORMAT_VERSION}`);
    loadScript("msProjectGanttFormatRibbonJs", `ms-project-gantt-format-ribbon.js?${GANTT_FORMAT_VERSION}`);
  }

  function loadCss(id, href) {
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(id, src) {
    if (document.getElementById(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.defer = true;
    document.body.appendChild(script);
  }

  function applyCollapsed(collapsed) {
    document.body.classList.toggle("ms-ribbon-collapsed", collapsed);
    const button = document.getElementById("msRibbonCollapseToggle");
    if (!button) return;
    button.textContent = collapsed ? "Show Ribbon ▾" : "Hide Ribbon ▴";
    button.setAttribute("aria-expanded", String(!collapsed));
    button.title = collapsed ? "Show the command ribbon" : "Hide the command ribbon to save vertical space";
  }
})();

(() => {
  const SUMMARY_ROLLUP_VERSION = "v0.32.0";
  const SUMMARY_ROLLUP_NAME = "Summary rollup v2";
  const SUMMARY_ROLLUP_BUILD_DATE = "2026-06-24";
  let bootAttempts = 0;

  function bootSummaryRollupV2() {
    if (window.__summaryRollupV2Loaded) return;
    if (
      typeof state === "undefined" ||
      typeof render !== "function" ||
      typeof rollupSummaryTasks !== "function" ||
      typeof isSummaryIndex !== "function" ||
      typeof getDirectChildIndexes !== "function"
    ) {
      retryBoot();
      return;
    }

    window.__summaryRollupV2Loaded = true;
    patchSummaryRollupRuntime();
    exposeSummaryRollupSelfTest();
    rollupSummaryTasks();
    render();
  }

  function retryBoot() {
    bootAttempts += 1;
    if (bootAttempts <= 80) window.setTimeout(bootSummaryRollupV2, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootSummaryRollupV2, { once: true });
  } else {
    bootSummaryRollupV2();
  }

  function safeDurationMinutes(task) {
    const fallback = typeof workingSpanMinutes === "function" ? workingSpanMinutes(task?.start, task?.finish) : 0;
    const raw = Number.isFinite(Number(task?.durationMinutes)) ? Number(task.durationMinutes) : fallback;
    return Math.max(0, Math.round(Number(raw) || 0));
  }

  function safeFormatWork(minutes) {
    if (typeof formatWork === "function") return formatWork(minutes);
    if (typeof formatDuration === "function") return formatDuration(minutes);
    return `${Math.round((Number(minutes) || 0) / 60)}h`;
  }

  function safeFormatMoney(value) {
    if (typeof formatMoney === "function") return formatMoney(value);
    return `$${(Number(value) || 0).toFixed(2)}`;
  }

  function descendantIndexes(parentIndex) {
    if (typeof getDescendantIndexes === "function") return getDescendantIndexes(parentIndex);
    const parent = state.tasks?.[parentIndex];
    if (!parent) return [];
    const level = Number(parent.outlineLevel) || 1;
    const indexes = [];
    for (let i = parentIndex + 1; i < state.tasks.length; i += 1) {
      const childLevel = Number(state.tasks[i]?.outlineLevel) || 1;
      if (childLevel <= level) break;
      indexes.push(i);
    }
    return indexes;
  }

  function directChildIndexes(parentIndex) {
    if (typeof getDirectChildIndexes === "function") return getDirectChildIndexes(parentIndex);
    const parent = state.tasks?.[parentIndex];
    if (!parent) return [];
    const level = Number(parent.outlineLevel) || 1;
    return descendantIndexes(parentIndex).filter((index) => (Number(state.tasks[index]?.outlineLevel) || 1) === level + 1);
  }

  function isSummaryRow(index) {
    if (typeof isSummaryIndex === "function") return isSummaryIndex(index);
    return directChildIndexes(index).length > 0;
  }

  function leafIndexes(parentIndex) {
    return descendantIndexes(parentIndex).filter((index) => !isSummaryRow(index));
  }

  function ownAssignmentSummary(task) {
    if (!task) return { totalWork: 0, actualWork: 0, remainingWork: 0, totalCost: 0 };
    if (typeof summarizeTaskAssignments === "function") return summarizeTaskAssignments(task);
    const assignments = Array.isArray(task.assignments) ? task.assignments : [];
    return assignments.reduce((summary, assignment) => {
      const work = Math.max(0, Math.round(Number(assignment.workMinutes) || 0));
      const actual = Math.max(0, Math.round(Number(assignment.actualWorkMinutes) || 0));
      const remaining = Math.max(0, Math.round(Number(assignment.remainingWorkMinutes ?? Math.max(0, work - actual)) || 0));
      summary.totalWork += work;
      summary.actualWork += actual;
      summary.remainingWork += remaining;
      return summary;
    }, { totalWork: 0, actualWork: 0, remainingWork: 0, totalCost: 0 });
  }

  function childWorkMinutes(child, childIndex) {
    if (isSummaryRow(childIndex) && Number.isFinite(Number(child?.rollupWorkMinutes))) {
      return Math.max(0, Math.round(Number(child.rollupWorkMinutes)));
    }
    return Math.max(0, Math.round(Number(ownAssignmentSummary(child).totalWork) || 0));
  }

  function childCost(child, childIndex) {
    if (isSummaryRow(childIndex) && Number.isFinite(Number(child?.rollupCost))) {
      return Math.max(0, Number(child.rollupCost) || 0);
    }
    return Math.max(0, Number(ownAssignmentSummary(child).totalCost) || 0);
  }

  function childWeightMinutes(child, childIndex, preferWork) {
    const work = childWorkMinutes(child, childIndex);
    if (preferWork && work > 0) return work;
    return Math.max(1, safeDurationMinutes(child));
  }

  function calculateSummaryPercent(children, childIndexes) {
    const preferWork = children.some((child, offset) => childWorkMinutes(child, childIndexes[offset]) > 0);
    const items = children.map((child, offset) => ({
      percent: typeof normalizePercent === "function" ? normalizePercent(child.percent) : Math.min(100, Math.max(0, Math.round(Number(child.percent) || 0))),
      weight: childWeightMinutes(child, childIndexes[offset], preferWork),
    }));
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    const percent = totalWeight ? Math.round(items.reduce((sum, item) => sum + item.percent * item.weight, 0) / totalWeight) : 0;
    return { percent, basis: preferWork ? "work" : "duration" };
  }

  function rollupOneSummary(index) {
    const task = state.tasks?.[index];
    if (!task) return;
    const directIndexes = directChildIndexes(index);
    const directChildren = directIndexes.map((childIndex) => state.tasks[childIndex]).filter(Boolean);
    if (!directChildren.length) {
      task.isSummary = false;
      task.rollupChildCount = 0;
      task.rollupLeafCount = 0;
      task.rollupWorkMinutes = 0;
      task.rollupCost = 0;
      task.rollupSource = "";
      return;
    }

    const leaves = leafIndexes(index);
    const scheduleIndexes = leaves.length ? leaves : directIndexes;
    const scheduleChildren = scheduleIndexes.map((childIndex) => state.tasks[childIndex]).filter(Boolean);
    const starts = scheduleChildren.map((child) => dateOnly(child.start)).filter(Boolean);
    const finishes = scheduleChildren.map((child) => dateOnly(child.finish)).filter(Boolean);

    task.isSummary = true;
    task.expanded = task.expanded !== false;
    task.rollupChildCount = directChildren.length;
    task.rollupLeafCount = leaves.length || directChildren.length;
    task.rollupWorkMinutes = directChildren.reduce((sum, child, offset) => sum + childWorkMinutes(child, directIndexes[offset]), 0);
    task.rollupCost = Math.round(directChildren.reduce((sum, child, offset) => sum + childCost(child, directIndexes[offset]), 0) * 100) / 100;

    if (starts.length && finishes.length) {
      const start = new Date(Math.min(...starts.map(Number)));
      const finish = new Date(Math.max(...finishes.map(Number)));
      task.start = toDateInputValue(start);
      task.finish = toDateInputValue(finish);
      task.durationMinutes = typeof workingSpanMinutes === "function"
        ? workingSpanMinutes(task.start, task.finish)
        : safeDurationMinutes(task);
      task.durationDays = typeof durationMinutesToWorkingDays === "function"
        ? durationMinutesToWorkingDays(task.durationMinutes)
        : Math.max(1, Math.round(task.durationMinutes / 480));
      task.isMilestone = false;
    }

    const completion = calculateSummaryPercent(directChildren, directIndexes);
    task.percent = completion.percent;
    task.rollupPercentBasis = completion.basis;
    task.rollupSource = `${directChildren.length} direct child${directChildren.length === 1 ? "" : "ren"}, ${task.rollupLeafCount} leaf task${task.rollupLeafCount === 1 ? "" : "s"} · completion weighted by child ${completion.basis}`;
  }

  function rollupSummariesV2() {
    if (!Array.isArray(state.tasks)) return;
    for (let i = state.tasks.length - 1; i >= 0; i -= 1) {
      if (isSummaryRow(i) || directChildIndexes(i).length) rollupOneSummary(i);
    }
  }

  function patchSummaryRollupRuntime() {
    const baseRollupSummaryTasks = rollupSummaryTasks;
    rollupSummaryTasks = function summaryRollupV2RollupSummaryTasks() {
      baseRollupSummaryTasks();
      rollupSummariesV2();
    };

    if (typeof refreshTaskInfoPanel === "function") {
      const baseRefreshTaskInfoPanel = refreshTaskInfoPanel;
      refreshTaskInfoPanel = function summaryRollupV2RefreshTaskInfoPanel(force = false) {
        baseRefreshTaskInfoPanel(force);
        if (!Number.isInteger(taskInfoIndex) || taskInfoIndex < 0 || taskInfoIndex >= state.tasks.length) return;
        const task = state.tasks[taskInfoIndex];
        if (!task || !isSummaryRow(taskInfoIndex) || !els.tiAssignmentSummary) return;
        els.tiAssignmentSummary.textContent = `Summary rollup: ${safeFormatWork(task.rollupWorkMinutes || 0)} child work · ${safeFormatMoney(task.rollupCost || 0)} child cost. Edit child tasks to change totals.`;
      };
    }

    if (typeof render === "function") {
      const baseRender = render;
      render = function summaryRollupV2Render() {
        const result = baseRender();
        updateSummaryRollupVersionLabels();
        return result;
      };
    }
  }

  function updateSummaryRollupVersionLabels() {
    const label = `${SUMMARY_ROLLUP_VERSION} · ${SUMMARY_ROLLUP_NAME}`;
    const badge = document.getElementById("appVersionBadge");
    const footer = document.getElementById("appVersionFooter");
    const ribbon = document.getElementById("ribbonVersionText");
    const compatChip = document.getElementById("compatChip");
    if (badge) {
      badge.textContent = label;
      badge.title = `Build ${SUMMARY_ROLLUP_BUILD_DATE}`;
    }
    if (footer) footer.textContent = `${label} · Build ${SUMMARY_ROLLUP_BUILD_DATE}`;
    if (ribbon) ribbon.textContent = `${SUMMARY_ROLLUP_VERSION} · summary rollup v2`;
    if (compatChip) compatChip.lastChild.textContent = " Summary rollups ready";
  }

  function exposeSummaryRollupSelfTest() {
    window.__summaryRollupV2SelfTest = () => {
      const savedState = JSON.parse(JSON.stringify(state));
      const savedSelected = selectedTaskIndex;
      const results = {};
      try {
        state.calendar = normalizeCalendar({ name: "Standard", workingDays: [1, 2, 3, 4, 5], exceptions: [], minutesPerDay: 480 });
        state.projectStart = "2026-07-06";
        state.tasks = [
          { uid: 1, id: 1, name: "Parent", start: "2026-07-06", finish: "2026-07-06", durationMinutes: 480, percent: 0, outlineLevel: 1, isSummary: true, expanded: true, links: [], predecessors: [], assignments: [] },
          { uid: 2, id: 2, name: "Child A", start: "2026-07-06", finish: "2026-07-08", durationMinutes: 1440, percent: 0, outlineLevel: 2, isSummary: false, expanded: true, links: [], predecessors: [], assignments: [{ uid: 1, resourceUid: 9991, workMinutes: 480, actualWorkMinutes: 0 }] },
          { uid: 3, id: 3, name: "Child B", start: "2026-07-09", finish: "2026-07-13", durationMinutes: 1440, percent: 50, outlineLevel: 2, isSummary: false, expanded: true, links: [], predecessors: [], assignments: [{ uid: 2, resourceUid: 9992, workMinutes: 960, actualWorkMinutes: 480 }] },
          { uid: 4, id: 4, name: "Child C", start: "2026-07-16", finish: "2026-07-17", durationMinutes: 960, percent: 100, outlineLevel: 2, isSummary: false, expanded: true, links: [], predecessors: [], assignments: [{ uid: 3, resourceUid: 9993, workMinutes: 480, actualWorkMinutes: 480 }] },
        ];
        selectedTaskIndex = 0;
        ensureDecorations();
        rollupSummaryTasks();
        const parent = state.tasks[0];
        results.parentStart = parent.start;
        results.parentFinish = parent.finish;
        results.parentDuration = typeof formatDuration === "function" ? formatDuration(parent.durationMinutes) : String(parent.durationMinutes);
        results.parentPercent = parent.percent;
        results.rollupWork = parent.rollupWorkMinutes;
        results.rollupCost = parent.rollupCost;
        results.dateRollupPassed = parent.start === "2026-07-06" && parent.finish === "2026-07-17";
        results.workWeightedPercentPassed = parent.percent === 50;
        parent.expanded = false;
        const visibleRows = typeof getVisibleTaskRows === "function" ? getVisibleTaskRows() : [];
        results.collapseKeepsParentOnly = visibleRows.length === 1 && visibleRows[0].index === 0;
        results.version = SUMMARY_ROLLUP_VERSION;
        return results;
      } finally {
        state = savedState;
        selectedTaskIndex = savedSelected;
        render();
      }
    };
  }
})();
