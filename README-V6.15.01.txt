TimeClock Enterprise V6.15.01
Employee Portal — All Raw Punch Records / 2-Shift Support

My Schedule
- Click a calendar day to load ALL raw time_logs Records for that employee/day.
- Night/special/cross-midnight schedules also load next-day punches through 12:00
  so the final OUT is not cut off.
- Summary displays total Records / IN / OUT.
- Raw records are grouped visually into:
  * ต่อเนื่องจากวันก่อน (when applicable)
  * กะที่ 1
  * กะที่ 2
  * additional/unpaired records
- Every Record remains visible; unmatched or duplicate punches are never discarded.
- (+1 วัน) is shown on a next-day cross-midnight punch.
- Grouping is presentation-only and never changes Attendance/Schedule/Raw Punch.

Backend
- New session-bound RPC: ta_portal_get_my_raw_punches_v61501(text,date)
- Reads only the logged-in Portal employee's public.time_logs.
- No writes to time_logs, Attendance, Schedule, Certification, or Work Pattern.
