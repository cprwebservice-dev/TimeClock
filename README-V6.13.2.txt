Time-Clock Enterprise V6.13.2 – Assignment Shift Source Fix

แก้ไข:
- S135 ถูกจัดเป็นกะดึกอย่างถูกต้อง (S134/S135 = Night, STD/S043 = Day)
- Popup กำหนดกะใช้รายการกะจาก RPC เดียวตาม Work Pattern + Scope หน่วยงาน
- Logic Daily Work Plan เดิมไม่เขียน Dropdown กะทับ Scheduling Rules อีกต่อไป
- 6 วัน: S043 + S135, 5 วัน: STD + S134 ตาม Set Up
- Sync Shift Master classification ของ 4 กะหลักกับกฎเปิดใช้งาน

ติดตั้ง:
1) รัน SQL_ที่ต้องรัน_V6.13.2_ASSIGNMENT_SHIFT_SOURCE_FIX.sql
2) รัน SQL_สำหรับตรวจสอบ_V6.13.2_ASSIGNMENT_SHIFT_SOURCE_FIX.sql
3) Deploy package และ Ctrl+F5
