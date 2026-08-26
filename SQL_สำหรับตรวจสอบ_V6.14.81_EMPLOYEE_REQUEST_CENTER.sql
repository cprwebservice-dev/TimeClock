-- ================================================================
-- V6.14.81 Verification
-- ================================================================

select
  to_regclass('public.ta_employee_requests_v61481') is not null as request_table_ok,
  to_regclass('public.ta_employee_request_notifications_v61481') is not null as notification_table_ok,
  to_regclass('public.ta_employee_request_seq_v61481') is not null as request_sequence_ok;

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'ta_submit_employee_request_v61481',
    'ta_get_employee_requests_v61481',
    'ta_mark_employee_request_in_review_v61481',
    'ta_resolve_employee_request_v61481',
    'ta_decide_employee_request_v61481',
    'ta_cancel_employee_request_v61481',
    'ta_get_employee_request_notifications_v61481',
    'ta_mark_employee_request_notification_read_v61481',
    '_ta_request_manager_email_v61481'
  )
order by p.proname;

select
  user_id,
  email,
  role,
  emp_code,
  is_active
from public.ta_user_profiles
where user_id=auth.uid();

select
  count(*) filter (where request_type='TIME_ISSUE') as time_issue_rows,
  count(*) filter (where request_type='SPECIAL_WORK') as special_work_rows,
  count(*) filter (where status in ('PENDING','IN_REVIEW')) as active_rows,
  count(*) filter (where status='RESOLVED') as resolved_rows
from public.ta_employee_requests_v61481;

select
  count(*) as my_notification_rows,
  count(*) filter (where is_read=false) as my_unread_rows
from public.ta_employee_request_notifications_v61481
where target_user_id=auth.uid();
