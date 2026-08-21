Time-Clock Enterprise V6.14.32
Popup Schedule Guard Proposal Cache Fix

แก้ไข:
- Popup กำหนดกะทำงานไม่ใช้ผลตรวจพักขั้นต่ำจากกะที่เคยเลือกก่อนหน้า
- เมื่อเปลี่ยนกะ / รูปแบบ / เวลา ระบบยกเลิก Guard cache เดิมและตรวจ proposal ใหม่
- กะดึก -> กะดึก: ใช้เวลาเริ่มกะดึกจริงในการตรวจ 6 ชั่วโมง
- กะดึก -> ลา / วันหยุด: ไม่ใช้กฎพักขั้นต่ำ 6 ชั่วโมงเป็นตัว Block
- กะดึก -> กะเช้า: ยังคง Block เมื่อพัก < 6 ชั่วโมง
- Quick Action 15 วัน / เต็มเดือนใช้ current candidate ต่อรายการและไม่ใช้ Popup cache

Backend:
- ไม่ต้องรัน SQL เพิ่ม
- ใช้ ta_validate_schedule_guard_v6141 เดิมเป็น authoritative guard
