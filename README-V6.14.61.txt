TimeAttendance V6.14.61
MONTHLY PERSONAL OVERVIEW — fmtDate ReferenceError Hotfix

สิ่งที่แก้
1) แก้ ReferenceError: fmtDate is not defined ใน MONTHLY PERSONAL OVERVIEW
   - employeeMonthPunchDateLabelV61460
   - Calendar multi-punch aria-label
2) ใช้ formatDate() ซึ่งอยู่ใน scope เดียวกับ Monthly Personal module แทน fmtDate() ที่เป็น local helper ของ module อื่น
3) Logic Raw Punch / Multi-Punch / Schedule / Attendance / Work Pattern / Day-off / Night Sequence ไม่เปลี่ยน
4) ปรับ cache key เป็น 6.14.61-20260825a เพื่อบังคับ browser โหลด app.js ใหม่

หมายเหตุ
- HTTP 500 ของ ta_get_attendance_shift_punch_meta_v61110 เป็น backend RPC คนละประเด็นกับ ReferenceError นี้
- Monthly Personal ออกแบบให้ punch-meta เป็น enrichment; calendar ยังควร render ได้แม้ enrichment RPC นี้ error
- ถ้า 500 ยังเกิดหลัง deploy V6.14.61 ให้ตรวจ Supabase Function/Logs ของ ta_get_attendance_shift_punch_meta_v61110 เพิ่มเติม
