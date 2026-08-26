-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.14.82 - Employee Portal Foundation
-- ============================================================================

with checks as (
  select 1 seq,'portal_accounts_table' check_name,
    case when to_regclass('public.ta_employee_portal_accounts_v61482') is not null then 'PASS' else 'FAIL' end result,
    'Employee Portal accounts' detail
  union all
  select 2,'portal_sessions_table',case when to_regclass('public.ta_employee_portal_sessions_v61482') is not null then 'PASS' else 'FAIL' end,'Opaque session tokens'
  union all
  select 3,'portal_team_links_table',case when to_regclass('public.ta_employee_portal_team_links_v61482') is not null then 'PASS' else 'FAIL' end,'Manager team QR/link'
  union all
  select 4,'hr_bulk_rpc',case when to_regprocedure('public.ta_portal_admin_set_enabled_v61482(text[],boolean,text)') is not null then 'PASS' else 'FAIL' end,'HR bulk enable/disable'
  union all
  select 5,'manager_team_rpc',case when to_regprocedure('public.ta_portal_get_my_team_v61482()') is not null then 'PASS' else 'FAIL' end,'Manager team members'
  union all
  select 6,'activation_rpc',case when to_regprocedure('public.ta_portal_issue_activation_v61482(text,boolean)') is not null then 'PASS' else 'FAIL' end,'Activation Code / Reset PIN'
  union all
  select 7,'employee_activate_rpc',case when to_regprocedure('public.ta_portal_activate_v61482(text,text,text,text,text)') is not null then 'PASS' else 'FAIL' end,'Employee activates + creates PIN 6 digits'
  union all
  select 8,'employee_login_rpc',case when to_regprocedure('public.ta_portal_login_v61482(text,text,text,text)') is not null then 'PASS' else 'FAIL' end,'Employee ID + PIN login'
  union all
  select 9,'self_calendar_rpc',case when to_regprocedure('public.ta_portal_get_my_calendar_v61482(text,date,date)') is not null then 'PASS' else 'FAIL' end,'Self schedule/time only'
  union all
  select 10,'portal_request_rpc',case when to_regprocedure('public.ta_portal_submit_request_v61482(text,date,text,text,text,jsonb)') is not null then 'PASS' else 'FAIL' end,'Portal -> V6.14.81 Request Center'
  union all
  select 11,'request_source_columns',case when exists(select 1 from information_schema.columns where table_schema='public' and table_name='ta_employee_requests_v61481' and column_name='portal_account_id') and exists(select 1 from information_schema.columns where table_schema='public' and table_name='ta_employee_requests_v61481' and column_name='request_source') then 'PASS' else 'FAIL' end,'Portal requests link to account'
  union all
  select 12,'anon_portal_execute',case when has_function_privilege('anon','public.ta_portal_login_v61482(text,text,text,text)','EXECUTE') and has_function_privilege('anon','public.ta_portal_get_my_calendar_v61482(text,date,date)','EXECUTE') then 'PASS' else 'FAIL' end,'Anon can call token-protected Portal RPCs'
)
select * from checks order by seq;

-- Current installation summary
select
  count(*) filter(where is_enabled) as portal_enabled,
  count(*) filter(where is_enabled and pin_hash is not null) as activated,
  count(*) filter(where is_enabled and pin_hash is null) as waiting_activation,
  count(*) filter(where not is_enabled) as disabled
from public.ta_employee_portal_accounts_v61482;

-- Current HR/Manager profile used by management RPCs
select user_id,email,role,is_active,emp_code
from public.ta_user_profiles
where user_id=auth.uid();
