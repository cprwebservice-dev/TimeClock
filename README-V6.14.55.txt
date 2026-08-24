TimeAttendance V6.14.55 — Absence Minutes + Attendance Excel Consistency

Frontend changes
- Attendance Detail: complete punches with Late >=30 minutes show actual late minutes in ขาดงาน(นาที).
- Missing IN/OUT keeps full-shift absence minutes.
- Late 1–29 minutes remains มาสาย and ขาดงาน(นาที)=0.
- Rename ขาดงานจากเวลาไม่ครบ -> ขาดงาน / ขาดงาน(นาที).
- Attendance Excel export uses the same visible-column selection, order, labels and values as the grid.
- Existing V6.14.53 Schedule Work-Mode icon color fix retained.

Backend SQL V6.14.55 must also be installed so persisted/API values agree with the frontend.
