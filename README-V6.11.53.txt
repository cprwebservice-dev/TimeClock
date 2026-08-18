Time-Clock Enterprise V6.11.53
Monthly Holiday + Live Shift Colors

1) MONTHLY PERSONAL OVERVIEW — วันหยุดนักขัตฤกษ์
- เพิ่มรายการวันหยุดนักขัตฤกษ์ใต้ปฏิทินด้านซ้าย
- แสดง วันที่ / ชื่อวันหยุด / วันในสัปดาห์
- ใช้สี HOL ที่กำหนดใน System Settings
- ถ้าเดือนไม่มีวันหยุด จะแสดงข้อความแจ้งแทน

2) ตัวเลขวันที่ใน Label
- ขยายเลขวันที่จากประมาณ 27px เป็น 34px
- วันทำงาน: พื้นฟ้าอ่อน
- วันหยุด/OFF: ใช้สี OFF จาก System Settings
- วันหยุดนักขัตฤกษ์: ใช้สี HOL แบบเด่น
- วันนี้: มี Outline เพิ่มเพื่อสังเกตง่าย
- รองรับ Dark Mode

3) System Settings > Shift Colors
สาเหตุเดิม:
- Settings บันทึก CSS Variable --shift-d/--shift-n/... แล้ว
- แต่ตารางกะใช้สี Hard-coded ใน .shift-visual-day/night/off/holiday
  จึงเปลี่ยนค่าใน Settings แล้วหน้าตารางไม่เปลี่ยน

V6.11.53:
- เชื่อม Shift Colors เข้ากับตารางกะจริงแล้ว
- D = กะกลางวัน
- N = กะกลางคืน
- OFF = วันหยุด
- HOL = วันหยุดนักขัตฤกษ์
- LV = ลา
- CSS สร้าง Soft background / Border จากสีที่เลือกอัตโนมัติ
- มีผลทันทีหลังบันทึก Settings โดยไม่ต้องโหลดข้อมูลใหม่
- ใช้กับตารางกะรายบุคคล, Monthly Personal Overview และ Chip สรุปรายทีม
- Dark Mode ใช้สีที่เลือกเช่นกันแต่ปรับความเข้มให้อ่านง่าย

ส่วนอื่นคงเดิม
ไม่ต้องรัน SQL
