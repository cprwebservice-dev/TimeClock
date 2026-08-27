-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.15.11
-- Employee Portal / Manager — Partial Leave Schedule Overlay
-- ============================================================================
-- หลักการ
-- 1) ลาบางส่วน = Schedule Overlay เท่านั้น ไม่เปลี่ยนกะเดิมเป็น LV
-- 2) ไม่สร้าง Official Leave / ไม่หักโควต้าการลา / ไม่แทน HR Connect
-- 3) Manager Approve + Overlay + Attendance refresh + RESOLVED อยู่ Transaction เดียว
-- 4) รองรับกะข้ามเที่ยงคืน โดยผูกช่วงลากับ Work Date ของกะ
-- 5) Attendance ลด False Late/Early เฉพาะเมื่อช่วงลาครอบต้น/ท้ายกะ
-- 6) Incomplete Punch ยังคงขาดงานตาม Policy เดิม
-- ============================================================================

begin;
set local statement_timeout='0';
select pg_advisory_xact_lock(hashtext('timeclock-v6.15.11-partial-leave-overlay'));

-- ---------------------------------------------------------------------------
-- 0) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ta_employee_requests_v61481') is null then
    raise exception 'MISSING_TABLE: ta_employee_requests_v61481';
  end if;
  if to_regclass('public.ta_attendance_calculations') is null then
    raise exception 'MISSING_TABLE: ta_attendance_calculations';
  end if;
  if to_regclass('public.attendance_workday') is null then
    raise exception 'MISSING_TABLE: attendance_workday';
  end if;
  if to_regprocedure('public.ta_apply_employee_request_v61510(uuid,jsonb,text)') is null then
    raise exception 'MISSING_V6.15.10: ta_apply_employee_request_v61510';
  end if;
  if to_regprocedure('public._ta_request_effective_shift_v61510(text,date)') is null then
    raise exception 'MISSING_V6.15.10: _ta_request_effective_shift_v61510';
  end if;
  if to_regprocedure('public._ta_employee_portal_leave_day_state_v61508(text,date)') is null then
    raise exception 'MISSING_V6.15.08: _ta_employee_portal_leave_day_state_v61508';
  end if;
  if to_regprocedure('public._ta_portal_session_emp_v61482(text)') is null then
    raise exception 'MISSING_FUNCTION: _ta_portal_session_emp_v61482';
  end if;
  if to_regprocedure('public._ta_assert_system_period_action_v6110(date,text)') is null then
    raise exception 'MISSING_FUNCTION: _ta_assert_system_period_action_v6110';
  end if;
  if to_regprocedure('public._ta_bangkok_today_v6110()') is null then
    raise exception 'MISSING_FUNCTION: _ta_bangkok_today_v6110';
  end if;
  if to_regprocedure('public.ta_finalize_schedule_mutation_v61415(jsonb)') is null then
    raise exception 'MISSING_FUNCTION: ta_finalize_schedule_mutation_v61415';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Schedule-only Partial Leave Overlay
-- ---------------------------------------------------------------------------
create table if not exists public.ta_portal_partial_leave_overlays_v61511 (
  overlay_id uuid primary key default gen_random_uuid(),
  employee_request_id uuid not null unique
    references public.ta_employee_requests_v61481(request_id) on delete restrict,
  emp_code text not null,
  work_date date not null,
  leave_type_code text not null,
  leave_type_label text not null,
  leave_start_at timestamp without time zone not null,
  leave_end_at timestamp without time zone not null,
  leave_minutes integer not null,
  shift_code_snapshot text not null,
  shift_start_at_snapshot timestamp without time zone not null,
  shift_end_at_snapshot timestamp without time zone not null,
  work_mode_code_snapshot text,
  is_active boolean not null default true,
  approved_by uuid,
  approved_by_email text,
  approved_at timestamptz,
  revoked_by uuid,
  revoked_by_email text,
  revoked_at timestamptz,
  revoke_note text,
  note text,
  raw_detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_ta_partial_leave_type_v61511
    check (leave_type_code in ('PERSONAL','VACATION')),
  constraint ck_ta_partial_leave_minutes_v61511
    check (leave_minutes > 0),
  constraint ck_ta_partial_leave_window_v61511
    check (leave_end_at > leave_start_at)
);

create unique index if not exists uq_ta_partial_leave_active_emp_date_v61511
  on public.ta_portal_partial_leave_overlays_v61511(emp_code,work_date)
  where is_active=true;

create index if not exists idx_ta_partial_leave_date_v61511
  on public.ta_portal_partial_leave_overlays_v61511(work_date,emp_code)
  where is_active=true;

alter table public.ta_portal_partial_leave_overlays_v61511 enable row level security;
revoke all on table public.ta_portal_partial_leave_overlays_v61511 from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 2) Canonical Partial Leave window resolver
--    - Same function is used by Employee Portal request validation AND Manager Apply.
--    - Cross-midnight is tied to the shift Work Date.
-- ---------------------------------------------------------------------------
create or replace function public._ta_partial_leave_window_v61511(
  p_emp_code text,
  p_work_date date,
  p_leave_type text,
  p_leave_start_time time,
  p_leave_end_time time
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
declare
  v_emp text:=public.normalize_emp_code(p_emp_code);
  v_leave_type text;
  v_leave_label text;
  v_shift_code text;
  v_shift_start time;
  v_shift_end time;
  v_is_workday boolean;
  v_day_type text;
  v_work_mode text;
  v_shift_start_at timestamp without time zone;
  v_shift_end_at timestamp without time zone;
  v_leave_start_at timestamp without time zone;
  v_leave_end_at timestamp without time zone;
  v_minutes integer;
begin
  if nullif(v_emp,'') is null or p_work_date is null then
    raise exception 'PARTIAL_LEAVE_EMPLOYEE_DATE_REQUIRED';
  end if;

  if p_leave_start_time is null or p_leave_end_time is null then
    raise exception 'LEAVE_PARTIAL_TIME_REQUIRED';
  end if;
  if p_leave_start_time=p_leave_end_time then
    raise exception 'LEAVE_PARTIAL_END_AFTER_START_REQUIRED';
  end if;

  v_leave_type:=case upper(trim(coalesce(p_leave_type,'')))
    when 'PERSONAL' then 'PERSONAL'
    when 'ลากิจ' then 'PERSONAL'
    when 'VACATION' then 'VACATION'
    when 'ลาพักร้อน' then 'VACATION'
    else null
  end;

  if v_leave_type is null then
    raise exception 'LEAVE_PARTIAL_NOT_ALLOWED_FOR_TYPE';
  end if;

  v_leave_label:=case v_leave_type
    when 'PERSONAL' then 'ลากิจ'
    when 'VACATION' then 'ลาพักร้อน'
  end;

  -- PH is never eligible for Employee Portal leave, even if an explicit
  -- working shift was later written on the same date.
  if exists(
    select 1 from public.holidays h where h.holiday_date=p_work_date
  ) then
    raise exception 'LEAVE_NOT_ALLOWED_NON_WORKDAY:%:PUBLIC_HOLIDAY',
      to_char(p_work_date,'YYYY-MM-DD');
  end if;

  select
    e.shift_code,e.shift_start_time,e.shift_end_time,e.is_workday,e.day_type,e.work_mode_code
  into
    v_shift_code,v_shift_start,v_shift_end,v_is_workday,v_day_type,v_work_mode
  from public._ta_request_effective_shift_v61510(v_emp,p_work_date) e
  limit 1;

  if nullif(v_shift_code,'') is null or v_shift_start is null or v_shift_end is null then
    raise exception 'PARTIAL_LEAVE_SHIFT_REQUIRED';
  end if;

  if not coalesce(v_is_workday,false)
     or upper(coalesce(v_day_type,''))<>'WORKDAY'
     or upper(v_shift_code) in ('LV','LEAVE','HOL','OFF','OSTD','OS043','OS134','OS135') then
    raise exception 'LEAVE_NOT_ALLOWED_NON_WORKDAY:%:%',
      to_char(p_work_date,'YYYY-MM-DD'),coalesce(v_day_type,'NON_WORKDAY');
  end if;

  v_shift_start_at:=(p_work_date+v_shift_start)::timestamp;
  v_shift_end_at:=(p_work_date+v_shift_end)::timestamp
    + case when v_shift_end<=v_shift_start then interval '1 day' else interval '0 day' end;

  v_leave_start_at:=(p_work_date+p_leave_start_time)::timestamp;
  if v_leave_start_at<v_shift_start_at then
    v_leave_start_at:=v_leave_start_at+interval '1 day';
  end if;

  v_leave_end_at:=(p_work_date+p_leave_end_time)::timestamp;
  while v_leave_end_at<=v_leave_start_at loop
    v_leave_end_at:=v_leave_end_at+interval '1 day';
  end loop;

  if v_leave_start_at<v_shift_start_at or v_leave_end_at>v_shift_end_at then
    raise exception 'PARTIAL_LEAVE_OUTSIDE_SHIFT:%:%:%',
      to_char(v_shift_start_at,'YYYY-MM-DD HH24:MI'),
      to_char(v_shift_end_at,'YYYY-MM-DD HH24:MI'),
      to_char(v_leave_start_at,'YYYY-MM-DD HH24:MI')||'–'||to_char(v_leave_end_at,'YYYY-MM-DD HH24:MI');
  end if;

  if v_leave_start_at=v_shift_start_at and v_leave_end_at=v_shift_end_at then
    raise exception 'PARTIAL_LEAVE_MUST_NOT_COVER_FULL_SHIFT';
  end if;

  v_minutes:=round(extract(epoch from (v_leave_end_at-v_leave_start_at))/60.0)::integer;

  if v_leave_type='PERSONAL' and v_minutes<60 then
    raise exception 'PERSONAL_LEAVE_PARTIAL_MIN_60_MINUTES';
  end if;
  if v_leave_type='VACATION' and v_minutes<180 then
    raise exception 'VACATION_LEAVE_PARTIAL_MIN_180_MINUTES';
  end if;

  return jsonb_build_object(
    'emp_code',v_emp,
    'work_date',p_work_date,
    'leave_type_code',v_leave_type,
    'leave_type_label',v_leave_label,
    'leave_start_at',v_leave_start_at,
    'leave_end_at',v_leave_end_at,
    'leave_start_time',p_leave_start_time,
    'leave_end_time',p_leave_end_time,
    'leave_minutes',v_minutes,
    'shift_code',v_shift_code,
    'shift_start_at',v_shift_start_at,
    'shift_end_at',v_shift_end_at,
    'shift_start_time',v_shift_start,
    'shift_end_time',v_shift_end,
    'work_mode_code',v_work_mode,
    'overlay_scope','PRIMARY_SHIFT',
    'schedule_only',true,
    'official_leave_system','HR Connect',
    'version','V6.15.11'
  );
end;
$$;

revoke all on function public._ta_partial_leave_window_v61511(text,date,text,time,time)
from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- 3) Upgrade Employee Portal leave validator to use the same shift-aware
--    Partial Leave window resolver. Full-day policy remains V6.15.08 behavior.
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
  v_today date:=public._ta_bangkok_today_v6110();
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

  for v_day in
    select d::date from generate_series(v_start,v_end,interval '1 day') d
  loop
    v_day_state:=public._ta_employee_portal_leave_day_state_v61508(v_emp,v_day);
    if not coalesce((v_day_state->>'allowed')::boolean,false) then
      raise exception 'LEAVE_NOT_ALLOWED_NON_WORKDAY:%:%',
        to_char(v_day,'YYYY-MM-DD'),coalesce(v_day_state->>'day_type','NON_WORKDAY');
    end if;
  end loop;

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
    if v_end<>v_start then raise exception 'LEAVE_PARTIAL_SINGLE_DAY_ONLY'; end if;

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
      'leave_schedule_notice_only',true,
      'leave_hr_system','HR Connect',
      'leave_hr_approval_level','หัวหน้างานระดับฝ่าย',
      'leave_policy_version','V6.15.11'
    );
  return new;
end;
$$;

comment on function public._ta_validate_employee_portal_leave_v61508()
is 'V6.15.11 upgrade: keeps V6.15.08 leave policy and adds shift-aware/cross-midnight Partial Leave schedule validation.';

-- ---------------------------------------------------------------------------
-- 4) Attendance overlay trigger
--    Runs after current trg_zz_ta_calc_absence_v664 by trigger-name ordering.
--    It does NOT mark the whole day as LEAVE and does NOT set leave_request_id.
-- ---------------------------------------------------------------------------
create or replace function public._ta_apply_portal_partial_leave_calc_v61511()
returns trigger
language plpgsql
security definer
set search_path=public,pg_catalog
as $$
declare
  v_o public.ta_portal_partial_leave_overlays_v61511%rowtype;
  v_now_shift record;
  v_first_in time;
  v_last_out time;
  v_source_in date;
  v_source_out date;
  v_actual_in timestamp without time zone;
  v_actual_out timestamp without time zone;
  v_effective_start timestamp without time zone;
  v_effective_end timestamp without time zone;
  v_late numeric:=0;
  v_early numeric:=0;
  v_complete boolean:=false;
  v_stale boolean:=false;
begin
  select * into v_o
  from public.ta_portal_partial_leave_overlays_v61511 o
  where public.normalize_emp_code(o.emp_code)=public.normalize_emp_code(new.emp_code)
    and o.work_date=new.work_date
    and o.is_active=true
  order by o.approved_at desc nulls last,o.created_at desc
  limit 1;

  if not found then
    return new;
  end if;

  -- Official/full leave remains authoritative if it exists later in the core system.
  if new.leave_request_id is not null
     or upper(coalesce(new.day_type,''))<>'WORKDAY'
     or coalesce(new.expected_day,0)<>1 then
    new.raw_meta:=coalesce(new.raw_meta,'{}'::jsonb)
      || jsonb_build_object(
        'portal_partial_leave_active',true,
        'portal_partial_leave_overlay_id',v_o.overlay_id,
        'portal_partial_leave_request_id',v_o.employee_request_id,
        'portal_partial_leave_skipped','NON_WORKDAY_OR_OFFICIAL_LEAVE',
        'portal_partial_leave_version','V6.15.11'
      );
    return new;
  end if;

  select * into v_now_shift
  from public._ta_request_effective_shift_v61510(v_o.emp_code,v_o.work_date)
  limit 1;

  v_stale:=
    v_now_shift.shift_code is null
    or v_now_shift.shift_start_time is null
    or v_now_shift.shift_end_time is null
    or upper(trim(coalesce(v_now_shift.shift_code,'')))<>upper(trim(coalesce(v_o.shift_code_snapshot,'')))
    or (v_o.work_date+v_now_shift.shift_start_time)::timestamp<>v_o.shift_start_at_snapshot
    or (
      (v_o.work_date+v_now_shift.shift_end_time)::timestamp
        + case when v_now_shift.shift_end_time<=v_now_shift.shift_start_time then interval '1 day' else interval '0 day' end
    )<>v_o.shift_end_at_snapshot;

  if v_stale then
    new.raw_meta:=coalesce(new.raw_meta,'{}'::jsonb)
      || jsonb_build_object(
        'portal_partial_leave_active',true,
        'portal_partial_leave_stale',true,
        'portal_partial_leave_overlay_id',v_o.overlay_id,
        'portal_partial_leave_request_id',v_o.employee_request_id,
        'portal_partial_leave_version','V6.15.11'
      );
    return new;
  end if;

  select aw.first_in,aw.last_out,aw.source_in_date,aw.source_out_date
  into v_first_in,v_last_out,v_source_in,v_source_out
  from public.attendance_workday aw
  where public.normalize_emp_code(aw.emp_code)=public.normalize_emp_code(new.emp_code)
    and aw.work_date=new.work_date
  limit 1;

  v_complete:=v_first_in is not null and v_last_out is not null;

  if v_first_in is not null then
    v_actual_in:=(coalesce(v_source_in,new.work_date)+v_first_in)::timestamp;
  end if;
  if v_last_out is not null then
    v_actual_out:=(coalesce(
      v_source_out,
      new.work_date + case when v_first_in is not null and v_last_out<v_first_in then 1 else 0 end
    )+v_last_out)::timestamp;
  end if;

  v_effective_start:=new.planned_start_at;
  v_effective_end:=new.planned_end_at;

  -- Leave touching the START of shift moves the late anchor to leave-end.
  if v_effective_start is not null
     and v_o.leave_start_at<=v_effective_start
     and v_o.leave_end_at>v_effective_start then
    v_effective_start:=v_o.leave_end_at;
  end if;

  -- Leave touching the END of shift moves the early-leave anchor to leave-start.
  if v_effective_end is not null
     and v_o.leave_start_at<v_effective_end
     and v_o.leave_end_at>=v_effective_end then
    v_effective_end:=v_o.leave_start_at;
  end if;

  if v_complete then
    v_late:=case
      when v_effective_start is null or v_actual_in is null then 0
      else greatest(0,floor(extract(epoch from (v_actual_in-v_effective_start))/60.0))
    end;
    v_early:=case
      when v_effective_end is null or v_actual_out is null then 0
      else greatest(0,floor(extract(epoch from (v_effective_end-v_actual_out))/60.0))
    end;

    new.late_minutes:=v_late;
    new.early_leave_minutes:=v_early;
    new.absence_minutes:=case when v_late>=30 then v_late else 0 end;
    new.absence_reason:=null;

    new.calculation_status:=case
      when v_late>=30 then 'ABSENT'
      when v_late>=1 and v_late<30 and v_early>0 then 'LATE_AND_EARLY_LEAVE'
      when v_late>=1 and v_late<30 then 'LATE'
      when v_early>0 then 'EARLY_LEAVE'
      when coalesce(new.overtime_minutes,0)>0 then 'OVERTIME'
      else 'NORMAL'
    end;
  end if;

  new.raw_meta:=coalesce(new.raw_meta,'{}'::jsonb)
    || jsonb_build_object(
      'portal_partial_leave_active',true,
      'portal_partial_leave_stale',false,
      'portal_partial_leave_overlay_id',v_o.overlay_id,
      'portal_partial_leave_request_id',v_o.employee_request_id,
      'portal_partial_leave_type',v_o.leave_type_code,
      'portal_partial_leave_start_at',v_o.leave_start_at,
      'portal_partial_leave_end_at',v_o.leave_end_at,
      'portal_partial_leave_minutes',v_o.leave_minutes,
      'portal_partial_leave_shift_code',v_o.shift_code_snapshot,
      'portal_partial_leave_original_planned_start_at',new.planned_start_at,
      'portal_partial_leave_original_planned_end_at',new.planned_end_at,
      'portal_partial_leave_late_anchor_at',v_effective_start,
      'portal_partial_leave_early_anchor_at',v_effective_end,
      'portal_partial_leave_complete_punch_required_for_boundary_adjustment',true,
      'portal_partial_leave_schedule_only',true,
      'portal_partial_leave_official_system','HR Connect',
      'portal_partial_leave_version','V6.15.11'
    );

  return new;
end;
$$;

revoke all on function public._ta_apply_portal_partial_leave_calc_v61511()
from public,anon,authenticated;

drop trigger if exists trg_zzzz_ta_calc_partial_leave_v61511
on public.ta_attendance_calculations;

create trigger trg_zzzz_ta_calc_partial_leave_v61511
before insert or update
on public.ta_attendance_calculations
for each row
execute function public._ta_apply_portal_partial_leave_calc_v61511();

-- ---------------------------------------------------------------------------
-- 5) Employee Portal reader — read-only overlay surface
-- ---------------------------------------------------------------------------
create or replace function public.ta_portal_get_my_partial_leave_overlays_v61511(
  p_session_token text,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_emp text;
  v_start date:=least(p_start_date,p_end_date);
  v_end date:=greatest(p_start_date,p_end_date);
  v_result jsonb;
begin
  v_emp:=public._ta_portal_session_emp_v61482(p_session_token);
  if v_start is null or v_end is null then raise exception 'DATE_RANGE_REQUIRED'; end if;
  if v_end-v_start>62 then raise exception 'PORTAL_DATE_RANGE_MAX_63_DAYS'; end if;

  select coalesce(jsonb_agg(x.obj order by x.work_date),'[]'::jsonb)
  into v_result
  from (
    select
      o.work_date,
      jsonb_build_object(
        'overlay_id',o.overlay_id,
        'employee_request_id',o.employee_request_id,
        'request_no',r.request_no,
        'work_date',o.work_date,
        'leave_type_code',o.leave_type_code,
        'leave_type_label',o.leave_type_label,
        'leave_start_at',o.leave_start_at,
        'leave_end_at',o.leave_end_at,
        'leave_start_time',o.leave_start_at::time,
        'leave_end_time',o.leave_end_at::time,
        'leave_minutes',o.leave_minutes,
        'shift_code_snapshot',o.shift_code_snapshot,
        'shift_start_at_snapshot',o.shift_start_at_snapshot,
        'shift_end_at_snapshot',o.shift_end_at_snapshot,
        'work_mode_code_snapshot',o.work_mode_code_snapshot,
        'reason',r.reason,
        'manager_note',o.note,
        'is_stale',(
          e.shift_code is null
          or e.shift_start_time is null
          or e.shift_end_time is null
          or upper(trim(coalesce(e.shift_code,'')))<>upper(trim(coalesce(o.shift_code_snapshot,'')))
          or (o.work_date+e.shift_start_time)::timestamp<>o.shift_start_at_snapshot
          or (
            (o.work_date+e.shift_end_time)::timestamp
              + case when e.shift_end_time<=e.shift_start_time then interval '1 day' else interval '0 day' end
          )<>o.shift_end_at_snapshot
        ),
        'schedule_only',true,
        'official_leave_system','HR Connect',
        'version','V6.15.11'
      ) as obj
    from public.ta_portal_partial_leave_overlays_v61511 o
    join public.ta_employee_requests_v61481 r
      on r.request_id=o.employee_request_id
    left join lateral public._ta_request_effective_shift_v61510(o.emp_code,o.work_date) e on true
    where public.normalize_emp_code(o.emp_code)=v_emp
      and o.work_date between v_start and v_end
      and o.is_active=true
  ) x;

  return coalesce(v_result,'[]'::jsonb);
end;
$$;

revoke all on function public.ta_portal_get_my_partial_leave_overlays_v61511(text,date,date)
from public,anon,authenticated;
grant execute on function public.ta_portal_get_my_partial_leave_overlays_v61511(text,date,date)
to anon,authenticated;

-- ---------------------------------------------------------------------------
-- 6) Replace V6.15.10 Atomic RPC — PARTIAL_DAY is now a real Atomic action.
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
  v_day_state jsonb;

  v_partial jsonb;
  v_leave_type text;
  v_leave_start_time time;
  v_leave_end_time time;

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
        'version','V6.15.11'
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
          'atomic_version','V6.15.11',
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
      -- Schedule-only overlay: keep the original shift intact.
      -- This action respects the Schedule Edit system period because it changes
      -- how the approved employee schedule is interpreted for Attendance.
      perform public._ta_assert_system_period_action_v6110(
        v_req.work_date,
        'SCHEDULE_EDIT'
      );

      v_leave_type:=upper(trim(coalesce(v_req.detail->>'leave_type','')));
      begin
        v_leave_start_time:=nullif(v_req.detail->>'leave_start_time','')::time;
        v_leave_end_time:=nullif(v_req.detail->>'leave_end_time','')::time;
      exception when others then
        raise exception 'PARTIAL_LEAVE_TIME_INVALID';
      end;

      v_partial:=public._ta_partial_leave_window_v61511(
        v_emp,
        v_req.work_date,
        v_leave_type,
        v_leave_start_time,
        v_leave_end_time
      );

      if exists(
        select 1
        from public.ta_portal_partial_leave_overlays_v61511 o
        where public.normalize_emp_code(o.emp_code)=v_emp
          and o.work_date=v_req.work_date
          and o.is_active=true
          and o.employee_request_id<>v_req.request_id
      ) then
        raise exception 'PARTIAL_LEAVE_ACTIVE_OVERLAY_EXISTS';
      end if;

      insert into public.ta_portal_partial_leave_overlays_v61511(
        employee_request_id,
        emp_code,
        work_date,
        leave_type_code,
        leave_type_label,
        leave_start_at,
        leave_end_at,
        leave_minutes,
        shift_code_snapshot,
        shift_start_at_snapshot,
        shift_end_at_snapshot,
        work_mode_code_snapshot,
        is_active,
        approved_by,
        approved_by_email,
        approved_at,
        note,
        raw_detail,
        updated_at
      ) values (
        v_req.request_id,
        v_emp,
        v_req.work_date,
        v_partial->>'leave_type_code',
        v_partial->>'leave_type_label',
        (v_partial->>'leave_start_at')::timestamp,
        (v_partial->>'leave_end_at')::timestamp,
        (v_partial->>'leave_minutes')::integer,
        v_partial->>'shift_code',
        (v_partial->>'shift_start_at')::timestamp,
        (v_partial->>'shift_end_at')::timestamp,
        nullif(v_partial->>'work_mode_code',''),
        true,
        auth.uid(),
        v_actor_email,
        now(),
        coalesce(v_note,v_req.reason),
        coalesce(v_req.detail,'{}'::jsonb),
        now()
      )
      on conflict(employee_request_id) do update set
        emp_code=excluded.emp_code,
        work_date=excluded.work_date,
        leave_type_code=excluded.leave_type_code,
        leave_type_label=excluded.leave_type_label,
        leave_start_at=excluded.leave_start_at,
        leave_end_at=excluded.leave_end_at,
        leave_minutes=excluded.leave_minutes,
        shift_code_snapshot=excluded.shift_code_snapshot,
        shift_start_at_snapshot=excluded.shift_start_at_snapshot,
        shift_end_at_snapshot=excluded.shift_end_at_snapshot,
        work_mode_code_snapshot=excluded.work_mode_code_snapshot,
        is_active=true,
        approved_by=excluded.approved_by,
        approved_by_email=excluded.approved_by_email,
        approved_at=excluded.approved_at,
        revoked_by=null,
        revoked_by_email=null,
        revoked_at=null,
        revoke_note=null,
        note=excluded.note,
        raw_detail=excluded.raw_detail,
        updated_at=now();

      -- Exact employee/date refresh. If Attendance for a future day is not built
      -- yet the overlay remains persisted and will be applied automatically on
      -- the first calculation through trg_zzzz_ta_calc_partial_leave_v61511.
      v_final:=public.ta_finalize_schedule_mutation_v61415(
        jsonb_build_array(
          jsonb_build_object(
            'emp_code',v_emp,
            'work_date',v_req.work_date
          )
        )
      );

      v_result:=jsonb_build_object(
        'leave_mode','PARTIAL_DAY',
        'overlay',v_partial,
        'shift_calendar_changed',false,
        'schedule_only',true,
        'official_leave_system','HR Connect',
        'schedule_finalizer',v_final
      );
    elsif v_subtype<>'FULL_DAY' then
      raise exception 'LEAVE_REQUEST_SUBTYPE_NOT_SUPPORTED: %',v_subtype;
    else

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
      v_day_state:=public._ta_employee_portal_leave_day_state_v61508(v_emp,v_d);
      if not coalesce((v_day_state->>'allowed')::boolean,false) then
        raise exception 'LEAVE_NOT_ALLOWED_NON_WORKDAY:%:%',
          to_char(v_d,'YYYY-MM-DD'),
          coalesce(v_day_state->>'day_type','NON_WORKDAY');
      end if;

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
    end if;
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
    'version','V6.15.11'
  );
end;
$$;


revoke all on function public.ta_apply_employee_request_v61510(uuid,jsonb,text)
from public,anon,authenticated;
grant execute on function public.ta_apply_employee_request_v61510(uuid,jsonb,text)
to authenticated;

comment on function public.ta_apply_employee_request_v61510(uuid,jsonb,text)
is 'V6.15.11 Atomic Manager workflow: Partial Leave writes a schedule-only overlay, refreshes Attendance and resolves the request in the same transaction while preserving the original shift.';

notify pgrst,'reload schema';
commit;
