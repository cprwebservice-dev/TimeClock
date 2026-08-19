-- ==========================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.12.5
-- Schedule Consistency + Day-off Pattern + Calendar Performance
-- ==========================================================================

-- 1) ตรวจคู่กะทำงาน -> กะวันหยุด
select
  r.shift_code as work_shift_code,
  w.start_time as work_start,
  w.end_time as work_end,
  w.applicable_pattern_codes as work_patterns,
  r.paired_off_shift_code as off_shift_code,
  o.start_time as off_start,
  o.end_time as off_end,
  o.applicable_pattern_codes as off_patterns,
  o.is_workday as off_is_workday,
  case
    when r.paired_off_shift_code is null then 'NO_MAPPING'
    when o.shift_code is null then 'OFF_NOT_FOUND'
    when coalesce(o.is_workday,true) then 'OFF_IS_WORKDAY'
    when o.start_time is distinct from w.start_time
      or o.end_time is distinct from w.end_time then 'TIME_MISMATCH'
    when coalesce(o.applicable_pattern_codes,array[]::text[])
      is distinct from coalesce(w.applicable_pattern_codes,array[]::text[]) then 'PATTERN_MISMATCH'
    else 'OK'
  end as mapping_status
from public.ta_shift_schedule_rules_v6123 r
join public.shift_master w
  on upper(trim(w.shift_code))=upper(trim(r.shift_code))
left join public.shift_master o
  on upper(trim(o.shift_code))=upper(trim(r.paired_off_shift_code))
where coalesce(w.is_workday,true)=true
order by w.display_order nulls last,w.shift_code;

-- 2) ตรวจ 4 คู่หลัก
select
  p.work_code,
  p.off_code,
  case
    when w.shift_code is null then 'WORK_NOT_FOUND'
    when o.shift_code is null then 'OFF_NOT_FOUND'
    when coalesce(o.is_workday,true) then 'OFF_IS_WORKDAY'
    when o.start_time is distinct from w.start_time
      or o.end_time is distinct from w.end_time then 'TIME_MISMATCH'
    when coalesce(o.applicable_pattern_codes,array[]::text[])
      is distinct from coalesce(w.applicable_pattern_codes,array[]::text[]) then 'PATTERN_MISMATCH'
    else 'OK'
  end as status,
  w.applicable_pattern_codes as work_patterns,
  o.applicable_pattern_codes as off_patterns
from (values
  ('STD','OSTD'),
  ('S043','OS043'),
  ('S134','OS134'),
  ('S135','OS135')
) p(work_code,off_code)
left join public.shift_master w on upper(trim(w.shift_code))=p.work_code
left join public.shift_master o on upper(trim(o.shift_code))=p.off_code
order by p.work_code;

-- 3) ตรวจว่ากะวันหยุดที่ถูก Mapping ไม่มีข้อมูลเวลา/Pattern ผิดปกติ
select
  o.shift_code,
  o.shift_name,
  o.start_time,
  o.end_time,
  o.is_workday,
  o.is_active,
  o.applicable_pattern_codes
from public.ta_shift_schedule_rules_v6123 r
join public.shift_master o
  on upper(trim(o.shift_code))=upper(trim(r.paired_off_shift_code))
where r.paired_off_shift_code is not null
  and (
    o.start_time is null
    or o.end_time is null
    or coalesce(o.is_workday,true)=true
    or coalesce(cardinality(o.applicable_pattern_codes),0)=0
  )
order by o.shift_code;

-- 4) ตรวจ Index สำหรับ Calendar Scheduling Rules
select
  case when exists(
    select 1
    from pg_indexes
    where schemaname='public'
      and indexname='idx_ta_schedule_rule_assignments_emp_date_v6125'
  ) then 'PASS' else 'FAIL' end as schedule_rule_emp_date_index;

-- 5) ตรวจ RPC หลักที่หน้า Calendar ใช้บันทึกกะ
select
  case
    when to_regprocedure(
      'public.ta_assign_shift_with_work_plan_v61110(text,date,text,text,time,time,text,text,text,boolean)'
    ) is not null
     and to_regprocedure(
      'public.ta_assign_shift_single_v651(text,date,text,text,text,boolean)'
    ) is not null
    then 'PASS'
    else 'FAIL'
  end as schedule_save_rpc;
