Time-Clock Enterprise V6.14.48
Whole-System Consistency Audit

ติดตั้งตามลำดับ
1) Run: SQL_ที่ต้องรัน_V6.14.48_WHOLE_SYSTEM_CONSISTENCY.sql
2) Deploy frontend V6.14.48 ทั้งชุด
3) Browser Ctrl+F5
4) Run: SQL_สำหรับตรวจสอบ_V6.14.48_WHOLE_SYSTEM_CONSISTENCY.sql
5) Checks 1-20 ควร PASS (7/8 = CHECK ได้เฉพาะกรณีตั้งใจเปลี่ยนชั่วโมงมาตรฐาน 5D/6D)
6) Data counters 3 ค่า ควรเป็น 0

ถ้า expected_day_mismatch_rows > 0:
- ใช้เมนู Attendance Rebuild / ประมวลผลใหม่ ในช่วงวันที่ที่ SQL แสดง
- ไม่ต้องลบ time_logs และไม่ต้อง Import CSV ซ้ำ

จุดแก้หลัก
- expected_day ใช้ Work Pattern ไม่กลับไปใช้ PC
- ปฏิทินวันที่ไม่ใช้ UTC date conversion
- Quick Night Sequence ไม่มี ReferenceError
- Attendance Detail รับรองเวลาไม่มี ReferenceError
- Work Pattern standard minutes = scheduled - break
- Paired/generated day-off ถูกมองเป็น non-working สม่ำเสมอ

ส่วนอื่นคงเดิม
