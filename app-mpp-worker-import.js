(() => {
  'use strict';

  const VERSION = '0.1.0-worker-mpp-import';
  let installAttempts = 0;

  function install() {
    const R = window.NativeMppReader;
    if (!R || !R.read || R.__workerImportVersion === VERSION) return;
    const fallbackRead = R.__mainThreadReadFallback || R.read.bind(R);
    R.__mainThreadReadFallback = fallbackRead;
    R.read = async function workerBackedMppRead(file) {
      if (!file) return null;
      if (!window.Worker) return fallbackRead(file);
      const timeoutMs = Math.max(20000, Math.min(90000, 20000 + Math.round((Number(file.size) || 0) / 150000)));
      return readInWorker(file, timeoutMs).catch((error) => {
        error.message = `${error.message || 'MPP import failed.'} The page stayed responsive because parsing was isolated in a Web Worker.`;
        throw error;
      });
    };
    R.__workerImportVersion = VERSION;
  }

  async function readInWorker(file, timeoutMs) {
    const buffer = await file.arrayBuffer();
    return new Promise((resolve, reject) => {
      const worker = new Worker('mpp-import-worker.js');
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        worker.terminate();
        reject(new Error(`MPP import exceeded ${Math.round(timeoutMs / 1000)} seconds and was stopped before Chrome froze.`));
      }, timeoutMs);

      worker.onmessage = (event) => {
        const data = event.data || {};
        if (data.id !== id || settled) return;
        settled = true;
        window.clearTimeout(timer);
        worker.terminate();
        if (data.ok) resolve(data.result);
        else reject(new Error(data.error || 'MPP worker import failed.'));
      };

      worker.onerror = (event) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        worker.terminate();
        reject(new Error(event.message || 'MPP worker crashed.'));
      };

      worker.postMessage({ id, name: file.name || 'project.mpp', buffer }, [buffer]);
    });
  }

  function retryInstall() {
    install();
    if (window.NativeMppReader?.__workerImportVersion === VERSION) return;
    if (++installAttempts < 30) window.setTimeout(retryInstall, 150);
  }

  retryInstall();
  [250, 750, 1500, 3000].forEach((delay) => window.setTimeout(install, delay));
})();
