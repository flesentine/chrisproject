# Chris's Discount Project Maker — v0.25.4

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.25.4 changes

- Restores dependency logic to the Stitch canvas instead of hiding it behind the old grid.
- Adds Predecessors and Successors columns to the ProjectHub Task List pane.
- Adds dependency badges that open Task Information for editing predecessor/successor details.
- Draws dependency connector lines between Gantt bars in the Stitch Gantt pane.
- Updates the hover detail card with Network Logic, including predecessor and successor task names/types.
- Adds a Classic links button that toggles back to the original grid/Gantt editor when rubberband dependency linking is needed.

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

Open `index.html` locally or host the folder on GitHub Pages. Use the ProjectHub sidebar for file, task, resource, Gantt, calendar, report, and settings commands. Use the Predecessors/Successors badges or double-click a task to edit logic. Use Classic links in the Gantt pane when you want the original rubberband dependency editor.
