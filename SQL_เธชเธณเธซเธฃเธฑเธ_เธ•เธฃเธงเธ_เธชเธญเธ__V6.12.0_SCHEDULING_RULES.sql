-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.12.0
-- ============================================================================

-- 1. ตรวจ Work Mode และ Scope
select
  m.mode_code,
  m.mode_name,
  m.is_active,
  m.scope_mode,
  coalesce(array_agg(s.scope_value order by s.scope_value) filter(where s.scope_value is not null),array[]::text[]) as departments
from public.ta_work_modes m
left join public.ta_work_mode_scopes s on s.mode_code=m.mode_code
where m.mode_code in ('NORMAL','NORMAL_LATE_CUSTOMER','SPLIT_WAIT_NIGHT','HOUR_BASED','DYNAMIC_OFF')
group by m.mode_code,m.mode_name,m.is_active,m.scope_mode,m.display_order
order by m.display_order;

-- 2. ตรวจค่าเริ่มนับโควต้าวันหยุด
select * from public.ta_dayoff_settings where setting_id=1;

-- 3. ตรวจ Function V6.12.0 ที่ต้องมี
select p.proname
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in (
    'ta_get_work_mode_admin_v6120',
    'ta_save_work_mode_config_v6120',
    'ta_get_work_modes_for_employee_v6120',
    'ta_resolve_hour_based_shift_v6120',
    'ta_resolve_split_wait_shift_v6120',
    'ta_upsert_schedule_rule_assignment_v6120',
    'ta_get_schedule_rule_assignment_v6120',
    'ta_get_schedule_rule_assignments_v6120',
    'ta_get_dynamic_off_basis_v6120',
    'ta_delete_schedule_rule_assignment_v6120',
    'ta_sync_bulk_schedule_rules_v6120',
    'ta_validate_schedule_guard_v6120',
    'ta_get_dayoff_settings_v6120',
    'ta_save_dayoff_settings_v6120',
    'ta_get_dayoff_balance_v6120'
  )
order by p.proname;

-- 4. ตรวจ Shift ที่ระบบสร้างอัตโนมัติ (จะแสดงหลังเริ่มใช้งานกะนับชั่วโมง / Split Wait)
select shift_code,shift_name,start_time,end_time,break_minutes,is_workday,is_active,note
from public.shift_master
where note like '%SYSTEM_GENERATED_V6120%'
order by shift_code;

-- 5. ตรวจข้อมูล Scheduling Rule ที่บันทึกแล้ว
select emp_code,work_date,work_mode_code,base_shift_code,generated_shift_code,
       first_segment_end,second_segment_start,second_segment_planned_end,
       custom_start_time,custom_end_time,off_window_start,off_window_end,
       planned_minutes,validation_snapshot,updated_at
from public.ta_schedule_rule_assignments
order by work_date desc,emp_code
limit 100;
