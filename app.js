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
const CONSTRAINT_TYPES = ["ASAP", "ALAP", "MSO", "MFO", "SNET", "SNLT", "FNET", "FNLT"];
const CONSTRAINT_LABELS = {
  ASAP: "As Soon As Possible",
  ALAP: "As Late As Possible",
  MSO: "Must Start On",
  MFO: "Must Finish On",
  SNET: "Start No Earlier Than",
  SNLT: "Start No Later Than",
  FNET: "Finish No Earlier Than",
  FNLT: "Finish No Later Than",
};
const CONSTRAINT_TO_PROJECT = { ASAP: 0, ALAP: 1, MSO: 2, MFO: 3, SNET: 4, SNLT: 5, FNET: 6, FNLT: 7 };
const PROJECT_TO_CONSTRAINT = { 0: "ASAP", 1: "ALAP", 2: "MSO", 3: "MFO", 4: "SNET", 5: "SNLT", 6: "FNET", 7: "FNLT" };
const CONSTRAINTS_REQUIRING_DATE = new Set(["MSO", "MFO", "SNET", "SNLT", "FNET", "FNLT"]);

const DAY_SHORT_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_NAME_TO_INDEX = new Map(DAY_SHORT_NAMES.map((name, index) => [name.toLowerCase(), index]));
const STANDARD_CALENDAR = {
  name: "Standard",
  workingDays: [1, 2, 3, 4, 5],
  exceptions: [],
  minutesPerDay: 480,
  defaultStartTime: "08:00:00",
  defaultFinishTime: "17:00:00",
};

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
  { key: "constraint", label: "Constraint", defaultWidth: 170, min: 130, max: 250 },
  { key: "constraintDate", label: "Const date", defaultWidth: 132, min: 112, max: 170 },
  { key: "deadline", label: "Deadline", defaultWidth: 132, min: 112, max: 170 },
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
  indentTaskBtn: document.getElementById("indentTaskBtn"),
  outdentTaskBtn: document.getElementById("outdentTaskBtn"),
  autoScheduleBtn: document.getElementById("autoScheduleBtn"),
  workingDaysInput: document.getElementById("workingDaysInput"),
  holidayInput: document.getElementById("holidayInput"),
  calendarStatus: document.getElementById("calendarStatus"),
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
  calendar: { ...STANDARD_CALENDAR },
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
let selectedTaskIndex = null;
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

function uniqueSortedNumbers(values) {
  return [...new Set((values || []).map(Number).filter((n) => Number.isInteger(n)))].sort((a, b) => a - b);
}

function normalizeCalendar(calendar = {}) {
  const rawWorkingDays = Array.isArray(calendar.workingDays) && calendar.workingDays.length
    ? calendar.workingDays
    : STANDARD_CALENDAR.workingDays;
  const workingDays = uniqueSortedNumbers(rawWorkingDays).filter((day) => day >= 0 && day <= 6);
  const exceptions = uniqueSortedNumbers([]); // no-op to keep the helper warm for old browsers
  const holidayDates = Array.isArray(calendar.exceptions)
    ? calendar.exceptions.map((value) => {
        const text = String(value || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
        const parsed = dateOnly(text);
        return parsed ? toDateInputValue(parsed) : null;
      }).filter(Boolean)
    : [];
  return {
    name: calendar.name || STANDARD_CALENDAR.name,
    workingDays: workingDays.length ? workingDays : [...STANDARD_CALENDAR.workingDays],
    exceptions: [...new Set(holidayDates)].sort(),
    minutesPerDay: Math.max(1, Number(calendar.minutesPerDay) || STANDARD_CALENDAR.minutesPerDay),
    defaultStartTime: calendar.defaultStartTime || STANDARD_CALENDAR.defaultStartTime,
    defaultFinishTime: calendar.defaultFinishTime || STANDARD_CALENDAR.defaultFinishTime,
  };
}

function getCalendar() {
  state.calendar = normalizeCalendar(state.calendar);
  return state.calendar;
}

function parseWorkingDaysInput(value) {
  const text = String(value || "").trim();
  if (!text) return [...STANDARD_CALENDAR.workingDays];
  const tokens = text.split(/[\s,;/]+/).map((token) => token.trim().toLowerCase()).filter(Boolean);
  const days = [];
  tokens.forEach((token) => {
    if (/^\d+$/.test(token)) {
      const n = Number(token);
      if (n >= 0 && n <= 6) days.push(n);
      return;
    }
    const match = [...DAY_NAME_TO_INDEX.keys()].find((name) => name.startsWith(token) || token.startsWith(name));
    if (match) days.push(DAY_NAME_TO_INDEX.get(match));
  });
  return uniqueSortedNumbers(days).filter((day) => day >= 0 && day <= 6);
}

function formatWorkingDays(days = getCalendar().workingDays) {
  return uniqueSortedNumbers(days).map((day) => DAY_SHORT_NAMES[day]).join(",");
}

function parseExceptionDatesInput(value) {
  return [...new Set(String(value || "")
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(token)) return token;
      const parsed = dateOnly(token);
      return parsed ? toDateInputValue(parsed) : null;
    })
    .filter(Boolean))].sort();
}

function isCalendarException(value, calendar = getCalendar()) {
  const day = toDateInputValue(value);
  return calendar.exceptions.includes(day);
}

function isWorkingDay(value, calendar = getCalendar()) {
  const date = dateOnly(value);
  if (!date) return false;
  return calendar.workingDays.includes(date.getDay()) && !isCalendarException(date, calendar);
}

function nextWorkingDay(value, includeCurrent = true) {
  let date = dateOnly(value) || dateOnly(state.projectStart) || dateOnly(today);
  if (!includeCurrent) date = addDays(date, 1);
  let guard = 0;
  while (!isWorkingDay(date) && guard < 370) {
    date = addDays(date, 1);
    guard += 1;
  }
  return date;
}

function previousWorkingDay(value, includeCurrent = true) {
  let date = dateOnly(value) || dateOnly(state.projectStart) || dateOnly(today);
  if (!includeCurrent) date = addDays(date, -1);
  let guard = 0;
  while (!isWorkingDay(date) && guard < 370) {
    date = addDays(date, -1);
    guard += 1;
  }
  return date;
}

function addWorkingDays(value, workDays) {
  const count = Math.max(1, Math.round(Number(workDays) || 1));
  let date = nextWorkingDay(value, true);
  let remaining = count - 1;
  let guard = 0;
  while (remaining > 0 && guard < count + 740) {
    date = addDays(date, 1);
    if (isWorkingDay(date)) remaining -= 1;
    guard += 1;
  }
  return date;
}

function addWorkingDaysAfter(value, workDays = 1) {
  const first = nextWorkingDay(value, false);
  return addWorkingDays(first, workDays);
}

function subtractWorkingDays(value, workDays) {
  const count = Math.max(1, Math.round(Number(workDays) || 1));
  let date = previousWorkingDay(value, true);
  let remaining = count - 1;
  let guard = 0;
  while (remaining > 0 && guard < count + 740) {
    date = addDays(date, -1);
    if (isWorkingDay(date)) remaining -= 1;
    guard += 1;
  }
  return date;
}

function subtractWorkingDaysBefore(value, workDays = 1) {
  const first = previousWorkingDay(value, false);
  return subtractWorkingDays(first, workDays);
}

function applyLagToWorkingDate(value, lagMinutes = 0) {
  const base = nextWorkingDay(value, true);
  const minutes = normalizeLagMinutes(lagMinutes);
  if (!minutes) return base;
  const workDays = durationMinutesToWorkingDays(Math.abs(minutes));
  return minutes > 0 ? addWorkingDaysAfter(base, workDays) : subtractWorkingDaysBefore(base, workDays);
}

function workDaysBetween(start, finish) {
  const s = dateOnly(start);
  const f = dateOnly(finish);
  if (!s || !f) return 1;
  const forward = s <= f;
  let date = forward ? s : f;
  const end = forward ? f : s;
  let count = 0;
  let guard = 0;
  while (date <= end && guard < 4000) {
    if (isWorkingDay(date)) count += 1;
    date = addDays(date, 1);
    guard += 1;
  }
  return Math.max(1, count);
}

function setTaskStartKeepDuration(task, start, durationMinutes = task?.durationMinutes ?? getCalendar().minutesPerDay) {
  if (!task) return;
  const minutes = normalizeDurationMinutes(durationMinutes, getCalendar().minutesPerDay);
  const snappedStart = nextWorkingDay(start || state.projectStart || today, true);
  const finish = finishFromStartByDuration(snappedStart, minutes);
  task.start = toDateInputValue(snappedStart);
  task.finish = toDateInputValue(finish);
  task.durationMinutes = minutes;
  task.durationDays = durationMinutesToWorkingDays(minutes);
}

function setTaskFinishKeepDuration(task, finish, durationMinutes = task?.durationMinutes ?? getCalendar().minutesPerDay) {
  if (!task) return;
  const minutes = normalizeDurationMinutes(durationMinutes, getCalendar().minutesPerDay);
  const snappedFinish = previousWorkingDay(finish || task.finish || task.start || state.projectStart || today, true);
  const start = startFromFinishByDuration(snappedFinish, minutes);
  task.start = toDateInputValue(start);
  task.finish = toDateInputValue(snappedFinish);
  task.durationMinutes = minutes;
  task.durationDays = durationMinutesToWorkingDays(minutes);
}

function refreshCalendarControls() {
  const calendar = getCalendar();
  if (els.workingDaysInput) els.workingDaysInput.value = formatWorkingDays(calendar.workingDays);
  if (els.holidayInput) els.holidayInput.value = calendar.exceptions.join(",");
  if (els.calendarStatus) {
    const holidayText = calendar.exceptions.length ? `${calendar.exceptions.length} holiday${calendar.exceptions.length === 1 ? "" : "s"}` : "no holidays";
    els.calendarStatus.textContent = `${formatWorkingDays(calendar.workingDays).replaceAll(",", ", ")} · ${calendar.minutesPerDay / 60}h/day · ${holidayText}`;
  }
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

function normalizeDateValue(value) {
  const d = dateOnly(value);
  return d ? toDateInputValue(d) : "";
}

function normalizeConstraintType(value) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) return "ASAP";
  if (CONSTRAINT_TYPES.includes(raw)) return raw;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && PROJECT_TO_CONSTRAINT[numeric]) return PROJECT_TO_CONSTRAINT[numeric];
  const compact = raw.replace(/[^A-Z]/g, "");
  const aliases = {
    ASSOONASPOSSIBLE: "ASAP",
    ASLATEASPOSSIBLE: "ALAP",
    MUSTSTARTON: "MSO",
    MUSTFINISHON: "MFO",
    STARTNOEARLIERTHAN: "SNET",
    STARTNOLATERTHAN: "SNLT",
    FINISHNOEARLIERTHAN: "FNET",
    FINISHNOLATERTHAN: "FNLT",
  };
  return aliases[compact] || "ASAP";
}

function constraintNeedsDate(type) {
  return CONSTRAINTS_REQUIRING_DATE.has(normalizeConstraintType(type));
}

function formatConstraintType(type) {
  const normalized = normalizeConstraintType(type);
  return CONSTRAINT_LABELS[normalized] || CONSTRAINT_LABELS.ASAP;
}

function renderConstraintOptions(selected) {
  const normalized = normalizeConstraintType(selected);
  return CONSTRAINT_TYPES.map((type) => `<option value="${type}"${type === normalized ? " selected" : ""}>${escapeXml(CONSTRAINT_LABELS[type])}</option>`).join("");
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

function normalizeLagMinutes(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function parseLagExpression(value) {
  const raw = String(value || "").replace(/\s+/g, "");
  if (!raw) return 0;
  const sign = raw.startsWith("-") ? -1 : 1;
  let body = raw.replace(/^[+-]/, "");
  if (!body) return 0;
  if (/^\d+(?:\.\d+)?$/.test(body)) body = `${body}d`;
  return sign * durationToMinutes(body, getCalendar().minutesPerDay);
}

function formatLag(lagMinutes) {
  const minutes = normalizeLagMinutes(lagMinutes);
  if (!minutes) return "";
  const sign = minutes > 0 ? "+" : "-";
  return `${sign}${formatDuration(Math.abs(minutes))}`;
}

function formatLink(link) {
  return `${link.id}${normalizeLinkType(link.type)}${formatLag(link.lagMinutes)}`;
}

function normalizeTaskLinks(task) {
  const rawLinks = Array.isArray(task.links) && task.links.length
    ? task.links
    : (task.predecessors || []).map((id) => ({ id, type: "FS", lagMinutes: 0 }));
  const seen = new Set();
  const normalized = [];

  rawLinks.forEach((link) => {
    const id = Number(typeof link === "object" ? (link.id ?? link.predId ?? link.predecessorId) : link);
    const type = normalizeLinkType(typeof link === "object" ? link.type : "FS");
    const lagMinutes = normalizeLagMinutes(typeof link === "object" ? (link.lagMinutes ?? link.lag ?? link.linkLagMinutes ?? 0) : 0);
    const key = `${id}:${type}`;
    if (!Number.isInteger(id) || id <= 0 || seen.has(key)) return;
    seen.add(key);
    normalized.push({ id, type, lagMinutes });
  });

  return normalized;
}

function getTaskLinks(task) {
  return normalizeTaskLinks(task);
}

function formatLinks(links) {
  return getTaskLinks({ links }).map(formatLink).join(",");
}

function getSuccessorLinks(taskId) {
  const id = Number(taskId);
  if (!Number.isInteger(id)) return [];
  const successors = [];
  state.tasks.forEach((candidate) => {
    getTaskLinks(candidate).forEach((link) => {
      if (link.id === id) successors.push({ id: candidate.id, type: link.type, lagMinutes: link.lagMinutes });
    });
  });
  return successors.sort((a, b) => a.id - b.id || LINK_TYPES.indexOf(a.type) - LINK_TYPES.indexOf(b.type) || normalizeLagMinutes(a.lagMinutes) - normalizeLagMinutes(b.lagMinutes));
}

function formatSuccessorLinks(taskId) {
  return getSuccessorLinks(taskId).map(formatLink).join(",");
}

function parseLinksInput(value, selfId) {
  const text = String(value || "").trim();
  if (!text) return [];
  const links = [];
  const seen = new Set();
  const linkPattern = /(\d+)\s*[:\-]?\s*(FS|SS|FF|SF)?\s*([+-]\s*\d*(?:\.\d+)?\s*(?:w(?:eeks?|ks?)?|d(?:ays?)?|h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?)?)?/gi;
  let match;

  while ((match = linkPattern.exec(text)) !== null) {
    const id = Number(match[1]);
    const type = normalizeLinkType(match[2] || "FS");
    const lagMinutes = parseLagExpression(match[3] || "");
    const key = `${id}:${type}`;
    if (!Number.isInteger(id) || id <= 0 || id === selfId || seen.has(key)) continue;
    seen.add(key);
    links.push({ id, type, lagMinutes });
  }

  return links;
}

function describeLink(link) {
  return formatLink(link);
}

function normalizeDurationMinutes(value, fallback = getCalendar().minutesPerDay) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) return Math.round(n);
  const f = Number(fallback);
  return Number.isFinite(f) && f >= 0 ? Math.round(f) : getCalendar().minutesPerDay;
}

function durationMinutesToWorkingDays(minutes) {
  const value = normalizeDurationMinutes(minutes, getCalendar().minutesPerDay);
  if (value <= 0) return 0;
  return Math.max(1, Math.ceil(value / getCalendar().minutesPerDay));
}

function workingSpanMinutes(start, finish) {
  return workDaysBetween(start, finish) * getCalendar().minutesPerDay;
}

function durationToMinutes(durationText) {
  const text = String(durationText || "").trim();
  if (!text) return getCalendar().minutesPerDay;

  const isoHours = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(text);
  if (isoHours) {
    const h = Number(isoHours[1] || 0);
    const m = Number(isoHours[2] || 0);
    const sec = Number(isoHours[3] || 0);
    return normalizeDurationMinutes(h * 60 + m + sec / 60, 0);
  }

  const isoDays = /^P(?:(\d+(?:\.\d+)?)D)$/i.exec(text);
  if (isoDays) return normalizeDurationMinutes(Number(isoDays[1]) * getCalendar().minutesPerDay, getCalendar().minutesPerDay);

  return parseDurationInput(text, getCalendar().minutesPerDay);
}

function durationToDays(durationText) {
  return durationMinutesToWorkingDays(durationToMinutes(durationText));
}

function minutesToProjectDuration(minutes) {
  const safeMinutes = normalizeDurationMinutes(minutes, 0);
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `PT${hours}H${mins}M0S`;
}

function daysToProjectDuration(days) {
  const safeDays = Math.max(0, Number(days) || 0);
  return minutesToProjectDuration(safeDays * getCalendar().minutesPerDay);
}

function parseDurationInput(value, fallbackMinutes = getCalendar().minutesPerDay) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return normalizeDurationMinutes(fallbackMinutes, getCalendar().minutesPerDay);
  if (/^milestone$/.test(text)) return 0;

  const calendar = getCalendar();
  const weekDays = Math.max(1, calendar.workingDays.length || 5);
  let total = 0;
  let matched = false;
  const tokenPattern = /(-?\d+(?:\.\d+)?)\s*(weeks?|w|days?|d|hours?|hrs?|h|minutes?|mins?|m)?/g;
  let match;
  while ((match = tokenPattern.exec(text))) {
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount < 0) continue;
    const unit = match[2] || "d";
    matched = true;
    if (unit.startsWith("w")) total += amount * weekDays * calendar.minutesPerDay;
    else if (unit.startsWith("h")) total += amount * 60;
    else if (unit.startsWith("m") && unit !== "mo") total += amount;
    else total += amount * calendar.minutesPerDay;
  }

  if (matched) return normalizeDurationMinutes(total, fallbackMinutes);
  const numeric = Number(text);
  if (Number.isFinite(numeric) && numeric >= 0) return normalizeDurationMinutes(numeric * calendar.minutesPerDay, fallbackMinutes);
  return normalizeDurationMinutes(fallbackMinutes, calendar.minutesPerDay);
}

function formatDuration(minutes) {
  const safeMinutes = normalizeDurationMinutes(minutes, getCalendar().minutesPerDay);
  const calendar = getCalendar();
  if (safeMinutes === 0) return "0d";
  const weekMinutes = calendar.minutesPerDay * Math.max(1, calendar.workingDays.length || 5);
  if (safeMinutes >= weekMinutes && safeMinutes % weekMinutes === 0) return `${safeMinutes / weekMinutes}w`;
  if (safeMinutes % calendar.minutesPerDay === 0) return `${safeMinutes / calendar.minutesPerDay}d`;
  if (safeMinutes % 60 === 0) return `${safeMinutes / 60}h`;
  return `${safeMinutes}m`;
}

function finishFromStartByDuration(start, durationMinutes) {
  const snappedStart = nextWorkingDay(start || state.projectStart || today, true);
  const minutes = normalizeDurationMinutes(durationMinutes, getCalendar().minutesPerDay);
  if (minutes <= 0) return snappedStart;
  return addWorkingDays(snappedStart, durationMinutesToWorkingDays(minutes));
}

function startFromFinishByDuration(finish, durationMinutes) {
  const snappedFinish = previousWorkingDay(finish || state.projectStart || today, true);
  const minutes = normalizeDurationMinutes(durationMinutes, getCalendar().minutesPerDay);
  if (minutes <= 0) return snappedFinish;
  return subtractWorkingDays(snappedFinish, durationMinutesToWorkingDays(minutes));
}

function childText(node, localName) {
  const child = [...node.children].find((c) => c.localName === localName);
  return child ? child.textContent.trim() : "";
}

function childrenByName(node, localName) {
  return [...node.children].filter((c) => c.localName === localName);
}

function ensureDecorations() {
  repairOutlineHierarchy();
  const counters = [];
  state.tasks.forEach((task, index) => {
    task.id = index + 1;
    task.outlineLevel = normalizeLevel(task.outlineLevel);
    task.name = task.name || `Task ${index + 1}`;
    task.start = task.start || state.projectStart || today;
    const spanMinutes = dateOnly(task.start) && dateOnly(task.finish) ? workingSpanMinutes(task.start, task.finish) : null;
    const legacyMinutes = Number.isFinite(Number(task.durationDays)) ? Math.max(0, Number(task.durationDays)) * getCalendar().minutesPerDay : spanMinutes;
    task.durationMinutes = normalizeDurationMinutes(task.durationMinutes, legacyMinutes ?? getCalendar().minutesPerDay);
    task.finish = task.finish || toDateInputValue(finishFromStartByDuration(task.start, task.durationMinutes));
    task.percent = normalizePercent(task.percent);
    task.isSummary = Boolean(task.isSummary);
    task.expanded = task.expanded !== false;
    task.durationDays = durationMinutesToWorkingDays(task.durationMinutes);
    task.isMilestone = task.durationMinutes === 0;
    task.constraintType = normalizeConstraintType(task.constraintType);
    task.constraintDate = normalizeDateValue(task.constraintDate);
    task.deadline = normalizeDateValue(task.deadline);
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
      task.durationDays = workDaysBetween(task.start, task.finish);
      task.durationMinutes = task.durationDays * getCalendar().minutesPerDay;
      task.isMilestone = false;
    }
    const weighted = children
      .map((child) => ({ percent: normalizePercent(child.percent), duration: Math.max(1, normalizeDurationMinutes(child.durationMinutes, workingSpanMinutes(child.start, child.finish))) }))
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

function clampSelectedTaskIndex() {
  if (!state.tasks.length) {
    selectedTaskIndex = null;
    return;
  }
  if (!Number.isInteger(selectedTaskIndex) || selectedTaskIndex < 0 || selectedTaskIndex >= state.tasks.length) {
    selectedTaskIndex = 0;
  }
}

function selectTask(index) {
  const numeric = Number(index);
  if (!Number.isInteger(numeric) || numeric < 0 || numeric >= state.tasks.length) return;
  selectedTaskIndex = numeric;
}

function getSelectedTaskIndex() {
  clampSelectedTaskIndex();
  return selectedTaskIndex;
}

function getSubtreeIndexes(rootIndex) {
  const root = state.tasks[rootIndex];
  if (!root) return [];
  const rootLevel = normalizeLevel(root.outlineLevel);
  const indexes = [rootIndex];
  for (let i = rootIndex + 1; i < state.tasks.length; i += 1) {
    const level = normalizeLevel(state.tasks[i].outlineLevel);
    if (level <= rootLevel) break;
    indexes.push(i);
  }
  return indexes;
}

function shiftOutlineSubtree(rootIndex, delta) {
  const indexes = getSubtreeIndexes(rootIndex);
  indexes.forEach((index) => {
    const task = state.tasks[index];
    task.outlineLevel = normalizeLevel((task.outlineLevel || 1) + delta);
  });
}

function repairOutlineHierarchy() {
  let previousLevel = 1;
  state.tasks.forEach((task, index) => {
    let level = normalizeLevel(task.outlineLevel);
    if (index === 0) level = 1;
    level = Math.min(level, previousLevel + 1);
    task.outlineLevel = normalizeLevel(level);
    previousLevel = task.outlineLevel;
  });
}

function indentSelectedTask() {
  const index = getSelectedTaskIndex();
  if (index == null || index <= 0) return;
  const task = state.tasks[index];
  const previous = state.tasks[index - 1];
  if (!task || !previous) return;
  const currentLevel = normalizeLevel(task.outlineLevel);
  const previousLevel = normalizeLevel(previous.outlineLevel);
  const maxAllowed = Math.min(10, previousLevel + 1);
  if (currentLevel >= maxAllowed) return;
  shiftOutlineSubtree(index, 1);
  previous.expanded = true;
  repairOutlineHierarchy();
  render();
}

function outdentSelectedTask() {
  const index = getSelectedTaskIndex();
  const task = state.tasks[index];
  if (!task) return;
  const currentLevel = normalizeLevel(task.outlineLevel);
  if (currentLevel <= 1) return;
  shiftOutlineSubtree(index, -1);
  repairOutlineHierarchy();
  render();
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
      calendar: normalizeCalendar(parsed.calendar),
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
  refreshCalendarControls();
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
  const duration = min && max ? workDaysBetween(min, max) : 0;
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
  tasks.map((t) => dateOnly(t.deadline)).filter(Boolean).forEach((deadline) => finishes.push(deadline));
  tasks.map((t) => dateOnly(t.constraintDate)).filter(Boolean).forEach((constraintDate) => {
    starts.push(constraintDate);
    finishes.push(constraintDate);
  });
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
    if (!isWorkingDay(d)) classes.push("is-nonworking");
    if (isCalendarException(d)) classes.push("is-holiday");
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
  const nonWorkingBands = [];
  for (let i = 0; i < totalDays; i += 1) {
    const d = addDays(min, i);
    if (!isWorkingDay(d)) {
      const title = isCalendarException(d) ? `Holiday / non-working day: ${toDateInputValue(d)}` : `Non-working day: ${toDateInputValue(d)}`;
      nonWorkingBands.push(`<i class="nonworking-band" style="left:${i * dayWidth}px;width:${dayWidth}px" title="${escapeXml(title)}" aria-hidden="true"></i>`);
    }
  }
  const nonWorkingMarkup = nonWorkingBands.join("");
  const visibleRows = getVisibleTaskRows();
  els.taskBody.innerHTML = visibleRows.map(({ task, index }) => {
    const startOffset = Math.max(0, daysBetween(min, task.start) - 1);
    const duration = Math.max(1, daysBetween(task.start, task.finish));
    const left = startOffset * dayWidth;
    const isMilestone = !isSummaryIndex(index) && normalizeDurationMinutes(task.durationMinutes, getCalendar().minutesPerDay) === 0;
    const width = isMilestone ? 22 : Math.max(32, duration * dayWidth - 8);
    const isSummary = isSummaryIndex(index);
    const taskWarnings = getTaskConstraintWarnings(task);
    const warningTitle = taskWarnings.join(" ");
    const rowClasses = ["planner-row"];
    if (task.percent === 100) rowClasses.push("is-complete");
    if (isSummary) rowClasses.push("is-summary");
    if (isMilestone) rowClasses.push("is-milestone");
    if (taskWarnings.length) rowClasses.push("has-warning");
    if (selectedTaskIndex === index) rowClasses.push("is-selected");
    const barClasses = ["gantt-bar"];
    if (task.percent === 100) barClasses.push("is-complete");
    if (isSummary) barClasses.push("is-summary");
    if (isMilestone) barClasses.push("is-milestone");
    const barClass = barClasses.join(" ");
    const summaryLocked = isSummary ? ' readonly aria-readonly="true"' : "";
    const linkText = task.links.length ? formatLinks(task.links) : "";
    const successorText = formatSuccessorLinks(task.id);
    const constraintType = normalizeConstraintType(task.constraintType);
    const constraintDate = normalizeDateValue(task.constraintDate);
    const deadline = normalizeDateValue(task.deadline);
    const linkPreview = pendingScheduleChoice?.successor?.id === task.id ? pendingScheduleChoice.proposedDates : null;
    const primaryCascadeChange = pendingCascadeChoice?.changes?.[0] || null;
    const cascadePreview = primaryCascadeChange?.id === task.id ? primaryCascadeChange.to : null;
    const pendingPreview = linkPreview || cascadePreview;
    let deadlineMarkup = "";
    const deadlineDate = dateOnly(deadline);
    if (deadlineDate) {
      const deadlineOffset = Math.max(0, daysBetween(min, deadlineDate) - 1);
      const deadlineLeft = deadlineOffset * dayWidth + Math.round(dayWidth / 2);
      const missedDeadline = dateOnly(task.finish) > deadlineDate;
      deadlineMarkup = `<i class="deadline-marker ${missedDeadline ? "is-missed" : ""}" style="left:${deadlineLeft}px" title="Deadline: ${escapeXml(formatFriendlyDate(deadlineDate))}${missedDeadline ? " · missed" : ""}" aria-hidden="true"></i>`;
    }
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
      <div class="${rowClasses.join(" ")}" data-row-index="${index}" style="--row-height:${rowHeight}px;width:${totalWidth}px">
        <div class="planner-fields${fieldClipClass}" style="width:${leftPaneWidth}px;grid-template-columns:${fieldGridTemplate}">
          <div class="planner-cell"><span class="id-pill">${task.id}</span></div>
          <div class="planner-cell muted-cell">${escapeXml(task.wbs)}</div>
          <div class="planner-cell name-cell"><div class="task-name-cell" style="--indent:${indent}px">${isSummary ? `<button type="button" class="summary-toggle" data-action="toggle-summary" data-index="${index}" title="${task.expanded === false ? "Expand" : "Collapse"} summary task" aria-label="${task.expanded === false ? "Expand" : "Collapse"} ${escapeXml(task.name)}">${task.expanded === false ? "▸" : "▾"}</button>` : `<span class="summary-toggle-spacer" aria-hidden="true"></span>`}${taskWarnings.length ? `<span class="constraint-warning-badge" title="${escapeXml(warningTitle)}">!</span>` : ""}<input class="name-input" data-field="name" data-index="${index}" value="${escapeXml(task.name)}" /></div></div>
          <div class="planner-cell"><input type="date" data-field="start" data-index="${index}" value="${escapeXml(task.start)}"${summaryLocked} /></div>
          <div class="planner-cell"><input type="date" data-field="finish" data-index="${index}" value="${escapeXml(task.finish)}"${summaryLocked} /></div>
          <div class="planner-cell"><input class="duration-input" data-field="duration" data-index="${index}" value="${escapeXml(formatDuration(task.durationMinutes))}" title="Duration. Examples: 0d milestone, 4h, 3d, 1w"${summaryLocked} /></div>
          <div class="planner-cell">
            <div class="percent-cell">
              <input type="number" min="0" max="100" data-field="percent" data-index="${index}" value="${task.percent}" aria-label="Percent complete"${summaryLocked} />
              <div class="percent-track" aria-hidden="true"><span style="--pct:${task.percent}%"></span></div>
            </div>
          </div>
          <div class="planner-cell"><input data-field="predecessors" data-index="${index}" value="${escapeXml(linkText)}" placeholder="none" title="Predecessors: tasks this row waits for. Type 1FS, 2SS, 3FF, 4SF, or add lag/lead like 1FS+2d or 2SS-4h. Pull strings on the Gantt bars for quick links." /></div>
          <div class="planner-cell"><input class="readonly-link-field" value="${escapeXml(successorText)}" placeholder="none" readonly aria-readonly="true" title="Successors: calculated from other rows that list this task as a predecessor. Edit those rows' Pred fields to change this." /></div>
          <div class="planner-cell"><select class="constraint-select" data-field="constraintType" data-index="${index}" title="Scheduling constraint. Deadlines warn only; constraints can move tasks during Auto schedule.">${renderConstraintOptions(constraintType)}</select></div>
          <div class="planner-cell"><input type="date" data-field="constraintDate" data-index="${index}" value="${escapeXml(constraintDate)}" title="Constraint date. Used by Must Start On, Must Finish On, Start/Finish No Earlier/Later Than."${constraintNeedsDate(constraintType) ? "" : " disabled"} /></div>
          <div class="planner-cell"><input type="date" data-field="deadline" data-index="${index}" value="${escapeXml(deadline)}" title="Deadline. Does not move the task; it warns if finish goes past this date." /></div>
          <div class="planner-cell"><input type="number" min="1" max="10" data-field="outlineLevel" data-index="${index}" value="${task.outlineLevel}" aria-label="Outline level" title="Outline level / WBS depth. Use Indent/Outdent buttons or Cmd/Ctrl+[ and Cmd/Ctrl+] for safer WBS editing." /></div>
          <div class="planner-cell action-cell"><button type="button" class="delete-btn" data-action="delete" data-index="${index}" title="Delete task" aria-label="Delete task">×</button></div>
        </div>
        <div class="gantt-row" style="width:${chartWidthPx}px;--row-height:${rowHeight}px;--bar-height:${barHeight}px;--bar-top:${barTop}px;background-size:${dayWidth}px ${rowHeight}px">
          ${nonWorkingMarkup}
          ${deadlineMarkup}
          ${ghostMarkup}
          <div class="${barClass}" data-index="${index}" style="left:${left}px;width:${width}px;--done:${task.percent}%" title="Drag to move. Pull edges to resize. Pull a string from S or F to another task string to create SS, SF, FS, or FF automatically. ${escapeXml(task.name)}: ${task.start} to ${task.finish} · ${escapeXml(formatDuration(task.durationMinutes))}">
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
    if (!isSummaryIndex(task.id - 1)) {
      if (dateOnly(task.start) && !isWorkingDay(task.start)) issues.push(`Task ${task.id} starts on a non-working day. The calendar engine will snap new edits to working days.`);
      if (dateOnly(task.finish) && !isWorkingDay(task.finish)) issues.push(`Task ${task.id} finishes on a non-working day. The calendar engine will snap new edits to working days.`);
    }

    getTaskConstraintWarnings(task).forEach((warning) => issues.push(`Task ${task.id}: ${warning}`));

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
        const requiredFsStart = applyLagToWorkingDate(addWorkingDaysAfter(predFinish, 1), link.lagMinutes);
        const requiredSsStart = applyLagToWorkingDate(predStart, link.lagMinutes);
        const requiredFfFinish = applyLagToWorkingDate(predFinish, link.lagMinutes);
        const requiredSfFinish = applyLagToWorkingDate(predStart, link.lagMinutes);
        if (link.type === "FS" && taskStart < requiredFsStart) {
          issues.push(`Task ${task.id} has ${describeLink(link)} but starts before ${formatFriendlyDate(requiredFsStart)}. Use Auto schedule or adjust dates.`);
        }
        if (link.type === "SS" && taskStart < requiredSsStart) {
          issues.push(`Task ${task.id} has ${describeLink(link)} but starts before ${formatFriendlyDate(requiredSsStart)}.`);
        }
        if (link.type === "FF" && taskFinish < requiredFfFinish) {
          issues.push(`Task ${task.id} has ${describeLink(link)} but finishes before ${formatFriendlyDate(requiredFfFinish)}.`);
        }
        if (link.type === "SF" && taskFinish < requiredSfFinish) {
          issues.push(`Task ${task.id} has ${describeLink(link)} but finishes before ${formatFriendlyDate(requiredSfFinish)}.`);
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
    els.validationPanel.innerHTML = `<div class="validation-card"><div><p><strong>Ready to export.</strong> Supported fields are clean: tasks, working-day dates, duration, percent complete, WBS, outline level, predecessors with lag/lead, calculated successors, and project calendar.</p></div></div>`;
    return;
  }

  els.validationPanel.innerHTML = `
    <div class="validation-card warn">
      <div>
        <p><strong>${issues.length} thing${issues.length === 1 ? "" : "s"} to fix before export.</strong> Auto Schedule can fix most dependency timing issues, including lag/lead.</p>
        <ul>${issues.slice(0, 8).map((issue) => `<li>${escapeXml(issue)}</li>`).join("")}</ul>
      </div>
    </div>`;
}

function updateTask(index, field, value) {
  const task = state.tasks[index];
  if (!task) return;

  selectTask(index);

  if (task.isSummary && ["start", "finish", "percent", "duration"].includes(field)) {
    render();
    return;
  }

  if (field === "percent") task.percent = normalizePercent(value);
  else if (field === "outlineLevel") task.outlineLevel = normalizeLevel(value);
  else if (field === "constraintType") {
    task.constraintType = normalizeConstraintType(value);
    if (!constraintNeedsDate(task.constraintType)) task.constraintDate = "";
  }
  else if (field === "constraintDate") {
    task.constraintDate = normalizeDateValue(value);
  }
  else if (field === "deadline") {
    task.deadline = normalizeDateValue(value);
  }
  else if (field === "predecessors") {
    task.links = parseLinksInput(value, task.id);
    task.predecessors = task.links.map((link) => link.id);
  } else if (field === "start") {
    const oldDuration = normalizeDurationMinutes(task.durationMinutes, workingSpanMinutes(task.start, task.finish));
    setTaskStartKeepDuration(task, value || state.projectStart, oldDuration);
  } else if (field === "finish") {
    const finish = previousWorkingDay(value || task.start, true);
    task.finish = toDateInputValue(dateOnly(finish) < dateOnly(task.start) ? task.start : finish);
    task.durationMinutes = workingSpanMinutes(task.start, task.finish);
    task.durationDays = durationMinutesToWorkingDays(task.durationMinutes);
    task.isMilestone = task.durationMinutes === 0;
  } else if (field === "duration") {
    const minutes = parseDurationInput(value, task.durationMinutes);
    setTaskStartKeepDuration(task, task.start || state.projectStart, minutes);
  } else {
    task[field] = value;
  }
  render();
}

function addTask() {
  const last = state.tasks[state.tasks.length - 1];
  const start = toDateInputValue(last ? addWorkingDaysAfter(last.finish, 1) : nextWorkingDay(state.projectStart, true));
  const newIndex = state.tasks.length;
  state.tasks.push({
    uid: state.nextUid++,
    name: `New Task ${state.tasks.length + 1}`,
    start,
    finish: toDateInputValue(finishFromStartByDuration(start, getCalendar().minutesPerDay * 3)),
    durationDays: 3,
    durationMinutes: getCalendar().minutesPerDay * 3,
    percent: 0,
    predecessors: last ? [last.id] : [],
    links: last ? [{ id: last.id, type: "FS" }] : [],
    outlineLevel: last ? last.outlineLevel : 1,
    isSummary: false,
    expanded: true,
    constraintType: "ASAP",
    constraintDate: "",
    deadline: "",
  });
  selectedTaskIndex = newIndex;
  render();
}

function deleteTask(index) {
  const deletedId = state.tasks[index]?.id;
  state.tasks.splice(index, 1);
  if (selectedTaskIndex === index) selectedTaskIndex = Math.min(index, state.tasks.length - 1);
  else if (selectedTaskIndex > index) selectedTaskIndex -= 1;
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


function buildCalendarsXml() {
  const calendar = getCalendar();
  const weekDays = DAY_SHORT_NAMES.map((name, day) => {
    const working = calendar.workingDays.includes(day) ? 1 : 0;
    const times = working ? `
          <WorkingTimes>
            <WorkingTime>
              <FromTime>${escapeXml(calendar.defaultStartTime)}</FromTime>
              <ToTime>12:00:00</ToTime>
            </WorkingTime>
            <WorkingTime>
              <FromTime>13:00:00</FromTime>
              <ToTime>${escapeXml(calendar.defaultFinishTime)}</ToTime>
            </WorkingTime>
          </WorkingTimes>` : "";
    return `
        <WeekDay>
          <DayType>${day + 1}</DayType>
          <DayWorking>${working}</DayWorking>${times}
        </WeekDay>`;
  }).join("");

  const exceptions = calendar.exceptions.map((date, index) => `
        <Exception>
          <EnteredByOccurrences>0</EnteredByOccurrences>
          <TimePeriod>
            <FromDate>${escapeXml(date)}T00:00:00</FromDate>
            <ToDate>${escapeXml(date)}T23:59:00</ToDate>
          </TimePeriod>
          <Occurrences>1</Occurrences>
          <Name>Holiday ${index + 1}</Name>
          <Type>1</Type>
          <DayWorking>0</DayWorking>
        </Exception>`).join("");

  return `<Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>${escapeXml(calendar.name || "Standard")}</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <BaseCalendarUID>-1</BaseCalendarUID>
      <WeekDays>${weekDays}
      </WeekDays>${exceptions ? `
      <Exceptions>${exceptions}
      </Exceptions>` : ""}
    </Calendar>
  </Calendars>`;
}

function importCalendarsFromXml(projectNode) {
  const fallback = normalizeCalendar(state.calendar || STANDARD_CALENDAR);
  const calendarsNode = childrenByName(projectNode, "Calendars")[0];
  const calendarNode = calendarsNode ? childrenByName(calendarsNode, "Calendar")[0] : null;
  if (!calendarNode) return fallback;

  const workingDays = [];
  const weekDaysNode = childrenByName(calendarNode, "WeekDays")[0];
  childrenByName(weekDaysNode || calendarNode, "WeekDay").forEach((weekDayNode) => {
    const dayType = Number(childText(weekDayNode, "DayType"));
    const isWorking = childText(weekDayNode, "DayWorking") === "1";
    if (dayType >= 1 && dayType <= 7 && isWorking) workingDays.push(dayType - 1);
  });

  const exceptions = [];
  const exceptionsNode = childrenByName(calendarNode, "Exceptions")[0];
  childrenByName(exceptionsNode || calendarNode, "Exception").forEach((exceptionNode) => {
    const dayWorking = childText(exceptionNode, "DayWorking");
    if (dayWorking && dayWorking !== "0") return;
    const period = childrenByName(exceptionNode, "TimePeriod")[0];
    const from = childText(period || exceptionNode, "FromDate").slice(0, 10);
    const to = childText(period || exceptionNode, "ToDate").slice(0, 10) || from;
    const start = dateOnly(from);
    const finish = dateOnly(to);
    if (!start || !finish) return;
    let date = start;
    let guard = 0;
    while (date <= finish && guard < 370) {
      exceptions.push(toDateInputValue(date));
      date = addDays(date, 1);
      guard += 1;
    }
  });

  return normalizeCalendar({
    name: childText(calendarNode, "Name") || fallback.name,
    workingDays: workingDays.length ? workingDays : fallback.workingDays,
    exceptions,
    minutesPerDay: Number(childText(projectNode, "MinutesPerDay")) || fallback.minutesPerDay,
    defaultStartTime: childText(projectNode, "DefaultStartTime") || fallback.defaultStartTime,
    defaultFinishTime: childText(projectNode, "DefaultFinishTime") || fallback.defaultFinishTime,
  });
}

function projectLinkLagValue(lagMinutes) {
  return Math.round(normalizeLagMinutes(lagMinutes) * 10);
}

function parseProjectLinkLag(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  // MSPDI stores LinkLag in tenths of minutes. Older exports with tiny values
  // are treated as minutes so we do not turn a user-entered 2 into 0.2 minutes.
  return Math.round(Math.abs(n) > 50 ? n / 10 : n);
}

function buildProjectXml() {
  ensureDecorations();
  rollupSummaryTasks();
  ensureDecorations();
  const created = new Date().toISOString().replace(/\.\d{3}Z$/, "");
  const projectStart = toProjectDate(state.projectStart);
  const projectFinishValue = state.tasks.length ? new Date(Math.max(...state.tasks.map((task) => dateOnly(task.finish)).filter(Boolean).map(Number))) : dateOnly(state.projectStart);
  const projectFinish = toProjectDate(projectFinishValue || state.projectStart, true);
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
      <CalendarUID>1</CalendarUID>
      <Start>${projectStart}</Start>
      <Finish>${projectFinish}</Finish>
      <Duration>${daysToProjectDuration(Math.max(1, workDaysBetween(state.projectStart, projectFinishValue || state.projectStart)))}</Duration>
      <DurationFormat>7</DurationFormat>
      <Work>PT0H0M0S</Work>
      <Summary>1</Summary>
      <Manual>1</Manual>
    </Task>`;

  const taskXml = state.tasks.map((task) => {
    const durationMinutes = normalizeDurationMinutes(task.durationMinutes, (task.durationDays || workDaysBetween(task.start, task.finish)) * getCalendar().minutesPerDay);
    const predecessors = getTaskLinks(task).map((link) => {
      const pred = taskById.get(link.id);
      if (!pred) return "";
      return `
      <PredecessorLink>
        <PredecessorUID>${pred.uid}</PredecessorUID>
        <Type>${LINK_TYPE_TO_PROJECT[link.type] ?? 1}</Type>
        <CrossProject>0</CrossProject>
        <LinkLag>${projectLinkLagValue(link.lagMinutes)}</LinkLag>
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
      <CalendarUID>1</CalendarUID>
      <Start>${toProjectDate(task.start)}</Start>
      <Finish>${toProjectDate(task.finish, true)}</Finish>
      <Duration>${minutesToProjectDuration(durationMinutes)}</Duration>
      <DurationFormat>7</DurationFormat>
      <Work>${minutesToProjectDuration(durationMinutes)}</Work>
      <PercentComplete>${task.percent}</PercentComplete>
      <ConstraintType>${CONSTRAINT_TO_PROJECT[normalizeConstraintType(task.constraintType)] ?? 0}</ConstraintType>${task.constraintDate ? `
      <ConstraintDate>${toProjectDate(task.constraintDate)}</ConstraintDate>` : ""}${task.deadline ? `
      <Deadline>${toProjectDate(task.deadline, true)}</Deadline>` : ""}
      <Milestone>${durationMinutes === 0 ? 1 : 0}</Milestone>
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
  <HonorConstraints>1</HonorConstraints>
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
  ${buildCalendarsXml()}
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
    const rawDuration = childText(node, "Duration");
    const durationMinutes = rawDuration ? durationToMinutes(rawDuration) : getCalendar().minutesPerDay;
    const finish = childText(node, "Finish").slice(0, 10) || toDateInputValue(finishFromStartByDuration(start, durationMinutes));
    const outlineLevel = normalizeLevel(childText(node, "OutlineLevel") || 1);
    const percent = normalizePercent(childText(node, "PercentComplete") || 0);
    const isSummary = childText(node, "Summary") === "1";
    const expanded = childText(node, "Expanded") !== "0";
    const constraintType = normalizeConstraintType(childText(node, "ConstraintType") || "ASAP");
    const constraintDate = normalizeDateValue(childText(node, "ConstraintDate").slice(0, 10));
    const deadline = normalizeDateValue(childText(node, "Deadline").slice(0, 10));

    rawTasks.push({
      uid: Number.isFinite(uid) && uid > 0 ? uid : state.nextUid++,
      importedId: id,
      node,
      name,
      start,
      finish,
      durationDays: durationMinutesToWorkingDays(durationMinutes),
      durationMinutes,
      isMilestone: durationMinutes === 0 || childText(node, "Milestone") === "1",
      percent,
      predecessors: [],
      links: [],
      outlineLevel,
      isSummary,
      expanded,
      constraintType,
      constraintDate,
      deadline,
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
        lagMinutes: parseProjectLinkLag(childText(link, "LinkLag")),
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
    calendar: importCalendarsFromXml(projectNode),
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

  const start = toDateInputValue(nextWorkingDay(draft.start && dateOnly(draft.start) ? draft.start : (state.projectStart || today), true));
  const tasks = draft.tasks.slice(0, 100).map((task, index) => {
    const taskStart = toDateInputValue(addWorkingDays(start, index * 2 + 1));
    const taskFinish = toDateInputValue(addWorkingDays(taskStart, 2));
    return {
      uid: index + 1,
      name: task.name || `Recovered task ${index + 1}`,
      start: taskStart,
      finish: taskFinish,
      durationDays: 2,
      durationMinutes: getCalendar().minutesPerDay * 2,
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
    calendar: normalizeCalendar(state.calendar),
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
  const rows = [["ID", "WBS", "Name", "Start", "Finish", "Duration", "DurationMinutes", "PercentComplete", "Predecessors", "Successors", "ConstraintType", "ConstraintDate", "Deadline", "OutlineLevel", "IsSummary", "Expanded"]];
  state.tasks.forEach((task) => {
    rows.push([
      task.id,
      task.wbs,
      task.name,
      task.start,
      task.finish,
      formatDuration(task.durationMinutes),
      normalizeDurationMinutes(task.durationMinutes, task.durationDays * getCalendar().minutesPerDay),
      task.percent,
      formatLinks(task.links).replaceAll(",", ";"),
      formatSuccessorLinks(task.id).replaceAll(",", ";"),
      formatConstraintType(task.constraintType),
      task.constraintDate || "",
      task.deadline || "",
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

function makeSampleTask(uid, name, startOffset, durationDays, percent, links = [], outlineLevel = 1) {
  const projectStart = toDateInputValue(nextWorkingDay(state.projectStart || today, true));
  const start = toDateInputValue(addWorkingDays(projectStart, startOffset + 1));
  const durationMinutes = Math.max(0, Number(durationDays) || 0) * getCalendar().minutesPerDay;
  const finish = toDateInputValue(finishFromStartByDuration(start, durationMinutes));
  return {
    uid,
    name,
    start,
    finish,
    durationDays: durationMinutesToWorkingDays(durationMinutes),
    durationMinutes,
    isMilestone: durationMinutes === 0,
    percent,
    predecessors: links.map((link) => link.id),
    links,
    outlineLevel,
    constraintType: "ASAP",
    constraintDate: "",
    deadline: "",
  };
}

function loadSample(shouldRender = true) {
  const start = toDateInputValue(nextWorkingDay(state.projectStart || today, true));
  state = {
    projectName: "Chris Discount Launch Plan",
    projectStart: start,
    nextUid: 8,
    calendar: normalizeCalendar(state.calendar),
    tasks: [
      makeSampleTask(1, "Finalize requirements", 0, 2, 100),
      makeSampleTask(2, "Build import/export MVP", 2, 4, 70, [{ id: 1, type: "FS" }]),
      makeSampleTask(3, "Validate Microsoft Project XML", 6, 2, 25, [{ id: 2, type: "FS", lagMinutes: getCalendar().minutesPerDay }]),
      makeSampleTask(4, "Add real calendar engine", 8, 3, 0, [{ id: 3, type: "FS" }]),
      makeSampleTask(5, "User acceptance test", 11, 2, 0, [{ id: 4, type: "FS" }]),
      makeSampleTask(6, "Prepare release notes", 11, 2, 0, [{ id: 4, type: "SS" }]),
      makeSampleTask(7, "Submit build", 13, 1, 0, [{ id: 5, type: "FS" }, { id: 6, type: "FF" }]),
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

function calculateLinkAlignedDates(predecessor, successor, linkOrType) {
  const link = typeof linkOrType === "object" ? linkOrType : { type: linkOrType, lagMinutes: 0 };
  const type = normalizeLinkType(link.type);
  const lagMinutes = normalizeLagMinutes(link.lagMinutes);
  const durationMinutes = normalizeDurationMinutes(successor.durationMinutes, workingSpanMinutes(successor.start, successor.finish));
  const durationDays = durationMinutesToWorkingDays(durationMinutes);
  const predStart = dateOnly(predecessor.start);
  const predFinish = dateOnly(predecessor.finish);
  if (!predStart || !predFinish) return null;

  let start;
  let finish;

  if (type === "FS") {
    start = applyLagToWorkingDate(addWorkingDaysAfter(predFinish, 1), lagMinutes);
    finish = finishFromStartByDuration(start, durationMinutes);
  } else if (type === "SS") {
    start = applyLagToWorkingDate(predStart, lagMinutes);
    finish = finishFromStartByDuration(start, durationMinutes);
  } else if (type === "FF") {
    finish = applyLagToWorkingDate(predFinish, lagMinutes);
    start = startFromFinishByDuration(finish, durationMinutes);
  } else if (type === "SF") {
    finish = applyLagToWorkingDate(predStart, lagMinutes);
    start = startFromFinishByDuration(finish, durationMinutes);
  } else {
    start = applyLagToWorkingDate(addWorkingDaysAfter(predFinish, 1), lagMinutes);
    finish = finishFromStartByDuration(start, durationMinutes);
  }

  return applyConstraintsToDates(successor, {
    start: toDateInputValue(start),
    finish: toDateInputValue(finish),
    durationDays,
    durationMinutes,
  });
}

function datesAlreadyMatch(task, proposedDates) {
  return proposedDates && task.start === proposedDates.start && task.finish === proposedDates.finish;
}


function applyConstraintsToDates(task, dates = null) {
  if (!task) return null;
  const type = normalizeConstraintType(task.constraintType);
  const constraintDate = dateOnly(task.constraintDate);
  const deadlineDate = dateOnly(task.deadline);
  const durationMinutes = normalizeDurationMinutes(dates?.durationMinutes ?? task.durationMinutes, workingSpanMinutes(dates?.start || task.start, dates?.finish || task.finish));
  let start = dateOnly(dates?.start || task.start || state.projectStart || today);
  let finish = dateOnly(dates?.finish || task.finish || finishFromStartByDuration(start, durationMinutes));
  if (!start || !finish) return dates;
  let constrained = false;

  function setStart(value) {
    start = nextWorkingDay(value, true);
    finish = finishFromStartByDuration(start, durationMinutes);
    constrained = true;
  }

  function setFinish(value) {
    finish = previousWorkingDay(value, true);
    start = startFromFinishByDuration(finish, durationMinutes);
    constrained = true;
  }

  if (type === "SNET" && constraintDate && start < constraintDate) setStart(constraintDate);
  else if (type === "SNLT" && constraintDate && start > constraintDate) setStart(constraintDate);
  else if (type === "FNET" && constraintDate && finish < constraintDate) setFinish(constraintDate);
  else if (type === "FNLT" && constraintDate && finish > constraintDate) setFinish(constraintDate);
  else if (type === "MSO" && constraintDate && toDateInputValue(start) !== toDateInputValue(constraintDate)) setStart(constraintDate);
  else if (type === "MFO" && constraintDate && toDateInputValue(finish) !== toDateInputValue(constraintDate)) setFinish(constraintDate);
  else if (type === "ALAP") {
    const anchor = constraintDate || deadlineDate;
    if (anchor && finish < anchor) setFinish(anchor);
  }

  if (!constrained && !dates) return null;
  return {
    start: toDateInputValue(start),
    finish: toDateInputValue(finish),
    durationDays: durationMinutesToWorkingDays(durationMinutes),
    durationMinutes,
  };
}

function getTaskConstraintWarnings(task) {
  const warnings = [];
  if (!task) return warnings;
  const type = normalizeConstraintType(task.constraintType);
  const constraintDate = dateOnly(task.constraintDate);
  const deadlineDate = dateOnly(task.deadline);
  const start = dateOnly(task.start);
  const finish = dateOnly(task.finish);
  if (constraintNeedsDate(type) && !constraintDate) warnings.push(`${formatConstraintType(type)} needs a constraint date.`);
  if (constraintDate && !isWorkingDay(constraintDate)) warnings.push(`Constraint date ${formatFriendlyDate(constraintDate)} is non-working; scheduling snaps to the nearest working day.`);
  if (deadlineDate && !isWorkingDay(deadlineDate)) warnings.push(`Deadline ${formatFriendlyDate(deadlineDate)} is non-working.`);
  if (type === "SNET" && start && constraintDate && start < constraintDate) warnings.push(`Starts before its ${formatConstraintType(type)} date (${formatFriendlyDate(constraintDate)}).`);
  if (type === "SNLT" && start && constraintDate && start > constraintDate) warnings.push(`Starts after its ${formatConstraintType(type)} date (${formatFriendlyDate(constraintDate)}).`);
  if (type === "FNET" && finish && constraintDate && finish < constraintDate) warnings.push(`Finishes before its ${formatConstraintType(type)} date (${formatFriendlyDate(constraintDate)}).`);
  if (type === "FNLT" && finish && constraintDate && finish > constraintDate) warnings.push(`Finishes after its ${formatConstraintType(type)} date (${formatFriendlyDate(constraintDate)}).`);
  if (type === "MSO" && start && constraintDate && toDateInputValue(start) !== toDateInputValue(constraintDate)) warnings.push(`Must start on ${formatFriendlyDate(constraintDate)}.`);
  if (type === "MFO" && finish && constraintDate && toDateInputValue(finish) !== toDateInputValue(constraintDate)) warnings.push(`Must finish on ${formatFriendlyDate(constraintDate)}.`);
  if (deadlineDate && finish && finish > deadlineDate) warnings.push(`Misses deadline ${formatFriendlyDate(deadlineDate)}.`);
  return warnings;
}

function latestDate(dates) {
  const valid = dates.filter(Boolean).map((date) => dateOnly(date)).filter(Boolean);
  if (!valid.length) return null;
  return new Date(Math.max(...valid.map(Number)));
}

function calculateTaskDatesFromLinks(task, byId) {
  const links = getTaskLinks(task);
  if (!links.length) return applyConstraintsToDates(task, null);

  const durationMinutes = normalizeDurationMinutes(task.durationMinutes, workingSpanMinutes(task.start, task.finish));
  const startRequirements = [];
  const finishRequirements = [];

  links.forEach((link) => {
    const pred = byId.get(link.id);
    if (!pred) return;
    const predStart = dateOnly(pred.start);
    const predFinish = dateOnly(pred.finish);
    if (!predStart || !predFinish) return;

    if (link.type === "FS") startRequirements.push(applyLagToWorkingDate(addWorkingDaysAfter(predFinish, 1), link.lagMinutes));
    else if (link.type === "SS") startRequirements.push(applyLagToWorkingDate(predStart, link.lagMinutes));
    else if (link.type === "FF") finishRequirements.push(applyLagToWorkingDate(predFinish, link.lagMinutes));
    else if (link.type === "SF") finishRequirements.push(applyLagToWorkingDate(predStart, link.lagMinutes));
  });

  const latestStartRequirement = latestDate(startRequirements);
  const latestFinishRequirement = latestDate(finishRequirements);
  if (!latestStartRequirement && !latestFinishRequirement) return null;

  const finishDrivenStart = latestFinishRequirement ? startFromFinishByDuration(latestFinishRequirement, durationMinutes) : null;
  const desiredStart = latestDate([latestStartRequirement, finishDrivenStart]) || dateOnly(task.start) || dateOnly(state.projectStart) || dateOnly(today);
  const desiredFinish = finishFromStartByDuration(desiredStart, durationMinutes);

  return applyConstraintsToDates(task, {
    start: toDateInputValue(desiredStart),
    finish: toDateInputValue(desiredFinish),
    durationDays: durationMinutesToWorkingDays(durationMinutes),
    durationMinutes,
  });
}

function applyDatesToTask(task, dates) {
  if (!task || !dates) return false;
  const nextDurationMinutes = normalizeDurationMinutes(dates.durationMinutes, task.durationMinutes);
  const changed = task.start !== dates.start || task.finish !== dates.finish || task.durationMinutes !== nextDurationMinutes;
  if (!changed) return false;
  task.start = dates.start;
  task.finish = dates.finish;
  task.durationMinutes = nextDurationMinutes;
  task.durationDays = durationMinutesToWorkingDays(nextDurationMinutes);
  task.isMilestone = nextDurationMinutes === 0;
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
      const changed = original.start !== task.start || original.finish !== task.finish || original.durationMinutes !== task.durationMinutes;
      if (!changed) return null;
      return {
        id: task.id,
        name: task.name,
        from: {
          start: original.start,
          finish: original.finish,
          durationDays: original.durationDays,
          durationMinutes: original.durationMinutes,
        },
        to: {
          start: task.start,
          finish: task.finish,
          durationDays: task.durationDays,
          durationMinutes: task.durationMinutes,
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
    task.durationMinutes = normalizeDurationMinutes(change.to.durationMinutes, change.to.durationDays * getCalendar().minutesPerDay);
    task.durationDays = durationMinutesToWorkingDays(task.durationMinutes);
    task.isMilestone = task.durationMinutes === 0;
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
      source.durationMinutes = normalizeDurationMinutes(request.originalDates.durationMinutes, request.originalDates.durationDays * getCalendar().minutesPerDay);
      source.durationDays = durationMinutesToWorkingDays(source.durationMinutes);
      source.isMilestone = source.durationMinutes === 0;
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
    durationMinutes: successor.durationMinutes,
  };

  const newLink = { id: predecessor.id, type, lagMinutes: 0 };
  successor.links = previousLinks.filter((link) => link.id !== predecessor.id);
  successor.links.push(newLink);
  successor.predecessors = successor.links.map((link) => link.id);

  const cycles = detectCycles();
  if (cycles.length) {
    successor.links = previousLinks;
    successor.predecessors = previousLinks.map((link) => link.id);
    alert(`That would create a dependency loop: ${cycles[0].join(" → ")}.`);
    return false;
  }

  const proposedDates = calculateLinkAlignedDates(predecessor, successor, newLink);
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
        successor.durationMinutes = normalizeDurationMinutes(proposedDates.durationMinutes, proposedDates.durationDays * getCalendar().minutesPerDay);
        successor.durationDays = durationMinutesToWorkingDays(successor.durationMinutes);
        successor.isMilestone = successor.durationMinutes === 0;
        cascadeScheduleFromTask(successor.id, { silent: true });
        return;
      }

      if (choice === "cancel") {
        successor.links = previousLinks;
        successor.predecessors = previousLinks.map((link) => link.id);
        successor.start = previousDates.start;
        successor.finish = previousDates.finish;
        successor.durationMinutes = normalizeDurationMinutes(previousDates.durationMinutes, previousDates.durationDays * getCalendar().minutesPerDay);
        successor.durationDays = durationMinutesToWorkingDays(successor.durationMinutes);
        successor.isMilestone = successor.durationMinutes === 0;
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
    originalDurationMinutes: normalizeDurationMinutes(task.durationMinutes, workingSpanMinutes(startDate, finishDate)),
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
    const durationMinutes = normalizeDurationMinutes(activeBarDrag.originalDurationMinutes, workingSpanMinutes(activeBarDrag.originalStart, activeBarDrag.originalFinish));
    const proposedStart = nextWorkingDay(addDays(activeBarDrag.originalStart, deltaDays), true);
    task.start = toDateInputValue(proposedStart);
    task.finish = toDateInputValue(finishFromStartByDuration(proposedStart, durationMinutes));
    task.durationMinutes = durationMinutes;
  } else if (activeBarDrag.mode === "resize-finish") {
    const finish = previousWorkingDay(addDays(activeBarDrag.originalFinish, deltaDays), true);
    task.start = toDateInputValue(activeBarDrag.originalStart);
    task.finish = toDateInputValue(dateOnly(finish) < activeBarDrag.originalStart ? activeBarDrag.originalStart : finish);
    task.durationMinutes = workingSpanMinutes(task.start, task.finish);
  } else if (activeBarDrag.mode === "resize-start") {
    const start = nextWorkingDay(addDays(activeBarDrag.originalStart, deltaDays), true);
    task.start = toDateInputValue(dateOnly(start) > activeBarDrag.originalFinish ? activeBarDrag.originalFinish : start);
    task.finish = toDateInputValue(activeBarDrag.originalFinish);
    task.durationMinutes = workingSpanMinutes(task.start, task.finish);
  }

  task.durationDays = durationMinutesToWorkingDays(task.durationMinutes);
  task.isMilestone = task.durationMinutes === 0;
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
    durationDays: durationMinutesToWorkingDays(drag.originalDurationMinutes),
    durationMinutes: normalizeDurationMinutes(drag.originalDurationMinutes, workingSpanMinutes(drag.originalStart, drag.originalFinish)),
  } : null;

  activeBarDrag = null;
  document.body.classList.remove("is-gantt-dragging");

  if (!task || !editedTaskId || !originalDates) {
    render();
    return;
  }

  const taskChanged = task.start !== originalDates.start || task.finish !== originalDates.finish || task.durationMinutes !== originalDates.durationMinutes;
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


els.taskBody.addEventListener("focusin", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const row = target.closest(".planner-row[data-row-index]");
  if (row) selectTask(Number(row.dataset.rowIndex));
});

els.taskBody.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) return;
  const index = Number(target.dataset.index);
  selectTask(index);
  const field = target.dataset.field;
  if (field) updateTask(index, field, target.value);
});

els.taskBody.addEventListener("click", (event) => {
  const row = event.target.closest(".planner-row[data-row-index]");
  if (row) selectTask(Number(row.dataset.rowIndex));

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



els.workingDaysInput?.addEventListener("change", () => {
  const days = parseWorkingDaysInput(els.workingDaysInput.value);
  state.calendar = normalizeCalendar({ ...getCalendar(), workingDays: days.length ? days : STANDARD_CALENDAR.workingDays });
  scheduleAllLinkedTasks({ silent: true, render: false });
  render();
});

els.holidayInput?.addEventListener("change", () => {
  state.calendar = normalizeCalendar({ ...getCalendar(), exceptions: parseExceptionDatesInput(els.holidayInput.value) });
  scheduleAllLinkedTasks({ silent: true, render: false });
  render();
});

els.projectName.addEventListener("change", () => {
  state.projectName = els.projectName.value.trim() || "New Project";
  render();
});

els.projectStart.addEventListener("change", () => {
  state.projectStart = toDateInputValue(nextWorkingDay(els.projectStart.value || today, true));
  if (!state.tasks.length) render();
  else {
    const firstStart = state.tasks[0]?.start;
    if (!firstStart) state.tasks[0].start = state.projectStart;
    render();
  }
});

els.newProjectBtn.addEventListener("click", () => {
  state = { projectName: "New Project", projectStart: today, nextUid: 1, calendar: normalizeCalendar(state.calendar), tasks: [] };
  addTask();
});

els.sampleBtn.addEventListener("click", () => loadSample(true));
els.addTaskBtn.addEventListener("click", addTask);
els.indentTaskBtn?.addEventListener("click", indentSelectedTask);
els.outdentTaskBtn?.addEventListener("click", outdentSelectedTask);
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
  const isMacShortcut = event.metaKey && !event.ctrlKey;
  const isPcShortcut = event.ctrlKey && !event.metaKey;
  if ((isMacShortcut || isPcShortcut) && event.key === "]") {
    event.preventDefault();
    indentSelectedTask();
    return;
  }
  if ((isMacShortcut || isPcShortcut) && event.key === "[") {
    event.preventDefault();
    outdentSelectedTask();
    return;
  }
  if (event.altKey && event.shiftKey && event.key === "ArrowRight") {
    event.preventDefault();
    indentSelectedTask();
    return;
  }
  if (event.altKey && event.shiftKey && event.key === "ArrowLeft") {
    event.preventDefault();
    outdentSelectedTask();
    return;
  }

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
