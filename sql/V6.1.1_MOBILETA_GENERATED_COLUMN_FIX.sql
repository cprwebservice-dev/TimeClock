-- =====================================================================
-- Time-Clock Enterprise V6.1.1
-- MobileTA import fix for generated column: time_logs.normalized_mode
--
-- Cause:
--   normalized_mode is a GENERATED ALWAYS column. PostgreSQL does not allow
--   INSERT/UPDATE with an explicit value (including NULL).
--
-- Fix:
--   1) Do not include normalized_mode in INSERT.
--   2) Classify IN/OUT by updating writable column inout_mode.
--      normalized_mode will be recalculated automatically by PostgreSQL.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Import chunk: remove normalized_mode from INSERT target
-- ---------------------------------------------------------------------
create or replace function public.ta_import_mobileta_chunk(
  p_batch_id uuid,
  p_rows jsonb
)
returns table (
  received_rows integer,
  inserted_rows integer,
  duplicate_rows integer,
  invalid_rows integer,
  unmatched_rows integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_received integer := 0;
  v_valid integer := 0;
  v_inserted integer := 0;
  v_invalid integer := 0;
  v_unmatched integer := 0;
  v_duplicates integer := 0;
  v_new_emp_codes text[] := '{}'::text[];
  v_chunk_min date;
  v_chunk_max date;
begin
  perform public._ta_require_hr_admin();

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'ROWS_MUST_BE_JSON_ARRAY';
  end if;

  if not exists (
    select 1
    from public.ta_time_import_batches b
    where b.id = p_batch_id
      and b.status = 'UPLOADING'
  ) then
    raise exception 'IMPORT_BATCH_NOT_AVAILABLE';
  end if;

  v_received := jsonb_array_length(p_rows);
  if v_received = 0 then
    return query select 0,0,0,0,0;
    return;
  end if;

  with raw_rows as (
    select *
    from jsonb_to_recordset(p_rows) as x(
      source_row_no integer,
      raw_mode text,
      emp_code text,
      inout_date text,
      inout_time text
    )
  ), parsed as (
    select
      source_row_no,
      upper(coalesce(nullif(trim(raw_mode),''),'ALL')) as raw_mode,
      trim(emp_code) as raw_emp_code,
      case
        when trim(emp_code) ~ '^\d{1,20}$'
          then public.normalize_emp_code(trim(emp_code))
        else null
      end as emp_code,
      public._ta_try_iso_date(inout_date) as log_date,
      public._ta_try_hms_time(inout_time) as log_time
    from raw_rows
  )
  select
    count(*) filter (
      where emp_code is not null
        and log_date is not null
        and log_time is not null
    )::integer,
    count(*) filter (
      where emp_code is null
         or log_date is null
         or log_time is null
    )::integer,
    min(log_date) filter (
      where emp_code is not null
        and log_date is not null
        and log_time is not null
    ),
    max(log_date) filter (
      where emp_code is not null
        and log_date is not null
        and log_time is not null
    ),
    coalesce(
      array_agg(distinct emp_code) filter (
        where emp_code is not null
          and log_date is not null
          and log_time is not null
      ),
      '{}'::text[]
    )
  into v_valid, v_invalid, v_chunk_min, v_chunk_max, v_new_emp_codes
  from parsed;

  with raw_rows as (
    select *
    from jsonb_to_recordset(p_rows) as x(
      source_row_no integer,
      raw_mode text,
      emp_code text,
      inout_date text,
      inout_time text
    )
  ), parsed as (
    select
      source_row_no,
      upper(coalesce(nullif(trim(raw_mode),''),'ALL')) as raw_mode,
      trim(emp_code) as raw_emp_code,
      case
        when trim(emp_code) ~ '^\d{1,20}$'
          then public.normalize_emp_code(trim(emp_code))
      end as emp_code,
      public._ta_try_iso_date(inout_date) as log_date,
      public._ta_try_hms_time(inout_time) as log_time
    from raw_rows
  ), valid_rows as (
    select *,
      md5(
        'MOBILETA_TEXT|' || emp_code || '|' ||
        log_date::text || '|' || log_time::text
      ) as row_hash
    from parsed
    where emp_code is not null
      and log_date is not null
      and log_time is not null
  )
  select count(*)::integer
  into v_unmatched
  from valid_rows v
  where not exists (
    select 1
    from public.employees e
    where public.normalize_emp_code(e."EmployeeId") = v.emp_code
  );

  with raw_rows as (
    select *
    from jsonb_to_recordset(p_rows) as x(
      source_row_no integer,
      raw_mode text,
      emp_code text,
      inout_date text,
      inout_time text
    )
  ), parsed as (
    select
      source_row_no,
      upper(coalesce(nullif(trim(raw_mode),''),'ALL')) as raw_mode,
      trim(emp_code) as raw_emp_code,
      case
        when trim(emp_code) ~ '^\d{1,20}$'
          then public.normalize_emp_code(trim(emp_code))
      end as emp_code,
      public._ta_try_iso_date(inout_date) as log_date,
      public._ta_try_hms_time(inout_time) as log_time
    from raw_rows
  ), valid_rows as (
    select *,
      md5(
        'MOBILETA_TEXT|' || emp_code || '|' ||
        log_date::text || '|' || log_time::text
      ) as row_hash
    from parsed
    where emp_code is not null
      and log_date is not null
      and log_time is not null
  )
  insert into public.time_logs (
    emp_code,
    full_name_snapshot,
    position_snapshot,
    department_snapshot,
    area_snapshot,
    sub_area_snapshot,
    car_team_snapshot,
    manager_department_snapshot,
    manager_division_snapshot,
    pc_snapshot,
    inout_date,
    inout_time,
    inout_mode,
    verify_mode,
    source_sheet,
    source_file,
    source_row_no,
    raw_data,
    source_hash,
    import_batch_id,
    created_at
  )
  select
    v.emp_code,
    e.full_name,
    e.position_name,
    e.department,
    e.area,
    e.sub_area,
    e.car_team,
    e.manager_department,
    e.manager_division,
    e.pc,
    v.log_date,
    v.log_time,
    v.raw_mode,
    'MOBILETA_TEXT',
    'MobileTA',
    b.file_name,
    v.source_row_no,
    jsonb_build_object(
      'source','MOBILETA_TEXT',
      'raw_mode',v.raw_mode,
      'raw_emp_code',v.raw_emp_code,
      'parsed_emp_code',v.emp_code,
      'import_batch_id',p_batch_id
    ),
    v.row_hash,
    p_batch_id,
    now()
  from valid_rows v
  cross join lateral (
    select file_name
    from public.ta_time_import_batches
    where id = p_batch_id
  ) b
  left join lateral (
    select
      x.full_name,
      x.position_name,
      x.department,
      x.area,
      x.sub_area,
      x.car_team,
      x.manager_department,
      x.manager_division,
      x.pc
    from public.employees x
    where public.normalize_emp_code(x."EmployeeId") = v.emp_code
    limit 1
  ) e on true
  where not exists (
    select 1
    from public.time_logs existing
    where existing.source_hash = v.row_hash
  )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  v_duplicates := greatest(v_valid - v_inserted,0);

  if v_invalid > 0 then
    with raw_rows as (
      select *
      from jsonb_to_recordset(p_rows) as x(
        source_row_no integer,
        raw_mode text,
        emp_code text,
        inout_date text,
        inout_time text
      )
    ), checked as (
      select *,
        trim(emp_code) ~ '^\d{1,20}$' as emp_ok,
        public._ta_try_iso_date(inout_date) is not null as date_ok,
        public._ta_try_hms_time(inout_time) is not null as time_ok
      from raw_rows
    )
    insert into public.ta_time_import_errors (
      batch_id,
      source_row_no,
      error_code,
      error_message,
      raw_data
    )
    select
      p_batch_id,
      source_row_no,
      'SERVER_VALIDATION',
      concat_ws(', ',
        case when not emp_ok then 'รหัสพนักงานไม่ถูกต้อง' end,
        case when not date_ok then 'วันที่ไม่ถูกต้อง' end,
        case when not time_ok then 'เวลาไม่ถูกต้อง' end
      ),
      jsonb_build_object(
        'raw_mode',raw_mode,
        'emp_code',emp_code,
        'inout_date',inout_date,
        'inout_time',inout_time
      )
    from checked
    where not emp_ok or not date_ok or not time_ok;
  end if;

  update public.ta_time_import_batches b
  set inserted_rows = b.inserted_rows + v_inserted,
      existing_duplicate_rows = b.existing_duplicate_rows + v_duplicates,
      invalid_rows = b.invalid_rows + v_invalid,
      unmatched_employee_rows = b.unmatched_employee_rows + v_unmatched,
      min_date = least(
        coalesce(b.min_date,v_chunk_min),
        coalesce(v_chunk_min,b.min_date)
      ),
      max_date = greatest(
        coalesce(b.max_date,v_chunk_max),
        coalesce(v_chunk_max,b.max_date)
      ),
      emp_codes = coalesce((
        select array_agg(distinct code order by code)
        from unnest(
          coalesce(b.emp_codes,'{}'::text[]) ||
          coalesce(v_new_emp_codes,'{}'::text[])
        ) code
      ),'{}'::text[]),
      updated_at = now()
  where b.id = p_batch_id;

  return query
  select v_received, v_inserted, v_duplicates, v_invalid, v_unmatched;
exception
  when others then
    update public.ta_time_import_batches
    set status = 'FAILED',
        error_message = sqlerrm,
        updated_at = now()
    where id = p_batch_id;
    raise;
end;
$$;

grant execute on function public.ta_import_mobileta_chunk(uuid,jsonb)
  to authenticated;

-- ---------------------------------------------------------------------
-- 2) Reclassify: update inout_mode, not generated normalized_mode
-- ---------------------------------------------------------------------
create or replace function public._ta_reclassify_mobileta_logs(
  p_emp_codes text[],
  p_start_date date,
  p_end_date date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
begin
  if p_start_date is null
     or p_end_date is null
     or p_start_date > p_end_date then
    return 0;
  end if;

  with ranked as (
    select
      tl.id,
      tl.emp_code,
      tl.inout_date,
      tl.inout_time,
      count(*) over (
        partition by tl.emp_code, tl.inout_date
      ) as day_count,
      row_number() over (
        partition by tl.emp_code, tl.inout_date
        order by tl.inout_time, tl.id
      ) as rn_first,
      row_number() over (
        partition by tl.emp_code, tl.inout_date
        order by tl.inout_time desc, tl.id desc
      ) as rn_last
    from public.time_logs tl
    where tl.source_sheet = 'MobileTA'
      and (p_emp_codes is null or tl.emp_code = any(p_emp_codes))
      and tl.inout_date between p_start_date and p_end_date
  ), flags as (
    select
      r.*,
      exists (
        select 1
        from public.shift_calendar sc
        join public.shift_master sm
          on sm.shift_code = sc.shift_code
        where sc.emp_code = r.emp_code
          and sc.work_date = r.inout_date - 1
          and coalesce(sm.is_night_shift,false)
          and r.inout_time <= time '12:00:00'
      ) as is_previous_night_out,
      exists (
        select 1
        from public.shift_calendar sc
        join public.shift_master sm
          on sm.shift_code = sc.shift_code
        where sc.emp_code = r.emp_code
          and sc.work_date = r.inout_date
          and coalesce(sm.is_night_shift,false)
          and r.inout_time >= time '12:00:00'
      ) as is_current_night_in
    from ranked r
  ), classified as (
    select
      f.id,
      case
        when f.is_previous_night_out then 'OUT'
        when f.is_current_night_in then 'IN'
        when f.day_count = 1 and f.inout_time < time '12:00:00' then 'IN'
        when f.day_count = 1 then 'OUT'
        when f.rn_first = 1 then 'IN'
        when f.rn_last = 1 then 'OUT'
        when f.inout_time < time '12:00:00' then 'IN'
        else 'OUT'
      end as classified_mode
    from flags f
  )
  update public.time_logs tl
  set inout_mode = c.classified_mode,
      raw_data = coalesce(tl.raw_data,'{}'::jsonb) || jsonb_build_object(
        'mode_classified_at',now(),
        'mode_classifier','V6.1.1_MOBILETA_GENERATED_COLUMN_FIX'
      )
  from classified c
  where tl.id = c.id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public._ta_reclassify_mobileta_logs(text[],date,date)
  from public;

notify pgrst, 'reload schema';

commit;
