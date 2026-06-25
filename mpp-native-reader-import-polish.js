/*
  Native MPP import polish.
  Runs after mpp-native-reader.js and before app import handlers.
  It keeps the browser-only reader honest, but preserves more data from native
  Project task-cache streams when a file like PJM - Standard.mpp is decoded.
*/
(() => {
  "use strict";

  const reader = window.NativeMppReader;
  if (!reader || window.__nativeMppImportPolishLoaded) return;
  window.__nativeMppImportPolishLoaded = true;

  const VERSION = "0.7.0-polish";
  const TASK_PRED_FIELD_ID = 0x0b408053;
  const ENDOFCHAIN = -2;
  const textDecoderUtf8 = new TextDecoder("utf-8", { fatal: false });
  const textDecoderUtf16 = new TextDecoder("utf-16le", { fatal: false });
  const LINK_TYPE_TO_PROJECT = { FF: 0, FS: 1, SS: 2, SF: 3 };

  const baseRead = reader.read?.bind(reader);
  const baseReadBuffer = reader.readBuffer?.bind(reader);
  const baseReadBufferAsync = reader.readBufferAsync?.bind(reader);

  if (baseReadBuffer) {
    reader.readBuffer = function polishedReadBuffer(buffer, fileName = "project.mpp", options = {}) {
      return polishResult(buffer, baseReadBuffer(buffer, fileName, options));
    };
  }

  if (baseReadBufferAsync) {
    reader.readBufferAsync = async function polishedReadBufferAsync(buffer, fileName = "project.mpp") {
      return polishResult(buffer, await baseReadBufferAsync(buffer, fileName));
    };
  }

  if (baseRead) {
    reader.read = async function polishedRead(file) {
      const buffer = await file.arrayBuffer();
      if (reader.readBufferAsync) return reader.readBufferAsync(buffer, file.name || "project.mpp");
      return polishResult(buffer, await baseRead(file));
    };
  }

  reader.importPolishVersion = VERSION;

  function polishResult(buffer, result) {
    if (!result?.projectXml || !result?.nativeTable || !result?.project?.tasks?.length) return result;
    try {
      const details = collectNativeTaskDetails(buffer, result.project.tasks);
      if (!details) return result;
      const polished = polishProjectXml(result.projectXml, result.project.tasks, details);
      if (!polished.changed) return result;

      result.projectXml = polished.xml;
      result.importPolish = {
        version: VERSION,
        displayPredecessorRows: details.displayPredecessorRows,
        displayPredecessorLinks: polished.displayLinksAdded,
        externalDisplayPredecessors: polished.externalDisplayLinks,
        milestones: polished.milestonesApplied,
        notes: polished.notesApplied,
      };
      result.nativeTable.importPolishVersion = VERSION;
      result.nativeTable.linkCount = Math.max(Number(result.nativeTable.linkCount) || 0, polished.totalPredecessorLinks);
      result.nativeTable.fieldCoverage = {
        ...(result.nativeTable.fieldCoverage || {}),
        nativePredecessorTextRows: details.displayPredecessorRows,
        nativePredecessorLinksAdded: polished.displayLinksAdded,
        externalNativePredecessors: polished.externalDisplayLinks,
        milestones: polished.milestonesApplied,
        nativeImportNotes: polished.notesApplied,
      };
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP import polish ${VERSION}: added ${polished.displayLinksAdded} display predecessor link${polished.displayLinksAdded === 1 ? "" : "s"}, marked ${polished.milestonesApplied} same-day task${polished.milestonesApplied === 1 ? "" : "s"} as milestone${polished.milestonesApplied === 1 ? "" : "s"}, and preserved native row context in notes.`);
      return result;
    } catch (error) {
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP import polish failed: ${error.message || error}`);
      return result;
    }
  }

  function collectNativeTaskDetails(buffer, projectTasks) {
    if (!reader.CompoundFileBinary) return null;
    const cfb = new reader.CompoundFileBinary(buffer);
    const varMetaEntry = getEntryByPath(cfb, "TBkndTask/VarMeta");
    const var2DataEntry = getEntryByPath(cfb, "TBkndTask/Var2Data");
    if (!varMetaEntry || !var2DataEntry) return null;

    const wantedRows = new Set(projectTasks.map((task) => Number(task.rowId)).filter(Number.isFinite));
    if (!wantedRows.size) return null;

    const varMeta = cfb.getStream(varMetaEntry);
    const var2Data = cfb.getStream(var2DataEntry);
    const view = new DataView(varMeta.buffer, varMeta.byteOffset, varMeta.byteLength);
    const rows = new Map();

    for (let offset = 0x20; offset + 12 <= varMeta.length; offset += 12) {
      const fieldId = readUInt32(view, offset);
      const rowId = readUInt32(view, offset + 4);
      const valueOffset = readUInt32(view, offset + 8);
      if (!wantedRows.has(rowId) || !fieldId || valueOffset >= var2Data.length) continue;
      const row = rows.get(rowId) || { rowId, fields: new Map(), values: [] };
      const value = readLengthPrefixedValue(var2Data, valueOffset);
      if (value == null) continue;
      row.fields.set(fieldId, value);
      if (String(value || "").trim()) row.values.push(String(value));
      rows.set(rowId, row);
    }

    const tasks = new Map();
    let displayPredecessorRows = 0;
    projectTasks.forEach((task) => {
      const row = rows.get(Number(task.rowId));
      const sourcePredecessors = clean(row?.fields.get(TASK_PRED_FIELD_ID) || "");
      const explicitDurationDays = row ? inferDurationDays(row.values) : null;
      const isSameDayLeaf = !task.isSummary && task.start && task.finish && task.start === task.finish;
      const isMilestone = isSameDayLeaf && !(Number.isFinite(explicitDurationDays) && explicitDurationDays > 1);
      if (sourcePredecessors) displayPredecessorRows += 1;
      tasks.set(Number(task.id), {
        id: Number(task.id),
        uid: Number(task.id),
        rowId: Number(task.rowId),
        uniqueId: task.uniqueId,
        orderKey: task.orderKey,
        sourcePredecessors,
        explicitDurationDays,
        isMilestone,
      });
    });

    return { tasks, displayPredecessorRows };
  }

  function polishProjectXml(xml, projectTasks, details) {
    const tasksById = new Map(projectTasks.map((task) => [Number(task.id), task]));
    const importById = details.tasks;
    const taskIdToUid = new Map();
    xml.replace(/<Task>([\s\S]*?)<\/Task>/g, (_full, body) => {
      const id = Number(childTextFromBody(body, "ID"));
      const uid = Number(childTextFromBody(body, "UID"));
      if (id > 0 && uid > 0) taskIdToUid.set(id, uid);
      return _full;
    });

    let displayLinksAdded = 0;
    let externalDisplayLinks = 0;
    let milestonesApplied = 0;
    let notesApplied = 0;
    let totalPredecessorLinks = 0;
    let changed = false;

    const output = xml.replace(/<Task>([\s\S]*?)<\/Task>/g, (full, body) => {
      const id = Number(childTextFromBody(body, "ID"));
      if (!id) return full;
      const task = tasksById.get(id);
      const detail = importById.get(id);
      if (!task || !detail) return full;

      let nextBody = body;
      const existingLinks = parseExistingPredecessorKeys(nextBody);
      totalPredecessorLinks += existingLinks.size;
      const parsedDisplayLinks = parseDisplayPredecessors(detail.sourcePredecessors, id, taskIdToUid);
      const extraLinks = [];
      parsedDisplayLinks.forEach((link) => {
        if (!link.valid) {
          externalDisplayLinks += 1;
          return;
        }
        const key = `${link.predUid}:${LINK_TYPE_TO_PROJECT[link.type] ?? 1}`;
        if (existingLinks.has(key)) return;
        existingLinks.add(key);
        extraLinks.push(renderPredecessorLink(link));
      });
      if (extraLinks.length) {
        nextBody = `${nextBody}${extraLinks.join("")}`;
        displayLinksAdded += extraLinks.length;
        totalPredecessorLinks += extraLinks.length;
        changed = true;
      }

      if (detail.isMilestone) {
        const before = nextBody;
        nextBody = setOrInsertChild(nextBody, "Duration", "PT0H0M0S", "Finish");
        nextBody = setOrInsertChild(nextBody, "Work", "PT0H0M0S", "DurationFormat");
        nextBody = setOrInsertChild(nextBody, "Milestone", "1", "DurationFormat");
        if (nextBody !== before) {
          milestonesApplied += 1;
          changed = true;
        }
      }

      const noteLines = [];
      if (detail.sourcePredecessors) noteLines.push(`Native MPP predecessors: ${detail.sourcePredecessors}`);
      if (detail.isMilestone) noteLines.push("Native MPP import: same-day leaf task recovered as a zero-duration milestone.");
      if (detail.rowId || detail.uniqueId) noteLines.push(`Native MPP row ${detail.rowId || "?"}${detail.uniqueId ? `, unique ID ${detail.uniqueId}` : ""}${detail.orderKey != null ? `, order ${detail.orderKey}` : ""}.`);
      if (noteLines.length) {
        nextBody = appendNotes(nextBody, noteLines.join("\n"));
        notesApplied += 1;
        changed = true;
      }

      return nextBody === body ? full : `<Task>${nextBody}\n    </Task>`;
    });

    return { xml: output, changed, displayLinksAdded, externalDisplayLinks, milestonesApplied, notesApplied, totalPredecessorLinks };
  }

  function parseExistingPredecessorKeys(body) {
    const keys = new Set();
    body.replace(/<PredecessorLink>([\s\S]*?)<\/PredecessorLink>/g, (_full, linkBody) => {
      const uid = Number(childTextFromBody(linkBody, "PredecessorUID"));
      const type = Number(childTextFromBody(linkBody, "Type") || 1);
      if (uid > 0) keys.add(`${uid}:${Number.isFinite(type) ? type : 1}`);
      return _full;
    });
    return keys;
  }

  function parseDisplayPredecessors(value, selfId, taskIdToUid) {
    const text = clean(value);
    if (!text) return [];
    return text.split(/[;,]+/).map((token) => parseDisplayPredecessorToken(token, selfId, taskIdToUid)).filter(Boolean);
  }

  function parseDisplayPredecessorToken(token, selfId, taskIdToUid) {
    const text = clean(token).replace(/\s+/g, "");
    if (!text) return null;
    const match = /^(\d+)(FS|SS|FF|SF)?([+-](?:\d+(?:\.\d+)?|\.\d+)(?:mo|mon|mons|month|months|w|wk|wks|week|weeks|d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)?)?$/i.exec(text);
    if (!match) return { valid: false, raw: text };
    const predId = Number(match[1]);
    const predUid = taskIdToUid.get(predId);
    if (!predUid || predId === Number(selfId)) return { valid: false, raw: text, predId };
    const type = String(match[2] || "FS").toUpperCase();
    return {
      valid: true,
      predId,
      predUid,
      type: LINK_TYPE_TO_PROJECT[type] == null ? "FS" : type,
      lagMinutes: parseDisplayLagMinutes(match[3] || ""),
      raw: text,
    };
  }

  function parseDisplayLagMinutes(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return 0;
    const match = /^([+-])(\d+(?:\.\d+)?|\.\d+)(mo|mon|mons|month|months|w|wk|wks|week|weeks|d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)?$/.exec(text);
    if (!match) return 0;
    const sign = match[1] === "-" ? -1 : 1;
    const amount = Number(match[2]);
    const unit = match[3] || "d";
    if (!Number.isFinite(amount)) return 0;
    let minutesPerUnit = 480;
    if (unit.startsWith("mo")) minutesPerUnit = 20 * 480;
    else if (unit.startsWith("w")) minutesPerUnit = 5 * 480;
    else if (unit.startsWith("h")) minutesPerUnit = 60;
    else if (unit === "m" || unit.startsWith("min")) minutesPerUnit = 1;
    return Math.round(sign * amount * minutesPerUnit);
  }

  function renderPredecessorLink(link) {
    return `\n      <PredecessorLink>\n        <PredecessorUID>${link.predUid}</PredecessorUID>\n        <Type>${LINK_TYPE_TO_PROJECT[link.type] ?? 1}</Type>\n        <CrossProject>0</CrossProject>\n        <LinkLag>${Math.round((Number(link.lagMinutes) || 0) * 10)}</LinkLag>\n        <LagFormat>7</LagFormat>\n      </PredecessorLink>`;
  }

  function appendNotes(body, text) {
    if (!text) return body;
    const escaped = escapeXmlValue(text);
    if (/<Notes>[\s\S]*?<\/Notes>/.test(body)) {
      return body.replace(/<Notes>([\s\S]*?)<\/Notes>/, (_full, current) => `<Notes>${current}${current ? "&#10;" : ""}${escaped}</Notes>`);
    }
    return body.replace(/(<Name>[\s\S]*?<\/Name>)/, `$1\n      <Notes>${escaped}</Notes>`);
  }

  function setOrInsertChild(body, name, value, afterName = "") {
    const escaped = escapeXmlValue(value);
    const pattern = new RegExp(`<${name}>[\\s\\S]*?<\\/${name}>`);
    if (pattern.test(body)) return body.replace(pattern, `<${name}>${escaped}</${name}>`);
    const afterPattern = afterName ? new RegExp(`(<${afterName}>[\\s\\S]*?<\\/${afterName}>)`) : null;
    if (afterPattern && afterPattern.test(body)) return body.replace(afterPattern, `$1\n      <${name}>${escaped}</${name}>`);
    return `${body}\n      <${name}>${escaped}</${name}>`;
  }

  function childTextFromBody(body, localName) {
    const match = new RegExp(`<${localName}>([\\s\\S]*?)<\\/${localName}>`).exec(body);
    return match ? decodeXmlValue(match[1].trim()) : "";
  }

  function getEntryByPath(cfb, suffix) {
    const normalizedSuffix = String(suffix || "").toLowerCase();
    return cfb.entries.find((entry) => entry.type === 2 && String(entry.path || "").toLowerCase().endsWith(normalizedSuffix)) || null;
  }

  function readUInt32(view, offset) {
    return offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0;
  }

  function readInt32(view, offset) {
    return offset + 4 <= view.byteLength ? view.getInt32(offset, true) : ENDOFCHAIN;
  }

  function readUInt16(view, offset) {
    return offset + 2 <= view.byteLength ? view.getUint16(offset, true) : 0;
  }

  function readLengthPrefixedValue(bytes, offset) {
    if (!bytes || offset == null || offset < 0 || offset + 4 > bytes.length) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const length = readUInt32(view, offset);
    if (!Number.isFinite(length) || length < 0 || length > bytes.length - offset - 4 || length > 1024 * 1024) return null;
    const raw = bytes.slice(offset + 4, offset + 4 + length);
    if (!raw.length) return "";
    if (raw.length % 2 === 0 && looksMostlyUtf16(raw)) return textDecoderUtf16.decode(raw).replace(/\0+$/g, "").trim();
    if (looksMostlyAnsi(raw)) return textDecoderUtf8.decode(raw).replace(/\0+$/g, "").trim();
    if (raw.length === 4) {
      const rawView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      const intValue = readInt32(rawView, 0);
      if (intValue === -1 || intValue === 0) return "";
      return String(intValue);
    }
    return "";
  }

  function looksMostlyUtf16(bytes) {
    if (bytes.length < 6 || bytes.length % 2 !== 0) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let good = 0;
    let total = 0;
    for (let i = 0; i + 2 <= bytes.length; i += 2) {
      const code = readUInt16(view, i);
      total += 1;
      if (code && isPrintableCodePoint(code)) good += 1;
    }
    return total > 0 && good / total > 0.85;
  }

  function looksMostlyAnsi(bytes) {
    if (bytes.length < 3) return false;
    let good = 0;
    for (const byte of bytes) {
      if (byte && isPrintableAscii(byte)) good += 1;
    }
    return good / bytes.length > 0.88;
  }

  function isPrintableAscii(code) {
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
  }

  function isPrintableCodePoint(code) {
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0x007e) || (code >= 0x00a0 && code <= 0xffff);
  }

  function clean(value) {
    return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  }

  function inferDurationDays(values) {
    for (const value of values || []) {
      const days = parseDurationDays(value);
      if (Number.isFinite(days) && days > 0) return days;
    }
    return null;
  }

  function parseDurationDays(value) {
    const text = clean(value).toLowerCase();
    let match = /(-?\d+(?:\.\d+)?)\s*(?:d|day|days)\b/.exec(text);
    if (match) return Math.max(1, Math.round(Number(match[1])));
    match = /(-?\d+(?:\.\d+)?)\s*(?:w|wk|wks|week|weeks)\b/.exec(text);
    if (match) return Math.max(1, Math.round(Number(match[1]) * 5));
    match = /(-?\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/.exec(text);
    if (match) return Math.max(1, Math.round(Number(match[1]) / 8));
    return null;
  }

  function escapeXmlValue(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function decodeXmlValue(value) {
    return String(value || "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#10;/g, "\n")
      .replace(/&amp;/g, "&");
  }
})();
