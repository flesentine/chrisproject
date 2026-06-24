# Chris's Discount Project Maker — v0.28.0

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.28.0 changes

- Expanded the Project tab into a fuller Microsoft Project-style Project ribbon.
- Adds Insert, Add-ins, Properties, Schedule, Status, and Proofing groups modeled after the real Project ribbon.
- Adds Subproject, Get Add-ins, My Add-ins, Project Information, Custom Fields, Links Between Projects, WBS, Change Working Time, Calculate Project, Set Baseline, Move Project, Status Date, Update Project, and Spelling commands.
- Wires working commands to existing app behavior where available: XML import/subproject flow, project start/working time focus, WBS refresh, auto schedule, set baseline, clear baseline, project date shifting, status date propagation, project update, and basic task-name spelling checks.
- Leaves placeholder toasts for future modules such as add-ins, custom fields, external project links, and WBS code masks.

## v0.27.1 changes

- Adds a Hide Ribbon / Show Ribbon toggle to save vertical desktop space.
- Collapses the command ribbon while leaving the ribbon tabs visible, similar to Microsoft Project.
- Remembers the collapsed state in local storage.
- Expands the task grid/Gantt viewport when the ribbon is hidden.

## Use

Open `index.html` locally or host the folder on GitHub Pages. Use the restored MS Project-style schedule grid for real planning, dependency links, predecessor/successor columns, baselines, progress, actuals, resources, XML import/export, and CSV export. Use Task and Project tabs for the fuller MS Project-style command surface.
