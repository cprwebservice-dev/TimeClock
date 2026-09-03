TimeClock Enterprise V6.15.29 FIX13
All Types Team Required Before Schedule

ฐาน: V6.15.29 FIX11 HR Review Correction Flow

Business Rule
- CAR: ต้องมี Effective Team ก่อนกำหนดกะ · 3–5 คน
- MOTORCYCLE: ต้องมี Effective Team ก่อนกำหนดกะ · ขั้นต่ำ 3 คน
- SUPPORT: ต้องมี Effective Team ก่อนกำหนดกะ · ขั้นต่ำ 1 คน
- UNCLASSIFIED: กำหนดกะไม่ได้
- Team Membership เป็น Schedule Prerequisite กลาง ไม่ขึ้นกับ Scoped Team Enforcement

ครอบคลุม Calendar/Assignment Modal ทุก Work Mode, Quick/Bulk, Copy/Paste, Request Apply และทุก RPC ที่เขียน shift_calendar ผ่าน Final DB Trigger

Deploy: รัน SQL FIX13 -> SQL ตรวจสอบ -> Upload GitHub -> Hard Refresh

FIX13 policy: CAR 3-5, MOTORCYCLE min 1, SUPPORT min 1; all require Effective Team before schedule.


V6.15.29 FIX14
- Fix Team modal aria-hidden/focus lifecycle.
- Hidden Team modals use inert.
- Focus is returned outside a modal before aria-hidden=true.
- No SQL change required.
