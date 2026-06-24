# Chris's Discount Project Maker — v0.29.0

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.29.0 changes

- Expanded the View tab into a fuller Microsoft Project-style View ribbon.
- Adds Task Views, Resource Views, Data, Zoom, Split View, Window, and Macros groups modeled after the real Project View ribbon.
- Adds Gantt Chart, Task Usage, Network Diagram, Calendar, Other Views, Team Planner, Resource Usage, Resource Sheet, Sort, Outline, Tables, Highlight, Filter, Group By, Timescale, Zoom, Entire Project, Selected Tasks, Timeline, Details, New Window, Switch Windows, Arrange All, Hide, and Macros commands.
- Wires available commands to existing app behavior: Gantt/Resource view switching, day-cell zoom/timescale, scroll to selected task, summary hide/show, resource sheet, auto focus for calendar fields, CSV export macro, and Project update macro.
- Leaves placeholder toasts for later modules such as Task Usage, Network Diagram, Team Planner, grouped rendering, and macro recording.

## v0.28.0 changes

- Expanded the Project tab into a fuller Microsoft Project-style Project ribbon.
- Adds Insert, Add-ins, Properties, Schedule, Status, and Proofing groups modeled after the real Project ribbon.
- Adds Subproject, Get Add-ins, My Add-ins, Project Information, Custom Fields, Links Between Projects, WBS, Change Working Time, Calculate Project, Set Baseline, Move Project, Status Date, Update Project, and Spelling commands.
- Wires working commands to existing app behavior where available: XML import/subproject flow, project start/working time focus, WBS refresh, auto schedule, set baseline, clear baseline, project date shifting, status date propagation, project update, and basic task-name spelling checks.

## Use

Open `index.html` locally or host the folder on GitHub Pages. Use the restored MS Project-style schedule grid for real planning, dependency links, predecessor/successor columns, baselines, progress, actuals, resources, XML import/export, and CSV export. Use Task, Project, and View tabs for the fuller MS Project-style command surface.
