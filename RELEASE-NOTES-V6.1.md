# Time-Clock Enterprise V6.1 – MobileTA Text Import

ต่อจาก V6.0.1 Deployment Fix

## เพิ่มใหม่
- หน้า HR Admin: นำเข้าข้อมูลลงเวลา MobileTA
- รองรับ Text File `ALL,EmployeeId,YYMMDD,HHMMSS`
- ตรวจสอบรูปแบบ วันที่ เวลา และข้อมูลซ้ำภายในไฟล์ก่อนนำเข้า
- นำเข้าเป็นชุดย่อยพร้อม Progress
- ป้องกันนำเข้าข้อมูลเดิมซ้ำด้วย Source Hash
- จับคู่ข้อมูลพนักงานและแสดงจำนวนรหัสที่ไม่พบ
- กำหนด IN/OUT จากลำดับเวลาและกะกลางคืนที่จัดไว้
- เลือกประมวลผล `attendance_workday` หลังนำเข้า
- ประวัติ Batch และ Error Log
- Rollback Batch อัตโนมัติเมื่อการนำเข้าไม่สำเร็จ
