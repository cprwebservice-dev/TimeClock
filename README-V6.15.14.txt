TimeClock Enterprise V6.15.14 — Employee Portal Performance Hotfix

Root causes fixed
1) Same-shift team V6.15.09 sent all active technicians to the canonical Manager Resolver.
   With ~1,500 technicians this could exceed statement_timeout.
2) Attendance Portal V6.15.03 called _ta_work_mode_punch_meta_v61449 once per day.
   A 32-day range repeated the punch/segment resolver many times.
3) Portal startup V6.15.13 loaded Attendance + Same-shift Team + Calendar + Requests + Notifications concurrently.
   showApp() also triggered Same-shift Team once before refreshAll(), causing duplicate concurrent requests.

V6.15.14
- Same-shift Team resolves only the current employee's Manager once, then narrows candidates directly.
- Candidate team capped at 100 employees as a safety guard.
- Attendance uses the canonical batch punch resolver once per range.
- Added normalized employee/date indexes.
- Portal startup no longer preloads Attendance.
- Attendance loads only when the user opens the Time tab.
- Same-shift Team and Attendance are single-flight: duplicate concurrent calls are suppressed.
- Live Sync starts after the initial Portal hydration/baseline is complete.

Portal cache: V6.15.14a
