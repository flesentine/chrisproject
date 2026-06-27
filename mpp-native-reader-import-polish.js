(() => {
  'use strict';

  const R = window.NativeMppReader;
  if (!R || window.__nativeMppImportPolishLoaded) return;
  window.__nativeMppImportPolishLoaded = true;

  const VERSION = '1.4.0-worker-first-fast-budget';
  const LIVE_MPP_TIMEOUT_MS = 12000;
  const inWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;

  R.importPolishVersion = VERSION;

  // This file loads before app.js. On the main page, it must never run the heavy
  // native MPP parser on the UI thread. In the worker, it intentionally becomes
  // a no-op so mpp-import-worker.js can call readBuffer/readBufferAsync directly.
  if (inWorker) return;

  const unsafeReadBuffer = R.readBuffer?.bind(R);
  const unsafeReadBufferAsync = R.readBufferAsync?.bind(R);
  const unsafeRead = R.read?.bind(R);
  R.__unsafeMainThreadMppRead = unsafeRead;
  R.__unsafeMainThreadMppReadBuffer = unsafeReadBuffer;
  R.__unsafeMainThreadMppReadBufferAsync = unsafeReadBufferAsync;

  R.readBuffer = function blockedMainThreadReadBuffer() {
    throw new Error('Blocked unsafe main-thread MPP parsing. Use the browser worker import path.');
  };

  R.readBufferAsync = async function blockedMainThreadReadBufferAsync() {
    throw new Error('Blocked unsafe main-thread MPP parsing. Use the browser worker import path.');
  };

  R.read = async function workerFirstMppRead(file) {
    if (!file) return null;
    if (!window.Worker) {
      throw new Error('This browser does not support Web Workers, so native MPP import is disabled to avoid freezing the page. Import Project XML instead.');
    }
    const timeoutMs = LIVE_MPP_TIMEOUT_MS;
    showEarlyProgress(file, 5, 'Starting MPP worker', 'Opening MPP safely off the main browser thread...');
    const buffer = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const worker = new Worker('mpp-import-worker.js');
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let settled = false;
      let percent = 12;
      const startedAt = Date.now();

      const progressTimer = setInterval(() => {
        if (settled) return;
        const elapsed = Date.now() - startedAt;
        const ratio = Math.min(1, elapsed / timeoutMs);
        percent = Math.max(percent, Math.min(91, Math.round(12 + (1 - Math.pow(1 - ratio, 2.1)) * 79)));
        const stage = percent < 35 ? 'Opening MPP container'
          : percent < 65 ? 'Scanning Project tables'
          : percent < 84 ? 'Checking imported schedule'
          : 'Finalizing import';
        showEarlyProgress(file, percent, stage, elapsed > 7000 ? 'Still working locally. If this MPP cannot quick-open, the app will stop instead of hanging.' : 'Working locally in your browser.');
      }, 300);

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        clearInterval(progressTimer);
        worker.terminate();
        showImportStopped(file, timeoutMs);
        reject(new Error(`This MPP did not quick-open within ${Math.round(timeoutMs / 1000)} seconds. The import was stopped so the app stays usable. This file needs deeper browser-compatibility work or Project XML export.`));
      }, timeoutMs);

      worker.onmessage = (event) => {
        const data = event.data || {};
        if (data.id !== id || settled) return;
        if (data.progress) {
          showEarlyProgress(file, data.progress.percent || percent, data.progress.stage || 'Importing MPP', data.progress.detail || 'Working locally...');
          return;
        }
        settled = true;
        clearInterval(progressTimer);
        clearTimeout(timer);
        worker.terminate();
        if (data.ok) {
          showEarlyProgress(file, 96, 'Loading schedule', 'Worker finished. Building the editable project view...');
          resolve(data.result);
        } else {
          reject(new Error(data.error || 'MPP worker import failed.'));
        }
      };

      worker.onerror = (event) => {
        if (settled) return;
        settled = true;
        clearInterval(progressTimer);
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(event.message || 'MPP worker crashed.'));
      };

      worker.postMessage({ id, name: file.name || 'project.mpp', buffer }, [buffer]);
    });
  };

  R.__workerImportVersion = VERSION;

  function showEarlyProgress(file, percent, stage, detail) {
    const panel = document.getElementById('mppPanel');
    if (!panel) return;
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
          <small><code>${esc(file?.name || 'project.mpp')}</code> · ${formatBytes(file?.size || 0)} · quick-open budget ${Math.round(LIVE_MPP_TIMEOUT_MS / 1000)}s</small>
        </div>
      </div>`;
    installEarlyStyles();
  }

  function showImportStopped(file, timeoutMs) {
    const panel = document.getElementById('mppPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.classList.remove('mpp-ok', 'mpp-busy');
    panel.classList.add('mpp-warn');
    panel.innerHTML = `<strong>MPP quick-open stopped:</strong> <code>${esc(file?.name || 'project.mpp')}</code> did not open within ${Math.round(timeoutMs / 1000)} seconds. The app stopped the local parser so Chrome stays usable. Try importing a Project XML export for this file while we improve browser-only MPP compatibility.`;
  }

  function installEarlyStyles() {
    if (document.getElementById('mppEarlyWorkerProgressStyles')) return;
    const style = document.createElement('style');
    style.id = 'mppEarlyWorkerProgressStyles';
    style.textContent = `
      .mpp-progress-card { display:flex; gap:14px; align-items:center; width:100%; }
      .mpp-progress-spinner { width:34px; height:34px; flex:0 0 auto; border-radius:999px; border:4px solid rgba(37,99,235,.18); border-top-color:#2563eb; animation:mppProgressSpin .85s linear infinite; }
      .mpp-progress-main { flex:1; min-width:0; display:grid; gap:7px; }
      .mpp-progress-topline { display:flex; justify-content:space-between; gap:12px; align-items:center; font-weight:900; }
      .mpp-progress-topline span { color:#1d4ed8; font-variant-numeric:tabular-nums; }
      .mpp-progress-bar { height:10px; border-radius:999px; overflow:hidden; background:#dbeafe; box-shadow:inset 0 0 0 1px rgba(37,99,235,.12); }
      .mpp-progress-bar i { display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#2563eb,#06b6d4); transition:width .25s ease; }
      .mpp-progress-main p { margin:0; color:#334155; font-size:13px; }
      .mpp-progress-main small { color:#64748b; }
      @keyframes mppProgressSpin { to { transform:rotate(360deg); } }
    `;
    document.head.appendChild(style);
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
