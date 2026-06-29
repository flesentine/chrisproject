(() => {
  'use strict';

  const VERSION = 'v0.43.2';
  if (window.__msProjectLayoutSweepLoaded === VERSION) return;
  window.__msProjectLayoutSweepLoaded = VERSION;

  const TEXT_BADGE_PATTERNS = [
    /^critical$/i,
    /^near critical$/i,
    /^proj(?:ect)?$/i,
    /^eng(?:ineering)?$/i,
    /^qa(?:\s*tested?|\s*test)?$/i,
    /^cloud\s*la/i,
    /^fixed\s*units$/i,
    /^funits$/i,
    /^fixed\s*duration$/i,
    /^fdur(?:ation)?$/i,
    /^fixed\s*work$/i,
    /^fwork$/i,
    /^delay\s*-?\d+(?:\.\d+)?\s*[wdhm]?$/i,
    /^slack\s*-?\d+(?:\.\d+)?\s*[wdhm]?$/i,
    /^\d+(?:\.\d+)?\s*d$/i,
  ];

  const GRID_JUNK_SELECTOR = [
    '.planner-row .critical-slack-badge',
    '.planner-row .task-type-badge',
    '.planner-row .resource-conflict-badge',
    '.planner-row .gantt-leveling-label',
    '.planner-row .gantt-slack-bar',
    '.planner-row .leveling-delay-grid-cell',
    '.planner-row .summary-rollup-badge',
    '.planner-row .critical-path-chip',
    '.planner-row .task-type-chip',
    '.planner-row .leveling-delay-chip',
    '.planner-row .resource-chip',
    '.planner-row .assignment-test-chip',
    '.planner-row .custom-type-chip',
  ].join(',');

  boot();
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : setTimeout(boot, 0);

  function boot() {
    ensureCssLoaded();
    injectHardCleanCss();
    setCompactDefaults();
    forceEntryTable();
    cleanNow();
    patchRender();
    installObserver();
    installResizeHandler();
    [50, 150, 350, 800, 1600, 3200].forEach((delay) => setTimeout(cleanNow, delay));
  }

  function ensureCssLoaded() {
    if (document.getElementById('msProjectLayoutSweepCss')) return;
    const link = document.createElement('link');
    link.id = 'msProjectLayoutSweepCss';
    link.rel = 'stylesheet';
    link.href = `ms-project-layout-sweep.css?${VERSION}`;
    document.head.appendChild(link);
  }

  function injectHardCleanCss() {
    let style = document.getElementById('msProjectHardGridCleanStyles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'msProjectHardGridCleanStyles';
      document.head.appendChild(style);
    }
    style.textContent = `
      body.ms-project-layout-sweep-active .project-table-switcher { display:none !important; }
      body.ms-project-layout-sweep-active .planner-row .critical-slack-badge,
      body.ms-project-layout-sweep-active .planner-row .task-type-badge,
      body.ms-project-layout-sweep-active .planner-row .resource-conflict-badge,
      body.ms-project-layout-sweep-active .planner-row .gantt-leveling-label,
      body.ms-project-layout-sweep-active .planner-row .gantt-slack-bar,
      body.ms-project-layout-sweep-active .planner-row .leveling-delay-grid-cell,
      body.ms-project-layout-sweep-active .planner-row .summary-rollup-badge,
      body.ms-project-layout-sweep-active .planner-row .critical-path-chip,
      body.ms-project-layout-sweep-active .planner-row .task-type-chip,
      body.ms-project-layout-sweep-active .planner-row .leveling-delay-chip,
      body.ms-project-layout-sweep-active .planner-row .resource-chip,
      body.ms-project-layout-sweep-active .planner-row .assignment-test-chip,
      body.ms-project-layout-sweep-active .planner-row .custom-type-chip { display:none !important; }
      body.ms-project-layout-sweep-active .planner-row .task-name-cell > span:not(.summary-toggle-spacer):not(.constraint-warning-badge),
      body.ms-project-layout-sweep-active .planner-row .task-name-cell > small,
      body.ms-project-layout-sweep-active .planner-row .task-name-cell > em { display:none !important; }
      body.ms-project-layout-sweep-active .planner-row .task-name-cell { gap:2px !important; min-width:0 !important; }
      body.ms-project-layout-sweep-active .planner-row .name-input { min-width:0 !important; width:100% !important; }
      body.ms-project-layout-sweep-active .planner-row .indicator-dot.is-critical,
      body.ms-project-layout-sweep-active .planner-row .indicator-dot.is-slack,
      body.ms-project-layout-sweep-active .planner-row .indicator-dot.is-task-type,
      body.ms-project-layout-sweep-active .planner-row .indicator-dot.is-resource-leveling,
      body.ms-project-layout-sweep-active .planner-row .indicator-dot.is-leveling { display:none !important; }
      body.ms-project-layout-sweep-active .planner-row .planner-cell { overflow:hidden !important; }
      body.ms-project-layout-sweep-active .planner-dates-heading { background:#41464d !important; }
    `;
  }

  function setCompactDefaults() {
    document.documentElement.style.setProperty('--msp-row-height', '30px');
    document.documentElement.style.setProperty('--msp-header-height', '25px');

    const dayWidth = document.getElementById('dayWidthControl');
    if (dayWidth && !dayWidth.dataset.msProjectSweepDefaulted) {
      dayWidth.dataset.msProjectSweepDefaulted = '1';
      if (!dayWidth.value || Number(dayWidth.value) > 58) {
        dayWidth.value = '46';
        dayWidth.dispatchEvent(new Event('input', { bubbles: true }));
        dayWidth.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    const rowHeight = document.getElementById('rowHeightControl');
    if (rowHeight && !rowHeight.dataset.msProjectSweepDefaulted) {
      rowHeight.dataset.msProjectSweepDefaulted = '1';
      rowHeight.min = '30';
      if (!rowHeight.value || Number(rowHeight.value) > 34) {
        rowHeight.value = '30';
        rowHeight.dispatchEvent(new Event('input', { bubbles: true }));
        rowHeight.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  function forceEntryTable() {
    if (!window.FIELD_COLUMNS || !window.uiPrefs) return;
    const entryKeys = ['id', 'indicators', 'name', 'duration', 'start', 'finish', 'predecessors', 'actions'];
    const existing = new Set(FIELD_COLUMNS.map((column) => column.key));
    const visible = entryKeys.filter((key) => existing.has(key));
    if (visible.length) {
      uiPrefs.fieldTable = 'entry';
      uiPrefs.visibleFieldKeys = visible;
      try { if (typeof saveUiPrefs === 'function') saveUiPrefs(); } catch {}
      try { if (typeof applyUiPrefs === 'function') applyUiPrefs(); } catch {}
    }
  }

  function patchRender() {
    if (window.__msProjectLayoutSweepRenderPatched || typeof render !== 'function') return;
    window.__msProjectLayoutSweepRenderPatched = true;
    const baseRender = render;
    render = function msProjectLayoutSweepRender(...args) {
      const result = baseRender.apply(this, args);
      requestAnimationFrame(cleanNow);
      setTimeout(cleanNow, 60);
      setTimeout(cleanNow, 180);
      return result;
    };
    window.render = render;
  }

  function installObserver() {
    if (window.__msProjectLayoutSweepObserverInstalled) return;
    window.__msProjectLayoutSweepObserverInstalled = true;
    const target = document.getElementById('taskBody') || document.body;
    if (!target || typeof MutationObserver === 'undefined') return;
    let pending = false;
    const observer = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        cleanNow();
      });
    });
    observer.observe(target, { childList: true, subtree: true });
  }

  function installResizeHandler() {
    if (window.__msProjectLayoutSweepResizeInstalled) return;
    window.__msProjectLayoutSweepResizeInstalled = true;
    let pending = false;
    window.addEventListener('resize', () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        stretchTimelineToViewport();
      });
    });
  }

  function cleanNow() {
    document.body.classList.add('projecthub-stitch-theme', 'ms-project-classic-theme', 'ms-project-layout-sweep-active');
    forceEntryTable();
    removeGridJunk();
    cleanIndicatorsColumn();
    compactHeaders();
    compactRows();
    stretchTimelineToViewport();
  }

  function removeGridJunk() {
    document.querySelectorAll(GRID_JUNK_SELECTOR).forEach((node) => node.remove());

    document.querySelectorAll('.planner-row .task-name-cell').forEach((cell) => {
      [...cell.children].forEach((node) => {
        if (node.matches('input,button.summary-toggle,.summary-toggle-spacer,.constraint-warning-badge')) return;
        const text = normalizedText(node);
        const cls = String(node.className || '');
        if (/badge|chip|pill|slack|critical|task-type|resource|leveling/i.test(cls) || TEXT_BADGE_PATTERNS.some((pattern) => pattern.test(text))) node.remove();
      });
    });

    document.querySelectorAll('.planner-row .planner-cell').forEach((cell) => {
      [...cell.children].forEach((node) => {
        if (node.matches('input,select,button,.percent-cell,.task-name-cell,.id-pill,.indicator-button')) return;
        const text = normalizedText(node);
        const cls = String(node.className || '');
        if (/badge|chip|pill|leveling-delay|critical-slack|task-type/i.test(cls) || TEXT_BADGE_PATTERNS.some((pattern) => pattern.test(text))) node.remove();
      });
    });
  }

  function stretchTimelineToViewport() {
    const scroll = document.querySelector('.planner-scroll');
    const timeline = document.getElementById('timeline');
    const gantt = document.getElementById('gantt');
    const fieldsHeading = timeline?.querySelector('.planner-fields-heading');
    const datesHeading = timeline?.querySelector('.planner-dates-heading');
    if (!scroll || !timeline || !gantt || !fieldsHeading || !datesHeading) return;

    const leftWidth = px(fieldsHeading.style.width) || fieldsHeading.getBoundingClientRect().width || 0;
    const dayWidth = Math.max(24, Number(window.uiPrefs?.dayWidth) || firstDateCellWidth(datesHeading) || 46);
    const visibleChartWidth = Math.max(dayWidth, scroll.clientWidth - leftWidth - 1);
    const range = getRenderedDateRange();
    if (!range) return;

    const requiredDays = Math.max(1, Math.ceil(visibleChartWidth / dayWidth));
    const renderedDays = Math.max(range.totalDays, requiredDays);
    const chartWidth = renderedDays * dayWidth;
    const totalWidth = leftWidth + chartWidth;

    datesHeading.style.width = `${chartWidth}px`;
    datesHeading.style.gridTemplateColumns = `repeat(${renderedDays}, ${dayWidth}px)`;
    timeline.style.width = `${totalWidth}px`;
    gantt.style.width = `${totalWidth}px`;

    fillDateHeader(datesHeading, range.min, renderedDays, dayWidth);

    document.querySelectorAll('.planner-row').forEach((row) => {
      row.style.width = `${totalWidth}px`;
      const ganttRow = row.querySelector('.gantt-row');
      if (ganttRow) {
        ganttRow.style.width = `${chartWidth}px`;
        ganttRow.style.backgroundSize = `${dayWidth}px ${window.uiPrefs?.rowHeight || 30}px`;
      }
    });
  }

  function getRenderedDateRange() {
    const tasks = Array.isArray(window.state?.tasks) ? window.state.tasks : [];
    if (!tasks.length) return null;
    const starts = [];
    const finishes = [];
    tasks.forEach((task) => {
      pushDate(starts, task?.start);
      pushDate(finishes, task?.finish);
      pushDate(finishes, task?.deadline);
      pushDate(starts, task?.baseline?.start);
      pushDate(finishes, task?.baseline?.finish);
      pushDate(starts, task?.constraintDate);
      pushDate(finishes, task?.constraintDate);
    });
    if (!starts.length || !finishes.length) return null;
    const min = addDays(new Date(Math.min(...starts.map(Number))), -1);
    const max = addDays(new Date(Math.max(...finishes.map(Number))), 2);
    return { min, max, totalDays: Math.max(1, daysBetween(min, max)) };
  }

  function fillDateHeader(datesHeading, min, days, dayWidth) {
    const existing = datesHeading.querySelectorAll('.planner-date-cell').length;
    if (existing >= days) return;
    const fragment = document.createDocumentFragment();
    for (let i = existing; i < days; i += 1) {
      const d = addDays(min, i);
      const cell = document.createElement('div');
      cell.className = dateCellClass(d, dayWidth);
      cell.style.width = `${dayWidth}px`;
      cell.title = 'Timeline date';
      cell.innerHTML = `<strong>${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}</strong><span>${d.toLocaleDateString([], { weekday: 'short' })}</span>`;
      fragment.appendChild(cell);
    }
    datesHeading.appendChild(fragment);
  }

  function dateCellClass(date, dayWidth) {
    const classes = ['planner-date-cell'];
    if ([0, 6].includes(date.getDay())) classes.push('is-weekend');
    if (typeof window.isWorkingDay === 'function' && !window.isWorkingDay(date)) classes.push('is-nonworking');
    if (typeof window.isCalendarException === 'function' && window.isCalendarException(date)) classes.push('is-holiday');
    if (typeof window.toDateInputValue === 'function' && window.toDateInputValue(date) === window.today) classes.push('is-today');
    if (dayWidth <= 50) classes.push('is-vertical');
    else if (dayWidth <= 64) classes.push('is-skinny');
    return classes.join(' ');
  }

  function compactHeaders() {
    document.querySelectorAll('[data-column-key="indicators"], .field-heading-cell').forEach((el) => {
      const text = normalizedText(el);
      if (text === 'i' || /indicator/i.test(text)) {
        el.textContent = 'i';
        el.title = 'Indicators';
        el.setAttribute('aria-label', 'Indicators');
      }
    });
  }

  function compactRows() {
    document.querySelectorAll('.planner-row, .task-row').forEach((row) => {
      row.style.minHeight = '30px';
      row.style.height = '30px';
    });
  }

  function cleanIndicatorsColumn() {
    const candidates = new Set();
    document.querySelectorAll('[data-field="indicators"], [data-column-key="indicators"], .indicator-cell, .task-indicators, .row-indicators').forEach((el) => candidates.add(el));
    document.querySelectorAll('.planner-row, .task-row').forEach((row) => {
      const fieldCells = row.querySelectorAll('.planner-fields > .planner-cell');
      if (fieldCells[1]) candidates.add(fieldCells[1]);
    });
    candidates.forEach(cleanIndicatorCell);
  }

  function cleanIndicatorCell(cell) {
    if (!cell) return;
    cell.classList.add('ms-project-indicators-cell');
    [...cell.querySelectorAll('*')].forEach((node) => {
      const text = normalizedText(node);
      const title = `${node.getAttribute('title') || ''} ${node.getAttribute('aria-label') || ''}`.trim();
      const className = String(node.className || '');
      if (shouldRemoveIndicatorNode(text, title, className)) node.remove();
    });
  }

  function shouldRemoveIndicatorNode(text, title, className) {
    if (/critical|task-type|fixed-units|fixed-duration|fixed-work|leveling|delay|slack|resource-chip|assignment-chip/i.test(className)) return true;
    if (TEXT_BADGE_PATTERNS.some((pattern) => pattern.test(text))) return true;
    if (/critical path|fixed units|fixed duration|fixed work|leveling delay|total slack|free slack/i.test(title)) return true;
    return false;
  }

  function pushDate(list, value) {
    const date = parseDate(value);
    if (date) list.push(date);
  }

  function parseDate(value) {
    if (!value) return null;
    const text = String(value).slice(0, 10);
    const date = new Date(`${text}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function addDays(value, amount) {
    const date = new Date(value);
    date.setDate(date.getDate() + amount);
    return date;
  }

  function daysBetween(start, finish) {
    const ms = parseDate(finish)?.getTime() - parseDate(start)?.getTime();
    return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86400000) + 1) : 0;
  }

  function firstDateCellWidth(datesHeading) {
    const cell = datesHeading.querySelector('.planner-date-cell');
    return cell ? cell.getBoundingClientRect().width : 0;
  }

  function px(value) {
    const n = Number.parseFloat(String(value || '').replace('px', ''));
    return Number.isFinite(n) ? n : 0;
  }

  function normalizedText(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  }
})();
