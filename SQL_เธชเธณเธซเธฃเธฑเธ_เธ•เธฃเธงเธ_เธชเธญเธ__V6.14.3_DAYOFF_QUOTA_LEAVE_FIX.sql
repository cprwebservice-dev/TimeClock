-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.3
-- ============================================================================

-- 1) ฟังก์ชัน V6.14.3 ต้องมีครบ
select
  case when to_regprocedure('public.ta_validate_dayoff_quota_v6143(text,date,text)') is not null then 'PASS' else 'FAIL' end as single_guard,
  case when to_regprocedure('public.ta_validate_dayoff_quota_bulk_v6143(jsonb)') is not null then 'PASS' else 'FAIL' end as bulk_guard,
  case when to_regprocedure('public.ta_assign_shift_single_v6143(text,date,text,text,text,boolean)') is not null then 'PASS' else 'FAIL' end as single_writer,
  case when to_regprocedure('public.ta_assign_shifts_bulk_v6143(jsonb,text,boolean)') is not null then 'PASS' else 'FAIL' end as bulk_writer,
  case when to_regprocedure('public.ta_assign_shift_with_work_plan_v6143(text,date,text,text,time,time,text,text,text,boolean)') is not null then 'PASS' else 'FAIL' end as plan_writer;

-- 2) ตรวจ Definition ว่าการคืนสิทธิ์/ไม่ใช้เพิ่มไม่ถูก Block
select
  case
    when pg_get_functiondef('public.ta_validate_dayoff_quota_v6143(text,date,text)'::regprocedure)
      ilike '%v_delta <= 0%'
    then 'PASS' else 'FAIL'
  end as return_dayoff_rule;

-- 3) Bulk ต้อง Block เฉพาะ balance_delta < 0 (ใช้เพิ่ม)
select
  case
    when pg_get_functiondef('public.ta_validate_dayoff_quota_bulk_v6143(jsonb)'::regprocedure)
      ilike '%balance_delta < 0%'
    then 'PASS' else 'FAIL'
  end as bulk_only_blocks_extra_use;

-- 4) LV/LEAVE ต้องไม่หัก Day-off quota
select
  case
    when public._ta_dayoff_consumes_quota_v6142('TEST',current_date,'LV') = false
     and public._ta_dayoff_consumes_quota_v6142('TEST',current_date,'LEAVE') = false
    then 'PASS' else 'FAIL'
  end as leave_does_not_consume_dayoff_quota;

-- 5) แสดงพนักงานที่ยอดติดลบเพื่อใช้ทดสอบเคส "หยุด -> กะทำงาน"
--    (ถ้าไม่มีข้อมูลจะคืน 0 แถว ไม่ถือว่า Error)
with months as (
  select distinct date_trunc('month',sc.work_date)::date as month_date
  from public.shift_calendar sc
  where sc.work_date >= current_date - interval '120 days'
), emps as (
  select distinct public.normalize_emp_code(sc.emp_code) as emp_code
  from public.shift_calendar sc
  where sc.work_date >= current_date - interval '120 days'
  limit 500
), balances as (
  select e.emp_code,m.month_date,public.ta_get_dayoff_balance_v6134(e.emp_code,m.month_date) as info
  from emps e cross join months m
)
select
  emp_code,
  month_date,
  (info->>'month_quota_days')::numeric as quota_days,
  (info->>'used_days')::numeric as used_days,
  (info->>'balance_days')::numeric as balance_days
from balances
where coalesce((info->>'balance_days')::numeric,0) < 0
order by month_date desc,balance_days asc
limit 20;
