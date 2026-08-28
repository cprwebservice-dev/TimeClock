-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.15.21
-- 4C.3 — Affected-date Atomic Leave Apply + Rollback + Final Verification
-- ============================================================================

with checks as (
  select 1 seq,'leave_review_v61521_exists' check_name,
    case when to_regprocedure('public.ta_get_employee_request_leave_review_v61521(uuid)') is not null then 'PASS' else 'FAIL' end result,
    'Manager Review endpoint สำหรับ 4C.3' detail

  union all
  select 2,'leave_atomic_apply_v61521_exists',
    case when to_regprocedure('public.ta_apply_employee_request_leave_v61521(uuid,text)') is not null then 'PASS' else 'FAIL' end,
    'Atomic Leave Apply endpoint'

  union all
  select 3,'review_wraps_v61520_policy',
    case when pg_get_functiondef('public.ta_get_employee_request_leave_review_v61521(uuid)'::regprocedure)
      ilike '%ta_get_employee_request_leave_review_v61520%'
      and pg_get_functiondef('public.ta_get_employee_request_leave_review_v61521(uuid)'::regprocedure)
      ilike '%AFFECTED_WORK_DATES_ATOMIC%'
      then 'PASS' else 'FAIL' end,
    '4C.1/4C.2 Review policy เดิมยังเป็น Source of Truth'

  union all
  select 4,'resolved_consistency_trigger_enabled',
    case when exists(
      select 1 from pg_trigger t
      where t.tgrelid='public.ta_employee_requests_v61481'::regclass
        and t.tgname='trg_zzzz_ta_request_consistency_v61515'
        and not t.tgisinternal
        and t.tgenabled<>'D'
    ) then 'PASS' else 'FAIL' end,
    'V6.15.15 RESOLVED post-condition guard ยังทำงาน'

  union all
  select 5,'consistency_checker_affected_date_aware',
    case when pg_get_functiondef('public._ta_check_employee_request_consistency_v61515(uuid)'::regprocedure)
      ilike '%applied_affected_work_dates%'
      and pg_get_functiondef('public._ta_check_employee_request_consistency_v61515(uuid)'::regprocedure)
      ilike '%FULL_DAY_AFFECTED_DATES%'
      then 'PASS' else 'FAIL' end,
    'Consistency Guard ตรวจเฉพาะวันทำงานที่ถูก Apply'

  union all
  select 6,'consistency_checker_preserves_skipped_nonworkdays',
    case when pg_get_functiondef('public._ta_check_employee_request_consistency_v61515(uuid)'::regprocedure)
      ilike '%applied_skipped_nonworkdays%'
      and pg_get_functiondef('public._ta_check_employee_request_consistency_v61515(uuid)'::regprocedure)
      ilike '%_ta_employee_portal_leave_day_state_v61508%'
      then 'PASS' else 'FAIL' end,
    'OFF / PH / ลาเดิมต้องยังเป็น Non-workday'

  union all
  select 7,'request_and_employee_lock',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%for update%'
      and pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%employee-leave-approve:%'
      then 'PASS' else 'FAIL' end,
    'Lock Request + serialize การอนุมัติของพนักงานเดียวกัน'

  union all
  select 8,'fresh_review_after_lock',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%ta_get_employee_request_leave_review_v61521%'
      and pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%LEAVE_REQUEST_REVIEW_BLOCKED%'
      then 'PASS' else 'FAIL' end,
    'Recheck Backend หลัง Lock ก่อนเขียนจริง'

  union all
  select 9,'full_day_filters_set_lv_only',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%action%SET_LV%'
      and pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%v_skipped%'
      then 'PASS' else 'FAIL' end,
    'FULL_DAY สร้าง payload จาก SET_LV เท่านั้น'

  union all
  select 10,'system_period_guard',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%_ta_assert_system_period_action_v6110%SCHEDULE_EDIT%'
      then 'PASS' else 'FAIL' end,
    'ตรวจ System Period ทุกวันทำงานที่แก้'

  union all
  select 11,'work_pattern_guard',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%_ta_validate_shift_pattern_v651%'
      then 'PASS' else 'FAIL' end,
    'LV ผ่าน Work Pattern validation ก่อนเขียน'

  union all
  select 12,'night_sequence_whole_payload',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%ta_validate_night_sequence_bulk_v61437%'
      then 'PASS' else 'FAIL' end,
    'ตรวจ Night Sequence จาก Projected Final State'

  union all
  select 13,'canonical_bulk_writer',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%ta_assign_shifts_bulk_v61424%'
      then 'PASS' else 'FAIL' end,
    'เขียน Schedule ผ่าน canonical guarded Bulk Writer'

  union all
  select 14,'rule_sync_and_finalizer',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%ta_sync_bulk_schedule_rules_v6135%'
      and pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%ta_finalize_schedule_mutation_v61415%'
      then 'PASS' else 'FAIL' end,
    'Smart Rule sync + certification-aware Attendance finalizer'

  union all
  select 15,'affected_final_state_verification',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%LEAVE_FINAL_STATE_MISMATCH_AFFECTED%'
      then 'PASS' else 'FAIL' end,
    'ทุกวันที่แก้ต้องจบเป็น LV/LEAVE ก่อน Commit'

  union all
  select 16,'skipped_final_state_verification',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%LEAVE_FINAL_STATE_MISMATCH_SKIPPED_BECAME_WORKDAY%'
      and pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%LEAVE_FINAL_STATE_MISMATCH_SKIPPED_SHIFT%'
      then 'PASS' else 'FAIL' end,
    'วันที่ Skip ต้องไม่ถูกเปลี่ยนโดย Transaction'

  union all
  select 17,'partial_leave_canonical_overlay_retained',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%ta_apply_employee_request_v61510%'
      and pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%PARTIAL_LEAVE_FINAL_OVERLAY_MISSING%'
      and pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%PARTIAL_LEAVE_FINAL_SHIFT_CHANGED%'
      then 'PASS' else 'FAIL' end,
    'PARTIAL_DAY ใช้ V6.15.11 Overlay และตรวจว่ากะเดิมไม่เปลี่ยน'

  union all
  select 18,'apply_snapshot_before_resolve',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%applied_affected_work_dates%'
      and pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%leave_apply_version%V6.15.21%'
      then 'PASS' else 'FAIL' end,
    'บันทึก Affected/Skipped snapshot ให้ Consistency Trigger ตรวจทันที'

  union all
  select 19,'manager_leave_audit',
    case when pg_get_functiondef('public.ta_apply_employee_request_leave_v61521(uuid,text)'::regprocedure)
      ilike '%MANAGER_LEAVE_APPLIED_V61521%'
      then 'PASS' else 'FAIL' end,
    'เก็บ Manager Leave apply snapshot ใน Portal Audit'

  union all
  select 20,'authenticated_execute',
    case when has_function_privilege('authenticated','public.ta_get_employee_request_leave_review_v61521(uuid)','EXECUTE')
      and has_function_privilege('authenticated','public.ta_apply_employee_request_leave_v61521(uuid,text)','EXECUTE')
      then 'PASS' else 'FAIL' end,
    'Manager Web เรียก Review + Apply ได้'
)
select seq,check_name,result,detail
from checks
order by seq;
