-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.15.22
-- 4C.4 — Leave Result Sync + Employee Portal Outcome + Notification
-- ============================================================================

with checks as (
  select 1 seq,'leave_apply_v61521_retained' check_name,
    case when to_regprocedure('public.ta_apply_employee_request_leave_v61521(uuid,text)') is not null then 'PASS' else 'FAIL' end result,
    'Canonical V6.15.21 Leave Apply ยังอยู่' detail

  union all
  select 2,'leave_result_wrapper_exists',
    case when to_regprocedure('public.ta_apply_employee_request_leave_v61522(uuid,text)') is not null then 'PASS' else 'FAIL' end,
    'มี 4C.4 wrapper สำหรับ Apply + Publish Outcome'

  union all
  select 3,'leave_trigger_pending_only',
    case when exists(
      select 1
      from pg_trigger t
      where t.tgrelid='public.ta_employee_requests_v61481'::regclass
        and t.tgname='trg_aa_ta_employee_request_leave_v61508'
        and not t.tgisinternal
        and pg_get_triggerdef(t.oid) ilike '%WHEN%status%PENDING%'
    ) then 'PASS' else 'FAIL' end,
    'Leave semantic trigger ทำงานเฉพาะ Employee PENDING insert/edit'

  union all
  select 4,'captures_review_before_apply',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61522(uuid,text)'::regprocedure)
      ilike '%ta_get_employee_request_leave_review_v61521%'
      and strpos(
        pg_get_functiondef('public.ta_apply_employee_request_leave_v61522(uuid,text)'::regprocedure),
        'ta_get_employee_request_leave_review_v61521'
      ) < strpos(
        pg_get_functiondef('public.ta_apply_employee_request_leave_v61522(uuid,text)'::regprocedure),
        'ta_apply_employee_request_leave_v61521'
      )
      then 'PASS' else 'FAIL' end,
    'เก็บ Before-state จาก Backend Review ก่อน mutation'

  union all
  select 5,'delegates_atomic_apply_v61521',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61522(uuid,text)'::regprocedure)
      ilike '%ta_apply_employee_request_leave_v61521%' then 'PASS' else 'FAIL' end,
    'Business mutation ยังผ่าน V6.15.21 Atomic Writer'

  union all
  select 6,'full_day_before_after_result',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61522(uuid,text)'::regprocedure)
      ilike '%before_shift_code%after_shift_code%SET_LV%SKIP%' then 'PASS' else 'FAIL' end,
    'FULL_DAY publish ก่อน → หลัง และแยก SET_LV / SKIP'

  union all
  select 7,'partial_leave_outcome',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61522(uuid,text)'::regprocedure)
      ilike '%PARTIAL_OVERLAY%partial_leave%leave_start_time%leave_end_time%' then 'PASS' else 'FAIL' end,
    'PARTIAL_DAY publish Overlay + ช่วงเวลา + คงกะเดิม'

  union all
  select 8,'request_detail_outcome_snapshot',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61522(uuid,text)'::regprocedure)
      ilike '%manager_leave_apply_result_v61522%' then 'PASS' else 'FAIL' end,
    'ผลลัพธ์ exact ถูกเก็บใน Request detail'

  union all
  select 9,'hr_connect_reminder_retained',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61522(uuid,text)'::regprocedure)
      ilike '%HR Connect%hr_connect_required%hr_connect_reminder%' then 'PASS' else 'FAIL' end,
    'Employee Portal ย้ำว่า Official Leave ยังอยู่ HR Connect'

  union all
  select 10,'leave_resolved_notification_title',
    case when pg_get_functiondef('public._ta_portal_request_status_notify_v61482()'::regprocedure)
      ilike '%LEAVE_REQUEST%ตารางกะตามคำขอลาปรับแล้ว%แจ้งลาบางส่วนดำเนินการแล้ว%' then 'PASS' else 'FAIL' end,
    'Status notification แยกคำขอลาโดยตรง'

  union all
  select 11,'notification_enriched_no_duplicate',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61522(uuid,text)'::regprocedure)
      ilike '%order by n.created_at desc%for update%is_read=false%'
      then 'PASS' else 'FAIL' end,
    'Enrich notification ล่าสุดและทำเป็น unread โดยไม่สร้างซ้ำเมื่อมี row เดิม'

  union all
  select 12,'notification_links_request',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61522(uuid,text)'::regprocedure)
      ilike '%request_id%notification_id%' then 'PASS' else 'FAIL' end,
    'Notification ผูก request_id ให้ Portal แตะเปิดคำขอได้'

  union all
  select 13,'outcome_audit_exists',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61522(uuid,text)'::regprocedure)
      ilike '%PORTAL_LEAVE_OUTCOME_PUBLISHED_V61522%' then 'PASS' else 'FAIL' end,
    'มี Audit ของ Outcome publication'

  union all
  select 14,'same_transaction_publication',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61522(uuid,text)'::regprocedure)
      ilike '%ta_apply_employee_request_leave_v61521%manager_leave_apply_result_v61522%ta_employee_portal_notifications_v61482%'
      then 'PASS' else 'FAIL' end,
    'Apply + Request Result + Notification อยู่ใน RPC transaction เดียว'

  union all
  select 15,'authenticated_execute',
    case when has_function_privilege('authenticated','public.ta_apply_employee_request_leave_v61522(uuid,text)','EXECUTE')
      then 'PASS' else 'FAIL' end,
    'Manager Web เรียก V6.15.22 ได้'

  union all
  select 16,'portal_notification_reader_retained',
    case when to_regprocedure('public.ta_portal_get_notifications_v61482(text,integer)') is not null
      then 'PASS' else 'FAIL' end,
    'Employee Portal Notification reader ยังอยู่'

  union all
  select 17,'portal_request_reader_retained',
    case when to_regprocedure('public.ta_portal_get_my_requests_v61482(text,date,date)') is not null
      then 'PASS' else 'FAIL' end,
    'Employee Portal My Requests reader ยังอยู่'

  union all
  select 18,'portal_sync_state_retained',
    case when to_regprocedure('public.ta_portal_get_sync_state_v61513(text)') is not null
      then 'PASS' else 'FAIL' end,
    'Auto Sync revision endpoint ยังอยู่'
)
select seq,check_name,result,detail
from checks
order by seq;
