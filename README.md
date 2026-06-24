# Chris's Discount Project Maker — v0.26.0

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.26.0 changes

- Returned the main schedule view to the original MS Project-style grid + Gantt layout.
- Restored the real task columns, including ID, indicators, WBS, task name, duration, start, finish, percent complete, predecessors, successors, and actions.
- Restored the original resizable split between the task sheet and Gantt chart.
- Restored the classic rubberband dependency linking surface and the existing predecessor/successor editing workflow.
- Kept the newer blue/green visual polish, progress fills, baseline styling, and cleaner header treatment.
- Hid the experimental ProjectHub card canvas so the serious scheduling functionality stays front and center.

## v0.25.4 changes

- Restored dependency logic to the Stitch canvas instead of hiding it behind the old grid.
- Added Predecessors and Successors columns to the ProjectHub Task List pane.
- Added dependency badges that open Task Information for editing predecessor/successor details.
- Drew dependency connector lines between Gantt bars in the Stitch Gantt pane.
- Updated the hover detail card with Network Logic, including predecessor and successor task names/types.
- Added a Classic links button that toggles back to the original grid/Gantt editor when rubberband dependency linking is needed.

## Use

Open `index.html` locally or host the folder on GitHub Pages. Use the restored MS Project-style schedule grid for real planning, dependency links, predecessor/successor columns, baselines, progress, actuals, resources, XML import/export, and CSV export.
