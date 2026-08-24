TimeAttendance V6.14.47 — Off-day Punch Ownership / Cross-midnight Attendance Consistency

แก้ปัญหา:
- OUT ของกะข้ามคืนวันก่อนหน้า ถูก fallback เป็น IN ของวันหยุดวันถัดไป
- Paired day-off shift เช่น OSTD/OS043/OS134/OS135 มีเวลาใน Shift Master จึงถูก Frontend ตีความเป็นกะทำงานและแสดงขาดงานผิด

หลักการใหม่:
- วันทำงาน: คง fallback ในช่วงเวลากะเพื่อรองรับข้อมูล Punch ที่ Mode ไม่สมบูรณ์
- วันหยุด/non-working shift: รับเวลาเข้า/ออกเฉพาะ Punch ที่มี Mode IN/OUT จริง
- Paired OFF / generated day-off ถูกจัดเป็น non-working แม้มี start/end time
- ใช้ resolver เดียวกันใน Attendance UI / Monthly Personal / Team / Person Schedule

ติดตั้ง:
1) รัน SQL_ที่ต้องรัน_V6.14.47_OFFDAY_PUNCH_OWNERSHIP.sql
2) Deploy ไฟล์ Frontend ชุด V6.14.47
3) Ctrl+F5
4) รัน SQL_สำหรับตรวจสอบ_V6.14.47_OFFDAY_PUNCH_OWNERSHIP.sql

ไม่แก้ time_logs ดิบ และไม่เปลี่ยนกฎ Late/Absent/OT/Day-off quota/Night Sequence
