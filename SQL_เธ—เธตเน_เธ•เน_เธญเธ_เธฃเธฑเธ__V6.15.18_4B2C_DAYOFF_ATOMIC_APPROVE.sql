-- ============================================================================
-- SQL ที่ต้องรัน
-- TimeClock Enterprise V6.15.18
-- 4B.2C — Day-off Request Atomic Approve + Schedule Apply Guard
-- ============================================================================
-- เป้าหมาย
-- 1) Manager ยืนยันคำขอวันหยุดแล้วตรวจ Backend ซ้ำใน Transaction เดียว
-- 2) ตรวจ Work Pattern 5D/6D, System Period, Day-off Quota, Minimum Rest 6h,
--    Night Sequence และ 48h warning ก่อนเขียน Schedule
-- 3) ใช้ V6.15.10 Atomic Writer เดิมเป็น Canonical Business Writer
-- 4) ตรวจ Final State หลังเขียน ถ้าไม่ตรงให้ Exception เพื่อ Rollback ทั้ง Transaction
-- 5) Request จะ RESOLVED เฉพาะเมื่อ Schedule + Finalizer + Final Verification สำเร็จ
-- 6) เก็บ Manager Apply snapshot ลง Portal Audit (ไม่แก้ request.detail หลัง Apply เพื่อไม่ชน Submit Guard)
-- ============================================================================

begin;
set local statement_timeout='0';
select pg_advisory_xact_lock(
  hashtext('timeclock-v6.15.18-4b2c-dayoff-atomic-approve')
);

-- ---------------------------------------------------------------------------
-- 0) Preflight dependencies
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ta_employee_requests_v61481') is null then
    raise exception 'MISSING_TABLE: ta_employee_requests_v61481';
  end if;

  if to_regclass('public.ta_employee_portal_audit_v61482') is null then
    raise exception 'MISSING_TABLE: ta_employee_portal_audit_v61482';
  end if;

  if to_regprocedure(
    'public.ta_get_employee_request_dayoff_review_v61517(uuid)'
  ) is null then
    raise exception 'MISSING_V6.15.17: ta_get_employee_request_dayoff_review_v61517';
  end if;

  if to_regprocedure(
    'public.ta_apply_employee_request_v61510(uuid,jsonb,text)'
  ) is null then
    raise exception 'MISSING_V6.15.10: ta_apply_employee_request_v61510';
  end if;

  if to_regprocedure(
    'public._ta_request_manager_authorized_v61481(uuid)'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_request_manager_authorized_v61481';
  end if;

  if to_regprocedure(
    'public._ta_validate_shift_pattern_v651(text,date,text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_validate_shift_pattern_v651';
  end if;

  if to_regprocedure(
    'public._ta_assert_system_period_action_v6110(date,text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_assert_system_period_action_v6110';
  end if;

  if to_regprocedure(
    'public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_validate_schedule_guard_v6141';
  end if;

  if to_regprocedure(
    'public.ta_validate_dayoff_quota_bulk_v6143(jsonb)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_validate_dayoff_quota_bulk_v6143';
  end if;

  if to_regprocedure(
    'public.ta_validate_night_sequence_bulk_v61437(jsonb)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_validate_night_sequence_bulk_v61437';
  end if;

  if to_regprocedure(
    'public._ta_request_effective_shift_v61510(text,date)'
  ) is null then
    raise exception 'MISSING_V6.15.10: _ta_request_effective_shift_v61510';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Review V6.15.18
--    เพิ่ม Work Pattern 5D/6D + 48h warning ลง Manager Review ก่อน Apply
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_employee_request_dayoff_review_v61518(
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_review jsonb;
  v_rows jsonb;
  v_blockers jsonb;
  v_warnings jsonb;
  v_item jsonb;
  v_emp text;
  v_date date;
  v_shift text;
  v_pattern text;
  v_source_guard jsonb;
  v_warning_exists boolean:=false;
begin
  v_review:=public.ta_get_employee_request_dayoff_review_v61517(
    p_request_id
  );

  v_rows:=coalesce(v_review->'proposed_rows','[]'::jsonb);
  v_blockers:=coalesce(v_review->'blockers','[]'::jsonb);
  v_warnings:=coalesce(v_review->'warnings','[]'::jsonb);

  if jsonb_typeof(v_rows)='array' then
    for v_item in
      select value
      from jsonb_array_elements(v_rows)
    loop
      v_emp:=public.normalize_emp_code(v_item->>'emp_code');

      begin
        v_date:=nullif(v_item->>'work_date','')::date;
      exception when others then
        v_date:=null;
      end;

      v_shift:=nullif(
        upper(trim(coalesce(v_item->>'shift_code',''))),
        ''
      );

      if nullif(v_emp,'') is null
         or v_date is null
         or v_shift is null then
        v_blockers:=v_blockers || jsonb_build_array(
          jsonb_build_object(
            'code','DAYOFF_APPLY_ROW_INVALID',
            'message','ข้อมูลกะที่เตรียมสำหรับอนุมัติไม่สมบูรณ์'
          )
        );
        continue;
      end if;

      begin
        v_pattern:=public._ta_validate_shift_pattern_v651(
          v_emp,
          v_date,
          v_shift
        );
      exception when others then
        v_blockers:=v_blockers || jsonb_build_array(
          jsonb_build_object(
            'code','DAYOFF_WORK_PATTERN_BLOCKED',
            'message',sqlerrm,
            'work_date',v_date,
            'shift_code',v_shift
          )
        );
      end;
    end loop;
  end if;

  v_source_guard:=coalesce(
    v_review->'source_schedule_guard',
    '{}'::jsonb
  );

  select exists(
    select 1
    from jsonb_array_elements(v_warnings) x
    where x->>'code'='CONTINUOUS_WORK_OVER_48H'
  )
  into v_warning_exists;

  if coalesce(
       nullif(v_source_guard->>'warning_48h','')::boolean,
       false
     )
     and not v_warning_exists then
    v_warnings:=v_warnings || jsonb_build_array(
      jsonb_build_object(
        'code','CONTINUOUS_WORK_OVER_48H',
        'message',coalesce(
          v_source_guard->>'message',
          'ชั่วโมงทำงานต่อเนื่องเกิน 48 ชั่วโมง ควรกำหนดวันหยุด'
        ),
        'continuous_minutes_after',
          coalesce(
            nullif(v_source_guard->>'continuous_minutes_after','')::integer,
            0
          )
      )
    );
  end if;

  return v_review || jsonb_build_object(
    'allowed',jsonb_array_length(v_blockers)=0,
    'blockers',v_blockers,
    'warnings',v_warnings,
    'apply_guard',jsonb_build_object(
      'work_pattern_checked',true,
      'system_period_checked_on_apply',true,
      'quota_checked_on_apply',true,
      'minimum_rest_checked_on_apply',true,
      'night_sequence_checked_on_apply',true,
      'final_state_verified_on_apply',true
    ),
    'version','V6.15.18'
  );
end;
$$;

revoke all on function
  public.ta_get_employee_request_dayoff_review_v61518(uuid)
from public,anon,authenticated;

grant execute on function
  public.ta_get_employee_request_dayoff_review_v61518(uuid)
to authenticated;

comment on function public.ta_get_employee_request_dayoff_review_v61518(uuid)
is 'V6.15.18 Manager day-off review: V6.15.17 authoritative preview plus explicit 5D/6D Work Pattern validation and 48-hour warning.';

-- ---------------------------------------------------------------------------
-- 2) Atomic Approve V6.15.18
-- ---------------------------------------------------------------------------
create or replace function public.ta_apply_employee_request_dayoff_v61518(
  p_request_id uuid,
  p_acknowledge_48h boolean default false,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_req public.ta_employee_requests_v61481%rowtype;
  v_emp text;
  v_subtype text;
  v_actor_email text;
  v_decision_note text;

  v_review jsonb;
  v_rows jsonb;
  v_item jsonb;
  v_blockers jsonb;

  v_date date;
  v_shift_code text;
  v_shift_master jsonb;
  v_is_workday boolean;
  v_planned integer:=0;
  v_pattern text;

  v_guard jsonb;
  v_guard_rows jsonb:='[]'::jsonb;
  v_requires_48h boolean:=false;
  v_continuous_after integer:=0;

  v_quota_guard jsonb;
  v_sequence_guard jsonb;

  v_source_date date;
  v_target_date date;
  v_expected_source_code text;
  v_expected_target_code text;

  v_final_source_code text;
  v_final_source_is_workday boolean;
  v_final_target_code text;
  v_final_target_is_workday boolean;
  v_final_state jsonb;

  v_apply_result jsonb;
  v_audit_id uuid;
  v_request_status text;
  v_snapshot jsonb;
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

  if upper(trim(coalesce(v_req.request_type,'')))<>'DAYOFF_SWAP' then
    raise exception 'REQUEST_TYPE_NOT_DAYOFF';
  end if;

  if upper(trim(coalesce(v_req.status,'')))
     not in ('PENDING','IN_REVIEW') then
    raise exception 'REQUEST_NOT_ACTIVE';
  end if;

  if not public._ta_request_manager_authorized_v61481(
    p_request_id
  ) then
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
  v_subtype:=upper(trim(coalesce(v_req.request_subtype,'')));

  if v_subtype not in ('ADD_DAYOFF','SWAP_DAYOFF') then
    raise exception 'DAYOFF_REQUEST_SUBTYPE_NOT_SUPPORTED: %',v_subtype;
  end if;

  -- Serialize day-off approvals for the same employee/month. The canonical
  -- Bulk Writer still performs its own DB guards; this lock also prevents two
  -- Manager request approvals from consuming the same request/quota window.
  perform pg_advisory_xact_lock(
    hashtext(
      'employee-dayoff-approve:'
      ||v_emp
      ||':'
      ||to_char(v_req.work_date,'YYYY-MM')
    )
  );

  -- Fresh authoritative review AFTER request row lock and advisory lock.
  v_review:=public.ta_get_employee_request_dayoff_review_v61518(
    p_request_id
  );

  v_blockers:=coalesce(v_review->'blockers','[]'::jsonb);
  if coalesce((v_review->>'allowed')::boolean,false)=false then
    raise exception 'DAYOFF_REQUEST_PREFLIGHT_BLOCKED: %',
      v_blockers::text;
  end if;

  v_rows:=coalesce(v_review->'proposed_rows','[]'::jsonb);
  if jsonb_typeof(v_rows)<>'array'
     or jsonb_array_length(v_rows)=0 then
    raise exception 'DAYOFF_REQUEST_PROPOSED_ROWS_REQUIRED';
  end if;

  -- -------------------------------------------------------------------------
  -- Apply-time hard guards. These are repeated even though Review passed,
  -- because Manager confirmation and Schedule write must use current DB state.
  -- -------------------------------------------------------------------------
  for v_item in
    select value
    from jsonb_array_elements(v_rows)
  loop
    v_emp:=public.normalize_emp_code(v_item->>'emp_code');

    begin
      v_date:=nullif(v_item->>'work_date','')::date;
    exception when others then
      raise exception 'DAYOFF_APPLY_WORK_DATE_INVALID';
    end;

    v_shift_code:=nullif(
      upper(trim(coalesce(v_item->>'shift_code',''))),
      ''
    );

    if nullif(v_emp,'') is null
       or v_date is null
       or v_shift_code is null then
      raise exception 'DAYOFF_APPLY_ROW_INVALID';
    end if;

    -- Closed System Period must never be bypassed here.
    perform public._ta_assert_system_period_action_v6110(
      v_date,
      'SCHEDULE_EDIT'
    );

    -- Explicit 5D / 6D validation before writer.
    begin
      v_pattern:=public._ta_validate_shift_pattern_v651(
        v_emp,
        v_date,
        v_shift_code
      );
    exception when others then
      raise exception 'DAYOFF_REQUEST_WORK_PATTERN_BLOCKED: %',sqlerrm;
    end;

    select to_jsonb(sm)
    into v_shift_master
    from public.shift_master sm
    where upper(trim(sm.shift_code))=v_shift_code
      and coalesce(sm.is_active,true)
    limit 1;

    if v_shift_master is null then
      raise exception 'SHIFT_NOT_FOUND_OR_INACTIVE: %',v_shift_code;
    end if;

    v_is_workday:=coalesce(
      nullif(v_shift_master->>'is_workday','')::boolean,
      true
    );

    v_planned:=greatest(
      coalesce(
        nullif(
          v_shift_master->>'scheduled_minutes_including_break',
          ''
        )::integer,
        nullif(v_shift_master->>'planned_minutes','')::integer,
        0
      ),
      0
    );

    v_guard:=public.ta_validate_schedule_guard_v6141(
      v_emp,
      v_date,
      v_shift_code,
      nullif(v_shift_master->>'start_time','')::time,
      nullif(v_shift_master->>'end_time','')::time,
      case when v_is_workday then v_planned else 0 end,
      not v_is_workday
    );

    v_guard_rows:=v_guard_rows || jsonb_build_array(
      jsonb_build_object(
        'work_date',v_date,
        'shift_code',v_shift_code,
        'pattern_code',v_pattern,
        'guard',coalesce(v_guard,'{}'::jsonb)
      )
    );

    if coalesce((v_guard->>'hard_block')::boolean,false) then
      raise exception 'DAYOFF_REQUEST_MINIMUM_REST_BLOCKED: %',
        coalesce(
          v_guard->>'message',
          'เวลาพักจากกะก่อนหน้าต่ำกว่า 6 ชั่วโมง'
        );
    end if;

    if v_is_workday
       and coalesce(
         nullif(v_guard->>'warning_48h','')::boolean,
         false
       ) then
      v_requires_48h:=true;
      v_continuous_after:=greatest(
        v_continuous_after,
        coalesce(
          nullif(v_guard->>'continuous_minutes_after','')::integer,
          0
        )
      );
    end if;
  end loop;

  -- Whole-payload Day-off quota projection.
  v_quota_guard:=public.ta_validate_dayoff_quota_bulk_v6143(
    v_rows
  );

  if coalesce((v_quota_guard->>'allowed')::boolean,false)=false then
    raise exception 'DAYOFF_REQUEST_QUOTA_BLOCKED: %',
      coalesce(v_quota_guard->'violations','[]'::jsonb)::text;
  end if;

  -- Whole-payload Night Sequence projected final state.
  v_sequence_guard:=public.ta_validate_night_sequence_bulk_v61437(
    v_rows
  );

  if coalesce((v_sequence_guard->>'allowed')::boolean,false)=false then
    raise exception 'DAYOFF_REQUEST_NIGHT_SEQUENCE_BLOCKED: %',
      coalesce(v_sequence_guard->'violations','[]'::jsonb)::text;
  end if;

  -- >48h remains a Manager confirmation warning, not an automatic hard block.
  if v_requires_48h
     and not coalesce(p_acknowledge_48h,false) then
    return jsonb_build_object(
      'applied',false,
      'request_id',v_req.request_id,
      'request_no',v_req.request_no,
      'request_status',v_req.status,
      'requires_48h_confirmation',true,
      'continuous_minutes_after',v_continuous_after,
      'continuous_hours_after',round(v_continuous_after::numeric/60,2),
      'guard_rows',v_guard_rows,
      'quota_guard',v_quota_guard,
      'night_sequence_guard',v_sequence_guard,
      'version','V6.15.18'
    );
  end if;

  begin
    v_source_date:=nullif(
      v_review->'source'->>'work_date',
      ''
    )::date;
    v_target_date:=nullif(
      v_review->'target'->>'work_date',
      ''
    )::date;
  exception when others then
    raise exception 'DAYOFF_REQUEST_REVIEW_DATE_INVALID';
  end;

  v_expected_source_code:=nullif(
    upper(trim(coalesce(
      v_review->'source'->>'proposed_shift_code',
      ''
    ))),
    ''
  );

  v_expected_target_code:=nullif(
    upper(trim(coalesce(
      v_review->'target'->>'proposed_shift_code',
      ''
    ))),
    ''
  );

  v_decision_note:=nullif(trim(coalesce(p_note,'')),'');
  if v_decision_note is null then
    if v_subtype='ADD_DAYOFF' then
      v_decision_note:=
        'อนุมัติคำขอหยุดเพิ่มและปรับตารางกะแล้ว';
    else
      v_decision_note:=
        'อนุมัติสลับวันหยุด '
        ||to_char(v_source_date,'DD/MM/YYYY')
        ||' → '
        ||to_char(v_target_date,'DD/MM/YYYY')
        ||' และปรับตารางกะแล้ว';
    end if;
  end if;

  -- Canonical writer. This performs the real Bulk mutation, Smart OFF sync,
  -- Attendance finalizer and RESOLVED update in one PostgreSQL transaction.
  v_apply_result:=public.ta_apply_employee_request_v61510(
    p_request_id,
    '{}'::jsonb,
    v_decision_note
  );

  if coalesce((v_apply_result->>'applied')::boolean,false)=false then
    raise exception 'DAYOFF_REQUEST_ATOMIC_APPLY_NOT_COMPLETED: %',
      coalesce(v_apply_result->>'message','UNKNOWN');
  end if;

  -- -------------------------------------------------------------------------
  -- Final-state verification AFTER write but BEFORE this outer transaction
  -- returns. Any mismatch raises and rolls back Schedule, Request, Audit,
  -- Notification and Attendance finalization together.
  -- -------------------------------------------------------------------------
  if v_subtype='SWAP_DAYOFF' then
    select e.shift_code,e.is_workday
    into v_final_source_code,v_final_source_is_workday
    from public._ta_request_effective_shift_v61510(
      public.normalize_emp_code(v_req.emp_code),
      v_source_date
    ) e
    limit 1;

    if nullif(upper(trim(coalesce(v_final_source_code,''))),'')
         is distinct from v_expected_source_code
       or not coalesce(v_final_source_is_workday,false) then
      raise exception 'DAYOFF_REQUEST_FINAL_STATE_MISMATCH_SOURCE: expected % got %',
        coalesce(v_expected_source_code,'-'),
        coalesce(v_final_source_code,'-');
    end if;
  end if;

  select e.shift_code,e.is_workday
  into v_final_target_code,v_final_target_is_workday
  from public._ta_request_effective_shift_v61510(
    public.normalize_emp_code(v_req.emp_code),
    v_target_date
  ) e
  limit 1;

  if nullif(upper(trim(coalesce(v_final_target_code,''))),'')
       is distinct from v_expected_target_code
     or coalesce(v_final_target_is_workday,true) then
    raise exception 'DAYOFF_REQUEST_FINAL_STATE_MISMATCH_TARGET: expected % got %',
      coalesce(v_expected_target_code,'-'),
      coalesce(v_final_target_code,'-');
  end if;

  select upper(trim(coalesce(r.status,'')))
  into v_request_status
  from public.ta_employee_requests_v61481 r
  where r.request_id=p_request_id;

  if v_request_status<>'RESOLVED' then
    raise exception 'DAYOFF_REQUEST_FINAL_STATUS_MISMATCH: %',
      coalesce(v_request_status,'-');
  end if;

  v_final_state:=jsonb_build_object(
    'source',case
      when v_subtype='SWAP_DAYOFF' then
        jsonb_build_object(
          'work_date',v_source_date,
          'shift_code',v_final_source_code,
          'is_workday',v_final_source_is_workday
        )
      else null
    end,
    'target',jsonb_build_object(
      'work_date',v_target_date,
      'shift_code',v_final_target_code,
      'is_workday',v_final_target_is_workday
    ),
    'request_status',v_request_status
  );

  v_snapshot:=jsonb_build_object(
    'version','V6.15.18',
    'approved_at',now(),
    'approved_by_email',v_actor_email,
    'request_subtype',v_subtype,
    'proposed_rows',v_rows,
    'guard_rows',v_guard_rows,
    'quota_guard',coalesce(v_quota_guard,'{}'::jsonb),
    'night_sequence_guard',coalesce(v_sequence_guard,'{}'::jsonb),
    'acknowledged_48h',coalesce(p_acknowledge_48h,false),
    'final_state',v_final_state
  );

  insert into public.ta_employee_portal_audit_v61482(
    emp_code,
    action_type,
    actor_user_id,
    actor_email,
    detail
  )
  values(
    public.normalize_emp_code(v_req.emp_code),
    'MANAGER_DAYOFF_APPLIED_V61518',
    auth.uid(),
    v_actor_email,
    jsonb_build_object(
      'request_id',v_req.request_id,
      'request_no',v_req.request_no,
      'decision_note',v_decision_note,
      'apply_snapshot',v_snapshot,
      'atomic_result',coalesce(v_apply_result,'{}'::jsonb)
    )
  )
  returning audit_id
  into v_audit_id;

  return coalesce(v_apply_result,'{}'::jsonb)
    || jsonb_build_object(
      'apply_version','V6.15.18',
      'audit_id',v_audit_id,
      'proposed_rows',v_rows,
      'guard_rows',v_guard_rows,
      'quota_guard',v_quota_guard,
      'night_sequence_guard',v_sequence_guard,
      'acknowledged_48h',coalesce(p_acknowledge_48h,false),
      'final_state',v_final_state,
      'decision_note',v_decision_note
    );
end;
$$;

revoke all on function
  public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)
from public,anon,authenticated;

grant execute on function
  public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)
to authenticated;

comment on function public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)
is 'V6.15.18 4B.2C: Manager day-off approval with fresh review, 5D/6D, System Period, quota, minimum-rest, Night Sequence, optional 48h acknowledgement, V6.15.10 atomic write, final-state verification and rollback safety.';

notify pgrst,'reload schema';
commit;
