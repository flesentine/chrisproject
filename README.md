# Chris's Discount Project Maker

A lightweight Microsoft Project XML-compatible planner with a browser-only local MPP decoder for the Microsoft Project table-cache layout found in modern `.mpp` files.

## What it does

- Create and edit task schedules
- Show a compact Microsoft Project-style Entry sheet with Gantt bars on the same rows
- Drag task bars to move dates
- Resize durations from the bar edges
- Connect tasks with hover-reveal pull strings
- Support FS, SS, FF, and SF dependency links
- Support dependency lag and lead, such as `1FS+2d` or `2SS-4h`
- Detect dependency loops before scheduling
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
   - `TBkndTask/FixedMeta` / `FixedData`
   - `TBkndTask/Fixed2Meta` / `Fixed2Data` for the visible task order
   - `TBkndTask/VarMeta` / `Var2Data` for names and display fields
   - `TBkndCons/FixedData` for dependency links
5. Converts recovered tasks, dates, FS/SS/FF/SF links, summary rows, and outline levels into Project XML and imports it.
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
- Perfect outline reconstruction for every private MPP variant
- Resource pools
- Assignment units/costs
- Baselines
- Complex constraints
- Time-of-day accurate partial-day lag; lag/lead is stored in minutes but displayed on a day-granularity Gantt
- Calendars beyond a simple 8-hour day
- Critical path calculation


## Summary task behavior

The app now supports project nesting:

- Summary tasks have a collapse/expand caret.
- Child rows hide when the parent is collapsed.
- Summary start, finish, duration, and percent complete roll up from child tasks.
- Imported Project XML preserves `<Summary>`, `<Expanded>`, and `<OutlineLevel>` fields.
- Native `.mpp` decoding now uses the MPP task-order table where available, then infers outline groups from summary rows.


## Field width display improvement

The task-name, predecessor, date, percent, and outline-level editors now expand to fill their resized columns. The task-name column also has a much higher maximum width, so widening the column actually shows more of long imported MPP task names instead of leaving a small input floating inside a big cell.

## Predecessor and successor columns

- **Pred** means predecessors: tasks that must happen before the current row. Example: `3FS` means this task starts after task 3 finishes.
- **Succ** means successors: tasks that depend on the current row. This column is calculated automatically from the Pred column on other rows, so it is read-only.
- Empty dependency fields now show `none` instead of the old confusing `connect` placeholder.


## Dependency engine v2

The Pred column now understands Microsoft Project-style relationship syntax:

```text
1FS
1FS+2d
2SS-4h
3FF+1w
4SF-1d
1FS+2d, 2SS
```

Supported relationship types:

- `FS` = finish-to-start
- `SS` = start-to-start
- `FF` = finish-to-finish
- `SF` = start-to-finish

Supported lag/lead units:

- `m` minutes
- `h` hours
- `d` working days
- `w` working weeks

Positive values are lag. Negative values are lead. Auto Schedule and cascade scheduling both honor lag/lead and still use the project calendar, so weekends and holidays are skipped. The successor column is calculated from the predecessor links and includes lag/lead too.

## Compact Entry view and Task Information dialog

Version `v0.17.0` makes the main grid closer to Microsoft Project's default Entry/Gantt Chart pattern: keep the common schedule fields visible and move the less-common fields into Task Information.

The visible row now focuses on:

- ID
- Indicators
- WBS
- Task Name
- Duration
- Start
- Finish
- Percent complete
- Predecessors
- Details / delete actions

The row no longer burns space on Successors, Constraint, Constraint Date, Deadline, and Outline Level. Those still exist, but they live in **Task Information**.

Open Task Information by selecting a row and clicking **Task info**, clicking the row's **Info** button, clicking the indicator cell, or double-clicking a task row. The dialog now uses Project-like tabs:

- General: name, start, finish, duration, percent complete, milestone
- Predecessors: editable predecessors and read-only calculated successors
- Advanced: constraint type, constraint date, and deadline
- Notes: task notes
- Structure: WBS, outline level, parent task, and summary/rollup status

Summary tasks keep their rollup fields read-only in the dialog. Their start, finish, duration, and percent complete still come from their child tasks.

Task notes still round-trip through Project XML using `<Notes>` when present.
