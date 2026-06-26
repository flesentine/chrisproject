(() => {
  'use strict';

  let tries = 0;

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
    loadImportOrchestrator();
    requestAnimationFrame(afterRender);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();

  function patchRenderers() {
    const baseRender = render;
    render = function criticalPathCompatRender(...args) {
      const result = baseRender.apply(this, args);
      afterRender();
      return result;
    };
    window.render = render;

    const baseRenderGantt = renderGantt;
    renderGantt = function criticalPathCompatRenderGantt(...args) {
      const result = baseRenderGantt.apply(this, args);
      decorateRows();
      return result;
    };
    window.renderGantt = renderGantt;
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
})();
