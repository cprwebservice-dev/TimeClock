-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.23
-- Work Pattern Bulk Permission / Select-All Consistency Fix
--
-- แก้สาเหตุ:
-- - หน้า Work Pattern แสดงรายชื่อจาก VIEW scope
-- - Writer ใช้ EDIT_SCHEDULE scope
-- - เลือกทั้งหมดจึงอาจมีพนักงานที่ดูได้แต่แก้ไขไม่ได้ปะปนอยู่
--
-- กฎหลังแก้:
-- - HR_ADMIN: จัด Work Pattern ได้ทุกพนักงานที่มีอยู่ใน Employee Master
-- - MANAGER: จัดได้เฉพาะพนักงานที่ EDIT_SCHEDULE ผ่านในเดือนนั้น
-- - System Period / Monthly Baseline V6.14.17-V6.14.19 คงเดิม
-- ============================================================================

begin;
set local statement_timeout = '0';

do $$
begin
  if to_regclass('public.employees') is null then raise exception 'MISSING_TABLE: employees'; end if;
  if to_regprocedure('public._ta_current_access_v681()') is null then raise exception 'MISSING_FUNCTION: _ta_current_access_v681'; end if;
  if to_regprocedure('public._ta_schedule_access_days_v61025(date,date,text,text,text[])') is null then raise exception 'MISSING_FUNCTION: _ta_schedule_access_days_v61025'; end if;
  if to_regprocedure('public.ta_can_access_employee_v680(text,date,text)') is null then raise exception 'MISSING_FUNCTION: ta_can_access_employee_v680'; end if;
  if to_regprocedure('public.ta_assign_employee_work_pattern_v61419(text,text,text,date,date,integer[],text)') is null then raise exception 'MISSING_V6.14.19: ta_assign_employee_work_pattern_v61419'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Canonical Work Pattern edit access
--    VIEW scope ใช้สำหรับแสดงรายชื่อเท่านั้น
--    ฟังก์ชันนี้เป็น Source of Truth สำหรับ Checkbox / Bulk / Writer
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_employee_work_pattern_edit_access_v61423(
  p_emp_codes text[],
  p_effective_date date
)
returns table(
  emp_code text,
  can_edit boolean,
  access_reason text,
  authorization_date date,
  access_role text
)
language sql
stable
security definer
set search_path=public
as $$
  with access as materialized (
    select
      upper(trim(coalesce(a.role,'VIEWER'))) as role,
      coalesce(a.is_active,false) as is_active
    from public._ta_current_access_v681() a
    limit 1
  ), params as materialized (
    select
      date_trunc('month',coalesce(p_effective_date,current_date))::date as month_start,
      (date_trunc('month',coalesce(p_effective_date,current_date)) + interval '1 month' - interval '1 day')::date as month_end
  ), requested as materialized (
    select distinct public.normalize_emp_code(x.code) as emp_code
    from unnest(coalesce(p_emp_codes,array[]::text[])) x(code)
    where nullif(public.normalize_emp_code(x.code),'') is not null
  ), employee_exists as materialized (
    select
      r.emp_code,
      exists(
        select 1 from public.employees e
        where public.normalize_emp_code(e."EmployeeId")=r.emp_code
      ) as exists_in_master,
      exists(
        select 1
        from public.employees e
        cross join params p
        where public.normalize_emp_code(e."EmployeeId")=r.emp_code
          and (
            nullif(to_jsonb(e)->>'start_date','') is null
            or (to_jsonb(e)->>'start_date')::date <= p.month_end
          )
          and (
            nullif(to_jsonb(e)->>'resign_date','') is null
            or (to_jsonb(e)->>'resign_date')::date >= p.month_start
          )
      ) as employment_overlaps_month
    from requested r
  ), view_days as materialized (
    select d.emp_code,min(d.work_date) as authorization_date
    from params p
    cross join lateral public._ta_schedule_access_days_v61025(
      p.month_start,p.month_end,null,null,p_emp_codes
    ) d
    group by d.emp_code
  )
  select
    r.emp_code,
    case
      when not coalesce(a.is_active,false) then false
      when not e.exists_in_master then false
      when not e.employment_overlaps_month then false
      when a.role='HR_ADMIN' then true
      when a.role='MANAGER' and d.authorization_date is not null
        then public.ta_can_access_employee_v680(
          r.emp_code,d.authorization_date,'EDIT_SCHEDULE'
        )
      else false
    end as can_edit,
    case
      when not coalesce(a.is_active,false) then 'USER_PROFILE_NOT_ACTIVE'
      when not e.exists_in_master then 'EMPLOYEE_NOT_FOUND'
      when not e.employment_overlaps_month then 'EMPLOYEE_OUTSIDE_MONTH'
      when a.role='HR_ADMIN' then 'HR_ADMIN_ALL_EMPLOYEES'
      when a.role not in ('MANAGER','HR_ADMIN') then 'ROLE_READ_ONLY'
      when d.authorization_date is null then 'OUTSIDE_VIEW_SCOPE_OR_EMPLOYMENT_PERIOD'
      when public.ta_can_access_employee_v680(
        r.emp_code,d.authorization_date,'EDIT_SCHEDULE'
      ) then 'EDIT_SCHEDULE_ALLOWED'
      else 'VIEW_ONLY_NO_EDIT_SCHEDULE'
    end as access_reason,
    d.authorization_date,
    coalesce(a.role,'VIEWER') as access_role
  from requested r
  cross join access a
  join employee_exists e on e.emp_code=r.emp_code
  left join view_days d on d.emp_code=r.emp_code
  order by r.emp_code;
$$;

revoke all on function public.ta_get_employee_work_pattern_edit_access_v61423(text[],date) from public;
grant execute on function public.ta_get_employee_work_pattern_edit_access_v61423(text[],date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Canonical monthly writer V6.14.19 patched to use V6.14.23 access source
-- ---------------------------------------------------------------------------
create or replace function public.ta_assign_employee_work_pattern_v61419(
  p_emp_code text,
  p_pattern_code text,
  p_default_shift_code text,
  p_effective_from date,
  p_effective_to date default null,
  p_override_weekly_off_dows integer[] default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_pattern text := upper(trim(coalesce(p_pattern_code,'')));
  v_shift text;
  v_template text;
  v_month_start date;
  v_month_end date;
  v_to date;
  v_next_start date;
  v_target_id uuid;
  v_saved jsonb;
  v_period_guard jsonb;
  v_weekly_off integer[];
  v_actor_email text := nullif(trim(coalesce(auth.jwt()->>'email','')),'');
  v_removed_same_month integer := 0;
  v_can_edit boolean := false;
  v_access_reason text := null;
begin
  if nullif(v_emp,'') is null then raise exception 'EMPLOYEE_REQUIRED'; end if;
  if p_effective_from is null then raise exception 'EFFECTIVE_FROM_REQUIRED'; end if;

  v_month_start := date_trunc('month',p_effective_from)::date;
  v_month_end := (date_trunc('month',p_effective_from) + interval '1 month' - interval '1 day')::date;

  if p_effective_from <> v_month_start then
    raise exception 'WORK_PATTERN_MONTH_START_REQUIRED: %',v_month_start;
  end if;

  if p_effective_to is not null then
    v_to := (date_trunc('month',p_effective_to) + interval '1 month' - interval '1 day')::date;
    if p_effective_to <> v_to then
      raise exception 'WORK_PATTERN_MONTH_END_REQUIRED: %',v_to;
    end if;
    if v_to < v_month_end then raise exception 'INVALID_EFFECTIVE_DATE'; end if;
  else
    v_to := null;
  end if;

  -- Closed Schedule / Certification period is never bypassed for Work Pattern.
  v_period_guard := public._ta_assert_employee_pattern_effective_date_v61417(v_month_start);

  -- V6.14.23: Work Pattern page must use EDIT scope, not the VIEW scope used
  -- to draw the employee list. HR Admin is explicitly global for this master
  -- configuration; Manager remains constrained by can_edit_schedule.
  select x.can_edit,x.access_reason
  into v_can_edit,v_access_reason
  from public.ta_get_employee_work_pattern_edit_access_v61423(
    array[v_emp]::text[],
    v_month_start
  ) x
  where x.emp_code=v_emp
  limit 1;

  if not found or not coalesce(v_can_edit,false) then
    raise exception 'SCHEDULE_EDIT_PERMISSION_DENIED: % | % | %',
      v_emp,
      v_month_start,
      coalesce(v_access_reason,'NO_EDIT_SCOPE');
  end if;

  if v_pattern not in ('TECH_5D','TECH_6D') then
    raise exception 'EMPLOYEE_WORK_PATTERN_NOT_SUPPORTED: %',v_pattern;
  end if;

  v_shift := public._ta_validate_employee_default_shift_v61416(v_pattern,p_default_shift_code);
  v_template := case v_pattern
    when 'TECH_5D' then 'SINGLE_0830_1800'
    else 'SINGLE_0830_1730'
  end;

  select wp.weekly_off_dows
  into v_weekly_off
  from public.ta_work_patterns wp
  where upper(trim(wp.pattern_code))=v_pattern
    and coalesce(wp.is_active,true)
  limit 1;

  if v_weekly_off is null then
    raise exception 'WORK_PATTERN_NOT_FOUND_OR_NO_WEEKLY_OFF: %',v_pattern;
  end if;

  -- Close any older open assignment at the previous month-end.
  update public.ta_employee_work_patterns a
  set effective_to=v_month_start-1,
      updated_by=auth.uid(),
      updated_at=now()
  where public.normalize_emp_code(a.emp_code)=v_emp
    and a.effective_from < v_month_start
    and (a.effective_to is null or a.effective_to >= v_month_start);

  -- The new configuration is monthly. Legacy rows beginning inside the same
  -- month are invalid after this save and are removed so one month has one
  -- baseline only.
  delete from public.ta_employee_work_patterns a
  where public.normalize_emp_code(a.emp_code)=v_emp
    and a.effective_from > v_month_start
    and a.effective_from <= v_month_end;
  get diagnostics v_removed_same_month = row_count;

  -- A later month already configured limits this row automatically.
  select min(a.effective_from)
  into v_next_start
  from public.ta_employee_work_patterns a
  where public.normalize_emp_code(a.emp_code)=v_emp
    and a.effective_from > v_month_end;

  if v_next_start is not null then
    v_to := least(coalesce(v_to,v_next_start-1),v_next_start-1);
  end if;

  -- Save same employee + same month deterministically: update one canonical row.
  select a.id
  into v_target_id
  from public.ta_employee_work_patterns a
  where public.normalize_emp_code(a.emp_code)=v_emp
    and a.effective_from=v_month_start
  order by
    a.ui_saved_at desc nulls last,
    a.updated_at desc nulls last,
    a.created_at desc nulls last,
    a.id desc
  limit 1;

  if v_target_id is null then
    insert into public.ta_employee_work_patterns(
      emp_code,pattern_code,effective_from,effective_to,
      override_weekly_off_dows,default_template_code,default_shift_code,note,
      created_by,updated_by,ui_saved_at,ui_saved_by,ui_saved_by_email
    ) values (
      v_emp,v_pattern,v_month_start,v_to,
      null,v_template,v_shift,nullif(trim(coalesce(p_note,'')),''),
      auth.uid(),auth.uid(),now(),auth.uid(),v_actor_email
    )
    returning id into v_target_id;
  else
    update public.ta_employee_work_patterns a
    set pattern_code=v_pattern,
        effective_to=v_to,
        override_weekly_off_dows=null,
        default_template_code=v_template,
        default_shift_code=v_shift,
        note=nullif(trim(coalesce(p_note,'')),''),
        ui_saved_at=now(),
        ui_saved_by=auth.uid(),
        ui_saved_by_email=coalesce(v_actor_email,a.ui_saved_by_email),
        updated_by=auth.uid(),
        updated_at=now()
    where a.id=v_target_id;
  end if;

  -- Remove old exact-month duplicates, if any existed from earlier versions.
  delete from public.ta_employee_work_patterns a
  where public.normalize_emp_code(a.emp_code)=v_emp
    and a.effective_from=v_month_start
    and a.id<>v_target_id;

  select to_jsonb(a)
  into v_saved
  from public.ta_employee_work_patterns a
  where a.id=v_target_id;

  return coalesce(v_saved,'{}'::jsonb) || jsonb_build_object(
    'effective_pattern_code',v_pattern,
    'default_shift_code',v_shift,
    'shift_period',case when v_shift in ('S134','S135') then 'NIGHT' else 'DAY' end,
    'weekly_off_dows',to_jsonb(v_weekly_off),
    'month_start',v_month_start,
    'month_end',v_month_end,
    'monthly_baseline',true,
    'same_month_legacy_rows_removed',v_removed_same_month,
    'period_guard',v_period_guard,
    'version','V6.14.23',
    'permission_version','V6.14.23'
  );
end;
$$;

revoke all on function public.ta_assign_employee_work_pattern_v61419(text,text,text,date,date,integer[],text) from public;
grant execute on function public.ta_assign_employee_work_pattern_v61419(text,text,text,date,date,integer[],text) to authenticated;



notify pgrst, 'reload schema';
commit;
