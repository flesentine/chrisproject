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

const MODULES = [
  'mpp-native-reader.js',
  'mpp-native-reader-import-polish.js',
  'mpp-native-task-skeleton-polish.js',
  'mpp-native-task-skeleton-v2-polish.js',
  'mpp-native-task-skeleton-diagnostics-polish.js',
  'mpp-native-task-dates-polish.js',
  'mpp-native-task-fixed-dates-polish.js',
  'mpp-native-resource-table-v2-polish.js',
  'mpp-native-assignment-table-v3-polish.js',
  'mpp-native-date-sanity-polish.js',
];

try {
  importScripts(...MODULES);
} catch (error) {
  self.__mppWorkerBootError = error;
}

self.onmessage = async (event) => {
  const { id, name, buffer } = event.data || {};
  try {
    if (self.__mppWorkerBootError) throw self.__mppWorkerBootError;
    if (!self.NativeMppReader?.readBufferAsync && !self.NativeMppReader?.readBuffer) {
      throw new Error('Native MPP reader did not load inside the worker.');
    }
    const result = self.NativeMppReader.readBufferAsync
      ? await self.NativeMppReader.readBufferAsync(buffer, name || 'project.mpp')
      : self.NativeMppReader.readBuffer(buffer, name || 'project.mpp');
    self.postMessage({ id, ok: true, result: sanitizeResult(result) });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || String(error || 'MPP worker failed') });
  }
};

function sanitizeResult(result) {
  if (!result || typeof result !== 'object') return result;
  const copy = { ...result };
  if (Array.isArray(copy.streams)) {
    copy.streams = copy.streams.slice(0, 300).map((stream) => ({
      path: stream.path || stream.name || '',
      name: stream.name || '',
      size: stream.size || 0,
      type: stream.type || '',
    }));
  }
  if (Array.isArray(copy.candidateStrings)) copy.candidateStrings = copy.candidateStrings.slice(0, 250);
  if (copy.nativeTaskSkeletonDiagnostics?.streams) {
    copy.nativeTaskSkeletonDiagnostics = {
      ...copy.nativeTaskSkeletonDiagnostics,
      streams: copy.nativeTaskSkeletonDiagnostics.streams.slice(0, 120),
    };
  }
  if (copy.nativeTaskDates?.samples) copy.nativeTaskDates = { ...copy.nativeTaskDates, samples: copy.nativeTaskDates.samples.slice(0, 40) };
  if (copy.nativeTaskFixedDates?.samples) copy.nativeTaskFixedDates = { ...copy.nativeTaskFixedDates, samples: copy.nativeTaskFixedDates.samples.slice(0, 40) };
  if (copy.nativeResourceTableV2?.samples) copy.nativeResourceTableV2 = { ...copy.nativeResourceTableV2, samples: copy.nativeResourceTableV2.samples.slice(0, 40) };
  if (copy.nativeAssignmentTableV3?.samples) copy.nativeAssignmentTableV3 = { ...copy.nativeAssignmentTableV3, samples: copy.nativeAssignmentTableV3.samples.slice(0, 40), unresolvedSamples: (copy.nativeAssignmentTableV3.unresolvedSamples || []).slice(0, 40) };
  return copy;
}
