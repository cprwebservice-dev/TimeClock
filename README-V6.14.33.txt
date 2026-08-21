Time-Clock Enterprise V6.14.33

Frontend-only UX adjustment.

ปุ่มลัดเดิม OFF เปลี่ยนข้อความเป็น:
- วันหยุด
- ตามกะล่าสุด

Logic เดิมคงไว้ทั้งหมด:
- data-quick-shift = OFF
- STD  -> OSTD
- S043 -> OS043
- S134 -> OS134
- S135 -> OS135
- Day-off quota guard / System Period / Work Pattern / 6h / 48h ยังคงเดิม
- ใช้ร่วมกันทั้งตารางรายบุคคล 15 วัน และเต็มเดือน

ไม่ต้องรัน SQL เพิ่ม
