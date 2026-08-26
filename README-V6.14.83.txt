TimeClock Enterprise V6.14.83
Employee Portal Search Render Hotfix

Root cause
- Backend search was working correctly.
- The KPI cards used admin.rows and therefore showed the correct result count.
- The table renderer incorrectly switched to admin.filtered whenever the search/status input was non-empty.
- admin.filtered is empty after server-side search, so the table displayed 0 rows even though the RPC returned data.

Fix
- HR Employee Portal table now renders the server-filtered admin.rows result directly.
- Search by Employee ID, name, position, department, area, PC, and Portal status now displays matching employees correctly.
- No backend logic, Portal permissions, PIN, Activation, Manager Scope, or Attendance logic changed.

No SQL required.
