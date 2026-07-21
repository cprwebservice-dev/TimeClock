# Time-Clock Enterprise V6.0.1 – Deployment Fix

แพ็กเกจนี้จัดไฟล์สำหรับอัปโหลดลง GitHub Pages โดยตรง ไฟล์ `index.html` อยู่ที่ระดับบนสุดของ ZIP

## วิธีติดตั้ง

1. แตกไฟล์ ZIP นี้
2. เปิดโฟลเดอร์ที่แตกไฟล์แล้ว
3. เลือกไฟล์และโฟลเดอร์ทั้งหมดภายใน เช่น `index.html`, `css`, `js`, `components`, `assets`, `sql`
4. อัปโหลดไปที่ root ของ Repository `TimeClock`
5. ตรวจใน GitHub ว่าไฟล์ `/index.html` บรรทัดแรกเป็น `<!DOCTYPE html>`
6. รอ GitHub Pages Deploy แล้วกด `Ctrl + Shift + R`

ห้ามคัดลอกเนื้อหาไฟล์ `.sql` ไปใส่ใน `index.html` และไม่ต้องเปิดไฟล์ SQL ผ่าน URL ของเว็บไซต์
