Time-Clock Enterprise V6.11.54
Certification Canonical Shift Match / False STALE Fix

สาเหตุที่ตรวจพบ
- ตอนบันทึกรับรอง ระบบสร้าง Shift Snapshot จาก ta_get_schedule_range_v61024
- แต่ Logic ตรวจ STALE เดิมบางจุดไปเทียบกับ attendance_workday
  และบางจุดเทียบ shift_calendar + shift_master โดยตรง
- ตารางเหล่านี้อาจมี representation ต่างจาก effective schedule
  แม้กะที่มีผลจริงไม่ได้เปลี่ยน จึงเกิด false STALE

V6.11.54
1. ใช้ ta_get_schedule_range_v61024 เป็น Canonical Source จุดเดียว
   สำหรับตรวจว่ากะเปลี่ยนจริงหรือไม่
2. เทียบรหัสกะ + เวลาเริ่ม + เวลาสิ้นสุด
3. เวลา normalize ระดับนาที ป้องกัน seconds ทำให้ mismatch
4. แก้ Trigger shift_calendar:
   - INSERT/UPDATE/DELETE จะไม่ทำ STALE ถ้ากะที่มีผลจริงยังเหมือนเดิม
   - แก้ Note/Confirm โดยกะไม่เปลี่ยน ไม่ทำ STALE
5. แก้ Attendance Recalculation:
   - ไม่ใช้ attendance_workday.shift_code/start/end ตัดสิน STALE
6. Logic 2 กะ / รับรองเฉพาะกะที่ 1 คงเดิม
7. SQL จะซ่อม FALSE STALE เดิมให้อัตโนมัติ:
   - ถ้าปัจจุบันกะตรงกับ Snapshot -> STALE กลับเป็น CERTIFIED
   - Recalculate Attendance ใหม่ด้วย Certification เดิม
8. กรณีกะเปลี่ยนจริง ยังแสดง "ต้องรับรองใหม่" ตามเดิม

ติดตั้ง:
1) รัน SQL ที่ต้องรัน V6.11.54
2) รัน SQL สำหรับตรวจสอบ -> PASS 10 รายการ
3) Deploy ZIP
4) Ctrl + Shift + R
