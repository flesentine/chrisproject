(() => {
  const VERSION = "v0.35.0";
  const VERSION_NAME = "Baseline variance columns";
  const BASELINE_COLUMNS = [
    { key: "baselineStart", label: "BL Start", defaultWidth: 114, min: 96, max: 170 },
    { key: "baselineFinish", label: "BL Finish", defaultWidth: 114, min: 96, max: 170 },
    { key: "baselineDuration", label: "BL Dur", defaultWidth: 84, min: 70, max: 130 },
    { key: "startVariance", label: "Start Var", defaultWidth: 94, min: 78, max: 140 },
    { key: "finishVariance", label: "Finish Var", defaultWidth: 94, min: 78, max: 140 },
    { key: "durationVariance", label: "Dur Var", defaultWidth: 86, min: 74, max: 132 },
  ];

  let tries = 0;

  function ready() {
    return typeof state !== "undefined" && Array.isArray(FIELD_COLUMNS) && typeof FIELD_COLUMN_MAP !== "undefined" &&
      typeof render === "function" && typeof renderGantt === "function" && typeof baselineVariance === "function" &&
      typeof hasBaseline === "function" && typeof normalizeBaseline === "function" && typeof formatDuration === "function" &&
      typeof formatDayVariance === "function" && typeof formatDurationVariance === "function" && typeof getTotalFieldColumnWidth === "function" &&
      typeof getFieldPaneWidth === "function" && typeof saveUiPrefs === "function" && typeof applyUiPrefs === "function";
  }

  function boot() {
    if (window.__baselineVarianceColumnsLoaded) return;
    if (!ready()) {
      if (++tries < 120) window.setTimeout(boot, 75);
      return;
    }
    window.__baselineVarianceColumnsLoaded = true;
    installStyles();
    patchVarianceMath();
    installFieldColumns();
    patchRenderers();
    setBaselineVersionLabel();
    render();
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, { once: true }) : boot();

  function installStyles() {
    if (document.getElementById("baselineVarianceColumnStyles")) return;
    const style = document.createElement("style");
    style.id = "baselineVarianceColumnStyles";
    style.textContent = `
      .baseline-grid-cell { background: rgba(248, 250, 252, 0.72); }
      .planner-row:nth-child(even) .baseline-grid-cell { background: rgba(241, 245, 249, 0.54); }
      .baseline-grid-value { display: inline-flex; align-items: center; min-width: 0; max-width: 100%; min-height: 26px; padding: 3px 7px; border-radius: 8px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #344054; background: rgba(255,255,255,.82); border: 1px solid rgba(189,203,224,.72); font-size: 11px; font-weight: 760; }
      .baseline-grid-cell.no-baseline .baseline-grid-value { color: #8a97aa; background: transparent; border-color: transparent; }
      .baseline-grid-cell.is-variance .baseline-grid-value { justify-content: center; min-width: 50px; }
      .baseline-grid-cell.is-positive .baseline-grid-value { color: #92400e; background: #fff7ed; border-color: #fed7aa; }
      .baseline-grid-cell.is-negative .baseline-grid-value { color: #166534; background: #ecfdf3; border-color: #bbf7d0; }
      .baseline-grid-cell.is-zero .baseline-grid-value { color: #475467; background: #f8fafc; }
      .baseline-bar { top: calc(var(--bar-top) + var(--bar-height) + 4px); height: 8px; border-radius: 999px; opacity: .78; background: repeating-linear-gradient(90deg, rgba(71, 85, 105, .68) 0 8px, rgba(148, 163, 184, .68) 8px 14px); box-shadow: 0 1px 3px rgba(15, 23, 42, .12); }
      .baseline-bar span { position: absolute; left: 8px; top: -17px; color: #475467; font-size: 10px; font-weight: 800; white-space: nowrap; }
      .indicator-dot.is-baseline.has-variance { background: #fff7ed; color: #b45309; border-color: #fed7aa; }
    `;
    document.head.appendChild(style);
  }

  function installFieldColumns() {
    const finishIndex = FIELD_COLUMNS.findIndex((column) => column.key === "finish");
    let insertAt = finishIndex >= 0 ? finishIndex + 1 : FIELD_COLUMNS.length;
    BASELINE_COLUMNS.forEach((column) => {
      const existing = FIELD_COLUMNS.find((item) => item.key === column.key);
      if (!existing) {
        FIELD_COLUMNS.splice(insertAt, 0, column);
        insertAt += 1;
      }
      FIELD_COLUMN_MAP.set(column.key, existing || column);
      if (!uiPrefs.fieldColumns) uiPrefs.fieldColumns = {};
      if (!Number.isFinite(Number(uiPrefs.fieldColumns[column.key]))) {
        uiPrefs.fieldColumns[column.key] = column.defaultWidth;
      }
    });

    // New baseline/variance columns should be visible immediately after the build,
    // not hidden behind the old splitter width from localStorage.
    uiPrefs.fieldPaneWidth = getTotalFieldColumnWidth();
    saveUiPrefs();
    applyUiPrefs();
  }

  function patchVarianceMath() {
    baselineVariance = function patchedBaselineVariance(task) {
      const baseline = normalizeBaseline(task?.baseline, task);
      if (!hasBaseline({ baseline })) {
        return { hasBaseline: false, startDays: 0, finishDays: 0, durationMinutes: 0, cost: 0 };
      }
      const startDays = workingVarianceDays(baseline.start, task.start);
      const finishDays = workingVarianceDays(baseline.finish, task.finish);
      const durationMinutes = normalizeDurationMinutes(task.durationMinutes, 0) - normalizeDurationMinutes(baseline.durationMinutes, 0);
      const currentCost = typeof summarizeTaskAssignments === "function" ? summarizeTaskAssignments(task).totalCost : 0;
      const cost = Math.round((currentCost - (Number(baseline.cost) || 0)) * 100) / 100;
      return { hasBaseline: true, startDays, finishDays, durationMinutes, cost };
    };
  }

  function workingVarianceDays(from, to) {
    const start = dateOnly(from);
    const finish = dateOnly(to);
    if (!start || !finish) return 0;
    const rawDays = Math.round((finish - start) / 86400000);
    if (!rawDays) return 0;
    const step = rawDays > 0 ? 1 : -1;
    let date = addDays(start, step);
    let count = 0;
    let guard = 0;
    while ((step > 0 ? date <= finish : date >= finish) && guard < 4000) {
      if (isWorkingDay(date)) count += step;
      date = addDays(date, step);
      guard += 1;
    }
    return count;
  }

  function patchRenderers() {
    const originalRenderGantt = renderGantt;
    renderGantt = function patchedRenderGantt(...args) {
      const result = originalRenderGantt.apply(this, args);
      enhanceBaselineGrid();
      return result;
    };

    const originalRender = render;
    render = function patchedRender(...args) {
      const result = originalRender.apply(this, args);
      enhanceBaselineGrid();
      setBaselineVersionLabel();
      return result;
    };
  }

  function enhanceBaselineGrid() {
    if (!els?.taskBody) return;
    els.taskBody.querySelectorAll(".planner-fields").forEach((fields) => {
      fields.querySelectorAll(".baseline-grid-cell").forEach((cell) => cell.remove());
      const row = fields.closest(".planner-row[data-row-index]");
      const index = Number(row?.dataset.rowIndex);
      const task = state.tasks?.[index];
      if (!task) return;
      const finishCell = fields.querySelector('input[data-field="finish"]')?.closest(".planner-cell");
      if (!finishCell) return;
      let cursor = finishCell;
      BASELINE_COLUMNS.forEach((column) => {
        const template = document.createElement("template");
        template.innerHTML = renderBaselineCell(task, column.key);
        const cell = template.content.firstElementChild;
        cursor.after(cell);
        cursor = cell;
      });
    });
  }

  function renderBaselineCell(task, key) {
    const details = getBaselineCellDetails(task, key);
    const classes = ["planner-cell", "baseline-grid-cell", `baseline-${key}`];
    if (!details.hasBaseline) classes.push("no-baseline");
    if (details.isVariance) {
      classes.push("is-variance");
      if (details.raw > 0) classes.push("is-positive");
      else if (details.raw < 0) classes.push("is-negative");
      else classes.push("is-zero");
    }
    return `<div class="${classes.join(" ")}"><span class="baseline-grid-value" title="${escapeXml(details.title)}" aria-label="${escapeXml(details.title)}">${escapeXml(details.value)}</span></div>`;
  }

  function getBaselineCellDetails(task, key) {
    const baseline = normalizeBaseline(task?.baseline, task);
    const variance = baselineVariance(task);
    const has = hasBaseline({ baseline });
    if (!has) return { value: "—", title: "No baseline set. Use Project → Set Baseline.", hasBaseline: false, isVariance: false, raw: 0 };

    const lookup = {
      baselineStart: { value: baseline.start || "—", title: `Baseline Start: ${baseline.start || "not set"}`, raw: 0 },
      baselineFinish: { value: baseline.finish || "—", title: `Baseline Finish: ${baseline.finish || "not set"}`, raw: 0 },
      baselineDuration: { value: formatDuration(baseline.durationMinutes), title: `Baseline Duration: ${formatDuration(baseline.durationMinutes)}`, raw: 0 },
      startVariance: { value: formatDayVariance(variance.startDays), title: `Start Variance: ${formatDayVariance(variance.startDays)}`, raw: variance.startDays, isVariance: true },
      finishVariance: { value: formatDayVariance(variance.finishDays), title: `Finish Variance: ${formatDayVariance(variance.finishDays)}`, raw: variance.finishDays, isVariance: true },
      durationVariance: { value: formatDurationVariance(variance.durationMinutes), title: `Duration Variance: ${formatDurationVariance(variance.durationMinutes)}`, raw: variance.durationMinutes, isVariance: true },
    };
    return { hasBaseline: true, isVariance: false, ...lookup[key] };
  }

  function setBaselineVersionLabel() {
    const label = `${VERSION} · ${VERSION_NAME}`;
    if (els?.appVersionBadge) {
      els.appVersionBadge.textContent = label;
      els.appVersionBadge.title = "Build 2026-06-24";
    }
    if (els?.appVersionFooter) els.appVersionFooter.textContent = `${label} · Build 2026-06-24`;
    const ribbonVersion = document.getElementById("ribbonVersionText");
    if (ribbonVersion) ribbonVersion.textContent = `${VERSION} · baselines`;
  }
})();
