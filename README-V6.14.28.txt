Time-Clock Enterprise V6.14.28
Attendance Policy + Compact Shift Assignment UX

ติดตั้ง
1) รัน SQL_ที่ต้องรัน_V6.14.28_ATTENDANCE_POLICY.sql ใน Supabase SQL Editor
2) Deploy ไฟล์ Frontend จาก ZIP V6.14.28 ทั้งชุด
3) Ctrl + F5 / Hard Refresh
4) รัน SQL_สำหรับตรวจสอบ_V6.14.28_ATTENDANCE_POLICY.sql

กติกา Attendance กลาง
- เข้าเกินเวลาเริ่มกะ 1–29 นาที = มาสาย
- เข้าเกินเวลาเริ่มกะตั้งแต่ 30 นาที = ขาดงาน
- ไม่ลงเวลาเข้า / ไม่ลงเวลาออก / ไม่ลงทั้งเข้าและออก = ขาดงาน
- ออกก่อนเวลาสิ้นสุดกะ = กลับก่อน

หมายเหตุสำคัญ
- late_minutes ยังคงเก็บจำนวนนาทีที่เข้าหลังเริ่มกะจริง
- กรณี >=30 นาที เปลี่ยนการจัดประเภทสถานะเป็น “ขาดงาน” แต่ไม่ได้เปลี่ยน absence_minutes เป็นเต็มกะโดยอัตโนมัติ
- กรณี Missing Punch ยังคงใช้กฎเดิมของ V6.6.4 ที่ absence_minutes เป็นเต็มกะ
- วันหยุด/วันลา/วันอนาคตไม่ถูกจัดเป็นขาดงานจากกฎนี้ เว้นแต่มี Effective Working Shift ที่จัดไว้จริง

หน้าจอที่ปรับให้ใช้กติกาเดียวกัน
- Dashboard / KPI
- รายละเอียดเวลาทำงาน + Filter + Export
- TEAM DAILY DETAIL / Team View
- MONTHLY PERSONAL OVERVIEW
- รายงานความผิดปกติเวลาเข้า–ออก
- Smart Data Assistant summary

Popup กำหนดกะทำงาน
- ลดความกว้างและพื้นที่ว่าง
- แสดงข้อมูลพนักงาน/วันที่/รูปแบบงาน/กะปัจจุบันแบบ Summary
- จัด Flow เป็น 3 ขั้น: รูปแบบงาน -> กะ -> รายละเอียดเพิ่มเติม
- Work Mode cards กระชับและ Responsive
- Footer ปุ่ม ลบ/ยกเลิก/บันทึก จัดวางชัดเจน
- คง Guard เดิม: System Period, User Scope, Day-off quota, 6h/48h, Scheduling Rules และ Attendance refresh
