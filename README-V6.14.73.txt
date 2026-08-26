TimeAttendance V6.14.73

Monthly Personal Recalculation + RAW Punch Timeout Fix

Frontend
- Monthly Personal ไม่เรียก ta_get_attendance_shift_punch_meta_v61110 ทั้งเดือนโดยไม่จำเป็น
- กะปกติ STD / S043 / S134 / S135 ใช้ Attendance canonical IN/OUT โดยตรง
- RAW Punch metadata เรียกเฉพาะวันที่เป็น Special / Multi-segment และแบ่งช่วงไม่เกิน 3 วัน

Backend SQL
- ta_recalculate_employee_month_v61136 suppresses automatic row-by-row Attendance trigger during bulk rebuild/repair
- final calculation runs once through canonical certification-aware set-based refresh
- adds idx_time_logs_trim_emp_date_v61473 for V6.14.52 RAW punch resolver

Requires:
1) Run SQL_ที่ต้องรัน_V6.14.73_MONTHLY_RECALC_PUNCH_TIMEOUT_FIX.sql
2) Run SQL_สำหรับตรวจสอบ_V6.14.73_MONTHLY_RECALC_PUNCH_TIMEOUT_FIX.sql
3) Deploy frontend V6.14.73
