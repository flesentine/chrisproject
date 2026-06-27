(() => {
  'use strict';

  const CURRENT_VERSION = 'v0.52.0';
  const CURRENT_NAME = 'Safe MPP cleanup';
  const CURRENT_BUILD = '2026-06-27';
  const FOOTER_TEXT = `${CURRENT_VERSION} · ${CURRENT_NAME} · Build ${CURRENT_BUILD}`;
  const BADGE_TEXT = `${CURRENT_VERSION} · ${CURRENT_NAME}`;
  const RIBBON_TEXT = `${CURRENT_VERSION} · MPP worker + safe cleanup`;

  if (window.__currentVersionLabelLoaded) return;
  window.__currentVersionLabelLoaded = true;

  function applyVersionLabel() {
    const badge = document.getElementById('appVersionBadge');
    const footer = document.getElementById('appVersionFooter');
    const ribbon = document.getElementById('ribbonVersionText');
    if (badge) {
      badge.textContent = BADGE_TEXT;
      badge.title = `Build ${CURRENT_BUILD}: worker import, progress UI, date sanity, and live MPP cleanup`;
    }
    if (footer) footer.textContent = FOOTER_TEXT;
    if (ribbon) ribbon.textContent = RIBBON_TEXT;
  }

  function loadLiveMppCleanup() {
    if (window.__liveMppSafeXmlFilterScriptLoaded || document.querySelector('script[src="mpp-live-safe-xml-filter.js"]')) return;
    window.__liveMppSafeXmlFilterScriptLoaded = true;
    const script = document.createElement('script');
    script.src = 'mpp-live-safe-xml-filter.js';
    script.defer = true;
    script.dataset.liveMppCleanup = '1';
    (document.body || document.head || document.documentElement).appendChild(script);
  }

  function patchRender() {
    if (window.__currentVersionRenderPatched || typeof render !== 'function') return;
    window.__currentVersionRenderPatched = true;
    const base = render;
    render = function currentVersionRender(...args) {
      const result = base.apply(this, args);
      setTimeout(applyVersionLabel, 0);
      return result;
    };
    window.render = render;
  }

  function boot() {
    loadLiveMppCleanup();
    applyVersionLabel();
    patchRender();
    setTimeout(loadLiveMppCleanup, 250);
    setTimeout(applyVersionLabel, 250);
    setTimeout(applyVersionLabel, 1000);
    setTimeout(applyVersionLabel, 2500);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();
})();