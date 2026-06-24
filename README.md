# Chris's Discount Project Maker — v0.36.0

Static Microsoft Project-inspired planner that runs on GitHub Pages.

## v0.36.0 changes

- Adds the Costs build: Fixed Cost and Cost columns appear in the task grid next to progress.
- Keeps resource Standard Rate, Overtime Rate, and Cost/Use editable in the Resource Sheet and uses assignments to calculate resource rate cost and cost-per-use cost.
- Adds a Task Information → Costs tab with Fixed Cost, Resource Rate Cost, Cost Per Use, Total Task Cost, Baseline Cost, and Cost Variance.
- Rolls summary task cost up from child tasks, while still allowing each task to carry its own fixed cost.
- Updates baseline cost and cost variance to use total task cost, not only assignment cost.
- Exports/imports Project XML cost fields including FixedCost, FixedCostAccrual, task Cost, resource rates, assignment Cost, and baseline Cost.
- CSV export now includes task cost, resource cost, assignment cost, baseline cost, and cost variance records.
- Acceptance path: create a work resource with a standard rate, add Cost/Use, assign it to a task, enter Fixed Cost, then confirm task Cost updates and the parent summary rolls up the child cost.

## Use

Open `index.html` locally or host the folder on GitHub Pages. Use the restored MS Project-style schedule grid for real planning, dependency links, predecessor/successor columns, baselines, progress, actuals, resources, costs, XML import/export, and CSV export. Use Task, Project, Resource, View, and Gantt Chart Format tabs for the fuller MS Project-style command surface.
