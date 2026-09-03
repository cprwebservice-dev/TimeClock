TimeClock Enterprise V6.15.29 FIX11
HR Review Correction Flow

ฐาน: V6.15.29 FIX9 Start Date Aligned + Backend patches ก่อนหน้า

สิ่งที่เปลี่ยนใน FIX11
- HR ส่งกลับ Operational Change แล้ว Manager เปิด Event เดิมโดยตรง
- ไม่ Filter ด้วย old_operational_type อีกต่อไป
- Resolve สถานะ Operational Profile / Team ปัจจุบันของพนักงานก่อนแก้
- Pin พนักงานจาก Event เข้าฝั่งรายการแก้ไขอัตโนมัติ ไม่ต้อง Search ใหม่
- แสดงรายการเดิม / สถานะปัจจุบัน / หมายเหตุ HR ใน Popup
- แนะนำปลายทางเดิมก่อนเปลี่ยน (เช่น MOTORCYCLE -> CAR เดิม) และ Team เดิมถ้ายังใช้ได้
- ตรวจ Team / Capacity / Effective Date ด้วย Preview เดิม
- ตรวจข้อมูลตารางกะตั้งแต่วันที่มีผลถึงสิ้นเดือนแบบ Read-only; กะเดิมไม่ถูกลบ
- บันทึก Correction ด้วย Effective Change ใหม่ ไม่ Rewrite Event เดิม
- Event ที่ HR ส่งกลับเปลี่ยนเป็น CORRECTED และ Link ไป Event ใหม่
- Event ใหม่ถูกส่งให้ HR Admin เป็น UNREAD เพื่อรับทราบ/ส่งกลับซ้ำได้

Deployment
1) รัน SQL_ที่ต้องรัน_V6.15.29_FIX11_HR_REVIEW_CORRECTION_FLOW.sql ใน Supabase
2) รัน SQL_สำหรับตรวจสอบ_V6.15.29_FIX11_HR_REVIEW_CORRECTION_FLOW.sql
3) Upload ไฟล์ทั้งหมดใน ZIP นี้ขึ้น GitHub repository root
4) Hard Refresh (Ctrl+Shift+R)

หมายเหตุ
- FIX11 ไม่แก้/ลบประวัติ Operational Change เดิม
- Team/Operational/Schedule policies เดิมยังคงใช้
- SQL ไม่ได้ถูก Execute กับ Supabase จริงจากไฟล์นี้
