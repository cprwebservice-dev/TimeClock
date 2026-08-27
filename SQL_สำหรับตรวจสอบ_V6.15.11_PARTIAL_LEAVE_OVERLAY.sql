-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.15.11
-- Partial Leave Schedule Overlay
-- ============================================================================
-- READ ONLY: ไม่มี INSERT / UPDATE / DELETE / CREATE / DROP
-- ============================================================================

-- 1) Static installation checks
with checks as (
  select 1 as seq,'overlay_table'::text as check_name,
    case when to_regclass('public.ta_portal_partial_leave_overlays_v61511') is not null then 'PASS' else 'FAIL' end as result,
    'ต้องมีตาราง Schedule-only Partial Leave Overlay'::text as detail

  union all
  select 2,'active_overlay_unique_index',
    case when exists(
      select 1 from pg_indexes
      where schemaname='public'
        and indexname='uq_ta_partial_leave_active_emp_date_v61511'
    ) then 'PASS' else 'FAIL' end,
    'พนักงาน 1 คน / 1 Work Date มี Active Partial Overlay ได้ 1 รายการ'

  union all
  select 3,'shared_window_resolver',
    case when to_regprocedure('public._ta_partial_leave_window_v61511(text,date,text,time without time zone,time without time zone)') is not null
      then 'PASS' else 'FAIL' end,
    'Portal Submit และ Manager Approve ต้องใช้ Resolver เดียวกัน'

  union all
  select 4,'portal_validator_uses_v61511',
    case when to_regprocedure('public._ta_validate_employee_portal_leave_v61508()') is not null
      and pg_get_functiondef('public._ta_validate_employee_portal_leave_v61508()'::regprocedure)
          ilike '%_ta_partial_leave_window_v61511%'
      and pg_get_functiondef('public._ta_validate_employee_portal_leave_v61508()'::regprocedure)
          ilike '%_ta_bangkok_today_v6110%'
      then 'PASS' else 'FAIL' end,
    'Submit ตรวจช่วงลาแบบ Shift-aware / Bangkok date'

  union all
  select 5,'atomic_partial_apply',
    case when to_regprocedure('public.ta_apply_employee_request_v61510(uuid,jsonb,text)') is not null
      and pg_get_functiondef('public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure)
          ilike '%ta_portal_partial_leave_overlays_v61511%'
      and pg_get_functiondef('public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure)
          ilike '%_ta_assert_system_period_action_v6110%'
      and pg_get_functiondef('public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure)
          ilike '%ta_finalize_schedule_mutation_v61415%'
      then 'PASS' else 'FAIL' end,
    'Approve ต้อง Overlay + System Period + Attendance Finalizer ใน RPC เดียว'

  union all
  select 6,'no_partial_to_full_lv',
    case when pg_get_functiondef('public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure)
          not ilike '%PARTIAL_LEAVE_REQUIRES_V6.15.11%'
      and pg_get_functiondef('public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure)
          ilike '%shift_calendar_changed%false%'
      then 'PASS' else 'FAIL' end,
    'PARTIAL_DAY ต้องไม่ถูกเปลี่ยนเป็น LV เต็มวัน'

  union all
  select 7,'attendance_overlay_trigger',
    case when exists(
      select 1
      from pg_trigger t
      where t.tgrelid='public.ta_attendance_calculations'::regclass
        and t.tgname='trg_zzzz_ta_calc_partial_leave_v61511'
        and not t.tgisinternal
        and t.tgenabled in ('O','A')
    ) then 'PASS' else 'FAIL' end,
    'Central calculation trigger ต้องเปิดใช้งาน'

  union all
  select 8,'attendance_overlay_policy',
    case when to_regprocedure('public._ta_apply_portal_partial_leave_calc_v61511()') is not null
      and pg_get_functiondef('public._ta_apply_portal_partial_leave_calc_v61511()'::regprocedure)
          ilike '%leave_request_id is not null%'
      and pg_get_functiondef('public._ta_apply_portal_partial_leave_calc_v61511()'::regprocedure)
          ilike '%v_complete%'
      and pg_get_functiondef('public._ta_apply_portal_partial_leave_calc_v61511()'::regprocedure)
          ilike '%v_effective_start%'
      and pg_get_functiondef('public._ta_apply_portal_partial_leave_calc_v61511()'::regprocedure)
          ilike '%v_effective_end%'
      then 'PASS' else 'FAIL' end,
    'Official leave remains authority; incomplete Punch ยังไม่ถูกล้างขาดงาน; boundary late/early ใช้ Overlay'

  union all
  select 9,'portal_overlay_reader',
    case when to_regprocedure('public.ta_portal_get_my_partial_leave_overlays_v61511(text,date,date)') is not null
      then 'PASS' else 'FAIL' end,
    'Employee Portal ต้องมี Read-only Overlay RPC'

  union all
  select 10,'portal_reader_execute',
    case when has_function_privilege('anon','public.ta_portal_get_my_partial_leave_overlays_v61511(text,date,date)','EXECUTE')
       and has_function_privilege('authenticated','public.ta_portal_get_my_partial_leave_overlays_v61511(text,date,date)','EXECUTE')
      then 'PASS' else 'FAIL' end,
    'Portal Session ใช้งานได้ทั้ง anon/authenticated'

  union all
  select 11,'overlay_table_not_directly_exposed',
    case when not has_table_privilege('anon','public.ta_portal_partial_leave_overlays_v61511','SELECT')
       and not has_table_privilege('authenticated','public.ta_portal_partial_leave_overlays_v61511','SELECT')
      then 'PASS' else 'FAIL' end,
    'ตาราง Overlay ต้องอ่านผ่าน RPC เท่านั้น'

  union all
  select 12,'atomic_version_v61511',
    case when pg_get_functiondef('public.ta_apply_employee_request_v61510(uuid,jsonb,text)'::regprocedure)
          ilike '%V6.15.11%'
      then 'PASS' else 'FAIL' end,
    'Atomic workflow ต้องเป็นรุ่น V6.15.11'
)
select seq,check_name,result,detail
from checks
order by seq;

-- 2) Trigger order / state
-- Expected: work-mode metrics -> absence policy -> partial leave overlay
select
  t.tgname as trigger_name,
  case t.tgenabled when 'O' then 'ENABLED' when 'A' then 'ALWAYS' else t.tgenabled::text end as state,
  p.proname as function_name
from pg_trigger t
join pg_proc p on p.oid=t.tgfoid
where t.tgrelid='public.ta_attendance_calculations'::regclass
  and not t.tgisinternal
  and (
    t.tgname like 'trg_zy%'
    or t.tgname like 'trg_zz%'
  )
order by t.tgname;

-- 3) Current active Partial Leave overlays + stale state
select
  o.overlay_id,
  o.employee_request_id,
  r.request_no,
  o.emp_code,
  o.work_date,
  o.leave_type_code,
  o.leave_type_label,
  o.leave_start_at,
  o.leave_end_at,
  o.leave_minutes,
  o.shift_code_snapshot,
  o.shift_start_at_snapshot,
  o.shift_end_at_snapshot,
  e.shift_code as current_shift_code,
  e.shift_start_time as current_shift_start,
  e.shift_end_time as current_shift_end,
  case
    when e.shift_code is null or e.shift_start_time is null or e.shift_end_time is null then 'STALE'
    when upper(trim(e.shift_code))<>upper(trim(o.shift_code_snapshot)) then 'STALE'
    when (o.work_date+e.shift_start_time)::timestamp<>o.shift_start_at_snapshot then 'STALE'
    when ((o.work_date+e.shift_end_time)::timestamp
          + case when e.shift_end_time<=e.shift_start_time then interval '1 day' else interval '0 day' end)
         <>o.shift_end_at_snapshot then 'STALE'
    else 'ACTIVE_MATCH'
  end as overlay_state
from public.ta_portal_partial_leave_overlays_v61511 o
join public.ta_employee_requests_v61481 r
  on r.request_id=o.employee_request_id
left join lateral public._ta_request_effective_shift_v61510(o.emp_code,o.work_date) e on true
where o.is_active=true
order by o.work_date desc,o.emp_code
limit 100;

-- 4) Attendance rows affected by V6.15.11 overlay
select
  c.emp_code,
  c.work_date,
  c.calculation_status,
  c.late_minutes,
  c.early_leave_minutes,
  c.absence_minutes,
  c.raw_meta->>'portal_partial_leave_active' as partial_leave_active,
  c.raw_meta->>'portal_partial_leave_stale' as partial_leave_stale,
  c.raw_meta->>'portal_partial_leave_start_at' as partial_leave_start_at,
  c.raw_meta->>'portal_partial_leave_end_at' as partial_leave_end_at,
  c.raw_meta->>'portal_partial_leave_minutes' as partial_leave_minutes,
  c.raw_meta->>'portal_partial_leave_late_anchor_at' as adjusted_late_anchor,
  c.raw_meta->>'portal_partial_leave_early_anchor_at' as adjusted_early_anchor,
  c.raw_meta->>'portal_partial_leave_version' as partial_leave_version
from public.ta_attendance_calculations c
where c.raw_meta->>'portal_partial_leave_version'='V6.15.11'
order by c.work_date desc,c.emp_code
limit 100;

-- 5) Data integrity summary
select
  count(*) filter(where o.is_active) as active_overlays,
  count(*) filter(where o.is_active and o.leave_end_at<=o.leave_start_at) as invalid_windows,
  count(*) filter(where o.is_active and o.leave_minutes<=0) as invalid_minutes,
  count(*) filter(where o.is_active and o.leave_type_code not in ('PERSONAL','VACATION')) as invalid_types,
  count(*) filter(where o.is_active and r.status<>'RESOLVED') as overlay_request_not_resolved,
  case
    when count(*) filter(where o.is_active and (
      o.leave_end_at<=o.leave_start_at
      or o.leave_minutes<=0
      or o.leave_type_code not in ('PERSONAL','VACATION')
      or r.status<>'RESOLVED'
    ))=0 then 'PASS'
    else 'CHECK'
  end as overall_result
from public.ta_portal_partial_leave_overlays_v61511 o
join public.ta_employee_requests_v61481 r
  on r.request_id=o.employee_request_id;
