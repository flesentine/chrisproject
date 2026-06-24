# Chris's Discount Project Maker — v0.27.1

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.27.1 changes

- Adds a Hide Ribbon / Show Ribbon toggle to save vertical desktop space.
- Collapses the command ribbon while leaving the ribbon tabs visible, similar to Microsoft Project.
- Remembers the collapsed state in local storage.
- Expands the task grid/Gantt viewport when the ribbon is hidden.

## v0.27.0 changes

- Expanded the Task tab into a fuller Microsoft Project-style Task ribbon.
- Adds View, Clipboard, Font, Schedule, Tasks, Insert, Properties, and Editing groups modeled after the real Project Task ribbon.
- Wires working commands to existing app behavior: Gantt/Resource view switch, add task, task information, auto schedule, indent/outdent via existing controls, percent complete buttons, notes/details tabs, scroll to selected task, find task, copy/paste task copy, move task earlier/later, milestone insert, and summary placeholder insert.
- Adds placeholders/toasts for commands that need later feature work, including font styling, format painter, deliverable, add to timeline, and fill down.

## Use

Open `index.html` locally or host the folder on GitHub Pages. Use the restored MS Project-style schedule grid for real planning, dependency links, predecessor/successor columns, baselines, progress, actuals, resources, XML import/export, and CSV export. Click Hide Ribbon to reclaim vertical screen space, then Show Ribbon when you need the commands again.
