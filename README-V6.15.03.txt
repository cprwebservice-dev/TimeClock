TimeClock Enterprise V6.15.03
Employee Portal — Modern Attendance / Shift 1 + Shift 2

Attendance tab
- Stops using the lightweight Calendar late/early fields as the source for status.
- Loads a dedicated Portal Attendance RPC based on canonical Attendance calculation
  and canonical Shift-1 / Shift-2 punch mapping.
- Late 1–29 minutes = สาย.
- Late >=30 minutes = ขาดงาน.
- Missing IN/OUT on expected work segment = ขาดงาน.
- OUT before planned end = กลับก่อน.
- Displays three separate metrics: สาย / ขาดงาน / กลับก่อน.
- Two-shift work shows separate กะที่ 1 and กะที่ 2 cards.
- Time Certification overrides Shift 1 only; Shift 2 remains actual punch.

My Schedule
- Raw Punch section continues to show every record.
- Removes source_sheet/source_file filenames from employee-facing UI.
- Shows location/reader context (when available), date and Record number instead.

UI
- Modern status chips and distinct Shift 1 / Shift 2 styling.
- Non-working days do not show meaningless 0-minute anomaly metrics.
