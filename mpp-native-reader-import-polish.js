(() => {
  'use strict';

  const R = window.NativeMppReader;
  if (!R || window.__nativeMppImportPolishLoaded) return;
  window.__nativeMppImportPolishLoaded = true;

  const VERSION = '1.7.0-readbuffer-worker-bridge';
  const LIVE_MPP_TIMEOUT_MS = 12000;
  const inWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;

  R.importPolishVersion = VERSION;

  // In the Worker this must be a no-op, otherwise the worker would recursively
  // create another worker instead of parsing the buffer.
  if (inWorker) return;

  const debug = window.__mppDebug = window.__mppDebug || {
    version: VERSION,
    startedAt: Date.now(),
    events: [],
    lastFile: null,
    lastResult: null,
    lastError: null,
  };
  debug.version = VERSION;

  const unsafeReadBuffer = R.readBuffer?.bind(R);
  const unsafeReadBufferAsync = R.readBufferAsync?.bind(R);
  const unsafeRead = R.read?.bind(R);
  R.__unsafeMainThreadMppRead = unsafeRead;
  R.__unsafeMainThreadMppReadBuffer = unsafeReadBuffer;
  R.__unsafeMainThreadMppReadBufferAsync = unsafeReadBufferAsync;

  mark('early-reader-loaded', {
    version: VERSION,
    hasReader: Boolean(R),
    hasWorker: Boolean(window.Worker),
    href: location.href,
  });
  installDebugHud();
  installInputDebugTap();

  R.readBuffer = function workerFirstReadBuffer(buffer, name = 'project.mpp') {
    mark('NativeMppReader.readBuffer-called', bufferInfo(buffer, name));
    throw new Error('Synchronous MPP readBuffer is disabled on the page. Use readBufferAsync so parsing can run in a worker.');
  };

  R.readBufferAsync = async function workerFirstReadBufferAsync(buffer, name = 'project.mpp') {
    mark('NativeMppReader.readBufferAsync-called', bufferInfo(buffer, name));
    const arrayBuffer = normalizeArrayBuffer(buffer);
    return readBufferInWorker(arrayBuffer, name || 'project.mpp');
  };

  R.read = async function workerFirstRead(file) {
    mark('NativeMppReader.read-called', fileInfo(file));
    if (!file) return null;
    mark('arrayBuffer-start', fileInfo(file));
    const buffer = await file.arrayBuffer();
    mark('arrayBuffer-done', { bytes: buffer.byteLength });
    return readBufferInWorker(buffer, file.name || 'project.mpp');
  };

  R.__workerImportVersion = VERSION;
  mark('worker-first-installed', { workerImportVersion: R.__workerImportVersion });

  function readBufferInWorker(buffer, name) {
    if (!window.Worker) {
      const message = 'This browser does not support Web Workers, so native MPP import is disabled to avoid freezing the page. Import Project XML instead.';
      mark('no-worker-support', { message });
      return Promise.reject(new Error(message));
    }
    const timeoutMs = LIVE_MPP_TIMEOUT_MS;
    const file = { name: name || 'project.mpp', size: buffer?.byteLength || 0, type: '' };
    showEarlyProgress(file, 5, 'Starting MPP worker', 'Opening MPP safely off the main browser thread...');
    return new Promise((resolve, reject) => {
      mark('worker-create-start');
      const worker = new Worker('mpp-import-worker.js');
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let settled = false;
      let percent = 12;
      const startedAt = Date.now();
      mark('worker-created', { id, timeoutMs, name, bytes: buffer?.byteLength || 0 });

      const progressTimer = setInterval(() => {
        if (settled) return;
        const elapsed = Date.now() - startedAt;
        const ratio = Math.min(1, elapsed / timeoutMs);
        percent = Math.max(percent, Math.min(91, Math.round(12 + (1 - Math.pow(1 - ratio, 2.1)) * 79)));
        const stage = percent < 35 ? 'Opening MPP container'
          : percent < 65 ? 'Scanning Project tables'
          : percent < 84 ? 'Building safe preview'
          : 'Finalizing preview';
        showEarlyProgress(file, percent, stage, elapsed > 7000 ? 'Still working locally. If this MPP cannot quick-open, the app will stop instead of hanging.' : 'Working locally in your browser.');
        if (elapsed > 1000 && elapsed % 3000 < 350) mark('worker-still-waiting', { elapsedMs: elapsed, percent });
      }, 300);

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        clearInterval(progressTimer);
        worker.terminate();
        mark('worker-timeout', { timeoutMs });
        showImportStopped(file, timeoutMs);
        reject(new Error(`This MPP did not quick-open within ${Math.round(timeoutMs / 1000)} seconds. The import was stopped so the app stays usable. This file needs deeper browser-compatibility work or Project XML export.`));
      }, timeoutMs);

      worker.onmessage = (event) => {
        const data = event.data || {};
        if (data.id !== id || settled) return;
        if (data.progress) {
          mark('worker-progress', data.progress);
          showEarlyProgress(file, data.progress.percent || percent, data.progress.stage || 'Importing MPP', data.progress.detail || 'Working locally...');
          return;
        }
        settled = true;
        clearInterval(progressTimer);
        clearTimeout(timer);
        worker.terminate();
        if (data.ok) {
          mark('worker-ok', summarizeWorkerResult(data.result));
          const safe = forceDraftPreview(data.result, file);
          mark('draft-preview-built', summarizeDraft(safe));
          showEarlyProgress(file, 96, 'Safe preview ready', 'Recovered task names are ready. Choose whether to load the bounded draft.');
          resolve(safe);
        } else {
          mark('worker-returned-error', { error: data.error || 'MPP worker import failed.' });
          reject(new Error(data.error || 'MPP worker import failed.'));
        }
      };

      worker.onerror = (event) => {
        if (settled) return;
        settled = true;
        clearInterval(progressTimer);
        clearTimeout(timer);
        worker.terminate();
        mark('worker-onerror', { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno });
        reject(new Error(event.message || 'MPP worker crashed.'));
      };

      const transferable = normalizeArrayBuffer(buffer);
      mark('worker-postMessage', { id, bytes: transferable.byteLength, name });
      worker.postMessage({ id, name: name || 'project.mpp', buffer: transferable }, [transferable]);
    });
  }

  function forceDraftPreview(result, file) {
    const safe = result && typeof result === 'object' ? { ...result } : {};
    const sourceTasks = Array.isArray(safe.project?.tasks) && safe.project.tasks.length
      ? safe.project.tasks
      : Array.isArray(safe.draftProject?.tasks) ? safe.draftProject.tasks : [];
    const tasks = sourceTasks.slice(0, 250).map((task, index) => ({
      id: index + 1,
      uid: index + 1,
      name: cleanName(task.name) || `Recovered task ${index + 1}`,
      confidence: task.confidence || 80,
    }));
    delete safe.projectXml;
    safe.project = null;
    safe.liveImportMode = 'draft-preview-only';
    safe.fileName = safe.fileName || file?.name || 'project.mpp';
    safe.draftProject = {
      name: cleanName(result?.project?.name || result?.draftProject?.name || file?.name || 'Recovered MPP'),
      start: new Date().toISOString().slice(0, 10),
      taskCount: tasks.length,
      tasks,
      topStream: result?.draftProject?.topStream || null,
    };
    safe.warnings = Array.isArray(safe.warnings) ? safe.warnings : [];
    safe.warnings.unshift('Live MPP import returns a draft preview only. Project XML auto-load is disabled so bad native dates cannot hang the grid/Gantt.');
    debug.lastResult = summarizeDraft(safe);
    return safe;
  }

  function normalizeArrayBuffer(value) {
    if (value instanceof ArrayBuffer) return value.slice(0);
    if (ArrayBuffer.isView(value)) return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    throw new Error('MPP reader expected an ArrayBuffer.');
  }

  function cleanName(value) {
    return String(value || '').replace(/\.mpp$/i, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
  }

  function showEarlyProgress(file, percent, stage, detail) {
    const panel = document.getElementById('mppPanel');
    const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
    mark('progress-panel', { percent: pct, stage, detail });
    if (!panel) {
      mark('mppPanel-missing', { percent: pct, stage });
      return;
    }
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

  function installInputDebugTap() {
    document.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.id !== 'importMppInput') return;
      const file = input.files?.[0];
      debug.lastFile = fileInfo(file);
      mark('file-input-change-seen-capture', {
        file: fileInfo(file),
        readerInstalled: Boolean(window.NativeMppReader?.__workerImportVersion),
        defaultPreventedBeforeDebug: event.defaultPrevented,
      });
    }, true);
  }

  function mark(type, data = {}) {
    const item = { t: `${Math.round(performance.now())}ms`, type, data };
    debug.events.push(item);
    debug.events = debug.events.slice(-80);
    if (type.includes('error') || type.includes('timeout')) debug.lastError = item;
    try { console.log('[MPP]', type, data); } catch {}
    renderDebugHud();
  }

  function installDebugHud() {
    if (document.getElementById('mppDebugHudStyles')) return;
    const style = document.createElement('style');
    style.id = 'mppDebugHudStyles';
    style.textContent = `
      #mppDebugHud { position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; width: min(460px, calc(100vw - 24px)); max-height: 46vh; overflow: auto; border: 1px solid rgba(15,23,42,.22); border-radius: 14px; background: rgba(15,23,42,.94); color: #e5e7eb; font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; box-shadow: 0 24px 80px rgba(0,0,0,.35); }
      #mppDebugHud[hidden] { display: none !important; }
      #mppDebugHud header { display:flex; justify-content:space-between; gap:8px; align-items:center; padding:8px 10px; border-bottom:1px solid rgba(148,163,184,.28); position: sticky; top:0; background: rgba(15,23,42,.98); }
      #mppDebugHud strong { color:#93c5fd; }
      #mppDebugHud button { border:1px solid rgba(147,197,253,.32); background:#1e3a8a; color:#dbeafe; border-radius:8px; padding:3px 7px; font: inherit; cursor:pointer; }
      #mppDebugHud .mpp-debug-body { padding:8px 10px 10px; display:grid; gap:6px; }
      #mppDebugHud .mpp-debug-event { border-left:3px solid #38bdf8; padding-left:7px; white-space:pre-wrap; word-break:break-word; }
      #mppDebugHud .mpp-debug-event.warn { border-left-color:#f59e0b; }
      #mppDebugHud .mpp-debug-event.bad { border-left-color:#ef4444; }
      #mppDebugHud code { color:#bbf7d0; }
    `;
    (document.head || document.documentElement).appendChild(style);
    renderDebugHud();
  }

  function renderDebugHud() {
    if (!document.body) { setTimeout(renderDebugHud, 50); return; }
    installDebugHudSafe();
    let hud = document.getElementById('mppDebugHud');
    if (!hud) {
      hud = document.createElement('section');
      hud.id = 'mppDebugHud';
      hud.setAttribute('aria-live', 'polite');
      document.body.appendChild(hud);
      hud.addEventListener('click', async (event) => {
        const action = event.target?.dataset?.debugAction;
        if (action === 'hide') hud.hidden = true;
        if (action === 'copy') {
          const text = JSON.stringify(debug, null, 2);
          try { await navigator.clipboard.writeText(text); mark('debug-copied'); } catch { prompt('Copy MPP debug JSON:', text); }
        }
      });
    }
    const events = debug.events.slice(-12).map((event) => {
      const bad = /error|timeout|missing|blocked|stopped/i.test(event.type);
      const warn = /waiting|progress|change|called/i.test(event.type);
      return `<div class="mpp-debug-event ${bad ? 'bad' : warn ? 'warn' : ''}"><code>${esc(event.t)}</code> <strong>${esc(event.type)}</strong> ${esc(JSON.stringify(event.data || {}))}</div>`;
    }).join('');
    hud.innerHTML = `<header><strong>MPP Debug HUD · ${esc(VERSION)}</strong><span><button data-debug-action="copy" type="button">Copy</button> <button data-debug-action="hide" type="button">Hide</button></span></header><div class="mpp-debug-body">${events || '<div>No events yet.</div>'}</div>`;
  }

  function installDebugHudSafe() { if (!document.getElementById('mppDebugHudStyles')) installDebugHud(); }

  function summarizeWorkerResult(result) {
    return {
      hasProjectXml: Boolean(result?.projectXml),
      projectTasks: result?.project?.tasks?.length || 0,
      draftTasks: result?.draftProject?.tasks?.length || 0,
      warnings: result?.warnings?.length || 0,
      liveImportMode: result?.liveImportMode || '',
    };
  }

  function summarizeDraft(result) {
    return {
      mode: result?.liveImportMode || '',
      draftTasks: result?.draftProject?.tasks?.length || 0,
      hasProjectXml: Boolean(result?.projectXml),
      hasProject: Boolean(result?.project),
      firstTask: result?.draftProject?.tasks?.[0]?.name || '',
    };
  }

  function fileInfo(file) { return file ? { name: file.name || '', size: file.size || 0, type: file.type || '' } : null; }
  function bufferInfo(buffer, name) { return { name: name || 'project.mpp', bytes: buffer?.byteLength || buffer?.length || 0, isView: ArrayBuffer.isView(buffer), isArrayBuffer: buffer instanceof ArrayBuffer }; }

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

  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
})();
