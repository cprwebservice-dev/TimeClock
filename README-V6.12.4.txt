Time-Clock Enterprise V6.12.4
Day-off Shift Time + OFF Mapping Fix

ปรับจาก V6.12.3 โดยคง Business Rule และ Performance เดิม

แก้ไขหลัก
1. กะวันหยุดใน Shift Master บันทึกเวลาเริ่ม / เวลาสิ้นสุดได้จริง
2. กะวันหยุดต้องมีเวลาเพื่อรองรับการจับคู่กับกะทำงาน
3. เมื่อบันทึก Set Up กะทำงาน → กะวันหยุด และกะวันหยุดเป็น OFF ถูกประเภทแต่เวลายังไม่ตรง
   ระบบจะ Sync เวลา OFF ให้ตรงกับกะทำงานอัตโนมัติ
4. SQL Migration ซิงก์คู่มาตรฐาน 4 คู่ให้อัตโนมัติ
   STD  -> OSTD
   S043 -> OS043
   S134 -> OS134
   S135 -> OS135
5. กะวันหยุดตั้ง break_minutes = 0 และ is_workday = false
6. กะข้ามวันตั้ง is_night_shift ให้อัตโนมัติตามเวลา
7. หากแก้เวลา STD/S043/S134/S135 ภายหลัง กะวันหยุดที่ Mapping ไว้จะ Sync เวลาใหม่ให้อัตโนมัติ

วิธีติดตั้งจาก V6.12.3
1. รัน SQL_ที่ต้องรัน_V6.12.4_DAYOFF_SHIFT_TIME_FIX.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.12.4_DAYOFF_SHIFT_TIME_FIX.sql เพื่อตรวจผล
3. Deploy ไฟล์เว็บ V6.12.4
4. กด Ctrl+F5 หนึ่งครั้ง
