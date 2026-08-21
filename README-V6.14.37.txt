Time-Clock Enterprise V6.14.37
Canonical Neighbor State + Full-Day Leave Aware Night Guard

เป้าหมาย
- Popup / ปุ่มลัด / Bulk / Copy / Fill ใช้เงื่อนไขกะดึกในแนวทางเดียวกัน
- ลาเต็มวันที่อนุมัติแล้วต้องถือเป็น LV แม้ Structural Schedule ใต้วันนั้นยังเป็น STD/S043
- วันก่อนกะดึก: ห้ามเป็นกะเช้า/กลางวัน; อนุญาต กะดึก / วันหยุด / HOL / ลาเต็มวัน
- วันหลังกะดึก: ต้องเป็น กะดึก / วันหยุด / HOL / ลาเต็มวัน
- Partial Leave ไม่ถือเป็นวันลาเต็มวันสำหรับกฎนี้
- Minimum Rest 6 ชั่วโมง และ >48 ชั่วโมงคงเดิม

ติดตั้ง
1) รัน SQL_ที่ต้องรัน_V6.14.37_CANONICAL_NEIGHBOR_LEAVE_GUARD.sql
2) Deploy ไฟล์ Frontend V6.14.37
3) Ctrl + F5
4) รัน SQL_สำหรับตรวจสอบ_V6.14.37_CANONICAL_NEIGHBOR_LEAVE_GUARD.sql

เคสอ้างอิง
Employee 7889433 วันที่ 2026-08-10:
ถ้าวันก่อนเป็นลาเต็มวัน และวันถัดไปเป็นวันหยุด การจัด S135 ต้อง ALLOW
