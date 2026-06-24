(() => {
  if (typeof updateTask !== "function" || typeof state === "undefined") return;

  function autoRemainingMinutes(task) {
    const duration = Number.isFinite(Number(task?.durationMinutes)) ? Math.max(0, Math.round(Number(task.durationMinutes))) : 0;
    const percent = Math.min(100, Math.max(0, Math.round(Number(task?.percent) || 0)));
    return percent >= 100 ? 0 : Math.max(0, Math.round(duration * (100 - percent) / 100));
  }

  function syncAutomaticRemaining(task) {
    if (!task) return;
    task.remainingDurationManual = false;
    task.remainingDurationMinutes = autoRemainingMinutes(task);
    const duration = Number.isFinite(Number(task.durationMinutes)) ? Math.max(0, Math.round(Number(task.durationMinutes))) : 0;
    task.actualDurationMinutes = Math.max(0, duration - task.remainingDurationMinutes);
    if (Number(task.percent) >= 100 && !task.actualFinish) task.actualFinish = task.finish || "";
  }

  const baseUpdateTask = updateTask;
  updateTask = function progressSyncedUpdateTask(index, field, value) {
    const task = state.tasks?.[index];
    if (task && ["percent", "duration", "start", "finish"].includes(field) && task.remainingDurationManual !== true) {
      delete task.remainingDurationMinutes;
      delete task.actualDurationMinutes;
    }
    return baseUpdateTask(index, field, value);
  };

  if (typeof applyTaskInfoForm === "function") {
    const baseApplyTaskInfoForm = applyTaskInfoForm;
    applyTaskInfoForm = function progressSyncedApplyTaskInfoForm() {
      const index = taskInfoIndex;
      const tab = taskInfoActiveTab;
      baseApplyTaskInfoForm();
      const task = state.tasks?.[index];
      if (task && tab !== "progress") {
        syncAutomaticRemaining(task);
        if (typeof render === "function") render();
      }
    };
  }
})();

(() => {
  if (typeof state === "undefined" || typeof parseDurationInput !== "function") return;
  if (window.__dependencyEngineV2Patched) return;
  window.__dependencyEngineV2Patched = true;

  const DEPENDENCY_TYPES = ["FS", "SS", "FF", "SF"];
  const SCHEDULE_EDIT_FIELDS = new Set(["start", "finish", "duration"]);
  const parseWarningsByTaskId = new Map();

  function availableLinkTypes() {
    return (typeof LINK_TYPES !== "undefined" && Array.isArray(LINK_TYPES) && LINK_TYPES.length)
      ? LINK_TYPES
      : DEPENDENCY_TYPES;
  }

  function isValidLinkType(type) {
    return availableLinkTypes().includes(String(type || "").toUpperCase());
  }

  function normalizeDependencyType(type) {
    const text = String(type || "FS").trim().toUpperCase();
    return isValidLinkType(text) ? text : null;
  }

  function parseStrictLagExpression(rawLag) {
    const text = String(rawLag || "").trim();
    if (!text) return { lagMinutes: 0, warnings: [] };

    const match = /^([+-])\s*(\d+(?:\.\d+)?|\.\d+)\s*(w(?:eeks?|ks?)?|d(?:ays?)?|h(?:ours?|rs?)?|m(?:in(?:ute)?s?)?)?$/i.exec(text);
    if (!match) {
      return {
        lagMinutes: 0,
        warnings: [`Invalid lag/lead "${text}". Use examples like +2d, -4h, +1w, or +30m.`],
      };
    }

    const sign = match[1] === "-" ? -1 : 1;
    const amount = match[2].startsWith(".") ? `0${match[2]}` : match[2];
    const unit = match[3] || "d";
    const minutes = parseDurationInput(`${amount}${unit}`, getCalendar().minutesPerDay);
    return { lagMinutes: sign * minutes, warnings: [] };
  }

  function isDependencySeparator(value) {
    return !String(value || "").replace(/[\s,;]+/g, "");
  }

  function strictParseLinks(value, selfId) {
    const text = String(value || "").trim();
    if (!text) return { links: [], warnings: [] };

    const links = [];
    const warnings = [];
    const seen = new Set();
    const tokenPattern = /(\d+)\s*[:\-]?\s*([A-Za-z]+)?\s*([+-]\s*(?:\d+(?:\.\d+)?|\.\d+)?\s*[A-Za-z]*)?/g;
    let match;
    let lastIndex = 0;

    while ((match = tokenPattern.exec(text)) !== null) {
      const gap = text.slice(lastIndex, match.index);
      if (!isDependencySeparator(gap)) {
        warnings.push(`Invalid dependency text "${gap.trim()}". Use formats like 1FS, 1FS+2d, or 2SS-4h.`);
      }
      lastIndex = tokenPattern.lastIndex;

      const id = Number(match[1]);
      const typeToken = match[2] || "FS";
      const type = normalizeDependencyType(typeToken);
      const lagResult = parseStrictLagExpression(match[3] || "");

      if (!Number.isInteger(id) || id <= 0) {
        warnings.push(`Invalid predecessor ID "${match[1]}".`);
        continue;
      }
      if (id === Number(selfId)) {
        warnings.push(`Task ${selfId} cannot depend on itself.`);
        continue;
      }
      if (!type) {
        warnings.push(`Unsupported dependency type "${typeToken}" on predecessor ${id}. Use FS, SS, FF, or SF.`);
        continue;
      }
      if (lagResult.warnings.length) warnings.push(...lagResult.warnings.map((warning) => `Predecessor ${id}${type}: ${warning}`));

      const key = `${id}:${type}`;
      if (seen.has(key)) {
        warnings.push(`Duplicate predecessor ${id}${type} ignored.`);
        continue;
      }
      seen.add(key);
      links.push({ id, type, lagMinutes: lagResult.lagMinutes });
    }

    const tail = text.slice(lastIndex);
    if (!isDependencySeparator(tail)) {
      warnings.push(`Invalid dependency text "${tail.trim()}". Use formats like 1FS, 1FS+2d, or 2SS-4h.`);
    }
    if (!links.length && !warnings.length) warnings.push(`Invalid predecessor syntax "${text}".`);

    return { links, warnings };
  }

  parseLinksInput = function dependencyV2ParseLinksInput(value, selfId) {
    const parsed = strictParseLinks(value, selfId);
    if (Number.isInteger(Number(selfId))) parseWarningsByTaskId.set(Number(selfId), parsed.warnings);
    return parsed.links;
  };

  function normalizeStoredLink(link) {
    const id = Number(typeof link === "object" ? (link.id ?? link.predId ?? link.predecessorId) : link);
    if (!Number.isInteger(id) || id <= 0) return null;
    const rawType = typeof link === "object" ? link.type : "FS";
    const type = normalizeDependencyType(rawType) || "FS";
    const rawLag = typeof link === "object" ? (link.lagMinutes ?? link.lag ?? link.linkLagMinutes ?? 0) : 0;
    const lagMinutes = Number.isFinite(Number(rawLag)) ? Math.round(Number(rawLag)) : 0;
    return { id, type, lagMinutes };
  }

  normalizeTaskLinks = function dependencyV2NormalizeTaskLinks(task) {
    const rawLinks = Array.isArray(task?.links) && task.links.length
      ? task.links
      : (task?.predecessors || []).map((id) => ({ id, type: "FS", lagMinutes: 0 }));
    const seen = new Set();
    const normalized = [];

    rawLinks.forEach((rawLink) => {
      const link = normalizeStoredLink(rawLink);
      if (!link) return;
      const key = `${link.id}:${link.type}`;
      if (seen.has(key)) return;
      seen.add(key);
      normalized.push(link);
    });

    return normalized;
  };

  getTaskLinks = function dependencyV2GetTaskLinks(task) {
    return normalizeTaskLinks(task);
  };

  detectCycles = function dependencyV2DetectCycles() {
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const visiting = new Set();
    const visited = new Set();
    const stack = [];
    const cycles = [];
    const cycleKeys = new Set();

    function canonicalCycle(cycle) {
      const body = cycle.slice(0, -1);
      const min = Math.min(...body);
      const start = body.indexOf(min);
      return [...body.slice(start), ...body.slice(0, start), min].join("→");
    }

    function dfs(id) {
      if (!byId.has(id)) return;
      if (visiting.has(id)) {
        const idx = stack.indexOf(id);
        if (idx >= 0) {
          const cycle = [...stack.slice(idx), id];
          const key = canonicalCycle(cycle);
          if (!cycleKeys.has(key)) {
            cycleKeys.add(key);
            cycles.push(cycle);
          }
        }
        return;
      }
      if (visited.has(id)) return;

      visiting.add(id);
      stack.push(id);
      getTaskLinks(byId.get(id)).forEach((link) => dfs(link.id));
      stack.pop();
      visiting.delete(id);
      visited.add(id);
    }

    tasks.forEach((task) => dfs(task.id));
    return cycles;
  };

  function uniqueIssues(issues) {
    return [...new Set((issues || []).filter(Boolean))];
  }

  if (typeof validateProject === "function") {
    const baseValidateProject = validateProject;
    validateProject = function dependencyV2ValidateProject() {
      const issues = baseValidateProject();
      const idSet = new Set((state.tasks || []).map((task) => task.id));
      const extra = [];

      (state.tasks || []).forEach((task) => {
        const warnings = task.dependencyWarnings || parseWarningsByTaskId.get(task.id) || [];
        warnings.forEach((warning) => extra.push(`Task ${task.id}: ${warning}`));

        const seen = new Set();
        getTaskLinks(task).forEach((link) => {
          const key = `${link.id}:${link.type}`;
          if (seen.has(key)) extra.push(`Task ${task.id} has duplicate predecessor ${formatLink(link)}.`);
          seen.add(key);
          if (!isValidLinkType(link.type)) extra.push(`Task ${task.id} has unsupported dependency type "${link.type}".`);
          if (link.id === task.id) extra.push(`Task ${task.id} cannot depend on itself.`);
          if (!idSet.has(link.id)) extra.push(`Task ${task.id} references missing predecessor ID ${link.id}.`);
          if (!Number.isFinite(Number(link.lagMinutes))) extra.push(`Task ${task.id} has an invalid lag/lead on ${formatLink(link)}.`);
        });
      });

      detectCycles().forEach((cycle) => extra.push(`Dependency loop detected: ${cycle.join(" → ")}.`));
      return uniqueIssues([...issues, ...extra]);
    };
  }

  function applyParsedWarningsToTask(task, rawValue) {
    if (!task) return false;
    const parsed = strictParseLinks(rawValue, task.id);
    task.links = parsed.links;
    task.predecessors = parsed.links.map((link) => link.id);
    task.dependencyWarnings = parsed.warnings;
    parseWarningsByTaskId.set(task.id, parsed.warnings);
    return parsed.warnings.length === 0;
  }

  function hasBlockingDependencyLoop() {
    return typeof detectCycles === "function" && detectCycles().length > 0;
  }

  function alignTaskFromPredecessors(task) {
    if (!task || typeof alignTaskToLinks !== "function") return false;
    const byId = new Map((state.tasks || []).map((candidate) => [candidate.id, candidate]));
    return alignTaskToLinks(task, byId);
  }

  function cascadeSuccessors(task) {
    if (!task || typeof cascadeScheduleFromTask !== "function" || hasBlockingDependencyLoop()) return false;
    return cascadeScheduleFromTask(task.id, { silent: true, render: false });
  }

  function getTaskByStableId(id, fallbackIndex) {
    return (state.tasks || []).find((task) => task.id === id) || state.tasks?.[fallbackIndex] || null;
  }

  if (typeof updateTask === "function") {
    const baseUpdateTask = updateTask;
    updateTask = function dependencyV2UpdateTask(index, field, value) {
      const beforeTask = state.tasks?.[index];
      const stableId = beforeTask?.id;
      const result = baseUpdateTask(index, field, value);
      const task = getTaskByStableId(stableId, index);
      if (!task) return result;

      let needsRender = false;
      if (field === "predecessors") {
        applyParsedWarningsToTask(task, value);
        if (!hasBlockingDependencyLoop()) {
          needsRender = alignTaskFromPredecessors(task) || needsRender;
          needsRender = cascadeSuccessors(task) || needsRender;
        }
      } else if (SCHEDULE_EDIT_FIELDS.has(field)) {
        needsRender = cascadeSuccessors(task) || needsRender;
      }

      if (needsRender && typeof render === "function") render();
      return result;
    };
  }

  if (typeof applyTaskInfoForm === "function") {
    const baseApplyTaskInfoForm = applyTaskInfoForm;
    applyTaskInfoForm = function dependencyV2ApplyTaskInfoForm() {
      const index = taskInfoIndex;
      const beforeTask = state.tasks?.[index];
      const stableId = beforeTask?.id;
      const before = beforeTask ? {
        start: beforeTask.start,
        finish: beforeTask.finish,
        durationMinutes: beforeTask.durationMinutes,
        links: typeof formatLinks === "function" ? formatLinks(getTaskLinks(beforeTask)) : JSON.stringify(getTaskLinks(beforeTask)),
      } : null;
      const rawPredecessors = els.tiPredecessors?.value ?? "";

      const result = baseApplyTaskInfoForm();
      const task = getTaskByStableId(stableId, index);
      if (!task) return result;

      applyParsedWarningsToTask(task, rawPredecessors);
      const afterLinks = typeof formatLinks === "function" ? formatLinks(getTaskLinks(task)) : JSON.stringify(getTaskLinks(task));
      const datesChanged = before && (task.start !== before.start || task.finish !== before.finish || task.durationMinutes !== before.durationMinutes);
      const linksChanged = before && afterLinks !== before.links;

      if ((datesChanged || linksChanged) && !hasBlockingDependencyLoop()) {
        let changed = false;
        if (linksChanged) changed = alignTaskFromPredecessors(task) || changed;
        changed = cascadeSuccessors(task) || changed;
        if (changed && typeof render === "function") render();
      }

      return result;
    };
  }
})();

(() => {
  const STITCH_VERSION = "v0.31.0";

  function loadCssOnce(id, href) {
    const existing = document.getElementById(id);
    if (existing) {
      existing.href = href;
      return;
    }
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScriptOnce(id, src) {
    if (document.getElementById(id)) return;
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.defer = true;
    script.async = false;
    document.body.appendChild(script);
  }

  function bootStitchCanvasLoader() {
    document.body.classList.add("projecthub-stitch-theme");
    loadScriptOnce("calendarEngineV2Js", `calendar-engine-v2.js?${STITCH_VERSION}`);
    loadScriptOnce("durationLogicV2Js", `duration-logic-v2.js?${STITCH_VERSION}`);
    loadCssOnce("stitchThemeCss", `stitch-theme.css?${STITCH_VERSION}`);
    loadCssOnce("stitchCanvasCss", `stitch-canvas.css?${STITCH_VERSION}`);
    loadCssOnce("stitchCanvasFixCss", `stitch-canvas-fix.css?${STITCH_VERSION}`);
    loadCssOnce("stitchSidebarCommandsCss", `stitch-sidebar-commands.css?${STITCH_VERSION}`);
    loadCssOnce("msProjectClassicCss", `ms-project-classic.css?${STITCH_VERSION}`);
    loadCssOnce("msProjectTaskRibbonCss", `ms-project-task-ribbon.css?${STITCH_VERSION}`);
    loadCssOnce("msProjectRibbonCollapseCss", `ms-project-ribbon-collapse.css?${STITCH_VERSION}`);
    loadCssOnce("msProjectProjectRibbonCss", `ms-project-project-ribbon.css?${STITCH_VERSION}`);
    loadScriptOnce("stitchCanvasJs", `stitch-canvas.js?${STITCH_VERSION}`);
    loadScriptOnce("stitchSidebarCommandsJs", `stitch-sidebar-commands.js?${STITCH_VERSION}`);
    loadScriptOnce("msProjectTaskRibbonJs", `ms-project-task-ribbon.js?${STITCH_VERSION}`);
    loadScriptOnce("msProjectRibbonCollapseJs", `ms-project-ribbon-collapse.js?${STITCH_VERSION}`);
    loadScriptOnce("msProjectProjectRibbonJs", `ms-project-project-ribbon.js?${STITCH_VERSION}`);
    loadScriptOnce("criticalPathJs", `app-critical-path.js?${STITCH_VERSION}`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootStitchCanvasLoader, { once: true });
  } else {
    bootStitchCanvasLoader();
  }
})();
