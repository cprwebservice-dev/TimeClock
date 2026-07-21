# Time-Clock Enterprise V6.1.5

## MobileTA Finalize & Resume Fix

- แก้ Statement Timeout ในขั้นตอน `complete`
- ขั้นตอนปิด Batch ไม่รวมรหัสพนักงานจากข้อมูลหลักแสนรายการอีกต่อไป
- เพิ่มปุ่ม **ดำเนินการต่อ** ในประวัติ Batch ที่ข้อมูลถูกเก็บไว้แล้ว
- ไม่ต้องอัปโหลด Text File ซ้ำสำหรับ Batch ที่ค้างในขั้นตอน classify/complete
- เพิ่มการประมวลผล Attendance แบบแบ่งตามวันที่และกลุ่มพนักงาน
- ลดจำนวนพนักงานต่อรอบอัตโนมัติเมื่อพบ Timeout
- Batch ที่นำเข้าข้อมูลหลักสำเร็จแล้วจะไม่ Rollback ทั้ง Batch

## Database

เพิ่มหรือแก้ไข RPC:

- `ta_complete_mobileta_import`
- `ta_get_mobileta_import_resume_state`
- `ta_rebuild_mobileta_attendance_chunk`

## Installation

1. รัน `sql/V6.1.5_MOBILETA_FINALIZE_RESUME_FIX.sql`
2. รัน `sql/V6.1.5_VERIFY.sql`
3. อัปโหลดไฟล์เว็บทั้งหมดแทน V6.1.4
4. กด `Ctrl + Shift + R`
5. เปิดประวัติการนำเข้าและกด **ดำเนินการต่อ** ที่ Batch ล่าสุด
