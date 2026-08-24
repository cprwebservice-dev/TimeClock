TimeAttendance V6.14.46 — Attendance Load Notice Fix

ปรับจาก V6.14.45 โดยคงส่วนอื่นเดิม

1) แก้ Uncaught ReferenceError: renderAttendanceDataNotice is not defined
   - Event timeclock:attendance-loaded มี renderer รองรับแล้ว
   - โหลดปกติไม่แสดงข้อความรบกวน
   - ถ้าถึงเพดาน 5,000 รายการ จะแจ้งเตือนให้ลดช่วงวันที่/พนักงาน

2) Defensive fix
   - attendanceStatusText fallback ไม่เรียกตัวเองซ้ำอีก

3) คง V6.14.45
   - Generated Shift Cache สำหรับ SW/H5/H6/Generated day-off
   - ไม่เรียก HR-only Work Mode Admin RPC จาก Role ที่ไม่ใช่ HR Admin

ไม่ต้องรัน SQL
Deploy ZIP แล้วกด Ctrl+F5
ตรวจ Network/Console ว่า app.js เป็น v=6.14.46-20260824e
