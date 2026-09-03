TimeClock Enterprise — V6.15.29 FIX12 Safe Team Closure UX

Deploy
1) รัน SQL: SQL_ที่ต้องรัน_V6.15.29_FIX12_SAFE_TEAM_CLOSURE_WORKFLOW.sql
2) Upload ไฟล์ทั้งหมดในโฟลเดอร์นี้ขึ้น GitHub repository root
3) Hard Refresh: Ctrl+Shift+R

FIX12
- เปลี่ยนปุ่ม “ปิด” เป็น “เตรียมปิด”
- ก่อนปิดทีม ระบบตรวจสมาชิก Current/Future ที่ยังผูกทีม
- CAR/SUPPORT ต้องย้ายไป Team ปลายทางที่ถูกประเภท
- MOTORCYCLE เลือก Team ใหม่ หรือ “ไม่เข้าทีม” ได้
- รองรับ Checkbox + เลือกหลายคน + Bulk target
- Impact Preview ตรวจ Capacity ทีมปลายทางก่อนบันทึก
- CAR ปลายทางต้อง 3–5 คน
- SUPPORT ปลายทางขั้นต่ำ 1 คน
- MOTORCYCLE ถ้าเลือก Team ต้องผ่าน Policy ของ Team
- ตารางกะเดิมไม่ถูกลบ; แสดงจำนวน Schedule ที่จะเปลี่ยน Team Context
- Direct TEAM Enforcement ของทีมที่ปิดจะสิ้นสุดอัตโนมัติ
- การย้ายสมาชิก + ปิด Team ทำใน Transaction เดียว
- Backend safety-net ป้องกัน Client เก่าปิดทีมที่ยังมีสมาชิกโดยตรง
- Effective Date ของการปิดทีม = วันที่ปัจจุบัน (Asia/Bangkok) เพื่อให้ Flow ชัดและไม่เกิด Scheduled Closure ค้าง

ฐาน Frontend: V6.15.29 FIX11 HR Acknowledge Only
Database prerequisite: V6.15.29 FIX11B และ SQL ก่อนหน้าตามลำดับที่ใช้งานอยู่
