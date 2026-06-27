(() => {
  'use strict';

  const VERSION = '0.4.0-safe-live-mpp-import-placeholders';
  const MAX_LIVE_TASKS = 250;
  const LIVE_TIMEOUT_MS = 12000;
  let installAttempts = 0;
  let captureInstalled = false;

  function install() {
    installStyles();
    installSafeMppCapture();
    const R = window.NativeMppReader;
    if (!R || !R.read || R.__workerImportVersion === VERSION) return;
    const fallbackRead = R.__mainThreadReadFallback || R.read.bind(R);
    R.__mainThreadReadFallback = fallbackRead;
    R.read = async function workerBackedMppRead(file) {
      if (!file) return null;
      if (!window.Worker) throw new Error('Web Workers are required for safe MPP import. Import Project XML instead.');
      beginBusy(file, LIVE_TIMEOUT_MS);
      try {
        return await readInWorker(file, LIVE_TIMEOUT_MS);
      } catch (error) {
        showProgress(file, 100, 'Import stopped', error.message || 'MPP import stopped.', true);
        throw error;
      } finally {
        window.setTimeout(endBusy, 500);
      }
    };
    R.__workerImportVersion = VERSION;
  }

  function installSafeMppCapture() {
    if (captureInstalled) return;
    captureInstalled = true;
    document.addEventListener('change', (event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.id !== 'importMppInput') return;
      const file = input.files?.[0];
      if (!file) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      input.value = '';
      openMppAsSafeDraft(file);
    }, true);
  }

  async function openMppAsSafeDraft(file) {
    const startedAt = Date.now();
    showProgress(file, 3, 'MPP safe quick-open', 'Reading the MPP in a worker. It will load only as a bounded draft so the app cannot hang.');
    try {
      const result = await readWithUiBudget(file, LIVE_TIMEOUT_MS);
      window.__lastSafeMppResult = result;
      const snapshot = buildSafeSnapshot(result, file);
      if (!snapshot.tasks.length) {
        showPanel('warn', 'MPP opened, no safe tasks', 'The file opened, but no safe task rows were recovered quickly. The current project was left alone. Try Project XML export for this file.');
        return;
      }
      state = snapshot;
      if (typeof render === 'function') render();
      try { if (typeof save === 'function') save(); } catch {}
      const elapsed = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      showPanel('ok', 'MPP safe draft loaded', `Loaded ${snapshot.tasks.length} task${snapshot.tasks.length === 1 ? '' : 's'} from <code>${esc(file.name || 'project.mpp')}</code> in ${elapsed}s. Skipped ${snapshot.__safeLiveMppImportStats.skippedPlaceholders} placeholder/non-task row${snapshot.__safeLiveMppImportStats.skippedPlaceholders === 1 ? '' : 's'}. Dates were bounded for safety.`);
    } catch (error) {
      showPanel('warn', 'MPP quick-open stopped', `${esc(error?.message || error || 'The MPP did not quick-open.')} The current project was left alone.`);
    }
  }

  function readWithUiBudget(file, timeoutMs) {
    return Promise.race([
      window.NativeMppReader.read(file),
      new Promise((_, reject) => window.setTimeout(() => reject(new Error(`This MPP did not quick-open within ${Math.round(timeoutMs / 1000)} seconds.`)), timeoutMs + 1000)),
    ]);
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
        const ratio = Math.min(1, elapsed / Math.max(1, timeoutMs));
        manualPercent = Math.max(manualPercent, Math.min(91, Math.round(18 + (1 - Math.pow(1 - ratio, 2.2)) * 73)));
        showProgress(file, manualPercent, manualPercent < 60 ? 'Scanning MPP quickly' : 'Preparing safe draft', elapsed > 7000 ? 'Still working locally. It will stop instead of hanging.' : 'Working locally in your browser. Nothing is uploaded.');
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
        data.ok ? resolve(data.result) : reject(new Error(data.error || 'MPP worker import failed.'));
      };

      worker.onerror = (event) => {
        if (settled) return;
        settled = true;
        window.clearInterval(progressTimer);
        window.clearTimeout(timer);
        worker.terminate();
        reject(new Error(event.message || 'MPP worker crashed.'));
      };

      worker.postMessage({ id, name: file.name || 'project.mpp', buffer }, [buffer]);
    });
  }

  function buildSafeSnapshot(result, file) {
    const rawTasks = Array.isArray(result?.project?.tasks) && result.project.tasks.length
      ? result.project.tasks
      : Array.isArray(result?.draftProject?.tasks) ? result.draftProject.tasks : [];
    const usableTasks = rawTasks.filter((task) => isUsableTaskName(cleanName(task?.name)));
    const picked = usableTasks.slice(0, MAX_LIVE_TASKS);
    const projectStart = nextWorkingIso(new Date());
    const minutesPerDay = 480;
    const tasks = picked.map((task, index) => {
      const duration = safeDuration(task);
      const start = workingDateForIndex(projectStart, index);
      const finish = addWorkingDaysIso(start, duration - 1);
      const wbs = cleanWbs(task.wbs || task.outlineNumber || task.outline_number || '') || String(index + 1);
      return {
        uid: index + 1,
        id: index + 1,
        name: cleanName(task.name),
        start,
        finish,
        durationDays: duration,
        durationMinutes: duration * minutesPerDay,
        percent: safePercent(task.percent ?? task.percentComplete),
        predecessors: [],
        links: [],
        outlineLevel: Math.max(1, Math.min(20, Number(task.outlineLevel) || wbs.split('.').length || 1)),
        outlineNumber: wbs,
        wbs,
        recovered: true,
        unsafeMppDateClamped: true,
      };
    });
    markSummaryRows(tasks);
    return {
      projectName: cleanName(result?.project?.name || result?.draftProject?.name || file?.name || 'Recovered MPP'),
      projectStart,
      nextUid: tasks.length + 1,
      nextResourceUid: 1,
      nextAssignmentUid: 1,
      baselineSetAt: '',
      activeView: 'schedule',
      calendar: { name: 'Standard', workingDays: [1,2,3,4,5], exceptions: [], minutesPerDay, defaultStartTime: '08:00:00', defaultFinishTime: '17:00:00' },
      tasks,
      resources: [],
      __safeLiveMppImport: true,
      __safeLiveMppImportStats: { sourceRows: rawTasks.length, usableRows: usableTasks.length, skippedPlaceholders: rawTasks.length - usableTasks.length },
    };
  }

  function isUsableTaskName(name) {
    const n = cleanName(name);
    if (!n || n.length < 3) return false;
    if (/^task\s+\d+$/i.test(n)) return false;
    if (/^recovered\s+task\s+\d+$/i.test(n)) return false;
    if (/^mpp\s+task\s+\d+$/i.test(n)) return false;
    if (/^no\s+program\s+baseline\s+date$/i.test(n)) return false;
    if (/^no\s+.*baseline.*date$/i.test(n)) return false;
    return /[A-Za-z\p{L}]/u.test(n);
  }

  function markSummaryRows(tasks) {
    tasks.forEach((task, index) => {
      const current = Number(task.outlineLevel) || 1;
      const next = Number(tasks[index + 1]?.outlineLevel) || 1;
      task.isSummary = next > current;
      task.summary = task.isSummary;
    });
  }

  function cleanWbs(value) {
    const text = String(value || '').replace(/\s+/g, '');
    return /^\d+(?:\.\d+)*$/.test(text) ? text : '';
  }

  function beginBusy(file, timeoutMs) {
    document.body.classList.add('mpp-import-running');
    document.querySelectorAll('#importMppInput,#importXmlInput,.mpp-button input').forEach((input) => { input.disabled = true; });
    showProgress(file, 4, 'Starting import', `Quick-open budget: ${Math.round(timeoutMs / 1000)} seconds.`);
  }

  function endBusy() {
    document.body.classList.remove('mpp-import-running');
    document.querySelectorAll('#importMppInput,#importXmlInput,.mpp-button input').forEach((input) => { input.disabled = false; });
  }

  function showPanel(tone, label, html) {
    const panel = document.getElementById('mppPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.classList.remove('mpp-ok', 'mpp-warn', 'mpp-busy');
    if (tone === 'ok') panel.classList.add('mpp-ok');
    if (tone === 'warn') panel.classList.add('mpp-warn');
    if (tone === 'busy') panel.classList.add('mpp-busy');
    panel.innerHTML = `<strong>${esc(label)}:</strong> ${html}`;
  }

  function showProgress(file, percent, stage, detail, failed = false) {
    const panel = document.getElementById('mppPanel');
    if (!panel) return;
    const pct = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
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
          <small><code>${esc(file?.name || 'project.mpp')}</code> · ${formatBytes(file?.size || 0)} · ${getElapsedText(file)}</small>
        </div>
      </div>`;
  }

  function getElapsedText(file) {
    const seconds = Math.max(0, Math.round((Date.now() - (file.__mppProgressStartedAt || Date.now())) / 1000));
    return seconds <= 0 ? 'just started' : `${seconds}s elapsed`;
  }

  function cleanName(value) { return String(value || '').replace(/\.mpp$/i, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180); }
  function safeDuration(task) { const n = Number(task?.durationDays); return Number.isFinite(n) && n > 0 && n <= 15 ? Math.round(n) : 1; }
  function safePercent(value) { const n = Number(value); return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0; }
  function todayIso() { return new Date().toISOString().slice(0, 10); }
  function nextWorkingIso(date) { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); while (!isWorkingDay(d)) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); }
  function workingDateForIndex(startIso, index) { const d = new Date(`${startIso}T00:00:00Z`); let left = Number(index || 0); while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); if (isWorkingDay(d)) left -= 1; } return d.toISOString().slice(0, 10); }
  function addWorkingDaysIso(startIso, days) { const d = new Date(`${startIso}T00:00:00Z`); let left = Number(days || 0); while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); if (isWorkingDay(d)) left -= 1; } return d.toISOString().slice(0, 10); }
  function isWorkingDay(d) { const day = d.getUTCDay(); return day >= 1 && day <= 5; }
  function addDaysIso(startIso, days) { const d = new Date(`${startIso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Number(days || 0)); return d.toISOString().slice(0, 10); }
  function formatBytes(bytes) { const n = Number(bytes) || 0; if (n < 1024) return `${n} B`; if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`; return `${(n / 1024 / 1024).toFixed(1)} MB`; }

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

  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

  function retryInstall() {
    install();
    if (window.NativeMppReader?.__workerImportVersion === VERSION) return;
    if (++installAttempts < 30) window.setTimeout(retryInstall, 150);
  }

  retryInstall();
  [250, 750, 1500, 3000].forEach((delay) => window.setTimeout(install, delay));
})();