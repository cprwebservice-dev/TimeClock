-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.15.14
-- Employee Portal Performance Hotfix
--   1) Same-shift team timeout
--   2) Attendance range timeout
--   3) Indexes for normalized employee/date predicates
-- ============================================================================

begin;
set local statement_timeout='0';

select pg_advisory_xact_lock(
  hashtext('timeclock-v6.15.14-portal-performance-hotfix')
);

-- ---------------------------------------------------------------------------
-- 0) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure(
    'public.normalize_emp_code(text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: normalize_emp_code(text)';
  end if;

  if to_regprocedure(
    'public.ta_get_attendance_shift_punch_meta_v61110(date,date,text[])'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_get_attendance_shift_punch_meta_v61110';
  end if;

  if to_regprocedure(
    'public._ta_portal_session_emp_v61482(text)'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_portal_session_emp_v61482';
  end if;

  if to_regprocedure(
    'public.ta_get_schedule_manager_map_v61124(text[],date)'
  ) is null then
    raise exception 'MISSING_FUNCTION: ta_get_schedule_manager_map_v61124';
  end if;

  if to_regprocedure(
    'public._ta_portal_effective_shift_v61509(text,date)'
  ) is null then
    raise exception 'MISSING_FUNCTION: _ta_portal_effective_shift_v61509';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) Expression indexes matching the current normalized predicates.
--    normalize_emp_code(text) is IMMUTABLE, so expression indexes are safe.
-- ---------------------------------------------------------------------------
create index if not exists idx_portal_att_calc_norm_emp_date_v61514
  on public.ta_attendance_calculations(
    (public.normalize_emp_code(emp_code)),
    work_date
  );

create index if not exists idx_portal_aw_norm_emp_date_v61514
  on public.attendance_workday(
    (public.normalize_emp_code(emp_code)),
    work_date
  );

create index if not exists idx_portal_cert_norm_emp_date_v61514
  on public.ta_attendance_certifications(
    (public.normalize_emp_code(emp_code)),
    work_date,
    status
  );

create index if not exists idx_portal_segment_norm_emp_date_v61514
  on public.ta_attendance_segment_results(
    (public.normalize_emp_code(emp_code)),
    work_date,
    segment_no
  );

create index if not exists idx_portal_shift_calendar_norm_emp_date_v61514
  on public.shift_calendar(
    (public.normalize_emp_code(emp_code)),
    work_date
  );

create index if not exists idx_portal_time_logs_norm_emp_date_time_v61514
  on public.time_logs(
    (public.normalize_emp_code(emp_code)),
    inout_date,
    inout_time
  );

create index if not exists idx_portal_emp_mgr_department_norm_v61514
  on public.employees(
    (public.normalize_emp_code(manager_department))
  );

create index if not exists idx_portal_emp_mgr_division_norm_v61514
  on public.employees(
    (public.normalize_emp_code(manager_division))
  );

create index if not exists idx_portal_emp_mgr_gm_norm_v61514
  on public.employees(
    (public.normalize_emp_code(manager_gm))
  );

create index if not exists idx_portal_emp_mgr_avp_norm_v61514
  on public.employees(
    (public.normalize_emp_code(manager_avp))
  );

-- ---------------------------------------------------------------------------
-- 2) Same-shift team V6.15.14
--
-- Previous V6.15.09 collected ALL active technicians, then called the full
-- canonical Manager Resolver for that whole array. With ~1,500 technicians
-- this became expensive enough to hit statement_timeout.
--
-- V6.15.14 resolves ONLY the current employee's canonical Manager once, then
-- derives that Manager's candidate team directly from the same hierarchy/scope
-- rule. The expensive resolver is no longer executed for all technicians.
-- ---------------------------------------------------------------------------
create or replace function public.ta_portal_get_same_shift_team_v61509(
  p_session_token text,
  p_work_date date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_emp text;
  v_today date:=public._ta_bangkok_today_v6110();
  v_self record;
  v_manager record;
  v_members jsonb:='[]'::jsonb;
  v_total integer:=0;
begin
  v_emp:=public._ta_portal_session_emp_v61482(
    p_session_token
  );

  if p_work_date is null then
    raise exception 'WORK_DATE_REQUIRED';
  end if;

  if p_work_date<v_today-1
     or p_work_date>v_today then
    raise exception 'PORTAL_HOME_TEAM_DATE_RANGE';
  end if;

  select *
  into v_self
  from public._ta_portal_effective_shift_v61509(
    v_emp,
    p_work_date
  )
  limit 1;

  if not found
     or not coalesce(v_self.is_workday,false) then
    return jsonb_build_object(
      'work_date',p_work_date,
      'emp_code',v_emp,
      'self_shift_code',v_self.effective_shift_code,
      'self_shift_name',v_self.shift_name,
      'self_shift_start_time',v_self.shift_start_time,
      'self_shift_end_time',v_self.shift_end_time,
      'total_members',0,
      'members','[]'::jsonb,
      'reason','SELF_NOT_WORKDAY',
      'version','V6.15.14'
    );
  end if;

  -- Resolve the current employee's canonical Manager only once.
  select m.*
  into v_manager
  from public.ta_get_schedule_manager_map_v61124(
    array[v_emp]::text[],
    p_work_date
  ) m
  where public.normalize_emp_code(m.emp_code)=v_emp
  order by
    case upper(coalesce(m.match_source,''))
      when 'MANAGER_DEPARTMENT' then 10
      when 'MANAGER_DIVISION' then 20
      when 'MANAGER_GM' then 30
      when 'MANAGER_AVP' then 40
      when 'MANAGER_HIERARCHY_FALLBACK' then 50
      when 'EMPLOYEE_SCOPE' then 60
      when 'ORG_UNIT_SCOPE' then 70
      when 'DEPARTMENT_SCOPE' then 80
      when 'SUB_AREA_SCOPE' then 90
      when 'AREA_SCOPE' then 100
      when 'ZONE_SCOPE' then 110
      when 'ALL_SCOPE' then 120
      else 999
    end,
    coalesce(m.manager_name,m.manager_email)
  limit 1;

  if not found then
    return jsonb_build_object(
      'work_date',p_work_date,
      'emp_code',v_emp,
      'self_shift_code',v_self.effective_shift_code,
      'self_shift_name',v_self.shift_name,
      'self_shift_start_time',v_self.shift_start_time,
      'self_shift_end_time',v_self.shift_end_time,
      'total_members',0,
      'members','[]'::jsonb,
      'reason','TEAM_MANAGER_NOT_FOUND',
      'version','V6.15.14'
    );
  end if;

  with recursive org_root as materialized (
    select o.org_id,o.org_code,o.parent_org_id
    from public.ta_org_units o
    where upper(coalesce(v_manager.scope_type,''))='ORG_UNIT'
      and (
           lower(trim(coalesce(o.org_code,'')))=lower(trim(coalesce(v_manager.scope_value,'')))
        or lower(trim(coalesce(o.org_name,'')))=lower(trim(coalesce(v_manager.scope_value,'')))
        or lower(trim(o.org_id::text))=lower(trim(coalesce(v_manager.scope_value,'')))
        or lower(trim(coalesce(o.org_code,'')))=lower(trim(coalesce(v_manager.matched_org_code,'')))
      )
    order by
      case
        when lower(trim(coalesce(o.org_code,'')))=lower(trim(coalesce(v_manager.matched_org_code,''))) then 0
        else 1
      end
    limit 1
  ),
  org_tree as (
    select r.org_id,r.org_code,r.parent_org_id
    from org_root r

    union all

    select c.org_id,c.org_code,c.parent_org_id
    from public.ta_org_units c
    join org_tree p
      on c.parent_org_id=p.org_id
  ),
  candidates as materialized (
    select
      public.normalize_emp_code(e."EmployeeId") as emp_code,
      coalesce(
        nullif(to_jsonb(e)->>'full_name',''),
        nullif(to_jsonb(e)->>'employee_name',''),
        nullif(to_jsonb(e)->>'name',''),
        public.normalize_emp_code(e."EmployeeId")
      ) as full_name,
      coalesce(to_jsonb(e)->>'position_name','') as position_name,
      coalesce(to_jsonb(e)->>'department','') as department,
      coalesce(
        nullif(to_jsonb(e)->>'zone',''),
        nullif(to_jsonb(e)->>'area',''),
        ''
      ) as zone,
      coalesce(to_jsonb(e)->>'area','') as area,
      coalesce(to_jsonb(e)->>'sub_area','') as sub_area
    from public.employees e
    where public.normalize_emp_code(e."EmployeeId")<>v_emp
      and (
        e.start_date is null
        or e.start_date<=p_work_date
      )
      and (
        e.resign_date is null
        or e.resign_date>=p_work_date
      )
      and coalesce(to_jsonb(e)->>'position_name','') ilike '%ช่างเทคนิค%'
      and (
        -- Employee hierarchy path: same selected Manager and same manager level.
        (
          upper(coalesce(v_manager.match_source,''))='MANAGER_DEPARTMENT'
          and public.normalize_emp_code(e.manager_department)=public.normalize_emp_code(v_manager.manager_emp_code)
        )
        or (
          upper(coalesce(v_manager.match_source,''))='MANAGER_DIVISION'
          and public.normalize_emp_code(e.manager_division)=public.normalize_emp_code(v_manager.manager_emp_code)
        )
        or (
          upper(coalesce(v_manager.match_source,''))='MANAGER_GM'
          and public.normalize_emp_code(e.manager_gm)=public.normalize_emp_code(v_manager.manager_emp_code)
        )
        or (
          upper(coalesce(v_manager.match_source,''))='MANAGER_AVP'
          and public.normalize_emp_code(e.manager_avp)=public.normalize_emp_code(v_manager.manager_emp_code)
        )
        or (
          upper(coalesce(v_manager.match_source,''))='MANAGER_HIERARCHY_FALLBACK'
          and public.normalize_emp_code(v_manager.manager_emp_code) in (
            public.normalize_emp_code(e.manager_department),
            public.normalize_emp_code(e.manager_division),
            public.normalize_emp_code(e.manager_gm),
            public.normalize_emp_code(e.manager_avp)
          )
        )

        -- Scope fallback path.
        or (
          upper(coalesce(v_manager.scope_type,''))='EMPLOYEE'
          and public.normalize_emp_code(e."EmployeeId")=public.normalize_emp_code(v_manager.scope_value)
        )
        or (
          upper(coalesce(v_manager.scope_type,''))='DEPARTMENT'
          and lower(trim(coalesce(e.department,'')))=lower(trim(coalesce(v_manager.scope_value,'')))
        )
        or (
          upper(coalesce(v_manager.scope_type,''))='SUB_AREA'
          and lower(trim(coalesce(e.sub_area,'')))=lower(trim(coalesce(v_manager.scope_value,'')))
        )
        or (
          upper(coalesce(v_manager.scope_type,''))='AREA'
          and lower(trim(coalesce(e.area,'')))=lower(trim(coalesce(v_manager.scope_value,'')))
        )
        or (
          upper(coalesce(v_manager.scope_type,''))='ZONE'
          and lower(trim(coalesce(e.zone,'')))=lower(trim(coalesce(v_manager.scope_value,'')))
        )
        or upper(coalesce(v_manager.scope_type,''))='ALL'
        or (
          upper(coalesce(v_manager.scope_type,''))='ORG_UNIT'
          and exists(
            select 1
            from org_tree ot
            where lower(trim(coalesce(ot.org_code,'')))=lower(trim(coalesce(e.org_code,'')))
          )
        )
      )
    order by
      coalesce(to_jsonb(e)->>'department',''),
      coalesce(to_jsonb(e)->>'full_name',''),
      e."EmployeeId"
    limit 100
  ),
  team_rows as materialized (
    select
      c.*,
      s.effective_shift_code,
      s.shift_name,
      s.shift_start_time,
      s.shift_end_time,
      s.is_night_shift
    from candidates c
    cross join lateral public._ta_portal_effective_shift_v61509(
      c.emp_code,
      p_work_date
    ) s
    where coalesce(s.is_workday,false)
      and upper(trim(coalesce(s.effective_shift_code,'')))=
          upper(trim(coalesce(v_self.effective_shift_code,'')))
  )
  select
    count(*)::integer,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'emp_code',t.emp_code,
          'full_name',t.full_name,
          'position_name',t.position_name,
          'department',t.department,
          'zone',t.zone,
          'area',t.area,
          'sub_area',t.sub_area,
          'shift_code',t.effective_shift_code,
          'shift_name',t.shift_name,
          'shift_start_time',t.shift_start_time,
          'shift_end_time',t.shift_end_time,
          'is_night_shift',t.is_night_shift
        )
        order by t.department,t.full_name,t.emp_code
      ),
      '[]'::jsonb
    )
  into v_total,v_members
  from team_rows t;

  return jsonb_build_object(
    'work_date',p_work_date,
    'emp_code',v_emp,
    'manager_label',coalesce(v_manager.manager_name,v_manager.manager_email),
    'manager_match_source',v_manager.match_source,
    'self_shift_code',v_self.effective_shift_code,
    'self_shift_name',v_self.shift_name,
    'self_shift_start_time',v_self.shift_start_time,
    'self_shift_end_time',v_self.shift_end_time,
    'self_is_night_shift',v_self.is_night_shift,
    'total_members',coalesce(v_total,0),
    'members',coalesce(v_members,'[]'::jsonb),
    'reason','OK',
    'version','V6.15.14'
  );
end;
$$;

revoke all on function public.ta_portal_get_same_shift_team_v61509(
  text,date
) from public;

grant execute on function public.ta_portal_get_same_shift_team_v61509(
  text,date
) to anon,authenticated;

-- ---------------------------------------------------------------------------
-- 3) Attendance Portal Reader V6.15.14
--
-- Previous reader called _ta_work_mode_punch_meta_v61449 once PER DAY.
-- A 32-day Portal range therefore repeated the punch/segment resolver up to
-- 32 times. V6.15.14 calls the existing canonical BATCH resolver ONCE for the
-- entire date range and joins its result back to calculated Attendance.
-- ---------------------------------------------------------------------------
create or replace function public.ta_portal_get_my_attendance_range_v61503(
  p_session_token text,
  p_start_date date,
  p_end_date date
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_emp text;
  v_start date:=least(p_start_date,p_end_date);
  v_end date:=greatest(p_start_date,p_end_date);
  v_result jsonb;
begin
  if v_start is null or v_end is null then
    raise exception 'DATE_RANGE_REQUIRED';
  end if;

  if v_end-v_start>62 then
    raise exception 'PORTAL_DATE_RANGE_MAX_63_DAYS';
  end if;

  v_emp:=public._ta_portal_session_emp_v61482(
    p_session_token
  );

  with punch_meta as materialized (
    select p.*
    from public.ta_get_attendance_shift_punch_meta_v61110(
      v_start,
      v_end,
      array[v_emp]::text[]
    ) p
    where public.normalize_emp_code(p.emp_code)=v_emp
  ),
  base as materialized (
    select
      c.work_date,
      public.normalize_emp_code(c.emp_code) as emp_code,
      c.day_type,
      c.expected_day,
      c.pattern_code,
      c.template_code,
      c.calculation_status,
      coalesce(c.late_minutes,0)::numeric as day_late_minutes,
      coalesce(c.early_leave_minutes,0)::numeric as day_early_leave_minutes,
      coalesce(c.absence_minutes,0)::numeric as day_absence_minutes,
      c.absence_reason,
      c.raw_meta,

      aw.shift_code,
      aw.shift_name,
      aw.shift_start_time,
      aw.shift_end_time,
      aw.is_night_shift,
      aw.first_in,
      aw.last_out,
      aw.source_in_date,
      aw.source_out_date,

      cert.status as certification_status,
      cert.certified_start_at,
      cert.certified_end_at,

      coalesce(pm.paid_segment_count,0)::integer as paid_segment_count,

      coalesce(
        pm.shift_1_planned_start_at,
        c.planned_start_at
      ) as shift_1_planned_start_at,

      coalesce(
        pm.shift_1_planned_end_at,
        c.planned_end_at
      ) as shift_1_planned_end_at,

      case
        when cert.status='CERTIFIED'
         and cert.certified_start_at is not null
          then cert.certified_start_at
        else coalesce(
          pm.shift_1_actual_in_at,
          case
            when aw.first_in is null then null
            else (
              coalesce(aw.source_in_date,aw.work_date)
              + aw.first_in
            )::timestamp without time zone
          end
        )
      end as shift_1_actual_in_at,

      case
        when cert.status='CERTIFIED'
         and cert.certified_end_at is not null
          then cert.certified_end_at
        else coalesce(
          pm.shift_1_actual_out_at,
          case
            when aw.last_out is null then null
            else (
              coalesce(
                aw.source_out_date,
                aw.work_date
                + case
                    when aw.first_in is not null
                     and aw.last_out<aw.first_in
                      then 1
                    else 0
                  end
              )
              + aw.last_out
            )::timestamp without time zone
          end
        )
      end as shift_1_actual_out_at,

      pm.shift_2_planned_start_at,
      pm.shift_2_planned_end_at,
      pm.shift_2_actual_in_at,
      pm.shift_2_actual_out_at

    from public.ta_attendance_calculations c

    left join public.attendance_workday aw
      on public.normalize_emp_code(aw.emp_code)=v_emp
     and aw.work_date=c.work_date

    left join public.ta_attendance_certifications cert
      on public.normalize_emp_code(cert.emp_code)=v_emp
     and cert.work_date=c.work_date
     and cert.status='CERTIFIED'

    left join punch_meta pm
      on public.normalize_emp_code(pm.emp_code)=v_emp
     and pm.work_date=c.work_date

    where public.normalize_emp_code(c.emp_code)=v_emp
      and c.work_date between v_start and v_end
  ),
  resolved as materialized (
    select
      b.*,
      (
        upper(coalesce(b.day_type,''))='WORKDAY'
        and coalesce(b.expected_day,0)=1
      ) as is_expected_workday,
      (
        b.shift_1_planned_start_at is not null
        or b.shift_1_actual_in_at is not null
        or b.shift_1_actual_out_at is not null
      ) as has_shift_1,
      (
        coalesce(b.paid_segment_count,0)>=2
        or b.shift_2_planned_start_at is not null
        or b.shift_2_actual_in_at is not null
        or b.shift_2_actual_out_at is not null
      ) as has_shift_2,
      round(greatest(0,coalesce(extract(epoch from (b.shift_1_actual_in_at-b.shift_1_planned_start_at))/60.0,0)))::integer as shift_1_late_raw,
      round(greatest(0,coalesce(extract(epoch from (b.shift_1_planned_end_at-b.shift_1_actual_out_at))/60.0,0)))::integer as shift_1_early_raw,
      round(greatest(0,coalesce(extract(epoch from (b.shift_2_actual_in_at-b.shift_2_planned_start_at))/60.0,0)))::integer as shift_2_late_raw,
      round(greatest(0,coalesce(extract(epoch from (b.shift_2_planned_end_at-b.shift_2_actual_out_at))/60.0,0)))::integer as shift_2_early_raw
    from base b
  ),
  policy as materialized (
    select
      r.*,
      case
        when not r.is_expected_workday or not r.has_shift_1 then 'NOT_APPLICABLE'
        when r.shift_1_actual_in_at is null or r.shift_1_actual_out_at is null then 'ABSENCE'
        when r.shift_1_late_raw>=30 then 'ABSENCE'
        when r.shift_1_late_raw between 1 and 29 and r.shift_1_early_raw>0 then 'LATE_AND_EARLY_LEAVE'
        when r.shift_1_late_raw between 1 and 29 then 'LATE'
        when r.shift_1_early_raw>0 then 'EARLY_LEAVE'
        else 'NORMAL'
      end as shift_1_status,
      case
        when not r.is_expected_workday or not r.has_shift_2 then 'NOT_APPLICABLE'
        when r.shift_2_actual_in_at is null or r.shift_2_actual_out_at is null then 'ABSENCE'
        when r.shift_2_late_raw>=30 then 'ABSENCE'
        when r.shift_2_late_raw between 1 and 29 and r.shift_2_early_raw>0 then 'LATE_AND_EARLY_LEAVE'
        when r.shift_2_late_raw between 1 and 29 then 'LATE'
        when r.shift_2_early_raw>0 then 'EARLY_LEAVE'
        else 'NORMAL'
      end as shift_2_status
    from resolved r
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'work_date',p.work_date,
        'emp_code',p.emp_code,
        'day_type',p.day_type,
        'expected_day',p.expected_day,
        'pattern_code',p.pattern_code,
        'template_code',p.template_code,
        'shift_code',p.shift_code,
        'shift_name',p.shift_name,
        'shift_start_time',p.shift_start_time,
        'shift_end_time',p.shift_end_time,
        'is_night_shift',p.is_night_shift,
        'calculation_status',p.calculation_status,
        'day_late_minutes',p.day_late_minutes,
        'day_early_leave_minutes',p.day_early_leave_minutes,
        'day_absence_minutes',p.day_absence_minutes,
        'absence_reason',p.absence_reason,
        'attendance_policy_status',p.raw_meta->>'attendance_policy_status',
        'certification_status',coalesce(p.certification_status,'NOT_CERTIFIED'),
        'paid_segment_count',p.paid_segment_count,
        'has_shift_1',p.has_shift_1,
        'has_shift_2',p.has_shift_2,
        'shift_1',jsonb_build_object(
          'planned_start_at',p.shift_1_planned_start_at,
          'planned_end_at',p.shift_1_planned_end_at,
          'actual_in_at',p.shift_1_actual_in_at,
          'actual_out_at',p.shift_1_actual_out_at,
          'status',p.shift_1_status,
          'late_minutes',case when p.shift_1_late_raw between 1 and 29 then p.shift_1_late_raw else 0 end,
          'absence_minutes',case
            when p.shift_1_status<>'ABSENCE' then 0
            when p.shift_1_actual_in_at is null or p.shift_1_actual_out_at is null then greatest(0,round(coalesce(extract(epoch from (p.shift_1_planned_end_at-p.shift_1_planned_start_at))/60.0,0))::integer)
            when p.shift_1_late_raw>=30 then p.shift_1_late_raw
            else 0
          end,
          'absence_reason',case
            when p.shift_1_status<>'ABSENCE' then null
            when p.shift_1_actual_in_at is null and p.shift_1_actual_out_at is null then 'MISSING_BOTH'
            when p.shift_1_actual_in_at is null then 'MISSING_IN'
            when p.shift_1_actual_out_at is null then 'MISSING_OUT'
            when p.shift_1_late_raw>=30 then 'LATE_30_PLUS'
            else 'ABSENCE'
          end,
          'early_leave_minutes',p.shift_1_early_raw
        ),
        'shift_2',case
          when not p.has_shift_2 then null
          else jsonb_build_object(
            'planned_start_at',p.shift_2_planned_start_at,
            'planned_end_at',p.shift_2_planned_end_at,
            'actual_in_at',p.shift_2_actual_in_at,
            'actual_out_at',p.shift_2_actual_out_at,
            'status',p.shift_2_status,
            'late_minutes',case when p.shift_2_late_raw between 1 and 29 then p.shift_2_late_raw else 0 end,
            'absence_minutes',case
              when p.shift_2_status<>'ABSENCE' then 0
              when p.shift_2_actual_in_at is null or p.shift_2_actual_out_at is null then greatest(0,round(coalesce(extract(epoch from (p.shift_2_planned_end_at-p.shift_2_planned_start_at))/60.0,0))::integer)
              when p.shift_2_late_raw>=30 then p.shift_2_late_raw
              else 0
            end,
            'absence_reason',case
              when p.shift_2_status<>'ABSENCE' then null
              when p.shift_2_actual_in_at is null and p.shift_2_actual_out_at is null then 'MISSING_BOTH'
              when p.shift_2_actual_in_at is null then 'MISSING_IN'
              when p.shift_2_actual_out_at is null then 'MISSING_OUT'
              when p.shift_2_late_raw>=30 then 'LATE_30_PLUS'
              else 'ABSENCE'
            end,
            'early_leave_minutes',p.shift_2_early_raw
          )
        end,
        'version','V6.15.14'
      )
      order by p.work_date desc
    ),
    '[]'::jsonb
  )
  into v_result
  from policy p;

  return v_result;
end;
$$;

revoke all on function public.ta_portal_get_my_attendance_range_v61503(
  text,date,date
) from public;

grant execute on function public.ta_portal_get_my_attendance_range_v61503(
  text,date,date
) to anon,authenticated;

analyze public.ta_attendance_calculations;
analyze public.attendance_workday;
analyze public.ta_attendance_certifications;
analyze public.ta_attendance_segment_results;
analyze public.shift_calendar;

notify pgrst,'reload schema';
commit;
