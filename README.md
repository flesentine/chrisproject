# Chris's Discount Project Maker — v0.27.0

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.27.0 changes

- Expanded the Task tab into a fuller Microsoft Project-style Task ribbon.
- Adds View, Clipboard, Font, Schedule, Tasks, Insert, Properties, and Editing groups modeled after the real Project Task ribbon.
- Wires working commands to existing app behavior: Gantt/Resource view switch, add task, task information, auto schedule, indent/outdent via existing controls, percent complete buttons, notes/details tabs, scroll to selected task, find task, copy/paste task copy, move task earlier/later, milestone insert, and summary placeholder insert.
- Adds placeholders/toasts for commands that need later feature work, including font styling, format painter, deliverable, add to timeline, and fill down.

## v0.26.0 changes

- Returned the main schedule view to the original MS Project-style grid + Gantt layout.
- Restored the real task columns, including ID, indicators, WBS, task name, duration, start, finish, percent complete, predecessors, successors, and actions.
- Restored the original resizable split between the task sheet and Gantt chart.
- Restored the classic rubberband dependency linking surface and the existing predecessor/successor editing workflow.
- Kept the newer blue/green visual polish, progress fills, baseline styling, and cleaner header treatment.
- Hid the experimental ProjectHub card canvas so the serious scheduling functionality stays front and center.

## Use

Open `index.html` locally or host the folder on GitHub Pages. Use the restored MS Project-style schedule grid for real planning, dependency links, predecessor/successor columns, baselines, progress, actuals, resources, XML import/export, and CSV export. Use the Task tab for the full ribbon command surface.
