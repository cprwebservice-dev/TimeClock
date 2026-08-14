-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.11.27
-- Rename Standard Work Template Codes
--   SINGLE_0830_1730 -> ST6
--   SINGLE_0830_1800 -> ST5
-- ============================================================================

begin;
set local statement_timeout = '0';

do $$
begin
  if to_regclass('public.ta_work_templates') is null then raise exception 'MISSING_TABLE: ta_work_templates'; end if;
  if to_regclass('public.ta_work_template_segments') is null then raise exception 'MISSING_TABLE: ta_work_template_segments'; end if;
  if to_regclass('public.ta_employee_work_patterns') is null then raise exception 'MISSING_TABLE: ta_employee_work_patterns'; end if;
  if to_regclass('public.ta_daily_work_plans') is null then raise exception 'MISSING_TABLE: ta_daily_work_plans'; end if;
end;
$$;

-- 1) New standard template masters
insert into public.ta_work_templates (
  template_code,template_name,template_type,note,is_active,created_at,updated_at
)
select
  'ST6','ST6 • กะมาตรฐาน 6 วัน/สัปดาห์ 08:30–17:30',
  coalesce(t.template_type,'SINGLE'),
  'รหัสมาตรฐาน ST6 สำหรับ TECH_6D • 08:30–17:30 รวมพัก 1 ชั่วโมง',
  true,coalesce(t.created_at,now()),now()
from public.ta_work_templates t
where upper(trim(t.template_code)) in ('SINGLE_0830_1730','SINGLE_0830')
order by case when upper(trim(t.template_code))='SINGLE_0830_1730' then 0 else 1 end
limit 1
on conflict(template_code) do update set
  template_name=excluded.template_name,template_type=excluded.template_type,
  note=excluded.note,is_active=true,updated_at=now();

insert into public.ta_work_templates (
  template_code,template_name,template_type,note,is_active,created_at,updated_at
)
select 'ST6','ST6 • กะมาตรฐาน 6 วัน/สัปดาห์ 08:30–17:30','SINGLE',
       'รหัสมาตรฐาน ST6 สำหรับ TECH_6D • 08:30–17:30 รวมพัก 1 ชั่วโมง',true,now(),now()
where not exists (select 1 from public.ta_work_templates where template_code='ST6');

insert into public.ta_work_templates (
  template_code,template_name,template_type,note,is_active,created_at,updated_at
)
select
  'ST5','ST5 • กะมาตรฐาน 5 วัน/สัปดาห์ 08:30–18:00',
  coalesce(t.template_type,'SINGLE'),
  'รหัสมาตรฐาน ST5 สำหรับ TECH_5D • 08:30–18:00 รวมพัก 1 ชั่วโมง',
  true,coalesce(t.created_at,now()),now()
from public.ta_work_templates t
where upper(trim(t.template_code))='SINGLE_0830_1800'
limit 1
on conflict(template_code) do update set
  template_name=excluded.template_name,template_type=excluded.template_type,
  note=excluded.note,is_active=true,updated_at=now();

insert into public.ta_work_templates (
  template_code,template_name,template_type,note,is_active,created_at,updated_at
)
select 'ST5','ST5 • กะมาตรฐาน 5 วัน/สัปดาห์ 08:30–18:00','SINGLE',
       'รหัสมาตรฐาน ST5 สำหรับ TECH_5D • 08:30–18:00 รวมพัก 1 ชั่วโมง',true,now(),now()
where not exists (select 1 from public.ta_work_templates where template_code='ST5');

-- 2) Standard segments
-- ST6/ST5 เป็นกะมาตรฐานแบบ Single Segment จึงกำหนด Segment 1 โดยตรง
-- และลบ Segment เกินที่อาจค้างจากการติดตั้ง/ทดสอบเดิม
delete from public.ta_work_template_segments
where template_code='ST6' and segment_no<>1;

insert into public.ta_work_template_segments (
  template_code,segment_no,segment_type,planned_start_time,planned_end_time,
  start_day_offset,end_day_offset,flexible_start,flexible_end,paid,note
)
values ('ST6',1,'WORK',time '08:30',time '17:30',0,0,false,false,true,'งานปกติ TECH_6D')
on conflict(template_code,segment_no) do update set
  segment_type='WORK',planned_start_time=time '08:30',planned_end_time=time '17:30',
  start_day_offset=0,end_day_offset=0,flexible_start=false,flexible_end=false,paid=true,
  note='งานปกติ TECH_6D';

delete from public.ta_work_template_segments
where template_code='ST5' and segment_no<>1;

insert into public.ta_work_template_segments (
  template_code,segment_no,segment_type,planned_start_time,planned_end_time,
  start_day_offset,end_day_offset,flexible_start,flexible_end,paid,note
)
values ('ST5',1,'WORK',time '08:30',time '18:00',0,0,false,false,true,'งานปกติ TECH_5D')
on conflict(template_code,segment_no) do update set
  segment_type='WORK',planned_start_time=time '08:30',planned_end_time=time '18:00',
  start_day_offset=0,end_day_offset=0,flexible_start=false,flexible_end=false,paid=true,
  note='งานปกติ TECH_5D';

-- 3) Migrate stored references
update public.ta_employee_work_patterns
set default_template_code = case upper(trim(coalesce(default_template_code,'')))
  when 'SINGLE_0830' then 'ST6'
  when 'SINGLE_0830_1730' then 'ST6'
  when 'SINGLE_0830_1800' then 'ST5'
  else default_template_code end,
  updated_at=now()
where upper(trim(coalesce(default_template_code,''))) in
  ('SINGLE_0830','SINGLE_0830_1730','SINGLE_0830_1800');

update public.ta_daily_work_plans
set template_code = case upper(trim(coalesce(template_code,'')))
  when 'SINGLE_0830' then 'ST6'
  when 'SINGLE_0830_1730' then 'ST6'
  when 'SINGLE_0830_1800' then 'ST5'
  else template_code end,
  updated_at=now()
where upper(trim(coalesce(template_code,''))) in
  ('SINGLE_0830','SINGLE_0830_1730','SINGLE_0830_1800');

-- Historical calculation outputs, if present.
-- ใช้ Dynamic SQL เพื่อรองรับฐานที่ตาราง Historical บางตัวอาจไม่มี
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'ta_attendance_calculations',
    'ta_attendance_segment_results'
  ]
  loop
    if to_regclass('public.'||v_table) is not null
       and exists (
         select 1
         from information_schema.columns
         where table_schema='public'
           and table_name=v_table
           and column_name='template_code'
       ) then
      execute format(
        'update public.%I
         set template_code = case upper(trim(coalesce(template_code, '''')))
           when ''SINGLE_0830'' then ''ST6''
           when ''SINGLE_0830_1730'' then ''ST6''
           when ''SINGLE_0830_1800'' then ''ST5''
           else template_code end
         where upper(trim(coalesce(template_code, ''''))) in
           (''SINGLE_0830'',''SINGLE_0830_1730'',''SINGLE_0830_1800'')',
        v_table
      );
    end if;
  end loop;
end;
$$;

update public.ta_employee_work_patterns
set default_template_code = case upper(trim(coalesce(pattern_code,'')))
  when 'TECH_6D' then 'ST6'
  when 'TECH_5D' then 'ST5'
  else default_template_code end,
  updated_at=now()
where upper(trim(coalesce(pattern_code,''))) in ('TECH_6D','TECH_5D')
  and default_template_code is distinct from
      case upper(trim(coalesce(pattern_code,'')))
        when 'TECH_6D' then 'ST6'
        when 'TECH_5D' then 'ST5'
        else default_template_code end;

-- 4) Patch runtime functions that still embed old codes
--    Exclude normalizer/options because they are recreated explicitly below.
do $$
declare
  r record;
  v_def text;
begin
  for r in
    select p.oid,p.proname,pg_get_functiondef(p.oid) as fn_def
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.prokind='f'
      and p.proname not in ('_ta_normalize_template_code_v665','_ta_employee_template_options_v655')
      and (
        pg_get_functiondef(p.oid) ilike '%SINGLE_0830_1730%'
        or pg_get_functiondef(p.oid) ilike '%SINGLE_0830_1800%'
      )
  loop
    v_def := replace(r.fn_def,'SINGLE_0830_1730','ST6');
    v_def := replace(v_def,'SINGLE_0830_1800','ST5');
    execute v_def;
  end loop;
end;
$$;

-- 5) Backward-compatible normalizer
create or replace function public._ta_normalize_template_code_v665()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_code text;
begin
  if tg_table_name='ta_employee_work_patterns' then
    v_code := upper(trim(coalesce(new.default_template_code,'')));
    if v_code in ('SINGLE_0830','SINGLE_0830_1730','ST6') then
      new.default_template_code := 'ST6';
    elsif v_code in ('SINGLE_0830_1800','ST5') then
      new.default_template_code := 'ST5';
    elsif v_code='EARLY_SPLIT_FLEX' then
      new.default_template_code := 'SPLIT_FLEX';
    end if;
  else
    v_code := upper(trim(coalesce(new.template_code,'')));
    if v_code in ('SINGLE_0830','SINGLE_0830_1730','ST6') then
      new.template_code := 'ST6';
    elsif v_code in ('SINGLE_0830_1800','ST5') then
      new.template_code := 'ST5';
    elsif v_code='EARLY_SPLIT_FLEX' then
      new.template_code := 'SPLIT_FLEX';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public._ta_normalize_template_code_v665() from public;

-- 6) Employee-facing options: 6D = ST6 / 5D = ST5
create or replace function public._ta_employee_template_options_v655(p_pattern_code text)
returns table (
  category_code text,category_name text,template_code text,template_name text,display_order integer
)
language sql
stable
security definer
set search_path=public
as $$
  with input as (
    select upper(trim(coalesce(p_pattern_code,'TECH_6D'))) as pattern_code
  ),
  normal_template as (
    select case when i.pattern_code='TECH_5D' then 'ST5' else 'ST6' end as template_code
    from input i
  ),
  late_customer as (
    select t.template_code
    from public.ta_work_templates t
    where coalesce(t.is_active,true)
      and upper(trim(coalesce(t.template_code,''))) <> 'EARLY_SPLIT_FLEX'
      and (
        upper(trim(coalesce(t.template_code,'')))='SPLIT_FLEX'
        or lower(coalesce(t.template_name,'')) like '%งานลูกค้าช่วงดึก%'
        or lower(coalesce(t.note,'')) like '%งานลูกค้าช่วงดึก%'
        or upper(coalesce(t.template_code,'')) like '%LATE%CUSTOMER%'
        or upper(coalesce(t.template_code,'')) like '%NIGHT%CUSTOMER%'
      )
      and lower(coalesce(t.template_name,'')) not like '%ออกกะแรก%'
      and lower(coalesce(t.note,'')) not like '%ออกกะแรก%'
    order by
      case when upper(trim(coalesce(t.template_code,'')))='SPLIT_FLEX' then 0
           when trim(coalesce(t.template_name,''))='กะปกติ + งานลูกค้าช่วงดึก' then 1
           else 2 end,
      t.template_code
    limit 1
  ),
  options(category_code,category_name,template_code,template_name,display_order) as (
    select 'NORMAL'::text,'กะปกติ'::text,n.template_code,
           case when n.template_code='ST5' then 'ST5 • กะปกติ 08:30–18:00'
                else 'ST6 • กะปกติ 08:30–17:30' end::text,1::integer
    from normal_template n
    union all
    select 'NORMAL_LATE_CUSTOMER'::text,'กะปกติ + งานลูกค้าช่วงดึก'::text,
           l.template_code,'กะปกติ + งานลูกค้าช่วงดึก'::text,2::integer
    from late_customer l
  )
  select o.category_code,o.category_name,o.template_code,o.template_name,o.display_order
  from options o
  order by o.display_order;
$$;
revoke all on function public._ta_employee_template_options_v655(text) from public;

-- 7) Keep old master codes only as inactive legacy aliases
update public.ta_work_templates
set is_active=false,
    note=case upper(trim(template_code))
      when 'SINGLE_0830_1730' then 'Legacy code • เปลี่ยนเป็น ST6 ตั้งแต่ V6.11.27'
      when 'SINGLE_0830_1800' then 'Legacy code • เปลี่ยนเป็น ST5 ตั้งแต่ V6.11.27'
      when 'SINGLE_0830' then 'Legacy code • เปลี่ยนเป็น ST6 ตั้งแต่ V6.11.27'
      else note end,
    updated_at=now()
where upper(trim(template_code)) in ('SINGLE_0830','SINGLE_0830_1730','SINGLE_0830_1800');

analyze public.ta_work_templates;
analyze public.ta_work_template_segments;
analyze public.ta_employee_work_patterns;
analyze public.ta_daily_work_plans;
notify pgrst,'reload schema';
commit;
