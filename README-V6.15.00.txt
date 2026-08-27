TimeClock Enterprise V6.15.00
Employee Portal Time Certification Request + Calendar Raw Punch

Employee Portal
- Rename TIME_ISSUE UI to "ขอรับรองเวลา".
- Request options:
  MISSING_IN  -> รับรองเวลา-เข้า
  MISSING_OUT -> รับรองเวลา-ออก
  WRONG_TIME  -> รับรอง-เต็มวัน
  Existing backend codes are retained for backward compatibility.
- Employee cannot request Time Certification on:
  weekly day off, public holiday, leave, or other non-workday shift.
- Submit button is disabled when the selected day is known to be non-certifiable.
- Backend also enforces the same rule.
- Only one active Time Certification request is allowed per employee/date.
- My Schedule calendar days are clickable.
- Clicking a date shows first Raw Punch IN and last Raw Punch OUT below the calendar.

Manager Request Center
- TIME_ISSUE label changed to "ขอรับรองเวลา".
- Subtype labels changed to certification language.
- Existing Time Certification action remains unchanged.

No Attendance calculation or raw time record is modified by this release.
