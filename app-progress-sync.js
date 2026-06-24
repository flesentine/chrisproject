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
  const STITCH_VERSION = "v0.27.1";

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
    document.body.appendChild(script);
  }

  function bootStitchCanvasLoader() {
    document.body.classList.add("projecthub-stitch-theme");
    loadCssOnce("stitchThemeCss", `stitch-theme.css?${STITCH_VERSION}`);
    loadCssOnce("stitchCanvasCss", `stitch-canvas.css?${STITCH_VERSION}`);
    loadCssOnce("stitchCanvasFixCss", `stitch-canvas-fix.css?${STITCH_VERSION}`);
    loadCssOnce("stitchSidebarCommandsCss", `stitch-sidebar-commands.css?${STITCH_VERSION}`);
    loadCssOnce("msProjectClassicCss", `ms-project-classic.css?${STITCH_VERSION}`);
    loadCssOnce("msProjectTaskRibbonCss", `ms-project-task-ribbon.css?${STITCH_VERSION}`);
    loadCssOnce("msProjectRibbonCollapseCss", `ms-project-ribbon-collapse.css?${STITCH_VERSION}`);
    loadScriptOnce("stitchCanvasJs", `stitch-canvas.js?${STITCH_VERSION}`);
    loadScriptOnce("stitchSidebarCommandsJs", `stitch-sidebar-commands.js?${STITCH_VERSION}`);
    loadScriptOnce("msProjectTaskRibbonJs", `ms-project-task-ribbon.js?${STITCH_VERSION}`);
    loadScriptOnce("msProjectRibbonCollapseJs", `ms-project-ribbon-collapse.js?${STITCH_VERSION}`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootStitchCanvasLoader, { once: true });
  } else {
    bootStitchCanvasLoader();
  }
})();
