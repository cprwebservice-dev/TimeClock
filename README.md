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
