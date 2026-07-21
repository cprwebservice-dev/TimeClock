# Time-Clock Management — Supabase Web App

โครงสร้างเริ่มต้นแบบแยกไฟล์สำหรับนำขึ้น Hosting

## ไฟล์หลัก

- `index.html` — โครงสร้างหน้าเว็บ
- `css/app.css` — รูปแบบ UX/UI
- `js/app.js` — Authentication, Supabase RPC และการทำงานของหน้าเว็บ
- `assets/` — สำหรับ Logo และรูปภาพในอนาคต

## การใช้งาน

1. อัปโหลดทั้งโฟลเดอร์ขึ้น Hosting โดยให้ `index.html` อยู่ที่ root
2. เปิด URL ของเว็บไซต์
3. กดตั้งค่าการเชื่อมต่อ Supabase
4. กรอก Project URL และ Publishable/Anon Key
5. Login ด้วยบัญชี Supabase Authentication

## Supabase URL Configuration

ตั้งค่าใน Authentication → URL Configuration

- Site URL: URL หลักของเว็บ
- Redirect URLs: `https://โดเมนของคุณ/**`

## ความปลอดภัย

หน้าเว็บต้องใช้เฉพาะ Publishable Key หรือ Anon Key ห้ามใส่ Service Role Key
