-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.11.37
-- Attendance Rebuild Pipeline: Rebuild -> Calculate -> Validate -> Completed
-- ============================================================================

begin;

set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- 1) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ta_attendance_rebuild_jobs') is null then
    raise exception 'MISSING_TABLE: ta_attendance_rebuild_jobs';
  end if;

  if to_regclass('public.ta_attendance_rebuild_tasks') is null then
    raise exception 'MISSING_TABLE: ta_attendance_rebuild_tasks';
  end if;

  if to_regclass('public.ta_attendance_rebuild_errors') is null then
    raise exception 'MISSING_TABLE: ta_attendance_rebuild_errors';
  end if;

  if to_regprocedure(
    'public.rebuild_attendance_workday(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: rebuild_attendance_workday';
  end if;

  if to_regprocedure(
    'public._ta_recalculate_after_schedule_change_v61029(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_recalculate_after_schedule_change_v61029';
  end if;

  if to_regprocedure(
    'public._ta_attendance_rebuild_job_json(uuid)'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_attendance_rebuild_job_json';
  end if;

  if to_regprocedure(
    'public._ta_require_hr_admin()'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_require_hr_admin';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Process one Attendance task with explicit pipeline
--
-- A task becomes COMPLETED only after:
--   REBUILD   : rebuild_attendance_workday succeeds
--   CALCULATE : Attendance calculation succeeds
--   VALIDATE  : calculation response is valid / not unexpectedly deferred
--
-- If any stage fails, the existing auto-split / error-log behavior is preserved.
-- ---------------------------------------------------------------------------
create or replace function public.ta_process_attendance_rebuild_step(
  p_job_id uuid
)
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

  v_stage text := 'INIT';
  v_calc jsonb := '{}'::jsonb;
  v_calc_recalculated boolean := false;
  v_calc_deferred boolean := false;
  v_calc_attendance_rows integer := 0;
begin
  perform public._ta_require_hr_admin();

  select *
  into v_job
  from public.ta_attendance_rebuild_jobs
  where id = p_job_id
  for update;

  if not found then
    raise exception 'REBUILD_JOB_NOT_FOUND';
  end if;

  if v_job.status in (
    'COMPLETED',
    'COMPLETED_WITH_ERRORS',
    'CANCELLED'
  ) then
    return public._ta_attendance_rebuild_job_json(p_job_id);
  end if;

  if v_job.status = 'PAUSED' then
    return public._ta_attendance_rebuild_job_json(p_job_id);
  end if;

  update public.ta_attendance_rebuild_jobs
  set
    status = 'RUNNING',
    started_at = coalesce(started_at,now()),
    updated_at = now()
  where id = p_job_id;

  select *
  into v_task
  from public.ta_attendance_rebuild_tasks
  where job_id = p_job_id
    and status = 'PENDING'
  order by sequence_no
  limit 1
  for update skip locked;

  if not found then
    select exists(
      select 1
      from public.ta_attendance_rebuild_tasks
      where job_id = p_job_id
        and status = 'RUNNING'
    )
    into v_running_exists;

    if not v_running_exists then
      update public.ta_attendance_rebuild_jobs
      set
        status = case
          when failed_tasks > 0 then 'COMPLETED_WITH_ERRORS'
          else 'COMPLETED'
        end,
        pending_tasks = 0,
        running_tasks = 0,
        finished_at = coalesce(finished_at,now()),
        updated_at = now()
      where id = p_job_id;
    end if;

    return public._ta_attendance_rebuild_job_json(p_job_id);
  end if;

  update public.ta_attendance_rebuild_tasks
  set
    status = 'RUNNING',
    attempt_count = attempt_count + 1,
    started_at = now(),
    updated_at = now(),
    error_code = null,
    error_message = null
  where id = v_task.id;

  update public.ta_attendance_rebuild_jobs
  set
    pending_tasks = greatest(pending_tasks - 1,0),
    running_tasks = running_tasks + 1,
    current_work_date = v_task.work_date,
    updated_at = now()
  where id = p_job_id;

  begin
    -- Keep total task execution below normal API timeout.
    -- Any timeout/error is caught by the existing auto-split logic.
    perform set_config('statement_timeout','20000',true);

    -- ---------------------------------------------------------------
    -- Stage 1: REBUILD
    -- ---------------------------------------------------------------
    v_stage := 'REBUILD';

    select
      coalesce(r.deleted_rows,0),
      coalesce(r.inserted_rows,0)
    into
      v_deleted,
      v_inserted
    from public.rebuild_attendance_workday(
      v_task.work_date,
      v_task.work_date,
      v_task.emp_codes
    ) r;

    v_deleted := coalesce(v_deleted,0);
    v_inserted := coalesce(v_inserted,0);

    -- ---------------------------------------------------------------
    -- Stage 2: CALCULATE
    -- Explicitly calculate after rebuild instead of relying only on trigger.
    -- ---------------------------------------------------------------
    v_stage := 'CALCULATE';

    v_calc :=
      public._ta_recalculate_after_schedule_change_v61029(
        v_task.work_date,
        v_task.work_date,
        v_task.emp_codes
      );

    -- ---------------------------------------------------------------
    -- Stage 3: VALIDATE
    -- ---------------------------------------------------------------
    v_stage := 'VALIDATE';

    if v_calc is null then
      raise exception 'ATTENDANCE_PIPELINE_CALCULATION_RESULT_EMPTY';
    end if;

    v_calc_recalculated :=
      lower(coalesce(v_calc->>'recalculated','false')) = 'true';

    v_calc_deferred :=
      lower(coalesce(v_calc->>'deferred','false')) = 'true';

    v_calc_attendance_rows :=
      case
        when coalesce(v_calc->>'attendance_rows','') ~ '^[0-9]+$'
          then (v_calc->>'attendance_rows')::integer
        else 0
      end;

    if not v_calc_recalculated then
      raise exception
        'ATTENDANCE_PIPELINE_CALCULATION_NOT_COMPLETED: %',
        coalesce(v_calc->>'reason','UNKNOWN');
    end if;

    -- A successful rebuild that inserted rows must not return deferred/no-attendance.
    if v_inserted > 0
       and (
         v_calc_deferred
         or v_calc_attendance_rows <= 0
       ) then
      raise exception
        'ATTENDANCE_PIPELINE_VALIDATION_FAILED: inserted=% attendance_rows=% deferred=% reason=%',
        v_inserted,
        v_calc_attendance_rows,
        v_calc_deferred,
        coalesce(v_calc->>'reason','-');
    end if;

    -- Mark COMPLETED only after all three stages succeed.
    update public.ta_attendance_rebuild_tasks
    set
      status = 'COMPLETED',
      deleted_rows = v_deleted,
      inserted_rows = v_inserted,
      finished_at = now(),
      updated_at = now()
    where id = v_task.id;

    update public.ta_attendance_rebuild_jobs
    set
      running_tasks = greatest(running_tasks - 1,0),
      completed_tasks = completed_tasks + 1,
      deleted_rows = deleted_rows + v_deleted,
      inserted_rows = inserted_rows + v_inserted,
      last_error = null,
      updated_at = now()
    where id = p_job_id;

  exception when others then
    get stacked diagnostics
      v_sqlstate = returned_sqlstate,
      v_message = message_text,
      v_detail = pg_exception_detail;

    -- Make Error Log show which pipeline stage failed.
    v_message :=
      format(
        '[%s] %s',
        coalesce(v_stage,'UNKNOWN'),
        coalesce(v_message,'UNKNOWN_ERROR')
      );

    v_detail :=
      concat_ws(
        ' | ',
        nullif(v_detail,''),
        format(
          'pipeline_stage=%s; rebuild_inserted=%s; calc=%s',
          coalesce(v_stage,'UNKNOWN'),
          coalesce(v_inserted,0),
          coalesce(v_calc::text,'{}')
        )
      );

    v_count := cardinality(v_task.emp_codes);

    if v_count > 1 then
      v_half := greatest(
        1,
        floor(v_count / 2.0)::integer
      );

      v_left := v_task.emp_codes[1:v_half];
      v_right := v_task.emp_codes[(v_half+1):v_count];

      select coalesce(max(sequence_no),0)
      into v_next_seq
      from public.ta_attendance_rebuild_tasks
      where job_id = p_job_id;

      insert into public.ta_attendance_rebuild_tasks(
        job_id,
        sequence_no,
        work_date,
        emp_codes,
        emp_count,
        status
      )
      values
        (
          p_job_id,
          v_next_seq + 1,
          v_task.work_date,
          v_left,
          cardinality(v_left),
          'PENDING'
        ),
        (
          p_job_id,
          v_next_seq + 2,
          v_task.work_date,
          v_right,
          cardinality(v_right),
          'PENDING'
        );

      update public.ta_attendance_rebuild_tasks
      set
        status = 'SPLIT',
        error_code = v_sqlstate,
        error_message = v_message,
        finished_at = now(),
        updated_at = now()
      where id = v_task.id;

      insert into public.ta_attendance_rebuild_errors(
        job_id,
        task_id,
        work_date,
        emp_codes,
        emp_count,
        severity,
        error_code,
        error_message,
        error_detail,
        resolution,
        created_by
      )
      values (
        p_job_id,
        v_task.id,
        v_task.work_date,
        v_task.emp_codes,
        v_count,
        'WARNING',
        v_sqlstate,
        v_message,
        v_detail,
        format(
          'AUTO_SPLIT %s employees into %s and %s',
          v_count,
          cardinality(v_left),
          cardinality(v_right)
        ),
        auth.uid()
      );

      update public.ta_attendance_rebuild_jobs
      set
        running_tasks = greatest(running_tasks - 1,0),
        pending_tasks = pending_tasks + 2,
        total_tasks = total_tasks + 2,
        split_tasks = split_tasks + 1,
        last_error =
          format(
            '%s: %s (ระบบแบ่ง Task อัตโนมัติ)',
            v_sqlstate,
            v_message
          ),
        updated_at = now()
      where id = p_job_id;

    else
      update public.ta_attendance_rebuild_tasks
      set
        status = 'FAILED',
        error_code = v_sqlstate,
        error_message = v_message,
        finished_at = now(),
        updated_at = now()
      where id = v_task.id;

      insert into public.ta_attendance_rebuild_errors(
        job_id,
        task_id,
        work_date,
        emp_codes,
        emp_count,
        severity,
        error_code,
        error_message,
        error_detail,
        resolution,
        created_by
      )
      values (
        p_job_id,
        v_task.id,
        v_task.work_date,
        v_task.emp_codes,
        v_count,
        'ERROR',
        v_sqlstate,
        v_message,
        v_detail,
        'REQUIRES_REVIEW',
        auth.uid()
      );

      update public.ta_attendance_rebuild_jobs
      set
        running_tasks = greatest(running_tasks - 1,0),
        failed_tasks = failed_tasks + 1,
        last_error = format('%s: %s',v_sqlstate,v_message),
        updated_at = now()
      where id = p_job_id;
    end if;
  end;

  select exists(
    select 1
    from public.ta_attendance_rebuild_tasks
    where job_id = p_job_id
      and status = 'PENDING'
  )
  into v_pending_exists;

  select exists(
    select 1
    from public.ta_attendance_rebuild_tasks
    where job_id = p_job_id
      and status = 'RUNNING'
  )
  into v_running_exists;

  if not v_pending_exists
     and not v_running_exists then
    update public.ta_attendance_rebuild_jobs
    set
      status = case
        when failed_tasks > 0 then 'COMPLETED_WITH_ERRORS'
        else 'COMPLETED'
      end,
      pending_tasks = 0,
      running_tasks = 0,
      finished_at = coalesce(finished_at,now()),
      updated_at = now()
    where id = p_job_id
      and status not in ('CANCELLED','PAUSED');
  end if;

  return public._ta_attendance_rebuild_job_json(p_job_id);
end;
$$;

revoke all on function
  public.ta_process_attendance_rebuild_step(uuid)
from public;

grant execute on function
  public.ta_process_attendance_rebuild_step(uuid)
to authenticated;

notify pgrst, 'reload schema';

commit;
