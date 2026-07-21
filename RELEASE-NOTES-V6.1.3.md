# Time-Clock Enterprise V6.1.3

## MobileTA Duplicate Classification Fix

แก้ Error ระหว่างขั้นตอนกำหนด IN/OUT:

`duplicate key value violates unique constraint "ux_time_logs_emp_date_time_mode"`

### การแก้ไข

- คำนวณ IN/OUT ใน Temp Table ก่อนแก้ข้อมูลจริง
- ตรวจรายการที่เวลาและ Mode ซ้ำกับข้อมูลเดิม
- เก็บข้อมูลเดิมไว้ และลบเฉพาะรายการซ้ำจาก Batch ใหม่
- ปรับจำนวน `inserted_rows` และ `existing_duplicate_rows` ให้ตรงกับผลจริง
- ใช้เวลาที่ไม่ซ้ำในการหา First IN / Last OUT เพื่อลดผลกระทบจากข้อมูลซ้ำ
- ไม่แก้โครงสร้าง Unique Index และไม่ลบข้อมูลเดิม

### การติดตั้ง

รัน `sql/V6.1.3_MOBILETA_DUPLICATE_CLASSIFY_FIX.sql` ต่อจาก V6.1.2 แล้วตรวจด้วย `sql/V6.1.3_VERIFY.sql`
