-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.37
-- Canonical Neighbor State + Full-Day Leave Overlay + Night Sequence Consistency
--
-- กฎธุรกิจสุดท้าย:
-- 1) วันที่จัดเป็นกะดึก: วันก่อนหน้าห้ามเป็นกะเช้า/กลางวัน
--    (อนุญาต กะดึก / วันหยุด / HOL / ลาเต็มวัน LV)
-- 2) วันถัดจากกะดึก: ต้องเป็น กะดึก / วันหยุด / HOL / ลาเต็มวัน LV
-- 3) ลาเต็มวันที่มาจากระบบลา ต้องถูกมองเป็น LV แม้ Schedule เดิมยังเป็น STD/S043
-- 4) Partial Leave ไม่ถือเป็นวันลาเต็มวันสำหรับ Night Sequence
-- 5) Minimum Rest 6 ชม. / >48 ชม. / Day-off quota / Work Pattern / Permission คงเดิม
-- ============================================================================

begin;
set local statement_timeout = '0';
select pg_advisory_xact_lock(hashtext('timeclock_v61437_canonical_neighbor_leave_guard'));

-- Preconditions ----------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.normalize_emp_code(text)') is null then
    raise exception 'MISSING_FUNCTION: normalize_emp_code';
  end if;
  if to_regprocedure('public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])') is null then
    raise exception 'MISSING_FUNCTION: ta_get_schedule_range_light_v6134';
  end if;
  if to_regclass('public.shift_master') is null then
    raise exception 'MISSING_TABLE: shift_master';
  end if;
  if to_regclass('public.shift_calendar') is null then
    raise exception 'MISSING_TABLE: shift_calendar';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 1) Canonical FULL-DAY leave resolver.
--    Important: approved leave may be visible in Attendance / Monthly Personal
--    while the structural Schedule still carries STD/S043.  Night Sequence must
--    follow the visible/effective leave state, not the underlying default shift.
-- -----------------------------------------------------------------------------
create or replace function public._ta_is_full_day_leave_v61437(
  p_emp_code text,
  p_work_date date
)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_found boolean := false;
begin
  if nullif(v_emp,'') is null or p_work_date is null then
    return false;
  end if;

  -- Explicit Schedule LV always wins.
  select exists(
    select 1
    from public.shift_calendar c
    where public.normalize_emp_code(c.emp_code)=v_emp
      and c.work_date=p_work_date
      and upper(trim(coalesce(c.shift_code,'')))='LV'
  ) into v_found;
  if v_found then return true; end if;

  -- Approved full-day leave creates a Daily Work Plan LEAVE overlay.
  if to_regclass('public.ta_daily_work_plans') is not null then
    execute $q$
      select exists(
        select 1
        from public.ta_daily_work_plans p
        where public.normalize_emp_code(p.emp_code)=$1
          and p.work_date=$2
          and upper(trim(coalesce(p.day_override_type,'')))='LEAVE'
          and upper(trim(coalesce(p.status,'CONFIRMED'))) <> 'CANCELLED'
      )
    $q$ into v_found using v_emp,p_work_date;
    if v_found then return true; end if;
  end if;

  -- Direct leave-request source. Only APPROVED + full day counts.
  if to_regclass('public.ta_leave_requests') is not null
     and to_regclass('public.ta_leave_request_days') is not null then
    execute $q$
      select exists(
        select 1
        from public.ta_leave_requests r
        join public.ta_leave_request_days d on d.request_id=r.id
        where public.normalize_emp_code(r.emp_code)=$1
          and d.leave_date=$2
          and upper(trim(coalesce(r.status,'')))='APPROVED'
          and coalesce(d.leave_units,0) >= 1
          and upper(trim(coalesce(d.leave_period,'FULL_DAY')))='FULL_DAY'
      )
    $q$ into v_found using v_emp,p_work_date;
    if v_found then return true; end if;
  end if;

  -- Calculation fallback for older/imported approved leave rows.
  if to_regclass('public.ta_attendance_calculations') is not null then
    execute $q$
      select exists(
        select 1
        from public.ta_attendance_calculations a
        where public.normalize_emp_code(a.emp_code)=$1
          and a.work_date=$2
          and (
            upper(trim(coalesce(a.day_type,'')))='LEAVE'
            or (
              a.leave_request_id is not null
              and coalesce(a.leave_units,0) >= 1
              and upper(trim(coalesce(a.leave_period,'FULL_DAY')))='FULL_DAY'
            )
          )
      )
    $q$ into v_found using v_emp,p_work_date;
  end if;

  return coalesce(v_found,false);
end;
$$;

revoke all on function public._ta_is_full_day_leave_v61437(text,date) from public;

-- -----------------------------------------------------------------------------
-- 2) One canonical state reader for previous/current/next calendar day.
--    state_code becomes LV when an approved FULL-DAY leave overlay exists.
-- -----------------------------------------------------------------------------
create or replace function public._ta_night_sequence_state_v61437(
  p_emp_code text,
  p_start_date date,
  p_end_date date
)
returns table (
  emp_code text,
  work_date date,
  existing_code text,
  state_code text,
  auto_shift_code text,
  default_shift_code text,
  suggested_shift_code text,
  start_time time,
  end_time time,
  is_full_day_leave boolean,
  is_dayoff boolean,
  is_night boolean,
  is_day_work boolean
)
language sql
stable
security definer
set search_path=public
as $$
  with b as materialized (
    select
      s.emp_code,
      s.work_date,
      upper(trim(coalesce(s.effective_shift_code,''))) as existing_code,
      upper(trim(coalesce(s.auto_shift_code,''))) as auto_shift_code,
      upper(trim(coalesce(s.default_shift_code,''))) as default_shift_code,
      upper(trim(coalesce(s.suggested_shift_code,''))) as suggested_shift_code,
      s.shift_start_time,
      s.shift_end_time,
      public._ta_is_full_day_leave_v61437(s.emp_code,s.work_date) as full_leave
    from public.ta_get_schedule_range_light_v6134(
      least(p_start_date,p_end_date),
      greatest(p_start_date,p_end_date),
      null,null,array[public.normalize_emp_code(p_emp_code)]::text[],null
    ) s
  ), c as materialized (
    select
      b.*,
      case when b.full_leave then 'LV' else nullif(b.existing_code,'') end as resolved_code
    from b
  ), x as materialized (
    select
      c.*,
      sm.is_workday,
      sm.is_night_shift,
      sm.start_time as master_start,
      sm.end_time as master_end,
      (
        not c.full_leave
        and (
          c.resolved_code in ('OFF','HOL')
          or (c.resolved_code is not null and coalesce(sm.is_workday,true)=false)
        )
      ) as resolved_dayoff
    from c
    left join public.shift_master sm
      on upper(trim(sm.shift_code))=c.resolved_code
  ), y as materialized (
    select
      x.*,
      (
        not x.full_leave
        and not x.resolved_dayoff
        and x.resolved_code is not null
        and (
          coalesce(x.is_night_shift,false)
          or x.resolved_code in ('S134','S135')
          or coalesce(x.shift_start_time,x.master_start) >= time '18:00'
        )
      ) as resolved_night
    from x
  )
  select
    y.emp_code,
    y.work_date,
    y.existing_code,
    y.resolved_code as state_code,
    y.auto_shift_code,
    y.default_shift_code,
    y.suggested_shift_code,
    coalesce(y.shift_start_time,y.master_start),
    coalesce(y.shift_end_time,y.master_end),
    y.full_leave,
    y.resolved_dayoff,
    y.resolved_night,
    (
      y.resolved_code is not null
      and not y.full_leave
      and not y.resolved_dayoff
      and not y.resolved_night
    ) as is_day_work
  from y
  order by y.work_date;
$$;

revoke all on function public._ta_night_sequence_state_v61437(text,date,date) from public;

-- Context RPC for Assignment Popup. ------------------------------------------------
create or replace function public.ta_get_night_sequence_context_v61437(
  p_emp_code text,
  p_work_date date
)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  with s as materialized (
    select *
    from public._ta_night_sequence_state_v61437(
      p_emp_code,p_work_date-1,p_work_date+1
    )
  )
  select jsonb_build_object(
    'emp_code',public.normalize_emp_code(p_emp_code),
    'work_date',p_work_date,
    'previous',(select to_jsonb(x) from s x where x.work_date=p_work_date-1 limit 1),
    'current',(select to_jsonb(x) from s x where x.work_date=p_work_date limit 1),
    'next',(select to_jsonb(x) from s x where x.work_date=p_work_date+1 limit 1),
    'context_version','V6.14.37'
  );
$$;

revoke all on function public.ta_get_night_sequence_context_v61437(text,date) from public;
grant execute on function public.ta_get_night_sequence_context_v61437(text,date) to authenticated;

-- -----------------------------------------------------------------------------
-- 3) Projected Bulk validator.
--    - Uses canonical leave-aware base state.
--    - Projects ALL payload rows together.
--    - Returns row_violations mapped back to payload rows so Quick Action can
--      skip only invalid cells and revalidate the remaining projection.
-- -----------------------------------------------------------------------------
create or replace function public.ta_validate_night_sequence_bulk_v61437(
  p_rows jsonb
)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  with raw as (
    select
      x.ord::bigint as ord,
      public.normalize_emp_code(x.item->>'emp_code') as emp_code,
      nullif(x.item->>'work_date','')::date as work_date,
      case
        when x.item ? 'shift_code' and x.item->'shift_code' is not null
          then nullif(upper(trim(x.item->>'shift_code')),'')
        else null
      end as shift_code,
      (x.item ? 'shift_code') as has_shift_key,
      nullif(x.item->>'proposed_start_time','')::time as proposed_start_time,
      nullif(x.item->>'proposed_end_time','')::time as proposed_end_time
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) with ordinality x(item,ord)
  ),
  parsed as materialized (
    select distinct on (r.emp_code,r.work_date)
      r.ord,r.emp_code,r.work_date,r.shift_code,r.has_shift_key,
      r.proposed_start_time,r.proposed_end_time
    from raw r
    where nullif(r.emp_code,'') is not null and r.work_date is not null
    order by r.emp_code,r.work_date,r.ord desc
  ),
  scope as materialized (
    select emp_code,min(work_date)-2 as start_date,max(work_date)+2 as end_date
    from parsed group by emp_code
  ),
  affected as materialized (
    select p.emp_code,p.work_date+d.delta as night_date
    from parsed p
    cross join (values(-1),(0),(1)) d(delta)
  ),
  base as materialized (
    select s.*
    from scope sc
    cross join lateral public._ta_night_sequence_state_v61437(
      sc.emp_code,sc.start_date,sc.end_date
    ) s
  ),
  projected as materialized (
    select
      b.emp_code,b.work_date,
      case
        when p.emp_code is not null and p.has_shift_key and p.shift_code is null then
          coalesce(nullif(b.auto_shift_code,''),nullif(b.default_shift_code,''),nullif(b.suggested_shift_code,''),nullif(b.existing_code,''))
        when p.emp_code is not null and p.shift_code is not null then p.shift_code
        else nullif(b.existing_code,'')
      end as projected_code,
      b.is_full_day_leave as base_full_day_leave,
      (p.emp_code is not null) as is_payload,
      p.proposed_start_time,p.proposed_end_time,
      b.start_time as existing_start,b.end_time as existing_end
    from base b
    left join parsed p on p.emp_code=b.emp_code and p.work_date=b.work_date
  ),
  classified as materialized (
    select
      p.emp_code,p.work_date,p.projected_code,
      case when p.is_payload
        then coalesce(p.proposed_start_time,sm.start_time,p.existing_start)
        else coalesce(p.existing_start,sm.start_time)
      end as start_time,
      case when p.is_payload
        then coalesce(p.proposed_end_time,sm.end_time,p.existing_end)
        else coalesce(p.existing_end,sm.end_time)
      end as end_time,
      (p.base_full_day_leave or p.projected_code='LV') as is_leave,
      (
        not p.base_full_day_leave
        and p.projected_code<>'LV'
        and (
          p.projected_code in ('OFF','HOL')
          or (p.projected_code is not null and coalesce(sm.is_workday,true)=false)
        )
      ) as is_dayoff,
      sm.is_night_shift
    from projected p
    left join public.shift_master sm
      on upper(trim(sm.shift_code))=p.projected_code
  ),
  state as materialized (
    select
      c.*,
      case when c.is_leave then 'LV' else c.projected_code end as state_code,
      (
        not c.is_leave
        and not c.is_dayoff
        and c.projected_code is not null
        and (
          coalesce(c.is_night_shift,false)
          or c.projected_code in ('S134','S135')
          or c.start_time >= time '18:00'
        )
      ) as is_night
    from classified c
  ),
  state2 as materialized (
    select s.*,
      (s.state_code is not null and not s.is_leave and not s.is_dayoff and not s.is_night) as is_day_work
    from state s
  ),
  nights as materialized (
    select
      c.emp_code,c.work_date as night_date,c.state_code as night_code,
      p.state_code as previous_code,p.is_day_work as previous_is_day_work,
      n.state_code as next_code,n.work_date is not null as next_exists,
      n.is_night as next_is_night,n.is_dayoff as next_is_dayoff,n.is_leave as next_is_leave
    from state2 c
    join affected a on a.emp_code=c.emp_code and a.night_date=c.work_date
    left join state2 p on p.emp_code=c.emp_code and p.work_date=c.work_date-1
    left join state2 n on n.emp_code=c.emp_code and n.work_date=c.work_date+1
    where c.is_night
  ),
  violations as materialized (
    select n.emp_code,n.night_date,n.night_code,
      'NIGHT_PREVIOUS_DAY_WORK'::text as reason,n.previous_code,n.next_code
    from nights n
    where coalesce(n.previous_is_day_work,false)
    union all
    select n.emp_code,n.night_date,n.night_code,
      'NIGHT_NEXT_NOT_NIGHT_DAYOFF_OR_LEAVE'::text as reason,n.previous_code,n.next_code
    from nights n
    where n.next_exists
      and not coalesce(n.next_is_night,false)
      and not coalesce(n.next_is_dayoff,false)
      and not coalesce(n.next_is_leave,false)
  ),
  row_violations as materialized (
    select distinct
      p.emp_code,p.work_date,v.night_date,v.night_code,v.reason,v.previous_code,v.next_code
    from violations v
    join parsed p
      on p.emp_code=v.emp_code
     and p.work_date between v.night_date-1 and v.night_date+1
  ),
  vj as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'emp_code',v.emp_code,'night_date',v.night_date,'night_code',v.night_code,
      'reason',v.reason,'previous_code',v.previous_code,'next_code',v.next_code
    ) order by v.emp_code,v.night_date,v.reason),'[]'::jsonb) items,
    count(*)::integer cnt
    from violations v
  ),
  rj as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'emp_code',r.emp_code,'work_date',r.work_date,'night_date',r.night_date,
      'night_code',r.night_code,'reason',r.reason,
      'previous_code',r.previous_code,'next_code',r.next_code
    ) order by r.emp_code,r.work_date,r.night_date,r.reason),'[]'::jsonb) items
    from row_violations r
  )
  select jsonb_build_object(
    'allowed',vj.cnt=0,
    'violation_count',vj.cnt,
    'violations',vj.items,
    'row_violations',rj.items,
    'guard_version','V6.14.37',
    'leave_source','FULL_DAY_LEAVE_OVERLAY',
    'rule','Night previous: Night/Day-off/LV; Night next: Night/Day-off/LV'
  )
  from vj cross join rj;
$$;

revoke all on function public.ta_validate_night_sequence_bulk_v61437(jsonb) from public;
grant execute on function public.ta_validate_night_sequence_bulk_v61437(jsonb) to authenticated;

-- Compatibility name used by V6.14.35/36 frontend and V6.14.35 writer.
create or replace function public.ta_validate_night_sequence_bulk_v61435(p_rows jsonb)
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
  select public.ta_validate_night_sequence_bulk_v61437(p_rows);
$$;
revoke all on function public.ta_validate_night_sequence_bulk_v61435(jsonb) from public;
grant execute on function public.ta_validate_night_sequence_bulk_v61435(jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 4) Canonical audit uses the exact same leave-aware state.
-- -----------------------------------------------------------------------------
create or replace function public.ta_audit_night_sequence_v61435(
  p_start_date date,
  p_end_date date,
  p_emp_codes text[] default null
)
returns table (
  emp_code text,
  night_date date,
  night_code text,
  reason text,
  previous_code text,
  next_code text
)
language sql
stable
security definer
set search_path=public
as $$
  with emp_scope as materialized (
    select distinct s.emp_code
    from public.ta_get_schedule_range_light_v6134(
      least(p_start_date,p_end_date)-1,
      greatest(p_start_date,p_end_date)+1,
      null,null,p_emp_codes,null
    ) s
  ),
  state as materialized (
    select x.*
    from emp_scope e
    cross join lateral public._ta_night_sequence_state_v61437(
      e.emp_code,least(p_start_date,p_end_date)-1,greatest(p_start_date,p_end_date)+1
    ) x
  ),
  nights as materialized (
    select
      c.emp_code,c.work_date as night_date,c.state_code as night_code,
      p.state_code as previous_code,p.is_day_work as previous_is_day_work,
      n.state_code as next_code,n.work_date is not null as next_exists,
      n.is_night as next_is_night,n.is_dayoff as next_is_dayoff,n.is_full_day_leave as next_is_leave
    from state c
    left join state p on p.emp_code=c.emp_code and p.work_date=c.work_date-1
    left join state n on n.emp_code=c.emp_code and n.work_date=c.work_date+1
    where c.is_night
      and c.work_date between least(p_start_date,p_end_date) and greatest(p_start_date,p_end_date)
  )
  select n.emp_code,n.night_date,n.night_code,
         'NIGHT_PREVIOUS_DAY_WORK'::text,n.previous_code,n.next_code
  from nights n
  where coalesce(n.previous_is_day_work,false)
  union all
  select n.emp_code,n.night_date,n.night_code,
         'NIGHT_NEXT_NOT_NIGHT_DAYOFF_OR_LEAVE'::text,n.previous_code,n.next_code
  from nights n
  where n.next_exists
    and not coalesce(n.next_is_night,false)
    and not coalesce(n.next_is_dayoff,false)
    and not coalesce(n.next_is_leave,false)
  order by 1,2,4;
$$;

revoke all on function public.ta_audit_night_sequence_v61435(date,date,text[]) from public;
grant execute on function public.ta_audit_night_sequence_v61435(date,date,text[]) to authenticated;

create or replace function public._ta_assert_night_sequence_window_v61435(
  p_emp_code text,
  p_work_date date
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare v record;
begin
  select * into v
  from public.ta_audit_night_sequence_v61435(
    p_work_date-1,p_work_date+1,array[public.normalize_emp_code(p_emp_code)]::text[]
  )
  limit 1;
  if found then
    if v.reason='NIGHT_PREVIOUS_DAY_WORK' then
      raise exception 'NIGHT_SEQUENCE_INVALID: night % % has previous day-work %',
        v.night_date,v.night_code,coalesce(v.previous_code,'-');
    else
      raise exception 'NIGHT_SEQUENCE_INVALID: night % % requires next Night/Day-off/LV, got %',
        v.night_date,v.night_code,coalesce(v.next_code,'-');
    end if;
  end if;
end;
$$;
revoke all on function public._ta_assert_night_sequence_window_v61435(text,date) from public;

-- Ensure deferred DB safety-net exists without dropping an existing trigger.
create or replace function public._ta_guard_night_sequence_trigger_v61435()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp text := public.normalize_emp_code(coalesce(new.emp_code,old.emp_code));
  v_date date := coalesce(new.work_date,old.work_date);
begin
  if coalesce(current_setting('timeclock.night_sequence_bulk_validated',true),'')='1' then
    return null;
  end if;
  perform public._ta_assert_night_sequence_window_v61435(v_emp,v_date);
  return null;
end;
$$;
revoke all on function public._ta_guard_night_sequence_trigger_v61435() from public;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid='public.shift_calendar'::regclass
      and tgname='trg_ta_night_sequence_guard_v61435'
      and not tgisinternal
  ) then
    execute 'create constraint trigger trg_ta_night_sequence_guard_v61435 '
         || 'after insert or update or delete on public.shift_calendar '
         || 'deferrable initially deferred for each row '
         || 'execute function public._ta_guard_night_sequence_trigger_v61435()';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5) Minimum-rest / 48h guard: full-day leave must RESET continuity.
--    Signature stays unchanged for existing frontend compatibility.
-- -----------------------------------------------------------------------------
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
  if p_work_date is null then raise exception 'WORK_DATE_REQUIRED'; end if;
  if nullif(v_emp,'') is null then raise exception 'EMP_CODE_REQUIRED'; end if;

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
      d.template_code as daily_template_code,
      public._ta_is_full_day_leave_v61437(v_emp,s.work_date) as full_day_leave
    from public.ta_get_schedule_range_light_v6134(
      p_work_date-31,p_work_date-1,null,null,array[v_emp]::text[],null
    ) s
    left join public.shift_master sm
      on upper(trim(sm.shift_code))=upper(trim(s.effective_shift_code))
    left join public.ta_schedule_rule_assignments a
      on a.emp_code=v_emp and a.work_date=s.work_date
    left join lateral (
      select x.customer_window_start,x.customer_window_end,x.template_code
      from public.ta_daily_work_plans x
      where x.emp_code=v_emp and x.work_date=s.work_date
        and coalesce(x.status,'')<>'CANCELLED'
      order by x.updated_at desc nulls last,x.created_at desc nulls last
      limit 1
    ) d on true
    order by s.work_date desc
  loop
    if r.work_date<>v_expected then exit; end if;
    v_expected:=v_expected-1;

    v_code:=upper(trim(coalesce(r.effective_shift_code,'')));
    v_is_off := coalesce(r.full_day_leave,false)
      or v_code in ('OFF','HOL','LV')
      or r.master_is_workday=false;

    if v_is_off then
      v_reset_date:=r.work_date;
      exit;
    end if;

    if v_first and not p_is_off and p_proposed_start_time is not null then
      v_prev_start:=r.shift_start_time;
      v_prev_end:=r.shift_end_time;
      if upper(coalesce(r.work_mode_code,''))='SPLIT_WAIT_NIGHT'
         and r.second_segment_start is not null and r.second_segment_planned_end is not null then
        v_prev_start:=r.second_segment_start;
        v_prev_end:=r.second_segment_planned_end;
      elsif upper(coalesce(r.work_mode_code,''))='HOUR_BASED'
         and r.custom_start_time is not null and r.custom_end_time is not null then
        v_prev_start:=r.custom_start_time;
        v_prev_end:=r.custom_end_time;
      elsif upper(coalesce(r.daily_template_code,''))='SPLIT_FLEX'
         and r.customer_window_start is not null and r.customer_window_end is not null then
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

    v_minutes:=greatest(coalesce(r.rule_planned_minutes,0),0);
    if v_minutes=0 then v_minutes:=greatest(coalesce(r.master_planned_minutes,0),0); end if;
    if v_minutes=0 and r.shift_start_time is not null and r.shift_end_time is not null then
      v_minutes:=mod(
        (extract(epoch from r.shift_end_time)::integer-extract(epoch from r.shift_start_time)::integer)+86400,
        86400
      )/60;
    end if;
    v_cont:=v_cont+coalesce(v_minutes,0);
    v_days_counted:=v_days_counted+1;
    v_first:=false;
  end loop;

  v_after:=case when p_is_off then 0 else v_cont+greatest(coalesce(p_proposed_planned_minutes,0),0) end;
  v_warn:=not p_is_off and v_after>2880;

  return jsonb_build_object(
    'guard_version','V6.14.37',
    'calculation_source','EFFECTIVE_SCHEDULE_V61425_PLUS_FULL_DAY_LEAVE',
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

revoke all on function public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean) from public;
grant execute on function public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean) to authenticated;

notify pgrst, 'reload schema';
commit;
