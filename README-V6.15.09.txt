TimeClock Enterprise V6.15.09
Employee Portal — Certification Period + Yesterday + Same-Shift Team

1) Time Certification request
- Uses the same ta_system_periods certification_open and
  attendance_certify_deadline policy as Manager certification.
- Not configured = backward-compatible open.
- Closed manually = Employee Portal cannot submit.
- Deadline passed = Employee Portal cannot submit.
- Future date cannot be certified.
- Workday-only rule remains.
- Modal shows round deadline / due-soon / closed reason.

2) Home Today / Yesterday
- Home blue shift card can switch between วันนี้ and เมื่อวาน.
- Punch labels are date-aware:
  yesterday without punch = ไม่มีเวลาเข้า / ไม่มีเวลาออก.
- 7-day upcoming strip remains anchored on today.

3) Same-shift technician team
- Below the blue shift card.
- Date follows Today/Yesterday selector.
- Only technician positions.
- Only colleagues sharing canonical Manager mapping with employee.
- Only exact same effective shift code on selected date.
- No colleague Raw Punch / Attendance is exposed.

Cache: V6.15.09a
