TimeClock Enterprise V6.15.18
4B.2C — Day-off Request Atomic Approve + Schedule Apply Guard
==============================================================

Baseline
- ต่อจาก V6.15.17 4B.2A + 4B.2B โดยตรง
- คง V6.15.10 Atomic Request Workflow เป็น Canonical Business Writer
- ไม่แก้ Flow ของ Time Certification / Special Work / Leave

4B.2C Backend
1. เพิ่ม ta_get_employee_request_dayoff_review_v61518(uuid)
   - ใช้ V6.15.17 Review เป็นฐาน
   - เพิ่มการตรวจ Work Pattern 5D/6D ของ Proposed Shift ทุกแถว
   - แสดงคำเตือนกรณีชั่วโมงทำงานต่อเนื่องเกิน 48 ชม.

2. เพิ่ม ta_apply_employee_request_dayoff_v61518(uuid, boolean, text)
   - Lock request ด้วย FOR UPDATE
   - Advisory lock ตามพนักงาน + เดือน เพื่อกัน Manager approve ชนกัน
   - โหลด Review ล่าสุดอีกครั้งหลัง Lock
   - ตรวจ System Period ก่อนเขียนทุกวันที่ได้รับผลกระทบ
   - ตรวจ Shift / Work Pattern 5D/6D ทุกแถว
   - ตรวจ Minimum Rest >= 6 ชม. ผ่าน ta_validate_schedule_guard_v6141
   - ตรวจ Day-off Quota แบบ whole payload
   - ตรวจ Night Sequence แบบ Projected Final State V6.14.37
   - >48h เป็น Warning และต้อง Manager ยืนยันซ้ำ
   - เขียนจริงผ่าน ta_apply_employee_request_v61510 เพื่อรักษา Bulk Writer / Smart OFF / Finalizer เดิม
   - ตรวจ Source + Target + Request Status หลังเขียนก่อนคืนผล
   - ถ้าตรวจหลังเขียนไม่ตรง จะ Raise Exception และ Rollback ทั้ง Transaction

3. Audit / Change Log
   - Schedule Change Log เดิมยังเกิดจาก Canonical Schedule Writer
   - เพิ่ม MANAGER_DAYOFF_APPLIED_V61518 ใน ta_employee_portal_audit_v61482
   - เก็บ Proposed Rows, Guard, Quota, Night Sequence, Final State และ Manager Email
   - Audit, Notification, Schedule, Attendance Finalizer และ Request Status อยู่ใน Transaction เดียวกัน

Request Status
- หลัง Apply สำเร็จยังใช้สถานะ RESOLVED ตาม Canonical Employee Request Workflow เดิม
- Employee Portal แสดง RESOLVED เป็น “ดำเนินการแล้ว”
- Status notification trigger เดิมยังแจ้งผลกลับ Employee Portal

Manager UI
- Review ใช้ RPC V6.15.18
- เพิ่ม Check “รูปแบบการทำงาน 5D/6D”
- ปุ่มยืนยันสลับวันหยุด = “ยืนยันและปรับ Schedule”
- แสดงคำเตือน >48 ชม. และเปิด Confirmation เพิ่มอีกชั้น
- หลังสำเร็จ Invalidate consistency cache + Reload Schedule + Refresh Request Sync
- Error final-state mismatch แสดงว่า Backend Rollback อัตโนมัติ

Version / Cache
- Main application build: V6.15.18
- Main app cache query: 6.15.18-20260828a
- Employee Portal: V6.15.18
- Portal Service Worker cache: V6.15.18a

Installation
1. Run SQL_ที่ต้องรัน_V6.15.18_4B2C_DAYOFF_ATOMIC_APPROVE.sql
2. Run SQL_สำหรับตรวจสอบ_V6.15.18_4B2C_DAYOFF_ATOMIC_APPROVE.sql
3. ผลตรวจควร PASS ทุกข้อ
4. Deploy Full Package
5. Hard Refresh Manager Web และ Employee Portal

Recommended Test Matrix
- SWAP: วันหยุดเดิม -> วันทำงาน และวันทำงานเป้าหมาย -> paired OFF สำเร็จพร้อมกัน
- ADD: วันทำงาน -> paired OFF และโควต้าลดตามผลจริง
- 5D พยายามได้กะ 6D -> Block
- 6D พยายามได้กะ 5D -> Block
- System Period ปิด -> Block ก่อนเขียน
- Rest < 6h -> Block
- Night Sequence ผิด -> Block
- Quota ไม่พอ -> Block
- >48h -> ต้อง Confirm รอบสอง
- หาก Business Writer หรือ Final Verification Error -> Schedule และ Request ต้องไม่เปลี่ยนครึ่งรายการ
