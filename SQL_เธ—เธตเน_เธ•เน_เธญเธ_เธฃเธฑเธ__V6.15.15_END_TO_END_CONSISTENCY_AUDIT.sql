-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.15.15
-- 4B — End-to-End Manager -> Portal Consistency Audit
-- ============================================================================

begin;
set local statement_timeout='0';

select pg_advisory_xact_lock(
  hashtext('timeclock-v6.15.15-request-consistency-audit')
);

do $$
begin
  if to_regclass('public.ta_employee_requests_v61481') is null then
    raise exception 'MISSING_TABLE: ta_employee_requests_v61481';
  end if;

  if to_regprocedure(
    'public._ta_request_effective_shift_v61510(text,date)'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_request_effective_shift_v61510';
  end if;

  if to_regprocedure(
    'public._ta_request_manager_authorized_v61481(uuid)'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_request_manager_authorized_v61481';
  end if;

  if to_regclass('public.ta_portal_sync_state_v61513') is null then
    raise exception 'MISSING_V6.15.13: ta_portal_sync_state_v61513';
  end if;

  if to_regclass('public.ta_portal_partial_leave_overlays_v61511') is null then
    raise exception 'MISSING_V6.15.11: ta_portal_partial_leave_overlays_v61511';
  end if;
end;
$$;

create table if not exists public.ta_request_consistency_meta_v61515 (
  singleton_id smallint primary key
    check (singleton_id=1),
  installed_at timestamptz not null,
  version text not null
);

insert into public.ta_request_consistency_meta_v61515(
  singleton_id,
  installed_at,
  version
)
values(
  1,
  clock_timestamp(),
  'V6.15.15'
)
on conflict(singleton_id) do nothing;

alter table public.ta_request_consistency_meta_v61515
  enable row level security;

revoke all on table
  public.ta_request_consistency_meta_v61515
from public,anon,authenticated;

create table if not exists public.ta_employee_request_consistency_v61515 (
  request_id uuid primary key
    references public.ta_employee_requests_v61481(request_id)
    on delete cascade,

  emp_code text not null,
  request_type text not null,
  request_subtype text,
  request_status text not null,

  overall_status text not null,
  business_status text not null,
  sync_status text not null,

  result_code text not null,
  summary text not null,

  expected_state jsonb not null default '{}'::jsonb,
  observed_state jsonb not null default '{}'::jsonb,

  checked_by uuid,
  checked_at timestamptz not null default now(),
  version text not null default 'V6.15.15',

  constraint ck_ta_request_consistency_overall_v61515
    check (
      overall_status in (
        'PASS',
        'WARN',
        'FAIL',
        'NOT_APPLICABLE',
        'PENDING'
      )
    ),

  constraint ck_ta_request_consistency_business_v61515
    check (
      business_status in (
        'PASS',
        'WARN',
        'FAIL',
        'NOT_APPLICABLE',
        'PENDING'
      )
    ),

  constraint ck_ta_request_consistency_sync_v61515
    check (
      sync_status in (
        'PASS',
        'WARN',
        'FAIL',
        'NOT_APPLICABLE',
        'PENDING'
      )
    )
);

create index if not exists idx_ta_request_consistency_status_v61515
  on public.ta_employee_request_consistency_v61515(
    overall_status,
    checked_at desc
  );

create index if not exists idx_ta_request_consistency_emp_v61515
  on public.ta_employee_request_consistency_v61515(
    emp_code,
    checked_at desc
  );

alter table public.ta_employee_request_consistency_v61515
  enable row level security;

revoke all on table
  public.ta_employee_request_consistency_v61515
from public,anon,authenticated;

create or replace function public._ta_check_employee_request_consistency_v61515(
  p_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
declare
  v_req public.ta_employee_requests_v61481%rowtype;

  v_emp text;
  v_type text;
  v_subtype text;

  v_installed_at timestamptz;
  v_is_legacy boolean:=false;

  v_business_ok boolean:=false;
  v_business_status text:='FAIL';
  v_business_code text:='BUSINESS_STATE_NOT_FOUND';

  v_sync_status text:='WARN';
  v_sync_code text:='SYNC_STATE_NOT_VERIFIED';

  v_overall text:='FAIL';
  v_result_code text;
  v_summary text;

  v_expected jsonb:='{}'::jsonb;
  v_observed jsonb:='{}'::jsonb;

  v_cert jsonb;
  v_sc jsonb;
  v_sr jsonb;
  v_overlay jsonb;
  v_sync jsonb;

  v_source record;
  v_target record;

  v_target_date date;
  v_leave_end date;
  v_d date;

  v_total_days integer:=0;
  v_match_days integer:=0;

  v_notification_exists boolean:=false;

  v_request_sync_ok boolean:=false;
  v_data_sync_ok boolean:=false;
  v_notification_sync_ok boolean:=false;

  v_request_sync_at timestamptz;
  v_data_sync_at timestamptz;
  v_notification_sync_at timestamptz;

  v_overlay_start time;
  v_overlay_end time;
  v_request_start time;
  v_request_end time;
begin
  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED';
  end if;

  select *
  into v_req
  from public.ta_employee_requests_v61481 r
  where r.request_id=p_request_id;

  if v_req.request_id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  v_emp:=public.normalize_emp_code(v_req.emp_code);
  v_type:=upper(trim(coalesce(v_req.request_type,'')));
  v_subtype:=upper(trim(coalesce(v_req.request_subtype,'')));

  select m.installed_at
  into v_installed_at
  from public.ta_request_consistency_meta_v61515 m
  where m.singleton_id=1;

  v_is_legacy:=
    v_req.resolved_at is not null
    and v_installed_at is not null
    and v_req.resolved_at<v_installed_at;

  if upper(trim(coalesce(v_req.request_source,'')))<>'EMPLOYEE_PORTAL' then
    return jsonb_build_object(
      'request_id',v_req.request_id,
      'emp_code',v_emp,
      'request_type',v_type,
      'request_subtype',v_subtype,
      'request_status',v_req.status,
      'overall_status','NOT_APPLICABLE',
      'business_status','NOT_APPLICABLE',
      'sync_status','NOT_APPLICABLE',
      'result_code','NON_PORTAL_REQUEST',
      'summary','ไม่ใช่คำขอจาก Employee Portal',
      'expected_state','{}'::jsonb,
      'observed_state','{}'::jsonb,
      'version','V6.15.15'
    );
  end if;

  if upper(trim(coalesce(v_req.status,'')))<>'RESOLVED' then
    return jsonb_build_object(
      'request_id',v_req.request_id,
      'emp_code',v_emp,
      'request_type',v_type,
      'request_subtype',v_subtype,
      'request_status',v_req.status,
      'overall_status','PENDING',
      'business_status','PENDING',
      'sync_status','PENDING',
      'result_code','REQUEST_NOT_RESOLVED',
      'summary','คำขอยังไม่สิ้นสุด Workflow',
      'expected_state','{}'::jsonb,
      'observed_state','{}'::jsonb,
      'version','V6.15.15'
    );
  end if;

  if v_type not in (
    'TIME_ISSUE',
    'SPECIAL_WORK',
    'DAYOFF_SWAP',
    'LEAVE_REQUEST'
  ) then
    return jsonb_build_object(
      'request_id',v_req.request_id,
      'emp_code',v_emp,
      'request_type',v_type,
      'request_subtype',v_subtype,
      'request_status',v_req.status,
      'overall_status','NOT_APPLICABLE',
      'business_status','NOT_APPLICABLE',
      'sync_status','NOT_APPLICABLE',
      'result_code','REQUEST_TYPE_NOT_AUDITED',
      'summary','ประเภทคำขอนี้อยู่นอกขอบเขต 4B',
      'expected_state','{}'::jsonb,
      'observed_state','{}'::jsonb,
      'version','V6.15.15'
    );
  end if;

  if v_type='TIME_ISSUE' then
    select to_jsonb(c)
    into v_cert
    from public.ta_attendance_certifications c
    where public.normalize_emp_code(c.emp_code)=v_emp
      and c.work_date=v_req.work_date
      and upper(trim(coalesce(c.status,'')))='CERTIFIED'
    order by c.certified_start_at desc nulls last
    limit 1;

    v_expected:=jsonb_build_object(
      'work_date',v_req.work_date,
      'certification_status','CERTIFIED',
      'certified_start_required',true,
      'certified_end_required',true
    );

    v_observed:=jsonb_build_object(
      'certification',
      coalesce(v_cert,'{}'::jsonb)
    );

    v_business_ok:=
      v_cert is not null
      and nullif(v_cert->>'certified_start_at','') is not null
      and nullif(v_cert->>'certified_end_at','') is not null;

    v_business_code:=
      case
        when v_business_ok then 'TIME_CERTIFICATION_MATCH'
        else 'TIME_CERTIFICATION_NOT_APPLIED'
      end;

  elsif v_type='SPECIAL_WORK' then
    select to_jsonb(sc)
    into v_sc
    from public.shift_calendar sc
    where public.normalize_emp_code(sc.emp_code)=v_emp
      and sc.work_date=v_req.work_date
    order by coalesce(sc.updated_at,now()) desc
    limit 1;

    select to_jsonb(sr)
    into v_sr
    from public.ta_schedule_rule_assignments sr
    where public.normalize_emp_code(sr.emp_code)=v_emp
      and sr.work_date=v_req.work_date
    limit 1;

    v_expected:=jsonb_build_object(
      'work_date',v_req.work_date,
      'schedule_required',true,
      'schedule_rule_required',true,
      'atomic_request_id',v_req.request_id,
      'requested_work_mode',v_subtype
    );

    v_observed:=jsonb_build_object(
      'shift_calendar',
      coalesce(v_sc,'{}'::jsonb),
      'schedule_rule',
      coalesce(v_sr,'{}'::jsonb)
    );

    v_business_ok:=
      v_sc is not null
      and v_sr is not null
      and coalesce(
        v_sr#>>'{validation_snapshot,atomic_request_id}',
        ''
      )=v_req.request_id::text;

    v_business_code:=
      case
        when v_business_ok then 'SPECIAL_WORK_MATCH'
        else 'SPECIAL_WORK_NOT_APPLIED'
      end;

  elsif v_type='DAYOFF_SWAP' then
    if v_subtype='ADD_DAYOFF' then
      select *
      into v_target
      from public._ta_request_effective_shift_v61510(
        v_emp,
        v_req.work_date
      )
      limit 1;

      v_expected:=jsonb_build_object(
        'mode','ADD_DAYOFF',
        'target_date',v_req.work_date,
        'target_is_workday',false
      );

      v_observed:=jsonb_build_object(
        'target_shift_code',v_target.shift_code,
        'target_is_workday',v_target.is_workday
      );

      v_business_ok:=
        nullif(trim(coalesce(v_target.shift_code,'')),'') is not null
        and not coalesce(v_target.is_workday,true)
        and upper(trim(coalesce(v_target.shift_code,'')))
            not in ('LV','LEAVE','HOL');

      v_business_code:=
        case
          when v_business_ok then 'ADD_DAYOFF_MATCH'
          else 'ADD_DAYOFF_NOT_APPLIED'
        end;

    elsif v_subtype='SWAP_DAYOFF' then
      begin
        v_target_date:=
          nullif(v_req.detail->>'target_date','')::date;
      exception when others then
        v_target_date:=null;
      end;

      if v_target_date is not null then
        select *
        into v_source
        from public._ta_request_effective_shift_v61510(
          v_emp,
          v_req.work_date
        )
        limit 1;

        select *
        into v_target
        from public._ta_request_effective_shift_v61510(
          v_emp,
          v_target_date
        )
        limit 1;
      end if;

      v_expected:=jsonb_build_object(
        'mode','SWAP_DAYOFF',
        'source_date',v_req.work_date,
        'source_is_workday',true,
        'target_date',v_target_date,
        'target_is_workday',false
      );

      v_observed:=jsonb_build_object(
        'source_shift_code',v_source.shift_code,
        'source_is_workday',v_source.is_workday,
        'target_shift_code',v_target.shift_code,
        'target_is_workday',v_target.is_workday
      );

      v_business_ok:=
        v_target_date is not null
        and coalesce(v_source.is_workday,false)
        and not coalesce(v_target.is_workday,true)
        and upper(trim(coalesce(v_target.shift_code,'')))
            not in ('LV','LEAVE','HOL');

      v_business_code:=
        case
          when v_business_ok then 'SWAP_DAYOFF_MATCH'
          else 'SWAP_DAYOFF_NOT_APPLIED'
        end;

    else
      v_business_ok:=false;
      v_business_code:='DAYOFF_SUBTYPE_NOT_SUPPORTED';
      v_expected:=jsonb_build_object(
        'request_subtype',v_subtype
      );
    end if;

  elsif v_type='LEAVE_REQUEST' then
    if v_subtype='PARTIAL_DAY' then
      select to_jsonb(o)
      into v_overlay
      from public.ta_portal_partial_leave_overlays_v61511 o
      where o.employee_request_id=v_req.request_id
      limit 1;

      begin
        v_request_start:=
          nullif(v_req.detail->>'leave_start_time','')::time;
        v_request_end:=
          nullif(v_req.detail->>'leave_end_time','')::time;

        v_overlay_start:=
          nullif(v_overlay->>'leave_start_at','')::timestamp::time;

        v_overlay_end:=
          nullif(v_overlay->>'leave_end_at','')::timestamp::time;
      exception when others then
        v_request_start:=null;
        v_request_end:=null;
        v_overlay_start:=null;
        v_overlay_end:=null;
      end;

      v_expected:=jsonb_build_object(
        'mode','PARTIAL_DAY',
        'work_date',v_req.work_date,
        'shift_calendar_must_remain_workday',true,
        'leave_type',v_req.detail->>'leave_type',
        'leave_start_time',v_req.detail->>'leave_start_time',
        'leave_end_time',v_req.detail->>'leave_end_time'
      );

      v_observed:=jsonb_build_object(
        'overlay',
        coalesce(v_overlay,'{}'::jsonb)
      );

      v_business_ok:=
        v_overlay is not null
        and coalesce(
          nullif(v_overlay->>'is_active','')::boolean,
          false
        )
        and public.normalize_emp_code(
          v_overlay->>'emp_code'
        )=v_emp
        and nullif(v_overlay->>'work_date','')::date=v_req.work_date
        and (
          v_request_start is null
          or v_overlay_start=v_request_start
        )
        and (
          v_request_end is null
          or v_overlay_end=v_request_end
        );

      v_business_code:=
        case
          when v_business_ok then 'PARTIAL_LEAVE_OVERLAY_MATCH'
          else 'PARTIAL_LEAVE_OVERLAY_NOT_APPLIED'
        end;

    elsif v_subtype='FULL_DAY' then
      begin
        v_leave_end:=
          coalesce(
            nullif(v_req.detail->>'end_date','')::date,
            v_req.work_date
          );
      exception when others then
        v_leave_end:=v_req.work_date;
      end;

      v_total_days:=0;
      v_match_days:=0;

      for v_d in
        select generate_series(
          v_req.work_date,
          v_leave_end,
          interval '1 day'
        )::date
      loop
        v_total_days:=v_total_days+1;

        select *
        into v_target
        from public._ta_request_effective_shift_v61510(
          v_emp,
          v_d
        )
        limit 1;

        if upper(trim(coalesce(v_target.shift_code,'')))
           in ('LV','LEAVE') then
          v_match_days:=v_match_days+1;
        end if;
      end loop;

      v_expected:=jsonb_build_object(
        'mode','FULL_DAY',
        'leave_start_date',v_req.work_date,
        'leave_end_date',v_leave_end,
        'expected_lv_days',v_total_days
      );

      v_observed:=jsonb_build_object(
        'matched_lv_days',v_match_days,
        'total_days_checked',v_total_days
      );

      v_business_ok:=
        v_total_days>0
        and v_match_days=v_total_days;

      v_business_code:=
        case
          when v_business_ok then 'FULL_DAY_LEAVE_MATCH'
          else 'FULL_DAY_LEAVE_NOT_APPLIED'
        end;

    else
      v_business_ok:=false;
      v_business_code:='LEAVE_SUBTYPE_NOT_SUPPORTED';
      v_expected:=jsonb_build_object(
        'request_subtype',v_subtype
      );
    end if;
  end if;

  if v_business_ok then
    v_business_status:='PASS';
  elsif v_is_legacy then
    v_business_status:='WARN';
  else
    v_business_status:='FAIL';
  end if;

  select to_jsonb(s)
  into v_sync
  from public.ta_portal_sync_state_v61513 s
  where s.emp_code=v_emp;

  if v_sync is not null then
    begin
      v_request_sync_at:=
        nullif(v_sync->>'request_updated_at','')::timestamptz;
      v_data_sync_at:=
        nullif(v_sync->>'data_updated_at','')::timestamptz;
      v_notification_sync_at:=
        nullif(v_sync->>'notification_updated_at','')::timestamptz;
    exception when others then
      v_request_sync_at:=null;
      v_data_sync_at:=null;
      v_notification_sync_at:=null;
    end;
  end if;

  select exists(
    select 1
    from public.ta_employee_portal_notifications_v61482 n
    where n.request_id=v_req.request_id
      and public.normalize_emp_code(n.emp_code)=v_emp
  )
  into v_notification_exists;

  if v_is_legacy then
    v_sync_status:='WARN';
    v_sync_code:='LEGACY_BEFORE_CONSISTENCY_GUARD';

  else
    v_request_sync_ok:=
      v_request_sync_at is not null
      and v_req.resolved_at is not null
      and v_request_sync_at>=v_req.resolved_at;

    v_data_sync_ok:=
      v_data_sync_at is not null
      and v_req.resolved_at is not null
      and v_data_sync_at>=v_req.resolved_at;

    if v_req.portal_account_id is null then
      v_notification_sync_ok:=true;
    else
      v_notification_sync_ok:=
        v_notification_exists
        and v_notification_sync_at is not null
        and v_req.resolved_at is not null
        and v_notification_sync_at>=v_req.resolved_at;
    end if;

    if v_request_sync_ok
       and v_data_sync_ok
       and v_notification_sync_ok then
      v_sync_status:='PASS';
      v_sync_code:='PORTAL_SYNC_EVIDENCE_MATCH';
    else
      v_sync_status:='WARN';
      v_sync_code:='PORTAL_SYNC_EVIDENCE_INCOMPLETE';
    end if;
  end if;

  v_observed:=
    coalesce(v_observed,'{}'::jsonb)
    || jsonb_build_object(
      'portal_sync',
      jsonb_build_object(
        'state',coalesce(v_sync,'{}'::jsonb),
        'notification_exists',v_notification_exists,
        'request_sync_ok',v_request_sync_ok,
        'data_sync_ok',v_data_sync_ok,
        'notification_sync_ok',v_notification_sync_ok
      )
    );

  if v_business_status='FAIL' then
    v_overall:='FAIL';
    v_result_code:=v_business_code;
    v_summary:='Backend ยังไม่ตรงกับผลที่คำขอควรทำ';

  elsif v_business_status='WARN' then
    v_overall:='WARN';
    v_result_code:=v_business_code;
    v_summary:='รายการเดิมก่อนติดตั้ง 4B • พบข้อมูลไม่ครบสำหรับยืนยันแบบเข้มงวด';

  elsif v_sync_status='PASS' then
    v_overall:='PASS';
    v_result_code:='END_TO_END_CONSISTENT';
    v_summary:='Backend, Request และ Employee Portal Sync สอดคล้องกัน';

  else
    v_overall:='WARN';
    v_result_code:=v_sync_code;
    v_summary:='Backend ถูกต้อง แต่หลักฐาน Portal Sync ยังไม่ครบ';
  end if;

  return jsonb_build_object(
    'request_id',v_req.request_id,
    'emp_code',v_emp,
    'request_type',v_type,
    'request_subtype',v_subtype,
    'request_status',v_req.status,

    'overall_status',v_overall,
    'business_status',v_business_status,
    'sync_status',v_sync_status,

    'result_code',v_result_code,
    'summary',v_summary,

    'expected_state',coalesce(v_expected,'{}'::jsonb),
    'observed_state',coalesce(v_observed,'{}'::jsonb),

    'legacy_before_guard',v_is_legacy,
    'version','V6.15.15'
  );
end;
$$;

revoke all on function
  public._ta_check_employee_request_consistency_v61515(uuid)
from public,anon,authenticated;

create or replace function public._ta_store_employee_request_consistency_v61515(
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_result jsonb;
begin
  v_result:=
    public._ta_check_employee_request_consistency_v61515(
      p_request_id
    );

  insert into public.ta_employee_request_consistency_v61515(
    request_id,
    emp_code,
    request_type,
    request_subtype,
    request_status,

    overall_status,
    business_status,
    sync_status,

    result_code,
    summary,

    expected_state,
    observed_state,

    checked_by,
    checked_at,
    version
  )
  values(
    (v_result->>'request_id')::uuid,
    v_result->>'emp_code',
    v_result->>'request_type',
    nullif(v_result->>'request_subtype',''),
    v_result->>'request_status',

    v_result->>'overall_status',
    v_result->>'business_status',
    v_result->>'sync_status',

    v_result->>'result_code',
    v_result->>'summary',

    coalesce(v_result->'expected_state','{}'::jsonb),
    coalesce(v_result->'observed_state','{}'::jsonb),

    auth.uid(),
    clock_timestamp(),
    'V6.15.15'
  )
  on conflict(request_id)
  do update set
    emp_code=excluded.emp_code,
    request_type=excluded.request_type,
    request_subtype=excluded.request_subtype,
    request_status=excluded.request_status,

    overall_status=excluded.overall_status,
    business_status=excluded.business_status,
    sync_status=excluded.sync_status,

    result_code=excluded.result_code,
    summary=excluded.summary,

    expected_state=excluded.expected_state,
    observed_state=excluded.observed_state,

    checked_by=excluded.checked_by,
    checked_at=excluded.checked_at,
    version=excluded.version;

  return v_result;
end;
$$;

revoke all on function
  public._ta_store_employee_request_consistency_v61515(uuid)
from public,anon,authenticated;

create or replace function public._ta_request_consistency_guard_v61515()
returns trigger
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_result jsonb;
begin
  if upper(trim(coalesce(new.request_source,'')))<>'EMPLOYEE_PORTAL' then
    return new;
  end if;

  if upper(trim(coalesce(new.status,'')))<>'RESOLVED' then
    return new;
  end if;

  if upper(trim(coalesce(old.status,'')))='RESOLVED' then
    return new;
  end if;

  if upper(trim(coalesce(new.request_type,''))) not in (
    'TIME_ISSUE',
    'SPECIAL_WORK',
    'DAYOFF_SWAP',
    'LEAVE_REQUEST'
  ) then
    return new;
  end if;

  v_result:=
    public._ta_store_employee_request_consistency_v61515(
      new.request_id
    );

  if upper(coalesce(v_result->>'business_status',''))='FAIL' then
    raise exception
      'REQUEST_BACKEND_CONSISTENCY_FAILED:%',
      coalesce(
        v_result->>'result_code',
        'UNKNOWN'
      )
      using hint=
        coalesce(
          v_result->>'summary',
          'Backend state does not match resolved request.'
        );
  end if;

  return new;
end;
$$;

revoke all on function
  public._ta_request_consistency_guard_v61515()
from public,anon,authenticated;

drop trigger if exists
  trg_zzzz_ta_request_consistency_v61515
on public.ta_employee_requests_v61481;

create trigger trg_zzzz_ta_request_consistency_v61515
after update of status
on public.ta_employee_requests_v61481
for each row
execute function
  public._ta_request_consistency_guard_v61515();

create or replace function public.ta_recheck_employee_request_consistency_v61515(
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_role text;
begin
  select upper(coalesce(p.role,'VIEWER'))
  into v_role
  from public.ta_user_profiles p
  where p.user_id=auth.uid()
    and p.is_active=true
  limit 1;

  if v_role='HR_ADMIN' then
    return public._ta_store_employee_request_consistency_v61515(
      p_request_id
    );
  end if;

  if v_role='MANAGER'
     and public._ta_request_manager_authorized_v61481(
       p_request_id
     ) then
    return public._ta_store_employee_request_consistency_v61515(
      p_request_id
    );
  end if;

  raise exception 'REQUEST_CONSISTENCY_PERMISSION_DENIED';
end;
$$;

revoke all on function
  public.ta_recheck_employee_request_consistency_v61515(uuid)
from public;

grant execute on function
  public.ta_recheck_employee_request_consistency_v61515(uuid)
to authenticated;

create or replace function public.ta_get_employee_request_consistency_v61515(
  p_request_ids uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
declare
  v_role text;
  v_email text;
  v_result jsonb;
begin
  select
    upper(coalesce(p.role,'VIEWER')),
    lower(trim(coalesce(p.email,'')))
  into
    v_role,
    v_email
  from public.ta_user_profiles p
  where p.user_id=auth.uid()
    and p.is_active=true
  limit 1;

  if v_role not in ('HR_ADMIN','MANAGER') then
    raise exception 'REQUEST_CONSISTENCY_PERMISSION_DENIED';
  end if;

  if p_request_ids is null
     or cardinality(p_request_ids)=0 then
    return '[]'::jsonb;
  end if;

  if cardinality(p_request_ids)>500 then
    raise exception 'REQUEST_CONSISTENCY_MAX_500_IDS';
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(a)
      order by a.checked_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.ta_employee_request_consistency_v61515 a
  join public.ta_employee_requests_v61481 r
    on r.request_id=a.request_id
  where a.request_id=any(p_request_ids)
    and (
      v_role='HR_ADMIN'
      or exists(
        select 1
        from public.ta_get_schedule_manager_map_v61124(
          array[
            public.normalize_emp_code(r.emp_code)
          ]::text[],
          r.work_date
        ) m
        where public.normalize_emp_code(m.emp_code)
              =public.normalize_emp_code(r.emp_code)
          and lower(trim(coalesce(m.manager_email,'')))=v_email
      )
    );

  return v_result;
end;
$$;

revoke all on function
  public.ta_get_employee_request_consistency_v61515(uuid[])
from public;

grant execute on function
  public.ta_get_employee_request_consistency_v61515(uuid[])
to authenticated;

create or replace function public.ta_portal_get_my_request_consistency_v61515(
  p_session_token text,
  p_request_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_emp text;
  v_result jsonb;
begin
  v_emp:=
    public._ta_portal_session_emp_v61482(
      p_session_token
    );

  if p_request_ids is null
     or cardinality(p_request_ids)=0 then
    return '[]'::jsonb;
  end if;

  if cardinality(p_request_ids)>300 then
    raise exception 'PORTAL_REQUEST_CONSISTENCY_MAX_300_IDS';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'request_id',a.request_id,
        'overall_status',a.overall_status,
        'business_status',a.business_status,
        'sync_status',a.sync_status,
        'result_code',a.result_code,
        'summary',a.summary,
        'checked_at',a.checked_at,
        'version',a.version
      )
      order by a.checked_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.ta_employee_request_consistency_v61515 a
  join public.ta_employee_requests_v61481 r
    on r.request_id=a.request_id
  where a.request_id=any(p_request_ids)
    and public.normalize_emp_code(r.emp_code)=v_emp;

  return v_result;
end;
$$;

revoke all on function
  public.ta_portal_get_my_request_consistency_v61515(text,uuid[])
from public;

grant execute on function
  public.ta_portal_get_my_request_consistency_v61515(text,uuid[])
to anon,authenticated;


-- ---------------------------------------------------------------------------
-- 4B.1 Sync convergence
--
-- At the exact RESOLVED statement, Request revision may already be updated
-- while the employee notification is created a few statements later.
-- Therefore the first stored Audit can legitimately be WARN.
--
-- Recheck recent resolved requests after request/notification revision changes
-- so Audit converges to PASS without Manager/User pressing Refresh.
-- ---------------------------------------------------------------------------
create or replace function public._ta_request_consistency_on_sync_v61515()
returns trigger
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_request_id uuid;
begin
  if tg_op<>'UPDATE' then
    return new;
  end if;

  if new.request_revision=old.request_revision
     and new.notification_revision=old.notification_revision then
    return new;
  end if;

  for v_request_id in
    select r.request_id
    from public.ta_employee_requests_v61481 r
    left join public.ta_employee_request_consistency_v61515 a
      on a.request_id=r.request_id
    where public.normalize_emp_code(r.emp_code)=new.emp_code
      and upper(trim(coalesce(r.request_source,'')))='EMPLOYEE_PORTAL'
      and upper(trim(coalesce(r.status,'')))='RESOLVED'
      and upper(trim(coalesce(r.request_type,''))) in (
        'TIME_ISSUE',
        'SPECIAL_WORK',
        'DAYOFF_SWAP',
        'LEAVE_REQUEST'
      )
      and coalesce(r.resolved_at,r.updated_at,r.created_at)
          >=clock_timestamp()-interval '2 days'
      and (
        a.request_id is null
        or a.overall_status<>'PASS'
      )
    order by coalesce(r.resolved_at,r.updated_at,r.created_at) desc
    limit 20
  loop
    begin
      perform public._ta_store_employee_request_consistency_v61515(
        v_request_id
      );
    exception when others then
      -- Audit must never break the business transaction on this convergence path.
      null;
    end;
  end loop;

  return new;
end;
$$;

revoke all on function
  public._ta_request_consistency_on_sync_v61515()
from public,anon,authenticated;

drop trigger if exists
  trg_zzzz_ta_request_consistency_sync_v61515
on public.ta_portal_sync_state_v61513;

create trigger trg_zzzz_ta_request_consistency_sync_v61515
after update of request_revision,notification_revision
on public.ta_portal_sync_state_v61513
for each row
execute function
  public._ta_request_consistency_on_sync_v61515();



-- ---------------------------------------------------------------------------
-- 4B.1 Sync convergence
-- Recheck recent RESOLVED requests when Request/Notification revision changes.
-- This allows a first WARN (notification not yet written) to converge to PASS.
-- ---------------------------------------------------------------------------
create or replace function public._ta_request_consistency_on_sync_v61515()
returns trigger
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_request_id uuid;
begin
  if tg_op<>'UPDATE' then
    return new;
  end if;

  if new.request_revision=old.request_revision
     and new.notification_revision=old.notification_revision then
    return new;
  end if;

  for v_request_id in
    select r.request_id
    from public.ta_employee_requests_v61481 r
    left join public.ta_employee_request_consistency_v61515 a
      on a.request_id=r.request_id
    where public.normalize_emp_code(r.emp_code)=new.emp_code
      and upper(trim(coalesce(r.request_source,'')))='EMPLOYEE_PORTAL'
      and upper(trim(coalesce(r.status,'')))='RESOLVED'
      and upper(trim(coalesce(r.request_type,''))) in (
        'TIME_ISSUE',
        'SPECIAL_WORK',
        'DAYOFF_SWAP',
        'LEAVE_REQUEST'
      )
      and coalesce(r.resolved_at,r.updated_at,r.created_at)
          >=clock_timestamp()-interval '2 days'
      and (
        a.request_id is null
        or a.overall_status<>'PASS'
      )
    order by coalesce(r.resolved_at,r.updated_at,r.created_at) desc
    limit 20
  loop
    begin
      perform public._ta_store_employee_request_consistency_v61515(
        v_request_id
      );
    exception when others then
      null;
    end;
  end loop;

  return new;
end;
$$;

revoke all on function
  public._ta_request_consistency_on_sync_v61515()
from public,anon,authenticated;

drop trigger if exists
  trg_zzzz_ta_request_consistency_sync_v61515
on public.ta_portal_sync_state_v61513;

create trigger trg_zzzz_ta_request_consistency_sync_v61515
after update of request_revision,notification_revision
on public.ta_portal_sync_state_v61513
for each row
execute function
  public._ta_request_consistency_on_sync_v61515();


do $$
declare
  v_id uuid;
  v_req public.ta_employee_requests_v61481%rowtype;
begin
  for v_id in
    select r.request_id
    from public.ta_employee_requests_v61481 r
    where upper(trim(coalesce(r.request_source,'')))='EMPLOYEE_PORTAL'
      and upper(trim(coalesce(r.status,'')))='RESOLVED'
      and upper(trim(coalesce(r.request_type,''))) in (
        'TIME_ISSUE',
        'SPECIAL_WORK',
        'DAYOFF_SWAP',
        'LEAVE_REQUEST'
      )
      and coalesce(r.resolved_at,r.updated_at,r.created_at)
          >=current_date-180
    order by coalesce(r.resolved_at,r.updated_at,r.created_at) desc
  loop
    begin
      perform public._ta_store_employee_request_consistency_v61515(
        v_id
      );
    exception when others then
      select *
      into v_req
      from public.ta_employee_requests_v61481 r
      where r.request_id=v_id;

      insert into public.ta_employee_request_consistency_v61515(
        request_id,
        emp_code,
        request_type,
        request_subtype,
        request_status,
        overall_status,
        business_status,
        sync_status,
        result_code,
        summary,
        expected_state,
        observed_state,
        checked_at,
        version
      )
      values(
        v_id,
        public.normalize_emp_code(v_req.emp_code),
        upper(trim(coalesce(v_req.request_type,''))),
        upper(trim(coalesce(v_req.request_subtype,''))),
        upper(trim(coalesce(v_req.status,''))),
        'WARN',
        'WARN',
        'WARN',
        'BACKFILL_CHECK_ERROR',
        'รายการเดิมตรวจย้อนหลังได้ไม่ครบ',
        '{}'::jsonb,
        jsonb_build_object(
          'sqlstate',sqlstate,
          'message',sqlerrm
        ),
        clock_timestamp(),
        'V6.15.15'
      )
      on conflict(request_id)
      do update set
        overall_status='WARN',
        business_status='WARN',
        sync_status='WARN',
        result_code='BACKFILL_CHECK_ERROR',
        summary='รายการเดิมตรวจย้อนหลังได้ไม่ครบ',
        observed_state=excluded.observed_state,
        checked_at=excluded.checked_at,
        version='V6.15.15';
    end;
  end loop;
end;
$$;

notify pgrst,'reload schema';

commit;
