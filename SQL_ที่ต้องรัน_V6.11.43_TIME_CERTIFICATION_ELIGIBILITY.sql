-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.11.43
-- Time Certification Eligibility Guard
--
-- กติกา:
-- 1) วันหยุด / OFF / วันลา ไม่สามารถรับรองเวลาได้
-- 2) รับรองได้เฉพาะ work_date <= วันที่ปัจจุบัน (Asia/Bangkok)
-- 3) ไม่มีเวลาเข้า / ไม่มีเวลาออก / ไม่มีทั้งคู่ สามารถรับรองได้
-- 4) เวลาสิ้นสุดรับรองยังเกินเวลาสิ้นสุดกะและข้ามวันได้
-- ============================================================================

begin;

set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- 1) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.attendance_workday') is null then
    raise exception 'MISSING_TABLE: attendance_workday';
  end if;

  if to_regclass('public.ta_attendance_calculations') is null then
    raise exception 'MISSING_TABLE: ta_attendance_calculations';
  end if;

  if to_regclass('public.ta_leave_requests') is null then
    raise exception 'MISSING_TABLE: ta_leave_requests';
  end if;

  if to_regclass('public.ta_leave_request_days') is null then
    raise exception 'MISSING_TABLE: ta_leave_request_days';
  end if;

  if to_regclass('public.ta_attendance_certifications') is null then
    raise exception 'MISSING_TABLE: ta_attendance_certifications';
  end if;

  if to_regclass('public.ta_time_certification_reasons') is null then
    raise exception 'MISSING_TABLE: ta_time_certification_reasons';
  end if;

  if to_regprocedure(
    'public._ta_bangkok_today_v6110()'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_bangkok_today_v6110';
  end if;

  if to_regprocedure(
    'public.rebuild_attendance_workday(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: rebuild_attendance_workday';
  end if;

  if to_regprocedure(
    'public.ta_get_schedule_range_v61024(date,date,text,text,text[],text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_get_schedule_range_v61024';
  end if;

  if to_regprocedure(
    'public._ta_refresh_attendance_with_certification_v61139(date,date,text[])'
  ) is null then
    raise exception 'MISSING_V61139: _ta_refresh_attendance_with_certification_v61139';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Replace the same save RPC.
--
-- Flow:
--   Permission / Period
--   -> Date guard
--   -> Leave guard
--   -> Resolve shift
--   -> OFF guard
--   -> Auto rebuild Attendance if missing
--   -> Save certification
--   -> Recalculate Attendance
--
-- Missing punches are NOT a blocking condition.
-- ---------------------------------------------------------------------------
create or replace function public.ta_save_time_certification_v61139(
  p_emp_code text,
  p_work_date date,
  p_certified_start_at timestamp without time zone,
  p_certified_end_at timestamp without time zone,
  p_reason_code text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_access record;
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_reason public.ta_time_certification_reasons%rowtype;
  v_before jsonb;
  v_row public.ta_attendance_certifications%rowtype;

  v_today date;

  v_shift_code text;
  v_shift_start time;
  v_shift_end time;
  v_shift_start_at timestamp without time zone;
  v_shift_end_at timestamp without time zone;
  v_day_type text;
  v_is_public_holiday boolean := false;
  v_is_weekly_off boolean := false;

  v_actual_in timestamp without time zone;
  v_actual_out timestamp without time zone;
  v_first_in time;
  v_last_out time;
  v_source_in date;
  v_source_out date;

  v_recalc jsonb;
  v_email text;
  v_manager_level text;

  v_rebuild_deleted integer := 0;
  v_rebuild_inserted integer := 0;
  v_auto_rebuilt boolean := false;
begin
  select *
  into v_access
  from public._ta_current_access_v681()
  where is_active
  limit 1;

  if not found
     or v_access.role not in ('HR_ADMIN','MANAGER') then
    raise exception 'TIME_CERTIFICATION_PERMISSION_DENIED';
  end if;

  if v_access.role = 'MANAGER'
     and v_emp = public.normalize_emp_code(v_access.emp_code) then
    raise exception 'MANAGER_CANNOT_CERTIFY_OWN_ATTENDANCE';
  end if;

  perform public._ta_assert_system_period_action_v6110(
    p_work_date,
    'ATTENDANCE_CERTIFY'
  );

  if not public.ta_can_access_employee_v680(
    v_emp,
    p_work_date,
    'CERTIFY_ATTENDANCE'
  ) then
    raise exception 'TIME_CERTIFICATION_SCOPE_DENIED';
  end if;

  -- -------------------------------------------------------------------------
  -- Current-date guard.
  -- Only the work date is capped at today.
  -- certified_end_at may still be the next day for night shifts.
  -- -------------------------------------------------------------------------
  v_today := public._ta_bangkok_today_v6110();

  if p_work_date > v_today then
    raise exception
      'TIME_CERTIFICATION_FUTURE_DATE_NOT_ALLOWED: % > %',
      p_work_date,
      v_today;
  end if;

  if p_certified_start_at is null
     or p_certified_end_at is null then
    raise exception 'TIME_CERTIFICATION_TIME_REQUIRED';
  end if;

  if p_certified_end_at <= p_certified_start_at then
    raise exception 'TIME_CERTIFICATION_END_MUST_BE_AFTER_START';
  end if;

  -- -------------------------------------------------------------------------
  -- Leave guard.
  -- Any approved leave unit on the work date blocks Time Certification.
  -- This includes full-day and partial leave.
  -- -------------------------------------------------------------------------
  if exists (
    select 1
    from public.ta_leave_requests lr
    join public.ta_leave_request_days ld
      on ld.request_id = lr.id
    where public.normalize_emp_code(lr.emp_code) = v_emp
      and ld.leave_date = p_work_date
      and upper(coalesce(lr.status,'')) = 'APPROVED'
      and coalesce(ld.leave_units,0) > 0
  )
  or exists (
    select 1
    from public.ta_attendance_calculations c
    where public.normalize_emp_code(c.emp_code) = v_emp
      and c.work_date = p_work_date
      and (
        c.leave_request_id is not null
        or nullif(trim(coalesce(c.leave_type_code,'')),'') is not null
        or upper(coalesce(c.day_type,'')) = 'LEAVE'
        or upper(coalesce(c.calculation_status,'')) like 'LEAVE%'
        or upper(coalesce(c.calculation_status,'')) like 'PARTIAL_LEAVE%'
      )
  ) then
    raise exception
      'TIME_CERTIFICATION_LEAVE_NOT_ALLOWED: % | %',
      v_emp,
      p_work_date;
  end if;

  select *
  into v_reason
  from public.ta_time_certification_reasons
  where reason_code =
      upper(trim(coalesce(p_reason_code,'')))
    and is_active;

  if not found then
    raise exception 'TIME_CERTIFICATION_REASON_NOT_ACTIVE';
  end if;

  if v_reason.requires_note
     and nullif(trim(coalesce(p_note,'')),'') is null then
    raise exception 'TIME_CERTIFICATION_NOTE_REQUIRED';
  end if;

  -- Resolve the effective shift/day.
  select
    r.effective_shift_code,
    r.shift_start_time,
    r.shift_end_time,
    upper(trim(coalesce(r.day_type,''))),
    coalesce(r.is_public_holiday,false),
    coalesce(r.is_weekly_off,false)
  into
    v_shift_code,
    v_shift_start,
    v_shift_end,
    v_day_type,
    v_is_public_holiday,
    v_is_weekly_off
  from public.ta_get_schedule_range_v61024(
    p_work_date,
    p_work_date,
    null,
    null,
    array[v_emp]::text[],
    null
  ) r
  where public.normalize_emp_code(r.emp_code) = v_emp
    and r.work_date = p_work_date
  limit 1;

  -- -------------------------------------------------------------------------
  -- OFF / holiday guard.
  -- -------------------------------------------------------------------------
  if upper(trim(coalesce(v_shift_code,''))) in ('OFF','HOL','LV')
     or coalesce(v_is_weekly_off,false)
     or coalesce(v_is_public_holiday,false)
     or coalesce(v_day_type,'') in (
       'WEEKLY_OFF',
       'COMP_OFF',
       'DAY_OFF',
       'HOLIDAY',
       'PUBLIC_HOLIDAY',
       'LEAVE'
     ) then
    raise exception
      'TIME_CERTIFICATION_OFF_NOT_ALLOWED: % | % | %',
      v_emp,
      p_work_date,
      coalesce(v_shift_code,v_day_type,'OFF');
  end if;

  if v_shift_start is null
     or v_shift_end is null then
    raise exception 'TIME_CERTIFICATION_SHIFT_REQUIRED';
  end if;

  v_shift_start_at :=
    (p_work_date + v_shift_start)::timestamp;

  v_shift_end_at :=
    (p_work_date + v_shift_end)::timestamp
    + case
        when v_shift_end <= v_shift_start
          then interval '1 day'
        else interval '0 day'
      end;

  -- Start cannot be earlier than shift start.
  -- End is intentionally allowed to be later than shift end.
  if p_certified_start_at < v_shift_start_at then
    raise exception
      'TIME_CERTIFICATION_START_BEFORE_SHIFT: % | %',
      p_certified_start_at,
      v_shift_start_at;
  end if;

  -- -------------------------------------------------------------------------
  -- Missing IN / OUT is allowed.
  -- If attendance_workday is not present, create it automatically first.
  -- -------------------------------------------------------------------------
  if not exists (
    select 1
    from public.attendance_workday aw
    where public.normalize_emp_code(aw.emp_code) = v_emp
      and aw.work_date = p_work_date
  ) then
    select
      coalesce(r.deleted_rows,0),
      coalesce(r.inserted_rows,0)
    into
      v_rebuild_deleted,
      v_rebuild_inserted
    from public.rebuild_attendance_workday(
      p_work_date,
      p_work_date,
      array[v_emp]::text[]
    ) r;

    v_auto_rebuilt := true;
  end if;

  select
    aw.first_in,
    aw.last_out,
    aw.source_in_date,
    aw.source_out_date
  into
    v_first_in,
    v_last_out,
    v_source_in,
    v_source_out
  from public.attendance_workday aw
  where public.normalize_emp_code(aw.emp_code) = v_emp
    and aw.work_date = p_work_date
  limit 1;

  if not found then
    raise exception
      'ATTENDANCE_DAY_STILL_NOT_FOUND_AFTER_REBUILD: % | %',
      v_emp,
      p_work_date;
  end if;

  -- No requirement that first_in or last_out must exist.
  if v_first_in is not null then
    v_actual_in :=
      (
        coalesce(v_source_in,p_work_date)
        + v_first_in
      )::timestamp;
  end if;

  if v_last_out is not null then
    v_actual_out :=
      (
        coalesce(
          v_source_out,
          p_work_date
          + case
              when v_first_in is not null
               and v_last_out < v_first_in
                then 1
              else 0
            end
        )
        + v_last_out
      )::timestamp;
  end if;

  select to_jsonb(c)
  into v_before
  from public.ta_attendance_certifications c
  where public.normalize_emp_code(c.emp_code) = v_emp
    and c.work_date = p_work_date;

  v_email :=
    coalesce(
      nullif(trim(v_access.email),''),
      auth.jwt()->>'email'
    );

  select
    nullif(
      upper(
        trim(
          coalesce(
            to_jsonb(p)->>'manager_level',
            ''
          )
        )
      ),
      ''
    )
  into v_manager_level
  from public.ta_user_profiles p
  where p.user_id = auth.uid()
  limit 1;

  insert into public.ta_attendance_certifications(
    emp_code,
    work_date,
    status,
    certification_note,
    certified_by,
    certified_role,
    certified_manager_level,
    certified_at,
    revoked_by,
    revoked_at,
    revoke_note,
    updated_at,
    certified_start_at,
    certified_end_at,
    reason_id,
    reason_code_snapshot,
    reason_name_snapshot,
    shift_code_snapshot,
    shift_start_at_snapshot,
    shift_end_at_snapshot,
    actual_in_at_snapshot,
    actual_out_at_snapshot,
    certified_by_email,
    certification_version
  )
  values(
    v_emp,
    p_work_date,
    'CERTIFIED',
    nullif(trim(coalesce(p_note,'')),''),
    auth.uid(),
    v_access.role,
    v_manager_level,
    now(),
    null,
    null,
    null,
    now(),
    p_certified_start_at,
    p_certified_end_at,
    v_reason.reason_id,
    v_reason.reason_code,
    v_reason.reason_name,
    v_shift_code,
    v_shift_start_at,
    v_shift_end_at,
    v_actual_in,
    v_actual_out,
    v_email,
    'V6.11.43'
  )
  on conflict(emp_code,work_date)
  do update set
    status = 'CERTIFIED',
    certification_note = excluded.certification_note,
    certified_by = excluded.certified_by,
    certified_role = excluded.certified_role,
    certified_manager_level = excluded.certified_manager_level,
    certified_at = excluded.certified_at,
    revoked_by = null,
    revoked_at = null,
    revoke_note = null,
    updated_at = now(),
    certified_start_at = excluded.certified_start_at,
    certified_end_at = excluded.certified_end_at,
    reason_id = excluded.reason_id,
    reason_code_snapshot = excluded.reason_code_snapshot,
    reason_name_snapshot = excluded.reason_name_snapshot,
    shift_code_snapshot = excluded.shift_code_snapshot,
    shift_start_at_snapshot = excluded.shift_start_at_snapshot,
    shift_end_at_snapshot = excluded.shift_end_at_snapshot,
    actual_in_at_snapshot = excluded.actual_in_at_snapshot,
    actual_out_at_snapshot = excluded.actual_out_at_snapshot,
    certified_by_email = excluded.certified_by_email,
    certification_version = 'V6.11.43'
  returning *
  into v_row;

  insert into public.ta_time_certification_audit(
    certification_id,
    emp_code,
    work_date,
    action_type,
    before_data,
    after_data,
    changed_by,
    changed_by_email,
    changed_role,
    note
  )
  values(
    v_row.id,
    v_emp,
    p_work_date,
    case
      when v_before is null then 'CREATE'
      else 'UPDATE'
    end,
    v_before,
    to_jsonb(v_row),
    auth.uid(),
    v_email,
    v_access.role,
    p_note
  );

  v_recalc :=
    public._ta_refresh_attendance_with_certification_v61139(
      p_work_date,
      p_work_date,
      array[v_emp]::text[]
    );

  return
    to_jsonb(v_row)
    || jsonb_build_object(
      'attendance_recalculation',v_recalc,
      'attendance_day_auto_rebuilt',v_auto_rebuilt,
      'rebuild_deleted_rows',v_rebuild_deleted,
      'rebuild_inserted_rows',v_rebuild_inserted,
      'missing_in_allowed',true,
      'missing_out_allowed',true,
      'future_work_date_blocked',true,
      'off_leave_blocked',true,
      'version','V6.11.43'
    );
end;
$$;

revoke all on function
  public.ta_save_time_certification_v61139(
    text,
    date,
    timestamp without time zone,
    timestamp without time zone,
    text,
    text
  )
from public;

grant execute on function
  public.ta_save_time_certification_v61139(
    text,
    date,
    timestamp without time zone,
    timestamp without time zone,
    text,
    text
  )
to authenticated;

notify pgrst, 'reload schema';

commit;
