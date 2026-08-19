-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.12.4
-- Day-off Shift Time + OFF Mapping Fix
-- ต้องรันหลัง V6.12.3
-- ============================================================================

begin;
set local statement_timeout = '0';

-- 1) บังคับบันทึกเวลาเริ่ม/สิ้นสุดของกะวันหยุด
--    ใช้หลังจากหน้า Shift Master บันทึกข้อมูลผ่าน RPC เดิมแล้ว
create or replace function public.ta_force_dayoff_shift_time_v6124(
  p_shift_code text,
  p_start_time time,
  p_end_time time,
  p_is_night_shift boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_code text := upper(trim(coalesce(p_shift_code,'')));
  v_rows integer := 0;
begin
  if not public.ta_v6120_is_hr_admin() then
    raise exception 'HR_ADMIN_REQUIRED';
  end if;
  if v_code='' then raise exception 'SHIFT_CODE_REQUIRED'; end if;
  if p_start_time is null or p_end_time is null then
    raise exception 'DAYOFF_SHIFT_TIME_REQUIRED';
  end if;

  update public.shift_master
     set start_time = p_start_time,
         end_time = p_end_time,
         is_workday = false,
         is_night_shift = coalesce(p_is_night_shift,false) or p_end_time <= p_start_time,
         break_minutes = 0
   where upper(trim(shift_code)) = v_code;

  get diagnostics v_rows = row_count;
  if v_rows=0 then raise exception 'SHIFT_NOT_FOUND: %',v_code; end if;

  return jsonb_build_object(
    'ok',true,
    'shift_code',v_code,
    'start_time',p_start_time,
    'end_time',p_end_time,
    'is_workday',false
  );
end;
$$;

grant execute on function public.ta_force_dayoff_shift_time_v6124(text,time,time,boolean) to authenticated;

-- 1.1) เมื่อแก้เวลากะทำงาน ให้กะวันหยุดที่จับคู่ไว้ตามเวลาใหม่อัตโนมัติ
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
  v_off_workday boolean;
begin
  if not public.ta_v6120_is_hr_admin() then
    raise exception 'HR_ADMIN_REQUIRED';
  end if;
  if v_code='' then raise exception 'SHIFT_CODE_REQUIRED'; end if;

  select s.start_time,s.end_time
    into v_start,v_end
  from public.shift_master s
  where upper(trim(s.shift_code))=v_code
    and coalesce(s.is_workday,true)=true
  limit 1;
  if not found then return jsonb_build_object('ok',true,'synced',false,'reason','WORK_SHIFT_NOT_FOUND'); end if;

  select upper(r.paired_off_shift_code)
    into v_off
  from public.ta_shift_schedule_rules_v6123 r
  where upper(r.shift_code)=v_code
    and r.paired_off_shift_code is not null
  limit 1;

  if v_off is null then
    return jsonb_build_object('ok',true,'synced',false,'reason','NO_MAPPING');
  end if;

  select coalesce(s.is_workday,true)
    into v_off_workday
  from public.shift_master s
  where upper(s.shift_code)=v_off
  limit 1;
  if not found then raise exception 'OFF_SHIFT_NOT_FOUND'; end if;
  if v_off_workday then raise exception 'PAIRED_SHIFT_MUST_BE_DAY_OFF'; end if;

  update public.shift_master
     set start_time=v_start,
         end_time=v_end,
         is_workday=false,
         is_night_shift=(v_end<=v_start),
         break_minutes=0
   where upper(shift_code)=v_off;

  return jsonb_build_object(
    'ok',true,
    'synced',true,
    'work_shift_code',v_code,
    'off_shift_code',v_off,
    'start_time',v_start,
    'end_time',v_end
  );
end;
$$;

grant execute on function public.ta_sync_paired_off_for_work_shift_v6124(text) to authenticated;

-- 2) ปรับ Set Up Mapping:
--    หากเลือกกะวันหยุดถูกประเภท แต่เวลายังว่าง/ไม่ตรง ระบบจะ Sync เวลา
--    ตามกะทำงานให้อัตโนมัติ แทนการ Error OFF_SHIFT_TIME_MISMATCH
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
  v_off_start time;
  v_off_end time;
  v_off_workday boolean;
  v_synced boolean:=false;
begin
  if not public.ta_v6120_is_hr_admin() then raise exception 'HR_ADMIN_REQUIRED'; end if;
  if v_scope not in ('ALL','SELECTED') then raise exception 'INVALID_SCOPE_MODE'; end if;
  if v_scope='SELECTED' and coalesce(array_length(p_scope_values,1),0)=0 then raise exception 'SELECT_AT_LEAST_ONE_DEPARTMENT'; end if;

  select s.start_time,s.end_time into v_start,v_end
  from public.shift_master s
  where upper(s.shift_code)=v_code and coalesce(s.is_workday,true)=true
  limit 1;
  if not found then raise exception 'WORK_SHIFT_NOT_FOUND'; end if;
  if v_start is null or v_end is null then raise exception 'WORK_SHIFT_TIME_REQUIRED'; end if;

  if v_off is not null then
    select s.start_time,s.end_time,coalesce(s.is_workday,true)
      into v_off_start,v_off_end,v_off_workday
    from public.shift_master s
    where upper(s.shift_code)=v_off
    limit 1;
    if not found then raise exception 'OFF_SHIFT_NOT_FOUND'; end if;
    if v_off_workday then raise exception 'PAIRED_SHIFT_MUST_BE_DAY_OFF'; end if;

    if v_off_start is distinct from v_start or v_off_end is distinct from v_end then
      update public.shift_master
         set start_time=v_start,
             end_time=v_end,
             is_workday=false,
             is_night_shift=(v_end<=v_start),
             break_minutes=0
       where upper(shift_code)=v_off;
      v_off_start:=v_start;
      v_off_end:=v_end;
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
  where upper(shift_code)=v_code and scope_type='DEPARTMENT';

  if v_scope='SELECTED' then
    insert into public.ta_shift_schedule_rule_scopes_v6123(shift_code,scope_type,scope_value,created_by)
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
    'off_time_synced',v_synced
  );
end;
$$;

grant execute on function public.ta_save_shift_schedule_rule_v6123(text,boolean,text,text[],text) to authenticated;

-- 3) ซิงก์ Mapping มาตรฐานที่กำหนดไว้แล้ว 1 ครั้ง
--    ทำเฉพาะกรณีทั้งกะทำงานและกะวันหยุดมีอยู่ใน Shift Master
with shift_pair(work_code,off_code) as (
  values
    ('STD','OSTD'),
    ('S043','OS043'),
    ('S134','OS134'),
    ('S135','OS135')
), source_shift as (
  select
    p.work_code,
    p.off_code,
    w.start_time,
    w.end_time
  from shift_pair p
  join public.shift_master w on upper(w.shift_code)=p.work_code
  join public.shift_master o on upper(o.shift_code)=p.off_code
  where w.start_time is not null
    and w.end_time is not null
)
update public.shift_master o
   set start_time=s.start_time,
       end_time=s.end_time,
       is_workday=false,
       is_night_shift=(s.end_time<=s.start_time),
       break_minutes=0
from source_shift s
where upper(o.shift_code)=s.off_code;

-- 4) ถ้า Mapping 4 คู่ยังไม่มี ให้เติมค่าเริ่มต้น แต่ไม่ทับ Set Up ที่มีอยู่แล้ว
insert into public.ta_shift_schedule_rules_v6123(shift_code,is_enabled,scope_mode,paired_off_shift_code)
select p.work_code,true,'ALL',p.off_code
from (values
  ('STD','OSTD'),
  ('S043','OS043'),
  ('S134','OS134'),
  ('S135','OS135')
) p(work_code,off_code)
where exists(select 1 from public.shift_master w where upper(w.shift_code)=p.work_code)
  and exists(select 1 from public.shift_master o where upper(o.shift_code)=p.off_code)
on conflict(shift_code) do nothing;

commit;

notify pgrst, 'reload schema';
