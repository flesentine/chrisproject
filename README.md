# Chris's Discount Project Maker — v0.40.0

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.40.0 changes

- Adds manual-first resource leveling without auto-moving the schedule behind the user's back.
- Detects overallocated Work resources by comparing each resource's daily assignment units against Max Units.
- Highlights overallocated task rows, Gantt bars, task indicators, and Resource Sheet rows.
- Adds a Level Delay column to the task grid and a Leveling delay field in Task Information → Advanced.
- Editing Leveling delay moves that task later while preserving its working duration, so conflicts can be resolved manually.
- Adds Resource → Leveling controls: Find conflicts plus a disabled Auto-level later button to keep this phase intentionally manual.
- Adds validation messages for resource overallocations.
- Exports and imports Project XML LevelingDelay / LevelingDelayFormat fields.
- Acceptance path: assign the same 100% Work resource to two overlapping tasks, confirm both tasks/resource show overallocated warnings, then set Level Delay on one task until the warning clears. Auto-level should remain disabled/later.

## Use

Open `index.html` locally or host the folder on GitHub Pages. Use the restored MS Project-style schedule grid for real planning, dependency links, predecessor/successor columns, baselines, progress, actuals, resources, costs, notes, hyperlinks, split tasks, recurring tasks, manual resource leveling, XML import/export, and CSV export. Use Task, Project, Resource, View, and Gantt Chart Format tabs for the fuller MS Project-style command surface.
