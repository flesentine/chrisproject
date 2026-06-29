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
    loadScriptOnce('app-current-version-label.js?v0.64.0', 'currentVersionDirectBoot');
    loadScriptOnce('ms-project-layout-sweep.js?v0.43.2', 'msProjectLayoutSweepDirectBoot');
    loadScriptOnce('ms-project-pane-controls.js?v0.44.2', 'msProjectPaneControlsDirectBoot');
    loadScriptOnce('ms-project-ribbon-menu-fix.js?v0.45.0', 'msProjectRibbonMenuFixDirectBoot');
    loadScriptOnce('ms-project-zoom-fit.js?v0.46.0', 'msProjectZoomFitDirectBoot');
    loadScriptOnce('mpp-import-unstick-guard.js?v0.47.0', 'mppImportUnstickGuardDirectBoot');
    loadScriptOnce('mpp-import-performance-guard.js?v0.48.1', 'mppImportPerformanceGuardDirectBoot');
    loadScriptOnce('ms-project-status-strip.js?v0.49.0', 'msProjectStatusStripDirectBoot');
  }

  function loadScriptOnce(src, flag) {
    if (window[flag] || [...document.scripts].some((script) => script.src.includes(src))) return;
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

  function loadNativeTaskSkeleton() {
    loadScriptOnce('app-native-task-skeleton.js', 'nativeTaskSkeletonDirectBoot');
  }

  function loadImportOrchestrator() {
    loadScriptOnce('app-mpp-import-orchestrator.js', 'mppImportOrchestratorDirectBoot');
  }

  function installStyles() {
    if (document.getElementById('criticalPathCompatStyles')) return;
    const style = document.createElement('style');
    style.id = 'criticalPathCompatStyles';
    style.textContent = `
      .planner-row.is-critical-task .task-name-input,
      .planner-row.is-critical-task .gantt-bar,
      .planner-row.has-critical-path .gantt-bar { border-color: #dc2626 !important; }
      .planner-row.is-critical-task .gantt-bar,
      .planner-row.has-critical-path .gantt-bar { background: linear-gradient(135deg, #dc2626, #ef4444) !important; }
      .planner-row.is-critical-task .summary-bar,
      .planner-row.has-critical-path .summary-bar { background: #7f1d1d !important; }
    `;
    document.head.appendChild(style);
  }

  function clampUnsafeImportedDates() {
    if (!Array.isArray(window.state?.tasks)) return;
    const safeMin = new Date('1984-01-01T00:00:00');
    const safeMax = new Date('2099-12-31T00:00:00');
    state.tasks.forEach((task) => {
      ['start', 'finish', 'actualStart', 'actualFinish', 'baselineStart', 'baselineFinish'].forEach((field) => {
        const value = task[field];
        if (!value) return;
        const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
        if (Number.isNaN(date.getTime()) || date < safeMin || date > safeMax) task[field] = '';
      });
      if (!task.start) task.start = state.projectStart || new Date().toISOString().slice(0, 10);
      if (!task.finish) task.finish = task.start;
    });
  }

  function afterRender() {
    decorateRows();
  }

  function decorateRows() {
    if (!Array.isArray(window.state?.tasks)) return;
    document.querySelectorAll('.planner-row[data-row-index]').forEach((row) => {
      const index = Number(row.dataset.rowIndex);
      const task = state.tasks[index];
      if (!task) return;
      const isCritical = Boolean(task.isCritical || task.critical || Number(task.totalSlackMinutes) <= 0 || Number(task.totalSlack) <= 0);
      row.classList.toggle('is-critical-task', isCritical);
      row.classList.toggle('has-critical-path', isCritical);
    });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[char]));
  }
})();
