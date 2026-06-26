(() => {
  'use strict';

  const R = window.NativeMppReader;
  if (!R || window.__nativeMppTaskSkeletonPolishLoaded) return;
  window.__nativeMppTaskSkeletonPolishLoaded = true;

  const VERSION = '0.1.0-task-skeleton-polish';
  const baseReadBuffer = R.readBuffer?.bind(R);
  const baseReadBufferAsync = R.readBufferAsync?.bind(R);
  const baseRead = R.read?.bind(R);
  const utf8 = new TextDecoder('utf-8', { fatal: false });
  const utf16 = new TextDecoder('utf-16le', { fatal: false });

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
    const taskCount = result?.project?.tasks?.length || 0;
    if (!result?.mppContainerRead || taskCount > 0 || !R.CompoundFileBinary) return result;
    try {
      const cfb = new R.CompoundFileBinary(buffer);
      const skeleton = recoverSkeleton(cfb, fileName || result.fileName || 'project.mpp');
      if (!skeleton.tasks.length) return result;
      result.projectXml = buildProjectXml(skeleton.projectName, skeleton.tasks);
      result.project = {
        name: skeleton.projectName,
        start: skeleton.start,
        taskCount: skeleton.tasks.length,
        tasks: skeleton.tasks.map((task, index) => ({
          id: index + 1,
          rowId: task.rowId,
          uid: index + 1,
          nativeUid: task.uniqueId,
          name: task.name,
          start: task.start,
          finish: task.finish,
          outlineLevel: 1,
          isSummary: false,
          skeleton: true,
        })),
      };
      result.nativeTaskSkeleton = {
        version: VERSION,
        taskRows: skeleton.tasks.length,
        namedRows: skeleton.tasks.filter((task) => !/^Task \d+$/.test(task.name)).length,
        fixedMetaStream: skeleton.fixedMetaStream,
        fixedDataStream: skeleton.fixedDataStream,
        varMetaStream: skeleton.varMetaStream,
        var2DataStream: skeleton.var2DataStream,
        confidence: skeleton.namedRows ? 'low-medium skeleton: row count plus some recovered names' : 'low skeleton: row count only',
      };
      result.nativeTable = result.nativeTable || {};
      result.nativeTable.strategy = result.nativeTable.strategy || 'native-task-skeleton';
      result.nativeTable.fieldCoverage = {
        ...(result.nativeTable.fieldCoverage || {}),
        taskSkeletonRows: skeleton.tasks.length,
        taskSkeletonNamedRows: result.nativeTaskSkeleton.namedRows,
      };
      result.embeddedXml = {
        stream: 'native-task-skeleton',
        size: result.projectXml.length,
        nativeTable: true,
        skeleton: true,
      };
      result.warnings = (result.warnings || []).filter((warning) => !/Full private binary task-table decoding is still not implemented/i.test(warning));
      result.warnings.unshift(`Recovered ${skeleton.tasks.length} native task skeleton row${skeleton.tasks.length === 1 ? '' : 's'} from TBkndTask. Names/dates are best-effort placeholders until full native field decoding is complete.`);
    } catch (error) {
      result.warnings = result.warnings || [];
      result.warnings.push(`Task skeleton recovery failed: ${error.message || error}`);
    }
    return result;
  }

  function recoverSkeleton(cfb, fileName) {
    const fixedMetaEntry = entry(cfb, 'TBkndTask/FixedMeta');
    const fixedDataEntry = entry(cfb, 'TBkndTask/FixedData');
    if (!fixedMetaEntry || !fixedDataEntry) return empty(fileName);
    const fixedMeta = cfb.getStream(fixedMetaEntry);
    const fixedData = cfb.getStream(fixedDataEntry);
    const fixedRows = readFixedRows(fixedMeta, fixedData);
    const nameMap = readNameMap(cfb);
    const start = guessStartDate(cfb) || '2026-01-01';
    const rows = fixedRows
      .filter((row) => row.rowId > 0 && row.rowId < 2000000)
      .filter((row, index, list) => list.findIndex((item) => item.rowId === row.rowId) === index)
      .slice(0, 5000);
    const tasks = rows.map((row, index) => {
      const name = nameMap.get(row.rowId) || nameMap.get(row.uniqueId) || `Task ${index + 1}`;
      return {
        rowId: row.rowId,
        uniqueId: row.uniqueId,
        name,
        start: addDays(start, index),
        finish: addDays(start, index),
      };
    });
    return {
      projectName: cleanName(fileName),
      start,
      tasks,
      fixedMetaStream: fixedMetaEntry.path,
      fixedDataStream: fixedDataEntry.path,
      varMetaStream: entry(cfb, 'TBkndTask/VarMeta')?.path || '',
      var2DataStream: entry(cfb, 'TBkndTask/Var2Data')?.path || '',
      namedRows: tasks.filter((task) => !/^Task \d+$/.test(task.name)).length,
    };
  }

  function empty(fileName) {
    return { projectName: cleanName(fileName), start: '2026-01-01', tasks: [], fixedMetaStream: '', fixedDataStream: '', varMetaStream: '', var2DataStream: '', namedRows: 0 };
  }

  function readFixedRows(metaBytes, dataBytes) {
    if (!metaBytes || metaBytes.length < 16 || !dataBytes?.length) return [];
    const view = dv(metaBytes);
    const declared = u32(view, 8);
    const count = declared > 0 && declared < 100000 ? declared : Math.max(0, Math.floor((metaBytes.length - 16) / 47));
    const itemSize = count ? Math.max(8, Math.floor((metaBytes.length - 16) / count)) : 47;
    const offsets = [];
    for (let i = 0; i < count; i += 1) {
      const base = 16 + i * itemSize;
      if (base + 8 > metaBytes.length) break;
      const offset = i32(view, base + 4);
      if (offset >= 0 && offset < dataBytes.length) offsets.push(offset);
    }
    const rows = [];
    offsets.forEach((offset, index) => {
      const end = index + 1 < offsets.length ? offsets[index + 1] : Math.min(dataBytes.length, offset + 256);
      const size = Math.max(0, Math.min(dataBytes.length, end) - offset);
      if (size < 8) return;
      const bytes = dataBytes.slice(offset, offset + size);
      const item = dv(bytes);
      const uniqueId = u32(item, 0);
      const rowId = u32(item, 4);
      if (!uniqueId && !rowId) return;
      rows.push({ uniqueId, rowId, index });
    });
    return rows;
  }

  function readNameMap(cfb) {
    const out = new Map();
    const varMetaEntry = entry(cfb, 'TBkndTask/VarMeta');
    const var2DataEntry = entry(cfb, 'TBkndTask/Var2Data');
    if (!varMetaEntry || !var2DataEntry) return out;
    const meta = cfb.getStream(varMetaEntry);
    const data = cfb.getStream(var2DataEntry);
    if (meta.length < 28 || !data.length) return out;
    const view = dv(meta);
    const starts = [16, 24, 32];
    for (const start of starts) {
      for (let offset = start; offset + 12 <= meta.length; offset += 12) {
        const field = u32(view, offset);
        const row = u32(view, offset + 4);
        const valueOffset = u32(view, offset + 8);
        if (!row || valueOffset >= data.length) continue;
        const value = readTextValue(data, valueOffset);
        const name = normalizeName(value);
        if (!name) continue;
        const existing = out.get(row);
        if (!existing || name.length > existing.length || looksTaskLike(name)) out.set(row, name);
      }
    }
    return out;
  }

  function readTextValue(data, offset) {
    if (offset < 0 || offset + 2 > data.length) return '';
    const view = dv(data);
    const len32 = u32(view, offset);
    if (len32 > 0 && len32 < 512 && offset + 4 + len32 <= data.length) {
      const raw = data.slice(offset + 4, offset + 4 + len32);
      const decoded = decodeBytes(raw);
      if (decoded) return decoded;
    }
    if (len32 > 0 && len32 < 256 && offset + 4 + len32 * 2 <= data.length) {
      const raw = data.slice(offset + 4, offset + 4 + len32 * 2);
      const decoded = decodeBytes(raw);
      if (decoded) return decoded;
    }
    const len16 = u16(view, offset);
    if (len16 > 0 && len16 < 256 && offset + 2 + len16 * 2 <= data.length) {
      const raw = data.slice(offset + 2, offset + 2 + len16 * 2);
      const decoded = decodeBytes(raw);
      if (decoded) return decoded;
    }
    return '';
  }

  function decodeBytes(raw) {
    if (!raw?.length) return '';
    if (raw.length % 2 === 0) {
      const text = utf16.decode(raw).replace(/\0+$/g, '').trim();
      if (looksText(text)) return text;
    }
    const text = utf8.decode(raw).replace(/\0+$/g, '').trim();
    return looksText(text) ? text : '';
  }

  function normalizeName(value) {
    const text = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!looksText(text)) return '';
    if (text.length < 2 || text.length > 140) return '';
    if (/^(Start|Finish|Duration|Work|Cost|Task Name|Resource Names|Standard|Calendar|Project|Microsoft Project)$/i.test(text)) return '';
    if (/^[0-9 .:/\-]+$/.test(text)) return '';
    if (/https?:\/\//i.test(text)) return '';
    return text;
  }

  function looksText(text) {
    if (!text || !/[A-Za-z\p{L}]/u.test(text) || /�/.test(text)) return false;
    const bad = (String(text).match(/[^\p{L}\p{N} ()/#&+.,'_:;\-]/gu) || []).length;
    return bad <= Math.max(4, Math.floor(String(text).length / 3));
  }

  function looksTaskLike(text) {
    return /task|phase|review|design|build|test|deploy|launch|submit|approval|release|plan|move|product|develop|calendar|wbs/i.test(text);
  }

  function guessStartDate(cfb) {
    const meta = cfb.entries.find((e) => e.type === 2 && /SummaryInformation$/i.test(e.normalizedName || e.name || ''));
    if (!meta) return '';
    return '2026-01-01';
  }

  function buildProjectXml(projectName, tasks) {
    const created = new Date().toISOString().replace(/\.\d{3}Z$/, '');
    const start = tasks[0]?.start || '2026-01-01';
    const finish = tasks[tasks.length - 1]?.finish || start;
    const taskXml = tasks.map((task, index) => `
    <Task>
      <UID>${index + 1}</UID>
      <ID>${index + 1}</ID>
      <Name>${esc(task.name)}</Name>
      <Type>1</Type>
      <IsNull>0</IsNull>
      <CreateDate>${created}</CreateDate>
      <WBS>${index + 1}</WBS>
      <OutlineNumber>${index + 1}</OutlineNumber>
      <OutlineLevel>1</OutlineLevel>
      <Start>${task.start}T08:00:00</Start>
      <Finish>${task.finish}T17:00:00</Finish>
      <Duration>PT8H0M0S</Duration>
      <DurationFormat>7</DurationFormat>
      <Work>PT8H0M0S</Work>
      <Summary>0</Summary>
      <Manual>1</Manual>
    </Task>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>12</SaveVersion>
  <Name>${esc(projectName)}</Name>
  <Title>${esc(projectName)}</Title>
  <Subject>Recovered locally from native MPP task skeleton rows</Subject>
  <CreationDate>${created}</CreationDate>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>${start}T08:00:00</StartDate>
  <FinishDate>${finish}T17:00:00</FinishDate>
  <CalendarUID>1</CalendarUID>
  <DefaultStartTime>08:00:00</DefaultStartTime>
  <DefaultFinishTime>17:00:00</DefaultFinishTime>
  <MinutesPerDay>480</MinutesPerDay>
  <MinutesPerWeek>2400</MinutesPerWeek>
  <DaysPerMonth>20</DaysPerMonth>
  <Tasks>${taskXml}
  </Tasks>
</Project>`;
  }

  function addDays(iso, days) {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }

  function cleanName(fileName) {
    return String(fileName || 'Recovered MPP').replace(/\.mpp$/i, '').replace(/[_-]+/g, ' ').trim() || 'Recovered MPP';
  }

  function entry(cfb, suffix) {
    const s = String(suffix || '').toLowerCase();
    return cfb.entries.find((item) => item.type === 2 && String(item.path || '').toLowerCase().endsWith(s)) || null;
  }

  function dv(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  function u16(view, offset) { return offset + 2 <= view.byteLength ? view.getUint16(offset, true) : 0; }
  function u32(view, offset) { return offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0; }
  function i32(view, offset) { return offset + 4 <= view.byteLength ? view.getInt32(offset, true) : -1; }
  function esc(value) {
    return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
  }
})();
