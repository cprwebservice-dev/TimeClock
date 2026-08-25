TimeAttendance V6.14.67
MONTHLY PERSONAL OVERVIEW — Missing Punch Status Fix

ปัญหา
- วันที่ในอดีตมีตารางกะทำงาน เช่น S043 08:30–17:30
- กด “ประมวลผลเดือนนี้” แล้ว
- แต่หาก Attendance enrichment ไม่คืน row ของวันนั้น หน้า Monthly Personal ยังใช้ Schedule fallback
  และแสดง “ยังไม่ประมวลผล” แม้ไม่มีเวลาเข้า/ออก

การแก้ไข
- Monthly Personal ใช้ Calendar + Attendance merged row กับกฎ Attendance กลางเดียวกัน
- วันทำงานในอดีตที่มีกะและไม่มี IN/OUT -> ขาดงาน (Missing Both)
- ขาด IN หรือ OUT -> ขาดงานตามกฎเดิม
- วันอนาคตที่มีกะ -> รอทำงาน
- วันลา/วันหยุด -> ยังคงสถานะเดิม
- วันที่ไม่มีทั้ง Schedule/Attendance ที่ใช้ตัดสินสถานะ -> ยังคง fallback เดิม
- KPI ขาดงาน/สาย/กลับก่อน และ “ภาพรวม” ใช้ชุดสถานะเดียวกับ Calendar card

Backend
- ไม่เปลี่ยน SQL
- rebuild_attendance_workday / Monthly recalculation เดิมยังเป็น Source of Truth
- Patch นี้แก้ UI fallback เมื่อ Attendance enrichment row ไม่ถูกส่งกลับมายัง Frontend

ส่วนอื่นคงเดิม
