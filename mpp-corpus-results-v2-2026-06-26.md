# MPP Internet Corpus V2 Result - 2026-06-26

Uploaded report: `mpp-internet-corpus-v2-report.json`

Summary:

- Corpus files: 10
- Parsed with non-zero task count: 6
- Opened-only, zero parsed tasks: 4
- Hard failures: 0
- Average compatibility score: 38%
- Total recovered task skeleton rows: 286
- Total assignments: 0

Per-file result:

| File | Status | Tasks | Skeleton rows | Named skeleton rows | Score |
| --- | ---: | ---: | ---: | ---: | ---: |
| NewProductDev.mpp | passed | 25 | 25 | 25 | 53% |
| Project2016.mpp | passed | 5 | 5 | 1 | 53% |
| Home move plan.mpp | passed | 171 | 171 | 171 | 53% |
| sample.mpp | passed | 22 | 22 | 0 | 53% |
| Calenar with exception.mpp | opened_only | 0 | 0 | 0 | 15% |
| New project 2013.mpp | opened_only | 0 | 0 | 0 | 15% |
| CalendarWorkWeeks.mpp | opened_only | 0 | 0 | 0 | 15% |
| WBSDefinition.mpp | passed | 1 | 1 | 1 | 53% |
| VbaProject3.mpp | opened_only | 0 | 0 | 0 | 15% |
| GroupDocs sample.mpp | passed | 62 | 62 | 62 | 53% |

Interpretation:

The task skeleton recovery layer worked. The parser moved from zero real task rows across the public corpus to 286 recovered native task rows across 6 of 10 files.

This is still low-confidence skeleton import, not full-fidelity MPP decoding. The recovered dates are placeholder/best-effort and assignments remain zero.

Next parser targets:

1. Decode the alternate task-table layout used by the 4 opened-only files.
2. Improve task name recovery for files where skeleton rows are found but names are missing, especially `sample.mpp`.
3. Decode real native start/finish/duration fields instead of placeholder sequential dates.
4. Use recovered task rows to improve native dependency/resource/assignment mapping.

Acceptance target for next pass:

- Opened-only count drops from 4 to 0 or at least lower than 4.
- `Project2016.mpp` reaches the expected 6-task target instead of 5.
- `sample.mpp` recovers useful task names instead of generic placeholders.
