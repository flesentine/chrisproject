(() => {
  'use strict';

  const VERSION = 'v0.49.0';
  if (window.__msProjectStatusStripLoaded === VERSION) return;
  window.__msProjectStatusStripLoaded = VERSION;

  let tries = 0;

  boot();
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : setTimeout(boot, 0);

  function ready() {
    return typeof validateProject === 'function' && typeof renderValidation === 'function' && typeof els !== 'undefined' && els.validationPanel;
  }

  function boot() {
    if (!ready()) {
      if (++tries < 220) setTimeout(boot, 60);
      return;
    }
    installStyles();
    installStatusBadge();
    patchValidation();
    setTimeout(() => {
      try { renderValidation(); } catch {}
    }, 0);
  }

  function patchValidation() {
    if (window.__msProjectStatusStripRenderPatched === VERSION) return;
    window.__msProjectStatusStripRenderPatched = VERSION;

    renderValidation = function compactProjectRenderValidation() {
      const issues = validateProject();
      const panel = els.validationPanel;
      if (!panel) return;

      if (!issues.length) {
        panel.hidden = true;
        panel.innerHTML = '';
        panel.classList.remove('has-export-issues');
        panel.classList.add('is-export-ready');
        document.body.classList.add('is-export-ready');
        document.body.classList.remove('has-export-issues');
        updateBadge('Ready', 'Supported fields are clean and ready to export.');
        return;
      }

      panel.hidden = false;
      panel.classList.remove('is-export-ready');
      panel.classList.add('has-export-issues');
      document.body.classList.remove('is-export-ready');
      document.body.classList.add('has-export-issues');
      updateBadge(`${issues.length} issue${issues.length === 1 ? '' : 's'}`, 'Fix export issues before exporting.');
      panel.innerHTML = `
        <div class="validation-card warn compact-export-warning">
          <div>
            <p><strong>${issues.length} thing${issues.length === 1 ? '' : 's'} to fix before export.</strong> Auto Schedule can fix most dependency timing issues, including lag/lead.</p>
            <ul>${issues.slice(0, 5).map((issue) => `<li>${esc(issue)}</li>`).join('')}</ul>
          </div>
        </div>`;
    };
    window.renderValidation = renderValidation;
  }

  function installStatusBadge() {
    if (document.getElementById('projectExportReadyBadge')) return;
    const header = document.querySelector('.unified-card > .card-header') || document.querySelector('.work-card > .card-header');
    if (!header) return;
    const badge = document.createElement('span');
    badge.id = 'projectExportReadyBadge';
    badge.className = 'project-export-ready-badge';
    badge.textContent = 'Ready';
    badge.title = 'Supported fields are clean and ready to export.';
    header.appendChild(badge);
  }

  function updateBadge(text, title) {
    installStatusBadge();
    const badge = document.getElementById('projectExportReadyBadge');
    if (!badge) return;
    badge.textContent = text;
    badge.title = title || text;
    badge.classList.toggle('has-issues', /issue/i.test(text));
  }

  function installStyles() {
    let style = document.getElementById('msProjectStatusStripStyles');
    if (!style) {
      style = document.createElement('style');
      style.id = 'msProjectStatusStripStyles';
      document.head.appendChild(style);
    }
    style.textContent = `
      body.projecthub-stitch-theme.is-export-ready .validation-panel.is-export-ready,
      body.projecthub-stitch-theme .validation-panel.is-export-ready {
        display: none !important;
      }

      body.projecthub-stitch-theme .project-export-ready-badge {
        margin-left: auto;
        display: inline-flex;
        align-items: center;
        height: 20px;
        padding: 0 8px;
        border: 1px solid #9ed7b7;
        border-radius: 10px;
        background: #ecfdf3;
        color: #14532d;
        font-size: 11px;
        font-weight: 800;
        white-space: nowrap;
      }

      body.projecthub-stitch-theme .project-export-ready-badge::before {
        content: '✓';
        margin-right: 5px;
        font-weight: 900;
      }

      body.projecthub-stitch-theme .project-export-ready-badge.has-issues {
        border-color: #fbbf24;
        background: #fffbeb;
        color: #92400e;
      }

      body.projecthub-stitch-theme .project-export-ready-badge.has-issues::before {
        content: '!';
      }

      body.projecthub-stitch-theme .validation-panel.has-export-issues {
        margin: 4px 6px !important;
        padding: 0 !important;
      }

      body.projecthub-stitch-theme .compact-export-warning {
        min-height: 34px !important;
        padding: 7px 10px !important;
        border-radius: 3px !important;
      }

      body.projecthub-stitch-theme .compact-export-warning p {
        margin: 0 0 3px !important;
        font-size: 11px !important;
      }

      body.projecthub-stitch-theme .compact-export-warning ul {
        margin: 0 !important;
        padding-left: 18px !important;
        font-size: 11px !important;
      }
    `;
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }
})();
