TimeClock Enterprise V6.15.15
4B — End-to-End Manager -> Portal Consistency Audit

Audited flows
- Time Certification
- Special Work
- Swap Day-off
- Add Day-off
- Full-day Leave
- Partial Leave Overlay

Protection
- New Employee Portal requests cannot become RESOLVED if their authoritative
  backend state does not match the action.
- A failed consistency check rolls back the same transaction.
- Historical requests before installation are WARN instead of hard-blocked.

Sync
- Request / data / notification Revision evidence is checked.
- WARN caused by notification timing is automatically rechecked when
  Request/Notification revision changes.

Manager UI
- ✓ ตรวจครบ
- △ รอ Sync
- ! ไม่ตรง

Employee Portal
- ✓ ตารางและระบบตรงกัน
- △ กำลัง Sync ข้อมูล
- ! กรุณาให้ Manager ตรวจสอบ

Deploy after V6.15.14.
Portal cache: V6.15.15a
