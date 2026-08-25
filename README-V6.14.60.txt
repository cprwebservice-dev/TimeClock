TimeAttendance V6.14.60
MONTHLY PERSONAL OVERVIEW — Raw Punch Evidence UX

สิ่งที่ปรับ
1) เอา Badge รูปแบบพิเศษออกจากทุกตารางจัดกะ
   - ↗ ต่อดึก
   - ⌛ รอดึก
   - ◷ นับชม.
   Icon กะหลัก / สีตาม System Settings / Logic การจัดกะเดิมยังคงเดิม

2) MONTHLY PERSONAL OVERVIEW
   - เพิ่มปุ่ม “ข้อมูลการลงเวลา”
   - อ่าน time_logs ดิบทุก Record ของพนักงานในเดือน Calendar ที่เลือก
   - เรียงตามวันที่ -> เวลา -> Punch ID
   - แสดง IN / OUT / ไม่ระบุ, เวลา, GPS/สถานที่, เครื่อง/โครงการ/หมายเหตุ/Source เมื่อมีข้อมูล
   - มีตัวกรอง “เฉพาะวันที่หลายรายการ”

3) Calendar Evidence Indicator
   - วันที่มี > 2 Records หรือ IN > 1 หรือ OUT > 1 จะแสดงสัญลักษณ์ข้อมูลลงเวลาหลายรายการ
   - คลิกสัญลักษณ์เพื่อเปิดข้อมูลดิบและเลื่อนไปยังวันนั้น
   - เป็นข้อมูลประกอบให้ Manager พิจารณาการจัดกะพิเศษเท่านั้น
   - ไม่ Auto-classify และไม่ Auto-assign Work Mode

Backend
- ต้องรัน SQL V6.14.60 เพื่อสร้าง RPC ta_get_employee_time_punches_v61460(text,date)
- RPC ตรวจ Employee VIEW Scope ด้วย ta_can_access_employee_v680
- ไม่แก้ time_logs, Attendance, Schedule, Waiting, OT หรือ Night Sequence

ลำดับติดตั้ง
1) รัน SQL_ที่ต้องรัน_V6.14.60_MONTHLY_PERSONAL_RAW_PUNCHES.sql
2) Deploy Frontend V6.14.60
3) Ctrl+F5
4) รัน SQL_สำหรับตรวจสอบ_V6.14.60_MONTHLY_PERSONAL_RAW_PUNCHES.sql
