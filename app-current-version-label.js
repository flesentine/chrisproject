(() => {
  'use strict';

  const CURRENT_VERSION = 'v0.56.0';
  const CURRENT_NAME = 'MPP scroll reset';
  const CURRENT_BUILD = '2026-06-27';
  const FOOTER_TEXT = `${CURRENT_VERSION} · ${CURRENT_NAME} · Build ${CURRENT_BUILD}`;
  const BADGE_TEXT = `${CURRENT_VERSION} · ${CURRENT_NAME}`;
  const RIBBON_TEXT = `${CURRENT_VERSION} · MPP import + scroll reset`;

  if (window.__currentVersionLabelLoaded) return;
  window.__currentVersionLabelLoaded = true;

  function applyVersionLabel() {
    const badge = document.getElementById('appVersionBadge');
    const footer = document.getElementById('appVersionFooter');
    const ribbon = document.getElementById('ribbonVersionText');
    if (badge) {
      badge.textContent = BADGE_TEXT;
      badge.title = `Build ${CURRENT_BUILD}: worker import, safe XML path, normalized outline, and scroll reset`;
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
      if (window.__mppDebug?.events) {
        window.__mppDebug.events.push({
          t: `${Math.round(performance.now())}ms`,
          type: 'planner-scroll-reset-after-mpp',
          data: { scrollTop: scroll?.scrollTop || 0, hasFirstRow: Boolean(firstRow) },
        });
        window.__mppDebug.events = window.__mppDebug.events.slice(-80);
      }
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
    loadScriptOnce('app-safe-live-mpp-state-cleanup.js', '__safeLiveMppStateCleanupScriptLoaded', 'safeLiveMppStateCleanup');
  }

  function patchRender() {
    if (window.__currentVersionRenderPatched || typeof render !== 'function') return;
    window.__currentVersionRenderPatched = true;
    const base = render;
    render = function currentVersionRender(...args) {
      const result = base.apply(this, args);
      setTimeout(applyVersionLabel, 0);
      setTimeout(fixMppPicker, 0);
      setTimeout(resetPlannerScrollAfterMpp, 0);
      setTimeout(resetPlannerScrollAfterMpp, 120);
      setTimeout(resetPlannerScrollAfterMpp, 450);
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
    [500, 1200, 2500, 4500].forEach((delay) => setTimeout(resetPlannerScrollAfterMpp, delay));
    setTimeout(applyVersionLabel, 250);
    setTimeout(applyVersionLabel, 1000);
    setTimeout(applyVersionLabel, 2500);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
})();