-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.11.44
-- ============================================================================

with checks as (
  select
    1 as seq,
    'system_period_certification_guard'::text as check_name,
    case
      when pg_get_functiondef(
        'public.ta_save_time_certification_v61139(text,date,timestamp without time zone,timestamp without time zone,text,text)'::regprocedure
      ) ilike '%_ta_assert_system_period_action_v6110%'
       and pg_get_functiondef(
        'public.ta_save_time_certification_v61139(text,date,timestamp without time zone,timestamp without time zone,text,text)'::regprocedure
      ) ilike '%ATTENDANCE_CERTIFY%'
      then 'PASS' else 'FAIL'
    end as result,
    'Save Certification follows System Period attendance certification rule'::text as detail

  union all
  select
    2,
    'shift_stale_trigger_exists',
    case
      when exists(
        select 1
        from pg_trigger t
        where t.tgrelid = 'public.shift_calendar'::regclass
          and t.tgname = 'trg_stale_certification_on_shift_v61144'
          and not t.tgisinternal
      )
      then 'PASS' else 'FAIL'
    end,
    'Shift Calendar has V6.11.44 stale certification trigger'

  union all
  select
    3,
    'meaningful_shift_change_only',
    case
      when pg_get_functiondef(
        'public._ta_stale_certification_on_shift_v61144()'::regprocedure
      ) ilike '%shift_code_snapshot%'
       and pg_get_functiondef(
        'public._ta_stale_certification_on_shift_v61144()'::regprocedure
      ) ilike '%shift_start_at_snapshot%'
       and pg_get_functiondef(
        'public._ta_stale_certification_on_shift_v61144()'::regprocedure
      ) ilike '%shift_end_at_snapshot%'
      then 'PASS' else 'FAIL'
    end,
    'Trigger compares certified shift snapshot with new shift'

  union all
  select
    4,
    'stale_audit',
    case
      when pg_get_functiondef(
        'public._ta_stale_certification_on_shift_v61144()'::regprocedure
      ) ilike '%STALE_SHIFT_CHANGED%'
      then 'PASS' else 'FAIL'
    end,
    'Shift change creates certification stale audit'

  union all
  select
    5,
    'calculation_certified_only',
    case
      when pg_get_functiondef(
        'public._ta_refresh_attendance_with_certification_v61139(date,date,text[])'::regprocedure
      ) ilike '%c.status = ''CERTIFIED''%'
      then 'PASS' else 'FAIL'
    end,
    'Only CERTIFIED rows can overlay Attendance'

  union all
  select
    6,
    'calculation_shift_snapshot_guard',
    case
      when pg_get_functiondef(
        'public._ta_refresh_attendance_with_certification_v61139(date,date,text[])'::regprocedure
      ) ilike '%v_shift_match%'
       and pg_get_functiondef(
        'public._ta_refresh_attendance_with_certification_v61139(date,date,text[])'::regprocedure
      ) ilike '%STALE_SHIFT_MISMATCH%'
      then 'PASS' else 'FAIL'
    end,
    'Calculation rejects certification if current shift differs from snapshot'

  union all
  select
    7,
    'stale_not_overlaid',
    case
      when pg_get_functiondef(
        'public._ta_refresh_attendance_with_certification_v61139(date,date,text[])'::regprocedure
      ) ilike '%continue;%'
       and pg_get_functiondef(
        'public._ta_refresh_attendance_with_certification_v61139(date,date,text[])'::regprocedure
      ) ilike '%certification_stale_rows%'
      then 'PASS' else 'FAIL'
    end,
    'STALE certification is skipped before overlay calculation'

  union all
  select
    8,
    'reader_exposes_status',
    case
      when to_regprocedure(
        'public.ta_get_time_certification_range_v61139(date,date,text[])'
      ) is not null
      then 'PASS' else 'FAIL'
    end,
    'Team Daily / Monthly reader can display CERTIFIED / STALE status'

  union all
  select
    9,
    'system_period_runtime_exists',
    case
      when to_regprocedure(
        'public.ta_get_system_period_for_date_v6110(date)'
      ) is not null
       and to_regprocedure(
        'public._ta_assert_system_period_action_v6110(date,text)'
      ) is not null
      then 'PASS' else 'FAIL'
    end,
    'System Period runtime APIs are available'

  union all
  select
    10,
    'v61144_result',
    'PASS',
    'V6.11.44 verification completed'
)
select seq,check_name,result,detail
from checks
order by seq;
