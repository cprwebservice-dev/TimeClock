-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.18
-- Config-Driven Work Pattern + System Period Guard
-- ============================================================================

with checks as (
  select 1 as seq,'single_save_v61418'::text as check_name,
    case when to_regprocedure('public.ta_assign_employee_work_pattern_v61418(text,text,text,date,date,integer[],text)') is not null then 'PASS' else 'FAIL' end as result,
    'Canonical Work Pattern writer V6.14.18 exists'::text as detail

  union all
  select 2,'bulk_save_v61418',
    case when to_regprocedure('public.ta_assign_employee_work_patterns_bulk_v61418(jsonb)') is not null then 'PASS' else 'FAIL' end,
    'Bulk Work Pattern writer V6.14.18 exists'

  union all
  select 3,'config_driven_reader_v61418',
    case when to_regprocedure('public.ta_get_employee_pattern_default_shift_v61418(text[],date)') is not null then 'PASS' else 'FAIL' end,
    'Bulk UI reader uses config-driven Work Pattern'

  union all
  select 4,'system_period_guard_retained',
    case when pg_get_functiondef('public.ta_assign_employee_work_pattern_v61418(text,text,text,date,date,integer[],text)'::regprocedure)
      ilike '%_ta_assert_employee_pattern_effective_date_v61417%' then 'PASS' else 'FAIL' end,
    'Work Pattern effective date still follows System Period'

  union all
  select 5,'no_position_force_in_writer',
    case when pg_get_functiondef('public.ta_assign_employee_work_pattern_v61418(text,text,text,date,date,integer[],text)'::regprocedure)
      not ilike '%_ta_employee_position_policy_v61417%'
      and pg_get_functiondef('public.ta_assign_employee_work_pattern_v61418(text,text,text,date,date,integer[],text)'::regprocedure)
      not ilike '%forced_pattern_code%'
      then 'PASS' else 'FAIL' end,
    'No position can force TECH_5D / TECH_6D during save'

  union all
  select 6,'weekly_off_from_work_pattern',
    case when pg_get_functiondef('public.ta_assign_employee_work_pattern_v61418(text,text,text,date,date,integer[],text)'::regprocedure)
      ilike '%ta_work_patterns%weekly_off_dows%'
      then 'PASS' else 'FAIL' end,
    'Weekly off is read from configured Work Pattern'

  union all
  select 7,'legacy_writer_neutralized',
    case when pg_get_functiondef('public.ta_assign_employee_work_pattern_v61417(text,text,text,date,date,integer[],text)'::regprocedure)
      ilike '%ta_assign_employee_work_pattern_v61418%'
      then 'PASS' else 'FAIL' end,
    'Old V6.14.17 writer delegates to config-driven writer'

  union all
  select 8,'shared_resolver_no_position_policy',
    case when pg_get_functiondef('public.ta_resolve_employee_work_pattern_v651(text,date)'::regprocedure)
      not ilike '%ผู้จัดการแผนก%'
      and pg_get_functiondef('public.ta_resolve_employee_work_pattern_v651(text,date)'::regprocedure)
      not ilike '%ช่างเทคนิค%'
      then 'PASS' else 'FAIL' end,
    'Shared resolver does not infer pattern from position name'

  union all
  select 9,'schedule_grid_no_position_policy',
    case when pg_get_functiondef('public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])'::regprocedure)
      not ilike '%ผู้จัดการแผนก%'
      and pg_get_functiondef('public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])'::regprocedure)
      not ilike '%ช่างเทคนิค%'
      then 'PASS' else 'FAIL' end,
    'Main schedule grid uses the same non-position fallback'

  union all
  select 10,'effective_date_guard_available',
    case when to_regprocedure('public.ta_get_employee_pattern_effective_guard_v61417(date)') is not null
      and to_regprocedure('public._ta_assert_employee_pattern_effective_date_v61417(date)') is not null
      then 'PASS' else 'FAIL' end,
    'System Period effective-date guard remains available'

  union all
  select 11,'default_shift_validator_available',
    case when to_regprocedure('public._ta_validate_employee_default_shift_v61416(text,text)') is not null then 'PASS' else 'FAIL' end,
    '5D/6D DAY/NIGHT shift mapping validator remains available'
)
select seq,check_name,result,detail from checks order by seq;

-- ตรวจค่าที่ระบบจะใช้จริงจากหน้ากำหนดรูปแบบการทำงาน
select
  pattern_code,
  pattern_name,
  work_days_per_week,
  weekly_off_dows,
  default_start_time,
  default_end_time,
  is_active
from public.ta_work_patterns
where upper(trim(pattern_code)) in ('TECH_5D','TECH_6D')
order by pattern_code;

-- ตรวจสถานะรอบระบบที่ควบคุมวันเริ่มใช้
select
  period_month,
  schedule_edit_deadline,
  attendance_certify_deadline,
  schedule_open,
  certification_open,
  case
    when not schedule_open or public._ta_bangkok_today_v6110()>schedule_edit_deadline
      or not certification_open or public._ta_bangkok_today_v6110()>attendance_certify_deadline
      then 'CLOSED_FOR_WORK_PATTERN'
    else 'OPEN_FOR_WORK_PATTERN'
  end as work_pattern_status
from public.ta_system_periods
order by period_month desc
limit 12;
