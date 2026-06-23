(() => {
  const STITCH_CANVAS_VERSION = "v0.25.0";
  const WEEK_WIDTH = 64;
  let hoverHideTimer = null;
  let activeHoverIndex = null;

  function boot() {
    if (typeof state === "undefined") return;
    document.body.classList.add("projecthub-stitch-theme");
    installSidebar();
    installHealthCard();
    installCanvas();
    patchRender();
    refreshStitchCanvas();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  function patchRender() {
    if (window.__stitchCanvasRenderPatched || typeof render !== "function") return;
    window.__stitchCanvasRenderPatched = true;
    const baseRender = render;
    render = function stitchCanvasRender() {
      baseRender();
      refreshStitchCanvas();
    };
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
    document.querySelector("main")?.prepend(card);
  }

  function installCanvas() {
    if (document.getElementById("stitchCanvas")) return;
    const host = document.querySelector(".unified-card");
    if (!host) return;
    const canvas = document.createElement("section");
    canvas.className = "stitch-canvas";
    canvas.id = "stitchCanvas";
    canvas.setAttribute("aria-label", "ProjectHub task list and Gantt chart");
    canvas.innerHTML = `
      <article class="stitch-pane stitch-task-pane">
        <header class="stitch-pane-header"><h3>Task List</h3><span class="stitch-more">•••</span></header>
        <div class="stitch-task-toolbar"><span class="stitch-check-all"></span><strong>Task</strong></div>
        <div class="stitch-task-list" id="stitchTaskList"></div>
        <aside class="stitch-detail-popover" id="stitchDetailPopover" aria-live="polite"></aside>
      </article>
      <article class="stitch-pane stitch-gantt-pane">
        <header class="stitch-pane-header"><h3>Gantt Chart View</h3><span class="stitch-more">•••</span></header>
        <div class="stitch-gantt-toolbar"><span class="stitch-pill-tab">Timeline</span><span class="stitch-pill-tab is-green">Weeks</span></div>
        <div class="stitch-gantt-shell" id="stitchGanttShell"><div class="stitch-gantt-content" id="stitchGanttContent"></div></div>
      </article>`;
    host.appendChild(canvas);
    canvas.addEventListener("mouseover", handleCanvasHover);
    canvas.addEventListener("mouseout", handleCanvasOut);
    canvas.addEventListener("click", handleCanvasClick);
    canvas.addEventListener("dblclick", handleCanvasDblClick);
  }

  function refreshStitchCanvas() {
    document.body.classList.add("projecthub-stitch-theme");
    updateCopy();
    updateVersionLabels();
    renderHealth();
    renderTaskList();
    renderGanttCanvas();
  }

  function updateCopy() {
    const title = document.querySelector(".hero-copy h2");
    if (title) title.textContent = "Interactive Project Canvas View";
    const copy = document.querySelector(".hero-copy p");
    if (copy) copy.textContent = "ProjectHub-style task cards, hover details, and Gantt timing in one clean canvas.";
  }

  function updateVersionLabels() {
    const label = `${STITCH_CANVAS_VERSION} · ProjectHub two-pane canvas`;
    const badge = document.getElementById("appVersionBadge");
    const footer = document.getElementById("appVersionFooter");
    const ribbon = document.getElementById("ribbonVersionText");
    if (badge) badge.textContent = label;
    if (footer) footer.textContent = `${label} · Build 2026-06-23`;
    if (ribbon) ribbon.textContent = label;
  }

  function getRows() {
    if (typeof getVisibleTaskRows === "function") return getVisibleTaskRows();
    return (state.tasks || []).map((task, index) => ({ task, index }));
  }

  function getLeafTasks(tasks = state.tasks || []) {
    return tasks.filter((_, index) => !(typeof isSummaryIndex === "function" && isSummaryIndex(index)));
  }

  function renderHealth() {
    const card = document.getElementById("stitchHealthCard");
    if (!card) return;
    const tasks = state.tasks || [];
    const leafTasks = getLeafTasks(tasks);
    const percent = getProjectPercent(leafTasks.length ? leafTasks : tasks);
    const late = countLate(tasks);
    const warningCount = countWarnings(tasks);
    const status = late ? "Needs Attention" : warningCount ? "Watch" : "On Track";
    const statusClass = late ? "is-bad" : warningCount ? "is-warn" : "is-good";
    const budget = getBudgetText(tasks);
    card.innerHTML = `
      <strong>Project Health</strong>
      <p>Progress: ${percent}% <span class="${statusClass}">(${status})</span></p>
      <p>${escapeHtml(budget)}</p>
      <p>Risks: <span class="${late ? "is-bad" : "is-good"}">${late} High</span>, <span class="${warningCount ? "is-warn" : "is-good"}">${warningCount} Medium</span></p>`;
  }

  function renderTaskList() {
    const list = document.getElementById("stitchTaskList");
    if (!list) return;
    const rows = getRows();
    if (!rows.length) {
      list.innerHTML = `<div class="stitch-task-empty"><strong>No tasks yet.</strong><br>Add a task to start building the schedule.</div>`;
      return;
    }
    const fallbackActive = getDefaultActiveIndex(rows);
    const selected = Number.isInteger(selectedTaskIndex) ? selectedTaskIndex : fallbackActive;
    list.innerHTML = rows.map(({ task, index }) => taskCardMarkup(task, index, selected === index)).join("");
  }

  function taskCardMarkup(task, index, active) {
    const percent = pct(task.percent);
    const status = getStatus(percent);
    const complete = percent >= 100;
    const assignees = getAssigneeText(task);
    const classes = ["stitch-task-card-row"];
    if (active) classes.push("is-active");
    if (complete) classes.push("is-complete");
    const chipClass = complete ? "is-complete" : percent > 0 ? "is-progress" : "";
    const title = task.name || `Task ${index + 1}`;
    return `
      <div class="${classes.join(" ")}" data-stitch-index="${index}" tabindex="0" role="button" aria-label="${escapeHtml(title)}">
        <span class="stitch-check">✓</span>
        <div class="stitch-task-main">
          <div class="stitch-task-title">
            <span class="stitch-task-name">${escapeHtml(title)}</span>
            <span class="stitch-status-chip ${chipClass}">${escapeHtml(status)}</span>
          </div>
          <div class="stitch-task-meta">
            <span>${escapeHtml(assignees)}</span>
            <span class="stitch-progress-track" style="--pct:${percent}%"><span></span></span>
            <span>${percent}%</span>
          </div>
        </div>
        <span class="stitch-arrow">→</span>
        <span class="stitch-link-mini">⌁</span>
      </div>`;
  }

  function renderGanttCanvas() {
    const content = document.getElementById("stitchGanttContent");
    if (!content) return;
    const rows = getRows().filter(({ task }) => parseDate(task.start) && parseDate(task.finish));
    if (!rows.length) {
      content.innerHTML = `<div class="stitch-gantt-empty">No dated tasks yet.</div>`;
      return;
    }
    const bounds = getTimelineBounds(rows);
    const weeks = getWeeks(bounds.min, bounds.max);
    const width = Math.max(680, weeks.length * WEEK_WIDTH);
    const rowHeight = 56;
    const barsTop = 60;
    const contentHeight = barsTop + rows.length * rowHeight + 24;
    const todayDate = parseDate(new Date());
    const todayLeft = todayDate ? Math.max(0, Math.floor(daysDiff(bounds.min, todayDate) / 7) * WEEK_WIDTH) : -9999;
    const monthMarkup = renderMonthRow(weeks);
    const weekMarkup = weeks.map((week) => `<div class="stitch-week-cell" style="width:${WEEK_WIDTH}px">${week.date.getDate()}</div>`).join("");
    const rowsMarkup = rows.map(({ task, index }, order) => {
      const start = parseDate(task.start);
      const finish = parseDate(task.finish);
      const left = Math.max(0, daysDiff(bounds.min, start) / 7 * WEEK_WIDTH);
      const durationDays = Math.max(1, daysDiff(start, finish) + 1);
      const barWidth = Math.max(84, durationDays / 7 * WEEK_WIDTH);
      const percent = pct(task.percent);
      const top = order * rowHeight;
      const name = task.name || `Task ${index + 1}`;
      return `
        <div class="stitch-gantt-row" style="top:${top}px;width:${width}px"></div>
        <div class="stitch-gantt-bar" data-stitch-index="${index}" style="top:${top + 11}px;left:${left}px;width:${barWidth}px;--pct:${percent}%" title="${escapeHtml(name)} · ${percent}%">
          <span>${escapeHtml(name)} (${percent}%)</span>
        </div>`;
    }).join("");
    content.style.width = `${width}px`;
    content.style.height = `${contentHeight}px`;
    content.innerHTML = `
      <div class="stitch-month-row" style="width:${width}px">${monthMarkup}</div>
      <div class="stitch-week-row" style="width:${width}px">${weekMarkup}</div>
      <div class="stitch-grid-layer" style="--week-width:${WEEK_WIDTH}px"></div>
      <div class="stitch-today-band" style="left:${todayLeft}px;--week-width:${WEEK_WIDTH}px"></div>
      <div class="stitch-gantt-bars" style="height:${rows.length * rowHeight}px;width:${width}px">${rowsMarkup}</div>`;
  }

  function renderMonthRow(weeks) {
    const groups = [];
    weeks.forEach((week) => {
      const key = `${week.date.getFullYear()}-${week.date.getMonth()}`;
      const label = week.date.toLocaleDateString([], { month: "short" });
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.count += 1;
      else groups.push({ key, label, count: 1 });
    });
    return groups.map((group) => `<div class="stitch-month-cell" style="width:${group.count * WEEK_WIDTH}px">${escapeHtml(group.label)}</div>`).join("");
  }

  function showDetailFor(index, anchor = null) {
    const popover = document.getElementById("stitchDetailPopover");
    const task = state.tasks?.[index];
    if (!popover || !task) return;
    clearTimeout(hoverHideTimer);
    activeHoverIndex = index;
    popover.innerHTML = detailMarkup(task, index);
    if (anchor) {
      const pane = anchor.closest(".stitch-task-pane");
      const paneRect = pane.getBoundingClientRect();
      const rowRect = anchor.getBoundingClientRect();
      const desired = Math.max(58, rowRect.top - paneRect.top - 6);
      const maxTop = Math.max(58, paneRect.height - 430);
      popover.style.top = `${Math.min(desired, maxTop)}px`;
    }
    popover.classList.add("is-open");
  }

  function hideDetailSoon() {
    clearTimeout(hoverHideTimer);
    hoverHideTimer = setTimeout(() => {
      const popover = document.getElementById("stitchDetailPopover");
      popover?.classList.remove("is-open");
      activeHoverIndex = null;
    }, 160);
  }

  function detailMarkup(task, index) {
    const percent = pct(task.percent);
    const title = task.name || `Task ${index + 1}`;
    const status = `${getStatus(percent)} · ${percent}% complete`;
    const due = friendlyDate(task.finish || task.deadline);
    const assignees = getAssigneeText(task);
    const deps = task.links?.length && typeof formatLinks === "function" ? formatLinks(task.links) : "None";
    const notes = String(task.notes || "No description yet. Add notes in Task Information to fill this panel.").trim();
    return `
      <p class="stitch-detail-kicker">Task</p>
      <h3>${escapeHtml(title)}</h3>
      <dl>
        <div><dt>Status</dt><dd>${escapeHtml(status)}</dd></div>
        <div><dt>Due</dt><dd>${escapeHtml(due)}</dd></div>
        <div><dt>Assignees</dt><dd>${escapeHtml(assignees)}</dd></div>
        <div><dt>Dependencies</dt><dd>${escapeHtml(deps)}</dd></div>
        <div><dt>Description</dt><dd>${escapeHtml(notes)}</dd></div>
        <div><dt>Resource Allocation</dt><dd>${resourceMarkup(task)}</dd></div>
        <div><dt>Predecessors</dt><dd>${escapeHtml(deps)} 🔗</dd></div>
      </dl>`;
  }

  function resourceMarkup(task) {
    const assignments = Array.isArray(task.assignments) ? task.assignments : [];
    if (!assignments.length) return "No resources assigned yet.";
    return assignments.slice(0, 4).map((assignment) => {
      const name = getResourceName(assignment.resourceUid) || "Resource";
      const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "R";
      const work = typeof formatWork === "function" ? formatWork(assignment.workMinutes || 0) : `${Math.round((Number(assignment.workMinutes) || 0) / 60)}h`;
      return `<span class="stitch-resource-row"><span class="stitch-resource-person"><span class="stitch-avatar">${escapeHtml(initials)}</span>${escapeHtml(name)}</span><span>${escapeHtml(work)}</span></span>`;
    }).join("");
  }

  function handleCanvasHover(event) {
    const row = event.target.closest("[data-stitch-index]");
    if (!row || !document.getElementById("stitchCanvas")?.contains(row)) return;
    const index = Number(row.dataset.stitchIndex);
    if (Number.isInteger(index) && index !== activeHoverIndex) showDetailFor(index, row);
  }

  function handleCanvasOut(event) {
    const canvas = document.getElementById("stitchCanvas");
    if (!canvas || canvas.contains(event.relatedTarget)) return;
    hideDetailSoon();
  }

  function handleCanvasClick(event) {
    const row = event.target.closest("[data-stitch-index]");
    if (!row) return;
    const index = Number(row.dataset.stitchIndex);
    if (!Number.isInteger(index)) return;
    if (typeof selectTask === "function") selectTask(index);
    showDetailFor(index, row);
  }

  function handleCanvasDblClick(event) {
    const row = event.target.closest("[data-stitch-index]");
    if (!row) return;
    const index = Number(row.dataset.stitchIndex);
    if (Number.isInteger(index) && typeof openTaskInfo === "function") openTaskInfo(index);
  }

  function getDefaultActiveIndex(rows) {
    const inProgress = rows.find(({ task, index }) => pct(task.percent) > 0 && pct(task.percent) < 100 && !(typeof isSummaryIndex === "function" && isSummaryIndex(index)));
    if (inProgress) return inProgress.index;
    return rows[0]?.index ?? 0;
  }

  function getStatus(percent) {
    if (percent >= 100) return "Completed";
    if (percent > 0) return "In Progress";
    return "Not Started";
  }

  function pct(value) {
    return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
  }

  function getProjectPercent(tasks) {
    if (!tasks.length) return 0;
    if (typeof calculateWeightedPercent === "function") return calculateWeightedPercent(tasks);
    return Math.round(tasks.reduce((sum, task) => sum + pct(task.percent), 0) / tasks.length);
  }

  function countLate(tasks) {
    return tasks.reduce((count, task) => {
      const base = parseDate(task.baseline?.finish);
      const finish = parseDate(task.finish);
      return base && finish && finish > base ? count + 1 : count;
    }, 0);
  }

  function countWarnings(tasks) {
    return tasks.reduce((count, task) => {
      const warnings = typeof getTaskConstraintWarnings === "function" ? getTaskConstraintWarnings(task).length : 0;
      const deadline = parseDate(task.deadline);
      const finish = parseDate(task.finish);
      return count + (warnings || (deadline && finish && finish > deadline) ? 1 : 0);
    }, 0);
  }

  function getBudgetText(tasks) {
    const cost = tasks.reduce((sum, task) => {
      if (typeof summarizeTaskAssignments !== "function") return sum;
      return sum + (Number(summarizeTaskAssignments(task).totalCost) || 0);
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

  function getResourceName(uid) {
    const resource = Array.isArray(state.resources) ? state.resources.find((item) => Number(item.uid) === Number(uid)) : null;
    return resource?.name || "";
  }

  function friendlyDate(value) {
    if (!value) return "No date";
    if (typeof formatFriendlyDate === "function") return formatFriendlyDate(value);
    const date = parseDate(value);
    return date ? date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }) : "No date";
  }

  function getTimelineBounds(rows) {
    const dates = [];
    rows.forEach(({ task }) => {
      const start = parseDate(task.start);
      const finish = parseDate(task.finish);
      if (start) dates.push(start);
      if (finish) dates.push(finish);
    });
    let min = new Date(Math.min(...dates.map(Number)));
    let max = new Date(Math.max(...dates.map(Number)));
    min.setDate(min.getDate() - 14);
    max.setDate(max.getDate() + 28);
    min = startOfWeek(min);
    max = startOfWeek(max);
    return { min, max };
  }

  function getWeeks(min, max) {
    const weeks = [];
    let cursor = startOfWeek(min);
    const end = startOfWeek(max);
    while (cursor <= end) {
      weeks.push({ date: new Date(cursor) });
      cursor.setDate(cursor.getDate() + 7);
    }
    return weeks;
  }

  function startOfWeek(date) {
    const d = parseDate(date);
    if (!d) return new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    return d;
  }

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    if (typeof dateOnly === "function") return dateOnly(value);
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysDiff(a, b) {
    const start = parseDate(a);
    const end = parseDate(b);
    if (!start || !end) return 0;
    return Math.round((end - start) / 86400000);
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
