TimeClock Enterprise V6.14.93
Request Center Completion + Portal Request UI State Fix

Root cause
1. Request Center bind() called TimeClockCalendarV61448.dateKey(), but that helper does not exist.
   bind() stopped at that line, so Search / Time Certification / Special Work / decision buttons were never attached.
2. boot() could load Request Center before its +31 day default was initialized, hiding advance requests.
3. Employee Portal fillSubtype() still treated every non-SPECIAL_WORK request as TIME_ISSUE,
   so Day-off Swap / Leave displayed stale Time Issue fields.
4. Special-work data names sent by Portal differed from the Manager schedule-prefill field names.

Fix
- Default end date now uses addDays(today,31).
- Direct Request Center load is refreshed once after defaults are installed.
- Search, Time Certification, Special Work, Day-off Swap, Leave, Reject, Cancel, Export handlers verified.
- Portal has separate UI/evidence for all four request types.
- Switching request type resets hidden fields and previous values.
- Leave partial-time fields appear only for PARTIAL_DAY.
- Special Work prefill accepts Portal reported_start_time / reported_end_time / customer_location.

SQL
- No new SQL required if V6.14.91 SQL has already been run.
