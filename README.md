# Chris's Discount Project Maker — v0.38.0

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.38.0 changes

- Adds task-level hyperlink text and hyperlink URL fields to Task Information → Notes.
- Keeps task notes active and visible through the existing notes indicator.
- Adds a 🔗 hyperlink indicator in the grid when a task has a valid hyperlink URL.
- Normalizes plain domains like `example.com/spec` to `https://example.com/spec` and blocks unsupported URL schemes.
- Exports/imports task hyperlinks through Project XML using `Hyperlink` and `HyperlinkAddress` task fields.
- Keeps resource notes available in the Resource Sheet; fuller resource-note workflow can come later.
- Acceptance path: open Task Information → Notes, enter task notes plus hyperlink text/URL, save, confirm 📝 and 🔗 indicators appear in the grid, then export Project XML and confirm the hyperlink fields are present.

## Use

Open `index.html` locally or host the folder on GitHub Pages. Use the restored MS Project-style schedule grid for real planning, dependency links, predecessor/successor columns, baselines, progress, actuals, resources, costs, notes, hyperlinks, XML import/export, and CSV export. Use Task, Project, Resource, View, and Gantt Chart Format tabs for the fuller MS Project-style command surface.
