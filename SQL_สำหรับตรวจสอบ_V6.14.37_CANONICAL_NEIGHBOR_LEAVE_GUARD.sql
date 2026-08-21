-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.37
-- Canonical Neighbor State + Full-Day Leave Overlay
-- ============================================================================

with checks as (
  select 1 seq,'full_day_leave_resolver' check_name,
    case when to_regprocedure('public._ta_is_full_day_leave_v61437(text,date)') is not null then 'PASS' else 'FAIL' end result,
    'ตัวตรวจลาเต็มวันจาก Schedule LV / Daily Plan / Approved Leave / Attendance' detail

  union all
  select 2,'canonical_neighbor_state',
    case when to_regprocedure('public._ta_night_sequence_state_v61437(text,date,date)') is not null then 'PASS' else 'FAIL' end,
    'วันก่อน/วันปัจจุบัน/วันถัดไปใช้ State เดียวกัน'

  union all
  select 3,'assignment_context_rpc',
    case when to_regprocedure('public.ta_get_night_sequence_context_v61437(text,date)') is not null then 'PASS' else 'FAIL' end,
    'Popup สามารถอ่าน Neighbor State จาก Backend โดยตรง'

  union all
  select 4,'bulk_sequence_validator_v61437',
    case when to_regprocedure('public.ta_validate_night_sequence_bulk_v61437(jsonb)') is not null then 'PASS' else 'FAIL' end,
    'Quick/Bulk/Copy/Fill ใช้ Projected Final State'

  union all
  select 5,'legacy_validator_delegates_v61437',
    case when to_regprocedure('public.ta_validate_night_sequence_bulk_v61435(jsonb)') is not null
      and pg_get_functiondef('public.ta_validate_night_sequence_bulk_v61435(jsonb)'::regprocedure)
          ilike '%ta_validate_night_sequence_bulk_v61437%'
      then 'PASS' else 'FAIL' end,
    'V6.14.35/36 compatibility name ชี้ไป V6.14.37'

  union all
  select 6,'audit_uses_canonical_state',
    case when to_regprocedure('public.ta_audit_night_sequence_v61435(date,date,text[])') is not null
      and pg_get_functiondef('public.ta_audit_night_sequence_v61435(date,date,text[])'::regprocedure)
          ilike '%_ta_night_sequence_state_v61437%'
      then 'PASS' else 'FAIL' end,
    'DB audit/trigger ใช้ Leave-aware state เดียวกัน'

  union all
  select 7,'deferred_db_guard_trigger',
    case when exists(
      select 1 from pg_trigger
      where tgrelid='public.shift_calendar'::regclass
        and tgname='trg_ta_night_sequence_guard_v61435'
        and not tgisinternal
    ) then 'PASS' else 'FAIL' end,
    'Database safety-net ยังทำงาน'

  union all
  select 8,'minimum_rest_leave_reset',
    case when to_regprocedure('public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean)') is not null
      and pg_get_functiondef('public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean)'::regprocedure)
          ilike '%_ta_is_full_day_leave_v61437%'
      and pg_get_functiondef('public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean)'::regprocedure)
          ilike '%V6.14.37%'
      then 'PASS' else 'FAIL' end,
    'ลาเต็มวัน Reset Minimum Rest / 48h continuity'

  union all
  select 9,'validator_returns_row_violations',
    case when pg_get_functiondef('public.ta_validate_night_sequence_bulk_v61437(jsonb)'::regprocedure)
      ilike '%row_violations%'
      then 'PASS' else 'FAIL' end,
    'ปุ่มลัดสามารถข้ามเฉพาะ Cell ที่ผิดกฎ'

  union all
  select 10,'authenticated_execute',
    case when has_function_privilege('authenticated','public.ta_get_night_sequence_context_v61437(text,date)','EXECUTE')
      and has_function_privilege('authenticated','public.ta_validate_night_sequence_bulk_v61437(jsonb)','EXECUTE')
      then 'PASS' else 'FAIL' end,
    'Frontend เรียก Context + Validator ได้'
)
select seq,check_name,result,detail from checks order by seq;

-- ---------------------------------------------------------------------------
-- ตรวจเคสตามภาพแนบ: Employee 7889433 วันที่ 10/08/2569 (2026-08-10)
-- ถ้าวันก่อนเป็นลาเต็มวัน Context.previous.state_code ต้องเป็น LV
-- และวันถัดไปเป็นวันหยุด Context.next.is_dayoff ต้องเป็น true
-- ---------------------------------------------------------------------------
select public.ta_get_night_sequence_context_v61437(
  '7889433','2026-08-10'::date
) as context_case_7889433_20260810;

-- ทดลอง Project กะดึก S135 ตามภาพ
-- หากวันก่อน = LV และวันถัดไป = วันหยุด/กะดึก/LV => allowed ต้องเป็น true
select public.ta_validate_night_sequence_bulk_v61437(
  jsonb_build_array(jsonb_build_object(
    'emp_code','7889433',
    'work_date','2026-08-10',
    'shift_code','S135',
    'proposed_start_time','19:30',
    'proposed_end_time','04:30'
  ))
) as projected_night_case_7889433_20260810;
