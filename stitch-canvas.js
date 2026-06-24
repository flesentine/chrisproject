(() => {
  const STITCH_CANVAS_VERSION = "v0.25.4";
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
    canvas.className = "stitch-canvas stitch-logic-canvas";
    canvas.id = "stitchCanvas";
    canvas.setAttribute("aria-label", "ProjectHub task logic and dependencies view");
    canvas.innerHTML = `
      <article class="stitch-pane stitch-task-pane">
        <header class="stitch-pane-header"><h3>Task List</h3><span class="stitch-more">•••</span></header>
        <div class="stitch-task-toolbar stitch-logic-toolbar"><span class="stitch-check-all"></span><strong>Task</strong><strong>Predecessors</strong><strong>Successors</strong></div>
        <div class="stitch-task-list" id="stitchTaskList"></div>
        <aside class="stitch-detail-popover" id="stitchDetailPopover" aria-live="polite"></aside>
      </article>
      <article class="stitch-pane stitch-gantt-pane">
        <header class="stitch-pane-header"><h3>Gantt Chart View</h3><span class="stitch-more">•••</span></header>
        <div class="stitch-gantt-toolbar"><span class="stitch-pill-tab">Timeline</span><span class="stitch-pill-tab is-green">Weeks</span><button class="stitch-classic-link-btn" type="button" data-stitch-action="classic-links">Classic links</button></div>
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
    if (title) title.textContent = "Task Logic & Dependencies View";
    const copy = document.querySelector(".hero-copy p");
    if (copy) copy.textContent = "ProjectHub-style task cards with predecessor/successor logic, dependency lines, hover details, and access to the classic rubberband link editor.";
  }

  function updateVersionLabels() {
    const label = `${STITCH_CANVAS_VERSION} · ProjectHub dependency canvas`;
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
    const logicCount = tasks.reduce((sum, task) => sum + getLinks(task).length, 0);
    const status = late ? "Needs Attention" : warningCount ? "Watch" : "On Track";
    const statusClass = late ? "is-bad" : warningCount ? "is-warn" : "is-good";
    card.innerHTML = `
      <strong>Project Health</strong>
      <p>Progress: ${percent}% <span class="${statusClass}">(${status})</span></p>
      <p>Logic: ${logicCount} link${logicCount === 1 ? "" : "s"}</p>
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
    const classes = ["stitch-task-card-row", "is-logic-row"];
    if (active) classes.push("is-active");
    if (complete) classes.push("is-complete");
    const chipClass = complete ? "is-complete" : percent > 0 ? "is-progress" : "";
    const title = task.name || `Task ${index + 1}`;
    const predecessorText = formatPredecessorBadges(task);
    const successorText = formatSuccessorBadges(task.id);
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
            <span class="stitch-link-mini" title="Open Task Information">⌁</span>
          </div>
        </div>
        <div class="stitch-logic-cell predecessor-cell">${predecessorText}</div>
        <div class="stitch-logic-cell successor-cell">${successorText}</div>
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
    const barMeta = [];
    const rowsMarkup = rows.map(({ task, index }, order) => {
      const start = parseDate(task.start);
      const finish = parseDate(task.finish);
      const left = Math.max(0, daysDiff(bounds.min, start) / 7 * WEEK_WIDTH);
      const durationDays = Math.max(1, daysDiff(start, finish) + 1);
      const barWidth = Math.max(84, durationDays / 7 * WEEK_WIDTH);
      const percent = pct(task.percent);
      const top = order * rowHeight;
      const name = task.name || `Task ${index + 1}`;
      barMeta.push({ id: Number(task.id), index, order, left, width: barWidth, y: barsTop + top + 28 });
      return `
        <div class="stitch-gantt-row" style="top:${top}px;width:${width}px"></div>
        <div class="stitch-gantt-bar" data-stitch-index="${index}" style="top:${top + 11}px;left:${left}px;width:${barWidth}px;--pct:${percent}%" title="${escapeHtml(name)} · ${percent}%">
          <span>${escapeHtml(name)} (${percent}%)</span>
        </div>`;
    }).join("");
    const dependencyMarkup = renderDependencyLines(rows, barMeta, width, contentHeight);
    content.style.width = `${width}px`;
    content.style.height = `${contentHeight}px`;
    content.innerHTML = `
      <div class="stitch-month-row" style="width:${width}px">${monthMarkup}</div>
      <div class="stitch-week-row" style="width:${width}px">${weekMarkup}</div>
      <div class="stitch-grid-layer" style="--week-width:${WEEK_WIDTH}px"></div>
      <div class="stitch-today-band" style="left:${todayLeft}px;--week-width:${WEEK_WIDTH}px"></div>
      ${dependencyMarkup}
      <div class="stitch-gantt-bars" style="height:${rows.length * rowHeight}px;width:${width}px">${rowsMarkup}</div>`;
  }

  function renderDependencyLines(rows, barMeta, width, height) {
    const byId = new Map(barMeta.map((meta) => [Number(meta.id), meta]));
    const paths = [];
    rows.forEach(({ task }) => {
      const target = byId.get(Number(task.id));
      if (!target) return;
      getLinks(task).forEach((link) => {
        const source = byId.get(Number(link.id));
        if (!source) return;
        const type = String(link.type || "FS").toUpperCase();
        const fromX = type.startsWith("S") ? source.left : source.left + source.width;
        const toX = type.endsWith("F") ? target.left + target.width : target.left;
        const fromY = source.y;
        const toY = target.y;
        const elbow = Math.max(fromX + 18, Math.min(toX - 18, fromX + 42));
        const path = `M ${fromX} ${fromY} C ${elbow} ${fromY}, ${elbow} ${toY}, ${toX} ${toY}`;
        paths.push(`<path class="stitch-dependency-path" d="${path}"/><circle class="stitch-dependency-dot" cx="${toX}" cy="${toY}" r="3"/>`);
      });
    });
    if (!paths.length) return "";
    return `<svg class="stitch-dependency-layer" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${paths.join("")}</svg>`;
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
    const predecessorText = formatLinksDetailed(getLinks(task), "predecessor");
    const successorText = formatLinksDetailed(getSuccessorLinks(task.id), "successor");
    const notes = String(task.notes || "No description yet. Add notes in Task Information to fill this panel.").trim();
    return `
      <p class="stitch-detail-kicker">Task Logic</p>
      <h3>${escapeHtml(title)}</h3>
      <dl>
        <div><dt>Status</dt><dd>${escapeHtml(status)}</dd></div>
        <div><dt>Due</dt><dd>${escapeHtml(due)}</dd></div>
        <div><dt>Assignees</dt><dd>${escapeHtml(assignees)}</dd></div>
        <div><dt>Description</dt><dd>${escapeHtml(notes)}</dd></div>
        <div><dt>Resource Allocation</dt><dd>${resourceMarkup(task)}</dd></div>
        <div><dt>Network Logic</dt><dd><strong>Predecessor:</strong><br>${predecessorText}<br><br><strong>Successor:</strong><br>${successorText}</dd></div>
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
    const row = event.target.closest(".stitch-task-card-row[data-stitch-index]");
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
    const classic = event.target.closest("[data-stitch-action='classic-links']");
    if (classic) {
      document.body.classList.toggle("stitch-show-classic-links");
      classic.classList.toggle("is-active", document.body.classList.contains("stitch-show-classic-links"));
      return;
    }
    const linkBadge = event.target.closest("[data-logic-open]");
    if (linkBadge) {
      event.preventDefault();
      event.stopPropagation();
      const index = Number(linkBadge.dataset.logicOpen);
      if (Number.isInteger(index) && typeof openTaskInfo === "function") openTaskInfo(index);
      return;
    }
    const row = event.target.closest(".stitch-task-card-row[data-stitch-index]");
    if (!row) return;
    const index = Number(row.dataset.stitchIndex);
    if (!Number.isInteger(index)) return;
    if (typeof selectTask === "function") selectTask(index);
    showDetailFor(index, row);
  }

  function handleCanvasDblClick(event) {
    const row = event.target.closest(".stitch-task-card-row[data-stitch-index]");
    if (!row) return;
    const index = Number(row.dataset.stitchIndex);
    if (Number.isInteger(index) && typeof openTaskInfo === "function") openTaskInfo(index);
  }

  function getDefaultActiveIndex(rows) {
    const inProgress = rows.find(({ task, index }) => pct(task.percent) > 0 && pct(task.percent) < 100 && !(typeof isSummaryIndex === "function" && isSummaryIndex(index)));
    if (inProgress) return inProgress.index;
    return rows[0]?.index ?? 0;
  }

  function getLinks(task) {
    if (Array.isArray(task?.links)) return task.links;
    if (Array.isArray(task?.predecessors)) return task.predecessors.map((id) => ({ id, type: "FS", lagMinutes: 0 }));
    return [];
  }

  function getSuccessorLinks(taskId) {
    const id = Number(taskId);
    return (state.tasks || []).flatMap((candidate) => getLinks(candidate)
      .filter((link) => Number(link.id) === id)
      .map((link) => ({ id: candidate.id, type: link.type || "FS", lagMinutes: link.lagMinutes || 0, task: candidate })));
  }

  function formatPredecessorBadges(task) {
    const links = getLinks(task);
    if (!links.length) return `<span class="stitch-logic-empty">—</span>`;
    return links.slice(0, 3).map((link) => logicBadge(`${link.id}${String(link.type || "FS").toUpperCase()}`, task.id)).join("");
  }

  function formatSuccessorBadges(taskId) {
    const links = getSuccessorLinks(taskId);
    if (!links.length) return `<span class="stitch-logic-empty">—</span>`;
    return links.slice(0, 3).map((link) => logicBadge(`${link.id}${String(link.type || "FS").toUpperCase()}`, taskId)).join("");
  }

  function logicBadge(label, openTaskId) {
    const index = (state.tasks || []).findIndex((task) => Number(task.id) === Number(openTaskId));
    return `<button type="button" class="stitch-logic-badge" data-logic-open="${index}" title="Open Task Information to edit dependency">${escapeHtml(label)}</button>`;
  }

  function formatLinksDetailed(links, kind) {
    if (!links.length) return `No ${kind}s.`;
    return links.map((link) => {
      const task = link.task || (state.tasks || []).find((item) => Number(item.id) === Number(link.id));
      const type = String(link.type || "FS").toUpperCase();
      const name = task?.name || `Task ${link.id}`;
      return `[${link.id}] ${escapeHtml(name)} (${type})`;
    }).join("<br>");
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
