(() => {
  const CRITICAL_VERSION = "v0.25.0";
  const CRITICAL_VERSION_NAME = "Critical path + slack";
  const CRITICAL_BUILD_DATE = "2026-06-24";
  const ANALYSIS_TAB = "critical-path";
  const DAY_MS = 86400000;

  function bootCriticalPathModule() {
    if (window.__criticalPathModuleInstalled) return;
    if (typeof state === "undefined" || typeof render !== "function" || typeof dateOnly !== "function") {
      setTimeout(bootCriticalPathModule, 80);
      return;
    }

    window.__criticalPathModuleInstalled = true;
    injectCriticalPathStyles();
    installCriticalSummaryCard();
    installCriticalTaskInfoUi();
    patchCriticalPathRuntime();
    analyzeCriticalPath();
    decorateCriticalPathRows();
    updateCriticalPathLabels();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootCriticalPathModule, { once: true });
  } else {
    bootCriticalPathModule();
  }

  function injectCriticalPathStyles() {
    if (document.getElementById("criticalPathStyles")) return;
    const style = document.createElement("style");
    style.id = "criticalPathStyles";
    style.textContent = `
      .summary-card.critical-summary-card strong { color: #b91c1c; }
      .summary-card.critical-summary-card small { color: #667085; }
      .planner-row.is-critical-task .planner-fields {
        box-shadow: inset 4px 0 0 #dc2626;
      }
      .planner-row.is-critical-task .name-input {
        font-weight: 850;
      }
      .gantt-bar.is-critical {
        background: linear-gradient(135deg, #dc2626, #991b1b);
        box-shadow: 0 14px 30px rgba(220, 38, 38, 0.30), 0 0 0 1px rgba(255,255,255,0.46) inset;
      }
      .gantt-bar.is-critical.is-complete {
        background: linear-gradient(135deg, #b91c1c, #7f1d1d);
      }
      .gantt-bar.is-critical.is-summary {
        background: linear-gradient(135deg, #991b1b, #7f1d1d);
      }
      .critical-slack-badge {
        display: inline-flex;
        align-items: center;
        min-height: 18px;
        margin-left: 6px;
        padding: 1px 7px;
        border-radius: 999px;
        border: 1px solid #d9e2ee;
        background: #f8fafc;
        color: #475467;
        font-size: 10px;
        font-weight: 850;
        line-height: 1.1;
        white-space: nowrap;
      }
      .critical-slack-badge.is-critical {
        border-color: rgba(220, 38, 38, 0.22);
        background: #fee2e2;
        color: #991b1b;
      }
      .gantt-slack-bar {
        position: absolute;
        top: calc(var(--bar-top) + var(--bar-height) / 2 - 2px);
        height: 4px;
        border-radius: 999px;
        background: repeating-linear-gradient(90deg, rgba(71, 84, 103, 0.56) 0 8px, transparent 8px 13px);
        pointer-events: none;
        z-index: 2;
      }
      .gantt-slack-bar::after {
        content: attr(data-slack-label);
        position: absolute;
        left: 50%;
        top: -18px;
        transform: translateX(-50%);
        padding: 1px 6px;
        border: 1px solid #d9e2ee;
        border-radius: 999px;
        background: rgba(255,255,255,0.96);
        color: #475467;
        font-size: 9px;
        font-weight: 850;
        white-space: nowrap;
      }
      .critical-info-page input[readonly] {
        background: #f5f7fb;
        color: #344054;
      }
      .critical-status-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        max-width: 100%;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid #d9e2ee;
        background: #f8fafc;
        color: #344054;
        font-size: 12px;
        font-weight: 850;
      }
      .critical-status-pill.is-critical {
        border-color: rgba(220, 38, 38, 0.24);
        background: #fee2e2;
        color: #991b1b;
      }
      .indicator-dot.is-critical { background: #fee2e2; color: #991b1b; }
      .indicator-dot.is-slack { background: #f8fafc; color: #475467; }
    `;
    document.head.appendChild(style);
  }

  function installCriticalSummaryCard() {
    const grid = document.querySelector(".summary-grid");
    if (!grid || document.getElementById("criticalTaskCount")) return;
    const card = document.createElement("article");
    card.className = "summary-card critical-summary-card";
    card.innerHTML = `<span class="summary-label">Critical</span><strong id="criticalTaskCount">0</strong><small id="criticalTaskSummary">Critical path ready</small>`;
    grid.insertBefore(card, grid.children[3] || null);
  }

  function installCriticalTaskInfoUi() {
    const tabs = document.querySelector(".task-info-tabs");
    const form = document.getElementById("taskInfoForm");
    if (!tabs || !form) return;

    let tab = tabs.querySelector(`[data-task-info-tab="${ANALYSIS_TAB}"]`);
    if (!tab) {
      tab = document.createElement("button");
      tab.className = "task-info-tab";
      tab.type = "button";
      tab.dataset.taskInfoTab = ANALYSIS_TAB;
      tab.textContent = "Critical Path";
      const baselineTab = tabs.querySelector('[data-task-info-tab="baseline"]');
      baselineTab?.insertAdjacentElement("beforebegin", tab) || tabs.appendChild(tab);
    }

    let page = document.querySelector(`[data-task-info-page="${ANALYSIS_TAB}"]`);
    if (!page) {
      page = document.createElement("fieldset");
      page.className = "task-info-page critical-info-page";
      page.dataset.taskInfoPage = ANALYSIS_TAB;
      page.id = `task-info-page-${ANALYSIS_TAB}`;
      page.innerHTML = `
        <legend>Critical path / slack</legend>
        <div class="assignment-summary-bar">
          <span id="tiCriticalSummary" class="critical-status-pill">Critical path not calculated yet.</span>
        </div>
        <div class="task-info-grid">
          <label>Early Start<input aria-readonly="true" id="tiEarlyStart" readonly type="text"/></label>
          <label>Early Finish<input aria-readonly="true" id="tiEarlyFinish" readonly type="text"/></label>
          <label>Late Start<input aria-readonly="true" id="tiLateStart" readonly type="text"/></label>
          <label>Late Finish<input aria-readonly="true" id="tiLateFinish" readonly type="text"/></label>
          <label>Total Slack<input aria-readonly="true" id="tiTotalSlack" readonly type="text"/></label>
          <label>Free Slack<input aria-readonly="true" id="tiFreeSlack" readonly type="text"/></label>
          <label>Critical<input aria-readonly="true" id="tiCriticalFlag" readonly type="text"/></label>
        </div>
        <p class="task-info-help">Early/late dates come from the dependency graph. Total slack is how far the task can move before the project finish moves. Free slack is how far it can move before a successor moves.</p>`;
      const baselinePage = document.querySelector('[data-task-info-page="baseline"]');
      baselinePage?.insertAdjacentElement("beforebegin", page) || form.insertBefore(page, form.querySelector(".task-info-actions"));
    }

    if (typeof els === "object") {
      els.tiCriticalSummary = document.getElementById("tiCriticalSummary");
      els.tiEarlyStart = document.getElementById("tiEarlyStart");
      els.tiEarlyFinish = document.getElementById("tiEarlyFinish");
      els.tiLateStart = document.getElementById("tiLateStart");
      els.tiLateFinish = document.getElementById("tiLateFinish");
      els.tiTotalSlack = document.getElementById("tiTotalSlack");
      els.tiFreeSlack = document.getElementById("tiFreeSlack");
      els.tiCriticalFlag = document.getElementById("tiCriticalFlag");
    }
  }

  function patchCriticalPathRuntime() {
    if (window.__criticalPathRuntimePatched) return;
    window.__criticalPathRuntimePatched = true;

    const baseRenderTaskIndicators = typeof renderTaskIndicators === "function" ? renderTaskIndicators : null;
    if (baseRenderTaskIndicators) {
      renderTaskIndicators = function criticalRenderTaskIndicators(task, index, context = {}) {
        const original = baseRenderTaskIndicators(task, index, context);
        const snapshot = getCriticalSnapshot(task);
        const chips = [];
        if (snapshot.isCritical) {
          chips.push({ label: "C", className: "is-critical", title: "Critical task: zero total slack. This task can move the project finish." });
        } else if (snapshot.totalSlackDays > 0) {
          chips.push({ label: "S", className: "is-slack", title: `Total slack ${formatSlackDays(snapshot.totalSlackDays)} · free slack ${formatSlackDays(snapshot.freeSlackDays)}.` });
        }
        if (!chips.length) return original;
        const markup = chips.map((chip) => `<span class="indicator-dot ${chip.className}" title="${escapeSafe(chip.title)}">${escapeSafe(chip.label)}</span>`).join("");
        return original.replace("</button>", `${markup}</button>`);
      };
    }

    const baseRefreshTaskInfoPanel = typeof refreshTaskInfoPanel === "function" ? refreshTaskInfoPanel : null;
    if (baseRefreshTaskInfoPanel) {
      refreshTaskInfoPanel = function criticalRefreshTaskInfoPanel(force = false) {
        installCriticalTaskInfoUi();
        const result = baseRefreshTaskInfoPanel(force);
        refreshCriticalTaskInfoPanel(force);
        return result;
      };
    }

    const baseRender = render;
    render = function criticalPathRender() {
      analyzeCriticalPath();
      const result = baseRender();
      installCriticalSummaryCard();
      installCriticalTaskInfoUi();
      decorateCriticalPathRows();
      refreshCriticalTaskInfoPanel(true);
      updateCriticalPathLabels();
      return result;
    };

    if (typeof scheduleAllLinkedTasks === "function") {
      const baseScheduleAllLinkedTasks = scheduleAllLinkedTasks;
      scheduleAllLinkedTasks = function criticalScheduleAllLinkedTasks(options = {}) {
        const result = baseScheduleAllLinkedTasks(options);
        analyzeCriticalPath();
        decorateCriticalPathRows();
        updateCriticalPathLabels();
        return result;
      };
    }
  }

  function analyzeCriticalPath() {
    if (!Array.isArray(state.tasks) || !state.tasks.length) return null;
    try {
      if (typeof ensureDecorations === "function") ensureDecorations();
      if (typeof rollupSummaryTasks === "function") rollupSummaryTasks();
    } catch {
      // Critical analysis should never block normal rendering.
    }

    const reference = chooseReferenceDate();
    const minutesPerDay = getMinutesPerDay();
    const taskById = new Map(state.tasks.map((task) => [Number(task.id), task]));
    const leafRows = state.tasks
      .map((task, index) => ({ task, index }))
      .filter((row) => row.task && !isSummaryRow(row.index));

    const nodes = new Map();
    leafRows.forEach(({ task, index }) => {
      const durationDays = getTaskDurationDays(task);
      const startIndex = workingIndex(task.start || state.projectStart || reference, reference);
      const finishIndex = finishIndexFromStart(startIndex, durationDays);
      nodes.set(task.id, {
        id: task.id,
        task,
        index,
        durationDays,
        span: durationSpan(durationDays),
        es: startIndex,
        ef: Math.max(finishIndex, workingIndex(task.finish || task.start || state.projectStart || reference, reference)),
        ls: null,
        lf: null,
        outgoing: [],
        incoming: [],
      });
    });

    nodes.forEach((node) => {
      const links = getLinksForTask(node.task);
      links.forEach((link) => {
        const pred = nodes.get(Number(link.id));
        if (!pred || pred.id === node.id) return;
        const edge = { pred: pred.id, succ: node.id, type: normalizeLinkTypeSafe(link.type), lagDays: lagMinutesToDays(link.lagMinutes) };
        pred.outgoing.push(edge);
        node.incoming.push(edge);
      });
    });

    const order = topologicalOrder(nodes);
    const hasCycle = order.length !== nodes.size;
    const passOrder = hasCycle ? [...nodes.values()].sort((a, b) => a.index - b.index) : order.map((id) => nodes.get(id));

    passOrder.forEach((node) => {
      node.ef = finishIndexFromStart(node.es, node.durationDays);
      node.outgoing.forEach((edge) => {
        const succ = nodes.get(edge.succ);
        if (!succ) return;
        const requiredStart = successorRequiredStart(node, succ, edge);
        if (requiredStart > succ.es) {
          succ.es = requiredStart;
          succ.ef = finishIndexFromStart(succ.es, succ.durationDays);
        }
      });
    });

    const projectFinishIndex = [...nodes.values()].reduce((max, node) => Math.max(max, node.ef), workingIndex(state.projectStart || reference, reference));
    nodes.forEach((node) => {
      node.lf = projectFinishIndex;
      node.ls = startIndexFromFinish(node.lf, node.durationDays);
    });

    [...passOrder].reverse().forEach((node) => {
      node.outgoing.forEach((edge) => {
        const succ = nodes.get(edge.succ);
        if (!succ) return;
        const latestFinish = predecessorLatestFinish(node, succ, edge);
        if (latestFinish < node.lf) {
          node.lf = latestFinish;
          node.ls = startIndexFromFinish(node.lf, node.durationDays);
        }
      });
    });

    nodes.forEach((node) => {
      const totalSlackDays = Math.max(0, Math.round(node.ls - node.es));
      const freeSlackDays = Math.max(0, Math.round(calculateFreeSlackDays(node, nodes, totalSlackDays)));
      writeCriticalFields(node.task, {
        earlyStart: dateFromWorkingIndex(node.es, reference),
        earlyFinish: dateFromWorkingIndex(node.ef, reference),
        lateStart: dateFromWorkingIndex(node.ls, reference),
        lateFinish: dateFromWorkingIndex(node.lf, reference),
        totalSlackDays,
        freeSlackDays,
        isCritical: !hasCycle && totalSlackDays <= 0,
        hasCycle,
        minutesPerDay,
      });
    });

    rollupCriticalSummaryTasks(minutesPerDay);
    state.criticalPath = {
      calculatedAt: new Date().toISOString(),
      projectFinish: dateFromWorkingIndex(projectFinishIndex, reference),
      criticalTaskIds: [...nodes.values()].filter((node) => node.task.isCritical).map((node) => node.id),
      hasCycle,
    };
    return state.criticalPath;
  }

  function writeCriticalFields(task, values) {
    const totalSlackMinutes = values.totalSlackDays * values.minutesPerDay;
    const freeSlackMinutes = values.freeSlackDays * values.minutesPerDay;
    task.earlyStart = values.earlyStart;
    task.earlyFinish = values.earlyFinish;
    task.lateStart = values.lateStart;
    task.lateFinish = values.lateFinish;
    task.totalSlackDays = values.totalSlackDays;
    task.freeSlackDays = values.freeSlackDays;
    task.totalSlackMinutes = totalSlackMinutes;
    task.freeSlackMinutes = freeSlackMinutes;
    task.isCritical = Boolean(values.isCritical);
    task.critical = task.isCritical;
    task.criticalPathWarning = values.hasCycle ? "Dependency cycle blocks reliable critical path calculation." : "";
  }

  function rollupCriticalSummaryTasks(minutesPerDay) {
    for (let i = state.tasks.length - 1; i >= 0; i -= 1) {
      const task = state.tasks[i];
      if (!task || !isSummaryRow(i)) continue;
      const children = getLeafTasksForSummary(i).filter(Boolean);
      if (!children.length) continue;
      const earlyStarts = children.map((child) => dateOnly(child.earlyStart)).filter(Boolean);
      const earlyFinishes = children.map((child) => dateOnly(child.earlyFinish)).filter(Boolean);
      const lateStarts = children.map((child) => dateOnly(child.lateStart)).filter(Boolean);
      const lateFinishes = children.map((child) => dateOnly(child.lateFinish)).filter(Boolean);
      const totalSlackDays = Math.min(...children.map((child) => Number(child.totalSlackDays)).filter(Number.isFinite));
      const freeSlackDays = Math.min(...children.map((child) => Number(child.freeSlackDays)).filter(Number.isFinite));
      task.earlyStart = earlyStarts.length ? toDateInputValue(new Date(Math.min(...earlyStarts.map(Number)))) : "";
      task.earlyFinish = earlyFinishes.length ? toDateInputValue(new Date(Math.max(...earlyFinishes.map(Number)))) : "";
      task.lateStart = lateStarts.length ? toDateInputValue(new Date(Math.min(...lateStarts.map(Number)))) : "";
      task.lateFinish = lateFinishes.length ? toDateInputValue(new Date(Math.max(...lateFinishes.map(Number)))) : "";
      task.totalSlackDays = Number.isFinite(totalSlackDays) ? Math.max(0, totalSlackDays) : 0;
      task.freeSlackDays = Number.isFinite(freeSlackDays) ? Math.max(0, freeSlackDays) : task.totalSlackDays;
      task.totalSlackMinutes = task.totalSlackDays * minutesPerDay;
      task.freeSlackMinutes = task.freeSlackDays * minutesPerDay;
      task.isCritical = children.some((child) => child.isCritical);
      task.critical = task.isCritical;
      task.criticalPathWarning = children.find((child) => child.criticalPathWarning)?.criticalPathWarning || "";
    }
  }

  function topologicalOrder(nodes) {
    const indegree = new Map([...nodes.keys()].map((id) => [id, 0]));
    nodes.forEach((node) => {
      node.outgoing.forEach((edge) => indegree.set(edge.succ, (indegree.get(edge.succ) || 0) + 1));
    });
    const ready = [...indegree.entries()].filter(([, count]) => count === 0).map(([id]) => id).sort((a, b) => getNodeIndex(nodes, a) - getNodeIndex(nodes, b));
    const order = [];
    while (ready.length) {
      const id = ready.shift();
      order.push(id);
      const node = nodes.get(id);
      node.outgoing.forEach((edge) => {
        const next = edge.succ;
        indegree.set(next, (indegree.get(next) || 0) - 1);
        if (indegree.get(next) === 0) {
          ready.push(next);
          ready.sort((a, b) => getNodeIndex(nodes, a) - getNodeIndex(nodes, b));
        }
      });
    }
    return order;
  }

  function getNodeIndex(nodes, id) {
    return nodes.get(id)?.index ?? 999999;
  }

  function successorRequiredStart(pred, succ, edge) {
    if (edge.type === "SS") return pred.es + edge.lagDays;
    if (edge.type === "FF") return pred.ef + edge.lagDays - succ.span;
    if (edge.type === "SF") return pred.es + edge.lagDays - succ.span;
    return pred.ef + 1 + edge.lagDays;
  }

  function predecessorLatestFinish(pred, succ, edge) {
    if (edge.type === "SS") return succ.ls - edge.lagDays + pred.span;
    if (edge.type === "FF") return succ.lf - edge.lagDays;
    if (edge.type === "SF") return succ.lf - edge.lagDays + pred.span;
    return succ.ls - 1 - edge.lagDays;
  }

  function calculateFreeSlackDays(node, nodes, fallback) {
    if (!node.outgoing.length) return fallback;
    const values = node.outgoing.map((edge) => {
      const succ = nodes.get(edge.succ);
      if (!succ) return fallback;
      if (edge.type === "SS") return succ.es - (node.es + edge.lagDays);
      if (edge.type === "FF") return succ.ef - (node.ef + edge.lagDays);
      if (edge.type === "SF") return succ.ef - (node.es + edge.lagDays);
      return succ.es - (node.ef + 1 + edge.lagDays);
    });
    return Math.min(fallback, ...values);
  }

  function chooseReferenceDate() {
    const starts = (state.tasks || []).map((task) => dateOnly(task.start)).filter(Boolean);
    starts.push(dateOnly(state.projectStart) || dateOnly(today) || new Date());
    const earliest = new Date(Math.min(...starts.map(Number)));
    return toDateInputValue(typeof nextWorkingDay === "function" ? nextWorkingDay(earliest, true) : earliest);
  }

  function workingIndex(value, reference) {
    const ref = dateOnly(reference) || dateOnly(state.projectStart) || dateOnly(today) || new Date();
    let target = dateOnly(value) || ref;
    if (typeof nextWorkingDay === "function") target = nextWorkingDay(target, true);
    let cursor = dateOnly(ref);
    let index = 0;
    let guard = 0;
    while (cursor < target && guard < 8000) {
      cursor = addDaysSafe(cursor, 1);
      if (isWorkingDaySafe(cursor)) index += 1;
      guard += 1;
    }
    while (cursor > target && guard < 16000) {
      if (isWorkingDaySafe(cursor)) index -= 1;
      cursor = addDaysSafe(cursor, -1);
      guard += 1;
    }
    return index;
  }

  function dateFromWorkingIndex(index, reference) {
    let cursor = dateOnly(reference) || dateOnly(state.projectStart) || dateOnly(today) || new Date();
    let remaining = Math.round(Number(index) || 0);
    let guard = 0;
    while (remaining > 0 && guard < 8000) {
      cursor = addDaysSafe(cursor, 1);
      if (isWorkingDaySafe(cursor)) remaining -= 1;
      guard += 1;
    }
    while (remaining < 0 && guard < 16000) {
      cursor = addDaysSafe(cursor, -1);
      if (isWorkingDaySafe(cursor)) remaining += 1;
      guard += 1;
    }
    return toDateInputValue(cursor);
  }

  function getTaskDurationDays(task) {
    const minutes = normalizeDurationMinutesSafe(task?.durationMinutes, 0);
    if (minutes <= 0) return 0;
    if (typeof durationMinutesToWorkingDays === "function") return Math.max(1, durationMinutesToWorkingDays(minutes));
    return Math.max(1, Math.round(minutes / getMinutesPerDay()));
  }

  function durationSpan(durationDays) {
    return Math.max(0, Math.round(Number(durationDays) || 0) - 1);
  }

  function finishIndexFromStart(startIndex, durationDays) {
    return startIndex + durationSpan(durationDays);
  }

  function startIndexFromFinish(finishIndex, durationDays) {
    return finishIndex - durationSpan(durationDays);
  }

  function lagMinutesToDays(lagMinutes) {
    const minutes = Number(lagMinutes) || 0;
    if (!minutes) return 0;
    const sign = minutes > 0 ? 1 : -1;
    const absolute = Math.abs(minutes);
    if (typeof durationMinutesToWorkingDays === "function") return sign * Math.max(1, durationMinutesToWorkingDays(absolute));
    return sign * Math.max(1, Math.round(absolute / getMinutesPerDay()));
  }

  function getMinutesPerDay() {
    try {
      return Math.max(1, Number(getCalendar?.().minutesPerDay) || 480);
    } catch {
      return 480;
    }
  }

  function normalizeDurationMinutesSafe(value, fallback = 0) {
    try {
      return typeof normalizeDurationMinutes === "function" ? normalizeDurationMinutes(value, fallback) : Math.max(0, Number(value) || fallback || 0);
    } catch {
      return Math.max(0, Number(value) || fallback || 0);
    }
  }

  function getLinksForTask(task) {
    try {
      return typeof getTaskLinks === "function" ? getTaskLinks(task) : (Array.isArray(task?.links) ? task.links : []);
    } catch {
      return Array.isArray(task?.links) ? task.links : [];
    }
  }

  function normalizeLinkTypeSafe(type) {
    try {
      return typeof normalizeLinkType === "function" ? normalizeLinkType(type) : (["FS", "SS", "FF", "SF"].includes(type) ? type : "FS");
    } catch {
      return "FS";
    }
  }

  function addDaysSafe(value, days) {
    if (typeof addDays === "function") return addDays(value, days);
    const date = dateOnly(value) || new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  function isWorkingDaySafe(value) {
    try {
      return typeof isWorkingDay === "function" ? isWorkingDay(value) : ![0, 6].includes(dateOnly(value)?.getDay());
    } catch {
      const date = dateOnly(value);
      return date ? ![0, 6].includes(date.getDay()) : false;
    }
  }

  function isSummaryRow(index) {
    try {
      return typeof isSummaryIndex === "function" ? isSummaryIndex(index) : Boolean(state.tasks?.[index]?.isSummary);
    } catch {
      return Boolean(state.tasks?.[index]?.isSummary);
    }
  }

  function getLeafTasksForSummary(index) {
    try {
      if (typeof getRollupLeafTasks === "function") return getRollupLeafTasks(index);
    } catch {
      // Fall through.
    }
    const task = state.tasks[index];
    if (!task) return [];
    const level = Number(task.outlineLevel) || 1;
    const rows = [];
    for (let i = index + 1; i < state.tasks.length; i += 1) {
      const candidateLevel = Number(state.tasks[i]?.outlineLevel) || 1;
      if (candidateLevel <= level) break;
      if (!isSummaryRow(i)) rows.push(state.tasks[i]);
    }
    return rows;
  }

  function getCriticalSnapshot(task) {
    const minutesPerDay = getMinutesPerDay();
    const totalSlackMinutes = normalizeDurationMinutesSafe(task?.totalSlackMinutes, 0);
    const freeSlackMinutes = normalizeDurationMinutesSafe(task?.freeSlackMinutes, 0);
    const totalSlackDays = Number.isFinite(Number(task?.totalSlackDays)) ? Number(task.totalSlackDays) : Math.round(totalSlackMinutes / minutesPerDay);
    const freeSlackDays = Number.isFinite(Number(task?.freeSlackDays)) ? Number(task.freeSlackDays) : Math.round(freeSlackMinutes / minutesPerDay);
    return {
      earlyStart: task?.earlyStart || "",
      earlyFinish: task?.earlyFinish || "",
      lateStart: task?.lateStart || "",
      lateFinish: task?.lateFinish || "",
      totalSlackDays: Math.max(0, totalSlackDays || 0),
      freeSlackDays: Math.max(0, freeSlackDays || 0),
      isCritical: Boolean(task?.isCritical || task?.critical),
      warning: task?.criticalPathWarning || "",
    };
  }

  function decorateCriticalPathRows() {
    if (!Array.isArray(state.tasks)) return;
    document.querySelectorAll(".planner-row[data-row-index]").forEach((row) => {
      const index = Number(row.dataset.rowIndex);
      const task = state.tasks[index];
      if (!task) return;
      const snapshot = getCriticalSnapshot(task);
      row.classList.toggle("is-critical-task", snapshot.isCritical);
      decorateCriticalNameCell(row, task, snapshot);
      decorateCriticalGanttBar(row, task, snapshot);
    });
  }

  function decorateCriticalNameCell(row, task, snapshot) {
    const cell = row.querySelector(".task-name-cell");
    if (!cell) return;
    let badge = cell.querySelector(".critical-slack-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "critical-slack-badge";
      cell.appendChild(badge);
    }
    badge.classList.toggle("is-critical", snapshot.isCritical);
    badge.textContent = snapshot.isCritical ? "Critical" : `Slack ${formatSlackDays(snapshot.totalSlackDays)}`;
    badge.title = snapshot.isCritical
      ? "Critical task: zero total slack."
      : `Total slack ${formatSlackDays(snapshot.totalSlackDays)} · Free slack ${formatSlackDays(snapshot.freeSlackDays)}.`;
  }

  function decorateCriticalGanttBar(row, task, snapshot) {
    const bar = row.querySelector(".gantt-bar");
    const ganttRow = row.querySelector(".gantt-row");
    if (!bar || !ganttRow) return;
    bar.classList.toggle("is-critical", snapshot.isCritical);
    const baseTitle = `${task.name || "Task"}: ${task.start || "?"} to ${task.finish || "?"}`;
    const scheduleText = snapshot.isCritical ? "Critical path" : `Total slack ${formatSlackDays(snapshot.totalSlackDays)}`;
    bar.title = `${baseTitle} · ${scheduleText} · Free slack ${formatSlackDays(snapshot.freeSlackDays)}`;

    let slack = ganttRow.querySelector(".gantt-slack-bar");
    if (snapshot.isCritical || snapshot.totalSlackDays <= 0) {
      slack?.remove();
      return;
    }
    if (!slack) {
      slack = document.createElement("div");
      slack.className = "gantt-slack-bar";
      ganttRow.appendChild(slack);
    }
    const dayWidth = Number(uiPrefs?.dayWidth) || 58;
    const left = Number.parseFloat(bar.style.left || "0") || 0;
    const width = Number.parseFloat(bar.style.width || "0") || 0;
    const slackWidth = Math.max(24, snapshot.totalSlackDays * dayWidth - 8);
    slack.style.left = `${left + width + 6}px`;
    slack.style.width = `${slackWidth}px`;
    slack.dataset.slackLabel = formatSlackDays(snapshot.totalSlackDays);
    slack.title = `${task.name || "Task"}: ${formatSlackDays(snapshot.totalSlackDays)} total slack.`;
  }

  function refreshCriticalTaskInfoPanel(force = false) {
    if (!Number.isInteger(taskInfoIndex) || taskInfoIndex < 0 || taskInfoIndex >= state.tasks.length) return;
    if (!force && els.taskInfoModal && els.taskInfoModal.hidden) return;
    installCriticalTaskInfoUi();
    const task = state.tasks[taskInfoIndex];
    const snapshot = getCriticalSnapshot(task);
    const summary = document.getElementById("tiCriticalSummary");
    if (summary) {
      summary.classList.toggle("is-critical", snapshot.isCritical);
      summary.textContent = snapshot.warning
        ? snapshot.warning
        : snapshot.isCritical
          ? "Critical task · zero total slack"
          : `Not critical · ${formatSlackDays(snapshot.totalSlackDays)} total slack · ${formatSlackDays(snapshot.freeSlackDays)} free slack`;
    }
    setInputValue("tiEarlyStart", snapshot.earlyStart || "—");
    setInputValue("tiEarlyFinish", snapshot.earlyFinish || "—");
    setInputValue("tiLateStart", snapshot.lateStart || "—");
    setInputValue("tiLateFinish", snapshot.lateFinish || "—");
    setInputValue("tiTotalSlack", formatSlackDays(snapshot.totalSlackDays));
    setInputValue("tiFreeSlack", formatSlackDays(snapshot.freeSlackDays));
    setInputValue("tiCriticalFlag", snapshot.isCritical ? "Yes" : "No");
  }

  function setInputValue(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = value;
  }

  function updateCriticalPathLabels() {
    const leafTasks = (state.tasks || []).filter((task, index) => task && !isSummaryRow(index));
    const critical = leafTasks.filter((task) => task.isCritical);
    const slackTasks = leafTasks.filter((task) => !task.isCritical && Number(task.totalSlackDays) > 0);
    const count = document.getElementById("criticalTaskCount");
    const summary = document.getElementById("criticalTaskSummary");
    if (count) count.textContent = String(critical.length);
    if (summary) {
      const finish = state.criticalPath?.projectFinish ? `Finish ${formatFriendlyDateSafe(state.criticalPath.projectFinish)}` : "No finish yet";
      summary.textContent = state.criticalPath?.hasCycle
        ? "Fix dependency cycle"
        : `${finish} · ${slackTasks.length} with float`;
    }

    const badge = document.getElementById("appVersionBadge");
    const footer = document.getElementById("appVersionFooter");
    const ribbon = document.getElementById("ribbonVersionText");
    const label = `${CRITICAL_VERSION} · ${CRITICAL_VERSION_NAME}`;
    if (badge) {
      badge.textContent = label;
      badge.title = `Build ${CRITICAL_BUILD_DATE}`;
    }
    if (footer) footer.textContent = `${label} · Build ${CRITICAL_BUILD_DATE}`;
    if (ribbon) ribbon.textContent = `${label} · ${critical.length} critical task${critical.length === 1 ? "" : "s"}`;

    document.querySelectorAll("[data-ribbon-message]").forEach((button) => {
      if ((button.dataset.ribbonMessage || "").includes("critical path reports are next")) {
        button.dataset.ribbonMessage = "Critical path analysis is active. Red Gantt bars are critical; slack badges show float days.";
      }
    });
  }

  function formatSlackDays(days) {
    const n = Math.max(0, Math.round(Number(days) || 0));
    return `${n}d`;
  }

  function formatFriendlyDateSafe(value) {
    try {
      return typeof formatFriendlyDate === "function" ? formatFriendlyDate(value) : (dateOnly(value)?.toLocaleDateString?.() || value || "unknown");
    } catch {
      return value || "unknown";
    }
  }

  function escapeSafe(value) {
    if (typeof escapeXml === "function") return escapeXml(value);
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
})();
