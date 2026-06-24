(() => {
  const VERSION = "v0.26.0";

  function loadClassicCss() {
    document.body.classList.add("projecthub-stitch-theme", "ms-project-classic-theme");
    const existing = document.getElementById("msProjectClassicCss");
    if (existing) {
      existing.href = `ms-project-classic.css?${VERSION}`;
      return;
    }
    const link = document.createElement("link");
    link.id = "msProjectClassicCss";
    link.rel = "stylesheet";
    link.href = `ms-project-classic.css?${VERSION}`;
    document.head.appendChild(link);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", loadClassicCss, { once: true });
  } else {
    loadClassicCss();
  }
})();
