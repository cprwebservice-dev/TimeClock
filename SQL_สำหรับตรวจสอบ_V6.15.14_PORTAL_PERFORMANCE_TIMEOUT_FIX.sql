-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.15.14
-- Employee Portal Performance Hotfix
-- ============================================================================

with checks as (
  select
    1 as seq,
    'same_shift_team_v61514'::text as check_name,
    case
      when to_regprocedure(
        'public.ta_portal_get_same_shift_team_v61509(text,date)'
      ) is not null
       and pg_get_functiondef(
        'public.ta_portal_get_same_shift_team_v61509(text,date)'::regprocedure
      ) ilike '%V6.15.14%'
      then 'PASS' else 'FAIL'
    end as result,
    'Same-shift team ใช้ Fast Team Resolver'::text as detail

  union all

  select
    2,
    'same_shift_no_all_employee_manager_resolve',
    case
      when pg_get_functiondef(
        'public.ta_portal_get_same_shift_team_v61509(text,date)'::regprocedure
      ) not ilike '%v_candidate_codes%'
       and pg_get_functiondef(
        'public.ta_portal_get_same_shift_team_v61509(text,date)'::regprocedure
      ) ilike '%limit 100%'
      then 'PASS' else 'FAIL'
    end,
    'ไม่ส่งพนักงานช่างทั้งหมดเข้า Manager Resolver'

  union all

  select
    3,
    'attendance_v61514_batch_punch_meta',
    case
      when pg_get_functiondef(
        'public.ta_portal_get_my_attendance_range_v61503(text,date,date)'::regprocedure
      ) ilike '%ta_get_attendance_shift_punch_meta_v61110%'
       and pg_get_functiondef(
        'public.ta_portal_get_my_attendance_range_v61503(text,date,date)'::regprocedure
      ) not ilike '%_ta_work_mode_punch_meta_v61449%'
      then 'PASS' else 'FAIL'
    end,
    'Attendance ใช้ Batch Punch Resolver ครั้งเดียวต่อช่วงวันที่'

  union all

  select
    4,
    'attendance_rpc_is_volatile',
    case
      when exists(
        select 1
        from pg_proc p
        where p.oid=to_regprocedure(
          'public.ta_portal_get_my_attendance_range_v61503(text,date,date)'
        )
          and p.provolatile='v'
      )
      then 'PASS' else 'FAIL'
    end,
    'Portal Session update last_seen_at ได้'

  union all

  select
    5,
    'attendance_normalized_index',
    case
      when to_regclass(
        'public.idx_portal_att_calc_norm_emp_date_v61514'
      ) is not null
       and to_regclass(
        'public.idx_portal_aw_norm_emp_date_v61514'
      ) is not null
      then 'PASS' else 'FAIL'
    end,
    'มี Index สำหรับ Attendance employee/date'

  union all

  select
    6,
    'time_log_normalized_index',
    case
      when to_regclass(
        'public.idx_portal_time_logs_norm_emp_date_time_v61514'
      ) is not null
      then 'PASS' else 'FAIL'
    end,
    'มี Index สำหรับ Punch employee/date/time'

  union all

  select
    7,
    'manager_hierarchy_indexes',
    case
      when to_regclass(
        'public.idx_portal_emp_mgr_department_norm_v61514'
      ) is not null
       and to_regclass(
        'public.idx_portal_emp_mgr_division_norm_v61514'
      ) is not null
       and to_regclass(
        'public.idx_portal_emp_mgr_gm_norm_v61514'
      ) is not null
       and to_regclass(
        'public.idx_portal_emp_mgr_avp_norm_v61514'
      ) is not null
      then 'PASS' else 'FAIL'
    end,
    'Same-shift team lookup มี Manager hierarchy indexes'

  union all

  select
    8,
    'portal_execute_permissions',
    case
      when has_function_privilege(
        'anon',
        'public.ta_portal_get_same_shift_team_v61509(text,date)',
        'EXECUTE'
      )
       and has_function_privilege(
        'anon',
        'public.ta_portal_get_my_attendance_range_v61503(text,date,date)',
        'EXECUTE'
      )
      then 'PASS' else 'FAIL'
    end,
    'Employee Portal เรียก RPC ทั้งสองตัวได้'
)
select *
from checks
order by seq;

-- ดู Index จริงที่เกี่ยวข้อง
select
  schemaname,
  tablename,
  indexname
from pg_indexes
where schemaname='public'
  and indexname like '%v61514%'
order by tablename,indexname;
