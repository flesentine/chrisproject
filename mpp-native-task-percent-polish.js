(() => {
  'use strict';

  const R = window.NativeMppReader;
  if (!R || window.__nativeMppTaskPercentLoaded) return;
  window.__nativeMppTaskPercentLoaded = true;

  const VERSION = '0.1.0-task-percent-complete';
  const PERCENT_OFFSET = 92;

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

  function polish(buffer, result) {
    if (!result?.mppContainerRead || !R.CompoundFileBinary) return result;
    try {
      const cfb = new R.CompoundFileBinary(buffer);
      const percentByRowId = recoverPercentByRowId(cfb);
      if (!percentByRowId.size) return result;
      const applied = applyPercent(result, percentByRowId);
      result.nativeTaskPercentComplete = {
        version: VERSION,
        source: 'TBkndTask/FixedData byte 92',
        offset: PERCENT_OFFSET,
        recoveredRows: percentByRowId.size,
        appliedRows: applied,
        sample: Array.from(percentByRowId.entries()).slice(0, 20).map(([rowId, percent]) => ({ rowId, percent })),
      };
      result.nativeTable = result.nativeTable || {};
      result.nativeTable.fieldCoverage = {
        ...(result.nativeTable.fieldCoverage || {}),
        taskPercentCompleteRows: percentByRowId.size,
        taskPercentCompleteApplied: applied,
      };
      result.nativeTaskSkeletonDiagnostics = {
        ...(result.nativeTaskSkeletonDiagnostics || {}),
        percentComplete: result.nativeTaskPercentComplete,
      };
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.unshift(`Recovered % Complete for ${applied} task row${applied === 1 ? '' : 's'} from native MPP fixed task data.`);
    } catch (error) {
      result.warnings = result.warnings || [];
      result.warnings.push(`Task percent complete recovery failed: ${error.message || error}`);
    }
    return result;
  }

  function recoverPercentByRowId(cfb) {
    const metaEntry = entry(cfb, 'TBkndTask/FixedMeta');
    const dataEntry = entry(cfb, 'TBkndTask/FixedData');
    if (!metaEntry || !dataEntry) return new Map();
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    if (meta.length < 24 || data.length <= PERCENT_OFFSET) return new Map();

    const declared = u32(meta, 8);
    const candidates = [];
    for (const start of [16, 20, 24, 28, 32]) {
      for (const size of [8, 12, 16, 24, 32, 40, 47, 48, 56, 64, 80, 92, 96]) {
        const count = declared > 0 && declared < 100000 && start + declared * size <= meta.length
          ? declared
          : Math.floor((meta.length - start) / size);
        if (count <= 0 || count > 100000) continue;
        const offsets = [];
        for (let i = 0; i < count; i += 1) {
          const base = start + i * size;
          if (base + 8 > meta.length) break;
          const offset = i32(meta, base + 4);
          if (offset >= 0 && offset < data.length) offsets.push(offset);
        }
        const rows = rowsFromOffsets(offsets, data);
        const score = scoreRows(rows);
        if (rows.length) candidates.push({ rows, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const rows = candidates[0]?.rows || [];
    const out = new Map();
    rows.forEach((row) => {
      const value = data[row.offset + PERCENT_OFFSET];
      if (Number.isFinite(value) && value >= 0 && value <= 100) out.set(row.rowId, value);
    });
    return out;
  }

  function rowsFromOffsets(offsets, data) {
    const rows = [];
    const uniqueOffsets = [...new Set(offsets)].sort((a, b) => a - b);
    uniqueOffsets.forEach((offset, index) => {
      const end = index + 1 < uniqueOffsets.length ? uniqueOffsets[index + 1] : Math.min(data.length, offset + 512);
      if (end - offset <= PERCENT_OFFSET) return;
      const pairs = [
        [u32(data, offset), u32(data, offset + 4)],
        [u32(data, offset + 4), u32(data, offset)],
        [index + 1, u32(data, offset + 4)],
      ];
      for (const [uid, rowId] of pairs) {
        if (plausibleRow(rowId)) {
          rows.push({ uniqueId: plausibleUid(uid) ? uid : index + 1, rowId, offset, length: end - offset });
          return;
        }
      }
    });
    return rows;
  }

  function scoreRows(rows) {
    if (!rows.length) return 0;
    const ids = rows.map((row) => row.rowId);
    const unique = new Set(ids).size;
    let ascending = 0;
    for (let i = 1; i < ids.length; i += 1) if (ids[i] > ids[i - 1]) ascending += 1;
    return unique * 10 + ascending;
  }

  function applyPercent(result, percentByRowId) {
    let applied = 0;
    const tasks = Array.isArray(result.project?.tasks) ? result.project.tasks : [];
    tasks.forEach((task, index) => {
      const rowId = Number(task.rowId || task.nativeUid || task.uniqueId || 0);
      const percent = percentByRowId.has(rowId) ? percentByRowId.get(rowId) : percentByRowId.get(index + 1);
      if (Number.isFinite(percent)) {
        task.percent = clampPercent(percent);
        task.percentComplete = task.percent;
        task.nativePercentCompleteRecovered = true;
        applied += 1;
      }
    });
    if (Array.isArray(result.draftProject?.tasks)) {
      result.draftProject.tasks.forEach((task, index) => {
        const source = tasks[index];
        if (source && Number.isFinite(Number(source.percent))) {
          task.percent = clampPercent(source.percent);
          task.percentComplete = task.percent;
        }
      });
      result.draftProject.percentCompleteRecovered = applied;
    }
    if (applied && result.projectXml) result.projectXml = patchProjectXmlPercent(result.projectXml, tasks);
    return applied;
  }

  function patchProjectXmlPercent(xml, tasks) {
    let index = 0;
    return String(xml || '').replace(/<Task>([\s\S]*?)<\/Task>/g, (match, body) => {
      const task = tasks[index++] || {};
      const percent = clampPercent(task.percent ?? task.percentComplete ?? 0);
      let next = body;
      if (/<PercentComplete>[\s\S]*?<\/PercentComplete>/i.test(next)) {
        next = next.replace(/<PercentComplete>[\s\S]*?<\/PercentComplete>/i, `<PercentComplete>${percent}</PercentComplete>`);
      } else {
        next = next.replace(/<Work>[\s\S]*?<\/Work>/i, (work) => `${work}\n      <PercentComplete>${percent}</PercentComplete>`);
      }
      return `<Task>${next}</Task>`;
    });
  }

  function clampPercent(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }

  function entry(cfb, suffix) {
    const s = String(suffix || '').toLowerCase();
    return cfb.entries.find((item) => item.type === 2 && String(item.path || '').toLowerCase().endsWith(s)) || null;
  }
  function u32(bytes, offset) { return offset + 4 <= bytes.length ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true) : 0; }
  function i32(bytes, offset) { return offset + 4 <= bytes.length ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(offset, true) : -2; }
  function plausibleRow(value) { return Number.isFinite(value) && value > 0 && value < 2000000; }
  function plausibleUid(value) { return Number.isFinite(value) && value > 0 && value < 2000000; }
})();
