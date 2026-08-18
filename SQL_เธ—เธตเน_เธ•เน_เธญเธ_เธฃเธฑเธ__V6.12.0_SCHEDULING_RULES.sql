-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.12.0
-- Work Modes + Scheduling Guard + Dynamic OFF + Day-off Quota
-- ============================================================================

begin;

set local statement_timeout = '0';

-- 0) รองรับ Shift Code ที่ระบบสร้างอัตโนมัติสำหรับ Hour-based / Split Wait
--    V6.11.57 ใช้รหัสมาตรฐานสั้น 3-4 ตัว แต่ V6.12.0 ต้องรองรับรหัสระบบยาวขึ้น
do $$
declare c record;
begin
  for c in
    select cols.table_schema,cols.table_name,cols.column_name,cols.data_type,cols.character_maximum_length
    from information_schema.columns cols
    join information_schema.tables t on t.table_schema=cols.table_schema and t.table_name=cols.table_name
    where cols.table_schema='public'
      and t.table_type='BASE TABLE'
      and lower(cols.column_name) like '%shift_code%'
      and cols.data_type in ('character varying','character')
      and cols.character_maximum_length is not null
      and cols.character_maximum_length<20
  loop
    execute format('alter table %I.%I alter column %I type varchar(20) using %I::varchar(20)',c.table_schema,c.table_name,c.column_name,c.column_name);
  end loop;
end;
$$;

-- 1) Work mode configuration -------------------------------------------------
create table if not exists public.ta_work_modes (
  mode_code text primary key,
  mode_name text not null,
  description text,
  is_active boolean not null default true,
  scope_mode text not null default 'ALL' check (scope_mode in ('ALL','SELECTED')),
  display_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.ta_work_mode_scopes (
  mode_code text not null references public.ta_work_modes(mode_code) on delete cascade,
  scope_type text not null default 'DEPARTMENT',
  scope_value text not null,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (mode_code, scope_type, scope_value)
);

insert into public.ta_work_modes(mode_code,mode_name,description,is_active,scope_mode,display_order)
values
 ('NORMAL','กะปกติ','ใช้ Shift Master มาตรฐานตามรูปแบบ 5/6 วัน',true,'ALL',10),
 ('NORMAL_LATE_CUSTOMER','กะปกติ + งานลูกค้าช่วงดึก','กะปกติและกลับเข้าทำงานลูกค้าช่วงดึก',true,'ALL',20),
 ('SPLIT_WAIT_NIGHT','กะเช้า + รอเข้ากะดึก','ออกจากกะช่วงแรกก่อน แล้วกลับเข้าทำงานช่วงดึก โดยไม่นับช่วงรอ',true,'ALL',30),
 ('HOUR_BASED','กะนับชั่วโมง','ระบุเวลาเริ่ม ระบบคำนวณเวลาสิ้นสุดจากชั่วโมงรวมพัก',true,'ALL',40),
 ('DYNAMIC_OFF','วันหยุดตามกะล่าสุด','วันหยุดใช้ช่วงเวลาเดียวกับกะทำงานก่อนหน้าโดยอัตโนมัติ',true,'ALL',50)
on conflict (mode_code) do update
set mode_name=excluded.mode_name,
    description=excluded.description,
    display_order=excluded.display_order;

-- 2) Schedule rule extension -------------------------------------------------
create table if not exists public.ta_schedule_rule_assignments (
  emp_code text not null,
  work_date date not null,
  work_mode_code text not null references public.ta_work_modes(mode_code),
  base_shift_code text,
  generated_shift_code text,
  first_segment_end time,
  second_segment_start time,
  second_segment_planned_end time,
  custom_start_time time,
  custom_end_time time,
  off_window_start time,
  off_window_end time,
  off_basis_shift_code text,
  planned_minutes integer not null default 0,
  validation_snapshot jsonb not null default '{}'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key(emp_code,work_date)
);
create index if not exists idx_ta_schedule_rule_assignments_date on public.ta_schedule_rule_assignments(work_date,emp_code);

-- 3) Day-off policy -----------------------------------------------------------
create table if not exists public.ta_dayoff_settings (
  setting_id smallint primary key default 1 check (setting_id=1),
  effective_start_month date not null,
  manager_position_pattern text not null default 'ผู้จัดการแผนก',
  manager_weekly_off_dows integer[] not null default array[0,6],
  other_weekly_off_dows integer[] not null default array[0],
  carry_forward_enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

insert into public.ta_dayoff_settings(setting_id,effective_start_month)
values(1,date '2026-07-01')
on conflict (setting_id) do nothing;

create table if not exists public.ta_dayoff_opening_balance (
  emp_code text not null,
  start_month date not null,
  opening_days numeric(8,2) not null default 0,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key(emp_code,start_month)
);

-- 4) Security helpers ---------------------------------------------------------
create or replace function public.ta_v6120_is_hr_admin()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.ta_user_profiles p
    where p.user_id=auth.uid()
      and upper(coalesce(p.role,''))='HR_ADMIN'
      and coalesce(p.is_active,false)=true
  );
$$;

create or replace function public.ta_v6120_can_schedule()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.ta_user_profiles p
    where p.user_id=auth.uid()
      and upper(coalesce(p.role,'')) in ('HR_ADMIN','MANAGER','USER')
      and coalesce(p.is_active,false)=true
  );
$$;

-- 5) Work mode RPCs -----------------------------------------------------------
create or replace function public.ta_get_work_mode_admin_v6120()
returns table(
  mode_code text,
  mode_name text,
  description text,
  is_active boolean,
  scope_mode text,
  scope_values text[],
  display_order integer
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.ta_v6120_is_hr_admin() then
    raise exception 'HR_ADMIN_REQUIRED';
  end if;
  return query
  select m.mode_code,m.mode_name,m.description,m.is_active,m.scope_mode,
         coalesce(array_agg(s.scope_value order by s.scope_value) filter(where s.scope_value is not null),array[]::text[]) as scope_values,
         m.display_order
  from public.ta_work_modes m
  left join public.ta_work_mode_scopes s on s.mode_code=m.mode_code and s.scope_type='DEPARTMENT'
  group by m.mode_code,m.mode_name,m.description,m.is_active,m.scope_mode,m.display_order
  order by m.display_order,m.mode_code;
end;
$$;

create or replace function public.ta_save_work_mode_config_v6120(
  p_mode_code text,
  p_is_active boolean,
  p_scope_mode text,
  p_scope_values text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_scope text:=upper(coalesce(p_scope_mode,'ALL'));
begin
  if not public.ta_v6120_is_hr_admin() then raise exception 'HR_ADMIN_REQUIRED'; end if;
  if v_scope not in ('ALL','SELECTED') then raise exception 'INVALID_SCOPE_MODE'; end if;
  if not exists(select 1 from public.ta_work_modes where mode_code=upper(p_mode_code)) then raise exception 'WORK_MODE_NOT_FOUND'; end if;
  if v_scope='SELECTED' and coalesce(array_length(p_scope_values,1),0)=0 then raise exception 'SELECT_AT_LEAST_ONE_DEPARTMENT'; end if;

  update public.ta_work_modes
     set is_active=coalesce(p_is_active,false),scope_mode=v_scope,updated_at=now(),updated_by=auth.uid()
   where mode_code=upper(p_mode_code);

  delete from public.ta_work_mode_scopes where mode_code=upper(p_mode_code) and scope_type='DEPARTMENT';
  if v_scope='SELECTED' then
    insert into public.ta_work_mode_scopes(mode_code,scope_type,scope_value,created_by)
    select upper(p_mode_code),'DEPARTMENT',trim(x),auth.uid()
    from unnest(p_scope_values) x
    where nullif(trim(x),'') is not null
    on conflict do nothing;
  end if;

  return jsonb_build_object('ok',true,'mode_code',upper(p_mode_code),'scope_mode',v_scope);
end;
$$;

create or replace function public.ta_get_work_modes_for_employee_v6120(
  p_emp_code text,
  p_work_date date default current_date
)
returns table(
  mode_code text,
  mode_name text,
  description text,
  is_active boolean,
  is_allowed boolean,
  scope_label text,
  display_order integer
)
language plpgsql
security definer
set search_path=public
as $$
declare v_department text;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;
  select e.department into v_department
  from public.employees e
  where e."EmployeeId"::text=p_emp_code
  limit 1;

  return query
  select m.mode_code,m.mode_name,m.description,m.is_active,
         (m.is_active and (m.scope_mode='ALL' or exists(
           select 1 from public.ta_work_mode_scopes s
           where s.mode_code=m.mode_code and s.scope_type='DEPARTMENT' and s.scope_value=coalesce(v_department,'')
         ))) as is_allowed,
         case when m.scope_mode='ALL' then 'ทุกหน่วยงาน'
              when exists(select 1 from public.ta_work_mode_scopes s where s.mode_code=m.mode_code and s.scope_type='DEPARTMENT' and s.scope_value=coalesce(v_department,'')) then coalesce(v_department,'หน่วยงานที่กำหนด')
              else 'ยังไม่เปิดใช้กับหน่วยงานนี้' end as scope_label,
         m.display_order
  from public.ta_work_modes m
  order by m.display_order,m.mode_code;
end;
$$;

-- 6) Generated Shift helpers --------------------------------------------------
create or replace function public.ta_v6120_upsert_generated_shift(
  p_shift_code text,
  p_shift_name text,
  p_start_time time,
  p_end_time time,
  p_break_minutes integer,
  p_pattern_code text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v_night boolean := p_end_time <= p_start_time;
  v_duration integer := mod((extract(epoch from p_end_time)::integer - extract(epoch from p_start_time)::integer) + 86400,86400)/60;
  v_has_sched boolean;
  v_has_standard boolean;
  v_has_applicable boolean;
begin
  insert into public.shift_master(shift_code,shift_name,start_time,end_time,is_night_shift,is_workday,break_minutes,is_active,note)
  values(upper(p_shift_code),p_shift_name,p_start_time,p_end_time,v_night,true,greatest(coalesce(p_break_minutes,0),0),true,'[SYSTEM_GENERATED_V6120]')
  on conflict(shift_code) do update
    set shift_name=excluded.shift_name,start_time=excluded.start_time,end_time=excluded.end_time,
        is_night_shift=excluded.is_night_shift,is_workday=true,break_minutes=excluded.break_minutes,is_active=true,note='[SYSTEM_GENERATED_V6120]';

  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='shift_master' and column_name='scheduled_minutes_including_break') into v_has_sched;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='shift_master' and column_name='standard_work_minutes') into v_has_standard;
  select exists(select 1 from information_schema.columns where table_schema='public' and table_name='shift_master' and column_name='applicable_pattern_codes') into v_has_applicable;

  if v_has_sched then execute 'update public.shift_master set scheduled_minutes_including_break=$1 where shift_code=$2' using v_duration,upper(p_shift_code); end if;
  if v_has_standard then execute 'update public.shift_master set standard_work_minutes=$1 where shift_code=$2' using greatest(v_duration-greatest(coalesce(p_break_minutes,0),0),0),upper(p_shift_code); end if;
  if v_has_applicable then execute 'update public.shift_master set applicable_pattern_codes=$1 where shift_code=$2' using array[upper(p_pattern_code)],upper(p_shift_code); end if;
end;
$$;

create or replace function public.ta_resolve_hour_based_shift_v6120(
  p_pattern_code text,
  p_start_time time,
  p_scheduled_minutes integer,
  p_break_minutes integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_end time;
  v_code text;
  v_prefix text;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;
  if p_start_time is null or coalesce(p_scheduled_minutes,0)<=0 then raise exception 'INVALID_HOUR_BASED_SHIFT'; end if;
  v_end := (p_start_time + make_interval(mins=>p_scheduled_minutes))::time;
  v_prefix := case when upper(p_pattern_code)='TECH_5D' then 'H5' else 'H6' end;
  v_code := v_prefix || to_char(p_start_time,'HH24MI');
  perform public.ta_v6120_upsert_generated_shift(v_code,'กะนับชั่วโมง '||to_char(p_start_time,'HH24:MI')||'–'||to_char(v_end,'HH24:MI'),p_start_time,v_end,p_break_minutes,p_pattern_code);
  return jsonb_build_object('shift_code',v_code,'start_time',to_char(p_start_time,'HH24:MI'),'end_time',to_char(v_end,'HH24:MI'),'scheduled_minutes',p_scheduled_minutes);
end;
$$;

create or replace function public.ta_resolve_split_wait_shift_v6120(
  p_pattern_code text,
  p_base_shift_code text,
  p_first_segment_end time
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_start time;
  v_break integer:=60;
  v_code text;
  v_minutes integer;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;
  select s.start_time,coalesce(s.break_minutes,60) into v_start,v_break
  from public.shift_master s where upper(s.shift_code)=upper(p_base_shift_code) limit 1;
  if v_start is null then raise exception 'BASE_SHIFT_NOT_FOUND: %',p_base_shift_code; end if;
  if p_first_segment_end is null then raise exception 'FIRST_SEGMENT_END_REQUIRED'; end if;
  v_minutes := mod((extract(epoch from p_first_segment_end)::integer-extract(epoch from v_start)::integer)+86400,86400)/60;
  if v_minutes<=0 then raise exception 'INVALID_FIRST_SEGMENT_WINDOW'; end if;
  if v_minutes<300 then v_break:=0; end if;
  v_code := 'SW'||to_char(v_start,'HH24MI')||to_char(p_first_segment_end,'HH24MI');
  perform public.ta_v6120_upsert_generated_shift(v_code,'กะช่วงแรก '||to_char(v_start,'HH24:MI')||'–'||to_char(p_first_segment_end,'HH24:MI'),v_start,p_first_segment_end,v_break,p_pattern_code);
  return jsonb_build_object('shift_code',v_code,'start_time',to_char(v_start,'HH24:MI'),'end_time',to_char(p_first_segment_end,'HH24:MI'),'planned_minutes',v_minutes,'base_shift_code',upper(p_base_shift_code));
end;
$$;

-- 7) Schedule extension RPCs --------------------------------------------------
create or replace function public.ta_upsert_schedule_rule_assignment_v6120(
  p_emp_code text,
  p_work_date date,
  p_work_mode_code text,
  p_base_shift_code text default null,
  p_generated_shift_code text default null,
  p_first_segment_end time default null,
  p_second_segment_start time default null,
  p_second_segment_planned_end time default null,
  p_custom_start_time time default null,
  p_custom_end_time time default null,
  p_off_window_start time default null,
  p_off_window_end time default null,
  p_off_basis_shift_code text default null,
  p_planned_minutes integer default 0,
  p_validation_snapshot jsonb default '{}'::jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;
  if not exists(select 1 from public.ta_work_modes where mode_code=upper(p_work_mode_code) and is_active=true) then raise exception 'WORK_MODE_NOT_ACTIVE'; end if;
  if not exists(select 1 from public.shift_calendar c where c.emp_code::text=p_emp_code and c.work_date=p_work_date) then raise exception 'SHIFT_ASSIGNMENT_REQUIRED_BEFORE_RULE_EXTENSION'; end if;

  insert into public.ta_schedule_rule_assignments(
    emp_code,work_date,work_mode_code,base_shift_code,generated_shift_code,first_segment_end,second_segment_start,second_segment_planned_end,
    custom_start_time,custom_end_time,off_window_start,off_window_end,off_basis_shift_code,planned_minutes,validation_snapshot,note,created_by,updated_by
  ) values(
    p_emp_code,p_work_date,upper(p_work_mode_code),nullif(upper(coalesce(p_base_shift_code,'')),''),nullif(upper(coalesce(p_generated_shift_code,'')),''),p_first_segment_end,p_second_segment_start,p_second_segment_planned_end,
    p_custom_start_time,p_custom_end_time,p_off_window_start,p_off_window_end,nullif(upper(coalesce(p_off_basis_shift_code,'')),''),greatest(coalesce(p_planned_minutes,0),0),coalesce(p_validation_snapshot,'{}'::jsonb),p_note,auth.uid(),auth.uid()
  )
  on conflict(emp_code,work_date) do update set
    work_mode_code=excluded.work_mode_code,base_shift_code=excluded.base_shift_code,generated_shift_code=excluded.generated_shift_code,
    first_segment_end=excluded.first_segment_end,second_segment_start=excluded.second_segment_start,second_segment_planned_end=excluded.second_segment_planned_end,
    custom_start_time=excluded.custom_start_time,custom_end_time=excluded.custom_end_time,off_window_start=excluded.off_window_start,off_window_end=excluded.off_window_end,
    off_basis_shift_code=excluded.off_basis_shift_code,planned_minutes=excluded.planned_minutes,validation_snapshot=excluded.validation_snapshot,note=excluded.note,updated_at=now(),updated_by=auth.uid();

  return jsonb_build_object('ok',true,'emp_code',p_emp_code,'work_date',p_work_date,'work_mode_code',upper(p_work_mode_code));
end;
$$;

create or replace function public.ta_get_schedule_rule_assignment_v6120(p_emp_code text,p_work_date date)
returns table(
  emp_code text,work_date date,schedule_rule_mode text,work_mode_code text,base_shift_code text,generated_shift_code text,
  first_segment_end time,second_segment_start time,second_segment_planned_end time,custom_start_time time,custom_end_time time,
  off_window_start time,off_window_end time,off_basis_shift_code text,planned_minutes integer,validation_snapshot jsonb,note text
)
language sql
security definer
set search_path=public
as $$
  select a.emp_code,a.work_date,a.work_mode_code,a.work_mode_code,a.base_shift_code,a.generated_shift_code,
         a.first_segment_end,a.second_segment_start,a.second_segment_planned_end,a.custom_start_time,a.custom_end_time,
         a.off_window_start,a.off_window_end,a.off_basis_shift_code,a.planned_minutes,a.validation_snapshot,a.note
  from public.ta_schedule_rule_assignments a
  where a.emp_code=p_emp_code and a.work_date=p_work_date;
$$;

create or replace function public.ta_get_schedule_rule_assignments_v6120(p_emp_codes text[],p_start_date date,p_end_date date)
returns table(
  emp_code text,work_date date,schedule_rule_mode text,work_mode_code text,base_shift_code text,generated_shift_code text,
  first_segment_end time,second_segment_start time,second_segment_planned_end time,custom_start_time time,custom_end_time time,
  off_window_start time,off_window_end time,off_basis_shift_code text,planned_minutes integer,validation_snapshot jsonb,note text
)
language sql
security definer
set search_path=public
as $$
  select a.emp_code,a.work_date,a.work_mode_code,a.work_mode_code,a.base_shift_code,a.generated_shift_code,
         a.first_segment_end,a.second_segment_start,a.second_segment_planned_end,a.custom_start_time,a.custom_end_time,
         a.off_window_start,a.off_window_end,a.off_basis_shift_code,a.planned_minutes,a.validation_snapshot,a.note
  from public.ta_schedule_rule_assignments a
  where a.emp_code=any(p_emp_codes) and a.work_date between p_start_date and p_end_date;
$$;


create or replace function public.ta_get_dynamic_off_basis_v6120(p_emp_code text,p_work_date date)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_code text;
  v_start time;
  v_end time;
  v_mode text;
  v_base_code text;
  v_custom_start time;
  v_custom_end time;
  v_base_start time;
  v_base_end time;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;

  select c.shift_code,s.start_time,s.end_time,a.work_mode_code,a.base_shift_code,a.custom_start_time,a.custom_end_time
    into v_code,v_start,v_end,v_mode,v_base_code,v_custom_start,v_custom_end
  from public.shift_calendar c
  left join public.shift_master s on upper(s.shift_code)=upper(c.shift_code)
  left join public.ta_schedule_rule_assignments a on a.emp_code=c.emp_code::text and a.work_date=c.work_date
  where c.emp_code::text=p_emp_code
    and c.work_date<p_work_date
    and c.work_date>=p_work_date-14
    and upper(coalesce(c.shift_code,'')) not in ('OFF','HOL','LV')
    and coalesce(s.is_workday,true)=true
  order by c.work_date desc
  limit 1;

  if upper(coalesce(v_mode,''))='HOUR_BASED' and v_custom_start is not null and v_custom_end is not null then
    v_start:=v_custom_start; v_end:=v_custom_end;
  elsif upper(coalesce(v_mode,''))='SPLIT_WAIT_NIGHT' and v_base_code is not null then
    select s.start_time,s.end_time into v_base_start,v_base_end
    from public.shift_master s where upper(s.shift_code)=upper(v_base_code) limit 1;
    if v_base_start is not null and v_base_end is not null then
      v_start:=v_base_start; v_end:=v_base_end; v_code:=v_base_code;
    end if;
  end if;

  if v_start is null or v_end is null then return null; end if;
  return jsonb_build_object('basis_shift_code',upper(v_code),'start_time',v_start,'end_time',v_end);
end;
$$;

create or replace function public.ta_delete_schedule_rule_assignment_v6120(p_emp_code text,p_work_date date)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;
  delete from public.ta_schedule_rule_assignments where emp_code=p_emp_code and work_date=p_work_date;
  return true;
end;
$$;

-- Keep Smart OFF and extension metadata consistent when Schedule Pro / 7-day
-- pattern / Fill / Paste saves many cells at once.
create or replace function public.ta_sync_bulk_schedule_rules_v6120(p_items jsonb)
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
  v_missing_basis integer:=0;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;

  for v_item in select value from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    v_emp:=nullif(trim(v_item->>'emp_code'),'');
    begin v_date:=(v_item->>'work_date')::date; exception when others then v_date:=null; end;
    v_code:=upper(nullif(trim(coalesce(v_item->>'shift_code','')),''));
    v_note:=nullif(v_item->>'note','');
    if v_emp is null or v_date is null then continue; end if;

    if coalesce(v_code,'')<>'OFF' then
      delete from public.ta_schedule_rule_assignments a where a.emp_code=v_emp and a.work_date=v_date;
      get diagnostics v_deleted = row_count;
      v_cleared:=v_cleared+v_deleted;
      continue;
    end if;

    v_basis_code:=null; v_basis_start:=null; v_basis_end:=null; v_basis_mode:=null;
    v_basis_base_code:=null; v_basis_custom_start:=null; v_basis_custom_end:=null;

    select c.shift_code,s.start_time,s.end_time,a.work_mode_code,a.base_shift_code,a.custom_start_time,a.custom_end_time
      into v_basis_code,v_basis_start,v_basis_end,v_basis_mode,v_basis_base_code,v_basis_custom_start,v_basis_custom_end
    from public.shift_calendar c
    left join public.shift_master s on upper(s.shift_code)=upper(c.shift_code)
    left join public.ta_schedule_rule_assignments a on a.emp_code=c.emp_code::text and a.work_date=c.work_date
    where c.emp_code::text=v_emp
      and c.work_date<v_date
      and c.work_date>=v_date-14
      and upper(coalesce(c.shift_code,'')) not in ('OFF','HOL','LV')
      and coalesce(s.is_workday,true)=true
    order by c.work_date desc
    limit 1;

    if upper(coalesce(v_basis_mode,''))='HOUR_BASED' and v_basis_custom_start is not null and v_basis_custom_end is not null then
      v_basis_start:=v_basis_custom_start; v_basis_end:=v_basis_custom_end;
    elsif upper(coalesce(v_basis_mode,''))='SPLIT_WAIT_NIGHT' and v_basis_base_code is not null then
      select s.start_time,s.end_time into v_base_start,v_base_end
      from public.shift_master s where upper(s.shift_code)=upper(v_basis_base_code) limit 1;
      if v_base_start is not null and v_base_end is not null then
        v_basis_start:=v_base_start; v_basis_end:=v_base_end; v_basis_code:=v_basis_base_code;
      end if;
    end if;

    if v_basis_start is null or v_basis_end is null then
      delete from public.ta_schedule_rule_assignments a where a.emp_code=v_emp and a.work_date=v_date;
      v_missing_basis:=v_missing_basis+1;
      continue;
    end if;

    insert into public.ta_schedule_rule_assignments(
      emp_code,work_date,work_mode_code,base_shift_code,generated_shift_code,
      first_segment_end,second_segment_start,second_segment_planned_end,custom_start_time,custom_end_time,
      off_window_start,off_window_end,off_basis_shift_code,planned_minutes,validation_snapshot,note,created_by,updated_by
    ) values(
      v_emp,v_date,'DYNAMIC_OFF',null,null,null,null,null,null,null,
      v_basis_start,v_basis_end,upper(v_basis_code),0,'{}'::jsonb,
      coalesce(v_note,'Smart OFF จากการจัดกะแบบหลายรายการ'),auth.uid(),auth.uid()
    )
    on conflict(emp_code,work_date) do update set
      work_mode_code='DYNAMIC_OFF',base_shift_code=null,generated_shift_code=null,
      first_segment_end=null,second_segment_start=null,second_segment_planned_end=null,custom_start_time=null,custom_end_time=null,
      off_window_start=excluded.off_window_start,off_window_end=excluded.off_window_end,off_basis_shift_code=excluded.off_basis_shift_code,
      planned_minutes=0,validation_snapshot='{}'::jsonb,note=excluded.note,updated_at=now(),updated_by=auth.uid();
    v_synced:=v_synced+1;
  end loop;

  return jsonb_build_object('ok',true,'smart_off_synced',v_synced,'extensions_cleared',v_cleared,'missing_basis',v_missing_basis);
end;
$$;

-- 8) Scheduling guard ---------------------------------------------------------
create or replace function public.ta_validate_schedule_guard_v6120(
  p_emp_code text,
  p_work_date date,
  p_proposed_shift_code text,
  p_proposed_start_time time default null,
  p_proposed_end_time time default null,
  p_proposed_planned_minutes integer default 0,
  p_is_off boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_prev_start time;
  v_prev_end time;
  v_prev_code text;
  v_prev_is_workday boolean;
  v_prev_mode text;
  v_prev_second_start time;
  v_prev_second_end time;
  v_prev_end_ts timestamp;
  v_start_ts timestamp;
  v_rest integer;
  v_last_off date;
  v_cont integer:=0;
  v_after integer:=0;
  v_hard boolean:=false;
  v_warn boolean:=false;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;

  select c.shift_code,s.start_time,s.end_time,coalesce(s.is_workday,true),a.work_mode_code,a.second_segment_start,a.second_segment_planned_end
    into v_prev_code,v_prev_start,v_prev_end,v_prev_is_workday,v_prev_mode,v_prev_second_start,v_prev_second_end
  from public.shift_calendar c
  left join public.shift_master s on upper(s.shift_code)=upper(c.shift_code)
  left join public.ta_schedule_rule_assignments a on a.emp_code=c.emp_code::text and a.work_date=c.work_date
  where c.emp_code::text=p_emp_code and c.work_date=p_work_date-1
  limit 1;

  -- Split Wait Night ends at the planned end of the second working segment,
  -- not at the generated first-segment Shift Master end.
  if upper(coalesce(v_prev_mode,''))='SPLIT_WAIT_NIGHT' and v_prev_second_start is not null and v_prev_second_end is not null then
    v_prev_start:=v_prev_second_start;
    v_prev_end:=v_prev_second_end;
  end if;

  if not p_is_off and v_prev_code is not null and v_prev_is_workday and upper(v_prev_code) not in ('OFF','HOL','LV') and v_prev_end is not null and p_proposed_start_time is not null then
    v_prev_end_ts := (p_work_date-1)::timestamp + v_prev_end;
    if v_prev_end<=coalesce(v_prev_start,v_prev_end) then v_prev_end_ts:=v_prev_end_ts+interval '1 day'; end if;
    v_start_ts := p_work_date::timestamp + p_proposed_start_time;
    v_rest := floor(extract(epoch from (v_start_ts-v_prev_end_ts))/60);
    v_hard := v_rest<360;
  end if;

  select max(c.work_date) into v_last_off
  from public.shift_calendar c
  left join public.shift_master s on upper(s.shift_code)=upper(c.shift_code)
  where c.emp_code::text=p_emp_code
    and c.work_date<p_work_date
    and c.work_date>=p_work_date-31
    and (upper(c.shift_code) in ('OFF','HOL','LV') or coalesce(s.is_workday,true)=false);

  select coalesce(sum(
    case
      when upper(c.shift_code) in ('OFF','HOL','LV') or coalesce(s.is_workday,true)=false then 0
      when upper(coalesce(a.work_mode_code,'')) in ('SPLIT_WAIT_NIGHT','HOUR_BASED') and coalesce(a.planned_minutes,0)>0 then a.planned_minutes
      when s.start_time is null or s.end_time is null then 0
      else mod((extract(epoch from s.end_time)::integer-extract(epoch from s.start_time)::integer)+86400,86400)/60
    end
  ),0)::integer into v_cont
  from public.shift_calendar c
  left join public.shift_master s on upper(s.shift_code)=upper(c.shift_code)
  left join public.ta_schedule_rule_assignments a on a.emp_code=c.emp_code::text and a.work_date=c.work_date
  where c.emp_code::text=p_emp_code
    and c.work_date<p_work_date
    and c.work_date>coalesce(v_last_off,p_work_date-32);

  v_after := case when p_is_off then 0 else v_cont+greatest(coalesce(p_proposed_planned_minutes,0),0) end;
  v_warn := not p_is_off and v_after>2880;

  return jsonb_build_object(
    'hard_block',v_hard,
    'rest_minutes',v_rest,
    'minimum_rest_minutes',360,
    'continuous_minutes_before',v_cont,
    'continuous_minutes_after',v_after,
    'warning_48h',v_warn,
    'message',case when v_hard then 'เวลาพักจากกะก่อนหน้าต่ำกว่า 6 ชั่วโมง' when v_warn then 'ชั่วโมงทำงานต่อเนื่องเกิน 48 ชั่วโมง ควรกำหนดวันหยุด' else null end
  );
end;
$$;

-- 9) Day-off quota RPCs -------------------------------------------------------
create or replace function public.ta_get_dayoff_settings_v6120()
returns jsonb
language sql
security definer
set search_path=public
as $$
  select to_jsonb(s) from public.ta_dayoff_settings s where setting_id=1;
$$;

create or replace function public.ta_save_dayoff_settings_v6120(p_effective_start_month date)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public.ta_v6120_is_hr_admin() then raise exception 'HR_ADMIN_REQUIRED'; end if;
  if p_effective_start_month is null then raise exception 'EFFECTIVE_START_MONTH_REQUIRED'; end if;
  update public.ta_dayoff_settings
     set effective_start_month=date_trunc('month',p_effective_start_month)::date,updated_at=now(),updated_by=auth.uid()
   where setting_id=1;
  return public.ta_get_dayoff_settings_v6120();
end;
$$;

create or replace function public.ta_get_dayoff_balance_v6120(p_emp_code text,p_month date)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_target date:=date_trunc('month',p_month)::date;
  v_start date;
  v_position text;
  v_manager_pattern text;
  v_dows integer[];
  v_month date;
  v_quota integer:=0;
  v_used integer:=0;
  v_balance numeric:=0;
  v_carry numeric:=0;
  v_open numeric:=0;
  v_carry_enabled boolean:=true;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;
  select effective_start_month,manager_position_pattern,carry_forward_enabled
    into v_start,v_manager_pattern,v_carry_enabled
  from public.ta_dayoff_settings where setting_id=1;

  select e.position_name into v_position from public.employees e where e."EmployeeId"::text=p_emp_code limit 1;
  select case when coalesce(v_position,'') ilike '%'||v_manager_pattern||'%' then manager_weekly_off_dows else other_weekly_off_dows end
    into v_dows from public.ta_dayoff_settings where setting_id=1;

  if v_target<v_start then
    return jsonb_build_object('emp_code',p_emp_code,'month',v_target,'month_quota_days',0,'used_days',0,'carried_in_days',0,'balance_days',0,'status','NOT_STARTED');
  end if;

  select coalesce(opening_days,0) into v_open from public.ta_dayoff_opening_balance where emp_code=p_emp_code and start_month=v_start;
  v_balance:=coalesce(v_open,0);

  for v_month in select generate_series(v_start,v_target,interval '1 month')::date loop
    v_carry:=case when v_carry_enabled then v_balance else 0 end;
    select count(*)::integer into v_quota
    from generate_series(v_month,(v_month+interval '1 month'-interval '1 day')::date,interval '1 day') d(day_value)
    where extract(dow from d.day_value)::integer=any(v_dows)
       or exists(select 1 from public.holidays h where h.holiday_date=d.day_value::date);

    select count(*)::integer into v_used
    from public.shift_calendar c
    where c.emp_code::text=p_emp_code
      and c.work_date>=v_month and c.work_date<(v_month+interval '1 month')::date
      and upper(coalesce(c.shift_code,'')) in ('OFF','HOL');

    v_balance:=v_carry+v_quota-v_used;
  end loop;

  return jsonb_build_object(
    'emp_code',p_emp_code,'position_name',v_position,'month',v_target,
    'effective_start_month',v_start,'opening_days',v_open,
    'month_quota_days',v_quota,'used_days',v_used,'carried_in_days',v_carry,'balance_days',v_balance,'status','ACTIVE'
  );
end;
$$;

-- 10) Grants ------------------------------------------------------------------
revoke all on public.ta_work_modes,public.ta_work_mode_scopes,public.ta_schedule_rule_assignments,public.ta_dayoff_settings,public.ta_dayoff_opening_balance from anon,authenticated;
grant execute on function public.ta_get_work_mode_admin_v6120() to authenticated;
grant execute on function public.ta_save_work_mode_config_v6120(text,boolean,text,text[]) to authenticated;
grant execute on function public.ta_get_work_modes_for_employee_v6120(text,date) to authenticated;
grant execute on function public.ta_resolve_hour_based_shift_v6120(text,time,integer,integer) to authenticated;
grant execute on function public.ta_resolve_split_wait_shift_v6120(text,text,time) to authenticated;
grant execute on function public.ta_upsert_schedule_rule_assignment_v6120(text,date,text,text,text,time,time,time,time,time,time,time,text,integer,jsonb,text) to authenticated;
grant execute on function public.ta_get_schedule_rule_assignment_v6120(text,date) to authenticated;
grant execute on function public.ta_get_schedule_rule_assignments_v6120(text[],date,date) to authenticated;
grant execute on function public.ta_get_dynamic_off_basis_v6120(text,date) to authenticated;
grant execute on function public.ta_delete_schedule_rule_assignment_v6120(text,date) to authenticated;
grant execute on function public.ta_sync_bulk_schedule_rules_v6120(jsonb) to authenticated;
grant execute on function public.ta_validate_schedule_guard_v6120(text,date,text,time,time,integer,boolean) to authenticated;
grant execute on function public.ta_get_dayoff_settings_v6120() to authenticated;
grant execute on function public.ta_save_dayoff_settings_v6120(date) to authenticated;
grant execute on function public.ta_get_dayoff_balance_v6120(text,date) to authenticated;

commit;
