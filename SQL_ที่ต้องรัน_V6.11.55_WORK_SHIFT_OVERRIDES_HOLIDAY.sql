-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.11.55
-- Assigned Work Shift Overrides OFF / Public Holiday
--
-- กติกา:
-- 1) วันหยุดประจำสัปดาห์ / วันหยุดนักขัตฤกษ์ ตามปฏิทิน = วันหยุดตามธรรมชาติ
-- 2) ถ้ามี Effective Shift เป็น "กะทำงานจริง" พร้อมเวลาเริ่ม/สิ้นสุด
--    ให้กะที่จัดไว้มีสิทธิ์เหนือสถานะวันหยุด -> ถือเป็นวันทำงาน
-- 3) วันดังกล่าวสามารถ Time Certification ได้
-- 4) ถ้ายังคงเป็น OFF / HOL / ไม่มีช่วงเวลากะทำงาน -> รับรองไม่ได้
-- 5) วันลา ยังคงรับรองไม่ได้
-- ============================================================================

begin;

set local statement_timeout = '0';

do $$
begin
  if to_regprocedure(
    'public.ta_get_schedule_range_v61024(date,date,text,text,text[],text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_get_schedule_range_v61024';
  end if;

  if to_regprocedure(
    'public.ta_get_attendance_shift_punch_meta_v61110(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_get_attendance_shift_punch_meta_v61110';
  end if;

  if to_regprocedure(
    'public._ta_refresh_attendance_with_certification_v61139(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_refresh_attendance_with_certification_v61139';
  end if;
end;
$$;

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
  v_effective_workday boolean := false;

  v_paid_segment_count integer := 0;
  v_shift1_planned_start_at timestamp without time zone;
  v_shift1_planned_end_at timestamp without time zone;
  v_shift1_actual_in_at timestamp without time zone;
  v_shift1_actual_out_at timestamp without time zone;
  v_shift2_planned_start_at timestamp without time zone;
  v_shift2_planned_end_at timestamp without time zone;
  v_shift2_actual_in_at timestamp without time zone;
  v_shift2_actual_out_at timestamp without time zone;
  v_has_second_shift boolean := false;

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

  -- Leave is not certifiable.
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

  -- Resolve scheduled day for OFF / holiday guards.
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

  -- V6.11.55:
  -- Effective working shift overrides natural weekly-off / public-holiday.
  -- Example:
  --   Calendar day = PUBLIC_HOLIDAY
  --   Effective shift = D6 08:30-17:30
  -- => This is a WORKDAY for attendance/certification.
  --
  -- Leave remains non-certifiable.
  if upper(trim(coalesce(v_shift_code,''))) = 'LV'
     or coalesce(v_day_type,'') = 'LEAVE' then
    raise exception
      'TIME_CERTIFICATION_LEAVE_NOT_ALLOWED: % | %',
      v_emp,
      p_work_date;
  end if;

  v_effective_workday :=
    nullif(upper(trim(coalesce(v_shift_code,''))),'') is not null
    and upper(trim(coalesce(v_shift_code,''))) not in ('OFF','HOL','LV')
    and v_shift_start is not null
    and v_shift_end is not null;

  if not v_effective_workday
     and (
       upper(trim(coalesce(v_shift_code,''))) in ('OFF','HOL')
       or coalesce(v_is_weekly_off,false)
       or coalesce(v_is_public_holiday,false)
       or coalesce(v_day_type,'') in (
         'WEEKLY_OFF',
         'COMP_OFF',
         'DAY_OFF',
         'HOLIDAY',
         'PUBLIC_HOLIDAY'
       )
     ) then
    raise exception
      'TIME_CERTIFICATION_OFF_NOT_ALLOWED: % | % | %',
      v_emp,
      p_work_date,
      coalesce(v_shift_code,v_day_type,'OFF');
  end if;

  if not v_effective_workday then
    raise exception 'TIME_CERTIFICATION_SHIFT_REQUIRED';
  end if;

  -- Ensure attendance day exists so segment punch metadata is available.
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

  if not exists (
    select 1
    from public.attendance_workday aw
    where public.normalize_emp_code(aw.emp_code) = v_emp
      and aw.work_date = p_work_date
  ) then
    raise exception
      'ATTENDANCE_DAY_STILL_NOT_FOUND_AFTER_REBUILD: % | %',
      v_emp,
      p_work_date;
  end if;

  -- Shift 1 / Shift 2 are resolved from RAW punch matching.
  select
    coalesce(m.paid_segment_count,0),
    m.shift_1_planned_start_at,
    m.shift_1_planned_end_at,
    m.shift_1_actual_in_at,
    m.shift_1_actual_out_at,
    m.shift_2_planned_start_at,
    m.shift_2_planned_end_at,
    m.shift_2_actual_in_at,
    m.shift_2_actual_out_at
  into
    v_paid_segment_count,
    v_shift1_planned_start_at,
    v_shift1_planned_end_at,
    v_shift1_actual_in_at,
    v_shift1_actual_out_at,
    v_shift2_planned_start_at,
    v_shift2_planned_end_at,
    v_shift2_actual_in_at,
    v_shift2_actual_out_at
  from public.ta_get_attendance_shift_punch_meta_v61110(
    p_work_date,
    p_work_date,
    array[v_emp]::text[]
  ) m
  where public.normalize_emp_code(m.emp_code) = v_emp
    and m.work_date = p_work_date
  limit 1;

  v_has_second_shift :=
    coalesce(v_paid_segment_count,0) > 1
    or v_shift2_planned_start_at is not null
    or v_shift2_planned_end_at is not null;

  -- Prefer Shift-1 planned timestamps from the segment engine.
  v_shift_start_at :=
    coalesce(
      v_shift1_planned_start_at,
      (p_work_date + v_shift_start)::timestamp
    );

  v_shift_end_at :=
    coalesce(
      v_shift1_planned_end_at,
      (p_work_date + v_shift_end)::timestamp
      + case
          when v_shift_end <= v_shift_start
            then interval '1 day'
          else interval '0 day'
        end
    );

  if p_certified_start_at < v_shift_start_at then
    raise exception
      'TIME_CERTIFICATION_START_BEFORE_SHIFT: % | %',
      p_certified_start_at,
      v_shift_start_at;
  end if;

  -- V6.11.45:
  -- If Shift 1 already has a real OUT, certification cannot end after it.
  -- If Shift 1 has no real OUT, no actual-out upper bound is applied.
  if v_shift1_actual_out_at is not null
     and p_certified_end_at > v_shift1_actual_out_at then
    raise exception
      'TIME_CERTIFICATION_END_AFTER_ACTUAL_OUT: % | %',
      p_certified_end_at,
      v_shift1_actual_out_at;
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
    certification_version,
    certified_segment_no
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
    v_shift1_actual_in_at,
    v_shift1_actual_out_at,
    v_email,
    'V6.11.55',
    1
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
    certification_version = 'V6.11.55',
    certified_segment_no = 1
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
    case when v_before is null then 'CREATE' else 'UPDATE' end,
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
      'certified_segment_no',1,
      'has_second_shift',v_has_second_shift,
      'shift_1_actual_out_at',v_shift1_actual_out_at,
      'actual_out_cap_applied',v_shift1_actual_out_at is not null,
      'version','V6.11.55'
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
