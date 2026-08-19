-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.13.3
-- Schedule Accuracy + Day-off Quota Fix
-- ============================================================================

begin;
set local statement_timeout = '0';

-- 1) Preflight ----------------------------------------------------------------
do $$
begin
  if to_regclass('public.ta_dayoff_settings') is null then
    raise exception 'MISSING_TABLE: ta_dayoff_settings';
  end if;
  if to_regclass('public.ta_dayoff_opening_balance') is null then
    raise exception 'MISSING_TABLE: ta_dayoff_opening_balance';
  end if;
  if to_regclass('public.shift_calendar') is null then
    raise exception 'MISSING_TABLE: shift_calendar';
  end if;
  if to_regclass('public.shift_master') is null then
    raise exception 'MISSING_TABLE: shift_master';
  end if;
  if to_regclass('public.holidays') is null then
    raise exception 'MISSING_TABLE: holidays';
  end if;
  if to_regclass('public.employees') is null then
    raise exception 'MISSING_TABLE: employees';
  end if;
  if to_regclass('public.ta_shift_schedule_rules_v6123') is null then
    raise exception 'MISSING_TABLE: ta_shift_schedule_rules_v6123';
  end if;
  if to_regprocedure('public.normalize_emp_code(text)') is null then
    raise exception 'MISSING_FUNCTION: normalize_emp_code';
  end if;
  if to_regprocedure('public.ta_v6120_can_schedule()') is null then
    raise exception 'MISSING_FUNCTION: ta_v6120_can_schedule';
  end if;
end;
$$;

-- 2) Indexes used by quota calculation ---------------------------------------
create index if not exists idx_shift_calendar_emp_date_code_v6133
  on public.shift_calendar(emp_code,work_date,shift_code);

create index if not exists idx_shift_master_code_workday_v6133
  on public.shift_master(shift_code,is_workday,is_active);

create index if not exists idx_shift_rule_paired_off_v6133
  on public.ta_shift_schedule_rules_v6123(paired_off_shift_code)
  where paired_off_shift_code is not null;

create index if not exists idx_holidays_date_v6133
  on public.holidays(holiday_date);

-- 3) Correct day-off balance --------------------------------------------------
-- Business rule:
-- - ผู้จัดการแผนก: เสาร์ + อาทิตย์ + วันหยุดนักขัตฤกษ์
-- - ตำแหน่งอื่น: อาทิตย์ + วันหยุดนักขัตฤกษ์
-- - วันเดียวกันนับเพียง 1 สิทธิ์ แม้เป็นทั้งวันหยุดประจำสัปดาห์และนักขัตฤกษ์
-- - "ใช้ไป" = วันที่มีการจัดกะวันหยุดจริงใน shift_calendar
--   รองรับ OFF/HOL และกะวันหยุดจาก Shift Master / Paired OFF เช่น
--   OSTD, OS043, OS134, OS135 รวมถึงรหัสวันหยุดอื่นในอนาคต
-- - LV/LEAVE ไม่หักโควต้าวันหยุด
-- - ยอดคงเหลือยกไปเดือนถัดไปตาม carry_forward_enabled
create or replace function public.ta_get_dayoff_balance_v6133(
  p_emp_code text,
  p_month date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_target date := date_trunc('month',coalesce(p_month,current_date))::date;
  v_start date;
  v_position text;
  v_manager_pattern text;
  v_dows integer[];
  v_manager_dows integer[];
  v_other_dows integer[];
  v_month date;
  v_quota integer := 0;
  v_used integer := 0;
  v_balance numeric := 0;
  v_carry numeric := 0;
  v_open numeric := 0;
  v_carry_enabled boolean := true;
  v_is_first boolean := true;
begin
  if not public.ta_v6120_can_schedule() then
    raise exception 'SCHEDULE_PERMISSION_DENIED';
  end if;

  if nullif(v_emp,'') is null then
    raise exception 'EMP_CODE_REQUIRED';
  end if;

  select
    s.effective_start_month,
    s.manager_position_pattern,
    s.manager_weekly_off_dows,
    s.other_weekly_off_dows,
    s.carry_forward_enabled
  into
    v_start,
    v_manager_pattern,
    v_manager_dows,
    v_other_dows,
    v_carry_enabled
  from public.ta_dayoff_settings s
  where s.setting_id = 1;

  if v_start is null then
    raise exception 'DAYOFF_SETTINGS_NOT_FOUND';
  end if;

  select nullif(trim(coalesce(to_jsonb(e)->>'position_name','')),'')
  into v_position
  from public.employees e
  where public.normalize_emp_code(e."EmployeeId") = v_emp
  order by e."EmployeeId"
  limit 1;

  v_dows := case
    when coalesce(v_position,'') ilike '%' || coalesce(v_manager_pattern,'ผู้จัดการแผนก') || '%'
      then coalesce(v_manager_dows,array[0,6]::integer[])
    else coalesce(v_other_dows,array[0]::integer[])
  end;

  if v_target < v_start then
    return jsonb_build_object(
      'emp_code',v_emp,
      'position_name',v_position,
      'month',v_target,
      'effective_start_month',v_start,
      'month_quota_days',0,
      'used_days',0,
      'carried_in_days',0,
      'opening_days',0,
      'balance_days',0,
      'status','NOT_STARTED',
      'version','V6.13.3'
    );
  end if;

  select coalesce(max(b.opening_days),0)
  into v_open
  from public.ta_dayoff_opening_balance b
  where public.normalize_emp_code(b.emp_code) = v_emp
    and b.start_month = v_start;

  v_balance := 0;

  for v_month in
    select generate_series(v_start,v_target,interval '1 month')::date
  loop
    if v_is_first then
      v_carry := coalesce(v_open,0);
      v_is_first := false;
    else
      v_carry := case when coalesce(v_carry_enabled,true) then v_balance else 0 end;
    end if;

    -- OR condition gives one row per calendar date, therefore weekend + holiday
    -- on the same date is counted only once.
    select count(*)::integer
    into v_quota
    from generate_series(
      v_month,
      (v_month + interval '1 month' - interval '1 day')::date,
      interval '1 day'
    ) d(day_value)
    where extract(dow from d.day_value)::integer = any(v_dows)
       or exists (
         select 1
         from public.holidays h
         where h.holiday_date = d.day_value::date
       );

    -- Count actual scheduled day-off dates. This fixes V6.12.0 which counted
    -- only literal OFF/HOL and therefore missed OSTD/OS043/OS134/OS135.
    select count(distinct c.work_date)::integer
    into v_used
    from public.shift_calendar c
    left join public.shift_master sm
      on upper(trim(sm.shift_code)) = upper(trim(c.shift_code))
    where public.normalize_emp_code(c.emp_code) = v_emp
      and c.work_date >= v_month
      and c.work_date < (v_month + interval '1 month')::date
      and nullif(trim(coalesce(c.shift_code,'')),'') is not null
      and upper(trim(c.shift_code)) not in ('LV','LEAVE')
      and (
        upper(trim(c.shift_code)) in ('OFF','HOL')
        or coalesce(sm.is_workday,true) = false
        or exists (
          select 1
          from public.ta_shift_schedule_rules_v6123 r
          where r.paired_off_shift_code is not null
            and upper(trim(r.paired_off_shift_code)) = upper(trim(c.shift_code))
        )
      );

    v_balance := coalesce(v_carry,0) + coalesce(v_quota,0) - coalesce(v_used,0);
  end loop;

  return jsonb_build_object(
    'emp_code',v_emp,
    'position_name',v_position,
    'month',v_target,
    'effective_start_month',v_start,
    'opening_days',v_open,
    'month_quota_days',v_quota,
    'used_days',v_used,
    'carried_in_days',v_carry,
    'balance_days',v_balance,
    'weekly_off_dows',v_dows,
    'carry_forward_enabled',v_carry_enabled,
    'usage_basis','SCHEDULED_NON_WORKDAY_SHIFT',
    'status','ACTIVE',
    'version','V6.13.3'
  );
end;
$$;

revoke all on function public.ta_get_dayoff_balance_v6133(text,date) from public;
grant execute on function public.ta_get_dayoff_balance_v6133(text,date) to authenticated;

notify pgrst, 'reload schema';
commit;
