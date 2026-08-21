-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.24
-- Bulk Schedule HTTP 500 / Double Recalculation Fix
--
-- เป้าหมาย:
-- 1) Bulk Schedule ยังคงตรวจ Day-off Quota / System Period / Manager-self /
--    Start Date / EDIT_SCHEDULE / Work Pattern ครบถ้วน
-- 2) ตัด Attendance recalculation ออกจาก transaction ที่เขียนกะแบบ Bulk
-- 3) ให้ Frontend V6.14.15+ เรียก ta_finalize_schedule_mutation_v61415
--    หลัง Scheduling Rule sync เป็นจุดคำนวณ Attendance เพียงจุดเดียว
-- 4) ลดโอกาส statement timeout / HTTP 500 ของ ta_assign_shifts_bulk_v6143
-- ============================================================================

begin;
set local statement_timeout = '0';

do $$
begin
  if to_regprocedure('public.ta_validate_dayoff_quota_bulk_v6143(jsonb)') is null then
    raise exception 'MISSING_V6.14.3: ta_validate_dayoff_quota_bulk_v6143';
  end if;
  if to_regprocedure('public._ta_assert_system_period_action_v6110(date,text)') is null then
    raise exception 'MISSING_FUNCTION: _ta_assert_system_period_action_v6110';
  end if;
  if to_regprocedure('public._ta_assert_not_manager_self_schedule_v61027(text)') is null then
    raise exception 'MISSING_FUNCTION: _ta_assert_not_manager_self_schedule_v61027';
  end if;
  if to_regprocedure('public._ta_employee_start_date_v61025(text)') is null then
    raise exception 'MISSING_FUNCTION: _ta_employee_start_date_v61025';
  end if;
  if to_regprocedure('public.ta_can_access_employee_v680(text,date,text)') is null then
    raise exception 'MISSING_FUNCTION: ta_can_access_employee_v680';
  end if;
  if to_regprocedure('public._ta_validate_shift_pattern_v651(text,date,text)') is null then
    raise exception 'MISSING_FUNCTION: _ta_validate_shift_pattern_v651';
  end if;
  if to_regprocedure('public._ta_write_shift_calendar_v61028(text,date,text,text,boolean)') is null then
    raise exception 'MISSING_FUNCTION: _ta_write_shift_calendar_v61028';
  end if;
  if to_regprocedure('public.ta_finalize_schedule_mutation_v61415(jsonb)') is null then
    raise exception 'MISSING_V6.14.15: ta_finalize_schedule_mutation_v61415';
  end if;
end;
$$;

create index if not exists idx_shift_calendar_emp_date_v61424
  on public.shift_calendar(emp_code,work_date);

-- ---------------------------------------------------------------------------
-- Canonical bulk schedule writer V6.14.24
--
-- IMPORTANT:
-- - This RPC intentionally DOES NOT recalculate Attendance.
-- - Frontend saves Scheduling Rule / Smart OFF after this write, then calls
--   ta_finalize_schedule_mutation_v61415 for exact employee/date pairs.
-- - This avoids recalculating before rule metadata is final and avoids the
--   duplicate recalculation inherited from ta_assign_shifts_bulk_v651.
-- ---------------------------------------------------------------------------
create or replace function public.ta_assign_shifts_bulk_v61424(
  p_rows jsonb,
  p_change_reason text default null,
  p_confirm_now boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_item jsonb;
  v_emp text;
  v_date date;
  v_shift text;
  v_note text;
  v_start_date date;
  v_guard jsonb;
  v_write jsonb;
  v_processed integer := 0;
  v_saved integer := 0;
  v_deleted integer := 0;
  v_min_date date;
  v_max_date date;
  v_emp_codes text[];
begin
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then
    raise exception 'SHIFT_ROWS_MUST_BE_ARRAY';
  end if;

  if jsonb_array_length(coalesce(p_rows,'[]'::jsonb)) = 0 then
    return jsonb_build_object(
      'processed_rows',0,
      'saved_rows',0,
      'deleted_rows',0,
      'attendance_recalculation_deferred',true,
      'version','V6.14.24'
    );
  end if;

  -- Day-off quota remains an authoritative whole-payload net projection.
  v_guard := public.ta_validate_dayoff_quota_bulk_v6143(p_rows);
  if coalesce((v_guard->>'allowed')::boolean,false)=false then
    raise exception 'DAYOFF_QUOTA_EXHAUSTED: %',
      coalesce(v_guard->'violations','[]'::jsonb)::text;
  end if;

  with parsed as (
    select
      public.normalize_emp_code(x.item->>'emp_code') as emp_code,
      nullif(x.item->>'work_date','')::date as work_date
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) x(item)
  )
  select
    min(work_date),
    max(work_date),
    coalesce(
      array_agg(distinct emp_code order by emp_code)
        filter(where nullif(emp_code,'') is not null),
      array[]::text[]
    )
  into v_min_date,v_max_date,v_emp_codes
  from parsed;

  -- Validate every row before any write: transaction stays atomic.
  for v_item in
    select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb))
  loop
    v_emp := public.normalize_emp_code(v_item->>'emp_code');
    v_date := nullif(v_item->>'work_date','')::date;
    v_shift := nullif(upper(trim(coalesce(v_item->>'shift_code',''))),'');

    if nullif(v_emp,'') is null then
      raise exception 'EMP_CODE_REQUIRED';
    end if;
    if v_date is null then
      raise exception 'WORK_DATE_REQUIRED: %',v_emp;
    end if;

    perform public._ta_assert_system_period_action_v6110(
      v_date,
      'SCHEDULE_EDIT'
    );

    perform public._ta_assert_not_manager_self_schedule_v61027(v_emp);

    if v_shift is not null then
      v_start_date := public._ta_employee_start_date_v61025(v_emp);
      if v_start_date is not null and v_date < v_start_date then
        raise exception 'SHIFT_BEFORE_EMPLOYEE_START_DATE: % | % | %',
          v_emp,v_date,v_start_date;
      end if;
    end if;

    if not public.ta_can_access_employee_v680(
      v_emp,
      v_date,
      'EDIT_SCHEDULE'
    ) then
      raise exception 'SCHEDULE_EDIT_PERMISSION_DENIED: % %',v_emp,v_date;
    end if;

    if v_shift is not null then
      perform public._ta_validate_shift_pattern_v651(
        v_emp,
        v_date,
        v_shift
      );
    end if;
  end loop;

  -- Write only after all rows have passed every guard.
  for v_item in
    select * from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb))
  loop
    v_emp := public.normalize_emp_code(v_item->>'emp_code');
    v_date := nullif(v_item->>'work_date','')::date;
    v_shift := nullif(upper(trim(coalesce(v_item->>'shift_code',''))),'');
    v_note := nullif(trim(coalesce(v_item->>'note','')),'');

    v_write := public._ta_write_shift_calendar_v61028(
      v_emp,
      v_date,
      v_shift,
      v_note,
      -- V6.11.17 behavior: any saved shift is confirmed immediately.
      (v_shift is not null) or coalesce(p_confirm_now,false)
    );

    v_processed := v_processed + 1;
    if v_shift is null then
      v_deleted := v_deleted + 1;
    else
      v_saved := v_saved + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'processed_rows',v_processed,
    'saved_rows',v_saved,
    'deleted_rows',v_deleted,
    'change_reason',p_change_reason,
    'auto_confirm_on_save',true,
    'access_mode','EDIT_SCHEDULE',
    'dayoff_quota_guard',v_guard,
    'start_date',v_min_date,
    'end_date',v_max_date,
    'employee_count',cardinality(coalesce(v_emp_codes,array[]::text[])),
    'attendance_recalculation_deferred',true,
    'finalizer_rpc','ta_finalize_schedule_mutation_v61415',
    'version','V6.14.24'
  );
end;
$$;

revoke all on function public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean) from public;
grant execute on function public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
