-- =====================================================================
-- Time-Clock Enterprise V6.0 - Functional Complete
-- ต่อจาก V5.6.3
-- เพิ่ม Schedule Publish/Lock, Review Resolution, Audit, Employee Directory,
-- Export Job Log และ Notification Feed
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) สถานะการจัดกะรายเดือน
-- ---------------------------------------------------------------------
create table if not exists public.ta_schedule_month_status (
  id bigserial primary key,
  month_start date not null,
  zone_key text not null default '*',
  department_key text not null default '*',
  status text not null default 'DRAFT',
  note text,
  published_at timestamptz,
  published_by uuid,
  published_by_email text,
  locked_at timestamptz,
  locked_by uuid,
  locked_by_email text,
  updated_at timestamptz not null default now(),
  constraint ck_ta_schedule_month_status_month check (month_start = date_trunc('month', month_start)::date),
  constraint ck_ta_schedule_month_status_status check (status in ('DRAFT','PUBLISHED','LOCKED')),
  constraint uq_ta_schedule_month_status unique (month_start, zone_key, department_key)
);

create index if not exists idx_ta_schedule_month_status_lookup
  on public.ta_schedule_month_status(month_start, zone_key, department_key, status);

alter table public.ta_schedule_month_status enable row level security;

drop policy if exists ta_schedule_month_status_select on public.ta_schedule_month_status;
create policy ta_schedule_month_status_select
on public.ta_schedule_month_status
for select
to authenticated
using (
  exists (
    select 1 from public.ta_user_profiles p
    where p.user_id = auth.uid() and coalesce(p.is_active,false)
  )
);

grant select on public.ta_schedule_month_status to authenticated;
grant usage, select on sequence public.ta_schedule_month_status_id_seq to authenticated;

create or replace function public._ta_can_manage_schedule_month(
  p_zone text default null,
  p_department text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_active boolean;
begin
  select role, is_active into v_role, v_active
  from public.ta_user_profiles
  where user_id = auth.uid();

  if not coalesce(v_active,false) then return false; end if;
  if v_role = 'HR_ADMIN' then return true; end if;
  if v_role <> 'USER' then return false; end if;

  return exists (
    select 1
    from public.ta_user_scopes s
    where s.user_id = auth.uid()
      and coalesce(s.is_active,true)
      and coalesce(s.can_confirm_schedule,false)
      and (
        upper(coalesce(s.scope_type,'')) = 'ALL'
        or (p_zone is not null and upper(s.scope_type) in ('ZONE','AREA') and s.scope_value = p_zone)
        or (p_department is not null and upper(s.scope_type) = 'DEPARTMENT' and s.scope_value = p_department)
      )
  );
exception when undefined_table or undefined_column then
  return v_role = 'HR_ADMIN';
end;
$$;

revoke all on function public._ta_can_manage_schedule_month(text,text) from public;

create or replace function public.ta_get_schedule_month_status(
  p_month date,
  p_zone text default null,
  p_department text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'month_start', s.month_start,
        'zone', nullif(s.zone_key,'*'),
        'department', nullif(s.department_key,'*'),
        'status', s.status,
        'note', s.note,
        'published_at', s.published_at,
        'published_by_email', s.published_by_email,
        'locked_at', s.locked_at,
        'locked_by_email', s.locked_by_email,
        'updated_at', s.updated_at
      )
      from public.ta_schedule_month_status s
      where s.month_start = date_trunc('month', p_month)::date
        and s.zone_key = coalesce(nullif(trim(p_zone),''),'*')
        and s.department_key = coalesce(nullif(trim(p_department),''),'*')
      limit 1
    ),
    jsonb_build_object(
      'month_start', date_trunc('month', p_month)::date,
      'zone', p_zone,
      'department', p_department,
      'status', 'DRAFT'
    )
  );
$$;

grant execute on function public.ta_get_schedule_month_status(date,text,text) to authenticated;

create or replace function public.ta_set_schedule_month_status(
  p_month date,
  p_zone text default null,
  p_department text default null,
  p_action text default 'PUBLISH',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month date := date_trunc('month', p_month)::date;
  v_zone text := coalesce(nullif(trim(p_zone),''),'*');
  v_department text := coalesce(nullif(trim(p_department),''),'*');
  v_action text := upper(trim(coalesce(p_action,'PUBLISH')));
  v_status text;
  v_email text := coalesce(auth.jwt()->>'email', auth.uid()::text, 'system');
  v_result jsonb;
  v_unconfirmed integer := 0;
begin
  if not public._ta_can_manage_schedule_month(p_zone,p_department) then
    raise exception 'SCHEDULE_PUBLISH_PERMISSION_DENIED';
  end if;

  if v_action not in ('DRAFT','PUBLISH','LOCK','UNLOCK') then
    raise exception 'INVALID_SCHEDULE_ACTION: %', v_action;
  end if;

  v_status := case v_action
    when 'DRAFT' then 'DRAFT'
    when 'PUBLISH' then 'PUBLISHED'
    when 'LOCK' then 'LOCKED'
    when 'UNLOCK' then 'PUBLISHED'
  end;

  -- การประกาศ/ล็อกเดือนต้องไม่มีกะที่จัดไว้แต่ยังไม่ยืนยัน
  if v_action in ('PUBLISH','LOCK') then
    select count(*)::integer
      into v_unconfirmed
    from public.shift_calendar sc
    left join public.employees e
      on public.normalize_emp_code(e."EmployeeId") = sc.emp_code
    where sc.work_date >= v_month
      and sc.work_date < (v_month + interval '1 month')::date
      and not coalesce(sc.is_confirmed,false)
      and (v_zone = '*' or coalesce(nullif(sc.area,''),nullif(e.zone,''),e.area) = v_zone)
      and (v_department = '*' or e.department = v_department);

    if v_unconfirmed > 0 then
      raise exception 'SCHEDULE_HAS_UNCONFIRMED_SHIFTS: %', v_unconfirmed;
    end if;
  end if;

  insert into public.ta_schedule_month_status as sms (
    month_start, zone_key, department_key, status, note,
    published_at, published_by, published_by_email,
    locked_at, locked_by, locked_by_email, updated_at
  )
  values (
    v_month, v_zone, v_department, v_status, p_note,
    case when v_action in ('PUBLISH','LOCK') then now() else null end,
    case when v_action in ('PUBLISH','LOCK') then auth.uid() else null end,
    case when v_action in ('PUBLISH','LOCK') then v_email else null end,
    case when v_action = 'LOCK' then now() else null end,
    case when v_action = 'LOCK' then auth.uid() else null end,
    case when v_action = 'LOCK' then v_email else null end,
    now()
  )
  on conflict (month_start, zone_key, department_key) do update
  set status = excluded.status,
      note = excluded.note,
      published_at = case
        when v_action in ('PUBLISH','LOCK') then now()
        else sms.published_at
      end,
      published_by = case
        when v_action in ('PUBLISH','LOCK') then auth.uid()
        else sms.published_by
      end,
      published_by_email = case
        when v_action in ('PUBLISH','LOCK') then v_email
        else sms.published_by_email
      end,
      locked_at = case when v_action = 'LOCK' then now() when v_action in ('UNLOCK','DRAFT') then null else sms.locked_at end,
      locked_by = case when v_action = 'LOCK' then auth.uid() when v_action in ('UNLOCK','DRAFT') then null else sms.locked_by end,
      locked_by_email = case when v_action = 'LOCK' then v_email when v_action in ('UNLOCK','DRAFT') then null else sms.locked_by_email end,
      updated_at = now()
  returning jsonb_build_object(
    'month_start', sms.month_start,
    'zone', nullif(sms.zone_key,'*'),
    'department', nullif(sms.department_key,'*'),
    'status', sms.status,
    'note', sms.note,
    'published_at', sms.published_at,
    'published_by_email', sms.published_by_email,
    'locked_at', sms.locked_at,
    'locked_by_email', sms.locked_by_email,
    'updated_at', sms.updated_at
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.ta_set_schedule_month_status(date,text,text,text,text) to authenticated;

-- ป้องกันการแก้ไขกะที่ฐานข้อมูลเมื่อเดือนถูกล็อก
create or replace function public._ta_guard_locked_schedule_month()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp_code text;
  v_work_date date;
  v_row_area text;
  v_zone text;
  v_department text;
begin
  if tg_op = 'DELETE' then
    v_emp_code := old.emp_code;
    v_work_date := old.work_date;
    v_row_area := old.area;
  else
    v_emp_code := new.emp_code;
    v_work_date := new.work_date;
    v_row_area := new.area;
  end if;

  select coalesce(nullif(v_row_area,''),nullif(e.zone,''),e.area), e.department
    into v_zone, v_department
  from public.employees e
  where public.normalize_emp_code(e."EmployeeId") = public.normalize_emp_code(v_emp_code)
  limit 1;

  if exists (
    select 1
    from public.ta_schedule_month_status s
    where s.month_start = date_trunc('month',v_work_date)::date
      and s.status = 'LOCKED'
      and (s.zone_key = '*' or s.zone_key = coalesce(v_zone,''))
      and (s.department_key = '*' or s.department_key = coalesce(v_department,''))
  ) then
    raise exception 'SCHEDULE_MONTH_LOCKED: %', to_char(v_work_date,'YYYY-MM');
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public._ta_guard_locked_schedule_month() from public;

drop trigger if exists trg_ta_guard_locked_schedule_month on public.shift_calendar;
create trigger trg_ta_guard_locked_schedule_month
before insert or update or delete on public.shift_calendar
for each row execute function public._ta_guard_locked_schedule_month();

-- ---------------------------------------------------------------------
-- 2) ปิด/ละเว้นรายการ Review
-- ---------------------------------------------------------------------
create table if not exists public.ta_review_resolutions (
  id bigserial primary key,
  emp_code text not null,
  work_date date not null,
  issue_type text not null,
  resolution_status text not null default 'RESOLVED',
  resolution_note text,
  resolved_by uuid,
  resolved_by_email text,
  resolved_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_ta_review_resolution_status check (resolution_status in ('RESOLVED','IGNORED','REOPENED')),
  constraint uq_ta_review_resolution unique (emp_code, work_date, issue_type)
);

create index if not exists idx_ta_review_resolutions_lookup
  on public.ta_review_resolutions(work_date, emp_code, issue_type, resolution_status);

alter table public.ta_review_resolutions enable row level security;

drop policy if exists ta_review_resolutions_select on public.ta_review_resolutions;
create policy ta_review_resolutions_select
on public.ta_review_resolutions
for select
to authenticated
using (
  exists (
    select 1 from public.ta_user_profiles p
    where p.user_id = auth.uid() and coalesce(p.is_active,false)
  )
);

grant select on public.ta_review_resolutions to authenticated;
grant usage, select on sequence public.ta_review_resolutions_id_seq to authenticated;

create or replace function public.ta_resolve_review_items(
  p_rows jsonb,
  p_action text default 'RESOLVED',
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_active boolean;
  v_action text := upper(trim(coalesce(p_action,'RESOLVED')));
  v_item jsonb;
  v_count integer := 0;
  v_email text := coalesce(auth.jwt()->>'email', auth.uid()::text, 'system');
begin
  select role, is_active into v_role, v_active
  from public.ta_user_profiles where user_id = auth.uid();

  if not coalesce(v_active,false) or v_role not in ('HR_ADMIN','USER') then
    raise exception 'REVIEW_PERMISSION_DENIED';
  end if;
  if v_action not in ('RESOLVED','IGNORED','REOPENED') then
    raise exception 'INVALID_REVIEW_ACTION';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'ROWS_MUST_BE_JSON_ARRAY';
  end if;

  for v_item in select * from jsonb_array_elements(p_rows)
  loop
    if v_role <> 'HR_ADMIN' and not public._ta_can_edit_shift(
      public.normalize_emp_code(v_item->>'emp_code'),
      (v_item->>'work_date')::date,
      false
    ) then
      raise exception 'REVIEW_SCOPE_PERMISSION_DENIED: %|%', v_item->>'emp_code', v_item->>'work_date';
    end if;

    insert into public.ta_review_resolutions (
      emp_code, work_date, issue_type, resolution_status,
      resolution_note, resolved_by, resolved_by_email, resolved_at, updated_at
    ) values (
      public.normalize_emp_code(v_item->>'emp_code'),
      (v_item->>'work_date')::date,
      upper(coalesce(nullif(v_item->>'issue_type',''),'NEED_REVIEW')),
      v_action,
      coalesce(v_item->>'note', p_note),
      auth.uid(), v_email, now(), now()
    )
    on conflict (emp_code, work_date, issue_type) do update
    set resolution_status = excluded.resolution_status,
        resolution_note = excluded.resolution_note,
        resolved_by = excluded.resolved_by,
        resolved_by_email = excluded.resolved_by_email,
        resolved_at = now(),
        updated_at = now();
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('processed_rows',v_count,'action',v_action);
end;
$$;

grant execute on function public.ta_resolve_review_items(jsonb,text,text) to authenticated;

-- ใช้ผลลัพธ์เดิมจาก V5.6.1 แล้วตัดรายการที่ปิดออก
create or replace function public.ta_get_review_queue_v600(
  p_start_date date,
  p_end_date date,
  p_zone text default null,
  p_department text default null,
  p_emp_codes text[] default null,
  p_issue_types text[] default null
)
returns table (
  work_date date,
  emp_code text,
  full_name text,
  department text,
  zone text,
  auto_shift_code text,
  suggested_shift_code text,
  suggestion_confidence numeric,
  assigned_shift_code text,
  effective_shift_code text,
  schedule_status text,
  actual_in_at time,
  actual_out_at time,
  first_in time,
  last_out time,
  attendance_result text,
  attendance_status text,
  time_pair_status text,
  issue_type text
)
language sql
stable
security invoker
set search_path = public
as $$
  select q.*
  from public.ta_get_review_queue(
    p_start_date,p_end_date,p_zone,p_department,p_emp_codes,p_issue_types
  ) q
  where not exists (
    select 1
    from public.ta_review_resolutions r
    where r.emp_code = q.emp_code
      and r.work_date = q.work_date
      and r.issue_type = coalesce(q.issue_type,q.attendance_result,q.attendance_status,'NEED_REVIEW')
      and r.resolution_status in ('RESOLVED','IGNORED')
  );
$$;

grant execute on function public.ta_get_review_queue_v600(date,date,text,text,text[],text[]) to authenticated;

-- ---------------------------------------------------------------------
-- 3) Export Job Log
-- ---------------------------------------------------------------------
create table if not exists public.ta_export_job_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  user_email text,
  report_type text not null,
  file_format text not null,
  date_from date,
  date_to date,
  zone text,
  department text,
  row_count integer not null default 0,
  job_status text not null default 'COMPLETED',
  file_name text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ck_ta_export_job_status check (job_status in ('RUNNING','COMPLETED','FAILED'))
);

create index if not exists idx_ta_export_job_log_user_date
  on public.ta_export_job_log(user_id, created_at desc);

alter table public.ta_export_job_log enable row level security;

drop policy if exists ta_export_job_own_select on public.ta_export_job_log;
create policy ta_export_job_own_select
on public.ta_export_job_log
for select
to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.ta_user_profiles p
    where p.user_id = auth.uid() and p.role = 'HR_ADMIN' and p.is_active
  )
);

drop policy if exists ta_export_job_own_insert on public.ta_export_job_log;
create policy ta_export_job_own_insert
on public.ta_export_job_log
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists ta_export_job_own_update on public.ta_export_job_log;
create policy ta_export_job_own_update
on public.ta_export_job_log
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant select, insert, update on public.ta_export_job_log to authenticated;

-- ---------------------------------------------------------------------
-- 4) Employee Directory สำหรับ HR Admin
-- ---------------------------------------------------------------------
create or replace function public.ta_get_employee_directory(
  p_search text default null,
  p_zone text default null,
  p_department text default null,
  p_active_only boolean default true,
  p_limit integer default 1000,
  p_offset integer default 0
)
returns table (
  emp_code text,
  full_name text,
  position_name text,
  department text,
  pc text,
  zone text,
  area text,
  sub_area text,
  start_date date,
  resign_date date,
  employment_status text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.ta_user_profiles
  where user_id = auth.uid() and is_active;

  if v_role <> 'HR_ADMIN' then
    raise exception 'HR_ADMIN_REQUIRED';
  end if;

  return query
  with filtered as (
    select
      public.normalize_emp_code(e."EmployeeId") as emp_code,
      e.full_name,
      e.position_name,
      e.department,
      e.pc,
      coalesce(nullif(e.zone,''),e.area) as zone,
      e.area,
      e.sub_area,
      e.start_date,
      e.resign_date,
      case
        when e.start_date is not null and e.start_date > current_date then 'WAITING_START'
        when e.resign_date is not null and e.resign_date < current_date then 'RESIGNED'
        else 'ACTIVE'
      end as employment_status
    from public.employees e
    where (not p_active_only or e.resign_date is null or e.resign_date >= current_date)
      and (p_zone is null or coalesce(nullif(e.zone,''),e.area) = p_zone)
      and (p_department is null or e.department = p_department)
      and (
        p_search is null or trim(p_search) = ''
        or public.normalize_emp_code(e."EmployeeId") ilike '%'||trim(p_search)||'%'
        or coalesce(e.full_name,'') ilike '%'||trim(p_search)||'%'
        or coalesce(e.position_name,'') ilike '%'||trim(p_search)||'%'
        or coalesce(e.department,'') ilike '%'||trim(p_search)||'%'
      )
  )
  select f.*, count(*) over() as total_count
  from filtered f
  order by f.emp_code
  limit greatest(1,least(coalesce(p_limit,1000),5000))
  offset greatest(coalesce(p_offset,0),0);
end;
$$;

grant execute on function public.ta_get_employee_directory(text,text,text,boolean,integer,integer) to authenticated;

-- ---------------------------------------------------------------------
-- 5) Shift history และ Audit Center
-- ---------------------------------------------------------------------
create or replace function public.ta_get_shift_assignment_history(
  p_emp_code text default null,
  p_work_date date default null,
  p_limit integer default 200
)
returns table (
  id bigint,
  emp_code text,
  work_date date,
  old_shift_code text,
  new_shift_code text,
  action_type text,
  note text,
  change_reason text,
  confirm_now boolean,
  changed_by_email text,
  changed_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    a.id,a.emp_code,a.work_date,a.old_shift_code,a.new_shift_code,
    a.action_type,a.note,a.change_reason,a.confirm_now,
    a.changed_by_email,a.changed_at
  from public.ta_shift_assignment_audit a
  where (p_emp_code is null or a.emp_code = public.normalize_emp_code(p_emp_code))
    and (p_work_date is null or a.work_date = p_work_date)
  order by a.changed_at desc
  limit greatest(1,least(coalesce(p_limit,200),2000));
$$;

grant execute on function public.ta_get_shift_assignment_history(text,date,integer) to authenticated;

create or replace function public.ta_get_system_audit(
  p_start_date date default current_date - 30,
  p_end_date date default current_date,
  p_action_type text default null,
  p_search text default null,
  p_limit integer default 500
)
returns table (
  event_at timestamptz,
  event_type text,
  action_type text,
  actor_email text,
  entity_key text,
  detail text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.ta_user_profiles
  where user_id = auth.uid() and is_active;
  if v_role <> 'HR_ADMIN' then raise exception 'HR_ADMIN_REQUIRED'; end if;

  return query
  with events as (
    select
      a.changed_at as event_at,
      'SHIFT_ASSIGNMENT'::text as event_type,
      a.action_type,
      a.changed_by_email as actor_email,
      a.emp_code || '|' || a.work_date::text as entity_key,
      concat_ws(' • ', coalesce(a.old_shift_code,'-')||' → '||coalesce(a.new_shift_code,'-'), a.change_reason, a.note) as detail
    from public.ta_shift_assignment_audit a
    where a.changed_at::date between p_start_date and p_end_date

    union all

    select
      s.updated_at,
      'SCHEDULE_MONTH'::text,
      s.status,
      coalesce(s.locked_by_email,s.published_by_email),
      s.month_start::text || '|' || s.zone_key || '|' || s.department_key,
      concat_ws(' • ', 'สถานะ '||s.status, s.note)
    from public.ta_schedule_month_status s
    where s.updated_at::date between p_start_date and p_end_date

    union all

    select
      r.updated_at,
      'REVIEW'::text,
      r.resolution_status,
      r.resolved_by_email,
      r.emp_code || '|' || r.work_date::text || '|' || r.issue_type,
      concat_ws(' • ', r.issue_type, r.resolution_note)
    from public.ta_review_resolutions r
    where r.updated_at::date between p_start_date and p_end_date
  )
  select e.*
  from events e
  where (p_action_type is null or e.action_type = p_action_type or e.event_type = p_action_type)
    and (
      p_search is null or trim(p_search) = ''
      or coalesce(e.actor_email,'') ilike '%'||trim(p_search)||'%'
      or coalesce(e.entity_key,'') ilike '%'||trim(p_search)||'%'
      or coalesce(e.detail,'') ilike '%'||trim(p_search)||'%'
    )
  order by e.event_at desc
  limit greatest(1,least(coalesce(p_limit,500),5000));
end;
$$;

grant execute on function public.ta_get_system_audit(date,date,text,text,integer) to authenticated;

-- ---------------------------------------------------------------------
-- 6) Notification Feed จากข้อมูลจริง
-- ---------------------------------------------------------------------
create or replace function public.ta_get_notification_feed(
  p_start_date date default current_date,
  p_end_date date default current_date,
  p_limit integer default 50
)
returns table (
  notification_type text,
  severity text,
  title text,
  message text,
  entity_key text,
  event_date date,
  target_page text
)
language sql
stable
security invoker
set search_path = public
as $$
  with review_summary as (
    select q.issue_type, count(*)::integer as qty
    from public.ta_get_review_queue_v600(p_start_date,p_end_date,null,null,null,null) q
    group by q.issue_type
  ), rows as (
    select
      'REVIEW'::text as notification_type,
      case when issue_type in ('MISSING_IN','MISSING_OUT','ABSENT') then 'HIGH' else 'MEDIUM' end::text as severity,
      case issue_type
        when 'MISSING_IN' then 'ไม่พบเวลาเข้า'
        when 'MISSING_OUT' then 'ไม่พบเวลาออก'
        when 'ABSENT' then 'ไม่มีข้อมูลเวลา'
        when 'WORKED_ON_OFFDAY' then 'ทำงานในวันหยุด'
        else 'รายการต้องตรวจสอบ'
      end::text as title,
      qty::text || ' รายการในช่วงที่เลือก' as message,
      issue_type as entity_key,
      p_end_date as event_date,
      'review'::text as target_page
    from review_summary
    where qty > 0

    union all

    select
      'SCHEDULE'::text,
      case when s.status = 'LOCKED' then 'INFO' else 'LOW' end,
      'สถานะตารางกะ '||to_char(s.month_start,'MM/YYYY'),
      'สถานะ '||s.status||case when s.note is not null then ' • '||s.note else '' end,
      s.month_start::text||'|'||s.zone_key||'|'||s.department_key,
      s.updated_at::date,
      'schedule'::text
    from public.ta_schedule_month_status s
    where s.updated_at::date between p_start_date and p_end_date
  )
  select * from rows
  order by
    case severity when 'HIGH' then 1 when 'MEDIUM' then 2 when 'INFO' then 3 else 4 end,
    event_date desc
  limit greatest(1,least(coalesce(p_limit,50),200));
$$;

grant execute on function public.ta_get_notification_feed(date,date,integer) to authenticated;

notify pgrst, 'reload schema';

commit;
