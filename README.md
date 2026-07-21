# Time-Clock Enterprise V6.0 – Functional Complete

ระบบต่อยอดโดยตรงจาก **V5.6.3 Advance Schedule** และคงฟังก์ชันเดิมทั้งหมดไว้

## ฟังก์ชันหลัก
- Executive Dashboard
- ตารางจัดกะล่วงหน้าแบบ Excel
- Copy/Paste, Undo/Redo, Fill Down, Fill Right และรูปแบบกะ 7 วัน
- Workflow ตารางกะ DRAFT → PUBLISHED → LOCKED
- รายละเอียดเวลาทำงาน พร้อมเวลาเริ่มกะ/สิ้นสุดกะ
- Review Center พร้อมปิด/ละเว้นรายการ
- Report Center: CSV, Excel และ Print/Save as PDF
- Employee Directory
- HR Admin Center
- User, Role และ Scope
- Shift Master และ Holiday
- Audit Log
- Notification Center
- System Settings และ Developer Console
- Smart Assistant แบบ Rule-based ภายในระบบ

## วิธีติดตั้ง
1. รัน `sql/V6.0_FUNCTIONAL_COMPLETE.sql` ใน Supabase SQL Editor
2. รัน `sql/V6.0_VERIFY.sql` เพื่อตรวจสอบ
3. อัปโหลดไฟล์และโฟลเดอร์ทั้งหมดแทน V5.6.3 ใน GitHub Repository
4. รอ GitHub Pages Deploy
5. กด `Ctrl + Shift + R`

## หมายเหตุ
- ใช้ Publishable/Anon key บน Browser เท่านั้น ห้ามใช้ Service Role key
- Developer Mode จำลองเฉพาะ UI ส่วน Supabase RLS ยังตรวจสิทธิ์จริง
- Print/PDF ใช้คำสั่งพิมพ์ของ Browser
- Smart Assistant รุ่นนี้ไม่เชื่อม AI ภายนอก

รายละเอียดทั้งหมดอยู่ใน `RELEASE-NOTES-V6.0.md`


## V6.1 MobileTA Text Import
รัน `sql/V6.1_MOBILETA_TEXT_IMPORT.sql` ก่อนใช้งานเมนูนำเข้าข้อมูลลงเวลา MobileTA

## V6.1.1 Patch
ก่อนทดสอบนำเข้า MobileTA ให้รัน `sql/V6.1.1_MOBILETA_GENERATED_COLUMN_FIX.sql` และตรวจด้วย `sql/V6.1.1_VERIFY.sql`.


## V6.1.2 Timeout Fix
รัน `sql/V6.1.2_MOBILETA_TIMEOUT_FIX.sql` และตรวจด้วย `sql/V6.1.2_VERIFY.sql` ก่อนทดสอบนำเข้าไฟล์ขนาดใหญ่

## V6.1.3 Duplicate Classification Fix
รัน `sql/V6.1.3_MOBILETA_DUPLICATE_CLASSIFY_FIX.sql` และตรวจด้วย `sql/V6.1.3_VERIFY.sql` ก่อนนำเข้า MobileTA ใหม่

## V6.1.4 MobileTA Classify Chunk Fix
รัน `sql/V6.1.4_MOBILETA_CLASSIFY_CHUNK_FIX.sql` และตรวจด้วย `sql/V6.1.4_VERIFY.sql` จากนั้นอัปโหลดหน้าเว็บ V6.1.4 เพื่อให้ขั้นตอน classify แบ่งงานด้วย cursor และลดขนาดอัตโนมัติเมื่อพบ timeout

## V6.1.7 Attendance Rebuild Admin

1. Run `sql/V6.1.7_ATTENDANCE_REBUILD_ADMIN.sql` in Supabase SQL Editor.
2. Run `sql/V6.1.7_VERIFY.sql`.
3. Deploy all web files to the GitHub Pages repository root.
4. Login as `HR_ADMIN` and open **HR Admin > ประมวลผล Attendance**.

The browser acts as the worker and processes one task at a time. If the browser is closed, reopen the page and click **ดำเนินการต่อ**. Completed tasks are not repeated.


## V6.1.9
Attendance area/sub-area cascading filters and work metric display fixes.
