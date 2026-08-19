-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.2
-- Day-off Quota Hard Guard
-- ============================================================================

begin;
set local statement_timeout = '0';

-- 1) Installation
select
  case when to_regprocedure('public._ta_dayoff_consumes_quota_v6142(text,date,text)') is not null then 'PASS' else 'FAIL' end as quota_classifier,
  case when to_regprocedure('public.ta_validate_dayoff_quota_v6142(text,date,text)') is not null then 'PASS' else 'FAIL' end as single_guard,
  case when to_regprocedure('public.ta_validate_dayoff_quota_bulk_v6142(jsonb)') is not null then 'PASS' else 'FAIL' end as bulk_guard,
  case when to_regprocedure('public.ta_assign_shift_single_v6142(text,date,text,text,text,boolean)') is not null then 'PASS' else 'FAIL' end as single_writer,
  case when to_regprocedure('public.ta_assign_shifts_bulk_v6142(jsonb,text,boolean)') is not null then 'PASS' else 'FAIL' end as bulk_writer,
  case when to_regprocedure('public.ta_assign_shift_with_work_plan_v6142(text,date,text,text,time,time,text,text,text,boolean)') is not null then 'PASS' else 'FAIL' end as work_plan_writer;

-- 2) Confirm paired day-off shifts remain non-working and OFF remains disabled.
select
  upper(trim(s.shift_code)) as shift_code,
  s.is_active,
  s.is_workday,
  s.start_time,
  s.end_time,
  case
    when upper(trim(s.shift_code))='OFF' and coalesce(s.is_active,false)=false then 'PASS'
    when upper(trim(s.shift_code)) in ('OSTD','OS043','OS134','OS135') and coalesce(s.is_workday,true)=false then 'PASS'
    else 'CHECK'
  end as result
from public.shift_master s
where upper(trim(s.shift_code)) in ('OFF','OSTD','OS043','OS134','OS135')
order by shift_code;

-- SQL Editor does not carry the web JWT. Simulate one active HR_ADMIN only
-- inside this transaction so the read-only quota sample can execute.
do $$
declare
  v_user_id uuid;
  v_role text;
  v_email text;
begin
  select p.user_id,p.role,p.email
  into v_user_id,v_role,v_email
  from public.ta_user_profiles p
  where coalesce(p.is_active,false)
    and upper(trim(coalesce(p.role,'')))='HR_ADMIN'
  order by p.user_id
  limit 1;

  if v_user_id is not null then
    perform set_config('request.jwt.claim.sub',v_user_id::text,true);
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object(
        'sub',v_user_id::text,
        'role','authenticated',
        'email',coalesce(v_email,''),
        'user_metadata',jsonb_build_object('role',coalesce(v_role,'HR_ADMIN'))
      )::text,
      true
    );
  end if;
end;
$$;

-- 3) Current employees with zero/negative remaining quota (sample for UI test).
with active_emp as (
  select distinct public.normalize_emp_code(e."EmployeeId") as emp_code
  from public.employees e
  where public.normalize_emp_code(e."EmployeeId") is not null
  limit 300
), balances as (
  select
    a.emp_code,
    public.ta_get_dayoff_balance_v6134(a.emp_code,current_date) as b
  from active_emp a
)
select
  emp_code,
  b->>'month' as month,
  b->>'month_quota_days' as quota_days,
  b->>'used_days' as used_days,
  b->>'carried_in_days' as carried_in_days,
  b->>'balance_days' as balance_days,
  case when coalesce(nullif(b->>'balance_days','')::numeric,0)<=0 then 'TEST BLOCK DAY-OFF' else 'HAS BALANCE' end as test_status
from balances
where b->>'status'='ACTIVE'
order by coalesce(nullif(b->>'balance_days','')::numeric,0),emp_code
limit 30;

-- 4) Function definitions must call V6.14.2 quota guard before legacy writers.
select
  case when pg_get_functiondef('public.ta_assign_shift_single_v6142(text,date,text,text,text,boolean)'::regprocedure)
       ilike '%ta_validate_dayoff_quota_v6142%' then 'PASS' else 'FAIL' end as single_guard_before_write,
  case when pg_get_functiondef('public.ta_assign_shifts_bulk_v6142(jsonb,text,boolean)'::regprocedure)
       ilike '%ta_validate_dayoff_quota_bulk_v6142%' then 'PASS' else 'FAIL' end as bulk_guard_before_write,
  case when pg_get_functiondef('public.ta_assign_shift_with_work_plan_v6142(text,date,text,text,time,time,text,text,text,boolean)'::regprocedure)
       ilike '%ta_validate_dayoff_quota_v6142%' then 'PASS' else 'FAIL' end as work_plan_guard_before_write;

rollback;
