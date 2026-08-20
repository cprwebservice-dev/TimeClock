-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.4
-- Schedule Save Performance / Single Recalculation
--
-- เป้าหมาย:
-- 1) ตัด Double Attendance Recalculation ในเส้นทาง Save กะ + Work Plan
-- 2) เขียน Shift + Daily Work Plan ก่อน แล้ว Recalculate เพียง 1 ครั้ง
-- 3) Day-off Quota Guard V6.14.3 ยังคงทำงานครบ
-- 4) เพิ่ม Index สำหรับ lookup รายพนักงาน/วันที่ที่ใช้ตอน Save
-- ============================================================================

begin;
set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- 1) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.ta_validate_dayoff_quota_v6143(text,date,text)') is null then
    raise exception 'MISSING_V6143: กรุณารัน SQL V6.14.3 ก่อน';
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
  if to_regprocedure('public._ta_refresh_attendance_calc_core_v630(date,date,text[])') is null then
    raise exception 'MISSING_FUNCTION: _ta_refresh_attendance_calc_core_v630';
  end if;
  if to_regclass('public.ta_daily_work_plans') is null then
    raise exception 'MISSING_TABLE: ta_daily_work_plans';
  end if;
  if to_regclass('public.ta_work_templates') is null then
    raise exception 'MISSING_TABLE: ta_work_templates';
  end if;
  if to_regclass('public.attendance_workday') is null then
    raise exception 'MISSING_TABLE: attendance_workday';
  end if;
  if to_regclass('public.ta_shift_schedule_rules_v6123') is null then
    raise exception 'MISSING_TABLE: ta_shift_schedule_rules_v6123';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Hot-path indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_attendance_workday_emp_date_v6144
  on public.attendance_workday(emp_code,work_date);

create index if not exists idx_shift_calendar_emp_date_v6144
  on public.shift_calendar(emp_code,work_date);

create index if not exists idx_shift_master_code_norm_v6144
  on public.shift_master((upper(trim(shift_code))));

create index if not exists idx_schedule_rule_off_code_norm_v6144
  on public.ta_shift_schedule_rules_v6123((upper(trim(paired_off_shift_code))))
  where paired_off_shift_code is not null;

-- ---------------------------------------------------------------------------
-- 3) Fast single-day Attendance recalculation helper
--    Uses exact emp_code + work_date index first. Normalized fallback is only
--    used for legacy rows whose employee code was stored in a non-canonical form.
-- ---------------------------------------------------------------------------
create or replace function public._ta_recalculate_single_after_schedule_v6144(
  p_emp_code text,
  p_work_date date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_has_attendance boolean := false;
  v_result jsonb;
begin
  if nullif(v_emp,'') is null then
    return jsonb_build_object(
      'recalculated',false,
      'deferred',true,
      'reason','NO_EMPLOYEE',
      'version','V6.14.4'
    );
  end if;

  if p_work_date is null then
    raise exception 'WORK_DATE_REQUIRED';
  end if;

  -- Fast path: normal data is already stored using the normalized employee code.
  select exists(
    select 1
    from public.attendance_workday aw
    where aw.emp_code=v_emp
      and aw.work_date=p_work_date
  ) into v_has_attendance;

  -- Compatibility fallback for old attendance rows only.
  if not v_has_attendance then
    select exists(
      select 1
      from public.attendance_workday aw
      where aw.work_date=p_work_date
        and public.normalize_emp_code(aw.emp_code)=v_emp
    ) into v_has_attendance;
  end if;

  if not v_has_attendance then
    return jsonb_build_object(
      'recalculated',true,
      'deferred',true,
      'reason','NO_ATTENDANCE_YET',
      'start_date',p_work_date,
      'end_date',p_work_date,
      'employee_count',1,
      'attendance_rows',0,
      'version','V6.14.4'
    );
  end if;

  v_result := public._ta_refresh_attendance_calc_core_v630(
    p_work_date,
    p_work_date,
    array[v_emp]::text[]
  );

  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object(
      'recalculated',true,
      'deferred',false,
      'employee_count',1,
      'attendance_rows',1,
      'recalculated_at',now(),
      'version','V6.14.4'
    );
end;
$$;

revoke all on function public._ta_recalculate_single_after_schedule_v6144(text,date) from public;

-- ---------------------------------------------------------------------------
-- 4) Optimized atomic Save: Shift + Work Plan + ONE Attendance recalculation
--    This intentionally does NOT call ta_assign_shift_single_v651 because that
--    function already recalculates Attendance. Calling it and recalculating again
--    after Work Plan caused the V6.14.3 double calculation.
-- ---------------------------------------------------------------------------
create or replace function public.ta_assign_shift_with_work_plan_v6144(
  p_emp_code text,
  p_work_date date,
  p_shift_code text,
  p_template_code text,
  p_customer_window_start time default null,
  p_customer_window_end time default null,
  p_customer_end_mode text default 'ACTUAL_OUT',
  p_note text default null,
  p_change_reason text default null,
  p_confirm_now boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_started_at timestamptz := clock_timestamp();
  v_guard_done_at timestamptz;
  v_write_done_at timestamptz;
  v_plan_done_at timestamptz;
  v_recalc_done_at timestamptz;

  v_emp text := public.normalize_emp_code(p_emp_code);
  v_shift text := nullif(upper(trim(coalesce(p_shift_code,''))), '');
  v_template text := upper(trim(coalesce(p_template_code,'')));
  v_pattern text;
  v_normal_template text;
  v_start_date date;
  v_end_mode text := upper(trim(coalesce(
    p_customer_end_mode,
    case when p_customer_window_end is null then 'ACTUAL_OUT' else 'FIXED' end
  )));
  v_customer_start time := p_customer_window_start;
  v_customer_end time := p_customer_window_end;
  v_auto_confirm boolean := v_shift is not null;

  v_guard jsonb;
  v_write jsonb;
  v_plan jsonb;
  v_recalc jsonb;
begin
  if nullif(v_emp,'') is null then raise exception 'EMP_CODE_REQUIRED'; end if;
  if p_work_date is null then raise exception 'WORK_DATE_REQUIRED'; end if;
  if v_shift is null then raise exception 'SHIFT_CODE_REQUIRED'; end if;

  -- Authoritative day-off quota check.
  v_guard := public.ta_validate_dayoff_quota_v6143(v_emp,p_work_date,v_shift);
  if coalesce((v_guard->>'allowed')::boolean,false)=false then
    raise exception 'DAYOFF_QUOTA_EXHAUSTED: %',
      coalesce(v_guard->>'message','วันหยุดคงเหลือไม่เพียงพอ');
  end if;
  v_guard_done_at := clock_timestamp();

  -- Same permission/start-date/pattern guards used by current Schedule Writer.
  perform public._ta_assert_not_manager_self_schedule_v61027(v_emp);

  v_start_date := public._ta_employee_start_date_v61025(v_emp);
  if v_start_date is not null and p_work_date < v_start_date then
    raise exception 'SHIFT_BEFORE_EMPLOYEE_START_DATE: % | % | %',
      v_emp,p_work_date,v_start_date;
  end if;

  if not public.ta_can_access_employee_v680(
    v_emp,
    p_work_date,
    case when v_auto_confirm then 'CONFIRM_SCHEDULE' else 'EDIT_SCHEDULE' end
  ) then
    raise exception 'SCHEDULE_EDIT_PERMISSION_DENIED';
  end if;

  v_pattern := public._ta_validate_shift_pattern_v651(
    v_emp,p_work_date,v_shift
  );
  v_pattern := upper(trim(coalesce(v_pattern,'')));
  if nullif(v_pattern,'') is null then
    raise exception 'WORK_PATTERN_NOT_FOUND';
  end if;

  -- Normalize legacy template names without calling the heavy range metadata RPC.
  if v_template in ('SINGLE_0830','SINGLE_0830_1730') then
    v_template := 'ST6';
  elsif v_template='SINGLE_0830_1800' then
    v_template := 'ST5';
  elsif v_template='EARLY_SPLIT_FLEX' then
    v_template := 'SPLIT_FLEX';
  end if;

  v_normal_template := case v_pattern
    when 'TECH_5D' then 'ST5'
    when 'TECH_6D' then 'ST6'
    else nullif(v_template,'')
  end;

  if nullif(v_template,'') is null then
    v_template := v_normal_template;
  end if;

  if nullif(v_template,'') is null then
    raise exception 'WORK_TEMPLATE_NOT_FOUND';
  end if;

  if v_normal_template is not null
     and v_template not in (v_normal_template,'SPLIT_FLEX') then
    raise exception
      'WORK_TEMPLATE_NOT_ALLOWED_FOR_PATTERN: pattern=% normal=% requested=%',
      v_pattern,v_normal_template,v_template;
  end if;

  if not exists (
    select 1
    from public.ta_work_templates t
    where upper(trim(t.template_code))=v_template
      and coalesce(t.is_active,true)
  ) then
    raise exception 'WORK_TEMPLATE_NOT_FOUND: %',v_template;
  end if;

  if v_template='SPLIT_FLEX' then
    if v_customer_start is null then
      raise exception 'CUSTOMER_WINDOW_START_REQUIRED_FOR_SPLIT_FLEX';
    end if;
    if v_end_mode not in ('ACTUAL_OUT','FIXED') then
      raise exception 'INVALID_CUSTOMER_END_MODE';
    end if;
    if v_end_mode='FIXED' then
      if v_customer_end is null then
        raise exception 'CUSTOMER_WINDOW_END_REQUIRED_FOR_FIXED_MODE';
      end if;
      if v_customer_start=v_customer_end then
        raise exception 'CUSTOMER_WINDOW_START_END_MUST_DIFFER';
      end if;
    else
      v_customer_end := null;
    end if;
  else
    v_end_mode := 'NONE';
    v_customer_start := null;
    v_customer_end := null;
  end if;

  -- Write shift once (no attendance calculation inside this helper).
  v_write := public._ta_write_shift_calendar_v61028(
    v_emp,
    p_work_date,
    v_shift,
    p_note,
    v_auto_confirm
  );
  v_write_done_at := clock_timestamp();

  -- Upsert Daily Work Plan BEFORE recalculation so Attendance sees final plan.
  insert into public.ta_daily_work_plans (
    emp_code,work_date,template_code,
    customer_window_start,customer_window_end,
    status,day_override_type,custom_segments,note,calculation_note,
    created_by,updated_by
  ) values (
    v_emp,p_work_date,v_template,
    v_customer_start,v_customer_end,
    case when v_auto_confirm then 'CONFIRMED' else 'PLANNED' end,
    null,null,nullif(trim(coalesce(p_note,'')),''),
    case
      when v_template='SPLIT_FLEX' and v_end_mode='ACTUAL_OUT'
        then 'V6.14.4 SPLIT_FLEX ACTUAL_OUT'
      when v_template='SPLIT_FLEX'
        then 'V6.14.4 SPLIT_FLEX FIXED'
      else 'V6.14.4 NORMAL'
    end,
    auth.uid(),auth.uid()
  )
  on conflict(emp_code,work_date)
  do update set
    template_code=excluded.template_code,
    customer_window_start=excluded.customer_window_start,
    customer_window_end=excluded.customer_window_end,
    status=excluded.status,
    day_override_type=null,
    custom_segments=null,
    note=excluded.note,
    calculation_note=excluded.calculation_note,
    updated_by=auth.uid(),
    updated_at=now();

  select to_jsonb(d)
  into v_plan
  from public.ta_daily_work_plans d
  where d.emp_code=v_emp
    and d.work_date=p_work_date
  limit 1;
  v_plan_done_at := clock_timestamp();

  -- Exactly ONE recalculation, after both final schedule inputs have been saved.
  v_recalc := public._ta_recalculate_single_after_schedule_v6144(
    v_emp,p_work_date
  );
  v_recalc_done_at := clock_timestamp();

  return coalesce(v_write,'{}'::jsonb)
    || jsonb_build_object(
      'work_plan',v_plan,
      'pattern_code',v_pattern,
      'employee_default_template_code',v_normal_template,
      'effective_work_template_code',v_template,
      'daily_template_override',(v_normal_template is not null and v_template<>v_normal_template),
      'customer_window_start',v_customer_start,
      'customer_window_end',v_customer_end,
      'customer_end_mode',v_end_mode,
      'template_locked',false,
      'auto_confirm_on_save',v_auto_confirm,
      'attendance_recalculation',v_recalc,
      'dayoff_quota_guard',v_guard,
      'performance',jsonb_build_object(
        'quota_guard_ms',round(extract(epoch from (v_guard_done_at-v_started_at))*1000,1),
        'schedule_write_ms',round(extract(epoch from (v_write_done_at-v_guard_done_at))*1000,1),
        'work_plan_ms',round(extract(epoch from (v_plan_done_at-v_write_done_at))*1000,1),
        'attendance_recalc_ms',round(extract(epoch from (v_recalc_done_at-v_plan_done_at))*1000,1),
        'total_ms',round(extract(epoch from (v_recalc_done_at-v_started_at))*1000,1)
      ),
      'single_recalculation',true,
      'version','V6.14.4'
    );
end;
$$;

revoke all on function public.ta_assign_shift_with_work_plan_v6144(
  text,date,text,text,time,time,text,text,text,boolean
) from public;

grant execute on function public.ta_assign_shift_with_work_plan_v6144(
  text,date,text,text,time,time,text,text,text,boolean
) to authenticated;

analyze public.attendance_workday;
analyze public.shift_calendar;
analyze public.ta_daily_work_plans;
analyze public.shift_master;

notify pgrst, 'reload schema';
commit;
