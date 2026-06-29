(() => {
  'use strict';

  if (window.__mppImportOrchestratorLoaded) return;
  window.__mppImportOrchestratorLoaded = true;

  const VERSION = '0.1.11-mpp-import-orchestrator-varmeta';
  const MODULES = [
    'mpp-native-task-skeleton-v2-polish.js',
    'mpp-native-task-varmeta-names-polish.js',
    'mpp-native-task-dates-polish.js',
    'mpp-native-task-fixed-dates-polish.js',
    'mpp-native-resource-table-v2-polish.js',
    'mpp-native-assignment-table-v3-polish.js',
    'mpp-native-date-sanity-polish.js',
    'app-resource-leveling.js',
    'app-resource-auto-leveling.js',
    'app-progress-xml-work-import.js',
    'app-baseline-xml-import.js',
    'app-baseline-multi-xml-import.js',
    'app-baseline-multi-audit.js',
    'app-resource-xml-import.js',
    'app-links-xml-import.js',
    'app-task-calendar-xml-import.js',
    'app-view-metadata-xml-import.js',
    'app-view-metadata-audit.js',
    'app-agile-metadata-xml-import.js',
    'app-sprint-board-audit.js',
    'app-assignment-link-audit-panel.js',
    'app-mpp-compat-regression.js',
    'app-mpp-worker-import.js',
    'app-current-version-label.js',
  ];

  const loaded = new Set();
  let tries = 0;

  function boot() {
    if (!ready()) {
      if (++tries < 180) setTimeout(boot, 75);
      return;
    }
    loadModules();
    patchMppImport();
    installClickHandlers();
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', boot, { once: true })
    : boot();

  function ready() {
    return typeof state !== 'undefined' && typeof render === 'function';
  }

  function loadModules() {
    MODULES.forEach(loadScriptOnce);
  }

  function loadScriptOnce(src) {
    if (!src || loaded.has(src) || document.querySelector(`script[src="${cssEscape(src)}"]`)) return;
    loaded.add(src);
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.dataset.mppOrchestrated = VERSION;
    document.body.appendChild(script);
  }

  function patchMppImport() {
    if (window.__mppImportOrchestratorPatched || typeof importProjectMppLocal !== 'function') return;
    window.__mppImportOrchestratorPatched = true;
    const base = importProjectMppLocal;
    importProjectMppLocal = async function orchestratedMppImport(...args) {
      const result = await base.apply(this, args);
      setTimeout(() => {
        buildFullAudit(result || window.__lastMppImportResult || null);
        renderPanel();
      }, 220);
      return result;
    };
    window.importProjectMppLocal = importProjectMppLocal;
  }

  function buildFullAudit(result) {
    const importResult = result || window.__lastMppImportResult || {};
    state.mppImportAudit = {
      version: VERSION,
      createdAt: new Date().toISOString(),
      source: importResult.sourceFile || 'imported.mpp',
      nativeImportPolish: importResult.importPolish || null,
      nativeTaskSkeleton: importResult.nativeTaskSkeleton || null,
      nativeTaskSkeletonDiagnostics: importResult.nativeTaskSkeletonDiagnostics || null,
      nativeTaskDates: importResult.nativeTaskDates || null,
      nativeTaskFixedDates: importResult.nativeTaskFixedDates || null,
      nativeDateSanity: importResult.nativeDateSanity || null,
      nativeResources: importResult.nativeResourceTableV2 || null,
      nativeAssignments: importResult.nativeAssignmentTableV3 || null,
      nativeTableCoverage: importResult.nativeTable?.fieldCoverage || null,
      outline: importResult.importNativeOutlineSpans || null,
      dependencies: importResult.importDependencyAudit || null,
      assignmentResources: importResult.importAssignmentResources || null,
      assignmentMappingV2: importResult.importAssignmentMappingV2 || null,
      assignmentLinkEvidence: importResult.importAssignmentLinkAudit || null,
      resourceNames: importResult.importResourceNames || null,
      progress: state.progressXmlImportAudit || null,
      baselines: state.baselineXmlImportAudit || null,
      multipleBaselines: state.baselineMultiXmlImportAudit || null,
      resources: state.resourceXmlImportAudit || null,
      resourceLeveling: state.resourceLevelingAudit || null,
      compatibilityReport: state.mppCompatibilityReport || null,
      links: state.linksXmlImportAudit || null,
      taskCalendars: state.taskCalendarXmlImportAudit || null,
      viewMetadata: state.projectViewMetadata || null,
      sprintBoardMetadata: state.projectAgileMetadata || null,
      formulas: state.customFieldFormulaStats || null,
      formulaBridge: state.customFieldFormulaBridge || null,
      warnings: importResult.warnings || [],
    };
  }

  function renderPanel() {
    const panel = document.getElementById('mppPanel');
    const audit = state.mppImportAudit;
    if (!panel || !audit || document.getElementById('mppFullImportAuditPanel')) return;
    const rows = summarize(audit);
    panel.insertAdjacentHTML('beforeend', `
      <div id="mppFullImportAuditPanel" class="mpp-audit mpp-full-audit">
        <b>Full import audit</b>
        ${rows.map((row) => `<span><strong>${escapeHtml(row[0])}</strong>${escapeHtml(row[1])}</span>`).join('')}
        <button type="button" data-mpp-full-audit-download="1">Download full import audit</button>
      </div>`);
  }

  function summarize(audit) {
    const rows = [];
    if (audit.nativeTaskSkeleton) rows.push(['Task skeleton', `${audit.nativeTaskSkeleton.taskRows || 0} rows, ${audit.nativeTaskSkeleton.namedRows || 0} named`]);
    if (audit.nativeTaskDates) rows.push(['Task dates', `${audit.nativeTaskDates.appliedRows || 0} applied, ${audit.nativeTaskDates.confidence || 'none'}`]);
    if (audit.nativeTaskFixedDates) rows.push(['Fixed dates', `${audit.nativeTaskFixedDates.appliedRows || 0} applied, ${audit.nativeTaskFixedDates.confidence || 'none'}`]);
    if (audit.nativeDateSanity?.rejected) rows.push(['Date safety', `rejected unsafe ${audit.nativeDateSanity.spanDays || 0}d range`]);
    if (audit.nativeResources) rows.push(['Native resources', `${audit.nativeResources.rows || 0} rows, ${audit.nativeResources.namedRows || 0} named`]);
    if (audit.nativeAssignments) rows.push(['Native assignments', `${audit.nativeAssignments.appliedAssignments || 0} applied, ${audit.nativeAssignments.confidence || 0}% confidence`]);
    if (audit.progress) rows.push(['Progress', `${audit.progress.tasksApplied || 0} tasks`]);
    if (audit.baselines) rows.push(['Baselines', `${audit.baselineFieldsApplied || audit.baselines.baselineFieldsApplied || 0} primary`]);
    if (audit.multipleBaselines) rows.push(['Multi-baselines', `${audit.multipleBaselines.alternate || 0} alternate records`]);
    if (audit.resources) rows.push(['Resources', `${audit.resources.resourcesApplied || 0} metadata`]);
    if (audit.resourceLeveling) rows.push(['Resource leveling', `${audit.resourceLeveling.taskMoves || 0} task-day moves`]);
    if (audit.compatibilityReport) rows.push(['Compatibility', `${audit.compatibilityReport.score || 0}% score`]);
    if (audit.links) rows.push(['Notes/links', `${audit.links.tasksApplied || 0} tasks`]);
    if (audit.taskCalendars) rows.push(['Task calendars', `${audit.taskCalendars.tasksApplied || 0} tasks`]);
    if (audit.viewMetadata) rows.push(['Views/tables', `${audit.viewMetadata.viewCount || 0} views, ${audit.viewMetadata.tableCount || 0} tables`]);
    if (audit.sprintBoardMetadata) rows.push(['Sprint board', `${audit.sprintBoardMetadata.sprintCount || 0} sprints, ${audit.sprintBoardMetadata.boardColumnCount || 0} columns`]);
    if (audit.assignmentMappingV2) rows.push(['Assignment v2', `${audit.assignmentMappingV2.appliedMappings || 0} applied, ${audit.assignmentMappingV2.unresolved || 0} unresolved, ${audit.assignmentMappingV2.confidence || 0}% confidence`]);
    else if (audit.assignmentLinkEvidence) rows.push(['Assignment links', `${audit.assignmentLinkEvidence.candidateFields?.length || 0} candidate fields`]);
    if (!rows.length) rows.push(['Result', 'Import completed; no extra audit modules reported data']);
    return rows;
  }

  function installClickHandlers() {
    document.addEventListener('click', (event) => {
      if (event.target?.dataset?.mppFullAuditDownload) downloadFullAudit();
    });
  }

  function downloadFullAudit() {
    if (!state.mppImportAudit) buildFullAudit(window.__lastMppImportResult || null);
    const blob = new Blob([JSON.stringify(state.mppImportAudit || {}, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mpp-full-import-audit.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function cssEscape(value) {
    return String(value).replace(/"/g, '\\"');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }
})();