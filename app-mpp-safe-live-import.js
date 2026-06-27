(() => {
  'use strict';

  if (window.__safeLiveMppImportLoaded) return;
  window.__safeLiveMppImportLoaded = true;

  const MAX_LIVE_TASKS = 250;
  const HARD_UI_BUDGET_MS = 15000;

  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.id !== 'importMppInput') return;
    const file = input.files?.[0];
    if (!file) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    input.value = '';
    openMppSafely(file);
  }, true);

  async function openMppSafely(file) {
    const startedAt = Date.now();
    showPanel('busy', 'MPP quick open', `Opening <code>${esc(file.name || 'project.mpp')}</code> safely. The current project will not be replaced unless a bounded draft can be built.`);
    if (!window.NativeMppReader?.read) {
      showPanel('warn', 'MPP unavailable', 'The browser MPP reader is not ready. Use Project XML for this file.');
      return;
    }
    try {
      const result = await withBudget(window.NativeMppReader.read(file), HARD_UI_BUDGET_MS);
      window.__lastSafeMppResult = result;
      const snapshot = buildSafeSnapshot(result, file);
      if (!snapshot.tasks.length) {
        const streams = result?.streams?.length || 0;
        showPanel('warn', 'MPP opened, no schedule loaded', `Opened the MPP container and found ${streams} stream${streams === 1 ? '' : 's'}, but did not recover safe task rows quickly. The current project was left alone. Try Project XML export for this file.`);
        return;
      }
      state = snapshot;
      if (typeof render === 'function') render();
      const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      showPanel('ok', 'MPP safe draft loaded', `Loaded ${snapshot.tasks.length} task${snapshot.tasks.length === 1 ? '' : 's'} from <code>${esc(file.name || 'project.mpp')}</code> in ${elapsed}s using safe live mode. Dates are bounded draft dates so the Gantt cannot hang. Review before relying on it.`);
      try { if (typeof save === 'function') save(); } catch {}
    } catch (error) {
      showPanel('warn', 'MPP quick open stopped', `${esc(error?.message || error || 'The MPP did not quick-open.')} The current project was left alone.`);
    }
  }

  function withBudget(promise, timeoutMs) {
    let timer = null;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`This MPP did not quick-open within ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  function buildSafeSnapshot(result, file) {
    const rawTasks = Array.isArray(result?.project?.tasks) && result.project.tasks.length
      ? result.project.tasks
      : Array.isArray(result?.draftProject?.tasks) ? result.draftProject.tasks : [];
    const picked = rawTasks.slice(0, MAX_LIVE_TASKS);
    const projectStart = todayIso();
    const minutesPerDay = 480;
    const tasks = picked.map((task, index) => {
      const duration = safeDuration(task);
      const start = addDaysIso(projectStart, index);
      const finish = addDaysIso(start, duration - 1);
      return {
        uid: index + 1,
        id: index + 1,
        name: cleanName(task.name) || `MPP task ${index + 1}`,
        start,
        finish,
        durationDays: duration,
        durationMinutes: duration * minutesPerDay,
        percent: safePercent(task.percent ?? task.percentComplete),
        predecessors: [],
        links: [],
        outlineLevel: Math.max(1, Math.min(20, Number(task.outlineLevel) || 1)),
        wbs: task.wbs || String(index + 1),
        recovered: true,
        unsafeMppDateClamped: true,
      };
    });
    return {
      projectName: cleanName(result?.project?.name || result?.draftProject?.name || file?.name || 'Recovered MPP'),
      projectStart,
      nextUid: tasks.length + 1,
      nextResourceUid: 1,
      nextAssignmentUid: 1,
      baselineSetAt: '',
      activeView: 'schedule',
      calendar: typeof normalizeCalendar === 'function' ? normalizeCalendar({}) : { name: 'Standard', workingDays: [1,2,3,4,5], exceptions: [], minutesPerDay, defaultStartTime: '08:00:00', defaultFinishTime: '17:00:00' },
      tasks,
      resources: [],
      __safeLiveMppImport: true,
    };
  }

  function showPanel(tone, label, html) {
    const panel = document.getElementById('mppPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.classList.remove('mpp-ok', 'mpp-warn', 'mpp-busy');
    if (tone === 'ok') panel.classList.add('mpp-ok');
    if (tone === 'warn') panel.classList.add('mpp-warn');
    if (tone === 'busy') panel.classList.add('mpp-busy');
    panel.innerHTML = `<strong>${esc(label)}:</strong> ${html}`;
  }

  function cleanName(value) {
    return String(value || '').replace(/\.mpp$/i, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  }

  function safeDuration(task) {
    const n = Number(task?.durationDays);
    if (Number.isFinite(n) && n > 0 && n <= 15) return Math.round(n);
    return 1;
  }

  function safePercent(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }

  function todayIso() { return new Date().toISOString().slice(0, 10); }

  function addDaysIso(startIso, days) {
    const d = new Date(`${startIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + Number(days || 0));
    return d.toISOString().slice(0, 10);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
})();
