-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.47
-- Off-day Punch Ownership / Cross-midnight Carryover Fix
-- ============================================================================

with fn as (
  select pg_get_functiondef(
    'public.rebuild_attendance_workday(date,date,text[])'::regprocedure
  ) as def
), checks as (
  select 1 as seq,'rebuild_function_exists'::text as check_name,
    case when to_regprocedure('public.rebuild_attendance_workday(date,date,text[])') is not null then 'PASS' else 'FAIL' end as result,
    'Canonical attendance_workday rebuild exists'::text as detail

  union all
  select 2,'offday_strict_match_version',
    case when exists(select 1 from fn where def ilike '%SHIFT_WINDOW_V61447_OFFDAY_STRICT%') then 'PASS' else 'FAIL' end,
    'Rebuild marks the V6.14.47 strict punch ownership version'

  union all
  select 3,'offday_in_any_fallback_blocked',
    case when exists(select 1 from fn where def ilike '%base_expected_day = 1 then in_any.log_at%') then 'PASS' else 'FAIL' end,
    'Any-mode IN fallback is retained only for expected workdays'

  union all
  select 4,'offday_out_any_fallback_blocked',
    case when exists(select 1 from fn where def ilike '%base_expected_day = 1 then out_any.log_at%') then 'PASS' else 'FAIL' end,
    'Any-mode OUT fallback is retained only for expected workdays'

  union all
  select 5,'paired_off_master_nonworkday',
    case when count(*)=4 and count(*) filter(where coalesce(is_active,false) and coalesce(is_workday,true)=false)=4 then 'PASS' else 'FAIL' end,
    'OSTD / OS043 / OS134 / OS135 are active non-working Shift Master rows'
  from public.shift_master
  where upper(trim(shift_code)) in ('OSTD','OS043','OS134','OS135')

  union all
  select 6,'no_previous_out_carried_as_offday_in',
    case when count(*)=0 then 'PASS' else 'FAIL' end,
    'No expected-day=0 row uses the previous work_date last_out timestamp as its first_in'
  from public.attendance_workday aw
  join public.attendance_workday prev
    on public.normalize_emp_code(prev.emp_code)=public.normalize_emp_code(aw.emp_code)
   and prev.work_date=aw.work_date-1
  where coalesce(aw.expected_day,0)=0
    and aw.first_in is not null
    and prev.last_out=aw.first_in
    and coalesce(
          prev.source_out_date,
          prev.work_date + case
            when prev.first_in is not null and prev.last_out < prev.first_in then 1
            else 0
          end
        )=coalesce(aw.source_in_date,aw.work_date)

  union all
  select 7,'no_out_only_punch_used_as_offday_in',
    case when count(*)=0 then 'PASS' else 'FAIL' end,
    'No expected-day=0 first_in points to an OUT-only raw punch at the same timestamp'
  from public.attendance_workday aw
  where coalesce(aw.expected_day,0)=0
    and aw.first_in is not null
    and exists(
      select 1
      from public.time_logs tl
      where public.normalize_emp_code(tl.emp_code)=public.normalize_emp_code(aw.emp_code)
        and tl.inout_date=coalesce(aw.source_in_date,aw.work_date)
        and tl.inout_time=aw.first_in
        and upper(trim(coalesce(tl.normalized_mode,tl.inout_mode,''))) in ('OUT','O','ออก')
    )
    and not exists(
      select 1
      from public.time_logs tl
      where public.normalize_emp_code(tl.emp_code)=public.normalize_emp_code(aw.emp_code)
        and tl.inout_date=coalesce(aw.source_in_date,aw.work_date)
        and tl.inout_time=aw.first_in
        and upper(trim(coalesce(tl.normalized_mode,tl.inout_mode,''))) in ('IN','I','เข้า')
    )

  union all
  select 8,'nonworkday_absence_zero',
    case when count(*)=0 then 'PASS' else 'FAIL' end,
    'Expected-day=0 Attendance rows do not carry absence_minutes'
  from public.attendance_workday aw
  join public.ta_attendance_calculations c
    on public.normalize_emp_code(c.emp_code)=public.normalize_emp_code(aw.emp_code)
   and c.work_date=aw.work_date
  where coalesce(aw.expected_day,0)=0
    and coalesce(c.absence_minutes,0)>0
)
select seq,check_name,result,detail
from checks
order by seq;

-- เคสจากภาพ: 7825787 วันที่ 1-2 สิงหาคม 2026
-- วันที่ 2 ต้องเป็นวันหยุด และ 02:30 ของวันที่ 2 ต้องไม่ถูกถือเป็น first_in
select
  aw.work_date,
  aw.emp_code,
  aw.shift_code,
  sm.is_workday as shift_is_workday,
  aw.expected_day,
  aw.first_in,
  aw.last_out,
  aw.source_in_date,
  aw.source_out_date,
  aw.raw_meta->>'match_version' as match_version,
  aw.raw_meta->>'offday_punch_ownership_fix' as ownership_fix,
  c.day_type as calculation_day_type,
  c.calculation_status,
  c.absence_minutes,
  c.absence_reason
from public.attendance_workday aw
left join public.shift_master sm
  on upper(trim(sm.shift_code))=upper(trim(aw.shift_code))
left join public.ta_attendance_calculations c
  on public.normalize_emp_code(c.emp_code)=public.normalize_emp_code(aw.emp_code)
 and c.work_date=aw.work_date
where public.normalize_emp_code(aw.emp_code)=public.normalize_emp_code('7825787')
  and aw.work_date between date '2026-08-01' and date '2026-08-02'
order by aw.work_date;

-- Raw punches รอบกะข้ามคืนของเคสตัวอย่าง เพื่อยืนยัน ownership
select
  tl.inout_date,
  tl.inout_time,
  tl.normalized_mode,
  tl.inout_mode
from public.time_logs tl
where public.normalize_emp_code(tl.emp_code)=public.normalize_emp_code('7825787')
  and tl.inout_date between date '2026-08-01' and date '2026-08-02'
order by tl.inout_date,tl.inout_time;
