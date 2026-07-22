Time-Clock Enterprise V6.5.0 Compact Deploy

ไฟล์สำหรับอัปโหลด GitHub Pages
- index.html
- app.js
- app.css
- 404.html
- .nojekyll

ลำดับติดตั้งฐานข้อมูล
1) ติดตั้ง SQL V6.2.4 ให้ข้อมูล CSV และ Attendance แสดงผลได้
2) ติดตั้ง V6.3.1 Technician Calculation Engine
3) ติดตั้ง V6.5.0 Calculation UI API
4) อัปโหลดไฟล์ใน ZIP นี้แทนชุดเดิม แล้วกด Ctrl+F5

ฟังก์ชันหน้าเว็บ V6.5.0
- Dashboard แสดงชั่วโมงสุทธิ ชั่วโมงปกติ OT Waiting และวันหยุดชดเชย
- รายละเอียดเวลาทำงานแสดง Pattern, Template, ประเภทวัน และผลคำนวณ
- คลิกแถวเพื่อดู Segment 1–3 ช่วงใน Drawer
- ปฏิทินกะแสดงสัญลักษณ์ OT / Waiting / Comp-off ในช่องวันที่
- Review Center รองรับสถานะจาก Calculation Engine

Design by แผนกบริหารระบบข้อมูลบุคคล ซีพี รีเทลลิงค์


V6.5.0: เพิ่มหน้า Leave & Certificate, Time Correction และ Exception Center
ต้องติดตั้ง V6.5.0_LEAVE_CERTIFICATE_TIME_CORRECTION.sql ก่อนใช้งานหน้าใหม่
