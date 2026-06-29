(() => {
  'use strict';
  if (window.__liveSafeMppPercentBridgeDelegateLoaded) return;
  window.__liveSafeMppPercentBridgeDelegateLoaded = true;
  const src = 'mpp-live-safe-percent-bridge-v2.js';
  if (document.querySelector(`script[src="${src}"]`)) return;
  const script = document.createElement('script');
  script.src = src;
  script.defer = true;
  script.dataset.liveSafePercentBridgeDelegate = '1';
  (document.body || document.head || document.documentElement).appendChild(script);
})();
