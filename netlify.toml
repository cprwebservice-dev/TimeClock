-- =============================================================
-- Time-Clock Enterprise V5.6.3 : SQL สำหรับตรวจสอบ
-- =============================================================

-- 1) ตรวจสอบว่า RPC ใหม่พร้อมใช้งาน
select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ta_get_monthly_schedule_v563';

-- 2) ตรวจสอบตารางเดือนถัดไปว่ามีข้อมูลทุกวัน รวมวันหยุด
-- รันใน SQL Editor อาจไม่มี auth.uid() จึงแนะนำทดสอบจากหน้าเว็บเป็นหลัก
select
  count(*) as saved_future_assignments,
  min(work_date) as first_date,
  max(work_date) as last_date
from public.shift_calendar
where work_date >= (date_trunc('month', current_date) + interval '1 month')::date;

-- 3) ตรวจสอบว่ากะสามารถถูกบันทึกในวันหยุดนักขัตฤกษ์ได้
select
  sc.work_date,
  sc.emp_code,
  sc.shift_code,
  sc.is_confirmed,
  h.holiday_name,
  sc.updated_at
from public.shift_calendar sc
join public.holidays h on h.holiday_date = sc.work_date
order by sc.updated_at desc
limit 20;

-- 4) ตรวจสอบกะที่บันทึกในวันเสาร์/อาทิตย์
select
  sc.work_date,
  extract(dow from sc.work_date)::integer as day_of_week,
  sc.emp_code,
  sc.shift_code,
  sc.is_confirmed,
  sc.updated_at
from public.shift_calendar sc
where extract(dow from sc.work_date)::integer in (0, 6)
order by sc.updated_at desc
limit 20;

-- 5) ตรวจสอบคอลัมน์เวลาเริ่ม/สิ้นสุดกะใน Attendance
select
  aw.work_date,
  aw.emp_code,
  aw.shift_code,
  aw.shift_start_time,
  aw.shift_end_time
from public.attendance_workday aw
where aw.shift_code is not null
order by aw.work_date desc
limit 20;
