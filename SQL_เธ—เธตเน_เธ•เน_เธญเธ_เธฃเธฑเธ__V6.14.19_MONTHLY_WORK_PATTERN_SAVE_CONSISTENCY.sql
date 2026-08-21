-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.19
-- Monthly Work Pattern + Save/Refresh Consistency
--
-- หลักการ
-- 1) รูปแบบการทำงานระดับพนักงานในหน้านี้เป็น Monthly Baseline
--    - เริ่มใช้ได้เฉพาะวันที่ 1 ของเดือน
--    - ถ้าระบุสิ้นสุด ต้องเป็นวันสุดท้ายของเดือน
--    - ไม่อนุญาตให้มี Work Pattern / Default Shift หลายชุดภายในเดือนเดียวกัน
-- 2) Save ซ้ำเดือนเดิม = Update แถวเดิม ไม่ Insert ซ้ำ
-- 3) Reader และ Writer ใช้แถวเดียวกันแบบ deterministic
-- 4) System Period Guard V6.14.17 ยังคงบังคับใช้
-- ============================================================================

begin;
set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- 1) Preconditions
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.employees') is null then raise exception 'MISSING_TABLE: employees'; end if;
  if to_regclass('public.ta_employee_work_patterns') is null then raise exception 'MISSING_TABLE: ta_employee_work_patterns'; end if;
  if to_regclass('public.ta_work_patterns') is null then raise exception 'MISSING_TABLE: ta_work_patterns'; end if;
  if to_regclass('public.shift_master') is null then raise exception 'MISSING_TABLE: shift_master'; end if;
  if to_regprocedure('public.ta_get_employee_pattern_effective_guard_v61417(date)') is null then
    raise exception 'MISSING_V6.14.17: ta_get_employee_pattern_effective_guard_v61417';
  end if;
  if to_regprocedure('public._ta_assert_employee_pattern_effective_date_v61417(date)') is null then
    raise exception 'MISSING_V6.14.17: _ta_assert_employee_pattern_effective_date_v61417';
  end if;
  if to_regprocedure('public.ta_can_access_employee_v680(text,date,text)') is null then
    raise exception 'MISSING_FUNCTION: ta_can_access_employee_v680';
  end if;
  if to_regprocedure('public._ta_schedule_access_days_v61025(date,date,text,text,text[])') is null then
    raise exception 'MISSING_FUNCTION: _ta_schedule_access_days_v61025';
  end if;
  if to_regprocedure('public._ta_validate_employee_default_shift_v61416(text,text)') is null then
    raise exception 'MISSING_FUNCTION: _ta_validate_employee_default_shift_v61416';
  end if;
  if to_regprocedure('public.ta_refresh_attendance_consistency_v61415(date,date,text[])') is null then
    raise exception 'MISSING_FUNCTION: ta_refresh_attendance_consistency_v61415';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='ta_employee_work_patterns' and column_name='default_shift_code'
  ) then raise exception 'MISSING_COLUMN: ta_employee_work_patterns.default_shift_code'; end if;
end;
$$;

create index if not exists idx_emp_pattern_month_lookup_v61419
  on public.ta_employee_work_patterns(emp_code,effective_from desc,effective_to,updated_at desc,created_at desc);

-- ---------------------------------------------------------------------------
-- 2) Monthly guard helper
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_employee_pattern_month_guard_v61419(
  p_effective_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_selected date := coalesce(p_effective_date,current_date);
  v_month_start date := date_trunc('month',coalesce(p_effective_date,current_date))::date;
  v_month_end date := (date_trunc('month',coalesce(p_effective_date,current_date)) + interval '1 month' - interval '1 day')::date;
  v_period jsonb;
begin
  v_period := public.ta_get_employee_pattern_effective_guard_v61417(v_month_start);
  return coalesce(v_period,'{}'::jsonb) || jsonb_build_object(
    'selected_date',v_selected,
    'month_start',v_month_start,
    'month_end',v_month_end,
    'month_start_required',true,
    'selected_is_month_start',v_selected=v_month_start,
    'monthly_baseline',true,
    'version','V6.14.19'
  );
end;
$$;

revoke all on function public.ta_get_employee_pattern_month_guard_v61419(date) from public;
grant execute on function public.ta_get_employee_pattern_month_guard_v61419(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Canonical monthly writer
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
  v_auth_date date;
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

  -- Monthly baseline may begin before an employee's first working day in the
  -- month. Authorize against the first accessible employee day inside the month,
  -- while the effective baseline itself remains the first calendar day.
  select min(a.work_date)
  into v_auth_date
  from public._ta_schedule_access_days_v61025(
    v_month_start,v_month_end,null,null,array[v_emp]::text[]
  ) a
  where a.emp_code=v_emp;

  if v_auth_date is null
     or not public.ta_can_access_employee_v680(v_emp,v_auth_date,'EDIT_SCHEDULE') then
    raise exception 'SCHEDULE_EDIT_PERMISSION_DENIED';
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
    'version','V6.14.19'
  );
end;
$$;

revoke all on function public.ta_assign_employee_work_pattern_v61419(text,text,text,date,date,integer[],text) from public;
grant execute on function public.ta_assign_employee_work_pattern_v61419(text,text,text,date,date,integer[],text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Bulk writer
-- ---------------------------------------------------------------------------
create or replace function public.ta_assign_employee_work_patterns_bulk_v61419(
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_item jsonb;
  v_saved jsonb;
  v_saved_rows jsonb := '[]'::jsonb;
  v_processed integer := 0;
  v_emp_codes text[] := array[]::text[];
  v_emp text;
  v_from date;
  v_to date;
  v_min_from date := null;
  v_max_to date := null;
  v_recalc jsonb := null;
begin
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then
    raise exception 'EMPLOYEE_PATTERN_ROWS_MUST_BE_ARRAY';
  end if;
  if jsonb_array_length(coalesce(p_rows,'[]'::jsonb))=0 then
    raise exception 'EMPLOYEE_PATTERN_ROWS_REQUIRED';
  end if;
  if jsonb_array_length(p_rows)>2000 then
    raise exception 'EMPLOYEE_PATTERN_BULK_LIMIT_EXCEEDED: 2000';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_emp := public.normalize_emp_code(v_item->>'emp_code');
    begin v_from := (v_item->>'effective_from')::date;
    exception when others then raise exception 'INVALID_EFFECTIVE_FROM: %',coalesce(v_item->>'effective_from',''); end;
    begin v_to := nullif(v_item->>'effective_to','')::date;
    exception when others then raise exception 'INVALID_EFFECTIVE_TO: %',coalesce(v_item->>'effective_to',''); end;

    v_saved := public.ta_assign_employee_work_pattern_v61419(
      v_emp,
      v_item->>'pattern_code',
      v_item->>'default_shift_code',
      v_from,
      v_to,
      null,
      nullif(v_item->>'note','')
    );

    v_processed := v_processed + 1;
    v_emp_codes := array_append(v_emp_codes,v_emp);
    v_min_from := least(coalesce(v_min_from,v_from),v_from);
    if v_to is not null then v_max_to := greatest(coalesce(v_max_to,v_to),v_to); end if;
    v_saved_rows := v_saved_rows || jsonb_build_array(jsonb_build_object(
      'emp_code',v_emp,
      'pattern_code',v_saved->>'effective_pattern_code',
      'default_shift_code',v_saved->>'default_shift_code',
      'effective_from',v_saved->>'month_start',
      'effective_to',v_saved->>'effective_to',
      'same_month_legacy_rows_removed',coalesce((v_saved->>'same_month_legacy_rows_removed')::integer,0)
    ));
  end loop;

  select coalesce(array_agg(distinct x order by x),array[]::text[])
  into v_emp_codes
  from unnest(v_emp_codes) x
  where nullif(x,'') is not null;

  -- Keep the synchronous DB work small. Current-day calculation refreshes here;
  -- frontend V6.14.19 performs the month-to-today consistency refresh in chunks.
  if v_min_from is not null
     and v_min_from <= current_date
     and cardinality(v_emp_codes)>0 then
    v_recalc := public.ta_refresh_attendance_consistency_v61415(current_date,current_date,v_emp_codes);
  end if;

  return jsonb_build_object(
    'processed_rows',v_processed,
    'employee_count',cardinality(v_emp_codes),
    'saved_rows',v_saved_rows,
    'attendance_refresh',v_recalc,
    'monthly_baseline',true,
    'month_to_today_refresh_recommended',coalesce(v_min_from<=current_date,false),
    'minimum_effective_from',v_min_from,
    'maximum_effective_to',v_max_to,
    'version','V6.14.19'
  );
end;
$$;

revoke all on function public.ta_assign_employee_work_patterns_bulk_v61419(jsonb) from public;
grant execute on function public.ta_assign_employee_work_patterns_bulk_v61419(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Canonical Employee Assignment reader used by the whole Work Pattern page.
--    One reader removes the V6.14.18 merge race between 3 different RPCs.
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_employee_pattern_assignments_v61419(
  p_search text default null,
  p_effective_date date default current_date,
  p_limit integer default 500
)
returns table(
  emp_code text,
  full_name text,
  department text,
  area text,
  sub_area text,
  pc text,
  position_name text,
  pattern_code text,
  pattern_name text,
  weekly_off_dows integer[],
  default_template_code text,
  default_shift_code text,
  effective_default_shift_code text,
  shift_period text,
  shift_name text,
  shift_start_time time,
  shift_end_time time,
  effective_from date,
  effective_to date,
  assignment_note text,
  recorded_at timestamptz,
  recorded_by_email text,
  has_assignment boolean,
  assignment_state text,
  month_consistency_status text
)
language sql
stable
security definer
set search_path=public
as $$
  with params as materialized (
    select
      coalesce(p_effective_date,current_date) as effective_date,
      date_trunc('month',coalesce(p_effective_date,current_date))::date as month_start,
      (date_trunc('month',coalesce(p_effective_date,current_date)) + interval '1 month' - interval '1 day')::date as month_end
  ), scoped_codes as materialized (
    select distinct a.emp_code
    from params p
    cross join lateral public._ta_schedule_access_days_v61025(
      p.month_start,p.month_end,null,null,null
    ) a
  ), base as materialized (
    select
      public.normalize_emp_code(e."EmployeeId") as emp_code,
      coalesce(
        nullif(trim(coalesce(to_jsonb(e)->>'full_name','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'ชื่อ-สกุล ภาษาไทย','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'FullName','')),''),
        public.normalize_emp_code(e."EmployeeId")
      ) as full_name,
      coalesce(
        nullif(trim(coalesce(to_jsonb(e)->>'department','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'หน่วยงาน','')),'')
      ) as department,
      coalesce(
        nullif(trim(coalesce(to_jsonb(e)->>'area','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'zone','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'พื้นที่','')),'')
      ) as area,
      coalesce(
        nullif(trim(coalesce(to_jsonb(e)->>'sub_area','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'พื้นที่ย่อย','')),'')
      ) as sub_area,
      coalesce(
        nullif(trim(coalesce(to_jsonb(e)->>'pc','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'PC','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'PCgrade','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'pcgrade','')),'')
      ) as pc,
      coalesce(
        nullif(trim(coalesce(to_jsonb(e)->>'position_name','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'PositionName','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'ตำแหน่ง','')),'')
      ) as position_name
    from public.employees e
    join scoped_codes s
      on s.emp_code=public.normalize_emp_code(e."EmployeeId")
    where coalesce(trim(p_search),'')=''
       or public.normalize_emp_code(e."EmployeeId") ilike '%'||trim(p_search)||'%'
       or coalesce(to_jsonb(e)->>'full_name',to_jsonb(e)->>'ชื่อ-สกุล ภาษาไทย',to_jsonb(e)->>'FullName','') ilike '%'||trim(p_search)||'%'
    order by public.normalize_emp_code(e."EmployeeId")
    limit greatest(1,least(coalesce(p_limit,500),5000))
  ), enriched as (
    select
      b.*,
      a.id as assignment_id,
      a.pattern_code as assigned_pattern_code,
      a.default_template_code as assigned_template_code,
      nullif(upper(trim(coalesce(a.default_shift_code,''))),'') as assigned_shift_code,
      a.effective_from as assigned_from,
      a.effective_to as assigned_to,
      a.note as assigned_note,
      coalesce(a.ui_saved_at,a.updated_at,a.created_at) as recorded_at,
      a.ui_saved_by_email as recorded_by_email,
      p.month_start,
      p.month_end,
      exists(
        select 1
        from public.ta_employee_work_patterns z
        where public.normalize_emp_code(z.emp_code)=b.emp_code
          and (
            (z.effective_from > p.month_start and z.effective_from <= p.month_end)
            or (z.effective_to is not null and z.effective_to >= p.month_start and z.effective_to < p.month_end)
          )
      ) as has_midmonth_boundary
    from base b
    cross join params p
    left join lateral (
      select x.*
      from public.ta_employee_work_patterns x
      where public.normalize_emp_code(x.emp_code)=b.emp_code
        and x.effective_from<=p.effective_date
        and (x.effective_to is null or x.effective_to>=p.effective_date)
      order by
        x.effective_from desc,
        x.ui_saved_at desc nulls last,
        x.updated_at desc nulls last,
        x.created_at desc nulls last,
        x.id desc
      limit 1
    ) a on true
  ), resolved as (
    select
      e.*,
      upper(trim(coalesce(
        e.assigned_pattern_code,
        case when regexp_replace(upper(coalesce(e.pc,'')),'[^0-9]','','g')='4' then 'TECH_5D' else 'TECH_6D' end
      ))) as resolved_pattern
    from enriched e
  ), canonical as (
    select
      r.*,
      case
        when r.resolved_pattern='TECH_5D'
          then case when r.assigned_shift_code in ('S134','S135') then 'S134' else 'STD' end
        else case when r.assigned_shift_code in ('S134','S135') then 'S135' else 'S043' end
      end as resolved_shift
    from resolved r
  )
  select
    r.emp_code,
    r.full_name,
    r.department,
    r.area,
    r.sub_area,
    r.pc,
    r.position_name,
    r.resolved_pattern,
    wp.pattern_name,
    coalesce(wp.weekly_off_dows,case when r.resolved_pattern='TECH_5D' then array[0,6]::integer[] else array[0]::integer[] end),
    coalesce(r.assigned_template_code,case when r.resolved_pattern='TECH_5D' then 'SINGLE_0830_1800' else 'SINGLE_0830_1730' end),
    r.assigned_shift_code,
    r.resolved_shift,
    case when r.resolved_shift in ('S134','S135') then 'NIGHT' else 'DAY' end,
    sm.shift_name,
    sm.start_time,
    sm.end_time,
    r.assigned_from,
    r.assigned_to,
    r.assigned_note,
    r.recorded_at,
    r.recorded_by_email,
    (r.assignment_id is not null),
    case when r.assignment_id is not null then 'ACTIVE' else 'NOT_ASSIGNED' end,
    case when r.has_midmonth_boundary then 'LEGACY_MIDMONTH' else 'OK' end
  from canonical r
  left join public.ta_work_patterns wp
    on upper(trim(wp.pattern_code))=r.resolved_pattern
  left join public.shift_master sm
    on upper(trim(sm.shift_code))=r.resolved_shift
  order by r.emp_code;
$$;

revoke all on function public.ta_get_employee_pattern_assignments_v61419(text,date,integer) from public;
grant execute on function public.ta_get_employee_pattern_assignments_v61419(text,date,integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) V6.14.18 compatibility writers now inherit the monthly rule.
-- ---------------------------------------------------------------------------
create or replace function public.ta_assign_employee_work_pattern_v61418(
  p_emp_code text,
  p_pattern_code text,
  p_default_shift_code text,
  p_effective_from date,
  p_effective_to date default null,
  p_override_weekly_off_dows integer[] default null,
  p_note text default null
)
returns jsonb
language sql
security definer
set search_path=public
as $$
  select public.ta_assign_employee_work_pattern_v61419(
    p_emp_code,p_pattern_code,p_default_shift_code,p_effective_from,p_effective_to,p_override_weekly_off_dows,p_note
  ) || jsonb_build_object('compatibility_rpc','V6.14.18');
$$;

create or replace function public.ta_assign_employee_work_patterns_bulk_v61418(p_rows jsonb)
returns jsonb
language sql
security definer
set search_path=public
as $$
  select public.ta_assign_employee_work_patterns_bulk_v61419(p_rows)
    || jsonb_build_object('compatibility_rpc','V6.14.18');
$$;

revoke all on function public.ta_assign_employee_work_pattern_v61418(text,text,text,date,date,integer[],text) from public;
grant execute on function public.ta_assign_employee_work_pattern_v61418(text,text,text,date,date,integer[],text) to authenticated;
revoke all on function public.ta_assign_employee_work_patterns_bulk_v61418(jsonb) from public;
grant execute on function public.ta_assign_employee_work_patterns_bulk_v61418(jsonb) to authenticated;

analyze public.ta_employee_work_patterns;
commit;
