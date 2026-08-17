-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.11.44
-- Time Certification: System Period UX + Shift Change Re-certification
--
-- Backend scope:
-- 1) ยืนยันว่า Time Certification ใช้ System Period เดิม
-- 2) เมื่อ "กะจริงเปลี่ยน" หลังรับรอง ให้ Certification = STALE
-- 3) การคำนวณ Attendance จะไม่ใช้ Certification ที่ STALE
-- 4) ป้องกันกรณี snapshot กะไม่ตรง แม้ Trigger ใด ๆ ถูกข้าม
-- 5) การแก้ note / confirm โดยไม่เปลี่ยนกะ ไม่ทำให้ STALE
-- ============================================================================

begin;

set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- 1) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.shift_calendar') is null then
    raise exception 'MISSING_TABLE: shift_calendar';
  end if;

  if to_regclass('public.shift_master') is null then
    raise exception 'MISSING_TABLE: shift_master';
  end if;

  if to_regclass('public.attendance_workday') is null then
    raise exception 'MISSING_TABLE: attendance_workday';
  end if;

  if to_regclass('public.ta_attendance_certifications') is null then
    raise exception 'MISSING_TABLE: ta_attendance_certifications';
  end if;

  if to_regclass('public.ta_time_certification_audit') is null then
    raise exception 'MISSING_TABLE: ta_time_certification_audit';
  end if;

  if to_regprocedure(
    'public._ta_assert_system_period_action_v6110(date,text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_assert_system_period_action_v6110';
  end if;

  if to_regprocedure(
    'public._ta_refresh_attendance_calc_core_v630(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_refresh_attendance_calc_core_v630';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Shift-change invalidation
--
-- A certification is tied to the shift snapshot used at approval time.
-- Only a meaningful shift change invalidates it.
-- ---------------------------------------------------------------------------
create or replace function public._ta_stale_certification_on_shift_v61144()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp text;
  v_date date;
  v_new_code text;
  v_new_start time;
  v_new_end time;
  v_cert record;
  v_before jsonb;
  v_after jsonb;
  v_changed boolean := false;
  v_email text;
  v_role text;
begin
  v_emp := public.normalize_emp_code(
    case
      when tg_op = 'DELETE' then old.emp_code
      else new.emp_code
    end
  );

  v_date := case
    when tg_op = 'DELETE' then old.work_date
    else new.work_date
  end;

  select c.*
  into v_cert
  from public.ta_attendance_certifications c
  where public.normalize_emp_code(c.emp_code) = v_emp
    and c.work_date = v_date
    and c.status = 'CERTIFIED'
  limit 1
  for update;

  if not found then
    return case when tg_op='DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    v_changed := true;
  else
    v_new_code := nullif(upper(trim(coalesce(new.shift_code,''))),'');
    select sm.start_time, sm.end_time
    into v_new_start, v_new_end
    from public.shift_master sm
    where upper(trim(sm.shift_code)) = v_new_code
    limit 1;

    -- Only invalidate if the effective shift definition differs from the snapshot.
    v_changed :=
      nullif(upper(trim(coalesce(v_cert.shift_code_snapshot,''))),'')
        is distinct from v_new_code
      or v_cert.shift_start_at_snapshot is null
      or v_cert.shift_end_at_snapshot is null
      or v_new_start is null
      or v_new_end is null
      or v_cert.shift_start_at_snapshot::time is distinct from v_new_start
      or v_cert.shift_end_at_snapshot::time is distinct from v_new_end;
  end if;

  if not v_changed then
    return case when tg_op='DELETE' then old else new end;
  end if;

  v_before := to_jsonb(v_cert);

  update public.ta_attendance_certifications
  set
    status = 'STALE',
    updated_at = now()
  where id = v_cert.id
  returning *
  into v_cert;

  v_after := to_jsonb(v_cert);

  v_email := nullif(trim(coalesce(auth.jwt()->>'email','')),'');
  select upper(trim(coalesce(p.role,'')))
  into v_role
  from public.ta_user_profiles p
  where p.user_id = auth.uid()
  limit 1;

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
    v_cert.id,
    v_emp,
    v_date,
    'STALE_SHIFT_CHANGED',
    v_before,
    v_after,
    auth.uid(),
    v_email,
    v_role,
    case
      when tg_op='DELETE'
        then 'กะถูกลบหลังการรับรองเวลา'
      else 'กะถูกเปลี่ยนหลังการรับรองเวลา จึงต้องรับรองใหม่'
    end
  );

  return case when tg_op='DELETE' then old else new end;
end;
$$;

revoke all on function
  public._ta_stale_certification_on_shift_v61144()
from public;

drop trigger if exists trg_stale_certification_on_shift_v680
on public.shift_calendar;

drop trigger if exists trg_stale_certification_on_shift_v61144
on public.shift_calendar;

create trigger trg_stale_certification_on_shift_v61144
after insert or update or delete
on public.shift_calendar
for each row
execute function public._ta_stale_certification_on_shift_v61144();

-- ---------------------------------------------------------------------------
-- 3) Certification-aware calculation with defensive shift snapshot validation
--
-- The base calculation always runs from current raw/schedule data first.
-- Only active CERTIFIED rows whose shift snapshot still matches current
-- attendance_workday are overlaid.
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

    perform set_config(
      'ta.certification_overlay_v61139',
      'on',
      true
    );

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
          'certification_version','V6.11.44'
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
          'certification_version','V6.11.44'
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
      'certification_version','V6.11.44'
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

-- ---------------------------------------------------------------------------
-- 4) Keep automatic Attendance calculation certification-aware.
-- ---------------------------------------------------------------------------
create or replace function public._ta_attendance_calc_trigger_v630()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(
    current_setting(
      'ta.certification_overlay_v61139',
      true
    ),
    'off'
  ) = 'on' then
    return new;
  end if;

  if pg_trigger_depth() > 1 then
    return new;
  end if;

  perform public._ta_refresh_attendance_with_certification_v61139(
    new.work_date,
    new.work_date,
    array[new.emp_code]::text[]
  );

  return new;
end;
$$;

revoke all on function
  public._ta_attendance_calc_trigger_v630()
from public;

notify pgrst, 'reload schema';

commit;
