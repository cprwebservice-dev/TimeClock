Time-Clock Enterprise V6.14.34
Night Sequence Guard — Night / Day-off Next Day

Business rule
- ถ้าวันก่อนหน้าเป็นกะดึก/กะที่ทำงานข้ามคืนในช่วงกลางคืน
- วันถัดไปอนุญาตเฉพาะ:
  1) กะดึก
  2) วันหยุดตามกะล่าสุด / HOL / กะ is_workday=false
- ไม่อนุญาต: กะเช้า/กะกลางวัน, กะเช้า+งานช่วงดึก, กะเช้า+รอเข้ากะดึก, ลา LV, ล้างกะแล้วกลับ Default กะเช้า
- กฎพักขั้นต่ำ 6 ชม., Warning >48 ชม., Day-off quota, Work Pattern, Scope, Start Date, System Period คงเดิม

Coverage
- Popup กำหนดกะทำงาน
- Monthly Personal Overview > จัดกะ
- Attendance Detail > แก้ไขกะ
- Schedule Person 15 วัน / เต็มเดือน
- Quick Action กะปกติ / กะดึก / วันหยุด / ลา
- Copy/Paste, Copy Month, Fill Down/Right, 7-Day Pattern, Previous Week, Undo/Redo
- Clear/Delete assignment

Install
1) รัน SQL_ที่ต้องรัน_V6.14.34_NIGHT_SEQUENCE_GUARD.sql
2) Deploy ZIP V6.14.34
3) Ctrl+F5
4) รัน SQL_สำหรับตรวจสอบ_V6.14.34_NIGHT_SEQUENCE_GUARD.sql
