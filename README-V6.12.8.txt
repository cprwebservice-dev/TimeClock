Time-Clock Enterprise V6.12.8
Monthly Personal Overview - Lightweight Schedule RPC

สาเหตุที่แก้
- Monthly Personal Overview V6.12.7 ยังใช้ ta_get_schedule_range_v61024 ผ่าน fallback schedule API
- RPC ดังกล่าวออกแบบสำหรับปฏิทินหลักและรวม Attendance Calculation / Comp-off / Scope Matrix
- แม้แบ่ง 14 วัน ก็ยังเกิด 500 Internal Server Error ได้
- index.html ของ V6.12.7 ยังอ้าง cache key app.js V6.12.6 ทำให้ Browser/CDN อาจใช้ JS เก่า

V6.12.8
1. เพิ่ม ta_get_employee_month_schedule_v6128 สำหรับพนักงาน 1 คน/ช่วงเดือน
2. ไม่เรียก ta_get_schedule_range_v61024 ในเส้นทาง Monthly Personal เมื่อ RPC ใหม่ติดตั้งแล้ว
3. ยังคง User Scope ผ่าน ta_get_schedule_work_plan_meta_v6126
4. คืน Work Pattern / Work Plan / Shift / Holiday / Scheduling Rules เท่าที่หน้าปฏิทินใช้
5. ไม่ join Attendance Calculation และ Comp-off ใน Schedule RPC
6. Attendance enrichment ยังใช้ adaptive split 14 -> 7 -> 4 -> 2 -> 1 วัน
7. Cache key ของ app.js/app.css อัปเป็น 6.12.8-20260819

ติดตั้ง
1. ต้องติดตั้ง SQL V6.12.6 มาก่อน
2. รัน SQL_ที่ต้องรัน_V6.12.8_MONTHLY_PERSONAL_LIGHTWEIGHT.sql
3. รัน SQL_สำหรับตรวจสอบ_V6.12.8_MONTHLY_PERSONAL_LIGHTWEIGHT.sql และผลควร PASS ทั้งหมด
4. Deploy ไฟล์ Web V6.12.8
5. Ctrl + F5
6. ตรวจ Console: การเปิด Monthly Personal Overview ต้องเห็น request ta_get_employee_month_schedule_v6128 และไม่ควรยิง ta_get_schedule_range_v61024 จากหน้าต่างนี้

หมายเหตุ
- ปฏิทินจัดกะหลักยังคงใช้ ta_get_schedule_range_v61024 ตามเดิม เพราะต้องใช้ข้อมูลชุดเต็ม
- การแก้รอบนี้จำกัดเฉพาะ Monthly Personal Overview และ Cache Version
