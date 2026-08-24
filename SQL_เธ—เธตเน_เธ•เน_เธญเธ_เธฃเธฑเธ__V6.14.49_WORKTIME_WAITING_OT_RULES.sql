-- ============================================================================
-- SQL ที่ต้องรัน
-- TimeAttendance V6.14.49
-- Work Time / Waiting / Overtime Rules Consistency
-- ============================================================================
-- เป้าหมาย
-- 1) WAITING ไม่ถูกนับเป็นเวลาทำงานทุกกรณี
-- 2) Split 2 ช่วง ใช้ Punch IN/OUT ของแต่ละช่วงจริง ไม่ใช้ first_in -> last_out ทั้งวัน
-- 3) OT แยกตาม Work Mode:
--    NORMAL                 = เวลาทำงานหลังเวลาสิ้นสุดกะ
--    NORMAL_LATE_CUSTOMER   = เวลาทำงานจริงของกะที่ 2 ตั้งแต่เวลาเริ่มกะที่ 2
--    SPLIT_WAIT_NIGHT       = ชั่วโมงสุทธิรวมกะ 1 + กะ 2 ที่เกินชั่วโมงมาตรฐานต่อวัน
--    HOUR_BASED             = เวลาทำงานหลังเวลาสิ้นสุดกะที่ระบบคำนวณ
-- 4) กฎ Late / Absent / Early Leave / Day-off / Night Sequence เดิมคงเดิม
-- ============================================================================

begin;
set local statement_timeout = '0';
select pg_advisory_xact_lock(hashtext('timeclock_v61449_worktime_waiting_ot_rules'));

-- Preconditions ---------------------------------------------------------------
do $$
begin
  if to_regclass('public.ta_attendance_calculations') is null then
    raise exception 'MISSING_TABLE: ta_attendance_calculations';
  end if;
  if to_regclass('public.ta_attendance_segment_results') is null then
    raise exception 'MISSING_TABLE: ta_attendance_segment_results';
  end if;
  if to_regclass('public.attendance_workday') is null then
    raise exception 'MISSING_TABLE: attendance_workday';
  end if;
  if to_regclass('public.time_logs') is null then
    raise exception 'MISSING_TABLE: time_logs';
  end if;
  if to_regclass('public.ta_schedule_rule_assignments') is null then
    raise exception 'MISSING_TABLE: ta_schedule_rule_assignments';
  end if;
  if to_regclass('public.shift_calendar') is null then
    raise exception 'MISSING_TABLE: shift_calendar';
  end if;
  if to_regprocedure('public.normalize_emp_code(text)') is null then
    raise exception 'MISSING_FUNCTION: normalize_emp_code';
  end if;
  if to_regprocedure('public._ta_refresh_attendance_calc_core_v630(date,date,text[])') is null then
    raise exception 'MISSING_FUNCTION: _ta_refresh_attendance_calc_core_v630';
  end if;
  if to_regprocedure('public.ta_v6120_can_schedule()') is null then
    raise exception 'MISSING_FUNCTION: ta_v6120_can_schedule';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1) Internal 2-shift punch resolver.
--    Same punch ownership principle as V6.11.10, but internal and Scope-neutral
--    so every Calculation path uses the same pair for Shift 1 / Shift 2.
-- -----------------------------------------------------------------------------
create or replace function public._ta_work_mode_punch_meta_v61449(
  p_emp_code text,
  p_work_date date
)
returns table (
  paid_segment_count integer,
  shift_1_planned_start_at timestamp without time zone,
  shift_1_planned_end_at timestamp without time zone,
  shift_1_actual_in_at timestamp without time zone,
  shift_1_actual_out_at timestamp without time zone,
  shift_2_planned_start_at timestamp without time zone,
  shift_2_planned_end_at timestamp without time zone,
  shift_2_actual_in_at timestamp without time zone,
  shift_2_actual_out_at timestamp without time zone
)
language sql
stable
security definer
set search_path=public
as $$
  with params as (
    select public.normalize_emp_code(p_emp_code) as emp_code,p_work_date as work_date
  ),
  ranked as materialized (
    select
      s.emp_code,
      s.work_date,
      s.segment_no,
      s.planned_start_at,
      s.planned_end_at,
      row_number() over(
        partition by s.emp_code,s.work_date
        order by s.segment_no
      )::integer as work_segment_no
    from public.ta_attendance_segment_results s
    cross join params p
    where public.normalize_emp_code(s.emp_code)=p.emp_code
      and s.work_date=p.work_date
      and upper(trim(coalesce(s.segment_type,''))) in ('WORK','TRAVEL')
      and coalesce(s.paid,true)
  ),
  seg as materialized (
    select * from ranked where work_segment_no<=2
  ),
  punches as materialized (
    select
      public.normalize_emp_code(t.emp_code) as emp_code,
      (t.inout_date+t.inout_time)::timestamp without time zone as punch_at,
      case
        when upper(trim(coalesce(t.normalized_mode,t.inout_mode,''))) in ('IN','I','เข้า') then 'IN'
        when upper(trim(coalesce(t.normalized_mode,t.inout_mode,''))) in ('OUT','O','ออก') then 'OUT'
        else null
      end as punch_mode
    from public.time_logs t
    cross join params p
    where public.normalize_emp_code(t.emp_code)=p.emp_code
      and t.inout_date between p.work_date-1 and p.work_date+2
  ),
  paired as materialized (
    select
      s.*,
      (
        select p.punch_at
        from punches p
        where p.punch_mode='IN'
          and p.punch_at between s.planned_start_at-interval '4 hours'
            and coalesce(s.planned_end_at,s.planned_start_at+interval '16 hours')
        order by abs(extract(epoch from (p.punch_at-s.planned_start_at))),p.punch_at
        limit 1
      ) as actual_in_at,
      (
        select p.punch_at
        from punches p
        where p.punch_mode='OUT'
          and p.punch_at>=s.planned_start_at
          and p.punch_at<=coalesce(s.planned_end_at+interval '4 hours',s.planned_start_at+interval '16 hours')
        order by
          case when s.planned_end_at is null then 0
               else abs(extract(epoch from (p.punch_at-s.planned_end_at))) end,
          case when s.planned_end_at is null then p.punch_at end desc,
          p.punch_at desc
        limit 1
      ) as actual_out_at
    from seg s
  ),
  agg as (
    select
      count(*)::integer as paid_segment_count,
      max(planned_start_at) filter(where work_segment_no=1) as s1_ps,
      max(planned_end_at)   filter(where work_segment_no=1) as s1_pe,
      max(actual_in_at)     filter(where work_segment_no=1) as s1_ai,
      max(actual_out_at)    filter(where work_segment_no=1) as s1_ao,
      max(planned_start_at) filter(where work_segment_no=2) as s2_ps,
      max(planned_end_at)   filter(where work_segment_no=2) as s2_pe,
      max(actual_in_at)     filter(where work_segment_no=2) as s2_ai,
      max(actual_out_at)    filter(where work_segment_no=2) as s2_ao
    from paired
  ),
  aw as (
    select
      case when a.first_in is null then null
           else (coalesce(a.source_in_date,a.work_date)+a.first_in)::timestamp without time zone end as first_in_at,
      case when a.last_out is null then null
           else (
             coalesce(
               a.source_out_date,
               a.work_date + case when a.first_in is not null and a.last_out<a.first_in then 1 else 0 end
             ) + a.last_out
           )::timestamp without time zone end as last_out_at
    from public.attendance_workday a
    cross join params p
    where public.normalize_emp_code(a.emp_code)=p.emp_code
      and a.work_date=p.work_date
    limit 1
  )
  select
    coalesce(g.paid_segment_count,0),
    g.s1_ps,
    g.s1_pe,
    case when coalesce(g.paid_segment_count,0)<=1 then coalesce(g.s1_ai,a.first_in_at) else g.s1_ai end,
    case when coalesce(g.paid_segment_count,0)<=1 then coalesce(g.s1_ao,a.last_out_at) else g.s1_ao end,
    g.s2_ps,
    g.s2_pe,
    g.s2_ai,
    g.s2_ao
  from agg g
  left join aw a on true;
$$;

revoke all on function public._ta_work_mode_punch_meta_v61449(text,date) from public;

-- -----------------------------------------------------------------------------
-- 2) Pure business-rule calculator. Used by the trigger and unit tests.
-- -----------------------------------------------------------------------------
create or replace function public._ta_compute_worktime_metrics_v61449(
  p_mode text,
  p_day_type text,
  p_standard_minutes numeric,
  p_break_minutes numeric,
  p_s1_planned_start timestamp without time zone,
  p_s1_planned_end timestamp without time zone,
  p_s1_actual_in timestamp without time zone,
  p_s1_actual_out timestamp without time zone,
  p_s2_planned_start timestamp without time zone,
  p_s2_planned_end timestamp without time zone,
  p_s2_actual_in timestamp without time zone,
  p_s2_actual_out timestamp without time zone,
  p_fallback_planned_paid numeric,
  p_fallback_waiting numeric,
  p_fallback_break numeric,
  p_fallback_paid numeric,
  p_fallback_regular numeric,
  p_fallback_ot numeric
)
returns table (
  planned_paid_minutes numeric,
  waiting_minutes numeric,
  break_deducted_minutes numeric,
  gross_work_minutes numeric,
  paid_work_minutes numeric,
  regular_minutes numeric,
  overtime_minutes numeric,
  waiting_source text,
  ot_rule text
)
language plpgsql
immutable
set search_path=public
as $$
declare
  v_mode text:=upper(trim(coalesce(p_mode,'NORMAL')));
  v_day text:=upper(trim(coalesce(p_day_type,'')));
  v_standard numeric:=greatest(coalesce(p_standard_minutes,0),0);
  v_break_cfg numeric:=greatest(coalesce(p_break_minutes,0),0);
  v_s1_start timestamp;
  v_s2_start timestamp;
  v_s1 numeric:=0;
  v_s2 numeric:=0;
  v_planned1 numeric:=0;
  v_planned2 numeric:=0;
  v_wait numeric:=0;
  v_break numeric:=0;
  v_gross numeric:=0;
  v_paid numeric:=greatest(coalesce(p_fallback_paid,0),0);
  v_regular numeric:=greatest(coalesce(p_fallback_regular,0),0);
  v_ot numeric:=greatest(coalesce(p_fallback_ot,0),0);
  v_wait_source text:='CORE';
  v_ot_rule text:='CORE_DAILY_THRESHOLD';
begin
  if v_day<>'WORKDAY' then
    return query select
      greatest(coalesce(p_fallback_planned_paid,0),0),
      greatest(coalesce(p_fallback_waiting,0),0),
      greatest(coalesce(p_fallback_break,0),0),
      greatest(coalesce(p_fallback_paid,0),0)+greatest(coalesce(p_fallback_break,0),0),
      greatest(coalesce(p_fallback_paid,0),0),
      greatest(coalesce(p_fallback_regular,0),0),
      0::numeric,
      'NON_WORKDAY'::text,
      'NON_WORKDAY_NO_OT'::text;
    return;
  end if;

  if v_mode in ('NORMAL_LATE_CUSTOMER','SPLIT_WAIT_NIGHT') then
    if p_s1_planned_start is not null and p_s1_planned_end is not null and p_s1_planned_end>p_s1_planned_start then
      v_planned1:=extract(epoch from (p_s1_planned_end-p_s1_planned_start))/60.0;
    end if;
    if p_s2_planned_start is not null and p_s2_planned_end is not null and p_s2_planned_end>p_s2_planned_start then
      v_planned2:=extract(epoch from (p_s2_planned_end-p_s2_planned_start))/60.0;
    end if;

    if p_s1_actual_in is not null and p_s1_actual_out is not null then
      v_s1_start:=greatest(p_s1_actual_in,coalesce(p_s1_planned_start,p_s1_actual_in));
      if p_s1_actual_out>v_s1_start then
        v_s1:=extract(epoch from (p_s1_actual_out-v_s1_start))/60.0;
      end if;
    end if;

    if p_s2_actual_in is not null and p_s2_actual_out is not null then
      v_s2_start:=greatest(p_s2_actual_in,coalesce(p_s2_planned_start,p_s2_actual_in));
      if p_s2_actual_out>v_s2_start then
        v_s2:=extract(epoch from (p_s2_actual_out-v_s2_start))/60.0;
      end if;
    end if;

    if p_s1_actual_out is not null and p_s2_actual_in is not null and p_s2_actual_in>=p_s1_actual_out then
      v_wait:=extract(epoch from (p_s2_actual_in-p_s1_actual_out))/60.0;
      v_wait_source:='ACTUAL_OUT1_TO_IN2';
    elsif p_s1_planned_end is not null and p_s2_planned_start is not null and p_s2_planned_start>=p_s1_planned_end then
      v_wait:=extract(epoch from (p_s2_planned_start-p_s1_planned_end))/60.0;
      v_wait_source:='PLANNED_END1_TO_START2';
    else
      v_wait:=0;
      v_wait_source:='NO_WAITING_WINDOW';
    end if;

    v_gross:=greatest(v_s1,0)+greatest(v_s2,0);
    v_break:=case when v_gross>=300 then least(v_break_cfg,v_gross) else 0 end;
    v_paid:=greatest(0,v_gross-v_break);

    if v_mode='NORMAL_LATE_CUSTOMER' then
      -- OT is actual worked time of Shift 2, starting no earlier than its planned start.
      v_ot:=greatest(v_s2,0);
      v_regular:=greatest(0,v_paid-v_ot);
      v_ot_rule:='SHIFT_2_ACTUAL_WORK_FROM_SHIFT_2_START';
    else
      -- Split Wait Night fills the normal daily hours first; only excess net hours are OT.
      v_ot:=greatest(0,v_paid-v_standard);
      v_regular:=least(v_paid,v_standard);
      v_ot_rule:='NET_WORK_OVER_DAILY_STANDARD';
    end if;

    return query select
      greatest(0,v_planned1+v_planned2),
      greatest(0,v_wait),
      greatest(0,v_break),
      greatest(0,v_gross),
      greatest(0,v_paid),
      greatest(0,v_regular),
      greatest(0,v_ot),
      v_wait_source,
      v_ot_rule;
    return;
  end if;

  if v_mode in ('NORMAL','HOUR_BASED') then
    v_ot:=0;
    if p_s1_actual_out is not null and p_s1_planned_end is not null and p_s1_actual_out>p_s1_planned_end then
      v_ot:=extract(epoch from (p_s1_actual_out-p_s1_planned_end))/60.0;
    end if;
    v_paid:=greatest(coalesce(p_fallback_paid,0),0);
    v_regular:=greatest(0,v_paid-v_ot);
    v_ot_rule:=case when v_mode='HOUR_BASED'
      then 'ACTUAL_OUT_AFTER_COMPUTED_SHIFT_END'
      else 'ACTUAL_OUT_AFTER_SHIFT_END' end;

    return query select
      greatest(coalesce(p_fallback_planned_paid,0),0),
      0::numeric,
      greatest(coalesce(p_fallback_break,0),0),
      greatest(0,v_paid+greatest(coalesce(p_fallback_break,0),0)),
      v_paid,
      v_regular,
      greatest(0,v_ot),
      'NONE'::text,
      v_ot_rule;
    return;
  end if;

  return query select
    greatest(coalesce(p_fallback_planned_paid,0),0),
    greatest(coalesce(p_fallback_waiting,0),0),
    greatest(coalesce(p_fallback_break,0),0),
    greatest(0,coalesce(p_fallback_paid,0)+coalesce(p_fallback_break,0)),
    greatest(coalesce(p_fallback_paid,0),0),
    greatest(coalesce(p_fallback_regular,0),0),
    greatest(coalesce(p_fallback_ot,0),0),
    'CORE'::text,
    'CORE_DAILY_THRESHOLD'::text;
end;
$$;

revoke all on function public._ta_compute_worktime_metrics_v61449(
  text,text,numeric,numeric,
  timestamp without time zone,timestamp without time zone,
  timestamp without time zone,timestamp without time zone,
  timestamp without time zone,timestamp without time zone,
  timestamp without time zone,timestamp without time zone,
  numeric,numeric,numeric,numeric,numeric,numeric
) from public;

-- -----------------------------------------------------------------------------
-- 3) Central BEFORE trigger on Calculation result.
--    Name "zy" intentionally runs before V6.14.28/V6.6.4 "zz" classification.
-- -----------------------------------------------------------------------------
create or replace function public._ta_apply_work_mode_metrics_v61449()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp text:=public.normalize_emp_code(new.emp_code);
  v_mode text;
  v_shift_code text;
  v_rule public.ta_schedule_rule_assignments%rowtype;
  v_p record;
  v_m record;
  v_s1_ps timestamp;
  v_s1_pe timestamp;
  v_s1_ai timestamp;
  v_s1_ao timestamp;
  v_s2_ps timestamp;
  v_s2_pe timestamp;
  v_s2_ai timestamp;
  v_s2_ao timestamp;
begin
  select a.* into v_rule
  from public.ta_schedule_rule_assignments a
  where public.normalize_emp_code(a.emp_code)=v_emp
    and a.work_date=new.work_date
  order by coalesce(a.updated_at,a.created_at,now()) desc
  limit 1;

  v_mode:=upper(trim(coalesce(v_rule.work_mode_code,'')));

  select upper(trim(coalesce(c.shift_code,''))) into v_shift_code
  from public.shift_calendar c
  where public.normalize_emp_code(c.emp_code)=v_emp
    and c.work_date=new.work_date
  order by coalesce(c.updated_at,now()) desc
  limit 1;

  -- Compatibility inference for records created before Schedule Rule metadata.
  if nullif(v_mode,'') is null then
    if coalesce(v_shift_code,'') like 'SW%' then
      v_mode:='SPLIT_WAIT_NIGHT';
    elsif coalesce(v_shift_code,'') ~ '^H[56]' then
      v_mode:='HOUR_BASED';
    elsif upper(trim(coalesce(new.template_code,'')))='SPLIT_FLEX' then
      v_mode:='NORMAL_LATE_CUSTOMER';
    else
      v_mode:='NORMAL';
    end if;
  end if;

  select * into v_p
  from public._ta_work_mode_punch_meta_v61449(v_emp,new.work_date)
  limit 1;

  v_s1_ps:=coalesce(v_p.shift_1_planned_start_at,new.planned_start_at);
  v_s1_pe:=coalesce(v_p.shift_1_planned_end_at,new.planned_end_at);
  v_s1_ai:=v_p.shift_1_actual_in_at;
  v_s1_ao:=v_p.shift_1_actual_out_at;
  v_s2_ps:=v_p.shift_2_planned_start_at;
  v_s2_pe:=v_p.shift_2_planned_end_at;
  v_s2_ai:=v_p.shift_2_actual_in_at;
  v_s2_ao:=v_p.shift_2_actual_out_at;

  select * into v_m
  from public._ta_compute_worktime_metrics_v61449(
    v_mode,
    new.day_type,
    new.standard_work_minutes,
    new.pattern_break_minutes,
    v_s1_ps,v_s1_pe,v_s1_ai,v_s1_ao,
    v_s2_ps,v_s2_pe,v_s2_ai,v_s2_ao,
    new.planned_paid_minutes,
    new.waiting_minutes,
    new.break_deducted_minutes,
    new.paid_work_minutes,
    new.regular_minutes,
    new.overtime_minutes
  );

  new.planned_paid_minutes:=v_m.planned_paid_minutes;
  new.waiting_minutes:=v_m.waiting_minutes;
  new.break_deducted_minutes:=v_m.break_deducted_minutes;
  new.paid_work_minutes:=v_m.paid_work_minutes;
  new.regular_minutes:=v_m.regular_minutes;
  new.overtime_minutes:=v_m.overtime_minutes;

  -- Preserve absence/late/early classifications. Only normalize NORMAL/OVERTIME.
  if upper(coalesce(new.calculation_status,'')) in ('NORMAL','OVERTIME') then
    new.calculation_status:=case when coalesce(new.overtime_minutes,0)>0 then 'OVERTIME' else 'NORMAL' end;
  end if;

  new.raw_meta:=coalesce(new.raw_meta,'{}'::jsonb)||jsonb_build_object(
    'worktime_rule_version','V6.14.49',
    'work_mode_code',v_mode,
    'waiting_minutes',new.waiting_minutes,
    'waiting_source',v_m.waiting_source,
    'gross_work_minutes_before_break',v_m.gross_work_minutes,
    'break_deducted_minutes',new.break_deducted_minutes,
    'paid_work_minutes_after_wait_break',new.paid_work_minutes,
    'regular_minutes',new.regular_minutes,
    'overtime_minutes',new.overtime_minutes,
    'ot_rule',v_m.ot_rule,
    'split_shift_1_actual_in_at',v_s1_ai,
    'split_shift_1_actual_out_at',v_s1_ao,
    'split_shift_2_actual_in_at',v_s2_ai,
    'split_shift_2_actual_out_at',v_s2_ao
  );

  return new;
end;
$$;

revoke all on function public._ta_apply_work_mode_metrics_v61449() from public;

do $$
begin
  if not exists(
    select 1 from pg_trigger t
    where t.tgrelid='public.ta_attendance_calculations'::regclass
      and t.tgname='trg_zy_ta_work_mode_metrics_v61449'
      and not t.tgisinternal
  ) then
    execute $ddl$
      create trigger trg_zy_ta_work_mode_metrics_v61449
      before insert or update
      on public.ta_attendance_calculations
      for each row
      execute function public._ta_apply_work_mode_metrics_v61449()
    $ddl$;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4) Scheduling Rule write/delete must recalculate AFTER mode metadata changes.
--    Previously the main Schedule save recalculated first and the extension was
--    written later, leaving Waiting/OT one step behind until the next rebuild.
-- -----------------------------------------------------------------------------
create or replace function public.ta_upsert_schedule_rule_assignment_v6120(
  p_emp_code text,
  p_work_date date,
  p_work_mode_code text,
  p_base_shift_code text default null,
  p_generated_shift_code text default null,
  p_first_segment_end time default null,
  p_second_segment_start time default null,
  p_second_segment_planned_end time default null,
  p_custom_start_time time default null,
  p_custom_end_time time default null,
  p_off_window_start time default null,
  p_off_window_end time default null,
  p_off_basis_shift_code text default null,
  p_planned_minutes integer default 0,
  p_validation_snapshot jsonb default '{}'::jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp text:=public.normalize_emp_code(p_emp_code);
  v_recalc jsonb:=null;
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;
  if not exists(select 1 from public.ta_work_modes where mode_code=upper(p_work_mode_code) and is_active=true) then raise exception 'WORK_MODE_NOT_ACTIVE'; end if;
  if not exists(select 1 from public.shift_calendar c where public.normalize_emp_code(c.emp_code)=v_emp and c.work_date=p_work_date) then raise exception 'SHIFT_ASSIGNMENT_REQUIRED_BEFORE_RULE_EXTENSION'; end if;

  insert into public.ta_schedule_rule_assignments(
    emp_code,work_date,work_mode_code,base_shift_code,generated_shift_code,first_segment_end,second_segment_start,second_segment_planned_end,
    custom_start_time,custom_end_time,off_window_start,off_window_end,off_basis_shift_code,planned_minutes,validation_snapshot,note,created_by,updated_by
  ) values(
    v_emp,p_work_date,upper(p_work_mode_code),nullif(upper(coalesce(p_base_shift_code,'')),''),nullif(upper(coalesce(p_generated_shift_code,'')),''),p_first_segment_end,p_second_segment_start,p_second_segment_planned_end,
    p_custom_start_time,p_custom_end_time,p_off_window_start,p_off_window_end,nullif(upper(coalesce(p_off_basis_shift_code,'')),''),greatest(coalesce(p_planned_minutes,0),0),coalesce(p_validation_snapshot,'{}'::jsonb),p_note,auth.uid(),auth.uid()
  )
  on conflict(emp_code,work_date) do update set
    work_mode_code=excluded.work_mode_code,base_shift_code=excluded.base_shift_code,generated_shift_code=excluded.generated_shift_code,
    first_segment_end=excluded.first_segment_end,second_segment_start=excluded.second_segment_start,second_segment_planned_end=excluded.second_segment_planned_end,
    custom_start_time=excluded.custom_start_time,custom_end_time=excluded.custom_end_time,off_window_start=excluded.off_window_start,off_window_end=excluded.off_window_end,
    off_basis_shift_code=excluded.off_basis_shift_code,planned_minutes=excluded.planned_minutes,validation_snapshot=excluded.validation_snapshot,note=excluded.note,updated_at=now(),updated_by=auth.uid();

  if exists(
    select 1 from public.attendance_workday aw
    where public.normalize_emp_code(aw.emp_code)=v_emp and aw.work_date=p_work_date
  ) then
    v_recalc:=public._ta_refresh_attendance_calc_core_v630(p_work_date,p_work_date,array[v_emp]::text[]);
  end if;

  return jsonb_build_object(
    'ok',true,
    'emp_code',v_emp,
    'work_date',p_work_date,
    'work_mode_code',upper(p_work_mode_code),
    'attendance_recalculation',v_recalc,
    'version','V6.14.49'
  );
end;
$$;

create or replace function public.ta_delete_schedule_rule_assignment_v6120(
  p_emp_code text,
  p_work_date date
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp text:=public.normalize_emp_code(p_emp_code);
begin
  if not public.ta_v6120_can_schedule() then raise exception 'SCHEDULE_PERMISSION_DENIED'; end if;
  delete from public.ta_schedule_rule_assignments
  where public.normalize_emp_code(emp_code)=v_emp and work_date=p_work_date;

  if exists(
    select 1 from public.attendance_workday aw
    where public.normalize_emp_code(aw.emp_code)=v_emp and aw.work_date=p_work_date
  ) then
    perform public._ta_refresh_attendance_calc_core_v630(p_work_date,p_work_date,array[v_emp]::text[]);
  end if;
  return true;
end;
$$;

revoke all on function public.ta_upsert_schedule_rule_assignment_v6120(text,date,text,text,text,time,time,time,time,time,time,time,text,integer,jsonb,text) from public;
grant execute on function public.ta_upsert_schedule_rule_assignment_v6120(text,date,text,text,text,time,time,time,time,time,time,time,text,integer,jsonb,text) to authenticated;
revoke all on function public.ta_delete_schedule_rule_assignment_v6120(text,date) from public;
grant execute on function public.ta_delete_schedule_rule_assignment_v6120(text,date) to authenticated;

-- -----------------------------------------------------------------------------
-- 5) HR Admin maintenance RPC for existing history after installing V6.14.49.
--    Attendance Rebuild already calls the same Calculation Core; this is only an
--    optional direct recalculation entry point for a known date range.
-- -----------------------------------------------------------------------------
create or replace function public.ta_refresh_worktime_metrics_v61449(
  p_start_date date,
  p_end_date date,
  p_emp_codes text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_result jsonb;
begin
  if to_regprocedure('public._ta_require_hr_admin()') is not null then
    perform public._ta_require_hr_admin();
  end if;
  if p_start_date is null or p_end_date is null or p_start_date>p_end_date then
    raise exception 'INVALID_DATE_RANGE';
  end if;
  v_result:=public._ta_refresh_attendance_calc_core_v630(p_start_date,p_end_date,p_emp_codes);
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('worktime_rule_version','V6.14.49');
end;
$$;

revoke all on function public.ta_refresh_worktime_metrics_v61449(date,date,text[]) from public;
grant execute on function public.ta_refresh_worktime_metrics_v61449(date,date,text[]) to authenticated;

notify pgrst,'reload schema';
commit;
