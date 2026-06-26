(() => {
  'use strict';

  if (window.__resourceAutoLevelingLoaded) return;
  window.__resourceAutoLevelingLoaded = true;

  const VERSION = 'v0.41.0';
  const VERSION_NAME = 'Automatic resource leveling';
  const BUILD_DATE = '2026-06-26';
  const MAX_PASSES = 500;
  const MAX_TASK_DELAY_DAYS = 260;
  let tries = 0;
  let renderPatched = false;

  function boot() {
    if (!ready()) {
      if (++tries < 180) setTimeout(boot, 80);
      return;
    }
    installStyles();
    patchRender();
    installAutoLevelButton();
    renderResourceUsagePanel();
    exposeSelfTest();
    setVersionLabels();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();

  function ready() {
    return typeof state !== 'undefined' && Array.isArray(state.tasks) && typeof render === 'function' &&
      typeof getCalendar === 'function' && typeof isWorkingDay === 'function' && typeof toDateInputValue === 'function';
  }

  function patchRender() {
    if (renderPatched) return;
    renderPatched = true;
    const baseRender = render;
    render = function resourceAutoLevelRender(...args) {
      const result = baseRender.apply(this, args);
      installAutoLevelButton();
      renderResourceUsagePanel();
      decorateAutoLevelStatus();
      setVersionLabels();
      return result;
    };
    window.render = render;
  }

  function installAutoLevelButton() {
    const group = document.getElementById('resourceLevelingGroup') || createLevelingGroup();
    if (!group) return;
    const old = document.getElementById('autoLevelLaterBtn');
    if (old && old.id !== 'autoLevelResourcesBtn') old.id = 'autoLevelResourcesBtn';
    const button = document.getElementById('autoLevelResourcesBtn') || group.querySelector('button[data-auto-level-resources]');
    if (!button) return;
    button.disabled = false;
    button.dataset.autoLevelResources = '1';
    button.textContent = 'Level Resources';
    button.title = 'Move lower-priority overlapping tasks later until work resources are not overallocated.';
    if (!button.dataset.boundAutoLevel) {
      button.dataset.boundAutoLevel = '1';
      button.addEventListener('click', () => runAutoLeveling());
    }
    const status = document.getElementById('resourceLevelingStatus');
    if (status && status.textContent === 'Manual only') status.textContent = summarizeAnalysis(analyzeResourceLoad());
  }

  function createLevelingGroup() {
    const resourcePanel = document.querySelector(".ribbon-panel[data-ribbon-panel='resource']");
    if (!resourcePanel) return null;
    const group = document.createElement('div');
    group.className = 'command-group compact-group resource-leveling-group';
    group.id = 'resourceLevelingGroup';
    group.innerHTML = `
      <span class="group-label">Leveling</span>
      <button id="findResourceConflictsBtn" type="button">Find conflicts</button>
      <button id="autoLevelResourcesBtn" type="button" data-auto-level-resources="1">Level Resources</button>
      <span class="resource-leveling-status" id="resourceLevelingStatus">Ready</span>`;
    const note = resourcePanel.querySelector('.ribbon-note-group');
    resourcePanel.insertBefore(group, note || null);
    group.querySelector('#findResourceConflictsBtn')?.addEventListener('click', () => {
      const analysis = analyzeResourceLoad();
      if (typeof setActiveView === 'function') setActiveView('resources');
      renderResourceUsagePanel(analysis);
      status(analysis.conflicts.length ? `Found ${analysis.conflicts.length} resource conflict day${analysis.conflicts.length === 1 ? '' : 's'}.` : 'No resource overallocations found.');
      render();
    });
    return group;
  }

  function analyzeResourceLoad() {
    if (typeof ensureResources === 'function') ensureResources();
    const buckets = new Map();
    (state.tasks || []).forEach((task, index) => {
      if (!task || isSummary(index) || durationMinutes(task) <= 0) return;
      const dates = workingDates(task.start, task.finish);
      (task.assignments || []).forEach((assignment) => {
        const resource = resourceByUid(assignment.resourceUid);
        if (!resource || resource.type !== 'Work') return;
        const units = assignmentUnits(assignment);
        if (units <= 0) return;
        dates.forEach((date) => {
          const key = `${resource.uid}:${date}`;
          if (!buckets.has(key)) {
            buckets.set(key, {
              resourceUid: Number(resource.uid),
              resourceName: resource.name || `Resource ${resource.uid}`,
              maxUnits: maxUnits(resource),
              date,
              units: 0,
              assignments: [],
            });
          }
          const bucket = buckets.get(key);
          bucket.units += units;
          bucket.assignments.push({ index, id: task.id, uid: task.uid, name: task.name, units });
        });
      });
    });

    const conflicts = [...buckets.values()]
      .filter((bucket) => bucket.units > bucket.maxUnits)
      .map((bucket) => ({ ...bucket, units: Math.round(bucket.units), overBy: Math.round(bucket.units - bucket.maxUnits) }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.resourceName).localeCompare(String(b.resourceName)));

    const taskConflicts = new Map();
    const resourceConflicts = new Map();
    conflicts.forEach((conflict) => {
      if (!resourceConflicts.has(conflict.resourceUid)) resourceConflicts.set(conflict.resourceUid, []);
      resourceConflicts.get(conflict.resourceUid).push(conflict);
      conflict.assignments.forEach((assignment) => {
        if (!taskConflicts.has(assignment.index)) taskConflicts.set(assignment.index, []);
        taskConflicts.get(assignment.index).push(conflict);
      });
    });

    return { buckets, conflicts, taskConflicts, resourceConflicts };
  }

  function runAutoLeveling() {
    let moved = 0;
    let passes = 0;
    const touched = new Set();
    let finalAnalysis = analyzeResourceLoad();

    while (finalAnalysis.conflicts.length && passes < MAX_PASSES) {
      passes += 1;
      const conflict = finalAnalysis.conflicts[0];
      const taskIndex = chooseTaskToMove(conflict);
      if (!Number.isInteger(taskIndex)) break;
      const task = state.tasks[taskIndex];
      if (!moveTaskOneWorkingDay(task)) break;
      touched.add(task.uid || task.id || taskIndex);
      moved += 1;
      finalAnalysis = analyzeResourceLoad();
    }

    state.resourceLevelingAudit = {
      version: VERSION,
      createdAt: new Date().toISOString(),
      passes,
      taskMoves: moved,
      tasksTouched: touched.size,
      remainingConflictDays: finalAnalysis.conflicts.length,
      remainingResources: new Set(finalAnalysis.conflicts.map((conflict) => conflict.resourceUid)).size,
      note: finalAnalysis.conflicts.length ? 'Stopped before all overallocations were resolved. Check fixed dates, dependency pressure, or max delay guard.' : 'All detected work-resource overallocations were resolved by moving lower-priority tasks later.',
    };

    status(finalAnalysis.conflicts.length
      ? `Leveling moved ${moved} task day${moved === 1 ? '' : 's'}, but ${finalAnalysis.conflicts.length} conflict day${finalAnalysis.conflicts.length === 1 ? '' : 's'} remain.`
      : `Leveling complete: moved ${moved} task day${moved === 1 ? '' : 's'} across ${touched.size} task${touched.size === 1 ? '' : 's'}.`);
    render();
  }

  function chooseTaskToMove(conflict) {
    const candidates = (conflict.assignments || [])
      .map((assignment) => ({ assignment, task: state.tasks?.[assignment.index] }))
      .filter(({ assignment, task }) => task && !isSummary(assignment.index) && durationMinutes(task) > 0 && levelingDelayDays(task) < MAX_TASK_DELAY_DAYS)
      .sort((a, b) => {
        const startCompare = String(b.task.start || '').localeCompare(String(a.task.start || ''));
        if (startCompare) return startCompare;
        return Number(b.task.id || 0) - Number(a.task.id || 0);
      });
    if (candidates.length <= 1) return null;
    return candidates[0].assignment.index;
  }

  function moveTaskOneWorkingDay(task) {
    if (!task) return false;
    const minutes = minutesPerDay();
    const currentStart = parseDate(task.start);
    if (!currentStart) return false;
    const nextStart = addWorkingDaysLocal(currentStart, 1);
    if (!nextStart) return false;
    const duration = durationMinutes(task) || minutes;
    if (typeof setTaskStartKeepDuration === 'function') setTaskStartKeepDuration(task, nextStart, duration);
    else {
      task.start = toDateInputValue(nextStart);
      task.finish = toDateInputValue(finishFromStart(nextStart, duration));
      task.durationMinutes = duration;
    }
    task.durationDays = typeof durationMinutesToWorkingDays === 'function' ? durationMinutesToWorkingDays(task.durationMinutes) : task.durationMinutes / minutes;
    task.levelingDelayMinutes = Math.max(0, Number(task.levelingDelayMinutes) || 0) + minutes;
    return true;
  }

  function renderResourceUsagePanel(analysis = analyzeResourceLoad()) {
    const workspace = document.getElementById('resourceWorkspace');
    const card = workspace?.querySelector('.resource-card');
    if (!card) return;
    let panel = document.getElementById('resourceUsagePanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'resourceUsagePanel';
      panel.className = 'resource-usage-panel';
      const sheet = card.querySelector('.resource-sheet-shell');
      card.insertBefore(panel, sheet || null);
    }

    const conflicts = analysis.conflicts.slice(0, 8);
    const resourceCount = new Set(analysis.conflicts.map((conflict) => conflict.resourceUid)).size;
    panel.innerHTML = `
      <div class="resource-usage-head">
        <strong>Resource Usage</strong>
        <span>${analysis.conflicts.length ? `${analysis.conflicts.length} conflict day${analysis.conflicts.length === 1 ? '' : 's'} · ${resourceCount} resource${resourceCount === 1 ? '' : 's'}` : 'No overallocations'}</span>
      </div>
      ${conflicts.length ? `<div class="resource-usage-list">${conflicts.map(resourceUsageRow).join('')}</div>` : '<p>No work resource is overallocated on working days.</p>'}
      ${state.resourceLevelingAudit ? `<small>${escapeHtml(state.resourceLevelingAudit.note || '')}</small>` : ''}`;
  }

  function resourceUsageRow(conflict) {
    const tasks = conflict.assignments.slice(0, 3).map((assignment) => `${assignment.id}. ${assignment.name}`).join(', ');
    return `<div class="resource-usage-row"><b>${escapeHtml(conflict.resourceName)}</b><span>${escapeHtml(conflict.date)} · ${conflict.units}% / ${conflict.maxUnits}%</span><small>${escapeHtml(tasks)}</small></div>`;
  }

  function decorateAutoLevelStatus() {
    const analysis = analyzeResourceLoad();
    const statusEl = document.getElementById('resourceLevelingStatus');
    if (statusEl) statusEl.textContent = summarizeAnalysis(analysis);
  }

  function summarizeAnalysis(analysis) {
    const resources = new Set(analysis.conflicts.map((conflict) => conflict.resourceUid)).size;
    return analysis.conflicts.length ? `${analysis.conflicts.length} conflict day${analysis.conflicts.length === 1 ? '' : 's'} · ${resources} resource${resources === 1 ? '' : 's'}` : 'No overallocations';
  }

  function workingDates(start, finish) {
    const s = parseDate(start);
    const f = parseDate(finish);
    if (!s || !f) return [];
    let cursor = s <= f ? s : f;
    const end = s <= f ? f : s;
    const dates = [];
    let guard = 0;
    while (cursor <= end && guard < 4000) {
      if (isWorkingDay(cursor)) dates.push(toDateInputValue(cursor));
      cursor = addCalendarDays(cursor, 1);
      guard += 1;
    }
    return dates.length ? dates : [toDateInputValue(s)];
  }

  function addWorkingDaysLocal(date, days) {
    let cursor = new Date(date.getTime());
    let remaining = Math.max(0, Number(days) || 0);
    let guard = 0;
    while (remaining > 0 && guard < 4000) {
      cursor = addCalendarDays(cursor, 1);
      if (isWorkingDay(cursor)) remaining -= 1;
      guard += 1;
    }
    return guard < 4000 ? cursor : null;
  }

  function finishFromStart(start, duration) {
    if (typeof finishFromStartByDuration === 'function') return finishFromStartByDuration(start, duration);
    const days = Math.max(1, Math.ceil(duration / minutesPerDay()));
    return addWorkingDaysLocal(start, Math.max(0, days - 1)) || start;
  }

  function assignmentUnits(assignment) {
    if (typeof normalizeAssignmentUnits === 'function') return normalizeAssignmentUnits(assignment.units);
    return Math.max(0, Number(assignment.units) || 0);
  }

  function maxUnits(resource) {
    if (typeof normalizeMaxUnits === 'function') return normalizeMaxUnits(resource.maxUnits);
    return Math.max(0, Number(resource.maxUnits) || 100);
  }

  function resourceByUid(uid) {
    if (typeof getResourceByUid === 'function') return getResourceByUid(uid);
    return (state.resources || []).find((resource) => Number(resource.uid) === Number(uid));
  }

  function isSummary(index) {
    try { return typeof isSummaryIndex === 'function' ? isSummaryIndex(index) : Boolean(state.tasks?.[index]?.isSummary); }
    catch { return Boolean(state.tasks?.[index]?.isSummary); }
  }

  function durationMinutes(task) {
    if (typeof normalizeDurationMinutes === 'function') return normalizeDurationMinutes(task.durationMinutes, 0);
    return Math.max(0, Number(task.durationMinutes) || 0);
  }

  function levelingDelayDays(task) {
    return (Number(task?.levelingDelayMinutes) || 0) / minutesPerDay();
  }

  function minutesPerDay() {
    return Math.max(1, Number(getCalendar()?.minutesPerDay) || 480);
  }

  function parseDate(value) {
    if (typeof dateOnly === 'function') return dateOnly(value);
    const date = new Date(`${String(value || '').slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  function addCalendarDays(date, days) {
    if (typeof addDays === 'function') return addDays(date, days);
    const next = new Date(date.getTime());
    next.setDate(next.getDate() + days);
    return next;
  }

  function status(message) {
    const saveStatus = document.getElementById('saveStatus');
    if (saveStatus) saveStatus.textContent = message;
  }

  function setVersionLabels() {
    const text = `${VERSION} · ${VERSION_NAME}`;
    const badge = document.getElementById('appVersionBadge');
    const footer = document.getElementById('appVersionFooter');
    const ribbon = document.getElementById('ribbonVersionText');
    const compat = document.getElementById('compatChip');
    if (badge) {
      badge.textContent = text;
      badge.title = `Build ${BUILD_DATE}`;
    }
    if (footer) footer.textContent = `${text} · Build ${BUILD_DATE}`;
    if (ribbon) ribbon.textContent = `${VERSION} · resource leveling`;
    if (compat && !compat.classList.contains('has-issues')) compat.lastChild.textContent = ' Resource leveling ready';
  }

  function installStyles() {
    if (document.getElementById('resourceAutoLevelingStyles')) return;
    const style = document.createElement('style');
    style.id = 'resourceAutoLevelingStyles';
    style.textContent = `
      #autoLevelResourcesBtn { font-weight: 900; }
      .resource-usage-panel { margin: 0 0 12px; padding: 12px; border: 1px solid #d9e2ee; border-radius: 14px; background: #f8fafc; display: grid; gap: 8px; }
      .resource-usage-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .resource-usage-head span { color: #475467; font-size: 12px; font-weight: 850; }
      .resource-usage-list { display: grid; gap: 6px; }
      .resource-usage-row { display: grid; grid-template-columns: minmax(140px,1fr) minmax(130px,auto) minmax(180px,2fr); gap: 8px; align-items: center; padding: 7px 9px; border: 1px solid #fed7aa; border-radius: 10px; background: #fff7ed; color: #9a3412; font-size: 12px; }
      .resource-usage-row b { color: #7c2d12; }
      .resource-usage-row small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function exposeSelfTest() {
    window.__resourceAutoLevelingSelfTest = () => {
      const saved = JSON.parse(JSON.stringify(state));
      try {
        state.resources = [{ uid: 1, id: 1, name: 'Chris', type: 'Work', initials: 'C', maxUnits: 100, standardRate: 0, overtimeRate: 0, costPerUse: 0, baseCalendar: 'Standard', notes: '' }];
        state.tasks = [
          { uid: 1, id: 1, name: 'Task A', start: '2026-07-06', finish: '2026-07-10', durationMinutes: 2400, durationDays: 5, percent: 0, predecessors: [], links: [], outlineLevel: 1, isSummary: false, expanded: true, assignments: [{ uid: 1, resourceUid: 1, units: 100, workMinutes: 2400 }] },
          { uid: 2, id: 2, name: 'Task B', start: '2026-07-06', finish: '2026-07-10', durationMinutes: 2400, durationDays: 5, percent: 0, predecessors: [], links: [], outlineLevel: 1, isSummary: false, expanded: true, assignments: [{ uid: 2, resourceUid: 1, units: 100, workMinutes: 2400 }] },
        ];
        const before = analyzeResourceLoad().conflicts.length;
        runAutoLeveling();
        const after = analyzeResourceLoad().conflicts.length;
        return { version: VERSION, before, after, moved: state.resourceLevelingAudit?.taskMoves || 0, passed: before > 0 && after === 0 };
      } finally {
        state = saved;
        render();
      }
    };
  }
})();
