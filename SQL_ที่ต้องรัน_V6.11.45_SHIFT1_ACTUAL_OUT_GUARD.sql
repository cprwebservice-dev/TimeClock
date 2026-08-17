-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.11.45
-- Time Certification: Shift-1 Only + Actual OUT Guard
--
-- กติกา:
-- 1) ถ้ามี 2 กะ/2 paid work segments ในวันเดียวกัน รับรองเฉพาะกะที่ 1
-- 2) ถ้ากะที่ 1 มีเวลาออกจริง เวลาสิ้นสุดรับรองห้ามเกินเวลาออกจริง
-- 3) ถ้ากะที่ 1 ไม่มีเวลาออกจริง สามารถระบุเวลาสิ้นสุดรับรองได้
-- 4) เวลาเริ่มรับรองยังต้องไม่ก่อนเวลาเริ่มกะที่ 1
-- 5) กะที่ 2 ใช้ Punch จริง และไม่ถูก Time Certification แทนค่า
-- ============================================================================

begin;

set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- 1) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ta_attendance_certifications') is null then
    raise exception 'MISSING_TABLE: ta_attendance_certifications';
  end if;

  if to_regclass('public.attendance_workday') is null then
    raise exception 'MISSING_TABLE: attendance_workday';
  end if;

  if to_regprocedure(
    'public.ta_get_attendance_shift_punch_meta_v61110(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_get_attendance_shift_punch_meta_v61110';
  end if;

  if to_regprocedure(
    'public._ta_refresh_attendance_calc_core_v630(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_refresh_attendance_calc_core_v630';
  end if;

  if to_regprocedure(
    'public._ta_assert_system_period_action_v6110(date,text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_assert_system_period_action_v6110';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Certification scope is explicitly Shift 1.
-- ---------------------------------------------------------------------------
alter table public.ta_attendance_certifications
  add column if not exists certified_segment_no integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ck_att_cert_segment_1_v61145'
      and conrelid = 'public.ta_attendance_certifications'::regclass
  ) then
    alter table public.ta_attendance_certifications
      add constraint ck_att_cert_segment_1_v61145
      check (certified_segment_no = 1);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Save Time Certification.
--    Preserves V6.11.43 eligibility rules and V6.11.44 System Period rules.
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
    'V6.11.45',
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
    certification_version = 'V6.11.45',
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
      'version','V6.11.45'
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

-- ---------------------------------------------------------------------------
-- 4) Certification-aware Attendance calculation.
--
-- Single-shift day:
--   certified_start/end replace the effective calculation window.
--
-- Two-shift day:
--   Certification applies only to Shift 1.
--   Shift 2 / final OUT remain RAW punch data and are never replaced by
--   certified_end_at.
-- ---------------------------------------------------------------------------
create or replace function public._ta_refresh_attendance_with_certification_v61139(
  p_start_date date,
  p_end_date date,
  p_emp_codes text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base jsonb;
  v_overlay jsonb;
  v_cert_count integer := 0;
  v_stale_count integer := 0;
  r record;

  v_first_in time;
  v_last_out time;
  v_source_in date;
  v_source_out date;
  v_meta jsonb;
  v_calc_meta jsonb;

  v_current_shift_code text;
  v_current_shift_start time;
  v_current_shift_end time;
  v_shift_match boolean;

  v_paid_segment_count integer := 0;
  v_shift2_planned_start_at timestamp without time zone;
  v_has_second_shift boolean := false;

  v_before jsonb;
  v_after jsonb;
begin
  v_base :=
    public._ta_refresh_attendance_calc_core_v630(
      p_start_date,
      p_end_date,
      p_emp_codes
    );

  for r in
    select c.*
    from public.ta_attendance_certifications c
    where c.status = 'CERTIFIED'
      and coalesce(c.certified_segment_no,1) = 1
      and c.certified_start_at is not null
      and c.certified_end_at is not null
      and c.work_date between p_start_date and p_end_date
      and (
        p_emp_codes is null
        or public.normalize_emp_code(c.emp_code) = any(
          array(
            select public.normalize_emp_code(u.emp_code)
            from unnest(p_emp_codes) as u(emp_code)
            where nullif(public.normalize_emp_code(u.emp_code),'') is not null
          )
        )
      )
    order by c.work_date,c.emp_code
  loop
    select
      aw.first_in,
      aw.last_out,
      aw.source_in_date,
      aw.source_out_date,
      aw.raw_meta,
      upper(trim(coalesce(aw.shift_code,''))),
      aw.shift_start_time,
      aw.shift_end_time
    into
      v_first_in,
      v_last_out,
      v_source_in,
      v_source_out,
      v_meta,
      v_current_shift_code,
      v_current_shift_start,
      v_current_shift_end
    from public.attendance_workday aw
    where public.normalize_emp_code(aw.emp_code)
        = public.normalize_emp_code(r.emp_code)
      and aw.work_date = r.work_date
    for update;

    if not found then
      continue;
    end if;

    v_shift_match :=
      nullif(upper(trim(coalesce(r.shift_code_snapshot,''))),'')
        is not distinct from nullif(v_current_shift_code,'')
      and r.shift_start_at_snapshot is not null
      and r.shift_end_at_snapshot is not null
      and v_current_shift_start is not null
      and v_current_shift_end is not null
      and r.shift_start_at_snapshot::time
        is not distinct from v_current_shift_start
      and r.shift_end_at_snapshot::time
        is not distinct from v_current_shift_end;

    if not v_shift_match then
      v_before := to_jsonb(r);

      update public.ta_attendance_certifications
      set
        status = 'STALE',
        updated_at = now()
      where id = r.id
        and status = 'CERTIFIED';

      if found then
        select to_jsonb(c)
        into v_after
        from public.ta_attendance_certifications c
        where c.id = r.id;
      else
        v_after := null;
      end if;

      if v_after is not null then
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
          r.id,
          r.emp_code,
          r.work_date,
          'STALE_SHIFT_MISMATCH',
          v_before,
          v_after,
          auth.uid(),
          nullif(trim(coalesce(auth.jwt()->>'email','')),''),
          null,
          'กะปัจจุบันไม่ตรงกับกะที่ใช้ตอนรับรอง จึงไม่นำเวลารับรองเดิมมาคำนวณ'
        );
      end if;

      v_stale_count := v_stale_count + 1;
      continue;
    end if;

    select
      coalesce(m.paid_segment_count,0),
      m.shift_2_planned_start_at
    into
      v_paid_segment_count,
      v_shift2_planned_start_at
    from public.ta_get_attendance_shift_punch_meta_v61110(
      r.work_date,
      r.work_date,
      array[r.emp_code]::text[]
    ) m
    where public.normalize_emp_code(m.emp_code)
        = public.normalize_emp_code(r.emp_code)
      and m.work_date = r.work_date
    limit 1;

    v_has_second_shift :=
      coalesce(v_paid_segment_count,0) > 1
      or v_shift2_planned_start_at is not null;

    perform set_config(
      'ta.certification_overlay_v61139',
      'on',
      true
    );

    if v_has_second_shift then
      -- Shift 1 only:
      -- Certified start may fill/replace the first punch,
      -- but Shift 2 and the final RAW OUT remain untouched.
      update public.attendance_workday
      set
        first_in = r.certified_start_at::time,
        source_in_date = r.certified_start_at::date,
        last_out = v_last_out,
        source_out_date = v_source_out,
        updated_at = now()
      where public.normalize_emp_code(emp_code)
          = public.normalize_emp_code(r.emp_code)
        and work_date = r.work_date;
    else
      update public.attendance_workday
      set
        first_in = r.certified_start_at::time,
        source_in_date = r.certified_start_at::date,
        last_out = r.certified_end_at::time,
        source_out_date = r.certified_end_at::date,
        updated_at = now()
      where public.normalize_emp_code(emp_code)
          = public.normalize_emp_code(r.emp_code)
        and work_date = r.work_date;
    end if;

    v_overlay :=
      public._ta_refresh_attendance_calc_core_v630(
        r.work_date,
        r.work_date,
        array[r.emp_code]::text[]
      );

    select raw_meta
    into v_calc_meta
    from public.ta_attendance_calculations
    where public.normalize_emp_code(emp_code)
        = public.normalize_emp_code(r.emp_code)
      and work_date = r.work_date;

    update public.attendance_workday
    set
      first_in = v_first_in,
      last_out = v_last_out,
      source_in_date = v_source_in,
      source_out_date = v_source_out,
      raw_meta =
        coalesce(v_calc_meta,v_meta,'{}'::jsonb)
        || jsonb_build_object(
          'time_certification_active',true,
          'time_certification_id',r.id,
          'certified_start_at',r.certified_start_at,
          'certified_end_at',r.certified_end_at,
          'certification_reason_code',r.reason_code_snapshot,
          'certification_segment_no',1,
          'certification_scope',
            case
              when v_has_second_shift then 'SHIFT_1_ONLY'
              else 'SINGLE_SHIFT'
            end,
          'shift_2_preserved_raw',
            v_has_second_shift,
          'certification_version','V6.11.45'
        ),
      updated_at = now()
    where public.normalize_emp_code(emp_code)
        = public.normalize_emp_code(r.emp_code)
      and work_date = r.work_date;

    update public.ta_attendance_calculations
    set
      raw_meta =
        coalesce(raw_meta,'{}'::jsonb)
        || jsonb_build_object(
          'time_certification_active',true,
          'time_certification_id',r.id,
          'certified_start_at',r.certified_start_at,
          'certified_end_at',r.certified_end_at,
          'certification_reason_code',r.reason_code_snapshot,
          'certification_segment_no',1,
          'certification_scope',
            case
              when v_has_second_shift then 'SHIFT_1_ONLY'
              else 'SINGLE_SHIFT'
            end,
          'shift_2_preserved_raw',
            v_has_second_shift,
          'certification_version','V6.11.45'
        ),
      calculated_at = now()
    where public.normalize_emp_code(emp_code)
        = public.normalize_emp_code(r.emp_code)
      and work_date = r.work_date;

    perform set_config(
      'ta.certification_overlay_v61139',
      'off',
      true
    );

    v_cert_count := v_cert_count + 1;
  end loop;

  perform set_config(
    'ta.certification_overlay_v61139',
    'off',
    true
  );

  return
    coalesce(v_base,'{}'::jsonb)
    || jsonb_build_object(
      'certification_overlay_rows',v_cert_count,
      'certification_stale_rows',v_stale_count,
      'certification_segment_no',1,
      'certification_version','V6.11.45'
    );

exception
  when others then
    perform set_config(
      'ta.certification_overlay_v61139',
      'off',
      true
    );
    raise;
end;
$$;

revoke all on function
  public._ta_refresh_attendance_with_certification_v61139(
    date,date,text[]
  )
from public;

notify pgrst, 'reload schema';

commit;
