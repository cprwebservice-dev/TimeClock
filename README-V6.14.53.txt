TimeAttendance V6.14.53 — Schedule Work-Mode Icon Colors

Frontend-only UX fix.
- กะปกติ+งานลูกค้าช่วงดึก -> ใช้ System Settings สี SPLIT
- กะเช้า+รอเข้ากะดึก -> ใช้ System Settings สี SPLIT
- กะนับชั่วโมง -> ใช้ System Settings สี HOUR
- Icon และ Active border ใน Popup จัดกะเปลี่ยนสีแบบ Live ตามการตั้งค่า
- Work Mode Admin cards และ Team split summary ใช้สีเดียวกันเพื่อความสอดคล้อง
- Normal / Day-off / Leave icon ใน popup ผูกกับ D / OFF / LV เช่นกัน
- ไม่มีการเปลี่ยน Backend / Attendance / Scheduling business rules
- ไม่ต้องรัน SQL
