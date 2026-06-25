(() => {
  const VERSION = "v0.40.0";
  let tries = 0;
  const FIELD_RE = /^(Text|Number|Date|Flag|Cost|Duration)(\d+)$/i;

  function ready() {
    return typeof state !== "undefined" && typeof render === "function" && typeof renderGantt === "function" && typeof importProjectXml === "function";
  }

  function boot() {
    if (window.__customFieldIndicatorsAppLoaded) return;
    if (!ready()) {
      if (++tries < 180) setTimeout(boot, 75);
      return;
    }
    window.__customFieldIndicatorsAppLoaded = true;
    ensureStyles();
    patchRuntime();
    decorateIndicators();
    render();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, { once: true }) : boot();

  function patchRuntime() {
    const baseImportProjectXml = importProjectXml;
    importProjectXml = function indicatorImportProjectXml(text) {
      const hints = parseIndicatorHints(text);
      const result = baseImportProjectXml.apply(this, arguments);
      if (hints && Object.keys(hints).length) {
        state.customFieldIndicatorHints = hints;
        window.__lastCustomFieldIndicatorHints = hints;
      }
      decorateIndicators();
      return result;
    };

    if (typeof buildProjectXml === "function") {
      const baseBuildProjectXml = buildProjectXml;
      buildProjectXml = function indicatorBuildProjectXml(...args) {
        let xml = baseBuildProjectXml.apply(this, args);
        return injectIndicatorHints(xml, state.customFieldIndicatorHints || {});
      };
    }

    const baseRenderGantt = renderGantt;
    renderGantt = function indicatorRenderGantt(...args) {
      const result = baseRenderGantt.apply(this, args);
      decorateIndicators();
      return result;
    };

    const baseRender = render;
    render = function indicatorRender(...args) {
      const result = baseRender.apply(this, args);
      decorateIndicators();
      setVersionLabels();
      return result;
    };
  }

  function parseIndicatorHints(text) {
    const xml = new DOMParser().parseFromString(String(text || ""), "application/xml");
    const out = {};
    [...xml.getElementsByTagName("ExtendedAttribute")].forEach((node) => {
      const fieldName = childText(node, "FieldName");
      const key = keyFromFieldName(fieldName);
      if (!key) return;
      const rows = [...node.getElementsByTagName("IndicatorHint")].map((hint) => ({
        value: childText(hint, "Value"),
        severity: childText(hint, "Severity") || "neutral",
        color: childText(hint, "Color") || "gray",
        rule: childText(hint, "Rule") || "",
      })).filter((hint) => hint.value);
      if (rows.length) out[key] = rows;
    });
    return out;
  }

  function decorateIndicators() {
    const hints = state.customFieldIndicatorHints || window.__lastCustomFieldIndicatorHints || {};
    document.querySelectorAll(".custom-field-indicator-chip").forEach((node) => node.remove());
    document.querySelectorAll("[data-custom-field]").forEach((input) => {
      const key = input.dataset.customField;
      const hint = matchHint(hints[key], input.type === "checkbox" ? (input.checked ? "Yes" : "No") : input.value);
      if (!hint) return;
      const chip = document.createElement("span");
      chip.className = `custom-field-indicator-chip is-${safeClass(hint.severity)}`;
      chip.textContent = symbolFor(hint.severity);
      chip.title = hint.rule || `${hint.severity}: ${hint.value}`;
      if (input.closest(".custom-field-grid-cell")) input.insertAdjacentElement("afterend", chip);
      else input.parentElement?.appendChild(chip);
    });
  }

  function matchHint(list, value) {
    const v = clean(value).toLowerCase();
    if (!v || !Array.isArray(list)) return null;
    return list.find((hint) => clean(hint.value).toLowerCase() === v) || null;
  }

  function injectIndicatorHints(xml, hints) {
    if (!hints || !Object.keys(hints).length) return xml;
    return String(xml).replace(/<ExtendedAttribute>([\s\S]*?)<\/ExtendedAttribute>/g, (full, body) => {
      if (/<IndicatorHints>[\s\S]*?<\/IndicatorHints>/.test(body)) return full;
      const key = keyFromFieldName(childTextFromString(body, "FieldName"));
      const list = key ? hints[key] : null;
      if (!Array.isArray(list) || !list.length) return full;
      const block = `\n    <IndicatorHints>${list.map((hint, index) => `\n      <IndicatorHint><ID>${index + 1}</ID><Value>${escapeXml(hint.value)}</Value><Severity>${escapeXml(hint.severity || "neutral")}</Severity><Color>${escapeXml(hint.color || "gray")}</Color><Rule>${escapeXml(hint.rule || "")}</Rule></IndicatorHint>`).join("")}\n    </IndicatorHints>`;
      return `<ExtendedAttribute>${body}${block}</ExtendedAttribute>`;
    });
  }

  function keyFromFieldName(name) {
    const match = FIELD_RE.exec(String(name || "").trim());
    if (!match) return "";
    return `${match[1].toLowerCase()}${Number(match[2])}`;
  }

  function childText(node, name) {
    return [...node.children].find((child) => child.localName === name)?.textContent?.trim() || "";
  }

  function childTextFromString(body, name) {
    const match = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`).exec(body || "");
    return match ? decodeXml(match[1].trim()) : "";
  }

  function clean(value) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  }

  function safeClass(value) {
    const v = String(value || "neutral").toLowerCase();
    return /^(good|bad|warn|neutral)$/.test(v) ? v : "neutral";
  }

  function symbolFor(severity) {
    if (severity === "good") return "●";
    if (severity === "bad") return "◆";
    if (severity === "warn") return "▲";
    return "●";
  }

  function ensureStyles() {
    if (document.getElementById("customFieldIndicatorsStyles")) return;
    const style = document.createElement("style");
    style.id = "customFieldIndicatorsStyles";
    style.textContent = `
      .custom-field-grid-cell { position: relative; }
      .custom-field-grid-cell input + .custom-field-indicator-chip { position: absolute; right: 5px; top: 50%; transform: translateY(-50%); }
      .custom-field-grid-cell input { padding-right: 20px; }
      .custom-field-indicator-chip { display: inline-flex; align-items: center; justify-content: center; width: 15px; height: 15px; margin-left: 6px; border-radius: 999px; border: 1px solid #cbd5e1; font-size: 9px; font-weight: 900; line-height: 1; vertical-align: middle; background: #f8fafc; color: #475467; }
      .custom-field-indicator-chip.is-good { color: #047857; background: #ecfdf5; border-color: #86efac; }
      .custom-field-indicator-chip.is-bad { color: #b91c1c; background: #fef2f2; border-color: #fecaca; }
      .custom-field-indicator-chip.is-warn { color: #a16207; background: #fffbeb; border-color: #fde68a; }
      .custom-field-indicator-chip.is-neutral { color: #475467; background: #f8fafc; border-color: #cbd5e1; }
    `;
    document.head.appendChild(style);
  }

  function setVersionLabels() {
    const ribbon = document.getElementById("ribbonVersionText");
    if (ribbon) ribbon.textContent = `${VERSION} · custom indicators`;
    if (typeof els !== "undefined" && els.appVersionBadge) els.appVersionBadge.textContent = VERSION;
  }

  function escapeXml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  }

  function decodeXml(value) {
    return String(value || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, "\n").replace(/&amp;/g, "&");
  }
})();
