TimeAttendance V6.14.63
Historical Navigation Performance + Console Error Fix
=====================================================

ติดตั้ง
1) รัน SQL_ที่ต้องรัน_V6.14.63_HISTORY_PERFORMANCE_ERROR_FIX.sql ใน Supabase SQL Editor
2) รัน SQL_สำหรับตรวจสอบ_V6.14.63_HISTORY_PERFORMANCE_ERROR_FIX.sql และตรวจให้ทุกแถวเป็น PASS
3) Deploy ไฟล์ Frontend V6.14.63
4) กด Ctrl + Shift + R

จุดที่แก้
- Attendance Detail ใช้ ta_get_attendance_detail_v61463
- Dashboard ใช้ ta_get_dashboard_overview_v61463 และคำนวณ Scope แบบ set-based
- Manager Scope ถูก pre-filter ก่อนเข้า canonical Attendance reader
- เพิ่ม normalized employee/date indexes สำหรับ Attendance / Calculation / Shift / Time Logs
- ย้อนเดือนใน Attendance โหลดสูงสุด 2 date-chunks พร้อมกัน และ cache ผลสำเร็จ 60 วินาที
- Schedule shared reader cache 60 วินาที เพื่อให้ย้อน/กลับเดือนเดิมเร็วขึ้น
- v61110 punch metadata โหลดเฉพาะพนักงานที่เป็น special/multi-segment
- Calendar-only row ใน Attendance Detail ไม่เรียก v650/v640 จึงไม่เกิด ATTENDANCE_DAY_NOT_FOUND 400 ซ้ำ
- Cache ถูกล้างเมื่อมี Schedule/Certification/Rebuild mutation

คงเดิม
- Shift / Work Pattern / Night Sequence / Rest rule
- Late 1–29, >=30 Absence, Missing Punch, Early Leave
- Leave / Holiday / Day-off / OT / Waiting / Certification
- Raw time_logs ไม่ถูกแก้ไข
