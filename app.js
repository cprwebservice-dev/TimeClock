
/* V6.10.2 deployment diagnostic */
window.__TIME_CLOCK_BUILD__ = "V6.10.29";
document.documentElement.dataset.timeClockBuild = "6.10.29";


/* ===== js/config.js ===== */
'use strict';

/**
 * Public frontend configuration only.
 * Never place a Supabase service_role key in this file.
 */
window.TIME_CLOCK_CONFIG = Object.freeze({
  appName: 'Time-Clock Management',
  version: '6.10.29',
  defaultRoute: 'dashboard',
  githubPagesBase: '/TimeClock/'
});

;

/* ===== js/shift-api.js ===== */
(() => {
  "use strict";

  const missingFunction = error => {
    const text = String(error?.message || error?.details || error || "").toLowerCase();
    return error?.code === "PGRST202" || text.includes("could not find the function") || text.includes("schema cache");
  };

  const missingColumn = error => {
    const text = String(error?.message || error?.details || error || "").toLowerCase();
    return error?.code === "PGRST204" || text.includes("could not find the") && text.includes("column") || text.includes("schema cache");
  };

  const withTimeout = async (promise, milliseconds = 30000, label = "คำขอ") => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} ใช้เวลานานเกิน ${Math.round(milliseconds / 1000)} วินาที`)), milliseconds);
        })
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  const currentEmail = app => app?.state?.user?.email || app?.state?.profile?.email || null;

  async function directAssign(client, row, app) {
    const empCode = String(row.emp_code || row.p_emp_code || "").trim();
    const workDate = String(row.work_date || row.p_work_date || "").slice(0, 10);
    const shiftCode = row.shift_code ?? row.p_shift_code;
    const note = row.note ?? row.p_note ?? null;
    const confirmNow = Boolean(row.confirm_now ?? row.p_confirm_now);
    if (!empCode || !workDate) throw new Error("ข้อมูลรหัสพนักงานหรือวันที่จัดกะไม่ครบ");

    if (!shiftCode) {
      const { error } = await client.from("shift_calendar").delete().eq("emp_code", empCode).eq("work_date", workDate);
      if (error) throw error;
      return { deleted: 1, fallback: true };
    }

    const actor = currentEmail(app);
    const base = {
      emp_code: empCode,
      work_date: workDate,
      shift_code: String(shiftCode).trim().toUpperCase(),
      source_type: "manual",
      note,
      is_confirmed: confirmNow,
      confirmed_at: confirmNow ? new Date().toISOString() : null,
      confirmed_by: confirmNow ? actor : null,
      updated_by: actor,
      updated_at: new Date().toISOString()
    };
    let result = await client.from("shift_calendar").upsert(base, { onConflict: "work_date,emp_code" });
    if (result.error && missingColumn(result.error)) {
      const minimum = { emp_code: base.emp_code, work_date: base.work_date, shift_code: base.shift_code, source_type: base.source_type, note: base.note };
      result = await client.from("shift_calendar").upsert(minimum, { onConflict: "work_date,emp_code" });
    }
    if (result.error) throw result.error;
    return { saved: 1, fallback: true };
  }

  async function assignSingle(app, params) {
    const client = app?.state?.client;
    if (!client) throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");
    const full = {
      p_emp_code: params.emp_code ?? params.p_emp_code,
      p_work_date: params.work_date ?? params.p_work_date,
      p_shift_code: params.shift_code ?? params.p_shift_code,
      p_note: params.note ?? params.p_note ?? null,
      p_change_reason: params.change_reason ?? params.p_change_reason ?? "บันทึกกะจากหน้าเว็บ",
      p_confirm_now: Boolean(params.confirm_now ?? params.p_confirm_now)
    };

    let response = await client.rpc("ta_assign_shift_single_v651", full);
    if (!response.error) return response.data;
    if (!missingFunction(response.error)) throw response.error;

    throw new Error(
      "SECURE_SCHEDULE_RPC_REQUIRED: กรุณาติดตั้ง SQL V6.10.29 ก่อนจัดกะ"
    );
  }

  async function assignBulk(app, rows, changeReason, confirmNow = false) {
    const client = app?.state?.client;
    if (!client) throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");
    const cleanRows = (rows || []).map(row => ({
      emp_code: String(row.emp_code || "").trim(),
      work_date: String(row.work_date || "").slice(0, 10),
      shift_code: row.shift_code == null || row.shift_code === "" ? null : String(row.shift_code).trim().toUpperCase(),
      note: row.note ?? null
    })).filter(row => row.emp_code && row.work_date);
    if (!cleanRows.length) return { saved_rows: 0 };

    let response = await client.rpc("ta_assign_shifts_bulk_v651", {
      p_rows: cleanRows,
      p_change_reason: changeReason || "บันทึกกะแบบหลายรายการจากหน้าเว็บ",
      p_confirm_now: Boolean(confirmNow)
    });
    if (!response.error) return response.data;
    if (!missingFunction(response.error)) throw response.error;

    throw new Error(
      "SECURE_SCHEDULE_RPC_REQUIRED: กรุณาติดตั้ง SQL V6.10.29 ก่อนบันทึกกะแบบหลายรายการ"
    );
  }

  async function deleteBulk(app, empCodes, startDate, endDate, changeReason) {
    const client = app?.state?.client;
    if (!client) throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");
    const response = await client.rpc(
      "ta_delete_shift_assignments_bulk_v61022",
      {
        p_emp_codes: empCodes,
        p_start_date: startDate,
        p_end_date: endDate,
        p_change_reason:
          changeReason
          || "ลบกะจากหน้าเว็บ"
      }
    );

    if(response.error) {
      throw response.error;
    }

    return response.data;
  }

  function classifyReviewRow(row) {
    const firstIn = row.first_in || null;
    const lastOut = row.last_out || null;
    const expected = Number(row.expected_day || 0);
    let issue = "NORMAL";
    if (expected === 1 && !firstIn && !lastOut) issue = "ABSENT";
    else if (!firstIn && lastOut) issue = "MISSING_IN";
    else if (firstIn && !lastOut) issue = "MISSING_OUT";
    else if (expected === 0 && (firstIn || lastOut)) issue = "WORKED_ON_OFFDAY";
    else if (!row.shift_code && firstIn && lastOut) issue = "NEED_REVIEW";

    const firstHour = firstIn ? Number(String(firstIn).slice(0, 2)) : null;
    const suggested = expected === 0 ? "OFF" : firstHour != null && firstHour >= 18 ? "N" : "D";
    const assigned = row.shift_calendar?.[0]?.shift_code || row.shift_calendar?.shift_code || null;
    const effective = assigned || row.shift_code || suggested;
    return {
      ...row,
      zone: row.area || row.zone || null,
      auto_shift_code: row.shift_code || suggested,
      suggested_shift_code: suggested,
      suggestion_confidence: assigned ? 100 : firstIn ? 85 : 60,
      assigned_shift_code: assigned,
      effective_shift_code: effective,
      schedule_status: row.shift_calendar?.[0]?.is_confirmed || row.shift_calendar?.is_confirmed ? "CONFIRMED" : assigned ? "ASSIGNED" : issue === "NEED_REVIEW" ? "NEED_REVIEW" : "AUTO",
      actual_in_at: firstIn,
      actual_out_at: lastOut,
      attendance_result: issue,
      attendance_status: issue,
      time_pair_status: issue,
      issue_type: issue
    };
  }

  async function directReview(client, params) {
    const pageSize = 1000;
    const maxRows = 20000;
    const rows = [];
    for (let from = 0; from < maxRows; from += pageSize) {
      let query = client.from("attendance_workday")
        .select("work_date,emp_code,full_name,department,area,first_in,last_out,expected_day,shift_code,is_night_shift")
        .gte("work_date", params.p_start_date)
        .lte("work_date", params.p_end_date)
        .order("work_date", { ascending: false })
        .range(from, from + pageSize - 1);
      if (params.p_department) query = query.eq("department", params.p_department);
      if (params.p_zone) query = query.eq("area", params.p_zone);
      if (Array.isArray(params.p_emp_codes) && params.p_emp_codes.length) query = query.in("emp_code", params.p_emp_codes);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []).filter(emp => !params.p_zone || String(emp.zone || emp.area || "") === String(params.p_zone)));
      if (!data || data.length < pageSize) break;
    }
    const calendarMap = new Map();
    for (let from = 0; from < maxRows; from += pageSize) {
      let query = client.from("shift_calendar")
        .select("work_date,emp_code,shift_code,is_confirmed")
        .gte("work_date", params.p_start_date)
        .lte("work_date", params.p_end_date)
        .order("work_date", { ascending: false })
        .range(from, from + pageSize - 1);
      if (Array.isArray(params.p_emp_codes) && params.p_emp_codes.length) query = query.in("emp_code", params.p_emp_codes);
      const { data, error } = await query;
      if (error) {
        if (!missingColumn(error)) throw error;
        break;
      }
      (data || []).forEach(item => calendarMap.set(`${item.emp_code}|${String(item.work_date).slice(0,10)}`, item));
      if (!data || data.length < pageSize) break;
    }
    const issues = Array.isArray(params.p_issue_types) ? params.p_issue_types.filter(Boolean) : [];
    return rows.map(row => classifyReviewRow({ ...row, shift_calendar: calendarMap.get(`${row.emp_code}|${String(row.work_date).slice(0,10)}`) || null }))
      .filter(row => row.issue_type !== "NORMAL" && (!issues.length || issues.includes(row.issue_type)));
  }


  const isoDateLocal = date => {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const parsePcGroup = value => {
    const text = String(value || "").trim().toUpperCase();
    const match = text.match(/[0-9]+/);
    return match ? match[0] : text;
  };

  const isNaturalWeeklyOff = (pc, date) => {
    const dow = date.getDay(); // 0 Sunday, 6 Saturday
    const group = parsePcGroup(pc);
    if (group === "4") return dow === 0 || dow === 6;
    if (group === "5") return dow === 0;
    return false;
  };

  async function fetchEmployeesForSchedule(client, params, monthStart, endDate) {
    const pageSize = 1000;
    const rows = [];
    for (let from = 0; from < 10000; from += pageSize) {
      let query = client.from("employees")
        .select("EmployeeId,full_name,position_name,department,pc,area,zone,sub_area,car_team,manager_department,manager_division,manager_gm,manager_avp,start_date,resign_date")
        .or(`start_date.is.null,start_date.lte.${endDate}`)
        .or(`resign_date.is.null,resign_date.gte.${monthStart}`)
        .order("EmployeeId", { ascending: true })
        .range(from, from + pageSize - 1);
      if (params.p_department) query = query.eq("department", params.p_department);
      if (Array.isArray(params.p_emp_codes) && params.p_emp_codes.length) query = query.in("EmployeeId", params.p_emp_codes);
      const { data, error } = await query;
      if (error) throw error;
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  }

  async function fetchOptional(client, table, select, configure) {
    try {
      let query = client.from(table).select(select);
      query = configure ? configure(query) : query;
      const { data, error } = await query;
      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  }

  function patternShiftFor(patternsByEmp, detailsByPattern, empCode, workDate) {
    const patterns = patternsByEmp.get(empCode) || [];
    const active = patterns
      .filter(p => (!p.effective_start || p.effective_start <= workDate) && (!p.effective_end || p.effective_end >= workDate))
      .sort((a, b) => String(b.effective_start || "").localeCompare(String(a.effective_start || "")))[0];
    if (!active) return null;
    const details = detailsByPattern.get(active.pattern_code) || [];
    if (!details.length) return null;
    const cycle = Math.max(...details.map(d => Number(d.day_no || 0)), 0);
    if (!cycle) return null;
    const start = new Date(`${active.effective_start}T00:00:00`);
    const current = new Date(`${workDate}T00:00:00`);
    const diff = Math.round((current - start) / 86400000);
    const dayNo = ((diff + Number(active.start_day_no || 1) - 1) % cycle + cycle) % cycle + 1;
    return details.find(d => Number(d.day_no) === dayNo)?.shift_code || null;
  }

  async function ensureMonthlyMatrix(client, rows, params, monthStart, endDate) {
    let employees;
    try {
      employees = await fetchEmployeesForSchedule(client, params, monthStart, endDate);
    } catch {
      return rows;
    }
    if (!employees.length) return rows;

    const [holidays, shiftMaster, patterns, patternDetails] = await Promise.all([
      fetchOptional(client, "holidays", "holiday_date,holiday_name", q => q.gte("holiday_date", monthStart).lte("holiday_date", endDate)),
      fetchOptional(client, "shift_master", "shift_code,shift_name,start_time,end_time,is_workday,is_active", q => q.eq("is_active", true)),
      fetchOptional(client, "employee_shift_patterns", "emp_code,pattern_code,effective_start,effective_end,start_day_no", q => q.lte("effective_start", endDate).or(`effective_end.is.null,effective_end.gte.${monthStart}`)),
      fetchOptional(client, "shift_pattern_details", "pattern_code,day_no,shift_code")
    ]);

    const holidayMap = new Map(holidays.map(h => [String(h.holiday_date).slice(0, 10), h.holiday_name || "วันหยุดนักขัตฤกษ์"]));
    const shiftMap = new Map(shiftMaster.map(s => [String(s.shift_code || "").toUpperCase(), s]));
    const patternsByEmp = new Map();
    patterns.forEach(p => {
      const key = String(p.emp_code || "").trim();
      if (!patternsByEmp.has(key)) patternsByEmp.set(key, []);
      patternsByEmp.get(key).push(p);
    });
    const detailsByPattern = new Map();
    patternDetails.forEach(d => {
      const key = String(d.pattern_code || "").trim();
      if (!detailsByPattern.has(key)) detailsByPattern.set(key, []);
      detailsByPattern.get(key).push(d);
    });

    const rowMap = new Map();
    (rows || []).forEach(row => {
      const key = `${String(row.emp_code || "").trim()}|${String(row.work_date || "").slice(0, 10)}`;
      rowMap.set(key, { ...row });
    });

    const start = new Date(`${monthStart}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    for (const emp of employees) {
      const empCode = String(emp.EmployeeId || emp.emp_code || "").trim();
      if (!empCode) continue;
      for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
        const workDate = isoDateLocal(cursor);
        if (emp.start_date && workDate < String(emp.start_date).slice(0, 10)) continue;
        if (emp.resign_date && workDate > String(emp.resign_date).slice(0, 10)) continue;
        const key = `${empCode}|${workDate}`;
        const existing = rowMap.get(key) || {};
        const publicHoliday = holidayMap.has(workDate);
        const weeklyOff = !publicHoliday && isNaturalWeeklyOff(emp.pc, cursor);
        const patternShift = patternShiftFor(patternsByEmp, detailsByPattern, empCode, workDate);
        const autoCode = existing.auto_shift_code || existing.shift_code || (publicHoliday ? "HOL" : patternShift || (weeklyOff ? "OFF" : "D"));
        const effectiveCode = existing.assigned_shift_code || existing.effective_shift_code || autoCode;
        const shift = shiftMap.get(String(effectiveCode || "").toUpperCase()) || {};
        rowMap.set(key, {
          ...emp,
          ...existing,
          work_date: workDate,
          emp_code: empCode,
          full_name: existing.full_name || emp.full_name,
          position_name: existing.position_name || emp.position_name,
          department: existing.department || emp.department,
          area: existing.area || emp.area || emp.zone,
          zone: existing.zone || emp.zone || emp.area,
          sub_area: existing.sub_area || emp.sub_area,
          pc: existing.pc || emp.pc,
          day_type: publicHoliday ? "PUBLIC_HOLIDAY" : weeklyOff ? "WEEKLY_OFF" : "WORKDAY",
          is_public_holiday: publicHoliday,
          is_weekly_off: weeklyOff,
          holiday_name: publicHoliday ? holidayMap.get(workDate) : null,
          expected_day: existing.expected_day ?? (publicHoliday || weeklyOff ? 0 : 1),
          auto_shift_code: autoCode,
          suggested_shift_code: existing.suggested_shift_code || autoCode,
          suggestion_confidence: existing.suggestion_confidence ?? (patternShift ? 95 : publicHoliday || weeklyOff ? 100 : 70),
          effective_shift_code: effectiveCode,
          schedule_status: existing.schedule_status || (existing.assigned_shift_code ? (existing.is_confirmed ? "CONFIRMED" : "ASSIGNED") : "AUTO"),
          shift_start_time: existing.shift_start_time || existing.effective_shift_start_time || shift.start_time || null,
          shift_end_time: existing.shift_end_time || existing.effective_shift_end_time || shift.end_time || null
        });
      }
    }
    return [...rowMap.values()];
  }



  function scheduleText(value) {
    const text = String(value ?? "").trim();
    return ["", "-", "null", "undefined"].includes(text.toLowerCase())
      ? ""
      : text;
  }

  function meaningfulScheduleName(value, empCode) {
    const text = scheduleText(value);
    return Boolean(text && text !== String(empCode || "").trim());
  }

  function mergeScheduleEmployeeMeta(target, source) {
    if (!source) return target;

    const empCode = scheduleText(
      target.emp_code
      || target.EmployeeId
      || source.emp_code
      || source.EmployeeId
    );

    const sourceName = scheduleText(
      source.full_name
      || source.name
      || source.employee_name
      || source.thai_name
    );

    const targetName = scheduleText(target.full_name);

    if (
      meaningfulScheduleName(sourceName, empCode)
      && (
        !meaningfulScheduleName(targetName, empCode)
        || sourceName.length > targetName.length
      )
    ) {
      target.full_name = sourceName;
    }

    const fields = [
      "start_date",
      "resign_date",
      "position_name",
      "department",
      "area",
      "zone",
      "sub_area",
      "pc"
    ];

    fields.forEach(field => {
      if (!scheduleText(target[field]) && scheduleText(source[field])) {
        target[field] = scheduleText(source[field]);
      }
    });

    return target;
  }

  async function enrichScheduleEmployeeMetadata(
    app,
    client,
    rows,
    effectiveDate
  ) {
    const result = Array.isArray(rows)
      ? rows.map(row => ({ ...row }))
      : [];

    const metaByEmp = new Map();

    function addMeta(source) {
      const empCode = scheduleText(
        source?.emp_code
        || source?.employee_id
        || source?.EmployeeId
        || source?.value
      );
      if (!empCode) return;

      const target = metaByEmp.get(empCode) || { emp_code: empCode };
      mergeScheduleEmployeeMeta(target, {
        ...source,
        emp_code: empCode,
        full_name:
          source?.full_name
          || source?.name
          || source?.label
          || source?.employee_name
      });
      metaByEmp.set(empCode, target);
    }

    result.forEach(addMeta);

    const filterEmployees = app?.state?.filters?.employees || [];
    filterEmployees.forEach(item => {
      if (typeof item === "string") {
        addMeta({ emp_code: item });
      } else {
        addMeta(item);
      }
    });

    try {
      const patternResponse = await client.rpc(
        "ta_get_employee_pattern_assignments",
        {
          p_search: null,
          p_effective_date: effectiveDate,
          p_limit: 5000
        }
      );

      if (!patternResponse.error) {
        (patternResponse.data || []).forEach(addMeta);
      }
    } catch {
      // Optional enrichment only.
    }

    let missing = [...new Set(
      result
        .map(row => scheduleText(row.emp_code))
        .filter(Boolean)
        .filter(empCode => {
          const meta = metaByEmp.get(empCode);
          return !meaningfulScheduleName(meta?.full_name, empCode);
        })
    )];

    for (let offset = 0; offset < missing.length; offset += 150) {
      const chunk = missing.slice(offset, offset + 150);

      try {
        const attendanceResponse = await client
          .from("attendance_workday")
          .select(
            "emp_code,full_name,position_name,department,area,sub_area,pc,work_date"
          )
          .in("emp_code", chunk)
          .not("full_name", "is", null)
          .order("work_date", { ascending: false })
          .limit(5000);

        if (!attendanceResponse.error) {
          (attendanceResponse.data || []).forEach(addMeta);
        }
      } catch {
        // Keep the schedule available even if optional metadata is blocked.
      }
    }

    result.forEach(row => {
      const empCode = scheduleText(row.emp_code);
      mergeScheduleEmployeeMeta(row, metaByEmp.get(empCode));

      if (!meaningfulScheduleName(row.full_name, empCode)) {
        row.full_name = "ไม่พบชื่อพนักงาน";
        row.employee_name_missing = true;
      } else {
        row.employee_name_missing = false;
      }
    });

    return result;
  }

  async function getScheduleScopeDebug(app,startDate,endDate) {
    const client=app?.state?.client;
    if(!client) return null;
    const {data,error}=await client.rpc("ta_get_schedule_scope_debug_v61024",{p_start_date:startDate,p_end_date:endDate});
    if(error) return {reason:"DEBUG_RPC_ERROR",message:error.message||String(error)};
    return data||null;
  }

  async function getMonthlySchedule(app, params) {
    const client =
      app?.state?.client;

    if(!client) {
      throw new Error(
        "ยังไม่ได้เชื่อมต่อ Supabase"
      );
    }

    const monthStart =
      String(
        params.p_month
        || ""
      ).slice(0,10);

    const rangeStartDate =
      params.p_start_date
      || monthStart;

    let rangeEndDate =
      params.p_end_date
      || null;

    if(
      !rangeEndDate
      && monthStart
    ) {
      const monthDate =
        new Date(
          `${monthStart}T00:00:00`
        );

      const lastDay =
        new Date(
          monthDate.getFullYear(),
          monthDate.getMonth() + 1,
          0
        );

      rangeEndDate =
        `${lastDay.getFullYear()}-`
        + `${String(
            lastDay.getMonth() + 1
          ).padStart(2,"0")}-`
        + `${String(
            lastDay.getDate()
          ).padStart(2,"0")}`;
    }

    if(
      !rangeStartDate
      || !rangeEndDate
    ) {
      return [];
    }

    const response =
      await withTimeout(
        client.rpc(
          "ta_get_schedule_range_v61024",
          {
            p_start_date:
              rangeStartDate,

            p_end_date:
              rangeEndDate,

            p_zone:
              params.p_zone
              ?? null,

            p_department:
              params.p_department
              ?? null,

            p_emp_codes:
              params.p_emp_codes
              ?? null,

            p_schedule_statuses:
              params.p_schedule_statuses
              ?? null
          }
        ),
        30000,
        "โหลดตารางกะตาม User Scope"
      );

    if(response.error) {
      if(
        missingFunction(
          response.error
        )
      ) {
        throw new Error(
          "SECURE_SCHEDULE_RANGE_RPC_REQUIRED: กรุณารัน SQL V6.10.29"
        );
      }

      throw response.error;
    }

    const rows =
      Array.isArray(
        response.data
      )
        ? response.data.map(
            row => ({
              ...row
            })
          )
        : [];

    rows.forEach(row => {
      const empCode =
        scheduleText(
          row.emp_code
        );

      if(
        !meaningfulScheduleName(
          row.full_name,
          empCode
        )
      ) {
        row.full_name =
          "ไม่พบชื่อพนักงาน";

        row.employee_name_missing =
          true;
      } else {
        row.employee_name_missing =
          false;
      }
    });

    return rows;
  }

  async function getReview(app, params) {
    const client = app?.state?.client;
    if (!client) throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");
    const exact = {
      p_start_date: params.p_start_date,
      p_end_date: params.p_end_date,
      p_zone: params.p_zone ?? null,
      p_department: params.p_department ?? null,
      p_emp_codes: params.p_emp_codes ?? null,
      p_issue_types: params.p_issue_types ?? null
    };
    try {
      let response = await withTimeout(client.rpc("ta_get_review_queue_v640", exact), 30000, "โหลดรายการรอตรวจสอบและผลคำนวณ V6.4");
      if (!response.error) return response.data || [];
      if (!missingFunction(response.error)) throw response.error;

      response = await withTimeout(client.rpc("ta_get_review_queue_v600", exact), 30000, "โหลดรายการรอตรวจสอบ V6");
      if (!response.error) return response.data || [];
      if (!missingFunction(response.error)) throw response.error;

      response = await withTimeout(client.rpc("ta_get_review_queue", exact), 30000, "โหลดรายการรอตรวจสอบ");
      if (!response.error) return response.data || [];
      if (!missingFunction(response.error)) throw response.error;
    } catch (error) {
      if (!missingFunction(error) && !String(error?.message || "").includes("ใช้เวลานานเกิน")) throw error;
    }
    return withTimeout(directReview(client, exact), 30000, "โหลดรายการรอตรวจสอบสำรอง");
  }

  async function upsertShiftMaster(app, params) {
    const client = app?.state?.client;
    if (!client) throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");
    const rpcArgs651 = {
      p_shift_code: params.shift_code,
      p_shift_name: params.shift_name,
      p_start_time: params.start_time || null,
      p_end_time: params.end_time || null,
      p_is_night_shift: Boolean(params.is_night_shift),
      p_is_workday: Boolean(params.is_workday),
      p_break_minutes: Number(params.break_minutes || 0),
      p_display_order: Number(params.display_order || 0),
      p_note: params.note || null,
      p_is_active: params.is_active !== false,
      p_applicable_pattern_codes: params.applicable_pattern_codes || ["TECH_5D","TECH_6D"],
      p_default_pattern_codes: params.default_pattern_codes || [],
      p_change_reason: params.change_reason || "บันทึกข้อมูลกะจากหน้าเว็บ"
    };
    let response = await client.rpc("ta_upsert_shift_master_v651", rpcArgs651);
    if (!response.error) return response.data;
    if (!missingFunction(response.error)) throw response.error;

    const rpcArgs = {
      p_shift_code: params.shift_code,
      p_shift_name: params.shift_name,
      p_start_time: params.start_time || null,
      p_end_time: params.end_time || null,
      p_is_night_shift: Boolean(params.is_night_shift),
      p_is_workday: Boolean(params.is_workday),
      p_break_minutes: Number(params.break_minutes || 0),
      p_display_order: Number(params.display_order || 0),
      p_note: params.note || null,
      p_is_active: params.is_active !== false,
      p_change_reason: params.change_reason || "บันทึกข้อมูลกะจากหน้าเว็บ"
    };
    response = await client.rpc("ta_upsert_shift_master", rpcArgs);
    if (!response.error) return response.data;
    if (!missingFunction(response.error)) throw response.error;

    const extended = {
      shift_code: String(params.shift_code || "").trim().toUpperCase(),
      shift_name: params.shift_name,
      start_time: params.start_time || null,
      end_time: params.end_time || null,
      is_night_shift: Boolean(params.is_night_shift),
      is_workday: Boolean(params.is_workday),
      break_minutes: Number(params.break_minutes || 0),
      display_order: Number(params.display_order || 0),
      sort_order: Number(params.display_order || 0),
      note: params.note || null,
      is_active: params.is_active !== false,
      updated_at: new Date().toISOString()
    };
    let result = await client.from("shift_master").upsert(extended, { onConflict: "shift_code" });
    if (result.error && missingColumn(result.error)) {
      const { display_order, note, ...base } = extended;
      result = await client.from("shift_master").upsert(base, { onConflict: "shift_code" });
    }
    if (result.error) throw result.error;
    return { fallback: true };
  }

  window.TimeClockShiftAPI = Object.freeze({
    assignSingle,
    assignBulk,
    getMonthlySchedule,
    getScheduleScopeDebug,
    deleteBulk,
    getReview,
    upsertShiftMaster,
    missingFunction,
    scheduleText,
    meaningfulScheduleName,
    mergeScheduleEmployeeMeta
  });
})();

;

/* ===== js/core/app-core.js ===== */
"use strict";

    const APP_CONFIG_KEY = "ta_supabase_config_v1";
    const DEFAULT_SUPABASE_CONFIG = Object.freeze({
      url: "https://lryojaccbbbgdbpjstld.supabase.co",
      key: "sb_publishable_xxYLeNtxgeWoE0o5GNOwDg_QXfiFy_Y"
    });
    try {
      if (!localStorage.getItem(APP_CONFIG_KEY)) {
        localStorage.setItem(
          APP_CONFIG_KEY,
          JSON.stringify({
            url: DEFAULT_SUPABASE_CONFIG.url,
            key: DEFAULT_SUPABASE_CONFIG.key
          })
        );
      }
    } catch (_) {}


    function getSupabaseConfigWithDefaults(config = {}) {
      return {
        url:
          String(
            config?.url
            || config?.supabaseUrl
            || ""
          ).trim()
          || DEFAULT_SUPABASE_CONFIG.url,

        key:
          String(
            config?.key
            || config?.anonKey
            || config?.publishableKey
            || ""
          ).trim()
          || DEFAULT_SUPABASE_CONFIG.key
      };
    }



    const state = {
      client: null,
      session: null,
      user: null,
      profile: null,
      filters: {
        zones: [],
        departments: [],
        employees: [],
        shifts: [],
        attendance: {
          areas: [],
          sub_areas: [],
          departments: [],
          employees: []
        }
      },
      dashboard: null,
      attendance: [],
      schedule: [],
      users: [],
      scopeOptions: null,
      currentPage: "dashboard"
    };

    const $ = (id) => document.getElementById(id);
    const qs = (selector, root = document) => root.querySelector(selector);
    const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];
    const val = (id) => $(id)?.value ?? "";
    const setVal = (id, value) => { if ($(id)) $(id).value = value ?? ""; };
    const setText = (id, value) => { if ($(id)) $(id).textContent = value ?? ""; };
    const safe = (v) => String(v ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
    const todayISO = () => new Date().toISOString().slice(0, 10);
    const monthISO = () => new Date().toISOString().slice(0, 7);
    const firstDayOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10);
    const localISO = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    const parseLocalISO = value => {
      const [y,m,d] = String(value || "").slice(0,10).split("-").map(Number);
      return new Date(y, (m || 1)-1, d || 1);
    };
    const monthDays = (year, month) => new Date(year, month, 0).getDate();
    const scheduleWeekStarts = [1, 8, 15, 22, 29];
    const scheduleBlockStartForDate = value => {
      const d = parseLocalISO(value || todayISO());
      const day = d.getDate();
      const startDay = [...scheduleWeekStarts]
        .reverse()
        .find(item => day >= item) || 1;
      d.setDate(startDay);
      return localISO(d);
    };
    const schedulePeriodRange = () => {
      const startISO =
        val("schedulePeriodStart")
        || scheduleBlockStartForDate(todayISO());
      const start = parseLocalISO(startISO);
      const lastDay = monthDays(
        start.getFullYear(),
        start.getMonth() + 1
      );
      const end = new Date(start);
      end.setDate(Math.min(start.getDate() + 6, lastDay));
      const weekNumber =
        scheduleWeekStarts.indexOf(start.getDate()) + 1;

      return {
        startDate: localISO(start),
        endDate: localISO(end),
        month:
          `${start.getFullYear()}-`
          + `${String(start.getMonth()+1).padStart(2,"0")}`,
        weekNumber: weekNumber > 0 ? weekNumber : 1,
        dates: Array.from(
          {
            length:
              Math.max(
                0,
                Math.round((end-start)/86400000) + 1
              )
          },
          (_,i) => {
            const x = new Date(start);
            x.setDate(start.getDate() + i);
            return localISO(x);
          }
        )
      };
    };
    const syncSchedulePeriodUI = () => {
      const range = schedulePeriodRange();
      setVal("schedulePeriodStart", range.startDate);
      setVal("scheduleMonth", range.month);
      const startText = formatDate(range.startDate);
      const endText = formatDate(range.endDate);
      setText(
        "schedulePeriodLabel",
        `สัปดาห์ที่ ${range.weekNumber} • `
        + `${startText} – ${endText} • `
        + `${range.dates.length} วัน`
      );
      return range;
    };
    window.TimeClockSchedulePeriod = Object.freeze({
      blockStartForDate: scheduleBlockStartForDate,
      range: schedulePeriodRange,
      sync: syncSchedulePeriodUI
    });
    const formatDate = (d) => d ? new Date(`${String(d).slice(0,10)}T00:00:00`).toLocaleDateString("th-TH", {day:"2-digit",month:"2-digit",year:"numeric"}) : "-";
    const formatDateTime = (d) => d ? new Date(d).toLocaleString("th-TH", {dateStyle:"short",timeStyle:"short"}) : "-";
    const formatTime = (v) => {
      if (!v) return "-";
      const s = String(v);
      if (s.includes("T")) return new Date(s).toLocaleTimeString("th-TH", {hour:"2-digit",minute:"2-digit",hour12:false});
      return s.slice(0,5);
    };
    const formatNumber = (n) => Number(n || 0).toLocaleString("th-TH");
    const minutesToHours = (n) => Number.isFinite(Number(n)) ? (Number(n) / 60).toLocaleString("th-TH", {minimumFractionDigits:1,maximumFractionDigits:1}) : "-";
    const attendanceShiftCode = r => normalizeTemplateCodeV665(
      r?.effective_shift_code
      || r?.assigned_shift_code
      || r?.shift_code
      || r?.auto_shift_code
      || null
    );
    function attendanceShiftTime(r, side) {
      const code = attendanceShiftCode(r);
      const master = state.filters.shifts.find(s => String(s.shift_code || "").toUpperCase() === String(code || "").toUpperCase()) || {};
      const start = r?.effective_shift_start_time || r?.assigned_shift_start_time || r?.shift_start_time || master.start_time;
      const end = r?.effective_shift_end_time || r?.assigned_shift_end_time || r?.shift_end_time || master.end_time;
      return side === "start" ? start : end;
    }
    function normalizeTemplateCodeV665(value) {
      const code = String(value || "").trim();
      return code === "SINGLE_" + "0830"
        ? "SINGLE_0830_1730"
        : code;
    }

    function attendanceClockMinutes(value) {
      if (!value) return null;
      const text = String(value);
      const time = text.includes("T")
        ? text.slice(11,16)
        : text.slice(0,5);
      const [hour,minute] = time.split(":").map(Number);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
        return null;
      }
      return hour * 60 + minute;
    }

    function attendanceAbsenceMinutes(r) {
      const backendValue = Number(r?.absence_minutes);
      if (Number.isFinite(backendValue) && backendValue > 0) {
        return backendValue;
      }

      const dayType = String(r?.day_type || "")
        .trim()
        .toUpperCase();
      const rawStatus = String(
        r?.calculation_status
        || r?.attendance_result
        || r?.attendance_status
        || ""
      ).toUpperCase();

      const isLeave =
        Boolean(r?.leave_request_id || r?.leave_type_code)
        || dayType === "LEAVE"
        || [
          "LEAVE_APPROVED",
          "LEAVE_WITH_TIME",
          "PARTIAL_LEAVE",
          "PARTIAL_LEAVE_NO_TIME"
        ].includes(rawStatus);

      if (
        isLeave
        || dayType !== "WORKDAY"
      ) {
        return 0;
      }

      const inTime = r?.actual_in_at || r?.first_in;
      const outTime = r?.actual_out_at || r?.last_out;

      if (inTime && outTime) return 0;

      const start = attendanceClockMinutes(
        attendanceShiftTime(r,"start")
      );
      const end = attendanceClockMinutes(
        attendanceShiftTime(r,"end")
      );

      if (start != null && end != null) {
        return end >= start
          ? end - start
          : end + 1440 - start;
      }

      return Math.max(
        0,
        Number(r?.scheduled_minutes_including_break || 0),
        Number(r?.planned_paid_minutes || 0),
        Number(r?.standard_work_minutes || 0)
          + Number(r?.pattern_break_minutes || 0)
      );
    }

    function attendanceDisplayStatus(r) {
      const backend = String(r?.display_status || "")
        .trim()
        .toUpperCase();

      if (backend) return backend;
      if (attendanceAbsenceMinutes(r) > 0) return "ABSENCE";

      const dayType = String(r?.day_type || "")
        .trim()
        .toUpperCase();
      const rawStatus = String(
        r?.calculation_status
        || r?.attendance_result
        || r?.attendance_status
        || "NORMAL"
      ).toUpperCase();

      if (
        r?.leave_request_id
        || r?.leave_type_code
        || dayType === "LEAVE"
        || [
          "LEAVE_APPROVED",
          "LEAVE_WITH_TIME",
          "PARTIAL_LEAVE",
          "PARTIAL_LEAVE_NO_TIME"
        ].includes(rawStatus)
      ) {
        return "LEAVE";
      }

      if (
        ["WEEKLY_OFF","COMP_OFF","HOLIDAY"].includes(dayType)
      ) {
        return "DAY_OFF";
      }

      if (rawStatus === "OVERTIME") return "NORMAL";
      return rawStatus || "NORMAL";
    }

    function attendanceDisplayLabel(r) {
      const status = typeof r === "string"
        ? r
        : attendanceDisplayStatus(r);

      return ({
        ABSENCE:"ขาดงาน",
        LEAVE:"ลา",
        DAY_OFF:"วันหยุด",
        NORMAL:"ปกติ"
      })[status] || attendanceLabel(status);
    }

    const ATTENDANCE_OPTIONAL_COLUMNS = new Set([
      "zone",
      "sub_area",
      "template_code",
      "overtime_minutes",
      "waiting_minutes",
      "break_deducted_minutes",
      "late_minutes",
      "early_leave_minutes",
      "absence_minutes",
      "comp_off_balance"
    ]);

    function attendanceIsColumnVisible(key) {
      if (!ATTENDANCE_OPTIONAL_COLUMNS.has(key)) return true;
      return Boolean(
        document.querySelector(
          `[data-att-column-toggle="${key}"]`
        )?.checked
      );
    }

    function attendanceExportMatrix(rows) {
      const definitions = [
        ["work_date","วันที่",r => formatDate(r.work_date)],
        ["emp_code","รหัสพนักงาน",r => r.emp_code],
        ["full_name","ชื่อ-นามสกุล",r => r.full_name],
        ["department","หน่วยงาน",r => r.department],
        ["zone","พื้นที่",r => r.zone || r.area],
        ["sub_area","พื้นที่ย่อย",r => r.sub_area],
        ["pattern_code","รูปแบบงาน",r => r.pattern_code],
        ["template_code","Template",r => normalizeTemplateCodeV665(r.template_code)],
        ["day_type","ประเภทวัน",r => attendanceLabel(r.day_type)],
        ["shift_start","เวลาเริ่มกะ",r => formatTime(attendanceShiftTime(r,"start"))],
        ["shift_end","เวลาสิ้นสุดกะ",r => formatTime(attendanceShiftTime(r,"end"))],
        ["shift_code","กะ",r => attendanceShiftCode(r)],
        ["first_in","เวลาเข้า",r => formatTime(r.actual_in_at || r.first_in)],
        ["last_out","เวลาออก",r => formatTime(r.actual_out_at || r.last_out)],
        ["display_status","สถานะ",r => attendanceDisplayLabel(r)],
        ["net_work_minutes","ชั่วโมงสุทธิ",r => (Number(r.net_work_minutes || 0)/60).toFixed(2)],
        ["regular_minutes","ชั่วโมงปกติ",r => (Number(r.regular_minutes || 0)/60).toFixed(2)],
        ["overtime_minutes","OT",r => (Number(r.overtime_minutes || 0)/60).toFixed(2)],
        ["waiting_minutes","รอคอย",r => (Number(r.waiting_minutes || 0)/60).toFixed(2)],
        ["break_deducted_minutes","พัก",r => (Number(r.break_deducted_minutes || 0)/60).toFixed(2)],
        ["late_minutes","มาสาย(นาที)",r => Number(r.late_minutes || 0)],
        ["early_leave_minutes","กลับก่อน(นาที)",r => Number(r.early_leave_minutes || 0)],
        ["absence_minutes","ขาดงาน(นาที)",r => attendanceAbsenceMinutes(r)],
        ["comp_off_balance","วันหยุดชดเชยคงเหลือ",r => r.comp_off_balance ?? 0]
      ].filter(definition =>
        attendanceIsColumnVisible(definition[0])
      );

      return [
        definitions.map(definition => definition[1]),
        ...(rows || []).map(row =>
          definitions.map(definition => definition[2](row))
        )
      ];
    }

    function updateAssignConfirmHelp() {
      const confirmed = val("assignConfirm") === "true";
      setText("assignConfirmHelp", confirmed
        ? "ยืนยันกะทันที: บันทึกเป็นกะยืนยันแล้ว พร้อมผู้ยืนยันและวันเวลา ระบบแสดงเครื่องหมาย ✓"
        : "ยังไม่ยืนยัน: บันทึกเป็นกะร่างสถานะ ASSIGNED ยังแก้ไขได้ ภายใต้ระบบปัจจุบันกะนี้ถูกใช้เป็นกะทำงานทันทีเช่นกัน");
    }

    function showLoading(text = "กำลังประมวลผล...") { setText("loadingText", text); $("loadingOverlay").classList.remove("hidden"); }
    function hideLoading() { $("loadingOverlay").classList.add("hidden"); }
    function toast(message, type = "info") {
      const el = document.createElement("div");
      el.className = `toast ${type}`;
      el.textContent = message;
      $("toastStack").appendChild(el);
      setTimeout(() => el.remove(), 4500);
    }
    function openModal(id) { $(id).classList.remove("hidden"); }
    function closeModal(id) { $(id).classList.add("hidden"); }
    function getConfig() {
      try {
        const stored =
          JSON.parse(
            localStorage.getItem(
              APP_CONFIG_KEY
            ) || "null"
          );

        const config =
          getSupabaseConfigWithDefaults(
            stored || {}
          );

        if(
          !stored?.url
          || !stored?.key
        ) {
          localStorage.setItem(
            APP_CONFIG_KEY,
            JSON.stringify(
              config
            )
          );
        }

        return config;
      } catch {
        return {
          ...DEFAULT_SUPABASE_CONFIG
        };
      }
    }

    function saveConfig(url, key) {
      localStorage.setItem(
        APP_CONFIG_KEY,
        JSON.stringify({
          url:
            url.trim(),

          key:
            key.trim()
        })
      );
    }

    function initClient() {
      const cfg = getConfig();
      if (!cfg?.url || !cfg?.key) return false;
      if (!window.supabase?.createClient) throw new Error("ไม่สามารถโหลด Supabase JavaScript Client");
      state.client = window.supabase.createClient(cfg.url, cfg.key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      if (window.TimeClockSettings?.instrumentClient) window.TimeClockSettings.instrumentClient(state.client);
      state.client.auth.onAuthStateChange((event, session) => {
        state.session = session;
        state.user = session?.user || null;

        if (event === "SIGNED_OUT") {
          showLogin();
        }

        if (
          event === "PASSWORD_RECOVERY"
          && session
        ) {
          setTimeout(
            () => {
              showApp();

              window.TimeClockUserAccounts
                ?.openForcedPasswordChange?.(
                  "RECOVERY"
                );
            },
            50
          );
        }
      });
      return true;
    }

    function ensureSupabaseClient() {
      if(
        state.client?.auth
      ) {
        return state.client;
      }

      const initialized =
        initClient();

      if(
        !initialized
        || !state.client?.auth
      ) {
        throw new Error(
          "SUPABASE_CLIENT_NOT_READY"
        );
      }

      return state.client;
    }

    async function boot() {
      setDefaultDates();
      bindEvents();
      if ($("shiftRecalcStart")) setVal("shiftRecalcStart", firstDayOfMonth());
      if ($("shiftRecalcEnd")) setVal("shiftRecalcEnd", todayISO());
      const cfg = getConfig();
      if (cfg) { setVal("configUrl", cfg.url); setVal("configKey", cfg.key); }
      if (!initClient()) { openModal("configModal"); return; }
      const { data: { session }, error } = await state.client.auth.getSession();
      if (error) toast(error.message, "error");
      if (session) {
        state.session = session; state.user = session.user;
        await enterApp();
      } else showLogin();
    }

    function setDefaultDates() {
      const start = firstDayOfMonth();
      const end = todayISO();
      ["dashStart","attStart","reviewStart","leaveStart","correctionStart","exceptionStart"].forEach(id => setVal(id, start));
      ["dashEnd","attEnd","reviewEnd","leaveEnd","correctionEnd","exceptionEnd"].forEach(id => setVal(id, end));
      setVal("schedulePeriodStart", scheduleBlockStartForDate(todayISO()));
      syncSchedulePeriodUI();
    }

    function setLoginPasswordVisibility(visible) {
      const input = $("loginPassword");
      const button = $("loginPasswordToggle");

      if (!input || !button) return;

      input.type = visible ? "text" : "password";
      button.setAttribute(
        "aria-pressed",
        visible ? "true" : "false"
      );
      button.setAttribute(
        "aria-label",
        visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"
      );

      const text =
        button.querySelector(
          ".account-password-toggle-text"
        );
      const icon =
        button.querySelector(
          ".account-password-toggle-icon"
        );

      if (text) {
        text.textContent =
          visible ? "ซ่อน" : "แสดง";
      }

      if (icon) {
        icon.textContent =
          visible ? "◌" : "◉";
      }
    }

    function toggleLoginPasswordVisibility() {
      const input = $("loginPassword");
      if (!input) return;

      setLoginPasswordVisibility(
        input.type === "password"
      );
    }

    function showLogin() {
      $("appShell").classList.add("hidden");
      $("loginScreen").classList.remove("hidden");
      setLoginPasswordVisibility(false);
    }
    function showApp() { $("loginScreen").classList.add("hidden"); $("appShell").classList.remove("hidden"); }

    async function enterApp() {
      showLoading("กำลังโหลดสิทธิ์ผู้ใช้งาน...");
      try {
        await loadProfile();
        applyProfile();

        if (
          state.profile?.must_change_password
        ) {
          showApp();

          window.TimeClockUserAccounts
            ?.openForcedPasswordChange?.(
              "FIRST_LOGIN"
            );

          return;
        }

        showApp();
        await loadFilterOptions();
        await loadAttendanceFilterOptions(false);
        await loadDashboard();
      } catch (err) {
        toast(humanError(err), "error");
        showLogin();
      } finally {
        hideLoading();
      }
    }

    async function loadProfile() {
      const { data, error } = await state.client.from("ta_user_profiles").select("*").eq("user_id", state.user.id).maybeSingle();
      if (error) throw error;
      state.profile = data || { user_id: state.user.id, email: state.user.email, display_name: state.user.email, role: "VIEWER", is_active: false };
      state.profile.role = String(state.profile.role || "VIEWER").toUpperCase() === "USER" ? "MANAGER" : String(state.profile.role || "VIEWER").toUpperCase();
      if (!state.profile.is_active) throw new Error("บัญชีนี้ยังไม่ได้เปิดใช้งาน กรุณาติดต่อ HR Admin");
    }

    function applyProfile() {
      const p = state.profile;
      p._realRole = p._realRole || p.role || "VIEWER";
      const ui = window.TimeClockSettings?.getRuntimeSettings?.() || {};
      const canSimulate = p._realRole === "HR_ADMIN" && ui.developerMode === true;
      p.role = canSimulate ? (ui.viewAsRole || p._realRole) : p._realRole;
      const sidebarDisplayName =
        p.display_name
        || p.email
        || state.user.email
        || "User";

      setText(
        "sidebarUserName",
        sidebarDisplayName
      );
      setText(
        "sidebarUserEmail",
        p.email || state.user.email
      );
      setText(
        "sidebarUserAvatar",
        String(sidebarDisplayName)
          .trim()
          .charAt(0)
          .toUpperCase()
        || "U"
      );
      setText("roleBadge", p.role || "VIEWER");
      $("roleBadge").title = p.role !== p._realRole ? `สิทธิ์จริง ${p._realRole} • กำลังจำลอง ${p.role}` : `สิทธิ์จริง ${p._realRole}`;
      $("adminNavGroup").classList.toggle("hidden", p.role !== "HR_ADMIN" && p._realRole !== "HR_ADMIN");
      qsa("#adminNavGroup .nav-item:not(#systemSettingsNav)").forEach(el => el.classList.toggle("hidden", p.role !== "HR_ADMIN"));
      $("systemSettingsNav")?.classList.toggle("hidden", p._realRole !== "HR_ADMIN");
      window.TimeClockSettings?.syncProfile?.(p);
      document.dispatchEvent(new CustomEvent("timeclock:effective-role-changed", {
        detail: {
          effectiveRole: p.role || "VIEWER",
          realRole: p._realRole || p.role || "VIEWER"
        }
      }));
    }

    async function loadFilterOptions() {
      const {
        data,
        error
      } =
        await state.client.rpc(
          "ta_get_filter_options_v61022",
          {
            p_start_date:
              val("dashStart"),

            p_end_date:
              val("dashEnd")
          }
        );

      if(error) {
        if(
          window.TimeClockShiftAPI
            ?.missingFunction?.(
              error
            )
        ) {
          throw new Error(
            "SECURE_SCOPE_FILTER_RPC_REQUIRED: กรุณารัน SQL V6.10.29"
          );
        }

        throw error;
      }

      const f = data || {};
      let shiftRows = Array.isArray(f.shifts) ? f.shifts : [];
      const shiftResponse = await state.client.rpc("ta_get_shift_master_v651");
      if (!shiftResponse.error && Array.isArray(shiftResponse.data)) shiftRows = shiftResponse.data;
      state.filters = {
        zones: Array.isArray(f.zones) ? f.zones : [],
        departments: Array.isArray(f.departments) ? f.departments : [],
        employees: Array.isArray(f.employees) ? f.employees : [],
        shifts: shiftRows,
        attendance: state.filters.attendance || {
          areas: [],
          sub_areas: [],
          departments: [],
          employees: []
        }
      };
      ["dashZone","scheduleZone","reportZone"].forEach(id => fillSelect(id, state.filters.zones, "ทุกพื้นที่"));
      ["dashDepartment","scheduleDepartment","reportDepartment"].forEach(id => fillSelect(id, state.filters.departments, "ทุกหน่วยงาน"));
      fillShiftSelect();
      populateSharedEmployeeMasterList();
    }

    function populateSharedEmployeeMasterList() {
      const list =
        $("v650EmployeeList");

      if(!list) return;

      const rows =
        Array.isArray(
          state.filters.employees
        )
          ? state.filters.employees
          : [];

      const normalized =
        rows
          .map(item => {
            if(
              typeof item === "string"
            ) {
              return {
                emp_code: item,
                full_name: ""
              };
            }

            return {
              emp_code:
                item?.emp_code
                || item?.employee_id
                || item?.EmployeeId
                || item?.value
                || "",

              full_name:
                item?.full_name
                || item?.name
                || item?.label
                || ""
            };
          })
          .filter(
            item =>
              String(
                item.emp_code
                || ""
              ).trim()
          )
          .slice(
            0,
            5000
          );

      list.innerHTML =
        normalized
          .map(item =>
            `<option value="${safe(item.emp_code)}">${safe(item.full_name)}</option>`
          )
          .join("");
    }


    const attendanceEmployeeFilter = {
      options: [],
      selected: new Set(),
      search: "",
      page: 1,
      pageSize: 50,
      loading: false,
      loadedKey: null,
      cache: new Map()
    };

    function normalizeAttendanceEmployeeOption(item) {
      if (typeof item === "string") {
        return {
          emp_code: item.trim(),
          full_name: "",
          department: "",
          area: "",
          sub_area: ""
        };
      }

      return {
        emp_code: String(
          item?.emp_code
          || item?.employee_id
          || item?.EmployeeId
          || item?.value
          || ""
        ).trim(),
        full_name: String(
          item?.full_name
          || item?.employee_name
          || item?.name
          || item?.label
          || ""
        ).trim(),
        department: String(
          item?.department || ""
        ).trim(),
        area: String(
          item?.area
          || item?.zone
          || ""
        ).trim(),
        sub_area: String(
          item?.sub_area || ""
        ).trim()
      };
    }

    function attendanceEmployeeFilterKey() {
      return [
        val("attStart"),
        val("attEnd"),
        val("attZone"),
        val("attSubArea"),
        val("attDepartment")
      ].join("|");
    }

    function attendanceEmployeeFilteredOptions() {
      const term = attendanceEmployeeFilter.search
        .trim()
        .toLowerCase();

      if (!term) {
        return attendanceEmployeeFilter.options;
      }

      return attendanceEmployeeFilter.options.filter(
        employee =>
          `${employee.emp_code} ${employee.full_name}`
            .toLowerCase()
            .includes(term)
      );
    }

    function attendanceEmployeePageOptions() {
      const filtered =
        attendanceEmployeeFilteredOptions();
      const maxPage = Math.max(
        1,
        Math.ceil(
          filtered.length
          / attendanceEmployeeFilter.pageSize
        )
      );

      attendanceEmployeeFilter.page = Math.min(
        Math.max(1, attendanceEmployeeFilter.page),
        maxPage
      );

      const start =
        (attendanceEmployeeFilter.page - 1)
        * attendanceEmployeeFilter.pageSize;

      return {
        filtered,
        maxPage,
        rows: filtered.slice(
          start,
          start + attendanceEmployeeFilter.pageSize
        )
      };
    }

    function attendanceEmployeeCodesForQuery() {
      const selected = [
        ...attendanceEmployeeFilter.selected
      ];

      if (!selected.length) return null;

      if (
        attendanceEmployeeFilter.options.length
        && selected.length
          === attendanceEmployeeFilter.options.length
      ) {
        return null;
      }

      return selected;
    }

    function updateAttendanceEmployeeToggle() {
      const button = $("attEmployeeToggle");
      const text = $("attEmployeeToggleText");
      const count = $("attEmployeeSelectedCount");

      if (!button || !text || !count) return;

      const total =
        attendanceEmployeeFilter.options.length;
      const selected =
        attendanceEmployeeFilter.selected.size;

      if (attendanceEmployeeFilter.loading) {
        text.textContent = "กำลังโหลดรายชื่อ...";
        count.textContent = "";
        button.disabled = true;
        return;
      }

      button.disabled = false;

      if (!selected) {
        text.textContent = total
          ? `พนักงานทั้งหมด • ${total.toLocaleString("th-TH")} คน`
          : "ไม่พบพนักงาน";
        count.textContent = "ทั้งหมด";
      } else if (selected === total) {
        text.textContent =
          `เลือกทั้งหมด • ${selected.toLocaleString("th-TH")} คน`;
        count.textContent =
          selected.toLocaleString("th-TH");
      } else if (selected === 1) {
        const selectedCode =
          [...attendanceEmployeeFilter.selected][0];
        const selectedEmployee =
          attendanceEmployeeFilter.options.find(
            employee => employee.emp_code === selectedCode
          );

        text.textContent = selectedEmployee
          ? `${selectedEmployee.emp_code} • ${
              selectedEmployee.full_name
              || "ไม่พบชื่อพนักงาน"
            }`
          : `เลือกแล้ว 1 คน`;
        count.textContent = "1";
      } else {
        text.textContent =
          `เลือกแล้ว ${selected.toLocaleString("th-TH")} คน`;
        count.textContent =
          selected.toLocaleString("th-TH");
      }
    }

    function renderAttendanceEmployeeDropdown() {
      updateAttendanceEmployeeToggle();

      const list = $("attEmployeeList");
      if (!list) return;

      if (attendanceEmployeeFilter.loading) {
        list.innerHTML =
          `<div class="attendance-employee-empty">
            กำลังโหลดรายชื่อพนักงาน...
          </div>`;
        return;
      }

      const {
        filtered,
        maxPage,
        rows
      } = attendanceEmployeePageOptions();

      if (!rows.length) {
        list.innerHTML =
          `<div class="attendance-employee-empty">
            ไม่พบพนักงานที่ตรงกับคำค้นหา
          </div>`;
      } else {
        list.innerHTML = rows.map(employee => {
          const checked =
            attendanceEmployeeFilter.selected.has(
              employee.emp_code
            );

          return `
            <label
              class="attendance-employee-option"
              data-att-employee-option="${safe(employee.emp_code)}"
            >
              <input
                type="checkbox"
                value="${safe(employee.emp_code)}"
                ${checked ? "checked" : ""}
              />
              <span class="attendance-employee-name">
                <strong class="attendance-employee-primary">
                  <b>${safe(employee.emp_code)}</b>
                  <i>•</i>
                  <span>
                    ${safe(
                      employee.full_name
                      || "ไม่พบชื่อพนักงาน"
                    )}
                  </span>
                </strong>
                <small>
                  ${safe(
                    [
                      employee.department,
                      employee.area,
                      employee.sub_area
                    ].filter(Boolean).join(" • ")
                    || "-"
                  )}
                </small>
              </span>
            </label>
          `;
        }).join("");
      }

      setText(
        "attEmployeePageInfo",
        `หน้า ${attendanceEmployeeFilter.page
          .toLocaleString("th-TH")} / `
        + `${maxPage.toLocaleString("th-TH")} • `
        + `${filtered.length.toLocaleString("th-TH")} คน`
      );

      if ($("attEmployeePrev")) {
        $("attEmployeePrev").disabled =
          attendanceEmployeeFilter.page <= 1;
      }

      if ($("attEmployeeNext")) {
        $("attEmployeeNext").disabled =
          attendanceEmployeeFilter.page >= maxPage;
      }

      const pageCodes = rows.map(
        employee => employee.emp_code
      );
      const pageSelected = Boolean(
        pageCodes.length
        && pageCodes.every(code =>
          attendanceEmployeeFilter.selected.has(code)
        )
      );

      const filteredCodes = filtered.map(
        employee => employee.emp_code
      );
      const allFilteredSelected = Boolean(
        filteredCodes.length
        && filteredCodes.every(code =>
          attendanceEmployeeFilter.selected.has(code)
        )
      );

      setText(
        "attEmployeeSelectPage",
        pageSelected
          ? "ยกเลิกหน้ารายชื่อ"
          : "เลือกหน้ารายชื่อ"
      );
      setText(
        "attEmployeeSelectAll",
        allFilteredSelected
          ? "ยกเลิกทั้งหมดที่ค้นหา"
          : "เลือกทั้งหมด"
      );
    }

    function fallbackAttendanceEmployeeOptions() {
      const source = [
        ...(state.attendance || []),
        ...(state.filters.employees || [])
      ];

      const unique = new Map();

      source
        .map(normalizeAttendanceEmployeeOption)
        .filter(employee => employee.emp_code)
        .filter(employee =>
          !val("attZone")
          || employee.area === val("attZone")
        )
        .filter(employee =>
          !val("attSubArea")
          || employee.sub_area === val("attSubArea")
        )
        .filter(employee =>
          !val("attDepartment")
          || employee.department === val("attDepartment")
        )
        .forEach(employee => {
          const current = unique.get(employee.emp_code);

          if (
            !current
            || (
              !current.full_name
              && employee.full_name
            )
          ) {
            unique.set(employee.emp_code, employee);
          }
        });

      return [...unique.values()].sort(
        (a,b) =>
          a.emp_code.localeCompare(
            b.emp_code,
            "th",
            { numeric: true }
          )
      );
    }

    function invalidateAttendanceEmployeeOptions(
      preserveSelection = true
    ) {
      attendanceEmployeeFilter.loadedKey =
        null;

      attendanceEmployeeFilter.options =
        [];

      attendanceEmployeeFilter.search =
        "";

      attendanceEmployeeFilter.page =
        1;

      if(!preserveSelection) {
        attendanceEmployeeFilter.selected =
          new Set();
      }

      state.filters.attendance.employees =
        [];

      if($("attEmployeeSearch")) {
        $("attEmployeeSearch").value =
          "";
      }

      renderAttendanceEmployeeDropdown();
    }

    async function loadAttendanceEmployeeOptions(
      preserve = true,
      force = false
    ) {
      const previous = preserve
        ? new Set(attendanceEmployeeFilter.selected)
        : new Set();

      const cacheKey = attendanceEmployeeFilterKey();
      attendanceEmployeeFilter.loading = true;
      renderAttendanceEmployeeDropdown();

      try {
        let rows = null;

        if (
          !force
          && attendanceEmployeeFilter.cache.has(cacheKey)
        ) {
          rows =
            attendanceEmployeeFilter.cache.get(cacheKey);
        } else {
          const args = {
            p_start_date: val("attStart"),
            p_end_date: val("attEnd"),
            p_area: val("attZone") || null,
            p_sub_area: val("attSubArea") || null,
            p_department:
              val("attDepartment") || null,
            p_search: null,
            p_limit: 5000
          };

          let response =
            await state.client.rpc(
              "ta_get_attendance_employee_options_v61018",
              args
            );

          if(
            response.error
            && window.TimeClockShiftAPI
              ?.missingFunction?.(
                response.error
              )
          ) {
            response =
              await state.client.rpc(
                "ta_get_attendance_employee_options_v671",
                args
              );
          }

          if(response.error) {
            throw response.error;
          }

          rows = (response.data || [])
            .map(normalizeAttendanceEmployeeOption)
            .filter(employee => employee.emp_code);

          attendanceEmployeeFilter.cache.set(
            cacheKey,
            rows
          );

          if (
            attendanceEmployeeFilter.cache.size > 20
          ) {
            const firstKey =
              attendanceEmployeeFilter.cache.keys()
                .next().value;
            attendanceEmployeeFilter.cache.delete(firstKey);
          }
        }

        attendanceEmployeeFilter.options =
          rows;

        attendanceEmployeeFilter.loadedKey =
          cacheKey;
      } catch (error) {
        attendanceEmployeeFilter.options =
          fallbackAttendanceEmployeeOptions();

        const message =
          String(
            error?.message
            || humanError(error)
            || ""
          );

        const timeout =
          message.toLowerCase()
            .includes(
              "statement timeout"
            )
          || message.toLowerCase()
            .includes(
              "canceling statement"
            );

        if(timeout) {
          toast(
            "รายชื่อพนักงานใช้เวลาประมวลผลนาน ระบบใช้ข้อมูลที่โหลดได้อยู่ชั่วคราว กรุณารัน SQL V6.10.18",
            "warning"
          );
        } else if (
          !window.TimeClockShiftAPI
            ?.missingFunction?.(error)
        ) {
          toast(
            `โหลดรายชื่อพนักงานไม่สำเร็จ: `
            + `${humanError(error)}`,
            "error"
          );
        }
      } finally {
        const available = new Set(
          attendanceEmployeeFilter.options.map(
            employee => employee.emp_code
          )
        );

        attendanceEmployeeFilter.selected =
          new Set(
            [...previous].filter(code =>
              available.has(code)
            )
          );

        state.filters.attendance.employees =
          attendanceEmployeeFilter.options;

        attendanceEmployeeFilter.search = "";
        attendanceEmployeeFilter.page = 1;
        attendanceEmployeeFilter.loading = false;

        if ($("attEmployeeSearch")) {
          $("attEmployeeSearch").value = "";
        }

        renderAttendanceEmployeeDropdown();
      }
    }

    async function toggleAttendanceEmployeeDropdown(
      force
    ) {
      const dropdown =
        $("attEmployeeDropdown");

      const toggle =
        $("attEmployeeToggle");

      if(!dropdown || !toggle) {
        return;
      }

      const shouldOpen =
        force
        ?? dropdown.classList
          .contains(
            "hidden"
          );

      dropdown.classList.toggle(
        "hidden",
        !shouldOpen
      );

      toggle.setAttribute(
        "aria-expanded",
        shouldOpen ? "true" : "false"
      );

      if(!shouldOpen) {
        return;
      }

      const currentKey =
        attendanceEmployeeFilterKey();

      if(
        attendanceEmployeeFilter.loadedKey
          !== currentKey
        || !attendanceEmployeeFilter.options
          .length
      ) {
        await loadAttendanceEmployeeOptions(
          true
        );
      }

      window.setTimeout(
        () =>
          $("attEmployeeSearch")
            ?.focus(),
        30
      );
    }

    async function loadAttendanceFilterOptions(preserve = true) {
      const oldArea = preserve ? val("attZone") : "";
      const oldSubArea = preserve ? val("attSubArea") : "";
      const oldDepartment = preserve ? val("attDepartment") : "";
      try {
        const {
          data,
          error
        } =
          await state.client.rpc(
            "ta_get_attendance_filter_options_v61022",
            {
              p_start_date:
                val("attStart"),

              p_end_date:
                val("attEnd"),

              p_area:
                oldArea
                || null,

              p_sub_area:
                oldSubArea
                || null
            }
          );

        if(error) {
          if(
            window.TimeClockShiftAPI
              ?.missingFunction?.(
                error
              )
          ) {
            throw new Error(
              "SECURE_ATTENDANCE_FILTER_RPC_REQUIRED: กรุณารัน SQL V6.10.29"
            );
          }

          throw error;
        }
        const f = data || {};
        state.filters.attendance = {
          areas: Array.isArray(f.areas) ? f.areas : [],
          sub_areas: Array.isArray(f.sub_areas) ? f.sub_areas : [],
          departments: Array.isArray(f.departments) ? f.departments : [],
          employees:
            state.filters.attendance.employees || []
        };
        fillSearchableAttendanceFilter(
          "attZone",
          "attZoneOptions",
          state.filters.attendance.areas,
          "ทุกพื้นที่"
        );
        fillSearchableAttendanceFilter(
          "attSubArea",
          "attSubAreaOptions",
          state.filters.attendance.sub_areas,
          "ทุกพื้นที่ย่อย"
        );
        fillSearchableAttendanceFilter(
          "attDepartment",
          "attDepartmentOptions",
          state.filters.attendance.departments,
          "ทุกหน่วยงาน"
        );

        if (
          oldArea
          && attendanceFilterHasOption("attZone",oldArea)
        ) {
          setVal("attZone",oldArea);
        }
        if (
          oldSubArea
          && attendanceFilterHasOption(
            "attSubArea",
            oldSubArea
          )
        ) {
          setVal("attSubArea",oldSubArea);
        }
        if (
          oldDepartment
          && attendanceFilterHasOption(
            "attDepartment",
            oldDepartment
          )
        ) {
          setVal("attDepartment",oldDepartment);
        }
      } catch (err) {
        toast(`โหลดตัวกรองรายละเอียดเวลาไม่สำเร็จ: ${humanError(err)}`, "error");
      }

      invalidateAttendanceEmployeeOptions(
        preserve
      );
    }

    function fillSearchableAttendanceFilter(
      inputId,
      listId,
      values,
      placeholder
    ) {
      const input = $(inputId);
      const list = $(listId);
      if (!input || !list) return;

      const current = String(input.value || "").trim();
      const normalized = [
        ...new Set(
          (values || [])
            .map(value => String(value || "").trim())
            .filter(Boolean)
        )
      ].sort((a,b) =>
        a.localeCompare(b,"th",{numeric:true})
      );

      list.innerHTML = normalized
        .map(value => `<option value="${safe(value)}"></option>`)
        .join("");

      input.placeholder = placeholder;
      input.dataset.options = JSON.stringify(normalized);

      if (
        current
        && !normalized.includes(current)
      ) {
        input.value = "";
      }
    }

    function attendanceFilterHasOption(inputId,value) {
      if (!value) return true;
      const input = $(inputId);
      if (!input) return false;

      try {
        const values = JSON.parse(
          input.dataset.options || "[]"
        );
        return values.includes(value);
      } catch (_) {
        return false;
      }
    }

    async function selectAttendanceEmployees(
      codes,
      loadAfter = true
    ) {
      const requested = new Set(
        (codes || [])
          .map(code => String(code || "").trim())
          .filter(Boolean)
      );

      if (!attendanceEmployeeFilter.options.length) {
        await loadAttendanceEmployeeOptions(false);
      }

      const available = new Set(
        attendanceEmployeeFilter.options.map(
          employee => employee.emp_code
        )
      );

      attendanceEmployeeFilter.selected = new Set(
        [...requested].filter(code => available.has(code))
      );

      renderAttendanceEmployeeDropdown();

      if (loadAfter) {
        await loadAttendance();
      }
    }

    function fillSelect(id, values, allLabel) {
      const el = $(id); if (!el) return;
      const old = el.value;
      el.innerHTML = `<option value="">${safe(allLabel)}</option>` + values.map(v => `<option value="${safe(v)}">${safe(v)}</option>`).join("");
      if ([...el.options].some(o => o.value === old)) el.value = old;
    }

    function scheduleRowPattern(row) {
      const code = String(
        row?.pattern_code
        || row?.resolved_pattern_code
        || ""
      ).trim().toUpperCase();

      return ["TECH_5D","TECH_6D"].includes(code)
        ? code
        : "UNASSIGNED";
    }

    function schedulePatternShort(patternCode) {
      return patternCode === "TECH_5D"
        ? "5D"
        : patternCode === "TECH_6D"
          ? "6D"
          : "?";
    }

    function schedulePatternLabel(patternCode) {
      return patternCode === "TECH_5D"
        ? "5 วัน/สัปดาห์"
        : patternCode === "TECH_6D"
          ? "6 วัน/สัปดาห์"
          : "ยังไม่ได้กำหนด";
    }

    function scheduleFilteredRows(rows = state.schedule) {
      const filter = val("schedulePatternFilter");
      const term = val("scheduleSearch").trim().toLowerCase();

      return (rows || []).filter(row => {
        const pattern = scheduleRowPattern(row);
        if (filter && pattern !== filter) return false;
        if (
          term
          && !`${row.emp_code || ""} ${row.full_name || ""}`
            .toLowerCase()
            .includes(term)
        ) return false;
        return true;
      });
    }

    function updateSchedulePatternSummary(rows = state.schedule) {
      const employeePatterns = new Map();

      (rows || []).forEach(row => {
        const emp = String(row.emp_code || "");
        if (!emp) return;
        const pattern = scheduleRowPattern(row);
        if (
          !employeePatterns.has(emp)
          || employeePatterns.get(emp) === "UNASSIGNED"
        ) {
          employeePatterns.set(emp, pattern);
        }
      });

      const counts = {
        ALL: employeePatterns.size,
        TECH_5D: 0,
        TECH_6D: 0,
        UNASSIGNED: 0
      };

      employeePatterns.forEach(pattern => {
        counts[pattern] = (counts[pattern] || 0) + 1;
      });

      setText("schedulePatternAllCount", formatNumber(counts.ALL));
      setText("schedulePattern5Count", formatNumber(counts.TECH_5D));
      setText("schedulePattern6Count", formatNumber(counts.TECH_6D));
      setText(
        "schedulePatternUnknownCount",
        formatNumber(counts.UNASSIGNED)
      );

      const current = val("schedulePatternFilter");
      qsa("[data-schedule-pattern-chip]").forEach(button => {
        button.classList.toggle(
          "active",
          String(button.dataset.schedulePatternChip || "") === current
        );
      });
    }

    window.TimeClockSchedulePattern = Object.freeze({
      rowPattern: scheduleRowPattern,
      filteredRows: scheduleFilteredRows,
      updateSummary: updateSchedulePatternSummary
    });
    const SHIFT_PATTERN_META = {
      TECH_6D: { label: "6 วัน/สัปดาห์", short: "6 วัน", total: 540, net: 480, breakMinutes: 60, start: "08:30", end: "17:30" },
      TECH_5D: { label: "5 วัน/สัปดาห์", short: "5 วัน", total: 570, net: 510, breakMinutes: 60, start: "08:30", end: "18:00" }
    };

    function shiftPatternCodes(shift) {
      const values = Array.isArray(shift?.applicable_pattern_codes)
        ? shift.applicable_pattern_codes
        : ["TECH_5D","TECH_6D"];
      return values.map(x => String(x || "").trim().toUpperCase()).filter(Boolean);
    }

    function shiftDefaultPatternCodes(shift) {
      return (Array.isArray(shift?.default_pattern_codes) ? shift.default_pattern_codes : [])
        .map(x => String(x || "").trim().toUpperCase()).filter(Boolean);
    }

    function selectedShiftPatternCodes() {
      return [
        $("smPattern6")?.checked ? "TECH_6D" : null,
        $("smPattern5")?.checked ? "TECH_5D" : null
      ].filter(Boolean);
    }

    function selectedShiftDefaultCodes() {
      return [
        $("smDefault6")?.checked ? "TECH_6D" : null,
        $("smDefault5")?.checked ? "TECH_5D" : null
      ].filter(Boolean);
    }

    function shiftDurationMinutes(start, end) {
      if (!start || !end) return 0;
      const [sh,sm] = String(start).slice(0,5).split(":").map(Number);
      const [eh,em] = String(end).slice(0,5).split(":").map(Number);
      if (![sh,sm,eh,em].every(Number.isFinite)) return 0;
      let minutes = (eh * 60 + em) - (sh * 60 + sm);
      if (minutes <= 0) minutes += 1440;
      return minutes;
    }

    function updateShiftDurationSummary() {
      const target = $("smDurationSummary");
      if (!target) return;
      const workday = $("smWorkday")?.checked !== false;
      const total = workday ? shiftDurationMinutes(val("smStart"), val("smEnd")) : 0;
      const breakMinutes = workday ? Math.max(0, Number(val("smBreak") || 0)) : 0;
      const net = Math.max(0, total - breakMinutes);
      const patterns = selectedShiftPatternCodes();
      const matches = patterns.filter(code => {
        const meta = SHIFT_PATTERN_META[code];
        return meta && total === meta.total && net === meta.net && breakMinutes === meta.breakMinutes;
      });
      const defaultCodes = selectedShiftDefaultCodes();
      const defaultValid = defaultCodes.every(code => matches.includes(code));
      const statusClass = !workday || !patterns.length ? "neutral" : matches.length ? (defaultValid ? "ok" : "warn") : "warn";
      const statusText = !workday
        ? "กะวันหยุดไม่คำนวณชั่วโมง"
        : !patterns.length
          ? "กรุณาเลือกรูปแบบการทำงาน"
          : matches.length
            ? `ตรงมาตรฐาน ${matches.map(x => SHIFT_PATTERN_META[x]?.short || x).join(", ")}`
            : "เป็นกะแบบกำหนดเอง ไม่ตรงมาตรฐานกะตั้งต้น";
      target.innerHTML = `
        <article class="${statusClass}"><span>ระยะเวลารวมพัก</span><strong>${minutesToHours(total)}</strong><small>${formatNumber(total)} นาที</small></article>
        <article class="${statusClass}"><span>ชั่วโมงทำงานสุทธิ</span><strong>${minutesToHours(net)}</strong><small>หักพัก ${formatNumber(breakMinutes)} นาที</small></article>
        <article class="${statusClass}"><span>ผลตรวจรูปแบบ</span><strong>${safe(statusText)}</strong><small>${defaultValid ? "พร้อมบันทึกเป็นกะตั้งต้น" : "กะตั้งต้นต้องตรงชั่วโมงมาตรฐาน"}</small></article>`;
      if ($("smDefault6")) $("smDefault6").disabled = !workday || !$("smPattern6")?.checked || !(total === 540 && net === 480 && breakMinutes === 60);
      if ($("smDefault5")) $("smDefault5").disabled = !workday || !$("smPattern5")?.checked || !(total === 570 && net === 510 && breakMinutes === 60);
      if ($("smDefault6")?.disabled) $("smDefault6").checked = false;
      if ($("smDefault5")?.disabled) $("smDefault5").checked = false;
    }

    function applyShiftPatternPreset(patternCode, force = false) {
      const meta = SHIFT_PATTERN_META[patternCode];
      if (!meta || !$("smWorkday")?.checked) return;
      const startEmpty = !val("smStart");
      const endEmpty = !val("smEnd");
      if (force || startEmpty) setVal("smStart", meta.start);
      if (force || endEmpty) setVal("smEnd", meta.end);
      if (force || !val("smBreak")) setVal("smBreak", meta.breakMinutes);
      updateShiftDurationSummary();
    }


    function resetNewShiftForm() {
      ["smCode","smName","smNote"].forEach(id => setVal(id,""));
      setVal("smStart","08:30");
      setVal("smEnd","17:30");
      setVal("smBreak",60);
      setVal("smOrder",0);
      setVal("smActive","true");
      $("smWorkday").checked = true;
      $("smNight").checked = false;
      $("smPattern6").checked = true;
      $("smPattern5").checked = false;
      $("smDefault6").checked = false;
      $("smDefault5").checked = false;
      $("smCode").disabled = false;
      updateShiftDurationSummary();
      openModal("shiftMasterModal");
    }

    function handleShiftPatternSelection(patternCode) {
      const patterns = selectedShiftPatternCodes();
      if (!patterns.length) {
        if (patternCode === "TECH_5D") $("smPattern6").checked = true;
        else $("smPattern5").checked = true;
      }
      const selected = selectedShiftPatternCodes();
      if (selected.length === 1 && selected[0] === patternCode) {
        applyShiftPatternPreset(patternCode, true);
      } else {
        updateShiftDurationSummary();
      }
    }

    const SHIFT_RECALC_JOB_KEY = "timeclock.shiftRecalcJob.v654";

    function renderShiftRecalcProgress(job, label = "") {
      const box = $("shiftRecalcProgress");
      if (!box || !job) return;

      box.classList.remove("hidden");

      const totalDays = Number(job.total_days || 0);
      const completedDays = Number(job.completed_days || 0);
      const percent = Math.max(
        0,
        Math.min(
          100,
          Number(job.progress_percent ?? (
            totalDays ? completedDays * 100 / totalDays : 0
          ))
        )
      );

      const currentDate = job.current_work_date
        ? formatDate(job.current_work_date)
        : "-";

      setText(
        "shiftRecalcProgressTitle",
        `${label || job.pattern_code || "รูปแบบการทำงาน"} • ${job.status || "QUEUED"}`
      );
      setText(
        "shiftRecalcProgressPercent",
        `${percent.toLocaleString("th-TH", {maximumFractionDigits:1})}%`
      );

      const bar = $("shiftRecalcProgressBar");
      if (bar) bar.style.width = `${percent}%`;

      const detail = [
        `วันที่เสร็จ ${formatNumber(completedDays)}/${formatNumber(totalDays)}`,
        `กำลังตรวจวันที่ ${currentDate}`,
        `ประมวลผลพนักงาน ${formatNumber(job.processed_employees || 0)} รายการ`,
        `จำนวนชุด ${formatNumber(job.processed_batches || 0)}`,
        `ขนาดชุด ${formatNumber(job.batch_size || 0)} คน`
      ];

      if (job.last_error) {
        detail.push(`ระบบปรับชุดอัตโนมัติ: ${job.last_error}`);
      }

      setText("shiftRecalcProgressDetail", detail.join(" • "));
    }

    async function runShiftRecalcJob(initialJob, label) {
      let job = initialJob;
      let guard = 0;
      const doneStatuses = new Set([
        "COMPLETED",
        "COMPLETED_WITH_ERRORS",
        "FAILED",
        "CANCELLED"
      ]);

      localStorage.setItem(
        SHIFT_RECALC_JOB_KEY,
        JSON.stringify({
          jobId: job.job_id,
          patternCode: job.pattern_code,
          startDate: job.start_date,
          endDate: job.end_date
        })
      );

      renderShiftRecalcProgress(job, label);

      while (!doneStatuses.has(String(job.status || "").toUpperCase())) {
        guard += 1;
        if (guard > 200000) {
          throw new Error("JOB_LOOP_GUARD_EXCEEDED");
        }

        const progressText = Number(job.total_days || 0)
          ? `${formatNumber(job.completed_days || 0)}/${formatNumber(job.total_days)} วัน`
          : "กำลังเตรียมข้อมูล";

        showLoading(
          `กำลังคำนวณ ${label} • ${progressText} • ${formatNumber(job.processed_employees || 0)} รายการ`
        );

        const { data, error } = await state.client.rpc(
          "ta_process_work_pattern_recalc_step_v654",
          { p_job_id: job.job_id }
        );

        if (error) throw error;
        job = data || job;
        renderShiftRecalcProgress(job, label);

        await new Promise(resolve => setTimeout(resolve, 35));
      }

      localStorage.removeItem(SHIFT_RECALC_JOB_KEY);

      const status = String(job.status || "").toUpperCase();
      if (status === "FAILED") {
        throw new Error(job.last_error || "WORK_PATTERN_RECALCULATION_FAILED");
      }
      if (status === "CANCELLED") {
        throw new Error("WORK_PATTERN_RECALCULATION_CANCELLED");
      }

      if (status === "COMPLETED_WITH_ERRORS") {
        toast(
          `คำนวณ ${label} เสร็จแล้ว แต่มี ${formatNumber(job.error_count || 0)} ครั้งที่ระบบลดขนาดชุด`,
          "info"
        );
      } else {
        toast(
          `คำนวณ ${label} เรียบร้อย • ${formatNumber(job.processed_employees || 0)} รายการ`,
          "success"
        );
      }

      if (state.currentPage === "schedule") await loadSchedule();
      if (state.attendance.length) await loadAttendance();
      return job;
    }

    async function recalculateShiftPattern() {
      const patternCode = val("shiftRecalcPattern");
      const startDate = val("shiftRecalcStart");
      const endDate = val("shiftRecalcEnd");

      if (!patternCode || !startDate || !endDate) {
        toast("กรุณาเลือกรูปแบบและช่วงวันที่ให้ครบ", "error");
        return;
      }
      if (startDate > endDate) {
        toast("วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด", "error");
        return;
      }

      const label = SHIFT_PATTERN_META[patternCode]?.label || patternCode;

      if (!confirm(
        `ยืนยันคำนวณผลใหม่สำหรับ ${label} ช่วง ${formatDate(startDate)}–${formatDate(endDate)}?\n\nระบบจะแบ่งประมวลผลเป็นชุดเล็กเพื่อป้องกัน Timeout`
      )) return;

      const button = $("shiftRecalcBtn");
      if (button) {
        button.disabled = true;
        button.textContent = "กำลังคำนวณ...";
      }

      showLoading("กำลังสร้าง Job คำนวณย้อนหลัง...");

      try {
        const { data, error } = await state.client.rpc(
          "ta_create_work_pattern_recalc_job_v654",
          {
            p_pattern_code: patternCode,
            p_start_date: startDate,
            p_end_date: endDate,
            p_batch_size: 25
          }
        );

        if (error) throw error;
        await runShiftRecalcJob(data, label);
      } catch (err) {
        toast(humanError(err), "error");
      } finally {
        if (button) {
          button.disabled = false;
          button.textContent = "คำนวณผลใหม่";
        }
        hideLoading();
      }
    }

    function fillShiftSelect(patternCode = null, selectedValue = null) {
      const select = $("assignShiftCode");
      if (!select) return;
      const old = selectedValue || select.value;
      const active = state.filters.shifts.filter(s => {
        if (s.is_active === false) return false;
        if (!patternCode || s.is_workday === false) return true;
        return shiftPatternCodes(s).includes(patternCode);
      });
      select.innerHTML = active.map(s => {
        const patterns = shiftPatternCodes(s).map(code => SHIFT_PATTERN_META[code]?.short || code).join("/");
        const defaultText = shiftDefaultPatternCodes(s).includes(patternCode) ? " • กะตั้งต้น" : "";
        return `<option value="${safe(s.shift_code)}">${safe(s.shift_code)} — ${safe(s.shift_name || "")}${patterns ? ` (${safe(patterns)})` : ""}${defaultText}</option>`;
      }).join("");
      if ([...select.options].some(o => o.value === old)) select.value = old;
      else {
        const defaultShift = active.find(s => shiftDefaultPatternCodes(s).includes(patternCode));
        if (defaultShift) select.value = defaultShift.shift_code;
      }
    }

    function renderShiftPatternSummary() {
      const wrap = $("shiftPatternSummary");
      if (!wrap) return;
      const patterns = ["TECH_6D","TECH_5D"];
      wrap.innerHTML = patterns.map(code => {
        const meta = SHIFT_PATTERN_META[code];
        const shift = state.filters.shifts.find(s => shiftDefaultPatternCodes(s).includes(code));
        const cardClass = code === "TECH_5D" ? "pattern-5" : "pattern-6";
        return `<article class="shift-pattern-card ${cardClass}">
          <div class="shift-pattern-card-head"><div><span>${safe(meta.label)}</span><strong>${safe(shift?.shift_name || "ยังไม่ได้กำหนดกะตั้งต้น")}</strong></div><em class="shift-pattern-card-code">${safe(shift?.shift_code || "-")}</em></div>
          <div class="shift-pattern-card-metrics">
            <div><small>เวลา</small><b>${shift ? `${formatTime(shift.start_time)}–${formatTime(shift.end_time)}` : "-"}</b></div>
            <div><small>รวมพัก</small><b>${minutesToHours(shift?.scheduled_minutes_including_break ?? meta.total)}</b></div>
            <div><small>สุทธิ</small><b>${minutesToHours(shift?.standard_work_minutes ?? meta.net)}</b></div>
          </div>
        </article>`;
      }).join("");
    }

    function renderShiftMasterTable() {
      const filterPattern = val("shiftPatternFilter");
      const rows = (state.filters.shifts || []).filter(s => !filterPattern || shiftPatternCodes(s).includes(filterPattern));
      $("shiftMasterBody").innerHTML = rows.length ? rows.map(s => {
        const patterns = shiftPatternCodes(s);
        const defaults = shiftDefaultPatternCodes(s);
        const patternBadges = patterns.map(code => `<span class="shift-pattern-badge ${code === "TECH_5D" ? "p5" : "p6"}">${safe(SHIFT_PATTERN_META[code]?.short || code)}</span>`).join("");
        const defaultBadges = defaults.length
          ? defaults.map(code => `<span class="shift-default-badge">${safe(SHIFT_PATTERN_META[code]?.short || code)}</span>`).join("")
          : '<span class="muted">-</span>';
        const total = Number(s.scheduled_minutes_including_break ?? shiftDurationMinutes(s.start_time,s.end_time));
        const net = Number(s.standard_work_minutes ?? Math.max(0,total-Number(s.break_minutes||0)));
        const custom = s.duration_status === "CUSTOM" ? '<span class="shift-custom-badge">กำหนดเอง</span>' : "";
        return `<tr>
          <td><strong>${safe(s.shift_code)}</strong></td>
          <td>${safe(s.shift_name)}</td>
          <td><div class="shift-pattern-badges">${patternBadges}</div></td>
          <td>${formatTime(s.start_time)}</td>
          <td>${formatTime(s.end_time)}</td>
          <td>${s.is_workday === false ? "-" : minutesToHours(total)}</td>
          <td>${s.is_workday === false ? "-" : minutesToHours(net)} ${custom}</td>
          <td>${formatNumber(s.break_minutes)} นาที</td>
          <td><div class="shift-default-badges">${defaultBadges}</div></td>
          <td>${s.is_workday ? (s.is_night_shift ? badge("กะกลางคืน","badge-blue") : badge("กะกลางวัน","badge-blue")) : badge("วันหยุด","badge-gray")}</td>
          <td>${s.is_active ? badge("ใช้งาน","badge-green") : badge("ปิดใช้งาน","badge-red")}</td>
          <td><button class="btn btn-soft" data-edit-shift="${safe(s.shift_code)}">แก้ไข</button></td>
        </tr>`;
      }).join("") : emptyRow(12);
      renderShiftPatternSummary();
    }

    async function loadDashboard() {
      showLoading("กำลังโหลด Dashboard...");
      try {
        const args = {
          p_start_date: val("dashStart"), p_end_date: val("dashEnd"), p_zone: val("dashZone") || null, p_department: val("dashDepartment") || null
        };
        let response = await state.client.rpc("ta_get_dashboard_overview_v650", args);
        if (response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
          response = await state.client.rpc("ta_get_dashboard_overview_v640", args);
        }
        if (response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
          response = await state.client.rpc("ta_get_dashboard_overview", args);
        }
        if (response.error) throw response.error;
        const data = response.data;
        state.dashboard = Array.isArray(data) ? data[0] : data;
        renderDashboard(state.dashboard || {});
      } catch (err) { toast(humanError(err), "error"); }
      finally { hideLoading(); }
    }

    function renderDashboard(d) {
      const cards = [
        ["พนักงาน", d.total_employees, "คนในขอบเขตข้อมูล", "♙", ""],
        ["รายการทั้งหมด", d.total_rows, "วัน-พนักงาน", "▦", ""],
        ["ลงเวลาครบ", d.complete_time_rows, "มีเวลาเข้าและออก", "✓", "green"],
        ["เวลาไม่ครบ", Number(d.missing_in_rows||0)+Number(d.missing_out_rows||0), "ขาดเวลาเข้าหรือออก", "!", "orange"],
        ["ไม่พบเวลา", d.absent_rows ?? d.no_time_rows, "วันทำงานที่ไม่มีเวลา", "×", "red"],
        ["ชั่วโมงสุทธิ", Number(d.paid_work_hours||0), "ชั่วโมงหลังหักพัก/รอคอย", "◷", "blue"],
        ["ชั่วโมงปกติ", Number(d.regular_hours||0), "ชั่วโมงปกติรวม", "◉", "green"],
        ["OT", Number(d.overtime_hours||0), `${formatNumber(d.overtime_rows||0)} รายการ`, "＋", "orange"],
        ["ช่วงรอคอย", Number(d.waiting_hours||0), "ไม่นำไปคำนวณ OT", "⌛", ""],
        ["ทำงานวันหยุด", Number(d.offday_work_hours||0), "ชั่วโมงวันหยุด", "◆", "blue"],
        ["วันหยุดชดเชย", d.comp_off_earned_rows||0, "สิทธิ์ที่ได้รับจากการทำงานวันหยุด", "↺", "green"]
      ];
      $("dashboardKpis").innerHTML = cards.map(c => `<div class="panel kpi-card ${c[4]}"><div class="kpi-label">${safe(c[0])}</div><div class="kpi-value">${formatNumber(c[1])}</div><div class="kpi-sub">${safe(c[2])}</div><div class="kpi-icon">${c[3]}</div></div>`).join("");
      const bars = [
        ["ลงเวลาครบ", d.complete_time_rows, "green"],
        ["ไม่พบเวลาเข้า", d.missing_in_rows, "orange"],
        ["ไม่พบเวลาออก", d.missing_out_rows, "orange"],
        ["ทำงานในวันหยุด", d.worked_on_offday_rows, "blue"]
      ];
      const max = Math.max(1, ...bars.map(x => Number(x[1]||0)));
      $("dashboardBars").innerHTML = bars.map(x => `<div class="status-row"><span>${safe(x[0])}</span><div class="bar-track"><div class="bar-fill ${x[2]}" style="width:${Math.max(2, Number(x[1]||0)/max*100)}%"></div></div><strong class="text-right">${formatNumber(x[1])}</strong></div>`).join("");
      $("dashboardQuick").innerHTML = [
        ["ขาดเวลาเข้า", d.missing_in_rows, "attendance"],
        ["ขาดเวลาออก", d.missing_out_rows, "attendance"],
        ["กะที่ยืนยันแล้ว", d.confirmed_rows, "schedule"]
      ].map(x => `<button class="quick-item" data-go-page="${x[2]}"><div><strong>${safe(x[0])}</strong><span> คลิกเพื่อดูรายละเอียด</span></div><span class="badge badge-blue">${formatNumber(x[1])}</span></button>`).join("");
    }

    let attendanceLoadRequestId = 0;

    function attendanceParseDate(
      value
    ) {
      const match =
        String(value || "")
          .match(
            /^(\d{4})-(\d{2})-(\d{2})$/
          );

      if(!match) return null;

      return new Date(
        Date.UTC(
          Number(match[1]),
          Number(match[2]) - 1,
          Number(match[3])
        )
      );
    }

    function attendanceFormatDate(
      date
    ) {
      return date
        .toISOString()
        .slice(0,10);
    }

    function attendanceChunkRanges(
      startValue,
      endValue,
      chunkDays = 14
    ) {
      let start =
        attendanceParseDate(
          startValue
        );

      let end =
        attendanceParseDate(
          endValue
        );

      if(
        !start
        || !end
      ) {
        return [{
          start:
            startValue,
          end:
            endValue
        }];
      }

      if(start > end) {
        [start,end] =
          [end,start];
      }

      const ranges = [];
      let cursor =
        new Date(
          end.getTime()
        );

      while(
        cursor >= start
      ) {
        const chunkEnd =
          new Date(
            cursor.getTime()
          );

        let chunkStart =
          new Date(
            cursor.getTime()
          );

        chunkStart.setUTCDate(
          chunkStart.getUTCDate()
          - (
              Math.max(
                1,
                chunkDays
              )
              - 1
            )
        );

        if(
          chunkStart < start
        ) {
          chunkStart =
            new Date(
              start.getTime()
            );
        }

        ranges.push({
          start:
            attendanceFormatDate(
              chunkStart
            ),

          end:
            attendanceFormatDate(
              chunkEnd
            )
        });

        cursor =
          new Date(
            chunkStart.getTime()
          );

        cursor.setUTCDate(
          cursor.getUTCDate()
          - 1
        );
      }

      return ranges;
    }

    function attendanceIsTimeout(
      error
    ) {
      const message =
        String(
          error?.message
          || error
          || ""
        )
          .toLowerCase();

      return (
        message.includes(
          "statement timeout"
        )
        || message.includes(
          "canceling statement"
        )
      );
    }

    async function fetchAttendanceChunk(
      range,
      requestEmployeeCodes,
      statuses,
      depth = 0
    ) {
      const newArgs = {
        p_start_date:
          range.start,

        p_end_date:
          range.end,

        p_area:
          val("attZone")
          || null,

        p_sub_area:
          val("attSubArea")
          || null,

        p_department:
          val("attDepartment")
          || null,

        p_emp_codes:
          requestEmployeeCodes,

        p_attendance_statuses:
          statuses,

        p_schedule_statuses:
          null,

        p_limit:
          5000
      };

      let response =
        await state.client.rpc(
          "ta_get_attendance_detail_v61020",
          newArgs
        );

      let source =
        "V6.10.20";

      let serverStatusFilter =
        true;

      let serverSubAreaFilter =
        true;

      if(
        response.error
        && window.TimeClockShiftAPI
          ?.missingFunction?.(
            response.error
          )
      ) {
        const legacyArgs = {
          p_start_date:
            range.start,

          p_end_date:
            range.end,

          p_zone:
            val("attZone")
            || null,

          p_department:
            val("attDepartment")
            || null,

          p_emp_codes:
            requestEmployeeCodes,

          p_attendance_statuses:
            statuses,

          p_schedule_statuses:
            null,

          p_limit:
            5000
        };

        response =
          await state.client.rpc(
            "ta_get_attendance_detail_v664",
            legacyArgs
          );

        source =
          "V6.6.4";

        serverSubAreaFilter =
          false;
      }

      if(
        response.error
        && window.TimeClockShiftAPI
          ?.missingFunction?.(
            response.error
          )
      ) {
        response =
          await state.client.rpc(
            "ta_get_attendance_detail_v640",
            {
              p_start_date:
                range.start,

              p_end_date:
                range.end,

              p_zone:
                val("attZone")
                || null,

              p_department:
                val("attDepartment")
                || null,

              p_emp_codes:
                requestEmployeeCodes,

              p_attendance_statuses:
                null,

              p_schedule_statuses:
                null,

              p_limit:
                5000
            }
          );

        source =
          "V6.4.0";

        serverStatusFilter =
          false;

        serverSubAreaFilter =
          false;
      }

      if(
        response.error
        && window.TimeClockShiftAPI
          ?.missingFunction?.(
            response.error
          )
      ) {
        response =
          await state.client.rpc(
            "ta_get_attendance_detail_v619",
            {
              p_start_date:
                range.start,

              p_end_date:
                range.end,

              p_area:
                val("attZone")
                || null,

              p_sub_area:
                val("attSubArea")
                || null,

              p_department:
                val("attDepartment")
                || null,

              p_emp_codes:
                requestEmployeeCodes,

              p_attendance_statuses:
                null,

              p_schedule_statuses:
                null,

              p_limit:
                5000
            }
          );

        source =
          "V6.1.9";

        serverStatusFilter =
          false;

        serverSubAreaFilter =
          true;
      }

      if(
        response.error
        && attendanceIsTimeout(
          response.error
        )
        && depth < 4
      ) {
        const start =
          attendanceParseDate(
            range.start
          );

        const end =
          attendanceParseDate(
            range.end
          );

        const diffDays =
          start && end
            ? Math.floor(
                (
                  end.getTime()
                  - start.getTime()
                )
                / 86400000
              )
              + 1
            : 0;

        if(
          diffDays > 1
        ) {
          const half =
            Math.ceil(
              diffDays / 2
            );

          const newerStart =
            new Date(
              end.getTime()
            );

          newerStart.setUTCDate(
            newerStart.getUTCDate()
            - half
            + 1
          );

          const olderEnd =
            new Date(
              newerStart.getTime()
            );

          olderEnd.setUTCDate(
            olderEnd.getUTCDate()
            - 1
          );

          const newer =
            await fetchAttendanceChunk(
              {
                start:
                  attendanceFormatDate(
                    newerStart
                  ),

                end:
                  attendanceFormatDate(
                    end
                  )
              },
              requestEmployeeCodes,
              statuses,
              depth + 1
            );

          const older =
            olderEnd >= start
              ? await fetchAttendanceChunk(
                  {
                    start:
                      attendanceFormatDate(
                        start
                      ),

                    end:
                      attendanceFormatDate(
                        olderEnd
                      )
                  },
                  requestEmployeeCodes,
                  statuses,
                  depth + 1
                )
              : [];

          return [
            ...newer,
            ...older
          ];
        }
      }

      if(
        response.error
      ) {
        throw response.error;
      }

      let rows =
        Array.isArray(
          response.data
        )
          ? response.data
          : [];

      if(
        !serverSubAreaFilter
        && val("attSubArea")
      ) {
        const selected =
          val("attSubArea");

        rows =
          rows.filter(
            row =>
              String(
                row.sub_area
                || ""
              ) === selected
          );
      }

      rows =
        rows.map(row => {
          const enriched = {
            ...row
          };

          enriched.absence_minutes =
            attendanceAbsenceMinutes(
              enriched
            );

          enriched.display_status =
            attendanceDisplayStatus(
              enriched
            );

          if(
            !enriched.absence_reason
            && enriched.absence_minutes > 0
          ) {
            const hasIn =
              Boolean(
                enriched.actual_in_at
                || enriched.first_in
              );

            const hasOut =
              Boolean(
                enriched.actual_out_at
                || enriched.last_out
              );

            enriched.absence_reason =
              !hasIn && !hasOut
                ? "MISSING_BOTH"
                : !hasIn
                  ? "MISSING_IN"
                  : "MISSING_OUT";
          }

          enriched._attendance_source =
            source;

          return enriched;
        });

      if(
        !serverStatusFilter
        && statuses?.length
      ) {
        const wanted =
          new Set(
            statuses.map(
              status =>
                String(status)
                  .toUpperCase()
            )
          );

        rows =
          rows.filter(row =>
            wanted.has(
              attendanceDisplayStatus(
                row
              )
            )
            || wanted.has(
              String(
                row.calculation_status
                || row.attendance_result
                || row.attendance_status
                || ""
              )
                .toUpperCase()
            )
          );
      }

      return rows;
    }

    async function loadAttendance() {
      const requestId =
        ++attendanceLoadRequestId;

      showLoading(
        "กำลังค้นหารายละเอียดเวลา..."
      );

      try {
        const statuses =
          val("attStatus")
            ? [
                val(
                  "attStatus"
                )
              ]
            : null;

        const requestEmployeeCodes =
          attendanceEmployeeCodesForQuery();

        const ranges =
          attendanceChunkRanges(
            val("attStart"),
            val("attEnd"),
            14
          );

        const collected = [];

        for(
          let index = 0;
          index < ranges.length;
          index += 1
        ) {
          if(
            requestId
            !== attendanceLoadRequestId
          ) {
            return;
          }

          const rows =
            await fetchAttendanceChunk(
              ranges[index],
              requestEmployeeCodes,
              statuses
            );

          collected.push(
            ...rows
          );

          if(
            collected.length
            >= 5000
          ) {
            break;
          }
        }

        if(
          requestId
          !== attendanceLoadRequestId
        ) {
          return;
        }

        const unique =
          new Map();

        collected
          .sort(
            (a,b) =>
              String(
                b.work_date
                || ""
              )
                .localeCompare(
                  String(
                    a.work_date
                    || ""
                  )
                )
              || String(
                a.emp_code
                || ""
              )
                .localeCompare(
                  String(
                    b.emp_code
                    || ""
                  )
                )
          )
          .forEach(row => {
            const key =
              String(
                row.emp_code
                || ""
              )
              + "|"
              + String(
                row.work_date
                || ""
              )
                .slice(
                  0,
                  10
                );

            if(
              !unique.has(
                key
              )
            ) {
              unique.set(
                key,
                row
              );
            }
          });

        state.attendance =
          [...unique.values()]
            .slice(
              0,
              5000
            );

        if(
          !attendanceEmployeeFilter.options
            .length
        ) {
          attendanceEmployeeFilter.options =
            fallbackAttendanceEmployeeOptions();

          state.filters.attendance.employees =
            attendanceEmployeeFilter.options;

          renderAttendanceEmployeeDropdown();
        }

        const activeEmployeeCodes =
          Array.isArray(
            requestEmployeeCodes
          )
            ? requestEmployeeCodes
            : null;

        const singleEmployeeCode =
          activeEmployeeCodes?.length
            === 1
              ? activeEmployeeCodes[0]
              : null;

        state.attendanceServerFilter =
          activeEmployeeCodes;

        renderAttendance();

        document.dispatchEvent(
          new CustomEvent(
            "timeclock:attendance-loaded",
            {
              detail: {
                count:
                  state.attendance.length,

                empCode:
                  singleEmployeeCode,

                empCodes:
                  activeEmployeeCodes,

                reachedLimit:
                  state.attendance.length
                    >= 5000
              }
            }
          )
        );

      } catch(error) {
        if(
          attendanceIsTimeout(
            error
          )
        ) {
          toast(
            "การค้นหายังใช้เวลานานเกินกำหนด กรุณาลองช่วงวันที่สั้นลง หรือเลือกพื้นที่/พนักงานเพิ่มเติม",
            "error"
          );
        } else {
          toast(
            humanError(
              error
            ),
            "error"
          );
        }
      } finally {
        hideLoading();
      }
    }

    function renderAttendance() {
      setText("attendanceCount", `${formatNumber(state.attendance.length)} รายการ`);
      $("attendanceBody").innerHTML = state.attendance.length ? state.attendance.map(r => {
        const code = attendanceShiftCode(r);
        const displayStatus =
          attendanceDisplayStatus(r);
        const optionalClass = key =>
          attendanceIsColumnVisible(key)
            ? ""
            : " attendance-col-hidden";

        return `<tr data-attendance-row="1" data-emp="${safe(r.emp_code)}" data-date="${safe(String(r.work_date).slice(0,10))}">
          <td data-att-col="work_date" class="nowrap">${formatDate(r.work_date)}</td>
          <td data-att-col="emp_code">${safe(r.emp_code)}</td>
          <td data-att-col="full_name" class="nowrap">${safe(r.full_name)}</td>
          <td data-att-col="department">${safe(r.department)}</td>
          <td data-att-col="zone" class="${optionalClass("zone").trim()}">${safe(r.zone || r.area)}</td>
          <td data-att-col="sub_area" class="${optionalClass("sub_area").trim()}">${safe(r.sub_area)}</td>
          <td data-att-col="pattern_code">${badge(r.pattern_code||"-","badge-blue")}</td>
          <td data-att-col="template_code" class="${optionalClass("template_code").trim()}">${safe(normalizeTemplateCodeV665(r.template_code)||"-")}</td>
          <td data-att-col="day_type">${safe(attendanceLabel(r.day_type||"-"))}</td>
          <td data-att-col="shift_start" class="nowrap">${formatTime(attendanceShiftTime(r,"start"))}</td>
          <td data-att-col="shift_end" class="nowrap">${formatTime(attendanceShiftTime(r,"end"))}</td>
          <td data-att-col="shift_code">${badge(code, shiftBadgeClass(code))}</td>
          <td data-att-col="first_in">${formatTime(r.actual_in_at || r.first_in)}</td>
          <td data-att-col="last_out">${formatTime(r.actual_out_at || r.last_out)}</td>
          <td data-att-col="display_status">${badge(attendanceDisplayLabel(r), statusBadgeClass(displayStatus))}</td>
          <td data-att-col="net_work_minutes" class="text-right">${minutesToHours(r.net_work_minutes)}</td>
          <td data-att-col="regular_minutes" class="text-right">${minutesToHours(r.regular_minutes)}</td>
          <td data-att-col="overtime_minutes" class="text-right${optionalClass("overtime_minutes")}">${minutesToHours(r.overtime_minutes)}</td>
          <td data-att-col="waiting_minutes" class="text-right${optionalClass("waiting_minutes")}">${minutesToHours(r.waiting_minutes)}</td>
          <td data-att-col="break_deducted_minutes" class="text-right${optionalClass("break_deducted_minutes")}">${minutesToHours(r.break_deducted_minutes)}</td>
          <td data-att-col="late_minutes" class="text-right${optionalClass("late_minutes")}">${formatNumber(r.late_minutes)}</td>
          <td data-att-col="early_leave_minutes" class="text-right${optionalClass("early_leave_minutes")}">${formatNumber(r.early_leave_minutes)}</td>
          <td data-att-col="absence_minutes" class="text-right${optionalClass("absence_minutes")}">${formatNumber(attendanceAbsenceMinutes(r))}</td>
          <td data-att-col="comp_off_balance" class="text-right${optionalClass("comp_off_balance")}">${r.comp_off_earned?"ได้รับ":""}${r.comp_off_balance!=null?` ${formatNumber(r.comp_off_balance)}`:"-"}</td>
        </tr>`;
      }).join("") : emptyRow(24);
      document.dispatchEvent(new CustomEvent("timeclock:attendance-rendered", { detail: { count: state.attendance.length } }));
    }

    function setScheduleLoadStatus(type,message) {
      const box=$("scheduleLoadStatus");
      if(!box) return;
      if(!message){box.className="schedule-load-status hidden";box.textContent="";return;}
      box.className=`schedule-load-status ${type||"info"}`;box.textContent=message;
    }

    function scheduleScopeMessage(debug,period) {
      const reason=String(debug?.reason||"");
      const accessible=Number(debug?.accessible_employees||0);
      const currentAccessible=Number(debug?.current_accessible_employees||0);
      const scopeTotal=Number(debug?.scope_total||0);
      const scopeInPeriod=Number(debug?.scope_in_period||0);
      if(reason==="NO_MANAGER_SCOPE") return "บัญชี Manager นี้ยังไม่มี Manager Scope ที่เปิดสิทธิ์ดูข้อมูล";
      if(reason==="SCOPE_OUTSIDE_PERIOD") return `Manager Scope มี ${scopeTotal} รายการ แต่ไม่มี Scope ที่มีผลในช่วง ${formatDate(period.startDate)}–${formatDate(period.endDate)} กรุณาตรวจ Effective From / Effective To หรือเลือกสัปดาห์ปัจจุบัน`;
      if(reason==="SCOPE_MATCHED_NO_EMPLOYEE") return `พบ Scope ที่มีผล ${scopeInPeriod} รายการ แต่ไม่พบพนักงานที่ Match กับ Scope กรุณาตรวจ Scope Type / Scope Value / โครงสร้างองค์กร`;
      if(accessible===0&&currentAccessible>0) return `Scope ปัจจุบันเห็นพนักงาน ${currentAccessible} คน แต่ช่วง ${formatDate(period.startDate)}–${formatDate(period.endDate)} ไม่มีสิทธิ์ตามช่วงวันที่ของ Scope`;
      if(accessible>0) return `User Scope ผ่าน • พบพนักงาน ${accessible.toLocaleString("th-TH")} คน`;
      if(reason==="DEBUG_RPC_ERROR") return `ตรวจ Scope ไม่สำเร็จ: ${debug?.message||"Unknown error"}`;
      return "ไม่พบพนักงานตาม User Scope สำหรับช่วงวันที่ที่เลือก กรุณาตรวจ Role, Scope, Can View และ Effective Date";
    }

    async function loadScheduleFilterOptions(
      period = syncSchedulePeriodUI(),
      zoneOverride = undefined
    ) {
      const zoneSelect =
        $("scheduleZone");

      const deptSelect =
        $("scheduleDepartment");

      if(
        !zoneSelect
        || !deptSelect
      ) {
        return null;
      }

      const oldZone =
        zoneOverride !== undefined
          ? String(
              zoneOverride
              || ""
            )
          : val(
              "scheduleZone"
            );

      const oldDepartment =
        val(
          "scheduleDepartment"
        );

      const {
        data,
        error
      } =
        await state.client.rpc(
          "ta_get_schedule_filter_options_v61026",
          {
            p_start_date:
              period.startDate,

            p_end_date:
              period.endDate,

            p_zone:
              oldZone
              || null,

            p_department:
              null
          }
        );

      if(error) {
        throw error;
      }

      const result =
        data || {};

      const zones =
        Array.isArray(
          result.zones
        )
          ? result.zones
          : [];

      const departments =
        Array.isArray(
          result.departments
        )
          ? result.departments
          : [];

      fillSelect(
        "scheduleZone",
        zones,
        "ทุกพื้นที่"
      );

      const zoneStillValid =
        !oldZone
        || zones.some(
          value =>
            String(value) ===
            oldZone
        );

      setVal(
        "scheduleZone",
        zoneStillValid
          ? oldZone
          : ""
      );

      fillSelect(
        "scheduleDepartment",
        departments,
        "ทุกหน่วยงาน"
      );

      const departmentStillValid =
        !oldDepartment
        || departments.some(
          value =>
            String(value) ===
            oldDepartment
        );

      setVal(
        "scheduleDepartment",
        departmentStillValid
          ? oldDepartment
          : ""
      );

      return result;
    }

    async function loadSchedule() {
      const period=syncSchedulePeriodUI();
      const button=$("loadScheduleBtn");
      const originalText=button?.textContent||"โหลดตารางกะ";
      if(button){button.disabled=true;button.setAttribute("aria-busy","true");button.textContent="กำลังโหลด...";}
      setScheduleLoadStatus("loading",`กำลังตรวจ User Scope และโหลดตารางกะ ${formatDate(period.startDate)}–${formatDate(period.endDate)}`);
      showLoading(`กำลังโหลดปฏิทินกะ ${formatDate(period.startDate)}–${formatDate(period.endDate)}...`);
      try{
        await loadScheduleFilterOptions(
          period
        );

        const term=val("scheduleSearch").trim();
        const exactEmp=/^\d{4,20}$/.test(term)?term:null;
        const data=await window.TimeClockShiftAPI.getMonthlySchedule(window.TimeClockApp||{state},{p_month:`${period.month}-01`,p_start_date:period.startDate,p_end_date:period.endDate,p_zone:val("scheduleZone")||null,p_department:val("scheduleDepartment")||null,p_emp_codes:exactEmp?[exactEmp]:null,p_schedule_statuses:null});
        state.schedule=(data||[]).filter(row=>{const date=String(row.work_date||"").slice(0,10);return date>=period.startDate&&date<=period.endDate;});
        renderSchedule();
        const employeeCount=new Set(state.schedule.map(r=>String(r.emp_code||"")).filter(Boolean)).size;
        if(state.schedule.length){setScheduleLoadStatus("success",`โหลดสำเร็จ • พนักงาน ${employeeCount.toLocaleString("th-TH")} คน • ${state.schedule.length.toLocaleString("th-TH")} วัน-พนักงาน`);return;}
        const debug=await window.TimeClockShiftAPI?.getScheduleScopeDebug?.(window.TimeClockApp||{state},period.startDate,period.endDate);
        const message=scheduleScopeMessage(debug,period);setScheduleLoadStatus("warning",message);toast(message,"warning");
      }catch(error){const message=humanError(error);setScheduleLoadStatus("error",`โหลดตารางกะไม่สำเร็จ: ${message}`);toast(message,"error");}
      finally{hideLoading();if(button){button.disabled=false;button.removeAttribute("aria-busy");button.textContent=originalText;}}
    }

    function scheduleMergeEmployeeMeta(target, source) {
      const helper =
        window.TimeClockShiftAPI?.mergeScheduleEmployeeMeta;

      if (typeof helper !== "function") {
        return target;
      }

      return helper(target, source);
    }

    function scheduleHasMeaningfulName(value, empCode) {
      const helper =
        window.TimeClockShiftAPI?.meaningfulScheduleName;

      if (typeof helper === "function") {
        return helper(value, empCode);
      }

      const text = String(value ?? "").trim();
      return Boolean(
        text
        && text !== "-"
        && text.toLowerCase() !== "null"
        && text.toLowerCase() !== "undefined"
        && text !== String(empCode || "").trim()
      );
    }

    function scheduleManagerOwnEmployee(
      empCode
    ) {
      const profile =
        state.profile || {};

      const role =
        String(
          profile._realRole
          || profile.role
          || ""
        )
          .trim()
          .toUpperCase();

      const ownEmp =
        String(
          profile.emp_code
          || ""
        )
          .trim();

      return (
        role === "MANAGER"
        && ownEmp
        && String(
          empCode
          || ""
        ).trim() === ownEmp
      );
    }

    function renderSchedule() {
      const period = syncSchedulePeriodUI();
      const periodRows = state.schedule.filter(r => {
        const date = String(r.work_date || "").slice(0,10);
        return date >= period.startDate && date <= period.endDate;
      });
      updateSchedulePatternSummary(periodRows);
      const rows = scheduleFilteredRows(periodRows);

      const map = new Map();
      const dateMeta = new Map();

      for (const r of rows) {
        const date = String(r.work_date).slice(0,10);

        if (!map.has(r.emp_code)) {
          map.set(r.emp_code, {
            meta: { ...r },
            days: {}
          });
        } else {
          scheduleMergeEmployeeMeta(
            map.get(r.emp_code).meta,
            r
          );

          if (
            map.get(r.emp_code).meta.employee_name_missing
            && !r.employee_name_missing
          ) {
            map.get(r.emp_code).meta.full_name = r.full_name;
            map.get(r.emp_code).meta.employee_name_missing = false;
          }
        }

        map.get(r.emp_code).days[date] = r;
        if (!dateMeta.has(date)) dateMeta.set(date, { holiday: false, holidayName: null });
        if (r.is_public_holiday || r.day_type === "PUBLIC_HOLIDAY") {
          dateMeta.set(date, {
            holiday: true,
            holidayName: r.holiday_name || "วันหยุดนักขัตฤกษ์"
          });
        }
      }

      const thaiDays = ["อา","จ","อ","พ","พฤ","ศ","ส"];
      const thaiMonths = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

      const headDays = period.dates.map(date => {
        const d = parseLocalISO(date);
        const dow = d.getDay();
        const meta = dateMeta.get(date) || {};
        const classes = [
          dow === 0 || dow === 6 ? "weekend" : "",
          meta.holiday ? "public-holiday-head" : ""
        ].filter(Boolean).join(" ");
        const title = meta.holiday
          ? `${meta.holidayName} • คลิกเพื่อเลือกทั้งวันที่`
          : "คลิกเพื่อเลือกทั้งวันที่";
        return `<th class="day-col ${classes}" data-select-date="${date}" title="${safe(title)}"><span>${d.getDate()}</span><small>${thaiDays[dow]} ${thaiMonths[d.getMonth()]}${meta.holiday?" • หยุด":""}</small></th>`;
      }).join("");

      let html = `<table class="schedule-table enterprise-schedule-table weekly-schedule-table"><thead><tr><th class="sticky-col-1 schedule-code-head">รหัส</th><th class="sticky-col-2 schedule-name-head">ชื่อ-นามสกุล</th><th class="sticky-col-3 schedule-start-head">วันเริ่มงาน</th><th class="sticky-col-4 schedule-position-head">ตำแหน่ง</th>${headDays}</tr></thead><tbody>`;

      if (!map.size) html += emptyRow(period.dates.length + 4);

      const today = todayISO();

      for (const [emp, obj] of map) {
        const rowPattern = scheduleRowPattern(obj.meta);
        const patternClass = rowPattern === "TECH_5D"
          ? "pattern-5d"
          : rowPattern === "TECH_6D"
            ? "pattern-6d"
            : "pattern-unassigned";

        const displayName =
          scheduleHasMeaningfulName(
            obj.meta.full_name,
            emp
          )
          ? obj.meta.full_name
          : "ไม่พบชื่อพนักงาน";

        const nameClass = obj.meta.employee_name_missing
          || displayName === "ไม่พบชื่อพนักงาน"
          ? "schedule-name-missing"
          : "";

        const employeeStartDate =
          String(
            obj.meta.start_date
            || ""
          ).slice(0,10);

        const employeeResignDate =
          String(
            obj.meta.resign_date
            || ""
          ).slice(0,10);

        const employeePosition =
          String(
            obj.meta.position_name
            || ""
          ).trim();

        const managerOwnEmployee =
          scheduleManagerOwnEmployee(
            emp
          );

        const employeeSelectAttr =
          managerOwnEmployee
            ? ""
            : `data-select-emp="${safe(emp)}"`;

        const managerOwnBadge =
          managerOwnEmployee
            ? `<span class="schedule-self-readonly-badge" title="Manager ดูกะของตนเองได้ แต่ไม่สามารถจัดกะให้ตนเอง">ตนเอง • ดูอย่างเดียว</span>`
            : "";

        html += `<tr class="${managerOwnEmployee?"manager-self-schedule-row":""}" data-emp-row="${safe(emp)}" data-pattern-code="${safe(rowPattern)}" data-start-date="${safe(employeeStartDate)}" data-resign-date="${safe(employeeResignDate)}"><td class="sticky-col-1 schedule-emp-code" ${employeeSelectAttr} title="${managerOwnEmployee?"ข้อมูลของตนเอง • ดูอย่างเดียว":"เลือกทั้งแถว"}">${safe(emp)}</td><td class="sticky-col-2 nowrap schedule-emp-name" ${employeeSelectAttr}><div class="schedule-name-line"><strong class="${nameClass}">${safe(displayName)}</strong><span class="schedule-pattern-badge ${patternClass}" title="${safe(schedulePatternLabel(rowPattern))}">${safe(schedulePatternShort(rowPattern))}</span>${managerOwnBadge}</div><small>${safe(obj.meta.department || obj.meta.zone || "")}</small></td><td class="sticky-col-3 nowrap schedule-emp-start-date">${safe(formatDate(employeeStartDate))}</td><td class="sticky-col-4 nowrap schedule-emp-position" title="${safe(employeePosition || "-")}">${safe(employeePosition || "-")}</td>`;

        for (const date of period.dates) {
          const r = obj.days[date];

          const beforeEmployment =
            Boolean(
              employeeStartDate
              && date < employeeStartDate
            );

          if (beforeEmployment) {
            html += `<td class="day-col empty-schedule-day pre-employment-day" title="ก่อนวันเริ่มงาน ${safe(formatDate(employeeStartDate))}"><span class="schedule-cell disabled pre-employment-cell">ยังไม่เริ่ม</span></td>`;
            continue;
          }

          const afterResign =
            Boolean(
              employeeResignDate
              && date > employeeResignDate
            );

          if(afterResign) {
            html += `<td class="day-col empty-schedule-day post-resign-day" title="หลังวันลาออก ${safe(formatDate(employeeResignDate))}"><span class="schedule-cell disabled post-resign-cell">ลาออก</span></td>`;
            continue;
          }

          if (!r) {
            html += `<td class="day-col empty-schedule-day out-of-scope-day" title="ไม่มีสิทธิ์ตาม User Scope ในวันที่นี้"><span class="schedule-cell disabled out-of-scope-cell">นอก Scope</span></td>`;
            continue;
          }

          const code =
            r.assigned_shift_code
            || r.effective_shift_code
            || r.auto_shift_code
            || r.shift_code
            || "-";
          const publicHoliday =
            r.is_public_holiday
            || r.day_type === "PUBLIC_HOLIDAY";
          const weeklyOff = r.is_weekly_off || r.day_type === "WEEKLY_OFF";
          const normalizedCode = String(code || "")
            .trim()
            .toUpperCase();

          const codeClass = normalizedCode.replace(
            /[^A-Z0-9_-]/g,
            ""
          );

          const shiftMaster = state.filters.shifts.find(
            shift =>
              String(shift.shift_code || "")
                .trim()
                .toUpperCase() === normalizedCode
          );

          const shiftStart = formatTime(
            r.shift_start_time
            || r.effective_shift_start_time
            || r.assigned_shift_start_time
            || shiftMaster?.start_time
          );
          const shiftEnd = formatTime(
            r.shift_end_time
            || r.effective_shift_end_time
            || r.assigned_shift_end_time
            || shiftMaster?.end_time
          );
          const showShiftTime =
            !["OFF","HOL","LV"].includes(normalizedCode)
            && shiftMaster?.is_workday !== false
            && shiftStart !== "-"
            && shiftEnd !== "-";
          const shiftTimeLabel = showShiftTime
            ? `${shiftStart}–${shiftEnd}`
            : "";

          const shiftVisualClass =
            normalizedCode === "HOL"
              ? "shift-visual-holiday"
              : normalizedCode === "LV"
                ? "shift-visual-leave"
                : normalizedCode === "OFF"
                  || shiftMaster?.is_workday === false
                  ? "shift-visual-off"
                  : shiftMaster?.is_night_shift === true
                    || normalizedCode.startsWith("N")
                    || String(shiftMaster?.shift_name || "")
                      .toLowerCase()
                      .includes("กลางคืน")
                    || String(shiftMaster?.shift_name || "")
                      .toLowerCase()
                      .includes("กะดึก")
                    ? "shift-visual-night"
                    : "shift-visual-day";

          const cls = `shift-${codeClass} ${shiftVisualClass} ${r.schedule_status==='NEED_REVIEW'?'review':''} ${r.schedule_status==='CONFIRMED'?'confirmed':''}`;
          const tdCls = [
            "day-col",
            "schedule-data-cell",
            publicHoliday ? "public-holiday-cell" : "",
            weeklyOff ? "weekly-off-cell" : "",
            date > today ? "future-schedule-cell" : ""
          ].filter(Boolean).join(" ");

          const dayLabel = publicHoliday
            ? (r.holiday_name || "วันหยุดนักขัตฤกษ์")
            : weeklyOff
              ? "วันหยุดประจำสัปดาห์"
              : "วันทำงาน";

          const statusLabel = r.schedule_status === "CONFIRMED"
            ? "ยืนยันแล้ว"
            : r.schedule_status === "ASSIGNED"
              ? "ยังไม่ยืนยัน"
              : r.schedule_status || "AUTO";

          const calcBits = [
            shiftTimeLabel
              ? `เวลากะ ${shiftTimeLabel}`
              : null,
            r.pattern_code,
            r.template_code,
            r.calculation_status,
            Number(r.overtime_minutes||0)>0 ? `OT ${(Number(r.overtime_minutes)/60).toFixed(1)} ชม.` : null,
            Number(r.waiting_minutes||0)>0 ? `รอ ${(Number(r.waiting_minutes)/60).toFixed(1)} ชม.` : null,
            r.comp_off_earned ? "ได้วันหยุดชดเชย" : null
          ].filter(Boolean).join(" | ");

          const calcFlags =
            `${Number(r.waiting_minutes||0)>0?'<small class="schedule-calc-flag wait">W</small>':''}` +
            `${r.comp_off_earned?'<small class="schedule-calc-flag comp">C</small>':''}`;

          const editAttrs =
            managerOwnEmployee
              ? `data-manager-self-readonly="1"`
              : `data-schedule-cell="1" data-emp="${safe(r.emp_code)}" data-date="${safe(date)}" data-shift="${safe(code)}" data-status="${safe(r.schedule_status)}"`;

          const cellTitle =
            managerOwnEmployee
              ? `${displayName} | ${dayLabel} | ${statusLabel}${calcBits?` | ${calcBits}`:""} | Manager ไม่สามารถจัดกะให้ตนเอง`
              : `${displayName} | ${dayLabel} | ${statusLabel}${calcBits?` | ${calcBits}`:""} | ดับเบิลคลิกเพื่อแก้ไข`;

          html += `<td class="${tdCls} ${managerOwnEmployee?"manager-self-readonly-cell":""}" data-cell-key="${safe(r.emp_code)}|${safe(date)}"><span class="schedule-cell ${cls} ${managerOwnEmployee?"manager-self-readonly":""}" ${editAttrs} title="${safe(cellTitle)}"><b class="schedule-shift-code">${safe(code)}</b>${shiftTimeLabel?`<small class="schedule-shift-time">${safe(shiftTimeLabel)}</small>`:""}${r.schedule_status==='NEED_REVIEW'?'<i>!</i>':''}${calcFlags}</span></td>`;
        }

        html += `</tr>`;
      }

      html += `</tbody></table>`;
      $("scheduleTableWrap").innerHTML = html;
      setText("scheduleEmployeeCount", formatNumber(map.size));
      setText("scheduleAssignedCount", formatNumber(rows.filter(r => r.schedule_status === "ASSIGNED").length));
      setText("scheduleConfirmedCount", formatNumber(rows.filter(r => r.schedule_status === "CONFIRMED").length));
      setText("scheduleReviewCount", formatNumber(rows.filter(r => r.schedule_status === "NEED_REVIEW").length));
      document.dispatchEvent(new CustomEvent("timeclock:schedule-rendered", {
        detail: {
          startDate: period.startDate,
          endDate: period.endDate,
          days: period.dates.length
        }
      }));
    }

    const ASSIGN_TEMPLATE_CACHE = new Map();

    async function assignmentTemplateOptions(patternCode) {
      const pattern = patternCode === "TECH_5D" ? "TECH_5D" : "TECH_6D";
      if (ASSIGN_TEMPLATE_CACHE.has(pattern)) {
        return ASSIGN_TEMPLATE_CACHE.get(pattern);
      }

      let options = [];
      try {
        const { data, error } = await state.client.rpc(
          "ta_get_employee_template_options_v655",
          { p_pattern_code: pattern }
        );
        if (error) throw error;
        options = Array.isArray(data) ? data : [];
      } catch (error) {
        options = [
          {
            category_code: "NORMAL",
            category_name: "กะปกติ",
            template_code: pattern === "TECH_5D"
              ? "SINGLE_0830_1800"
              : "SINGLE_0830_1730",
            display_order: 1
          },
          {
            category_code: "NORMAL_LATE_CUSTOMER",
            category_name: "กะปกติ + งานลูกค้าช่วงดึก",
            template_code: "SPLIT_FLEX",
            display_order: 2
          },
          {
            category_code: "EARLY_SHIFT_CUSTOMER",
            category_name: "ออกกะแรกก่อนเวลา + งานลูกค้า",
            template_code: "EARLY_SPLIT_FLEX",
            display_order: 3
          }
        ];
      }

      const normalLabel = pattern === "TECH_5D"
        ? "กะปกติ 5 วัน/สัปดาห์ • 9.5 ชม.รวมพัก"
        : "กะปกติ 6 วัน/สัปดาห์ • 9 ชม.รวมพัก";

      const normalized = options
        .filter(o => o?.template_code)
        .map(o => ({
          ...o,
          category_name: o.category_code === "NORMAL"
            ? normalLabel
            : o.category_name
        }))
        .sort((a,b) => Number(a.display_order||0)-Number(b.display_order||0));

      ASSIGN_TEMPLATE_CACHE.set(pattern, normalized);
      return normalized;
    }

    async function fillAssignmentTemplateSelect(patternCode, selectedTemplate) {
      const select = $("assignWorkTemplate");
      if (!select) return;

      select.disabled = true;
      select.innerHTML = '<option value="">กำลังโหลดรูปแบบช่วงงาน...</option>';

      const options = await assignmentTemplateOptions(patternCode);
      select.innerHTML = options.map(o =>
        `<option value="${safe(o.template_code)}">${safe(o.category_name || o.template_name || o.template_code)}</option>`
      ).join("");

      const fallback = patternCode === "TECH_5D"
        ? "SINGLE_0830_1800"
        : "SINGLE_0830_1730";

      const target = options.some(o => o.template_code === selectedTemplate)
        ? selectedTemplate
        : options.some(o => o.template_code === fallback)
          ? fallback
          : options[0]?.template_code || "";

      select.value = target;
      select.dataset.patternCode = patternCode;

      setText(
        "assignWorkTemplateHelp",
        patternCode === "TECH_5D"
          ? "พนักงานรูปแบบ 5 วัน: กะปกติอ้างอิง 9.5 ชั่วโมงรวมพัก"
          : "พนักงานรูปแบบ 6 วัน: กะปกติอ้างอิง 9 ชั่วโมงรวมพัก"
      );

      select.disabled = false;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }

    async function openAssignment(empCode, workDate) {
      if(
        scheduleManagerOwnEmployee(
          empCode
        )
      ) {
        toast(
          "Manager สามารถดูตารางกะของตนเองได้ แต่ไม่สามารถจัดกะให้ตนเอง",
          "warning"
        );

        return;
      }

      const r = state.schedule.find(
        x =>
          x.emp_code === empCode
          && String(x.work_date).slice(0,10) === workDate
      );
      const patternCode = r?.pattern_code || r?.resolved_pattern_code || (String(r?.pc || "").match(/4/) ? "TECH_5D" : "TECH_6D");
      const selectedShift = r?.assigned_shift_code || r?.suggested_shift_code || r?.effective_shift_code || r?.default_shift_code || (patternCode === "TECH_5D" ? "D5" : "D6");
      setVal("assignEmpCode", empCode); setVal("assignWorkDate", workDate);
      setText("assignEmployeeInfo", `${r?.full_name || empCode} | ${formatDate(workDate)} | ${SHIFT_PATTERN_META[patternCode]?.label || patternCode} | กะปัจจุบัน ${r?.assigned_shift_code || r?.effective_shift_code || r?.auto_shift_code || "-"}`);
      fillShiftSelect(patternCode, selectedShift);
      setVal("assignShiftCode", selectedShift);
      setVal("assignConfirm", r?.is_confirmed ? "true" : "false"); setVal("assignNote", r?.schedule_note || ""); setVal("assignReason", "กำหนดกะจากหน้าปฏิทิน");
      $("assignShiftCode").dataset.patternCode = patternCode;
      await fillAssignmentTemplateSelect(
        patternCode,
        r?.template_code || r?.default_template_code || null
      );
      updateAssignConfirmHelp();
      $("deleteAssignmentBtn").classList.toggle("hidden", !r?.assigned_shift_code);
      openModal("assignModal");
    }

    async function saveAssignment() {
      showLoading("กำลังบันทึกกะ...");
      try {
        const saveResult =
          await window.TimeClockShiftAPI.assignSingle(
            window.TimeClockApp || { state },
            {
              emp_code:
                val("assignEmpCode"),
              work_date:
                val("assignWorkDate"),
              shift_code:
                val("assignShiftCode"),
              note:
                val("assignNote")
                || null,
              change_reason:
                val("assignReason")
                || "กำหนดกะจากหน้าปฏิทิน",
              confirm_now:
                val("assignConfirm")
                === "true"
            }
          );
        const savedEmp = val("assignEmpCode");
        const savedDate = val("assignWorkDate");
        const savedShift = val("assignShiftCode");
        const savedConfirm = val("assignConfirm") === "true";
        const currentRow = state.schedule.find(x => x.emp_code === savedEmp && String(x.work_date).slice(0,10) === savedDate);
        if (currentRow) {
          currentRow.assigned_shift_code = savedShift;
          currentRow.effective_shift_code = savedShift;
          currentRow.is_confirmed = savedConfirm;
          currentRow.schedule_status = savedConfirm ? "CONFIRMED" : "ASSIGNED";
          renderSchedule();
        }
        closeModal("assignModal");
        const attendanceRecalc =
          saveResult
            ?.attendance_recalculation;

        toast(
          attendanceRecalc?.deferred
            ? `บันทึกกะ ${savedShift} เรียบร้อย • ยังไม่มีข้อมูลลงเวลา จึงรอคำนวณเมื่อมี Attendance`
            : `บันทึกกะ ${savedShift} และประมวลผลเวลาใหม่เรียบร้อย`,
          "success"
        );

        const returnContext =
          window.TimeClockAttendanceReturnContext;

        if (
          returnContext?.source ===
          "attendance-detail"
        ) {
          // V6.10.29:
          // Attendance was recalculated inside the same SQL transaction
          // that saved the shift. Reload only; do not calculate twice.

          switchPage("attendance");
          await loadAttendance();

          document.dispatchEvent(
            new CustomEvent(
              "timeclock:attendance-shift-saved",
              {
                detail: {
                  ...returnContext,
                  empCode: savedEmp,
                  workDate: savedDate,
                  shiftCode: savedShift
                }
              }
            )
          );

          window.TimeClockAttendanceReturnContext = null;
          return;
        }

        await loadSchedule();
      } catch (err) { toast(humanError(err), "error"); }
      finally { hideLoading(); }
    }

    async function deleteAssignment() {
      if (!confirm("ยืนยันการลบกะที่จัดไว้รายการนี้?")) return;
      showLoading("กำลังลบกะ...");
      try {
        const deleteResult =
          await window.TimeClockShiftAPI.deleteBulk(
            window.TimeClockApp || { state },
            [
              val("assignEmpCode")
            ],
            val("assignWorkDate"),
            val("assignWorkDate"),
            "ลบกะจากหน้าปฏิทิน"
          );

        closeModal(
          "assignModal"
        );

        toast(
          deleteResult
            ?.attendance_recalculation
            ?.deferred
              ? "ลบกะที่จัดไว้แล้ว • ยังไม่มีข้อมูลลงเวลา"
              : "ลบกะและประมวลผลเวลาใหม่เรียบร้อย",
          "success"
        );

        const returnContext =
          window.TimeClockAttendanceReturnContext;

        if (
          returnContext?.source ===
          "attendance-detail"
        ) {
          const savedEmp = val("assignEmpCode");
          const savedDate = val("assignWorkDate");

          // V6.10.29:
          // Delete + Attendance recalculation is atomic in SQL.

          switchPage("attendance");
          await loadAttendance();

          document.dispatchEvent(
            new CustomEvent(
              "timeclock:attendance-shift-saved",
              {
                detail: {
                  ...returnContext,
                  empCode: savedEmp,
                  workDate: savedDate,
                  deleted: true
                }
              }
            )
          );

          window.TimeClockAttendanceReturnContext = null;
          return;
        }

        await loadSchedule();
      } catch (err) { toast(humanError(err), "error"); }
      finally { hideLoading(); }
    }

    async function loadShiftMaster() {
      showLoading("กำลังโหลดข้อมูลกะ...");
      try {
        let response = await state.client.rpc("ta_get_shift_master_v651");
        if (response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
          response = await state.client.from("shift_master").select("*").order("shift_code");
        }
        if (response.error) throw response.error;
        state.filters.shifts = (response.data || []).sort((a,b) => Number(a.display_order ?? a.sort_order ?? 0) - Number(b.display_order ?? b.sort_order ?? 0) || String(a.shift_code).localeCompare(String(b.shift_code)));
        fillShiftSelect();
        renderShiftMasterTable();
      } catch (err) { toast(humanError(err), "error"); }
      finally { hideLoading(); }
    }

    function editShift(code) {
      const s = state.filters.shifts.find(x => x.shift_code === code) || {};
      setVal("smCode", s.shift_code);
      setVal("smName", s.shift_name);
      setVal("smStart", s.start_time?.slice(0,5));
      setVal("smEnd", s.end_time?.slice(0,5));
      setVal("smBreak", s.break_minutes ?? 0);
      setVal("smOrder", s.display_order ?? s.sort_order ?? 0);
      setVal("smActive", String(s.is_active !== false));
      setVal("smNote", s.note || "");
      $("smWorkday").checked = s.is_workday !== false;
      $("smNight").checked = !!s.is_night_shift;
      $("smCode").disabled = !!s.shift_code;
      const patterns = shiftPatternCodes(s);
      const defaults = shiftDefaultPatternCodes(s);
      $("smPattern6").checked = patterns.includes("TECH_6D");
      $("smPattern5").checked = patterns.includes("TECH_5D");
      $("smDefault6").checked = defaults.includes("TECH_6D");
      $("smDefault5").checked = defaults.includes("TECH_5D");
      updateShiftDurationSummary();
      openModal("shiftMasterModal");
    }

    async function saveShiftMaster() {
      const patterns = selectedShiftPatternCodes();
      const defaults = selectedShiftDefaultCodes();
      if (!patterns.length) {
        toast("กรุณาเลือกรูปแบบการทำงานอย่างน้อย 1 รูปแบบ", "error");
        return;
      }
      if (!$("smWorkday").checked && defaults.length) {
        toast("กะวันหยุดไม่สามารถกำหนดเป็นกะตั้งต้นได้", "error");
        return;
      }
      showLoading("กำลังบันทึกข้อมูลกะ...");
      try {
        const result = await window.TimeClockShiftAPI.upsertShiftMaster(window.TimeClockApp || { state }, {
          shift_code: val("smCode"),
          shift_name: val("smName"),
          start_time: val("smStart") || null,
          end_time: val("smEnd") || null,
          is_night_shift: $("smNight").checked,
          is_workday: $("smWorkday").checked,
          break_minutes: Number(val("smBreak")||0),
          display_order: Number(val("smOrder")||0),
          note: val("smNote") || null,
          is_active: val("smActive") === "true",
          applicable_pattern_codes: patterns,
          default_pattern_codes: defaults,
          change_reason: "บันทึกจากหน้า HR Admin V6.10.2"
        });
        closeModal("shiftMasterModal");
        toast(defaults.length ? "บันทึกกะและปรับกะตั้งต้นเรียบร้อย" : "บันทึกข้อมูลกะเรียบร้อย", "success");
        await loadShiftMaster();
        if (result?.requires_recalculation && defaults.length) {
          toast("กะตั้งต้นมีการเปลี่ยนแปลง กรุณาคำนวณผลย้อนหลังตามช่วงวันที่ที่ต้องการ", "info");
        }
      } catch (err) { toast(humanError(err), "error"); }
      finally { hideLoading(); }
    }

    async function loadHolidays() {
      showLoading("กำลังโหลดวันหยุด...");
      try {
        const year = new Date().getFullYear();
        const { data, error } = await state.client.rpc("ta_get_holiday_management", { p_start_date: `${year}-01-01`, p_end_date: `${year+1}-12-31` });
        if (error) throw error;
        state.holidays = data || [];
        $("holidayBody").innerHTML = state.holidays.length ? state.holidays.map(h => `<tr><td>${formatDate(h.holiday_date)}</td><td>${safe(h.holiday_name)}</td><td>${safe(h.source)}</td><td>${safe(h.note)}</td><td class="text-right">${formatNumber(h.attendance_rows)}</td><td class="text-right">${formatNumber(h.rows_with_time)}</td><td><button class="btn btn-soft" data-edit-holiday="${safe(String(h.holiday_date).slice(0,10))}">แก้ไข</button> <button class="btn btn-danger" data-delete-holiday="${safe(String(h.holiday_date).slice(0,10))}">ลบ</button></td></tr>`).join("") : emptyRow(7);
      } catch (err) { toast(humanError(err), "error"); }
      finally { hideLoading(); }
    }

    function editHoliday(date) {
      const h = (state.holidays || []).find(x => String(x.holiday_date).slice(0,10) === date) || {};
      setVal("holDate", date || ""); setVal("holName", h.holiday_name || ""); setVal("holSource", h.source || "HR_ADMIN"); setVal("holNote", h.note || ""); $("holDate").disabled = !!date; openModal("holidayModal");
    }

    async function saveHoliday() {
      showLoading("กำลังบันทึกวันหยุดและประมวลผลใหม่...");
      try {
        const { error } = await state.client.rpc("ta_upsert_holiday", { p_holiday_date: val("holDate"), p_holiday_name: val("holName"), p_source: val("holSource") || "HR_ADMIN", p_note: val("holNote") || null, p_change_reason: "บันทึกจากหน้า HR Admin" });
        if (error) throw error;
        closeModal("holidayModal"); toast("บันทึกวันหยุดเรียบร้อย", "success"); await loadHolidays();
      } catch (err) { toast(humanError(err), "error"); }
      finally { hideLoading(); }
    }

    async function deleteHoliday(date) {
      if (!confirm(`ยืนยันการลบวันหยุด ${formatDate(date)}?`)) return;
      showLoading("กำลังลบวันหยุดและประมวลผลใหม่...");
      try { const { error } = await state.client.rpc("ta_delete_holiday", { p_holiday_date: date, p_change_reason: "ลบจากหน้า HR Admin" }); if (error) throw error; toast("ลบวันหยุดเรียบร้อย", "success"); await loadHolidays(); }
      catch (err) { toast(humanError(err), "error"); } finally { hideLoading(); }
    }

    let managerScopeRows = [];
    let managerScopeUploadRows = [];

    function managerScopeTypeLabel(type) {
      return ({
        ALL:"ทั้งหมด",
        DEPARTMENT:"หน่วยงาน",
        ZONE:"Zone",
        AREA:"พื้นที่",
        SUB_AREA:"พื้นที่ย่อย",
        EMPLOYEE:"พนักงานรายบุคคล"
      })[String(type || "").toUpperCase()] || type || "-";
    }

    function managerScopeBoolean(value) {
      if (typeof value === "boolean") return value;
      return [
        "true","t","1","yes","y","ใช่","เปิด"
      ].includes(String(value || "").trim().toLowerCase());
    }

    function managerScopePermissionBadge(value) {
      return value
        ? badge("✓","badge-green")
        : badge("—","badge-gray");
    }

    function toggleUserManagerScopeSection() {
      const isManager = val("umRole") === "MANAGER";
      $("umManagerScopeSection")?.classList.toggle(
        "hidden",
        !isManager
      );

      if (!isManager) {
        managerScopeRows = [];
        renderManagerScopes();
      }
    }

    async function loadManagerScopes(email) {
      const managerEmail = String(email || "").trim().toLowerCase();

      if (!managerEmail || val("umRole") !== "MANAGER") {
        managerScopeRows = [];
        renderManagerScopes();
        return;
      }

      setText("umManagerScopeEmail",managerEmail);
      $("umManagerScopeBody").innerHTML =
        `<tr><td colspan="10" class="fc-empty">กำลังโหลด Scope...</td></tr>`;

      try {
        const { data,error } = await state.client.rpc(
          "ta_get_manager_scopes_v690",
          {
            p_manager_email: managerEmail
          }
        );

        if (error) throw error;

        managerScopeRows = data || [];
        renderManagerScopes();
      } catch (error) {
        managerScopeRows = [];
        $("umManagerScopeBody").innerHTML =
          `<tr><td colspan="10" class="fc-empty">${safe(humanError(error))}</td></tr>`;
      }
    }

    function renderManagerScopes() {
      const body = $("umManagerScopeBody");
      if (!body) return;

      if (val("umRole") !== "MANAGER") {
        body.innerHTML =
          `<tr><td colspan="10" class="fc-empty">Scope ใช้เฉพาะ Role Manager</td></tr>`;
        return;
      }

      body.innerHTML = managerScopeRows.length
        ? managerScopeRows.map(scope => {
            const range = [
              scope.effective_from
                ? formatDate(scope.effective_from)
                : "ไม่จำกัด",
              scope.effective_to
                ? formatDate(scope.effective_to)
                : "ไม่จำกัด"
            ].join(" – ");

            return `<tr>
              <td>${badge(
                managerScopeTypeLabel(scope.scope_type),
                scope.scope_type === "EMPLOYEE"
                  ? "badge-orange"
                  : scope.scope_type === "ALL"
                    ? "badge-purple"
                    : "badge-blue"
              )}</td>
              <td>
                <strong>${safe(scope.scope_value)}</strong>
                <small class="manager-scope-cell-sub">${safe(scope.scope_label || "")}</small>
              </td>
              <td>${managerScopePermissionBadge(scope.can_view)}</td>
              <td>${managerScopePermissionBadge(scope.can_edit_schedule)}</td>
              <td>${managerScopePermissionBadge(scope.can_confirm_schedule)}</td>
              <td>${managerScopePermissionBadge(scope.can_certify_attendance)}</td>
              <td>${managerScopePermissionBadge(scope.can_decide_shift_request)}</td>
              <td class="nowrap">${safe(range)}</td>
              <td>${scope.is_active
                ? badge("ใช้งาน","badge-green")
                : badge("ปิด","badge-red")}</td>
              <td>
                <div class="manager-scope-row-actions">
                  <button
                    class="btn btn-soft btn-sm"
                    data-edit-manager-scope="${safe(scope.scope_id)}"
                  >แก้ไข</button>
                  <button
                    class="btn btn-danger-soft btn-sm"
                    data-delete-manager-scope="${safe(scope.scope_id)}"
                  >ลบ</button>
                </div>
              </td>
            </tr>`;
          }).join("")
        : `<tr><td colspan="10" class="fc-empty">Manager นี้ยังไม่มี Scope — จะเห็นเฉพาะข้อมูลของตนเอง</td></tr>`;
    }

    async function loadUsers() {
      showLoading("กำลังโหลด User และสิทธิ์...");
      try {
        let response = await state.client.rpc(
          "ta_get_user_management_v681"
        );

        if (
          response.error
          && window.TimeClockShiftAPI?.missingFunction?.(
            response.error
          )
        ) {
          response = await state.client.rpc(
            "ta_get_user_management_v680"
          );
        }

        if (response.error) throw response.error;

        state.users = (response.data || []).map(user => ({
          ...user,
          role:
            String(user.role || "VIEWER").toUpperCase()
              === "USER"
              ? "MANAGER"
              : String(user.role || "VIEWER").toUpperCase()
        }));

        $("userBody").innerHTML = state.users.length
          ? state.users.map(user => {
              const roleClass =
                user.role === "HR_ADMIN"
                  ? "badge-orange"
                  : user.role === "MANAGER"
                    ? "badge-blue"
                    : "badge-gray";

              const scopeCount = Number(
                user.scope_count
                ?? user.scope_employee_count
                ?? (
                  Array.isArray(user.scopes)
                    ? user.scopes.length
                    : 0
                )
              );

              return `<tr>
                <td><strong>${safe(user.email)}</strong></td>
                <td>${safe(user.display_name || user.email)}</td>
                <td>${badge(user.role,roleClass)}</td>
                <td><strong>${safe(user.emp_code || "-")}</strong></td>
                <td>
                  ${
                    user.role === "MANAGER"
                      ? `<button
                          class="manager-scope-count"
                          data-edit-user="${safe(user.user_id)}"
                        >
                          <strong>${formatNumber(scopeCount)}</strong>
                          <span>Scope</span>
                        </button>
                        <small class="manager-scope-summary">${safe(user.scope_summary || "ยังไม่กำหนด Scope")}</small>`
                      : "-"
                  }
                </td>
                <td>${user.is_active
                  ? badge("Active","badge-green")
                  : badge("Inactive","badge-red")}</td>
                <td>${formatDateTime(user.last_sign_in_at)}</td>
                <td><button
                  class="btn btn-soft"
                  data-edit-user="${safe(user.user_id)}"
                >Role / Scope</button></td>
              </tr>`;
            }).join("")
          : emptyRow(8);
      } catch (error) {
        toast(humanError(error),"error");
      } finally {
        hideLoading();
      }
    }

    async function editUser(userId) {
      const user = state.users.find(
        item => item.user_id === userId
      );
      if (!user) return;

      setVal("umUserId",user.user_id);
      setVal("umEmail",user.email);
      setVal(
        "umDisplayName",
        user.display_name || user.email
      );
      setVal("umRole",user.role || "VIEWER");
      setVal("umEmpCode",user.emp_code || "");
      $("umActive").checked =
        user.is_active !== false;

      toggleUserManagerScopeSection();
      openModal("userModal");

      if (user.role === "MANAGER") {
        await loadManagerScopes(user.email);
      }
    }

    async function saveUser() {
      showLoading("กำลังบันทึก Role ผู้ใช้งาน...");
      try {
        const { error } = await state.client.rpc(
          "ta_update_user_access_v681",
          {
            p_user_id: val("umUserId"),
            p_role: val("umRole"),
            p_emp_code: val("umEmpCode") || null,
            p_display_name:
              val("umDisplayName") || null,
            p_is_active: $("umActive").checked,
            p_change_reason:
              "แก้ไข Role โดยใช้ Email และ Manager Scope V6.10.2"
          }
        );

        if (error) throw error;

        toast("บันทึก Role เรียบร้อย","success");
        await loadUsers();

        if (val("umRole") === "MANAGER") {
          await loadManagerScopes(val("umEmail"));
        } else {
          closeModal("userModal");
        }
      } catch (error) {
        toast(humanError(error),"error");
      } finally {
        hideLoading();
      }
    }

    function resetManagerScopeForm(scope = null) {
      const managerEmail =
        String(
          scope?.manager_email
          || val("umEmail")
          || ""
        ).trim().toLowerCase();

      setVal("msScopeId",scope?.scope_id || "");
      setVal("msManagerEmail",managerEmail);
      setText(
        "managerScopeModalTitle",
        scope ? "แก้ไข Manager Scope" : "เพิ่ม Manager Scope"
      );
      setText(
        "managerScopeModalEmail",
        managerEmail || "-"
      );

      setVal(
        "msScopeType",
        scope?.scope_type || "DEPARTMENT"
      );
      setVal("msScopeValue",scope?.scope_value || "");
      setVal("msScopeLabel",scope?.scope_label || "");
      if ($("msIncludeDescendants")) {
        $("msIncludeDescendants").checked =
          scope?.include_descendants === true;
      }
      $("msCanView").checked =
        scope?.can_view !== false;
      $("msCanEdit").checked =
        !!scope?.can_edit_schedule;
      $("msCanConfirm").checked =
        !!scope?.can_confirm_schedule;
      $("msCanCertify").checked =
        !!scope?.can_certify_attendance;
      $("msCanDecide").checked =
        !!scope?.can_decide_shift_request;
      setVal(
        "msEffectiveFrom",
        scope?.effective_from
          ? String(scope.effective_from).slice(0,10)
          : ""
      );
      setVal(
        "msEffectiveTo",
        scope?.effective_to
          ? String(scope.effective_to).slice(0,10)
          : ""
      );
      setVal(
        "msActive",
        scope?.is_active === false
          ? "false"
          : "true"
      );
      setVal("msNote",scope?.note || "");

      updateManagerScopeValueOptions();
    }

    function updateManagerScopeValueOptions() {
      const type = val("msScopeType");
      const list = $("msScopeValueOptions");
      const input = $("msScopeValue");
      if (!list || !input) return;

      let values = [];
      let placeholder = "ระบุค่า Scope";

      if (type === "EMPLOYEE") {
        values = (state.filters.employees || [])
          .map(employee =>
            typeof employee === "string"
              ? employee
              : employee.emp_code
                || employee.employee_id
                || employee.EmployeeId
                || ""
          )
          .filter(Boolean);
        placeholder = "ค้นหารหัสพนักงาน";
      } else if (type === "DEPARTMENT") {
        values =
          state.filters.attendance?.departments || [];
        placeholder = "ค้นหาหน่วยงาน";
      } else if (type === "ZONE") {
        values =
          state.filters.attendance?.areas
          || state.filters.zones
          || [];
        placeholder = "ค้นหา Zone";
      } else if (type === "AREA") {
        values =
          state.filters.attendance?.areas || [];
        placeholder = "ค้นหาพื้นที่";
      } else if (type === "SUB_AREA") {
        values =
          state.filters.attendance?.sub_areas || [];
        placeholder = "ค้นหาพื้นที่ย่อย";
      } else if (type === "ORG_UNIT") {
        values = (
          window.TimeClockOrgStructure?.rows?.() || []
        ).map(item => item.org_code).filter(Boolean);
        placeholder = "ค้นหารหัสหน่วยงาน";
      } else if (type === "ALL") {
        values = ["*"];
        input.value = "*";
        placeholder = "ทั้งหมด";
      }

      list.innerHTML = [
        ...new Set(values.map(String))
      ]
        .sort((a,b) =>
          a.localeCompare(b,"th",{numeric:true})
        )
        .map(value =>
          `<option value="${safe(value)}"></option>`
        )
        .join("");

      input.placeholder = placeholder;
      input.disabled = type === "ALL";
      $("msIncludeDescendantsRow")?.classList.toggle(
        "hidden",
        type !== "ORG_UNIT"
      );
    }

    function openManagerScope(scopeId = null) {
      if (val("umRole") !== "MANAGER") {
        return toast(
          "กรุณาบันทึก Role เป็น MANAGER ก่อนเพิ่ม Scope",
          "error"
        );
      }

      const scope = scopeId
        ? managerScopeRows.find(
            item => item.scope_id === scopeId
          )
        : null;

      resetManagerScopeForm(scope);
      openModal("managerScopeModal");
    }

    async function saveManagerScope() {
      showLoading("กำลังบันทึก Manager Scope...");
      try {
        const { error } = await state.client.rpc(
          "ta_upsert_manager_scope_v690",
          {
            p_scope_id: val("msScopeId") || null,
            p_manager_email: val("msManagerEmail"),
            p_scope_type: val("msScopeType"),
            p_scope_value: val("msScopeValue"),
            p_scope_label:
              val("msScopeLabel") || null,
            p_include_descendants:
              $("msIncludeDescendants")?.checked || false,
            p_can_view: $("msCanView").checked,
            p_can_edit_schedule:
              $("msCanEdit").checked,
            p_can_confirm_schedule:
              $("msCanConfirm").checked,
            p_can_certify_attendance:
              $("msCanCertify").checked,
            p_can_decide_shift_request:
              $("msCanDecide").checked,
            p_effective_from:
              val("msEffectiveFrom") || null,
            p_effective_to:
              val("msEffectiveTo") || null,
            p_is_active:
              val("msActive") === "true",
            p_note: val("msNote") || null
          }
        );

        if (error) throw error;

        closeModal("managerScopeModal");
        toast("บันทึก Manager Scope แล้ว","success");
        await Promise.all([
          loadManagerScopes(val("umEmail")),
          loadUsers()
        ]);
      } catch (error) {
        toast(humanError(error),"error");
      } finally {
        hideLoading();
      }
    }

    async function deleteManagerScope(scopeId) {
      const scope = managerScopeRows.find(
        item => item.scope_id === scopeId
      );

      if (!scope) return;

      if (!confirm(
        `ยืนยันลบ Scope ${managerScopeTypeLabel(scope.scope_type)}: ${scope.scope_value}?`
      )) return;

      showLoading("กำลังลบ Manager Scope...");
      try {
        const { error } = await state.client.rpc(
          "ta_delete_manager_scope_v690",
          {
            p_scope_id: scopeId
          }
        );

        if (error) throw error;

        toast("ลบ Manager Scope แล้ว","success");
        await Promise.all([
          loadManagerScopes(val("umEmail")),
          loadUsers()
        ]);
      } catch (error) {
        toast(humanError(error),"error");
      } finally {
        hideLoading();
      }
    }

    function managerScopeTemplateHeaders() {
      return [
        "manager_email",
        "scope_type",
        "scope_value",
        "scope_label",
        "include_descendants",
        "can_view",
        "can_edit_schedule",
        "can_confirm_schedule",
        "can_certify_attendance",
        "can_decide_shift_request",
        "effective_from",
        "effective_to",
        "is_active",
        "note"
      ];
    }

    function downloadManagerScopeTemplate() {
      const csv =
        "\uFEFF"
        + managerScopeTemplateHeaders().join(",")
        + "\n";

      downloadFile(
        "Manager_Scope_Template_v6.10.2.csv",
        csv,
        "text/csv;charset=utf-8"
      );
    }

    function openManagerScopeUpload() {
      managerScopeUploadRows = [];
      $("managerScopeFile").value = "";
      $("managerScopeReplace").checked = false;
      $("importManagerScopeBtn").disabled = true;
      setText(
        "managerScopeUploadSummary",
        "ยังไม่ได้เลือกไฟล์"
      );
      $("managerScopeUploadBody").innerHTML =
        `<tr><td colspan="9" class="fc-empty">ยังไม่มีข้อมูล Preview</td></tr>`;
      $("managerScopeUploadErrors").classList.add("hidden");
      $("managerScopeUploadErrors").innerHTML = "";
      openModal("managerScopeUploadModal");
    }

    async function previewManagerScopeUpload(file) {
      managerScopeUploadRows = [];

      if (!file) {
        $("importManagerScopeBtn").disabled = true;
        return;
      }

      try {
        const text = await file.text();
        const rows = parseCSV(text);
        const required = [
          "manager_email",
          "scope_type",
          "scope_value"
        ];

        const headers = rows.length
          ? Object.keys(rows[0])
          : [];

        const missing = required.filter(
          header => !headers.includes(header)
        );

        if (missing.length) {
          throw new Error(
            `ไม่พบหัวคอลัมน์ ${missing.join(", ")}`
          );
        }

        managerScopeUploadRows = rows
          .map(row =>
            Object.fromEntries(
              Object.entries(row).map(
                ([key,value]) => [
                  String(key || "").trim(),
                  String(value ?? "").trim()
                ]
              )
            )
          )
          .filter(row =>
            row.manager_email
            || row.scope_type
            || row.scope_value
          );

        setText(
          "managerScopeUploadSummary",
          `${file.name} • ${formatNumber(managerScopeUploadRows.length)} รายการ`
        );

        $("managerScopeUploadBody").innerHTML =
          managerScopeUploadRows.length
            ? managerScopeUploadRows
                .slice(0,50)
                .map((row,index) => `<tr>
                  <td>${index + 2}</td>
                  <td>${safe(row.manager_email)}</td>
                  <td>${safe(row.scope_type)}</td>
                  <td>${safe(row.scope_value)}</td>
                  <td>${safe(row.can_view || "true")}</td>
                  <td>${safe(row.can_edit_schedule || "false")}</td>
                  <td>${safe(row.can_confirm_schedule || "false")}</td>
                  <td>${safe(row.can_certify_attendance || "false")}</td>
                  <td>${safe(row.can_decide_shift_request || "false")}</td>
                </tr>`).join("")
            : `<tr><td colspan="9" class="fc-empty">ไม่พบข้อมูลในไฟล์</td></tr>`;

        $("importManagerScopeBtn").disabled =
          !managerScopeUploadRows.length;
      } catch (error) {
        managerScopeUploadRows = [];
        $("importManagerScopeBtn").disabled = true;
        setText(
          "managerScopeUploadSummary",
          `ตรวจไฟล์ไม่สำเร็จ: ${error.message}`
        );
        toast(error.message,"error");
      }
    }

    async function importManagerScopes() {
      if (!managerScopeUploadRows.length) {
        return toast("กรุณาเลือกไฟล์ Scope","error");
      }

      showLoading("กำลังนำเข้า Manager Scope...");
      try {
        const { data,error } = await state.client.rpc(
          "ta_import_manager_scopes_v690",
          {
            p_rows: managerScopeUploadRows,
            p_replace_existing:
              $("managerScopeReplace").checked
          }
        );

        if (error) throw error;

        if (!data?.success) {
          const errors = Array.isArray(data?.errors)
            ? data.errors
            : [];

          $("managerScopeUploadErrors").classList.remove(
            "hidden"
          );
          $("managerScopeUploadErrors").innerHTML =
            `<strong>พบข้อมูลไม่พร้อมนำเข้า ${formatNumber(data?.invalid_rows || 0)} รายการ</strong>`
            + errors.slice(0,100).map(item =>
              `<div>แถว ${safe(item.row_no)} • ${safe(item.manager_email)} • ${safe(item.error)}</div>`
            ).join("");

          toast(
            "พบข้อมูล Scope ไม่ถูกต้อง กรุณาตรวจ Error",
            "error"
          );
          return;
        }

        closeModal("managerScopeUploadModal");
        toast(
          `นำเข้า Scope สำเร็จ ${formatNumber(data.upserted_rows)} รายการ`,
          "success"
        );
        await loadUsers();
      } catch (error) {
        toast(humanError(error),"error");
      } finally {
        hideLoading();
      }
    }


    function parseCSV(text) {
      const rows = []; let row = [], cell = "", quoted = false;
      for (let i=0;i<text.length;i++) {
        const ch = text[i], next = text[i+1];
        if (ch === '"' && quoted && next === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = !quoted;
        else if (ch === ',' && !quoted) { row.push(cell); cell = ""; }
        else if ((ch === '\n' || ch === '\r') && !quoted) {
          if (ch === '\r' && next === '\n') i++;
          row.push(cell); if (row.some(x => x.trim() !== "")) rows.push(row); row = []; cell = "";
        } else cell += ch;
      }
      row.push(cell); if (row.some(x => x.trim() !== "")) rows.push(row);
      if (!rows.length) return [];
      const headers = rows.shift().map((x,i) => (i===0 ? x.replace(/^\uFEFF/,"") : x).trim());
      return rows.map(r => Object.fromEntries(headers.map((h,i) => [h, (r[i] ?? "").trim()])));
    }

    async function runEmployeeImport(previewOnly) {
      const file = $("employeeFile").files[0]; if (!file) return toast("กรุณาเลือกไฟล์ CSV", "error");
      showLoading(previewOnly ? "กำลังตรวจสอบไฟล์..." : "กำลังนำเข้าพนักงาน...");
      try {
        const sourceRows = parseCSV(
          await file.text()
        );

        if (!sourceRows.length) {
          throw new Error("ไม่พบข้อมูลในไฟล์");
        }

        const orgResponse =
          await state.client.rpc(
            "ta_get_org_tree_v6101",
            {
              p_include_inactive: true
            }
          );

        if (orgResponse.error) {
          throw orgResponse.error;
        }

        const orgLocationMap = new Map(
          (orgResponse.data || []).map(
            unit => [
              String(unit.org_code || "").trim(),
              {
                zone: String(unit.zone || "").trim(),
                area: String(unit.area || "").trim(),
                sub_area: String(unit.sub_area || "").trim()
              }
            ]
          )
        );

        const employeeOrgErrors =
          sourceRows
            .map((row,index) => {
              const orgCode = String(
                row.org_code || ""
              ).trim();

              if (!orgCode) {
                return `แถว ${index + 2}: org_code ว่าง`;
              }

              if (!orgLocationMap.has(orgCode)) {
                return `แถว ${index + 2}: ไม่พบ org_code ${orgCode}`;
              }

              const location =
                orgLocationMap.get(orgCode);

              const zone = location.zone;

              if (
                zone !== "กรุงเทพฯ"
                && zone !== "ตจว."
                && zone !== "สำนักงาน"
              ) {
                return `แถว ${index + 2}: หน่วยงาน ${orgCode} ยังไม่ได้กำหนด Zone`;
              }

              return null;
            })
            .filter(Boolean);

        if (employeeOrgErrors.length) {
          throw new Error(
            employeeOrgErrors
              .slice(0,10)
              .join(" | ")
          );
        }

        const rows = sourceRows.map(
          row => {
            const location = orgLocationMap.get(
              String(row.org_code || "").trim()
            );

            return {
              ...row,
              zone: location?.zone || "",
              area: location?.area || "",
              sub_area: location?.sub_area || ""
            };
          }
        );

        const { data, error } =
          await state.client.rpc(
            "ta_import_employees",
            {
              p_rows: rows,
              p_file_name: file.name,
              p_preview_only: previewOnly,
              p_note:
                val("importNote")
                || null
            }
          );
        if (error) throw error;

        const structureResponse =
          await state.client.rpc(
            "ta_sync_employee_structure_v696",
            {
              p_rows: rows,
              p_preview_only: previewOnly
            }
          );

        if (structureResponse.error) {
          throw structureResponse.error;
        }

        const structure =
          structureResponse.data || {};

        const r =
          Array.isArray(data)
            ? data[0]
            : data;

        const structureErrors =
          Array.isArray(structure.errors)
            ? structure.errors
            : [];

        $("importResult").innerHTML =
          `<div class="panel employee-import-result">
            <div class="panel-body">
              <div class="employee-import-kpis">
                <div>
                  <small>สถานะ</small>
                  <strong>${safe(
                    structure.success === false
                      ? "ตรวจพบข้อผิดพลาด"
                      : r.import_status
                  )}</strong>
                </div>
                <div>
                  <small>ทั้งหมด</small>
                  <strong>${formatNumber(
                    r.total_rows
                  )}</strong>
                </div>
                <div>
                  <small>ถูกต้อง</small>
                  <strong>${formatNumber(
                    structure.valid_rows
                    ?? r.valid_rows
                  )}</strong>
                </div>
                <div>
                  <small>เพิ่มใหม่</small>
                  <strong>${formatNumber(
                    r.inserted_rows
                  )}</strong>
                </div>
                <div>
                  <small>ปรับปรุงข้อมูลหลัก</small>
                  <strong>${formatNumber(
                    r.updated_rows
                  )}</strong>
                </div>
                <div>
                  <small>Email / ผังองค์กร</small>
                  <strong>${formatNumber(
                    structure.updated_rows
                    ?? 0
                  )}</strong>
                </div>
                <div>
                  <small>org_code ไม่ถูกต้อง</small>
                  <strong>${formatNumber(
                    structure.invalid_org_rows
                    ?? 0
                  )}</strong>
                </div>
                <div>
                  <small>Email ซ้ำ</small>
                  <strong>${formatNumber(
                    structure.duplicate_email_rows
                    ?? 0
                  )}</strong>
                </div>
              </div>
              ${
                structureErrors.length
                  ? `<div class="employee-import-errors">
                      <strong>
                        พบข้อมูลไม่พร้อมนำเข้า
                        ${formatNumber(
                          structure.invalid_rows || 0
                        )} รายการ
                      </strong>
                      ${structureErrors
                        .slice(0,100)
                        .map(item =>
                          `<div>
                            แถว ${safe(item.row_no)}
                            • ${safe(item.employee_id)}
                            • ${safe(item.error)}
                          </div>`
                        )
                        .join("")}
                    </div>`
                  : ""
              }
            </div>
          </div>`;

        if (structure.success === false) {
          toast(
            "พบ Email หรือ org_code ไม่ถูกต้อง กรุณาตรวจสอบรายละเอียด",
            "error"
          );
        } else {
          toast(
            previewOnly
              ? "ตรวจสอบไฟล์เรียบร้อย"
              : "นำเข้าข้อมูลเรียบร้อย",
            "success"
          );
        }
      } catch (err) { toast(humanError(err), "error"); } finally { hideLoading(); }
    }

    function downloadTemplate() {
      const headers = [
        "employee_id",
        "full_name",
        "email",
        "position_name",
        "department",
        "org_code",
        "pc",
        "car_team",
        "start_date",
        "resign_date"
      ];

      downloadFile(
        "Employee_Template_v6.10.2.csv",
        "\uFEFF"
          + headers.join(",")
          + "\n",
        "text/csv;charset=utf-8"
      );
    }

    function exportAttendance() {
      if (!state.attendance.length) {
        return toast("ไม่มีข้อมูลสำหรับ Export","error");
      }

      const matrix = attendanceExportMatrix(
        state.attendance
      );
      const csv = "\uFEFF"
        + matrix
          .map(row => row.map(csvCell).join(","))
          .join("\n");

      downloadFile(
        `Attendance_${val("attStart")}_${val("attEnd")}.csv`,
        csv,
        "text/csv;charset=utf-8"
      );
    }
    const csvCell = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
    function downloadFile(name, content, type) { const blob = new Blob([content], {type}); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }

    function switchPage(page) {
      const realRole = String(
        state.profile?._realRole
        || state.profile?.role
        || "VIEWER"
      ).toUpperCase();
      const effectiveRole = String(
        state.profile?.role || realRole
      ).toUpperCase();

      const managerPages = new Set([
        "schedule",
        "work-patterns"
      ]);

      if (
        page === "system-settings"
        && realRole !== "HR_ADMIN"
      ) {
        return toast(
          "เมนูนี้สำหรับ HR_ADMIN เท่านั้น",
          "error"
        );
      }
      if (
        page.startsWith("admin-")
        && effectiveRole !== "HR_ADMIN"
      ) {
        return toast(
          "ไม่มีสิทธิ์เข้าถึงเมนูนี้",
          "error"
        );
      }
      if (
        managerPages.has(page)
        && !["HR_ADMIN","MANAGER"].includes(
          effectiveRole
        )
      ) {
        return toast(
          "Viewer ไม่มีสิทธิ์จัดการกะหรือทีมงาน",
          "error"
        );
      }
      state.currentPage = page;
      qsa(".page").forEach(x => x.classList.toggle("active", x.id === `page-${page}`));
      qsa(".nav-item").forEach(x => x.classList.toggle("active", x.dataset.page === page));
      const titles = {
        dashboard:["Dashboard","ภาพรวมการลงเวลาและการจัดกะ"], attendance:["รายละเอียดเวลาทำงาน","ตรวจเวลาเข้า–ออกและผลการคำนวณ"], "shift-requests":["คำขอแก้ไขกะ","พนักงานส่งคำขอ และ Manager พิจารณาตามสายบังคับบัญชา"], schedule:["ปฏิทินจัดกะ","จัดกะล่วงหน้าได้ทุกวัน รวมวันหยุดประจำสัปดาห์และวันหยุดนักขัตฤกษ์"], "work-patterns":["รูปแบบการทำงาน","กำหนดกลุ่ม 5/6 วัน วันหยุดตั้งต้น และรูปแบบช่วงงานรายบุคคล"], report:["ศูนย์รายงาน","สร้างและส่งออกรายงานจากข้อมูล Time-Clock"],
        "admin-center":["HR Admin Center","ศูนย์บริหารและตรวจสอบสถานะระบบ"], "admin-attendance-rebuild":["ประมวลผล Attendance","ประมวลผลใหม่ตามช่วงวันที่ พร้อม Progress และ Error Log"], "admin-shifts":["ตั้งค่ากะทำงาน","จัดการข้อมูลกะมาตรฐาน"], "system-settings":["System Settings","ตั้งค่าระบบและ Developer Console"], "admin-holidays":["วันหยุดนักขัตฤกษ์","จัดการวันหยุดและประมวลผล Attendance"], "admin-org":["ผังโครงสร้างองค์กร","จัดการหน่วยงาน Manager และ Scope ตามลำดับชั้น"], "admin-accounts":["จัดการบัญชีผู้ใช้งาน","สร้างบัญชี กำหนด Role และติดตาม First Login"], "admin-users":["User และสิทธิ์","กำหนด Role และ Manager Scope ด้วย Email"], "admin-import":["นำเข้าพนักงาน","ตรวจสอบและนำเข้าข้อมูล CSV"], "admin-time-import":["นำเข้าข้อมูลลงเวลา CSV","นำเข้า EmployeeId วันที่ เวลา เข้า/ออก และ GPS จาก CSV UTF-8"]
      };
      setText("pageTitle", titles[page]?.[0] || page);
      setText("pageSubtitle", titles[page]?.[1] || "");
      $("sidebar").classList.remove("open");
      $("sidebarScrim")?.classList.remove("active");
      $("mobileMenuBtn")?.setAttribute(
        "aria-expanded",
        "false"
      );
      document.body.classList.remove(
        "sidebar-mobile-open"
      );
      if (page === "attendance" && !state.attendance.length) loadAttendance();
      if (page === "shift-requests") window.TimeClockV680?.loadShiftRequests?.();
      if (page === "schedule" && !state.schedule.length) loadSchedule();
      if (page === "admin-shifts") loadShiftMaster();
      if (page === "admin-holidays") loadHolidays();
      if (page === "admin-org") window.TimeClockOrgStructure?.load?.();
      if (page === "admin-accounts") window.TimeClockUserAccounts?.load?.();
      if (page === "admin-users") loadUsers();
    }

    function bindEvents() {
      $("loginForm").addEventListener("submit", async e => { e.preventDefault(); if (!state.client) return openModal("configModal"); showLoading("กำลังเข้าสู่ระบบ..."); try { const { error } = await state.client.auth.signInWithPassword({ email: val("loginEmail").trim(), password: val("loginPassword") }); if (error) throw error; const { data:{session} } = await state.client.auth.getSession(); state.session=session; state.user=session.user; await enterApp(); } catch(err){toast(humanError(err),"error");} finally{hideLoading();} });
      $("loginPasswordToggle")?.addEventListener(
        "click",
        toggleLoginPasswordVisibility
      );
      $("logoutBtn").addEventListener("click", async () => { if (state.client) await state.client.auth.signOut(); showLogin(); });
      $("openConfigFromLogin").addEventListener("click", () => openModal("configModal"));
      $("configBtn").addEventListener("click", () => { const c=getConfig(); setVal("configUrl",c?.url); setVal("configKey",c?.key); openModal("configModal"); });
      $("saveConfigBtn").addEventListener("click", () => { const url=val("configUrl").trim(), key=val("configKey").trim(); if(!url||!key) return toast("กรุณากรอก URL และ Key", "error"); saveConfig(url,key); closeModal("configModal"); toast("บันทึกการตั้งค่าแล้ว กรุณาโหลดหน้าใหม่", "success"); setTimeout(()=>location.reload(),700); });
      qsa("[data-close-modal]").forEach(b => b.addEventListener("click", () => closeModal(b.dataset.closeModal)));
      qsa(".nav-item").forEach(b => b.addEventListener("click", () => switchPage(b.dataset.page)));
      $("mobileMenuBtn").addEventListener("click", () => {
        const sidebar = $("sidebar");
        const scrim = $("sidebarScrim");
        const open = !sidebar.classList.contains("open");

        sidebar.classList.toggle("open", open);
        scrim?.classList.toggle("active", open);
        $("mobileMenuBtn").setAttribute(
          "aria-expanded",
          open ? "true" : "false"
        );
        document.body.classList.toggle(
          "sidebar-mobile-open",
          open
        );
      });

      $("sidebarScrim")?.addEventListener("click", () => {
        $("sidebar")?.classList.remove("open");
        $("sidebarScrim")?.classList.remove("active");
        $("mobileMenuBtn")?.setAttribute(
          "aria-expanded",
          "false"
        );
        document.body.classList.remove(
          "sidebar-mobile-open"
        );
      });

      document.addEventListener("keydown", event => {
        if (event.key !== "Escape") return;

        $("sidebar")?.classList.remove("open");
        $("sidebarScrim")?.classList.remove("active");
        $("mobileMenuBtn")?.setAttribute(
          "aria-expanded",
          "false"
        );
        document.body.classList.remove(
          "sidebar-mobile-open"
        );
      });
      $("loadDashboardBtn").addEventListener("click", loadDashboard);
      $("loadAttendanceBtn").addEventListener("click", loadAttendance);
      $("attZone")?.addEventListener(
        "change",
        async () => {
          setVal("attSubArea","");
          setVal("attDepartment","");
          await loadAttendanceFilterOptions(true);
        }
      );
      $("attSubArea")?.addEventListener(
        "change",
        async () => {
          setVal("attDepartment","");
          await loadAttendanceFilterOptions(true);
        }
      );
      $("attDepartment")?.addEventListener(
        "change",
        () => {
          invalidateAttendanceEmployeeOptions(
            true
          );
        }
      );
      $("attStart")?.addEventListener(
        "change",
        () => loadAttendanceFilterOptions(true)
      );
      $("attEnd")?.addEventListener(
        "change",
        () => loadAttendanceFilterOptions(true)
      );

      $("attEmployeeToggle")?.addEventListener(
        "click",
        event => {
          event.stopPropagation();

          toggleAttendanceEmployeeDropdown()
            .catch(error => {
              toast(
                humanError(error),
                "error"
              );
            });
        }
      );

      $("attEmployeeDropdown")?.addEventListener(
        "click",
        event => event.stopPropagation()
      );

      $("attEmployeeSearch")?.addEventListener(
        "input",
        event => {
          attendanceEmployeeFilter.search =
            event.target.value || "";
          attendanceEmployeeFilter.page = 1;
          renderAttendanceEmployeeDropdown();
        }
      );

      $("attEmployeeList")?.addEventListener(
        "change",
        event => {
          const checkbox = event.target.closest(
            'input[type="checkbox"]'
          );
          if (!checkbox) return;

          if (checkbox.checked) {
            attendanceEmployeeFilter.selected.add(
              checkbox.value
            );
          } else {
            attendanceEmployeeFilter.selected.delete(
              checkbox.value
            );
          }

          renderAttendanceEmployeeDropdown();
        }
      );

      $("attEmployeeSelectPage")?.addEventListener(
        "click",
        () => {
          const { rows } =
            attendanceEmployeePageOptions();
          const codes = rows.map(
            employee => employee.emp_code
          );
          const allSelected = Boolean(
            codes.length
            && codes.every(code =>
              attendanceEmployeeFilter.selected.has(code)
            )
          );

          codes.forEach(code => {
            if (allSelected) {
              attendanceEmployeeFilter.selected.delete(code);
            } else {
              attendanceEmployeeFilter.selected.add(code);
            }
          });

          renderAttendanceEmployeeDropdown();
        }
      );

      $("attEmployeeSelectAll")?.addEventListener(
        "click",
        () => {
          const codes =
            attendanceEmployeeFilteredOptions().map(
              employee => employee.emp_code
            );
          const allSelected = Boolean(
            codes.length
            && codes.every(code =>
              attendanceEmployeeFilter.selected.has(code)
            )
          );

          codes.forEach(code => {
            if (allSelected) {
              attendanceEmployeeFilter.selected.delete(code);
            } else {
              attendanceEmployeeFilter.selected.add(code);
            }
          });

          renderAttendanceEmployeeDropdown();
        }
      );

      $("attEmployeeClear")?.addEventListener(
        "click",
        () => {
          attendanceEmployeeFilter.selected.clear();
          renderAttendanceEmployeeDropdown();
        }
      );

      $("attEmployeePrev")?.addEventListener(
        "click",
        () => {
          attendanceEmployeeFilter.page = Math.max(
            1,
            attendanceEmployeeFilter.page - 1
          );
          renderAttendanceEmployeeDropdown();
        }
      );

      $("attEmployeeNext")?.addEventListener(
        "click",
        () => {
          attendanceEmployeeFilter.page += 1;
          renderAttendanceEmployeeDropdown();
        }
      );

      document.addEventListener(
        "click",
        event => {
          if (
            !event.target.closest(
              "#attEmployeeMulti"
            )
          ) {
            toggleAttendanceEmployeeDropdown(false);
          }
        }
      );

      document.addEventListener(
        "keydown",
        event => {
          if (event.key === "Escape") {
            toggleAttendanceEmployeeDropdown(false);
          }
        }
      );
      $("loadScheduleBtn").addEventListener("click", loadSchedule);

      $("scheduleZone")?.addEventListener(
        "change",
        async () => {
          try {
            const period =
              syncSchedulePeriodUI();

            await loadScheduleFilterOptions(
              period,
              val("scheduleZone")
            );
          } catch(error) {
            toast(
              humanError(error),
              "error"
            );
          }
        }
      );

      $("scheduleSearch").addEventListener("input", renderSchedule);
      $("schedulePatternFilter")?.addEventListener("change", renderSchedule);
      $("schedulePatternSummary")?.addEventListener("click", event => {
        const chip = event.target.closest("[data-schedule-pattern-chip]");
        if (!chip) return;
        setVal(
          "schedulePatternFilter",
          chip.dataset.schedulePatternChip || ""
        );
        renderSchedule();
      });
      $("saveAssignmentBtn").addEventListener("click", saveAssignment);
      $("deleteAssignmentBtn").addEventListener("click", deleteAssignment);
      $("assignConfirm")?.addEventListener("change", updateAssignConfirmHelp);
      $("newShiftBtn").addEventListener("click", resetNewShiftForm);
      $("saveShiftMasterBtn").addEventListener("click", saveShiftMaster);
      $("shiftPatternFilter")?.addEventListener("change", renderShiftMasterTable);
      $("shiftRecalcBtn")?.addEventListener("click", recalculateShiftPattern);
      $("smPattern6")?.addEventListener("change", () => handleShiftPatternSelection("TECH_6D"));
      $("smPattern5")?.addEventListener("change", () => handleShiftPatternSelection("TECH_5D"));
      ["smStart","smEnd","smBreak","smDefault6","smDefault5","smWorkday","smNight"].forEach(id => {
        $(id)?.addEventListener("change", updateShiftDurationSummary);
        if (["smStart","smEnd","smBreak"].includes(id)) $(id)?.addEventListener("input", updateShiftDurationSummary);
      });
      $("newHolidayBtn").addEventListener("click", () => { setVal("holDate","");setVal("holName","");setVal("holSource","HR_ADMIN");setVal("holNote","");$("holDate").disabled=false;openModal("holidayModal"); });
      $("saveHolidayBtn").addEventListener("click", saveHoliday);
      $("reloadUsersBtn").addEventListener("click", loadUsers);
      $("saveUserBtn").addEventListener("click", saveUser);
      $("umRole")?.addEventListener(
        "change",
        () => {
          toggleUserManagerScopeSection();
          if (val("umRole") === "MANAGER") {
            loadManagerScopes(val("umEmail"));
          }
        }
      );
      $("newManagerScopeBtn")?.addEventListener(
        "click",
        () => openManagerScope()
      );
      $("saveManagerScopeBtn")?.addEventListener(
        "click",
        saveManagerScope
      );
      $("msScopeType")?.addEventListener(
        "change",
        updateManagerScopeValueOptions
      );
      $("managerScopeUploadBtn")?.addEventListener(
        "click",
        openManagerScopeUpload
      );
      $("managerScopeTemplateBtn")?.addEventListener(
        "click",
        downloadManagerScopeTemplate
      );
      $("managerScopeUploadTemplateBtn")?.addEventListener(
        "click",
        downloadManagerScopeTemplate
      );
      $("managerScopeFile")?.addEventListener(
        "change",
        event => previewManagerScopeUpload(
          event.target.files?.[0]
        )
      );
      $("importManagerScopeBtn")?.addEventListener(
        "click",
        importManagerScopes
      );
      $("previewImportBtn").addEventListener("click", () => runEmployeeImport(true));
      $("runImportBtn").addEventListener("click", () => runEmployeeImport(false));
      $("downloadTemplateBtn").addEventListener("click", downloadTemplate);
      document.addEventListener("click", e => {
        const go=e.target.closest("[data-go-page]"); if(go) switchPage(go.dataset.goPage);
        const ra=e.target.closest("[data-review-assign]"); if(ra) openAssignment(ra.dataset.emp,ra.dataset.date);
        const es=e.target.closest("[data-edit-shift]"); if(es) editShift(es.dataset.editShift);
        const eh=e.target.closest("[data-edit-holiday]"); if(eh) editHoliday(eh.dataset.editHoliday);
        const dh=e.target.closest("[data-delete-holiday]"); if(dh) deleteHoliday(dh.dataset.deleteHoliday);
        const eu=e.target.closest("[data-edit-user]");
        if(eu) editUser(eu.dataset.editUser);

        const editScope=e.target.closest(
          "[data-edit-manager-scope]"
        );
        if(editScope){
          openManagerScope(
            editScope.dataset.editManagerScope
          );
        }

        const deleteScope=e.target.closest(
          "[data-delete-manager-scope]"
        );
        if(deleteScope){
          deleteManagerScope(
            deleteScope.dataset.deleteManagerScope
          );
        }
      });
    }

    function badge(text, cls="badge-gray") { return `<span class="badge ${cls}">${safe(text ?? "-")}</span>`; }
    function shiftBadgeClass(code) {
      const value = String(code || "").toUpperCase();
      if (value === "D" || value === "D5" || value === "D6" || value.startsWith("D-")) return "badge-blue";
      if (value === "N" || value.startsWith("N")) return "badge-amber";
      if (value === "HOL") return "badge-orange";
      return "badge-gray";
    }
    function statusBadgeClass(s) {
      const status = String(s || "").toUpperCase();
      if (status === "LEAVE") return "badge-purple";
      if (["NORMAL","HOLIDAY","WEEKLY_OFF","DAY_OFF"].includes(status)) {
        return "badge-green";
      }
      if ([
        "LATE","EARLY_LEAVE","LATE_AND_EARLY",
        "LATE_AND_EARLY_LEAVE","OVERTIME",
        "WORKED_ON_OFFDAY","WORKED_ON_WEEKLY_OFF",
        "WORKED_ON_HOLIDAY","WORKED_ON_COMP_OFF"
      ].includes(status)) {
        return "badge-orange";
      }
      if ([
        "ABSENT","ABSENCE","MISSING_IN","MISSING_OUT",
        "MISSING_BOTH","INVALID_TIME","NEED_REVIEW"
      ].includes(status)) {
        return "badge-red";
      }
      return "badge-gray";
    }
    function attendanceLabel(s) { return ({ NORMAL:"ปกติ",ABSENT:"ขาดงาน",ABSENCE:"ขาดงาน",DAY_OFF:"วันหยุด",MISSING_IN:"ไม่พบเวลาเข้า",MISSING_OUT:"ไม่พบเวลาออก",INVALID_TIME:"เวลาไม่ถูกต้อง",LATE:"มาสาย",EARLY_LEAVE:"กลับก่อน",LATE_AND_EARLY:"สายและกลับก่อน",WORKED_ON_OFFDAY:"ทำงานวันหยุด",WORKED_ON_WEEKLY_OFF:"ทำงานวันหยุดประจำสัปดาห์",WORKED_ON_HOLIDAY:"ทำงานวันหยุดนักขัตฤกษ์",WORKED_ON_COMP_OFF:"ทำงานวันหยุดชดเชย",OVERTIME:"มี OT",LATE_AND_EARLY_LEAVE:"สายและกลับก่อน",WORKDAY:"วันทำงาน",COMP_OFF:"วันหยุดชดเชย",LEAVE:"วันลา",NEED_REVIEW:"รอตรวจสอบ",HOLIDAY:"นักขัตฤกษ์",WEEKLY_OFF:"วันหยุดประจำสัปดาห์",INCOMPLETE_TIME:"เวลาไม่ครบ",COMPLETE:"ครบ",NO_TIME:"ไม่มีเวลา",LEAVE_APPROVED:"อนุมัติลา",LEAVE_WITH_TIME:"ลาแต่มีเวลา",PARTIAL_LEAVE:"ลาบางส่วน",PARTIAL_LEAVE_NO_TIME:"ลาบางส่วนแต่ไม่มีเวลา"})[s] || s || "-"; }
    function emptyRow(cols) { return `<tr><td colspan="${cols}" class="table-empty">ไม่พบข้อมูล</td></tr>`; }
    function humanError(err) {
      const msg = err?.message || err?.error_description || String(err || "เกิดข้อผิดพลาด");
      if (msg.includes("SCHEDULE_HAS_UNCONFIRMED_SHIFTS")) {
        const count = msg.match(/SCHEDULE_HAS_UNCONFIRMED_SHIFTS:\s*(\d+)/)?.[1];
        return `ยังมีกะที่จัดไว้แต่ยังไม่ยืนยัน${count ? ` ${Number(count).toLocaleString("th-TH")} รายการ` : ""} กรุณายืนยันกะก่อนประกาศหรือล็อกเดือน`;
      }
      if (msg.includes("SCHEDULE_MONTH_LOCKED")) return "ตารางกะเดือนนี้ถูกล็อก กรุณาปลดล็อกก่อนแก้ไข";
      if (msg.includes("SCHEDULE_PUBLISH_PERMISSION_DENIED")) return "บัญชีนี้ไม่มีสิทธิ์ประกาศหรือล็อกตารางกะ";
      if (msg.includes("HR_ADMIN_REQUIRED")) return "เมนูนี้สำหรับ HR_ADMIN เท่านั้น";
      if (msg.includes("SECURE_SCHEDULE_RANGE_RPC_REQUIRED")) return "กรุณารัน SQL V6.10.29 เพื่อโหลดตารางกะตาม User Scope";
      if (msg.includes("SECURE_SCHEDULE_SCOPE_RPC_REQUIRED")) return "กรุณารัน SQL V6.10.29 เพื่อเปิดใช้งาน Schedule แบบกรอง User Scope";
      if (msg.includes("SECURE_SCHEDULE_RPC_REQUIRED")) return "กรุณารัน SQL V6.10.29 ก่อนบันทึกหรือแก้ไขกะ";
      if (msg.includes("SECURE_SCOPE_FILTER_RPC_REQUIRED")) return "กรุณารัน SQL V6.10.29 เพื่อโหลดตัวกรองตาม User Scope";
      if (msg.includes("SECURE_ATTENDANCE_FILTER_RPC_REQUIRED")) return "กรุณารัน SQL V6.10.29 เพื่อโหลดตัวกรอง Attendance ตาม User Scope";
      if (msg.includes("MISSING_V61028")) return "กรุณารัน SQL V6.10.28 ก่อนติดตั้ง V6.10.29";
      if (msg.includes("ATTENDANCE_RECALC")) return "บันทึกกะไม่สำเร็จ เนื่องจากการประมวลผล Attendance ใหม่ไม่สำเร็จ ระบบไม่ได้บันทึกกะบางส่วน";
      if (msg.includes("MANAGER_SELF_SCHEDULE_FORBIDDEN")) return "Manager สามารถดูตารางกะของตนเองได้ แต่ไม่สามารถจัดกะ แก้ไข ยืนยัน หรือลบกะของตนเอง";
      if (msg.includes("ACTIVE_MANAGER_PROFILE_NOT_FOUND_FOR_EMAIL")) return "ไม่พบ Profile ที่เป็น MANAGER และ Active สำหรับ Email นี้ กรุณาตรวจ Role ก่อนเพิ่ม Scope";
      if (msg.includes("SHIFT_BEFORE_EMPLOYEE_START_DATE")) return "ไม่สามารถกำหนดกะก่อนวันเริ่มงานของพนักงานได้ กรุณาเลือกวันที่ตั้งแต่วันเริ่มงานเป็นต้นไป";
      if (msg.includes("SHIFT_NOT_APPLICABLE_TO_WORK_PATTERN")) return "กะที่เลือกไม่รองรับรูปแบบการทำงาน 5 วัน/6 วันของพนักงาน กรุณาเลือกกะให้ตรงกลุ่ม";
      if (msg.includes("DEFAULT_SHIFT_DURATION_NOT_MATCH_PATTERN")) return "กะตั้งต้นต้องมีชั่วโมงรวมพักและชั่วโมงสุทธิตรงตามมาตรฐานของรูปแบบการทำงาน";
      if (msg.includes("SHIFT_REQUIRES_WORK_PATTERN")) return "กรุณาเลือกรูปแบบการทำงานอย่างน้อย 1 รูปแบบสำหรับกะนี้";
      if (msg.includes("WORKDAY_SHIFT_REQUIRES_START_AND_END")) return "กะวันทำงานต้องระบุเวลาเริ่มและเวลาสิ้นสุด";
      if (msg.includes("WORK_PATTERN_NOT_FOUND")) return "ไม่พบรูปแบบการทำงานของพนักงานในวันที่เลือก";
      return msg;
    }

    window.TimeClockApp = Object.assign(window.TimeClockApp || {}, {
      state,
      loadAttendance,
      renderAttendance,
      loadSchedule,
      renderSchedule,
      scheduleRowPattern,
      scheduleFilteredRows,
      openAssignment,
      toast,
      showLoading,
      hideLoading,
      humanError,
      formatNumber,
      formatDate,
      formatDateTime,
      formatTime,
      minutesToHours,
      attendanceShiftCode,
      attendanceShiftTime,
      normalizeTemplateCodeV665,
      attendanceAbsenceMinutes,
      attendanceDisplayStatus,
      attendanceDisplayLabel,
      attendanceIsColumnVisible,
      attendanceExportMatrix,
      loadAttendanceFilterOptions,
      loadAttendanceEmployeeOptions,
      attendanceEmployeeCodesForQuery,
      selectAttendanceEmployees,
      attendanceLabel,
      downloadFile,
      openModal,
      closeModal,
      ensureSupabaseClient,
      applyProfile,
      switchPage
    });

    document.addEventListener("DOMContentLoaded", boot);

;

/* ===== js/enhancements.js ===== */
'use strict';

(function enhanceUI() {
  function ready(callback) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', callback, { once: true });
    else callback();
  }

  ready(() => {
    const main = document.querySelector('.main-shell');
    if (main && !main.id) main.id = 'mainContent';

    const skip = document.createElement('a');
    skip.href = '#mainContent';
    skip.className = 'skip-link';
    skip.textContent = 'ข้ามไปยังเนื้อหาหลัก';
    document.body.prepend(skip);

    const heading = document.querySelector('.page-heading');
    if (heading && !document.getElementById('connectionState')) {
      const connection = document.createElement('span');
      connection.id = 'connectionState';
      connection.className = `connection-state ${navigator.onLine ? 'online' : 'offline'}`;
      connection.textContent = navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์';
      heading.appendChild(connection);

      const update = () => {
        connection.className = `connection-state ${navigator.onLine ? 'online' : 'offline'}`;
        connection.textContent = navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์';
      };
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
    }

    document.addEventListener('click', (event) => {
      const nav = event.target.closest('[data-page]');
      if (!nav) return;
      requestAnimationFrame(() => {
        const page = document.querySelector('.page.active');
        if (!page) return;
        page.classList.remove('page-enter');
        void page.offsetWidth;
        page.classList.add('page-enter');
      });
    });
  });
})();

;

/* ===== js/dashboard-enterprise.js ===== */
(() => {
  const $ = id => document.getElementById(id);
  const fmt = n => new Intl.NumberFormat('th-TH').format(Number(n || 0));
  const pct = (n,d) => d > 0 ? Math.max(0, Math.min(100, Math.round(Number(n||0) / Number(d||1) * 100))) : 0;

  function applyTheme(theme){
    document.body.classList.toggle('theme-dark', theme === 'dark');
    localStorage.setItem('tc_theme', theme);
    if ($('themeToggleBtn')) $('themeToggleBtn').textContent = theme === 'dark' ? '☀' : '☾';
  }
  function bootEnterprise(){
    applyTheme(localStorage.getItem('tc_theme') || 'light');
    $('themeToggleBtn')?.addEventListener('click', () => applyTheme(document.body.classList.contains('theme-dark') ? 'light' : 'dark'));
    const collapseBtn =
      $('sidebarCollapseBtn');

    const navItems =
      [...document.querySelectorAll(
        '.sidebar .nav-item'
      )];

    navItems.forEach(item => {
      const text =
        item.querySelector(
          '.nav-text'
        )?.textContent
          ?.trim()
        || item.textContent
          ?.trim()
        || '';

      if (text) {
        item.dataset.navTooltip =
          text;
        item.title =
          text;
      }
    });

    function syncSidebarCollapseButton() {
      const collapsed =
        document.body.classList.contains(
          'sidebar-collapsed'
        );

      if (!collapseBtn) return;

      collapseBtn.setAttribute(
        'aria-pressed',
        collapsed ? 'true' : 'false'
      );
      collapseBtn.setAttribute(
        'aria-label',
        collapsed ? 'ขยายเมนู' : 'ย่อเมนู'
      );
      collapseBtn.title =
        collapsed ? 'ขยายเมนู' : 'ย่อเมนู';

      const icon =
        collapseBtn.querySelector(
          '.sidebar-collapse-icon'
        );

      if (icon) {
        icon.textContent =
          collapsed ? '›' : '‹';
      }
    }

    function setSidebarCollapsed(
      collapsed,
      persist = true
    ) {
      document.body.classList.toggle(
        'sidebar-collapsed',
        Boolean(collapsed)
      );

      if (persist) {
        localStorage.setItem(
          'tc_sidebar_collapsed',
          collapsed ? '1' : '0'
        );
      }

      syncSidebarCollapseButton();
    }

    collapseBtn?.addEventListener(
      'click',
      () => {
        if (
          window.matchMedia(
            '(max-width: 900px)'
          ).matches
        ) {
          return;
        }

        setSidebarCollapsed(
          !document.body.classList.contains(
            'sidebar-collapsed'
          )
        );
      }
    );

    setSidebarCollapsed(
      localStorage.getItem(
        'tc_sidebar_collapsed'
      ) === '1',
      false
    );

    window.addEventListener(
      'resize',
      () => {
        syncSidebarCollapseButton();

        if (
          window.innerWidth > 900
        ) {
          $('sidebar')?.classList.remove(
            'open'
          );
          $('sidebarScrim')?.classList.remove(
            'active'
          );
          document.body.classList.remove(
            'sidebar-mobile-open'
          );
          $('mobileMenuBtn')?.setAttribute(
            'aria-expanded',
            'false'
          );
        }
      }
    );
    $('clearDashboardFilterBtn')?.addEventListener('click', () => {
      const end = new Date();
      const start = new Date(end); start.setDate(start.getDate()-30);
      const iso = d => d.toISOString().slice(0,10);
      if ($('dashStart')) $('dashStart').value = iso(start);
      if ($('dashEnd')) $('dashEnd').value = iso(end);
      if ($('dashZone')) $('dashZone').value = '';
      if ($('dashDepartment')) $('dashDepartment').value = '';
      $('loadDashboardBtn')?.click();
    });
    $('globalSearch')?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const q = e.currentTarget.value.trim().toLowerCase();
      const map = [
        [['dashboard','ภาพรวม'], 'dashboard'], [['เวลา','attendance','รายละเอียด'], 'attendance'],
        [['กะ','schedule','ปฏิทิน'], 'schedule'], [['ตรวจ','ผิดปกติ'], 'attendance'],
        [['ผู้ใช้','user','scope'], 'admin-users'], [['วันหยุด','holiday'], 'admin-holidays'], [['นำเข้า','import'], 'admin-import']
      ];
      const found = map.find(([keys]) => keys.some(k => q.includes(k)));
      if (found) document.querySelector(`[data-page="${found[1]}"]`)?.click();
    });
  }

  function enhanceDashboard(){
    const kpiHost = $('dashboardKpis');
    if (!kpiHost) return;
    const observer = new MutationObserver(() => {
      const cards = [...kpiHost.querySelectorAll('.kpi-card')];
      if (!cards.length || cards[0].dataset.enterprise === '1') return;
      const values = cards.map(c => Number((c.querySelector('.kpi-value')?.textContent || '0').replace(/,/g,'')) || 0);
      const total = Math.max(values[1] || 1, 1);
      cards.forEach((card,i) => {
        card.dataset.enterprise='1';
        const value = values[i] || 0;
        const ratio = i===0 ? 100 : pct(value,total);
        const label = card.querySelector('.kpi-label')?.textContent || '';
        const unit = i===0 ? 'คน' : label.includes('ชั่วโมง') || label==='OT' || label.includes('รอคอย') ? 'ชั่วโมง' : label.includes('วันหยุดชดเชย') ? 'วัน' : 'รายการ';
        const icon = card.querySelector('.kpi-icon')?.outerHTML || '';
        const sub = card.querySelector('.kpi-sub')?.textContent || '';
        card.innerHTML = `<div class="kpi-topline"><div class="kpi-label">${label}</div>${icon}</div><div class="kpi-value-row"><div class="kpi-value">${fmt(value)}</div><span class="kpi-unit">${unit}</span></div><div class="kpi-progress"><span style="width:${ratio}%"></span></div><div class="kpi-foot"><span>${sub}</span><strong>${ratio}%</strong></div>`;
      });
      renderEnterprisePanels(values);
    });
    observer.observe(kpiHost,{childList:true});
  }

  function renderEnterprisePanels(values){
    const employees=values[0]||0, total=values[1]||0, complete=values[2]||0, incomplete=values[3]||0, absent=values[4]||0;
    const completePct=pct(complete,total);
    if ($('attendanceDonut')) $('attendanceDonut').style.setProperty('--donut-angle', `${completePct*3.6}deg`);
    if ($('donutPercent')) $('donutPercent').textContent=`${completePct}%`;
    if ($('notificationCount')) $('notificationCount').textContent='0';
    if ($('dashboardUpdatedAt')) $('dashboardUpdatedAt').textContent=`อัปเดตล่าสุด ${new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}`;
    if ($('dashboardLegend')) $('dashboardLegend').innerHTML = [
      ['#2fb27d','ลงเวลาครบ',complete],['#f59e0b','เวลาไม่ครบ',incomplete],['#ef4444','ไม่พบเวลา',absent]
    ].map(x=>`<div class="legend-item"><i class="legend-dot" style="background:${x[0]}"></i><span>${x[1]}</span><strong>${fmt(x[2])}</strong></div>`).join('');
    if ($('operationalSummary')) $('operationalSummary').innerHTML = [
      ['อัตราลงเวลาครบ',`${completePct}%`,'เทียบรายการทั้งหมด'],
      ['เฉลี่ยรายการต่อคน',employees? (total/employees).toFixed(1):'0','วัน-พนักงานต่อคน'],
      ['รายการผิดปกติ',fmt(incomplete+absent),'ตรวจสอบจากรายละเอียดเวลาทำงาน']
    ].map(x=>`<div class="ops-card"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></div>`).join('');
    if ($('recentActivity')) $('recentActivity').innerHTML = [
      ['✓','โหลด Dashboard สำเร็จ',`${fmt(total)} รายการในช่วงวันที่`],
      ['◷','ตรวจคุณภาพเวลา',`${fmt(complete)} รายการลงเวลาครบ`]
    ].map((x,i)=>`<div class="activity-item"><div class="activity-icon">${x[0]}</div><div class="activity-text"><strong>${x[1]}</strong><span>${x[2]}</span></div><div class="activity-time">${i===0?'ล่าสุด':'สรุป'}</div></div>`).join('');
    const quick=$('dashboardQuick');
    if (quick && !quick.dataset.enterprise){
      quick.dataset.enterprise='1';
      const mo=new MutationObserver(()=>{
        [...quick.querySelectorAll('.quick-item')].forEach((b,i)=>{
          if(b.dataset.enhanced) return; b.dataset.enhanced='1';
          const title=b.querySelector('strong')?.textContent||'';
          const badge=b.querySelector('.badge')?.outerHTML||'';
          const icons=['↥','↧','✓'];
          b.innerHTML=`<div class="quick-leading"><div class="quick-icon">${icons[i]||'•'}</div><div><strong>${title}</strong><span class="quick-meta">คลิกเพื่อดูรายละเอียด</span></div></div>${badge}`;
        });
      }); mo.observe(quick,{childList:true});
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{ bootEnterprise(); enhanceDashboard(); });
})();

;

/* ===== js/dashboard-executive.js ===== */
(() => {
  const $ = id => document.getElementById(id);
  const fmt = value => new Intl.NumberFormat('th-TH').format(Number(value || 0));
  const num = value => Number(value || 0);
  const percent = (value, total) => total > 0 ? Math.max(0, Math.min(100, Math.round(value / total * 100))) : 0;

  function readDashboardValues() {
    const cards = [...document.querySelectorAll('#dashboardKpis .kpi-card')];
    const values = cards.map(card => num((card.querySelector('.kpi-value')?.textContent || '0').replace(/,/g, '')));
    return {
      employees: values[0] || 0,
      total: values[1] || 0,
      complete: values[2] || 0,
      incomplete: values[3] || 0,
      absent: values[4] || 0
    };
  }

  function renderExecutiveDashboard() {
    const d = readDashboardValues();
    if (!d.total && !d.employees) return;
    const completePct = percent(d.complete, d.total);
    const issueRows = d.incomplete + d.absent;
    const score = Math.max(0, Math.min(100, Math.round(completePct)));
    const confirmedButton =
      [...document.querySelectorAll('#dashboardQuick .quick-item')]
        .find(button =>
          button.querySelector('strong')
            ?.textContent
            ?.includes('กะที่ยืนยันแล้ว')
        );
    const confirmed = num(
      confirmedButton
        ?.querySelector('.badge')
        ?.textContent
        ?.replace(/,/g, '')
    );
    const confirmedPct = percent(confirmed, d.total);

    $('executiveScore') && ($('executiveScore').textContent = score);
    $('executiveScoreRing')?.style.setProperty('--score-angle', `${score * 3.6}deg`);
    const status = score >= 90 ? ['ดีมาก','good'] : score >= 75 ? ['ควรติดตาม','warn'] : ['ต้องเร่งปรับปรุง','bad'];
    if ($('executiveScoreStatus')) {
      $('executiveScoreStatus').textContent = status[0];
      $('executiveScoreStatus').className = `health-status ${status[1]}`;
    }
    if ($('executiveScoreTitle')) $('executiveScoreTitle').textContent = score >= 90 ? 'ภาพรวมอยู่ในเกณฑ์ดีมาก' : score >= 75 ? 'ยังมีรายการที่ควรติดตาม' : 'พบประเด็นที่ควรเร่งดำเนินการ';
    if ($('executiveScoreText')) $('executiveScoreText').textContent = `ลงเวลาครบ ${completePct}% จากรายการทั้งหมด`;

    if ($('executiveAttention')) $('executiveAttention').innerHTML = [
      ['เวลาไม่ครบ', d.incomplete, percent(d.incomplete,d.total)],
      ['ไม่พบเวลา', d.absent, percent(d.absent,d.total)],
      ['รวมประเด็น', issueRows, percent(issueRows,d.total)]
    ].map(([label,value,p]) => `<button class="attention-tile ${p>=10?'high':p>=5?'medium':''}" data-go-page="attendance"><span>${label}</span><strong>${fmt(value)}</strong><small>${p}% ของรายการทั้งหมด</small></button>`).join('');

    if ($('scheduleReadiness')) $('scheduleReadiness').innerHTML = `
      <div class="readiness-number"><strong>${confirmedPct}%</strong><span>กะที่ยืนยันเทียบรายการทั้งหมด</span></div>
      <div class="readiness-track"><i style="width:${confirmedPct}%"></i></div>
      <div class="readiness-meta"><div><span>ยืนยันแล้ว</span><strong>${fmt(confirmed)}</strong></div><div><span>คงเหลือโดยประมาณ</span><strong>${fmt(Math.max(0,d.total-confirmed))}</strong></div></div>`;

    const insights = [];
    insights.push({type: completePct >= 90 ? 'good' : completePct >= 75 ? 'warn' : 'bad', icon:'✓', title:'ความครบถ้วนของเวลา', text:`ลงเวลาครบ ${fmt(d.complete)} จาก ${fmt(d.total)} รายการ`, value:`${completePct}%`});
    if (d.incomplete > 0) insights.push({type:'warn',icon:'!',title:'เวลาเข้า–ออกไม่ครบ',text:'ควรตรวจรายการก่อนปิดรอบเวลา',value:fmt(d.incomplete)});
    if (d.absent > 0) insights.push({type:'bad',icon:'×',title:'ไม่พบข้อมูลเวลา',text:'ตรวจสอบวันทำงาน วันลา หรือแหล่งข้อมูลเวลา',value:fmt(d.absent)});
    if ($('executiveInsights')) $('executiveInsights').innerHTML = insights.slice(0,4).map(i => `<div class="insight-row ${i.type}"><div class="insight-icon">${i.icon}</div><div><strong>${i.title}</strong><p>${i.text}</p></div><div class="insight-value">${i.value}</div></div>`).join('');

    const distribution = [
      ['ลงเวลาครบ',d.complete,'dist-complete'],['เวลาไม่ครบ',d.incomplete,'dist-missing'],['ไม่พบเวลา',d.absent,'dist-absent']
    ];
    if ($('workforceDistribution')) $('workforceDistribution').innerHTML = distribution.map(([label,value,cls]) => { const p=percent(value,d.total); return `<div class="distribution-row"><span>${label}</span><div class="distribution-track"><i class="${cls}" style="width:${p}%"></i></div><strong>${p}%</strong></div>`; }).join('');
  }

  function bindDynamicNavigation() {
    document.addEventListener('click', event => {
      const target = event.target.closest('[data-go-page]');
      if (!target || !target.closest('.executive-strip')) return;
      document.querySelector(`.nav-item[data-page="${target.dataset.goPage}"]`)?.click();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindDynamicNavigation();
    const host = $('dashboardKpis');
    if (!host) return;
    const observer = new MutationObserver(() => window.requestAnimationFrame(renderExecutiveDashboard));
    observer.observe(host, {childList:true, subtree:true});
    window.setTimeout(renderExecutiveDashboard, 600);
  });
})();

;

/* ===== js/schedule-pro.js ===== */
(() => {
  "use strict";
  const selected = new Set();
  let clipboard = [];
  let anchorKey = null;
  let activeKey = null;
  let dragging = false;
  let dragMode = "add";
  const undoStack = [];
  const redoStack = [];
  const app = () => window.TimeClockApp;
  const wrap = () => document.getElementById("scheduleTableWrap");
  const $ = id => document.getElementById(id);
  const keyOf = cell => `${cell.dataset.emp}|${cell.dataset.date}`;
  const escapeCss = value => (window.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/g,"\\$&"));

  function cells(){ return [...(wrap()?.querySelectorAll("[data-schedule-cell]") || [])]; }
  function getCell(key){ const [emp,date]=key.split("|"); return wrap()?.querySelector(`[data-schedule-cell][data-emp="${escapeCss(emp)}"][data-date="${escapeCss(date)}"]`); }
  function rowForKey(key){ const [emp_code,work_date]=key.split("|"); const row=app()?.state?.schedule?.find(r=>String(r.emp_code)===emp_code&&String(r.work_date).slice(0,10)===work_date); return {key,emp_code,work_date,row}; }
  function selectedRows(){ return [...selected].map(rowForKey).filter(x=>x.row); }
  function currentCode(row){ return row?.assigned_shift_code || row?.effective_shift_code || row?.auto_shift_code || null; }

  function rowPattern(row){
    return window.TimeClockSchedulePattern?.rowPattern?.(row)
      || String(row?.pattern_code || "").toUpperCase()
      || "UNASSIGNED";
  }

  function shiftMasterRows(){
    return app()?.state?.filters?.shifts || [];
  }

  function shiftPatterns(shift){
    const patterns = Array.isArray(shift?.applicable_pattern_codes)
      ? shift.applicable_pattern_codes
      : ["TECH_5D","TECH_6D"];

    return patterns
      .map(value => String(value || "").trim().toUpperCase())
      .filter(Boolean);
  }

  function defaultPatterns(shift){
    return (Array.isArray(shift?.default_pattern_codes)
      ? shift.default_pattern_codes
      : [])
      .map(value => String(value || "").trim().toUpperCase())
      .filter(Boolean);
  }

  function supportsPattern(shift, pattern){
    if (!shift || shift.is_active === false) return false;
    if (shift.is_workday === false) return true;
    return shiftPatterns(shift).includes(pattern);
  }

  function configuredShift(code){
    return shiftMasterRows().find(
      shift => String(shift.shift_code || "") === String(code || "")
    );
  }

  function defaultShiftForPattern(pattern){
    return shiftMasterRows()
      .filter(shift => supportsPattern(shift, pattern))
      .sort(
        (a,b) =>
          Number(a.display_order || 0) - Number(b.display_order || 0)
      )
      .find(shift => defaultPatterns(shift).includes(pattern));
  }

  function nightShiftForPattern(pattern){
    const candidates = shiftMasterRows()
      .filter(
        shift =>
          supportsPattern(shift, pattern)
          && shift.is_workday !== false
          && (
            shift.is_night_shift === true
            || String(shift.shift_code || "").toUpperCase().startsWith("N")
            || String(shift.shift_name || "").toLowerCase().includes("กลางคืน")
            || String(shift.shift_name || "").toLowerCase().includes("กะดึก")
          )
      )
      .sort(
        (a,b) =>
          Number(a.display_order || 0) - Number(b.display_order || 0)
      );

    return candidates[0] || null;
  }

  function semanticShiftForPattern(action, pattern){
    if (pattern === "UNASSIGNED") return null;
    if (action === "NORMAL") return defaultShiftForPattern(pattern);
    if (action === "NIGHT") return nightShiftForPattern(pattern);
    return configuredShift(action);
  }

  function smartActionLabel(action){
    return action === "NORMAL"
      ? "กะปกติ"
      : action === "NIGHT"
        ? "กะกลางคืน"
        : action;
  }

  function updateSmartShiftButtons(){
    const filter = $("schedulePatternFilter")?.value || "";
    const patterns = filter === "TECH_5D" || filter === "TECH_6D"
      ? [filter]
      : ["TECH_5D","TECH_6D"];

    const normalCodes = patterns
      .map(pattern => defaultShiftForPattern(pattern)?.shift_code)
      .filter(Boolean);

    const nightCodes = patterns
      .map(pattern => nightShiftForPattern(pattern)?.shift_code)
      .filter(Boolean);

    if ($("scheduleQuickNormalCode")) {
      $("scheduleQuickNormalCode").textContent =
        normalCodes.length === 1
          ? normalCodes[0]
          : normalCodes.length > 1
            ? [...new Set(normalCodes)].join(" / ")
            : "ยังไม่ตั้งค่า";
    }

    if ($("scheduleQuickNightCode")) {
      $("scheduleQuickNightCode").textContent =
        nightCodes.length === 1
          ? nightCodes[0]
          : nightCodes.length > 1
            ? [...new Set(nightCodes)].join(" / ")
            : "ยังไม่ตั้งค่า";
    }

    if ($("scheduleQuickNormalBtn")) {
      $("scheduleQuickNormalBtn").disabled = !normalCodes.length;
    }

    if ($("scheduleQuickNightBtn")) {
      $("scheduleQuickNightBtn").disabled = !nightCodes.length;
    }
  }

  function payloadCompatibility(payload){
    const valid = [];
    const skipped = [];

    payload.forEach(item => {
      if (!item.shift_code) {
        valid.push(item);
        return;
      }

      const row = rowForKey(`${item.emp_code}|${item.work_date}`).row;
      const pattern = rowPattern(row);
      const shift = configuredShift(item.shift_code);

      if (["OFF","HOL","LV"].includes(String(item.shift_code))) {
        valid.push(item);
        return;
      }

      if (pattern === "UNASSIGNED") {
        skipped.push({
          ...item,
          pattern,
          reason: "ยังไม่ได้กำหนดรูปแบบการทำงาน"
        });
        return;
      }

      if (!shift) {
        skipped.push({
          ...item,
          pattern,
          reason: "ไม่พบกะในหน้าตั้งค่ากะ"
        });
        return;
      }

      if (!supportsPattern(shift, pattern)) {
        skipped.push({
          ...item,
          pattern,
          reason: `กะ ${item.shift_code} ไม่รองรับ ${pattern === "TECH_5D" ? "5 วัน" : "6 วัน"}`
        });
        return;
      }

      valid.push(item);
    });

    return { valid, skipped };
  }

  function skippedSummary(skipped){
    const groups = new Map();

    skipped.forEach(item => {
      const key = item.reason || "ไม่รองรับ";
      groups.set(key, (groups.get(key) || 0) + 1);
    });

    return [...groups.entries()]
      .map(([reason,count]) => `• ${reason}: ${count.toLocaleString("th-TH")} ช่อง`)
      .join("\n");
  }

  async function smartBulkAssign(action, confirmNow=false){
    const rows = selectedRows();
    if (!rows.length) {
      return app()?.toast("กรุณาเลือกช่องกะก่อน","error");
    }

    const mapped = [];
    const skipped = [];
    const summary = new Map();

    rows.forEach(item => {
      const pattern = rowPattern(item.row);
      const shift = semanticShiftForPattern(action, pattern);

      if (!shift) {
        skipped.push({
          ...item,
          pattern,
          reason: pattern === "UNASSIGNED"
            ? "ยังไม่ได้กำหนดรูปแบบการทำงาน"
            : `ยังไม่ได้กำหนด${smartActionLabel(action)}สำหรับกลุ่มนี้`
        });
        return;
      }

      mapped.push({
        emp_code: item.emp_code,
        work_date: item.work_date,
        shift_code: shift.shift_code,
        note: `กำหนด${smartActionLabel(action)}ตาม Work Pattern`
      });

      const groupKey = `${pattern}|${shift.shift_code}`;
      summary.set(groupKey, (summary.get(groupKey) || 0) + 1);
    });

    const lines = [...summary.entries()].map(([key,count]) => {
      const [pattern,shiftCode] = key.split("|");
      return `• ${pattern === "TECH_5D" ? "5 วัน" : "6 วัน"}: ${count.toLocaleString("th-TH")} ช่อง → ${shiftCode}`;
    });

    if (skipped.length) {
      lines.push(
        `• ข้าม: ${skipped.length.toLocaleString("th-TH")} ช่อง`
      );
    }

    if (!mapped.length) {
      return app()?.toast(
        skippedSummary(skipped) || "ไม่มีรายการที่สามารถกำหนดกะได้",
        "error"
      );
    }

    const message = [
      `กำหนด${smartActionLabel(action)}จำนวน ${mapped.length.toLocaleString("th-TH")} ช่อง`,
      "",
      ...lines,
      skipped.length
        ? "\nรายการที่ไม่รองรับจะไม่ถูกบันทึก"
        : ""
    ].join("\n");

    if (!confirm(message)) return;

    await savePayload(
      mapped,
      `กำหนด${smartActionLabel(action)}ตาม Work Pattern`,
      confirmNow,
      `กำหนด${smartActionLabel(action)}`
    );

    if (skipped.length) {
      app()?.toast(
        `บันทึกสำเร็จ ${mapped.length.toLocaleString("th-TH")} ช่อง • ข้าม ${skipped.length.toLocaleString("th-TH")} ช่อง`,
        "info"
      );
    }
  }

  function updateHistoryButtons(){ $("scheduleUndoBtn") && ($("scheduleUndoBtn").disabled=!undoStack.length); $("scheduleRedoBtn") && ($("scheduleRedoBtn").disabled=!redoStack.length); }
  function updateSummary(){
    const counts={D:0,N:0,OFF:0,HOL:0,LV:0};

    cells().forEach(cell => {
      const row = rowForKey(keyOf(cell)).row;
      const code = currentCode(row);
      const shift = configuredShift(code);

      if (code === "OFF" || code === "HOL" || code === "LV") {
        counts[code]++;
      } else if (
        shift?.is_night_shift === true
        || String(code || "").toUpperCase().startsWith("N")
        || String(shift?.shift_name || "").toLowerCase().includes("กะดึก")
      ) {
        counts.N++;
      } else if (code) {
        counts.D++;
      }
    });

    Object.entries(counts).forEach(([code,count]) => {
      const el=$("sumShift"+code);
      if(el)el.textContent=count.toLocaleString("th-TH");
    });

    updateSmartShiftButtons();
  }
  function refreshSelectionUI(){
    wrap()?.querySelectorAll(".schedule-data-cell.cell-selected,.schedule-data-cell.cell-active").forEach(td=>td.classList.remove("cell-selected","cell-active"));
    selected.forEach(key=>getCell(key)?.closest("td")?.classList.add("cell-selected"));
    if(activeKey) getCell(activeKey)?.closest("td")?.classList.add("cell-active");
    const count=selected.size;
    if($("scheduleSelectionCount")) $("scheduleSelectionCount").textContent=count?`เลือกแล้ว ${count.toLocaleString("th-TH")} ช่อง`:"ยังไม่ได้เลือกช่อง";
    if($("scheduleSelectedKpi")) $("scheduleSelectedKpi").textContent=count.toLocaleString("th-TH");
    if($("scheduleClipboardInfo")) $("scheduleClipboardInfo").textContent=clipboard.length?`คลิปบอร์ด ${clipboard.length} กะ`:"เลือกช่องแล้วกดกะด่วน";
  }
  function clearSelection(){ selected.clear(); anchorKey=null; activeKey=null; refreshSelectionUI(); }
  function setActive(key,scroll=true){ activeKey=key; anchorKey=anchorKey||key; if(!selected.size) selected.add(key); refreshSelectionUI(); if(scroll) getCell(key)?.scrollIntoView({block:"nearest",inline:"nearest"}); }
  function selectCell(cell, additive=false, range=false){
    const key=keyOf(cell);
    if(range&&anchorKey){ selectRectangle(anchorKey,key,additive); }
    else { if(!additive) selected.clear(); selected.add(key); anchorKey=key; }
    activeKey=key; refreshSelectionUI();
  }
  function selectRectangle(fromKey,toKey,additive=false){
    const all=cells(); const matrix=new Map();
    all.forEach(c=>{const tr=c.closest("tr"); const ri=[...tr.parentElement.children].indexOf(tr); const ci=[...tr.children].indexOf(c.closest("td")); matrix.set(keyOf(c),{c,ri,ci});});
    const a=matrix.get(fromKey),b=matrix.get(toKey); if(!a||!b)return; if(!additive)selected.clear();
    const r1=Math.min(a.ri,b.ri),r2=Math.max(a.ri,b.ri),c1=Math.min(a.ci,b.ci),c2=Math.max(a.ci,b.ci);
    matrix.forEach((v,k)=>{if(v.ri>=r1&&v.ri<=r2&&v.ci>=c1&&v.ci<=c2)selected.add(k);});
  }
  function selectByEmp(emp){ selected.clear(); wrap()?.querySelectorAll(`[data-schedule-cell][data-emp="${escapeCss(emp)}"]`).forEach(c=>selected.add(keyOf(c))); activeKey=[...selected][0]||null; anchorKey=activeKey; refreshSelectionUI(); }
  function selectByDate(date){ selected.clear(); wrap()?.querySelectorAll(`[data-schedule-cell][data-date="${escapeCss(date)}"]`).forEach(c=>selected.add(keyOf(c))); activeKey=[...selected][0]||null; anchorKey=activeKey; refreshSelectionUI(); }

  async function savePayload(payload, reason, confirmNow=false, historyLabel="แก้ไขกะ"){
    if(!payload.length) return;

    const compatibility = payloadCompatibility(payload);
    const validPayload = compatibility.valid;

    if (!validPayload.length) {
      return app()?.toast(
        skippedSummary(compatibility.skipped)
          || "ไม่มีรายการที่สามารถบันทึกได้",
        "error"
      );
    }

    if (compatibility.skipped.length) {
      const proceed = confirm(
        `พบรายการที่ไม่รองรับ ${compatibility.skipped.length.toLocaleString("th-TH")} ช่อง

${skippedSummary(compatibility.skipped)}

ระบบจะข้ามรายการเหล่านี้และบันทึกเฉพาะรายการที่รองรับ ${validPayload.length.toLocaleString("th-TH")} ช่อง`
      );
      if (!proceed) return;
    }

    const before=validPayload.map(p=>{const x=rowForKey(`${p.emp_code}|${p.work_date}`);return {...p,shift_code:currentCode(x.row)};});
    app().showLoading(`กำลังบันทึก ${validPayload.length.toLocaleString("th-TH")} รายการ...`);
    try{
      await window.TimeClockShiftAPI.assignBulk(app(), validPayload, reason, confirmNow);
      undoStack.push({label:historyLabel,before,after:validPayload.map(x=>({...x}))}); if(undoStack.length>30)undoStack.shift(); redoStack.length=0; updateHistoryButtons();
      app().toast(
        `บันทึก ${validPayload.length.toLocaleString("th-TH")} รายการและประมวลผลเวลาใหม่แล้ว`,
        "success"
      );
      await app().loadSchedule();
    }catch(err){app().toast(app().humanError(err),"error");}finally{app().hideLoading();}
  }
  async function bulkAssign(shiftCode,confirmNow=false){const rows=selectedRows();if(!rows.length)return app()?.toast("กรุณาเลือกช่องกะก่อน","error");await savePayload(rows.map(x=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:shiftCode,note:"กำหนดจาก Schedule Pro"})),`กำหนดกะ ${shiftCode} จาก Schedule Pro`,confirmNow,`กำหนด ${shiftCode}`);}
  function copySelection(){const rows=selectedRows();if(!rows.length)return app()?.toast("กรุณาเลือกช่องที่ต้องการคัดลอก","error");clipboard=rows.map(x=>currentCode(x.row)||"D");refreshSelectionUI();app().toast(`คัดลอก ${clipboard.length} กะแล้ว`,"success");}
  async function pasteSelection(){const targets=selectedRows();if(!clipboard.length)return app()?.toast("ยังไม่มีกะในคลิปบอร์ด","error");if(!targets.length)return app()?.toast("กรุณาเลือกช่องปลายทาง","error");await savePayload(targets.map((x,i)=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:clipboard[i%clipboard.length],note:"วางจากคลิปบอร์ด"})),"คัดลอกและวางกะจาก Schedule Pro",false,"วางกะ");}
  async function clearCells(){const rows=selectedRows();if(!rows.length)return app()?.toast("กรุณาเลือกช่องที่ต้องการล้าง","error");if(!confirm(`ล้างกะที่กำหนดจำนวน ${rows.length} ช่อง?`))return;await savePayload(rows.map(x=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:null,note:"ล้างกะจาก Schedule Pro"})),"ล้างกะจาก Schedule Pro",false,"ล้างกะ");}
  async function confirmSelected(){const rows=selectedRows();if(!rows.length)return app()?.toast("กรุณาเลือกกะที่ต้องการยืนยัน","error");if(!confirm(`ยืนยันกะ ${rows.length} ช่องที่เลือก?`))return;await savePayload(rows.map(x=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:currentCode(x.row),note:"ยืนยันจาก Schedule Pro"})).filter(x=>x.shift_code),"ยืนยันกะจาก Schedule Pro",true,"ยืนยันกะ");}
  async function applyHistory(item,mode){const payload=(mode==="undo"?item.before:item.after).map(x=>({...x,note:`${mode} ${item.label}`}));app().showLoading(`กำลัง ${mode==="undo"?"ย้อนกลับ":"ทำซ้ำ"}...`);try{await window.TimeClockShiftAPI.assignBulk(app(),payload,`${mode} ${item.label}`,false);(mode==="undo"?redoStack:undoStack).push(item);updateHistoryButtons();await app().loadSchedule();app().toast(mode==="undo"?"ย้อนกลับและประมวลผลเวลาใหม่แล้ว":"ทำซ้ำและประมวลผลเวลาใหม่แล้ว","success");}catch(err){app().toast(app().humanError(err),"error");}finally{app().hideLoading();}}
  function undo(){const x=undoStack.pop();if(x)applyHistory(x,"undo");}
  function redo(){const x=redoStack.pop();if(x)applyHistory(x,"redo");}
  function moveActive(dx,dy,extend=false){const c=getCell(activeKey)||cells()[0];if(!c)return;const td=c.closest("td"),tr=td.parentElement;const rows=[...tr.parentElement.children];let ri=rows.indexOf(tr)+dy;ri=Math.max(0,Math.min(rows.length-1,ri));const targetRow=rows[ri];const cellsRow=[...targetRow.querySelectorAll("[data-schedule-cell]")];const sourceCells=[...tr.querySelectorAll("[data-schedule-cell]")];let ci=sourceCells.indexOf(c)+dx;ci=Math.max(0,Math.min(cellsRow.length-1,ci));const target=cellsRow[ci];if(target){selectCell(target,false,extend);target.scrollIntoView({block:"nearest",inline:"nearest"});}}
  function periodStartDate(){
    return window.TimeClockSchedulePeriod?.range?.().startDate
      || $("schedulePeriodStart")?.value;
  }

  function scheduleBlockStart(year,month,day){
    return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
  }

  function shiftMonth(delta){
    const current =
      new Date(`${periodStartDate()}T00:00:00`);
    const year = current.getFullYear();
    const month = current.getMonth() + 1;
    const day = current.getDate();
    const starts = [1,8,15,22,29];
    const index = starts.indexOf(day);
    let next;

    if(delta > 0){
      const candidate = starts[index + 1];

      if(
        candidate
        && candidate <= new Date(year,month,0).getDate()
      ){
        next = scheduleBlockStart(year,month,candidate);
      }else{
        const following = new Date(year,month,1);
        next = scheduleBlockStart(
          following.getFullYear(),
          following.getMonth() + 1,
          1
        );
      }
    }else{
      const candidate = starts[index - 1];

      if(candidate){
        next = scheduleBlockStart(year,month,candidate);
      }else{
        const previous = new Date(year,month-2,1);
        const previousLastDay =
          new Date(
            previous.getFullYear(),
            previous.getMonth()+1,
            0
          ).getDate();
        const previousStart =
          [...starts]
            .reverse()
            .find(item => item <= previousLastDay)
          || 1;

        next = scheduleBlockStart(
          previous.getFullYear(),
          previous.getMonth() + 1,
          previousStart
        );
      }
    }

    if($("schedulePeriodStart")){
      $("schedulePeriodStart").value = next;
    }
    window.TimeClockSchedulePeriod?.sync?.();
    app()?.loadSchedule();
  }
  function openContext(e,cell){e.preventDefault();selectCell(cell,e.ctrlKey||e.metaKey,e.shiftKey);const menu=$("scheduleContextMenu");menu.hidden=false;menu.style.left=Math.min(e.clientX,innerWidth-190)+"px";menu.style.top=Math.min(e.clientY,innerHeight-310)+"px";}
  function closeContext(){const m=$("scheduleContextMenu");if(m)m.hidden=true;}

  function bind(){
    document.addEventListener("timeclock:schedule-rendered",()=>{selected.clear();activeKey=null;anchorKey=null;refreshSelectionUI();updateSummary();updateHistoryButtons();});
    wrap()?.addEventListener("mousedown",e=>{const cell=e.target.closest("[data-schedule-cell]");if(!cell||e.button!==0)return;e.preventDefault();dragging=true;dragMode=(e.ctrlKey||e.metaKey)&&selected.has(keyOf(cell))?"remove":"add";if(!e.shiftKey&&!e.ctrlKey&&!e.metaKey)selected.clear();selectCell(cell,e.ctrlKey||e.metaKey,e.shiftKey);wrap()?.focus();});
    wrap()?.addEventListener("mouseover",e=>{if(!dragging)return;const cell=e.target.closest("[data-schedule-cell]");if(!cell)return;const k=keyOf(cell);dragMode==="remove"?selected.delete(k):selected.add(k);activeKey=k;refreshSelectionUI();});
    document.addEventListener("mouseup",()=>dragging=false);
    wrap()?.addEventListener("click",e=>{const emp=e.target.closest("[data-select-emp]");if(emp){selectByEmp(emp.dataset.selectEmp);return;}const date=e.target.closest("[data-select-date]");if(date){selectByDate(date.dataset.selectDate);return;}});
    wrap()?.addEventListener("dblclick",e=>{const c=e.target.closest("[data-schedule-cell]");if(c)app()?.openAssignment(c.dataset.emp,c.dataset.date);});
    wrap()?.addEventListener("contextmenu",e=>{const c=e.target.closest("[data-schedule-cell]");if(c)openContext(e,c);});
    document.querySelectorAll("[data-smart-shift]").forEach(button =>
      button.addEventListener(
        "click",
        () => smartBulkAssign(button.dataset.smartShift)
      )
    );
    document.querySelectorAll("[data-quick-shift]").forEach(b=>b.addEventListener("click",()=>bulkAssign(b.dataset.quickShift)));
    $("scheduleCopyBtn")?.addEventListener("click",copySelection); $("schedulePasteBtn")?.addEventListener("click",pasteSelection); $("scheduleClearCellsBtn")?.addEventListener("click",clearCells); $("scheduleClearSelectionBtn")?.addEventListener("click",clearSelection); $("scheduleConfirmSelectedBtn")?.addEventListener("click",confirmSelected); $("scheduleUndoBtn")?.addEventListener("click",undo); $("scheduleRedoBtn")?.addEventListener("click",redo);
    $("schedulePrevMonthBtn")?.addEventListener("click",()=>shiftMonth(-1));
    $("scheduleNextMonthBtn")?.addEventListener("click",()=>shiftMonth(1));
    $("schedulePatternFilter")?.addEventListener("change",updateSmartShiftButtons);
    document.addEventListener("timeclock:schedule-rendered",updateSmartShiftButtons);
    $("scheduleTodayBtn")?.addEventListener("click",()=>{
      const today=new Date().toISOString().slice(0,10);
      const start=window.TimeClockSchedulePeriod?.blockStartForDate?.(today)||today;
      if($("schedulePeriodStart"))$("schedulePeriodStart").value=start;
      window.TimeClockSchedulePeriod?.sync?.();
      app()?.loadSchedule();
    });
    $("scheduleContextMenu")?.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.contextSmartShift)smartBulkAssign(b.dataset.contextSmartShift);if(b.dataset.contextShift)bulkAssign(b.dataset.contextShift);if(b.dataset.contextAction==="copy")copySelection();if(b.dataset.contextAction==="paste")pasteSelection();if(b.dataset.contextAction==="clear")clearCells();closeContext();});
    document.addEventListener("click",e=>{if(!e.target.closest("#scheduleContextMenu"))closeContext();});
    document.addEventListener("keydown",e=>{if(!document.getElementById("page-schedule")?.classList.contains("active"))return;const tag=document.activeElement?.tagName;if(["INPUT","SELECT","TEXTAREA"].includes(tag)&&!(e.ctrlKey||e.metaKey))return;const k=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&k==="c"){e.preventDefault();copySelection();}else if((e.ctrlKey||e.metaKey)&&k==="v"){e.preventDefault();pasteSelection();}else if((e.ctrlKey||e.metaKey)&&k==="z"){e.preventDefault();e.shiftKey?redo():undo();}else if((e.ctrlKey||e.metaKey)&&k==="y"){e.preventDefault();redo();}else if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();clearCells();}else if(e.key==="Escape")clearSelection();else if(e.key==="ArrowLeft"){e.preventDefault();moveActive(-1,0,e.shiftKey);}else if(e.key==="ArrowRight"){e.preventDefault();moveActive(1,0,e.shiftKey);}else if(e.key==="ArrowUp"){e.preventDefault();moveActive(0,-1,e.shiftKey);}else if(e.key==="ArrowDown"){e.preventDefault();moveActive(0,1,e.shiftKey);}else if(["d","n"].includes(k)&&!e.ctrlKey&&!e.metaKey){e.preventDefault();smartBulkAssign(k==="d"?"NORMAL":"NIGHT");}});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind);else bind();
})();

;

/* ===== js/report-center.js ===== */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const app=()=>window.TimeClockApp;
  const safe=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const STORAGE_KEY="timeclock_report_jobs_v60";
  const names={attendance:"รายละเอียดเวลาทำงาน",schedule:"ตารางจัดกะรายเดือน",summary:"สรุป Dashboard",late:"มาสายและกลับก่อน"};
  const downloads=new Map();
  const val=id=>$(id)?.value||"";
  const client=()=>app()?.state?.client||null;
  const fmtDate=v=>v?new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString("th-TH",{day:"2-digit",month:"2-digit",year:"numeric"}):"";
  const fmtTime=v=>{if(!v)return"";const s=String(v);if(s.includes("T")||s.includes(" ")){const d=new Date(v);if(!Number.isNaN(d.getTime()))return d.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",hour12:false});}return s.slice(0,5);};
  const fmtDateTime=v=>v?new Date(v).toLocaleString("th-TH",{dateStyle:"short",timeStyle:"medium"}):"-";
  const csvCell=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const jobs=()=>{try{return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]")}catch{return[]}};
  const saveJobs=a=>{localStorage.setItem(STORAGE_KEY,JSON.stringify(a.slice(0,50)));renderJobs();};

  async function rpc(name,args){const c=client();if(!c)throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");const {data,error}=await c.rpc(name,args);if(error)throw error;return data||[];}
  function download(name,content,type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);downloads.set(name,url);const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  function makeCsv(rows){return "\ufeff"+rows.map(r=>r.map(csvCell).join(",")).join("\n");}
  function makeExcel(rows,title){return `\ufeff<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,'Noto Sans Thai',sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #94a3b8;padding:6px;font-size:11px}th{background:#dbeafe}</style></head><body><h2>${safe(title)}</h2><table>${rows.map((r,i)=>`<tr>${r.map(v=>i===0?`<th>${safe(v)}</th>`:`<td>${safe(v)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;}
  function printRows(rows,title,range){const w=window.open("","_blank");if(!w)throw new Error("Browser ปิดกั้นหน้าต่าง Print");w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safe(title)}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:'Noto Sans Thai',Arial,sans-serif}h1{font-size:18px;margin:0}p{font-size:10px;color:#475569}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{border:1px solid #94a3b8;padding:4px;font-size:8px}th{background:#e2e8f0}</style></head><body><h1>${safe(title)}</h1><p>${safe(range)}</p><table>${rows.map((r,i)=>`<tr>${r.map(v=>i===0?`<th>${safe(v)}</th>`:`<td>${safe(v)}</td>`).join("")}</tr>`).join("")}</table></body></html>`);w.document.close();setTimeout(()=>w.print(),250);}

  async function build(type){
    const start=val("reportStart"),end=val("reportEnd"),zone=val("reportZone")||null,dept=val("reportDepartment")||null;
    if(!start||!end)throw new Error("กรุณาเลือกช่วงวันที่");
    if(type==="attendance"||type==="late"){
      const data=await rpc(
        "ta_get_attendance_detail_v61020",
        {
          p_start_date:start,
          p_end_date:end,
          p_area:zone,
          p_sub_area:null,
          p_department:dept,
          p_emp_codes:null,
          p_attendance_statuses:null,
          p_schedule_statuses:null,
          p_limit:5000
        }
      );
      const filtered=type==="late"?data.filter(r=>Number(r.late_minutes||0)>0||Number(r.early_leave_minutes||0)>0):data;
      const shiftTime=(r,side)=>app()?.attendanceShiftTime?.(r,side)||r[side==="start"?"shift_start_time":"shift_end_time"];
      return [["วันที่","รหัสพนักงาน","ชื่อ-นามสกุล","หน่วยงาน","พื้นที่","พื้นที่ย่อย","รูปแบบงาน","Template","ประเภทวัน","เวลาเริ่มกะ","เวลาสิ้นสุดกะ","กะ","เวลาเข้า","เวลาออก","ชั่วโมงสุทธิ","ชั่วโมงปกติ","OT","รอคอย","พัก","มาสาย(นาที)","กลับก่อน(นาที)","วันหยุดชดเชยคงเหลือ","สถานะ"],...filtered.map(r=>[fmtDate(r.work_date),r.emp_code,r.full_name,r.department,r.zone||r.area,r.sub_area,r.pattern_code,r.template_code,r.day_type,fmtTime(shiftTime(r,"start")),fmtTime(shiftTime(r,"end")),r.effective_shift_code||r.assigned_shift_code||r.shift_code||r.auto_shift_code,fmtTime(r.actual_in_at||r.first_in),fmtTime(r.actual_out_at||r.last_out),(Number(r.net_work_minutes||0)/60).toFixed(2),(Number(r.regular_minutes||0)/60).toFixed(2),(Number(r.overtime_minutes||0)/60).toFixed(2),(Number(r.waiting_minutes||0)/60).toFixed(2),(Number(r.break_deducted_minutes||0)/60).toFixed(2),r.late_minutes||0,r.early_leave_minutes||0,r.comp_off_balance??0,r.calculation_status||r.attendance_result||r.attendance_status])];
    }
    if(type==="schedule"){
      const month=`${start.slice(0,7)}-01`;const data=await window.TimeClockShiftAPI.getMonthlySchedule(app(),{p_month:month,p_start_date:start,p_end_date:end,p_zone:zone,p_department:dept,p_emp_codes:null,p_schedule_statuses:null});
      return [["วันที่","รหัสพนักงาน","ชื่อ-นามสกุล","หน่วยงาน","พื้นที่","ประเภทวัน","รูปแบบงาน","Template","กะอัตโนมัติ","กะแนะนำ","กะที่กำหนด","กะใช้งาน","สถานะ","ยืนยันแล้ว","เวลาเริ่มกะ","เวลาสิ้นสุดกะ","ชั่วโมงสุทธิ","OT","รอคอย","ทำงานวันหยุด","วันหยุดชดเชย","สถานะคำนวณ"],...data.map(r=>[fmtDate(r.work_date),r.emp_code,r.full_name,r.department,r.zone||r.area,r.calculation_day_type||r.day_type||"WORKDAY",r.pattern_code,r.template_code,r.auto_shift_code,r.suggested_shift_code,r.assigned_shift_code,r.effective_shift_code,r.schedule_status,r.is_confirmed?"ใช่":"ไม่ใช่",fmtTime(r.shift_start_time),fmtTime(r.shift_end_time),(Number(r.paid_work_minutes||0)/60).toFixed(2),(Number(r.overtime_minutes||0)/60).toFixed(2),(Number(r.waiting_minutes||0)/60).toFixed(2),(Number(r.offday_work_minutes||0)/60).toFixed(2),r.comp_off_earned?"ได้รับ":"",r.calculation_status])];
    }
    if(type==="summary"){
      const raw=await rpc("ta_get_dashboard_overview_v640",{p_start_date:start,p_end_date:end,p_zone:zone,p_department:dept});const d=Array.isArray(raw)?raw[0]||{}:raw||{};
      return [["รายการ","จำนวน"],["พนักงานทั้งหมด",d.total_employees],["รายการทั้งหมด",d.total_rows],["ลงเวลาครบ",d.complete_time_rows],["ไม่พบเวลาเข้า",d.missing_in_rows],["ไม่พบเวลาออก",d.missing_out_rows],["ไม่มีข้อมูลเวลา",d.absent_rows??d.no_time_rows],["ทำงานวันหยุด",d.worked_on_offday_rows],["กะยืนยันแล้ว",d.confirmed_rows],["ชั่วโมงสุทธิ",d.paid_work_hours],["ชั่วโมงปกติ",d.regular_hours],["OT",d.overtime_hours],["ช่วงรอคอย",d.waiting_hours],["ชั่วโมงทำงานวันหยุด",d.offday_work_hours],["วันที่ได้รับวันหยุดชดเชย",d.comp_off_earned_rows],["พนักงาน TECH_6D",d.tech_6d_rows],["พนักงาน TECH_5D",d.tech_5d_rows]];
    }
    throw new Error("ไม่พบประเภทรายงาน");
  }

  async function logServer(job){try{const c=client();if(!c)return;await c.from("ta_export_job_log").insert({user_id:app()?.state?.user?.id,user_email:app()?.state?.user?.email,report_type:job.type,file_format:job.format.toUpperCase(),date_from:job.start||null,date_to:job.end||null,zone:job.zone||null,department:job.department||null,row_count:job.rows||0,job_status:job.status.toUpperCase(),file_name:job.filename||null,error_message:job.error||null,completed_at:job.status==="completed"?new Date().toISOString():null});}catch{} }
  async function run(type,format="csv"){
    const id=crypto.randomUUID?.()||String(Date.now()),start=val("reportStart"),end=val("reportEnd"),ext=format==="excel"?"xls":format==="print"?"print":"csv",filename=`${type}_${start}_${end}.${ext}`;
    let list=jobs();list.unshift({id,type,format,name:names[type]||type,range:`${start} ถึง ${end}`,start,end,zone:val("reportZone"),department:val("reportDepartment"),rows:0,status:"running",filename,created_at:new Date().toISOString()});saveJobs(list);
    try{
      app()?.showLoading?.("กำลังสร้างรายงาน...");const rows=await build(type);const title=names[type]||type;
      if(format==="csv")download(filename,makeCsv(rows),"text/csv;charset=utf-8");
      else if(format==="excel")download(filename,makeExcel(rows,title),"application/vnd.ms-excel;charset=utf-8");
      else printRows(rows,title,`${start} ถึง ${end}`);
      list=jobs().map(j=>j.id===id?{...j,rows:Math.max(0,rows.length-1),status:"completed",filename:format==="print"?"Print / Save as PDF":filename}:j);saveJobs(list);const finished=list.find(j=>j.id===id);logServer(finished);app()?.toast?.("สร้างรายงานเรียบร้อย","success");
    }catch(e){list=jobs().map(j=>j.id===id?{...j,status:"failed",error:e.message}:j);saveJobs(list);logServer(list.find(j=>j.id===id));app()?.toast?.(e.message||"สร้างรายงานไม่สำเร็จ","error");}
    finally{app()?.hideLoading?.();}
  }
  function renderJobs(){const body=$("reportJobsBody");if(!body)return;const list=jobs();body.innerHTML=list.length?list.map(j=>`<tr><td>${safe(fmtDateTime(j.created_at))}</td><td>${safe(j.name)}<small style="display:block;color:#64748b">${safe(String(j.format||"").toUpperCase())}</small></td><td>${safe(j.range)}</td><td>${Number(j.rows||0).toLocaleString("th-TH")}</td><td><span class="job-status ${safe(j.status)}">${j.status==="completed"?"สำเร็จ":j.status==="failed"?"ไม่สำเร็จ":"กำลังทำงาน"}</span>${j.error?`<span class="report-job-error">${safe(j.error)}</span>`:""}</td><td>${j.status==="completed"?`<button class="report-file-link" data-redownload="${safe(j.filename)}">${safe(j.filename)}</button>`:"-"}</td></tr>`).join(""):`<tr><td colspan="6" class="report-empty">ยังไม่มีประวัติการส่งออก</td></tr>`;}
  function setDefaults(){const now=new Date(),end=now.toISOString().slice(0,10),start=new Date(now.getFullYear(),now.getMonth(),1).toISOString().slice(0,10);if($("reportStart")&&!val("reportStart"))$("reportStart").value=start;if($("reportEnd")&&!val("reportEnd"))$("reportEnd").value=end;renderJobs();}
  function init(){setDefaults();$("reportRefreshJobsBtn")?.addEventListener("click",renderJobs);$("reportClearJobsBtn")?.addEventListener("click",()=>{localStorage.removeItem(STORAGE_KEY);renderJobs();});}

  document.addEventListener("click",e=>{const b=e.target.closest("[data-run-report-format]");if(b){const [type,format]=b.dataset.runReportFormat.split("|");run(type,format);}const legacy=e.target.closest("[data-run-report]");if(legacy)run(legacy.dataset.runReport,"csv");const r=e.target.closest("[data-redownload]");if(r){const url=downloads.get(r.dataset.redownload);if(url){const a=document.createElement("a");a.href=url;a.download=r.dataset.redownload;a.click();}else app()?.toast?.("ไฟล์เดิมไม่ได้อยู่ในหน่วยความจำ กรุณาสร้างรายงานใหม่","error");}});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",()=>setTimeout(init,50));else setTimeout(init,50);
  window.TimeClockReports={init,run,build,renderJobs,setDefaults};
})();

;

/* ===== js/hr-admin-center.js ===== */
"use strict";
(function(){
  const $=id=>document.getElementById(id);
  const app=()=>window.TimeClockApp;
  const num=v=>Number(v||0).toLocaleString("th-TH");
  const text=(id,v)=>{if($(id))$(id).textContent=v};
  async function refreshAdminCenter(){
    const A=app();
    if(!A?.state?.client)return;
    const client=A.state.client;
    text("adminHealthRole",A.state.profile?.role||"-");
    text("adminHealthSession",A.state.session?"Active":"Not active");
    text("adminHealthConnection","กำลังตรวจสอบ...");
    const badge=$("adminHealthBadge");
    if(badge){badge.className="admin-health-badge";badge.textContent="กำลังตรวจสอบ"}
    try{
      const year=new Date().getFullYear();
      const [usersRes,shiftsRes,holidaysRes]=await Promise.all([
        client.rpc("ta_get_user_management"),
        client.from("shift_master").select("shift_code,is_active"),
        client.rpc("ta_get_holiday_management",{p_start_date:`${year}-01-01`,p_end_date:`${year}-12-31`})
      ]);
      if(usersRes.error)throw usersRes.error;
      if(shiftsRes.error)throw shiftsRes.error;
      if(holidaysRes.error)throw holidaysRes.error;
      const users=usersRes.data||[], shifts=shiftsRes.data||[], holidays=holidaysRes.data||[];
      const activeUsers=users.filter(x=>x.is_active!==false).length;
      const activeShifts=shifts.filter(x=>x.is_active!==false).length;
      text("adminStatUsers",num(users.length));text("adminStatUsersSub",`${activeUsers.toLocaleString("th-TH")} บัญชีเปิดใช้งาน`);
      text("adminStatActiveUsers",num(activeUsers));text("adminStatActiveUsersSub",users.length?`${Math.round(activeUsers/users.length*100)}% ของทั้งหมด`:"ยังไม่มีข้อมูล");
      text("adminStatShifts",num(activeShifts));text("adminStatShiftsSub",`${shifts.length.toLocaleString("th-TH")} กะทั้งหมด`);
      text("adminStatHolidays",num(holidays.length));text("adminStatHolidaysSub",`ปี ${year+543}`);
      if($("adminCheckUsers"))$("adminCheckUsers").checked=activeUsers>0;
      if($("adminCheckShifts"))$("adminCheckShifts").checked=activeShifts>0;
      if($("adminCheckHolidays"))$("adminCheckHolidays").checked=holidays.length>0;
      text("adminHealthConnection","Connected");
      if(badge){badge.className="admin-health-badge ok";badge.textContent="ระบบพร้อมใช้งาน"}
    }catch(err){
      text("adminHealthConnection","Error");
      if(badge){badge.className="admin-health-badge error";badge.textContent="ต้องตรวจสอบ"}
      A.toast?.(A.humanError?.(err)||String(err),"error");
    }finally{
      text("adminHealthRefresh",new Date().toLocaleString("th-TH"));
    }
  }
  document.addEventListener("click",e=>{
    const open=e.target.closest("[data-admin-open]");
    if(open)app()?.switchPage?.(open.dataset.adminOpen);
  });
  document.addEventListener("DOMContentLoaded",()=>{
    $("adminCenterRefreshBtn")?.addEventListener("click",refreshAdminCenter);
    $("adminCenterSettingsBtn")?.addEventListener("click",()=>app()?.switchPage?.("system-settings"));
    document.querySelector('[data-page="admin-center"]')?.addEventListener("click",()=>setTimeout(refreshAdminCenter,0));
    window.addEventListener("ta:session-ready",refreshAdminCenter);
  });
  window.TimeClockAdminCenter={refresh:refreshAdminCenter};
})();

;

/* ===== js/settings-enterprise.js ===== */
"use strict";
(() => {
  const KEY = "ta_enterprise_settings_v4";
  const defaults = {
    systemName: "Time-Clock Management", companyName: "CP Retailink", environment: "Development", version: "6.4.0",
    footer: "Design by แผนกบริหารระบบข้อมูลบุคคล ซีพี รีเทลลิงค์", theme: "light", accent: "blue", font: "Noto Sans Thai",
    developerMode: false, viewAsRole: "HR_ADMIN",
    features: { dashboard:true, attendance:true, schedule:true, adminShifts:true, adminHolidays:true, adminUsers:true, adminImport:true },
    shiftColors: { D:"#2563eb", N:"#7c3aed", OFF:"#64748b", HOL:"#ea580c", LV:"#0f766e", OT:"#ca8a04" }
  };
  const $ = id => document.getElementById(id);
  const qs = (s,r=document)=>r.querySelector(s);
  const qsa = (s,r=document)=>[...r.querySelectorAll(s)];
  let settings = load();
  let profile = null;
  function deepMerge(a,b){ return {...a,...b,features:{...a.features,...(b?.features||{})},shiftColors:{...a.shiftColors,...(b?.shiftColors||{})}}; }
  function load(){ try{return deepMerge(defaults,JSON.parse(localStorage.getItem(KEY)||"{}"));}catch{return structuredClone(defaults);} }
  function save(){ localStorage.setItem(KEY,JSON.stringify(settings)); applyVisuals(); applyFeatureFlags(); }
  function getRuntimeSettings(){ return settings; }
  function applyVisuals(){
    document.documentElement.style.fontFamily = settings.font === "system" ? "system-ui,sans-serif" : "'Noto Sans Thai',sans-serif";
    document.body.classList.toggle("accent-orange",settings.accent==="orange"); document.body.classList.toggle("accent-teal",settings.accent==="teal");
    let dark=settings.theme==="dark" || (settings.theme==="system"&&matchMedia("(prefers-color-scheme: dark)").matches); document.body.classList.toggle("dark-mode",dark);
    qsa("[data-theme-choice]").forEach(x=>x.classList.toggle("active",x.dataset.themeChoice===settings.theme));
    Object.entries(settings.shiftColors).forEach(([k,v])=>document.documentElement.style.setProperty(`--shift-${k.toLowerCase()}`,v));
    document.title=`${settings.systemName} | ${settings.companyName}`;
  }
  const featureMeta=[
    ["dashboard","Dashboard","ภาพรวมและ KPI"],["attendance","Attendance","รายละเอียดเวลาทำงาน"],["schedule","Schedule","ปฏิทินจัดกะ"],
    ["adminShifts","Shift Master","ตั้งค่ากะทำงาน"],["adminHolidays","Holiday","วันหยุดนักขัตฤกษ์"],["adminUsers","User & Scope","จัดการสิทธิ์ผู้ใช้"],["adminImport","Employee Import","นำเข้าข้อมูลพนักงาน"]
  ];
  const featurePage={dashboard:"dashboard",attendance:"attendance",schedule:"schedule",adminShifts:"admin-shifts",adminHolidays:"admin-holidays",adminUsers:"admin-users",adminImport:"admin-import"};
  function applyFeatureFlags(){ for(const [k,p] of Object.entries(featurePage)){ const el=qs(`.nav-item[data-page="${p}"]`); if(el) el.classList.toggle("feature-hidden",settings.features[k]===false); } }
  function renderFeatureFlags(){ const root=$("featureFlagList"); if(!root)return; root.innerHTML=featureMeta.map(([k,n,d])=>`<div class="feature-row"><div><strong>${n}</strong><small>${d}</small></div><label class="switch"><input type="checkbox" data-feature-key="${k}" ${settings.features[k]!==false?"checked":""}><span></span></label></div>`).join(""); }
  function renderShiftColors(){ const root=$("shiftColorGrid"); if(!root)return; root.innerHTML=Object.entries(settings.shiftColors).map(([k,v])=>`<div class="shift-color-card"><label class="shift-color-swatch" style="background:${v}"><input type="color" data-shift-color="${k}" value="${v}"></label><div><strong>${k}</strong><small>${({D:"กะกลางวัน",N:"กะกลางคืน",OFF:"วันหยุด",HOL:"นักขัตฤกษ์",LV:"ลา",OT:"ล่วงเวลา"})[k]}</small></div></div>`).join(""); }
  function fillForm(){
    const map={setSystemName:"systemName",setEnvironment:"environment",setVersion:"version",setCompanyName:"companyName",setFooter:"footer",setAccent:"accent",setFont:"font"};
    for(const [id,k] of Object.entries(map)) if($(id)) $(id).value=settings[k];
    if($("setDeveloperMode")) $("setDeveloperMode").checked=settings.developerMode;
    if($("setViewAsRole")) $("setViewAsRole").value=settings.viewAsRole;
    if($("settingsVersionHero")) $("settingsVersionHero").textContent=settings.version;
    if($("settingsEnvironmentHero")) $("settingsEnvironmentHero").textContent=settings.environment;
    if($("aboutAppName")) $("aboutAppName").textContent=settings.systemName;
    if($("aboutVersion")) $("aboutVersion").textContent=settings.version;
    const cfg=JSON.parse(localStorage.getItem("ta_supabase_config_v1")||"null");
    if(cfg){ $("setConnectionUrl").value=cfg.url||""; $("setConnectionKey").value=maskKey(cfg.key||""); try{$("setProjectRef").value=new URL(cfg.url).hostname.split(".")[0]}catch{} }
    $("setSessionStatus").value=window.TimeClockApp?.state?.session?"Authenticated":"No active session";
    renderFeatureFlags(); renderShiftColors(); applyVisuals(); applyFeatureFlags();
  }
  function maskKey(k){ return k.length<14?"••••••":`${k.slice(0,8)}••••••••${k.slice(-6)}`; }
  function collect(){
    const map={setSystemName:"systemName",setEnvironment:"environment",setVersion:"version",setCompanyName:"companyName",setFooter:"footer",setAccent:"accent",setFont:"font"};
    for(const [id,k] of Object.entries(map)) if($(id)) settings[k]=$(id).value;
    settings.developerMode=$("setDeveloperMode")?.checked||false; settings.viewAsRole=$("setViewAsRole")?.value||"HR_ADMIN";
    qsa("[data-feature-key]").forEach(x=>settings.features[x.dataset.featureKey]=x.checked);
    qsa("[data-shift-color]").forEach(x=>settings.shiftColors[x.dataset.shiftColor]=x.value);
  }
  function syncProfile(p){ profile=p; if($("realRoleValue")) $("realRoleValue").textContent=p._realRole||p.role; $("developerConsole")?.classList.toggle("hidden",!(p._realRole==="HR_ADMIN"&&settings.developerMode)); fillForm(); }
  async function testConnection(){
    const chip=$("connectionStatus"); chip.textContent="Testing..."; chip.className="connection-chip";
    const t=performance.now(); try{ const c=window.TimeClockApp?.state?.client; if(!c)throw new Error("Supabase client not initialized"); const {data,error}=await c.auth.getSession(); if(error)throw error; chip.textContent=`Connected • ${Math.round(performance.now()-t)} ms`; chip.className="connection-chip success"; $("setSessionStatus").value=data.session?"Authenticated":"Connected / No session"; }
    catch(e){chip.textContent="Connection failed";chip.className="connection-chip error"; window.TimeClockApp?.toast?.(e.message,"error");}
  }
  function setDebug(name,ms,rows,status,msg){ if(!$("devLastRpc"))return; $("devLastRpc").textContent=name||"-"; $("devExecTime").textContent=ms==null?"-":`${Math.round(ms)} ms`; $("devRows").textContent=rows==null?"-":rows; $("devStatus").textContent=status; $("devMessage").textContent=msg||"-"; $("devConsoleSummary").textContent=`${status} • ${name}`; }
  function instrumentClient(client){
    if(!client||client.__taInstrumented)return; client.__taInstrumented=true; const original=client.rpc.bind(client);
    client.rpc=async function(name,args,opts){ const t=performance.now(); try{const res=await original(name,args,opts); const rows=Array.isArray(res.data)?res.data.length:(res.data?1:0); setDebug(name,performance.now()-t,rows,res.error?"Error":"Success",res.error?.message||"เรียก RPC สำเร็จ"); return res;}catch(e){setDebug(name,performance.now()-t,0,"Exception",e.message);throw e;} };
  }
  function bind(){
    qsa("[data-settings-tab]").forEach(b=>b.addEventListener("click",()=>{qsa("[data-settings-tab]").forEach(x=>x.classList.toggle("active",x===b));qsa("[data-settings-panel]").forEach(x=>x.classList.toggle("active",x.dataset.settingsPanel===b.dataset.settingsTab));}));
    qsa("[data-theme-choice]").forEach(b=>b.addEventListener("click",()=>{settings.theme=b.dataset.themeChoice;applyVisuals();fillForm();}));
    qsa("[data-save-settings]").forEach(b=>b.addEventListener("click",()=>{collect();save();fillForm();window.TimeClockApp?.toast?.("บันทึกการตั้งค่าแล้ว","success");}));
    $("setDeveloperMode")?.addEventListener("change",e=>{settings.developerMode=e.target.checked;});
    $("devReloadBtn")?.addEventListener("click",()=>{collect();save();window.TimeClockApp?.applyProfile?.();window.TimeClockApp?.toast?.(`กำลังทดสอบหน้าจอด้วย Role ${settings.viewAsRole}`,"success");});
    $("devClearCacheBtn")?.addEventListener("click",()=>{sessionStorage.clear();window.TimeClockApp?.toast?.("ล้าง UI cache แล้ว","success");});
    $("devRefreshMetadataBtn")?.addEventListener("click",async()=>{await window.TimeClockApp?.state?.client?.auth?.refreshSession();window.TimeClockApp?.toast?.("Refresh session metadata แล้ว","success");});
    $("resetShiftColorsBtn")?.addEventListener("click",()=>{settings.shiftColors={...defaults.shiftColors};renderShiftColors();applyVisuals();});
    $("testConnectionBtn")?.addEventListener("click",testConnection); $("openLegacyConfigBtn")?.addEventListener("click",()=>document.getElementById("configModal")?.classList.remove("hidden"));
    $("developerConsoleToggle")?.addEventListener("click",()=>$("developerConsoleBody").classList.toggle("hidden"));
    $("devConsoleClearBtn")?.addEventListener("click",()=>setDebug("-",null,null,"Ready","ล้าง Log แล้ว"));
  }
  window.TimeClockSettings={getRuntimeSettings,syncProfile,instrumentClient};
  document.addEventListener("DOMContentLoaded",()=>{bind();fillForm();applyVisuals();});
})();

;

/* ===== js/platform-shell.js ===== */
(() => {
  "use strict";
  const $=id=>document.getElementById(id),q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const VERSION="6.4.0";
  const menuItems=[
    ["dashboard","Dashboard","ภาพรวมการลงเวลา","▦"],["attendance","รายละเอียดเวลาทำงาน","ค้นหาและตรวจเวลาพนักงาน","◷"],["schedule","ปฏิทินจัดกะ","จัดกะรายเดือน","▣"],["report","ศูนย์รายงาน","CSV Excel และ Print/PDF","▤"],["smart-assistant","ผู้ช่วยวิเคราะห์","สรุปข้อมูล Time-Clock","✦"],
    ["admin-center","HR Admin Center","ศูนย์บริหารระบบ","◆"],["admin-employees","ข้อมูลพนักงาน","Employee Directory","♟"],["admin-shifts","ตั้งค่ากะทำงาน","Shift Master","◫"],["admin-holidays","วันหยุดนักขัตฤกษ์","Holiday Master","◈"],["admin-accounts","จัดการบัญชีผู้ใช้งาน","สร้าง User และ First Login","♜"],["admin-users","User และ Scope","สิทธิ์ผู้ใช้งาน","♙"],["admin-import","นำเข้าพนักงาน","Import CSV","⇧"],["admin-time-import","นำเข้าข้อมูลลงเวลา","MobileTA Text Import","⇩"],["admin-attendance-rebuild","ประมวลผล Attendance","Progress และ Error Log","↻"],["admin-audit","Audit Log","ประวัติการเปลี่ยนแปลง","⌁"],["system-settings","System Settings","Theme Developer และ Connection","⚙"]
  ];
  let selected=0,lastProfileKey="";
  const app=()=>window.TimeClockApp;
  const role=()=>($("roleBadge")?.textContent||"VIEWER").trim();
  const email=()=>($("sidebarUserEmail")?.textContent||"-").trim();
  const name=()=>($("sidebarUserName")?.textContent||email()).trim();
  function go(page){const el=q(`.nav-item[data-page="${page}"]`);if(el&&!el.classList.contains("hidden"))el.click();else app()?.switchPage?.(page);closeCommand();}

  function mountStatus(){if($("platformStatusbar"))return;const bar=document.createElement("div");bar.id="platformStatusbar";bar.className="platform-statusbar";bar.innerHTML=`<span id="sbConnDot" class="dot"></span><span id="sbEnv" class="status-pill">PROD</span><span id="sbRole">VIEWER</span><span id="sbEmail" class="hide-mobile">-</span><span class="status-spacer"></span><span id="sbRpc" class="hide-mobile">Supabase Ready</span><span>v${VERSION}</span>`;document.body.appendChild(bar);setInterval(()=>{if($("sbRole"))$("sbRole").textContent=role();if($("sbEmail"))$("sbEmail").textContent=email();const online=navigator.onLine;$("sbConnDot")?.classList.toggle("offline",!online);const key=`${role()}|${email()}`;if(email()!=="-"&&key!==lastProfileKey){lastProfileKey=key;document.dispatchEvent(new CustomEvent("timeclock:profile-ready",{detail:{role:role(),email:email()}}));}},700);}
  function mountCommand(){if($("commandBackdrop"))return;const el=document.createElement("div");el.id="commandBackdrop";el.className="command-backdrop hidden";el.innerHTML=`<div class="command-panel"><div class="command-input-wrap"><span>⌕</span><input id="commandInput" class="command-input" placeholder="ค้นหาเมนู รหัส หรือชื่อพนักงาน..." autocomplete="off"><span class="command-kbd">ESC</span></div><div id="commandResults" class="command-results"></div></div>`;document.body.appendChild(el);el.addEventListener("click",e=>{if(e.target===el)closeCommand()});$("commandInput").addEventListener("input",renderCommand);$("commandInput").addEventListener("keydown",e=>{const items=qa(".command-item",$("commandResults"));if(e.key==="ArrowDown"){e.preventDefault();selected=Math.min(selected+1,items.length-1);renderActive(items);}else if(e.key==="ArrowUp"){e.preventDefault();selected=Math.max(selected-1,0);renderActive(items);}else if(e.key==="Enter"&&items[selected])items[selected].click();});}
  function renderActive(items){items.forEach((x,i)=>x.classList.toggle("active",i===selected));items[selected]?.scrollIntoView({block:"nearest"});}
  function employeeItems(term){if(term.length<2)return[];const raw=app()?.state?.filters?.employees||[];return raw.map(x=>typeof x==="string"?{emp_code:x,full_name:""}:x).filter(x=>`${x.emp_code||x.employee_id||x.EmployeeId||""} ${x.full_name||x.name||""}`.toLowerCase().includes(term)).slice(0,8).map(x=>({emp:String(x.emp_code||x.employee_id||x.EmployeeId||""),name:String(x.full_name||x.name||"")}));}
  function renderCommand(){const term=$("commandInput").value.trim().toLowerCase();selected=0;const visible=new Set(qa(".nav-item:not(.hidden)").map(x=>x.dataset.page));const menus=menuItems.filter(x=>visible.has(x[0])&&(!term||`${x[1]} ${x[2]} ${x[0]}`.toLowerCase().includes(term)));const employees=employeeItems(term);const res=$("commandResults");if(!menus.length&&!employees.length){res.innerHTML=`<div class="command-empty">ไม่พบข้อมูลที่ตรงกับ “${term}”</div>`;return;}res.innerHTML=`${menus.length?`<div class="command-section-label">เมนู</div>${menus.map((x,i)=>`<button class="command-item ${i===0?"active":""}" data-go="${x[0]}"><span class="command-item-icon">${x[3]}</span><span class="command-item-text"><strong>${x[1]}</strong><small>${x[2]}</small></span></button>`).join("")}`:""}${employees.length?`<div class="command-section-label">พนักงาน</div>${employees.map(x=>`<button class="command-item" data-command-employee="${x.emp}"><span class="command-item-icon">♙</span><span class="command-item-text"><strong>${x.emp} ${x.name}</strong><small>เปิดรายละเอียดเวลาทำงาน</small></span></button>`).join("")}`:""}`;qa("[data-go]",res).forEach(b=>b.onclick=()=>go(b.dataset.go));qa("[data-command-employee]",res).forEach(
  b=>b.onclick=async()=>{
    go("attendance");
    await app()?.selectAttendanceEmployees?.(
      [b.dataset.commandEmployee],
      true
    );
  }
);}
  function openCommand(){if(!$("commandBackdrop"))return;$("commandBackdrop").classList.remove("hidden");$("commandInput").value="";renderCommand();setTimeout(()=>$("commandInput")?.focus(),20);}
  function closeCommand(){$("commandBackdrop")?.classList.add("hidden");}
  function mountDrawer(){if($("notificationDrawer"))return;const d=document.createElement("aside");d.id="notificationDrawer";d.className="notification-drawer";d.innerHTML=`<div class="drawer-head"><div><small>TIME-CLOCK V6</small><h3>การแจ้งเตือน</h3></div><button id="drawerClose" class="btn btn-light btn-icon">×</button></div><div class="drawer-tabs"><button class="drawer-tab active">ทั้งหมด</button><button class="drawer-tab" data-drawer-go="schedule">ตารางกะ</button></div><div class="drawer-body"><div class="notification-empty">กำลังโหลดการแจ้งเตือน...</div></div>`;document.body.appendChild(d);$("drawerClose").onclick=()=>d.classList.remove("open");qa("[data-drawer-go]",d).forEach(b=>b.onclick=()=>{go(b.dataset.drawerGo);d.classList.remove("open");});}
  function mountProfile(){if($("profileMenu"))return;const p=document.createElement("div");p.id="profileMenu";p.className="profile-menu hidden";p.innerHTML=`<div class="profile-head"><div class="profile-avatar" id="profileAvatar">TC</div><div class="profile-meta"><strong id="profileName">-</strong><span id="profileEmail">-</span><span id="profileRole">VIEWER</span></div></div><hr><button class="profile-action" data-profile-go="smart-assistant">✦ ผู้ช่วยวิเคราะห์</button><button class="profile-action" data-profile-go="system-settings">⚙ System Settings</button><button class="profile-action" id="profileTheme">◐ เปลี่ยนธีม</button><button class="profile-action" id="profileLogout">↪ ออกจากระบบ</button>`;document.body.appendChild(p);qa("[data-profile-go]",p).forEach(b=>b.onclick=()=>{go(b.dataset.profileGo);p.classList.add("hidden")});$("profileTheme").onclick=()=>$("themeToggleBtn")?.click();$("profileLogout").onclick=()=>$("logoutBtn")?.click();}
  function enhanceTopbar(){const old=q(".global-search");old?.classList.add("hidden-important");const right=q(".topbar-right");if(!right||$("shellSearchBtn"))return;const b=document.createElement("button");b.id="shellSearchBtn";b.className="btn btn-light shell-search-trigger desktop-only";b.innerHTML="<span>⌕ ค้นหาทั้งระบบ</span><kbd>Ctrl K</kbd>";b.onclick=openCommand;right.insertBefore(b,right.firstChild);const roleEl=$("roleBadge");if(roleEl){roleEl.style.cursor="pointer";roleEl.title="เปิดโปรไฟล์ผู้ใช้งาน";roleEl.onclick=toggleProfile;}}
  function toggleProfile(){const p=$("profileMenu");if(!p)return;p.classList.toggle("hidden");$("profileName").textContent=name();$("profileEmail").textContent=email();$("profileRole").textContent=role();$("profileAvatar").textContent=(name().slice(0,2)||"TC").toUpperCase();}
  function bind(){document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"){e.preventDefault();openCommand();}if(e.key==="Escape"){closeCommand();$("notificationDrawer")?.classList.remove("open");$("profileMenu")?.classList.add("hidden");}});$("notificationBtn")?.addEventListener("click",e=>{e.preventDefault();e.stopImmediatePropagation();$("notificationDrawer")?.classList.toggle("open");window.TimeClockFunctional?.loadNotifications?.();},true);document.addEventListener("click",e=>{if(!e.target.closest("#profileMenu")&&!e.target.closest("#roleBadge"))$("profileMenu")?.classList.add("hidden");});}
  function init(){mountStatus();mountCommand();mountDrawer();mountProfile();enhanceTopbar();bind();document.documentElement.dataset.platformVersion=VERSION;}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

;

/* ===== js/functional-complete.js ===== */
(() => {
  "use strict";

  const VERSION = "6.4.0";
  const $ = id => document.getElementById(id);
  const qs = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => [...r.querySelectorAll(s)];
  const app = () => window.TimeClockApp;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const fmtDate = v => v ? new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString("th-TH",{day:"2-digit",month:"2-digit",year:"numeric"}) : "-";
  const fmtDateTime = v => v ? new Date(v).toLocaleString("th-TH",{dateStyle:"short",timeStyle:"short"}) : "-";
  const fmtTime = v => { if(!v) return "-"; const s=String(v); if(s.includes("T")||s.includes(" ")){const d=new Date(v);if(!Number.isNaN(d.getTime()))return d.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",hour12:false});} return s.slice(0,5); };
  const num = v => Number(v || 0).toLocaleString("th-TH");
  const codeOf = r => {
    const raw = r?.assigned_shift_code
      || r?.effective_shift_code
      || r?.shift_code
      || r?.auto_shift_code
      || null;
    return app()?.normalizeTemplateCodeV665?.(raw) || raw;
  };
  const issueOf = r => String(r?.issue_type || r?.attendance_result || r?.attendance_status || r?.time_pair_status || "NEED_REVIEW").toUpperCase();
  const statusLabel = s => ({NORMAL:"ปกติ",ABSENT:"ไม่มีเวลา",MISSING_IN:"ไม่พบเวลาเข้า",MISSING_OUT:"ไม่พบเวลาออก",INVALID_TIME:"เวลาไม่ถูกต้อง",LATE:"มาสาย",EARLY_LEAVE:"กลับก่อน",LATE_AND_EARLY:"สายและกลับก่อน",WORKED_ON_OFFDAY:"ทำงานวันหยุด",WORKED_ON_WEEKLY_OFF:"ทำงานวันหยุดประจำสัปดาห์",WORKED_ON_HOLIDAY:"ทำงานวันหยุดนักขัตฤกษ์",WORKED_ON_COMP_OFF:"ทำงานวันหยุดชดเชย",OVERTIME:"มี OT",LATE_AND_EARLY_LEAVE:"สายและกลับก่อน",WORKDAY:"วันทำงาน",COMP_OFF:"วันหยุดชดเชย",LEAVE:"วันลา",NEED_REVIEW:"รอตรวจสอบ",HOLIDAY:"นักขัตฤกษ์",WEEKLY_OFF:"วันหยุดประจำสัปดาห์",INCOMPLETE_TIME:"เวลาไม่ครบ",COMPLETE:"ครบ",NO_TIME:"ไม่มีเวลา",LEAVE_APPROVED:"อนุมัติลา",LEAVE_WITH_TIME:"ลาแต่มีเวลา",PARTIAL_LEAVE:"ลาบางส่วน",PARTIAL_LEAVE_NO_TIME:"ลาบางส่วนแต่ไม่มีเวลา"})[s] || s || "-";

  function client(){ return app()?.state?.client || null; }
  async function rpc(name,args={}){
    const c=client(); if(!c) throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");
    const started=performance.now();
    const {data,error}=await c.rpc(name,args);
    window.TimeClockSettings?.recordApi?.(name,performance.now()-started,Array.isArray(data)?data.length:(data?1:0),error);
    if(error) throw error;
    return data;
  }
  function download(name,content,type){
    const blob=new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement("a");
    a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
  }
  const csvCell=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  function exportCsv(name,rows){download(name,"\ufeff"+rows.map(r=>r.map(csvCell).join(",")).join("\n"),"text/csv;charset=utf-8");}
  function exportExcel(name,rows,title="Time-Clock Report"){
    const html=`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial,'Noto Sans Thai',sans-serif}table{border-collapse:collapse;width:100%}th,td{border:1px solid #94a3b8;padding:6px;font-size:11px}th{background:#dbeafe;font-weight:700}h2{margin:0 0 12px}</style></head><body><h2>${esc(title)}</h2><table>${rows.map((r,i)=>`<tr>${r.map(v=>i===0?`<th>${esc(v)}</th>`:`<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
    download(name,`\ufeff${html}`,"application/vnd.ms-excel;charset=utf-8");
  }
  function printRows(rows,title,subtitle=""){
    const w=window.open("","_blank"); if(!w) return app()?.toast("Browser ปิดกั้นหน้าต่าง Print กรุณาอนุญาต Popup","error");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:'Noto Sans Thai',Arial,sans-serif;color:#0f172a}h1{font-size:19px;margin:0}p{font-size:11px;color:#475569}table{width:100%;border-collapse:collapse;margin-top:12px}th,td{border:1px solid #94a3b8;padding:5px;font-size:9px;vertical-align:top}th{background:#e2e8f0}footer{position:fixed;bottom:0;left:0;right:0;text-align:center;font-size:8px;color:#64748b}</style></head><body><h1>${esc(title)}</h1><p>${esc(subtitle)}</p><table>${rows.map((r,i)=>`<tr>${r.map(v=>i===0?`<th>${esc(v)}</th>`:`<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table><footer>Design by แผนกบริหารระบบข้อมูลบุคคล ซีพี รีเทลลิงค์</footer></body></html>`);
    w.document.close(); setTimeout(()=>{w.focus();w.print();},250);
  }

  /* ------------------------------------------------------------------
     DOM / Pages
     ------------------------------------------------------------------ */
  function injectNavAndPages(){
    const adminGroup=$("adminNavGroup");
    if(adminGroup && !qs('[data-page="admin-employees"]',adminGroup)){
      const settings=$("systemSettingsNav");
      const html=`<button class="nav-item" data-page="admin-employees"><span class="nav-icon">♟</span><span>ข้อมูลพนักงาน</span></button><button class="nav-item" data-page="admin-audit"><span class="nav-icon">⌁</span><span>Audit Log</span></button>`;
      settings?.insertAdjacentHTML("beforebegin",html);
    }
    const reportNav=qs('.nav-item[data-page="report"]');
    if(reportNav && !qs('.nav-item[data-page="smart-assistant"]')) reportNav.insertAdjacentHTML("afterend",`<button class="nav-item" data-page="smart-assistant"><span class="nav-icon">✦</span><span>ผู้ช่วยวิเคราะห์</span></button>`);
    const adminCards=qs("#page-admin-center .admin-module-grid");
    if(adminCards && !qs('[data-admin-open="admin-employees"]',adminCards)){
      adminCards.insertAdjacentHTML("afterbegin",`<button class="admin-module-card" data-admin-open="admin-employees"><span class="admin-module-icon">♟</span><div><strong>ข้อมูลพนักงาน</strong><small>ค้นหาและตรวจสอบสถานะพนักงานจากฐานข้อมูล</small></div><em>เปิด ›</em></button><button class="admin-module-card" data-admin-open="admin-audit"><span class="admin-module-icon">⌁</span><div><strong>Audit Log</strong><small>ประวัติการจัดกะ การล็อกเดือน และการใช้งานระบบ</small></div><em>เปิด ›</em></button>`);
    }

    const content=qs(".content"); if(!content) return;
    const footer=qs(".footer-credit",content);
    const addPage=html=>footer?footer.insertAdjacentHTML("beforebegin",html):content.insertAdjacentHTML("beforeend",html);
    if(!$("page-report")) addPage(reportPageHtml());
    if(!$("page-admin-employees")) addPage(employeePageHtml());
    if(!$("page-admin-audit")) addPage(auditPageHtml());
    if(!$("page-smart-assistant")) addPage(assistantPageHtml());

    qsa('.nav-item[data-page="admin-employees"],.nav-item[data-page="admin-audit"],.nav-item[data-page="smart-assistant"]').forEach(b=>{
      b.addEventListener("click",()=>{
        const page=b.dataset.page; app()?.switchPage?.(page);
        const titles={"admin-employees":["ข้อมูลพนักงาน","ค้นหาและตรวจสอบข้อมูลพนักงาน"],"admin-audit":["Audit Log","ประวัติการเปลี่ยนแปลงและการใช้งานระบบ"],"smart-assistant":["ผู้ช่วยวิเคราะห์","สรุปข้อมูลจาก Dashboard, Attendance และ Schedule"]};
        if($("pageTitle"))$("pageTitle").textContent=titles[page][0]; if($("pageSubtitle"))$("pageSubtitle").textContent=titles[page][1];
        if(page==="admin-employees") loadEmployees(); if(page==="admin-audit") loadAudit();
      });
    });
  }

  function reportPageHtml(){
    const cards=[
      ["attendance","◷","รายละเอียดเวลาทำงาน","เวลาเข้า–ออก กะ ชั่วโมงสุทธิ สาย และกลับก่อน"],
      ["schedule","▣","ตารางจัดกะรายเดือน","กะอัตโนมัติ กะที่กำหนด สถานะยืนยัน และประเภทวัน"],
      ["summary","▦","สรุป Dashboard","สรุปจำนวนพนักงานและสถานะสำคัญ"],
      ["late","◴","มาสายและกลับก่อน","เฉพาะรายการที่มีนาทีมาสายหรือกลับก่อน"]
    ];
    return `<section id="page-report" class="page report-center-page"><div class="report-hero"><div><span class="eyebrow">ENTERPRISE REPORT CENTER</span><h2>ศูนย์รายงาน Time-Clock</h2><p>สร้างรายงาน CSV, Excel และ Print/PDF โดยไม่กระทบหน้าการทำงานหลัก</p></div><button id="reportRefreshJobsBtn" class="btn btn-light">รีเฟรชประวัติ</button></div><div class="panel section-gap"><div class="panel-body"><div class="report-filter-grid"><div class="field"><label>วันที่เริ่มต้น</label><input id="reportStart" class="input" type="date"></div><div class="field"><label>วันที่สิ้นสุด</label><input id="reportEnd" class="input" type="date"></div><div class="field"><label>พื้นที่</label><select id="reportZone" class="select"><option value="">ทุกพื้นที่</option></select></div><div class="field"><label>หน่วยงาน</label><select id="reportDepartment" class="select"><option value="">ทุกหน่วยงาน</option></select></div></div></div></div><div class="report-card-grid section-gap">${cards.map(c=>`<article class="report-type-card"><div class="report-icon">${c[1]}</div><h3>${c[2]}</h3><p>${c[3]}</p><div class="report-format-actions"><button class="btn btn-light" data-run-report-format="${c[0]}|csv">CSV</button><button class="btn btn-success" data-run-report-format="${c[0]}|excel">Excel</button><button class="btn btn-orange" data-run-report-format="${c[0]}|print">PDF</button></div></article>`).join("")}</div><div class="panel section-gap"><div class="panel-header"><div><h3>ประวัติการส่งออก</h3><p>เก็บประวัติใน Browser และบันทึก Log ใน Supabase เมื่อพร้อมใช้งาน</p></div><button id="reportClearJobsBtn" class="btn btn-danger-soft">ล้างประวัติ</button></div><div class="panel-body"><div class="table-wrap"><table><thead><tr><th>วันเวลา</th><th>รายงาน</th><th>ช่วงข้อมูล</th><th>จำนวนแถว</th><th>สถานะ</th><th>ไฟล์</th></tr></thead><tbody id="reportJobsBody"></tbody></table></div></div></div></section>`;
  }
  function employeePageHtml(){
    return `
      <section
        id="page-admin-employees"
        class="page employee-directory-page employee-directory-v6103"
      >
        <div class="directory-hero employee-directory-hero">
          <div>
            <span class="eyebrow">EMPLOYEE DIRECTORY</span>
            <h2>ข้อมูลพนักงาน</h2>
            <p>
              ค้นหา ตรวจสอบ และแก้ไขข้อมูลพนักงาน
              โดย Zone / พื้นที่ / พื้นที่ย่อยอ้างอิงจากผังองค์กร
            </p>
          </div>

          <div class="employee-directory-hero-actions">
            <span class="employee-admin-chip">
              HR Admin • แก้ไขได้
            </span>
          </div>
        </div>

        <div class="panel section-gap employee-filter-panel">
          <div class="panel-body">
            <div class="employee-directory-filter-grid">
              <div class="field employee-filter-search">
                <label>ค้นหา</label>
                <input
                  id="employeeDirectorySearch"
                  class="input"
                  placeholder="รหัส ชื่อ Email ตำแหน่ง หน่วยงาน หรือ org_code"
                >
              </div>

              <div class="field">
                <label>Zone</label>
                <select
                  id="employeeDirectoryZone"
                  class="select"
                >
                  <option value="">ทุก Zone</option>
                </select>
              </div>

              <div class="field">
                <label>พื้นที่</label>
                <select
                  id="employeeDirectoryArea"
                  class="select"
                >
                  <option value="">ทุกพื้นที่</option>
                </select>
              </div>

              <div class="field">
                <label>พื้นที่ย่อย</label>
                <select
                  id="employeeDirectorySubArea"
                  class="select"
                >
                  <option value="">ทุกพื้นที่ย่อย</option>
                </select>
              </div>

              <div class="field">
                <label>หน่วยงาน</label>
                <select
                  id="employeeDirectoryDepartment"
                  class="select"
                >
                  <option value="">ทุกหน่วยงาน</option>
                </select>
              </div>

              <div class="field">
                <label>สถานะ</label>
                <select
                  id="employeeDirectoryActive"
                  class="select"
                >
                  <option value="true">
                    กำลังปฏิบัติงาน
                  </option>
                  <option value="false">
                    ทุกสถานะ
                  </option>
                </select>
              </div>

              <div class="employee-filter-actions">
                <button
                  id="employeeDirectoryResetBtn"
                  class="btn btn-light employee-filter-reset-btn"
                >
                  ↺ รีเซ็ต
                </button>

                <button
                  id="employeeDirectoryLoadBtn"
                  class="btn btn-primary employee-filter-search-btn"
                >
                  ⌕ ค้นหา
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="employee-directory-kpis section-gap">
          <article class="employee-directory-kpi">
            <span>ผลการค้นหา</span>
            <strong id="employeeDirectoryCount">0</strong>
            <small>คน</small>
          </article>

          <article class="employee-directory-kpi success">
            <span>กำลังปฏิบัติงาน</span>
            <strong id="employeeDirectoryActiveCount">0</strong>
            <small>คน</small>
          </article>

          <article class="employee-directory-kpi warning">
            <span>รอเริ่มงาน</span>
            <strong id="employeeDirectoryWaitingCount">0</strong>
            <small>คน</small>
          </article>

          <article class="employee-directory-kpi muted">
            <span>พ้นสภาพ</span>
            <strong id="employeeDirectoryResignedCount">0</strong>
            <small>คน</small>
          </article>
        </div>

        <div class="panel section-gap employee-directory-table-panel">
          <div class="panel-header employee-directory-table-head">
            <div>
              <h3>รายชื่อพนักงาน</h3>
              <p id="employeeDirectoryMeta">
                ยังไม่ได้โหลดข้อมูล
              </p>
            </div>

            <div class="employee-directory-table-tools">
              <div class="field employee-page-size-field">
                <label>แสดงต่อหน้า</label>
                <select
                  id="employeeDirectoryPageSize"
                  class="select"
                >
                  <option value="100" selected>100</option>
                  <option value="250">250</option>
                  <option value="500">500</option>
                  <option value="1000">1,000</option>
                  <option value="999999">ทั้งหมด</option>
                </select>
              </div>

              <button
                id="employeeExportBtn"
                class="btn btn-success employee-export-btn"
              >
                ⇩ Excel
              </button>
            </div>
          </div>

          <div class="panel-body">
            <div class="table-wrap directory-table-wrap">
              <table class="directory-table employee-directory-table">
                <thead>
                  <tr>
                    <th>รหัส</th>
                    <th>ชื่อ-นามสกุล</th>
                    <th>Email</th>
                    <th>ตำแหน่ง</th>
                    <th>หน่วยงาน</th>
                    <th>Zone</th>
                    <th>พื้นที่</th>
                    <th>พื้นที่ย่อย</th>
                    <th>วันที่เริ่มงาน</th>
                    <th>วันที่ลาออก</th>
                    <th>สถานะ</th>
                    <th>จัดการ</th>
                  </tr>
                </thead>
                <tbody id="employeeDirectoryBody"></tbody>
              </table>
            </div>

            <div class="employee-directory-pagination">
              <button
                id="employeeDirectoryPrev"
                class="btn btn-light"
              >
                ‹ ก่อนหน้า
              </button>

              <span
                id="employeeDirectoryPageInfo"
                class="employee-directory-page-info"
              >
                หน้า 1 / 1
              </span>

              <button
                id="employeeDirectoryNext"
                class="btn btn-light"
              >
                ถัดไป ›
              </button>
            </div>
          </div>
        </div>
      </section>

      <div
        id="employeeEditModal"
        class="modal-backdrop hidden"
      >
        <div class="modal extra-large employee-edit-modal">
          <div class="modal-header">
            <div>
              <div class="employee-edit-title-row">
                <h3>แก้ไขข้อมูลพนักงาน</h3>
                <span>HR ADMIN</span>
              </div>
              <p>
                Zone / พื้นที่ / พื้นที่ย่อย
                จะอ้างอิงจาก org_code ที่เลือก
              </p>
            </div>

            <button
              class="btn btn-light btn-icon"
              data-employee-edit-close
            >
              ×
            </button>
          </div>

          <div class="modal-body">
            <div class="employee-edit-grid">
              <div class="field">
                <label>รหัสพนักงาน</label>
                <input
                  id="employeeEditCode"
                  class="input"
                  readonly
                >
              </div>

              <div class="field">
                <label>ชื่อ-นามสกุล *</label>
                <input
                  id="employeeEditName"
                  class="input"
                >
              </div>

              <div class="field">
                <label>Email</label>
                <input
                  id="employeeEditEmail"
                  class="input"
                  type="email"
                >
              </div>

              <div class="field">
                <label>ตำแหน่ง</label>
                <input
                  id="employeeEditPosition"
                  class="input"
                >
              </div>

              <div class="field">
                <label>หน่วยงาน</label>
                <input
                  id="employeeEditDepartment"
                  class="input"
                >
              </div>

              <div class="field">
                <label>org_code *</label>
                <input
                  id="employeeEditOrgCode"
                  class="input"
                  list="employeeEditOrgList"
                  autocomplete="off"
                >
                <datalist id="employeeEditOrgList"></datalist>
              </div>
            </div>

            <div class="employee-edit-location">
              <div>
                <span>Zone</span>
                <strong id="employeeEditZone">-</strong>
              </div>
              <div>
                <span>พื้นที่</span>
                <strong id="employeeEditArea">-</strong>
              </div>
              <div>
                <span>พื้นที่ย่อย</span>
                <strong id="employeeEditSubArea">-</strong>
              </div>
            </div>

            <div class="employee-edit-grid employee-edit-grid-lower">
              <div class="field">
                <label>ทีมรถ</label>
                <input
                  id="employeeEditCarTeam"
                  class="input"
                >
              </div>

              <div class="field">
                <label>วันที่เริ่มงาน</label>
                <input
                  id="employeeEditStartDate"
                  class="input"
                  type="date"
                >
              </div>

              <div class="field">
                <label>วันที่ลาออก</label>
                <input
                  id="employeeEditResignDate"
                  class="input"
                  type="date"
                >
              </div>

              <div class="field employee-edit-note">
                <label>หมายเหตุการแก้ไข</label>
                <input
                  id="employeeEditNote"
                  class="input"
                  placeholder="ระบุเหตุผลหรือหมายเหตุ"
                >
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <button
              class="btn btn-light"
              data-employee-edit-close
            >
              ยกเลิก
            </button>

            <button
              id="employeeEditSaveBtn"
              class="btn btn-primary"
            >
              บันทึกข้อมูลพนักงาน
            </button>
          </div>
        </div>
      </div>
    `;
  }
  function auditPageHtml(){return `<section id="page-admin-audit" class="page audit-center-page"><div class="audit-hero"><div><span class="eyebrow">SYSTEM AUDIT CENTER</span><h2>ประวัติการเปลี่ยนแปลง</h2><p>ตรวจสอบการจัดกะ การยืนยัน/ล็อกตาราง และการปิดรายการ Review</p></div><button id="auditExportBtn" class="btn btn-success">Export Excel</button></div><div class="panel section-gap"><div class="panel-body"><div class="fc-toolbar"><div class="field"><label>วันที่เริ่มต้น</label><input id="auditStart" class="input" type="date"></div><div class="field"><label>วันที่สิ้นสุด</label><input id="auditEnd" class="input" type="date"></div><div class="field"><label>ประเภท</label><select id="auditType" class="select"><option value="">ทั้งหมด</option><option value="SHIFT_ASSIGNMENT">การจัดกะ</option><option value="SCHEDULE_MONTH">สถานะตารางกะ</option><option value="REVIEW">Review</option></select></div><div class="field"><label>ค้นหา</label><input id="auditSearch" class="input" placeholder="ผู้ดำเนินการ รหัส หรือรายละเอียด"></div><div class="toolbar-actions"><button id="auditLoadBtn" class="btn btn-primary">ค้นหา</button></div></div></div></div><div class="panel section-gap"><div class="panel-header"><div><h3>Audit Log</h3><p id="auditCount">0 รายการ</p></div></div><div class="panel-body"><div class="table-wrap" style="max-height:68vh"><table><thead><tr><th>วันเวลา</th><th>ประเภท</th><th>การทำงาน</th><th>ผู้ดำเนินการ</th><th>รายการ</th><th>รายละเอียด</th></tr></thead><tbody id="auditBody"></tbody></table></div></div></div></section>`;}
  function assistantPageHtml(){return `<section id="page-smart-assistant" class="page smart-assistant-page"><div class="assistant-hero"><div><span class="eyebrow">SMART DATA ASSISTANT</span><h2>ผู้ช่วยวิเคราะห์ Time-Clock</h2><p>สรุปจากข้อมูลที่ระบบโหลดจริง โดยไม่ส่งข้อมูลออกไปภายนอก</p></div><span class="fc-chip status-PUBLISHED">Local Insight Engine</span></div><div class="assistant-shell section-gap"><div class="assistant-chat"><div id="assistantMessages" class="assistant-messages"><div class="assistant-message bot"><strong>สวัสดีครับ</strong>ถามข้อมูล เช่น “วันนี้ Missing OUT กี่คน”, “หน่วยงานไหนมาสายมากสุด” หรือ “กะเดือนนี้ยืนยันแล้วกี่เปอร์เซ็นต์”</div></div><div class="assistant-inputbar"><input id="assistantInput" class="input" placeholder="พิมพ์คำถามเกี่ยวกับข้อมูล Time-Clock"><button id="assistantSendBtn" class="btn btn-primary">ถาม</button></div></div><aside><div class="panel"><div class="panel-header"><div><h3>คำถามแนะนำ</h3><p>กดเพื่อถามได้ทันที</p></div></div><div class="panel-body assistant-prompts"><button class="assistant-prompt">วันนี้ Missing IN กี่คน</button><button class="assistant-prompt">วันนี้ Missing OUT กี่คน</button><button class="assistant-prompt">หน่วยงานไหนมาสายมากที่สุด</button><button class="assistant-prompt">กะเดือนนี้ยืนยันแล้วกี่เปอร์เซ็นต์</button><button class="assistant-prompt">สรุปรายการรอตรวจสอบ</button><div class="assistant-disclaimer">รุ่นนี้เป็น Rule-based Insight จากข้อมูลในระบบ ไม่ได้เชื่อมบริการ AI ภายนอก</div></div></div></aside></div></section>`;}

  /* ------------------------------------------------------------------
     Attendance Enterprise Grid
     ------------------------------------------------------------------ */
  const attGrid={search:"",sortKey:"work_date",sortDir:"desc",page:1,pageSize:100,rows:[]};
  const ATTENDANCE_OPTIONAL_KEYS = [
    "zone",
    "sub_area",
    "template_code",
    "overtime_minutes",
    "waiting_minutes",
    "break_deducted_minutes",
    "late_minutes",
    "early_leave_minutes",
    "absence_minutes",
    "comp_off_balance"
  ];

  function applyAttendanceColumnVisibility(){
    ATTENDANCE_OPTIONAL_KEYS.forEach(key => {
      const visible =
        app()?.attendanceIsColumnVisible?.(key) === true;

      qsa(
        `[data-att-col="${key}"]`,
        $("page-attendance")
      ).forEach(element => {
        element.classList.toggle(
          "attendance-col-hidden",
          !visible
        );
      });
    });
  }

  function enhanceAttendance(){
    const page=$("page-attendance"); if(!page || $("attendanceEnterpriseTools")) return;
    const tablePanel=qs(".panel.section-gap",page);
    tablePanel?.insertAdjacentHTML(
      "beforebegin",
      `<div
        id="attendanceEnterpriseTools"
        class="panel attendance-enterprise-tools"
      >
        <div class="panel-body">
          <div class="attendance-result-toolbar">
            <div class="attendance-result-heading">
              <h3>สรุปผลการค้นหา</h3>
              <p>ข้อมูลตามช่วงวันที่และตัวกรองที่เลือก</p>
            </div>
            <div class="field attendance-page-size-field">
              <label>จำนวนต่อหน้า</label>
              <select
                id="attendancePageSize"
                class="select"
              >
                <option>50</option>
                <option selected>100</option>
                <option>200</option>
                <option value="999999">ทั้งหมด</option>
              </select>
            </div>
          </div>
          <div class="attendance-grid-summary">
            <div class="attendance-mini-kpi">
              <span>ผลลัพธ์</span>
              <strong id="attGridTotal">0</strong>
            </div>
            <div class="attendance-mini-kpi">
              <span>ปกติ</span>
              <strong id="attGridNormal">0</strong>
            </div>
            <div class="attendance-mini-kpi">
              <span>ขาดงาน</span>
              <strong id="attGridAbsent">0</strong>
            </div>
            <div class="attendance-mini-kpi">
              <span>รูดบัตรไม่ครบ</span>
              <strong id="attGridMissing">0</strong>
            </div>
            <div class="attendance-mini-kpi">
              <span>มาสาย</span>
              <strong id="attGridLate">0</strong>
            </div>
            <div class="attendance-mini-kpi">
              <span>ทำงานวันหยุด</span>
              <strong id="attGridOffday">0</strong>
            </div>
            <div class="attendance-mini-kpi">
              <span>มี OT</span>
              <strong id="attGridOt">0</strong>
            </div>
            <div class="attendance-mini-kpi">
              <span>มีช่วงรอคอย</span>
              <strong id="attGridWaiting">0</strong>
            </div>
          </div>
        </div>
      </div>`
    );
    const table=qs("table",tablePanel); table?.classList.add("attendance-grid-table");
    const keys=[
      "work_date","emp_code","full_name","department",
      "zone","sub_area","pattern_code","template_code",
      "day_type","shift_start","shift_end","shift_code",
      "first_in","last_out","display_status",
      "net_work_minutes","regular_minutes",
      "overtime_minutes","waiting_minutes",
      "break_deducted_minutes","late_minutes",
      "early_leave_minutes","absence_minutes",
      "comp_off_balance"
    ];
    qsa("thead th",table).forEach((th,i)=>{th.dataset.sortKey=keys[i]; if(i===0)th.classList.add("sticky-att-1"); if(i===1)th.classList.add("sticky-att-2");});
    qs(".panel-body",tablePanel)?.insertAdjacentHTML("beforeend",`<div class="attendance-pagination"><button id="attPrevPage" class="btn btn-light">‹ ก่อนหน้า</button><span id="attPageInfo" class="page-info">หน้า 1 / 1</span><button id="attNextPage" class="btn btn-light">ถัดไป ›</button></div>`);
    document.body.insertAdjacentHTML("beforeend",`
      <aside
        id="attendanceDetailDrawer"
        class="attendance-detail-drawer"
        aria-label="Attendance Detail"
      >
        <div class="attendance-detail-head">
          <div class="attendance-detail-heading">
            <small>ATTENDANCE DETAIL</small>
            <h3 id="attendanceDetailTitle">รายละเอียดเวลา</h3>
            <p id="attendanceDetailSubtitle">-</p>
          </div>
          <div class="attendance-detail-head-actions">
            <button
              id="attendanceDetailPrev"
              class="btn btn-light btn-icon"
              title="รายการก่อนหน้า"
            >‹</button>
            <button
              id="attendanceDetailNext"
              class="btn btn-light btn-icon"
              title="รายการถัดไป"
            >›</button>
            <button
              id="attendanceDetailClose"
              class="btn btn-light btn-icon"
              title="ปิด"
            >×</button>
          </div>
        </div>
        <div
          id="attendanceDetailBody"
          class="attendance-detail-body"
        ></div>
        <div
          id="attendanceDetailFooter"
          class="attendance-detail-footer"
        ></div>
      </aside>
    `);

    $("attendancePageSize")?.addEventListener("change",e=>{attGrid.pageSize=Number(e.target.value);attGrid.page=1;renderAttendanceEnterprise();});
    $("attPrevPage")?.addEventListener("click",()=>{if(attGrid.page>1){attGrid.page--;renderAttendanceEnterprise();}});
    $("attNextPage")?.addEventListener("click",()=>{const max=Math.ceil(attGrid.rows.length/attGrid.pageSize)||1;if(attGrid.page<max){attGrid.page++;renderAttendanceEnterprise();}});
    $("attendanceExcelBtn")?.addEventListener("click",()=>exportAttendanceEnterprise("excel"));
    $("attendancePrintBtn")?.addEventListener("click",()=>exportAttendanceEnterprise("print"));
    qsa("[data-att-column-toggle]",page).forEach(toggle => {
      toggle.checked = false;
      toggle.addEventListener("change",() => {
        applyAttendanceColumnVisibility();
      });
    });
    applyAttendanceColumnVisibility();
    $("attendanceDetailClose")?.addEventListener(
      "click",
      () => $("attendanceDetailDrawer")
        ?.classList.remove("open")
    );
    $("attendanceDetailPrev")?.addEventListener(
      "click",
      () => moveAttendanceDetail(-1)
    );
    $("attendanceDetailNext")?.addEventListener(
      "click",
      () => moveAttendanceDetail(1)
    );
    table?.addEventListener("click",e=>{
      const th=e.target.closest("th[data-sort-key]"); if(th){const k=th.dataset.sortKey;attGrid.sortDir=attGrid.sortKey===k&&attGrid.sortDir==="asc"?"desc":"asc";attGrid.sortKey=k;renderAttendanceEnterprise();return;}
      const tr=e.target.closest("tbody tr[data-att-key]"); if(tr) openAttendanceDetail(tr.dataset.attKey);
    });
  }
  function attendanceRawStatus(r){
    return String(
      r.calculation_status
      || r.attendance_result
      || r.attendance_status
      || ""
    ).toUpperCase();
  }
  function attendanceStatus(r){
    return app()?.attendanceDisplayStatus?.(r)
      || attendanceRawStatus(r)
      || "NORMAL";
  }
  function attendanceStatusText(r){
    return app()?.attendanceDisplayLabel?.(r)
      || attendanceStatusText(r);
  }
  function attendanceAbsence(r){
    return Number(
      app()?.attendanceAbsenceMinutes?.(r)
      ?? r.absence_minutes
      ?? 0
    );
  }
  function attendanceRows(){
    const term=attGrid.search; let rows=[...(app()?.state?.attendance||[])];
    if(term) rows=rows.filter(r=>[r.emp_code,r.full_name,r.department,r.zone,r.sub_area,r.pattern_code,r.template_code,r.day_type,codeOf(r),statusLabel(attendanceStatus(r))].some(v=>String(v||"").toLowerCase().includes(term)));
    const key=attGrid.sortKey,dir=attGrid.sortDir==="asc"?1:-1;
    rows.sort((a,b)=>{let av,bv;if(key==="shift_start"){av=app()?.attendanceShiftTime?.(a,"start");bv=app()?.attendanceShiftTime?.(b,"start");}else if(key==="shift_end"){av=app()?.attendanceShiftTime?.(a,"end");bv=app()?.attendanceShiftTime?.(b,"end");}else if(key==="shift_code"){av=codeOf(a);bv=codeOf(b);}else if(key==="display_status"){av=attendanceStatus(a);bv=attendanceStatus(b);}else{av=a[key];bv=b[key];}if(typeof av==="number"||typeof bv==="number")return (Number(av||0)-Number(bv||0))*dir;return String(av||"").localeCompare(String(bv||""),"th")*dir;});
    return rows;
  }
  function renderAttendanceEnterprise(){
    if(!$("attendanceBody"))return;

    const all=attendanceRows();
    attGrid.rows=all;
    const max=Math.max(
      1,
      Math.ceil(all.length/attGrid.pageSize)
    );
    attGrid.page=Math.min(attGrid.page,max);
    const start=(attGrid.page-1)*attGrid.pageSize;
    const rows=all.slice(start,start+attGrid.pageSize);

    const shifts=app()?.state?.filters?.shifts||[];
    const shiftTime=(r,side)=>
      app()?.attendanceShiftTime?.(r,side)
      ||(()=>{
        const master=shifts.find(
          shift=>
            String(shift.shift_code).toUpperCase()
            ===String(codeOf(r)||"").toUpperCase()
        )||{};
        return side==="start"
          ? master.start_time
          : master.end_time;
      })();

    const optionalClass=key=>
      app()?.attendanceIsColumnVisible?.(key)
        ? ""
        : " attendance-col-hidden";

    $("attendanceBody").innerHTML=rows.length
      ? rows.map(r=>{
          const status=attendanceStatus(r);
          const key=
            `${r.emp_code}|${String(r.work_date).slice(0,10)}`;
          const comp=r.comp_off_earned
            ? `ได้รับ${
                r.comp_off_balance!=null
                  ? ` / ${Number(r.comp_off_balance)
                      .toLocaleString("th-TH")}`
                  : ""
              }`
            : (
                r.comp_off_balance!=null
                  ? Number(r.comp_off_balance)
                    .toLocaleString("th-TH")
                  : "-"
              );

          const badgeClass=
            status==="LEAVE"
              ? "leave"
              : ["NORMAL","COMPLETE"].includes(status)
                ? "active"
                : status==="ABSENCE"
                  ? "danger"
                  : status==="DAY_OFF"
                    ? "neutral"
                    : "warning";

          return `<tr data-att-key="${esc(key)}">
            <td data-att-col="work_date" class="nowrap sticky-att-1">${fmtDate(r.work_date)}</td>
            <td data-att-col="emp_code" class="sticky-att-2"><strong>${esc(r.emp_code)}</strong></td>
            <td data-att-col="full_name" class="nowrap">${esc(r.full_name)}</td>
            <td data-att-col="department">${esc(r.department||"-")}</td>
            <td data-att-col="zone" class="${optionalClass("zone").trim()}">${esc(r.zone||r.area||"-")}</td>
            <td data-att-col="sub_area" class="${optionalClass("sub_area").trim()}">${esc(r.sub_area||"-")}</td>
            <td data-att-col="pattern_code"><span class="fc-badge active">${esc(r.pattern_code||"-")}</span></td>
            <td data-att-col="template_code" class="${optionalClass("template_code").trim()}">${esc(app()?.normalizeTemplateCodeV665?.(r.template_code)||r.template_code||"-")}</td>
            <td data-att-col="day_type">${esc(statusLabel(r.day_type||"-"))}</td>
            <td data-att-col="shift_start">${fmtTime(shiftTime(r,"start"))}</td>
            <td data-att-col="shift_end">${fmtTime(shiftTime(r,"end"))}</td>
            <td data-att-col="shift_code"><span class="badge badge-blue">${esc(codeOf(r)||"-")}</span></td>
            <td data-att-col="first_in">${fmtTime(r.actual_in_at||r.first_in)}</td>
            <td data-att-col="last_out">${fmtTime(r.actual_out_at||r.last_out)}</td>
            <td data-att-col="display_status"><span class="fc-badge ${badgeClass}">${esc(attendanceStatusText(r))}</span></td>
            <td data-att-col="net_work_minutes" class="text-right">${(Number(r.net_work_minutes||0)/60).toLocaleString("th-TH",{minimumFractionDigits:1,maximumFractionDigits:2})}</td>
            <td data-att-col="regular_minutes" class="text-right">${(Number(r.regular_minutes||0)/60).toLocaleString("th-TH",{minimumFractionDigits:1,maximumFractionDigits:2})}</td>
            <td data-att-col="overtime_minutes" class="text-right calc-ot${optionalClass("overtime_minutes")}">${(Number(r.overtime_minutes||0)/60).toLocaleString("th-TH",{minimumFractionDigits:1,maximumFractionDigits:2})}</td>
            <td data-att-col="waiting_minutes" class="text-right${optionalClass("waiting_minutes")}">${(Number(r.waiting_minutes||0)/60).toLocaleString("th-TH",{minimumFractionDigits:1,maximumFractionDigits:2})}</td>
            <td data-att-col="break_deducted_minutes" class="text-right${optionalClass("break_deducted_minutes")}">${(Number(r.break_deducted_minutes||0)/60).toLocaleString("th-TH",{minimumFractionDigits:1,maximumFractionDigits:2})}</td>
            <td data-att-col="late_minutes" class="text-right${optionalClass("late_minutes")}">${num(r.late_minutes)}</td>
            <td data-att-col="early_leave_minutes" class="text-right${optionalClass("early_leave_minutes")}">${num(r.early_leave_minutes)}</td>
            <td data-att-col="absence_minutes" class="text-right absence-value${optionalClass("absence_minutes")}">${num(attendanceAbsence(r))}</td>
            <td data-att-col="comp_off_balance" class="${optionalClass("comp_off_balance")}">${esc(comp)}</td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="24" class="fc-empty">ไม่พบข้อมูล</td></tr>`;

    $("attendanceCount").textContent=
      `${num(all.length)} รายการ`;
    $("attGridTotal").textContent=num(all.length);
    $("attGridNormal").textContent=num(
      all.filter(r=>attendanceStatus(r)==="NORMAL").length
    );
    $("attGridAbsent").textContent=num(
      all.filter(r=>attendanceAbsence(r)>0).length
    );
    $("attGridMissing").textContent=num(
      all.filter(r=>
        ["MISSING_IN","MISSING_OUT","MISSING_BOTH"]
          .includes(
            String(r.absence_reason||"").toUpperCase()
          )
      ).length
    );
    $("attGridLate").textContent=num(
      all.filter(r=>Number(r.late_minutes||0)>0).length
    );
    $("attGridOffday").textContent=num(
      all.filter(r=>attendanceStatus(r)==="DAY_OFF").length
    );
    $("attGridOt").textContent=num(
      all.filter(r=>Number(r.overtime_minutes||0)>0).length
    );
    $("attGridWaiting").textContent=num(
      all.filter(r=>Number(r.waiting_minutes||0)>0).length
    );

    $("attPageInfo").textContent=
      `หน้า ${attGrid.page.toLocaleString("th-TH")} / `
      + `${max.toLocaleString("th-TH")} • แสดง `
      + `${rows.length.toLocaleString("th-TH")} จาก `
      + `${all.length.toLocaleString("th-TH")}`;

    $("attPrevPage").disabled=attGrid.page<=1;
    $("attNextPage").disabled=attGrid.page>=max;

    qsa(
      "thead th[data-sort-key]",
      $("page-attendance")
    ).forEach(th=>{
      th.classList.toggle(
        "sort-asc",
        th.dataset.sortKey===attGrid.sortKey
          && attGrid.sortDir==="asc"
      );
      th.classList.toggle(
        "sort-desc",
        th.dataset.sortKey===attGrid.sortKey
          && attGrid.sortDir==="desc"
      );
    });

    applyAttendanceColumnVisibility();
  }

  let attendanceDetailCurrentKey = null;
  let attendanceDetailRequestId = 0;

  function attendanceDetailRows(){
    return attendanceRows();
  }

  function attendanceDetailRow(key){
    const [emp,date]=String(key||"").split("|");
    return (app()?.state?.attendance||[]).find(
      row =>
        String(row.emp_code)===emp
        && String(row.work_date).slice(0,10)===date
    );
  }

  function attendanceDetailStatusTone(status){
    const code=String(status||"").toUpperCase();
    if(code==="ABSENCE")return "danger";
    if(code==="LEAVE")return "leave";
    if(code==="DAY_OFF")return "neutral";
    if([
      "LATE","EARLY_LEAVE",
      "LATE_AND_EARLY_LEAVE","NEED_REVIEW"
    ].includes(code))return "warning";
    return "success";
  }

  function attendanceDetailHours(value){
    return (
      Number(value||0)/60
    ).toLocaleString(
      "th-TH",
      {
        minimumFractionDigits:1,
        maximumFractionDigits:2
      }
    );
  }

  function attendanceDetailMetric(
    label,
    value,
    note="",
    tone=""
  ){
    return `<article class="attendance-detail-metric ${tone}">
      <span>${esc(label)}</span>
      <strong>${esc(value??"-")}</strong>
      ${note?`<small>${esc(note)}</small>`:""}
    </article>`;
  }

  function attendanceDetailInfoItem(label,value){
    return `<div class="attendance-detail-info-item">
      <span>${esc(label)}</span>
      <strong>${esc(value??"-")}</strong>
    </div>`;
  }

  function attendanceDetailScheduleRow(row){
    return {
      ...row,
      emp_code:String(row.emp_code||""),
      work_date:String(row.work_date||"").slice(0,10),
      full_name:row.full_name||row.emp_code,
      pattern_code:
        row.pattern_code
        || row.resolved_pattern_code
        || (
          String(row.pc||"").match(/4/)
            ? "TECH_5D"
            : "TECH_6D"
        ),
      template_code:
        row.template_code
        || row.default_template_code
        || null,
      assigned_shift_code:
        row.assigned_shift_code
        || null,
      effective_shift_code:
        row.effective_shift_code
        || row.shift_code
        || null,
      auto_shift_code:
        row.auto_shift_code
        || row.shift_code
        || null,
      default_shift_code:
        row.default_shift_code
        || null,
      is_confirmed:
        row.is_confirmed===true
        || String(row.schedule_status||"")
          .toUpperCase()==="CONFIRMED",
      schedule_status:
        row.schedule_status
        || (
          row.assigned_shift_code
            ? "ASSIGNED"
            : "AUTO"
        ),
      schedule_note:
        row.schedule_note
        || row.note
        || ""
    };
  }

  async function openAttendanceQuickShift(key){
    const row=attendanceDetailRow(key);
    if(!row){
      return app()?.toast?.(
        "ไม่พบข้อมูล Attendance รายการนี้",
        "error"
      );
    }

    const scheduleRow=
      attendanceDetailScheduleRow(row);
    const scheduleState=
      app()?.state?.schedule||[];
    const index=scheduleState.findIndex(
      item =>
        String(item.emp_code)===scheduleRow.emp_code
        && String(item.work_date).slice(0,10)
          ===scheduleRow.work_date
    );

    if(index>=0){
      scheduleState[index]={
        ...scheduleState[index],
        ...scheduleRow
      };
    }else{
      scheduleState.push(scheduleRow);
    }

    window.TimeClockAttendanceReturnContext={
      source:"attendance-detail",
      key,
      reopenDetail:true,
      attendancePage:attGrid.page,
      attendanceSearch:attGrid.search
    };

    $("attendanceDetailDrawer")
      ?.classList.remove("open");

    await app()?.openAssignment?.(
      scheduleRow.emp_code,
      scheduleRow.work_date
    );

    const reason=$("assignReason");
    if(reason){
      reason.value=
        "แก้ไขกะจาก Attendance Detail";
    }
  }

  async function openAttendanceCalendar(key){
    const row=attendanceDetailRow(key);
    if(!row)return;

    const emp=String(row.emp_code);
    const date=String(row.work_date).slice(0,10);

    $("attendanceDetailDrawer")
      ?.classList.remove("open");

    app()?.switchPage?.("schedule");

    if($("scheduleSearch")){
      $("scheduleSearch").value=emp;
    }

    const start=
      window.TimeClockSchedulePeriod
        ?.blockStartForDate?.(date)
      || date;

    if($("schedulePeriodStart")){
      $("schedulePeriodStart").value=start;
    }

    window.TimeClockSchedulePeriod?.sync?.();
    await app()?.loadSchedule?.();
  }

  function moveAttendanceDetail(delta){
    const rows=attendanceDetailRows();
    if(!rows.length||!attendanceDetailCurrentKey)return;

    const currentIndex=rows.findIndex(
      row =>
        `${row.emp_code}|${String(row.work_date)
          .slice(0,10)}`
        ===attendanceDetailCurrentKey
    );

    const nextIndex=currentIndex+delta;
    if(nextIndex<0||nextIndex>=rows.length)return;

    const next=rows[nextIndex];
    openAttendanceDetail(
      `${next.emp_code}|${String(next.work_date)
        .slice(0,10)}`
    );
  }

  function renderAttendanceDetailWorkspace(
    row,
    detail=null,
    deepLoading=false
  ){
    const calculation=detail?.calculation||row;
    const employee=detail?.employee||{};
    const dailyPlan=detail?.daily_plan||{};
    const segments=
      Array.isArray(detail?.segments)
        ? detail.segments
        : [];
    const leaveRows=
      Array.isArray(detail?.leave_requests)
        ? detail.leave_requests
        : [];
    const correctionRows=
      Array.isArray(detail?.time_corrections)
        ? detail.time_corrections
        : [];
    const certificateRows=
      Array.isArray(detail?.certificates)
        ? detail.certificates
        : [];
    const certification =
      detail?.certification || {
        status:"NOT_CERTIFIED"
      };

    const status=attendanceStatus(row);
    const statusText=attendanceStatusText(row);
    const statusTone=
      attendanceDetailStatusTone(status);
    const shiftCode=codeOf(row)||"-";
    const shiftStart=fmtTime(
      app()?.attendanceShiftTime?.(row,"start")
    );
    const shiftEnd=fmtTime(
      app()?.attendanceShiftTime?.(row,"end")
    );
    const actualIn=fmtTime(
      row.actual_in_at||row.first_in
    );
    const actualOut=fmtTime(
      row.actual_out_at||row.last_out
    );
    const absence=attendanceAbsence(row);
    const late=Number(
      calculation.late_minutes
      ?? row.late_minutes
      ?? 0
    );
    const early=Number(
      calculation.early_leave_minutes
      ?? row.early_leave_minutes
      ?? 0
    );
    const balance=
      detail?.comp_off?.available_units
      ?? row.comp_off_balance
      ?? 0;

    const issueNotes=[];
    if(absence>0){
      issueNotes.push(`ขาดงาน ${num(absence)} นาที`);
    }
    if(late>0){
      issueNotes.push(`มาสาย ${num(late)} นาที`);
    }
    if(early>0){
      issueNotes.push(`กลับก่อน ${num(early)} นาที`);
    }
    if(
      calculation.has_open_segment
      || row.has_open_segment
    ){
      issueNotes.push("มีช่วงงานที่ยังไม่ปิด");
    }

    const overview=`
      <section class="attendance-detail-hero">
        <div class="attendance-detail-status-card ${statusTone}">
          <span>สถานะ</span>
          <strong>${esc(statusText)}</strong>
          <small>${esc(statusLabel(
            calculation.day_type
            || row.day_type
            || "-"
          ))}</small>
        </div>
        ${attendanceDetailMetric(
          "กะทำงาน",
          shiftCode,
          `${shiftStart}–${shiftEnd}`,
          "shift"
        )}
        ${attendanceDetailMetric(
          "เวลาเข้า–ออก",
          `${actualIn}–${actualOut}`,
          row.absence_reason
            ? statusLabel(row.absence_reason)
            : "เวลาที่บันทึกได้",
          "clock"
        )}
        ${attendanceDetailMetric(
          "ชั่วโมงสุทธิ",
          `${attendanceDetailHours(
            calculation.paid_work_minutes
            ?? row.net_work_minutes
          )} ชม.`,
          `ปกติ ${attendanceDetailHours(
            calculation.regular_minutes
            ?? row.regular_minutes
          )} ชม.`,
          "work"
        )}
      </section>
    `;

    const alertHtml=issueNotes.length
      ? `<div class="attendance-detail-alert">
          <strong>รายการที่ควรตรวจสอบ</strong>
          <span>${esc(issueNotes.join(" • "))}</span>
        </div>`
      : `<div class="attendance-detail-ok">
          <strong>ข้อมูลเวลาครบ</strong>
          <span>ไม่พบเงื่อนไขผิดปกติหลักในรายการนี้</span>
        </div>`;

    const employeeInfo=[
      ["วันที่",fmtDate(row.work_date)],
      ["รหัสพนักงาน",row.emp_code],
      ["ชื่อ-นามสกุล",
        employee.full_name
        || row.full_name],
      ["ตำแหน่ง",
        employee.position_name
        || row.position_name
        || "-"],
      ["หน่วยงาน",
        employee.department
        || row.department
        || "-"],
      ["พื้นที่",
        employee.area
        || row.zone
        || row.area
        || "-"],
      ["พื้นที่ย่อย",
        employee.sub_area
        || row.sub_area
        || "-"]
    ];

    const scheduleInfo=[
      ["รูปแบบงาน",
        calculation.pattern_code
        || row.pattern_code
        || "-"],
      ["Template",
        app()?.normalizeTemplateCodeV665?.(
          calculation.template_code
          || row.template_code
        )
        || calculation.template_code
        || row.template_code
        || "-"],
      ["กะ",shiftCode],
      ["เวลาเริ่มกะ",shiftStart],
      ["เวลาสิ้นสุดกะ",shiftEnd],
      ["สถานะการจัดกะ",
        statusLabel(
          row.schedule_status
          || dailyPlan.schedule_status
          || "-"
        )],
      ["แหล่งแผน",
        calculation.schedule_source
        || row.schedule_source
        || "-"],
      ["ยืนยันกะ",
        row.is_confirmed
        || String(row.schedule_status||"")
          .toUpperCase()==="CONFIRMED"
          ? "ยืนยันแล้ว"
          : "ยังไม่ยืนยัน"],
      ["การรับรองเวลา",
        certification.status === "CERTIFIED"
          ? "รับรองแล้ว"
          : certification.status === "STALE"
            ? "ต้องรับรองใหม่"
            : certification.status === "REVOKED"
              ? "ยกเลิกการรับรอง"
              : "ยังไม่รับรอง"],
      ["วันเวลารับรอง",
        certification.certified_at
          ? fmtDateTime(certification.certified_at)
          : "-"]
    ];

    const calculationInfo=[
      ["เวลาเข้า",actualIn],
      ["เวลาออก",actualOut],
      ["ชั่วโมงตามแผน",
        `${attendanceDetailHours(
          calculation.planned_paid_minutes
          || row.planned_paid_minutes
        )} ชม.`],
      ["ชั่วโมงสุทธิ",
        `${attendanceDetailHours(
          calculation.paid_work_minutes
          ?? row.net_work_minutes
        )} ชม.`],
      ["ชั่วโมงปกติ",
        `${attendanceDetailHours(
          calculation.regular_minutes
          ?? row.regular_minutes
        )} ชม.`],
      ["OT",
        `${attendanceDetailHours(
          calculation.overtime_minutes
          ?? row.overtime_minutes
        )} ชม.`],
      ["ช่วงรอคอย",
        `${attendanceDetailHours(
          calculation.waiting_minutes
          ?? row.waiting_minutes
        )} ชม.`],
      ["เวลาพัก",
        `${attendanceDetailHours(
          calculation.break_deducted_minutes
          ?? row.break_deducted_minutes
        )} ชม.`],
      ["มาสาย",`${num(late)} นาที`],
      ["กลับก่อน",`${num(early)} นาที`],
      ["ขาดงาน",`${num(absence)} นาที`],
      ["วันหยุดชดเชยคงเหลือ",
        num(balance)],
      ["ผลการคำนวณ",
        statusLabel(
          calculation.calculation_status
          || row.calculation_status
          || "-"
        )],
      ["จำนวน Segment",
        num(
          calculation.segment_count
          ?? row.segment_count
          ?? segments.length
        )]
    ];

    const section=(title,items,icon)=>`
      <section class="attendance-detail-section">
        <div class="attendance-detail-section-head">
          <span class="attendance-detail-section-icon">
            ${icon}
          </span>
          <strong>${esc(title)}</strong>
        </div>
        <div class="attendance-detail-info-grid">
          ${items.map(item=>
            attendanceDetailInfoItem(
              item[0],
              item[1]
            )
          ).join("")}
        </div>
      </section>
    `;

    const segmentHtml=deepLoading
      ? `<section class="attendance-detail-section">
          <div class="attendance-detail-section-head">
            <span class="attendance-detail-section-icon">◫</span>
            <strong>รายละเอียดช่วงงาน</strong>
          </div>
          <div class="attendance-detail-loading">
            <span></span>
            กำลังโหลด Calculation, Segment, การลา และเอกสาร...
          </div>
        </section>`
      : segments.length
        ? `<section class="attendance-detail-section">
            <div class="attendance-detail-section-head">
              <span class="attendance-detail-section-icon">◫</span>
              <strong>รายละเอียดช่วงงาน</strong>
              <em>${segments.length} ช่วง</em>
            </div>
            <div class="attendance-segment-list">
              ${segments.map(segment=>`
                <article class="attendance-segment-card segment-${String(
                  segment.segment_type||"work"
                ).toLowerCase()}">
                  <div>
                    <b>ช่วง ${esc(segment.segment_no)}</b>
                    <span>${esc(segment.segment_type||"-")}</span>
                  </div>
                  <strong>
                    ${fmtTime(segment.planned_start_at)}
                    –
                    ${fmtTime(segment.planned_end_at)}
                  </strong>
                  <small>
                    ตามแผน ${attendanceDetailHours(
                      segment.planned_minutes
                    )} ชม.
                    • ทำจริง ${attendanceDetailHours(
                      segment.actual_overlap_minutes
                    )} ชม.
                    • ${segment.paid?"จ่าย":"ไม่จ่าย"}
                    • ${segment.ot_eligible
                      ?"คิด OT"
                      :"ไม่คิด OT"}
                  </small>
                </article>
              `).join("")}
            </div>
          </section>`
        : `<section class="attendance-detail-section">
            <div class="attendance-detail-section-head">
              <span class="attendance-detail-section-icon">◫</span>
              <strong>รายละเอียดช่วงงาน</strong>
            </div>
            <div class="fc-note">
              ยังไม่มีรายละเอียด Segment สำหรับรายการนี้
            </div>
          </section>`;

    const relatedCards=(title,rows,renderer,icon)=>
      rows.length
        ? `<section class="attendance-detail-section">
            <div class="attendance-detail-section-head">
              <span class="attendance-detail-section-icon">${icon}</span>
              <strong>${esc(title)}</strong>
              <em>${rows.length} รายการ</em>
            </div>
            <div class="attendance-related-list">
              ${rows.map(renderer).join("")}
            </div>
          </section>`
        : "";

    const relatedHtml=deepLoading
      ? ""
      : [
          relatedCards(
            "ข้อมูลการลา",
            leaveRows,
            item=>`<article class="attendance-related-card leave">
              <div>
                <strong>${esc(
                  item.leave_type_name
                  || item.leave_type_code
                  || "-"
                )}</strong>
                <span>${esc(statusLabel(item.status||"-"))}</span>
              </div>
              <small>
                ${esc(item.leave_period||"FULL_DAY")}
                • ${Number(item.leave_units||0)
                  .toLocaleString("th-TH")} วัน
              </small>
              <p>${esc(item.reason||"-")}</p>
            </article>`,
            "L"
          ),
          relatedCards(
            "คำขอแก้ไขเวลา",
            correctionRows,
            item=>`<article class="attendance-related-card correction">
              <div>
                <strong>${esc(item.request_no||"-")}</strong>
                <span>${esc(statusLabel(item.status||"-"))}</span>
              </div>
              <small>
                ${fmtTime(item.proposed_in_at)}
                –
                ${fmtTime(item.proposed_out_at)}
              </small>
              <p>${esc(item.reason||"-")}</p>
            </article>`,
            "T"
          ),
          relatedCards(
            "ใบรับรอง",
            certificateRows,
            item=>`<article class="attendance-related-card certificate">
              <div>
                <strong>${esc(item.certificate_type||"-")}</strong>
                <span>${esc(statusLabel(
                  item.verification_status||"-"
                ))}</span>
              </div>
              <small>
                ${fmtDate(item.valid_from)}
                –
                ${fmtDate(item.valid_to)}
              </small>
              <p>${esc(item.file_name||"ไม่ระบุไฟล์")}</p>
            </article>`,
            "C"
          )
        ].join("");

    $("attendanceDetailBody").innerHTML=`
      ${overview}
      ${alertHtml}
      <div class="attendance-detail-columns">
        ${section(
          "ข้อมูลพนักงาน",
          employeeInfo,
          "P"
        )}
        ${section(
          "แผนและกะทำงาน",
          scheduleInfo,
          "S"
        )}
      </div>
      ${section(
        "ผลการคำนวณเวลา",
        calculationInfo,
        "C"
      )}
      ${segmentHtml}
      ${relatedHtml}
    `;

    const detailRole = String(
      app()?.state?.profile?.role || "VIEWER"
    ).toUpperCase();
    const detailKey =
      `${row.emp_code}|${String(row.work_date)
        .slice(0,10)}`;
    const profileEmpCode = String(
      app()?.state?.profile?.emp_code || ""
    );
    const canManageAttendance =
      detailRole === "HR_ADMIN"
      || (
        detailRole === "MANAGER"
        && String(row.emp_code) !== profileEmpCode
      );
    const isViewer = detailRole === "VIEWER";
    const certificationAction =
      certification.status === "CERTIFIED"
        ? "REVOKE"
        : "CERTIFY";

    $("attendanceDetailFooter").innerHTML=`
      <div class="attendance-detail-footer-main">
        ${
          canManageAttendance
            ? `<button
                class="btn btn-primary"
                data-detail-quick-shift="${esc(detailKey)}"
              >แก้ไขกะวันนี้</button>
              <button
                class="btn btn-success"
                data-detail-certify="${esc(detailKey)}"
                data-certification-action="${certificationAction}"
              >${
                certificationAction === "REVOKE"
                  ? "ยกเลิกการรับรอง"
                  : "รับรองเวลาทำงาน"
              }</button>
              <button
                class="btn btn-light"
                data-detail-open-calendar="${esc(detailKey)}"
              >เปิดปฏิทินสัปดาห์</button>`
            : ""
        }
        ${
          isViewer
            ? `<button
                class="btn btn-primary"
                data-detail-shift-request="${esc(detailKey)}"
              >ส่งคำขอแก้ไขกะ</button>`
            : ""
        }
      </div>
      ${
        detailRole === "HR_ADMIN"
          ? `<button
              class="btn btn-light"
              data-detail-recalculate="${esc(detailKey)}"
            >คำนวณวันนี้ใหม่</button>`
          : ""
      }
    `;
  }

  async function openAttendanceDetail(key){
    const row=attendanceDetailRow(key);
    if(!row)return;

    attendanceDetailCurrentKey=key;
    const requestId=++attendanceDetailRequestId;

    $("attendanceDetailTitle").textContent=
      `${row.emp_code} • ${row.full_name||""}`;
    $("attendanceDetailSubtitle").textContent=
      `${fmtDate(row.work_date)} • `
      + `${row.department||"-"}`;

    $("attendanceDetailDrawer")
      .classList.add("open");

    renderAttendanceDetailWorkspace(
      row,
      null,
      true
    );

    const rows=attendanceDetailRows();
    const currentIndex=rows.findIndex(
      item =>
        `${item.emp_code}|${String(item.work_date)
          .slice(0,10)}`
        ===key
    );

    $("attendanceDetailPrev").disabled=
      currentIndex<=0;
    $("attendanceDetailNext").disabled=
      currentIndex<0
      || currentIndex>=rows.length-1;

    let detail=null;

    try{
      detail=await rpc(
        "ta_get_attendance_day_detail_v650",
        {
          p_emp_code:row.emp_code,
          p_work_date:String(row.work_date)
            .slice(0,10)
        }
      );
    }catch(error){
      try{
        detail=await rpc(
          "ta_get_attendance_day_detail_v640",
          {
            p_emp_code:row.emp_code,
            p_work_date:String(row.work_date)
              .slice(0,10)
          }
        );
      }catch(_){
        detail=null;
      }
    }

    try {
      const certification = await rpc(
        "ta_get_attendance_certification_v680",
        {
          p_emp_code: row.emp_code,
          p_work_date: String(row.work_date)
            .slice(0,10)
        }
      );
      detail = {
        ...(detail || {}),
        certification:
          certification || {
            status:"NOT_CERTIFIED"
          }
      };
    } catch (_) {
      detail = {
        ...(detail || {}),
        certification: {
          status:"NOT_CERTIFIED"
        }
      };
    }

    if(
      requestId!==attendanceDetailRequestId
      || attendanceDetailCurrentKey!==key
    ){
      return;
    }

    renderAttendanceDetailWorkspace(
      row,
      detail,
      false
    );
  }

  window.TimeClockAttendanceWorkspace = Object.freeze({
    openAttendanceDetail,
    attendanceDetailRow
  });

  function attendanceExportRows(){
    return app()?.attendanceExportMatrix?.(
      attendanceRows()
    ) || [];
  }
  function exportAttendanceEnterprise(format){const rows=attendanceExportRows();if(rows.length<=1)return app()?.toast("ไม่มีข้อมูลสำหรับส่งออก","error");const base=`Attendance_${$("attStart")?.value}_${$("attEnd")?.value}`;format==="excel"?exportExcel(`${base}.xls`,rows,"รายละเอียดเวลาทำงาน"):printRows(rows,"รายละเอียดเวลาทำงาน",`${$("attStart")?.value} ถึง ${$("attEnd")?.value}`);}

  /* ------------------------------------------------------------------
     Schedule completion
     ------------------------------------------------------------------ */
  let scheduleMonthStatus={status:"DRAFT"};
  function enhanceSchedule(){const workspace=qs("#page-schedule .schedule-workspace");if(!workspace||$("scheduleWorkflowBar"))return;qs(".schedule-summary-strip",workspace)?.insertAdjacentHTML("afterend",`<div id="scheduleWorkflowBar" class="schedule-workflow-bar"><div class="workflow-summary"><span id="scheduleMonthStatusChip" class="fc-chip status-DRAFT">DRAFT</span><div><strong id="scheduleMonthStatusText">ตารางกะฉบับร่าง</strong><div id="scheduleMonthStatusMeta" class="fc-note">ยังไม่ได้ประกาศ</div></div></div><div class="workflow-actions"><button id="scheduleFillDownBtn" class="btn btn-light">Fill Down</button><button id="scheduleFillRightBtn" class="btn btn-light">Fill Right</button><button id="schedulePatternBtn" class="btn btn-light">รูปแบบ 7 วัน</button><button id="schedulePrevWeekCopyBtn" class="btn btn-light">คัดลอกสัปดาห์ก่อน</button><button id="scheduleExportExcelBtn" class="btn btn-success">Excel</button><button id="schedulePrintBtn" class="btn btn-orange">Print/PDF</button><button id="scheduleHistoryBtn" class="btn btn-light">ประวัติ</button><button id="scheduleConfirmAllBtn" class="btn btn-success">ยืนยันกะที่จัดไว้ทั้งหมด</button><button id="schedulePublishBtn" class="btn btn-primary">ประกาศกะ</button><button id="scheduleLockBtn" class="btn btn-danger-soft">ล็อกเดือน</button></div></div>`);
    document.body.insertAdjacentHTML("beforeend",scheduleModalsHtml());
    $("scheduleFillDownBtn")?.addEventListener("click",()=>fillSchedule("down"));$("scheduleFillRightBtn")?.addEventListener("click",()=>fillSchedule("right"));$("schedulePatternBtn")?.addEventListener("click",openPatternModal);$("schedulePrevWeekCopyBtn")?.addEventListener("click",copyPreviousWeek);$("scheduleExportExcelBtn")?.addEventListener("click",()=>exportSchedule("excel"));$("schedulePrintBtn")?.addEventListener("click",()=>exportSchedule("print"));$("scheduleHistoryBtn")?.addEventListener("click",loadScheduleHistory);$("scheduleConfirmAllBtn")?.addEventListener("click",confirmAllAssigned);$("schedulePublishBtn")?.addEventListener("click",publishSchedule);$("scheduleLockBtn")?.addEventListener("click",toggleScheduleLock);$("applySchedulePatternBtn")?.addEventListener("click",applyPattern);$("scheduleHistoryClose")?.addEventListener("click",()=>$("scheduleHistoryModal")?.classList.add("hidden"));$("schedulePatternClose")?.addEventListener("click",()=>$("schedulePatternModal")?.classList.add("hidden"));
    document.addEventListener(
      "click",
      async event => {
        const quickShift=event.target.closest(
          "[data-detail-quick-shift]"
        );
        if(quickShift){
          await openAttendanceQuickShift(
            quickShift.dataset.detailQuickShift
          );
          return;
        }

        const calendar=event.target.closest(
          "[data-detail-open-calendar]"
        );
        if(calendar){
          await openAttendanceCalendar(
            calendar.dataset.detailOpenCalendar
          );
          return;
        }

        const rec=event.target.closest(
          "[data-detail-recalculate]"
        );
        if(rec){
          const [emp,date]=
            rec.dataset.detailRecalculate.split("|");

          try{
            app()?.showLoading?.(
              "กำลังคำนวณผลรายวันใหม่..."
            );

            await rpc(
              "ta_recalculate_attendance_v640",
              {
                p_start_date:date,
                p_end_date:date,
                p_emp_codes:[emp]
              }
            );

            app()?.toast?.(
              "คำนวณผลรายวันใหม่แล้ว",
              "success"
            );

            await app()?.loadAttendance?.();
            await openAttendanceDetail(
              `${emp}|${date}`
            );
          }catch(error){
            app()?.toast?.(
              app()?.humanError?.(error)
              || error.message,
              "error"
            );
          }finally{
            app()?.hideLoading?.();
          }
        }
      }
    );

    document.addEventListener(
      "timeclock:attendance-shift-saved",
      async event => {
        const context=event.detail||{};
        attGrid.page=Number(
          context.attendancePage||attGrid.page||1
        );
        attGrid.search=
          context.attendanceSearch||attGrid.search||"";

        renderAttendanceEnterprise();

        if(context.reopenDetail!==false){
          const key=context.key
            || `${context.empCode}|${context.workDate}`;

          window.setTimeout(
            () => openAttendanceDetail(key),
            80
          );
        }
      }
    );
    const guardLocked=e=>{if(scheduleMonthStatus.status!=="LOCKED")return;const blocked=e.target.closest("#page-schedule [data-quick-shift],#page-schedule #scheduleClearCellsBtn,#page-schedule #scheduleConfirmSelectedBtn,#page-schedule [data-schedule-cell],#saveAssignmentBtn,#deleteAssignmentBtn");if(blocked){e.preventDefault();e.stopImmediatePropagation();app()?.toast("ตารางกะเดือนนี้ถูกล็อก กรุณาปลดล็อกก่อนแก้ไข","error");}};
    document.addEventListener("click",guardLocked,true);document.addEventListener("dblclick",guardLocked,true);
  }
  function scheduleModalsHtml(){return `<div id="schedulePatternModal" class="modal-backdrop hidden fc-modal-wide"><div class="modal"><div class="modal-header"><h3>กำหนดรูปแบบกะ 7 วัน</h3><button id="schedulePatternClose" class="btn btn-light btn-icon">×</button></div><div class="modal-body"><p class="fc-note">เลือกรูปแบบตามวันในสัปดาห์ แล้วนำไปใช้กับช่องที่เลือก</p><div class="schedule-pattern-grid">${["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"].map((d,i)=>`<label class="schedule-pattern-day"><span>${d}</span><select class="select" data-pattern-dow="${i}"><option>D</option><option>N</option><option>OFF</option><option>HOL</option><option>LV</option></select></label>`).join("")}</div></div><div class="modal-footer"><button id="applySchedulePatternBtn" class="btn btn-primary">นำไปใช้กับช่องที่เลือก</button></div></div></div><div id="scheduleHistoryModal" class="modal-backdrop hidden fc-modal-wide"><div class="modal"><div class="modal-header"><h3>ประวัติการจัดกะ</h3><button id="scheduleHistoryClose" class="btn btn-light btn-icon">×</button></div><div class="modal-body"><div class="table-wrap" style="max-height:65vh"><table><thead><tr><th>วันเวลา</th><th>รหัส</th><th>วันที่</th><th>เดิม</th><th>ใหม่</th><th>การทำงาน</th><th>ผู้ดำเนินการ</th><th>เหตุผล</th></tr></thead><tbody id="scheduleHistoryBody"></tbody></table></div></div></div></div>`;}
  function selectedScheduleCells(){return qsa("#scheduleTableWrap .schedule-data-cell.cell-selected [data-schedule-cell],#scheduleTableWrap td.cell-selected [data-schedule-cell]");}
  function rowAt(emp,date){return (app()?.state?.schedule||[]).find(r=>String(r.emp_code)===String(emp)&&String(r.work_date).slice(0,10)===String(date).slice(0,10));}
  async function saveSchedulePayload(payload,reason,confirmNow=false){if(!payload.length)return app()?.toast("กรุณาเลือกช่องกะก่อน","error");if(scheduleMonthStatus.status==="LOCKED")return app()?.toast("ตารางกะเดือนนี้ถูกล็อก","error");app()?.showLoading?.(`กำลังบันทึก ${payload.length.toLocaleString("th-TH")} รายการ...`);try{await window.TimeClockShiftAPI.assignBulk(app(),payload,reason,confirmNow);app()?.toast(`บันทึก ${payload.length.toLocaleString("th-TH")} รายการและประมวลผลเวลาใหม่แล้ว`,"success");await app()?.loadSchedule?.();}catch(e){app()?.toast(app()?.humanError?.(e)||e.message,"error");}finally{app()?.hideLoading?.();}}
  function selectedCellMeta(){return selectedScheduleCells().map(c=>{const td=c.closest("td"),tr=td.closest("tr");return {cell:c,td,tr,emp:c.dataset.emp,date:c.dataset.date,row:rowAt(c.dataset.emp,c.dataset.date),ri:[...tr.parentElement.children].indexOf(tr),ci:[...tr.children].indexOf(td)};});}
  async function fillSchedule(direction){const items=selectedCellMeta();if(!items.length)return app()?.toast("กรุณาเลือกช่วงกะก่อน","error");const groups=new Map();items.forEach(x=>{const k=direction==="down"?x.ci:x.ri;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);});const payload=[];groups.forEach(g=>{g.sort((a,b)=>direction==="down"?a.ri-b.ri:a.ci-b.ci);const source=codeOf(g[0].row)||g[0].cell.dataset.shift||"D";g.forEach(x=>payload.push({emp_code:x.emp,work_date:x.date,shift_code:source,note:`${direction==="down"?"Fill Down":"Fill Right"} จาก Schedule V6`}));});await saveSchedulePayload(payload,direction==="down"?"Fill Down จาก Schedule V6":"Fill Right จาก Schedule V6");}
  function openPatternModal(){if(!selectedScheduleCells().length)return app()?.toast("กรุณาเลือกช่องกะก่อน","error");$("schedulePatternModal")?.classList.remove("hidden");}
  async function applyPattern(){const patterns={};qsa("[data-pattern-dow]").forEach(s=>patterns[Number(s.dataset.patternDow)]=s.value);const payload=selectedCellMeta().map(x=>({emp_code:x.emp,work_date:x.date,shift_code:patterns[new Date(`${x.date}T00:00:00`).getDay()]||"D",note:"รูปแบบกะ 7 วัน"}));$("schedulePatternModal")?.classList.add("hidden");await saveSchedulePayload(payload,"กำหนดรูปแบบกะ 7 วัน");}
  async function copyPreviousWeek(){const items=selectedCellMeta();if(!items.length)return app()?.toast("กรุณาเลือกช่องปลายทางก่อน","error");const payload=items.map(x=>{const d=new Date(`${x.date}T00:00:00`);d.setDate(d.getDate()-7);const sourceDate=d.toISOString().slice(0,10);const source=rowAt(x.emp,sourceDate);return {emp_code:x.emp,work_date:x.date,shift_code:codeOf(source)||"D",note:`คัดลอกจาก ${sourceDate}`};});await saveSchedulePayload(payload,"คัดลอกกะจากสัปดาห์ก่อน");}
  function scheduleExportRows(){const rows=app()?.state?.schedule||[];return [["วันที่","รหัสพนักงาน","ชื่อ-นามสกุล","วันเริ่มงาน","ตำแหน่ง","หน่วยงาน","พื้นที่","ประเภทวัน","กะอัตโนมัติ","กะที่กำหนด","กะใช้งาน","สถานะ","ยืนยันแล้ว","เวลาเริ่มกะ","เวลาสิ้นสุดกะ"],...rows.map(r=>[fmtDate(r.work_date),r.emp_code,r.full_name,fmtDate(r.start_date),r.position_name||"",r.department,r.zone||r.area,r.day_type||"WORKDAY",r.auto_shift_code||"",r.assigned_shift_code||"",codeOf(r)||"",r.schedule_status||"",r.is_confirmed?"ใช่":"ไม่ใช่",fmtTime(r.shift_start_time),fmtTime(r.shift_end_time)])];}
  function exportSchedule(format){const rows=scheduleExportRows();if(rows.length<=1)return app()?.toast("ไม่มีข้อมูลตารางกะ","error");const period=window.TimeClockSchedulePeriod?.range?.()||{};const name=`${period.startDate||$("scheduleMonth")?.value}_${period.endDate||""}`;format==="excel"?exportExcel(`Schedule_${name}.xls`,rows,`ตารางจัดกะ ${name}`):printRows(rows,`ตารางจัดกะ ${name}`,`สถานะเดือน ${scheduleMonthStatus.status}`);}
  async function loadScheduleStatus(){if(!$("scheduleMonth")?.value)return;try{scheduleMonthStatus=await rpc("ta_get_schedule_month_status",{p_month:`${$("scheduleMonth").value}-01`,p_zone:$("scheduleZone")?.value||null,p_department:$("scheduleDepartment")?.value||null})||{status:"DRAFT"};}catch(e){scheduleMonthStatus={status:"DRAFT"};}renderScheduleStatus();}
  function renderScheduleStatus(){const s=scheduleMonthStatus.status||"DRAFT",chip=$("scheduleMonthStatusChip");if(chip){chip.textContent=s;chip.className=`fc-chip status-${s}`;}if($("scheduleMonthStatusText"))$("scheduleMonthStatusText").textContent=s==="LOCKED"?"ตารางกะถูกล็อก":s==="PUBLISHED"?"ประกาศตารางกะแล้ว":"ตารางกะฉบับร่าง";if($("scheduleMonthStatusMeta"))$("scheduleMonthStatusMeta").textContent=scheduleMonthStatus.updated_at?`ปรับปรุง ${fmtDateTime(scheduleMonthStatus.updated_at)}${scheduleMonthStatus.published_by_email?` โดย ${scheduleMonthStatus.published_by_email}`:""}`:"ยังไม่ได้ประกาศ";if($("schedulePublishBtn"))$("schedulePublishBtn").textContent=s==="PUBLISHED"||s==="LOCKED"?"กลับเป็นฉบับร่าง":"ประกาศกะ";if($("scheduleLockBtn"))$("scheduleLockBtn").textContent=s==="LOCKED"?"ปลดล็อกเดือน":"ล็อกเดือน";qs("#page-schedule .schedule-workspace")?.classList.toggle("schedule-locked-overlay",s==="LOCKED");qsa("#scheduleTableWrap [data-schedule-cell]").forEach(c=>{c.classList.toggle("is-published",s==="PUBLISHED");c.classList.toggle("is-locked",s==="LOCKED");});}
  async function setScheduleStatus(action){const label={PUBLISH:"ประกาศตารางกะ",DRAFT:"กลับเป็นฉบับร่าง",LOCK:"ล็อกตารางกะ",UNLOCK:"ปลดล็อกตารางกะ"}[action];if(!confirm(`${label} เดือน ${$("scheduleMonth")?.value}?`))return;try{app()?.showLoading?.(`กำลัง${label}...`);scheduleMonthStatus=await rpc("ta_set_schedule_month_status",{p_month:`${$("scheduleMonth").value}-01`,p_zone:$("scheduleZone")?.value||null,p_department:$("scheduleDepartment")?.value||null,p_action:action,p_note:`ดำเนินการจากหน้า Schedule V${VERSION}`});renderScheduleStatus();app()?.toast(`${label}เรียบร้อย`,"success");loadNotifications();}catch(e){app()?.toast(app()?.humanError?.(e)||e.message,"error");}finally{app()?.hideLoading?.();}}
  async function confirmAllAssigned(){const rows=(app()?.state?.schedule||[]).filter(r=>r.assigned_shift_code&&!r.is_confirmed);if(!rows.length)return app()?.toast("ไม่มีกะที่จัดไว้และรอยืนยัน","error");if(!confirm(`ยืนยันกะที่จัดไว้ทั้งหมด ${rows.length.toLocaleString("th-TH")} รายการ?`))return;await saveSchedulePayload(rows.map(r=>({emp_code:r.emp_code,work_date:String(r.work_date).slice(0,10),shift_code:r.assigned_shift_code,note:"ยืนยันกะทั้งหมดประจำเดือน"})),"ยืนยันกะที่จัดไว้ทั้งหมด",true);}
  function publishSchedule(){setScheduleStatus(["PUBLISHED","LOCKED"].includes(scheduleMonthStatus.status)?"DRAFT":"PUBLISH");}
  function toggleScheduleLock(){setScheduleStatus(scheduleMonthStatus.status==="LOCKED"?"UNLOCK":"LOCK");}
  async function loadScheduleHistory(){try{const rows=await rpc("ta_get_shift_assignment_history",{p_emp_code:null,p_work_date:null,p_limit:500})||[];$("scheduleHistoryBody").innerHTML=rows.length?rows.map(r=>`<tr><td>${fmtDateTime(r.changed_at)}</td><td>${esc(r.emp_code)}</td><td>${fmtDate(r.work_date)}</td><td>${esc(r.old_shift_code||"-")}</td><td>${esc(r.new_shift_code||"-")}</td><td>${esc(r.action_type)}</td><td>${esc(r.changed_by_email||"-")}</td><td>${esc(r.change_reason||r.note||"-")}</td></tr>`).join(""):`<tr><td colspan="8" class="fc-empty">ไม่พบประวัติ</td></tr>`;$("scheduleHistoryModal")?.classList.remove("hidden");}catch(e){app()?.toast(app()?.humanError?.(e)||e.message,"error");}}

  /* ------------------------------------------------------------------
     Employee Directory / Audit
     ------------------------------------------------------------------ */
  let employeeRows = [];
  let auditRows = [];

  const employeeDirectoryState = {
    page: 1,
    pageSize: 100,
    total: 0,
    filtersLoaded: false,
    filterData: {
      zones: [],
      areas: [],
      sub_areas: [],
      departments: [],
      locations: []
    },
    orgRows: []
  };

  function employeeDirectoryRole(){
    return String(
      app()?.state?.profile?._realRole
      || app()?.state?.profile?.role
      || ""
    ).toUpperCase();
  }

  function isEmployeeDirectoryAdmin(){
    return employeeDirectoryRole() === "HR_ADMIN";
  }

  function employeeDirectoryUnique(values){
    return [
      ...new Set(
        (values || [])
          .map(value => String(value || "").trim())
          .filter(Boolean)
      )
    ].sort((a,b) =>
      a.localeCompare(b,"th")
    );
  }

  function fillEmployeeDirectorySelect(
    id,
    values,
    label,
    preserve = true
  ){
    const element = $(id);
    if (!element) return;

    const current =
      preserve
        ? element.value
        : "";

    element.innerHTML =
      `<option value="">${esc(label)}</option>`
      + employeeDirectoryUnique(values)
          .map(value =>
            `<option value="${esc(value)}">${esc(value)}</option>`
          )
          .join("");

    if (
      current
      && [...element.options]
        .some(option => option.value === current)
    ) {
      element.value = current;
    } else {
      element.value = "";
    }
  }

  function updateEmployeeAreaFilter(
    resetArea = false
  ){
    const zone =
      $("employeeDirectoryZone")?.value || "";

    const locations =
      employeeDirectoryState.filterData.locations || [];

    const areas =
      locations
        .filter(row =>
          !zone
          || String(row.zone || "") === zone
        )
        .map(row => row.area);

    fillEmployeeDirectorySelect(
      "employeeDirectoryArea",
      areas,
      "ทุกพื้นที่",
      !resetArea
    );

    updateEmployeeSubAreaFilter(
      resetArea
    );
  }

  function fillEmployeeDirectoryOrgSelect(
    id,
    rows,
    label,
    preserve = true
  ){
    const element = $(id);

    if (!element) {
      return;
    }

    const current =
      preserve
        ? element.value
        : "";

    const uniqueRows = [
      ...new Map(
        (rows || [])
          .filter(row =>
            String(
              row.org_code || ""
            ).trim()
          )
          .map(row => [
            String(
              row.org_code || ""
            ).trim(),
            row
          ])
      ).values()
    ].sort((a,b) =>
      String(
        a.org_name
        || a.org_code
        || ""
      ).localeCompare(
        String(
          b.org_name
          || b.org_code
          || ""
        ),
        "th"
      )
    );

    element.innerHTML =
      `<option value="">${esc(label)}</option>`
      + uniqueRows
          .map(row => {
            const code =
              String(
                row.org_code || ""
              ).trim();

            const name =
              String(
                row.org_name
                || code
              ).trim();

            return `
              <option value="${esc(code)}">
                ${esc(name)} • ${esc(code)}
              </option>
            `;
          })
          .join("");

    if (
      current
      && [...element.options]
        .some(option =>
          option.value === current
        )
    ) {
      element.value = current;
    } else {
      element.value = "";
    }
  }

  function updateEmployeeAreaFilter(
    resetArea = false
  ){
    const zone =
      $("employeeDirectoryZone")?.value || "";

    const locations =
      employeeDirectoryState.filterData.locations || [];

    const areas =
      locations
        .filter(row =>
          !zone
          || String(row.zone || "") === zone
        )
        .map(row => row.area);

    fillEmployeeDirectorySelect(
      "employeeDirectoryArea",
      areas,
      "ทุกพื้นที่",
      !resetArea
    );

    updateEmployeeSubAreaFilter(
      resetArea
    );
  }

  function updateEmployeeSubAreaFilter(
    resetSubArea = false
  ){
    const zone =
      $("employeeDirectoryZone")?.value || "";

    const area =
      $("employeeDirectoryArea")?.value || "";

    const locations =
      employeeDirectoryState.filterData.locations || [];

    const subAreas =
      locations
        .filter(row =>
          (!zone || String(row.zone || "") === zone)
          && (!area || String(row.area || "") === area)
        )
        .map(row => row.sub_area);

    fillEmployeeDirectorySelect(
      "employeeDirectorySubArea",
      subAreas,
      "ทุกพื้นที่ย่อย",
      !resetSubArea
    );

    updateEmployeeDepartmentFilter(
      resetSubArea
    );
  }

  function updateEmployeeDepartmentFilter(
    resetDepartment = false
  ){
    const zone =
      $("employeeDirectoryZone")?.value || "";

    const area =
      $("employeeDirectoryArea")?.value || "";

    const subArea =
      $("employeeDirectorySubArea")?.value || "";

    const locations =
      employeeDirectoryState.filterData.locations || [];

    const orgRows =
      locations.filter(row =>
        (!zone || String(row.zone || "") === zone)
        && (!area || String(row.area || "") === area)
        && (!subArea || String(row.sub_area || "") === subArea)
      );

    fillEmployeeDirectoryOrgSelect(
      "employeeDirectoryDepartment",
      orgRows,
      "ทุกหน่วยงาน",
      !resetDepartment
    );
  }

  async function loadEmployeeDirectoryFilters(
    force = false
  ){
    if (
      employeeDirectoryState.filtersLoaded
      && !force
    ) {
      return;
    }

    const data =
      await rpc(
        "ta_get_employee_directory_filters_v6102"
      ) || {};

    employeeDirectoryState.filterData = {
      zones:
        Array.isArray(data.zones)
          ? data.zones
          : [],

      areas:
        Array.isArray(data.areas)
          ? data.areas
          : [],

      sub_areas:
        Array.isArray(data.sub_areas)
          ? data.sub_areas
          : [],

      departments:
        Array.isArray(data.departments)
          ? data.departments
          : [],

      locations:
        Array.isArray(data.locations)
          ? data.locations
          : []
    };

    employeeDirectoryState.orgRows =
      employeeDirectoryState.filterData.locations;

    fillEmployeeDirectorySelect(
      "employeeDirectoryZone",
      employeeDirectoryState.filterData.zones,
      "ทุก Zone"
    );

    updateEmployeeAreaFilter();

    const list = $("employeeEditOrgList");

    if (list) {
      list.innerHTML =
        employeeDirectoryState.orgRows
          .map(row => `
            <option
              value="${esc(row.org_code || "")}"
            >
              ${esc(row.org_name || "")}
              • ${esc(row.zone || "-")}
              • ${esc(row.area || "-")}
              • ${esc(row.sub_area || "-")}
            </option>
          `)
          .join("");
    }

    employeeDirectoryState.filtersLoaded = true;
  }

  async function fetchAllEmployeeDirectoryRows(){
    const pageLimit = 1000;
    let offset = 0;
    let total = null;
    const rows = [];
    let safety = 0;

    while (
      total === null
      || rows.length < total
    ) {
      safety += 1;

      if (safety > 200) {
        throw new Error(
          "หยุดโหลดเพื่อป้องกัน Loop ผิดปกติ"
        );
      }

      const chunk =
        await rpc(
          "ta_get_employee_directory_v6103",
          {
            p_search:
              $("employeeDirectorySearch")?.value
              || null,

            p_zone:
              $("employeeDirectoryZone")?.value
              || null,

            p_area:
              $("employeeDirectoryArea")?.value
              || null,

            p_sub_area:
              $("employeeDirectorySubArea")?.value
              || null,

            p_org_code:
              $("employeeDirectoryDepartment")?.value
              || null,

            p_active_only:
              $("employeeDirectoryActive")?.value
              !== "false",

            p_limit:
              pageLimit,

            p_offset:
              offset
          }
        ) || [];

      if (total === null) {
        total =
          Number(
            chunk[0]?.total_count
            || chunk.length
            || 0
          );
      }

      rows.push(...chunk);

      if (
        chunk.length === 0
        || chunk.length < pageLimit
      ) {
        break;
      }

      offset += chunk.length;
    }

    employeeDirectoryState.total =
      total === null
        ? rows.length
        : total;

    return rows;
  }

  async function resetEmployeeDirectoryFilters(){
    if ($("employeeDirectorySearch")) {
      $("employeeDirectorySearch").value = "";
    }

    if ($("employeeDirectoryZone")) {
      $("employeeDirectoryZone").value = "";
    }

    if ($("employeeDirectoryActive")) {
      $("employeeDirectoryActive").value = "true";
    }

    updateEmployeeAreaFilter(true);

    employeeDirectoryState.page = 1;

    await loadEmployees();
  }

  async function loadEmployees(){
    if (!isEmployeeDirectoryAdmin()) {
      return;
    }

    try {
      app()?.showLoading?.(
        "กำลังโหลดข้อมูลพนักงาน..."
      );

      await loadEmployeeDirectoryFilters();

      employeeRows =
        await fetchAllEmployeeDirectoryRows();

      employeeDirectoryState.page = 1;

      renderEmployees();
    } catch (error) {
      app()?.toast(
        app()?.humanError?.(error)
        || error.message,
        "error"
      );
    } finally {
      app()?.hideLoading?.();
    }
  }

  function employeeStatusHtml(status){
    const value =
      String(status || "").toUpperCase();

    const cssClass =
      value === "ACTIVE"
        ? "active"
        : value === "WAITING_START"
          ? "waiting"
          : "resigned";

    const label =
      value === "ACTIVE"
        ? "ปฏิบัติงาน"
        : value === "WAITING_START"
          ? "รอเริ่มงาน"
          : "พ้นสภาพ";

    return `
      <span class="fc-badge ${cssClass}">
        ${label}
      </span>
    `;
  }

  function renderEmployees(){
    const body =
      $("employeeDirectoryBody");

    if (!body) return;

    const pageSize =
      Number(
        $("employeeDirectoryPageSize")?.value
        || employeeDirectoryState.pageSize
        || 100
      );

    employeeDirectoryState.pageSize =
      pageSize;

    const totalRows =
      employeeRows.length;

    const totalPages =
      pageSize >= 999999
        ? 1
        : Math.max(
            1,
            Math.ceil(
              totalRows / pageSize
            )
          );

    employeeDirectoryState.page =
      Math.min(
        Math.max(
          employeeDirectoryState.page,
          1
        ),
        totalPages
      );

    const start =
      pageSize >= 999999
        ? 0
        : (
            employeeDirectoryState.page
            - 1
          ) * pageSize;

    const end =
      pageSize >= 999999
        ? totalRows
        : start + pageSize;

    const visibleRows =
      employeeRows.slice(
        start,
        end
      );

    body.innerHTML =
      visibleRows.length
        ? visibleRows
            .map(row => `
              <tr>
                <td class="employee-code-cell">
                  <strong>${esc(row.emp_code)}</strong>
                  <small>
                    ${esc(row.org_code || "-")}
                  </small>
                </td>

                <td class="employee-name-cell">
                  <strong>
                    ${esc(row.full_name || "-")}
                  </strong>
                  <small>
                    ${esc(row.car_team || "")}
                  </small>
                </td>

                <td class="employee-email-cell">
                  ${
                    row.email
                      ? `<a href="mailto:${esc(row.email)}">${esc(row.email)}</a>`
                      : "-"
                  }
                </td>

                <td>
                  ${esc(row.position_name || "-")}
                </td>

                <td>
                  ${esc(row.department || "-")}
                </td>

                <td>
                  <span class="employee-zone-pill">
                    ${esc(row.zone || "-")}
                  </span>
                </td>

                <td>
                  ${esc(row.area || "-")}
                </td>

                <td>
                  ${esc(row.sub_area || "-")}
                </td>

                <td>
                  ${fmtDate(row.start_date)}
                </td>

                <td>
                  ${fmtDate(row.resign_date)}
                </td>

                <td>
                  ${employeeStatusHtml(
                    row.employment_status
                  )}
                </td>

                <td class="employee-action-cell">
                  <button
                    class="btn btn-light employee-edit-btn"
                    data-employee-edit="${esc(row.emp_code)}"
                    title="แก้ไขข้อมูลพนักงาน"
                  >
                    แก้ไข
                  </button>
                </td>
              </tr>
            `)
            .join("")
        : `
          <tr>
            <td
              colspan="12"
              class="fc-empty"
            >
              ไม่พบข้อมูลพนักงาน
            </td>
          </tr>
        `;

    const activeCount =
      employeeRows.filter(row =>
        row.employment_status === "ACTIVE"
      ).length;

    const waitingCount =
      employeeRows.filter(row =>
        row.employment_status === "WAITING_START"
      ).length;

    const resignedCount =
      employeeRows.filter(row =>
        row.employment_status === "RESIGNED"
      ).length;

    $("employeeDirectoryCount").textContent =
      num(totalRows);

    $("employeeDirectoryActiveCount").textContent =
      num(activeCount);

    $("employeeDirectoryWaitingCount").textContent =
      num(waitingCount);

    $("employeeDirectoryResignedCount").textContent =
      num(resignedCount);

    const displayStart =
      totalRows
        ? start + 1
        : 0;

    const displayEnd =
      Math.min(
        end,
        totalRows
      );

    $("employeeDirectoryMeta").textContent =
      totalRows
        ? `โหลดครบ ${totalRows.toLocaleString("th-TH")} คน • กำลังแสดง ${displayStart.toLocaleString("th-TH")}–${displayEnd.toLocaleString("th-TH")}`
        : "ไม่พบข้อมูลพนักงาน";

    const pageInfo =
      $("employeeDirectoryPageInfo");

    if (pageInfo) {
      pageInfo.textContent =
        `หน้า ${employeeDirectoryState.page.toLocaleString("th-TH")} / ${totalPages.toLocaleString("th-TH")} • ${totalRows.toLocaleString("th-TH")} คน`;
    }

    const prev =
      $("employeeDirectoryPrev");

    const next =
      $("employeeDirectoryNext");

    if (prev) {
      prev.disabled =
        employeeDirectoryState.page <= 1;
    }

    if (next) {
      next.disabled =
        employeeDirectoryState.page >= totalPages;
    }
  }

  function employeeExportRows(){
    return [
      [
        "รหัสพนักงาน",
        "ชื่อ-นามสกุล",
        "Email",
        "ตำแหน่ง",
        "หน่วยงาน",
        "org_code",
        "Zone",
        "พื้นที่",
        "พื้นที่ย่อย",
        "ทีมรถ",
        "วันที่เริ่มงาน",
        "วันที่ลาออก",
        "สถานะ"
      ],

      ...employeeRows.map(row => [
        row.emp_code,
        row.full_name,
        row.email,
        row.position_name,
        row.department,
        row.org_code,
        row.zone,
        row.area,
        row.sub_area,
        row.car_team,
        fmtDate(row.start_date),
        fmtDate(row.resign_date),
        row.employment_status
      ])
    ];
  }

  function exportEmployees(){
    if (!employeeRows.length) {
      return app()?.toast(
        "ไม่มีข้อมูลพนักงานสำหรับส่งออก",
        "error"
      );
    }

    const rows =
      employeeExportRows();

    exportExcel(
      `Employee_Directory_${new Date().toISOString().slice(0,10)}.xls`,
      rows,
      `ข้อมูลพนักงาน ${employeeRows.length.toLocaleString("th-TH")} คน`
    );
  }

  function employeeDirectoryRow(
    empCode
  ){
    return employeeRows.find(row =>
      String(row.emp_code)
      === String(empCode)
    ) || null;
  }

  function employeeOrgLocation(
    orgCode
  ){
    return employeeDirectoryState.orgRows.find(row =>
      String(row.org_code)
      === String(orgCode || "").trim()
    ) || null;
  }

  function renderEmployeeEditLocation(){
    const location =
      employeeOrgLocation(
        $("employeeEditOrgCode")?.value
      );

    const zone =
      location?.zone || "-";

    const area =
      location?.area || "-";

    const subArea =
      location?.sub_area || "-";

    if ($("employeeEditZone")) {
      $("employeeEditZone").textContent =
        zone;
    }

    if ($("employeeEditArea")) {
      $("employeeEditArea").textContent =
        area;
    }

    if ($("employeeEditSubArea")) {
      $("employeeEditSubArea").textContent =
        subArea;
    }
  }

  async function openEmployeeEdit(
    empCode
  ){
    if (!isEmployeeDirectoryAdmin()) {
      return;
    }

    await loadEmployeeDirectoryFilters();

    const row =
      employeeDirectoryRow(empCode);

    if (!row) {
      return app()?.toast(
        "ไม่พบข้อมูลพนักงาน",
        "error"
      );
    }

    $("employeeEditCode").value =
      row.emp_code || "";

    $("employeeEditName").value =
      row.full_name || "";

    $("employeeEditEmail").value =
      row.email || "";

    $("employeeEditPosition").value =
      row.position_name || "";

    $("employeeEditDepartment").value =
      row.department || "";

    $("employeeEditOrgCode").value =
      row.org_code || "";

    $("employeeEditCarTeam").value =
      row.car_team || "";

    $("employeeEditStartDate").value =
      row.start_date
        ? String(row.start_date).slice(0,10)
        : "";

    $("employeeEditResignDate").value =
      row.resign_date
        ? String(row.resign_date).slice(0,10)
        : "";

    $("employeeEditNote").value = "";

    renderEmployeeEditLocation();

    $("employeeEditModal")
      ?.classList.remove("hidden");
  }

  function closeEmployeeEdit(){
    $("employeeEditModal")
      ?.classList.add("hidden");
  }

  async function saveEmployeeEdit(){
    if (!isEmployeeDirectoryAdmin()) {
      return;
    }

    const empCode =
      $("employeeEditCode")?.value || "";

    const fullName =
      $("employeeEditName")?.value.trim() || "";

    const orgCode =
      $("employeeEditOrgCode")?.value.trim() || "";

    if (!fullName) {
      $("employeeEditName")?.focus();

      return app()?.toast(
        "กรุณาระบุชื่อ-นามสกุล",
        "error"
      );
    }

    const location =
      employeeOrgLocation(orgCode);

    if (!location) {
      $("employeeEditOrgCode")?.focus();

      return app()?.toast(
        "ไม่พบ org_code ในผังองค์กรที่เปิดใช้งาน",
        "error"
      );
    }

    try {
      app()?.showLoading?.(
        "กำลังบันทึกข้อมูลพนักงาน..."
      );

      await rpc(
        "ta_update_employee_v6102",
        {
          p_emp_code:
            empCode,

          p_full_name:
            fullName,

          p_email:
            $("employeeEditEmail")?.value.trim()
            || null,

          p_position_name:
            $("employeeEditPosition")?.value.trim()
            || null,

          p_department:
            $("employeeEditDepartment")?.value.trim()
            || null,

          p_org_code:
            orgCode,

          p_car_team:
            $("employeeEditCarTeam")?.value.trim()
            || null,

          p_start_date:
            $("employeeEditStartDate")?.value
            || null,

          p_resign_date:
            $("employeeEditResignDate")?.value
            || null,

          p_note:
            $("employeeEditNote")?.value.trim()
            || null
        }
      );

      closeEmployeeEdit();

      app()?.toast(
        "บันทึกข้อมูลพนักงานเรียบร้อย",
        "success"
      );

      await loadEmployees();
    } catch (error) {
      app()?.toast(
        app()?.humanError?.(error)
        || error.message,
        "error"
      );
    } finally {
      app()?.hideLoading?.();
    }
  }

  async function loadAudit(){try{app()?.showLoading?.("กำลังโหลด Audit Log...");auditRows=await rpc("ta_get_system_audit",{p_start_date:$("auditStart")?.value,p_end_date:$("auditEnd")?.value,p_action_type:$("auditType")?.value||null,p_search:$("auditSearch")?.value||null,p_limit:2000})||[];renderAudit();}catch(e){app()?.toast(app()?.humanError?.(e)||e.message,"error");}finally{app()?.hideLoading?.();}}
  function renderAudit(){const body=$("auditBody");if(!body)return;body.innerHTML=auditRows.length?auditRows.map(r=>`<tr><td>${fmtDateTime(r.event_at)}</td><td><span class="fc-badge info">${esc(r.event_type)}</span></td><td>${esc(r.action_type||"-")}</td><td>${esc(r.actor_email||"-")}</td><td>${esc(r.entity_key||"-")}</td><td>${esc(r.detail||"-")}</td></tr>`).join(""):`<tr><td colspan="6" class="fc-empty">ไม่พบ Audit Log</td></tr>`;$("auditCount").textContent=`${auditRows.length.toLocaleString("th-TH")} รายการ`;}
  function exportAudit(){const rows=[["วันเวลา","ประเภท","การทำงาน","ผู้ดำเนินการ","รายการ","รายละเอียด"],...auditRows.map(r=>[fmtDateTime(r.event_at),r.event_type,r.action_type,r.actor_email,r.entity_key,r.detail])];exportExcel(`Audit_Log_${$("auditStart")?.value}_${$("auditEnd")?.value}.xls`,rows,"Audit Log");}

  /* ------------------------------------------------------------------
     Assistant
     ------------------------------------------------------------------ */
  function askAssistant(text){const q=String(text||"").trim();if(!q)return;appendAssistant(q,"user");const answer=answerAssistant(q);setTimeout(()=>appendAssistant(answer,"bot"),180);}
  function appendAssistant(text,type){const box=$("assistantMessages");if(!box)return;const el=document.createElement("div");el.className=`assistant-message ${type}`;el.innerHTML=type==="bot"?`<strong>ผลวิเคราะห์</strong>${esc(text).replace(/\n/g,"<br>")}`:esc(text);box.appendChild(el);box.scrollTop=box.scrollHeight;}
  function answerAssistant(question){const q=question.toLowerCase();const att=app()?.state?.attendance||[],sch=app()?.state?.schedule||[],dash=app()?.state?.dashboard||{};
    if(q.includes("missing in")||q.includes("ไม่พบเวลาเข้า")){const n=Number(dash.missing_in_rows||0);return `พบรายการไม่พบเวลาเข้า ${num(n)} รายการ ตามช่วงข้อมูล Dashboard ล่าสุด`;}
    if(q.includes("missing out")||q.includes("ไม่พบเวลาออก")){const n=Number(dash.missing_out_rows||0);return `พบรายการไม่พบเวลาออก ${num(n)} รายการ ตามช่วงข้อมูล Dashboard ล่าสุด`;}
    if(q.includes("ไม่มีเวลา")||q.includes("absent")){const n=Number(dash.absent_rows||dash.no_time_rows||0);return `พบพนักงาน/วันทำงานที่ไม่มีข้อมูลเวลา ${num(n)} รายการ`;}
    if(q.includes("มาสาย")&&q.includes("หน่วยงาน")){const m={};att.forEach(r=>{if(Number(r.late_minutes||0)>0){const k=r.department||"ไม่ระบุ";m[k]=(m[k]||0)+Number(r.late_minutes||0);}});const top=Object.entries(m).sort((a,b)=>b[1]-a[1])[0];return top?`หน่วยงานที่มีนาทีมาสายรวมสูงสุดคือ ${top[0]} จำนวน ${num(top[1])} นาที จากข้อมูลรายละเอียดเวลาที่โหลดล่าสุด`:`ยังไม่มีข้อมูลมาสายในรายละเอียดเวลาที่โหลดล่าสุด`;}
    if(q.includes("ยืนยัน")&&q.includes("กะ")){const total=sch.length,confirmed=sch.filter(r=>r.is_confirmed||r.schedule_status==="CONFIRMED").length,pct=total?confirmed/total*100:0;return `ตารางกะที่โหลดล่าสุดยืนยันแล้ว ${num(confirmed)} จาก ${num(total)} ช่อง คิดเป็น ${pct.toLocaleString("th-TH",{maximumFractionDigits:1})}%`;}
    if(q.includes("สรุป")||q.includes("dashboard")){return `พนักงาน ${num(dash.total_employees)} คน • รายการทั้งหมด ${num(dash.total_rows)} • ลงเวลาครบ ${num(dash.complete_time_rows)} • เวลาไม่ครบ ${num(Number(dash.missing_in_rows||0)+Number(dash.missing_out_rows||0))}`;}
    return "ยังไม่พบรูปแบบคำถามนี้ ลองถามเรื่อง Missing IN, Missing OUT, ไม่มีเวลา, หน่วยงานที่มาสาย, เปอร์เซ็นต์ยืนยันกะ หรือสรุป Dashboard";
  }

  /* ------------------------------------------------------------------
     Notifications
     ------------------------------------------------------------------ */
  async function loadNotifications(){const body=qs("#notificationDrawer .drawer-body");if(!body)return;try{const rows=await rpc("ta_get_notification_feed",{p_start_date:new Date(Date.now()-7*86400000).toISOString().slice(0,10),p_end_date:new Date().toISOString().slice(0,10),p_limit:50})||[];body.innerHTML=rows.length?rows.map(r=>{const target=["review","leave","time-correction","exception-center"].includes(String(r.target_page||""))?"attendance":(r.target_page||"dashboard");return `<button class="notice-card severity-${esc(r.severity)}" data-notice-page="${esc(target)}"><span class="notice-dot"></span><div><strong>${esc(r.title)}</strong><p>${esc(r.message)}</p><time>${fmtDate(r.event_date)}</time></div></button>`;}).join(""):`<div class="notification-empty">ไม่มีการแจ้งเตือนใหม่</div>`;const badge=$("notificationCount");if(badge)badge.textContent=rows.length;body.onclick=e=>{const b=e.target.closest("[data-notice-page]");if(b){app()?.switchPage?.(b.dataset.noticePage);$("notificationDrawer")?.classList.remove("open");}};}catch(e){body.innerHTML=`<div class="notification-empty">ไม่สามารถโหลดการแจ้งเตือนจากฐานข้อมูล<br><small>${esc(e.message||"")}</small></div>`;}}

  /* ------------------------------------------------------------------
     Init / Events
     ------------------------------------------------------------------ */
  function setDefaults(){const today=new Date(),end=today.toISOString().slice(0,10),start=new Date(today.getFullYear(),today.getMonth(),1).toISOString().slice(0,10),monthAgo=new Date(today);monthAgo.setDate(monthAgo.getDate()-30);if($("auditStart"))$("auditStart").value=monthAgo.toISOString().slice(0,10);if($("auditEnd"))$("auditEnd").value=end;if($("reportStart")&&!$("reportStart").value)$("reportStart").value=start;if($("reportEnd")&&!$("reportEnd").value)$("reportEnd").value=end;}
  function bindGlobal(){
    document.addEventListener("timeclock:attendance-rendered",renderAttendanceEnterprise);
    document.addEventListener("timeclock:attendance-loaded",e=>renderAttendanceDataNotice(e.detail||{}));
    document.addEventListener("timeclock:schedule-rendered",()=>{loadScheduleStatus();});
    $("employeeDirectoryLoadBtn")
      ?.addEventListener(
        "click",
        loadEmployees
      );

    $("employeeExportBtn")
      ?.addEventListener(
        "click",
        exportEmployees
      );

    $("employeeDirectorySearch")
      ?.addEventListener(
        "keydown",
        event => {
          if (event.key === "Enter") {
            event.preventDefault();
            loadEmployees();
          }
        }
      );

    $("employeeDirectoryZone")
      ?.addEventListener(
        "change",
        () => {
          updateEmployeeAreaFilter(true);
        }
      );

    $("employeeDirectoryArea")
      ?.addEventListener(
        "change",
        () => {
          updateEmployeeSubAreaFilter(true);
        }
      );

    $("employeeDirectorySubArea")
      ?.addEventListener(
        "change",
        () => {
          updateEmployeeDepartmentFilter(true);
        }
      );

    $("employeeDirectoryResetBtn")
      ?.addEventListener(
        "click",
        resetEmployeeDirectoryFilters
      );

    $("employeeDirectoryPageSize")
      ?.addEventListener(
        "change",
        event => {
          employeeDirectoryState.pageSize =
            Number(event.target.value || 100);

          employeeDirectoryState.page = 1;

          renderEmployees();
        }
      );

    $("employeeDirectoryPrev")
      ?.addEventListener(
        "click",
        () => {
          if (employeeDirectoryState.page > 1) {
            employeeDirectoryState.page -= 1;
            renderEmployees();
          }
        }
      );

    $("employeeDirectoryNext")
      ?.addEventListener(
        "click",
        () => {
          const pageSize =
            employeeDirectoryState.pageSize;

          const totalPages =
            pageSize >= 999999
              ? 1
              : Math.max(
                  1,
                  Math.ceil(
                    employeeRows.length
                    / pageSize
                  )
                );

          if (
            employeeDirectoryState.page
            < totalPages
          ) {
            employeeDirectoryState.page += 1;
            renderEmployees();
          }
        }
      );

    $("employeeEditOrgCode")
      ?.addEventListener(
        "input",
        renderEmployeeEditLocation
      );

    $("employeeEditSaveBtn")
      ?.addEventListener(
        "click",
        saveEmployeeEdit
      );

    document.addEventListener(
      "click",
      event => {
        const editButton =
          event.target.closest(
            "[data-employee-edit]"
          );

        if (editButton) {
          openEmployeeEdit(
            editButton.dataset.employeeEdit
          );
          return;
        }

        if (
          event.target.closest(
            "[data-employee-edit-close]"
          )
        ) {
          closeEmployeeEdit();
        }
      }
    );

    $("auditLoadBtn")?.addEventListener("click",loadAudit);
    $("auditExportBtn")?.addEventListener("click",exportAudit);
    $("assistantSendBtn")?.addEventListener("click",()=>{const q=$("assistantInput")?.value;askAssistant(q);$("assistantInput").value="";});$("assistantInput")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("assistantSendBtn")?.click();}});qsa(".assistant-prompt").forEach(b=>b.addEventListener("click",()=>askAssistant(b.textContent)));
    document.addEventListener("click",e=>{const b=e.target.closest('[data-admin-open="admin-employees"],[data-admin-open="admin-audit"]');if(!b)return;setTimeout(()=>{const page=b.dataset.adminOpen;const titles={"admin-employees":["ข้อมูลพนักงาน","ค้นหาและตรวจสอบข้อมูลพนักงาน"],"admin-audit":["Audit Log","ประวัติการเปลี่ยนแปลงและการใช้งานระบบ"]};if($("pageTitle"))$("pageTitle").textContent=titles[page][0];if($("pageSubtitle"))$("pageSubtitle").textContent=titles[page][1];page==="admin-employees"?loadEmployees():loadAudit();},0);});
    document.addEventListener("timeclock:profile-ready",loadNotifications);
    setTimeout(
      () => {
        if (isEmployeeDirectoryAdmin()) {
          loadEmployeeDirectoryFilters()
            .catch(() => {});
        }
      },
      1200
    );
  }
  function fillNewSelect(id,values,label){const el=$(id);if(!el)return;const old=el.value;el.innerHTML=`<option value="">${label}</option>`+(values||[]).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");el.value=old;}
  function init(){injectNavAndPages();enhanceAttendance();enhanceSchedule();setDefaults();bindGlobal();document.documentElement.dataset.functionalVersion=VERSION;if($("aboutVersion"))$("aboutVersion").textContent=VERSION;if($("aboutBuild"))$("aboutBuild").textContent="Enterprise V6 Functional Complete";setTimeout(()=>{
    if(isEmployeeDirectoryAdmin()){
      loadEmployeeDirectoryFilters().catch(()=>{});
    }
    loadNotifications();
  },1800);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();

  window.TimeClockFunctional={VERSION,loadEmployees,loadAudit,loadNotifications,renderAttendanceEnterprise,loadScheduleStatus};
})();

;

/* ===== js/mobileta-import.js ===== */
(() => {
  "use strict";
  const VERSION="6.4.0";
  const $=id=>document.getElementById(id);
  const app=()=>window.TimeClockApp;
  const fmt=n=>Number(n||0).toLocaleString("th-TH");
  const esc=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const fmtDate=v=>v?new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString("th-TH",{day:"2-digit",month:"2-digit",year:"numeric"}):"-";
  const fmtDateTime=v=>v?new Date(v).toLocaleString("th-TH",{dateStyle:"short",timeStyle:"short"}):"-";
  const state={file:null,rows:[],errors:[],stats:null,batchId:null,parsing:false,importing:false};

  function client(){return app()?.state?.client||null}
  async function rpc(name,args={}){
    const c=client();if(!c)throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");
    const started=performance.now();const {data,error}=await c.rpc(name,args);
    window.TimeClockSettings?.recordApi?.(name,performance.now()-started,Array.isArray(data)?data.length:(data?1:0),error);
    if(error)throw error;return data;
  }
  function setText(id,v){if($(id))$(id).textContent=v??""}
  function status(text,type="neutral"){const el=$("mobiletaFileStatus");if(!el)return;el.textContent=text;el.className=`mobileta-status-pill ${type}`}
  function setProgress(percent,text){const p=Math.max(0,Math.min(100,Number(percent)||0));if($("mobiletaProgressPanel"))$("mobiletaProgressPanel").classList.remove("hidden");if($("mobiletaProgressBar"))$("mobiletaProgressBar").style.width=`${p}%`;setText("mobiletaProgressPercent",`${Math.round(p)}%`);if(text)setText("mobiletaProgressText",text)}
  function parseDate6(raw){
    if(!/^\d{6}$/.test(raw))return null;const yy=Number(raw.slice(0,2)),m=Number(raw.slice(2,4)),d=Number(raw.slice(4,6));const y=1957+yy;const dt=new Date(Date.UTC(y,m-1,d));if(dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d)return null;return `${String(y).padStart(4,"0")}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }
  function parseTime6(raw){if(!/^\d{6}$/.test(raw))return null;const h=Number(raw.slice(0,2)),m=Number(raw.slice(2,4)),s=Number(raw.slice(4,6));if(h>23||m>59||s>59)return null;return `${raw.slice(0,2)}:${raw.slice(2,4)}:${raw.slice(4,6)}`}
  function reset(){state.file=null;state.rows=[];state.errors=[];state.stats=null;state.batchId=null;if($("mobiletaFile"))$("mobiletaFile").value="";if($("mobiletaPreviewPanel"))$("mobiletaPreviewPanel").classList.add("hidden");if($("mobiletaProgressPanel"))$("mobiletaProgressPanel").classList.add("hidden");if($("mobiletaResultPanel"))$("mobiletaResultPanel").innerHTML="";if($("mobiletaImportBtn"))$("mobiletaImportBtn").disabled=true;status("ยังไม่ได้เลือกไฟล์","neutral")}

  async function parseFile(){
    const file=$("mobiletaFile")?.files?.[0];if(!file)return app()?.toast?.("กรุณาเลือก Text File MobileTA","error");
    if(state.parsing||state.importing)return;state.parsing=true;state.file=file;status("กำลังตรวจสอบไฟล์","working");app()?.showLoading?.("กำลังอ่าน Text File MobileTA...");
    try{
      const text=(await file.text()).replace(/^\uFEFF/,"");const lines=text.split(/\r?\n/);const rows=[],errors=[],seen=new Set(),employees=new Set();let rawRows=0,fileDuplicates=0,minDate=null,maxDate=null;
      for(let i=0;i<lines.length;i++){
        const raw=lines[i].trim();if(!raw)continue;rawRows++;const parts=raw.split(",").map(x=>x.trim());
        if(parts.length!==4){errors.push({line_no:i+1,raw_line:raw,error:"จำนวนคอลัมน์ต้องเท่ากับ 4"});continue}
        const [rawMode,rawEmp,rawDate,rawTime]=parts;const date=parseDate6(rawDate),time=parseTime6(rawTime);
        if(!/^\d{1,20}$/.test(rawEmp)){errors.push({line_no:i+1,raw_line:raw,error:"รหัสพนักงานไม่ถูกต้อง"});continue}
        if(!date){errors.push({line_no:i+1,raw_line:raw,error:"วันที่ YYMMDD ไม่ถูกต้อง"});continue}
        if(!time){errors.push({line_no:i+1,raw_line:raw,error:"เวลา HHMMSS ไม่ถูกต้อง"});continue}
        const key=`${rawEmp}|${date}|${time}`;if(seen.has(key)){fileDuplicates++;continue}seen.add(key);employees.add(rawEmp);minDate=!minDate||date<minDate?date:minDate;maxDate=!maxDate||date>maxDate?date:maxDate;
        rows.push({source_row_no:i+1,raw_mode:(rawMode||"ALL").toUpperCase(),emp_code:rawEmp,inout_date:date,inout_time:time});
        if(i>0&&i%20000===0){setProgress(Math.min(30,i/Math.max(lines.length,1)*30),`ตรวจสอบแล้ว ${fmt(i)} บรรทัด`);await new Promise(r=>setTimeout(r,0))}
      }
      state.rows=rows;state.errors=errors;state.stats={rawRows,validRows:rows.length,fileDuplicates,uniqueEmployees:employees.size,minDate,maxDate,invalidRows:errors.length,fileSize:file.size};renderPreview();status(errors.length?"ตรวจสอบแล้ว มีรายการผิดรูปแบบ":"ไฟล์พร้อมนำเข้า",errors.length?"error":"ready");if($("mobiletaImportBtn"))$("mobiletaImportBtn").disabled=!rows.length;
      app()?.toast?.(`ตรวจสอบไฟล์แล้ว ${fmt(rows.length)} รายการ พร้อมนำเข้า`,errors.length?"info":"success");
    }catch(err){status("ตรวจสอบไฟล์ไม่สำเร็จ","error");app()?.toast?.(app()?.humanError?.(err)||String(err),"error")}
    finally{state.parsing=false;app()?.hideLoading?.();if($("mobiletaProgressPanel"))$("mobiletaProgressPanel").classList.add("hidden")}
  }

  function renderPreview(){
    const s=state.stats;if(!s)return;$("mobiletaPreviewPanel")?.classList.remove("hidden");setText("mobiletaRawRows",fmt(s.rawRows));setText("mobiletaValidRows",fmt(s.validRows));setText("mobiletaFileDuplicates",fmt(s.fileDuplicates));setText("mobiletaEmployees",fmt(s.uniqueEmployees));setText("mobiletaDateRange",s.minDate?`${fmtDate(s.minDate)}–${fmtDate(s.maxDate)}`:"-");setText("mobiletaInvalidRows",fmt(s.invalidRows));
    const sample=state.rows.slice(0,20);if($("mobiletaPreviewBody"))$("mobiletaPreviewBody").innerHTML=sample.length?sample.map(r=>`<tr><td>${fmt(r.source_row_no)}</td><td>${esc(r.raw_mode)}</td><td><strong>${esc(r.emp_code)}</strong></td><td>${fmtDate(r.inout_date)}</td><td>${esc(r.inout_time)}</td><td><span class="mobileta-row-ok">พร้อมนำเข้า</span></td></tr>`).join(""):`<tr><td colspan="6" class="table-empty">ไม่พบข้อมูลที่ถูกต้อง</td></tr>`;
    $("mobiletaDownloadErrorsBtn")?.classList.toggle("hidden",!state.errors.length);
  }

  function downloadErrors(){if(!state.errors.length)return;const csv="\ufeff"+["บรรทัด,ข้อมูลต้นฉบับ,สาเหตุ",...state.errors.map(e=>[e.line_no,`"${String(e.raw_line).replace(/"/g,'""')}"`,e.error].join(","))].join("\n");app()?.downloadFile?.(`MobileTA_Errors_${new Date().toISOString().slice(0,10)}.csv`,csv,"text/csv;charset=utf-8")}

  function isoDatesBetween(start,end){
    const out=[];
    if(!start||!end)return out;
    const d=new Date(`${start}T00:00:00Z`),last=new Date(`${end}T00:00:00Z`);
    while(d<=last){out.push(d.toISOString().slice(0,10));d.setUTCDate(d.getUTCDate()+1)}
    return out;
  }

  function isTimeoutError(err){
    const text=String(err?.message||err||"").toLowerCase();
    return text.includes("statement timeout")||text.includes("canceling statement")||text.includes("57014");
  }

  async function classifyBatchInChunks(batchId,totalInserted){
    let cursorDate=null,cursorEmp=null,groupLimit=120;
    let classified=0,deduped=0,remaining=Math.max(Number(totalInserted||0),1);
    let calls=0,retries=0;

    while(true){
      if(calls>20000)throw new Error("CLASSIFY_SAFETY_LIMIT_EXCEEDED");
      try{
        const result=await rpc("ta_classify_mobileta_import_chunk",{
          p_batch_id:batchId,
          p_after_date:cursorDate,
          p_after_emp_code:cursorEmp,
          p_group_limit:groupLimit
        });
        const r=Array.isArray(result)?result[0]:result||{};
        const processedGroups=Number(r.processed_groups||0);
        const stepClassified=Number(r.classified_rows||0);
        const stepDuplicates=Number(r.duplicate_rows||0);
        remaining=Number(r.remaining_rows||0);
        classified+=stepClassified;
        deduped+=stepDuplicates;
        calls++;retries=0;

        if(r.next_date){cursorDate=String(r.next_date).slice(0,10);cursorEmp=r.next_emp_code||""}
        const processedRows=classified+deduped;
        const denominator=Math.max(processedRows+remaining,1);
        const ratio=Math.min(1,processedRows/denominator);
        setProgress(74+ratio*14,`กำหนด IN/OUT ${fmt(processedRows)} รายการ · คงเหลือ ${fmt(remaining)} · ครั้งละ ${fmt(groupLimit)} กลุ่ม`);

        if(r.done===true||remaining===0)return {classifiedRows:classified,duplicateRows:deduped,calls};
        if(processedGroups===0)throw new Error("CLASSIFY_NO_PROGRESS");
      }catch(err){
        if(isTimeoutError(err)&&groupLimit>10&&retries<6){
          groupLimit=Math.max(10,Math.floor(groupLimit/2));
          retries++;
          setProgress(74,`คำสั่งใช้เวลานาน ระบบลดขนาดงานเหลือ ${fmt(groupLimit)} กลุ่มและลองใหม่...`);
          await new Promise(r=>setTimeout(r,350));
          continue;
        }
        throw err;
      }
    }
  }

  async function finalizeBatch(batchId){
    let attempt=0;
    while(true){
      try{
        setProgress(89,"กำลังปิด Batch และบันทึกสถานะสำเร็จ...");
        const finish=await rpc("ta_complete_mobileta_import",{p_batch_id:batchId});
        return Array.isArray(finish)?finish[0]:finish||{};
      }catch(err){
        attempt++;
        if(isTimeoutError(err)&&attempt<3){
          setProgress(89,`ขั้นตอนปิด Batch ใช้เวลานาน กำลังลองใหม่ครั้งที่ ${attempt+1}...`);
          await new Promise(r=>setTimeout(r,600*attempt));
          continue;
        }
        throw err;
      }
    }
  }

  async function rebuildDateInChunks(batchId,date,dateIndex,dateCount){
    let cursorEmp=null,empLimit=60,retries=0,calls=0;
    let deleted=0,inserted=0;
    while(true){
      if(calls>10000)throw new Error("REBUILD_SAFETY_LIMIT_EXCEEDED");
      try{
        const result=await rpc("ta_rebuild_mobileta_attendance_chunk",{
          p_batch_id:batchId,
          p_work_date:date,
          p_after_emp_code:cursorEmp,
          p_emp_limit:empLimit
        });
        const r=Array.isArray(result)?result[0]:result||{};
        const processed=Number(r.processed_employees||0);
        deleted+=Number(r.deleted_rows||0);
        inserted+=Number(r.inserted_rows||0);
        calls++;retries=0;
        if(r.next_emp_code)cursorEmp=String(r.next_emp_code);
        const dayBase=89+(dateIndex/Math.max(dateCount,1))*10;
        const daySpan=10/Math.max(dateCount,1);
        setProgress(Math.min(99,dayBase+daySpan*.7),`ประมวลผล Attendance ${fmtDate(date)} · ถึงรหัส ${cursorEmp||"-"} · ครั้งละ ${fmt(empLimit)} คน`);
        if(r.done===true||processed===0)return {deleted,inserted,calls};
      }catch(err){
        if(isTimeoutError(err)&&empLimit>5&&retries<6){
          empLimit=Math.max(5,Math.floor(empLimit/2));
          retries++;
          setProgress(89,`Attendance วันที่ ${fmtDate(date)} ใช้เวลานาน ระบบลดเหลือ ${fmt(empLimit)} คนและลองใหม่...`);
          await new Promise(r=>setTimeout(r,400));
          continue;
        }
        throw err;
      }
    }
  }

  async function rebuildBatchAttendance(batchId,minDate,maxDate){
    const dates=isoDatesBetween(minDate,maxDate);
    let rebuildDeleted=0,rebuildInserted=0;
    const failedDates=[];
    for(let i=0;i<dates.length;i++){
      const date=dates[i];
      try{
        const r=await rebuildDateInChunks(batchId,date,i,dates.length);
        rebuildDeleted+=Number(r.deleted||0);
        rebuildInserted+=Number(r.inserted||0);
      }catch(stepError){
        failedDates.push(date);
        console.warn("MobileTA attendance rebuild failed",date,stepError);
      }
      setProgress(89+((i+1)/Math.max(dates.length,1))*10,`ประมวลผล Attendance วันที่ ${fmtDate(date)} (${i+1}/${dates.length})`);
    }
    await rpc("ta_mark_mobileta_rebuild_result",{
      p_batch_id:batchId,
      p_success:failedDates.length===0,
      p_failed_dates:failedDates,
      p_error_message:failedDates.length?`Attendance timeout: ${failedDates.join(", ")}`:null
    });
    return {rebuildDeleted,rebuildInserted,failedDates};
  }

  async function resumeBatch(batchId){
    if(!batchId||state.importing)return;
    if(!confirm("ยืนยันดำเนินการต่อจาก Batch ที่ข้อมูลถูกเก็บไว้แล้ว?"))return;
    state.importing=true;
    state.batchId=batchId;
    status("กำลังดำเนินการต่อ","working");
    $("mobiletaProgressPanel")?.classList.remove("hidden");
    setProgress(74,"กำลังตรวจสถานะ Batch...");
    let phase="resume";
    try{
      const infoData=await rpc("ta_get_mobileta_import_resume_state",{p_batch_id:batchId});
      const info=Array.isArray(infoData)?infoData[0]:infoData||{};
      if(!info.batch_id)throw new Error("ไม่พบข้อมูล Batch");
      if(info.batch_status==="CANCELLED")throw new Error("Batch นี้ถูกยกเลิกแล้ว");

      let classifiedAdded=0,duplicateAdded=0;
      if(Number(info.remaining_all_rows||0)>0){
        phase="classify";
        const cr=await classifyBatchInChunks(batchId,Number(info.remaining_all_rows||info.inserted_rows||1));
        classifiedAdded=Number(cr.classifiedRows||0);
        duplicateAdded=Number(cr.duplicateRows||0);
      }

      phase="complete";
      const finalRow=await finalizeBatch(batchId);

      let rebuildDeleted=0,rebuildInserted=0,failedDates=[];
      if($("mobiletaRebuildAttendance")?.checked){
        phase="rebuild";
        const rr=await rebuildBatchAttendance(batchId,info.min_date,info.max_date);
        rebuildDeleted=rr.rebuildDeleted;
        rebuildInserted=rr.rebuildInserted;
        failedDates=rr.failedDates;
      }

      const result={
        ...finalRow,
        inserted_rows:Number(finalRow.inserted_rows||info.inserted_rows||0),
        existing_duplicate_rows:Number(finalRow.existing_duplicate_rows||info.existing_duplicate_rows||0)+duplicateAdded,
        unmatched_employee_rows:Number(finalRow.unmatched_employee_rows||info.unmatched_employee_rows||0),
        classified_rows:Number(finalRow.classified_rows||info.classified_rows||0)+classifiedAdded,
        rebuild_deleted_rows:rebuildDeleted,
        rebuild_inserted_rows:rebuildInserted,
        rebuild_failed_dates:failedDates,
        min_date:finalRow.min_date||info.min_date,
        max_date:finalRow.max_date||info.max_date
      };
      setProgress(100,failedDates.length?"ดำเนินการต่อสำเร็จ แต่ Attendance บางวันต้องประมวลผลซ้ำ":"ดำเนินการต่อเรียบร้อย");
      renderResult(result,false);
      status(failedDates.length?"สำเร็จ มีคำเตือน Attendance":"นำเข้าข้อมูลสำเร็จ",failedDates.length?"error":"ready");
      if(app()?.state){app().state.attendance=[]}
      app()?.toast?.("ดำเนินการต่อจาก Batch สำเร็จ","success");
      await loadHistory();
    }catch(err){
      renderResult({error:app()?.humanError?.(err)||String(err),phase,rollback:false,batchId},true);
      status("ดำเนินการต่อไม่สำเร็จ","error");
      app()?.toast?.(app()?.humanError?.(err)||String(err),"error");
    }finally{
      state.importing=false;
      if($("mobiletaImportBtn"))$("mobiletaImportBtn").disabled=!state.rows.length;
      if($("mobiletaPreviewBtn"))$("mobiletaPreviewBtn").disabled=false;
    }
  }

  async function runImport(){
    if(!state.rows.length||!state.stats)return app()?.toast?.("กรุณาตรวจสอบไฟล์ก่อนนำเข้า","error");
    if(state.importing)return;
    if(!confirm(`ยืนยันนำเข้าข้อมูลลงเวลา ${fmt(state.rows.length)} รายการ?`))return;

    state.importing=true;
    status("กำลังนำเข้าข้อมูล","working");
    $("mobiletaImportBtn").disabled=true;
    $("mobiletaPreviewBtn").disabled=true;
    $("mobiletaProgressPanel")?.classList.remove("hidden");
    setProgress(1,"กำลังเปิดรายการนำเข้า...");

    let inserted=0,existingDup=0,unmatched=0,uploaded=0;
    let phase="upload";
    let completed=false;
    let uploadFinished=false;
    let classifiedRows=0,rebuildDeleted=0,rebuildInserted=0;
    const failedRebuildDates=[];

    try{
      const batch=await rpc("ta_begin_mobileta_import",{
        p_file_name:state.file.name,
        p_file_size:state.stats.fileSize,
        p_raw_rows:state.stats.rawRows,
        p_valid_rows:state.stats.validRows,
        p_file_duplicate_rows:state.stats.fileDuplicates,
        p_min_date:state.stats.minDate,
        p_max_date:state.stats.maxDate,
        p_note:$("mobiletaImportNote")?.value||null
      });
      state.batchId=typeof batch==="string"?batch:(batch?.batch_id||batch?.id);
      if(!state.batchId)throw new Error("ไม่พบ Batch ID จากระบบ");

      if(state.errors.length){
        await rpc("ta_log_mobileta_import_errors",{
          p_batch_id:state.batchId,
          p_errors:state.errors.slice(0,1000)
        });
      }

      const chunkSize=500,total=state.rows.length;
      for(let start=0;start<total;start+=chunkSize){
        const chunk=state.rows.slice(start,start+chunkSize);
        const result=await rpc("ta_import_mobileta_chunk",{
          p_batch_id:state.batchId,
          p_rows:chunk
        });
        const r=Array.isArray(result)?result[0]:result||{};
        uploaded+=chunk.length;
        inserted+=Number(r.inserted_rows||0);
        existingDup+=Number(r.duplicate_rows||0);
        unmatched+=Number(r.unmatched_rows||0);
        const pct=5+(uploaded/total)*68;
        setProgress(pct,`ส่งข้อมูล ${fmt(uploaded)} จาก ${fmt(total)} รายการ`);
        setText("mobiletaUploadedRows",fmt(uploaded));
        setText("mobiletaInsertedRows",fmt(inserted));
        setText("mobiletaExistingDuplicates",fmt(existingDup));
        setText("mobiletaUnmatchedRows",fmt(unmatched));
      }

      uploadFinished=true;
      phase="classify";
      const classifyResult=await classifyBatchInChunks(state.batchId,inserted);
      classifiedRows+=Number(classifyResult.classifiedRows||0);
      existingDup+=Number(classifyResult.duplicateRows||0);
      setText("mobiletaExistingDuplicates",fmt(existingDup));

      phase="complete";
      const finalRow=await finalizeBatch(state.batchId);
      completed=true;

      if($("mobiletaRebuildAttendance")?.checked){
        phase="rebuild";
        const rr=await rebuildBatchAttendance(state.batchId,state.stats.minDate,state.stats.maxDate);
        rebuildDeleted=rr.rebuildDeleted;
        rebuildInserted=rr.rebuildInserted;
        failedRebuildDates.push(...rr.failedDates);
      }

      const result={
        ...finalRow,
        inserted_rows:Number(finalRow.inserted_rows||inserted),
        existing_duplicate_rows:Number(finalRow.existing_duplicate_rows||existingDup),
        unmatched_employee_rows:Number(finalRow.unmatched_employee_rows||unmatched),
        classified_rows:Number(finalRow.classified_rows||classifiedRows),
        rebuild_deleted_rows:rebuildDeleted,
        rebuild_inserted_rows:rebuildInserted,
        rebuild_failed_dates:failedRebuildDates
      };

      setProgress(100,failedRebuildDates.length?"นำเข้าสำเร็จ แต่ Attendance บางวันต้องประมวลผลซ้ำ":"นำเข้าข้อมูลเรียบร้อย");
      renderResult(result,false);
      status(failedRebuildDates.length?"นำเข้าสำเร็จ มีคำเตือน Attendance":"นำเข้าข้อมูลสำเร็จ",failedRebuildDates.length?"error":"ready");
      if(app()?.state){app().state.attendance=[]}
      app()?.toast?.(failedRebuildDates.length?`นำเข้าสำเร็จ แต่ Attendance ${failedRebuildDates.length} วันยังไม่สำเร็จ`:"นำเข้าข้อมูลลงเวลา MobileTA เรียบร้อย",failedRebuildDates.length?"info":"success");
      await loadHistory();
    }catch(err){
      const shouldRollback=Boolean(state.batchId&&!completed&&!uploadFinished);
      if(shouldRollback){
        try{
          await rpc("ta_cancel_mobileta_import",{
            p_batch_id:state.batchId,
            p_reason:app()?.humanError?.(err)||String(err),
            p_rollback:true
          });
        }catch(_){}
      }
      renderResult({
        error:app()?.humanError?.(err)||String(err),
        phase,
        rollback:shouldRollback,
        batchId:state.batchId
      },true);
      status("นำเข้าไม่สำเร็จ","error");
      app()?.toast?.(app()?.humanError?.(err)||String(err),"error");
    }finally{
      state.importing=false;
      $("mobiletaImportBtn").disabled=!state.rows.length;
      $("mobiletaPreviewBtn").disabled=false;
    }
  }

  function renderResult(r,isError){
    const el=$("mobiletaResultPanel");if(!el)return;
    if(isError){
      const rollbackText=r.rollback?"ระบบ Rollback ข้อมูลของ Batch นี้แล้ว":"ข้อมูลที่ส่งขึ้นฐานข้อมูลแล้วถูกเก็บไว้ ไม่ได้ Rollback ทั้ง Batch";
      const resumeButton=!r.rollback&&r.batchId?`<div style="margin-top:12px"><button class="btn btn-primary btn-sm" data-mobileta-resume="${esc(r.batchId)}">ดำเนินการต่อจาก Batch นี้</button></div>`:"";
      el.innerHTML=`<div class="mobileta-result-card error"><h3>นำเข้าข้อมูลไม่สำเร็จ</h3><p>${esc(r.error||"เกิดข้อผิดพลาด")}</p><small>ขั้นตอน: ${esc(r.phase||"unknown")} · ${esc(rollbackText)}</small>${resumeButton}</div>`;
      return;
    }
    const failed=Array.isArray(r.rebuild_failed_dates)?r.rebuild_failed_dates:[];
    const warning=failed.length?`<div class="mobileta-import-warning"><strong>Attendance ยังประมวลผลไม่สำเร็จ ${fmt(failed.length)} วัน</strong><div>${failed.map(fmtDate).join(", ")}</div><small>ข้อมูลลงเวลานำเข้าสำเร็จแล้ว และไม่ได้ถูก Rollback</small></div>`:"";
    el.innerHTML=`<div class="mobileta-result-card"><h3>นำเข้าข้อมูลลงเวลาเรียบร้อย</h3><p>ระบบนำเข้าข้อมูลและกำหนดประเภท IN/OUT แบบกลุ่มย่อยด้วย Cursor เพื่อลดปัญหา Statement Timeout</p>${warning}<div class="mobileta-result-grid"><div><span>เพิ่มใหม่</span><strong>${fmt(r.inserted_rows)}</strong></div><div><span>ซ้ำในฐานข้อมูล</span><strong>${fmt(r.existing_duplicate_rows)}</strong></div><div><span>ไม่พบพนักงาน</span><strong>${fmt(r.unmatched_employee_rows)}</strong></div><div><span>จำแนก IN/OUT</span><strong>${fmt(r.classified_rows)}</strong></div><div><span>Attendance ลบ/สร้าง</span><strong>${fmt(r.rebuild_deleted_rows)} / ${fmt(r.rebuild_inserted_rows)}</strong></div><div><span>ช่วงวันที่</span><strong>${fmtDate(r.min_date)}–${fmtDate(r.max_date)}</strong></div></div></div>`;
  }

  async function loadHistory(){
    const body=$("mobiletaHistoryBody");if(!body||!client())return;body.innerHTML='<tr><td colspan="11" class="table-empty">กำลังโหลด...</td></tr>';
    try{
      const data=await rpc("ta_get_mobileta_import_history",{p_limit:30});
      const rows=Array.isArray(data)?data:[];
      body.innerHTML=rows.length?rows.map(r=>{
        const hasData=Number(r.inserted_rows||0)>0;
        const canResume=hasData&&r.status!=="CANCELLED"&&(r.status!=="COMPLETED"||!r.rebuild_attendance);
        const action=canResume?`<button class="btn btn-light btn-sm" data-mobileta-resume="${esc(r.id)}">${r.status==="COMPLETED"?"สร้าง Attendance":"ดำเนินการต่อ"}</button>`:"-";
        return `<tr><td>${fmtDateTime(r.created_at)}</td><td><strong>${esc(r.file_name)}</strong><small style="display:block;color:var(--slate-500)">${fmt(Number(r.file_size||0)/1024)} KB</small></td><td>${fmtDate(r.min_date)}–${fmtDate(r.max_date)}</td><td>${fmt(r.raw_rows)}</td><td>${fmt(r.inserted_rows)}</td><td>${fmt(Number(r.file_duplicate_rows||0)+Number(r.existing_duplicate_rows||0))}</td><td>${fmt(r.unmatched_employee_rows)}</td><td>${r.rebuild_attendance?'<span class="mobileta-row-ok">ประมวลผลแล้ว</span>':'-'}</td><td><span class="mobileta-status-pill ${r.status==='COMPLETED'?'ready':r.status==='FAILED'||r.status==='CANCELLED'?'error':'working'}">${esc(r.status)}</span></td><td>${esc(r.created_by_email||'-')}</td><td>${action}</td></tr>`;
      }).join(""):'<tr><td colspan="11" class="table-empty">ยังไม่มีประวัติการนำเข้า</td></tr>';
    }catch(err){body.innerHTML=`<tr><td colspan="11" class="table-empty">${esc(app()?.humanError?.(err)||String(err))}</td></tr>`}
  }

  function init(){
    $("mobiletaPreviewBtn")?.addEventListener("click",parseFile);$("mobiletaImportBtn")?.addEventListener("click",runImport);$("mobiletaResetBtn")?.addEventListener("click",reset);$("mobiletaDownloadErrorsBtn")?.addEventListener("click",downloadErrors);$("mobiletaRefreshHistoryBtn")?.addEventListener("click",loadHistory);$("mobiletaFile")?.addEventListener("change",()=>{state.rows=[];state.errors=[];state.stats=null;$("mobiletaImportBtn").disabled=true;status($("mobiletaFile")?.files?.[0]?.name||"ยังไม่ได้เลือกไฟล์","neutral")});
    document.addEventListener("click",event=>{const btn=event.target.closest?.("[data-mobileta-resume]");if(!btn)return;event.preventDefault();resumeBatch(btn.dataset.mobiletaResume)});
    document.querySelectorAll('[data-page="admin-time-import"]').forEach(b=>b.addEventListener("click",()=>{setTimeout(()=>{setText("pageTitle","นำเข้าข้อมูลลงเวลา");setText("pageSubtitle","นำเข้า Text File MobileTA ตรวจข้อมูลซ้ำ และประมวลผล Attendance");loadHistory()},0)}));
    document.querySelectorAll('[data-admin-open="admin-time-import"]').forEach(b=>b.addEventListener("click",()=>{setTimeout(()=>{setText("pageTitle","นำเข้าข้อมูลลงเวลา");setText("pageSubtitle","นำเข้า Text File MobileTA ตรวจข้อมูลซ้ำ และประมวลผล Attendance");loadHistory()},0)}));
    window.TimeClockMobileTAImport={loadHistory,parseFile,resumeBatch,version:VERSION};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

;

/* ===== js/attendance-rebuild-admin.js ===== */
(() => {
  "use strict";
  const VERSION = "6.4.0";
  const $ = id => document.getElementById(id);
  const app = () => window.TimeClockApp;
  const num = v => Number(v || 0).toLocaleString("th-TH");
  const esc = v => String(v ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const fmtDate = v => v ? new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString("th-TH",{day:"2-digit",month:"2-digit",year:"numeric"}) : "-";
  const fmtDateTime = v => v ? new Date(v).toLocaleString("th-TH",{dateStyle:"short",timeStyle:"medium"}) : "-";
  const terminal = new Set(["COMPLETED","COMPLETED_WITH_ERRORS","CANCELLED","FAILED"]);
  const state = {activeJob:null,worker:false,stop:false,history:[],selectedJobId:null,lastHistoryAt:0};

  function client(){return app()?.state?.client || null;}
  async function rpc(name,args={}){
    const c=client(); if(!c) throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");
    const {data,error}=await c.rpc(name,args); if(error) throw error; return data;
  }
  function human(err){return app()?.humanError?.(err) || err?.message || String(err);}
  function toast(msg,type="success"){app()?.toast?.(msg,type);}
  function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
  function statusLabel(s){return ({QUEUED:"รอเริ่ม",RUNNING:"กำลังประมวลผล",PAUSED:"หยุดชั่วคราว",COMPLETED:"สำเร็จ",COMPLETED_WITH_ERRORS:"สำเร็จบางส่วน",CANCELLED:"ยกเลิก",FAILED:"ล้มเหลว"})[s]||s||"-";}
  function pct(j){return Math.max(0,Math.min(100,Number(j?.progress_percent||0)));}
  function setText(id,v){if($(id))$(id).textContent=v;}

  function defaultDates(){
    const now=new Date(), first=new Date(now.getFullYear(),now.getMonth(),1);
    const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
    if($("attRebuildStart")&&!$("attRebuildStart").value)$("attRebuildStart").value=iso(first);
    if($("attRebuildEnd")&&!$("attRebuildEnd").value)$("attRebuildEnd").value=iso(now);
  }

  function renderProgress(job){
    if(!job)return;
    state.activeJob=job;
    $("attRebuildProgressPanel")?.classList.remove("hidden");
    const p=pct(job);
    const status=$("attRebuildStatus");
    if(status){status.className=`att-rebuild-status ${job.status}`;status.innerHTML=`${job.status==="RUNNING"?'<i class="att-rebuild-pulse"></i>':''}${statusLabel(job.status)}`;}
    if($("attRebuildProgressBar"))$("attRebuildProgressBar").style.width=`${p}%`;
    setText("attRebuildPercent",`${p.toLocaleString("th-TH",{maximumFractionDigits:2})}%`);
    setText("attRebuildRange",`${fmtDate(job.start_date)} – ${fmtDate(job.end_date)}`);
    setText("attRebuildTaskText",`${num(job.processed_tasks)} จาก ${num(job.total_tasks)} Task`);
    setText("attRebuildKpiEmployees",num(job.total_employees));
    setText("attRebuildKpiDays",num(job.total_days));
    setText("attRebuildKpiCompleted",num(job.completed_tasks));
    setText("attRebuildKpiFailed",num(job.failed_tasks));
    setText("attRebuildKpiDeleted",num(job.deleted_rows));
    setText("attRebuildKpiInserted",num(job.inserted_rows));
    setText("attRebuildCurrentDate",fmtDate(job.current_work_date));
    setText("attRebuildRemaining",`${num(job.remaining_tasks)} Task คงเหลือ`);
    setText("attRebuildLastError",job.last_error||"ไม่พบ Error ล่าสุด");
    const run=job.status==="RUNNING"||job.status==="QUEUED";
    $("attRebuildPauseBtn")?.classList.toggle("hidden",!run);
    $("attRebuildResumeBtn")?.classList.toggle("hidden",job.status!=="PAUSED"&&!(["RUNNING","QUEUED"].includes(job.status)&&!state.worker));
    $("attRebuildCancelBtn")?.classList.toggle("hidden",terminal.has(job.status));
    $("attRebuildRetryBtn")?.classList.toggle("hidden",Number(job.failed_tasks||0)<=0);
  }

  async function createJob(){
    const start=$("attRebuildStart")?.value,end=$("attRebuildEnd")?.value,batch=Number($("attRebuildBatchSize")?.value||100),note=$("attRebuildNote")?.value?.trim()||null;
    if(!start||!end)return toast("กรุณาระบุช่วงวันที่","error");
    if(start>end)return toast("วันที่เริ่มต้นต้องไม่เกินวันที่สิ้นสุด","error");
    if(!confirm(`สร้างงานประมวลผล Attendance ใหม่ช่วง ${start} ถึง ${end}?\n\nระบบจะแบ่งประมวลผลเป็นชุดย่อยและบันทึก Error Log โดยไม่หยุดทั้งงาน`))return;
    try{
      $("attRebuildStartBtn").disabled=true;
      app()?.showLoading?.("กำลังสร้างรายการประมวลผล Attendance...");
      const job=await rpc("ta_create_attendance_rebuild_job",{p_start_date:start,p_end_date:end,p_batch_size:batch,p_note:note});
      renderProgress(job);state.selectedJobId=job.id;await loadErrors(job.id);await loadHistory();
      toast("สร้าง Job แล้ว ระบบกำลังเริ่มประมวลผล","success");
      runWorker(job.id);
    }catch(e){toast(human(e),"error");}
    finally{$("attRebuildStartBtn").disabled=false;app()?.hideLoading?.();}
  }

  async function runWorker(jobId){
    if(state.worker)return;
    state.worker=true;state.stop=false;state.selectedJobId=jobId;
    try{
      while(!state.stop){
        const job=await rpc("ta_process_attendance_rebuild_step",{p_job_id:jobId});
        renderProgress(job);
        if(Date.now()-state.lastHistoryAt>2500){await loadHistory(false);state.lastHistoryAt=Date.now();}
        if(Number(job.failed_tasks||0)>0&&Number(job.failed_tasks||0)%5===0)await loadErrors(jobId,false);
        if(terminal.has(job.status)||job.status==="PAUSED")break;
        await sleep(80);
      }
    }catch(e){
      toast(`หยุด Worker ชั่วคราว: ${human(e)} — กด “ดำเนินการต่อ” เพื่อทำต่อจาก Task ล่าสุด`,"error");
    }finally{
      state.worker=false;
      await loadHistory(false);
      if(state.selectedJobId)await loadErrors(state.selectedJobId,false);
      const latest=state.history.find(x=>x.id===jobId);if(latest)renderProgress(latest);
    }
  }

  async function control(action){
    const id=state.activeJob?.id||state.selectedJobId;if(!id)return;
    if(action==="CANCEL"&&!confirm("ยืนยันยกเลิก Job นี้? Task ที่ประมวลผลสำเร็จแล้วจะยังคงอยู่"))return;
    try{
      if(action==="PAUSE")state.stop=true;
      const job=await rpc("ta_control_attendance_rebuild_job",{p_job_id:id,p_action:action});
      renderProgress(job);await loadHistory(false);
      if(action==="RESUME")runWorker(id);
      toast(action==="PAUSE"?"หยุดชั่วคราวแล้ว":action==="RESUME"?"ดำเนินการต่อแล้ว":"ยกเลิก Job แล้ว","success");
    }catch(e){toast(human(e),"error");}
  }

  async function retryErrors(){
    const id=state.activeJob?.id||state.selectedJobId;if(!id)return;
    if(!confirm("นำ Task ที่ล้มเหลวกลับมาประมวลผลอีกครั้ง?"))return;
    try{const job=await rpc("ta_retry_attendance_rebuild_errors",{p_job_id:id});renderProgress(job);await loadHistory(false);runWorker(id);}catch(e){toast(human(e),"error");}
  }

  async function loadHistory(showError=true){
    try{
      const rows=await rpc("ta_get_attendance_rebuild_jobs",{p_limit:30});state.history=rows||[];renderHistory();
      if(!state.activeJob&&state.history.length){state.activeJob=state.history[0];state.selectedJobId=state.history[0].id;renderProgress(state.history[0]);}
    }catch(e){if(showError)toast(human(e),"error");}
  }

  function renderHistory(){
    const body=$("attRebuildHistoryBody");if(!body)return;
    body.innerHTML=state.history.length?state.history.map(j=>{
      const p=pct(j),canContinue=["QUEUED","RUNNING","PAUSED"].includes(j.status),hasErrors=Number(j.failed_tasks||0)>0;
      return `<tr data-job-id="${esc(j.id)}"><td>${fmtDateTime(j.created_at)}</td><td><strong>${fmtDate(j.start_date)}</strong><br><small>ถึง ${fmtDate(j.end_date)}</small></td><td><span class="att-rebuild-status ${esc(j.status)}">${esc(statusLabel(j.status))}</span></td><td><div class="att-rebuild-mini-progress"><strong>${p.toLocaleString("th-TH",{maximumFractionDigits:1})}%</strong><div class="att-rebuild-mini-track"><i style="width:${p}%"></i></div><small>${num(j.processed_tasks)}/${num(j.total_tasks)} Task</small></div></td><td>${num(j.total_employees)}</td><td>${num(j.inserted_rows)}</td><td>${num(j.failed_tasks)}</td><td>${esc(j.requested_email||"-")}</td><td><div class="att-rebuild-actions"><button class="btn btn-light" data-att-job-view="${esc(j.id)}">ดู</button>${canContinue?`<button class="btn btn-primary" data-att-job-resume="${esc(j.id)}">ดำเนินการต่อ</button>`:""}${hasErrors?`<button class="btn btn-danger-soft" data-att-job-errors="${esc(j.id)}">Error</button>`:""}</div></td></tr>`;
    }).join(""):`<tr><td colspan="9" class="att-rebuild-empty">ยังไม่มีประวัติการประมวลผล Attendance</td></tr>`;
  }

  async function loadErrors(jobId=state.selectedJobId,showError=true){
    if(!jobId)return;
    try{const rows=await rpc("ta_get_attendance_rebuild_errors",{p_job_id:jobId,p_limit:500});renderErrors(rows||[],jobId);}catch(e){if(showError)toast(human(e),"error");}
  }
  function renderErrors(rows,jobId){
    state.selectedJobId=jobId;
    const panel=$("attRebuildErrorPanel"),body=$("attRebuildErrorBody");if(!panel||!body)return;
    panel.classList.remove("hidden");setText("attRebuildErrorCount",`${num(rows.length)} รายการ`);
    body.innerHTML=rows.length?rows.map(r=>`<tr><td>${fmtDateTime(r.created_at)}</td><td>${fmtDate(r.work_date)}</td><td><span class="fc-badge ${r.severity==='ERROR'?'danger':'warning'}">${esc(r.severity)}</span></td><td>${esc(r.error_code||"-")}</td><td class="att-rebuild-error-message"><strong>${esc(r.error_message||"-")}</strong>${r.error_detail?`<br><small>${esc(r.error_detail)}</small>`:""}</td><td class="att-rebuild-code-list">${esc((r.emp_codes||[]).join(", ")||"-")}</td><td>${esc(r.resolution||"-")}</td></tr>`).join(""):`<tr><td colspan="7" class="att-rebuild-empty">ไม่พบ Error Log ของ Job นี้</td></tr>`;
  }

  function bind(){
    $("attRebuildStartBtn")?.addEventListener("click",createJob);
    $("attRebuildRefreshBtn")?.addEventListener("click",()=>loadHistory());
    $("attRebuildPauseBtn")?.addEventListener("click",()=>control("PAUSE"));
    $("attRebuildResumeBtn")?.addEventListener("click",()=>control("RESUME"));
    $("attRebuildCancelBtn")?.addEventListener("click",()=>control("CANCEL"));
    $("attRebuildRetryBtn")?.addEventListener("click",retryErrors);
    $("attRebuildErrorRefreshBtn")?.addEventListener("click",()=>loadErrors());
    document.addEventListener("click",e=>{
      const view=e.target.closest("[data-att-job-view]");if(view){const j=state.history.find(x=>x.id===view.dataset.attJobView);if(j){state.activeJob=j;renderProgress(j);loadErrors(j.id);}return;}
      const resume=e.target.closest("[data-att-job-resume]");if(resume){const j=state.history.find(x=>x.id===resume.dataset.attJobResume);if(j){state.activeJob=j;state.selectedJobId=j.id;renderProgress(j);control("RESUME");}return;}
      const errors=e.target.closest("[data-att-job-errors]");if(errors){loadErrors(errors.dataset.attJobErrors);$("attRebuildErrorPanel")?.scrollIntoView({behavior:"smooth",block:"start"});}
    });
    document.querySelector('[data-page="admin-attendance-rebuild"]')?.addEventListener("click",()=>setTimeout(()=>loadHistory(),0));
    document.querySelector('[data-admin-open="admin-attendance-rebuild"]')?.addEventListener("click",()=>setTimeout(()=>loadHistory(),0));
    window.addEventListener("ta:session-ready",()=>{if(app()?.state?.profile?.role==="HR_ADMIN")loadHistory(false);});
  }
  function init(){defaultDates();bind();document.documentElement.dataset.attendanceRebuildVersion=VERSION;if($("aboutVersion"))$("aboutVersion").textContent=VERSION;}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
  window.TimeClockAttendanceRebuild={loadHistory,loadErrors,runWorker};
})();


/* ===== V6.10.2 Role, Manager Hierarchy & Shift Requests ===== */
(function TimeClockV680(){
  "use strict";

  const VERSION = "6.10.2";
  const app = () => window.TimeClockApp;
  const $ = id => document.getElementById(id);
  const qsa = (selector,root=document) =>
    [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? "")
    .replace(/[&<>"']/g,char => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#39;"
    })[char]);
  const role = () => String(
    app()?.state?.profile?.role || "VIEWER"
  ).toUpperCase();
  const realRole = () => String(
    app()?.state?.profile?._realRole
    || app()?.state?.profile?.role
    || "VIEWER"
  ).toUpperCase();
  const isHR = () => role() === "HR_ADMIN";
  const isManager = () => role() === "MANAGER";
  const isViewer = () => role() === "VIEWER";
  const canManage = () => isHR() || isManager();
  const fmtDate = value =>
    app()?.formatDate?.(value) || value || "-";
  const fmtDateTime = value =>
    app()?.formatDateTime?.(value) || value || "-";
  const safeStatus = value =>
    String(value || "").toUpperCase();
  const statusLabel = value => ({
    PENDING:"รอพิจารณา",
    APPROVED:"อนุมัติแล้ว",
    REJECTED:"ไม่อนุมัติ",
    CANCELLED:"ยกเลิก",
    CERTIFIED:"รับรองแล้ว",
    NOT_CERTIFIED:"ยังไม่รับรอง",
    REVOKED:"ยกเลิกการรับรอง",
    STALE:"ต้องรับรองใหม่"
  })[safeStatus(value)] || value || "-";
  const statusClass = value => {
    const code = safeStatus(value);
    if (["APPROVED","CERTIFIED"].includes(code)) {
      return "success";
    }
    if (code === "PENDING") return "warning";
    if (["REJECTED","CANCELLED","REVOKED"].includes(code)) {
      return "danger";
    }
    return "info";
  };

  let shiftRequests = [];

  async function rpc(name,args={}) {
    const client = app()?.state?.client;
    if (!client) {
      throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");
    }
    const {data,error} = await client.rpc(name,args);
    if (error) throw error;
    return data;
  }

  function setText(id,value) {
    if ($(id)) $(id).textContent = value ?? "";
  }

  function setNavBadge(count) {
    const badge = $("shiftRequestNavBadge");
    if (!badge) return;
    badge.textContent = Number(count || 0)
      .toLocaleString("th-TH");
    badge.classList.toggle("hidden",!Number(count));
  }

  function roleLevelText(profile) {
    return ({
      DEPARTMENT:"ระดับแผนก",
      DIVISION:"ระดับฝ่าย",
      GM:"ระดับด้าน",
      AVP:"ระดับสำนัก"
    })[String(profile?.manager_level || "").toUpperCase()]
      || "";
  }

  function applyRoleUI() {
    const currentRole = role();
    const managerAllowed = [
      "schedule",
      "work-patterns"
    ];

    managerAllowed.forEach(page => {
      const nav = document.querySelector(
        `.nav-item[data-page="${page}"]`
      );
      nav?.classList.toggle(
        "hidden",
        !["HR_ADMIN","MANAGER"].includes(
          currentRole
        )
      );
    });

    $("adminNavGroup")?.classList.toggle(
      "hidden",
      currentRole !== "HR_ADMIN"
      && realRole() !== "HR_ADMIN"
    );

    qsa(
      "#adminNavGroup .nav-item:not(#systemSettingsNav)"
    ).forEach(nav => {
      nav.classList.toggle(
        "hidden",
        currentRole !== "HR_ADMIN"
      );
    });

    const profile = app()?.state?.profile || {};
    if ($("roleBadge")) {
      $("roleBadge").textContent = currentRole;
      const level = roleLevelText(profile);
      if (level) {
        $("roleBadge").title =
          `${currentRole} • ${level} • `
          + `รหัส ${profile.emp_code || "-"}`;
      }
    }

    $("newShiftRequestBtn")?.classList.toggle(
      "hidden",
      !isViewer()
    );

    if ($("shiftRequestSubtitle")) {
      $("shiftRequestSubtitle").textContent =
        isViewer()
          ? "ตรวจสอบคำขอของตนเองและส่งคำขอแก้ไขกะให้ Manager"
          : isManager()
            ? `พิจารณาคำขอของพนักงานในขอบเขต ${
                roleLevelText(profile)
                || "Manager"
              }`
            : "ตรวจสอบและพิจารณาคำขอแก้ไขกะทั้งหมด";
    }

    [
      "newLeaveBtn",
      "newCertificateBtn",
      "newCorrectionBtn"
    ].forEach(id => {
      $(id)?.classList.toggle(
        "hidden",
        currentRole !== "HR_ADMIN"
      );
    });
  }

  function shiftOptions() {
    const shifts =
      app()?.state?.filters?.shifts || [];

    return shifts
      .filter(shift => shift.is_active !== false)
      .sort(
        (a,b) =>
          Number(a.display_order || 0)
          - Number(b.display_order || 0)
      );
  }

  function populateShiftRequestSelect() {
    const select = $("shiftRequestRequestedShift");
    if (!select) return;

    select.innerHTML = shiftOptions().map(shift => {
      const start = app()?.formatTime?.(
        shift.start_time
      ) || "-";
      const end = app()?.formatTime?.(
        shift.end_time
      ) || "-";
      return `<option value="${esc(shift.shift_code)}">
        ${esc(shift.shift_code)}
        • ${esc(shift.shift_name || "")}
        ${shift.is_workday === false
          ? ""
          : `• ${esc(start)}–${esc(end)}`}
      </option>`;
    }).join("");
  }

  function attendanceRow(emp,date) {
    return (
      app()?.state?.attendance || []
    ).find(row =>
      String(row.emp_code) === String(emp)
      && String(row.work_date).slice(0,10)
        === String(date).slice(0,10)
    );
  }

  function openShiftRequestModal(prefill={}) {
    const profile = app()?.state?.profile || {};
    const empCode = String(
      prefill.emp
      || profile.emp_code
      || ""
    ).trim();
    const date = String(
      prefill.date
      || new Date().toISOString().slice(0,10)
    ).slice(0,10);
    const row = attendanceRow(empCode,date);
    const fullName =
      prefill.fullName
      || row?.full_name
      || profile.display_name
      || "";

    if (!empCode) {
      return app()?.toast?.(
        "บัญชีนี้ยังไม่ได้ผูกรหัสพนักงาน กรุณาติดต่อ HR Admin",
        "error"
      );
    }

    if (isViewer() && empCode !== String(
      profile.emp_code || ""
    )) {
      return app()?.toast?.(
        "Viewer ส่งคำขอได้เฉพาะข้อมูลของตนเอง",
        "error"
      );
    }

    populateShiftRequestSelect();

    $("shiftRequestEmpCode").value = empCode;
    $("shiftRequestWorkDate").value = date;
    $("shiftRequestCurrentShift").value =
      prefill.currentShift
      || row?.assigned_shift_code
      || row?.effective_shift_code
      || row?.shift_code
      || "-";
    $("shiftRequestReason").value = "";
    $("shiftRequestEmployeeDisplay").innerHTML =
      `<strong>${esc(empCode)} • ${esc(fullName)}</strong>
       <span>${esc(
         row?.department
         || profile.manager_level
         || ""
       )}</span>`;

    $("shiftRequestModal")?.classList.remove("hidden");
  }

  function closeModal(id) {
    $(id)?.classList.add("hidden");
  }

  async function submitShiftRequest() {
    const emp = $("shiftRequestEmpCode")?.value.trim();
    const date = $("shiftRequestWorkDate")?.value;
    const requestedShift =
      $("shiftRequestRequestedShift")?.value;
    const reason =
      $("shiftRequestReason")?.value.trim();

    if (!emp || !date || !requestedShift || !reason) {
      return app()?.toast?.(
        "กรุณากรอกวันที่ กะที่ต้องการ และเหตุผล",
        "error"
      );
    }

    app()?.showLoading?.("กำลังส่งคำขอแก้ไขกะ...");
    try {
      await rpc(
        "ta_submit_shift_change_request_v680",
        {
          p_emp_code: emp,
          p_work_date: date,
          p_requested_shift_code:
            requestedShift,
          p_reason: reason
        }
      );
      closeModal("shiftRequestModal");
      app()?.toast?.(
        "ส่งคำขอแก้ไขกะเรียบร้อย",
        "success"
      );
      await loadShiftRequests();

      if (
        app()?.state?.currentPage === "attendance"
      ) {
        await app()?.loadAttendance?.();
      }
    } catch (error) {
      app()?.toast?.(
        app()?.humanError?.(error)
        || error.message,
        "error"
      );
    } finally {
      app()?.hideLoading?.();
    }
  }

  async function loadShiftRequests() {
    if (!$("shiftRequestBody")) return;

    const start =
      $("shiftRequestStart")?.value
      || new Date(
        new Date().getFullYear(),
        new Date().getMonth(),
        1
      ).toISOString().slice(0,10);
    const end =
      $("shiftRequestEnd")?.value
      || new Date().toISOString().slice(0,10);
    const status =
      $("shiftRequestStatus")?.value;
    const search =
      $("shiftRequestSearch")?.value.trim();

    app()?.showLoading?.(
      "กำลังโหลดคำขอแก้ไขกะ..."
    );
    try {
      shiftRequests = await rpc(
        "ta_get_shift_change_requests_v680",
        {
          p_start_date: start,
          p_end_date: end,
          p_statuses: status ? [status] : null,
          p_search: search || null,
          p_limit: 3000
        }
      ) || [];

      renderShiftRequests();
    } catch (error) {
      app()?.toast?.(
        app()?.humanError?.(error)
        || error.message,
        "error"
      );
    } finally {
      app()?.hideLoading?.();
    }
  }

  function renderShiftRequests() {
    const pending = shiftRequests.filter(
      request => request.status === "PENDING"
    ).length;
    const approved = shiftRequests.filter(
      request => request.status === "APPROVED"
    ).length;
    const closed = shiftRequests.filter(
      request => [
        "REJECTED","CANCELLED"
      ].includes(request.status)
    ).length;

    setText(
      "shiftRequestCount",
      `${shiftRequests.length
        .toLocaleString("th-TH")} รายการ`
    );
    setText(
      "shiftRequestKpiAll",
      shiftRequests.length.toLocaleString("th-TH")
    );
    setText(
      "shiftRequestKpiPending",
      pending.toLocaleString("th-TH")
    );
    setText(
      "shiftRequestKpiApproved",
      approved.toLocaleString("th-TH")
    );
    setText(
      "shiftRequestKpiClosed",
      closed.toLocaleString("th-TH")
    );
    setNavBadge(pending);

    const body = $("shiftRequestBody");
    if (!body) return;

    body.innerHTML = shiftRequests.length
      ? shiftRequests.map(request => {
          const actions = [];

          if (
            canManage()
            && request.status === "PENDING"
          ) {
            actions.push(
              `<button
                class="btn btn-success btn-sm"
                data-shift-request-decision="${esc(request.request_id)}|APPROVED"
              >อนุมัติ</button>`
            );
            actions.push(
              `<button
                class="btn btn-danger-soft btn-sm"
                data-shift-request-decision="${esc(request.request_id)}|REJECTED"
              >ไม่อนุมัติ</button>`
            );
          }

          if (
            request.requested_by_self
            && request.status === "PENDING"
          ) {
            actions.push(
              `<button
                class="btn btn-light btn-sm"
                data-shift-request-cancel="${esc(request.request_id)}"
              >ยกเลิก</button>`
            );
          }

          return `<tr>
            <td><strong>${esc(request.request_no)}</strong></td>
            <td>${fmtDate(request.work_date)}</td>
            <td>
              <strong>${esc(request.emp_code)}</strong>
              <small class="v650-cell-sub">${esc(request.full_name || "")}</small>
            </td>
            <td><span class="badge badge-gray">${esc(request.current_shift_code || "-")}</span></td>
            <td><span class="badge badge-blue">${esc(request.requested_shift_code)}</span></td>
            <td>${esc(request.reason || "-")}</td>
            <td><span class="v650-status ${statusClass(request.status)}">${esc(statusLabel(request.status))}</span></td>
            <td>${fmtDateTime(request.requested_at)}</td>
            <td>${esc(request.decision_note || "-")}</td>
            <td><div class="v650-actions">${actions.join("") || "-"}</div></td>
          </tr>`;
        }).join("")
      : `<tr><td colspan="10" class="fc-empty">ไม่พบคำขอแก้ไขกะ</td></tr>`;
  }

  async function decideShiftRequest(id,decision) {
    const note = prompt(
      decision === "APPROVED"
        ? "หมายเหตุการอนุมัติ"
        : "ระบุเหตุผลที่ไม่อนุมัติ"
    );

    if (note === null) return;

    app()?.showLoading?.(
      "กำลังบันทึกผลการพิจารณา..."
    );
    try {
      await rpc(
        "ta_decide_shift_change_request_v680",
        {
          p_request_id: id,
          p_decision: decision,
          p_note: note || null
        }
      );
      app()?.toast?.(
        decision === "APPROVED"
          ? "อนุมัติและปรับกะเรียบร้อย"
          : "บันทึกผลไม่อนุมัติแล้ว",
        "success"
      );
      await loadShiftRequests();
    } catch (error) {
      app()?.toast?.(
        app()?.humanError?.(error)
        || error.message,
        "error"
      );
    } finally {
      app()?.hideLoading?.();
    }
  }

  async function cancelShiftRequest(id) {
    const note = prompt("เหตุผลการยกเลิกคำขอ");
    if (note === null) return;

    app()?.showLoading?.("กำลังยกเลิกคำขอ...");
    try {
      await rpc(
        "ta_cancel_shift_change_request_v680",
        {
          p_request_id: id,
          p_reason: note || null
        }
      );
      app()?.toast?.(
        "ยกเลิกคำขอเรียบร้อย",
        "success"
      );
      await loadShiftRequests();
    } catch (error) {
      app()?.toast?.(
        app()?.humanError?.(error)
        || error.message,
        "error"
      );
    } finally {
      app()?.hideLoading?.();
    }
  }

  async function certifyAttendance(key,action) {
    const [emp,date] = String(key).split("|");
    const note = prompt(
      action === "REVOKE"
        ? "เหตุผลการยกเลิกการรับรอง"
        : "หมายเหตุการรับรองเวลาทำงาน"
    );
    if (note === null) return;

    app()?.showLoading?.(
      action === "REVOKE"
        ? "กำลังยกเลิกการรับรอง..."
        : "กำลังรับรองเวลาทำงาน..."
    );
    try {
      await rpc(
        action === "REVOKE"
          ? "ta_revoke_attendance_certification_v680"
          : "ta_certify_attendance_v680",
        {
          p_emp_code: emp,
          p_work_date: date,
          p_note: note || null
        }
      );
      app()?.toast?.(
        action === "REVOKE"
          ? "ยกเลิกการรับรองแล้ว"
          : "รับรองเวลาทำงานเรียบร้อย",
        "success"
      );

      await window.TimeClockAttendanceWorkspace
        ?.openAttendanceDetail?.(key);
    } catch (error) {
      app()?.toast?.(
        app()?.humanError?.(error)
        || error.message,
        "error"
      );
    } finally {
      app()?.hideLoading?.();
    }
  }

  function exportShiftRequests() {
    if (!shiftRequests.length) {
      return app()?.toast?.(
        "ไม่มีข้อมูลสำหรับ Export",
        "error"
      );
    }

    const rows = [
      [
        "เลขที่คำขอ","วันที่ทำงาน",
        "รหัสพนักงาน","ชื่อ-นามสกุล",
        "กะเดิม","กะที่ขอ","เหตุผล",
        "สถานะ","วันที่ส่งคำขอ",
        "หมายเหตุการพิจารณา"
      ],
      ...shiftRequests.map(request => [
        request.request_no,
        request.work_date,
        request.emp_code,
        request.full_name,
        request.current_shift_code,
        request.requested_shift_code,
        request.reason,
        statusLabel(request.status),
        request.requested_at,
        request.decision_note
      ])
    ];

    const cell = value =>
      `"${String(value ?? "")
        .replace(/"/g,'""')}"`;
    const csv = "\uFEFF"
      + rows.map(row =>
          row.map(cell).join(",")
        ).join("\n");
    const blob = new Blob(
      [csv],
      {type:"text/csv;charset=utf-8"}
    );
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      `Shift_Request_${$("shiftRequestStart")?.value}_${$("shiftRequestEnd")?.value}.csv`;
    link.click();
    setTimeout(
      () => URL.revokeObjectURL(url),
      1000
    );
  }

  function bind() {
    const today = new Date().toISOString().slice(0,10);
    const start = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toISOString().slice(0,10);

    if ($("shiftRequestStart")) {
      $("shiftRequestStart").value = start;
    }
    if ($("shiftRequestEnd")) {
      $("shiftRequestEnd").value = today;
    }

    $("newShiftRequestBtn")?.addEventListener(
      "click",
      () => openShiftRequestModal()
    );
    $("loadShiftRequestsBtn")?.addEventListener(
      "click",
      loadShiftRequests
    );
    $("submitShiftRequestBtn")?.addEventListener(
      "click",
      submitShiftRequest
    );
    $("shiftRequestExportBtn")?.addEventListener(
      "click",
      exportShiftRequests
    );

    qsa("[data-v680-close]").forEach(button => {
      button.addEventListener(
        "click",
        () => closeModal(button.dataset.v680Close)
      );
    });

    document.addEventListener(
      "click",
      event => {
        const requestButton = event.target.closest(
          "[data-detail-shift-request]"
        );
        if (requestButton) {
          const [emp,date] =
            requestButton.dataset.detailShiftRequest
              .split("|");
          const row = attendanceRow(emp,date);
          openShiftRequestModal({
            emp,
            date,
            fullName: row?.full_name,
            currentShift:
              row?.assigned_shift_code
              || row?.effective_shift_code
              || row?.shift_code
          });
          return;
        }

        const certifyButton = event.target.closest(
          "[data-detail-certify]"
        );
        if (certifyButton) {
          certifyAttendance(
            certifyButton.dataset.detailCertify,
            certifyButton.dataset.certificationAction
          );
          return;
        }

        const decisionButton = event.target.closest(
          "[data-shift-request-decision]"
        );
        if (decisionButton) {
          const [id,decision] =
            decisionButton.dataset
              .shiftRequestDecision
              .split("|");
          decideShiftRequest(id,decision);
          return;
        }

        const cancelButton = event.target.closest(
          "[data-shift-request-cancel]"
        );
        if (cancelButton) {
          cancelShiftRequest(
            cancelButton.dataset.shiftRequestCancel
          );
          return;
        }

        const nav = event.target.closest(
          '.nav-item[data-page="shift-requests"]'
        );
        if (nav) {
          setTimeout(loadShiftRequests,0);
        }
      }
    );

    document.addEventListener(
      "timeclock:effective-role-changed",
      applyRoleUI
    );

    applyRoleUI();
  }

  window.TimeClockV680 = Object.freeze({
    VERSION,
    loadShiftRequests,
    openShiftRequestModal,
    applyRoleUI
  });

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      bind,
      {once:true}
    );
  } else {
    bind();
  }
})();


/* ===== V6.10.2 Organization Structure ===== */
"use strict";
(() => {
  const A = () => window.TimeClockApp;
  const $ = id => document.getElementById(id);
  const qa = (s,r=document) => [...r.querySelectorAll(s)];
  const state = {
    rows: [],
    detail: null,
    selectedId: null,
    expanded: new Set(),
    search: "",
    managerCandidates: [],
    orgUploadRows: [],
    scopeUploadRows: [],
    draggingId: null,
    dropTargetId: null,
    dropMode: null,
    dragExpandTimer: null,
    suppressClickUntil: 0
  };

  const esc = value => String(value ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;")
    .replace(/'/g,"&#039;");
  const val = id => String($(id)?.value ?? "").trim();
  const setVal = (id,value) => { if($(id)) $(id).value = value ?? ""; };
  const setText = (id,value) => { if($(id)) $(id).textContent = value ?? ""; };
  const num = value => Number(value || 0).toLocaleString("th-TH");
  const fmtDate = value => value ? (A()?.formatDate?.(value) || value) : "-";
  const open = id => $(id)?.classList.remove("hidden");
  const close = id => $(id)?.classList.add("hidden");

  async function rpc(name,args={}) {
    const {data,error} = await A().state.client.rpc(name,args);
    if(error) throw error;
    return data;
  }

  function levelTone(level) {
    const code = String(level || "").toUpperCase();
    if(code.includes("COMPANY")) return "company";
    if(code.includes("OFFICE") || code.includes("BUREAU")) return "office";
    if(code.includes("DIVISION")) return "division";
    if(code.includes("DEPARTMENT")) return "department";
    if(code.includes("SECTION")) return "section";
    if(code.includes("TEAM")) return "team";
    return "unit";
  }

  function childMap() {
    const map = new Map();
    state.rows.forEach(row => {
      const key = row.parent_org_id || "__ROOT__";
      if(!map.has(key)) map.set(key,[]);
      map.get(key).push(row);
    });
    for(const rows of map.values()) {
      rows.sort((a,b) =>
        Number(a.sort_order||0)-Number(b.sort_order||0)
        || String(a.org_code).localeCompare(
          String(b.org_code),"th",{numeric:true}
        )
      );
    }
    return map;
  }

  function visibleIds() {
    const term = state.search.trim().toLowerCase();
    if(!term) return null;
    const byId = new Map(state.rows.map(row => [row.org_id,row]));
    const visible = new Set();

    state.rows.forEach(row => {
      const hay =
        `${row.org_code} ${row.org_name} `
        + `${row.org_level_name||row.org_level_code}`.toLowerCase();

      if(!hay.toLowerCase().includes(term)) return;

      let current = row;
      while(current) {
        visible.add(current.org_id);
        current = current.parent_org_id
          ? byId.get(current.parent_org_id)
          : null;
      }
    });
    return visible;
  }

  function renderTree() {
    const root = $("orgTree");
    if(!root) return;

    const map = childMap();
    const visible = visibleIds();
    const searching = Boolean(state.search.trim());

    function node(row) {
      if(visible && !visible.has(row.org_id)) return "";
      const children = (map.get(row.org_id)||[])
        .filter(item => !visible || visible.has(item.org_id));
      const expanded = searching || state.expanded.has(row.org_id);

      return `<div class="org-tree-branch">
        <button
          class="org-tree-node ${
            state.selectedId===row.org_id ? "selected" : ""
          } ${row.is_active ? "" : "inactive"}"
          data-org-select="${esc(row.org_id)}"
          data-org-drop-target="${esc(row.org_id)}"
          style="--org-depth:${Number(row.depth||0)}"
        >
          <span
            class="org-tree-drag-handle"
            draggable="true"
            data-org-drag="${esc(row.org_id)}"
            title="ลากเพื่อย้ายหรือเรียงลำดับหน่วยงาน"
            aria-label="ลากหน่วยงาน ${esc(row.org_name)}"
          >⠿</span>
          <span
            class="org-tree-toggle ${children.length ? "" : "empty"}"
            data-org-toggle="${esc(row.org_id)}"
          >${children.length ? (expanded ? "−" : "+") : ""}</span>
          <span class="org-tree-icon ${levelTone(row.org_level_code)}">▱</span>
          <span class="org-tree-node-main">
            <strong><b>${esc(row.org_code)}</b> • ${esc(row.org_name)}</strong>
            <small>${esc(row.org_level_name||row.org_level_code)}
              · ${esc(row.zone||"ยังไม่กำหนด Zone")}
              · พนักงาน ${num(row.employee_count)}
              · Manager ${num(row.manager_count)}</small>
          </span>
          ${row.is_active ? "" : "<em>ปิด</em>"}
        </button>
        <div class="org-tree-children ${expanded ? "" : "hidden"}">
          ${children.map(node).join("")}
        </div>
      </div>`;
    }

    const roots = map.get("__ROOT__") || [];
    root.innerHTML = roots.map(node).join("")
      || '<div class="org-tree-empty">ไม่พบหน่วยงาน</div>';
    setText("orgTreeCount",`${num(state.rows.length)} หน่วยงาน`);
  }

  function orgRow(orgId) {
    return state.rows.find(
      row => row.org_id === orgId
    ) || null;
  }

  function isOrgDescendant(
    candidateOrgId,
    ancestorOrgId
  ) {
    if (
      !candidateOrgId
      || !ancestorOrgId
    ) {
      return false;
    }

    const byId = new Map(
      state.rows.map(row => [
        row.org_id,
        row
      ])
    );

    let current = byId.get(
      candidateOrgId
    );

    const visited = new Set();

    while (
      current
      && current.parent_org_id
      && !visited.has(current.org_id)
    ) {
      visited.add(current.org_id);

      if (
        current.parent_org_id
        === ancestorOrgId
      ) {
        return true;
      }

      current = byId.get(
        current.parent_org_id
      );
    }

    return false;
  }

  function dragNewParentId(
    targetId,
    dropMode
  ) {
    if (dropMode === "ROOT") {
      return null;
    }

    const target = orgRow(targetId);

    if (!target) {
      return null;
    }

    return dropMode === "INSIDE"
      ? target.org_id
      : target.parent_org_id;
  }

  function canDropOrg(
    draggedId,
    targetId,
    dropMode
  ) {
    if (!draggedId) {
      return false;
    }

    if (dropMode === "ROOT") {
      return true;
    }

    if (
      !targetId
      || targetId === draggedId
    ) {
      return false;
    }

    const newParentId = dragNewParentId(
      targetId,
      dropMode
    );

    if (newParentId === draggedId) {
      return false;
    }

    return !isOrgDescendant(
      newParentId,
      draggedId
    );
  }

  function clearOrgDropIndicators() {
    qa(
      ".org-tree-node.drag-before,"
      + ".org-tree-node.drag-after,"
      + ".org-tree-node.drag-inside,"
      + ".org-tree-node.drag-invalid"
    ).forEach(node => {
      node.classList.remove(
        "drag-before",
        "drag-after",
        "drag-inside",
        "drag-invalid"
      );
    });

    $("orgRootDropZone")
      ?.classList.remove(
        "active",
        "invalid"
      );

    state.dropTargetId = null;
    state.dropMode = null;

    if (state.dragExpandTimer) {
      clearTimeout(
        state.dragExpandTimer
      );
      state.dragExpandTimer = null;
    }
  }

  function orgDropModeFromPointer(
    event,
    node
  ) {
    const rect =
      node.getBoundingClientRect();

    const relativeY =
      (event.clientY - rect.top)
      / Math.max(rect.height,1);

    if (relativeY < 0.28) {
      return "BEFORE";
    }

    if (relativeY > 0.72) {
      return "AFTER";
    }

    return "INSIDE";
  }

  function orgDropDescription(
    dragged,
    target,
    dropMode
  ) {
    if (dropMode === "ROOT") {
      return `ย้าย ${dragged.org_code} • `
        + `${dragged.org_name} `
        + `เป็นหน่วยงานหลักหรือไม่?`;
    }

    if (dropMode === "INSIDE") {
      return `ย้าย ${dragged.org_code} • `
        + `${dragged.org_name} `
        + `เข้าเป็นหน่วยงานลูกของ `
        + `${target.org_code} • `
        + `${target.org_name} หรือไม่?`;
    }

    const position =
      dropMode === "BEFORE"
        ? "ก่อน"
        : "หลัง";

    return `ย้าย ${dragged.org_code} • `
      + `${dragged.org_name} `
      + `ไปเรียง${position} `
      + `${target.org_code} • `
      + `${target.org_name} หรือไม่?`;
  }

  async function moveOrgByDrag(
    draggedId,
    targetId,
    dropMode
  ) {
    const dragged = orgRow(
      draggedId
    );

    const target = targetId
      ? orgRow(targetId)
      : null;

    if (!dragged) {
      return;
    }

    if (
      !canDropOrg(
        draggedId,
        targetId,
        dropMode
      )
    ) {
      A().toast?.(
        "ไม่สามารถย้ายหน่วยงานไปตำแหน่งนี้ได้",
        "error"
      );
      return;
    }

    if (
      !confirm(
        orgDropDescription(
          dragged,
          target,
          dropMode
        )
      )
    ) {
      return;
    }

    A().showLoading?.(
      "กำลังปรับผังโครงสร้างองค์กร..."
    );

    try {
      await rpc(
        "ta_move_org_unit_v694",
        {
          p_org_id: draggedId,
          p_target_org_id:
            dropMode === "ROOT"
              ? null
              : targetId,
          p_drop_mode: dropMode,
          p_change_reason:
            "Drag and Drop จากหน้า Organization Structure"
        }
      );

      if (
        dropMode === "INSIDE"
        && targetId
      ) {
        state.expanded.add(
          targetId
        );
      }

      state.selectedId =
        draggedId;

      A().toast?.(
        "ปรับผังโครงสร้างองค์กรเรียบร้อย",
        "success"
      );

      await load();
      await selectUnit(
        draggedId
      );
    } catch (error) {
      A().toast?.(
        A().humanError?.(error)
          || error.message,
        "error"
      );
    } finally {
      A().hideLoading?.();
    }
  }

  function startOrgDrag(event) {
    const handle =
      event.target.closest(
        "[data-org-drag]"
      );

    if (!handle) {
      return;
    }

    const draggedId =
      handle.dataset.orgDrag;

    const dragged =
      orgRow(draggedId);

    if (!dragged) {
      event.preventDefault();
      return;
    }

    state.draggingId =
      draggedId;

    state.suppressClickUntil =
      Date.now() + 500;

    event.dataTransfer.effectAllowed =
      "move";

    event.dataTransfer.setData(
      "text/plain",
      draggedId
    );

    document.body.classList.add(
      "org-is-dragging"
    );

    requestAnimationFrame(() => {
      handle
        .closest(".org-tree-node")
        ?.classList.add(
          "drag-source"
        );
    });
  }

  function endOrgDrag() {
    qa(
      ".org-tree-node.drag-source"
    ).forEach(node =>
      node.classList.remove(
        "drag-source"
      )
    );

    document.body.classList.remove(
      "org-is-dragging"
    );

    clearOrgDropIndicators();

    state.draggingId = null;
    state.suppressClickUntil =
      Date.now() + 250;
  }

  function overOrgNode(event) {
    if (!state.draggingId) {
      return;
    }

    const node =
      event.target.closest(
        "[data-org-drop-target]"
      );

    if (!node) {
      return;
    }

    const targetId =
      node.dataset.orgDropTarget;

    const dropMode =
      orgDropModeFromPointer(
        event,
        node
      );

    const allowed =
      canDropOrg(
        state.draggingId,
        targetId,
        dropMode
      );

    event.preventDefault();

    event.dataTransfer.dropEffect =
      allowed
        ? "move"
        : "none";

    clearOrgDropIndicators();

    state.dropTargetId =
      targetId;

    state.dropMode =
      dropMode;

    node.classList.add(
      allowed
        ? `drag-${dropMode.toLowerCase()}`
        : "drag-invalid"
    );

    if (
      allowed
      && dropMode === "INSIDE"
      && !state.expanded.has(targetId)
      && Number(
        orgRow(targetId)?.child_count || 0
      ) > 0
    ) {
      state.dragExpandTimer =
        setTimeout(
          () => {
            state.expanded.add(
              targetId
            );
            renderTree();
          },
          750
        );
    }
  }

  async function dropOnOrgNode(
    event
  ) {
    if (!state.draggingId) {
      return;
    }

    const node =
      event.target.closest(
        "[data-org-drop-target]"
      );

    if (!node) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const draggedId =
      state.draggingId;

    const targetId =
      node.dataset.orgDropTarget;

    const dropMode =
      state.dropTargetId === targetId
        ? state.dropMode
        : orgDropModeFromPointer(
            event,
            node
          );

    endOrgDrag();

    await moveOrgByDrag(
      draggedId,
      targetId,
      dropMode
    );
  }

  async function load() {
    if(!A()?.state?.client) return;
    A().showLoading?.("กำลังโหลดผังองค์กร...");
    try {
      state.rows = await rpc("ta_get_org_tree_v6101",{
        p_include_inactive: $("orgShowInactive")?.checked || false
      }) || [];

      if(!state.expanded.size) {
        state.rows.filter(row => Number(row.depth||0)<2)
          .forEach(row => state.expanded.add(row.org_id));
      }

      renderTree();
      fillParentOptions();

      if(
        state.selectedId
        && state.rows.some(row => row.org_id===state.selectedId)
      ) {
        await selectUnit(state.selectedId);
      }
    } catch(error) {
      $("orgTree").innerHTML =
        `<div class="org-tree-empty">${esc(A().humanError?.(error)||error.message)}</div>`;
      A().toast?.(A().humanError?.(error)||error.message,"error");
    } finally {
      A().hideLoading?.();
    }
  }

  function fillParentOptions() {
    const list = $("ouParentOptions");
    if(!list) return;
    list.innerHTML = state.rows
      .filter(row => row.org_id !== val("ouOrgId"))
      .map(row =>
        `<option value="${esc(row.org_code)}">${esc(row.org_name)}</option>`
      ).join("");
  }

  async function selectUnit(orgId) {
    state.selectedId = orgId;
    renderTree();

    try {
      state.detail = await rpc("ta_get_org_unit_detail_v690",{
        p_org_id:orgId
      });
      renderDetail();
    } catch(error) {
      A().toast?.(A().humanError?.(error)||error.message,"error");
    }
  }

  function info(label,value) {
    return `<div><span>${esc(label)}</span><strong>${esc(value??"-")}</strong></div>`;
  }

  function permission(value) {
    return value
      ? '<span class="org-permission yes">✓</span>'
      : '<span class="org-permission no">—</span>';
  }

  function renderDetail() {
    const detail = state.detail;
    const unit = detail?.unit;
    if(!unit) return;

    $("orgDetailEmpty")?.classList.add("hidden");
    $("orgDetailContent")?.classList.remove("hidden");

    setText("orgDetailTitle",unit.org_name);
    setText("orgDetailCode",`รหัส ${unit.org_code}`);
    setText("orgLevelBadge",unit.org_level_name||unit.org_level_code);
    $("orgLevelBadge").className =
      `org-level-badge ${levelTone(unit.org_level_code)}`;

    const crumbs = [...(detail.ancestors||[]),unit];
    $("orgBreadcrumb").innerHTML = crumbs.map((item,index) =>
      `<button data-org-select="${esc(item.org_id)}">${esc(item.org_name)}</button>`
      + (index<crumbs.length-1 ? "<span>›</span>" : "")
    ).join("");

    setText("orgDirectEmployees",num(detail.direct_employee_count));
    setText("orgTotalEmployees",num(detail.descendant_employee_count));
    setText("orgChildCount",num((detail.children||[]).length));
    setText("orgManagerCount",num((detail.managers||[]).length));
    setText("orgChildrenCount",`${num((detail.children||[]).length)} รายการ`);

    $("orgInfoGrid").innerHTML = [
      ["รหัสหน่วยงาน",unit.org_code],
      ["ชื่อหน่วยงาน",unit.org_name],
      ["Zone",unit.zone||"-"],
      ["Area",unit.area||"-"],
      ["Sub-area",unit.sub_area||"-"],
      ["ระดับ",unit.org_level_name||unit.org_level_code],
      ["หน่วยงานแม่",detail.parent?.org_name||"หน่วยงานหลัก"],
      ["ลำดับแสดง",unit.sort_order],
      ["เริ่มใช้",fmtDate(unit.effective_from)],
      ["สิ้นสุด",fmtDate(unit.effective_to)],
      ["สถานะ",unit.is_active ? "ใช้งาน" : "ปิดใช้งาน"],
      ["หมายเหตุ",unit.note||"-"]
    ].map(item => info(item[0],item[1])).join("");

    $("orgChildrenList").innerHTML = (detail.children||[]).length
      ? detail.children.map(child => `<button data-org-select="${esc(child.org_id)}">
          <span class="org-tree-icon ${levelTone(child.org_level_code)}">▱</span>
          <div><strong>${esc(child.org_code)} • ${esc(child.org_name)}</strong><small>${esc(child.org_level_code)}</small></div>
          <em>›</em>
        </button>`).join("")
      : '<div class="org-list-empty">ไม่มีหน่วยงานลูก</div>';

    $("orgManagerBody").innerHTML = (detail.managers||[]).length
      ? detail.managers.map(manager => `<tr>
          <td><strong>${esc(manager.display_name||manager.manager_email)}</strong><small class="org-manager-email">${esc(manager.manager_email)}</small></td>
          <td>${manager.include_descendants ? "รวมหน่วยงานลูก" : "เฉพาะหน่วยงานนี้"}</td>
          <td>${permission(manager.can_view)}</td>
          <td>${permission(manager.can_edit_schedule)}</td>
          <td>${permission(manager.can_confirm_schedule)}</td>
          <td>${permission(manager.can_certify_attendance)}</td>
          <td>${permission(manager.can_decide_shift_request)}</td>
          <td class="nowrap">${fmtDate(manager.effective_from)} – ${fmtDate(manager.effective_to)}</td>
          <td>${manager.is_active
            ? '<span class="badge badge-green">ใช้งาน</span>'
            : '<span class="badge badge-red">ปิด</span>'}</td>
          <td><div class="org-row-actions">
            <button class="btn btn-soft btn-sm" data-org-edit-manager="${esc(manager.scope_id)}">แก้ไข</button>
            <button class="btn btn-danger-soft btn-sm" data-org-delete-manager="${esc(manager.scope_id)}">ลบ</button>
          </div></td>
        </tr>`).join("")
      : '<tr><td colspan="10" class="fc-empty">ยังไม่ได้กำหนด Manager</td></tr>';

    $("orgDeactivateBtn").disabled = !unit.is_active;
  }

  function resetUnitModal(unit=null,parentCode="") {
    setVal("ouOrgId",unit?.org_id||"");
    setVal("ouOrgCode",unit?.org_code||"");
    setVal("ouOrgName",unit?.org_name||"");
    setVal("ouZone",unit?.zone||"กรุงเทพฯ");
    setVal("ouArea",unit?.area||"");
    setVal("ouSubArea",unit?.sub_area||"");
    setVal("ouLevelCode",unit?.org_level_code||"DEPARTMENT");
    setVal("ouLevelName",unit?.org_level_name||"");
    setVal("ouLevelOrder",unit?.level_order??0);
    setVal("ouParentCode",unit
      ? (state.detail?.parent?.org_code||"")
      : parentCode);
    setVal("ouSortOrder",unit?.sort_order??0);
    setVal("ouEffectiveFrom",unit?.effective_from
      ? String(unit.effective_from).slice(0,10) : "");
    setVal("ouEffectiveTo",unit?.effective_to
      ? String(unit.effective_to).slice(0,10) : "");
    setVal("ouActive",unit?.is_active===false ? "false" : "true");
    setVal("ouNote",unit?.note||"");
    setText("orgUnitModalTitle",unit ? "แก้ไขหน่วยงาน" : "เพิ่มหน่วยงาน");
    fillParentOptions();
    open("orgUnitModal");
  }

  async function saveUnit() {
    const selectedZone = val("ouZone");

    if (
      selectedZone !== "กรุงเทพฯ"
      && selectedZone !== "ตจว."
      && selectedZone !== "สำนักงาน"
    ) {
      A().toast?.(
        "กรุณาเลือก Zone ของหน่วยงาน",
        "error"
      );
      $("ouZone")?.focus();
      return;
    }

    A().showLoading?.("กำลังบันทึกหน่วยงาน...");
    try {
      const row = await rpc("ta_upsert_org_unit_v6101",{
        p_org_id:val("ouOrgId")||null,
        p_org_code:val("ouOrgCode"),
        p_org_name:val("ouOrgName"),
        p_zone:selectedZone,
        p_area:val("ouArea")||null,
        p_sub_area:val("ouSubArea")||null,
        p_org_level_code:val("ouLevelCode"),
        p_org_level_name:val("ouLevelName")||null,
        p_level_order:Number(val("ouLevelOrder")||0),
        p_parent_org_code:val("ouParentCode")||null,
        p_sort_order:Number(val("ouSortOrder")||0),
        p_effective_from:val("ouEffectiveFrom")||null,
        p_effective_to:val("ouEffectiveTo")||null,
        p_is_active:val("ouActive")==="true",
        p_note:val("ouNote")||null,
        p_change_reason:"จัดการจากหน้า Organization Structure"
      });
      close("orgUnitModal");
      A().toast?.("บันทึกหน่วยงานเรียบร้อย","success");
      state.selectedId = row.org_id;
      await load();
    } catch(error) {
      A().toast?.(A().humanError?.(error)||error.message,"error");
    } finally {
      A().hideLoading?.();
    }
  }

  async function deactivateUnit() {
    const unit = state.detail?.unit;
    if(
      !unit
      || !confirm(`ยืนยันปิดใช้งาน ${unit.org_code} • ${unit.org_name}?`)
    ) return;

    A().showLoading?.("กำลังปิดใช้งานหน่วยงาน...");
    try {
      await rpc("ta_deactivate_org_unit_v690",{
        p_org_id:unit.org_id,
        p_change_reason:"ปิดใช้งานจากหน้า Organization Structure"
      });
      A().toast?.("ปิดใช้งานหน่วยงานแล้ว","success");
      await load();
    } catch(error) {
      A().toast?.(A().humanError?.(error)||error.message,"error");
    } finally {
      A().hideLoading?.();
    }
  }

  async function loadManagerCandidates(
    force = false
  ) {
    if(
      state.managerCandidates.length
      && !force
    ) return;

    state.managerCandidates =
      await rpc(
        "ta_get_org_manager_candidates_v6105"
      ) || [];
  }

  function normalizeManagerSearch(
    value
  ) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function managerCandidateText(
    manager
  ) {
    return [
      manager.emp_code,
      manager.display_name,
      manager.email,
      manager.pc,
      manager.position_name,
      manager.department,
      manager.org_code,
      manager.zone,
      manager.area,
      manager.sub_area
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function findManagerCandidateByEmail(
    email
  ) {
    const key =
      normalizeManagerSearch(email);

    return state.managerCandidates.find(
      manager =>
        normalizeManagerSearch(
          manager.email
        ) === key
    ) || null;
  }

  function managerAccountStatus(
    manager
  ) {
    const status =
      String(
        manager.account_status
        || ""
      ).toUpperCase();

    if(status === "READY") {
      return {
        label: "พร้อมใช้งาน",
        css: "ready"
      };
    }

    if(status === "READY_HR_ADMIN") {
      return {
        label: "HR Admin",
        css: "ready"
      };
    }

    if(status === "PROFILE_WILL_BE_CREATED") {
      return {
        label: "จะสร้าง Manager Profile",
        css: "auto"
      };
    }

    if(status === "VIEWER_WILL_BE_MANAGER") {
      return {
        label: "จะเปลี่ยน Viewer → Manager",
        css: "auto"
      };
    }

    if(status === "MANAGER_WILL_BE_ACTIVATED") {
      return {
        label: "จะเปิดใช้งาน Manager",
        css: "auto"
      };
    }

    if(status === "HR_ADMIN_INACTIVE") {
      return {
        label: "จะเปิดใช้งาน HR Admin",
        css: "auto"
      };
    }

    if(status === "NO_AUTH_USER") {
      return {
        label: "ยังไม่มีบัญชีผู้ใช้",
        css: "blocked"
      };
    }

    return {
      label: "ยังไม่พร้อม",
      css: "blocked"
    };
  }

  function managerCandidateCard(
    manager
  ) {
    const scopeCount =
      Number(
        manager.existing_scope_count
        || 0
      );

    const account =
      managerAccountStatus(
        manager
      );

    const selectable =
      Boolean(
        manager.manager_ready
      );

    return `
      <button
        type="button"
        class="org-manager-candidate ${selectable ? "" : "disabled"}"
        ${
          selectable
            ? `data-org-manager-candidate="${esc(manager.email)}"`
            : `disabled`
        }
      >
        <span class="org-manager-avatar">
          ${esc(
            String(
              manager.display_name
              || manager.emp_code
              || "M"
            )
              .trim()
              .slice(0,1)
              .toUpperCase()
          )}
        </span>

        <span class="org-manager-candidate-main">
          <strong>
            ${esc(manager.emp_code || "-")}
            •
            ${esc(manager.display_name || "-")}
          </strong>

          <small>
            ${esc(manager.email || "-")}
          </small>

          <em>
            ${esc(manager.position_name || "-")}
            •
            ${esc(manager.department || "-")}
          </em>
        </span>

        <span class="org-manager-candidate-side">
          <b>PC ${esc(manager.pc || "-")}</b>

          <span class="org-manager-account-status ${account.css}">
            ${esc(account.label)}
          </span>

          ${
            scopeCount
              ? `<small>${num(scopeCount)} Scope</small>`
              : `<small>ยังไม่มี Scope</small>`
          }
        </span>
      </button>
    `;
  }

  function renderManagerSearchResults(
    queryValue = ""
  ) {
    const results =
      $("omManagerSearchResults");

    if(!results) return;

    const query =
      normalizeManagerSearch(
        queryValue
      );

    const matches =
      state.managerCandidates
        .filter(manager =>
          !query
          || managerCandidateText(
            manager
          ).includes(query)
        )
        .slice(0,30);

    if(!query) {
      results.innerHTML = `
        <div class="org-manager-search-empty">
          พิมพ์รหัสพนักงาน ชื่อ-นามสกุล หรือ Email เพื่อค้นหา
        </div>
      `;
      results.classList.add("hidden");
      return;
    }

    results.innerHTML =
      matches.length
        ? matches
            .map(managerCandidateCard)
            .join("")
        : `
          <div class="org-manager-search-empty">
            ไม่พบ Manager ที่ตรงกับคำค้นหา
          </div>
        `;

    results.classList.remove("hidden");
  }

  function renderSelectedManager(
    manager,
    fallbackEmail = ""
  ) {
    const selected =
      $("omManagerSelected");

    if(!selected) return;

    if(!manager && !fallbackEmail) {
      selected.innerHTML = "";
      selected.classList.add("hidden");
      return;
    }

    if(manager) {
      selected.innerHTML = `
        <div class="org-manager-selected-avatar">
          ${esc(
            String(
              manager.display_name
              || manager.emp_code
              || "M"
            )
              .trim()
              .slice(0,1)
              .toUpperCase()
          )}
        </div>

        <div class="org-manager-selected-main">
          <span>Manager ที่เลือก</span>

          <strong>
            ${esc(manager.emp_code || "-")}
            •
            ${esc(manager.display_name || "-")}
          </strong>

          <small>
            ${esc(manager.email || "-")}
          </small>

          <em>
            PC ${esc(manager.pc || "-")}
            •
            ${esc(manager.position_name || "-")}
          </em>
        </div>

        <div class="org-manager-selected-location">
          <span>
            ${esc(manager.zone || "-")}
          </span>
          <small>
            ${esc(manager.area || "-")}
            •
            ${esc(manager.sub_area || "-")}
          </small>
        </div>
      `;
    } else {
      selected.innerHTML = `
        <div class="org-manager-selected-avatar">
          M
        </div>

        <div class="org-manager-selected-main">
          <span>Manager ปัจจุบัน</span>
          <strong>${esc(fallbackEmail)}</strong>
          <small>ข้อมูลพนักงานไม่อยู่ใน Candidate ปัจจุบัน</small>
        </div>
      `;
    }

    selected.classList.remove("hidden");
  }

  function selectManagerCandidate(
    email
  ) {
    const manager =
      findManagerCandidateByEmail(
        email
      );

    if(!manager) {
      return;
    }

    if(!manager.manager_ready) {
      A().toast?.(
        "พนักงานคนนี้ยังไม่มีบัญชีผู้ใช้งานระบบ กรุณาสร้าง User ก่อนกำหนด Manager",
        "error"
      );
      return;
    }

    setVal(
      "omManagerEmail",
      manager.email
    );

    setVal(
      "omManagerSearch",
      `${manager.emp_code || "-"} • ${manager.display_name || "-"}`
    );

    $("omManagerSearchResults")
      ?.classList.add("hidden");

    $("omManagerSearchClear")
      ?.classList.remove("hidden");

    renderSelectedManager(
      manager
    );
  }

  function clearManagerSelection(
    keepSearch = false
  ) {
    setVal(
      "omManagerEmail",
      ""
    );

    if(!keepSearch) {
      setVal(
        "omManagerSearch",
        ""
      );
    }

    $("omManagerSearchClear")
      ?.classList.add("hidden");

    renderSelectedManager(
      null
    );

    $("omManagerSearchResults")
      ?.classList.add("hidden");
  }

  async function openManager(
    scopeId = null
  ) {
    const unit =
      state.detail?.unit;

    if(!unit) return;

    await loadManagerCandidates();

    const manager =
      scopeId
        ? (
            state.detail.managers
            || []
          ).find(
            item =>
              item.scope_id === scopeId
          )
        : null;

    setVal(
      "omScopeId",
      manager?.scope_id || ""
    );

    const managerEmail =
      manager?.manager_email || "";

    setVal(
      "omManagerEmail",
      managerEmail
    );

    const candidate =
      findManagerCandidateByEmail(
        managerEmail
      );

    if(manager) {
      setVal(
        "omManagerSearch",
        candidate
          ? `${candidate.emp_code || "-"} • ${candidate.display_name || "-"}`
          : managerEmail
      );
    } else {
      setVal(
        "omManagerSearch",
        ""
      );
    }

    const searchInput =
      $("omManagerSearch");

    if(searchInput) {
      searchInput.disabled =
        Boolean(manager);
    }

    if(manager) {
      $("omManagerSearchClear")
        ?.classList.add("hidden");

      renderSelectedManager(
        candidate,
        managerEmail
      );
    } else {
      clearManagerSelection();
    }

    $("omManagerSearchResults")
      ?.classList.add("hidden");

    $("omIncludeDescendants").checked =
      manager?.include_descendants !== false;

    $("omCanView").checked =
      manager?.can_view !== false;

    $("omCanEdit").checked =
      Boolean(
        manager?.can_edit_schedule
      );

    $("omCanConfirm").checked =
      Boolean(
        manager?.can_confirm_schedule
      );

    $("omCanCertify").checked =
      Boolean(
        manager?.can_certify_attendance
      );

    $("omCanDecide").checked =
      Boolean(
        manager?.can_decide_shift_request
      );

    setVal(
      "omEffectiveFrom",
      manager?.effective_from
        ? String(
            manager.effective_from
          ).slice(0,10)
        : ""
    );

    setVal(
      "omEffectiveTo",
      manager?.effective_to
        ? String(
            manager.effective_to
          ).slice(0,10)
        : ""
    );

    setVal(
      "omActive",
      manager?.is_active === false
        ? "false"
        : "true"
    );

    setVal(
      "omNote",
      manager?.note || ""
    );

    setText(
      "orgManagerModalTitle",
      manager
        ? "แก้ไข Manager"
        : "กำหนด Manager"
    );

    setText(
      "orgManagerModalUnit",
      `${unit.org_code} • ${unit.org_name}`
    );

    open(
      "orgManagerModal"
    );

    if(!manager) {
      setTimeout(
        () =>
          $("omManagerSearch")
            ?.focus(),
        80
      );
    }
  }

  async function saveManager() {
    const unit =
      state.detail?.unit;

    if(!unit) return;

    const managerEmail =
      val("omManagerEmail");

    if(!managerEmail) {
      A().toast?.(
        "กรุณาค้นหาและเลือก Manager ก่อนบันทึก",
        "error"
      );

      $("omManagerSearch")
        ?.focus();

      return;
    }

    A().showLoading?.(
      "กำลังบันทึก Manager..."
    );

    try {
      const saveResult =
        await rpc(
          "ta_upsert_org_manager_scope_v6105",
          {
            p_scope_id:
              val("omScopeId")
              || null,

            p_manager_email:
              managerEmail,

            p_scope_value:
              unit.org_code,

            p_scope_label:
              unit.org_name,

            p_include_descendants:
              $("omIncludeDescendants").checked,

            p_can_view:
              $("omCanView").checked,

            p_can_edit_schedule:
              $("omCanEdit").checked,

            p_can_confirm_schedule:
              $("omCanConfirm").checked,

            p_can_certify_attendance:
              $("omCanCertify").checked,

            p_can_decide_shift_request:
              $("omCanDecide").checked,

            p_effective_from:
              val("omEffectiveFrom")
              || null,

            p_effective_to:
              val("omEffectiveTo")
              || null,

            p_is_active:
              val("omActive") === "true",

            p_note:
              val("omNote")
              || null
          }
        );

      state.managerCandidates = [];

      const profileAction =
        String(
          saveResult?.profile_action
          || ""
        );

      const profileMessage =
        profileAction === "CREATED_MANAGER_PROFILE"
          ? " และสร้าง Manager Profile แล้ว"
          : profileAction === "PROMOTED_VIEWER_TO_MANAGER"
            ? " และเปลี่ยนสิทธิ์ Viewer เป็น Manager แล้ว"
            : profileAction === "ACTIVATED_MANAGER_PROFILE"
              ? " และเปิดใช้งาน Manager Profile แล้ว"
              : "";

      close(
        "orgManagerModal"
      );

      A().toast?.(
        `บันทึก Manager เรียบร้อย${profileMessage}`,
        "success"
      );

      await load();

      await selectUnit(
        unit.org_id
      );
    } catch(error) {
      const message =
        String(
          error?.message
          || ""
        );

      const friendlyMessage =
        message.includes(
          "MANAGER_AUTH_ACCOUNT_NOT_FOUND"
        )
          ? "พนักงานคนนี้ยังไม่มีบัญชีเข้าใช้งานระบบ กรุณาสร้าง User ด้วย Email เดียวกับข้อมูลพนักงานก่อน"
          : message.includes(
              "MANAGER_PC_NOT_ALLOWED"
            )
            ? "PC ของพนักงานไม่อยู่ในกลุ่มที่อนุญาตให้กำหนดเป็น Manager"
            : (
                A().humanError?.(error)
                || error.message
              );

      A().toast?.(
        friendlyMessage,
        "error"
      );
    } finally {
      A().hideLoading?.();
    }
  }

  async function deleteManager(scopeId) {
    if(!confirm("ยืนยันลบ Manager Scope รายการนี้?")) return;
    A().showLoading?.("กำลังลบ Manager...");
    try {
      await rpc("ta_delete_manager_scope_v690",{p_scope_id:scopeId});
      A().toast?.("ลบ Manager Scope แล้ว","success");
      await load();
      if(state.selectedId) await selectUnit(state.selectedId);
    } catch(error) {
      A().toast?.(A().humanError?.(error)||error.message,"error");
    } finally {
      A().hideLoading?.();
    }
  }

  function parseCsv(textValue) {
    const lines = String(textValue||"")
      .replace(/^\uFEFF/,"")
      .split(/\r?\n/)
      .filter(line => line.trim());
    if(!lines.length) return [];

    const parseLine = line => {
      const cells=[]; let current=""; let quoted=false;
      for(let i=0;i<line.length;i++) {
        const char=line[i];
        if(char === '"') {
          if(quoted && line[i+1] === '"') {
            current+='"'; i++;
          } else quoted=!quoted;
        } else if(char === "," && !quoted) {
          cells.push(current); current="";
        } else current+=char;
      }
      cells.push(current);
      return cells.map(value => value.trim());
    };

    const headers = parseLine(lines[0]);
    return lines.slice(1).map(line => {
      const values=parseLine(line);
      return Object.fromEntries(
        headers.map((header,index) => [header,values[index]??""])
      );
    });
  }

  function downloadTemplate(kind) {
    const headers = kind==="org"
      ? ["org_code","org_name","zone","area","sub_area","org_level_code","org_level_name","level_order","parent_org_code","sort_order","effective_from","effective_to","is_active","note"]
      : ["manager_email","scope_type","scope_value","scope_label","include_descendants","can_view","can_edit_schedule","can_confirm_schedule","can_certify_attendance","can_decide_shift_request","effective_from","effective_to","is_active","note"];

    A().downloadFile?.(
      kind==="org"
        ? "Organization_Structure_Template_v6.10.2.csv"
        : "Organization_Manager_Scope_Template_v6.10.2.csv",
      "\uFEFF"+headers.join(",")+"\n",
      "text/csv;charset=utf-8"
    );
  }

  async function previewOrgFile(file) {
    state.orgUploadRows = file ? parseCsv(await file.text()) : [];
    setText("orgUploadSummary",file
      ? `${file.name} • ${num(state.orgUploadRows.length)} รายการ`
      : "ยังไม่ได้เลือกไฟล์");
    $("orgImportBtn").disabled = !state.orgUploadRows.length;
    $("orgUploadBody").innerHTML = state.orgUploadRows.length
      ? state.orgUploadRows.slice(0,100).map((row,index) =>
          `<tr>
            <td>${index+2}</td>
            <td><strong>${esc(row.org_code)}</strong></td>
            <td class="org-upload-name">${esc(row.org_name)}</td>
            <td>
              <span class="org-zone-chip ${
                row.zone === "ตจว."
                  ? "upcountry"
                  : row.zone === "สำนักงาน"
                    ? "office"
                    : "bangkok"
              }">
                ${esc(row.zone||"-")}
              </span>
            </td>
            <td>${esc(row.area||"-")}</td>
            <td>${esc(row.sub_area||"-")}</td>
            <td>${esc(row.org_level_code||"-")}</td>
            <td>${esc(row.org_level_name||"-")}</td>
            <td>${esc(row.level_order||"0")}</td>
            <td>${esc(row.parent_org_code||"-")}</td>
            <td>${esc(row.sort_order||"0")}</td>
            <td>${esc(row.effective_from||"-")}</td>
            <td>${esc(row.effective_to||"-")}</td>
            <td>${esc(row.is_active||"true")}</td>
            <td class="org-upload-note">${esc(row.note||"-")}</td>
          </tr>`
        ).join("")
      : '<tr><td colspan="15" class="fc-empty">ยังไม่มีข้อมูล Preview</td></tr>';
  }

  async function importOrg() {
    A().showLoading?.("กำลังนำเข้าผังองค์กร...");
    try {
      const result = await rpc("ta_import_org_units_v690",{
        p_rows:state.orgUploadRows,
        p_deactivate_missing:$("orgDeactivateMissing").checked
      });

      if(!result?.success) {
        $("orgUploadErrors").classList.remove("hidden");
        $("orgUploadErrors").innerHTML =
          `<strong>พบข้อมูลไม่พร้อมนำเข้า ${num(result.invalid_rows)}</strong>`
          + (result.errors||[]).map(error =>
              `<div>แถว ${esc(error.row_no)} • ${esc(error.org_code)} • ${esc(error.error)}</div>`
            ).join("");
        return;
      }

      close("orgUploadModal");
      A().toast?.(
        `นำเข้าผังองค์กรสำเร็จ ${num(result.upserted_rows)} รายการ`,
        "success"
      );
      await load();
    } catch(error) {
      A().toast?.(A().humanError?.(error)||error.message,"error");
    } finally {
      A().hideLoading?.();
    }
  }

  async function previewScopeFile(file) {
    state.scopeUploadRows = file ? parseCsv(await file.text()) : [];
    setText("orgScopeSummary",file
      ? `${file.name} • ${num(state.scopeUploadRows.length)} รายการ`
      : "ยังไม่ได้เลือกไฟล์");
    $("orgScopeImportBtn").disabled = !state.scopeUploadRows.length;
    $("orgScopeBody").innerHTML = state.scopeUploadRows.length
      ? state.scopeUploadRows.slice(0,100).map((row,index) =>
          `<tr><td>${index+2}</td><td>${esc(row.manager_email)}</td><td>${esc(row.scope_value||row.org_code)}</td><td>${esc(row.include_descendants||"true")}</td><td>${esc(row.can_edit_schedule||"false")}</td><td>${esc(row.can_certify_attendance||"false")}</td></tr>`
        ).join("")
      : '<tr><td colspan="6" class="fc-empty">ยังไม่มีข้อมูล Preview</td></tr>';
  }

  async function importScopes() {
    A().showLoading?.("กำลังนำเข้า Manager Scope...");
    try {
      const rows = state.scopeUploadRows.map(row => ({
        ...row,
        scope_type:row.scope_type||"ORG_UNIT",
        scope_value:row.scope_value||row.org_code
      }));
      const result = await rpc("ta_import_manager_scopes_v690",{
        p_rows:rows,
        p_replace_existing:$("orgScopeReplace").checked
      });

      if(!result?.success) {
        $("orgScopeErrors").classList.remove("hidden");
        $("orgScopeErrors").innerHTML =
          `<strong>พบข้อมูลไม่พร้อมนำเข้า ${num(result.invalid_rows)}</strong>`
          + (result.errors||[]).map(error =>
              `<div>แถว ${esc(error.row_no)} • ${esc(error.manager_email)} • ${esc(error.error)}</div>`
            ).join("");
        return;
      }

      close("orgScopeUploadModal");
      A().toast?.(
        `นำเข้า Scope สำเร็จ ${num(result.upserted_rows)} รายการ`,
        "success"
      );
      await load();
      if(state.selectedId) await selectUnit(state.selectedId);
    } catch(error) {
      A().toast?.(A().humanError?.(error)||error.message,"error");
    } finally {
      A().hideLoading?.();
    }
  }

  function bind() {
    const orgTree = $("orgTree");
    const rootDropZone =
      $("orgRootDropZone");

    orgTree?.addEventListener(
      "dragstart",
      startOrgDrag
    );

    orgTree?.addEventListener(
      "dragover",
      overOrgNode
    );

    orgTree?.addEventListener(
      "drop",
      dropOnOrgNode
    );

    orgTree?.addEventListener(
      "dragend",
      endOrgDrag
    );

    orgTree?.addEventListener(
      "dragleave",
      event => {
        if (
          !event.relatedTarget
          || !orgTree.contains(
            event.relatedTarget
          )
        ) {
          clearOrgDropIndicators();
        }
      }
    );

    rootDropZone?.addEventListener(
      "dragover",
      event => {
        if (!state.draggingId) {
          return;
        }

        event.preventDefault();

        clearOrgDropIndicators();

        state.dropMode = "ROOT";

        rootDropZone.classList.add(
          "active"
        );

        event.dataTransfer.dropEffect =
          "move";
      }
    );

    rootDropZone?.addEventListener(
      "dragleave",
      () => rootDropZone.classList.remove(
        "active"
      )
    );

    rootDropZone?.addEventListener(
      "drop",
      async event => {
        if (!state.draggingId) {
          return;
        }

        event.preventDefault();

        const draggedId =
          state.draggingId;

        endOrgDrag();

        await moveOrgByDrag(
          draggedId,
          null,
          "ROOT"
        );
      }
    );

    $("orgRefreshBtn")?.addEventListener("click",load);
    $("orgShowInactive")?.addEventListener("change",load);
    $("orgTreeSearch")?.addEventListener(
      "input",
      event => { state.search=event.target.value; renderTree(); }
    );
    $("orgExpandAllBtn")?.addEventListener(
      "click",
      () => { state.rows.forEach(row => state.expanded.add(row.org_id)); renderTree(); }
    );
    $("orgCollapseAllBtn")?.addEventListener(
      "click",
      () => { state.expanded.clear(); renderTree(); }
    );
    $("orgAddRootBtn")?.addEventListener("click",()=>resetUnitModal());
    $("orgAddChildBtn")?.addEventListener(
      "click",
      () => resetUnitModal(null,state.detail?.unit?.org_code||"")
    );
    $("orgEditBtn")?.addEventListener(
      "click",
      () => resetUnitModal(state.detail?.unit)
    );
    $("orgDeactivateBtn")?.addEventListener("click",deactivateUnit);
    $("orgSaveUnitBtn")?.addEventListener("click",saveUnit);
    ["orgAddManagerBtn","orgAddManagerInlineBtn"].forEach(id =>
      $(id)?.addEventListener("click",()=>openManager())
    );
    $("orgSaveManagerBtn")
      ?.addEventListener(
        "click",
        saveManager
      );

    $("omManagerSearch")
      ?.addEventListener(
        "input",
        event => {
          if(
            val("omManagerEmail")
          ) {
            clearManagerSelection(true);
          }

          const value =
            event.target.value;

          $("omManagerSearchClear")
            ?.classList.toggle(
              "hidden",
              !String(value || "").trim()
            );

          renderManagerSearchResults(
            value
          );
        }
      );

    $("omManagerSearch")
      ?.addEventListener(
        "focus",
        event => {
          if(
            !event.target.disabled
            && String(
              event.target.value
              || ""
            ).trim()
          ) {
            renderManagerSearchResults(
              event.target.value
            );
          }
        }
      );

    $("omManagerSearchClear")
      ?.addEventListener(
        "click",
        () => {
          clearManagerSelection();

          $("omManagerSearch")
            ?.focus();
        }
      );

    $("orgUploadBtn")?.addEventListener("click",()=>{
      state.orgUploadRows=[];
      $("orgUploadFile").value="";
      $("orgImportBtn").disabled=true;
      $("orgUploadErrors").classList.add("hidden");
      $("orgUploadErrors").innerHTML="";
      setText("orgUploadSummary","ยังไม่ได้เลือกไฟล์");
      $("orgUploadBody").innerHTML =
        '<tr><td colspan="15" class="fc-empty">ยังไม่มีข้อมูล Preview</td></tr>';
      open("orgUploadModal");
    });
    $("orgScopeUploadBtn")?.addEventListener("click",()=>{
      state.scopeUploadRows=[];
      $("orgScopeFile").value="";
      $("orgScopeImportBtn").disabled=true;
      $("orgScopeErrors").classList.add("hidden");
      setText("orgScopeSummary","ยังไม่ได้เลือกไฟล์");
      open("orgScopeUploadModal");
    });

    $("orgUploadFile")?.addEventListener(
      "change",
      event => previewOrgFile(event.target.files?.[0])
    );
    $("orgScopeFile")?.addEventListener(
      "change",
      event => previewScopeFile(event.target.files?.[0])
    );
    $("orgImportBtn")?.addEventListener("click",importOrg);
    $("orgScopeImportBtn")?.addEventListener("click",importScopes);
    $("orgDownloadTemplateBtn")?.addEventListener(
      "click",
      () => downloadTemplate("org")
    );
    $("orgScopeTemplateBtn")?.addEventListener(
      "click",
      () => downloadTemplate("scope")
    );
    qa("[data-org-close]").forEach(button =>
      button.addEventListener("click",()=>close(button.dataset.orgClose))
    );

    document.addEventListener("click",event=>{
      const managerCandidate =
        event.target.closest(
          "[data-org-manager-candidate]"
        );

      if(managerCandidate) {
        event.preventDefault();

        selectManagerCandidate(
          managerCandidate.dataset
            .orgManagerCandidate
        );

        return;
      }

      if(
        !event.target.closest(
          ".org-manager-search-wrap"
        )
      ) {
        $("omManagerSearchResults")
          ?.classList.add("hidden");
      }

      const toggle=event.target.closest("[data-org-toggle]");
      if(toggle) {
        event.stopPropagation();
        const id=toggle.dataset.orgToggle;
        state.expanded.has(id)
          ? state.expanded.delete(id)
          : state.expanded.add(id);
        renderTree();
        return;
      }

      const select =
        event.target.closest(
          "[data-org-select]"
        );

      if (select) {
        if (
          Date.now()
          < state.suppressClickUntil
        ) {
          event.preventDefault();
          return;
        }

        selectUnit(
          select.dataset.orgSelect
        );
        return;
      }

      const edit=event.target.closest("[data-org-edit-manager]");
      if(edit) {
        openManager(edit.dataset.orgEditManager);
        return;
      }

      const remove=event.target.closest("[data-org-delete-manager]");
      if(remove) {
        deleteManager(remove.dataset.orgDeleteManager);
      }
    });
  }

  document.addEventListener("DOMContentLoaded",bind);
  window.TimeClockOrgStructure = {
    load,
    rows:() => state.rows,
    select:selectUnit
  };
})();


/* ==========================================================================
   V6.10.7 User Account Invite Link
   ========================================================================== */
(function(){
  "use strict";

  const A = () =>
    window.TimeClockApp;

  const $ = id =>
    document.getElementById(id);

  function showAccountModal(id) {
    const modal = $(id);

    if (!modal) {
      throw new Error(
        `ACCOUNT_MODAL_NOT_FOUND: ${id}`
      );
    }

    modal.classList.remove("hidden");
  }

  function hideAccountModal(id) {
    const modal = $(id);

    if (!modal) return;

    modal.classList.add("hidden");
  }

  const safe = value =>
    String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");

  const fmtDateTime = value => {
    if(!value) return "-";

    const date =
      new Date(value);

    if(
      Number.isNaN(
        date.getTime()
      )
    ) {
      return "-";
    }

    return date.toLocaleString(
      "th-TH",
      {
        dateStyle:"short",
        timeStyle:"short"
      }
    );
  };

  const num = value =>
    Number(
      value || 0
    ).toLocaleString(
      "th-TH"
    );

  const state = {
    accounts: [],
    candidates: [],
    candidatesLoaded: false,
    selectedEmployee: null,
    passwordMode: "FIRST_LOGIN"
  };

  const realRole = () =>
    String(
      A()?.state?.profile?._realRole
      || A()?.state?.profile?.role
      || ""
    ).toUpperCase();

  const isHR = () =>
    realRole() === "HR_ADMIN";

  function accountSupabaseClient() {
    const existing =
      A()?.state?.client;

    if(
      existing?.auth
    ) {
      return existing;
    }

    const ensured =
      A()?.ensureSupabaseClient?.();

    if(
      !ensured?.auth
    ) {
      throw new Error(
        "SUPABASE_CLIENT_NOT_READY"
      );
    }

    return ensured;
  }

  const PASSWORD_SETUP_COOLDOWN_MS =
    60 * 1000;

  function passwordSetupStorageKey(
    email
  ) {
    return (
      "tc_password_setup_sent:"
      + String(email || "")
          .trim()
          .toLowerCase()
    );
  }

  function passwordSetupRemainingSeconds(
    email
  ) {
    try {
      const sentAt =
        Number(
          sessionStorage.getItem(
            passwordSetupStorageKey(
              email
            )
          ) || 0
        );

      if(!sentAt) return 0;

      const remaining =
        PASSWORD_SETUP_COOLDOWN_MS
        - (
            Date.now()
            - sentAt
          );

      return Math.max(
        0,
        Math.ceil(
          remaining / 1000
        )
      );
    } catch {
      return 0;
    }
  }

  function markPasswordSetupSent(
    email
  ) {
    try {
      sessionStorage.setItem(
        passwordSetupStorageKey(
          email
        ),
        String(
          Date.now()
        )
      );
    } catch {
      // Cooldown is UX-only.
    }
  }

  function updatePasswordSetupButtons(
    email
  ) {
    const normalized =
      String(email || "")
        .trim()
        .toLowerCase();

    const remaining =
      passwordSetupRemainingSeconds(
        normalized
      );

    document
      .querySelectorAll(
        "[data-account-password-link]"
      )
      .forEach(button => {
        if(
          String(
            button.dataset
              .accountPasswordLink
            || ""
          )
            .trim()
            .toLowerCase()
          !== normalized
        ) {
          return;
        }

        button.disabled =
          remaining > 0;

        button.textContent =
          remaining > 0
            ? `ส่งแล้ว • ${remaining} วิ`
            : "🔑 ตั้งรหัสผ่าน";

        button.title =
          remaining > 0
            ? "ระบบรับคำขอส่ง OTP แล้ว กรุณารอก่อนส่งซ้ำ"
            : "ส่งรหัส OTP สำหรับตั้งรหัสผ่าน";
      });

    return remaining;
  }

  function startPasswordSetupCooldown(
    email
  ) {
    updatePasswordSetupButtons(
      email
    );

    const timer =
      window.setInterval(
        () => {
          const remaining =
            updatePasswordSetupButtons(
              email
            );

          if(
            remaining <= 0
          ) {
            clearInterval(
              timer
            );
          }
        },
        1000
      );
  }

  async function rpc(
    name,
    params = {}
  ) {
    const client =
      accountSupabaseClient();

    const {
      data,
      error
    } =
      await client.rpc(
        name,
        params
      );

    if(error) {
      throw error;
    }

    return data;
  }

  function accountStatusMeta(
    status
  ) {
    const value =
      String(status || "")
        .toUpperCase();

    if(value === "ACTIVE") {
      return {
        label:"พร้อมใช้งาน",
        css:"active"
      };
    }

    if(
      value
      === "INVITE_PENDING"
    ) {
      return {
        label:"รอตอบรับ Invite",
        css:"invite"
      };
    }

    if(
      value
      === "FIRST_LOGIN_PASSWORD"
    ) {
      return {
        label:"รอตั้งรหัสผ่าน",
        css:"first"
      };
    }

    if(value === "INACTIVE") {
      return {
        label:"Inactive",
        css:"inactive"
      };
    }

    return {
      label:"ไม่มี Profile",
      css:"issue"
    };
  }

  function roleBadge(
    role
  ) {
    const value =
      String(role || "VIEWER")
        .toUpperCase();

    const css =
      value === "HR_ADMIN"
        ? "hr"
        : value === "MANAGER"
          ? "manager"
          : "viewer";

    return `
      <span class="account-role-badge ${css}">
        ${safe(value)}
      </span>
    `;
  }

  function accountStatusBadge(
    status
  ) {
    const meta =
      accountStatusMeta(
        status
      );

    return `
      <span class="account-status-badge ${meta.css}">
        <i></i>
        ${safe(meta.label)}
      </span>
    `;
  }

  async function loadSummary() {
    const summary =
      await rpc(
        "ta_get_user_account_summary_v6107"
      ) || {};

    if($("accountKpiTotal")) {
      $("accountKpiTotal").textContent =
        num(
          summary.total_users
        );
    }

    if($("accountKpiActive")) {
      $("accountKpiActive").textContent =
        num(
          summary.active_users
        );
    }

    if($("accountKpiInvite")) {
      $("accountKpiInvite").textContent =
        num(
          summary.invite_pending
        );
    }

    if($("accountKpiFirstLogin")) {
      $("accountKpiFirstLogin").textContent =
        num(
          summary.first_login_pending
        );
    }

    if($("accountKpiIssue")) {
      $("accountKpiIssue").textContent =
        num(
          Number(
            summary.inactive_users
            || 0
          )
          + Number(
              summary.no_profile_users
              || 0
            )
        );
    }
  }

  async function load() {
    if(!isHR()) return;

    try {
      A()?.showLoading?.(
        "กำลังโหลดบัญชีผู้ใช้งาน..."
      );

      const rows =
        await rpc(
          "ta_get_user_accounts_v6107",
          {
            p_search:
              $("accountSearch")
                ?.value
              || null,

            p_role:
              $("accountRoleFilter")
                ?.value
              || null,

            p_status:
              $("accountStatusFilter")
                ?.value
              || null
          }
        ) || [];

      state.accounts =
        rows;

      renderAccounts();

      await loadSummary();
    } catch(error) {
      const raw =
        String(
          error?.message
          || ""
        );

      const friendly =
        raw.includes(
          "ta_get_user_accounts_v6107"
        )
          ? "ยังไม่พบฟังก์ชันบัญชีผู้ใช้งาน V6.10.7 ใน Supabase กรุณารัน SQL V6.10.7 ก่อน"
          : (
              A()?.humanError?.(error)
              || error.message
            );

      if ($("accountTableBody")) {
        $("accountTableBody").innerHTML = `
          <tr>
            <td
              colspan="9"
              class="fc-empty account-load-error-cell"
            >
              ${safe(friendly)}
            </td>
          </tr>
        `;
      }

      if ($("accountTableMeta")) {
        $("accountTableMeta").textContent =
          "โหลดข้อมูลไม่สำเร็จ";
      }

      A()?.toast?.(
        friendly,
        "error"
      );
    } finally {
      A()?.hideLoading?.();
    }
  }

  function renderAccounts() {
    const body =
      $("accountTableBody");

    if(!body) return;

    body.innerHTML =
      state.accounts.length
        ? state.accounts
            .map(account => `
              <tr>
                <td class="account-user-cell">
                  <strong>
                    ${safe(account.email || "-")}
                  </strong>
                  <small>
                    ${safe(account.display_name || "-")}
                  </small>
                </td>

                <td class="account-employee-cell">
                  <strong>
                    ${safe(account.emp_code || "-")}
                  </strong>
                  <small>
                    ${safe(account.employee_name || "-")}
                  </small>
                </td>

                <td>
                  ${roleBadge(account.role)}
                </td>

                <td>
                  ${accountStatusBadge(account.account_status)}
                </td>

                <td class="account-org-cell">
                  <strong>
                    ${safe(account.department || "-")}
                  </strong>
                  <small>
                    ${safe(account.zone || "-")}
                    •
                    ${safe(account.area || "-")}
                    •
                    ${safe(account.sub_area || "-")}
                  </small>
                </td>

                <td>
                  ${fmtDateTime(account.created_at)}
                </td>

                <td>
                  ${fmtDateTime(account.last_sign_in_at)}
                </td>

                <td>
                  ${
                    String(account.role).toUpperCase()
                      === "MANAGER"
                      ? `<span class="account-scope-count">${num(account.scope_count)}</span>`
                      : "-"
                  }
                </td>

                <td>
                  <div class="account-row-actions">
                    ${
                      String(account.account_status).toUpperCase()
                        === "INVITE_PENDING"
                        ? `
                          <button
                            class="btn btn-light account-resend-button"
                            data-account-resend="${safe(account.email)}"
                            title="ส่ง Invite ใหม่"
                          >
                            ↻ Invite
                          </button>
                        `
                        : ""
                    }

                    ${
                      String(account.account_status).toUpperCase()
                        === "FIRST_LOGIN_PASSWORD"
                        ? `
                          <button
                            class="btn btn-light account-password-link-button"
                            data-account-password-link="${safe(account.email)}"
                            title="ส่งลิงก์ให้ User ตั้งรหัสผ่าน"
                          >
                            🔑 ตั้งรหัสผ่าน
                          </button>
                        `
                        : ""
                    }

                    <button
                      class="btn btn-light account-edit-button"
                      data-account-edit="${safe(account.user_id)}"
                    >
                      แก้ไข
                    </button>
                  </div>
                </td>
              </tr>
            `)
            .join("")
        : `
          <tr>
            <td colspan="9" class="fc-empty">
              ไม่พบบัญชีผู้ใช้งาน
            </td>
          </tr>
        `;

    if($("accountTableMeta")) {
      $("accountTableMeta").textContent =
        `${state.accounts.length.toLocaleString("th-TH")} บัญชี`;
    }

    state.accounts
      .filter(account =>
        String(
          account.account_status
          || ""
        ).toUpperCase()
        === "FIRST_LOGIN_PASSWORD"
      )
      .forEach(account => {
        if(
          passwordSetupRemainingSeconds(
            account.email
          ) > 0
        ) {
          startPasswordSetupCooldown(
            account.email
          );
        }
      });
  }

  async function loadCandidates(
    force = false
  ) {
    if(
      state.candidatesLoaded
      && !force
    ) {
      return;
    }

    state.candidates =
      await rpc(
        "ta_get_account_employee_candidates_v6106"
      ) || [];

    state.candidatesLoaded =
      true;
  }

  function candidateSearchText(
    employee
  ) {
    return [
      employee.emp_code,
      employee.full_name,
      employee.email,
      employee.position_name,
      employee.department,
      employee.org_code,
      employee.zone,
      employee.area,
      employee.sub_area
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  function renderCandidateResults(
    query
  ) {
    const box =
      $("accountEmployeeSearchResults");

    if(!box) return;

    const key =
      String(query || "")
        .trim()
        .toLowerCase();

    if(!key) {
      box.classList.add(
        "hidden"
      );
      box.innerHTML = "";
      return;
    }

    const matches =
      state.candidates
        .filter(employee =>
          candidateSearchText(
            employee
          ).includes(key)
        )
        .slice(0,30);

    box.innerHTML =
      matches.length
        ? matches
            .map(employee => {
              const exists =
                Boolean(
                  employee.auth_user_exists
                );

              return `
                <button
                  type="button"
                  class="account-employee-result ${exists ? "existing" : ""}"
                  ${
                    exists
                      ? "disabled"
                      : `data-account-employee="${safe(employee.emp_code)}"`
                  }
                >
                  <span class="account-employee-avatar">
                    ${safe(
                      String(
                        employee.full_name
                        || employee.emp_code
                        || "U"
                      )
                        .trim()
                        .slice(0,1)
                    )}
                  </span>

                  <span class="account-employee-result-main">
                    <strong>
                      ${safe(employee.emp_code || "-")}
                      •
                      ${safe(employee.full_name || "-")}
                    </strong>

                    <small>
                      ${safe(employee.email || "-")}
                    </small>

                    <em>
                      ${safe(employee.position_name || "-")}
                      •
                      ${safe(employee.department || "-")}
                    </em>
                  </span>

                  <span class="account-employee-result-status ${exists ? "existing" : "new"}">
                    ${
                      exists
                        ? "มีบัญชีแล้ว"
                        : "สร้างได้"
                    }
                  </span>
                </button>
              `;
            })
            .join("")
        : `
          <div class="account-employee-empty">
            ไม่พบพนักงานที่ตรงกับคำค้นหา
          </div>
        `;

    box.classList.remove(
      "hidden"
    );
  }

  function selectEmployee(
    empCode
  ) {
    const employee =
      state.candidates.find(
        item =>
          String(item.emp_code)
          === String(empCode)
      );

    if(!employee) return;

    if(employee.auth_user_exists) {
      return;
    }

    state.selectedEmployee =
      employee;

    $("accountCreateEmpCode").value =
      employee.emp_code || "";

    $("accountCreateEmail").value =
      employee.email || "";

    $("accountCreateDisplayName").value =
      employee.full_name || "";

    $("accountEmployeeSearch").value =
      `${employee.emp_code || "-"} • ${employee.full_name || "-"}`;

    $("accountEmployeeSearchResults")
      ?.classList.add("hidden");

    const selected =
      $("accountSelectedEmployee");

    if(selected) {
      selected.innerHTML = `
        <div class="account-selected-avatar">
          ${safe(
            String(
              employee.full_name
              || employee.emp_code
              || "U"
            )
              .trim()
              .slice(0,1)
          )}
        </div>

        <div>
          <span>พนักงานที่เลือก</span>
          <strong>
            ${safe(employee.emp_code || "-")}
            •
            ${safe(employee.full_name || "-")}
          </strong>
          <small>
            ${safe(employee.email || "-")}
          </small>
          <em>
            ${safe(employee.department || "-")}
            •
            ${safe(employee.zone || "-")}
            /
            ${safe(employee.area || "-")}
            /
            ${safe(employee.sub_area || "-")}
          </em>
        </div>
      `;

      selected.classList.remove(
        "hidden"
      );
    }
  }

  function resetCreateForm() {
    state.selectedEmployee =
      null;

    [
      "accountEmployeeSearch",
      "accountCreateEmpCode",
      "accountCreateEmail",
      "accountCreateDisplayName",
      "accountCreateNote"
    ].forEach(id => {
      if($(id)) {
        $(id).value = "";
      }
    });

    if($("accountCreateRole")) {
      $("accountCreateRole").value =
        "VIEWER";
    }

    $("accountSelectedEmployee")
      ?.classList.add("hidden");

    $("accountEmployeeSearchResults")
      ?.classList.add("hidden");
  }

  async function openCreate() {
    resetCreateForm();

    showAccountModal(
      "accountCreateModal"
    );

    const resultBox =
      $("accountEmployeeSearchResults");

    try {
      if (resultBox) {
        resultBox.innerHTML = `
          <div class="account-employee-empty">
            กำลังโหลดรายชื่อพนักงาน...
          </div>
        `;

        resultBox.classList.remove(
          "hidden"
        );
      }

      await loadCandidates(
        true
      );

      if (resultBox) {
        resultBox.classList.add(
          "hidden"
        );

        resultBox.innerHTML = "";
      }

      setTimeout(
        () =>
          $("accountEmployeeSearch")
            ?.focus(),
        60
      );
    } catch(error) {
      const message =
        A()?.humanError?.(error)
        || error?.message
        || "โหลดรายชื่อพนักงานไม่สำเร็จ";

      if (resultBox) {
        resultBox.innerHTML = `
          <div class="account-employee-load-error">
            <strong>โหลดรายชื่อพนักงานไม่สำเร็จ</strong>
            <small>${safe(message)}</small>
          </div>
        `;

        resultBox.classList.remove(
          "hidden"
        );
      }

      A()?.toast?.(
        message,
        "error"
      );
    }
  }

  async function createAccount() {
    if(!state.selectedEmployee) {
      return A()?.toast?.(
        "กรุณาค้นหาและเลือกพนักงานก่อน",
        "error"
      );
    }

    const email =
      $("accountCreateEmail")
        ?.value
        .trim();

    if(!email) {
      return A()?.toast?.(
        "ไม่พบ Email ของพนักงาน",
        "error"
      );
    }

    try {
      A()?.showLoading?.(
        "กำลังสร้างบัญชีและส่ง Invite..."
      );

      const client =
        A()?.state?.client;

      const {
        data,
        error
      } =
        await client.functions.invoke(
          "admin-users",
          {
            body: {
              action:
                "invite_user",

              email:
                email,

              emp_code:
                $("accountCreateEmpCode")
                  ?.value
                || null,

              display_name:
                $("accountCreateDisplayName")
                  ?.value
                  .trim()
                || email,

              role:
                $("accountCreateRole")
                  ?.value
                || "VIEWER",

              note:
                $("accountCreateNote")
                  ?.value
                  .trim()
                || null
            }
          }
        );

      if(error) {
        throw error;
      }

      if(
        data?.success === false
      ) {
        throw new Error(
          data.error
          || "CREATE_USER_FAILED"
        );
      }

      hideAccountModal(
        "accountCreateModal"
      );

      A()?.toast?.(
        "สร้างบัญชีและส่ง Invite ให้ User เรียบร้อย",
        "success"
      );

      state.candidatesLoaded =
        false;

      await load();
    } catch(error) {
      const message =
        String(
          error?.message
          || ""
        );

      const friendly =
        message.includes(
          "APP_INVITE_REDIRECT_URL_NOT_CONFIGURED"
        )
          ? "ยังไม่ได้ตั้งค่า APP_INVITE_REDIRECT_URL สำหรับ Edge Function"
          : message.includes(
              "AUTH_USER_ALREADY_EXISTS"
            )
            ? "Email นี้มีบัญชีผู้ใช้งานอยู่แล้ว"
            : message.includes(
                "EMPLOYEE_EMAIL_NOT_FOUND"
              )
              ? "ไม่พบ Email นี้ในข้อมูลพนักงาน"
              : (
                  A()?.humanError?.(error)
                  || error.message
                );

      A()?.toast?.(
        friendly,
        "error"
      );
    } finally {
      A()?.hideLoading?.();
    }
  }

  function openEdit(
    userId
  ) {
    const account =
      state.accounts.find(
        row =>
          String(row.user_id)
          === String(userId)
      );

    if(!account) return;

    $("accountEditUserId").value =
      account.user_id || "";

    $("accountEditEmail").value =
      account.email || "";

    $("accountEditEmpCode").value =
      account.emp_code || "";

    $("accountEditDisplayName").value =
      account.display_name || "";

    $("accountEditRole").value =
      account.role || "VIEWER";

    $("accountEditActive").checked =
      account.is_active !== false;

    $("accountEditNote").value =
      "";

    $("accountEditSubtitle").textContent =
      `${account.email || "-"} • ${account.emp_code || "-"}`;

    showAccountModal(
      "accountEditModal"
    );
  }

  async function saveEdit() {
    try {
      A()?.showLoading?.(
        "กำลังบันทึกบัญชี..."
      );

      await rpc(
        "ta_update_user_account_profile_v6106",
        {
          p_user_id:
            $("accountEditUserId")
              ?.value,

          p_display_name:
            $("accountEditDisplayName")
              ?.value
              .trim()
            || null,

          p_role:
            $("accountEditRole")
              ?.value
            || "VIEWER",

          p_emp_code:
            $("accountEditEmpCode")
              ?.value
              .trim()
            || null,

          p_is_active:
            Boolean(
              $("accountEditActive")
                ?.checked
            ),

          p_note:
            $("accountEditNote")
              ?.value
              .trim()
            || null
        }
      );

      hideAccountModal(
        "accountEditModal"
      );

      A()?.toast?.(
        "บันทึกบัญชีเรียบร้อย",
        "success"
      );

      await load();
    } catch(error) {
      A()?.toast?.(
        A()?.humanError?.(error)
        || error.message,
        "error"
      );
    } finally {
      A()?.hideLoading?.();
    }
  }

  function setPasswordVisibility(
    inputId,
    buttonId,
    visible
  ) {
    const input =
      $(inputId);

    const button =
      $(buttonId);

    if(!input || !button) return;

    input.type =
      visible
        ? "text"
        : "password";

    button.setAttribute(
      "aria-pressed",
      visible
        ? "true"
        : "false"
    );

    button.setAttribute(
      "aria-label",
      visible
        ? "ซ่อนรหัสผ่าน"
        : "แสดงรหัสผ่าน"
    );

    const label =
      button.querySelector(
        ".account-password-toggle-text"
      );

    if(label) {
      label.textContent =
        visible
          ? "ซ่อน"
          : "แสดง";
    }

    const icon =
      button.querySelector(
        ".account-password-toggle-icon"
      );

    if(icon) {
      icon.textContent =
        visible
          ? "◌"
          : "◉";
    }
  }

  function togglePasswordVisibility(
    inputId,
    buttonId
  ) {
    const input =
      $(inputId);

    if(!input) return;

    setPasswordVisibility(
      inputId,
      buttonId,
      input.type === "password"
    );
  }

  function resetPasswordVisibility() {
    setPasswordVisibility(
      "forcePasswordNew",
      "forcePasswordNewToggle",
      false
    );

    setPasswordVisibility(
      "forcePasswordConfirm",
      "forcePasswordConfirmToggle",
      false
    );
  }

  function passwordScore(
    password
  ) {
    let score = 0;

    if(password.length >= 10) {
      score += 1;
    }

    if(/[A-Z]/.test(password)) {
      score += 1;
    }

    if(/[a-z]/.test(password)) {
      score += 1;
    }

    if(/[0-9]/.test(password)) {
      score += 1;
    }

    if(/[^A-Za-z0-9]/.test(password)) {
      score += 1;
    }

    return score;
  }

  function renderPasswordStrength() {
    const password =
      $("forcePasswordNew")
        ?.value
        || "";

    const score =
      passwordScore(
        password
      );

    const element =
      $("forcePasswordStrength");

    if(!element) return;

    const label =
      score <= 2
        ? "ควรเพิ่มความซับซ้อน"
        : score <= 4
          ? "รหัสผ่านระดับดี"
          : "รหัสผ่านแข็งแรง";

    element.className =
      `account-password-strength score-${score}`;

    element.innerHTML = `
      <div class="account-password-strength-bars">
        ${[1,2,3,4,5]
          .map(index =>
            `<i class="${index <= score ? "active" : ""}"></i>`
          )
          .join("")}
      </div>
      <span>${safe(label)}</span>
    `;
  }

  function openForcedPasswordChange(
    mode = "FIRST_LOGIN"
  ) {
    state.passwordMode =
      mode;

    if($("forcePasswordTitle")) {
      $("forcePasswordTitle").textContent =
        mode === "RECOVERY"
          ? "ตั้งรหัสผ่านใหม่"
          : "เปลี่ยนรหัสผ่านครั้งแรก";
    }

    if($("forcePasswordSubtitle")) {
      $("forcePasswordSubtitle").textContent =
        mode === "RECOVERY"
          ? "กำหนดรหัสผ่านใหม่สำหรับบัญชีของคุณ"
          : "เพื่อความปลอดภัย กรุณาเปลี่ยนรหัสผ่านก่อนเข้าใช้งานระบบ";
    }

    if($("forcePasswordNew")) {
      $("forcePasswordNew").value =
        "";
    }

    if($("forcePasswordConfirm")) {
      $("forcePasswordConfirm").value =
        "";
    }

    resetPasswordVisibility();

    renderPasswordStrength();

    $("forcePasswordModal")
      ?.classList.remove("hidden");

    setTimeout(
      () =>
        $("forcePasswordNew")
          ?.focus(),
      80
    );
  }

  async function savePasswordChange() {
    const password =
      $("forcePasswordNew")
        ?.value
        || "";

    const confirm =
      $("forcePasswordConfirm")
        ?.value
        || "";

    if(password.length < 10) {
      return A()?.toast?.(
        "รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร",
        "error"
      );
    }

    if(password !== confirm) {
      return A()?.toast?.(
        "ยืนยันรหัสผ่านไม่ตรงกัน",
        "error"
      );
    }

    if(
      passwordScore(password)
      < 3
    ) {
      return A()?.toast?.(
        "กรุณาเพิ่มความซับซ้อนของรหัสผ่าน",
        "error"
      );
    }

    try {
      A()?.showLoading?.(
        "กำลังเปลี่ยนรหัสผ่าน..."
      );

      const client =
        accountSupabaseClient();

      const {
        error
      } =
        await client.auth.updateUser({
          password
        });

      if(error) {
        throw error;
      }

      try {
        await rpc(
          "ta_complete_password_change_v6106"
        );
      } catch(markError) {
        // Recovery can be used by a valid Auth user that has no profile.
        if(
          state.passwordMode
          !== "RECOVERY"
        ) {
          throw markError;
        }
      }

      if(
        A()?.state?.profile
      ) {
        A().state.profile
          .must_change_password =
          false;
      }

      $("forcePasswordModal")
        ?.classList.add("hidden");

      A()?.toast?.(
        "เปลี่ยนรหัสผ่านเรียบร้อย",
        "success"
      );

      const cleanUrl =
        location.origin
        + location.pathname;

      location.replace(
        cleanUrl
      );
    } catch(error) {
      A()?.toast?.(
        A()?.humanError?.(error)
        || error.message,
        "error"
      );
    } finally {
      A()?.hideLoading?.();
    }
  }

  async function sendForgotPassword() {
    const email =
      $("forgotPasswordEmail")
        ?.value
        .trim()
        .toLowerCase();

    if(!email) {
      return A()?.toast?.(
        "กรุณาระบุ Email",
        "error"
      );
    }

    try {
      A()?.showLoading?.(
        "กำลังส่ง Email ตั้งรหัสผ่านใหม่..."
      );

      const client =
        accountSupabaseClient();

      const redirectUrl =
        new URL(
          location.origin
          + location.pathname
        );

      redirectUrl.searchParams.set(
        "auth_flow",
        "recovery"
      );

      const redirectTo =
        redirectUrl.href;

      const {
        error
      } =
        await client.auth
          .resetPasswordForEmail(
            email,
            {
              redirectTo
            }
          );

      if(error) {
        throw error;
      }

      hideAccountModal(
        "forgotPasswordModal"
      );

      A()?.toast?.(
        "ส่ง Email พร้อมรหัส OTP สำหรับตั้งรหัสผ่านใหม่แล้ว กรุณาตรวจสอบ Inbox",
        "success"
      );
    } catch(error) {
      A()?.toast?.(
        A()?.humanError?.(error)
        || error.message,
        "error"
      );
    } finally {
      A()?.hideLoading?.();
    }
  }

  async function resendInvite(
    email
  ) {
    if(!email) return;

    try {
      A()?.showLoading?.(
        "กำลังส่ง Invite ใหม่..."
      );

      const client =
        A()?.state?.client;

      const {
        data,
        error
      } =
        await client.functions.invoke(
          "admin-users",
          {
            body: {
              action:
                "resend_invite",

              email:
                email
            }
          }
        );

      if(error) {
        throw error;
      }

      if(
        data?.success
        === false
      ) {
        throw new Error(
          data.error
          || "RESEND_INVITE_FAILED"
        );
      }

      A()?.toast?.(
        "ส่ง Invite ใหม่เรียบร้อย",
        "success"
      );

      await load();
    } catch(error) {
      const message =
        String(
          error?.message
          || ""
        );

      const friendly =
        message.includes(
          "INVITE_ALREADY_ACCEPTED"
        )
          ? "User ตอบรับ Invite แล้ว ไม่ต้องส่ง Invite ใหม่"
          : (
              A()?.humanError?.(error)
              || error.message
            );

      A()?.toast?.(
        friendly,
        "error"
      );
    } finally {
      A()?.hideLoading?.();
    }
  }

  async function sendPasswordSetupLink(
    email
  ) {
    if(!email) return;

    const remaining =
      passwordSetupRemainingSeconds(
        email
      );

    if(
      remaining > 0
    ) {
      startPasswordSetupCooldown(
        email
      );

      return A()?.toast?.(
        `ระบบรับคำขอส่ง OTP แล้ว กรุณารออีก ${remaining} วินาทีก่อนส่งซ้ำ`,
        "info"
      );
    }

    try {
      A()?.showLoading?.(
        "กำลังส่งลิงก์ตั้งรหัสผ่าน..."
      );

      const client =
        accountSupabaseClient();

      const {
        data,
        error
      } =
        await client.functions.invoke(
          "admin-users",
          {
            body: {
              action:
                "send_password_setup",

              email:
                email
            }
          }
        );

      if(error) {
        throw error;
      }

      if(
        data?.success === false
      ) {
        throw new Error(
          data.error
          || "PASSWORD_SETUP_EMAIL_FAILED"
        );
      }

      markPasswordSetupSent(
        email
      );

      startPasswordSetupCooldown(
        email
      );

      A()?.toast?.(
        "Supabase รับคำขอส่ง OTP แล้ว กรุณารอ Email และไม่ต้องกดส่งซ้ำภายใน 60 วินาที",
        "success"
      );
    } catch(error) {
      const raw =
        String(
          error?.message
          || ""
        );

      const friendly =
        raw.includes(
          "PASSWORD_SETUP_REQUIRES_CONFIRMED_USER"
        )
          ? "User ยังไม่ตอบรับ Invite กรุณาส่ง Invite ก่อน"
          : raw.includes(
              "PASSWORD_RESET_RATE_LIMIT"
            )
            ? "ส่งลิงก์ซ้ำเร็วเกินไป กรุณารอสักครู่แล้วลองใหม่"
            : (
                A()?.humanError?.(error)
                || error.message
              );

      A()?.toast?.(
        friendly,
        "error"
      );
    } finally {
      A()?.hideLoading?.();
    }
  }

  function recoveryOtpParams() {
    const params =
      new URLSearchParams(
        location.search
      );

    return {
      authFlow:
        String(
          params.get("auth_flow")
          || ""
        ).toLowerCase(),

      email:
        String(
          params.get("email")
          || ""
        ).trim()
    };
  }

  function showRecoveryOtpIfNeeded() {
    const {
      authFlow,
      email
    } =
      recoveryOtpParams();

    if(
      authFlow
      !== "recovery_otp"
    ) {
      return;
    }

    if($("recoveryOtpEmail")) {
      $("recoveryOtpEmail").value =
        email;
    }

    if($("recoveryOtpCode")) {
      $("recoveryOtpCode").value =
        "";
    }

    if($("recoveryOtpError")) {
      $("recoveryOtpError")
        .classList.add(
          "hidden"
        );

      $("recoveryOtpError")
        .textContent =
          "";
    }

    $("recoveryOtpModal")
      ?.classList.remove(
        "hidden"
      );

    setTimeout(
      () => {
        if(email) {
          $("recoveryOtpCode")
            ?.focus();
        } else {
          $("recoveryOtpEmail")
            ?.focus();
        }
      },
      80
    );
  }

  async function verifyRecoveryOtp() {
    const email =
      String(
        $("recoveryOtpEmail")
          ?.value
        || ""
      )
        .trim()
        .toLowerCase();

    const token =
      String(
        $("recoveryOtpCode")
          ?.value
        || ""
      )
        .trim()
        .replace(
          /\s+/g,
          ""
        );

    if(!email) {
      return A()?.toast?.(
        "กรุณาระบุ Email",
        "error"
      );
    }

    if(!token) {
      return A()?.toast?.(
        "กรุณาระบุรหัส OTP",
        "error"
      );
    }

    try {
      A()?.showLoading?.(
        "กำลังตรวจสอบ OTP..."
      );

      const client =
        accountSupabaseClient();

      const {
        data,
        error
      } =
        await client.auth.verifyOtp({
          email,
          token,
          type:
            "recovery"
        });

      if(error) {
        throw error;
      }

      if(
        !data?.session
        && !data?.user
      ) {
        throw new Error(
          "RECOVERY_SESSION_NOT_CREATED"
        );
      }

      if(
        A()?.state
      ) {
        A().state.session =
          data?.session
          || A().state.session
          || null;

        A().state.user =
          data?.user
          || data?.session?.user
          || A().state.user
          || null;
      }

      $("recoveryOtpModal")
        ?.classList.add(
          "hidden"
        );

      A()?.toast?.(
        "ยืนยัน OTP เรียบร้อย กรุณาตั้งรหัสผ่านใหม่",
        "success"
      );

      openForcedPasswordChange(
        "RECOVERY"
      );
    } catch(error) {
      const code =
        String(
          error?.code
          || ""
        );

      const rawMessage =
        String(
          error?.message
          || error
          || "OTP ไม่ถูกต้องหรือหมดอายุ"
        );

      const message =
        rawMessage.includes(
          "SUPABASE_CLIENT_NOT_READY"
        )
          ? "ไม่สามารถเชื่อมต่อ Supabase ได้ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง"
          : rawMessage;

      const element =
        $("recoveryOtpError");

      if(element) {
        element.innerHTML = `
          <strong>ยืนยัน OTP ไม่สำเร็จ</strong>
          <small>
            ${safe(
              code
                ? `${code} • ${message}`
                : message
            )}
          </small>
          <em>
            หากรหัสหมดอายุ ให้ส่งลิงก์ตั้งรหัสผ่านใหม่
          </em>
        `;

        element.classList.remove(
          "hidden"
        );
      }

      A()?.toast?.(
        message,
        "error"
      );
    } finally {
      A()?.hideLoading?.();
    }
  }

  function authLinkParams() {
    const params =
      new URLSearchParams(
        location.search
      );

    const type =
      String(
        params.get("type")
        || ""
      ).toLowerCase();

    const authFlow =
      String(
        params.get("auth_flow")
        || ""
      ).toLowerCase();

    const confirmationUrl =
      params.get(
        "confirmation_url"
      ) || "";

    const tokenHash =
      params.get(
        "token_hash"
      ) || "";

    return {
      type,
      authFlow,
      confirmationUrl,
      tokenHash
    };
  }

  function inviteParams() {
    return authLinkParams();
  }

  function authRedirectError() {
    const query =
      new URLSearchParams(
        location.search
      );

    const hash =
      new URLSearchParams(
        String(
          location.hash
          || ""
        ).replace(
          /^#/,
          ""
        )
      );

    const errorCode =
      hash.get("error_code")
      || query.get("error_code")
      || "";

    const errorDescription =
      hash.get("error_description")
      || query.get("error_description")
      || "";

    const errorName =
      hash.get("error")
      || query.get("error")
      || "";

    return {
      errorCode,
      errorDescription:
        errorDescription
          ? decodeURIComponent(
              errorDescription
                .replace(/\+/g," ")
            )
          : "",
      errorName
    };
  }

  function validConfirmationUrl(
    rawUrl
  ) {
    if(!rawUrl) return null;

    try {
      const target =
        new URL(
          rawUrl
        );

      const clientUrl =
        String(
          A()?.state?.client
            ?.supabaseUrl
          || ""
        );

      const projectUrl =
        clientUrl
          ? new URL(
              clientUrl
            )
          : null;

      if(
        target.protocol !== "https:"
      ) {
        return null;
      }

      if(
        projectUrl
        && target.hostname
          !== projectUrl.hostname
      ) {
        return null;
      }

      if(
        !target.pathname.startsWith(
          "/auth/v1/verify"
        )
      ) {
        return null;
      }

      return target.href;
    } catch {
      return null;
    }
  }

  function showInviteAcceptIfNeeded() {
    const {
      type,
      authFlow,
      confirmationUrl,
      tokenHash
    } =
      authLinkParams();

    const authError =
      authRedirectError();

    const flow =
      authFlow
      || type;

    if(
      authError.errorCode
      || authError.errorName
    ) {
      const message =
        authError.errorDescription
        || `Supabase Auth Error: ${authError.errorCode || authError.errorName}`;

      if(
        flow === "recovery"
      ) {
        const element =
          $("recoveryConfirmError");

        if(element) {
          element.textContent =
            message;

          element.classList.remove(
            "hidden"
          );
        }

        $("recoveryConfirmBtn")
          ?.classList.add(
            "hidden"
          );

        $("recoveryConfirmModal")
          ?.classList.remove(
            "hidden"
          );

        return;
      }

      if(
        flow === "invite"
      ) {
        const element =
          $("inviteAcceptError");

        if(element) {
          element.textContent =
            message;

          element.classList.remove(
            "hidden"
          );
        }

        $("inviteAcceptBtn")
          ?.classList.add(
            "hidden"
          );

        $("inviteAcceptModal")
          ?.classList.remove(
            "hidden"
          );

        return;
      }

      A()?.toast?.(
        message,
        "error"
      );

      return;
    }

    if(
      type === "recovery"
      && confirmationUrl
    ) {
      if($("recoveryConfirmError")) {
        $("recoveryConfirmError")
          .classList.add(
            "hidden"
          );

        $("recoveryConfirmError")
          .textContent =
            "";
      }

      $("recoveryConfirmBtn")
        ?.classList.remove(
          "hidden"
        );

      $("recoveryConfirmModal")
        ?.classList.remove(
          "hidden"
        );

      return;
    }

    if(
      type !== "invite"
      || (
        !confirmationUrl
        && !tokenHash
      )
    ) {
      return;
    }

    if($("inviteAcceptError")) {
      $("inviteAcceptError")
        .classList.add(
          "hidden"
        );

      $("inviteAcceptError")
        .textContent =
          "";
    }

    $("inviteAcceptBtn")
      ?.classList.remove(
        "hidden"
      );

    $("inviteAcceptModal")
      ?.classList.remove(
        "hidden"
      );
  }

  async function acceptRecovery() {
    const {
      type,
      confirmationUrl
    } =
      authLinkParams();

    if(
      type !== "recovery"
      || !confirmationUrl
    ) {
      return A()?.toast?.(
        "ไม่พบข้อมูลลิงก์ตั้งรหัสผ่าน",
        "error"
      );
    }

    try {
      A()?.showLoading?.(
        "กำลังยืนยันลิงก์ตั้งรหัสผ่าน..."
      );

      const safeUrl =
        validConfirmationUrl(
          confirmationUrl
        );

      if(!safeUrl) {
        throw new Error(
          "INVALID_RECOVERY_CONFIRMATION_URL"
        );
      }

      location.assign(
        safeUrl
      );
    } catch(error) {
      const message =
        String(
          error?.message
          || error
          || ""
        );

      const element =
        $("recoveryConfirmError");

      if(element) {
        element.innerHTML = `
          <strong>เปิดลิงก์ตั้งรหัสผ่านไม่สำเร็จ</strong>
          <small>${safe(message)}</small>
          <em>
            กรุณาให้ HR Admin ส่งลิงก์ตั้งรหัสผ่านใหม่
          </em>
        `;

        element.classList.remove(
          "hidden"
        );
      }

      A()?.toast?.(
        message
        || "ลิงก์ตั้งรหัสผ่านไม่ถูกต้อง",
        "error"
      );
    } finally {
      A()?.hideLoading?.();
    }
  }

  async function acceptInvite() {
    const {
      type,
      confirmationUrl,
      tokenHash
    } =
      inviteParams();

    if(
      type !== "invite"
    ) {
      return A()?.toast?.(
        "ไม่พบข้อมูล Invite",
        "error"
      );
    }

    try {
      A()?.showLoading?.(
        "กำลังตอบรับคำเชิญ..."
      );

      /*
       * V6.10.9 primary flow:
       * Let Supabase Auth confirmation endpoint validate the invite.
       * This follows Supabase's prefetch-safe pattern:
       * Email -> app confirmation screen -> actual ConfirmationURL.
       */
      if(confirmationUrl) {
        const safeUrl =
          validConfirmationUrl(
            confirmationUrl
          );

        if(!safeUrl) {
          throw new Error(
            "INVALID_CONFIRMATION_URL"
          );
        }

        location.assign(
          safeUrl
        );

        return;
      }

      /*
       * Backward compatibility for V6.10.7 / V6.10.8 emails
       * that still contain token_hash directly.
       */
      if(!tokenHash) {
        throw new Error(
          "INVITE_TOKEN_NOT_FOUND"
        );
      }

      const client =
        A()?.state?.client;

      const {
        data,
        error
      } =
        await client.auth.verifyOtp({
          token_hash:
            tokenHash,

          type:
            "invite"
        });

      if(error) {
        throw error;
      }

      if(
        !data?.session
        && !data?.user
      ) {
        throw new Error(
          "INVITE_SESSION_NOT_CREATED"
        );
      }

      const cleanUrl =
        location.origin
        + location.pathname;

      location.replace(
        cleanUrl
      );
    } catch(error) {
      const code =
        String(
          error?.code
          || ""
        );

      const message =
        String(
          error?.message
          || error
          || ""
        );

      const element =
        $("inviteAcceptError");

      if(element) {
        element.innerHTML = `
          <strong>ตอบรับ Invite ไม่สำเร็จ</strong>
          <small>
            ${safe(
              code
                ? `${code} • ${message}`
                : message
            )}
          </small>
          <em>
            กรุณากดส่ง Invite ใหม่หลังอัปเดต Email Template เป็น V6.10.9
          </em>
        `;

        element.classList.remove(
          "hidden"
        );
      }

      A()?.toast?.(
        message
        || "Invite ไม่ถูกต้องหรือหมดอายุ",
        "error"
      );
    } finally {
      A()?.hideLoading?.();
    }
  }

  function resetFilters() {
    if($("accountSearch")) {
      $("accountSearch").value = "";
    }

    if($("accountRoleFilter")) {
      $("accountRoleFilter").value = "";
    }

    if($("accountStatusFilter")) {
      $("accountStatusFilter").value = "";
    }

    load();
  }

  function bind() {
    $("accountCreateBtn")
      ?.addEventListener(
        "click",
        () => {
          openCreate()
            .catch(error => {
              A()?.toast?.(
                A()?.humanError?.(error)
                || error?.message
                || "เปิดหน้าสร้างบัญชีไม่สำเร็จ",
                "error"
              );
            });
        }
      );

    $("accountRefreshBtn")
      ?.addEventListener(
        "click",
        load
      );

    $("accountSearchBtn")
      ?.addEventListener(
        "click",
        load
      );

    $("accountResetFilterBtn")
      ?.addEventListener(
        "click",
        resetFilters
      );

    $("accountSearch")
      ?.addEventListener(
        "keydown",
        event => {
          if(event.key === "Enter") {
            event.preventDefault();
            load();
          }
        }
      );

    $("accountEmployeeSearch")
      ?.addEventListener(
        "input",
        event =>
          renderCandidateResults(
            event.target.value
          )
      );

    $("accountCreateSaveBtn")
      ?.addEventListener(
        "click",
        createAccount
      );

    $("accountEditSaveBtn")
      ?.addEventListener(
        "click",
        saveEdit
      );

    $("forcePasswordNew")
      ?.addEventListener(
        "input",
        renderPasswordStrength
      );

    $("forcePasswordNewToggle")
      ?.addEventListener(
        "click",
        () => {
          togglePasswordVisibility(
            "forcePasswordNew",
            "forcePasswordNewToggle"
          );
        }
      );

    $("forcePasswordConfirmToggle")
      ?.addEventListener(
        "click",
        () => {
          togglePasswordVisibility(
            "forcePasswordConfirm",
            "forcePasswordConfirmToggle"
          );
        }
      );

    $("forcePasswordSaveBtn")
      ?.addEventListener(
        "click",
        savePasswordChange
      );

    $("forgotPasswordBtn")
      ?.addEventListener(
        "click",
        () => {
          if($("forgotPasswordEmail")) {
            $("forgotPasswordEmail").value =
              $("loginEmail")
                ?.value
                .trim()
              || "";
          }

          showAccountModal(
            "forgotPasswordModal"
          );
        }
      );

    $("forgotPasswordSendBtn")
      ?.addEventListener(
        "click",
        sendForgotPassword
      );

    document
      .querySelectorAll(
        '[data-close-modal="accountCreateModal"],'
        + '[data-close-modal="accountEditModal"],'
        + '[data-close-modal="forgotPasswordModal"]'
      )
      .forEach(button => {
        button.addEventListener(
          "click",
          () => {
            hideAccountModal(
              button.dataset.closeModal
            );
          }
        );
      });

    $("recoveryOtpVerifyBtn")
      ?.addEventListener(
        "click",
        verifyRecoveryOtp
      );

    $("recoveryOtpCode")
      ?.addEventListener(
        "keydown",
        event => {
          if(event.key === "Enter") {
            event.preventDefault();
            verifyRecoveryOtp();
          }
        }
      );

    $("recoveryConfirmBtn")
      ?.addEventListener(
        "click",
        acceptRecovery
      );

    $("inviteAcceptBtn")
      ?.addEventListener(
        "click",
        acceptInvite
      );

    document.addEventListener(
      "click",
      event => {
        const employeeButton =
          event.target.closest(
            "[data-account-employee]"
          );

        if(employeeButton) {
          selectEmployee(
            employeeButton.dataset
              .accountEmployee
          );
          return;
        }

        const resendButton =
          event.target.closest(
            "[data-account-resend]"
          );

        if(resendButton) {
          resendInvite(
            resendButton.dataset
              .accountResend
          );
          return;
        }

        const passwordLinkButton =
          event.target.closest(
            "[data-account-password-link]"
          );

        if(passwordLinkButton) {
          sendPasswordSetupLink(
            passwordLinkButton.dataset
              .accountPasswordLink
          );
          return;
        }

        const editButton =
          event.target.closest(
            "[data-account-edit]"
          );

        if(editButton) {
          openEdit(
            editButton.dataset
              .accountEdit
          );
          return;
        }

        if(
          !event.target.closest(
            ".account-employee-search-wrap"
          )
        ) {
          $("accountEmployeeSearchResults")
            ?.classList.add("hidden");
        }
      }
    );

    document
      .querySelector(
        '[data-page="admin-accounts"]'
      )
      ?.addEventListener(
        "click",
        () => {
          const accountPage =
            $("page-admin-accounts");

          if (accountPage) {
            document
              .querySelectorAll(
                ".page"
              )
              .forEach(page => {
                page.classList.toggle(
                  "active",
                  page === accountPage
                );
              });
          }

          setTimeout(
            load,
            0
          );
        }
      );

    setTimeout(
      () => {
        showRecoveryOtpIfNeeded();
        showInviteAcceptIfNeeded();
      },
      80
    );
  }

  window.TimeClockUserAccounts = {
    load,
    openForcedPasswordChange
  };

  if(
    document.readyState
    === "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      bind
    );
  } else {
    bind();
  }
})();

(function(){
  const defaults = {
    url: "https://lryojaccbbbgdbpjstld.supabase.co",
    key: "sb_publishable_xxYLeNtxgeWoE0o5GNOwDg_QXfiFy_Y"
  };

  function fillDefaultSupabaseFields() {
    const urlInput =
      document.getElementById("configSupabaseUrl")
      || document.getElementById("supabaseUrl")
      || document.getElementById("settingsSupabaseUrl");

    const keyInput =
      document.getElementById("configSupabaseKey")
      || document.getElementById("supabaseKey")
      || document.getElementById("settingsSupabaseKey");

    if (urlInput && !String(urlInput.value || "").trim()) {
      urlInput.value = defaults.url;
    }

    if (keyInput && !String(keyInput.value || "").trim()) {
      keyInput.value = defaults.key;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener(
      "DOMContentLoaded",
      fillDefaultSupabaseFields
    );
  } else {
    fillDefaultSupabaseFields();
  }
})();
