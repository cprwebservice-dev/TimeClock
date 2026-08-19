-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.14.3
-- Day-off Quota Return Guard + Leave Scheduling Compatibility
--
-- หลักการ:
-- 1) โควต้าติดลบ/เป็น 0 ห้าม "ใช้วันหยุดเพิ่ม" เท่านั้น
-- 2) เปลี่ยนวันหยุดเดิม -> กะทำงาน ต้องอนุญาตเสมอ เพราะเป็นการคืนสิทธิ์
-- 3) บันทึกวันหยุดเดิมซ้ำ (ไม่เพิ่มการใช้) ต้องอนุญาต
-- 4) Bulk ใช้ผลกระทบสุทธิ: block เฉพาะรายการที่ทำให้การใช้วันหยุดเพิ่มและยอดยังติดลบ
-- 5) LV/LEAVE ไม่หัก Day-off Quota ตามกฎเดิม
-- ============================================================================

begin;
set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- 1) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public._ta_dayoff_consumes_quota_v6142(text,date,text)') is null then
    raise exception 'MISSING_V6142: กรุณารัน SQL V6.14.2 ก่อน';
  end if;
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
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Single-cell validator V6.14.3
--    Important fix from V6.14.2:
--    - When current balance is already negative, a RETURN/no-increase edit must
--      still be allowed even if projected balance remains below zero.
-- ---------------------------------------------------------------------------
create or replace function public.ta_validate_dayoff_quota_v6143(
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
  v_action text := 'NO_CHANGE';
begin
  if nullif(v_emp,'') is null then raise exception 'EMP_CODE_REQUIRED'; end if;
  if p_work_date is null then raise exception 'WORK_DATE_REQUIRED'; end if;

  v_balance_info := public.ta_get_dayoff_balance_v6134(v_emp,v_month);
  v_status := coalesce(v_balance_info->>'status','ACTIVE');

  if v_status <> 'ACTIVE' then
    return jsonb_build_object(
      'allowed',true,
      'emp_code',v_emp,
      'work_date',p_work_date,
      'month',v_month,
      'status',v_status,
      'guard_version','V6.14.3'
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

  -- +1 = uses one additional day-off
  --  0 = quota-neutral
  -- -1 = returns one day-off
  v_delta := (case when v_proposed_consumes then 1 else 0 end)
           - (case when v_current_consumes then 1 else 0 end);

  v_projected := v_balance - v_delta;

  v_action := case
    when v_delta > 0 then 'CONSUME_MORE'
    when v_delta < 0 then 'RETURN_DAYOFF'
    else 'NO_ADDITIONAL_USE'
  end;

  -- Critical rule:
  -- only block when this edit CONSUMES MORE and quota would remain negative.
  -- Returning quota or a quota-neutral edit is always allowed.
  v_allowed := (v_delta <= 0) or (v_projected >= 0);

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
    'quota_action',v_action,
    'balance_before',v_balance,
    'projected_balance',v_projected,
    'month_quota_days',coalesce(nullif(v_balance_info->>'month_quota_days','')::numeric,0),
    'used_days',coalesce(nullif(v_balance_info->>'used_days','')::numeric,0),
    'carried_in_days',coalesce(nullif(v_balance_info->>'carried_in_days','')::numeric,0),
    'message',case
      when v_allowed and v_delta < 0 then 'DAYOFF_QUOTA_RETURN_ALLOWED'
      when v_allowed then 'DAYOFF_QUOTA_OK'
      else format('DAYOFF_QUOTA_EXHAUSTED: คงเหลือ %s วัน ไม่สามารถใช้วันหยุดเพิ่มได้',v_balance)
    end,
    'guard_version','V6.14.3'
  );
end;
$$;

revoke all on function public.ta_validate_dayoff_quota_v6143(text,date,text) from public;
grant execute on function public.ta_validate_dayoff_quota_v6143(text,date,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Bulk validator V6.14.3
--    balance_delta > 0 = return quota
--    balance_delta = 0 = neutral
--    balance_delta < 0 = consume more quota
-- ---------------------------------------------------------------------------
create or replace function public.ta_validate_dayoff_quota_bulk_v6143(
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
      -- V6.14.3: an already-negative account may be improved or unchanged.
      -- Block only when this batch consumes MORE quota and still ends negative.
      and p.balance_delta < 0
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
          'status',p.quota_status,
          'quota_action',case when p.balance_delta>0 then 'RETURN_DAYOFF' when p.balance_delta<0 then 'CONSUME_MORE' else 'NO_ADDITIONAL_USE' end
        ) order by p.emp_code,p.month_date
      )
      from projected p
    ),'[]'::jsonb),
    'carry_forward_enabled',v_carry_enabled,
    'guard_version','V6.14.3'
  ) into v_result;

  return coalesce(v_result,jsonb_build_object(
    'allowed',true,'checked_rows',0,'violations','[]'::jsonb,'guard_version','V6.14.3'
  ));
end;
$$;

revoke all on function public.ta_validate_dayoff_quota_bulk_v6143(jsonb) from public;
grant execute on function public.ta_validate_dayoff_quota_bulk_v6143(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Guarded write wrappers V6.14.3
-- ---------------------------------------------------------------------------
create or replace function public.ta_assign_shift_single_v6143(
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
  v_guard := public.ta_validate_dayoff_quota_v6143(
    p_emp_code,p_work_date,p_shift_code
  );
  if coalesce((v_guard->>'allowed')::boolean,false)=false then
    raise exception 'DAYOFF_QUOTA_EXHAUSTED: %',coalesce(v_guard->>'message','วันหยุดคงเหลือไม่เพียงพอ');
  end if;

  v_result := public.ta_assign_shift_single_v651(
    p_emp_code,p_work_date,p_shift_code,p_note,p_change_reason,p_confirm_now
  );
  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object('dayoff_quota_guard',v_guard,'version','V6.14.3');
end;
$$;

revoke all on function public.ta_assign_shift_single_v6143(text,date,text,text,text,boolean) from public;
grant execute on function public.ta_assign_shift_single_v6143(text,date,text,text,text,boolean) to authenticated;

create or replace function public.ta_assign_shifts_bulk_v6143(
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
  v_guard := public.ta_validate_dayoff_quota_bulk_v6143(p_rows);
  if coalesce((v_guard->>'allowed')::boolean,false)=false then
    raise exception 'DAYOFF_QUOTA_EXHAUSTED: %',coalesce(v_guard->'violations','[]'::jsonb)::text;
  end if;

  v_result := public.ta_assign_shifts_bulk_v651(
    p_rows,p_change_reason,p_confirm_now
  );
  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object('dayoff_quota_guard',v_guard,'version','V6.14.3');
end;
$$;

revoke all on function public.ta_assign_shifts_bulk_v6143(jsonb,text,boolean) from public;
grant execute on function public.ta_assign_shifts_bulk_v6143(jsonb,text,boolean) to authenticated;

create or replace function public.ta_assign_shift_with_work_plan_v6143(
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
  v_guard := public.ta_validate_dayoff_quota_v6143(
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
    || jsonb_build_object('dayoff_quota_guard',v_guard,'version','V6.14.3');
end;
$$;

revoke all on function public.ta_assign_shift_with_work_plan_v6143(
  text,date,text,text,time,time,text,text,text,boolean
) from public;
grant execute on function public.ta_assign_shift_with_work_plan_v6143(
  text,date,text,text,time,time,text,text,text,boolean
) to authenticated;

notify pgrst, 'reload schema';
commit;
