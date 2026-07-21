-- =====================================================================
-- Time-Clock Enterprise V6.1.6 - Verification
-- =====================================================================

-- 1) ตรวจ Function
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ta_rebuild_attendance_employee';

-- 2) ตรวจ Index
select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_time_logs_emp_date_mode_time_v616',
    'idx_attendance_workday_emp_date_v616'
  )
order by indexname;

-- 3) ตรวจข้อมูลตัวอย่างรหัส 7512172 ใน time_logs
select
  emp_code,
  min(inout_date) as first_date,
  max(inout_date) as last_date,
  count(*) as time_log_rows,
  count(distinct inout_date) as time_log_dates
from public.time_logs
where trim(emp_code) = '7512172'
group by emp_code;

-- 4) ตรวจข้อมูล Attendance ตัวอย่างก่อน/หลังประมวลผล
select
  emp_code,
  min(work_date) as first_date,
  max(work_date) as last_date,
  count(*) as attendance_rows
from public.attendance_workday
where trim(emp_code) = '7512172'
  and work_date between date '2026-07-01' and date '2026-07-21'
group by emp_code;

-- 5) ตรวจจำนวนแถวตามวันที่
select
  work_date,
  first_in,
  last_out,
  shift_code,
  expected_day
from public.attendance_workday
where trim(emp_code) = '7512172'
  and work_date between date '2026-07-01' and date '2026-07-21'
order by work_date;
