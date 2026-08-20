-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.15
-- Schedule + Time Certification Consistency Pipeline
-- ============================================================================

begin;
set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- 1) Preflight: this release intentionally builds on the current canonical
--    scheduling guard, day-off guard and timed-certification calculation.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure(
    'public._ta_refresh_attendance_with_certification_v61139(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_refresh_attendance_with_certification_v61139';
  end if;

  if to_regprocedure(
    'public.ta_can_access_employee_v680(text,date,text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_can_access_employee_v680';
  end if;

  if to_regprocedure(
    'public.ta_assign_shift_single_v6143(text,date,text,text,text,boolean)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_assign_shift_single_v6143';
  end if;

  if to_regprocedure(
    'public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_validate_schedule_guard_v6141';
  end if;

  if to_regprocedure(
    'public.ta_sync_bulk_schedule_rules_v6135(jsonb)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_sync_bulk_schedule_rules_v6135';
  end if;

  if to_regprocedure(
    'public._ta_current_access_v681()'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_current_access_v681';
  end if;

  if to_regprocedure(
    'public._ta_assert_system_period_action_v6110(date,text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_assert_system_period_action_v6110';
  end if;

  if to_regclass('public.ta_shift_change_requests') is null then
    raise exception 'MISSING_TABLE: ta_shift_change_requests';
  end if;

  if to_regclass('public.shift_master') is null then
    raise exception 'MISSING_TABLE: shift_master';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Public canonical Attendance refresh.
--
-- All manual recalculation entry points can use this RPC.  It always executes
-- the certification-aware calculation, therefore a valid CERTIFIED overlay is
-- preserved and a STALE/REVOKED certification is never applied accidentally.
-- ---------------------------------------------------------------------------
create or replace function public.ta_refresh_attendance_consistency_v61415(
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
  v_start date := least(p_start_date,p_end_date);
  v_end date := greatest(p_start_date,p_end_date);
  v_emp_codes text[];
  v_emp text;
  v_result jsonb;
begin
  if p_start_date is null or p_end_date is null then
    raise exception 'ATTENDANCE_DATE_RANGE_REQUIRED';
  end if;

  select coalesce(
    array_agg(distinct public.normalize_emp_code(x) order by public.normalize_emp_code(x))
      filter (where nullif(public.normalize_emp_code(x),'') is not null),
    array[]::text[]
  )
  into v_emp_codes
  from unnest(coalesce(p_emp_codes,array[]::text[])) x;

  if cardinality(v_emp_codes)=0 then
    raise exception 'ATTENDANCE_EMPLOYEE_REQUIRED';
  end if;

  foreach v_emp in array v_emp_codes
  loop
    if not public.ta_can_access_employee_v680(v_emp,v_start,'VIEW')
       or not public.ta_can_access_employee_v680(v_emp,v_end,'VIEW') then
      raise exception 'ATTENDANCE_VIEW_PERMISSION_DENIED: %',v_emp;
    end if;
  end loop;

  v_result := public._ta_refresh_attendance_with_certification_v61139(
    v_start,
    v_end,
    v_emp_codes
  );

  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object(
      'consistency_refresh',true,
      'start_date',v_start,
      'end_date',v_end,
      'employee_count',cardinality(v_emp_codes),
      'version','V6.14.15'
    );
end;
$$;

revoke all on function public.ta_refresh_attendance_consistency_v61415(
  date,date,text[]
) from public;
grant execute on function public.ta_refresh_attendance_consistency_v61415(
  date,date,text[]
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Finalizer after a schedule mutation.
--
-- Shift/Work Plan may be saved first and Scheduling Rule extension may follow
-- in the frontend.  The old flow could therefore recalculate Attendance before
-- the final Hour-based / Split / Smart-OFF rule existed.  This finalizer is
-- intentionally called AFTER every extension write and recalculates only the
-- exact employee/date pairs that were changed.
-- ---------------------------------------------------------------------------
create or replace function public.ta_finalize_schedule_mutation_v61415(
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_date date;
  v_emp_codes text[];
  v_result jsonb;
  v_details jsonb := '[]'::jsonb;
  v_day_count integer := 0;
  v_pair_count integer := 0;
begin
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then
    raise exception 'SCHEDULE_MUTATION_ROWS_MUST_BE_ARRAY';
  end if;

  if jsonb_array_length(coalesce(p_rows,'[]'::jsonb))=0 then
    return jsonb_build_object(
      'recalculated',false,
      'reason','NO_ROWS',
      'version','V6.14.15'
    );
  end if;

  for v_date in
    with parsed as (
      select
        public.normalize_emp_code(x->>'emp_code') as emp_code,
        case
          when coalesce(x->>'work_date','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            then (x->>'work_date')::date
          else null
        end as work_date
      from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) x
    )
    select distinct work_date
    from parsed
    where nullif(emp_code,'') is not null
      and work_date is not null
    order by work_date
  loop
    with parsed as (
      select
        public.normalize_emp_code(x->>'emp_code') as emp_code,
        case
          when coalesce(x->>'work_date','') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            then (x->>'work_date')::date
          else null
        end as work_date
      from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) x
    )
    select coalesce(
      array_agg(distinct emp_code order by emp_code)
        filter (where nullif(emp_code,'') is not null),
      array[]::text[]
    )
    into v_emp_codes
    from parsed
    where work_date=v_date;

    if cardinality(v_emp_codes)=0 then
      continue;
    end if;

    v_result := public.ta_refresh_attendance_consistency_v61415(
      v_date,
      v_date,
      v_emp_codes
    );

    v_day_count := v_day_count + 1;
    v_pair_count := v_pair_count + cardinality(v_emp_codes);
    v_details := v_details || jsonb_build_array(
      jsonb_build_object(
        'work_date',v_date,
        'employee_count',cardinality(v_emp_codes),
        'result',v_result
      )
    );
  end loop;

  return jsonb_build_object(
    'recalculated',v_day_count>0,
    'exact_dates',v_day_count,
    'employee_date_pairs',v_pair_count,
    'certification_aware',true,
    'details',v_details,
    'version','V6.14.15'
  );
end;
$$;

revoke all on function public.ta_finalize_schedule_mutation_v61415(jsonb)
  from public;
grant execute on function public.ta_finalize_schedule_mutation_v61415(jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Shift-request approval now uses the SAME scheduling direction as Calendar.
--
-- Old request approval used V651 directly and then ran another legacy Attendance
-- refresh.  This version uses:
--   System Period -> Scope -> canonical 6h/48h guard -> V6.14.3 day-off guard
--   -> Smart OFF rule sync -> certification-aware finalizer.
-- ---------------------------------------------------------------------------
create or replace function public.ta_decide_shift_change_request_v61415(
  p_request_id uuid,
  p_decision text,
  p_note text default null,
  p_acknowledge_48h boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_access record;
  v_decision text := upper(trim(coalesce(p_decision,'')));
  v_req public.ta_shift_change_requests%rowtype;
  v_shift text;
  v_start time;
  v_end time;
  v_planned integer := 0;
  v_is_off boolean := false;
  v_guard jsonb := '{}'::jsonb;
  v_assign jsonb := '{}'::jsonb;
  v_sync jsonb := '{}'::jsonb;
  v_recalc jsonb := '{}'::jsonb;
begin
  select *
  into v_access
  from public._ta_current_access_v681()
  where is_active
  limit 1;

  if not found or upper(coalesce(v_access.role,'')) not in ('HR_ADMIN','MANAGER') then
    raise exception 'SHIFT_REQUEST_DECISION_PERMISSION_DENIED';
  end if;

  if v_decision not in ('APPROVED','REJECTED') then
    raise exception 'INVALID_SHIFT_REQUEST_DECISION';
  end if;

  select *
  into v_req
  from public.ta_shift_change_requests
  where id=p_request_id
  for update;

  if not found then
    raise exception 'SHIFT_CHANGE_REQUEST_NOT_FOUND';
  end if;

  if v_req.status <> 'PENDING' then
    raise exception 'SHIFT_CHANGE_REQUEST_NOT_PENDING';
  end if;

  if not public.ta_can_access_employee_v680(
    v_req.emp_code,
    v_req.work_date,
    'DECIDE_SHIFT_REQUEST'
  ) then
    raise exception 'SHIFT_REQUEST_SCOPE_DENIED';
  end if;

  if v_decision='APPROVED' then
    perform public._ta_assert_system_period_action_v6110(
      v_req.work_date,
      'SCHEDULE_EDIT'
    );

    v_shift := upper(trim(coalesce(v_req.requested_shift_code,'')));
    if nullif(v_shift,'') is null then
      raise exception 'SHIFT_REQUEST_SHIFT_REQUIRED';
    end if;

    if v_shift in ('LV','HOL') then
      v_is_off := true;
      v_start := null;
      v_end := null;
      v_planned := 0;
    else
      select
        s.start_time,
        s.end_time,
        coalesce(s.scheduled_minutes_including_break,0),
        not coalesce(s.is_workday,true)
      into
        v_start,
        v_end,
        v_planned,
        v_is_off
      from public.shift_master s
      where upper(trim(s.shift_code))=v_shift
      limit 1;

      if not found then
        raise exception 'SHIFT_MASTER_NOT_FOUND: %',v_shift;
      end if;

      if coalesce(v_planned,0)=0
         and v_start is not null
         and v_end is not null
         and not v_is_off then
        v_planned := mod(
          extract(epoch from v_end)::integer
          - extract(epoch from v_start)::integer
          + 86400,
          86400
        ) / 60;
      end if;
    end if;

    v_guard := public.ta_validate_schedule_guard_v6141(
      v_req.emp_code,
      v_req.work_date,
      v_shift,
      v_start,
      v_end,
      greatest(coalesce(v_planned,0),0),
      v_is_off
    );

    if coalesce((v_guard->>'hard_block')::boolean,false) then
      raise exception 'SCHEDULE_MINIMUM_REST_VIOLATION: %',
        coalesce(v_guard->>'message','เวลาพักจากกะก่อนหน้าต่ำกว่า 6 ชั่วโมง');
    end if;

    if coalesce((v_guard->>'warning_48h')::boolean,false)
       and not coalesce(p_acknowledge_48h,false) then
      return jsonb_build_object(
        'request_id',v_req.id,
        'request_no',v_req.request_no,
        'emp_code',public.normalize_emp_code(v_req.emp_code),
        'work_date',v_req.work_date,
        'requested_shift_code',v_shift,
        'status',v_req.status,
        'applied',false,
        'requires_48h_confirmation',true,
        'continuous_minutes_after',coalesce((v_guard->>'continuous_minutes_after')::integer,0),
        'schedule_guard',v_guard,
        'version','V6.14.15'
      );
    end if;

    v_assign := public.ta_assign_shift_single_v6143(
      v_req.emp_code,
      v_req.work_date,
      v_shift,
      'อนุมัติคำขอแก้ไขกะ ' || v_req.request_no,
      coalesce(nullif(trim(p_note),''),'อนุมัติคำขอแก้ไขกะ'),
      false
    );

    -- Make Smart OFF / normal-rule cleanup identical to Bulk/Fill/Paste paths.
    v_sync := public.ta_sync_bulk_schedule_rules_v6135(
      jsonb_build_array(
        jsonb_build_object(
          'emp_code',public.normalize_emp_code(v_req.emp_code),
          'work_date',v_req.work_date,
          'shift_code',v_shift,
          'note','อนุมัติคำขอแก้ไขกะ ' || v_req.request_no
        )
      )
    );

    -- Recalculate only after ALL schedule-related writes are final.
    v_recalc := public.ta_finalize_schedule_mutation_v61415(
      jsonb_build_array(
        jsonb_build_object(
          'emp_code',public.normalize_emp_code(v_req.emp_code),
          'work_date',v_req.work_date
        )
      )
    );
  end if;

  update public.ta_shift_change_requests
  set
    status=v_decision,
    decided_by=auth.uid(),
    decided_at=now(),
    decision_note=nullif(trim(coalesce(p_note,'')),''),
    applied_at=case when v_decision='APPROVED' then now() else null end,
    updated_at=now()
  where id=p_request_id
  returning * into v_req;

  return to_jsonb(v_req)
    || jsonb_build_object(
      'request_id',v_req.id,
      'emp_code',public.normalize_emp_code(v_req.emp_code),
      'work_date',v_req.work_date,
      'applied',v_decision='APPROVED',
      'requires_48h_confirmation',false,
      'schedule_guard',v_guard,
      'shift_assignment',v_assign,
      'schedule_rule_sync',v_sync,
      'attendance_recalculation',v_recalc,
      'consistency_pipeline',true,
      'version','V6.14.15'
    );
end;
$$;

revoke all on function public.ta_decide_shift_change_request_v61415(
  uuid,text,text,boolean
) from public;
grant execute on function public.ta_decide_shift_change_request_v61415(
  uuid,text,text,boolean
) to authenticated;

notify pgrst, 'reload schema';
commit;
