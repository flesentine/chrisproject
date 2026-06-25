/* Native MPP dependency lag precision polish.
   Re-parses display predecessor fields after the base import polish has created
   PredecessorLink nodes, then updates LinkLag/LagFormat with better unit parsing. */
(() => {
  "use strict";
  const reader = window.NativeMppReader;
  if (!reader || window.__nativeMppDependencyLagPolishLoaded) return;
  window.__nativeMppDependencyLagPolishLoaded = true;

  const VERSION = "0.1.0-dependency-lag-precision";
  const PREDECESSOR_FIELD_ID = 0x0b408053;
  const TYPE_TO_PROJECT = { FF: 0, FS: 1, SS: 2, SF: 3 };
  const PROJECT_TO_TYPE = { 0: "FF", 1: "FS", 2: "SS", 3: "SF" };
  const MINUTES_PER_DAY = 480;
  const decoderUtf8 = new TextDecoder("utf-8", { fatal: false });
  const decoderUtf16 = new TextDecoder("utf-16le", { fatal: false });

  const baseRead = reader.read?.bind(reader);
  const baseReadBuffer = reader.readBuffer?.bind(reader);
  const baseReadBufferAsync = reader.readBufferAsync?.bind(reader);

  if (baseReadBuffer) {
    reader.readBuffer = function lagReadBuffer(buffer, fileName = "project.mpp", options = {}) {
      return polishLagResult(buffer, baseReadBuffer(buffer, fileName, options));
    };
  }

  if (baseReadBufferAsync) {
    reader.readBufferAsync = async function lagReadBufferAsync(buffer, fileName = "project.mpp") {
      return polishLagResult(buffer, await baseReadBufferAsync(buffer, fileName));
    };
  }

  if (baseRead) {
    reader.read = async function lagRead(file) {
      const buffer = await file.arrayBuffer();
      if (reader.readBufferAsync) return reader.readBufferAsync(buffer, file.name || "project.mpp");
      return polishLagResult(buffer, await baseRead(file));
    };
  }

  reader.dependencyLagPolishVersion = VERSION;

  function polishLagResult(buffer, result) {
    if (!result?.projectXml || !result?.project?.tasks?.length || !reader.CompoundFileBinary) return result;
    try {
      const cfb = new reader.CompoundFileBinary(buffer);
      const displayPreds = decodeDisplayPredecessors(cfb, result.project.tasks);
      if (!displayPreds.size) return result;
      const hit = patchXmlLinks(result.projectXml, result.project.tasks, displayPreds);
      result.importDependencyLags = {
        version: VERSION,
        linksParsed: hit.linksParsed,
        linksUpdated: hit.linksUpdated,
        fractionalLags: hit.fractionalLags,
        leadLinks: hit.leadLinks,
        percentLags: hit.percentLags,
        unsupportedPercentLags: hit.unsupportedPercentLags,
        source: "native display predecessor field 0x0B408053",
      };
      result.importPolish = { ...(result.importPolish || {}), dependencyLagPrecision: hit.linksUpdated, dependencyLagPolishVersion: VERSION };
      result.nativeTable = result.nativeTable || {};
      result.nativeTable.fieldCoverage = {
        ...(result.nativeTable.fieldCoverage || {}),
        dependencyLagLinksParsed: hit.linksParsed,
        dependencyLagLinksUpdated: hit.linksUpdated,
        dependencyLeadLinks: hit.leadLinks,
        dependencyPercentLags: hit.percentLags,
      };
      if (hit.changed) result.projectXml = hit.xml;
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP dependency lag polish ${VERSION}: parsed ${hit.linksParsed} display predecessor lag${hit.linksParsed === 1 ? "" : "s"} and updated ${hit.linksUpdated} Project XML link lag${hit.linksUpdated === 1 ? "" : "s"}.`);
      return result;
    } catch (error) {
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP dependency lag polish failed: ${error.message || error}`);
      return result;
    }
  }

  function decodeDisplayPredecessors(cfb, projectTasks) {
    const table = readTaskVarTable(cfb);
    if (!table) return new Map();
    const rowToTask = new Map(projectTasks.map((task) => [Number(task.rowId), Number(task.id)]).filter(([row]) => Number.isFinite(row)));
    const byTaskId = new Map();
    table.rows.forEach((fields, rowId) => {
      const taskId = rowToTask.get(rowId);
      if (!taskId) return;
      const raw = clean(fields.get(PREDECESSOR_FIELD_ID));
      if (!raw) return;
      const links = parseDisplayPredecessors(raw);
      if (links.length) byTaskId.set(taskId, links);
    });
    return byTaskId;
  }

  function patchXmlLinks(xml, projectTasks, displayPreds) {
    const taskById = new Map(projectTasks.map((task) => [Number(task.id), task]));
    const idToUid = new Map();
    const idToDuration = new Map();
    xml.replace(/<Task>([\s\S]*?)<\/Task>/g, (_full, body) => {
      const id = Number(childText(body, "ID"));
      const uid = Number(childText(body, "UID"));
      if (!id || !uid) return;
      idToUid.set(id, uid);
      idToDuration.set(id, projectDurationMinutes(childText(body, "Duration")) || taskDurationMinutes(taskById.get(id)) || MINUTES_PER_DAY);
    });

    let linksParsed = 0;
    let linksUpdated = 0;
    let fractionalLags = 0;
    let leadLinks = 0;
    let percentLags = 0;
    let unsupportedPercentLags = 0;
    let changed = false;

    const out = xml.replace(/<Task>([\s\S]*?)<\/Task>/g, (full, body) => {
      const taskId = Number(childText(body, "ID"));
      const parsed = displayPreds.get(taskId);
      if (!parsed?.length) return full;
      let next = body;
      parsed.forEach((link) => {
        const predecessorUid = idToUid.get(link.id);
        if (!predecessorUid || predecessorUid === Number(childText(body, "UID"))) return;
        const normalized = normalizeLag(link, idToDuration.get(link.id));
        if (!normalized.supported) {
          unsupportedPercentLags += 1;
          return;
        }
        linksParsed += 1;
        if (link.isFractional) fractionalLags += 1;
        if (normalized.minutes < 0) leadLinks += 1;
        if (link.unit === "%") percentLags += 1;
        const before = next;
        next = upsertPredecessorLink(next, predecessorUid, link.type, normalized);
        if (next !== before) {
          linksUpdated += 1;
          changed = true;
        }
      });
      return next === body ? full : `<Task>${next}\n    </Task>`;
    });

    return { xml: out, changed, linksParsed, linksUpdated, fractionalLags, leadLinks, percentLags, unsupportedPercentLags };
  }

  function upsertPredecessorLink(body, predecessorUid, type, lag) {
    const projectType = TYPE_TO_PROJECT[type] ?? 1;
    let matched = false;
    let next = body.replace(/<PredecessorLink>([\s\S]*?)<\/PredecessorLink>/g, (full, inner) => {
      const uid = Number(childText(inner, "PredecessorUID"));
      const existingType = Number(childText(inner, "Type") || "1");
      if (uid !== predecessorUid || existingType !== projectType) return full;
      matched = true;
      let updated = setOrInsert(inner, "PredecessorUID", String(predecessorUid));
      updated = setOrInsert(updated, "Type", String(projectType), "PredecessorUID");
      updated = setOrInsert(updated, "CrossProject", "0", "Type");
      updated = setOrInsert(updated, "LinkLag", String(Math.round(lag.minutes * 10)), "CrossProject");
      updated = setOrInsert(updated, "LagFormat", String(lag.format), "LinkLag");
      return `<PredecessorLink>${updated}</PredecessorLink>`;
    });
    if (matched) return next;
    const block = `\n      <PredecessorLink><PredecessorUID>${predecessorUid}</PredecessorUID><Type>${projectType}</Type><CrossProject>0</CrossProject><LinkLag>${Math.round(lag.minutes * 10)}</LinkLag><LagFormat>${lag.format}</LagFormat></PredecessorLink>`;
    return `${body}${block}`;
  }

  function parseDisplayPredecessors(value) {
    return clean(value).split(/[;,]+/).map(parseOnePredecessor).filter(Boolean);
  }

  function parseOnePredecessor(value) {
    const text = clean(value).replace(/\s+/g, "");
    if (!text) return null;
    const match = /^(\d+)(FS|SS|FF|SF)?(?:(\+|-)(\d+(?:\.\d+)?)(e?(?:mo|mon|mons|month|months|w|wk|wks|week|weeks|d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)|%))?$/i.exec(text);
    if (!match) return null;
    const amount = match[4] == null ? 0 : Number(match[4]);
    const unit = normalizeUnit(match[5] || "d");
    const sign = match[3] === "-" ? -1 : 1;
    if (!Number.isFinite(amount)) return null;
    return {
      id: Number(match[1]),
      type: (match[2] || "FS").toUpperCase(),
      sign,
      amount,
      unit,
      raw: value,
      isFractional: !Number.isInteger(amount),
    };
  }

  function normalizeLag(link, predecessorDurationMinutes) {
    if (!link.amount) return { supported: true, minutes: 0, format: lagFormatForUnit(link.unit) };
    if (link.unit === "%") {
      const duration = Number(predecessorDurationMinutes);
      if (!Number.isFinite(duration) || duration < 0) return { supported: false, minutes: 0, format: 19 };
      return { supported: true, minutes: link.sign * duration * (link.amount / 100), format: 19 };
    }
    return { supported: true, minutes: link.sign * link.amount * minutesPerUnit(link.unit), format: lagFormatForUnit(link.unit) };
  }

  function normalizeUnit(unit) {
    const u = String(unit || "d").toLowerCase();
    if (u === "%") return "%";
    if (/^e?mo|^e?mon|month/.test(u)) return u.startsWith("e") ? "emo" : "mo";
    if (/^e?w|wk|week/.test(u)) return u.startsWith("e") ? "ew" : "w";
    if (/^e?d|day/.test(u)) return u.startsWith("e") ? "ed" : "d";
    if (/^e?h|hr|hour/.test(u)) return u.startsWith("e") ? "eh" : "h";
    if (/^e?m|min|minute/.test(u)) return u.startsWith("e") ? "em" : "m";
    return "d";
  }

  function minutesPerUnit(unit) {
    switch (unit) {
      case "m":
      case "em": return 1;
      case "h":
      case "eh": return 60;
      case "w":
      case "ew": return 5 * MINUTES_PER_DAY;
      case "mo":
      case "emo": return 20 * MINUTES_PER_DAY;
      case "d":
      case "ed":
      default: return MINUTES_PER_DAY;
    }
  }

  function lagFormatForUnit(unit) {
    switch (unit) {
      case "m": return 3;
      case "em": return 4;
      case "h": return 5;
      case "eh": return 6;
      case "d": return 7;
      case "ed": return 8;
      case "w": return 9;
      case "ew": return 10;
      case "mo": return 11;
      case "emo": return 12;
      case "%": return 19;
      default: return 7;
    }
  }

  function taskDurationMinutes(task) {
    const direct = Number(task?.durationMinutes);
    if (Number.isFinite(direct) && direct >= 0) return direct;
    const days = Number(task?.durationDays);
    if (Number.isFinite(days) && days >= 0) return days * MINUTES_PER_DAY;
    return MINUTES_PER_DAY;
  }

  function projectDurationMinutes(value) {
    const text = String(value || "");
    const match = /^P(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)$/i.exec(text);
    if (!match) return 0;
    return (Number(match[1]) || 0) * 60 + (Number(match[2]) || 0) + Math.round((Number(match[3]) || 0) / 60);
  }

  function readTaskVarTable(cfb) {
    const metaEntry = getEntry(cfb, "TBkndTask/VarMeta");
    const dataEntry = getEntry(cfb, "TBkndTask/Var2Data");
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
      if (value == null) continue;
      const row = rows.get(rowId) || new Map();
      row.set(fieldId, value);
      rows.set(rowId, row);
    }
    return { rows };
  }

  function setOrInsert(body, name, value, afterName = "") {
    const escaped = escapeXml(value);
    const pattern = new RegExp(`<${name}>[\\s\\S]*?<\\/${name}>`);
    if (pattern.test(body)) return body.replace(pattern, `<${name}>${escaped}</${name}>`);
    const afterPattern = afterName ? new RegExp(`(<${afterName}>[\\s\\S]*?<\\/${afterName}>)`) : null;
    if (afterPattern && afterPattern.test(body)) return body.replace(afterPattern, `$1\n        <${name}>${escaped}</${name}>`);
    return `${body}\n        <${name}>${escaped}</${name}>`;
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
})();
