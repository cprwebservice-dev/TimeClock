Time-Clock Enterprise V6.11.41 — Time Certification Viewport Fit

แก้เฉพาะ UX/UI Popup TIME CERTIFICATION

ปัญหาเดิม
- ที่ Browser Zoom 100% โดยเฉพาะจอ Laptop ความสูงประมาณ 768–900px
- Modal ถูก max-height แต่โครงสร้างไม่ได้เป็น Flex Column
- modal-body ยาวจน Footer/ปุ่มด้านล่างถูกตัดออก

V6.11.41
- Modal เป็น Flex Column ตามความสูงจริงของหน้าจอ
- Header คงที่
- เนื้อหาตรงกลาง Scroll ได้
- Footer และปุ่ม ปิด / บันทึกการรับรอง แสดงอยู่ด้านล่างเสมอ
- ปรับความแน่นของ Padding อัตโนมัติตามความสูงหน้าจอ
- รองรับจอ 1366x768 ที่ Zoom 100%
- รองรับ Mobile / จอแคบ
- Dark Mode คงเดิม
- Logic / SQL / Attendance / Certification / System Period คงเดิม

ไม่ต้องรัน SQL
