Time-Clock Enterprise V6.11.20

Attendance Punch Status Consistency Fix

- Team Daily Detail: complete IN/OUT punch pairs override stale ABSENCE status.
- Supports cross-midnight night shifts and SPLIT_FLEX segment punch pairs.
- Attendance Detail recomputes absence/status after punch-meta enrichment.
- Attendance status filter runs after punch enrichment for correct results.
- Export/UI share the corrected attendance status/absence logic.
- Team Daily total IN/OUT now falls back to segment punches.

No additional SQL required.
Deploy frontend and hard refresh (Ctrl+Shift+R).
