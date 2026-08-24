TimeAttendance V6.14.49 — Work Time / Waiting / OT Rules

ฐาน: V6.14.48 Whole-System Consistency

กฎหลัก
- WAITING = ช่วง OUT กะ 1 -> IN กะ 2 (ถ้ามี Punch ครบ), fallback เป็นช่วงตามแผน และไม่นับเป็นเวลาทำงาน/OT
- ชั่วโมงสุทธิ Split = เวลาทำงานจริงกะ 1 + กะ 2 - พักมาตรฐาน 1 ครั้ง
- NORMAL: OT หลังเวลาสิ้นสุดกะ
- NORMAL_LATE_CUSTOMER: เวลาทำงานจริงกะ 2 เป็น OT ตั้งแต่เวลาเริ่มกะ 2
- SPLIT_WAIT_NIGHT: OT = ชั่วโมงสุทธิรวมที่เกิน standard_work_minutes ต่อวัน
- HOUR_BASED: OT หลังเวลาสิ้นสุดกะที่ระบบคำนวณ

ติดตั้ง
1) รัน SQL_ที่ต้องรัน_V6.14.49_WORKTIME_WAITING_OT_RULES.sql
2) Deploy ไฟล์ Frontend ชุด V6.14.49
3) Ctrl+F5
4) รัน SQL_สำหรับตรวจสอบ_V6.14.49_WORKTIME_WAITING_OT_RULES.sql
5) หาก stale_metric_rows > 0 ให้ประมวลผล Attendance/Rebuild ช่วงวันที่ดังกล่าว หรือใช้ ta_refresh_worktime_metrics_v61449 ในสิทธิ์ HR Admin

ส่วนอื่นคงเดิม: Late/Absent/Early Leave, Night Sequence, 6h rest, 48h warning, Day-off quota, Work Pattern, System Period, Permission, Certification.
