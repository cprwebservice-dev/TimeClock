Time-Clock Enterprise V6.14.9 — Time Leave + Single Period Control

ปรับเฉพาะ UX/UI มุมมองเวลา:
- Label ใช้โครงสร้างแนวเดียวกับมุมมองทีม
- เรียงแนวตั้ง: จุดสี + ชื่อสถานะ + จำนวน
- แสดงเฉพาะสถานะที่มีจำนวนมากกว่า 0
- ปกติ / ขาดงาน / สาย / กลับก่อน
- Team View และ Business Logic เดิมคงไว้
- ไม่ต้องรัน SQL เพิ่ม


V6.14.9 changes:
- Time View daily label adds Leave (ลา), shown only when count > 0.
- Team/Time 15-day period navigation has one interactive controller at the top.
- Lower period selector is replaced with a read-only current-period context strip.
- No SQL changes.
