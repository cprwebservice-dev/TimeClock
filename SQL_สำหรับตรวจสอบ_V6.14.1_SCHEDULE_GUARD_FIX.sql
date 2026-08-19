-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.1
-- ============================================================================

with checks as (
  select 1 as seq,'guard_rpc_v6141'::text as check_name,
    case when to_regprocedure('public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean)') is not null then 'PASS' else 'FAIL' end as result,
    'ta_validate_schedule_guard_v6141'::text as detail
  union all
  select 2,'uses_effective_schedule',
    case when pg_get_functiondef('public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean)'::regprocedure)
      ilike '%ta_get_schedule_range_light_v6134%' then 'PASS' else 'FAIL' end,
    '48h ต้องอ่าน Effective Schedule รวม Default Shift/Paired Day-off'
  union all
  select 3,'paired_dayoff_resets_continuity',
    case when pg_get_functiondef('public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean)'::regprocedure)
      ilike '%master_is_workday=false%' then 'PASS' else 'FAIL' end,
    'กะวันหยุด is_workday=false ต้อง reset ชั่วโมงต่อเนื่อง'
  union all
  select 4,'threshold_over_48h',
    case when pg_get_functiondef('public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean)'::regprocedure)
      ilike '%v_after>2880%' then 'PASS' else 'FAIL' end,
    'ครบ 48 ชม. ยังไม่เตือน; กะถัดไปที่ทำให้เกิน 48 ชม. จึง Warning'
  union all
  select 5,'minimum_rest_6h',
    case when pg_get_functiondef('public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean)'::regprocedure)
      ilike '%v_rest<360%' then 'PASS' else 'FAIL' end,
    'พักต่ำกว่า 360 นาทีต้อง Block'
  union all
  select 6,'authenticated_execute',
    case when has_function_privilege('authenticated','public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean)','EXECUTE') then 'PASS' else 'FAIL' end,
    'authenticated สามารถเรียก Guard RPC ได้'
)
select seq,check_name,result,detail from checks order by seq;

-- ตรวจประเภทกะวันหยุดที่ใช้ Reset ต่อเนื่อง
select shift_code,shift_name,start_time,end_time,is_workday,is_active
from public.shift_master
where upper(trim(shift_code)) in ('OSTD','OS043','OS134','OS135','OFF')
order by shift_code;
