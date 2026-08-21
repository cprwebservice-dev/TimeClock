Time-Clock Enterprise V6.14.24
Bulk Schedule HTTP 500 / Double Recalculation Fix

ปัญหาที่แก้
- Bulk Schedule ผ่าน ta_assign_shifts_bulk_v6143 -> ta_assign_shifts_bulk_v651
- V651 ทำ Attendance recalculation ภายใน transaction ของการเขียนกะ
- Frontend V6.14.15+ ทำ canonical finalizer หลัง Scheduling Rule sync อีกครั้ง
- Bulk ใหญ่จึงคำนวณซ้ำและเสี่ยง statement timeout / HTTP 500

แนวทาง V6.14.24
- Frontend เรียก ta_assign_shifts_bulk_v61424
- Writer ใหม่คง Day-off / Period / Permission / Start Date / Pattern guards
- Writer ใหม่ไม่คำนวณ Attendance ภายใน write transaction
- หลัง saveBulkExtensions สำเร็จ ใช้ ta_finalize_schedule_mutation_v61415 เป็น final calculation เดียว
- หาก SQL V6.14.24 ยังไม่ได้ติดตั้ง Frontend fallback ไป V6.14.3 เพื่อ backward compatibility

ติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.14.24_BULK_SCHEDULE_TIMEOUT_FIX.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.14.24_BULK_SCHEDULE_TIMEOUT_FIX.sql
3. ทุก Check ควร PASS
4. Deploy Web V6.14.24
5. Ctrl + F5

หมายเหตุ Console
- Monthly Personal dedicated RPC unavailable = warning + fallback ไม่ใช่สาเหตุของ Bulk 500
- "A listener indicated an asynchronous response..." โดยทั่วไปมาจาก Browser Extension ไม่ใช่ Time-Clock app
