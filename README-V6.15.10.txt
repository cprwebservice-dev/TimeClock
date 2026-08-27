Time-Clock Enterprise V6.15.10
Manager Request Center — Atomic Apply + Resolve

ติดตั้ง
1) รัน SQL_ที่ต้องรัน_V6.15.10_ATOMIC_REQUEST_WORKFLOW.sql ใน Supabase
2) รัน SQL_สำหรับตรวจสอบ_V6.15.10_ATOMIC_REQUEST_WORKFLOW.sql
3) Deploy ไฟล์ Web ชุดนี้แทนชุดเดิม
4) Hard Refresh 1 ครั้ง

การเปลี่ยนแปลง
- ขอรับรองเวลา: รับรอง + ปิดคำขอ Transaction เดียว
- งานกะพิเศษ: Guard + Shift/Work Plan + Scheduling Rule + Final Recalc + ปิดคำขอ Transaction เดียว
- สลับวันหยุด: 2 วันถูกเขียนใน Bulk payload เดียว; fail วันใดวันหนึ่ง = rollback ทั้งชุด
- ขอหยุดเพิ่ม: ตรวจโควต้า Backend และปิดคำขอใน Transaction เดียว
- ลาเต็มวัน: Bulk LV ทั้งช่วงและปิดคำขอ Transaction เดียว
- ลาบางส่วน: V6.15.10 ป้องกันไม่ให้กลายเป็น LV เต็มวัน; รอ V6.15.11 Partial Leave Overlay
- V6.14.90 Current Manager canonical authorization ยังคงใช้เดิม ไม่สร้าง resolver ซ้ำ
