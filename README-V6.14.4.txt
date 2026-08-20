Time-Clock Enterprise V6.14.4 — Schedule Save Performance

สิ่งที่แก้
1. ตัด Double Attendance Recalculation ตอนบันทึกกะ + Work Plan
2. ใช้ RPC ta_assign_shift_with_work_plan_v6144: Shift -> Work Plan -> Recalculate 1 ครั้ง
3. เพิ่ม Hot-path indexes สำหรับ Attendance / Shift Calendar / Shift Master
4. กะปกติไม่ยิง Scheduling Rule RPC เพิ่มโดยไม่จำเป็น
5. หลัง Save สำเร็จ ปล่อย Blocking Overlay ก่อน Optional Enrichment / Return-flow refresh
6. Console แสดง [Schedule Save V6.14.4] พร้อม rpcMs และ server performance breakdown

การติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.14.4_SCHEDULE_SAVE_PERFORMANCE.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.14.4_SCHEDULE_SAVE_PERFORMANCE.sql
3. Deploy ไฟล์ V6.14.4
4. Ctrl + F5

Business Rules เดิมทั้งหมดคงไว้ รวม Day-off Quota V6.14.3 และ Attendance Recalculation
