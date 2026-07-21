-- =====================================================================
-- Time-Clock Enterprise V6.1.7
-- Attendance Rebuild Admin: date-range processing, progress and error log
--
-- แนวทาง:
--   - HR_ADMIN สร้าง Job ตามช่วงวันที่
--   - ระบบแบ่งงานเป็น วันที่ + กลุ่มพนักงาน
--   - Browser เรียกประมวลผลทีละ Task เพื่อแสดง Progress แบบต่อเนื่อง
--   - Task ที่ช้าเกินกำหนดจะถูกแบ่งกลุ่มอัตโนมัติ
--   - Task ที่เหลือเพียง 1 พนักงานแล้วผิดพลาด จะถูกบันทึก Error Log
-- =====================================================================

begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1) Job / Task / Error tables
-- ---------------------------------------------------------------------
create table if not exists public.ta_attendance_rebuild_jobs (
  id uuid primary key default gen_random_uuid(),
  start_date date not null,
  end_date date not null,
  batch_size integer not null default 100,
  note text,
  status text not null default 'QUEUED',
  total_days integer not null default 0,
  total_employees integer not null default 0,
  total_tasks integer not null default 0,
  pending_tasks integer not null default 0,
  running_tasks integer not null default 0,
  completed_tasks integer not null default 0,
  failed_tasks integer not null default 0,
  split_tasks integer not null default 0,
  cancelled_tasks integer not null default 0,
  deleted_rows bigint not null default 0,
  inserted_rows bigint not null default 0,
  current_work_date date,
  requested_by uuid,
  requested_email text,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_ta_attendance_rebuild_jobs_dates check (start_date <= end_date),
  constraint ck_ta_attendance_rebuild_jobs_batch check (batch_size between 1 and 500),
  constraint ck_ta_attendance_rebuild_jobs_status check (
    status in ('QUEUED','RUNNING','PAUSED','COMPLETED','COMPLETED_WITH_ERRORS','CANCELLED','FAILED')
  )
);

create table if not exists public.ta_attendance_rebuild_tasks (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.ta_attendance_rebuild_jobs(id) on delete cascade,
  sequence_no bigint not null,
  work_date date not null,
  emp_codes text[] not null,
  emp_count integer not null,
  status text not null default 'PENDING',
  attempt_count integer not null default 0,
  deleted_rows integer not null default 0,
  inserted_rows integer not null default 0,
  error_code text,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_ta_attendance_rebuild_tasks_seq unique (job_id, sequence_no),
  constraint ck_ta_attendance_rebuild_tasks_status check (
    status in ('PENDING','RUNNING','COMPLETED','FAILED','SPLIT','CANCELLED')
  )
);

create table if not exists public.ta_attendance_rebuild_errors (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.ta_attendance_rebuild_jobs(id) on delete cascade,
  task_id bigint references public.ta_attendance_rebuild_tasks(id) on delete set null,
  work_date date,
  emp_codes text[],
  emp_count integer not null default 0,
  severity text not null default 'ERROR',
  error_code text,
  error_message text,
  error_detail text,
  resolution text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint ck_ta_attendance_rebuild_errors_severity check (severity in ('INFO','WARNING','ERROR'))
);

create index if not exists idx_ta_att_rebuild_jobs_created
  on public.ta_attendance_rebuild_jobs(created_at desc);
create index if not exists idx_ta_att_rebuild_jobs_status
  on public.ta_attendance_rebuild_jobs(status, created_at desc);
create index if not exists idx_ta_att_rebuild_tasks_pick
  on public.ta_attendance_rebuild_tasks(job_id, status, sequence_no);
create index if not exists idx_ta_att_rebuild_tasks_date
  on public.ta_attendance_rebuild_tasks(job_id, work_date, status);
create index if not exists idx_ta_att_rebuild_errors_job
  on public.ta_attendance_rebuild_errors(job_id, created_at desc);

-- Existing core indexes used by rebuild_attendance_workday
create index if not exists idx_time_logs_emp_date_mode_time_v617
  on public.time_logs(emp_code, inout_date, normalized_mode, inout_time);
create index if not exists idx_attendance_workday_emp_date_v617
  on public.attendance_workday(emp_code, work_date);

alter table public.ta_attendance_rebuild_jobs enable row level security;
alter table public.ta_attendance_rebuild_tasks enable row level security;
alter table public.ta_attendance_rebuild_errors enable row level security;

-- Read-only access for active HR_ADMIN. All writes use SECURITY DEFINER RPCs.
drop policy if exists ta_att_rebuild_jobs_hr_read on public.ta_attendance_rebuild_jobs;
create policy ta_att_rebuild_jobs_hr_read
on public.ta_attendance_rebuild_jobs for select to authenticated
using (
  exists (
    select 1 from public.ta_user_profiles p
    where p.user_id = auth.uid()
      and coalesce(p.is_active,false)
      and p.role = 'HR_ADMIN'
  )
);

drop policy if exists ta_att_rebuild_tasks_hr_read on public.ta_attendance_rebuild_tasks;
create policy ta_att_rebuild_tasks_hr_read
on public.ta_attendance_rebuild_tasks for select to authenticated
using (
  exists (
    select 1 from public.ta_user_profiles p
    where p.user_id = auth.uid()
      and coalesce(p.is_active,false)
      and p.role = 'HR_ADMIN'
  )
);

drop policy if exists ta_att_rebuild_errors_hr_read on public.ta_attendance_rebuild_errors;
create policy ta_att_rebuild_errors_hr_read
on public.ta_attendance_rebuild_errors for select to authenticated
using (
  exists (
    select 1 from public.ta_user_profiles p
    where p.user_id = auth.uid()
      and coalesce(p.is_active,false)
      and p.role = 'HR_ADMIN'
  )
);

grant select on public.ta_attendance_rebuild_jobs to authenticated;
grant select on public.ta_attendance_rebuild_tasks to authenticated;
grant select on public.ta_attendance_rebuild_errors to authenticated;

-- ---------------------------------------------------------------------
-- 2) Internal JSON summary helper
-- ---------------------------------------------------------------------
create or replace function public._ta_attendance_rebuild_job_json(p_job_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', j.id,
    'start_date', j.start_date,
    'end_date', j.end_date,
    'batch_size', j.batch_size,
    'note', j.note,
    'status', j.status,
    'total_days', j.total_days,
    'total_employees', j.total_employees,
    'total_tasks', j.total_tasks,
    'pending_tasks', j.pending_tasks,
    'running_tasks', j.running_tasks,
    'completed_tasks', j.completed_tasks,
    'failed_tasks', j.failed_tasks,
    'split_tasks', j.split_tasks,
    'cancelled_tasks', j.cancelled_tasks,
    'processed_tasks', j.completed_tasks + j.failed_tasks + j.split_tasks + j.cancelled_tasks,
    'remaining_tasks', greatest(j.total_tasks - (j.completed_tasks + j.failed_tasks + j.split_tasks + j.cancelled_tasks), 0),
    'progress_percent', case
      when j.total_tasks <= 0 then 100
      else round(100.0 * (j.completed_tasks + j.failed_tasks + j.split_tasks + j.cancelled_tasks) / j.total_tasks, 2)
    end,
    'deleted_rows', j.deleted_rows,
    'inserted_rows', j.inserted_rows,
    'current_work_date', j.current_work_date,
    'requested_by', j.requested_by,
    'requested_email', j.requested_email,
    'started_at', j.started_at,
    'finished_at', j.finished_at,
    'last_error', j.last_error,
    'created_at', j.created_at,
    'updated_at', j.updated_at
  )
  from public.ta_attendance_rebuild_jobs j
  where j.id = p_job_id;
$$;

revoke all on function public._ta_attendance_rebuild_job_json(uuid) from public;

-- ---------------------------------------------------------------------
-- 3) Create a rebuild job and split work into date + employee chunks
-- ---------------------------------------------------------------------
create or replace function public.ta_create_attendance_rebuild_job(
  p_start_date date,
  p_end_date date,
  p_batch_size integer default 100,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_batch integer := greatest(1, least(coalesce(p_batch_size,100),500));
  v_total_tasks integer := 0;
  v_total_employees integer := 0;
  v_total_days integer := 0;
begin
  perform public._ta_require_hr_admin();

  if p_start_date is null or p_end_date is null then
    raise exception 'DATE_RANGE_REQUIRED';
  end if;
  if p_start_date > p_end_date then
    raise exception 'INVALID_DATE_RANGE';
  end if;
  if (p_end_date - p_start_date) > 366 then
    raise exception 'DATE_RANGE_TOO_LARGE: maximum 367 days';
  end if;

  v_total_days := (p_end_date - p_start_date) + 1;

  select count(*) into v_total_employees
  from (
    select trim(e.emp_code) emp_code
    from public.employees e
    where trim(coalesce(e.emp_code,'')) <> ''
      and (e.start_date is null or e.start_date::date <= p_end_date)
      and (e.resign_date is null or e.resign_date::date >= p_start_date)
    group by trim(e.emp_code)
  ) x;

  if v_total_employees = 0 then
    raise exception 'NO_ACTIVE_EMPLOYEES_IN_RANGE';
  end if;

  insert into public.ta_attendance_rebuild_jobs(
    start_date,end_date,batch_size,note,status,total_days,total_employees,
    requested_by,requested_email
  ) values (
    p_start_date,p_end_date,v_batch,nullif(trim(coalesce(p_note,'')),''),'QUEUED',
    v_total_days,v_total_employees,auth.uid(),coalesce(auth.jwt()->>'email','-')
  ) returning id into v_job_id;

  with recursive days as (
    select p_start_date::date as work_date
    union all
    select (work_date + 1)::date from days where work_date < p_end_date
  ), employee_base as (
    select
      trim(e.emp_code) as emp_code,
      min(e.start_date::date) as start_date,
      case when bool_or(e.resign_date is null) then null else max(e.resign_date::date) end as resign_date
    from public.employees e
    where trim(coalesce(e.emp_code,'')) <> ''
    group by trim(e.emp_code)
  ), eligible as (
    select
      d.work_date,
      eb.emp_code,
      row_number() over(partition by d.work_date order by eb.emp_code) as rn
    from days d
    join employee_base eb
      on (eb.start_date is null or eb.start_date <= d.work_date)
     and (eb.resign_date is null or eb.resign_date >= d.work_date)
  ), grouped as (
    select
      work_date,
      ((rn - 1) / v_batch)::integer as group_no,
      array_agg(emp_code order by emp_code)::text[] as emp_codes
    from eligible
    group by work_date, ((rn - 1) / v_batch)::integer
  ), ordered as (
    select
      work_date,
      emp_codes,
      row_number() over(order by work_date, group_no)::bigint as sequence_no
    from grouped
  )
  insert into public.ta_attendance_rebuild_tasks(
    job_id,sequence_no,work_date,emp_codes,emp_count,status
  )
  select
    v_job_id,sequence_no,work_date,emp_codes,cardinality(emp_codes),'PENDING'
  from ordered;

  get diagnostics v_total_tasks = row_count;

  update public.ta_attendance_rebuild_jobs
  set total_tasks = v_total_tasks,
      pending_tasks = v_total_tasks,
      updated_at = now()
  where id = v_job_id;

  if v_total_tasks = 0 then
    update public.ta_attendance_rebuild_jobs
    set status='COMPLETED', finished_at=now(), updated_at=now()
    where id=v_job_id;
  end if;

  return public._ta_attendance_rebuild_job_json(v_job_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Process one task. Slow tasks are split automatically.
-- ---------------------------------------------------------------------
create or replace function public.ta_process_attendance_rebuild_step(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.ta_attendance_rebuild_jobs%rowtype;
  v_task public.ta_attendance_rebuild_tasks%rowtype;
  v_deleted integer := 0;
  v_inserted integer := 0;
  v_count integer := 0;
  v_half integer := 0;
  v_left text[];
  v_right text[];
  v_next_seq bigint := 0;
  v_sqlstate text;
  v_message text;
  v_detail text;
  v_pending_exists boolean;
  v_running_exists boolean;
begin
  perform public._ta_require_hr_admin();

  select * into v_job
  from public.ta_attendance_rebuild_jobs
  where id = p_job_id
  for update;

  if not found then raise exception 'REBUILD_JOB_NOT_FOUND'; end if;

  if v_job.status in ('COMPLETED','COMPLETED_WITH_ERRORS','CANCELLED') then
    return public._ta_attendance_rebuild_job_json(p_job_id);
  end if;
  if v_job.status = 'PAUSED' then
    return public._ta_attendance_rebuild_job_json(p_job_id);
  end if;

  update public.ta_attendance_rebuild_jobs
  set status='RUNNING',
      started_at=coalesce(started_at,now()),
      updated_at=now()
  where id=p_job_id;

  select * into v_task
  from public.ta_attendance_rebuild_tasks
  where job_id=p_job_id and status='PENDING'
  order by sequence_no
  limit 1
  for update skip locked;

  if not found then
    select exists(select 1 from public.ta_attendance_rebuild_tasks where job_id=p_job_id and status='RUNNING')
      into v_running_exists;

    if not v_running_exists then
      update public.ta_attendance_rebuild_jobs
      set status = case when failed_tasks > 0 then 'COMPLETED_WITH_ERRORS' else 'COMPLETED' end,
          pending_tasks = 0,
          running_tasks = 0,
          finished_at = coalesce(finished_at,now()),
          updated_at = now()
      where id=p_job_id;
    end if;
    return public._ta_attendance_rebuild_job_json(p_job_id);
  end if;

  update public.ta_attendance_rebuild_tasks
  set status='RUNNING',attempt_count=attempt_count+1,started_at=now(),updated_at=now(),
      error_code=null,error_message=null
  where id=v_task.id;

  update public.ta_attendance_rebuild_jobs
  set pending_tasks=greatest(pending_tasks-1,0),
      running_tasks=running_tasks+1,
      current_work_date=v_task.work_date,
      updated_at=now()
  where id=p_job_id;

  begin
    -- Give the inner rebuild enough time, but return control to the UI before
    -- the normal PostgREST request timeout. A timeout is caught and split.
    perform set_config('statement_timeout','20000',true);

    select coalesce(r.deleted_rows,0),coalesce(r.inserted_rows,0)
      into v_deleted,v_inserted
    from public.rebuild_attendance_workday(
      v_task.work_date,
      v_task.work_date,
      v_task.emp_codes
    ) r;

    v_deleted := coalesce(v_deleted,0);
    v_inserted := coalesce(v_inserted,0);

    update public.ta_attendance_rebuild_tasks
    set status='COMPLETED',deleted_rows=v_deleted,inserted_rows=v_inserted,
        finished_at=now(),updated_at=now()
    where id=v_task.id;

    update public.ta_attendance_rebuild_jobs
    set running_tasks=greatest(running_tasks-1,0),
        completed_tasks=completed_tasks+1,
        deleted_rows=deleted_rows+v_deleted,
        inserted_rows=inserted_rows+v_inserted,
        last_error=null,
        updated_at=now()
    where id=p_job_id;

  exception when others then
    get stacked diagnostics
      v_sqlstate = returned_sqlstate,
      v_message = message_text,
      v_detail = pg_exception_detail;

    v_count := cardinality(v_task.emp_codes);

    if v_count > 1 then
      v_half := greatest(1, floor(v_count / 2.0)::integer);
      v_left := v_task.emp_codes[1:v_half];
      v_right := v_task.emp_codes[(v_half+1):v_count];

      select coalesce(max(sequence_no),0) into v_next_seq
      from public.ta_attendance_rebuild_tasks
      where job_id=p_job_id;

      insert into public.ta_attendance_rebuild_tasks(job_id,sequence_no,work_date,emp_codes,emp_count,status)
      values
        (p_job_id,v_next_seq+1,v_task.work_date,v_left,cardinality(v_left),'PENDING'),
        (p_job_id,v_next_seq+2,v_task.work_date,v_right,cardinality(v_right),'PENDING');

      update public.ta_attendance_rebuild_tasks
      set status='SPLIT',error_code=v_sqlstate,error_message=v_message,
          finished_at=now(),updated_at=now()
      where id=v_task.id;

      insert into public.ta_attendance_rebuild_errors(
        job_id,task_id,work_date,emp_codes,emp_count,severity,error_code,error_message,error_detail,resolution,created_by
      ) values (
        p_job_id,v_task.id,v_task.work_date,v_task.emp_codes,v_count,'WARNING',v_sqlstate,v_message,v_detail,
        format('AUTO_SPLIT %s employees into %s and %s',v_count,cardinality(v_left),cardinality(v_right)),auth.uid()
      );

      update public.ta_attendance_rebuild_jobs
      set running_tasks=greatest(running_tasks-1,0),
          pending_tasks=pending_tasks+2,
          total_tasks=total_tasks+2,
          split_tasks=split_tasks+1,
          last_error=format('%s: %s (ระบบแบ่ง Task อัตโนมัติ)',v_sqlstate,v_message),
          updated_at=now()
      where id=p_job_id;
    else
      update public.ta_attendance_rebuild_tasks
      set status='FAILED',error_code=v_sqlstate,error_message=v_message,
          finished_at=now(),updated_at=now()
      where id=v_task.id;

      insert into public.ta_attendance_rebuild_errors(
        job_id,task_id,work_date,emp_codes,emp_count,severity,error_code,error_message,error_detail,resolution,created_by
      ) values (
        p_job_id,v_task.id,v_task.work_date,v_task.emp_codes,v_count,'ERROR',v_sqlstate,v_message,v_detail,
        'REQUIRES_REVIEW',auth.uid()
      );

      update public.ta_attendance_rebuild_jobs
      set running_tasks=greatest(running_tasks-1,0),
          failed_tasks=failed_tasks+1,
          last_error=format('%s: %s',v_sqlstate,v_message),
          updated_at=now()
      where id=p_job_id;
    end if;
  end;

  select exists(select 1 from public.ta_attendance_rebuild_tasks where job_id=p_job_id and status='PENDING')
    into v_pending_exists;
  select exists(select 1 from public.ta_attendance_rebuild_tasks where job_id=p_job_id and status='RUNNING')
    into v_running_exists;

  if not v_pending_exists and not v_running_exists then
    update public.ta_attendance_rebuild_jobs
    set status=case when failed_tasks>0 then 'COMPLETED_WITH_ERRORS' else 'COMPLETED' end,
        pending_tasks=0,
        running_tasks=0,
        finished_at=coalesce(finished_at,now()),
        updated_at=now()
    where id=p_job_id and status not in ('CANCELLED','PAUSED');
  end if;

  return public._ta_attendance_rebuild_job_json(p_job_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Job control: PAUSE / RESUME / CANCEL
-- ---------------------------------------------------------------------
create or replace function public.ta_control_attendance_rebuild_job(
  p_job_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := upper(trim(coalesce(p_action,'')));
  v_cancelled integer := 0;
begin
  perform public._ta_require_hr_admin();

  if not exists(select 1 from public.ta_attendance_rebuild_jobs where id=p_job_id) then
    raise exception 'REBUILD_JOB_NOT_FOUND';
  end if;

  if v_action='PAUSE' then
    update public.ta_attendance_rebuild_jobs
    set status='PAUSED',updated_at=now()
    where id=p_job_id and status in ('QUEUED','RUNNING');

  elsif v_action='RESUME' then
    update public.ta_attendance_rebuild_jobs
    set status='RUNNING',finished_at=null,updated_at=now()
    where id=p_job_id and status in ('QUEUED','PAUSED','FAILED','COMPLETED_WITH_ERRORS');

  elsif v_action='CANCEL' then
    update public.ta_attendance_rebuild_tasks
    set status='CANCELLED',finished_at=now(),updated_at=now()
    where job_id=p_job_id and status='PENDING';
    get diagnostics v_cancelled = row_count;

    update public.ta_attendance_rebuild_jobs
    set status='CANCELLED',
        pending_tasks=greatest(pending_tasks-v_cancelled,0),
        cancelled_tasks=cancelled_tasks+v_cancelled,
        finished_at=now(),updated_at=now()
    where id=p_job_id and status not in ('COMPLETED','COMPLETED_WITH_ERRORS','CANCELLED');
  else
    raise exception 'INVALID_ACTION: %',v_action;
  end if;

  return public._ta_attendance_rebuild_job_json(p_job_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 6) Retry failed single-employee tasks
-- ---------------------------------------------------------------------
create or replace function public.ta_retry_attendance_rebuild_errors(p_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
begin
  perform public._ta_require_hr_admin();

  update public.ta_attendance_rebuild_tasks
  set status='PENDING',error_code=null,error_message=null,started_at=null,finished_at=null,updated_at=now()
  where job_id=p_job_id and status='FAILED';
  get diagnostics v_count = row_count;

  update public.ta_attendance_rebuild_jobs
  set status=case when v_count>0 then 'RUNNING' else status end,
      pending_tasks=pending_tasks+v_count,
      failed_tasks=greatest(failed_tasks-v_count,0),
      finished_at=case when v_count>0 then null else finished_at end,
      last_error=null,
      updated_at=now()
  where id=p_job_id;

  return public._ta_attendance_rebuild_job_json(p_job_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 7) Read APIs for page, history and error log
-- ---------------------------------------------------------------------
create or replace function public.ta_get_attendance_rebuild_jobs(p_limit integer default 30)
returns table (
  id uuid,
  start_date date,
  end_date date,
  batch_size integer,
  note text,
  status text,
  total_days integer,
  total_employees integer,
  total_tasks integer,
  processed_tasks integer,
  pending_tasks integer,
  running_tasks integer,
  completed_tasks integer,
  failed_tasks integer,
  split_tasks integer,
  cancelled_tasks integer,
  progress_percent numeric,
  deleted_rows bigint,
  inserted_rows bigint,
  current_work_date date,
  requested_email text,
  started_at timestamptz,
  finished_at timestamptz,
  last_error text,
  created_at timestamptz,
  updated_at timestamptz
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
    j.id,j.start_date,j.end_date,j.batch_size,j.note,j.status,j.total_days,j.total_employees,j.total_tasks,
    (j.completed_tasks+j.failed_tasks+j.split_tasks+j.cancelled_tasks) as processed_tasks,
    j.pending_tasks,j.running_tasks,j.completed_tasks,j.failed_tasks,j.split_tasks,j.cancelled_tasks,
    case when j.total_tasks<=0 then 100::numeric
      else round(100.0*(j.completed_tasks+j.failed_tasks+j.split_tasks+j.cancelled_tasks)/j.total_tasks,2) end,
    j.deleted_rows,j.inserted_rows,j.current_work_date,j.requested_email,j.started_at,j.finished_at,j.last_error,
    j.created_at,j.updated_at
  from public.ta_attendance_rebuild_jobs j
  order by j.created_at desc
  limit greatest(1,least(coalesce(p_limit,30),100));
end;
$$;

create or replace function public.ta_get_attendance_rebuild_errors(
  p_job_id uuid,
  p_limit integer default 300
)
returns table (
  id bigint,
  task_id bigint,
  work_date date,
  emp_codes text[],
  emp_count integer,
  severity text,
  error_code text,
  error_message text,
  error_detail text,
  resolution text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public._ta_require_hr_admin();
  return query
  select e.id,e.task_id,e.work_date,e.emp_codes,e.emp_count,e.severity,e.error_code,e.error_message,
         e.error_detail,e.resolution,e.created_at
  from public.ta_attendance_rebuild_errors e
  where e.job_id=p_job_id
  order by e.created_at desc
  limit greatest(1,least(coalesce(p_limit,300),1000));
end;
$$;

revoke all on function public.ta_create_attendance_rebuild_job(date,date,integer,text) from public;
revoke all on function public.ta_process_attendance_rebuild_step(uuid) from public;
revoke all on function public.ta_control_attendance_rebuild_job(uuid,text) from public;
revoke all on function public.ta_retry_attendance_rebuild_errors(uuid) from public;
revoke all on function public.ta_get_attendance_rebuild_jobs(integer) from public;
revoke all on function public.ta_get_attendance_rebuild_errors(uuid,integer) from public;

grant execute on function public.ta_create_attendance_rebuild_job(date,date,integer,text) to authenticated;
grant execute on function public.ta_process_attendance_rebuild_step(uuid) to authenticated;
grant execute on function public.ta_control_attendance_rebuild_job(uuid,text) to authenticated;
grant execute on function public.ta_retry_attendance_rebuild_errors(uuid) to authenticated;
grant execute on function public.ta_get_attendance_rebuild_jobs(integer) to authenticated;
grant execute on function public.ta_get_attendance_rebuild_errors(uuid,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
