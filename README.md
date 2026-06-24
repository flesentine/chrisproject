# Chris's Discount Project Maker — v0.39.0

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.39.0 changes

- Adds split-task support on Gantt bars with multiple visible work segments.
- Adds a draggable middle ✂ split handle on regular task bars; drag it to choose the split gap or click Split task to split at the midpoint.
- Stores split segment metadata locally without changing the task's overall start/finish span.
- Adds a Recurring task command that creates daily, weekly, or monthly repeated task rows from the selected task.
- Recurring rows get their own UIDs, dates, progress state, and optional copied predecessor links so they can be edited independently.
- Shows a ↻ badge on recurring task bars and split segment overlays on split task bars.
- Exports split and recurring metadata through Project XML task ExtendedAttribute values using Text30 and Text29 payloads, while keeping the core MSPDI task data compatible.
- Imports those extension payloads back when a Project XML file created by this app is reloaded.
- Acceptance path: select a 3+ day task, choose Task → Split / Repeat → Split task, drag the ✂ handle, export Project XML, re-import it, and confirm the split overlay returns. Then choose Recurring task, create weekly occurrences, and confirm repeated task rows appear with ↻ badges.

## Use

Open `index.html` locally or host the folder on GitHub Pages. Use the restored MS Project-style schedule grid for real planning, dependency links, predecessor/successor columns, baselines, progress, actuals, resources, costs, notes, hyperlinks, split tasks, recurring tasks, XML import/export, and CSV export. Use Task, Project, Resource, View, and Gantt Chart Format tabs for the fuller MS Project-style command surface.
