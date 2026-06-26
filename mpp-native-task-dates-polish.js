(() => {
  'use strict';

  const R = window.NativeMppReader;
  if (!R || window.__nativeMppTaskDatesPolishLoaded) return;
  window.__nativeMppTaskDatesPolishLoaded = true;

  const VERSION = '0.1.0-task-date-hints';
  const BASE_1984 = Date.UTC(1984, 0, 1);
  const BASE_1899 = Date.UTC(1899, 11, 30);
  const utf8 = new TextDecoder('utf-8', { fatal: false });
  const utf16 = new TextDecoder('utf-16le', { fatal: false });
  const baseReadBuffer = R.readBuffer?.bind(R);
  const baseReadBufferAsync = R.readBufferAsync?.bind(R);
  const baseRead = R.read?.bind(R);

  if (baseReadBuffer) R.readBuffer = (buffer, name = 'project.mpp', options = {}) => polish(buffer, baseReadBuffer(buffer, name, options), name);
  if (baseReadBufferAsync) R.readBufferAsync = async (buffer, name = 'project.mpp') => polish(buffer, await baseReadBufferAsync(buffer, name), name);
  if (baseRead) R.read = async (file) => {
    const buffer = await file.arrayBuffer();
    return R.readBufferAsync ? R.readBufferAsync(buffer, file.name || 'project.mpp') : polish(buffer, await baseRead(file), file.name || 'project.mpp');
  };

  function polish(buffer, result, fileName) {
    const tasks = result?.project?.tasks || [];
    if (!result?.mppContainerRead || !tasks.length || !R.CompoundFileBinary) return result;
    try {
      const cfb = new R.CompoundFileBinary(buffer);
      const rowDates = readTaskDateRows(cfb);
      if (!rowDates.rows.size) return addCoverage(result, rowDates, 0, 0, 'none');

      let applied = 0;
      let durationRows = 0;
      const updated = tasks.map((task, index) => {
        const row = rowDates.rows.get(Number(task.rowId)) || rowDates.rows.get(Number(task.nativeUid)) || null;
        if (!row?.dates?.length) return normalizeTask(task, index);
        const current = normalizeTask(task, index);
        const start = row.start || row.dates[0];
        const finish = row.finish || row.dates[row.dates.length - 1] || start;
        if (!validIso(start) || !validIso(finish)) return current;
        applied += 1;
        if (row.durationMinutes) durationRows += 1;
        return {
          ...current,
          start,
          finish: finish < start ? start : finish,
          durationMinutes: row.durationMinutes || current.durationMinutes || null,
          durationDays: row.durationMinutes ? Math.max(1, Math.round(row.durationMinutes / 480)) : current.durationDays,
          dateSource: row.source,
        };
      });

      const coverage = applied / Math.max(1, tasks.length);
      const threshold = tasks.length <= 5 ? 1 : Math.max(3, Math.ceil(tasks.length * 0.15));
      if (applied < threshold && coverage < 0.15) return addCoverage(result, rowDates, applied, durationRows, 'low-coverage-not-applied');

      const projectName = result.project?.name || cleanName(fileName || result.fileName || 'Recovered MPP');
      result.projectXml = buildProjectXml(projectName, updated);
      result.project = {
        ...result.project,
        name: projectName,
        start: updated.reduce((min, task) => task.start && task.start < min ? task.start : min, updated[0]?.start || ''),
        taskCount: updated.length,
        tasks: updated,
      };
      result.nativeTaskDates = {
        version: VERSION,
        rowsScanned: rowDates.rows.size,
        appliedRows: applied,
        durationRows,
        coverage: Math.round(coverage * 100),
        confidence: coverage >= 0.6 ? 'medium' : 'low-medium',
        strategy: rowDates.strategy,
        samples: [...rowDates.rows.entries()].slice(0, 20).map(([rowId, row]) => ({ rowId, dates: row.dates, durationMinutes: row.durationMinutes || 0, source: row.source })),
      };
      addCoverage(result, rowDates, applied, durationRows, 'applied');
      result.warnings = result.warnings || [];
      result.warnings.unshift(`Applied ${applied} native task date hint${applied === 1 ? '' : 's'} from TBkndTask variable fields (${Math.round(coverage * 100)}% coverage). Review date fidelity before relying on this import.`);
    } catch (error) {
      result.warnings = result.warnings || [];
      result.warnings.push(`Native task date recovery failed: ${error.message || error}`);
    }
    return result;
  }

  function addCoverage(result, scan, applied, durationRows, verdict) {
    result.nativeTaskDates = result.nativeTaskDates || {
      version: VERSION,
      rowsScanned: scan?.rows?.size || 0,
      appliedRows: applied || 0,
      durationRows: durationRows || 0,
      coverage: 0,
      confidence: 'none',
      strategy: scan?.strategy || 'none',
      verdict,
    };
    result.nativeTable = result.nativeTable || {};
    result.nativeTable.fieldCoverage = {
      ...(result.nativeTable.fieldCoverage || {}),
      taskDateRows: scan?.rows?.size || 0,
      taskDatesApplied: applied || 0,
      taskDurationRows: durationRows || 0,
      taskDateConfidence: result.nativeTaskDates.confidence || 'none',
    };
    return result;
  }

  function readTaskDateRows(cfb) {
    const metaEntry = entry(cfb, 'TBkndTask/VarMeta');
    const dataEntry = entry(cfb, 'TBkndTask/Var2Data');
    const rows = new Map();
    if (!metaEntry || !dataEntry) return { rows, strategy: 'no-var-pair' };
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    if (meta.length < 28 || data.length < 8) return { rows, strategy: 'empty-var-pair' };
    const view = dv(meta);
    const best = chooseMetaStart(meta, data);
    for (let offset = best.start; offset + 12 <= meta.length; offset += 12) {
      const fieldId = u32(view, offset);
      const rowId = u32(view, offset + 4);
      const valueOffset = u32(view, offset + 8);
      if (!plausibleRow(rowId) || valueOffset >= data.length) continue;
      const value = decodeValue(data, valueOffset);
      const dates = value.dateCandidates;
      const duration = value.durationMinutes;
      if (!dates.length && !duration) continue;
      const row = rows.get(rowId) || { rowId, dates: [], durationMinutes: 0, fields: [], source: 'varmeta' };
      dates.forEach((date) => { if (!row.dates.includes(date)) row.dates.push(date); });
      if (duration && !row.durationMinutes) row.durationMinutes = duration;
      row.fields.push({ fieldId: hex(fieldId), offset: valueOffset, dates, durationMinutes: duration || 0, method: value.method });
      rows.set(rowId, row);
    }
    for (const row of rows.values()) {
      row.dates = row.dates.sort();
      row.start = row.dates[0] || '';
      row.finish = row.dates[row.dates.length - 1] || row.start;
    }
    return { rows, strategy: `varmeta-start-${best.start}` };
  }

  function chooseMetaStart(meta, data) {
    const view = dv(meta);
    let best = { start: 16, hits: -1 };
    for (const start of [16, 20, 24, 28, 32]) {
      let hits = 0;
      for (let offset = start; offset + 12 <= meta.length; offset += 12) {
        const rowId = u32(view, offset + 4);
        const valueOffset = u32(view, offset + 8);
        if (!plausibleRow(rowId) || valueOffset >= data.length) continue;
        const decoded = decodeValue(data, valueOffset);
        if (decoded.dateCandidates.length || decoded.durationMinutes) hits += 1;
      }
      if (hits > best.hits) best = { start, hits };
    }
    return best;
  }

  function decodeValue(data, offset) {
    const candidates = rawCandidates(data, offset);
    const dates = [];
    let durationMinutes = 0;
    let method = '';
    for (const item of candidates) {
      const itemDates = decodeDates(item.bytes);
      if (itemDates.length) {
        itemDates.forEach((date) => { if (!dates.includes(date)) dates.push(date); });
        method = method || item.kind;
      }
      const duration = decodeDuration(item.bytes);
      if (duration && !durationMinutes) durationMinutes = duration;
    }
    return { dateCandidates: dates.sort(), durationMinutes, method };
  }

  function rawCandidates(data, offset) {
    const view = dv(data);
    const out = [];
    const add = (kind, start, len) => {
      if (len > 0 && len <= 1024 && start >= 0 && start + len <= data.length) out.push({ kind, bytes: data.slice(start, start + len) });
    };
    add('direct-4', offset, 4);
    add('direct-8', offset, 8);
    const len8 = data[offset] || 0;
    const len16 = u16(view, offset);
    const len32 = u32(view, offset);
    if (len8 > 0 && len8 < 255) add('len8', offset + 1, len8);
    if (len16 > 0 && len16 < 512) {
      add('len16-bytes', offset + 2, len16);
      add('len16-utf16', offset + 2, len16 * 2);
    }
    if (len32 > 0 && len32 < 1024) {
      add('len32-bytes', offset + 4, len32);
      add('len32-utf16', offset + 4, len32 * 2);
    }
    return out;
  }

  function decodeDates(bytes) {
    const out = [];
    const add = (date) => { if (validIso(date) && !out.includes(date)) out.push(date); };
    const text = decodeText(bytes);
    if (text) add(parseDisplayDate(text));
    if (bytes.length >= 4) {
      const view = dv(bytes);
      const i = view.getInt32(0, true);
      const u = view.getUint32(0, true);
      add(minutesFrom1984(i));
      add(minutesFrom1984(u));
      add(daysFrom1984(i));
      add(daysFrom1899(i));
    }
    if (bytes.length >= 8) {
      const view = dv(bytes);
      const lo = u32(view, 0);
      const hi = u32(view, 4);
      add(filetimeToIso(lo, hi));
      const f = view.getFloat64(0, true);
      add(oleFloatToIso(f));
      add(daysFrom1984(f));
      add(minutesFrom1984(f));
    }
    return out.filter(Boolean).sort();
  }

  function decodeDuration(bytes) {
    if (bytes.length < 4) return 0;
    const view = dv(bytes);
    const vals = [];
    vals.push(view.getInt32(0, true));
    vals.push(view.getUint32(0, true));
    if (bytes.length >= 8) vals.push(view.getFloat64(0, true));
    for (const value of vals) {
      if (Number.isFinite(value) && value > 0 && value <= 480 * 365 * 5) return Math.round(value);
    }
    return 0;
  }

  function parseDisplayDate(value) {
    const text = String(value || '').replace(/\bat\b/ig, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    let m = /(?:(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+)?(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})/.exec(text);
    if (m) {
      const a = Number(m[2]);
      const b = Number(m[3]);
      const y = normalizeYear(Number(m[4]));
      const candidates = [makeDate(y, a, b), makeDate(y, b, a)].filter(Boolean);
      if (a > 12) return candidates[1] || candidates[0] || '';
      if (b > 12) return candidates[0] || candidates[1] || '';
      return candidates[0] || '';
    }
    m = /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{2}|\d{4})/i.exec(text);
    if (m) {
      const month = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
      return makeDate(normalizeYear(Number(m[3])), month, Number(m[1])) || '';
    }
    return '';
  }

  function normalizeTask(task, index) {
    return {
      id: task.id || index + 1,
      rowId: task.rowId || index + 1,
      uid: task.uid || index + 1,
      nativeUid: task.nativeUid || task.uniqueId || task.uid || index + 1,
      name: task.name || `Task ${index + 1}`,
      start: task.start || addDays('2026-01-01', index),
      finish: task.finish || task.start || addDays('2026-01-01', index),
      outlineLevel: task.outlineLevel || 1,
      isSummary: Boolean(task.isSummary),
      skeleton: task.skeleton !== false,
      durationDays: task.durationDays || 1,
    };
  }

  function buildProjectXml(projectName, tasks) {
    const created = new Date().toISOString().replace(/\.\d{3}Z$/, '');
    const start = tasks.reduce((min, task) => task.start && task.start < min ? task.start : min, tasks[0]?.start || '2026-01-01');
    const finish = tasks.reduce((max, task) => task.finish && task.finish > max ? task.finish : max, tasks[0]?.finish || start);
    const taskXml = tasks.map((task, index) => {
      const duration = Math.max(1, daysBetween(task.start, task.finish));
      return `\n    <Task>\n      <UID>${index + 1}</UID>\n      <ID>${index + 1}</ID>\n      <Name>${esc(task.name)}</Name>\n      <Type>1</Type>\n      <IsNull>0</IsNull>\n      <CreateDate>${created}</CreateDate>\n      <WBS>${index + 1}</WBS>\n      <OutlineNumber>${index + 1}</OutlineNumber>\n      <OutlineLevel>${Math.max(1, Number(task.outlineLevel) || 1)}</OutlineLevel>\n      <Start>${task.start}T08:00:00</Start>\n      <Finish>${task.finish}T17:00:00</Finish>\n      <Duration>PT${duration * 8}H0M0S</Duration>\n      <DurationFormat>7</DurationFormat>\n      <Work>PT${duration * 8}H0M0S</Work>\n      <Summary>${task.isSummary ? 1 : 0}</Summary>\n      <Manual>1</Manual>\n    </Task>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Project xmlns="http://schemas.microsoft.com/project">\n  <SaveVersion>12</SaveVersion>\n  <Name>${esc(projectName)}</Name>\n  <Title>${esc(projectName)}</Title>\n  <Subject>Recovered from native MPP task rows with date hints</Subject>\n  <CreationDate>${created}</CreationDate>\n  <ScheduleFromStart>1</ScheduleFromStart>\n  <StartDate>${start}T08:00:00</StartDate>\n  <FinishDate>${finish}T17:00:00</FinishDate>\n  <CalendarUID>1</CalendarUID>\n  <DefaultStartTime>08:00:00</DefaultStartTime>\n  <DefaultFinishTime>17:00:00</DefaultFinishTime>\n  <MinutesPerDay>480</MinutesPerDay>\n  <MinutesPerWeek>2400</MinutesPerWeek>\n  <DaysPerMonth>20</DaysPerMonth>\n  <Tasks>${taskXml}\n  </Tasks>\n</Project>`;
  }

  function decodeText(bytes) {
    if (!bytes?.length) return '';
    if (bytes.length % 2 === 0) {
      const text = utf16.decode(bytes).replace(/\0+$/g, '').trim();
      if (/[A-Za-z]/.test(text) && /\d/.test(text)) return text;
    }
    const ascii = utf8.decode(bytes).replace(/\0+$/g, '').trim();
    return /[A-Za-z]/.test(ascii) && /\d/.test(ascii) ? ascii : '';
  }

  function validIso(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && Number(value.slice(0, 4)) >= 1984 && Number(value.slice(0, 4)) <= 2099; }
  function minutesFrom1984(value) { return Number.isFinite(value) && value > 0 && value < 61000000 ? iso(new Date(BASE_1984 + Math.round(value) * 60000)) : ''; }
  function daysFrom1984(value) { return Number.isFinite(value) && value > 0 && value < 43000 ? iso(new Date(BASE_1984 + Math.round(value) * 86400000)) : ''; }
  function daysFrom1899(value) { return Number.isFinite(value) && value > 30000 && value < 80000 ? iso(new Date(BASE_1899 + Math.round(value) * 86400000)) : ''; }
  function oleFloatToIso(value) { return Number.isFinite(value) && value > 30000 && value < 80000 ? iso(new Date(BASE_1899 + value * 86400000)) : ''; }
  function filetimeToIso(lo, hi) { const n = hi * 4294967296 + lo; if (!Number.isFinite(n) || n <= 0) return ''; return iso(new Date(n / 10000 - 11644473600000)); }
  function iso(date) { return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : ''; }
  function normalizeYear(y) { return y < 100 ? y + (y >= 80 ? 1900 : 2000) : y; }
  function makeDate(year, month, day) { const d = new Date(Date.UTC(year, month - 1, day)); return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? iso(d) : ''; }
  function daysBetween(start, finish) { const a = new Date(`${start}T00:00:00Z`); const b = new Date(`${finish}T00:00:00Z`); if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 1; return Math.max(1, Math.round((b - a) / 86400000) + 1); }
  function addDays(isoValue, days) { const d = new Date(`${isoValue}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Number(days || 0)); return d.toISOString().slice(0, 10); }
  function plausibleRow(value) { return Number.isFinite(value) && value > 0 && value < 2000000; }
  function entry(cfb, suffix) { const s = String(suffix || '').toLowerCase(); return cfb.entries.find((item) => item.type === 2 && String(item.path || '').toLowerCase().endsWith(s)) || null; }
  function dv(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  function u16(view, offset) { return offset + 2 <= view.byteLength ? view.getUint16(offset, true) : 0; }
  function u32(view, offset) { return offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0; }
  function hex(value) { return `0x${Number(value || 0).toString(16)}`; }
  function cleanName(fileName) { return String(fileName || 'Recovered MPP').replace(/\.mpp$/i, '').replace(/[_-]+/g, ' ').trim() || 'Recovered MPP'; }
  function esc(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
})();
