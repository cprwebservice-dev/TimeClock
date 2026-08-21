Time-Clock Enterprise V6.14.27
Monthly Personal Timeout Scope Fix
=================================

สิ่งที่แก้
1) แก้ ReferenceError: withTimeout is not defined ใน MONTHLY PERSONAL OVERVIEW
   - V6.14.26 เรียก withTimeout จาก app-core แต่ helper ชื่อนี้อยู่ภายใน IIFE อื่น
     (shift-api / system-period) จึงมองไม่เห็นจาก Monthly Personal scope
   - V6.14.27 เพิ่ม employeeMonthWithTimeoutV61427() ใน scope ของ Monthly Personal โดยตรง

2) จุดที่ใช้ helper ใหม่
   - ta_get_employee_month_schedule_v6134 (Dedicated Monthly Personal RPC)
   - ta_get_dayoff_balance_v61425 (Canonical Day-off quota)

3) ผลที่คาดหวัง
   - เปิด MONTHLY PERSONAL OVERVIEW ได้ตามปกติ
   - Dedicated RPC จะถูกเรียกจริง ไม่เกิด fallback เพราะ ReferenceError
   - Label วันหยุดยังอิง used_days จาก ta_get_dayoff_balance_v61425 ตาม V6.14.26
   - หาก Dedicated RPC มีปัญหาจริง ระบบยัง fallback ไป canonical V6.14.25 Schedule Grid ได้

การติดตั้ง
- ไม่ต้องรัน SQL เพิ่ม
- Deploy Web V6.14.27 ชุดนี้ทั้งชุด
- Ctrl + F5 / Hard Refresh

ตรวจสอบหลัง Deploy
- Console ต้องไม่พบ: ReferenceError: withTimeout is not defined
- เปิด MONTHLY PERSONAL OVERVIEW พนักงาน/เดือนเดิมได้
- ตรวจ Label วันหยุด เทียบกับโควต้าวันหยุดใน Popup จัดกะ
