-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.11.54
-- Time Certification — Canonical Shift Match / False STALE Fix
--
-- ปัญหาที่แก้:
-- Certification snapshot ถูกสร้างจาก ta_get_schedule_range_v61024
-- แต่ V6.11.44/V6.11.45 บางจุดนำไปเทียบกับ attendance_workday หรือ
-- shift_calendar row โดยตรง ทำให้เกิด false mismatch และเปลี่ยนเป็น STALE
-- ทั้งที่ "กะที่มีผลจริง" ไม่ได้เปลี่ยน
--
-- หลักใหม่:
-- ใช้ ta_get_schedule_range_v61024 เป็น Canonical Schedule Source
-- ทั้งตอนรับรอง / ตรวจเปลี่ยนกะ / Recalculate Attendance
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

  if to_regclass('public.ta_time_certification_audit') is null then
    raise exception 'MISSING_TABLE: ta_time_certification_audit';
  end if;

  if to_regclass('public.shift_calendar') is null then
    raise exception 'MISSING_TABLE: shift_calendar';
  end if;

  if to_regprocedure(
    'public.ta_get_schedule_range_v61024(date,date,text,text,text[],text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_get_schedule_range_v61024';
  end if;

  if to_regprocedure(
    'public._ta_refresh_attendance_calc_core_v630(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_refresh_attendance_calc_core_v630';
  end if;

  if to_regprocedure(
    'public.ta_get_attendance_shift_punch_meta_v61110(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_get_attendance_shift_punch_meta_v61110';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Canonical shift matcher
--
-- IMPORTANT:
-- - Uses the same schedule RPC used when certification snapshot is created.
-- - Compares effective shift code + planned start/end.
-- - Normalizes timestamps to minute precision to avoid irrelevant seconds.
-- ---------------------------------------------------------------------------
create or replace function public._ta_certification_shift_match_v61154(
  p_emp_code text,
  p_work_date date,
  p_shift_code_snapshot text,
  p_shift_start_at_snapshot timestamp without time zone,
  p_shift_end_at_snapshot timestamp without time zone
)
returns table(
  is_match boolean,
  current_shift_code text,
  current_shift_start_at timestamp without time zone,
  current_shift_end_at timestamp without time zone
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_code text;
  v_start time;
  v_end time;
  v_current_start timestamp without time zone;
  v_current_end timestamp without time zone;
begin
  select
    nullif(upper(trim(coalesce(r.effective_shift_code,''))),''),
    r.shift_start_time,
    r.shift_end_time
  into
    v_code,
    v_start,
    v_end
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

  if not found
     or v_start is null
     or v_end is null then
    return query
    select
      false,
      v_code,
      null::timestamp without time zone,
      null::timestamp without time zone;
    return;
  end if;

  v_current_start :=
    (p_work_date + v_start)::timestamp without time zone;

  v_current_end :=
    (p_work_date + v_end)::timestamp without time zone
    + case
        when v_end <= v_start
          then interval '1 day'
        else interval '0 day'
      end;

  return query
  select
    (
      nullif(
        upper(trim(coalesce(p_shift_code_snapshot,''))),
        ''
      )
        is not distinct from v_code

      and p_shift_start_at_snapshot is not null
      and p_shift_end_at_snapshot is not null

      and date_trunc(
        'minute',
        p_shift_start_at_snapshot
      )
        is not distinct from date_trunc(
          'minute',
          v_current_start
        )

      and date_trunc(
        'minute',
        p_shift_end_at_snapshot
      )
        is not distinct from date_trunc(
          'minute',
          v_current_end
        )
    ),
    v_code,
    v_current_start,
    v_current_end;
end;
$$;

revoke all on function
  public._ta_certification_shift_match_v61154(
    text,
    date,
    text,
    timestamp without time zone,
    timestamp without time zone
  )
from public;

grant execute on function
  public._ta_certification_shift_match_v61154(
    text,
    date,
    text,
    timestamp without time zone,
    timestamp without time zone
  )
to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Shift calendar trigger
--
-- Old behavior:
-- - DELETE was always treated as changed.
-- - INSERT/UPDATE compared raw shift_calendar.shift_code + shift_master.
--
-- New behavior:
-- - After INSERT/UPDATE/DELETE, resolve the CURRENT EFFECTIVE shift through
--   ta_get_schedule_range_v61024 and compare with certification snapshot.
-- - If effective shift is unchanged, certification remains CERTIFIED.
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
  v_cert public.ta_attendance_certifications%rowtype;
  v_match record;
  v_before jsonb;
  v_after jsonb;
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

  select *
  into v_match
  from public._ta_certification_shift_match_v61154(
    v_emp,
    v_date,
    v_cert.shift_code_snapshot,
    v_cert.shift_start_at_snapshot,
    v_cert.shift_end_at_snapshot
  )
  limit 1;

  if coalesce(v_match.is_match,false) then
    return case when tg_op='DELETE' then old else new end;
  end if;

  v_before := to_jsonb(v_cert);

  update public.ta_attendance_certifications
  set
    status = 'STALE',
    updated_at = now()
  where id = v_cert.id
    and status = 'CERTIFIED'
  returning *
  into v_cert;

  if not found then
    return case when tg_op='DELETE' then old else new end;
  end if;

  v_after := to_jsonb(v_cert);

  v_email := nullif(
    trim(coalesce(auth.jwt()->>'email','')),
    ''
  );

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
    format(
      'กะที่มีผลจริงเปลี่ยนหลังรับรอง | snapshot=%s %s-%s | current=%s %s-%s',
      coalesce(v_cert.shift_code_snapshot,'-'),
      coalesce(to_char(v_cert.shift_start_at_snapshot,'HH24:MI'),'-'),
      coalesce(to_char(v_cert.shift_end_at_snapshot,'HH24:MI'),'-'),
      coalesce(v_match.current_shift_code,'-'),
      coalesce(to_char(v_match.current_shift_start_at,'HH24:MI'),'-'),
      coalesce(to_char(v_match.current_shift_end_at,'HH24:MI'),'-')
    )
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
-- 4) Certification-aware Attendance calculation
--
-- Key fix:
-- DO NOT determine STALE by attendance_workday.shift_code/start/end.
-- attendance_workday is a derived calculation table and may temporarily differ
-- in representation from the canonical schedule.
--
-- Canonical matcher above decides whether the shift really changed.
-- V6.11.45 Shift-1 / 2-shift behavior remains unchanged.
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

  v_match record;

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
    select *
    into v_match
    from public._ta_certification_shift_match_v61154(
      r.emp_code,
      r.work_date,
      r.shift_code_snapshot,
      r.shift_start_at_snapshot,
      r.shift_end_at_snapshot
    )
    limit 1;

    if not coalesce(v_match.is_match,false) then
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
          format(
            'Canonical schedule mismatch | snapshot=%s %s-%s | current=%s %s-%s',
            coalesce(r.shift_code_snapshot,'-'),
            coalesce(to_char(r.shift_start_at_snapshot,'HH24:MI'),'-'),
            coalesce(to_char(r.shift_end_at_snapshot,'HH24:MI'),'-'),
            coalesce(v_match.current_shift_code,'-'),
            coalesce(to_char(v_match.current_shift_start_at,'HH24:MI'),'-'),
            coalesce(to_char(v_match.current_shift_end_at,'HH24:MI'),'-')
          )
        );
      end if;

      v_stale_count := v_stale_count + 1;
      continue;
    end if;

    select
      aw.first_in,
      aw.last_out,
      aw.source_in_date,
      aw.source_out_date,
      aw.raw_meta
    into
      v_first_in,
      v_last_out,
      v_source_in,
      v_source_out,
      v_meta
    from public.attendance_workday aw
    where public.normalize_emp_code(aw.emp_code)
        = public.normalize_emp_code(r.emp_code)
      and aw.work_date = r.work_date
    for update;

    if not found then
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
          'certification_version','V6.11.54'
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
          'certification_version','V6.11.54'
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
      'certification_version','V6.11.54'
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
-- 5) Repair existing FALSE STALE rows
--
-- If current canonical shift is exactly the same as the certified snapshot,
-- the row is reactivated. This fixes records that were marked STALE only
-- because the old comparison source differed.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  v_match record;
  v_before jsonb;
  v_after jsonb;
begin
  for r in
    select c.*
    from public.ta_attendance_certifications c
    where c.status = 'STALE'
      and c.certified_start_at is not null
      and c.certified_end_at is not null
      and c.shift_start_at_snapshot is not null
      and c.shift_end_at_snapshot is not null
    order by c.work_date,c.emp_code
  loop
    select *
    into v_match
    from public._ta_certification_shift_match_v61154(
      r.emp_code,
      r.work_date,
      r.shift_code_snapshot,
      r.shift_start_at_snapshot,
      r.shift_end_at_snapshot
    )
    limit 1;

    if not coalesce(v_match.is_match,false) then
      continue;
    end if;

    v_before := to_jsonb(r);

    update public.ta_attendance_certifications
    set
      status = 'CERTIFIED',
      updated_at = now()
    where id = r.id
      and status = 'STALE';

    if found then
      select to_jsonb(c)
      into v_after
      from public.ta_attendance_certifications c
      where c.id = r.id;
    else
      v_after := null;
    end if;

    if v_after is null then
      continue;
    end if;

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
      'REACTIVATE_FALSE_STALE_V61154',
      v_before,
      v_after,
      auth.uid(),
      nullif(trim(coalesce(auth.jwt()->>'email','')),''),
      null,
      'คืนสถานะ CERTIFIED เพราะกะที่มีผลจริงตรงกับ snapshot เดิม'
    );

    perform public._ta_refresh_attendance_with_certification_v61139(
      r.work_date,
      r.work_date,
      array[r.emp_code]::text[]
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
