-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.15.19
-- 4B.2D — Employee Portal Result Sync + Notification + Returned Flow
-- ============================================================================

begin;
set local statement_timeout='0';
select pg_advisory_xact_lock(hashtext('timeclock-v6.15.19-4b2d'));

-- ---------------------------------------------------------------------------
-- 0) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ta_employee_requests_v61481') is null then
    raise exception 'MISSING_TABLE: ta_employee_requests_v61481';
  end if;
  if to_regclass('public.ta_employee_portal_notifications_v61482') is null then
    raise exception 'MISSING_TABLE: ta_employee_portal_notifications_v61482';
  end if;
  if to_regclass('public.ta_employee_portal_audit_v61482') is null then
    raise exception 'MISSING_TABLE: ta_employee_portal_audit_v61482';
  end if;
  if to_regprocedure('public.ta_apply_employee_request_dayoff_v61518(uuid,boolean,text)') is null then
    raise exception 'MISSING_V6.15.18: ta_apply_employee_request_dayoff_v61518';
  end if;
  if to_regprocedure('public._ta_request_manager_authorized_v61481(uuid)') is null then
    raise exception 'MISSING_FUNCTION: _ta_request_manager_authorized_v61481';
  end if;
  if to_regprocedure('public._ta_portal_session_emp_v61482(text)') is null then
    raise exception 'MISSING_FUNCTION: _ta_portal_session_emp_v61482';
  end if;
  if to_regprocedure('public._ta_portal_assert_request_no_conflict_v61494(text,date,text,text,jsonb,uuid)') is null then
    raise exception 'MISSING_FUNCTION: _ta_portal_assert_request_no_conflict_v61494';
  end if;
  if to_regprocedure('public._ta_request_notify_v61481(uuid,uuid,text,text,text)') is null then
    raise exception 'MISSING_FUNCTION: _ta_request_notify_v61481';
  end if;
  if to_regprocedure('public._ta_system_period_state_v6110(date)') is null then
    raise exception 'MISSING_FUNCTION: _ta_system_period_state_v6110';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Request status: add RETURNED for Manager -> Employee correction flow.
-- ---------------------------------------------------------------------------
alter table public.ta_employee_requests_v61481
  drop constraint if exists ta_employee_requests_v61481_status_ck;

alter table public.ta_employee_requests_v61481
  add constraint ta_employee_requests_v61481_status_ck
  check (status in (
    'PENDING','IN_REVIEW','APPROVED','REJECTED','RESOLVED','CANCELLED','RETURNED'
  ));

-- Employee-facing label keeps Thai terminology while the exact Shift Code is
-- still stored separately in manager_apply_result_v61519.schedule_changes.
create or replace function public._ta_portal_shift_result_label_v61519(
  p_shift_code text
)
returns text
language sql
immutable
security definer
set search_path=public,pg_catalog
as $$
  select case upper(trim(coalesce(p_shift_code,'')))
    when 'STD' then 'กะเช้า'
    when 'S043' then 'กะเช้า'
    when 'S134' then 'กะดึก'
    when 'S135' then 'กะดึก'
    when 'OSTD' then 'หยุด'
    when 'OS043' then 'หยุด'
    when 'OS134' then 'หยุด'
    when 'OS135' then 'หยุด'
    when 'OFF' then 'หยุด'
    when 'HOL' then 'นักขัตฤกษ์'
    when 'LV' then 'ลา'
    when 'LEAVE' then 'ลา'
    else coalesce(nullif(upper(trim(p_shift_code)),''),'-')
  end;
$$;

revoke all on function public._ta_portal_shift_result_label_v61519(text)
from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 2) V6.15.17 Portal day-off guard lifecycle fix.
--    Validate INSERT / Employee PENDING edit only. Do not revalidate Manager
--    RETURNED metadata or post-RESOLVED outcome publication.
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
  -- V6.15.19: semantic validation is only needed while the Employee owns an
  -- editable PENDING request. Manager RETURNED metadata and post-RESOLVED
  -- outcome publication must not be revalidated against the already-mutated
  -- schedule. A RETURNED request is validated again when Employee resubmits it
  -- and status becomes PENDING in ta_portal_update_request_v61494().
  if tg_op='UPDATE'
     and upper(trim(coalesce(new.status,'')))<>'PENDING' then
    return new;
  end if;

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

-- ---------------------------------------------------------------------------
-- 3) Manager returns an Employee Portal day-off request for correction.
-- ---------------------------------------------------------------------------
create or replace function public.ta_return_employee_request_v61519(
  p_request_id uuid,
  p_note text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_row public.ta_employee_requests_v61481%rowtype;
  v_actor_email text;
  v_note text:=nullif(trim(coalesce(p_note,'')),'');
  v_return_count integer:=0;
begin
  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED';
  end if;
  if v_note is null then
    raise exception 'REQUEST_RETURN_NOTE_REQUIRED';
  end if;
  if not public._ta_request_manager_authorized_v61481(p_request_id) then
    raise exception 'REQUEST_DECISION_PERMISSION_DENIED';
  end if;

  select lower(trim(coalesce(p.email,'')))
  into v_actor_email
  from public.ta_user_profiles p
  where p.user_id=auth.uid()
    and coalesce(p.is_active,false)
  limit 1;

  if v_actor_email is null then
    raise exception 'ACTIVE_USER_PROFILE_REQUIRED';
  end if;

  select *
  into v_row
  from public.ta_employee_requests_v61481 r
  where r.request_id=p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if upper(trim(coalesce(v_row.request_type,'')))<>'DAYOFF_SWAP' then
    raise exception 'REQUEST_RETURN_ONLY_DAYOFF_SUPPORTED';
  end if;
  if v_row.portal_account_id is null
     or upper(trim(coalesce(v_row.request_source,'')))<>'EMPLOYEE_PORTAL' then
    raise exception 'REQUEST_RETURN_REQUIRES_EMPLOYEE_PORTAL';
  end if;
  if upper(trim(coalesce(v_row.status,''))) not in ('PENDING','IN_REVIEW') then
    raise exception 'REQUEST_NOT_ACTIVE';
  end if;

  begin
    v_return_count:=coalesce(nullif(v_row.detail->>'return_count','')::integer,0)+1;
  exception when others then
    v_return_count:=1;
  end;

  update public.ta_employee_requests_v61481 r
  set
    status='RETURNED',
    decided_by=auth.uid(),
    decided_by_email=v_actor_email,
    decided_at=now(),
    decision_note=v_note,
    resolved_at=null,
    detail=coalesce(r.detail,'{}'::jsonb) || jsonb_build_object(
      'returned_to_employee',true,
      'return_note',v_note,
      'return_count',v_return_count,
      'returned_at',now(),
      'returned_by_email',v_actor_email,
      'return_version','V6.15.19'
    ),
    updated_at=now()
  where r.request_id=p_request_id
  returning * into v_row;

  insert into public.ta_employee_portal_audit_v61482(
    emp_code,action_type,actor_user_id,actor_email,detail
  ) values (
    public.normalize_emp_code(v_row.emp_code),
    'MANAGER_REQUEST_RETURNED_V61519',
    auth.uid(),
    v_actor_email,
    jsonb_build_object(
      'request_id',v_row.request_id,
      'request_no',v_row.request_no,
      'request_type',v_row.request_type,
      'request_subtype',v_row.request_subtype,
      'note',v_note,
      'return_count',v_return_count,
      'version','V6.15.19'
    )
  );

  return to_jsonb(v_row) || jsonb_build_object(
    'returned',true,
    'version','V6.15.19'
  );
end;
$$;

revoke all on function public.ta_return_employee_request_v61519(uuid,text)
from public,anon,authenticated;
grant execute on function public.ta_return_employee_request_v61519(uuid,text)
to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Employee Portal Edit: RETURNED can be corrected and resubmitted.
--    Existing PENDING edit behavior is retained.
-- ---------------------------------------------------------------------------
create or replace function public.ta_portal_update_request_v61494(
  p_session_token text,
  p_request_id uuid,
  p_work_date date,
  p_request_type text,
  p_request_subtype text,
  p_reason text,
  p_detail jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_emp text:=public._ta_portal_session_emp_v61482(p_session_token);
  v_type text:=upper(trim(coalesce(p_request_type,'')));
  v_subtype text:=upper(trim(coalesce(p_request_subtype,'')));
  v_manager_email text;
  v_manager_user uuid;
  v_row public.ta_employee_requests_v61481%rowtype;
  v_detail jsonb:=coalesce(p_detail,'{}'::jsonb);
  v_balance jsonb;
  v_was_returned boolean:=false;
begin
  select *
  into v_row
  from public.ta_employee_requests_v61481
  where request_id=p_request_id
    and public.normalize_emp_code(emp_code)=v_emp
    and request_source='EMPLOYEE_PORTAL'
    and status in ('PENDING','RETURNED')
  for update;

  if v_row.request_id is null then
    raise exception 'REQUEST_EDIT_NOT_ALLOWED';
  end if;

  v_was_returned:=upper(trim(coalesce(v_row.status,'')))='RETURNED';

  if p_work_date is null
     or nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'REQUEST_REQUIRED_FIELDS_MISSING';
  end if;

  if (
       v_type='TIME_ISSUE'
       and v_subtype not in ('MISSING_IN','MISSING_OUT','WRONG_TIME')
     )
     or (
       v_type='SPECIAL_WORK'
       and v_subtype not in ('NORMAL_LATE_CUSTOMER','SPLIT_WAIT_NIGHT','HOUR_BASED')
     )
     or (
       v_type='DAYOFF_SWAP'
       and v_subtype not in ('SWAP_DAYOFF','ADD_DAYOFF')
     )
     or (
       v_type='LEAVE_REQUEST'
       and v_subtype not in ('FULL_DAY','PARTIAL_DAY')
     ) then
    raise exception 'INVALID_REQUEST_SUBTYPE';
  end if;

  if v_type='TIME_ISSUE' then
    perform public._ta_portal_assert_time_certification_day_v61500(
      p_session_token,p_work_date
    );
  end if;

  if v_type='DAYOFF_SWAP' and v_subtype='ADD_DAYOFF' then
    perform pg_advisory_xact_lock(
      hashtext('portal-add-dayoff:'||v_emp||':'||to_char(p_work_date,'YYYY-MM'))
    );

    v_balance:=public._ta_portal_dayoff_balance_for_emp_v61505(v_emp,p_work_date);
    v_detail:=v_detail || jsonb_build_object(
      'dayoff_request_mode','ADD',
      'target_date',p_work_date,
      'quota_snapshot',v_balance
    );
  end if;

  perform public._ta_portal_assert_request_no_conflict_v61494(
    v_emp,p_work_date,v_type,v_subtype,v_detail,p_request_id
  );

  if v_type='DAYOFF_SWAP' and v_subtype='SWAP_DAYOFF' then
    v_balance:=public._ta_portal_dayoff_balance_for_emp_v61505(v_emp,p_work_date);
    v_detail:=v_detail || jsonb_build_object(
      'dayoff_request_mode','SWAP',
      'quota_snapshot',v_balance
    );
  end if;

  if v_was_returned then
    v_detail:=v_detail || jsonb_build_object(
      'resubmitted_after_return',true,
      'resubmitted_at',now(),
      'previous_return_note',v_row.decision_note,
      'resubmit_version','V6.15.19'
    );
  end if;

  v_manager_email:=public._ta_request_manager_email_v61481(v_emp,p_work_date);
  if v_manager_email is null then
    raise exception 'ACTIVE_MANAGER_NOT_FOUND_FOR_EMPLOYEE';
  end if;

  if v_was_returned then
    select p.user_id
    into v_manager_user
    from public.ta_user_profiles p
    where lower(trim(coalesce(p.email,'')))=lower(trim(v_manager_email))
      and coalesce(p.is_active,false)
    order by p.updated_at desc nulls last
    limit 1;
  end if;

  update public.ta_employee_requests_v61481
  set
    work_date=p_work_date,
    request_type=v_type,
    request_subtype=v_subtype,
    reason=trim(p_reason),
    detail=v_detail,
    manager_email=v_manager_email,
    status=case when v_was_returned then 'PENDING' else status end,
    decided_by=case when v_was_returned then null else decided_by end,
    decided_by_email=case when v_was_returned then null else decided_by_email end,
    decided_at=case when v_was_returned then null else decided_at end,
    decision_note=case when v_was_returned then null else decision_note end,
    resolved_at=case when v_was_returned then null else resolved_at end,
    updated_at=now()
  where request_id=p_request_id
  returning * into v_row;

  if v_was_returned and v_manager_user is not null then
    perform public._ta_request_notify_v61481(
      v_row.request_id,
      v_manager_user,
      'พนักงานแก้ไขคำขอและส่งกลับแล้ว',
      v_emp||' • '||coalesce(v_row.request_no,'คำขอ')||' • '||to_char(v_row.work_date,'DD/MM/YYYY'),
      'warning'
    );
  end if;

  insert into public.ta_employee_portal_audit_v61482(emp_code,action_type,detail)
  values(
    v_emp,
    case when v_was_returned
      then 'PORTAL_REQUEST_RESUBMITTED_V61519'
      else 'PORTAL_REQUEST_UPDATED'
    end,
    jsonb_build_object(
      'request_id',p_request_id,
      'was_returned',v_was_returned,
      'version','V6.15.19'
    )
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.ta_portal_update_request_v61494(
  text,uuid,date,text,text,text,jsonb
) from public;
grant execute on function public.ta_portal_update_request_v61494(
  text,uuid,date,text,text,text,jsonb
) to anon,authenticated;

-- RETURNED can also be cancelled by the employee.
create or replace function public.ta_portal_cancel_request_v61482(
  p_session_token text,
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_emp text;
  v_row public.ta_employee_requests_v61481%rowtype;
begin
  v_emp:=public._ta_portal_session_emp_v61482(p_session_token);

  update public.ta_employee_requests_v61481
  set status='CANCELLED',updated_at=now()
  where request_id=p_request_id
    and public.normalize_emp_code(emp_code)=v_emp
    and request_source='EMPLOYEE_PORTAL'
    and status in ('PENDING','RETURNED')
  returning * into v_row;

  if v_row.request_id is null then
    raise exception 'REQUEST_CANCEL_NOT_ALLOWED';
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.ta_portal_cancel_request_v61482(text,uuid)
from public;
grant execute on function public.ta_portal_cancel_request_v61482(text,uuid)
to anon,authenticated;

-- ---------------------------------------------------------------------------
-- 5) Portal status notification: consistent wording for all terminal / return
--    states. Day-off RESOLVED will be enriched again by V6.15.19 apply wrapper.
-- ---------------------------------------------------------------------------
create or replace function public._ta_portal_request_status_notify_v61482()
returns trigger
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_title text;
  v_message text;
  v_severity text;
  v_type text:=upper(trim(coalesce(new.request_type,'')));
  v_subtype text:=upper(trim(coalesce(new.request_subtype,'')));
begin
  if new.portal_account_id is null
     or new.status is not distinct from old.status then
    return new;
  end if;

  if new.status not in (
    'APPROVED','REJECTED','RESOLVED','CANCELLED','RETURNED'
  ) then
    return new;
  end if;

  if new.status='RETURNED' then
    v_title:='Manager ส่งคำขอกลับให้แก้ไข';
    v_severity:='warning';
  elsif new.status='REJECTED' then
    v_title:='คำขอไม่ได้รับอนุมัติ';
    v_severity:='danger';
  elsif new.status='CANCELLED' then
    v_title:='คำขอถูกยกเลิก';
    v_severity:='info';
  elsif new.status='RESOLVED' and v_type='DAYOFF_SWAP' then
    v_title:=case when v_subtype='ADD_DAYOFF'
      then 'คำขอหยุดเพิ่มดำเนินการแล้ว'
      else 'คำขอสลับวันหยุดดำเนินการแล้ว'
    end;
    v_severity:='success';
  else
    v_title:='คำขอของคุณดำเนินการแล้ว';
    v_severity:='success';
  end if;

  v_message:=coalesce(new.request_no,'คำขอ')
    ||' • '||to_char(new.work_date,'DD/MM/YYYY')
    ||case when nullif(trim(coalesce(new.decision_note,'')),'') is not null
      then ' • '||trim(new.decision_note)
      else ''
    end;

  insert into public.ta_employee_portal_notifications_v61482(
    portal_account_id,emp_code,request_id,title,message,severity
  ) values (
    new.portal_account_id,
    new.emp_code,
    new.request_id,
    v_title,
    v_message,
    v_severity
  );

  return new;
end;
$$;

revoke all on function public._ta_portal_request_status_notify_v61482()
from public,anon,authenticated;

-- Trigger already exists in V6.14.82; recreate to guarantee current function.
drop trigger if exists trg_ta_portal_request_status_notify_v61482
on public.ta_employee_requests_v61481;
create trigger trg_ta_portal_request_status_notify_v61482
after update of status on public.ta_employee_requests_v61481
for each row execute function public._ta_portal_request_status_notify_v61482();

-- ---------------------------------------------------------------------------
-- 6) Day-off apply wrapper publishes the exact applied result back to request
--    detail + notification inside the SAME transaction.
-- ---------------------------------------------------------------------------
create or replace function public.ta_apply_employee_request_dayoff_v61519(
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
  v_result jsonb;
  v_req public.ta_employee_requests_v61481%rowtype;
  v_action jsonb;
  v_final jsonb;
  v_mode text;
  v_actor_email text;
  v_summary text;
  v_changes jsonb:='[]'::jsonb;
  v_source_date date;
  v_target_date date;
  v_source_old text;
  v_source_new text;
  v_target_old text;
  v_target_new text;
  v_notification_id uuid;
begin
  v_result:=public.ta_apply_employee_request_dayoff_v61518(
    p_request_id,
    coalesce(p_acknowledge_48h,false),
    p_note
  );

  if coalesce((v_result->>'applied')::boolean,false)=false then
    return coalesce(v_result,'{}'::jsonb)
      || jsonb_build_object('publish_version','V6.15.19');
  end if;

  select * into v_req
  from public.ta_employee_requests_v61481 r
  where r.request_id=p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND_AFTER_APPLY';
  end if;

  v_actor_email:=lower(trim(coalesce(auth.jwt()->>'email','')));
  v_action:=coalesce(v_result->'action_result','{}'::jsonb);
  v_final:=coalesce(v_result->'final_state','{}'::jsonb);
  v_mode:=upper(trim(coalesce(v_action->>'dayoff_mode',
    case when upper(trim(coalesce(v_req.request_subtype,'')))='ADD_DAYOFF'
      then 'ADD' else 'SWAP' end
  )));

  begin v_source_date:=nullif(v_action->>'source_date','')::date;
  exception when others then v_source_date:=null; end;
  begin v_target_date:=nullif(v_action->>'target_date','')::date;
  exception when others then v_target_date:=null; end;

  v_source_date:=coalesce(v_source_date,v_req.work_date);
  if v_target_date is null then
    if v_mode='ADD' then
      v_target_date:=v_req.work_date;
    else
      begin
        v_target_date:=nullif(v_req.detail->>'target_date','')::date;
      exception when others then
        v_target_date:=null;
      end;
    end if;
  end if;
  if v_target_date is null then
    raise exception 'DAYOFF_OUTCOME_TARGET_DATE_MISSING';
  end if;

  if v_mode='SWAP' then
    v_source_old:=nullif(upper(trim(coalesce(v_action->>'source_old_shift',''))),'');
    v_source_new:=nullif(upper(trim(coalesce(v_action->>'source_new_work_shift',v_final->'source'->>'shift_code',''))),'');
    v_target_old:=nullif(upper(trim(coalesce(v_action->>'target_old_work_shift',''))),'');
    v_target_new:=nullif(upper(trim(coalesce(v_action->>'target_new_off_shift',v_final->'target'->>'shift_code',''))),'');

    v_changes:=jsonb_build_array(
      jsonb_build_object(
        'role','SOURCE',
        'work_date',v_source_date,
        'before_shift_code',v_source_old,
        'after_shift_code',v_source_new,
        'after_day_type','WORKDAY'
      ),
      jsonb_build_object(
        'role','TARGET',
        'work_date',v_target_date,
        'before_shift_code',v_target_old,
        'after_shift_code',v_target_new,
        'after_day_type','DAYOFF'
      )
    );

    v_summary:='สลับวันหยุดเรียบร้อย • '
      ||to_char(v_source_date,'DD/MM/YYYY')||' '
      ||public._ta_portal_shift_result_label_v61519(v_source_old)
      ||' → '
      ||public._ta_portal_shift_result_label_v61519(v_source_new)
      ||' • '
      ||to_char(v_target_date,'DD/MM/YYYY')||' '
      ||public._ta_portal_shift_result_label_v61519(v_target_old)
      ||' → '
      ||public._ta_portal_shift_result_label_v61519(v_target_new);
  else
    v_target_date:=coalesce(v_target_date,v_req.work_date);
    v_target_old:=nullif(upper(trim(coalesce(v_action->>'target_work_shift',''))),'');
    v_target_new:=nullif(upper(trim(coalesce(v_action->>'target_off_shift',v_final->'target'->>'shift_code',''))),'');

    v_changes:=jsonb_build_array(
      jsonb_build_object(
        'role','TARGET',
        'work_date',v_target_date,
        'before_shift_code',v_target_old,
        'after_shift_code',v_target_new,
        'after_day_type','DAYOFF'
      )
    );

    v_summary:='เพิ่มวันหยุดเรียบร้อย • '
      ||to_char(v_target_date,'DD/MM/YYYY')||' '
      ||public._ta_portal_shift_result_label_v61519(v_target_old)
      ||' → '
      ||public._ta_portal_shift_result_label_v61519(v_target_new);
  end if;

  update public.ta_employee_requests_v61481 r
  set
    detail=coalesce(r.detail,'{}'::jsonb) || jsonb_build_object(
      'manager_apply_result_v61519',jsonb_build_object(
        'applied',true,
        'mode',v_mode,
        'summary',v_summary,
        'schedule_changes',v_changes,
        'final_state',v_final,
        'applied_at',now(),
        'applied_by_email',v_actor_email,
        'version','V6.15.19'
      )
    ),
    updated_at=now()
  where r.request_id=p_request_id;

  -- The status trigger already inserted a notification while V6.15.18 resolved
  -- the request. Enrich that same notification instead of creating a duplicate.
  select n.notification_id
  into v_notification_id
  from public.ta_employee_portal_notifications_v61482 n
  where n.request_id=p_request_id
  order by n.created_at desc
  limit 1
  for update;

  if v_notification_id is not null then
    update public.ta_employee_portal_notifications_v61482 n
    set
      title=case when v_mode='ADD'
        then 'เพิ่มวันหยุดเรียบร้อย'
        else 'สลับวันหยุดเรียบร้อย'
      end,
      message=coalesce(v_req.request_no,'คำขอ')||' • '||v_summary,
      severity='success',
      is_read=false,
      read_at=null
    where n.notification_id=v_notification_id;
  elsif v_req.portal_account_id is not null then
    insert into public.ta_employee_portal_notifications_v61482(
      portal_account_id,emp_code,request_id,title,message,severity
    ) values (
      v_req.portal_account_id,
      v_req.emp_code,
      v_req.request_id,
      case when v_mode='ADD'
        then 'เพิ่มวันหยุดเรียบร้อย'
        else 'สลับวันหยุดเรียบร้อย'
      end,
      coalesce(v_req.request_no,'คำขอ')||' • '||v_summary,
      'success'
    ) returning notification_id into v_notification_id;
  end if;

  insert into public.ta_employee_portal_audit_v61482(
    emp_code,action_type,actor_user_id,actor_email,detail
  ) values (
    public.normalize_emp_code(v_req.emp_code),
    'PORTAL_DAYOFF_OUTCOME_PUBLISHED_V61519',
    auth.uid(),
    v_actor_email,
    jsonb_build_object(
      'request_id',v_req.request_id,
      'request_no',v_req.request_no,
      'summary',v_summary,
      'schedule_changes',v_changes,
      'notification_id',v_notification_id,
      'version','V6.15.19'
    )
  );

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object(
    'portal_outcome',jsonb_build_object(
      'summary',v_summary,
      'schedule_changes',v_changes,
      'notification_id',v_notification_id,
      'published',true
    ),
    'publish_version','V6.15.19'
  );
end;
$$;

revoke all on function public.ta_apply_employee_request_dayoff_v61519(uuid,boolean,text)
from public,anon,authenticated;
grant execute on function public.ta_apply_employee_request_dayoff_v61519(uuid,boolean,text)
to authenticated;

comment on function public.ta_apply_employee_request_dayoff_v61519(uuid,boolean,text)
is 'V6.15.19 4B.2D: V6.15.18 atomic day-off apply plus exact outcome publication to Employee Portal request detail and notification in the same transaction.';

notify pgrst,'reload schema';
commit;
