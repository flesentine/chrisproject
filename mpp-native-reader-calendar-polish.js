/* Native MPP calendar polish.
   Loads after mpp-native-reader-import-polish.js and injects recoverable calendars
   from TBkndCal streams into generated MSPDI XML. */
(() => {
  "use strict";
  const reader = window.NativeMppReader;
  if (!reader || window.__nativeMppCalendarPolishLoaded) return;
  window.__nativeMppCalendarPolishLoaded = true;

  const VERSION = "0.1.0-calendars";
  const NAME_FIELD_IDS = [0x0d40001a, 0x0d400008, 0x0d400001];
  const decoderUtf8 = new TextDecoder("utf-8", { fatal: false });
  const decoderUtf16 = new TextDecoder("utf-16le", { fatal: false });

  const baseRead = reader.read?.bind(reader);
  const baseReadBuffer = reader.readBuffer?.bind(reader);
  const baseReadBufferAsync = reader.readBufferAsync?.bind(reader);

  if (baseReadBuffer) {
    reader.readBuffer = function calendarReadBuffer(buffer, fileName = "project.mpp", options = {}) {
      return polishCalendarResult(buffer, baseReadBuffer(buffer, fileName, options));
    };
  }

  if (baseReadBufferAsync) {
    reader.readBufferAsync = async function calendarReadBufferAsync(buffer, fileName = "project.mpp") {
      return polishCalendarResult(buffer, await baseReadBufferAsync(buffer, fileName));
    };
  }

  if (baseRead) {
    reader.read = async function calendarRead(file) {
      const buffer = await file.arrayBuffer();
      if (reader.readBufferAsync) return reader.readBufferAsync(buffer, file.name || "project.mpp");
      return polishCalendarResult(buffer, await baseRead(file));
    };
  }

  reader.calendarPolishVersion = VERSION;

  function polishCalendarResult(buffer, result) {
    if (!result?.projectXml || !reader.CompoundFileBinary) return result;
    try {
      const cfb = new reader.CompoundFileBinary(buffer);
      const calendars = decodeCalendars(cfb);
      if (!calendars.length) return result;
      const hit = injectCalendars(result.projectXml, calendars);
      if (!hit.changed) return result;
      result.projectXml = hit.xml;
      result.importCalendars = {
        version: VERSION,
        count: calendars.length,
        names: calendars.map((calendar) => calendar.name),
        source: "native-TBkndCal-name-table",
        note: "Calendar names and broad working patterns are decoded. Holiday exceptions are not decoded yet.",
      };
      result.importPolish = { ...(result.importPolish || {}), calendars: calendars.length, calendarPolishVersion: VERSION };
      result.nativeTable = result.nativeTable || {};
      result.nativeTable.calendarCount = calendars.length;
      result.nativeTable.calendarStrategy = "native-calendar-name-table";
      result.nativeTable.fieldCoverage = { ...(result.nativeTable.fieldCoverage || {}), calendars: calendars.length };
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP calendar polish ${VERSION}: decoded ${calendars.length} calendar${calendars.length === 1 ? "" : "s"} from native TBkndCal streams. Holiday exceptions are not decoded yet.`);
      return result;
    } catch (error) {
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP calendar polish failed: ${error.message || error}`);
      return result;
    }
  }

  function decodeCalendars(cfb) {
    const metaEntry = getEntry(cfb, "TBkndCal/VarMeta");
    const dataEntry = getEntry(cfb, "TBkndCal/Var2Data");
    if (!metaEntry || !dataEntry) return [];
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    const view = new DataView(meta.buffer, meta.byteOffset, meta.byteLength);
    const rows = new Map();
    for (let offset = 0x20; offset + 12 <= meta.length; offset += 12) {
      const fieldId = readUInt32(view, offset);
      const rowId = readUInt32(view, offset + 4);
      const valueOffset = readUInt32(view, offset + 8);
      if (!NAME_FIELD_IDS.includes(fieldId) || valueOffset >= data.length) continue;
      const value = normalizeCalendarName(readLengthPrefixedValue(data, valueOffset));
      if (!value) continue;
      const row = rows.get(rowId) || { rowId, names: [] };
      row.names.push(value);
      rows.set(rowId, row);
    }

    const out = [{ uid: 1, id: 1, name: "Standard", kind: "standard", baseCalendarUid: 0 }];
    const seen = new Set(["standard"]);
    [...rows.values()].sort((a, b) => a.rowId - b.rowId).forEach((row) => {
      const name = chooseCalendarName(row.names);
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ uid: out.length + 1, id: out.length + 1, name, kind: inferCalendarKind(name), baseCalendarUid: 1, nativeRowId: row.rowId });
    });
    return out;
  }

  function chooseCalendarName(names) {
    return (names || []).find((name) => name && name.toLowerCase() !== "standard") || "";
  }

  function normalizeCalendarName(value) {
    const text = clean(value);
    if (!text || text.length < 2 || text.length > 120) return "";
    if (!/[A-Za-z\p{L}]/u.test(text)) return "";
    if (/^used for microsoft project 98 baseline calendar$/i.test(text)) return "";
    if (/^\d+$/.test(text)) return "";
    if (/�|[\u0000-\u001f\u007f]/.test(text)) return "";
    return text;
  }

  function inferCalendarKind(name) {
    const text = String(name || "").toLowerCase();
    if (/24\s*hour|24h/.test(text)) return "twentyFourHour";
    if (/7\s*day|7day|seven|all working|all\s+working/.test(text)) return "sevenDay";
    if (/6\s*day|6day|saturday|sat\b/.test(text)) return "sixDay";
    return "standard";
  }

  function injectCalendars(xml, calendars) {
    if (/<Calendars>[\s\S]*?<Calendar>[\s\S]*?<Name>/.test(xml)) return { xml, changed: false };
    const calendarXml = `\n  <Calendars>${calendars.map(renderCalendar).join("")}\n  </Calendars>`;
    let next = xml;
    if (/<Tasks>[\s\S]*?<\/Tasks>/.test(next)) next = next.replace(/\s*(<Tasks>)/, `${calendarXml}\n  $1`);
    else next = next.replace(/\s*<\/Project>\s*$/, `${calendarXml}\n</Project>`);
    next = setProjectCalendarUid(next, 1);
    next = addTaskCalendarUids(next, 1);
    return { xml: next, changed: next !== xml };
  }

  function setProjectCalendarUid(xml, uid) {
    if (/<CalendarUID>[\s\S]*?<\/CalendarUID>/.test(xml)) {
      return xml.replace(/<CalendarUID>[\s\S]*?<\/CalendarUID>/, `<CalendarUID>${uid}</CalendarUID>`);
    }
    return xml.replace(/(<Project[^>]*>)/, `$1\n  <CalendarUID>${uid}</CalendarUID>`);
  }

  function addTaskCalendarUids(xml, uid) {
    return xml.replace(/<Task>([\s\S]*?)<\/Task>/g, (full, body) => {
      if (/<CalendarUID>[\s\S]*?<\/CalendarUID>/.test(body)) return full;
      if (/<Name>[\s\S]*?<\/Name>/.test(body)) return `<Task>${body.replace(/(<Name>[\s\S]*?<\/Name>)/, `$1\n      <CalendarUID>${uid}</CalendarUID>`)}\n    </Task>`;
      return `<Task>${body}\n      <CalendarUID>${uid}</CalendarUID>\n    </Task>`;
    });
  }

  function renderCalendar(calendar) {
    const is24 = calendar.kind === "twentyFourHour";
    const days = calendar.kind === "sevenDay" || is24
      ? [1, 2, 3, 4, 5, 6, 7]
      : calendar.kind === "sixDay"
        ? [2, 3, 4, 5, 6, 7]
        : [2, 3, 4, 5, 6];
    const nonWorking = [1, 2, 3, 4, 5, 6, 7].filter((day) => !days.includes(day));
    const weekDays = [
      ...nonWorking.map((day) => renderWeekDay(day, false, is24)),
      ...days.map((day) => renderWeekDay(day, true, is24)),
    ].join("");
    return `\n    <Calendar>\n      <UID>${calendar.uid}</UID>\n      <Name>${escapeXml(calendar.name)}</Name>\n      <IsBaseCalendar>1</IsBaseCalendar>\n      <BaseCalendarUID>${calendar.baseCalendarUid || 0}</BaseCalendarUID>\n      <WeekDays>${weekDays}\n      </WeekDays>\n    </Calendar>`;
  }

  function renderWeekDay(dayType, working, is24) {
    if (!working) return `\n        <WeekDay>\n          <DayType>${dayType}</DayType>\n          <DayWorking>0</DayWorking>\n        </WeekDay>`;
    if (is24) {
      return `\n        <WeekDay>\n          <DayType>${dayType}</DayType>\n          <DayWorking>1</DayWorking>\n          <WorkingTimes>\n            <WorkingTime><FromTime>00:00:00</FromTime><ToTime>23:59:00</ToTime></WorkingTime>\n          </WorkingTimes>\n        </WeekDay>`;
    }
    return `\n        <WeekDay>\n          <DayType>${dayType}</DayType>\n          <DayWorking>1</DayWorking>\n          <WorkingTimes>\n            <WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>\n            <WorkingTime><FromTime>13:00:00</FromTime><ToTime>17:00:00</ToTime></WorkingTime>\n          </WorkingTimes>\n        </WeekDay>`;
  }

  function getEntry(cfb, suffix) {
    const needle = String(suffix || "").toLowerCase();
    return cfb.entries.find((entry) => entry.type === 2 && String(entry.path || "").toLowerCase().endsWith(needle)) || null;
  }

  function readLengthPrefixedValue(bytes, offset) {
    if (!bytes || offset == null || offset < 0 || offset + 4 > bytes.length) return "";
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const len = readUInt32(view, offset);
    if (!Number.isFinite(len) || len < 0 || len > bytes.length - offset - 4 || len > 1024 * 1024) return "";
    const raw = bytes.slice(offset + 4, offset + 4 + len);
    if (!raw.length) return "";
    if (raw.length % 2 === 0 && looksUtf16(raw)) return decoderUtf16.decode(raw).replace(/\0+$/g, "").trim();
    if (looksAnsi(raw)) return decoderUtf8.decode(raw).replace(/\0+$/g, "").trim();
    return "";
  }

  function looksUtf16(bytes) {
    if (bytes.length < 4 || bytes.length % 2 !== 0) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let good = 0;
    let total = 0;
    for (let i = 0; i + 2 <= bytes.length; i += 2) {
      const code = readUInt16(view, i);
      total += 1;
      if (code && (code >= 32 || code === 9 || code === 10 || code === 13)) good += 1;
    }
    return total > 0 && good / total >= 0.7;
  }

  function looksAnsi(bytes) {
    if (bytes.length < 2) return false;
    let good = 0;
    for (const byte of bytes) if (byte && ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13)) good += 1;
    return good / bytes.length >= 0.85;
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
})();
