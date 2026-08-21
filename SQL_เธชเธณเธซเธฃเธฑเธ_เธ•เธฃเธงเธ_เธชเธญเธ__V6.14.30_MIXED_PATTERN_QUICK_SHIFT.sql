-- ==========================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.30
-- Mixed 5D / 6D Smart Quick Shift Consistency
-- ==========================================================================

with checks as (
  select
    1 as seq,
    'validator_exists'::text as check_name,
    case when to_regprocedure(
      'public._ta_validate_shift_pattern_v651(text,date,text)'
    ) is not null then 'PASS' else 'FAIL' end as result

  union all
  select
    2,
    'validator_has_core_5d_mapping',
    case when pg_get_functiondef(
      'public._ta_validate_shift_pattern_v651(text,date,text)'::regprocedure
    ) ilike '%STD%S134%OSTD%OS134%TECH_5D%'
    then 'PASS' else 'FAIL' end

  union all
  select
    3,
    'validator_has_core_6d_mapping',
    case when pg_get_functiondef(
      'public._ta_validate_shift_pattern_v651(text,date,text)'::regprocedure
    ) ilike '%S043%S135%OS043%OS135%TECH_6D%'
    then 'PASS' else 'FAIL' end

  union all
  select
    4,
    'core_shift_master_5d',
    case when (
      select count(*)
      from public.shift_master s
      where upper(trim(s.shift_code)) in ('STD','S134')
        and coalesce(s.is_active,true)
    ) = 2
    and not exists (
      select 1
      from public.shift_master s
      where upper(trim(s.shift_code)) in ('STD','S134','OSTD','OS134')
        and coalesce(s.is_active,true)
        and coalesce(s.applicable_pattern_codes,array[]::text[])
            is distinct from array['TECH_5D']::text[]
    ) then 'PASS' else 'FAIL' end

  union all
  select
    5,
    'core_shift_master_6d',
    case when (
      select count(*)
      from public.shift_master s
      where upper(trim(s.shift_code)) in ('S043','S135')
        and coalesce(s.is_active,true)
    ) = 2
    and not exists (
      select 1
      from public.shift_master s
      where upper(trim(s.shift_code)) in ('S043','S135','OS043','OS135')
        and coalesce(s.is_active,true)
        and coalesce(s.applicable_pattern_codes,array[]::text[])
            is distinct from array['TECH_6D']::text[]
    ) then 'PASS' else 'FAIL' end

  union all
  select
    6,
    'bulk_writer_v61424_retained',
    case when to_regprocedure(
      'public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)'
    ) is not null
     and pg_get_functiondef(
      'public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)'::regprocedure
    ) ilike '%_ta_validate_shift_pattern_v651%'
    then 'PASS' else 'FAIL' end
)
select seq,check_name,result
from checks
order by seq;

-- ตรวจค่าจริงของ Core Shift Master
select
  upper(trim(shift_code)) as shift_code,
  shift_name,
  is_workday,
  applicable_pattern_codes
from public.shift_master
where upper(trim(shift_code)) in (
  'STD','S134','OSTD','OS134',
  'S043','S135','OS043','OS135',
  'HOL','LV','OFF'
)
order by shift_code;
