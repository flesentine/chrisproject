# Chris's Discount Project Maker — v0.21.0

This build cleans up the top command area into a Microsoft Project-inspired ribbon layout.

## What changed

- Added tabbed ribbon behavior: File, Task, Resource, Report, Project, View, Format, Help.
- Only the active ribbon tab's commands are shown, which removes the huge wall of buttons.
- Added real dropdown-style command menus for File import/export and Task dependency help.
- Moved project calendar settings into the Project tab.
- Moved zoom/layout controls into the View tab.
- Kept the core row/grid compact so deeper fields stay in Task Information.
- Kept all current working buttons wired: New, Load sample, Add Task, Add Resource, Task Info, Auto Schedule, Import XML, Convert MPP locally, Export XML, Export CSV, Gantt Chart, Resource Sheet, Indent, Outdent.
- Added soft messages for Report/Format commands that are on the roadmap instead of dead buttons.
- Updated version badge to `v0.21.0 · Clean Microsoft Project-style ribbon`.

## Install locally

```bash
cd ~/Documents/Code/chrisproject
unzip -o ~/Downloads/chris-discount-project-maker-clean-ribbon.zip -d .

git status
git add index.html styles.css app.js README.md chris-avatar.png mpp-native-reader.js mpp-local-converter.html
git commit -m "Clean up ribbon header and menus"
git push origin main
```

Then hard refresh the GitHub Pages site.
