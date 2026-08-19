Time-Clock Enterprise V6.12.5
Schedule Consistency + Calendar Performance
วันที่ปรับ: 19/08/2026

ปรับจาก V6.12.4 โดยคง Business Rule เดิม

1) Popup กำหนดกะทำงาน
- ช่อง “กะทำงาน” แสดงเฉพาะ Shift Master ที่ is_workday=true
- OSTD / OS043 / OS134 / OS135 และกะวันหยุดอื่นไม่แสดงในช่องนี้
- วันหยุดต้องเลือกผ่าน “วันหยุดตามกะล่าสุด” แล้วระบบ Resolve จาก Mapping

2) Save Shift Error
- Sync applicable_pattern_codes ของกะวันหยุดให้ตรงกับกะทำงานคู่กัน
- เนื่องจาก Backend ta_assign_shift_*_v651 ตรวจ Work Pattern ของ Shift Code ทุกตัว
- Mapping จะ Sync เวลา + Work Pattern ของ OFF ให้ตรงกับ Work Shift

3) ทุกทางการจัดกะใช้ Shift Set Up เดียวกัน
- Popup รายบุคคล
- Smart กะปกติ / กะดึก
- วันหยุด
- Fill Down / Fill Right
- Copy / Paste
- คัดลอกสัปดาห์ก่อน
- รูปแบบกะ 7 วัน
- Context Menu
- Undo / Redo
- Team Drawer / Employee Month Calendar (ผ่าน Popup เดียวกัน)

4) Calendar Performance
- Filter options cache 30 วินาที
- Main schedule batch 32 คน / concurrent 5
- Work Plan batch 32 คน / concurrent 5
- Scheduling Rule enrichment แบ่ง batch 120 / concurrent 4
- แสดง Base Calendar ก่อน แล้วค่อยเติม Work Plan / Scheduling Rule / Manager metadata ด้านหลัง
- รายทีมไม่รอ Manager metadata ก่อนแสดงตาราง
- Save 1 ช่องจาก Calendar ไม่ Reload ตารางทั้ง Scope ถ้าไม่จำเป็น
- เพิ่ม Index (emp_code, work_date) สำหรับ ta_schedule_rule_assignments

SQL
- รัน SQL_ที่ต้องรัน_V6.12.5_SCHEDULE_CONSISTENCY_PERFORMANCE.sql หลัง V6.12.4
- จากนั้นรัน SQL_สำหรับตรวจสอบ_V6.12.5_SCHEDULE_CONSISTENCY_PERFORMANCE.sql
