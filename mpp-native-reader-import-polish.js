/*
  Native MPP import polish.
  Runs after mpp-native-reader.js and before app import handlers.
  Preserves more data from native Microsoft Project task/resource cache streams
  when a static-browser MPP import produces generated Project XML.
*/
(() => {
  "use strict";

  const reader = window.NativeMppReader;
  if (!reader || window.__nativeMppImportPolishLoaded) return;
  window.__nativeMppImportPolishLoaded = true;

  const VERSION = "1.0.0-durations";
  const MINUTES_PER_DAY = 480;
  const TASK_PRED_FIELD_ID = 0x0b408053;
  const RESOURCE_NAME_FIELD_IDS = [0x0c4002f2, 0x0c4002f5];
  const RESOURCE_INITIAL_FIELD_ID = 0x0c400001;
  const ENDOFCHAIN = -2;
  const textDecoderUtf8 = new TextDecoder("utf-8", { fatal: false });
  const textDecoderUtf16 = new TextDecoder("utf-16le", { fatal: false });
  const LINK_TYPE_TO_PROJECT = { FF: 0, FS: 1, SS: 2, SF: 3 };

  const baseRead = reader.read?.bind(reader);
  const baseReadBuffer = reader.readBuffer?.bind(reader);
  const baseReadBufferAsync = reader.readBufferAsync?.bind(reader);

  if (baseReadBuffer) {
    reader.readBuffer = function polishedReadBuffer(buffer, fileName = "project.mpp", options = {}) {
      return polishResult(buffer, baseReadBuffer(buffer, fileName, options));
    };
  }

  if (baseReadBufferAsync) {
    reader.readBufferAsync = async function polishedReadBufferAsync(buffer, fileName = "project.mpp") {
      return polishResult(buffer, await baseReadBufferAsync(buffer, fileName));
    };
  }

  if (baseRead) {
    reader.read = async function polishedRead(file) {
      const buffer = await file.arrayBuffer();
      if (reader.readBufferAsync) return reader.readBufferAsync(buffer, file.name || "project.mpp");
      return polishResult(buffer, await baseRead(file));
    };
  }

  reader.importPolishVersion = VERSION;

  function polishResult(buffer, result) {
    if (!result?.projectXml || !result?.nativeTable || !reader.CompoundFileBinary) return result;
    try {
      const cfb = new reader.CompoundFileBinary(buffer);
      let xml = result.projectXml;
      let taskStats = null;
      let durationStats = null;
      let resourceStats = null;
      let assignmentStats = null;
      let changed = false;

      if (result.project?.tasks?.length) {
        const taskDetails = collectNativeTaskDetails(cfb, result.project.tasks);
        if (taskDetails) {
          const polished = polishProjectXml(xml, result.project.tasks, taskDetails);
          if (polished.changed) {
            xml = polished.xml;
            taskStats = { ...polished, displayPredecessorRows: taskDetails.displayPredecessorRows };
            changed = true;
          }
        }
        const durationHit = polishDurationsAndMilestones(xml, result.project.tasks, taskDetails?.tasks || new Map());
        if (durationHit.changed) {
          xml = durationHit.xml;
          durationStats = durationHit;
          changed = true;
        }
      }

      const resources = decodeNativeResources(cfb);
      if (resources.length) {
        const resourceHit = injectResourcesXml(xml, resources);
        if (resourceHit.changed) {
          xml = resourceHit.xml;
          resourceStats = {
            count: resources.length,
            names: resources.map((resource) => resource.name),
            streams: resourceHit.streams,
          };
          changed = true;
        }
      }

      const assignments = resources.length && result.project?.tasks?.length
        ? decodeNativeAssignments(cfb, result.project.tasks, resources)
        : [];
      if (assignments.length) {
        const assignmentHit = injectAssignmentsXml(xml, assignments);
        if (assignmentHit.changed) {
          xml = assignmentHit.xml;
          assignmentStats = {
            count: assignments.length,
            streams: assignmentHit.streams,
          };
          changed = true;
        }
      }

      if (!changed) return result;
      result.projectXml = xml;
      result.project = result.project || {};
      result.importPolish = {
        version: VERSION,
        displayPredecessorRows: taskStats?.displayPredecessorRows || 0,
        displayPredecessorLinks: taskStats?.displayLinksAdded || 0,
        externalDisplayPredecessors: taskStats?.externalDisplayLinks || 0,
        milestones: durationStats?.milestonesApplied ?? taskStats?.milestonesApplied ?? 0,
        notes: taskStats?.notesApplied || 0,
        durations: durationStats?.durationsApplied || 0,
        derivedDurations: durationStats?.derivedDurations || 0,
        nativeDurations: durationStats?.nativeDurations || 0,
        resources: resourceStats?.count || 0,
        assignments: assignmentStats?.count || 0,
      };

      if (resourceStats) {
        result.project.resourceCount = resourceStats.count;
        result.project.resources = resources.map((resource) => ({
          id: resource.id,
          uid: resource.uid,
          rowId: resource.rowId,
          name: resource.name,
          initials: resource.initials,
          type: resource.type,
        }));
        result.importResources = {
          version: VERSION,
          count: resourceStats.count,
          names: resourceStats.names,
        };
      }
      if (assignmentStats) {
        result.project.assignmentCount = assignmentStats.count;
        result.importAssignments = {
          version: VERSION,
          count: assignmentStats.count,
        };
      }

      result.nativeTable.importPolishVersion = VERSION;
      if (taskStats) {
        result.nativeTable.linkCount = Math.max(Number(result.nativeTable.linkCount) || 0, taskStats.totalPredecessorLinks);
      }
      if (resourceStats) {
        result.nativeTable.resourceCount = resourceStats.count;
        result.nativeTable.resourceStrategy = "native-resource-table-cache";
        result.nativeTable.resourceStreams = resourceStats.streams;
      }
      if (assignmentStats) {
        result.nativeTable.assignmentCount = assignmentStats.count;
        result.nativeTable.assignmentStrategy = "native-assignment-fixed-table-cache";
        result.nativeTable.assignmentStreams = assignmentStats.streams;
      }
      result.nativeTable.fieldCoverage = {
        ...(result.nativeTable.fieldCoverage || {}),
        ...(taskStats ? {
          nativePredecessorTextRows: taskStats.displayPredecessorRows,
          nativePredecessorLinksAdded: taskStats.displayLinksAdded,
          externalNativePredecessors: taskStats.externalDisplayLinks,
          nativeImportNotes: taskStats.notesApplied,
        } : {}),
        ...(durationStats ? {
          durations: durationStats.durationsApplied,
          nativeDurations: durationStats.nativeDurations,
          derivedDurations: durationStats.derivedDurations,
          milestones: durationStats.milestonesApplied,
          nonMilestoneSameDayTasks: durationStats.nonMilestoneSameDayTasks,
        } : {}),
        ...(resourceStats ? {
          resources: resourceStats.count,
          resourceNames: resources.filter((resource) => resource.name).length,
          resourceInitials: resources.filter((resource) => resource.initials).length,
        } : {}),
        ...(assignmentStats ? {
          assignments: assignmentStats.count,
          assignedTasks: new Set(assignments.map((assignment) => assignment.taskUid)).size,
          assignedResources: new Set(assignments.map((assignment) => assignment.resourceUid)).size,
        } : {}),
      };

      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      const pieces = [];
      if (taskStats) pieces.push(`added ${taskStats.displayLinksAdded} display predecessor link${taskStats.displayLinksAdded === 1 ? "" : "s"} and preserved native row context in notes`);
      if (durationStats) pieces.push(`applied ${durationStats.durationsApplied} task duration${durationStats.durationsApplied === 1 ? "" : "s"} and marked ${durationStats.milestonesApplied} milestone${durationStats.milestonesApplied === 1 ? "" : "s"} with safer same-day handling`);
      if (resourceStats) pieces.push(`decoded ${resourceStats.count} resource${resourceStats.count === 1 ? "" : "s"} from native TBkndRsc streams`);
      if (assignmentStats) pieces.push(`decoded ${assignmentStats.count} task/resource assignment${assignmentStats.count === 1 ? "" : "s"} from native TBkndAssn streams`);
      result.warnings.push(`MPP import polish ${VERSION}: ${pieces.join("; ")}.`);
      return result;
    } catch (error) {
      result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
      result.warnings.push(`MPP import polish failed: ${error.message || error}`);
      return result;
    }
  }

  function collectNativeTaskDetails(cfb, projectTasks) {
    const varMetaEntry = getEntryByPath(cfb, "TBkndTask/VarMeta");
    const var2DataEntry = getEntryByPath(cfb, "TBkndTask/Var2Data");
    if (!varMetaEntry || !var2DataEntry) return null;

    const wantedRows = new Set(projectTasks.map((task) => Number(task.rowId)).filter(Number.isFinite));
    if (!wantedRows.size) return null;

    const varMeta = cfb.getStream(varMetaEntry);
    const var2Data = cfb.getStream(var2DataEntry);
    const view = new DataView(varMeta.buffer, varMeta.byteOffset, varMeta.byteLength);
    const rows = new Map();

    for (let offset = 0x20; offset + 12 <= varMeta.length; offset += 12) {
      const fieldId = readUInt32(view, offset);
      const rowId = readUInt32(view, offset + 4);
      const valueOffset = readUInt32(view, offset + 8);
      if (!wantedRows.has(rowId) || !fieldId || valueOffset >= var2Data.length) continue;
      const row = rows.get(rowId) || { rowId, fields: new Map(), values: [] };
      const value = readLengthPrefixedValue(var2Data, valueOffset);
      if (value == null) continue;
      row.fields.set(fieldId, value);
      if (String(value || "").trim()) row.values.push(String(value));
      rows.set(rowId, row);
    }

    const tasks = new Map();
    let displayPredecessorRows = 0;
    projectTasks.forEach((task) => {
      const row = rows.get(Number(task.rowId));
      const sourcePredecessors = clean(row?.fields.get(TASK_PRED_FIELD_ID) || "");
      const nativeDurationDays = nativeTaskDurationDays(task, row);
      const milestone = nativeTaskMilestone(task, nativeDurationDays);
      if (sourcePredecessors) displayPredecessorRows += 1;
      tasks.set(Number(task.id), {
        id: Number(task.id),
        rowId: Number(task.rowId),
        uniqueId: task.uniqueId,
        orderKey: task.orderKey,
        sourcePredecessors,
        nativeDurationDays,
        nativeDurationSource: nativeDurationSource(task, row),
        isMilestone: milestone,
      });
    });

    return { tasks, displayPredecessorRows };
  }

  function nativeDurationSource(task, row) {
    if (task && !task.isSummary && Number.isFinite(Number(task.durationDays)) && Number(task.durationDays) >= 0) return "native-task-table";
    if (row) {
      const value = inferDurationDays(row.values);
      if (Number.isFinite(value) && value >= 0) return "native-var-field";
    }
    return "";
  }

  function nativeTaskDurationDays(task, row) {
    if (task && !task.isSummary && Number.isFinite(Number(task.durationDays)) && Number(task.durationDays) >= 0) return Number(task.durationDays);
    if (row) {
      const value = inferDurationDays(row.values);
      if (Number.isFinite(value) && value >= 0) return value;
    }
    return null;
  }

  function nativeTaskMilestone(task, nativeDurationDays) {
    if (!task || task.isSummary) return false;
    if (Number.isFinite(nativeDurationDays)) return nativeDurationDays === 0;
    const sameDay = task.start && task.finish && task.start === task.finish;
    return sameDay && looksLikeMilestoneTaskName(task.name);
  }

  function polishDurationsAndMilestones(xml, projectTasks, detailMap) {
    const byId = new Map(projectTasks.map((task) => [Number(task.id), task]));
    let changed = false;
    let durationsApplied = 0;
    let derivedDurations = 0;
    let nativeDurations = 0;
    let milestonesApplied = 0;
    let nonMilestoneSameDayTasks = 0;

    const output = xml.replace(/<Task>([\s\S]*?)<\/Task>/g, (full, body) => {
      const id = Number(childTextFromBody(body, "ID"));
      if (!id) return full;
      const task = byId.get(id);
      if (!task || task.isSummary) return full;
      const detail = detailMap.get(id) || {};
      const duration = chooseDurationForTask(task, detail);
      if (!duration) return full;

      let nextBody = body;
      const before = nextBody;
      nextBody = setOrInsertChild(nextBody, "Duration", minutesToProjectDuration(duration.minutes), "Finish");
      nextBody = setOrInsertChild(nextBody, "DurationFormat", duration.minutes === 0 ? "7" : "7", "Duration");
      nextBody = setOrInsertChild(nextBody, "Milestone", duration.isMilestone ? "1" : "0", "DurationFormat");
      if (duration.isMilestone) {
        nextBody = setOrInsertChild(nextBody, "Work", "PT0H0M0S", "DurationFormat");
      }
      if (nextBody !== before) {
        changed = true;
        durationsApplied += 1;
        if (duration.source === "derived-working-span") derivedDurations += 1;
        if (duration.source && duration.source.startsWith("native")) nativeDurations += 1;
        if (duration.isMilestone) milestonesApplied += 1;
        if (task.start && task.finish && task.start === task.finish && !duration.isMilestone) nonMilestoneSameDayTasks += 1;
      }
      return nextBody === body ? full : `<Task>${nextBody}\n    </Task>`;
    });

    return { xml: output, changed, durationsApplied, derivedDurations, nativeDurations, milestonesApplied, nonMilestoneSameDayTasks };
  }

  function chooseDurationForTask(task, detail) {
    const nativeDays = Number(detail?.nativeDurationDays);
    const source = detail?.nativeDurationSource || "";
    if (Number.isFinite(nativeDays) && nativeDays >= 0 && nativeDays < 10000) {
      return {
        days: nativeDays,
        minutes: Math.round(nativeDays * MINUTES_PER_DAY),
        isMilestone: nativeDays === 0,
        source: source || "native-task-table",
      };
    }

    const sameDay = task.start && task.finish && task.start === task.finish;
    if (sameDay && looksLikeMilestoneTaskName(task.name)) {
      return { days: 0, minutes: 0, isMilestone: true, source: "same-day-milestone-name" };
    }

    const workingDays = workingDaysInclusive(task.start, task.finish);
    if (Number.isFinite(workingDays) && workingDays > 0) {
      return {
        days: workingDays,
        minutes: Math.round(workingDays * MINUTES_PER_DAY),
        isMilestone: false,
        source: "derived-working-span",
      };
    }

    return sameDay ? { days: 1, minutes: MINUTES_PER_DAY, isMilestone: false, source: "same-day-default" } : null;
  }

  function workingDaysInclusive(startValue, finishValue) {
    const start = parseIsoDay(startValue);
    const finish = parseIsoDay(finishValue || startValue);
    if (!start || !finish) return null;
    if (finish < start) return 1;
    let count = 0;
    const cursor = new Date(start.getTime());
    let guard = 0;
    while (cursor <= finish && guard < 50000) {
      const day = cursor.getUTCDay();
      if (day !== 0 && day !== 6) count += 1;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      guard += 1;
    }
    return Math.max(1, count);
  }

  function parseIsoDay(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function looksLikeMilestoneTaskName(name) {
    const text = clean(name).toLowerCase();
    if (!text) return false;
    return /\b(kick[- ]?off|sign[- ]?off|review|irr|drr|trr|arr|odd|mrod|handoff|handover|go\/no-go|decision|committed|release|pdp[- ]?\d|milestone)\b/.test(text);
  }

  function decodeNativeResources(cfb) {
    const varMetaEntry = getEntryByPath(cfb, "TBkndRsc/VarMeta");
    const var2DataEntry = getEntryByPath(cfb, "TBkndRsc/Var2Data");
    if (!varMetaEntry || !var2DataEntry) return [];

    const varMeta = cfb.getStream(varMetaEntry);
    const var2Data = cfb.getStream(var2DataEntry);
    if (varMeta.length < 32 || !var2Data.length) return [];

    const view = new DataView(varMeta.buffer, varMeta.byteOffset, varMeta.byteLength);
    const fixedResources = parseResourceFixedRows(cfb);
    const rows = new Map();

    for (let offset = 0x20; offset + 12 <= varMeta.length; offset += 12) {
      const fieldId = readUInt32(view, offset);
      const rowId = readUInt32(view, offset + 4);
      const valueOffset = readUInt32(view, offset + 8);
      if (!fieldId || valueOffset >= var2Data.length) continue;
      const row = rows.get(rowId) || { rowId, fields: new Map(), nameOffset: null };
      const value = RESOURCE_NAME_FIELD_IDS.includes(fieldId)
        ? readLengthPrefixedTextLenient(var2Data, valueOffset)
        : readLengthPrefixedValue(var2Data, valueOffset);
      if (value != null && (String(value).trim() || !row.fields.has(fieldId))) row.fields.set(fieldId, value);
      if (RESOURCE_NAME_FIELD_IDS.includes(fieldId) && String(value || "").trim()) row.nameOffset = valueOffset;
      rows.set(rowId, row);
    }

    const resources = [];
    const seenNames = new Set();
    [...rows.values()].sort((a, b) => a.rowId - b.rowId).forEach((row) => {
      const name = normalizeResourceName(firstResourceName(row.fields));
      if (!name) return;
      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) return;
      seenNames.add(nameKey);
      const id = resources.length + 1;
      const fixed = fixedResources.byRowId.get(row.rowId) || null;
      resources.push({
        id,
        uid: Number.isInteger(fixed?.uid) && fixed.uid > 0 ? fixed.uid : (Number.isInteger(row.rowId) && row.rowId > 0 ? row.rowId : id),
        rowId: row.rowId,
        name,
        initials: normalizeInitials(row.fields.get(RESOURCE_INITIAL_FIELD_ID), name),
        type: "Work",
        maxUnits: 1,
        standardRate: "0",
        overtimeRate: "0",
        costPerUse: "0",
        notes: `Native MPP resource row ${row.rowId}${row.nameOffset != null ? `, name offset ${row.nameOffset}` : ""}.`,
      });
    });

    resources.streams = { varMeta: varMetaEntry.path, var2Data: var2DataEntry.path };
    return resources;
  }

  function parseResourceFixedRows(cfb) {
    const fixed = splitFixedRecords(cfb, "TBkndRsc");
    const byRowId = new Map();
    fixed.records.forEach((record) => {
      const bytes = record.bytes;
      if (!bytes || bytes.length < 8) return;
      const uid = readUInt32FromBytes(bytes, 0);
      const rowId = readUInt32FromBytes(bytes, 4);
      if (rowId > 0) byRowId.set(rowId, { uid, rowId, fixedIndex: record.index });
    });
    return { byRowId, streams: fixed.streams };
  }

  function firstResourceName(fields) {
    for (const fieldId of RESOURCE_NAME_FIELD_IDS) {
      const value = normalizeResourceName(fields.get(fieldId));
      if (value) return value;
    }
    return "";
  }

  function decodeNativeAssignments(cfb, projectTasks, resources) {
    const fixed = splitFixedRecords(cfb, "TBkndAssn");
    if (!fixed.records.length) return [];
    const taskRowToTask = new Map(projectTasks.map((task) => [Number(task.rowId), task]).filter(([rowId]) => Number.isFinite(rowId) && rowId > 0));
    const resourceUids = new Set(resources.map((resource) => Number(resource.uid)).filter((uid) => Number.isInteger(uid) && uid > 0));
    const assignments = [];
    const seen = new Set();

    fixed.records.forEach((record) => {
      const bytes = record.bytes;
      if (!bytes || bytes.length < 12) return;
      const assignmentUid = readUInt32FromBytes(bytes, 0);
      const taskRowId = readUInt32FromBytes(bytes, 4);
      const packedResource = readUInt32FromBytes(bytes, 8);
      const resourceUid = packedResource & 0xffff;
      const task = taskRowToTask.get(taskRowId);
      if (!task || !resourceUids.has(resourceUid) || task.isSummary) return;
      const taskUid = Number(task.id);
      if (!Number.isInteger(taskUid) || taskUid <= 0) return;
      const key = `${taskUid}:${resourceUid}:${assignmentUid || record.index}`;
      if (seen.has(key)) return;
      seen.add(key);
      const workMinutes = assignmentWorkMinutes(task);
      assignments.push({
        uid: Number.isInteger(assignmentUid) && assignmentUid > 0 ? assignmentUid : assignments.length + 1,
        taskUid,
        taskRowId,
        resourceUid,
        units: 1,
        workMinutes,
        actualWorkMinutes: 0,
        remainingWorkMinutes: workMinutes,
        sourceIndex: record.index,
      });
    });

    assignments.sort((a, b) => a.taskUid - b.taskUid || a.resourceUid - b.resourceUid || a.uid - b.uid);
    assignments.streams = fixed.streams;
    return assignments;
  }

  function assignmentWorkMinutes(task) {
    const duration = chooseDurationForTask(task, {});
    return duration ? duration.minutes : 0;
  }

  function polishProjectXml(xml, projectTasks, details) {
    const tasksById = new Map(projectTasks.map((task) => [Number(task.id), task]));
    const importById = details.tasks;
    const taskIdToUid = new Map();
    xml.replace(/<Task>([\s\S]*?)<\/Task>/g, (_full, body) => {
      const id = Number(childTextFromBody(body, "ID"));
      const uid = Number(childTextFromBody(body, "UID"));
      if (id > 0 && uid > 0) taskIdToUid.set(id, uid);
      return _full;
    });

    let displayLinksAdded = 0;
    let externalDisplayLinks = 0;
    let notesApplied = 0;
    let totalPredecessorLinks = 0;
    let changed = false;

    const output = xml.replace(/<Task>([\s\S]*?)<\/Task>/g, (full, body) => {
      const id = Number(childTextFromBody(body, "ID"));
      if (!id) return full;
      const task = tasksById.get(id);
      const detail = importById.get(id);
      if (!task || !detail) return full;

      let nextBody = body;
      const existingLinks = parseExistingPredecessorKeys(nextBody);
      totalPredecessorLinks += existingLinks.size;
      const parsedDisplayLinks = parseDisplayPredecessors(detail.sourcePredecessors, id, taskIdToUid);
      const extraLinks = [];
      parsedDisplayLinks.forEach((link) => {
        if (!link.valid) {
          externalDisplayLinks += 1;
          return;
        }
        const key = `${link.predUid}:${LINK_TYPE_TO_PROJECT[link.type] ?? 1}`;
        if (existingLinks.has(key)) return;
        existingLinks.add(key);
        extraLinks.push(renderPredecessorLink(link));
      });
      if (extraLinks.length) {
        nextBody = `${nextBody}${extraLinks.join("")}`;
        displayLinksAdded += extraLinks.length;
        totalPredecessorLinks += extraLinks.length;
        changed = true;
      }

      const noteLines = [];
      if (detail.sourcePredecessors) noteLines.push(`Native MPP predecessors: ${detail.sourcePredecessors}`);
      if (detail.rowId || detail.uniqueId) noteLines.push(`Native MPP row ${detail.rowId || "?"}${detail.uniqueId ? `, unique ID ${detail.uniqueId}` : ""}${detail.orderKey != null ? `, order ${detail.orderKey}` : ""}.`);
      if (noteLines.length) {
        nextBody = appendNotes(nextBody, noteLines.join("\n"));
        notesApplied += 1;
        changed = true;
      }

      return nextBody === body ? full : `<Task>${nextBody}\n    </Task>`;
    });

    return { xml: output, changed, displayLinksAdded, externalDisplayLinks, notesApplied, totalPredecessorLinks };
  }

  function injectResourcesXml(xml, resources) {
    const streams = resources.streams || {};
    const hasRealResources = /<Resources>[\s\S]*?<Resource>[\s\S]*?<ID>\s*[1-9]/.test(xml);
    if (hasRealResources) return { xml, changed: false, streams };

    const resourcesXml = `\n  <Resources>${resources.map(renderResourceXml).join("")}\n  </Resources>`;
    if (/<Resources>[\s\S]*?<\/Resources>/.test(xml)) {
      return { xml: xml.replace(/<Resources>[\s\S]*?<\/Resources>/, resourcesXml.trim()), changed: true, streams };
    }
    if (/<Assignments>[\s\S]*?<\/Assignments>/.test(xml)) {
      return { xml: xml.replace(/<Assignments>[\s\S]*?<\/Assignments>/, `${resourcesXml}\n  $&`), changed: true, streams };
    }
    return { xml: xml.replace(/\s*<\/Project>\s*$/, `${resourcesXml}\n</Project>`), changed: true, streams };
  }

  function injectAssignmentsXml(xml, assignments) {
    const streams = assignments.streams || {};
    const hasRealAssignments = /<Assignments>[\s\S]*?<Assignment>[\s\S]*?<TaskUID>\s*[1-9]/.test(xml);
    if (hasRealAssignments) return { xml, changed: false, streams };
    const assignmentsXml = `\n  <Assignments>${assignments.map(renderAssignmentXml).join("")}\n  </Assignments>`;
    if (/<Assignments>[\s\S]*?<\/Assignments>/.test(xml)) {
      return { xml: xml.replace(/<Assignments>[\s\S]*?<\/Assignments>/, assignmentsXml.trim()), changed: true, streams };
    }
    return { xml: xml.replace(/\s*<\/Project>\s*$/, `${assignmentsXml}\n</Project>`), changed: true, streams };
  }

  function renderAssignmentXml(assignment) {
    return `\n    <Assignment>\n      <UID>${assignment.uid}</UID>\n      <TaskUID>${assignment.taskUid}</TaskUID>\n      <ResourceUID>${assignment.resourceUid}</ResourceUID>\n      <PercentWorkComplete>0</PercentWorkComplete>\n      <Units>${Number(assignment.units || 1).toFixed(2)}</Units>\n      <Work>${minutesToProjectDuration(assignment.workMinutes)}</Work>\n      <ActualWork>${minutesToProjectDuration(assignment.actualWorkMinutes)}</ActualWork>\n      <RemainingWork>${minutesToProjectDuration(assignment.remainingWorkMinutes)}</RemainingWork>\n    </Assignment>`;
  }

  function minutesToProjectDuration(minutes) {
    const safe = Math.max(0, Math.round(Number(minutes) || 0));
    const hours = Math.floor(safe / 60);
    const mins = safe % 60;
    return `PT${hours}H${mins}M0S`;
  }

  function renderResourceXml(resource) {
    return `\n    <Resource>\n      <UID>${resource.uid}</UID>\n      <ID>${resource.id}</ID>\n      <Name>${escapeXmlValue(resource.name)}</Name>\n      <Type>0</Type>\n      <IsNull>0</IsNull>\n      <Initials>${escapeXmlValue(resource.initials)}</Initials>\n      <MaxUnits>${Number(resource.maxUnits || 1).toFixed(2)}</MaxUnits>\n      <StandardRate>${escapeXmlValue(resource.standardRate || "0")}</StandardRate>\n      <StandardRateFormat>2</StandardRateFormat>\n      <OvertimeRate>${escapeXmlValue(resource.overtimeRate || "0")}</OvertimeRate>\n      <OvertimeRateFormat>2</OvertimeRateFormat>\n      <CostPerUse>${escapeXmlValue(resource.costPerUse || "0")}</CostPerUse>\n      <AccrueAt>3</AccrueAt>\n      <BaseCalendarUID>1</BaseCalendarUID>\n      <Notes>${escapeXmlValue(resource.notes || "")}</Notes>\n    </Resource>`;
  }

  function parseExistingPredecessorKeys(body) {
    const keys = new Set();
    body.replace(/<PredecessorLink>([\s\S]*?)<\/PredecessorLink>/g, (_full, linkBody) => {
      const uid = Number(childTextFromBody(linkBody, "PredecessorUID"));
      const type = Number(childTextFromBody(linkBody, "Type") || 1);
      if (uid > 0) keys.add(`${uid}:${Number.isFinite(type) ? type : 1}`);
      return _full;
    });
    return keys;
  }

  function parseDisplayPredecessors(value, selfId, taskIdToUid) {
    const text = clean(value);
    if (!text) return [];
    return text.split(/[;,]+/).map((token) => parseDisplayPredecessorToken(token, selfId, taskIdToUid)).filter(Boolean);
  }

  function parseDisplayPredecessorToken(token, selfId, taskIdToUid) {
    const text = clean(token).replace(/\s+/g, "");
    if (!text) return null;
    const match = /^(\d+)(FS|SS|FF|SF)?([+-](?:\d+(?:\.\d+)?|\.\d+)(?:mo|mon|mons|month|months|w|wk|wks|week|weeks|d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)?)?$/i.exec(text);
    if (!match) return { valid: false, raw: text };
    const predId = Number(match[1]);
    const predUid = taskIdToUid.get(predId);
    if (!predUid || predId === Number(selfId)) return { valid: false, raw: text, predId };
    const type = String(match[2] || "FS").toUpperCase();
    return {
      valid: true,
      predId,
      predUid,
      type: LINK_TYPE_TO_PROJECT[type] == null ? "FS" : type,
      lagMinutes: parseDisplayLagMinutes(match[3] || ""),
      raw: text,
    };
  }

  function parseDisplayLagMinutes(value) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return 0;
    const match = /^([+-])(\d+(?:\.\d+)?|\.\d+)(mo|mon|mons|month|months|w|wk|wks|week|weeks|d|day|days|h|hr|hrs|hour|hours|m|min|mins|minute|minutes)?$/.exec(text);
    if (!match) return 0;
    const sign = match[1] === "-" ? -1 : 1;
    const amount = Number(match[2]);
    const unit = match[3] || "d";
    if (!Number.isFinite(amount)) return 0;
    let minutesPerUnit = MINUTES_PER_DAY;
    if (unit.startsWith("mo")) minutesPerUnit = 20 * MINUTES_PER_DAY;
    else if (unit.startsWith("w")) minutesPerUnit = 5 * MINUTES_PER_DAY;
    else if (unit.startsWith("h")) minutesPerUnit = 60;
    else if (unit === "m" || unit.startsWith("min")) minutesPerUnit = 1;
    return Math.round(sign * amount * minutesPerUnit);
  }

  function renderPredecessorLink(link) {
    return `\n      <PredecessorLink>\n        <PredecessorUID>${link.predUid}</PredecessorUID>\n        <Type>${LINK_TYPE_TO_PROJECT[link.type] ?? 1}</Type>\n        <CrossProject>0</CrossProject>\n        <LinkLag>${Math.round((Number(link.lagMinutes) || 0) * 10)}</LinkLag>\n        <LagFormat>7</LagFormat>\n      </PredecessorLink>`;
  }

  function appendNotes(body, text) {
    if (!text) return body;
    const escaped = escapeXmlValue(text);
    if (/<Notes>[\s\S]*?<\/Notes>/.test(body)) {
      return body.replace(/<Notes>([\s\S]*?)<\/Notes>/, (_full, current) => `<Notes>${current}${current ? "&#10;" : ""}${escaped}</Notes>`);
    }
    return body.replace(/(<Name>[\s\S]*?<\/Name>)/, `$1\n      <Notes>${escaped}</Notes>`);
  }

  function setOrInsertChild(body, name, value, afterName = "") {
    const escaped = escapeXmlValue(value);
    const pattern = new RegExp(`<${name}>[\\s\\S]*?<\\/${name}>`);
    if (pattern.test(body)) return body.replace(pattern, `<${name}>${escaped}</${name}>`);
    const afterPattern = afterName ? new RegExp(`(<${afterName}>[\\s\\S]*?<\\/${afterName}>)`) : null;
    if (afterPattern && afterPattern.test(body)) return body.replace(afterPattern, `$1\n      <${name}>${escaped}</${name}>`);
    return `${body}\n      <${name}>${escaped}</${name}>`;
  }

  function childTextFromBody(body, localName) {
    const match = new RegExp(`<${localName}>([\\s\\S]*?)<\\/${localName}>`).exec(body);
    return match ? decodeXmlValue(match[1].trim()) : "";
  }

  function splitFixedRecords(cfb, prefix) {
    const metaEntry = getEntryByPath(cfb, `${prefix}/FixedMeta`);
    const dataEntry = getEntryByPath(cfb, `${prefix}/FixedData`);
    if (!metaEntry || !dataEntry) return { records: [], streams: {} };
    const meta = cfb.getStream(metaEntry);
    const data = cfb.getStream(dataEntry);
    if (meta.length < 16 || !data.length) return { records: [], streams: { fixedMeta: metaEntry.path, fixedData: dataEntry.path } };
    const metaView = new DataView(meta.buffer, meta.byteOffset, meta.byteLength);
    const count = readUInt32(metaView, 8);
    if (!Number.isInteger(count) || count <= 0) return { records: [], streams: { fixedMeta: metaEntry.path, fixedData: dataEntry.path } };
    const available = meta.length - 16;
    const itemSize = available % count === 0 ? available / count : 0;
    if (!itemSize || itemSize < 8) return { records: [], streams: { fixedMeta: metaEntry.path, fixedData: dataEntry.path } };
    const offsets = [];
    for (let i = 0; i < count; i += 1) {
      const offset = 16 + i * itemSize;
      offsets.push(readUInt32(metaView, offset + 4));
    }
    const records = [];
    offsets.forEach((offset, index) => {
      if (offset > data.length) return;
      let nextOffset = index + 1 < offsets.length ? offsets[index + 1] : data.length;
      if (nextOffset < offset || nextOffset > data.length) nextOffset = data.length;
      const bytes = data.slice(offset, nextOffset);
      if (bytes.length) records.push({ index, offset, bytes });
    });
    return { records, streams: { fixedMeta: metaEntry.path, fixedData: dataEntry.path } };
  }

  function readUInt32FromBytes(bytes, offset) {
    if (!bytes || offset + 4 > bytes.length) return 0;
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
  }

  function getEntryByPath(cfb, suffix) {
    const normalizedSuffix = String(suffix || "").toLowerCase();
    return cfb.entries.find((entry) => entry.type === 2 && String(entry.path || "").toLowerCase().endsWith(normalizedSuffix)) || null;
  }

  function readUInt32(view, offset) {
    return offset + 4 <= view.byteLength ? view.getUint32(offset, true) : 0;
  }

  function readInt32(view, offset) {
    return offset + 4 <= view.byteLength ? view.getInt32(offset, true) : ENDOFCHAIN;
  }

  function readUInt16(view, offset) {
    return offset + 2 <= view.byteLength ? view.getUint16(offset, true) : 0;
  }

  function readLengthPrefixedValue(bytes, offset) {
    if (!bytes || offset == null || offset < 0 || offset + 4 > bytes.length) return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const length = readUInt32(view, offset);
    if (!Number.isFinite(length) || length < 0 || length > bytes.length - offset - 4 || length > 1024 * 1024) return null;
    const raw = bytes.slice(offset + 4, offset + 4 + length);
    if (!raw.length) return "";
    if (raw.length % 2 === 0 && looksMostlyUtf16(raw)) return textDecoderUtf16.decode(raw).replace(/\0+$/g, "").trim();
    if (looksMostlyAnsi(raw)) return textDecoderUtf8.decode(raw).replace(/\0+$/g, "").trim();
    if (raw.length === 4) {
      const rawView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      const intValue = readInt32(rawView, 0);
      if (intValue === -1 || intValue === 0) return "";
      return String(intValue);
    }
    if (raw.length === 8) {
      const rawView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      const maybeNumber = rawView.getFloat64(0, true);
      if (Number.isFinite(maybeNumber) && Math.abs(maybeNumber) < 1000000000) return String(maybeNumber);
    }
    return "";
  }

  function readLengthPrefixedTextLenient(bytes, offset) {
    if (!bytes || offset == null || offset < 0 || offset + 4 > bytes.length) return "";
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const length = readUInt32(view, offset);
    if (!Number.isFinite(length) || length < 2 || length > bytes.length - offset - 4 || length > 4096) return "";
    const raw = bytes.slice(offset + 4, offset + 4 + length);
    if (!raw.length) return "";
    if (raw.length % 2 === 0) {
      const text = textDecoderUtf16.decode(raw).replace(/\0+$/g, "").trim();
      if (looksLikeResourceText(text)) return text;
    }
    const ansi = textDecoderUtf8.decode(raw).replace(/\0+$/g, "").trim();
    return looksLikeResourceText(ansi) ? ansi : "";
  }

  function looksMostlyUtf16(bytes) {
    if (bytes.length < 6 || bytes.length % 2 !== 0) return false;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let good = 0;
    let total = 0;
    for (let i = 0; i + 2 <= bytes.length; i += 2) {
      const code = readUInt16(view, i);
      total += 1;
      if (code && isPrintableCodePoint(code)) good += 1;
    }
    return total > 0 && good / total > 0.85;
  }

  function looksMostlyAnsi(bytes) {
    if (bytes.length < 3) return false;
    let good = 0;
    for (const byte of bytes) if (byte && isPrintableAscii(byte)) good += 1;
    return good / bytes.length > 0.88;
  }

  function isPrintableAscii(code) {
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
  }

  function isPrintableCodePoint(code) {
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0x007e) || (code >= 0x00a0 && code <= 0xffff);
  }

  function normalizeResourceName(value) {
    const text = clean(value);
    if (!looksLikeResourceText(text)) return "";
    if (/^(Standard|Calendar|Resource Name|Type|Work|Material|Cost)$/i.test(text)) return "";
    return text;
  }

  function looksLikeResourceText(value) {
    const text = clean(value);
    if (text.length < 2 || text.length > 120) return false;
    if (!/[A-Za-z\p{L}]/u.test(text)) return false;
    if (/�|[\u0000-\u001f\u007f]/.test(text)) return false;
    const punctuation = (text.match(/[^\p{L}\p{N} ._&/#'()+\-]/gu) || []).length;
    return punctuation <= Math.max(2, Math.floor(text.length / 4));
  }

  function normalizeInitials(value, name) {
    const text = clean(value);
    const numeric = Number(text);
    if (Number.isInteger(numeric) && numeric >= 32 && numeric <= 126) return String.fromCharCode(numeric).slice(0, 8);
    if (looksLikeResourceText(text) && text.length <= 8) return text;
    return name.split(/\s+/).map((part) => part[0] || "").join("").slice(0, 8).toUpperCase() || name.slice(0, 1).toUpperCase();
  }

  function inferDurationDays(values) {
    for (const value of values || []) {
      const days = parseDurationDays(value);
      if (Number.isFinite(days) && days >= 0) return days;
    }
    return null;
  }

  function parseDurationDays(value) {
    const text = clean(value).toLowerCase();
    if (/^0\s*(?:d|day|days)\b/.test(text)) return 0;
    let match = /(-?\d+(?:\.\d+)?)\s*(?:d|day|days)\b/.exec(text);
    if (match) return Math.max(0, Math.round(Number(match[1])));
    match = /(-?\d+(?:\.\d+)?)\s*(?:w|wk|wks|week|weeks)\b/.exec(text);
    if (match) return Math.max(0, Math.round(Number(match[1]) * 5));
    match = /(-?\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/.exec(text);
    if (match) return Math.max(0, Math.round(Number(match[1]) / 8));
    return null;
  }

  function clean(value) {
    return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  }

  function escapeXmlValue(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  }

  function decodeXmlValue(value) {
    return String(value || "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#10;/g, "\n").replace(/&amp;/g, "&");
  }
})();
