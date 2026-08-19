-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.2
-- Day-off Quota Hard Guard
--
-- หลักการ:
-- 1) วันหยุดคงเหลือ = 0 และวันที่เป้าหมายยังไม่ได้ใช้สิทธิ์วันหยุด -> ห้ามเพิ่มกะวันหยุด
-- 2) ถ้าวันเป้าหมายเป็นวันหยุดที่ถูกนับสิทธิ์อยู่แล้ว -> บันทึก/เปลี่ยนรหัสวันหยุดได้โดยไม่ใช้สิทธิ์เพิ่ม
-- 3) เปลี่ยนวันหยุดเดิมเป็นวันทำงาน -> คืนสิทธิ์ 1 วัน
-- 4) Bulk / Fill / Paste / Copy Week คิดผลกระทบสุทธิ และรองรับการย้ายวันหยุดในชุดเดียว
-- 5) Default weekly off / public holiday ยังคงคำนวณตาม ta_get_dayoff_balance_v6134
-- ============================================================================

begin;
set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- 1) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.ta_get_dayoff_balance_v6134(text,date)') is null then
    raise exception 'MISSING_V6134: กรุณารัน SQL V6.13.4 ก่อน';
  end if;
  if to_regprocedure('public.ta_assign_shift_single_v651(text,date,text,text,text,boolean)') is null then
    raise exception 'MISSING_RPC: ta_assign_shift_single_v651';
  end if;
  if to_regprocedure('public.ta_assign_shifts_bulk_v651(jsonb,text,boolean)') is null then
    raise exception 'MISSING_RPC: ta_assign_shifts_bulk_v651';
  end if;
  if to_regprocedure('public.ta_assign_shift_with_work_plan_v6126(text,date,text,text,time,time,text,text,text,boolean)') is null then
    raise exception 'MISSING_RPC: ta_assign_shift_with_work_plan_v6126';
  end if;
  if to_regclass('public.shift_calendar') is null then
    raise exception 'MISSING_TABLE: shift_calendar';
  end if;
  if to_regclass('public.shift_master') is null then
    raise exception 'MISSING_TABLE: shift_master';
  end if;
  if to_regclass('public.ta_dayoff_settings') is null then
    raise exception 'MISSING_TABLE: ta_dayoff_settings';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Does this date + explicit shift consume one day-off quota?
--    p_shift_code NULL means "no explicit assignment" -> use policy default.
-- ---------------------------------------------------------------------------
create or replace function public._ta_dayoff_consumes_quota_v6142(
  p_emp_code text,
  p_work_date date,
  p_shift_code text
)
returns boolean
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_code text := nullif(upper(trim(coalesce(p_shift_code,''))), '');
  v_position text;
  v_manager_pattern text;
  v_dows integer[];
  v_manager_dows integer[];
  v_other_dows integer[];
  v_policy_dayoff boolean := false;
  v_is_workday boolean;
  v_shift_exists boolean := false;
begin
  if nullif(v_emp,'') is null or p_work_date is null then
    return false;
  end if;

  select
    s.manager_position_pattern,
    s.manager_weekly_off_dows,
    s.other_weekly_off_dows
  into
    v_manager_pattern,
    v_manager_dows,
    v_other_dows
  from public.ta_dayoff_settings s
  where s.setting_id=1;

  select nullif(trim(coalesce(to_jsonb(e)->>'position_name','')),'')
  into v_position
  from public.employees e
  where public.normalize_emp_code(e."EmployeeId")=v_emp
  order by e."EmployeeId"
  limit 1;

  v_dows := case
    when coalesce(v_position,'') ilike '%'||coalesce(v_manager_pattern,'ผู้จัดการแผนก')||'%'
      then coalesce(v_manager_dows,array[0,6]::integer[])
    else coalesce(v_other_dows,array[0]::integer[])
  end;

  v_policy_dayoff :=
    extract(dow from p_work_date)::integer = any(v_dows)
    or exists(
      select 1
      from public.holidays h
      where h.holiday_date=p_work_date
    );

  -- No explicit assignment: natural policy day-off consumes quota.
  if v_code is null then
    return v_policy_dayoff;
  end if;

  -- Leave does not consume day-off quota (same rule as V6.13.4 balance).
  if v_code in ('LV','LEAVE') then
    return false;
  end if;

  -- Holiday and legacy semantic OFF are non-working quota days.
  if v_code in ('HOL','OFF') then
    return true;
  end if;

  select true,coalesce(sm.is_workday,true)
  into v_shift_exists,v_is_workday
  from public.shift_master sm
  where upper(trim(sm.shift_code))=v_code
  order by coalesce(sm.updated_at,now()) desc
  limit 1;

  if coalesce(v_shift_exists,false) then
    return not coalesce(v_is_workday,true);
  end if;

  -- Future paired day-off codes are also treated as day-off even if the
  -- Shift Master cache is temporarily incomplete.
  if exists(
    select 1
    from public.ta_shift_schedule_rules_v6123 r
    where r.paired_off_shift_code is not null
      and upper(trim(r.paired_off_shift_code))=v_code
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public._ta_dayoff_consumes_quota_v6142(text,date,text) from public;

-- ---------------------------------------------------------------------------
-- 3) Single-cell projected quota validator
-- ---------------------------------------------------------------------------
create or replace function public.ta_validate_dayoff_quota_v6142(
  p_emp_code text,
  p_work_date date,
  p_proposed_shift_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_month date := date_trunc('month',coalesce(p_work_date,current_date))::date;
  v_balance_info jsonb;
  v_status text;
  v_balance numeric := 0;
  v_current_shift text;
  v_current_consumes boolean := false;
  v_proposed_consumes boolean := false;
  v_delta integer := 0;
  v_projected numeric := 0;
  v_allowed boolean := true;
begin
  if nullif(v_emp,'') is null then raise exception 'EMP_CODE_REQUIRED'; end if;
  if p_work_date is null then raise exception 'WORK_DATE_REQUIRED'; end if;

  v_balance_info := public.ta_get_dayoff_balance_v6134(v_emp,v_month);
  v_status := coalesce(v_balance_info->>'status','ACTIVE');

  -- Before configured quota start month, do not introduce a new restriction.
  if v_status <> 'ACTIVE' then
    return jsonb_build_object(
      'allowed',true,
      'emp_code',v_emp,
      'work_date',p_work_date,
      'month',v_month,
      'status',v_status,
      'guard_version','V6.14.2'
    );
  end if;

  v_balance := coalesce(nullif(v_balance_info->>'balance_days','')::numeric,0);

  select upper(trim(coalesce(sc.shift_code,'')))
  into v_current_shift
  from public.shift_calendar sc
  where public.normalize_emp_code(sc.emp_code)=v_emp
    and sc.work_date=p_work_date
  order by coalesce(sc.updated_at,now()) desc
  limit 1;

  v_current_consumes := public._ta_dayoff_consumes_quota_v6142(
    v_emp,p_work_date,nullif(v_current_shift,'')
  );
  v_proposed_consumes := public._ta_dayoff_consumes_quota_v6142(
    v_emp,p_work_date,p_proposed_shift_code
  );

  -- +1 means this edit consumes one additional day-off.
  -- -1 means this edit returns one day-off to the balance.
  v_delta := (case when v_proposed_consumes then 1 else 0 end)
           - (case when v_current_consumes then 1 else 0 end);

  v_projected := v_balance - v_delta;
  v_allowed := v_projected >= 0;

  return jsonb_build_object(
    'allowed',v_allowed,
    'emp_code',v_emp,
    'work_date',p_work_date,
    'month',v_month,
    'current_shift_code',nullif(v_current_shift,''),
    'proposed_shift_code',nullif(upper(trim(coalesce(p_proposed_shift_code,''))),''),
    'current_consumes_dayoff',v_current_consumes,
    'proposed_consumes_dayoff',v_proposed_consumes,
    'additional_dayoff_delta',v_delta,
    'balance_before',v_balance,
    'projected_balance',v_projected,
    'month_quota_days',coalesce(nullif(v_balance_info->>'month_quota_days','')::numeric,0),
    'used_days',coalesce(nullif(v_balance_info->>'used_days','')::numeric,0),
    'carried_in_days',coalesce(nullif(v_balance_info->>'carried_in_days','')::numeric,0),
    'message',case
      when v_allowed then 'DAYOFF_QUOTA_OK'
      else format('DAYOFF_QUOTA_EXHAUSTED: คงเหลือ %s วัน ไม่สามารถกำหนดวันหยุดเพิ่มได้',v_balance)
    end,
    'guard_version','V6.14.2'
  );
end;
$$;

revoke all on function public.ta_validate_dayoff_quota_v6142(text,date,text) from public;
grant execute on function public.ta_validate_dayoff_quota_v6142(text,date,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Bulk projected quota validator
--    Computes NET changes per employee/month, so moving a day-off in the same
--    bulk operation is allowed when total quota usage does not increase.
-- ---------------------------------------------------------------------------
create or replace function public.ta_validate_dayoff_quota_bulk_v6142(
  p_rows jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  v_result jsonb;
  v_carry_enabled boolean := true;
begin
  if jsonb_typeof(coalesce(p_rows,'[]'::jsonb)) <> 'array' then
    raise exception 'SHIFT_ROWS_MUST_BE_ARRAY';
  end if;

  select coalesce(s.carry_forward_enabled,true)
  into v_carry_enabled
  from public.ta_dayoff_settings s
  where s.setting_id=1;

  with raw as (
    select
      x.ord::bigint as ord,
      public.normalize_emp_code(x.item->>'emp_code') as emp_code,
      nullif(x.item->>'work_date','')::date as work_date,
      nullif(upper(trim(coalesce(x.item->>'shift_code',''))),'') as proposed_shift_code
    from jsonb_array_elements(coalesce(p_rows,'[]'::jsonb)) with ordinality x(item,ord)
  ), final_rows as (
    select distinct on (r.emp_code,r.work_date)
      r.emp_code,r.work_date,r.proposed_shift_code,r.ord
    from raw r
    where nullif(r.emp_code,'') is not null
      and r.work_date is not null
    order by r.emp_code,r.work_date,r.ord desc
  ), effects as (
    select
      f.emp_code,
      f.work_date,
      date_trunc('month',f.work_date)::date as month_date,
      f.proposed_shift_code,
      current_row.current_shift_code,
      public._ta_dayoff_consumes_quota_v6142(
        f.emp_code,f.work_date,current_row.current_shift_code
      ) as current_consumes,
      public._ta_dayoff_consumes_quota_v6142(
        f.emp_code,f.work_date,f.proposed_shift_code
      ) as proposed_consumes
    from final_rows f
    left join lateral (
      select nullif(upper(trim(coalesce(sc.shift_code,''))),'') as current_shift_code
      from public.shift_calendar sc
      where public.normalize_emp_code(sc.emp_code)=f.emp_code
        and sc.work_date=f.work_date
      order by coalesce(sc.updated_at,now()) desc
      limit 1
    ) current_row on true
  ), month_effects as (
    select
      e.emp_code,
      e.month_date,
      sum(
        (case when e.current_consumes then 1 else 0 end)
        - (case when e.proposed_consumes then 1 else 0 end)
      )::numeric as balance_delta,
      count(*) filter (
        where not e.current_consumes and e.proposed_consumes
      )::integer as additional_dayoffs,
      count(*) filter (
        where e.current_consumes and not e.proposed_consumes
      )::integer as returned_dayoffs
    from effects e
    group by e.emp_code,e.month_date
  ), balances as (
    select
      m.*,
      b.info,
      coalesce(nullif(b.info->>'balance_days','')::numeric,0) as current_balance,
      coalesce(b.info->>'status','ACTIVE') as quota_status
    from month_effects m
    cross join lateral (
      select public.ta_get_dayoff_balance_v6134(m.emp_code,m.month_date) as info
    ) b
  ), projected as (
    select
      b.*,
      case
        when b.quota_status <> 'ACTIVE' then b.current_balance
        when v_carry_enabled then
          b.current_balance
          + sum(b.balance_delta) over (
              partition by b.emp_code
              order by b.month_date
              rows between unbounded preceding and current row
            )
        else b.current_balance+b.balance_delta
      end as projected_balance
    from balances b
  ), violations as (
    select *
    from projected p
    where p.quota_status='ACTIVE'
      and p.projected_balance < 0
  )
  select jsonb_build_object(
    'allowed',not exists(select 1 from violations),
    'checked_rows',(select count(*) from final_rows),
    'checked_employee_months',(select count(*) from projected),
    'violations',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'emp_code',v.emp_code,
          'month',v.month_date,
          'balance_before',v.current_balance,
          'balance_delta',v.balance_delta,
          'projected_balance',v.projected_balance,
          'additional_dayoffs',v.additional_dayoffs,
          'returned_dayoffs',v.returned_dayoffs,
          'message','DAYOFF_QUOTA_EXHAUSTED'
        ) order by v.emp_code,v.month_date
      )
      from violations v
    ),'[]'::jsonb),
    'months',coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'emp_code',p.emp_code,
          'month',p.month_date,
          'balance_before',p.current_balance,
          'balance_delta',p.balance_delta,
          'projected_balance',p.projected_balance,
          'additional_dayoffs',p.additional_dayoffs,
          'returned_dayoffs',p.returned_dayoffs,
          'status',p.quota_status
        ) order by p.emp_code,p.month_date
      )
      from projected p
    ),'[]'::jsonb),
    'carry_forward_enabled',v_carry_enabled,
    'guard_version','V6.14.2'
  ) into v_result;

  return coalesce(v_result,jsonb_build_object(
    'allowed',true,'checked_rows',0,'violations','[]'::jsonb,'guard_version','V6.14.2'
  ));
end;
$$;

revoke all on function public.ta_validate_dayoff_quota_bulk_v6142(jsonb) from public;
grant execute on function public.ta_validate_dayoff_quota_bulk_v6142(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Guarded wrappers used by every frontend scheduling write path
-- ---------------------------------------------------------------------------
create or replace function public.ta_assign_shift_single_v6142(
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
set search_path=public
as $$
declare
  v_guard jsonb;
  v_result jsonb;
begin
  v_guard := public.ta_validate_dayoff_quota_v6142(
    p_emp_code,p_work_date,p_shift_code
  );
  if coalesce((v_guard->>'allowed')::boolean,false)=false then
    raise exception 'DAYOFF_QUOTA_EXHAUSTED: %',coalesce(v_guard->>'message','วันหยุดคงเหลือไม่เพียงพอ');
  end if;

  v_result := public.ta_assign_shift_single_v651(
    p_emp_code,p_work_date,p_shift_code,p_note,p_change_reason,p_confirm_now
  );
  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object('dayoff_quota_guard',v_guard,'version','V6.14.2');
end;
$$;

revoke all on function public.ta_assign_shift_single_v6142(text,date,text,text,text,boolean) from public;
grant execute on function public.ta_assign_shift_single_v6142(text,date,text,text,text,boolean) to authenticated;

create or replace function public.ta_assign_shifts_bulk_v6142(
  p_rows jsonb,
  p_change_reason text default null,
  p_confirm_now boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_guard jsonb;
  v_result jsonb;
begin
  v_guard := public.ta_validate_dayoff_quota_bulk_v6142(p_rows);
  if coalesce((v_guard->>'allowed')::boolean,false)=false then
    raise exception 'DAYOFF_QUOTA_EXHAUSTED: %',coalesce(v_guard->'violations','[]'::jsonb)::text;
  end if;

  v_result := public.ta_assign_shifts_bulk_v651(
    p_rows,p_change_reason,p_confirm_now
  );
  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object('dayoff_quota_guard',v_guard,'version','V6.14.2');
end;
$$;

revoke all on function public.ta_assign_shifts_bulk_v6142(jsonb,text,boolean) from public;
grant execute on function public.ta_assign_shifts_bulk_v6142(jsonb,text,boolean) to authenticated;

create or replace function public.ta_assign_shift_with_work_plan_v6142(
  p_emp_code text,
  p_work_date date,
  p_shift_code text,
  p_template_code text,
  p_customer_window_start time default null,
  p_customer_window_end time default null,
  p_customer_end_mode text default 'ACTUAL_OUT',
  p_note text default null,
  p_change_reason text default null,
  p_confirm_now boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_guard jsonb;
  v_result jsonb;
begin
  v_guard := public.ta_validate_dayoff_quota_v6142(
    p_emp_code,p_work_date,p_shift_code
  );
  if coalesce((v_guard->>'allowed')::boolean,false)=false then
    raise exception 'DAYOFF_QUOTA_EXHAUSTED: %',coalesce(v_guard->>'message','วันหยุดคงเหลือไม่เพียงพอ');
  end if;

  v_result := public.ta_assign_shift_with_work_plan_v6126(
    p_emp_code,p_work_date,p_shift_code,p_template_code,
    p_customer_window_start,p_customer_window_end,p_customer_end_mode,
    p_note,p_change_reason,p_confirm_now
  );
  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object('dayoff_quota_guard',v_guard,'version','V6.14.2');
end;
$$;

revoke all on function public.ta_assign_shift_with_work_plan_v6142(
  text,date,text,text,time,time,text,text,text,boolean
) from public;
grant execute on function public.ta_assign_shift_with_work_plan_v6142(
  text,date,text,text,time,time,text,text,text,boolean
) to authenticated;

notify pgrst, 'reload schema';
commit;
