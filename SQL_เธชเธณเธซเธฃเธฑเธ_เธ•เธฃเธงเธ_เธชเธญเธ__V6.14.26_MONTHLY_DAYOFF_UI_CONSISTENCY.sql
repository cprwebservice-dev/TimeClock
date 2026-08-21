-- ==========================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.26
-- Monthly Personal Day-off UI Consistency
-- ไม่มี SQL Migration ใหม่ใน V6.14.26; ชุดนี้ตรวจ prerequisite จาก V6.14.25
-- ==========================================================================

with checks as (
  select 1 as seq,'canonical_dayoff_balance_v61425'::text as check_name,
    case when to_regprocedure('public.ta_get_dayoff_balance_v61425(text,date)') is not null then 'PASS' else 'FAIL' end as result,
    'MONTHLY PERSONAL KPI ใช้ used_days จาก function นี้'::text as detail

  union all
  select 2,'canonical_schedule_grid_v61425',
    case when to_regprocedure('public.ta_get_schedule_range_light_v61425(date,date,text,text,text[],text[])') is not null then 'PASS' else 'FAIL' end,
    'Person 15D / Full Month / Team / Time ใช้ Schedule Grid กลาง'

  union all
  select 3,'monthly_personal_dedicated_rpc_v6134',
    case when to_regprocedure('public.ta_get_employee_month_schedule_v6134(text,date,date)') is not null then 'PASS' else 'FAIL' end,
    'Dedicated Monthly Personal RPC ต้องมี; Frontend มี canonical fallback กรณี timeout'

  union all
  select 4,'legacy_grid_delegates_v61425',
    case when coalesce((
      select pg_get_functiondef(p.oid) ilike '%ta_get_schedule_range_light_v61425%'
      from pg_proc p
      where p.oid=to_regprocedure('public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])')
    ),false) then 'PASS' else 'FAIL' end,
    'Monthly Personal V6.13.4 Grid ต้อง delegate ไป canonical V6.14.25'

  union all
  select 5,'legacy_balance_delegates_v61425',
    case when coalesce((
      select pg_get_functiondef(p.oid) ilike '%ta_get_dayoff_balance_v61425%'
      from pg_proc p
      where p.oid=to_regprocedure('public.ta_get_dayoff_balance_v6134(text,date)')
    ),false) then 'PASS' else 'FAIL' end,
    'V6.14.3 quota guards ต้อง inherit V6.14.25 balance'

  union all
  select 6,'quota_consumption_config_driven',
    case when coalesce((
      select pg_get_functiondef(p.oid) ilike '%ta_resolve_employee_work_pattern_v651%'
         and pg_get_functiondef(p.oid) ilike '%weekly_off_dows%'
         and pg_get_functiondef(p.oid) not ilike '%manager_weekly_off_dows%'
         and pg_get_functiondef(p.oid) not ilike '%manager_position_pattern%'
      from pg_proc p
      where p.oid=to_regprocedure('public._ta_dayoff_consumes_quota_v6142(text,date,text)')
    ),false) then 'PASS' else 'FAIL' end,
    'Quota consumption ต้องใช้ Work Pattern ไม่ใช้ Position/PC'

  union all
  select 7,'authenticated_dayoff_balance_execute',
    case when to_regprocedure('public.ta_get_dayoff_balance_v61425(text,date)') is not null
      and has_function_privilege('authenticated',to_regprocedure('public.ta_get_dayoff_balance_v61425(text,date)'),'EXECUTE') then 'PASS' else 'FAIL' end,
    'ผู้ใช้หน้าจัดกะต้องเรียก canonical day-off balance ได้'

  union all
  select 8,'authenticated_monthly_personal_execute',
    case when to_regprocedure('public.ta_get_employee_month_schedule_v6134(text,date,date)') is not null
      and has_function_privilege('authenticated',to_regprocedure('public.ta_get_employee_month_schedule_v6134(text,date,date)'),'EXECUTE') then 'PASS' else 'FAIL' end,
    'ผู้ใช้ Monthly Personal ต้องเรียก dedicated RPC ได้'
)
select seq,check_name,result,detail
from checks
order by seq;
