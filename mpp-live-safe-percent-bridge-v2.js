(() => {
  'use strict';

  const VERSION = '0.2.0-delayed-percent-bridge';
  let tries = 0;

  function boot() {
    const R = window.NativeMppReader;
    if (!R || window.__liveSafeMppPercentBridgeV2Installed) return retry();
    if (!R.liveMppSafeXmlFilterVersion && tries < 80) return retry();
    window.__liveSafeMppPercentBridgeV2Installed = true;

    const baseReadBufferAsync = R.readBufferAsync?.bind(R);
    const baseRead = R.read?.bind(R);

    if (baseReadBufferAsync) {
      R.readBufferAsync = async function percentBridgeReadBufferAsync(buffer, name = 'project.mpp') {
        const result = await baseReadBufferAsync(buffer, name);
        return patchResult(result);
      };
    }

    if (baseRead) {
      R.read = async function percentBridgeRead(file) {
        const result = await baseRead(file);
        return patchResult(result);
      };
    }

    mark('live-safe-percent-bridge-installed', { version: VERSION, safeXmlFilter: R.liveMppSafeXmlFilterVersion || '' });
  }

  function retry() {
    if (++tries < 120) setTimeout(boot, 75);
  }

  function patchResult(result) {
    try {
      const sequence = result?.nativeTaskPercentComplete?.percentSequence;
      if (!Array.isArray(sequence) || !sequence.length) return result;
      const projectTasks = Array.isArray(result.project?.tasks) ? result.project.tasks : [];
      const draftTasks = Array.isArray(result.draftProject?.tasks) ? result.draftProject.tasks : [];
      const taskCount = Math.max(projectTasks.length, draftTasks.length, countXmlTasks(result.projectXml));
      let applied = 0;
      for (let i = 0; i < taskCount && i < sequence.length; i += 1) {
        const percent = clampPercent(sequence[i]);
        if (projectTasks[i]) {
          projectTasks[i].percent = percent;
          projectTasks[i].percentComplete = percent;
          projectTasks[i].nativePercentCompleteRecovered = true;
        }
        if (draftTasks[i]) {
          draftTasks[i].percent = percent;
          draftTasks[i].percentComplete = percent;
        }
        applied += 1;
      }
      if (result.projectXml) result.projectXml = patchXmlByTaskBlocks(result.projectXml, sequence);
      result.importPolish = {
        ...(result.importPolish || {}),
        liveSafePercentBridgeVersion: VERSION,
        percentCompleteApplied: applied,
        percentCompleteNonZero: sequence.slice(0, taskCount).filter((value) => clampPercent(value) > 0).length,
      };
      mark('live-safe-percent-bridge-applied', result.importPolish);
    } catch (error) {
      result.warnings = result.warnings || [];
      result.warnings.push(`Live safe percent bridge failed: ${error.message || error}`);
    }
    return result;
  }

  function patchXmlByTaskBlocks(xml, sequence) {
    const parts = String(xml || '').split('<Task>');
    if (parts.length <= 1) return xml;
    let taskIndex = 0;
    for (let i = 1; i < parts.length; i += 1) {
      const close = parts[i].indexOf('</Task>');
      if (close < 0) continue;
      const before = parts[i].slice(0, close);
      const after = parts[i].slice(close);
      const percent = clampPercent(sequence[taskIndex++]);
      parts[i] = replacePercent(before, percent) + after;
    }
    return parts.join('<Task>');
  }

  function replacePercent(body, percent) {
    const open = '<PercentComplete>';
    const close = '</PercentComplete>';
    const start = body.indexOf(open);
    if (start >= 0) {
      const end = body.indexOf(close, start + open.length);
      if (end >= 0) return body.slice(0, start + open.length) + percent + body.slice(end);
    }
    const workClose = '</Work>';
    const workEnd = body.indexOf(workClose);
    if (workEnd >= 0) {
      const insertAt = workEnd + workClose.length;
      return body.slice(0, insertAt) + `\n      ${open}${percent}${close}` + body.slice(insertAt);
    }
    return body + `\n      ${open}${percent}${close}`;
  }

  function countXmlTasks(xml) {
    return String(xml || '').split('<Task>').length - 1;
  }

  function clampPercent(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }

  function mark(type, data) {
    try {
      const dbg = window.__mppDebug;
      if (dbg?.events) {
        dbg.events.push({ t: `${Math.round(performance.now())}ms`, type, data: data || {} });
        dbg.events = dbg.events.slice(-80);
        dbg.lastResult = data || dbg.lastResult;
      }
      console.log('[MPP]', type, data || {});
    } catch {}
  }

  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot, { once: true }) : boot();
})();
