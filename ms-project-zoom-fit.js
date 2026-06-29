(() => {
  'use strict';

  const VERSION = 'v0.46.0';
  if (window.__msProjectZoomFitLoaded === VERSION) return;
  window.__msProjectZoomFitLoaded = VERSION;

  let tries = 0;

  boot();
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : setTimeout(boot, 0);

  function ready() {
    return typeof state !== 'undefined' && typeof uiPrefs !== 'undefined' && typeof renderGantt === 'function';
  }

  function boot() {
    if (!ready()) {
      if (++tries < 220) setTimeout(boot, 60);
      return;
    }
    installStyles();
    installViewControls();
    patchZoomSlider();
    exposeApi();
  }

  function installStyles() {
    let style = document.getElementById('msProjectZoomFitStyles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'msProjectZoomFitStyles';
      document.head.appendChild(style);
    }
    style.textContent = `
      body.projecthub-stitch-theme .ms-project-zoom-fit-button {
        border-color: #94a3b8 !important;
        background: #ffffff !important;
        color: #1f2937 !important;
        font-weight: 750 !important;
      }
      body.projecthub-stitch-theme .ms-project-zoom-fit-button:hover {
        border-color: #2563eb !important;
        color: #1d4ed8 !important;
      }
      body.projecthub-stitch-theme .planner-date-cell.is-zoomed-out {
        font-size: 8px !important;
        letter-spacing: 0 !important;
      }
      body.projecthub-stitch-theme .planner-date-cell.is-zoomed-out span {
        display: none !important;
      }
      body.projecthub-stitch-theme .planner-date-cell.is-zoomed-out strong {
        writing-mode: vertical-rl;
        transform: rotate(180deg);
        line-height: 1;
      }
    `;
  }

  function installViewControls() {
    const viewPanel = document.querySelector('[data-ribbon-panel="view"]');
    if (!viewPanel || document.getElementById('zoomToEntireProjectBtn')) return;

    const group = document.createElement('div');
    group.className = 'command-group compact-group ms-project-zoom-fit-group';
    group.innerHTML = `
      <span class="group-label">Zoom</span>
      <button id="zoomToEntireProjectBtn" class="ms-project-zoom-fit-button" type="button" title="Zoom the timescale so the full project fits in the Gantt pane">Entire Project</button>
      <button id="zoomInGanttBtn" type="button" title="Zoom in the Gantt timescale">Zoom +</button>
      <button id="zoomOutGanttBtn" type="button" title="Zoom out the Gantt timescale">Zoom −</button>`;
    viewPanel.appendChild(group);

    document.getElementById('zoomToEntireProjectBtn')?.addEventListener('click', () => zoomToEntireProject());
    document.getElementById('zoomInGanttBtn')?.addEventListener('click', () => changeZoom(6));
    document.getElementById('zoomOutGanttBtn')?.addEventListener('click', () => changeZoom(-6));
  }

  function patchZoomSlider() {
    const slider = document.getElementById('dayWidthControl');
    if (!slider || slider.dataset.zoomFitPatched === VERSION) return;
    slider.dataset.zoomFitPatched = VERSION;
    slider.min = '12';
    slider.max = '140';
    slider.step = '1';
    slider.addEventListener('input', () => {
      const width = clamp(Number(slider.value), 12, 140);
      uiPrefs.dayWidth = width;
      if (typeof saveUiPrefs === 'function') saveUiPrefs();
      if (typeof applyUiPrefs === 'function') applyUiPrefs();
      if (typeof renderGantt === 'function') renderGantt();
      updateZoomLabel(width);
      requestAnimationFrame(polishTinyDateHeaders);
    });
  }

  function exposeApi() {
    window.zoomToEntireProject = zoomToEntireProject;
    window.zoomGanttToFit = zoomToEntireProject;
  }

  function changeZoom(delta) {
    const current = Number(uiPrefs.dayWidth) || 46;
    setDayWidth(current + delta, false);
  }

  function zoomToEntireProject() {
    const range = getProjectDateRange();
    if (!range) return;
    const available = getAvailableGanttWidth();
    const days = Math.max(1, daysBetween(range.start, range.finish));
    const target = Math.floor(available / days);
    const width = clamp(target, 12, 140);
    setDayWidth(width, true);
  }

  function setDayWidth(width, fit) {
    uiPrefs.dayWidth = clamp(width, 12, 140);
    if (typeof saveUiPrefs === 'function') saveUiPrefs();
    if (typeof applyUiPrefs === 'function') applyUiPrefs();
    if (typeof renderGantt === 'function') renderGantt();
    const scroll = document.querySelector('.planner-scroll');
    if (scroll && fit) scroll.scrollLeft = 0;
    updateZoomLabel(uiPrefs.dayWidth, fit);
    requestAnimationFrame(polishTinyDateHeaders);
  }

  function updateZoomLabel(width = uiPrefs.dayWidth, fit = false) {
    const label = document.getElementById('dayWidthValue');
    if (!label) return;
    if (fit) label.textContent = 'Entire Project';
    else if (width <= 22) label.textContent = 'Very Compact';
    else if (width <= 48) label.textContent = 'Compact';
    else if (width >= 82) label.textContent = 'Wide';
    else label.textContent = 'Standard';
  }

  function getProjectDateRange() {
    const tasks = Array.isArray(state?.tasks) ? state.tasks : [];
    const dates = [];
    tasks.forEach((task) => {
      pushDate(dates, task?.start);
      pushDate(dates, task?.finish);
      pushDate(dates, task?.deadline);
      pushDate(dates, task?.constraintDate);
      pushDate(dates, task?.baseline?.start);
      pushDate(dates, task?.baseline?.finish);
    });
    if (!dates.length) return null;
    const start = addDays(new Date(Math.min(...dates.map(Number))), -1);
    const finish = addDays(new Date(Math.max(...dates.map(Number))), 2);
    return { start, finish };
  }

  function getAvailableGanttWidth() {
    const scroll = document.querySelector('.planner-scroll');
    const fields = document.querySelector('.planner-fields-heading');
    const leftWidth = Number(typeof getFieldPaneWidth === 'function' ? getFieldPaneWidth() : 0) || fields?.getBoundingClientRect().width || 0;
    const width = (scroll?.clientWidth || window.innerWidth || 1200) - leftWidth - 8;
    return Math.max(160, width);
  }

  function polishTinyDateHeaders() {
    const width = Number(uiPrefs.dayWidth) || 46;
    document.querySelectorAll('.planner-date-cell').forEach((cell) => {
      cell.classList.toggle('is-zoomed-out', width <= 24);
    });
  }

  function pushDate(list, value) {
    const date = parseDate(value);
    if (date) list.push(date);
  }

  function parseDate(value) {
    if (!value) return null;
    const text = String(value).slice(0, 10);
    const parts = text.split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function addDays(value, amount) {
    const date = parseDate(value) || new Date(value);
    date.setDate(date.getDate() + amount);
    return date;
  }

  function daysBetween(start, finish) {
    const s = parseDate(start);
    const f = parseDate(finish);
    if (!s || !f) return 1;
    return Math.max(1, Math.round((f - s) / 86400000) + 1);
  }

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
  }
})();
