-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.15.22
-- 4C.4 — Leave Result Sync + Employee Portal Outcome + Notification
-- ============================================================================

begin;
set local statement_timeout='0';
select pg_advisory_xact_lock(hashtext('timeclock-v6.15.22-4c4-leave-result-sync'));

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
  if to_regprocedure('public.ta_apply_employee_request_leave_v61521(uuid,text)') is null then
    raise exception 'MISSING_V6.15.21: ta_apply_employee_request_leave_v61521';
  end if;
  if to_regprocedure('public.ta_get_employee_request_leave_review_v61521(uuid)') is null then
    raise exception 'MISSING_V6.15.21: ta_get_employee_request_leave_review_v61521';
  end if;
  if to_regprocedure('public._ta_validate_employee_portal_leave_v61508()') is null then
    raise exception 'MISSING_FUNCTION: _ta_validate_employee_portal_leave_v61508';
  end if;
  if to_regprocedure('public._ta_portal_request_status_notify_v61482()') is null then
    raise exception 'MISSING_FUNCTION: _ta_portal_request_status_notify_v61482';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Leave validation lifecycle
--    Validate Employee-owned PENDING insert/edit only.
--    Manager IN_REVIEW / RESOLVED detail publication must not be revalidated
--    against the already-mutated schedule. RETURNED -> PENDING resubmit is
--    validated again because NEW.status becomes PENDING in the update.
-- ---------------------------------------------------------------------------
drop trigger if exists trg_aa_ta_employee_request_leave_v61508
on public.ta_employee_requests_v61481;

create trigger trg_aa_ta_employee_request_leave_v61508
before insert
or update of
  request_type,
  request_subtype,
  work_date,
  detail,
  request_source
on public.ta_employee_requests_v61481
for each row
when (upper(trim(coalesce(new.status,'')))='PENDING')
execute function public._ta_validate_employee_portal_leave_v61508();

comment on trigger trg_aa_ta_employee_request_leave_v61508
on public.ta_employee_requests_v61481
is 'V6.15.22: Employee Portal Leave semantic validation runs only while request is PENDING. Manager apply/result publication is not revalidated against post-mutation schedule.';

-- ---------------------------------------------------------------------------
-- 2) Employee-facing shift labels for exact before/after outcome.
-- ---------------------------------------------------------------------------
create or replace function public._ta_portal_leave_shift_label_v61522(
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

revoke all on function public._ta_portal_leave_shift_label_v61522(text)
from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 3) Portal status notification wording.
--    The V6.15.22 apply wrapper enriches the RESOLVED Leave notification with
--    exact applied result in the same transaction.
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
  elsif new.status='RESOLVED' and v_type='LEAVE_REQUEST' then
    v_title:=case when v_subtype='PARTIAL_DAY'
      then 'แจ้งลาบางส่วนดำเนินการแล้ว'
      else 'ตารางกะตามคำขอลาปรับแล้ว'
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

-- ---------------------------------------------------------------------------
-- 4) Atomic Leave Apply + exact Employee Portal outcome publication.
--    - Capture authoritative Review BEFORE mutation for before-state evidence.
--    - Delegate real business mutation to V6.15.21.
--    - Publish exact before/after, Partial Overlay, skipped dates and HR Connect
--      reminder to Request detail + Notification + Audit in SAME transaction.
-- ---------------------------------------------------------------------------
create or replace function public.ta_apply_employee_request_leave_v61522(
  p_request_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_review jsonb;
  v_result jsonb;
  v_req public.ta_employee_requests_v61481%rowtype;
  v_subtype text;
  v_actor_email text;
  v_summary text;
  v_changes jsonb:='[]'::jsonb;
  v_review_days jsonb:='[]'::jsonb;
  v_final_days jsonb:='[]'::jsonb;
  v_review_item jsonb;
  v_final_item jsonb;
  v_action text;
  v_date date;
  v_before_code text;
  v_after_code text;
  v_current_day_type text;
  v_skip_reason text;
  v_affected integer:=0;
  v_skipped integer:=0;
  v_overlay jsonb:='{}'::jsonb;
  v_partial jsonb:='{}'::jsonb;
  v_leave_start_ts timestamp;
  v_leave_end_ts timestamp;
  v_shift_start_ts timestamp;
  v_shift_end_ts timestamp;
  v_notification_id uuid;
  v_reminder text:='การลาอย่างเป็นทางการยังต้องดำเนินการใน HR Connect ตามขั้นตอนของบริษัท';
begin
  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED';
  end if;

  -- Review is intentionally captured BEFORE V6.15.21 mutates the schedule.
  v_review:=public.ta_get_employee_request_leave_review_v61521(p_request_id);
  if coalesce((v_review->>'allowed')::boolean,false)=false then
    raise exception 'LEAVE_REQUEST_REVIEW_BLOCKED:%',
      coalesce(v_review->'blockers','[]'::jsonb)::text;
  end if;

  v_result:=public.ta_apply_employee_request_leave_v61521(
    p_request_id,
    p_note
  );

  if coalesce((v_result->>'applied')::boolean,false)=false then
    return coalesce(v_result,'{}'::jsonb)
      || jsonb_build_object('publish_version','V6.15.22');
  end if;

  select *
  into v_req
  from public.ta_employee_requests_v61481 r
  where r.request_id=p_request_id
  for update;

  if not found then
    raise exception 'REQUEST_NOT_FOUND_AFTER_APPLY';
  end if;
  if upper(trim(coalesce(v_req.status,'')))<>'RESOLVED' then
    raise exception 'LEAVE_RESULT_PUBLISH_REQUIRES_RESOLVED';
  end if;

  v_subtype:=upper(trim(coalesce(v_req.request_subtype,'')));
  v_actor_email:=lower(trim(coalesce(auth.jwt()->>'email','')));
  v_review_days:=coalesce(v_review->'days','[]'::jsonb);
  v_final_days:=coalesce(v_result->'final_state'->'days','[]'::jsonb);

  if v_subtype='PARTIAL_DAY' then
    v_overlay:=coalesce(v_result->'final_state'->'overlay','{}'::jsonb);
    v_before_code:=nullif(upper(trim(coalesce(
      v_review->'partial'->>'shift_code',
      v_review_days->0->>'current_shift_code',
      ''
    ))),'');
    v_after_code:=nullif(upper(trim(coalesce(
      v_result->'final_state'->>'shift_code',
      v_before_code,
      ''
    ))),'');

    begin v_leave_start_ts:=nullif(v_overlay->>'leave_start_at','')::timestamp;
    exception when others then v_leave_start_ts:=null; end;
    begin v_leave_end_ts:=nullif(v_overlay->>'leave_end_at','')::timestamp;
    exception when others then v_leave_end_ts:=null; end;
    begin v_shift_start_ts:=nullif(v_overlay->>'shift_start_at_snapshot','')::timestamp;
    exception when others then v_shift_start_ts:=null; end;
    begin v_shift_end_ts:=nullif(v_overlay->>'shift_end_at_snapshot','')::timestamp;
    exception when others then v_shift_end_ts:=null; end;

    v_partial:=jsonb_build_object(
      'work_date',v_req.work_date,
      'shift_code',coalesce(v_after_code,v_before_code),
      'shift_start_time',case when v_shift_start_ts is not null then to_char(v_shift_start_ts,'HH24:MI') else null end,
      'shift_end_time',case when v_shift_end_ts is not null then to_char(v_shift_end_ts,'HH24:MI') else null end,
      'leave_start_time',case when v_leave_start_ts is not null then to_char(v_leave_start_ts,'HH24:MI') else v_req.detail->>'leave_start_time' end,
      'leave_end_time',case when v_leave_end_ts is not null then to_char(v_leave_end_ts,'HH24:MI') else v_req.detail->>'leave_end_time' end,
      'leave_minutes',coalesce(nullif(v_overlay->>'leave_minutes','')::integer,nullif(v_req.detail->>'partial_minutes','')::integer,0),
      'overlay_id',v_overlay->>'overlay_id'
    );

    v_changes:=jsonb_build_array(jsonb_build_object(
      'role','PARTIAL',
      'action','PARTIAL_OVERLAY',
      'work_date',v_req.work_date,
      'before_shift_code',v_before_code,
      'before_shift_label',public._ta_portal_leave_shift_label_v61522(v_before_code),
      'after_shift_code',v_after_code,
      'after_shift_label',public._ta_portal_leave_shift_label_v61522(v_after_code),
      'changed',false,
      'leave_start_time',v_partial->>'leave_start_time',
      'leave_end_time',v_partial->>'leave_end_time'
    ));

    v_summary:='บันทึกลาบางส่วนเรียบร้อย • '
      ||to_char(v_req.work_date,'DD/MM/YYYY')
      ||' • ลา '
      ||coalesce(v_partial->>'leave_start_time','-')
      ||'–'||coalesce(v_partial->>'leave_end_time','-')
      ||' • กะเดิมยังคงอยู่';
  elsif v_subtype='FULL_DAY' then
    v_affected:=coalesce(nullif(v_result->>'affected_workday_count','')::integer,0);
    v_skipped:=coalesce(nullif(v_result->>'skipped_nonworkday_count','')::integer,0);

    for v_review_item in
      select value from jsonb_array_elements(v_review_days)
    loop
      begin v_date:=nullif(v_review_item->>'work_date','')::date;
      exception when others then v_date:=null; end;
      if v_date is null then continue; end if;

      v_action:=upper(trim(coalesce(v_review_item->>'action','')));
      v_before_code:=nullif(upper(trim(coalesce(v_review_item->>'current_shift_code',''))),'');
      v_current_day_type:=coalesce(v_review_item->>'current_day_type','');
      v_skip_reason:=coalesce(v_review_item->>'skip_reason','');
      v_final_item:=null;

      select value
      into v_final_item
      from jsonb_array_elements(v_final_days)
      where value->>'work_date'=to_char(v_date,'YYYY-MM-DD')
      limit 1;

      v_after_code:=nullif(upper(trim(coalesce(
        v_final_item->>'shift_code',
        v_before_code,
        ''
      ))),'');

      v_changes:=v_changes||jsonb_build_array(jsonb_build_object(
        'role',case when v_action='SET_LV' then 'AFFECTED' else 'SKIPPED' end,
        'action',case when v_action='SET_LV' then 'SET_LV' else 'SKIP' end,
        'work_date',v_date,
        'before_shift_code',v_before_code,
        'before_shift_label',public._ta_portal_leave_shift_label_v61522(v_before_code),
        'after_shift_code',v_after_code,
        'after_shift_label',public._ta_portal_leave_shift_label_v61522(v_after_code),
        'changed',v_action='SET_LV' and v_before_code is distinct from v_after_code,
        'current_day_type',v_current_day_type,
        'skip_reason',case when v_action='SET_LV' then null else coalesce(nullif(v_skip_reason,''),'NO_SCHEDULE_CHANGE_REQUIRED') end
      ));
    end loop;

    v_summary:='ปรับตารางลาเรียบร้อย • เปลี่ยนเป็นลา '
      ||v_affected||' วัน'
      ||case when v_skipped>0
        then ' • คงวันหยุด/PH/ลาเดิม '||v_skipped||' วัน'
        else ''
      end;
  else
    raise exception 'LEAVE_REQUEST_SUBTYPE_NOT_SUPPORTED:%',v_subtype;
  end if;

  update public.ta_employee_requests_v61481 r
  set
    detail=coalesce(r.detail,'{}'::jsonb)||jsonb_build_object(
      'manager_leave_apply_result_v61522',jsonb_build_object(
        'applied',true,
        'mode',v_subtype,
        'leave_type',r.detail->>'leave_type',
        'leave_type_label',r.detail->>'leave_type_label',
        'summary',v_summary,
        'schedule_changes',v_changes,
        'partial_leave',case when v_subtype='PARTIAL_DAY' then v_partial else null end,
        'affected_workday_count',case when v_subtype='FULL_DAY' then v_affected else 1 end,
        'skipped_nonworkday_count',case when v_subtype='FULL_DAY' then v_skipped else 0 end,
        'final_state',coalesce(v_result->'final_state','{}'::jsonb),
        'hr_connect_required',true,
        'hr_connect_system','HR Connect',
        'hr_connect_reminder',v_reminder,
        'applied_at',now(),
        'applied_by_email',v_actor_email,
        'version','V6.15.22'
      )
    ),
    updated_at=now()
  where r.request_id=p_request_id;

  -- V6.15.21 RESOLVED status already caused the portal notification trigger to
  -- insert one notification. Enrich that same row to avoid duplicates.
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
      title=case when v_subtype='PARTIAL_DAY'
        then 'บันทึกลาบางส่วนเรียบร้อย'
        else 'ปรับตารางลาเรียบร้อย'
      end,
      message=coalesce(v_req.request_no,'คำขอ')||' • '||v_summary
        ||' • กรุณาดำเนินการลาใน HR Connect ตามขั้นตอนบริษัท',
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
      case when v_subtype='PARTIAL_DAY'
        then 'บันทึกลาบางส่วนเรียบร้อย'
        else 'ปรับตารางลาเรียบร้อย'
      end,
      coalesce(v_req.request_no,'คำขอ')||' • '||v_summary
        ||' • กรุณาดำเนินการลาใน HR Connect ตามขั้นตอนบริษัท',
      'success'
    ) returning notification_id into v_notification_id;
  end if;

  insert into public.ta_employee_portal_audit_v61482(
    emp_code,action_type,actor_user_id,actor_email,detail
  ) values (
    public.normalize_emp_code(v_req.emp_code),
    'PORTAL_LEAVE_OUTCOME_PUBLISHED_V61522',
    auth.uid(),
    v_actor_email,
    jsonb_build_object(
      'request_id',v_req.request_id,
      'request_no',v_req.request_no,
      'request_subtype',v_subtype,
      'summary',v_summary,
      'schedule_changes',v_changes,
      'partial_leave',case when v_subtype='PARTIAL_DAY' then v_partial else null end,
      'notification_id',v_notification_id,
      'hr_connect_required',true,
      'version','V6.15.22'
    )
  );

  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
    'portal_outcome',jsonb_build_object(
      'summary',v_summary,
      'schedule_changes',v_changes,
      'partial_leave',case when v_subtype='PARTIAL_DAY' then v_partial else null end,
      'notification_id',v_notification_id,
      'hr_connect_required',true,
      'published',true
    ),
    'publish_version','V6.15.22'
  );
end;
$$;

revoke all on function public.ta_apply_employee_request_leave_v61522(uuid,text)
from public,anon,authenticated;
grant execute on function public.ta_apply_employee_request_leave_v61522(uuid,text)
to authenticated;

comment on function public.ta_apply_employee_request_leave_v61522(uuid,text)
is 'V6.15.22 4C.4: V6.15.21 atomic Leave Apply plus exact before/after outcome, HR Connect reminder and Employee Portal notification in the same transaction.';

notify pgrst,'reload schema';
commit;
