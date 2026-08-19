-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.13.2
-- Assignment Shift Source Fix
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
  if to_regclass('public.ta_shift_schedule_rule_scopes_v6123') is null then
    raise exception 'MISSING_TABLE: ta_shift_schedule_rule_scopes_v6123';
  end if;
  if to_regprocedure('public.ta_v6120_can_schedule()') is null then
    raise exception 'MISSING_FUNCTION: ta_v6120_can_schedule';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Canonical working shifts
--    กะหลัก 4 รหัสเป็นกะทำงานแน่นอน และแบ่ง Work Pattern ตาม Business Rule
-- ---------------------------------------------------------------------------
insert into public.ta_shift_schedule_rules_v6123(
  shift_code,is_enabled,scope_mode,paired_off_shift_code
)
select x.shift_code,true,'ALL',x.off_code
from (values
  ('STD','OSTD'),
  ('S043','OS043'),
  ('S134','OS134'),
  ('S135','OS135')
) x(shift_code,off_code)
where exists (
  select 1 from public.shift_master s
  where upper(trim(s.shift_code))=x.shift_code
)
on conflict(shift_code) do nothing;

update public.shift_master s
set
  is_workday = true,
  is_night_shift = case
    when upper(trim(s.shift_code)) in ('S134','S135') then true
    else false
  end,
  applicable_pattern_codes = case
    when upper(trim(s.shift_code)) in ('STD','S134')
      then array['TECH_5D']::text[]
    else array['TECH_6D']::text[]
  end,
  -- หาก Set Up ของกะเปิดใช้งาน ให้ Shift Master พร้อมใช้งานด้วย
  is_active = case
    when coalesce(r.is_enabled,true) then true
    else coalesce(s.is_active,true)
  end,
  updated_at = now()
from public.ta_shift_schedule_rules_v6123 r
where upper(trim(r.shift_code)) = upper(trim(s.shift_code))
  and upper(trim(s.shift_code)) in ('STD','S043','S134','S135');

-- กะวันหยุดคู่กันต้องเป็น NON-WORKDAY และใช้ Work Pattern เดียวกับกะต้นทาง
update public.shift_master o
set
  is_workday = false,
  is_night_shift = case
    when upper(trim(o.shift_code)) in ('OS134','OS135') then true
    else false
  end,
  break_minutes = 0,
  applicable_pattern_codes = w.applicable_pattern_codes,
  updated_at = now()
from public.ta_shift_schedule_rules_v6123 r
join public.shift_master w
  on upper(trim(w.shift_code)) = upper(trim(r.shift_code))
where r.paired_off_shift_code is not null
  and upper(trim(o.shift_code)) = upper(trim(r.paired_off_shift_code))
  and upper(trim(w.shift_code)) in ('STD','S043','S134','S135');

-- ---------------------------------------------------------------------------
-- 2) Authoritative Shift Options RPC for Assignment Popup
--    ใช้ Work Pattern + Department Scope จาก Set Up เป็นแหล่งเดียว
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_assignment_shift_options_v6132(
  p_pattern_code text,
  p_department text default null
)
returns table(
  shift_code text,
  shift_name text,
  start_time time,
  end_time time,
  is_night_shift boolean,
  is_workday boolean,
  break_minutes integer,
  display_order integer,
  is_active boolean,
  applicable_pattern_codes text[],
  default_pattern_codes text[],
  rule_enabled boolean,
  scope_mode text,
  scope_allowed boolean
)
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_pattern text := upper(trim(coalesce(p_pattern_code,'')));
  v_department text := trim(coalesce(p_department,''));
begin
  if not public.ta_v6120_can_schedule() then
    raise exception 'SCHEDULE_PERMISSION_DENIED';
  end if;

  if v_pattern not in ('TECH_5D','TECH_6D') then
    raise exception 'INVALID_WORK_PATTERN: %',coalesce(p_pattern_code,'');
  end if;

  return query
  with source as (
    select
      upper(trim(s.shift_code)) as code,
      s.shift_name,
      s.start_time,
      s.end_time,
      case
        when upper(trim(s.shift_code)) in ('S134','S135') then true
        when upper(trim(s.shift_code)) in ('STD','S043') then false
        else coalesce(s.is_night_shift,false)
      end as night,
      case
        when upper(trim(s.shift_code)) in ('STD','S043','S134','S135') then true
        else coalesce(s.is_workday,true)
      end as workday,
      coalesce(s.break_minutes,0) as break_minutes,
      coalesce(s.display_order,s.sort_order,0) as display_order,
      coalesce(s.is_active,true) as master_active,
      case
        when upper(trim(s.shift_code)) in ('STD','S134')
          then array['TECH_5D']::text[]
        when upper(trim(s.shift_code)) in ('S043','S135')
          then array['TECH_6D']::text[]
        when coalesce(cardinality(s.applicable_pattern_codes),0)=0
          then array['TECH_5D','TECH_6D']::text[]
        else s.applicable_pattern_codes
      end as patterns,
      coalesce(r.is_enabled,true) as rule_enabled,
      upper(trim(coalesce(r.scope_mode,'ALL'))) as scope_mode,
      coalesce(
        (
          select array_agg(d.pattern_code order by d.pattern_code)
          from public.ta_work_pattern_default_shifts d
          where upper(trim(d.shift_code))=upper(trim(s.shift_code))
        ),
        array[]::text[]
      ) as default_patterns,
      case
        when upper(trim(coalesce(r.scope_mode,'ALL')))='ALL' then true
        when upper(trim(coalesce(r.scope_mode,'ALL')))='SELECTED' then exists (
          select 1
          from public.ta_shift_schedule_rule_scopes_v6123 sc
          where upper(trim(sc.shift_code))=upper(trim(s.shift_code))
            and upper(trim(sc.scope_type))='DEPARTMENT'
            and trim(sc.scope_value)=v_department
        )
        else false
      end as allowed_scope
    from public.shift_master s
    left join public.ta_shift_schedule_rules_v6123 r
      on upper(trim(r.shift_code))=upper(trim(s.shift_code))
    where coalesce(s.note,'') not like '%[SYSTEM_GENERATED_V6120]%'
  )
  select
    x.code::text,
    x.shift_name::text,
    x.start_time,
    x.end_time,
    x.night,
    x.workday,
    x.break_minutes,
    x.display_order,
    x.master_active,
    x.patterns,
    x.default_patterns,
    x.rule_enabled,
    x.scope_mode::text,
    x.allowed_scope
  from source x
  where x.workday
    and x.master_active
    and x.rule_enabled
    and x.allowed_scope
    and v_pattern = any(x.patterns)
  order by x.display_order,x.code;
end;
$$;

revoke all on function public.ta_get_assignment_shift_options_v6132(text,text) from public;
grant execute on function public.ta_get_assignment_shift_options_v6132(text,text) to authenticated;

analyze public.shift_master;
notify pgrst, 'reload schema';
commit;
