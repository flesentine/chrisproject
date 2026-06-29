(() => {
  'use strict';

  const VERSION = '0.2.0-project-table-switcher';
  const ENTRY_KEYS = ['id', 'indicators', 'name', 'duration', 'start', 'finish', 'predecessors', 'actions'];
  const BASELINE_KEYS = ['baselineStart', 'baselineFinish', 'baselineDuration', 'startVariance', 'finishVariance', 'durationVariance'];
  const TABLE_LABELS = { entry: 'Entry', tracking: 'Tracking', baseline: 'Baseline', all: 'All Fields' };
  let tries = 0;

  function ready() {
    return typeof FIELD_COLUMNS !== 'undefined' && Array.isArray(FIELD_COLUMNS) &&
      typeof uiPrefs !== 'undefined' && typeof render === 'function' && typeof renderGantt === 'function' &&
      typeof getTotalFieldColumnWidth === 'function' && typeof getFieldGridTemplate === 'function' &&
      typeof renderFieldHeadingCells === 'function' && typeof applyUiPrefs === 'function';
  }

  function boot() {
    if (window.__projectEntryTableLoaded === VERSION) return;
    if (!ready()) {
      if (++tries < 160) setTimeout(boot, 75);
      return;
    }
    window.__projectEntryTableLoaded = VERSION;
    installStyles();
    installTableModel();
    installTableSwitcher();
    patchColumnFunctions();
    patchRenderers();
    applyEntryTableDefaults();
    applyVisibleColumnDom();
    updateTableSwitcher();
    mark('project-entry-table-installed', { version: VERSION, activeTable: uiPrefs.fieldTable || 'entry', visibleFieldKeys: getVisibleKeys(), fieldPaneWidth: getTotalFieldColumnWidth() });
  }

  function installStyles() {
    if (document.getElementById('projectTableSwitcherStyles')) return;
    const style = document.createElement('style');
    style.id = 'projectTableSwitcherStyles';
    style.textContent = `
      .project-table-switcher { display:flex; align-items:center; gap:6px; margin:8px 12px; padding:7px 9px; border:1px solid rgba(148,163,184,.45); border-radius:12px; background:rgba(255,255,255,.86); box-shadow:0 4px 14px rgba(15,23,42,.08); width:max-content; max-width:calc(100% - 24px); }
      .project-table-switcher strong { font-size:11px; color:#475467; margin-right:4px; text-transform:uppercase; letter-spacing:.06em; }
      .project-table-switcher button { border:1px solid rgba(148,163,184,.6); background:#fff; color:#334155; border-radius:9px; padding:5px 9px; font-size:12px; font-weight:750; cursor:pointer; }
      .project-table-switcher button.is-active { color:#fff; background:#1f4ed8; border-color:#1f4ed8; }
      .project-table-switcher button:hover { border-color:#1f4ed8; }
    `;
    document.head.appendChild(style);
  }

  function installTableModel() {
    window.PROJECT_FIELD_TABLES = {
      entry: ENTRY_KEYS,
      baseline: ['id', 'indicators', 'name', 'duration', 'start', 'finish', ...BASELINE_KEYS, 'predecessors', 'actions'],
      tracking: ['id', 'indicators', 'name', 'duration', 'start', 'finish', 'percent', 'predecessors', 'actions'],
      all: null,
    };
    window.setProjectFieldTable = function setProjectFieldTable(tableName = 'entry') {
      const table = String(tableName || 'entry').toLowerCase();
      const keys = window.PROJECT_FIELD_TABLES[table] || ENTRY_KEYS;
      uiPrefs.fieldTable = window.PROJECT_FIELD_TABLES[table] === null ? 'all' : table;
      uiPrefs.visibleFieldKeys = Array.isArray(keys) ? [...keys] : FIELD_COLUMNS.map((column) => column.key);
      uiPrefs.fieldPaneWidth = getTotalFieldColumnWidth();
      try { if (typeof saveUiPrefs === 'function') saveUiPrefs(); } catch {}
      updateTableSwitcher();
      try { render(); } catch { applyVisibleColumnDom(); }
    };
  }

  function installTableSwitcher() {
    if (document.getElementById('projectTableSwitcher')) return;
    const switcher = document.createElement('div');
    switcher.id = 'projectTableSwitcher';
    switcher.className = 'project-table-switcher';
    switcher.setAttribute('role', 'toolbar');
    switcher.setAttribute('aria-label', 'Project table selector');
    switcher.innerHTML = `<strong>Table</strong>${Object.entries(TABLE_LABELS).map(([key, label]) => `<button type="button" data-project-field-table="${esc(key)}">${esc(label)}</button>`).join('')}`;
    const anchor = document.getElementById('workspace') || document.querySelector('.planner-shell') || document.querySelector('main') || document.body.firstElementChild;
    if (anchor?.parentElement) anchor.parentElement.insertBefore(switcher, anchor);
    else document.body.prepend(switcher);
    switcher.addEventListener('click', (event) => {
      const button = event.target?.closest?.('[data-project-field-table]');
      if (!button) return;
      event.preventDefault();
      window.setProjectFieldTable(button.dataset.projectFieldTable || 'entry');
    });
  }

  function updateTableSwitcher() {
    const active = String(uiPrefs.fieldTable || 'entry').toLowerCase();
    document.querySelectorAll('[data-project-field-table]').forEach((button) => {
      const isActive = button.dataset.projectFieldTable === active;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function applyEntryTableDefaults() {
    if (!uiPrefs.fieldTable || uiPrefs.fieldTable === 'all' || isOldFullWidthPrefs()) {
      uiPrefs.fieldTable = 'entry';
      uiPrefs.visibleFieldKeys = [...ENTRY_KEYS];
    }
    uiPrefs.fieldColumns = uiPrefs.fieldColumns || {};
    FIELD_COLUMNS.forEach((column) => {
      if (!Number.isFinite(Number(uiPrefs.fieldColumns[column.key]))) uiPrefs.fieldColumns[column.key] = column.defaultWidth;
    });
    uiPrefs.fieldPaneWidth = getTotalFieldColumnWidth();
    try { if (typeof saveUiPrefs === 'function') saveUiPrefs(); } catch {}
    try { if (typeof applyUiPrefs === 'function') applyUiPrefs(); } catch {}
  }

  function isOldFullWidthPrefs() {
    const keys = Array.isArray(uiPrefs.visibleFieldKeys) ? uiPrefs.visibleFieldKeys : [];
    if (!keys.length) return true;
    const baselineVisible = keys.some((key) => BASELINE_KEYS.includes(key));
    return baselineVisible && String(uiPrefs.fieldTable || '').toLowerCase() !== 'baseline';
  }

  function getVisibleKeys(prefs = uiPrefs) {
    const configured = Array.isArray(prefs.visibleFieldKeys) && prefs.visibleFieldKeys.length ? prefs.visibleFieldKeys : ENTRY_KEYS;
    const existing = new Set(FIELD_COLUMNS.map((column) => column.key));
    const keys = configured.filter((key) => existing.has(key));
    return keys.length ? keys : ENTRY_KEYS.filter((key) => existing.has(key));
  }

  function getVisibleColumns(prefs = uiPrefs) {
    const visible = new Set(getVisibleKeys(prefs));
    return FIELD_COLUMNS.filter((column) => visible.has(column.key));
  }

  function columnWidth(column, prefs = uiPrefs) {
    return Number(prefs.fieldColumns?.[column.key]) || Number(column.defaultWidth) || 80;
  }

  function visibleTemplate(prefs = uiPrefs) {
    return getVisibleColumns(prefs).map((column) => `${columnWidth(column, prefs)}px`).join(' ');
  }

  function visibleWidth(prefs = uiPrefs) {
    return getVisibleColumns(prefs).reduce((sum, column) => sum + columnWidth(column, prefs), 0);
  }

  function patchColumnFunctions() {
    if (window.__projectEntryTableColumnFunctionsPatched) return;
    window.__projectEntryTableColumnFunctionsPatched = true;

    getTotalFieldColumnWidth = function patchedTotalFieldColumnWidth(prefs = uiPrefs) {
      return Math.max(1, visibleWidth(prefs));
    };

    getFieldGridTemplate = function patchedFieldGridTemplate() {
      return visibleTemplate(uiPrefs);
    };

    getFieldPaneWidth = function patchedFieldPaneWidth(prefs = uiPrefs) {
      return getTotalFieldColumnWidth(prefs);
    };

    setFieldPaneWidth = function patchedSetFieldPaneWidth() {
      uiPrefs.fieldPaneWidth = getTotalFieldColumnWidth();
    };

    isFieldPaneClipped = function patchedIsFieldPaneClipped() { return false; };

    renderFieldHeadingCells = function patchedFieldHeadingCells() {
      return getVisibleColumns().map((column) => {
        const width = columnWidth(column);
        const shouldRotate = column.label && column.label.length > 2 && width <= 68;
        const shouldCompact = column.label && width <= 88;
        const classes = ['field-heading-cell'];
        if (shouldCompact) classes.push('is-skinny');
        if (shouldRotate) classes.push('is-vertical');
        return `<div class="${classes.join(' ')}" data-column-key="${esc(column.key)}" title="Drag the edge to resize ${esc(column.label || 'this column')}"><span>${esc(column.label)}</span><i class="column-resize-handle" data-column-resize="${esc(column.key)}" aria-hidden="true"></i></div>`;
      }).join('');
    };

    window.getVisibleFieldColumns = getVisibleColumns;
    window.getVisibleFieldKeys = getVisibleKeys;
  }

  function patchRenderers() {
    if (window.__projectEntryTableRenderPatched) return;
    window.__projectEntryTableRenderPatched = true;
    const baseRenderGantt = renderGantt;
    renderGantt = function entryTableRenderGantt(...args) {
      const result = baseRenderGantt.apply(this, args);
      applyVisibleColumnDom();
      updateTableSwitcher();
      return result;
    };
    window.renderGantt = renderGantt;

    const baseRender = render;
    render = function entryTableRender(...args) {
      applyEntryTableDefaults();
      const result = baseRender.apply(this, args);
      setTimeout(() => { applyVisibleColumnDom(); updateTableSwitcher(); }, 0);
      return result;
    };
    window.render = render;
  }

  function applyVisibleColumnDom() {
    try {
      const visible = new Set(getVisibleKeys());
      const template = visibleTemplate();
      const width = visibleWidth();
      document.documentElement.style.setProperty('--planner-fields-width', `${width}px`);
      document.documentElement.style.setProperty('--planner-field-template', template);

      document.querySelectorAll('.planner-fields-heading').forEach((heading) => {
        heading.style.width = `${width}px`;
        heading.style.gridTemplateColumns = template;
      });

      document.querySelectorAll('.planner-fields').forEach((fields) => {
        fields.style.width = `${width}px`;
        fields.style.gridTemplateColumns = template;
        const cells = Array.from(fields.children).filter((child) => child.classList?.contains('planner-cell'));
        FIELD_COLUMNS.forEach((column, index) => {
          const cell = cells[index];
          if (!cell) return;
          const show = visible.has(column.key);
          cell.hidden = !show;
          cell.style.display = show ? '' : 'none';
          cell.dataset.columnKey = column.key;
        });
      });

      document.querySelectorAll('.baseline-grid-cell').forEach((cell) => {
        const key = BASELINE_KEYS.find((item) => cell.classList.contains(`baseline-${item}`));
        if (!key) return;
        const show = visible.has(key);
        cell.hidden = !show;
        cell.style.display = show ? '' : 'none';
      });
    } catch {}
  }

  function mark(type, data) {
    try {
      const dbg = window.__mppDebug;
      if (dbg?.events) {
        dbg.events.push({ t: `${Math.round(performance.now())}ms`, type, data: data || {} });
        dbg.events = dbg.events.slice(-80);
        dbg.lastResult = data || dbg.lastResult;
      }
      console.log('[MPP]', type, data || {});
    } catch {}
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot, { once: true }) : boot();
})();