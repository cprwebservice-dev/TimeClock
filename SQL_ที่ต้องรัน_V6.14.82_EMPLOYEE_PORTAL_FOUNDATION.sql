-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.82
-- Employee Portal Foundation: HR Bulk Enable + Manager Team Activation + PIN 6
-- ============================================================================

begin;
set local statement_timeout = '0';
select pg_advisory_xact_lock(hashtext('timeclock-v6.14.82-employee-portal-foundation'));

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 0) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.employees') is null then
    raise exception 'MISSING_TABLE: employees';
  end if;
  if to_regclass('public.ta_user_profiles') is null then
    raise exception 'MISSING_TABLE: ta_user_profiles';
  end if;
  if to_regclass('public.ta_employee_requests_v61481') is null then
    raise exception 'MISSING_TABLE: ta_employee_requests_v61481 (run V6.14.81 first)';
  end if;
  if to_regclass('public.attendance_workday') is null then
    raise exception 'MISSING_TABLE: attendance_workday';
  end if;
  if to_regclass('public.shift_calendar') is null then
    raise exception 'MISSING_TABLE: shift_calendar';
  end if;
  if to_regclass('public.shift_master') is null then
    raise exception 'MISSING_TABLE: shift_master';
  end if;
  if to_regclass('public.holidays') is null then
    raise exception 'MISSING_TABLE: holidays';
  end if;
  if to_regprocedure('public._ta_request_manager_email_v61481(text,date)') is null then
    raise exception 'MISSING_FUNCTION: _ta_request_manager_email_v61481';
  end if;
  if to_regprocedure('public.ta_get_schedule_manager_map_v61124(text[],date)') is null then
    raise exception 'MISSING_FUNCTION: ta_get_schedule_manager_map_v61124';
  end if;
  if to_regprocedure('public.ta_resolve_employee_work_pattern_v651(text,date)') is null then
    raise exception 'MISSING_FUNCTION: ta_resolve_employee_work_pattern_v651';
  end if;
  if to_regprocedure('public.ta_resolve_paired_dayoff_shift_v6134(text)') is null then
    raise exception 'MISSING_FUNCTION: ta_resolve_paired_dayoff_shift_v6134';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Portal account / session / team-link / notification tables
-- ---------------------------------------------------------------------------
create table if not exists public.ta_employee_portal_accounts_v61482 (
  portal_account_id uuid primary key default gen_random_uuid(),
  emp_code text not null unique,
  is_enabled boolean not null default false,
  enabled_at timestamptz,
  enabled_by uuid,
  activation_code_hash text,
  activation_generated_at timestamptz,
  activation_expires_at timestamptz,
  activation_generated_by uuid,
  pin_hash text,
  pin_set_at timestamptz,
  activated_at timestamptz,
  failed_attempts integer not null default 0,
  lock_until timestamptz,
  last_login_at timestamptz,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ta_employee_portal_accounts_v61482_enabled
  on public.ta_employee_portal_accounts_v61482(is_enabled, activated_at);

create table if not exists public.ta_employee_portal_sessions_v61482 (
  session_id uuid primary key default gen_random_uuid(),
  portal_account_id uuid not null references public.ta_employee_portal_accounts_v61482(portal_account_id) on delete cascade,
  emp_code text not null,
  token_hash text not null unique,
  device_label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text
);

create index if not exists idx_ta_employee_portal_sessions_v61482_emp
  on public.ta_employee_portal_sessions_v61482(emp_code, expires_at desc)
  where revoked_at is null;

create table if not exists public.ta_employee_portal_team_links_v61482 (
  team_link_id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null,
  manager_email text not null,
  public_token text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  rotated_at timestamptz,
  revoked_at timestamptz
);

create unique index if not exists uq_ta_employee_portal_team_links_v61482_active_manager
  on public.ta_employee_portal_team_links_v61482(manager_user_id)
  where is_active=true;

create table if not exists public.ta_employee_portal_notifications_v61482 (
  notification_id uuid primary key default gen_random_uuid(),
  portal_account_id uuid not null references public.ta_employee_portal_accounts_v61482(portal_account_id) on delete cascade,
  emp_code text not null,
  request_id uuid references public.ta_employee_requests_v61481(request_id) on delete set null,
  title text not null,
  message text not null,
  severity text not null default 'info',
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists idx_ta_employee_portal_notifications_v61482_emp
  on public.ta_employee_portal_notifications_v61482(emp_code, is_read, created_at desc);

create table if not exists public.ta_employee_portal_audit_v61482 (
  audit_id uuid primary key default gen_random_uuid(),
  emp_code text,
  action_type text not null,
  actor_user_id uuid,
  actor_email text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- V6.14.81 requests can also originate from PIN Portal (no Supabase auth user).
alter table public.ta_employee_requests_v61481
  alter column requested_by drop not null;
alter table public.ta_employee_requests_v61481
  add column if not exists request_source text not null default 'AUTH';
alter table public.ta_employee_requests_v61481
  add column if not exists portal_account_id uuid;

-- ---------------------------------------------------------------------------
-- 2) Internal helpers
-- ---------------------------------------------------------------------------
create or replace function public._ta_portal_actor_v61482()
returns table(user_id uuid,email text,role text)
language sql
stable
security definer
set search_path=public
as $$
  select p.user_id,lower(coalesce(p.email,'')),upper(coalesce(p.role,'VIEWER'))
  from public.ta_user_profiles p
  where p.user_id=auth.uid() and p.is_active=true
  limit 1;
$$;

create or replace function public._ta_portal_random_6_v61482()
returns text
language plpgsql
volatile
security definer
set search_path=public
as $$
declare
  b bytea := gen_random_bytes(4);
  n bigint;
begin
  n := get_byte(b,0)::bigint * 16777216
     + get_byte(b,1)::bigint * 65536
     + get_byte(b,2)::bigint * 256
     + get_byte(b,3)::bigint;
  return lpad((n % 1000000)::text,6,'0');
end;
$$;

create or replace function public._ta_portal_validate_pin_v61482(p_emp_code text,p_pin text)
returns void
language plpgsql
immutable
security definer
set search_path=public
as $$
declare
  v_pin text := trim(coalesce(p_pin,''));
  v_emp text := regexp_replace(coalesce(p_emp_code,''),'\D','','g');
begin
  if v_pin !~ '^[0-9]{6}$' then
    raise exception 'PIN_MUST_BE_6_DIGITS';
  end if;
  if v_pin in ('000000','111111','222222','333333','444444','555555','666666','777777','888888','999999','123456','654321','012345','543210') then
    raise exception 'PIN_TOO_EASY';
  end if;
  if length(v_emp)>=6 and right(v_emp,6)=v_pin then
    raise exception 'PIN_CANNOT_MATCH_EMPLOYEE_ID';
  end if;
end;
$$;

create or replace function public._ta_portal_session_emp_v61482(p_session_token text)
returns text
language plpgsql
volatile
security definer
set search_path=public
as $$
declare
  v_hash text := encode(digest(coalesce(p_session_token,''),'sha256'),'hex');
  v_emp text;
begin
  select s.emp_code into v_emp
  from public.ta_employee_portal_sessions_v61482 s
  join public.ta_employee_portal_accounts_v61482 a
    on a.portal_account_id=s.portal_account_id
  where s.token_hash=v_hash
    and s.revoked_at is null
    and s.expires_at>now()
    and a.is_enabled=true
  limit 1;

  if nullif(v_emp,'') is null then
    raise exception 'PORTAL_SESSION_INVALID_OR_EXPIRED';
  end if;

  update public.ta_employee_portal_sessions_v61482
  set last_seen_at=now()
  where token_hash=v_hash;

  return public.normalize_emp_code(v_emp);
end;
$$;

create or replace function public._ta_portal_new_session_v61482(
  p_portal_account_id uuid,
  p_emp_code text,
  p_device_label text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public
as $$
declare
  v_token text := encode(gen_random_bytes(32),'hex');
  v_expires timestamptz := now()+interval '90 days';
begin
  insert into public.ta_employee_portal_sessions_v61482(
    portal_account_id,emp_code,token_hash,device_label,expires_at
  ) values (
    p_portal_account_id,public.normalize_emp_code(p_emp_code),
    encode(digest(v_token,'sha256'),'hex'),nullif(trim(coalesce(p_device_label,'')),''),v_expires
  );
  return jsonb_build_object('session_token',v_token,'expires_at',v_expires);
end;
$$;

create or replace function public._ta_portal_employee_json_v61482(p_emp_code text)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'emp_code',public.normalize_emp_code(e."EmployeeId"),
        'full_name',coalesce(nullif(to_jsonb(e)->>'full_name',''),nullif(to_jsonb(e)->>'employee_name',''),nullif(to_jsonb(e)->>'name',''),public.normalize_emp_code(e."EmployeeId")),
        'position_name',coalesce(to_jsonb(e)->>'position_name',''),
        'department',coalesce(to_jsonb(e)->>'department',''),
        'org_code',coalesce(to_jsonb(e)->>'org_code',''),
        'zone',coalesce(nullif(to_jsonb(e)->>'zone',''),nullif(to_jsonb(e)->>'area',''),''),
        'area',coalesce(to_jsonb(e)->>'area',''),
        'sub_area',coalesce(to_jsonb(e)->>'sub_area',''),
        'pc',coalesce(nullif(to_jsonb(e)->>'pc',''),nullif(to_jsonb(e)->>'PC',''),nullif(to_jsonb(e)->>'PCgrade',''),nullif(to_jsonb(e)->>'pcgrade',''),''),
        'start_date',to_jsonb(e)->>'start_date',
        'resign_date',to_jsonb(e)->>'resign_date'
      )
      from public.employees e
      where public.normalize_emp_code(e."EmployeeId")=public.normalize_emp_code(p_emp_code)
      limit 1
    ),
    '{}'::jsonb
  );
$$;

create or replace function public._ta_portal_manager_can_manage_v61482(p_emp_code text,p_work_date date default current_date)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_actor record;
  v_manager text;
begin
  select * into v_actor from public._ta_portal_actor_v61482();
  if v_actor.user_id is null then return false; end if;
  if v_actor.role='HR_ADMIN' then return true; end if;
  if v_actor.role<>'MANAGER' then return false; end if;
  v_manager := public._ta_request_manager_email_v61481(public.normalize_emp_code(p_emp_code),coalesce(p_work_date,current_date));
  return lower(coalesce(v_manager,''))=lower(coalesce(v_actor.email,''));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) HR Admin: Employee Portal bulk management (NO PC restriction)
-- ---------------------------------------------------------------------------
create or replace function public.ta_portal_admin_search_employees_v61482(
  p_search text default null,
  p_portal_status text default null,
  p_limit integer default 3000
)
returns table(
  emp_code text,
  full_name text,
  position_name text,
  department text,
  org_code text,
  zone text,
  area text,
  sub_area text,
  pc text,
  portal_status text,
  is_enabled boolean,
  activated_at timestamptz,
  last_login_at timestamptz,
  activation_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_actor record;
  v_search text := nullif(trim(coalesce(p_search,'')),'');
  v_status text := upper(nullif(trim(coalesce(p_portal_status,'')),''));
begin
  select * into v_actor from public._ta_portal_actor_v61482();
  if v_actor.role is distinct from 'HR_ADMIN' then
    raise exception 'HR_ADMIN_REQUIRED';
  end if;

  return query
  with e as (
    select
      public.normalize_emp_code(x."EmployeeId") as emp_code,
      coalesce(nullif(to_jsonb(x)->>'full_name',''),nullif(to_jsonb(x)->>'employee_name',''),nullif(to_jsonb(x)->>'name',''),public.normalize_emp_code(x."EmployeeId")) as full_name,
      coalesce(to_jsonb(x)->>'position_name','') as position_name,
      coalesce(to_jsonb(x)->>'department','') as department,
      coalesce(to_jsonb(x)->>'org_code','') as org_code,
      coalesce(nullif(to_jsonb(x)->>'zone',''),nullif(to_jsonb(x)->>'area',''),'') as zone,
      coalesce(to_jsonb(x)->>'area','') as area,
      coalesce(to_jsonb(x)->>'sub_area','') as sub_area,
      coalesce(nullif(to_jsonb(x)->>'pc',''),nullif(to_jsonb(x)->>'PC',''),nullif(to_jsonb(x)->>'PCgrade',''),nullif(to_jsonb(x)->>'pcgrade',''),'') as pc,
      x.resign_date
    from public.employees x
  ), base as (
    select e.*,
      a.is_enabled,
      a.activated_at,
      a.last_login_at,
      a.activation_expires_at,
      case
        when a.portal_account_id is null then 'NOT_ENABLED'
        when coalesce(a.is_enabled,false)=false then 'DISABLED'
        when a.pin_hash is not null then 'ACTIVE'
        when a.activation_code_hash is not null and a.activation_expires_at>now() then 'ACTIVATION_READY'
        else 'READY'
      end as portal_status
    from e
    left join public.ta_employee_portal_accounts_v61482 a on a.emp_code=e.emp_code
    where e.emp_code<>''
      and (e.resign_date is null or e.resign_date>=current_date)
  )
  select b.emp_code,b.full_name,b.position_name,b.department,b.org_code,b.zone,b.area,b.sub_area,b.pc,
         b.portal_status,coalesce(b.is_enabled,false),b.activated_at,b.last_login_at,b.activation_expires_at
  from base b
  where (v_search is null or concat_ws(' ',b.emp_code,b.full_name,b.position_name,b.department,b.org_code,b.zone,b.area,b.sub_area,b.pc) ilike '%'||v_search||'%')
    and (v_status is null or b.portal_status=v_status)
  order by b.department,b.full_name,b.emp_code
  limit greatest(1,least(coalesce(p_limit,3000),5000));
end;
$$;

create or replace function public.ta_portal_admin_set_enabled_v61482(
  p_emp_codes text[],
  p_enabled boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor record;
  v_emp text;
  v_count integer := 0;
begin
  select * into v_actor from public._ta_portal_actor_v61482();
  if v_actor.role is distinct from 'HR_ADMIN' then raise exception 'HR_ADMIN_REQUIRED'; end if;
  if cardinality(coalesce(p_emp_codes,array[]::text[]))=0 then raise exception 'EMPLOYEE_REQUIRED'; end if;
  if cardinality(p_emp_codes)>3000 then raise exception 'PORTAL_BULK_LIMIT_EXCEEDED'; end if;

  for v_emp in select distinct public.normalize_emp_code(x) from unnest(p_emp_codes) x
  loop
    if nullif(v_emp,'') is null then continue; end if;
    if not exists(select 1 from public.employees e where public.normalize_emp_code(e."EmployeeId")=v_emp) then continue; end if;

    insert into public.ta_employee_portal_accounts_v61482(emp_code,is_enabled,enabled_at,enabled_by,disabled_reason,updated_at)
    values(v_emp,coalesce(p_enabled,false),case when p_enabled then now() else null end,auth.uid(),case when p_enabled then null else nullif(trim(coalesce(p_note,'')),'') end,now())
    on conflict(emp_code) do update set
      is_enabled=excluded.is_enabled,
      enabled_at=case when excluded.is_enabled then coalesce(public.ta_employee_portal_accounts_v61482.enabled_at,now()) else public.ta_employee_portal_accounts_v61482.enabled_at end,
      enabled_by=auth.uid(),
      disabled_reason=case when excluded.is_enabled then null else excluded.disabled_reason end,
      updated_at=now();

    if not p_enabled then
      update public.ta_employee_portal_sessions_v61482 s
      set revoked_at=coalesce(revoked_at,now()),revoke_reason='HR_DISABLED_PORTAL'
      where s.emp_code=v_emp and s.revoked_at is null;
    end if;

    insert into public.ta_employee_portal_audit_v61482(emp_code,action_type,actor_user_id,actor_email,detail)
    values(v_emp,case when p_enabled then 'PORTAL_ENABLED' else 'PORTAL_DISABLED' end,auth.uid(),v_actor.email,jsonb_build_object('note',p_note));
    v_count:=v_count+1;
  end loop;

  return jsonb_build_object('processed',v_count,'enabled',coalesce(p_enabled,false),'version','V6.14.82');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Manager: team member status + team link + Activation Code / Reset PIN
-- ---------------------------------------------------------------------------
create or replace function public.ta_portal_get_my_team_v61482()
returns table(
  emp_code text,
  full_name text,
  position_name text,
  department text,
  zone text,
  area text,
  sub_area text,
  portal_status text,
  is_enabled boolean,
  activated_at timestamptz,
  last_login_at timestamptz,
  activation_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_actor record;
  v_codes text[];
begin
  select * into v_actor from public._ta_portal_actor_v61482();
  if v_actor.role not in ('MANAGER','HR_ADMIN') then raise exception 'MANAGER_REQUIRED'; end if;

  select coalesce(array_agg(public.normalize_emp_code(e."EmployeeId")),array[]::text[])
  into v_codes
  from public.employees e
  where e.resign_date is null or e.resign_date>=current_date;

  return query
  with mm as (
    select distinct public.normalize_emp_code(m.emp_code) emp_code
    from public.ta_get_schedule_manager_map_v61124(v_codes,current_date) m
    where v_actor.role='HR_ADMIN' or lower(coalesce(m.manager_email,''))=lower(v_actor.email)
  ), e as (
    select
      public.normalize_emp_code(x."EmployeeId") emp_code,
      coalesce(nullif(to_jsonb(x)->>'full_name',''),nullif(to_jsonb(x)->>'employee_name',''),nullif(to_jsonb(x)->>'name',''),public.normalize_emp_code(x."EmployeeId")) full_name,
      coalesce(to_jsonb(x)->>'position_name','') position_name,
      coalesce(to_jsonb(x)->>'department','') department,
      coalesce(nullif(to_jsonb(x)->>'zone',''),nullif(to_jsonb(x)->>'area',''),'') zone,
      coalesce(to_jsonb(x)->>'area','') area,
      coalesce(to_jsonb(x)->>'sub_area','') sub_area
    from public.employees x
    join mm on mm.emp_code=public.normalize_emp_code(x."EmployeeId")
  )
  select e.emp_code,e.full_name,e.position_name,e.department,e.zone,e.area,e.sub_area,
    case
      when a.portal_account_id is null then 'NOT_ENABLED'
      when coalesce(a.is_enabled,false)=false then 'DISABLED'
      when a.pin_hash is not null then 'ACTIVE'
      when a.activation_code_hash is not null and a.activation_expires_at>now() then 'ACTIVATION_READY'
      else 'READY'
    end,
    coalesce(a.is_enabled,false),a.activated_at,a.last_login_at,a.activation_expires_at
  from e
  left join public.ta_employee_portal_accounts_v61482 a on a.emp_code=e.emp_code
  order by e.department,e.full_name,e.emp_code;
end;
$$;

create or replace function public.ta_portal_get_team_link_v61482(p_rotate boolean default false)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor record;
  v_token text;
  v_id uuid;
begin
  select * into v_actor from public._ta_portal_actor_v61482();
  if v_actor.role not in ('MANAGER','HR_ADMIN') then raise exception 'MANAGER_REQUIRED'; end if;

  if p_rotate then
    update public.ta_employee_portal_team_links_v61482
    set is_active=false,revoked_at=now(),updated_at=now()
    where manager_user_id=v_actor.user_id and is_active=true;
  end if;

  select team_link_id,public_token into v_id,v_token
  from public.ta_employee_portal_team_links_v61482
  where manager_user_id=v_actor.user_id and is_active=true
  order by created_at desc limit 1;

  if v_id is null then
    v_token:=encode(gen_random_bytes(24),'hex');
    insert into public.ta_employee_portal_team_links_v61482(manager_user_id,manager_email,public_token,is_active,rotated_at)
    values(v_actor.user_id,v_actor.email,v_token,true,case when p_rotate then now() else null end)
    returning team_link_id into v_id;
  end if;

  return jsonb_build_object('team_link_id',v_id,'public_token',v_token,'manager_email',v_actor.email,'version','V6.14.82');
end;
$$;

create or replace function public.ta_portal_issue_activation_v61482(
  p_emp_code text,
  p_reset_pin boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor record;
  v_emp text:=public.normalize_emp_code(p_emp_code);
  v_code text;
  v_account public.ta_employee_portal_accounts_v61482%rowtype;
  v_exp timestamptz:=now()+interval '7 days';
begin
  select * into v_actor from public._ta_portal_actor_v61482();
  if not public._ta_portal_manager_can_manage_v61482(v_emp,current_date) then raise exception 'PORTAL_TEAM_PERMISSION_DENIED'; end if;

  select * into v_account from public.ta_employee_portal_accounts_v61482 where emp_code=v_emp;
  if v_account.portal_account_id is null or coalesce(v_account.is_enabled,false)=false then
    raise exception 'PORTAL_NOT_ENABLED_BY_HR';
  end if;
  if v_account.pin_hash is not null and not coalesce(p_reset_pin,false) then
    raise exception 'PORTAL_ALREADY_ACTIVATED';
  end if;

  if p_reset_pin then
    update public.ta_employee_portal_sessions_v61482
    set revoked_at=coalesce(revoked_at,now()),revoke_reason='MANAGER_RESET_PIN'
    where emp_code=v_emp and revoked_at is null;
  end if;

  v_code:=public._ta_portal_random_6_v61482();
  update public.ta_employee_portal_accounts_v61482
  set activation_code_hash=crypt(v_code,gen_salt('bf',10)),
      activation_generated_at=now(),activation_expires_at=v_exp,activation_generated_by=auth.uid(),
      pin_hash=case when p_reset_pin then null else pin_hash end,
      pin_set_at=case when p_reset_pin then null else pin_set_at end,
      failed_attempts=0,lock_until=null,updated_at=now()
  where emp_code=v_emp;

  insert into public.ta_employee_portal_audit_v61482(emp_code,action_type,actor_user_id,actor_email,detail)
  values(v_emp,case when p_reset_pin then 'PIN_RESET_ACTIVATION_ISSUED' else 'ACTIVATION_ISSUED' end,auth.uid(),v_actor.email,jsonb_build_object('expires_at',v_exp));

  return public._ta_portal_employee_json_v61482(v_emp) || jsonb_build_object(
    'activation_code',v_code,'activation_expires_at',v_exp,'reset_pin',coalesce(p_reset_pin,false),'version','V6.14.82'
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Public Portal authentication (Employee ID + Activation/PIN)
-- ---------------------------------------------------------------------------
create or replace function public.ta_portal_team_public_v61482(p_team_token text)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select coalesce((
    select jsonb_build_object(
      'valid',true,
      'manager_display_name',coalesce(nullif(p.display_name,''),l.manager_email),
      'team_token',l.public_token
    )
    from public.ta_employee_portal_team_links_v61482 l
    left join public.ta_user_profiles p on p.user_id=l.manager_user_id and p.is_active=true
    where l.public_token=trim(coalesce(p_team_token,'')) and l.is_active=true
    limit 1
  ),jsonb_build_object('valid',false));
$$;

create or replace function public.ta_portal_activate_v61482(
  p_team_token text,
  p_emp_code text,
  p_activation_code text,
  p_new_pin text,
  p_device_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp text:=public.normalize_emp_code(p_emp_code);
  v_link public.ta_employee_portal_team_links_v61482%rowtype;
  v_account public.ta_employee_portal_accounts_v61482%rowtype;
  v_manager text;
  v_session jsonb;
begin
  perform public._ta_portal_validate_pin_v61482(v_emp,p_new_pin);

  select * into v_link from public.ta_employee_portal_team_links_v61482
  where public_token=trim(coalesce(p_team_token,'')) and is_active=true limit 1;
  if v_link.team_link_id is null then raise exception 'PORTAL_TEAM_LINK_INVALID'; end if;

  v_manager:=public._ta_request_manager_email_v61481(v_emp,current_date);
  if lower(coalesce(v_manager,''))<>lower(coalesce(v_link.manager_email,'')) then
    raise exception 'PORTAL_EMPLOYEE_NOT_IN_TEAM';
  end if;

  select * into v_account from public.ta_employee_portal_accounts_v61482 where emp_code=v_emp for update;
  if v_account.portal_account_id is null or not coalesce(v_account.is_enabled,false) then raise exception 'PORTAL_NOT_ENABLED'; end if;
  if v_account.activation_code_hash is null or v_account.activation_expires_at is null or v_account.activation_expires_at<=now() then
    raise exception 'ACTIVATION_CODE_EXPIRED';
  end if;
  if crypt(trim(coalesce(p_activation_code,'')),v_account.activation_code_hash)<>v_account.activation_code_hash then
    raise exception 'ACTIVATION_CODE_INVALID';
  end if;

  update public.ta_employee_portal_accounts_v61482
  set pin_hash=crypt(trim(p_new_pin),gen_salt('bf',10)),pin_set_at=now(),activated_at=coalesce(activated_at,now()),
      activation_code_hash=null,activation_generated_at=null,activation_expires_at=null,activation_generated_by=null,
      failed_attempts=0,lock_until=null,last_login_at=now(),updated_at=now()
  where portal_account_id=v_account.portal_account_id;

  v_session:=public._ta_portal_new_session_v61482(v_account.portal_account_id,v_emp,p_device_label);
  insert into public.ta_employee_portal_audit_v61482(emp_code,action_type,detail)
  values(v_emp,'PORTAL_ACTIVATED',jsonb_build_object('team_manager',v_link.manager_email));

  return public._ta_portal_employee_json_v61482(v_emp) || v_session || jsonb_build_object('manager_email',v_link.manager_email,'version','V6.14.82');
end;
$$;

create or replace function public.ta_portal_login_v61482(
  p_team_token text,
  p_emp_code text,
  p_pin text,
  p_device_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp text:=public.normalize_emp_code(p_emp_code);
  v_account public.ta_employee_portal_accounts_v61482%rowtype;
  v_link public.ta_employee_portal_team_links_v61482%rowtype;
  v_manager text;
  v_session jsonb;
  v_fail integer;
begin
  if nullif(trim(coalesce(p_team_token,'')),'') is not null then
    select * into v_link from public.ta_employee_portal_team_links_v61482 where public_token=trim(p_team_token) and is_active=true limit 1;
    if v_link.team_link_id is null then raise exception 'PORTAL_TEAM_LINK_INVALID'; end if;
    v_manager:=public._ta_request_manager_email_v61481(v_emp,current_date);
    if lower(coalesce(v_manager,''))<>lower(coalesce(v_link.manager_email,'')) then raise exception 'PORTAL_EMPLOYEE_NOT_IN_TEAM'; end if;
  end if;

  select * into v_account from public.ta_employee_portal_accounts_v61482 where emp_code=v_emp for update;
  if v_account.portal_account_id is null or not coalesce(v_account.is_enabled,false) or v_account.pin_hash is null then
    raise exception 'PORTAL_LOGIN_INVALID';
  end if;
  if v_account.lock_until is not null and v_account.lock_until>now() then raise exception 'PORTAL_LOCKED_15_MINUTES'; end if;

  if crypt(trim(coalesce(p_pin,'')),v_account.pin_hash)<>v_account.pin_hash then
    v_fail:=coalesce(v_account.failed_attempts,0)+1;
    update public.ta_employee_portal_accounts_v61482
    set failed_attempts=case when v_fail>=5 then 0 else v_fail end,
        lock_until=case when v_fail>=5 then now()+interval '15 minutes' else null end,
        updated_at=now()
    where portal_account_id=v_account.portal_account_id;
    if v_fail>=5 then raise exception 'PORTAL_LOCKED_15_MINUTES'; end if;
    raise exception 'PORTAL_LOGIN_INVALID';
  end if;

  update public.ta_employee_portal_accounts_v61482
  set failed_attempts=0,lock_until=null,last_login_at=now(),updated_at=now()
  where portal_account_id=v_account.portal_account_id;
  v_session:=public._ta_portal_new_session_v61482(v_account.portal_account_id,v_emp,p_device_label);

  insert into public.ta_employee_portal_audit_v61482(emp_code,action_type,detail)
  values(v_emp,'PORTAL_LOGIN',jsonb_build_object('team_token_used',nullif(trim(coalesce(p_team_token,'')),'') is not null));

  return public._ta_portal_employee_json_v61482(v_emp) || v_session || jsonb_build_object('manager_email',public._ta_request_manager_email_v61481(v_emp,current_date),'version','V6.14.82');
end;
$$;

create or replace function public.ta_portal_me_v61482(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_emp text;
begin
  v_emp:=public._ta_portal_session_emp_v61482(p_session_token);
  return public._ta_portal_employee_json_v61482(v_emp) || jsonb_build_object(
    'manager_email',public._ta_request_manager_email_v61481(v_emp,current_date),
    'version','V6.14.82'
  );
end;
$$;

create or replace function public.ta_portal_logout_v61482(p_session_token text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.ta_employee_portal_sessions_v61482
  set revoked_at=coalesce(revoked_at,now()),revoke_reason='EMPLOYEE_LOGOUT'
  where token_hash=encode(digest(coalesce(p_session_token,''),'sha256'),'hex') and revoked_at is null;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) Employee self schedule/time reader for the Portal
--    Uses the same Work Pattern / Day-off pair / Shift Master tables.
-- ---------------------------------------------------------------------------
create or replace function public.ta_portal_get_my_calendar_v61482(
  p_session_token text,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public
as $$
declare
  v_emp text;
  v_start date:=least(p_start_date,p_end_date);
  v_end date:=greatest(p_start_date,p_end_date);
  v_result jsonb;
begin
  v_emp:=public._ta_portal_session_emp_v61482(p_session_token);
  if v_start is null or v_end is null then raise exception 'DATE_RANGE_REQUIRED'; end if;
  if v_end-v_start>62 then raise exception 'PORTAL_DATE_RANGE_MAX_63_DAYS'; end if;

  with days as (
    select d::date work_date from generate_series(v_start,v_end,interval '1 day') d
  ), ctx as (
    select d.work_date,p.*
    from days d
    left join lateral public.ta_resolve_employee_work_pattern_v651(v_emp,d.work_date) p on true
  ), resolved as (
    select
      c.*,
      h.holiday_name,
      (h.holiday_date is not null) is_public_holiday,
      (h.holiday_date is null and extract(dow from c.work_date)::integer=any(coalesce(c.weekly_off_dows,array[]::integer[]))) is_weekly_off,
      sc.shift_code assigned_shift_code,
      to_jsonb(sc) shift_calendar_json,
      to_jsonb(aw) attendance_json,
      off.off_shift_code,
      off.off_start_time,
      off.off_end_time
    from ctx c
    left join public.holidays h on h.holiday_date=c.work_date
    left join public.shift_calendar sc on public.normalize_emp_code(sc.emp_code)=v_emp and sc.work_date=c.work_date
    left join public.attendance_workday aw on public.normalize_emp_code(aw.emp_code)=v_emp and aw.work_date=c.work_date
    left join lateral public.ta_resolve_paired_dayoff_shift_v6134(c.default_shift_code) off on true
  ), coded as (
    select r.*,
      upper(trim(coalesce(
        nullif(r.assigned_shift_code,''),
        case when r.is_public_holiday then 'HOL' end,
        case when r.is_weekly_off then r.off_shift_code end,
        r.default_shift_code,
        case when upper(trim(coalesce(r.pattern_code,'')))='TECH_5D' then 'STD' else 'S043' end
      ))) effective_shift_code
    from resolved r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'work_date',c.work_date,
    'emp_code',v_emp,
    'pattern_code',c.pattern_code,
    'pattern_name',c.pattern_name,
    'day_type',case when c.is_public_holiday then 'PUBLIC_HOLIDAY' when c.is_weekly_off then 'WEEKLY_OFF' when c.effective_shift_code='LV' then 'LEAVE' else 'WORKDAY' end,
    'is_public_holiday',c.is_public_holiday,
    'is_weekly_off',c.is_weekly_off,
    'holiday_name',c.holiday_name,
    'assigned_shift_code',c.assigned_shift_code,
    'effective_shift_code',c.effective_shift_code,
    'shift_name',sm.shift_name,
    'shift_start_time',sm.start_time,
    'shift_end_time',sm.end_time,
    'is_night_shift',coalesce(sm.is_night_shift,false),
    'is_workday',coalesce(sm.is_workday,not(c.is_public_holiday or c.is_weekly_off)),
    'work_mode_code',coalesce(c.shift_calendar_json->>'work_mode_code',c.attendance_json->>'work_mode_code'),
    'template_code',coalesce(c.shift_calendar_json->>'template_code',c.attendance_json->>'template_code'),
    'first_in',coalesce(c.attendance_json->>'first_in',c.attendance_json->>'actual_in_at'),
    'last_out',coalesce(c.attendance_json->>'last_out',c.attendance_json->>'actual_out_at'),
    'actual_in_at',c.attendance_json->>'actual_in_at',
    'actual_out_at',c.attendance_json->>'actual_out_at',
    'late_minutes',coalesce(nullif(c.attendance_json->>'late_minutes','')::numeric,0),
    'early_leave_minutes',coalesce(nullif(c.attendance_json->>'early_leave_minutes','')::numeric,nullif(c.attendance_json->>'early_minutes','')::numeric,0),
    'calculation_status',coalesce(c.attendance_json->>'calculation_status',c.attendance_json->>'attendance_status'),
    'time_certification_active',coalesce(nullif(c.attendance_json->>'time_certification_active','')::boolean,false),
    'attendance',coalesce(c.attendance_json,'{}'::jsonb),
    'schedule',coalesce(c.shift_calendar_json,'{}'::jsonb)
  ) order by c.work_date),'[]'::jsonb)
  into v_result
  from coded c
  left join public.shift_master sm on upper(trim(sm.shift_code))=c.effective_shift_code;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Portal requests + notifications (reuses V6.14.81 Request Center)
-- ---------------------------------------------------------------------------
create or replace function public.ta_portal_submit_request_v61482(
  p_session_token text,
  p_work_date date,
  p_request_type text,
  p_request_subtype text,
  p_reason text,
  p_detail jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp text;
  v_account public.ta_employee_portal_accounts_v61482%rowtype;
  v_type text:=upper(trim(coalesce(p_request_type,'')));
  v_subtype text:=upper(trim(coalesce(p_request_subtype,'')));
  v_manager_email text;
  v_manager_user uuid;
  v_request public.ta_employee_requests_v61481%rowtype;
begin
  v_emp:=public._ta_portal_session_emp_v61482(p_session_token);
  select * into v_account from public.ta_employee_portal_accounts_v61482 where emp_code=v_emp;
  if p_work_date is null or nullif(trim(coalesce(p_reason,'')),'') is null then raise exception 'REQUEST_REQUIRED_FIELDS_MISSING'; end if;
  if v_type not in ('TIME_ISSUE','SPECIAL_WORK') then raise exception 'INVALID_REQUEST_TYPE'; end if;
  if (v_type='TIME_ISSUE' and v_subtype not in ('MISSING_IN','MISSING_OUT','WRONG_TIME'))
     or (v_type='SPECIAL_WORK' and v_subtype not in ('NORMAL_LATE_CUSTOMER','SPLIT_WAIT_NIGHT','HOUR_BASED')) then
    raise exception 'INVALID_REQUEST_SUBTYPE';
  end if;

  v_manager_email:=public._ta_request_manager_email_v61481(v_emp,p_work_date);
  if v_manager_email is null then raise exception 'ACTIVE_MANAGER_NOT_FOUND_FOR_EMPLOYEE'; end if;
  select user_id into v_manager_user from public.ta_user_profiles
  where lower(email)=lower(v_manager_email) and is_active=true order by updated_at desc nulls last limit 1;

  insert into public.ta_employee_requests_v61481(
    request_type,request_subtype,emp_code,work_date,reason,detail,manager_email,status,
    requested_by,requested_by_email,request_source,portal_account_id
  ) values (
    v_type,v_subtype,v_emp,p_work_date,trim(p_reason),coalesce(p_detail,'{}'::jsonb),v_manager_email,'PENDING',
    null,null,'EMPLOYEE_PORTAL',v_account.portal_account_id
  ) returning * into v_request;

  perform public._ta_request_notify_v61481(
    v_request.request_id,v_manager_user,
    case when v_type='TIME_ISSUE' then 'มีแจ้งปัญหาเวลาทำงานใหม่' else 'มีแจ้งงานกะพิเศษใหม่' end,
    v_emp||' • '||to_char(p_work_date,'DD/MM/YYYY')||' • '||trim(p_reason),'warning'
  );

  insert into public.ta_employee_portal_audit_v61482(emp_code,action_type,detail)
  values(v_emp,'PORTAL_REQUEST_SUBMITTED',jsonb_build_object('request_id',v_request.request_id,'request_type',v_type,'request_subtype',v_subtype));

  return to_jsonb(v_request);
end;
$$;

create or replace function public.ta_portal_get_my_requests_v61482(
  p_session_token text,
  p_start_date date default (current_date-90),
  p_end_date date default (current_date+90)
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public
as $$
declare v_emp text; v_result jsonb;
begin
  v_emp:=public._ta_portal_session_emp_v61482(p_session_token);
  select coalesce(jsonb_agg(to_jsonb(r) order by r.requested_at desc),'[]'::jsonb)
  into v_result
  from public.ta_employee_requests_v61481 r
  where r.emp_code=v_emp and r.work_date between least(p_start_date,p_end_date) and greatest(p_start_date,p_end_date);
  return v_result;
end;
$$;

create or replace function public.ta_portal_cancel_request_v61482(p_session_token text,p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare v_emp text; v_row public.ta_employee_requests_v61481%rowtype;
begin
  v_emp:=public._ta_portal_session_emp_v61482(p_session_token);
  update public.ta_employee_requests_v61481
  set status='CANCELLED',updated_at=now()
  where request_id=p_request_id and emp_code=v_emp and request_source='EMPLOYEE_PORTAL' and status='PENDING'
  returning * into v_row;
  if v_row.request_id is null then raise exception 'REQUEST_CANCEL_NOT_ALLOWED'; end if;
  return to_jsonb(v_row);
end;
$$;

create or replace function public._ta_portal_request_status_notify_v61482()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_title text; v_message text;
begin
  if new.portal_account_id is null or new.status is not distinct from old.status then return new; end if;
  if new.status not in ('APPROVED','REJECTED','RESOLVED','CANCELLED') then return new; end if;
  v_title:=case new.status when 'REJECTED' then 'คำขอไม่ได้รับอนุมัติ' when 'CANCELLED' then 'คำขอถูกยกเลิก' else 'คำขอของคุณดำเนินการแล้ว' end;
  v_message:=coalesce(new.request_no,'คำขอ')||' • '||to_char(new.work_date,'DD/MM/YYYY')||case when nullif(trim(coalesce(new.decision_note,'')),'') is not null then ' • '||new.decision_note else '' end;
  insert into public.ta_employee_portal_notifications_v61482(portal_account_id,emp_code,request_id,title,message,severity)
  values(new.portal_account_id,new.emp_code,new.request_id,v_title,v_message,case when new.status='REJECTED' then 'danger' else 'success' end);
  return new;
end;
$$;

drop trigger if exists trg_ta_portal_request_status_notify_v61482 on public.ta_employee_requests_v61481;
create trigger trg_ta_portal_request_status_notify_v61482
after update of status on public.ta_employee_requests_v61481
for each row execute function public._ta_portal_request_status_notify_v61482();

create or replace function public.ta_portal_get_notifications_v61482(p_session_token text,p_limit integer default 50)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public
as $$
declare v_emp text; v_result jsonb;
begin
  v_emp:=public._ta_portal_session_emp_v61482(p_session_token);
  select coalesce(jsonb_agg(to_jsonb(n) order by n.created_at desc),'[]'::jsonb)
  into v_result
  from (
    select * from public.ta_employee_portal_notifications_v61482
    where emp_code=v_emp
    order by created_at desc
    limit greatest(1,least(coalesce(p_limit,50),200))
  ) n;
  return v_result;
end;
$$;

create or replace function public.ta_portal_mark_notification_read_v61482(p_session_token text,p_notification_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare v_emp text;
begin
  v_emp:=public._ta_portal_session_emp_v61482(p_session_token);
  update public.ta_employee_portal_notifications_v61482
  set is_read=true,read_at=coalesce(read_at,now())
  where notification_id=p_notification_id and emp_code=v_emp;
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Security
-- ---------------------------------------------------------------------------
alter table public.ta_employee_portal_accounts_v61482 enable row level security;
alter table public.ta_employee_portal_sessions_v61482 enable row level security;
alter table public.ta_employee_portal_team_links_v61482 enable row level security;
alter table public.ta_employee_portal_notifications_v61482 enable row level security;
alter table public.ta_employee_portal_audit_v61482 enable row level security;

revoke all on public.ta_employee_portal_accounts_v61482 from anon,authenticated;
revoke all on public.ta_employee_portal_sessions_v61482 from anon,authenticated;
revoke all on public.ta_employee_portal_team_links_v61482 from anon,authenticated;
revoke all on public.ta_employee_portal_notifications_v61482 from anon,authenticated;
revoke all on public.ta_employee_portal_audit_v61482 from anon,authenticated;

-- Internal helpers are never callable directly from API roles.
revoke all on function public._ta_portal_actor_v61482() from public,anon,authenticated;
revoke all on function public._ta_portal_random_6_v61482() from public,anon,authenticated;
revoke all on function public._ta_portal_validate_pin_v61482(text,text) from public,anon,authenticated;
revoke all on function public._ta_portal_session_emp_v61482(text) from public,anon,authenticated;
revoke all on function public._ta_portal_new_session_v61482(uuid,text,text) from public,anon,authenticated;
revoke all on function public._ta_portal_employee_json_v61482(text) from public,anon,authenticated;
revoke all on function public._ta_portal_manager_can_manage_v61482(text,date) from public,anon,authenticated;
revoke all on function public._ta_portal_request_status_notify_v61482() from public,anon,authenticated;

-- HR / Manager authenticated RPCs.
grant execute on function public.ta_portal_admin_search_employees_v61482(text,text,integer) to authenticated;
grant execute on function public.ta_portal_admin_set_enabled_v61482(text[],boolean,text) to authenticated;
grant execute on function public.ta_portal_get_my_team_v61482() to authenticated;
grant execute on function public.ta_portal_get_team_link_v61482(boolean) to authenticated;
grant execute on function public.ta_portal_issue_activation_v61482(text,boolean) to authenticated;

-- Employee Portal uses the Supabase anon client but every self-service RPC validates
-- either Team Link + Activation/PIN or an opaque 256-bit Portal Session token.
grant execute on function public.ta_portal_team_public_v61482(text) to anon,authenticated;
grant execute on function public.ta_portal_activate_v61482(text,text,text,text,text) to anon,authenticated;
grant execute on function public.ta_portal_login_v61482(text,text,text,text) to anon,authenticated;
grant execute on function public.ta_portal_me_v61482(text) to anon,authenticated;
grant execute on function public.ta_portal_logout_v61482(text) to anon,authenticated;
grant execute on function public.ta_portal_get_my_calendar_v61482(text,date,date) to anon,authenticated;
grant execute on function public.ta_portal_submit_request_v61482(text,date,text,text,text,jsonb) to anon,authenticated;
grant execute on function public.ta_portal_get_my_requests_v61482(text,date,date) to anon,authenticated;
grant execute on function public.ta_portal_cancel_request_v61482(text,uuid) to anon,authenticated;
grant execute on function public.ta_portal_get_notifications_v61482(text,integer) to anon,authenticated;
grant execute on function public.ta_portal_mark_notification_read_v61482(text,uuid) to anon,authenticated;

notify pgrst, 'reload schema';
commit;
