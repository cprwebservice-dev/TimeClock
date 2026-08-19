-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.13.3
-- ============================================================================

-- 1) Installation
select
  case
    when to_regprocedure('public.ta_get_dayoff_balance_v6133(text,date)') is not null
      then 'PASS'
    else 'FAIL'
  end as dayoff_balance_rpc_v6133;

-- 2) Day-off settings currently in effect
select
  effective_start_month,
  manager_position_pattern,
  manager_weekly_off_dows,
  other_weekly_off_dows,
  carry_forward_enabled
from public.ta_dayoff_settings
where setting_id = 1;

-- 3) Paired OFF mapping: expected primary mappings should remain editable setup
select
  upper(trim(r.shift_code)) as work_shift,
  upper(trim(r.paired_off_shift_code)) as off_shift,
  o.start_time as off_start,
  o.end_time as off_end,
  o.is_workday,
  case
    when r.paired_off_shift_code is null then 'NO_MAPPING'
    when o.shift_code is null then 'OFF_SHIFT_NOT_FOUND'
    when coalesce(o.is_workday,true) then 'OFF_MARKED_AS_WORKDAY'
    else 'PASS'
  end as result
from public.ta_shift_schedule_rules_v6123 r
left join public.shift_master o
  on upper(trim(o.shift_code)) = upper(trim(r.paired_off_shift_code))
where upper(trim(r.shift_code)) in ('STD','S043','S134','S135')
order by case upper(trim(r.shift_code))
  when 'STD' then 1 when 'S043' then 2 when 'S134' then 3 when 'S135' then 4 else 9 end;

-- 4) All Shift Master codes currently treated as day-off shifts
select
  upper(trim(s.shift_code)) as shift_code,
  s.shift_name,
  s.start_time,
  s.end_time,
  s.is_workday,
  case when coalesce(s.is_workday,true)=false then 'COUNT_AS_USED_DAYOFF' else 'WORKDAY' end as quota_usage
from public.shift_master s
where coalesce(s.is_active,true)
  and (
    coalesce(s.is_workday,true)=false
    or upper(trim(s.shift_code)) in ('OFF','HOL','OSTD','OS043','OS134','OS135')
  )
order by s.shift_code;

-- 5) Current-month scheduled day-off usage by Shift Code.
-- This shows whether OSTD / OS043 / OS134 / OS135 are now included in usage.
select
  upper(trim(c.shift_code)) as shift_code,
  count(*) as assignment_rows,
  count(distinct (public.normalize_emp_code(c.emp_code),c.work_date)) as employee_days
from public.shift_calendar c
left join public.shift_master sm
  on upper(trim(sm.shift_code))=upper(trim(c.shift_code))
where c.work_date >= date_trunc('month',current_date)::date
  and c.work_date < (date_trunc('month',current_date)+interval '1 month')::date
  and upper(trim(coalesce(c.shift_code,''))) not in ('LV','LEAVE')
  and (
    upper(trim(c.shift_code)) in ('OFF','HOL')
    or coalesce(sm.is_workday,true)=false
    or exists (
      select 1
      from public.ta_shift_schedule_rules_v6123 r
      where r.paired_off_shift_code is not null
        and upper(trim(r.paired_off_shift_code))=upper(trim(c.shift_code))
    )
  )
group by upper(trim(c.shift_code))
order by shift_code;

-- 6) Verify core frontend-facing shift pairs in Shift Master
select
  upper(trim(shift_code)) as shift_code,
  start_time,
  end_time,
  is_workday,
  is_night_shift,
  applicable_pattern_codes
from public.shift_master
where upper(trim(shift_code)) in ('STD','S043','S134','S135','OSTD','OS043','OS134','OS135')
order by shift_code;
