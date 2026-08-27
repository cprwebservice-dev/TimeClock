Time-Clock Enterprise V6.15.11
Partial Leave Schedule Overlay

ติดตั้ง
1) รัน SQL_ที่ต้องรัน_V6.15.11_PARTIAL_LEAVE_OVERLAY.sql
2) รัน SQL_สำหรับตรวจสอบ_V6.15.11_PARTIAL_LEAVE_OVERLAY.sql
3) Deploy ไฟล์ Web ทั้งชุด
4) Manager Web: Hard Refresh 1 ครั้ง
5) Employee Portal/PWA: เปิดหน้าใหม่หรือ Refresh เพื่อรับ Service Worker v61511a

สิ่งที่เพิ่ม
- Manager อนุมัติ PARTIAL_DAY ได้จริงจากคำขอ/แจ้งข้อมูล
- คง Shift เดิมไว้ ไม่เปลี่ยนเป็น LV เต็มวัน
- สร้าง Schedule-only Partial Leave Overlay แยกจาก Official Leave
- ไม่เขียน Official Leave / ไม่หัก Leave Quota / ไม่แทน HR Connect
- ลากิจบางส่วนขั้นต่ำ 1 ชั่วโมง
- ลาพักร้อนบางส่วนขั้นต่ำ 3 ชั่วโมง
- ลาอุปสมบท / ลาดูแลบุตรที่คลอดใหม่ = เต็มวันเท่านั้น
- ห้ามวันหยุด / PH
- รองรับกะข้ามเที่ยงคืน โดยผูกช่วงลากับ Work Date ของกะ
- Manager Approve + Overlay + Attendance refresh + Request RESOLVED เป็น Transaction เดียว
- ถ้าลาครอบต้นกะ ปรับ Late Anchor ไปเวลาสิ้นสุดลา
- ถ้าลาครอบท้ายกะ ปรับ Early-leave Anchor ไปเวลาเริ่มลา
- Punch ไม่ครบยังคง Absence ตาม Policy เดิม
- Employee Portal หน้าแรก / กะของฉัน / Raw Punch / เวลาทำงาน แสดงลาบางส่วนเป็น Overlay
- ถ้ากะถูกแก้ภายหลังและไม่ตรง Snapshot จะแสดงสถานะ Overlay รอตรวจสอบกะ แทนการคำนวณผิดกะ

หมายเหตุสำคัญ
Employee Portal ใช้สำหรับแจ้งปรับตารางกะเท่านั้น การลาจริงต้องคีย์ผ่าน HR Connect และอนุมัติโดยหัวหน้างานระดับฝ่าย
