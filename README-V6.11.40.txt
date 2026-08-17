Time-Clock Enterprise V6.11.40 — Time Certification Modal Stack Fix

แก้เฉพาะการแสดงผล Popup / Modal ของ TIME CERTIFICATION

ปัญหาเดิม
- TIME CERTIFICATION ใช้ z-index 5200
- MONTHLY PERSONAL OVERVIEW ใช้ z-index 5450
- เมื่อเปิดรับรองเวลาจาก Monthly Personal Overview จึงถูก Popup เดิมซ้อนทับ

V6.11.40
- ยก TIME CERTIFICATION เป็น layer 8200
- Reason Editor เป็น layer 8300
- Global Confirm/Prompt ยังคงอยู่เหนือ Time Certification ที่ layer 10000
- Loading Overlay และ Toast แสดงเหนือ Time Certification
- ปิด pointer event ของ Popup/Drawer ด้านล่างขณะรับรองเวลา
- Lock scroll ระหว่างเปิด Time Certification
- รองรับ Team Daily Detail และ Monthly Personal Overview
- Business Logic / SQL / Attendance Calculation / System Period คงเดิม

ไม่ต้องรัน SQL
