Time-Clock Enterprise V6.14.14 — Month Copy Modal Stack Fix

ปรับจาก V6.14.13
- ป้องกัน Popup ยืนยันวางกะทั้งเดือนซ้อนกับ Global Confirm
- Preview Popup เป็นจุดยืนยันหลักเพียงครั้งเดียว
- ปิด Preview ก่อนแสดง Warning 6 ชม. / 48 ชม. / Quota / Compatibility
- ถ้า User ยกเลิก Warning ระบบกลับมา Preview เดิมได้
- ป้องกัน Double-click ปุ่มยืนยันระหว่างประมวลผล
- โหมด OVERWRITE เปลี่ยนข้อความปุ่มเป็น “ยืนยันและวางทับ”
- ไม่เปลี่ยน Business Logic หรือฐานข้อมูล

ติดตั้ง
1. Deploy ไฟล์ V6.14.14
2. Ctrl + F5
3. ไม่ต้องรัน SQL เพิ่ม
