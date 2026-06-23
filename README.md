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
5. Probes additional Project table-cache streams learned from the MPXJ stress files:
   - `TBkndRsc` resources
   - `TBkndAssn` assignments
   - `TBkndCal` calendars
   - `TBkndOutlCode` outline codes
6. Detects MPXJ-style stress profiles such as task fields, relations, baselines, split tasks, resources, and assignments.
7. Converts recovered tasks, dates, percent complete, duration hints, cost hints, and FS/SS/FF/SF links into Project XML and imports it.
8. If that table-cache decode is not available, falls back to recovered text / draft XML.
9. Lets you download diagnostics, recovered text, or converted XML.

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
- Full assignment units/cost import, although assignment rows are now probed in diagnostics
- Full baseline import, although baseline stress files are now recognized
- Complex constraints, although constraint/date/cost/duration hints are recovered when visible
- Calendars beyond a simple 8-hour day, although calendar stream presence is now reported
- Critical path calculation


## MPXJ stress files this decoder is now aware of

The reader has built-in feature probes for these public MPXJ test files:

- `mpp14task.mpp` — task field-map coverage
- `mpp14relations.mpp` — predecessor/dependency coverage
- `mpp14baseline.mpp` — baseline/actuals/hierarchy coverage
- `mpp14splittask.mpp` — split task coverage
- `mpp14resource.mpp` — resource/assignment/outline-code coverage
- `mpp14assignmentcustom.mpp` — assignment custom/baseline fields
- `mpp14assignmentfields.mpp` — assignment field coverage

These probes do not magically make the app MPXJ, but they make failures more useful: diagnostics now show which table-cache families were found and what values were recovered.
