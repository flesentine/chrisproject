/* Native MPP custom fields polish.
   Injects recoverable task custom/display fields as MSPDI ExtendedAttribute nodes
   and patches the app XML importer so those fields populate the existing custom-fields UI. */
(() => {
  "use strict";
  const reader = window.NativeMppReader;
  if (!reader || window.__nativeMppCustomFieldsPolishLoaded) return;
  window.__nativeMppCustomFieldsPolishLoaded = true;

  const VERSION = "0.1.0-custom-fields";
  const decoderUtf8 = new TextDecoder("utf-8", { fatal: false });
  const decoderUtf16 = new TextDecoder("utf-16le", { fatal: false });
  const CORE_FIELD_IDS = new Set([
    0x0b408045, 0x0b408046, 0x0b408048, 0x0b408049, 0x0b40804a, 0x0b40804b,
    0x0b40804c, 0x0b408052, 0x0b408053,
  ]);
  const CUSTOM_DISPLAY_FIELD_IDS = new Set([
    0x0b408044, 0x0b40804d, 0x0b40804e, 0x0b40804f, 0x0b408054,
    0x0b408058, 0x0b40805a, 0x0b40805d,
  ]);
  const LIMITS = { text: 30, number: 20, date: 10, flag: 20, cost: 10, duration: 10 };

  const baseRead = reader.read?.bind(reader);
  const baseReadBuffer = reader.readBuffer?.bind(reader);
  const baseReadBufferAsync = reader.readBufferAsync?.bind(reader);

  if (baseReadBuffer) {
    reader.readBuffer = function customFieldsReadBuffer(buffer, fileName = "project.mpp", options = {}) {
      return polishCustomFieldsResult(buffer, baseReadBuffer(buffer, fileName, options));
    };
  }

  if (baseReadBufferAsync) {
    reader.readBufferAsync = async function customFieldsReadBufferAsync(buffer, fileName = "project.mpp") {
      return polishCustomFieldsResult(buffer, await baseReadBufferAsync(buffer, fileName));
    };
  }

  if (baseRead) {
    reader.read = async function customFieldsRead(file) {
      const buffer = await file.arrayBuffer();
      if (reader.readBufferAsync) return reader.readBufferAsync(buffer, file.name || "project.mpp");
      return polishCustomFieldsResult(buffer, await baseRead(file));
    };
  }

  reader.customFieldsPolishVersion = VERSION;

  function polishCustomFieldsResult(buffer, result) {
    if (!result?.projectXml || !result?.project?.tasks?.length || !reader.CompoundFileBinary) return result;
    try {
      const cfb = new reader.CompoundFileBinary(buffer);
      const decoded = decodeTaskCustomFields(cfb, result.project.tasks);
      if (!decoded.fields.length || !decoded.values.size) return result;
      const hit = injectExtendedAttributes(result.projectXml, decoded);
      if (!hit.changed) return result;
      result.projectXml = hit.xml;
      result.importCustomFields = {
        version: VERSION,
        fieldCount: decoded.fields.length,
        valueCount: hit.valueCount,
        fields: decoded.fields.map((field) => ({ key: field.key, name: field.name, nativeFieldId: toHex(field.nativeFieldId) })),
        source: "native-TBkndTask-var-fields",
        note: "Displayed native custom/display values are preserved. Formula definitions are not evaluated.",
      };
      result.importPolish = { ...(result.importPolish || {}), customFields: decoded.fields.length, customFieldValues: hit.valueCount, customFieldsPolishVersion: VERSION };
      result.nativeTable = result.nativeTable || {};
      result.nativeTable.fieldCoverage = { ...(result.nativeTable.fieldCoverage || {}), customFields: decoded.fields.length, customFieldValues: hit.valueCount };
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP custom fields polish ${VERSION}: decoded ${decoded.fields.length} custom/display field${decoded.fields.length === 1 ? "" : "s"} and ${hit.valueCount} task value${hit.valueCount === 1 ? "" : "s"}. Formula definitions are preserved as displayed values only.`);
      return result;
    } catch (error) {
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP custom fields polish failed: ${error.message || error}`);
      return result;
    }
  }

  function decodeTaskCustomFields(cfb, projectTasks) {
    const metaEntry = getEntry(cfb, "TBkndTask/VarMeta");
    const dataEntry = getEntry(cfb, "TBkndTask/Var2Data");
    if (!metaEntry || !dataEntry) return { fields: [], values: new Map() };
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    const view = new DataView(meta.buffer, meta.byteOffset, meta.byteLength);
    const rowToTask = new Map(projectTasks.map((task) => [Number(task.rowId), Number(task.id)]).filter(([row]) => Number.isFinite(row)));
    const rows = new Map();
    const fieldValues = new Map();

    for (let offset = 0x20; offset + 12 <= meta.length; offset += 12) {
      const fieldId = readUInt32(view, offset);
      const rowId = readUInt32(view, offset + 4);
      const valueOffset = readUInt32(view, offset + 8);
      const taskId = rowToTask.get(rowId);
      if (!taskId || !isCandidateField(fieldId) || valueOffset >= data.length) continue;
      const value = clean(readLengthPrefixedValue(data, valueOffset));
      if (!isMeaningfulValue(value)) continue;
      const row = rows.get(taskId) || new Map();
      row.set(fieldId, value);
      rows.set(taskId, row);
      const list = fieldValues.get(fieldId) || [];
      list.push(value);
      fieldValues.set(fieldId, list);
    }

    const fields = assignFieldSlots(fieldValues);
    const fieldByNative = new Map(fields.map((field) => [field.nativeFieldId, field]));
    const values = new Map();
    rows.forEach((row, taskId) => {
      const attrs = [];
      row.forEach((value, nativeFieldId) => {
        const field = fieldByNative.get(nativeFieldId);
        if (!field) return;
        attrs.push({ ...field, value });
      });
      if (attrs.length) values.set(taskId, attrs);
    });
    return { fields, values };
  }

  function isCandidateField(fieldId) {
    if (!fieldId || CORE_FIELD_IDS.has(fieldId)) return false;
    if (fieldId >= 0x0b608000 && fieldId <= 0x0b608fff) return true;
    if (CUSTOM_DISPLAY_FIELD_IDS.has(fieldId)) return true;
    return false;
  }

  function isMeaningfulValue(value) {
    const text = clean(value);
    if (!text) return false;
    if (/�|[\u0000-\u001f\u007f]/.test(text)) return false;
    if (/^[\ue000-\uf8ff\uac00-\ud7af\u4e00-\u9fff]{2,}/u.test(text)) return false;
    if (/^(?:0(?:\.0+)?|1(?:\.0+)?)$/.test(text)) return false;
    if (/^\d\.\d+e[-+]\d+$/i.test(text)) return false;
    return text.length <= 240;
  }

  function assignFieldSlots(fieldValues) {
    const counters = { text: 0, number: 0, date: 0, flag: 0, cost: 0, duration: 0 };
    const out = [];
    [...fieldValues.entries()]
      .map(([nativeFieldId, values]) => ({ nativeFieldId, values: [...new Set(values)], count: values.length }))
      .filter((item) => item.values.some(isMeaningfulValue))
      .sort((a, b) => b.count - a.count || a.nativeFieldId - b.nativeFieldId)
      .forEach((item) => {
        const type = classifyValues(item.values);
        if (counters[type] >= LIMITS[type]) return;
        counters[type] += 1;
        const key = `${type}${counters[type]}`;
        out.push({
          nativeFieldId: item.nativeFieldId,
          type,
          key,
          fieldName: `${titleType(type)}${counters[type]}`,
          fieldId: 910000000 + out.length + 1,
          name: `Native ${toHex(item.nativeFieldId)}`,
        });
      });
    return out;
  }

  function classifyValues(values) {
    const useful = values.map(clean).filter(isMeaningfulValue);
    if (useful.length && useful.every((value) => parseDateText(value))) return "date";
    if (useful.length && useful.every(isDurationText)) return "duration";
    if (useful.length && useful.every((value) => /^(yes|no|true|false)$/i.test(value))) return "flag";
    if (useful.length && useful.every((value) => /^-?\d+(?:\.\d+)?$/.test(value))) return "number";
    return "text";
  }

  function injectExtendedAttributes(xml, decoded) {
    const defsXml = decoded.fields.map(renderDefinition).join("");
    let next = xml;
    if (defsXml) {
      if (/<ExtendedAttributes>[\s\S]*?<\/ExtendedAttributes>/.test(next)) next = next.replace(/<ExtendedAttributes>([\s\S]*?)<\/ExtendedAttributes>/, `<ExtendedAttributes>$1${defsXml}\n  </ExtendedAttributes>`);
      else if (/<Calendars>[\s\S]*?<\/Calendars>/.test(next)) next = next.replace(/\s*(<Calendars>)/, `\n  <ExtendedAttributes>${defsXml}\n  </ExtendedAttributes>\n  $1`);
      else next = next.replace(/\s*(<Tasks>)/, `\n  <ExtendedAttributes>${defsXml}\n  </ExtendedAttributes>\n  $1`);
    }
    let valueCount = 0;
    next = next.replace(/<Task>([\s\S]*?)<\/Task>/g, (full, body) => {
      const id = Number(childText(body, "ID"));
      const attrs = decoded.values.get(id);
      if (!attrs?.length) return full;
      const attrXml = attrs.map((attr) => {
        valueCount += 1;
        return renderTaskAttribute(attr);
      }).join("");
      const insertBefore = /\s*<PredecessorLink>/.exec(body);
      const nextBody = insertBefore ? `${body.slice(0, insertBefore.index)}${attrXml}${body.slice(insertBefore.index)}` : `${body}${attrXml}`;
      return `<Task>${nextBody}\n    </Task>`;
    });
    return { xml: next, changed: next !== xml, valueCount };
  }

  function renderDefinition(field) {
    return `\n    <ExtendedAttribute>\n      <FieldID>${field.fieldId}</FieldID>\n      <FieldName>${field.fieldName}</FieldName>\n      <Alias>${escapeXml(field.name)}</Alias>\n      <UserDef>1</UserDef>\n    </ExtendedAttribute>`;
  }

  function renderTaskAttribute(attr) {
    return `\n      <ExtendedAttribute>\n        <FieldID>${attr.fieldId}</FieldID>\n        <FieldName>${attr.fieldName}</FieldName>\n        <Value>${escapeXml(formatValue(attr.type, attr.value))}</Value>\n      </ExtendedAttribute>`;
  }

  function formatValue(type, value) {
    const text = clean(value);
    if (type === "date") return parseDateText(text) || text;
    if (type === "flag") return /^(yes|true)$/i.test(text) ? "1" : "0";
    return text;
  }

  function titleType(type) {
    return type.charAt(0).toUpperCase() + type.slice(1);
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

  function isDurationText(value) {
    return /^-?\d+(?:\.\d+)?\s*(?:d|day|days|w|wk|wks|week|weeks|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b/i.test(clean(value)) || /^\(.*\d+\s*d.*\)$/i.test(clean(value));
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

  function toHex(value) {
    return `0x${Number(value).toString(16).padStart(8, "0").toUpperCase()}`;
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

(() => {
  "use strict";
  if (window.__projectXmlCustomFieldImporterLoaded) return;
  window.__projectXmlCustomFieldImporterLoaded = true;
  let tries = 0;
  function boot() {
    if (typeof importProjectXml !== "function" || typeof state === "undefined") {
      if (++tries < 200) setTimeout(boot, 75);
      return;
    }
    if (importProjectXml.__customFieldImportPatched) return;
    const baseImportProjectXml = importProjectXml;
    importProjectXml = function customFieldImportProjectXml(text) {
      const decoded = decodeExtendedAttributes(text);
      const result = baseImportProjectXml.call(this, text);
      if (decoded.keys.length) applyImportedCustomFields(decoded);
      return result;
    };
    importProjectXml.__customFieldImportPatched = true;
  }
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, { once: true }) : boot();

  function decodeExtendedAttributes(text) {
    const xml = new DOMParser().parseFromString(String(text || ""), "application/xml");
    const project = [...xml.children].find((node) => node.localName === "Project") || xml.documentElement;
    const defs = new Map();
    [...project.children].filter((node) => node.localName === "ExtendedAttributes").forEach((container) => {
      [...container.children].filter((node) => node.localName === "ExtendedAttribute").forEach((node) => {
        const fieldName = child(node, "FieldName");
        const key = fieldNameToKey(fieldName);
        if (!key) return;
        const fieldId = child(node, "FieldID");
        defs.set(fieldId || fieldName, { key, alias: child(node, "Alias") || fieldName });
      });
    });
    const byUid = new Map();
    const byId = new Map();
    const keys = new Set();
    [...xml.getElementsByTagName("Task")].forEach((taskNode) => {
      const uid = Number(child(taskNode, "UID"));
      const id = Number(child(taskNode, "ID"));
      const values = {};
      [...taskNode.children].filter((node) => node.localName === "ExtendedAttribute").forEach((node) => {
        const fieldName = child(node, "FieldName");
        const fieldId = child(node, "FieldID");
        const def = defs.get(fieldId) || defs.get(fieldName) || { key: fieldNameToKey(fieldName), alias: fieldName };
        if (!def.key) return;
        const value = child(node, "Value");
        if (value === "") return;
        values[def.key] = normalizeImportedValue(def.key, value);
        keys.add(def.key);
        if (def.alias && !defs.has(def.key)) defs.set(def.key, { key: def.key, alias: def.alias });
      });
      if (Object.keys(values).length) {
        if (uid) byUid.set(uid, values);
        if (id) byId.set(id, values);
      }
    });
    const aliases = {};
    keys.forEach((key) => {
      const alias = defs.get(key)?.alias;
      if (alias && !new RegExp(`^${key}$`, "i").test(alias)) aliases[key] = alias;
    });
    return { byUid, byId, aliases, keys: [...keys] };
  }

  function applyImportedCustomFields(decoded) {
    state.customFieldNames = state.customFieldNames && typeof state.customFieldNames === "object" ? state.customFieldNames : {};
    Object.assign(state.customFieldNames, decoded.aliases || {});
    state.visibleCustomFields = Array.isArray(state.visibleCustomFields) ? state.visibleCustomFields : [];
    const visible = new Set(state.visibleCustomFields);
    decoded.keys.forEach((key) => visible.add(key));
    state.visibleCustomFields = [...visible];
    state.customFieldsInitialized = true;
    (state.tasks || []).forEach((task) => {
      const values = decoded.byUid.get(Number(task.uid)) || decoded.byId.get(Number(task.id));
      if (!values) return;
      task.customFields = task.customFields && typeof task.customFields === "object" ? task.customFields : {};
      Object.assign(task.customFields, values);
    });
    if (typeof render === "function") render();
  }

  function fieldNameToKey(name) {
    const match = /^(Text|Number|Date|Flag|Cost|Duration)\s*(\d{1,2})$/i.exec(String(name || "").trim());
    if (!match) return "";
    const type = match[1].toLowerCase();
    const n = Number(match[2]);
    const limits = { text: 30, number: 20, date: 10, flag: 20, cost: 10, duration: 10 };
    return n >= 1 && n <= limits[type] ? `${type}${n}` : "";
  }

  function normalizeImportedValue(key, value) {
    const text = String(value ?? "").trim();
    if (key.startsWith("flag")) return /^(1|yes|true)$/i.test(text);
    if (key.startsWith("number") || key.startsWith("cost")) {
      const n = Number(text.replace(/[^0-9.-]+/g, ""));
      return Number.isFinite(n) ? n : "";
    }
    if (key.startsWith("date")) return normalizeDate(text);
    if (key.startsWith("duration") && typeof parseDurationInput === "function") return parseDurationInput(text, 0);
    return text;
  }

  function normalizeDate(value) {
    const text = String(value || "").trim();
    let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
    match = /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)?\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i.exec(text);
    if (!match) return "";
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return `${year}-${String(match[1]).padStart(2, "0")}-${String(match[2]).padStart(2, "0")}`;
  }

  function child(node, localName) {
    const found = [...node.children].find((childNode) => childNode.localName === localName);
    return found ? found.textContent.trim() : "";
  }
})();
