(() => {
  'use strict';

  const R = window.NativeMppReader;
  if (!R || window.__nativeMppDateSanityLoaded) return;
  window.__nativeMppDateSanityLoaded = true;

  const VERSION = '0.1.0-native-date-sanity';
  const MAX_REASONABLE_PROJECT_DAYS = 365 * 20;
  const MAX_REASONABLE_TASK_DAYS = 365 * 10;
  const SAFE_START = '2026-01-01';
  const baseReadBuffer = R.readBuffer?.bind(R);
  const baseReadBufferAsync = R.readBufferAsync?.bind(R);
  const baseRead = R.read?.bind(R);

  if (baseReadBuffer) R.readBuffer = (buffer, name = 'project.mpp', options = {}) => sanitize(baseReadBuffer(buffer, name, options), name);
  if (baseReadBufferAsync) R.readBufferAsync = async (buffer, name = 'project.mpp') => sanitize(await baseReadBufferAsync(buffer, name), name);
  if (baseRead) R.read = async (file) => sanitize(await baseRead(file), file?.name || 'project.mpp');

  function sanitize(result, fileName) {
    const tasks = result?.project?.tasks || [];
    if (!result?.projectXml || !tasks.length) return result;
    const verdict = analyze(tasks);
    result.nativeDateSanity = { version: VERSION, ...verdict };
    result.nativeTable = result.nativeTable || {};
    result.nativeTable.fieldCoverage = {
      ...(result.nativeTable.fieldCoverage || {}),
      nativeDateSanityRejected: verdict.rejected ? 1 : 0,
      nativeDateSanitySpanDays: verdict.spanDays || 0,
      nativeDateSanityBadTaskRows: verdict.badTaskRows || 0,
    };
    if (!verdict.rejected) return result;

    const repaired = repairTasks(tasks, result.project?.name || fileName || 'Recovered MPP');
    result.projectXml = buildProjectXml(result.project?.name || fileName || 'Recovered MPP', repaired.tasks, result.projectXml);
    result.project = {
      ...(result.project || {}),
      start: repaired.start,
      taskCount: repaired.tasks.length,
      tasks: repaired.tasks,
    };
    if (result.nativeTaskFixedDates) result.nativeTaskFixedDates.rejectedBySanity = true;
    if (result.nativeTaskDates) result.nativeTaskDates.rejectedBySanity = true;
    result.warnings = result.warnings || [];
    result.warnings.unshift(`Rejected native MPP date guesses because they produced an unrealistic ${verdict.spanDays}-day range. Loaded bounded draft dates instead so the browser does not freeze.`);
    return result;
  }

  function analyze(tasks) {
    const rows = tasks.map((task) => {
      const start = dateOnly(task.start);
      const finish = dateOnly(task.finish);
      if (!start || !finish) return null;
      const days = Math.max(0, Math.round((finish - start) / 86400000) + 1);
      return { task, start, finish, days };
    }).filter(Boolean);
    if (!rows.length) return { rejected: false, reason: 'no dates', spanDays: 0, badTaskRows: 0 };
    const minStart = new Date(Math.min(...rows.map((row) => row.start.getTime())));
    const maxFinish = new Date(Math.max(...rows.map((row) => row.finish.getTime())));
    const spanDays = Math.max(0, Math.round((maxFinish - minStart) / 86400000) + 1);
    const badTaskRows = rows.filter((row) => row.days > MAX_REASONABLE_TASK_DAYS).length;
    const startsAtBase = rows.filter((row) => row.start.getUTCFullYear() <= 1985).length;
    const farFutureFinishes = rows.filter((row) => row.finish.getUTCFullYear() >= 2065).length;
    const baseFalsePositive = startsAtBase >= Math.max(3, Math.ceil(rows.length * 0.35)) && farFutureFinishes >= Math.max(1, Math.ceil(rows.length * 0.10));
    const rejected = spanDays > MAX_REASONABLE_PROJECT_DAYS || badTaskRows >= Math.max(2, Math.ceil(rows.length * 0.10)) || baseFalsePositive;
    return {
      rejected,
      reason: rejected ? (baseFalsePositive ? '1984-base false positive' : 'unrealistic range') : 'ok',
      spanDays,
      badTaskRows,
      startsAtBase,
      farFutureFinishes,
      minStart: iso(minStart),
      maxFinish: iso(maxFinish),
    };
  }

  function repairTasks(tasks, projectName) {
    let cursor = dateOnly(SAFE_START);
    const repaired = tasks.map((task, index) => {
      const isSummary = Boolean(task.isSummary);
      const duration = safeDurationDays(task);
      const start = addDays(cursor, index);
      const finish = addDays(start, Math.max(0, duration - 1));
      return {
        ...task,
        id: task.id || index + 1,
        uid: task.uid || index + 1,
        rowId: task.rowId || index + 1,
        name: task.name || `Task ${index + 1}`,
        start: iso(start),
        finish: iso(finish),
        durationDays: duration,
        durationMinutes: duration * 480,
        isSummary,
        nativeDateRejected: true,
      };
    });
    return { name: projectName, start: repaired[0]?.start || SAFE_START, tasks: repaired };
  }

  function safeDurationDays(task) {
    const raw = Number(task.durationDays);
    if (Number.isFinite(raw) && raw >= 0 && raw <= 60) return Math.max(1, Math.round(raw));
    const minutes = Number(task.durationMinutes);
    if (Number.isFinite(minutes) && minutes >= 0 && minutes <= 480 * 60) return Math.max(1, Math.round(minutes / 480));
    return 1;
  }

  function buildProjectXml(projectName, tasks, existingXml) {
    const created = new Date().toISOString().replace(/\.\d{3}Z$/, '');
    const start = tasks[0]?.start || SAFE_START;
    const finish = tasks[tasks.length - 1]?.finish || start;
    const resourcesBlock = (String(existingXml || '').match(/<Resources>[\s\S]*?<\/Resources>/) || [''])[0];
    const assignmentsBlock = (String(existingXml || '').match(/<Assignments>[\s\S]*?<\/Assignments>/) || [''])[0];
    const taskXml = tasks.map((task, index) => {
      const duration = Math.max(1, Number(task.durationDays) || 1);
      return `\n    <Task>\n      <UID>${index + 1}</UID>\n      <ID>${index + 1}</ID>\n      <Name>${esc(task.name)}</Name>\n      <Type>1</Type>\n      <IsNull>0</IsNull>\n      <CreateDate>${created}</CreateDate>\n      <WBS>${esc(task.wbs || String(index + 1))}</WBS>\n      <OutlineNumber>${esc(task.wbs || String(index + 1))}</OutlineNumber>\n      <OutlineLevel>${Math.max(1, Number(task.outlineLevel) || 1)}</OutlineLevel>\n      <Start>${task.start}T08:00:00</Start>\n      <Finish>${task.finish}T17:00:00</Finish>\n      <Duration>PT${duration * 8}H0M0S</Duration>\n      <DurationFormat>7</DurationFormat>\n      <Work>PT${duration * 8}H0M0S</Work>\n      <PercentComplete>${Math.max(0, Math.min(100, Number(task.percent) || 0))}</PercentComplete>\n      <Summary>${task.isSummary ? 1 : 0}</Summary>\n      <Manual>1</Manual>\n    </Task>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Project xmlns="http://schemas.microsoft.com/project">\n  <SaveVersion>12</SaveVersion>\n  <Name>${esc(projectName)}</Name>\n  <Title>${esc(projectName)}</Title>\n  <Subject>Recovered from native MPP with rejected unsafe date guesses</Subject>\n  <CreationDate>${created}</CreationDate>\n  <ScheduleFromStart>1</ScheduleFromStart>\n  <StartDate>${start}T08:00:00</StartDate>\n  <FinishDate>${finish}T17:00:00</FinishDate>\n  <CalendarUID>1</CalendarUID>\n  <DefaultStartTime>08:00:00</DefaultStartTime>\n  <DefaultFinishTime>17:00:00</DefaultFinishTime>\n  <MinutesPerDay>480</MinutesPerDay>\n  <MinutesPerWeek>2400</MinutesPerWeek>\n  <DaysPerMonth>20</DaysPerMonth>\n  <Tasks>${taskXml}\n  </Tasks>${resourcesBlock ? `\n  ${resourcesBlock}` : ''}${assignmentsBlock ? `\n  ${assignmentsBlock}` : ''}\n</Project>`;
  }

  function dateOnly(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function addDays(date, days) {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + Number(days || 0));
    return d;
  }

  function iso(date) { return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : ''; }
  function esc(value) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
})();
