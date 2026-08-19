-- ==========================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.12.5
-- Schedule Consistency + Day-off Pattern + Calendar Performance
-- ต้องรันหลัง V6.12.4
-- ==========================================================================

begin;
set local statement_timeout = '0';

-- --------------------------------------------------------------------------
-- 1) กะวันหยุดที่จับคู่ ต้องใช้ Work Pattern เดียวกับกะทำงานต้นทาง
--    เนื่องจาก ta_assign_shift_*_v651 ตรวจ applicable_pattern_codes ทุก Shift Code
-- --------------------------------------------------------------------------
update public.shift_master off_shift
set
  start_time = work_shift.start_time,
  end_time = work_shift.end_time,
  is_workday = false,
  is_night_shift = (work_shift.end_time <= work_shift.start_time),
  break_minutes = 0,
  applicable_pattern_codes = coalesce(
    work_shift.applicable_pattern_codes,
    array['TECH_5D','TECH_6D']::text[]
  )
from public.ta_shift_schedule_rules_v6123 rule
join public.shift_master work_shift
  on upper(trim(work_shift.shift_code)) = upper(trim(rule.shift_code))
where rule.paired_off_shift_code is not null
  and upper(trim(off_shift.shift_code)) = upper(trim(rule.paired_off_shift_code))
  and coalesce(work_shift.is_workday,true) = true
  and coalesce(off_shift.is_workday,false) = false;

-- --------------------------------------------------------------------------
-- 2) เมื่อแก้กะทำงาน ให้กะวันหยุดคู่กัน Sync ทั้งเวลาและ Work Pattern
-- --------------------------------------------------------------------------
create or replace function public.ta_sync_paired_off_for_work_shift_v6124(
  p_shift_code text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_code text := upper(trim(coalesce(p_shift_code,'')));
  v_off text;
  v_start time;
  v_end time;
  v_patterns text[];
  v_off_workday boolean;
begin
  if not public.ta_v6120_is_hr_admin() then
    raise exception 'HR_ADMIN_REQUIRED';
  end if;
  if v_code='' then raise exception 'SHIFT_CODE_REQUIRED'; end if;

  select
    s.start_time,
    s.end_time,
    coalesce(s.applicable_pattern_codes,array['TECH_5D','TECH_6D']::text[])
  into v_start,v_end,v_patterns
  from public.shift_master s
  where upper(trim(s.shift_code))=v_code
    and coalesce(s.is_workday,true)=true
  limit 1;

  if not found then
    return jsonb_build_object('ok',true,'synced',false,'reason','WORK_SHIFT_NOT_FOUND');
  end if;

  select upper(trim(r.paired_off_shift_code))
  into v_off
  from public.ta_shift_schedule_rules_v6123 r
  where upper(trim(r.shift_code))=v_code
    and r.paired_off_shift_code is not null
  limit 1;

  if v_off is null then
    return jsonb_build_object('ok',true,'synced',false,'reason','NO_MAPPING');
  end if;

  select coalesce(s.is_workday,true)
  into v_off_workday
  from public.shift_master s
  where upper(trim(s.shift_code))=v_off
  limit 1;

  if not found then raise exception 'OFF_SHIFT_NOT_FOUND'; end if;
  if v_off_workday then raise exception 'PAIRED_SHIFT_MUST_BE_DAY_OFF'; end if;

  update public.shift_master
  set
    start_time=v_start,
    end_time=v_end,
    is_workday=false,
    is_night_shift=(v_end<=v_start),
    break_minutes=0,
    applicable_pattern_codes=v_patterns
  where upper(trim(shift_code))=v_off;

  return jsonb_build_object(
    'ok',true,
    'synced',true,
    'work_shift_code',v_code,
    'off_shift_code',v_off,
    'start_time',v_start,
    'end_time',v_end,
    'applicable_pattern_codes',to_jsonb(v_patterns)
  );
end;
$$;

grant execute on function public.ta_sync_paired_off_for_work_shift_v6124(text)
to authenticated;

-- --------------------------------------------------------------------------
-- 3) บันทึก Set Up กะ: Sync OFF เวลา + Work Pattern ให้ตรงกับกะทำงาน
-- --------------------------------------------------------------------------
create or replace function public.ta_save_shift_schedule_rule_v6123(
  p_shift_code text,
  p_is_enabled boolean,
  p_scope_mode text,
  p_scope_values text[] default array[]::text[],
  p_paired_off_shift_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_code text:=upper(trim(coalesce(p_shift_code,'')));
  v_scope text:=upper(trim(coalesce(p_scope_mode,'ALL')));
  v_off text:=nullif(upper(trim(coalesce(p_paired_off_shift_code,''))), '');
  v_start time;
  v_end time;
  v_patterns text[];
  v_off_start time;
  v_off_end time;
  v_off_patterns text[];
  v_off_workday boolean;
  v_synced boolean:=false;
begin
  if not public.ta_v6120_is_hr_admin() then raise exception 'HR_ADMIN_REQUIRED'; end if;
  if v_scope not in ('ALL','SELECTED') then raise exception 'INVALID_SCOPE_MODE'; end if;
  if v_scope='SELECTED' and coalesce(array_length(p_scope_values,1),0)=0 then
    raise exception 'SELECT_AT_LEAST_ONE_DEPARTMENT';
  end if;

  select
    s.start_time,
    s.end_time,
    coalesce(s.applicable_pattern_codes,array['TECH_5D','TECH_6D']::text[])
  into v_start,v_end,v_patterns
  from public.shift_master s
  where upper(trim(s.shift_code))=v_code
    and coalesce(s.is_workday,true)=true
  limit 1;

  if not found then raise exception 'WORK_SHIFT_NOT_FOUND'; end if;
  if v_start is null or v_end is null then raise exception 'WORK_SHIFT_TIME_REQUIRED'; end if;

  if v_off is not null then
    select
      s.start_time,
      s.end_time,
      s.applicable_pattern_codes,
      coalesce(s.is_workday,true)
    into v_off_start,v_off_end,v_off_patterns,v_off_workday
    from public.shift_master s
    where upper(trim(s.shift_code))=v_off
    limit 1;

    if not found then raise exception 'OFF_SHIFT_NOT_FOUND'; end if;
    if v_off_workday then raise exception 'PAIRED_SHIFT_MUST_BE_DAY_OFF'; end if;

    if v_off_start is distinct from v_start
       or v_off_end is distinct from v_end
       or coalesce(v_off_patterns,array[]::text[]) is distinct from coalesce(v_patterns,array[]::text[])
    then
      update public.shift_master
      set
        start_time=v_start,
        end_time=v_end,
        is_workday=false,
        is_night_shift=(v_end<=v_start),
        break_minutes=0,
        applicable_pattern_codes=v_patterns
      where upper(trim(shift_code))=v_off;
      v_synced:=true;
    end if;
  end if;

  insert into public.ta_shift_schedule_rules_v6123(
    shift_code,is_enabled,scope_mode,paired_off_shift_code,updated_at,updated_by
  ) values(
    v_code,coalesce(p_is_enabled,false),v_scope,v_off,now(),auth.uid()
  )
  on conflict(shift_code) do update set
    is_enabled=excluded.is_enabled,
    scope_mode=excluded.scope_mode,
    paired_off_shift_code=excluded.paired_off_shift_code,
    updated_at=now(),
    updated_by=auth.uid();

  delete from public.ta_shift_schedule_rule_scopes_v6123
  where upper(trim(shift_code))=v_code
    and scope_type='DEPARTMENT';

  if v_scope='SELECTED' then
    insert into public.ta_shift_schedule_rule_scopes_v6123(
      shift_code,scope_type,scope_value,created_by
    )
    select v_code,'DEPARTMENT',trim(x),auth.uid()
    from unnest(p_scope_values) x
    where nullif(trim(x),'') is not null
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'ok',true,
    'shift_code',v_code,
    'scope_mode',v_scope,
    'paired_off_shift_code',v_off,
    'off_time_synced',v_synced,
    'off_time_or_pattern_synced',v_synced
  );
end;
$$;

grant execute on function public.ta_save_shift_schedule_rule_v6123(
  text,boolean,text,text[],text
) to authenticated;

-- --------------------------------------------------------------------------
-- 4) Index เพิ่มสำหรับ Scheduling Rule enrichment ใน Calendar
--    เดิมมี (work_date,emp_code); Query Calendar ใช้ emp_code หลายคน + ช่วงวันที่
-- --------------------------------------------------------------------------
create index if not exists idx_ta_schedule_rule_assignments_emp_date_v6125
on public.ta_schedule_rule_assignments(emp_code,work_date);

notify pgrst, 'reload schema';
commit;
