/* Native MPP costs polish.
   Imports only conservative money/rate values: task costs already recovered by the
   native reader plus explicit currency/rate text from task/resource/assignment var fields. */
(() => {
  "use strict";
  const reader = window.NativeMppReader;
  if (!reader || window.__nativeMppCostsPolishLoaded) return;
  window.__nativeMppCostsPolishLoaded = true;

  const VERSION = "0.1.0-costs";
  const decoderUtf8 = new TextDecoder("utf-8", { fatal: false });
  const decoderUtf16 = new TextDecoder("utf-16le", { fatal: false });

  const baseRead = reader.read?.bind(reader);
  const baseReadBuffer = reader.readBuffer?.bind(reader);
  const baseReadBufferAsync = reader.readBufferAsync?.bind(reader);

  if (baseReadBuffer) {
    reader.readBuffer = function costsReadBuffer(buffer, fileName = "project.mpp", options = {}) {
      return polishCostsResult(buffer, baseReadBuffer(buffer, fileName, options));
    };
  }

  if (baseReadBufferAsync) {
    reader.readBufferAsync = async function costsReadBufferAsync(buffer, fileName = "project.mpp") {
      return polishCostsResult(buffer, await baseReadBufferAsync(buffer, fileName));
    };
  }

  if (baseRead) {
    reader.read = async function costsRead(file) {
      const buffer = await file.arrayBuffer();
      if (reader.readBufferAsync) return reader.readBufferAsync(buffer, file.name || "project.mpp");
      return polishCostsResult(buffer, await baseRead(file));
    };
  }

  reader.costsPolishVersion = VERSION;

  function polishCostsResult(buffer, result) {
    if (!result?.projectXml || !reader.CompoundFileBinary) return result;
    try {
      const cfb = new reader.CompoundFileBinary(buffer);
      const taskCosts = decodeTaskCosts(cfb, result.project?.tasks || []);
      const resourceCosts = decodeResourceRates(cfb, result.importResources?.resources || []);
      const assignmentCosts = decodeAssignmentCosts(cfb, result.project?.tasks || []);
      const hit = injectCosts(result.projectXml, { taskCosts, resourceCosts, assignmentCosts });
      result.importCosts = {
        version: VERSION,
        taskCosts: hit.taskCostsApplied,
        resourceRates: hit.resourceRatesApplied,
        assignmentCosts: hit.assignmentCostsApplied,
        source: "native reader task cost + native var currency/rate text",
        note: "Only explicit money/rate-looking values are imported. Cost formulas, accrual curves, and detailed rate tables are not decoded yet.",
      };
      result.importPolish = { ...(result.importPolish || {}), costs: hit.taskCostsApplied, resourceRates: hit.resourceRatesApplied, assignmentCosts: hit.assignmentCostsApplied, costsPolishVersion: VERSION };
      result.nativeTable = result.nativeTable || {};
      result.nativeTable.fieldCoverage = { ...(result.nativeTable.fieldCoverage || {}), costs: hit.taskCostsApplied, resourceRates: hit.resourceRatesApplied, assignmentCosts: hit.assignmentCostsApplied };
      if (hit.changed) result.projectXml = hit.xml;
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP costs polish ${VERSION}: decoded ${hit.taskCostsApplied} task cost${hit.taskCostsApplied === 1 ? "" : "s"}, ${hit.resourceRatesApplied} resource rate/cost value${hit.resourceRatesApplied === 1 ? "" : "s"}, and ${hit.assignmentCostsApplied} assignment cost${hit.assignmentCostsApplied === 1 ? "" : "s"}.`);
      return result;
    } catch (error) {
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP costs polish failed: ${error.message || error}`);
      return result;
    }
  }

  function decodeTaskCosts(cfb, tasks) {
    const out = new Map();
    (tasks || []).forEach((task) => {
      const cost = money(task?.cost);
      if (cost > 0) out.set(Number(task.id), { fixedCost: cost, totalCost: cost, source: "native-reader-task-cost" });
    });

    const table = readVarTable(cfb, "TBkndTask");
    if (!table) return out;
    const rowToTask = new Map((tasks || []).map((task) => [Number(task.rowId), Number(task.id)]).filter(([row]) => Number.isFinite(row)));
    table.rows.forEach((fields, rowId) => {
      const taskId = rowToTask.get(rowId);
      if (!taskId || out.has(taskId)) return;
      const candidates = [...fields.entries()]
        .map(([fieldId, text]) => ({ fieldId, value: parseMoneyText(text), text: clean(text) }))
        .filter((item) => item.value > 0 && looksExplicitMoney(item.text))
        .sort((a, b) => b.value - a.value);
      if (!candidates.length) return;
      const best = candidates[0];
      out.set(taskId, { fixedCost: best.value, totalCost: best.value, source: `native-task-field-${hex(best.fieldId)}` });
    });
    return out;
  }

  function decodeResourceRates(cfb, resources) {
    const table = readVarTable(cfb, "TBkndRsc");
    if (!table) return new Map();
    const resourceRows = resourceRowsByName(cfb, resources);
    const out = new Map();
    table.rows.forEach((fields, rowId) => {
      const resourceUid = resourceRows.get(rowId) || rowId;
      const values = [...fields.entries()]
        .map(([fieldId, text]) => ({ fieldId, text: clean(text), rate: parseRateText(text), money: parseMoneyText(text) }))
        .filter((item) => item.rate > 0 || item.money > 0);
      if (!values.length) return;
      const rate = values.find((item) => item.rate > 0);
      const use = values.find((item) => item.money > 0 && !rateLike(item.text));
      out.set(resourceUid, {
        standardRate: rate?.rate || 0,
        costPerUse: use?.money || 0,
        source: `native-resource-row-${rowId}`,
      });
    });
    return out;
  }

  function decodeAssignmentCosts(cfb, tasks) {
    const table = readVarTable(cfb, "TBkndAssn");
    if (!table) return new Map();
    const fixed = readAssignmentFixed(cfb, tasks);
    const out = new Map();
    table.rows.forEach((fields, index) => {
      const ref = fixed.get(index);
      if (!ref) return;
      const candidates = [...fields.values()].map(parseMoneyText).filter((value) => value > 0).sort((a, b) => b - a);
      if (!candidates.length) return;
      out.set(ref.uid, { cost: candidates[0], taskUid: ref.taskUid, resourceUid: ref.resourceUid });
    });
    return out;
  }

  function injectCosts(xml, decoded) {
    let changed = false;
    let taskCostsApplied = 0;
    let resourceRatesApplied = 0;
    let assignmentCostsApplied = 0;

    let next = xml.replace(/<Task>([\s\S]*?)<\/Task>/g, (full, body) => {
      const id = Number(childText(body, "ID"));
      const cost = decoded.taskCosts.get(id);
      if (!cost) return full;
      let out = body;
      out = setOrInsert(out, "FixedCost", String(cost.fixedCost), "Cost");
      out = setOrInsert(out, "FixedCostAccrual", "3", "FixedCost");
      out = setOrInsert(out, "Cost", String(cost.totalCost), "Work");
      out = updateBaselineCost(out, cost.totalCost);
      if (out !== body) {
        changed = true;
        taskCostsApplied += 1;
      }
      return out === body ? full : `<Task>${out}\n    </Task>`;
    });

    next = next.replace(/<Resource>([\s\S]*?)<\/Resource>/g, (full, body) => {
      const uid = Number(childText(body, "UID"));
      const values = decoded.resourceCosts.get(uid);
      if (!values) return full;
      let out = body;
      if (values.standardRate > 0) out = setOrInsert(out, "StandardRate", `${values.standardRate}/h`, "MaxUnits");
      if (values.costPerUse > 0) out = setOrInsert(out, "CostPerUse", String(values.costPerUse), "OvertimeRate");
      if (out !== body) {
        changed = true;
        resourceRatesApplied += 1;
      }
      return out === body ? full : `<Resource>${out}\n    </Resource>`;
    });

    next = next.replace(/<Assignment>([\s\S]*?)<\/Assignment>/g, (full, body) => {
      const uid = Number(childText(body, "UID"));
      const values = decoded.assignmentCosts.get(uid);
      if (!values) return full;
      let out = setOrInsert(body, "Cost", String(values.cost), "Work");
      if (out !== body) {
        changed = true;
        assignmentCostsApplied += 1;
      }
      return out === body ? full : `<Assignment>${out}\n    </Assignment>`;
    });

    return { xml: next, changed, taskCostsApplied, resourceRatesApplied, assignmentCostsApplied };
  }

  function updateBaselineCost(body, value) {
    return body.replace(/<Baseline>([\s\S]*?)<\/Baseline>/g, (full, base) => {
      const number = childText(base, "Number");
      if (number && number !== "0") return full;
      return `<Baseline>${setOrInsert(base, "Cost", String(value), "Work")}\n      </Baseline>`;
    });
  }

  function readVarTable(cfb, streamName) {
    const metaEntry = getEntry(cfb, `${streamName}/VarMeta`);
    const dataEntry = getEntry(cfb, `${streamName}/Var2Data`);
    if (!metaEntry || !dataEntry) return null;
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    const view = new DataView(meta.buffer, meta.byteOffset, meta.byteLength);
    const rows = new Map();
    for (let offset = 0x20; offset + 12 <= meta.length; offset += 12) {
      const fieldId = readUInt32(view, offset);
      const rowId = readUInt32(view, offset + 4);
      const valueOffset = readUInt32(view, offset + 8);
      if (!fieldId || valueOffset >= data.length) continue;
      const value = readLengthPrefixedValue(data, valueOffset);
      const text = clean(value);
      if (!text) continue;
      const row = rows.get(rowId) || new Map();
      row.set(fieldId, text);
      rows.set(rowId, row);
    }
    return { rows };
  }

  function resourceRowsByName(cfb, resources) {
    const rows = new Map();
    const fixed = fixedRecords(cfb, "TBkndRsc");
    fixed.forEach((record) => {
      if (record.bytes.length < 8) return;
      const uid = readUInt32(new DataView(record.bytes.buffer, record.bytes.byteOffset, record.bytes.byteLength), 0);
      const rowId = readUInt32(new DataView(record.bytes.buffer, record.bytes.byteOffset, record.bytes.byteLength), 4);
      if (uid && rowId) rows.set(rowId, uid);
    });
    return rows;
  }

  function readAssignmentFixed(cfb, tasks) {
    const byRow = new Map((tasks || []).map((task) => [Number(task.rowId), Number(task.id)]).filter(([row]) => Number.isFinite(row)));
    const records = fixedRecords(cfb, "TBkndAssn");
    const out = new Map();
    records.forEach((record, index) => {
      const b = record.bytes;
      if (b.length < 12) return;
      const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
      const uid = readUInt32(view, 0) || index + 1;
      const taskRow = readUInt32(view, 4);
      const taskUid = byRow.get(taskRow) || 0;
      const resourceUid = readUInt32(view, 8) & 0xffff;
      if (taskUid && resourceUid) out.set(index, { uid, taskUid, resourceUid });
    });
    return out;
  }

  function fixedRecords(cfb, streamName) {
    const metaEntry = getEntry(cfb, `${streamName}/FixedMeta`);
    const dataEntry = getEntry(cfb, `${streamName}/FixedData`);
    if (!metaEntry || !dataEntry) return [];
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    if (meta.length < 16) return [];
    const view = new DataView(meta.buffer, meta.byteOffset, meta.byteLength);
    const count = readUInt32(view, 8);
    const size = count ? Math.floor((meta.length - 16) / count) : 0;
    if (!count || size < 8) return [];
    const offsets = [];
    for (let i = 0; i < count; i += 1) offsets.push(readUInt32(view, 16 + i * size + 4));
    return offsets.map((offset, index) => ({ index, bytes: data.slice(offset, index + 1 < offsets.length ? offsets[index + 1] : data.length) })).filter((record) => record.bytes.length);
  }

  function parseMoneyText(value) {
    const text = clean(value);
    if (!looksExplicitMoney(text)) return 0;
    const match = /(?:[$€£¥]\s*|\b(?:USD|EUR|GBP|JPY)\s*)?(-?\d[\d,]*(?:\.\d{1,4})?)/i.exec(text);
    if (!match) return 0;
    const n = Number(match[1].replaceAll(",", ""));
    return Number.isFinite(n) && n > 0 && n < 1000000000 ? Math.round(n * 100) / 100 : 0;
  }

  function parseRateText(value) {
    const text = clean(value);
    if (!rateLike(text)) return 0;
    const n = parseMoneyText(text) || Number((text.match(/(-?\d[\d,]*(?:\.\d{1,4})?)/) || [])[1]?.replaceAll(",", ""));
    return Number.isFinite(n) && n > 0 && n < 1000000 ? Math.round(n * 100) / 100 : 0;
  }

  function looksExplicitMoney(text) {
    const value = clean(text);
    if (!value) return false;
    return /[$€£¥]|\b(?:USD|EUR|GBP|JPY)\b/i.test(value) || rateLike(value);
  }

  function rateLike(text) {
    return /(?:\bper\s*(?:hour|hr|day|use)\b|\/(?:h|hr|hour|d|day|use)\b)/i.test(clean(text));
  }

  function money(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 && n < 1000000000 ? Math.round(n * 100) / 100 : 0;
  }

  function setOrInsert(body, name, value, afterName = "") {
    const escaped = escapeXml(value);
    const pattern = new RegExp(`<${name}>[\\s\\S]*?<\\/${name}>`);
    if (pattern.test(body)) return body.replace(pattern, `<${name}>${escaped}</${name}>`);
    const afterPattern = afterName ? new RegExp(`(<${afterName}>[\\s\\S]*?<\\/${afterName}>)`) : null;
    if (afterPattern && afterPattern.test(body)) return body.replace(afterPattern, `$1\n      <${name}>${escaped}</${name}>`);
    return `${body}\n      <${name}>${escaped}</${name}>`;
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

  function childText(body, localName) {
    const match = new RegExp(`<${localName}>([\\s\\S]*?)<\\/${localName}>`).exec(body || "");
    return match ? decodeXml(match[1].trim()) : "";
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

  function hex(value) {
    return `0x${Number(value).toString(16).padStart(8, "0").toUpperCase()}`;
  }
})();
