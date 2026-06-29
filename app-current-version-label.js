(() => {
  'use strict';

  const VERSION = 'v0.63.0';
  const NAME = 'No stale first-load version';
  const BUILD = '2026-06-27';
  const BADGE = `${VERSION} · ${NAME}`;
  const FOOTER = `${VERSION} · ${NAME} · Build ${BUILD}`;
  const RIBBON = `${VERSION} · Entry / Tracking tables`;

  if (window.__currentVersionLabelLoaded === VERSION) return;
  window.__currentVersionLabelLoaded = VERSION;

  let nonMppGuardInstalled = false;
  let renderPatched = false;
  let lastDiagnostic = '';
  let lastLayoutSignature = '';

  applyVersionLabel();
  hideOldVersionText();
  boot();
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : setTimeout(boot, 0);

  function boot() {
    applyVersionLabel();
    hideOldVersionText();
    installVersionLock();
    fixMppPicker();
    installNonMppGuard();
    loadMppHelpers();
    patchRender();
    [50, 150, 400, 900, 1800, 3500].forEach((delay) => setTimeout(() => {
      applyVersionLabel();
      hideOldVersionText();
      fixMppPicker();
      afterRenderMppLayout();
    }, delay));
  }

  function applyVersionLabel() {
    setText('appVersionBadge', BADGE, `Build ${BUILD}: current build label locked at first load.`);
    setText('appVersionFooter', FOOTER);
    setText('ribbonVersionText', RIBBON);
  }

  function setText(id, text, title = '') {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.textContent !== text) el.textContent = text;
    if (title) el.title = title;
    el.dataset.versionLocked = VERSION;
    el.style.visibility = 'visible';
  }

  function hideOldVersionText() {
    document.querySelectorAll('#appVersionBadge, #appVersionFooter, #ribbonVersionText').forEach((el) => {
      if (/v0\.(22|39)\.0|split \+ recurring|Baselines \+ ghost bars/i.test(el.textContent || '')) {
        el.textContent = el.id === 'appVersionFooter' ? FOOTER : el.id === 'ribbonVersionText' ? RIBBON : BADGE;
      }
      el.style.visibility = 'visible';
    });
  }

  function installVersionLock() {
    if (window.__currentVersionMutationLockInstalled) return;
    window.__currentVersionMutationLockInstalled = true;
    const observer = new MutationObserver(() => applyVersionLabel());
    ['appVersionBadge', 'appVersionFooter', 'ribbonVersionText'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el, { childList: true, characterData: true, subtree: true });
    });
  }

  function loadMppHelpers() {
    loadScriptOnce('app-project-entry-table.js', '__projectEntryTableScriptLoaded', 'projectEntryTable');
    loadScriptOnce('mpp-live-safe-xml-filter.js', '__liveMppSafeXmlFilterScriptLoaded', 'liveMppCleanup');
    loadScriptOnce('mpp-live-safe-percent-bridge.js', '__liveSafeMppPercentBridgeScriptLoaded', 'liveSafePercentBridge');
    loadScriptOnce('app-safe-live-mpp-state-cleanup.js', '__safeLiveMppStateCleanupScriptLoaded', 'surgicalMppCleanup');
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

  function fixMppPicker() {
    const input = document.getElementById('importMppInput');
    if (!input) return;
    input.removeAttribute('accept');
    input.accept = '';
    input.disabled = false;
    input.title = 'Choose a local .mpp file. The app checks the extension after selection.';
  }

  function installNonMppGuard() {
    if (nonMppGuardInstalled) return;
    nonMppGuardInstalled = true;
    document.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.id !== 'importMppInput') return;
      const file = input.files && input.files[0];
      if (!file || /\.mpp$/i.test(file.name || '')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      const panel = document.getElementById('mppPanel');
      if (panel) {
        panel.hidden = false;
        panel.classList.remove('mpp-ok', 'mpp-busy');
        panel.classList.add('mpp-warn');
        panel.textContent = `That is not an MPP file: ${file.name || 'selected file'}. Choose a .mpp file, or use Project XML import for .xml files.`;
      }
      mark('mpp-non-mpp-file-ignored', { name: file.name || '', size: file.size || 0, type: file.type || '' });
    }, true);
  }

  function patchRender() {
    if (renderPatched || typeof render !== 'function') return;
    renderPatched = true;
    const base = render;
    render = function currentVersionLockedRender(...args) {
      const result = base.apply(this, args);
      applyVersionLabel();
      setTimeout(() => { applyVersionLabel(); afterRenderMppLayout(); }, 0);
      setTimeout(() => { applyVersionLabel(); afterRenderMppLayout(); }, 180);
      return result;
    };
    window.render = render;
  }

  function getMppEvents() {
    const events = window.__mppDebug && window.__mppDebug.events;
    return Array.isArray(events) ? events : [];
  }

  function getLastImportEvent() {
    const events = getMppEvents();
    for (let i = events.length - 1; i >= 0; i -= 1) {
      if (events[i] && events[i].type === 'live-safe-xml-filter-applied') return events[i];
    }
    return null;
  }

  function afterRenderMppLayout() {
    const event = getLastImportEvent();
    if (!event) return;
    projectStyleEntrySplitOnce(event);
    postImportDiagnostic();
  }

  function projectStyleEntrySplitOnce(event) {
    try {
      const data = event.data || {};
      const signature = `${event.t || ''}:${data.generatedXmlTaskCount || data.kept || ''}:${data.firstTask || ''}:${data.lastTask || ''}`;
      if (!signature || signature === lastLayoutSignature) return;
      if (typeof uiPrefs === 'undefined') return;
      const keys = typeof window.getVisibleFieldKeys === 'function' ? window.getVisibleFieldKeys() : ['id', 'indicators', 'name', 'duration', 'start', 'finish', 'predecessors', 'actions'];
      uiPrefs.fieldPaneWidth = Math.max(640, Math.min(900, Math.round(window.innerWidth * 0.52)));
      if (typeof saveUiPrefs === 'function') saveUiPrefs();
      if (typeof applyUiPrefs === 'function') applyUiPrefs();
      const scroll = document.querySelector('.planner-scroll');
      if (scroll) { scroll.scrollTop = 0; scroll.scrollLeft = 0; }
      lastLayoutSignature = signature;
      mark('mpp-project-style-entry-split', { fieldPaneWidth: uiPrefs.fieldPaneWidth, visibleFieldKeys: keys, taskCount: getStateTasks().length, oncePerImport: true });
    } catch {}
  }

  function postImportDiagnostic() {
    try {
      const tasks = getStateTasks();
      const names = tasks.map((task) => String(task && task.name || '').trim());
      const percents = tasks.map((task) => Number(task && task.percent) || 0);
      const rows = Array.from(document.querySelectorAll('.planner-row[data-row-index]'));
      const indexes = rows.map((row) => Number(row.dataset.rowIndex)).filter(Number.isFinite);
      const scroll = document.querySelector('.planner-scroll');
      const diagnostic = {
        stateTaskCount: tasks.length,
        visiblePlannerRows: rows.length,
        minVisibleRowIndex: indexes.length ? Math.min(...indexes) : -1,
        maxVisibleRowIndex: indexes.length ? Math.max(...indexes) : -1,
        scrollTop: scroll ? scroll.scrollTop : 0,
        scrollHeight: scroll ? scroll.scrollHeight : 0,
        clientHeight: scroll ? scroll.clientHeight : 0,
        visibleFieldKeys: typeof window.getVisibleFieldKeys === 'function' ? window.getVisibleFieldKeys() : [],
        percentRows: percents.filter((value) => value > 0).length,
        firstPercents: percents.slice(0, 12),
        firstNames: names.slice(0, 10),
        lastNames: names.slice(-25),
        junkRowsStillPresent: names.filter((name) => /^no\s+program\s+baseline\s+date$/i.test(name) || /^task\s+\d+$/i.test(name)).slice(0, 25),
      };
      const signature = JSON.stringify({ count: diagnostic.stateTaskCount, fields: diagnostic.visibleFieldKeys.join(','), percentRows: diagnostic.percentRows, last: diagnostic.lastNames.slice(-3) });
      if (signature === lastDiagnostic) return;
      lastDiagnostic = signature;
      mark('mpp-post-render-state-count', diagnostic);
    } catch {}
  }

  function getStateTasks() {
    try { return Array.isArray(state && state.tasks) ? state.tasks : []; } catch { return []; }
  }

  function mark(type, data) {
    try {
      const dbg = window.__mppDebug;
      if (dbg && Array.isArray(dbg.events)) {
        dbg.events.push({ t: `${Math.round(performance.now())}ms`, type, data: data || {} });
        dbg.events = dbg.events.slice(-80);
        dbg.lastResult = data || dbg.lastResult;
      }
      console.log('[MPP]', type, data || {});
    } catch {}
  }
})();
