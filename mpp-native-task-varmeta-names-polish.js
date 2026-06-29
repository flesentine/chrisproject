(() => {
  'use strict';

  const R = window.NativeMppReader;
  if (!R || window.__nativeMppTaskVarMetaNamesLoaded) return;
  window.__nativeMppTaskVarMetaNamesLoaded = true;

  const VERSION = '0.1.0-task-varmeta-name-fields';
  const utf8 = new TextDecoder('utf-8', { fatal: false });
  const utf16 = new TextDecoder('utf-16le', { fatal: false });
  const TASK_NAME_FIELDS = [0x0b400006, 0x0b408046, 0x0b408049, 0x0b60805b, 0x0b408054];

  const baseReadBuffer = R.readBuffer?.bind(R);
  const baseReadBufferAsync = R.readBufferAsync?.bind(R);
  const baseRead = R.read?.bind(R);

  if (baseReadBuffer) {
    R.readBuffer = (buffer, name = 'project.mpp', options = {}) => polish(buffer, baseReadBuffer(buffer, name, options), name);
  }

  if (baseReadBufferAsync) {
    R.readBufferAsync = async (buffer, name = 'project.mpp') => polish(buffer, await baseReadBufferAsync(buffer, name), name);
  }

  if (baseRead) {
    R.read = async (file) => {
      const buffer = await file.arrayBuffer();
      return R.readBufferAsync ? R.readBufferAsync(buffer, file.name || 'project.mpp') : polish(buffer, await baseRead(file), file.name || 'project.mpp');
    };
  }

  function polish(buffer, result, fileName) {
    if (!result?.mppContainerRead || !R.CompoundFileBinary) return result;
    try {
      const cfb = new R.CompoundFileBinary(buffer);
      const recovered = recoverVarMetaTaskRows(cfb);
      if (!recovered.tasks.length) return result;

      const existingCount = Number(result.project?.tasks?.length || 0);
      const existingGeneric = (result.project?.tasks || []).filter((task) => isBadTaskName(task?.name)).length;
      if (recovered.tasks.length >= Math.max(20, existingCount - 5) || existingGeneric > 0) {
        applyRecoveredRows(result, fileName, recovered);
      }
    } catch (error) {
      result.warnings = result.warnings || [];
      result.warnings.push(`Task VarMeta name recovery failed: ${error.message || error}`);
    }
    return result;
  }

  function recoverVarMetaTaskRows(cfb) {
    const metaEntry = entry(cfb, 'TBkndTask/VarMeta');
    const dataEntry = entry(cfb, 'TBkndTask/Var2Data');
    if (!metaEntry || !dataEntry) return { tasks: [], start: -1, nameFieldHits: {} };
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    if (meta.length < 32 || data.length < 8) return { tasks: [], start: -1, nameFieldHits: {} };

    let best = { tasks: [], start: -1, nameFieldHits: {} };
    for (const start of [8, 12, 16, 20, 24, 28, 32, 36]) {
      const rows = new Map();
      const nameFieldHits = {};
      for (let offset = start; offset + 12 <= meta.length; offset += 12) {
        const fieldId = u32(meta, offset);
        const rowId = u32(meta, offset + 4);
        const valueOffset = u32(meta, offset + 8);
        if (!plausibleField(fieldId) || !plausibleRow(rowId) || valueOffset >= data.length) continue;
        const text = normalizeName(readTextValue(data, valueOffset));
        if (!text) continue;
        if (!rows.has(rowId)) rows.set(rowId, new Map());
        const fields = rows.get(rowId);
        if (!fields.has(fieldId) || betterTaskName(text, fields.get(fieldId))) fields.set(fieldId, text);
        if (TASK_NAME_FIELDS.includes(fieldId) && isGoodTaskName(text)) nameFieldHits[fieldId] = (nameFieldHits[fieldId] || 0) + 1;
      }

      const tasks = [...rows.entries()]
        .map(([rowId, fields]) => ({ rowId, uniqueId: rowId, name: chooseTaskName(fields), fields }))
        .filter((task) => isGoodTaskName(task.name))
        .sort((a, b) => a.rowId - b.rowId)
        .map((task, index) => ({
          rowId: task.rowId,
          uniqueId: task.uniqueId,
          name: task.name,
          start: addDays('2026-01-01', index),
          finish: addDays('2026-01-01', index),
          outlineLevel: 1,
          isSummary: false,
        }));

      if (scoreRecovered(tasks, nameFieldHits) > scoreRecovered(best.tasks, best.nameFieldHits)) {
        best = { tasks, start, nameFieldHits };
      }
    }
    return best;
  }

  function applyRecoveredRows(result, fileName, recovered) {
    const projectName = cleanProjectName(fileName || result.fileName || 'Recovered MPP');
    result.projectXml = buildProjectXml(projectName, recovered.tasks);
    result.project = {
      name: projectName,
      start: recovered.tasks[0]?.start || '2026-01-01',
      taskCount: recovered.tasks.length,
      tasks: recovered.tasks.map((task, index) => ({
        id: index + 1,
        uid: index + 1,
        rowId: task.rowId,
        nativeUid: task.uniqueId,
        name: task.name,
        start: task.start,
        finish: task.finish,
        outlineLevel: task.outlineLevel || 1,
        isSummary: Boolean(task.isSummary),
        recovered: true,
        varMetaNameRecovered: true,
      })),
    };
    result.nativeTaskSkeleton = {
      ...(result.nativeTaskSkeleton || {}),
      version: VERSION,
      taskRows: recovered.tasks.length,
      namedRows: recovered.tasks.length,
      source: 'task-varmeta-name-fields',
      varMetaStart: recovered.start,
      nameFieldHits: recovered.nameFieldHits,
      confidence: 'medium task names from VarMeta name fields',
    };
    result.nativeTaskSkeletonDiagnostics = {
      ...(result.nativeTaskSkeletonDiagnostics || {}),
      version: VERSION,
      source: 'task-varmeta-name-fields',
      rows: recovered.tasks.length,
      namedRows: recovered.tasks.length,
      varMetaStart: recovered.start,
      nameFieldHits: recovered.nameFieldHits,
      firstNames: recovered.tasks.slice(0, 10).map((task) => task.name),
      lastNames: recovered.tasks.slice(-20).map((task) => task.name),
    };
    result.nativeTable = result.nativeTable || {};
    result.nativeTable.strategy = 'task-varmeta-name-fields';
    result.nativeTable.fieldCoverage = {
      ...(result.nativeTable.fieldCoverage || {}),
      taskVarMetaNameRows: recovered.tasks.length,
      taskVarMetaNameFields: recovered.nameFieldHits,
    };
    result.warnings = result.warnings || [];
    result.warnings.unshift(`Recovered ${recovered.tasks.length} task names from native MPP VarMeta task-name fields.`);
    result.embeddedXml = { stream: 'task-varmeta-name-fields', size: result.projectXml.length, nativeTable: true, skeleton: true };
  }

  function chooseTaskName(fields) {
    for (const field of TASK_NAME_FIELDS) {
      const text = fields.get(field);
      if (isGoodTaskName(text)) return text;
    }
    let best = '';
    fields.forEach((text) => {
      if (isGoodTaskName(text) && betterTaskName(text, best)) best = text;
    });
    return best;
  }

  function readTextValue(data, offset) {
    const view = dv(data);
    const candidates = [];
    const len32 = u32(data, offset);
    const len16 = u16(data, offset);
    const len8 = data[offset] || 0;
    if (len32 > 0 && len32 < 1024 && offset + 4 + len32 <= data.length) candidates.push(data.slice(offset + 4, offset + 4 + len32));
    if (len32 > 0 && len32 < 512 && offset + 4 + len32 * 2 <= data.length) candidates.push(data.slice(offset + 4, offset + 4 + len32 * 2));
    if (len16 > 0 && len16 < 512 && offset + 2 + len16 <= data.length) candidates.push(data.slice(offset + 2, offset + 2 + len16));
    if (len16 > 0 && len16 < 512 && offset + 2 + len16 * 2 <= data.length) candidates.push(data.slice(offset + 2, offset + 2 + len16 * 2));
    if (len8 > 0 && len8 < 255 && offset + 1 + len8 <= data.length) candidates.push(data.slice(offset + 1, offset + 1 + len8));

    for (const raw of candidates) {
      const text = decode(raw);
      if (text) return text;
    }
    return '';
  }

  function decode(raw) {
    if (!raw?.length) return '';
    if (raw.length % 2 === 0) {
      const s = utf16.decode(raw).replace(/\0+$/g, '').trim();
      if (looksText(s)) return s;
    }
    const a = utf8.decode(raw).replace(/\0+$/g, '').trim();
    return looksText(a) ? a : '';
  }

  function normalizeName(text) {
    const value = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!looksText(value) || value.length < 2 || value.length > 180) return '';
    return value;
  }

  function looksText(text) {
    if (!text || !/[A-Za-z\p{L}]/u.test(text) || /�/.test(text)) return false;
    const bad = (String(text).match(/[^\p{L}\p{N} ()/#&+.,'_:;\-<>|\[\]]/gu) || []).length;
    return bad <= Math.max(3, Math.floor(String(text).length / 4));
  }

  function isGoodTaskName(name) {
    const n = normalizeName(name);
    if (!n) return false;
    if (/^no\s+(deadline|program date|program baseline date)$/i.test(n)) return false;
    if (/^no\s+.*baseline.*date$/i.test(n)) return false;
    if (/^(complete|completed|finished|future|late|on[- ]?time|on-time \(or early\)|not started|in progress)$/i.test(n)) return false;
    if (/^[A-Z][a-z]{2}\s+\d{1,2}\/\d{1,2}\/\d{2,4}$/i.test(n)) return false;
    if (/^\d+(?:\.\d+)?$/.test(n)) return false;
    if (/^\d+\s*(FS|SS|FF|SF)(?:\s*[+-]\s*\d+\s*[dhwm]?)?(?:\s*,\s*\d+\s*(FS|SS|FF|SF)(?:\s*[+-]\s*\d+\s*[dhwm]?)?)*$/i.test(n)) return false;
    if (/^(task name|resource name|start|finish|duration|work|cost|calendar|notes|predecessors|successors)$/i.test(n)) return false;
    return true;
  }

  function isBadTaskName(name) { return !isGoodTaskName(name) || /^Task \d+$/i.test(String(name || '')); }

  function betterTaskName(a, b) {
    if (!b) return true;
    const ax = taskNameScore(a);
    const bx = taskNameScore(b);
    return ax > bx;
  }

  function taskNameScore(name) {
    const n = normalizeName(name);
    if (!n) return 0;
    let score = Math.min(80, n.length);
    if (/LF#|Drop|GUI|VM|ECU|ATP|STC|Rack|integration|development|testing|release|design|screen|manager|content|media|seat|VKB|PAC|DLH/i.test(n)) score += 40;
    if (/^(complete|completed|finished|future|late|no deadline)/i.test(n)) score -= 100;
    return score;
  }

  function scoreRecovered(tasks, hits) {
    const hitScore = Object.values(hits || {}).reduce((sum, value) => sum + Number(value || 0), 0);
    return tasks.length * 100 + hitScore;
  }

  function buildProjectXml(projectName, tasks) {
    const created = new Date().toISOString().replace(/\.\d{3}Z$/, '');
    const start = tasks[0]?.start || '2026-01-01';
    const finish = tasks[tasks.length - 1]?.finish || start;
    const taskXml = tasks.map((task, index) => {
      const uid = index + 1;
      const outlineLevel = Math.max(1, Math.min(20, Number(task.outlineLevel) || 1));
      return `\n    <Task>\n      <UID>${uid}</UID>\n      <ID>${uid}</ID>\n      <Name>${esc(task.name)}</Name>\n      <Type>1</Type>\n      <IsNull>0</IsNull>\n      <CreateDate>${created}</CreateDate>\n      <WBS>${uid}</WBS>\n      <OutlineNumber>${uid}</OutlineNumber>\n      <OutlineLevel>${outlineLevel}</OutlineLevel>\n      <Start>${task.start}T08:00:00</Start>\n      <Finish>${task.finish}T17:00:00</Finish>\n      <Duration>PT8H0M0S</Duration>\n      <DurationFormat>7</DurationFormat>\n      <Work>PT8H0M0S</Work>\n      <Summary>${task.isSummary ? 1 : 0}</Summary>\n      <Manual>1</Manual>\n    </Task>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Project xmlns="http://schemas.microsoft.com/project">\n  <SaveVersion>12</SaveVersion>\n  <Name>${esc(projectName)}</Name>\n  <Title>${esc(projectName)}</Title>\n  <Subject>Recovered locally from native MPP VarMeta task-name fields</Subject>\n  <CreationDate>${created}</CreationDate>\n  <ScheduleFromStart>1</ScheduleFromStart>\n  <StartDate>${start}T08:00:00</StartDate>\n  <FinishDate>${finish}T17:00:00</FinishDate>\n  <CalendarUID>1</CalendarUID>\n  <DefaultStartTime>08:00:00</DefaultStartTime>\n  <DefaultFinishTime>17:00:00</DefaultFinishTime>\n  <MinutesPerDay>480</MinutesPerDay>\n  <MinutesPerWeek>2400</MinutesPerWeek>\n  <DaysPerMonth>20</DaysPerMonth>\n  <Tasks>${taskXml}\n  </Tasks>\n</Project>`;
  }

  function plausibleField(value) { return Number.isFinite(value) && value >= 0x0b000000 && value <= 0x0cffffff; }
  function plausibleRow(value) { return Number.isFinite(value) && value > 0 && value < 2000000; }
  function entry(cfb, suffix) { const s = String(suffix || '').toLowerCase(); return cfb.entries.find((item) => item.type === 2 && String(item.path || '').toLowerCase().endsWith(s)) || null; }
  function dv(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  function u16(bytes, offset) { return offset + 2 <= bytes.length ? dv(bytes).getUint16(offset, true) : 0; }
  function u32(bytes, offset) { return offset + 4 <= bytes.length ? dv(bytes).getUint32(offset, true) : 0; }
  function addDays(iso, days) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Number(days || 0)); return d.toISOString().slice(0, 10); }
  function cleanProjectName(fileName) { return String(fileName || 'Recovered MPP').replace(/\.mpp$/i, '').replace(/[_-]+/g, ' ').trim() || 'Recovered MPP'; }
  function esc(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
})();
