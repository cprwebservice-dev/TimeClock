-- =====================================================================
-- Time-Clock Enterprise V6.1 - MobileTA Text Import
-- รองรับ Text File: ALL,EmployeeId,YYMMDD,HHMMSS
-- ต่อจาก V6.0.1 Deployment Fix
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Import Batch / Error Log
-- ---------------------------------------------------------------------
create table if not exists public.ta_time_import_batches (
  id uuid primary key default gen_random_uuid(),
  source_type text not null default 'MOBILETA_TEXT',
  file_name text not null,
  file_size bigint not null default 0,
  raw_rows integer not null default 0,
  valid_rows integer not null default 0,
  file_duplicate_rows integer not null default 0,
  inserted_rows integer not null default 0,
  existing_duplicate_rows integer not null default 0,
  invalid_rows integer not null default 0,
  unmatched_employee_rows integer not null default 0,
  min_date date,
  max_date date,
  emp_codes text[] not null default '{}'::text[],
  status text not null default 'UPLOADING',
  note text,
  rebuild_attendance boolean not null default false,
  rebuild_deleted_rows integer not null default 0,
  rebuild_inserted_rows integer not null default 0,
  error_message text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint ck_ta_time_import_batches_status
    check (status in ('UPLOADING','PROCESSING','COMPLETED','FAILED','CANCELLED'))
);

create index if not exists idx_ta_time_import_batches_created
  on public.ta_time_import_batches(created_at desc);
create index if not exists idx_ta_time_import_batches_status
  on public.ta_time_import_batches(status, created_at desc);

create table if not exists public.ta_time_import_errors (
  id bigserial primary key,
  batch_id uuid not null references public.ta_time_import_batches(id) on delete cascade,
  source_row_no integer,
  raw_line text,
  error_code text,
  error_message text,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_ta_time_import_errors_batch
  on public.ta_time_import_errors(batch_id, source_row_no);

alter table public.time_logs
  add column if not exists import_batch_id uuid;

DO $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.time_logs'::regclass
      and conname = 'fk_time_logs_import_batch'
  ) then
    alter table public.time_logs
      add constraint fk_time_logs_import_batch
      foreign key (import_batch_id)
      references public.ta_time_import_batches(id)
      on delete set null;
  end if;
end $$;

create index if not exists idx_time_logs_import_batch
  on public.time_logs(import_batch_id);

-- ใช้ Source Hash สำหรับค้นหาและป้องกันการนำเข้ารายการเดิมซ้ำใน RPC
-- ใช้ Index ปกติเพื่อไม่ให้ Migration ล้มเหลว หากฐานเดิมเคยมี Hash ซ้ำ
create index if not exists idx_time_logs_source_hash_nonnull
  on public.time_logs(source_hash)
  where source_hash is not null;

alter table public.ta_time_import_batches enable row level security;
alter table public.ta_time_import_errors enable row level security;

drop policy if exists ta_time_import_batches_select on public.ta_time_import_batches;
create policy ta_time_import_batches_select
on public.ta_time_import_batches
for select
to authenticated
using (
  exists (
    select 1
    from public.ta_user_profiles p
    where p.user_id = auth.uid()
      and coalesce(p.is_active,false)
      and p.role = 'HR_ADMIN'
  )
);

drop policy if exists ta_time_import_errors_select on public.ta_time_import_errors;
create policy ta_time_import_errors_select
on public.ta_time_import_errors
for select
to authenticated
using (
  exists (
    select 1
    from public.ta_user_profiles p
    where p.user_id = auth.uid()
      and coalesce(p.is_active,false)
      and p.role = 'HR_ADMIN'
  )
);

grant select on public.ta_time_import_batches to authenticated;
grant select on public.ta_time_import_errors to authenticated;
grant usage, select on sequence public.ta_time_import_errors_id_seq to authenticated;

-- ---------------------------------------------------------------------
-- 2) Permission Helper
-- ---------------------------------------------------------------------
create or replace function public._ta_require_hr_admin()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  select exists (
    select 1
    from public.ta_user_profiles p
    where p.user_id = auth.uid()
      and coalesce(p.is_active,false)
      and p.role = 'HR_ADMIN'
  ) into v_ok;

  if not coalesce(v_ok,false) then
    raise exception 'HR_ADMIN_REQUIRED';
  end if;
end;
$$;

revoke all on function public._ta_require_hr_admin() from public;


-- Safe parser สำหรับข้อมูลจาก Browser
create or replace function public._ta_try_iso_date(p_value text)
returns date
language plpgsql
immutable
as $$
declare
  v_date date;
begin
  if p_value is null or p_value !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  begin
    v_date := p_value::date;
  exception when others then
    return null;
  end;
  if to_char(v_date,'YYYY-MM-DD') <> p_value then return null; end if;
  return v_date;
end;
$$;

create or replace function public._ta_try_hms_time(p_value text)
returns time
language plpgsql
immutable
as $$
declare
  v_time time;
begin
  if p_value is null or p_value !~ '^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$' then return null; end if;
  begin
    v_time := p_value::time;
  exception when others then
    return null;
  end;
  return v_time;
end;
$$;

revoke all on function public._ta_try_iso_date(text) from public;
revoke all on function public._ta_try_hms_time(text) from public;

-- ---------------------------------------------------------------------
-- 3) Begin Import
-- ---------------------------------------------------------------------
create or replace function public.ta_begin_mobileta_import(
  p_file_name text,
  p_file_size bigint,
  p_raw_rows integer,
  p_valid_rows integer,
  p_file_duplicate_rows integer,
  p_min_date date,
  p_max_date date,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_email text := coalesce(auth.jwt()->>'email', auth.uid()::text, 'system');
begin
  perform public._ta_require_hr_admin();

  if nullif(trim(p_file_name),'') is null then
    raise exception 'FILE_NAME_REQUIRED';
  end if;
  if coalesce(p_valid_rows,0) <= 0 then
    raise exception 'NO_VALID_ROWS';
  end if;
  if p_min_date is null or p_max_date is null or p_min_date > p_max_date then
    raise exception 'INVALID_IMPORT_DATE_RANGE';
  end if;

  insert into public.ta_time_import_batches (
    source_type, file_name, file_size, raw_rows, valid_rows,
    file_duplicate_rows, invalid_rows, min_date, max_date,
    status, note, created_by, created_by_email, created_at, updated_at
  ) values (
    'MOBILETA_TEXT', trim(p_file_name), greatest(coalesce(p_file_size,0),0),
    greatest(coalesce(p_raw_rows,0),0), greatest(coalesce(p_valid_rows,0),0),
    greatest(coalesce(p_file_duplicate_rows,0),0),
    greatest(coalesce(p_raw_rows,0)-coalesce(p_valid_rows,0)-coalesce(p_file_duplicate_rows,0),0),
    p_min_date, p_max_date, 'UPLOADING', nullif(trim(p_note),''),
    auth.uid(), v_email, now(), now()
  ) returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.ta_begin_mobileta_import(text,bigint,integer,integer,integer,date,date,text)
  to authenticated;

-- ---------------------------------------------------------------------
-- 4) Save Browser Validation Errors
-- ---------------------------------------------------------------------
create or replace function public.ta_log_mobileta_import_errors(
  p_batch_id uuid,
  p_errors jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  perform public._ta_require_hr_admin();

  if jsonb_typeof(p_errors) <> 'array' then
    raise exception 'ERRORS_MUST_BE_JSON_ARRAY';
  end if;

  if not exists (
    select 1 from public.ta_time_import_batches b
    where b.id = p_batch_id and b.status = 'UPLOADING'
  ) then
    raise exception 'IMPORT_BATCH_NOT_AVAILABLE';
  end if;

  insert into public.ta_time_import_errors (
    batch_id, source_row_no, raw_line, error_code, error_message, raw_data
  )
  select
    p_batch_id,
    nullif(x->>'line_no','')::integer,
    x->>'raw_line',
    'CLIENT_VALIDATION',
    x->>'error',
    x
  from jsonb_array_elements(p_errors) x;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.ta_log_mobileta_import_errors(uuid,jsonb)
  to authenticated;

-- ---------------------------------------------------------------------
-- 5) Import Chunk
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
    select 1 from public.ta_time_import_batches b
    where b.id = p_batch_id and b.status = 'UPLOADING'
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
    count(*) filter (where emp_code is not null and log_date is not null and log_time is not null)::integer,
    count(*) filter (where emp_code is null or log_date is null or log_time is null)::integer,
    min(log_date) filter (where emp_code is not null and log_date is not null and log_time is not null),
    max(log_date) filter (where emp_code is not null and log_date is not null and log_time is not null),
    coalesce(array_agg(distinct emp_code) filter (where emp_code is not null and log_date is not null and log_time is not null),'{}'::text[])
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
      case when trim(emp_code) ~ '^\d{1,20}$'
        then public.normalize_emp_code(trim(emp_code)) end as emp_code,
      public._ta_try_iso_date(inout_date) as log_date,
      public._ta_try_hms_time(inout_time) as log_time
    from raw_rows
  ), valid_rows as (
    select *,
      md5('MOBILETA_TEXT|'||emp_code||'|'||log_date::text||'|'||log_time::text) as row_hash
    from parsed
    where emp_code is not null and log_date is not null and log_time is not null
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
      case when trim(emp_code) ~ '^\d{1,20}$'
        then public.normalize_emp_code(trim(emp_code)) end as emp_code,
      public._ta_try_iso_date(inout_date) as log_date,
      public._ta_try_hms_time(inout_time) as log_time
    from raw_rows
  ), valid_rows as (
    select *,
      md5('MOBILETA_TEXT|'||emp_code||'|'||log_date::text||'|'||log_time::text) as row_hash
    from parsed
    where emp_code is not null and log_date is not null and log_time is not null
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
    normalized_mode,
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
    null,
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
      x.full_name, x.position_name, x.department, x.area, x.sub_area,
      x.car_team, x.manager_department, x.manager_division, x.pc
    from public.employees x
    where public.normalize_emp_code(x."EmployeeId") = v.emp_code
    limit 1
  ) e on true
  where not exists (
    select 1 from public.time_logs existing
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
      batch_id, source_row_no, error_code, error_message, raw_data
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
        'raw_mode',raw_mode,'emp_code',emp_code,
        'inout_date',inout_date,'inout_time',inout_time
      )
    from checked
    where not emp_ok or not date_ok or not time_ok;
  end if;

  update public.ta_time_import_batches b
  set inserted_rows = b.inserted_rows + v_inserted,
      existing_duplicate_rows = b.existing_duplicate_rows + v_duplicates,
      invalid_rows = b.invalid_rows + v_invalid,
      unmatched_employee_rows = b.unmatched_employee_rows + v_unmatched,
      min_date = least(coalesce(b.min_date,v_chunk_min),coalesce(v_chunk_min,b.min_date)),
      max_date = greatest(coalesce(b.max_date,v_chunk_max),coalesce(v_chunk_max,b.max_date)),
      emp_codes = coalesce((
        select array_agg(distinct code order by code)
        from unnest(coalesce(b.emp_codes,'{}'::text[]) || coalesce(v_new_emp_codes,'{}'::text[])) code
      ),'{}'::text[]),
      updated_at = now()
  where b.id = p_batch_id;

  return query select v_received, v_inserted, v_duplicates, v_invalid, v_unmatched;
exception when others then
  update public.ta_time_import_batches
  set status = 'FAILED', error_message = sqlerrm, updated_at = now()
  where id = p_batch_id;
  raise;
end;
$$;

grant execute on function public.ta_import_mobileta_chunk(uuid,jsonb)
  to authenticated;

-- ---------------------------------------------------------------------
-- 6) Reclassify IN / OUT
--    Priority: previous-day night OUT -> current-day night IN -> first/last
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
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
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
        join public.shift_master sm on sm.shift_code = sc.shift_code
        where sc.emp_code = r.emp_code
          and sc.work_date = r.inout_date - 1
          and coalesce(sm.is_night_shift,false)
          and r.inout_time <= time '12:00:00'
      ) as is_previous_night_out,
      exists (
        select 1
        from public.shift_calendar sc
        join public.shift_master sm on sm.shift_code = sc.shift_code
        where sc.emp_code = r.emp_code
          and sc.work_date = r.inout_date
          and coalesce(sm.is_night_shift,false)
          and r.inout_time >= time '12:00:00'
      ) as is_current_night_in
    from ranked r
  )
  update public.time_logs tl
  set normalized_mode = case
        when f.is_previous_night_out then 'OUT'
        when f.is_current_night_in then 'IN'
        when f.day_count = 1 and f.inout_time < time '12:00:00' then 'IN'
        when f.day_count = 1 then 'OUT'
        when f.rn_first = 1 then 'IN'
        when f.rn_last = 1 then 'OUT'
        when f.inout_time < time '12:00:00' then 'IN'
        else 'OUT'
      end,
      raw_data = coalesce(tl.raw_data,'{}'::jsonb) || jsonb_build_object(
        'mode_classified_at',now(),
        'mode_classifier','V6.1_MOBILETA'
      )
  from flags f
  where tl.id = f.id;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke all on function public._ta_reclassify_mobileta_logs(text[],date,date) from public;

-- ---------------------------------------------------------------------
-- 7) Finish Import + Rebuild Attendance
-- ---------------------------------------------------------------------
create or replace function public.ta_finish_mobileta_import(
  p_batch_id uuid,
  p_rebuild_attendance boolean default true
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
  v_classified integer := 0;
  v_deleted integer := 0;
  v_rebuilt integer := 0;
  v_rebuild_start date;
begin
  perform public._ta_require_hr_admin();

  select * into v_batch
  from public.ta_time_import_batches
  where id = p_batch_id
  for update;

  if not found then raise exception 'IMPORT_BATCH_NOT_FOUND'; end if;
  if v_batch.status not in ('UPLOADING','FAILED') then
    raise exception 'IMPORT_BATCH_INVALID_STATUS: %', v_batch.status;
  end if;

  update public.ta_time_import_batches
  set status = 'PROCESSING', error_message = null, updated_at = now()
  where id = p_batch_id;

  v_classified := public._ta_reclassify_mobileta_logs(
    v_batch.emp_codes,
    v_batch.min_date,
    v_batch.max_date
  );

  if coalesce(p_rebuild_attendance,true) then
    v_rebuild_start := greatest(v_batch.min_date - 1, date '2000-01-01');
    select r.deleted_rows, r.inserted_rows
      into v_deleted, v_rebuilt
    from public.rebuild_attendance_workday(
      v_rebuild_start,
      v_batch.max_date,
      nullif(v_batch.emp_codes,'{}'::text[])
    ) r;
  end if;

  update public.ta_time_import_batches
  set status = 'COMPLETED',
      rebuild_attendance = coalesce(p_rebuild_attendance,true),
      rebuild_deleted_rows = coalesce(v_deleted,0),
      rebuild_inserted_rows = coalesce(v_rebuilt,0),
      finished_at = now(),
      updated_at = now()
  where id = p_batch_id
  returning * into v_batch;

  return query select
    v_batch.id,
    v_batch.inserted_rows,
    v_batch.existing_duplicate_rows,
    v_batch.unmatched_employee_rows,
    v_batch.invalid_rows,
    v_classified,
    v_batch.rebuild_deleted_rows,
    v_batch.rebuild_inserted_rows,
    v_batch.min_date,
    v_batch.max_date,
    v_batch.status;
exception when others then
  update public.ta_time_import_batches
  set status = 'FAILED', error_message = sqlerrm, updated_at = now()
  where id = p_batch_id;
  raise;
end;
$$;

grant execute on function public.ta_finish_mobileta_import(uuid,boolean)
  to authenticated;

-- ---------------------------------------------------------------------
-- 8) Cancel / Rollback Partial Batch
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
  v_rebuild_deleted integer := 0;
  v_rebuild_inserted integer := 0;
begin
  perform public._ta_require_hr_admin();

  select * into v_batch
  from public.ta_time_import_batches
  where id = p_batch_id
  for update;

  if not found then raise exception 'IMPORT_BATCH_NOT_FOUND'; end if;

  if coalesce(p_rollback,true) then
    delete from public.time_logs where import_batch_id = p_batch_id;
    get diagnostics v_deleted = row_count;

    perform public._ta_reclassify_mobileta_logs(
      nullif(v_batch.emp_codes,'{}'::text[]),
      v_batch.min_date,
      v_batch.max_date
    );

    if v_batch.min_date is not null and v_batch.max_date is not null then
      select r.deleted_rows, r.inserted_rows
        into v_rebuild_deleted, v_rebuild_inserted
      from public.rebuild_attendance_workday(
        greatest(v_batch.min_date - 1,date '2000-01-01'),
        v_batch.max_date,
        nullif(v_batch.emp_codes,'{}'::text[])
      ) r;
    end if;
  end if;

  update public.ta_time_import_batches
  set status = 'CANCELLED',
      error_message = nullif(trim(p_reason),''),
      finished_at = now(),
      updated_at = now()
  where id = p_batch_id;

  return jsonb_build_object(
    'batch_id',p_batch_id,
    'rolled_back',coalesce(p_rollback,true),
    'deleted_time_logs',v_deleted,
    'rebuild_deleted_rows',coalesce(v_rebuild_deleted,0),
    'rebuild_inserted_rows',coalesce(v_rebuild_inserted,0),
    'status','CANCELLED'
  );
end;
$$;

grant execute on function public.ta_cancel_mobileta_import(uuid,text,boolean)
  to authenticated;

-- ---------------------------------------------------------------------
-- 9) Import History
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
