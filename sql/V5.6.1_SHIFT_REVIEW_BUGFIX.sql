-- =============================================================
-- Time-Clock Enterprise V5.6.1
-- Shift assignment RPC + Review queue bug fix
-- Run once in Supabase SQL Editor.
-- =============================================================

begin;

-- 1) Make the original shift tables compatible with the enterprise UI.
alter table if exists public.shift_calendar
  add column if not exists is_confirmed boolean not null default false,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by text,
  add column if not exists change_reason text;

alter table if exists public.shift_master
  add column if not exists sort_order integer not null default 0,
  add column if not exists display_order integer not null default 0,
  add column if not exists note text;

update public.shift_master
set display_order = sort_order
where coalesce(display_order, 0) = 0
  and coalesce(sort_order, 0) <> 0;

insert into public.shift_master (
  shift_code, shift_name, start_time, end_time, is_night_shift, is_workday,
  break_minutes, color, sort_order, display_order, is_active, note
)
values
  ('LV', 'ลา', null, null, false, false, 0, '#22c55e', 97, 97, true, 'ใช้สำหรับบันทึกวันลาในตารางจัดกะ')
on conflict (shift_code) do update
set shift_name = excluded.shift_name,
    is_workday = excluded.is_workday,
    break_minutes = excluded.break_minutes,
    display_order = coalesce(public.shift_master.display_order, excluded.display_order),
    is_active = true,
    updated_at = now();

create table if not exists public.ta_shift_assignment_audit (
  id bigserial primary key,
  emp_code text not null,
  work_date date not null,
  old_shift_code text,
  new_shift_code text,
  action_type text not null,
  note text,
  change_reason text,
  confirm_now boolean not null default false,
  changed_by uuid,
  changed_by_email text,
  changed_at timestamptz not null default now()
);

create index if not exists idx_ta_shift_audit_emp_date
  on public.ta_shift_assignment_audit(emp_code, work_date, changed_at desc);

create index if not exists idx_attendance_workday_review_fast
  on public.attendance_workday(work_date, expected_day, emp_code)
  include (first_in, last_out, department, area, shift_code);

-- 2) Private compatibility helper for employee key variants.
create or replace function public._ta_employee_exists(p_emp_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_exists boolean := false;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'emp_code'
  ) then
    execute 'select exists(select 1 from public.employees where emp_code = $1)'
      into v_exists using p_emp_code;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'EmployeeId'
  ) then
    execute 'select exists(select 1 from public.employees where "EmployeeId" = $1)'
      into v_exists using p_emp_code;
  end if;

  if not v_exists then
    select exists(select 1 from public.attendance_workday aw where aw.emp_code = p_emp_code)
      into v_exists;
  end if;
  return v_exists;
end;
$$;

revoke all on function public._ta_employee_exists(text) from public;

-- 3) Private permission helper.
create or replace function public._ta_can_edit_shift(
  p_emp_code text,
  p_work_date date,
  p_confirm boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_active boolean;
  v_area text;
  v_sub_area text;
  v_department text;
begin
  select role, is_active
    into v_role, v_active
  from public.ta_user_profiles
  where user_id = auth.uid();

  if coalesce(v_active, false) is false then
    return false;
  end if;

  if v_role = 'HR_ADMIN' then
    return true;
  end if;

  if v_role <> 'USER' then
    return false;
  end if;

  select aw.area, aw.sub_area, aw.department
    into v_area, v_sub_area, v_department
  from public.attendance_workday aw
  where aw.emp_code = p_emp_code
  order by (aw.work_date = p_work_date) desc, aw.work_date desc
  limit 1;

  return exists (
    select 1
    from public.ta_user_scopes s
    where s.user_id = auth.uid()
      and coalesce(s.is_active, true)
      and (s.effective_from is null or s.effective_from <= p_work_date)
      and (s.effective_to is null or s.effective_to >= p_work_date)
      and case when p_confirm then coalesce(s.can_confirm_schedule, false)
               else coalesce(s.can_edit_schedule, false) end
      and (
        upper(coalesce(s.scope_type, '')) = 'ALL'
        or (upper(s.scope_type) = 'EMPLOYEE' and s.scope_value = p_emp_code)
        or (upper(s.scope_type) in ('ZONE','AREA') and s.scope_value = v_area)
        or (upper(s.scope_type) = 'SUB_AREA' and s.scope_value = v_sub_area)
        or (upper(s.scope_type) = 'DEPARTMENT' and s.scope_value = v_department)
      )
  );
exception
  when undefined_table or undefined_column then
    return v_role = 'HR_ADMIN';
end;
$$;

revoke all on function public._ta_can_edit_shift(text,date,boolean) from public;

-- 4) Private row writer shared by single and bulk RPC.
create or replace function public._ta_apply_shift_row(
  p_emp_code text,
  p_work_date date,
  p_shift_code text,
  p_note text,
  p_change_reason text,
  p_confirm_now boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp_code text := public.normalize_emp_code(p_emp_code);
  v_shift_code text := nullif(upper(trim(coalesce(p_shift_code, ''))), '');
  v_old_shift text;
  v_actor_email text := coalesce(auth.jwt()->>'email', auth.uid()::text, 'system');
  v_action text;
  v_area text;
  v_sub_area text;
  v_car_team text;
  v_manager_department text;
  v_manager_division text;
begin
  if v_emp_code is null or p_work_date is null then
    raise exception 'EMPLOYEE_AND_DATE_REQUIRED';
  end if;

  if not public._ta_can_edit_shift(v_emp_code, p_work_date, p_confirm_now) then
    raise exception 'SHIFT_PERMISSION_DENIED';
  end if;

  if not public._ta_employee_exists(v_emp_code) then
    raise exception 'EMPLOYEE_NOT_FOUND: %', v_emp_code;
  end if;

  select aw.area, aw.sub_area, aw.car_team, aw.manager_department, aw.manager_division
    into v_area, v_sub_area, v_car_team, v_manager_department, v_manager_division
  from public.attendance_workday aw
  where aw.emp_code = v_emp_code
  order by (aw.work_date = p_work_date) desc, aw.work_date desc
  limit 1;

  select sc.shift_code into v_old_shift
  from public.shift_calendar sc
  where sc.emp_code = v_emp_code and sc.work_date = p_work_date;

  if v_shift_code is null then
    delete from public.shift_calendar
    where emp_code = v_emp_code and work_date = p_work_date;

    update public.attendance_workday
    set shift_code = null,
        shift_name = null,
        shift_start_time = null,
        shift_end_time = null,
        schedule_source = null,
        schedule_note = p_note,
        updated_at = now()
    where emp_code = v_emp_code and work_date = p_work_date;

    v_action := 'DELETE';
  else
    if not exists (select 1 from public.shift_master sm where sm.shift_code = v_shift_code and coalesce(sm.is_active, true)) then
      raise exception 'SHIFT_CODE_NOT_FOUND: %', v_shift_code;
    end if;

    insert into public.shift_calendar (
      work_date, emp_code, shift_code,
      area, sub_area, car_team, manager_department, manager_division,
      source_type, note, created_by, updated_by,
      is_confirmed, confirmed_at, confirmed_by,
      change_reason, created_at, updated_at
    )
    values (
      p_work_date, v_emp_code, v_shift_code,
      v_area, v_sub_area, v_car_team, v_manager_department, v_manager_division,
      'manual', p_note, v_actor_email, v_actor_email, p_confirm_now,
      case when p_confirm_now then now() else null end,
      case when p_confirm_now then v_actor_email else null end,
      p_change_reason, now(), now()
    )
    on conflict (work_date, emp_code) do update
    set shift_code = excluded.shift_code,
        area = coalesce(excluded.area, public.shift_calendar.area),
        sub_area = coalesce(excluded.sub_area, public.shift_calendar.sub_area),
        car_team = coalesce(excluded.car_team, public.shift_calendar.car_team),
        manager_department = coalesce(excluded.manager_department, public.shift_calendar.manager_department),
        manager_division = coalesce(excluded.manager_division, public.shift_calendar.manager_division),
        source_type = 'manual',
        note = excluded.note,
        updated_by = excluded.updated_by,
        is_confirmed = excluded.is_confirmed,
        confirmed_at = excluded.confirmed_at,
        confirmed_by = excluded.confirmed_by,
        change_reason = excluded.change_reason,
        updated_at = now();

    update public.attendance_workday aw
    set shift_code = sm.shift_code,
        shift_name = sm.shift_name,
        shift_start_time = sm.start_time,
        shift_end_time = sm.end_time,
        is_night_shift = coalesce(sm.is_night_shift, false),
        schedule_source = 'manual',
        schedule_note = p_note,
        updated_at = now()
    from public.shift_master sm
    where aw.emp_code = v_emp_code
      and aw.work_date = p_work_date
      and sm.shift_code = v_shift_code;

    v_action := case when v_old_shift is null then 'INSERT'
                     when v_old_shift = v_shift_code and p_confirm_now then 'CONFIRM'
                     else 'UPDATE' end;
  end if;

  insert into public.ta_shift_assignment_audit (
    emp_code, work_date, old_shift_code, new_shift_code, action_type,
    note, change_reason, confirm_now, changed_by, changed_by_email
  )
  values (
    v_emp_code, p_work_date, v_old_shift, v_shift_code, v_action,
    p_note, p_change_reason, p_confirm_now, auth.uid(), v_actor_email
  );

  return jsonb_build_object(
    'emp_code', v_emp_code,
    'work_date', p_work_date,
    'old_shift_code', v_old_shift,
    'new_shift_code', v_shift_code,
    'action', v_action,
    'confirmed', p_confirm_now
  );
end;
$$;

revoke all on function public._ta_apply_shift_row(text,date,text,text,text,boolean) from public;

-- 5) Exact RPC signature used by the frontend modal and Review Center.
drop function if exists public.ta_assign_shift_single(text,date,text,text,text,boolean);
create function public.ta_assign_shift_single(
  p_emp_code text,
  p_work_date date,
  p_shift_code text,
  p_note text default null,
  p_change_reason text default null,
  p_confirm_now boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  v_result := public._ta_apply_shift_row(
    p_emp_code, p_work_date, p_shift_code, p_note,
    coalesce(p_change_reason, 'บันทึกกะจากหน้าเว็บ'), p_confirm_now
  );

  begin
    perform public.rebuild_attendance_workday(p_work_date, p_work_date, array[public.normalize_emp_code(p_emp_code)]);
  exception when others then
    null;
  end;

  return v_result;
end;
$$;

grant execute on function public.ta_assign_shift_single(text,date,text,text,text,boolean) to authenticated;

-- 6) Exact bulk RPC signature used by quick assign, paste, confirm, clear, undo and redo.
drop function if exists public.ta_assign_shifts_bulk(jsonb,text,boolean);
create function public.ta_assign_shifts_bulk(
  p_rows jsonb,
  p_change_reason text default null,
  p_confirm_now boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_count integer := 0;
  v_deleted integer := 0;
  v_emp_codes text[] := array[]::text[];
  v_emp text;
  v_date date;
  v_shift text;
  v_min_date date;
  v_max_date date;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'P_ROWS_MUST_BE_JSON_ARRAY';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    v_emp := public.normalize_emp_code(v_item->>'emp_code');
    v_date := nullif(v_item->>'work_date', '')::date;
    v_shift := nullif(upper(trim(coalesce(v_item->>'shift_code', ''))), '');

    perform public._ta_apply_shift_row(
      v_emp,
      v_date,
      v_shift,
      nullif(v_item->>'note', ''),
      coalesce(p_change_reason, 'บันทึกกะแบบหลายรายการจากหน้าเว็บ'),
      p_confirm_now
    );

    v_count := v_count + 1;
    if v_shift is null then v_deleted := v_deleted + 1; end if;
    v_emp_codes := array_append(v_emp_codes, v_emp);
    v_min_date := least(coalesce(v_min_date, v_date), v_date);
    v_max_date := greatest(coalesce(v_max_date, v_date), v_date);
  end loop;

  select coalesce(array_agg(distinct x), array[]::text[])
    into v_emp_codes
  from unnest(v_emp_codes) x;

  if v_count > 0 then
    begin
      perform public.rebuild_attendance_workday(v_min_date, v_max_date, v_emp_codes);
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'processed_rows', v_count,
    'saved_rows', v_count - v_deleted,
    'deleted_rows', v_deleted,
    'confirmed', p_confirm_now
  );
end;
$$;

grant execute on function public.ta_assign_shifts_bulk(jsonb,text,boolean) to authenticated;

-- 7) Delete RPC used by the assignment modal.
drop function if exists public.ta_delete_shift_assignments_bulk(text[],date,date,text);
create function public.ta_delete_shift_assignments_bulk(
  p_emp_codes text[],
  p_start_date date,
  p_end_date date,
  p_change_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp text;
  v_date date;
  v_count integer := 0;
begin
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  for v_emp, v_date in
    select sc.emp_code, sc.work_date
    from public.shift_calendar sc
    where sc.work_date between p_start_date and p_end_date
      and (p_emp_codes is null or sc.emp_code = any(p_emp_codes))
  loop
    perform public._ta_apply_shift_row(
      v_emp, v_date, null, 'ลบกะที่จัดไว้',
      coalesce(p_change_reason, 'ลบกะจากหน้าเว็บ'), false
    );
    v_count := v_count + 1;
  end loop;

  if v_count > 0 then
    begin
      perform public.rebuild_attendance_workday(p_start_date, p_end_date, p_emp_codes);
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object('deleted_rows', v_count);
end;
$$;

grant execute on function public.ta_delete_shift_assignments_bulk(text[],date,date,text) to authenticated;

-- 8) Shift master save RPC used by HR Admin > Shift Master.
drop function if exists public.ta_upsert_shift_master(text,text,time,time,boolean,boolean,integer,integer,text,boolean,text);
create function public.ta_upsert_shift_master(
  p_shift_code text,
  p_shift_name text,
  p_start_time time,
  p_end_time time,
  p_is_night_shift boolean,
  p_is_workday boolean,
  p_break_minutes integer,
  p_display_order integer,
  p_note text,
  p_is_active boolean,
  p_change_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := nullif(upper(trim(coalesce(p_shift_code, ''))), '');
  v_role text;
begin
  select role into v_role from public.ta_user_profiles where user_id = auth.uid() and is_active;
  if v_role <> 'HR_ADMIN' then raise exception 'HR_ADMIN_REQUIRED'; end if;
  if v_code is null or nullif(trim(coalesce(p_shift_name, '')), '') is null then
    raise exception 'SHIFT_CODE_AND_NAME_REQUIRED';
  end if;

  insert into public.shift_master (
    shift_code, shift_name, start_time, end_time, is_night_shift, is_workday,
    break_minutes, sort_order, display_order, note, is_active, updated_at
  )
  values (
    v_code, trim(p_shift_name), p_start_time, p_end_time,
    coalesce(p_is_night_shift, false), coalesce(p_is_workday, true),
    greatest(coalesce(p_break_minutes, 0), 0), coalesce(p_display_order, 0),
    coalesce(p_display_order, 0), p_note, coalesce(p_is_active, true), now()
  )
  on conflict (shift_code) do update
  set shift_name = excluded.shift_name,
      start_time = excluded.start_time,
      end_time = excluded.end_time,
      is_night_shift = excluded.is_night_shift,
      is_workday = excluded.is_workday,
      break_minutes = excluded.break_minutes,
      sort_order = excluded.sort_order,
      display_order = excluded.display_order,
      note = excluded.note,
      is_active = excluded.is_active,
      updated_at = now();

  return jsonb_build_object('shift_code', v_code, 'saved', true, 'change_reason', p_change_reason);
end;
$$;

grant execute on function public.ta_upsert_shift_master(text,text,time,time,boolean,boolean,integer,integer,text,boolean,text) to authenticated;

-- 9) Optimized Review Queue with the exact frontend parameter names.
drop function if exists public.ta_get_review_queue(date,date,text,text,text[],text[]);
create function public.ta_get_review_queue(
  p_start_date date,
  p_end_date date,
  p_zone text default null,
  p_department text default null,
  p_emp_codes text[] default null,
  p_issue_types text[] default null
)
returns table (
  work_date date,
  emp_code text,
  full_name text,
  department text,
  zone text,
  auto_shift_code text,
  suggested_shift_code text,
  suggestion_confidence numeric,
  assigned_shift_code text,
  effective_shift_code text,
  schedule_status text,
  actual_in_at time,
  actual_out_at time,
  first_in time,
  last_out time,
  attendance_result text,
  attendance_status text,
  time_pair_status text,
  issue_type text
)
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select
      aw.work_date,
      aw.emp_code,
      aw.full_name,
      aw.department,
      aw.area as zone,
      aw.first_in,
      aw.last_out,
      aw.expected_day,
      aw.shift_code as attendance_shift_code,
      aw.is_night_shift,
      sc.shift_code as assigned_shift_code,
      coalesce(sc.is_confirmed, false) as is_confirmed,
      case
        when exists (select 1 from public.holidays h where h.holiday_date = aw.work_date) then 'HOL'
        when aw.expected_day = 0 then 'OFF'
        when aw.is_night_shift or aw.first_in >= time '18:00' then 'N'
        else 'D'
      end as inferred_shift_code,
      case
        when aw.expected_day = 1 and aw.first_in is null and aw.last_out is null then 'ABSENT'
        when aw.first_in is null and aw.last_out is not null then 'MISSING_IN'
        when aw.first_in is not null and aw.last_out is null then 'MISSING_OUT'
        when aw.expected_day = 0 and (aw.first_in is not null or aw.last_out is not null) then 'WORKED_ON_OFFDAY'
        when sc.shift_code is null and aw.shift_code is null and aw.first_in is not null and aw.last_out is not null then 'NEED_REVIEW'
        else 'NORMAL'
      end as calc_issue
    from public.attendance_workday aw
    left join public.shift_calendar sc
      on sc.emp_code = aw.emp_code and sc.work_date = aw.work_date
    where aw.work_date between p_start_date and p_end_date
      and (p_zone is null or aw.area = p_zone)
      and (p_department is null or aw.department = p_department)
      and (p_emp_codes is null or aw.emp_code = any(p_emp_codes))
  )
  select
    b.work_date,
    b.emp_code,
    b.full_name,
    b.department,
    b.zone,
    coalesce(b.attendance_shift_code, b.inferred_shift_code) as auto_shift_code,
    b.inferred_shift_code as suggested_shift_code,
    case when b.assigned_shift_code is not null then 100
         when b.first_in is not null then 85
         else 60 end::numeric as suggestion_confidence,
    b.assigned_shift_code,
    coalesce(b.assigned_shift_code, b.attendance_shift_code, b.inferred_shift_code) as effective_shift_code,
    case when b.is_confirmed then 'CONFIRMED'
         when b.assigned_shift_code is not null then 'ASSIGNED'
         when b.calc_issue = 'NEED_REVIEW' then 'NEED_REVIEW'
         else 'AUTO' end as schedule_status,
    b.first_in as actual_in_at,
    b.last_out as actual_out_at,
    b.first_in,
    b.last_out,
    b.calc_issue as attendance_result,
    b.calc_issue as attendance_status,
    b.calc_issue as time_pair_status,
    b.calc_issue as issue_type
  from base b
  where b.calc_issue <> 'NORMAL'
    and (p_issue_types is null or b.calc_issue = any(p_issue_types))
  order by b.work_date desc, b.department nulls last, b.emp_code;
$$;

grant execute on function public.ta_get_review_queue(date,date,text,text,text[],text[]) to authenticated;

-- 10) RLS / grants for the audit table. RPCs write through controlled functions only.
alter table public.ta_shift_assignment_audit enable row level security;

drop policy if exists ta_shift_audit_hr_admin_select on public.ta_shift_assignment_audit;
create policy ta_shift_audit_hr_admin_select
on public.ta_shift_assignment_audit
for select
to authenticated
using (
  exists (
    select 1 from public.ta_user_profiles p
    where p.user_id = auth.uid() and p.is_active and p.role = 'HR_ADMIN'
  )
);

grant select on public.ta_shift_assignment_audit to authenticated;
grant usage, select on sequence public.ta_shift_assignment_audit_id_seq to authenticated;

-- Refresh PostgREST immediately so the browser can find the new signatures.
notify pgrst, 'reload schema';

commit;
