(() => {
  'use strict';

  const R = window.NativeMppReader;
  if (!R || window.__nativeMppAssignmentTableV3Loaded) return;
  window.__nativeMppAssignmentTableV3Loaded = true;

  const VERSION = '0.3.0-assignment-table-v3';
  const DAY_MINUTES = 480;
  const baseReadBuffer = R.readBuffer?.bind(R);
  const baseReadBufferAsync = R.readBufferAsync?.bind(R);
  const baseRead = R.read?.bind(R);

  if (baseReadBuffer) R.readBuffer = (buffer, name = 'project.mpp', options = {}) => polish(buffer, baseReadBuffer(buffer, name, options), name);
  if (baseReadBufferAsync) R.readBufferAsync = async (buffer, name = 'project.mpp') => polish(buffer, await baseReadBufferAsync(buffer, name), name);
  if (baseRead) R.read = async (file) => {
    const buffer = await file.arrayBuffer();
    return R.readBufferAsync ? R.readBufferAsync(buffer, file.name || 'project.mpp') : polish(buffer, await baseRead(file), file.name || 'project.mpp');
  };

  function polish(buffer, result) {
    if (!result?.mppContainerRead || !result.projectXml || !R.CompoundFileBinary) return result;
    try {
      const cfb = new R.CompoundFileBinary(buffer);
      const tasks = taskList(result);
      const resources = resourceList(result.projectXml, result.project?.resources || []);
      const scan = recoverAssignments(cfb, tasks, resources);
      result.nativeAssignmentTableV3 = {
        version: VERSION,
        records: scan.records,
        mapped: scan.mappings.length,
        taskLinks: scan.taskLinks,
        resourceLinks: scan.resourceLinks,
        applied: scan.applied,
        appliedAssignments: scan.applied ? scan.mappings.length : 0,
        confidence: scan.confidence,
        source: scan.source,
        samples: scan.samples.slice(0, 60),
        unresolvedSamples: scan.unresolved.slice(0, 60),
        streams: streamDiagnostics(cfb),
      };
      result.nativeTable = result.nativeTable || {};
      result.nativeTable.fieldCoverage = {
        ...(result.nativeTable.fieldCoverage || {}),
        assignmentRows: scan.records,
        assignmentTaskLinks: scan.taskLinks,
        assignmentResourceLinks: scan.resourceLinks,
        assignmentsApplied: scan.applied ? scan.mappings.length : 0,
        assignmentV3Confidence: scan.confidence,
      };
      if (scan.applied) {
        result.projectXml = injectAssignments(result.projectXml, scan.mappings);
        result.project = result.project || {};
        result.project.assignments = scan.mappings.map((item) => ({
          uid: item.uid,
          taskUid: item.taskUid,
          resourceUid: item.resourceUid,
          units: item.units,
          workMinutes: item.workMinutes,
        }));
      }
      result.importAssignmentTableV3 = {
        version: VERSION,
        records: scan.records,
        mapped: scan.mappings.length,
        applied: scan.applied,
        appliedAssignments: scan.applied ? scan.mappings.length : 0,
        confidence: scan.confidence,
      };
      result.importPolish = {
        ...(result.importPolish || {}),
        assignmentTableV3Records: scan.records,
        assignmentTableV3Applied: scan.applied ? scan.mappings.length : 0,
        assignmentTableV3Version: VERSION,
      };
      result.warnings = result.warnings || [];
      result.warnings.unshift(`Assignment table v3: ${scan.mappings.length}/${scan.records} rows mapped, ${scan.applied ? scan.mappings.length : 0} applied, confidence ${scan.confidence}%.`);
    } catch (error) {
      result.warnings = result.warnings || [];
      result.warnings.push(`Assignment table v3 recovery failed: ${error.message || error}`);
    }
    return result;
  }

  function recoverAssignments(cfb, tasks, resources) {
    const records = [
      ...splitFixed(cfb, 'TBkndAssn/FixedMeta', 'TBkndAssn/FixedData', 'FixedData'),
      ...splitFixed(cfb, 'TBkndAssn/Fixed2Meta', 'TBkndAssn/Fixed2Data', 'Fixed2Data'),
    ];
    const taskByRow = new Map();
    const taskByUid = new Map();
    tasks.forEach((task, index) => {
      if (plausibleId(task.rowId)) taskByRow.set(Number(task.rowId), task);
      if (plausibleId(task.nativeUid)) taskByRow.set(Number(task.nativeUid), task);
      if (plausibleId(task.uid)) taskByUid.set(Number(task.uid), task);
      taskByUid.set(index + 1, task);
    });
    const resourceByUid = new Map();
    const resourceByRow = new Map();
    resources.forEach((resource, index) => {
      if (plausibleId(resource.uid)) resourceByUid.set(Number(resource.uid), resource);
      if (plausibleId(resource.rowId)) resourceByRow.set(Number(resource.rowId), resource);
      resourceByUid.set(index + 1, resource);
    });

    const seen = new Set();
    const mappings = [];
    const samples = [];
    const unresolved = [];
    let taskLinks = 0;
    let resourceLinks = 0;

    for (const rec of records) {
      if (!rec.bytes?.length) continue;
      const item = decodeAssignment(rec, taskByRow, taskByUid, resourceByUid, resourceByRow);
      const key = `${item.assignmentUid}:${item.taskUid}:${item.resourceUid}`;
      if (item.taskUid) taskLinks += 1;
      if (item.resourceUid) resourceLinks += 1;
      if (!item.taskUid || !item.resourceUid) {
        push(unresolved, { row: rec.index, assignmentUid: item.assignmentUid, taskRef: item.taskRef, resourceRef: item.resourceRef, taskUid: item.taskUid, resourceUid: item.resourceUid, reason: item.reason });
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      mappings.push({
        uid: item.assignmentUid || mappings.length + 1,
        taskUid: item.taskUid,
        resourceUid: item.resourceUid,
        units: item.units || 1,
        workMinutes: item.workMinutes || taskWork(item.task) || DAY_MINUTES,
        confidence: item.confidence,
        source: item.source,
      });
      push(samples, { row: rec.index, assignmentUid: item.assignmentUid, taskUid: item.taskUid, taskName: item.task?.name || '', resourceUid: item.resourceUid, resourceName: item.resource?.name || '', source: item.source, confidence: item.confidence });
    }

    const recordsCount = records.length;
    const confidence = mappings.length ? Math.round(mappings.reduce((sum, item) => sum + item.confidence, 0) / mappings.length) : 0;
    const taskCoverage = recordsCount ? taskLinks / recordsCount : 0;
    const resourceCoverage = recordsCount ? resourceLinks / recordsCount : 0;
    const applied = mappings.length > 0 && confidence >= 80 && taskCoverage >= 0.25 && resourceCoverage >= 0.25;
    return { records: recordsCount, mappings, taskLinks, resourceLinks, confidence, applied, source: 'TBkndAssn fixed rows', samples, unresolved };
  }

  function decodeAssignment(rec, taskByRow, taskByUid, resourceByUid, resourceByRow) {
    const view = dv(rec.bytes);
    const values = [];
    for (let offset = 0; offset + 4 <= Math.min(rec.bytes.length, 96); offset += 4) {
      const value = u32(view, offset);
      if (plausibleId(value) || value === 0xffffffff || (value & 0xffff) === value) values.push({ offset, value });
    }
    const assignmentUid = plausibleId(u32(view, 0)) ? u32(view, 0) : rec.index + 1;
    const taskCandidates = [];
    const resourceCandidates = [];
    values.forEach((entry) => {
      const value = entry.value;
      const low = value & 65535;
      if (taskByRow.has(value)) taskCandidates.push({ ...entry, task: taskByRow.get(value), score: 100, mode: 'task-row' });
      if (taskByUid.has(value)) taskCandidates.push({ ...entry, task: taskByUid.get(value), score: 95, mode: 'task-uid' });
      if (taskByRow.has(low)) taskCandidates.push({ ...entry, task: taskByRow.get(low), score: 85, mode: 'task-low16' });
      if (resourceByUid.has(value)) resourceCandidates.push({ ...entry, resource: resourceByUid.get(value), score: 100, mode: 'resource-uid' });
      if (resourceByRow.has(value)) resourceCandidates.push({ ...entry, resource: resourceByRow.get(value), score: 95, mode: 'resource-row' });
      if (resourceByUid.has(low)) resourceCandidates.push({ ...entry, resource: resourceByUid.get(low), score: 85, mode: 'resource-low16' });
      if (resourceByRow.has(low)) resourceCandidates.push({ ...entry, resource: resourceByRow.get(low), score: 80, mode: 'resource-row-low16' });
    });
    const taskPick = pickTask(taskCandidates);
    const resourcePick = pickResource(resourceCandidates, taskPick?.offset);
    const task = taskPick?.task || null;
    const resource = resourcePick?.resource || null;
    if (!task && !resource) return { assignmentUid, taskUid: 0, resourceUid: 0, taskRef: 0, resourceRef: 0, reason: 'no task or resource ref matched' };
    if (!task) return { assignmentUid, taskUid: 0, resourceUid: Number(resource?.uid || 0), taskRef: 0, resourceRef: resourcePick?.value || 0, reason: 'no task ref matched' };
    if (!resource) return { assignmentUid, taskUid: Number(task.uid || 0), resourceUid: 0, taskRef: taskPick?.value || 0, resourceRef: 0, reason: 'no resource ref matched' };
    const confidence = Math.min(taskPick.score, resourcePick.score);
    return {
      assignmentUid,
      task,
      resource,
      taskUid: Number(task.uid || task.id || 0),
      resourceUid: Number(resource.uid || 0),
      taskRef: taskPick.value,
      resourceRef: resourcePick.value,
      units: guessUnits(rec.bytes),
      workMinutes: guessWork(rec.bytes, task),
      confidence,
      source: `${taskPick.mode}+${resourcePick.mode}`,
    };
  }

  function pickTask(candidates) {
    return candidates
      .filter((item) => item.task && !item.task.isSummary)
      .sort((a, b) => b.score - a.score || a.offset - b.offset)[0] || null;
  }

  function pickResource(candidates, taskOffset) {
    return candidates
      .filter((item) => item.resource && item.offset !== taskOffset)
      .sort((a, b) => b.score - a.score || a.offset - b.offset)[0] || null;
  }

  function splitFixed(cfb, metaSuffix, dataSuffix, table) {
    const metaEntry = entry(cfb, metaSuffix);
    const dataEntry = entry(cfb, dataSuffix);
    if (!metaEntry || !dataEntry) return [];
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    if (meta.length < 16 || data.length < 8) return [];
    const view = dv(meta);
    const declared = u32(view, 8);
    const starts = [16, 20, 24, 28, 32];
    const sizes = [8, 12, 16, 24, 32, 40, 47, 48, 56, 64, 80, 92, 96, 112, 128, 160];
    let best = [];
    for (const start of starts) {
      for (const size of sizes) {
        const count = declared > 0 && declared < 100000 && start + declared * size <= meta.length ? declared : Math.floor((meta.length - start) / size);
        if (count <= 0 || count > 100000) continue;
        const offsets = [];
        for (let i = 0; i < count; i += 1) {
          const base = start + i * size;
          if (base + 8 > meta.length) break;
          const off = i32(view, base + 4);
          if (off >= 0 && off < data.length) offsets.push(off);
        }
        const rows = rowsFromOffsets(offsets, data, table);
        if (rows.length > best.length) best = rows;
      }
    }
    return best;
  }

  function rowsFromOffsets(offsets, data, table) {
    const clean = [...new Set(offsets)].sort((a, b) => a - b);
    const rows = [];
    clean.forEach((offset, index) => {
      const end = index + 1 < clean.length ? clean[index + 1] : Math.min(data.length, offset + 768);
      if (end - offset < 8) return;
      rows.push({ index, offset, table, bytes: data.slice(offset, end) });
    });
    return rows;
  }

  function injectAssignments(xml, mappings) {
    const block = `\n  <Assignments>${mappings.map(assignmentXml).join('')}\n  </Assignments>`;
    if (/<Assignments>[\s\S]*?<\/Assignments>/.test(xml)) return xml.replace(/<Assignments>[\s\S]*?<\/Assignments>/, block.trim());
    return xml.replace(/\s*<\/Project>\s*$/, `${block}\n</Project>`);
  }

  function assignmentXml(item) {
    return `\n    <Assignment>\n      <UID>${item.uid}</UID>\n      <TaskUID>${item.taskUid}</TaskUID>\n      <ResourceUID>${item.resourceUid}</ResourceUID>\n      <Units>${Number(item.units || 1).toFixed(2)}</Units>\n      <Work>${duration(item.workMinutes)}</Work>\n      <ActualWork>PT0H0M0S</ActualWork>\n      <RemainingWork>${duration(item.workMinutes)}</RemainingWork>\n    </Assignment>`;
  }

  function taskList(result) {
    const xmlMap = taskUidMap(result.projectXml);
    return (result.project?.tasks || []).map((task, index) => ({
      ...task,
      uid: Number(task.uid || xmlMap.get(Number(task.id || index + 1)) || index + 1),
      rowId: Number(task.rowId || task.nativeUid || index + 1),
    }));
  }

  function taskUidMap(xml) {
    const out = new Map();
    String(xml || '').replace(/<Task>([\s\S]*?)<\/Task>/g, (_, body) => {
      const id = Number(child(body, 'ID'));
      const uid = Number(child(body, 'UID'));
      if (id && uid) out.set(id, uid);
    });
    return out;
  }

  function resourceList(xml, projectResources) {
    const rows = [];
    String(xml || '').replace(/<Resource>([\s\S]*?)<\/Resource>/g, (_, body) => {
      const uid = Number(child(body, 'UID'));
      const id = Number(child(body, 'ID'));
      const name = child(body, 'Name') || `Resource ${id || uid || rows.length + 1}`;
      if (uid) rows.push({ uid, id, rowId: uid, name });
    });
    for (const resource of projectResources || []) {
      const uid = Number(resource.uid || resource.id || rows.length + 1);
      if (uid && !rows.some((row) => row.uid === uid)) rows.push({ uid, id: Number(resource.id || uid), rowId: Number(resource.rowId || uid), name: resource.name || `Resource ${uid}` });
    }
    return rows;
  }

  function guessUnits(bytes) {
    const view = dv(bytes);
    for (let offset = 0; offset + 8 <= Math.min(bytes.length, 128); offset += 4) {
      const f = view.getFloat64(offset, true);
      if (Number.isFinite(f) && f > 0 && f <= 10) return Math.min(10, Math.max(0.01, f));
    }
    return 1;
  }

  function guessWork(bytes, task) {
    const view = dv(bytes);
    for (let offset = 0; offset + 4 <= Math.min(bytes.length, 128); offset += 4) {
      const value = view.getUint32(offset, true);
      if (value > 0 && value <= DAY_MINUTES * 365 * 5) return value;
    }
    return taskWork(task);
  }

  function taskWork(task) {
    const days = Number(task?.durationDays || 1);
    return Number.isFinite(days) && days > 0 ? Math.max(DAY_MINUTES, Math.round(days * DAY_MINUTES)) : DAY_MINUTES;
  }

  function duration(minutes) {
    const m = Math.max(0, Math.round(Number(minutes || 0)));
    return `PT${Math.floor(m / 60)}H${m % 60}M0S`;
  }

  function streamDiagnostics(cfb) {
    return ['FixedMeta', 'FixedData', 'Fixed2Meta', 'Fixed2Data', 'VarMeta', 'Var2Data'].map((name) => {
      const hit = entry(cfb, `TBkndAssn/${name}`);
      return { name, found: Boolean(hit), path: hit?.path || '', size: hit?.size || 0 };
    });
  }

  function push(array, item) { if (array.length < 80) array.push(item); }
  function plausibleId(value) { return Number.isFinite(value) && value > 0 && value < 2000000; }
  function entry(cfb, suffix) { const s = String(suffix || '').toLowerCase(); return cfb.entries.find((item) => item.type === 2 && String(item.path || '').toLowerCase().endsWith(s)) || null; }
  function dv(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  function u32(view, offset) { return offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0; }
  function i32(view, offset) { return offset + 4 <= view.byteLength ? view.getInt32(offset, true) : -1; }
  function child(body, name) { const m = new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`).exec(body || ''); return m ? unesc(m[1].trim()) : ''; }
  function unesc(value) { return String(value || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, '\n').replace(/&amp;/g, '&'); }
})();
