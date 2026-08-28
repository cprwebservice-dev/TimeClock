-- ============================================================================
-- SQL ที่ต้องรัน
-- Time-Clock Enterprise V6.15.21
-- 4C.3 — Affected-date Atomic Leave Apply + Rollback + Final Verification
-- ============================================================================
-- หลักการ
-- 1) FULL_DAY เขียนเฉพาะวันที่ Backend Review ระบุ action=SET_LV
-- 2) OFF / PH / ลาเดิมภายในช่วงลาไม่ถูกแก้ Schedule
-- 3) PARTIAL_DAY ยังคงใช้ V6.15.11 Partial Leave Overlay canonical writer
-- 4) Lock Request + Employee, recheck Review, write, verify final state, RESOLVED
--    และ Audit อยู่ใน Database Transaction เดียว
-- 5) ปรับ V6.15.15 Consistency Guard ให้เข้าใจ Affected-date semantics
-- ============================================================================

begin;
set local statement_timeout='0';
select pg_advisory_xact_lock(hashtext('timeclock-v6.15.21-leave-affected-atomic'));

-- ---------------------------------------------------------------------------
-- 0) Preflight
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ta_employee_requests_v61481') is null then
    raise exception 'MISSING_TABLE: ta_employee_requests_v61481';
  end if;
  if to_regclass('public.ta_employee_portal_audit_v61482') is null then
    raise exception 'MISSING_TABLE: ta_employee_portal_audit_v61482';
  end if;
  if to_regclass('public.ta_portal_partial_leave_overlays_v61511') is null then
    raise exception 'MISSING_V6.15.11: ta_portal_partial_leave_overlays_v61511';
  end if;
  if to_regprocedure('public.ta_get_employee_request_leave_review_v61520(uuid)') is null then
    raise exception 'MISSING_V6.15.20: ta_get_employee_request_leave_review_v61520';
  end if;
  if to_regprocedure('public.ta_apply_employee_request_v61510(uuid,jsonb,text)') is null then
    raise exception 'MISSING_V6.15.10: ta_apply_employee_request_v61510';
  end if;
  if to_regprocedure('public.ta_assign_shifts_bulk_v61424(jsonb,text,boolean)') is null then
    raise exception 'MISSING_FUNCTION: ta_assign_shifts_bulk_v61424';
  end if;
  if to_regprocedure('public.ta_sync_bulk_schedule_rules_v6135(jsonb)') is null then
    raise exception 'MISSING_FUNCTION: ta_sync_bulk_schedule_rules_v6135';
  end if;
  if to_regprocedure('public.ta_finalize_schedule_mutation_v61415(jsonb)') is null then
    raise exception 'MISSING_FUNCTION: ta_finalize_schedule_mutation_v61415';
  end if;
  if to_regprocedure('public._ta_request_effective_shift_v61510(text,date)') is null then
    raise exception 'MISSING_FUNCTION: _ta_request_effective_shift_v61510';
  end if;
  if to_regprocedure('public._ta_employee_portal_leave_day_state_v61508(text,date)') is null then
    raise exception 'MISSING_FUNCTION: _ta_employee_portal_leave_day_state_v61508';
  end if;
  if to_regprocedure('public._ta_request_manager_authorized_v61481(uuid)') is null then
    raise exception 'MISSING_FUNCTION: _ta_request_manager_authorized_v61481';
  end if;
  if to_regprocedure('public._ta_assert_system_period_action_v6110(date,text)') is null then
    raise exception 'MISSING_FUNCTION: _ta_assert_system_period_action_v6110';
  end if;
  if to_regprocedure('public._ta_validate_shift_pattern_v651(text,date,text)') is null then
    raise exception 'MISSING_FUNCTION: _ta_validate_shift_pattern_v651';
  end if;
  if to_regprocedure('public.ta_validate_night_sequence_bulk_v61437(jsonb)') is null then
    raise exception 'MISSING_FUNCTION: ta_validate_night_sequence_bulk_v61437';
  end if;
  if to_regprocedure('public._ta_check_employee_request_consistency_v61515(uuid)') is null then
    raise exception 'MISSING_V6.15.15: _ta_check_employee_request_consistency_v61515';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1) V6.15.15 End-to-End checker — make FULL_DAY Leave affected-date aware.
--    Function signature stays the same so the existing RESOLVED trigger keeps
--    working without trigger recreation.
-- ---------------------------------------------------------------------------
create or replace function public._ta_check_employee_request_consistency_v61515(
  p_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,pg_catalog
as $$
declare
  v_req public.ta_employee_requests_v61481%rowtype;

  v_emp text;
  v_type text;
  v_subtype text;

  v_installed_at timestamptz;
  v_is_legacy boolean:=false;

  v_business_ok boolean:=false;
  v_business_status text:='FAIL';
  v_business_code text:='BUSINESS_STATE_NOT_FOUND';

  v_sync_status text:='WARN';
  v_sync_code text:='SYNC_STATE_NOT_VERIFIED';

  v_overall text:='FAIL';
  v_result_code text;
  v_summary text;

  v_expected jsonb:='{}'::jsonb;
  v_observed jsonb:='{}'::jsonb;

  v_cert jsonb;
  v_sc jsonb;
  v_sr jsonb;
  v_overlay jsonb;
  v_sync jsonb;

  v_source record;
  v_target record;

  v_target_date date;
  v_leave_end date;
  v_d date;

  v_total_days integer:=0;
  v_match_days integer:=0;
  v_expected_dates jsonb:='[]'::jsonb;
  v_skipped_dates jsonb:='[]'::jsonb;
  v_skip_total integer:=0;
  v_skip_match integer:=0;
  v_item jsonb;
  v_leave_day_state jsonb;

  v_notification_exists boolean:=false;

  v_request_sync_ok boolean:=false;
  v_data_sync_ok boolean:=false;
  v_notification_sync_ok boolean:=false;

  v_request_sync_at timestamptz;
  v_data_sync_at timestamptz;
  v_notification_sync_at timestamptz;

  v_overlay_start time;
  v_overlay_end time;
  v_request_start time;
  v_request_end time;
begin
  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED';
  end if;

  select *
  into v_req
  from public.ta_employee_requests_v61481 r
  where r.request_id=p_request_id;

  if v_req.request_id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;

  v_emp:=public.normalize_emp_code(v_req.emp_code);
  v_type:=upper(trim(coalesce(v_req.request_type,'')));
  v_subtype:=upper(trim(coalesce(v_req.request_subtype,'')));

  select m.installed_at
  into v_installed_at
  from public.ta_request_consistency_meta_v61515 m
  where m.singleton_id=1;

  v_is_legacy:=
    v_req.resolved_at is not null
    and v_installed_at is not null
    and v_req.resolved_at<v_installed_at;

  if upper(trim(coalesce(v_req.request_source,'')))<>'EMPLOYEE_PORTAL' then
    return jsonb_build_object(
      'request_id',v_req.request_id,
      'emp_code',v_emp,
      'request_type',v_type,
      'request_subtype',v_subtype,
      'request_status',v_req.status,
      'overall_status','NOT_APPLICABLE',
      'business_status','NOT_APPLICABLE',
      'sync_status','NOT_APPLICABLE',
      'result_code','NON_PORTAL_REQUEST',
      'summary','ไม่ใช่คำขอจาก Employee Portal',
      'expected_state','{}'::jsonb,
      'observed_state','{}'::jsonb,
      'version','V6.15.21'
    );
  end if;

  if upper(trim(coalesce(v_req.status,'')))<>'RESOLVED' then
    return jsonb_build_object(
      'request_id',v_req.request_id,
      'emp_code',v_emp,
      'request_type',v_type,
      'request_subtype',v_subtype,
      'request_status',v_req.status,
      'overall_status','PENDING',
      'business_status','PENDING',
      'sync_status','PENDING',
      'result_code','REQUEST_NOT_RESOLVED',
      'summary','คำขอยังไม่สิ้นสุด Workflow',
      'expected_state','{}'::jsonb,
      'observed_state','{}'::jsonb,
      'version','V6.15.21'
    );
  end if;

  if v_type not in (
    'TIME_ISSUE',
    'SPECIAL_WORK',
    'DAYOFF_SWAP',
    'LEAVE_REQUEST'
  ) then
    return jsonb_build_object(
      'request_id',v_req.request_id,
      'emp_code',v_emp,
      'request_type',v_type,
      'request_subtype',v_subtype,
      'request_status',v_req.status,
      'overall_status','NOT_APPLICABLE',
      'business_status','NOT_APPLICABLE',
      'sync_status','NOT_APPLICABLE',
      'result_code','REQUEST_TYPE_NOT_AUDITED',
      'summary','ประเภทคำขอนี้อยู่นอกขอบเขต 4B',
      'expected_state','{}'::jsonb,
      'observed_state','{}'::jsonb,
      'version','V6.15.21'
    );
  end if;

  if v_type='TIME_ISSUE' then
    select to_jsonb(c)
    into v_cert
    from public.ta_attendance_certifications c
    where public.normalize_emp_code(c.emp_code)=v_emp
      and c.work_date=v_req.work_date
      and upper(trim(coalesce(c.status,'')))='CERTIFIED'
    order by c.certified_start_at desc nulls last
    limit 1;

    v_expected:=jsonb_build_object(
      'work_date',v_req.work_date,
      'certification_status','CERTIFIED',
      'certified_start_required',true,
      'certified_end_required',true
    );

    v_observed:=jsonb_build_object(
      'certification',
      coalesce(v_cert,'{}'::jsonb)
    );

    v_business_ok:=
      v_cert is not null
      and nullif(v_cert->>'certified_start_at','') is not null
      and nullif(v_cert->>'certified_end_at','') is not null;

    v_business_code:=
      case
        when v_business_ok then 'TIME_CERTIFICATION_MATCH'
        else 'TIME_CERTIFICATION_NOT_APPLIED'
      end;

  elsif v_type='SPECIAL_WORK' then
    select to_jsonb(sc)
    into v_sc
    from public.shift_calendar sc
    where public.normalize_emp_code(sc.emp_code)=v_emp
      and sc.work_date=v_req.work_date
    order by coalesce(sc.updated_at,now()) desc
    limit 1;

    select to_jsonb(sr)
    into v_sr
    from public.ta_schedule_rule_assignments sr
    where public.normalize_emp_code(sr.emp_code)=v_emp
      and sr.work_date=v_req.work_date
    limit 1;

    v_expected:=jsonb_build_object(
      'work_date',v_req.work_date,
      'schedule_required',true,
      'schedule_rule_required',true,
      'atomic_request_id',v_req.request_id,
      'requested_work_mode',v_subtype
    );

    v_observed:=jsonb_build_object(
      'shift_calendar',
      coalesce(v_sc,'{}'::jsonb),
      'schedule_rule',
      coalesce(v_sr,'{}'::jsonb)
    );

    v_business_ok:=
      v_sc is not null
      and v_sr is not null
      and coalesce(
        v_sr#>>'{validation_snapshot,atomic_request_id}',
        ''
      )=v_req.request_id::text;

    v_business_code:=
      case
        when v_business_ok then 'SPECIAL_WORK_MATCH'
        else 'SPECIAL_WORK_NOT_APPLIED'
      end;

  elsif v_type='DAYOFF_SWAP' then
    if v_subtype='ADD_DAYOFF' then
      select *
      into v_target
      from public._ta_request_effective_shift_v61510(
        v_emp,
        v_req.work_date
      )
      limit 1;

      v_expected:=jsonb_build_object(
        'mode','ADD_DAYOFF',
        'target_date',v_req.work_date,
        'target_is_workday',false
      );

      v_observed:=jsonb_build_object(
        'target_shift_code',v_target.shift_code,
        'target_is_workday',v_target.is_workday
      );

      v_business_ok:=
        nullif(trim(coalesce(v_target.shift_code,'')),'') is not null
        and not coalesce(v_target.is_workday,true)
        and upper(trim(coalesce(v_target.shift_code,'')))
            not in ('LV','LEAVE','HOL');

      v_business_code:=
        case
          when v_business_ok then 'ADD_DAYOFF_MATCH'
          else 'ADD_DAYOFF_NOT_APPLIED'
        end;

    elsif v_subtype='SWAP_DAYOFF' then
      begin
        v_target_date:=
          nullif(v_req.detail->>'target_date','')::date;
      exception when others then
        v_target_date:=null;
      end;

      if v_target_date is not null then
        select *
        into v_source
        from public._ta_request_effective_shift_v61510(
          v_emp,
          v_req.work_date
        )
        limit 1;

        select *
        into v_target
        from public._ta_request_effective_shift_v61510(
          v_emp,
          v_target_date
        )
        limit 1;
      end if;

      v_expected:=jsonb_build_object(
        'mode','SWAP_DAYOFF',
        'source_date',v_req.work_date,
        'source_is_workday',true,
        'target_date',v_target_date,
        'target_is_workday',false
      );

      v_observed:=jsonb_build_object(
        'source_shift_code',v_source.shift_code,
        'source_is_workday',v_source.is_workday,
        'target_shift_code',v_target.shift_code,
        'target_is_workday',v_target.is_workday
      );

      v_business_ok:=
        v_target_date is not null
        and coalesce(v_source.is_workday,false)
        and not coalesce(v_target.is_workday,true)
        and upper(trim(coalesce(v_target.shift_code,'')))
            not in ('LV','LEAVE','HOL');

      v_business_code:=
        case
          when v_business_ok then 'SWAP_DAYOFF_MATCH'
          else 'SWAP_DAYOFF_NOT_APPLIED'
        end;

    else
      v_business_ok:=false;
      v_business_code:='DAYOFF_SUBTYPE_NOT_SUPPORTED';
      v_expected:=jsonb_build_object(
        'request_subtype',v_subtype
      );
    end if;

  elsif v_type='LEAVE_REQUEST' then
    if v_subtype='PARTIAL_DAY' then
      select to_jsonb(o)
      into v_overlay
      from public.ta_portal_partial_leave_overlays_v61511 o
      where o.employee_request_id=v_req.request_id
      limit 1;

      begin
        v_request_start:=
          nullif(v_req.detail->>'leave_start_time','')::time;
        v_request_end:=
          nullif(v_req.detail->>'leave_end_time','')::time;

        v_overlay_start:=
          nullif(v_overlay->>'leave_start_at','')::timestamp::time;

        v_overlay_end:=
          nullif(v_overlay->>'leave_end_at','')::timestamp::time;
      exception when others then
        v_request_start:=null;
        v_request_end:=null;
        v_overlay_start:=null;
        v_overlay_end:=null;
      end;

      v_expected:=jsonb_build_object(
        'mode','PARTIAL_DAY',
        'work_date',v_req.work_date,
        'shift_calendar_must_remain_workday',true,
        'leave_type',v_req.detail->>'leave_type',
        'leave_start_time',v_req.detail->>'leave_start_time',
        'leave_end_time',v_req.detail->>'leave_end_time'
      );

      v_observed:=jsonb_build_object(
        'overlay',
        coalesce(v_overlay,'{}'::jsonb)
      );

      v_business_ok:=
        v_overlay is not null
        and coalesce(
          nullif(v_overlay->>'is_active','')::boolean,
          false
        )
        and public.normalize_emp_code(
          v_overlay->>'emp_code'
        )=v_emp
        and nullif(v_overlay->>'work_date','')::date=v_req.work_date
        and (
          v_request_start is null
          or v_overlay_start=v_request_start
        )
        and (
          v_request_end is null
          or v_overlay_end=v_request_end
        );

      v_business_code:=
        case
          when v_business_ok then 'PARTIAL_LEAVE_OVERLAY_MATCH'
          else 'PARTIAL_LEAVE_OVERLAY_NOT_APPLIED'
        end;

    elsif v_subtype='FULL_DAY' then
      -- V6.15.21: for new approvals, only workdays that were actually mutated
      -- must become LV. OFF / Public Holiday / existing Leave inside the requested
      -- date range are explicitly preserved and must remain non-workdays.
      v_expected_dates:=coalesce(
        v_req.detail->'applied_affected_work_dates',
        v_req.detail->'affected_work_dates',
        '[]'::jsonb
      );
      v_skipped_dates:=coalesce(
        v_req.detail->'applied_skipped_nonworkdays',
        v_req.detail->'skipped_nonworkdays',
        '[]'::jsonb
      );

      if jsonb_typeof(v_expected_dates)='array'
         and jsonb_array_length(v_expected_dates)>0
         and nullif(v_req.detail->>'leave_apply_version','') is not null then
        v_total_days:=jsonb_array_length(v_expected_dates);
        v_match_days:=0;

        for v_item in
          select value from jsonb_array_elements(v_expected_dates)
        loop
          begin
            if jsonb_typeof(v_item)='string' then
              v_d:=trim(both '"' from v_item::text)::date;
            else
              v_d:=nullif(v_item->>'work_date','')::date;
            end if;
          exception when others then
            v_d:=null;
          end;

          if v_d is null then
            continue;
          end if;

          select *
          into v_target
          from public._ta_request_effective_shift_v61510(
            v_emp,
            v_d
          )
          limit 1;

          if upper(trim(coalesce(v_target.shift_code,'')))
             in ('LV','LEAVE')
             and not coalesce(v_target.is_workday,true) then
            v_match_days:=v_match_days+1;
          end if;
        end loop;

        v_skip_total:=case
          when jsonb_typeof(v_skipped_dates)='array'
            then jsonb_array_length(v_skipped_dates)
          else 0
        end;
        v_skip_match:=0;

        if v_skip_total>0 then
          for v_item in
            select value from jsonb_array_elements(v_skipped_dates)
          loop
            begin
              if jsonb_typeof(v_item)='string' then
                v_d:=trim(both '"' from v_item::text)::date;
              else
                v_d:=nullif(v_item->>'work_date','')::date;
              end if;
            exception when others then
              v_d:=null;
            end;

            if v_d is null then
              continue;
            end if;

            v_leave_day_state:=public._ta_employee_portal_leave_day_state_v61508(
              v_emp,
              v_d
            );

            if not coalesce((v_leave_day_state->>'allowed')::boolean,true) then
              v_skip_match:=v_skip_match+1;
            end if;
          end loop;
        end if;

        v_expected:=jsonb_build_object(
          'mode','FULL_DAY_AFFECTED_DATES',
          'leave_start_date',v_req.work_date,
          'affected_work_dates',v_expected_dates,
          'skipped_nonworkdays',v_skipped_dates,
          'expected_lv_days',v_total_days,
          'expected_skipped_nonworkdays',v_skip_total
        );

        v_observed:=jsonb_build_object(
          'matched_lv_days',v_match_days,
          'affected_days_checked',v_total_days,
          'matched_skipped_nonworkdays',v_skip_match,
          'skipped_days_checked',v_skip_total
        );

        v_business_ok:=
          v_total_days>0
          and v_match_days=v_total_days
          and v_skip_match=v_skip_total;

        v_business_code:=case
          when v_business_ok then 'FULL_DAY_LEAVE_MATCH'
          else 'FULL_DAY_LEAVE_NOT_APPLIED'
        end;
      else
        -- Backward compatibility for requests resolved before V6.15.21.
        begin
          v_leave_end:=coalesce(
            nullif(v_req.detail->>'end_date','')::date,
            v_req.work_date
          );
        exception when others then
          v_leave_end:=v_req.work_date;
        end;

        v_total_days:=0;
        v_match_days:=0;

        for v_d in
          select generate_series(
            v_req.work_date,
            v_leave_end,
            interval '1 day'
          )::date
        loop
          v_total_days:=v_total_days+1;

          select *
          into v_target
          from public._ta_request_effective_shift_v61510(
            v_emp,
            v_d
          )
          limit 1;

          if upper(trim(coalesce(v_target.shift_code,'')))
             in ('LV','LEAVE') then
            v_match_days:=v_match_days+1;
          end if;
        end loop;

        v_expected:=jsonb_build_object(
          'mode','FULL_DAY_LEGACY_RANGE',
          'leave_start_date',v_req.work_date,
          'leave_end_date',v_leave_end,
          'expected_lv_days',v_total_days
        );

        v_observed:=jsonb_build_object(
          'matched_lv_days',v_match_days,
          'total_days_checked',v_total_days
        );

        v_business_ok:=
          v_total_days>0
          and v_match_days=v_total_days;

        v_business_code:=case
          when v_business_ok then 'FULL_DAY_LEAVE_MATCH'
          else 'FULL_DAY_LEAVE_NOT_APPLIED'
        end;
      end if;
    else
      v_business_ok:=false;
      v_business_code:='LEAVE_SUBTYPE_NOT_SUPPORTED';
      v_expected:=jsonb_build_object(
        'request_subtype',v_subtype
      );
    end if;
  end if;

  if v_business_ok then
    v_business_status:='PASS';
  elsif v_is_legacy then
    v_business_status:='WARN';
  else
    v_business_status:='FAIL';
  end if;

  select to_jsonb(s)
  into v_sync
  from public.ta_portal_sync_state_v61513 s
  where s.emp_code=v_emp;

  if v_sync is not null then
    begin
      v_request_sync_at:=
        nullif(v_sync->>'request_updated_at','')::timestamptz;
      v_data_sync_at:=
        nullif(v_sync->>'data_updated_at','')::timestamptz;
      v_notification_sync_at:=
        nullif(v_sync->>'notification_updated_at','')::timestamptz;
    exception when others then
      v_request_sync_at:=null;
      v_data_sync_at:=null;
      v_notification_sync_at:=null;
    end;
  end if;

  select exists(
    select 1
    from public.ta_employee_portal_notifications_v61482 n
    where n.request_id=v_req.request_id
      and public.normalize_emp_code(n.emp_code)=v_emp
  )
  into v_notification_exists;

  if v_is_legacy then
    v_sync_status:='WARN';
    v_sync_code:='LEGACY_BEFORE_CONSISTENCY_GUARD';

  else
    v_request_sync_ok:=
      v_request_sync_at is not null
      and v_req.resolved_at is not null
      and v_request_sync_at>=v_req.resolved_at;

    v_data_sync_ok:=
      v_data_sync_at is not null
      and v_req.resolved_at is not null
      and v_data_sync_at>=v_req.resolved_at;

    if v_req.portal_account_id is null then
      v_notification_sync_ok:=true;
    else
      v_notification_sync_ok:=
        v_notification_exists
        and v_notification_sync_at is not null
        and v_req.resolved_at is not null
        and v_notification_sync_at>=v_req.resolved_at;
    end if;

    if v_request_sync_ok
       and v_data_sync_ok
       and v_notification_sync_ok then
      v_sync_status:='PASS';
      v_sync_code:='PORTAL_SYNC_EVIDENCE_MATCH';
    else
      v_sync_status:='WARN';
      v_sync_code:='PORTAL_SYNC_EVIDENCE_INCOMPLETE';
    end if;
  end if;

  v_observed:=
    coalesce(v_observed,'{}'::jsonb)
    || jsonb_build_object(
      'portal_sync',
      jsonb_build_object(
        'state',coalesce(v_sync,'{}'::jsonb),
        'notification_exists',v_notification_exists,
        'request_sync_ok',v_request_sync_ok,
        'data_sync_ok',v_data_sync_ok,
        'notification_sync_ok',v_notification_sync_ok
      )
    );

  if v_business_status='FAIL' then
    v_overall:='FAIL';
    v_result_code:=v_business_code;
    v_summary:='Backend ยังไม่ตรงกับผลที่คำขอควรทำ';

  elsif v_business_status='WARN' then
    v_overall:='WARN';
    v_result_code:=v_business_code;
    v_summary:='รายการเดิมก่อนติดตั้ง 4B • พบข้อมูลไม่ครบสำหรับยืนยันแบบเข้มงวด';

  elsif v_sync_status='PASS' then
    v_overall:='PASS';
    v_result_code:='END_TO_END_CONSISTENT';
    v_summary:='Backend, Request และ Employee Portal Sync สอดคล้องกัน';

  else
    v_overall:='WARN';
    v_result_code:=v_sync_code;
    v_summary:='Backend ถูกต้อง แต่หลักฐาน Portal Sync ยังไม่ครบ';
  end if;

  return jsonb_build_object(
    'request_id',v_req.request_id,
    'emp_code',v_emp,
    'request_type',v_type,
    'request_subtype',v_subtype,
    'request_status',v_req.status,

    'overall_status',v_overall,
    'business_status',v_business_status,
    'sync_status',v_sync_status,

    'result_code',v_result_code,
    'summary',v_summary,

    'expected_state',coalesce(v_expected,'{}'::jsonb),
    'observed_state',coalesce(v_observed,'{}'::jsonb),

    'legacy_before_guard',v_is_legacy,
    'version','V6.15.21'
  );
end;
$$;

revoke all on function
  public._ta_check_employee_request_consistency_v61515(uuid)
from public,anon,authenticated;

comment on function public._ta_check_employee_request_consistency_v61515(uuid)
is 'V6.15.21 revision of V6.15.15 E2E checker. FULL_DAY leave verifies only applied workdates as LV and preserves skipped OFF/PH/leave dates.';

-- Store the checker revision tag in the existing audit table.
create or replace function public._ta_store_employee_request_consistency_v61515(
  p_request_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,pg_catalog
as $$
declare
  v_result jsonb;
begin
  v_result:=
    public._ta_check_employee_request_consistency_v61515(
      p_request_id
    );

  insert into public.ta_employee_request_consistency_v61515(
    request_id,
    emp_code,
    request_type,
    request_subtype,
    request_status,

    overall_status,
    business_status,
    sync_status,

    result_code,
    summary,

    expected_state,
    observed_state,

    checked_by,
    checked_at,
    version
  )
  values(
    (v_result->>'request_id')::uuid,
    v_result->>'emp_code',
    v_result->>'request_type',
    nullif(v_result->>'request_subtype',''),
    v_result->>'request_status',

    v_result->>'overall_status',
    v_result->>'business_status',
    v_result->>'sync_status',

    v_result->>'result_code',
    v_result->>'summary',

    coalesce(v_result->'expected_state','{}'::jsonb),
    coalesce(v_result->'observed_state','{}'::jsonb),

    auth.uid(),
    clock_timestamp(),
    coalesce(nullif(v_result->>'version',''),'V6.15.15')
  )
  on conflict(request_id)
  do update set
    emp_code=excluded.emp_code,
    request_type=excluded.request_type,
    request_subtype=excluded.request_subtype,
    request_status=excluded.request_status,

    overall_status=excluded.overall_status,
    business_status=excluded.business_status,
    sync_status=excluded.sync_status,

    result_code=excluded.result_code,
    summary=excluded.summary,

    expected_state=excluded.expected_state,
    observed_state=excluded.observed_state,

    checked_by=excluded.checked_by,
    checked_at=excluded.checked_at,
    version=excluded.version;

  return v_result;
end;
$$;

revoke all on function
  public._ta_store_employee_request_consistency_v61515(uuid)
from public,anon,authenticated;

comment on function public._ta_store_employee_request_consistency_v61515(uuid)
is 'V6.15.21 revision: stores the checker result version so affected-date leave audits are tagged correctly.';

-- ---------------------------------------------------------------------------
-- 2) Manager Review compatibility endpoint for 4C.3.
-- ---------------------------------------------------------------------------
create or replace function public.ta_get_employee_request_leave_review_v61521(
  p_request_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_review jsonb;
  v_subtype text;
begin
  v_review:=public.ta_get_employee_request_leave_review_v61520(p_request_id);
  v_subtype:=upper(trim(coalesce(v_review->>'request_subtype','')));
  return coalesce(v_review,'{}'::jsonb) || jsonb_build_object(
    'affected_atomic_ready',coalesce((v_review->>'allowed')::boolean,false),
    'apply_strategy',case
      when v_subtype='PARTIAL_DAY' then 'PARTIAL_OVERLAY_ATOMIC'
      when v_subtype='FULL_DAY' then 'AFFECTED_WORK_DATES_ATOMIC'
      else 'UNSUPPORTED'
    end,
    'version','V6.15.21'
  );
end;
$$;

revoke all on function public.ta_get_employee_request_leave_review_v61521(uuid)
from public,anon,authenticated;
grant execute on function public.ta_get_employee_request_leave_review_v61521(uuid)
to authenticated;

comment on function public.ta_get_employee_request_leave_review_v61521(uuid)
is 'V6.15.21 Manager Leave Review compatibility endpoint. FULL_DAY is ready for affected-workdate atomic apply.';

-- ---------------------------------------------------------------------------
-- 3) Atomic Leave Apply V6.15.21
-- ---------------------------------------------------------------------------
create or replace function public.ta_apply_employee_request_leave_v61521(
  p_request_id uuid,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=public,extensions,pg_catalog
as $$
declare
  v_req public.ta_employee_requests_v61481%rowtype;
  v_emp text;
  v_subtype text;
  v_actor_email text;
  v_note text:=nullif(trim(coalesce(p_note,'')),'');

  v_review jsonb;
  v_days jsonb;
  v_item jsonb;
  v_rows jsonb:='[]'::jsonb;
  v_affected_dates jsonb:='[]'::jsonb;
  v_skipped jsonb:='[]'::jsonb;
  v_final_days jsonb:='[]'::jsonb;

  v_d date;
  v_expected_code text;
  v_before_code text;
  v_current record;

  v_sequence jsonb:='{}'::jsonb;
  v_result jsonb:='{}'::jsonb;
  v_sync jsonb:='{}'::jsonb;
  v_final jsonb:='{}'::jsonb;
  v_overlay jsonb;
  v_skip_state jsonb;

  v_status text;
  v_audit_id uuid;
  v_snapshot jsonb;
  v_affected_count integer:=0;
  v_skipped_count integer:=0;
begin
  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED';
  end if;

  select *
  into v_req
  from public.ta_employee_requests_v61481 r
  where r.request_id=p_request_id
  for update;

  if v_req.request_id is null then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
  if upper(trim(coalesce(v_req.request_type,'')))<>'LEAVE_REQUEST' then
    raise exception 'REQUEST_TYPE_NOT_LEAVE';
  end if;
  if upper(trim(coalesce(v_req.status,''))) not in ('PENDING','IN_REVIEW') then
    raise exception 'REQUEST_NOT_ACTIVE';
  end if;
  if not public._ta_request_manager_authorized_v61481(p_request_id) then
    raise exception 'REQUEST_DECISION_PERMISSION_DENIED';
  end if;

  select lower(trim(coalesce(p.email,'')))
  into v_actor_email
  from public.ta_user_profiles p
  where p.user_id=auth.uid()
    and p.is_active=true
  limit 1;
  if nullif(v_actor_email,'') is null then
    raise exception 'ACTIVE_USER_PROFILE_REQUIRED';
  end if;

  v_emp:=public.normalize_emp_code(v_req.emp_code);
  v_subtype:=upper(trim(coalesce(v_req.request_subtype,'')));
  if v_subtype not in ('FULL_DAY','PARTIAL_DAY') then
    raise exception 'LEAVE_REQUEST_SUBTYPE_NOT_SUPPORTED: %',v_subtype;
  end if;

  -- Serialize all leave approvals for the same employee. This is intentionally
  -- stronger than a month lock because one request can span two months.
  perform pg_advisory_xact_lock(
    hashtext('employee-leave-approve:'||v_emp)
  );

  -- Fresh authoritative review AFTER both request row lock and employee lock.
  v_review:=public.ta_get_employee_request_leave_review_v61521(p_request_id);
  if coalesce((v_review->>'allowed')::boolean,false)=false then
    raise exception 'LEAVE_REQUEST_REVIEW_BLOCKED:%',
      coalesce(v_review->'blockers','[]'::jsonb)::text;
  end if;

  if v_subtype='PARTIAL_DAY' then
    -- V6.15.11 already provides the canonical Partial Leave Overlay transaction.
    -- Keep using it, then verify both overlay and untouched structural shift.
    v_before_code:=coalesce(
      v_review->'partial'->>'shift_code',
      v_review->'days'->0->>'current_shift_code'
    );

    v_result:=public.ta_apply_employee_request_v61510(
      p_request_id,
      '{}'::jsonb,
      coalesce(v_note,v_req.reason)
    );

    if coalesce((v_result->>'applied')::boolean,false)=false then
      raise exception 'PARTIAL_LEAVE_ATOMIC_APPLY_NOT_COMPLETED:%',
        coalesce(v_result->>'message','UNKNOWN');
    end if;

    select to_jsonb(o)
    into v_overlay
    from public.ta_portal_partial_leave_overlays_v61511 o
    where o.employee_request_id=p_request_id
      and o.is_active=true
    limit 1;

    if v_overlay is null then
      raise exception 'PARTIAL_LEAVE_FINAL_OVERLAY_MISSING';
    end if;

    select *
    into v_current
    from public._ta_request_effective_shift_v61510(v_emp,v_req.work_date)
    limit 1;

    if nullif(v_before_code,'') is not null
       and upper(trim(coalesce(v_current.shift_code,'')))
           is distinct from upper(trim(v_before_code)) then
      raise exception 'PARTIAL_LEAVE_FINAL_SHIFT_CHANGED:%->%',
        v_before_code,coalesce(v_current.shift_code,'-');
    end if;

    select upper(trim(coalesce(r.status,'')))
    into v_status
    from public.ta_employee_requests_v61481 r
    where r.request_id=p_request_id;
    if v_status<>'RESOLVED' then
      raise exception 'PARTIAL_LEAVE_FINAL_STATUS_MISMATCH:%',coalesce(v_status,'-');
    end if;

    v_snapshot:=jsonb_build_object(
      'request_id',p_request_id,
      'request_no',v_req.request_no,
      'request_subtype',v_subtype,
      'apply_strategy','PARTIAL_OVERLAY_ATOMIC',
      'review',v_review,
      'overlay',v_overlay,
      'final_shift_code',v_current.shift_code,
      'version','V6.15.21'
    );

    insert into public.ta_employee_portal_audit_v61482(
      emp_code,action_type,actor_user_id,actor_email,detail
    ) values (
      v_emp,'MANAGER_LEAVE_APPLIED_V61521',auth.uid(),v_actor_email,v_snapshot
    ) returning audit_id into v_audit_id;

    return jsonb_build_object(
      'applied',true,
      'request_id',p_request_id,
      'request_no',v_req.request_no,
      'request_subtype',v_subtype,
      'request_status','RESOLVED',
      'apply_strategy','PARTIAL_OVERLAY_ATOMIC',
      'action_result',v_result,
      'final_state',jsonb_build_object(
        'shift_code',v_current.shift_code,
        'is_workday',v_current.is_workday,
        'overlay',v_overlay
      ),
      'audit_id',v_audit_id,
      'version','V6.15.21'
    );
  end if;

  -- FULL_DAY: build the write payload ONLY from Review rows with action=SET_LV.
  v_days:=coalesce(v_review->'days','[]'::jsonb);
  for v_item in select value from jsonb_array_elements(v_days)
  loop
    begin
      v_d:=nullif(v_item->>'work_date','')::date;
    exception when others then
      raise exception 'LEAVE_REVIEW_WORK_DATE_INVALID';
    end;

    if v_d is null then
      raise exception 'LEAVE_REVIEW_WORK_DATE_REQUIRED';
    end if;

    -- Compare effective state with the fresh Review snapshot before mutation.
    select *
    into v_current
    from public._ta_request_effective_shift_v61510(v_emp,v_d)
    limit 1;
    v_expected_code:=nullif(upper(trim(coalesce(v_item->>'current_shift_code',''))),'');
    if v_expected_code is not null
       and upper(trim(coalesce(v_current.shift_code,''))) is distinct from v_expected_code then
      raise exception 'LEAVE_REVIEW_STATE_CHANGED:%:%:%',
        v_d,v_expected_code,coalesce(v_current.shift_code,'-');
    end if;
    v_skip_state:=public._ta_employee_portal_leave_day_state_v61508(v_emp,v_d);

    if upper(trim(coalesce(v_item->>'action','')))='SET_LV' then
      if not coalesce((v_skip_state->>'allowed')::boolean,false) then
        raise exception 'LEAVE_REVIEW_STATE_CHANGED_TO_NONWORKDAY:%',v_d;
      end if;
      perform public._ta_assert_system_period_action_v6110(v_d,'SCHEDULE_EDIT');
      perform public._ta_validate_shift_pattern_v651(v_emp,v_d,'LV');

      v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
        'emp_code',v_emp,
        'work_date',v_d,
        'shift_code','LV',
        'note',coalesce(v_note,'แจ้งลาเพื่อปรับตารางกะ • '||coalesce(v_req.request_no,''))
      ));
      v_affected_dates:=v_affected_dates||jsonb_build_array(to_char(v_d,'YYYY-MM-DD'));
      v_affected_count:=v_affected_count+1;
    else
      if coalesce((v_skip_state->>'allowed')::boolean,true) then
        raise exception 'LEAVE_REVIEW_STATE_CHANGED_TO_WORKDAY:%',v_d;
      end if;
      v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object(
        'work_date',v_d,
        'current_shift_code',v_item->>'current_shift_code',
        'current_day_type',v_item->>'current_day_type',
        'skip_reason',coalesce(v_item->>'skip_reason','NO_SCHEDULE_CHANGE_REQUIRED')
      ));
      v_skipped_count:=v_skipped_count+1;
    end if;
  end loop;

  if v_affected_count=0 then
    raise exception 'LEAVE_RANGE_NO_WORKDAY';
  end if;

  v_sequence:=public.ta_validate_night_sequence_bulk_v61437(v_rows);
  if coalesce((v_sequence->>'allowed')::boolean,true)=false then
    raise exception 'NIGHT_SEQUENCE_INVALID:%',
      coalesce(v_sequence->'violations','[]'::jsonb)::text;
  end if;

  -- Canonical guarded Bulk Writer + Smart Rule sync + certification-aware finalizer.
  v_result:=public.ta_assign_shifts_bulk_v61424(
    v_rows,
    'Employee Request FULL_DAY LEAVE AFFECTED '||coalesce(v_req.request_no,''),
    true
  );
  v_sync:=public.ta_sync_bulk_schedule_rules_v6135(v_rows);
  v_final:=public.ta_finalize_schedule_mutation_v61415(v_rows);

  -- Final state verification for every mutated workdate. Any mismatch raises and
  -- rolls back Shift, Rule sync and Attendance refresh together.
  for v_item in select value from jsonb_array_elements(v_rows)
  loop
    v_d:=(v_item->>'work_date')::date;
    select *
    into v_current
    from public._ta_request_effective_shift_v61510(v_emp,v_d)
    limit 1;

    if upper(trim(coalesce(v_current.shift_code,''))) not in ('LV','LEAVE')
       or coalesce(v_current.is_workday,true) then
      raise exception 'LEAVE_FINAL_STATE_MISMATCH_AFFECTED:%:%:%',
        v_d,coalesce(v_current.shift_code,'-'),coalesce(v_current.is_workday,true);
    end if;

    v_final_days:=v_final_days||jsonb_build_array(jsonb_build_object(
      'work_date',v_d,
      'shift_code',v_current.shift_code,
      'is_workday',v_current.is_workday,
      'action','SET_LV'
    ));
  end loop;

  -- Verify every skipped date is still a non-workday and, when a concrete code
  -- was captured in Review, the code was not changed by this transaction.
  for v_item in select value from jsonb_array_elements(v_skipped)
  loop
    v_d:=(v_item->>'work_date')::date;
    v_expected_code:=nullif(upper(trim(coalesce(v_item->>'current_shift_code',''))),'');
    select *
    into v_current
    from public._ta_request_effective_shift_v61510(v_emp,v_d)
    limit 1;

    v_skip_state:=public._ta_employee_portal_leave_day_state_v61508(v_emp,v_d);
    if coalesce((v_skip_state->>'allowed')::boolean,true) then
      raise exception 'LEAVE_FINAL_STATE_MISMATCH_SKIPPED_BECAME_WORKDAY:%',v_d;
    end if;
    if v_expected_code is not null
       and upper(trim(coalesce(v_current.shift_code,''))) is distinct from v_expected_code then
      raise exception 'LEAVE_FINAL_STATE_MISMATCH_SKIPPED_SHIFT:%:%:%',
        v_d,v_expected_code,coalesce(v_current.shift_code,'-');
    end if;

    v_final_days:=v_final_days||jsonb_build_array(jsonb_build_object(
      'work_date',v_d,
      'shift_code',v_current.shift_code,
      'is_workday',v_current.is_workday,
      'action','SKIP'
    ));
  end loop;

  -- Persist the exact fresh apply snapshot BEFORE changing status. The existing
  -- V6.15.15 RESOLVED consistency trigger will read these fields immediately.
  update public.ta_employee_requests_v61481 r
  set detail=coalesce(r.detail,'{}'::jsonb)||jsonb_build_object(
        'applied_affected_work_dates',v_affected_dates,
        'applied_affected_workday_count',v_affected_count,
        'applied_skipped_nonworkdays',v_skipped,
        'applied_skipped_nonworkday_count',v_skipped_count,
        'leave_apply_strategy','AFFECTED_WORK_DATES_ATOMIC',
        'leave_apply_version','V6.15.21',
        'leave_applied_at',now()
      ),
      updated_at=now()
  where r.request_id=p_request_id;

  update public.ta_employee_requests_v61481 r
  set status='RESOLVED',
      decided_by=auth.uid(),
      decided_by_email=v_actor_email,
      decided_at=now(),
      decision_note=coalesce(v_note,r.decision_note,r.reason),
      resolved_at=now(),
      updated_at=now()
  where r.request_id=p_request_id
    and upper(trim(coalesce(r.status,''))) in ('PENDING','IN_REVIEW');

  if not found then
    raise exception 'REQUEST_NOT_ACTIVE_AFTER_APPLY';
  end if;

  select upper(trim(coalesce(r.status,'')))
  into v_status
  from public.ta_employee_requests_v61481 r
  where r.request_id=p_request_id;
  if v_status<>'RESOLVED' then
    raise exception 'LEAVE_FINAL_STATUS_MISMATCH:%',coalesce(v_status,'-');
  end if;

  v_snapshot:=jsonb_build_object(
    'request_id',p_request_id,
    'request_no',v_req.request_no,
    'request_subtype',v_subtype,
    'apply_strategy','AFFECTED_WORK_DATES_ATOMIC',
    'affected_work_dates',v_affected_dates,
    'skipped_nonworkdays',v_skipped,
    'final_days',v_final_days,
    'night_sequence_guard',coalesce(v_sequence,'{}'::jsonb),
    'bulk_result',coalesce(v_result,'{}'::jsonb),
    'rule_sync',coalesce(v_sync,'{}'::jsonb),
    'finalizer',coalesce(v_final,'{}'::jsonb),
    'version','V6.15.21'
  );

  insert into public.ta_employee_portal_audit_v61482(
    emp_code,action_type,actor_user_id,actor_email,detail
  ) values (
    v_emp,'MANAGER_LEAVE_APPLIED_V61521',auth.uid(),v_actor_email,v_snapshot
  ) returning audit_id into v_audit_id;

  return jsonb_build_object(
    'applied',true,
    'request_id',p_request_id,
    'request_no',v_req.request_no,
    'request_subtype',v_subtype,
    'request_status','RESOLVED',
    'apply_strategy','AFFECTED_WORK_DATES_ATOMIC',
    'affected_workday_count',v_affected_count,
    'skipped_nonworkday_count',v_skipped_count,
    'affected_work_dates',v_affected_dates,
    'skipped_nonworkdays',v_skipped,
    'final_state',jsonb_build_object(
      'days',v_final_days,
      'affected_workday_count',v_affected_count,
      'skipped_nonworkday_count',v_skipped_count
    ),
    'action_result',coalesce(v_result,'{}'::jsonb)||jsonb_build_object(
      'schedule_rule_sync',v_sync,
      'schedule_finalizer',v_final,
      'night_sequence_guard',v_sequence
    ),
    'audit_id',v_audit_id,
    'version','V6.15.21'
  );
end;
$$;

revoke all on function public.ta_apply_employee_request_leave_v61521(uuid,text)
from public,anon,authenticated;
grant execute on function public.ta_apply_employee_request_leave_v61521(uuid,text)
to authenticated;

comment on function public.ta_apply_employee_request_leave_v61521(uuid,text)
is 'V6.15.21 4C.3 atomic Manager Leave Apply. FULL_DAY mutates affected workdates only, preserves OFF/PH/leave, verifies final state and resolves in one transaction; PARTIAL_DAY delegates to canonical V6.15.11 overlay writer then verifies.';

notify pgrst,'reload schema';
commit;
