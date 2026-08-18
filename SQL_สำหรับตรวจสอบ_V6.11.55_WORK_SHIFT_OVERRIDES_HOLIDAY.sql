-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.11.55
-- Expected: PASS ทั้ง 8 รายการ
-- ============================================================================

with save_fn as (
  select pg_get_functiondef(
    'public.ta_save_time_certification_v61139(text,date,timestamp without time zone,timestamp without time zone,text,text)'::regprocedure
  ) as def
),
checks as (
  select
    1 as seq,
    'save_rpc_exists'::text as check_name,
    case when to_regprocedure(
      'public.ta_save_time_certification_v61139(text,date,timestamp without time zone,timestamp without time zone,text,text)'
    ) is not null then 'PASS' else 'FAIL' end as result,
    'Time Certification save RPC exists'::text as detail

  union all
  select
    2,
    'effective_workday_rule',
    case when exists(
      select 1 from save_fn
      where def ilike '%v_effective_workday%'
        and def ilike '%not in (''OFF'', ''HOL'', ''LV'')%'
    ) then 'PASS' else 'FAIL' end,
    'Effective working shift is detected independently from natural holiday flags'

  union all
  select
    3,
    'holiday_override_allowed',
    case when exists(
      select 1 from save_fn
      where def ilike '%if not v_effective_workday%'
        and def ilike '%v_is_public_holiday%'
    ) then 'PASS' else 'FAIL' end,
    'Public holiday flag blocks only when no effective working shift exists'

  union all
  select
    4,
    'weekly_off_override_allowed',
    case when exists(
      select 1 from save_fn
      where def ilike '%if not v_effective_workday%'
        and def ilike '%v_is_weekly_off%'
    ) then 'PASS' else 'FAIL' end,
    'Weekly-off flag blocks only when no effective working shift exists'

  union all
  select
    5,
    'off_hol_still_blocked',
    case when exists(
      select 1 from save_fn
      where def ilike '%in (''OFF'', ''HOL'')%'
        and def ilike '%TIME_CERTIFICATION_OFF_NOT_ALLOWED%'
    ) then 'PASS' else 'FAIL' end,
    'Actual OFF/HOL remains non-certifiable'

  union all
  select
    6,
    'leave_still_blocked',
    case when exists(
      select 1 from save_fn
      where def ilike '%TIME_CERTIFICATION_LEAVE_NOT_ALLOWED%'
    ) then 'PASS' else 'FAIL' end,
    'Leave remains non-certifiable'

  union all
  select
    7,
    'shift1_actual_out_guard_preserved',
    case when exists(
      select 1 from save_fn
      where def ilike '%TIME_CERTIFICATION_END_AFTER_ACTUAL_OUT%'
        and def ilike '%v_shift1_actual_out_at%'
    ) then 'PASS' else 'FAIL' end,
    'V6.11.45 actual OUT upper bound remains active'

  union all
  select
    8,
    'version_v61155',
    case when exists(
      select 1 from save_fn
      where def ilike '%V6.11.55%'
    ) then 'PASS' else 'FAIL' end,
    'Save RPC version updated to V6.11.55'
)
select seq,check_name,result,detail
from checks
order by seq;
