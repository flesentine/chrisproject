/* Native MPP constraints/deadlines polish.
   Loads after the base native reader/import polish and injects recoverable
   task Deadline, ConstraintType, and ConstraintDate fields into generated MSPDI XML. */
(() => {
  "use strict";
  const reader = window.NativeMppReader;
  if (!reader || window.__nativeMppConstraintsPolishLoaded) return;
  window.__nativeMppConstraintsPolishLoaded = true;

  const VERSION = "0.1.0-constraints-deadlines";
  const TASK_DEADLINE_FIELD_ID = 0x0b408045;
  const IGNORE_DATE_FIELD_IDS = new Set([0x0b40804a, 0x0b40804b, 0x0b40804e]);
  const CONSTRAINT_TO_PROJECT = { ASAP: 0, ALAP: 1, MSO: 2, MFO: 3, SNET: 4, SNLT: 5, FNET: 6, FNLT: 7 };
  const decoderUtf8 = new TextDecoder("utf-8", { fatal: false });
  const decoderUtf16 = new TextDecoder("utf-16le", { fatal: false });

  const baseRead = reader.read?.bind(reader);
  const baseReadBuffer = reader.readBuffer?.bind(reader);
  const baseReadBufferAsync = reader.readBufferAsync?.bind(reader);

  if (baseReadBuffer) {
    reader.readBuffer = function constraintsReadBuffer(buffer, fileName = "project.mpp", options = {}) {
      return polishConstraintsResult(buffer, baseReadBuffer(buffer, fileName, options));
    };
  }

  if (baseReadBufferAsync) {
    reader.readBufferAsync = async function constraintsReadBufferAsync(buffer, fileName = "project.mpp") {
      return polishConstraintsResult(buffer, await baseReadBufferAsync(buffer, fileName));
    };
  }

  if (baseRead) {
    reader.read = async function constraintsRead(file) {
      const buffer = await file.arrayBuffer();
      if (reader.readBufferAsync) return reader.readBufferAsync(buffer, file.name || "project.mpp");
      return polishConstraintsResult(buffer, await baseRead(file));
    };
  }

  reader.constraintsPolishVersion = VERSION;

  function polishConstraintsResult(buffer, result) {
    if (!result?.projectXml || !result?.project?.tasks?.length || !reader.CompoundFileBinary) return result;
    try {
      const cfb = new reader.CompoundFileBinary(buffer);
      const taskDetails = decodeTaskConstraints(cfb, result.project.tasks);
      if (!taskDetails.size) return result;
      const hit = injectConstraints(result.projectXml, result.project.tasks, taskDetails);
      if (!hit.changed) {
        attachDiagnostics(result, hit);
        return result;
      }
      result.projectXml = hit.xml;
      attachDiagnostics(result, hit);
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP constraints polish ${VERSION}: decoded ${hit.deadlinesApplied} deadline${hit.deadlinesApplied === 1 ? "" : "s"} and ${hit.constraintsApplied} constraint${hit.constraintsApplied === 1 ? "" : "s"} from native task fields.`);
      return result;
    } catch (error) {
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP constraints polish failed: ${error.message || error}`);
      return result;
    }
  }

  function attachDiagnostics(result, hit) {
    result.importConstraints = {
      version: VERSION,
      deadlinesApplied: hit.deadlinesApplied || 0,
      constraintsApplied: hit.constraintsApplied || 0,
      noDeadlineRows: hit.noDeadlineRows || 0,
      noProgramDateRows: hit.noProgramDateRows || 0,
      source: "native-TBkndTask-var-fields",
    };
    result.importPolish = { ...(result.importPolish || {}), constraints: hit.constraintsApplied || 0, deadlines: hit.deadlinesApplied || 0, constraintsPolishVersion: VERSION };
    result.nativeTable = result.nativeTable || {};
    result.nativeTable.fieldCoverage = {
      ...(result.nativeTable.fieldCoverage || {}),
      deadlines: hit.deadlinesApplied || 0,
      constraints: hit.constraintsApplied || 0,
      nativeNoDeadlineRows: hit.noDeadlineRows || 0,
      nativeNoProgramDateRows: hit.noProgramDateRows || 0,
    };
  }

  function decodeTaskConstraints(cfb, projectTasks) {
    const metaEntry = getEntry(cfb, "TBkndTask/VarMeta");
    const dataEntry = getEntry(cfb, "TBkndTask/Var2Data");
    if (!metaEntry || !dataEntry) return new Map();
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    const view = new DataView(meta.buffer, meta.byteOffset, meta.byteLength);
    const wantedRows = new Set(projectTasks.map((task) => Number(task.rowId)).filter(Number.isFinite));
    const rows = new Map();

    for (let offset = 0x20; offset + 12 <= meta.length; offset += 12) {
      const fieldId = readUInt32(view, offset);
      const rowId = readUInt32(view, offset + 4);
      const valueOffset = readUInt32(view, offset + 8);
      if (!wantedRows.has(rowId) || !fieldId || valueOffset >= data.length) continue;
      const value = readLengthPrefixedValue(data, valueOffset);
      if (value == null) continue;
      const row = rows.get(rowId) || { rowId, fields: new Map(), values: [] };
      row.fields.set(fieldId, value);
      const text = clean(value);
      if (text) row.values.push({ fieldId, text });
      rows.set(rowId, row);
    }

    const byTaskId = new Map();
    projectTasks.forEach((task) => {
      const row = rows.get(Number(task.rowId));
      if (!row) return;
      const detail = buildTaskConstraintDetail(row);
      if (detail.deadline || detail.noDeadline || detail.constraintType || detail.noProgramDate) byTaskId.set(Number(task.id), detail);
    });
    return byTaskId;
  }

  function buildTaskConstraintDetail(row) {
    const deadlineText = clean(row.fields.get(TASK_DEADLINE_FIELD_ID));
    const detail = {
      deadline: parseDateText(deadlineText),
      deadlineRaw: deadlineText,
      noDeadline: /^no\s+deadline$/i.test(deadlineText),
      constraintType: "",
      constraintDate: "",
      constraintRaw: "",
      noProgramDate: row.values.some((item) => /^no\s+program\s+date$/i.test(item.text)),
    };

    for (const item of row.values) {
      const found = parseConstraintText(item.text);
      if (!found.type) continue;
      const date = found.date || nearestConstraintDate(row, item.fieldId);
      if (requiresDate(found.type) && !date) continue;
      detail.constraintType = found.type;
      detail.constraintDate = date;
      detail.constraintRaw = item.text;
      break;
    }
    return detail;
  }

  function nearestConstraintDate(row, sourceFieldId) {
    // Do not use Start/Finish/Baseline display fields as constraint dates.
    // Only use a nearby free-standing date-like field when the MPP stores a
    // constraint label and date in separate native custom/display columns.
    const source = Number(sourceFieldId);
    const candidates = row.values
      .filter((item) => !IGNORE_DATE_FIELD_IDS.has(item.fieldId))
      .map((item) => ({ fieldId: item.fieldId, date: parseDateText(item.text), distance: Math.abs(Number(item.fieldId) - source) }))
      .filter((item) => item.date)
      .sort((a, b) => a.distance - b.distance);
    return candidates[0]?.date || "";
  }

  function injectConstraints(xml, projectTasks, taskDetails) {
    const byId = new Map(projectTasks.map((task) => [Number(task.id), task]));
    let changed = false;
    let deadlinesApplied = 0;
    let constraintsApplied = 0;
    let noDeadlineRows = 0;
    let noProgramDateRows = 0;

    const out = xml.replace(/<Task>([\s\S]*?)<\/Task>/g, (full, body) => {
      const id = Number(childText(body, "ID"));
      if (!id || !byId.has(id)) return full;
      const detail = taskDetails.get(id);
      if (!detail) return full;
      let next = body;

      if (detail.noDeadline) noDeadlineRows += 1;
      if (detail.noProgramDate) noProgramDateRows += 1;

      if (detail.deadline) {
        const before = next;
        next = setOrInsertChild(next, "Deadline", toProjectDate(detail.deadline, true), "Finish");
        if (next !== before) deadlinesApplied += 1;
      }

      if (detail.constraintType) {
        const before = next;
        next = setOrInsertChild(next, "ConstraintType", String(CONSTRAINT_TO_PROJECT[detail.constraintType]), "Type");
        if (detail.constraintDate) next = setOrInsertChild(next, "ConstraintDate", toProjectDate(detail.constraintDate), "ConstraintType");
        if (next !== before) constraintsApplied += 1;
      }

      if (next !== body) changed = true;
      return next === body ? full : `<Task>${next}\n    </Task>`;
    });

    return { xml: out, changed, deadlinesApplied, constraintsApplied, noDeadlineRows, noProgramDateRows };
  }

  function parseConstraintText(value) {
    const text = clean(value);
    if (!text) return { type: "", date: "" };
    const lower = text.toLowerCase();
    const date = parseDateText(text);
    let type = "";
    if (/\b(asap|as soon as possible)\b/.test(lower)) type = "ASAP";
    else if (/\b(alap|as late as possible)\b/.test(lower)) type = "ALAP";
    else if (/\b(mso|must start on)\b/.test(lower)) type = "MSO";
    else if (/\b(mfo|must finish on)\b/.test(lower)) type = "MFO";
    else if (/\b(snet|start no earlier than)\b/.test(lower)) type = "SNET";
    else if (/\b(snlt|start no later than)\b/.test(lower)) type = "SNLT";
    else if (/\b(fnet|finish no earlier than)\b/.test(lower)) type = "FNET";
    else if (/\b(fnlt|finish no later than)\b/.test(lower)) type = "FNLT";
    return { type, date };
  }

  function requiresDate(type) {
    return ["MSO", "MFO", "SNET", "SNLT", "FNET", "FNLT"].includes(type);
  }

  function parseDateText(value) {
    const text = clean(value);
    if (!text || /^no\s+/i.test(text)) return "";
    let match = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
    match = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\b|\s)/i.exec(text);
    if (match) {
      const year = match[3].length === 2 ? `20${match[3]}` : match[3];
      return `${year}-${String(match[1]).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`;
    }
    return "";
  }

  function setOrInsertChild(body, name, value, afterName = "") {
    const escaped = escapeXml(value);
    const pattern = new RegExp(`<${name}>[\\s\\S]*?<\\/${name}>`);
    if (pattern.test(body)) return body.replace(pattern, `<${name}>${escaped}</${name}>`);
    const afterPattern = afterName ? new RegExp(`(<${afterName}>[\\s\\S]*?<\\/${afterName}>)`) : null;
    if (afterPattern && afterPattern.test(body)) return body.replace(afterPattern, `$1\n      <${name}>${escaped}</${name}>`);
    return `${body}\n      <${name}>${escaped}</${name}>`;
  }

  function toProjectDate(value, endOfDay = false) {
    return `${value}T${endOfDay ? "17:00:00" : "08:00:00"}`;
  }

  function childText(body, localName) {
    const match = new RegExp(`<${localName}>([\\s\\S]*?)<\\/${localName}>`).exec(body || "");
    return match ? decodeXml(match[1].trim()) : "";
  }

  function getEntry(cfb, suffix) {
    const needle = String(suffix || "").toLowerCase();
    return cfb.entries.find((entry) => entry.type === 2 && String(entry.path || "").toLowerCase().endsWith(needle)) || null;
  }

  function readLengthPrefixedValue(bytes, offset) {
    if (!bytes || offset == null || offset < 0 || offset + 4 > bytes.length) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const length = readUInt32(view, offset);
    if (!Number.isFinite(length) || length < 0 || length > bytes.length - offset - 4 || length > 1024 * 1024) return null;
    const raw = bytes.slice(offset + 4, offset + 4 + length);
    if (!raw.length) return "";
    if (raw.length % 2 === 0 && looksUtf16(raw)) return decoderUtf16.decode(raw).replace(/\0+$/g, "").trim();
    if (looksAnsi(raw)) return decoderUtf8.decode(raw).replace(/\0+$/g, "").trim();
    if (raw.length === 4) {
      const value = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getInt32(0, true);
      if (value !== 0 && value !== -1) return String(value);
    }
    if (raw.length === 8) {
      const value = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getFloat64(0, true);
      if (Number.isFinite(value) && Math.abs(value) < 1000000000) return String(value);
    }
    return "";
  }

  function looksUtf16(bytes) {
    if (bytes.length < 6 || bytes.length % 2 !== 0) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let good = 0;
    let total = 0;
    for (let offset = 0; offset + 2 <= bytes.length; offset += 2) {
      const code = readUInt16(view, offset);
      total += 1;
      if (code && (code === 9 || code === 10 || code === 13 || code >= 32)) good += 1;
    }
    return total > 0 && good / total > 0.85;
  }

  function looksAnsi(bytes) {
    if (bytes.length < 3) return false;
    let good = 0;
    for (const byte of bytes) if (byte && ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13)) good += 1;
    return good / bytes.length > 0.88;
  }

  function readUInt32(view, offset) {
    return offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0;
  }

  function readUInt16(view, offset) {
    return offset + 2 <= view.byteLength ? view.getUint16(offset, true) : 0;
  }

  function clean(value) {
    return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  }

  function escapeXml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  }

  function decodeXml(value) {
    return String(value || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, "\n").replace(/&amp;/g, "&");
  }
})();
