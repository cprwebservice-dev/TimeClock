-- =====================================================================
-- Time-Clock Enterprise V6.1.3
-- MobileTA duplicate-key fix during IN/OUT classification
--
-- แก้ Error:
--   duplicate key value violates unique constraint
--   "ux_time_logs_emp_date_time_mode"
--
-- สาเหตุ:
--   ขณะ Upload ข้อมูล MobileTA จะเข้ามาด้วย inout_mode = ALL ก่อน
--   จากนั้นขั้นตอน classify เปลี่ยนเป็น IN/OUT หากฐานข้อมูลมีเวลาเดียวกัน
--   และ mode เดียวกันอยู่แล้วจากแหล่งข้อมูลเดิม การ UPDATE จะชน Unique Index
--
-- แนวทางแก้:
--   1) คำนวณ IN/OUT ลง Temp Table ก่อน
--   2) ตรวจรายการที่จะชนกับข้อมูลเดิม
--   3) ลบเฉพาะรายการของ Batch ปัจจุบันที่ซ้ำ (ถือเป็น Duplicate)
--   4) UPDATE เฉพาะรายการที่ไม่ชน
--   5) ปรับสถิติ Batch ให้ตรงกับจำนวนข้อมูลที่เหลือจริง
-- =====================================================================

begin;

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
  v_deduped integer := 0;
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
  set status = 'PROCESSING',
      error_message = null,
      updated_at = now()
  where id = p_batch_id;

  drop table if exists pg_temp.ta_mobileta_classified_v613;

  create temporary table ta_mobileta_classified_v613 (
    id bigint primary key,
    emp_code text not null,
    inout_date date not null,
    inout_time time without time zone not null,
    classified_mode text not null
  ) on commit drop;

  -- Rank by DISTINCT time values so an existing duplicate record does not
  -- change which timestamp is considered the first or last of the day.
  insert into pg_temp.ta_mobileta_classified_v613 (
    id, emp_code, inout_date, inout_time, classified_mode
  )
  with affected as materialized (
    select distinct tl.emp_code, tl.inout_date
    from public.time_logs tl
    where tl.import_batch_id = p_batch_id
      and tl.inout_date between p_start_date and p_end_date
  ), day_stats as materialized (
    select
      tl.emp_code,
      tl.inout_date,
      count(distinct tl.inout_time)::integer as distinct_time_count,
      min(tl.inout_time) as first_time,
      max(tl.inout_time) as last_time
    from affected a
    join public.time_logs tl
      on tl.emp_code = a.emp_code
     and tl.inout_date = a.inout_date
     and tl.source_sheet = 'MobileTA'
    group by tl.emp_code, tl.inout_date
  )
  select
    tl.id,
    tl.emp_code,
    tl.inout_date,
    tl.inout_time,
    case
      when exists (
        select 1
        from public.shift_calendar sc
        join public.shift_master sm
          on sm.shift_code = sc.shift_code
        where sc.emp_code = tl.emp_code
          and sc.work_date = tl.inout_date - 1
          and coalesce(sm.is_night_shift,false)
          and tl.inout_time <= time '12:00:00'
      ) then 'OUT'
      when exists (
        select 1
        from public.shift_calendar sc
        join public.shift_master sm
          on sm.shift_code = sc.shift_code
        where sc.emp_code = tl.emp_code
          and sc.work_date = tl.inout_date
          and coalesce(sm.is_night_shift,false)
          and tl.inout_time >= time '12:00:00'
      ) then 'IN'
      when ds.distinct_time_count = 1 and tl.inout_time < time '12:00:00' then 'IN'
      when ds.distinct_time_count = 1 then 'OUT'
      when tl.inout_time = ds.first_time then 'IN'
      when tl.inout_time = ds.last_time then 'OUT'
      when tl.inout_time < time '12:00:00' then 'IN'
      else 'OUT'
    end as classified_mode
  from public.time_logs tl
  join day_stats ds
    on ds.emp_code = tl.emp_code
   and ds.inout_date = tl.inout_date
  where tl.import_batch_id = p_batch_id
    and tl.inout_date between p_start_date and p_end_date;

  create index on pg_temp.ta_mobileta_classified_v613
    (emp_code, inout_date, inout_time, classified_mode);

  -- Remove only rows from the current import batch that would collide with
  -- an already existing event after ALL is converted to IN/OUT.
  -- The existing row remains untouched and becomes the canonical record.
  with conflicts as materialized (
    select distinct c.id
    from pg_temp.ta_mobileta_classified_v613 c
    join public.time_logs existing
      on existing.id <> c.id
     and existing.emp_code = c.emp_code
     and existing.inout_date = c.inout_date
     and existing.inout_time = c.inout_time
     and coalesce(
           nullif(upper(trim(existing.normalized_mode)),''),
           nullif(upper(trim(existing.inout_mode)),''),
           'UNKNOWN'
         ) = c.classified_mode
  )
  delete from public.time_logs tl
  using conflicts x
  where tl.id = x.id
    and tl.import_batch_id = p_batch_id;

  get diagnostics v_deduped = row_count;

  -- Remaining rows can now be classified without violating the unique key.
  update public.time_logs tl
  set inout_mode = c.classified_mode,
      raw_data = coalesce(tl.raw_data,'{}'::jsonb) || jsonb_build_object(
        'mode_classified_at',now(),
        'mode_classifier','V6.1.3_MOBILETA_DUPLICATE_SAFE'
      )
  from pg_temp.ta_mobileta_classified_v613 c
  where tl.id = c.id
    and tl.import_batch_id = p_batch_id
    and tl.inout_mode is distinct from c.classified_mode;

  get diagnostics v_rows = row_count;

  update public.ta_time_import_batches
  set inserted_rows = greatest(inserted_rows - v_deduped, 0),
      existing_duplicate_rows = existing_duplicate_rows + v_deduped,
      classified_rows = classified_rows + v_rows,
      updated_at = now()
  where id = p_batch_id;

  return query select v_rows, p_start_date, p_end_date;
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

grant execute on function public.ta_classify_mobileta_import_step(uuid,date,date)
  to authenticated;

notify pgrst, 'reload schema';
commit;
