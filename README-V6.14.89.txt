TimeClock Enterprise V6.14.89
Employee Portal Calendar Range + Cache Fix

Root cause
- Backend calendar RPC intentionally allows a maximum of 63 days per call.
- Portal UI previously created one continuous date range from today +/- days
  through the month currently opened in the calendar.
- Browsing a month far enough from today could make that one request exceed
  63 days, producing HTTP 400 / PORTAL_DATE_RANGE_MAX_63_DAYS.
- portal.html and the Service Worker were also still pinned to V6.14.82 cache
  keys, making Portal frontend updates easy to remain stale on mobile devices.

Fix
- Load today's/home-time range (-31 to +14 days) separately from the selected month.
- Merge the returned calendar rows by work_date in the browser.
- Every RPC request stays below the 63-day backend guard.
- Updated Portal JS/CSS cache-busting to V6.14.89.
- Rotated Service Worker cache to timeattendance-portal-v61489a.
- No Attendance, Shift, PIN, Manager Scope, Activation, or backend logic changed.

No SQL required.
