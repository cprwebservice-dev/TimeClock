-- =====================================================================
-- Time-Clock Enterprise V6.1.5
-- MobileTA finalize timeout + resume + attendance chunk fix
--
-- แก้ Error:
--   canceling statement due to statement timeout
--   ขั้นตอน: complete
--
-- หลักการ:
--   1) ขั้นตอน complete ไม่สแกน/array_agg ข้อมูลลงเวลาทั้ง Batch อีกต่อไป
--   2) ตรวจว่าจำแนก ALL หมดแล้วด้วย Partial Index และ mark COMPLETED ทันที
--   3) เพิ่ม RPC ประมวลผล Attendance แบบวันที่ + กลุ่มพนักงาน
--   4) Batch ที่ข้อมูลถูกเก็บไว้แล้วสามารถกด "ดำเนินการต่อ" จากหน้า History
-- =====================================================================

begin;

create index if not exists idx_time_logs_mobileta_batch_all_remaining
  on public.time_logs(import_batch_id, id)
  where source_sheet = 'MobileTA' and inout_mode = 'ALL';

create index if not exists idx_time_logs_mobileta_batch_date_emp_resume
  on public.time_logs(import_batch_id, inout_date, emp_code)
  where source_sheet = 'MobileTA';

-- ---------------------------------------------------------------------
-- 1) Lightweight finalize
--    ใช้ Counter ที่สะสมใน ta_time_import_batches อยู่แล้ว
--    ไม่ array_agg(emp_code) จากข้อมูลหลักแสนรายการ
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
begin
  perform public._ta_require_hr_admin();
  perform set_config('statement_timeout', '15000', true);

  select *
  into v_batch
  from public.ta_time_import_batches b
  where b.id = p_batch_id;

  if not found then
    raise exception 'IMPORT_BATCH_NOT_FOUND';
  end if;

  if v_batch.status = 'CANCELLED' then
    raise exception 'IMPORT_BATCH_CANCELLED';
  end if;

  if exists (
    select 1
    from public.time_logs tl
    where tl.import_batch_id = p_batch_id
      and tl.source_sheet = 'MobileTA'
      and tl.inout_mode = 'ALL'
    limit 1
  ) then
    raise exception 'IMPORT_BATCH_CLASSIFICATION_INCOMPLETE';
  end if;

  update public.ta_time_import_batches b
  set status = 'COMPLETED',
      error_message = null,
      finished_at = coalesce(b.finished_at, now()),
      updated_at = now()
  where b.id = p_batch_id
  returning * into v_batch;

  return query
  select
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
-- 2) Resume state สำหรับตรวจ Batch ก่อนดำเนินการต่อ
-- ---------------------------------------------------------------------
create or replace function public.ta_get_mobileta_import_resume_state(
  p_batch_id uuid
)
returns table (
  batch_id uuid,
  file_name text,
  batch_status text,
  inserted_rows integer,
  existing_duplicate_rows integer,
  unmatched_employee_rows integer,
  classified_rows integer,
  remaining_all_rows bigint,
  min_date date,
  max_date date,
  rebuild_attendance boolean,
  rebuild_failed_dates date[]
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
    b.id,
    b.file_name,
    b.status,
    b.inserted_rows,
    b.existing_duplicate_rows,
    b.unmatched_employee_rows,
    b.classified_rows,
    (
      select count(*)
      from public.time_logs tl
      where tl.import_batch_id = b.id
        and tl.source_sheet = 'MobileTA'
        and tl.inout_mode = 'ALL'
    ) as remaining_all_rows,
    b.min_date,
    b.max_date,
    b.rebuild_attendance,
    coalesce(b.rebuild_failed_dates, '{}'::date[])
  from public.ta_time_import_batches b
  where b.id = p_batch_id;
end;
$$;

grant execute on function public.ta_get_mobileta_import_resume_state(uuid)
  to authenticated;

-- ---------------------------------------------------------------------
-- 3) Attendance rebuild แบบ Cursor ตามรหัสพนักงาน
--    หนึ่ง RPC ไม่ประมวลผลพนักงานทั้ง Batch พร้อมกัน
-- ---------------------------------------------------------------------
create or replace function public.ta_rebuild_mobileta_attendance_chunk(
  p_batch_id uuid,
  p_work_date date,
  p_after_emp_code text default null,
  p_emp_limit integer default 50
)
returns table (
  processed_employees integer,
  deleted_rows integer,
  inserted_rows integer,
  next_emp_code text,
  done boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch public.ta_time_import_batches%rowtype;
  v_limit integer := greatest(1, least(coalesce(p_emp_limit, 50), 200));
  v_emp_codes text[] := '{}'::text[];
  v_processed integer := 0;
  v_deleted integer := 0;
  v_inserted integer := 0;
  v_next_emp text;
  v_more boolean := false;
begin
  perform public._ta_require_hr_admin();
  perform set_config('statement_timeout', '45000', true);

  select *
  into v_batch
  from public.ta_time_import_batches b
  where b.id = p_batch_id;

  if not found then
    raise exception 'IMPORT_BATCH_NOT_FOUND';
  end if;

  if v_batch.status <> 'COMPLETED' then
    raise exception 'IMPORT_BATCH_NOT_COMPLETED';
  end if;

  if p_work_date is null
     or p_work_date < v_batch.min_date
     or p_work_date > v_batch.max_date then
    raise exception 'REBUILD_DATE_OUTSIDE_BATCH_RANGE';
  end if;

  select
    coalesce(array_agg(x.emp_code order by x.emp_code), '{}'::text[]),
    count(*)::integer,
    max(x.emp_code)
  into v_emp_codes, v_processed, v_next_emp
  from (
    select distinct tl.emp_code
    from public.time_logs tl
    where tl.import_batch_id = p_batch_id
      and tl.source_sheet = 'MobileTA'
      and tl.inout_date = p_work_date
      and (
        p_after_emp_code is null
        or tl.emp_code > p_after_emp_code
      )
    order by tl.emp_code
    limit v_limit
  ) x;

  if v_processed = 0 then
    return query select 0, 0, 0, null::text, true;
    return;
  end if;

  select
    coalesce(r.deleted_rows, 0),
    coalesce(r.inserted_rows, 0)
  into v_deleted, v_inserted
  from public.rebuild_attendance_workday(
    greatest(p_work_date - 1, date '2000-01-01'),
    p_work_date,
    v_emp_codes
  ) r;

  select exists (
    select 1
    from public.time_logs tl
    where tl.import_batch_id = p_batch_id
      and tl.source_sheet = 'MobileTA'
      and tl.inout_date = p_work_date
      and tl.emp_code > v_next_emp
  ) into v_more;

  update public.ta_time_import_batches b
  set rebuild_deleted_rows = b.rebuild_deleted_rows + coalesce(v_deleted, 0),
      rebuild_inserted_rows = b.rebuild_inserted_rows + coalesce(v_inserted, 0),
      updated_at = now()
  where b.id = p_batch_id;

  return query
  select
    v_processed,
    coalesce(v_deleted, 0),
    coalesce(v_inserted, 0),
    v_next_emp,
    not v_more;
end;
$$;

grant execute on function public.ta_rebuild_mobileta_attendance_chunk(
  uuid,date,text,integer
) to authenticated;

notify pgrst, 'reload schema';
commit;
