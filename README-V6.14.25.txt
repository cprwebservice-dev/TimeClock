Time-Clock Enterprise V6.14.25
Day-off Calculation Consistency

สิ่งที่ปรับ
1. วันหยุดประจำสัปดาห์ของทุกตำแหน่งอ้างอิง Work Pattern ที่กำหนดให้พนักงาน
   - ไม่บังคับผู้จัดการแผนกจาก Position/PC
   - ไม่ใช้ individual weekly-off override เดิม
2. Day-off quota ใช้ weekly_off_dows จาก Work Pattern เดียวกับตารางกะ
3. วันหยุดคู่ใช้กะทำงานล่าสุดย้อนหลังสูงสุด 60 วัน ข้ามเดือน
   - ข้ามกะวันหยุด / LV / HOL / วันนักขัตฤกษ์
   - ถ้าไม่พบ ใช้ Default Shift ของ Work Pattern
4. Mapping หลักคงเดิม
   STD -> OSTD
   S043 -> OS043
   S134 -> OS134
   S135 -> OS135
5. Person 15D / Person Full Month / Team / Time / Monthly Personal ใช้ Schedule Grid กลาง V6.14.25
6. Popup / Bulk / Fill / Paste / Pattern / Copy Week ใช้ Day-off Basis กลาง V6.14.25
7. ลบ Browser fallback ที่คำนวณวันหยุดจาก PC 4/5 ซึ่งไม่ตรงกับ Config-driven Work Pattern
8. นักขัตฤกษ์ยังเป็น HOL อัตโนมัติ
9. LV/LEAVE ไม่หัก Day-off quota
10. OFF เดิมต้องยัง Disabled

ติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.14.25_DAYOFF_CALCULATION_CONSISTENCY.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.14.25_DAYOFF_CALCULATION_CONSISTENCY.sql
3. ตรวจ checks ให้ PASS และตรวจค่า weekly_off_dows / paired mapping
4. Deploy Web V6.14.25
5. Ctrl + F5

หมายเหตุ
- Migration นี้จำเป็น เพราะแก้ Day-off resolver / quota / Schedule Grid ที่ Database
- ไม่ต้องรัน Attendance Rebuild เพียงเพื่อให้ Schedule แสดงวันหยุดใหม่
- ถ้าต้องการให้ผล Attendance ย้อนหลังถูกคำนวณใหม่ตาม Work Pattern ที่แก้ย้อนหลัง ให้ใช้ Rebuild Attendance เฉพาะช่วงที่ได้รับผลกระทบ
