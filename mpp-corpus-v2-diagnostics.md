# MPP Corpus V2 Diagnostics

Latest uploaded report summary:

- 10 files checked
- 7 files produced task rows
- 3 files produced zero task rows
- 0 hard failures
- 287 total recovered task rows
- 42 percent average score

Remaining zero-task files:

| File | FixedMeta | FixedData | VarMeta | Var2Data |
| --- | ---: | ---: | ---: | ---: |
| Calenar with exception.mpp | 204 | 254 | 96 | 110 |
| New project 2013.mpp | 204 | 250 | 120 | 114 |
| VbaProject3.mpp | 204 | 250 | 120 | 96 |

Conclusion:

The remaining zero-task files have very small task-table streams. They look more like metadata or special-purpose samples than normal schedules. The parser should not invent fake tasks just to improve the pass count.

Next parser work:

1. Decode real task dates and durations for the 287 recovered rows.
2. Decode resources and assignments, starting with NewProductDev.mpp.
3. Add corpus expectations so task-heavy files and metadata-only files are judged differently.
