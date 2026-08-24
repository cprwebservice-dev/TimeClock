-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.48
-- Whole-System Consistency: Canonical Expected Day + Off-day Punch Ownership
-- ============================================================================
-- กติกา:
-- 1) วันหยุด (paired OFF / natural OFF / HOL) จะรับ Punch เป็นเวลาเข้า/ออก
--    เฉพาะเมื่อ Mode เป็น IN/OUT จริงเท่านั้น
-- 2) Fallback แบบ "ใช้ Punch ใดก็ได้ใน Window" ยังคงใช้ได้เฉพาะวันทำงาน
-- 3) OUT ของกะข้ามคืนวันก่อนหน้า ห้ามถูกนำมาเป็น IN ของวันหยุดวันถัดไป
-- 4) expected_day ใช้ Work Pattern / Leave / Explicit Shift ตาม Canonical rules V6.14.25+
-- 5) ไม่แก้ time_logs ดิบ และไม่เปลี่ยนกฎ Late/Absent/OT/Day-off quota
-- ============================================================================

begin;
set local statement_timeout = '0';
select pg_advisory_xact_lock(hashtext('timeclock_v61448_whole_system_consistency'));

do $$
begin
  if to_regclass('public.attendance_workday') is null then raise exception 'MISSING_TABLE: attendance_workday'; end if;
  if to_regclass('public.time_logs') is null then raise exception 'MISSING_TABLE: time_logs'; end if;
  if to_regclass('public.shift_calendar') is null then raise exception 'MISSING_TABLE: shift_calendar'; end if;
  if to_regclass('public.shift_master') is null then raise exception 'MISSING_TABLE: shift_master'; end if;
  if to_regprocedure('public.normalize_emp_code(text)') is null then raise exception 'MISSING_FUNCTION: normalize_emp_code'; end if;
  if to_regprocedure('public.ta_resolve_employee_work_pattern_v651(text,date)') is null then
    raise exception 'MISSING_FUNCTION: ta_resolve_employee_work_pattern_v651';
  end if;
  if to_regprocedure('public._ta_is_full_day_leave_v61437(text,date)') is null then
    raise exception 'MISSING_FUNCTION: _ta_is_full_day_leave_v61437';
  end if;
  if to_regclass('public.ta_daily_work_plans') is null then raise exception 'MISSING_TABLE: ta_daily_work_plans'; end if;
  if to_regclass('public.holidays') is null then raise exception 'MISSING_TABLE: holidays'; end if;
  if to_regclass('public.ta_work_patterns') is null then raise exception 'MISSING_TABLE: ta_work_patterns'; end if;
  if to_regprocedure('public._ta_refresh_attendance_calc_core_v630(date,date,text[])') is null then
    raise exception 'MISSING_FUNCTION: _ta_refresh_attendance_calc_core_v630';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Canonical expected-day resolver.
--    V6.14.25 made Work Pattern the source of truth; PC/position must not decide
--    weekly-off days. Full-day leave and explicit Daily Plan/Shift overrides
--    remain authoritative.
-- ---------------------------------------------------------------------------
create or replace function public._ta_expected_workday_v61448(
  p_emp_code text,
  p_work_date date
)
returns integer
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_override text;
  v_shift_code text;
  v_shift_is_workday boolean;
  v_dows integer[];
begin
  if nullif(v_emp,'') is null or p_work_date is null then return 0; end if;

  -- Full-day leave overlay wins even if an older structural schedule still
  -- contains a working shift. Partial leave is intentionally not included.
  if public._ta_is_full_day_leave_v61437(v_emp,p_work_date) then
    return 0;
  end if;

  select upper(trim(coalesce(p.day_override_type,'')))
  into v_override
  from public.ta_daily_work_plans p
  where public.normalize_emp_code(p.emp_code)=v_emp
    and p.work_date=p_work_date
    and upper(trim(coalesce(p.status,'CONFIRMED'))) <> 'CANCELLED'
  order by coalesce(p.updated_at,p.created_at,now()) desc
  limit 1;

  if v_override in ('WEEKLY_OFF','COMP_OFF','LEAVE','HOLIDAY') then return 0; end if;
  if v_override='WORK' then return 1; end if;

  -- Explicit assigned shift overrides natural Sunday/public-holiday state.
  select upper(trim(coalesce(sc.shift_code,''))), sm.is_workday
  into v_shift_code,v_shift_is_workday
  from public.shift_calendar sc
  left join public.shift_master sm
    on upper(trim(sm.shift_code))=upper(trim(sc.shift_code))
   and coalesce(sm.is_active,true)
  where public.normalize_emp_code(sc.emp_code)=v_emp
    and sc.work_date=p_work_date
  order by coalesce(sc.updated_at,now()) desc
  limit 1;

  if nullif(v_shift_code,'') is not null then
    if v_shift_code in ('OFF','HOL','LV','OSTD','OS043','OS134','OS135')
       or v_shift_code ~ '^OH[56][0-9]*$' then
      return 0;
    end if;
    if v_shift_is_workday is not null then
      return case when v_shift_is_workday then 1 else 0 end;
    end if;
    -- Unknown assigned Shift Master row: never invent a workday/absence.
    return 0;
  end if;

  if exists(select 1 from public.holidays h where h.holiday_date=p_work_date) then
    return 0;
  end if;

  select r.weekly_off_dows
  into v_dows
  from public.ta_resolve_employee_work_pattern_v651(v_emp,p_work_date) r
  limit 1;

  -- Resolver should always return the employee's configured pattern. If legacy
  -- configuration is incomplete, use the neutral TECH_6D Sunday fallback used
  -- by V6.14.25 rather than old PC/position logic.
  v_dows := coalesce(v_dows,array[0]::integer[]);
  if extract(dow from p_work_date)::integer = any(v_dows) then return 0; end if;
  return 1;
end;
$$;

revoke all on function public._ta_expected_workday_v61448(text,date) from public;
grant execute on function public._ta_expected_workday_v61448(text,date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Work Pattern minute integrity.
--    Frontend V6.14.47 could send standard_work_minutes = scheduled minutes.
--    Repair only rows that match that exact corruption signature, then protect
--    TECH_5D/TECH_6D from the same mistake on every write path.
-- ---------------------------------------------------------------------------
update public.ta_work_patterns
set standard_work_minutes=greatest(0,coalesce(scheduled_minutes_including_break,0)-coalesce(break_minutes,0)),
    updated_at=now()
where upper(trim(pattern_code)) in ('TECH_5D','TECH_6D')
  and coalesce(break_minutes,0)>0
  and standard_work_minutes=scheduled_minutes_including_break;

create or replace function public._ta_work_pattern_minutes_guard_v61448()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if upper(trim(coalesce(new.pattern_code,''))) in ('TECH_5D','TECH_6D') then
    if coalesce(new.scheduled_minutes_including_break,0) < coalesce(new.break_minutes,0) then
      raise exception 'WORK_PATTERN_BREAK_EXCEEDS_SCHEDULED_MINUTES';
    end if;
    new.standard_work_minutes := greatest(
      0,
      coalesce(new.scheduled_minutes_including_break,0)-coalesce(new.break_minutes,0)
    );
  end if;
  return new;
end;
$$;

revoke all on function public._ta_work_pattern_minutes_guard_v61448() from public;

drop trigger if exists trg_zz_work_pattern_minutes_v61448 on public.ta_work_patterns;
create trigger trg_zz_work_pattern_minutes_v61448
before insert or update of scheduled_minutes_including_break,standard_work_minutes,break_minutes
on public.ta_work_patterns
for each row execute function public._ta_work_pattern_minutes_guard_v61448();

-- ---------------------------------------------------------------------------
-- 3) Attendance rebuild keeps V6.14.47 strict punch ownership but gets expected
--    day from the canonical Work Pattern resolver above.
-- ---------------------------------------------------------------------------
create or replace function public.rebuild_attendance_workday(
  p_start_date date,
  p_end_date date,
  p_emp_codes text[] default null::text[]
)
returns table(deleted_rows integer, inserted_rows integer)
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_deleted integer := 0;
  v_inserted integer := 0;
begin
  if p_start_date is null or p_end_date is null then
    raise exception 'DATE_RANGE_REQUIRED';
  end if;

  if p_start_date > p_end_date then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  delete from public.attendance_workday aw
  where aw.work_date between p_start_date and p_end_date
    and (
      p_emp_codes is null
      or trim(aw.emp_code) = any(
        select trim(x) from unnest(p_emp_codes) as x
      )
    );
  get diagnostics v_deleted = row_count;

  insert into public.attendance_workday (
    work_date, display_date, emp_code, full_name, position_name, department, pc,
    area, sub_area, car_team, manager_department, manager_division,
    first_in, last_out, source_in_date, source_out_date, is_night_shift, expected_day,
    shift_code, shift_name, shift_start_time, shift_end_time, schedule_source, schedule_note,
    raw_meta, updated_at
  )
  with dates as (
    select generate_series(p_start_date, p_end_date, interval '1 day')::date as work_date
  ),
  employee_raw as (
    select
      trim(coalesce(
        nullif(to_jsonb(e)->>'EmployeeId',''),
        nullif(to_jsonb(e)->>'emp_code','')
      )) as emp_code,
      coalesce(
        nullif(to_jsonb(e)->>'full_name',''),
        nullif(to_jsonb(e)->>'ชื่อ-สกุล ภาษาไทย',''),
        nullif(to_jsonb(e)->>'FullName','')
      ) as full_name,
      coalesce(
        nullif(to_jsonb(e)->>'position_name',''),
        nullif(to_jsonb(e)->>'ตำแหน่ง','')
      ) as position_name,
      coalesce(
        nullif(to_jsonb(e)->>'department',''),
        nullif(to_jsonb(e)->>'หน่วยงาน','')
      ) as department,
      coalesce(nullif(to_jsonb(e)->>'pc',''), nullif(to_jsonb(e)->>'PC','')) as pc,
      coalesce(
        nullif(to_jsonb(e)->>'area',''),
        nullif(to_jsonb(e)->>'zone',''),
        nullif(to_jsonb(e)->>'พื้นที่','')
      ) as area,
      coalesce(
        nullif(to_jsonb(e)->>'sub_area',''),
        nullif(to_jsonb(e)->>'พื้นที่ย่อย','')
      ) as sub_area,
      coalesce(nullif(to_jsonb(e)->>'car_team',''), nullif(to_jsonb(e)->>'ทีมรถ','')) as car_team,
      coalesce(
        nullif(to_jsonb(e)->>'manager_department',''),
        nullif(to_jsonb(e)->>'ผู้บริหารระดับแผนก','')
      ) as manager_department,
      coalesce(
        nullif(to_jsonb(e)->>'manager_division',''),
        nullif(to_jsonb(e)->>'ผู้บริหารระดับฝ่าย','')
      ) as manager_division,
      coalesce(
        nullif(to_jsonb(e)->>'start_date','')::date,
        nullif(to_jsonb(e)->>'StartDate','')::date
      ) as start_date,
      coalesce(
        nullif(to_jsonb(e)->>'resign_date','')::date,
        nullif(to_jsonb(e)->>'ResignDate','')::date
      ) as resign_date
    from public.employees e
  ),
  emp_scope as (
    select distinct on (er.emp_code)
      er.*
    from employee_raw er
    where er.emp_code is not null
      and er.emp_code <> ''
      and (p_emp_codes is null or er.emp_code = any(
        select trim(x) from unnest(p_emp_codes) as x
      ))
      and (er.start_date is null or er.start_date <= p_end_date)
      and (er.resign_date is null or er.resign_date >= p_start_date)
    order by er.emp_code
  ),
  base as (
    select
      d.work_date,
      e.emp_code,
      e.full_name,
      e.position_name,
      e.department,
      e.pc,
      e.area,
      e.sub_area,
      e.car_team,
      e.manager_department,
      e.manager_division,
      e.start_date,
      e.resign_date,
      sc.shift_code,
      sm.shift_name,
      sm.start_time as shift_start_time,
      sm.end_time as shift_end_time,
      coalesce(sm.is_night_shift, false) as master_is_night_shift,
      coalesce(sm.is_workday, false) as master_is_workday,
      public._ta_expected_workday_v61448(
        e.emp_code, d.work_date
      ) as base_expected_day,
      sc.source_type as schedule_source,
      sc.note as schedule_note,
      case
        when sm.start_time is not null then d.work_date + sm.start_time
        else null
      end as shift_start_at,
      case
        when sm.start_time is null or sm.end_time is null then null
        when coalesce(sm.is_night_shift, false) or sm.end_time <= sm.start_time
          then d.work_date + sm.end_time + interval '1 day'
        else d.work_date + sm.end_time
      end as shift_end_at
    from dates d
    cross join emp_scope e
    left join public.shift_calendar sc
      on trim(sc.emp_code) = e.emp_code
     and sc.work_date = d.work_date
    left join public.shift_master sm
      on upper(trim(sm.shift_code)) = upper(trim(sc.shift_code))
  ),
  shift_match as (
    select
      b.*,
      coalesce(
        in_pref.log_at,
        case when b.base_expected_day = 1 then in_any.log_at else null end
      ) as matched_in_at,
      coalesce(
        out_pref.log_at,
        case when b.base_expected_day = 1 then out_any.log_at else null end
      ) as matched_out_at,
      case
        when in_pref.log_at is not null then 'MODE_IN'
        when b.base_expected_day = 1 and in_any.log_at is not null then 'WINDOW_FALLBACK'
        else null
      end as in_match_type,
      case
        when out_pref.log_at is not null then 'MODE_OUT'
        when b.base_expected_day = 1 and out_any.log_at is not null then 'WINDOW_FALLBACK'
        else null
      end as out_match_type
    from base b
    left join lateral (
      select (tl.inout_date + tl.inout_time) as log_at
      from public.time_logs tl
      where trim(tl.emp_code) = b.emp_code
        and upper(trim(coalesce(tl.normalized_mode,tl.inout_mode,''))) in ('IN','I','เข้า')
        and b.shift_start_at is not null
        and (tl.inout_date + tl.inout_time)
              between b.shift_start_at - interval '6 hours'
                  and b.shift_start_at + interval '4 hours'
      order by (tl.inout_date + tl.inout_time) asc
      limit 1
    ) in_pref on true
    left join lateral (
      select (tl.inout_date + tl.inout_time) as log_at
      from public.time_logs tl
      where trim(tl.emp_code) = b.emp_code
        and b.shift_start_at is not null
        and (tl.inout_date + tl.inout_time)
              between b.shift_start_at - interval '6 hours'
                  and b.shift_start_at + interval '4 hours'
      order by
        abs(extract(epoch from ((tl.inout_date + tl.inout_time) - b.shift_start_at))) asc,
        (tl.inout_date + tl.inout_time) asc
      limit 1
    ) in_any on true
    left join lateral (
      select (tl.inout_date + tl.inout_time) as log_at
      from public.time_logs tl
      where trim(tl.emp_code) = b.emp_code
        and upper(trim(coalesce(tl.normalized_mode,tl.inout_mode,''))) in ('OUT','O','ออก')
        and b.shift_end_at is not null
        and (tl.inout_date + tl.inout_time)
              between b.shift_end_at - interval '4 hours'
                  and b.shift_end_at + interval '8 hours'
        and (b.base_expected_day = 1 or in_pref.log_at is not null)
        and (
          coalesce(
            in_pref.log_at,
            case when b.base_expected_day = 1 then in_any.log_at else null end
          ) is null
          or (tl.inout_date + tl.inout_time) > coalesce(
            in_pref.log_at,
            case when b.base_expected_day = 1 then in_any.log_at else null end
          )
        )
      order by (tl.inout_date + tl.inout_time) desc
      limit 1
    ) out_pref on true
    left join lateral (
      select (tl.inout_date + tl.inout_time) as log_at
      from public.time_logs tl
      where trim(tl.emp_code) = b.emp_code
        and b.shift_end_at is not null
        and (tl.inout_date + tl.inout_time)
              between b.shift_end_at - interval '4 hours'
                  and b.shift_end_at + interval '8 hours'
        and (b.base_expected_day = 1 or in_pref.log_at is not null)
        and (
          coalesce(
            in_pref.log_at,
            case when b.base_expected_day = 1 then in_any.log_at else null end
          ) is null
          or (tl.inout_date + tl.inout_time) > coalesce(
            in_pref.log_at,
            case when b.base_expected_day = 1 then in_any.log_at else null end
          )
        )
      order by
        abs(extract(epoch from ((tl.inout_date + tl.inout_time) - b.shift_end_at))) asc,
        (tl.inout_date + tl.inout_time) desc
      limit 1
    ) out_any on true
  ),
  daily_fallback as (
    select
      sm.emp_code,
      sm.work_date,
      coalesce(
        (
          select min(tl.inout_date + tl.inout_time)
          from public.time_logs tl
          where trim(tl.emp_code) = sm.emp_code
            and tl.inout_date = sm.work_date
            and upper(trim(coalesce(tl.normalized_mode,tl.inout_mode,''))) in ('IN','I','เข้า')
        ),
        case when sm.base_expected_day = 1 then (
          select min(tl.inout_date + tl.inout_time)
          from public.time_logs tl
          where trim(tl.emp_code) = sm.emp_code
            and tl.inout_date = sm.work_date
        ) else null end
      ) as fallback_in_at
    from shift_match sm
    where sm.shift_start_at is null or sm.shift_end_at is null
  ),
  paired as (
    select
      sm.*,
      coalesce(sm.matched_in_at, df.fallback_in_at) as calc_in_at,
      case
        when sm.shift_start_at is not null and sm.shift_end_at is not null
          then sm.matched_out_at
        when df.fallback_in_at is null then null
        when df.fallback_in_at::time >= time '18:00' then coalesce(
          (
            select max(tl.inout_date + tl.inout_time)
            from public.time_logs tl
            where trim(tl.emp_code) = sm.emp_code
              and tl.inout_date = sm.work_date + 1
              and tl.inout_time between time '00:00' and time '12:00'
              and upper(trim(coalesce(tl.normalized_mode,tl.inout_mode,''))) in ('OUT','O','ออก')
          ),
          case when sm.base_expected_day = 1 then (
            select max(tl.inout_date + tl.inout_time)
            from public.time_logs tl
            where trim(tl.emp_code) = sm.emp_code
              and tl.inout_date = sm.work_date + 1
              and tl.inout_time between time '00:00' and time '12:00'
          ) else null end
        )
        else coalesce(
          (
            select max(tl.inout_date + tl.inout_time)
            from public.time_logs tl
            where trim(tl.emp_code) = sm.emp_code
              and tl.inout_date = sm.work_date
              and upper(trim(coalesce(tl.normalized_mode,tl.inout_mode,''))) in ('OUT','O','ออก')
              and (tl.inout_date + tl.inout_time) > df.fallback_in_at
          ),
          case when sm.base_expected_day = 1 then (
            select max(tl.inout_date + tl.inout_time)
            from public.time_logs tl
            where trim(tl.emp_code) = sm.emp_code
              and tl.inout_date = sm.work_date
              and (tl.inout_date + tl.inout_time) > df.fallback_in_at
          ) else null end
        )
      end as calc_out_at,
      case
        when sm.shift_start_at is not null and sm.shift_end_at is not null
          then coalesce(sm.master_is_night_shift, false) or sm.shift_end_at::date > sm.work_date
        when df.fallback_in_at is not null and df.fallback_in_at::time >= time '18:00'
          then true
        else false
      end as calc_is_night_shift,
      sm.base_expected_day as calc_expected_day
    from shift_match sm
    left join daily_fallback df
      on df.emp_code = sm.emp_code
     and df.work_date = sm.work_date
  )
  select
    p.work_date,
    to_char(p.work_date, 'DD/MM/YYYY'),
    p.emp_code,
    p.full_name,
    p.position_name,
    p.department,
    p.pc,
    p.area,
    p.sub_area,
    p.car_team,
    p.manager_department,
    p.manager_division,
    p.calc_in_at::time,
    p.calc_out_at::time,
    p.calc_in_at::date,
    p.calc_out_at::date,
    p.calc_is_night_shift,
    p.calc_expected_day,
    p.shift_code,
    p.shift_name,
    p.shift_start_time,
    p.shift_end_time,
    p.schedule_source,
    p.schedule_note,
    jsonb_build_object(
      'rebuilt_at', now(),
      'match_version', 'SHIFT_WINDOW_V61448_CANONICAL_EXPECTED_DAY',
      'offday_strict_punch_mode', true,
      'has_schedule', p.shift_code is not null,
      'shift_start_at', p.shift_start_at,
      'shift_end_at', p.shift_end_at,
      'matched_in_at', p.calc_in_at,
      'matched_out_at', p.calc_out_at,
      'in_match_type', p.in_match_type,
      'out_match_type', p.out_match_type,
      'in_window_before_hours', 6,
      'in_window_after_hours', 4,
      'out_window_before_hours', 4,
      'out_window_after_hours', 8
    ),
    now()
  from paired p
  where p.calc_expected_day = 1
     or p.calc_in_at is not null
     or p.calc_out_at is not null
     or p.shift_code is not null
  on conflict (work_date, emp_code) do update
  set
    display_date = excluded.display_date,
    full_name = excluded.full_name,
    position_name = excluded.position_name,
    department = excluded.department,
    pc = excluded.pc,
    area = excluded.area,
    sub_area = excluded.sub_area,
    car_team = excluded.car_team,
    manager_department = excluded.manager_department,
    manager_division = excluded.manager_division,
    first_in = excluded.first_in,
    last_out = excluded.last_out,
    source_in_date = excluded.source_in_date,
    source_out_date = excluded.source_out_date,
    is_night_shift = excluded.is_night_shift,
    expected_day = excluded.expected_day,
    shift_code = excluded.shift_code,
    shift_name = excluded.shift_name,
    shift_start_time = excluded.shift_start_time,
    shift_end_time = excluded.shift_end_time,
    schedule_source = excluded.schedule_source,
    schedule_note = excluded.schedule_note,
    raw_meta = excluded.raw_meta,
    updated_at = now();

  get diagnostics v_inserted = row_count;
  return query select v_deleted, v_inserted;
end;
$function$;

comment on function public.rebuild_attendance_workday(date,date,text[])
is 'V6.14.48: Canonical Work-Pattern expected day + strict IN/OUT ownership on non-working days; timezone/frontend consistency release.';

grant execute on function public.rebuild_attendance_workday(date,date,text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Clean already-built rows that are demonstrably previous-day OUT carryovers.
-- This is intentionally narrow: expected_day=0 / non-working assignment only,
-- and the current first_in must equal the previous work_date last_out timestamp.
-- ---------------------------------------------------------------------------
with suspicious as materialized (
  select
    aw.emp_code,
    aw.work_date,
    aw.first_in,
    coalesce(aw.source_in_date,aw.work_date) as source_in_date
  from public.attendance_workday aw
  left join public.shift_calendar sc
    on public.normalize_emp_code(sc.emp_code)=public.normalize_emp_code(aw.emp_code)
   and sc.work_date=aw.work_date
  left join public.shift_master sm
    on upper(trim(sm.shift_code))=upper(trim(sc.shift_code))
  left join public.attendance_workday prev
    on public.normalize_emp_code(prev.emp_code)=public.normalize_emp_code(aw.emp_code)
   and prev.work_date=aw.work_date-1
  where aw.first_in is not null
    and (
      coalesce(aw.expected_day,0)=0
      or (sm.shift_code is not null and coalesce(sm.is_workday,false)=false)
    )
    and (
      (
        prev.last_out is not null
        and prev.last_out=aw.first_in
        and coalesce(
              prev.source_out_date,
              prev.work_date + case
                when prev.first_in is not null and prev.last_out < prev.first_in then 1
                else 0
              end
            ) = coalesce(aw.source_in_date,aw.work_date)
      )
      or (
        exists(
          select 1 from public.time_logs tl
          where public.normalize_emp_code(tl.emp_code)=public.normalize_emp_code(aw.emp_code)
            and tl.inout_date=coalesce(aw.source_in_date,aw.work_date)
            and tl.inout_time=aw.first_in
            and upper(trim(coalesce(tl.normalized_mode,tl.inout_mode,''))) in ('OUT','O','ออก')
        )
        and not exists(
          select 1 from public.time_logs tl
          where public.normalize_emp_code(tl.emp_code)=public.normalize_emp_code(aw.emp_code)
            and tl.inout_date=coalesce(aw.source_in_date,aw.work_date)
            and tl.inout_time=aw.first_in
            and upper(trim(coalesce(tl.normalized_mode,tl.inout_mode,''))) in ('IN','I','เข้า')
        )
      )
    )
), cleaned as (
  update public.attendance_workday aw
  set
    raw_meta=coalesce(aw.raw_meta,'{}'::jsonb) || jsonb_build_object(
      'offday_punch_ownership_fix','V6.14.48',
      'removed_carryover_first_in',to_char(aw.first_in,'HH24:MI:SS'),
      'removed_carryover_source_date',coalesce(aw.source_in_date,aw.work_date)
    ),
    first_in=null,
    source_in_date=null,
    updated_at=now()
  from suspicious s
  where public.normalize_emp_code(aw.emp_code)=public.normalize_emp_code(s.emp_code)
    and aw.work_date=s.work_date
  returning aw.emp_code,aw.work_date
)
select count(*) as cleaned_offday_carryover_rows from cleaned;

notify pgrst, 'reload schema';
commit;
