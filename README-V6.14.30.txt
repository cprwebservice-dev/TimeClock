Time-Clock Enterprise V6.14.30
Mixed 5D / 6D Smart Quick Shift

ปัญหาที่แก้
- ตารางกะรายบุคคล • 15 วัน / เต็มเดือน มีพนักงาน TECH_5D และ TECH_6D อยู่พร้อมกัน
- เมื่อเลือกหลายช่องแล้วกดปุ่มลัด กะปกติ / กะกลางคืน ระบบอาจส่งรหัสกะที่ไม่ตรง Work Pattern ของพนักงานบางคน
- Backend จึงคืน SHIFT_NOT_APPLICABLE_TO_WORK_PATTERN

กติกาปุ่มลัดใหม่
- TECH_5D + กะปกติ -> STD
- TECH_5D + กะกลางคืน -> S134
- TECH_6D + กะปกติ -> S043
- TECH_6D + กะกลางคืน -> S135
- ระบบ Resolve ต่อ "พนักงาน/วัน" ไม่ใช้รหัสเดียวครอบทั้ง Selection

ใช้กับทั้ง
- ตารางกะรายบุคคล • 15 วัน
- ตารางกะรายบุคคล • เต็มเดือน
เพราะทั้งสองโหมดใช้ Schedule Pro selection / quick-action pipeline ชุดเดียวกัน

ติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.14.30_MIXED_PATTERN_QUICK_SHIFT.sql
2. Deploy frontend V6.14.30
3. Ctrl + F5
4. รัน SQL_สำหรับตรวจสอบ_V6.14.30_MIXED_PATTERN_QUICK_SHIFT.sql
5. ผล check 1-6 ต้อง PASS
