Time-Clock Enterprise V6.11.39 — Time Certification

เพิ่มระบบรับรองเวลาทำงานจริง
- Manager / HR Admin รับรองเวลาได้จาก TEAM DAILY DETAIL
- Manager / HR Admin รับรองเวลาได้จาก MONTHLY PERSONAL OVERVIEW
- HR Admin มี Tab เหตุผลรับรองเวลาใน System Settings
- เหตุผลเริ่มต้น W01-W13, W16, W90; W14/W15 เก็บไว้เป็น Inactive
- เวลาเริ่มรับรองต้องไม่ก่อนเวลาเริ่มกะ
- เวลาสิ้นสุดรับรองมากกว่าเวลาสิ้นสุดกะได้
- รองรับกะข้ามวันด้วยวันที่สิ้นสุด
- เหตุผลใน Modal ค้นหาได้จากรหัส/รายละเอียด
- W90 บังคับหมายเหตุ
- ไม่แก้ Raw time_logs
- หลัง Save / Revoke จะ Recalculate Attendance ทันที
- เชื่อม System Period / Manager Scope / HR Admin Override เดิม
- Audit CREATE / UPDATE / REVOKE
- Monthly V6.11.38 Parallel Load ยังคงไว้ และเพิ่ม Certification แบบ Parallel RPC
- Light / Dark mode

ติดตั้ง
1) รัน SQL_ที่ต้องรัน_V6.11.39_TIME_CERTIFICATION.sql
2) รัน SQL_สำหรับตรวจสอบ_V6.11.39_TIME_CERTIFICATION.sql — ควร PASS ทั้ง 13 รายการ
3) Deploy frontend ใน ZIP
4) Ctrl + Shift + R

ส่วนอื่นคงเดิมจาก V6.11.38
