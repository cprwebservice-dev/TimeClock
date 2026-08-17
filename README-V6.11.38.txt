Time-Clock Enterprise V6.11.38 — Monthly Personal Overview Fast Load

ปรับเฉพาะ MONTHLY PERSONAL OVERVIEW
- โหลด Schedule / Work Plan / Attendance / Punch พร้อมกัน (Parallel)
- ตัดการโหลด Manager metadata ที่หน้าจอนี้ไม่ได้ใช้
- Cache ข้อมูลพนักงาน+เดือน 60 วินาที ทำให้เปิดซ้ำ/ย้อนกลับเดือนเดิมเร็วขึ้น
- ป้องกัน Request เก่าทับข้อมูลเมื่อกดเปลี่ยนเดือนเร็ว
- ปุ่ม Refresh, หลังจัดกะ และหลังประมวลผลเดือนนี้ จะ Force Fresh เสมอ
- Business Logic / Attendance / System Period / สิทธิ์เดิมคงเดิม
- ไม่ต้องรัน SQL

การติดตั้ง
1) Deploy ไฟล์ใน ZIP
2) Ctrl + Shift + R
3) ตรวจ Build = V6.11.38
