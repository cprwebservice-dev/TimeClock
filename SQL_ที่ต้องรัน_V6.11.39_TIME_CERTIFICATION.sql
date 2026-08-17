-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.11.39
-- Time Certification: Reason Master + Certified Time Overlay + Audit
-- ============================================================================

begin;
set local statement_timeout = '0';

-- ---------------------------------------------------------------------------
-- 1) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ta_attendance_certifications') is null then raise exception 'MISSING_TABLE: ta_attendance_certifications'; end if;
  if to_regclass('public.attendance_workday') is null then raise exception 'MISSING_TABLE: attendance_workday'; end if;
  if to_regclass('public.ta_attendance_calculations') is null then raise exception 'MISSING_TABLE: ta_attendance_calculations'; end if;
  if to_regprocedure('public._ta_current_access_v681()') is null then raise exception 'MISSING_FUNCTION: _ta_current_access_v681'; end if;
  if to_regprocedure('public.ta_can_access_employee_v680(text,date,text)') is null then raise exception 'MISSING_FUNCTION: ta_can_access_employee_v680'; end if;
  if to_regprocedure('public._ta_assert_system_period_action_v6110(date,text)') is null then raise exception 'MISSING_FUNCTION: _ta_assert_system_period_action_v6110'; end if;
  if to_regprocedure('public._ta_refresh_attendance_calc_core_v630(date,date,text[])') is null then raise exception 'MISSING_FUNCTION: _ta_refresh_attendance_calc_core_v630'; end if;
  if to_regprocedure('public.ta_get_schedule_range_v61024(date,date,text,text,text[],text[])') is null then raise exception 'MISSING_FUNCTION: ta_get_schedule_range_v61024'; end if;
  if to_regprocedure('public._ta_require_hr_admin_v6110()') is null then raise exception 'MISSING_FUNCTION: _ta_require_hr_admin_v6110'; end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Reason Master
-- ---------------------------------------------------------------------------
create table if not exists public.ta_time_certification_reasons (
  reason_id uuid primary key default gen_random_uuid(),
  reason_code text not null unique,
  reason_name text not null,
  requires_note boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_by uuid,
  updated_at timestamptz not null default now(),
  constraint ck_time_cert_reason_code_v61139 check (reason_code = upper(trim(reason_code)) and length(trim(reason_code)) between 2 and 10)
);

create index if not exists idx_time_cert_reason_active_v61139 on public.ta_time_certification_reasons(is_active,sort_order,reason_code);
alter table public.ta_time_certification_reasons enable row level security;

insert into public.ta_time_certification_reasons(reason_code,reason_name,requires_note,sort_order,is_active)
values
 ('W01','ใบรับรองปฏิบัติงานนอกสถานที่',false,1,true),
 ('W02','รถรับ-ส่งพนักงาน มาสาย',false,2,true),
 ('W03','พนักงานเริ่มงานใหม่',false,3,true),
 ('W04','บัตรพนักงานชำรุด (HR รับทราบ)',false,4,true),
 ('W05','ปฏิบัติงานล่วงเวลา',false,5,true),
 ('W06','เครื่องรูดบัตรชำรุด',false,6,true),
 ('W07','อบรม (บริษัทสั่งตัว)',false,7,true),
 ('W08','ลืมบัตรพนักงาน',false,8,true),
 ('W09','บัตรหาย',false,9,true),
 ('W10','ไม่ได้รูดบัตรเข้า-ออก',false,10,true),
 ('W11','ลาอบรม (เปิดร้าน Fz.)',false,11,true),
 ('W12','Work from anywhere',false,12,true),
 ('W13','หยุดชดเชย',false,13,true),
 ('W14','โครงการพิเศษ-รักษาความปลอดภัย',false,14,false),
 ('W15','โครงการพิเศษ-ค่าเบี้ยเลี้ยง',false,15,false),
 ('W16','GOS-ปฏิบัติงานล่วงเวลา',false,16,true),
 ('W90','อื่นๆ (ระบุเหตุผล)',true,90,true)
on conflict(reason_code) do update set
  reason_name=excluded.reason_name,
  requires_note=excluded.requires_note,
  sort_order=excluded.sort_order,
  is_active=excluded.is_active,
  updated_at=now();

-- ---------------------------------------------------------------------------
-- 3) Extend existing Certification table; preserve old V6.8/V6.11 APIs
-- ---------------------------------------------------------------------------
alter table public.ta_attendance_certifications add column if not exists certified_start_at timestamp without time zone;
alter table public.ta_attendance_certifications add column if not exists certified_end_at timestamp without time zone;
alter table public.ta_attendance_certifications add column if not exists reason_id uuid;
alter table public.ta_attendance_certifications add column if not exists reason_code_snapshot text;
alter table public.ta_attendance_certifications add column if not exists reason_name_snapshot text;
alter table public.ta_attendance_certifications add column if not exists shift_code_snapshot text;
alter table public.ta_attendance_certifications add column if not exists shift_start_at_snapshot timestamp without time zone;
alter table public.ta_attendance_certifications add column if not exists shift_end_at_snapshot timestamp without time zone;
alter table public.ta_attendance_certifications add column if not exists actual_in_at_snapshot timestamp without time zone;
alter table public.ta_attendance_certifications add column if not exists actual_out_at_snapshot timestamp without time zone;
alter table public.ta_attendance_certifications add column if not exists certified_by_email text;
alter table public.ta_attendance_certifications add column if not exists certification_version text;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='fk_time_cert_reason_v61139' and conrelid='public.ta_attendance_certifications'::regclass) then
    alter table public.ta_attendance_certifications add constraint fk_time_cert_reason_v61139 foreign key(reason_id) references public.ta_time_certification_reasons(reason_id);
  end if;
end $$;

create index if not exists idx_att_cert_effective_v61139 on public.ta_attendance_certifications(work_date,emp_code,status) include(certified_start_at,certified_end_at,reason_code_snapshot);

create table if not exists public.ta_time_certification_audit (
  audit_id bigint generated always as identity primary key,
  certification_id uuid,
  emp_code text not null,
  work_date date not null,
  action_type text not null,
  before_data jsonb,
  after_data jsonb,
  changed_by uuid,
  changed_by_email text,
  changed_role text,
  changed_at timestamptz not null default now(),
  note text
);
create index if not exists idx_time_cert_audit_lookup_v61139 on public.ta_time_certification_audit(emp_code,work_date,changed_at desc);
alter table public.ta_time_certification_audit enable row level security;

-- ---------------------------------------------------------------------------
-- 4) Reason APIs
-- ---------------------------------------------------------------------------
create or replace function public.ta_list_time_certification_reasons_v61139(p_include_inactive boolean default false)
returns table(reason_id uuid,reason_code text,reason_name text,requires_note boolean,sort_order integer,is_active boolean,updated_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if coalesce(p_include_inactive,false) then perform public._ta_require_hr_admin_v6110(); end if;
  return query
  select r.reason_id,r.reason_code,r.reason_name,r.requires_note,r.sort_order,r.is_active,r.updated_at
  from public.ta_time_certification_reasons r
  where coalesce(p_include_inactive,false) or r.is_active
  order by r.sort_order,r.reason_code;
end; $$;
revoke all on function public.ta_list_time_certification_reasons_v61139(boolean) from public;
grant execute on function public.ta_list_time_certification_reasons_v61139(boolean) to authenticated;

create or replace function public.ta_admin_save_time_certification_reason_v61139(
  p_reason_code text,p_reason_name text,p_requires_note boolean default false,p_sort_order integer default 0,p_is_active boolean default true
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_code text:=upper(trim(coalesce(p_reason_code,''))); v_name text:=trim(coalesce(p_reason_name,'')); v_row public.ta_time_certification_reasons%rowtype;
begin
  perform public._ta_require_hr_admin_v6110();
  if v_code='' then raise exception 'TIME_CERTIFICATION_REASON_CODE_REQUIRED'; end if;
  if v_name='' then raise exception 'TIME_CERTIFICATION_REASON_NAME_REQUIRED'; end if;
  insert into public.ta_time_certification_reasons(reason_code,reason_name,requires_note,sort_order,is_active,created_by,updated_by,updated_at)
  values(v_code,v_name,coalesce(p_requires_note,false),coalesce(p_sort_order,0),coalesce(p_is_active,true),auth.uid(),auth.uid(),now())
  on conflict(reason_code) do update set reason_name=excluded.reason_name,requires_note=excluded.requires_note,sort_order=excluded.sort_order,is_active=excluded.is_active,updated_by=auth.uid(),updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end; $$;
revoke all on function public.ta_admin_save_time_certification_reason_v61139(text,text,boolean,integer,boolean) from public;
grant execute on function public.ta_admin_save_time_certification_reason_v61139(text,text,boolean,integer,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Set-based certification reader for Team Daily / Monthly Overview
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_time_certification_range_v61139(p_start_date date,p_end_date date,p_emp_codes text[] default null)
returns table(
 certification_id uuid,emp_code text,work_date date,certification_status text,certified_start_at timestamp without time zone,certified_end_at timestamp without time zone,
 certification_reason_code text,certification_reason_name text,certification_note text,certified_role text,certified_manager_level text,certified_by_email text,certified_by_name text,certified_at timestamptz,
 certification_shift_code text,certification_shift_start_at timestamp without time zone,certification_shift_end_at timestamp without time zone,certification_actual_in_at timestamp without time zone,certification_actual_out_at timestamp without time zone
) language sql stable security definer set search_path=public as $$
  select c.id,c.emp_code,c.work_date,c.status,c.certified_start_at,c.certified_end_at,c.reason_code_snapshot,c.reason_name_snapshot,c.certification_note,c.certified_role,c.certified_manager_level,c.certified_by_email,
         coalesce(nullif(trim(p.display_name),''),nullif(trim(p.email),''),c.certified_by_email,'-') as certified_by_name,c.certified_at,c.shift_code_snapshot,c.shift_start_at_snapshot,c.shift_end_at_snapshot,c.actual_in_at_snapshot,c.actual_out_at_snapshot
  from public.ta_attendance_certifications c
  left join public.ta_user_profiles p on p.user_id=c.certified_by
  where c.work_date between least(p_start_date,p_end_date) and greatest(p_start_date,p_end_date)
    and (
      p_emp_codes is null
      or public.normalize_emp_code(c.emp_code) = any(
        array(
          select public.normalize_emp_code(u.emp_code)
          from unnest(p_emp_codes) as u(emp_code)
          where nullif(public.normalize_emp_code(u.emp_code),'') is not null
        )
      )
    )
    and public.ta_can_access_employee_v680(c.emp_code,c.work_date,'VIEW')
  order by c.work_date,c.emp_code;
$$;
revoke all on function public.ta_get_time_certification_range_v61139(date,date,text[]) from public;
grant execute on function public.ta_get_time_certification_range_v61139(date,date,text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Certification-aware calculation overlay
--    Raw time_logs are never changed. attendance_workday raw punch fields are
--    temporarily overlaid inside the same transaction, calculation is run,
--    then the raw fields are restored before commit.
-- ---------------------------------------------------------------------------
create or replace function public._ta_refresh_attendance_with_certification_v61139(p_start_date date,p_end_date date,p_emp_codes text[] default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_base jsonb; v_overlay jsonb; v_cert_count integer:=0; r record;
  v_first_in time; v_last_out time; v_source_in date; v_source_out date; v_meta jsonb; v_calc_meta jsonb;
begin
  v_base:=public._ta_refresh_attendance_calc_core_v630(p_start_date,p_end_date,p_emp_codes);
  for r in
    select c.* from public.ta_attendance_certifications c
    where c.status='CERTIFIED' and c.certified_start_at is not null and c.certified_end_at is not null
      and c.work_date between p_start_date and p_end_date
      and (
      p_emp_codes is null
      or public.normalize_emp_code(c.emp_code) = any(
        array(
          select public.normalize_emp_code(u.emp_code)
          from unnest(p_emp_codes) as u(emp_code)
          where nullif(public.normalize_emp_code(u.emp_code),'') is not null
        )
      )
    )
    order by c.work_date,c.emp_code
  loop
    select aw.first_in,aw.last_out,aw.source_in_date,aw.source_out_date,aw.raw_meta into v_first_in,v_last_out,v_source_in,v_source_out,v_meta
    from public.attendance_workday aw where public.normalize_emp_code(aw.emp_code)=public.normalize_emp_code(r.emp_code) and aw.work_date=r.work_date for update;
    if not found then continue; end if;

    perform set_config('ta.certification_overlay_v61139','on',true);
    update public.attendance_workday set
      first_in=r.certified_start_at::time, source_in_date=r.certified_start_at::date,
      last_out=r.certified_end_at::time, source_out_date=r.certified_end_at::date,
      updated_at=now()
    where public.normalize_emp_code(emp_code)=public.normalize_emp_code(r.emp_code) and work_date=r.work_date;

    v_overlay:=public._ta_refresh_attendance_calc_core_v630(r.work_date,r.work_date,array[r.emp_code]::text[]);
    select raw_meta into v_calc_meta from public.attendance_workday where public.normalize_emp_code(emp_code)=public.normalize_emp_code(r.emp_code) and work_date=r.work_date;

    update public.attendance_workday set
      first_in=v_first_in,last_out=v_last_out,source_in_date=v_source_in,source_out_date=v_source_out,
      raw_meta=coalesce(v_calc_meta,v_meta,'{}'::jsonb)||jsonb_build_object(
        'time_certification_active',true,'time_certification_id',r.id,'certified_start_at',r.certified_start_at,'certified_end_at',r.certified_end_at,
        'certification_reason_code',r.reason_code_snapshot,'certification_version','V6.11.39'
      ),updated_at=now()
    where public.normalize_emp_code(emp_code)=public.normalize_emp_code(r.emp_code) and work_date=r.work_date;

    update public.ta_attendance_calculations set raw_meta=coalesce(raw_meta,'{}'::jsonb)||jsonb_build_object(
      'time_certification_active',true,'time_certification_id',r.id,'certified_start_at',r.certified_start_at,'certified_end_at',r.certified_end_at,
      'certification_reason_code',r.reason_code_snapshot,'certification_version','V6.11.39'
    ),calculated_at=now()
    where public.normalize_emp_code(emp_code)=public.normalize_emp_code(r.emp_code) and work_date=r.work_date;

    perform set_config('ta.certification_overlay_v61139','off',true);
    v_cert_count:=v_cert_count+1;
  end loop;
  return coalesce(v_base,'{}'::jsonb)||jsonb_build_object('certification_overlay_rows',v_cert_count,'certification_version','V6.11.39');
exception when others then
  perform set_config('ta.certification_overlay_v61139','off',true);
  raise;
end; $$;
revoke all on function public._ta_refresh_attendance_with_certification_v61139(date,date,text[]) from public;

-- Trigger always respects active timed certification.
create or replace function public._ta_attendance_calc_trigger_v630()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if coalesce(current_setting('ta.certification_overlay_v61139',true),'off')='on' then return new; end if;
  if pg_trigger_depth()>1 then return new; end if;
  perform public._ta_refresh_attendance_with_certification_v61139(new.work_date,new.work_date,array[new.emp_code]::text[]);
  return new;
end; $$;
revoke all on function public._ta_attendance_calc_trigger_v630() from public;

-- Keep all current Schedule / Monthly / Attendance Rebuild paths certification-aware.
create or replace function public._ta_recalculate_after_schedule_change_v61029(p_start_date date,p_end_date date,p_emp_codes text[])
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_start date;v_end date;v_codes text[];v_result jsonb;v_attendance_rows bigint:=0;
begin
  v_start:=least(coalesce(p_start_date,current_date),coalesce(p_end_date,current_date));
  v_end:=greatest(coalesce(p_start_date,current_date),coalesce(p_end_date,current_date));
  select coalesce(array_agg(distinct public.normalize_emp_code(x.emp_code) order by public.normalize_emp_code(x.emp_code)) filter(where nullif(public.normalize_emp_code(x.emp_code),'') is not null),array[]::text[])
  into v_codes from unnest(coalesce(p_emp_codes,array[]::text[]))x(emp_code);
  if cardinality(v_codes)=0 then return jsonb_build_object('recalculated',false,'reason','NO_EMPLOYEE','start_date',v_start,'end_date',v_end,'attendance_rows',0,'version','V6.11.39'); end if;
  select count(*) into v_attendance_rows from public.attendance_workday aw where aw.work_date between v_start and v_end and public.normalize_emp_code(aw.emp_code)=any(v_codes);
  if v_attendance_rows=0 then return jsonb_build_object('recalculated',true,'deferred',true,'reason','NO_ATTENDANCE_YET','start_date',v_start,'end_date',v_end,'employee_count',cardinality(v_codes),'attendance_rows',0,'version','V6.11.39'); end if;
  v_result:=public._ta_refresh_attendance_with_certification_v61139(v_start,v_end,v_codes);
  return coalesce(v_result,'{}'::jsonb)||jsonb_build_object('recalculated',true,'deferred',false,'employee_count',cardinality(v_codes),'attendance_rows',v_attendance_rows,'recalculated_at',now(),'version','V6.11.39');
end; $$;
revoke all on function public._ta_recalculate_after_schedule_change_v61029(date,date,text[]) from public;

-- ---------------------------------------------------------------------------
-- 7) Save / Edit Time Certification
-- ---------------------------------------------------------------------------
create or replace function public.ta_save_time_certification_v61139(
  p_emp_code text,p_work_date date,p_certified_start_at timestamp without time zone,p_certified_end_at timestamp without time zone,p_reason_code text,p_note text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_access record;v_emp text:=public.normalize_emp_code(p_emp_code);v_reason public.ta_time_certification_reasons%rowtype;v_before jsonb;v_row public.ta_attendance_certifications%rowtype;
  v_shift_code text;v_shift_start time;v_shift_end time;v_shift_start_at timestamp without time zone;v_shift_end_at timestamp without time zone;
  v_actual_in timestamp without time zone;v_actual_out timestamp without time zone;v_first_in time;v_last_out time;v_source_in date;v_source_out date;v_recalc jsonb;v_email text;v_manager_level text;
begin
  select * into v_access from public._ta_current_access_v681() where is_active limit 1;
  if not found or v_access.role not in('HR_ADMIN','MANAGER') then raise exception 'TIME_CERTIFICATION_PERMISSION_DENIED'; end if;
  if v_access.role='MANAGER' and v_emp=public.normalize_emp_code(v_access.emp_code) then raise exception 'MANAGER_CANNOT_CERTIFY_OWN_ATTENDANCE'; end if;
  perform public._ta_assert_system_period_action_v6110(p_work_date,'ATTENDANCE_CERTIFY');
  if not public.ta_can_access_employee_v680(v_emp,p_work_date,'CERTIFY_ATTENDANCE') then raise exception 'TIME_CERTIFICATION_SCOPE_DENIED'; end if;
  if p_certified_start_at is null or p_certified_end_at is null then raise exception 'TIME_CERTIFICATION_TIME_REQUIRED'; end if;
  if p_certified_end_at<=p_certified_start_at then raise exception 'TIME_CERTIFICATION_END_MUST_BE_AFTER_START'; end if;

  select * into v_reason from public.ta_time_certification_reasons where reason_code=upper(trim(coalesce(p_reason_code,''))) and is_active;
  if not found then raise exception 'TIME_CERTIFICATION_REASON_NOT_ACTIVE'; end if;
  if v_reason.requires_note and nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'TIME_CERTIFICATION_NOTE_REQUIRED'; end if;

  select r.effective_shift_code,r.shift_start_time,r.shift_end_time into v_shift_code,v_shift_start,v_shift_end
  from public.ta_get_schedule_range_v61024(p_work_date,p_work_date,null,null,array[v_emp]::text[],null) r
  where public.normalize_emp_code(r.emp_code)=v_emp and r.work_date=p_work_date limit 1;
  if v_shift_start is null or v_shift_end is null then raise exception 'TIME_CERTIFICATION_SHIFT_REQUIRED'; end if;
  v_shift_start_at:=(p_work_date+v_shift_start)::timestamp;
  v_shift_end_at:=(p_work_date+v_shift_end)::timestamp + case when v_shift_end<=v_shift_start then interval '1 day' else interval '0 day' end;
  if p_certified_start_at<v_shift_start_at then raise exception 'TIME_CERTIFICATION_START_BEFORE_SHIFT: % | %',p_certified_start_at,v_shift_start_at; end if;

  select aw.first_in,aw.last_out,aw.source_in_date,aw.source_out_date into v_first_in,v_last_out,v_source_in,v_source_out
  from public.attendance_workday aw where public.normalize_emp_code(aw.emp_code)=v_emp and aw.work_date=p_work_date limit 1;
  if not found then raise exception 'ATTENDANCE_DAY_NOT_FOUND'; end if;
  if v_first_in is not null then v_actual_in:=(coalesce(v_source_in,p_work_date)+v_first_in)::timestamp; end if;
  if v_last_out is not null then v_actual_out:=(coalesce(v_source_out,p_work_date+case when v_first_in is not null and v_last_out<v_first_in then 1 else 0 end)+v_last_out)::timestamp; end if;

  select to_jsonb(c) into v_before from public.ta_attendance_certifications c where public.normalize_emp_code(c.emp_code)=v_emp and c.work_date=p_work_date;
  v_email:=coalesce(nullif(trim(v_access.email),''),auth.jwt()->>'email');
  select nullif(upper(trim(coalesce(to_jsonb(p)->>'manager_level',''))),'')
    into v_manager_level
  from public.ta_user_profiles p
  where p.user_id=auth.uid()
  limit 1;

  insert into public.ta_attendance_certifications(
    emp_code,work_date,status,certification_note,certified_by,certified_role,certified_manager_level,certified_at,revoked_by,revoked_at,revoke_note,updated_at,
    certified_start_at,certified_end_at,reason_id,reason_code_snapshot,reason_name_snapshot,shift_code_snapshot,shift_start_at_snapshot,shift_end_at_snapshot,
    actual_in_at_snapshot,actual_out_at_snapshot,certified_by_email,certification_version
  ) values(
    v_emp,p_work_date,'CERTIFIED',nullif(trim(coalesce(p_note,'')),''),auth.uid(),v_access.role,v_manager_level,now(),null,null,null,now(),
    p_certified_start_at,p_certified_end_at,v_reason.reason_id,v_reason.reason_code,v_reason.reason_name,v_shift_code,v_shift_start_at,v_shift_end_at,
    v_actual_in,v_actual_out,v_email,'V6.11.39'
  ) on conflict(emp_code,work_date) do update set
    status='CERTIFIED',certification_note=excluded.certification_note,certified_by=excluded.certified_by,certified_role=excluded.certified_role,certified_manager_level=excluded.certified_manager_level,certified_at=excluded.certified_at,
    revoked_by=null,revoked_at=null,revoke_note=null,updated_at=now(),certified_start_at=excluded.certified_start_at,certified_end_at=excluded.certified_end_at,
    reason_id=excluded.reason_id,reason_code_snapshot=excluded.reason_code_snapshot,reason_name_snapshot=excluded.reason_name_snapshot,shift_code_snapshot=excluded.shift_code_snapshot,
    shift_start_at_snapshot=excluded.shift_start_at_snapshot,shift_end_at_snapshot=excluded.shift_end_at_snapshot,actual_in_at_snapshot=excluded.actual_in_at_snapshot,actual_out_at_snapshot=excluded.actual_out_at_snapshot,
    certified_by_email=excluded.certified_by_email,certification_version='V6.11.39'
  returning * into v_row;

  insert into public.ta_time_certification_audit(certification_id,emp_code,work_date,action_type,before_data,after_data,changed_by,changed_by_email,changed_role,note)
  values(v_row.id,v_emp,p_work_date,case when v_before is null then 'CREATE' else 'UPDATE' end,v_before,to_jsonb(v_row),auth.uid(),v_email,v_access.role,p_note);

  v_recalc:=public._ta_refresh_attendance_with_certification_v61139(p_work_date,p_work_date,array[v_emp]::text[]);
  return to_jsonb(v_row)||jsonb_build_object('attendance_recalculation',v_recalc,'version','V6.11.39');
end; $$;
revoke all on function public.ta_save_time_certification_v61139(text,date,timestamp without time zone,timestamp without time zone,text,text) from public;
grant execute on function public.ta_save_time_certification_v61139(text,date,timestamp without time zone,timestamp without time zone,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Revoke timed certification and recalc from raw Punch
-- ---------------------------------------------------------------------------
create or replace function public.ta_revoke_time_certification_v61139(p_emp_code text,p_work_date date,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_access record;v_emp text:=public.normalize_emp_code(p_emp_code);v_before jsonb;v_row public.ta_attendance_certifications%rowtype;v_recalc jsonb;v_email text;
begin
  select * into v_access from public._ta_current_access_v681() where is_active limit 1;
  if not found or v_access.role not in('HR_ADMIN','MANAGER') then raise exception 'TIME_CERTIFICATION_PERMISSION_DENIED'; end if;
  perform public._ta_assert_system_period_action_v6110(p_work_date,'ATTENDANCE_REVOKE_CERTIFICATION');
  if not public.ta_can_access_employee_v680(v_emp,p_work_date,'CERTIFY_ATTENDANCE') then raise exception 'TIME_CERTIFICATION_SCOPE_DENIED'; end if;
  select to_jsonb(c) into v_before from public.ta_attendance_certifications c where public.normalize_emp_code(c.emp_code)=v_emp and c.work_date=p_work_date;
  if v_before is null then raise exception 'ATTENDANCE_CERTIFICATION_NOT_FOUND'; end if;
  v_email:=coalesce(nullif(trim(v_access.email),''),auth.jwt()->>'email');
  update public.ta_attendance_certifications set status='REVOKED',revoked_by=auth.uid(),revoked_at=now(),revoke_note=nullif(trim(coalesce(p_note,'')),''),updated_at=now() where public.normalize_emp_code(emp_code)=v_emp and work_date=p_work_date returning * into v_row;
  insert into public.ta_time_certification_audit(certification_id,emp_code,work_date,action_type,before_data,after_data,changed_by,changed_by_email,changed_role,note)
  values(v_row.id,v_emp,p_work_date,'REVOKE',v_before,to_jsonb(v_row),auth.uid(),v_email,v_access.role,p_note);
  v_recalc:=public._ta_refresh_attendance_with_certification_v61139(p_work_date,p_work_date,array[v_emp]::text[]);
  return to_jsonb(v_row)||jsonb_build_object('attendance_recalculation',v_recalc,'version','V6.11.39');
end; $$;
revoke all on function public.ta_revoke_time_certification_v61139(text,date,text) from public;
grant execute on function public.ta_revoke_time_certification_v61139(text,date,text) to authenticated;

analyze public.ta_time_certification_reasons;
analyze public.ta_attendance_certifications;
analyze public.ta_time_certification_audit;
notify pgrst,'reload schema';
commit;
