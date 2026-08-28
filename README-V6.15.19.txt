TimeClock Enterprise V6.15.19
4B.2D — Employee Portal Result Sync + Notification + Returned Flow
=================================================================

Baseline
- ต่อจาก V6.15.18 4B.2C โดยตรง
- ใช้ V6.15.18 เป็น Atomic Day-off Business Writer เดิม
- ใช้ V6.15.13 Request / Notification / Data Revision Sync เดิม

4B.2D Backend
1. เพิ่ม ta_apply_employee_request_dayoff_v61519(uuid,boolean,text)
   - เรียก V6.15.18 Atomic Approve เดิม
   - หลัง Apply สำเร็จ เก็บผลจริง Source / Target ลง request.detail.manager_apply_result_v61519
   - เก็บ before_shift_code / after_shift_code / work_date แยกทุกวันที่ได้รับผลกระทบ
   - อัปเดต Notification เดิมของ Request ให้เป็นผลจริงแทนข้อความกว้าง ๆ
   - Request Detail, Notification, Audit และ V6.15.18 Schedule Transaction อยู่ใน Transaction เดียวกัน

2. เพิ่ม Returned Flow สำหรับ DAYOFF_SWAP
   - Manager มีปุ่ม “ส่งกลับให้แก้ไข”
   - สถานะใหม่ RETURNED
   - ต้องระบุเหตุผลก่อนส่งกลับ
   - Employee Portal แสดง Manager Note และปุ่ม “แก้ไขและส่งใหม่”
   - เมื่อพนักงานแก้และส่งใหม่ Status กลับเป็น PENDING
   - Manager ได้ Notification รอบใหม่ว่าพนักงานแก้ไขและส่งกลับแล้ว
   - Employee สามารถยกเลิก Request ที่อยู่ RETURNED ได้

3. Portal Status Notification
   - RESOLVED: ดำเนินการแล้ว / แสดงผล Schedule จริง
   - REJECTED: ไม่อนุมัติ + เหตุผล Manager
   - RETURNED: ส่งกลับให้แก้ไข + เหตุผล Manager
   - CANCELLED: ยกเลิก

Employee Portal UX
- หน้า “คำขอ / แจ้งข้อมูล” แสดงผลจริงหลัง Manager อนุมัติ
- SWAP แสดง 2 แถว: วันหยุดเดิมกลับเป็นวันทำงาน + วันที่หยุดแทนเป็น OFF
- ADD แสดงวันที่ทำงานเดิม -> กะหยุดที่ระบบใช้จริง
- Notification มี Severity สีแยก Success / Warning / Danger
- แตะ Notification ที่ผูก Request แล้วระบบเปิด “คำขอ” และ Highlight Card ให้
- RETURNED อยู่ใน Tab รอดำเนินการและแก้ไขได้ทันที

Automatic Sync
- shift_calendar เปลี่ยน -> DATA revision -> Calendar / Attendance reload
- request เปลี่ยน -> REQUEST revision -> My Requests reload
- notification เปลี่ยน -> NOTIFICATION revision -> Badge / Notification reload
- ใช้ V6.15.13 lightweight polling เดิม ไม่เพิ่มการโหลดข้อมูลหนักทุกครั้ง

Manager Web UX
- V6.15.18 Review / 5D-6D / Period / Quota / 6h / Night Sequence คงเดิม
- Apply เปลี่ยนไปเรียก V6.15.19 เพื่อ Publish Result กลับ Portal
- เพิ่ม “ส่งกลับให้แก้ไข” เฉพาะคำขอวันหยุด Employee Portal ที่ยัง Active
- Filter สถานะเพิ่ม “ส่งกลับให้แก้ไข”

Version / Cache
- Main application build: V6.15.19
- Main app cache query: 6.15.19-20260828a
- Employee Portal: V6.15.19
- Portal Service Worker cache: V6.15.19a

Installation
1. Run SQL_ที่ต้องรัน_V6.15.19_4B2D_PORTAL_RESULT_SYNC_NOTIFICATION.sql
2. Run SQL_สำหรับตรวจสอบ_V6.15.19_4B2D_PORTAL_RESULT_SYNC_NOTIFICATION.sql
3. ผลตรวจควร PASS ทั้ง 19 รายการ
4. Deploy Full Package
5. Hard Refresh Manager Web และ Employee Portal

Recommended Test Matrix
- SWAP Approve -> Portal Request แสดง Source + Target จริง และ Notification 1 รายการ
- ADD Approve -> Portal Request แสดง Work shift -> paired OFF จริง
- Manager Return -> Portal เห็น RETURNED + เหตุผล + แก้ไขได้
- Employee Resubmit -> Status PENDING + Manager เห็น Request กลับมาและได้ Notification
- Employee Cancel RETURNED -> Status CANCELLED
- Manager Reject -> Portal เห็น REJECTED + เหตุผล
- Notification click -> เปิด Request Card ที่เกี่ยวข้องและ Highlight
- Portal เปิดค้างไว้ -> หลัง Manager Apply ระบบ Sync Calendar + Request + Notification อัตโนมัติ
