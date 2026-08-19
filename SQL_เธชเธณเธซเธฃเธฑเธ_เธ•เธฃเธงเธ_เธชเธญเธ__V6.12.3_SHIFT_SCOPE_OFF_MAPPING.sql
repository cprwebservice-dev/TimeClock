-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.12.3
-- ============================================================================

-- 1) ตรวจ Mapping 4 กะหลัก
select
  r.shift_code as work_shift_code,
  w.shift_name as work_shift_name,
  w.start_time as work_start,
  w.end_time as work_end,
  r.paired_off_shift_code,
  o.shift_name as off_shift_name,
  o.start_time as off_start,
  o.end_time as off_end,
  case
    when o.shift_code is null then 'ไม่พบกะวันหยุด'
    when coalesce(o.is_workday,true)=true then 'กะปลายทางยังเป็นวันทำงาน'
    when w.start_time is distinct from o.start_time or w.end_time is distinct from o.end_time then 'เวลาไม่ตรงกัน'
    else 'OK'
  end as check_result
from public.ta_shift_schedule_rules_v6123 r
left join public.shift_master w on upper(w.shift_code)=upper(r.shift_code)
left join public.shift_master o on upper(o.shift_code)=upper(r.paired_off_shift_code)
where upper(r.shift_code) in ('STD','S043','S134','S135')
order by case upper(r.shift_code) when 'STD' then 1 when 'S043' then 2 when 'S134' then 3 when 'S135' then 4 else 9 end;

-- 2) ตรวจ Scope รายหน่วยงานของทุกกะทำงาน
select
  r.shift_code,
  r.is_enabled,
  r.scope_mode,
  coalesce(array_agg(s.scope_value order by s.scope_value) filter(where s.scope_value is not null),array[]::text[]) as departments,
  r.paired_off_shift_code
from public.ta_shift_schedule_rules_v6123 r
left join public.ta_shift_schedule_rule_scopes_v6123 s
  on upper(s.shift_code)=upper(r.shift_code) and s.scope_type='DEPARTMENT'
group by r.shift_code,r.is_enabled,r.scope_mode,r.paired_off_shift_code
order by r.shift_code;

-- 3) ตรวจว่ามี Mapping ที่ผิดช่วงเวลา/ผิดประเภทหรือไม่
select
  r.shift_code,
  r.paired_off_shift_code,
  w.start_time as work_start,
  w.end_time as work_end,
  o.start_time as off_start,
  o.end_time as off_end,
  o.is_workday as off_is_workday
from public.ta_shift_schedule_rules_v6123 r
join public.shift_master w on upper(w.shift_code)=upper(r.shift_code)
left join public.shift_master o on upper(o.shift_code)=upper(r.paired_off_shift_code)
where r.paired_off_shift_code is not null
  and (
    o.shift_code is null
    or coalesce(o.is_workday,true)=true
    or w.start_time is distinct from o.start_time
    or w.end_time is distinct from o.end_time
  );
