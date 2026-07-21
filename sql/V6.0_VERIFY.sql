-- =====================================================================
-- Time-Clock Enterprise V6.0 - SQL สำหรับตรวจสอบ
-- =====================================================================

-- 1) ตรวจสอบตารางใหม่
select 'ta_schedule_month_status' as object_name, to_regclass('public.ta_schedule_month_status') is not null as ready
union all select 'ta_review_resolutions', to_regclass('public.ta_review_resolutions') is not null
union all select 'ta_export_job_log', to_regclass('public.ta_export_job_log') is not null;

-- 2) ตรวจสอบ RPC / Function ใหม่
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    '_ta_can_manage_schedule_month',
    '_ta_guard_locked_schedule_month',
    'ta_get_schedule_month_status',
    'ta_set_schedule_month_status',
    'ta_resolve_review_items',
    'ta_get_review_queue_v600',
    'ta_get_employee_directory',
    'ta_get_shift_assignment_history',
    'ta_get_system_audit',
    'ta_get_notification_feed'
  )
order by p.proname;

-- 3) ตรวจสอบ Trigger ป้องกันแก้ไขเดือนที่ล็อก
select
  t.tgname as trigger_name,
  c.relname as table_name,
  p.proname as function_name,
  not t.tgisinternal as enabled
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'shift_calendar'
  and t.tgname = 'trg_ta_guard_locked_schedule_month';

-- 4) ทดสอบอ่านสถานะเดือน โดยไม่เปลี่ยนข้อมูล
select public.ta_get_schedule_month_status(current_date, null, null) as schedule_status_test;

-- 5) ตรวจจำนวนกะที่จัดไว้แต่ยังไม่ยืนยันของเดือนปัจจุบัน
select count(*) as unconfirmed_assigned_shifts_current_month
from public.shift_calendar sc
where sc.work_date >= date_trunc('month',current_date)::date
  and sc.work_date < (date_trunc('month',current_date) + interval '1 month')::date
  and not coalesce(sc.is_confirmed,false);

-- 6) ทดสอบ Notification Feed
select *
from public.ta_get_notification_feed(current_date - 7, current_date, 10);
