# Time-Clock Enterprise V4

อัปเดตจาก Enterprise V3 โดยเพิ่ม System Settings และ Developer Console

## ฟีเจอร์ใหม่
- เมนู System Settings สำหรับ HR_ADMIN
- General / Theme / Developer / Feature Flags / Shift Colors / Connection / About
- Developer Mode สำหรับจำลองหน้าจอ HR_ADMIN, USER และ VIEWER
- การจำลอง Role เป็น UI simulation เท่านั้น Supabase RLS ยังคงตรวจสิทธิ์จริง
- Debug Console แสดง RPC ล่าสุด เวลาในการประมวลผล จำนวนแถว และ Error
- Test Connection และแสดงสถานะ Session
- ปิดบัง Supabase Publishable/Anon key ในหน้าตั้งค่า
- Feature Flags สำหรับเปิดหรือซ่อนเมนู
- ปรับสีประจำกะ D, N, OFF, HOL, LV, OT ผ่านหน้าจอ

## วิธีติดตั้ง
อัปโหลดไฟล์และโฟลเดอร์ทั้งหมดในแพ็กเกจนี้แทนชุดเดิมบน GitHub Repository แล้วรอ GitHub Pages Deploy จากนั้นกด Ctrl + Shift + R

## การทดสอบ
บัญชีที่จะเห็นเมนู System Settings ต้องมีสิทธิ์จริง HR_ADMIN ก่อน จากนั้นเปิด Developer Mode และเลือก View As เพื่อทดสอบ UX ของ USER หรือ VIEWER
