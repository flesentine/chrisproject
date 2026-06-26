#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const corpusPath = path.join(root, 'mpp-internet-corpus.json');
const outPath = path.join(root, 'mpp-internet-corpus-report.json');

const sandbox = {
  console,
  TextDecoder,
  TextEncoder,
  Uint8Array,
  ArrayBuffer,
  DataView,
  Map,
  Set,
  Date,
  Math,
  RegExp,
  JSON,
  Number,
  String,
  Boolean,
  Promise,
  URL,
  setTimeout,
  clearTimeout,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = {
  currentScript: null,
  body: { appendChild: loadScriptNode },
  documentElement: { appendChild: loadScriptNode },
  createElement(tag) {
    return { tagName: tag, src: '', async: false, defer: false };
  },
};

const context = vm.createContext(sandbox);

function loadScript(file) {
  const full = path.join(root, file);
  const code = fs.readFileSync(full, 'utf8');
  vm.runInContext(code, context, { filename: file });
}

function loadScriptNode(node) {
  if (node?.src) loadScript(node.src);
  return node;
}

function isOle(buffer) {
  const b = new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength));
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  return sig.every((value, index) => b[index] === value);
}

function count(text, tag) {
  return String(text || '').split('<' + tag).length - 1;
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
    checks: checks.map(([name, passed, weight]) => ({ name, passed, weight })),
  };
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

async function readMpp(buffer, name) {
  const reader = context.NativeMppReader;
  if (reader.readBufferAsync) return reader.readBufferAsync(buffer, name);
  return reader.readBuffer(buffer, name);
}

async function runOne(source) {
  const start = Date.now();
  try {
    const response = await fetch(source.url);
    if (!response.ok) throw new Error(`Fetch failed: HTTP ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (!isOle(buffer)) throw new Error('Not an OLE/CFB Microsoft Project binary');
    const parsed = await readMpp(buffer, source.name || 'internet.mpp');
    return {
      id: source.id,
      name: source.name,
      focus: source.focus,
      url: source.url,
      status: 'passed',
      elapsedMs: Date.now() - start,
      bytes: buffer.byteLength,
      warnings: parsed.warnings || [],
      diagnostics: compact(parsed),
      ...score(parsed),
    };
  } catch (error) {
    return {
      id: source.id,
      name: source.name,
      focus: source.focus,
      url: source.url,
      status: 'failed',
      elapsedMs: Date.now() - start,
      score: 0,
      warnings: [error?.message || String(error)],
    };
  }
}

async function main() {
  loadScript('mpp-native-reader.js');
  loadScript('mpp-native-reader-import-polish.js');
  loadScript('mpp-native-reader-resource-names-polish.js');

  const corpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  const sources = Array.isArray(corpus.sources) ? corpus.sources : [];
  const report = {
    version: '0.1.0-node-mpp-internet-corpus-runner',
    startedAt: new Date().toISOString(),
    corpusCount: sources.length,
    results: [],
  };

  for (const source of sources) {
    process.stdout.write(`Testing ${source.name} ... `);
    const result = await runOne(source);
    report.results.push(result);
    console.log(`${result.status} ${result.score || 0}% (${result.tasks || 0} tasks, ${result.resources || 0} resources, ${result.assignments || 0} assignments)`);
  }

  report.finishedAt = new Date().toISOString();
  report.passed = report.results.filter((result) => result.status === 'passed').length;
  report.failed = report.results.filter((result) => result.status === 'failed').length;
  report.averageScore = report.results.length ? Math.round(report.results.reduce((sum, result) => sum + Number(result.score || 0), 0) / report.results.length) : 0;
  report.totalAssignments = report.results.reduce((sum, result) => sum + Number(result.assignments || 0), 0);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${path.relative(root, outPath)}`);
  console.log(`Passed ${report.passed}/${report.corpusCount}; average score ${report.averageScore}%; assignments ${report.totalAssignments}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
