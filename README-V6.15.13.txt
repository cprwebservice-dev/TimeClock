TimeClock Enterprise V6.15.13
Request & Employee Portal Synchronization Revision

Backend
- Per-employee revision counters:
  data_revision
  request_revision
  notification_revision
- Data revision is bumped by Schedule, Attendance, Certification,
  Schedule Rule and Partial Leave changes.
- Request revision is bumped by Employee Request changes.
- Notification revision is bumped by Employee Portal notification changes.
- Manager Request Center has a lightweight global request revision.
- Revision tables are not directly exposed to clients.

Employee Portal
- Polls ONE lightweight sync RPC every 20 seconds only while page is visible.
- Also checks immediately on focus / returning to the browser.
- Reloads only modules whose revision changed.
- Manager approval can automatically refresh:
  Home / My Schedule / Attendance / Requests / Notifications.
- If the Time tab is not open, expensive Attendance range is not reloaded.
- Small Live status pill shows Ready / Updating / Offline.
- Manual Refresh remains available.

Manager Request Center
- Polls lightweight request revision every 20 seconds only when
  Request Center is the active page.
- New employee request / cancel / status change refreshes the table silently.
- No full-screen loading overlay during automatic refresh.
- Small Auto Sync status pill shows current state.

Deploy order
1) Run V6.15.12a if not already completed.
2) Run SQL V6.15.13.
3) Run verification SQL.
4) Deploy all files in this package.
5) Hard refresh Manager Web and reopen Employee Portal once.

Portal cache: V6.15.13a
