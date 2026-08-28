-- ============================================================================
-- SQL ที่ต้องรัน
-- TimeClock Enterprise V6.15.17
-- 4B.2A + 4B.2B — Day-off Request Submit Guard + Manager Review Preflight
-- ============================================================================

begin;
set local statement_timeout='0';
select pg_advisory_xact_lock(
  hashtext('timeclock-v6.15.17-dayoff-request-manager-review')
);

-- ---------------------------------------------------------------------------
-- 0) Preflight dependencies
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ta_employee_requests_v61481') is null then
    raise exception 'MISSING_TABLE: ta_employee_requests_v61481';
  end if;
  if to_regclass('public.employees') is null then
    raise exception 'MISSING_TABLE: employees';
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
  if to_regprocedure('public._ta_request_effective_shift_v61510(text,date)') is null then
    raise exception 'MISSING_V6.15.10: _ta_request_effective_shift_v61510';
  end if;
  if to_regprocedure('public._ta_request_paired_off_code_v61510(text)') is null then
    raise exception 'MISSING_V6.15.10: _ta_request_paired_off_code_v61510';
  end if;
  if to_regprocedure('public._ta_portal_assert_request_no_conflict_v61494(text,date,text,text,jsonb,uuid)') is null then
    raise exception 'MISSING_V6.15.05: _ta_portal_assert_request_no_conflict_v61494';
  end if;
  if to_regprocedure('public._ta_portal_dayoff_balance_for_emp_v61505(text,date)') is null then
    raise exception 'MISSING_V6.15.05: _ta_portal_dayoff_balance_for_emp_v61505';
  end if;
  if to_regprocedure('public.ta_get_off_shift_basis_v6135(text,date)') is null then
    raise exception 'MISSING_FUNCTION: ta_get_off_shift_basis_v6135';
  end if;
  if to_regprocedure('public._ta_system_period_state_v6110(date)') is null then
    raise exception 'MISSING_V6.11.0: _ta_system_period_state_v6110';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Employee Portal authoritative submit/edit guard.
--
-- This trigger is deliberately attached to the request table rather than only
-- the Portal RPC. It protects both Portal create and Portal edit paths and
-- prevents a future client from bypassing validation by calling another write
-- wrapper.
-- ---------------------------------------------------------------------------
create or replace function public._ta_guard_portal_dayoff_request_v61517()
returns trigger
language plpgsql
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_emp text:=public.normalize_emp_code(new.emp_code);
  v_type text:=upper(trim(coalesce(new.request_type,'')));
  v_subtype text:=upper(trim(coalesce(new.request_subtype,'')));
  v_detail jsonb:=coalesce(new.detail,'{}'::jsonb);
  v_target date;

  v_source record;
  v_target_row record;
  v_source_work_code text;
  v_target_off_code text;
  v_basis jsonb;
  v_balance jsonb;

  v_source_period jsonb;
  v_target_period jsonb;
  v_source_closed boolean:=false;
  v_target_closed boolean:=false;
begin
  -- Only Employee Portal day-off requests belong to this guard.
  if v_type<>'DAYOFF_SWAP'
     or upper(trim(coalesce(new.request_source,'')))<>'EMPLOYEE_PORTAL' then
    return new;
  end if;

  if v_subtype not in ('SWAP_DAYOFF','ADD_DAYOFF') then
    raise exception 'INVALID_REQUEST_SUBTYPE';
  end if;

  if nullif(v_emp,'') is null or new.work_date is null then
    raise exception 'REQUEST_REQUIRED_FIELDS_MISSING';
  end if;

  -- Employee Portal may only create/edit future day-off requests.
  if new.work_date<=current_date then
    raise exception 'DAYOFF_EMPLOYEE_PORTAL_FUTURE_ONLY';
  end if;

  if v_subtype='ADD_DAYOFF' then
    v_target:=new.work_date;

    -- Serialize same employee/month to prevent two simultaneous requests from
    -- reserving the last day of available quota.
    perform pg_advisory_xact_lock(
      hashtext(
        'portal-add-dayoff:'||v_emp||':'||to_char(new.work_date,'YYYY-MM')
      )
    );
  else
    begin
      v_target:=nullif(v_detail->>'target_date','')::date;
    exception when others then
      raise exception 'DAYOFF_SWAP_TARGET_DATE_INVALID';
    end;

    if v_target is null then
      raise exception 'DAYOFF_SWAP_TARGET_DATE_REQUIRED';
    end if;
    if v_target<=current_date then
      raise exception 'DAYOFF_EMPLOYEE_PORTAL_FUTURE_ONLY';
    end if;
    if date_trunc('month',v_target)<>date_trunc('month',new.work_date) then
      raise exception 'DAYOFF_SWAP_SAME_MONTH_REQUIRED';
    end if;
    if v_target=new.work_date then
      raise exception 'DAYOFF_SWAP_DATE_MUST_DIFFER';
    end if;
  end if;

  -- Closed/deadline-passed schedule rounds must be rejected at Portal submit
  -- time. We inspect period state directly because Portal is an anon/PIN
  -- session and therefore cannot call the authenticated action assertion.
  v_source_period:=public._ta_system_period_state_v6110(new.work_date);
  v_target_period:=public._ta_system_period_state_v6110(v_target);

  v_source_closed:=
    coalesce((v_source_period->>'configured')::boolean,false)
    and (
      not coalesce((v_source_period->>'schedule_open')::boolean,false)
      or coalesce((v_source_period->>'schedule_deadline_passed')::boolean,false)
    );

  v_target_closed:=
    coalesce((v_target_period->>'configured')::boolean,false)
    and (
      not coalesce((v_target_period->>'schedule_open')::boolean,false)
      or coalesce((v_target_period->>'schedule_deadline_passed')::boolean,false)
    );

  if v_source_closed or v_target_closed then
    raise exception 'DAYOFF_REQUEST_PERIOD_CLOSED';
  end if;

  -- Canonical duplicate/conflict/quota/workday/holiday validation.
  perform public._ta_portal_assert_request_no_conflict_v61494(
    v_emp,
    new.work_date,
    v_type,
    v_subtype,
    v_detail,
    new.request_id
  );

  select * into v_source
  from public._ta_request_effective_shift_v61510(v_emp,new.work_date)
  limit 1;

  select * into v_target_row
  from public._ta_request_effective_shift_v61510(v_emp,v_target)
  limit 1;

  if v_subtype='SWAP_DAYOFF' then
    select upper(trim(r.shift_code))
    into v_source_work_code
    from public.ta_shift_schedule_rules_v6123 r
    where upper(trim(coalesce(r.paired_off_shift_code,'')))=
          upper(trim(coalesce(v_source.shift_code,'')))
      and coalesce(r.is_enabled,true)
    order by r.shift_code
    limit 1;

    if nullif(v_source_work_code,'') is null then
      v_basis:=public.ta_get_off_shift_basis_v6135(v_emp,new.work_date);
      v_source_work_code:=nullif(
        upper(trim(coalesce(v_basis->>'basis_shift_code',''))),
        ''
      );
    end if;
  end if;

  if v_subtype='SWAP_DAYOFF' and nullif(v_source_work_code,'') is null then
    raise exception 'DAYOFF_SWAP_SOURCE_WORK_SHIFT_NOT_FOUND';
  end if;

  v_target_off_code:=public._ta_request_paired_off_code_v61510(
    v_target_row.shift_code
  );

  if nullif(v_target_off_code,'') is null then
    raise exception 'DAYOFF_PAIRED_SHIFT_NOT_FOUND';
  end if;

  v_balance:=public._ta_portal_dayoff_balance_for_emp_v61505(
    v_emp,
    new.work_date
  );

  -- Server-owned snapshot. Client snapshot is retained elsewhere in detail,
  -- but Manager review must use fresh authoritative data from V6.15.17 RPC.
  new.detail:=v_detail || jsonb_build_object(
    'server_submit_validation_v61517',
    jsonb_build_object(
      'validated',true,
      'validated_at',now(),
      'version','V6.15.17',
      'source_date',new.work_date,
      'source_shift_code',v_source.shift_code,
      'source_day_type',v_source.day_type,
      'source_is_workday',v_source.is_workday,
      'source_replacement_shift_code',v_source_work_code,
      'target_date',v_target,
      'target_shift_code',v_target_row.shift_code,
      'target_day_type',v_target_row.day_type,
      'target_is_workday',v_target_row.is_workday,
      'target_off_shift_code',v_target_off_code,
      'dayoff_balance',v_balance,
      'source_period',v_source_period,
      'target_period',v_target_period
    )
  );

  return new;
end;
$$;

revoke all on function public._ta_guard_portal_dayoff_request_v61517()
from public,anon,authenticated;

drop trigger if exists trg_ta_guard_portal_dayoff_request_v61517
on public.ta_employee_requests_v61481;

create trigger trg_ta_guard_portal_dayoff_request_v61517
before insert or update of
  work_date,
  request_type,
  request_subtype,
  detail
on public.ta_employee_requests_v61481
for each row
execute function public._ta_guard_portal_dayoff_request_v61517();

-- ---------------------------------------------------------------------------
-- 2) Manager review / preflight RPC.
--
-- No schedule write occurs here. It returns a current authoritative preview of
-- source/target shifts, paired shifts, quota, system period, duplicate/conflict,
-- and (when installed) schedule/night sequence validators.
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_employee_request_dayoff_review_v61517(
  p_request_id uuid
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
  v_target_date date;
  v_role text;
  v_full_name text;

  v_source record;
  v_target record;
  v_source_work_code text;
  v_target_off_code text;
  v_basis jsonb;

  v_balance jsonb;
  v_balance_days numeric:=0;
  v_pending_other integer:=0;
  v_pending_all integer:=0;
  v_requestable numeric:=0;

  v_source_period jsonb;
  v_target_period jsonb;
  v_source_period_block boolean:=false;
  v_target_period_block boolean:=false;

  v_source_sm jsonb:='{}'::jsonb;
  v_target_sm jsonb:='{}'::jsonb;
  v_source_guard jsonb:='{}'::jsonb;
  v_target_guard jsonb:='{}'::jsonb;
  v_sequence_guard jsonb:='{}'::jsonb;
  v_quota_guard jsonb:='{}'::jsonb;
  v_rows jsonb:='[]'::jsonb;

  v_blockers jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
  v_conflict_ok boolean:=true;
  v_conflict_error text:=null;
  v_now timestamptz:=now();
begin
  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED';
  end if;

  select * into v_req
  from public.ta_employee_requests_v61481 r
  where r.request_id=p_request_id;

  if v_req.request_id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  if not public._ta_request_manager_authorized_v61481(p_request_id) then
    raise exception 'REQUEST_DECISION_PERMISSION_DENIED';
  end if;

  if upper(trim(coalesce(v_req.request_type,'')))<>'DAYOFF_SWAP' then
    raise exception 'REQUEST_TYPE_NOT_DAYOFF';
  end if;

  if upper(trim(coalesce(v_req.status,''))) not in ('PENDING','IN_REVIEW') then
    raise exception 'REQUEST_NOT_ACTIVE';
  end if;

  select upper(trim(coalesce(p.role,'VIEWER')))
  into v_role
  from public.ta_user_profiles p
  where p.user_id=auth.uid()
    and p.is_active=true
  limit 1;

  if nullif(v_role,'') is null then
    raise exception 'ACTIVE_USER_PROFILE_REQUIRED';
  end if;

  v_emp:=public.normalize_emp_code(v_req.emp_code);
  v_subtype:=upper(trim(coalesce(v_req.request_subtype,'')));

  if v_subtype='ADD_DAYOFF' then
    v_target_date:=v_req.work_date;
  elsif v_subtype='SWAP_DAYOFF' then
    begin
      v_target_date:=nullif(v_req.detail->>'target_date','')::date;
    exception when others then
      v_target_date:=null;
    end;
  else
    raise exception 'INVALID_REQUEST_SUBTYPE';
  end if;

  select coalesce(
    nullif(to_jsonb(e)->>'full_name',''),
    nullif(to_jsonb(e)->>'employee_name',''),
    nullif(to_jsonb(e)->>'name',''),
    v_emp
  )
  into v_full_name
  from public.employees e
  where public.normalize_emp_code(e."EmployeeId")=v_emp
  limit 1;

  v_full_name:=coalesce(v_full_name,v_emp);

  if v_target_date is null then
    v_blockers:=v_blockers || jsonb_build_array(
      jsonb_build_object(
        'code','DAYOFF_SWAP_TARGET_DATE_REQUIRED',
        'message','ไม่พบวันที่หยุดแทนในคำขอ'
      )
    );
  end if;

  if v_req.work_date<=current_date
     or (v_target_date is not null and v_target_date<=current_date) then
    v_blockers:=v_blockers || jsonb_build_array(
      jsonb_build_object(
        'code','DAYOFF_REQUEST_DATE_NO_LONGER_FUTURE',
        'message','วันที่ในคำขอไม่ใช่วันอนาคตแล้ว กรุณาให้ Manager ตรวจและจัดกะด้วยขั้นตอนย้อนหลัง'
      )
    );
  end if;

  -- Assign record structures even when a malformed historical request has no target.
  select * into v_source
  from public._ta_request_effective_shift_v61510(v_emp,v_req.work_date)
  limit 1;

  select
    null::text as shift_code,
    null::time as shift_start_time,
    null::time as shift_end_time,
    null::boolean as is_workday,
    null::text as day_type,
    null::text as work_mode_code
  into v_target;

  if v_target_date is not null then
    select * into v_target
    from public._ta_request_effective_shift_v61510(v_emp,v_target_date)
    limit 1;
  end if;

  if v_subtype='SWAP_DAYOFF' then
    if nullif(v_source.shift_code,'') is null then
      v_blockers:=v_blockers || jsonb_build_array(
        jsonb_build_object('code','DAYOFF_SWAP_SOURCE_SHIFT_NOT_FOUND','message','ไม่พบกะของวันหยุดเดิม')
      );
    elsif coalesce(v_source.is_workday,true) then
      v_blockers:=v_blockers || jsonb_build_array(
        jsonb_build_object('code','DAYOFF_SWAP_SOURCE_NOT_DAYOFF','message','วันหยุดเดิมไม่ใช่วันหยุดตามข้อมูลล่าสุด')
      );
    end if;

    if v_target_date is not null then
      if nullif(v_target.shift_code,'') is null
         or not coalesce(v_target.is_workday,false) then
        v_blockers:=v_blockers || jsonb_build_array(
          jsonb_build_object('code','DAYOFF_SWAP_TARGET_MUST_BE_WORKDAY','message','วันที่ต้องการหยุดแทนไม่ใช่วันทำงานตามข้อมูลล่าสุด')
        );
      end if;
    end if;

    select upper(trim(r.shift_code))
    into v_source_work_code
    from public.ta_shift_schedule_rules_v6123 r
    where upper(trim(coalesce(r.paired_off_shift_code,'')))=
          upper(trim(coalesce(v_source.shift_code,'')))
      and coalesce(r.is_enabled,true)
    order by r.shift_code
    limit 1;

    if nullif(v_source_work_code,'') is null then
      v_basis:=public.ta_get_off_shift_basis_v6135(v_emp,v_req.work_date);
      v_source_work_code:=nullif(
        upper(trim(coalesce(v_basis->>'basis_shift_code',''))),
        ''
      );
    end if;

    if nullif(v_source_work_code,'') is null then
      v_blockers:=v_blockers || jsonb_build_array(
        jsonb_build_object('code','DAYOFF_SWAP_SOURCE_WORK_SHIFT_NOT_FOUND','message','ไม่พบกะทำงานที่จะใช้คืนให้วันหยุดเดิม')
      );
    end if;
  else
    if nullif(v_target.shift_code,'') is null
       or not coalesce(v_target.is_workday,false) then
      v_blockers:=v_blockers || jsonb_build_array(
        jsonb_build_object('code','DAYOFF_ADD_TARGET_MUST_BE_WORKDAY','message','วันที่ขอหยุดเพิ่มไม่ใช่วันทำงานตามข้อมูลล่าสุด')
      );
    end if;
  end if;

  if v_target_date is not null and nullif(v_target.shift_code,'') is not null then
    v_target_off_code:=public._ta_request_paired_off_code_v61510(v_target.shift_code);
    if nullif(v_target_off_code,'') is null then
      v_blockers:=v_blockers || jsonb_build_array(
        jsonb_build_object(
          'code','DAYOFF_PAIRED_SHIFT_NOT_FOUND',
          'message','กะทำงานของวันที่หยุดแทนยังไม่ได้จับคู่กับกะวันหยุด'
        )
      );
    end if;
  end if;

  -- System Period: HR Admin is explicit override; Manager is blocked.
  v_source_period:=public._ta_system_period_state_v6110(v_req.work_date);
  if v_target_date is not null then
    v_target_period:=public._ta_system_period_state_v6110(v_target_date);
  else
    v_target_period:='{}'::jsonb;
  end if;

  v_source_period_block:=
    v_role<>'HR_ADMIN'
    and coalesce((v_source_period->>'configured')::boolean,false)
    and (
      not coalesce((v_source_period->>'schedule_open')::boolean,false)
      or coalesce((v_source_period->>'schedule_deadline_passed')::boolean,false)
    );

  v_target_period_block:=
    v_role<>'HR_ADMIN'
    and coalesce((v_target_period->>'configured')::boolean,false)
    and (
      not coalesce((v_target_period->>'schedule_open')::boolean,false)
      or coalesce((v_target_period->>'schedule_deadline_passed')::boolean,false)
    );

  if v_source_period_block or v_target_period_block then
    v_blockers:=v_blockers || jsonb_build_array(
      jsonb_build_object(
        'code','SYSTEM_PERIOD_SCHEDULE_CLOSED',
        'message','รอบระบบปิดการแก้ไขตารางกะสำหรับ Manager'
      )
    );
  end if;

  -- Current quota. For ADD, exclude the request being reviewed from pending
  -- reservations so it can consume one available day if no other request has
  -- already reserved it.
  v_balance:=public._ta_portal_dayoff_balance_for_emp_v61505(
    v_emp,
    v_req.work_date
  );
  v_balance_days:=coalesce(nullif(v_balance->>'balance_days','')::numeric,0);

  select
    count(*) filter (where r.request_id<>v_req.request_id)::integer,
    count(*)::integer
  into v_pending_other,v_pending_all
  from public.ta_employee_requests_v61481 r
  where public.normalize_emp_code(r.emp_code)=v_emp
    and r.request_type='DAYOFF_SWAP'
    and upper(trim(coalesce(r.request_subtype,'')))='ADD_DAYOFF'
    and r.status in ('PENDING','IN_REVIEW')
    and date_trunc('month',r.work_date)=date_trunc('month',v_req.work_date);

  v_requestable:=greatest(0,v_balance_days-coalesce(v_pending_other,0));

  if v_subtype='ADD_DAYOFF' and v_requestable<=0 then
    v_blockers:=v_blockers || jsonb_build_array(
      jsonb_build_object(
        'code','DAYOFF_ADD_NO_REQUESTABLE_BALANCE',
        'message','โควต้าวันหยุดปัจจุบันถูกใช้หรือถูกคำขออื่นจองครบแล้ว'
      )
    );
  end if;

  -- Re-run canonical conflict guard while excluding the request itself.
  begin
    perform public._ta_portal_assert_request_no_conflict_v61494(
      v_emp,
      v_req.work_date,
      'DAYOFF_SWAP',
      v_subtype,
      v_req.detail,
      v_req.request_id
    );
    v_conflict_ok:=true;
  exception when others then
    v_conflict_ok:=false;
    v_conflict_error:=sqlerrm;
    v_blockers:=v_blockers || jsonb_build_array(
      jsonb_build_object(
        'code','REQUEST_CURRENT_STATE_CONFLICT',
        'message',sqlerrm
      )
    );
  end;

  -- Prepare proposed atomic rows for preview validators.
  if v_subtype='ADD_DAYOFF' then
    if v_target_date is not null and nullif(v_target_off_code,'') is not null then
      v_rows:=jsonb_build_array(
        jsonb_build_object(
          'emp_code',v_emp,
          'work_date',v_target_date,
          'shift_code',v_target_off_code,
          'note','DAYOFF_REQUEST_REVIEW_V61517'
        )
      );
    end if;
  else
    if nullif(v_source_work_code,'') is not null
       and v_target_date is not null
       and nullif(v_target_off_code,'') is not null then
      v_rows:=jsonb_build_array(
        jsonb_build_object(
          'emp_code',v_emp,
          'work_date',v_req.work_date,
          'shift_code',v_source_work_code,
          'note','DAYOFF_REQUEST_REVIEW_SOURCE_V61517'
        ),
        jsonb_build_object(
          'emp_code',v_emp,
          'work_date',v_target_date,
          'shift_code',v_target_off_code,
          'note','DAYOFF_REQUEST_REVIEW_TARGET_V61517'
        )
      );
    end if;
  end if;

  -- Canonical day-off quota bulk preview (optional only for compatibility).
  if jsonb_array_length(v_rows)>0
     and to_regprocedure('public.ta_validate_dayoff_quota_bulk_v6143(jsonb)') is not null then
    begin
      execute 'select public.ta_validate_dayoff_quota_bulk_v6143($1)'
      into v_quota_guard
      using v_rows;
      if coalesce((v_quota_guard->>'allowed')::boolean,true)=false then
        v_blockers:=v_blockers || jsonb_build_array(
          jsonb_build_object('code','DAYOFF_QUOTA_EXHAUSTED','message','ไม่ผ่านการตรวจโควต้าวันหยุดแบบ Bulk')
        );
      end if;
    exception when others then
      v_warnings:=v_warnings || jsonb_build_array(
        jsonb_build_object('code','DAYOFF_QUOTA_PREVIEW_UNAVAILABLE','message',sqlerrm)
      );
    end;
  end if;

  -- Shift-level guard for the source day that becomes workday.
  if v_subtype='SWAP_DAYOFF' and nullif(v_source_work_code,'') is not null then
    select to_jsonb(sm) into v_source_sm
    from public.shift_master sm
    where upper(trim(sm.shift_code))=v_source_work_code
    limit 1;

    if to_regprocedure('public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean)') is not null then
      begin
        v_source_guard:=public.ta_validate_schedule_guard_v6141(
          v_emp,
          v_req.work_date,
          v_source_work_code,
          nullif(v_source_sm->>'start_time','')::time,
          nullif(v_source_sm->>'end_time','')::time,
          greatest(coalesce(nullif(v_source_sm->>'scheduled_minutes_including_break','')::integer,0),0),
          false
        );
        if coalesce((v_source_guard->>'hard_block')::boolean,false) then
          v_blockers:=v_blockers || jsonb_build_array(
            jsonb_build_object(
              'code','SOURCE_SCHEDULE_GUARD_BLOCKED',
              'message',coalesce(v_source_guard->>'message','วันหยุดเดิมไม่ผ่านเงื่อนไขการเปลี่ยนกลับเป็นวันทำงาน')
            )
          );
        end if;
      exception when others then
        v_warnings:=v_warnings || jsonb_build_array(
          jsonb_build_object('code','SOURCE_SCHEDULE_GUARD_PREVIEW_UNAVAILABLE','message',sqlerrm)
        );
      end;
    end if;
  end if;

  -- Shift-level guard for target day that becomes OFF.
  if v_target_date is not null and nullif(v_target_off_code,'') is not null then
    select to_jsonb(sm) into v_target_sm
    from public.shift_master sm
    where upper(trim(sm.shift_code))=v_target_off_code
    limit 1;

    if to_regprocedure('public.ta_validate_schedule_guard_v6141(text,date,text,time,time,integer,boolean)') is not null then
      begin
        v_target_guard:=public.ta_validate_schedule_guard_v6141(
          v_emp,
          v_target_date,
          v_target_off_code,
          nullif(v_target_sm->>'start_time','')::time,
          nullif(v_target_sm->>'end_time','')::time,
          0,
          true
        );
        if coalesce((v_target_guard->>'hard_block')::boolean,false) then
          v_blockers:=v_blockers || jsonb_build_array(
            jsonb_build_object(
              'code','TARGET_SCHEDULE_GUARD_BLOCKED',
              'message',coalesce(v_target_guard->>'message','วันที่หยุดแทนไม่ผ่านเงื่อนไขการจัดกะ')
            )
          );
        end if;
      exception when others then
        v_warnings:=v_warnings || jsonb_build_array(
          jsonb_build_object('code','TARGET_SCHEDULE_GUARD_PREVIEW_UNAVAILABLE','message',sqlerrm)
        );
      end;
    end if;
  end if;

  -- Night-sequence validator using the complete proposed payload.
  if jsonb_array_length(v_rows)>0
     and to_regprocedure('public.ta_validate_night_sequence_bulk_v61437(jsonb)') is not null then
    begin
      execute 'select public.ta_validate_night_sequence_bulk_v61437($1)'
      into v_sequence_guard
      using v_rows;
      if coalesce((v_sequence_guard->>'allowed')::boolean,true)=false then
        v_blockers:=v_blockers || jsonb_build_array(
          jsonb_build_object(
            'code','NIGHT_SEQUENCE_BLOCKED',
            'message',coalesce(
              v_sequence_guard->'violations'->0->>'reason',
              'ไม่ผ่านเงื่อนไขกะดึก / เวลาพักระหว่างกะ'
            )
          )
        );
      end if;
    exception when others then
      v_warnings:=v_warnings || jsonb_build_array(
        jsonb_build_object('code','NIGHT_SEQUENCE_PREVIEW_UNAVAILABLE','message',sqlerrm)
      );
    end;
  end if;

  return jsonb_build_object(
    'allowed',jsonb_array_length(v_blockers)=0,
    'request_id',v_req.request_id,
    'request_no',v_req.request_no,
    'request_status',v_req.status,
    'request_subtype',v_subtype,
    'employee',jsonb_build_object(
      'emp_code',v_emp,
      'full_name',v_full_name
    ),
    'reason',v_req.reason,
    'requested_at',v_req.requested_at,
    'manager_role',v_role,
    'source',jsonb_build_object(
      'work_date',v_req.work_date,
      'current_shift_code',v_source.shift_code,
      'current_start_time',v_source.shift_start_time,
      'current_end_time',v_source.shift_end_time,
      'current_is_workday',v_source.is_workday,
      'current_day_type',v_source.day_type,
      'proposed_shift_code',case when v_subtype='SWAP_DAYOFF' then v_source_work_code else v_source.shift_code end
    ),
    'target',jsonb_build_object(
      'work_date',v_target_date,
      'current_shift_code',v_target.shift_code,
      'current_start_time',v_target.shift_start_time,
      'current_end_time',v_target.shift_end_time,
      'current_is_workday',v_target.is_workday,
      'current_day_type',v_target.day_type,
      'proposed_shift_code',v_target_off_code
    ),
    'quota',coalesce(v_balance,'{}'::jsonb) || jsonb_build_object(
      'pending_add_requests_other',coalesce(v_pending_other,0),
      'pending_add_requests_all',coalesce(v_pending_all,0),
      'requestable_for_this_request',v_requestable
    ),
    'period',jsonb_build_object(
      'source',coalesce(v_source_period,'{}'::jsonb),
      'target',coalesce(v_target_period,'{}'::jsonb),
      'hr_admin_override',v_role='HR_ADMIN'
    ),
    'canonical_conflict_ok',v_conflict_ok,
    'canonical_conflict_error',v_conflict_error,
    'proposed_rows',v_rows,
    'quota_guard',coalesce(v_quota_guard,'{}'::jsonb),
    'source_schedule_guard',coalesce(v_source_guard,'{}'::jsonb),
    'target_schedule_guard',coalesce(v_target_guard,'{}'::jsonb),
    'night_sequence_guard',coalesce(v_sequence_guard,'{}'::jsonb),
    'blockers',v_blockers,
    'warnings',v_warnings,
    'checked_at',v_now,
    'version','V6.15.17'
  );
end;
$$;

revoke all on function public.ta_get_employee_request_dayoff_review_v61517(uuid)
from public,anon,authenticated;

grant execute on function public.ta_get_employee_request_dayoff_review_v61517(uuid)
to authenticated;

comment on function public.ta_get_employee_request_dayoff_review_v61517(uuid)
is 'V6.15.17 Manager preflight for Employee Portal day-off requests. Read-only authoritative preview before existing V6.15.10/V6.15.11 atomic apply.';

notify pgrst,'reload schema';
commit;
