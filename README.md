# Chris's Discount Project Maker — v0.22.0

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.22.0 changes

- Added Set Baseline command on the Project ribbon.
- Saves baseline start, finish, duration, work, and cost for each task.
- Shows baseline ghost bars under the current Gantt bars.
- Calculates start, finish, duration, and cost variance.
- Adds a Baseline tab to Task Information.
- Summary tasks roll baseline dates/work/cost up from child leaf tasks.
- Project XML import/export now preserves baseline fields.
- CSV export includes baseline and variance columns.

## Use

Open `index.html` locally or host the folder on GitHub Pages. Use Project → Set Baseline after your plan is approved, then move tasks to see variance and ghost bars.
