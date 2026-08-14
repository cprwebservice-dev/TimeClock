-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.11.16
-- Daily Work Template Flex
-- กะปกติเป็นค่าเริ่มต้นรายบุคคล + SPLIT_FLEX เป็น Daily Override รายวัน
-- ============================================================================

begin;

set local statement_timeout = '0';

do $$
begin
  if to_regclass('public.ta_employee_work_patterns') is null then
    raise exception 'MISSING_TABLE: ta_employee_work_patterns';
  end if;

  if to_regclass('public.ta_daily_work_plans') is null then
    raise exception 'MISSING_TABLE: ta_daily_work_plans';
  end if;

  if to_regprocedure(
    'public.ta_assign_employee_work_pattern(text,text,date,date,integer[],text,text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_assign_employee_work_pattern';
  end if;

  if to_regprocedure(
    'public.ta_get_schedule_work_plan_meta_v6118(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_get_schedule_work_plan_meta_v6118';
  end if;

  if to_regprocedure(
    'public.ta_assign_shift_single_v651(text,date,text,text,text,boolean)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_assign_shift_single_v651';
  end if;

  if to_regprocedure(
    'public._ta_recalculate_after_schedule_change_v61029(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_recalculate_after_schedule_change_v61029';
  end if;
end;
$$;


-- ============================================================================
-- 1) ปรับ Default ระดับพนักงานให้เป็น "กะปกติ" เท่านั้น
--    รายการ SPLIT_FLEX ที่เคยบันทึกไว้ใน ta_daily_work_plans จะยังคงอยู่
--    และทำหน้าที่เป็น Daily Override ของวันนั้นตามเดิม
-- ============================================================================

update public.ta_employee_work_patterns a
set default_template_code =
  case upper(trim(coalesce(a.pattern_code,'')))
    when 'TECH_5D' then 'SINGLE_0830_1800'
    when 'TECH_6D' then 'SINGLE_0830_1730'
    else a.default_template_code
  end
where upper(trim(coalesce(a.pattern_code,''))) in ('TECH_5D','TECH_6D')
  and a.default_template_code is distinct from
    case upper(trim(coalesce(a.pattern_code,'')))
      when 'TECH_5D' then 'SINGLE_0830_1800'
      when 'TECH_6D' then 'SINGLE_0830_1730'
      else a.default_template_code
    end;


-- ============================================================================
-- 2) Employee Work Pattern
--    Default Template ถูกกำหนดอัตโนมัติจาก 5D/6D
--    ไม่อนุญาตให้ SPLIT_FLEX กลายเป็น Default ทุกวันอีกต่อไป
-- ============================================================================

create or replace function
  public.ta_assign_employee_work_pattern_v61110(
    p_emp_code text,
    p_pattern_code text,
    p_effective_from date,
    p_effective_to date default null,
    p_override_weekly_off_dows integer[] default null,
    p_default_template_code text default null,
    p_note text default null
  )
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp text :=
    public.normalize_emp_code(p_emp_code);

  v_pattern text :=
    upper(trim(coalesce(p_pattern_code,'')));

  v_default_template text;

  v_email text :=
    nullif(
      trim(coalesce(auth.jwt()->>'email','')),
      ''
    );

  v_result jsonb;
begin
  v_default_template :=
    case v_pattern
      when 'TECH_5D' then 'SINGLE_0830_1800'
      when 'TECH_6D' then 'SINGLE_0830_1730'
      else upper(trim(coalesce(p_default_template_code,'')))
    end;

  if nullif(v_default_template,'') is null then
    raise exception 'EMPLOYEE_DEFAULT_TEMPLATE_NOT_FOUND';
  end if;

  perform public.ta_assign_employee_work_pattern(
    v_emp,
    p_pattern_code,
    p_effective_from,
    p_effective_to,
    p_override_weekly_off_dows,
    v_default_template,
    p_note
  );

  update public.ta_employee_work_patterns a
  set
    default_template_code = v_default_template,
    ui_saved_at = now(),
    ui_saved_by = auth.uid(),
    ui_saved_by_email = v_email
  where a.emp_code = v_emp
    and a.pattern_code = p_pattern_code
    and a.effective_from = p_effective_from;

  select to_jsonb(a)
  into v_result
  from public.ta_employee_work_patterns a
  where a.emp_code = v_emp
    and a.pattern_code = p_pattern_code
    and a.effective_from = p_effective_from
  order by a.ui_saved_at desc nulls last
  limit 1;

  return
    coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object(
      'saved_at', now(),
      'saved_by', auth.uid(),
      'saved_by_email', v_email,
      'default_template_code', v_default_template,
      'daily_template_selection', true,
      'version', 'V6.11.16'
    );
end;
$$;

revoke all on function
  public.ta_assign_employee_work_pattern_v61110(
    text,text,date,date,integer[],text,text
  )
from public;

grant execute on function
  public.ta_assign_employee_work_pattern_v61110(
    text,text,date,date,integer[],text,text
  )
to authenticated;


-- ============================================================================
-- 3) Schedule Save
--    รองรับพนักงานคนเดียวกัน:
--      - วันปกติ = SINGLE_0830_1730 / SINGLE_0830_1800 ตาม 6D/5D
--      - วันที่มีงานลูกค้าช่วงดึก = SPLIT_FLEX เฉพาะวันนั้น
-- ============================================================================

create or replace function
  public.ta_assign_shift_with_work_plan_v61110(
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
set search_path = public
as $$
declare
  v_emp text :=
    public.normalize_emp_code(p_emp_code);

  v_template text :=
    upper(trim(coalesce(p_template_code,'')));

  v_pattern text;
  v_employee_default text;
  v_normal_template text;

  v_end_mode text :=
    upper(
      trim(
        coalesce(
          p_customer_end_mode,
          case
            when p_customer_window_end is null then 'ACTUAL_OUT'
            else 'FIXED'
          end
        )
      )
    );

  v_customer_start time := p_customer_window_start;
  v_customer_end time := p_customer_window_end;

  v_shift_result jsonb;
  v_plan jsonb;
  v_recalc jsonb;
begin
  select
    m.pattern_code,
    m.employee_default_template_code
  into
    v_pattern,
    v_employee_default
  from public.ta_get_schedule_work_plan_meta_v6118(
    p_work_date,
    p_work_date,
    array[v_emp]::text[]
  ) m
  where m.emp_code = v_emp
    and m.work_date = p_work_date
  limit 1;

  if nullif(trim(coalesce(v_pattern,'')),'') is null then
    raise exception 'WORK_PATTERN_NOT_FOUND';
  end if;

  v_pattern := upper(trim(v_pattern));

  v_normal_template :=
    case v_pattern
      when 'TECH_5D' then 'SINGLE_0830_1800'
      when 'TECH_6D' then 'SINGLE_0830_1730'
      else upper(trim(coalesce(v_employee_default,'')))
    end;

  if v_template = 'SINGLE_0830' then
    v_template := v_normal_template;
  elsif v_template = 'EARLY_SPLIT_FLEX' then
    v_template := 'SPLIT_FLEX';
  end if;

  if nullif(v_template,'') is null then
    raise exception 'WORK_TEMPLATE_REQUIRED';
  end if;

  if v_template not in (v_normal_template,'SPLIT_FLEX') then
    raise exception
      'WORK_TEMPLATE_NOT_ALLOWED_FOR_PATTERN: pattern=% normal=% requested=%',
      v_pattern,
      v_normal_template,
      v_template;
  end if;

  if not exists (
    select 1
    from public.ta_work_templates t
    where upper(trim(t.template_code)) = v_template
      and coalesce(t.is_active,true)
  ) then
    raise exception 'WORK_TEMPLATE_NOT_FOUND: %', v_template;
  end if;

  if v_template = 'SPLIT_FLEX' then
    if v_customer_start is null then
      raise exception 'CUSTOMER_WINDOW_START_REQUIRED_FOR_SPLIT_FLEX';
    end if;

    if v_end_mode not in ('ACTUAL_OUT','FIXED') then
      raise exception 'INVALID_CUSTOMER_END_MODE';
    end if;

    if v_end_mode = 'FIXED' then
      if v_customer_end is null then
        raise exception 'CUSTOMER_WINDOW_END_REQUIRED_FOR_FIXED_MODE';
      end if;

      if v_customer_start = v_customer_end then
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

  -- Permission / Scope / Manager-self / Start Date / System Period
  -- ยังคงใช้ Guard เดิมจาก ta_assign_shift_single_v651
  v_shift_result :=
    public.ta_assign_shift_single_v651(
      v_emp,
      p_work_date,
      p_shift_code,
      p_note,
      p_change_reason,
      p_confirm_now
    );

  insert into public.ta_daily_work_plans (
    emp_code,
    work_date,
    template_code,
    customer_window_start,
    customer_window_end,
    status,
    day_override_type,
    custom_segments,
    note,
    calculation_note,
    created_by,
    updated_by
  )
  values (
    v_emp,
    p_work_date,
    v_template,
    v_customer_start,
    v_customer_end,
    case when p_confirm_now then 'CONFIRMED' else 'PLANNED' end,
    null,
    null,
    nullif(trim(coalesce(p_note,'')),''),
    case
      when v_template = 'SPLIT_FLEX' and v_end_mode = 'ACTUAL_OUT'
        then 'V6.11.16 DAILY_OVERRIDE SPLIT_FLEX ACTUAL_OUT'
      when v_template = 'SPLIT_FLEX'
        then 'V6.11.16 DAILY_OVERRIDE SPLIT_FLEX FIXED'
      else 'V6.11.16 DAILY_OVERRIDE NORMAL'
    end,
    auth.uid(),
    auth.uid()
  )
  on conflict(emp_code,work_date)
  do update set
    template_code = excluded.template_code,
    customer_window_start = excluded.customer_window_start,
    customer_window_end = excluded.customer_window_end,
    status = excluded.status,
    day_override_type = null,
    custom_segments = null,
    note = excluded.note,
    calculation_note = excluded.calculation_note,
    updated_by = auth.uid(),
    updated_at = now();

  select to_jsonb(d)
  into v_plan
  from public.ta_daily_work_plans d
  where d.emp_code = v_emp
    and d.work_date = p_work_date
  limit 1;

  v_recalc :=
    public._ta_recalculate_after_schedule_change_v61029(
      p_work_date,
      p_work_date,
      array[v_emp]::text[]
    );

  return
    coalesce(v_shift_result,'{}'::jsonb)
    || jsonb_build_object(
      'work_plan', v_plan,
      'pattern_code', v_pattern,
      'employee_default_template_code', v_normal_template,
      'effective_work_template_code', v_template,
      'daily_template_override', (v_template <> v_normal_template),
      'customer_window_start', v_customer_start,
      'customer_window_end', v_customer_end,
      'customer_end_mode', v_end_mode,
      'template_locked', false,
      'attendance_recalculation', v_recalc,
      'version', 'V6.11.16'
    );
end;
$$;

revoke all on function
  public.ta_assign_shift_with_work_plan_v61110(
    text,date,text,text,time,time,text,text,text,boolean
  )
from public;

grant execute on function
  public.ta_assign_shift_with_work_plan_v61110(
    text,date,text,text,time,time,text,text,text,boolean
  )
to authenticated;

commit;
