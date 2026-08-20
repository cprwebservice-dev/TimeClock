-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.16
-- ============================================================================

with checks as (
  select 1 as seq,'employee_default_shift_column'::text as check_name,
    case when exists(
      select 1 from information_schema.columns
      where table_schema='public' and table_name='ta_employee_work_patterns'
        and column_name='default_shift_code'
    ) then 'PASS' else 'FAIL' end as result,
    'ta_employee_work_patterns.default_shift_code'::text as detail

  union all
  select 2,'canonical_shift_pairs',
    case when not exists(
      select 1 from public.ta_employee_work_patterns a
      where upper(trim(coalesce(a.pattern_code,'')))='TECH_5D'
        and nullif(trim(coalesce(a.default_shift_code,'')),'') is not null
        and upper(trim(a.default_shift_code)) not in ('STD','S134')
      union all
      select 1 from public.ta_employee_work_patterns a
      where upper(trim(coalesce(a.pattern_code,'')))='TECH_6D'
        and nullif(trim(coalesce(a.default_shift_code,'')),'') is not null
        and upper(trim(a.default_shift_code)) not in ('S043','S135')
    ) then 'PASS' else 'FAIL' end,
    '5D=STD/S134, 6D=S043/S135'

  union all
  select 3,'single_save_rpc',
    case when to_regprocedure(
      'public.ta_assign_employee_work_pattern_v61416(text,text,text,date,date,integer[],text)'
    ) is not null then 'PASS' else 'FAIL' end,
    'Single employee Work Pattern + default shift'

  union all
  select 4,'single_save_uses_edit_scope',
    case when pg_get_functiondef(
      'public.ta_assign_employee_work_pattern_v61416(text,text,text,date,date,integer[],text)'::regprocedure
    ) ilike '%ta_can_access_employee_v680%'
      and pg_get_functiondef(
      'public.ta_assign_employee_work_pattern_v61416(text,text,text,date,date,integer[],text)'::regprocedure
    ) ilike '%EDIT_SCHEDULE%'
    then 'PASS' else 'FAIL' end,
    'Pattern write uses canonical EDIT_SCHEDULE permission, not VIEW-only scope'

  union all
  select 5,'bulk_save_rpc',
    case when to_regprocedure(
      'public.ta_assign_employee_work_patterns_bulk_v61416(jsonb)'
    ) is not null then 'PASS' else 'FAIL' end,
    'Bulk employee Work Pattern assignment'

  union all
  select 6,'bulk_ui_reader',
    case when to_regprocedure(
      'public.ta_get_employee_pattern_default_shift_v61416(text[],date)'
    ) is not null
      and pg_get_functiondef(
      'public.ta_get_employee_pattern_default_shift_v61416(text[],date)'::regprocedure
    ) ilike '%effective_pattern%'
    then 'PASS' else 'FAIL' end,
    'Bulk UI reader returns effective 5D/6D + employee default shift'

  union all
  select 7,'schedule_uses_employee_default_shift',
    case when pg_get_functiondef(
      'public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])'::regprocedure
    ) ilike '%employee_default_shift_code%'
      and pg_get_functiondef(
      'public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])'::regprocedure
    ) ilike '%S134%'
      and pg_get_functiondef(
      'public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])'::regprocedure
    ) ilike '%S135%'
    then 'PASS' else 'FAIL' end,
    'Auto Schedule honors employee DAY/NIGHT preference'

  union all
  select 8,'legacy_resolver_consistent',
    case when pg_get_functiondef(
      'public.ta_resolve_employee_work_pattern_v651(text,date)'::regprocedure
    ) ilike '%default_shift_code%'
      and pg_get_functiondef(
      'public.ta_resolve_employee_work_pattern_v651(text,date)'::regprocedure
    ) ilike '%S134%'
      and pg_get_functiondef(
      'public.ta_resolve_employee_work_pattern_v651(text,date)'::regprocedure
    ) ilike '%S135%'
    then 'PASS' else 'FAIL' end,
    'Legacy resolver follows same employee default shift'

  union all
  select 9,'dayoff_pair_mapping',
    case when not exists(
      select 1
      from (values
        ('STD','OSTD'),('S043','OS043'),('S134','OS134'),('S135','OS135')
      ) x(work_code,off_code)
      left join public.ta_shift_schedule_rules_v6123 r
        on upper(trim(r.shift_code))=x.work_code
      left join public.shift_master o
        on upper(trim(o.shift_code))=x.off_code
      where upper(trim(coalesce(r.paired_off_shift_code,'')))<>x.off_code
         or o.shift_code is null
         or coalesce(o.is_active,false)=false
         or coalesce(o.is_workday,true)=true
    ) then 'PASS' else 'FAIL' end,
    'STD/OSTD, S043/OS043, S134/OS134, S135/OS135'

  union all
  select 10,'legacy_off_stays_disabled',
    case when not exists(
      select 1 from public.shift_master s
      where upper(trim(s.shift_code))='OFF' and coalesce(s.is_active,true)
    ) then 'PASS' else 'CHECK' end,
    'OFF must remain disabled'

  union all
  select 11,'authenticated_execute',
    case when has_function_privilege(
      'authenticated','public.ta_assign_employee_work_patterns_bulk_v61416(jsonb)','EXECUTE'
    ) and has_function_privilege(
      'authenticated','public.ta_get_employee_pattern_default_shift_v61416(text[],date)','EXECUTE'
    ) then 'PASS' else 'FAIL' end,
    'Frontend can execute Bulk save/read RPCs'
)
select seq,check_name,result,detail
from checks
order by seq;

select
  a.emp_code,
  a.pattern_code,
  a.default_shift_code,
  case when upper(trim(coalesce(a.default_shift_code,''))) in ('S134','S135')
    then 'NIGHT' else 'DAY' end as shift_period,
  a.effective_from,
  a.effective_to,
  a.ui_saved_by_email,
  a.ui_saved_at
from public.ta_employee_work_patterns a
where upper(trim(coalesce(a.pattern_code,''))) in ('TECH_5D','TECH_6D')
order by coalesce(a.ui_saved_at,a.updated_at,a.created_at) desc nulls last
limit 30;
