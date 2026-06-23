# Chris's Discount Project Maker — v0.25.1

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.25.1 changes

- Adds a small Stitch canvas hotfix layer.
- Fixes Gantt row positioning in the new two-pane canvas.
- Prevents the hover detail popover from being triggered by Gantt bars, so it behaves like the reference screenshot: hover task cards for detail.
- Hides old split and column resize handles in the themed canvas to remove the slow drag behavior.

## v0.25.0 changes

- Reworked the Stitch refresh into a real ProjectHub-style two-pane canvas instead of forcing the old grid to look like the screenshot.
- Adds a dedicated Task List pane with rounded task cards, status chips, assignee text, progress tracks, and active-card gradient styling.
- Adds a dedicated Gantt Chart View pane with month/week headers, grid lines, and rounded blue-to-green Gantt bars.
- Converts the large task detail card into a temporary hover/click popover so it no longer blocks the schedule permanently.
- Hides the old unified-grid splitter under the Stitch view, which removes the slow task/Gantt split dragging behavior from the themed canvas.
- Keeps double-click Task Information, progress / actuals, baseline, XML, CSV, resource, and dependency features available.

## Use

Open `index.html` locally or host the folder on GitHub Pages. Use Project → Set Baseline after your plan is approved, then update Task Information → Progress as work happens. The ProjectHub canvas shows task cards, hover details, partial completion, remaining work, and late/early warnings against the baseline.
