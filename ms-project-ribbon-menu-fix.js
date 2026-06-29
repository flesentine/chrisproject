(() => {
  'use strict';

  const VERSION = 'v0.45.0';
  if (window.__msProjectRibbonMenuFixLoaded === VERSION) return;
  window.__msProjectRibbonMenuFixLoaded = VERSION;

  installStyles();
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', installStyles, { once: true })
    : setTimeout(installStyles, 0);

  function installStyles() {
    let style = document.getElementById('msProjectRibbonMenuFixStyles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'msProjectRibbonMenuFixStyles';
      document.head.appendChild(style);
    }

    style.textContent = `
      body.projecthub-stitch-theme .project-ribbon-shell {
        overflow: visible !important;
        z-index: 5000 !important;
      }

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
      body.projecthub-stitch-theme .ms-project-ribbon .command-group {
        overflow: visible !important;
      }

      body.projecthub-stitch-theme .office-ribbon,
      body.projecthub-stitch-theme .compact-ribbon,
      body.projecthub-stitch-theme .ribbon-panel.is-active,
      body.projecthub-stitch-theme .command-group:has(details[open]),
      body.projecthub-stitch-theme .compact-group:has(details[open]) {
        position: relative !important;
        z-index: 5100 !important;
      }

      body.projecthub-stitch-theme .ribbon-menu,
      body.projecthub-stitch-theme .ms-ribbon-menu {
        position: relative !important;
        overflow: visible !important;
        z-index: 5200 !important;
      }

      body.projecthub-stitch-theme .ribbon-menu[open],
      body.projecthub-stitch-theme .ms-ribbon-menu[open] {
        z-index: 8000 !important;
      }

      body.projecthub-stitch-theme .ribbon-menu > summary,
      body.projecthub-stitch-theme .ms-ribbon-menu > summary {
        position: relative !important;
        z-index: 2 !important;
      }

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
      body.projecthub-stitch-theme .unified-card {
        position: relative !important;
        z-index: 1 !important;
      }
    `;
  }
})();
