Time-Clock Enterprise V6.11.26
Schedule System Period — All Views

ฐาน: V6.11.25 + System Period backend เดิม

ปรับหน้าปฏิทินจัดกะให้สัมพันธ์กับ “จัดการรอบระบบ” ทุกมุมมอง:
- รายบุคคลรายสัปดาห์: ปิดรอบ = Read Only + Lock แต่ยังเห็นกะ/เวลา
- มุมมองทีม: วันที่ปิดรอบยังคลิกดู Team Daily Detail ได้ แต่เป็น Read Only
- Team Daily Detail: ปุ่มจัดกะ Disabled และแสดงสถานะรอบ
- ปฏิทินรายบุคคลทั้งเดือน: วันปิดรอบแสดง Lock / ปุ่มจัดกะ Disabled / Overview ยังดูได้
- Popup กำหนดกะ: Manager รอบปิดเป็น Read Only; HR Admin มี Override
- Quick Shift / Paste / Fill / Pattern / Bulk / Undo / Redo: ตรวจ System Period ก่อนบันทึก
- การเปลี่ยนรอบผ่าน HR Admin จะ Sync ไปยังทุก Context ที่เปิดอยู่ผ่าน Realtime/Polling เดิม
- เดือนที่ไม่กำหนด System Period ใช้สิทธิ์เดิม (Backward compatible)
- HR Admin แสดง “HR Admin Override” ชัดเจนเมื่อรอบปิดสำหรับ Manager

SQL:
- ไม่ต้องรัน SQL เพิ่มสำหรับ V6.11.26
- ใช้ System Period backend V6.11.0+ และ SQL ล่าสุดที่ติดตั้งอยู่เดิม

Deploy:
1) Deploy ไฟล์ ZIP ทั้งชุด
2) Ctrl + Shift + R
3) ตรวจ Build V6.11.26
4) ทดสอบทั้ง Role MANAGER และ HR_ADMIN
