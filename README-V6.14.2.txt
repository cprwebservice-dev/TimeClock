Time-Clock Enterprise V6.14.2 — Day-off Quota Hard Guard

สิ่งที่เพิ่ม
- วันหยุดคงเหลือ 0 วัน: ห้ามกำหนดวันหยุดเพิ่ม
- ตรวจแบบ projected quota ไม่ Block การบันทึกวันหยุดเดิมซ้ำ
- เปลี่ยนวันหยุดเดิมเป็นวันทำงาน: คืนสิทธิ์
- Bulk / Fill / Paste / Copy Week คิดผลกระทบสุทธิ รองรับย้ายวันหยุดในชุดเดียว
- Popup ปิดตัวเลือกวันหยุดเมื่อสิทธิ์หมด (ถ้าวันนั้นยังไม่ได้ใช้สิทธิ์)
- Backend wrappers V6.14.2 ตรวจซ้ำก่อนเขียนจริง

ติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.14.2_DAYOFF_QUOTA_HARD_GUARD.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.14.2_DAYOFF_QUOTA_HARD_GUARD.sql
3. Deploy ไฟล์ V6.14.2
4. Ctrl + F5
