Time-Clock Enterprise V6.14.0 — Shift Color Control Center

ฐาน: V6.13.9

ปรับเฉพาะ Frontend / UX:
1. Shift Colors ให้ตรงกับ Icon จริง 7 ประเภท: เช้า, ดึก, วันหยุด, ลา, นักขัต, นับชม., เช้า+ดึก
2. แยก Schedule Status Colors: ยืนยันแล้ว, ต้องตรวจสอบ, Selected, Hover
3. แยก Attendance Color: OT
4. Live Preview เปลี่ยนทันทีเมื่อเลือกสี
5. กะนับชั่วโมงและ Split Shift ใช้ค่าจาก Settings แทน hard-coded CSS
6. Selected / Hover / Confirmed / Review ของตารางรายบุคคลเต็มเดือนใช้ค่าจาก Settings
7. ไม่เปลี่ยน Shift Code, Work Pattern, OFF Mapping หรือ Business Logic

ไม่ต้องรัน SQL เพิ่ม
