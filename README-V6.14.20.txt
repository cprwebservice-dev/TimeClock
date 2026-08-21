Time-Clock Enterprise V6.14.20
Closed Period Overview UX

ปรับเฉพาะ Frontend / UX จาก V6.14.19

1) MONTHLY PERSONAL OVERVIEW
- เมื่อรอบจัดกะของ Manager ปิดแล้ว ปุ่ม/Label จัดกะในแต่ละวันจะไม่แสดง
- เมื่อรอบรับรองเวลาของ Manager ปิดแล้ว ปุ่ม/Label รับรองเวลาในแต่ละวันจะไม่แสดง
- HR Admin Override และหน้าจออื่นยังคงพฤติกรรมเดิม
- Badge ข้อมูลรับรองที่มีอยู่ยังแสดงตามเดิม

2) ตารางกะรายบุคคล • เต็มเดือน
- เมื่อรอบจัดกะปิด Icon กุญแจใน Label กะย้ายไปมุมล่างขวา
- มุมมอง 15 วัน / Team / Time ไม่เปลี่ยนตำแหน่ง Icon

ฐานข้อมูล
- ไม่ต้องรัน SQL เพิ่ม
- ต้องมี Backend V6.14.19 ตามระบบเดิม

ติดตั้ง
1. Deploy ไฟล์ Web V6.14.20
2. Ctrl + F5
3. ตรวจ About / Footer ให้เป็น V6.14.20
