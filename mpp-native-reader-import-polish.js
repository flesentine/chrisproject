/*
  Native MPP import polish.
  Runs after mpp-native-reader.js and before app import handlers.
  Preserves more data from native Microsoft Project task/resource cache streams
  when a static-browser MPP import produces generated Project XML.
*/
(() => {
  "use strict";

  const reader = window.NativeMppReader;
  if (!reader || window.__nativeMppImportPolishLoaded) return;
  window.__nativeMppImportPolishLoaded = true;

  const VERSION = "0.8.0-polish";
  const TASK_PRED_FIELD_ID = 0x0b408053;
  const RESOURCE_NAME_FIELD_ID = 0x0c4002f5;
  const RESOURCE_INITIAL_FIELD_ID = 0x0c400001;
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
    if (!result?.projectXml || !result?.nativeTable || !reader.CompoundFileBinary) return result;
    try {
      const cfb = new reader.CompoundFileBinary(buffer);
      let xml = result.projectXml;
      let taskStats = null;
      let resourceStats = null;
      let changed = false;

      if (result.project?.tasks?.length) {
        const taskDetails = collectNativeTaskDetails(cfb, result.project.tasks);
        if (taskDetails) {
          const polished = polishProjectXml(xml, result.project.tasks, taskDetails);
          if (polished.changed) {
            xml = polished.xml;
            taskStats = { ...polished, displayPredecessorRows: taskDetails.displayPredecessorRows };
            changed = true;
          }
        }
      }

      const resources = decodeNativeResources(cfb);
      if (resources.length) {
        const resourceHit = injectResourcesXml(xml, resources);
        if (resourceHit.changed) {
          xml = resourceHit.xml;
          resourceStats = {
            count: resources.length,
            names: resources.map((resource) => resource.name),
            streams: resourceHit.streams,
          };
          changed = true;
        }
      }

      if (!changed) return result;
      result.projectXml = xml;
      result.project = result.project || {};
      result.importPolish = {
        version: VERSION,
        displayPredecessorRows: taskStats?.displayPredecessorRows || 0,
        displayPredecessorLinks: taskStats?.displayLinksAdded || 0,
        externalDisplayPredecessors: taskStats?.externalDisplayLinks || 0,
        milestones: taskStats?.milestonesApplied || 0,
        notes: taskStats?.notesApplied || 0,
        resources: resourceStats?.count || 0,
      };

      if (resourceStats) {
        result.project.resourceCount = resourceStats.count;
        result.project.resources = resources.map((resource) => ({
          id: resource.id,
          uid: resource.uid,
          rowId: resource.rowId,
          name: resource.name,
          initials: resource.initials,
          type: resource.type,
        }));
        result.importResources = {
          version: VERSION,
          count: resourceStats.count,
          names: resourceStats.names,
        };
      }

      result.nativeTable.importPolishVersion = VERSION;
      if (taskStats) {
        result.nativeTable.linkCount = Math.max(Number(result.nativeTable.linkCount) || 0, taskStats.totalPredecessorLinks);
      }
      if (resourceStats) {
        result.nativeTable.resourceCount = resourceStats.count;
        result.nativeTable.resourceStrategy = "native-resource-table-cache";
        result.nativeTable.resourceStreams = resourceStats.streams;
      }
      result.nativeTable.fieldCoverage = {
        ...(result.nativeTable.fieldCoverage || {}),
        ...(taskStats ? {
          nativePredecessorTextRows: taskStats.displayPredecessorRows,
          nativePredecessorLinksAdded: taskStats.displayLinksAdded,
          externalNativePredecessors: taskStats.externalDisplayLinks,
          milestones: taskStats.milestonesApplied,
          nativeImportNotes: taskStats.notesApplied,
        } : {}),
        ...(resourceStats ? {
          resources: resourceStats.count,
          resourceNames: resources.filter((resource) => resource.name).length,
          resourceInitials: resources.filter((resource) => resource.initials).length,
        } : {}),
      };

      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      const pieces = [];
      if (taskStats) pieces.push(`added ${taskStats.displayLinksAdded} display predecessor link${taskStats.displayLinksAdded === 1 ? "" : "s"}, marked ${taskStats.milestonesApplied} same-day task${taskStats.milestonesApplied === 1 ? "" : "s"} as milestone${taskStats.milestonesApplied === 1 ? "" : "s"}, and preserved native row context in notes`);
      if (resourceStats) pieces.push(`decoded ${resourceStats.count} resource${resourceStats.count === 1 ? "" : "s"} from native TBkndRsc streams`);
      result.warnings.push(`MPP import polish ${VERSION}: ${pieces.join("; ")}.`);
      return result;
    } catch (error) {
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP import polish failed: ${error.message || error}`);
      return result;
    }
  }

  function collectNativeTaskDetails(cfb, projectTasks) {
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

  function decodeNativeResources(cfb) {
    const varMetaEntry = getEntryByPath(cfb, "TBkndRsc/VarMeta");
    const var2DataEntry = getEntryByPath(cfb, "TBkndRsc/Var2Data");
    if (!varMetaEntry || !var2DataEntry) return [];

    const varMeta = cfb.getStream(varMetaEntry);
    const var2Data = cfb.getStream(var2DataEntry);
    if (varMeta.length < 32 || !var2Data.length) return [];

    const view = new DataView(varMeta.buffer, varMeta.byteOffset, varMeta.byteLength);
    const rows = new Map();

    for (let offset = 0x20; offset + 12 <= varMeta.length; offset += 12) {
      const fieldId = readUInt32(view, offset);
      const rowId = readUInt32(view, offset + 4);
      const valueOffset = readUInt32(view, offset + 8);
      if (!fieldId || valueOffset >= var2Data.length) continue;
      const row = rows.get(rowId) || { rowId, fields: new Map(), nameOffset: null };
      const value = fieldId === RESOURCE_NAME_FIELD_ID
        ? readLengthPrefixedTextLenient(var2Data, valueOffset)
        : readLengthPrefixedValue(var2Data, valueOffset);
      if (value != null) row.fields.set(fieldId, value);
      if (fieldId === RESOURCE_NAME_FIELD_ID) row.nameOffset = valueOffset;
      rows.set(rowId, row);
    }

    const resources = [];
    const seenNames = new Set();
    [...rows.values()].sort((a, b) => a.rowId - b.rowId).forEach((row) => {
      const name = normalizeResourceName(row.fields.get(RESOURCE_NAME_FIELD_ID));
      if (!name) return;
      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) return;
      seenNames.add(nameKey);
      const id = resources.length + 1;
      resources.push({
        id,
        uid: Number.isInteger(row.rowId) && row.rowId > 0 ? row.rowId : id,
        rowId: row.rowId,
        name,
        initials: normalizeInitials(row.fields.get(RESOURCE_INITIAL_FIELD_ID), name),
        type: "Work",
        maxUnits: 1,
        standardRate: "0",
        overtimeRate: "0",
        costPerUse: "0",
        notes: `Native MPP resource row ${row.rowId}${row.nameOffset != null ? `, name offset ${row.nameOffset}` : ""}.`,
      });
    });

    resources.streams = { varMeta: varMetaEntry.path, var2Data: var2DataEntry.path };
    return resources;
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

  function injectResourcesXml(xml, resources) {
    const streams = resources.streams || {};
    const hasRealResources = /<Resources>[\s\S]*?<Resource>[\s\S]*?<ID>\s*[1-9]/.test(xml);
    if (hasRealResources) return { xml, changed: false, streams };

    const resourcesXml = `\n  <Resources>${resources.map(renderResourceXml).join("")}\n  </Resources>`;
    if (/<Resources>[\s\S]*?<\/Resources>/.test(xml)) {
      return { xml: xml.replace(/<Resources>[\s\S]*?<\/Resources>/, resourcesXml.trim()), changed: true, streams };
    }
    if (/<Assignments>[\s\S]*?<\/Assignments>/.test(xml)) {
      return { xml: xml.replace(/<Assignments>[\s\S]*?<\/Assignments>/, `${resourcesXml}\n  $&`), changed: true, streams };
    }
    return { xml: xml.replace(/\s*<\/Project>\s*$/, `${resourcesXml}\n</Project>`), changed: true, streams };
  }

  function renderResourceXml(resource) {
    return `\n    <Resource>\n      <UID>${resource.uid}</UID>\n      <ID>${resource.id}</ID>\n      <Name>${escapeXmlValue(resource.name)}</Name>\n      <Type>0</Type>\n      <IsNull>0</IsNull>\n      <Initials>${escapeXmlValue(resource.initials)}</Initials>\n      <MaxUnits>${Number(resource.maxUnits || 1).toFixed(2)}</MaxUnits>\n      <StandardRate>${escapeXmlValue(resource.standardRate || "0")}</StandardRate>\n      <StandardRateFormat>2</StandardRateFormat>\n      <OvertimeRate>${escapeXmlValue(resource.overtimeRate || "0")}</OvertimeRate>\n      <OvertimeRateFormat>2</OvertimeRateFormat>\n      <CostPerUse>${escapeXmlValue(resource.costPerUse || "0")}</CostPerUse>\n      <AccrueAt>3</AccrueAt>\n      <BaseCalendarUID>1</BaseCalendarUID>\n      <Notes>${escapeXmlValue(resource.notes || "")}</Notes>\n    </Resource>`;
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
    if (raw.length === 8) {
      const rawView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      const maybeNumber = rawView.getFloat64(0, true);
      if (Number.isFinite(maybeNumber) && Math.abs(maybeNumber) < 1000000000) return String(maybeNumber);
    }
    return "";
  }

  function readLengthPrefixedTextLenient(bytes, offset) {
    if (!bytes || offset == null || offset < 0 || offset + 4 > bytes.length) return "";
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const length = readUInt32(view, offset);
    if (!Number.isFinite(length) || length < 2 || length > bytes.length - offset - 4 || length > 4096) return "";
    const raw = bytes.slice(offset + 4, offset + 4 + length);
    if (!raw.length) return "";
    if (raw.length % 2 === 0) {
      const text = textDecoderUtf16.decode(raw).replace(/\0+$/g, "").trim();
      if (looksLikeResourceText(text)) return text;
    }
    const ansi = textDecoderUtf8.decode(raw).replace(/\0+$/g, "").trim();
    return looksLikeResourceText(ansi) ? ansi : "";
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
    for (const byte of bytes) if (byte && isPrintableAscii(byte)) good += 1;
    return good / bytes.length > 0.88;
  }

  function isPrintableAscii(code) {
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
  }

  function isPrintableCodePoint(code) {
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0x007e) || (code >= 0x00a0 && code <= 0xffff);
  }

  function normalizeResourceName(value) {
    const text = clean(value);
    if (!looksLikeResourceText(text)) return "";
    if (/^(Standard|Calendar|Resource Name|Type|Work|Material|Cost)$/i.test(text)) return "";
    return text;
  }

  function looksLikeResourceText(value) {
    const text = clean(value);
    if (text.length < 2 || text.length > 120) return false;
    if (!/[A-Za-z\p{L}]/u.test(text)) return false;
    if (/�|[\u0000-\u001f\u007f]/.test(text)) return false;
    const punctuation = (text.match(/[^\p{L}\p{N} ._&/#'()+\-]/gu) || []).length;
    return punctuation <= Math.max(2, Math.floor(text.length / 4));
  }

  function normalizeInitials(value, name) {
    const text = clean(value);
    const numeric = Number(text);
    if (Number.isInteger(numeric) && numeric >= 32 && numeric <= 126) return String.fromCharCode(numeric).slice(0, 8);
    if (looksLikeResourceText(text) && text.length <= 8) return text;
    return name.split(/\s+/).map((part) => part[0] || "").join("").slice(0, 8).toUpperCase() || name.slice(0, 1).toUpperCase();
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

  function clean(value) {
    return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  }

  function escapeXmlValue(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  }

  function decodeXmlValue(value) {
    return String(value || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, "\n").replace(/&amp;/g, "&");
  }
})();
