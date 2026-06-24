(() => {
  const VERSION = "v0.36.0";
  const NAME = "Costs";
  const BUILD_DATE = "2026-06-24";
  const COST_COLUMNS = [
    { key: "fixedCost", label: "Fixed Cost", defaultWidth: 104, min: 86, max: 150 },
    { key: "totalCost", label: "Cost", defaultWidth: 96, min: 78, max: 140 },
  ];
  let tries = 0;

  function boot() {
    if (window.__costsModuleLoaded) return;
    if (!ready()) {
      if (++tries < 160) setTimeout(boot, 75);
      return;
    }
    window.__costsModuleLoaded = true;
    installStyles();
    installColumns();
    patchRuntime();
    ensureCostsTab();
    stampCosts();
    exposeSelfTest();
    render();
  }

  function ready() {
    return typeof state !== "undefined" && Array.isArray(FIELD_COLUMNS) && typeof FIELD_COLUMN_MAP !== "undefined" &&
      typeof render === "function" && typeof renderGantt === "function" && typeof updateTask === "function" &&
      typeof summarizeTaskAssignments === "function" && typeof assignmentCost === "function" && typeof formatMoney === "function" &&
      typeof parseRateValue === "function" && typeof normalizeDurationMinutes === "function" && typeof getResourceByUid === "function" &&
      typeof getTotalFieldColumnWidth === "function" && typeof saveUiPrefs === "function" && typeof applyUiPrefs === "function";
  }

  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, { once: true }) : boot();

  function installStyles() {
    if (document.getElementById("costsModuleStyles")) return;
    const style = document.createElement("style");
    style.id = "costsModuleStyles";
    style.textContent = `
      .cost-grid-cell { background: rgba(250,250,255,.72); }
      .planner-row:nth-child(even) .cost-grid-cell { background: rgba(245,247,252,.82); }
      .cost-grid-input { width: 100%; min-width: 0; text-align: right; font-variant-numeric: tabular-nums; }
      .cost-grid-value { display: inline-flex; align-items: center; justify-content: flex-end; width: 100%; min-height: 26px; padding: 3px 7px; border-radius: 8px; color: #344054; background: rgba(255,255,255,.86); border: 1px solid rgba(189,203,224,.7); font-size: 11px; font-weight: 800; font-variant-numeric: tabular-nums; }
      .cost-grid-value.is-summary-cost { color: #075985; background: #ecfeff; border-color: #a5f3fc; }
      .indicator-dot.is-cost { background: #fef3c7; color: #92400e; border-color: #fde68a; }
      .task-info-page[data-task-info-page="costs"] .cost-readout { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin: 10px 0 4px; }
      .cost-breakdown-card { padding: 10px 12px; border: 1px solid #d9e2ee; border-radius: 12px; background: #f8fafc; }
      .cost-breakdown-card span { display:block; color: #667085; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .03em; }
      .cost-breakdown-card strong { display:block; font-size: 16px; color: #101828; }
    `;
    document.head.appendChild(style);
  }

  function installColumns() {
    const percentIndex = FIELD_COLUMNS.findIndex((column) => column.key === "percent");
    let insertAt = percentIndex >= 0 ? percentIndex + 1 : FIELD_COLUMNS.length;
    COST_COLUMNS.forEach((column) => {
      const existing = FIELD_COLUMNS.find((item) => item.key === column.key);
      if (!existing) {
        FIELD_COLUMNS.splice(insertAt, 0, column);
        insertAt += 1;
      }
      FIELD_COLUMN_MAP.set(column.key, existing || column);
      if (!uiPrefs.fieldColumns) uiPrefs.fieldColumns = {};
      if (!Number.isFinite(Number(uiPrefs.fieldColumns[column.key]))) uiPrefs.fieldColumns[column.key] = column.defaultWidth;
    });
    uiPrefs.fieldPaneWidth = getTotalFieldColumnWidth();
    saveUiPrefs();
    applyUiPrefs();
  }

  function patchRuntime() {
    const baseEnsureDecorations = ensureDecorations;
    ensureDecorations = function costsEnsureDecorations(...args) {
      const result = baseEnsureDecorations.apply(this, args);
      stampCosts();
      return result;
    };

    const baseRollupSummaryTasks = rollupSummaryTasks;
    rollupSummaryTasks = function costsRollupSummaryTasks(...args) {
      const result = baseRollupSummaryTasks.apply(this, args);
      stampCosts();
      return result;
    };

    const baseUpdateTask = updateTask;
    updateTask = function costsUpdateTask(index, field, value) {
      if (field === "fixedCost") {
        const task = state.tasks?.[index];
        if (!task) return;
        if (typeof selectTask === "function") selectTask(index);
        task.fixedCost = money(value);
        stampCosts();
        render();
        return;
      }
      return baseUpdateTask.apply(this, arguments);
    };

    const baseRenderGantt = renderGantt;
    renderGantt = function costsRenderGantt(...args) {
      const result = baseRenderGantt.apply(this, args);
      injectCostCells();
      return result;
    };

    const baseRender = render;
    render = function costsRender(...args) {
      ensureCostsTab();
      const result = baseRender.apply(this, args);
      ensureCostsTab();
      injectCostCells();
      refreshCostsPanel();
      setVersionLabels();
      return result;
    };

    const baseRefreshTaskInfoPanel = refreshTaskInfoPanel;
    refreshTaskInfoPanel = function costsRefreshTaskInfoPanel(force = false) {
      ensureCostsTab();
      const result = baseRefreshTaskInfoPanel.call(this, force);
      refreshCostsPanel();
      return result;
    };

    const baseApplyTaskInfoForm = applyTaskInfoForm;
    applyTaskInfoForm = function costsApplyTaskInfoForm(...args) {
      const task = Number.isInteger(taskInfoIndex) ? state.tasks?.[taskInfoIndex] : null;
      if (task) task.fixedCost = money(document.getElementById("tiFixedCost")?.value ?? task.fixedCost);
      const result = baseApplyTaskInfoForm.apply(this, args);
      stampCosts();
      return result;
    };

    if (typeof renderTaskIndicators === "function") {
      const baseRenderTaskIndicators = renderTaskIndicators;
      renderTaskIndicators = function costsRenderTaskIndicators(task, index, context = {}) {
        const markup = baseRenderTaskIndicators.call(this, task, index, context);
        const total = totalTaskCost(task, index);
        if (!total || !markup.includes("</button>")) return markup;
        const chip = `<span class="indicator-dot is-cost" title="Total task cost: ${escapeXml(formatMoney(total))}">$</span>`;
        return markup.replace("</button>", `${chip}</button>`);
      };
    }

    if (typeof createBaselineFromTask === "function") {
      const baseCreateBaselineFromTask = createBaselineFromTask;
      createBaselineFromTask = function costsCreateBaselineFromTask(task) {
        const baseline = baseCreateBaselineFromTask.call(this, task);
        baseline.cost = totalTaskCost(task, state.tasks.indexOf(task));
        return baseline;
      };
    }

    if (typeof baselineVariance === "function") {
      const baseBaselineVariance = baselineVariance;
      baselineVariance = function costsBaselineVariance(task) {
        const variance = baseBaselineVariance.call(this, task);
        if (!variance?.hasBaseline) return variance;
        const baselineCost = Number(task?.baseline?.cost ?? 0) || 0;
        return { ...variance, cost: round2(totalTaskCost(task, state.tasks.indexOf(task)) - baselineCost) };
      };
    }

    if (typeof buildProjectXml === "function") {
      const baseBuildProjectXml = buildProjectXml;
      buildProjectXml = function costsBuildProjectXml() {
        stampCosts();
        return addCostFieldsToProjectXml(baseBuildProjectXml.call(this));
      };
    }

    if (typeof importProjectXml === "function") {
      const baseImportProjectXml = importProjectXml;
      importProjectXml = function costsImportProjectXml(text) {
        const fixedCosts = readFixedCostsFromProjectXml(text);
        const result = baseImportProjectXml.call(this, text);
        if (fixedCosts.size) {
          state.tasks.forEach((task) => {
            if (fixedCosts.has(Number(task.uid))) task.fixedCost = fixedCosts.get(Number(task.uid));
          });
        }
        stampCosts();
        render();
        return result;
      };
    }

    if (typeof exportCsv === "function") {
      const baseExportCsv = exportCsv;
      exportCsv = function costsExportCsv() {
        try {
          exportCostsCsv();
        } catch (error) {
          console.warn("Cost CSV failed; using previous exporter.", error);
          baseExportCsv.call(this);
        }
      };
    }
  }

  function money(value) {
    const n = typeof parseRateValue === "function" ? parseRateValue(value) : Number(String(value ?? "").replace(/[^0-9.-]+/g, ""));
    return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
  }

  function round2(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  function assignmentCostParts(assignment) {
    const resource = getResourceByUid(assignment?.resourceUid);
    if (!resource) return { rate: 0, use: 0, total: 0 };
    const workHours = normalizeDurationMinutes(assignment.workMinutes, 0) / 60;
    if (resource.type === "Cost") {
      const use = money(resource.costPerUse);
      return { rate: 0, use, total: use };
    }
    if (resource.type === "Material") {
      const rate = round2(workHours * money(resource.costPerUse));
      return { rate, use: 0, total: rate };
    }
    const rate = round2(workHours * money(resource.standardRate));
    const use = money(resource.costPerUse);
    return { rate, use, total: round2(rate + use) };
  }

  function ownCostParts(task) {
    const fixed = money(task?.fixedCost);
    const parts = { fixed, rate: 0, use: 0, resource: 0, total: fixed };
    (task?.assignments || []).forEach((assignment) => {
      const item = assignmentCostParts(assignment);
      parts.rate += item.rate;
      parts.use += item.use;
      parts.resource += item.total;
    });
    parts.rate = round2(parts.rate);
    parts.use = round2(parts.use);
    parts.resource = round2(parts.resource);
    parts.total = round2(parts.fixed + parts.resource);
    return parts;
  }

  function directChildIndexes(index) {
    if (!Number.isInteger(index) || index < 0) return [];
    if (typeof getDirectChildIndexes === "function") return getDirectChildIndexes(index);
    const parent = state.tasks[index];
    const level = Number(parent?.outlineLevel) || 1;
    const rows = [];
    for (let i = index + 1; i < state.tasks.length; i += 1) {
      const childLevel = Number(state.tasks[i]?.outlineLevel) || 1;
      if (childLevel <= level) break;
      if (childLevel === level + 1) rows.push(i);
    }
    return rows;
  }

  function totalTaskCost(task, index = state.tasks.indexOf(task), seen = new Set()) {
    if (!task) return 0;
    const own = ownCostParts(task).total;
    if (!Number.isInteger(index) || index < 0 || seen.has(index)) return own;
    seen.add(index);
    const childTotal = directChildIndexes(index).reduce((sum, childIndex) => sum + totalTaskCost(state.tasks[childIndex], childIndex, seen), 0);
    return round2(own + childTotal);
  }

  function stampCosts() {
    if (!Array.isArray(state.tasks)) return;
    state.tasks.forEach((task, index) => {
      task.fixedCost = money(task.fixedCost);
      const parts = ownCostParts(task);
      task.resourceRateCost = parts.rate;
      task.costPerUseCost = parts.use;
      task.resourceCost = parts.resource;
      task.totalCost = totalTaskCost(task, index);
    });
  }

  function injectCostCells() {
    if (!els?.taskBody) return;
    stampCosts();
    els.taskBody.querySelectorAll(".planner-fields").forEach((fields) => {
      fields.querySelectorAll(".cost-grid-cell").forEach((cell) => cell.remove());
      const row = fields.closest(".planner-row[data-row-index]");
      const index = Number(row?.dataset.rowIndex);
      const task = state.tasks?.[index];
      if (!task) return;
      const percentCell = fields.querySelector('input[data-field="percent"]')?.closest(".planner-cell");
      if (!percentCell) return;
      let cursor = percentCell;
      COST_COLUMNS.forEach((column) => {
        const template = document.createElement("template");
        template.innerHTML = renderCostCell(task, index, column.key);
        const cell = template.content.firstElementChild;
        cursor.after(cell);
        cursor = cell;
      });
    });
  }

  function renderCostCell(task, index, key) {
    const isSummary = typeof isSummaryIndex === "function" ? isSummaryIndex(index) : false;
    if (key === "fixedCost") {
      const readonly = isSummary ? " readonly aria-readonly='true'" : "";
      const title = isSummary ? "Summary cost rolls up from child tasks. Add fixed cost on child tasks." : "Fixed task cost. Example: 250 or $250.";
      return `<div class="planner-cell cost-grid-cell cost-fixed-cost"><input class="cost-grid-input" data-field="fixedCost" data-index="${index}" value="${escapeXml(formatMoney(task.fixedCost))}" title="${escapeXml(title)}"${readonly}/></div>`;
    }
    const total = totalTaskCost(task, index);
    const title = `Total task cost: ${formatMoney(total)}. Fixed ${formatMoney(task.fixedCost)} + resource ${formatMoney(task.resourceCost)}${isSummary ? " + child task rollup" : ""}.`;
    return `<div class="planner-cell cost-grid-cell cost-total-cost"><span class="cost-grid-value ${isSummary ? "is-summary-cost" : ""}" title="${escapeXml(title)}">${escapeXml(formatMoney(total))}</span></div>`;
  }

  function ensureCostsTab() {
    const tabs = document.querySelector(".task-info-tabs");
    const form = document.getElementById("taskInfoForm");
    if (!tabs || !form) return;
    let tab = tabs.querySelector('[data-task-info-tab="costs"]');
    if (!tab) {
      tab = document.createElement("button");
      tab.type = "button";
      tab.className = "task-info-tab";
      tab.dataset.taskInfoTab = "costs";
      tab.textContent = "Costs";
    }
    const resourceTab = tabs.querySelector('[data-task-info-tab="resources"]');
    if (resourceTab?.nextSibling !== tab) resourceTab?.after(tab) || tabs.appendChild(tab);

    let page = form.querySelector('[data-task-info-page="costs"]');
    if (!page) {
      page = document.createElement("fieldset");
      page.className = "task-info-page";
      page.dataset.taskInfoPage = "costs";
      const resourcesPage = form.querySelector('[data-task-info-page="resources"]');
      resourcesPage?.insertAdjacentElement("afterend", page) || form.insertBefore(page, form.querySelector(".task-info-actions"));
    }
    page.innerHTML = `
      <legend>Costs</legend>
      <div class="task-info-grid">
        <label>Fixed Cost<input id="tiFixedCost" type="text" placeholder="$0"/></label>
        <label>Resource Rate Cost<input aria-readonly="true" id="tiResourceRateCost" readonly type="text"/></label>
        <label>Cost Per Use<input aria-readonly="true" id="tiCostPerUseCost" readonly type="text"/></label>
        <label>Total Task Cost<input aria-readonly="true" id="tiTotalTaskCost" readonly type="text"/></label>
        <label>Baseline Cost<input aria-readonly="true" id="tiCostBaselineCost" readonly type="text"/></label>
        <label>Cost Variance<input aria-readonly="true" id="tiCostVarianceCost" readonly type="text"/></label>
      </div>
      <div class="cost-readout">
        <div class="cost-breakdown-card"><span>Fixed</span><strong id="tiCostFixedReadout">$0</strong></div>
        <div class="cost-breakdown-card"><span>Resources</span><strong id="tiCostResourceReadout">$0</strong></div>
        <div class="cost-breakdown-card"><span>Total</span><strong id="tiCostTotalReadout">$0</strong></div>
      </div>
      <p class="task-info-help">Total cost = fixed cost + resource rate cost + cost per use. Summary tasks roll up child task costs.</p>`;
  }

  function refreshCostsPanel() {
    if (!Number.isInteger(taskInfoIndex) || !state.tasks?.[taskInfoIndex]) return;
    const task = state.tasks[taskInfoIndex];
    const parts = ownCostParts(task);
    const total = totalTaskCost(task, taskInfoIndex);
    const baseline = typeof normalizeBaseline === "function" ? normalizeBaseline(task.baseline, task) : task.baseline || {};
    const baselineCost = Number(baseline.cost || 0);
    const variance = round2(total - baselineCost);
    setValue("tiFixedCost", formatMoney(task.fixedCost));
    setValue("tiResourceRateCost", formatMoney(parts.rate));
    setValue("tiCostPerUseCost", formatMoney(parts.use));
    setValue("tiTotalTaskCost", formatMoney(total));
    setValue("tiCostBaselineCost", baselineCost ? formatMoney(baselineCost) : "No baseline");
    setValue("tiCostVarianceCost", baselineCost ? `${variance > 0 ? "+" : variance < 0 ? "-" : ""}${formatMoney(Math.abs(variance))}` : "No baseline");
    setText("tiCostFixedReadout", formatMoney(parts.fixed));
    setText("tiCostResourceReadout", formatMoney(parts.resource));
    setText("tiCostTotalReadout", formatMoney(total));
    const fixedInput = document.getElementById("tiFixedCost");
    if (fixedInput && typeof isSummaryIndex === "function") fixedInput.disabled = isSummaryIndex(taskInfoIndex);
  }

  function setValue(id, value) { const el = document.getElementById(id); if (el) el.value = value; }
  function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }

  function addCostFieldsToProjectXml(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.getElementsByTagName("parsererror")[0]) return xmlText;
    const taskByUid = new Map(state.tasks.map((task) => [Number(task.uid), task]));
    [...doc.getElementsByTagName("Task")].forEach((taskNode) => {
      const task = taskByUid.get(Number(childTextLocal(taskNode, "UID")));
      if (!task) return;
      setXmlChild(doc, taskNode, "FixedCost", String(money(task.fixedCost)), "Cost");
      setXmlChild(doc, taskNode, "FixedCostAccrual", "3", "FixedCost");
      setXmlChild(doc, taskNode, "Cost", String(totalTaskCost(task, state.tasks.indexOf(task))), "Work");
      const baselineNode = [...taskNode.children].find((node) => node.localName === "Baseline" && (!childTextLocal(node, "Number") || childTextLocal(node, "Number") === "0"));
      if (baselineNode && task.baseline) setXmlChild(doc, baselineNode, "Cost", String(money(task.baseline.cost)), "Work");
    });
    return new XMLSerializer().serializeToString(doc);
  }

  function readFixedCostsFromProjectXml(text) {
    const costs = new Map();
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror")[0]) return costs;
    [...doc.getElementsByTagName("Task")].forEach((taskNode) => {
      const uid = Number(childTextLocal(taskNode, "UID"));
      const fixed = money(childTextLocal(taskNode, "FixedCost"));
      if (uid > 0 && fixed > 0) costs.set(uid, fixed);
    });
    return costs;
  }

  function setXmlChild(doc, parent, localName, value, afterLocalName = "") {
    let child = [...parent.children].find((node) => node.localName === localName);
    if (!child) {
      child = doc.createElementNS(MS_PROJECT_NS, localName);
      const after = afterLocalName ? [...parent.children].find((node) => node.localName === afterLocalName) : null;
      if (after?.nextSibling) parent.insertBefore(child, after.nextSibling);
      else parent.appendChild(child);
    }
    child.textContent = value;
    return child;
  }

  function childTextLocal(node, localName) {
    const child = [...(node?.children || [])].find((candidate) => candidate.localName === localName);
    return child ? child.textContent.trim() : "";
  }

  function exportCostsCsv() {
    stampCosts();
    const rows = [];
    rows.push(["Tasks"]);
    rows.push(["ID", "TaskUID", "WBS", "Task Name", "Start", "Finish", "Duration", "% Complete", "Fixed Cost", "Resource Rate Cost", "Cost Per Use", "Resource Cost", "Total Task Cost", "Baseline Cost", "Cost Variance"]);
    state.tasks.forEach((task, index) => {
      const baselineCost = Number(task.baseline?.cost || 0);
      const total = totalTaskCost(task, index);
      rows.push([task.id, task.uid, task.wbs, task.name, task.start, task.finish, formatDuration(task.durationMinutes), `${task.percent}%`, money(task.fixedCost), task.resourceRateCost || 0, task.costPerUseCost || 0, task.resourceCost || 0, total, baselineCost, round2(total - baselineCost)]);
    });
    rows.push([]);
    rows.push(["Resources"]);
    rows.push(["ResourceUID", "ID", "Name", "Type", "Standard Rate", "Overtime Rate", "Cost Per Use", "Assigned Work", "Assigned Cost"]);
    state.resources.forEach((resource) => {
      const usage = getResourceUsageSummary(resource.uid);
      rows.push([resource.uid, resource.id, resource.name, resource.type, money(resource.standardRate), money(resource.overtimeRate), money(resource.costPerUse), formatWork(usage.workMinutes), usage.cost]);
    });
    rows.push([]);
    rows.push(["Assignments"]);
    rows.push(["AssignmentUID", "TaskUID", "Task Name", "Resource", "Units", "Work", "Rate Cost", "Cost Per Use", "Total Cost"]);
    state.tasks.forEach((task) => (task.assignments || []).forEach((assignment) => {
      const resource = getResourceByUid(assignment.resourceUid);
      const parts = assignmentCostParts(assignment);
      rows.push([assignment.uid, task.uid, task.name, resource?.name || "Missing resource", `${assignment.units}%`, formatWork(assignment.workMinutes), parts.rate, parts.use, parts.total]);
    }));
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    downloadText(csv, `${safeFileName(state.projectName)}-costs.csv`, "text/csv");
  }

  function setVersionLabels() {
    const label = `${VERSION} · ${NAME}`;
    const ribbon = document.getElementById("ribbonVersionText");
    const badge = document.getElementById("appVersionBadge");
    const footer = document.getElementById("appVersionFooter");
    const compat = document.getElementById("compatChip");
    if (ribbon) ribbon.textContent = `${label} · fixed/resource/summary cost`;
    if (badge) { badge.textContent = label; badge.title = `Build ${BUILD_DATE}`; }
    if (footer) footer.textContent = `${label} · Build ${BUILD_DATE}`;
    if (compat && !compat.classList.contains("has-issues")) compat.lastChild.textContent = " Costs + baseline cost ready";
  }

  function exposeSelfTest() {
    window.__costsSelfTest = () => {
      const saved = JSON.parse(JSON.stringify(state));
      const selected = selectedTaskIndex;
      try {
        state.projectStart = "2026-07-06";
        state.resources = [
          makeSampleResource(1, "Engineer", "Work", "ENG", 100, 100, 150, 50, ""),
          makeSampleResource(2, "Permit", "Cost", "PER", 0, 0, 0, 200, ""),
        ];
        state.tasks = [
          { uid: 1, id: 1, name: "Summary", start: "2026-07-06", finish: "2026-07-10", durationMinutes: 2400, percent: 0, outlineLevel: 1, links: [], predecessors: [], assignments: [], fixedCost: 25, expanded: true },
          { uid: 2, id: 2, name: "Build", start: "2026-07-06", finish: "2026-07-10", durationMinutes: 2400, percent: 0, outlineLevel: 2, links: [], predecessors: [], fixedCost: 100, assignments: [normalizeAssignment({ uid: 1, resourceUid: 1, units: 100, workMinutes: 2400 }), normalizeAssignment({ uid: 2, resourceUid: 2, units: 100, workMinutes: 0 })] },
        ];
        ensureDecorations();
        rollupSummaryTasks();
        state.tasks[1].baseline = { start: state.tasks[1].start, finish: state.tasks[1].finish, durationMinutes: 2400, workMinutes: 2400, cost: totalTaskCost(state.tasks[1], 1) - 100 };
        stampCosts();
        render();
        const buildTotal = totalTaskCost(state.tasks[1], 1);
        const summaryTotal = totalTaskCost(state.tasks[0], 0);
        const variance = baselineVariance(state.tasks[1]).cost;
        return { buildTotal, summaryTotal, variance, costCells: document.querySelectorAll(".cost-grid-cell").length, passed: buildTotal === 4350 && summaryTotal === 4375 && variance === 100 };
      } finally {
        state = saved;
        selectedTaskIndex = selected;
        render();
      }
    };
  }
})();