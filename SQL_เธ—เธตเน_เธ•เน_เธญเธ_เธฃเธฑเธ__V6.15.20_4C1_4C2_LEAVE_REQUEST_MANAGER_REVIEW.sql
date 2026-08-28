-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.15.20
-- 4C.1 + 4C.2 — Employee Leave Request Preview + Manager Review
-- ============================================================================

begin;
set local statement_timeout='0';
select pg_advisory_xact_lock(hashtext('timeclock-v6.15.20-leave-request-review'));

-- ---------------------------------------------------------------------------
-- 0) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ta_employee_requests_v61481') is null then
    raise exception 'MISSING_TABLE: ta_employee_requests_v61481';
  end if;
  if to_regprocedure('public._ta_employee_portal_leave_day_state_v61508(text,date)') is null then
    raise exception 'MISSING_FUNCTION: _ta_employee_portal_leave_day_state_v61508';
  end if;
  if to_regprocedure('public._ta_partial_leave_window_v61511(text,date,text,time,time)') is null then
    raise exception 'MISSING_V6.15.11: _ta_partial_leave_window_v61511';
  end if;
  if to_regprocedure('public._ta_request_effective_shift_v61510(text,date)') is null then
    raise exception 'MISSING_V6.15.10: _ta_request_effective_shift_v61510';
  end if;
  if to_regprocedure('public._ta_portal_assert_request_no_conflict_v61494(text,date,text,text,jsonb,uuid)') is null then
    raise exception 'MISSING_FUNCTION: _ta_portal_assert_request_no_conflict_v61494';
  end if;
  if to_regprocedure('public._ta_system_period_state_v6110(date)') is null then
    raise exception 'MISSING_FUNCTION: _ta_system_period_state_v6110';
  end if;
  if to_regprocedure('public._ta_portal_session_emp_v61482(text)') is null then
    raise exception 'MISSING_FUNCTION: _ta_portal_session_emp_v61482';
  end if;
  if to_regprocedure('public._ta_request_manager_authorized_v61481(uuid)') is null then
    raise exception 'MISSING_FUNCTION: _ta_request_manager_authorized_v61481';
  end if;
  if to_regprocedure('public._ta_bangkok_today_v6110()') is null then
    raise exception 'MISSING_FUNCTION: _ta_bangkok_today_v6110';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Canonical Employee Portal leave validator V6.15.20
--
-- FULL_DAY:
--   - ช่วงวันที่สามารถคร่อม Weekly Off / PH / Leave เดิมได้
--   - ระบบเก็บเฉพาะ WORKDAY เป็น affected_work_dates
--   - วันที่ไม่ใช่วันทำงานจะถูกเก็บเป็น skipped_nonworkdays และไม่ต้องแก้กะ
--   - ต้องมีวันทำงานอย่างน้อย 1 วัน
-- PARTIAL_DAY:
--   - ต้องเป็นวันทำงานเดียว และใช้ V6.15.11 shift-aware window
-- ทั้งสองแบบ:
--   - Employee Portal ห้ามส่งถ้ารอบ Schedule ของวันทำงานปิดแล้ว
-- ---------------------------------------------------------------------------
create or replace function public._ta_validate_employee_portal_leave_v61508()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_emp text:=public.normalize_emp_code(new.emp_code);
  v_subtype text:=upper(trim(coalesce(new.request_subtype,'')));
  v_start date:=new.work_date;
  v_end date;
  v_leave_raw text:=trim(coalesce(new.detail->>'leave_type',''));
  v_leave_type text;
  v_leave_label text;
  v_start_time time;
  v_end_time time;
  v_minutes integer:=0;
  v_emp_start date;
  v_day date;
  v_day_state jsonb;
  v_partial jsonb;
  v_period jsonb;
  v_period_block boolean:=false;
  v_today date:=public._ta_bangkok_today_v6110();
  v_affected jsonb:='[]'::jsonb;
  v_skipped jsonb:='[]'::jsonb;
  v_affected_count integer:=0;
begin
  if upper(trim(coalesce(new.request_source,'')))<>'EMPLOYEE_PORTAL' then
    return new;
  end if;
  if upper(trim(coalesce(new.request_type,'')))<>'LEAVE_REQUEST' then
    return new;
  end if;
  if v_start is null then raise exception 'LEAVE_START_DATE_REQUIRED'; end if;

  v_end:=coalesce(nullif(new.detail->>'end_date','')::date,v_start);
  if v_start<v_today then raise exception 'LEAVE_EMPLOYEE_PORTAL_NO_PAST_DATE'; end if;
  if v_end<v_start then raise exception 'LEAVE_END_BEFORE_START'; end if;
  if v_end-v_start>31 then raise exception 'LEAVE_RANGE_MAX_32_DAYS'; end if;

  v_leave_type:=case upper(v_leave_raw)
    when 'PERSONAL' then 'PERSONAL' when 'ลากิจ' then 'PERSONAL'
    when 'VACATION' then 'VACATION' when 'ลาพักร้อน' then 'VACATION'
    when 'ORDINATION' then 'ORDINATION' when 'ลาอุปสมบท' then 'ORDINATION'
    when 'NEWBORN_CARE' then 'NEWBORN_CARE'
    when 'ลาดูแลบุตรที่คลอดใหม่' then 'NEWBORN_CARE'
    else null
  end;
  if v_leave_type is null then raise exception 'LEAVE_TYPE_NOT_ALLOWED'; end if;

  v_leave_label:=case v_leave_type
    when 'PERSONAL' then 'ลากิจ'
    when 'VACATION' then 'ลาพักร้อน'
    when 'ORDINATION' then 'ลาอุปสมบท'
    when 'NEWBORN_CARE' then 'ลาดูแลบุตรที่คลอดใหม่'
  end;

  if v_subtype not in ('FULL_DAY','PARTIAL_DAY') then
    raise exception 'INVALID_REQUEST_SUBTYPE';
  end if;

  if v_subtype='PARTIAL_DAY' and v_end<>v_start then
    raise exception 'LEAVE_PARTIAL_SINGLE_DAY_ONLY';
  end if;

  for v_day in
    select d::date from generate_series(v_start,v_end,interval '1 day') d
  loop
    v_day_state:=public._ta_employee_portal_leave_day_state_v61508(v_emp,v_day);

    if coalesce((v_day_state->>'allowed')::boolean,false) then
      v_period:=public._ta_system_period_state_v6110(v_day);
      v_period_block:=
        coalesce((v_period->>'configured')::boolean,false)
        and (
          not coalesce((v_period->>'schedule_open')::boolean,false)
          or coalesce((v_period->>'schedule_deadline_passed')::boolean,false)
        );

      if v_period_block then
        raise exception 'LEAVE_SYSTEM_PERIOD_SCHEDULE_CLOSED:%',to_char(v_day,'YYYY-MM-DD');
      end if;

      v_affected_count:=v_affected_count+1;
      v_affected:=v_affected || jsonb_build_array(to_char(v_day,'YYYY-MM-DD'));
    else
      if v_subtype='PARTIAL_DAY' then
        raise exception 'LEAVE_NOT_ALLOWED_NON_WORKDAY:%:%',
          to_char(v_day,'YYYY-MM-DD'),coalesce(v_day_state->>'day_type','NON_WORKDAY');
      end if;

      v_skipped:=v_skipped || jsonb_build_array(
        jsonb_build_object(
          'work_date',v_day,
          'day_type',coalesce(v_day_state->>'day_type','NON_WORKDAY'),
          'shift_code',v_day_state->>'shift_code',
          'reason','NO_SCHEDULE_CHANGE_REQUIRED'
        )
      );
    end if;
  end loop;

  if v_subtype='FULL_DAY' and v_affected_count=0 then
    raise exception 'LEAVE_RANGE_NO_WORKDAY';
  end if;

  if v_leave_type='ORDINATION' then
    select nullif(to_jsonb(e)->>'start_date','')::date
    into v_emp_start
    from public.employees e
    where public.normalize_emp_code(e."EmployeeId")=v_emp
    limit 1;
    if v_emp_start is null then raise exception 'ORDINATION_EMPLOYEE_START_DATE_REQUIRED'; end if;
    if v_start<(v_emp_start+interval '1 year')::date then
      raise exception 'ORDINATION_MIN_SERVICE_1_YEAR';
    end if;
  end if;

  if v_subtype='PARTIAL_DAY' then
    if v_leave_type in ('ORDINATION','NEWBORN_CARE') then
      raise exception 'LEAVE_PARTIAL_NOT_ALLOWED_FOR_TYPE';
    end if;

    begin
      v_start_time:=nullif(new.detail->>'leave_start_time','')::time;
      v_end_time:=nullif(new.detail->>'leave_end_time','')::time;
    exception when others then
      raise exception 'LEAVE_PARTIAL_TIME_REQUIRED';
    end;

    v_partial:=public._ta_partial_leave_window_v61511(
      v_emp,v_start,v_leave_type,v_start_time,v_end_time
    );
    v_minutes:=(v_partial->>'leave_minutes')::integer;

    new.detail:=coalesce(new.detail,'{}'::jsonb)
      || jsonb_build_object(
        'leave_start_at',v_partial->>'leave_start_at',
        'leave_end_at',v_partial->>'leave_end_at',
        'partial_shift_code',v_partial->>'shift_code',
        'partial_shift_start_at',v_partial->>'shift_start_at',
        'partial_shift_end_at',v_partial->>'shift_end_at',
        'partial_overlay_scope','PRIMARY_SHIFT'
      );
  else
    new.detail:=coalesce(new.detail,'{}'::jsonb)
      - 'leave_start_time' - 'leave_end_time'
      - 'leave_start_at' - 'leave_end_at'
      - 'partial_shift_code' - 'partial_shift_start_at' - 'partial_shift_end_at'
      - 'partial_overlay_scope';
    v_minutes:=0;
  end if;

  new.detail:=coalesce(new.detail,'{}'::jsonb)
    || jsonb_build_object(
      'leave_type',v_leave_type,
      'leave_type_label',v_leave_label,
      'end_date',v_end,
      'partial_minutes',v_minutes,
      'affected_work_dates',v_affected,
      'affected_workday_count',v_affected_count,
      'skipped_nonworkdays',v_skipped,
      'skipped_nonworkday_count',jsonb_array_length(v_skipped),
      'leave_schedule_notice_only',true,
      'leave_hr_system','HR Connect',
      'leave_hr_approval_level','หัวหน้างานระดับฝ่าย',
      'leave_policy_version','V6.15.20'
    );
  return new;
end;
$$;

comment on function public._ta_validate_employee_portal_leave_v61508()
is 'V6.15.20 Employee Portal leave policy: FULL_DAY may span non-workdays which are skipped; PARTIAL_DAY remains shift-aware; schedule period is checked before submit.';

-- ---------------------------------------------------------------------------
-- 2) Employee Portal authoritative leave preview (read-only)
-- ---------------------------------------------------------------------------
create or replace function public.ta_portal_preview_leave_request_v61520(
  p_session_token text,
  p_work_date date,
  p_request_subtype text,
  p_leave_type text,
  p_end_date date default null,
  p_leave_start_time time default null,
  p_leave_end_time time default null,
  p_exclude_request_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_emp text:=public._ta_portal_session_emp_v61482(p_session_token);
  v_start date:=p_work_date;
  v_end date:=coalesce(p_end_date,p_work_date);
  v_subtype text:=upper(trim(coalesce(p_request_subtype,'')));
  v_leave_type text;
  v_leave_label text;
  v_today date:=public._ta_bangkok_today_v6110();
  v_emp_start date;
  v_day date;
  v_day_state jsonb;
  v_effective jsonb;
  v_period jsonb;
  v_period_block boolean;
  v_days jsonb:='[]'::jsonb;
  v_affected jsonb:='[]'::jsonb;
  v_skipped jsonb:='[]'::jsonb;
  v_blockers jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
  v_affected_count integer:=0;
  v_skipped_count integer:=0;
  v_partial jsonb:=null;
  v_detail jsonb:='{}'::jsonb;
  v_conflict_ok boolean:=true;
  v_conflict_error text:=null;
  v_preview_allowed boolean:=false;
begin
  v_leave_type:=case upper(trim(coalesce(p_leave_type,'')))
    when 'PERSONAL' then 'PERSONAL' when 'ลากิจ' then 'PERSONAL'
    when 'VACATION' then 'VACATION' when 'ลาพักร้อน' then 'VACATION'
    when 'ORDINATION' then 'ORDINATION' when 'ลาอุปสมบท' then 'ORDINATION'
    when 'NEWBORN_CARE' then 'NEWBORN_CARE'
    when 'ลาดูแลบุตรที่คลอดใหม่' then 'NEWBORN_CARE'
    else null
  end;
  v_leave_label:=case v_leave_type
    when 'PERSONAL' then 'ลากิจ'
    when 'VACATION' then 'ลาพักร้อน'
    when 'ORDINATION' then 'ลาอุปสมบท'
    when 'NEWBORN_CARE' then 'ลาดูแลบุตรที่คลอดใหม่'
  end;

  if v_start is null then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','LEAVE_START_DATE_REQUIRED','message','กรุณาเลือกวันที่เริ่มลา'));
  end if;
  if v_subtype not in ('FULL_DAY','PARTIAL_DAY') then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','INVALID_REQUEST_SUBTYPE','message','รูปแบบการลาไม่ถูกต้อง'));
  end if;
  if v_leave_type is null then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','LEAVE_TYPE_NOT_ALLOWED','message','กรุณาเลือกประเภทการลา'));
  end if;

  if v_start is not null then
    if v_start<v_today then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','LEAVE_EMPLOYEE_PORTAL_NO_PAST_DATE','message','Employee Portal ไม่รองรับการขอลาย้อนหลัง'));
    end if;
    if v_end<v_start then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','LEAVE_END_BEFORE_START','message','วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มลา'));
    end if;
    if v_end-v_start>31 then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','LEAVE_RANGE_MAX_32_DAYS','message','ช่วงลาสูงสุด 32 วันต่อคำขอ'));
    end if;
  end if;

  if v_subtype='PARTIAL_DAY' and v_end is distinct from v_start then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','LEAVE_PARTIAL_SINGLE_DAY_ONLY','message','ลาบางส่วนต้องอยู่ภายในวันเดียวกัน'));
  end if;

  if v_leave_type='ORDINATION' and v_start is not null then
    select nullif(to_jsonb(e)->>'start_date','')::date
    into v_emp_start
    from public.employees e
    where public.normalize_emp_code(e."EmployeeId")=v_emp
    limit 1;
    if v_emp_start is null then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','ORDINATION_EMPLOYEE_START_DATE_REQUIRED','message','ไม่พบวันเริ่มงานสำหรับตรวจสิทธิ์ลาอุปสมบท'));
    elsif v_start<(v_emp_start+interval '1 year')::date then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','ORDINATION_MIN_SERVICE_1_YEAR','message','ลาอุปสมบทกำหนดอายุงานอย่างน้อย 1 ปี'));
    end if;
  end if;

  if v_subtype='PARTIAL_DAY' and v_leave_type in ('ORDINATION','NEWBORN_CARE') then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','LEAVE_PARTIAL_NOT_ALLOWED_FOR_TYPE','message',coalesce(v_leave_label,'ประเภทนี้')||'รองรับเฉพาะลาเต็มวัน'));
  end if;

  if v_start is not null and v_end>=v_start and v_end-v_start<=31 then
    for v_day in select d::date from generate_series(v_start,v_end,interval '1 day') d
    loop
      v_day_state:=public._ta_employee_portal_leave_day_state_v61508(v_emp,v_day);
      select to_jsonb(e) into v_effective
      from public._ta_request_effective_shift_v61510(v_emp,v_day) e
      limit 1;
      v_period:=public._ta_system_period_state_v6110(v_day);
      v_period_block:=
        coalesce((v_period->>'configured')::boolean,false)
        and (
          not coalesce((v_period->>'schedule_open')::boolean,false)
          or coalesce((v_period->>'schedule_deadline_passed')::boolean,false)
        );

      if coalesce((v_day_state->>'allowed')::boolean,false) then
        v_affected_count:=v_affected_count+1;
        v_affected:=v_affected||jsonb_build_array(to_char(v_day,'YYYY-MM-DD'));
        if v_period_block then
          v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
            'code','SYSTEM_PERIOD_SCHEDULE_CLOSED',
            'work_date',v_day,
            'message','รอบระบบปิดการแก้ไขตารางกะสำหรับ '||to_char(v_day,'DD/MM/YYYY')
          ));
        end if;
        v_days:=v_days||jsonb_build_array(jsonb_build_object(
          'work_date',v_day,
          'current_shift_code',v_effective->>'shift_code',
          'shift_start_time',v_effective->>'shift_start_time',
          'shift_end_time',v_effective->>'shift_end_time',
          'current_day_type',coalesce(v_effective->>'day_type',v_day_state->>'day_type'),
          'action','SET_LV',
          'proposed_shift_code','LV',
          'period',v_period,
          'period_allowed',not v_period_block
        ));
      else
        v_skipped_count:=v_skipped_count+1;
        v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object(
          'work_date',v_day,
          'day_type',coalesce(v_day_state->>'day_type','NON_WORKDAY'),
          'shift_code',coalesce(v_day_state->>'shift_code',v_effective->>'shift_code')
        ));
        v_days:=v_days||jsonb_build_array(jsonb_build_object(
          'work_date',v_day,
          'current_shift_code',coalesce(v_effective->>'shift_code',v_day_state->>'shift_code'),
          'shift_start_time',v_effective->>'shift_start_time',
          'shift_end_time',v_effective->>'shift_end_time',
          'current_day_type',coalesce(v_day_state->>'day_type',v_effective->>'day_type','NON_WORKDAY'),
          'action','SKIP',
          'proposed_shift_code',coalesce(v_effective->>'shift_code',v_day_state->>'shift_code'),
          'skip_reason','NO_SCHEDULE_CHANGE_REQUIRED',
          'period',v_period,
          'period_allowed',true
        ));
        if v_subtype='PARTIAL_DAY' then
          v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
            'code','LEAVE_NOT_ALLOWED_NON_WORKDAY',
            'work_date',v_day,
            'message','ลาบางส่วนใช้ได้เฉพาะวันทำงาน'
          ));
        end if;
      end if;
    end loop;
  end if;

  if v_subtype='FULL_DAY' and v_affected_count=0 and v_start is not null then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','LEAVE_RANGE_NO_WORKDAY','message','ช่วงวันที่เลือกไม่มีวันทำงานที่ต้องปรับตารางกะ'));
  end if;

  if v_subtype='PARTIAL_DAY'
     and v_start is not null
     and v_leave_type in ('PERSONAL','VACATION')
     and p_leave_start_time is not null
     and p_leave_end_time is not null
     and not exists(select 1 from jsonb_array_elements(v_blockers) as bx(item) where bx.item->>'code' in ('LEAVE_NOT_ALLOWED_NON_WORKDAY','SYSTEM_PERIOD_SCHEDULE_CLOSED')) then
    begin
      v_partial:=public._ta_partial_leave_window_v61511(
        v_emp,v_start,v_leave_type,p_leave_start_time,p_leave_end_time
      );
    exception when others then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PARTIAL_LEAVE_WINDOW_INVALID','message',sqlerrm));
    end;
  elsif v_subtype='PARTIAL_DAY' and (p_leave_start_time is null or p_leave_end_time is null) then
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','LEAVE_PARTIAL_TIME_REQUIRED','message','กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด'));
  end if;

  v_detail:=jsonb_build_object(
    'leave_type',v_leave_type,
    'leave_type_label',v_leave_label,
    'end_date',v_end,
    'leave_start_time',p_leave_start_time,
    'leave_end_time',p_leave_end_time,
    'affected_work_dates',v_affected,
    'affected_workday_count',v_affected_count,
    'skipped_nonworkdays',v_skipped,
    'skipped_nonworkday_count',v_skipped_count
  );

  if v_start is not null then
    begin
      perform public._ta_portal_assert_request_no_conflict_v61494(
        v_emp,v_start,'LEAVE_REQUEST',v_subtype,v_detail,p_exclude_request_id
      );
      v_conflict_ok:=true;
    exception when others then
      v_conflict_ok:=false;
      v_conflict_error:=sqlerrm;
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
        'code','REQUEST_DATE_CONFLICT',
        'message',sqlerrm
      ));
    end;
  end if;

  if v_skipped_count>0 and v_subtype='FULL_DAY' then
    v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
      'code','NONWORKDAYS_WILL_BE_SKIPPED',
      'message','มี '||v_skipped_count||' วันที่เป็นวันหยุด/PH/ลาเดิม ระบบจะไม่แก้ตารางกะของวันเหล่านั้น'
    ));
  end if;

  v_preview_allowed:=jsonb_array_length(v_blockers)=0;

  return jsonb_build_object(
    'allowed',v_preview_allowed,
    'emp_code',v_emp,
    'request_subtype',v_subtype,
    'leave_type',v_leave_type,
    'leave_type_label',v_leave_label,
    'start_date',v_start,
    'end_date',v_end,
    'affected_workday_count',v_affected_count,
    'skipped_nonworkday_count',v_skipped_count,
    'days',v_days,
    'affected_work_dates',v_affected,
    'skipped_nonworkdays',v_skipped,
    'partial',v_partial,
    'canonical_conflict_ok',v_conflict_ok,
    'canonical_conflict_error',v_conflict_error,
    'blockers',v_blockers,
    'warnings',v_warnings,
    'submit_detail_patch',jsonb_build_object(
      'affected_work_dates',v_affected,
      'affected_workday_count',v_affected_count,
      'skipped_nonworkdays',v_skipped,
      'skipped_nonworkday_count',v_skipped_count,
      'leave_preview_checked_at',now(),
      'leave_preview_version','V6.15.20'
    ),
    'official_leave_system','HR Connect',
    'official_leave_approval_level','หัวหน้างานระดับฝ่าย',
    'checked_at',now(),
    'version','V6.15.20'
  );
end;
$$;

revoke all on function public.ta_portal_preview_leave_request_v61520(
  text,date,text,text,date,time,time,uuid
) from public,anon,authenticated;
grant execute on function public.ta_portal_preview_leave_request_v61520(
  text,date,text,text,date,time,time,uuid
) to anon,authenticated;

comment on function public.ta_portal_preview_leave_request_v61520(text,date,text,text,date,time,time,uuid)
is 'V6.15.20 authoritative Employee Portal leave preview. Read-only business preview; official leave remains HR Connect.';

-- ---------------------------------------------------------------------------
-- 3) Manager authoritative read-only Review
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_employee_request_leave_review_v61520(
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
  v_subtype text;
  v_leave_type text;
  v_leave_label text;
  v_end date;
  v_day date;
  v_day_state jsonb;
  v_effective jsonb;
  v_period jsonb;
  v_period_block boolean;
  v_days jsonb:='[]'::jsonb;
  v_rows jsonb:='[]'::jsonb;
  v_blockers jsonb:='[]'::jsonb;
  v_warnings jsonb:='[]'::jsonb;
  v_affected_count integer:=0;
  v_skipped_count integer:=0;
  v_partial jsonb:=null;
  v_conflict_ok boolean:=true;
  v_conflict_error text:=null;
  v_sequence jsonb:=null;
  v_full_name text;
  v_legacy_apply_compatible boolean:=false;
begin
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  if not public._ta_request_manager_authorized_v61481(p_request_id) then
    raise exception 'REQUEST_DECISION_PERMISSION_DENIED';
  end if;

  select * into v_req
  from public.ta_employee_requests_v61481 r
  where r.request_id=p_request_id
  limit 1;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if upper(trim(coalesce(v_req.request_type,'')))<>'LEAVE_REQUEST' then
    raise exception 'REQUEST_TYPE_NOT_LEAVE';
  end if;
  if upper(trim(coalesce(v_req.status,''))) not in ('PENDING','IN_REVIEW') then
    raise exception 'REQUEST_NOT_ACTIVE';
  end if;

  v_emp:=public.normalize_emp_code(v_req.emp_code);
  v_subtype:=upper(trim(coalesce(v_req.request_subtype,'')));
  v_leave_type:=upper(trim(coalesce(v_req.detail->>'leave_type','')));
  v_leave_label:=coalesce(nullif(v_req.detail->>'leave_type_label',''),v_leave_type);
  begin v_end:=coalesce(nullif(v_req.detail->>'end_date','')::date,v_req.work_date);
  exception when others then v_end:=v_req.work_date; end;

  select coalesce(nullif(to_jsonb(e)->>'full_name',''),nullif(to_jsonb(e)->>'FullName',''),nullif(to_jsonb(e)->>'EmployeeName',''))
  into v_full_name
  from public.employees e
  where public.normalize_emp_code(e."EmployeeId")=v_emp
  limit 1;

  begin
    perform public._ta_portal_assert_request_no_conflict_v61494(
      v_emp,v_req.work_date,'LEAVE_REQUEST',v_subtype,v_req.detail,v_req.request_id
    );
    v_conflict_ok:=true;
  exception when others then
    v_conflict_ok:=false;
    v_conflict_error:=sqlerrm;
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','REQUEST_CURRENT_STATE_CONFLICT','message',sqlerrm));
  end;

  if v_subtype='PARTIAL_DAY' then
    v_day_state:=public._ta_employee_portal_leave_day_state_v61508(v_emp,v_req.work_date);
    select to_jsonb(e) into v_effective from public._ta_request_effective_shift_v61510(v_emp,v_req.work_date) e limit 1;
    v_period:=public._ta_system_period_state_v6110(v_req.work_date);
    v_period_block:=coalesce((v_period->>'configured')::boolean,false)
      and (not coalesce((v_period->>'schedule_open')::boolean,false)
           or coalesce((v_period->>'schedule_deadline_passed')::boolean,false));

    if not coalesce((v_day_state->>'allowed')::boolean,false) then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','LEAVE_NOT_ALLOWED_NON_WORKDAY','message','วันที่ขอลาบางส่วนไม่ใช่วันทำงานแล้ว'));
    end if;
    if v_period_block then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','SYSTEM_PERIOD_SCHEDULE_CLOSED','message','รอบระบบปิดการแก้ไขตารางกะแล้ว'));
    end if;

    begin
      v_partial:=public._ta_partial_leave_window_v61511(
        v_emp,
        v_req.work_date,
        v_leave_type,
        nullif(v_req.detail->>'leave_start_time','')::time,
        nullif(v_req.detail->>'leave_end_time','')::time
      );
    exception when others then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','PARTIAL_LEAVE_WINDOW_INVALID','message',sqlerrm));
    end;

    v_affected_count:=case when coalesce((v_day_state->>'allowed')::boolean,false) then 1 else 0 end;
    v_days:=jsonb_build_array(jsonb_build_object(
      'work_date',v_req.work_date,
      'current_shift_code',v_effective->>'shift_code',
      'shift_start_time',v_effective->>'shift_start_time',
      'shift_end_time',v_effective->>'shift_end_time',
      'current_day_type',v_effective->>'day_type',
      'action','PARTIAL_OVERLAY',
      'proposed_shift_code',v_effective->>'shift_code',
      'period',v_period,
      'period_allowed',not v_period_block
    ));
    v_legacy_apply_compatible:=jsonb_array_length(v_blockers)=0;
  elsif v_subtype='FULL_DAY' then
    for v_day in select d::date from generate_series(v_req.work_date,v_end,interval '1 day') d
    loop
      v_day_state:=public._ta_employee_portal_leave_day_state_v61508(v_emp,v_day);
      select to_jsonb(e) into v_effective from public._ta_request_effective_shift_v61510(v_emp,v_day) e limit 1;
      v_period:=public._ta_system_period_state_v6110(v_day);
      v_period_block:=coalesce((v_period->>'configured')::boolean,false)
        and (not coalesce((v_period->>'schedule_open')::boolean,false)
             or coalesce((v_period->>'schedule_deadline_passed')::boolean,false));

      if coalesce((v_day_state->>'allowed')::boolean,false) then
        v_affected_count:=v_affected_count+1;
        if v_period_block then
          v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
            'code','SYSTEM_PERIOD_SCHEDULE_CLOSED','work_date',v_day,
            'message','รอบระบบปิดการแก้ไขตารางกะสำหรับ '||to_char(v_day,'DD/MM/YYYY')
          ));
        end if;
        v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
          'emp_code',v_emp,'work_date',v_day,'shift_code','LV'
        ));
        v_days:=v_days||jsonb_build_array(jsonb_build_object(
          'work_date',v_day,
          'current_shift_code',v_effective->>'shift_code',
          'shift_start_time',v_effective->>'shift_start_time',
          'shift_end_time',v_effective->>'shift_end_time',
          'current_day_type',coalesce(v_effective->>'day_type',v_day_state->>'day_type'),
          'action','SET_LV','proposed_shift_code','LV',
          'period',v_period,'period_allowed',not v_period_block
        ));
      else
        v_skipped_count:=v_skipped_count+1;
        v_days:=v_days||jsonb_build_array(jsonb_build_object(
          'work_date',v_day,
          'current_shift_code',coalesce(v_effective->>'shift_code',v_day_state->>'shift_code'),
          'shift_start_time',v_effective->>'shift_start_time',
          'shift_end_time',v_effective->>'shift_end_time',
          'current_day_type',coalesce(v_day_state->>'day_type',v_effective->>'day_type','NON_WORKDAY'),
          'action','SKIP','proposed_shift_code',coalesce(v_effective->>'shift_code',v_day_state->>'shift_code'),
          'skip_reason','NO_SCHEDULE_CHANGE_REQUIRED',
          'period',v_period,'period_allowed',true
        ));
      end if;
    end loop;

    if v_affected_count=0 then
      v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','LEAVE_RANGE_NO_WORKDAY','message','ช่วงวันที่เลือกไม่มีวันทำงานที่ต้องปรับตารางกะ'));
    end if;

    if v_skipped_count>0 then
      v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object(
        'code','NONWORKDAYS_WILL_BE_SKIPPED',
        'message','มี '||v_skipped_count||' วันที่ไม่ใช่วันทำงาน และไม่ควรถูกเปลี่ยนเป็น LV'
      ));
    end if;

    if jsonb_array_length(v_rows)>0 and to_regprocedure('public.ta_validate_night_sequence_bulk_v61437(jsonb)') is not null then
      begin
        execute 'select public.ta_validate_night_sequence_bulk_v61437($1)' into v_sequence using v_rows;
        if coalesce((v_sequence->>'allowed')::boolean,true)=false then
          v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object(
            'code','NIGHT_SEQUENCE_BLOCKED',
            'message',coalesce(v_sequence->'violations'->0->>'reason','ไม่ผ่านเงื่อนไขกะดึก')
          ));
        end if;
      exception when others then
        v_warnings:=v_warnings||jsonb_build_array(jsonb_build_object('code','NIGHT_SEQUENCE_PREVIEW_UNAVAILABLE','message',sqlerrm));
      end;
    end if;

    -- V6.15.10 legacy FULL_DAY writer expects every calendar day in the range to
    -- be a workday. 4C.3 will replace this limitation with affected-date atomic apply.
    v_legacy_apply_compatible:=v_skipped_count=0 and jsonb_array_length(v_blockers)=0;
  else
    v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('code','INVALID_REQUEST_SUBTYPE','message','รูปแบบคำขอไม่รองรับ'));
  end if;

  return jsonb_build_object(
    'allowed',jsonb_array_length(v_blockers)=0,
    'legacy_apply_compatible',v_legacy_apply_compatible,
    'request_id',v_req.request_id,
    'request_no',v_req.request_no,
    'request_status',v_req.status,
    'request_subtype',v_subtype,
    'employee',jsonb_build_object('emp_code',v_emp,'full_name',coalesce(v_full_name,'')),
    'leave_type',v_leave_type,
    'leave_type_label',v_leave_label,
    'start_date',v_req.work_date,
    'end_date',v_end,
    'reason',v_req.reason,
    'days',v_days,
    'affected_workday_count',v_affected_count,
    'skipped_nonworkday_count',v_skipped_count,
    'partial',v_partial,
    'canonical_conflict_ok',v_conflict_ok,
    'canonical_conflict_error',v_conflict_error,
    'night_sequence_guard',coalesce(v_sequence,'{}'::jsonb),
    'blockers',v_blockers,
    'warnings',v_warnings,
    'official_leave_system','HR Connect',
    'official_leave_approval_level','หัวหน้างานระดับฝ่าย',
    'checked_at',now(),
    'version','V6.15.20'
  );
end;
$$;

revoke all on function public.ta_get_employee_request_leave_review_v61520(uuid)
from public,anon,authenticated;
grant execute on function public.ta_get_employee_request_leave_review_v61520(uuid)
to authenticated;

comment on function public.ta_get_employee_request_leave_review_v61520(uuid)
is 'V6.15.20 Manager read-only Leave Review. It does not approve official leave; HR Connect remains system of record.';

-- ---------------------------------------------------------------------------
-- 4) Extend V6.15.19 Return-for-correction to Leave Request as well.
--    Function name stays V6.15.19 for frontend/backward compatibility.
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
  v_type text;
begin
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  if v_note is null then raise exception 'REQUEST_RETURN_NOTE_REQUIRED'; end if;
  if not public._ta_request_manager_authorized_v61481(p_request_id) then
    raise exception 'REQUEST_DECISION_PERMISSION_DENIED';
  end if;

  select lower(trim(coalesce(p.email,''))) into v_actor_email
  from public.ta_user_profiles p
  where p.user_id=auth.uid() and coalesce(p.is_active,false)
  limit 1;
  if v_actor_email is null then raise exception 'ACTIVE_USER_PROFILE_REQUIRED'; end if;

  select * into v_row
  from public.ta_employee_requests_v61481 r
  where r.request_id=p_request_id
  for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;

  v_type:=upper(trim(coalesce(v_row.request_type,'')));
  if v_type not in ('DAYOFF_SWAP','LEAVE_REQUEST') then
    raise exception 'REQUEST_RETURN_TYPE_NOT_SUPPORTED';
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
  exception when others then v_return_count:=1; end;

  update public.ta_employee_requests_v61481 r
  set
    status='RETURNED',
    decided_by=auth.uid(),
    decided_by_email=v_actor_email,
    decided_at=now(),
    decision_note=v_note,
    resolved_at=null,
    detail=coalesce(r.detail,'{}'::jsonb)||jsonb_build_object(
      'returned_to_employee',true,
      'return_note',v_note,
      'return_count',v_return_count,
      'returned_at',now(),
      'returned_by_email',v_actor_email,
      'return_version','V6.15.20'
    ),
    updated_at=now()
  where r.request_id=p_request_id
  returning * into v_row;

  insert into public.ta_employee_portal_audit_v61482(
    emp_code,action_type,actor_user_id,actor_email,detail
  ) values (
    public.normalize_emp_code(v_row.emp_code),
    'MANAGER_REQUEST_RETURNED_V61520',
    auth.uid(),v_actor_email,
    jsonb_build_object(
      'request_id',v_row.request_id,
      'request_no',v_row.request_no,
      'request_type',v_row.request_type,
      'request_subtype',v_row.request_subtype,
      'note',v_note,
      'return_count',v_return_count,
      'version','V6.15.20'
    )
  );

  return to_jsonb(v_row)||jsonb_build_object('returned',true,'version','V6.15.20');
end;
$$;

revoke all on function public.ta_return_employee_request_v61519(uuid,text)
from public,anon,authenticated;
grant execute on function public.ta_return_employee_request_v61519(uuid,text)
to authenticated;

notify pgrst,'reload schema';
commit;
