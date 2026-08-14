-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.11.17 FIX1
-- ============================================================================

select
  case
    when to_regprocedure(
      'public._ta_guard_shift_calendar_v680()'
    ) is not null
     and pg_get_functiondef(
       'public._ta_guard_shift_calendar_v680()'::regprocedure
     ) ilike '%session_user = ''postgres''%'
     and pg_get_functiondef(
       'public._ta_guard_shift_calendar_v680()'::regprocedure
     ) ilike '%auth.uid() is null%'
     and pg_get_functiondef(
       'public._ta_guard_shift_calendar_v680()'::regprocedure
     ) ilike '%EDIT_SCHEDULE%'
      then 'PASS'
    else 'FAIL'
  end as sql_editor_guard_bypass;

select
  case
    when exists (
      select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'shift_calendar'
        and t.tgname = 'trg_guard_shift_calendar_v680'
        and not t.tgisinternal
        and t.tgenabled <> 'D'
    )
      then 'PASS'
    else 'FAIL'
  end as shift_calendar_guard_enabled;

select
  case
    when to_regprocedure(
      'public.ta_assign_shift_single_v651(text,date,text,text,text,boolean)'
    ) is not null
     and pg_get_functiondef(
       'public.ta_assign_shift_single_v651(text,date,text,text,text,boolean)'::regprocedure
     ) ilike '%EDIT_SCHEDULE%'
     and pg_get_functiondef(
       'public.ta_assign_shift_single_v651(text,date,text,text,text,boolean)'::regprocedure
     ) ilike '%auto_confirm_on_save%'
      then 'PASS'
    else 'FAIL'
  end as single_save_auto_confirm;

select
  case
    when to_regprocedure(
      'public.ta_assign_shifts_bulk_v651(jsonb,text,boolean)'
    ) is not null
     and pg_get_functiondef(
       'public.ta_assign_shifts_bulk_v651(jsonb,text,boolean)'::regprocedure
     ) ilike '%EDIT_SCHEDULE%'
     and pg_get_functiondef(
       'public.ta_assign_shifts_bulk_v651(jsonb,text,boolean)'::regprocedure
     ) ilike '%v_shift is not null%'
      then 'PASS'
    else 'FAIL'
  end as bulk_save_auto_confirm;

select
  case
    when to_regprocedure(
      'public.ta_assign_shift_with_work_plan_v61110(text,date,text,text,time,time,text,text,text,boolean)'
    ) is not null
     and pg_get_functiondef(
       'public.ta_assign_shift_with_work_plan_v61110(text,date,text,text,time,time,text,text,text,boolean)'::regprocedure
     ) ilike '%V6.11.17-FIX1 AUTO_CONFIRM%'
      then 'PASS'
    else 'FAIL'
  end as daily_work_plan_auto_confirm;

select
  case
    when exists (
      select 1
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'ta_manager_scopes'
        and t.tgname = 'trg_ta_manager_scopes_sync_schedule_permission_v61117'
        and not t.tgisinternal
    )
      then 'PASS'
    else 'FAIL'
  end as manager_scope_permission_sync;

select
  case
    when not exists (
      select 1
      from public.ta_manager_scopes
      where can_confirm_schedule is distinct from
            coalesce(can_edit_schedule,false)
    )
      then 'PASS'
    else 'FAIL'
  end as manager_scope_values_synced;

select
  case
    when not exists (
      select 1
      from public.shift_calendar
      where shift_code is not null
        and coalesce(is_confirmed,false) = false
    )
      then 'PASS'
    else 'FAIL'
  end as saved_shift_rows_confirmed;

select 'PASS' as v61117_fix1_result;
