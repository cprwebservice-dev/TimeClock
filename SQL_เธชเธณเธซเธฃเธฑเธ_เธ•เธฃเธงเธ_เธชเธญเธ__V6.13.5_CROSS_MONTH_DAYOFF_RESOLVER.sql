-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.13.5
-- Cross-Month Day-off Resolver
-- ============================================================================

with checks as (
  select
    1 as seq,
    'off_basis_resolver_v6135'::text as check_name,
    case
      when to_regprocedure(
        'public.ta_get_off_shift_basis_v6135(text,date)'
      ) is not null then 'PASS' else 'FAIL'
    end as result,
    'ta_get_off_shift_basis_v6135(text,date)'::text as detail

  union all

  select
    2,
    'bulk_sync_v6135',
    case
      when to_regprocedure(
        'public.ta_sync_bulk_schedule_rules_v6135(jsonb)'
      ) is not null then 'PASS' else 'FAIL'
    end,
    'ta_sync_bulk_schedule_rules_v6135(jsonb)'

  union all

  select
    3,
    'resolver_uses_60_day_lookback',
    case
      when exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and p.proname='ta_get_off_shift_basis_v6135'
          and pg_get_functiondef(p.oid) ilike '%v_lookback_days integer := 60%'
      ) then 'PASS' else 'FAIL'
    end,
    'ย้อนหากะทำงานล่าสุดได้สูงสุด 60 วัน'

  union all

  select
    4,
    'resolver_has_default_fallback',
    case
      when exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and p.proname='ta_get_off_shift_basis_v6135'
          and pg_get_functiondef(p.oid) ilike '%DEFAULT_MAPPED%'
          and pg_get_functiondef(p.oid) ilike '%used_default_fallback%'
      ) then 'PASS' else 'FAIL'
    end,
    'ถ้าไม่พบกะย้อนหลัง ให้ใช้ Default Shift -> Paired Day-off'

  union all

  select
    5,
    'bulk_sync_uses_same_resolver',
    case
      when exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public'
          and p.proname='ta_sync_bulk_schedule_rules_v6135'
          and pg_get_functiondef(p.oid) ilike '%ta_get_off_shift_basis_v6135%'
      ) then 'PASS' else 'FAIL'
    end,
    'Bulk / Fill / Paste / Pattern ใช้ Resolver เดียวกัน'

  union all

  select
    6,
    'paired_dayoff_mapping_ready',
    case
      when (
        select count(*)
        from public.ta_shift_schedule_rules_v6123 r
        where upper(trim(r.shift_code)) in ('STD','S043','S134','S135')
          and upper(trim(coalesce(r.paired_off_shift_code,''))) in ('OSTD','OS043','OS134','OS135')
      ) >= 4 then 'PASS' else 'CHECK'
    end,
    'ตรวจ Mapping STD/OSTD, S043/OS043, S134/OS134, S135/OS135'

  union all

  select
    7,
    'off_master_disabled',
    case
      when not exists (
        select 1
        from public.shift_master s
        where upper(trim(s.shift_code))='OFF'
          and coalesce(s.is_active,true)
      ) then 'PASS' else 'CHECK'
    end,
    'รหัส OFF ควรปิดใช้งาน'

  union all

  select
    8,
    'supporting_indexes',
    case
      when exists (
        select 1 from pg_indexes
        where schemaname='public'
          and indexname='idx_shift_calendar_emp_work_date_v6135'
      )
      and exists (
        select 1 from pg_indexes
        where schemaname='public'
          and indexname='idx_schedule_rule_assignments_emp_date_v6135'
      ) then 'PASS' else 'FAIL'
    end,
    'Index สำหรับค้นหากะย้อนหลังและ Scheduling Rule'
)
select seq,check_name,result,detail
from checks
order by seq;

-- ตรวจ Mapping 4 คู่หลัก
select
  upper(trim(r.shift_code)) as work_shift_code,
  upper(trim(r.paired_off_shift_code)) as paired_off_shift_code,
  ws.start_time as work_start,
  ws.end_time as work_end,
  os.start_time as off_start,
  os.end_time as off_end,
  coalesce(ws.is_workday,true) as work_is_workday,
  coalesce(os.is_workday,true) as off_is_workday,
  coalesce(os.is_active,true) as off_is_active,
  case
    when upper(trim(r.shift_code))='STD' and upper(trim(r.paired_off_shift_code))='OSTD' then 'PASS'
    when upper(trim(r.shift_code))='S043' and upper(trim(r.paired_off_shift_code))='OS043' then 'PASS'
    when upper(trim(r.shift_code))='S134' and upper(trim(r.paired_off_shift_code))='OS134' then 'PASS'
    when upper(trim(r.shift_code))='S135' and upper(trim(r.paired_off_shift_code))='OS135' then 'PASS'
    else 'CHECK'
  end as mapping_result
from public.ta_shift_schedule_rules_v6123 r
left join public.shift_master ws
  on upper(trim(ws.shift_code))=upper(trim(r.shift_code))
left join public.shift_master os
  on upper(trim(os.shift_code))=upper(trim(r.paired_off_shift_code))
where upper(trim(r.shift_code)) in ('STD','S043','S134','S135')
order by case upper(trim(r.shift_code))
  when 'STD' then 1
  when 'S043' then 2
  when 'S134' then 3
  when 'S135' then 4
  else 9
end;
