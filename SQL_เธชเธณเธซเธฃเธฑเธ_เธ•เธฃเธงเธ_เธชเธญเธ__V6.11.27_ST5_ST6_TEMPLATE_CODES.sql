-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.11.27
-- ST6 / ST5 Template Code Migration
-- ============================================================================

with checks as (
  select 1 seq,'st6_master' check_name,
    case when exists(
      select 1 from public.ta_work_templates t
      join public.ta_work_template_segments s on s.template_code=t.template_code and s.segment_no=1
      where t.template_code='ST6' and coalesce(t.is_active,true)
        and s.planned_start_time=time '08:30' and s.planned_end_time=time '17:30'
    ) then 'PASS' else 'FAIL' end result,
    'ST6 ต้องเป็น 08:30–17:30 และ Active' detail

  union all
  select 2,'st5_master',
    case when exists(
      select 1 from public.ta_work_templates t
      join public.ta_work_template_segments s on s.template_code=t.template_code and s.segment_no=1
      where t.template_code='ST5' and coalesce(t.is_active,true)
        and s.planned_start_time=time '08:30' and s.planned_end_time=time '18:00'
    ) then 'PASS' else 'FAIL' end,
    'ST5 ต้องเป็น 08:30–18:00 และ Active'

  union all
  select 3,'tech_6d_default',
    case when not exists(
      select 1 from public.ta_employee_work_patterns
      where upper(trim(coalesce(pattern_code,'')))='TECH_6D'
        and upper(trim(coalesce(default_template_code,''))) <> 'ST6'
    ) then 'PASS' else 'FAIL' end,
    'TECH_6D ที่มี Assignment ต้องใช้ ST6'

  union all
  select 4,'tech_5d_default',
    case when not exists(
      select 1 from public.ta_employee_work_patterns
      where upper(trim(coalesce(pattern_code,'')))='TECH_5D'
        and upper(trim(coalesce(default_template_code,''))) <> 'ST5'
    ) then 'PASS' else 'FAIL' end,
    'TECH_5D ที่มี Assignment ต้องใช้ ST5'

  union all
  select 5,'employee_template_options',
    case when
      exists(select 1 from public._ta_employee_template_options_v655('TECH_6D') where category_code='NORMAL' and template_code='ST6')
      and exists(select 1 from public._ta_employee_template_options_v655('TECH_5D') where category_code='NORMAL' and template_code='ST5')
    then 'PASS' else 'FAIL' end,
    'ตัวเลือก Default ต้องคืน TECH_6D=ST6 และ TECH_5D=ST5'

  union all
  select 6,'legacy_operational_references',
    case when
      (select count(*) from public.ta_employee_work_patterns where upper(trim(coalesce(default_template_code,''))) in ('SINGLE_0830','SINGLE_0830_1730','SINGLE_0830_1800'))=0
      and (select count(*) from public.ta_daily_work_plans where upper(trim(coalesce(template_code,''))) in ('SINGLE_0830','SINGLE_0830_1730','SINGLE_0830_1800'))=0
    then 'PASS' else 'FAIL' end,
    'Employee Pattern และ Daily Plan ต้องไม่เหลือรหัสเก่า'

  union all
  select 7,'legacy_master_inactive',
    case when not exists(
      select 1 from public.ta_work_templates
      where upper(trim(template_code)) in ('SINGLE_0830','SINGLE_0830_1730','SINGLE_0830_1800')
        and coalesce(is_active,true)
    ) then 'PASS' else 'FAIL' end,
    'Master รหัสเก่าต้องถูกปิดการใช้งาน'

  union all
  select 8,'runtime_function_codes',
    case when not exists(
      select 1
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prokind='f'
        and p.proname not in ('_ta_normalize_template_code_v665')
        and (pg_get_functiondef(p.oid) ilike '%SINGLE_0830_1730%'
             or pg_get_functiondef(p.oid) ilike '%SINGLE_0830_1800%')
    ) then 'PASS' else 'FAIL' end,
    'Runtime functions ต้องใช้ ST6/ST5; ยกเว้น Normalizer ที่รองรับ Legacy'
)
select * from checks order by seq;
