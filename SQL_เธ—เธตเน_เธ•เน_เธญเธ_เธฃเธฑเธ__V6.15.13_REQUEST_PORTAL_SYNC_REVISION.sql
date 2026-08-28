-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.15.13
-- Request & Employee Portal Synchronization Revision
-- ============================================================================
-- เป้าหมาย
-- 1) หลัง Manager Apply/Approve แล้ว Employee Portal ตรวจพบการเปลี่ยนแปลงเอง
-- 2) โหลดเฉพาะ Module ที่เปลี่ยน ไม่ Refresh ทุก RPC ทุกครั้ง
-- 3) หน้า Manager Request Center ตรวจพบคำขอใหม่/สถานะใหม่โดยไม่ต้องกดค้นหาซ้ำ
-- 4) ใช้ Revision Counter เบา ๆ แทน Poll ตาราง Schedule/Attendance ขนาดใหญ่
-- ============================================================================

begin;
set local statement_timeout='0';

select pg_advisory_xact_lock(
  hashtext('timeclock-v6.15.13-request-portal-sync-revision')
);

-- ---------------------------------------------------------------------------
-- 0) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.shift_calendar') is null then
    raise exception 'MISSING_TABLE: shift_calendar';
  end if;

  if to_regclass('public.attendance_workday') is null then
    raise exception 'MISSING_TABLE: attendance_workday';
  end if;

  if to_regclass('public.ta_attendance_calculations') is null then
    raise exception 'MISSING_TABLE: ta_attendance_calculations';
  end if;

  if to_regclass('public.ta_attendance_certifications') is null then
    raise exception 'MISSING_TABLE: ta_attendance_certifications';
  end if;

  if to_regclass('public.ta_employee_requests_v61481') is null then
    raise exception 'MISSING_TABLE: ta_employee_requests_v61481';
  end if;

  if to_regclass('public.ta_employee_portal_notifications_v61482') is null then
    raise exception 'MISSING_TABLE: ta_employee_portal_notifications_v61482';
  end if;

  if to_regprocedure(
    'public._ta_portal_session_emp_v61482(text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_portal_session_emp_v61482(text)';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Per-employee lightweight revision state.
--
-- data_revision:
--   Schedule / Attendance / Certification / Work Mode / Partial Leave
--
-- request_revision:
--   Employee Request create/edit/cancel/approve/resolve/reject
--
-- notification_revision:
--   Employee Portal notification create/read
-- ---------------------------------------------------------------------------
create table if not exists public.ta_portal_sync_state_v61513 (
  emp_code text primary key,
  data_revision bigint not null default 0,
  request_revision bigint not null default 0,
  notification_revision bigint not null default 0,
  data_updated_at timestamptz,
  request_updated_at timestamptz,
  notification_updated_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.ta_portal_sync_state_v61513
  enable row level security;

revoke all on table
  public.ta_portal_sync_state_v61513
from public,anon,authenticated;

-- Global lightweight revision for Manager Request Center.
create table if not exists public.ta_manager_request_sync_v61513 (
  singleton_id smallint primary key
    check (singleton_id=1),
  request_revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.ta_manager_request_sync_v61513(
  singleton_id,
  request_revision
)
values(1,0)
on conflict(singleton_id) do nothing;

alter table public.ta_manager_request_sync_v61513
  enable row level security;

revoke all on table
  public.ta_manager_request_sync_v61513
from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 2) Internal revision bump.
-- ---------------------------------------------------------------------------
create or replace function public._ta_portal_sync_bump_v61513(
  p_emp_code text,
  p_kind text
)
returns void
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_emp text:=public.normalize_emp_code(p_emp_code);
  v_kind text:=upper(trim(coalesce(p_kind,'')));
  v_now timestamptz:=clock_timestamp();
begin
  if nullif(v_emp,'') is null then
    return;
  end if;

  if v_kind not in (
    'DATA',
    'REQUEST',
    'NOTIFICATION'
  ) then
    raise exception 'INVALID_SYNC_KIND:%',v_kind;
  end if;

  insert into public.ta_portal_sync_state_v61513(
    emp_code,
    data_revision,
    request_revision,
    notification_revision,
    data_updated_at,
    request_updated_at,
    notification_updated_at,
    updated_at
  )
  values(
    v_emp,
    case when v_kind='DATA' then 1 else 0 end,
    case when v_kind='REQUEST' then 1 else 0 end,
    case when v_kind='NOTIFICATION' then 1 else 0 end,
    case when v_kind='DATA' then v_now else null end,
    case when v_kind='REQUEST' then v_now else null end,
    case when v_kind='NOTIFICATION' then v_now else null end,
    v_now
  )
  on conflict(emp_code)
  do update set
    data_revision=
      public.ta_portal_sync_state_v61513.data_revision
      + case when v_kind='DATA' then 1 else 0 end,

    request_revision=
      public.ta_portal_sync_state_v61513.request_revision
      + case when v_kind='REQUEST' then 1 else 0 end,

    notification_revision=
      public.ta_portal_sync_state_v61513.notification_revision
      + case when v_kind='NOTIFICATION' then 1 else 0 end,

    data_updated_at=
      case
        when v_kind='DATA'
          then v_now
        else public.ta_portal_sync_state_v61513.data_updated_at
      end,

    request_updated_at=
      case
        when v_kind='REQUEST'
          then v_now
        else public.ta_portal_sync_state_v61513.request_updated_at
      end,

    notification_updated_at=
      case
        when v_kind='NOTIFICATION'
          then v_now
        else public.ta_portal_sync_state_v61513.notification_updated_at
      end,

    updated_at=v_now;
end;
$$;

revoke all on function
  public._ta_portal_sync_bump_v61513(text,text)
from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 3) Trigger helpers.
-- ---------------------------------------------------------------------------
create or replace function public._ta_portal_sync_data_row_v61513()
returns trigger
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_emp text;
begin
  v_emp:=
    public.normalize_emp_code(
      case
        when tg_op='DELETE'
          then old.emp_code
        else new.emp_code
      end
    );

  perform public._ta_portal_sync_bump_v61513(
    v_emp,
    'DATA'
  );

  if tg_op='DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public._ta_portal_sync_request_row_v61513()
returns trigger
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_emp text;
begin
  v_emp:=
    public.normalize_emp_code(
      case
        when tg_op='DELETE'
          then old.emp_code
        else new.emp_code
      end
    );

  perform public._ta_portal_sync_bump_v61513(
    v_emp,
    'REQUEST'
  );

  update public.ta_manager_request_sync_v61513
  set
    request_revision=request_revision+1,
    updated_at=clock_timestamp()
  where singleton_id=1;

  if tg_op='DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create or replace function public._ta_portal_sync_notification_row_v61513()
returns trigger
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_emp text;
begin
  v_emp:=
    public.normalize_emp_code(
      case
        when tg_op='DELETE'
          then old.emp_code
        else new.emp_code
      end
    );

  perform public._ta_portal_sync_bump_v61513(
    v_emp,
    'NOTIFICATION'
  );

  if tg_op='DELETE' then
    return old;
  end if;

  return new;
end;
$$;

revoke all on function
  public._ta_portal_sync_data_row_v61513()
from public,anon,authenticated;

revoke all on function
  public._ta_portal_sync_request_row_v61513()
from public,anon,authenticated;

revoke all on function
  public._ta_portal_sync_notification_row_v61513()
from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 4) Data triggers.
-- ---------------------------------------------------------------------------
drop trigger if exists
  trg_ta_portal_sync_shift_calendar_v61513
on public.shift_calendar;

create trigger trg_ta_portal_sync_shift_calendar_v61513
after insert or update or delete
on public.shift_calendar
for each row
execute function public._ta_portal_sync_data_row_v61513();

drop trigger if exists
  trg_ta_portal_sync_attendance_workday_v61513
on public.attendance_workday;

create trigger trg_ta_portal_sync_attendance_workday_v61513
after insert or update or delete
on public.attendance_workday
for each row
execute function public._ta_portal_sync_data_row_v61513();

drop trigger if exists
  trg_ta_portal_sync_attendance_calc_v61513
on public.ta_attendance_calculations;

create trigger trg_ta_portal_sync_attendance_calc_v61513
after insert or update or delete
on public.ta_attendance_calculations
for each row
execute function public._ta_portal_sync_data_row_v61513();

drop trigger if exists
  trg_ta_portal_sync_certification_v61513
on public.ta_attendance_certifications;

create trigger trg_ta_portal_sync_certification_v61513
after insert or update or delete
on public.ta_attendance_certifications
for each row
execute function public._ta_portal_sync_data_row_v61513();

-- Work Mode / Special Work assignment.
do $$
begin
  if to_regclass(
    'public.ta_schedule_rule_assignments'
  ) is not null then

    execute '
      drop trigger if exists
        trg_ta_portal_sync_schedule_rule_v61513
      on public.ta_schedule_rule_assignments
    ';

    execute '
      create trigger
        trg_ta_portal_sync_schedule_rule_v61513
      after insert or update or delete
      on public.ta_schedule_rule_assignments
      for each row
      execute function
        public._ta_portal_sync_data_row_v61513()
    ';
  end if;
end;
$$;

-- Partial Leave Overlay.
do $$
begin
  if to_regclass(
    'public.ta_portal_partial_leave_overlays_v61511'
  ) is not null then

    execute '
      drop trigger if exists
        trg_ta_portal_sync_partial_leave_v61513
      on public.ta_portal_partial_leave_overlays_v61511
    ';

    execute '
      create trigger
        trg_ta_portal_sync_partial_leave_v61513
      after insert or update or delete
      on public.ta_portal_partial_leave_overlays_v61511
      for each row
      execute function
        public._ta_portal_sync_data_row_v61513()
    ';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Request / Notification triggers.
-- ---------------------------------------------------------------------------
drop trigger if exists
  trg_ta_portal_sync_request_v61513
on public.ta_employee_requests_v61481;

create trigger trg_ta_portal_sync_request_v61513
after insert or update or delete
on public.ta_employee_requests_v61481
for each row
execute function public._ta_portal_sync_request_row_v61513();

drop trigger if exists
  trg_ta_portal_sync_notification_v61513
on public.ta_employee_portal_notifications_v61482;

create trigger trg_ta_portal_sync_notification_v61513
after insert or update or delete
on public.ta_employee_portal_notifications_v61482
for each row
execute function public._ta_portal_sync_notification_row_v61513();

-- ---------------------------------------------------------------------------
-- 6) Employee Portal lightweight sync RPC.
--
-- IMPORTANT: VOLATILE is intentional because Portal Session validation
-- updates last_seen_at.
-- ---------------------------------------------------------------------------
create or replace function public.ta_portal_get_sync_state_v61513(
  p_session_token text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_emp text;
  v_state public.ta_portal_sync_state_v61513%rowtype;
  v_unread integer:=0;
begin
  v_emp:=
    public._ta_portal_session_emp_v61482(
      p_session_token
    );

  select *
  into v_state
  from public.ta_portal_sync_state_v61513 s
  where s.emp_code=v_emp;

  select count(*)::integer
  into v_unread
  from public.ta_employee_portal_notifications_v61482 n
  where public.normalize_emp_code(n.emp_code)=v_emp
    and coalesce(n.is_read,false)=false;

  return jsonb_build_object(
    'emp_code',v_emp,
    'data_revision',
      coalesce(v_state.data_revision,0),
    'request_revision',
      coalesce(v_state.request_revision,0),
    'notification_revision',
      coalesce(v_state.notification_revision,0),

    'data_updated_at',
      v_state.data_updated_at,
    'request_updated_at',
      v_state.request_updated_at,
    'notification_updated_at',
      v_state.notification_updated_at,

    'unread_notifications',
      coalesce(v_unread,0),

    'server_time',
      clock_timestamp(),

    'poll_seconds',
      20,

    'version',
      'V6.15.13'
  );
end;
$$;

revoke all on function
  public.ta_portal_get_sync_state_v61513(text)
from public;

grant execute on function
  public.ta_portal_get_sync_state_v61513(text)
to anon,authenticated;

-- ---------------------------------------------------------------------------
-- 7) Manager Request Center lightweight sync RPC.
--
-- Returns only a global revision counter. No employee/request data is exposed.
-- Current scope/data is still enforced by ta_get_employee_requests_v61481.
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_employee_request_sync_state_v61513()
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
declare
  v_role text;
  v_rev bigint:=0;
  v_updated timestamptz;
begin
  select upper(coalesce(p.role,'VIEWER'))
  into v_role
  from public.ta_user_profiles p
  where p.user_id=auth.uid()
    and p.is_active=true
  limit 1;

  if v_role not in ('HR_ADMIN','MANAGER') then
    raise exception 'REQUEST_SYNC_PERMISSION_DENIED';
  end if;

  select
    s.request_revision,
    s.updated_at
  into
    v_rev,
    v_updated
  from public.ta_manager_request_sync_v61513 s
  where s.singleton_id=1;

  return jsonb_build_object(
    'request_revision',
      coalesce(v_rev,0),
    'updated_at',
      v_updated,
    'server_time',
      clock_timestamp(),
    'poll_seconds',
      20,
    'version',
      'V6.15.13'
  );
end;
$$;

revoke all on function
  public.ta_get_employee_request_sync_state_v61513()
from public;

grant execute on function
  public.ta_get_employee_request_sync_state_v61513()
to authenticated;

notify pgrst,'reload schema';

commit;
