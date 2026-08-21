Time-Clock Enterprise V6.14.29
Monthly Personal = Canonical Full-Month Schedule

Frontend-only consistency release. No new SQL migration is required after V6.14.28 backend is installed.

Changes
1) MONTHLY PERSONAL OVERVIEW reads the exact same canonical V6.14.25 Schedule Grid as ตารางกะรายบุคคล • เต็มเดือน.
2) It runs the same Work Plan and Scheduling Rule enrichers as Full Month before rendering.
3) Attendance/Punch/Certification can enrich the popup but cannot overwrite canonical schedule fields.
4) "วันหยุดตามตาราง" counts canonical visible off/holiday schedule days; quota usage is shown separately from ta_get_dayoff_balance_v61425.
5) Before Start Date / After Resign Date now render as inactive periods, matching Full Month semantics.
6) Attendance status falls back to schedule Leave/Day-off when Attendance Detail is temporarily unavailable.

Deploy
- Deploy this ZIP frontend.
- Ctrl+F5.
- No SQL required.
