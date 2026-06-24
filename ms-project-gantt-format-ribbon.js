(() => {
  const GANTT_FORMAT_VERSION = "v0.30.0";
  const STYLE_CLASS_PREFIX = "ms-gantt-style-";

  function boot() {
    const formatPanel = document.querySelector('[data-ribbon-panel="format"]');
    if (!formatPanel) {
      setTimeout(boot, 100);
      return;
    }
    installFormatRibbon(formatPanel);
    patchVersion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  function installFormatRibbon(formatPanel) {
    if (formatPanel.dataset.msGanttFormatRibbonEnhanced === "1") return;
    formatPanel.dataset.msGanttFormatRibbonEnhanced = "1";
    formatPanel.innerHTML = `
      <div class="ms-gantt-format-ribbon" aria-label="Gantt Chart Format ribbon commands">
        <div class="command-group">
          <div class="ms-command-body">
            <button class="ms-large-button" type="button" data-ms-format-command="text-styles"><i>Aa</i>Text<br/>Styles</button>
            <details class="ms-ribbon-menu">
              <summary class="ms-large-button"><i>▦</i>Gridlines ▾</summary>
              <div class="ms-ribbon-popover">
                <button type="button" data-ms-format-command="gridlines-on">Show Gridlines</button>
                <button type="button" data-ms-format-command="gridlines-off">Hide Gridlines</button>
                <button type="button" data-ms-format-command="gridlines-default">Default Gridlines</button>
              </div>
            </details>
            <button class="ms-large-button" type="button" data-ms-format-command="layout"><i>▤</i>Layout</button>
          </div>
          <span class="group-label">Format</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <button class="ms-large-button" type="button" data-ms-format-command="insert-column"><i>↕</i>Insert<br/>Column</button>
            <div class="ms-command-stack">
              <details class="ms-ribbon-menu">
                <summary class="ms-icon-button"><i>▦</i>Column Settings ▾</summary>
                <div class="ms-ribbon-popover">
                  <button type="button" data-ms-format-command="fit-columns">Fit key columns</button>
                  <button type="button" data-ms-format-command="wide-task-name">Wider Task Name</button>
                  <button type="button" data-ms-format-command="compact-columns">Compact columns</button>
                </div>
              </details>
              <button class="ms-icon-button" type="button" data-ms-format-command="custom-fields"><i>▣</i>Custom Fields</button>
            </div>
          </div>
          <span class="group-label">Columns</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <details class="ms-ribbon-menu">
              <summary class="ms-large-button"><i>▰</i>Format ▾</summary>
              <div class="ms-ribbon-popover">
                <button type="button" data-ms-format-command="bar-styles">Bar Styles</button>
                <button type="button" data-ms-format-command="text-styles">Text Styles</button>
                <button type="button" data-ms-format-command="layout">Layout</button>
              </div>
            </details>
            <div class="ms-checkbox-stack">
              <label><input type="checkbox" data-ms-format-command="critical-tasks"/> Critical Tasks</label>
              <label><input type="checkbox" data-ms-format-command="slack"/> Slack</label>
              <label><input type="checkbox" data-ms-format-command="late-tasks"/> Late Tasks</label>
            </div>
            <details class="ms-ribbon-menu">
              <summary class="ms-large-button"><i>↝</i>Task<br/>Path ▾</summary>
              <div class="ms-ribbon-popover">
                <button type="button" data-ms-format-command="task-path-predecessors">Predecessors</button>
                <button type="button" data-ms-format-command="task-path-successors">Successors</button>
                <button type="button" data-ms-format-command="task-path-clear">Clear Task Path</button>
              </div>
            </details>
            <button class="ms-large-button" type="button" data-ms-format-command="baseline"><i>▬</i>Baseline</button>
            <button class="ms-large-button" type="button" data-ms-format-command="slippage"><i>▭</i>Slippage</button>
          </div>
          <span class="group-label">Bar Styles</span>
        </div>
        <div class="command-group ms-style-gallery-group">
          <div class="ms-command-body">
            <div class="ms-gantt-style-gallery" aria-label="Gantt chart style gallery">
              ${Array.from({ length: 16 }, (_, index) => styleTile(index + 1)).join("")}
            </div>
          </div>
          <span class="group-label">Gantt Chart Style</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <div class="ms-checkbox-stack">
              <label><input type="checkbox" data-ms-format-command="outline-number"/> Outline Number</label>
              <label><input type="checkbox" data-ms-format-command="project-summary-task"/> Project Summary Task</label>
              <label><input type="checkbox" checked data-ms-format-command="summary-tasks"/> Summary Tasks</label>
            </div>
          </div>
          <span class="group-label">Show/Hide</span>
        </div>
        <div class="command-group">
          <div class="ms-command-body">
            <details class="ms-ribbon-menu">
              <summary class="ms-large-button"><i>◯</i>Drawing ▾</summary>
              <div class="ms-ribbon-popover">
                <button type="button" data-ms-format-command="drawing-line">Line placeholder</button>
                <button type="button" data-ms-format-command="drawing-callout">Callout placeholder</button>
                <button type="button" data-ms-format-command="drawing-clear">Clear drawings placeholder</button>
              </div>
            </details>
          </div>
          <span class="group-label">Drawings</span>
        </div>
      </div>`;
    formatPanel.addEventListener("click", handleFormatClick);
    formatPanel.addEventListener("change", handleFormatChange);
  }

  function styleTile(index) {
    return `<button class="ms-gantt-style-tile" type="button" data-ms-format-command="gantt-style" data-style-index="${index}" title="Gantt style ${index}"><span class="ms-style-preview style-${index}"></span></button>`;
  }

  function patchVersion() {
    const label = `${GANTT_FORMAT_VERSION} · Gantt Chart Format ribbon`;
    const ribbon = document.getElementById("ribbonVersionText");
    const badge = document.getElementById("appVersionBadge");
    const footer = document.getElementById("appVersionFooter");
    if (ribbon) ribbon.textContent = label;
    if (badge) badge.textContent = label;
    if (footer) footer.textContent = `${label} · Build 2026-06-23`;
  }

  function handleFormatChange(event) {
    const command = event.target?.dataset?.msFormatCommand;
    if (!command) return;
    const checked = Boolean(event.target.checked);
    switch (command) {
      case "critical-tasks": return toggleBodyClass("ms-format-critical", checked, checked ? "Critical/late highlighting on." : "Critical highlighting off.");
      case "slack": return toast("Slack display is reserved for the Critical Path + Slack module.");
      case "late-tasks": return toggleBodyClass("ms-format-critical", checked, checked ? "Late task highlighting on." : "Late task highlighting off.");
      case "outline-number": return toggleOutlineNumber(checked);
      case "project-summary-task": return toast("Project Summary Task display comes with the summary/task table polish.");
      case "summary-tasks": return toggleBodyClass("ms-format-hide-summary", !checked, checked ? "Summary tasks shown." : "Summary tasks hidden.");
      default: return toast("Format option changed.");
    }
  }

  function handleFormatClick(event) {
    const commandEl = event.target.closest("[data-ms-format-command]");
    if (!commandEl || commandEl.tagName === "INPUT") return;
    const command = commandEl.dataset.msFormatCommand;
    switch (command) {
      case "text-styles": return toggleBodyClass("ms-format-text-large", !document.body.classList.contains("ms-format-text-large"), "Text style toggled.");
      case "gridlines-on": return toggleBodyClass("ms-format-gridlines-off", false, "Gridlines shown.");
      case "gridlines-off": return toggleBodyClass("ms-format-gridlines-off", true, "Gridlines hidden.");
      case "gridlines-default": return toggleBodyClass("ms-format-gridlines-off", false, "Default gridlines restored.");
      case "layout": return openLayoutControls();
      case "insert-column": return toast("Insert Column placeholder added. Column picker comes with custom fields.");
      case "fit-columns": return setColumnPreset("fit");
      case "wide-task-name": return setColumnPreset("wide");
      case "compact-columns": return setColumnPreset("compact");
      case "custom-fields": return toast("Custom Fields are build item 14. This button is reserved for that module.");
      case "bar-styles": return toast("Bar Styles gallery is active. Pick a style tile to change progress fill colors.");
      case "task-path-predecessors": return toast("Task Path predecessor highlighting placeholder added. Dependency path highlighting comes with critical path/slack.");
      case "task-path-successors": return toast("Task Path successor highlighting placeholder added. Dependency path highlighting comes with critical path/slack.");
      case "task-path-clear": return toast("Task Path highlighting cleared.");
      case "baseline": return clickId("setBaselineBtn");
      case "slippage": return toast("Slippage display comes with baseline variance/critical path polish.");
      case "gantt-style": return applyStyle(Number(commandEl.dataset.styleIndex));
      case "drawing-line":
      case "drawing-callout":
      case "drawing-clear": return toast("Drawing tools are placeholders. Notes/hyperlinks polish comes before drawing objects.");
      default: return toast("Format command added.");
    }
  }

  function applyStyle(index) {
    [...document.body.classList]
      .filter((name) => name.startsWith(STYLE_CLASS_PREFIX))
      .forEach((name) => document.body.classList.remove(name));
    document.body.classList.add(`${STYLE_CLASS_PREFIX}${index}`);
    document.querySelectorAll(".ms-gantt-style-tile").forEach((tile) => tile.classList.toggle("is-active", Number(tile.dataset.styleIndex) === index));
    toast(`Gantt Chart Style ${index} applied.`);
  }

  function openLayoutControls() {
    const viewTab = document.querySelector('[data-ribbon-tab="view"]');
    viewTab?.click();
    setTimeout(() => document.getElementById("rowHeightControl")?.focus(), 0);
    toast("Use View controls for row height and day-cell zoom.");
  }

  function setColumnPreset(preset) {
    const prefs = window.uiPrefs || (typeof uiPrefs !== "undefined" ? uiPrefs : null);
    if (!prefs?.fieldColumns) {
      toast("Column sizing controls are not ready yet.");
      return;
    }
    if (preset === "fit") {
      prefs.fieldPaneWidth = 980;
      prefs.fieldColumns.name = 330;
      prefs.fieldColumns.predecessors = 120;
      prefs.fieldColumns.successors = 120;
    } else if (preset === "wide") {
      prefs.fieldPaneWidth = 1120;
      prefs.fieldColumns.name = 470;
    } else if (preset === "compact") {
      prefs.fieldPaneWidth = 760;
      prefs.fieldColumns.name = 260;
      prefs.fieldColumns.predecessors = 90;
      prefs.fieldColumns.successors = 90;
    }
    if (typeof saveUiPrefs === "function") saveUiPrefs();
    if (typeof render === "function") render();
    toast(`Column preset applied: ${preset}.`);
  }

  function toggleOutlineNumber(checked) {
    document.body.classList.toggle("ms-format-outline-number", checked);
    toast(checked ? "Outline numbers already show in WBS column." : "Outline number toggle off. WBS column remains available.");
  }

  function toggleBodyClass(className, enabled, message) {
    document.body.classList.toggle(className, enabled);
    toast(message);
  }

  function clickId(id) {
    const el = document.getElementById(id);
    if (!el) {
      toast("Command is not available in this view yet.");
      return false;
    }
    el.click();
    return true;
  }

  function toast(message) {
    let el = document.getElementById("msGanttFormatToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "msGanttFormatToast";
      el.className = "ms-gantt-format-toast";
      document.body.appendChild(el);
    }
    el.textContent = message;
    clearTimeout(el._hideTimer);
    el.hidden = false;
    el._hideTimer = setTimeout(() => { el.hidden = true; }, 3000);
  }
})();
