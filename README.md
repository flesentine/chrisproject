# Chris's Discount Project Maker — v0.35.0

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.35.0 changes

- Adds the Baselines build: Set Baseline saves Baseline Start, Baseline Finish, Baseline Duration, baseline work, and baseline cost placeholders.
- Adds visible baseline/variance grid columns beside Start/Finish: BL Start, BL Finish, BL Dur, Start Var, Finish Var, and Dur Var.
- Fixes schedule variance math so an unchanged baseline shows 0d and moving a task later shows positive working-day variance.
- Keeps baseline ghost bars visible under current Gantt bars after the plan moves.
- Acceptance path: click Project → Set Baseline, move a task later, then confirm Start Var updates and the old date range remains as the baseline ghost bar.

## Use

Open `index.html` locally or host the folder on GitHub Pages. Use the restored MS Project-style schedule grid for real planning, dependency links, predecessor/successor columns, baselines, progress, actuals, resources, XML import/export, and CSV export. Use Task, Project, Resource, View, and Gantt Chart Format tabs for the fuller MS Project-style command surface.
