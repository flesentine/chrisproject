(() => {
  'use strict';
  const VERSION = '0.2.0-disabled-obsolete-state-cleanup';
  window.__safeLiveMppStateCleanupLoaded = true;
  try {
    const dbg = window.__mppDebug;
    if (dbg && Array.isArray(dbg.events)) {
      dbg.events.push({
        t: `${Math.round(performance.now())}ms`,
        type: 'safe-live-mpp-state-cleanup-disabled',
        data: { version: VERSION, reason: 'obsolete post-import cleanup removed; active MPP XML filter owns normalization' },
      });
      dbg.events = dbg.events.slice(-80);
    }
    console.log('[MPP] safe-live-mpp-state-cleanup-disabled', { version: VERSION });
  } catch {}
})();
