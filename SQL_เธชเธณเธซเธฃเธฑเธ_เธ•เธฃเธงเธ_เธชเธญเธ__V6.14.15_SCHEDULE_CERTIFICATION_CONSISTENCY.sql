-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.15
-- ============================================================================

with checks as (
  select 1 as seq,
    'attendance_consistency_refresh'::text as check_name,
    case when to_regprocedure(
      'public.ta_refresh_attendance_consistency_v61415(date,date,text[])'
    ) is not null then 'PASS' else 'FAIL' end as result,
    'Canonical certification-aware Attendance refresh exists'::text as detail

  union all
  select 2,'refresh_is_certification_aware',
    case when to_regprocedure(
      'public.ta_refresh_attendance_consistency_v61415(date,date,text[])'
    ) is not null
    and pg_get_functiondef(
      'public.ta_refresh_attendance_consistency_v61415(date,date,text[])'::regprocedure
    ) ilike '%_ta_refresh_attendance_with_certification_v61139%'
      then 'PASS' else 'FAIL' end,
    'Refresh uses timed-certification overlay instead of legacy calculation only'

  union all
  select 3,'schedule_finalizer',
    case when to_regprocedure(
      'public.ta_finalize_schedule_mutation_v61415(jsonb)'
    ) is not null then 'PASS' else 'FAIL' end,
    'Post-rule schedule finalizer exists'

  union all
  select 4,'finalizer_uses_canonical_refresh',
    case when to_regprocedure(
      'public.ta_finalize_schedule_mutation_v61415(jsonb)'
    ) is not null
    and pg_get_functiondef(
      'public.ta_finalize_schedule_mutation_v61415(jsonb)'::regprocedure
    ) ilike '%ta_refresh_attendance_consistency_v61415%'
      then 'PASS' else 'FAIL' end,
    'Finalizer recalculates after final Scheduling Rule state'

  union all
  select 5,'shift_request_consistent_rpc',
    case when to_regprocedure(
      'public.ta_decide_shift_change_request_v61415(uuid,text,text,boolean)'
    ) is not null then 'PASS' else 'FAIL' end,
    'New shift-request approval RPC exists'

  union all
  select 6,'request_uses_current_dayoff_guard',
    case when to_regprocedure(
      'public.ta_decide_shift_change_request_v61415(uuid,text,text,boolean)'
    ) is not null
    and pg_get_functiondef(
      'public.ta_decide_shift_change_request_v61415(uuid,text,text,boolean)'::regprocedure
    ) ilike '%ta_assign_shift_single_v6143%'
      then 'PASS' else 'FAIL' end,
    'Request approval uses the same V6.14.3 day-off guarded writer'

  union all
  select 7,'request_uses_6h_48h_guard',
    case when to_regprocedure(
      'public.ta_decide_shift_change_request_v61415(uuid,text,text,boolean)'
    ) is not null
    and pg_get_functiondef(
      'public.ta_decide_shift_change_request_v61415(uuid,text,text,boolean)'::regprocedure
    ) ilike '%ta_validate_schedule_guard_v6141%'
    and pg_get_functiondef(
      'public.ta_decide_shift_change_request_v61415(uuid,text,text,boolean)'::regprocedure
    ) ilike '%requires_48h_confirmation%'
      then 'PASS' else 'FAIL' end,
    'Request approval blocks <6h and confirms >48h using the canonical guard'

  union all
  select 8,'request_syncs_smart_off',
    case when to_regprocedure(
      'public.ta_decide_shift_change_request_v61415(uuid,text,text,boolean)'
    ) is not null
    and pg_get_functiondef(
      'public.ta_decide_shift_change_request_v61415(uuid,text,text,boolean)'::regprocedure
    ) ilike '%ta_sync_bulk_schedule_rules_v6135%'
      then 'PASS' else 'FAIL' end,
    'Approved request updates Smart OFF / Scheduling Rule metadata too'

  union all
  select 9,'request_final_recalculation',
    case when to_regprocedure(
      'public.ta_decide_shift_change_request_v61415(uuid,text,text,boolean)'
    ) is not null
    and pg_get_functiondef(
      'public.ta_decide_shift_change_request_v61415(uuid,text,text,boolean)'::regprocedure
    ) ilike '%ta_finalize_schedule_mutation_v61415%'
      then 'PASS' else 'FAIL' end,
    'Approved request finishes with the same certification-aware finalizer'

  union all
  select 10,'request_has_no_legacy_extra_refresh',
    case when to_regprocedure(
      'public.ta_decide_shift_change_request_v61415(uuid,text,text,boolean)'
    ) is not null
    and pg_get_functiondef(
      'public.ta_decide_shift_change_request_v61415(uuid,text,text,boolean)'::regprocedure
    ) not ilike '%ta_refresh_attendance_calculation_v630%'
      then 'PASS' else 'FAIL' end,
    'No duplicate legacy refresh remains in the new request path'

  union all
  select 11,'execute_grants',
    case when has_function_privilege(
      'authenticated',
      'public.ta_refresh_attendance_consistency_v61415(date,date,text[])',
      'EXECUTE'
    )
    and has_function_privilege(
      'authenticated',
      'public.ta_finalize_schedule_mutation_v61415(jsonb)',
      'EXECUTE'
    )
    and has_function_privilege(
      'authenticated',
      'public.ta_decide_shift_change_request_v61415(uuid,text,text,boolean)',
      'EXECUTE'
    ) then 'PASS' else 'FAIL' end,
    'Authenticated users can execute the three V6.14.15 RPCs'
)
select seq,check_name,result,detail
from checks
order by seq;

-- Runtime spot-check: current certification status distribution.
select
  status,
  count(*) as rows
from public.ta_attendance_certifications
group by status
order by status;
