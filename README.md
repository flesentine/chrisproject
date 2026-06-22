# Chris's Discount Project Maker

A lightweight Microsoft Project XML-compatible scheduling app that runs as a simple static website. It is designed for GitHub Pages: no backend, no accounts, no upload, no build system.

## What it does

- Edit task data and Gantt bars on the same row
- Drag task bars to move dates
- Drag task edges to change duration
- Reveal dependency pull strings on hover
- Link tasks as FS, SS, FF, or SF
- Review downstream changes before moving linked tasks
- Resize columns, date cells, and the data/chart splitter by dragging
- Import Microsoft Project XML / MSPDI files
- Export Microsoft Project XML / MSPDI files that can be opened by Microsoft Project Desktop
- Export CSV
- Save automatically in browser localStorage

## Great static-site MPP workflow

Native `.mpp` parsing is not implemented in the hosted static website. Instead, the app has a polished **MPP → Project XML guide**:

1. Click **Open MPP guide** or drag an `.mpp` file onto the page.
2. The app explains the safest conversion path.
3. Open the `.mpp` file in Microsoft Project Desktop.
4. Save/export it as Project XML / XML Data.
5. Drag the `.xml` file back into this app or click **Import XML**.

That gives you the reliable compatibility path while keeping the website simple enough to host on GitHub Pages.

## Why XML instead of direct MPP?

Project XML / MSPDI is the professional static-web target because it is text-based and round-trippable in the browser. Native `.mpp` is a private binary project format and full-fidelity parsing requires a real converter library or backend. This app keeps the website honest and dependable instead of pretending a partial browser-only parser is full MPP support.

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

## How to publish on GitHub Pages

Push these files to your repository, then enable:

```text
Settings → Pages → Deploy from branch → main → /root
```

## How to test with Microsoft Project

1. Open this app.
2. Click **Load sample**.
3. Click **Export XML**.
4. Open the downloaded `.xml` file in Microsoft Project Desktop.
5. Save it from Microsoft Project as `.mpp` if needed.
6. Optionally export back to XML from Microsoft Project and import it into this app.

## Known limitations

This MVP intentionally keeps the model focused. It does not yet support:

- Resource pools
- Assignment units/costs
- Baselines
- Complex calendars
- Constraint types beyond simple date editing
- Full critical path calculation
- Native `.mpp` import/export in the static hosted website
