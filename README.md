# Chris's Discount Project Maker — v0.24.1

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.24.1 changes

- Polished the Stitch / ProjectHub visual refresh after reviewing the live app screenshot.
- Docked the selected-task detail card into the right side of the schedule card instead of letting it float over rows and tooltips.
- Docked the Project Health card into the page header grid instead of absolutely floating over the canvas.
- Tightened the default task-list split and task-name column so the Gantt chart appears beside the list instead of being pushed offscreen.
- Added a cache-busted polish stylesheet so existing GitHub Pages visitors pick up the layout fix.

## v0.24.0 changes

- Added a Stitch-inspired ProjectHub visual refresh.
- Adds a dark blue ProjectHub title bar, left navigation rail, and cleaner white project canvas.
- Restyles the schedule area into a task-list + Gantt canvas with rounded task rows and gradient Gantt bars.
- Adds a floating Project Health card that summarizes progress, late baseline items, warnings, and cost readiness.
- Adds a floating selected-task detail card with status, due date, assignees, dependencies, notes, resource allocation, and predecessor links.
- Applies a better default split so the Gantt chart is visible beside the task list.
- Keeps the existing progress / actuals, baseline, XML, CSV, resource, and dependency features intact.

## v0.23.0 changes

- Added Progress / actuals tracking as the next MS Project-style build slice.
- Adds Actual Start, Actual Finish, Actual Duration, Remaining Duration, % Work Complete, and Status Date.
- Polishes % Complete display with task-sheet chips and Gantt progress labels.
- Shows progress fill directly on Gantt bars, including remaining-duration labels for in-progress work.
- Rolls summary progress up from child leaf tasks, including actual dates, actual duration, remaining duration, and % work complete.
- Flags tasks that are late or early against the saved baseline with row/bar warnings and indicators.
- Project XML export now writes StatusDate and task actual fields; Project XML import reads them back.
- CSV export is now an actuals-focused export with baseline variance and late/early warning columns.

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

Open `index.html` locally or host the folder on GitHub Pages. Use Project → Set Baseline after your plan is approved, then update Task Information → Progress as work happens. The ProjectHub canvas shows task cards, partial completion, remaining work, and late/early warnings against the baseline.
