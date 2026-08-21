-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.36
-- ============================================================================

with checks as (
  select 1 seq,'night_sequence_validator' check_name,
    case when to_regprocedure('public.ta_validate_night_sequence_bulk_v61435(jsonb)') is not null then 'PASS' else 'FAIL' end result,
    'Authoritative whole-payload validator exists' detail

  union all
  select 2,'lv_allowed_after_night_backend',
    case when pg_get_functiondef('public.ta_validate_night_sequence_bulk_v61435(jsonb)'::regprocedure)
      ilike '%next_is_leave%'
      and pg_get_functiondef('public.ta_validate_night_sequence_bulk_v61435(jsonb)'::regprocedure)
      ilike '%not coalesce(n.next_is_leave,false)%'
      then 'PASS' else 'FAIL' end,
    'NIGHT -> LV is allowed by projected backend validation'

  union all
  select 3,'lv_allowed_after_night_audit',
    case when pg_get_functiondef('public.ta_audit_night_sequence_v61435(date,date,text[])'::regprocedure)
      ilike '%next_is_leave%'
      and pg_get_functiondef('public.ta_audit_night_sequence_v61435(date,date,text[])'::regprocedure)
      ilike '%not coalesce(n.next_is_leave,false)%'
      then 'PASS' else 'FAIL' end,
    'Current-state audit does not flag NIGHT -> LV'

  union all
  select 4,'lv_remains_separate_from_dayoff',
    case when pg_get_functiondef('public.ta_validate_night_sequence_bulk_v61435(jsonb)'::regprocedure)
      ilike '%(p.shift_code=''LV'') as is_leave%'
      and pg_get_functiondef('public.ta_validate_night_sequence_bulk_v61435(jsonb)'::regprocedure)
      ilike '%p.shift_code<>''LV'' and coalesce(sm.is_workday,true)=false%'
      then 'PASS' else 'FAIL' end,
    'LV is allowed by sequence rule but is not converted into Day-off/quota usage'

  union all
  select 5,'previous_day_work_rule_retained',
    case when pg_get_functiondef('public.ta_validate_night_sequence_bulk_v61435(jsonb)'::regprocedure)
      ilike '%NIGHT_PREVIOUS_DAY_WORK%' then 'PASS' else 'FAIL' end,
    'Previous calendar day of a Night still cannot be morning/day work'

  union all
  select 6,'deferred_db_guard_retained',
    case when exists(
      select 1 from pg_trigger t
      where t.tgrelid='public.shift_calendar'::regclass
        and t.tgname='trg_ta_night_sequence_guard_v61435'
        and not t.tgisinternal
        and t.tgdeferrable
        and t.tginitdeferred
    ) then 'PASS' else 'FAIL' end,
    'Single/direct writes remain protected at transaction end'

  union all
  select 7,'bulk_writer_still_uses_guard',
    case when pg_get_functiondef('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)'::regprocedure)
      ilike '%ta_validate_night_sequence_bulk_v61435%' then 'PASS' else 'FAIL' end,
    'Quick/Bulk/Copy/Fill backend writer uses corrected validator'

  union all
  select 8,'guard_version_v61436',
    case when pg_get_functiondef('public.ta_validate_night_sequence_bulk_v61435(jsonb)'::regprocedure)
      ilike '%V6.14.36%' then 'PASS' else 'FAIL' end,
    'Corrected V6.14.36 rule is installed'
)
select seq,check_name,result,detail from checks order by seq;

-- ตรวจข้อมูลจริงเดือนปัจจุบัน
-- NIGHT -> LV จะไม่ถูกแสดงเป็น violation แล้ว
-- ผลลัพธ์ที่สมบูรณ์ควรเป็น 0 แถวหลังตารางกะถูกจัดตามกฎ
select *
from public.ta_audit_night_sequence_v61435(
  date_trunc('month',current_date)::date,
  (date_trunc('month',current_date)+interval '1 month - 1 day')::date,
  null
)
order by emp_code,night_date,reason;
