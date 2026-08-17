Time-Clock Enterprise V6.11.47
Personal Monthly Schedule — Double Shift Codes

ปรับเฉพาะ ปฏิทินจัดกะ > มุมมองรายบุคคล

กรณีวันนั้นมี 2 กะ:
- Label ช่องวันเดียวกันแบ่งเป็น 2 บรรทัด
- บรรทัดบน = รหัสกะที่ 1
- บรรทัดล่าง = รหัสกะที่ 2
- ยกเลิกสัญลักษณ์เลข 2 แบบเดิม
- Hover Tooltip แสดงแยก กะที่ 1 / กะที่ 2 พร้อมเวลาเริ่ม–สิ้นสุด

การหารหัสกะที่ 2:
1) ใช้รหัสกะที่ 2 จาก Backend ถ้ามี
2) ถ้าไม่มี จะ Match ช่วงเวลางานลูกค้ากับ Shift Master
3) ถ้าเวลาไม่ตรง Shift Master จะใช้รหัสกะกลางคืนของ Pattern เดียวกัน
4) ถ้า Shift Master ไม่มีข้อมูลที่ใช้ระบุได้ จะแสดง S2 เป็น fallback

มุมมองทีม / การจัดกะ / Copy-Paste / Quick Shift / Attendance / Time Certification
คงเดิมทั้งหมด

ไม่ต้องรัน SQL
