TimeClock Enterprise V6.15.29 FIX6
Operational Profile Effective Date Guard

GitHub Deploy FULL — 13 runtime files

FIX6 changes:
- ASSIGN / กำหนดรูปแบบครั้งแรก: Effective Date ถูกกำหนดอัตโนมัติเป็นวันที่ 1 ของเดือนปัจจุบัน และแก้ไขไม่ได้
- CHANGE / เปลี่ยนรูปแบบ: ห้ามย้อนหลังไปก่อนเดือนปัจจุบัน
- CHANGE: วันที่มีผลต้องไม่ก่อนวันที่กำหนดรูปแบบครั้งแรกของพนักงาน
- Backend Preview/Writer guard ป้องกันการ bypass จาก Frontend
- ใช้ Asia/Bangkok สำหรับ Current Month policy ฝั่ง Supabase
- Existing Operational Profile history ไม่ถูก rewrite

Deploy:
1) Run SQL_ที่ต้องรัน_V6.15.29_FIX6_OPERATIONAL_EFFECTIVE_DATE_GUARD.sql in Supabase SQL Editor
2) Run SQL_สำหรับตรวจสอบ_V6.15.29_FIX6_OPERATIONAL_EFFECTIVE_DATE_GUARD.sql
3) Upload all 13 runtime files from the GitHub package to repository root
4) Hard Refresh: Ctrl+Shift+R


Build: V6.15.29 FIX7 — Polished Readable Team Workspace
Frontend UX/UI only; backend remains V6.15.29 FIX6/FIX2-compatible.
