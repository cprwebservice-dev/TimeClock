# Time-Clock Enterprise V6.1.1

## MobileTA Generated Column Fix

แก้ข้อผิดพลาด:

`cannot insert a non-DEFAULT value into column "normalized_mode"`

สาเหตุ: `time_logs.normalized_mode` เป็นคอลัมน์ `GENERATED ALWAYS` จึงห้ามระบุค่าเองทั้งตอน INSERT และ UPDATE

การแก้ไข:

- ตัด `normalized_mode` ออกจากคำสั่ง INSERT
- เปลี่ยนการจำแนก IN/OUT ไปอัปเดต `inout_mode`
- ให้ PostgreSQL คำนวณ `normalized_mode` อัตโนมัติ
- คงระบบ Rollback, Duplicate Protection และ Rebuild Attendance เดิม
