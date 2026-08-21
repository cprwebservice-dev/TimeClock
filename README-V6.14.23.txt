Time-Clock Enterprise V6.14.23
Work Pattern Bulk Permission / Select-All Consistency Fix

แก้ไข
1. หน้า รูปแบบการทำงานช่างเทคนิค แยก VIEW scope กับ EDIT_SCHEDULE scope ให้ถูกต้อง
2. เลือกทั้งหมด จะเลือกเฉพาะพนักงานที่ผู้ใช้มีสิทธิ์แก้ไขจริง
3. ถ้ามีพนักงานที่ดูได้อย่างเดียว ระบบแจ้งจำนวนและไม่ส่งเข้า Bulk Save
4. ก่อน Bulk Save ตรวจสิทธิ์ซ้ำอีกครั้ง ป้องกัน SCHEDULE_EDIT_PERMISSION_DENIED จากรายการปะปน
5. HR_ADMIN จัด Work Pattern ได้ทุกพนักงานใน Employee Master โดยไม่อิง Manager Scope
6. MANAGER ยังคงจำกัดตาม can_edit_schedule
7. Monthly Baseline และ System Period Guard คงเดิมจาก V6.14.19
8. UX V6.14.22 เรื่อง Icon กุญแจ 15 วัน/เต็มเดือนคงเดิม

ติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.14.23_WORK_PATTERN_BULK_PERMISSION_FIX.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.14.23_WORK_PATTERN_BULK_PERMISSION_FIX.sql
3. Deploy Web V6.14.23
4. Ctrl + F5

หมายเหตุ
- ถ้า Manager เห็นพนักงานจาก can_view แต่ไม่มี can_edit_schedule ระบบจะไม่เลือกคนนั้นใน Select All
- ถ้าต้องการให้ Manager แก้ไขพนักงานดังกล่าว ต้องแก้ Manager Scope ให้ can_edit_schedule=true
