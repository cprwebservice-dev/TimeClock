-- ============================================================================
-- SQL สำหรับตรวจสอบ
-- Time-Clock Enterprise V6.15.23
-- 4D.1A — Team Master + Auto Generate Team
-- ============================================================================

with checks as (
  select 1 seq,'team_master_table' check_name,
    case when to_regclass('public.ta_teams_v61523') is not null then 'PASS' else 'FAIL' end result,
    'ต้องมี Team Master' detail

  union all
  select 2,'team_sequence_table',
    case when to_regclass('public.ta_team_sequences_v61523') is not null then 'PASS' else 'FAIL' end,
    'ต้องมี Running Number แยกตาม Org Unit'

  union all
  select 3,'team_audit_table',
    case when to_regclass('public.ta_team_audit_v61523') is not null then 'PASS' else 'FAIL' end,
    'ต้องมี Team Change Log'

  union all
  select 4,'team_org_foreign_key',
    case when exists(
      select 1
      from pg_constraint c
      where c.conrelid='public.ta_teams_v61523'::regclass
        and c.contype='f'
        and pg_get_constraintdef(c.oid) ilike '%ta_org_units%'
    ) then 'PASS' else 'FAIL' end,
    'Team ต้องอ้างอิง Organization Master เดิม'

  union all
  select 5,'team_number_never_reused',
    case when exists(
      select 1 from pg_constraint c
      where c.conrelid='public.ta_teams_v61523'::regclass
        and c.contype='u'
        and pg_get_constraintdef(c.oid) ilike '%org_unit_id%team_no%'
    )
    and to_regclass('public.ta_team_sequences_v61523') is not null
    then 'PASS' else 'FAIL' end,
    'เลขทีมต้อง Unique ต่อ Org และมี Sequence แยกเพื่อไม่ Reuse'

  union all
  select 6,'team_code_unique',
    case when exists(
      select 1 from pg_constraint c
      where c.conrelid='public.ta_teams_v61523'::regclass
        and c.contype='u'
        and pg_get_constraintdef(c.oid) ilike '%team_code%'
    ) then 'PASS' else 'FAIL' end,
    'Team Code ต้องไม่ซ้ำทั้งระบบ'

  union all
  select 7,'identity_auto_generated_backend',
    case when to_regprocedure('public._ta_normalize_team_identity_v61523()') is not null
      and exists(
        select 1 from pg_trigger t
        where t.tgrelid='public.ta_teams_v61523'::regclass
          and t.tgname='trg_ta_normalize_team_identity_v61523'
          and not t.tgisinternal
          and t.tgenabled<>'D'
      )
      and pg_get_functiondef('public._ta_normalize_team_identity_v61523()'::regprocedure)
          ilike '%ทีม %team_code%'
    then 'PASS' else 'FAIL' end,
    'ชื่อ/รหัสทีมสร้างจาก Backend และเขียนทับค่าที่ส่งจาก Client'

  union all
  select 8,'team_identity_immutable',
    case when pg_get_functiondef('public._ta_normalize_team_identity_v61523()'::regprocedure)
      ilike '%TEAM_IDENTITY_IMMUTABLE%'
    then 'PASS' else 'FAIL' end,
    'หลังสร้างแล้วห้ามย้าย Org หรือเปลี่ยน Team Number'

  union all
  select 9,'manager_org_authorization',
    case when to_regprocedure('public._ta_team_can_manage_org_v61523(uuid)') is not null
      and pg_get_functiondef('public._ta_team_can_manage_org_v61523(uuid)'::regprocedure)
        ilike '%ta_can_access_employee_v680%EDIT_SCHEDULE%'
    then 'PASS' else 'FAIL' end,
    'Manager Team Master ต้องอิงสิทธิ์ EDIT_SCHEDULE เดิม'

  union all
  select 10,'org_options_rpc',
    case when to_regprocedure('public.ta_get_team_org_options_v61523(boolean)') is not null
    then 'PASS' else 'FAIL' end,
    'Frontend ต้องโหลดเฉพาะ Org ที่ Manager/HR Admin จัดการได้'

  union all
  select 11,'create_rpc_auto_only',
    case when to_regprocedure('public.ta_create_team_v61523(uuid,text)') is not null
      and pg_get_functiondef('public.ta_create_team_v61523(uuid,text)'::regprocedure)
        not ilike '%p_team_name%'
      and pg_get_functiondef('public.ta_create_team_v61523(uuid,text)'::regprocedure)
        not ilike '%p_team_code%'
      and pg_get_functiondef('public.ta_create_team_v61523(uuid,text)'::regprocedure)
        ilike '%team-master-sequence%'
    then 'PASS' else 'FAIL' end,
    'Create API ต้องไม่มีช่องรับ Team Name/Code และต้อง Serialize Running Number'

  union all
  select 12,'soft_deactivate_only',
    case when to_regprocedure('public.ta_deactivate_team_v61523(uuid,text)') is not null
      and pg_get_functiondef('public.ta_deactivate_team_v61523(uuid,text)'::regprocedure)
        ilike '%is_active=false%'
      and pg_get_functiondef('public.ta_deactivate_team_v61523(uuid,text)'::regprocedure)
        not ilike '%delete from public.ta_teams_v61523%'
    then 'PASS' else 'FAIL' end,
    'Team Master ใช้ Soft Deactivate ไม่ลบ Team Identity'

  union all
  select 13,'team_audit_wired',
    case when pg_get_functiondef('public.ta_create_team_v61523(uuid,text)'::regprocedure)
        ilike '%ta_team_audit_v61523%'
      and pg_get_functiondef('public.ta_create_team_v61523(uuid,text)'::regprocedure)
        ilike '%CREATE_TEAM%'
      and pg_get_functiondef('public.ta_deactivate_team_v61523(uuid,text)'::regprocedure)
        ilike '%ta_team_audit_v61523%'
      and pg_get_functiondef('public.ta_deactivate_team_v61523(uuid,text)'::regprocedure)
        ilike '%DEACTIVATE_TEAM%'
    then 'PASS' else 'FAIL' end,
    'Create/Deactivate ต้องมี Audit'

  union all
  select 14,'direct_table_write_closed',
    case when not has_table_privilege('authenticated','public.ta_teams_v61523','INSERT')
      and not has_table_privilege('authenticated','public.ta_teams_v61523','UPDATE')
      and not has_table_privilege('authenticated','public.ta_teams_v61523','DELETE')
    then 'PASS' else 'FAIL' end,
    'Web User ต้องเขียน Team ผ่าน RPC เท่านั้น'

  union all
  select 15,'authenticated_team_rpc_execute',
    case when has_function_privilege('authenticated','public.ta_get_team_master_v61523(uuid,boolean,text)','EXECUTE')
      and has_function_privilege('authenticated','public.ta_create_team_v61523(uuid,text)','EXECUTE')
      and has_function_privilege('authenticated','public.ta_deactivate_team_v61523(uuid,text)','EXECUTE')
    then 'PASS' else 'FAIL' end,
    'Manager/HR Admin Web ต้องเรียก Team Master RPC ได้'

  union all
  select 16,'no_team_enforcement_yet',
    case when pg_get_functiondef('public.ta_create_team_v61523(uuid,text)'::regprocedure)
      not ilike '%ta_assign_shifts_bulk%'
    then 'PASS' else 'FAIL' end,
    '4D.1A ต้องยังไม่แก้ Schedule Writer / Team Enforcement'
)
select seq,check_name,result,detail
from checks
order by seq;

select
  o.org_code,
  o.org_name,
  count(t.team_id) as total_teams,
  count(t.team_id) filter(where t.is_active) as active_teams,
  max(t.team_no) as highest_team_no,
  s.next_no
from public.ta_org_units o
left join public.ta_teams_v61523 t on t.org_unit_id=o.org_id
left join public.ta_team_sequences_v61523 s on s.org_unit_id=o.org_id
where exists(
  select 1 from public.ta_teams_v61523 tx where tx.org_unit_id=o.org_id
)
group by o.org_code,o.org_name,s.next_no
order by o.org_code;
