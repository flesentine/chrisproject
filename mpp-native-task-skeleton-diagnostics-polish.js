(() => {
  'use strict';

  const R = window.NativeMppReader;
  if (!R || window.__nativeMppTaskSkeletonDiagnosticsLoaded) return;
  window.__nativeMppTaskSkeletonDiagnosticsLoaded = true;

  const VERSION = '0.1.0-task-stream-diagnostics';
  const baseReadBuffer = R.readBuffer?.bind(R);
  const baseReadBufferAsync = R.readBufferAsync?.bind(R);
  const baseRead = R.read?.bind(R);

  if (baseReadBuffer) R.readBuffer = (buffer, name = 'project.mpp', options = {}) => annotate(buffer, baseReadBuffer(buffer, name, options));
  if (baseReadBufferAsync) R.readBufferAsync = async (buffer, name = 'project.mpp') => annotate(buffer, await baseReadBufferAsync(buffer, name));
  if (baseRead) R.read = async (file) => {
    const buffer = await file.arrayBuffer();
    return R.readBufferAsync ? R.readBufferAsync(buffer, file.name || 'project.mpp') : annotate(buffer, await baseRead(file));
  };

  function annotate(buffer, result) {
    if (!result?.mppContainerRead || !R.CompoundFileBinary) return result;
    try {
      const cfb = new R.CompoundFileBinary(buffer);
      const streams = ['FixedMeta', 'FixedData', 'Fixed2Meta', 'Fixed2Data', 'VarMeta', 'Var2Data'].map((name) => {
        const hit = find(cfb, `TBkndTask/${name}`);
        return { name, found: Boolean(hit), path: hit?.path || '', size: hit?.size || 0 };
      });
      const fixedMeta = streams.find((item) => item.name === 'FixedMeta');
      const fixedData = streams.find((item) => item.name === 'FixedData');
      const varMeta = streams.find((item) => item.name === 'VarMeta');
      const var2Data = streams.find((item) => item.name === 'Var2Data');
      result.nativeTaskStreamDiagnostics = {
        version: VERSION,
        streams,
        taskStreamCount: streams.filter((item) => item.found).length,
        hasFixedPair: Boolean(fixedMeta?.found && fixedData?.found),
        hasVarPair: Boolean(varMeta?.found && var2Data?.found),
        taskLikeStreams: cfb.entries
          .filter((entry) => entry.type === 2 && /task|tbkndtask|tsk/i.test(String(entry.path || entry.name || '')))
          .map((entry) => ({ path: entry.path || entry.name, size: entry.size }))
          .slice(0, 40),
      };
      result.nativeTable = result.nativeTable || {};
      result.nativeTable.fieldCoverage = {
        ...(result.nativeTable.fieldCoverage || {}),
        taskStreamCount: result.nativeTaskStreamDiagnostics.taskStreamCount,
        taskHasFixedPair: result.nativeTaskStreamDiagnostics.hasFixedPair ? 1 : 0,
        taskHasVarPair: result.nativeTaskStreamDiagnostics.hasVarPair ? 1 : 0,
        taskLikeStreamCount: result.nativeTaskStreamDiagnostics.taskLikeStreams.length,
        taskFixedMetaSize: fixedMeta?.size || 0,
        taskFixedDataSize: fixedData?.size || 0,
        taskVarMetaSize: varMeta?.size || 0,
        taskVar2DataSize: var2Data?.size || 0,
      };
    } catch (error) {
      result.warnings = result.warnings || [];
      result.warnings.push(`Task stream diagnostics failed: ${error.message || error}`);
    }
    return result;
  }

  function find(cfb, suffix) {
    const s = String(suffix || '').toLowerCase();
    return cfb.entries.find((entry) => entry.type === 2 && String(entry.path || '').toLowerCase().endsWith(s)) || null;
  }
})();
