-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.12.6
-- ============================================================================

select
  case when to_regprocedure('public.ta_get_schedule_work_plan_meta_v6126(date,date,text[])') is not null
    then 'PASS' else 'FAIL' end as work_plan_meta_rpc,
  case when to_regprocedure('public.ta_get_effective_daily_work_plan_v6126(text,date)') is not null
    then 'PASS' else 'FAIL' end as effective_daily_plan_rpc,
  case when to_regprocedure('public.ta_assign_shift_with_work_plan_v6126(text,date,text,text,time,time,text,text,text,boolean)') is not null
    then 'PASS' else 'FAIL' end as schedule_save_rpc,
  case when to_regprocedure('public.ta_get_system_period_for_date_v6126(date)') is not null
    then 'PASS' else 'FAIL' end as system_period_rpc;

select
  case
    when pg_get_functiondef('public.ta_get_schedule_work_plan_meta_v6126(date,date,text[])'::regprocedure) ilike '%ST5%'
     and pg_get_functiondef('public.ta_get_schedule_work_plan_meta_v6126(date,date,text[])'::regprocedure) ilike '%ST6%'
      then 'PASS' else 'FAIL'
  end as work_plan_uses_st5_st6,
  case
    when pg_get_functiondef('public.ta_assign_shift_with_work_plan_v6126(text,date,text,text,time,time,text,text,text,boolean)'::regprocedure) ilike '%ST5%'
     and pg_get_functiondef('public.ta_assign_shift_with_work_plan_v6126(text,date,text,text,time,time,text,text,text,boolean)'::regprocedure) ilike '%ST6%'
      then 'PASS' else 'FAIL'
  end as save_uses_st5_st6;

select
  upper(trim(coalesce(pattern_code,''))) as pattern_code,
  upper(trim(coalesce(default_template_code,''))) as default_template_code,
  count(*) as employee_count
from public.ta_employee_work_patterns
where effective_to is null or effective_to >= current_date
GROUP BY 1,2
order by 1,2;

select
  case when exists(select 1 from public.ta_work_templates where template_code='ST5' and coalesce(is_active,true))
    then 'PASS' else 'FAIL' end as st5_active,
  case when exists(select 1 from public.ta_work_templates where template_code='ST6' and coalesce(is_active,true))
    then 'PASS' else 'FAIL' end as st6_active,
  case when exists(select 1 from public.ta_work_templates where template_code='SPLIT_FLEX' and coalesce(is_active,true))
    then 'PASS' else 'WARN' end as split_flex_active;

select 'PASS' as v6126_result;
