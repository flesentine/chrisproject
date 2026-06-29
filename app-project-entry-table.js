(() => {
  'use strict';

  const VERSION = '0.1.0-project-entry-table-default';
  const ENTRY_KEYS = ['id', 'indicators', 'name', 'duration', 'start', 'finish', 'predecessors', 'actions'];
  const BASELINE_KEYS = ['baselineStart', 'baselineFinish', 'baselineDuration', 'startVariance', 'finishVariance', 'durationVariance'];
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
    installTableModel();
    patchColumnFunctions();
    patchRenderers();
    applyEntryTableDefaults();
    applyVisibleColumnDom();
    mark('project-entry-table-installed', { version: VERSION, visibleFieldKeys: getVisibleKeys() });
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
      try { render(); } catch { applyVisibleColumnDom(); }
    };
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
      const total = getTotalFieldColumnWidth(prefs);
      const min = Math.min(typeof MIN_FIELD_PANE_WIDTH === 'number' ? MIN_FIELD_PANE_WIDTH : 260, total);
      const width = Number(prefs.fieldPaneWidth);
      return Math.max(min, Math.min(total, Number.isFinite(width) ? width : total));
    };

    setFieldPaneWidth = function patchedSetFieldPaneWidth(width) {
      const total = getTotalFieldColumnWidth();
      const min = Math.min(typeof MIN_FIELD_PANE_WIDTH === 'number' ? MIN_FIELD_PANE_WIDTH : 260, total);
      uiPrefs.fieldPaneWidth = Math.max(min, Math.min(total, Number(width) || total));
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
      return result;
    };
    window.renderGantt = renderGantt;

    const baseRender = render;
    render = function entryTableRender(...args) {
      applyEntryTableDefaults();
      const result = baseRender.apply(this, args);
      setTimeout(applyVisibleColumnDom, 0);
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
