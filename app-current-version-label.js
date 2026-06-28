(() => {
  'use strict';

  const CURRENT_VERSION = 'v0.58.0';
  const CURRENT_NAME = 'Surgical MPP cleanup';
  const CURRENT_BUILD = '2026-06-27';
  const FOOTER_TEXT = `${CURRENT_VERSION} · ${CURRENT_NAME} · Build ${CURRENT_BUILD}`;
  const BADGE_TEXT = `${CURRENT_VERSION} · ${CURRENT_NAME}`;
  const RIBBON_TEXT = `${CURRENT_VERSION} · MPP XML path + surgical cleanup`;

  if (window.__currentVersionLabelLoaded) return;
  window.__currentVersionLabelLoaded = true;

  function applyVersionLabel() {
    const badge = document.getElementById('appVersionBadge');
    const footer = document.getElementById('appVersionFooter');
    const ribbon = document.getElementById('ribbonVersionText');
    if (badge) {
      badge.textContent = BADGE_TEXT;
      badge.title = `Build ${CURRENT_BUILD}: single MPP pipeline, surgical junk-row cleanup, Project-style Entry/Gantt split`;
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

  function hasRecentMppImport() {
    const dbg = window.__mppDebug;
    return Boolean(dbg?.events?.some((event) => event?.type === 'live-safe-xml-filter-applied' || event?.type === 'mpp-worker-import-pass-through'));
  }

  function projectStyleEntrySplit() {
    try {
      if (!hasRecentMppImport()) return;
      if (typeof uiPrefs === 'undefined' || !Array.isArray(window.FIELD_COLUMNS || FIELD_COLUMNS)) return;
      const columns = window.FIELD_COLUMNS || FIELD_COLUMNS;
      const map = new Map(columns.map((column) => [column.key, column]));
      const widths = uiPrefs.fieldColumns || {};
      const widthOf = (key) => Number(widths[key]) || Number(map.get(key)?.defaultWidth) || 0;
      const entryKeys = ['id', 'indicators', 'wbs', 'name', 'duration', 'start', 'finish'];
      const entryWidth = entryKeys.reduce((sum, key) => sum + widthOf(key), 0);
      const viewport = Math.max(860, Math.round(window.innerWidth * 0.56));
      const wanted = Math.max(760, Math.min(entryWidth, viewport));
      uiPrefs.fieldPaneWidth = wanted;
      if (typeof saveUiPrefs === 'function') saveUiPrefs();
      if (typeof applyUiPrefs === 'function') applyUiPrefs();
      const scroll = document.querySelector('.planner-scroll');
      if (scroll) {
        scroll.scrollTop = 0;
        scroll.scrollLeft = 0;
      }
      mark('mpp-project-style-entry-split', { fieldPaneWidth: wanted, entryWidth, taskCount: window.state?.tasks?.length || state?.tasks?.length || 0 });
    } catch {}
  }

  function resetPlannerScrollAfterMpp() {
    try {
      if (!hasRecentMppImport()) return;
      const scroll = document.querySelector('.planner-scroll');
      const firstRow = document.querySelector('.planner-row[data-row-index="0"]');
      if (scroll) {
        scroll.scrollTop = 0;
        scroll.scrollLeft = 0;
      }
      if (firstRow && scroll) {
        const rowTop = firstRow.offsetTop;
        if (rowTop > 4) scroll.scrollTop = Math.max(0, rowTop - 2);
      }
      mark('planner-scroll-reset-after-mpp', { scrollTop: scroll?.scrollTop || 0, scrollLeft: scroll?.scrollLeft || 0, hasFirstRow: Boolean(firstRow) });
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

  function loadLiveMppCleanup() {
    loadScriptOnce('mpp-live-safe-xml-filter.js', '__liveMppSafeXmlFilterScriptLoaded', 'liveMppCleanup');
    loadScriptOnce('app-safe-live-mpp-state-cleanup.js', '__safeLiveMppStateCleanupScriptLoaded', 'surgicalMppCleanup');
  }

  function afterRenderMppLayout() {
    projectStyleEntrySplit();
    resetPlannerScrollAfterMpp();
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
      setTimeout(afterRenderMppLayout, 120);
      setTimeout(afterRenderMppLayout, 450);
      return result;
    };
    window.render = render;
  }

  function boot() {
    loadLiveMppCleanup();
    fixMppPicker();
    applyVersionLabel();
    patchRender();
    setTimeout(loadLiveMppCleanup, 250);
    setTimeout(loadLiveMppCleanup, 1000);
    [100, 250, 750, 1500, 3000].forEach((delay) => setTimeout(fixMppPicker, delay));
    [500, 1200, 2500, 4500].forEach((delay) => setTimeout(afterRenderMppLayout, delay));
    setTimeout(applyVersionLabel, 250);
    setTimeout(applyVersionLabel, 1000);
    setTimeout(applyVersionLabel, 2500);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
})();