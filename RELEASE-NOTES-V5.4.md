# Time-Clock Enterprise V5.4 — Review Center

พัฒนาต่อจาก V5.3 ที่รวม Executive Dashboard ของ V5.2 แล้ว โดยคง Login, Supabase, Role/RLS, Enterprise Shell, Executive Dashboard และ Schedule Pro เดิมทั้งหมด

## เพิ่มใหม่
- Review Center แบบ Inbox สำหรับรายการผิดปกติ
- KPI แยก Missing IN, Missing OUT, ไม่มีเวลา, กะต้องตรวจสอบ และทำงานวันหยุด
- คลิก KPI เพื่อกรองรายการทันที
- ค้นหารหัสพนักงาน ชื่อ และหน่วยงานจากผลลัพธ์
- เลือกหลายรายการและกำหนดกะพร้อมกัน
- เลือกยืนยันกะทันทีใน Bulk Action
- แถบความมั่นใจของกะแนะนำ
- ส่งออกผลลัพธ์เป็น CSV ภาษาไทย
- Responsive และรองรับ Dark Mode

## RPC ที่ใช้
- ta_get_review_queue
- ta_assign_shift_single

ไม่มี SQL ใหม่สำหรับ Release นี้
