-- =====================================================================
-- V6.1.7 Verification: Attendance Rebuild Admin
-- This file does not start a rebuild job.
-- =====================================================================

-- 1) Tables
select table_name
from information_schema.tables
where table_schema='public'
  and table_name in (
    'ta_attendance_rebuild_jobs',
    'ta_attendance_rebuild_tasks',
    'ta_attendance_rebuild_errors'
  )
order by table_name;

-- 2) RPCs
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'ta_create_attendance_rebuild_job',
    'ta_process_attendance_rebuild_step',
    'ta_control_attendance_rebuild_job',
    'ta_retry_attendance_rebuild_errors',
    'ta_get_attendance_rebuild_jobs',
    'ta_get_attendance_rebuild_errors'
  )
order by p.proname;

-- 3) Required indexes
select indexname
from pg_indexes
where schemaname='public'
  and indexname in (
    'idx_ta_att_rebuild_jobs_created',
    'idx_ta_att_rebuild_tasks_pick',
    'idx_ta_att_rebuild_errors_job',
    'idx_time_logs_emp_date_mode_time_v617',
    'idx_attendance_workday_emp_date_v617'
  )
order by indexname;

-- 4) Existing jobs (may be empty before first use)
select * from public.ta_get_attendance_rebuild_jobs(10);

-- 5) Basic readiness result
select
  case when
    to_regclass('public.ta_attendance_rebuild_jobs') is not null
    and to_regclass('public.ta_attendance_rebuild_tasks') is not null
    and to_regclass('public.ta_attendance_rebuild_errors') is not null
    and to_regprocedure('public.ta_create_attendance_rebuild_job(date,date,integer,text)') is not null
    and to_regprocedure('public.ta_process_attendance_rebuild_step(uuid)') is not null
    and to_regprocedure('public.ta_get_attendance_rebuild_jobs(integer)') is not null
  then 'PASS' else 'FAIL' end as attendance_rebuild_admin_v617;
