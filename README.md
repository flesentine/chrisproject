# Chris's Discount Project Maker

A lightweight Microsoft Project XML-compatible web app. It runs fully in the browser and can be hosted on GitHub Pages, Netlify, Vercel, S3, or any static web host.

## What it does

- Create and edit task schedules
- Show an interactive Gantt preview
- Drag Gantt task bars left/right to change dates
- Resize Gantt task bars from either edge to change duration
- Drop one Gantt bar onto another to create dependency links
- Choose FS, SS, FF, or SF link types from a no-typing popup
- Drag task-grid column edges to resize columns
- Drag the vertical splitter between task data and Gantt dates to move the chart/data boundary
- Drag date header edges or use the toolbar to resize day cells
- Adjust row height from the toolbar
- Track start, finish, duration, percent complete, WBS, outline level, and typed predecessors
- Import Microsoft Project XML / MSPDI files
- Export Microsoft Project XML / MSPDI files that can be opened by Microsoft Project Desktop
- Export CSV for quick review
- Save automatically in browser localStorage

## UX upgrades in this version

- Renamed to **Chris's Discount Project Maker**
- Added a branded portrait image
- Added direct-manipulation scheduling in the Gantt chart
- Added drag-to-link Gantt dependencies with a no-typing FS/SS/FF/SF picker popup
- Replaced the old field-width pixel slider with direct column dragging and a draggable chart/data splitter
- Added date-header drag resizing for day cells
- Cleaner app header with project context
- Project summary cards for task count, duration, completion, and XML readiness
- Grouped toolbar actions so planning, scheduling, and import/export are easier to scan
- Unified Microsoft Project-style rows where task fields and Gantt bars align on the same row
- Better row density, progress indicators, delete affordance, and sticky task columns
- Cleaner validation messaging
- Polished Gantt timeline with weekday labels, weekend shading, and inline bar editing

## Latest layout improvement

The unified grid now has a stronger splitter between task data and the Gantt timeline. Drag it left to hide the right-side data columns and give the chart more room. Drag it right to reveal the full task-entry grid again. Individual task columns and date cells can still be resized by dragging their header edges.

## Compatibility target

The first-class compatibility target is Microsoft Project XML, also called MSPDI. Native `.mpp` is not implemented in this static app because `.mpp` is a binary Microsoft Project format and generally requires a dedicated parser/converter library or backend service.

Recommended path:

1. MVP: Project XML import/export in the browser.
2. Later: add a backend using MPXJ if native `.mpp` read/write becomes necessary.

## How to run locally

Because this is a static app, you can open `index.html` directly in a browser.

For a cleaner local server:

```bash
cd chrisproject
python3 -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

## How to test with Microsoft Project

1. Open this app.
2. Click **Load sample**.
3. Drag or resize tasks in the Gantt chart.
4. Drop one task bar on another to create a dependency and pick FS, SS, FF, or SF from the popup.
5. Click **Export XML**.
6. Open the downloaded `.xml` file in Microsoft Project Desktop.
7. Save it from Microsoft Project as `.mpp` if needed.
8. Optionally export back to XML from Microsoft Project and import it into this app.

## Known limitations

This MVP intentionally keeps the model small. It does not yet support:

- Resource pools
- Assignment units/costs
- Baselines
- Constraints
- Calendars beyond a simple 8-hour day
- Critical path calculation
- Native `.mpp` import/export


## Unified grid behavior

This version uses one MS Project-style schedule sheet instead of separate task and chart panels:

- Each task row contains editable fields and its Gantt bar on the same line.
- Drag a bar left or right to move the task dates.
- Drag either edge of a bar to resize the task duration.
- Drag one bar onto another bar and choose FS, SS, FF, or SF in the popup.
- Drag column edges in the header to resize task fields.
- Drag the vertical divider between the task fields and the date timeline to give more room to the data side or the chart side.
- Drag date header edges to resize day cells, or use the View control as a backup.
- Use the View control to adjust row height.

## Latest UX polish

- Skinny task and date headers automatically rotate so labels stay readable instead of clipping.
