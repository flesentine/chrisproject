(() => {
  const VERSION = "v0.37.0";
  const VERSION_NAME = "Custom fields";
  const BUILD_DATE = "2026-06-24";
  const GROUPS = [
    ["text", "Text", 30, "text"],
    ["number", "Number", 20, "number"],
    ["date", "Date", 10, "date"],
    ["flag", "Flag", 20, "flag"],
    ["cost", "Cost", 10, "cost"],
    ["duration", "Duration", 10, "duration"],
  ];
  const FIELD_DEFS = GROUPS.flatMap(([prefix, label, count, type]) => Array.from({ length: count }, (_, i) => ({
    key: `${prefix}${i + 1}`,
    label: `${label}${i + 1}`,
    group: label,
    type,
    columnKey: `custom:${prefix}${i + 1}`,
  })));
  const FIELD_BY_KEY = new Map(FIELD_DEFS.map((field) => [field.key, field]));
  const STARTER_VISIBLE = ["text1", "number1", "date1", "flag1", "cost1", "duration1"];
  let tries = 0;

  function ready() {
    return typeof state !== "undefined" && Array.isArray(FIELD_COLUMNS) && typeof FIELD_COLUMN_MAP !== "undefined" &&
      typeof render === "function" && typeof renderGantt === "function" && typeof refreshTaskInfoPanel === "function" &&
      typeof applyTaskInfoForm === "function" && typeof updateTask === "function" && typeof saveUiPrefs === "function" &&
      typeof applyUiPrefs === "function" && typeof getTotalFieldColumnWidth === "function";
  }

  function boot() {
    if (window.__customFieldsModuleLoaded) return;
    if (!ready()) {
      if (++tries < 180) setTimeout(boot, 75);
      return;
    }
    window.__customFieldsModuleLoaded = true;
    restoreCustomFieldMetaFromStorage();
    ensureCustomFieldState();
    installStyles();
    installRibbonButton();
    installManagerModal();
    patchRuntime();
    syncCustomColumns();
    ensureTaskInfoPage();
    exposeSelfTest();
    render();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, { once: true }) : boot();

  function installStyles() {
    if (document.getElementById("customFieldsStyles")) return;
    const style = document.createElement("style");
    style.id = "customFieldsStyles";
    style.textContent = `
      .custom-field-grid-cell { background: rgba(248,250,252,.76); }
      .planner-row:nth-child(even) .custom-field-grid-cell { background: rgba(241,245,249,.56); }
      .custom-field-grid-cell input[type="text"], .custom-field-grid-cell input[type="number"], .custom-field-grid-cell input[type="date"] { width: 100%; min-width: 0; }
      .custom-field-grid-cell input[type="checkbox"] { width: 16px; height: 16px; }
      .custom-field-flag-cell { display: flex; align-items: center; gap: 6px; justify-content: center; font-size: 11px; font-weight: 800; color: #475467; }
      .custom-fields-control { display: inline-flex; align-items: center; gap: 8px; }
      .custom-fields-count { color: #475467; font-size: 11px; font-weight: 800; white-space: nowrap; }
      .custom-fields-modal[hidden] { display: none; }
      .custom-fields-modal { position: fixed; inset: 0; z-index: 90; display: grid; place-items: center; padding: 24px; background: rgba(15,23,42,.38); }
      .custom-fields-dialog { width: min(940px, 96vw); max-height: 88vh; overflow: hidden; display: grid; grid-template-rows: auto 1fr auto; border-radius: 18px; background: #fff; box-shadow: 0 24px 70px rgba(15,23,42,.28); border: 1px solid #d9e2ee; }
      .custom-fields-dialog header, .custom-fields-dialog footer { padding: 16px 18px; border-bottom: 1px solid #e6edf5; }
      .custom-fields-dialog footer { border-top: 1px solid #e6edf5; border-bottom: 0; display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
      .custom-fields-dialog h2 { margin: 0; }
      .custom-fields-dialog p { margin: 5px 0 0; color: #667085; }
      .custom-fields-body { overflow: auto; padding: 14px 18px; display: grid; gap: 10px; }
      .custom-fields-body details { border: 1px solid #d9e2ee; border-radius: 12px; background: #f8fafc; }
      .custom-fields-body summary { cursor: pointer; padding: 11px 12px; font-weight: 850; color: #1f2937; }
      .custom-field-config-row { display: grid; grid-template-columns: 74px 110px minmax(160px,1fr) 90px; gap: 8px; align-items: center; padding: 8px 12px; border-top: 1px solid #e6edf5; }
      .custom-field-config-row input[type="text"] { width: 100%; }
      .custom-type-chip { font-size: 11px; font-weight: 850; color: #475467; background: #eef2f7; border: 1px solid #d9e2ee; border-radius: 999px; padding: 3px 7px; text-align: center; }
      .custom-fields-page-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
      .custom-fields-empty { padding: 12px; border: 1px dashed #cbd5e1; border-radius: 12px; background: #f8fafc; color: #667085; }
    `;
    document.head.appendChild(style);
  }

  function restoreCustomFieldMetaFromStorage() {
    try {
      if (typeof STORAGE_KEY === "undefined") return;
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (!state.customFieldNames && parsed.customFieldNames) state.customFieldNames = parsed.customFieldNames;
      if (!state.visibleCustomFields && parsed.visibleCustomFields) state.visibleCustomFields = parsed.visibleCustomFields;
      if (parsed.customFieldsInitialized) state.customFieldsInitialized = true;
    } catch {
      // Ignore old or invalid localStorage snapshots.
    }
  }

  function ensureCustomFieldState() {
    state.customFieldNames = state.customFieldNames && typeof state.customFieldNames === "object" ? state.customFieldNames : {};
    state.visibleCustomFields = Array.isArray(state.visibleCustomFields) ? state.visibleCustomFields.filter((key) => FIELD_BY_KEY.has(key)) : [...STARTER_VISIBLE];
    if (!state.customFieldsInitialized && !state.visibleCustomFields.length) state.visibleCustomFields = [...STARTER_VISIBLE];
    state.customFieldsInitialized = true;
    (state.tasks || []).forEach((task) => {
      task.customFields = task.customFields && typeof task.customFields === "object" ? task.customFields : {};
    });
  }

  function displayName(field) {
    const alias = String(state.customFieldNames?.[field.key] || "").trim();
    return alias || field.label;
  }

  function visibleFields() {
    ensureCustomFieldState();
    return state.visibleCustomFields.map((key) => FIELD_BY_KEY.get(key)).filter(Boolean);
  }

  function widthFor(field) {
    if (field.type === "text") return { defaultWidth: 150, min: 90, max: 360 };
    if (field.type === "number") return { defaultWidth: 110, min: 80, max: 180 };
    if (field.type === "date") return { defaultWidth: 126, min: 104, max: 180 };
    if (field.type === "flag") return { defaultWidth: 86, min: 70, max: 120 };
    return { defaultWidth: 112, min: 84, max: 180 };
  }

  function syncCustomColumns() {
    ensureCustomFieldState();
    for (let i = FIELD_COLUMNS.length - 1; i >= 0; i -= 1) {
      if (FIELD_COLUMNS[i].customField || String(FIELD_COLUMNS[i].key || "").startsWith("custom:")) FIELD_COLUMNS.splice(i, 1);
    }
    [...FIELD_COLUMN_MAP.keys()].forEach((key) => {
      if (String(key).startsWith("custom:")) FIELD_COLUMN_MAP.delete(key);
    });

    const actionsIndex = FIELD_COLUMNS.findIndex((column) => column.key === "actions");
    let insertAt = actionsIndex >= 0 ? actionsIndex : FIELD_COLUMNS.length;
    visibleFields().forEach((field) => {
      const width = widthFor(field);
      const column = { key: field.columnKey, label: displayName(field), customField: true, fieldKey: field.key, ...width };
      FIELD_COLUMNS.splice(insertAt, 0, column);
      FIELD_COLUMN_MAP.set(column.key, column);
      uiPrefs.fieldColumns = uiPrefs.fieldColumns || {};
      if (!Number.isFinite(Number(uiPrefs.fieldColumns[column.key]))) uiPrefs.fieldColumns[column.key] = column.defaultWidth;
      insertAt += 1;
    });
    uiPrefs.fieldPaneWidth = getTotalFieldColumnWidth();
    saveUiPrefs();
    applyUiPrefs();
  }

  function installRibbonButton() {
    if (document.getElementById("customFieldsBtn")) return;
    const viewPanel = document.querySelector('[data-ribbon-panel="view"]');
    if (!viewPanel) return;
    const group = document.createElement("div");
    group.className = "command-group compact-group custom-fields-control";
    group.innerHTML = `<span class="group-label">Custom fields</span><button id="customFieldsBtn" type="button">Rename / columns</button><span class="custom-fields-count" id="customFieldsCount"></span>`;
    viewPanel.appendChild(group);
    group.querySelector("button").addEventListener("click", openManagerModal);
    updateCustomFieldsCount();
  }

  function updateCustomFieldsCount() {
    const count = document.getElementById("customFieldsCount");
    if (count) count.textContent = `${visibleFields().length} shown`;
  }

  function installManagerModal() {
    if (document.getElementById("customFieldsModal")) return;
    const modal = document.createElement("div");
    modal.id = "customFieldsModal";
    modal.className = "custom-fields-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <section class="custom-fields-dialog" role="dialog" aria-modal="true" aria-labelledby="customFieldsTitle">
        <header><h2 id="customFieldsTitle">Custom Fields</h2><p>Rename Project-style custom fields and choose which ones appear as grid columns. Formulas come later.</p></header>
        <div class="custom-fields-body" id="customFieldsBody"></div>
        <footer><span><button type="button" data-custom-fields-action="starter">Starter set</button><button type="button" data-custom-fields-action="show-all">Show all</button><button type="button" data-custom-fields-action="hide-all">Hide all</button></span><span><button type="button" data-custom-fields-action="close">Cancel</button><button class="primary" type="button" data-custom-fields-action="apply">Apply custom fields</button></span></footer>
      </section>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeManagerModal();
      const action = event.target.closest("[data-custom-fields-action]")?.dataset.customFieldsAction;
      if (!action) return;
      if (action === "close") closeManagerModal();
      if (action === "starter") setModalVisibleKeys(STARTER_VISIBLE);
      if (action === "show-all") setModalVisibleKeys(FIELD_DEFS.map((field) => field.key));
      if (action === "hide-all") setModalVisibleKeys([]);
      if (action === "apply") applyManagerModal();
    });
  }

  function openManagerModal() {
    ensureManagerRows();
    document.getElementById("customFieldsModal").hidden = false;
  }

  function closeManagerModal() {
    const modal = document.getElementById("customFieldsModal");
    if (modal) modal.hidden = true;
  }

  function ensureManagerRows() {
    ensureCustomFieldState();
    const body = document.getElementById("customFieldsBody");
    if (!body) return;
    const visible = new Set(state.visibleCustomFields);
    body.innerHTML = GROUPS.map(([prefix, label]) => {
      const rows = FIELD_DEFS.filter((field) => field.group === label).map((field) => `
        <div class="custom-field-config-row" data-custom-field-key="${field.key}">
          <label><input type="checkbox" data-custom-config="visible" ${visible.has(field.key) ? "checked" : ""}/> Show</label>
          <strong>${field.label}</strong>
          <input type="text" data-custom-config="alias" value="${escapeSafe(state.customFieldNames[field.key] || "")}" placeholder="Rename ${field.label}"/>
          <span class="custom-type-chip">${field.type}</span>
        </div>`).join("");
      return `<details ${label === "Text" ? "open" : ""}><summary>${label} fields</summary>${rows}</details>`;
    }).join("");
  }

  function setModalVisibleKeys(keys) {
    const wanted = new Set(keys);
    document.querySelectorAll(".custom-field-config-row").forEach((row) => {
      const checkbox = row.querySelector('[data-custom-config="visible"]');
      if (checkbox) checkbox.checked = wanted.has(row.dataset.customFieldKey);
    });
  }

  function applyManagerModal() {
    const names = {};
    const visible = [];
    document.querySelectorAll(".custom-field-config-row").forEach((row) => {
      const key = row.dataset.customFieldKey;
      const alias = row.querySelector('[data-custom-config="alias"]')?.value.trim() || "";
      const show = row.querySelector('[data-custom-config="visible"]')?.checked;
      if (alias) names[key] = alias;
      if (show && FIELD_BY_KEY.has(key)) visible.push(key);
    });
    state.customFieldNames = names;
    state.visibleCustomFields = visible;
    state.customFieldsInitialized = true;
    syncCustomColumns();
    updateCustomFieldsCount();
    closeManagerModal();
    render();
  }

  function patchRuntime() {
    const baseRenderGantt = renderGantt;
    renderGantt = function customFieldsRenderGantt(...args) {
      syncCustomColumns();
      const result = baseRenderGantt.apply(this, args);
      injectGridCells();
      return result;
    };

    const baseRender = render;
    render = function customFieldsRender(...args) {
      ensureCustomFieldState();
      ensureTaskInfoPage();
      const result = baseRender.apply(this, args);
      ensureTaskInfoPage();
      injectGridCells();
      refreshCustomTaskInfoPage();
      updateCustomFieldsCount();
      setVersionLabels();
      return result;
    };

    const baseRefreshTaskInfoPanel = refreshTaskInfoPanel;
    refreshTaskInfoPanel = function customFieldsRefreshTaskInfoPanel(force = false) {
      ensureTaskInfoPage();
      const result = baseRefreshTaskInfoPanel.call(this, force);
      refreshCustomTaskInfoPage();
      return result;
    };

    const baseApplyTaskInfoForm = applyTaskInfoForm;
    applyTaskInfoForm = function customFieldsApplyTaskInfoForm(...args) {
      applyCustomTaskInfoValues();
      return baseApplyTaskInfoForm.apply(this, args);
    };

    const baseExportCsv = typeof exportCsv === "function" ? exportCsv : null;
    exportCsv = function customFieldsExportCsv() {
      try { exportCustomFieldsCsv(); }
      catch (error) { console.warn("Custom fields CSV failed; using previous exporter.", error); baseExportCsv?.call(this); }
    };

    els.taskBody?.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) return;
      const key = target.dataset.customField;
      if (!key) return;
      const index = Number(target.dataset.index);
      updateCustomField(index, key, target.type === "checkbox" ? target.checked : target.value);
    }, true);

    els.exportCsvBtn?.addEventListener("click", (event) => {
      if (!event.shiftKey) {
        event.preventDefault();
        event.stopImmediatePropagation();
        exportCustomFieldsCsv();
      }
    }, true);
  }

  function ensureTaskInfoPage() {
    const form = document.getElementById("taskInfoForm");
    const tabs = document.querySelector(".task-info-tabs");
    if (!form || !tabs) return;
    let tab = tabs.querySelector('[data-task-info-tab="custom-fields"]');
    if (!tab) {
      tab = document.createElement("button");
      tab.type = "button";
      tab.className = "task-info-tab";
      tab.dataset.taskInfoTab = "custom-fields";
      tabs.appendChild(tab);
    }
    tab.textContent = "Custom Fields";
    tab.classList.remove("is-placeholder");

    let page = document.querySelector('[data-task-info-page="custom-fields"]');
    if (!page) {
      page = document.createElement("fieldset");
      page.className = "task-info-page";
      page.dataset.taskInfoPage = "custom-fields";
      form.insertBefore(page, form.querySelector(".task-info-actions"));
    }
    page.id = "task-info-page-custom-fields";
    page.classList.remove("custom-fields-placeholder");
    page.innerHTML = `<legend>Custom Fields</legend><div class="custom-fields-page-toolbar"><span id="tiCustomFieldsSummary">Plain custom fields. No formulas yet.</span><button type="button" id="tiManageCustomFieldsBtn">Rename / show columns</button></div><div class="task-info-grid" id="tiCustomFieldsGrid"></div><p class="task-info-help">Supports Text1–Text30, Number1–Number20, Date1–Date10, Flag1–Flag20, Cost1–Cost10, and Duration1–Duration10.</p>`;
    document.getElementById("tiManageCustomFieldsBtn")?.addEventListener("click", openManagerModal);
  }

  function normalizeValue(field, value) {
    if (!field) return "";
    if (field.type === "flag") return Boolean(value);
    if (field.type === "date") return typeof normalizeDateValue === "function" ? normalizeDateValue(value) : String(value || "").slice(0, 10);
    if (field.type === "number") {
      const n = Number(value);
      return Number.isFinite(n) ? n : "";
    }
    if (field.type === "cost") {
      const n = typeof parseRateValue === "function" ? parseRateValue(value) : Number(String(value || "").replace(/[^0-9.-]+/g, ""));
      return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
    }
    if (field.type === "duration") {
      if (typeof parseDurationInput === "function") return parseDurationInput(value, 0);
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    return String(value ?? "");
  }

  function updateCustomField(index, key, value) {
    const task = state.tasks?.[index];
    const field = FIELD_BY_KEY.get(key);
    if (!task || !field) return;
    if (typeof selectTask === "function") selectTask(index);
    task.customFields = task.customFields && typeof task.customFields === "object" ? task.customFields : {};
    const normalized = normalizeValue(field, value);
    if (normalized === "" || normalized === false) delete task.customFields[key];
    else task.customFields[key] = normalized;
    render();
  }

  function formatCustomValue(field, value) {
    if (value === undefined || value === null || value === "") return "";
    if (field.type === "flag") return value ? "Yes" : "No";
    if (field.type === "cost") return typeof formatMoney === "function" ? formatMoney(value) : `$${Number(value || 0).toFixed(2)}`;
    if (field.type === "duration") return typeof formatDuration === "function" ? formatDuration(value) : String(value);
    return String(value);
  }

  function renderCustomInput(task, index, field, compact = false) {
    const value = task.customFields?.[field.key];
    const title = `${displayName(field)} (${field.label})`;
    if (field.type === "flag") {
      return `<label class="custom-field-flag-cell" title="${escapeSafe(title)}"><input type="checkbox" data-custom-field="${field.key}" data-index="${index}" ${value ? "checked" : ""}/><span>${value ? "Yes" : "No"}</span></label>`;
    }
    if (field.type === "date") return `<input type="date" data-custom-field="${field.key}" data-index="${index}" value="${escapeSafe(value || "")}" title="${escapeSafe(title)}"/>`;
    if (field.type === "number") return `<input type="number" step="any" data-custom-field="${field.key}" data-index="${index}" value="${escapeSafe(value ?? "")}" title="${escapeSafe(title)}"/>`;
    if (field.type === "cost") return `<input type="text" inputmode="decimal" data-custom-field="${field.key}" data-index="${index}" value="${escapeSafe(formatCustomValue(field, value))}" placeholder="$0" title="${escapeSafe(title)}"/>`;
    if (field.type === "duration") return `<input type="text" data-custom-field="${field.key}" data-index="${index}" value="${escapeSafe(formatCustomValue(field, value))}" placeholder="0d" title="${escapeSafe(title)}"/>`;
    return `<input type="text" data-custom-field="${field.key}" data-index="${index}" value="${escapeSafe(value || "")}" title="${escapeSafe(title)}"/>`;
  }

  function injectGridCells() {
    const fields = visibleFields();
    if (!els.taskBody || !fields.length) return;
    els.taskBody.querySelectorAll(".planner-row[data-row-index]").forEach((row) => {
      row.querySelectorAll(".custom-field-grid-cell").forEach((cell) => cell.remove());
      const index = Number(row.dataset.rowIndex);
      const task = state.tasks?.[index];
      const actionCell = row.querySelector(".row-detail-actions");
      if (!task || !actionCell) return;
      let cursor = actionCell;
      fields.slice().reverse().forEach((field) => {
        const cell = document.createElement("div");
        cell.className = "planner-cell custom-field-grid-cell";
        cell.dataset.customColumnKey = field.key;
        cell.innerHTML = renderCustomInput(task, index, field, true);
        cursor.before(cell);
        cursor = cell;
      });
    });
  }

  function refreshCustomTaskInfoPage() {
    const grid = document.getElementById("tiCustomFieldsGrid");
    if (!grid || !Number.isInteger(taskInfoIndex) || !state.tasks?.[taskInfoIndex]) return;
    const task = state.tasks[taskInfoIndex];
    const fields = visibleFields();
    const summary = document.getElementById("tiCustomFieldsSummary");
    if (summary) summary.textContent = fields.length ? `${fields.length} custom field column${fields.length === 1 ? "" : "s"} visible for this project.` : "No custom fields are visible. Use Rename / show columns to add them.";
    if (!fields.length) {
      grid.innerHTML = `<div class="custom-fields-empty">No visible custom fields yet.</div>`;
      return;
    }
    grid.innerHTML = fields.map((field) => `<label>${escapeSafe(displayName(field))}<span class="custom-type-chip">${field.label}</span>${renderCustomInput(task, taskInfoIndex, field)}</label>`).join("");
  }

  function applyCustomTaskInfoValues() {
    if (!Number.isInteger(taskInfoIndex) || !state.tasks?.[taskInfoIndex]) return;
    const task = state.tasks[taskInfoIndex];
    task.customFields = task.customFields && typeof task.customFields === "object" ? task.customFields : {};
    document.querySelectorAll("#tiCustomFieldsGrid [data-custom-field]").forEach((input) => {
      const field = FIELD_BY_KEY.get(input.dataset.customField);
      if (!field) return;
      const normalized = normalizeValue(field, input.type === "checkbox" ? input.checked : input.value);
      if (normalized === "" || normalized === false) delete task.customFields[field.key];
      else task.customFields[field.key] = normalized;
    });
  }

  function exportCustomFieldsCsv() {
    ensureCustomFieldState();
    const header = ["ID", "WBS", "Name", "Start", "Finish", "Duration", "PercentComplete", ...FIELD_DEFS.map((field) => displayName(field))];
    const rows = [header];
    (state.tasks || []).forEach((task) => rows.push([
      task.id,
      task.wbs || "",
      task.name || "",
      task.start || "",
      task.finish || "",
      typeof formatDuration === "function" ? formatDuration(task.durationMinutes) : task.durationMinutes,
      task.percent ?? 0,
      ...FIELD_DEFS.map((field) => formatCustomValue(field, task.customFields?.[field.key])),
    ]));
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const name = typeof safeFileName === "function" ? safeFileName(state.projectName || "project") : "project";
    if (typeof downloadText === "function") downloadText(csv, `${name}-custom-fields.csv`, "text/csv");
  }

  function csvEscape(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function setVersionLabels() {
    const label = `${VERSION} · ${VERSION_NAME}`;
    if (els.appVersionBadge) {
      els.appVersionBadge.textContent = label;
      els.appVersionBadge.title = `Build ${BUILD_DATE}`;
    }
    if (els.appVersionFooter) els.appVersionFooter.textContent = `${label} · Build ${BUILD_DATE}`;
    const ribbon = document.getElementById("ribbonVersionText");
    if (ribbon) ribbon.textContent = `${VERSION} · custom fields`;
    const chip = document.getElementById("compatChip");
    if (chip && !chip.classList.contains("has-issues")) chip.lastChild.textContent = " Custom fields ready";
  }

  function exposeSelfTest() {
    window.__customFieldsSelfTest = () => {
      const savedState = JSON.parse(JSON.stringify(state));
      const savedPrefs = JSON.parse(JSON.stringify(uiPrefs));
      const savedSelected = typeof selectedTaskIndex !== "undefined" ? selectedTaskIndex : null;
      try {
        state.tasks = [{ uid: 1, id: 1, name: "Custom field acceptance", start: "2026-07-06", finish: "2026-07-10", durationMinutes: 2400, durationDays: 5, percent: 0, predecessors: [], links: [], outlineLevel: 1, isSummary: false, expanded: true, assignments: [], customFields: {} }];
        state.customFieldNames = { text1: "Owner", flag1: "Approved" };
        state.visibleCustomFields = [...STARTER_VISIBLE];
        state.tasks[0].customFields = { text1: "Chris", number1: 42, date1: "2026-07-08", flag1: true, cost1: 123.45, duration1: 960 };
        syncCustomColumns();
        render();
        const headers = [...document.querySelectorAll(".field-heading-cell")].map((node) => node.textContent.trim());
        const cells = document.querySelectorAll(".custom-field-grid-cell").length;
        return { version: VERSION, fields: FIELD_DEFS.length, visible: visibleFields().map((field) => displayName(field)), hasOwnerColumn: headers.includes("Owner"), cells, passed: FIELD_DEFS.length === 100 && headers.includes("Owner") && cells >= STARTER_VISIBLE.length };
      } finally {
        state = savedState;
        uiPrefs = savedPrefs;
        if (typeof selectedTaskIndex !== "undefined") selectedTaskIndex = savedSelected;
        syncCustomColumns();
        render();
      }
    };
  }

  function escapeSafe(value) {
    return typeof escapeXml === "function" ? escapeXml(value) : String(value ?? "").replace(/[&<>\"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
  }
})();