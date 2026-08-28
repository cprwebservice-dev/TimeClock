TimeClock Enterprise V6.15.20
4C.1 + 4C.2 — Employee Leave Request Preview + Manager Review
================================================================

Baseline
- ต่อจาก V6.15.19 4B.2D โดยตรง
- คง V6.15.10 Atomic Request Writer และ V6.15.11 Partial Leave Overlay เดิม
- HR Connect ยังคงเป็นระบบลาอย่างเป็นทางการ

4C.1 Employee Portal — ขอลา
1. เพิ่ม Backend Preview ก่อนส่งคำขอ
   - ta_portal_preview_leave_request_v61520(...)
   - ตรวจตารางกะจริงล่าสุด, System Period, Duplicate/Conflict และนโยบายลา
   - ส่งไม่ได้ถ้า Backend Preview ไม่ผ่าน

2. ลาเต็มวัน
   - รองรับช่วงวันที่คร่อม Weekly Off / PH / วันลาเดิม
   - วันทำงาน = Preview ว่าจะเปลี่ยนเป็น LV
   - OFF / PH / Leave เดิม = แสดง “ไม่เปลี่ยน” และไม่นับเป็นวันที่ต้องปรับกะ
   - ต้องมีวันทำงานอย่างน้อย 1 วัน
   - เก็บ affected_work_dates / skipped_nonworkdays ใน request.detail

3. ลาบางส่วน
   - ใช้ _ta_partial_leave_window_v61511 เดิม
   - แสดงกะจริง + ช่วงลา + ระยะเวลา + Timeline ทำงาน/ลา
   - กะเดิมยังคงอยู่ และใช้ Partial Leave Overlay หลัง Manager ดำเนินการ
   - ลากิจขั้นต่ำ 1 ชม. / พักร้อนขั้นต่ำ 3 ชม. ตาม Policy เดิม

4. UX
   - Preview Card แสดงผลต่อตารางกะก่อนส่ง
   - Loading / Blocker / Warning แยกชัดเจน
   - ย้ำว่า TimeAttendance ใช้เพื่อปรับ Schedule เท่านั้น และต้องคีย์ HR Connect แยก

4C.2 Manager Review
1. เพิ่ม ta_get_employee_request_leave_review_v61520(uuid)
   - Read-only authoritative review
   - อ่าน Effective Shift ล่าสุด ไม่ยึด Snapshot ตอนพนักงานส่ง
   - ตรวจ System Period + Conflict ซ้ำ
   - FULL_DAY ตรวจ Projected Night Sequence

2. Manager UI
   - ปุ่มเปลี่ยนเป็น “ตรวจและปรับตารางกะ”
   - ไม่ใช้คำว่า “อนุมัติลา” เพื่อลดความสับสนกับ HR Connect
   - แสดงรายวัน Current Shift -> LV หรือ “ไม่เปลี่ยน” สำหรับ OFF/PH/Leave เดิม
   - Partial Leave แสดง Timeline ภายในกะ
   - แสดง Checklist: ตารางกะ / รอบระบบ / Conflict / กะดึก / HR Connect

3. Return Flow
   - V6.15.19 Return RPC ขยายให้รองรับ LEAVE_REQUEST
   - Manager ส่งกลับให้พนักงานแก้ไขได้
   - Employee Portal ใช้ Returned Edit/Resubmit เดิมของ V6.15.19

Compatibility ในรอบ 4C.1/4C.2
- PARTIAL_DAY และ FULL_DAY ที่ทุกวันเป็นวันทำงานยังสามารถดำเนินการด้วย Atomic Writer เดิมได้
- FULL_DAY ที่มี OFF/PH/Leave เดิมอยู่ภายในช่วง สามารถ Submit + Review ได้แล้ว
- การเขียน Schedule แบบ “Affected-date Atomic Apply” สำหรับช่วงที่มีวันที่ Skip จะทำใน 4C.3 เพื่อไม่แก้ Writer กลางก่อนจบ Preflight/Review

Version / Cache
- Main application build: V6.15.20
- Main app cache query: 6.15.20-20260828a
- Employee Portal: V6.15.20
- Portal Service Worker cache: V6.15.20a

Installation
1. Run SQL_ที่ต้องรัน_V6.15.20_4C1_4C2_LEAVE_REQUEST_MANAGER_REVIEW.sql
2. Run SQL_สำหรับตรวจสอบ_V6.15.20_4C1_4C2_LEAVE_REQUEST_MANAGER_REVIEW.sql
3. ผลตรวจควร PASS ทั้ง 17 รายการ
4. Deploy Full Package
5. Hard Refresh Manager Web และ Employee Portal

Recommended Test Matrix
- FULL_DAY 1 วันทำงาน -> Preview SET_LV -> Manager Review ผ่าน
- FULL_DAY 3 วัน โดยมี Weekly Off 1 วัน -> Preview ปรับ 2 / ไม่เปลี่ยน 1
- FULL_DAY คร่อม PH -> PH แสดงไม่เปลี่ยน
- FULL_DAY ทั้งช่วงเป็นวันหยุด -> Block LEAVE_RANGE_NO_WORKDAY
- PARTIAL_DAY ลากิจ >=1 ชม. -> Timeline ถูกต้อง
- PARTIAL_DAY พักร้อน <3 ชม. -> Block
- PARTIAL_DAY บน OFF/PH -> Block
- รอบระบบปิด -> Employee Submit Block + Manager Review Block
- มี Request ทับซ้อน -> Conflict Block
- Manager Return LEAVE_REQUEST -> Portal เห็น RETURNED + แก้ไขและส่งใหม่ได้
- HR Connect notice แสดงทั้ง Employee Portal และ Manager Review
