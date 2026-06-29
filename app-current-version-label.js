(() => {
  'use strict';

  const CURRENT_VERSION = 'v0.61.0';
  const CURRENT_NAME = 'Project Entry table default';
  const CURRENT_BUILD = '2026-06-27';
  const FOOTER_TEXT = `${CURRENT_VERSION} · ${CURRENT_NAME} · Build ${CURRENT_BUILD}`;
  const BADGE_TEXT = `${CURRENT_VERSION} · ${CURRENT_NAME}`;
  const RIBBON_TEXT = `${CURRENT_VERSION} · Gantt Chart / Entry table`;

  if (window.__currentVersionLabelLoaded) return;
  window.__currentVersionLabelLoaded = true;

  let lastLayoutSignature = '';
  let lastDiagnosticSignature = '';
  let nonMppGuardInstalled = false;

  function applyVersionLabel() {
    const badge = document.getElementById('appVersionBadge');
    const footer = document.getElementById('appVersionFooter');
    const ribbon = document.getElementById('ribbonVersionText');
    if (badge) {
      badge.textContent = BADGE_TEXT;
      badge.title = `Build ${CURRENT_BUILD}: Project-style Entry table by default; extra fields stay hidden until a table/view asks for them.`;
    }
    if (footer) footer.textContent = FOOTER_TEXT;
    if (ribbon) ribbon.textContent = RIBBON_TEXT;
  }

  function fixMppPicker() {
    const input = document.getElementById('importMppInput');
    if (!input) return;
    input.removeAttribute('accept');
    input.accept = '';
    input.disabled = false;
    input.title = 'Choose a local .mpp file. The app checks the extension after selection.';
    const label = input.closest('.file-button');
    if (label) label.title = input.title;
  }

  function installNonMppGuard() {
    if (nonMppGuardInstalled) return;
    nonMppGuardInstalled = true;
    document.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.id !== 'importMppInput') return;
      const file = input.files && input.files[0];
      if (!file) return;
      if (/\.mpp$/i.test(file.name || '')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      showMppWarning(`That is not an MPP file: ${file.name || 'selected file'}. Choose a .mpp file, or use Project XML import for .xml files.`);
      mark('mpp-non-mpp-file-ignored', { name: file.name || '', size: file.size || 0, type: file.type || '' });
    }, true);
  }

  function showMppWarning(message) {
    const panel = document.getElementById('mppPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.classList.remove('mpp-ok', 'mpp-busy');
    panel.classList.add('mpp-warn');
    panel.textContent = message;
  }

  function getMppEvents() {
    const events = window.__mppDebug?.events;
    return Array.isArray(events) ? events : [];
  }

  function getLastRealMppImportEvent() {
    const events = getMppEvents();
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (events[i]?.type === 'live-safe-xml-filter-applied') return events[i];
    }
    return null;
  }

  function getImportSignature() {
    const event = getLastRealMppImportEvent();
    if (!event) return '';
    const data = event.data || {};
    return `${event.t || ''}:${data.generatedXmlTaskCount || data.kept || ''}:${data.firstTask || ''}:${data.lastTask || ''}`;
  }

  function getStateTasks() {
    try { return Array.isArray(state?.tasks) ? state.tasks : []; } catch { return []; }
  }

  function projectStyleEntrySplitOnce() {
    try {
      const signature = getImportSignature();
      if (!signature || lastLayoutSignature === signature) return;
      const columns = typeof FIELD_COLUMNS !== 'undefined' ? FIELD_COLUMNS : window.FIELD_COLUMNS;
      if (typeof uiPrefs === 'undefined' || !Array.isArray(columns)) return;
      const map = new Map(columns.map((column) => [column.key, column]));
      const widths = uiPrefs.fieldColumns || {};
      const widthOf = (key) => Number(widths[key]) || Number(map.get(key)?.defaultWidth) || 0;
      const entryKeys = typeof window.getVisibleFieldKeys === 'function'
        ? window.getVisibleFieldKeys()
        : ['id', 'indicators', 'name', 'duration', 'start', 'finish', 'predecessors', 'actions'];
      const entryWidth = entryKeys.reduce((sum, key) => sum + widthOf(key), 0);
      const viewport = Math.max(720, Math.round(window.innerWidth * 0.52));
      const wanted = Math.max(640, Math.min(entryWidth, viewport));
      uiPrefs.fieldPaneWidth = wanted;
      if (typeof saveUiPrefs === 'function') saveUiPrefs();
      if (typeof applyUiPrefs === 'function') applyUiPrefs();
      const scroll = document.querySelector('.planner-scroll');
      if (scroll) {
        scroll.scrollTop = 0;
        scroll.scrollLeft = 0;
      }
      lastLayoutSignature = signature;
      mark('mpp-project-style-entry-split', { fieldPaneWidth: wanted, entryWidth, visibleFieldKeys: entryKeys, taskCount: getStateTasks().length, oncePerImport: true });
    } catch {}
  }

  function postRenderMppCountDiagnostic() {
    try {
      if (!getLastRealMppImportEvent()) return;
      const tasks = getStateTasks();
      const names = tasks.map((task) => String(task?.name || '').trim());
      const junkRows = names.filter((name) => /^no\s+program\s+baseline\s+date$/i.test(name) || /^task\s+\d+$/i.test(name) || /^recovered\s+task\s+\d+$/i.test(name));
      const rows = [...document.querySelectorAll('.planner-row[data-row-index]')];
      const visibleRows = rows.length;
      const indexes = rows.map((row) => Number(row.dataset.rowIndex)).filter(Number.isFinite);
      const minVisibleIndex = indexes.length ? Math.min(...indexes) : -1;
      const maxVisibleIndex = indexes.length ? Math.max(...indexes) : -1;
      const scroll = document.querySelector('.planner-scroll');
      const data = {
        stateTaskCount: tasks.length,
        visiblePlannerRows: visibleRows,
        minVisibleRowIndex: minVisibleIndex,
        maxVisibleRowIndex: maxVisibleIndex,
        scrollTop: scroll?.scrollTop || 0,
        scrollHeight: scroll?.scrollHeight || 0,
        clientHeight: scroll?.clientHeight || 0,
        visibleFieldKeys: typeof window.getVisibleFieldKeys === 'function' ? window.getVisibleFieldKeys() : [],
        firstNames: names.slice(0, 10),
        lastNames: names.slice(-25),
        junkRowsStillPresent: junkRows.slice(0, 25),
      };
      const signature = JSON.stringify({
        stateTaskCount: data.stateTaskCount,
        minVisibleRowIndex: data.minVisibleRowIndex,
        maxVisibleRowIndex: data.maxVisibleRowIndex,
        scrollTop: data.scrollTop,
        fields: data.visibleFieldKeys.join(','),
        junk: data.junkRowsStillPresent.length,
        last: data.lastNames.slice(-3),
      });
      if (signature === lastDiagnosticSignature) return;
      lastDiagnosticSignature = signature;
      mark('mpp-post-render-state-count', data);
    } catch {}
  }

  function mark(type, data) {
    try {
      const dbg = window.__mppDebug;
      if (dbg?.events) {
        dbg.events.push({ t: `${Math.round(performance.now())}ms`, type, data: data || {} });
        dbg.events = dbg.events.slice(-80);
        dbg.lastResult = data || dbg.lastResult;
      }
      console.log('[MPP]', type, data || {});
    } catch {}
  }

  function loadScriptOnce(src, flag, attrName) {
    if (window[flag] || document.querySelector(`script[src="${src}"]`)) return;
    window[flag] = true;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    if (attrName) script.dataset[attrName] = '1';
    (document.body || document.head || document.documentElement).appendChild(script);
  }

  function loadProjectEntryTable() {
    loadScriptOnce('app-project-entry-table.js', '__projectEntryTableScriptLoaded', 'projectEntryTable');
  }

  function loadLiveMppCleanup() {
    loadProjectEntryTable();
    loadScriptOnce('mpp-live-safe-xml-filter.js', '__liveMppSafeXmlFilterScriptLoaded', 'liveMppCleanup');
    loadScriptOnce('app-safe-live-mpp-state-cleanup.js', '__safeLiveMppStateCleanupScriptLoaded', 'surgicalMppCleanup');
  }

  function afterRenderMppLayout() {
    projectStyleEntrySplitOnce();
    postRenderMppCountDiagnostic();
  }

  function patchRender() {
    if (window.__currentVersionRenderPatched || typeof render !== 'function') return;
    window.__currentVersionRenderPatched = true;
    const base = render;
    render = function currentVersionRender(...args) {
      const result = base.apply(this, args);
      setTimeout(applyVersionLabel, 0);
      setTimeout(fixMppPicker, 0);
      setTimeout(afterRenderMppLayout, 0);
      setTimeout(afterRenderMppLayout, 150);
      setTimeout(afterRenderMppLayout, 500);
      return result;
    };
    window.render = render;
  }

  function boot() {
    loadProjectEntryTable();
    loadLiveMppCleanup();
    installNonMppGuard();
    fixMppPicker();
    applyVersionLabel();
    patchRender();
    setTimeout(loadProjectEntryTable, 150);
    setTimeout(loadLiveMppCleanup, 250);
    setTimeout(loadLiveMppCleanup, 1000);
    [100, 250, 750, 1500, 3000].forEach((delay) => setTimeout(fixMppPicker, delay));
    [700, 1500, 3000, 5000].forEach((delay) => setTimeout(afterRenderMppLayout, delay));
    setTimeout(applyVersionLabel, 250);
    setTimeout(applyVersionLabel, 1000);
    setTimeout(applyVersionLabel, 2500);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
})();