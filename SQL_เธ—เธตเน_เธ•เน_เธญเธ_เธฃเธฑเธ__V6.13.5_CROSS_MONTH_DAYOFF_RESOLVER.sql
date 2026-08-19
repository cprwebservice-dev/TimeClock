-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.13.5
-- Cross-Month Day-off Resolver
--
-- เป้าหมาย
-- 1) วันหยุดวันที่ 1 ของเดือนสามารถย้อนหากะทำงานล่าสุดข้ามเดือนได้
-- 2) ย้อนสูงสุด 60 วัน และข้ามกะวันหยุด/วันลา/นักขัตฤกษ์
-- 3) ถ้าไม่พบกะทำงานย้อนหลัง ให้ใช้ Default Shift ของ Work Pattern
-- 4) ใช้ Mapping Work Shift -> Paired Day-off Shift จาก Set Up เดิม
-- 5) Bulk / Fill / Paste / Pattern / Copy Week ใช้ Resolver ชุดเดียวกัน
-- ============================================================================

begin;
set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- Dependency guard
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.shift_master') is null then
    raise exception 'MISSING_TABLE: shift_master';
  end if;

  if to_regclass('public.ta_schedule_rule_assignments') is null then
    raise exception 'MISSING_TABLE: ta_schedule_rule_assignments';
  end if;

  if to_regprocedure(
    'public.ta_get_schedule_range_light_v6134(date,date,text,text,text[],text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_get_schedule_range_light_v6134';
  end if;

  if to_regprocedure(
    'public.ta_resolve_paired_dayoff_shift_v6134(text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_resolve_paired_dayoff_shift_v6134';
  end if;

  if to_regprocedure(
    'public.ta_v6134_upsert_generated_dayoff_shift(time,time,text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_v6134_upsert_generated_dayoff_shift';
  end if;

  if to_regprocedure('public.ta_v6120_can_schedule()') is null then
    raise exception 'MISSING_FUNCTION: ta_v6120_can_schedule';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Cross-month day-off basis resolver
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_off_shift_basis_v6135(
  p_emp_code text,
  p_work_date date
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_emp text := public.normalize_emp_code(p_emp_code);
  v_lookback_days integer := 60;
  v_search_from date;

  v_basis_date date;
  v_code text;
  v_mode text;
  v_base_code text;
  v_start time;
  v_end time;
  v_custom_start time;
  v_custom_end time;
  v_basis_code text;

  v_pair_code text;
  v_pair_name text;
  v_pair_start time;
  v_pair_end time;

  v_pattern text;
  v_default_shift_code text;
  v_generated_off_code text;
begin
  if p_work_date is null then
    raise exception 'WORK_DATE_REQUIRED';
  end if;

  if nullif(v_emp,'') is null then
    raise exception 'EMPLOYEE_REQUIRED';
  end if;

  if not public.ta_v6120_can_schedule() then
    raise exception 'SCHEDULE_PERMISSION_DENIED';
  end if;

  v_search_from := p_work_date - v_lookback_days;

  -- A) หา Effective WORK shift ล่าสุดย้อนหลังข้ามเดือน
  --    - shift_master.is_workday=true เท่านั้น
  --    - จึงข้าม OSTD/OS043/OS134/OS135, HOL, LV และกะวันหยุดอื่นโดยอัตโนมัติ
  select
    h.work_date,
    upper(trim(coalesce(h.assigned_shift_code,h.effective_shift_code,''))),
    sm.start_time,
    sm.end_time,
    upper(trim(coalesce(h.pattern_code,'TECH_6D')))
  into
    v_basis_date,
    v_code,
    v_start,
    v_end,
    v_pattern
  from public.ta_get_schedule_range_light_v6134(
    v_search_from,
    p_work_date - 1,
    null,
    null,
    array[v_emp]::text[],
    null
  ) h
  join public.shift_master sm
    on upper(trim(sm.shift_code)) =
       upper(trim(coalesce(h.assigned_shift_code,h.effective_shift_code,'')))
   and coalesce(sm.is_active,true)
   and coalesce(sm.is_workday,true)
  order by h.work_date desc
  limit 1;

  if v_code is not null then
    select
      upper(trim(coalesce(a.work_mode_code,''))),
      upper(trim(coalesce(a.base_shift_code,''))),
      a.custom_start_time,
      a.custom_end_time
    into
      v_mode,
      v_base_code,
      v_custom_start,
      v_custom_end
    from public.ta_schedule_rule_assignments a
    where a.emp_code = v_emp
      and a.work_date = v_basis_date
    limit 1;

    v_basis_code := coalesce(nullif(v_base_code,''),v_code);

    -- Hour Based: วันหยุดต้องใช้ช่วงเวลาเดียวกับกะนับชั่วโมงจริง
    if v_mode='HOUR_BASED'
       and v_custom_start is not null
       and v_custom_end is not null then
      v_generated_off_code := public.ta_v6134_upsert_generated_dayoff_shift(
        v_custom_start,
        v_custom_end,
        coalesce(v_pattern,'TECH_6D')
      );

      return jsonb_build_object(
        'basis_work_date',v_basis_date,
        'basis_shift_code',v_basis_code,
        'basis_source','PREVIOUS_WORK_SHIFT',
        'off_shift_code',v_generated_off_code,
        'off_shift_name','วันหยุดตามกะนับชั่วโมง',
        'off_start_time',v_custom_start,
        'off_end_time',v_custom_end,
        'resolution_type','DYNAMIC_SPECIAL_GENERATED',
        'mapping_missing',false,
        'used_default_fallback',false,
        'searched_from_date',v_search_from,
        'lookback_days',v_lookback_days,
        'version','V6.13.5'
      );
    end if;

    -- Split Wait Night: ใช้กะฐานช่วงแรกในการหา OFF คู่กัน
    if v_mode='SPLIT_WAIT_NIGHT'
       and nullif(v_base_code,'') is not null then
      select
        off.off_shift_code,
        off.off_shift_name,
        off.off_start_time,
        off.off_end_time
      into
        v_pair_code,
        v_pair_name,
        v_pair_start,
        v_pair_end
      from public.ta_resolve_paired_dayoff_shift_v6134(v_base_code) off
      where coalesce(off.mapping_valid,false)
      limit 1;

      if v_pair_code is not null then
        return jsonb_build_object(
          'basis_work_date',v_basis_date,
          'basis_shift_code',v_base_code,
          'basis_source','PREVIOUS_WORK_SHIFT',
          'off_shift_code',v_pair_code,
          'off_shift_name',v_pair_name,
          'off_start_time',v_pair_start,
          'off_end_time',v_pair_end,
          'resolution_type','MAPPED_SPECIAL_BASE',
          'mapping_missing',false,
          'used_default_fallback',false,
          'searched_from_date',v_search_from,
          'lookback_days',v_lookback_days,
          'version','V6.13.5'
        );
      end if;
    end if;

    -- กะปกติ / กะดึกทั่วไป: ใช้ Mapping จาก Set Up
    select
      off.off_shift_code,
      off.off_shift_name,
      off.off_start_time,
      off.off_end_time
    into
      v_pair_code,
      v_pair_name,
      v_pair_start,
      v_pair_end
    from public.ta_resolve_paired_dayoff_shift_v6134(v_basis_code) off
    where coalesce(off.mapping_valid,false)
    limit 1;

    if v_pair_code is null then
      return jsonb_build_object(
        'basis_work_date',v_basis_date,
        'basis_shift_code',v_basis_code,
        'basis_source','PREVIOUS_WORK_SHIFT',
        'off_shift_code',null,
        'off_shift_name',null,
        'off_start_time',v_start,
        'off_end_time',v_end,
        'resolution_type','MAPPING_MISSING',
        'mapping_missing',true,
        'used_default_fallback',false,
        'searched_from_date',v_search_from,
        'lookback_days',v_lookback_days,
        'version','V6.13.5'
      );
    end if;

    return jsonb_build_object(
      'basis_work_date',v_basis_date,
      'basis_shift_code',v_basis_code,
      'basis_source','PREVIOUS_WORK_SHIFT',
      'off_shift_code',v_pair_code,
      'off_shift_name',v_pair_name,
      'off_start_time',v_pair_start,
      'off_end_time',v_pair_end,
      'resolution_type','MAPPED_PREVIOUS_WORK_SHIFT',
      'mapping_missing',false,
      'used_default_fallback',false,
      'searched_from_date',v_search_from,
      'lookback_days',v_lookback_days,
      'version','V6.13.5'
    );
  end if;

  -- B) ไม่พบกะทำงานย้อนหลัง: ใช้ Default Shift ของ Work Pattern ณ วันที่กำหนดวันหยุด
  --    รองรับพนักงานเริ่มงานวันที่ 1 หรือไม่มีประวัติกะใน 60 วันก่อนหน้า
  select
    upper(trim(coalesce(h.default_shift_code,''))),
    upper(trim(coalesce(h.pattern_code,'TECH_6D')))
  into
    v_default_shift_code,
    v_pattern
  from public.ta_get_schedule_range_light_v6134(
    p_work_date,
    p_work_date,
    null,
    null,
    array[v_emp]::text[],
    null
  ) h
  limit 1;

  if nullif(v_default_shift_code,'') is null then
    return null;
  end if;

  select
    off.off_shift_code,
    off.off_shift_name,
    off.off_start_time,
    off.off_end_time
  into
    v_pair_code,
    v_pair_name,
    v_pair_start,
    v_pair_end
  from public.ta_resolve_paired_dayoff_shift_v6134(v_default_shift_code) off
  where coalesce(off.mapping_valid,false)
  limit 1;

  if v_pair_code is null then
    return jsonb_build_object(
      'basis_work_date',null,
      'basis_shift_code',v_default_shift_code,
      'basis_source','DEFAULT_SHIFT',
      'off_shift_code',null,
      'off_shift_name',null,
      'off_start_time',null,
      'off_end_time',null,
      'resolution_type','DEFAULT_MAPPING_MISSING',
      'mapping_missing',true,
      'used_default_fallback',true,
      'searched_from_date',v_search_from,
      'lookback_days',v_lookback_days,
      'pattern_code',v_pattern,
      'version','V6.13.5'
    );
  end if;

  return jsonb_build_object(
    'basis_work_date',null,
    'basis_shift_code',v_default_shift_code,
    'basis_source','DEFAULT_SHIFT',
    'off_shift_code',v_pair_code,
    'off_shift_name',v_pair_name,
    'off_start_time',v_pair_start,
    'off_end_time',v_pair_end,
    'resolution_type','DEFAULT_MAPPED',
    'mapping_missing',false,
    'used_default_fallback',true,
    'searched_from_date',v_search_from,
    'lookback_days',v_lookback_days,
    'pattern_code',v_pattern,
    'version','V6.13.5'
  );
end;
$$;

revoke all on function public.ta_get_off_shift_basis_v6135(text,date) from public;
grant execute on function public.ta_get_off_shift_basis_v6135(text,date) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Bulk Smart Day-off Sync uses the same V6.13.5 resolver
-- ---------------------------------------------------------------------------
create or replace function public.ta_sync_bulk_schedule_rules_v6135(
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_item jsonb;
  v_emp text;
  v_date date;
  v_code text;
  v_note text;
  v_is_workday boolean;
  v_basis jsonb;
  v_synced integer:=0;
  v_cleared integer:=0;
  v_count integer:=0;
begin
  if not public.ta_v6120_can_schedule() then
    raise exception 'SCHEDULE_PERMISSION_DENIED';
  end if;

  if jsonb_typeof(coalesce(p_items,'[]'::jsonb)) <> 'array' then
    raise exception 'SHIFT_ROWS_MUST_BE_ARRAY';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb))
  loop
    v_count:=v_count+1;
    v_emp:=public.normalize_emp_code(v_item->>'emp_code');

    begin
      v_date:=(v_item->>'work_date')::date;
    exception when others then
      v_date:=null;
    end;

    v_code:=upper(nullif(trim(coalesce(v_item->>'shift_code','')),''));
    v_note:=nullif(v_item->>'note','');

    if nullif(v_emp,'') is null or v_date is null then
      continue;
    end if;

    -- ล้าง extension เมื่อเป็นช่องว่าง / HOL / LV
    if v_code is null or v_code in ('HOL','LV') then
      delete from public.ta_schedule_rule_assignments
      where emp_code=v_emp
        and work_date=v_date;
      if found then v_cleared:=v_cleared+1; end if;
      continue;
    end if;

    select coalesce(s.is_workday,true)
    into v_is_workday
    from public.shift_master s
    where upper(trim(s.shift_code))=v_code
    limit 1;

    -- กะทำงาน: ไม่ต้องเก็บ DYNAMIC_OFF extension
    if coalesce(v_is_workday,true) then
      delete from public.ta_schedule_rule_assignments
      where emp_code=v_emp
        and work_date=v_date;
      if found then v_cleared:=v_cleared+1; end if;
      continue;
    end if;

    -- กะวันหยุดทุกประเภทใช้ Resolver กลางเดียวกัน
    v_basis:=public.ta_get_off_shift_basis_v6135(v_emp,v_date);

    if v_basis is null
       or coalesce((v_basis->>'mapping_missing')::boolean,false)
       or nullif(v_basis->>'off_shift_code','') is null then
      raise exception
        'DAYOFF_BASIS_NOT_FOUND: emp=% date=% code=%',
        v_emp,
        v_date,
        v_code;
    end if;

    -- ป้องกันการบันทึกกะวันหยุดที่ไม่ตรงกับ Mapping ที่ Resolver หาได้
    if upper(trim(v_code)) <> upper(trim(v_basis->>'off_shift_code')) then
      raise exception
        'DAYOFF_SHIFT_MISMATCH: emp=% date=% expected=% actual=% basis=%',
        v_emp,
        v_date,
        upper(trim(v_basis->>'off_shift_code')),
        v_code,
        upper(trim(coalesce(v_basis->>'basis_shift_code','')));
    end if;

    insert into public.ta_schedule_rule_assignments(
      emp_code,
      work_date,
      work_mode_code,
      base_shift_code,
      generated_shift_code,
      first_segment_end,
      second_segment_start,
      second_segment_planned_end,
      custom_start_time,
      custom_end_time,
      off_window_start,
      off_window_end,
      off_basis_shift_code,
      planned_minutes,
      validation_snapshot,
      note,
      created_by,
      updated_by
    ) values(
      v_emp,
      v_date,
      'DYNAMIC_OFF',
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      nullif(v_basis->>'off_start_time','')::time,
      nullif(v_basis->>'off_end_time','')::time,
      upper(nullif(v_basis->>'basis_shift_code','')),
      0,
      jsonb_build_object(
        'resolver','V6.13.5',
        'basis_source',v_basis->>'basis_source',
        'basis_work_date',v_basis->>'basis_work_date',
        'used_default_fallback',coalesce((v_basis->>'used_default_fallback')::boolean,false)
      ),
      coalesce(v_note,'Smart Day-off V6.13.5'),
      auth.uid(),
      auth.uid()
    )
    on conflict(emp_code,work_date)
    do update set
      work_mode_code='DYNAMIC_OFF',
      base_shift_code=null,
      generated_shift_code=null,
      first_segment_end=null,
      second_segment_start=null,
      second_segment_planned_end=null,
      custom_start_time=null,
      custom_end_time=null,
      off_window_start=excluded.off_window_start,
      off_window_end=excluded.off_window_end,
      off_basis_shift_code=excluded.off_basis_shift_code,
      planned_minutes=0,
      validation_snapshot=excluded.validation_snapshot,
      note=excluded.note,
      updated_at=now(),
      updated_by=auth.uid();

    v_synced:=v_synced+1;
  end loop;

  return jsonb_build_object(
    'ok',true,
    'processed_rows',v_count,
    'dayoff_synced',v_synced,
    'extensions_cleared',v_cleared,
    'resolver','ta_get_off_shift_basis_v6135',
    'lookback_days',60,
    'version','V6.13.5'
  );
end;
$$;

revoke all on function public.ta_sync_bulk_schedule_rules_v6135(jsonb) from public;
grant execute on function public.ta_sync_bulk_schedule_rules_v6135(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Supporting indexes for cross-month lookup / bulk update
-- ---------------------------------------------------------------------------
create index if not exists idx_shift_calendar_emp_work_date_v6135
  on public.shift_calendar(emp_code,work_date desc);

create index if not exists idx_schedule_rule_assignments_emp_date_v6135
  on public.ta_schedule_rule_assignments(emp_code,work_date desc);

analyze public.shift_calendar;
analyze public.ta_schedule_rule_assignments;

notify pgrst, 'reload schema';
commit;
