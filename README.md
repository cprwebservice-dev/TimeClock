# Time-Clock Management — Enterprise Frontend V1

เวอร์ชันนี้เป็น Phase 1–2 ของ Frontend ใหม่ โดยรักษาความสามารถเดิมไว้ และจัดโครงสร้างให้พร้อมแยกโมดูลต่อใน Phase ถัดไป

## โครงสร้าง

- `index.html` — หน้า SPA หลัก
- `css/app.css` — จุดรวม CSS
- `css/tokens.css` — สี ตัวแปร และ Design Tokens
- `css/layout.css` — Layout หลัก
- `css/components.css` — Component ที่ใช้ร่วมกัน
- `css/pages.css` — CSS รายหน้า
- `css/responsive.css` — Mobile/Responsive
- `css/legacy.css` — CSS เดิมที่คงไว้เพื่อไม่ให้ระบบเสีย
- `js/core/app-core.js` — การทำงานเดิมทั้งหมดกับ Supabase/RPC
- `js/config.js` — Public frontend config เท่านั้น
- `js/enhancements.js` — UX เพิ่มเติมแบบไม่กระทบ Core
- `js/modules/` — พื้นที่แยกโมดูลใน Phase ถัดไป
- `components/` — Shared UI components
- `404.html` และ `.nojekyll` — รองรับ GitHub Pages

## วิธีอัปโหลด GitHub Pages

1. แตก ZIP
2. อัปโหลดไฟล์และโฟลเดอร์ทั้งหมดเข้า root ของ Repository `TimeClock`
3. ยืนยันว่า GitHub แสดงโฟลเดอร์ `css`, `js`, `components`, `assets`
4. รอ Deploy แล้วเปิด `https://cprwebservice-dev.github.io/TimeClock/`
5. กด `Ctrl + Shift + R` เพื่อล้าง Cache

## Supabase

ใช้เฉพาะ Publishable Key หรือ Anon Key ใน Browser ห้ามใช้ Service Role Key

## สถานะ

- Login / Session / Logout: พร้อมใช้งาน
- Dashboard / Attendance / Schedule / Review: คงการทำงานเดิม
- HR Admin: คงการทำงานเดิม
- Enterprise structure + accessibility + GitHub Pages support: เพิ่มแล้ว
