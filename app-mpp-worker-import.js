(() => {
  'use strict';

  const VERSION = '0.5.0-pass-through-early-reader';
  let attempts = 0;

  function mark(type, data = {}) {
    try {
      const dbg = window.__mppDebug;
      if (dbg && Array.isArray(dbg.events)) {
        dbg.events.push({ t: `${Math.round(performance.now())}ms`, type, data });
        dbg.events = dbg.events.slice(-80);
        dbg.lastResult = data;
      }
      console.log('[MPP]', type, data);
    } catch {}
  }

  function install() {
    const R = window.NativeMppReader;
    if (!R) {
      if (++attempts < 40) window.setTimeout(install, 150);
      return;
    }

    // Older builds used this file to intercept the MPP file input and build a
    // direct safe snapshot. The early reader now owns the safe worker-first path.
    // Do not intercept the input here, or the app can lose rows before the XML
    // importer sees them.
    window.__mppWorkerImportPassThrough = {
      version: VERSION,
      earlyReaderVersion: R.__workerImportVersion || R.importPolishVersion || '',
      active: true,
    };
    mark('mpp-worker-import-pass-through', window.__mppWorkerImportPassThrough);
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', install, { once: true })
    : install();

  [250, 750, 1500, 3000].forEach((delay) => window.setTimeout(install, delay));
})();