-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.15.23
-- 4D.1A — Team Master + Auto Generate Team
-- ============================================================================
-- Scope รอบนี้
-- 1) Team Master ผูกกับ Organization Master เดิม
-- 2) Manager / HR Admin สร้างทีมได้เฉพาะหน่วยงานที่ตนมีสิทธิ์จัดกะ
-- 3) Team Name / Team Code สร้างโดย Backend เท่านั้น เช่น ทีม 01 / BE5-T01
-- 4) เลขทีมเป็น Running Number แยกตาม Org Unit และไม่ย้อนกลับมาใช้เลขเดิม
-- 5) ปิดใช้งานทีมแบบ Soft Deactivate เท่านั้น — ไม่มี Delete RPC
-- 6) เก็บ Team Audit
-- 7) ยังไม่เพิ่ม Team Membership และยังไม่เปิด Team Enforcement ใน 4D.1A
-- ============================================================================

begin;
set local statement_timeout='0';
select pg_advisory_xact_lock(hashtext('timeclock-v6.15.23-team-master'));

-- ---------------------------------------------------------------------------
-- 0) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ta_org_units') is null then
    raise exception 'MISSING_TABLE: ta_org_units';
  end if;
  if to_regclass('public.ta_manager_scopes') is null then
    raise exception 'MISSING_TABLE: ta_manager_scopes';
  end if;
  if to_regclass('public.ta_user_profiles') is null then
    raise exception 'MISSING_TABLE: ta_user_profiles';
  end if;
  if to_regclass('public.employees') is null then
    raise exception 'MISSING_TABLE: employees';
  end if;
  if to_regprocedure('public.ta_can_access_employee_v680(text,date,text)') is null then
    raise exception 'MISSING_FUNCTION: ta_can_access_employee_v680';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Team Master / Running Sequence / Audit
-- ---------------------------------------------------------------------------
create table if not exists public.ta_teams_v61523 (
  team_id uuid primary key default gen_random_uuid(),
  org_unit_id uuid not null
    references public.ta_org_units(org_id)
    on update cascade on delete restrict,
  org_code_snapshot text not null,
  team_no integer not null,
  team_code text not null,
  team_name text not null,
  is_active boolean not null default true,
  note text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_by_email text,
  updated_at timestamptz not null default now(),
  deactivated_by uuid,
  deactivated_by_email text,
  deactivated_at timestamptz,
  deactivation_reason text,
  metadata jsonb not null default '{}'::jsonb,
  constraint ck_ta_team_no_v61523 check (team_no > 0),
  constraint ck_ta_team_code_v61523 check (nullif(trim(team_code),'') is not null),
  constraint ck_ta_team_name_v61523 check (nullif(trim(team_name),'') is not null),
  constraint uq_ta_team_org_no_v61523 unique(org_unit_id,team_no),
  constraint uq_ta_team_code_v61523 unique(team_code)
);

create index if not exists idx_ta_teams_org_active_v61523
  on public.ta_teams_v61523(org_unit_id,is_active,team_no);
create index if not exists idx_ta_teams_created_v61523
  on public.ta_teams_v61523(created_at desc);

create table if not exists public.ta_team_sequences_v61523 (
  org_unit_id uuid primary key
    references public.ta_org_units(org_id)
    on update cascade on delete restrict,
  next_no integer not null default 1,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint ck_ta_team_sequence_next_v61523 check(next_no > 0)
);

create table if not exists public.ta_team_audit_v61523 (
  audit_id bigint generated always as identity primary key,
  team_id uuid references public.ta_teams_v61523(team_id) on delete restrict,
  org_unit_id uuid references public.ta_org_units(org_id) on delete restrict,
  org_code text,
  team_code text,
  action_type text not null,
  old_data jsonb,
  new_data jsonb,
  reason text,
  actor_user_id uuid,
  actor_email text,
  created_at timestamptz not null default now(),
  constraint ck_ta_team_audit_action_v61523 check (
    action_type in ('CREATE_TEAM','DEACTIVATE_TEAM')
  )
);

create index if not exists idx_ta_team_audit_team_v61523
  on public.ta_team_audit_v61523(team_id,created_at desc);
create index if not exists idx_ta_team_audit_org_v61523
  on public.ta_team_audit_v61523(org_unit_id,created_at desc);

alter table public.ta_teams_v61523 enable row level security;
alter table public.ta_team_sequences_v61523 enable row level security;
alter table public.ta_team_audit_v61523 enable row level security;

-- Direct table mutation is intentionally closed. All Web operations use RPC.
revoke all on table public.ta_teams_v61523 from public,anon,authenticated;
revoke all on table public.ta_team_sequences_v61523 from public,anon,authenticated;
revoke all on table public.ta_team_audit_v61523 from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 2) Common helpers
-- ---------------------------------------------------------------------------
create or replace function public._ta_team_actor_v61523()
returns table(
  user_id uuid,
  email text,
  role text
)
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
begin
  return query
  select
    p.user_id,
    lower(trim(coalesce(p.email,'')))::text,
    upper(trim(coalesce(p.role,'VIEWER')))::text
  from public.ta_user_profiles p
  where p.user_id=auth.uid()
    and coalesce(p.is_active,false)
  limit 1;
end;
$$;

create or replace function public._ta_team_code_prefix_v61523(p_org_code text)
returns text
language sql
immutable
as $$
  select case
    when nullif(
      regexp_replace(upper(trim(coalesce(p_org_code,''))),'[^A-Z0-9_-]+','','g'),
      ''
    ) is not null
      then regexp_replace(upper(trim(coalesce(p_org_code,''))),'[^A-Z0-9_-]+','','g')
    else 'ORG'
  end;
$$;

create or replace function public._ta_team_number_label_v61523(p_team_no integer)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_team_no,0) < 10 then '0'||greatest(coalesce(p_team_no,0),0)::text
    else greatest(coalesce(p_team_no,0),0)::text
  end;
$$;

-- Canonical identity guard: Team Code / Team Name cannot be manually changed.
create or replace function public._ta_normalize_team_identity_v61523()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_org_code text;
  v_label text;
begin
  if tg_op='UPDATE' then
    if new.org_unit_id is distinct from old.org_unit_id
       or new.team_no is distinct from old.team_no then
      raise exception 'TEAM_IDENTITY_IMMUTABLE';
    end if;
  end if;

  select trim(o.org_code)
  into v_org_code
  from public.ta_org_units o
  where o.org_id=new.org_unit_id;

  if nullif(v_org_code,'') is null then
    raise exception 'TEAM_ORG_NOT_FOUND';
  end if;

  v_label:=public._ta_team_number_label_v61523(new.team_no);
  new.org_code_snapshot:=v_org_code;
  new.team_name:='ทีม '||v_label;
  new.team_code:=public._ta_team_code_prefix_v61523(v_org_code)||'-T'||v_label;
  new.updated_at:=now();
  new.updated_by:=coalesce(auth.uid(),new.updated_by);

  if tg_op='INSERT' then
    new.created_by:=coalesce(new.created_by,auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ta_normalize_team_identity_v61523
  on public.ta_teams_v61523;
create trigger trg_ta_normalize_team_identity_v61523
before insert or update of org_unit_id,team_no,team_code,team_name
on public.ta_teams_v61523
for each row
execute function public._ta_normalize_team_identity_v61523();

-- ---------------------------------------------------------------------------
-- 3) Manager/HR Admin authorization for Team Master
--    Uses the existing canonical EDIT_SCHEDULE engine first, then current
--    Manager Scope as a structural fallback for an Org Unit with no employees.
-- ---------------------------------------------------------------------------
create or replace function public._ta_team_can_manage_org_v61523(
  p_org_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
declare
  v_actor record;
  v_org public.ta_org_units%rowtype;
  v_today date:=timezone('Asia/Bangkok',now())::date;
begin
  select * into v_actor
  from public._ta_team_actor_v61523()
  limit 1;

  if not found then
    return false;
  end if;

  select * into v_org
  from public.ta_org_units o
  where o.org_id=p_org_id
    and coalesce(o.is_active,true)
    and (o.effective_from is null or o.effective_from<=v_today)
    and (o.effective_to is null or o.effective_to>=v_today)
  limit 1;

  if not found then
    return false;
  end if;

  if v_actor.role='HR_ADMIN' then
    return true;
  end if;

  if v_actor.role<>'MANAGER' then
    return false;
  end if;

  -- Preferred: existing Schedule authority is the source of truth.
  if exists (
    select 1
    from public.employees e
    where (
         lower(trim(coalesce(e.org_code,'')))=lower(trim(v_org.org_code))
         or (
           nullif(trim(coalesce(e.org_code,'')),'') is null
           and lower(trim(coalesce(e.department,'')))=lower(trim(v_org.org_name))
         )
      )
      and public.ta_can_access_employee_v680(
        public.normalize_emp_code(e."EmployeeId"),
        v_today,
        'EDIT_SCHEDULE'
      )
    limit 1
  ) then
    return true;
  end if;

  -- Structural fallback: current Manager Scope. Include descendants is honored.
  return exists (
    with recursive org_chain as (
      select
        o.org_id,o.parent_org_id,o.org_code,o.org_name,0::integer as depth
      from public.ta_org_units o
      where o.org_id=p_org_id

      union all

      select
        p.org_id,p.parent_org_id,p.org_code,p.org_name,c.depth+1
      from public.ta_org_units p
      join org_chain c on c.parent_org_id=p.org_id
      where c.depth<20
    )
    select 1
    from public.ta_manager_scopes s
    where lower(trim(coalesce(s.manager_email,'')))=v_actor.email
      and coalesce(s.is_active,true)
      and coalesce(s.can_edit_schedule,false)
      and (s.effective_from is null or s.effective_from<=v_today)
      and (s.effective_to is null or s.effective_to>=v_today)
      and (
        upper(trim(coalesce(s.scope_type,'')))='ALL'
        or (
          upper(trim(coalesce(s.scope_type,'')))='DEPARTMENT'
          and lower(trim(coalesce(s.scope_value,''))) in (
            lower(trim(v_org.org_code)),
            lower(trim(v_org.org_name))
          )
        )
        or (
          upper(trim(coalesce(s.scope_type,'')))='ORG_UNIT'
          and exists (
            select 1
            from org_chain c
            where (
              (coalesce(s.include_descendants,false) or c.depth=0)
              and (
                   s.org_unit_id=c.org_id
                or lower(trim(coalesce(s.scope_value,'')))=lower(trim(c.org_code))
                or lower(trim(coalesce(s.scope_value,'')))=lower(trim(c.org_name))
                or lower(trim(coalesce(s.scope_value,'')))=lower(trim(c.org_id::text))
              )
            )
          )
        )
      )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) Organization options for Team Master
--    Only operational Org Units with Employee Master rows are offered.
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_team_org_options_v61523(
  p_include_inactive boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_catalog
as $$
  with org_rows as (
    select
      o.org_id,
      o.org_code,
      o.org_name,
      o.org_level_code,
      o.org_level_name,
      o.level_order,
      o.sort_order,
      o.is_active,
      count(distinct public.normalize_emp_code(e."EmployeeId"))::integer as employee_count,
      count(distinct t.team_id) filter(where t.is_active)::integer as active_team_count,
      count(distinct t.team_id) filter(where not t.is_active)::integer as inactive_team_count,
      greatest(
        coalesce(s.next_no,1),
        coalesce(max(t.team_no)+1,1)
      )::integer as next_team_no
    from public.ta_org_units o
    left join public.employees e
      on lower(trim(coalesce(e.org_code,'')))=lower(trim(o.org_code))
      or (
        nullif(trim(coalesce(e.org_code,'')),'') is null
        and lower(trim(coalesce(e.department,'')))=lower(trim(o.org_name))
      )
    left join public.ta_teams_v61523 t
      on t.org_unit_id=o.org_id
    left join public.ta_team_sequences_v61523 s
      on s.org_unit_id=o.org_id
    where (coalesce(p_include_inactive,false) or coalesce(o.is_active,true))
      and public._ta_team_can_manage_org_v61523(o.org_id)
    group by
      o.org_id,o.org_code,o.org_name,o.org_level_code,o.org_level_name,
      o.level_order,o.sort_order,o.is_active,s.next_no
    having count(distinct public.normalize_emp_code(e."EmployeeId"))>0
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'org_id',r.org_id,
        'org_code',r.org_code,
        'org_name',r.org_name,
        'org_level_code',r.org_level_code,
        'org_level_name',r.org_level_name,
        'employee_count',r.employee_count,
        'active_team_count',r.active_team_count,
        'inactive_team_count',r.inactive_team_count,
        'next_team_no',r.next_team_no,
        'next_team_name','ทีม '||public._ta_team_number_label_v61523(r.next_team_no),
        'next_team_code',public._ta_team_code_prefix_v61523(r.org_code)||'-T'||public._ta_team_number_label_v61523(r.next_team_no),
        'is_active',r.is_active
      )
      order by r.level_order,r.sort_order,r.org_code
    ),
    '[]'::jsonb
  )
  from org_rows r;
$$;

-- ---------------------------------------------------------------------------
-- 5) Team Master reader
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_team_master_v61523(
  p_org_id uuid default null,
  p_include_inactive boolean default true,
  p_search text default null
)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_catalog
as $$
  with rows as (
    select
      t.team_id,
      t.org_unit_id,
      o.org_code,
      o.org_name,
      o.org_level_code,
      t.team_no,
      t.team_code,
      t.team_name,
      o.org_code||' · '||t.team_name as full_label,
      t.is_active,
      t.note,
      t.created_by_email,
      t.created_at,
      t.updated_by_email,
      t.updated_at,
      t.deactivated_by_email,
      t.deactivated_at,
      t.deactivation_reason
    from public.ta_teams_v61523 t
    join public.ta_org_units o on o.org_id=t.org_unit_id
    where public._ta_team_can_manage_org_v61523(t.org_unit_id)
      and (p_org_id is null or t.org_unit_id=p_org_id)
      and (coalesce(p_include_inactive,true) or t.is_active)
      and (
        nullif(trim(coalesce(p_search,'')),'') is null
        or concat_ws(' ',t.team_code,t.team_name,o.org_code,o.org_name,t.created_by_email)
           ilike '%'||trim(p_search)||'%'
      )
  )
  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.org_code,r.team_no),
    '[]'::jsonb
  )
  from rows r;
$$;

-- ---------------------------------------------------------------------------
-- 6) Create Team — Backend owns the name/code and serializes the Org sequence
-- ---------------------------------------------------------------------------
create or replace function public.ta_create_team_v61523(
  p_org_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_actor record;
  v_org public.ta_org_units%rowtype;
  v_team public.ta_teams_v61523%rowtype;
  v_next integer;
  v_today date:=timezone('Asia/Bangkok',now())::date;
begin
  if p_org_id is null then
    raise exception 'TEAM_ORG_REQUIRED';
  end if;

  select * into v_actor
  from public._ta_team_actor_v61523()
  limit 1;
  if not found or v_actor.role not in ('HR_ADMIN','MANAGER') then
    raise exception 'TEAM_MANAGER_ROLE_REQUIRED';
  end if;

  select * into v_org
  from public.ta_org_units o
  where o.org_id=p_org_id
    and coalesce(o.is_active,true)
    and (o.effective_from is null or o.effective_from<=v_today)
    and (o.effective_to is null or o.effective_to>=v_today)
  limit 1;
  if not found then
    raise exception 'TEAM_ORG_NOT_ACTIVE';
  end if;

  if not public._ta_team_can_manage_org_v61523(p_org_id) then
    raise exception 'TEAM_ORG_PERMISSION_DENIED';
  end if;

  if not exists(
    select 1
    from public.employees e
    where lower(trim(coalesce(e.org_code,'')))=lower(trim(v_org.org_code))
       or (
         nullif(trim(coalesce(e.org_code,'')),'') is null
         and lower(trim(coalesce(e.department,'')))=lower(trim(v_org.org_name))
       )
  ) then
    raise exception 'TEAM_ORG_HAS_NO_EMPLOYEES';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('team-master-sequence:'||p_org_id::text)
  );

  insert into public.ta_team_sequences_v61523(
    org_unit_id,next_no,updated_by,updated_at
  )
  values(p_org_id,1,auth.uid(),now())
  on conflict(org_unit_id) do nothing;

  select greatest(
    s.next_no,
    coalesce((
      select max(t.team_no)+1
      from public.ta_teams_v61523 t
      where t.org_unit_id=p_org_id
    ),1)
  )
  into v_next
  from public.ta_team_sequences_v61523 s
  where s.org_unit_id=p_org_id
  for update;

  insert into public.ta_teams_v61523(
    org_unit_id,org_code_snapshot,team_no,team_code,team_name,
    is_active,note,created_by,created_by_email,
    updated_by,updated_by_email,metadata
  )
  values(
    p_org_id,v_org.org_code,v_next,'AUTO','AUTO',
    true,nullif(trim(coalesce(p_note,'')),''),
    v_actor.user_id,v_actor.email,
    v_actor.user_id,v_actor.email,
    jsonb_build_object(
      'created_from','TEAM_MASTER_WEB',
      'auto_generated',true,
      'version','V6.15.23'
    )
  )
  returning * into v_team;

  update public.ta_team_sequences_v61523
  set
    next_no=v_next+1,
    updated_by=v_actor.user_id,
    updated_at=now()
  where org_unit_id=p_org_id;

  insert into public.ta_team_audit_v61523(
    team_id,org_unit_id,org_code,team_code,action_type,
    new_data,reason,actor_user_id,actor_email
  )
  values(
    v_team.team_id,p_org_id,v_org.org_code,v_team.team_code,
    'CREATE_TEAM',to_jsonb(v_team),p_note,v_actor.user_id,v_actor.email
  );

  return to_jsonb(v_team)
    || jsonb_build_object(
      'org_code',v_org.org_code,
      'org_name',v_org.org_name,
      'full_label',v_org.org_code||' · '||v_team.team_name,
      'version','V6.15.23'
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Soft deactivate only. Team identity/number is never deleted or recycled.
-- ---------------------------------------------------------------------------
create or replace function public.ta_deactivate_team_v61523(
  p_team_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_actor record;
  v_old public.ta_teams_v61523%rowtype;
  v_new public.ta_teams_v61523%rowtype;
  v_reason text:=nullif(trim(coalesce(p_reason,'')),'');
begin
  if p_team_id is null then
    raise exception 'TEAM_ID_REQUIRED';
  end if;
  if v_reason is null then
    raise exception 'TEAM_DEACTIVATION_REASON_REQUIRED';
  end if;

  select * into v_actor
  from public._ta_team_actor_v61523()
  limit 1;
  if not found or v_actor.role not in ('HR_ADMIN','MANAGER') then
    raise exception 'TEAM_MANAGER_ROLE_REQUIRED';
  end if;

  select * into v_old
  from public.ta_teams_v61523 t
  where t.team_id=p_team_id
  for update;

  if not found then
    raise exception 'TEAM_NOT_FOUND';
  end if;

  if not public._ta_team_can_manage_org_v61523(v_old.org_unit_id) then
    raise exception 'TEAM_ORG_PERMISSION_DENIED';
  end if;

  if not v_old.is_active then
    return to_jsonb(v_old)
      || jsonb_build_object('changed',false,'version','V6.15.23');
  end if;

  update public.ta_teams_v61523 t
  set
    is_active=false,
    deactivated_by=v_actor.user_id,
    deactivated_by_email=v_actor.email,
    deactivated_at=now(),
    deactivation_reason=v_reason,
    updated_by=v_actor.user_id,
    updated_by_email=v_actor.email,
    updated_at=now()
  where t.team_id=p_team_id
  returning * into v_new;

  insert into public.ta_team_audit_v61523(
    team_id,org_unit_id,org_code,team_code,action_type,
    old_data,new_data,reason,actor_user_id,actor_email
  )
  values(
    v_new.team_id,v_new.org_unit_id,v_new.org_code_snapshot,v_new.team_code,
    'DEACTIVATE_TEAM',to_jsonb(v_old),to_jsonb(v_new),v_reason,
    v_actor.user_id,v_actor.email
  );

  return to_jsonb(v_new)
    || jsonb_build_object('changed',true,'version','V6.15.23');
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) Team Audit reader
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_team_audit_v61523(
  p_team_id uuid default null,
  p_limit integer default 100
)
returns jsonb
language sql
stable
security definer
set search_path=public,pg_catalog
as $$
  with rows as (
    select
      a.audit_id,
      a.team_id,
      a.org_unit_id,
      a.org_code,
      a.team_code,
      a.action_type,
      a.reason,
      a.actor_email,
      a.created_at
    from public.ta_team_audit_v61523 a
    where (p_team_id is null or a.team_id=p_team_id)
      and a.org_unit_id is not null
      and public._ta_team_can_manage_org_v61523(a.org_unit_id)
    order by a.created_at desc,a.audit_id desc
    limit greatest(1,least(coalesce(p_limit,100),500))
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.audit_id desc),'[]'::jsonb)
  from rows r;
$$;

-- ---------------------------------------------------------------------------
-- 9) Permissions
-- ---------------------------------------------------------------------------
revoke all on function public._ta_team_actor_v61523() from public,anon,authenticated;
revoke all on function public._ta_team_code_prefix_v61523(text) from public,anon,authenticated;
revoke all on function public._ta_team_number_label_v61523(integer) from public,anon,authenticated;
revoke all on function public._ta_team_can_manage_org_v61523(uuid) from public,anon,authenticated;
revoke all on function public.ta_get_team_org_options_v61523(boolean) from public,anon,authenticated;
revoke all on function public.ta_get_team_master_v61523(uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.ta_create_team_v61523(uuid,text) from public,anon,authenticated;
revoke all on function public.ta_deactivate_team_v61523(uuid,text) from public,anon,authenticated;
revoke all on function public.ta_get_team_audit_v61523(uuid,integer) from public,anon,authenticated;

grant execute on function public.ta_get_team_org_options_v61523(boolean) to authenticated;
grant execute on function public.ta_get_team_master_v61523(uuid,boolean,text) to authenticated;
grant execute on function public.ta_create_team_v61523(uuid,text) to authenticated;
grant execute on function public.ta_deactivate_team_v61523(uuid,text) to authenticated;
grant execute on function public.ta_get_team_audit_v61523(uuid,integer) to authenticated;

comment on table public.ta_teams_v61523 is
'V6.15.23 4D.1A Team Master. Team code/name are backend generated; Membership and Team Enforcement are intentionally deferred to 4D.1B/4D.1C.';

comment on function public.ta_create_team_v61523(uuid,text) is
'Creates the next immutable Team identity for an authorized Org Unit. Example BE5-T01 / ทีม 01. Team number is never recycled.';

notify pgrst,'reload schema';
commit;
