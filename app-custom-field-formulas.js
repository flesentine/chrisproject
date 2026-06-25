(() => {
  const VERSION = "v0.42.0";
  const FIELD_RE = /^(text|number|date|flag|cost|duration)(\d+)$/i;
  let tries = 0;
  let evaluating = false;

  function ready() {
    return typeof state !== "undefined" && typeof render === "function" && typeof buildProjectXml === "function" && typeof importProjectXml === "function";
  }

  function boot() {
    if (window.__customFieldFormulaEngineLoaded) return;
    if (!ready()) {
      if (++tries < 180) setTimeout(boot, 75);
      return;
    }
    window.__customFieldFormulaEngineLoaded = true;
    patchRuntime();
    evaluateAllFormulaFields();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, { once: true }) : boot();

  function patchRuntime() {
    const baseImport = importProjectXml;
    importProjectXml = function formulaImportProjectXml(text, ...args) {
      const result = baseImport.call(this, text, ...args);
      evaluateAllFormulaFields();
      return result;
    };
    window.importProjectXml = importProjectXml;

    const baseBuild = buildProjectXml;
    buildProjectXml = function formulaBuildProjectXml(...args) {
      evaluateAllFormulaFields();
      return baseBuild.apply(this, args);
    };
    window.buildProjectXml = buildProjectXml;

    const baseRender = render;
    render = function formulaRender(...args) {
      if (!evaluating) evaluateAllFormulaFields();
      return baseRender.apply(this, args);
    };
    window.render = render;
  }

  function formulaDefinitions() {
    const defs = state.customFieldDefinitions || {};
    return Object.entries(defs)
      .map(([key, def]) => ({ key, formula: String(def?.formula || "").trim(), def }))
      .filter((item) => isKnownKey(item.key) && item.formula);
  }

  function evaluateAllFormulaFields() {
    if (evaluating) return 0;
    const defs = formulaDefinitions();
    if (!defs.length || !Array.isArray(state.tasks)) return 0;
    evaluating = true;
    let changed = 0;
    try {
      state.tasks.forEach((task, index) => {
        task.customFields = task.customFields && typeof task.customFields === "object" ? task.customFields : {};
        defs.forEach(({ key, formula }) => {
          const next = evaluateFormula(formula, task, index);
          if (next === undefined) return;
          const coerced = coerceForKey(key, next);
          if (String(task.customFields[key] ?? "") !== String(coerced ?? "")) {
            task.customFields[key] = coerced;
            changed += 1;
          }
        });
      });
      state.customFieldFormulaStats = {
        version: VERSION,
        formulas: defs.length,
        tasks: state.tasks.length,
        valuesUpdated: changed,
        lastEvaluatedAt: new Date().toISOString(),
      };
      return changed;
    } finally {
      evaluating = false;
    }
  }

  function evaluateFormula(formula, task, index) {
    const text = normalizeFormula(formula);
    if (!text) return undefined;
    try {
      const iif = /^IIf\((.*)\)$/i.exec(text);
      if (iif) return evalIIf(iif[1], task, index);
      const sw = /^Switch\((.*)\)$/i.exec(text);
      if (sw) return evalSwitch(sw[1], task, index);
      const choose = /^Choose\((.*)\)$/i.exec(text);
      if (choose) return evalChoose(choose[1], task, index);
      const simple = evalExpression(text, task, index);
      return simple;
    } catch {
      return undefined;
    }
  }

  function evalIIf(argsText, task, index) {
    const args = splitArgs(argsText);
    if (args.length < 3) return undefined;
    return truthy(evalExpression(args[0], task, index)) ? evalExpression(args[1], task, index) : evalExpression(args[2], task, index);
  }

  function evalSwitch(argsText, task, index) {
    const args = splitArgs(argsText);
    for (let i = 0; i + 1 < args.length; i += 2) {
      if (truthy(evalExpression(args[i], task, index))) return evalExpression(args[i + 1], task, index);
    }
    return "";
  }

  function evalChoose(argsText, task, index) {
    const args = splitArgs(argsText);
    const pick = Math.round(num(evalExpression(args[0], task, index), 0));
    return pick >= 1 && pick < args.length ? evalExpression(args[pick], task, index) : "";
  }

  function evalExpression(expr, task, index) {
    let s = normalizeFormula(expr);
    if (!s) return "";
    if (isQuoted(s)) return unquote(s);
    s = replaceFunctions(s, task, index);
    s = replaceFieldRefs(s, task, index);
    s = s.replace(/<>/g, "!=").replace(/=([^=])/g, "==$1");
    s = s.replace(/\bAnd\b/gi, "&&").replace(/\bOr\b/gi, "||").replace(/\bNot\b/gi, "!");
    s = s.replace(/\bTrue\b/gi, "true").replace(/\bFalse\b/gi, "false");
    if (!/^[0-9+\-*/%.<>=!&|() \t'"A-Za-z_:,]+$/.test(s)) return undefined;
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${s});`)();
  }

  function replaceFunctions(s, task, index) {
    return s
      .replace(/ProjDateDiff\(([^,]+),([^\)]+)\)/gi, (_, a, b) => String(dateDiffDays(evalExpression(a, task, index), evalExpression(b, task, index))))
      .replace(/DateDiff\([^,]+,([^,]+),([^\)]+)\)/gi, (_, a, b) => String(dateDiffDays(evalExpression(a, task, index), evalExpression(b, task, index))))
      .replace(/ProjDurConv\(([^,]+),[^\)]*\)/gi, (_, a) => String(num(evalExpression(a, task, index), 0)))
      .replace(/Abs\(([^\)]+)\)/gi, (_, a) => String(Math.abs(num(evalExpression(a, task, index), 0))))
      .replace(/Round\(([^,\)]+)(?:,[^\)]*)?\)/gi, (_, a) => String(Math.round(num(evalExpression(a, task, index), 0))))
      .replace(/Int\(([^\)]+)\)/gi, (_, a) => String(Math.trunc(num(evalExpression(a, task, index), 0))))
      .replace(/Len\(([^\)]+)\)/gi, (_, a) => String(String(evalExpression(a, task, index) ?? "").length));
  }

  function replaceFieldRefs(s, task, index) {
    return s.replace(/\[([^\]]+)\]/g, (_, name) => literal(fieldValue(name, task, index)));
  }

  function fieldValue(name, task, index) {
    const raw = String(name || "").trim();
    const compact = raw.replace(/\s+/g, "").toLowerCase();
    const aliasKey = findKeyByAlias(raw);
    if (aliasKey) return task.customFields?.[aliasKey] ?? "";
    if (FIELD_RE.test(compact)) return task.customFields?.[compact] ?? "";
    if (compact === "name") return task.name || "";
    if (compact === "id") return task.id || index + 1;
    if (compact === "uniqueid" || compact === "uid") return task.uid || "";
    if (compact === "start") return task.start || "";
    if (compact === "finish") return task.finish || "";
    if (compact === "duration") return task.durationDays ?? task.durationMinutes ?? 0;
    if (compact === "work") return task.durationMinutes ?? 0;
    if (compact === "percentcomplete" || compact === "%complete") return task.percent ?? 0;
    if (compact === "critical") return Boolean(task.isCritical || task.critical);
    if (compact === "summary") return Boolean(task.isSummary);
    if (compact === "milestone") return Boolean(task.isMilestone);
    if (compact === "baselinefinish") return task.baseline?.finish || "";
    if (compact === "baselinestart") return task.baseline?.start || "";
    if (compact === "deadline") return task.deadline || "";
    if (compact === "startvariance") return daysBetween(task.baseline?.start, task.start);
    if (compact === "finishvariance") return daysBetween(task.baseline?.finish, task.finish);
    return "";
  }

  function findKeyByAlias(name) {
    const wanted = String(name || "").trim().toLowerCase();
    if (!wanted) return "";
    const defs = state.customFieldDefinitions || {};
    for (const [key, def] of Object.entries(defs)) {
      if (String(def?.alias || "").trim().toLowerCase() === wanted) return key;
      if (String(def?.fieldName || "").trim().toLowerCase() === wanted) return key;
    }
    for (const [key, alias] of Object.entries(state.customFieldNames || {})) {
      if (String(alias || "").trim().toLowerCase() === wanted) return key;
    }
    return "";
  }

  function splitArgs(text) {
    const args = [];
    let depth = 0;
    let quote = "";
    let cur = "";
    for (const ch of String(text || "")) {
      if (quote) {
        cur += ch;
        if (ch === quote) quote = "";
        continue;
      }
      if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) {
        args.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    if (cur.trim()) args.push(cur.trim());
    return args;
  }

  function normalizeFormula(value) {
    return String(value || "").replace(/^=/, "").trim();
  }

  function coerceForKey(key, value) {
    if (/^flag/i.test(key)) return truthy(value);
    if (/^(number|cost|duration)/i.test(key)) {
      const n = Number(value);
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : value;
    }
    if (/^date/i.test(key)) return String(value || "").slice(0, 10);
    return value == null ? "" : String(value);
  }

  function literal(value) {
    if (typeof value === "boolean") return value ? "true" : "false";
    if (typeof value === "number") return Number.isFinite(value) ? String(value) : "0";
    const n = Number(String(value).replace(/[^0-9.-]/g, ""));
    if (String(value).trim() && Number.isFinite(n) && /^[-+]?[$]?\d/.test(String(value).trim())) return String(n);
    return JSON.stringify(String(value ?? ""));
  }

  function isQuoted(s) {
    return (s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"));
  }

  function unquote(s) {
    return s.slice(1, -1);
  }

  function truthy(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    return /^(true|yes|1|good|green|on-time|complete|completed)$/i.test(String(value || "").trim());
  }

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function dateDiffDays(a, b) {
    return daysBetween(String(a || "").slice(0, 10), String(b || "").slice(0, 10));
  }

  function daysBetween(a, b) {
    const da = Date.parse(`${a}T00:00:00Z`);
    const db = Date.parse(`${b}T00:00:00Z`);
    if (!Number.isFinite(da) || !Number.isFinite(db)) return 0;
    return Math.round((db - da) / 86400000);
  }

  function isKnownKey(key) {
    const match = FIELD_RE.exec(String(key || ""));
    if (!match) return false;
    const limits = { text: 30, number: 20, date: 10, flag: 20, cost: 10, duration: 10 };
    return Number(match[2]) >= 1 && Number(match[2]) <= limits[match[1].toLowerCase()];
  }

  window.__evaluateCustomFieldFormulas = evaluateAllFormulaFields;
})();

(() => {
  if (window.__customFieldFormulaUiAutoLoad) return;
  window.__customFieldFormulaUiAutoLoad = true;
  const script = document.createElement("script");
  script.src = "app-custom-field-formula-ui.js";
  script.defer = true;
  document.body.appendChild(script);
})();
