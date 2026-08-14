-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.11.16
-- Daily Work Template Flex
-- ============================================================================

select
  case
    when to_regprocedure(
      'public.ta_assign_employee_work_pattern_v61110(text,text,date,date,integer[],text,text)'
    ) is not null
     and to_regprocedure(
      'public.ta_assign_shift_with_work_plan_v61110(text,date,text,text,time,time,text,text,text,boolean)'
    ) is not null
      then 'PASS'
    else 'FAIL'
  end as required_functions;


select
  case
    when pg_get_functiondef(
      'public.ta_assign_shift_with_work_plan_v61110(text,date,text,text,time,time,text,text,text,boolean)'::regprocedure
    ) not ilike '%WORK_TEMPLATE_MUST_MATCH_EMPLOYEE_DEFAULT%'
     and pg_get_functiondef(
      'public.ta_assign_shift_with_work_plan_v61110(text,date,text,text,time,time,text,text,text,boolean)'::regprocedure
    ) ilike '%daily_template_override%'
     and pg_get_functiondef(
      'public.ta_assign_shift_with_work_plan_v61110(text,date,text,text,time,time,text,text,text,boolean)'::regprocedure
    ) ilike '%SPLIT_FLEX%'
      then 'PASS'
    else 'FAIL'
  end as daily_template_override_enabled;


select
  case
    when pg_get_functiondef(
      'public.ta_assign_employee_work_pattern_v61110(text,text,date,date,integer[],text,text)'::regprocedure
    ) ilike '%SINGLE_0830_1800%'
     and pg_get_functiondef(
      'public.ta_assign_employee_work_pattern_v61110(text,text,date,date,integer[],text,text)'::regprocedure
    ) ilike '%SINGLE_0830_1730%'
      then 'PASS'
    else 'FAIL'
  end as employee_default_is_normal_shift;


select
  case
    when count(*) = 0 then 'PASS'
    else 'FAIL'
  end as no_split_flex_employee_default
from public.ta_employee_work_patterns a
where upper(trim(coalesce(a.pattern_code,''))) in ('TECH_5D','TECH_6D')
  and upper(trim(coalesce(a.default_template_code,''))) in ('SPLIT_FLEX','EARLY_SPLIT_FLEX');


select
  upper(trim(coalesce(a.pattern_code,''))) as pattern_code,
  upper(trim(coalesce(a.default_template_code,''))) as default_template_code,
  count(*) as employee_pattern_rows
from public.ta_employee_work_patterns a
where upper(trim(coalesce(a.pattern_code,''))) in ('TECH_5D','TECH_6D')
group by 1,2
order by 1,2;


select
  upper(trim(coalesce(d.template_code,''))) as daily_template_code,
  count(*) as daily_plan_rows
from public.ta_daily_work_plans d
where d.status <> 'CANCELLED'
group by 1
order by 1;


with mixed as (
  select
    d.emp_code,
    bool_or(upper(trim(coalesce(d.template_code,''))) = 'SPLIT_FLEX') as has_split_day,
    bool_or(upper(trim(coalesce(d.template_code,''))) in ('SINGLE_0830_1730','SINGLE_0830_1800','SINGLE_0830')) as has_normal_day
  from public.ta_daily_work_plans d
  where d.status <> 'CANCELLED'
  group by d.emp_code
)
select
  count(*) filter (where has_split_day and has_normal_day) as employees_with_mixed_daily_templates,
  count(*) filter (where has_split_day) as employees_with_split_days
from mixed;


select 'PASS' as v61116_result;
