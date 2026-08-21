-- ==========================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.30
-- Mixed 5D / 6D Smart Quick Shift Consistency
--
-- เป้าหมาย
-- 1) ปุ่มลัดเหนือ "ตารางกะรายบุคคล • 15 วัน / เต็มเดือน" สามารถเลือก
--    พนักงาน 5 วันและ 6 วันพร้อมกันได้
-- 2) Core Shift Mapping ใช้มาตรฐานเดียวกันทั้ง Frontend / Backend
--      TECH_5D : STD (เช้า), S134 (ดึก)
--      TECH_6D : S043 (เช้า), S135 (ดึก)
-- 3) Paired day-off ของ Core Shift ใช้ Work Pattern เดียวกับกะฐาน
-- 4) ไม่ลดทอน Permission / System Period / Day-off Quota / 6h / 48h Guards
-- ==========================================================================

begin;
set local statement_timeout = '0';
select pg_advisory_xact_lock(hashtext('timeclock_v61430_mixed_pattern_quick_shift'));

-- --------------------------------------------------------------------------
-- 1) Preflight
-- --------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.shift_master') is null then
    raise exception 'MISSING_TABLE: shift_master';
  end if;

  if to_regprocedure(
    'public.ta_resolve_employee_work_pattern_v651(text,date)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_resolve_employee_work_pattern_v651';
  end if;

  if to_regprocedure(
    'public._ta_validate_shift_pattern_v651(text,date,text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_validate_shift_pattern_v651';
  end if;
end;
$$;

-- --------------------------------------------------------------------------
-- 2) Repair canonical Shift Master pattern metadata.
--    These are stable business mappings used throughout the application.
-- --------------------------------------------------------------------------
update public.shift_master
set applicable_pattern_codes = array['TECH_5D']::text[]
where upper(trim(shift_code)) in ('STD','S134','OSTD','OS134')
  and applicable_pattern_codes is distinct from array['TECH_5D']::text[];

update public.shift_master
set applicable_pattern_codes = array['TECH_6D']::text[]
where upper(trim(shift_code)) in ('S043','S135','OS043','OS135')
  and applicable_pattern_codes is distinct from array['TECH_6D']::text[];

-- HOL / LV are not tied to a 5D/6D working-shift family.
update public.shift_master
set applicable_pattern_codes = array['TECH_5D','TECH_6D']::text[]
where upper(trim(shift_code)) in ('HOL','LV','OFF')
  and applicable_pattern_codes is distinct from array['TECH_5D','TECH_6D']::text[];

-- --------------------------------------------------------------------------
-- 3) Canonical backend Work Pattern validation.
--    Core codes are validated from stable business mapping first.
--    Other custom shifts continue to use shift_master.applicable_pattern_codes.
-- --------------------------------------------------------------------------
create or replace function public._ta_validate_shift_pattern_v651(
  p_emp_code text,
  p_work_date date,
  p_shift_code text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pattern text;
  v_shift public.shift_master%rowtype;
  v_code text := upper(trim(coalesce(p_shift_code,'')));
  v_required_pattern text;
begin
  select upper(trim(c.pattern_code))
  into v_pattern
  from public.ta_resolve_employee_work_pattern_v651(
    p_emp_code,
    p_work_date
  ) c;

  if v_pattern is null then
    raise exception 'EMPLOYEE_WORK_PATTERN_NOT_RESOLVED';
  end if;

  select *
  into v_shift
  from public.shift_master s
  where upper(trim(s.shift_code)) = v_code
    and coalesce(s.is_active,true);

  if not found then
    raise exception 'SHIFT_NOT_FOUND_OR_INACTIVE';
  end if;

  -- Stable core business mapping.
  v_required_pattern := case
    when v_code in ('STD','S134','OSTD','OS134') then 'TECH_5D'
    when v_code in ('S043','S135','OS043','OS135') then 'TECH_6D'
    else null
  end;

  if v_required_pattern is not null then
    if v_pattern <> v_required_pattern then
      raise exception
        'SHIFT_NOT_APPLICABLE_TO_WORK_PATTERN: shift % is not allowed for %',
        v_shift.shift_code,
        v_pattern;
    end if;
    return v_pattern;
  end if;

  -- Holiday / Leave / legacy OFF can be used for either Work Pattern.
  if v_code in ('HOL','LV','OFF') then
    return v_pattern;
  end if;

  -- Custom Shift Master rows preserve their configured applicability.
  if not (
    v_pattern = any(
      coalesce(
        v_shift.applicable_pattern_codes,
        array[]::text[]
      )
    )
  ) then
    raise exception
      'SHIFT_NOT_APPLICABLE_TO_WORK_PATTERN: shift % is not allowed for %',
      v_shift.shift_code,
      v_pattern;
  end if;

  return v_pattern;
end;
$$;

revoke all on function public._ta_validate_shift_pattern_v651(
  text,date,text
) from public;

-- Existing guarded writers call this helper internally. No writer replacement
-- is required, so V6.14.24 bulk timeout fix and all later guards remain intact.

notify pgrst, 'reload schema';
commit;
