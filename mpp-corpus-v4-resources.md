# MPP Corpus Native Resource Result

Latest uploaded report version: `0.4.0-browser-only-mpp-corpus-resources`

Summary:

- Corpus files: 10
- Files with recovered task rows: 7
- Opened-only files: 3
- Hard failures: 0
- Total recovered task rows: 287
- Fixed-row task date hints applied: 286
- Total native resource rows recovered: 87
- Total named native resources recovered: 65
- Assignments: 0

Resource recovery by file:

| File | Tasks | Final resources | Resource rows | Named resources |
| --- | ---: | ---: | ---: | ---: |
| NewProductDev.mpp | 25 | 2 | 2 | 1 |
| Project2016.mpp | 5 | 5 | 5 | 5 |
| Home move plan.mpp | 171 | 2 | 2 | 0 |
| sample.mpp | 22 | 2 | 2 | 0 |
| CalendarWorkWeeks.mpp | 1 | 2 | 2 | 0 |
| WBSDefinition.mpp | 1 | 2 | 2 | 0 |
| GroupDocs sample.mpp | 62 | 66 | 66 | 59 |

Interpretation:

The browser-only parser now recovers resource table rows from native MPP files and injects them into generated Project XML. Resource name recovery is strongest on `Project2016.mpp` and `GroupDocs sample.mpp`, and partial on `NewProductDev.mpp`.

Current browser-only baseline:

- 287 recovered native task rows.
- 286 recovered fixed-row task date hints.
- 87 recovered native resource rows.
- 65 named native resources.
- 0 assignments surfaced in the final corpus report.

Next parser target:

Native assignment table recovery and task-resource linking.

Recommended next acceptance target:

- `NewProductDev.mpp` should report non-zero assignment rows.
- Assignment rows should link to recovered task rows and recovered resource rows when confidence is high.
- Corpus should expose assignmentRows, assignmentTaskLinks, assignmentResourceLinks, and assignmentsApplied.
