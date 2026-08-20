Time-Clock Enterprise V6.14.11 — Time View Accuracy + OFF Label

Changes
- TIME VIEW and TEAM DAILY DETAIL use the same merged Attendance Detail + Punch Metadata + Time Certification source.
- Both use one Normalize/Classification function for NORMAL / ABSENCE / LATE / EARLY / OFF / LEAVE.
- TIME VIEW label adds หยุด (OFF) and only shows non-zero rows.
- TIME VIEW legend adds หยุด.
- No database migration required.

Deploy
1. Deploy this package over V6.14.10.
2. Ctrl + F5.
3. Open มุมมองเวลา and click the same team/day. Label counts should match TEAM DAILY DETAIL KPI counts.
