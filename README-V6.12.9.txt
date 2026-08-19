Time-Clock Enterprise V6.12.9
Lightweight Schedule Grid

สาเหตุที่แก้
- ปฏิทินจัดกะหลักยังเรียก ta_get_schedule_range_v61024
- RPC เดิม Join Attendance Calculation / Comp-off และข้อมูลอื่นที่ไม่จำเป็นต่อการวาด Grid รอบแรก
- เมื่อ Scope มีพนักงานจำนวนมาก แม้ Frontend แบ่ง Batch แล้ว PostgreSQL ยังสามารถชน statement timeout ได้

การแก้ไข
1. เพิ่ม ta_get_schedule_range_light_v6129 สำหรับ Base Schedule Grid
2. คง User Scope ผ่าน _ta_schedule_access_days_v61025
3. ไม่ Join attendance_workday / ta_attendance_calculations / ta_comp_off_credits
4. Work Plan / Scheduling Rules / Manager metadata เติมภายหลังแบบ Deferred เหมือนเดิม
5. ลด Concurrent Schedule Request จาก 5 เหลือ 3
6. PERSON batch 28 คน / TEAM จำกัดประมาณ 840 วัน-พนักงานต่อ Request
7. Merge Employee metadata จาก Filter/Scope cache ที่โหลดอยู่แล้ว
8. แก้ Version + Browser cache key ให้เป็น V6.12.9 จริงทั้ง index.html/app.js/app.css

ติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.12.9_LIGHTWEIGHT_SCHEDULE_GRID.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.12.9_LIGHTWEIGHT_SCHEDULE_GRID.sql
3. Deploy ไฟล์ V6.12.9
4. Ctrl + F5
5. ปฏิทินจัดกะ > โหลดตารางกะ
