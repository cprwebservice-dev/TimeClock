-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.12.3
-- Shift Department Scope + Paired Day-off Shift
-- ============================================================================

begin;
set local statement_timeout = '0';

-- 1) Set Up กะรายหน่วยงาน + จับคู่กะวันหยุด -------------------------------
create table if not exists public.ta_shift_schedule_rules_v6123 (
  shift_code text primary key,
  is_enabled boolean not null default true,
  scope_mode text not null default 'ALL' check (scope_mode in ('ALL','SELECTED')),
  paired_off_shift_code text,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.ta_shift_schedule_rule_scopes_v6123 (
  shift_code text not null,
  scope_type text not null default 'DEPARTMENT',
  scope_value text not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (shift_code,scope_type,scope_value)
);

create index if not exists idx_ta_shift_rule_scope_v6123
  on public.ta_shift_schedule_rule_scopes_v6123(scope_type,scope_value,shift_code);

-- ค่าเริ่มต้นตาม Mapping ที่กำหนด
-- ใช้ ON CONFLICT DO NOTHING เพื่อไม่เขียนทับค่าที่ HR Admin แก้ภายหลัง
insert into public.ta_shift_schedule_rules_v6123(shift_code,is_enabled,scope_mode,paired_off_shift_code)
select x.work_code,true,'ALL',x.off_code
from (values
  ('STD','OSTD'),
  ('S043','OS043'),
  ('S134','OS134'),
  ('S135','OS135')
) as x(work_code,off_code)
where exists(select 1 from public.shift_master s where upper(s.shift_code)=x.work_code)
  and exists(select 1 from public.shift_master s where upper(s.shift_code)=x.off_code)
on conflict (shift_code) do nothing;

-- กะทำงานอื่นที่มีอยู่ ให้เริ่มต้นเป็นทุกหน่วยงานและยังไม่จับคู่ OFF
insert into public.ta_shift_schedule_rules_v6123(shift_code,is_enabled,scope_mode)
select upper(s.shift_code),true,'ALL'
from public.shift_master s
where coalesce(s.is_workday,true)=true
  and coalesce(s.is_active,true)=true
  and upper(coalesce(s.shift_code,'')) not in ('OFF','HOL','LV')
  and coalesce(s.note,'') not like '%[SYSTEM_GENERATED_V6120]%'
on conflict (shift_code) do nothing;

-- 2) Admin: ดู Set Up --------------------------------------------------------
create or replace function public.ta_get_shift_schedule_rule_admin_v6123()
returns table(
  shift_code text,
  shift_name text,
  start_time time,
  end_time time,
  is_workday boolean,
  is_night_shift boolean,
  is_active boolean,
  note text,
  is_enabled boolean,
  scope_mode text,
  scope_values text[],
  paired_off_shift_code text,
  paired_off_shift_name text,
  paired_off_start_time time,
  paired_off_end_time time,
  pair_valid boolean
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.ta_v6120_is_hr_admin() then raise exception 'HR_ADMIN_REQUIRED'; end if;

  return query
  select
    upper(s.shift_code)::text,
    s.shift_name::text,
    s.start_time,
    s.end_time,
    coalesce(s.is_workday,true),
    coalesce(s.is_night_shift,false),
    coalesce(s.is_active,true),
    s.note::text,
    coalesce(r.is_enabled,true),
    coalesce(r.scope_mode,'ALL')::text,
    coalesce(
      (select array_agg(sc.scope_value order by sc.scope_value)
       from public.ta_shift_schedule_rule_scopes_v6123 sc
       where upper(sc.shift_code)=upper(s.shift_code)
         and sc.scope_type='DEPARTMENT'),
      array[]::text[]
    ),
    upper(r.paired_off_shift_code)::text,
    os.shift_name::text,
    os.start_time,
    os.end_time,
    case
      when r.paired_off_shift_code is null then null
      else (
        os.shift_code is not null
        and coalesce(os.is_workday,true)=false
        and os.start_time is not distinct from s.start_time
        and os.end_time is not distinct from s.end_time
      )
    end
  from public.shift_master s
  left join public.ta_shift_schedule_rules_v6123 r
    on upper(r.shift_code)=upper(s.shift_code)
  left join public.shift_master os
    on upper(os.shift_code)=upper(r.paired_off_shift_code)
  where coalesce(s.note,'') not like '%[SYSTEM_GENERATED_V6120]%'
  order by coalesce(s.display_order,0),upper(s.shift_code);
end;
$$;

-- 3) Admin: บันทึก Set Up ---------------------------------------------------
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
begin
  if not public.ta_v6120_is_hr_admin() then raise exception 'HR_ADMIN_REQUIRED'; end if;
  if v_scope not in ('ALL','SELECTED') then raise exception 'INVALID_SCOPE_MODE'; end if;
  if v_scope='SELECTED' and coalesce(array_length(p_scope_values,1),0)=0 then raise exception 'SELECT_AT_LEAST_ONE_DEPARTMENT'; end if;

  select s.start_time,s.end_time into v_start,v_end
  from public.shift_master s
  where upper(s.shift_code)=v_code and coalesce(s.is_workday,true)=true
  limit 1;
  if not found then raise exception 'WORK_SHIFT_NOT_FOUND'; end if;

  if v_off is not null then
    select s.start_time,s.end_time,coalesce(s.is_workday,true)
      into v_off_start,v_off_end,v_off_workday
    from public.shift_master s
    where upper(s.shift_code)=v_off
    limit 1;
    if not found then raise exception 'OFF_SHIFT_NOT_FOUND'; end if;
    if v_off_workday then raise exception 'PAIRED_SHIFT_MUST_BE_DAY_OFF'; end if;
    if v_off_start is distinct from v_start or v_off_end is distinct from v_end then
      raise exception 'OFF_SHIFT_TIME_MISMATCH';
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
    'paired_off_shift_code',v_off
  );
end;
$$;

-- 4) Runtime: กฎที่ใช้กรอง Dropdown / Bulk ---------------------------------
create or replace function public.ta_get_shift_schedule_rules_runtime_v6123()
returns table(
  shift_code text,
  is_enabled boolean,
  scope_mode text,
  scope_values text[],
  paired_off_shift_code text
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;

  return query
  select
    upper(s.shift_code)::text,
    coalesce(r.is_enabled,true),
    coalesce(r.scope_mode,'ALL')::text,
    coalesce(
      (select array_agg(sc.scope_value order by sc.scope_value)
       from public.ta_shift_schedule_rule_scopes_v6123 sc
       where upper(sc.shift_code)=upper(s.shift_code)
         and sc.scope_type='DEPARTMENT'),
      array[]::text[]
    ),
    upper(r.paired_off_shift_code)::text
  from public.shift_master s
  left join public.ta_shift_schedule_rules_v6123 r
    on upper(r.shift_code)=upper(s.shift_code)
  where coalesce(s.is_workday,true)=true
    and coalesce(s.note,'') not like '%[SYSTEM_GENERATED_V6120]%'
  order by coalesce(s.display_order,0),upper(s.shift_code);
end;
$$;

-- 5) Resolve วันหยุดจากกะทำงานก่อนหน้า ------------------------------------
create or replace function public.ta_get_off_shift_basis_v6123(
  p_emp_code text,
  p_work_date date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_code text;
  v_mode text;
  v_base_code text;
  v_start time;
  v_end time;
  v_custom_start time;
  v_custom_end time;
  v_basis_code text;
  v_pair_code text;
  v_pair_name text;
  v_pair_start time;
  v_pair_end time;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;

  select upper(c.shift_code),upper(coalesce(a.work_mode_code,'')),upper(a.base_shift_code),
         s.start_time,s.end_time,a.custom_start_time,a.custom_end_time
    into v_code,v_mode,v_base_code,v_start,v_end,v_custom_start,v_custom_end
  from public.shift_calendar c
  left join public.shift_master s on upper(s.shift_code)=upper(c.shift_code)
  left join public.ta_schedule_rule_assignments a
    on a.emp_code=c.emp_code::text and a.work_date=c.work_date
  where c.emp_code::text=p_emp_code
    and c.work_date<p_work_date
    and c.work_date>=p_work_date-14
    and coalesce(s.is_workday,true)=true
  order by c.work_date desc
  limit 1;

  if v_code is null then return null; end if;
  v_basis_code:=coalesce(nullif(v_base_code,''),v_code);

  -- กะพิเศษยังใช้ Dynamic OFF เพื่อคง Logic เดิม
  if v_mode='HOUR_BASED' and v_custom_start is not null and v_custom_end is not null then
    return jsonb_build_object(
      'basis_shift_code',v_basis_code,
      'off_shift_code','OFF',
      'off_shift_name','วันหยุดตามกะนับชั่วโมง',
      'off_start_time',v_custom_start,
      'off_end_time',v_custom_end,
      'resolution_type','DYNAMIC_SPECIAL',
      'mapping_missing',false
    );
  end if;

  if v_mode='SPLIT_WAIT_NIGHT' and v_base_code is not null then
    select s.start_time,s.end_time into v_start,v_end
    from public.shift_master s where upper(s.shift_code)=v_base_code limit 1;
    return jsonb_build_object(
      'basis_shift_code',v_base_code,
      'off_shift_code','OFF',
      'off_shift_name','วันหยุดตามกะพิเศษ',
      'off_start_time',v_start,
      'off_end_time',v_end,
      'resolution_type','DYNAMIC_SPECIAL',
      'mapping_missing',false
    );
  end if;

  select upper(r.paired_off_shift_code),os.shift_name,os.start_time,os.end_time
    into v_pair_code,v_pair_name,v_pair_start,v_pair_end
  from public.ta_shift_schedule_rules_v6123 r
  left join public.shift_master os on upper(os.shift_code)=upper(r.paired_off_shift_code)
  where upper(r.shift_code)=v_basis_code
    and r.paired_off_shift_code is not null
    and coalesce(os.is_active,true)=true
    and coalesce(os.is_workday,true)=false
  limit 1;

  if v_pair_code is null then
    return jsonb_build_object(
      'basis_shift_code',v_basis_code,
      'off_shift_code',null,
      'off_shift_name',null,
      'off_start_time',v_start,
      'off_end_time',v_end,
      'resolution_type','MAPPING_MISSING',
      'mapping_missing',true
    );
  end if;

  return jsonb_build_object(
    'basis_shift_code',v_basis_code,
    'off_shift_code',v_pair_code,
    'off_shift_name',v_pair_name,
    'off_start_time',v_pair_start,
    'off_end_time',v_pair_end,
    'resolution_type','MAPPED',
    'mapping_missing',false
  );
end;
$$;

-- 6) Bulk: รองรับ OSxxx เป็น Smart OFF --------------------------------------
create or replace function public.ta_sync_bulk_schedule_rules_v6123(p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_item jsonb;
  v_emp text;
  v_date date;
  v_code text;
  v_note text;
  v_current_is_workday boolean;
  v_current_start time;
  v_current_end time;
  v_basis_code text;
  v_basis_start time;
  v_basis_end time;
  v_basis_mode text;
  v_basis_base_code text;
  v_basis_custom_start time;
  v_basis_custom_end time;
  v_base_start time;
  v_base_end time;
  v_synced integer:=0;
  v_cleared integer:=0;
  v_deleted integer:=0;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    v_emp:=nullif(trim(v_item->>'emp_code'),'');
    begin v_date:=(v_item->>'work_date')::date; exception when others then v_date:=null; end;
    v_code:=upper(nullif(trim(coalesce(v_item->>'shift_code','')),''));
    v_note:=nullif(v_item->>'note','');
    if v_emp is null or v_date is null then continue; end if;

    if v_code is null or v_code in ('HOL','LV') then
      delete from public.ta_schedule_rule_assignments a where a.emp_code=v_emp and a.work_date=v_date;
      get diagnostics v_deleted = row_count;
      v_cleared:=v_cleared+v_deleted;
      continue;
    end if;

    select coalesce(s.is_workday,true),s.start_time,s.end_time
      into v_current_is_workday,v_current_start,v_current_end
    from public.shift_master s
    where upper(s.shift_code)=v_code
    limit 1;

    if not found then v_current_is_workday:=(v_code<>'OFF'); end if;

    if v_current_is_workday then
      delete from public.ta_schedule_rule_assignments a where a.emp_code=v_emp and a.work_date=v_date;
      get diagnostics v_deleted = row_count;
      v_cleared:=v_cleared+v_deleted;
      continue;
    end if;

    v_basis_code:=null;v_basis_start:=null;v_basis_end:=null;v_basis_mode:=null;
    v_basis_base_code:=null;v_basis_custom_start:=null;v_basis_custom_end:=null;

    select upper(c.shift_code),s.start_time,s.end_time,upper(coalesce(a.work_mode_code,'')),upper(a.base_shift_code),a.custom_start_time,a.custom_end_time
      into v_basis_code,v_basis_start,v_basis_end,v_basis_mode,v_basis_base_code,v_basis_custom_start,v_basis_custom_end
    from public.shift_calendar c
    left join public.shift_master s on upper(s.shift_code)=upper(c.shift_code)
    left join public.ta_schedule_rule_assignments a on a.emp_code=c.emp_code::text and a.work_date=c.work_date
    where c.emp_code::text=v_emp
      and c.work_date<v_date
      and c.work_date>=v_date-14
      and coalesce(s.is_workday,true)=true
    order by c.work_date desc
    limit 1;

    if v_basis_code is null then
      delete from public.ta_schedule_rule_assignments a where a.emp_code=v_emp and a.work_date=v_date;
      continue;
    end if;

    if v_basis_mode='HOUR_BASED' and v_basis_custom_start is not null and v_basis_custom_end is not null then
      v_basis_start:=v_basis_custom_start;v_basis_end:=v_basis_custom_end;
    elsif v_basis_mode='SPLIT_WAIT_NIGHT' and v_basis_base_code is not null then
      select s.start_time,s.end_time into v_base_start,v_base_end
      from public.shift_master s where upper(s.shift_code)=v_basis_base_code limit 1;
      if v_base_start is not null and v_base_end is not null then
        v_basis_start:=v_base_start;v_basis_end:=v_base_end;v_basis_code:=v_basis_base_code;
      end if;
    end if;

    -- ถ้า Calendar บันทึก OSxxx แล้ว ให้ใช้เวลา OSxxx โดยตรง
    if v_code<>'OFF' and v_current_start is not null and v_current_end is not null then
      v_basis_start:=v_current_start;v_basis_end:=v_current_end;
    end if;

    insert into public.ta_schedule_rule_assignments(
      emp_code,work_date,work_mode_code,base_shift_code,generated_shift_code,
      first_segment_end,second_segment_start,second_segment_planned_end,custom_start_time,custom_end_time,
      off_window_start,off_window_end,off_basis_shift_code,planned_minutes,validation_snapshot,note,created_by,updated_by
    ) values(
      v_emp,v_date,'DYNAMIC_OFF',null,null,null,null,null,null,null,
      v_basis_start,v_basis_end,upper(v_basis_code),0,'{}'::jsonb,
      coalesce(v_note,'Smart OFF / Paired OFF V6.12.3'),auth.uid(),auth.uid()
    )
    on conflict(emp_code,work_date) do update set
      work_mode_code='DYNAMIC_OFF',base_shift_code=null,generated_shift_code=null,
      first_segment_end=null,second_segment_start=null,second_segment_planned_end=null,custom_start_time=null,custom_end_time=null,
      off_window_start=excluded.off_window_start,off_window_end=excluded.off_window_end,off_basis_shift_code=excluded.off_basis_shift_code,
      planned_minutes=0,validation_snapshot='{}'::jsonb,note=excluded.note,updated_at=now(),updated_by=auth.uid();
    v_synced:=v_synced+1;
  end loop;

  return jsonb_build_object('ok',true,'dayoff_synced',v_synced,'extensions_cleared',v_cleared);
end;
$$;

-- 7) Permissions --------------------------------------------------------------
revoke all on public.ta_shift_schedule_rules_v6123,public.ta_shift_schedule_rule_scopes_v6123 from anon,authenticated;
grant execute on function public.ta_get_shift_schedule_rule_admin_v6123() to authenticated;
grant execute on function public.ta_save_shift_schedule_rule_v6123(text,boolean,text,text[],text) to authenticated;
grant execute on function public.ta_get_shift_schedule_rules_runtime_v6123() to authenticated;
grant execute on function public.ta_get_off_shift_basis_v6123(text,date) to authenticated;
grant execute on function public.ta_sync_bulk_schedule_rules_v6123(jsonb) to authenticated;

commit;
