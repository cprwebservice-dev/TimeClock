-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.25
-- Day-off Calculation Consistency / Config-driven Work Pattern
-- ============================================================================
-- เป้าหมาย
-- 1) วันหยุดประจำสัปดาห์ใช้ ta_work_patterns.weekly_off_dows ของพนักงานจริง
--    ไม่ใช้ตำแหน่ง / PC เพื่อบังคับนโยบายวันหยุด
-- 2) วันหยุดคู่ OSTD/OS043/OS134/OS135 อิงกะทำงานล่าสุดย้อนหลัง 60 วัน
--    ข้ามเดือน ข้ามวันหยุด/ลา/นักขัตฤกษ์ และ fallback ไป Default Shift
-- 3) Person / Team / Time / Monthly / Popup / Bulk / Fill / Paste / Pattern /
--    Copy Week ใช้ Resolver กลางเดียวกัน
-- 4) Day-off quota + hard guard ใช้ Work Pattern source เดียวกับ Schedule Grid
-- ============================================================================

begin;
set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- 1) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.employees') is null then raise exception 'MISSING_TABLE: employees'; end if;
  if to_regclass('public.ta_employee_work_patterns') is null then raise exception 'MISSING_TABLE: ta_employee_work_patterns'; end if;
  if to_regclass('public.ta_work_patterns') is null then raise exception 'MISSING_TABLE: ta_work_patterns'; end if;
  if to_regclass('public.ta_work_pattern_default_shifts') is null then raise exception 'MISSING_TABLE: ta_work_pattern_default_shifts'; end if;
  if to_regclass('public.shift_calendar') is null then raise exception 'MISSING_TABLE: shift_calendar'; end if;
  if to_regclass('public.shift_master') is null then raise exception 'MISSING_TABLE: shift_master'; end if;
  if to_regclass('public.holidays') is null then raise exception 'MISSING_TABLE: holidays'; end if;
  if to_regclass('public.ta_schedule_rule_assignments') is null then raise exception 'MISSING_TABLE: ta_schedule_rule_assignments'; end if;
  if to_regclass('public.ta_shift_schedule_rules_v6123') is null then raise exception 'MISSING_TABLE: ta_shift_schedule_rules_v6123'; end if;
  if to_regclass('public.ta_dayoff_settings') is null then raise exception 'MISSING_TABLE: ta_dayoff_settings'; end if;
  if to_regclass('public.ta_dayoff_opening_balance') is null then raise exception 'MISSING_TABLE: ta_dayoff_opening_balance'; end if;
  if to_regprocedure('public._ta_schedule_access_days_v61025(date,date,text,text,text[])') is null then
    raise exception 'MISSING_FUNCTION: _ta_schedule_access_days_v61025';
  end if;
  if to_regprocedure('public.ta_resolve_paired_dayoff_shift_v6134(text)') is null then
    raise exception 'MISSING_FUNCTION: ta_resolve_paired_dayoff_shift_v6134';
  end if;
  if to_regprocedure('public.ta_v6134_upsert_generated_dayoff_shift(time,time,text)') is null then
    raise exception 'MISSING_FUNCTION: ta_v6134_upsert_generated_dayoff_shift';
  end if;
  if to_regprocedure('public.ta_v6120_can_schedule()') is null then
    raise exception 'MISSING_FUNCTION: ta_v6120_can_schedule';
  end if;
  if to_regprocedure('public.ta_can_access_employee_v680(text,date,text)') is null then
    raise exception 'MISSING_FUNCTION: ta_can_access_employee_v680';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Canonical Work Pattern resolver
--    Explicit monthly assignment wins. If no assignment exists, use TECH_6D as
--    neutral legacy fallback; no position / PC rule is allowed to force 5D/6D.
--    Weekly off comes from ta_work_patterns only; old individual override is
--    intentionally ignored.
-- ---------------------------------------------------------------------------
create or replace function public.ta_resolve_employee_work_pattern_v651(
  p_emp_code text,
  p_work_date date
)
returns table (
  emp_code text,
  work_date date,
  pattern_code text,
  pattern_name text,
  work_days_per_week integer,
  scheduled_minutes_including_break integer,
  standard_work_minutes integer,
  break_minutes integer,
  weekly_off_dows integer[],
  default_template_code text,
  default_shift_code text,
  default_shift_name text,
  default_shift_start_time time,
  default_shift_end_time time
)
language sql
stable
security definer
set search_path = public
as $$
  with emp as (
    select public.normalize_emp_code(e."EmployeeId") as emp_code
    from public.employees e
    where public.normalize_emp_code(e."EmployeeId") = public.normalize_emp_code(p_emp_code)
    limit 1
  ),
  assignment as (
    select
      upper(trim(a.pattern_code)) as pattern_code,
      a.default_template_code,
      a.default_shift_code
    from public.ta_employee_work_patterns a
    where public.normalize_emp_code(a.emp_code)=public.normalize_emp_code(p_emp_code)
      and a.effective_from <= p_work_date
      and (a.effective_to is null or a.effective_to >= p_work_date)
    order by a.effective_from desc,a.created_at desc,a.id desc
    limit 1
  ),
  resolved as (
    select
      e.emp_code,
      coalesce(nullif(a.pattern_code,''),'TECH_6D') as pattern_code,
      a.default_template_code,
      a.default_shift_code
    from emp e
    left join assignment a on true
  ),
  chosen_default as (
    select
      r.*,
      d.shift_code as pattern_default_shift
    from resolved r
    left join lateral (
      select x.shift_code
      from public.ta_work_pattern_default_shifts x
      where upper(trim(x.pattern_code))=upper(trim(r.pattern_code))
      order by x.shift_code
      limit 1
    ) d on true
  ),
  canonical as (
    select
      c.*,
      case
        when upper(trim(coalesce(c.default_shift_code,''))) in ('STD','S043','S134','S135')
          then upper(trim(c.default_shift_code))
        when upper(trim(coalesce(c.pattern_default_shift,''))) in ('D5','ST5','SINGLE_0830_1800') then 'STD'
        when upper(trim(coalesce(c.pattern_default_shift,''))) in ('D6','ST6','SINGLE_0830','SINGLE_0830_1730') then 'S043'
        when nullif(trim(coalesce(c.pattern_default_shift,'')),'') is not null
          then upper(trim(c.pattern_default_shift))
        when upper(trim(c.pattern_code))='TECH_5D' then 'STD'
        else 'S043'
      end as canonical_shift_code
    from chosen_default c
  )
  select
    c.emp_code,
    p_work_date,
    p.pattern_code,
    p.pattern_name,
    p.work_days_per_week,
    p.scheduled_minutes_including_break,
    p.standard_work_minutes,
    p.break_minutes,
    p.weekly_off_dows,
    coalesce(
      c.default_template_code,
      case when upper(trim(p.pattern_code))='TECH_5D'
        then 'SINGLE_0830_1800' else 'SINGLE_0830_1730' end
    ) as default_template_code,
    c.canonical_shift_code,
    s.shift_name,
    s.start_time,
    s.end_time
  from canonical c
  join public.ta_work_patterns p
    on upper(trim(p.pattern_code))=upper(trim(c.pattern_code))
   and coalesce(p.is_active,true)
  left join public.shift_master s
    on upper(trim(s.shift_code))=c.canonical_shift_code
   and coalesce(s.is_active,true);
$$;

revoke all on function public.ta_resolve_employee_work_pattern_v651(text,date) from public;
grant execute on function public.ta_resolve_employee_work_pattern_v651(text,date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) READ-ONLY cross-month day-off basis resolver
--    Used by Schedule Grid. It never inserts/updates anything.
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_off_shift_basis_read_v61425(
  p_emp_code text,
  p_work_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_lookback_days integer := 60;
  v_search_from date;

  v_basis_date date;
  v_code text;
  v_pattern text;
  v_mode text;
  v_base_code text;
  v_start time;
  v_end time;
  v_custom_start time;
  v_custom_end time;
  v_basis_code text;

  v_pair_code text;
  v_pair_name text;
  v_pair_start time;
  v_pair_end time;

  v_default_shift_code text;
  v_dynamic_off_code text;
begin
  if p_work_date is null then raise exception 'WORK_DATE_REQUIRED'; end if;
  if nullif(v_emp,'') is null then raise exception 'EMPLOYEE_REQUIRED'; end if;

  v_search_from := p_work_date - v_lookback_days;

  -- Find the latest effective WORK day without calling Schedule Grid.
  -- This is set-based: only 60 candidate dates, indexed assignment lookups,
  -- and no recursive Schedule RPC/function call.
  with candidate_dates as (
    select d::date as work_date
    from generate_series(
      (p_work_date - 1)::timestamp,
      v_search_from::timestamp,
      interval '-1 day'
    ) d
  ), base as (
    select
      d.work_date,
      nullif(upper(trim(coalesce(sc.shift_code,''))),'') as assigned_code,
      coalesce(asm.is_workday,false) as assigned_is_workday,
      asm.start_time as assigned_start_time,
      asm.end_time as assigned_end_time,
      upper(trim(coalesce(ep.pattern_code,'TECH_6D'))) as pattern_code,
      ep.default_shift_code as employee_default_shift_code,
      wp.weekly_off_dows,
      (h.holiday_date is not null) as is_holiday,
      upper(trim(coalesce(a.work_mode_code,''))) as work_mode_code,
      upper(trim(coalesce(a.base_shift_code,''))) as base_shift_code,
      a.custom_start_time,
      a.custom_end_time,
      dflt.shift_code as pattern_default_shift
    from candidate_dates d
    left join lateral (
      select c.shift_code
      from public.shift_calendar c
      where public.normalize_emp_code(c.emp_code)=v_emp
        and c.work_date=d.work_date
      order by coalesce(c.updated_at,now()) desc
      limit 1
    ) sc on true
    left join public.shift_master asm
      on upper(trim(asm.shift_code))=upper(trim(coalesce(sc.shift_code,'')))
     and coalesce(asm.is_active,true)
    left join lateral (
      select x.pattern_code,x.default_shift_code
      from public.ta_employee_work_patterns x
      where public.normalize_emp_code(x.emp_code)=v_emp
        and x.effective_from<=d.work_date
        and (x.effective_to is null or x.effective_to>=d.work_date)
      order by x.effective_from desc,x.created_at desc,x.id desc
      limit 1
    ) ep on true
    left join public.ta_work_patterns wp
      on upper(trim(wp.pattern_code))=upper(trim(coalesce(ep.pattern_code,'TECH_6D')))
     and coalesce(wp.is_active,true)
    left join lateral (
      select x.shift_code
      from public.ta_work_pattern_default_shifts x
      where upper(trim(x.pattern_code))=upper(trim(coalesce(ep.pattern_code,'TECH_6D')))
      order by x.shift_code
      limit 1
    ) dflt on true
    left join public.holidays h on h.holiday_date=d.work_date
    left join public.ta_schedule_rule_assignments a
      on public.normalize_emp_code(a.emp_code)=v_emp
     and a.work_date=d.work_date
  ), canonical as (
    select
      b.*,
      case
        when upper(trim(coalesce(b.employee_default_shift_code,''))) in ('STD','S043','S134','S135')
          then upper(trim(b.employee_default_shift_code))
        when upper(trim(coalesce(b.pattern_default_shift,''))) in ('D5','ST5','SINGLE_0830_1800') then 'STD'
        when upper(trim(coalesce(b.pattern_default_shift,''))) in ('D6','ST6','SINGLE_0830','SINGLE_0830_1730') then 'S043'
        when nullif(trim(coalesce(b.pattern_default_shift,'')),'') is not null
          then upper(trim(b.pattern_default_shift))
        when b.pattern_code='TECH_5D' then 'STD'
        else 'S043'
      end as default_shift_code
    from base b
  ), effective as (
    select
      c.*,
      dsm.start_time as default_start_time,
      dsm.end_time as default_end_time,
      case when c.assigned_code is not null then c.assigned_code else c.default_shift_code end as effective_code,
      case when c.assigned_code is not null then c.assigned_start_time else dsm.start_time end as effective_start,
      case when c.assigned_code is not null then c.assigned_end_time else dsm.end_time end as effective_end,
      case
        when c.assigned_code is not null then
          c.assigned_code not in ('LV','LEAVE','HOL','OFF')
          and c.assigned_is_workday
        else
          not c.is_holiday
          and not (
            c.weekly_off_dows is not null
            and extract(dow from c.work_date)::integer=any(c.weekly_off_dows)
          )
          and nullif(trim(coalesce(c.default_shift_code,'')),'') is not null
      end as is_effective_workday
    from canonical c
    left join public.shift_master dsm
      on upper(trim(dsm.shift_code))=c.default_shift_code
     and coalesce(dsm.is_active,true)
  )
  select
    e.work_date,
    upper(trim(e.effective_code)),
    e.pattern_code,
    e.work_mode_code,
    e.base_shift_code,
    e.effective_start,
    e.effective_end,
    e.custom_start_time,
    e.custom_end_time
  into
    v_basis_date,
    v_code,
    v_pattern,
    v_mode,
    v_base_code,
    v_start,
    v_end,
    v_custom_start,
    v_custom_end
  from effective e
  where e.is_effective_workday
  order by e.work_date desc
  limit 1;

  if nullif(v_code,'') is not null then
    v_basis_code := coalesce(nullif(v_base_code,''),v_code);

    if v_mode='HOUR_BASED' and v_custom_start is not null and v_custom_end is not null then
      v_dynamic_off_code :=
        (case when upper(trim(coalesce(v_pattern,'TECH_6D')))='TECH_5D' then 'OH5' else 'OH6' end)
        || to_char(v_custom_start,'HH24MI')
        || to_char(v_custom_end,'HH24MI');

      return jsonb_build_object(
        'basis_work_date',v_basis_date,'basis_shift_code',v_basis_code,
        'basis_source','PREVIOUS_WORK_SHIFT','off_shift_code',v_dynamic_off_code,
        'off_shift_name','วันหยุดตามกะนับชั่วโมง','off_start_time',v_custom_start,
        'off_end_time',v_custom_end,'resolution_type','DYNAMIC_SPECIAL_COMPUTED',
        'mapping_missing',false,'used_default_fallback',false,
        'searched_from_date',v_search_from,'lookback_days',v_lookback_days,
        'pattern_code',v_pattern,'version','V6.14.25'
      );
    end if;

    if v_mode='SPLIT_WAIT_NIGHT' and nullif(v_base_code,'') is not null then
      v_basis_code := v_base_code;
    end if;

    select off.off_shift_code,off.off_shift_name,off.off_start_time,off.off_end_time
    into v_pair_code,v_pair_name,v_pair_start,v_pair_end
    from public.ta_resolve_paired_dayoff_shift_v6134(v_basis_code) off
    where coalesce(off.mapping_valid,false)
    limit 1;

    if v_pair_code is null then
      return jsonb_build_object(
        'basis_work_date',v_basis_date,'basis_shift_code',v_basis_code,
        'basis_source','PREVIOUS_WORK_SHIFT','off_shift_code',null,
        'off_shift_name',null,'off_start_time',v_start,'off_end_time',v_end,
        'resolution_type','MAPPING_MISSING','mapping_missing',true,
        'used_default_fallback',false,'searched_from_date',v_search_from,
        'lookback_days',v_lookback_days,'pattern_code',v_pattern,'version','V6.14.25'
      );
    end if;

    return jsonb_build_object(
      'basis_work_date',v_basis_date,'basis_shift_code',v_basis_code,
      'basis_source','PREVIOUS_WORK_SHIFT','off_shift_code',v_pair_code,
      'off_shift_name',v_pair_name,'off_start_time',v_pair_start,'off_end_time',v_pair_end,
      'resolution_type',case when v_mode='SPLIT_WAIT_NIGHT' then 'MAPPED_SPECIAL_BASE' else 'MAPPED_PREVIOUS_WORK_SHIFT' end,
      'mapping_missing',false,'used_default_fallback',false,
      'searched_from_date',v_search_from,'lookback_days',v_lookback_days,
      'pattern_code',v_pattern,'version','V6.14.25'
    );
  end if;

  select upper(trim(p.default_shift_code)),upper(trim(p.pattern_code))
  into v_default_shift_code,v_pattern
  from public.ta_resolve_employee_work_pattern_v651(v_emp,p_work_date) p
  limit 1;

  if nullif(v_default_shift_code,'') is null then return null; end if;

  select off.off_shift_code,off.off_shift_name,off.off_start_time,off.off_end_time
  into v_pair_code,v_pair_name,v_pair_start,v_pair_end
  from public.ta_resolve_paired_dayoff_shift_v6134(v_default_shift_code) off
  where coalesce(off.mapping_valid,false)
  limit 1;

  return jsonb_build_object(
    'basis_work_date',null,'basis_shift_code',v_default_shift_code,
    'basis_source','DEFAULT_SHIFT','off_shift_code',v_pair_code,
    'off_shift_name',v_pair_name,'off_start_time',v_pair_start,'off_end_time',v_pair_end,
    'resolution_type',case when v_pair_code is null then 'DEFAULT_MAPPING_MISSING' else 'DEFAULT_MAPPED' end,
    'mapping_missing',(v_pair_code is null),'used_default_fallback',true,
    'searched_from_date',v_search_from,'lookback_days',v_lookback_days,
    'pattern_code',v_pattern,'version','V6.14.25'
  );
end;
$$;

revoke all on function public.ta_get_off_shift_basis_read_v61425(text,date) from public;

-- ---------------------------------------------------------------------------
-- 4) Public day-off basis resolver used by Popup / Bulk.
--    Same read logic; only here may the system create the dynamic HOUR_BASED
--    day-off Shift Master code required for an actual write.
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_off_shift_basis_v61425(
  p_emp_code text,
  p_work_date date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_result jsonb;
  v_start time;
  v_end time;
  v_pattern text;
  v_generated text;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;
  if not public.ta_can_access_employee_v680(public.normalize_emp_code(p_emp_code),p_work_date,'EDIT_SCHEDULE') then
    raise exception 'SCHEDULE_EDIT_PERMISSION_DENIED';
  end if;
  v_result := public.ta_get_off_shift_basis_read_v61425(p_emp_code,p_work_date);
  if v_result is null then return null; end if;

  if coalesce(v_result->>'resolution_type','')='DYNAMIC_SPECIAL_COMPUTED' then
    v_start := nullif(v_result->>'off_start_time','')::time;
    v_end := nullif(v_result->>'off_end_time','')::time;
    v_pattern := coalesce(nullif(v_result->>'pattern_code',''),'TECH_6D');
    if v_start is not null and v_end is not null then
      v_generated := public.ta_v6134_upsert_generated_dayoff_shift(v_start,v_end,v_pattern);
      v_result := jsonb_set(v_result,'{off_shift_code}',to_jsonb(v_generated),true);
      v_result := jsonb_set(v_result,'{resolution_type}',to_jsonb('DYNAMIC_SPECIAL_GENERATED'::text),true);
    end if;
  end if;

  return v_result || jsonb_build_object('version','V6.14.25');
end;
$$;

revoke all on function public.ta_get_off_shift_basis_v61425(text,date) from public;
grant execute on function public.ta_get_off_shift_basis_v61425(text,date) to authenticated;

-- Backward-compatible V6.13.5 entry point now delegates to canonical V6.14.25.
create or replace function public.ta_get_off_shift_basis_v6135(
  p_emp_code text,
  p_work_date date
)
returns jsonb
language sql
security definer
set search_path=public
as $$
  select public.ta_get_off_shift_basis_v61425(p_emp_code,p_work_date);
$$;

revoke all on function public.ta_get_off_shift_basis_v6135(text,date) from public;
grant execute on function public.ta_get_off_shift_basis_v6135(text,date) to authenticated;

-- Older V6.13.4 compatibility entry point also delegates to canonical V6.14.25.
create or replace function public.ta_get_off_shift_basis_v6134(
  p_emp_code text,
  p_work_date date
)
returns jsonb
language sql
security definer
set search_path=public
as $$
  select public.ta_get_off_shift_basis_v61425(p_emp_code,p_work_date);
$$;

revoke all on function public.ta_get_off_shift_basis_v6134(text,date) from public;
grant execute on function public.ta_get_off_shift_basis_v6134(text,date) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Config-driven day-off quota balance
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_dayoff_balance_v61425(
  p_emp_code text,
  p_month date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_emp text:=public.normalize_emp_code(p_emp_code);
  v_target date:=date_trunc('month',coalesce(p_month,current_date))::date;
  v_start date;
  v_month date;
  v_dows integer[];
  v_pattern text;
  v_target_dows integer[];
  v_target_pattern text;
  v_quota integer:=0;
  v_used integer:=0;
  v_balance numeric:=0;
  v_carry numeric:=0;
  v_open numeric:=0;
  v_carry_enabled boolean:=true;
  v_is_first boolean:=true;
  v_position text;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;
  if nullif(v_emp,'') is null then raise exception 'EMP_CODE_REQUIRED'; end if;

  select s.effective_start_month,s.carry_forward_enabled
  into v_start,v_carry_enabled
  from public.ta_dayoff_settings s
  where s.setting_id=1;

  if v_start is null then raise exception 'DAYOFF_SETTINGS_NOT_FOUND'; end if;

  select nullif(trim(coalesce(to_jsonb(e)->>'position_name','')),'')
  into v_position
  from public.employees e
  where public.normalize_emp_code(e."EmployeeId")=v_emp
  limit 1;

  if v_target<v_start then
    return jsonb_build_object(
      'emp_code',v_emp,'position_name',v_position,'month',v_target,
      'effective_start_month',v_start,'month_quota_days',0,'used_days',0,
      'carried_in_days',0,'opening_days',0,'balance_days',0,
      'status','NOT_STARTED','usage_basis','CONFIGURED_WORK_PATTERN','version','V6.14.25'
    );
  end if;

  select coalesce(max(b.opening_days),0)
  into v_open
  from public.ta_dayoff_opening_balance b
  where public.normalize_emp_code(b.emp_code)=v_emp
    and b.start_month=v_start;

  for v_month in
    select generate_series(v_start,v_target,interval '1 month')::date
  loop
    if v_is_first then
      v_carry:=coalesce(v_open,0);
      v_is_first:=false;
    else
      v_carry:=case when coalesce(v_carry_enabled,true) then v_balance else 0 end;
    end if;

    select p.weekly_off_dows,upper(trim(p.pattern_code))
    into v_dows,v_pattern
    from public.ta_resolve_employee_work_pattern_v651(v_emp,v_month) p
    limit 1;

    v_dows:=coalesce(v_dows,array[0]::integer[]);
    if v_month=v_target then
      v_target_dows:=v_dows;
      v_target_pattern:=v_pattern;
    end if;

    select count(*)::integer
    into v_quota
    from generate_series(
      v_month,
      (v_month+interval '1 month'-interval '1 day')::date,
      interval '1 day'
    ) d(day_value)
    where extract(dow from d.day_value)::integer=any(v_dows)
       or exists(select 1 from public.holidays h where h.holiday_date=d.day_value::date);

    -- Used day-off rules:
    -- - explicit LV/LEAVE: not used
    -- - explicit working shift: not used, even on weekly off / holiday
    -- - explicit non-workday / HOL / paired off: used
    -- - no explicit assignment on configured weekly off / holiday: used
    with days as (
      select d::date as work_date
      from generate_series(
        v_month,
        (v_month+interval '1 month'-interval '1 day')::date,
        interval '1 day'
      ) d
    ), cal as (
      select
        d.work_date,
        (extract(dow from d.work_date)::integer=any(v_dows)
          or exists(select 1 from public.holidays h where h.holiday_date=d.work_date)) as is_natural_dayoff
      from days d
    ), assigned as (
      select distinct on (c.work_date)
        c.work_date,
        nullif(upper(trim(coalesce(c.shift_code,''))),'') as shift_code,
        sm.is_workday
      from public.shift_calendar c
      left join public.shift_master sm
        on upper(trim(sm.shift_code))=upper(trim(c.shift_code))
      where public.normalize_emp_code(c.emp_code)=v_emp
        and c.work_date>=v_month
        and c.work_date<(v_month+interval '1 month')::date
      order by c.work_date,coalesce(c.updated_at,now()) desc
    )
    select count(*)::integer
    into v_used
    from cal d
    left join assigned a on a.work_date=d.work_date
    where case
      when a.shift_code in ('LV','LEAVE') then false
      when a.shift_code is not null then
        a.shift_code='HOL'
        or coalesce(a.is_workday,true)=false
        or exists(
          select 1
          from public.ta_shift_schedule_rules_v6123 r
          where r.paired_off_shift_code is not null
            and upper(trim(r.paired_off_shift_code))=a.shift_code
        )
      else d.is_natural_dayoff
    end;

    v_balance:=coalesce(v_carry,0)+coalesce(v_quota,0)-coalesce(v_used,0);
  end loop;

  return jsonb_build_object(
    'emp_code',v_emp,
    'position_name',v_position,
    'month',v_target,
    'effective_start_month',v_start,
    'opening_days',v_open,
    'month_quota_days',v_quota,
    'used_days',v_used,
    'carried_in_days',v_carry,
    'balance_days',v_balance,
    'pattern_code',v_target_pattern,
    'weekly_off_dows',v_target_dows,
    'carry_forward_enabled',v_carry_enabled,
    'usage_basis','CONFIGURED_WORK_PATTERN_PLUS_EXPLICIT_PAIRED_SHIFT',
    'position_policy_applied',false,
    'status','ACTIVE',
    'version','V6.14.25'
  );
end;
$$;

revoke all on function public.ta_get_dayoff_balance_v61425(text,date) from public;
grant execute on function public.ta_get_dayoff_balance_v61425(text,date) to authenticated;

-- Existing V6.14.3 guards call V6.13.4 by name. Keep them current by delegation.
create or replace function public.ta_get_dayoff_balance_v6134(
  p_emp_code text,
  p_month date
)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select public.ta_get_dayoff_balance_v61425(p_emp_code,p_month);
$$;

revoke all on function public.ta_get_dayoff_balance_v6134(text,date) from public;
grant execute on function public.ta_get_dayoff_balance_v6134(text,date) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Quota consumption helper aligned with Work Pattern weekly_off_dows
-- ---------------------------------------------------------------------------
create or replace function public._ta_dayoff_consumes_quota_v6142(
  p_emp_code text,
  p_work_date date,
  p_shift_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_emp text:=public.normalize_emp_code(p_emp_code);
  v_code text:=nullif(upper(trim(coalesce(p_shift_code,''))),'');
  v_dows integer[];
  v_natural_dayoff boolean:=false;
  v_is_workday boolean;
  v_shift_exists boolean:=false;
begin
  if nullif(v_emp,'') is null or p_work_date is null then return false; end if;

  select p.weekly_off_dows
  into v_dows
  from public.ta_resolve_employee_work_pattern_v651(v_emp,p_work_date) p
  limit 1;
  v_dows:=coalesce(v_dows,array[0]::integer[]);

  v_natural_dayoff :=
    extract(dow from p_work_date)::integer=any(v_dows)
    or exists(select 1 from public.holidays h where h.holiday_date=p_work_date);

  if v_code is null then return v_natural_dayoff; end if;
  if v_code in ('LV','LEAVE') then return false; end if;
  if v_code in ('HOL','OFF') then return true; end if;

  select true,coalesce(sm.is_workday,true)
  into v_shift_exists,v_is_workday
  from public.shift_master sm
  where upper(trim(sm.shift_code))=v_code
  order by coalesce(sm.updated_at,now()) desc
  limit 1;

  if coalesce(v_shift_exists,false) then return not coalesce(v_is_workday,true); end if;

  if exists(
    select 1
    from public.ta_shift_schedule_rules_v6123 r
    where r.paired_off_shift_code is not null
      and upper(trim(r.paired_off_shift_code))=v_code
  ) then return true; end if;

  return false;
end;
$$;

revoke all on function public._ta_dayoff_consumes_quota_v6142(text,date,text) from public;

-- ---------------------------------------------------------------------------
-- 7) Canonical lightweight Schedule Grid
--    Natural weekly-off uses latest effective working shift within 60 days.
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_schedule_range_light_v61425(
  p_start_date date,
  p_end_date date,
  p_zone text default null,
  p_department text default null,
  p_emp_codes text[] default null,
  p_schedule_statuses text[] default null
)
returns table (
  work_date date,
  emp_code text,
  full_name text,
  start_date date,
  resign_date date,
  position_name text,
  department text,
  zone text,
  area text,
  sub_area text,
  pc text,
  day_type text,
  is_public_holiday boolean,
  is_weekly_off boolean,
  holiday_name text,
  expected_day integer,
  auto_shift_code text,
  suggested_shift_code text,
  suggestion_confidence integer,
  assigned_shift_code text,
  effective_shift_code text,
  is_confirmed boolean,
  schedule_status text,
  actual_in_at time,
  actual_out_at time,
  first_in time,
  last_out time,
  shift_start_time time,
  shift_end_time time,
  schedule_note text,
  schedule_source text,
  pattern_code text,
  pattern_name text,
  template_code text,
  calculation_day_type text,
  paid_work_minutes numeric,
  regular_minutes numeric,
  overtime_minutes numeric,
  waiting_minutes numeric,
  offday_work_minutes numeric,
  comp_off_earned boolean,
  segment_count integer,
  calculation_status text,
  comp_off_balance numeric,
  default_shift_code text,
  pattern_scheduled_minutes integer,
  pattern_standard_work_minutes integer,
  shift_pattern_match boolean
)
language sql
stable
security definer
set search_path=public
as $$
  with access_days as materialized (
    select a.emp_code,a.work_date
    from public._ta_schedule_access_days_v61025(
      p_start_date,p_end_date,p_zone,p_department,p_emp_codes
    ) a
  ),
  scoped_codes as materialized (
    select distinct a.emp_code from access_days a
  ),
  employee_meta as materialized (
    select
      public.normalize_emp_code(e."EmployeeId") as emp_code,
      coalesce(
        nullif(trim(coalesce(to_jsonb(e)->>'full_name','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'employee_name','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'name','')),''),
        public.normalize_emp_code(e."EmployeeId")
      ) as full_name,
      e.start_date::date as start_date,
      e.resign_date::date as resign_date,
      nullif(trim(coalesce(to_jsonb(e)->>'position_name','')),'') as position_name,
      nullif(trim(coalesce(to_jsonb(e)->>'department','')),'') as department,
      coalesce(
        nullif(trim(coalesce(to_jsonb(e)->>'zone','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'area','')),'')
      ) as zone,
      nullif(trim(coalesce(to_jsonb(e)->>'area','')),'') as area,
      nullif(trim(coalesce(to_jsonb(e)->>'sub_area','')),'') as sub_area,
      coalesce(
        nullif(trim(coalesce(to_jsonb(e)->>'pc','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'PC','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'PCgrade','')),''),
        nullif(trim(coalesce(to_jsonb(e)->>'pcgrade','')),'')
      ) as pc
    from public.employees e
    join scoped_codes s on s.emp_code=public.normalize_emp_code(e."EmployeeId")
  ),
  pattern_ranked as materialized (
    select
      a.emp_code,a.work_date,
      e.full_name,e.start_date,e.resign_date,e.position_name,e.department,e.zone,e.area,e.sub_area,e.pc,
      coalesce(nullif(upper(trim(p.pattern_code)),''),'TECH_6D') as resolved_pattern_code,
      p.default_template_code,
      p.default_shift_code as employee_default_shift_code,
      row_number() over (
        partition by a.emp_code,a.work_date
        order by p.effective_from desc nulls last,p.created_at desc nulls last,p.id desc nulls last
      ) as rn
    from access_days a
    join employee_meta e on e.emp_code=a.emp_code
    left join public.ta_employee_work_patterns p
      on public.normalize_emp_code(p.emp_code)=a.emp_code
     and p.effective_from<=a.work_date
     and (p.effective_to is null or p.effective_to>=a.work_date)
  ),
  pattern_context as materialized (
    select
      p.work_date,p.emp_code,p.full_name,p.start_date,p.resign_date,p.position_name,p.department,p.zone,p.area,p.sub_area,p.pc,
      upper(trim(coalesce(p.resolved_pattern_code,'TECH_6D'))) as pattern_code,
      w.pattern_name,
      coalesce(w.weekly_off_dows,array[0]::integer[]) as weekly_off_dows,
      w.scheduled_minutes_including_break,
      w.standard_work_minutes,
      case
        when upper(trim(coalesce(p.default_template_code,''))) in ('EARLY_SPLIT_FLEX','SPLIT_FLEX') then 'SPLIT_FLEX'
        when upper(trim(coalesce(p.default_template_code,''))) in ('SINGLE_0830','SINGLE_0830_1730','ST6') then 'ST6'
        when upper(trim(coalesce(p.default_template_code,''))) in ('SINGLE_0830_1800','ST5') then 'ST5'
        when nullif(trim(coalesce(p.default_template_code,'')),'') is not null then upper(trim(p.default_template_code))
        when upper(trim(coalesce(p.resolved_pattern_code,'')))='TECH_5D' then 'ST5'
        else 'ST6'
      end as default_template_code,
      case
        when upper(trim(coalesce(p.employee_default_shift_code,''))) in ('STD','S043','S134','S135')
          then upper(trim(p.employee_default_shift_code))
        when upper(trim(coalesce(d.shift_code,''))) in ('D5','ST5','SINGLE_0830_1800') then 'STD'
        when upper(trim(coalesce(d.shift_code,''))) in ('D6','ST6','SINGLE_0830','SINGLE_0830_1730') then 'S043'
        when nullif(trim(coalesce(d.shift_code,'')),'') is not null then upper(trim(d.shift_code))
        when upper(trim(coalesce(p.resolved_pattern_code,'')))='TECH_5D' then 'STD'
        else 'S043'
      end as default_shift_code
    from pattern_ranked p
    left join public.ta_work_patterns w
      on upper(trim(w.pattern_code))=upper(trim(p.resolved_pattern_code))
     and coalesce(w.is_active,true)
    left join lateral (
      select x.shift_code
      from public.ta_work_pattern_default_shifts x
      where upper(trim(x.pattern_code))=upper(trim(p.resolved_pattern_code))
      order by x.shift_code
      limit 1
    ) d on true
    where p.rn=1
  ),
  resolved as materialized (
    select
      p.*,
      h.holiday_name as resolved_holiday_name,
      (h.holiday_date is not null) as resolved_public_holiday,
      (
        h.holiday_date is null
        and extract(dow from p.work_date)::integer=any(p.weekly_off_dows)
      ) as resolved_weekly_off,
      nullif(upper(trim(coalesce(sc.shift_code,''))),'') as assigned_code,
      coalesce(nullif(to_jsonb(sc)->>'is_confirmed','')::boolean,false) as assigned_confirmed,
      nullif(to_jsonb(sc)->>'note','') as assignment_note,
      nullif(to_jsonb(sc)->>'source_type','') as assignment_source
    from pattern_context p
    left join public.holidays h on h.holiday_date=p.work_date
    left join lateral (
      select x.*
      from public.shift_calendar x
      where public.normalize_emp_code(x.emp_code)=p.emp_code
        and x.work_date=p.work_date
      order by coalesce(x.updated_at,now()) desc
      limit 1
    ) sc on true
  ),
  with_dayoff as materialized (
    select r.*,b.basis as dayoff_basis
    from resolved r
    left join lateral (
      select public.ta_get_off_shift_basis_read_v61425(r.emp_code,r.work_date) as basis
      where r.resolved_weekly_off
    ) b on true
  ),
  codes as materialized (
    select
      r.*,
      nullif(upper(trim(coalesce(r.dayoff_basis->>'off_shift_code',''))),'') as resolved_dayoff_code,
      nullif(r.dayoff_basis->>'off_start_time','')::time as resolved_dayoff_start,
      nullif(r.dayoff_basis->>'off_end_time','')::time as resolved_dayoff_end,
      case
        when r.resolved_public_holiday then 'HOL'
        when r.resolved_weekly_off then nullif(upper(trim(coalesce(r.dayoff_basis->>'off_shift_code',''))),'')
        else r.default_shift_code
      end as auto_code,
      coalesce(
        r.assigned_code,
        case
          when r.resolved_public_holiday then 'HOL'
          when r.resolved_weekly_off then nullif(upper(trim(coalesce(r.dayoff_basis->>'off_shift_code',''))),'')
          else r.default_shift_code
        end
      ) as display_code,
      case when r.assigned_code is null then 'AUTO'
           when r.assigned_confirmed then 'CONFIRMED' else 'ASSIGNED' end as resolved_schedule_status
    from with_dayoff r
  )
  select
    c.work_date,c.emp_code,c.full_name,c.start_date,c.resign_date,c.position_name,c.department,c.zone,c.area,c.sub_area,c.pc,
    case when c.resolved_public_holiday then 'PUBLIC_HOLIDAY'
         when c.resolved_weekly_off then 'WEEKLY_OFF' else 'WORKDAY' end,
    c.resolved_public_holiday,c.resolved_weekly_off,c.resolved_holiday_name,
    case when c.resolved_public_holiday or c.resolved_weekly_off then 0 else 1 end::integer,
    c.auto_code,c.auto_code,
    case when c.assigned_code is not null then 100
         when c.resolved_public_holiday or c.resolved_weekly_off then 100
         when c.default_shift_code is not null then 95 else 80 end::integer,
    c.assigned_code,c.display_code,c.assigned_confirmed,c.resolved_schedule_status,
    null::time,null::time,null::time,null::time,
    coalesce(sm.start_time,case when c.resolved_weekly_off then c.resolved_dayoff_start end),
    coalesce(sm.end_time,case when c.resolved_weekly_off then c.resolved_dayoff_end end),
    c.assignment_note,
    coalesce(
      c.assignment_source,
      case when c.resolved_public_holiday then 'PUBLIC_HOLIDAY'
           when c.resolved_weekly_off and c.resolved_dayoff_code is null then 'LATEST_WORK_SHIFT_DAYOFF_MAPPING_MISSING'
           when c.resolved_weekly_off then 'LATEST_WORK_SHIFT_PAIRED_DAYOFF'
           else 'WORK_PATTERN_DEFAULT_SHIFT' end
    ),
    c.pattern_code,
    coalesce(c.pattern_name,case when c.pattern_code='TECH_5D' then 'ทำงาน 5 วัน/สัปดาห์'
                                 when c.pattern_code='TECH_6D' then 'ทำงาน 6 วัน/สัปดาห์'
                                 else c.pattern_code end),
    c.default_template_code,
    case when c.resolved_public_holiday then 'PUBLIC_HOLIDAY'
         when c.resolved_weekly_off then 'WEEKLY_OFF' else 'WORKDAY' end,
    null::numeric,null::numeric,null::numeric,null::numeric,null::numeric,
    false,0::integer,null::text,0::numeric,
    c.default_shift_code,c.scheduled_minutes_including_break::integer,c.standard_work_minutes::integer,true
  from codes c
  left join public.shift_master sm
    on upper(trim(sm.shift_code))=upper(trim(coalesce(c.display_code,'')))
   and coalesce(sm.is_active,true)
  where p_schedule_statuses is null or c.resolved_schedule_status=any(p_schedule_statuses)
  order by c.emp_code,c.work_date;
$$;

revoke all on function public.ta_get_schedule_range_light_v61425(date,date,text,text,text[],text[]) from public;
grant execute on function public.ta_get_schedule_range_light_v61425(date,date,text,text,text[],text[]) to authenticated;

-- Backward compatibility: all old readers now receive the canonical V6.14.25 rows.
create or replace function public.ta_get_schedule_range_light_v6134(
  p_start_date date,
  p_end_date date,
  p_zone text default null,
  p_department text default null,
  p_emp_codes text[] default null,
  p_schedule_statuses text[] default null
)
returns table (
  work_date date,
  emp_code text,
  full_name text,
  start_date date,
  resign_date date,
  position_name text,
  department text,
  zone text,
  area text,
  sub_area text,
  pc text,
  day_type text,
  is_public_holiday boolean,
  is_weekly_off boolean,
  holiday_name text,
  expected_day integer,
  auto_shift_code text,
  suggested_shift_code text,
  suggestion_confidence integer,
  assigned_shift_code text,
  effective_shift_code text,
  is_confirmed boolean,
  schedule_status text,
  actual_in_at time,
  actual_out_at time,
  first_in time,
  last_out time,
  shift_start_time time,
  shift_end_time time,
  schedule_note text,
  schedule_source text,
  pattern_code text,
  pattern_name text,
  template_code text,
  calculation_day_type text,
  paid_work_minutes numeric,
  regular_minutes numeric,
  overtime_minutes numeric,
  waiting_minutes numeric,
  offday_work_minutes numeric,
  comp_off_earned boolean,
  segment_count integer,
  calculation_status text,
  comp_off_balance numeric,
  default_shift_code text,
  pattern_scheduled_minutes integer,
  pattern_standard_work_minutes integer,
  shift_pattern_match boolean
)
language sql
stable
security definer
set search_path=public
as $$
  select *
  from public.ta_get_schedule_range_light_v61425(
    p_start_date,p_end_date,p_zone,p_department,p_emp_codes,p_schedule_statuses
  );
$$;

revoke all on function public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[]) from public;
grant execute on function public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[]) to authenticated;

-- Supporting indexes for the canonical lookback / monthly balance paths.
create index if not exists idx_shift_calendar_emp_date_v61425
  on public.shift_calendar(emp_code,work_date desc);
create index if not exists idx_employee_work_patterns_emp_dates_v61425
  on public.ta_employee_work_patterns(emp_code,effective_from desc,effective_to);
create index if not exists idx_holidays_date_v61425
  on public.holidays(holiday_date);

analyze public.shift_calendar;
analyze public.ta_employee_work_patterns;
notify pgrst, 'reload schema';
commit;
