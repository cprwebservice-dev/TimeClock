Time-Clock Enterprise V6.15.22
4C.4 — Leave Result Sync + Employee Portal Outcome + Notification
=================================================================

สิ่งที่เพิ่ม
1) Manager Apply คำขอลาเรียก ta_apply_employee_request_leave_v61522
   - เก็บ Backend Review ก่อนเปลี่ยนตารางกะ
   - ใช้ V6.15.21 Atomic Leave Apply เป็น Business Writer เดิม
   - Publish ผลก่อน → หลังกลับ Request detail ใน Transaction เดียวกัน

2) ลาเต็มวัน
   - Employee Portal แสดงวันทำงานที่เปลี่ยน กะเดิม → ลา
   - OFF / PH / ลาเดิม แสดง "ไม่เปลี่ยน"
   - แสดงจำนวนวันที่ปรับจริงและวันที่คงเดิม

3) ลาบางส่วน
   - แสดงกะเดิม + ช่วงเวลา Overlay
   - ยืนยันว่ากะเดิมยังคงอยู่
   - แสดง Timeline ผลลัพธ์ในหน้า "คำขอของฉัน"

4) Notification
   - ใช้ notification row ที่ status trigger สร้างไว้แล้วและ enrich ข้อความ ไม่สร้างซ้ำ
   - Notification ผูก request_id; แตะแล้วเปิดคำขอได้
   - แจ้งเตือนถูกตั้งกลับเป็น unread หลัง Manager ดำเนินการ

5) HR Connect Reminder
   - TimeAttendance ปรับ Schedule เท่านั้น
   - การลาอย่างเป็นทางการยังต้องดำเนินการใน HR Connect ตามขั้นตอนบริษัท

6) Lifecycle fix
   - Leave semantic trigger ตรวจเฉพาะ Employee request สถานะ PENDING
   - ป้องกันการ revalidate หลัง Schedule ถูกเปลี่ยนเป็น LV / Partial Overlay แล้ว
   - RETURNED -> PENDING Resubmit ยังถูก validate ใหม่ตามปกติ

7) Auto Sync
   - ใช้ V6.15.13 data/request/notification revision เดิม
   - เมื่อ Manager ดำเนินการ Portal จะ refresh ปฏิทิน/กะ, คำขอ และ Notification ตาม revision ที่เปลี่ยน

ติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.15.22_4C4_LEAVE_RESULT_SYNC_NOTIFICATION.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.15.22_4C4_LEAVE_RESULT_SYNC_NOTIFICATION.sql
3. ต้อง PASS ทั้ง 18 รายการ
4. Deploy Full Package
5. Hard Refresh Manager Web + Employee Portal

หมายเหตุ
- V6.15.21 Atomic Leave Apply / Rollback / Final State Verification ยังคงเป็น Canonical Business Writer
- V6.15.22 เพิ่ม Publication / Sync / Employee-facing UX โดยไม่สร้างช่องทางเขียน Schedule ใหม่
