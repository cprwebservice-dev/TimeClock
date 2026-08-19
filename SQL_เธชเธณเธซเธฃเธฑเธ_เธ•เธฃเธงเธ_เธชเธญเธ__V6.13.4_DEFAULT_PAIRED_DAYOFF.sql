-- ==========================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.13.4
-- Default Paired Day-off Integration
-- ==========================================================================

with checks as (
  select 1 as seq,'paired_dayoff_resolver'::text as check_name,
    case when to_regprocedure('public.ta_resolve_paired_dayoff_shift_v6134(text)') is not null then 'PASS' else 'FAIL' end as result,
    'ta_resolve_paired_dayoff_shift_v6134(text)'::text as detail

  union all
  select 2,'lightweight_schedule_v6134',
    case when to_regprocedure('public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])') is not null then 'PASS' else 'FAIL' end,
    'Schedule Grid uses V6.13.4 paired weekly-off resolver'

  union all
  select 3,'monthly_personal_v6134',
    case when to_regprocedure('public.ta_get_employee_month_schedule_v6134(text,date,date)') is not null then 'PASS' else 'FAIL' end,
    'Monthly Personal uses the same paired day-off source'

  union all
  select 4,'smart_dayoff_basis_v6134',
    case when to_regprocedure('public.ta_get_off_shift_basis_v6134(text,date)') is not null then 'PASS' else 'FAIL' end,
    'Popup / Smart Day-off uses V6.13.4 resolver'

  union all
  select 5,'bulk_dayoff_sync_v6134',
    case when to_regprocedure('public.ta_sync_bulk_schedule_rules_v6134(jsonb)') is not null then 'PASS' else 'FAIL' end,
    'Fill / Paste / 7-day pattern sync uses V6.13.4'

  union all
  select 6,'dayoff_quota_v6134',
    case when to_regprocedure('public.ta_get_dayoff_balance_v6134(text,date)') is not null then 'PASS' else 'FAIL' end,
    'Quota counts automatic default day-off unless overridden by working shift'

  union all
  select 7,'legacy_off_disabled',
    case when not exists(
      select 1 from public.shift_master s
      where upper(trim(s.shift_code))='OFF'
        and coalesce(s.is_active,true)
    ) then 'PASS' else 'FAIL' end,
    'Shift OFF must remain disabled / absent'

  union all
  select 8,'weekly_off_no_literal_OFF',
    case when exists(
      select 1
      from pg_proc p
      join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public'
        and p.proname='ta_get_schedule_range_light_v6134'
        and pg_get_functiondef(p.oid) not ilike '%resolved_weekly_off then ''OFF''%'
    ) then 'PASS' else 'FAIL' end,
    'Default weekly off must resolve through paired_off_shift_code, not OFF'

  union all
  select 9,'canonical_pairs_valid',
    case when not exists(
      select 1
      from (values
        ('STD','OSTD'),('S043','OS043'),('S134','OS134'),('S135','OS135')
      ) x(work_code,expected_off)
      left join public.ta_shift_schedule_rules_v6123 r
        on upper(trim(r.shift_code))=x.work_code
      left join public.shift_master o
        on upper(trim(o.shift_code))=upper(trim(r.paired_off_shift_code))
      where upper(trim(coalesce(r.paired_off_shift_code,'')))<>x.expected_off
         or o.shift_code is null
         or coalesce(o.is_active,false)=false
         or coalesce(o.is_workday,true)=true
    ) then 'PASS' else 'FAIL' end,
    'STD→OSTD, S043→OS043, S134→OS134, S135→OS135 are valid active day-off shifts'

  union all
  select 10,'default_work_patterns_have_dayoff_pair',
    case when not exists(
      select 1
      from public.ta_work_patterns p
      left join lateral (
        select case
          when upper(trim(coalesce(d.shift_code,''))) in ('ST5','SINGLE_0830_1800') then 'STD'
          when upper(trim(coalesce(d.shift_code,''))) in ('ST6','SINGLE_0830','SINGLE_0830_1730') then 'S043'
          when nullif(trim(coalesce(d.shift_code,'')),'') is not null then upper(trim(d.shift_code))
          when upper(trim(p.pattern_code))='TECH_5D' then 'STD'
          else 'S043'
        end as work_shift_code
        from (select 1) z
        left join lateral (
          select x.shift_code
          from public.ta_work_pattern_default_shifts x
          where upper(trim(x.pattern_code))=upper(trim(p.pattern_code))
          order by x.shift_code
          limit 1
        ) d on true
      ) w on true
      left join lateral public.ta_resolve_paired_dayoff_shift_v6134(w.work_shift_code) o on true
      where coalesce(p.is_active,true)
        and upper(trim(p.pattern_code)) in ('TECH_5D','TECH_6D')
        and not coalesce(o.mapping_valid,false)
    ) then 'PASS' else 'FAIL' end,
    'Every active 5-day / 6-day default work shift has an active paired day-off shift'
)
select seq,check_name,result,detail
from checks
order by seq;

-- รายละเอียด Mapping กะทำงาน -> กะวันหยุด
select
  upper(trim(w.shift_code)) as work_shift_code,
  w.shift_name as work_shift_name,
  w.start_time as work_start,
  w.end_time as work_end,
  upper(trim(r.paired_off_shift_code)) as paired_dayoff_shift_code,
  o.shift_name as dayoff_shift_name,
  o.start_time as dayoff_start,
  o.end_time as dayoff_end,
  o.is_active as dayoff_active,
  o.is_workday as dayoff_is_workday,
  case
    when r.paired_off_shift_code is null then 'FAIL: ยังไม่จับคู่'
    when o.shift_code is null then 'FAIL: ไม่พบกะวันหยุด'
    when coalesce(o.is_active,false)=false then 'FAIL: กะวันหยุดปิดใช้งาน'
    when coalesce(o.is_workday,true)=true then 'FAIL: ยังเป็นกะทำงาน'
    when o.start_time is distinct from w.start_time
      or o.end_time is distinct from w.end_time then 'FAIL: เวลาไม่ตรง'
    else 'PASS'
  end as mapping_result
from public.shift_master w
left join public.ta_shift_schedule_rules_v6123 r
  on upper(trim(r.shift_code))=upper(trim(w.shift_code))
left join public.shift_master o
  on upper(trim(o.shift_code))=upper(trim(r.paired_off_shift_code))
where upper(trim(w.shift_code)) in ('STD','S043','S134','S135')
order by case upper(trim(w.shift_code))
  when 'STD' then 1 when 'S043' then 2 when 'S134' then 3 when 'S135' then 4 else 9 end;

-- Default ของ Work Pattern และกะวันหยุดที่ระบบจะใช้กับเสาร์/อาทิตย์
with default_work as (
  select
    p.pattern_code,
    p.pattern_name,
    p.weekly_off_dows,
    case
      when upper(trim(coalesce(d.shift_code,''))) in ('ST5','SINGLE_0830_1800') then 'STD'
      when upper(trim(coalesce(d.shift_code,''))) in ('ST6','SINGLE_0830','SINGLE_0830_1730') then 'S043'
      when nullif(trim(coalesce(d.shift_code,'')),'') is not null then upper(trim(d.shift_code))
      when upper(trim(p.pattern_code))='TECH_5D' then 'STD'
      else 'S043'
    end as default_work_shift_code
  from public.ta_work_patterns p
  left join lateral (
    select x.shift_code
    from public.ta_work_pattern_default_shifts x
    where upper(trim(x.pattern_code))=upper(trim(p.pattern_code))
    order by x.shift_code
    limit 1
  ) d on true
  where upper(trim(p.pattern_code)) in ('TECH_5D','TECH_6D')
)
select
  d.pattern_code,
  d.pattern_name,
  d.weekly_off_dows,
  d.default_work_shift_code,
  o.off_shift_code as default_dayoff_shift_code,
  o.off_start_time,
  o.off_end_time,
  o.mapping_valid,
  case when coalesce(o.mapping_valid,false) then 'PASS' else 'FAIL' end as result
from default_work d
left join lateral public.ta_resolve_paired_dayoff_shift_v6134(d.default_work_shift_code) o
  on true
order by d.pattern_code;
