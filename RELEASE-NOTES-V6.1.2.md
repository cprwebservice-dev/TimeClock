# Time-Clock Enterprise V6.1.2

## MobileTA Timeout Fix

- ลดขนาดการส่งข้อมูลแต่ละ Chunk จาก 2,000 เหลือ 500 รายการ
- ปรับ RPC นำเข้าให้ Parse JSON เพียงครั้งเดียวต่อ Chunk
- แยกการจำแนก IN/OUT เป็นรายวัน
- แยก Rebuild Attendance เป็นรายวัน
- การนำเข้าข้อมูลจะไม่ถูก Rollback เมื่อเฉพาะขั้นตอน Rebuild Attendance บางวันใช้เวลานาน
- แสดงวันที่ที่ Rebuild ไม่สำเร็จเพื่อให้ประมวลผลซ้ำภายหลังได้
- Rollback ก่อนนำเข้าสำเร็จจะลบเฉพาะข้อมูลของ Batch ไม่เรียก Rebuild ขนาดใหญ่
- คง `normalized_mode` เป็น GENERATED ALWAYS และบันทึกผลผ่าน `inout_mode`
