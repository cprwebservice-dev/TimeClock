-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.48
-- Whole-System Consistency Audit
-- ============================================================================

set statement_timeout = '0';

with checks as (
  select 1 seq,'canonical_expected_day_v61448'::text check_name,
    case when to_regprocedure('public._ta_expected_workday_v61448(text,date)') is not null then 'PASS' else 'FAIL' end result,
    'Expected day uses one V6.14.48 resolver'::text detail

  union all
  select 2,'expected_day_uses_work_pattern_not_pc',
    case when to_regprocedure('public._ta_expected_workday_v61448(text,date)') is not null
      and pg_get_functiondef('public._ta_expected_workday_v61448(text,date)'::regprocedure) ilike '%ta_resolve_employee_work_pattern_v651%'
      and pg_get_functiondef('public._ta_expected_workday_v61448(text,date)'::regprocedure) ilike '%_ta_is_full_day_leave_v61437%'
      and pg_get_functiondef('public._ta_expected_workday_v61448(text,date)'::regprocedure) not ilike '%get_expected_day_by_schedule%'
      then 'PASS' else 'FAIL' end,
    'No legacy PC/position expected-day function remains in the new resolver'

  union all
  select 3,'attendance_rebuild_uses_canonical_expected_day',
    case when to_regprocedure('public.rebuild_attendance_workday(date,date,text[])') is not null
      and pg_get_functiondef('public.rebuild_attendance_workday(date,date,text[])'::regprocedure) ilike '%_ta_expected_workday_v61448%'
      and pg_get_functiondef('public.rebuild_attendance_workday(date,date,text[])'::regprocedure) ilike '%SHIFT_WINDOW_V61448_CANONICAL_EXPECTED_DAY%'
      and pg_get_functiondef('public.rebuild_attendance_workday(date,date,text[])'::regprocedure) not ilike '%get_expected_day_by_schedule%'
      then 'PASS' else 'FAIL' end,
    'Rebuild keeps strict punch ownership and follows Work Pattern weekly-off'

  union all
  select 4,'canonical_work_pattern_v61425',
    case when to_regprocedure('public.ta_resolve_employee_work_pattern_v651(text,date)') is not null
      and pg_get_functiondef('public.ta_resolve_employee_work_pattern_v651(text,date)'::regprocedure) ilike '%TECH_6D%'
      and pg_get_functiondef('public.ta_resolve_employee_work_pattern_v651(text,date)'::regprocedure) not ilike '%regexp_replace%pc%'
      then 'PASS' else 'FAIL' end,
    'V6.14.25 neutral fallback; no PC force'

  union all
  select 5,'full_day_leave_overlay_v61437',
    case when to_regprocedure('public._ta_is_full_day_leave_v61437(text,date)') is not null
      and to_regprocedure('public.ta_validate_night_sequence_bulk_v61437(jsonb)') is not null
      then 'PASS' else 'FAIL' end,
    'Leave-aware schedule/night-sequence source remains installed'

  union all
  select 6,'work_pattern_minutes_guard_v61448',
    case when to_regprocedure('public._ta_work_pattern_minutes_guard_v61448()') is not null
      and exists(select 1 from pg_trigger where tgrelid='public.ta_work_patterns'::regclass and tgname='trg_zz_work_pattern_minutes_v61448' and not tgisinternal)
      then 'PASS' else 'FAIL' end,
    '5D/6D standard minutes cannot accidentally equal scheduled+break again'

  union all
  select 7,'core_5d_minutes',
    case when exists(
      select 1 from public.ta_work_patterns
      where upper(trim(pattern_code))='TECH_5D'
        and work_days_per_week=5
        and scheduled_minutes_including_break=570
        and standard_work_minutes=510
        and break_minutes=60
        and ot_threshold_minutes=510
    ) then 'PASS' else 'CHECK' end,
    'Current business baseline: 5D = 570 scheduled / 510 net / 60 break / OT 510'

  union all
  select 8,'core_6d_minutes',
    case when exists(
      select 1 from public.ta_work_patterns
      where upper(trim(pattern_code))='TECH_6D'
        and work_days_per_week=6
        and scheduled_minutes_including_break=540
        and standard_work_minutes=480
        and break_minutes=60
        and ot_threshold_minutes=480
    ) then 'PASS' else 'CHECK' end,
    'Current business baseline: 6D = 540 scheduled / 480 net / 60 break / OT 480'

  union all
  select 9,'attendance_policy_v61428',
    case when to_regprocedure('public._ta_apply_absence_v664()') is not null
      and pg_get_functiondef('public._ta_apply_absence_v664()'::regprocedure) ilike '%late_absence_threshold_minutes%'
      and exists(select 1 from pg_trigger where tgrelid='public.ta_attendance_calculations'::regclass and tgname='trg_zz_ta_calc_absence_v664' and not tgisinternal)
      then 'PASS' else 'FAIL' end,
    'Late 1-29 / >=30 absent / missing punch policy retained'

  union all
  select 10,'night_sequence_v61437',
    case when to_regprocedure('public.ta_validate_night_sequence_bulk_v61437(jsonb)') is not null
      and to_regprocedure('public.ta_validate_night_sequence_bulk_v61435(jsonb)') is not null
      and exists(select 1 from pg_trigger where tgrelid='public.shift_calendar'::regclass and tgname='trg_ta_night_sequence_guard_v61435' and not tgisinternal)
      then 'PASS' else 'FAIL' end,
    'Night -> Night/OFF/LV and previous-day rules remain protected'

  union all
  select 11,'schedule_grid_v61425',
    case when to_regprocedure('public.ta_get_schedule_range_light_v61425(date,date,text,text,text[],text[])') is not null
      and to_regprocedure('public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])') is not null
      and pg_get_functiondef('public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])'::regprocedure) ilike '%ta_get_schedule_range_light_v61425%'
      then 'PASS' else 'FAIL' end,
    'Person/Team/Time/Monthly Personal use the same canonical Schedule Grid'

  union all
  select 12,'bulk_writer_v61424_retained',
    case when to_regprocedure('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)') is not null
      and pg_get_functiondef('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)'::regprocedure) ilike '%ta_validate_night_sequence_bulk_v61435%'
      then 'PASS' else 'FAIL' end,
    'Quick/Copy/Paste/Fill/Undo/Redo central guarded writer remains installed'

  union all
  select 13,'paired_off_master_nonworking',
    case when not exists(
      select 1 from public.shift_master
      where upper(trim(shift_code)) in ('OSTD','OS043','OS134','OS135')
        and (coalesce(is_active,false)=false or coalesce(is_workday,true)=true)
    ) then 'PASS' else 'FAIL' end,
    'Paired day-off codes remain active non-working shifts'

  union all
  select 14,'time_certification_pipeline',
    case when exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ta_get_time_certification_range_v61139')
      and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ta_save_time_certification_v61139')
      and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ta_revoke_time_certification_v61139')
      then 'PASS' else 'FAIL' end,
    'Monthly Personal / Team Daily / Attendance Detail certification RPCs exist'

  union all
  select 15,'dayoff_balance_v61425',
    case when to_regprocedure('public.ta_get_dayoff_balance_v61425(text,date)') is not null then 'PASS' else 'FAIL' end,
    'Canonical day-off quota remains installed'

  union all
  select 16,'schedule_finalizer_v61415',
    case when exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ta_finalize_schedule_mutation_v61415')
      and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ta_refresh_attendance_consistency_v61415')
      then 'PASS' else 'FAIL' end,
    'Schedule mutation still ends with canonical Attendance refresh'

  union all
  select 17,'attendance_detail_api',
    case when to_regprocedure('public.ta_get_attendance_detail_v664(date,date,text,text,text[],text[],text[],integer)') is not null then 'PASS' else 'FAIL' end,
    'Attendance Detail canonical API exists'

  union all
  select 18,'attendance_rebuild_job_pipeline',
    case when exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ta_process_attendance_rebuild_step')
      and to_regclass('public.ta_attendance_rebuild_jobs') is not null
      then 'PASS' else 'FAIL' end,
    'Batch Rebuild pipeline remains available for historical reconciliation'

  union all
  select 19,'user_scope_access_guard',
    case when exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ta_can_access_employee_v680')
      and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='_ta_current_access_v681')
      then 'PASS' else 'FAIL' end,
    'Manager/Viewer/HR Admin employee access guards exist'

  union all
  select 20,'monthly_work_pattern_writer_v61419',
    case when exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ta_assign_employee_work_pattern_v61419')
      and exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ta_get_employee_pattern_assignments_v61419')
      then 'PASS' else 'FAIL' end,
    'Monthly-baseline Work Pattern reader/writer remains installed'
)
select seq,check_name,result,detail from checks order by seq;

-- ---------------------------------------------------------------------------
-- Data consistency for recent Attendance rows. 0 is expected in all 3 counts.
-- ---------------------------------------------------------------------------
with bounds as (
  select greatest(coalesce(max(work_date),current_date)-60,date '2026-01-01') as start_date,
         coalesce(max(work_date),current_date) as end_date
  from public.attendance_workday
), recent as (
  select aw.*
  from public.attendance_workday aw,bounds b
  where aw.work_date between b.start_date and b.end_date
)
select
  count(*) filter (
    where coalesce(r.expected_day,0) <> public._ta_expected_workday_v61448(r.emp_code,r.work_date)
  ) as expected_day_mismatch_rows,
  count(*) filter (
    where public._ta_expected_workday_v61448(r.emp_code,r.work_date)=0
      and coalesce(c.absence_minutes,0)>0
  ) as nonwork_absence_rows,
  count(*) filter (
    where public._ta_expected_workday_v61448(r.emp_code,r.work_date)=0
      and r.first_in is not null
      and exists(
        select 1 from public.time_logs tl
        where public.normalize_emp_code(tl.emp_code)=public.normalize_emp_code(r.emp_code)
          and tl.inout_date=coalesce(r.source_in_date,r.work_date)
          and tl.inout_time=r.first_in
          and upper(trim(coalesce(tl.normalized_mode,tl.inout_mode,''))) in ('OUT','O','ออก')
      )
      and not exists(
        select 1 from public.time_logs tl
        where public.normalize_emp_code(tl.emp_code)=public.normalize_emp_code(r.emp_code)
          and tl.inout_date=coalesce(r.source_in_date,r.work_date)
          and tl.inout_time=r.first_in
          and upper(trim(coalesce(tl.normalized_mode,tl.inout_mode,''))) in ('IN','I','เข้า')
      )
  ) as nonwork_out_reused_as_in_rows
from recent r
left join public.ta_attendance_calculations c
  on public.normalize_emp_code(c.emp_code)=public.normalize_emp_code(r.emp_code)
 and c.work_date=r.work_date;

-- Rows needing an Attendance rebuild after V6.14.48 (sample only).
select
  aw.work_date,aw.emp_code,aw.shift_code,aw.expected_day,
  public._ta_expected_workday_v61448(aw.emp_code,aw.work_date) as canonical_expected_day,
  aw.first_in,aw.last_out,aw.source_in_date,aw.source_out_date,
  aw.raw_meta->>'match_version' as match_version
from public.attendance_workday aw
where coalesce(aw.expected_day,0) <> public._ta_expected_workday_v61448(aw.emp_code,aw.work_date)
order by aw.work_date desc,aw.emp_code
limit 100;

-- Original reported case: should show 2/8/2026 OS043 as expected_day=0,
-- no carry-over first_in, and no absence. Query returns no rows if employee/date
-- are not present in this project.
select
  aw.work_date,aw.emp_code,aw.shift_code,aw.expected_day,
  aw.first_in,aw.last_out,aw.source_in_date,aw.source_out_date,
  c.day_type,c.absence_minutes,c.absence_reason,c.calculation_status,
  aw.raw_meta->>'match_version' as match_version
from public.attendance_workday aw
left join public.ta_attendance_calculations c
  on public.normalize_emp_code(c.emp_code)=public.normalize_emp_code(aw.emp_code)
 and c.work_date=aw.work_date
where public.normalize_emp_code(aw.emp_code)=public.normalize_emp_code('7825787')
  and aw.work_date between date '2026-08-01' and date '2026-08-02'
order by aw.work_date;
