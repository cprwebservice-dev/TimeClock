Time-Clock Enterprise V6.11.36 — Monthly Attendance Rebuild

แก้เฉพาะ MONTHLY PERSONAL OVERVIEW > ปุ่ม “ประมวลผลเดือนนี้”

ปัญหาเดิม
- ปุ่มประมวลผลคำนวณเฉพาะวันที่มี attendance_workday อยู่แล้ว
- วันที่ย้อนหลังที่ไม่มี IN/OUT อาจไม่มี attendance_workday
- จึงยังคงแสดง “ยังไม่ประมวลผล”

V6.11.36
1) ตรวจสิทธิ์พนักงานตามเดิม
2) Rebuild attendance_workday ของพนักงานเฉพาะเดือนที่เลือก
3) ประมวลผล Attendance ต่อทันที
4) Reload Monthly Personal Overview
5) วันอนาคตไม่สร้าง Attendance และยังคง “รอทำงาน”
6) วันทำงานย้อนหลังที่ไม่มีเวลาเข้า/ออก จะเข้าสู่กติกา Attendance เดิม
   เช่น ขาดงาน / สาย / กลับก่อน ตามผลคำนวณ

การติดตั้ง
1) รัน SQL_ที่ต้องรัน_V6.11.36_MONTHLY_ATTENDANCE_REBUILD.sql
2) รัน SQL_สำหรับตรวจสอบ_V6.11.36_MONTHLY_ATTENDANCE_REBUILD.sql
   ผลควร PASS ทุกข้อ
3) Deploy frontend ใน ZIP
4) Ctrl + Shift + R

ส่วนอื่นคงเดิมจาก V6.11.35
