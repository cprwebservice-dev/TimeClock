Time-Clock Enterprise V6.12.3
Shift Department Scope + Paired Day-off Shift

ปรับจาก V6.12.2 โดยคง Performance และ Scheduling Rules เดิม

เพิ่ม:
1) Set Up กะทำงานรายหน่วยงาน
   - แต่ละ Shift Code เลือก ทุกหน่วยงาน / เฉพาะหน่วยงานที่เลือก
   - หน้า Calendar ช่องกะทำงานจะแสดงเฉพาะกะที่หน่วยงานนั้นใช้งานได้
   - Bulk/Fill/Paste ตรวจ Scope ก่อนบันทึก

2) Set Up จับคู่กะทำงาน -> กะวันหยุด
   ค่าเริ่มต้น:
   STD  -> OSTD
   S043 -> OS043
   S134 -> OS134
   S135 -> OS135

3) เมื่อเลือก “วันหยุด”
   - ระบบดู “กะทำงานล่าสุดก่อนหน้า”
   - เลือก Shift Code วันหยุดที่จับคู่ไว้ให้อัตโนมัติ
   - ตรวจว่ากะวันหยุดเป็น is_workday=false และเวลาเริ่ม/สิ้นสุดตรงกับกะทำงาน
   - ถ้ายังไม่ได้จับคู่ จะไม่ให้บันทึกและแจ้งให้ HR Admin ไป Set Up

4) กะพิเศษ Hour Based / Split Wait Night
   - ยังคง Dynamic OFF เพื่อรักษา Logic V6.12.0 เดิม

ติดตั้ง:
1. ต้องมี SQL V6.12.0 Scheduling Rules เดิมก่อน
2. รัน SQL_ที่ต้องรัน_V6.12.3_SHIFT_SCOPE_OFF_MAPPING.sql
3. ใช้ SQL_สำหรับตรวจสอบ_V6.12.3_SHIFT_SCOPE_OFF_MAPPING.sql เพื่อตรวจผล
4. Deploy ไฟล์เว็บ V6.12.3 และ Ctrl+F5
