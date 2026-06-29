(() => {
  'use strict';

  const R = window.NativeMppReader;
  if (!R || window.__liveSafeMppPercentBridgeLoaded) return;
  window.__liveSafeMppPercentBridgeLoaded = true;

  const VERSION = '0.1.0-live-safe-percent-bridge';
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

  mark('live-safe-percent-bridge-installed', { version: VERSION });

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
      if (result.projectXml) result.projectXml = patchXml(result.projectXml, sequence);
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

  function patchXml(xml, sequence) {
    let index = 0;
    return String(xml || '').replace(/<Task>([\s\S]*?)<\/Task>/g, (match, body) => {
      const percent = clampPercent(sequence[index++]);
      let next = body;
      if (/<PercentComplete>[\s\S]*?<\/PercentComplete>/i.test(next)) {
        next = next.replace(/<PercentComplete>[\s\S]*?<\/PercentComplete>/i, `<PercentComplete>${percent}</PercentComplete>`);
      } else if (/<Work>[\s\S]*?<\/Work>/i.test(next)) {
        next = next.replace(/<Work>[\s\S]*?<\/Work>/i, (work) => `${work}\n      <PercentComplete>${percent}</PercentComplete>`);
      } else {
        next += `\n      <PercentComplete>${percent}</PercentComplete>`;
      }
      return `<Task>${next}</Task>`;
    });
  }

  function countXmlTasks(xml) {
    return (String(xml || '').match(/<Task>/g) || []).length;
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
})();
