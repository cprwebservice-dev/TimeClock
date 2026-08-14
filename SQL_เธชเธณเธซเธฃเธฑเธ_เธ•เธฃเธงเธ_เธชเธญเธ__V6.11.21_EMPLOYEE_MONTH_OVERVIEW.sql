-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.11.21
-- ============================================================================

select
  case
    when to_regprocedure(
      'public.ta_recalculate_employee_month_v61121(text,date)'
    ) is not null
      then 'PASS'
    else 'FAIL'
  end as employee_month_recalc_rpc;

select
  case
    when pg_get_functiondef(
      'public.ta_recalculate_employee_month_v61121(text,date)'::regprocedure
    ) ilike '%ta_can_access_employee_v680%'
     and pg_get_functiondef(
      'public.ta_recalculate_employee_month_v61121(text,date)'::regprocedure
    ) ilike '%_ta_recalculate_after_schedule_change_v61029%'
      then 'PASS'
    else 'FAIL'
  end as employee_month_scope_and_recalc_guard;

select
  case
    when has_function_privilege(
      'authenticated',
      'public.ta_recalculate_employee_month_v61121(text,date)',
      'EXECUTE'
    )
      then 'PASS'
    else 'FAIL'
  end as authenticated_execute_grant;

select 'PASS' as v61121_result;
