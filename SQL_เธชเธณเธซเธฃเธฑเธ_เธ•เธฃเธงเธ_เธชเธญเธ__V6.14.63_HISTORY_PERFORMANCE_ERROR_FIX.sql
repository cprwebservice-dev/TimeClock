-- ==========================================================================
-- SQL สำหรับตรวจสอบ
-- TimeAttendance V6.14.63
-- ==========================================================================

with checks as (
  select 1 seq,'attendance_reader_v61463_exists' check_name,
    case when to_regprocedure('public.ta_get_attendance_detail_v61463(date,date,text,text,text,text[],text[],text[],integer)') is not null
      then 'PASS' else 'FAIL' end result,
    'มี Attendance reader รุ่น V6.14.63' detail

  union all
  select 2,'authenticated_execute',
    case when has_function_privilege(
      'authenticated',
      'public.ta_get_attendance_detail_v61463(date,date,text,text,text,text[],text[],text[],integer)',
      'EXECUTE'
    ) then 'PASS' else 'FAIL' end,
    'Frontend authenticated เรียก reader ใหม่ได้'

  union all
  select 3,'manager_scope_prefilter',
    case when pg_get_functiondef(
      'public.ta_get_attendance_detail_v61463(date,date,text,text,text,text[],text[],text[],integer)'::regprocedure
    ) ilike '%_ta_scope_employee_ranges_v61022%'
      then 'PASS' else 'FAIL' end,
    'Manager Scope ถูกคำนวณก่อนอ่าน Attendance รายละเอียด'

  union all
  select 4,'canonical_reader_preserved',
    case when pg_get_functiondef(
      'public.ta_get_attendance_detail_v61463(date,date,text,text,text,text[],text[],text[],integer)'::regprocedure
    ) ilike '%ta_get_attendance_detail_v664%'
      and pg_get_functiondef(
      'public.ta_get_attendance_detail_v61463(date,date,text,text,text,text[],text[],text[],integer)'::regprocedure
    ) ilike '%ta_get_attendance_detail_v61020%'
      then 'PASS' else 'FAIL' end,
    'ยังใช้ canonical Attendance policy เดิม ไม่เขียนสูตรใหม่ทับ'

  union all
  select 5,'attendance_workday_normalized_index',
    case when to_regclass('public.idx_attendance_workday_norm_emp_date_v61463') is not null
      then 'PASS' else 'FAIL' end,
    'Index normalized employee/date ของ attendance_workday'

  union all
  select 6,'attendance_calc_normalized_index',
    case when to_regclass('public.idx_attendance_calc_norm_emp_date_v61463') is not null
      then 'PASS' else 'FAIL' end,
    'Index normalized employee/date ของ calculation'

  union all
  select 7,'shift_calendar_normalized_index',
    case when to_regclass('public.idx_shift_calendar_norm_emp_date_v61463') is not null
      then 'PASS' else 'FAIL' end,
    'Index normalized employee/date ของ shift_calendar'

  union all
  select 8,'time_logs_normalized_index',
    case when to_regclass('public.idx_time_logs_norm_emp_date_mode_time_v61463') is not null
      then 'PASS' else 'FAIL' end,
    'Index time_logs รองรับ punch metadata / เดือนย้อนหลัง'

  union all
  select 9,'read_only_wrapper',
    case when pg_get_functiondef(
      'public.ta_get_attendance_detail_v61463(date,date,text,text,text,text[],text[],text[],integer)'::regprocedure
    ) not ilike '%update public.%'
      and pg_get_functiondef(
      'public.ta_get_attendance_detail_v61463(date,date,text,text,text,text[],text[],text[],integer)'::regprocedure
    ) not ilike '%delete from public.%'
      and pg_get_functiondef(
      'public.ta_get_attendance_detail_v61463(date,date,text,text,text,text[],text[],text[],integer)'::regprocedure
    ) not ilike '%insert into public.%'
      then 'PASS' else 'FAIL' end,
    'Reader ใหม่ไม่แก้ Attendance / Schedule / time_logs'


  union all
  select 10,'dashboard_reader_v61463_exists',
    case when to_regprocedure('public.ta_get_dashboard_overview_v61463(date,date,text,text)') is not null
      then 'PASS' else 'FAIL' end,
    'Dashboard เดือนย้อนหลังใช้ reader แบบ set-based Scope'

  union all
  select 11,'dashboard_set_based_scope',
    case when pg_get_functiondef('public.ta_get_dashboard_overview_v61463(date,date,text,text)'::regprocedure) ilike '%_ta_scope_employee_ranges_v61022%'
      and pg_get_functiondef('public.ta_get_dashboard_overview_v61463(date,date,text,text)'::regprocedure) not ilike '%ta_can_manage_employee_schedule%'
      then 'PASS' else 'FAIL' end,
    'Dashboard ไม่เรียก permission function ซ้ำทุก Attendance row'
)
select seq,check_name,result,detail from checks order by seq;
