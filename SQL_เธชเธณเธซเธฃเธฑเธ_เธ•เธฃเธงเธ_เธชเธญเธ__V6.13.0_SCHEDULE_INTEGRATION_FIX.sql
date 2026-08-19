-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.13.0
-- Schedule Integration Fix
-- ============================================================================

with checks as (
  select 1 as seq,'schedule_grid_rpc'::text as check_name,
    case when to_regprocedure('public.ta_get_schedule_range_light_v6130(date,date,text,text,text[],text[])') is not null then 'PASS' else 'FAIL' end as result,
    'ta_get_schedule_range_light_v6130'::text as detail

  union all
  select 2,'monthly_personal_rpc',
    case when to_regprocedure('public.ta_get_employee_month_schedule_v6130(text,date,date)') is not null then 'PASS' else 'FAIL' end,
    'ta_get_employee_month_schedule_v6130'

  union all
  select 3,'smart_off_basis_rpc',
    case when to_regprocedure('public.ta_get_off_shift_basis_v6130(text,date)') is not null then 'PASS' else 'FAIL' end,
    'ta_get_off_shift_basis_v6130'

  union all
  select 4,'bulk_smart_off_rpc',
    case when to_regprocedure('public.ta_sync_bulk_schedule_rules_v6130(jsonb)') is not null then 'PASS' else 'FAIL' end,
    'ta_sync_bulk_schedule_rules_v6130'

  union all
  select 5,'schedule_grid_has_start_date',
    case when exists(
      select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='ta_get_schedule_range_light_v6130'
        and pg_get_function_result(p.oid) ilike '%start_date date%'
        and pg_get_function_result(p.oid) ilike '%resign_date date%'
    ) then 'PASS' else 'FAIL' end,
    'Grid ต้องส่ง start_date / resign_date'

  union all
  select 6,'core_shift_pattern_compatibility',
    case when
      exists(select 1 from public.shift_master where upper(trim(shift_code))='STD'  and 'TECH_5D'=any(applicable_pattern_codes))
      and exists(select 1 from public.shift_master where upper(trim(shift_code))='S134' and 'TECH_5D'=any(applicable_pattern_codes))
      and exists(select 1 from public.shift_master where upper(trim(shift_code))='S043' and 'TECH_6D'=any(applicable_pattern_codes))
      and exists(select 1 from public.shift_master where upper(trim(shift_code))='S135' and 'TECH_6D'=any(applicable_pattern_codes))
    then 'PASS' else 'FAIL' end,
    'STD/S134=TECH_5D และ S043/S135=TECH_6D'

  union all
  select 7,'empty_shift_pattern_codes',
    case when not exists(
      select 1 from public.shift_master
      where coalesce(is_workday,true) and coalesce(cardinality(applicable_pattern_codes),0)=0
    ) then 'PASS' else 'FAIL' end,
    'กะทำงานต้องไม่เหลือ applicable_pattern_codes ว่าง'

  union all
  select 8,'core_off_mapping',
    case when
      exists(select 1 from public.ta_shift_schedule_rules_v6123 where upper(trim(shift_code))='STD' and upper(trim(paired_off_shift_code))='OSTD')
      and exists(select 1 from public.ta_shift_schedule_rules_v6123 where upper(trim(shift_code))='S043' and upper(trim(paired_off_shift_code))='OS043')
      and exists(select 1 from public.ta_shift_schedule_rules_v6123 where upper(trim(shift_code))='S134' and upper(trim(paired_off_shift_code))='OS134')
      and exists(select 1 from public.ta_shift_schedule_rules_v6123 where upper(trim(shift_code))='S135' and upper(trim(paired_off_shift_code))='OS135')
    then 'PASS' else 'FAIL' end,
    'STD/S043/S134/S135 ต้องจับคู่ OFF ครบ'
)
select * from checks order by seq;

-- รายละเอียด Shift Set Up ที่เกี่ยวข้อง
select
  s.shift_code,
  s.shift_name,
  s.start_time,
  s.end_time,
  s.is_night_shift,
  s.is_workday,
  s.applicable_pattern_codes,
  coalesce(r.is_enabled,true) as schedule_enabled,
  coalesce(r.scope_mode,'ALL') as scope_mode,
  r.paired_off_shift_code
from public.shift_master s
left join public.ta_shift_schedule_rules_v6123 r
  on upper(trim(r.shift_code))=upper(trim(s.shift_code))
where upper(trim(s.shift_code)) in ('STD','S043','S134','S135','OSTD','OS043','OS134','OS135')
order by case upper(trim(s.shift_code))
  when 'STD' then 1 when 'OSTD' then 2
  when 'S043' then 3 when 'OS043' then 4
  when 'S134' then 5 when 'OS134' then 6
  when 'S135' then 7 when 'OS135' then 8 else 99 end;
