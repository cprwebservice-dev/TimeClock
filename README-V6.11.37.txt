Time-Clock Enterprise V6.11.37 — Attendance Pipeline

ปรับ Tab “ประมวลผล Attendance” ให้ใช้แนวคิดเดียวกับ Monthly Personal Overview

Pipeline ต่อ Task:
1) Rebuild Attendance Workday
2) Calculate Attendance
3) Validate Result
4) Mark COMPLETED เมื่อครบทั้ง 3 ขั้นตอน

จุดสำคัญ
- ไม่พึ่ง Trigger อย่างเดียวอีกต่อไป: เรียก Calculation แบบ Explicit หลัง Rebuild
- ถ้า Calculation/Validation ผิดพลาด Task จะไม่ถูกนับว่าสำเร็จ
- Auto Split เดิมยังทำงาน
- Error Log เพิ่มชื่อ Stage ที่พัง: REBUILD / CALCULATE / VALIDATE
- CSV Import ที่เลือก “ประมวลผล Attendance หลังนำเข้า” ใช้ Worker RPC เดียวกัน จึงได้ Pipeline ใหม่นี้ด้วย
- Monthly Personal Overview V6.11.36 คงเดิม
- ส่วนอื่นคงเดิม

การติดตั้ง
1) รัน SQL_ที่ต้องรัน_V6.11.37_ATTENDANCE_PIPELINE.sql
2) รัน SQL_สำหรับตรวจสอบ_V6.11.37_ATTENDANCE_PIPELINE.sql
   ผลควร PASS ทั้ง 7 รายการ
3) Deploy frontend ใน ZIP
4) Ctrl + Shift + R
