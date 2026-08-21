-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.36
-- Night Sequence Guard: อนุญาต NIGHT -> LV
--
-- กฎที่แก้เฉพาะจุด:
-- 1) วันก่อนกะดึก ห้ามเป็นกะเช้า/กลางวัน (คงเดิม)
-- 2) วันถัดจากกะดึก อนุญาต: กะดึก / วันหยุด / ลา LV
-- 3) LV ยังคงเป็น "ลา" ไม่ใช่วันหยุด และไม่เปลี่ยนกฎโควต้าวันหยุด
-- ส่วนอื่นคงเดิม
-- ============================================================================

begin;
set local statement_timeout = '0';
select pg_advisory_xact_lock(hashtext('timeclock_v61436_night_sequence_lv_allow'));

do $$
begin
  if to_regprocedure('public.ta_validate_night_sequence_bulk_v61435(jsonb)') is null then
    raise exception 'MISSING_V6.14.35: ta_validate_night_sequence_bulk_v61435';
  end if;
  if to_regprocedure('public.ta_audit_night_sequence_v61435(date,date,text[])') is null then
    raise exception 'MISSING_V6.14.35: ta_audit_night_sequence_v61435';
  end if;
  if to_regprocedure('public._ta_assert_night_sequence_window_v61435(text,date)') is null then
    raise exception 'MISSING_V6.14.35: _ta_assert_night_sequence_window_v61435';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Current-state audit helper.
--    LV is an allowed non-working successor after Night, but remains separate
--    from Day-off so Day-off quota semantics are unchanged.
-- ---------------------------------------------------------------------------
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
  with base as materialized (
    select
      s.emp_code,
      s.work_date,
      upper(trim(coalesce(s.effective_shift_code,''))) as shift_code,
      s.shift_start_time,
      s.shift_end_time
    from public.ta_get_schedule_range_light_v6134(
      least(p_start_date,p_end_date)-1,
      greatest(p_start_date,p_end_date)+1,
      null,null,p_emp_codes,null
    ) s
  ),
  classified as materialized (
    select
      b.*,
      (b.shift_code='LV') as is_leave,
      (
        b.shift_code in ('OFF','HOL')
        or (b.shift_code<>'LV' and coalesce(sm.is_workday,true)=false)
      ) as is_dayoff,
      (
        b.shift_code<>''
        and b.shift_code<>'LV'
        and not (
          b.shift_code in ('OFF','HOL')
          or (b.shift_code<>'LV' and coalesce(sm.is_workday,true)=false)
        )
        and (
          coalesce(sm.is_night_shift,false)
          or b.shift_code in ('S134','S135')
          or coalesce(b.shift_start_time,sm.start_time) >= time '18:00'
        )
      ) as is_night
    from base b
    left join public.shift_master sm
      on upper(trim(sm.shift_code))=b.shift_code
  ),
  state as materialized (
    select
      c.*,
      (
        c.shift_code<>''
        and not c.is_leave
        and not c.is_dayoff
        and not c.is_night
      ) as is_day_work
    from classified c
  ),
  nights as (
    select
      c.emp_code,
      c.work_date as night_date,
      c.shift_code as night_code,
      p.shift_code as previous_code,
      p.is_day_work as previous_is_day_work,
      n.shift_code as next_code,
      n.work_date is not null as next_exists,
      n.is_night as next_is_night,
      n.is_dayoff as next_is_dayoff,
      n.is_leave as next_is_leave
    from state c
    left join state p
      on p.emp_code=c.emp_code and p.work_date=c.work_date-1
    left join state n
      on n.emp_code=c.emp_code and n.work_date=c.work_date+1
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

-- ---------------------------------------------------------------------------
-- 2) Whole-payload projected validator used by Bulk / Quick / Copy / Fill.
--    Payload is overlaid first; NIGHT -> LV is valid in the projected state.
-- ---------------------------------------------------------------------------
create or replace function public.ta_validate_night_sequence_bulk_v61435(
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
    select
      sc.emp_code,
      g.work_date,
      upper(trim(coalesce(g.effective_shift_code,''))) as existing_code,
      upper(trim(coalesce(g.auto_shift_code,''))) as auto_shift_code,
      upper(trim(coalesce(g.default_shift_code,''))) as default_shift_code,
      upper(trim(coalesce(g.suggested_shift_code,''))) as suggested_shift_code,
      g.shift_start_time,
      g.shift_end_time
    from scope sc
    cross join lateral public.ta_get_schedule_range_light_v6134(
      sc.start_date,sc.end_date,null,null,array[sc.emp_code]::text[],null
    ) g
  ),
  projected_code as materialized (
    select
      b.emp_code,b.work_date,
      case
        when p.emp_code is not null and p.has_shift_key and p.shift_code is null then
          coalesce(nullif(b.auto_shift_code,''),nullif(b.default_shift_code,''),nullif(b.suggested_shift_code,''),nullif(b.existing_code,''))
        when p.emp_code is not null and p.shift_code is not null then p.shift_code
        else nullif(b.existing_code,'')
      end as shift_code,
      (p.emp_code is not null) as is_payload,
      p.proposed_start_time,
      p.proposed_end_time,
      b.shift_start_time as existing_start,
      b.shift_end_time as existing_end
    from base b
    left join parsed p
      on p.emp_code=b.emp_code and p.work_date=b.work_date
  ),
  classified as materialized (
    select
      p.emp_code,p.work_date,p.shift_code,
      case when p.is_payload
        then coalesce(p.proposed_start_time,sm.start_time,p.existing_start)
        else coalesce(p.existing_start,sm.start_time)
      end as start_time,
      case when p.is_payload
        then coalesce(p.proposed_end_time,sm.end_time,p.existing_end)
        else coalesce(p.existing_end,sm.end_time)
      end as end_time,
      (p.shift_code='LV') as is_leave,
      (
        p.shift_code in ('OFF','HOL')
        or (p.shift_code<>'LV' and coalesce(sm.is_workday,true)=false)
      ) as is_dayoff,
      (
        p.shift_code is not null
        and p.shift_code<>'LV'
        and not (
          p.shift_code in ('OFF','HOL')
          or (p.shift_code<>'LV' and coalesce(sm.is_workday,true)=false)
        )
        and (
          coalesce(sm.is_night_shift,false)
          or p.shift_code in ('S134','S135')
          or (case when p.is_payload
                then coalesce(p.proposed_start_time,sm.start_time,p.existing_start)
                else coalesce(p.existing_start,sm.start_time)
              end) >= time '18:00'
        )
      ) as is_night
    from projected_code p
    left join public.shift_master sm
      on upper(trim(sm.shift_code))=p.shift_code
  ),
  state as materialized (
    select c.*,
      (c.shift_code is not null and not c.is_leave and not c.is_dayoff and not c.is_night) as is_day_work
    from classified c
  ),
  nights as materialized (
    select
      c.emp_code,c.work_date as night_date,c.shift_code as night_code,
      p.shift_code as previous_code,p.is_day_work as previous_is_day_work,
      n.shift_code as next_code,n.work_date is not null as next_exists,
      n.is_night as next_is_night,n.is_dayoff as next_is_dayoff,n.is_leave as next_is_leave
    from state c
    join affected a on a.emp_code=c.emp_code and a.night_date=c.work_date
    left join state p on p.emp_code=c.emp_code and p.work_date=c.work_date-1
    left join state n on n.emp_code=c.emp_code and n.work_date=c.work_date+1
    where c.is_night
  ),
  violations as (
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
  violation_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'emp_code',v.emp_code,
      'night_date',v.night_date,
      'night_code',v.night_code,
      'reason',v.reason,
      'previous_code',v.previous_code,
      'next_code',v.next_code
    ) order by v.emp_code,v.night_date,v.reason),'[]'::jsonb) as items,
    count(*)::integer as cnt
    from violations v
  )
  select jsonb_build_object(
    'allowed',j.cnt=0,
    'violation_count',j.cnt,
    'violations',j.items,
    'guard_version','V6.14.36',
    'rule','Night: previous must not be day-work; next must be Night, Day-off, or LV'
  )
  from violation_json j;
$$;

revoke all on function public.ta_validate_night_sequence_bulk_v61435(jsonb) from public;
grant execute on function public.ta_validate_night_sequence_bulk_v61435(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Deferred DB safety-net message follows the corrected rule.
--    Existing trigger remains attached to this function chain; no trigger reset.
-- ---------------------------------------------------------------------------
create or replace function public._ta_assert_night_sequence_window_v61435(
  p_emp_code text,
  p_center_date date
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  v record;
begin
  select * into v
  from public.ta_audit_night_sequence_v61435(
    p_center_date-1,p_center_date+1,array[public.normalize_emp_code(p_emp_code)]::text[]
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

notify pgrst, 'reload schema';
commit;
