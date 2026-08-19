Time-Clock Enterprise V6.13.1 — Shift Pair Visibility Fix

แก้ไข
1) พนักงาน 5 วัน: STD และ S134 เป็นคู่กะกลางวัน/กลางคืน
2) พนักงาน 6 วัน: S043 และ S135 เป็นคู่กะกลางวัน/กลางคืน
3) Popup กำหนดกะไม่ใช้ Default Shift มาจำกัดตัวเลือก แต่ใช้ Work Pattern + Scope หน่วยงาน
4) Mapping ของ 4 รหัสหลักยึด Shift Code ไม่ผูกกับเวลา เพื่อให้แก้เวลา Shift Master ภายหลังได้
5) กะวันหยุดคู่กัน sync applicable_pattern_codes ตามกะทำงาน

ติดตั้ง
- รัน SQL_ที่ต้องรัน_V6.13.1_SHIFT_PAIR_VISIBILITY_FIX.sql
- รัน SQL_สำหรับตรวจสอบ_V6.13.1_SHIFT_PAIR_VISIBILITY_FIX.sql
- Deploy ไฟล์เว็บ V6.13.1 และ Ctrl+F5
