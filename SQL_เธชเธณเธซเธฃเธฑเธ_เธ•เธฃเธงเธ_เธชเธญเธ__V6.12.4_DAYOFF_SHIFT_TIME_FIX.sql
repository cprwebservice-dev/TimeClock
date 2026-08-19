-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.12.4
-- ============================================================================

-- 1. ตรวจ 4 คู่กะทำงาน / กะวันหยุด
with shift_pair(work_code,off_code) as (
  values
    ('STD','OSTD'),
    ('S043','OS043'),
    ('S134','OS134'),
    ('S135','OS135')
)
select
  p.work_code,
  w.start_time as work_start,
  w.end_time as work_end,
  p.off_code,
  o.start_time as off_start,
  o.end_time as off_end,
  o.is_workday as off_is_workday,
  case
    when w.shift_code is null then 'ไม่พบกะทำงาน'
    when o.shift_code is null then 'ไม่พบกะวันหยุด'
    when coalesce(o.is_workday,true) then 'กะวันหยุดยังถูกตั้งเป็นวันทำงาน'
    when o.start_time is distinct from w.start_time or o.end_time is distinct from w.end_time then 'เวลาไม่ตรง'
    else 'OK'
  end as check_result
from shift_pair p
left join public.shift_master w on upper(w.shift_code)=p.work_code
left join public.shift_master o on upper(o.shift_code)=p.off_code
order by p.work_code;

-- 2. ตรวจ Mapping ที่บันทึกใน Set Up
select
  r.shift_code as work_shift,
  r.paired_off_shift_code as off_shift,
  w.start_time as work_start,
  w.end_time as work_end,
  o.start_time as off_start,
  o.end_time as off_end,
  o.is_workday as off_is_workday,
  case
    when r.paired_off_shift_code is null then 'ยังไม่จับคู่'
    when o.shift_code is null then 'ไม่พบกะวันหยุด'
    when coalesce(o.is_workday,true) then 'ไม่ใช่กะวันหยุด'
    when o.start_time is distinct from w.start_time or o.end_time is distinct from w.end_time then 'เวลาไม่ตรง'
    else 'OK'
  end as pair_status
from public.ta_shift_schedule_rules_v6123 r
join public.shift_master w on upper(w.shift_code)=upper(r.shift_code)
left join public.shift_master o on upper(o.shift_code)=upper(r.paired_off_shift_code)
where r.paired_off_shift_code is not null
order by r.shift_code;

-- 3. ตรวจว่ามีกะวันหยุดใดที่ยังไม่มีเวลา
select shift_code,shift_name,start_time,end_time,is_workday,is_night_shift,is_active
from public.shift_master
where coalesce(is_workday,true)=false
  and (start_time is null or end_time is null)
order by shift_code;

-- 4. ตรวจ Function V6.12.4
select p.proname
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('ta_force_dayoff_shift_time_v6124','ta_sync_paired_off_for_work_shift_v6124')
order by p.proname;
