(() => {
  const TASK_INFO_VERSION = "v0.33.0";
  const TASK_INFO_NAME = "Resources";
  const TASK_INFO_LABEL = `${TASK_INFO_VERSION} · ${TASK_INFO_NAME}`;
  const TASK_INFO_BUILD_DATE = "2026-06-24";
  const DESIRED_TABS = [
    ["general", "General"],
    ["predecessors", "Predecessors"],
    ["successors", "Successors"],
    ["advanced", "Advanced"],
    ["notes", "Notes"],
    ["resources", "Resources"],
    ["custom-fields", "Custom Fields"],
    ["progress", "Progress"],
    ["baseline", "Baseline"],
    ["structure", "Structure"],
  ];

  function boot() {
    if (window.__taskInformationPanelV3Installed) return;
    if (typeof state === "undefined" || typeof openTaskInfo !== "function" || typeof render !== "function" || !document.querySelector(".task-info-tabs")) {
      setTimeout(boot, 80);
      return;
    }

    window.__taskInformationPanelV3Installed = true;
    installStyles();
    normalizeTaskInfoDom();
    patchTaskInfoRuntime();
    decorateTaskResources();
    patchVersionLabels();
    if (typeof refreshTaskInfoPanel === "function") refreshTaskInfoPanel(true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  function installStyles() {
    if (document.getElementById("taskInformationPanelV3Styles")) return;
    const style = document.createElement("style");
    style.id = "taskInformationPanelV3Styles";
    style.textContent = `
      .task-info-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        padding-bottom: 8px;
      }
      .task-info-tab { white-space: nowrap; }
      .task-info-tab.is-placeholder::after {
        content: "later";
        margin-left: 6px;
        padding: 1px 5px;
        border-radius: 999px;
        background: #eef2f7;
        color: #667085;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .task-info-page .placeholder-input[disabled] {
        background: #f5f7fb;
        color: #667085;
      }
      .task-info-page .task-info-readonly-card {
        display: grid;
        gap: 10px;
      }
      .successor-list {
        display: grid;
        gap: 8px;
        margin-top: 4px;
      }
      .successor-row {
        display: grid;
        grid-template-columns: 72px minmax(120px, 1fr) 96px;
        gap: 8px;
        align-items: center;
        padding: 8px 10px;
        border: 1px solid #d9e2ee;
        border-radius: 10px;
        background: #f8fafc;
        font-size: 12px;
      }
      .successor-row strong { color: #185a9d; }
      .successor-row span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .custom-fields-placeholder { display: grid; gap: 12px; }
      .task-resource-badges {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-left: 6px;
        min-width: 0;
      }
      .task-resource-badge {
        display: inline-flex;
        align-items: center;
        max-width: 150px;
        min-height: 18px;
        padding: 1px 7px;
        border-radius: 999px;
        border: 1px solid rgba(37, 99, 235, 0.24);
        background: #eff6ff;
        color: #1d4ed8;
        font-size: 10px;
        font-weight: 850;
        line-height: 1.1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .gantt-resource-label {
        position: absolute;
        left: 10px;
        bottom: -17px;
        z-index: 4;
        max-width: min(220px, calc(100% + 90px));
        padding: 1px 7px;
        border-radius: 999px;
        border: 1px solid #bfdbfe;
        background: rgba(255,255,255,0.96);
        color: #1d4ed8;
        font-size: 10px;
        font-weight: 850;
        line-height: 1.25;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        pointer-events: none;
      }
      .resource-acceptance-note {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 10px;
        padding: 9px 11px;
        border: 1px solid #d9e2ee;
        border-radius: 12px;
        background: #f8fafc;
        color: #344054;
        font-size: 12px;
        font-weight: 700;
      }
    `;
    document.head.appendChild(style);
  }

  function normalizeTaskInfoDom() {
    const tabs = document.querySelector(".task-info-tabs");
    const form = document.getElementById("taskInfoForm");
    if (!tabs || !form) return;

    tabs.setAttribute("role", "tablist");
    tabs.dataset.taskInfoV3Tabs = "1";

    DESIRED_TABS.forEach(([key, label]) => ensureTab(tabs, key, label));
    ensurePredecessorPage(form);
    ensureSuccessorPage(form);
    ensureCustomFieldsPage(form);
    normalizeResourcePage();
    orderTabs(tabs);

    if (tabs.dataset.taskInfoV3Bound !== "1") {
      tabs.dataset.taskInfoV3Bound = "1";
      tabs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-task-info-tab]");
        if (!button) return;
        if (typeof setTaskInfoTab === "function") setTaskInfoTab(button.dataset.taskInfoTab);
      });
    }
  }

  function ensureTab(tabs, key, label) {
    let button = [...tabs.querySelectorAll("[data-task-info-tab]")].find((candidate) => candidate.dataset.taskInfoTab === key);
    if (!button) {
      button = document.createElement("button");
      button.className = "task-info-tab";
      button.type = "button";
      button.dataset.taskInfoTab = key;
      tabs.appendChild(button);
    }
    button.textContent = label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `task-info-page-${key}`);
    button.classList.toggle("is-placeholder", key === "custom-fields");
    return button;
  }

  function orderTabs(tabs) {
    const orderedKeys = DESIRED_TABS.map(([key]) => key);
    [...tabs.querySelectorAll("[data-task-info-tab]")]
      .sort((a, b) => {
        const aIndex = orderedKeys.indexOf(a.dataset.taskInfoTab);
        const bIndex = orderedKeys.indexOf(b.dataset.taskInfoTab);
        return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
      })
      .forEach((button) => tabs.appendChild(button));
  }

  function ensurePredecessorPage(form) {
    const page = pageFor("predecessors");
    if (!page) return;
    page.id = "task-info-page-predecessors";
    const legend = page.querySelector("legend") || page.insertBefore(document.createElement("legend"), page.firstChild);
    legend.textContent = "Predecessors";
    const successorInput = document.getElementById("tiSuccessors");
    const successorLabel = successorInput?.closest("label");
    if (successorLabel && successorLabel.parentElement === page) successorLabel.remove();
    const help = page.querySelector(".task-info-help");
    if (help) help.textContent = "Edit predecessors with MS Project-style values such as 1FS, 2SS+2d, 3FF-4h, or 4SF.";
    if (!page.querySelector("#tiPredecessors")) {
      const label = document.createElement("label");
      label.className = "wide-field";
      label.innerHTML = 'Predecessors<input id="tiPredecessors" placeholder="1FS, 2SS+2d, 3FF-4h" type="text"/>';
      page.insertBefore(label, help || null);
      if (typeof els === "object") els.tiPredecessors = label.querySelector("input");
    }
  }

  function ensureSuccessorPage(form) {
    let page = pageFor("successors");
    if (!page) {
      page = document.createElement("fieldset");
      page.className = "task-info-page";
      page.dataset.taskInfoPage = "successors";
      const predecessorPage = pageFor("predecessors");
      predecessorPage?.insertAdjacentElement("afterend", page) || form.insertBefore(page, form.querySelector(".task-info-actions"));
    }
    page.id = "task-info-page-successors";
    page.innerHTML = `
      <legend>Successors</legend>
      <div class="task-info-readonly-card">
        <label class="wide-field">Successors<input aria-readonly="true" id="tiSuccessors" placeholder="none" readonly type="text"/></label>
        <div class="successor-list" id="tiSuccessorList"></div>
        <p class="task-info-help">Successors are calculated from other tasks that list this task as a predecessor. To change them, edit the successor task's Predecessors field.</p>
      </div>`;
    if (typeof els === "object") {
      els.tiSuccessors = document.getElementById("tiSuccessors");
      els.tiSuccessorList = document.getElementById("tiSuccessorList");
    }
  }

  function ensureCustomFieldsPage(form) {
    let page = pageFor("custom-fields");
    if (!page) {
      page = document.createElement("fieldset");
      page.className = "task-info-page custom-fields-placeholder";
      page.dataset.taskInfoPage = "custom-fields";
      const resourcesPage = pageFor("resources") || pageFor("notes") || pageFor("advanced");
      resourcesPage?.insertAdjacentElement("afterend", page) || form.insertBefore(page, form.querySelector(".task-info-actions"));
    }
    page.id = "task-info-page-custom-fields";
    page.innerHTML = `
      <legend>Custom Fields</legend>
      <div class="task-info-grid">
        <label>Text1<input class="placeholder-input" type="text" value="Coming later" disabled/></label>
        <label>Number1<input class="placeholder-input" type="text" value="Coming later" disabled/></label>
        <label>Date1<input class="placeholder-input" type="text" value="Coming later" disabled/></label>
      </div>
      <p class="task-info-help">Placeholder for Project-style custom fields. The tab is here now so the dialog layout will not have to change later.</p>`;
  }

  function normalizeResourcePage() {
    const page = pageFor("resources");
    if (!page) return;
    page.id = "task-info-page-resources";
    const legend = page.querySelector("legend");
    if (legend) legend.textContent = "Resources";

    const help = page.querySelector(".task-info-help");
    if (help) {
      help.textContent = "Assign work, material, or cost resources from the Resource Sheet. The task row and Gantt bar show assigned resource names immediately.";
    }
  }

  function pageFor(key) {
    return [...document.querySelectorAll("[data-task-info-page]")].find((page) => page.dataset.taskInfoPage === key) || null;
  }

  function patchTaskInfoRuntime() {
    if (window.__taskInformationPanelV3RuntimePatched) return;
    window.__taskInformationPanelV3RuntimePatched = true;

    const baseSetTaskInfoTab = typeof setTaskInfoTab === "function" ? setTaskInfoTab : null;
    setTaskInfoTab = function taskInfoV3SetTaskInfoTab(tab = "general") {
      normalizeTaskInfoDom();
      const requested = pageFor(tab) ? tab : "general";
      if (!pageFor(requested)) return baseSetTaskInfoTab?.(tab);
      taskInfoActiveTab = requested;
      document.querySelectorAll("[data-task-info-tab]").forEach((button) => {
        const active = button.dataset.taskInfoTab === requested;
        button.classList.toggle("is-active", active);
        button.setAttribute("aria-selected", active ? "true" : "false");
        button.tabIndex = active ? 0 : -1;
      });
      document.querySelectorAll("[data-task-info-page]").forEach((page) => {
        page.classList.toggle("is-active", page.dataset.taskInfoPage === requested);
      });
    };

    const baseRefreshTaskInfoPanel = typeof refreshTaskInfoPanel === "function" ? refreshTaskInfoPanel : null;
    if (baseRefreshTaskInfoPanel) {
      refreshTaskInfoPanel = function taskInfoV3RefreshTaskInfoPanel(force = false) {
        normalizeTaskInfoDom();
        const result = baseRefreshTaskInfoPanel(force);
        refreshSuccessorPanel();
        decorateTaskResources();
        return result;
      };
    }

    const baseOpenTaskInfo = typeof openTaskInfo === "function" ? openTaskInfo : null;
    if (baseOpenTaskInfo) {
      openTaskInfo = function taskInfoV3OpenTaskInfo(index) {
        normalizeTaskInfoDom();
        return baseOpenTaskInfo(index);
      };
    }

    const baseRender = typeof render === "function" ? render : null;
    if (baseRender) {
      render = function taskInfoV3Render() {
        const result = baseRender();
        normalizeTaskInfoDom();
        refreshSuccessorPanel();
        decorateTaskResources();
        patchVersionLabels();
        return result;
      };
    }

    wrapAssignmentRuntime();
    wrapResourceSheetRuntime();
  }

  function wrapAssignmentRuntime() {
    if (window.__resourceAssignmentVisibilityPatched) return;
    window.__resourceAssignmentVisibilityPatched = true;

    if (typeof addAssignmentToTask === "function") {
      const baseAddAssignmentToTask = addAssignmentToTask;
      addAssignmentToTask = function resourceV2AddAssignmentToTask(index = taskInfoIndex) {
        const result = baseAddAssignmentToTask(index);
        afterResourceChange();
        return result;
      };
    }

    if (typeof updateTaskAssignment === "function") {
      const baseUpdateTaskAssignment = updateTaskAssignment;
      updateTaskAssignment = function resourceV2UpdateTaskAssignment(taskIndex, assignmentIndex, field, value) {
        const result = baseUpdateTaskAssignment(taskIndex, assignmentIndex, field, value);
        afterResourceChange();
        return result;
      };
    }

    if (typeof deleteTaskAssignment === "function") {
      const baseDeleteTaskAssignment = deleteTaskAssignment;
      deleteTaskAssignment = function resourceV2DeleteTaskAssignment(taskIndex, assignmentIndex) {
        const result = baseDeleteTaskAssignment(taskIndex, assignmentIndex);
        afterResourceChange();
        return result;
      };
    }

    if (typeof updateResource === "function") {
      const baseUpdateResource = updateResource;
      updateResource = function resourceV2UpdateResource(index, field, value) {
        const result = baseUpdateResource(index, field, value);
        afterResourceChange();
        return result;
      };
    }
  }

  function wrapResourceSheetRuntime() {
    if (typeof renderResourceSheet !== "function" || window.__resourceSheetV2Patched) return;
    window.__resourceSheetV2Patched = true;
    const baseRenderResourceSheet = renderResourceSheet;
    renderResourceSheet = function resourceV2RenderResourceSheet() {
      const result = baseRenderResourceSheet();
      decorateResourceSheetHeader();
      return result;
    };
  }

  function afterResourceChange() {
    requestAnimationFrame(() => {
      decorateResourceSheetHeader();
      decorateTaskResources();
      if (typeof renderValidation === "function") renderValidation();
      if (typeof save === "function") save();
    });
  }

  function decorateResourceSheetHeader() {
    const shell = document.querySelector(".resource-sheet-shell");
    if (!shell || shell.querySelector(".resource-acceptance-note")) return;
    const note = document.createElement("div");
    note.className = "resource-acceptance-note";
    note.innerHTML = `<strong>Resource Sheet ready:</strong><span>Name, type, max units, standard rate, overtime rate, calendar placeholder, and notes are editable. Assignments show back on task rows.</span>`;
    shell.insertBefore(note, shell.firstChild);
  }

  function decorateTaskResources() {
    if (!Array.isArray(state.tasks)) return;
    document.querySelectorAll(".planner-row[data-row-index]").forEach((row) => {
      const index = Number(row.dataset.rowIndex);
      const task = state.tasks[index];
      if (!task) return;

      const names = getAssignedResourceNames(task);
      decorateTaskNameCell(row, names);
      decorateGanttBar(row, task, names);
    });
  }

  function decorateTaskNameCell(row, names) {
    const nameCell = row.querySelector(".task-name-cell");
    if (!nameCell) return;
    let badges = nameCell.querySelector(".task-resource-badges");
    if (!names.length) {
      badges?.remove();
      return;
    }
    if (!badges) {
      badges = document.createElement("span");
      badges.className = "task-resource-badges";
      nameCell.appendChild(badges);
    }
    badges.innerHTML = names.slice(0, 3).map((name) => `<span class="task-resource-badge" title="${escapeSafe(name)}">${escapeSafe(name)}</span>`).join("") +
      (names.length > 3 ? `<span class="task-resource-badge" title="${escapeSafe(names.slice(3).join(', '))}">+${names.length - 3}</span>` : "");
  }

  function decorateGanttBar(row, task, names) {
    const bar = row.querySelector(".gantt-bar");
    if (!bar) return;
    let label = bar.querySelector(".gantt-resource-label");
    if (!names.length) {
      label?.remove();
      return;
    }
    if (!label) {
      label = document.createElement("small");
      label.className = "gantt-resource-label";
      bar.appendChild(label);
    }
    const text = names.join(", ");
    label.textContent = text;
    label.title = `Resources: ${text}`;
    bar.title = `${bar.title || task.name || "Task"} · Resources: ${text}`;
  }

  function getAssignedResourceNames(task) {
    if (!task) return [];
    try {
      if (typeof summarizeTaskAssignments === "function") {
        const summary = summarizeTaskAssignments(task);
        if (summary?.names?.length) return [...new Set(summary.names.filter(Boolean))];
      }
    } catch {
      // Fall back to assignment/resource lookup below.
    }

    const resources = Array.isArray(state.resources) ? state.resources : [];
    return [...new Set((task.assignments || [])
      .map((assignment) => resources.find((resource) => Number(resource.uid) === Number(assignment.resourceUid))?.name)
      .filter(Boolean))];
  }

  function refreshSuccessorPanel() {
    if (!Number.isInteger(taskInfoIndex) || !state.tasks?.[taskInfoIndex]) return;
    const task = state.tasks[taskInfoIndex];
    const links = getSuccessorRows(task.id);
    const text = links.map((row) => row.linkText).join(",");
    const input = document.getElementById("tiSuccessors");
    if (input) input.value = text;
    const list = document.getElementById("tiSuccessorList");
    if (!list) return;
    if (!links.length) {
      list.innerHTML = `<div class="assignment-empty"><strong>No successors.</strong><span>No other task currently depends on this task.</span></div>`;
      return;
    }
    list.innerHTML = links.map((row) => `
      <div class="successor-row">
        <strong>${escapeSafe(row.linkText)}</strong>
        <span title="${escapeSafe(row.name)}">${escapeSafe(row.name)}</span>
        <small>${escapeSafe(row.dates)}</small>
      </div>`).join("");
  }

  function getSuccessorRows(taskId) {
    const id = Number(taskId);
    return (state.tasks || []).flatMap((candidate) => {
      const links = typeof getTaskLinks === "function" ? getTaskLinks(candidate) : (candidate.links || []);
      return (links || [])
        .filter((link) => Number(link.id) === id)
        .map((link) => ({
          task: candidate,
          link,
          linkText: typeof formatLink === "function" ? formatLink({ ...link, id: candidate.id }) : `${candidate.id}${link.type || "FS"}`,
          name: `Task ${candidate.id}: ${candidate.name || "Untitled"}`,
          dates: `${candidate.start || "?"} → ${candidate.finish || "?"}`,
        }));
    });
  }

  function patchVersionLabels() {
    const ribbon = document.getElementById("ribbonVersionText");
    const badge = document.getElementById("appVersionBadge");
    const footer = document.getElementById("appVersionFooter");
    if (ribbon) ribbon.textContent = `${TASK_INFO_LABEL} · Resource Sheet ready`;
    if (badge) {
      badge.textContent = TASK_INFO_LABEL;
      badge.title = `Build ${TASK_INFO_BUILD_DATE}`;
    }
    if (footer) footer.textContent = `${TASK_INFO_LABEL} · Build ${TASK_INFO_BUILD_DATE}`;
  }

  function escapeSafe(value) {
    if (typeof escapeXml === "function") return escapeXml(value);
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
})();
