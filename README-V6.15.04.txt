TimeClock Enterprise V6.15.04
Employee Portal Attendance Transaction Hotfix

Root cause
- ta_portal_get_my_attendance_range_v61503 was STABLE.
- It calls _ta_portal_session_emp_v61482.
- That session helper is VOLATILE and UPDATEs ta_employee_portal_sessions_v61482.last_seen_at.
- PostgREST executes STABLE RPCs in read-only transactions, causing:
  cannot execute UPDATE in a read-only transaction

Fix
- SQL changes ta_portal_get_my_attendance_range_v61503 to VOLATILE.
- Existing Shift 1 / Shift 2 attendance logic is unchanged.
- Frontend no longer leaves the Attendance tab on an endless spinner when RPC fails.
- A clear error card + retry button is shown instead.
- Cache bumped to V6.15.04a.
