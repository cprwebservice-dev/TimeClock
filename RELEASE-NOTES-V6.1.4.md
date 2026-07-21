# Time-Clock Enterprise V6.1.4

## MobileTA Classification Cursor Fix

- แบ่งการจำแนก IN/OUT เป็นกลุ่มวันที่ + รหัสพนักงาน
- จำกัดจำนวนกลุ่มต่อ RPC เพื่อลด statement timeout
- ลดขนาดกลุ่มอัตโนมัติเมื่อพบ timeout
- ป้องกัน duplicate key ก่อนเปลี่ยน ALL เป็น IN/OUT
- ไม่ Rollback ข้อมูลที่อัปโหลดสำเร็จแล้วเมื่อ Error เกิดในขั้นตอน classify
- คงฟังก์ชันเดิมทั้งหมดจาก V6.1.3
