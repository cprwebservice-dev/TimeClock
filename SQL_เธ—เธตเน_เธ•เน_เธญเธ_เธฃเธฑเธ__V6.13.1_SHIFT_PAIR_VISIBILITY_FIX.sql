-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.13.1
-- Shift Pair Visibility Fix
-- ============================================================================

begin;
set local statement_timeout = '0';

do $$
begin
  if to_regclass('public.shift_master') is null then
    raise exception 'MISSING_TABLE: shift_master';
  end if;
  if to_regclass('public.ta_shift_schedule_rules_v6123') is null then
    raise exception 'MISSING_TABLE: ta_shift_schedule_rules_v6123';
  end if;
  if to_regprocedure('public.ta_get_schedule_range_light_v6130(date,date,text,text,text[],text[])') is null then
    raise exception 'MISSING_V6_13_0: กรุณารัน SQL V6.13.0 ก่อน';
  end if;
end;
$$;

-- 1) Core working-shift pairs
-- ยึด Shift Code เป็น Business Mapping ไม่ผูกกับเวลา
-- เพื่อให้ HR Admin สามารถแก้เวลาใน Shift Master ภายหลังได้โดย Pattern ไม่หลุด
update public.shift_master
set applicable_pattern_codes = array['TECH_5D']::text[],
    updated_at = now()
where upper(trim(shift_code)) in ('STD','S134')
  and coalesce(is_workday,true) = true;

update public.shift_master
set applicable_pattern_codes = array['TECH_6D']::text[],
    updated_at = now()
where upper(trim(shift_code)) in ('S043','S135')
  and coalesce(is_workday,true) = true;

-- 2) Keep paired day-off shifts on the same Work Pattern as their working shift
update public.shift_master off_shift
set applicable_pattern_codes = work_shift.applicable_pattern_codes,
    updated_at = now()
from public.ta_shift_schedule_rules_v6123 rule
join public.shift_master work_shift
  on upper(trim(work_shift.shift_code)) = upper(trim(rule.shift_code))
where rule.paired_off_shift_code is not null
  and upper(trim(off_shift.shift_code)) = upper(trim(rule.paired_off_shift_code))
  and coalesce(off_shift.is_workday,true) = false
  and upper(trim(work_shift.shift_code)) in ('STD','S043','S134','S135');

-- 3) Legacy/custom working shifts with empty Pattern remain usable for both patterns
update public.shift_master
set applicable_pattern_codes = array['TECH_5D','TECH_6D']::text[],
    updated_at = now()
where coalesce(is_workday,true) = true
  and coalesce(cardinality(applicable_pattern_codes),0) = 0;

analyze public.shift_master;
notify pgrst, 'reload schema';
commit;
