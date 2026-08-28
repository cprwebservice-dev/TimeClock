-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- TimeClock Enterprise V6.15.18
-- 4B.2C — Day-off Request Atomic Approve + Schedule Apply Guard
-- ============================================================================

with checks as (
  select
    1 as seq,
    'review_v61518_exists'::text as check_name,
    case when to_regprocedure(
      'public.ta_get_employee_request_dayoff_review_v61518(uuid)'
    ) is not null then 'PASS' else 'FAIL' end as result,
    'Manager Review รุ่น V6.15.18 ต้องมีอยู่'::text as detail

  union all

  select
    2,
    'apply_v61518_exists',
    case when to_regprocedure(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'
    ) is not null then 'PASS' else 'FAIL' end,
    'Atomic Approve RPC ต้องมีอยู่'

  union all

  select
    3,
    'request_lock_and_month_lock',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%for update%'
      and pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%pg_advisory_xact_lock%'
      then 'PASS' else 'FAIL' end,
    'ล็อก Request และ employee/month ก่อน Apply'

  union all

  select
    4,
    'fresh_review_before_write',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%ta_get_employee_request_dayoff_review_v61518%'
      and pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%DAYOFF_REQUEST_PREFLIGHT_BLOCKED%'
      then 'PASS' else 'FAIL' end,
    'ตรวจ Review ล่าสุดใน Transaction ก่อนเขียน Schedule'

  union all

  select
    5,
    'work_pattern_5d_6d_guard',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%_ta_validate_shift_pattern_v651%'
      and pg_get_functiondef(
      'public.ta_get_employee_request_dayoff_review_v61518(uuid)'::regprocedure
    ) ilike '%DAYOFF_WORK_PATTERN_BLOCKED%'
      then 'PASS' else 'FAIL' end,
    'ตรวจ 5D/6D ทั้ง Review และ Apply'

  union all

  select
    6,
    'system_period_guard',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%_ta_assert_system_period_action_v6110%'
      then 'PASS' else 'FAIL' end,
    'รอบระบบต้องเปิดก่อนแก้ Schedule'

  union all

  select
    7,
    'minimum_rest_6h_guard',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%ta_validate_schedule_guard_v6141%'
      and pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%DAYOFF_REQUEST_MINIMUM_REST_BLOCKED%'
      then 'PASS' else 'FAIL' end,
    'พักขั้นต่ำ 6 ชั่วโมงเป็น Hard Block'

  union all

  select
    8,
    'continuous_48h_confirmation',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%requires_48h_confirmation%'
      and pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%p_acknowledge_48h%'
      then 'PASS' else 'FAIL' end,
    'เกิน 48 ชม. ต้อง Manager ยืนยันซ้ำ'

  union all

  select
    9,
    'dayoff_quota_whole_payload',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%ta_validate_dayoff_quota_bulk_v6143%'
      then 'PASS' else 'FAIL' end,
    'ตรวจ Day-off Quota จาก Proposed Rows ทั้งชุด'

  union all

  select
    10,
    'night_sequence_whole_payload',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%ta_validate_night_sequence_bulk_v61437%'
      then 'PASS' else 'FAIL' end,
    'ตรวจ Night Sequence จาก Projected Final State ทั้งชุด'

  union all

  select
    11,
    'canonical_atomic_writer_retained',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%ta_apply_employee_request_v61510%'
      then 'PASS' else 'FAIL' end,
    'เขียนจริงผ่าน V6.15.10 Atomic Writer เดิม'

  union all

  select
    12,
    'final_state_verification',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%DAYOFF_REQUEST_FINAL_STATE_MISMATCH_SOURCE%'
      and pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%DAYOFF_REQUEST_FINAL_STATE_MISMATCH_TARGET%'
      and pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%DAYOFF_REQUEST_FINAL_STATUS_MISMATCH%'
      then 'PASS' else 'FAIL' end,
    'หลังเขียนต้องตรวจ Source/Target/Request Status ก่อน Commit'

  union all

  select
    13,
    'manager_apply_audit',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%MANAGER_DAYOFF_APPLIED_V61518%'
      and pg_get_functiondef(
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)'::regprocedure
    ) ilike '%apply_snapshot%'
      then 'PASS' else 'FAIL' end,
    'เก็บ Change/Audit snapshot ลง Portal Audit ใน Transaction เดียวกัน'

  union all

  select
    14,
    'request_resolve_after_business_action',
    case when pg_get_functiondef(
      'public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure
    ) ilike '%status=''RESOLVED''%'
      and pg_get_functiondef(
      'public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure
    ) ilike '%REQUEST_NOT_ACTIVE_AFTER_APPLY%'
      then 'PASS' else 'FAIL' end,
    'Canonical Request Status ยังปิดหลัง Business Action สำเร็จเท่านั้น'

  union all

  select
    15,
    'authenticated_execute',
    case when has_function_privilege(
      'authenticated',
      'public.ta_get_employee_request_dayoff_review_v61518(uuid)',
      'EXECUTE'
    )
      and has_function_privilege(
      'authenticated',
      'public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)',
      'EXECUTE'
    )
      then 'PASS' else 'FAIL' end,
    'Manager Web เรียก Review และ Apply ได้'
)
select *
from checks
order by seq;
