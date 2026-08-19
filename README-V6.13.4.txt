V6.13.4 - Default Paired Day-off Integration

หลักการ:
- ไม่ใช้รหัส OFF เป็นกะวันหยุด Default อีกต่อไป
- วันหยุดประจำสัปดาห์ใช้ Mapping จาก Shift Set Up
  STD -> OSTD
  S043 -> OS043
  S134 -> OS134
  S135 -> OS135
- Mapping เป็น Set Up และ HR Admin เปลี่ยนภายหลังได้
- ปฏิทินหลัก / รายบุคคลเต็มเดือน / Monthly Personal ใช้แหล่งเดียวกัน
- Popup วันหยุด / Bulk / Fill / Paste / รูปแบบ 7 วัน ใช้ resolver เดียวกัน
- กะนับชั่วโมงใช้กะวันหยุด Dynamic แบบ System Generated แทน OFF
- Quota นับวันหยุด Default ว่าใช้สิทธิ์ เว้นแต่วันนั้นถูกกำหนดเป็นกะทำงาน

ติดตั้ง:
1. รัน SQL_ที่ต้องรัน_V6.13.4_DEFAULT_PAIRED_DAYOFF.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.13.4_DEFAULT_PAIRED_DAYOFF.sql
3. Deploy Web V6.13.4
4. Ctrl + F5
