TimeClock Enterprise V6.14.82
Employee Portal Foundation

Scope
- Keeps existing HR_ADMIN / MANAGER / VIEWER account model unchanged.
- Adds a separate Employee Portal account model for technicians/users without Email.
- HR Admin can bulk-enable/disable Employee Portal directly from Employee Master with no PC restriction.
- HR quick action can select the technician group by position text.
- Manager gets a new "สมาชิกทีม / Portal" page.
- Manager can create/rotate one Team Link/QR, generate one-time Activation Code per employee, and Reset PIN.
- Activation Code is 6 digits, unique per employee issuance, valid for 7 days, stored as bcrypt hash only.
- Employee sets a private 6-digit PIN; Manager/HR never sees the PIN.
- PIN rejects common/easy values and the last 6 digits of Employee ID.
- Five failed PIN attempts lock the account for 15 minutes.
- Successful login creates an opaque 256-bit portal session valid for 90 days.
- Team QR/Link is not a credential. First activation additionally validates that the employee is currently in that Manager's canonical team scope.
- Employee Portal is mobile-first and installable as a web app shell (manifest + service worker).
- Employee can view own schedule/time and submit V6.14.81 Time Issue / Special Work notices.
- Employee cannot edit Raw Punch or Attendance directly.
- Manager continues handling Time Issue via Time Certification and Special Work via the existing Schedule workflow.

Files
- index.html / app.js / app.css : Manager + HR management UI
- portal.html / portal.js / portal.css : Employee Portal
- portal-manifest.webmanifest / portal-sw.js : installable web app shell
- SQL_ที่ต้องรัน_V6.14.82_EMPLOYEE_PORTAL_FOUNDATION.sql
- SQL_สำหรับตรวจสอบ_V6.14.82_EMPLOYEE_PORTAL_FOUNDATION.sql

Deployment order
1. V6.14.81 must already be installed.
2. Run V6.14.82 migration SQL.
3. Run V6.14.82 verification SQL.
4. Deploy all files in this package to the same static hosting location.
5. Hard refresh the Manager/HR web app.

No Supabase Auth user/email is created for Employee Portal users.
