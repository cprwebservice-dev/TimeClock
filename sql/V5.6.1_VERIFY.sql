-- =============================================================
-- Time-Clock Enterprise V5.6.1 — Verification only
-- This script does not change business data.
-- =============================================================

-- 1) Confirm the exact RPC signatures found by PostgREST.
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as return_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'ta_assign_shift_single',
    'ta_assign_shifts_bulk',
    'ta_delete_shift_assignments_bulk',
    'ta_upsert_shift_master',
    'ta_get_review_queue'
  )
order by p.proname, identity_arguments;

-- 2) Confirm required compatibility columns.
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'shift_calendar' and column_name in ('is_confirmed','confirmed_at','confirmed_by','change_reason'))
    or (table_name = 'shift_master' and column_name in ('sort_order','display_order','note'))
  )
order by table_name, ordinal_position;

-- 3) Confirm quick-shift codes used by the current web UI.
select shift_code, shift_name, is_workday, is_active,
       coalesce(display_order, sort_order, 0) as display_order
from public.shift_master
where shift_code in ('D','N','OFF','HOL','LV')
order by coalesce(display_order, sort_order, 0), shift_code;

-- 4) Confirm Review Queue returns without an RPC/schema-cache error.
select count(*) as review_rows_last_31_days
from public.ta_get_review_queue(
  current_date - 30,
  current_date,
  null::text,
  null::text,
  null::text[],
  null::text[]
);

-- 5) Recent assignment audit records, if any assignments were tested.
select emp_code, work_date, old_shift_code, new_shift_code,
       action_type, confirm_now, changed_by_email, changed_at
from public.ta_shift_assignment_audit
order by changed_at desc
limit 20;
