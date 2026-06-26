(() => {
  'use strict';

  const R = window.NativeMppReader;
  if (!R || window.__nativeMppResourceTableV2Loaded) return;
  window.__nativeMppResourceTableV2Loaded = true;

  const VERSION = '0.2.0-resource-table-v2';
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
      const scan = recoverResources(cfb);
      result.nativeResourceTableV2 = {
        version: VERSION,
        rows: scan.rows.length,
        namedRows: scan.rows.filter((row) => row.name && !/^Resource \d+$/i.test(row.name)).length,
        source: scan.source,
        fixedRows: scan.fixedRows,
        varNameRows: scan.varNameRows,
        samples: scan.rows.slice(0, 40),
        streams: streamDiagnostics(cfb),
      };
      result.nativeTable = result.nativeTable || {};
      result.nativeTable.fieldCoverage = {
        ...(result.nativeTable.fieldCoverage || {}),
        resourceRows: scan.rows.length,
        resourceNamesApplied: scan.rows.filter((row) => row.name && !/^Resource \d+$/i.test(row.name)).length,
        resourceFixedRows: scan.fixedRows,
        resourceVarNameRows: scan.varNameRows,
      };
      if (!scan.rows.length || !result.projectXml) return result;
      result.projectXml = injectResources(result.projectXml, scan.rows);
      result.project = result.project || {};
      result.project.resources = scan.rows.map((row, index) => ({
        id: index + 1,
        uid: row.uid || index + 1,
        rowId: row.rowId || index + 1,
        name: row.name || `Resource ${index + 1}`,
        initials: row.initials || initials(row.name || `R${index + 1}`),
        type: 'work',
        maxUnits: row.maxUnits || 1,
      }));
      result.importResourceTableV2 = {
        version: VERSION,
        resourcesRecovered: scan.rows.length,
        resourcesApplied: scan.rows.length,
        namedResources: scan.rows.filter((row) => row.name && !/^Resource \d+$/i.test(row.name)).length,
        source: scan.source,
      };
      result.importPolish = { ...(result.importPolish || {}), resourceRows: scan.rows.length, resourceTableV2Version: VERSION };
      result.warnings = result.warnings || [];
      result.warnings.unshift(`Recovered ${scan.rows.length} native resource row${scan.rows.length === 1 ? '' : 's'} from TBkndRsc (${result.importResourceTableV2.namedResources} named).`);
    } catch (error) {
      result.warnings = result.warnings || [];
      result.warnings.push(`Resource table v2 recovery failed: ${error.message || error}`);
    }
    return result;
  }

  function recoverResources(cfb) {
    const fixed = recoverFixedRows(cfb);
    const names = recoverNames(cfb);
    const rowsById = new Map();
    fixed.forEach((row, index) => {
      const rowId = row.rowId || index + 1;
      rowsById.set(rowId, { rowId, uid: row.uid || rowId, name: '', initials: '', maxUnits: row.maxUnits || 1 });
    });
    for (const [rowId, name] of names.entries()) {
      const row = rowsById.get(rowId) || { rowId, uid: rowId, name: '', initials: '', maxUnits: 1 };
      row.name = name;
      row.initials = initials(name);
      rowsById.set(rowId, row);
    }
    const rows = [...rowsById.values()]
      .filter((row) => plausibleId(row.rowId) || row.name)
      .sort((a, b) => (a.rowId || 0) - (b.rowId || 0))
      .slice(0, 2000)
      .map((row, index) => ({
        rowId: row.rowId || index + 1,
        uid: plausibleId(row.uid) ? row.uid : index + 1,
        id: index + 1,
        name: normalizeResourceName(row.name) || `Resource ${index + 1}`,
        initials: initials(row.name || `Resource ${index + 1}`),
        maxUnits: row.maxUnits || 1,
      }))
      .filter((row) => !/^Resource \d+$/i.test(row.name) || fixed.length > 0);
    return {
      rows,
      fixedRows: fixed.length,
      varNameRows: names.size,
      source: fixed.length ? 'TBkndRsc fixed + var text' : 'TBkndRsc var text',
    };
  }

  function recoverFixedRows(cfb) {
    const rows = [
      ...splitFixed(cfb, 'TBkndRsc/FixedMeta', 'TBkndRsc/FixedData'),
      ...splitFixed(cfb, 'TBkndRsc/Fixed2Meta', 'TBkndRsc/Fixed2Data'),
    ];
    const seen = new Set();
    const out = [];
    rows.forEach((row, index) => {
      const key = row.rowId || row.uid || index + 1;
      if (!plausibleId(key) || seen.has(key)) return;
      seen.add(key);
      out.push(row);
    });
    return out;
  }

  function splitFixed(cfb, metaSuffix, dataSuffix) {
    const metaEntry = entry(cfb, metaSuffix);
    const dataEntry = entry(cfb, dataSuffix);
    if (!metaEntry || !dataEntry) return [];
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    if (meta.length < 16 || data.length < 8) return [];
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
        if (scoreRows(rows) > scoreRows(best)) best = rows;
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
      const uid = plausibleId(a) ? a : index + 1;
      const rowId = plausibleId(b) ? b : uid;
      if (!plausibleId(uid) && !plausibleId(rowId)) return;
      rows.push({ uid, rowId, maxUnits: guessMaxUnits(bytes), index });
    });
    return rows;
  }

  function scoreRows(rows) {
    const unique = new Set(rows.map((row) => row.rowId)).size;
    return unique * 10 + rows.filter((row) => plausibleId(row.uid)).length;
  }

  function recoverNames(cfb) {
    const metaEntry = entry(cfb, 'TBkndRsc/VarMeta');
    const dataEntry = entry(cfb, 'TBkndRsc/Var2Data');
    const out = new Map();
    if (!metaEntry || !dataEntry) return out;
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    if (meta.length < 28 || data.length < 4) return out;
    const view = dv(meta);
    for (const start of [16, 20, 24, 28, 32]) {
      for (let offset = start; offset + 12 <= meta.length; offset += 12) {
        const rowId = u32(view, offset + 4);
        const valueOffset = u32(view, offset + 8);
        if (!plausibleId(rowId) || valueOffset >= data.length) continue;
        const text = normalizeResourceName(readText(data, valueOffset));
        if (!text) continue;
        const existing = out.get(rowId);
        if (!existing || betterName(text, existing)) out.set(rowId, text);
      }
    }
    return out;
  }

  function readText(data, offset) {
    const view = dv(data);
    const candidates = [];
    const add = (start, len) => {
      if (len > 0 && len <= 1024 && start >= 0 && start + len <= data.length) candidates.push(data.slice(start, start + len));
    };
    const len8 = data[offset] || 0;
    const len16 = u16(view, offset);
    const len32 = u32(view, offset);
    if (len8 > 0 && len8 < 255) add(offset + 1, len8);
    if (len16 > 0 && len16 < 512) {
      add(offset + 2, len16);
      add(offset + 2, len16 * 2);
    }
    if (len32 > 0 && len32 < 1024) {
      add(offset + 4, len32);
      add(offset + 4, len32 * 2);
    }
    for (const raw of candidates) {
      const decoded = decode(raw);
      if (decoded) return decoded;
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

  function injectResources(xml, rows) {
    const block = `\n  <Resources>${rows.map(resourceXml).join('')}\n  </Resources>`;
    if (/<Resources>[\s\S]*?<\/Resources>/.test(xml)) {
      return xml.replace(/<Resources>[\s\S]*?<\/Resources>/, block.trim());
    }
    return xml.replace(/\s*<\/Project>\s*$/, `${block}\n</Project>`);
  }

  function resourceXml(row) {
    return `\n    <Resource>\n      <UID>${row.uid}</UID>\n      <ID>${row.id}</ID>\n      <Name>${esc(row.name)}</Name>\n      <Type>0</Type>\n      <IsNull>0</IsNull>\n      <Initials>${esc(row.initials)}</Initials>\n      <MaxUnits>${Number(row.maxUnits || 1).toFixed(2)}</MaxUnits>\n      <PeakUnits>${Number(row.maxUnits || 1).toFixed(2)}</PeakUnits>\n      <StandardRate>0</StandardRate>\n      <OvertimeRate>0</OvertimeRate>\n      <CostPerUse>0</CostPerUse>\n      <BaseCalendarUID>1</BaseCalendarUID>\n    </Resource>`;
  }

  function streamDiagnostics(cfb) {
    return ['FixedMeta', 'FixedData', 'Fixed2Meta', 'Fixed2Data', 'VarMeta', 'Var2Data'].map((name) => {
      const hit = entry(cfb, `TBkndRsc/${name}`);
      return { name, found: Boolean(hit), path: hit?.path || '', size: hit?.size || 0 };
    });
  }

  function guessMaxUnits(bytes) {
    const view = dv(bytes);
    for (let offset = 0; offset + 8 <= bytes.length; offset += 4) {
      const f = view.getFloat64(offset, true);
      if (Number.isFinite(f) && f > 0 && f <= 10) return Math.min(10, Math.max(0.01, f));
    }
    return 1;
  }

  function normalizeResourceName(value) {
    const text = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!looksText(text) || text.length < 2 || text.length > 140) return '';
    if (/^(Standard|Calendar|Resource Name|Type|Work|Material|Cost|Max Units|Initials|Group|Code|Text|Number|Flag|Date)$/i.test(text)) return '';
    if (/^[0-9 .:/\-]+$/.test(text) || /https?:\/\//i.test(text)) return '';
    return text;
  }

  function betterName(a, b) {
    const generic = /^(Resource|Work|Material|Cost|Standard|Calendar)$/i;
    if (generic.test(b) && !generic.test(a)) return true;
    return a.length > b.length;
  }

  function looksText(text) {
    if (!text || !/[A-Za-z\p{L}]/u.test(text) || /�/.test(text)) return false;
    const bad = (String(text).match(/[^\p{L}\p{N} ()/#&+.,'_:;\-]/gu) || []).length;
    return bad <= Math.max(4, Math.floor(String(text).length / 3));
  }

  function initials(value) {
    const clean = String(value || '').replace(/[^A-Za-z\p{L}0-9 ]/gu, ' ').replace(/\s+/g, ' ').trim();
    return clean.split(/\s+/).map((part) => part[0] || '').join('').slice(0, 8).toUpperCase() || clean.slice(0, 2).toUpperCase() || 'R';
  }

  function plausibleId(value) { return Number.isFinite(value) && value > 0 && value < 2000000; }
  function entry(cfb, suffix) { const s = String(suffix || '').toLowerCase(); return cfb.entries.find((item) => item.type === 2 && String(item.path || '').toLowerCase().endsWith(s)) || null; }
  function dv(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  function u16(view, offset) { return offset + 2 <= view.byteLength ? view.getUint16(offset, true) : 0; }
  function u32(view, offset) { return offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0; }
  function i32(view, offset) { return offset + 4 <= view.byteLength ? view.getInt32(offset, true) : -1; }
  function esc(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
})();
