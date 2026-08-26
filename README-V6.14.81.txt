TimeClock Enterprise V6.14.81
Employee Request Center — Time Issue + Special Work Notice

Changes
- Renamed the existing Shift Request page to “คำขอ / แจ้งข้อมูล”.
- Added unified employee request types:
  1) ขอแก้ไขกะ (existing workflow)
  2) แจ้งปัญหาเวลาทำงาน: ไม่มีเวลาเข้า / ไม่มีเวลาออก / เวลาไม่ถูกต้อง
  3) แจ้งทำงานกะพิเศษ: กะปกติ+งานลูกค้าช่วงดึก / กะเช้า+รอเข้ากะดึก / กะนับชั่วโมง
- Employee cannot edit Attendance time. Punch data is shown only as a snapshot for the request.
- Manager handles TIME_ISSUE through the existing Time Certification modal.
- Manager handles SPECIAL_WORK through the existing Schedule Assignment modal; the requested work mode/times are prefilled for review.
- A request is automatically marked RESOLVED only after Time Certification or Schedule Assignment is successfully saved.
- Added in-app notifications for new requests and completed/rejected requests.
- Existing Shift Change Request workflow remains unchanged and is merged into the same Request Center list.
- Added request-type filter and generic export columns.

Backend
- Requires SQL V6.14.81 before deploying this frontend.
- New tables are isolated from the existing shift-change request table.
- Manager routing uses the existing ta_get_schedule_manager_map_v61124 resolver.
- Direct table access is revoked; authenticated clients use SECURITY DEFINER RPCs only.

Notes
- This version adds Request Center workflow to the current authenticated web app.
- QR/PIN activation and standalone Employee PWA access remain a separate portal phase.
