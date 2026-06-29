(() => {
  'use strict';

  const VERSION = 'v0.47.0';
  const WATCHDOG_MS = 15000;
  let tries = 0;

  boot();
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : setTimeout(boot, 0);

  function boot() {
    const R = window.NativeMppReader;
    if (!R || typeof R.read !== 'function' || typeof R.readBufferAsync !== 'function') {
      if (++tries < 160) setTimeout(boot, 75);
      return;
    }
    if (R.__mppUnstickGuardVersion === VERSION) return;
    R.__mppUnstickGuardVersion = VERSION;
    installStyles();
    patchReader(R);
    mark('mpp-unstick-guard-installed', { version: VERSION, watchdogMs: WATCHDOG_MS });
  }

  function patchReader(R) {
    const baseRead = R.read.bind(R);
    const baseReadBufferAsync = R.readBufferAsync.bind(R);

    R.read = function guardedMppRead(file) {
      const info = fileInfo(file);
      mark('mpp-guard-read-called', info);
      return withWatchdog(() => baseRead(file), info);
    };

    R.readBufferAsync = function guardedMppReadBufferAsync(buffer, name = 'project.mpp') {
      const info = { name: name || 'project.mpp', size: buffer?.byteLength || buffer?.length || 0, type: '' };
      mark('mpp-guard-readBufferAsync-called', info);
      return withWatchdog(() => baseReadBufferAsync(buffer, name), info);
    };
  }

  function withWatchdog(startFn, file) {
    let settled = false;
    let timedOut = false;
    const startedAt = Date.now();
    updateProgress(file, 3, 'Opening MPP', 'Starting local MPP quick-open with a safety watchdog...');

    const work = Promise.resolve().then(startFn).then((result) => {
      if (timedOut) {
        mark('mpp-guard-late-result-ignored', { elapsedMs: Date.now() - startedAt, file });
        return result;
      }
      settled = true;
      mark('mpp-guard-resolved', { elapsedMs: Date.now() - startedAt, file });
      return result;
    }, (error) => {
      if (timedOut) throw error;
      settled = true;
      mark('mpp-guard-rejected', { elapsedMs: Date.now() - startedAt, file, error: error?.message || String(error || '') });
      throw error;
    });

    const guard = new Promise((_, reject) => {
      const timer = setInterval(() => {
        if (settled || timedOut) {
          clearInterval(timer);
          return;
        }
        const elapsed = Date.now() - startedAt;
        const pct = Math.max(36, Math.min(88, Math.round(36 + (elapsed / WATCHDOG_MS) * 52)));
        updateProgress(file, pct, 'Opening MPP', elapsed > 9000
          ? 'Still waiting on the local MPP parser. The watchdog will stop this instead of hanging the page.'
          : 'Still working locally in your browser...');
      }, 750);

      setTimeout(() => {
        if (settled || timedOut) return;
        timedOut = true;
        clearInterval(timer);
        const message = `This MPP did not quick-open within ${Math.round(WATCHDOG_MS / 1000)} seconds. The app stopped waiting so the page stays usable. For this file, use Microsoft Project XML export while deeper MPP compatibility is improved.`;
        mark('mpp-guard-timeout', { elapsedMs: Date.now() - startedAt, file, message });
        showStopped(file, message);
        reject(new Error(message));
      }, WATCHDOG_MS);
    });

    return Promise.race([work, guard]);
  }

  function updateProgress(file, percent, stage, detail) {
    const panel = document.getElementById('mppPanel');
    if (!panel || panel.classList.contains('mpp-stopped-by-guard')) return;
    const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    panel.hidden = false;
    panel.classList.remove('mpp-ok', 'mpp-warn');
    panel.classList.add('mpp-busy');
    panel.innerHTML = `
      <div class="mpp-progress-card">
        <div class="mpp-progress-spinner" aria-hidden="true"></div>
        <div class="mpp-progress-main">
          <div class="mpp-progress-topline"><strong>${esc(stage || 'Importing MPP')}</strong><span>${pct}%</span></div>
          <div class="mpp-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
          <p>${esc(detail || 'Working locally in this browser...')}</p>
          <small><code>${esc(file?.name || 'project.mpp')}</code> · ${formatBytes(file?.size || 0)} · watchdog ${Math.round(WATCHDOG_MS / 1000)}s</small>
        </div>
      </div>`;
  }

  function showStopped(file, message) {
    const panel = document.getElementById('mppPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.classList.remove('mpp-ok', 'mpp-busy');
    panel.classList.add('mpp-warn', 'mpp-stopped-by-guard');
    panel.innerHTML = `<strong>MPP quick-open stopped:</strong> <code>${esc(file?.name || 'project.mpp')}</code><br>${esc(message)} <button type="button" data-mpp-clear-panel>Clear</button>`;
    const input = document.getElementById('importMppInput');
    if (input) input.value = '';
  }

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-mpp-clear-panel]');
    if (!button) return;
    const panel = document.getElementById('mppPanel');
    if (panel) {
      panel.hidden = true;
      panel.classList.remove('mpp-stopped-by-guard', 'mpp-warn', 'mpp-busy');
      panel.textContent = '';
    }
  });

  function installStyles() {
    if (document.getElementById('mppUnstickGuardStyles')) return;
    const style = document.createElement('style');
    style.id = 'mppUnstickGuardStyles';
    style.textContent = `
      .mpp-panel.mpp-stopped-by-guard button[data-mpp-clear-panel] {
        margin-left: 8px;
        padding: 3px 8px;
        border: 1px solid #b45309;
        border-radius: 4px;
        background: #fff7ed;
        color: #7c2d12;
        font-weight: 800;
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }

  function mark(type, data = {}) {
    try {
      const dbg = window.__mppDebug;
      if (dbg && Array.isArray(dbg.events)) {
        dbg.events.push({ t: `${Math.round(performance.now())}ms`, type, data });
        dbg.events = dbg.events.slice(-80);
        if (/timeout|stopped|error/i.test(type)) dbg.lastError = { type, data };
        dbg.lastResult = data;
      }
      console.log('[MPP]', type, data);
    } catch {}
  }

  function fileInfo(file) {
    return file ? { name: file.name || '', size: file.size || 0, type: file.type || '' } : { name: 'project.mpp', size: 0, type: '' };
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
})();
