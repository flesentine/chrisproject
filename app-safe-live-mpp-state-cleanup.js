(() => {
  'use strict';
  const VERSION = '0.5.0-hide-mpp-field-value-junk';
  let tries = 0;

  function ready() { return typeof state !== 'undefined' && typeof render === 'function'; }

  function boot() {
    if (window.__safeLiveMppStateCleanupLoaded === VERSION) return;
    if (!ready()) { if (++tries < 120) setTimeout(boot, 100); return; }
    window.__safeLiveMppStateCleanupLoaded = VERSION;
    patchRender();
    setTimeout(clean, 100);
    setTimeout(clean, 600);
    setTimeout(clean, 1600);
    log('safe-live-mpp-state-cleanup-installed', { version: VERSION, mode: 'hide-field-value-junk' });
  }

  function patchRender() {
    if (window.__safeLiveMppStateCleanupRenderPatched === VERSION) return;
    window.__safeLiveMppStateCleanupRenderPatched = VERSION;
    const base = render;
    render = function hideMppJunkRowsCleanupRender(...args) {
      const result = base.apply(this, args);
      setTimeout(clean, 0);
      return result;
    };
    window.render = render;
  }

  function clean() {
    if (!state || !Array.isArray(state.tasks) || !state.tasks.length) return;
    if (!isMppImport()) return;
    const signature = state.tasks.length + ':' + state.tasks.map(t => t && t.name).slice(-8).join('|');
    if (state.__surgicalMppCleanupSignature === VERSION + ':' + signature) return;

    const before = state.tasks.length;
    const removedNames = [];
    const kept = state.tasks.filter((task) => {
      const name = cleanName(task && task.name);
      const remove = isFieldValueJunk(name);
      if (remove) removedNames.push(name || '(blank)');
      return !remove;
    });

    if (kept.length !== before) {
      kept.forEach((task, index) => {
        task.id = index + 1;
        task.wbs = task.wbs || String(index + 1);
        if (/^unnamed\s+mpp\s+row\s+\d+$/i.test(cleanName(task.name))) task.name = `Recovered MPP row ${index + 1}`;
      });
      state.tasks = kept;
    }

    state.nextUid = Math.max(Number(state.nextUid) || 1, state.tasks.length + 1);
    state.__surgicalMppCleanupSignature = VERSION + ':' + state.tasks.length + ':' + state.tasks.map(t => t && t.name).slice(-8).join('|');
    state.__safeLiveMppStateCleanup = {
      version: VERSION,
      before,
      after: state.tasks.length,
      deleted: before - state.tasks.length,
      removedNames: removedNames.slice(0, 60)
    };
    try { if (typeof save === 'function') save(); } catch {}
    log('safe-live-mpp-state-cleanup-applied', state.__safeLiveMppStateCleanup);
    if (removedNames.length) setTimeout(() => { try { render(); } catch {} }, 0);
  }

  function isMppImport() {
    const dbg = window.__mppDebug;
    if (dbg && Array.isArray(dbg.events) && dbg.events.some(e => e && e.type === 'live-safe-xml-filter-applied')) return true;
    return state.tasks.some(t => t && (t.recovered || t.unsafeMppDateClamped || t.safeLiveMppCleaned || t.mppRecoveredNameMissing));
  }

  function cleanName(value) {
    return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function isFieldValueJunk(name) {
    const n = cleanName(name);
    if (!n) return true;
    if (/^unnamed\s+mpp\s+row\s+\d+$/i.test(n)) return true;
    if (/^no\s+program\s+baseline\s+date$/i.test(n)) return true;
    if (/^no\s+.*baseline.*date$/i.test(n)) return true;
    if (/^task\s+\d+$/i.test(n)) return true;
    if (/^recovered\s+task\s+\d+$/i.test(n)) return true;
    if (/^mpp\s+task\s+\d+$/i.test(n)) return true;
    if (/^(baseline|baseline date|program baseline|program baseline date)$/i.test(n)) return true;
    if (/baseline/i.test(n) && /(date|start|finish|duration|cost|work|variance)/i.test(n)) return true;
    if (/^\d+\s*(FS|SS|FF|SF)(?:\s*[+-]\s*\d+\s*[dhwm]?)?(?:\s*,\s*\d+\s*(FS|SS|FF|SF)(?:\s*[+-]\s*\d+\s*[dhwm]?)?)*$/i.test(n)) return true;
    if (/^(completed|not started|in progress)$/i.test(n)) return true;
    return false;
  }

  function log(type, data) {
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

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot, { once: true }) : boot();
})();
