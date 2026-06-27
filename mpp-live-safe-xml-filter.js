(() => {
  'use strict';

  const R = window.NativeMppReader;
  if (!R || window.__liveMppSafeXmlFilterLoaded) return;
  window.__liveMppSafeXmlFilterLoaded = true;

  const VERSION = '0.4.0-live-mpp-safe-xml-filter-placeholders';
  const MAX_TASKS = 250;

  const previousReadBufferAsync = R.readBufferAsync?.bind(R);
  const previousRead = R.read?.bind(R);

  if (previousReadBufferAsync) {
    R.readBufferAsync = async function filteredReadBufferAsync(buffer, name = 'project.mpp') {
      const result = await previousReadBufferAsync(buffer, name);
      return filterLiveResult(result, name || 'project.mpp');
    };
  }

  if (previousRead) {
    R.read = async function filteredRead(file) {
      const result = await previousRead(file);
      return filterLiveResult(result, file?.name || 'project.mpp');
    };
  }

  R.liveMppSafeXmlFilterVersion = VERSION;
  mark('live-safe-xml-filter-installed', { version: VERSION });

  function filterLiveResult(result, fileName) {
    if (!result || typeof result !== 'object' || !result.projectXml) return result;

    const sourceTasks = Array.isArray(result.draftProject?.tasks) && result.draftProject.tasks.length
      ? result.draftProject.tasks
      : parseTasksFromXml(result.projectXml);

    const seen = new Set();
    const kept = [];
    const droppedNames = [];

    for (const task of sourceTasks) {
      const name = cleanName(task?.name);
      if (!isRealTaskName(name)) {
        droppedNames.push(name || '(blank)');
        continue;
      }
      const key = name.toLowerCase();
      const isRepeatedFieldValue = seen.has(key) && /^no\s+.*date$/i.test(name);
      if (isRepeatedFieldValue) {
        droppedNames.push(name);
        continue;
      }
      seen.add(key);
      const outlineNumber = cleanName(task.outlineNumber || task.outline_number || task.wbs || '');
      const outlineLevel = inferOutlineLevel(task, outlineNumber);
      kept.push({ name, outlineLevel, outlineNumber });
      if (kept.length >= MAX_TASKS) break;
    }

    const projectName = cleanName(result.draftProject?.name || result.fileName || fileName || 'Recovered MPP');
    const startDate = nextWorkingIso(new Date());
    result.projectXml = buildSafeProjectXml(projectName, startDate, kept);
    result.liveImportMode = 'safe-xml-filtered-handoff';
    result.draftProject = {
      ...(result.draftProject || {}),
      name: projectName,
      start: startDate,
      taskCount: kept.length,
      tasks: kept,
    };
    result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
    result.warnings.unshift(`Live MPP cleanup ${VERSION}: dropped ${droppedNames.length} non-task/generated row${droppedNames.length === 1 ? '' : 's'} and rebuilt safe working-day dates.`);
    result.importPolish = {
      ...(result.importPolish || {}),
      liveMppSafeXmlFilterVersion: VERSION,
      liveMppDroppedRows: droppedNames.length,
      liveMppLoadedRows: kept.length,
      liveMppDroppedNames: droppedNames.slice(0, 40),
    };

    mark('live-safe-xml-filter-applied', {
      version: VERSION,
      sourceTasks: sourceTasks.length,
      kept: kept.length,
      dropped: droppedNames.length,
      droppedNames: droppedNames.slice(0, 20),
      firstTask: kept[0]?.name || '',
      lastTask: kept[kept.length - 1]?.name || '',
      outlineLevels: histogram(kept.map((task) => task.outlineLevel || 1)),
      startDate,
    });

    return result;
  }

  function isRealTaskName(name) {
    const n = cleanName(name);
    if (!n || n.length < 3) return false;
    if (/^task\s+\d+$/i.test(n)) return false;
    if (/^recovered\s+task\s+\d+$/i.test(n)) return false;
    if (/^mpp\s+task\s+\d+$/i.test(n)) return false;
    if (/^no\s+program\s+baseline\s+date$/i.test(n)) return false;
    if (/^no\s+.*baseline.*date$/i.test(n)) return false;
    if (/^(program\s+)?baseline\s+(date|start|finish|duration|cost|work)$/i.test(n)) return false;
    if (/^(baseline|baseline date|start variance|finish variance|duration variance|cost variance)$/i.test(n)) return false;
    if (/^(task name|resource name|start|finish|duration|work|cost|calendar|notes|predecessors|successors)$/i.test(n)) return false;
    if (/^(yes|no|none|null|true|false)$/i.test(n)) return false;
    if (/^\d+(?:\.\d+)?$/.test(n)) return false;
    return /[A-Za-z\p{L}]/u.test(n);
  }

  function inferOutlineLevel(task, outlineNumber) {
    const wbs = cleanName(outlineNumber).replace(/\s+/g, '');
    if (/^\d+(?:\.\d+)*$/.test(wbs)) return Math.max(1, Math.min(20, wbs.split('.').length));
    return clampInt(task.outlineLevel || task.outline_level || 1, 1, 20);
  }

  function buildSafeProjectXml(projectName, startDate, tasks) {
    const projectStart = `${startDate}T08:00:00`;
    const lastDate = workingDateForIndex(startDate, Math.max(0, tasks.length - 1));
    const projectFinish = `${lastDate}T17:00:00`;
    const taskXml = tasks.map((task, index) => {
      const day = workingDateForIndex(startDate, index);
      const uid = index + 1;
      const outlineNumber = cleanName(task.outlineNumber).replace(/\s+/g, '') || String(uid);
      const outlineLevel = inferOutlineLevel(task, outlineNumber);
      return `    <Task>\n      <UID>${uid}</UID>\n      <ID>${uid}</ID>\n      <Name>${xmlEsc(task.name)}</Name>\n      <Type>1</Type>\n      <IsNull>0</IsNull>\n      <CreateDate>${projectStart}</CreateDate>\n      <WBS>${xmlEsc(outlineNumber)}</WBS>\n      <OutlineNumber>${xmlEsc(outlineNumber)}</OutlineNumber>\n      <OutlineLevel>${outlineLevel}</OutlineLevel>\n      <Start>${day}T08:00:00</Start>\n      <Finish>${day}T17:00:00</Finish>\n      <Duration>PT8H0M0S</Duration>\n      <DurationFormat>7</DurationFormat>\n      <Work>PT0H0M0S</Work>\n      <PercentComplete>0</PercentComplete>\n      <Summary>0</Summary>\n      <Milestone>0</Milestone>\n      <Priority>500</Priority>\n      <Active>1</Active>\n      <Manual>0</Manual>\n    </Task>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<Project xmlns="http://schemas.microsoft.com/project">\n  <Name>${xmlEsc(projectName)}</Name>\n  <Title>${xmlEsc(projectName)}</Title>\n  <ScheduleFromStart>1</ScheduleFromStart>\n  <StartDate>${projectStart}</StartDate>\n  <FinishDate>${projectFinish}</FinishDate>\n  <CalendarUID>1</CalendarUID>\n  <MinutesPerDay>480</MinutesPerDay>\n  <MinutesPerWeek>2400</MinutesPerWeek>\n  <DaysPerMonth>20</DaysPerMonth>\n  <DefaultStartTime>08:00:00</DefaultStartTime>\n  <DefaultFinishTime>17:00:00</DefaultFinishTime>\n  <Tasks>\n${taskXml}\n  </Tasks>\n</Project>`;
  }

  function parseTasksFromXml(xml) {
    const tasks = [];
    String(xml || '').replace(/<Task>([\s\S]*?)<\/Task>/g, (_match, body) => {
      const name = unesc(child(body, 'Name'));
      if (name) tasks.push({ name, outlineLevel: Number(child(body, 'OutlineLevel')) || 1, outlineNumber: unesc(child(body, 'OutlineNumber') || child(body, 'WBS') || '') });
      return _match;
    });
    return tasks;
  }

  function child(body, tag) {
    const match = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`).exec(body || '');
    return match ? match[1].trim() : '';
  }

  function nextWorkingIso(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    while (!isWorkingDay(d)) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function workingDateForIndex(startIso, index) {
    const d = new Date(`${startIso}T00:00:00Z`);
    let remaining = Number(index || 0);
    while (remaining > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (isWorkingDay(d)) remaining -= 1;
    }
    return d.toISOString().slice(0, 10);
  }

  function isWorkingDay(d) { const day = d.getUTCDay(); return day >= 1 && day <= 5; }
  function cleanName(value) { return String(value || '').replace(/\.mpp$/i, '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180); }
  function clampInt(value, min, max) { const n = Math.round(Number(value) || min); return Math.max(min, Math.min(max, n)); }
  function histogram(values) { return values.reduce((acc, value) => { const key = String(value || 1); acc[key] = (acc[key] || 0) + 1; return acc; }, {}); }

  function mark(type, data) {
    try {
      const dbg = window.__mppDebug;
      if (dbg?.events) {
        dbg.events.push({ t: `${Math.round(performance.now())}ms`, type, data: data || {} });
        dbg.events = dbg.events.slice(-80);
        dbg.lastResult = data || dbg.lastResult;
      }
      console.log('[MPP]', type, data || {});
    } catch {}
  }

  function xmlEsc(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch])); }
  function unesc(value) { return String(value || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, '\n').replace(/&amp;/g, '&'); }
})();
