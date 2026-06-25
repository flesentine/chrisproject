/* Native MPP calendar polish.
   Loads after mpp-native-reader-import-polish.js and injects recoverable calendars
   from TBkndCal streams into generated MSPDI XML. */
(() => {
  "use strict";
  const reader = window.NativeMppReader;
  if (!reader || window.__nativeMppCalendarPolishLoaded) return;
  window.__nativeMppCalendarPolishLoaded = true;

  const VERSION = "0.2.0-native-week-rules";
  const NAME_FIELD_IDS = [0x0d40001a, 0x0d400008, 0x0d400001];
  const RULE_FIELD_ID = 0x0d400001;
  const DAY_BLOCK_SIZE = 60;
  const WEEK_BLOCK_SIZE = DAY_BLOCK_SIZE * 7;
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
        source: "native-TBkndCal-rule-blob",
        explicitWeekRuleCalendars: calendars.filter((calendar) => calendar.hasNativeWeekRules).length,
        exceptionNameCalendars: calendars.filter((calendar) => calendar.exceptionNames?.length).length,
        note: "Weekly work patterns are decoded from native calendar blobs. Exception names are detected, but exception dates are not decoded yet.",
      };
      result.importPolish = { ...(result.importPolish || {}), calendars: calendars.length, calendarPolishVersion: VERSION };
      result.nativeTable = result.nativeTable || {};
      result.nativeTable.calendarCount = calendars.length;
      result.nativeTable.calendarStrategy = "native-calendar-rule-blob";
      result.nativeTable.fieldCoverage = {
        ...(result.nativeTable.fieldCoverage || {}),
        calendars: calendars.length,
        calendarWeekRules: calendars.filter((calendar) => calendar.hasNativeWeekRules).length,
        calendarExceptionNameSets: calendars.filter((calendar) => calendar.exceptionNames?.length).length,
      };
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP calendar polish ${VERSION}: decoded ${calendars.length} calendar${calendars.length === 1 ? "" : "s"}; ${calendars.filter((calendar) => calendar.hasNativeWeekRules).length} had explicit native weekly rule blocks. Exception dates are not decoded yet.`);
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
      if (!fieldId || valueOffset >= data.length) continue;
      const raw = readLengthPrefixedRaw(data, valueOffset);
      const text = readRawValueText(raw);
      const row = rows.get(rowId) || { rowId, names: [], ruleBlob: null, exceptionNames: [] };
      if (NAME_FIELD_IDS.includes(fieldId)) {
        const name = normalizeCalendarName(text);
        if (name) row.names.push(name);
      }
      if (fieldId === RULE_FIELD_ID && raw && raw.length >= WEEK_BLOCK_SIZE) {
        const decoded = decodeNativeRuleBlob(raw);
        if (decoded.hasNativeWeekRules || decoded.exceptionNames.length) {
          row.ruleBlob = decoded;
          row.exceptionNames = decoded.exceptionNames;
        }
      }
      rows.set(rowId, row);
    }

    const standard = {
      uid: 1,
      id: 1,
      name: "Standard",
      baseCalendarUid: 0,
      week: standardWeek(),
      hasNativeWeekRules: true,
      exceptionNames: [],
    };
    const out = [standard];
    const seen = new Set(["standard"]);

    [...rows.values()].sort((a, b) => a.rowId - b.rowId).forEach((row) => {
      const name = chooseCalendarName(row.names);
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const rules = row.ruleBlob || { week: standardWeek(), hasNativeWeekRules: false, exceptionNames: [] };
      out.push({
        uid: out.length + 1,
        id: out.length + 1,
        name,
        baseCalendarUid: 1,
        nativeRowId: row.rowId,
        week: rules.week,
        hasNativeWeekRules: rules.hasNativeWeekRules,
        exceptionNames: rules.exceptionNames || [],
      });
    });
    return out;
  }

  function decodeNativeRuleBlob(raw) {
    const week = standardWeek();
    let explicit = 0;
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const offset = dayIndex * DAY_BLOCK_SIZE;
      if (offset + DAY_BLOCK_SIZE > raw.length) break;
      const decoded = decodeDayBlock(raw.slice(offset, offset + DAY_BLOCK_SIZE));
      if (!decoded) continue;
      week[dayIndex] = decoded;
      explicit += 1;
    }
    return {
      week,
      hasNativeWeekRules: explicit > 0,
      exceptionNames: extractExceptionNames(raw),
    };
  }

  function decodeDayBlock(block) {
    if (!block || block.length < DAY_BLOCK_SIZE) return null;
    const words = [];
    const view = new DataView(block.buffer, block.byteOffset, block.byteLength);
    for (let offset = 0; offset + 2 <= block.length; offset += 2) words.push(readUInt16(view, offset));

    // Native day block markers seen in real MPPs:
    // [1, 0, ...zeros] means inherit/default day, so do not override.
    if (words[0] === 1 && words.slice(1).every((word) => word === 0)) return null;

    // [0, 0, ...] is an explicit non-working day.
    if (words[0] === 0 && words[1] === 0 && words.slice(2).every((word) => word === 0)) return [];

    // [0, 1, 14400, ...] is a full 24-hour day. Values are tenths of minutes.
    if (words[0] === 0 && words[1] === 1 && words[2] >= 14390) return [{ from: "00:00:00", to: "23:59:00" }];

    // [0, 1, start, duration, ...] is one continuous working window.
    if (words[0] === 0 && words[1] === 1 && isTimeTick(words[2]) && isDurationTick(words[4])) {
      return [makeWindow(words[2], words[2] + words[4])].filter(Boolean);
    }

    // [0, 2, start1, start2, duration1, duration2, ...] is the common two-window Project day.
    // Example: 08:00-12:00 and 13:00-17:00 stores start1=4800, start2=7800,
    // duration1=2400, duration2=2400 in tenths of minutes.
    if (words[0] === 0 && words[1] === 2 && isTimeTick(words[2]) && isTimeTick(words[5])) {
      const firstDuration = isDurationTick(words[10]) ? words[10] : 2400;
      const secondDuration = isDurationTick(words[20]) ? words[20] : 2400;
      return [makeWindow(words[2], words[2] + firstDuration), makeWindow(words[5], words[5] + secondDuration)].filter(Boolean);
    }

    return null;
  }

  function makeWindow(fromTicks, toTicks) {
    const from = ticksToTime(fromTicks);
    const to = ticksToTime(toTicks);
    if (!from || !to || from === to) return null;
    return { from, to };
  }

  function ticksToTime(ticks) {
    const n = Number(ticks);
    if (!Number.isFinite(n) || n < 0) return "";
    const minutes = Math.max(0, Math.min(1439, Math.round(n / 10)));
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  }

  function isTimeTick(value) {
    return Number.isFinite(Number(value)) && value >= 0 && value <= 14400;
  }

  function isDurationTick(value) {
    return Number.isFinite(Number(value)) && value > 0 && value <= 14400;
  }

  function standardWeek() {
    return [
      [],
      standardDay(),
      standardDay(),
      standardDay(),
      standardDay(),
      standardDay(),
      [],
    ];
  }

  function standardDay() {
    return [
      { from: "08:00:00", to: "12:00:00" },
      { from: "13:00:00", to: "17:00:00" },
    ];
  }

  function extractExceptionNames(raw) {
    const names = [];
    const seen = new Set();
    const strings = extractUtf16Strings(raw).filter((value) => isExceptionName(value));
    strings.forEach((name) => {
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      names.push(name);
    });
    return names;
  }

  function extractUtf16Strings(raw) {
    const out = [];
    let chars = [];
    const flush = () => {
      if (chars.length >= 4) out.push(chars.join("").trim());
      chars = [];
    };
    const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    for (let offset = 0; offset + 2 <= raw.length; offset += 2) {
      const code = readUInt16(view, offset);
      if (code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0x007e) || (code >= 0x00a0 && code <= 0xffff)) chars.push(String.fromCharCode(code));
      else flush();
    }
    flush();
    return out.map(clean).filter(Boolean);
  }

  function isExceptionName(value) {
    const text = clean(value);
    if (text.length < 4 || text.length > 80) return false;
    if (!/[A-Za-z\p{L}]/u.test(text)) return false;
    if (/^(eCalendar|EditDays|Start|EndDate|Week|Working|From\d|To\d|Default|Record)$/i.test(text)) return false;
    if (/^[\W_]+$/u.test(text)) return false;
    return true;
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
    if (/<CalendarUID>[\s\S]*?<\/CalendarUID>/.test(xml)) return xml.replace(/<CalendarUID>[\s\S]*?<\/CalendarUID>/, `<CalendarUID>${uid}</CalendarUID>`);
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
    const weekDays = calendar.week.map((workingTimes, dayIndex) => renderWeekDay(dayIndex + 1, workingTimes)).join("");
    const note = calendar.exceptionNames?.length ? `\n      <Notes>${escapeXml(`Native MPP exception names detected, dates not decoded yet: ${calendar.exceptionNames.slice(0, 20).join(", ")}${calendar.exceptionNames.length > 20 ? ", …" : ""}`)}</Notes>` : "";
    return `\n    <Calendar>\n      <UID>${calendar.uid}</UID>\n      <Name>${escapeXml(calendar.name)}</Name>\n      <IsBaseCalendar>1</IsBaseCalendar>\n      <BaseCalendarUID>${calendar.baseCalendarUid || 0}</BaseCalendarUID>${note}\n      <WeekDays>${weekDays}\n      </WeekDays>\n    </Calendar>`;
  }

  function renderWeekDay(dayType, workingTimes) {
    if (!workingTimes?.length) return `\n        <WeekDay>\n          <DayType>${dayType}</DayType>\n          <DayWorking>0</DayWorking>\n        </WeekDay>`;
    return `\n        <WeekDay>\n          <DayType>${dayType}</DayType>\n          <DayWorking>1</DayWorking>\n          <WorkingTimes>${workingTimes.map((window) => `\n            <WorkingTime><FromTime>${window.from}</FromTime><ToTime>${window.to}</ToTime></WorkingTime>`).join("")}\n          </WorkingTimes>\n        </WeekDay>`;
  }

  function getEntry(cfb, suffix) {
    const needle = String(suffix || "").toLowerCase();
    return cfb.entries.find((entry) => entry.type === 2 && String(entry.path || "").toLowerCase().endsWith(needle)) || null;
  }

  function readLengthPrefixedRaw(bytes, offset) {
    if (!bytes || offset == null || offset < 0 || offset + 4 > bytes.length) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const len = readUInt32(view, offset);
    if (!Number.isFinite(len) || len < 0 || len > bytes.length - offset - 4 || len > 1024 * 1024) return null;
    return bytes.slice(offset + 4, offset + 4 + len);
  }

  function readRawValueText(raw) {
    if (!raw?.length) return "";
    if (raw.length % 2 === 0 && looksUtf16(raw)) return decoderUtf16.decode(raw).replace(/\0+$/g, "").trim();
    if (looksAnsi(raw)) return decoderUtf8.decode(raw).replace(/\0+$/g, "").trim();
    if (raw.length === 4) {
      const value = new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getInt32(0, true);
      if (value !== 0 && value !== -1) return String(value);
    }
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
