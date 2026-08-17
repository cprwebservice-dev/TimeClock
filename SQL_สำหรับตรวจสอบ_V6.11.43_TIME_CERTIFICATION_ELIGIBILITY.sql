-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.11.43
-- ============================================================================

with fn as (
  select pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n
    on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'ta_save_time_certification_v61139'
    and pg_get_function_identity_arguments(p.oid) =
      'p_emp_code text, p_work_date date, p_certified_start_at timestamp without time zone, p_certified_end_at timestamp without time zone, p_reason_code text, p_note text'
  limit 1
),
checks as (
  select
    1 as seq,
    'save_certification_rpc'::text as check_name,
    case
      when to_regprocedure(
        'public.ta_save_time_certification_v61139(text,date,timestamp without time zone,timestamp without time zone,text,text)'
      ) is not null
      then 'PASS' else 'FAIL'
    end as result,
    'Save Time Certification RPC exists'::text as detail

  union all
  select
    2,
    'future_work_date_blocked',
    case when exists(
      select 1 from fn
      where def ilike '%_ta_bangkok_today_v6110%'
        and def ilike '%TIME_CERTIFICATION_FUTURE_DATE_NOT_ALLOWED%'
    ) then 'PASS' else 'FAIL' end,
    'Work date after Bangkok today is blocked'

  union all
  select
    3,
    'leave_blocked',
    case when exists(
      select 1 from fn
      where def ilike '%ta_leave_request_days%'
        and def ilike '%TIME_CERTIFICATION_LEAVE_NOT_ALLOWED%'
    ) then 'PASS' else 'FAIL' end,
    'Approved leave day cannot be certified'

  union all
  select
    4,
    'off_blocked',
    case when exists(
      select 1 from fn
      where def ilike '%TIME_CERTIFICATION_OFF_NOT_ALLOWED%'
        and def ilike '%WEEKLY_OFF%'
        and def ilike '%PUBLIC_HOLIDAY%'
    ) then 'PASS' else 'FAIL' end,
    'OFF / weekly off / holiday day cannot be certified'

  union all
  select
    5,
    'missing_in_allowed',
    case when exists(
      select 1 from fn
      where def ilike '%missing_in_allowed%'
        and def not ilike '%v_first_in is null then raise%'
    ) then 'PASS' else 'FAIL' end,
    'Certification does not require an IN punch'

  union all
  select
    6,
    'missing_out_allowed',
    case when exists(
      select 1 from fn
      where def ilike '%missing_out_allowed%'
        and def not ilike '%v_last_out is null then raise%'
    ) then 'PASS' else 'FAIL' end,
    'Certification does not require an OUT punch'

  union all
  select
    7,
    'attendance_auto_rebuild',
    case when exists(
      select 1 from fn
      where def ilike '%rebuild_attendance_workday%'
        and def ilike '%attendance_day_auto_rebuilt%'
    ) then 'PASS' else 'FAIL' end,
    'Missing attendance_workday is created automatically'

  union all
  select
    8,
    'end_after_shift_still_allowed',
    case when exists(
      select 1 from fn
      where def ilike '%p_certified_start_at < v_shift_start_at%'
        and def not ilike '%p_certified_end_at > v_shift_end_at%'
        and def not ilike '%p_certified_end_at <= v_shift_end_at%'
    ) then 'PASS' else 'FAIL' end,
    'Certified end can still exceed shift end / cross day'

  union all
  select
    9,
    'attendance_recalculate',
    case when exists(
      select 1 from fn
      where def ilike '%_ta_refresh_attendance_with_certification_v61139%'
    ) then 'PASS' else 'FAIL' end,
    'Attendance recalculates after certification'

  union all
  select
    10,
    'authenticated_execute_grant',
    case when has_function_privilege(
      'authenticated',
      'public.ta_save_time_certification_v61139(text,date,timestamp without time zone,timestamp without time zone,text,text)',
      'EXECUTE'
    ) then 'PASS' else 'FAIL' end,
    'authenticated can execute save certification RPC'
)
select seq,check_name,result,detail
from checks
order by seq;
