(() => {
  'use strict';

  const R = window.NativeMppReader;
  if (!R || window.__nativeMppTaskFixedDatesLoaded) return;
  window.__nativeMppTaskFixedDatesLoaded = true;

  const VERSION = '0.1.0-task-fixed-date-scan';
  const BASE_1984 = Date.UTC(1984, 0, 1);
  const BASE_1899 = Date.UTC(1899, 11, 30);
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
      const scan = scanFixedTables(cfb, tasks);
      if (!scan.rows.size) return addCoverage(result, scan, 0, 'no-fixed-date-rows');

      const updated = [];
      let applied = 0;
      for (let index = 0; index < tasks.length; index += 1) {
        const task = normalizeTask(tasks[index], index);
        const keyCandidates = [Number(task.rowId), Number(task.nativeUid), Number(task.uniqueId), Number(task.uid)].filter(Boolean);
        let row = null;
        for (const key of keyCandidates) {
          row = scan.rows.get(key);
          if (row) break;
        }
        if (!row?.start || !row?.finish) {
          updated.push(task);
          continue;
        }
        applied += 1;
        updated.push({
          ...task,
          start: row.start,
          finish: row.finish < row.start ? row.start : row.finish,
          fixedDateSource: row.source,
          fixedDateOffsets: row.offsets,
        });
      }

      const coverage = applied / Math.max(1, tasks.length);
      const threshold = tasks.length <= 5 ? 1 : Math.max(3, Math.ceil(tasks.length * 0.2));
      if (applied < threshold && coverage < 0.2) return addCoverage(result, scan, applied, 'low-coverage-not-applied');

      const projectName = result.project?.name || cleanName(fileName || result.fileName || 'Recovered MPP');
      result.projectXml = buildProjectXml(projectName, updated);
      result.project = {
        ...result.project,
        name: projectName,
        start: updated.reduce((min, task) => task.start && task.start < min ? task.start : min, updated[0]?.start || ''),
        taskCount: updated.length,
        tasks: updated,
      };
      result.nativeTaskFixedDates = {
        version: VERSION,
        table: scan.table,
        rowsScanned: scan.candidateRows,
        rowsWithDates: scan.rows.size,
        appliedRows: applied,
        coverage: Math.round(coverage * 100),
        confidence: coverage >= 0.6 ? 'medium' : 'low-medium',
        selectedOffsets: scan.selectedOffsets,
        samples: [...scan.rows.entries()].slice(0, 20).map(([rowId, row]) => ({ rowId, start: row.start, finish: row.finish, offsets: row.offsets, source: row.source })),
      };
      addCoverage(result, scan, applied, 'applied');
      result.warnings = result.warnings || [];
      result.warnings.unshift(`Applied ${applied} native task fixed-row date hint${applied === 1 ? '' : 's'} (${Math.round(coverage * 100)}% coverage). Review date fidelity before relying on this import.`);
    } catch (error) {
      result.warnings = result.warnings || [];
      result.warnings.push(`Native task fixed-date recovery failed: ${error.message || error}`);
    }
    return result;
  }

  function addCoverage(result, scan, applied, verdict) {
    result.nativeTaskFixedDates = result.nativeTaskFixedDates || {
      version: VERSION,
      table: scan?.table || 'none',
      rowsScanned: scan?.candidateRows || 0,
      rowsWithDates: scan?.rows?.size || 0,
      appliedRows: applied || 0,
      coverage: 0,
      confidence: 'none',
      selectedOffsets: scan?.selectedOffsets || [],
      verdict,
    };
    result.nativeTable = result.nativeTable || {};
    result.nativeTable.fieldCoverage = {
      ...(result.nativeTable.fieldCoverage || {}),
      taskFixedDateRows: scan?.rows?.size || 0,
      taskFixedDatesApplied: applied || 0,
      taskFixedDateConfidence: result.nativeTaskFixedDates.confidence || 'none',
      taskFixedDateTable: result.nativeTaskFixedDates.table || 'none',
    };
    return result;
  }

  function scanFixedTables(cfb, tasks) {
    const taskKeys = new Set();
    tasks.forEach((task, index) => {
      [task.rowId, task.nativeUid, task.uniqueId, task.uid, index + 1].forEach((value) => {
        const n = Number(value);
        if (n > 0 && n < 2000000) taskKeys.add(n);
      });
    });
    const scans = [
      scanOneTable(cfb, 'TBkndTask/FixedMeta', 'TBkndTask/FixedData', taskKeys, 'FixedData'),
      scanOneTable(cfb, 'TBkndTask/Fixed2Meta', 'TBkndTask/Fixed2Data', taskKeys, 'Fixed2Data'),
    ];
    scans.sort((a, b) => scoreScan(b) - scoreScan(a));
    return scans[0] || { rows: new Map(), candidateRows: 0, selectedOffsets: [], table: 'none' };
  }

  function scoreScan(scan) {
    return (scan.rows?.size || 0) * 20 + (scan.selectedOffsets?.length || 0) * 3 + (scan.candidateRows || 0);
  }

  function scanOneTable(cfb, metaSuffix, dataSuffix, taskKeys, table) {
    const metaEntry = entry(cfb, metaSuffix);
    const dataEntry = entry(cfb, dataSuffix);
    if (!metaEntry || !dataEntry) return { rows: new Map(), candidateRows: 0, selectedOffsets: [], table };
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    const candidateRows = splitFixedRows(meta, data);
    const knownRows = candidateRows.filter((row) => taskKeys.has(row.rowId) || taskKeys.has(row.uniqueId));
    const rowsForOffsets = knownRows.length >= 3 ? knownRows : candidateRows;
    const offsetStats = collectOffsetStats(rowsForOffsets);
    const selectedOffsets = chooseOffsets(offsetStats, rowsForOffsets.length);
    const rows = new Map();
    for (const row of knownRows) {
      const found = collectDatesForRow(row, selectedOffsets);
      if (!found.start || !found.finish) continue;
      const key = taskKeys.has(row.rowId) ? row.rowId : row.uniqueId;
      rows.set(key, { start: found.start, finish: found.finish, offsets: found.offsets, source: table });
    }
    return { rows, candidateRows: candidateRows.length, selectedOffsets, table };
  }

  function splitFixedRows(meta, data) {
    if (!meta?.length || !data?.length) return [];
    const view = dv(meta);
    const declared = u32(view, 8);
    const starts = [16, 20, 24, 28, 32];
    const sizes = [8, 12, 16, 24, 32, 40, 47, 48, 56, 64, 80, 92, 96, 112, 128];
    let best = [];
    for (const start of starts) {
      for (const size of sizes) {
        const count = declared > 0 && declared < 100000 && start + declared * size <= meta.length ? declared : Math.floor((meta.length - start) / size);
        if (count <= 0 || count > 100000) continue;
        const offsets = [];
        for (let i = 0; i < count; i += 1) {
          const base = start + i * size;
          if (base + 8 > meta.length) break;
          const off = i32(view, base + 4);
          if (off >= 0 && off < data.length) offsets.push(off);
        }
        const rows = rowsFromOffsets(offsets, data);
        if (rows.length > best.length) best = rows;
      }
    }
    return best;
  }

  function rowsFromOffsets(offsets, data) {
    const clean = [...new Set(offsets)].sort((a, b) => a - b);
    const rows = [];
    clean.forEach((offset, index) => {
      const end = index + 1 < clean.length ? clean[index + 1] : Math.min(data.length, offset + 768);
      if (end - offset < 8) return;
      const bytes = data.slice(offset, end);
      const view = dv(bytes);
      const a = u32(view, 0);
      const b = u32(view, 4);
      const rowId = plausibleId(b) ? b : plausibleId(a) ? a : index + 1;
      const uniqueId = plausibleId(a) ? a : rowId;
      rows.push({ rowId, uniqueId, bytes, index });
    });
    return rows;
  }

  function collectOffsetStats(rows) {
    const stats = new Map();
    rows.forEach((row) => {
      const view = dv(row.bytes);
      for (let offset = 0; offset + 4 <= row.bytes.length; offset += 2) {
        const dates = decodeDatesAt(view, offset);
        dates.forEach((date) => {
          const key = `${offset}:${date.method}`;
          const stat = stats.get(key) || { offset, method: date.method, count: 0, values: new Set() };
          stat.count += 1;
          stat.values.add(date.iso);
          stats.set(key, stat);
        });
      }
    });
    return [...stats.values()];
  }

  function chooseOffsets(stats, rowCount) {
    const minCount = Math.max(2, Math.ceil(Math.max(1, rowCount) * 0.25));
    return stats
      .filter((stat) => stat.count >= minCount && stat.values.size >= Math.min(2, stat.count))
      .sort((a, b) => b.count - a.count || b.values.size - a.values.size)
      .slice(0, 8)
      .map((stat) => ({ offset: stat.offset, method: stat.method, count: stat.count, uniqueDates: stat.values.size }));
  }

  function collectDatesForRow(row, selectedOffsets) {
    const view = dv(row.bytes);
    const values = [];
    selectedOffsets.forEach((item) => {
      const dates = decodeDatesAt(view, item.offset).filter((date) => date.method === item.method);
      dates.forEach((date) => values.push({ iso: date.iso, offset: item.offset, method: item.method }));
    });
    const unique = [];
    values.sort((a, b) => a.iso.localeCompare(b.iso)).forEach((item) => {
      if (!unique.some((existing) => existing.iso === item.iso)) unique.push(item);
    });
    if (!unique.length) return { start: '', finish: '', offsets: [] };
    return {
      start: unique[0].iso,
      finish: unique[unique.length - 1].iso,
      offsets: unique.map((item) => `${item.offset}:${item.method}`),
    };
  }

  function decodeDatesAt(view, offset) {
    const out = [];
    const add = (isoValue, method) => {
      if (validIso(isoValue) && !out.some((item) => item.iso === isoValue && item.method === method)) out.push({ iso: isoValue, method });
    };
    if (offset + 4 <= view.byteLength) {
      const i = view.getInt32(offset, true);
      const u = view.getUint32(offset, true);
      add(minutesFrom1984(i), 'i32-min1984');
      add(minutesFrom1984(u), 'u32-min1984');
      add(daysFrom1984(i), 'i32-day1984');
      add(daysFrom1899(i), 'i32-day1899');
    }
    if (offset + 8 <= view.byteLength) {
      const lo = view.getUint32(offset, true);
      const hi = view.getUint32(offset + 4, true);
      add(filetimeToIso(lo, hi), 'filetime');
      const f = view.getFloat64(offset, true);
      add(oleFloatToIso(f), 'f64-ole');
      add(daysFrom1984(f), 'f64-day1984');
      add(minutesFrom1984(f), 'f64-min1984');
    }
    return out;
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
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Project xmlns="http://schemas.microsoft.com/project">\n  <SaveVersion>12</SaveVersion>\n  <Name>${esc(projectName)}</Name>\n  <Title>${esc(projectName)}</Title>\n  <Subject>Recovered from native MPP fixed task rows</Subject>\n  <CreationDate>${created}</CreationDate>\n  <ScheduleFromStart>1</ScheduleFromStart>\n  <StartDate>${start}T08:00:00</StartDate>\n  <FinishDate>${finish}T17:00:00</FinishDate>\n  <CalendarUID>1</CalendarUID>\n  <DefaultStartTime>08:00:00</DefaultStartTime>\n  <DefaultFinishTime>17:00:00</DefaultFinishTime>\n  <MinutesPerDay>480</MinutesPerDay>\n  <MinutesPerWeek>2400</MinutesPerWeek>\n  <DaysPerMonth>20</DaysPerMonth>\n  <Tasks>${taskXml}\n  </Tasks>\n</Project>`;
  }

  function validIso(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && Number(value.slice(0, 4)) >= 1984 && Number(value.slice(0, 4)) <= 2099; }
  function minutesFrom1984(value) { return Number.isFinite(value) && value > 0 && value < 61000000 ? iso(new Date(BASE_1984 + Math.round(value) * 60000)) : ''; }
  function daysFrom1984(value) { return Number.isFinite(value) && value > 0 && value < 43000 ? iso(new Date(BASE_1984 + Math.round(value) * 86400000)) : ''; }
  function daysFrom1899(value) { return Number.isFinite(value) && value > 30000 && value < 80000 ? iso(new Date(BASE_1899 + Math.round(value) * 86400000)) : ''; }
  function oleFloatToIso(value) { return Number.isFinite(value) && value > 30000 && value < 80000 ? iso(new Date(BASE_1899 + value * 86400000)) : ''; }
  function filetimeToIso(lo, hi) { const n = hi * 4294967296 + lo; return Number.isFinite(n) && n > 0 ? iso(new Date(n / 10000 - 11644473600000)) : ''; }
  function iso(date) { return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : ''; }
  function daysBetween(start, finish) { const a = new Date(`${start}T00:00:00Z`); const b = new Date(`${finish}T00:00:00Z`); return Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) ? 1 : Math.max(1, Math.round((b - a) / 86400000) + 1); }
  function addDays(isoValue, days) { const d = new Date(`${isoValue}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Number(days || 0)); return d.toISOString().slice(0, 10); }
  function plausibleId(value) { return Number.isFinite(value) && value > 0 && value < 2000000; }
  function entry(cfb, suffix) { const s = String(suffix || '').toLowerCase(); return cfb.entries.find((item) => item.type === 2 && String(item.path || '').toLowerCase().endsWith(s)) || null; }
  function dv(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  function u32(view, offset) { return offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0; }
  function i32(view, offset) { return offset + 4 <= view.byteLength ? view.getInt32(offset, true) : -1; }
  function cleanName(fileName) { return String(fileName || 'Recovered MPP').replace(/\.mpp$/i, '').replace(/[_-]+/g, ' ').trim() || 'Recovered MPP'; }
  function esc(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
})();
