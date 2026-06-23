# Chris's Discount Project Maker — v0.25.3

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.25.3 changes

- Moves the old top ribbon/header commands into the ProjectHub sidebar.
- Keeps the top header clean as branding only, like the Stitch reference screen.
- Adds sidebar command drawers for Home, Files, Grid, Tasks, Board, Gantt, Calendar, Reports, and Settings.
- Adds cleaner sidebar command styling and preserves the real buttons underneath so existing import, export, baseline, task, resource, and schedule logic still works.

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

Open `index.html` locally or host the folder on GitHub Pages. Use the ProjectHub sidebar for file, task, resource, Gantt, calendar, report, and settings commands. Use Project → Set Baseline from the sidebar after your plan is approved, then update Task Information → Progress as work happens.
