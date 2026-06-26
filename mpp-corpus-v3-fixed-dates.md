# MPP Corpus Fixed-Row Task Date Result

Latest uploaded report version: `0.3.1-browser-only-mpp-corpus`

Summary:

- Corpus files: 10
- Files with recovered task rows: 7
- Opened-only files: 3
- Hard failures: 0
- Total recovered task rows: 287
- Variable task date hints applied: 265
- Fixed-row task date hints applied: 286
- Assignments: 0

Fixed-row task date coverage:

| File | Tasks | Var dates applied | Fixed dates applied | Fixed date confidence |
| --- | ---: | ---: | ---: | --- |
| NewProductDev.mpp | 25 | 25 | 25 | medium |
| Project2016.mpp | 5 | 5 | 5 | medium |
| Home move plan.mpp | 171 | 171 | 171 | medium |
| sample.mpp | 22 | 0 | 22 | medium |
| CalendarWorkWeeks.mpp | 1 | 1 | 0 | none |
| WBSDefinition.mpp | 1 | 1 | 1 | medium |
| GroupDocs sample.mpp | 62 | 62 | 62 | medium |

Interpretation:

The browser-only parser now recovers task skeleton rows and applies native date hints for almost every recovered row. This is a major improvement over placeholder sequential dates.

Current baseline:

- 287 recovered native task rows.
- 286 recovered fixed-row date hints.
- 265 recovered variable-field date hints.
- 0 resource rows surfaced in the final corpus report.
- 0 assignment rows surfaced in the final corpus report.

Next parser target:

Native resource table decoding, then assignment table decoding.

Recommended next acceptance target:

- `NewProductDev.mpp` should report non-zero resources.
- `NewProductDev.mpp` should then report non-zero assignments.
- Corpus should expose resourceRows, resourceNamesApplied, assignmentRows, and assignmentsApplied.
