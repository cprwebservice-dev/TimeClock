-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- TimeAttendance V6.14.49
-- Work Time / Waiting / Overtime Rules Consistency
-- ============================================================================

-- 1) Installation / wiring ----------------------------------------------------
with checks as (
  select 1 seq,'punch_meta_helper' check_name,
    case when to_regprocedure('public._ta_work_mode_punch_meta_v61449(text,date)') is not null then 'PASS' else 'FAIL' end result,
    'ตัวจับคู่ IN/OUT แยกกะที่ 1 / กะที่ 2' detail
  union all
  select 2,'business_formula_helper',
    case when to_regprocedure('public._ta_compute_worktime_metrics_v61449(text,text,numeric,numeric,timestamp without time zone,timestamp without time zone,timestamp without time zone,timestamp without time zone,timestamp without time zone,timestamp without time zone,timestamp without time zone,timestamp without time zone,numeric,numeric,numeric,numeric,numeric,numeric)') is not null then 'PASS' else 'FAIL' end,
    'สูตร WAITING / Net Work / OT กลาง'
  union all
  select 3,'central_calc_trigger',
    case when exists(
      select 1 from pg_trigger
      where tgrelid='public.ta_attendance_calculations'::regclass
        and tgname='trg_zy_ta_work_mode_metrics_v61449'
        and not tgisinternal
    ) then 'PASS' else 'FAIL' end,
    'ทุก Calculation path ผ่านกฎเดียวกัน'
  union all
  select 4,'trigger_before_absence_policy',
    case when exists(
      select 1 from pg_trigger
      where tgrelid='public.ta_attendance_calculations'::regclass
        and tgname='trg_zy_ta_work_mode_metrics_v61449'
        and not tgisinternal
    ) and exists(
      select 1 from pg_trigger
      where tgrelid='public.ta_attendance_calculations'::regclass
        and tgname='trg_zz_ta_calc_absence_v664'
        and not tgisinternal
    ) and 'trg_zy_ta_work_mode_metrics_v61449'<'trg_zz_ta_calc_absence_v664'
      then 'PASS' else 'FAIL' end,
    'คำนวณ Work/OT ก่อน Classification V6.14.28'
  union all
  select 5,'rule_upsert_recalculates',
    case when pg_get_functiondef('public.ta_upsert_schedule_rule_assignment_v6120(text,date,text,text,text,time,time,time,time,time,time,time,text,integer,jsonb,text)'::regprocedure)
      ilike '%_ta_refresh_attendance_calc_core_v630%'
      and pg_get_functiondef('public.ta_upsert_schedule_rule_assignment_v6120(text,date,text,text,text,time,time,time,time,time,time,time,text,integer,jsonb,text)'::regprocedure)
      ilike '%V6.14.49%'
      then 'PASS' else 'FAIL' end,
    'บันทึก Work Mode แล้วคำนวณ Attendance ซ้ำทันที'
  union all
  select 6,'rule_delete_recalculates',
    case when pg_get_functiondef('public.ta_delete_schedule_rule_assignment_v6120(text,date)'::regprocedure)
      ilike '%_ta_refresh_attendance_calc_core_v630%'
      then 'PASS' else 'FAIL' end,
    'กลับเป็นกะปกติแล้วล้างสูตรพิเศษทันที'
  union all
  select 7,'manual_refresh_rpc',
    case when to_regprocedure('public.ta_refresh_worktime_metrics_v61449(date,date,text[])') is not null
      and has_function_privilege('authenticated','public.ta_refresh_worktime_metrics_v61449(date,date,text[])','EXECUTE')
      then 'PASS' else 'FAIL' end,
    'HR Admin สามารถ Recalculate ช่วงย้อนหลังได้'
)
select * from checks order by seq;

-- 2) Formula unit tests -------------------------------------------------------
with normal as (
  select * from public._ta_compute_worktime_metrics_v61449(
    'NORMAL','WORKDAY',480,60,
    timestamp '2026-08-24 08:30',timestamp '2026-08-24 17:30',
    timestamp '2026-08-24 08:20',timestamp '2026-08-24 19:00',
    null,null,null,null,
    540,0,60,570,480,90
  )
), late_customer as (
  select * from public._ta_compute_worktime_metrics_v61449(
    'NORMAL_LATE_CUSTOMER','WORKDAY',480,60,
    timestamp '2026-08-24 08:30',timestamp '2026-08-24 17:30',
    timestamp '2026-08-24 08:20',timestamp '2026-08-24 17:30',
    timestamp '2026-08-24 21:00',timestamp '2026-08-25 01:00',
    timestamp '2026-08-24 21:00',timestamp '2026-08-25 01:00',
    780,210,60,720,480,240
  )
), split_wait as (
  select * from public._ta_compute_worktime_metrics_v61449(
    'SPLIT_WAIT_NIGHT','WORKDAY',480,60,
    timestamp '2026-08-24 08:30',timestamp '2026-08-24 15:00',
    timestamp '2026-08-24 08:30',timestamp '2026-08-24 15:00',
    timestamp '2026-08-24 21:00',timestamp '2026-08-25 01:00',
    timestamp '2026-08-24 21:00',timestamp '2026-08-25 01:00',
    630,360,60,570,480,90
  )
), hour_based as (
  select * from public._ta_compute_worktime_metrics_v61449(
    'HOUR_BASED','WORKDAY',480,60,
    timestamp '2026-08-24 04:00',timestamp '2026-08-24 13:00',
    timestamp '2026-08-24 04:00',timestamp '2026-08-24 14:00',
    null,null,null,null,
    540,0,60,540,480,60
  )
), actual_wait as (
  select * from public._ta_compute_worktime_metrics_v61449(
    'SPLIT_WAIT_NIGHT','WORKDAY',480,60,
    timestamp '2026-08-24 08:30',timestamp '2026-08-24 15:00',
    timestamp '2026-08-24 08:30',timestamp '2026-08-24 15:10',
    timestamp '2026-08-24 21:00',timestamp '2026-08-25 01:00',
    timestamp '2026-08-24 21:05',timestamp '2026-08-25 01:00',
    630,360,60,565,480,85
  )
)
select 8 seq,'normal_ot_after_shift_end' check_name,
  case when round(overtime_minutes,2)=90 then 'PASS' else 'FAIL' end result,
  format('OT=%s นาที (คาด 90)',overtime_minutes) detail from normal
union all
select 9,'normal_late_customer_shift2_is_ot',
  case when round(waiting_minutes,2)=210 and round(paid_work_minutes,2)=720 and round(regular_minutes,2)=480 and round(overtime_minutes,2)=240 then 'PASS' else 'FAIL' end,
  format('Waiting=%s Net=%s Regular=%s OT=%s',waiting_minutes,paid_work_minutes,regular_minutes,overtime_minutes) from late_customer
union all
select 10,'split_wait_night_excess_daily_is_ot',
  case when round(waiting_minutes,2)=360 and round(paid_work_minutes,2)=570 and round(regular_minutes,2)=480 and round(overtime_minutes,2)=90 then 'PASS' else 'FAIL' end,
  format('Waiting=%s Net=%s Regular=%s OT=%s',waiting_minutes,paid_work_minutes,regular_minutes,overtime_minutes) from split_wait
union all
select 11,'hour_based_ot_after_computed_end',
  case when round(overtime_minutes,2)=60 and round(paid_work_minutes,2)=540 and round(regular_minutes,2)=480 then 'PASS' else 'FAIL' end,
  format('Net=%s Regular=%s OT=%s',paid_work_minutes,regular_minutes,overtime_minutes) from hour_based
union all
select 12,'waiting_prefers_actual_out1_to_in2',
  case when round(waiting_minutes,2)=355 and waiting_source='ACTUAL_OUT1_TO_IN2' then 'PASS' else 'FAIL' end,
  format('Waiting=%s source=%s (คาด 355 นาที)',waiting_minutes,waiting_source) from actual_wait
order by seq;

-- 3) Runtime audit: existing special-mode rows --------------------------------
-- If stale_metric_rows > 0 after installation, run Attendance Rebuild/Process
-- for the affected range, or call ta_refresh_worktime_metrics_v61449 as HR Admin.
with special as (
  select
    c.emp_code,
    c.work_date,
    coalesce(
      nullif(upper(trim(coalesce(a.work_mode_code,''))),''),
      case
        when upper(trim(coalesce(sc.shift_code,''))) like 'SW%' then 'SPLIT_WAIT_NIGHT'
        when upper(trim(coalesce(sc.shift_code,''))) ~ '^H[56]' then 'HOUR_BASED'
        when upper(trim(coalesce(c.template_code,'')))='SPLIT_FLEX' then 'NORMAL_LATE_CUSTOMER'
        else 'NORMAL'
      end
    ) as work_mode_code,
    c.waiting_minutes,
    c.break_deducted_minutes,
    c.paid_work_minutes,
    c.regular_minutes,
    c.overtime_minutes,
    c.raw_meta
  from public.ta_attendance_calculations c
  left join public.ta_schedule_rule_assignments a
    on public.normalize_emp_code(c.emp_code)=public.normalize_emp_code(a.emp_code)
   and c.work_date=a.work_date
  left join public.shift_calendar sc
    on public.normalize_emp_code(c.emp_code)=public.normalize_emp_code(sc.emp_code)
   and c.work_date=sc.work_date
  where upper(trim(coalesce(a.work_mode_code,''))) in (
      'NORMAL_LATE_CUSTOMER','SPLIT_WAIT_NIGHT','HOUR_BASED'
    )
    or upper(trim(coalesce(c.template_code,'')))='SPLIT_FLEX'
    or upper(trim(coalesce(sc.shift_code,''))) like 'SW%'
    or upper(trim(coalesce(sc.shift_code,''))) ~ '^H[56]'
)
select
  count(*) as special_mode_rows,
  count(*) filter(where coalesce(waiting_minutes,0)<0) as negative_waiting_rows,
  count(*) filter(where coalesce(paid_work_minutes,0)<0 or coalesce(overtime_minutes,0)<0) as negative_work_or_ot_rows,
  count(*) filter(
    where upper(work_mode_code) in ('NORMAL_LATE_CUSTOMER','SPLIT_WAIT_NIGHT')
      and abs(coalesce(paid_work_minutes,0)-coalesce(regular_minutes,0)-coalesce(overtime_minutes,0))>0.01
  ) as split_total_mismatch_rows,
  count(*) filter(where coalesce(raw_meta->>'worktime_rule_version','')<>'V6.14.49') as stale_metric_rows
from special;

-- 4) Show rows still waiting for V6.14.49 recalculation -----------------------
select
  c.emp_code,
  c.work_date,
  coalesce(
    nullif(upper(trim(coalesce(a.work_mode_code,''))),''),
    case
      when upper(trim(coalesce(sc.shift_code,''))) like 'SW%' then 'SPLIT_WAIT_NIGHT'
      when upper(trim(coalesce(sc.shift_code,''))) ~ '^H[56]' then 'HOUR_BASED'
      when upper(trim(coalesce(c.template_code,'')))='SPLIT_FLEX' then 'NORMAL_LATE_CUSTOMER'
      else 'NORMAL'
    end
  ) as work_mode_code,
  c.template_code,
  c.waiting_minutes,
  c.break_deducted_minutes,
  c.paid_work_minutes,
  c.regular_minutes,
  c.overtime_minutes,
  c.raw_meta->>'worktime_rule_version' as rule_version,
  c.raw_meta->>'waiting_source' as waiting_source,
  c.raw_meta->>'ot_rule' as ot_rule
from public.ta_attendance_calculations c
left join public.ta_schedule_rule_assignments a
  on public.normalize_emp_code(c.emp_code)=public.normalize_emp_code(a.emp_code)
 and c.work_date=a.work_date
left join public.shift_calendar sc
  on public.normalize_emp_code(c.emp_code)=public.normalize_emp_code(sc.emp_code)
 and c.work_date=sc.work_date
where (
    upper(trim(coalesce(a.work_mode_code,''))) in ('NORMAL_LATE_CUSTOMER','SPLIT_WAIT_NIGHT','HOUR_BASED')
    or upper(trim(coalesce(c.template_code,'')))='SPLIT_FLEX'
    or upper(trim(coalesce(sc.shift_code,''))) like 'SW%'
    or upper(trim(coalesce(sc.shift_code,''))) ~ '^H[56]'
  )
  and coalesce(c.raw_meta->>'worktime_rule_version','')<>'V6.14.49'
order by c.work_date desc,c.emp_code
limit 100;
