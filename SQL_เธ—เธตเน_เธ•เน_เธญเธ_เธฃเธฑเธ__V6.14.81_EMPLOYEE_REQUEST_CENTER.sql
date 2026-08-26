-- ================================================================
-- TimeClock Enterprise V6.14.81
-- Employee Request Center: Time Issue + Special Work Notice
-- ================================================================

begin;

create extension if not exists pgcrypto;

create sequence if not exists public.ta_employee_request_seq_v61481;

create table if not exists public.ta_employee_requests_v61481 (
  request_id uuid primary key default gen_random_uuid(),
  request_no text unique,
  request_type text not null,
  request_subtype text not null,
  emp_code text not null,
  work_date date not null,
  reason text not null,
  detail jsonb not null default '{}'::jsonb,
  manager_email text,
  status text not null default 'PENDING',
  requested_by uuid not null,
  requested_by_email text,
  requested_at timestamptz not null default now(),
  decided_by uuid,
  decided_by_email text,
  decided_at timestamptz,
  decision_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ta_employee_requests_v61481_type_ck
    check (request_type in ('TIME_ISSUE','SPECIAL_WORK')),
  constraint ta_employee_requests_v61481_subtype_ck
    check (
      (request_type='TIME_ISSUE' and request_subtype in ('MISSING_IN','MISSING_OUT','WRONG_TIME'))
      or
      (request_type='SPECIAL_WORK' and request_subtype in ('NORMAL_LATE_CUSTOMER','SPLIT_WAIT_NIGHT','HOUR_BASED'))
    ),
  constraint ta_employee_requests_v61481_status_ck
    check (status in ('PENDING','IN_REVIEW','APPROVED','REJECTED','RESOLVED','CANCELLED'))
);

create index if not exists idx_ta_employee_requests_v61481_emp_date
  on public.ta_employee_requests_v61481(emp_code, work_date);
create index if not exists idx_ta_employee_requests_v61481_manager_status
  on public.ta_employee_requests_v61481(lower(manager_email), status, work_date);
create index if not exists idx_ta_employee_requests_v61481_requested_by
  on public.ta_employee_requests_v61481(requested_by, requested_at desc);

create table if not exists public.ta_employee_request_notifications_v61481 (
  notification_id uuid primary key default gen_random_uuid(),
  request_id uuid references public.ta_employee_requests_v61481(request_id) on delete cascade,
  target_user_id uuid not null,
  title text not null,
  message text not null,
  severity text not null default 'info',
  target_page text not null default 'shift-requests',
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists idx_ta_employee_request_notifications_v61481_target
  on public.ta_employee_request_notifications_v61481(target_user_id, is_read, created_at desc);

create or replace function public._ta_employee_request_number_v61481()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(new.request_no),'') is null then
    new.request_no := 'ERQ-' || to_char(coalesce(new.requested_at,now()),'YYYYMMDD') || '-' ||
      lpad(nextval('public.ta_employee_request_seq_v61481')::text,6,'0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_ta_employee_request_number_v61481 on public.ta_employee_requests_v61481;
create trigger trg_ta_employee_request_number_v61481
before insert or update on public.ta_employee_requests_v61481
for each row execute function public._ta_employee_request_number_v61481();

create or replace function public._ta_request_manager_email_v61481(
  p_emp_code text,
  p_work_date date
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
begin
  begin
    execute $q$
      select lower(nullif(trim(manager_email),''))
      from public.ta_get_schedule_manager_map_v61124($1,$2)
      where nullif(trim(manager_email),'') is not null
      limit 1
    $q$
    into v_email
    using array[trim(p_emp_code)]::text[], p_work_date;
  exception when undefined_function then
    raise exception 'MANAGER_RESOLVER_V61124_REQUIRED';
  end;

  return v_email;
end;
$$;

create or replace function public._ta_request_notify_v61481(
  p_request_id uuid,
  p_target_user_id uuid,
  p_title text,
  p_message text,
  p_severity text default 'info'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_target_user_id is null then
    return;
  end if;

  insert into public.ta_employee_request_notifications_v61481(
    request_id,target_user_id,title,message,severity,target_page
  ) values (
    p_request_id,p_target_user_id,p_title,p_message,coalesce(nullif(p_severity,''),'info'),'shift-requests'
  );
end;
$$;

create or replace function public.ta_submit_employee_request_v61481(
  p_emp_code text,
  p_work_date date,
  p_request_type text,
  p_request_subtype text,
  p_reason text,
  p_detail jsonb default '{}'::jsonb
)
returns public.ta_employee_requests_v61481
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.ta_user_profiles%rowtype;
  v_type text := upper(trim(coalesce(p_request_type,'')));
  v_subtype text := upper(trim(coalesce(p_request_subtype,'')));
  v_emp text := trim(coalesce(p_emp_code,''));
  v_manager_email text;
  v_manager_user uuid;
  v_request public.ta_employee_requests_v61481%rowtype;
  v_title text;
begin
  select * into v_profile
  from public.ta_user_profiles
  where user_id = auth.uid()
    and is_active = true
  limit 1;

  if v_profile.user_id is null then
    raise exception 'ACTIVE_USER_PROFILE_REQUIRED';
  end if;
  if v_emp = '' or p_work_date is null or nullif(trim(p_reason),'') is null then
    raise exception 'REQUEST_REQUIRED_FIELDS_MISSING';
  end if;
  if nullif(trim(coalesce(v_profile.emp_code,'')),'') is null
     or trim(v_profile.emp_code) <> v_emp then
    raise exception 'SELF_REQUEST_ONLY';
  end if;
  if v_type not in ('TIME_ISSUE','SPECIAL_WORK') then
    raise exception 'INVALID_REQUEST_TYPE';
  end if;
  if (v_type='TIME_ISSUE' and v_subtype not in ('MISSING_IN','MISSING_OUT','WRONG_TIME'))
     or (v_type='SPECIAL_WORK' and v_subtype not in ('NORMAL_LATE_CUSTOMER','SPLIT_WAIT_NIGHT','HOUR_BASED')) then
    raise exception 'INVALID_REQUEST_SUBTYPE';
  end if;

  v_manager_email := public._ta_request_manager_email_v61481(v_emp,p_work_date);
  if v_manager_email is null then
    raise exception 'ACTIVE_MANAGER_NOT_FOUND_FOR_EMPLOYEE';
  end if;

  select user_id into v_manager_user
  from public.ta_user_profiles
  where lower(email) = lower(v_manager_email)
    and is_active = true
  order by updated_at desc nulls last
  limit 1;

  insert into public.ta_employee_requests_v61481(
    request_type,request_subtype,emp_code,work_date,reason,detail,
    manager_email,status,requested_by,requested_by_email
  ) values (
    v_type,v_subtype,v_emp,p_work_date,trim(p_reason),coalesce(p_detail,'{}'::jsonb),
    v_manager_email,'PENDING',auth.uid(),v_profile.email
  )
  returning * into v_request;

  v_title := case v_type
    when 'TIME_ISSUE' then 'มีแจ้งปัญหาเวลาทำงานใหม่'
    else 'มีแจ้งงานกะพิเศษใหม่'
  end;

  perform public._ta_request_notify_v61481(
    v_request.request_id,
    v_manager_user,
    v_title,
    v_emp || ' • ' || to_char(p_work_date,'DD/MM/YYYY') || ' • ' || trim(p_reason),
    'warning'
  );

  return v_request;
end;
$$;

create or replace function public.ta_get_employee_requests_v61481(
  p_start_date date,
  p_end_date date,
  p_statuses text[] default null,
  p_request_types text[] default null,
  p_search text default null,
  p_limit integer default 3000
)
returns table (
  request_id uuid,
  request_no text,
  request_type text,
  request_subtype text,
  emp_code text,
  full_name text,
  work_date date,
  reason text,
  detail jsonb,
  manager_email text,
  status text,
  requested_by uuid,
  requested_by_email text,
  requested_by_self boolean,
  requested_at timestamptz,
  decided_by_email text,
  decided_at timestamptz,
  decision_note text,
  resolved_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.ta_user_profiles%rowtype;
  v_role text;
  v_email text;
  v_search text := nullif(trim(coalesce(p_search,'')),'');
begin
  select * into v_profile
  from public.ta_user_profiles
  where user_id = auth.uid()
    and is_active = true
  limit 1;

  if v_profile.user_id is null then
    raise exception 'ACTIVE_USER_PROFILE_REQUIRED';
  end if;

  v_role := upper(coalesce(v_profile.role,'VIEWER'));
  v_email := lower(coalesce(v_profile.email,''));

  return query
  select
    r.request_id,r.request_no,r.request_type,r.request_subtype,r.emp_code,
    coalesce(e.full_name,'')::text,
    r.work_date,r.reason,r.detail,r.manager_email,r.status,
    r.requested_by,r.requested_by_email,
    (r.requested_by = auth.uid()) as requested_by_self,
    r.requested_at,r.decided_by_email,r.decided_at,r.decision_note,r.resolved_at,r.created_at
  from public.ta_employee_requests_v61481 r
  left join public.employees e
    on trim(e."EmployeeId"::text) = r.emp_code
  where r.work_date between p_start_date and p_end_date
    and (
      v_role = 'HR_ADMIN'
      or lower(coalesce(r.manager_email,'')) = v_email
      or r.requested_by = auth.uid()
    )
    and (p_statuses is null or upper(r.status) = any(array(select upper(x) from unnest(p_statuses) x)))
    and (p_request_types is null or upper(r.request_type) = any(array(select upper(x) from unnest(p_request_types) x)))
    and (
      v_search is null
      or r.request_no ilike '%'||v_search||'%'
      or r.emp_code ilike '%'||v_search||'%'
      or coalesce(e.full_name,'') ilike '%'||v_search||'%'
      or r.reason ilike '%'||v_search||'%'
      or r.detail::text ilike '%'||v_search||'%'
    )
  order by r.requested_at desc
  limit greatest(1,least(coalesce(p_limit,3000),5000));
end;
$$;

create or replace function public._ta_request_manager_authorized_v61481(p_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_email text;
  v_manager_email text;
begin
  select upper(coalesce(role,'VIEWER')), lower(coalesce(email,''))
    into v_role,v_email
  from public.ta_user_profiles
  where user_id=auth.uid() and is_active=true
  limit 1;

  select lower(coalesce(manager_email,'')) into v_manager_email
  from public.ta_employee_requests_v61481
  where request_id=p_request_id;

  return coalesce(v_role='HR_ADMIN' or (v_role='MANAGER' and v_email=v_manager_email),false);
end;
$$;

create or replace function public.ta_mark_employee_request_in_review_v61481(p_request_id uuid)
returns public.ta_employee_requests_v61481
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.ta_employee_requests_v61481%rowtype;
begin
  if not public._ta_request_manager_authorized_v61481(p_request_id) then
    raise exception 'REQUEST_DECISION_PERMISSION_DENIED';
  end if;

  update public.ta_employee_requests_v61481
  set status=case when status='PENDING' then 'IN_REVIEW' else status end,
      updated_at=now()
  where request_id=p_request_id
    and status in ('PENDING','IN_REVIEW')
  returning * into v_row;

  if v_row.request_id is null then raise exception 'REQUEST_NOT_ACTIVE'; end if;
  return v_row;
end;
$$;

create or replace function public.ta_resolve_employee_request_v61481(
  p_request_id uuid,
  p_note text default null
)
returns public.ta_employee_requests_v61481
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ta_employee_requests_v61481%rowtype;
  v_actor_email text;
begin
  select email into v_actor_email from public.ta_user_profiles where user_id=auth.uid() and is_active=true limit 1;
  if not public._ta_request_manager_authorized_v61481(p_request_id) then
    raise exception 'REQUEST_DECISION_PERMISSION_DENIED';
  end if;

  update public.ta_employee_requests_v61481
  set status='RESOLVED',
      decided_by=auth.uid(),
      decided_by_email=v_actor_email,
      decided_at=now(),
      decision_note=coalesce(nullif(trim(p_note),''),decision_note),
      resolved_at=now(),
      updated_at=now()
  where request_id=p_request_id
    and status in ('PENDING','IN_REVIEW')
  returning * into v_row;

  if v_row.request_id is null then raise exception 'REQUEST_NOT_ACTIVE'; end if;

  perform public._ta_request_notify_v61481(
    v_row.request_id,
    v_row.requested_by,
    'คำขอของคุณดำเนินการแล้ว',
    v_row.request_no || ' • ' || to_char(v_row.work_date,'DD/MM/YYYY') ||
      case when nullif(trim(coalesce(p_note,'')),'') is not null then ' • '||trim(p_note) else '' end,
    'success'
  );

  return v_row;
end;
$$;

create or replace function public.ta_decide_employee_request_v61481(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns public.ta_employee_requests_v61481
language plpgsql
security definer
set search_path = public
as $$
declare
  v_decision text := upper(trim(coalesce(p_decision,'')));
  v_row public.ta_employee_requests_v61481%rowtype;
  v_actor_email text;
begin
  select email into v_actor_email from public.ta_user_profiles where user_id=auth.uid() and is_active=true limit 1;
  if v_decision not in ('REJECTED','APPROVED') then
    raise exception 'INVALID_REQUEST_DECISION';
  end if;
  if not public._ta_request_manager_authorized_v61481(p_request_id) then
    raise exception 'REQUEST_DECISION_PERMISSION_DENIED';
  end if;

  update public.ta_employee_requests_v61481
  set status=v_decision,
      decided_by=auth.uid(),
      decided_by_email=v_actor_email,
      decided_at=now(),
      decision_note=nullif(trim(coalesce(p_note,'')),''),
      resolved_at=case when v_decision='APPROVED' then now() else resolved_at end,
      updated_at=now()
  where request_id=p_request_id
    and status in ('PENDING','IN_REVIEW')
  returning * into v_row;

  if v_row.request_id is null then raise exception 'REQUEST_NOT_ACTIVE'; end if;

  perform public._ta_request_notify_v61481(
    v_row.request_id,
    v_row.requested_by,
    case when v_decision='REJECTED' then 'คำขอไม่ได้รับอนุมัติ' else 'คำขอได้รับอนุมัติ' end,
    v_row.request_no || ' • ' || to_char(v_row.work_date,'DD/MM/YYYY') ||
      case when nullif(trim(coalesce(p_note,'')),'') is not null then ' • '||trim(p_note) else '' end,
    case when v_decision='REJECTED' then 'danger' else 'success' end
  );

  return v_row;
end;
$$;

create or replace function public.ta_cancel_employee_request_v61481(p_request_id uuid)
returns public.ta_employee_requests_v61481
language plpgsql
security definer
set search_path = public
as $$
declare v_row public.ta_employee_requests_v61481%rowtype;
begin
  update public.ta_employee_requests_v61481
  set status='CANCELLED', updated_at=now()
  where request_id=p_request_id
    and requested_by=auth.uid()
    and status='PENDING'
  returning * into v_row;

  if v_row.request_id is null then raise exception 'REQUEST_CANCEL_NOT_ALLOWED'; end if;
  return v_row;
end;
$$;

create or replace function public.ta_get_employee_request_notifications_v61481(p_limit integer default 50)
returns table(
  notification_id uuid,
  request_id uuid,
  title text,
  message text,
  severity text,
  target_page text,
  is_read boolean,
  created_at timestamptz,
  event_date date
)
language sql
security definer
set search_path = public
as $$
  select n.notification_id,n.request_id,n.title,n.message,n.severity,n.target_page,n.is_read,n.created_at,n.created_at::date
  from public.ta_employee_request_notifications_v61481 n
  where n.target_user_id=auth.uid()
  order by n.created_at desc
  limit greatest(1,least(coalesce(p_limit,50),200));
$$;

create or replace function public.ta_mark_employee_request_notification_read_v61481(p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ta_employee_request_notifications_v61481
  set is_read=true, read_at=coalesce(read_at,now())
  where notification_id=p_notification_id
    and target_user_id=auth.uid();
  return found;
end;
$$;

alter table public.ta_employee_requests_v61481 enable row level security;
alter table public.ta_employee_request_notifications_v61481 enable row level security;

revoke all on public.ta_employee_requests_v61481 from anon, authenticated;
revoke all on public.ta_employee_request_notifications_v61481 from anon, authenticated;
revoke all on sequence public.ta_employee_request_seq_v61481 from anon, authenticated;

revoke all on function public._ta_employee_request_number_v61481() from public, anon, authenticated;
revoke all on function public._ta_request_manager_email_v61481(text,date) from public, anon, authenticated;
revoke all on function public._ta_request_notify_v61481(uuid,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public._ta_request_manager_authorized_v61481(uuid) from public, anon, authenticated;
revoke all on function public.ta_submit_employee_request_v61481(text,date,text,text,text,jsonb) from public, anon, authenticated;
revoke all on function public.ta_get_employee_requests_v61481(date,date,text[],text[],text,integer) from public, anon, authenticated;
revoke all on function public.ta_mark_employee_request_in_review_v61481(uuid) from public, anon, authenticated;
revoke all on function public.ta_resolve_employee_request_v61481(uuid,text) from public, anon, authenticated;
revoke all on function public.ta_decide_employee_request_v61481(uuid,text,text) from public, anon, authenticated;
revoke all on function public.ta_cancel_employee_request_v61481(uuid) from public, anon, authenticated;
revoke all on function public.ta_get_employee_request_notifications_v61481(integer) from public, anon, authenticated;
revoke all on function public.ta_mark_employee_request_notification_read_v61481(uuid) from public, anon, authenticated;

grant execute on function public.ta_submit_employee_request_v61481(text,date,text,text,text,jsonb) to authenticated;
grant execute on function public.ta_get_employee_requests_v61481(date,date,text[],text[],text,integer) to authenticated;
grant execute on function public.ta_mark_employee_request_in_review_v61481(uuid) to authenticated;
grant execute on function public.ta_resolve_employee_request_v61481(uuid,text) to authenticated;
grant execute on function public.ta_decide_employee_request_v61481(uuid,text,text) to authenticated;
grant execute on function public.ta_cancel_employee_request_v61481(uuid) to authenticated;
grant execute on function public.ta_get_employee_request_notifications_v61481(integer) to authenticated;
grant execute on function public.ta_mark_employee_request_notification_read_v61481(uuid) to authenticated;

commit;
