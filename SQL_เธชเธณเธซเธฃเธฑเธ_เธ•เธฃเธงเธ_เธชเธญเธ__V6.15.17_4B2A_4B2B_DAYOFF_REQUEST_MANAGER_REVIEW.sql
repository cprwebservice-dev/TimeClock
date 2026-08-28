-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- TimeClock Enterprise V6.15.17
-- 4B.2A + 4B.2B — Day-off Request Submit Guard + Manager Review Preflight
-- ============================================================================

with checks as (
  select
    1 as seq,
    'portal_dayoff_guard_function'::text as check_name,
    case when to_regprocedure(
      'public._ta_guard_portal_dayoff_request_v61517()'
    ) is not null then 'PASS' else 'FAIL' end as result,
    'มี Backend guard สำหรับ Portal create/edit'::text as detail

  union all

  select
    2,
    'portal_dayoff_guard_trigger',
    case when exists(
      select 1
      from pg_trigger t
      join pg_class c on c.oid=t.tgrelid
      join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public'
        and c.relname='ta_employee_requests_v61481'
        and t.tgname='trg_ta_guard_portal_dayoff_request_v61517'
        and not t.tgisinternal
    ) then 'PASS' else 'FAIL' end,
    'Portal day-off request ถูกตรวจจากระดับตาราง'

  union all

  select
    3,
    'manager_dayoff_review_rpc',
    case when to_regprocedure(
      'public.ta_get_employee_request_dayoff_review_v61517(uuid)'
    ) is not null then 'PASS' else 'FAIL' end,
    'มี RPC Preflight สำหรับ Manager Review'

  union all

  select
    4,
    'manager_review_execute_authenticated',
    case when has_function_privilege(
      'authenticated',
      'public.ta_get_employee_request_dayoff_review_v61517(uuid)',
      'EXECUTE'
    ) then 'PASS' else 'FAIL' end,
    'Manager/HR Admin เรียก Review RPC ได้'

  union all

  select
    5,
    'manager_review_not_anon',
    case when not has_function_privilege(
      'anon',
      'public.ta_get_employee_request_dayoff_review_v61517(uuid)',
      'EXECUTE'
    ) then 'PASS' else 'FAIL' end,
    'Employee Portal ไม่สามารถเรียก Manager Review RPC'

  union all

  select
    6,
    'guard_checks_future_date',
    case when pg_get_functiondef(
      to_regprocedure('public._ta_guard_portal_dayoff_request_v61517()')
    ) ilike '%DAYOFF_EMPLOYEE_PORTAL_FUTURE_ONLY%'
    then 'PASS' else 'FAIL' end,
    'Portal day-off request ย้อนหลัง/วันนี้ถูก block'

  union all

  select
    7,
    'guard_checks_system_period',
    case when pg_get_functiondef(
      to_regprocedure('public._ta_guard_portal_dayoff_request_v61517()')
    ) ilike '%DAYOFF_REQUEST_PERIOD_CLOSED%'
      and pg_get_functiondef(
        to_regprocedure('public._ta_guard_portal_dayoff_request_v61517()')
      ) ilike '%_ta_system_period_state_v6110%'
    then 'PASS' else 'FAIL' end,
    'Portal ตรวจรอบระบบก่อนสร้าง/แก้คำขอ'

  union all

  select
    8,
    'guard_checks_duplicate_conflict',
    case when pg_get_functiondef(
      to_regprocedure('public._ta_guard_portal_dayoff_request_v61517()')
    ) ilike '%_ta_portal_assert_request_no_conflict_v61494%'
    then 'PASS' else 'FAIL' end,
    'Portal ตรวจ duplicate/conflict จาก canonical helper'

  union all

  select
    9,
    'review_checks_current_state',
    case when pg_get_functiondef(
      to_regprocedure('public.ta_get_employee_request_dayoff_review_v61517(uuid)')
    ) ilike '%_ta_request_effective_shift_v61510%'
      and pg_get_functiondef(
        to_regprocedure('public.ta_get_employee_request_dayoff_review_v61517(uuid)')
      ) ilike '%requestable_for_this_request%'
    then 'PASS' else 'FAIL' end,
    'Manager Review ใช้กะ/โควต้าปัจจุบัน ไม่ใช้ Snapshot เก่าอย่างเดียว'

  union all

  select
    10,
    'review_keeps_atomic_apply_separate',
    case when pg_get_functiondef(
      to_regprocedure('public.ta_get_employee_request_dayoff_review_v61517(uuid)')
    ) not ilike '%ta_assign_shifts_bulk%'
      and pg_get_functiondef(
        to_regprocedure('public.ta_get_employee_request_dayoff_review_v61517(uuid)')
      ) not ilike '%update public.ta_employee_requests_v61481%'
    then 'PASS' else 'FAIL' end,
    '4B.2B เป็น Review/Preflight เท่านั้น ไม่เขียน Schedule หรือปิดคำขอ'

  union all

  select
    11,
    'guard_checks_shift_pair_availability',
    case when pg_get_functiondef(
      to_regprocedure('public._ta_guard_portal_dayoff_request_v61517()')
    ) ilike '%DAYOFF_PAIRED_SHIFT_NOT_FOUND%'
      and pg_get_functiondef(
        to_regprocedure('public._ta_guard_portal_dayoff_request_v61517()')
      ) ilike '%DAYOFF_SWAP_SOURCE_WORK_SHIFT_NOT_FOUND%'
    then 'PASS' else 'FAIL' end,
    'Portal ไม่รับคำขอที่ไม่มีคู่กะสำหรับคืนวันทำงาน/สร้างวันหยุด'
)
select *
from checks
order by seq;
