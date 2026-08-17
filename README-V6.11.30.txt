Time-Clock Enterprise V6.11.30 — Focused Dark Mode Polish

ปรับ UX/UI Dark Mode เฉพาะ 3 จุดหลัก
1) Dashboard
2) ปฏิทินจัดกะ (Team / Personal / Team Daily Detail)
3) Monthly Personal Overview

แนวทาง
- ลดพื้นดำสนิท ใช้ Navy/Slate แบบเป็นชั้นเพื่อแยก Surface
- เพิ่ม Contrast ตัวอักษร ปุ่ม Filter ตาราง และ Status
- ลด Gradient ที่ไม่จำเป็นใน Dark Mode
- ปรับ Hover / Active / Focus ให้เห็นชัดแต่ไม่แสบตา
- รักษาสีสถานะที่มีความหมาย: Blue=กะกลางวัน, Violet=กะกลางคืน,
  Orange=HOL/Warning, Green=Leave/Success, Red=Error/Absence
- ปรับ Drawer / Modal / Table / KPI ให้ใช้ระบบสีเดียวกัน
- Monthly Personal Overview ปรับ Calendar Card, Punch, Status และ Edit button
  ให้อ่านง่ายขึ้นใน Dark Mode
- ปรับ browser theme-color ให้สัมพันธ์กับ Dark/Light Mode

การติดตั้ง
- ไม่ต้องรัน SQL
- Deploy ไฟล์ใน ZIP ทั้งชุด
- Ctrl + Shift + R หลัง Deploy
- ตรวจ Build = V6.11.30

ฐานฟังก์ชันเดิม: V6.11.27 (ST5/ST6 + Monthly Personal Overview)
ส่วน Business Logic, Supabase RPC, System Period และสิทธิ์เดิมคงเดิม
