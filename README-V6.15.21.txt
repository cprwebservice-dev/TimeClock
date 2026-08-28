TimeClock Enterprise V6.15.21
4C.3 — Affected-date Atomic Leave Apply + Rollback + Final Verification
=======================================================================

ต่อจาก
- V6.15.19 4B.2D Portal Result Sync
- V6.15.20 4C.1 + 4C.2 Leave Request Preview + Manager Review

เป้าหมาย
1. ลาเต็มวันที่คร่อม OFF / PH / ลาเดิม ต้องปรับ Schedule เฉพาะวันทำงานจริง
2. วันที่ไม่ใช่วันทำงานต้องคงสภาพเดิม ไม่ถูกเปลี่ยนเป็น LV
3. ทุกขั้นตอนของ Manager Apply ต้องเป็น Transaction เดียว และ Rollback เมื่อ Final State ไม่ตรง
4. ลาบางส่วนยังคงใช้ V6.15.11 Partial Leave Overlay และห้ามเปลี่ยนกะเดิม
5. V6.15.15 End-to-End Consistency Guard ต้องเข้าใจ Affected-date semantics ก่อน Request เปลี่ยนเป็น RESOLVED

Backend V6.15.21
-----------------
A. ta_get_employee_request_leave_review_v61521(uuid)
- ครอบ V6.15.20 Review เดิม
- เพิ่ม affected_atomic_ready
- FULL_DAY apply_strategy = AFFECTED_WORK_DATES_ATOMIC
- PARTIAL_DAY apply_strategy = PARTIAL_OVERLAY_ATOMIC

B. ta_apply_employee_request_leave_v61521(uuid,text)
- Lock Request row
- Serialize การ Apply ของพนักงานเดียวกันด้วย advisory lock
- Recheck Manager Review หลัง Lock
- เปรียบเทียบ Current Schedule กับ Review snapshot ก่อนเขียน
- FULL_DAY:
  * สร้าง payload เฉพาะ action=SET_LV
  * Skip OFF / PH / ลาเดิม
  * System Period guard
  * Work Pattern validation
  * Night Sequence projected-final-state validation
  * ta_assign_shifts_bulk_v61424
  * ta_sync_bulk_schedule_rules_v6135
  * ta_finalize_schedule_mutation_v61415
  * Final verify วันที่แก้ทุกวันเป็น LV
  * Final verify วันที่ Skip ยังคงเป็น Non-workday และ Shift ไม่ถูกเปลี่ยน
- PARTIAL_DAY:
  * ใช้ ta_apply_employee_request_v61510 / V6.15.11 Overlay เดิม
  * Verify active overlay
  * Verify structural shift ยังเป็นกะเดิม
- Request RESOLVED หลัง Business State ผ่านเท่านั้น
- Audit = MANAGER_LEAVE_APPLIED_V61521

C. V6.15.15 Consistency Guard revision
- FULL_DAY ใหม่ตรวจ applied_affected_work_dates แทนการบังคับทุก Calendar day เป็น LV
- applied_skipped_nonworkdays ต้องยังเป็น Non-workday
- Request เก่าที่ยังไม่มี V6.15.21 apply snapshot ใช้ Legacy range check ต่อไป
- Audit table เก็บ checker version V6.15.21 สำหรับรายการใหม่

Manager UI
----------
- ปุ่มเดิม “ตรวจและปรับตารางกะ” คงไว้
- Manager Review ไม่ Block อีกต่อไปเมื่อช่วงลามี OFF / PH อยู่ภายใน
- แสดง Affected-date Atomic Apply ชัดเจน
- ปุ่มยืนยัน = “ตรวจครบ • ปรับตารางกะ”
- หลัง Apply แสดงจำนวนวันที่เปลี่ยนเป็น LV และจำนวนวัน OFF/PH ที่คงเดิม
- Refresh Schedule / Attendance / Request Sync หลังสำเร็จ

Employee Portal
---------------
- 4C.1 Preview / Submit เดิมคงทั้งหมด
- Version/cache bump เป็น V6.15.21a
- 4C.4 จะเป็นงานแสดงผลลัพธ์หลัง Manager ดำเนินการให้ละเอียดใน Employee Portal

Version / Cache
---------------
- Main application build: V6.15.21
- app.css/app.js cache: 6.15.21-20260828a
- Employee Portal: V6.15.21
- Portal Service Worker cache: V6.15.21a

Installation
------------
1. Run SQL_ที่ต้องรัน_V6.15.21_4C3_AFFECTED_DATE_ATOMIC_LEAVE_APPLY.sql
2. Run SQL_สำหรับตรวจสอบ_V6.15.21_4C3_AFFECTED_DATE_ATOMIC_LEAVE_APPLY.sql
3. ผลตรวจควร PASS ทั้ง 20 รายการ
4. Upload Full Package
5. Hard Refresh Manager Web และ Employee Portal

ข้อควรทราบ
------------
- TimeAttendance ปรับตารางกะจากข้อมูลการแจ้งลาเท่านั้น
- HR Connect ยังคงเป็นระบบการลาอย่างเป็นทางการ
- SQL ใน Package ไม่ได้ถูก Execute กับ Supabase จริงในขั้นตอนสร้างไฟล์นี้
