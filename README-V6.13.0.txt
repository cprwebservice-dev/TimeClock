Time-Clock Enterprise V6.13.0 — Schedule Integration Fix

แก้ไข:
1) Monthly Personal Overview ใช้ RPC V6.13.0 ที่ไม่พึ่ง Work Plan RPC chain เดิม และมี Lightweight fallback
2) Smart OFF ตรวจ “กะทำงานล่าสุดก่อนหน้า” รวมกะอัตโนมัติ/default ที่ไม่ได้มีแถวใน shift_calendar
3) กะดึกสัมพันธ์ Shift Master + Work Pattern + Department Scope และแก้ empty applicable_pattern_codes ไม่ให้ซ่อนกะทั้งหมด
4) Schedule Grid V6.13.0 ส่ง start_date/resign_date โดยตรง ทำให้ตารางรายบุคคลเต็มเดือนแสดงวันเริ่มงาน
5) Bulk Smart OFF ใช้ resolver V6.13.0 เช่นเดียวกับ Popup รายบุคคล

ติดตั้ง:
- ต้องมี SQL V6.12.0–V6.12.9 ตามลำดับที่เคยติดตั้งแล้ว
- รัน SQL_ที่ต้องรัน_V6.13.0_SCHEDULE_INTEGRATION_FIX.sql
- รัน SQL_สำหรับตรวจสอบ_V6.13.0_SCHEDULE_INTEGRATION_FIX.sql
- Deploy ไฟล์เว็บ V6.13.0 และ Ctrl+F5
