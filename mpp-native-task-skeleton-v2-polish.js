(() => {
  'use strict';

  const R = window.NativeMppReader;
  if (!R || window.__nativeMppTaskSkeletonV2Loaded) return;
  window.__nativeMppTaskSkeletonV2Loaded = true;

  const VERSION = '0.2.0-task-skeleton-v2';
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
    if (!result?.mppContainerRead || !R.CompoundFileBinary) return result;
    try {
      const cfb = new R.CompoundFileBinary(buffer);
      const draftNames = extractDraftNames(result);
      const currentTasks = result.project?.tasks || [];
      const genericCount = currentTasks.filter((task) => /^Task \d+$/i.test(task.name || '')).length;

      if (currentTasks.length && draftNames.length && genericCount) {
        const improved = currentTasks.map((task, index) => ({
          rowId: task.rowId || index + 1,
          uniqueId: task.nativeUid || task.uniqueId || task.uid || index + 1,
          name: /^Task \d+$/i.test(task.name || '') ? (draftNames[index] || task.name) : task.name,
          start: task.start || addDays('2026-01-01', index),
          finish: task.finish || addDays('2026-01-01', index),
        }));
        applySkeleton(result, fileName, improved, 'draft-name-overlay', cfb, draftNames.length);
        result.warnings.unshift(`Improved ${Math.min(genericCount, draftNames.length)} generic skeleton task name${Math.min(genericCount, draftNames.length) === 1 ? '' : 's'} from recovered draft text.`);
        return result;
      }

      if (currentTasks.length) {
        addDiagnostics(result, cfb, 0, 0, 'already-had-tasks');
        return result;
      }

      const recovered = recoverRowsV2(cfb, draftNames);
      if (!recovered.tasks.length) {
        addDiagnostics(result, cfb, 0, 0, 'no-v2-rows');
        return result;
      }
      applySkeleton(result, fileName, recovered.tasks, recovered.source, cfb, draftNames.length);
      result.warnings = (result.warnings || []).filter((warning) => !/Full private binary task-table decoding is still not implemented/i.test(warning));
      result.warnings.unshift(`Recovered ${recovered.tasks.length} native task skeleton row${recovered.tasks.length === 1 ? '' : 's'} with alternate task-table fallback. This is still low-confidence skeleton import.`);
    } catch (error) {
      result.warnings = result.warnings || [];
      result.warnings.push(`Task skeleton v2 recovery failed: ${error.message || error}`);
    }
    return result;
  }

  function recoverRowsV2(cfb, draftNames) {
    const fixed = recoverFromFixedTables(cfb);
    const varRows = recoverFromVarRows(cfb);
    const rows = fixed.length >= varRows.length ? fixed : varRows;
    const source = fixed.length >= varRows.length ? 'alternate-fixed-table-scan' : 'varmeta-row-scan';
    const start = '2026-01-01';
    const seen = new Set();
    const tasks = [];
    for (const row of rows) {
      const key = row.rowId || row.uniqueId || tasks.length + 1;
      if (seen.has(key)) continue;
      seen.add(key);
      const index = tasks.length;
      const name = row.name || draftNames[index] || `Task ${index + 1}`;
      tasks.push({ rowId: key, uniqueId: row.uniqueId || key, name, start: addDays(start, index), finish: addDays(start, index) });
      if (tasks.length >= 5000) break;
    }
    return { source, tasks };
  }

  function recoverFromFixedTables(cfb) {
    const metaEntry = entry(cfb, 'TBkndTask/FixedMeta');
    const dataEntry = entry(cfb, 'TBkndTask/FixedData');
    if (!metaEntry || !dataEntry) return [];
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    if (meta.length < 24 || data.length < 8) return [];
    const view = dv(meta);
    const declared = u32(view, 8);
    const starts = [16, 20, 24, 28, 32];
    const sizes = [8, 12, 16, 24, 32, 40, 47, 48, 56, 64, 80, 92, 96];
    let best = [];
    for (const start of starts) {
      for (const size of sizes) {
        const count = declared > 0 && declared < 100000 && start + declared * size <= meta.length
          ? declared
          : Math.floor((meta.length - start) / size);
        if (count <= 0 || count > 100000) continue;
        const offsets = [];
        for (let i = 0; i < count; i += 1) {
          const base = start + i * size;
          if (base + 8 > meta.length) break;
          const off = i32(view, base + 4);
          if (off >= 0 && off < data.length) offsets.push(off);
        }
        const rows = rowsFromOffsets(offsets, data);
        if (scoreRows(rows) > scoreRows(best)) best = rows;
      }
    }
    return best;
  }

  function rowsFromOffsets(offsets, data) {
    const rows = [];
    offsets = [...new Set(offsets)].sort((a, b) => a - b);
    offsets.forEach((offset, index) => {
      const end = index + 1 < offsets.length ? offsets[index + 1] : Math.min(data.length, offset + 512);
      if (end - offset < 8) return;
      const bytes = data.slice(offset, end);
      const view = dv(bytes);
      const pairs = [[u32(view, 0), u32(view, 4)], [u32(view, 4), u32(view, 0)], [index + 1, u32(view, 4)]];
      for (const [uid, rowId] of pairs) {
        if (plausibleRow(rowId)) {
          rows.push({ uniqueId: plausibleUid(uid) ? uid : index + 1, rowId });
          return;
        }
      }
    });
    return rows;
  }

  function recoverFromVarRows(cfb) {
    const map = readVarNameRows(cfb);
    const rows = [...map.entries()].map(([rowId, name]) => ({ rowId, uniqueId: rowId, name }));
    if (rows.length) return rows.sort((a, b) => a.rowId - b.rowId);
    const varMetaEntry = entry(cfb, 'TBkndTask/VarMeta');
    if (!varMetaEntry) return [];
    const meta = cfb.getStream(varMetaEntry);
    if (meta.length < 28) return [];
    const view = dv(meta);
    const counts = new Map();
    for (const start of [16, 20, 24, 28, 32]) {
      for (let offset = start; offset + 12 <= meta.length; offset += 12) {
        const rowId = u32(view, offset + 4);
        const valueOffset = u32(view, offset + 8);
        if (plausibleRow(rowId) && valueOffset < 50 * 1024 * 1024) counts.set(rowId, (counts.get(rowId) || 0) + 1);
      }
    }
    return [...counts.entries()]
      .filter(([, count]) => count >= 2)
      .sort((a, b) => a[0] - b[0])
      .map(([rowId]) => ({ rowId, uniqueId: rowId }));
  }

  function readVarNameRows(cfb) {
    const out = new Map();
    const metaEntry = entry(cfb, 'TBkndTask/VarMeta');
    const dataEntry = entry(cfb, 'TBkndTask/Var2Data');
    if (!metaEntry || !dataEntry) return out;
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    if (meta.length < 28 || data.length < 8) return out;
    const view = dv(meta);
    for (const start of [16, 20, 24, 28, 32]) {
      for (let offset = start; offset + 12 <= meta.length; offset += 12) {
        const rowId = u32(view, offset + 4);
        const valueOffset = u32(view, offset + 8);
        if (!plausibleRow(rowId) || valueOffset >= data.length) continue;
        const name = normalizeName(readTextValue(data, valueOffset));
        if (!name) continue;
        const existing = out.get(rowId);
        if (!existing || betterName(name, existing)) out.set(rowId, name);
      }
    }
    return out;
  }

  function applySkeleton(result, fileName, tasks, source, cfb, draftNameCount) {
    const projectName = cleanName(fileName || result.fileName || 'Recovered MPP');
    result.projectXml = buildProjectXml(projectName, tasks);
    result.project = {
      name: projectName,
      start: tasks[0]?.start || '2026-01-01',
      taskCount: tasks.length,
      tasks: tasks.map((task, index) => ({ id: index + 1, rowId: task.rowId, uid: index + 1, nativeUid: task.uniqueId, name: task.name, start: task.start, finish: task.finish, outlineLevel: 1, isSummary: false, skeleton: true })),
    };
    const namedRows = tasks.filter((task) => !/^Task \d+$/i.test(task.name || '')).length;
    result.nativeTaskSkeleton = { version: VERSION, taskRows: tasks.length, namedRows, source, draftNameCount, confidence: namedRows ? 'low-medium skeleton v2' : 'low skeleton v2' };
    result.nativeTable = result.nativeTable || {};
    result.nativeTable.strategy = source;
    result.nativeTable.fieldCoverage = { ...(result.nativeTable.fieldCoverage || {}), taskSkeletonRows: tasks.length, taskSkeletonNamedRows: namedRows, taskSkeletonV2Rows: tasks.length, taskSkeletonV2NamedRows: namedRows, taskSkeletonDraftNames: draftNameCount || 0 };
    addDiagnostics(result, cfb, tasks.length, namedRows, source);
    result.embeddedXml = { stream: source, size: result.projectXml.length, nativeTable: true, skeleton: true };
  }

  function addDiagnostics(result, cfb, rows, namedRows, source) {
    result.nativeTaskSkeletonDiagnostics = {
      version: VERSION,
      source,
      rows,
      namedRows,
      streams: ['TBkndTask/FixedMeta', 'TBkndTask/FixedData', 'TBkndTask/Fixed2Meta', 'TBkndTask/Fixed2Data', 'TBkndTask/VarMeta', 'TBkndTask/Var2Data'].map((suffix) => {
        const hit = entry(cfb, suffix);
        return { suffix, found: Boolean(hit), path: hit?.path || '', size: hit?.size || 0 };
      }),
    };
  }

  function extractDraftNames(result) {
    const tasks = result?.draftProject?.tasks || [];
    const names = [];
    for (const item of tasks) {
      const name = normalizeName(item.name || item.value || item.text || '');
      if (name && !names.some((n) => n.toLowerCase() === name.toLowerCase())) names.push(name);
      if (names.length >= 5000) break;
    }
    return names;
  }

  function readTextValue(data, offset) {
    const view = dv(data);
    const candidates = [];
    const len32 = u32(view, offset);
    const len16 = u16(view, offset);
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

  function normalizeName(value) {
    const text = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!looksText(text) || text.length < 2 || text.length > 160) return '';
    if (/^(Start|Finish|Duration|Work|Cost|Task Name|Resource Names|Standard|Calendar|Project|Microsoft Project|Text|Number|Flag|Date)$/i.test(text)) return '';
    if (/^[0-9 .:/\-]+$/.test(text) || /https?:\/\//i.test(text)) return '';
    return text;
  }

  function looksText(text) {
    if (!text || !/[A-Za-z\p{L}]/u.test(text) || /�/.test(text)) return false;
    const bad = (String(text).match(/[^\p{L}\p{N} ()/#&+.,'_:;\-]/gu) || []).length;
    return bad <= Math.max(4, Math.floor(String(text).length / 3));
  }

  function betterName(a, b) {
    const taskish = /task|phase|review|design|build|test|deploy|launch|submit|approval|release|plan|move|product|develop|calendar|wbs/i;
    return (taskish.test(a) && !taskish.test(b)) || a.length > b.length;
  }

  function scoreRows(rows) {
    const unique = new Set(rows.map((row) => row.rowId)).size;
    return unique * 10 + rows.filter((row) => plausibleUid(row.uniqueId)).length;
  }

  function plausibleRow(value) { return Number.isFinite(value) && value > 0 && value < 2000000; }
  function plausibleUid(value) { return Number.isFinite(value) && value > 0 && value < 2000000; }
  function entry(cfb, suffix) { const s = String(suffix || '').toLowerCase(); return cfb.entries.find((item) => item.type === 2 && String(item.path || '').toLowerCase().endsWith(s)) || null; }
  function dv(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  function u16(view, offset) { return offset + 2 <= view.byteLength ? view.getUint16(offset, true) : 0; }
  function u32(view, offset) { return offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0; }
  function i32(view, offset) { return offset + 4 <= view.byteLength ? view.getInt32(offset, true) : -1; }
  function addDays(iso, days) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + Number(days || 0)); return d.toISOString().slice(0, 10); }
  function cleanName(fileName) { return String(fileName || 'Recovered MPP').replace(/\.mpp$/i, '').replace(/[_-]+/g, ' ').trim() || 'Recovered MPP'; }
  function esc(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
  function buildProjectXml(projectName, tasks) {
    const created = new Date().toISOString().replace(/\.\d{3}Z$/, '');
    const start = tasks[0]?.start || '2026-01-01';
    const finish = tasks[tasks.length - 1]?.finish || start;
    const taskXml = tasks.map((task, index) => `\n    <Task>\n      <UID>${index + 1}</UID>\n      <ID>${index + 1}</ID>\n      <Name>${esc(task.name)}</Name>\n      <Type>1</Type>\n      <IsNull>0</IsNull>\n      <CreateDate>${created}</CreateDate>\n      <WBS>${index + 1}</WBS>\n      <OutlineNumber>${index + 1}</OutlineNumber>\n      <OutlineLevel>1</OutlineLevel>\n      <Start>${task.start}T08:00:00</Start>\n      <Finish>${task.finish}T17:00:00</Finish>\n      <Duration>PT8H0M0S</Duration>\n      <DurationFormat>7</DurationFormat>\n      <Work>PT8H0M0S</Work>\n      <Summary>0</Summary>\n      <Manual>1</Manual>\n    </Task>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Project xmlns="http://schemas.microsoft.com/project">\n  <SaveVersion>12</SaveVersion>\n  <Name>${esc(projectName)}</Name>\n  <Title>${esc(projectName)}</Title>\n  <Subject>Recovered locally from native MPP task skeleton rows v2</Subject>\n  <CreationDate>${created}</CreationDate>\n  <ScheduleFromStart>1</ScheduleFromStart>\n  <StartDate>${start}T08:00:00</StartDate>\n  <FinishDate>${finish}T17:00:00</FinishDate>\n  <CalendarUID>1</CalendarUID>\n  <DefaultStartTime>08:00:00</DefaultStartTime>\n  <DefaultFinishTime>17:00:00</DefaultFinishTime>\n  <MinutesPerDay>480</MinutesPerDay>\n  <MinutesPerWeek>2400</MinutesPerWeek>\n  <DaysPerMonth>20</DaysPerMonth>\n  <Tasks>${taskXml}\n  </Tasks>\n</Project>`;
  }
})();
