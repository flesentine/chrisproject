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
