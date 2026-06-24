(() => {
  "use strict";

  const CORE_STORAGE_KEY = "projectxml-planner-v1";
  const EXT_STORAGE_KEY = "chris-discount-project-maker-splits-recurring-v1";
  const IMPORT_PENDING_KEY = "chris-discount-project-maker-pending-split-import";
  const VERSION = "v0.39.0";
  const VERSION_NAME = "Split + recurring tasks";
  const SPLIT_PREFIX = "CDPM_SPLIT:";
  const RECUR_PREFIX = "CDPM_RECUR:";
  const SPLIT_FIELD_ID = "188743731"; // Text30
  const RECUR_FIELD_ID = "188743730"; // Text29

  let overlayTimer = 0;
  let isRenderingOverlays = false;
  let activeSplitDrag = null;

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readCoreState() {
    return readJson(CORE_STORAGE_KEY, { projectName: "New Project", nextUid: 1, tasks: [], calendar: {} });
  }

  function writeCoreState(state) {
    writeJson(CORE_STORAGE_KEY, state);
  }

  function readExtState() {
    const value = readJson(EXT_STORAGE_KEY, {});
    return {
      splits: value && typeof value.splits === "object" ? value.splits : {},
      recurringSeries: value && typeof value.recurringSeries === "object" ? value.recurringSeries : {},
    };
  }

  function writeExtState(value) {
    writeJson(EXT_STORAGE_KEY, {
      splits: value.splits || {},
      recurringSeries: value.recurringSeries || {},
      updatedAt: new Date().toISOString(),
    });
  }

  function escapeXml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
  }

  function dateOnly(value) {
    if (!value) return null;
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    const text = String(value).slice(0, 10);
    const [year, month, day] = text.split("-").map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
  }

  function toDateInputValue(value) {
    const date = dateOnly(value);
    if (!date) return "";
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function addDays(value, days) {
    const date = dateOnly(value);
    if (!date) return null;
    date.setDate(date.getDate() + Number(days || 0));
    return date;
  }

  function addMonths(value, months) {
    const date = dateOnly(value);
    if (!date) return null;
    const day = date.getDate();
    date.setMonth(date.getMonth() + Number(months || 0));
    while (date.getDate() < day) date.setDate(date.getDate() - 1);
    return date;
  }

  function daysBetween(start, finish) {
    const s = dateOnly(start);
    const f = dateOnly(finish);
    if (!s || !f) return 1;
    return Math.max(1, Math.round((f - s) / 86400000) + 1);
  }

  function calendarFromState(state) {
    const calendar = state.calendar || {};
    return {
      workingDays: Array.isArray(calendar.workingDays) && calendar.workingDays.length ? calendar.workingDays.map(Number) : [1, 2, 3, 4, 5],
      exceptions: Array.isArray(calendar.exceptions) ? calendar.exceptions.map(String) : [],
      minutesPerDay: Math.max(1, Number(calendar.minutesPerDay) || 480),
    };
  }

  function isWorkingDay(value, state) {
    const calendar = calendarFromState(state);
    const date = dateOnly(value);
    if (!date) return false;
    return calendar.workingDays.includes(date.getDay()) && !calendar.exceptions.includes(toDateInputValue(date));
  }

  function nextWorkingDay(value, state) {
    let date = dateOnly(value) || new Date();
    let guard = 0;
    while (!isWorkingDay(date, state) && guard < 370) {
      date = addDays(date, 1);
      guard += 1;
    }
    return date;
  }

  function addWorkingDays(value, workDays, state) {
    const count = Math.max(1, Math.round(Number(workDays) || 1));
    let date = nextWorkingDay(value, state);
    let remaining = count - 1;
    let guard = 0;
    while (remaining > 0 && guard < count + 740) {
      date = addDays(date, 1);
      if (isWorkingDay(date, state)) remaining -= 1;
      guard += 1;
    }
    return date;
  }

  function taskSpanDays(task) {
    return daysBetween(task?.start, task?.finish);
  }

  function taskWorkDays(task, state) {
    const calendar = calendarFromState(state);
    const minutes = Math.max(0, Number(task?.durationMinutes) || Number(task?.durationDays || 1) * calendar.minutesPerDay || calendar.minutesPerDay);
    if (minutes <= 0) return 0;
    return Math.max(1, Math.ceil(minutes / calendar.minutesPerDay));
  }

  function finishFromStart(start, task, state) {
    const workDays = taskWorkDays(task, state);
    if (workDays <= 0) return toDateInputValue(start);
    return toDateInputValue(addWorkingDays(start, workDays, state));
  }

  function selectedTaskIndex() {
    const selected = document.querySelector(".planner-row.is-selected");
    if (selected?.dataset?.rowIndex) return Number(selected.dataset.rowIndex);
    const activeRow = document.activeElement?.closest?.("[data-row-index]");
    if (activeRow?.dataset?.rowIndex) return Number(activeRow.dataset.rowIndex);
    const firstRow = document.querySelector(".planner-row[data-row-index]");
    return firstRow?.dataset?.rowIndex ? Number(firstRow.dataset.rowIndex) : 0;
  }

  function getTaskByIndex(index) {
    const state = readCoreState();
    return { state, task: Array.isArray(state.tasks) ? state.tasks[index] : null };
  }

  function safeFileName(value) {
    if (typeof window.safeFileName === "function") return window.safeFileName(value);
    return String(value || "project").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "project";
  }

  function downloadText(text, filename, type = "text/plain") {
    if (typeof window.downloadText === "function") {
      window.downloadText(text, filename, type);
      return;
    }
    const blob = new Blob([text], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  function status(message) {
    const saveStatus = document.getElementById("saveStatus");
    if (saveStatus) saveStatus.textContent = message;
  }

  function refreshCoreFromStorage() {
    if (typeof window.load === "function" && typeof window.render === "function") {
      window.load();
      window.render();
    } else {
      window.location.reload();
    }
  }

  function normalizeSplitRecord(record, spanDays) {
    if (!record || !Array.isArray(record.segments) || spanDays < 3) return null;
    const segments = record.segments
      .map((segment) => ({
        startOffset: Math.round(Number(segment.startOffset) || 0),
        duration: Math.round(Number(segment.duration) || 0),
      }))
      .filter((segment) => segment.duration > 0 && segment.startOffset >= 0 && segment.startOffset < spanDays)
      .map((segment) => ({ ...segment, duration: Math.min(segment.duration, spanDays - segment.startOffset) }))
      .sort((a, b) => a.startOffset - b.startOffset);
    if (segments.length < 2) return null;
    return { ...record, segments };
  }

  function saveSplit(index, cutDay) {
    const { task } = getTaskByIndex(index);
    if (!task) return;
    const span = taskSpanDays(task);
    if (span < 3 || task.isSummary) {
      status("Need a regular task at least 3 days long to split.");
      return;
    }
    const gapOffset = clamp(Math.round(cutDay), 1, span - 2);
    const firstDuration = gapOffset;
    const secondStart = gapOffset + 1;
    const secondDuration = span - secondStart;
    if (firstDuration <= 0 || secondDuration <= 0) return;

    const ext = readExtState();
    const uid = String(task.uid || task.id || index + 1);
    ext.splits[uid] = {
      uid: task.uid || task.id || index + 1,
      taskName: task.name || `Task ${index + 1}`,
      updatedAt: new Date().toISOString(),
      segments: [
        { startOffset: 0, duration: firstDuration },
        { startOffset: secondStart, duration: secondDuration },
      ],
    };
    writeExtState(ext);
    renderOverlays();
    status(`Split saved for ${task.name || "selected task"}`);
  }

  function clearSelectedSplit() {
    const index = selectedTaskIndex();
    const { task } = getTaskByIndex(index);
    if (!task) return;
    const ext = readExtState();
    delete ext.splits[String(task.uid || task.id || index + 1)];
    writeExtState(ext);
    renderOverlays();
    status(`Split cleared for ${task.name || "selected task"}`);
  }

  function splitSelectedTask() {
    const index = selectedTaskIndex();
    const { task } = getTaskByIndex(index);
    if (!task) return;
    const span = taskSpanDays(task);
    saveSplit(index, Math.floor(span / 2));
  }

  function addSplitHandle(bar, index, task, splitRecord) {
    if (bar.querySelector(".split-drag-handle")) return;
    const span = taskSpanDays(task);
    if (span < 3 || bar.classList.contains("is-summary") || bar.classList.contains("is-milestone")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "split-drag-handle";
    const splitAt = splitRecord?.segments?.[0]?.duration ?? Math.floor(span / 2);
    button.style.left = `${clamp((splitAt / span) * 100, 8, 92)}%`;
    button.title = "Drag this middle handle to split or move the split gap";
    button.setAttribute("aria-label", `Split ${task.name || "task"}`);
    button.textContent = "✂";
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      activeSplitDrag = { bar, index, button };
      button.setPointerCapture?.(event.pointerId);
      bar.classList.add("is-split-dragging");
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      saveSplit(index, Math.floor(span / 2));
    });
    bar.appendChild(button);
  }

  function drawSplitSegments(bar, splitRecord, spanDays) {
    bar.classList.add("has-split-overlay");
    const layer = document.createElement("span");
    layer.className = "split-segments-layer";
    splitRecord.segments.forEach((segment, segmentIndex) => {
      const piece = document.createElement("span");
      piece.className = "split-task-segment";
      piece.style.left = `${(segment.startOffset / spanDays) * 100}%`;
      piece.style.width = `${(segment.duration / spanDays) * 100}%`;
      piece.title = `Work segment ${segmentIndex + 1}: day ${segment.startOffset + 1} for ${segment.duration} day${segment.duration === 1 ? "" : "s"}`;
      layer.appendChild(piece);
    });
    bar.appendChild(layer);
  }

  function drawRecurringBadge(bar, task) {
    if (!task?.recurring || bar.querySelector(".recurring-task-badge")) return;
    const badge = document.createElement("span");
    badge.className = "recurring-task-badge";
    const occurrence = task.recurring.occurrence || 1;
    const count = task.recurring.count || "?";
    badge.textContent = "↻";
    badge.title = `Recurring task occurrence ${occurrence} of ${count}`;
    bar.appendChild(badge);
  }

  function updateVersionDom() {
    const versionText = `${VERSION} · ${VERSION_NAME}`;
    const badge = document.getElementById("appVersionBadge");
    if (badge) badge.textContent = versionText;
    const footer = document.getElementById("appVersionFooter");
    if (footer) footer.textContent = `${versionText} · Build 2026-06-24`;
    const ribbon = document.getElementById("ribbonVersionText");
    if (ribbon) ribbon.textContent = `${VERSION} · split + recurring`;
    const cardBadge = document.querySelector(".unified-card .card-badge");
    if (cardBadge) cardBadge.textContent = "Entry + Split + Repeat";
  }

  function renderOverlays() {
    if (isRenderingOverlays) return;
    isRenderingOverlays = true;
    try {
      updateVersionDom();
      installToolbar();
      const state = readCoreState();
      const tasks = Array.isArray(state.tasks) ? state.tasks : [];
      const ext = readExtState();
      document.querySelectorAll(".gantt-bar[data-index]").forEach((bar) => {
        bar.querySelectorAll(".split-segments-layer,.split-drag-handle,.recurring-task-badge").forEach((node) => node.remove());
        bar.classList.remove("has-split-overlay", "is-split-dragging");
        const index = Number(bar.dataset.index);
        const task = tasks[index];
        if (!task) return;
        const span = taskSpanDays(task);
        const uid = String(task.uid || task.id || index + 1);
        const splitRecord = normalizeSplitRecord(ext.splits[uid], span);
        if (splitRecord) drawSplitSegments(bar, splitRecord, span);
        drawRecurringBadge(bar, task);
        addSplitHandle(bar, index, task, splitRecord);
      });
    } finally {
      isRenderingOverlays = false;
    }
  }

  function scheduleOverlays() {
    clearTimeout(overlayTimer);
    overlayTimer = setTimeout(renderOverlays, 40);
  }

  function installToolbar() {
    if (document.getElementById("splitRecurringGroup")) return;
    const taskPanel = document.querySelector(".ribbon-panel[data-ribbon-panel='task']");
    if (!taskPanel) return;
    const group = document.createElement("div");
    group.className = "command-group compact-group split-recurring-ribbon-group";
    group.id = "splitRecurringGroup";
    group.innerHTML = `
      <span class="group-label">Split / Repeat</span>
      <button id="splitSelectedTaskBtn" type="button" title="Split the selected Gantt bar into two work segments">Split task</button>
      <button id="clearSplitTaskBtn" type="button" title="Clear split segments from the selected task">Clear split</button>
      <button id="recurringTaskBtn" type="button" title="Create repeated copies of the selected task">Recurring task</button>`;
    const note = taskPanel.querySelector(".ribbon-note-group");
    taskPanel.insertBefore(group, note || null);
    group.querySelector("#splitSelectedTaskBtn")?.addEventListener("click", splitSelectedTask);
    group.querySelector("#clearSplitTaskBtn")?.addEventListener("click", clearSelectedSplit);
    group.querySelector("#recurringTaskBtn")?.addEventListener("click", openRecurringModal);
  }

  function ensureRecurringModal() {
    let modal = document.getElementById("recurringTaskModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "dependency-modal recurring-task-modal";
    modal.id = "recurringTaskModal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="dependency-backdrop" data-recurring-action="cancel"></div>
      <section class="dependency-dialog recurring-dialog" role="dialog" aria-modal="true" aria-labelledby="recurringTaskTitle">
        <button aria-label="Cancel recurring task" class="dependency-close" data-recurring-action="cancel" type="button">×</button>
        <p class="eyebrow">Recurring task</p>
        <h2 id="recurringTaskTitle">Repeat selected task</h2>
        <p class="dependency-copy" id="recurringTaskCopy">Creates regular task rows that keep their own dates, resources, costs, and later edits.</p>
        <div class="recurring-task-form">
          <label>Pattern<select id="recurringPattern"><option value="weekly">Weekly</option><option value="daily">Daily</option><option value="monthly">Monthly</option></select></label>
          <label>Every<input id="recurringInterval" type="number" min="1" max="52" value="1" /></label>
          <label>Occurrences<input id="recurringCount" type="number" min="2" max="60" value="4" /></label>
          <label class="checkbox-line"><input id="recurringKeepLinks" type="checkbox" />Copy predecessor links</label>
        </div>
        <p class="recurring-help">The first occurrence is the selected task. New occurrences are inserted directly below it.</p>
        <div class="schedule-actions"><button class="primary" data-recurring-action="create" type="button">Create recurring tasks</button><button data-recurring-action="cancel" type="button">Cancel</button></div>
      </section>`;
    modal.addEventListener("click", (event) => {
      const action = event.target?.dataset?.recurringAction;
      if (action === "cancel") closeRecurringModal();
      if (action === "create") createRecurringTasks();
    });
    document.body.appendChild(modal);
    return modal;
  }

  function openRecurringModal() {
    const index = selectedTaskIndex();
    const { task } = getTaskByIndex(index);
    if (!task) {
      status("Select a task first.");
      return;
    }
    const modal = ensureRecurringModal();
    modal.dataset.index = String(index);
    const copy = modal.querySelector("#recurringTaskCopy");
    if (copy) copy.textContent = `Repeat “${task.name || `Task ${index + 1}`}” from ${task.start || "its start date"}.`;
    modal.hidden = false;
  }

  function closeRecurringModal() {
    const modal = document.getElementById("recurringTaskModal");
    if (modal) modal.hidden = true;
  }

  function nextOccurrenceStart(sourceStart, pattern, intervalCount, state) {
    if (pattern === "daily") return toDateInputValue(nextWorkingDay(addDays(sourceStart, intervalCount), state));
    if (pattern === "monthly") return toDateInputValue(nextWorkingDay(addMonths(sourceStart, intervalCount), state));
    return toDateInputValue(nextWorkingDay(addDays(sourceStart, intervalCount * 7), state));
  }

  function createRecurringTasks() {
    const modal = ensureRecurringModal();
    const index = Number(modal.dataset.index);
    const state = readCoreState();
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    const source = tasks[index];
    if (!source) return;

    const pattern = modal.querySelector("#recurringPattern")?.value || "weekly";
    const interval = clamp(modal.querySelector("#recurringInterval")?.value, 1, 52);
    const count = clamp(modal.querySelector("#recurringCount")?.value, 2, 60);
    const keepLinks = Boolean(modal.querySelector("#recurringKeepLinks")?.checked);
    const maxUid = tasks.reduce((max, task) => Math.max(max, Number(task.uid) || 0), Number(state.nextUid) || 1);
    let nextUid = Math.max(Number(state.nextUid) || 1, maxUid + 1);
    const seriesId = `rec-${Date.now().toString(36)}`;
    const createdAt = new Date().toISOString();
    const baseName = String(source.name || `Task ${index + 1}`).replace(/\s+\(\d+\/\d+\)$/, "");

    source.recurring = { seriesId, occurrence: 1, count, pattern, interval, sourceUid: source.uid, createdAt };
    const clones = [];
    for (let occurrence = 2; occurrence <= count; occurrence += 1) {
      const offset = interval * (occurrence - 1);
      const start = nextOccurrenceStart(source.start, pattern, offset, state);
      const clone = JSON.parse(JSON.stringify(source));
      clone.uid = nextUid++;
      clone.id = undefined;
      clone.name = `${baseName} (${occurrence}/${count})`;
      clone.start = start;
      clone.finish = finishFromStart(start, source, state);
      clone.percent = 0;
      clone.actualStart = "";
      clone.actualFinish = "";
      clone.actualDurationMinutes = 0;
      clone.remainingDurationMinutes = clone.durationMinutes;
      clone.baseline = {};
      clone.links = keepLinks ? clone.links || [] : [];
      clone.predecessors = keepLinks ? clone.predecessors || [] : [];
      clone.recurring = { seriesId, occurrence, count, pattern, interval, sourceUid: source.uid, createdAt };
      clones.push(clone);
    }

    state.nextUid = nextUid;
    state.tasks.splice(index + 1, 0, ...clones);
    writeCoreState(state);

    const ext = readExtState();
    ext.recurringSeries[seriesId] = {
      seriesId,
      sourceUid: source.uid,
      sourceName: baseName,
      pattern,
      interval,
      count,
      createdAt,
    };
    writeExtState(ext);
    closeRecurringModal();
    refreshCoreFromStorage();
    status(`Created ${count} recurring occurrences for ${baseName}.`);
  }

  function extensionDefinitionsXml() {
    return `
  <ExtendedAttributes>
    <ExtendedAttribute><FieldID>${SPLIT_FIELD_ID}</FieldID><FieldName>Text30</FieldName><Alias>CDPM Split Segments</Alias></ExtendedAttribute>
    <ExtendedAttribute><FieldID>${RECUR_FIELD_ID}</FieldID><FieldName>Text29</FieldName><Alias>CDPM Recurring Task</Alias></ExtendedAttribute>
  </ExtendedAttributes>`;
  }

  function taskExtendedAttribute(fieldId, fieldName, value) {
    return `
      <ExtendedAttribute>
        <FieldID>${fieldId}</FieldID>
        <FieldName>${fieldName}</FieldName>
        <Value>${escapeXml(value)}</Value>
      </ExtendedAttribute>`;
  }

  function augmentProjectXml(xml) {
    const state = readCoreState();
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    const byUid = new Map(tasks.map((task) => [String(task.uid), task]));
    const ext = readExtState();

    let output = xml;
    if (!/<ExtendedAttributes>[\s\S]*?<\/ExtendedAttributes>/.test(output)) {
      output = output.replace(/\n\s*<Tasks>/, `${extensionDefinitionsXml()}\n  <Tasks>`);
    }

    return output.replace(/<Task>([\s\S]*?)<\/Task>/g, (full, body) => {
      const uid = /<UID>([^<]+)<\/UID>/.exec(body)?.[1];
      if (!uid || uid === "0") return full;
      const task = byUid.get(String(uid));
      if (!task) return full;
      const extras = [];
      const split = ext.splits[String(uid)];
      if (split) extras.push(taskExtendedAttribute(SPLIT_FIELD_ID, "Text30", `${SPLIT_PREFIX}${JSON.stringify(split)}`));
      if (task.recurring) extras.push(taskExtendedAttribute(RECUR_FIELD_ID, "Text29", `${RECUR_PREFIX}${JSON.stringify(task.recurring)}`));
      if (!extras.length) return full;
      return `<Task>${body}${extras.join("")}
    </Task>`;
    });
  }

  function installExportHook() {
    if (window.__cdpmSplitExportHookInstalled) return;
    window.__cdpmSplitExportHookInstalled = true;

    const originalBuildProjectXml = window.buildProjectXml;
    if (typeof originalBuildProjectXml === "function") {
      window.buildProjectXml = function buildProjectXmlWithSplitData(...args) {
        return augmentProjectXml(originalBuildProjectXml.apply(this, args));
      };
    }

    const exportBtn = document.getElementById("exportXmlBtn");
    exportBtn?.addEventListener("click", (event) => {
      if (typeof window.buildProjectXml !== "function") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const state = readCoreState();
      downloadText(window.buildProjectXml(), `${safeFileName(state.projectName)}.xml`, "application/xml");
      status("Exported XML with split and recurring task data.");
    }, true);
  }

  function childText(node, localName) {
    const child = [...(node?.children || [])].find((candidate) => candidate.localName === localName);
    return child ? child.textContent.trim() : "";
  }

  function parseExtensionMetadata(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.getElementsByTagName("parsererror")[0]) return null;
    const parsed = { splits: {}, recurring: {} };
    [...doc.getElementsByTagName("Task")].forEach((taskNode) => {
      const uid = childText(taskNode, "UID");
      if (!uid || uid === "0") return;
      [...taskNode.children].filter((child) => child.localName === "ExtendedAttribute").forEach((attr) => {
        const value = childText(attr, "Value");
        try {
          if (value.startsWith(SPLIT_PREFIX)) parsed.splits[uid] = JSON.parse(value.slice(SPLIT_PREFIX.length));
          if (value.startsWith(RECUR_PREFIX)) parsed.recurring[uid] = JSON.parse(value.slice(RECUR_PREFIX.length));
        } catch {
          // Ignore malformed extension payloads and let the core XML import continue.
        }
      });
    });
    return parsed;
  }

  function hasParsedExtensionData(parsed) {
    return parsed && (Object.keys(parsed.splits || {}).length || Object.keys(parsed.recurring || {}).length);
  }

  function applyImportedMetadata(parsed) {
    if (!hasParsedExtensionData(parsed)) return;
    const state = readCoreState();
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    if (!tasks.length) return;

    const ext = readExtState();
    Object.entries(parsed.splits || {}).forEach(([uid, split]) => {
      ext.splits[String(uid)] = split;
    });
    let patchedTasks = false;
    tasks.forEach((task) => {
      const recurring = parsed.recurring?.[String(task.uid)];
      if (recurring) {
        task.recurring = recurring;
        patchedTasks = true;
      }
    });
    writeExtState(ext);
    if (patchedTasks) writeCoreState(state);
    if (patchedTasks) refreshCoreFromStorage();
    else renderOverlays();
    status("Imported split/recurring task metadata from XML.");
  }

  function installImportHook() {
    const input = document.getElementById("importXmlInput");
    input?.addEventListener("change", async (event) => {
      const file = event.target?.files?.[0];
      if (!file || !String(file.name || "").toLowerCase().endsWith(".xml")) return;
      try {
        const text = await file.text();
        const parsed = parseExtensionMetadata(text);
        if (!hasParsedExtensionData(parsed)) return;
        sessionStorage.setItem(IMPORT_PENDING_KEY, JSON.stringify(parsed));
        setTimeout(() => applyImportedMetadata(parsed), 350);
        setTimeout(() => applyImportedMetadata(parsed), 1200);
      } catch {
        // Let the core importer own user-visible import errors.
      }
    }, true);

    const pending = readJson(IMPORT_PENDING_KEY, null);
    if (pending) {
      sessionStorage.removeItem(IMPORT_PENDING_KEY);
      setTimeout(() => applyImportedMetadata(pending), 400);
    }
  }

  function injectStyles() {
    if (document.getElementById("splitRecurringStyles")) return;
    const style = document.createElement("style");
    style.id = "splitRecurringStyles";
    style.textContent = `
      .split-recurring-ribbon-group button { white-space: nowrap; }
      .gantt-bar.has-split-overlay { overflow: visible; }
      .gantt-bar.has-split-overlay > span:not(.split-segments-layer):not(.recurring-task-badge) { opacity: .76; }
      .split-segments-layer { position: absolute; inset: 4px 6px; border-radius: 999px; pointer-events: none; z-index: 3; }
      .split-task-segment { position: absolute; top: 0; bottom: 0; border-radius: 999px; background: rgba(255,255,255,.72); box-shadow: inset 0 0 0 1px rgba(17,24,39,.16); }
      .split-drag-handle { position: absolute; top: 50%; transform: translate(-50%, -50%); z-index: 7; width: 24px; height: 24px; border-radius: 999px; border: 1px solid rgba(15,23,42,.28); background: #fff; color: #334155; display: grid; place-items: center; cursor: ew-resize; font-size: 13px; box-shadow: 0 4px 10px rgba(15,23,42,.2); }
      .split-drag-handle:hover, .gantt-bar.is-split-dragging .split-drag-handle { transform: translate(-50%, -50%) scale(1.08); }
      .recurring-task-badge { position: absolute; right: -9px; top: -9px; z-index: 8; width: 20px; height: 20px; border-radius: 999px; display: grid; place-items: center; background: #fff; color: #2563eb; border: 1px solid rgba(37,99,235,.35); font-weight: 800; font-size: 14px; box-shadow: 0 4px 10px rgba(15,23,42,.2); }
      .recurring-dialog { max-width: 520px; }
      .recurring-task-form { display: grid; grid-template-columns: 1.2fr .8fr .9fr; gap: 12px; margin: 14px 0; }
      .recurring-task-form label { display: grid; gap: 5px; font-weight: 700; color: #334155; }
      .recurring-task-form input, .recurring-task-form select { min-height: 36px; border: 1px solid rgba(148,163,184,.8); border-radius: 10px; padding: 6px 9px; }
      .recurring-task-form .checkbox-line { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; font-weight: 600; }
      .recurring-help { margin: 4px 0 12px; color: #64748b; font-size: 13px; }
    `;
    document.head.appendChild(style);
  }

  function installPointerDrag() {
    document.addEventListener("pointermove", (event) => {
      if (!activeSplitDrag) return;
      const rect = activeSplitDrag.bar.getBoundingClientRect();
      const pct = clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100, 8, 92);
      activeSplitDrag.button.style.left = `${pct}%`;
    }, true);

    document.addEventListener("pointerup", (event) => {
      if (!activeSplitDrag) return;
      const { bar, index } = activeSplitDrag;
      activeSplitDrag = null;
      const { task } = getTaskByIndex(index);
      const span = taskSpanDays(task);
      const rect = bar.getBoundingClientRect();
      const cut = Math.round(((event.clientX - rect.left) / Math.max(1, rect.width)) * span);
      bar.classList.remove("is-split-dragging");
      saveSplit(index, cut);
    }, true);
  }

  function init() {
    injectStyles();
    installToolbar();
    installExportHook();
    installImportHook();
    installPointerDrag();
    renderOverlays();
    const taskBody = document.getElementById("taskBody");
    if (taskBody) new MutationObserver(scheduleOverlays).observe(taskBody, { childList: true, subtree: true });
    setTimeout(renderOverlays, 200);
    setTimeout(renderOverlays, 1000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
