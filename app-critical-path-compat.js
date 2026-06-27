(() => {
  'use strict';

  let tries = 0;

  loadMppWorkerImportNow();
  installMppImportCaptureGuard();

  function ready() {
    return typeof state !== 'undefined' && typeof render === 'function' && typeof renderGantt === 'function';
  }

  function boot() {
    if (window.__criticalPathCompatLoaded) return;
    if (!ready()) {
      if (++tries < 180) setTimeout(boot, 80);
      return;
    }
    window.__criticalPathCompatLoaded = true;
    installStyles();
    patchRenderers();
    loadNativeTaskSkeleton();
    loadMppWorkerImportNow();
    loadImportOrchestrator();
    requestAnimationFrame(afterRender);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();

  function loadMppWorkerImportNow() {
    loadScriptOnce('app-mpp-worker-import.js', 'mppWorkerImportDirectBoot');
    loadScriptOnce('app-current-version-label.js', 'currentVersionDirectBoot');
  }

  function loadScriptOnce(src, flag) {
    if (window[flag] || document.querySelector(`script[src="${src}"]`)) return;
    window[flag] = true;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.dataset.directBoot = '1';
    (document.body || document.head || document.documentElement).appendChild(script);
  }

  function installMppImportCaptureGuard() {
    if (window.__mppImportCaptureGuardInstalled) return;
    window.__mppImportCaptureGuardInstalled = true;
    document.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.id !== 'importMppInput') return;
      if (window.NativeMppReader?.__workerImportVersion) return;
      const file = input.files?.[0];
      if (!file) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      loadMppWorkerImportNow();
      showWorkerBootPanel(file);
      waitForWorkerThenImport(file);
    }, true);
  }

  function showWorkerBootPanel(file) {
    const panel = document.getElementById('mppPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.classList.remove('mpp-ok', 'mpp-warn');
    panel.classList.add('mpp-busy');
    panel.innerHTML = `<strong>MPP import starting:</strong> Loading the browser worker before opening <code>${escapeHtml(file.name || 'project.mpp')}</code>. This prevents Chrome from freezing on the main thread.`;
  }

  function waitForWorkerThenImport(file) {
    let attempts = 0;
    const tick = async () => {
      attempts += 1;
      if (window.NativeMppReader?.__workerImportVersion && typeof handlePickedFile === 'function') {
        try {
          await handlePickedFile(file);
        } catch (error) {
          const panel = document.getElementById('mppPanel');
          if (panel) {
            panel.hidden = false;
            panel.classList.add('mpp-warn');
            panel.innerHTML = `<strong>MPP import failed:</strong> ${escapeHtml(error?.message || error || 'Unknown error')}`;
          }
        }
        return;
      }
      if (attempts >= 80) {
        const panel = document.getElementById('mppPanel');
        if (panel) {
          panel.hidden = false;
          panel.classList.add('mpp-warn');
          panel.innerHTML = `<strong>MPP worker not ready:</strong> Hard refresh the page, then try the MPP again. The unsafe main-thread import was blocked so Chrome should not freeze.`;
        }
        return;
      }
      setTimeout(tick, 100);
    };
    setTimeout(tick, 50);
  }

  function patchRenderers() {
    const baseRender = render;
    render = function criticalPathCompatRender(...args) {
      clampUnsafeImportedDates();
      const result = baseRender.apply(this, args);
      afterRender();
      return result;
    };
    window.render = render;

    const baseRenderGantt = renderGantt;
    renderGantt = function criticalPathCompatRenderGantt(...args) {
      clampUnsafeImportedDates();
      const result = baseRenderGantt.apply(this, args);
      decorateRows();
      return result;
    };
    window.renderGantt = renderGantt;
  }

  function clampUnsafeImportedDates() {
    const tasks = state?.tasks || [];
    if (!tasks.length || state.__unsafeMppDateClampApplied) return;
    const dated = tasks.map((task) => ({ task, start: parseDate(task.start), finish: parseDate(task.finish) })).filter((row) => row.start && row.finish);
    if (dated.length < 3) return;
    const minStart = new Date(Math.min(...dated.map((row) => row.start.getTime())));
    const maxFinish = new Date(Math.max(...dated.map((row) => row.finish.getTime())));
    const spanDays = Math.max(0, Math.round((maxFinish - minStart) / 86400000) + 1);
    const base1984Rows = dated.filter((row) => row.start.getUTCFullYear() <= 1985).length;
    const hugeRows = dated.filter((row) => Math.round((row.finish - row.start) / 86400000) + 1 > 365).length;
    const falsePositive1984 = base1984Rows >= Math.max(3, Math.ceil(dated.length * 0.25)) && spanDays > 365 * 3;
    const giantDurations = hugeRows >= Math.max(3, Math.ceil(dated.length * 0.25));
    if (!falsePositive1984 && !giantDurations && spanDays <= 365 * 5) return;

    const safeStart = state.projectStart && parseDate(state.projectStart) ? state.projectStart : todayIso();
    tasks.forEach((task, index) => {
      const start = addDaysIso(safeStart, index);
      const duration = safeDuration(task);
      task.start = start;
      task.finish = addDaysIso(start, Math.max(0, duration - 1));
      task.durationDays = duration;
      task.durationMinutes = duration * (state.calendar?.minutesPerDay || 480);
      task.unsafeMppDateClamped = true;
    });
    state.projectStart = safeStart;
    state.__unsafeMppDateClampApplied = true;
    state.__unsafeMppDateClamp = { spanDays, base1984Rows, hugeRows, taskCount: tasks.length };
    showDateClampPanel(spanDays, base1984Rows, hugeRows);
    try { if (typeof save === 'function') save(); } catch {}
  }

  function showDateClampPanel(spanDays, base1984Rows, hugeRows) {
    const panel = document.getElementById('mppPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.classList.remove('mpp-ok');
    panel.classList.add('mpp-warn');
    panel.innerHTML = `<strong>MPP date safety:</strong> The import produced an unsafe ${spanDays}-day timeline with ${base1984Rows} task(s) starting near 1984 and ${hugeRows} giant duration(s). Dates were clamped to a safe draft schedule so the Gantt does not freeze. Task names, order, and WBS were preserved.`;
  }

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDaysIso(startIso, days) {
    const d = parseDate(startIso) || new Date();
    d.setUTCDate(d.getUTCDate() + Number(days || 0));
    return d.toISOString().slice(0, 10);
  }

  function safeDuration(task) {
    const raw = Number(task.durationDays);
    if (Number.isFinite(raw) && raw > 0 && raw <= 30) return Math.round(raw);
    return 1;
  }

  function afterRender() {
    decorateRows();
    restoreVersionLabels();
    renderCriticalSummary();
  }

  function decorateRows() {
    document.querySelectorAll('.planner-row[data-row-index]').forEach((row) => {
      const task = state.tasks?.[Number(row.dataset.rowIndex)];
      if (!task) return;

      const critical = Boolean(task.isCritical || task.critical);
      const totalSlack = Math.max(0, Math.round(Number(task.totalSlackDays) || 0));
      const freeSlack = Math.max(0, Math.round(Number(task.freeSlackDays) || 0));

      row.classList.toggle('is-critical-task', critical);
      decorateNameCell(row, critical, totalSlack, freeSlack);
      decorateGanttBar(row, task, critical, totalSlack, freeSlack);
      decorateSlackBar(row, task, critical, totalSlack);
    });
  }

  function decorateNameCell(row, critical, totalSlack, freeSlack) {
    const cell = row.querySelector('.task-name-cell');
    if (!cell) return;
    let badge = cell.querySelector('.critical-slack-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'critical-slack-badge';
      cell.appendChild(badge);
    }
    badge.classList.toggle('is-critical', critical);
    badge.textContent = critical ? 'Critical' : `Slack ${totalSlack}d`;
    badge.title = critical ? 'Critical task: zero total slack.' : `Total slack ${totalSlack}d · Free slack ${freeSlack}d.`;
  }

  function decorateGanttBar(row, task, critical, totalSlack, freeSlack) {
    const bar = row.querySelector('.gantt-bar');
    if (!bar) return;
    bar.classList.toggle('is-critical', critical);
    if (!bar.dataset.baseTitle) bar.dataset.baseTitle = cleanBarTitle(bar.title || task.name || 'Task');
    bar.title = critical
      ? `${bar.dataset.baseTitle} · Critical path`
      : `${bar.dataset.baseTitle} · Total slack ${totalSlack}d · Free slack ${freeSlack}d`;
  }

  function decorateSlackBar(row, task, critical, totalSlack) {
    const gantt = row.querySelector('.gantt-row');
    if (!gantt) return;
    let slack = gantt.querySelector('.gantt-slack-bar');
    if (critical || totalSlack <= 0) {
      slack?.remove();
      return;
    }
    if (!slack) {
      slack = document.createElement('div');
      slack.className = 'gantt-slack-bar';
      gantt.appendChild(slack);
    }
    const dayWidth = safeDayWidth();
    const bar = row.querySelector('.gantt-bar');
    const left = parseFloat(bar?.style?.left || '0') || 0;
    const width = parseFloat(bar?.style?.width || '0') || 0;
    slack.style.left = `${left + width + 6}px`;
    slack.style.width = `${Math.max(24, totalSlack * dayWidth - 8)}px`;
    slack.dataset.slackLabel = `${totalSlack}d`;
    slack.title = `${task.name || 'Task'}: ${totalSlack}d total slack.`;
  }

  function safeDayWidth() {
    const prefs = typeof uiPrefs !== 'undefined' ? uiPrefs : null;
    return Number(prefs?.dayWidth) || 58;
  }

  function cleanBarTitle(value) {
    return String(value || 'Task')
      .replace(/ · Critical path/g, '')
      .replace(/ · Total slack \d+d · Free slack \d+d/g, '')
      .trim() || 'Task';
  }

  function renderCriticalSummary() {
    const leafTasks = (state.tasks || []).filter((task, index) => task && !isSummaryTask(index));
    const criticalTasks = leafTasks.filter((task) => task.isCritical || task.critical);
    const floatingTasks = leafTasks.filter((task) => !(task.isCritical || task.critical) && Number(task.totalSlackDays) > 0);
    const count = document.getElementById('criticalTaskCount');
    const summary = document.getElementById('criticalTaskSummary');
    if (count) count.textContent = String(criticalTasks.length);
    if (summary) {
      summary.textContent = state.criticalPath?.hasCycle
        ? 'Fix dependency cycle'
        : `${state.criticalPath?.projectFinish ? `Finish ${state.criticalPath.projectFinish}` : 'Critical path ready'} · ${floatingTasks.length} with float`;
    }
  }

  function isSummaryTask(index) {
    try {
      return typeof isSummaryIndex === 'function' ? isSummaryIndex(index) : Boolean(state.tasks?.[index]?.isSummary);
    } catch {
      return Boolean(state.tasks?.[index]?.isSummary);
    }
  }

  function restoreVersionLabels() {
    const app = typeof APP_VERSION !== 'undefined' ? APP_VERSION : 'v0.39.0';
    const name = typeof APP_VERSION_NAME !== 'undefined' ? APP_VERSION_NAME : 'Project XML + split/repeat';
    const build = typeof APP_BUILD_DATE !== 'undefined' ? APP_BUILD_DATE : '';
    const badge = document.getElementById('appVersionBadge');
    const footer = document.getElementById('appVersionFooter');
    const ribbon = document.getElementById('ribbonVersionText');
    if (badge) {
      badge.textContent = `${app} · ${name}`;
      if (build) badge.title = `Build ${build}`;
    }
    if (footer) footer.textContent = `${app} · ${name}${build ? ` · Build ${build}` : ''}`;
    if (ribbon) ribbon.textContent = `${app} · critical path active`;
  }

  function loadNativeTaskSkeleton() {
    if (window.__nativeTaskSkeletonAutoLoad) return;
    window.__nativeTaskSkeletonAutoLoad = true;
    const script = document.createElement('script');
    script.src = 'mpp-native-task-skeleton-polish.js';
    script.defer = true;
    document.body.appendChild(script);
  }

  function loadImportOrchestrator() {
    if (window.__mppImportOrchestratorAutoLoad) return;
    window.__mppImportOrchestratorAutoLoad = true;
    const script = document.createElement('script');
    script.src = 'app-mpp-import-orchestrator.js';
    script.defer = true;
    document.body.appendChild(script);
  }

  function installStyles() {
    if (document.getElementById('criticalPathCompatStyles')) return;
    const style = document.createElement('style');
    style.id = 'criticalPathCompatStyles';
    style.textContent = `
      .planner-row.is-critical-task .planner-fields { box-shadow: inset 4px 0 0 #dc2626 !important; }
      .planner-row.is-critical-task .name-input { font-weight: 900 !important; }
      .gantt-bar.is-critical { background: linear-gradient(135deg,#dc2626,#991b1b) !important; box-shadow: 0 14px 30px rgba(220,38,38,.28),0 0 0 1px rgba(255,255,255,.46) inset !important; }
      .critical-slack-badge { display: inline-flex; align-items: center; min-height: 18px; margin-left: 6px; padding: 1px 7px; border-radius: 999px; border: 1px solid #d9e2ee; background: #f8fafc; color: #475467; font-size: 10px; font-weight: 850; white-space: nowrap; }
      .critical-slack-badge.is-critical { border-color: rgba(220,38,38,.24); background: #fee2e2; color: #991b1b; }
      .gantt-slack-bar { position: absolute; top: calc(var(--bar-top) + var(--bar-height)/2 - 2px); height: 4px; border-radius: 999px; background: repeating-linear-gradient(90deg,rgba(71,84,103,.56) 0 8px,transparent 8px 13px); pointer-events: none; z-index: 2; }
      .gantt-slack-bar::after { content: attr(data-slack-label); position: absolute; left: 50%; top: -18px; transform: translateX(-50%); padding: 1px 6px; border: 1px solid #d9e2ee; border-radius: 999px; background: rgba(255,255,255,.96); color: #475467; font-size: 9px; font-weight: 850; white-space: nowrap; }
    `;
    document.head.appendChild(style);
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
})();
