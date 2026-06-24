(() => {
  const APP_VIEWS_VERSION = "v0.40.0";

  function boot() {
    loadCssOnce("msProjectViewsCss", `app-views.css?${APP_VIEWS_VERSION}`);
    loadScriptOnce("msProjectViewsJs", `app-views.js?${APP_VIEWS_VERSION}`);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

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
    const existing = document.getElementById(id);
    if (existing) {
      existing.src = src;
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = src;
    script.defer = true;
    script.async = false;
    document.body.appendChild(script);
  }
})();
