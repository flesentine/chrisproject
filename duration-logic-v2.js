(() => {
  const DURATION_LOGIC_VERSION = "v0.25.0";
  const DURATION_LOGIC_NAME = "Duration logic";
  const DURATION_BUILD_DATE = "2026-06-24";
  let bootAttempts = 0;

  function bootDurationLogicV2() {
    if (window.__durationLogicV2Loaded) return;
    if (typeof state === "undefined" || typeof render !== "function" || typeof getCalendar !== "function") {
      retryBoot();
      return;
    }
    if (!window.__calendarEngineV2Loaded && bootAttempts < 80) {
      retryBoot();
      return;
    }

    window.__durationLogicV2Loaded = true;
    patchDurationRuntime();
    normalizeDurationDataForAllTasks();
    exposeDurationSelfTest();
    render();
  }

  function retryBoot() {
    bootAttempts += 1;
    if (bootAttempts <= 80) window.setTimeout(bootDurationLogicV2, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootDurationLogicV2, { once: true });
  } else {
    bootDurationLogicV2();
  }

  function classifyDurationUnit(unitText) {
    let unit = String(unitText || "d").trim().toLowerCase();
    let elapsed = false;
    if (unit.startsWith("e") && unit.length > 1) {
      elapsed = true;
      unit = unit.slice(1);
    }
    if (["week", "weeks", "wk", "wks", "w"].includes(unit)) return { unit: "w", elapsed };
    if (["day", "days", "d"].includes(unit)) return { unit: "d", elapsed };
    if (["hour", "hours", "hr", "hrs", "h"].includes(unit)) return { unit: "h", elapsed };
    if (["minute", "minutes", "min", "mins", "m"].includes(unit)) return { unit: "m", elapsed };
    return { unit: "d", elapsed };
  }

  function parseIsoDurationMinutes(text, fallbackMinutes) {
    const isoHours = /^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(text);
    if (isoHours) {
      const h = Number(isoHours[1] || 0);
      const m = Number(isoHours[2] || 0);
      const sec = Number(isoHours[3] || 0);
      return normalizeDurationMinutes(h * 60 + m + sec / 60, 0);
    }

    const isoDays = /^P(?:(\d+(?:\.\d+)?)D)$/i.exec(text);
    if (isoDays) return normalizeDurationMinutes(Number(isoDays[1]) * getCalendar().minutesPerDay, fallbackMinutes);
    return null;
  }

  function parseDurationSpec(value, fallbackMinutes = getCalendar().minutesPerDay) {
    const fallback = normalizeDurationMinutes(fallbackMinutes, getCalendar().minutesPerDay);
    const original = String(value ?? "").trim();
    const text = original.toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return { minutes: fallback, unit: inferDurationUnit(fallback), elapsed: false, source: original };
    if (/^(milestone|zero|0|0\s*d|0\s*day|0\s*days)$/i.test(text)) return { minutes: 0, unit: "d", elapsed: false, source: original };

    const iso = parseIsoDurationMinutes(text, fallback);
    if (iso !== null) return { minutes: iso, unit: inferDurationUnit(iso), elapsed: false, source: original };

    const calendar = getCalendar();
    const weekMinutes = Math.max(1, calendar.workingDays.length || 5) * calendar.minutesPerDay;
    const tokenPattern = /(\d+(?:\.\d+)?)\s*(e?weeks?|e?wks?|e?wk|e?w|e?days?|e?d|e?hours?|e?hrs?|e?hr|e?h|e?minutes?|e?mins?|e?min|e?m|weeks?|wks?|wk|w|days?|d|hours?|hrs?|hr|h|minutes?|mins?|min|m)?\b/g;
    let total = 0;
    let matched = false;
    let elapsed = false;
    let lastUnit = "d";
    let match;

    while ((match = tokenPattern.exec(text)) !== null) {
      const amount = Number(match[1]);
      if (!Number.isFinite(amount) || amount < 0) continue;
      const classified = classifyDurationUnit(match[2] || "d");
      matched = true;
      elapsed = elapsed || classified.elapsed;
      lastUnit = classified.unit;
      if (classified.unit === "w") total += amount * weekMinutes;
      else if (classified.unit === "d") total += amount * calendar.minutesPerDay;
      else if (classified.unit === "h") total += amount * 60;
      else total += amount;
    }

    if (matched) {
      return {
        minutes: normalizeDurationMinutes(total, fallback),
        unit: lastUnit,
        elapsed,
        source: original,
      };
    }

    const numeric = Number(text);
    if (Number.isFinite(numeric) && numeric >= 0) {
      return {
        minutes: normalizeDurationMinutes(numeric * calendar.minutesPerDay, fallback),
        unit: "d",
        elapsed: false,
        source: original,
      };
    }

    return { minutes: fallback, unit: inferDurationUnit(fallback), elapsed: false, source: original };
  }

  function inferDurationUnit(minutes) {
    const safe = normalizeDurationMinutes(minutes, 0);
    if (safe === 0) return "d";
    const dayMinutes = getCalendar().minutesPerDay;
    if (safe % dayMinutes === 0) return "d";
    if (safe % 60 === 0) return "h";
    return "m";
  }

  function setDurationMetadata(task, spec) {
    if (!task) return;
    const minutes = normalizeDurationMinutes(spec?.minutes ?? task.durationMinutes, 0);
    task.durationMinutes = minutes;
    task.durationDays = durationMinutesToWorkingDays(minutes);
    task.isMilestone = minutes === 0;
    task.durationUnit = spec?.unit || inferDurationUnit(minutes);
    task.durationKind = spec?.elapsed ? "elapsed" : "working";
    task.durationIsElapsed = Boolean(spec?.elapsed);
    if (spec?.elapsed) task.elapsedDurationMinutes = minutes;
    else if (!task.elapsedDurationMinutes) task.elapsedDurationMinutes = 0;
  }

  function setMilestoneAt(task, value) {
    if (!task) return;
    const date = toDateInputValue(nextWorkingDay(value || task.start || state.projectStart || today, true));
    task.start = date;
    task.finish = date;
    setDurationMetadata(task, { minutes: 0, unit: "d", elapsed: false, source: "0d" });
  }

  function normalizeLeafTaskDuration(task, index = -1) {
    if (!task) return;
    const isSummary = index >= 0 && typeof isSummaryIndex === "function" ? isSummaryIndex(index) : Boolean(task.isSummary);
    if (isSummary) return;

    const start = normalizeDateValue(task.start) || state.projectStart || today;
    const duration = normalizeDurationMinutes(task.durationMinutes, workingSpanMinutes(start, task.finish || start));
    const explicitMilestone = task.isMilestone === true || duration === 0;
    if (explicitMilestone) {
      setMilestoneAt(task, task.start || start);
      return;
    }

    task.start = toDateInputValue(nextWorkingDay(start, true));
    task.finish = normalizeDateValue(task.finish) || toDateInputValue(finishFromStartByDuration(task.start, duration));
    setDurationMetadata(task, { minutes: duration, unit: task.durationUnit || inferDurationUnit(duration), elapsed: task.durationIsElapsed });
  }

  function normalizeDurationDataForAllTasks() {
    if (!Array.isArray(state.tasks)) return;
    state.tasks.forEach((task, index) => normalizeLeafTaskDuration(task, index));
  }

  function clearAutomaticProgressDuration(task, field) {
    if (!task || !["percent", "duration", "start", "finish"].includes(field)) return;
    if (task.remainingDurationManual === true) return;
    delete task.remainingDurationMinutes;
    delete task.actualDurationMinutes;
  }

  function patchDurationRuntime() {
    const baseParseDurationInput = typeof parseDurationInput === "function" ? parseDurationInput : null;
    parseDurationInput = function durationV2ParseDurationInput(value, fallbackMinutes = getCalendar().minutesPerDay) {
      return parseDurationSpec(value, fallbackMinutes).minutes;
    };

    const baseDurationToMinutes = typeof durationToMinutes === "function" ? durationToMinutes : null;
    durationToMinutes = function durationV2DurationToMinutes(durationText) {
      const text = String(durationText || "").trim();
      if (/^P/i.test(text)) {
        const iso = parseIsoDurationMinutes(text, getCalendar().minutesPerDay);
        if (iso !== null) return iso;
        if (baseDurationToMinutes) return baseDurationToMinutes(durationText);
      }
      return parseDurationInput(text, getCalendar().minutesPerDay);
    };

    durationToDays = function durationV2DurationToDays(durationText) {
      return durationMinutesToWorkingDays(durationToMinutes(durationText));
    };

    formatDuration = function durationV2FormatDuration(minutes) {
      const safeMinutes = normalizeDurationMinutes(minutes, getCalendar().minutesPerDay);
      if (safeMinutes === 0) return "0d";
      const dayMinutes = getCalendar().minutesPerDay;
      if (safeMinutes % dayMinutes === 0) return `${safeMinutes / dayMinutes}d`;
      if (safeMinutes % 60 === 0) return `${safeMinutes / 60}h`;
      return `${safeMinutes}m`;
    };

    const baseSetTaskStartKeepDuration = setTaskStartKeepDuration;
    setTaskStartKeepDuration = function durationV2SetTaskStartKeepDuration(task, start, durationMinutes = task?.durationMinutes ?? getCalendar().minutesPerDay) {
      if (!task) return;
      const minutes = normalizeDurationMinutes(durationMinutes, getCalendar().minutesPerDay);
      if (minutes <= 0) {
        setMilestoneAt(task, start || task.start || state.projectStart || today);
        return;
      }
      baseSetTaskStartKeepDuration(task, start, minutes);
      setDurationMetadata(task, { minutes, unit: task.durationUnit || inferDurationUnit(minutes), elapsed: task.durationIsElapsed });
    };

    const baseSetTaskFinishKeepDuration = setTaskFinishKeepDuration;
    setTaskFinishKeepDuration = function durationV2SetTaskFinishKeepDuration(task, finish, durationMinutes = task?.durationMinutes ?? getCalendar().minutesPerDay) {
      if (!task) return;
      const minutes = normalizeDurationMinutes(durationMinutes, getCalendar().minutesPerDay);
      if (minutes <= 0) {
        setMilestoneAt(task, finish || task.finish || task.start || state.projectStart || today);
        return;
      }
      baseSetTaskFinishKeepDuration(task, finish, minutes);
      setDurationMetadata(task, { minutes, unit: task.durationUnit || inferDurationUnit(minutes), elapsed: task.durationIsElapsed });
    };

    const baseEnsureDecorations = ensureDecorations;
    ensureDecorations = function durationV2EnsureDecorations() {
      baseEnsureDecorations();
      normalizeDurationDataForAllTasks();
    };

    const baseUpdateTask = updateTask;
    updateTask = function durationV2UpdateTask(index, field, value) {
      const task = state.tasks?.[index];
      if (!task) return baseUpdateTask(index, field, value);

      selectTask(index);
      if (task.isSummary && ["start", "finish", "percent", "duration"].includes(field)) {
        render();
        return;
      }

      clearAutomaticProgressDuration(task, field);

      if (field === "duration") {
        const spec = parseDurationSpec(value, task.durationMinutes || getCalendar().minutesPerDay);
        if (spec.minutes <= 0) setMilestoneAt(task, task.start || state.projectStart || today);
        else {
          task.durationUnit = spec.unit;
          task.durationIsElapsed = spec.elapsed;
          setTaskStartKeepDuration(task, task.start || state.projectStart || today, spec.minutes);
          setDurationMetadata(task, spec);
        }
        pendingCascadeChoice = null;
        render();
        return;
      }

      if (field === "finish") {
        const wasMilestone = normalizeDurationMinutes(task.durationMinutes, 0) === 0 || task.isMilestone === true;
        const finish = previousWorkingDay(value || task.finish || task.start || state.projectStart || today, true);
        if (wasMilestone) setMilestoneAt(task, finish);
        else {
          const start = nextWorkingDay(task.start || state.projectStart || today, true);
          const snappedFinish = dateOnly(finish) < dateOnly(start) ? start : finish;
          task.start = toDateInputValue(start);
          task.finish = toDateInputValue(snappedFinish);
          const minutes = workingSpanMinutes(task.start, task.finish);
          setDurationMetadata(task, { minutes, unit: inferDurationUnit(minutes), elapsed: false });
        }
        pendingCascadeChoice = null;
        render();
        return;
      }

      if (field === "start" && (normalizeDurationMinutes(task.durationMinutes, 0) === 0 || task.isMilestone === true)) {
        setMilestoneAt(task, value || state.projectStart || today);
        pendingCascadeChoice = null;
        render();
        return;
      }

      const result = baseUpdateTask(index, field, value);
      normalizeLeafTaskDuration(task, index);
      return result;
    };

    if (typeof applyTaskInfoForm === "function") {
      const baseApplyTaskInfoForm = applyTaskInfoForm;
      applyTaskInfoForm = function durationV2ApplyTaskInfoForm() {
        const index = taskInfoIndex;
        const durationText = els.tiDuration?.value || "";
        const milestoneChecked = Boolean(els.tiMilestone?.checked);
        const preferredFinish = normalizeDateValue(els.tiFinish?.value);
        const preferredStart = normalizeDateValue(els.tiStart?.value);
        const result = baseApplyTaskInfoForm();
        const task = state.tasks?.[index];
        if (!task || isSummaryIndex(index)) return result;

        if (milestoneChecked) {
          setMilestoneAt(task, preferredFinish || preferredStart || task.start || state.projectStart || today);
          render();
          return result;
        }

        const spec = parseDurationSpec(durationText, task.durationMinutes || getCalendar().minutesPerDay);
        task.durationUnit = spec.unit;
        task.durationIsElapsed = spec.elapsed;
        normalizeLeafTaskDuration(task, index);
        return result;
      };
    }

    const baseRenderVersion = renderVersion;
    renderVersion = function durationV2RenderVersion() {
      baseRenderVersion();
      const text = `${DURATION_LOGIC_VERSION} · ${DURATION_LOGIC_NAME}`;
      if (els.appVersionBadge) {
        els.appVersionBadge.textContent = text;
        els.appVersionBadge.title = `Build ${DURATION_BUILD_DATE}`;
      }
      if (els.appVersionFooter) {
        els.appVersionFooter.textContent = `${text} · Build ${DURATION_BUILD_DATE}`;
      }
      const ribbonVersionText = document.getElementById("ribbonVersionText");
      if (ribbonVersionText) ribbonVersionText.textContent = `${DURATION_LOGIC_VERSION} · duration logic`;
      const compatChip = document.getElementById("compatChip");
      if (compatChip) compatChip.lastChild.textContent = " Duration logic ready";
    };

    window.parseDurationSpec = parseDurationSpec;
    window.__durationLogicV2BaseParseDurationInput = baseParseDurationInput;
  }

  function exposeDurationSelfTest() {
    window.__durationLogicV2SelfTest = () => {
      const savedState = JSON.parse(JSON.stringify(state));
      const savedSelected = selectedTaskIndex;
      const results = {};
      try {
        state.calendar = normalizeCalendar({ name: "Standard", workingDays: [1, 2, 3, 4, 5], exceptions: [], minutesPerDay: 480 });
        state.projectStart = "2026-07-06";
        results.mondayFiveDayFinish = toDateInputValue(finishFromStartByDuration("2026-07-06", parseDurationInput("5d")));
        results.fridayFiveDayFinish = toDateInputValue(finishFromStartByDuration("2026-07-03", parseDurationInput("5d")));

        state.tasks = [{
          uid: 1,
          id: 1,
          name: "Duration test",
          notes: "",
          start: "2026-07-06",
          finish: "2026-07-10",
          durationMinutes: parseDurationInput("5d"),
          durationDays: 5,
          percent: 0,
          predecessors: [],
          links: [],
          outlineLevel: 1,
          isSummary: false,
          expanded: true,
          constraintType: "ASAP",
          constraintDate: "",
          deadline: "",
          assignments: [],
        }];
        state.nextUid = 2;

        updateTask(0, "duration", "0d");
        results.zeroDurationMilestone = state.tasks[0].isMilestone === true && state.tasks[0].start === state.tasks[0].finish && state.tasks[0].durationMinutes === 0;

        updateTask(0, "start", "2026-07-06");
        updateTask(0, "duration", "2d");
        results.durationEditFinish = state.tasks[0].finish;
        results.durationEditPassed = state.tasks[0].finish === "2026-07-07";

        updateTask(0, "finish", "2026-07-10");
        results.finishEditDuration = formatDuration(state.tasks[0].durationMinutes);
        results.finishEditPassed = results.finishEditDuration === "5d";

        results.minutesParsed = parseDurationInput("90m") === 90;
        results.hoursParsed = parseDurationInput("4h") === 240;
        results.weeksParsed = parseDurationInput("1w") === getCalendar().minutesPerDay * 5;
        results.mondayAcceptancePassed = results.mondayFiveDayFinish === "2026-07-10";
        results.fridayAcceptancePassed = results.fridayFiveDayFinish === "2026-07-09";
        results.version = DURATION_LOGIC_VERSION;
        return results;
      } finally {
        state = savedState;
        selectedTaskIndex = savedSelected;
        render();
      }
    };
  }
})();
