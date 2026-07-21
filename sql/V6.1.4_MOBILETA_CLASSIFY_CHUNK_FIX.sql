-- =====================================================================
-- Time-Clock Enterprise V6.1.4
-- MobileTA classify chunk/cursor fix
--
-- แก้ Error:
--   canceling statement due to statement timeout
--   ขั้นตอน: classify
--
-- สาเหตุ:
--   แม้ V6.1.3 จะแบ่งจำแนกเป็นรายวัน แต่บางวันมีพนักงานและรายการลงเวลา
--   จำนวนมาก ทำให้การคำนวณ first/last + ตรวจ duplicate ทั้งวันยังเกินเวลา
--
-- แนวทางแก้:
--   1) แบ่งงานตามกลุ่ม (วันที่ + รหัสพนักงาน) ด้วย cursor
--   2) หนึ่ง RPC ประมวลผลไม่เกิน p_group_limit กลุ่ม
--   3) ตรวจและลบเฉพาะ duplicate ของ Batch ปัจจุบันก่อน UPDATE IN/OUT
--   4) รองรับ Retry โดย Batch สถานะ FAILED สามารถทำต่อได้
--   5) ไม่เขียน normalized_mode เพราะเป็น GENERATED ALWAYS
-- =====================================================================

begin;

create index if not exists idx_time_logs_mobileta_batch_all_cursor
  on public.time_logs(import_batch_id, inout_date, emp_code, id)
  where source_sheet = 'MobileTA' and inout_mode = 'ALL';

create index if not exists idx_time_logs_mobileta_lookup_mode
  on public.time_logs(emp_code, inout_date, inout_time, inout_mode, id)
  where source_sheet = 'MobileTA';

create or replace function public.ta_classify_mobileta_import_chunk(
  p_batch_id uuid,
  p_after_date date default null,
  p_after_emp_code text default null,
  p_group_limit integer default 100
)
returns table (
  processed_groups integer,
  classified_rows integer,
  duplicate_rows integer,
  remaining_rows bigint,
  next_date date,
  next_emp_code text,
  done boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_group_limit,100), 500));
  v_groups integer := 0;
  v_classified integer := 0;
  v_duplicates integer := 0;
  v_remaining bigint := 0;
  v_next_date date;
  v_next_emp text;
  v_batch public.ta_time_import_batches%rowtype;
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

  if v_batch.status not in ('UPLOADING','PROCESSING','FAILED') then
    raise exception 'IMPORT_BATCH_INVALID_STATUS: %', v_batch.status;
  end if;

  update public.ta_time_import_batches
  set status = 'PROCESSING',
      error_message = null,
      updated_at = now()
  where id = p_batch_id;

  drop table if exists pg_temp.ta_mobileta_groups_v614;
  create temporary table ta_mobileta_groups_v614 (
    inout_date date not null,
    emp_code text not null,
    primary key (inout_date, emp_code)
  ) on commit drop;

  insert into pg_temp.ta_mobileta_groups_v614(inout_date, emp_code)
  select x.inout_date, x.emp_code
  from (
    select distinct tl.inout_date, tl.emp_code
    from public.time_logs tl
    where tl.import_batch_id = p_batch_id
      and tl.source_sheet = 'MobileTA'
      and tl.inout_mode = 'ALL'
      and (
        p_after_date is null
        or (tl.inout_date, tl.emp_code) >
           (p_after_date, coalesce(p_after_emp_code,''))
      )
    order by tl.inout_date, tl.emp_code
    limit v_limit
  ) x;

  get diagnostics v_groups = row_count;

  if v_groups = 0 then
    select count(*)
    into v_remaining
    from public.time_logs tl
    where tl.import_batch_id = p_batch_id
      and tl.source_sheet = 'MobileTA'
      and tl.inout_mode = 'ALL';

    return query
    select 0, 0, 0, v_remaining, null::date, null::text, (v_remaining = 0);
    return;
  end if;

  select g.inout_date, g.emp_code
  into v_next_date, v_next_emp
  from pg_temp.ta_mobileta_groups_v614 g
  order by g.inout_date desc, g.emp_code desc
  limit 1;

  drop table if exists pg_temp.ta_mobileta_classified_v614;
  create temporary table ta_mobileta_classified_v614 (
    id bigint primary key,
    emp_code text not null,
    inout_date date not null,
    inout_time time without time zone not null,
    classified_mode text not null
  ) on commit drop;

  insert into pg_temp.ta_mobileta_classified_v614(
    id, emp_code, inout_date, inout_time, classified_mode
  )
  with day_stats as materialized (
    select
      g.emp_code,
      g.inout_date,
      count(distinct tl.inout_time)::integer as distinct_time_count,
      min(tl.inout_time) as first_time,
      max(tl.inout_time) as last_time
    from pg_temp.ta_mobileta_groups_v614 g
    join public.time_logs tl
      on tl.emp_code = g.emp_code
     and tl.inout_date = g.inout_date
     and tl.source_sheet = 'MobileTA'
    group by g.emp_code, g.inout_date
  ), night_flags as materialized (
    select
      g.emp_code,
      g.inout_date,
      exists (
        select 1
        from public.shift_calendar sc
        join public.shift_master sm
          on sm.shift_code = sc.shift_code
        where sc.emp_code = g.emp_code
          and sc.work_date = g.inout_date - 1
          and coalesce(sm.is_night_shift,false)
      ) as previous_night,
      exists (
        select 1
        from public.shift_calendar sc
        join public.shift_master sm
          on sm.shift_code = sc.shift_code
        where sc.emp_code = g.emp_code
          and sc.work_date = g.inout_date
          and coalesce(sm.is_night_shift,false)
      ) as current_night
    from pg_temp.ta_mobileta_groups_v614 g
  )
  select
    tl.id,
    tl.emp_code,
    tl.inout_date,
    tl.inout_time,
    case
      when nf.previous_night and tl.inout_time <= time '12:00:00' then 'OUT'
      when nf.current_night and tl.inout_time >= time '12:00:00' then 'IN'
      when ds.distinct_time_count = 1 and tl.inout_time < time '12:00:00' then 'IN'
      when ds.distinct_time_count = 1 then 'OUT'
      when tl.inout_time = ds.first_time then 'IN'
      when tl.inout_time = ds.last_time then 'OUT'
      when tl.inout_time < time '12:00:00' then 'IN'
      else 'OUT'
    end
  from public.time_logs tl
  join pg_temp.ta_mobileta_groups_v614 g
    on g.emp_code = tl.emp_code
   and g.inout_date = tl.inout_date
  join day_stats ds
    on ds.emp_code = tl.emp_code
   and ds.inout_date = tl.inout_date
  join night_flags nf
    on nf.emp_code = tl.emp_code
   and nf.inout_date = tl.inout_date
  where tl.import_batch_id = p_batch_id
    and tl.source_sheet = 'MobileTA'
    and tl.inout_mode = 'ALL';

  create index on pg_temp.ta_mobileta_classified_v614
    (emp_code, inout_date, inout_time, classified_mode);

  -- เก็บ existing.id ที่เป็น canonical ไว้ แล้วลบเฉพาะข้อมูล Batch ปัจจุบัน
  -- ที่จะชน Unique Constraint หลังเปลี่ยน ALL เป็น IN/OUT
  with conflicts as materialized (
    select distinct c.id
    from pg_temp.ta_mobileta_classified_v614 c
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

  get diagnostics v_duplicates = row_count;

  update public.time_logs tl
  set inout_mode = c.classified_mode,
      raw_data = coalesce(tl.raw_data,'{}'::jsonb) || jsonb_build_object(
        'mode_classified_at', now(),
        'mode_classifier', 'V6.1.4_CURSOR_CHUNK'
      )
  from pg_temp.ta_mobileta_classified_v614 c
  where tl.id = c.id
    and tl.import_batch_id = p_batch_id
    and tl.inout_mode = 'ALL';

  get diagnostics v_classified = row_count;

  update public.ta_time_import_batches b
  set inserted_rows = greatest(b.inserted_rows - v_duplicates, 0),
      existing_duplicate_rows = b.existing_duplicate_rows + v_duplicates,
      classified_rows = b.classified_rows + v_classified,
      updated_at = now()
  where b.id = p_batch_id;

  select count(*)
  into v_remaining
  from public.time_logs tl
  where tl.import_batch_id = p_batch_id
    and tl.source_sheet = 'MobileTA'
    and tl.inout_mode = 'ALL';

  return query
  select
    v_groups,
    v_classified,
    v_duplicates,
    v_remaining,
    v_next_date,
    v_next_emp,
    (v_remaining = 0);
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

grant execute on function public.ta_classify_mobileta_import_chunk(
  uuid,date,text,integer
) to authenticated;

notify pgrst, 'reload schema';
commit;
