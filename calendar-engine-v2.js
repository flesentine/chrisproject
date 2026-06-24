(() => {
  const CALENDAR_ENGINE_VERSION = "v0.24.0";
  const CALENDAR_ENGINE_NAME = "Real calendar engine";
  const CALENDAR_BUILD_DATE = "2026-06-24";

  function bootCalendarEngineV2() {
    if (typeof state === "undefined" || typeof render !== "function") {
      console.warn("Calendar engine v2 could not find the planner runtime.");
      return;
    }
    if (window.__calendarEngineV2Loaded) return;
    window.__calendarEngineV2Loaded = true;

    patchCalendarRuntime();
    installCalendarHoursControl();
    installCalendarStyles();
    state.calendar = normalizeCalendar(state.calendar);
    refreshCalendarControls();
    exposeCalendarSelfTest();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootCalendarEngineV2, { once: true });
  } else {
    bootCalendarEngineV2();
  }

  function parseTimeToMinutes(value, fallback = 8 * 60) {
    const text = String(value || "").trim();
    const match = /^(\d{1,2})(?::(\d{2}))?(?::\d{2})?$/.exec(text);
    if (!match) return fallback;
    const hours = Number(match[1]);
    const minutes = Number(match[2] || 0);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallback;
    return Math.min(23 * 60 + 59, Math.max(0, hours * 60 + minutes));
  }

  function minutesToTime(value) {
    const minutes = Math.min(23 * 60 + 59, Math.max(0, Math.round(Number(value) || 0)));
    const h = String(Math.floor(minutes / 60)).padStart(2, "0");
    const m = String(minutes % 60).padStart(2, "0");
    return `${h}:${m}:00`;
  }

  function deriveFinishTime(startTime, workMinutes) {
    const start = parseTimeToMinutes(startTime, 8 * 60);
    const minutes = Math.max(0, Math.round(Number(workMinutes) || 480));
    const lunchBreak = minutes > 4 * 60 ? 60 : 0;
    return minutesToTime(start + minutes + lunchBreak);
  }

  function decimalHours(minutes) {
    const value = Math.round((Math.max(1, Number(minutes) || 480) / 60) * 100) / 100;
    return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, "").replace(/\.$/, "");
  }

  function normalizeHoursPerDay(value, fallbackMinutes = 480) {
    const raw = String(value ?? "").trim().toLowerCase();
    if (!raw) return Math.max(60, Math.round(Number(fallbackMinutes) || 480));
    const numeric = Number(raw.replace(/[^0-9.]+/g, ""));
    if (!Number.isFinite(numeric) || numeric <= 0) return Math.max(60, Math.round(Number(fallbackMinutes) || 480));
    const hours = raw.includes("m") && !raw.includes("h") ? numeric / 60 : numeric;
    return Math.min(24 * 60, Math.max(60, Math.round(hours * 60)));
  }

  function sortedUniqueDates(values = []) {
    return [...new Set((values || [])
      .map((value) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim())) return String(value).trim();
        const parsed = dateOnly(value);
        return parsed ? toDateInputValue(parsed) : null;
      })
      .filter(Boolean))].sort();
  }

  function getWorkingTimeBlocks(calendar = getCalendar()) {
    const start = parseTimeToMinutes(calendar.defaultStartTime, 8 * 60);
    const total = Math.max(1, Math.round(Number(calendar.minutesPerDay) || 480));
    const morning = Math.min(4 * 60, total);
    const afternoon = Math.max(0, total - morning);
    const blocks = [{ from: start, to: start + morning }];
    if (afternoon > 0) blocks.push({ from: start + morning + 60, to: start + morning + 60 + afternoon });
    return blocks.map((block) => ({ from: minutesToTime(block.from), to: minutesToTime(block.to) }));
  }

  function patchCalendarRuntime() {
    const baseNormalizeCalendar = normalizeCalendar;
    normalizeCalendar = function calendarV2NormalizeCalendar(calendar = {}) {
      const old = baseNormalizeCalendar(calendar || {});
      const rawMinutes = calendar.minutesPerDay ?? calendar.minutes_per_day ?? calendar.workingMinutesPerDay ?? calendar.working_minutes_per_day;
      const hoursValue = calendar.workingHoursPerDay ?? calendar.working_hours_per_day ?? calendar.hoursPerDay ?? calendar.hours_per_day;
      const minutesPerDay = rawMinutes !== undefined
        ? normalizeHoursPerDay(`${Number(rawMinutes) / 60}h`, old.minutesPerDay)
        : normalizeHoursPerDay(hoursValue, old.minutesPerDay);
      const defaultStartTime = calendar.defaultStartTime || old.defaultStartTime || "08:00:00";
      const defaultFinishTime = calendar.defaultFinishTime || deriveFinishTime(defaultStartTime, minutesPerDay);
      return {
        ...old,
        name: calendar.name || old.name || "Standard",
        workingDays: old.workingDays.length ? old.workingDays : [1, 2, 3, 4, 5],
        exceptions: sortedUniqueDates(old.exceptions),
        minutesPerDay,
        workingHoursPerDay: minutesPerDay / 60,
        defaultStartTime,
        defaultFinishTime,
      };
    };

    getCalendar = function calendarV2GetCalendar() {
      state.calendar = normalizeCalendar(state.calendar || STANDARD_CALENDAR);
      return state.calendar;
    };

    durationMinutesToWorkingDays = function calendarV2DurationMinutesToWorkingDays(minutes) {
      const value = normalizeDurationMinutes(minutes, getCalendar().minutesPerDay);
      if (value <= 0) return 0;
      return Math.max(1, Math.ceil(value / getCalendar().minutesPerDay));
    };

    workingSpanMinutes = function calendarV2WorkingSpanMinutes(start, finish) {
      return workDaysBetween(start, finish) * getCalendar().minutesPerDay;
    };

    finishFromStartByDuration = function calendarV2FinishFromStartByDuration(start, durationMinutes) {
      const snappedStart = nextWorkingDay(start || state.projectStart || today, true);
      const minutes = normalizeDurationMinutes(durationMinutes, getCalendar().minutesPerDay);
      if (minutes <= 0) return snappedStart;
      return addWorkingMinutesInclusive(snappedStart, minutes, 1);
    };

    startFromFinishByDuration = function calendarV2StartFromFinishByDuration(finish, durationMinutes) {
      const snappedFinish = previousWorkingDay(finish || state.projectStart || today, true);
      const minutes = normalizeDurationMinutes(durationMinutes, getCalendar().minutesPerDay);
      if (minutes <= 0) return snappedFinish;
      return addWorkingMinutesInclusive(snappedFinish, minutes, -1);
    };

    applyLagToWorkingDate = function calendarV2ApplyLagToWorkingDate(value, lagMinutes = 0) {
      const base = nextWorkingDay(value, true);
      const minutes = normalizeLagMinutes(lagMinutes);
      if (!minutes) return base;
      return addWorkingMinutesExclusive(base, Math.abs(minutes), minutes > 0 ? 1 : -1);
    };

    setTaskStartKeepDuration = function calendarV2SetTaskStartKeepDuration(task, start, durationMinutes = task?.durationMinutes ?? getCalendar().minutesPerDay) {
      if (!task) return;
      const minutes = normalizeDurationMinutes(durationMinutes, getCalendar().minutesPerDay);
      const snappedStart = nextWorkingDay(start || state.projectStart || today, true);
      const finish = finishFromStartByDuration(snappedStart, minutes);
      task.start = toDateInputValue(snappedStart);
      task.finish = toDateInputValue(finish);
      task.durationMinutes = minutes;
      task.durationDays = durationMinutesToWorkingDays(minutes);
      task.isMilestone = minutes === 0;
    };

    setTaskFinishKeepDuration = function calendarV2SetTaskFinishKeepDuration(task, finish, durationMinutes = task?.durationMinutes ?? getCalendar().minutesPerDay) {
      if (!task) return;
      const minutes = normalizeDurationMinutes(durationMinutes, getCalendar().minutesPerDay);
      const snappedFinish = previousWorkingDay(finish || task.finish || task.start || state.projectStart || today, true);
      const start = startFromFinishByDuration(snappedFinish, minutes);
      task.start = toDateInputValue(start);
      task.finish = toDateInputValue(snappedFinish);
      task.durationMinutes = minutes;
      task.durationDays = durationMinutesToWorkingDays(minutes);
      task.isMilestone = minutes === 0;
    };

    toProjectDate = function calendarV2ToProjectDate(value, endOfDay = false) {
      const day = toDateInputValue(value);
      const calendar = getCalendar();
      return `${day}T${endOfDay ? calendar.defaultFinishTime : calendar.defaultStartTime}`;
    };

    const baseRefreshCalendarControls = refreshCalendarControls;
    refreshCalendarControls = function calendarV2RefreshCalendarControls() {
      baseRefreshCalendarControls();
      const calendar = getCalendar();
      if (els.workingHoursPerDayInput) els.workingHoursPerDayInput.value = decimalHours(calendar.minutesPerDay);
      if (els.calendarStatus) {
        const holidayText = calendar.exceptions.length ? `${calendar.exceptions.length} non-working exception${calendar.exceptions.length === 1 ? "" : "s"}` : "no exceptions";
        els.calendarStatus.textContent = `${calendar.name || "Standard"}: ${formatWorkingDays(calendar.workingDays).replaceAll(",", ", ")} · ${decimalHours(calendar.minutesPerDay)}h/day · ${holidayText}`;
        els.calendarStatus.title = "Phase 1 calendar engine: task durations now consume working days, weekends, holidays, and hours/day.";
      }
    };

    const baseBuildCalendarsXml = buildCalendarsXml;
    buildCalendarsXml = function calendarV2BuildCalendarsXml() {
      const calendar = getCalendar();
      const workingTimeXml = getWorkingTimeBlocks(calendar).map((block) => `
            <WorkingTime>
              <FromTime>${escapeXml(block.from)}</FromTime>
              <ToTime>${escapeXml(block.to)}</ToTime>
            </WorkingTime>`).join("");
      const weekDays = DAY_SHORT_NAMES.map((name, day) => {
        const working = calendar.workingDays.includes(day) ? 1 : 0;
        const times = working ? `
          <WorkingTimes>${workingTimeXml}
          </WorkingTimes>` : "";
        return `
        <WeekDay>
          <DayType>${day + 1}</DayType>
          <DayWorking>${working}</DayWorking>${times}
        </WeekDay>`;
      }).join("");
      const exceptions = calendar.exceptions.map((date, index) => `
        <Exception>
          <EnteredByOccurrences>0</EnteredByOccurrences>
          <TimePeriod>
            <FromDate>${escapeXml(date)}T00:00:00</FromDate>
            <ToDate>${escapeXml(date)}T23:59:00</ToDate>
          </TimePeriod>
          <Occurrences>1</Occurrences>
          <Name>Non-working exception ${index + 1}</Name>
          <Type>1</Type>
          <DayWorking>0</DayWorking>
        </Exception>`).join("");

      return `<Calendars>
    <Calendar>
      <UID>1</UID>
      <Name>${escapeXml(calendar.name || "Standard")}</Name>
      <IsBaseCalendar>1</IsBaseCalendar>
      <BaseCalendarUID>-1</BaseCalendarUID>
      <WeekDays>${weekDays}
      </WeekDays>${exceptions ? `
      <Exceptions>${exceptions}
      </Exceptions>` : ""}
    </Calendar>
  </Calendars>` || baseBuildCalendarsXml();
    };

    const baseBuildProjectXml = buildProjectXml;
    buildProjectXml = function calendarV2BuildProjectXml() {
      const calendar = getCalendar();
      return baseBuildProjectXml()
        .replace("<DefaultStartTime>08:00:00</DefaultStartTime>", `<DefaultStartTime>${escapeXml(calendar.defaultStartTime)}</DefaultStartTime>`)
        .replace("<DefaultFinishTime>17:00:00</DefaultFinishTime>", `<DefaultFinishTime>${escapeXml(calendar.defaultFinishTime)}</DefaultFinishTime>`)
        .replace("<MinutesPerDay>480</MinutesPerDay>", `<MinutesPerDay>${calendar.minutesPerDay}</MinutesPerDay>`)
        .replace("<MinutesPerWeek>2400</MinutesPerWeek>", `<MinutesPerWeek>${calendar.minutesPerDay * Math.max(1, calendar.workingDays.length)}</MinutesPerWeek>`)
        .replace("<DaysPerMonth>20</DaysPerMonth>", `<DaysPerMonth>${Math.max(1, calendar.workingDays.length) * 4}</DaysPerMonth>`);
    };

    const baseRenderVersion = renderVersion;
    renderVersion = function calendarV2RenderVersion() {
      baseRenderVersion();
      const text = `${CALENDAR_ENGINE_VERSION} · ${CALENDAR_ENGINE_NAME}`;
      if (els.appVersionBadge) {
        els.appVersionBadge.textContent = text;
        els.appVersionBadge.title = `Build ${CALENDAR_BUILD_DATE}`;
      }
      if (els.appVersionFooter) {
        els.appVersionFooter.textContent = `${text} · Build ${CALENDAR_BUILD_DATE}`;
      }
      const ribbonVersionText = document.getElementById("ribbonVersionText");
      if (ribbonVersionText) ribbonVersionText.textContent = `${CALENDAR_ENGINE_VERSION} · real calendar engine`;
      const compatChip = document.getElementById("compatChip");
      if (compatChip) compatChip.lastChild.textContent = " Calendar math ready";
    };
  }

  function addWorkingMinutesInclusive(value, minutes, direction) {
    let date = direction > 0 ? nextWorkingDay(value, true) : previousWorkingDay(value, true);
    let remaining = Math.max(0, Math.round(Number(minutes) || 0));
    let guard = 0;
    while (remaining > 0 && guard < 5000) {
      if (isWorkingDay(date)) {
        const dayMinutes = getCalendar().minutesPerDay;
        if (remaining <= dayMinutes) return date;
        remaining -= dayMinutes;
      }
      date = direction > 0 ? nextWorkingDay(date, false) : previousWorkingDay(date, false);
      guard += 1;
    }
    return date;
  }

  function addWorkingMinutesExclusive(value, minutes, direction) {
    let date = direction > 0 ? nextWorkingDay(value, false) : previousWorkingDay(value, false);
    let remaining = Math.max(0, Math.round(Number(minutes) || 0));
    if (remaining <= 0) return date;
    let guard = 0;
    while (remaining > 0 && guard < 5000) {
      if (isWorkingDay(date)) {
        const dayMinutes = getCalendar().minutesPerDay;
        if (remaining <= dayMinutes) return date;
        remaining -= dayMinutes;
      }
      date = direction > 0 ? nextWorkingDay(date, false) : previousWorkingDay(date, false);
      guard += 1;
    }
    return date;
  }

  function installCalendarHoursControl() {
    const projectPanel = document.querySelector('[data-ribbon-panel="project"]');
    const calendarGroup = document.querySelector(".project-calendar-group:nth-of-type(2)") || projectPanel;
    if (!calendarGroup || document.getElementById("workingHoursPerDayInput")) {
      els.workingHoursPerDayInput = document.getElementById("workingHoursPerDayInput");
      return;
    }

    const label = document.createElement("label");
    label.className = "ribbon-field compact-hours-field";
    label.innerHTML = `Hours/day<input id="workingHoursPerDayInput" inputmode="decimal" min="1" max="24" step="0.25" type="number" title="Working hours per day for the Standard calendar"/>`;
    calendarGroup.appendChild(label);
    els.workingHoursPerDayInput = label.querySelector("input");

    const recalcAndRender = () => {
      normalizeCalendarAndRecalculateTasks();
      render();
    };

    els.workingHoursPerDayInput.addEventListener("change", () => {
      const current = getCalendar();
      state.calendar = normalizeCalendar({ ...current, workingHoursPerDay: els.workingHoursPerDayInput.value });
      recalcAndRender();
    });

    els.workingDaysInput?.addEventListener("change", () => {
      window.setTimeout(recalcAndRender, 0);
    });

    els.holidayInput?.addEventListener("change", () => {
      window.setTimeout(recalcAndRender, 0);
    });
  }

  function normalizeCalendarAndRecalculateTasks() {
    state.calendar = normalizeCalendar(state.calendar || STANDARD_CALENDAR);
    if (!Array.isArray(state.tasks)) return;
    ensureDecorations();
    state.tasks.forEach((task, index) => {
      if (!task || isSummaryIndex(index)) return;
      const duration = normalizeDurationMinutes(task.durationMinutes, workingSpanMinutes(task.start, task.finish));
      setTaskStartKeepDuration(task, task.start || state.projectStart || today, duration);
    });
    if (typeof scheduleAllLinkedTasks === "function") scheduleAllLinkedTasks({ silent: true, render: false });
    if (typeof rollupSummaryTasks === "function") rollupSummaryTasks();
  }

  function installCalendarStyles() {
    if (document.getElementById("calendarEngineV2Styles")) return;
    const style = document.createElement("style");
    style.id = "calendarEngineV2Styles";
    style.textContent = `
      .compact-hours-field input {
        min-width: 86px;
        max-width: 96px;
      }
      .planner-date-cell.is-nonworking {
        background-image: repeating-linear-gradient(135deg, rgba(100,116,139,0.12) 0 6px, transparent 6px 12px);
      }
      .nonworking-band {
        background-image: repeating-linear-gradient(135deg, rgba(100,116,139,0.10) 0 8px, rgba(100,116,139,0.04) 8px 16px);
      }
      .planner-date-cell.is-holiday,
      .nonworking-band[title^="Holiday"] {
        box-shadow: inset 0 0 0 1px rgba(180,83,9,0.12);
      }
    `;
    document.head.appendChild(style);
  }

  function exposeCalendarSelfTest() {
    window.__calendarEngineV2SelfTest = () => {
      const savedCalendar = state.calendar;
      state.calendar = normalizeCalendar({ name: "Standard", workingDays: [1, 2, 3, 4, 5], exceptions: [], minutesPerDay: 480 });
      const fridayFiveDayFinish = toDateInputValue(finishFromStartByDuration("2026-07-03", 5 * getCalendar().minutesPerDay));
      const mondayFiveDayFinish = toDateInputValue(finishFromStartByDuration("2026-07-06", 5 * getCalendar().minutesPerDay));
      const holidayFinish = (() => {
        state.calendar = normalizeCalendar({ name: "Standard", workingDays: [1, 2, 3, 4, 5], exceptions: ["2026-07-07"], minutesPerDay: 480 });
        return toDateInputValue(finishFromStartByDuration("2026-07-06", 3 * getCalendar().minutesPerDay));
      })();
      state.calendar = savedCalendar;
      return {
        version: CALENDAR_ENGINE_VERSION,
        fridayFiveDayFinish,
        fridayAcceptancePassed: fridayFiveDayFinish === "2026-07-09",
        mondayFiveDayFinish,
        mondayAcceptancePassed: mondayFiveDayFinish === "2026-07-10",
        holidayFinish,
        holidaySkippedPassed: holidayFinish === "2026-07-09",
      };
    };
  }
})();
