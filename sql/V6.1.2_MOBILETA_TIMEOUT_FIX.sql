-- =====================================================================
-- Time-Clock Enterprise V6.1.2
-- MobileTA Import Timeout Fix
--
-- เป้าหมาย
--   1) ลดภาระ RPC นำเข้าทีละ Chunk
--   2) แยกการจำแนก IN/OUT เป็นรายวัน
--   3) แยก Rebuild Attendance เป็นรายวัน ไม่ทำงานหนักในคำสั่งเดียว
--   4) ไม่ Rollback ข้อมูลลงเวลาที่นำเข้าสำเร็จ เพียงเพราะ Rebuild ช้าบางวัน
--   5) รองรับ normalized_mode ที่เป็น GENERATED ALWAYS
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Supporting columns / indexes
-- ---------------------------------------------------------------------
alter table public.ta_time_import_batches
  add column if not exists classified_rows integer not null default 0,
  add column if not exists rebuild_failed_dates date[] not null default '{}'::date[];

create index if not exists idx_time_logs_mobileta_batch_date
  on public.time_logs(import_batch_id, inout_date, emp_code, inout_time, id)
  where source_sheet = 'MobileTA';

create index if not exists idx_time_logs_mobileta_emp_date
  on public.time_logs(emp_code, inout_date, inout_time, id)
  where source_sheet = 'MobileTA';

create index if not exists idx_shift_calendar_emp_work_date
  on public.shift_calendar(emp_code, work_date, shift_code);

-- ---------------------------------------------------------------------
-- 2) Faster chunk import
--    - Parse JSON only once into a temp table
--    - Do not write generated column normalized_mode
--    - Do not rebuild the growing emp_codes array every chunk
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
  v_chunk_min date;
  v_chunk_max date;
begin
  perform public._ta_require_hr_admin();
  perform set_config('statement_timeout', '60000', true);

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

  drop table if exists pg_temp.ta_mobileta_chunk_v612;

  create temporary table ta_mobileta_chunk_v612
  on commit drop
  as
  select
    x.source_row_no,
    upper(coalesce(nullif(trim(x.raw_mode),''),'ALL')) as raw_mode,
    trim(x.emp_code) as raw_emp_code,
    case
      when trim(x.emp_code) ~ '^\d{1,20}$'
        then public.normalize_emp_code(trim(x.emp_code))
      else null
    end as emp_code,
    public._ta_try_iso_date(x.inout_date) as log_date,
    public._ta_try_hms_time(x.inout_time) as log_time
  from jsonb_to_recordset(p_rows) as x(
    source_row_no integer,
    raw_mode text,
    emp_code text,
    inout_date text,
    inout_time text
  );

  alter table pg_temp.ta_mobileta_chunk_v612
    add column row_hash text;

  update pg_temp.ta_mobileta_chunk_v612
  set row_hash = md5(
    'MOBILETA_TEXT|' || emp_code || '|' ||
    log_date::text || '|' || log_time::text
  )
  where emp_code is not null
    and log_date is not null
    and log_time is not null;

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
    )
  into v_valid, v_invalid, v_chunk_min, v_chunk_max
  from pg_temp.ta_mobileta_chunk_v612;

  -- Employee map is built once per distinct employee in this chunk.
  drop table if exists pg_temp.ta_mobileta_employee_map_v612;

  create temporary table ta_mobileta_employee_map_v612
  on commit drop
  as
  select
    c.emp_code,
    e.employee_id,
    e.full_name,
    e.position_name,
    e.department,
    e.area,
    e.sub_area,
    e.car_team,
    e.manager_department,
    e.manager_division,
    e.pc
  from (
    select distinct emp_code
    from pg_temp.ta_mobileta_chunk_v612
    where emp_code is not null
  ) c
  left join lateral (
    select
      x."EmployeeId" as employee_id,
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
    where public.normalize_emp_code(x."EmployeeId") = c.emp_code
    limit 1
  ) e on true;

  select count(*)::integer
  into v_unmatched
  from pg_temp.ta_mobileta_chunk_v612 c
  left join pg_temp.ta_mobileta_employee_map_v612 e
    on e.emp_code = c.emp_code
  where c.emp_code is not null
    and c.log_date is not null
    and c.log_time is not null
    and e.employee_id is null;

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
    c.emp_code,
    e.full_name,
    e.position_name,
    e.department,
    e.area,
    e.sub_area,
    e.car_team,
    e.manager_department,
    e.manager_division,
    e.pc,
    c.log_date,
    c.log_time,
    c.raw_mode,
    'MOBILETA_TEXT',
    'MobileTA',
    b.file_name,
    c.source_row_no,
    jsonb_build_object(
      'source','MOBILETA_TEXT',
      'raw_mode',c.raw_mode,
      'raw_emp_code',c.raw_emp_code,
      'parsed_emp_code',c.emp_code,
      'import_batch_id',p_batch_id
    ),
    c.row_hash,
    p_batch_id,
    now()
  from pg_temp.ta_mobileta_chunk_v612 c
  join public.ta_time_import_batches b
    on b.id = p_batch_id
  left join pg_temp.ta_mobileta_employee_map_v612 e
    on e.emp_code = c.emp_code
  where c.emp_code is not null
    and c.log_date is not null
    and c.log_time is not null
    and not exists (
      select 1
      from public.time_logs existing
      where existing.source_hash = c.row_hash
    )
  on conflict do nothing;

  get diagnostics v_inserted = row_count;
  v_duplicates := greatest(v_valid - v_inserted, 0);

  if v_invalid > 0 then
    insert into public.ta_time_import_errors (
      batch_id,
      source_row_no,
      error_code,
      error_message,
      raw_data
    )
    select
      p_batch_id,
      c.source_row_no,
      'SERVER_VALIDATION',
      concat_ws(', ',
        case when c.emp_code is null then 'รหัสพนักงานไม่ถูกต้อง' end,
        case when c.log_date is null then 'วันที่ไม่ถูกต้อง' end,
        case when c.log_time is null then 'เวลาไม่ถูกต้อง' end
      ),
      jsonb_build_object(
        'raw_mode',c.raw_mode,
        'emp_code',c.raw_emp_code,
        'log_date',c.log_date,
        'log_time',c.log_time
      )
    from pg_temp.ta_mobileta_chunk_v612 c
    where c.emp_code is null
       or c.log_date is null
       or c.log_time is null;
  end if;

  update public.ta_time_import_batches b
  set inserted_rows = b.inserted_rows + v_inserted,
      existing_duplicate_rows = b.existing_duplicate_rows + v_duplicates,
      invalid_rows = b.invalid_rows + v_invalid,
      unmatched_employee_rows = b.unmatched_employee_rows + v_unmatched,
      min_date = least(
        coalesce(b.min_date, v_chunk_min),
        coalesce(v_chunk_min, b.min_date)
      ),
      max_date = greatest(
        coalesce(b.max_date, v_chunk_max),
        coalesce(v_chunk_max, b.max_date)
      ),
      updated_at = now()
  where b.id = p_batch_id;

  return query
  select v_received, v_inserted, v_duplicates, v_invalid, v_unmatched;
end;
$$;

grant execute on function public.ta_import_mobileta_chunk(uuid,jsonb)
  to authenticated;

-- ---------------------------------------------------------------------
-- 3) Classify one date range only
--    Affected keys are derived from this import batch, but ranking also
--    includes pre-existing MobileTA logs for the same employee/date.
-- ---------------------------------------------------------------------
create or replace function public.ta_classify_mobileta_import_step(
  p_batch_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  classified_rows integer,
  start_date date,
  end_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer := 0;
  v_batch public.ta_time_import_batches%rowtype;
begin
  perform public._ta_require_hr_admin();
  perform set_config('statement_timeout', '60000', true);

  select * into v_batch
  from public.ta_time_import_batches
  where id = p_batch_id;

  if not found then
    raise exception 'IMPORT_BATCH_NOT_FOUND';
  end if;

  if v_batch.status not in ('UPLOADING','PROCESSING','FAILED') then
    raise exception 'IMPORT_BATCH_INVALID_STATUS: %', v_batch.status;
  end if;

  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'INVALID_PROCESS_DATE_RANGE';
  end if;

  if p_start_date < v_batch.min_date or p_end_date > v_batch.max_date then
    raise exception 'PROCESS_DATE_OUTSIDE_BATCH_RANGE';
  end if;

  update public.ta_time_import_batches
  set status = 'PROCESSING', error_message = null, updated_at = now()
  where id = p_batch_id;

  with affected as materialized (
    select distinct tl.emp_code, tl.inout_date
    from public.time_logs tl
    where tl.import_batch_id = p_batch_id
      and tl.inout_date between p_start_date and p_end_date
  ), ranked as materialized (
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
    from affected a
    join public.time_logs tl
      on tl.emp_code = a.emp_code
     and tl.inout_date = a.inout_date
     and tl.source_sheet = 'MobileTA'
  ), classified as (
    select
      r.id,
      case
        when exists (
          select 1
          from public.shift_calendar sc
          join public.shift_master sm
            on sm.shift_code = sc.shift_code
          where sc.emp_code = r.emp_code
            and sc.work_date = r.inout_date - 1
            and coalesce(sm.is_night_shift,false)
            and r.inout_time <= time '12:00:00'
        ) then 'OUT'
        when exists (
          select 1
          from public.shift_calendar sc
          join public.shift_master sm
            on sm.shift_code = sc.shift_code
          where sc.emp_code = r.emp_code
            and sc.work_date = r.inout_date
            and coalesce(sm.is_night_shift,false)
            and r.inout_time >= time '12:00:00'
        ) then 'IN'
        when r.day_count = 1 and r.inout_time < time '12:00:00' then 'IN'
        when r.day_count = 1 then 'OUT'
        when r.rn_first = 1 then 'IN'
        when r.rn_last = 1 then 'OUT'
        when r.inout_time < time '12:00:00' then 'IN'
        else 'OUT'
      end as classified_mode
    from ranked r
  )
  update public.time_logs tl
  set inout_mode = c.classified_mode,
      raw_data = coalesce(tl.raw_data,'{}'::jsonb) || jsonb_build_object(
        'mode_classified_at',now(),
        'mode_classifier','V6.1.2_MOBILETA_STEP'
      )
  from classified c
  where tl.id = c.id
    and tl.import_batch_id = p_batch_id
    and tl.inout_mode is distinct from c.classified_mode;

  get diagnostics v_rows = row_count;

  update public.ta_time_import_batches
  set classified_rows = classified_rows + v_rows,
      updated_at = now()
  where id = p_batch_id;

  return query select v_rows, p_start_date, p_end_date;
exception
  when others then
    update public.ta_time_import_batches
    set status = 'FAILED', error_message = sqlerrm, updated_at = now()
    where id = p_batch_id;
    raise;
end;
$$;

grant execute on function public.ta_classify_mobileta_import_step(uuid,date,date)
  to authenticated;

-- ---------------------------------------------------------------------
-- 4) Complete import after all classification steps
-- ---------------------------------------------------------------------
create or replace function public.ta_complete_mobileta_import(
  p_batch_id uuid
)
returns table (
  batch_id uuid,
  inserted_rows integer,
  existing_duplicate_rows integer,
  unmatched_employee_rows integer,
  invalid_rows integer,
  classified_rows integer,
  rebuild_deleted_rows integer,
  rebuild_inserted_rows integer,
  min_date date,
  max_date date,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.ta_time_import_batches%rowtype;
  v_emp_codes text[];
begin
  perform public._ta_require_hr_admin();
  perform set_config('statement_timeout', '60000', true);

  select coalesce(array_agg(distinct tl.emp_code order by tl.emp_code),'{}'::text[])
  into v_emp_codes
  from public.time_logs tl
  where tl.import_batch_id = p_batch_id;

  update public.ta_time_import_batches b
  set emp_codes = coalesce(v_emp_codes,'{}'::text[]),
      status = 'COMPLETED',
      error_message = null,
      finished_at = now(),
      updated_at = now()
  where b.id = p_batch_id
  returning * into v_batch;

  if not found then
    raise exception 'IMPORT_BATCH_NOT_FOUND';
  end if;

  return query select
    v_batch.id,
    v_batch.inserted_rows,
    v_batch.existing_duplicate_rows,
    v_batch.unmatched_employee_rows,
    v_batch.invalid_rows,
    v_batch.classified_rows,
    v_batch.rebuild_deleted_rows,
    v_batch.rebuild_inserted_rows,
    v_batch.min_date,
    v_batch.max_date,
    v_batch.status;
end;
$$;

grant execute on function public.ta_complete_mobileta_import(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- 5) Rebuild Attendance one small date range at a time
--    Import remains successful even if a specific Attendance day is slow.
-- ---------------------------------------------------------------------
create or replace function public.ta_rebuild_mobileta_attendance_step(
  p_batch_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  deleted_rows integer,
  inserted_rows integer,
  start_date date,
  end_date date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.ta_time_import_batches%rowtype;
  v_emp_codes text[];
  v_deleted integer := 0;
  v_inserted integer := 0;
begin
  perform public._ta_require_hr_admin();
  perform set_config('statement_timeout', '90000', true);

  select * into v_batch
  from public.ta_time_import_batches
  where id = p_batch_id;

  if not found then
    raise exception 'IMPORT_BATCH_NOT_FOUND';
  end if;

  if v_batch.status <> 'COMPLETED' then
    raise exception 'IMPORT_BATCH_NOT_COMPLETED';
  end if;

  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'INVALID_REBUILD_DATE_RANGE';
  end if;

  if p_start_date < v_batch.min_date or p_end_date > v_batch.max_date then
    raise exception 'REBUILD_DATE_OUTSIDE_BATCH_RANGE';
  end if;

  select coalesce(array_agg(distinct tl.emp_code order by tl.emp_code),'{}'::text[])
  into v_emp_codes
  from public.time_logs tl
  where tl.import_batch_id = p_batch_id;

  select r.deleted_rows, r.inserted_rows
  into v_deleted, v_inserted
  from public.rebuild_attendance_workday(
    greatest(p_start_date - 1, date '2000-01-01'),
    p_end_date,
    nullif(v_emp_codes,'{}'::text[])
  ) r;

  update public.ta_time_import_batches
  set rebuild_deleted_rows = rebuild_deleted_rows + coalesce(v_deleted,0),
      rebuild_inserted_rows = rebuild_inserted_rows + coalesce(v_inserted,0),
      rebuild_failed_dates = array_remove(rebuild_failed_dates, p_start_date),
      updated_at = now()
  where id = p_batch_id;

  return query
  select coalesce(v_deleted,0), coalesce(v_inserted,0), p_start_date, p_end_date;
end;
$$;

grant execute on function public.ta_rebuild_mobileta_attendance_step(uuid,date,date)
  to authenticated;

create or replace function public.ta_mark_mobileta_rebuild_result(
  p_batch_id uuid,
  p_success boolean,
  p_failed_dates date[] default '{}'::date[],
  p_error_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._ta_require_hr_admin();

  update public.ta_time_import_batches
  set rebuild_attendance = coalesce(p_success,false),
      rebuild_failed_dates = coalesce(p_failed_dates,'{}'::date[]),
      error_message = case
        when coalesce(p_success,false) then null
        else nullif(trim(p_error_message),'')
      end,
      updated_at = now()
  where id = p_batch_id;

  if not found then
    raise exception 'IMPORT_BATCH_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'batch_id', p_batch_id,
    'rebuild_attendance', coalesce(p_success,false),
    'failed_dates', coalesce(p_failed_dates,'{}'::date[])
  );
end;
$$;

grant execute on function public.ta_mark_mobileta_rebuild_result(uuid,boolean,date[],text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 6) Lightweight rollback used only before import is completed
--    Do not run full attendance rebuild inside the rollback RPC.
-- ---------------------------------------------------------------------
create or replace function public.ta_cancel_mobileta_import(
  p_batch_id uuid,
  p_reason text default null,
  p_rollback boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.ta_time_import_batches%rowtype;
  v_deleted integer := 0;
begin
  perform public._ta_require_hr_admin();
  perform set_config('statement_timeout', '60000', true);

  select * into v_batch
  from public.ta_time_import_batches
  where id = p_batch_id
  for update;

  if not found then
    raise exception 'IMPORT_BATCH_NOT_FOUND';
  end if;

  if coalesce(p_rollback,true) and v_batch.status <> 'COMPLETED' then
    delete from public.time_logs
    where import_batch_id = p_batch_id;
    get diagnostics v_deleted = row_count;
  end if;

  update public.ta_time_import_batches
  set status = 'CANCELLED',
      error_message = nullif(trim(p_reason),''),
      finished_at = now(),
      updated_at = now()
  where id = p_batch_id;

  return jsonb_build_object(
    'batch_id',p_batch_id,
    'rolled_back',coalesce(p_rollback,true) and v_batch.status <> 'COMPLETED',
    'deleted_time_logs',v_deleted,
    'status','CANCELLED'
  );
end;
$$;

grant execute on function public.ta_cancel_mobileta_import(uuid,text,boolean)
  to authenticated;

-- ---------------------------------------------------------------------
-- 7) History adds processing details while preserving old output columns
-- ---------------------------------------------------------------------
create or replace function public.ta_get_mobileta_import_history(
  p_limit integer default 30
)
returns table (
  id uuid,
  file_name text,
  file_size bigint,
  raw_rows integer,
  valid_rows integer,
  file_duplicate_rows integer,
  inserted_rows integer,
  existing_duplicate_rows integer,
  invalid_rows integer,
  unmatched_employee_rows integer,
  min_date date,
  max_date date,
  status text,
  rebuild_attendance boolean,
  rebuild_deleted_rows integer,
  rebuild_inserted_rows integer,
  note text,
  error_message text,
  created_by_email text,
  created_at timestamptz,
  finished_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._ta_require_hr_admin();

  return query
  select
    b.id, b.file_name, b.file_size, b.raw_rows, b.valid_rows,
    b.file_duplicate_rows, b.inserted_rows, b.existing_duplicate_rows,
    b.invalid_rows, b.unmatched_employee_rows, b.min_date, b.max_date,
    b.status, b.rebuild_attendance, b.rebuild_deleted_rows,
    b.rebuild_inserted_rows, b.note, b.error_message,
    b.created_by_email, b.created_at, b.finished_at
  from public.ta_time_import_batches b
  where b.source_type = 'MOBILETA_TEXT'
  order by b.created_at desc
  limit least(greatest(coalesce(p_limit,30),1),100);
end;
$$;

grant execute on function public.ta_get_mobileta_import_history(integer)
  to authenticated;

notify pgrst, 'reload schema';
commit;
