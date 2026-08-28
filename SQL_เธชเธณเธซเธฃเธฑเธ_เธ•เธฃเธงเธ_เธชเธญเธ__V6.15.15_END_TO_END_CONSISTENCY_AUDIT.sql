-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.15.15
-- 4B — End-to-End Manager -> Portal Consistency Audit
-- ============================================================================

with checks as (
  select
    1 as seq,
    'consistency_audit_table'::text as check_name,
    case
      when to_regclass(
        'public.ta_employee_request_consistency_v61515'
      ) is not null
      then 'PASS' else 'FAIL'
    end as result,
    'มีตาราง Audit แยกจาก Business Data'::text as detail

  union all

  select
    2,
    'consistency_checker_exists',
    case
      when to_regprocedure(
        'public._ta_check_employee_request_consistency_v61515(uuid)'
      ) is not null
      then 'PASS' else 'FAIL'
    end,
    'มี Canonical End-to-End Checker'

  union all

  select
    3,
    'resolved_guard_enabled',
    case
      when exists(
        select 1
        from pg_trigger t
        where t.tgname='trg_zzzz_ta_request_consistency_v61515'
          and t.tgenabled<>'D'
      )
      then 'PASS' else 'FAIL'
    end,
    'Request RESOLVED ต้องผ่าน Business Post-condition'

  union all

  select
    4,
    'time_certification_check',
    case
      when pg_get_functiondef(
        'public._ta_check_employee_request_consistency_v61515(uuid)'::regprocedure
      ) ilike '%TIME_CERTIFICATION_MATCH%'
      then 'PASS' else 'FAIL'
    end,
    'ตรวจ Time Certification'

  union all

  select
    5,
    'special_work_check',
    case
      when pg_get_functiondef(
        'public._ta_check_employee_request_consistency_v61515(uuid)'::regprocedure
      ) ilike '%SPECIAL_WORK_MATCH%'
       and pg_get_functiondef(
        'public._ta_check_employee_request_consistency_v61515(uuid)'::regprocedure
      ) ilike '%atomic_request_id%'
      then 'PASS' else 'FAIL'
    end,
    'ตรวจ Special Work + Atomic Request marker'

  union all

  select
    6,
    'dayoff_checks',
    case
      when pg_get_functiondef(
        'public._ta_check_employee_request_consistency_v61515(uuid)'::regprocedure
      ) ilike '%ADD_DAYOFF_MATCH%'
       and pg_get_functiondef(
        'public._ta_check_employee_request_consistency_v61515(uuid)'::regprocedure
      ) ilike '%SWAP_DAYOFF_MATCH%'
      then 'PASS' else 'FAIL'
    end,
    'ตรวจขอหยุดเพิ่มและสลับวันหยุด'

  union all

  select
    7,
    'leave_checks',
    case
      when pg_get_functiondef(
        'public._ta_check_employee_request_consistency_v61515(uuid)'::regprocedure
      ) ilike '%FULL_DAY_LEAVE_MATCH%'
       and pg_get_functiondef(
        'public._ta_check_employee_request_consistency_v61515(uuid)'::regprocedure
      ) ilike '%PARTIAL_LEAVE_OVERLAY_MATCH%'
      then 'PASS' else 'FAIL'
    end,
    'ตรวจลาเต็มวันและ Partial Leave Overlay'

  union all

  select
    8,
    'portal_sync_check',
    case
      when pg_get_functiondef(
        'public._ta_check_employee_request_consistency_v61515(uuid)'::regprocedure
      ) ilike '%PORTAL_SYNC_EVIDENCE_MATCH%'
       and pg_get_functiondef(
        'public._ta_check_employee_request_consistency_v61515(uuid)'::regprocedure
      ) ilike '%notification_exists%'
      then 'PASS' else 'FAIL'
    end,
    'ตรวจ Request/Data/Notification Revision'

  union all

  select
    9,
    'manager_recheck_rpc',
    case
      when to_regprocedure(
        'public.ta_recheck_employee_request_consistency_v61515(uuid)'
      ) is not null
       and has_function_privilege(
        'authenticated',
        'public.ta_recheck_employee_request_consistency_v61515(uuid)',
        'EXECUTE'
      )
      then 'PASS' else 'FAIL'
    end,
    'Manager สามารถตรวจซ้ำได้'

  union all

  select
    10,
    'manager_batch_reader',
    case
      when to_regprocedure(
        'public.ta_get_employee_request_consistency_v61515(uuid[])'
      ) is not null
      then 'PASS' else 'FAIL'
    end,
    'Manager UI โหลด Audit แบบ Batch'

  union all

  select
    11,
    'portal_batch_reader',
    case
      when to_regprocedure(
        'public.ta_portal_get_my_request_consistency_v61515(text,uuid[])'
      ) is not null
       and has_function_privilege(
        'anon',
        'public.ta_portal_get_my_request_consistency_v61515(text,uuid[])',
        'EXECUTE'
      )
      then 'PASS' else 'FAIL'
    end,
    'Employee Portal อ่านได้เฉพาะ Audit ของตน'

  union all

  select
    12,
    'audit_table_not_directly_exposed',
    case
      when not has_table_privilege(
        'anon',
        'public.ta_employee_request_consistency_v61515',
        'SELECT'
      )
       and not has_table_privilege(
        'authenticated',
        'public.ta_employee_request_consistency_v61515',
        'SELECT'
      )
      then 'PASS' else 'FAIL'
    end,
    'Client อ่าน Audit Table ตรง ๆ ไม่ได้'

  union all

  select
    13,
    'sync_consistency_convergence',
    case
      when exists(
        select 1
        from pg_trigger t
        where t.tgname='trg_zzzz_ta_request_consistency_sync_v61515'
          and t.tgenabled<>'D'
      )
       and to_regprocedure(
        'public._ta_request_consistency_on_sync_v61515()'
      ) is not null
      then 'PASS' else 'FAIL'
    end,
    'Notification/Request Sync จะ Recheck Audit ให้ WARN เปลี่ยนเป็น PASS อัตโนมัติ'


  union all

  select
    13,
    'sync_consistency_convergence',
    case
      when exists(
        select 1
        from pg_trigger t
        where t.tgname='trg_zzzz_ta_request_consistency_sync_v61515'
          and t.tgenabled<>'D'
      )
       and to_regprocedure(
        'public._ta_request_consistency_on_sync_v61515()'
      ) is not null
      then 'PASS' else 'FAIL'
    end,
    'Request/Notification Sync จะ Recheck WARN ให้กลายเป็น PASS อัตโนมัติ'

)
select *
from checks
order by seq;

select
  request_type,
  request_subtype,
  overall_status,
  count(*) as requests
from public.ta_employee_request_consistency_v61515
group by
  request_type,
  request_subtype,
  overall_status
order by
  request_type,
  request_subtype,
  overall_status;

select
  a.request_id,
  r.request_no,
  a.emp_code,
  a.request_type,
  a.request_subtype,
  a.overall_status,
  a.business_status,
  a.sync_status,
  a.result_code,
  a.summary,
  a.checked_at
from public.ta_employee_request_consistency_v61515 a
join public.ta_employee_requests_v61481 r
  on r.request_id=a.request_id
where a.overall_status<>'PASS'
order by a.checked_at desc
limit 100;
