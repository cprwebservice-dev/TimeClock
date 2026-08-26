TimeClock Enterprise V6.14.92
Login / Request Action Hotfix

Root cause
- V6.14.91 introduced await inside the Request Center document click handler.
- The callback was not async, causing app.js to fail JavaScript parsing.
- Therefore app boot(), Supabase getSession(), automatic login, and manual Login submit never executed.

Fix
- Request Center click callback is now async.
- JavaScript syntax validated before packaging.
- Supabase automatic session restore works as before.
- Manual login works again.
- Keeps V6.14.91 Day-off Swap, Leave Request, Time Certification and Special Work changes.

SQL
- No new SQL required if V6.14.91 SQL was already run.
