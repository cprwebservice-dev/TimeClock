-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.15.19
-- 4B.2D — Employee Portal Result Sync + Notification + Returned Flow
-- ============================================================================

with checks as (
  select 1 seq,'returned_status_supported' check_name,
    case when exists(
      select 1
      from pg_constraint c
      where c.conrelid='public.ta_employee_requests_v61481'::regclass
        and c.conname='ta_employee_requests_v61481_status_ck'
        and pg_get_constraintdef(c.oid) ilike '%RETURNED%'
    ) then 'PASS' else 'FAIL' end result,
    'Request status รองรับ RETURNED' detail

  union all
  select 2,'manager_return_rpc',
    case when to_regprocedure('public.ta_return_employee_request_v61519(uuid,text)') is not null then 'PASS' else 'FAIL' end,
    'Manager ส่งคำขอวันหยุดกลับให้ Employee แก้ไขได้'

  union all
  select 3,'manager_return_authority',
    case when pg_get_functiondef('public.ta_return_employee_request_v61519(uuid,text)'::regprocedure)
      ilike '%_ta_request_manager_authorized_v61481%' then 'PASS' else 'FAIL' end,
    'Return ยังคุม Canonical Manager authorization'

  union all
  select 4,'portal_return_edit_supported',
    case when pg_get_functiondef('public.ta_portal_update_request_v61494(text,uuid,date,text,text,text,jsonb)'::regprocedure)
      ilike '%status in (''PENDING'',''RETURNED'')%'
      and pg_get_functiondef('public.ta_portal_update_request_v61494(text,uuid,date,text,text,text,jsonb)'::regprocedure)
      ilike '%PORTAL_REQUEST_RESUBMITTED_V61519%'
      then 'PASS' else 'FAIL' end,
    'Employee แก้ RETURNED แล้วส่งกลับเป็น PENDING ได้'

  union all
  select 5,'portal_return_cancel_supported',
    case when pg_get_functiondef('public.ta_portal_cancel_request_v61482(text,uuid)'::regprocedure)
      ilike '%status in (''PENDING'',''RETURNED'')%'
      then 'PASS' else 'FAIL' end,
    'Employee ยกเลิก RETURNED ได้'

  union all
  select 6,'portal_status_notification_returned',
    case when pg_get_functiondef('public._ta_portal_request_status_notify_v61482()'::regprocedure)
      ilike '%RETURNED%Manager ส่งคำขอกลับให้แก้ไข%'
      then 'PASS' else 'FAIL' end,
    'Notification รองรับ RETURNED'

  union all
  select 7,'portal_notification_trigger',
    case when exists(
      select 1 from pg_trigger t
      where t.tgrelid='public.ta_employee_requests_v61481'::regclass
        and t.tgname='trg_ta_portal_request_status_notify_v61482'
        and not t.tgisinternal
        and t.tgenabled in ('O','A')
    ) then 'PASS' else 'FAIL' end,
    'Status -> Portal Notification trigger ทำงาน'

  union all
  select 8,'dayoff_publish_rpc',
    case when to_regprocedure('public.ta_apply_employee_request_dayoff_v61519(uuid,boolean,text)') is not null then 'PASS' else 'FAIL' end,
    '4B.2D day-off apply/publish RPC พร้อมใช้'

  union all
  select 9,'dayoff_delegates_atomic_v61518',
    case when pg_get_functiondef('public.ta_apply_employee_request_dayoff_v61519(uuid,boolean,text)'::regprocedure)
      ilike '%ta_apply_employee_request_dayoff_v61518%'
      then 'PASS' else 'FAIL' end,
    'ยังใช้ V6.15.18 Atomic Approve เป็น Business Writer'

  union all
  select 10,'outcome_persisted_to_request',
    case when pg_get_functiondef('public.ta_apply_employee_request_dayoff_v61519(uuid,boolean,text)'::regprocedure)
      ilike '%manager_apply_result_v61519%'
      and pg_get_functiondef('public.ta_apply_employee_request_dayoff_v61519(uuid,boolean,text)'::regprocedure)
      ilike '%schedule_changes%'
      then 'PASS' else 'FAIL' end,
    'ผล Source/Target จริงถูกเก็บใน Request Detail'

  union all
  select 11,'notification_enriched_without_duplicate',
    case when pg_get_functiondef('public.ta_apply_employee_request_dayoff_v61519(uuid,boolean,text)'::regprocedure)
      ilike '%order by n.created_at desc%for update%'
      and pg_get_functiondef('public.ta_apply_employee_request_dayoff_v61519(uuid,boolean,text)'::regprocedure)
      ilike '%update public.ta_employee_portal_notifications_v61482%'
      then 'PASS' else 'FAIL' end,
    'อัปเดต Notification เดิมเป็นผลจริง ไม่สร้างซ้ำโดยไม่จำเป็น'

  union all
  select 12,'outcome_publish_audit',
    case when pg_get_functiondef('public.ta_apply_employee_request_dayoff_v61519(uuid,boolean,text)'::regprocedure)
      ilike '%PORTAL_DAYOFF_OUTCOME_PUBLISHED_V61519%'
      then 'PASS' else 'FAIL' end,
    'มี Audit การ Publish ผลกลับ Portal'

  union all
  select 13,'portal_sync_request_trigger_retained',
    case when exists(
      select 1 from pg_trigger t
      where t.tgrelid='public.ta_employee_requests_v61481'::regclass
        and t.tgname='trg_ta_portal_sync_request_v61513'
        and not t.tgisinternal
        and t.tgenabled in ('O','A')
    ) then 'PASS' else 'FAIL' end,
    'Request revision sync ยังทำงาน'

  union all
  select 14,'portal_sync_notification_trigger_retained',
    case when exists(
      select 1 from pg_trigger t
      where t.tgrelid='public.ta_employee_portal_notifications_v61482'::regclass
        and t.tgname='trg_ta_portal_sync_notification_v61513'
        and not t.tgisinternal
        and t.tgenabled in ('O','A')
    ) then 'PASS' else 'FAIL' end,
    'Notification revision sync ยังทำงาน'

  union all
  select 15,'portal_sync_schedule_trigger_retained',
    case when exists(
      select 1 from pg_trigger t
      where t.tgrelid='public.shift_calendar'::regclass
        and t.tgname='trg_ta_portal_sync_shift_calendar_v61513'
        and not t.tgisinternal
        and t.tgenabled in ('O','A')
    ) then 'PASS' else 'FAIL' end,
    'Schedule mutation ยัง bump DATA revision ให้ Portal refresh'

  union all
  select 16,'authenticated_manager_execute',
    case when has_function_privilege('authenticated','public.ta_apply_employee_request_dayoff_v61519(uuid,boolean,text)','EXECUTE')
      and has_function_privilege('authenticated','public.ta_return_employee_request_v61519(uuid,text)','EXECUTE')
      then 'PASS' else 'FAIL' end,
    'Manager Web เรียก Apply + Return ได้'

  union all
  select 17,'portal_execute_retained',
    case when has_function_privilege('anon','public.ta_portal_update_request_v61494(text,uuid,date,text,text,text,jsonb)','EXECUTE')
      and has_function_privilege('anon','public.ta_portal_cancel_request_v61482(text,uuid)','EXECUTE')
      then 'PASS' else 'FAIL' end,
    'Employee Portal ยังแก้/ยกเลิกคำขอได้'

  union all
  select 18,'returned_resubmit_notifies_manager',
    case when pg_get_functiondef('public.ta_portal_update_request_v61494(text,uuid,date,text,text,text,jsonb)'::regprocedure)
      ilike '%พนักงานแก้ไขคำขอและส่งกลับแล้ว%'
      and pg_get_functiondef('public.ta_portal_update_request_v61494(text,uuid,date,text,text,text,jsonb)'::regprocedure)
      ilike '%_ta_request_notify_v61481%'
      then 'PASS' else 'FAIL' end,
    'Employee แก้ RETURNED แล้ว Manager ได้รับ notification รอบใหม่'

  union all
  select 19,'dayoff_lifecycle_guard_nonpending_skip',
    case when pg_get_functiondef('public._ta_guard_portal_dayoff_request_v61517()'::regprocedure)
      ilike '%tg_op=''UPDATE''%new.status%<>''PENDING''%return new%'
      then 'PASS' else 'FAIL' end,
    'RETURNED / RESOLVED metadata update ไม่ถูก Day-off semantic guard ย้อนตรวจหลัง Schedule เปลี่ยนแล้ว'
)
select seq,check_name,result,detail
from checks
order by seq;
