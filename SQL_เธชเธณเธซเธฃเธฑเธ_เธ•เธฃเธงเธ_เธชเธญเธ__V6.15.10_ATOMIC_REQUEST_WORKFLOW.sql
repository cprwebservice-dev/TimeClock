-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.15.10
-- ============================================================================

with checks as (
  select
    1 as seq,
    'atomic_rpc_exists'::text as check_name,
    case when to_regprocedure(
      'public.ta_apply_employee_request_v61510(uuid,jsonb,text)'
    ) is not null then 'PASS' else 'FAIL' end as result,
    'ต้องพบ Atomic Apply + Resolve RPC'::text as detail

  union all

  select
    2,
    'current_manager_authority_retained',
    case when to_regprocedure(
      'public._ta_request_manager_authorized_v61481(uuid)'
    ) is not null
     and pg_get_functiondef(
       'public._ta_request_manager_authorized_v61481(uuid)'::regprocedure
     ) ilike '%ta_get_schedule_manager_map_v61124%'
      then 'PASS' else 'FAIL' end,
    'Manager authorization ต้องอิง Canonical Manager Mapping ปัจจุบัน (V6.14.90)'

  union all

  select
    3,
    'time_certification_atomic',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure
    ) ilike '%ta_save_time_certification_v61139%'
      then 'PASS' else 'FAIL' end,
    'TIME_ISSUE ใช้ Time Certification canonical writer'

  union all

  select
    4,
    'special_work_guard',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure
    ) ilike '%ta_validate_schedule_guard_v6141%'
      then 'PASS' else 'FAIL' end,
    'SPECIAL_WORK ตรวจ 6h/48h ผ่าน canonical guard'

  union all

  select
    5,
    'special_work_schedule_writer',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure
    ) ilike '%ta_assign_shift_with_work_plan_v6144%'
      then 'PASS' else 'FAIL' end,
    'SPECIAL_WORK บันทึก Shift + Work Plan ผ่าน canonical writer'

  union all

  select
    6,
    'special_work_extension_and_finalizer',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure
    ) ilike '%ta_upsert_schedule_rule_assignment_v6120%'
     and pg_get_functiondef(
       'public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure
     ) ilike '%ta_finalize_schedule_mutation_v61415%'
      then 'PASS' else 'FAIL' end,
    'Scheduling Rule ต้องบันทึกก่อน Final certification-aware refresh'

  union all

  select
    7,
    'dayoff_whole_payload_atomic',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure
    ) ilike '%ta_assign_shifts_bulk_v61424%'
     and pg_get_functiondef(
       'public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure
     ) ilike '%ta_sync_bulk_schedule_rules_v6135%'
      then 'PASS' else 'FAIL' end,
    'SWAP/ADD ใช้ Bulk payload เดียว + Smart OFF sync'

  union all

  select
    8,
    'partial_leave_protected',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure
    ) ilike '%PARTIAL_LEAVE_REQUIRES_V6.15.11%'
      then 'PASS' else 'FAIL' end,
    'PARTIAL_DAY ต้องไม่ถูกเปลี่ยนเป็น LV เต็มวันใน V6.15.10'

  union all

  select
    9,
    'resolve_after_business_action',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure
    ) ilike '%REQUEST_NOT_ACTIVE_AFTER_APPLY%'
     and pg_get_functiondef(
       'public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure
     ) ilike '%status=''RESOLVED''%'
      then 'PASS' else 'FAIL' end,
    'Request จะ RESOLVED หลัง Business Action สำเร็จเท่านั้น'

  union all

  select
    10,
    'authenticated_execute',
    case when has_function_privilege(
      'authenticated',
      'public.ta_apply_employee_request_v61510(uuid,jsonb,text)',
      'EXECUTE'
    ) then 'PASS' else 'FAIL' end,
    'Manager Web เรียก RPC ได้'
)
select * from checks order by seq;

-- ดูจำนวนคำขอ Active ปัจจุบัน แยกประเภท (ไม่แก้ข้อมูล)
select
  request_type,
  request_subtype,
  status,
  count(*) as rows
from public.ta_employee_requests_v61481
where status in ('PENDING','IN_REVIEW')
group by request_type,request_subtype,status
order by request_type,request_subtype,status;

-- ตรวจว่ามีคำขอ Partial Leave ค้างหรือไม่ เพื่อส่งต่อ V6.15.11
select
  request_id,
  request_no,
  emp_code,
  work_date,
  detail->>'end_date' as end_date,
  detail->>'leave_type' as leave_type,
  detail->>'leave_start_time' as leave_start_time,
  detail->>'leave_end_time' as leave_end_time,
  status
from public.ta_employee_requests_v61481
where request_type='LEAVE_REQUEST'
  and request_subtype='PARTIAL_DAY'
  and status in ('PENDING','IN_REVIEW')
order by requested_at;
