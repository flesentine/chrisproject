# ProjectXML Planner

A lightweight Microsoft Project XML-compatible web app. It runs fully in the browser and can be hosted on GitHub Pages, Netlify, Vercel, S3, or any static web host.

## What it does

- Create and edit task schedules
- Show a polished Gantt preview
- Track start, finish, duration, percent complete, WBS, outline level, and finish-to-start predecessors
- Import Microsoft Project XML / MSPDI files
- Export Microsoft Project XML / MSPDI files that can be opened by Microsoft Project Desktop
- Export CSV for quick review
- Save automatically in browser localStorage

## UX direction

This version uses a research-informed productivity-app UI:

- Light neutral canvas for readability in dense schedule data
- Microsoft Project-inspired green for export/status context
- Blue reserved for the main creation action and timeline bars
- Semantic colors used only for status, warnings, and destructive actions
- Card grouping, spacing, and proximity to show relationships without visual clutter
- Sentence-case labels and a clearer type ramp for scannability
- Stronger focus states and contrast-aware foreground/background pairs

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
3. Click **Export XML**.
4. Open the downloaded `.xml` file in Microsoft Project Desktop.
5. Save it from Microsoft Project as `.mpp` if needed.
6. Optionally export back to XML from Microsoft Project and import it into this app.

## Known limitations

This MVP intentionally keeps the model small. It does not yet support:

- Resource pools
- Assignment units/costs
- Baselines
- Constraints
- Calendars beyond a simple 8-hour day
- Critical path calculation
- Native `.mpp` import/export
