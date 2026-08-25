TimeAttendance V6.14.62 — Attendance Full-Month Detail + UX Refresh

Changes
1. Tab รายละเอียดเวลาทำงาน now merges Canonical Schedule Calendar with persisted Attendance.
2. Dates without punches are retained, so a selected full month shows every applicable employee/day.
3. Current-month default is first day through last day of month (not only through today).
4. Past planned workdays without punches continue through the existing canonical absence policy.
5. Future planned workdays display as UPCOMING / รอทำงาน.
6. Leave / weekly off / public holiday rows remain visible.
7. Added month quick navigation and refreshed filters, KPI cards, table accents, row-status cues, hover and dark-mode polish.
8. Existing Attendance calculations, Shift rules, Leave, Day-off, OT, Waiting, Certification and backend SQL are unchanged.

Deploy all files, then Ctrl+Shift+R.
No SQL migration required for V6.14.62.
