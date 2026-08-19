-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.13.1
-- Shift Pair Visibility Fix
-- ============================================================================

-- 1) Core shift compatibility: ต้อง PASS
with expected as (
  select * from (values
    ('STD',  array['TECH_5D']::text[]),
    ('S134', array['TECH_5D']::text[]),
    ('S043', array['TECH_6D']::text[]),
    ('S135', array['TECH_6D']::text[])
  ) v(shift_code,expected_patterns)
), checks as (
  select
    e.shift_code,
    s.shift_name,
    s.start_time,
    s.end_time,
    s.is_active,
    s.is_workday,
    s.is_night_shift,
    s.applicable_pattern_codes,
    e.expected_patterns,
    case
      when s.shift_code is null then 'FAIL: NOT FOUND'
      when coalesce(s.is_active,false) = false then 'FAIL: INACTIVE'
      when coalesce(s.is_workday,true) = false then 'FAIL: NOT WORK SHIFT'
      when s.applicable_pattern_codes is distinct from e.expected_patterns then 'FAIL: PATTERN MISMATCH'
      else 'PASS'
    end as result
  from expected e
  left join public.shift_master s
    on upper(trim(s.shift_code)) = e.shift_code
)
select * from checks order by shift_code;

-- 2) Scope + paired OFF setup ของ 4 กะหลัก
select
  upper(trim(s.shift_code)) as shift_code,
  s.shift_name,
  s.applicable_pattern_codes,
  coalesce(r.is_enabled,true) as rule_enabled,
  coalesce(r.scope_mode,'ALL') as scope_mode,
  r.paired_off_shift_code,
  os.applicable_pattern_codes as paired_off_patterns,
  case
    when coalesce(r.is_enabled,true) = false then 'CHECK: RULE DISABLED'
    when coalesce(r.scope_mode,'ALL') = 'ALL' then 'PASS: ALL DEPARTMENTS'
    else 'CHECK: SELECTED DEPARTMENTS'
  end as scope_result,
  case
    when r.paired_off_shift_code is null then 'CHECK: NO OFF MAPPING'
    when os.shift_code is null then 'FAIL: OFF NOT FOUND'
    when coalesce(os.is_workday,true) = true then 'FAIL: PAIRED SHIFT IS WORKDAY'
    when os.applicable_pattern_codes is distinct from s.applicable_pattern_codes then 'FAIL: OFF PATTERN MISMATCH'
    else 'PASS'
  end as off_mapping_result
from public.shift_master s
left join public.ta_shift_schedule_rules_v6123 r
  on upper(trim(r.shift_code)) = upper(trim(s.shift_code))
left join public.shift_master os
  on upper(trim(os.shift_code)) = upper(trim(r.paired_off_shift_code))
where upper(trim(s.shift_code)) in ('STD','S043','S134','S135')
order by case upper(trim(s.shift_code))
  when 'STD' then 1
  when 'S134' then 2
  when 'S043' then 3
  when 'S135' then 4
  else 9 end;
