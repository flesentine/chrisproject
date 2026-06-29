(() => {
  'use strict';

  const VERSION = 'v0.42.0';
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

  const KEEP_ICON_TITLES = /note|notes|hyperlink|link|deadline|constraint|warning|baseline|actual|progress|complete|calendar|milestone|attachment|error|info/i;

  boot();
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : setTimeout(boot, 0);

  function boot() {
    ensureCssLoaded();
    setCompactDefaults();
    cleanNow();
    patchRender();
    installObserver();
    [50, 150, 350, 800, 1600].forEach((delay) => setTimeout(cleanNow, delay));
  }

  function ensureCssLoaded() {
    if (document.getElementById('msProjectLayoutSweepCss')) return;
    const link = document.createElement('link');
    link.id = 'msProjectLayoutSweepCss';
    link.rel = 'stylesheet';
    link.href = `ms-project-layout-sweep.css?${VERSION}`;
    document.head.appendChild(link);
  }

  function setCompactDefaults() {
    const root = document.documentElement;
    root.style.setProperty('--msp-row-height', '30px');
    root.style.setProperty('--msp-header-height', '25px');

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

  function patchRender() {
    if (window.__msProjectLayoutSweepRenderPatched || typeof render !== 'function') return;
    window.__msProjectLayoutSweepRenderPatched = true;
    const baseRender = render;
    render = function msProjectLayoutSweepRender(...args) {
      const result = baseRender.apply(this, args);
      requestAnimationFrame(cleanNow);
      setTimeout(cleanNow, 80);
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

  function cleanNow() {
    document.body.classList.add('projecthub-stitch-theme', 'ms-project-classic-theme', 'ms-project-layout-sweep-active');
    cleanIndicatorsColumn();
    compactHeaders();
    compactRows();
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
      const cells = [...row.children];
      const byData = cells.find((cell) => String(cell.dataset?.field || cell.dataset?.columnKey || '').toLowerCase() === 'indicators');
      if (byData) candidates.add(byData);
      else if (cells.length > 1) candidates.add(cells[1]);
    });

    candidates.forEach(cleanIndicatorCell);
  }

  function cleanIndicatorCell(cell) {
    if (!cell || cell.dataset.msProjectIndicatorsCleaned === VERSION) return;
    cell.dataset.msProjectIndicatorsCleaned = VERSION;
    cell.classList.add('ms-project-indicators-cell');

    [...cell.querySelectorAll('*')].forEach((node) => {
      const text = normalizedText(node);
      const title = `${node.getAttribute('title') || ''} ${node.getAttribute('aria-label') || ''}`.trim();
      const className = String(node.className || '');

      if (shouldRemoveIndicatorNode(text, title, className)) {
        node.remove();
        return;
      }

      if (text && text.length > 2 && !KEEP_ICON_TITLES.test(title) && !/^[!⚠⚑◆◇•●○✓✕📎🔗📝]$/.test(text)) {
        const icon = iconFor(title || text, className);
        if (icon) {
          node.textContent = icon;
          node.title = title || text;
          node.setAttribute('aria-label', title || text);
        }
      }
    });

    [...cell.childNodes].forEach((node) => {
      if (node.nodeType !== Node.TEXT_NODE) return;
      const text = normalizedText(node);
      if (!text) return;
      if (TEXT_BADGE_PATTERNS.some((pattern) => pattern.test(text))) node.remove();
    });

    const visibleText = normalizedText(cell);
    if (visibleText && TEXT_BADGE_PATTERNS.some((pattern) => pattern.test(visibleText))) {
      cell.textContent = '';
    }
  }

  function shouldRemoveIndicatorNode(text, title, className) {
    const combined = `${text} ${title} ${className}`.trim();
    if (!combined) return false;
    if (/critical|task-type|fixed-units|fixed-duration|fixed-work|leveling|delay|slack|resource-chip|assignment-chip/i.test(className)) return true;
    if (TEXT_BADGE_PATTERNS.some((pattern) => pattern.test(text))) return true;
    if (/^delay\b/i.test(text) || /^slack\b/i.test(text)) return true;
    if (/critical path|fixed units|fixed duration|fixed work|leveling delay|total slack|free slack/i.test(title)) return true;
    return false;
  }

  function iconFor(text, className) {
    const combined = `${text} ${className}`;
    if (/warning|constraint|deadline|late|miss/i.test(combined)) return '!';
    if (/note/i.test(combined)) return '📝';
    if (/hyperlink|link/i.test(combined)) return '🔗';
    if (/baseline/i.test(combined)) return '◇';
    if (/progress|actual|complete/i.test(combined)) return '✓';
    if (/milestone/i.test(combined)) return '◆';
    return '';
  }

  function normalizedText(node) {
    return String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  }
})();
