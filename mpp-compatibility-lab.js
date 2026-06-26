(() => {
  'use strict';

  let corpus = [];
  let results = [];
  let startedAt = '';
  let finishedAt = '';

  const byId = (id) => document.getElementById(id);

  document.addEventListener('DOMContentLoaded', init, { once: true });

  async function init() {
    byId('runCorpusBtn')?.addEventListener('click', runCorpus);
    byId('downloadReportBtn')?.addEventListener('click', downloadReport);
    try {
      const response = await fetch('mpp-internet-corpus.json', { cache: 'no-cache' });
      const data = await response.json();
      corpus = Array.isArray(data.sources) ? data.sources : [];
      results = corpus.map((source) => ({ source, status: 'queued', score: 0 }));
      render();
    } catch (error) {
      results = [{ source: { name: 'mpp-internet-corpus.json', focus: 'corpus file' }, status: 'failed', score: 0, warnings: [message(error)] }];
      render();
    }
  }

  async function runCorpus() {
    if (!window.NativeMppReader) {
      alert('NativeMppReader is not loaded.');
      return;
    }
    startedAt = new Date().toISOString();
    finishedAt = '';
    results = [];
    setButtons(true);
    render();
    for (const source of corpus) {
      const row = { source, status: 'running', score: 0 };
      results.push(row);
      render();
      Object.assign(row, await runOne(source));
      render();
    }
    finishedAt = new Date().toISOString();
    setButtons(false);
    render();
  }

  async function runOne(source) {
    const startMs = performance.now();
    try {
      const response = await fetch(source.url, { cache: 'no-store' });
      if (!response.ok) throw new Error('Fetch failed: HTTP ' + response.status);
      const buffer = await response.arrayBuffer();
      if (!isOle(buffer)) throw new Error('Not an OLE/CFB Microsoft Project binary.');
      const parsed = await readMpp(buffer, source.name || 'internet.mpp');
      return {
        status: 'passed',
        elapsedMs: Math.round(performance.now() - startMs),
        bytes: buffer.byteLength,
        warnings: parsed.warnings || [],
        diagnostics: compact(parsed),
        ...score(parsed),
      };
    } catch (error) {
      return {
        status: 'failed',
        elapsedMs: Math.round(performance.now() - startMs),
        score: 0,
        warnings: [message(error)],
      };
    }
  }

  async function readMpp(buffer, name) {
    if (NativeMppReader.readBufferAsync) return NativeMppReader.readBufferAsync(buffer, name);
    return NativeMppReader.readBuffer(buffer, name);
  }

  function isOle(buffer) {
    const b = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
    const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    return sig.every((value, index) => b[index] === value);
  }

  function score(parsed) {
    const xml = String(parsed.projectXml || '');
    const tasks = parsed.project?.tasks?.length || count(xml, 'Task');
    const resources = parsed.project?.resources?.length || count(xml, 'Resource');
    const assignmentV2 = parsed.importAssignmentMappingV2 || {};
    const assignments = Math.max(count(xml, 'Assignment'), assignmentV2.appliedMappings || 0);
    const links = parsed.importDependencyAudit?.links || parsed.nativeTable?.fieldCoverage?.dependencyLinks || 0;
    const calendars = count(xml, 'Calendar');
    const baselines = parsed.importPolish?.baselineSnapshots || 0;
    const actuals = parsed.importPolish?.actuals || 0;
    const checks = [
      ['opened', true, 15],
      ['tasks', tasks > 0, 20],
      ['dates', Boolean(parsed.project?.projectStart || xml.includes('<Start>')), 10],
      ['resources', resources > 0, 10],
      ['assignments', assignments > 0, 15],
      ['dependencies', links > 0, 10],
      ['calendars', calendars > 0, 8],
      ['baselines', baselines > 0, 6],
      ['actuals', actuals > 0, 6],
    ];
    const max = checks.reduce((sum, check) => sum + check[2], 0);
    const earned = checks.filter((check) => check[1]).reduce((sum, check) => sum + check[2], 0);
    return {
      score: Math.round((earned / max) * 100),
      tasks,
      resources,
      assignments,
      dependencyLinks: links,
      calendars,
      baselines,
      actuals,
      assignmentMappingV2: assignmentV2,
      checks: checks.map((check) => ({ name: check[0], passed: check[1], weight: check[2] })),
    };
  }

  function count(text, tag) {
    return String(text || '').split('<' + tag).length - 1;
  }

  function compact(parsed) {
    return {
      readerVersion: parsed.readerVersion || '',
      sourceFile: parsed.sourceFile || '',
      fieldCoverage: parsed.nativeTable?.fieldCoverage || {},
      importPolish: parsed.importPolish || {},
      assignmentMappingV2: parsed.importAssignmentMappingV2 || null,
      assignmentResources: parsed.importAssignmentResources || null,
      assignmentLinkAudit: parsed.importAssignmentLinkAudit || null,
    };
  }

  function render() {
    renderSummary();
    const body = byId('labResults');
    if (!body) return;
    body.textContent = '';
    if (!results.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.textContent = 'Loading corpus...';
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }
    results.forEach((result) => body.appendChild(rowNode(result)));
  }

  function rowNode(result) {
    const row = document.createElement('tr');
    const source = result.source || {};
    addCell(row, source.name || source.id || 'MPP file', source.focus || '');
    addCell(row, result.status || 'queued', '', statusClass(result.status));
    addCell(row, result.status === 'passed' ? result.score + '%' : '—');
    addCell(row, value(result.tasks));
    addCell(row, value(result.resources));
    addCell(row, assignmentText(result));
    addCell(row, (result.warnings || []).slice(0, 2).join(' '), '', 'lab-warnings');
    return row;
  }

  function addCell(row, main, sub = '', className = '') {
    const cell = document.createElement('td');
    if (className) cell.className = className;
    const strong = document.createElement('strong');
    strong.textContent = String(main ?? '');
    cell.appendChild(strong);
    if (sub) {
      cell.appendChild(document.createElement('br'));
      const small = document.createElement('small');
      small.textContent = String(sub);
      cell.appendChild(small);
    }
    row.appendChild(cell);
  }

  function renderSummary() {
    const done = results.filter((row) => row.status === 'passed' || row.status === 'failed');
    const passed = results.filter((row) => row.status === 'passed').length;
    const failed = results.filter((row) => row.status === 'failed').length;
    const avg = done.length ? Math.round(done.reduce((sum, row) => sum + Number(row.score || 0), 0) / done.length) : 0;
    const assignments = done.reduce((sum, row) => sum + Number(row.assignments || 0), 0);
    setText('labFiles', String(corpus.length || results.length));
    setText('labPassed', String(passed));
    setText('labFailed', String(failed));
    setText('labScore', avg + '%');
    setText('labAssignments', String(assignments));
  }

  function assignmentText(result) {
    if (result.status !== 'passed') return '—';
    const mapped = result.assignmentMappingV2?.appliedMappings || 0;
    return mapped ? `${result.assignments || 0} (${mapped} v2)` : String(result.assignments || 0);
  }

  function statusClass(status) {
    if (status === 'passed') return 'lab-status-pass';
    if (status === 'failed') return 'lab-status-fail';
    return 'lab-status-run';
  }

  function value(input) {
    return input == null ? '—' : String(input);
  }

  function setText(id, text) {
    const node = byId(id);
    if (node) node.textContent = text;
  }

  function setButtons(running) {
    if (byId('runCorpusBtn')) byId('runCorpusBtn').disabled = running;
    if (byId('downloadReportBtn')) byId('downloadReportBtn').disabled = running || !results.length;
  }

  function downloadReport() {
    const report = {
      version: '0.1.0-browser-mpp-corpus-runner',
      startedAt,
      finishedAt: finishedAt || new Date().toISOString(),
      corpusCount: corpus.length,
      results,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'mpp-internet-corpus-report.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function message(error) {
    return error && error.message ? error.message : String(error || 'Unknown error');
  }

  window.__mppInternetCorpusReport = () => ({ startedAt, finishedAt, corpus, results });
})();
