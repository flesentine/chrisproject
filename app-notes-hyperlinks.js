(() => {
  const VERSION = "v0.38.0";
  const VERSION_NAME = "Notes + hyperlinks";
  const BUILD_DATE = "2026-06-24";
  let tries = 0;

  function ready() {
    return typeof state !== "undefined" && Array.isArray(state.tasks) &&
      typeof render === "function" && typeof renderGantt === "function" &&
      typeof refreshTaskInfoPanel === "function" && typeof applyTaskInfoForm === "function" &&
      typeof buildProjectXml === "function" && typeof importProjectXml === "function" &&
      typeof renderTaskIndicators === "function" && typeof escapeXml === "function";
  }

  function boot() {
    if (window.__notesHyperlinksModuleLoaded) return;
    if (!ready()) {
      if (++tries < 180) setTimeout(boot, 75);
      return;
    }
    window.__notesHyperlinksModuleLoaded = true;
    ensureTaskNotesHyperlinkState();
    installStyles();
    installTaskInfoFields();
    patchRuntime();
    exposeSelfTest();
    render();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, { once: true }) : boot();

  function installStyles() {
    if (document.getElementById("notesHyperlinksStyles")) return;
    const style = document.createElement("style");
    style.id = "notesHyperlinksStyles";
    style.textContent = `
      .hyperlink-info-grid { margin-top: 12px; }
      .hyperlink-info-grid input { width: 100%; }
      .hyperlink-preview-card { margin-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid #d9e2ee; border-radius: 12px; background: #f8fafc; color: #475467; }
      .hyperlink-preview-card a { font-weight: 850; color: #1d4ed8; text-decoration: none; }
      .hyperlink-preview-card a:hover { text-decoration: underline; }
      .hyperlink-preview-card small { display: block; color: #667085; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .indicator-dot.is-hyperlink { background: #e0f2fe; border-color: #7dd3fc; color: #075985; }
    `;
    document.head.appendChild(style);
  }

  function installTaskInfoFields() {
    const notesPage = document.querySelector('[data-task-info-page="notes"]');
    if (!notesPage || document.getElementById("tiHyperlinkUrl")) return;
    const wrapper = document.createElement("div");
    wrapper.className = "task-info-grid hyperlink-info-grid";
    wrapper.innerHTML = `
      <label>Hyperlink text<input id="tiHyperlinkText" type="text" placeholder="Spec, ticket, design doc" autocomplete="off"/></label>
      <label>Hyperlink URL<input id="tiHyperlinkUrl" type="url" placeholder="https://example.com/project-plan" autocomplete="off"/></label>`;
    notesPage.appendChild(wrapper);

    const preview = document.createElement("div");
    preview.id = "tiHyperlinkPreview";
    preview.className = "hyperlink-preview-card";
    preview.hidden = true;
    notesPage.appendChild(preview);

    notesPage.addEventListener("input", (event) => {
      if (event.target?.id === "tiHyperlinkText" || event.target?.id === "tiHyperlinkUrl") refreshHyperlinkPreviewFromFields();
    });
  }

  function ensureTaskNotesHyperlinkState() {
    (state.tasks || []).forEach((task) => normalizeTaskNotesHyperlinkFields(task));
  }

  function normalizeTaskNotesHyperlinkFields(task) {
    if (!task) return task;
    task.notes = String(task.notes || "");
    const text = task.hyperlinkText ?? task.hyperlink ?? task.hyperlinkName ?? task.hyperlinkTitle ?? "";
    const url = task.hyperlinkUrl ?? task.hyperlinkAddress ?? task.hyperlinkHref ?? "";
    task.hyperlinkUrl = normalizeHyperlinkUrl(url);
    task.hyperlinkText = String(text || "").trim();
    if (!task.hyperlinkText && task.hyperlinkUrl) task.hyperlinkText = "Open hyperlink";
    return task;
  }

  function normalizeHyperlinkUrl(value) {
    const raw = String(value || "").trim();
    if (!raw) return "";
    if (/^(https?:|mailto:|tel:)/i.test(raw)) return raw;
    if (/^[\w.-]+\.[a-z]{2,}(?:[/:?#].*)?$/i.test(raw)) return `https://${raw}`;
    return "";
  }

  function hasTaskHyperlink(task) {
    return Boolean(normalizeHyperlinkUrl(task?.hyperlinkUrl));
  }

  function hyperlinkLabel(task) {
    const url = normalizeHyperlinkUrl(task?.hyperlinkUrl);
    if (!url) return "";
    return String(task?.hyperlinkText || "Open hyperlink").trim() || "Open hyperlink";
  }

  function getTaskInfoHyperlinkFields() {
    return {
      text: document.getElementById("tiHyperlinkText"),
      url: document.getElementById("tiHyperlinkUrl"),
      preview: document.getElementById("tiHyperlinkPreview"),
    };
  }

  function refreshHyperlinkPreviewFromFields() {
    const { text, url, preview } = getTaskInfoHyperlinkFields();
    if (!preview) return;
    const safeUrl = normalizeHyperlinkUrl(url?.value || "");
    const label = String(text?.value || "").trim() || "Open hyperlink";
    preview.hidden = !safeUrl;
    preview.innerHTML = safeUrl ? `<span><strong>Grid indicator ready:</strong><small>${escapeSafe(safeUrl)}</small></span><a href="${escapeSafe(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeSafe(label)}</a>` : "";
  }

  function patchRuntime() {
    const baseRender = render;
    render = function notesHyperlinksRender(...args) {
      ensureTaskNotesHyperlinkState();
      installTaskInfoFields();
      const result = baseRender.apply(this, args);
      ensureTaskNotesHyperlinkState();
      installTaskInfoFields();
      refreshHyperlinkPreviewFromFields();
      setVersionLabels();
      return result;
    };

    const baseRefreshTaskInfoPanel = refreshTaskInfoPanel;
    refreshTaskInfoPanel = function notesHyperlinksRefreshTaskInfoPanel(force = false) {
      installTaskInfoFields();
      ensureTaskNotesHyperlinkState();
      const result = baseRefreshTaskInfoPanel.call(this, force);
      fillTaskInfoHyperlinkFields();
      return result;
    };

    const baseApplyTaskInfoForm = applyTaskInfoForm;
    applyTaskInfoForm = function notesHyperlinksApplyTaskInfoForm(...args) {
      applyTaskInfoHyperlinkFields();
      return baseApplyTaskInfoForm.apply(this, args);
    };

    const baseRenderTaskIndicators = renderTaskIndicators;
    renderTaskIndicators = function notesHyperlinksRenderTaskIndicators(task, index, context = {}) {
      const html = baseRenderTaskIndicators.call(this, task, index, context);
      if (!hasTaskHyperlink(task)) return html;
      const label = hyperlinkLabel(task);
      const url = normalizeHyperlinkUrl(task.hyperlinkUrl);
      const icon = `<span class="indicator-dot is-hyperlink" title="${escapeSafe(label)}: ${escapeSafe(url)}">🔗</span>`;
      return html.replace(/(<button\b[^>]*>)/, `$1${icon}`);
    };

    const baseBuildProjectXml = buildProjectXml;
    buildProjectXml = function notesHyperlinksBuildProjectXml(...args) {
      ensureTaskNotesHyperlinkState();
      const xml = baseBuildProjectXml.apply(this, args);
      return injectTaskHyperlinksIntoProjectXml(xml);
    };

    const baseImportProjectXml = importProjectXml;
    importProjectXml = function notesHyperlinksImportProjectXml(text, ...args) {
      const hyperlinks = extractTaskHyperlinksFromProjectXml(text);
      const result = baseImportProjectXml.call(this, text, ...args);
      if (hyperlinks.size) {
        (state.tasks || []).forEach((task) => {
          const imported = hyperlinks.get(Number(task.uid));
          if (!imported) return;
          task.hyperlinkText = imported.text;
          task.hyperlinkUrl = imported.url;
          normalizeTaskNotesHyperlinkFields(task);
        });
        render();
      }
      return result;
    };
  }

  function fillTaskInfoHyperlinkFields() {
    const { text, url } = getTaskInfoHyperlinkFields();
    if (!Number.isInteger(taskInfoIndex) || !state.tasks?.[taskInfoIndex]) return;
    const task = normalizeTaskNotesHyperlinkFields(state.tasks[taskInfoIndex]);
    if (text) text.value = task.hyperlinkText || "";
    if (url) url.value = task.hyperlinkUrl || "";
    refreshHyperlinkPreviewFromFields();
  }

  function applyTaskInfoHyperlinkFields() {
    if (!Number.isInteger(taskInfoIndex) || !state.tasks?.[taskInfoIndex]) return;
    const { text, url } = getTaskInfoHyperlinkFields();
    const task = state.tasks[taskInfoIndex];
    task.hyperlinkUrl = normalizeHyperlinkUrl(url?.value || "");
    task.hyperlinkText = String(text?.value || "").trim();
    if (!task.hyperlinkText && task.hyperlinkUrl) task.hyperlinkText = "Open hyperlink";
  }

  function injectTaskHyperlinksIntoProjectXml(xml) {
    const byUid = new Map((state.tasks || []).map((task) => [Number(task.uid), normalizeTaskNotesHyperlinkFields(task)]));
    return String(xml || "").replace(/<Task>([\s\S]*?)<\/Task>/g, (block, body) => {
      const uid = Number((body.match(/<UID>([^<]+)<\/UID>/) || [])[1]);
      const task = byUid.get(uid);
      const url = normalizeHyperlinkUrl(task?.hyperlinkUrl);
      if (!task || !url || /<Hyperlink(?:Address|SubAddress)?>/.test(body)) return block;
      const label = hyperlinkLabel(task);
      const tags = `\n      <Hyperlink>${escapeXml(label)}</Hyperlink>\n      <HyperlinkAddress>${escapeXml(url)}</HyperlinkAddress>`;
      if (/\n\s*<Type>/.test(body)) return `<Task>${body.replace(/\n\s*<Type>/, `${tags}\n      <Type>`)}</Task>`;
      return `<Task>${body}${tags}</Task>`;
    });
  }

  function extractTaskHyperlinksFromProjectXml(text) {
    const links = new Map();
    try {
      const xml = new DOMParser().parseFromString(text, "application/xml");
      const parserError = xml.getElementsByTagName("parsererror")[0];
      if (parserError) return links;
      [...xml.getElementsByTagName("Task")].forEach((node) => {
        const uid = Number(childText(node, "UID"));
        const id = Number(childText(node, "ID"));
        if (!uid || id === 0) return;
        const url = normalizeHyperlinkUrl(childText(node, "HyperlinkAddress"));
        const textLabel = childText(node, "Hyperlink") || childText(node, "HyperlinkSubAddress") || "";
        if (url) links.set(uid, { text: String(textLabel || "").trim() || "Open hyperlink", url });
      });
    } catch {
      // Keep import resilient if an unusual XML file lacks these optional fields.
    }
    return links;
  }

  function setVersionLabels() {
    const label = `${VERSION} · ${VERSION_NAME}`;
    if (els.appVersionBadge) {
      els.appVersionBadge.textContent = label;
      els.appVersionBadge.title = `Build ${BUILD_DATE}`;
    }
    if (els.appVersionFooter) els.appVersionFooter.textContent = `${label} · Build ${BUILD_DATE}`;
    const ribbon = document.getElementById("ribbonVersionText");
    if (ribbon) ribbon.textContent = `${VERSION} · notes + hyperlinks`;
    const chip = document.getElementById("compatChip");
    if (chip && !chip.classList.contains("has-issues")) chip.lastChild.textContent = " Notes + hyperlinks ready";
    const badge = document.querySelector(".card-badge");
    if (badge && /Custom Fields|Notes|Entry/.test(badge.textContent || "")) badge.textContent = "Entry + Notes + Links";
  }

  function exposeSelfTest() {
    window.__notesHyperlinksSelfTest = () => {
      const savedState = JSON.parse(JSON.stringify(state));
      const savedTaskInfoIndex = typeof taskInfoIndex !== "undefined" ? taskInfoIndex : null;
      try {
        state.tasks = [{ uid: 101, id: 1, name: "Hyperlink acceptance", notes: "Callout note", hyperlinkText: "Open spec", hyperlinkUrl: "example.com/spec", start: "2026-07-06", finish: "2026-07-10", durationMinutes: 2400, durationDays: 5, percent: 0, predecessors: [], links: [], outlineLevel: 1, isSummary: false, expanded: true, assignments: [] }];
        ensureTaskNotesHyperlinkState();
        taskInfoIndex = 0;
        render();
        refreshTaskInfoPanel(true);
        const indicators = document.querySelector(".indicator-cell")?.textContent || "";
        const preview = document.getElementById("tiHyperlinkPreview");
        const xml = buildProjectXml();
        return {
          version: VERSION,
          url: state.tasks[0].hyperlinkUrl,
          hasNote: state.tasks[0].notes === "Callout note",
          hasIndicator: indicators.includes("🔗"),
          hasPreview: Boolean(preview && !preview.hidden),
          exportsHyperlink: xml.includes("<Hyperlink>Open spec</Hyperlink>") && xml.includes("<HyperlinkAddress>https://example.com/spec</HyperlinkAddress>"),
          passed: state.tasks[0].hyperlinkUrl === "https://example.com/spec" && indicators.includes("🔗") && xml.includes("<HyperlinkAddress>https://example.com/spec</HyperlinkAddress>"),
        };
      } finally {
        state = savedState;
        if (typeof taskInfoIndex !== "undefined") taskInfoIndex = savedTaskInfoIndex;
        render();
      }
    };
  }

  function escapeSafe(value) {
    return typeof escapeXml === "function" ? escapeXml(value) : String(value ?? "").replace(/[&<>\"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
  }
})();

(() => {
  if (document.getElementById("resourceLevelingScript")) return;
  const script = document.createElement("script");
  script.id = "resourceLevelingScript";
  script.src = "app-resource-leveling.js?v0.40.0";
  script.defer = true;
  document.body.appendChild(script);
})();
