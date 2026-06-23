# Chris's Discount Project Maker

A lightweight Microsoft Project XML-compatible planner with a browser-only local MPP decoder for the Microsoft Project table-cache layout found in modern `.mpp` files.

## What it does

- Create and edit task schedules
- Show a polished unified Gantt/grid like a lightweight Microsoft Project sheet
- Drag task bars to move dates
- Resize durations from the bar edges
- Connect tasks with hover-reveal pull strings
- Support FS, SS, FF, and SF dependency links
- Review downstream cascade changes before moving linked tasks
- Import/export Microsoft Project XML / MSPDI
- Export CSV
- Save automatically in browser localStorage
- Try to read `.mpp` files locally in the browser without upload or backend

## Local web MPP converter

The `Convert MPP locally` button reads `.mpp` bytes directly in the browser. Nothing is uploaded.

The converter does the best practical static-web approach:

1. Reads the native OLE/compound-file container used by many `.mpp` files.
2. Searches internal streams for embedded Microsoft Project XML / MSPDI.
3. If XML is found, imports the schedule directly.
4. If no XML is found, tries a real native table-cache decode:
   - `TBkndTask/VarMeta`
   - `TBkndTask/Var2Data`
   - `TBkndCons/FixedData`
5. Converts recovered tasks, dates, and FS/SS/FF/SF links into Project XML and imports it.
6. If that table-cache decode is not available, falls back to recovered text / draft XML.
7. Lets you download diagnostics, recovered text, or converted XML.

## Honest limitation

This is still not full Microsoft Project native `.mpp` parity. It now decodes the table-cache layout in the uploaded Panasonic-style Project 16 `.mpp` file and similar files, but `.mpp` has multiple private binary layouts. MPXJ remains the proven open-source reader for broad `.mpp` compatibility, but it is Java-based and normally needs a local app or backend.

So the reliable interchange format remains:

```text
Microsoft Project XML / MSPDI
```

## How to run locally

You can open `index.html` directly in a browser. You can also open `mpp-local-converter.html` as a standalone local converter page.

For a cleaner local server:

```bash
cd chrisproject
python3 -m http.server 5173
```

Then open:

```text
http://localhost:5173
```

No Node, Java, backend, or upload is required for the static app.

## How to test with Microsoft Project

1. Open this app.
2. Click **Load sample**.
3. Click **Export XML**.
4. Open the downloaded `.xml` file in Microsoft Project Desktop.
5. Save it from Microsoft Project as `.mpp` if needed.
6. Optionally export back to XML from Microsoft Project and import it into this app.

## Known limitations

This MVP intentionally keeps the model small. It does not yet fully support:

- Native `.mpp` parity for every file
- Resource pools
- Assignment units/costs
- Baselines
- Complex constraints
- Calendars beyond a simple 8-hour day
- Critical path calculation

## Native MPP reader improvement notes

This version adds what we learned from the MPXJ `mpp14task.mpp` field-coverage sample:

- Parses Project display dates like `23/08/06 08:00`, `29/08/06 17:00`, and weekday-prefixed dates such as `Tue 07/02/06`.
- Uses weekday text, when available, to disambiguate `DD/MM/YY` vs `MM/DD/YY`.
- Recovers percent-complete values such as `45%` from native task table values.
- Recovers simple duration hints such as `5d`, `5 days`, `1 week`, and `40h`.
- Recovers cost-looking values for diagnostics when present.
- Reports native field coverage in the MPP import banner and diagnostics.

This is still browser-only best-effort MPP decoding. Project XML remains the reliable interchange format, but the native table decoder is now better on task-field-heavy MPP files.
