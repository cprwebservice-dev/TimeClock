# Time-Clock Enterprise V5.5 — Report Center

ฐานรุ่น: V5.4 จาก V5.3 ซึ่งรวม Executive Dashboard V5.2

## เพิ่มใหม่
- เมนูศูนย์รายงาน
- ส่งออกรายละเอียดเวลาทำงานเป็น CSV
- ส่งออกตารางจัดกะรายเดือนเป็น CSV
- ส่งออกรายการรอตรวจสอบเป็น CSV
- ส่งออกสรุป Dashboard เป็น CSV
- รายงานเฉพาะมาสายและกลับก่อน
- ตัวกรองช่วงวันที่ พื้นที่ และหน่วยงาน
- ประวัติการส่งออกใน Browser พร้อมสถานะและจำนวนแถว

## RPC ที่ใช้
- ta_get_attendance_detail
- ta_get_monthly_schedule
- ta_get_review_queue
- ta_get_dashboard_overview

ไม่มี SQL ใหม่ใน Release นี้
