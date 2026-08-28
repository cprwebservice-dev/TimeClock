-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.15.20
-- 4C.1 + 4C.2 — Employee Leave Request Preview + Manager Review
-- ============================================================================

with checks as (
  select 1 seq,'portal_leave_preview_rpc' check_name,
    case when to_regprocedure('public.ta_portal_preview_leave_request_v61520(text,date,text,text,date,time,time,uuid)') is not null then 'PASS' else 'FAIL' end result,
    'Employee Portal มี Backend Preview ก่อนส่งคำขอ' detail

  union all
  select 2,'manager_leave_review_rpc',
    case when to_regprocedure('public.ta_get_employee_request_leave_review_v61520(uuid)') is not null then 'PASS' else 'FAIL' end,
    'Manager มี Read-only Review จาก Backend ล่าสุด'

  union all
  select 3,'leave_validator_v61520_full_day_skip',
    case when pg_get_functiondef('public._ta_validate_employee_portal_leave_v61508()'::regprocedure)
      ilike '%skipped_nonworkdays%'
      and pg_get_functiondef('public._ta_validate_employee_portal_leave_v61508()'::regprocedure)
      ilike '%affected_work_dates%'
      then 'PASS' else 'FAIL' end,
    'ลาเต็มวันสามารถคร่อม OFF/PH และเก็บเฉพาะวันทำงานที่ต้องปรับกะ'

  union all
  select 4,'leave_validator_requires_workday',
    case when pg_get_functiondef('public._ta_validate_employee_portal_leave_v61508()'::regprocedure)
      ilike '%LEAVE_RANGE_NO_WORKDAY%'
      then 'PASS' else 'FAIL' end,
    'ช่วงลาเต็มวันต้องมีวันทำงานอย่างน้อย 1 วัน'

  union all
  select 5,'leave_period_guard_on_submit',
    case when pg_get_functiondef('public._ta_validate_employee_portal_leave_v61508()'::regprocedure)
      ilike '%_ta_system_period_state_v6110%'
      and pg_get_functiondef('public._ta_validate_employee_portal_leave_v61508()'::regprocedure)
      ilike '%LEAVE_SYSTEM_PERIOD_SCHEDULE_CLOSED%'
      then 'PASS' else 'FAIL' end,
    'Employee Portal ไม่สามารถส่งคำขอเพื่อแก้ Schedule ในรอบที่ปิดแล้ว'

  union all
  select 6,'partial_leave_shift_aware_retained',
    case when pg_get_functiondef('public._ta_validate_employee_portal_leave_v61508()'::regprocedure)
      ilike '%_ta_partial_leave_window_v61511%'
      and pg_get_functiondef('public._ta_validate_employee_portal_leave_v61508()'::regprocedure)
      ilike '%PRIMARY_SHIFT%'
      then 'PASS' else 'FAIL' end,
    'ลาบางส่วนยังใช้ Shift-aware Overlay V6.15.11'

  union all
  select 7,'ordination_service_guard_retained',
    case when pg_get_functiondef('public._ta_validate_employee_portal_leave_v61508()'::regprocedure)
      ilike '%ORDINATION_MIN_SERVICE_1_YEAR%'
      then 'PASS' else 'FAIL' end,
    'ลาอุปสมบทยังคงตรวจอายุงาน 1 ปี'

  union all
  select 8,'portal_preview_conflict_guard',
    case when pg_get_functiondef('public.ta_portal_preview_leave_request_v61520(text,date,text,text,date,time,time,uuid)'::regprocedure)
      ilike '%_ta_portal_assert_request_no_conflict_v61494%'
      then 'PASS' else 'FAIL' end,
    'Preview ตรวจคำขอซ้ำ/ทับซ้อนจาก Backend'

  union all
  select 9,'portal_preview_period_guard',
    case when pg_get_functiondef('public.ta_portal_preview_leave_request_v61520(text,date,text,text,date,time,time,uuid)'::regprocedure)
      ilike '%_ta_system_period_state_v6110%'
      then 'PASS' else 'FAIL' end,
    'Preview ตรวจ System Period รายวัน'

  union all
  select 10,'manager_review_current_schedule',
    case when pg_get_functiondef('public.ta_get_employee_request_leave_review_v61520(uuid)'::regprocedure)
      ilike '%_ta_request_effective_shift_v61510%'
      then 'PASS' else 'FAIL' end,
    'Manager Review อ่านกะจริงล่าสุด ไม่ยึด Snapshot เก่า'

  union all
  select 11,'manager_review_period_and_conflict',
    case when pg_get_functiondef('public.ta_get_employee_request_leave_review_v61520(uuid)'::regprocedure)
      ilike '%_ta_system_period_state_v6110%'
      and pg_get_functiondef('public.ta_get_employee_request_leave_review_v61520(uuid)'::regprocedure)
      ilike '%_ta_portal_assert_request_no_conflict_v61494%'
      then 'PASS' else 'FAIL' end,
    'Manager Review ตรวจรอบระบบและ Conflict ซ้ำ'

  union all
  select 12,'manager_review_night_sequence',
    case when pg_get_functiondef('public.ta_get_employee_request_leave_review_v61520(uuid)'::regprocedure)
      ilike '%ta_validate_night_sequence_bulk_v61437%'
      then 'PASS' else 'FAIL' end,
    'ลาเต็มวัน Preview Projected Final State กับ Night Sequence'

  union all
  select 13,'official_leave_boundary',
    case when pg_get_functiondef('public.ta_portal_preview_leave_request_v61520(text,date,text,text,date,time,time,uuid)'::regprocedure)
      ilike '%HR Connect%'
      and pg_get_functiondef('public.ta_get_employee_request_leave_review_v61520(uuid)'::regprocedure)
      ilike '%HR Connect%'
      then 'PASS' else 'FAIL' end,
    'TimeAttendance เป็น Schedule Notice; HR Connect ยังเป็นระบบลาอย่างเป็นทางการ'

  union all
  select 14,'leave_return_supported',
    case when pg_get_functiondef('public.ta_return_employee_request_v61519(uuid,text)'::regprocedure)
      ilike '%DAYOFF_SWAP%LEAVE_REQUEST%'
      and pg_get_functiondef('public.ta_return_employee_request_v61519(uuid,text)'::regprocedure)
      ilike '%MANAGER_REQUEST_RETURNED_V61520%'
      then 'PASS' else 'FAIL' end,
    'Manager ส่งคำขอลากลับ Employee Portal เพื่อแก้ไขได้'

  union all
  select 15,'portal_preview_execute',
    case when has_function_privilege('anon','public.ta_portal_preview_leave_request_v61520(text,date,text,text,date,time,time,uuid)','EXECUTE')
      and has_function_privilege('authenticated','public.ta_portal_preview_leave_request_v61520(text,date,text,text,date,time,time,uuid)','EXECUTE')
      then 'PASS' else 'FAIL' end,
    'Employee Portal เรียก Preview ได้'

  union all
  select 16,'manager_review_execute',
    case when has_function_privilege('authenticated','public.ta_get_employee_request_leave_review_v61520(uuid)','EXECUTE')
      and has_function_privilege('authenticated','public.ta_return_employee_request_v61519(uuid,text)','EXECUTE')
      then 'PASS' else 'FAIL' end,
    'Manager Web เรียก Review และ Return ได้'

  union all
  select 17,'leave_validation_trigger_enabled',
    case when exists(
      select 1 from pg_trigger
      where tgrelid='public.ta_employee_requests_v61481'::regclass
        and tgname='trg_aa_ta_employee_request_leave_v61508'
        and tgenabled<>'D'
        and not tgisinternal
    ) then 'PASS' else 'FAIL' end,
    'Trigger Leave Policy เดิมยังชี้ Function ที่อัปเกรดเป็น V6.15.20'
)
select * from checks order by seq;
