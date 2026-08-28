-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.15.13
-- Request & Employee Portal Synchronization Revision
-- ============================================================================

with checks as (
  select
    1 as seq,
    'portal_sync_state_table'::text as check_name,
    case
      when to_regclass(
        'public.ta_portal_sync_state_v61513'
      ) is not null
      then 'PASS' else 'FAIL'
    end as result,
    'มี Revision State รายพนักงาน'::text as detail

  union all

  select
    2,
    'manager_sync_state_table',
    case
      when to_regclass(
        'public.ta_manager_request_sync_v61513'
      ) is not null
      then 'PASS' else 'FAIL'
    end,
    'มี Global Revision สำหรับ Manager Request Center'

  union all

  select
    3,
    'portal_sync_rpc_is_volatile',
    case
      when exists(
        select 1
        from pg_proc p
        where p.oid=to_regprocedure(
          'public.ta_portal_get_sync_state_v61513(text)'
        )
          and p.provolatile='v'
      )
      then 'PASS' else 'FAIL'
    end,
    'Portal Sync RPC รองรับ Session last_seen_at'

  union all

  select
    4,
    'manager_sync_rpc_exists',
    case
      when to_regprocedure(
        'public.ta_get_employee_request_sync_state_v61513()'
      ) is not null
      then 'PASS' else 'FAIL'
    end,
    'Manager มี Lightweight Sync RPC'

  union all

  select
    5,
    'schedule_sync_trigger',
    case
      when exists(
        select 1
        from pg_trigger
        where tgname='trg_ta_portal_sync_shift_calendar_v61513'
          and tgenabled<>'D'
      )
      then 'PASS' else 'FAIL'
    end,
    'Manager เปลี่ยนกะแล้ว Portal data_revision เปลี่ยน'

  union all

  select
    6,
    'attendance_sync_triggers',
    case
      when (
        select count(*)
        from pg_trigger
        where tgname in (
          'trg_ta_portal_sync_attendance_workday_v61513',
          'trg_ta_portal_sync_attendance_calc_v61513',
          'trg_ta_portal_sync_certification_v61513'
        )
          and tgenabled<>'D'
      )=3
      then 'PASS' else 'FAIL'
    end,
    'Attendance / Calculation / Certification เชื่อม Revision'

  union all

  select
    7,
    'request_sync_trigger',
    case
      when exists(
        select 1
        from pg_trigger
        where tgname='trg_ta_portal_sync_request_v61513'
          and tgenabled<>'D'
      )
      then 'PASS' else 'FAIL'
    end,
    'Request เปลี่ยนแล้ว Portal และ Manager Revision เปลี่ยน'

  union all

  select
    8,
    'notification_sync_trigger',
    case
      when exists(
        select 1
        from pg_trigger
        where tgname='trg_ta_portal_sync_notification_v61513'
          and tgenabled<>'D'
      )
      then 'PASS' else 'FAIL'
    end,
    'Notification เปลี่ยนแล้ว Portal ตรวจพบ'

  union all

  select
    9,
    'partial_leave_sync_trigger',
    case
      when to_regclass(
        'public.ta_portal_partial_leave_overlays_v61511'
      ) is null
      then 'PASS'
      when exists(
        select 1
        from pg_trigger
        where tgname='trg_ta_portal_sync_partial_leave_v61513'
          and tgenabled<>'D'
      )
      then 'PASS'
      else 'FAIL'
    end,
    'Partial Leave Overlay เชื่อมกับ Portal Revision'

  union all

  select
    10,
    'portal_sync_anon_execute',
    case
      when has_function_privilege(
        'anon',
        'public.ta_portal_get_sync_state_v61513(text)',
        'EXECUTE'
      )
      then 'PASS' else 'FAIL'
    end,
    'Employee Portal เรียก Sync State ได้'

  union all

  select
    11,
    'manager_sync_authenticated_execute',
    case
      when has_function_privilege(
        'authenticated',
        'public.ta_get_employee_request_sync_state_v61513()',
        'EXECUTE'
      )
      then 'PASS' else 'FAIL'
    end,
    'Manager เรียก Sync State ได้'

  union all

  select
    12,
    'sync_tables_not_directly_exposed',
    case
      when not has_table_privilege(
        'anon',
        'public.ta_portal_sync_state_v61513',
        'SELECT'
      )
       and not has_table_privilege(
        'authenticated',
        'public.ta_manager_request_sync_v61513',
        'SELECT'
      )
      then 'PASS' else 'FAIL'
    end,
    'Client อ่าน Revision Table ตรง ๆ ไม่ได้'
)
select *
from checks
order by seq;

-- ---------------------------------------------------------------------------
-- ดู Revision State ที่ถูกสร้างแล้ว
-- ---------------------------------------------------------------------------
select
  emp_code,
  data_revision,
  request_revision,
  notification_revision,
  data_updated_at,
  request_updated_at,
  notification_updated_at,
  updated_at
from public.ta_portal_sync_state_v61513
order by updated_at desc
limit 30;

select
  singleton_id,
  request_revision,
  updated_at
from public.ta_manager_request_sync_v61513;
