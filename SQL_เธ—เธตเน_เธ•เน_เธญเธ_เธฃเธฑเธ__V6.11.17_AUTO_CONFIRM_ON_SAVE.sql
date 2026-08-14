-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.11.17
-- Save Shift = Confirm Automatically
-- ============================================================================

begin;

set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- 1) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.shift_calendar') is null then
    raise exception 'MISSING_TABLE: shift_calendar';
  end if;

  if to_regclass('public.ta_manager_scopes') is null then
    raise exception 'MISSING_TABLE: ta_manager_scopes';
  end if;

  if to_regprocedure(
    'public._ta_write_shift_calendar_v61028(text,date,text,text,boolean)'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_write_shift_calendar_v61028';
  end if;

  if to_regprocedure(
    'public._ta_recalculate_after_schedule_change_v61029(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_recalculate_after_schedule_change_v61029';
  end if;

  if to_regprocedure(
    'public.ta_assign_shift_with_work_plan_v61110(text,date,text,text,time,time,text,text,text,boolean)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_assign_shift_with_work_plan_v61110';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Manager Scope
--    การบันทึกกะและการยืนยันเป็นขั้นตอนเดียวกันแล้ว
--    can_confirm_schedule จะ sync ตาม can_edit_schedule เพื่อรองรับ RPC รุ่นเดิม
-- ---------------------------------------------------------------------------
create or replace function
  public._ta_sync_schedule_permission_v61117()
returns trigger
language plpgsql
as $$
begin
  new.can_confirm_schedule :=
    coalesce(new.can_edit_schedule,false);
  return new;
end;
$$;

drop trigger if exists
  trg_ta_manager_scopes_sync_schedule_permission_v61117
on public.ta_manager_scopes;

create trigger
  trg_ta_manager_scopes_sync_schedule_permission_v61117
before insert or update of
  can_edit_schedule,
  can_confirm_schedule
on public.ta_manager_scopes
for each row
execute function
  public._ta_sync_schedule_permission_v61117();

update public.ta_manager_scopes
set
  can_confirm_schedule =
    coalesce(can_edit_schedule,false)
where can_confirm_schedule is distinct from
  coalesce(can_edit_schedule,false);

-- ---------------------------------------------------------------------------
-- 3) Single Shift Save
--    ถ้ามี shift_code = ผู้ใช้กดบันทึกกะ -> Confirm ทันทีเสมอ
--    ใช้สิทธิ์ EDIT_SCHEDULE เป็นสิทธิ์เดียวสำหรับการจัดกะ
-- ---------------------------------------------------------------------------
create or replace function
  public.ta_assign_shift_single_v651(
    p_emp_code text,
    p_work_date date,
    p_shift_code text,
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

  v_start_date date;
  v_pattern text;
  v_write jsonb;
  v_recalc jsonb;
  v_auto_confirm boolean :=
    nullif(trim(coalesce(p_shift_code,'')),'') is not null;
begin
  perform public._ta_assert_system_period_action_v6110(
    p_work_date,
    'SCHEDULE_EDIT'
  );

  perform public._ta_assert_not_manager_self_schedule_v61027(
    v_emp
  );

  v_start_date :=
    public._ta_employee_start_date_v61025(v_emp);

  if p_shift_code is not null
     and v_start_date is not null
     and p_work_date < v_start_date then
    raise exception
      'SHIFT_BEFORE_EMPLOYEE_START_DATE: % | % | %',
      v_emp,
      p_work_date,
      v_start_date;
  end if;

  if not public.ta_can_access_employee_v680(
    v_emp,
    p_work_date,
    'EDIT_SCHEDULE'
  ) then
    raise exception 'SCHEDULE_EDIT_PERMISSION_DENIED';
  end if;

  if nullif(trim(coalesce(p_shift_code,'')),'') is not null then
    v_pattern :=
      public._ta_validate_shift_pattern_v651(
        v_emp,
        p_work_date,
        p_shift_code
      );
  end if;

  v_write :=
    public._ta_write_shift_calendar_v61028(
      v_emp,
      p_work_date,
      p_shift_code,
      p_note,
      v_auto_confirm
    );

  v_recalc :=
    public._ta_recalculate_after_schedule_change_v61029(
      p_work_date,
      p_work_date,
      array[v_emp]::text[]
    );

  return
    v_write
    || jsonb_build_object(
      'pattern_code',v_pattern,
      'start_date',v_start_date,
      'change_reason',p_change_reason,
      'auto_confirm_on_save',v_auto_confirm,
      'access_mode','EDIT_SCHEDULE',
      'version','V6.11.17',
      'attendance_recalculation',v_recalc
    );
end;
$$;

revoke all on function
  public.ta_assign_shift_single_v651(
    text,date,text,text,text,boolean
  )
from public;

grant execute on function
  public.ta_assign_shift_single_v651(
    text,date,text,text,text,boolean
  )
to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Bulk Shift Save
--    Quick Shift / Paste / Fill / Pattern = Save แล้ว Confirm ทันที
-- ---------------------------------------------------------------------------
create or replace function
  public.ta_assign_shifts_bulk_v651(
    p_rows jsonb,
    p_change_reason text default null,
    p_confirm_now boolean default false
  )
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_emp text;
  v_date date;
  v_shift text;
  v_note text;
  v_start_date date;

  v_processed integer := 0;
  v_saved integer := 0;
  v_deleted integer := 0;

  v_write jsonb;
  v_recalc jsonb;

  v_min_date date;
  v_max_date date;
  v_emp_codes text[];
begin
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then
    raise exception 'SHIFT_ROWS_MUST_BE_ARRAY';
  end if;

  with parsed as (
    select
      public.normalize_emp_code(x.item->>'emp_code') as emp_code,
      (x.item->>'work_date')::date as work_date
    from jsonb_array_elements(
      coalesce(p_rows,'[]'::jsonb)
    ) x(item)
  )
  select
    min(work_date),
    max(work_date),
    coalesce(
      array_agg(distinct emp_code order by emp_code)
        filter (where nullif(emp_code,'') is not null),
      array[]::text[]
    )
  into
    v_min_date,
    v_max_date,
    v_emp_codes
  from parsed;

  -- Validate ทุกแถวก่อนเขียนจริง
  for v_item in
    select *
    from jsonb_array_elements(
      coalesce(p_rows,'[]'::jsonb)
    )
  loop
    v_emp :=
      public.normalize_emp_code(v_item->>'emp_code');

    v_date :=
      (v_item->>'work_date')::date;

    v_shift :=
      nullif(
        upper(trim(coalesce(v_item->>'shift_code',''))),
        ''
      );

    perform public._ta_assert_system_period_action_v6110(
      v_date,
      'SCHEDULE_EDIT'
    );

    perform public._ta_assert_not_manager_self_schedule_v61027(
      v_emp
    );

    if v_shift is not null then
      v_start_date :=
        public._ta_employee_start_date_v61025(v_emp);

      if v_start_date is not null
         and v_date < v_start_date then
        raise exception
          'SHIFT_BEFORE_EMPLOYEE_START_DATE: % | % | %',
          v_emp,
          v_date,
          v_start_date;
      end if;
    end if;

    if not public.ta_can_access_employee_v680(
      v_emp,
      v_date,
      'EDIT_SCHEDULE'
    ) then
      raise exception
        'SCHEDULE_EDIT_PERMISSION_DENIED: % %',
        v_emp,
        v_date;
    end if;

    if v_shift is not null then
      perform public._ta_validate_shift_pattern_v651(
        v_emp,
        v_date,
        v_shift
      );
    end if;
  end loop;

  -- เขียนหลังจาก validate ผ่านทั้งหมด
  for v_item in
    select *
    from jsonb_array_elements(
      coalesce(p_rows,'[]'::jsonb)
    )
  loop
    v_emp :=
      public.normalize_emp_code(v_item->>'emp_code');

    v_date :=
      (v_item->>'work_date')::date;

    v_shift :=
      nullif(
        upper(trim(coalesce(v_item->>'shift_code',''))),
        ''
      );

    v_note :=
      nullif(v_item->>'note','');

    v_write :=
      public._ta_write_shift_calendar_v61028(
        v_emp,
        v_date,
        v_shift,
        v_note,
        v_shift is not null
      );

    v_processed := v_processed + 1;

    if v_shift is null then
      v_deleted := v_deleted + 1;
    else
      v_saved := v_saved + 1;
    end if;
  end loop;

  if v_processed > 0 then
    v_recalc :=
      public._ta_recalculate_after_schedule_change_v61029(
        v_min_date,
        v_max_date,
        v_emp_codes
      );
  else
    v_recalc :=
      jsonb_build_object(
        'recalculated',false,
        'reason','NO_ROWS',
        'version','V6.11.17'
      );
  end if;

  return jsonb_build_object(
    'processed_rows',v_processed,
    'saved_rows',v_saved,
    'deleted_rows',v_deleted,
    'change_reason',p_change_reason,
    'auto_confirm_on_save',true,
    'access_mode','EDIT_SCHEDULE',
    'version','V6.11.17',
    'attendance_recalculation',v_recalc
  );
end;
$$;

revoke all on function
  public.ta_assign_shifts_bulk_v651(
    jsonb,text,boolean
  )
from public;

grant execute on function
  public.ta_assign_shifts_bulk_v651(
    jsonb,text,boolean
  )
to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Daily Work Plan Save
--    Popup กำหนดกะ: บันทึกแล้ว CONFIRMED ทันที
-- ---------------------------------------------------------------------------
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
  v_auto_confirm boolean :=
    nullif(trim(coalesce(p_shift_code,'')),'') is not null;
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
    raise exception 'WORK_TEMPLATE_NOT_FOUND: %',v_template;
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

  v_shift_result :=
    public.ta_assign_shift_single_v651(
      v_emp,
      p_work_date,
      p_shift_code,
      p_note,
      p_change_reason,
      v_auto_confirm
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
    case when v_auto_confirm then 'CONFIRMED' else 'PLANNED' end,
    null,
    null,
    nullif(trim(coalesce(p_note,'')),''),
    case
      when v_template = 'SPLIT_FLEX' and v_end_mode = 'ACTUAL_OUT'
        then 'V6.11.17 AUTO_CONFIRM SPLIT_FLEX ACTUAL_OUT'
      when v_template = 'SPLIT_FLEX'
        then 'V6.11.17 AUTO_CONFIRM SPLIT_FLEX FIXED'
      else 'V6.11.17 AUTO_CONFIRM NORMAL'
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
      'work_plan',v_plan,
      'pattern_code',v_pattern,
      'employee_default_template_code',v_normal_template,
      'effective_work_template_code',v_template,
      'daily_template_override',(v_template <> v_normal_template),
      'customer_window_start',v_customer_start,
      'customer_window_end',v_customer_end,
      'customer_end_mode',v_end_mode,
      'template_locked',false,
      'auto_confirm_on_save',v_auto_confirm,
      'attendance_recalculation',v_recalc,
      'version','V6.11.17'
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

-- ---------------------------------------------------------------------------
-- 6) Migrate รายการที่เคยบันทึกไว้แต่ค้างสถานะไม่ยืนยัน
-- ---------------------------------------------------------------------------
update public.shift_calendar
set
  is_confirmed = true,
  confirmed_at = coalesce(confirmed_at,updated_at,created_at,now()),
  confirmed_by = coalesce(confirmed_by,updated_by,created_by)
where shift_code is not null
  and coalesce(is_confirmed,false) = false;

update public.ta_daily_work_plans d
set
  status = 'CONFIRMED',
  updated_at = now()
where upper(coalesce(d.status,'')) = 'PLANNED'
  and exists (
    select 1
    from public.shift_calendar sc
    where public.normalize_emp_code(sc.emp_code) =
          public.normalize_emp_code(d.emp_code)
      and sc.work_date = d.work_date
      and coalesce(sc.is_confirmed,false) = true
  );

notify pgrst, 'reload schema';

commit;
