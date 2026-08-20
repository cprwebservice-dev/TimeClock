Time-Clock Enterprise V6.14.15
Schedule + Time Certification Consistency Audit
================================================

เป้าหมาย
- ให้ทุกหน้าที่ “บันทึกกะ” ใช้แนวทางเดียวกัน และคำนวณ Attendance หลังข้อมูลกะ/Work Plan/Scheduling Rule ถูกบันทึกครบแล้ว
- ให้ทุกหน้าที่ “รับรองเวลา” ใช้ Time Certification ชุดเดียวกัน (เวลาเริ่ม/สิ้นสุด + เหตุผล + Audit) ไม่ใช้ Legacy status-only certification จากหน้า Attendance Detail อีก
- หลังบันทึก/ยกเลิก/ประมวลผลใหม่ ให้ Attendance Detail, TEAM DAILY DETAIL, มุมมองเวลา และ Monthly Personal อ่านผลล่าสุดชุดเดียวกัน

จุดที่ตรวจพบและแก้ไข
1) Main assignment / Special work mode
   เดิม Attendance อาจถูก Recalculate ก่อน Scheduling Rule extension ถูกบันทึก
   V6.14.15 เพิ่ม Finalizer หลัง Rule ถูกบันทึกแล้ว

2) Bulk / Fill / Paste / Copy ทั้งเดือน / Undo / Redo
   เดิม Bulk writer Recalculate ก่อน Smart OFF / Scheduling Rule sync
   V6.14.15 Finalize อีกครั้งหลัง sync เสร็จ โดยจำกัดเฉพาะ Employee + Date ที่เปลี่ยน

3) Attendance Detail Certification
   เดิมยังมีทางเรียก ta_certify_attendance_v680 / ta_revoke_attendance_certification_v680
   V6.14.15 เปลี่ยนให้เปิด Time Certification V6.11.39 เหมือน Team Daily / Monthly Personal

4) Shift Change Request Approval
   เดิมใช้ ta_assign_shift_single_v651 และมี Legacy Attendance refresh ซ้ำ
   V6.14.15 ใช้ 6h/48h Guard + Day-off Quota V6.14.3 + Smart OFF sync + certification-aware finalizer

5) Manual Recalculate
   Attendance Detail และ Monthly Personal จบด้วย certification-aware refresh เพื่อไม่ทำให้ข้อมูลรับรองเวลาหายจากผลคำนวณ

6) Attendance Rebuild / CSV Rebuild
   เมื่อ Job จบ ระบบล้าง Derived Cache ของ Time View / Monthly Personal เพื่อไม่ให้เห็นข้อมูลก่อน Rebuild

ไฟล์ SQL ที่ต้องรัน
- SQL_ที่ต้องรัน_V6.14.15_SCHEDULE_CERTIFICATION_CONSISTENCY.sql

SQL สำหรับตรวจสอบ
- SQL_สำหรับตรวจสอบ_V6.14.15_SCHEDULE_CERTIFICATION_CONSISTENCY.sql

ลำดับติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.14.15_SCHEDULE_CERTIFICATION_CONSISTENCY.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.14.15_SCHEDULE_CERTIFICATION_CONSISTENCY.sql และตรวจ PASS
3. Deploy ไฟล์ Web V6.14.15
4. Ctrl + F5 / Ctrl + Shift + R
5. ตรวจ Footer / About = V6.14.15

Regression Test แนะนำ
- บันทึกกะปกติ / กะดึก / วันหยุด / LV จาก Assignment Modal
- บันทึกกะนับชั่วโมง และ เช้า+รอเข้ากะดึก แล้วเปิด Attendance Detail ทันที
- Fill / Paste / Copy ทั้งเดือน / Undo / Redo แล้วสลับไปมุมมองเวลา
- เปิด TEAM DAILY DETAIL และ Attendance Detail ของคน+วันเดียวกัน ตัวเลข/สถานะต้องสัมพันธ์กัน
- รับรองเวลาจาก Team Daily, Monthly Personal และ Attendance Detail: ต้องเปิด Modal รูปแบบเดียวกัน
- Save / Revoke Certification แล้วหน้าเดิมและมุมมองเวลาต้องเห็นผลใหม่
- อนุมัติคำขอเปลี่ยนกะ: <6 ชม. ต้อง Block, >48 ชม. ต้อง Warning, วันหยุดต้องผ่าน Quota
- Rebuild Attendance / CSV + Rebuild แล้วกลับ Time View ต้องโหลดผลใหม่

หมายเหตุ
- ส่วนอื่นคงเดิม
- OFF ยังคงปิดใช้งานตามนโยบายปัจจุบัน
