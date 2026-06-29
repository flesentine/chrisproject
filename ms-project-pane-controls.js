(() => {
  'use strict';

  const VERSION = 'v0.44.1';
  if (window.__msProjectPaneControlsLoaded === VERSION) return;
  window.__msProjectPaneControlsLoaded = VERSION;

  const ENTRY_KEYS = ['id', 'indicators', 'name', 'duration', 'start', 'finish', 'predecessors', 'actions'];
  let tries = 0;

  boot();
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot, { once: true }) : setTimeout(boot, 0);

  function ready() {
    return typeof FIELD_COLUMNS !== 'undefined' && Array.isArray(FIELD_COLUMNS) &&
      typeof uiPrefs !== 'undefined' && typeof renderGantt === 'function' &&
      typeof getFieldPaneWidth === 'function' && typeof setFieldPaneWidth === 'function';
  }

  function boot() {
    if (!ready()) {
      if (++tries < 240) setTimeout(boot, 60);
      return;
    }
    patchFieldPaneMath();
    patchRenderers();
    installStyles();
    installSplitterDoubleClick();
    applyProjectPaneDom();
    [40, 100, 220, 500, 1000, 1800, 3200].forEach((delay) => setTimeout(() => {
      patchFieldPaneMath();
      applyProjectPaneDom();
    }, delay));
  }

  function visibleKeys(prefs = uiPrefs) {
    const configured = Array.isArray(prefs.visibleFieldKeys) && prefs.visibleFieldKeys.length ? prefs.visibleFieldKeys : ENTRY_KEYS;
    const existing = new Set(FIELD_COLUMNS.map((column) => column.key));
    const keys = configured.filter((key) => existing.has(key));
    return keys.length ? keys : ENTRY_KEYS.filter((key) => existing.has(key));
  }

  function visibleColumns(prefs = uiPrefs) {
    const keys = new Set(visibleKeys(prefs));
    return FIELD_COLUMNS.filter((column) => keys.has(column.key));
  }

  function columnWidth(column, prefs = uiPrefs) {
    return Number(prefs.fieldColumns && prefs.fieldColumns[column.key]) || Number(column.defaultWidth) || 80;
  }

  function visibleWidth(prefs = uiPrefs) {
    return visibleColumns(prefs).reduce((sum, column) => sum + columnWidth(column, prefs), 0);
  }

  function visibleTemplate(prefs = uiPrefs) {
    return visibleColumns(prefs).map((column) => `${columnWidth(column, prefs)}px`).join(' ');
  }

  function minPaneWidth(prefs = uiPrefs) {
    return Math.min(visibleWidth(prefs), 220);
  }

  function clampPaneWidth(value, prefs = uiPrefs) {
    const total = Math.max(1, visibleWidth(prefs));
    const min = minPaneWidth(prefs);
    const fallback = Math.min(total, Math.max(min, Math.round((window.innerWidth || 1280) * 0.38)));
    const n = Number(value);
    const raw = Number.isFinite(n) ? n : fallback;
    return Math.max(min, Math.min(total, Math.round(raw)));
  }

  function patchFieldPaneMath() {
    getVisibleFieldKeys = visibleKeys;
    getVisibleFieldColumns = visibleColumns;
    window.getVisibleFieldKeys = visibleKeys;
    window.getVisibleFieldColumns = visibleColumns;

    getTotalFieldColumnWidth = function getTotalFieldColumnWidthProjectPane(prefs = uiPrefs) {
      return Math.max(1, visibleWidth(prefs));
    };
    window.getTotalFieldColumnWidth = getTotalFieldColumnWidth;

    getFieldGridTemplate = function getFieldGridTemplateProjectPane() {
      return visibleTemplate(uiPrefs);
    };
    window.getFieldGridTemplate = getFieldGridTemplate;

    getFieldPaneWidth = function getFieldPaneWidthProjectPane(prefs = uiPrefs) {
      return clampPaneWidth(prefs.fieldPaneWidth, prefs);
    };
    window.getFieldPaneWidth = getFieldPaneWidth;

    setFieldPaneWidth = function setFieldPaneWidthProjectPane(width) {
      uiPrefs.fieldPaneWidth = clampPaneWidth(width, uiPrefs);
    };
    window.setFieldPaneWidth = setFieldPaneWidth;

    isFieldPaneClipped = function isFieldPaneClippedProjectPane() {
      return getFieldPaneWidth() < getTotalFieldColumnWidth() - 1;
    };
    window.isFieldPaneClipped = isFieldPaneClipped;

    renderFieldHeadingCells = function renderFieldHeadingCellsProjectPane() {
      return visibleColumns().map((column) => {
        const width = columnWidth(column);
        const classes = ['field-heading-cell'];
        if (column.label && width <= 88) classes.push('is-skinny');
        if (column.label && column.label.length > 2 && width <= 68) classes.push('is-vertical');
        return `<div class="${classes.join(' ')}" data-column-key="${escapeHtml(column.key)}" title="Drag edge to resize ${escapeHtml(column.label || 'column')}"><span>${escapeHtml(column.label)}</span><i class="column-resize-handle" data-column-resize="${escapeHtml(column.key)}" aria-hidden="true"></i></div>`;
      }).join('');
    };
    window.renderFieldHeadingCells = renderFieldHeadingCells;
  }

  function patchRenderers() {
    if (window.__msProjectPaneRenderPatched === VERSION) return;
    window.__msProjectPaneRenderPatched = VERSION;

    const baseRenderGantt = renderGantt;
    renderGantt = function projectPaneRenderGantt(...args) {
      patchFieldPaneMath();
      const result = baseRenderGantt.apply(this, args);
      requestAnimationFrame(applyProjectPaneDom);
      setTimeout(applyProjectPaneDom, 80);
      return result;
    };
    window.renderGantt = renderGantt;

    if (typeof render === 'function') {
      const baseRender = render;
      render = function projectPaneRender(...args) {
        patchFieldPaneMath();
        const result = baseRender.apply(this, args);
        requestAnimationFrame(applyProjectPaneDom);
        setTimeout(applyProjectPaneDom, 80);
        return result;
      };
      window.render = render;
    }
  }

  function installStyles() {
    let style = document.getElementById('msProjectPaneControlsStyles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'msProjectPaneControlsStyles';
      document.head.appendChild(style);
    }
    style.textContent = `
      .planner-fields-heading.is-clipped,
      .planner-fields.is-clipped { overflow:hidden !important; }
      .pane-splitter { cursor: col-resize !important; touch-action:none !important; width:14px !important; right:-7px !important; z-index:99 !important; opacity:1 !important; }
      .pane-splitter::after { content:""; position:absolute; top:0; bottom:0; left:6px; border-left:2px solid #6b7280; }
      body.is-column-resizing, body.is-column-resizing * { cursor: col-resize !important; user-select:none !important; }
    `;
  }

  function installSplitterDoubleClick() {
    if (window.__msProjectPaneSplitterDblClick) return;
    window.__msProjectPaneSplitterDblClick = true;
    document.addEventListener('dblclick', (event) => {
      const splitter = event.target && event.target.closest && event.target.closest('[data-pane-splitter]');
      if (!splitter || typeof uiPrefs === 'undefined') return;
      event.preventDefault();
      uiPrefs.fieldPaneWidth = getTotalFieldColumnWidth();
      try { if (typeof saveUiPrefs === 'function') saveUiPrefs(); } catch {}
      try { if (typeof applyUiPrefs === 'function') applyUiPrefs(); } catch {}
      try { if (typeof renderGantt === 'function') renderGantt(); } catch { applyProjectPaneDom(); }
    }, true);
  }

  function applyProjectPaneDom() {
    if (!ready()) return;
    patchFieldPaneMath();

    const paneWidth = getFieldPaneWidth();
    const totalWidth = getTotalFieldColumnWidth();
    const template = getFieldGridTemplate();
    const clipped = paneWidth < totalWidth - 1;
    const visible = new Set(visibleKeys());

    document.documentElement.style.setProperty('--planner-fields-width', `${paneWidth}px`);
    document.documentElement.style.setProperty('--planner-field-template', template);

    document.querySelectorAll('.planner-fields-heading').forEach((heading) => {
      heading.style.width = `${paneWidth}px`;
      heading.style.gridTemplateColumns = template;
      heading.classList.toggle('is-clipped', clipped);
      const splitter = heading.querySelector('[data-pane-splitter]');
      if (splitter) splitter.title = clipped ? 'Drag right to reveal task columns. Double-click to show all columns.' : 'Drag left to hide task columns.';
    });

    document.querySelectorAll('.planner-fields').forEach((fields) => {
      fields.style.width = `${paneWidth}px`;
      fields.style.gridTemplateColumns = template;
      fields.classList.toggle('is-clipped', clipped);
      const cells = Array.from(fields.children).filter((child) => child.classList && child.classList.contains('planner-cell'));
      FIELD_COLUMNS.forEach((column, index) => {
        const cell = cells[index];
        if (!cell) return;
        const show = visible.has(column.key);
        cell.hidden = !show;
        cell.style.display = show ? '' : 'none';
        cell.dataset.columnKey = column.key;
      });
    });

    keepGanttWidthAligned(paneWidth);
  }

  function keepGanttWidthAligned(paneWidth) {
    const scroll = document.querySelector('.planner-scroll');
    const timeline = document.getElementById('timeline');
    const gantt = document.getElementById('gantt');
    const dates = timeline && timeline.querySelector('.planner-dates-heading');
    if (!scroll || !timeline || !gantt || !dates) return;
    const dateWidth = parseFloat(dates.style.width || '0') || dates.getBoundingClientRect().width || 0;
    const chartWidth = Math.max(dateWidth, scroll.clientWidth - paneWidth - 1);
    dates.style.width = `${chartWidth}px`;
    timeline.style.width = `${paneWidth + chartWidth}px`;
    gantt.style.width = `${paneWidth + chartWidth}px`;
    document.querySelectorAll('.planner-row').forEach((row) => {
      row.style.width = `${paneWidth + chartWidth}px`;
      const ganttRow = row.querySelector('.gantt-row');
      if (ganttRow) ganttRow.style.width = `${chartWidth}px`;
    });
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
})();
