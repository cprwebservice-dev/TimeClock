-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.15.10
-- Manager Request Center — Atomic Apply + Resolve Workflow
-- ============================================================================
-- เป้าหมาย
-- 1) Manager ดำเนินการจริง + ปิดคำขอ ใน Transaction เดียว
-- 2) TIME_ISSUE      -> Time Certification + RESOLVED
-- 3) SPECIAL_WORK    -> Schedule/Work Plan/Rule + Final Recalc + RESOLVED
-- 4) DAYOFF_SWAP     -> SWAP / ADD แบบ Atomic ผ่าน Bulk Schedule Writer
-- 5) LEAVE_REQUEST   -> FULL_DAY แบบ Bulk Atomic
-- 6) PARTIAL_DAY     -> ยังไม่เปลี่ยนเป็น LV เต็มวัน; ให้ V6.15.11 จัด Partial Overlay
-- ============================================================================

begin;
set local statement_timeout='0';
select pg_advisory_xact_lock(hashtext('timeclock-v6.15.10-atomic-request-workflow'));

-- ---------------------------------------------------------------------------
-- 0) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ta_employee_requests_v61481') is null then
    raise exception 'MISSING_TABLE: ta_employee_requests_v61481';
  end if;
  if to_regclass('public.ta_user_profiles') is null then
    raise exception 'MISSING_TABLE: ta_user_profiles';
  end if;
  if to_regclass('public.shift_master') is null then
    raise exception 'MISSING_TABLE: shift_master';
  end if;
  if to_regclass('public.ta_shift_schedule_rules_v6123') is null then
    raise exception 'MISSING_TABLE: ta_shift_schedule_rules_v6123';
  end if;

  if to_regprocedure('public._ta_request_manager_authorized_v61481(uuid)') is null then
    raise exception 'MISSING_FUNCTION: _ta_request_manager_authorized_v61481';
  end if;
  if to_regprocedure('public._ta_portal_effective_shift_v61509(text,date)') is null then
    raise exception 'MISSING_V6.15.09: _ta_portal_effective_shift_v61509';
  end if;
  if to_regprocedure('public.ta_save_time_certification_v61139(text,date,timestamp without time zone,timestamp without time zone,text,text)') is null then
    raise exception 'MISSING_FUNCTION: ta_save_time_certification_v61139';
  end if;
  if to_regprocedure('public.ta_assign_shift_with_work_plan_v6144(text,date,text,text,time,time,text,text,text,boolean)') is null then
    raise exception 'MISSING_FUNCTION: ta_assign_shift_with_work_plan_v6144';
  end if;
  if to_regprocedure('public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean)') is null then
    raise exception 'MISSING_FUNCTION: ta_validate_schedule_guard_v6141';
  end if;
  if to_regprocedure('public.ta_upsert_schedule_rule_assignment_v6120(text,date,text,text,text,time,time,time,time,time,time,time,text,integer,jsonb,text)') is null then
    raise exception 'MISSING_FUNCTION: ta_upsert_schedule_rule_assignment_v6120';
  end if;
  if to_regprocedure('public.ta_delete_schedule_rule_assignment_v6120(text,date)') is null then
    raise exception 'MISSING_FUNCTION: ta_delete_schedule_rule_assignment_v6120';
  end if;
  if to_regprocedure('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)') is null then
    raise exception 'MISSING_FUNCTION: ta_assign_shifts_bulk_v61424';
  end if;
  if to_regprocedure('public.ta_sync_bulk_schedule_rules_v6135(jsonb)') is null then
    raise exception 'MISSING_FUNCTION: ta_sync_bulk_schedule_rules_v6135';
  end if;
  if to_regprocedure('public.ta_finalize_schedule_mutation_v61415(jsonb)') is null then
    raise exception 'MISSING_FUNCTION: ta_finalize_schedule_mutation_v61415';
  end if;
  if to_regprocedure('public.ta_resolve_paired_dayoff_shift_v6134(text)') is null then
    raise exception 'MISSING_FUNCTION: ta_resolve_paired_dayoff_shift_v6134';
  end if;
  if to_regprocedure('public.ta_get_off_shift_basis_v6135(text,date)') is null then
    raise exception 'MISSING_FUNCTION: ta_get_off_shift_basis_v6135';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Small helpers
-- ---------------------------------------------------------------------------
create or replace function public._ta_request_effective_shift_v61510(
  p_emp_code text,
  p_work_date date
)
returns table(
  shift_code text,
  shift_start_time time,
  shift_end_time time,
  is_workday boolean,
  day_type text,
  work_mode_code text
)
language sql
stable
security definer
set search_path=public,pg_catalog
as $$
  select
    upper(trim(coalesce(x.effective_shift_code,'')))::text,
    x.shift_start_time,
    x.shift_end_time,
    coalesce(x.is_workday,true),
    upper(trim(coalesce(x.day_type,'WORKDAY')))::text,
    nullif(upper(trim(coalesce(x.work_mode_code,''))),'')::text
  from public._ta_portal_effective_shift_v61509(
    public.normalize_emp_code(p_emp_code),
    p_work_date
  ) x
  limit 1;
$$;

revoke all on function public._ta_request_effective_shift_v61510(text,date)
from public,anon,authenticated;

create or replace function public._ta_request_paired_off_code_v61510(
  p_work_shift_code text
)
returns text
language sql
stable
security definer
set search_path=public,pg_catalog
as $$
  select upper(trim(x.off_shift_code))::text
  from public.ta_resolve_paired_dayoff_shift_v6134(
    upper(trim(coalesce(p_work_shift_code,'')))
  ) x
  where coalesce(x.mapping_valid,false)
    and nullif(trim(coalesce(x.off_shift_code,'')),'') is not null
  limit 1;
$$;

revoke all on function public._ta_request_paired_off_code_v61510(text)
from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 2) Atomic Apply + Resolve RPC
-- ---------------------------------------------------------------------------
create or replace function public.ta_apply_employee_request_v61510(
  p_request_id uuid,
  p_action jsonb default '{}'::jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_req public.ta_employee_requests_v61481%rowtype;
  v_emp text;
  v_type text;
  v_subtype text;
  v_actor_email text;
  v_action jsonb:=coalesce(p_action,'{}'::jsonb);
  v_note text:=nullif(trim(coalesce(p_note,'')),'');

  v_result jsonb:='{}'::jsonb;
  v_guard jsonb;
  v_rows jsonb;
  v_sync jsonb;
  v_final jsonb;

  v_shift_code text;
  v_template_code text;
  v_mode text;
  v_start time;
  v_end time;
  v_planned integer:=0;
  v_is_off boolean:=false;
  v_ack48 boolean:=false;

  v_customer_start time;
  v_customer_end time;
  v_customer_end_mode text;

  v_base_shift text;
  v_generated_shift text;
  v_first_end time;
  v_second_start time;
  v_second_end time;
  v_custom_start time;
  v_custom_end time;
  v_off_window_start time;
  v_off_window_end time;
  v_off_basis_shift text;

  v_source_date date;
  v_target_date date;
  v_source_code text;
  v_target_code text;
  v_source_work_code text;
  v_target_work_code text;
  v_target_off_code text;
  v_source_is_workday boolean;
  v_target_is_workday boolean;
  v_basis jsonb;

  v_leave_end date;
  v_d date;
  v_day_code text;
  v_day_is_workday boolean;

  v_cert_start timestamp without time zone;
  v_cert_end timestamp without time zone;
  v_reason_code text;
begin
  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED';
  end if;

  select *
  into v_req
  from public.ta_employee_requests_v61481 r
  where r.request_id=p_request_id
  for update;

  if v_req.request_id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if upper(coalesce(v_req.status,'')) not in ('PENDING','IN_REVIEW') then
    raise exception 'REQUEST_NOT_ACTIVE';
  end if;

  if not public._ta_request_manager_authorized_v61481(p_request_id) then
    raise exception 'REQUEST_DECISION_PERMISSION_DENIED';
  end if;

  select lower(trim(coalesce(p.email,'')))
  into v_actor_email
  from public.ta_user_profiles p
  where p.user_id=auth.uid()
    and p.is_active=true
  limit 1;

  if nullif(v_actor_email,'') is null then
    raise exception 'ACTIVE_USER_PROFILE_REQUIRED';
  end if;

  v_emp:=public.normalize_emp_code(v_req.emp_code);
  v_type:=upper(trim(coalesce(v_req.request_type,'')));
  v_subtype:=upper(trim(coalesce(v_req.request_subtype,'')));

  if nullif(v_emp,'') is null then
    raise exception 'REQUEST_EMPLOYEE_REQUIRED';
  end if;

  -- -------------------------------------------------------------------------
  -- A) ขอรับรองเวลา
  -- -------------------------------------------------------------------------
  if v_type='TIME_ISSUE' then
    begin
      v_cert_start:=nullif(v_action->>'certified_start_at','')::timestamp without time zone;
      v_cert_end:=nullif(v_action->>'certified_end_at','')::timestamp without time zone;
    exception when others then
      raise exception 'TIME_CERTIFICATION_DATETIME_INVALID';
    end;

    v_reason_code:=nullif(upper(trim(coalesce(v_action->>'reason_code',''))),'');

    if v_cert_start is null or v_cert_end is null or v_reason_code is null then
      raise exception 'TIME_CERTIFICATION_ACTION_REQUIRED';
    end if;

    v_result:=public.ta_save_time_certification_v61139(
      v_emp,
      v_req.work_date,
      v_cert_start,
      v_cert_end,
      v_reason_code,
      coalesce(v_note,nullif(trim(coalesce(v_action->>'note','')),''),v_req.reason)
    );

  -- -------------------------------------------------------------------------
  -- B) งานกะพิเศษ
  -- -------------------------------------------------------------------------
  elsif v_type='SPECIAL_WORK' then
    v_shift_code:=nullif(upper(trim(coalesce(v_action->>'shift_code',''))),'');
    v_template_code:=nullif(upper(trim(coalesce(v_action->>'template_code',''))),'');
    v_mode:=nullif(upper(trim(coalesce(v_action->>'work_mode_code',v_subtype))),'');

    if v_shift_code is null or v_template_code is null then
      raise exception 'SPECIAL_WORK_SCHEDULE_ACTION_REQUIRED';
    end if;

    if v_mode not in ('NORMAL_LATE_CUSTOMER','SPLIT_WAIT_NIGHT','HOUR_BASED') then
      raise exception 'SPECIAL_WORK_MODE_INVALID';
    end if;

    begin
      v_start:=nullif(v_action->>'proposed_start_time','')::time;
      v_end:=nullif(v_action->>'proposed_end_time','')::time;
      v_planned:=greatest(coalesce(nullif(v_action->>'planned_minutes','')::integer,0),0);
      v_is_off:=coalesce(nullif(v_action->>'is_off','')::boolean,false);
      v_ack48:=coalesce(nullif(v_action->>'acknowledge_48h','')::boolean,false);

      v_customer_start:=nullif(v_action->>'customer_window_start','')::time;
      v_customer_end:=nullif(v_action->>'customer_window_end','')::time;
      v_customer_end_mode:=upper(trim(coalesce(v_action->>'customer_end_mode','NONE')));

      v_base_shift:=nullif(upper(trim(coalesce(v_action->>'base_shift_code',''))),'');
      v_generated_shift:=nullif(upper(trim(coalesce(v_action->>'generated_shift_code',''))),'');
      v_first_end:=nullif(v_action->>'first_segment_end','')::time;
      v_second_start:=nullif(v_action->>'second_segment_start','')::time;
      v_second_end:=nullif(v_action->>'second_segment_planned_end','')::time;
      v_custom_start:=nullif(v_action->>'custom_start_time','')::time;
      v_custom_end:=nullif(v_action->>'custom_end_time','')::time;
      v_off_window_start:=nullif(v_action->>'off_window_start','')::time;
      v_off_window_end:=nullif(v_action->>'off_window_end','')::time;
      v_off_basis_shift:=nullif(upper(trim(coalesce(v_action->>'off_basis_shift_code',''))),'');
    exception when others then
      raise exception 'SPECIAL_WORK_ACTION_FORMAT_INVALID';
    end;

    if v_start is null and not v_is_off then
      raise exception 'SPECIAL_WORK_PROPOSED_START_REQUIRED';
    end if;

    v_guard:=public.ta_validate_schedule_guard_v6141(
      v_emp,
      v_req.work_date,
      v_shift_code,
      v_start,
      v_end,
      v_planned,
      v_is_off
    );

    if coalesce((v_guard->>'hard_block')::boolean,false) then
      raise exception 'SCHEDULE_GUARD_BLOCKED: %',
        coalesce(v_guard->>'message','ไม่ผ่านเงื่อนไขการจัดกะ');
    end if;

    if coalesce((v_guard->>'warning_48h')::boolean,false)
       and not v_ack48 then
      return jsonb_build_object(
        'applied',false,
        'request_id',v_req.request_id,
        'request_no',v_req.request_no,
        'request_status',v_req.status,
        'requires_48h_confirmation',true,
        'schedule_guard',v_guard,
        'version','V6.15.10'
      );
    end if;

    v_result:=public.ta_assign_shift_with_work_plan_v6144(
      v_emp,
      v_req.work_date,
      v_shift_code,
      v_template_code,
      v_customer_start,
      v_customer_end,
      v_customer_end_mode,
      coalesce(v_note,v_req.reason),
      'Employee Request '||coalesce(v_req.request_no,v_req.request_id::text),
      true
    );

    perform public.ta_upsert_schedule_rule_assignment_v6120(
      v_emp,
      v_req.work_date,
      v_mode,
      v_base_shift,
      v_generated_shift,
      v_first_end,
      v_second_start,
      v_second_end,
      v_custom_start,
      v_custom_end,
      v_off_window_start,
      v_off_window_end,
      v_off_basis_shift,
      v_planned,
      coalesce(v_action->'validation_snapshot','{}'::jsonb)
        || jsonb_build_object(
          'atomic_request_id',v_req.request_id,
          'atomic_request_no',v_req.request_no,
          'atomic_version','V6.15.10',
          'server_guard',coalesce(v_guard,'{}'::jsonb)
        ),
      coalesce(v_note,v_req.reason)
    );

    v_final:=public.ta_finalize_schedule_mutation_v61415(
      jsonb_build_array(
        jsonb_build_object(
          'emp_code',v_emp,
          'work_date',v_req.work_date
        )
      )
    );

    v_result:=coalesce(v_result,'{}'::jsonb)
      || jsonb_build_object(
        'schedule_guard',v_guard,
        'schedule_finalizer',v_final,
        'work_mode_code',v_mode
      );

  -- -------------------------------------------------------------------------
  -- C) สลับวันหยุด / ขอหยุดเพิ่ม
  -- -------------------------------------------------------------------------
  elsif v_type='DAYOFF_SWAP' then
    v_source_date:=v_req.work_date;

    if v_subtype='ADD_DAYOFF' then
      v_target_date:=v_req.work_date;

      select e.shift_code,e.is_workday
      into v_target_code,v_target_is_workday
      from public._ta_request_effective_shift_v61510(v_emp,v_target_date) e
      limit 1;

      if nullif(v_target_code,'') is null then
        raise exception 'DAYOFF_ADD_TARGET_SHIFT_NOT_FOUND';
      end if;
      if not coalesce(v_target_is_workday,false) then
        raise exception 'DAYOFF_ADD_TARGET_MUST_BE_WORKDAY';
      end if;

      v_target_work_code:=v_target_code;
      v_target_off_code:=public._ta_request_paired_off_code_v61510(v_target_work_code);
      if nullif(v_target_off_code,'') is null then
        raise exception 'DAYOFF_PAIRED_SHIFT_NOT_FOUND: %',v_target_work_code;
      end if;

      v_rows:=jsonb_build_array(
        jsonb_build_object(
          'emp_code',v_emp,
          'work_date',v_target_date,
          'shift_code',v_target_off_code,
          'note',coalesce(v_note,'ขอหยุดเพิ่มจาก Employee Portal • '||coalesce(v_req.request_no,''))
        )
      );

      v_result:=public.ta_assign_shifts_bulk_v61424(
        v_rows,
        'Employee Request ADD_DAYOFF '||coalesce(v_req.request_no,''),
        true
      );
      v_sync:=public.ta_sync_bulk_schedule_rules_v6135(v_rows);
      v_final:=public.ta_finalize_schedule_mutation_v61415(v_rows);

      v_result:=coalesce(v_result,'{}'::jsonb)
        || jsonb_build_object(
          'dayoff_mode','ADD',
          'target_date',v_target_date,
          'target_work_shift',v_target_work_code,
          'target_off_shift',v_target_off_code,
          'schedule_rule_sync',v_sync,
          'schedule_finalizer',v_final
        );

    elsif v_subtype='SWAP_DAYOFF' then
      begin
        v_target_date:=nullif(v_req.detail->>'target_date','')::date;
      exception when others then
        raise exception 'DAYOFF_SWAP_TARGET_DATE_INVALID';
      end;

      if v_target_date is null then
        raise exception 'DAYOFF_SWAP_TARGET_DATE_REQUIRED';
      end if;
      if date_trunc('month',v_target_date)<>date_trunc('month',v_source_date) then
        raise exception 'DAYOFF_SWAP_SAME_MONTH_REQUIRED';
      end if;
      if v_target_date=v_source_date then
        raise exception 'DAYOFF_SWAP_DATE_MUST_DIFFER';
      end if;

      select e.shift_code,e.is_workday
      into v_source_code,v_source_is_workday
      from public._ta_request_effective_shift_v61510(v_emp,v_source_date) e
      limit 1;

      select e.shift_code,e.is_workday
      into v_target_code,v_target_is_workday
      from public._ta_request_effective_shift_v61510(v_emp,v_target_date) e
      limit 1;

      if nullif(v_source_code,'') is null then
        raise exception 'DAYOFF_SWAP_SOURCE_SHIFT_NOT_FOUND';
      end if;
      if coalesce(v_source_is_workday,true) then
        raise exception 'DAYOFF_SWAP_SOURCE_NOT_DAYOFF';
      end if;
      if nullif(v_target_code,'') is null or not coalesce(v_target_is_workday,false) then
        raise exception 'DAYOFF_SWAP_TARGET_MUST_BE_WORKDAY';
      end if;

      -- Preferred reverse mapping: Paired OFF -> working shift.
      select upper(trim(r.shift_code))
      into v_source_work_code
      from public.ta_shift_schedule_rules_v6123 r
      where upper(trim(coalesce(r.paired_off_shift_code,'')))=upper(trim(v_source_code))
        and coalesce(r.is_enabled,true)
      order by r.shift_code
      limit 1;

      -- Dynamic/special OFF fallback: use canonical day-off basis resolver.
      if nullif(v_source_work_code,'') is null then
        v_basis:=public.ta_get_off_shift_basis_v6135(v_emp,v_source_date);
        v_source_work_code:=nullif(upper(trim(coalesce(v_basis->>'basis_shift_code',''))),'');
      end if;

      if nullif(v_source_work_code,'') is null
         or not exists(
           select 1
           from public.shift_master sm
           where upper(trim(sm.shift_code))=v_source_work_code
             and coalesce(sm.is_active,true)
             and coalesce(sm.is_workday,true)
         ) then
        raise exception 'DAYOFF_SWAP_SOURCE_WORK_SHIFT_NOT_FOUND: %',v_source_code;
      end if;

      v_target_work_code:=v_target_code;
      v_target_off_code:=public._ta_request_paired_off_code_v61510(v_target_work_code);
      if nullif(v_target_off_code,'') is null then
        raise exception 'DAYOFF_PAIRED_SHIFT_NOT_FOUND: %',v_target_work_code;
      end if;

      -- Whole payload is validated/written atomically by canonical Bulk Writer.
      v_rows:=jsonb_build_array(
        jsonb_build_object(
          'emp_code',v_emp,
          'work_date',v_source_date,
          'shift_code',v_source_work_code,
          'note',coalesce(v_note,'สลับวันหยุด • วันเดิมกลับเป็นวันทำงาน • '||coalesce(v_req.request_no,''))
        ),
        jsonb_build_object(
          'emp_code',v_emp,
          'work_date',v_target_date,
          'shift_code',v_target_off_code,
          'note',coalesce(v_note,'สลับวันหยุด • วันใหม่เป็นวันหยุด • '||coalesce(v_req.request_no,''))
        )
      );

      v_result:=public.ta_assign_shifts_bulk_v61424(
        v_rows,
        'Employee Request SWAP_DAYOFF '||coalesce(v_req.request_no,''),
        true
      );
      v_sync:=public.ta_sync_bulk_schedule_rules_v6135(v_rows);
      v_final:=public.ta_finalize_schedule_mutation_v61415(v_rows);

      v_result:=coalesce(v_result,'{}'::jsonb)
        || jsonb_build_object(
          'dayoff_mode','SWAP',
          'source_date',v_source_date,
          'target_date',v_target_date,
          'source_old_shift',v_source_code,
          'source_new_work_shift',v_source_work_code,
          'target_old_work_shift',v_target_work_code,
          'target_new_off_shift',v_target_off_code,
          'schedule_rule_sync',v_sync,
          'schedule_finalizer',v_final
        );
    else
      raise exception 'DAYOFF_REQUEST_SUBTYPE_NOT_SUPPORTED: %',v_subtype;
    end if;

  -- -------------------------------------------------------------------------
  -- D) ลาเต็มวัน — Bulk Atomic
  -- PARTIAL_DAY intentionally not converted to LV whole day.
  -- -------------------------------------------------------------------------
  elsif v_type='LEAVE_REQUEST' then
    if v_subtype='PARTIAL_DAY' then
      return jsonb_build_object(
        'applied',false,
        'request_id',v_req.request_id,
        'request_no',v_req.request_no,
        'request_status',v_req.status,
        'requires_partial_leave_overlay',true,
        'message','PARTIAL_LEAVE_REQUIRES_V6.15.11',
        'version','V6.15.10'
      );
    end if;

    if v_subtype<>'FULL_DAY' then
      raise exception 'LEAVE_REQUEST_SUBTYPE_NOT_SUPPORTED: %',v_subtype;
    end if;

    begin
      v_leave_end:=coalesce(nullif(v_req.detail->>'end_date','')::date,v_req.work_date);
    exception when others then
      raise exception 'LEAVE_END_DATE_INVALID';
    end;

    if v_leave_end<v_req.work_date then
      raise exception 'LEAVE_END_BEFORE_START';
    end if;
    if v_leave_end-v_req.work_date>31 then
      raise exception 'LEAVE_RANGE_MAX_32_DAYS';
    end if;

    v_rows:='[]'::jsonb;
    for v_d in
      select generate_series(v_req.work_date,v_leave_end,interval '1 day')::date
    loop
      select e.shift_code,e.is_workday
      into v_day_code,v_day_is_workday
      from public._ta_request_effective_shift_v61510(v_emp,v_d) e
      limit 1;

      if nullif(v_day_code,'') is null then
        raise exception 'LEAVE_SCHEDULE_NOT_FOUND: %',v_d;
      end if;
      if not coalesce(v_day_is_workday,false) then
        raise exception 'LEAVE_NOT_ALLOWED_NON_WORKDAY: %',v_d;
      end if;

      v_rows:=v_rows || jsonb_build_array(
        jsonb_build_object(
          'emp_code',v_emp,
          'work_date',v_d,
          'shift_code','LV',
          'note',coalesce(v_note,'แจ้งลาเพื่อปรับตารางกะ • '||coalesce(v_req.request_no,''))
        )
      );
    end loop;

    v_result:=public.ta_assign_shifts_bulk_v61424(
      v_rows,
      'Employee Request FULL_DAY LEAVE '||coalesce(v_req.request_no,''),
      true
    );
    v_sync:=public.ta_sync_bulk_schedule_rules_v6135(v_rows);
    v_final:=public.ta_finalize_schedule_mutation_v61415(v_rows);

    v_result:=coalesce(v_result,'{}'::jsonb)
      || jsonb_build_object(
        'leave_mode','FULL_DAY',
        'leave_start_date',v_req.work_date,
        'leave_end_date',v_leave_end,
        'leave_days',jsonb_array_length(v_rows),
        'schedule_rule_sync',v_sync,
        'schedule_finalizer',v_final
      );
  else
    raise exception 'REQUEST_TYPE_NOT_SUPPORTED: %',v_type;
  end if;

  -- -------------------------------------------------------------------------
  -- 3) Resolve only AFTER the real business action succeeded.
  --    Any exception above rolls back everything in the same DB transaction.
  -- -------------------------------------------------------------------------
  update public.ta_employee_requests_v61481 r
  set
    status='RESOLVED',
    decided_by=auth.uid(),
    decided_by_email=v_actor_email,
    decided_at=now(),
    decision_note=coalesce(v_note,r.decision_note),
    resolved_at=now(),
    updated_at=now()
  where r.request_id=v_req.request_id
    and r.status in ('PENDING','IN_REVIEW');

  if not found then
    raise exception 'REQUEST_NOT_ACTIVE_AFTER_APPLY';
  end if;

  return jsonb_build_object(
    'applied',true,
    'request_id',v_req.request_id,
    'request_no',v_req.request_no,
    'request_type',v_type,
    'request_subtype',v_subtype,
    'request_status','RESOLVED',
    'employee',v_emp,
    'work_date',v_req.work_date,
    'action_result',coalesce(v_result,'{}'::jsonb),
    'version','V6.15.10'
  );
end;
$$;

revoke all on function public.ta_apply_employee_request_v61510(uuid,jsonb,text)
from public,anon,authenticated;
grant execute on function public.ta_apply_employee_request_v61510(uuid,jsonb,text)
to authenticated;

comment on function public.ta_apply_employee_request_v61510(uuid,jsonb,text)
is 'V6.15.10 Manager atomic request workflow: applies the real schedule/certification action and resolves the employee request in the same PostgreSQL transaction.';

notify pgrst,'reload schema';
commit;
