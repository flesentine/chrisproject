/* Native MPP notes + hyperlinks polish.
   Finds obvious task note text and hyperlink-like values in native task var fields
   and injects MSPDI Notes / Hyperlink / HyperlinkAddress tags. */
(() => {
  "use strict";
  const reader = window.NativeMppReader;
  if (!reader || window.__nativeMppNotesHyperlinksPolishLoaded) return;
  window.__nativeMppNotesHyperlinksPolishLoaded = true;

  const VERSION = "0.1.0-notes-hyperlinks";
  const decoderUtf8 = new TextDecoder("utf-8", { fatal: false });
  const decoderUtf16 = new TextDecoder("utf-16le", { fatal: false });
  const TASK_PRED_FIELD_ID = 0x0b408053;
  const DISPLAY_DATE_FIELD_IDS = new Set([0x0b408045, 0x0b40804a, 0x0b40804b, 0x0b40804d, 0x0b40804e]);
  const STATUS_FIELD_IDS = new Set([0x0b408048, 0x0b40804c, 0x0b408054]);
  const IGNORE_FIELD_IDS = new Set([TASK_PRED_FIELD_ID, ...DISPLAY_DATE_FIELD_IDS, ...STATUS_FIELD_IDS]);

  const baseRead = reader.read?.bind(reader);
  const baseReadBuffer = reader.readBuffer?.bind(reader);
  const baseReadBufferAsync = reader.readBufferAsync?.bind(reader);

  if (baseReadBuffer) {
    reader.readBuffer = function notesReadBuffer(buffer, fileName = "project.mpp", options = {}) {
      return polishNotesResult(buffer, baseReadBuffer(buffer, fileName, options));
    };
  }

  if (baseReadBufferAsync) {
    reader.readBufferAsync = async function notesReadBufferAsync(buffer, fileName = "project.mpp") {
      return polishNotesResult(buffer, await baseReadBufferAsync(buffer, fileName));
    };
  }

  if (baseRead) {
    reader.read = async function notesRead(file) {
      const buffer = await file.arrayBuffer();
      if (reader.readBufferAsync) return reader.readBufferAsync(buffer, file.name || "project.mpp");
      return polishNotesResult(buffer, await baseRead(file));
    };
  }

  reader.notesHyperlinksPolishVersion = VERSION;

  function polishNotesResult(buffer, result) {
    if (!result?.projectXml || !result?.project?.tasks?.length || !reader.CompoundFileBinary) return result;
    try {
      const cfb = new reader.CompoundFileBinary(buffer);
      const decoded = decodeTaskNotesAndLinks(cfb, result.project.tasks);
      if (!decoded.size) return result;
      const hit = injectNotesAndLinks(result.projectXml, decoded);
      if (!hit.changed) return result;
      result.projectXml = hit.xml;
      result.importNotesHyperlinks = {
        version: VERSION,
        notesApplied: hit.notesApplied,
        hyperlinksApplied: hit.hyperlinksApplied,
        source: "native-TBkndTask-var-fields",
        note: "Only obvious note text and URL/email hyperlink values are imported. Binary rich-text notes are not decoded yet.",
      };
      result.importPolish = { ...(result.importPolish || {}), notes: hit.notesApplied, hyperlinks: hit.hyperlinksApplied, notesHyperlinksPolishVersion: VERSION };
      result.nativeTable = result.nativeTable || {};
      result.nativeTable.fieldCoverage = { ...(result.nativeTable.fieldCoverage || {}), nativeNotes: hit.notesApplied, nativeHyperlinks: hit.hyperlinksApplied };
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP notes/hyperlinks polish ${VERSION}: decoded ${hit.notesApplied} note${hit.notesApplied === 1 ? "" : "s"} and ${hit.hyperlinksApplied} hyperlink${hit.hyperlinksApplied === 1 ? "" : "s"} from native task text fields.`);
      return result;
    } catch (error) {
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP notes/hyperlinks polish failed: ${error.message || error}`);
      return result;
    }
  }

  function decodeTaskNotesAndLinks(cfb, projectTasks) {
    const metaEntry = getEntry(cfb, "TBkndTask/VarMeta");
    const dataEntry = getEntry(cfb, "TBkndTask/Var2Data");
    if (!metaEntry || !dataEntry) return new Map();
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    const view = new DataView(meta.buffer, meta.byteOffset, meta.byteLength);
    const rowToTask = new Map(projectTasks.map((task) => [Number(task.rowId), Number(task.id)]).filter(([row]) => Number.isFinite(row)));
    const rows = new Map();

    for (let offset = 0x20; offset + 12 <= meta.length; offset += 12) {
      const fieldId = readUInt32(view, offset);
      const rowId = readUInt32(view, offset + 4);
      const valueOffset = readUInt32(view, offset + 8);
      const taskId = rowToTask.get(rowId);
      if (!taskId || !fieldId || valueOffset >= data.length) continue;
      const text = cleanMultiline(readLengthPrefixedValue(data, valueOffset));
      if (!text || !isReadableText(text)) continue;
      const row = rows.get(taskId) || [];
      row.push({ fieldId, text });
      rows.set(taskId, row);
    }

    const decoded = new Map();
    rows.forEach((items, taskId) => {
      const links = extractLinks(items);
      const notes = extractNotes(items, links);
      if (notes.length || links.length) decoded.set(taskId, { notes, links });
    });
    return decoded;
  }

  function extractLinks(items) {
    const out = [];
    const seen = new Set();
    items.forEach((item) => {
      for (const url of findUrls(item.text)) {
        const normalized = normalizeUrl(url);
        if (!normalized || seen.has(normalized.toLowerCase())) continue;
        seen.add(normalized.toLowerCase());
        out.push({ url: normalized, label: linkLabel(item.text, normalized) });
      }
    });
    return out.slice(0, 3);
  }

  function extractNotes(items, links) {
    const linkText = new Set(links.map((link) => link.url.toLowerCase()));
    const out = [];
    const seen = new Set();
    items.forEach((item) => {
      if (IGNORE_FIELD_IDS.has(item.fieldId)) return;
      let text = item.text;
      findUrls(text).forEach((url) => { text = text.replace(url, " "); });
      text = cleanMultiline(text);
      if (!isNoteText(text)) return;
      const key = text.toLowerCase();
      if (seen.has(key) || linkText.has(key)) return;
      seen.add(key);
      out.push(text.length > 1200 ? `${text.slice(0, 1200)}…` : text);
    });
    return out.slice(0, 8);
  }

  function findUrls(text) {
    const raw = String(text || "");
    const urls = [];
    raw.replace(/\bhttps?:\/\/[^\s<>()"']+/gi, (match) => { urls.push(match.replace(/[.,;:!?]+$/g, "")); return match; });
    raw.replace(/\bmailto:[^\s<>()"']+/gi, (match) => { urls.push(match.replace(/[.,;:!?]+$/g, "")); return match; });
    raw.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (match) => { urls.push(`mailto:${match}`); return match; });
    raw.replace(/\b(?:www\.)?[A-Z0-9.-]+\.[A-Z]{2,}(?:\/[A-Z0-9._~:/?#\[\]@!$&'()*+,;=%-]*)?/gi, (match) => {
      if (/^[\d.]+$/.test(match)) return match;
      if (/^(?:mpp|xml|csv|pdf|docx|xlsx)$/i.test(match)) return match;
      urls.push(match.replace(/[.,;:!?]+$/g, ""));
      return match;
    });
    return [...new Set(urls)];
  }

  function normalizeUrl(value) {
    const raw = clean(value);
    if (!raw) return "";
    if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/i.test(raw)) return `mailto:${raw}`;
    if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(raw)) return `https://${raw}`;
    return "";
  }

  function linkLabel(source, url) {
    const text = clean(source).replace(url, "").replace(/^[-–—:|\s]+|[-–—:|\s]+$/g, "");
    if (text && text.length <= 80 && !/^https?:/i.test(text)) return text;
    try {
      const parsed = new URL(url.replace(/^mailto:/i, "mailto:"));
      return /^mailto:/i.test(url) ? url.replace(/^mailto:/i, "Email") : parsed.hostname || "Open hyperlink";
    } catch {
      return "Open hyperlink";
    }
  }

  function isNoteText(text) {
    const value = cleanMultiline(text);
    if (value.length < 18) return false;
    if (/^(?:finished|complete|completed|future|on[-\s]?time(?:\s*\(or early\))?|no deadline|no program date|no program baseline date)$/i.test(value)) return false;
    if (/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\s*\d{1,2}\/\d{1,2}\/\d{2,4}$/i.test(value)) return false;
    if (/^\d+(?:\.\d+)?\s*(?:d|day|days|w|weeks|h|hours)$/i.test(value)) return false;
    if (/^\d+(?:FS|SS|FF|SF)?(?:[+-]\d+[dwhm]?)?(?:[,;]\d+(?:FS|SS|FF|SF)?(?:[+-]\d+[dwhm]?)?)*$/i.test(value.replace(/\s+/g, ""))) return false;
    if (/^Native MPP /i.test(value)) return false;
    return /[A-Za-z\p{L}]/u.test(value) && /[\s.,;:()\-\/]/.test(value);
  }

  function isReadableText(text) {
    const value = cleanMultiline(text);
    if (!value || value.length > 4096) return false;
    if (/�|[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return false;
    const letters = (value.match(/[A-Za-z\p{L}]/gu) || []).length;
    const controls = (value.match(/[\uE000-\uF8FF]/gu) || []).length;
    return letters > 0 && controls < Math.max(3, value.length / 8);
  }

  function injectNotesAndLinks(xml, decoded) {
    let notesApplied = 0;
    let hyperlinksApplied = 0;
    let changed = false;
    const out = xml.replace(/<Task>([\s\S]*?)<\/Task>/g, (full, body) => {
      const id = Number(childText(body, "ID"));
      const detail = decoded.get(id);
      if (!detail) return full;
      let next = body;
      if (detail.notes.length) {
        const before = next;
        next = appendNotes(next, detail.notes.join("\n\n"));
        if (next !== before) notesApplied += 1;
      }
      if (detail.links.length && !/<HyperlinkAddress>[\s\S]*?<\/HyperlinkAddress>/.test(next)) {
        const link = detail.links[0];
        const tags = `\n      <Hyperlink>${escapeXml(link.label || "Open hyperlink")}</Hyperlink>\n      <HyperlinkAddress>${escapeXml(link.url)}</HyperlinkAddress>`;
        if (/\n\s*<Type>/.test(next)) next = next.replace(/\n\s*<Type>/, `${tags}\n      <Type>`);
        else next = `${next}${tags}`;
        hyperlinksApplied += 1;
      }
      if (next !== body) changed = true;
      return next === body ? full : `<Task>${next}\n    </Task>`;
    });
    return { xml: out, changed, notesApplied, hyperlinksApplied };
  }

  function appendNotes(body, text) {
    if (!text) return body;
    const escaped = escapeXml(text);
    if (/<Notes>[\s\S]*?<\/Notes>/.test(body)) {
      return body.replace(/<Notes>([\s\S]*?)<\/Notes>/, (_full, current) => {
        const decodedCurrent = decodeXml(current);
        if (decodedCurrent.includes(text)) return _full;
        return `<Notes>${current}${current ? "&#10;&#10;" : ""}${escaped}</Notes>`;
      });
    }
    if (/<Name>[\s\S]*?<\/Name>/.test(body)) return body.replace(/(<Name>[\s\S]*?<\/Name>)/, `$1\n      <Notes>${escaped}</Notes>`);
    return `${body}\n      <Notes>${escaped}</Notes>`;
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

  function cleanMultiline(value) {
    return String(value || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function escapeXml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  }

  function decodeXml(value) {
    return String(value || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, "\n").replace(/&amp;/g, "&");
  }
})();
