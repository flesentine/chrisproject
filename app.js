const STORAGE_KEY = "projectxml-planner-v1";
const UI_PREFS_KEY = "chris-discount-project-maker-ui-v2";
const MS_PROJECT_NS = "http://schemas.microsoft.com/project";
const MS_PROJECT_SCHEMA_LOCATION = "http://schemas.microsoft.com/project http://schemas.microsoft.com/project/2007/mspdi_pj12.xsd";
const LINK_TYPES = ["FS", "SS", "FF", "SF"];
const LINK_TYPE_LABELS = {
  FS: "Finish → Start",
  SS: "Start → Start",
  FF: "Finish → Finish",
  SF: "Start → Finish",
};
const LINK_TYPE_TO_PROJECT = { FF: 0, FS: 1, SS: 2, SF: 3 };
const PROJECT_TO_LINK_TYPE = { 0: "FF", 1: "FS", 2: "SS", 3: "SF" };

const FIELD_COLUMNS = [
  { key: "id", label: "ID", defaultWidth: 48, min: 40, max: 76 },
  { key: "wbs", label: "WBS", defaultWidth: 72, min: 48, max: 180 },
  { key: "name", label: "Task name", defaultWidth: 320, min: 190, max: 1100 },
  { key: "start", label: "Start", defaultWidth: 128, min: 112, max: 170 },
  { key: "finish", label: "Finish", defaultWidth: 128, min: 112, max: 170 },
  { key: "duration", label: "Dur", defaultWidth: 58, min: 48, max: 90 },
  { key: "percent", label: "%", defaultWidth: 86, min: 70, max: 130 },
  { key: "predecessors", label: "Pred", defaultWidth: 150, min: 92, max: 360 },
  { key: "successors", label: "Succ", defaultWidth: 150, min: 92, max: 360 },
  { key: "level", label: "Lvl", defaultWidth: 62, min: 52, max: 90 },
  { key: "actions", label: "", defaultWidth: 60, min: 44, max: 82 },
];
const FIELD_COLUMN_MAP = new Map(FIELD_COLUMNS.map((column) => [column.key, column]));
const SPLITTER_RESIZE_COLUMN = "name";
const MIN_FIELD_PANE_WIDTH = 260;
const els = {
  projectName: document.getElementById("projectName"),
  projectStart: document.getElementById("projectStart"),
  taskBody: document.getElementById("taskBody"),
  gantt: document.getElementById("gantt"),
  timeline: document.getElementById("timeline"),
  validationPanel: document.getElementById("validationPanel"),
  saveStatus: document.getElementById("saveStatus"),
  newProjectBtn: document.getElementById("newProjectBtn"),
  sampleBtn: document.getElementById("sampleBtn"),
  addTaskBtn: document.getElementById("addTaskBtn"),
  autoScheduleBtn: document.getElementById("autoScheduleBtn"),
  exportXmlBtn: document.getElementById("exportXmlBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  importXmlInput: document.getElementById("importXmlInput"),
  importMppInput: document.getElementById("importMppInput"),
  mppPanel: document.getElementById("mppPanel"),
  fileDropOverlay: document.getElementById("fileDropOverlay"),
  taskCount: document.getElementById("taskCount"),
  durationCount: document.getElementById("durationCount"),
  completeCount: document.getElementById("completeCount"),
  dateRange: document.getElementById("dateRange"),
  exportStatus: document.getElementById("exportStatus"),
  compatChip: document.getElementById("compatChip"),
  readinessCard: document.getElementById("readinessCard"),
  workspace: document.getElementById("workspace"),
  chartWidthControl: document.getElementById("chartWidthControl"),
  dayWidthControl: document.getElementById("dayWidthControl"),
  rowHeightControl: document.getElementById("rowHeightControl"),
  chartWidthValue: document.getElementById("chartWidthValue"),
  dayWidthValue: document.getElementById("dayWidthValue"),
  rowHeightValue: document.getElementById("rowHeightValue"),
  dependencyModal: document.getElementById("dependencyModal"),
  dependencyModalTitle: document.getElementById("dependencyModalTitle"),
  dependencyModalCopy: document.getElementById("dependencyModalCopy"),
  scheduleLinkModal: document.getElementById("scheduleLinkModal"),
  scheduleLinkTitle: document.getElementById("scheduleLinkTitle"),
  scheduleLinkCopy: document.getElementById("scheduleLinkCopy"),
  scheduleLinkPreview: document.getElementById("scheduleLinkPreview"),
  linkSuggestion: document.getElementById("linkSuggestion"),
  cascadeSuggestion: document.getElementById("cascadeSuggestion"),
  linkDragLayer: document.getElementById("linkDragLayer"),
  linkDragPath: document.getElementById("linkDragPath"),
  linkDragDot: document.getElementById("linkDragDot"),
  linkDragLabel: document.getElementById("linkDragLabel"),
};

const today = toDateInputValue(new Date());

let state = {
  projectName: "New Project",
  projectStart: today,
  nextUid: 2,
  tasks: [],
};

const DEFAULT_UI_PREFS = {
  fieldColumns: Object.fromEntries(FIELD_COLUMNS.map((column) => [column.key, column.defaultWidth])),
  fieldPaneWidth: null,
  dayWidth: 58,
  rowHeight: 56,
};

let uiPrefs = loadUiPrefs();
let activeBarDrag = null;
let activeColumnDrag = null;
let activeDependencyDrag = null;
let pendingDependencyChoice = null;
let pendingScheduleChoice = null;
let pendingCascadeChoice = null;
let lastMppFileName = null;
let lastMppResult = null;
let fileDragDepth = 0;

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function normalizeFieldColumns(saved = {}) {
  const widths = {};
  FIELD_COLUMNS.forEach((column) => {
    widths[column.key] = clamp(saved[column.key] ?? column.defaultWidth, column.min, column.max);
  });
  return widths;
}

function loadUiPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(UI_PREFS_KEY) || "{}");
    const fieldColumns = normalizeFieldColumns(parsed.fieldColumns);

    // Older builds had a crude Fields slider. Treat that as the visible width of
    // the task-data pane, not as a reason to distort individual columns.
    const totalFieldWidth = getTotalFieldColumnWidth({ fieldColumns });
    const legacyPaneWidth = Number.isFinite(Number(parsed.chartWidth)) ? Number(parsed.chartWidth) : null;
    const savedPaneWidth = parsed.fieldPaneWidth ?? legacyPaneWidth ?? totalFieldWidth;

    return {
      fieldColumns,
      fieldPaneWidth: clamp(savedPaneWidth, MIN_FIELD_PANE_WIDTH, totalFieldWidth),
      dayWidth: clamp(parsed.dayWidth ?? DEFAULT_UI_PREFS.dayWidth, 36, 120),
      rowHeight: clamp(parsed.rowHeight ?? DEFAULT_UI_PREFS.rowHeight, 44, 88),
    };
  } catch {
    const fieldColumns = normalizeFieldColumns(DEFAULT_UI_PREFS.fieldColumns);
    return {
      fieldColumns,
      fieldPaneWidth: getTotalFieldColumnWidth({ fieldColumns }),
      dayWidth: DEFAULT_UI_PREFS.dayWidth,
      rowHeight: DEFAULT_UI_PREFS.rowHeight,
    };
  }
}

function saveUiPrefs() {
  localStorage.setItem(UI_PREFS_KEY, JSON.stringify(uiPrefs));
}

function getTotalFieldColumnWidth(prefs = uiPrefs) {
  return FIELD_COLUMNS.reduce((total, column) => total + (prefs.fieldColumns?.[column.key] ?? column.defaultWidth), 0);
}

function getFieldPaneWidth(prefs = uiPrefs) {
  const totalWidth = getTotalFieldColumnWidth(prefs);
  return clamp(prefs.fieldPaneWidth ?? totalWidth, MIN_FIELD_PANE_WIDTH, totalWidth);
}

function setFieldPaneWidth(width) {
  uiPrefs.fieldPaneWidth = clamp(width, MIN_FIELD_PANE_WIDTH, getTotalFieldColumnWidth());
}

function isFieldPaneClipped() {
  return getFieldPaneWidth() < getTotalFieldColumnWidth() - 1;
}

function getFieldGridTemplate() {
  return FIELD_COLUMNS.map((column) => `${uiPrefs.fieldColumns[column.key]}px`).join(" ");
}

function renderFieldHeadingCells() {
  return FIELD_COLUMNS.map((column) => {
    const width = uiPrefs.fieldColumns[column.key] ?? column.defaultWidth;
    const shouldRotate = column.label && column.label.length > 2 && width <= 68;
    const shouldCompact = column.label && width <= 88;
    const classes = ["field-heading-cell"];
    if (shouldCompact) classes.push("is-skinny");
    if (shouldRotate) classes.push("is-vertical");
    return `
    <div class="${classes.join(" ")}" data-column-key="${column.key}" title="Drag the edge to resize ${escapeXml(column.label || "this column")}">
      <span>${escapeXml(column.label)}</span>
      <i class="column-resize-handle" data-column-resize="${column.key}" aria-hidden="true"></i>
    </div>`;
  }).join("");
}

function sizeLabel(value, compactMax, wideMin) {
  if (value <= compactMax) return "Compact";
  if (value >= wideMin) return "Wide";
  return "Standard";
}

function applyUiPrefs() {
  setFieldPaneWidth(uiPrefs.fieldPaneWidth ?? getTotalFieldColumnWidth());

  if (els.dayWidthControl) els.dayWidthControl.value = uiPrefs.dayWidth;
  if (els.rowHeightControl) els.rowHeightControl.value = uiPrefs.rowHeight;
  if (els.dayWidthValue) els.dayWidthValue.textContent = sizeLabel(uiPrefs.dayWidth, 48, 82);
  if (els.rowHeightValue) els.rowHeightValue.textContent = sizeLabel(uiPrefs.rowHeight, 52, 72);

  document.documentElement.style.setProperty("--planner-day-width", `${uiPrefs.dayWidth}px`);
  document.documentElement.style.setProperty("--planner-row-height", `${uiPrefs.rowHeight}px`);
  document.documentElement.style.setProperty("--planner-fields-width", `${getFieldPaneWidth()}px`);
  document.documentElement.style.setProperty("--planner-field-template", getFieldGridTemplate());
  if (els.workspace) els.workspace.style.gridTemplateColumns = "1fr";
}

function dateOnly(value) {
  if (!value) return null;
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const text = String(value).slice(0, 10);
  const [y, m, d] = text.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function addDays(value, days) {
  const date = dateOnly(value);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return date;
}

function daysBetween(start, finish) {
  const s = dateOnly(start);
  const f = dateOnly(finish);
  if (!s || !f) return 1;
  return Math.max(1, Math.round((f - s) / 86400000) + 1);
}

function toDateInputValue(date) {
  const d = dateOnly(date);
  if (!d) return today;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toProjectDate(value, endOfDay = false) {
  const day = toDateInputValue(value);
  return `${day}T${endOfDay ? "17:00:00" : "08:00:00"}`;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizePercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function normalizeLevel(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(10, Math.max(1, Math.round(n)));
}

function normalizeLinkType(value) {
  if (value === undefined || value === null || value === "") return "FS";
  const numeric = Number(value);
  if (Number.isFinite(numeric) && PROJECT_TO_LINK_TYPE[numeric]) return PROJECT_TO_LINK_TYPE[numeric];
  const text = String(value).trim().toUpperCase();
  return LINK_TYPES.includes(text) ? text : "FS";
}

function normalizeTaskLinks(task) {
  const rawLinks = Array.isArray(task.links) && task.links.length
    ? task.links
    : (task.predecessors || []).map((id) => ({ id, type: "FS" }));
  const seen = new Set();
  const normalized = [];

  rawLinks.forEach((link) => {
    const id = Number(typeof link === "object" ? (link.id ?? link.predId ?? link.predecessorId) : link);
    const type = normalizeLinkType(typeof link === "object" ? link.type : "FS");
    const key = `${id}:${type}`;
    if (!Number.isInteger(id) || id <= 0 || seen.has(key)) return;
    seen.add(key);
    normalized.push({ id, type });
  });

  return normalized;
}

function getTaskLinks(task) {
  return normalizeTaskLinks(task);
}

function formatLinks(links) {
  return getTaskLinks({ links }).map((link) => `${link.id}${link.type}`).join(",");
}

function getSuccessorLinks(taskId) {
  const id = Number(taskId);
  if (!Number.isInteger(id)) return [];
  const successors = [];
  state.tasks.forEach((candidate) => {
    getTaskLinks(candidate).forEach((link) => {
      if (link.id === id) successors.push({ id: candidate.id, type: link.type });
    });
  });
  return successors.sort((a, b) => a.id - b.id || LINK_TYPES.indexOf(a.type) - LINK_TYPES.indexOf(b.type));
}

function formatSuccessorLinks(taskId) {
  return getSuccessorLinks(taskId).map((link) => `${link.id}${link.type}`).join(",");
}

function parseLinksInput(value, selfId) {
  const text = String(value || "").trim();
  if (!text) return [];
  const links = [];
  const seen = new Set();
  const matches = text.matchAll(/(\d+)\s*[:\-]?\s*(FS|SS|FF|SF)?/gi);

  for (const match of matches) {
    const id = Number(match[1]);
    const type = normalizeLinkType(match[2] || "FS");
    const key = `${id}:${type}`;
    if (!Number.isInteger(id) || id <= 0 || id === selfId || seen.has(key)) continue;
    seen.add(key);
    links.push({ id, type });
  }

  return links;
}

function describeLink(link) {
  return `${link.id}${link.type}`;
}

function durationToDays(durationText) {
  if (!durationText) return 1;
  const hours = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i.exec(durationText);
  if (hours) {
    const h = Number(hours[1] || 0);
    const m = Number(hours[2] || 0);
    return Math.max(1, Math.round((h + m / 60) / 8));
  }
  const days = /P(?:(\d+)D)/i.exec(durationText);
  if (days) return Math.max(1, Number(days[1]));
  return 1;
}

function daysToProjectDuration(days) {
  const safeDays = Math.max(1, Number(days) || 1);
  return `PT${safeDays * 8}H0M0S`;
}

function childText(node, localName) {
  const child = [...node.children].find((c) => c.localName === localName);
  return child ? child.textContent.trim() : "";
}

function childrenByName(node, localName) {
  return [...node.children].filter((c) => c.localName === localName);
}

function ensureDecorations() {
  const counters = [];
  state.tasks.forEach((task, index) => {
    task.id = index + 1;
    task.outlineLevel = normalizeLevel(task.outlineLevel);
    task.name = task.name || `Task ${index + 1}`;
    task.start = task.start || state.projectStart || today;
    task.finish = task.finish || toDateInputValue(addDays(task.start, Math.max(1, task.durationDays || 1) - 1));
    task.percent = normalizePercent(task.percent);
    task.isSummary = Boolean(task.isSummary);
    task.expanded = task.expanded !== false;
    task.durationDays = daysBetween(task.start, task.finish);
    task.links = normalizeTaskLinks(task).filter((link) => link.id !== task.id);
    task.predecessors = task.links.map((link) => link.id);

    const level = task.outlineLevel;
    counters.length = level;
    for (let i = 0; i < level - 1; i += 1) {
      if (!counters[i]) counters[i] = 1;
    }
    counters[level - 1] = (counters[level - 1] || 0) + 1;
    task.wbs = counters.join(".");
  });
}


function getDescendantIndexes(parentIndex) {
  const parent = state.tasks[parentIndex];
  if (!parent) return [];
  const level = normalizeLevel(parent.outlineLevel);
  const indexes = [];
  for (let i = parentIndex + 1; i < state.tasks.length; i += 1) {
    const childLevel = normalizeLevel(state.tasks[i].outlineLevel);
    if (childLevel <= level) break;
    indexes.push(i);
  }
  return indexes;
}

function getDirectChildIndexes(parentIndex) {
  const parent = state.tasks[parentIndex];
  if (!parent) return [];
  const level = normalizeLevel(parent.outlineLevel);
  const direct = [];
  for (let i = parentIndex + 1; i < state.tasks.length; i += 1) {
    const childLevel = normalizeLevel(state.tasks[i].outlineLevel);
    if (childLevel <= level) break;
    if (childLevel === level + 1) direct.push(i);
  }
  return direct;
}

function isSummaryIndex(index) {
  const task = state.tasks[index];
  return Boolean(task?.isSummary) || getDescendantIndexes(index).length > 0;
}

function isHiddenByCollapsedParent(index) {
  const level = normalizeLevel(state.tasks[index]?.outlineLevel || 1);
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = state.tasks[i];
    const candidateLevel = normalizeLevel(candidate?.outlineLevel || 1);
    if (candidateLevel >= level) continue;
    return isSummaryIndex(i) && candidate.expanded === false;
  }
  return false;
}

function rollupSummaryTasks() {
  for (let i = state.tasks.length - 1; i >= 0; i -= 1) {
    const task = state.tasks[i];
    const descendants = getDescendantIndexes(i);
    const isSummary = Boolean(task.isSummary) || descendants.length > 0;
    task.isSummary = isSummary;
    if (!isSummary) {
      task.expanded = true;
      continue;
    }
    task.expanded = task.expanded !== false;
    const childIndexes = getDirectChildIndexes(i).length ? getDirectChildIndexes(i) : descendants;
    const children = childIndexes.map((index) => state.tasks[index]).filter(Boolean);
    const starts = children.map((child) => dateOnly(child.start)).filter(Boolean);
    const finishes = children.map((child) => dateOnly(child.finish)).filter(Boolean);
    if (starts.length && finishes.length) {
      const start = new Date(Math.min(...starts.map(Number)));
      const finish = new Date(Math.max(...finishes.map(Number)));
      task.start = toDateInputValue(start);
      task.finish = toDateInputValue(finish);
      task.durationDays = daysBetween(task.start, task.finish);
    }
    const weighted = children
      .map((child) => ({ percent: normalizePercent(child.percent), duration: Math.max(1, child.durationDays || daysBetween(child.start, child.finish)) }))
      .filter((item) => Number.isFinite(item.duration));
    const totalDuration = weighted.reduce((sum, item) => sum + item.duration, 0);
    if (totalDuration > 0) {
      task.percent = Math.round(weighted.reduce((sum, item) => sum + item.percent * item.duration, 0) / totalDuration);
    }
  }
}

function getVisibleTaskRows() {
  return state.tasks
    .map((task, index) => ({ task, index }))
    .filter((row) => !isHiddenByCollapsedParent(row.index));
}

function save() {
  ensureDecorations();
  rollupSummaryTasks();
  ensureDecorations();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  els.saveStatus.textContent = `Saved ${new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    loadSample(false);
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    state = {
      projectName: parsed.projectName || "New Project",
      projectStart: parsed.projectStart || today,
      nextUid: parsed.nextUid || 2,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch {
    loadSample(false);
  }
}

function render() {
  ensureDecorations();
  rollupSummaryTasks();
  ensureDecorations();
  applyUiPrefs();
  els.projectName.value = state.projectName;
  els.projectStart.value = state.projectStart;
  renderTaskTable();
  renderGantt();
  renderSummary();
  renderValidation();
  renderScheduleLinkSuggestion();
  renderCascadeImpactSuggestion();
  save();
}

function formatShortDate(value) {
  const d = dateOnly(value);
  if (!d) return "No date";
  return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function renderSummary() {
  const tasks = state.tasks;
  const starts = tasks.map((t) => dateOnly(t.start)).filter(Boolean);
  const finishes = tasks.map((t) => dateOnly(t.finish)).filter(Boolean);
  const min = starts.length ? new Date(Math.min(...starts.map(Number))) : null;
  const max = finishes.length ? new Date(Math.max(...finishes.map(Number))) : null;
  const duration = min && max ? daysBetween(min, max) : 0;
  const leafTasks = tasks.filter((task, index) => !isSummaryIndex(index));
  const percentTasks = leafTasks.length ? leafTasks : tasks;
  const averagePercent = percentTasks.length
    ? Math.round(percentTasks.reduce((sum, task) => sum + normalizePercent(task.percent), 0) / percentTasks.length)
    : 0;
  const issueCount = validateProject().length;

  if (els.taskCount) els.taskCount.textContent = String(tasks.length);
  if (els.durationCount) els.durationCount.textContent = `${duration}d`;
  if (els.completeCount) els.completeCount.textContent = `${averagePercent}%`;
  if (els.dateRange) {
    els.dateRange.textContent = min && max ? `${formatShortDate(min)} → ${formatShortDate(max)}` : "No date range";
  }
  if (els.exportStatus) els.exportStatus.textContent = issueCount ? `${issueCount} issue${issueCount === 1 ? "" : "s"}` : "Ready";
  if (els.compatChip) {
    els.compatChip.classList.toggle("has-issues", issueCount > 0);
    els.compatChip.lastChild.textContent = issueCount ? ` ${issueCount} issue${issueCount === 1 ? "" : "s"} found` : " XML export ready";
  }
  if (els.readinessCard) {
    els.readinessCard.classList.toggle("has-issues", issueCount > 0);
  }
}

function renderTaskTable() {
  // The MS Project-style unified grid is rendered in renderGantt so the editable
  // task fields and the Gantt bar stay on the exact same visual row.
}

function renderGantt() {
  const tasks = state.tasks;
  const rowHeight = uiPrefs.rowHeight;
  const barHeight = Math.min(34, Math.max(24, rowHeight - 24));
  const barTop = Math.max(8, Math.round((rowHeight - barHeight) / 2));
  const dayWidth = uiPrefs.dayWidth;
  const leftPaneWidth = getFieldPaneWidth();
  const totalFieldWidth = getTotalFieldColumnWidth();
  const fieldGridTemplate = getFieldGridTemplate();
  const fieldClipClass = leftPaneWidth < totalFieldWidth - 1 ? " is-clipped" : "";

  if (!tasks.length) {
    els.timeline.innerHTML = `
      <div class="planner-fields-heading${fieldClipClass}" style="width:${leftPaneWidth}px;grid-template-columns:${fieldGridTemplate}">
        ${renderFieldHeadingCells()}
        <button class="pane-splitter" type="button" data-pane-splitter title="Drag left to hide task-data columns. Drag right to reveal them." aria-label="Hide or reveal task-data columns"></button>
      </div>
      <div class="planner-dates-heading" style="width:${dayWidth * 8}px"><span>No dates yet</span></div>`;
    els.gantt.style.width = `${leftPaneWidth + dayWidth * 8}px`;
    els.taskBody.innerHTML = `<div class="empty-state unified-empty" style="width:${leftPaneWidth + dayWidth * 8}px"><div><strong>No tasks yet</strong><span>Add a task to start building the schedule.</span></div></div>`;
    return;
  }

  const starts = tasks.map((t) => dateOnly(t.start)).filter(Boolean);
  const finishes = tasks.map((t) => dateOnly(t.finish)).filter(Boolean);
  if (pendingScheduleChoice?.proposedDates) {
    const proposedStart = dateOnly(pendingScheduleChoice.proposedDates.start);
    const proposedFinish = dateOnly(pendingScheduleChoice.proposedDates.finish);
    if (proposedStart) starts.push(proposedStart);
    if (proposedFinish) finishes.push(proposedFinish);
  }
  (pendingCascadeChoice?.changes || []).forEach((change) => {
    const proposedStart = dateOnly(change.to.start);
    const proposedFinish = dateOnly(change.to.finish);
    if (proposedStart) starts.push(proposedStart);
    if (proposedFinish) finishes.push(proposedFinish);
  });
  let min = new Date(Math.min(...starts.map(Number)));
  let max = new Date(Math.max(...finishes.map(Number)));
  min = addDays(min, -1);
  max = addDays(max, 2);
  const totalDays = Math.max(1, daysBetween(min, max));
  const chartWidthPx = totalDays * dayWidth;
  const totalWidth = leftPaneWidth + chartWidthPx;

  const dateCells = [];
  for (let i = 0; i < totalDays; i += 1) {
    const d = addDays(min, i);
    const classes = ["planner-date-cell"];
    if ([0, 6].includes(d.getDay())) classes.push("is-weekend");
    if (toDateInputValue(d) === today) classes.push("is-today");
    if (dayWidth <= 50) classes.push("is-vertical");
    else if (dayWidth <= 64) classes.push("is-skinny");
    dateCells.push(`
      <div class="${classes.join(" ")}" style="width:${dayWidth}px" title="Drag the right edge to resize day columns">
        <strong>${d.toLocaleDateString([], { month: "short", day: "numeric" })}</strong>
        <span>${d.toLocaleDateString([], { weekday: "short" })}</span>
        <i class="date-resize-handle" data-day-resize aria-hidden="true"></i>
      </div>`);
  }

  els.timeline.style.width = `${totalWidth}px`;
  els.timeline.innerHTML = `
    <div class="planner-fields-heading${fieldClipClass}" style="width:${leftPaneWidth}px;grid-template-columns:${fieldGridTemplate}">
      ${renderFieldHeadingCells()}
      <button class="pane-splitter" type="button" data-pane-splitter title="Drag left to hide task-data columns. Drag right to reveal them." aria-label="Hide or reveal task-data columns"></button>
    </div>
    <div class="planner-dates-heading" style="width:${chartWidthPx}px;grid-template-columns:repeat(${totalDays}, ${dayWidth}px)">${dateCells.join("")}</div>`;

  els.gantt.style.width = `${totalWidth}px`;
  const visibleRows = getVisibleTaskRows();
  els.taskBody.innerHTML = visibleRows.map(({ task, index }) => {
    const startOffset = Math.max(0, daysBetween(min, task.start) - 1);
    const duration = Math.max(1, daysBetween(task.start, task.finish));
    const left = startOffset * dayWidth;
    const width = Math.max(32, duration * dayWidth - 8);
    const isSummary = isSummaryIndex(index);
    const rowClasses = ["planner-row"];
    if (task.percent === 100) rowClasses.push("is-complete");
    if (isSummary) rowClasses.push("is-summary");
    const barClasses = ["gantt-bar"];
    if (task.percent === 100) barClasses.push("is-complete");
    if (isSummary) barClasses.push("is-summary");
    const barClass = barClasses.join(" ");
    const summaryLocked = isSummary ? ' readonly aria-readonly="true"' : "";
    const linkText = task.links.length ? formatLinks(task.links) : "";
    const successorText = formatSuccessorLinks(task.id);
    const linkPreview = pendingScheduleChoice?.successor?.id === task.id ? pendingScheduleChoice.proposedDates : null;
    const primaryCascadeChange = pendingCascadeChoice?.changes?.[0] || null;
    const cascadePreview = primaryCascadeChange?.id === task.id ? primaryCascadeChange.to : null;
    const pendingPreview = linkPreview || cascadePreview;
    let ghostMarkup = "";
    if (pendingPreview) {
      const ghostStartOffset = Math.max(0, daysBetween(min, pendingPreview.start) - 1);
      const ghostDuration = Math.max(1, daysBetween(pendingPreview.start, pendingPreview.finish));
      const ghostLeft = ghostStartOffset * dayWidth;
      const ghostWidth = Math.max(32, ghostDuration * dayWidth - 8);
      const ghostKind = cascadePreview ? "Preview" : "Suggested";
      const ghostTitle = cascadePreview
        ? `${task.name} preview: ${formatFriendlyDate(pendingPreview.start)} → ${formatFriendlyDate(pendingPreview.finish)}`
        : `Suggested position for ${task.name}: ${formatFriendlyDate(pendingPreview.start)} → ${formatFriendlyDate(pendingPreview.finish)}`;
      const showGhostMeta = ghostWidth >= 150;
      ghostMarkup = `
        <div class="gantt-ghost-bar ${cascadePreview ? "is-cascade-preview" : "is-link-preview"}" style="left:${ghostLeft}px;width:${ghostWidth}px" aria-hidden="true" title="${escapeXml(ghostTitle)}">
          <span>${escapeXml(task.name)}</span>
          ${showGhostMeta ? `<small>${ghostKind}</small>` : ""}
        </div>`;
    }
    const indent = Math.max(0, task.outlineLevel - 1) * 18;
    return `
      <div class="${rowClasses.join(" ")}" style="--row-height:${rowHeight}px;width:${totalWidth}px">
        <div class="planner-fields${fieldClipClass}" style="width:${leftPaneWidth}px;grid-template-columns:${fieldGridTemplate}">
          <div class="planner-cell"><span class="id-pill">${task.id}</span></div>
          <div class="planner-cell muted-cell">${escapeXml(task.wbs)}</div>
          <div class="planner-cell name-cell"><div class="task-name-cell" style="--indent:${indent}px">${isSummary ? `<button type="button" class="summary-toggle" data-action="toggle-summary" data-index="${index}" title="${task.expanded === false ? "Expand" : "Collapse"} summary task" aria-label="${task.expanded === false ? "Expand" : "Collapse"} ${escapeXml(task.name)}">${task.expanded === false ? "▸" : "▾"}</button>` : `<span class="summary-toggle-spacer" aria-hidden="true"></span>`}<input class="name-input" data-field="name" data-index="${index}" value="${escapeXml(task.name)}" /></div></div>
          <div class="planner-cell"><input type="date" data-field="start" data-index="${index}" value="${escapeXml(task.start)}"${summaryLocked} /></div>
          <div class="planner-cell"><input type="date" data-field="finish" data-index="${index}" value="${escapeXml(task.finish)}"${summaryLocked} /></div>
          <div class="planner-cell"><span class="duration-pill">${task.durationDays}d</span></div>
          <div class="planner-cell">
            <div class="percent-cell">
              <input type="number" min="0" max="100" data-field="percent" data-index="${index}" value="${task.percent}" aria-label="Percent complete"${summaryLocked} />
              <div class="percent-track" aria-hidden="true"><span style="--pct:${task.percent}%"></span></div>
            </div>
          </div>
          <div class="planner-cell"><input data-field="predecessors" data-index="${index}" value="${escapeXml(linkText)}" placeholder="none" title="Predecessors: tasks this row waits for. Type 1FS, 2SS, 3FF, or 4SF, or use the pull strings on the Gantt bars." /></div>
          <div class="planner-cell"><input class="readonly-link-field" value="${escapeXml(successorText)}" placeholder="none" readonly aria-readonly="true" title="Successors: calculated from other rows that list this task as a predecessor. Edit those rows' Pred fields to change this." /></div>
          <div class="planner-cell"><input type="number" min="1" max="10" data-field="outlineLevel" data-index="${index}" value="${task.outlineLevel}" aria-label="Outline level" /></div>
          <div class="planner-cell action-cell"><button type="button" class="delete-btn" data-action="delete" data-index="${index}" title="Delete task" aria-label="Delete task">×</button></div>
        </div>
        <div class="gantt-row" style="width:${chartWidthPx}px;--row-height:${rowHeight}px;--bar-height:${barHeight}px;--bar-top:${barTop}px;background-size:${dayWidth}px ${rowHeight}px">
          ${ghostMarkup}
          <div class="${barClass}" data-index="${index}" style="left:${left}px;width:${width}px;--done:${task.percent}%" title="Drag to move. Pull edges to resize. Pull a string from S or F to another task string to create SS, SF, FS, or FF automatically. ${escapeXml(task.name)}: ${task.start} to ${task.finish}">
            <button type="button" class="dependency-port dependency-port-start" data-index="${index}" data-link-endpoint="S" aria-label="Create dependency from the start of ${escapeXml(task.name)}" title="Pull start string"></button>
            <span>${escapeXml(task.name)}</span>
            <em class="link-hint" aria-hidden="true">Drop on S or F</em>
            <i class="resize-handle resize-left" data-resize-edge="start" aria-hidden="true"></i>
            <i class="resize-handle resize-right" data-resize-edge="finish" aria-hidden="true"></i>
            <button type="button" class="dependency-port dependency-port-finish" data-index="${index}" data-link-endpoint="F" aria-label="Create dependency from the finish of ${escapeXml(task.name)}" title="Pull finish string"></button>
          </div>
        </div>
      </div>`;
  }).join("");
}
function validateProject() {
  ensureDecorations();
  const issues = [];
  const idSet = new Set(state.tasks.map((t) => t.id));

  state.tasks.forEach((task) => {
    if (!task.name.trim()) issues.push(`Task ${task.id} has a blank name.`);
    if (!dateOnly(task.start)) issues.push(`Task ${task.id} has an invalid start date.`);
    if (!dateOnly(task.finish)) issues.push(`Task ${task.id} has an invalid finish date.`);
    if (dateOnly(task.finish) < dateOnly(task.start)) issues.push(`Task ${task.id} finishes before it starts.`);

    task.links.forEach((link) => {
      const predId = link.id;
      if (!idSet.has(predId)) {
        issues.push(`Task ${task.id} references missing predecessor ID ${predId}.`);
        return;
      }
      const pred = state.tasks[predId - 1];
      if (pred) {
        const predStart = dateOnly(pred.start);
        const predFinish = dateOnly(pred.finish);
        const taskStart = dateOnly(task.start);
        const taskFinish = dateOnly(task.finish);
        if (link.type === "FS" && taskStart <= predFinish) {
          issues.push(`Task ${task.id} has ${describeLink(link)} but starts before task ${predId} has clearly finished. Use Auto schedule or adjust dates.`);
        }
        if (link.type === "SS" && taskStart < predStart) {
          issues.push(`Task ${task.id} has ${describeLink(link)} but starts before task ${predId} starts.`);
        }
        if (link.type === "FF" && taskFinish < predFinish) {
          issues.push(`Task ${task.id} has ${describeLink(link)} but finishes before task ${predId} finishes.`);
        }
        if (link.type === "SF" && taskFinish < predStart) {
          issues.push(`Task ${task.id} has ${describeLink(link)} but finishes before task ${predId} starts.`);
        }
      }
      if (predId >= task.id) {
        issues.push(`Task ${task.id} depends on task ${predId}, which appears later in the schedule. MS Project can handle this, but it is easy to create loops.`);
      }
    });
  });

  detectCycles().forEach((cycle) => issues.push(`Dependency loop detected: ${cycle.join(" → ")}.`));
  return issues;
}

function detectCycles() {
  const cycles = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const byId = new Map(state.tasks.map((t) => [t.id, t]));

  function dfs(id) {
    if (visiting.has(id)) {
      const idx = stack.indexOf(id);
      cycles.push([...stack.slice(idx), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    stack.push(id);
    const task = byId.get(id);
    (task?.links || []).forEach((link) => dfs(link.id));
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  }

  state.tasks.forEach((task) => dfs(task.id));
  return cycles;
}

function renderValidation() {
  const issues = validateProject();
  if (!issues.length) {
    els.validationPanel.innerHTML = `<div class="validation-card"><div><p><strong>Ready to export.</strong> Supported fields are clean: tasks, dates, duration, percent complete, WBS, outline level, predecessors, and calculated successors.</p></div></div>`;
    return;
  }

  els.validationPanel.innerHTML = `
    <div class="validation-card warn">
      <div>
        <p><strong>${issues.length} thing${issues.length === 1 ? "" : "s"} to fix before export.</strong> Auto Schedule can fix most dependency timing issues.</p>
        <ul>${issues.slice(0, 8).map((issue) => `<li>${escapeXml(issue)}</li>`).join("")}</ul>
      </div>
    </div>`;
}

function updateTask(index, field, value) {
  const task = state.tasks[index];
  if (!task) return;

  if (task.isSummary && ["start", "finish", "percent"].includes(field)) {
    render();
    return;
  }

  if (field === "percent") task.percent = normalizePercent(value);
  else if (field === "outlineLevel") task.outlineLevel = normalizeLevel(value);
  else if (field === "predecessors") {
    task.links = parseLinksInput(value, task.id);
    task.predecessors = task.links.map((link) => link.id);
  } else if (field === "start") {
    const oldDuration = task.durationDays || daysBetween(task.start, task.finish);
    task.start = value || state.projectStart;
    task.finish = toDateInputValue(addDays(task.start, oldDuration - 1));
  } else if (field === "finish") {
    task.finish = value || task.start;
    if (dateOnly(task.finish) < dateOnly(task.start)) task.finish = task.start;
  } else {
    task[field] = value;
  }
  render();
}

function addTask() {
  const last = state.tasks[state.tasks.length - 1];
  const start = last ? toDateInputValue(addDays(last.finish, 1)) : state.projectStart;
  state.tasks.push({
    uid: state.nextUid++,
    name: `New Task ${state.tasks.length + 1}`,
    start,
    finish: toDateInputValue(addDays(start, 2)),
    durationDays: 3,
    percent: 0,
    predecessors: last ? [last.id] : [],
    links: last ? [{ id: last.id, type: "FS" }] : [],
    outlineLevel: last ? last.outlineLevel : 1,
    isSummary: false,
    expanded: true,
  });
  render();
}

function deleteTask(index) {
  const deletedId = state.tasks[index]?.id;
  state.tasks.splice(index, 1);
  state.tasks.forEach((task) => {
    task.links = normalizeTaskLinks(task)
      .filter((link) => link.id !== deletedId)
      .map((link) => ({ ...link, id: link.id > deletedId ? link.id - 1 : link.id }));
    task.predecessors = task.links.map((link) => link.id);
  });
  render();
}

function autoSchedule(options = {}) {
  return scheduleAllLinkedTasks(options);
}

function buildProjectXml() {
  ensureDecorations();
  rollupSummaryTasks();
  ensureDecorations();
  const created = new Date().toISOString().replace(/\.\d{3}Z$/, "");
  const projectStart = toProjectDate(state.projectStart);
  const projectFinish = toProjectDate(state.tasks.at(-1)?.finish || state.projectStart, true);
  const projectName = escapeXml(state.projectName || "ProjectXML Planner Export");
  const taskById = new Map(state.tasks.map((task) => [task.id, task]));

  const rootTask = `
    <Task>
      <UID>0</UID>
      <ID>0</ID>
      <Name>${projectName}</Name>
      <Type>1</Type>
      <IsNull>0</IsNull>
      <CreateDate>${created}</CreateDate>
      <WBS>0</WBS>
      <OutlineNumber>0</OutlineNumber>
      <OutlineLevel>0</OutlineLevel>
      <Priority>500</Priority>
      <Start>${projectStart}</Start>
      <Finish>${projectFinish}</Finish>
      <Duration>${daysToProjectDuration(Math.max(1, daysBetween(state.projectStart, state.tasks.at(-1)?.finish || state.projectStart)))}</Duration>
      <DurationFormat>7</DurationFormat>
      <Work>PT0H0M0S</Work>
      <Summary>1</Summary>
      <Manual>1</Manual>
    </Task>`;

  const taskXml = state.tasks.map((task) => {
    const duration = task.durationDays || daysBetween(task.start, task.finish);
    const predecessors = getTaskLinks(task).map((link) => {
      const pred = taskById.get(link.id);
      if (!pred) return "";
      return `
      <PredecessorLink>
        <PredecessorUID>${pred.uid}</PredecessorUID>
        <Type>${LINK_TYPE_TO_PROJECT[link.type] ?? 1}</Type>
        <CrossProject>0</CrossProject>
        <LinkLag>0</LinkLag>
        <LagFormat>7</LagFormat>
      </PredecessorLink>`;
    }).join("");

    return `
    <Task>
      <UID>${task.uid}</UID>
      <ID>${task.id}</ID>
      <Name>${escapeXml(task.name)}</Name>
      <Type>1</Type>
      <IsNull>0</IsNull>
      <CreateDate>${created}</CreateDate>
      <WBS>${escapeXml(task.wbs)}</WBS>
      <OutlineNumber>${escapeXml(task.wbs)}</OutlineNumber>
      <OutlineLevel>${task.outlineLevel}</OutlineLevel>
      <Priority>500</Priority>
      <Start>${toProjectDate(task.start)}</Start>
      <Finish>${toProjectDate(task.finish, true)}</Finish>
      <Duration>${daysToProjectDuration(duration)}</Duration>
      <DurationFormat>7</DurationFormat>
      <Work>${daysToProjectDuration(duration)}</Work>
      <PercentComplete>${task.percent}</PercentComplete>
      <Summary>${task.isSummary ? 1 : 0}</Summary>
      <Expanded>${task.expanded === false ? 0 : 1}</Expanded>
      <Manual>1</Manual>${predecessors}
    </Task>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="${MS_PROJECT_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${MS_PROJECT_SCHEMA_LOCATION}">
  <SaveVersion>12</SaveVersion>
  <Name>${projectName}</Name>
  <Title>${projectName}</Title>
  <Subject>Exported from Chris&apos;s Discount Project Maker</Subject>
  <CreationDate>${created}</CreationDate>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>${projectStart}</StartDate>
  <FinishDate>${projectFinish}</FinishDate>
  <FYStartDate>1</FYStartDate>
  <CriticalSlackLimit>0</CriticalSlackLimit>
  <CurrencyDigits>2</CurrencyDigits>
  <CurrencySymbol>$</CurrencySymbol>
  <CurrencyCode>USD</CurrencyCode>
  <CurrencySymbolPosition>0</CurrencySymbolPosition>
  <CalendarUID>1</CalendarUID>
  <DefaultStartTime>08:00:00</DefaultStartTime>
  <DefaultFinishTime>17:00:00</DefaultFinishTime>
  <MinutesPerDay>480</MinutesPerDay>
  <MinutesPerWeek>2400</MinutesPerWeek>
  <DaysPerMonth>20</DaysPerMonth>
  <DefaultTaskType>1</DefaultTaskType>
  <DefaultFixedCostAccrual>3</DefaultFixedCostAccrual>
  <DefaultStandardRate>0</DefaultStandardRate>
  <DefaultOvertimeRate>0</DefaultOvertimeRate>
  <DurationFormat>7</DurationFormat>
  <WorkFormat>2</WorkFormat>
  <EditableActualCosts>0</EditableActualCosts>
  <HonorConstraints>0</HonorConstraints>
  <InsertedProjectsLikeSummary>1</InsertedProjectsLikeSummary>
  <MultipleCriticalPaths>0</MultipleCriticalPaths>
  <NewTasksEffortDriven>0</NewTasksEffortDriven>
  <NewTasksEstimated>1</NewTasksEstimated>
  <SplitsInProgressTasks>1</SplitsInProgressTasks>
  <SpreadActualCost>0</SpreadActualCost>
  <SpreadPercentComplete>0</SpreadPercentComplete>
  <TaskUpdatesResource>1</TaskUpdatesResource>
  <FiscalYearStart>0</FiscalYearStart>
  <WeekStartDay>1</WeekStartDay>
  <MoveCompletedEndsBack>0</MoveCompletedEndsBack>
  <MoveRemainingStartsBack>0</MoveRemainingStartsBack>
  <MoveRemainingStartsForward>0</MoveRemainingStartsForward>
  <MoveCompletedEndsForward>0</MoveCompletedEndsForward>
  <BaselineForEarnedValue>0</BaselineForEarnedValue>
  <AutoAddNewResourcesAndTasks>1</AutoAddNewResourcesAndTasks>
  <StatusDate>${projectStart}</StatusDate>
  <CurrentDate>${toProjectDate(today)}</CurrentDate>
  <MicrosoftProjectServerURL>0</MicrosoftProjectServerURL>
  <Autolink>0</Autolink>
  <NewTaskStartDate>0</NewTaskStartDate>
  <DefaultTaskEVMethod>0</DefaultTaskEVMethod>
  <ProjectExternallyEdited>0</ProjectExternallyEdited>
  <ExtendedCreationDate>${created}</ExtendedCreationDate>
  <ActualsInSync>0</ActualsInSync>
  <RemoveFileProperties>0</RemoveFileProperties>
  <AdminProject>0</AdminProject>
  <Tasks>${rootTask}${taskXml}
  </Tasks>
</Project>`;
}

function importProjectXml(text) {
  const xml = new DOMParser().parseFromString(text, "application/xml");
  const parserError = xml.getElementsByTagName("parsererror")[0];
  if (parserError) throw new Error("That XML file could not be parsed.");

  const projectNode = [...xml.children].find((node) => node.localName === "Project") || xml.documentElement;
  const importedProjectName = childText(projectNode, "Name") || childText(projectNode, "Title") || "Imported Project";
  const importedStart = childText(projectNode, "StartDate").slice(0, 10) || today;
  const taskNodes = [...xml.getElementsByTagName("Task")];
  const rawTasks = [];
  const uidToImportedId = new Map();

  taskNodes.forEach((node) => {
    const id = Number(childText(node, "ID"));
    const uid = Number(childText(node, "UID"));
    const isNull = childText(node, "IsNull") === "1";
    const name = childText(node, "Name");
    if (isNull || id === 0 || !name) return;

    const start = childText(node, "Start").slice(0, 10) || importedStart;
    const durationDays = durationToDays(childText(node, "Duration"));
    const finish = childText(node, "Finish").slice(0, 10) || toDateInputValue(addDays(start, durationDays - 1));
    const outlineLevel = normalizeLevel(childText(node, "OutlineLevel") || 1);
    const percent = normalizePercent(childText(node, "PercentComplete") || 0);
    const isSummary = childText(node, "Summary") === "1";
    const expanded = childText(node, "Expanded") !== "0";

    rawTasks.push({
      uid: Number.isFinite(uid) && uid > 0 ? uid : state.nextUid++,
      importedId: id,
      node,
      name,
      start,
      finish,
      durationDays: daysBetween(start, finish),
      percent,
      predecessors: [],
      links: [],
      outlineLevel,
      isSummary,
      expanded,
    });
  });

  rawTasks.sort((a, b) => a.importedId - b.importedId);
  rawTasks.forEach((task, index) => {
    task.id = index + 1;
    uidToImportedId.set(task.uid, task.id);
  });

  rawTasks.forEach((task) => {
    const predecessorLinks = childrenByName(task.node, "PredecessorLink");
    task.links = predecessorLinks
      .map((link) => ({
        id: uidToImportedId.get(Number(childText(link, "PredecessorUID"))),
        type: normalizeLinkType(childText(link, "Type") || "1"),
      }))
      .filter((link) => Number.isInteger(link.id) && link.id > 0 && link.id !== task.id);
    task.predecessors = task.links.map((link) => link.id);
    delete task.node;
    delete task.importedId;
  });

  if (!rawTasks.length) throw new Error("No usable tasks were found in that Project XML file.");

  const maxUid = Math.max(...rawTasks.map((task) => task.uid), 1);
  state = {
    projectName: importedProjectName,
    projectStart: importedStart,
    nextUid: maxUid + 1,
    tasks: rawTasks,
  };
  render();
}

function getMppConversionSteps(fileName = "your-project.mpp") {
  return [
    `Open ${fileName} in Microsoft Project Desktop.`,
    "Choose File → Save As, or File → Export depending on your Project version.",
    "Pick XML Data / Project XML as the file type.",
    "Save the .xml file somewhere easy, like Downloads or Desktop.",
    "Come back here and click Import XML, or drag the XML file onto this page.",
  ];
}

function getMppChecklistText() {
  const fileName = lastMppFileName || "your-project.mpp";
  const lines = [
    "Chris's Discount Project Maker — MPP local converter notes",
    "",
    `Source file: ${fileName}`,
    "",
    "Best local-web attempt:",
    "1. This page reads the MPP file locally in your browser.",
    "2. If embedded Project XML/MSPDI exists, it imports that schedule directly.",
    "3. If no XML is found, it mines the native MPP container for useful task-name hints and creates a draft XML schedule.",
    "4. Review the recovered draft before using it as a real plan.",
    "",
    "Most reliable fallback:",
    ...getMppConversionSteps(fileName).map((step, index) => `${index + 1}. ${step}`),
    "",
    "Reality check: browser-only JavaScript cannot yet guarantee full Microsoft Project native MPP parity for every file. Project XML remains the reliable interchange format.",
  ];
  return lines.join("\n");
}

function showMppConversionGuide(file = null) {
  lastMppFileName = file?.name || lastMppFileName || "your-project.mpp";
  const name = escapeXml(lastMppFileName);
  const steps = getMppConversionSteps(lastMppFileName);

  setMppPanel(`
    <div class="mpp-hero">
      <div>
        <span class="mpp-kicker">Reliable fallback</span>
        <h3>Convert <code>${name}</code> to Project XML, then import it here.</h3>
        <p>The local browser converter is best-effort. If it cannot recover enough from a native .mpp file, Project XML is the dependable static-site workflow.</p>
      </div>
      <div class="mpp-format-card">
        <strong>.mpp</strong>
        <span>Native Project file</span>
        <i>→</i>
        <strong>.xml</strong>
        <span>Import-ready Project XML</span>
      </div>
    </div>

    <div class="mpp-flow">
      ${steps.map((step, index) => `
        <article class="mpp-step">
          <b>${index + 1}</b>
          <span>${escapeXml(step)}</span>
        </article>
      `).join("")}
    </div>

    <div class="mpp-actions">
      <button type="button" class="primary" data-mpp-action="choose-xml">Import converted XML</button>
      <button type="button" data-mpp-action="copy">Copy notes</button>
      <button type="button" data-mpp-action="checklist">Download checklist</button>
      <button type="button" data-mpp-action="dismiss">Dismiss</button>
    </div>
  `, "info", "MPP fallback guide");
}

async function copyMppSteps() {
  const text = getMppChecklistText();
  try {
    await navigator.clipboard.writeText(text);
    setMppPanel(`<strong>Copied.</strong> The local MPP converter notes are on your clipboard.<div class="mpp-actions"><button type="button" class="primary" data-mpp-action="choose-xml">Import converted XML</button><button type="button" data-mpp-action="dismiss">Dismiss</button></div>`, "ok", "MPP converter");
  } catch {
    alert(text);
  }
}

function downloadMppChecklist() {
  downloadText(getMppChecklistText(), `${safeFileName(lastMppFileName || "mpp-converter")}-notes.txt`, "text/plain");
}

function chooseConvertedXml() {
  els.importXmlInput?.click();
}

function setMppPanel(message, tone = "info", label = "MPP local converter") {
  if (!els.mppPanel) return;
  els.mppPanel.hidden = false;
  els.mppPanel.classList.remove("mpp-ok", "mpp-warn", "mpp-busy");
  if (tone === "ok") els.mppPanel.classList.add("mpp-ok");
  if (tone === "warn") els.mppPanel.classList.add("mpp-warn");
  if (tone === "busy") els.mppPanel.classList.add("mpp-busy");
  els.mppPanel.innerHTML = `<strong>${escapeXml(label)}:</strong> ${message}`;
}

async function importProjectMppLocal(file) {
  if (!file) return;
  lastMppFileName = file.name || "project.mpp";

  if (!window.NativeMppReader) {
    setMppPanel("The browser converter script did not load. Use the XML fallback guide.", "warn", "MPP converter unavailable");
    showMppConversionGuide(file);
    return;
  }

  setMppPanel(`Reading <code>${escapeXml(file.name)}</code> locally in this browser. No upload, no backend, no server…`, "busy", "MPP local converter");

  try {
    const result = await window.NativeMppReader.read(file);
    lastMppResult = result;

    if (result.projectXml) {
      importProjectXml(result.projectXml);
      const taskCount = result.project?.taskCount ?? state.tasks.length;
      const compressionText = result.embeddedXml?.compressed ? ` after ${escapeXml(result.embeddedXml.compression || "compressed")} decompression` : "";
      const streamText = result.nativeTable
        ? ` Decoded native MPP task table streams: ${result.nativeTable.taskCount} task${result.nativeTable.taskCount === 1 ? "" : "s"} and ${result.nativeTable.linkCount} link${result.nativeTable.linkCount === 1 ? "" : "s"}.`
        : result.embeddedXml?.stream ? ` Found Project XML in <code>${escapeXml(result.embeddedXml.stream)}</code>${compressionText}.` : "";
      const reviewText = result.nativeTable ? " <strong>Review this import before treating it as source of truth.</strong>" : "";
      const coverage = result.nativeTable?.fieldCoverage;
      const coverageText = coverage
        ? ` Field coverage: ${coverage.starts || 0} start date${coverage.starts === 1 ? "" : "s"}, ${coverage.finishes || 0} finish date${coverage.finishes === 1 ? "" : "s"}, ${coverage.percents || 0} percent value${coverage.percents === 1 ? "" : "s"}.`
        : "";
      setMppPanel(
        `Imported ${taskCount} task${taskCount === 1 ? "" : "s"} from <code>${escapeXml(file.name)}</code>.${streamText}${coverageText}${reviewText}` +
        `<div class="mpp-actions"><button type="button" class="primary" data-mpp-action="download-xml">Download converted XML</button><button type="button" data-mpp-action="diagnostics">Download diagnostics</button><button type="button" data-mpp-action="dismiss">Dismiss</button></div>`,
        "ok",
        result.nativeTable ? "MPP decoded locally" : "MPP converted locally"
      );
      return;
    }

    const title = result.metadata?.title || result.metadata?.subject || file.name;
    const streamCount = result.streams?.length || 0;
    const candidates = (result.candidateStrings || []).slice(0, 12);
    const draftCount = result.draftProject?.taskCount || 0;
    const topStream = result.draftProject?.topStream;
    const dateHint = result.dateHints?.[0]?.date ? ` Date hint: <code>${escapeXml(result.dateHints[0].date)}</code>.` : "";
    const streamHint = topStream
      ? ` Strongest recovery stream: <code>${escapeXml(topStream.stream)}</code> (${topStream.count} hints, score ${topStream.averageScore}).`
      : "";
    const candidateHtml = candidates.length
      ? `<div class="mpp-recovery-list"><small><strong>Best recovered text hints</strong></small>${candidates.map((item) => `<span title="${escapeXml(item.stream || "")}">${escapeXml(item.value || item)}</span>`).join("")}</div>`
      : "";
    const draftAction = draftCount
      ? `<button type="button" class="primary" data-mpp-action="draft">Load ${draftCount} recovered name${draftCount === 1 ? "" : "s"} as draft tasks</button><button type="button" data-mpp-action="download-draft-xml">Download draft XML</button>`
      : "";
    const textAction = candidates.length
      ? `<button type="button" data-mpp-action="text">Download recovered text</button>`
      : "";

    setMppPanel(
      `<div class="mpp-hero compact">
        <div>
          <span class="mpp-kicker">Best-effort recovery</span>
          <h3>Read the native MPP container, but did not find embedded Project XML.</h3>
          <p>Opened <code>${escapeXml(file.name)}</code>, found ${streamCount} internal stream${streamCount === 1 ? "" : "s"}, and detected title hint <code>${escapeXml(title)}</code>.${dateHint}${streamHint}</p>
        </div>
        <div class="mpp-format-card"><strong>${draftCount}</strong><span>recoverable task-name hint${draftCount === 1 ? "" : "s"}</span></div>
      </div>` +
      `${candidateHtml}` +
      `<div class="mpp-actions">${draftAction}${textAction}<button type="button" data-mpp-action="diagnostics">Download diagnostics</button><button type="button" data-mpp-action="guide">Show XML fallback</button><button type="button" data-mpp-action="dismiss">Dismiss</button></div>` +
      `<small><strong>Honest limit:</strong> this static web converter can parse the MPP/OLE wrapper and recover embedded XML or likely task text. If the schedule lives only in private binary tables, this is a draft recovery, not full Microsoft Project parity.</small>`,
      draftCount ? "warn" : "warn",
      "MPP recovered locally"
    );
  } catch (error) {
    setMppPanel(
      `${escapeXml(error.message || "MPP conversion failed.")} <div class="mpp-actions"><button type="button" data-mpp-action="guide">Show XML fallback</button><button type="button" data-mpp-action="checklist">Download checklist</button><button type="button" data-mpp-action="dismiss">Dismiss</button></div>`,
      "warn",
      "MPP conversion failed"
    );
  }
}

function buildMppRecoveredSnapshot() {
  const draft = lastMppResult?.draftProject;
  if (!draft?.tasks?.length) return null;

  const start = draft.start && dateOnly(draft.start) ? draft.start : (state.projectStart || today);
  const tasks = draft.tasks.slice(0, 100).map((task, index) => {
    const taskStart = toDateInputValue(addDays(start, index * 2));
    const taskFinish = toDateInputValue(addDays(taskStart, 1));
    return {
      uid: index + 1,
      name: task.name || `Recovered task ${index + 1}`,
      start: taskStart,
      finish: taskFinish,
      durationDays: 2,
      percent: 0,
      predecessors: index > 0 ? [index] : [],
      links: index > 0 ? [{ id: index, type: "FS" }] : [],
      outlineLevel: 1,
      recovered: true,
      recoveryConfidence: task.confidence || 0,
    };
  });

  return {
    projectName: `${draft.name || lastMppResult.fileName || "Recovered MPP"} — recovered draft`,
    projectStart: start,
    nextUid: tasks.length + 1,
    tasks,
  };
}

function importMppRecoveredDraft() {
  const snapshot = buildMppRecoveredSnapshot();
  if (!snapshot?.tasks?.length) {
    alert("No recovered task-name hints are available from the last MPP file.");
    return;
  }
  state = snapshot;
  render();
  setMppPanel(`Loaded ${snapshot.tasks.length} recovered task-name hint${snapshot.tasks.length === 1 ? "" : "s"} as an editable draft. Review names, dates, and dependencies before exporting. <div class="mpp-actions"><button type="button" class="primary" data-mpp-action="download-draft-xml">Download draft XML</button><button type="button" data-mpp-action="diagnostics">Download diagnostics</button><button type="button" data-mpp-action="dismiss">Dismiss</button></div>`, "ok", "Recovered draft loaded");
}

function buildXmlFromSnapshot(snapshot) {
  const previousState = state;
  try {
    state = JSON.parse(JSON.stringify(snapshot));
    return buildProjectXml();
  } finally {
    state = previousState;
  }
}

function downloadMppConvertedXml() {
  if (!lastMppResult) {
    alert("Choose an MPP file first.");
    return;
  }
  if (lastMppResult.projectXml) {
    downloadText(lastMppResult.projectXml, `${safeFileName(lastMppResult.fileName || "converted-mpp")}.xml`, "application/xml");
    return;
  }
  downloadMppDraftXml();
}

function downloadMppDraftXml() {
  const snapshot = buildMppRecoveredSnapshot();
  if (!snapshot?.tasks?.length) {
    alert("No recovered draft is available from the last MPP file.");
    return;
  }
  const xml = buildXmlFromSnapshot(snapshot);
  downloadText(xml, `${safeFileName(lastMppResult?.fileName || "recovered-mpp")}-draft.xml`, "application/xml");
}

function downloadMppDiagnostics() {
  if (!lastMppResult) {
    alert("Choose an MPP file first.");
    return;
  }
  const diagnostics = window.NativeMppReader?.buildDiagnostics
    ? window.NativeMppReader.buildDiagnostics(lastMppResult)
    : lastMppResult;
  downloadText(JSON.stringify(diagnostics, null, 2), `${safeFileName(lastMppResult.fileName || "mpp")}-diagnostics.json`, "application/json");
}

function downloadMppRecoveredText() {
  if (!lastMppResult) {
    alert("Choose an MPP file first.");
    return;
  }
  const lines = [];
  lines.push(`Recovered text from ${lastMppResult.fileName || "MPP file"}`);
  lines.push(`Reader: ${lastMppResult.readerVersion || "unknown"}`);
  lines.push("");
  (lastMppResult.candidateStrings || []).forEach((item, index) => {
    lines.push(`${index + 1}. ${item.value}`);
    lines.push(`   score=${item.score ?? ""} method=${item.method || ""} stream=${item.stream || ""}`);
  });
  downloadText(lines.join("\n"), `${safeFileName(lastMppResult.fileName || "mpp")}-recovered-text.txt`, "text/plain");
}

async function handlePickedFile(file) {
  if (!file) return;
  const lowerName = String(file.name || "").toLowerCase();
  if (lowerName.endsWith(".xml")) {
    try {
      const text = await file.text();
      importProjectXml(text);
      setMppPanel(`Imported Project XML file <code>${escapeXml(file.name)}</code>.`, "ok", "Import complete");
    } catch (error) {
      setMppPanel(error.message || "XML import failed.", "warn", "Import failed");
      alert(error.message || "Import failed.");
    }
    return;
  }

  if (lowerName.endsWith(".mpp")) {
    await importProjectMppLocal(file);
    return;
  }

  setMppPanel(`That file type is not supported here. Use Project XML files ending in <code>.xml</code> or native Project files ending in <code>.mpp</code>.`, "warn", "Unsupported file");
}

function exportCsv() {
  ensureDecorations();
  rollupSummaryTasks();
  ensureDecorations();
  const rows = [["ID", "WBS", "Name", "Start", "Finish", "DurationDays", "PercentComplete", "Predecessors", "Successors", "OutlineLevel", "IsSummary", "Expanded"]];
  state.tasks.forEach((task) => {
    rows.push([
      task.id,
      task.wbs,
      task.name,
      task.start,
      task.finish,
      task.durationDays,
      task.percent,
      formatLinks(task.links).replaceAll(",", ";"),
      formatSuccessorLinks(task.id).replaceAll(",", ";"),
      task.outlineLevel,
      task.isSummary ? "Yes" : "No",
      task.expanded === false ? "No" : "Yes",
    ]);
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  downloadText(csv, `${safeFileName(state.projectName)}.csv`, "text/csv");
}

function downloadText(text, filename, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(name) {
  return String(name || "project")
    .trim()
    .replace(/[^a-z0-9-_]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "project";
}

function loadSample(shouldRender = true) {
  const start = state.projectStart || today;
  state = {
    projectName: "Chris Discount Launch Plan",
    projectStart: start,
    nextUid: 8,
    tasks: [
      { uid: 1, name: "Finalize requirements", start, finish: toDateInputValue(addDays(start, 1)), percent: 100, predecessors: [], links: [], outlineLevel: 1 },
      { uid: 2, name: "Build import/export MVP", start: toDateInputValue(addDays(start, 2)), finish: toDateInputValue(addDays(start, 5)), percent: 70, predecessors: [1], links: [{ id: 1, type: "FS" }], outlineLevel: 1 },
      { uid: 3, name: "Validate Microsoft Project XML", start: toDateInputValue(addDays(start, 6)), finish: toDateInputValue(addDays(start, 7)), percent: 25, predecessors: [2], links: [{ id: 2, type: "FS" }], outlineLevel: 1 },
      { uid: 4, name: "Add schedule polish", start: toDateInputValue(addDays(start, 8)), finish: toDateInputValue(addDays(start, 10)), percent: 0, predecessors: [3], links: [{ id: 3, type: "FS" }], outlineLevel: 1 },
      { uid: 5, name: "User acceptance test", start: toDateInputValue(addDays(start, 11)), finish: toDateInputValue(addDays(start, 12)), percent: 0, predecessors: [4], links: [{ id: 4, type: "FS" }], outlineLevel: 1 },
      { uid: 6, name: "Prepare release notes", start: toDateInputValue(addDays(start, 11)), finish: toDateInputValue(addDays(start, 12)), percent: 0, predecessors: [4], links: [{ id: 4, type: "SS" }], outlineLevel: 1 },
      { uid: 7, name: "Submit build", start: toDateInputValue(addDays(start, 13)), finish: toDateInputValue(addDays(start, 13)), percent: 0, predecessors: [5, 6], links: [{ id: 5, type: "FS" }, { id: 6, type: "FF" }], outlineLevel: 1 },
    ],
  };
  if (shouldRender) render();
}


function linkTypeFromEndpoints(sourceEndpoint, targetEndpoint) {
  const type = `${sourceEndpoint}${targetEndpoint}`.toUpperCase();
  return LINK_TYPES.includes(type) ? type : "FS";
}

function getPortCenter(port) {
  const rect = port.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function findDependencyPortFromPoint(clientX, clientY, sourceIndex) {
  const candidates = document.elementsFromPoint(clientX, clientY);
  const port = candidates
    .map((element) => element.closest?.("[data-link-endpoint]"))
    .find((candidate) => candidate && Number(candidate.dataset.index) !== sourceIndex);
  if (!port) return null;
  const index = Number(port.dataset.index);
  const endpoint = port.dataset.linkEndpoint;
  if (!Number.isInteger(index) || !["S", "F"].includes(endpoint)) return null;
  return { index, endpoint, port, ...getPortCenter(port) };
}

function clearDependencyTargetHighlight() {
  document.querySelectorAll(".dependency-port.is-link-source, .dependency-port.is-link-target").forEach((port) => {
    port.classList.remove("is-link-source", "is-link-target");
  });
  document.querySelectorAll(".gantt-bar.is-link-target").forEach((bar) => bar.classList.remove("is-link-target"));
  document.body.classList.remove("is-link-dragging", "is-link-hovering");
}

function updateDependencyDragLine(clientX, clientY, target = null) {
  if (!activeDependencyDrag || !els.linkDragPath) return;
  const startX = activeDependencyDrag.startX;
  const startY = activeDependencyDrag.startY;
  const endX = target?.x ?? clientX;
  const endY = target?.y ?? clientY;
  const spread = Math.max(48, Math.abs(endX - startX) * 0.42);
  const direction = endX >= startX ? 1 : -1;
  const c1x = startX + spread * direction;
  const c2x = endX - spread * direction;
  els.linkDragPath.setAttribute("d", `M ${startX} ${startY} C ${c1x} ${startY}, ${c2x} ${endY}, ${endX} ${endY}`);

  if (els.linkDragDot) {
    els.linkDragDot.setAttribute("cx", String(endX));
    els.linkDragDot.setAttribute("cy", String(endY));
  }

  if (els.linkDragLabel) {
    const text = target
      ? `${linkTypeFromEndpoints(activeDependencyDrag.sourceEndpoint, target.endpoint)} · ${LINK_TYPE_LABELS[linkTypeFromEndpoints(activeDependencyDrag.sourceEndpoint, target.endpoint)]}`
      : `${activeDependencyDrag.sourceEndpoint} → grab another S/F dot`;
    els.linkDragLabel.textContent = text;
    els.linkDragLabel.setAttribute("x", String((startX + endX) / 2 + 10));
    els.linkDragLabel.setAttribute("y", String((startY + endY) / 2 - 10));
  }
}

function updateDependencyTargetHighlight(clientX, clientY) {
  if (!activeDependencyDrag) return null;
  document.querySelectorAll(".dependency-port.is-link-target").forEach((port) => port.classList.remove("is-link-target"));
  document.querySelectorAll(".gantt-bar.is-link-target").forEach((bar) => bar.classList.remove("is-link-target"));
  document.body.classList.remove("is-link-hovering");

  const target = findDependencyPortFromPoint(clientX, clientY, activeDependencyDrag.sourceIndex);
  activeDependencyDrag.targetIndex = target?.index ?? null;
  activeDependencyDrag.targetEndpoint = target?.endpoint ?? null;

  if (target?.port) {
    target.port.classList.add("is-link-target");
    target.port.closest(".gantt-bar")?.classList.add("is-link-target");
    document.body.classList.add("is-link-hovering");
  }

  updateDependencyDragLine(clientX, clientY, target);
  return target;
}

function openDependencyPicker(predecessor, successor, onChoice) {
  if (!els.dependencyModal) {
    onChoice("FS");
    return;
  }

  pendingDependencyChoice = { onChoice };
  if (els.dependencyModalTitle) {
    els.dependencyModalTitle.textContent = `Link ${predecessor.id}. ${predecessor.name} to ${successor.id}. ${successor.name}`;
  }
  if (els.dependencyModalCopy) {
    els.dependencyModalCopy.textContent = `${predecessor.name} will become the predecessor for ${successor.name}. Choose how their dates should relate.`;
  }

  els.dependencyModal.hidden = false;
  document.body.classList.add("is-modal-open");
  requestAnimationFrame(() => {
    els.dependencyModal?.querySelector("[data-link-choice='FS']")?.focus();
  });
}

function finishDependencyPicker(type) {
  const request = pendingDependencyChoice;
  pendingDependencyChoice = null;

  if (els.dependencyModal) {
    els.dependencyModal.hidden = true;
  }
  document.body.classList.remove("is-modal-open");

  if (!request) return;
  request.onChoice(LINK_TYPES.includes(type) ? type : null);
}


function describeLinkType(type) {
  return LINK_TYPE_LABELS[type] || LINK_TYPE_LABELS.FS;
}

function formatFriendlyDate(value) {
  const date = dateOnly(value);
  if (!date) return "unknown";
  return date.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function calculateLinkAlignedDates(predecessor, successor, type) {
  const duration = Math.max(1, successor.durationDays || daysBetween(successor.start, successor.finish));
  const predStart = dateOnly(predecessor.start);
  const predFinish = dateOnly(predecessor.finish);
  if (!predStart || !predFinish) return null;

  let start;
  let finish;

  if (type === "FS") {
    start = addDays(predFinish, 1);
    finish = addDays(start, duration - 1);
  } else if (type === "SS") {
    start = predStart;
    finish = addDays(start, duration - 1);
  } else if (type === "FF") {
    finish = predFinish;
    start = addDays(finish, 1 - duration);
  } else if (type === "SF") {
    finish = predStart;
    start = addDays(finish, 1 - duration);
  } else {
    start = addDays(predFinish, 1);
    finish = addDays(start, duration - 1);
  }

  return {
    start: toDateInputValue(start),
    finish: toDateInputValue(finish),
    durationDays: duration,
  };
}

function datesAlreadyMatch(task, proposedDates) {
  return proposedDates && task.start === proposedDates.start && task.finish === proposedDates.finish;
}


function latestDate(dates) {
  const valid = dates.filter(Boolean).map((date) => dateOnly(date)).filter(Boolean);
  if (!valid.length) return null;
  return new Date(Math.max(...valid.map(Number)));
}

function calculateTaskDatesFromLinks(task, byId) {
  const links = getTaskLinks(task);
  if (!links.length) return null;

  const duration = Math.max(1, task.durationDays || daysBetween(task.start, task.finish));
  const startRequirements = [];
  const finishRequirements = [];

  links.forEach((link) => {
    const pred = byId.get(link.id);
    if (!pred) return;
    const predStart = dateOnly(pred.start);
    const predFinish = dateOnly(pred.finish);
    if (!predStart || !predFinish) return;

    if (link.type === "FS") startRequirements.push(addDays(predFinish, 1));
    else if (link.type === "SS") startRequirements.push(predStart);
    else if (link.type === "FF") finishRequirements.push(predFinish);
    else if (link.type === "SF") finishRequirements.push(predStart);
  });

  const latestStartRequirement = latestDate(startRequirements);
  const latestFinishRequirement = latestDate(finishRequirements);
  if (!latestStartRequirement && !latestFinishRequirement) return null;

  const finishDrivenStart = latestFinishRequirement ? addDays(latestFinishRequirement, 1 - duration) : null;
  const desiredStart = latestDate([latestStartRequirement, finishDrivenStart]) || dateOnly(task.start) || dateOnly(state.projectStart) || dateOnly(today);
  const desiredFinish = addDays(desiredStart, duration - 1);

  return {
    start: toDateInputValue(desiredStart),
    finish: toDateInputValue(desiredFinish),
    durationDays: duration,
  };
}

function applyDatesToTask(task, dates) {
  if (!task || !dates) return false;
  const changed = task.start !== dates.start || task.finish !== dates.finish || task.durationDays !== dates.durationDays;
  if (!changed) return false;
  task.start = dates.start;
  task.finish = dates.finish;
  task.durationDays = dates.durationDays;
  return true;
}

function alignTaskToLinks(task, byId) {
  return applyDatesToTask(task, calculateTaskDatesFromLinks(task, byId));
}

function cascadeScheduleFromTask(sourceTaskId, options = {}) {
  ensureDecorations();
  const cycles = detectCycles();
  if (cycles.length) {
    if (!options.silent) alert("Fix dependency loops before cascading linked tasks.");
    return false;
  }

  const impacted = new Set([sourceTaskId]);
  let changedAny = false;
  let changed = true;
  let guard = 0;

  while (changed && guard < state.tasks.length * state.tasks.length + 20) {
    changed = false;
    guard += 1;
    const byId = new Map(state.tasks.map((task) => [task.id, task]));

    state.tasks.forEach((task) => {
      if (!getTaskLinks(task).some((link) => impacted.has(link.id))) return;
      if (alignTaskToLinks(task, byId)) {
        impacted.add(task.id);
        changed = true;
        changedAny = true;
      }
    });
  }

  if (options.render !== false) render();
  return changedAny;
}

function scheduleAllLinkedTasks(options = {}) {
  ensureDecorations();
  const cycles = detectCycles();
  if (cycles.length) {
    if (!options.silent) alert("Fix dependency loops before auto-scheduling.");
    return false;
  }

  let changedAny = false;
  let changed = true;
  let guard = 0;

  while (changed && guard < state.tasks.length * state.tasks.length + 20) {
    changed = false;
    guard += 1;
    const byId = new Map(state.tasks.map((task) => [task.id, task]));

    state.tasks.forEach((task) => {
      if (alignTaskToLinks(task, byId)) {
        changed = true;
        changedAny = true;
      }
    });
  }

  if (options.render !== false) render();
  return true;
}

function cloneScheduleTasks(tasks = state.tasks) {
  return tasks.map((task) => ({
    ...task,
    links: getTaskLinks(task).map((link) => ({ ...link })),
    predecessors: [...(task.predecessors || [])],
  }));
}

function cascadeTaskListFromSource(tasks, sourceTaskId) {
  const impacted = new Set([sourceTaskId]);
  let changed = true;
  let guard = 0;

  while (changed && guard < tasks.length * tasks.length + 20) {
    changed = false;
    guard += 1;
    const byId = new Map(tasks.map((task) => [task.id, task]));

    tasks.forEach((task) => {
      if (!getTaskLinks(task).some((link) => impacted.has(link.id))) return;
      if (alignTaskToLinks(task, byId)) {
        impacted.add(task.id);
        changed = true;
      }
    });
  }

  return impacted;
}

function calculateCascadeImpact(sourceTaskId) {
  ensureDecorations();
  if (!state.tasks.some((task) => task.id === sourceTaskId)) return [];

  const originalById = new Map(state.tasks.map((task) => [task.id, task]));
  const simulatedTasks = cloneScheduleTasks();
  cascadeTaskListFromSource(simulatedTasks, sourceTaskId);

  return simulatedTasks
    .filter((task) => task.id !== sourceTaskId)
    .map((task) => {
      const original = originalById.get(task.id);
      if (!original) return null;
      const changed = original.start !== task.start || original.finish !== task.finish || original.durationDays !== task.durationDays;
      if (!changed) return null;
      return {
        id: task.id,
        name: task.name,
        from: {
          start: original.start,
          finish: original.finish,
          durationDays: original.durationDays,
        },
        to: {
          start: task.start,
          finish: task.finish,
          durationDays: task.durationDays,
        },
      };
    })
    .filter(Boolean);
}

function applyCascadeImpact(changes) {
  const byId = new Map(state.tasks.map((task) => [task.id, task]));
  (changes || []).forEach((change) => {
    const task = byId.get(change.id);
    if (!task) return;
    task.start = change.to.start;
    task.finish = change.to.finish;
    task.durationDays = change.to.durationDays;
  });
}

function buildCascadeSuggestionHtml(details) {
  const changes = details.changes || [];
  const source = details.source || { name: "this task" };
  const primary = changes[0] || null;
  const remainingCount = Math.max(0, changes.length - 1);
  const primaryMarkup = primary ? `
    <div class="cascade-primary-impact">
      <div>
        <span class="impact-kicker">Next linked task</span>
        <strong>${escapeXml(primary.name)}</strong>
      </div>
      <div class="impact-dates">
        <span>${escapeXml(formatFriendlyDate(primary.from.start))} → ${escapeXml(formatFriendlyDate(primary.from.finish))}</span>
        <b>→</b>
        <span>${escapeXml(formatFriendlyDate(primary.to.start))} → ${escapeXml(formatFriendlyDate(primary.to.finish))}</span>
      </div>
    </div>` : "";
  const extra = remainingCount > 0
    ? `<p class="cascade-extra">Also affects ${remainingCount} more downstream linked task${remainingCount === 1 ? "" : "s"}. Choose <strong>Move linked tasks</strong> to update the whole chain.</p>`
    : `<p class="cascade-extra">Only the next linked task needs adjustment.</p>`;

  return `
    <div class="cascade-suggestion-head">
      <span class="cascade-impact-chip">${changes.length}</span>
      <div>
        <strong>Linked task may need to move</strong>
        <small>You changed ${escapeXml(source.name)}. Showing the next impacted task; the rest of the chain is summarized so the popup stays lightweight.</small>
      </div>
      <button type="button" class="link-suggestion-x" data-cascade-action="keep" aria-label="Keep downstream dates">×</button>
    </div>
    ${primaryMarkup}
    ${extra}
    <div class="link-suggestion-actions cascade-actions">
      <button type="button" class="primary" data-cascade-action="apply">Move linked tasks</button>
      <button type="button" data-cascade-action="keep">Keep dates</button>
      <button type="button" data-cascade-action="undo">Undo my edit</button>
    </div>`;
}

function renderCascadeImpactSuggestion() {
  if (!els.cascadeSuggestion) return;
  if (!pendingCascadeChoice) {
    els.cascadeSuggestion.hidden = true;
    els.cascadeSuggestion.innerHTML = "";
    document.body.classList.remove("has-cascade-suggestion");
    return;
  }

  els.cascadeSuggestion.innerHTML = buildCascadeSuggestionHtml(pendingCascadeChoice);
  els.cascadeSuggestion.hidden = false;
  document.body.classList.add("has-cascade-suggestion");
}

function openCascadeImpactPrompt(details) {
  pendingCascadeChoice = details;
  render();
}

function finishCascadeImpactChoice(choice) {
  const request = pendingCascadeChoice;
  pendingCascadeChoice = null;
  if (els.cascadeSuggestion) {
    els.cascadeSuggestion.hidden = true;
    els.cascadeSuggestion.innerHTML = "";
  }
  document.body.classList.remove("has-cascade-suggestion");

  if (!request) return;

  if (choice === "apply") {
    applyCascadeImpact(request.changes);
  } else if (choice === "undo") {
    const source = state.tasks.find((task) => task.id === request.source?.id);
    if (source && request.originalDates) {
      source.start = request.originalDates.start;
      source.finish = request.originalDates.finish;
      source.durationDays = request.originalDates.durationDays;
    }
  }

  render();
}

function buildScheduleSuggestionHtml(details) {
  const { predecessor, successor, type, proposedDates } = details;
  const current = `${formatFriendlyDate(successor.start)} → ${formatFriendlyDate(successor.finish)}`;
  const proposed = `${formatFriendlyDate(proposedDates.start)} → ${formatFriendlyDate(proposedDates.finish)}`;
  const relationship = describeLinkType(type);
  return `
    <div class="link-suggestion-head">
      <span class="link-type-chip">${escapeXml(type)}</span>
      <div>
        <strong>Link created: ${escapeXml(predecessor.name)} → ${escapeXml(successor.name)}</strong>
        <small>${escapeXml(relationship)}. The ghost bar shows the suggested move; downstream linked tasks will follow.</small>
      </div>
      <button type="button" class="link-suggestion-x" data-schedule-action="cancel" aria-label="Undo dependency link">×</button>
    </div>
    <div class="link-suggestion-grid">
      <div>
        <span>Current</span>
        <strong>${escapeXml(current)}</strong>
      </div>
      <div>
        <span>Suggested</span>
        <strong>${escapeXml(proposed)}</strong>
      </div>
    </div>
    <div class="link-suggestion-actions">
      <button type="button" class="primary" data-schedule-action="move">Apply move</button>
      <button type="button" data-schedule-action="keep">Keep dates</button>
      <button type="button" data-schedule-action="cancel">Undo link</button>
    </div>`;
}

function getRenderedPortCenter(taskId, endpoint) {
  const index = state.tasks.findIndex((task) => task.id === taskId);
  if (index < 0) return null;
  const port = document.querySelector(`.dependency-port[data-index="${index}"][data-link-endpoint="${endpoint}"]`);
  return port ? getPortCenter(port) : null;
}

function drawPendingConnectorLine() {
  if (!pendingScheduleChoice || !els.linkDragPath) return;
  const { predecessor, successor, sourceEndpoint, targetEndpoint, type } = pendingScheduleChoice;
  const start = getRenderedPortCenter(predecessor.id, sourceEndpoint || type?.[0] || "F");
  const end = getRenderedPortCenter(successor.id, targetEndpoint || type?.[1] || "S");
  if (!start || !end) return;
  const spread = Math.max(48, Math.abs(end.x - start.x) * 0.42);
  const direction = end.x >= start.x ? 1 : -1;
  const c1x = start.x + spread * direction;
  const c2x = end.x - spread * direction;
  els.linkDragPath.setAttribute("d", `M ${start.x} ${start.y} C ${c1x} ${start.y}, ${c2x} ${end.y}, ${end.x} ${end.y}`);
  if (els.linkDragDot) {
    els.linkDragDot.setAttribute("cx", String(end.x));
    els.linkDragDot.setAttribute("cy", String(end.y));
  }
  if (els.linkDragLabel) {
    els.linkDragLabel.textContent = `${type} · ${describeLinkType(type)}`;
    els.linkDragLabel.setAttribute("x", String((start.x + end.x) / 2 + 10));
    els.linkDragLabel.setAttribute("y", String((start.y + end.y) / 2 - 10));
  }
}

function clearConnectorOverlay() {
  if (activeDependencyDrag || pendingScheduleChoice) return;
  if (els.linkDragPath) els.linkDragPath.setAttribute("d", "");
  if (els.linkDragLabel) els.linkDragLabel.textContent = "";
  if (els.linkDragDot) {
    els.linkDragDot.setAttribute("cx", "0");
    els.linkDragDot.setAttribute("cy", "0");
  }
}

function positionScheduleSuggestion() {
  if (!pendingScheduleChoice || !els.linkSuggestion || els.linkSuggestion.hidden) return;
  const anchor = pendingScheduleChoice.anchor || {};
  const successorIndex = state.tasks.findIndex((task) => task.id === pendingScheduleChoice.successor?.id);
  const targetBar = successorIndex >= 0 ? document.querySelector(`.gantt-bar[data-index="${successorIndex}"]`) : null;
  const barRect = targetBar?.getBoundingClientRect();
  const cardRect = els.linkSuggestion.getBoundingClientRect();
  const preferredX = anchor.x ?? (barRect ? barRect.left + barRect.width / 2 : window.innerWidth / 2);
  const preferredY = anchor.y ?? (barRect ? barRect.bottom + 14 : window.innerHeight / 2);
  const margin = 18;
  const left = clamp(preferredX - cardRect.width / 2, margin, Math.max(margin, window.innerWidth - cardRect.width - margin));
  let top = preferredY + 18;
  if (top + cardRect.height > window.innerHeight - margin && barRect) {
    top = barRect.top - cardRect.height - 16;
  }
  top = clamp(top, margin, Math.max(margin, window.innerHeight - cardRect.height - margin));
  els.linkSuggestion.style.left = `${left}px`;
  els.linkSuggestion.style.top = `${top}px`;
}

function renderScheduleLinkSuggestion() {
  if (!els.linkSuggestion) return;
  if (!pendingScheduleChoice) {
    els.linkSuggestion.hidden = true;
    els.linkSuggestion.innerHTML = "";
    document.body.classList.remove("has-link-suggestion");
    clearConnectorOverlay();
    return;
  }

  els.linkSuggestion.innerHTML = buildScheduleSuggestionHtml(pendingScheduleChoice);
  els.linkSuggestion.hidden = false;
  document.body.classList.add("has-link-suggestion");
  requestAnimationFrame(() => {
    positionScheduleSuggestion();
    drawPendingConnectorLine();
  });
}

function openScheduleLinkModal(details) {
  // Kept the old function name so the dependency flow stays simple, but this is
  // now an inline schedule suggestion instead of a blocking modal.
  pendingScheduleChoice = details;
  render();
}

function finishScheduleLinkChoice(choice) {
  const request = pendingScheduleChoice;
  pendingScheduleChoice = null;

  if (els.linkSuggestion) {
    els.linkSuggestion.hidden = true;
    els.linkSuggestion.innerHTML = "";
  }
  if (els.scheduleLinkModal) {
    els.scheduleLinkModal.hidden = true;
  }
  document.body.classList.remove("is-modal-open", "has-link-suggestion");

  if (!request) return;
  request.onChoice(choice);
}

function addDependencyLink(sourceIndex, targetIndex, type, anchor = null) {
  ensureDecorations();
  const predecessor = state.tasks[sourceIndex];
  const successor = state.tasks[targetIndex];
  if (!predecessor || !successor || predecessor.id === successor.id) return false;

  const previousLinks = getTaskLinks(successor);
  const previousDates = {
    start: successor.start,
    finish: successor.finish,
    durationDays: successor.durationDays,
  };

  successor.links = previousLinks.filter((link) => link.id !== predecessor.id);
  successor.links.push({ id: predecessor.id, type });
  successor.predecessors = successor.links.map((link) => link.id);

  const cycles = detectCycles();
  if (cycles.length) {
    successor.links = previousLinks;
    successor.predecessors = previousLinks.map((link) => link.id);
    alert(`That would create a dependency loop: ${cycles[0].join(" → ")}.`);
    return false;
  }

  const proposedDates = calculateLinkAlignedDates(predecessor, successor, type);
  if (!proposedDates || datesAlreadyMatch(successor, proposedDates)) {
    render();
    return true;
  }

  openScheduleLinkModal({
    predecessor: { ...predecessor },
    successor: { ...successor },
    type,
    sourceEndpoint: type[0],
    targetEndpoint: type[1],
    proposedDates,
    anchor,
    onChoice: (choice) => {
      if (choice === "move") {
        successor.start = proposedDates.start;
        successor.finish = proposedDates.finish;
        successor.durationDays = proposedDates.durationDays;
        cascadeScheduleFromTask(successor.id, { silent: true });
        return;
      }

      if (choice === "cancel") {
        successor.links = previousLinks;
        successor.predecessors = previousLinks.map((link) => link.id);
        successor.start = previousDates.start;
        successor.finish = previousDates.finish;
        successor.durationDays = previousDates.durationDays;
      }

      render();
    },
  });

  return true;
}

function beginDependencyDrag(event) {
  const port = event.target.closest?.("[data-link-endpoint]");
  if (!port) return false;
  if (event.button !== undefined && event.button !== 0) return true;

  const sourceIndex = Number(port.dataset.index);
  const sourceEndpoint = port.dataset.linkEndpoint;
  const sourceTask = state.tasks[sourceIndex];
  if (!sourceTask || !["S", "F"].includes(sourceEndpoint)) return true;

  const center = getPortCenter(port);
  activeDependencyDrag = {
    sourceIndex,
    sourceEndpoint,
    pointerId: event.pointerId,
    startX: center.x,
    startY: center.y,
    currentX: event.clientX,
    currentY: event.clientY,
    targetIndex: null,
    targetEndpoint: null,
  };

  port.classList.add("is-link-source");
  document.body.classList.add("is-link-dragging");
  port.setPointerCapture?.(event.pointerId);
  updateDependencyDragLine(event.clientX, event.clientY);
  event.preventDefault();
  event.stopPropagation();
  return true;
}

function updateDependencyDrag(event) {
  if (!activeDependencyDrag) return;
  activeDependencyDrag.currentX = event.clientX;
  activeDependencyDrag.currentY = event.clientY;
  updateDependencyTargetHighlight(event.clientX, event.clientY);
  event.preventDefault();
}

function endDependencyDrag(event) {
  if (!activeDependencyDrag) return;
  const drag = activeDependencyDrag;
  const target = findDependencyPortFromPoint(
    drag.currentX ?? event?.clientX ?? drag.startX,
    drag.currentY ?? event?.clientY ?? drag.startY,
    drag.sourceIndex
  );
  const type = target ? linkTypeFromEndpoints(drag.sourceEndpoint, target.endpoint) : null;

  activeDependencyDrag = null;
  clearDependencyTargetHighlight();
  updateDependencyDragLine(0, 0);
  if (els.linkDragPath) els.linkDragPath.setAttribute("d", "");
  if (els.linkDragLabel) els.linkDragLabel.textContent = "";

  if (target && type) {
    addDependencyLink(drag.sourceIndex, target.index, type, { x: drag.currentX ?? target.x, y: drag.currentY ?? target.y });
    return;
  }

  render();
}

function beginGanttDrag(event) {
  if (beginDependencyDrag(event)) return;
  const bar = event.target.closest(".gantt-bar");
  if (!bar || !(event.target instanceof Element)) return;
  if (event.button !== undefined && event.button !== 0) return;

  const index = Number(bar.dataset.index);
  const task = state.tasks[index];
  if (!task) return;

  const resizeHandle = event.target.closest("[data-resize-edge]");
  const edge = resizeHandle?.dataset.resizeEdge;
  const mode = edge === "start" ? "resize-start" : edge === "finish" ? "resize-finish" : "move";
  const startDate = dateOnly(task.start);
  const finishDate = dateOnly(task.finish);
  if (!startDate || !finishDate) return;

  activeBarDrag = {
    index,
    mode,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    originalStart: startDate,
    originalFinish: finishDate,
    linkTargetIndex: null,
  };

  document.body.classList.add("is-gantt-dragging");
  bar.classList.add("is-dragging");
  bar.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function updateGanttDrag(event) {
  if (!activeBarDrag) return;
  activeBarDrag.currentX = event.clientX;
  activeBarDrag.currentY = event.clientY;
  const deltaDays = Math.round((event.clientX - activeBarDrag.startX) / uiPrefs.dayWidth);
  const task = state.tasks[activeBarDrag.index];
  if (!task) return;

  if (activeBarDrag.mode === "move") {
    task.start = toDateInputValue(addDays(activeBarDrag.originalStart, deltaDays));
    task.finish = toDateInputValue(addDays(activeBarDrag.originalFinish, deltaDays));
  } else if (activeBarDrag.mode === "resize-finish") {
    const finish = addDays(activeBarDrag.originalFinish, deltaDays);
    task.start = toDateInputValue(activeBarDrag.originalStart);
    task.finish = toDateInputValue(dateOnly(finish) < activeBarDrag.originalStart ? activeBarDrag.originalStart : finish);
  } else if (activeBarDrag.mode === "resize-start") {
    const start = addDays(activeBarDrag.originalStart, deltaDays);
    task.start = toDateInputValue(dateOnly(start) > activeBarDrag.originalFinish ? activeBarDrag.originalFinish : start);
    task.finish = toDateInputValue(activeBarDrag.originalFinish);
  }

  task.durationDays = daysBetween(task.start, task.finish);
  pendingCascadeChoice = null;
  renderGantt();
  renderSummary();
  event.preventDefault();
}

function endGanttDrag() {
  if (!activeBarDrag) return;
  const drag = activeBarDrag;
  const task = state.tasks[drag.index];
  const editedTaskId = task?.id;
  const originalDates = drag.originalStart && drag.originalFinish ? {
    start: toDateInputValue(drag.originalStart),
    finish: toDateInputValue(drag.originalFinish),
    durationDays: daysBetween(drag.originalStart, drag.originalFinish),
  } : null;

  activeBarDrag = null;
  document.body.classList.remove("is-gantt-dragging");

  if (!task || !editedTaskId || !originalDates) {
    render();
    return;
  }

  const taskChanged = task.start !== originalDates.start || task.finish !== originalDates.finish || task.durationDays !== originalDates.durationDays;
  if (!taskChanged) {
    render();
    return;
  }

  const changes = calculateCascadeImpact(editedTaskId);
  if (changes.length) {
    openCascadeImpactPrompt({
      source: { id: task.id, name: task.name },
      originalDates,
      changes,
    });
    return;
  }

  render();
}

function beginColumnResize(event) {
  if (!(event.target instanceof Element)) return;
  const columnHandle = event.target.closest("[data-column-resize]");
  const splitterHandle = event.target.closest("[data-pane-splitter]");
  const dayHandle = event.target.closest("[data-day-resize]");
  if (!columnHandle && !splitterHandle && !dayHandle) return;
  if (event.button !== undefined && event.button !== 0) return;

  if (dayHandle) {
    activeColumnDrag = {
      type: "day",
      pointerId: event.pointerId,
      startX: event.clientX,
      originalWidth: uiPrefs.dayWidth,
    };
  } else if (splitterHandle) {
    activeColumnDrag = {
      type: "splitter",
      pointerId: event.pointerId,
      startX: event.clientX,
      originalWidth: getFieldPaneWidth(),
    };
  } else {
    const key = columnHandle.dataset.columnResize;
    const column = FIELD_COLUMN_MAP.get(key);
    if (!column) return;
    activeColumnDrag = {
      type: "column",
      key,
      pointerId: event.pointerId,
      startX: event.clientX,
      originalWidth: uiPrefs.fieldColumns[key] ?? column.defaultWidth,
      originalPaneWidth: getFieldPaneWidth(),
      originalTotalWidth: getTotalFieldColumnWidth(),
    };
  }

  document.body.classList.add("is-column-resizing");
  event.target.setPointerCapture?.(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function updateColumnResize(event) {
  if (!activeColumnDrag) return;
  const delta = event.clientX - activeColumnDrag.startX;

  if (activeColumnDrag.type === "day") {
    uiPrefs.dayWidth = clamp(activeColumnDrag.originalWidth + delta, 36, 120);
  } else if (activeColumnDrag.type === "splitter") {
    setFieldPaneWidth(activeColumnDrag.originalWidth + delta);
  } else {
    const column = FIELD_COLUMN_MAP.get(activeColumnDrag.key);
    if (!column) return;
    uiPrefs.fieldColumns[activeColumnDrag.key] = clamp(activeColumnDrag.originalWidth + delta, column.min, column.max);

    // If the fields pane was fully open when the resize started, keep it fully
    // open. If it was intentionally collapsed, keep the same clipped boundary.
    const newTotalWidth = getTotalFieldColumnWidth();
    if (activeColumnDrag.originalPaneWidth >= activeColumnDrag.originalTotalWidth - 1) {
      uiPrefs.fieldPaneWidth = newTotalWidth;
    } else {
      setFieldPaneWidth(uiPrefs.fieldPaneWidth);
    }
  }

  saveUiPrefs();
  applyUiPrefs();
  renderGantt();
  event.preventDefault();
}

function endColumnResize() {
  if (!activeColumnDrag) return;
  activeColumnDrag = null;
  document.body.classList.remove("is-column-resizing");
  render();
}

function handleUiRangeChange(key, value) {
  uiPrefs[key] = key === "dayWidth" ? clamp(value, 36, 120) : clamp(value, 44, 88);
  saveUiPrefs();
  applyUiPrefs();
  renderGantt();
}

els.gantt.addEventListener("pointerdown", beginGanttDrag);
els.timeline.addEventListener("pointerdown", beginColumnResize);
window.addEventListener("pointermove", updateGanttDrag);
window.addEventListener("pointerup", endGanttDrag);
window.addEventListener("pointercancel", endGanttDrag);
window.addEventListener("pointermove", updateDependencyDrag);
window.addEventListener("pointerup", endDependencyDrag);
window.addEventListener("pointercancel", endDependencyDrag);
window.addEventListener("pointermove", updateColumnResize);
window.addEventListener("pointerup", endColumnResize);
window.addEventListener("pointercancel", endColumnResize);

els.dayWidthControl?.addEventListener("input", (event) => handleUiRangeChange("dayWidth", event.target.value));
els.rowHeightControl?.addEventListener("input", (event) => handleUiRangeChange("rowHeight", event.target.value));
window.addEventListener("resize", applyUiPrefs);

els.taskBody.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const index = Number(target.dataset.index);
  const field = target.dataset.field;
  if (field) updateTask(index, field, target.value);
});

els.taskBody.addEventListener("click", (event) => {
  const toggle = event.target.closest("button[data-action='toggle-summary']");
  if (toggle) {
    const task = state.tasks[Number(toggle.dataset.index)];
    if (task) {
      task.expanded = task.expanded === false;
      render();
    }
    return;
  }

  const button = event.target.closest("button[data-action='delete']");
  if (!button) return;
  deleteTask(Number(button.dataset.index));
});

els.projectName.addEventListener("change", () => {
  state.projectName = els.projectName.value.trim() || "New Project";
  render();
});

els.projectStart.addEventListener("change", () => {
  state.projectStart = els.projectStart.value || today;
  if (!state.tasks.length) render();
  else {
    const firstStart = state.tasks[0]?.start;
    if (!firstStart) state.tasks[0].start = state.projectStart;
    render();
  }
});

els.newProjectBtn.addEventListener("click", () => {
  state = { projectName: "New Project", projectStart: today, nextUid: 1, tasks: [] };
  addTask();
});

els.sampleBtn.addEventListener("click", () => loadSample(true));
els.addTaskBtn.addEventListener("click", addTask);
els.autoScheduleBtn.addEventListener("click", autoSchedule);
els.exportXmlBtn.addEventListener("click", () => downloadText(buildProjectXml(), `${safeFileName(state.projectName)}.xml`, "application/xml"));
els.exportCsvBtn.addEventListener("click", exportCsv);

els.importXmlInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  await handlePickedFile(file);
  els.importXmlInput.value = "";
});

els.importMppInput?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  await handlePickedFile(file);
  if (els.importMppInput) els.importMppInput.value = "";
});

els.mppPanel?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-mpp-action]");
  if (!button) return;
  const action = button.dataset.mppAction;
  if (action === "choose-xml") chooseConvertedXml();
  if (action === "draft") importMppRecoveredDraft();
  if (action === "download-xml") downloadMppConvertedXml();
  if (action === "download-draft-xml") downloadMppDraftXml();
  if (action === "text") downloadMppRecoveredText();
  if (action === "diagnostics") downloadMppDiagnostics();
  if (action === "guide") showMppConversionGuide();
  if (action === "copy") copyMppSteps();
  if (action === "checklist") downloadMppChecklist();
  if (action === "dismiss") els.mppPanel.hidden = true;
});

document.addEventListener("dragenter", (event) => {
  if (!event.dataTransfer?.types?.includes("Files")) return;
  fileDragDepth += 1;
  showFileDropOverlay(true);
});

document.addEventListener("dragover", (event) => {
  if (!event.dataTransfer?.types?.includes("Files")) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
});

document.addEventListener("dragleave", (event) => {
  if (!event.dataTransfer?.types?.includes("Files")) return;
  fileDragDepth = Math.max(0, fileDragDepth - 1);
  if (!fileDragDepth) showFileDropOverlay(false);
});

document.addEventListener("drop", async (event) => {
  if (!event.dataTransfer?.files?.length) return;
  event.preventDefault();
  fileDragDepth = 0;
  showFileDropOverlay(false);
  await handlePickedFile(event.dataTransfer.files[0]);
});


els.linkSuggestion?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-schedule-action]");
  if (!button) return;
  finishScheduleLinkChoice(button.dataset.scheduleAction || "cancel");
});

els.cascadeSuggestion?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-cascade-action]");
  if (!button) return;
  finishCascadeImpactChoice(button.dataset.cascadeAction || "keep");
});

window.addEventListener("resize", () => {
  positionScheduleSuggestion();
  drawPendingConnectorLine();
});
window.addEventListener("scroll", () => {
  positionScheduleSuggestion();
  drawPendingConnectorLine();
}, true);

els.scheduleLinkModal?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-schedule-action]");
  if (!button) return;
  finishScheduleLinkChoice(button.dataset.scheduleAction || "cancel");
});

els.dependencyModal?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-link-choice]");
  if (!button) return;
  const choice = button.dataset.linkChoice;
  finishDependencyPicker(choice === "cancel" ? null : choice);
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && pendingCascadeChoice) {
    finishCascadeImpactChoice("keep");
    return;
  }
  if (event.key === "Escape" && pendingScheduleChoice) {
    finishScheduleLinkChoice("cancel");
    return;
  }
  if (event.key === "Escape" && pendingDependencyChoice) {
    finishDependencyPicker(null);
  }
});

load();
render();
