-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.1
-- Schedule Guard 48h / Minimum Rest - Effective Schedule Fix
-- ============================================================================

begin;
set local statement_timeout = '0';

-- Preconditions ---------------------------------------------------------------
do $$
begin
  if to_regprocedure(
    'public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_get_schedule_range_light_v6134';
  end if;
  if to_regclass('public.shift_master') is null then
    raise exception 'MISSING_TABLE: shift_master';
  end if;
  if to_regclass('public.ta_schedule_rule_assignments') is null then
    raise exception 'MISSING_TABLE: ta_schedule_rule_assignments';
  end if;
end;
$$;

-- Canonical guard -------------------------------------------------------------
create or replace function public.ta_validate_schedule_guard_v6141(
  p_emp_code text,
  p_work_date date,
  p_proposed_shift_code text,
  p_proposed_start_time time default null,
  p_proposed_end_time time default null,
  p_proposed_planned_minutes integer default 0,
  p_is_off boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp text:=public.normalize_emp_code(p_emp_code);
  v_expected date:=p_work_date-1;
  v_first boolean:=true;
  v_cont integer:=0;
  v_after integer:=0;
  v_rest integer:=null;
  v_hard boolean:=false;
  v_warn boolean:=false;
  v_code text;
  v_is_off boolean;
  v_minutes integer;
  v_prev_start time;
  v_prev_end time;
  v_prev_end_ts timestamp;
  v_next_start_ts timestamp;
  v_days_counted integer:=0;
  v_reset_date date:=null;
  r record;
begin
  if p_work_date is null then
    raise exception 'WORK_DATE_REQUIRED';
  end if;
  if nullif(v_emp,'') is null then
    raise exception 'EMP_CODE_REQUIRED';
  end if;

  -- The lightweight schedule returns the EFFECTIVE shift for every accessible
  -- calendar day, including default shifts and paired default day-off shifts.
  -- Walk backwards consecutively and stop at the first actual day-off.
  for r in
    select
      s.work_date,
      upper(trim(coalesce(s.effective_shift_code,''))) as effective_shift_code,
      s.shift_start_time,
      s.shift_end_time,
      coalesce(sm.is_workday,true) as master_is_workday,
      coalesce(sm.scheduled_minutes_including_break,0) as master_planned_minutes,
      a.work_mode_code,
      a.planned_minutes as rule_planned_minutes,
      a.custom_start_time,
      a.custom_end_time,
      a.second_segment_start,
      a.second_segment_planned_end,
      d.customer_window_start,
      d.customer_window_end,
      d.template_code as daily_template_code
    from public.ta_get_schedule_range_light_v6134(
      p_work_date-31,
      p_work_date-1,
      null,
      null,
      array[v_emp]::text[],
      null
    ) s
    left join public.shift_master sm
      on upper(trim(sm.shift_code))=upper(trim(s.effective_shift_code))
    left join public.ta_schedule_rule_assignments a
      on a.emp_code=v_emp
     and a.work_date=s.work_date
    left join lateral (
      select
        x.customer_window_start,
        x.customer_window_end,
        x.template_code
      from public.ta_daily_work_plans x
      where x.emp_code=v_emp
        and x.work_date=s.work_date
        and coalesce(x.status,'')<>'CANCELLED'
      order by x.updated_at desc nulls last, x.created_at desc nulls last
      limit 1
    ) d on true
    order by s.work_date desc
  loop
    -- If a date is missing, do not bridge the gap and invent continuity.
    if r.work_date<>v_expected then
      exit;
    end if;
    v_expected:=v_expected-1;

    v_code:=upper(trim(coalesce(r.effective_shift_code,'')));
    v_is_off :=
      v_code in ('OFF','HOL','LV')
      or r.master_is_workday=false;

    if v_is_off then
      v_reset_date:=r.work_date;
      exit;
    end if;

    -- Previous-day end for the 6-hour minimum-rest rule.
    if v_first and not p_is_off and p_proposed_start_time is not null then
      v_prev_start:=r.shift_start_time;
      v_prev_end:=r.shift_end_time;

      if upper(coalesce(r.work_mode_code,''))='SPLIT_WAIT_NIGHT'
         and r.second_segment_start is not null
         and r.second_segment_planned_end is not null then
        v_prev_start:=r.second_segment_start;
        v_prev_end:=r.second_segment_planned_end;
      elsif upper(coalesce(r.work_mode_code,''))='HOUR_BASED'
         and r.custom_start_time is not null
         and r.custom_end_time is not null then
        v_prev_start:=r.custom_start_time;
        v_prev_end:=r.custom_end_time;
      elsif upper(coalesce(r.daily_template_code,''))='SPLIT_FLEX'
         and r.customer_window_start is not null
         and r.customer_window_end is not null then
        -- For normal shift + late customer work, the last customer segment is
        -- the actual planned end used for next-day rest validation.
        v_prev_start:=r.customer_window_start;
        v_prev_end:=r.customer_window_end;
      end if;

      if v_prev_end is not null then
        v_prev_end_ts:=r.work_date::timestamp+v_prev_end;
        if v_prev_start is not null and v_prev_end<=v_prev_start then
          v_prev_end_ts:=v_prev_end_ts+interval '1 day';
        end if;
        v_next_start_ts:=p_work_date::timestamp+p_proposed_start_time;
        v_rest:=floor(extract(epoch from (v_next_start_ts-v_prev_end_ts))/60)::integer;
        v_hard:=v_rest<360;
      end if;
    end if;

    -- Planned hours INCLUDING break. Scheduling-rule planned_minutes is the
    -- most accurate source for Hour Based / Split / late-customer modes.
    v_minutes:=greatest(coalesce(r.rule_planned_minutes,0),0);
    if v_minutes=0 then
      v_minutes:=greatest(coalesce(r.master_planned_minutes,0),0);
    end if;
    if v_minutes=0 and r.shift_start_time is not null and r.shift_end_time is not null then
      v_minutes:=mod(
        (extract(epoch from r.shift_end_time)::integer
         -extract(epoch from r.shift_start_time)::integer)+86400,
        86400
      )/60;
    end if;

    v_cont:=v_cont+coalesce(v_minutes,0);
    v_days_counted:=v_days_counted+1;
    v_first:=false;
  end loop;

  v_after:=case
    when p_is_off then 0
    else v_cont+greatest(coalesce(p_proposed_planned_minutes,0),0)
  end;

  -- Requirement: reaching 48h is allowed; warn when another shift makes the
  -- continuous planned hours exceed 48h.
  v_warn:=not p_is_off and v_after>2880;

  return jsonb_build_object(
    'guard_version','V6.14.1',
    'calculation_source','EFFECTIVE_SCHEDULE_V6134',
    'hard_block',v_hard,
    'rest_minutes',v_rest,
    'minimum_rest_minutes',360,
    'continuous_minutes_before',v_cont,
    'proposed_planned_minutes',greatest(coalesce(p_proposed_planned_minutes,0),0),
    'continuous_minutes_after',v_after,
    'continuous_days_counted',v_days_counted,
    'reset_dayoff_date',v_reset_date,
    'warning_48h',v_warn,
    'threshold_minutes',2880,
    'message',case
      when v_hard then 'เวลาพักจากกะก่อนหน้าต่ำกว่า 6 ชั่วโมง'
      when v_warn then 'ชั่วโมงทำงานต่อเนื่องเกิน 48 ชั่วโมง ควรกำหนดวันหยุด'
      else null
    end
  );
end;
$$;

revoke all on function public.ta_validate_schedule_guard_v6141(
  text,date,text,time,time,integer,boolean
) from public;
grant execute on function public.ta_validate_schedule_guard_v6141(
  text,date,text,time,time,integer,boolean
) to authenticated;

notify pgrst,'reload schema';
commit;
