# MPXJ Bridge

This folder is the first true-MPP ingest pivot for the MS Project App.

The browser app stays static and keeps the existing Gantt, schedule engine, resource sheet, audit score, and browser fallback reader. This local helper reads native `.mpp` files with MPXJ and returns normalized JSON to the browser.

## Why this exists

The in-browser reader is valuable as a fallback and diagnostic tool, but it is not the right primary path for high-fidelity Microsoft Project compatibility. MPXJ already understands native MPP versions and gives us semantic schedule data: tasks, resources, assignments, dependencies, calendars, progress, baselines, and presentation metadata.

## Requirements

- Java 17+
- Maven 3.9+

## Run as a local bridge server

From the repo root:

```bash
cd mpp-bridge
mvn -q package
java -jar target/mpp-bridge-0.1.0.jar server 3908
```

The browser app will try:

```text
http://127.0.0.1:3908/health
http://127.0.0.1:3908/convert-mpp
```

When the bridge is running, dragging an `.mpp` into the app should use the MPXJ path first. If the bridge is not running, the app falls back to the existing browser-only importer.

## Run as a CLI converter

```bash
cd mpp-bridge
mvn -q package
java -jar target/mpp-bridge-0.1.0.jar input.mpp output.json
```

## Output contract

The bridge returns JSON shaped like:

```json
{
  "ok": true,
  "engine": "mpxj",
  "bridgeVersion": "0.1.0",
  "sourceFile": "project.mpp",
  "project": {
    "name": "Project name",
    "start": "2026-06-29",
    "tasks": [],
    "resources": [],
    "assignments": [],
    "calendars": [],
    "diagnostics": {}
  }
}
```

## Current goal

First acceptance test with the airline schedule file:

- import through `Engine: MPXJ Bridge`
- recover tasks/resources at least as well as the browser fallback
- recover dependencies and assignments above zero
- avoid fake 1984/2079 browser-decoded dates
- raise compatibility score from the browser fallback score toward 70+

## What stays from the old work

The existing browser MPP reader remains useful for:

- static-site fallback
- OLE stream inventory
- diagnostics/audits
- compatibility scoring
- comparing MPXJ output to our old reverse-engineered guesses
