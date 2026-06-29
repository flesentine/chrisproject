(() => {
  'use strict';

  const VERSION = 'v0.44.2';
  if (window.__msProjectPaneControlsLoaded === VERSION) return;
  window.__msProjectPaneControlsLoaded = VERSION;

  const ENTRY_KEYS = ['id', 'indicators', 'name', 'duration', 'start', 'finish', 'predecessors', 'actions'];
  let tries = 0;
  let activePaneDrag = null;

  boot();
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot, { once: true }) : setTimeout(boot, 0);

  function ready() {
    return typeof FIELD_COLUMNS !== 'undefined' && Array.isArray(FIELD_COLUMNS) &&
      typeof uiPrefs !== 'undefined' && typeof renderGantt === 'function' &&
      typeof getFieldPaneWidth === 'function' && typeof setFieldPaneWidth === 'function';
  }

  function boot() {
    if (!ready()) {
      if (++tries < 260) setTimeout(boot, 60);
      return;
    }
    patchFieldPaneMath();
    patchRenderers();
    installStyles();
    installDirectSplitterDrag();
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
      .pane-splitter { cursor: col-resize !important; touch-action:none !important; width:20px !important; right:-10px !important; z-index:999 !important; opacity:1 !important; pointer-events:auto !important; }
      .pane-splitter::after { content:""; position:absolute; top:0; bottom:0; left:9px; border-left:2px solid #2563eb; }
      .pane-splitter:hover::after { border-left-color:#1d4ed8; }
      body.is-column-resizing, body.is-column-resizing * { cursor: col-resize !important; user-select:none !important; }

      body.projecthub-stitch-theme .project-ribbon-shell { overflow: visible !important; z-index: 5000 !important; }
      body.projecthub-stitch-theme .project-titlebar,
      body.projecthub-stitch-theme .ribbon-tabs,
      body.projecthub-stitch-theme .office-ribbon,
      body.projecthub-stitch-theme .compact-ribbon,
      body.projecthub-stitch-theme .ribbon-panel,
      body.projecthub-stitch-theme .command-group,
      body.projecthub-stitch-theme .compact-group,
      body.projecthub-stitch-theme .ms-task-ribbon,
      body.projecthub-stitch-theme .ms-project-ribbon,
      body.projecthub-stitch-theme .ms-task-ribbon .command-group,
      body.projecthub-stitch-theme .ms-project-ribbon .command-group { overflow: visible !important; }
      body.projecthub-stitch-theme .office-ribbon,
      body.projecthub-stitch-theme .compact-ribbon,
      body.projecthub-stitch-theme .ribbon-panel.is-active,
      body.projecthub-stitch-theme .command-group:has(details[open]),
      body.projecthub-stitch-theme .compact-group:has(details[open]) { position: relative !important; z-index: 5100 !important; }
      body.projecthub-stitch-theme .ribbon-menu,
      body.projecthub-stitch-theme .ms-ribbon-menu { position: relative !important; overflow: visible !important; z-index: 5200 !important; }
      body.projecthub-stitch-theme .ribbon-menu[open],
      body.projecthub-stitch-theme .ms-ribbon-menu[open] { z-index: 8000 !important; }
      body.projecthub-stitch-theme .ribbon-menu > summary,
      body.projecthub-stitch-theme .ms-ribbon-menu > summary { position: relative !important; z-index: 2 !important; }
      body.projecthub-stitch-theme .ribbon-menu-popover,
      body.projecthub-stitch-theme .ms-ribbon-popover {
        position: absolute !important;
        top: calc(100% + 6px) !important;
        left: 0 !important;
        z-index: 9000 !important;
        display: grid !important;
        gap: 6px !important;
        min-width: 220px !important;
        max-width: min(420px, calc(100vw - 24px)) !important;
        max-height: min(70vh, 460px) !important;
        overflow: auto !important;
        padding: 10px !important;
        border: 1px solid #b8c6d8 !important;
        border-radius: 4px !important;
        background: #fff !important;
        box-shadow: 0 16px 38px rgba(15, 23, 42, 0.24) !important;
        color: #111827 !important;
      }
      body.projecthub-stitch-theme .ribbon-menu-popover .file-button,
      body.projecthub-stitch-theme .ribbon-menu-popover button,
      body.projecthub-stitch-theme .ribbon-menu-popover a,
      body.projecthub-stitch-theme .ms-ribbon-popover button,
      body.projecthub-stitch-theme .ms-ribbon-popover a {
        width: 100% !important;
        justify-content: flex-start !important;
        text-align: left !important;
        min-height: 28px !important;
        padding: 5px 8px !important;
        font-size: 12px !important;
      }
      body.projecthub-stitch-theme main,
      body.projecthub-stitch-theme .validation-panel,
      body.projecthub-stitch-theme .workspace,
      body.projecthub-stitch-theme .unified-card { position: relative !important; z-index: 1 !important; }
    `;
  }

  function installDirectSplitterDrag() {
    if (window.__msProjectPaneDirectDrag === VERSION) return;
    window.__msProjectPaneDirectDrag = VERSION;

    document.addEventListener('pointerdown', (event) => {
      const target = event.target && event.target.closest && event.target.closest('[data-pane-splitter]');
      if (!target || !ready()) return;
      if (event.button !== undefined && event.button !== 0) return;
      patchFieldPaneMath();
      activePaneDrag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: getFieldPaneWidth(),
      };
      document.body.classList.add('is-column-resizing');
      target.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }, true);

    window.addEventListener('pointermove', (event) => {
      if (!activePaneDrag) return;
      const delta = event.clientX - activePaneDrag.startX;
      setPaneWidthImmediate(activePaneDrag.startWidth + delta);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }, true);

    window.addEventListener('pointerup', endDirectSplitterDrag, true);
    window.addEventListener('pointercancel', endDirectSplitterDrag, true);
  }

  function endDirectSplitterDrag(event) {
    if (!activePaneDrag) return;
    activePaneDrag = null;
    document.body.classList.remove('is-column-resizing');
    try { if (typeof saveUiPrefs === 'function') saveUiPrefs(); } catch {}
    try { if (typeof applyUiPrefs === 'function') applyUiPrefs(); } catch {}
    applyProjectPaneDom();
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }

  function setPaneWidthImmediate(width) {
    patchFieldPaneMath();
    uiPrefs.fieldPaneWidth = clampPaneWidth(width, uiPrefs);
    document.documentElement.style.setProperty('--planner-fields-width', `${uiPrefs.fieldPaneWidth}px`);
    applyProjectPaneDom();
  }

  function installSplitterDoubleClick() {
    if (window.__msProjectPaneSplitterDblClick) return;
    window.__msProjectPaneSplitterDblClick = true;
    document.addEventListener('dblclick', (event) => {
      const splitter = event.target && event.target.closest && event.target.closest('[data-pane-splitter]');
      if (!splitter || typeof uiPrefs === 'undefined') return;
      event.preventDefault();
      event.stopPropagation();
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
