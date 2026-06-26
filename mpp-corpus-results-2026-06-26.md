# MPP Internet Corpus Result - 2026-06-26

Uploaded report: `mpp-internet-corpus-report.json`

Summary:

- Corpus files: 10
- Files fetched/opened without throwing: 10
- Hard failures: 0
- Average compatibility score: 15%
- Parsed tasks: 0 across all 10 files
- Parsed resources: 0 across all 10 files
- Parsed assignments: 0 across all 10 files

Interpretation:

The current native reader can open the OLE/CFB compound-file container for these real public Microsoft Project files, but it is not yet decoding the native private task/resource/assignment tables for this corpus.

This should not be treated as true MPP compatibility. It is only container-level compatibility.

Next parser target:

1. Decode native task fixed/variable table rows for MPP12/14/15-style files.
2. Extract task IDs, UIDs, names, start, finish, duration, percent complete, and outline level.
3. Produce non-zero task counts in the corpus report.
4. Only then continue with resources, assignments, calendars, baselines, and actuals.

Acceptance target:

- `Project2016.mpp` imports at least the 6 tasks referenced by the Aspose test suite.
- `Home move plan.mpp` imports a large non-zero task count.
- The corpus runner reports `passed` only when task count is greater than zero.
