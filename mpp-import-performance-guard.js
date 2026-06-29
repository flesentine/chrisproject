(() => {
  'use strict';

  const VERSION = 'v0.48.0';
  const MAX_SPAN_DAYS = 1460; // 4 years. Anything bigger is usually bad native MPP date decoding.
  const HUGE_DURATION_DAYS = 730;
  const COMPACT_TASK_DAY_STEP = 1;
  let tries = 0;
  let isCompacting = false;

  boot();
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : setTimeout(boot, 0);

  function ready() {
    return typeof state !== 'undefined' && Array.isArray(state.tasks) && typeof render === 'function' && typeof renderGantt === 'function';
  }

  function boot() {
    if (!ready()) {
      if (++tries < 220) setTimeout(boot, 75);
      return;
    }
    if (window.__mppImportPerformanceGuardLoaded === VERSION) return;
    window.__mppImportPerformanceGuardLoaded = VERSION;
    installStyles();
    patchRenderers();
    installCompactButtonHandler();
    guardNow('boot');
    mark('mpp-performance-guard-installed', { version: VERSION, maxSpanDays: MAX_SPAN_DAYS });
  }

  function patchRenderers() {
    if (window.__mppPerformanceRenderPatched === VERSION) return;
    window.__mppPerformanceRenderPatched = VERSION;

    const baseRender = render;
    render = function guardedRender(...args) {
      guardNow('render');
      return baseRender.apply(this, args);
    };
    window.render = render;

    const baseRenderGantt = renderGantt;
    renderGantt = function guardedRenderGantt(...args) {
      guardNow('renderGantt');
      return baseRenderGantt.apply(this, args);
    };
    window.renderGantt = renderGantt;
  }

  function guardNow(source = 'manual') {
    if (isCompacting || !ready()) return false;
    const tasks = state.tasks || [];
    if (!tasks.length) return false;
    if (state.__mppPerformanceGuardCompacted) return false;

    const analysis = analyzeSchedule(tasks);
    if (!analysis.shouldCompact) return false;

    isCompacting = true;
    try {
      compactImportedSchedule(tasks, analysis);
      state.__mppPerformanceGuardCompacted = {
        version: VERSION,
        source,
        originalSpanDays: analysis.spanDays,
        hugeDurationRows: analysis.hugeDurationRows,
        compactedAt: new Date().toISOString(),
      };
      try { if (typeof saveState === 'function') saveState(); } catch {}
      showCompactedNotice(analysis);
      mark('mpp-performance-guard-compacted', state.__mppPerformanceGuardCompacted);
      return true;
    } finally {
      isCompacting = false;
    }
  }

  function analyzeSchedule(tasks) {
    const starts = [];
    const finishes = [];
    let hugeDurationRows = 0;
    let suspiciousEpochRows = 0;
    let farFutureRows = 0;

    tasks.forEach((task) => {
      const start = parseDate(task.start);
      const finish = parseDate(task.finish);
      if (start) starts.push(start);
      if (finish) finishes.push(finish);
      const durationDays = Number(task.durationDays) || (start && finish ? daysBetween(start, finish) : 0);
      if (durationDays >= HUGE_DURATION_DAYS) hugeDurationRows += 1;
      if (start && start.getFullYear() <= 1985) suspiciousEpochRows += 1;
      if (finish && finish.getFullYear() >= 2045) farFutureRows += 1;
    });

    if (!starts.length || !finishes.length) return { shouldCompact: false, spanDays: 0, hugeDurationRows, suspiciousEpochRows, farFutureRows };

    const min = new Date(Math.min(...starts.map(Number)));
    const max = new Date(Math.max(...finishes.map(Number)));
    const spanDays = daysBetween(min, max);
    const rowCount = tasks.length;
    const badDurationRatio = hugeDurationRows / Math.max(1, rowCount);
    const badDateRatio = (suspiciousEpochRows + farFutureRows) / Math.max(1, rowCount * 2);

    const shouldCompact = spanDays > MAX_SPAN_DAYS ||
      badDurationRatio >= 0.2 ||
      (spanDays > 365 && badDateRatio >= 0.25);

    return { shouldCompact, spanDays, min, max, hugeDurationRows, suspiciousEpochRows, farFutureRows, rowCount };
  }

  function compactImportedSchedule(tasks, analysis) {
    const base = chooseBaseDate();
    const previous = tasks.map((task) => ({
      id: task.id,
      uid: task.uid,
      start: task.start || '',
      finish: task.finish || '',
      durationDays: task.durationDays,
      durationMinutes: task.durationMinutes,
    }));

    tasks.forEach((task, index) => {
      if (!task.__nativeMppOriginalDates) {
        task.__nativeMppOriginalDates = previous[index];
      }
      const start = addWorkingDays(base, index * COMPACT_TASK_DAY_STEP);
      const finish = start;
      task.start = iso(start);
      task.finish = iso(finish);
      task.durationMinutes = 480;
      task.durationDays = 1;
      task.isMilestone = false;
      task.__mppCompactedForPerformance = true;
      task.__mppCompactedReason = `Native MPP dates produced ${analysis.spanDays} days of timeline span.`;
    });

    // Best-effort rollup for obvious summary rows: make parent rows span their visible children.
    for (let i = tasks.length - 1; i >= 0; i -= 1) {
      const task = tasks[i];
      const level = Number(task.outlineLevel || 1);
      const childIndexes = [];
      for (let j = i + 1; j < tasks.length; j += 1) {
        const childLevel = Number(tasks[j].outlineLevel || 1);
        if (childLevel <= level) break;
        if (childLevel === level + 1) childIndexes.push(j);
      }
      if (!childIndexes.length) continue;
      const childStarts = childIndexes.map((idx) => parseDate(tasks[idx].start)).filter(Boolean);
      const childFinishes = childIndexes.map((idx) => parseDate(tasks[idx].finish)).filter(Boolean);
      if (!childStarts.length || !childFinishes.length) continue;
      const s = new Date(Math.min(...childStarts.map(Number)));
      const f = new Date(Math.max(...childFinishes.map(Number)));
      task.start = iso(s);
      task.finish = iso(f);
      task.durationMinutes = Math.max(480, workingDaysBetween(s, f) * 480);
      task.durationDays = Math.max(1, workingDaysBetween(s, f));
      task.isSummary = true;
    }
  }

  function showCompactedNotice(analysis) {
    const panel = document.getElementById('mppPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.classList.remove('mpp-busy');
    panel.classList.add('mpp-ok', 'mpp-performance-compacted');
    panel.innerHTML = `<strong>Imported MPP compacted for speed:</strong> The native MPP dates produced a ${Math.round(analysis.spanDays / 365)}-year timeline (${analysis.spanDays} days), so the app switched to a fast bounded view. Task names/order were preserved; suspicious native dates were stored internally but not rendered. <button type="button" data-mpp-performance-clear>Dismiss</button>`;
  }

  function installCompactButtonHandler() {
    if (window.__mppPerformanceButtonHandler) return;
    window.__mppPerformanceButtonHandler = true;
    document.addEventListener('click', (event) => {
      const compactButton = event.target?.closest?.('#compactImportedViewBtn, [data-compact-imported-view]');
      if (compactButton) {
        event.preventDefault();
        state.__mppPerformanceGuardCompacted = null;
        guardNow('compact-button');
        try { render(); } catch {}
        return;
      }
      const clearButton = event.target?.closest?.('[data-mpp-performance-clear]');
      if (!clearButton) return;
      const panel = document.getElementById('mppPanel');
      if (panel) panel.hidden = true;
    }, true);
  }

  function chooseBaseDate() {
    const start = parseDate(state.projectStart) || new Date();
    return nextWorkingDay(start);
  }

  function parseDate(value) {
    if (!value) return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    const text = String(value).slice(0, 10);
    const parts = text.split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function iso(date) {
    const d = parseDate(date) || new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function addWorkingDays(date, amount) {
    let d = nextWorkingDay(date);
    let remaining = Math.max(0, Number(amount) || 0);
    while (remaining > 0) {
      d.setDate(d.getDate() + 1);
      if (isWorkingDay(d)) remaining -= 1;
    }
    return d;
  }

  function nextWorkingDay(date) {
    const d = parseDate(date) || new Date();
    while (!isWorkingDay(d)) d.setDate(d.getDate() + 1);
    return d;
  }

  function isWorkingDay(date) {
    const day = date.getDay();
    return day !== 0 && day !== 6;
  }

  function daysBetween(start, finish) {
    const s = parseDate(start);
    const f = parseDate(finish);
    if (!s || !f) return 0;
    return Math.max(0, Math.round((f - s) / 86400000) + 1);
  }

  function workingDaysBetween(start, finish) {
    const s = parseDate(start);
    const f = parseDate(finish);
    if (!s || !f) return 1;
    let count = 0;
    const d = new Date(s);
    while (d <= f) {
      if (isWorkingDay(d)) count += 1;
      d.setDate(d.getDate() + 1);
    }
    return Math.max(1, count);
  }

  function installStyles() {
    if (document.getElementById('mppPerformanceGuardStyles')) return;
    const style = document.createElement('style');
    style.id = 'mppPerformanceGuardStyles';
    style.textContent = `
      .mpp-panel.mpp-performance-compacted {
        border-color: #99f6e4 !important;
        background: #ecfdf5 !important;
        color: #064e3b !important;
      }
      .mpp-panel.mpp-performance-compacted button {
        margin-left: 8px;
        border: 1px solid #0f766e;
        border-radius: 4px;
        background: #ffffff;
        color: #115e59;
        font-weight: 800;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function mark(type, data = {}) {
    try {
      const dbg = window.__mppDebug;
      if (dbg && Array.isArray(dbg.events)) {
        dbg.events.push({ t: `${Math.round(performance.now())}ms`, type, data });
        dbg.events = dbg.events.slice(-80);
        dbg.lastResult = data;
      }
      console.log('[MPP]', type, data);
    } catch {}
  }
})();
