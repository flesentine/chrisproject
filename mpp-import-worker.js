/* Browser-only MPP import worker. Static-site safe: no server, no upload. */
self.window = self;
self.document = self.document || {
  currentScript: null,
  createElement() { return { dataset: {}, setAttribute() {}, appendChild() {} }; },
  body: { appendChild() {} },
  documentElement: { appendChild() {} },
  head: { appendChild() {} },
  querySelector() { return null; },
};

// Live imports must feel fast. The heavy reverse-engineering modules still run in
// the GitHub corpus workflow, not on every user upload. This worker does a safe
// first pass: open the MPP, recover task skeleton/name data, and return quickly.
const MODULES = [
  'mpp-native-reader.js',
  'mpp-native-reader-import-polish.js',
  'mpp-native-task-skeleton-polish.js',
  'mpp-native-task-skeleton-v2-polish.js',
  'mpp-native-date-sanity-polish.js',
];

try {
  importScripts(...MODULES);
} catch (error) {
  self.__mppWorkerBootError = error;
}

self.onmessage = async (event) => {
  const { id, name, buffer } = event.data || {};
  const progress = (percent, stage, detail) => self.postMessage({ id, progress: { percent, stage, detail } });
  try {
    progress(24, 'Fast worker ready', 'Loaded the fast browser-only MPP importer.');
    if (self.__mppWorkerBootError) throw self.__mppWorkerBootError;
    if (!self.NativeMppReader?.readBufferAsync && !self.NativeMppReader?.readBuffer) {
      throw new Error('Native MPP reader did not load inside the worker.');
    }
    progress(36, 'Opening MPP', 'Reading the Project file container locally...');
    const result = self.NativeMppReader.readBufferAsync
      ? await self.NativeMppReader.readBufferAsync(buffer, name || 'project.mpp')
      : self.NativeMppReader.readBuffer(buffer, name || 'project.mpp');
    progress(82, 'Preparing fast import', 'Returning the first usable schedule view. Deep diagnostics are skipped for speed.');
    const cleaned = sanitizeResult(result);
    cleaned.liveImportMode = 'fast-worker';
    cleaned.warnings = Array.isArray(cleaned.warnings) ? cleaned.warnings : [];
    cleaned.warnings.unshift('Fast MPP import mode: loaded the first usable schedule quickly. Deep native resources, assignments, and date scans are skipped on live upload for speed.');
    self.postMessage({ id, ok: true, result: cleaned });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error || 'MPP worker failed') });
  }
};

function sanitizeResult(result) {
  if (!result || typeof result !== 'object') return result;
  const copy = { ...result };
  if (Array.isArray(copy.streams)) {
    copy.streams = copy.streams.slice(0, 120).map((stream) => ({
      path: stream.path || stream.name || '',
      name: stream.name || '',
      size: stream.size || 0,
      type: stream.type || '',
    }));
  }
  if (Array.isArray(copy.candidateStrings)) copy.candidateStrings = copy.candidateStrings.slice(0, 80);
  if (copy.nativeTaskSkeletonDiagnostics?.streams) {
    copy.nativeTaskSkeletonDiagnostics = {
      ...copy.nativeTaskSkeletonDiagnostics,
      streams: copy.nativeTaskSkeletonDiagnostics.streams.slice(0, 40),
    };
  }
  delete copy.nativeTaskDates;
  delete copy.nativeTaskFixedDates;
  delete copy.nativeResourceTableV2;
  delete copy.nativeAssignmentTableV3;
  return copy;
}
