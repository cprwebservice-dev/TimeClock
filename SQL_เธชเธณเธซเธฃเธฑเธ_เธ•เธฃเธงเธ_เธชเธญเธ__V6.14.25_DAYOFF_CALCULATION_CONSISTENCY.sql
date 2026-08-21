-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.25
-- Day-off Calculation Consistency
-- ============================================================================

with checks as (
  select 1 as seq,'canonical_work_pattern_resolver'::text as check_name,
    case when to_regprocedure('public.ta_resolve_employee_work_pattern_v651(text,date)') is not null then 'PASS' else 'FAIL' end as result,
    'Work Pattern resolver exists'::text as detail

  union all
  select 2,'resolver_has_no_position_pc_force',
    case when coalesce((
      select pg_get_functiondef(p.oid) not ilike '%manager_position_pattern%'
         and pg_get_functiondef(p.oid) not ilike '%regexp_replace%pc%'
         and pg_get_functiondef(p.oid) not ilike '%override_weekly_off_dows%'
      from pg_proc p where p.oid=to_regprocedure('public.ta_resolve_employee_work_pattern_v651(text,date)')
    ),false) then 'PASS' else 'FAIL' end,
    'No position / PC / individual weekly-off override can force the configured Work Pattern'

  union all
  select 3,'off_basis_read_v61425',
    case when to_regprocedure('public.ta_get_off_shift_basis_read_v61425(text,date)') is not null then 'PASS' else 'FAIL' end,
    'Read-only latest-work-shift day-off resolver exists'

  union all
  select 4,'off_basis_60_day_cross_month',
    case when coalesce((
      select pg_get_functiondef(p.oid) ilike '%v_lookback_days integer := 60%'
         and pg_get_functiondef(p.oid) ilike '%generate_series%'
      from pg_proc p where p.oid=to_regprocedure('public.ta_get_off_shift_basis_read_v61425(text,date)')
    ),false) then 'PASS' else 'FAIL' end,
    'Paired day-off basis searches up to 60 days across months'

  union all
  select 5,'off_basis_no_schedule_grid_recursion',
    case when coalesce((
      select pg_get_functiondef(p.oid) not ilike '%ta_get_schedule_range_light_v6134%'
         and pg_get_functiondef(p.oid) not ilike '%ta_get_schedule_range_light_v61425%'
      from pg_proc p where p.oid=to_regprocedure('public.ta_get_off_shift_basis_read_v61425(text,date)')
    ),false) then 'PASS' else 'FAIL' end,
    'Day-off basis is independent from Schedule Grid (no recursion)'

  union all
  select 6,'popup_bulk_basis_v61425',
    case when to_regprocedure('public.ta_get_off_shift_basis_v61425(text,date)') is not null then 'PASS' else 'FAIL' end,
    'Popup/Bulk resolver exists and can create HOUR_BASED dynamic off code only when needed'

  union all
  select 7,'legacy_v6135_delegates_v61425',
    case when coalesce((
      select pg_get_functiondef(p.oid) ilike '%ta_get_off_shift_basis_v61425%'
      from pg_proc p where p.oid=to_regprocedure('public.ta_get_off_shift_basis_v6135(text,date)')
    ),false) then 'PASS' else 'FAIL' end,
    'Old Popup/Bulk entry point delegates to canonical V6.14.25'

  union all
  select 8,'dayoff_balance_v61425',
    case when to_regprocedure('public.ta_get_dayoff_balance_v61425(text,date)') is not null then 'PASS' else 'FAIL' end,
    'Config-driven day-off quota balance exists'

  union all
  select 9,'dayoff_balance_uses_work_pattern',
    case when coalesce((
      select pg_get_functiondef(p.oid) ilike '%ta_resolve_employee_work_pattern_v651%'
         and pg_get_functiondef(p.oid) ilike '%weekly_off_dows%'
         and pg_get_functiondef(p.oid) not ilike '%manager_weekly_off_dows%'
         and pg_get_functiondef(p.oid) not ilike '%manager_position_pattern%'
      from pg_proc p where p.oid=to_regprocedure('public.ta_get_dayoff_balance_v61425(text,date)')
    ),false) then 'PASS' else 'FAIL' end,
    'Quota uses monthly Work Pattern weekly_off_dows, not position policy'

  union all
  select 10,'legacy_balance_delegates_v61425',
    case when coalesce((
      select pg_get_functiondef(p.oid) ilike '%ta_get_dayoff_balance_v61425%'
      from pg_proc p where p.oid=to_regprocedure('public.ta_get_dayoff_balance_v6134(text,date)')
    ),false) then 'PASS' else 'FAIL' end,
    'V6.14.3 hard guards inherit the new balance through V6.13.4 compatibility name'

  union all
  select 11,'quota_consumption_config_driven',
    case when coalesce((
      select pg_get_functiondef(p.oid) ilike '%ta_resolve_employee_work_pattern_v651%'
         and pg_get_functiondef(p.oid) ilike '%weekly_off_dows%'
         and pg_get_functiondef(p.oid) not ilike '%manager_weekly_off_dows%'
         and pg_get_functiondef(p.oid) not ilike '%manager_position_pattern%'
      from pg_proc p where p.oid=to_regprocedure('public._ta_dayoff_consumes_quota_v6142(text,date,text)')
    ),false) then 'PASS' else 'FAIL' end,
    'Single/Bulk day-off hard guard uses the same Work Pattern rule'

  union all
  select 12,'schedule_grid_v61425',
    case when to_regprocedure('public.ta_get_schedule_range_light_v61425(date,date,text,text,text[],text[])') is not null then 'PASS' else 'FAIL' end,
    'Canonical Person/Team/Time Schedule Grid exists'

  union all
  select 13,'schedule_grid_uses_latest_shift_dayoff',
    case when coalesce((
      select pg_get_functiondef(p.oid) ilike '%ta_get_off_shift_basis_read_v61425%'
         and pg_get_functiondef(p.oid) ilike '%weekly_off_dows%'
      from pg_proc p where p.oid=to_regprocedure('public.ta_get_schedule_range_light_v61425(date,date,text,text,text[],text[])')
    ),false) then 'PASS' else 'FAIL' end,
    'Natural weekly off is paired from latest effective work shift'

  union all
  select 14,'legacy_grid_delegates_v61425',
    case when coalesce((
      select pg_get_functiondef(p.oid) ilike '%ta_get_schedule_range_light_v61425%'
      from pg_proc p where p.oid=to_regprocedure('public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])')
    ),false) then 'PASS' else 'FAIL' end,
    'Monthly Personal and old readers receive the same canonical Schedule Grid'

  union all
  select 15,'legacy_off_disabled',
    case when not exists(
      select 1 from public.shift_master s
      where upper(trim(s.shift_code))='OFF' and coalesce(s.is_active,true)
    ) then 'PASS' else 'FAIL' end,
    'Legacy OFF remains disabled'

  union all
  select 16,'canonical_pairs_valid',
    case when not exists(
      select 1
      from (values ('STD','OSTD'),('S043','OS043'),('S134','OS134'),('S135','OS135')) x(work_code,off_code)
      left join public.ta_shift_schedule_rules_v6123 r
        on upper(trim(r.shift_code))=x.work_code
      left join public.shift_master o
        on upper(trim(o.shift_code))=upper(trim(r.paired_off_shift_code))
      where upper(trim(coalesce(r.paired_off_shift_code,'')))<>x.off_code
         or o.shift_code is null
         or coalesce(o.is_active,false)=false
         or coalesce(o.is_workday,true)=true
    ) then 'PASS' else 'FAIL' end,
    'STD→OSTD, S043→OS043, S134→OS134, S135→OS135 are active non-workday mappings'

  union all
  select 17,'work_patterns_have_weekly_off',
    case when not exists(
      select 1 from public.ta_work_patterns p
      where upper(trim(p.pattern_code)) in ('TECH_5D','TECH_6D')
        and (p.weekly_off_dows is null or cardinality(p.weekly_off_dows)=0)
    ) then 'PASS' else 'FAIL' end,
    'TECH_5D / TECH_6D have configured weekly_off_dows'

  union all
  select 18,'legacy_v6134_basis_delegates_v61425',
    case when coalesce((
      select pg_get_functiondef(p.oid) ilike '%ta_get_off_shift_basis_v61425%'
      from pg_proc p where p.oid=to_regprocedure('public.ta_get_off_shift_basis_v6134(text,date)')
    ),false) then 'PASS' else 'FAIL' end,
    'Old V6.13.4 Smart Day-off entry point also uses the canonical resolver'
)
select seq,check_name,result,detail
from checks
order by seq;

-- ค่ากำหนด Work Pattern ที่ใช้จริง
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

-- Mapping กะทำงาน -> กะวันหยุดคู่
select
  upper(trim(r.shift_code)) as work_shift,
  upper(trim(r.paired_off_shift_code)) as off_shift,
  o.start_time as off_start,
  o.end_time as off_end,
  o.is_workday,
  o.is_active
from public.ta_shift_schedule_rules_v6123 r
left join public.shift_master o
  on upper(trim(o.shift_code))=upper(trim(r.paired_off_shift_code))
where upper(trim(r.shift_code)) in ('STD','S043','S134','S135')
order by work_shift;
