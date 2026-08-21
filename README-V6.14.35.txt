Time-Clock Enterprise V6.14.35
Bidirectional Night Sequence Guard

Business Rule
- กะดึกต้องไม่มีกะเช้า/กลางวันอยู่วันก่อนหน้า
- วันถัดจากกะดึกต้องเป็นกะดึก หรือวันหยุดจริงเท่านั้น
- ลา LV ไม่ถือเป็นวันหยุดสำหรับวันถัดจากกะดึก
- Night -> Night ยังคงต้องผ่านพักขั้นต่ำ 6 ชั่วโมง

ครอบคลุม
- Popup กำหนดกะทำงาน
- ตารางกะรายบุคคล 15 วัน / เต็มเดือน
- ปุ่มลัด กะปกติ / กะกลางคืน / วันหยุด / ลา
- Copy / Paste / Copy Month
- Fill Down / Fill Right
- รูปแบบ 7 วัน / คัดลอกสัปดาห์ก่อน
- Undo / Redo / Clear
- จุดจัดกะที่ใช้ Assignment Popup จาก Monthly Personal / Attendance / Team

ติดตั้ง
1) รัน SQL_ที่ต้องรัน_V6.14.35_NIGHT_SEQUENCE_GUARD.sql
2) Deploy ZIP V6.14.35
3) Ctrl + F5
4) รัน SQL_สำหรับตรวจสอบ_V6.14.35_NIGHT_SEQUENCE_GUARD.sql
5) Checks 1-8 ต้อง PASS
6) Current-state audit ด้านล่างควรได้ 0 แถว หากมีแถว ระบบจะแสดงกะเดิมที่ผิดกฎเพื่อให้แก้ไข

หมายเหตุ
- SQL V6.14.35 จำเป็น เพราะ Frontend อย่างเดียวไม่เพียงพอสำหรับทุกช่องทางเขียนกะ
- ส่วนอื่นคงเดิม
