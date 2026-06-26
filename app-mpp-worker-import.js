(() => {
  'use strict';

  const VERSION = '0.2.0-worker-mpp-import-progress';
  let installAttempts = 0;

  function install() {
    installStyles();
    const R = window.NativeMppReader;
    if (!R || !R.read || R.__workerImportVersion === VERSION) return;
    const fallbackRead = R.__mainThreadReadFallback || R.read.bind(R);
    R.__mainThreadReadFallback = fallbackRead;
    R.read = async function workerBackedMppRead(file) {
      if (!file) return null;
      if (!window.Worker) return fallbackRead(file);
      const timeoutMs = Math.max(20000, Math.min(90000, 20000 + Math.round((Number(file.size) || 0) / 150000)));
      beginBusy(file, timeoutMs);
      try {
        const result = await readInWorker(file, timeoutMs);
        showProgress(file, 96, 'Preparing schedule view', 'Import decoded. Building the editable schedule...');
        return result;
      } catch (error) {
        error.message = `${error.message || 'MPP import failed.'} The page stayed responsive because parsing was isolated in a Web Worker.`;
        showProgress(file, 100, 'Import stopped', error.message, true);
        throw error;
      } finally {
        window.setTimeout(endBusy, 800);
      }
    };
    R.__workerImportVersion = VERSION;
  }

  async function readInWorker(file, timeoutMs) {
    showProgress(file, 8, 'Reading file', 'Loading the .mpp into browser memory...');
    const buffer = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const worker = new Worker('mpp-import-worker.js');
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const startedAt = Date.now();
      let settled = false;
      let manualPercent = 16;
      showProgress(file, manualPercent, 'Starting parser worker', 'Launching the local browser worker...');
      const progressTimer = window.setInterval(() => {
        if (settled) return;
        const elapsed = Date.now() - startedAt;
        const timeRatio = Math.min(1, elapsed / Math.max(1, timeoutMs));
        const eased = 1 - Math.pow(1 - timeRatio, 2.2);
        manualPercent = Math.max(manualPercent, Math.min(91, Math.round(18 + eased * 73)));
        const stage = manualPercent < 35 ? 'Opening MPP container'
          : manualPercent < 62 ? 'Scanning native task/resource tables'
          : manualPercent < 82 ? 'Checking dates and assignments'
          : 'Finalizing local import';
        const detail = elapsed > 8000
          ? 'Still working locally. Large MPP files can take a bit, but the page should stay responsive.'
          : 'Working locally in your browser. Nothing is uploaded.';
        showProgress(file, manualPercent, stage, detail);
      }, 300);
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        window.clearInterval(progressTimer);
        worker.terminate();
        reject(new Error(`MPP import exceeded ${Math.round(timeoutMs / 1000)} seconds and was stopped before Chrome froze.`));
      }, timeoutMs);

      worker.onmessage = (event) => {
        const data = event.data || {};
        if (data.id !== id || settled) return;
        if (data.progress) {
          showProgress(file, data.progress.percent || manualPercent, data.progress.stage || 'Importing', data.progress.detail || 'Working locally...');
          return;
        }
        settled = true;
        window.clearInterval(progressTimer);
        window.clearTimeout(timer);
        worker.terminate();
        if (data.ok) {
          showProgress(file, 94, 'Decoded MPP', 'Native parser finished. Loading result into the grid...');
          resolve(data.result);
        } else {
          reject(new Error(data.error || 'MPP worker import failed.'));
        }
      };

      worker.onerror = (event) => {
        if (settled) return;
        settled = true;
        window.clearInterval(progressTimer);
        window.clearTimeout(timer);
        worker.terminate();
        reject(new Error(event.message || 'MPP worker crashed.'));
      };

      showProgress(file, 22, 'Parsing MPP', 'Scanning OLE streams and native Project tables...');
      worker.postMessage({ id, name: file.name || 'project.mpp', buffer }, [buffer]);
    });
  }

  function beginBusy(file, timeoutMs) {
    document.body.classList.add('mpp-import-running');
    document.querySelectorAll('#importMppInput,#importXmlInput,.mpp-button input').forEach((input) => { input.disabled = true; });
    showProgress(file, 4, 'Starting import', `Timeout safety: ${Math.round(timeoutMs / 1000)} seconds.`);
  }

  function endBusy() {
    document.body.classList.remove('mpp-import-running');
    document.querySelectorAll('#importMppInput,#importXmlInput,.mpp-button input').forEach((input) => { input.disabled = false; });
  }

  function showProgress(file, percent, stage, detail, failed = false) {
    const panel = document.getElementById('mppPanel');
    if (!panel) return;
    const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    const elapsedText = getElapsedText(file);
    panel.hidden = false;
    panel.classList.remove('mpp-ok', 'mpp-warn');
    panel.classList.add('mpp-busy', 'mpp-progress-panel');
    if (!file.__mppProgressStartedAt) file.__mppProgressStartedAt = Date.now();
    panel.innerHTML = `
      <div class="mpp-progress-card ${failed ? 'is-failed' : ''}">
        <div class="mpp-progress-spinner" aria-hidden="true"></div>
        <div class="mpp-progress-main">
          <div class="mpp-progress-topline"><strong>${esc(stage || 'Importing MPP')}</strong><span>${pct}%</span></div>
          <div class="mpp-progress-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
          <p>${esc(detail || 'Working locally in this browser...')}</p>
          <small><code>${esc(file?.name || 'project.mpp')}</code> · ${formatBytes(file?.size || 0)} · ${elapsedText}</small>
        </div>
      </div>`;
  }

  function getElapsedText(file) {
    if (!file.__mppProgressStartedAt) file.__mppProgressStartedAt = Date.now();
    const seconds = Math.max(0, Math.round((Date.now() - file.__mppProgressStartedAt) / 1000));
    return seconds <= 0 ? 'just started' : `${seconds}s elapsed`;
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  }

  function installStyles() {
    if (document.getElementById('mppWorkerProgressStyles')) return;
    const style = document.createElement('style');
    style.id = 'mppWorkerProgressStyles';
    style.textContent = `
      .mpp-progress-panel { border-color: rgba(37,99,235,.28) !important; background: linear-gradient(180deg,#eff6ff,#ffffff) !important; }
      .mpp-progress-card { display:flex; gap:14px; align-items:center; width:100%; }
      .mpp-progress-spinner { width:34px; height:34px; flex:0 0 auto; border-radius:999px; border:4px solid rgba(37,99,235,.18); border-top-color:#2563eb; animation:mppProgressSpin .85s linear infinite; }
      .mpp-progress-main { flex:1; min-width:0; display:grid; gap:7px; }
      .mpp-progress-topline { display:flex; justify-content:space-between; gap:12px; align-items:center; font-weight:900; }
      .mpp-progress-topline span { color:#1d4ed8; font-variant-numeric:tabular-nums; }
      .mpp-progress-bar { height:10px; border-radius:999px; overflow:hidden; background:#dbeafe; box-shadow:inset 0 0 0 1px rgba(37,99,235,.12); }
      .mpp-progress-bar i { display:block; height:100%; border-radius:999px; background:linear-gradient(90deg,#2563eb,#06b6d4); transition:width .25s ease; }
      .mpp-progress-main p { margin:0; color:#334155; font-size:13px; }
      .mpp-progress-main small { color:#64748b; }
      .mpp-progress-card.is-failed .mpp-progress-spinner { border-color:rgba(220,38,38,.18); border-top-color:#dc2626; }
      body.mpp-import-running #importMppInput, body.mpp-import-running #importXmlInput { cursor:wait; }
      @keyframes mppProgressSpin { to { transform:rotate(360deg); } }
    `;
    document.head.appendChild(style);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function retryInstall() {
    install();
    if (window.NativeMppReader?.__workerImportVersion === VERSION) return;
    if (++installAttempts < 30) window.setTimeout(retryInstall, 150);
  }

  retryInstall();
  [250, 750, 1500, 3000].forEach((delay) => window.setTimeout(install, delay));
})();
