(() => {
  const VERSION = "v0.41.0";
  const GROUPS = { text: ["Text", 30], number: ["Number", 20], date: ["Date", 10], flag: ["Flag", 20], cost: ["Cost", 10], duration: ["Duration", 10] };
  let tries = 0;

  function ready() {
    return typeof state !== "undefined" && typeof importProjectXml === "function" && typeof buildProjectXml === "function" && typeof render === "function";
  }

  function boot() {
    if (window.__customFieldMetadataLoaded) return;
    if (!ready()) {
      if (++tries < 180) setTimeout(boot, 75);
      return;
    }
    window.__customFieldMetadataLoaded = true;
    patchRuntime();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, { once: true }) : boot();

  function patchRuntime() {
    const baseImport = importProjectXml;
    importProjectXml = function customFieldMetadataImport(text, ...args) {
      const parsed = parseCustomMetadata(text);
      const result = baseImport.call(this, text, ...args);
      applyImportedMetadata(parsed);
      return result;
    };
    window.importProjectXml = importProjectXml;

    const baseBuild = buildProjectXml;
    buildProjectXml = function customFieldMetadataExport(...args) {
      const xml = baseBuild.apply(this, args);
      return injectCustomMetadata(xml);
    };
    window.buildProjectXml = buildProjectXml;
  }

  function parseCustomMetadata(text) {
    const out = { defsByFieldId: new Map(), defsByKey: new Map(), valuesByUid: new Map(), visible: new Set(), names: {}, indicators: {} };
    try {
      const xml = new DOMParser().parseFromString(String(text || ""), "application/xml");
      const parserError = xml.getElementsByTagName("parsererror")[0];
      if (parserError) return out;

      [...xml.getElementsByTagName("Project")][0]?.querySelectorAll?.(":scope > ExtendedAttributes > ExtendedAttribute");
      const project = [...xml.children].find((node) => node.localName === "Project") || xml.documentElement;
      const top = [...project.children].find((node) => node.localName === "ExtendedAttributes");
      [...(top?.children || [])].filter((node) => node.localName === "ExtendedAttribute").forEach((node) => {
        const def = parseDefinition(node);
        if (!def.key) return;
        out.defsByKey.set(def.key, def);
        if (def.fieldID) out.defsByFieldId.set(def.fieldID, def);
        if (def.alias && def.alias !== def.fieldName) out.names[def.key] = def.alias;
        out.visible.add(def.key);
        if (def.indicatorHints?.length) out.indicators[def.key] = def.indicatorHints;
      });

      [...xml.getElementsByTagName("Task")].forEach((taskNode) => {
        const uid = Number(childText(taskNode, "UID"));
        const id = Number(childText(taskNode, "ID"));
        if (!uid || id === 0) return;
        const values = {};
        [...taskNode.children].filter((node) => node.localName === "ExtendedAttribute").forEach((node) => {
          const fieldID = childText(node, "FieldID");
          const fieldName = childText(node, "FieldName");
          const def = out.defsByFieldId.get(fieldID) || out.defsByKey.get(keyFromFieldName(fieldName));
          const key = def?.key || keyFromFieldName(fieldName);
          if (!key) return;
          values[key] = normalizeImportedValue(key, childText(node, "Value"));
          out.visible.add(key);
        });
        if (Object.keys(values).length) out.valuesByUid.set(uid, values);
      });
    } catch {
      // XML custom metadata is optional. Keep import resilient.
    }
    return out;
  }

  function parseDefinition(node) {
    const fieldName = childText(node, "FieldName");
    const key = keyFromFieldName(fieldName);
    const values = [...node.getElementsByTagName("Value")].map((valueNode) => childText(valueNode, "Value")).filter(Boolean);
    const indicatorHints = [...node.getElementsByTagName("IndicatorHint")].map((hint) => ({
      value: childText(hint, "Value"),
      severity: childText(hint, "Severity") || "neutral",
      color: childText(hint, "Color") || "gray",
      rule: childText(hint, "Rule") || "",
    })).filter((hint) => hint.value);
    return {
      key,
      fieldID: childText(node, "FieldID") || fieldIdForKey(key),
      fieldName,
      alias: childText(node, "Alias") || fieldName,
      formula: childText(node, "Formula"),
      calculationType: childText(node, "CalculationType"),
      valueList: [...new Set(values)],
      indicatorHints,
    };
  }

  function applyImportedMetadata(parsed) {
    if (!parsed) return;
    state.customFieldNames = { ...(state.customFieldNames || {}), ...parsed.names };
    state.customFieldDefinitions = state.customFieldDefinitions && typeof state.customFieldDefinitions === "object" ? state.customFieldDefinitions : {};
    for (const [key, def] of parsed.defsByKey.entries()) state.customFieldDefinitions[key] = stripMapDef(def);
    if (parsed.indicators && Object.keys(parsed.indicators).length) state.customFieldIndicatorHints = { ...(state.customFieldIndicatorHints || {}), ...parsed.indicators };

    (state.tasks || []).forEach((task) => {
      const values = parsed.valuesByUid.get(Number(task.uid));
      if (!values) return;
      task.customFields = { ...(task.customFields || {}), ...values };
    });

    const visible = new Set(Array.isArray(state.visibleCustomFields) ? state.visibleCustomFields : []);
    parsed.visible.forEach((key) => visible.add(key));
    state.visibleCustomFields = [...visible].filter(isKnownKey);
    state.customFieldsInitialized = true;
    render();
  }

  function injectCustomMetadata(xml) {
    const defs = buildDefinitions();
    if (!defs.length) return xml;
    let out = String(xml || "");
    const topXml = `<ExtendedAttributes>${defs.map(defXml).join("")}\n  </ExtendedAttributes>`;
    if (/<ExtendedAttributes>[\s\S]*?<\/ExtendedAttributes>/.test(out)) out = out.replace(/<ExtendedAttributes>[\s\S]*?<\/ExtendedAttributes>/, topXml);
    else out = out.replace(/(\s*<Calendars>)/, `\n  ${topXml}$1`);

    const byUid = new Map((state.tasks || []).map((task) => [Number(task.uid), task]));
    out = out.replace(/<Task>([\s\S]*?)<\/Task>/g, (block, body) => {
      const uid = Number((body.match(/<UID>([^<]+)<\/UID>/) || [])[1]);
      const id = Number((body.match(/<ID>([^<]+)<\/ID>/) || [])[1]);
      const task = byUid.get(uid);
      if (!task || id === 0) return block;
      const taskAttrs = defs.map((def) => taskValueXml(def, task.customFields?.[def.key])).filter(Boolean).join("");
      if (!taskAttrs) return block;
      const cleaned = body.replace(/\n\s*<ExtendedAttribute>[\s\S]*?<\/ExtendedAttribute>/g, "");
      return `<Task>${cleaned}${taskAttrs}\n    </Task>`;
    });
    return out;
  }

  function buildDefinitions() {
    const defs = new Map();
    const saved = state.customFieldDefinitions || {};
    Object.entries(saved).forEach(([key, def]) => { if (isKnownKey(key)) defs.set(key, { ...def, key }); });
    Object.entries(state.customFieldNames || {}).forEach(([key, alias]) => { if (isKnownKey(key)) defs.set(key, { ...(defs.get(key) || {}), key, alias }); });
    (state.tasks || []).forEach((task) => Object.keys(task.customFields || {}).forEach((key) => { if (isKnownKey(key)) defs.set(key, { ...(defs.get(key) || {}), key }); }));
    Object.entries(state.customFieldIndicatorHints || {}).forEach(([key, indicatorHints]) => { if (isKnownKey(key)) defs.set(key, { ...(defs.get(key) || {}), key, indicatorHints }); });
    return [...defs.values()].map((def) => normalizeDef(def)).sort((a, b) => order(a.key) - order(b.key));
  }

  function normalizeDef(def) {
    const fieldName = fieldNameForKey(def.key);
    return {
      key: def.key,
      fieldID: String(def.fieldID || fieldIdForKey(def.key)),
      fieldName,
      alias: String(def.alias || state.customFieldNames?.[def.key] || fieldName).trim(),
      formula: String(def.formula || "").trim(),
      calculationType: String(def.calculationType || "").trim(),
      valueList: Array.isArray(def.valueList) ? def.valueList.filter(Boolean) : [],
      indicatorHints: Array.isArray(def.indicatorHints) ? def.indicatorHints.filter((hint) => hint?.value) : [],
    };
  }

  function defXml(def) {
    const formula = def.formula ? `\n    <Formula>${esc(def.formula)}</Formula>\n    <CalculationType>${esc(def.calculationType || "1")}</CalculationType>` : "";
    const values = def.valueList.length ? `\n    <RestrictValues>0</RestrictValues>\n    <ValuelistSortOrder>0</ValuelistSortOrder>\n    <AppendNewValues>1</AppendNewValues>\n    <ValueList>${def.valueList.map((v, i) => `\n      <Value><ID>${i + 1}</ID><Value>${esc(v)}</Value><Description>${esc(def.alias || def.fieldName)}</Description></Value>`).join("")}\n    </ValueList>` : "";
    const hints = def.indicatorHints.length ? `\n    <IndicatorHints>${def.indicatorHints.map((h, i) => `\n      <IndicatorHint><ID>${i + 1}</ID><Value>${esc(h.value)}</Value><Severity>${esc(h.severity || "neutral")}</Severity><Color>${esc(h.color || "gray")}</Color><Rule>${esc(h.rule || "")}</Rule></IndicatorHint>`).join("")}\n    </IndicatorHints>` : "";
    return `\n    <ExtendedAttribute>\n      <FieldID>${esc(def.fieldID)}</FieldID>\n      <FieldName>${esc(def.fieldName)}</FieldName>\n      <Alias>${esc(def.alias || def.fieldName)}</Alias>\n      <UserDef>1</UserDef>${formula}${values}${hints}\n    </ExtendedAttribute>`;
  }

  function taskValueXml(def, value) {
    if (value === undefined || value === null || value === "" || value === false) return "";
    return `\n      <ExtendedAttribute><FieldID>${esc(def.fieldID)}</FieldID><FieldName>${esc(def.fieldName)}</FieldName><Value>${esc(formatValue(value))}</Value></ExtendedAttribute>`;
  }

  function stripMapDef(def) {
    return { fieldID: def.fieldID, fieldName: def.fieldName, alias: def.alias, formula: def.formula, calculationType: def.calculationType, valueList: def.valueList, indicatorHints: def.indicatorHints };
  }

  function keyFromFieldName(name) {
    const match = /^(Text|Number|Date|Flag|Cost|Duration)(\d+)$/i.exec(String(name || "").trim());
    if (!match) return "";
    return `${match[1].toLowerCase()}${Number(match[2])}`;
  }

  function fieldNameForKey(key) {
    const match = /^(text|number|date|flag|cost|duration)(\d+)$/i.exec(String(key || ""));
    return match ? `${match[1][0].toUpperCase()}${match[1].slice(1).toLowerCase()}${Number(match[2])}` : "";
  }

  function isKnownKey(key) {
    const match = /^(text|number|date|flag|cost|duration)(\d+)$/i.exec(String(key || ""));
    if (!match) return false;
    const group = GROUPS[match[1].toLowerCase()];
    return Boolean(group && Number(match[2]) >= 1 && Number(match[2]) <= group[1]);
  }

  function fieldIdForKey(key) {
    const name = fieldNameForKey(key);
    if (!name) return "";
    return `APP_${name}`;
  }

  function normalizeImportedValue(key, value) {
    const raw = String(value ?? "").trim();
    if (/^flag/i.test(key)) return /^(1|true|yes)$/i.test(raw);
    if (/^(number|cost|duration)/i.test(key)) {
      const n = Number(raw.replace(/[^0-9.-]/g, ""));
      return Number.isFinite(n) ? n : raw;
    }
    if (/^date/i.test(key)) return raw.slice(0, 10);
    return raw;
  }

  function formatValue(value) {
    if (typeof value === "boolean") return value ? "1" : "0";
    return String(value ?? "");
  }

  function order(key) {
    const match = /^(text|number|date|flag|cost|duration)(\d+)$/i.exec(String(key || ""));
    if (!match) return 999999;
    const groupOrder = Object.keys(GROUPS).indexOf(match[1].toLowerCase());
    return groupOrder * 100 + Number(match[2]);
  }

  function childText(node, name) {
    return [...(node?.children || [])].find((child) => child.localName === name)?.textContent?.trim() || "";
  }

  function esc(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  }
})();
