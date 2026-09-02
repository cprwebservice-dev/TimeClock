TimeClock Enterprise V6.15.29 FIX9
Start Date Aligned Operational Profile + Team Membership + Schedule Guard

GitHub Deploy FULL — 13 runtime files

FIX9 changes:
- กำหนดรูปแบบครั้งแรก: Effective Date รายพนักงาน = MAX(ต้นเดือนปัจจุบัน, วันเริ่มงาน)
- หากเลือกหลายคนพร้อมกัน ระบบคำนวณวันที่มีผลรายคนอัตโนมัติ
- CAR / SUPPORT ที่เลือก Team พร้อมกำหนดรูปแบบ: Team Membership ใช้วันเดียวกับ Operational Profile ของพนักงานคนนั้น
- เปลี่ยนรูปแบบ: ห้ามก่อนต้นเดือนปัจจุบัน / วันเริ่มงาน / วันที่กำหนดรูปแบบครั้งแรก
- Impact Preview แสดงช่วง Effective Date และคนที่ถูกเลื่อนไปตามวันเริ่มงาน
- Canonical Schedule Guard ห้ามบันทึกกะก่อนวันเริ่มงาน
- Scoped Team Enforcement, CAR 3–5, SUPPORT, HR notification และ Dual-pane UX เดิมคงอยู่

Deploy:
1) Run SQL_ที่ต้องรัน_V6.15.29_FIX9_START_DATE_ALIGNED_OPERATIONAL_SCHEDULE.sql in Supabase SQL Editor
2) Run SQL_สำหรับตรวจสอบ_V6.15.29_FIX9_START_DATE_ALIGNED_OPERATIONAL_SCHEDULE.sql
3) Upload all 13 runtime files from this GitHub package to repository root
4) Hard Refresh: Ctrl+Shift+R

Build: V6.15.29 FIX9 — Start Date Aligned Operational Schedule
