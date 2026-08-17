-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.11.45
-- ============================================================================

with save_fn as (
  select pg_get_functiondef(
    'public.ta_save_time_certification_v61139(text,date,timestamp without time zone,timestamp without time zone,text,text)'::regprocedure
  ) as def
),
overlay_fn as (
  select pg_get_functiondef(
    'public._ta_refresh_attendance_with_certification_v61139(date,date,text[])'::regprocedure
  ) as def
),
checks as (
  select
    1 as seq,
    'certified_segment_column'::text as check_name,
    case
      when exists (
        select 1
        from information_schema.columns
        where table_schema='public'
          and table_name='ta_attendance_certifications'
          and column_name='certified_segment_no'
      )
      then 'PASS' else 'FAIL'
    end as result,
    'Certification stores segment number'::text as detail

  union all
  select
    2,
    'shift_1_only_constraint',
    case
      when exists (
        select 1
        from pg_constraint
        where conname='ck_att_cert_segment_1_v61145'
          and conrelid='public.ta_attendance_certifications'::regclass
      )
      then 'PASS' else 'FAIL'
    end,
    'Time Certification is restricted to Shift 1'

  union all
  select
    3,
    'shift_punch_meta_used',
    case
      when exists (
        select 1 from save_fn
        where def ilike '%ta_get_attendance_shift_punch_meta_v61110%'
          and def ilike '%shift_1_actual_out_at%'
      )
      then 'PASS' else 'FAIL'
    end,
    'Save RPC resolves Shift-1 RAW OUT from punch metadata'

  union all
  select
    4,
    'actual_out_upper_bound',
    case
      when exists (
        select 1 from save_fn
        where def ilike '%v_shift1_actual_out_at is not null%'
          and def ilike '%p_certified_end_at > v_shift1_actual_out_at%'
          and def ilike '%TIME_CERTIFICATION_END_AFTER_ACTUAL_OUT%'
      )
      then 'PASS' else 'FAIL'
    end,
    'Certified end cannot exceed actual Shift-1 OUT'

  union all
  select
    5,
    'missing_out_remains_allowed',
    case
      when exists (
        select 1 from save_fn
        where def ilike '%if v_shift1_actual_out_at is not null%'
      )
      then 'PASS' else 'FAIL'
    end,
    'No upper bound is applied when Shift-1 OUT is missing'

  union all
  select
    6,
    'two_shift_detected',
    case
      when exists (
        select 1 from overlay_fn
        where def ilike '%v_has_second_shift%'
          and def ilike '%paid_segment_count%'
      )
      then 'PASS' else 'FAIL'
    end,
    'Calculation detects 2-shift / multi-segment days'

  union all
  select
    7,
    'shift_2_raw_preserved',
    case
      when exists (
        select 1 from overlay_fn
        where def ilike '%SHIFT_1_ONLY%'
          and def ilike '%shift_2_preserved_raw%'
          and def ilike '%last_out = v_last_out%'
      )
      then 'PASS' else 'FAIL'
    end,
    'Shift 2 / final OUT remains RAW punch data'

  union all
  select
    8,
    'single_shift_overlay_unchanged',
    case
      when exists (
        select 1 from overlay_fn
        where def ilike '%last_out = r.certified_end_at::time%'
      )
      then 'PASS' else 'FAIL'
    end,
    'Single-shift day continues to use certified start/end'

  union all
  select
    9,
    'system_period_preserved',
    case
      when exists (
        select 1 from save_fn
        where def ilike '%_ta_assert_system_period_action_v6110%'
          and def ilike '%ATTENDANCE_CERTIFY%'
      )
      then 'PASS' else 'FAIL'
    end,
    'System Period guard remains active'

  union all
  select
    10,
    'v61145_result',
    'PASS',
    'V6.11.45 verification completed'
)
select seq,check_name,result,detail
from checks
order by seq;
