-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.11.54
-- Expected: PASS ทั้ง 10 รายการ
-- ============================================================================

with
matcher_fn as (
  select pg_get_functiondef(
    'public._ta_certification_shift_match_v61154(text,date,text,timestamp without time zone,timestamp without time zone)'::regprocedure
  ) as def
),
trigger_fn as (
  select pg_get_functiondef(
    'public._ta_stale_certification_on_shift_v61144()'::regprocedure
  ) as def
),
overlay_fn as (
  select pg_get_functiondef(
    'public._ta_refresh_attendance_with_certification_v61139(date,date,text[])'::regprocedure
  ) as def
),
false_stale as (
  select count(*)::integer as cnt
  from public.ta_attendance_certifications c
  cross join lateral public._ta_certification_shift_match_v61154(
    c.emp_code,
    c.work_date,
    c.shift_code_snapshot,
    c.shift_start_at_snapshot,
    c.shift_end_at_snapshot
  ) m
  where c.status = 'STALE'
    and c.certified_start_at is not null
    and c.certified_end_at is not null
    and coalesce(m.is_match,false)
),
checks as (
  select
    1 as seq,
    'canonical_matcher_exists'::text as check_name,
    case
      when to_regprocedure(
        'public._ta_certification_shift_match_v61154(text,date,text,timestamp without time zone,timestamp without time zone)'
      ) is not null
      then 'PASS' else 'FAIL'
    end as result,
    'Canonical shift matcher installed'::text as detail

  union all
  select
    2,
    'matcher_uses_schedule_range',
    case
      when exists (
        select 1 from matcher_fn
        where def ilike '%ta_get_schedule_range_v61024%'
      )
      then 'PASS' else 'FAIL'
    end,
    'Snapshot and current shift use same canonical schedule RPC'

  union all
  select
    3,
    'minute_normalization',
    case
      when exists (
        select 1 from matcher_fn
        where def ilike '%date_trunc(%minute%'
      )
      then 'PASS' else 'FAIL'
    end,
    'Irrelevant seconds do not create false STALE'

  union all
  select
    4,
    'shift_trigger_uses_canonical_matcher',
    case
      when exists (
        select 1 from trigger_fn
        where def ilike '%_ta_certification_shift_match_v61154%'
      )
      then 'PASS' else 'FAIL'
    end,
    'Shift-calendar trigger checks effective shift, not raw row only'

  union all
  select
    5,
    'shift_trigger_installed',
    case
      when exists (
        select 1
        from pg_trigger t
        join pg_class c on c.oid=t.tgrelid
        join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public'
          and c.relname='shift_calendar'
          and t.tgname='trg_stale_certification_on_shift_v61144'
          and not t.tgisinternal
      )
      then 'PASS' else 'FAIL'
    end,
    'Certification stale trigger active on shift_calendar'

  union all
  select
    6,
    'attendance_overlay_uses_canonical_matcher',
    case
      when exists (
        select 1 from overlay_fn
        where def ilike '%_ta_certification_shift_match_v61154%'
      )
      then 'PASS' else 'FAIL'
    end,
    'Recalculation checks canonical schedule before marking STALE'

  union all
  select
    7,
    'derived_attendance_not_used_for_stale_compare',
    case
      when exists (
        select 1 from overlay_fn
        where def not ilike '%v_current_shift_code%'
          and def not ilike '%v_current_shift_start%'
          and def not ilike '%v_current_shift_end%'
      )
      then 'PASS' else 'FAIL'
    end,
    'attendance_workday representation no longer decides shift mismatch'

  union all
  select
    8,
    'shift1_two_shift_logic_preserved',
    case
      when exists (
        select 1 from overlay_fn
        where def ilike '%SHIFT_1_ONLY%'
          and def ilike '%shift_2_preserved_raw%'
          and def ilike '%last_out = v_last_out%'
      )
      then 'PASS' else 'FAIL'
    end,
    'V6.11.45 two-shift certification behavior preserved'

  union all
  select
    9,
    'overlay_version_v61154',
    case
      when exists (
        select 1 from overlay_fn
        where def ilike '%V6.11.54%'
      )
      then 'PASS' else 'FAIL'
    end,
    'Attendance calculation is using V6.11.54 certification overlay'

  union all
  select
    10,
    'false_stale_remaining',
    case
      when (select cnt from false_stale) = 0
      then 'PASS' else 'FAIL'
    end,
    'STALE rows whose current effective shift still matches snapshot = '
      || (select cnt::text from false_stale)
)
select seq,check_name,result,detail
from checks
order by seq;
