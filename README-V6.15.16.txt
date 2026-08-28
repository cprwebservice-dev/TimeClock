TimeClock Enterprise V6.15.16
4B.1 — Employee Portal Day-off / Swap Day-off Robust Picker

Baseline
- Built directly on V6.15.15 End-to-End Consistency Audit.
- All V6.15.15 Manager -> Backend -> Employee Portal consistency protections remain intact.

4B.1 changes
- Day-off month title renders immediately; no permanent “-” while data is loading.
- Calendar and day-off quota RPCs load independently with Promise.allSettled().
- Calendar failure no longer blanks the entire popup.
- If the same month already exists in Portal schedule cache, it can be shown as read-only fallback.
- Fallback/error data cannot be submitted until the authoritative calendar reload succeeds.
- Add Day-off is disabled when quota cannot be verified.
- Swap Day-off can still be reviewed when only quota loading fails.
- Skeleton loading state, retry action, warning state, and empty state added.
- PH, Leave, missing-schedule, closed/locked/finalized period, and can_swap=false rows are not selectable.
- Client-side validation is repeated immediately before submit; Backend remains authoritative.
- Swap flow remains two-step: select existing day-off -> select replacement workday.

Cache
- Portal cache: V6.15.16a

Database
- No new SQL is required for this 4B.1 frontend hardening.
- Existing V6.15.15 SQL and RPCs remain the baseline.
