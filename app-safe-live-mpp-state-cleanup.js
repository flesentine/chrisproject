(() => {
  'use strict';

  const VERSION = '0.1.0-safe-live-mpp-state-cleanup';
  let tries = 0;

  function ready() {
    return typeof state !== 'undefined' && typeof render === 'function';
  }

  function boot() {
    if (window.__safeLiveMppStateCleanupLoaded) return;
    if (!ready()) {
      if (++tries < 120) setTimeout(boot, 100);
      return;
    }
    window.__safeLiveMppStateCleanupLoaded = true;
    patchRender();
    setInterval(cleanIfNeeded, 750);
    cleanIfNeeded();
    log('safe-live-mpp-state-cleanup-installed', { version: VERSION });
  }

  function patchRender() {
    if (window.__safeLiveMppStateCleanupRenderPatched) return;
    window.__safeLiveMppStateCleanupRenderPatched = true;
    const base = render;
    render = function safeLiveMppCleanupRender(...args) {
      cleanIfNeeded();
      return base.apply(this, args);
    };
    window.render = render;
  }

  function cleanIfNeeded() {
    if (!state || !Array.isArray(state.tasks) || !state.tasks.length) return;
    if (!isSafeLiveMppState()) return;
    if (state.__safeLiveMppStateCleanupApplied) return;

    const before = state.tasks.length;
    const kept = [];
    const droppedNames = [];

    for (const task of state.tasks) {
      const name = cleanName(task?.name);
      if (isPseudoTaskName(name)) {
        droppedNames.push(name || '(blank)');
        continue;
      }
      kept.push({ ...task, name });
    }

    if (!kept.length) return;

    const start = nextWorkingIso(new Date());
    const minutesPerDay = Number(state.calendar?.minutesPerDay) || 480;
    kept.forEach((task, index) => {
      const day = workingDateForIndex(start, index);
      task.id = index + 1;
      task.uid = task.uid || index + 1;
      task.start = day;
      task.finish = day;
      task.durationDays = 1;
      task.durationMinutes = minutesPerDay;
      task.unsafeMppDateClamped = true;
      task.safeLiveMppCleaned = true;
      task.predecessors = Array.isArray(task.predecessors) ? task.predecessors : [];
      task.links = Array.isArray(task.links) ? task.links : [];
      task.wbs = task.wbs || String(index + 1);
      task.outlineLevel = Math.max(1, Math.min(20, Number(task.outlineLevel) || 1));
    });

    state.tasks = kept;
    state.projectStart = start;
    state.nextUid = Math.max(Number(state.nextUid) || 1, kept.length + 1);
    state.__safeLiveMppStateCleanupApplied = true;
    state.__safeLiveMppStateCleanup = {
      version: VERSION,
      before,
      after: kept.length,
      dropped: before - kept.length,
      droppedNames: droppedNames.slice(0, 25),
      startDate: start,
    };

    try { if (typeof save === 'function') save(); } catch {}
    showPanel(before, kept.length, droppedNames, start);
    log('safe-live-mpp-state-cleanup-applied', state.__safeLiveMppStateCleanup);

    setTimeout(() => {
      try { if (typeof render === 'function') render(); } catch {}
    }, 0);
  }

  function isSafeLiveMppState() {
    if (state.__safeLiveMppImport) return true;
    if (state.__unsafeMppDateClampApplied) return true;
    if (state.tasks?.some((task) => task?.unsafeMppDateClamped || task?.recovered)) return true;
    return false;
  }

  function isPseudoTaskName(name) {
    const n = cleanName(name);
    if (!n || n.length < 3) return true;
    const lower = n.toLowerCase();
    if (lower === 'no program baseline date') return true;
    if (/^no\s+.*baseline.*date$/i.test(n)) return true;
    if (/baseline/i.test(n) && /(date|start|finish|duration|cost|work|variance)/i.test(n)) return true;
    if (/^(baseline|baseline date|program baseline|program baseline date)$/i.test(n)) return true;
    if (/^(task name|resource name|start|finish|duration|work|cost|calendar|notes|predecessors|successors)$/i.test(n)) return true;
    if (/^(yes|no|none|null|true|false)$/i.test(n)) return true;
    if (/^\d+(?:\.\d+)?$/.test(n)) return true;
    if (!/[A-Za-z\p{L}]/u.test(n)) return true;
    return false;
  }

  function showPanel(before, after, droppedNames, start) {
    const panel = document.getElementById('mppPanel');
    if (!panel) return;
    const dropped = before - after;
    panel.hidden = false;
    panel.classList.remove('mpp-busy', 'mpp-warn');
    panel.classList.add('mpp-ok');
    const sample = droppedNames.length ? ` Dropped examples: ${escapeHtml(droppedNames.slice(0, 3).join(', '))}.` : '';
    panel.innerHTML = `<strong>MPP safe draft cleaned:</strong> Loaded ${after} task${after === 1 ? '' : 's'} from the MPP. Removed ${dropped} non-task field row${dropped === 1 ? '' : 's'} and rebuilt dates from ${escapeHtml(start)} using working days only.${sample}`;
  }

  function nextWorkingIso(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    while (!isWorkingDay(d)) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function workingDateForIndex(startIso, index) {
    const d = new Date(`${startIso}T00:00:00Z`);
    let remaining = Number(index || 0);
    while (remaining > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (isWorkingDay(d)) remaining -= 1;
    }
    return d.toISOString().slice(0, 10);
  }

  function isWorkingDay(d) {
    const day = d.getUTCDay();
    return day >= 1 && day <= 5;
  }

  function cleanName(value) {
    return String(value || '').replace(/\.mpp$/i, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  }

  function log(type, data) {
    try {
      const dbg = window.__mppDebug;
      if (dbg?.events) {
        const item = { t: `${Math.round(performance.now())}ms`, type, data: data || {} };
        dbg.events.push(item);
        dbg.events = dbg.events.slice(-80);
        dbg.lastResult = data || dbg.lastResult;
      }
      console.log('[MPP]', type, data || {});
    } catch {}
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
})();
