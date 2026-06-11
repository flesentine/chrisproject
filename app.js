const STORAGE_KEY = "projectxml-planner-v1";
const MS_PROJECT_NS = "http://schemas.microsoft.com/project";
const MS_PROJECT_SCHEMA_LOCATION = "http://schemas.microsoft.com/project http://schemas.microsoft.com/project/2007/mspdi_pj12.xsd";

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
  taskCount: document.getElementById("taskCount"),
  durationCount: document.getElementById("durationCount"),
  completeCount: document.getElementById("completeCount"),
  dateRange: document.getElementById("dateRange"),
  exportStatus: document.getElementById("exportStatus"),
};

const today = toDateInputValue(new Date());

let state = {
  projectName: "New Project",
  projectStart: today,
  nextUid: 2,
  tasks: [],
};

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
    task.durationDays = daysBetween(task.start, task.finish);
    task.predecessors = [...new Set((task.predecessors || [])
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0 && id !== task.id))];

    const level = task.outlineLevel;
    counters.length = level;
    for (let i = 0; i < level - 1; i += 1) {
      if (!counters[i]) counters[i] = 1;
    }
    counters[level - 1] = (counters[level - 1] || 0) + 1;
    task.wbs = counters.join(".");
  });
}

function save() {
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
  els.projectName.value = state.projectName;
  els.projectStart.value = state.projectStart;
  renderTaskTable();
  renderGantt();
  renderSummary();
  renderValidation();
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
  const averagePercent = tasks.length
    ? Math.round(tasks.reduce((sum, task) => sum + normalizePercent(task.percent), 0) / tasks.length)
    : 0;
  const issueCount = validateProject().length;

  if (els.taskCount) els.taskCount.textContent = String(tasks.length);
  if (els.durationCount) els.durationCount.textContent = `${duration}d`;
  if (els.completeCount) els.completeCount.textContent = `${averagePercent}%`;
  if (els.dateRange) {
    els.dateRange.textContent = min && max ? `${formatShortDate(min)} → ${formatShortDate(max)}` : "No date range";
  }
  if (els.exportStatus) els.exportStatus.textContent = issueCount ? `${issueCount} issue${issueCount === 1 ? "" : "s"}` : "Ready";
}

function renderTaskTable() {
  els.taskBody.innerHTML = "";
  const fragment = document.createDocumentFragment();

  state.tasks.forEach((task, index) => {
    const row = document.createElement("tr");
    row.className = `task-row ${task.percent === 100 ? "is-complete" : ""}`;
    const indent = Math.max(0, task.outlineLevel - 1) * 18;
    row.innerHTML = `
      <td><span class="id-pill">${task.id}</span></td>
      <td>${escapeXml(task.wbs)}</td>
      <td><div class="task-name-cell" style="--indent:${indent}px"><input class="name-input" data-field="name" data-index="${index}" value="${escapeXml(task.name)}" /></div></td>
      <td><input type="date" data-field="start" data-index="${index}" value="${escapeXml(task.start)}" /></td>
      <td><input type="date" data-field="finish" data-index="${index}" value="${escapeXml(task.finish)}" /></td>
      <td><span class="duration-pill">${task.durationDays}d</span></td>
      <td>
        <div class="percent-cell">
          <input type="number" min="0" max="100" data-field="percent" data-index="${index}" value="${task.percent}" aria-label="Percent complete" />
          <div class="percent-track" aria-hidden="true"><span style="--pct:${task.percent}%"></span></div>
        </div>
      </td>
      <td><input data-field="predecessors" data-index="${index}" value="${escapeXml(task.predecessors.join(","))}" placeholder="1,2" /></td>
      <td><input type="number" min="1" max="10" data-field="outlineLevel" data-index="${index}" value="${task.outlineLevel}" aria-label="Outline level" /></td>
      <td><button type="button" class="delete-btn" data-action="delete" data-index="${index}" title="Delete task" aria-label="Delete task">×</button></td>
    `;
    fragment.appendChild(row);
  });

  els.taskBody.appendChild(fragment);
}

function renderGantt() {
  const tasks = state.tasks;
  if (!tasks.length) {
    els.timeline.innerHTML = "";
    els.gantt.innerHTML = `<div class="empty-state"><div><strong>No tasks yet</strong><span>Add a task to start building the schedule.</span></div></div>`;
    return;
  }

  const starts = tasks.map((t) => dateOnly(t.start)).filter(Boolean);
  const finishes = tasks.map((t) => dateOnly(t.finish)).filter(Boolean);
  let min = new Date(Math.min(...starts.map(Number)));
  let max = new Date(Math.max(...finishes.map(Number)));
  min = addDays(min, -1);
  max = addDays(max, 2);
  const totalDays = Math.max(1, daysBetween(min, max));
  const dayWidth = Math.max(42, Math.min(74, Math.floor(1040 / totalDays)));
  const labelWidth = 190;
  const gridWidth = totalDays * dayWidth + labelWidth;

  els.timeline.style.gridTemplateColumns = `${labelWidth}px repeat(${totalDays}, ${dayWidth}px)`;
  els.timeline.style.width = `${gridWidth}px`;
  const timelineCells = [`<div class="timeline-cell is-task-heading"><strong>Task</strong><span>timeline</span></div>`];
  for (let i = 0; i < totalDays; i += 1) {
    const d = addDays(min, i);
    const classes = ["timeline-cell"];
    if ([0, 6].includes(d.getDay())) classes.push("is-weekend");
    if (toDateInputValue(d) === today) classes.push("is-today");
    timelineCells.push(`
      <div class="${classes.join(" ")}">
        <strong>${d.toLocaleDateString([], { month: "short", day: "numeric" })}</strong>
        <span>${d.toLocaleDateString([], { weekday: "short" })}</span>
      </div>`);
  }
  els.timeline.innerHTML = timelineCells.join("");

  els.gantt.style.width = `${gridWidth}px`;
  els.gantt.innerHTML = tasks.map((task) => {
    const startOffset = Math.max(0, daysBetween(min, task.start) - 1);
    const duration = Math.max(1, daysBetween(task.start, task.finish));
    const left = labelWidth + startOffset * dayWidth;
    const width = Math.max(30, duration * dayWidth - 8);
    const barClass = task.percent === 100 ? "gantt-bar is-complete" : "gantt-bar";
    return `
      <div class="gantt-row" style="background-size:${dayWidth}px 56px">
        <div class="gantt-label" title="${escapeXml(task.name)}">
          <strong>${task.id}. ${escapeXml(task.name)}</strong>
          <span>${duration}d · ${task.percent}% · WBS ${escapeXml(task.wbs)}</span>
        </div>
        <div class="${barClass}" style="left:${left}px;width:${width}px;--done:${task.percent}%" title="${escapeXml(task.name)}: ${task.start} to ${task.finish}">
          <span>${escapeXml(task.name)}</span>
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

    task.predecessors.forEach((predId) => {
      if (!idSet.has(predId)) {
        issues.push(`Task ${task.id} references missing predecessor ID ${predId}.`);
        return;
      }
      const pred = state.tasks[predId - 1];
      if (pred && dateOnly(task.start) <= dateOnly(pred.finish)) {
        issues.push(`Task ${task.id} starts before predecessor ${predId} has clearly finished. Use Auto Schedule or adjust dates.`);
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
    (task?.predecessors || []).forEach((predId) => dfs(predId));
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
    els.validationPanel.innerHTML = `<div class="validation-card"><div><p><strong>Ready to export.</strong> Supported fields are clean: tasks, dates, duration, percent complete, WBS, outline level, and finish-to-start predecessors.</p></div></div>`;
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

  if (field === "percent") task.percent = normalizePercent(value);
  else if (field === "outlineLevel") task.outlineLevel = normalizeLevel(value);
  else if (field === "predecessors") {
    task.predecessors = String(value)
      .split(/[;,\s]+/)
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0 && n !== task.id);
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
    outlineLevel: last ? last.outlineLevel : 1,
  });
  render();
}

function deleteTask(index) {
  const deletedId = state.tasks[index]?.id;
  state.tasks.splice(index, 1);
  state.tasks.forEach((task) => {
    task.predecessors = task.predecessors
      .filter((id) => id !== deletedId)
      .map((id) => (id > deletedId ? id - 1 : id));
  });
  render();
}

function autoSchedule() {
  ensureDecorations();
  const cycles = detectCycles();
  if (cycles.length) {
    alert("Fix dependency loops before auto-scheduling.");
    return;
  }

  const byId = new Map(state.tasks.map((t) => [t.id, t]));
  let changed = true;
  let guard = 0;
  while (changed && guard < state.tasks.length * state.tasks.length + 10) {
    changed = false;
    guard += 1;
    state.tasks.forEach((task) => {
      if (!task.predecessors.length) return;
      const predFinishes = task.predecessors
        .map((id) => byId.get(id))
        .filter(Boolean)
        .map((pred) => dateOnly(pred.finish));
      if (!predFinishes.length) return;
      const earliest = toDateInputValue(addDays(new Date(Math.max(...predFinishes.map(Number))), 1));
      if (dateOnly(task.start) < dateOnly(earliest)) {
        const duration = task.durationDays || daysBetween(task.start, task.finish);
        task.start = earliest;
        task.finish = toDateInputValue(addDays(task.start, duration - 1));
        changed = true;
      }
    });
  }
  render();
}

function buildProjectXml() {
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
    const predecessors = task.predecessors.map((predId) => {
      const pred = taskById.get(predId);
      if (!pred) return "";
      return `
      <PredecessorLink>
        <PredecessorUID>${pred.uid}</PredecessorUID>
        <Type>1</Type>
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
      <Manual>1</Manual>${predecessors}
    </Task>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="${MS_PROJECT_NS}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="${MS_PROJECT_SCHEMA_LOCATION}">
  <SaveVersion>12</SaveVersion>
  <Name>${projectName}</Name>
  <Title>${projectName}</Title>
  <Subject>Exported from ProjectXML Planner</Subject>
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
      outlineLevel,
    });
  });

  rawTasks.sort((a, b) => a.importedId - b.importedId);
  rawTasks.forEach((task, index) => {
    task.id = index + 1;
    uidToImportedId.set(task.uid, task.id);
  });

  rawTasks.forEach((task) => {
    const links = childrenByName(task.node, "PredecessorLink");
    task.predecessors = links
      .map((link) => uidToImportedId.get(Number(childText(link, "PredecessorUID"))))
      .filter((id) => Number.isInteger(id) && id > 0 && id !== task.id);
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

function exportCsv() {
  ensureDecorations();
  const rows = [["ID", "WBS", "Name", "Start", "Finish", "DurationDays", "PercentComplete", "Predecessors", "OutlineLevel"]];
  state.tasks.forEach((task) => {
    rows.push([
      task.id,
      task.wbs,
      task.name,
      task.start,
      task.finish,
      task.durationDays,
      task.percent,
      task.predecessors.join(";"),
      task.outlineLevel,
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
    projectName: "App Store Launch Plan",
    projectStart: start,
    nextUid: 8,
    tasks: [
      { uid: 1, name: "Finalize requirements", start, finish: toDateInputValue(addDays(start, 1)), percent: 100, predecessors: [], outlineLevel: 1 },
      { uid: 2, name: "Build import/export MVP", start: toDateInputValue(addDays(start, 2)), finish: toDateInputValue(addDays(start, 5)), percent: 70, predecessors: [1], outlineLevel: 1 },
      { uid: 3, name: "Validate Microsoft Project XML", start: toDateInputValue(addDays(start, 6)), finish: toDateInputValue(addDays(start, 7)), percent: 25, predecessors: [2], outlineLevel: 1 },
      { uid: 4, name: "Add schedule polish", start: toDateInputValue(addDays(start, 8)), finish: toDateInputValue(addDays(start, 10)), percent: 0, predecessors: [3], outlineLevel: 1 },
      { uid: 5, name: "User acceptance test", start: toDateInputValue(addDays(start, 11)), finish: toDateInputValue(addDays(start, 12)), percent: 0, predecessors: [4], outlineLevel: 1 },
      { uid: 6, name: "Prepare release notes", start: toDateInputValue(addDays(start, 11)), finish: toDateInputValue(addDays(start, 12)), percent: 0, predecessors: [4], outlineLevel: 1 },
      { uid: 7, name: "Submit build", start: toDateInputValue(addDays(start, 13)), finish: toDateInputValue(addDays(start, 13)), percent: 0, predecessors: [5, 6], outlineLevel: 1 },
    ],
  };
  if (shouldRender) render();
}

els.taskBody.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;
  const index = Number(target.dataset.index);
  const field = target.dataset.field;
  if (field) updateTask(index, field, target.value);
});

els.taskBody.addEventListener("click", (event) => {
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
  if (!file) return;
  try {
    const text = await file.text();
    importProjectXml(text);
    els.importXmlInput.value = "";
  } catch (error) {
    alert(error.message || "Import failed.");
  }
});

load();
render();
