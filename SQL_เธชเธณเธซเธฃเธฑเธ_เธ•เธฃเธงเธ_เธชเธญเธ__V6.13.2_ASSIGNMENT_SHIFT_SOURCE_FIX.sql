-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.13.2
-- Assignment Shift Source Fix
-- ============================================================================

-- 1) Core Shift Master ต้องพร้อมใช้งาน
with expected as (
  select * from (values
    ('STD',  false, array['TECH_5D']::text[]),
    ('S134', true,  array['TECH_5D']::text[]),
    ('S043', false, array['TECH_6D']::text[]),
    ('S135', true,  array['TECH_6D']::text[])
  ) v(shift_code,expected_night,expected_patterns)
)
select
  e.shift_code,
  s.shift_name,
  s.start_time,
  s.end_time,
  s.is_active,
  s.is_workday,
  s.is_night_shift,
  s.applicable_pattern_codes,
  coalesce(r.is_enabled,true) as rule_enabled,
  coalesce(r.scope_mode,'ALL') as scope_mode,
  case
    when s.shift_code is null then 'FAIL: NOT FOUND'
    when coalesce(s.is_active,false)=false then 'FAIL: INACTIVE'
    when coalesce(s.is_workday,false)=false then 'FAIL: NOT WORK SHIFT'
    when coalesce(s.is_night_shift,false) is distinct from e.expected_night then 'FAIL: NIGHT FLAG'
    when s.applicable_pattern_codes is distinct from e.expected_patterns then 'FAIL: PATTERN'
    when coalesce(r.is_enabled,true)=false then 'CHECK: SET UP DISABLED'
    else 'PASS'
  end as result
from expected e
left join public.shift_master s
  on upper(trim(s.shift_code))=e.shift_code
left join public.ta_shift_schedule_rules_v6123 r
  on upper(trim(r.shift_code))=e.shift_code
order by e.shift_code;

-- 2) Function ต้องมีอยู่และ Authenticated Execute ได้
select
  case
    when to_regprocedure('public.ta_get_assignment_shift_options_v6132(text,text)') is not null
     and has_function_privilege(
       'authenticated',
       'public.ta_get_assignment_shift_options_v6132(text,text)',
       'EXECUTE'
     )
    then 'PASS'
    else 'FAIL'
  end as assignment_shift_options_rpc;

-- 3) ตรวจ Set Up Scope ของกะหลัก
select
  upper(trim(s.shift_code)) as shift_code,
  coalesce(r.is_enabled,true) as rule_enabled,
  coalesce(r.scope_mode,'ALL') as scope_mode,
  coalesce(
    (
      select array_agg(sc.scope_value order by sc.scope_value)
      from public.ta_shift_schedule_rule_scopes_v6123 sc
      where upper(trim(sc.shift_code))=upper(trim(s.shift_code))
        and upper(trim(sc.scope_type))='DEPARTMENT'
    ),
    array[]::text[]
  ) as selected_departments,
  case
    when coalesce(r.is_enabled,true)=false then 'CHECK: DISABLED'
    when upper(trim(coalesce(r.scope_mode,'ALL')))='ALL' then 'PASS: ALL DEPARTMENTS'
    when upper(trim(coalesce(r.scope_mode,'ALL')))='SELECTED' then 'CHECK: SELECTED DEPARTMENTS'
    else 'FAIL: INVALID SCOPE'
  end as scope_result
from public.shift_master s
left join public.ta_shift_schedule_rules_v6123 r
  on upper(trim(r.shift_code))=upper(trim(s.shift_code))
where upper(trim(s.shift_code)) in ('STD','S043','S134','S135')
order by upper(trim(s.shift_code));

-- 4) ตรวจคู่กะที่ควรเห็นตาม Work Pattern
select
  'TECH_5D' as pattern_code,
  string_agg(upper(trim(s.shift_code)),', ' order by upper(trim(s.shift_code)))
    filter (where upper(trim(s.shift_code)) in ('STD','S134')) as expected_visible_core,
  'STD, S134' as expected
from public.shift_master s
union all
select
  'TECH_6D',
  string_agg(upper(trim(s.shift_code)),', ' order by upper(trim(s.shift_code)))
    filter (where upper(trim(s.shift_code)) in ('S043','S135')),
  'S043, S135'
from public.shift_master s;
