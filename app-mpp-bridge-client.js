(() => {
  'use strict';

  const VERSION = '0.1.0-mpxj-bridge-client';
  const BRIDGE_BASE = 'http://127.0.0.1:3908';
  let tries = 0;
  let lastHealth = null;

  boot();
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : setTimeout(boot, 0);

  function ready() {
    return typeof importProjectMppLocal === 'function' && typeof render === 'function' && typeof state !== 'undefined';
  }

  function boot() {
    if (!ready()) {
      if (++tries < 220) setTimeout(boot, 75);
      return;
    }
    if (window.__mppBridgeClientLoaded === VERSION) return;
    window.__mppBridgeClientLoaded = VERSION;
    installStyles();
    patchImporter();
    installPanelActions();
    mark('mpp-bridge-client-installed', { version: VERSION, bridge: BRIDGE_BASE });
  }

  function patchImporter() {
    if (window.__mppBridgeClientPatched === VERSION) return;
    window.__mppBridgeClientPatched = VERSION;
    const fallbackImport = importProjectMppLocal;

    importProjectMppLocal = async function mpxjBridgeImport(file, ...rest) {
      if (!file || !String(file.name || '').toLowerCase().endsWith('.mpp')) {
        return fallbackImport.apply(this, [file, ...rest]);
      }

      const health = await bridgeHealth();
      if (!health?.ok) {
        showBridgeUnavailable(file);
        return fallbackImport.apply(this, [file, ...rest]);
      }

      try {
        setPanel(`Reading <code>${esc(file.name)}</code> through the local MPXJ bridge. This is the real-MPP engine path; browser fallback remains available if it fails.`, 'busy', 'MPXJ Bridge');
        const payload = await convertWithBridge(file);
        if (!payload?.ok || !payload.project) throw new Error(payload?.error || 'MPXJ bridge returned no project data.');
        const imported = importNormalizedProject(payload, file);
        showBridgeSuccess(file, payload, imported);
        return payload;
      } catch (error) {
        mark('mpp-bridge-import-failed', { error: message(error) });
        setPanel(`MPXJ bridge failed: ${esc(message(error))}<br>Falling back to the browser-only importer so the app is still usable.`, 'warn', 'MPXJ Bridge');
        return fallbackImport.apply(this, [file, ...rest]);
      }
    };
    window.importProjectMppLocal = importProjectMppLocal;
  }

  async function bridgeHealth() {
    const now = Date.now();
    if (lastHealth && now - lastHealth.at < 3000) return lastHealth.value;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 700);
    try {
      const response = await fetch(`${BRIDGE_BASE}/health`, { cache: 'no-store', signal: controller.signal });
      const value = response.ok ? await response.json() : null;
      lastHealth = { at: now, value };
      return value;
    } catch {
      lastHealth = { at: now, value: null };
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function convertWithBridge(file) {
    const buffer = await file.arrayBuffer();
    const response = await fetch(`${BRIDGE_BASE}/convert-mpp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': file.name || 'project.mpp',
      },
      body: buffer,
    });
    const text = await response.text();
    let payload = null;
    try { payload = JSON.parse(text); } catch { payload = { ok: false, error: text || response.statusText }; }
    if (!response.ok) throw new Error(payload?.error || `Bridge HTTP ${response.status}`);
    return payload;
  }

  function importNormalizedProject(payload, file) {
    const project = payload.project || {};
    const rawTasks = Array.isArray(project.tasks) ? project.tasks : [];
    const rawResources = Array.isArray(project.resources) ? project.resources : [];
    const rawAssignments = Array.isArray(project.assignments) ? project.assignments : [];
    const projectStart = cleanDate(project.start) || todayValue();

    const taskUidToId = new Map();
    const tasks = rawTasks
      .filter((task) => cleanText(task.name) || Number(task.id) > 0 || Number(task.uid) > 0)
      .map((task, index) => {
        const uid = positiveNumber(task.uid) || index + 1;
        const id = index + 1;
        taskUidToId.set(String(uid), id);
        taskUidToId.set(String(task.id || ''), id);
        const start = cleanDate(task.start) || projectStart;
        const finish = cleanDate(task.finish) || start;
        const durationMinutes = positiveNumber(task.durationMinutes) || spanMinutes(start, finish) || 480;
        const baseline = cleanDate(task.baselineStart) || cleanDate(task.baselineFinish)
          ? {
              start: cleanDate(task.baselineStart) || '',
              finish: cleanDate(task.baselineFinish) || '',
              durationMinutes,
              workMinutes: durationMinutes,
              cost: 0,
            }
          : null;
        return {
          id,
          uid,
          name: cleanText(task.name) || `Task ${id}`,
          notes: cleanText(task.notes),
          start,
          finish,
          durationDays: Math.max(0, Math.round(durationMinutes / 480)),
          durationMinutes,
          percent: clampPercent(task.percent),
          actualStart: cleanDate(task.actualStart) || '',
          actualFinish: cleanDate(task.actualFinish) || '',
          predecessors: [],
          links: [],
          outlineLevel: Math.max(1, positiveNumber(task.outlineLevel) || 1),
          isSummary: Boolean(task.summary),
          expanded: true,
          isMilestone: Boolean(task.milestone) || durationMinutes === 0,
          constraintType: 'ASAP',
          constraintDate: '',
          deadline: '',
          assignments: [],
          baseline,
          mpxj: {
            originalId: task.id || null,
            originalUid: uid,
            duration: task.duration || '',
          },
        };
      });

    rawTasks.forEach((task, rawIndex) => {
      const row = tasks[rawIndex];
      if (!row || !Array.isArray(task.predecessors)) return;
      row.links = task.predecessors.map((link) => {
        const predId = taskUidToId.get(String(link.predecessorUid || link.id || link.uid || ''));
        if (!predId || predId === row.id) return null;
        return {
          id: predId,
          type: normalizeLinkTypeBridge(link.type),
          lagMinutes: Number(link.lagMinutes) || 0,
        };
      }).filter(Boolean);
      row.predecessors = row.links.map((link) => link.id);
    });

    const resourceUidMap = new Map();
    const resources = rawResources
      .filter((resource) => cleanText(resource.name) || Number(resource.uid) > 0)
      .map((resource, index) => {
        const uid = positiveNumber(resource.uid) || index + 1;
        resourceUidMap.set(String(uid), uid);
        resourceUidMap.set(String(resource.id || ''), uid);
        return {
          id: index + 1,
          uid,
          name: cleanText(resource.name) || `Resource ${index + 1}`,
          type: normalizeResourceType(resource.type),
          initials: cleanText(resource.initials),
          maxUnits: normalizeUnits(resource.maxUnits, 100),
          standardRate: moneyNumber(resource.standardRate),
          overtimeRate: moneyNumber(resource.overtimeRate),
          costPerUse: moneyNumber(resource.costPerUse),
          baseCalendar: 'Standard',
          group: cleanText(resource.group),
          email: cleanText(resource.email),
          notes: cleanText(resource.notes),
        };
      });

    let nextAssignmentUid = 1;
    rawAssignments.forEach((assignment) => {
      const taskId = taskUidToId.get(String(assignment.taskUid || assignment.taskId || ''));
      const resourceUid = resourceUidMap.get(String(assignment.resourceUid || assignment.resourceId || '')) || positiveNumber(assignment.resourceUid);
      const task = tasks.find((candidate) => candidate.id === taskId);
      if (!task || !resourceUid) return;
      const workMinutes = positiveNumber(assignment.workMinutes) || task.durationMinutes || 480;
      const actualWorkMinutes = positiveNumber(assignment.actualWorkMinutes) || 0;
      const remainingWorkMinutes = positiveNumber(assignment.remainingWorkMinutes) || Math.max(0, workMinutes - actualWorkMinutes);
      task.assignments.push(makeAssignment({
        uid: positiveNumber(assignment.uid) || nextAssignmentUid++,
        resourceUid,
        units: normalizeUnits(assignment.units, 100),
        workMinutes,
        actualWorkMinutes,
        remainingWorkMinutes,
      }));
    });

    const maxTaskUid = tasks.reduce((max, task) => Math.max(max, Number(task.uid) || 0), 0);
    const maxResourceUid = resources.reduce((max, resource) => Math.max(max, Number(resource.uid) || 0), 0);
    const maxAssignmentUid = tasks.flatMap((task) => task.assignments || []).reduce((max, assignment) => Math.max(max, Number(assignment.uid) || 0), 0);

    state = {
      projectName: cleanText(project.name) || stripExtension(file?.name || 'Imported MPP'),
      projectStart,
      nextUid: maxTaskUid + 1,
      nextResourceUid: maxResourceUid + 1,
      nextAssignmentUid: Math.max(maxAssignmentUid + 1, nextAssignmentUid),
      baselineSetAt: tasks.some((task) => task.baseline) ? new Date().toISOString() : '',
      activeView: 'schedule',
      calendar: normalizeBridgeCalendar(project, projectStart),
      tasks,
      resources,
      mppImportEngine: 'mpxj-bridge',
      mppBridgePayload: compactPayload(payload),
    };

    window.__lastMppImportResult = {
      sourceFile: file?.name || payload.sourceFile || 'project.mpp',
      mpxjBridge: payload,
      warnings: [],
      importPolish: { engine: 'mpxj-bridge' },
    };

    state.mppCompatibilityReport = buildBridgeCompatibilityReport(payload, tasks, resources);
    try { if (typeof saveState === 'function') saveState(); } catch {}
    try { render(); } catch {}
    return { tasks: tasks.length, resources: resources.length, assignments: countAssignments(tasks), links: countLinks(tasks), score: state.mppCompatibilityReport.score };
  }

  function buildBridgeCompatibilityReport(payload, tasks, resources) {
    const project = payload.project || {};
    const assignments = countAssignments(tasks);
    const links = countLinks(tasks);
    const tasksWithProgress = tasks.filter((task) => Number(task.percent) > 0 || task.actualStart || task.actualFinish).length;
    const tasksWithBaseline = tasks.filter((task) => task.baseline).length;
    const calendars = Array.isArray(project.calendars) ? project.calendars.length : 0;
    const checks = [];
    let score = 0;
    let weight = 0;
    add('Tasks', tasks.length > 0, 15, `${tasks.length} tasks`);
    add('Resources', resources.length > 0, 15, `${resources.length} resources`);
    add('Dependencies', links > 0, 12, `${links} links`);
    add('Calendars', calendars > 0, 10, `${calendars} calendars`);
    add('Progress', tasksWithProgress > 0, 8, `${tasksWithProgress} tasks`);
    add('Baselines', tasksWithBaseline > 0, 8, `${tasksWithBaseline} tasks`);
    add('Resource metadata', resources.some((r) => r.initials || r.standardRate || r.group || r.email), 8, `${resources.length} metadata`);
    add('Assignments', assignments > 0, 18, `${assignments} mapped`);
    add('Views/custom fields', false, 6, 'not mapped yet');

    return {
      version: '0.2.0-mpxj-bridge-compat',
      createdAt: new Date().toISOString(),
      source: payload.sourceFile || 'imported.mpp',
      engine: 'mpxj-bridge',
      score: weight ? Math.round(score / weight * 100) : 0,
      checks,
      warnings: [],
    };

    function add(name, passed, w, detail) {
      weight += w;
      if (passed) score += w;
      checks.push({ name, passed: Boolean(passed), weight: w, detail });
    }
  }

  function showBridgeSuccess(file, payload, imported) {
    const report = state.mppCompatibilityReport;
    setPanel(
      `Imported <code>${esc(file.name)}</code> through <strong>MPXJ Bridge</strong>. ` +
      `Tasks: ${imported.tasks}, resources: ${imported.resources}, assignments: ${imported.assignments}, dependencies: ${imported.links}. ` +
      `Compatibility score: <strong>${report?.score || imported.score}%</strong>.` +
      `<div class="mpp-actions"><button type="button" data-mpp-bridge-audit="1">Download MPXJ audit</button><button type="button" data-mpp-action="dismiss">Dismiss</button></div>`,
      'ok',
      'Full MPP engine'
    );
    mark('mpp-bridge-imported', { source: file.name, imported, diagnostics: payload.project?.diagnostics });
  }

  function showBridgeUnavailable(file) {
    const panel = document.getElementById('mppPanel');
    if (!panel || panel.dataset.bridgeUnavailableShown === '1') return;
    panel.dataset.bridgeUnavailableShown = '1';
    setPanel(
      `Full MPP engine is not running at <code>${BRIDGE_BASE}</code>. Using browser fallback for <code>${esc(file.name)}</code>. Start <code>start-mpxj-bridge.command</code> for true MPP ingest.`,
      'warn',
      'MPXJ Bridge offline'
    );
  }

  function installPanelActions() {
    document.addEventListener('click', (event) => {
      if (!event.target?.dataset?.mppBridgeAudit) return;
      const audit = {
        version: VERSION,
        compatibilityReport: state?.mppCompatibilityReport || null,
        bridgePayload: state?.mppBridgePayload || null,
      };
      const blob = new Blob([JSON.stringify(audit, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'mpxj-bridge-import-audit.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  function normalizeBridgeCalendar(project, projectStart) {
    const base = typeof normalizeCalendar === 'function'
      ? normalizeCalendar(state.calendar || {})
      : { name: 'Standard', workingDays: [1, 2, 3, 4, 5], exceptions: [], minutesPerDay: 480, defaultStartTime: '08:00:00', defaultFinishTime: '17:00:00' };
    return { ...base, name: base.name || 'Standard', projectStart };
  }

  function makeAssignment(input) {
    if (typeof normalizeAssignment === 'function') return normalizeAssignment(input);
    return input;
  }

  function setPanel(message, tone = 'info', label = 'MPP') {
    if (typeof setMppPanel === 'function') {
      setMppPanel(message, tone, label);
      return;
    }
    const panel = document.getElementById('mppPanel');
    if (!panel) return;
    panel.hidden = false;
    panel.classList.remove('mpp-ok', 'mpp-warn', 'mpp-busy');
    if (tone === 'ok') panel.classList.add('mpp-ok');
    if (tone === 'warn') panel.classList.add('mpp-warn');
    if (tone === 'busy') panel.classList.add('mpp-busy');
    panel.innerHTML = `<strong>${esc(label)}:</strong> ${message}`;
  }

  function compactPayload(payload) {
    const project = payload?.project || {};
    return {
      ok: payload?.ok,
      engine: payload?.engine,
      bridgeVersion: payload?.bridgeVersion,
      sourceFile: payload?.sourceFile,
      diagnostics: project.diagnostics || {},
      taskSample: (project.tasks || []).slice(0, 8),
      resourceSample: (project.resources || []).slice(0, 8),
      assignmentSample: (project.assignments || []).slice(0, 8),
    };
  }

  function countAssignments(tasks) {
    return (tasks || []).reduce((sum, task) => sum + ((task.assignments || []).length), 0);
  }

  function countLinks(tasks) {
    return (tasks || []).reduce((sum, task) => sum + ((task.links || []).length), 0);
  }

  function normalizeLinkTypeBridge(type) {
    const value = String(type || 'FS').toUpperCase();
    return ['FS', 'SS', 'FF', 'SF'].includes(value) ? value : 'FS';
  }

  function normalizeResourceType(type) {
    const value = String(type || 'Work').toLowerCase();
    if (value.includes('material')) return 'Material';
    if (value.includes('cost')) return 'Cost';
    return 'Work';
  }

  function normalizeUnits(value, fallback = 100) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    if (n <= 1.5) return Math.round(n * 100);
    return Math.max(0, Math.round(n));
  }

  function moneyNumber(value) {
    const n = Number(String(value ?? '').replace(/[^0-9.-]+/g, ''));
    return Number.isFinite(n) ? n : 0;
  }

  function positiveNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function clampPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function cleanDate(value) {
    if (!value) return '';
    const text = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
  }

  function cleanText(value) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function todayValue() {
    try { if (typeof today !== 'undefined') return today; } catch {}
    return new Date().toISOString().slice(0, 10);
  }

  function spanMinutes(start, finish) {
    const s = new Date(`${start}T00:00:00`);
    const f = new Date(`${finish}T00:00:00`);
    if (Number.isNaN(s.getTime()) || Number.isNaN(f.getTime())) return 0;
    return Math.max(0, Math.round((f - s) / 86400000) + 1) * 480;
  }

  function stripExtension(name) {
    return String(name || 'Imported MPP').replace(/\.[^.]+$/, '');
  }

  function message(error) {
    return error?.message || String(error || 'Unknown error');
  }

  function mark(type, data = {}) {
    try {
      const dbg = window.__mppDebug;
      if (dbg && Array.isArray(dbg.events)) {
        dbg.events.push({ t: `${Math.round(performance.now())}ms`, type, data });
        dbg.events = dbg.events.slice(-100);
        dbg.lastResult = data;
      }
      console.log('[MPP Bridge]', type, data);
    } catch {}
  }

  function installStyles() {
    if (document.getElementById('mppBridgeClientStyles')) return;
    const style = document.createElement('style');
    style.id = 'mppBridgeClientStyles';
    style.textContent = `
      .mpp-panel .mpp-actions button[data-mpp-bridge-audit] {
        border-color: #0f6cbd;
        color: #0f4f8c;
        background: #f5faff;
      }
    `;
    document.head.appendChild(style);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
})();
