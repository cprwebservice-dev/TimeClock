
/* ===== js/config.js ===== */
'use strict';

/**
 * Public frontend configuration only.
 * Never place a Supabase service_role key in this file.
 */
window.TIME_CLOCK_CONFIG = Object.freeze({
  appName: 'Time-Clock Management',
  version: '5.6.3',
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

    let response = await client.rpc("ta_assign_shift_single", full);
    if (!response.error) return response.data;
    if (!missingFunction(response.error)) throw response.error;

    const withoutNote = { ...full };
    delete withoutNote.p_note;
    response = await client.rpc("ta_assign_shift_single", withoutNote);
    if (!response.error) return response.data;
    if (!missingFunction(response.error)) throw response.error;

    return directAssign(client, {
      emp_code: full.p_emp_code,
      work_date: full.p_work_date,
      shift_code: full.p_shift_code,
      note: full.p_note,
      confirm_now: full.p_confirm_now
    }, app);
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

    const response = await client.rpc("ta_assign_shifts_bulk", {
      p_rows: cleanRows,
      p_change_reason: changeReason || "บันทึกกะแบบหลายรายการจากหน้าเว็บ",
      p_confirm_now: Boolean(confirmNow)
    });
    if (!response.error) return response.data;
    if (!missingFunction(response.error)) throw response.error;

    // Fast direct fallback for databases that have not installed the compatibility RPC yet.
    const toDelete = cleanRows.filter(row => !row.shift_code);
    const toSave = cleanRows.filter(row => row.shift_code);
    const actor = currentEmail(app);

    if (toSave.length) {
      const payload = toSave.map(row => ({
        emp_code: row.emp_code,
        work_date: row.work_date,
        shift_code: row.shift_code,
        source_type: "manual",
        note: row.note,
        is_confirmed: Boolean(confirmNow),
        confirmed_at: confirmNow ? new Date().toISOString() : null,
        confirmed_by: confirmNow ? actor : null,
        updated_by: actor,
        updated_at: new Date().toISOString()
      }));
      let result = await client.from("shift_calendar").upsert(payload, { onConflict: "work_date,emp_code" });
      if (result.error && missingColumn(result.error)) {
        const minimum = payload.map(({ emp_code, work_date, shift_code, source_type, note }) => ({ emp_code, work_date, shift_code, source_type, note }));
        result = await client.from("shift_calendar").upsert(minimum, { onConflict: "work_date,emp_code" });
      }
      if (result.error) throw result.error;
    }

    for (const row of toDelete) {
      const { error } = await client.from("shift_calendar").delete().eq("emp_code", row.emp_code).eq("work_date", row.work_date);
      if (error) throw error;
    }
    return { saved_rows: toSave.length, deleted_rows: toDelete.length, fallback: true };
  }

  async function deleteBulk(app, empCodes, startDate, endDate, changeReason) {
    const client = app?.state?.client;
    if (!client) throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");
    const response = await client.rpc("ta_delete_shift_assignments_bulk", {
      p_emp_codes: empCodes,
      p_start_date: startDate,
      p_end_date: endDate,
      p_change_reason: changeReason || "ลบกะจากหน้าเว็บ"
    });
    if (!response.error) return response.data;
    if (!missingFunction(response.error)) throw response.error;

    let query = client.from("shift_calendar").delete().gte("work_date", startDate).lte("work_date", endDate);
    if (Array.isArray(empCodes) && empCodes.length) query = query.in("emp_code", empCodes);
    const { error } = await query;
    if (error) throw error;
    return { deleted_rows: null, fallback: true };
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
        .select("EmployeeId,full_name,position_name,department,pc,area,zone,sub_area,car_team,manager_department,manager_division,start_date,resign_date")
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


  async function getMonthlySchedule(app, params) {
    const client = app?.state?.client;
    if (!client) throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");

    const exact = {
      p_month: params.p_month,
      p_zone: params.p_zone ?? null,
      p_department: params.p_department ?? null,
      p_emp_codes: params.p_emp_codes ?? null,
      p_schedule_statuses: params.p_schedule_statuses ?? null
    };

    let response = await withTimeout(
      client.rpc("ta_get_monthly_schedule_v563", exact),
      30000,
      "โหลดปฏิทินกะล่วงหน้า"
    );
    if (response.error) {
      const v563Error = response.error;
      response = await withTimeout(
        client.rpc("ta_get_monthly_schedule", exact),
        30000,
        "โหลดปฏิทินกะ"
      );
      if (response.error) throw (missingFunction(v563Error) ? response.error : v563Error);
    }

    let rows = Array.isArray(response.data) ? response.data.map(row => ({ ...row })) : [];
    const monthStart = String(params.p_month || "").slice(0, 10);
    if (!monthStart) return rows;
    const start = new Date(`${monthStart}T00:00:00`);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;

    // Ensure every active employee has a writable cell for every day of the month,
    // including future dates, weekly off days and public holidays.
    rows = await ensureMonthlyMatrix(client, rows, exact, monthStart, endDate);

    // Overlay the manual assignment table on top of the RPC result.
    // This protects the UI from older ta_get_monthly_schedule versions that
    // save shift_calendar correctly but do not return assigned_shift_code.
    let calendarResult = await client
      .from("shift_calendar")
      .select("work_date,emp_code,shift_code,is_confirmed,note,source_type,updated_at")
      .gte("work_date", monthStart)
      .lte("work_date", endDate);

    if (calendarResult.error && missingColumn(calendarResult.error)) {
      calendarResult = await client
        .from("shift_calendar")
        .select("work_date,emp_code,shift_code")
        .gte("work_date", monthStart)
        .lte("work_date", endDate);
    }

    // If RLS blocks the direct overlay, keep the RPC result rather than failing the whole page.
    if (calendarResult.error) return rows;

    const assignmentMap = new Map();
    for (const item of calendarResult.data || []) {
      const key = `${String(item.emp_code || "").trim()}|${String(item.work_date || "").slice(0, 10)}`;
      assignmentMap.set(key, item);
    }

    const metaByEmp = new Map();
    for (const row of rows) {
      const emp = String(row.emp_code || "").trim();
      if (emp && !metaByEmp.has(emp)) metaByEmp.set(emp, row);
      const key = `${emp}|${String(row.work_date || "").slice(0, 10)}`;
      const assigned = assignmentMap.get(key);
      const assignedCode = assigned?.shift_code || row.assigned_shift_code || null;
      const effectiveCode = assignedCode || row.effective_shift_code || row.auto_shift_code || row.shift_code || row.suggested_shift_code || null;
      row.assigned_shift_code = assignedCode;
      row.effective_shift_code = effectiveCode;
      row.is_confirmed = assigned ? Boolean(assigned.is_confirmed) : Boolean(row.is_confirmed);
      row.schedule_status = assignedCode
        ? (row.is_confirmed ? "CONFIRMED" : "ASSIGNED")
        : (row.schedule_status || (effectiveCode ? "AUTO" : "NEED_REVIEW"));
      if (assigned?.note != null) row.schedule_note = assigned.note;
      if (assigned?.source_type != null) row.schedule_source = assigned.source_type;
      const effectiveMaster = app?.state?.filters?.shifts?.find(s => String(s.shift_code || "").toUpperCase() === String(effectiveCode || "").toUpperCase());
      if (effectiveMaster) {
        row.shift_start_time = effectiveMaster.start_time || row.shift_start_time || null;
        row.shift_end_time = effectiveMaster.end_time || row.shift_end_time || null;
      }
      assignmentMap.delete(key);
    }

    // Preserve a saved assignment even when an older RPC omitted that employee/date row.
    for (const [key, assigned] of assignmentMap) {
      const [empCode, workDate] = key.split("|");
      const meta = metaByEmp.get(empCode) || {};
      rows.push({
        ...meta,
        work_date: workDate,
        emp_code: empCode,
        assigned_shift_code: assigned.shift_code,
        effective_shift_code: assigned.shift_code,
        is_confirmed: Boolean(assigned.is_confirmed),
        schedule_status: assigned.is_confirmed ? "CONFIRMED" : "ASSIGNED",
        schedule_note: assigned.note ?? null,
        schedule_source: assigned.source_type ?? "manual"
      });
    }

    rows.sort((a, b) =>
      String(a.emp_code || "").localeCompare(String(b.emp_code || ""), "th") ||
      String(a.work_date || "").localeCompare(String(b.work_date || ""))
    );
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
      let response = await withTimeout(client.rpc("ta_get_review_queue_v600", exact), 30000, "โหลดรายการรอตรวจสอบ V6");
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
    const response = await client.rpc("ta_upsert_shift_master", rpcArgs);
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
    deleteBulk,
    getReview,
    upsertShiftMaster,
    missingFunction
  });
})();

;

/* ===== js/core/app-core.js ===== */
"use strict";

    const APP_CONFIG_KEY = "ta_supabase_config_v1";
    const state = {
      client: null,
      session: null,
      user: null,
      profile: null,
      filters: { zones: [], departments: [], employees: [], shifts: [], attendance: { areas: [], sub_areas: [], departments: [] } },
      dashboard: null,
      attendance: [],
      schedule: [],
      review: [],
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
    const attendanceShiftCode = r => r?.effective_shift_code || r?.assigned_shift_code || r?.shift_code || r?.auto_shift_code || null;
    function attendanceShiftTime(r, side) {
      const code = attendanceShiftCode(r);
      const master = state.filters.shifts.find(s => String(s.shift_code || "").toUpperCase() === String(code || "").toUpperCase()) || {};
      const start = r?.effective_shift_start_time || r?.assigned_shift_start_time || r?.shift_start_time || master.start_time;
      const end = r?.effective_shift_end_time || r?.assigned_shift_end_time || r?.shift_end_time || master.end_time;
      return side === "start" ? start : end;
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
    function getConfig() { try { return JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || "null"); } catch { return null; } }
    function saveConfig(url, key) { localStorage.setItem(APP_CONFIG_KEY, JSON.stringify({ url: url.trim(), key: key.trim() })); }

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
        if (event === "SIGNED_OUT") showLogin();
      });
      return true;
    }

    async function boot() {
      setDefaultDates();
      bindEvents();
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
      ["dashStart","attStart","reviewStart"].forEach(id => setVal(id, start));
      ["dashEnd","attEnd","reviewEnd"].forEach(id => setVal(id, end));
      setVal("scheduleMonth", monthISO());
    }

    function showLogin() { $("appShell").classList.add("hidden"); $("loginScreen").classList.remove("hidden"); }
    function showApp() { $("loginScreen").classList.add("hidden"); $("appShell").classList.remove("hidden"); }

    async function enterApp() {
      showLoading("กำลังโหลดสิทธิ์ผู้ใช้งาน...");
      try {
        await loadProfile();
        applyProfile();
        showApp();
        await loadFilterOptions();
        await loadAttendanceFilterOptions(false);
        await loadDashboard();
      } catch (err) {
        toast(humanError(err), "error");
        showLogin();
      } finally { hideLoading(); }
    }

    async function loadProfile() {
      const { data, error } = await state.client.from("ta_user_profiles").select("*").eq("user_id", state.user.id).maybeSingle();
      if (error) throw error;
      state.profile = data || { user_id: state.user.id, email: state.user.email, display_name: state.user.email, role: "VIEWER", is_active: false };
      if (!state.profile.is_active) throw new Error("บัญชีนี้ยังไม่ได้เปิดใช้งาน กรุณาติดต่อ HR Admin");
    }

    function applyProfile() {
      const p = state.profile;
      p._realRole = p._realRole || p.role || "VIEWER";
      const ui = window.TimeClockSettings?.getRuntimeSettings?.() || {};
      const canSimulate = p._realRole === "HR_ADMIN" && ui.developerMode === true;
      p.role = canSimulate ? (ui.viewAsRole || p._realRole) : p._realRole;
      setText("sidebarUserName", p.display_name || p.email || state.user.email);
      setText("sidebarUserEmail", p.email || state.user.email);
      setText("roleBadge", p.role || "VIEWER");
      $("roleBadge").title = p.role !== p._realRole ? `สิทธิ์จริง ${p._realRole} • กำลังจำลอง ${p.role}` : `สิทธิ์จริง ${p._realRole}`;
      $("adminNavGroup").classList.toggle("hidden", p.role !== "HR_ADMIN" && p._realRole !== "HR_ADMIN");
      qsa("#adminNavGroup .nav-item:not(#systemSettingsNav)").forEach(el => el.classList.toggle("hidden", p.role !== "HR_ADMIN"));
      $("systemSettingsNav")?.classList.toggle("hidden", p._realRole !== "HR_ADMIN");
      window.TimeClockSettings?.syncProfile?.(p);
    }

    async function loadFilterOptions() {
      const { data, error } = await state.client.rpc("ta_get_filter_options", { p_start_date: val("dashStart"), p_end_date: val("dashEnd") });
      if (error) throw error;
      const f = data || {};
      state.filters = {
        zones: Array.isArray(f.zones) ? f.zones : [],
        departments: Array.isArray(f.departments) ? f.departments : [],
        employees: Array.isArray(f.employees) ? f.employees : [],
        shifts: Array.isArray(f.shifts) ? f.shifts : []
      };
      ["dashZone","scheduleZone","reportZone"].forEach(id => fillSelect(id, state.filters.zones, "ทุกพื้นที่"));
      ["dashDepartment","scheduleDepartment","reportDepartment"].forEach(id => fillSelect(id, state.filters.departments, "ทุกหน่วยงาน"));
      fillShiftSelect();
    }


    async function loadAttendanceFilterOptions(preserve = true) {
      const oldArea = preserve ? val("attZone") : "";
      const oldSubArea = preserve ? val("attSubArea") : "";
      const oldDepartment = preserve ? val("attDepartment") : "";
      try {
        const { data, error } = await state.client.rpc("ta_get_attendance_filter_options_v619", {
          p_start_date: val("attStart"),
          p_end_date: val("attEnd"),
          p_area: oldArea || null,
          p_sub_area: oldSubArea || null
        });
        if (error) throw error;
        const f = data || {};
        state.filters.attendance = {
          areas: Array.isArray(f.areas) ? f.areas : [],
          sub_areas: Array.isArray(f.sub_areas) ? f.sub_areas : [],
          departments: Array.isArray(f.departments) ? f.departments : []
        };
        fillSelect("attZone", state.filters.attendance.areas, "ทุกพื้นที่");
        fillSelect("attSubArea", state.filters.attendance.sub_areas, "ทุกพื้นที่ย่อย");
        fillSelect("attDepartment", state.filters.attendance.departments, "ทุกหน่วยงาน");
        if (oldArea && [...$("attZone").options].some(o => o.value === oldArea)) setVal("attZone", oldArea);
        if (oldSubArea && [...$("attSubArea").options].some(o => o.value === oldSubArea)) setVal("attSubArea", oldSubArea);
        if (oldDepartment && [...$("attDepartment").options].some(o => o.value === oldDepartment)) setVal("attDepartment", oldDepartment);
      } catch (err) {
        toast(`โหลดตัวกรองรายละเอียดเวลาไม่สำเร็จ: ${humanError(err)}`, "error");
      }
    }

    function fillSelect(id, values, allLabel) {
      const el = $(id); if (!el) return;
      const old = el.value;
      el.innerHTML = `<option value="">${safe(allLabel)}</option>` + values.map(v => `<option value="${safe(v)}">${safe(v)}</option>`).join("");
      if ([...el.options].some(o => o.value === old)) el.value = old;
    }
    function fillShiftSelect() {
      $("assignShiftCode").innerHTML = state.filters.shifts.filter(s => s.is_active !== false).map(s => `<option value="${safe(s.shift_code)}">${safe(s.shift_code)} — ${safe(s.shift_name || "")}</option>`).join("");
    }

    async function loadDashboard() {
      showLoading("กำลังโหลด Dashboard...");
      try {
        const { data, error } = await state.client.rpc("ta_get_dashboard_overview", {
          p_start_date: val("dashStart"), p_end_date: val("dashEnd"), p_zone: val("dashZone") || null, p_department: val("dashDepartment") || null
        });
        if (error) throw error;
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
        ["รอตรวจสอบ", d.need_review_rows, "กะหรือเวลาผิดปกติ", "⚠", "orange"]
      ];
      $("dashboardKpis").innerHTML = cards.map(c => `<div class="panel kpi-card ${c[4]}"><div class="kpi-label">${safe(c[0])}</div><div class="kpi-value">${formatNumber(c[1])}</div><div class="kpi-sub">${safe(c[2])}</div><div class="kpi-icon">${c[3]}</div></div>`).join("");
      const bars = [
        ["ลงเวลาครบ", d.complete_time_rows, "green"],
        ["ไม่พบเวลาเข้า", d.missing_in_rows, "orange"],
        ["ไม่พบเวลาออก", d.missing_out_rows, "orange"],
        ["ทำงานในวันหยุด", d.worked_on_offday_rows, "blue"],
        ["รอตรวจสอบกะ", d.need_review_rows, "red"]
      ];
      const max = Math.max(1, ...bars.map(x => Number(x[1]||0)));
      $("dashboardBars").innerHTML = bars.map(x => `<div class="status-row"><span>${safe(x[0])}</span><div class="bar-track"><div class="bar-fill ${x[2]}" style="width:${Math.max(2, Number(x[1]||0)/max*100)}%"></div></div><strong class="text-right">${formatNumber(x[1])}</strong></div>`).join("");
      $("dashboardQuick").innerHTML = [
        ["รายการรอตรวจสอบ", d.need_review_rows, "review"],
        ["ขาดเวลาเข้า", d.missing_in_rows, "review"],
        ["ขาดเวลาออก", d.missing_out_rows, "review"],
        ["กะที่ยืนยันแล้ว", d.confirmed_rows, "schedule"]
      ].map(x => `<button class="quick-item" data-go-page="${x[2]}"><div><strong>${safe(x[0])}</strong><span> คลิกเพื่อดูรายละเอียด</span></div><span class="badge badge-blue">${formatNumber(x[1])}</span></button>`).join("");
    }

    async function loadAttendance() {
      showLoading("กำลังโหลดรายละเอียดเวลา...");
      try {
        const statuses = val("attStatus") ? [val("attStatus")] : null;
        const globalSearch = (document.getElementById("attendanceGridSearch")?.value || "").trim();
        const exactEmpCode = /^\d{4,20}$/.test(globalSearch) ? globalSearch : null;
        const { data, error } = await state.client.rpc("ta_get_attendance_detail_v619", {
          p_start_date: val("attStart"),
          p_end_date: val("attEnd"),
          p_area: val("attZone") || null,
          p_sub_area: val("attSubArea") || null,
          p_department: val("attDepartment") || null,
          p_emp_codes: exactEmpCode ? [exactEmpCode] : null,
          p_attendance_statuses: statuses,
          p_schedule_statuses: null,
          p_limit: exactEmpCode ? 20000 : 5000
        });
        if (error) throw error;
        state.attendance = (data || []).sort((a,b) => String(b.work_date || "").localeCompare(String(a.work_date || "")) || String(a.emp_code || "").localeCompare(String(b.emp_code || "")));
        state.attendanceServerFilter = exactEmpCode;
        renderAttendance();
        document.dispatchEvent(new CustomEvent("timeclock:attendance-loaded", {
          detail: { count: state.attendance.length, empCode: exactEmpCode, reachedLimit: state.attendance.length >= 1000 }
        }));
      } catch (err) { toast(humanError(err), "error"); }
      finally { hideLoading(); }
    }

    function renderAttendance() {
      setText("attendanceCount", `${formatNumber(state.attendance.length)} รายการ`);
      $("attendanceBody").innerHTML = state.attendance.length ? state.attendance.map(r => {
        const code = attendanceShiftCode(r);
        return `<tr data-attendance-row="1" data-emp="${safe(r.emp_code)}" data-date="${safe(String(r.work_date).slice(0,10))}"><td class="nowrap">${formatDate(r.work_date)}</td><td>${safe(r.emp_code)}</td><td class="nowrap">${safe(r.full_name)}</td><td>${safe(r.department)}</td><td>${safe(r.zone || r.area)}</td><td>${safe(r.sub_area)}</td><td class="nowrap">${formatTime(attendanceShiftTime(r,"start"))}</td><td class="nowrap">${formatTime(attendanceShiftTime(r,"end"))}</td><td>${badge(code, shiftBadgeClass(code))}</td><td>${formatTime(r.actual_in_at || r.first_in)}</td><td>${formatTime(r.actual_out_at || r.last_out)}</td><td class="text-right">${minutesToHours(r.net_work_minutes)}</td><td class="text-right">${formatNumber(r.late_minutes)}</td><td class="text-right">${formatNumber(r.early_leave_minutes)}</td><td>${badge(attendanceLabel(r.attendance_result || r.attendance_status), statusBadgeClass(r.attendance_result || r.attendance_status))}</td></tr>`;
      }).join("") : emptyRow(15);
      document.dispatchEvent(new CustomEvent("timeclock:attendance-rendered", { detail: { count: state.attendance.length } }));
    }

    async function loadSchedule() {
      showLoading("กำลังโหลดปฏิทินกะ...");
      try {
        const month = `${val("scheduleMonth")}-01`;
        const data = await window.TimeClockShiftAPI.getMonthlySchedule(window.TimeClockApp || { state }, {
          p_month: month, p_zone: val("scheduleZone") || null, p_department: val("scheduleDepartment") || null,
          p_emp_codes: null, p_schedule_statuses: null
        });
        state.schedule = data || [];
        renderSchedule();
      } catch (err) { toast(humanError(err), "error"); }
      finally { hideLoading(); }
    }

    function renderSchedule() {
      const term = val("scheduleSearch").trim().toLowerCase();
      const rows = term ? state.schedule.filter(r => `${r.emp_code} ${r.full_name}`.toLowerCase().includes(term)) : state.schedule;
      const month = val("scheduleMonth");
      if (!month) return;
      const [year, mon] = month.split("-").map(Number);
      const days = new Date(year, mon, 0).getDate();
      const map = new Map();
      const dateMeta = new Map();
      for (const r of rows) {
        if (!map.has(r.emp_code)) map.set(r.emp_code, { meta: r, days: {} });
        map.get(r.emp_code).days[Number(String(r.work_date).slice(8,10))] = r;
        const date = String(r.work_date).slice(0,10);
        if (!dateMeta.has(date)) dateMeta.set(date, { holiday: false, holidayName: null });
        if (r.is_public_holiday || r.day_type === "PUBLIC_HOLIDAY") {
          dateMeta.set(date, { holiday: true, holidayName: r.holiday_name || "วันหยุดนักขัตฤกษ์" });
        }
      }
      const thaiDays = ["อา","จ","อ","พ","พฤ","ศ","ส"];
      const headDays = Array.from({length:days},(_,i)=>i+1).map(d => {
        const dow = new Date(year, mon-1, d).getDay();
        const date = `${year}-${String(mon).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
        const meta = dateMeta.get(date) || {};
        const classes = [dow===0||dow===6 ? "weekend" : "", meta.holiday ? "public-holiday-head" : ""].filter(Boolean).join(" ");
        const title = meta.holiday ? `${meta.holidayName} • คลิกเพื่อเลือกทั้งวันที่` : "เลือกทั้งวันที่";
        return `<th class="day-col ${classes}" data-select-date="${date}" title="${safe(title)}"><span>${d}</span><small>${thaiDays[dow]}${meta.holiday?" • หยุด":""}</small></th>`;
      }).join("");
      let html = `<table class="schedule-table enterprise-schedule-table"><thead><tr><th class="sticky-col-1 schedule-code-head" style="min-width:92px">รหัส</th><th class="sticky-col-2 schedule-name-head" style="min-width:210px">ชื่อ-นามสกุล</th>${headDays}</tr></thead><tbody>`;
      if (!map.size) html += emptyRow(days + 2);
      const today = todayISO();
      for (const [emp, obj] of map) {
        html += `<tr data-emp-row="${safe(emp)}"><td class="sticky-col-1 schedule-emp-code" data-select-emp="${safe(emp)}" title="เลือกทั้งแถว">${safe(emp)}</td><td class="sticky-col-2 nowrap schedule-emp-name" data-select-emp="${safe(emp)}"><strong>${safe(obj.meta.full_name)}</strong><small>${safe(obj.meta.department || obj.meta.zone || "")}</small></td>`;
        for (let d=1; d<=days; d++) {
          const r = obj.days[d];
          if (!r) { html += `<td class="day-col empty-schedule-day"><span class="schedule-cell disabled">-</span></td>`; continue; }
          const code = r.assigned_shift_code || r.effective_shift_code || r.auto_shift_code || r.shift_code || "-";
          const date = String(r.work_date).slice(0,10);
          const publicHoliday = r.is_public_holiday || r.day_type === "PUBLIC_HOLIDAY";
          const weeklyOff = r.is_weekly_off || r.day_type === "WEEKLY_OFF";
          const cls = `shift-${code} ${r.schedule_status==='NEED_REVIEW'?'review':''} ${r.schedule_status==='CONFIRMED'?'confirmed':''}`;
          const tdCls = ["day-col","schedule-data-cell",publicHoliday?"public-holiday-cell":"",weeklyOff?"weekly-off-cell":"",date>today?"future-schedule-cell":""].filter(Boolean).join(" ");
          const dayLabel = publicHoliday ? (r.holiday_name || "วันหยุดนักขัตฤกษ์") : weeklyOff ? "วันหยุดประจำสัปดาห์" : "วันทำงาน";
          const statusLabel = r.schedule_status === "CONFIRMED" ? "ยืนยันแล้ว" : r.schedule_status === "ASSIGNED" ? "ยังไม่ยืนยัน" : r.schedule_status || "AUTO";
          html += `<td class="${tdCls}" data-cell-key="${safe(r.emp_code)}|${safe(date)}"><span class="schedule-cell ${cls}" data-schedule-cell="1" data-emp="${safe(r.emp_code)}" data-date="${safe(date)}" data-shift="${safe(code)}" data-status="${safe(r.schedule_status)}" title="${safe(r.full_name)} | ${safe(dayLabel)} | ${safe(statusLabel)} | ดับเบิลคลิกเพื่อแก้ไข"><b>${safe(code)}</b>${r.schedule_status==='NEED_REVIEW'?'<i>!</i>':''}</span></td>`;
        }
        html += `</tr>`;
      }
      html += `</tbody></table>`;
      $("scheduleTableWrap").innerHTML = html;
      setText("scheduleEmployeeCount", formatNumber(map.size));
      setText("scheduleAssignedCount", formatNumber(rows.filter(r => r.schedule_status === "ASSIGNED").length));
      setText("scheduleConfirmedCount", formatNumber(rows.filter(r => r.schedule_status === "CONFIRMED").length));
      setText("scheduleReviewCount", formatNumber(rows.filter(r => r.schedule_status === "NEED_REVIEW").length));
      document.dispatchEvent(new CustomEvent("timeclock:schedule-rendered"));
    }

    let reviewLoadRequest = 0;
    async function loadReview() {
      const requestId = ++reviewLoadRequest;
      showLoading("กำลังโหลดรายการรอตรวจสอบ...");
      try {
        const issues = val("reviewIssue") ? [val("reviewIssue")] : null;
        const data = await window.TimeClockShiftAPI.getReview(window.TimeClockApp || { state }, {
          p_start_date: val("reviewStart"), p_end_date: val("reviewEnd"), p_zone: null, p_department: null,
          p_emp_codes: null, p_issue_types: issues
        });
        if (requestId !== reviewLoadRequest) return;
        state.review = data || [];
        renderReview();
      } catch (err) {
        if (requestId === reviewLoadRequest) {
          state.review = [];
          renderReview();
          toast(humanError(err), "error");
        }
      } finally {
        if (requestId === reviewLoadRequest) hideLoading();
      }
    }

    function renderReview() {
      setText("reviewCount", `${formatNumber(state.review.length)} รายการ`);
      $("reviewBody").innerHTML = state.review.length ? state.review.map(r => `<tr><td>${formatDate(r.work_date)}</td><td>${safe(r.emp_code)}</td><td class="nowrap">${safe(r.full_name)}</td><td>${safe(r.department)}</td><td>${badge(r.auto_shift_code, shiftBadgeClass(r.auto_shift_code))}</td><td>${badge(r.suggested_shift_code || "-", shiftBadgeClass(r.suggested_shift_code))}</td><td class="text-right">${formatNumber(r.suggestion_confidence)}%</td><td>${formatTime(r.actual_in_at || r.first_in)}</td><td>${formatTime(r.actual_out_at || r.last_out)}</td><td>${badge(attendanceLabel(r.attendance_result || r.attendance_status || r.time_pair_status), "badge-red")}</td><td><button class="btn btn-soft" data-review-assign="1" data-emp="${safe(r.emp_code)}" data-date="${safe(String(r.work_date).slice(0,10))}">จัดกะ</button></td></tr>`).join("") : emptyRow(11);
      document.dispatchEvent(new CustomEvent("timeclock:review-rendered", { detail: { count: state.review.length } }));
    }

    async function openAssignment(empCode, workDate) {
      const r = state.schedule.find(x => x.emp_code === empCode && String(x.work_date).slice(0,10) === workDate) || state.review.find(x => x.emp_code === empCode && String(x.work_date).slice(0,10) === workDate);
      setVal("assignEmpCode", empCode); setVal("assignWorkDate", workDate);
      setText("assignEmployeeInfo", `${r?.full_name || empCode} | ${formatDate(workDate)} | กะปัจจุบัน ${r?.assigned_shift_code || r?.effective_shift_code || r?.auto_shift_code || "-"}`);
      setVal("assignShiftCode", r?.assigned_shift_code || r?.suggested_shift_code || r?.effective_shift_code || "D");
      setVal("assignConfirm", r?.is_confirmed ? "true" : "false"); setVal("assignNote", r?.schedule_note || ""); setVal("assignReason", "กำหนดกะจากหน้าปฏิทิน");
      updateAssignConfirmHelp();
      $("deleteAssignmentBtn").classList.toggle("hidden", !r?.assigned_shift_code);
      openModal("assignModal");
    }

    async function saveAssignment() {
      showLoading("กำลังบันทึกกะ...");
      try {
        await window.TimeClockShiftAPI.assignSingle(window.TimeClockApp || { state }, {
          emp_code: val("assignEmpCode"), work_date: val("assignWorkDate"), shift_code: val("assignShiftCode"),
          note: val("assignNote") || null, change_reason: val("assignReason") || "กำหนดกะจากหน้าปฏิทิน", confirm_now: val("assignConfirm") === "true"
        });
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
        closeModal("assignModal"); toast(`บันทึกกะ ${savedShift} เรียบร้อย`, "success");
        await Promise.all([loadSchedule(), state.currentPage === "review" ? loadReview() : Promise.resolve()]);
      } catch (err) { toast(humanError(err), "error"); }
      finally { hideLoading(); }
    }

    async function deleteAssignment() {
      if (!confirm("ยืนยันการลบกะที่จัดไว้รายการนี้?")) return;
      showLoading("กำลังลบกะ...");
      try {
        await window.TimeClockShiftAPI.deleteBulk(
          window.TimeClockApp || { state },
          [val("assignEmpCode")], val("assignWorkDate"), val("assignWorkDate"), "ลบกะจากหน้าปฏิทิน"
        );
        closeModal("assignModal"); toast("ลบกะที่จัดไว้แล้ว", "success"); await loadSchedule();
      } catch (err) { toast(humanError(err), "error"); }
      finally { hideLoading(); }
    }

    async function loadShiftMaster() {
      showLoading("กำลังโหลดข้อมูลกะ...");
      try {
        const { data, error } = await state.client.from("shift_master").select("*").order("shift_code");
        if (error) throw error;
        state.filters.shifts = (data || []).sort((a,b) => Number(a.display_order ?? a.sort_order ?? 0) - Number(b.display_order ?? b.sort_order ?? 0) || String(a.shift_code).localeCompare(String(b.shift_code)));
        fillShiftSelect();
        $("shiftMasterBody").innerHTML = data?.length ? data.map(s => `<tr><td><strong>${safe(s.shift_code)}</strong></td><td>${safe(s.shift_name)}</td><td>${formatTime(s.start_time)}</td><td>${formatTime(s.end_time)}</td><td>${formatNumber(s.break_minutes)} นาที</td><td>${s.is_workday ? (s.is_night_shift ? badge("กะกลางคืน","badge-blue") : badge("กะกลางวัน","badge-blue")) : badge("วันหยุด","badge-gray")}</td><td>${s.is_active ? badge("ใช้งาน","badge-green") : badge("ปิดใช้งาน","badge-red")}</td><td><button class="btn btn-soft" data-edit-shift="${safe(s.shift_code)}">แก้ไข</button></td></tr>`).join("") : emptyRow(8);
      } catch (err) { toast(humanError(err), "error"); }
      finally { hideLoading(); }
    }

    function editShift(code) {
      const s = state.filters.shifts.find(x => x.shift_code === code) || {};
      setVal("smCode", s.shift_code); setVal("smName", s.shift_name); setVal("smStart", s.start_time?.slice(0,5)); setVal("smEnd", s.end_time?.slice(0,5)); setVal("smBreak", s.break_minutes ?? 0); setVal("smOrder", s.display_order ?? s.sort_order ?? 0); setVal("smActive", String(s.is_active !== false)); setVal("smNote", s.note || "");
      $("smWorkday").checked = s.is_workday !== false; $("smNight").checked = !!s.is_night_shift; $("smCode").disabled = !!s.shift_code; openModal("shiftMasterModal");
    }

    async function saveShiftMaster() {
      showLoading("กำลังบันทึกข้อมูลกะ...");
      try {
        await window.TimeClockShiftAPI.upsertShiftMaster(window.TimeClockApp || { state }, {
          shift_code: val("smCode"), shift_name: val("smName"), start_time: val("smStart") || null, end_time: val("smEnd") || null,
          is_night_shift: $("smNight").checked, is_workday: $("smWorkday").checked, break_minutes: Number(val("smBreak")||0),
          display_order: Number(val("smOrder")||0), note: val("smNote") || null, is_active: val("smActive") === "true", change_reason: "บันทึกจากหน้า HR Admin"
        });
        closeModal("shiftMasterModal"); toast("บันทึกข้อมูลกะเรียบร้อย", "success"); await loadShiftMaster();
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

    async function loadUsers() {
      showLoading("กำลังโหลด User และ Scope...");
      try {
        const { data, error } = await state.client.rpc("ta_get_user_management"); if (error) throw error; state.users = data || [];
        $("userBody").innerHTML = state.users.length ? state.users.map(u => `<tr><td>${safe(u.email)}</td><td>${safe(u.display_name)}</td><td>${badge(u.role, u.role==='HR_ADMIN'?'badge-orange':u.role==='USER'?'badge-blue':'badge-gray')}</td><td>${u.is_active?badge("Active","badge-green"):badge("Inactive","badge-red")}</td><td>${formatDateTime(u.last_sign_in_at)}</td><td>${formatNumber(Array.isArray(u.scopes)?u.scopes.length:0)} รายการ</td><td><button class="btn btn-soft" data-edit-user="${safe(u.user_id)}">แก้ไขสิทธิ์</button></td></tr>`).join("") : emptyRow(7);
      } catch (err) { toast(humanError(err), "error"); } finally { hideLoading(); }
    }

    function editUser(userId) {
      const u = state.users.find(x => x.user_id === userId); if (!u) return;
      setVal("umUserId", u.user_id); setVal("umEmail", u.email); setVal("umDisplayName", u.display_name || u.email); setVal("umRole", u.role || "VIEWER"); $("umActive").checked = u.is_active !== false;
      const s = Array.isArray(u.scopes) && u.scopes.length ? u.scopes[0] : null;
      setVal("umScopeType", s?.scope_type || "ALL"); setVal("umScopeValue", s?.scope_value || "*"); setVal("umScopeLabel", s?.scope_label || "ทุกพื้นที่"); $("umCanView").checked = s?.can_view !== false; $("umCanEdit").checked = !!s?.can_edit_schedule; $("umCanConfirm").checked = !!s?.can_confirm_schedule;
      openModal("userModal");
    }

    async function saveUser() {
      showLoading("กำลังบันทึกสิทธิ์ผู้ใช้งาน...");
      try {
        const userId = val("umUserId");
        let res = await state.client.rpc("ta_upsert_user_profile", { p_user_id: userId, p_role: val("umRole"), p_display_name: val("umDisplayName") || null, p_is_active: $("umActive").checked, p_change_reason: "แก้ไขจากหน้า HR Admin" });
        if (res.error) throw res.error;
        const scopeType = val("umScopeType");
        const scope = [{ scope_type: scopeType, scope_value: scopeType === "ALL" ? "*" : val("umScopeValue"), scope_label: val("umScopeLabel") || null, can_view: $("umCanView").checked, can_edit_schedule: $("umCanEdit").checked, can_confirm_schedule: $("umCanConfirm").checked, is_active: true, effective_from: null, effective_to: null }];
        res = await state.client.rpc("ta_replace_user_scopes", { p_user_id: userId, p_scopes: scope, p_change_reason: "แก้ไข Scope จากหน้า HR Admin" });
        if (res.error) throw res.error;
        closeModal("userModal"); toast("บันทึกสิทธิ์เรียบร้อย", "success"); await loadUsers();
      } catch (err) { toast(humanError(err), "error"); } finally { hideLoading(); }
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
        const rows = parseCSV(await file.text()); if (!rows.length) throw new Error("ไม่พบข้อมูลในไฟล์");
        const { data, error } = await state.client.rpc("ta_import_employees", { p_rows: rows, p_file_name: file.name, p_preview_only: previewOnly, p_note: val("importNote") || null });
        if (error) throw error;
        const r = Array.isArray(data) ? data[0] : data;
        $("importResult").innerHTML = `<div class="panel"><div class="panel-body"><div class="kpi-grid" style="grid-template-columns:repeat(5,1fr)"><div><small>สถานะ</small><strong style="display:block">${safe(r.import_status)}</strong></div><div><small>ทั้งหมด</small><strong style="display:block">${formatNumber(r.total_rows)}</strong></div><div><small>ถูกต้อง</small><strong style="display:block">${formatNumber(r.valid_rows)}</strong></div><div><small>เพิ่มใหม่</small><strong style="display:block">${formatNumber(r.inserted_rows)}</strong></div><div><small>ปรับปรุง</small><strong style="display:block">${formatNumber(r.updated_rows)}</strong></div></div></div></div>`;
        toast(previewOnly ? "ตรวจสอบไฟล์เรียบร้อย" : "นำเข้าข้อมูลเรียบร้อย", "success");
      } catch (err) { toast(humanError(err), "error"); } finally { hideLoading(); }
    }

    function downloadTemplate() {
      const headers = ["employee_id","full_name","position_name","department","zone","pc","area","sub_area","car_team","manager_department","manager_division","start_date","resign_date"];
      downloadFile("Employee_Template.csv", "\uFEFF" + headers.join(",") + "\n", "text/csv;charset=utf-8");
    }

    function exportAttendance() {
      if (!state.attendance.length) return toast("ไม่มีข้อมูลสำหรับ Export", "error");
      const headers = ["วันที่","รหัสพนักงาน","ชื่อ-นามสกุล","หน่วยงาน","พื้นที่","พื้นที่ย่อย","เวลาเริ่มกะ","เวลาสิ้นสุดกะ","กะ","เวลาเข้า","เวลาออก","ชั่วโมงสุทธิ","มาสาย(นาที)","กลับก่อน(นาที)","สถานะ"];
      const rows = state.attendance.map(r => [formatDate(r.work_date),r.emp_code,r.full_name,r.department,r.zone||r.area,r.sub_area,formatTime(attendanceShiftTime(r,"start")),formatTime(attendanceShiftTime(r,"end")),attendanceShiftCode(r),formatTime(r.actual_in_at||r.first_in),formatTime(r.actual_out_at||r.last_out),minutesToHours(r.net_work_minutes),r.late_minutes||0,r.early_leave_minutes||0,attendanceLabel(r.attendance_result||r.attendance_status)]);
      const csv = "\uFEFF" + [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
      downloadFile(`Attendance_${val("attStart")}_${val("attEnd")}.csv`, csv, "text/csv;charset=utf-8");
    }
    const csvCell = v => `"${String(v ?? "").replace(/"/g,'""')}"`;
    function downloadFile(name, content, type) { const blob = new Blob([content], {type}); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); }

    function switchPage(page) {
      const realRole = state.profile?._realRole || state.profile?.role;
      if (page === "system-settings" && realRole !== "HR_ADMIN") return toast("เมนูนี้สำหรับ HR_ADMIN เท่านั้น", "error");
      if (page.startsWith("admin-") && state.profile?.role !== "HR_ADMIN") return toast("ไม่มีสิทธิ์เข้าถึงเมนูนี้", "error");
      state.currentPage = page;
      qsa(".page").forEach(x => x.classList.toggle("active", x.id === `page-${page}`));
      qsa(".nav-item").forEach(x => x.classList.toggle("active", x.dataset.page === page));
      const titles = {
        dashboard:["Dashboard","ภาพรวมการลงเวลาและการจัดกะ"], attendance:["รายละเอียดเวลาทำงาน","ตรวจเวลาเข้า–ออกและผลการคำนวณ"], schedule:["ปฏิทินจัดกะ","จัดกะล่วงหน้าได้ทุกวัน รวมวันหยุดประจำสัปดาห์และวันหยุดนักขัตฤกษ์"], "work-patterns":["รูปแบบการทำงาน","กำหนดกลุ่ม 5/6 วัน วันหยุดตั้งต้น และรูปแบบช่วงงานรายบุคคล"], review:["รายการรอตรวจสอบ","ตรวจสอบกะและเวลาที่ผิดปกติ"], report:["ศูนย์รายงาน","สร้างและส่งออกรายงานจากข้อมูล Time-Clock"],
        "admin-center":["HR Admin Center","ศูนย์บริหารและตรวจสอบสถานะระบบ"], "admin-attendance-rebuild":["ประมวลผล Attendance","ประมวลผลใหม่ตามช่วงวันที่ พร้อม Progress และ Error Log"], "admin-shifts":["ตั้งค่ากะทำงาน","จัดการข้อมูลกะมาตรฐาน"], "system-settings":["System Settings","ตั้งค่าระบบและ Developer Console"], "admin-holidays":["วันหยุดนักขัตฤกษ์","จัดการวันหยุดและประมวลผล Attendance"], "admin-users":["User และ Scope","กำหนดสิทธิ์ผู้ใช้งาน"], "admin-import":["นำเข้าพนักงาน","ตรวจสอบและนำเข้าข้อมูล CSV"], "admin-time-import":["นำเข้าข้อมูลลงเวลา CSV","นำเข้า EmployeeId วันที่ เวลา เข้า/ออก และ GPS จาก CSV UTF-8"]
      };
      setText("pageTitle", titles[page]?.[0] || page); setText("pageSubtitle", titles[page]?.[1] || ""); $("sidebar").classList.remove("open");
      if (page === "attendance" && !state.attendance.length) loadAttendance();
      if (page === "schedule" && !state.schedule.length) loadSchedule();
      if (page === "review" && !state.review.length) loadReview();
      if (page === "admin-shifts") loadShiftMaster();
      if (page === "admin-holidays") loadHolidays();
      if (page === "admin-users") loadUsers();
    }

    function bindEvents() {
      $("loginForm").addEventListener("submit", async e => { e.preventDefault(); if (!state.client) return openModal("configModal"); showLoading("กำลังเข้าสู่ระบบ..."); try { const { error } = await state.client.auth.signInWithPassword({ email: val("loginEmail").trim(), password: val("loginPassword") }); if (error) throw error; const { data:{session} } = await state.client.auth.getSession(); state.session=session; state.user=session.user; await enterApp(); } catch(err){toast(humanError(err),"error");} finally{hideLoading();} });
      $("logoutBtn").addEventListener("click", async () => { if (state.client) await state.client.auth.signOut(); showLogin(); });
      $("openConfigFromLogin").addEventListener("click", () => openModal("configModal"));
      $("configBtn").addEventListener("click", () => { const c=getConfig(); setVal("configUrl",c?.url); setVal("configKey",c?.key); openModal("configModal"); });
      $("saveConfigBtn").addEventListener("click", () => { const url=val("configUrl").trim(), key=val("configKey").trim(); if(!url||!key) return toast("กรุณากรอก URL และ Key", "error"); saveConfig(url,key); closeModal("configModal"); toast("บันทึกการตั้งค่าแล้ว กรุณาโหลดหน้าใหม่", "success"); setTimeout(()=>location.reload(),700); });
      qsa("[data-close-modal]").forEach(b => b.addEventListener("click", () => closeModal(b.dataset.closeModal)));
      qsa(".nav-item").forEach(b => b.addEventListener("click", () => switchPage(b.dataset.page)));
      $("mobileMenuBtn").addEventListener("click", () => $("sidebar").classList.toggle("open"));
      $("loadDashboardBtn").addEventListener("click", loadDashboard);
      $("loadAttendanceBtn").addEventListener("click", loadAttendance);
      $("attZone")?.addEventListener("change", async () => { setVal("attSubArea", ""); setVal("attDepartment", ""); await loadAttendanceFilterOptions(true); });
      $("attSubArea")?.addEventListener("change", async () => { setVal("attDepartment", ""); await loadAttendanceFilterOptions(true); });
      $("attStart")?.addEventListener("change", () => loadAttendanceFilterOptions(true));
      $("attEnd")?.addEventListener("change", () => loadAttendanceFilterOptions(true));
      $("exportAttendanceBtn").addEventListener("click", exportAttendance);
      $("loadScheduleBtn").addEventListener("click", loadSchedule);
      $("scheduleSearch").addEventListener("input", renderSchedule);
      $("loadReviewBtn").addEventListener("click", loadReview);
      $("saveAssignmentBtn").addEventListener("click", saveAssignment);
      $("deleteAssignmentBtn").addEventListener("click", deleteAssignment);
      $("assignConfirm")?.addEventListener("change", updateAssignConfirmHelp);
      $("newShiftBtn").addEventListener("click", () => { ["smCode","smName","smStart","smEnd","smNote"].forEach(id=>setVal(id,"")); setVal("smBreak",0);setVal("smOrder",0);setVal("smActive","true");$("smWorkday").checked=true;$("smNight").checked=false;$("smCode").disabled=false;openModal("shiftMasterModal"); });
      $("saveShiftMasterBtn").addEventListener("click", saveShiftMaster);
      $("newHolidayBtn").addEventListener("click", () => { setVal("holDate","");setVal("holName","");setVal("holSource","HR_ADMIN");setVal("holNote","");$("holDate").disabled=false;openModal("holidayModal"); });
      $("saveHolidayBtn").addEventListener("click", saveHoliday);
      $("reloadUsersBtn").addEventListener("click", loadUsers);
      $("saveUserBtn").addEventListener("click", saveUser);
      $("umScopeType").addEventListener("change", () => { if(val("umScopeType")==="ALL"){setVal("umScopeValue","*");setVal("umScopeLabel","ทุกพื้นที่");} });
      $("previewImportBtn").addEventListener("click", () => runEmployeeImport(true));
      $("runImportBtn").addEventListener("click", () => runEmployeeImport(false));
      $("downloadTemplateBtn").addEventListener("click", downloadTemplate);
      document.addEventListener("click", e => {
        const go=e.target.closest("[data-go-page]"); if(go) switchPage(go.dataset.goPage);
        const ra=e.target.closest("[data-review-assign]"); if(ra) openAssignment(ra.dataset.emp,ra.dataset.date);
        const es=e.target.closest("[data-edit-shift]"); if(es) editShift(es.dataset.editShift);
        const eh=e.target.closest("[data-edit-holiday]"); if(eh) editHoliday(eh.dataset.editHoliday);
        const dh=e.target.closest("[data-delete-holiday]"); if(dh) deleteHoliday(dh.dataset.deleteHoliday);
        const eu=e.target.closest("[data-edit-user]"); if(eu) editUser(eu.dataset.editUser);
      });
    }

    function badge(text, cls="badge-gray") { return `<span class="badge ${cls}">${safe(text ?? "-")}</span>`; }
    function shiftBadgeClass(code) { return code === "D" ? "badge-blue" : code === "N" ? "badge-amber" : code === "HOL" ? "badge-orange" : "badge-gray"; }
    function statusBadgeClass(s) { return ["NORMAL","HOLIDAY","WEEKLY_OFF"].includes(s) ? "badge-green" : ["LATE","EARLY_LEAVE","LATE_AND_EARLY","WORKED_ON_OFFDAY"].includes(s) ? "badge-orange" : ["ABSENT","MISSING_IN","MISSING_OUT","INVALID_TIME","NEED_REVIEW"].includes(s) ? "badge-red" : "badge-gray"; }
    function attendanceLabel(s) { return ({ NORMAL:"ปกติ",ABSENT:"ไม่มีเวลา",MISSING_IN:"ไม่พบเวลาเข้า",MISSING_OUT:"ไม่พบเวลาออก",INVALID_TIME:"เวลาไม่ถูกต้อง",LATE:"มาสาย",EARLY_LEAVE:"กลับก่อน",LATE_AND_EARLY:"สายและกลับก่อน",WORKED_ON_OFFDAY:"ทำงานวันหยุด",NEED_REVIEW:"รอตรวจสอบ",HOLIDAY:"นักขัตฤกษ์",WEEKLY_OFF:"วันหยุดประจำสัปดาห์",INCOMPLETE_TIME:"เวลาไม่ครบ",COMPLETE:"ครบ",NO_TIME:"ไม่มีเวลา"})[s] || s || "-"; }
    function emptyRow(cols) { return `<tr><td colspan="${cols}" class="table-empty">ไม่พบข้อมูล</td></tr>`; }
    function humanError(err) {
      const msg = err?.message || err?.error_description || String(err || "เกิดข้อผิดพลาด");
      if (msg.includes("SCHEDULE_HAS_UNCONFIRMED_SHIFTS")) {
        const count = msg.match(/SCHEDULE_HAS_UNCONFIRMED_SHIFTS:\s*(\d+)/)?.[1];
        return `ยังมีกะที่จัดไว้แต่ยังไม่ยืนยัน${count ? ` ${Number(count).toLocaleString("th-TH")} รายการ` : ""} กรุณายืนยันกะก่อนประกาศหรือล็อกเดือน`;
      }
      if (msg.includes("SCHEDULE_MONTH_LOCKED")) return "ตารางกะเดือนนี้ถูกล็อก กรุณาปลดล็อกก่อนแก้ไข";
      if (msg.includes("SCHEDULE_PUBLISH_PERMISSION_DENIED")) return "บัญชีนี้ไม่มีสิทธิ์ประกาศหรือล็อกตารางกะ";
      if (msg.includes("REVIEW_SCOPE_PERMISSION_DENIED")) return "มีรายการที่อยู่นอกขอบเขตสิทธิ์ของบัญชีนี้";
      if (msg.includes("HR_ADMIN_REQUIRED")) return "เมนูนี้สำหรับ HR_ADMIN เท่านั้น";
      return msg;
    }

    window.TimeClockApp = Object.assign(window.TimeClockApp || {}, {
      state,
      loadAttendance,
      renderAttendance,
      loadSchedule,
      loadReview,
      renderSchedule,
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
      loadAttendanceFilterOptions,
      attendanceLabel,
      downloadFile,
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
    $('sidebarCollapseBtn')?.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem('tc_sidebar_collapsed', document.body.classList.contains('sidebar-collapsed') ? '1' : '0');
    });
    if (localStorage.getItem('tc_sidebar_collapsed') === '1') document.body.classList.add('sidebar-collapsed');
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
        [['กะ','schedule','ปฏิทิน'], 'schedule'], [['ตรวจ','review','ผิดปกติ'], 'review'],
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
        const unit = i===0 ? 'คน' : 'รายการ';
        const label = card.querySelector('.kpi-label')?.textContent || '';
        const icon = card.querySelector('.kpi-icon')?.outerHTML || '';
        const sub = card.querySelector('.kpi-sub')?.textContent || '';
        card.innerHTML = `<div class="kpi-topline"><div class="kpi-label">${label}</div>${icon}</div><div class="kpi-value-row"><div class="kpi-value">${fmt(value)}</div><span class="kpi-unit">${unit}</span></div><div class="kpi-progress"><span style="width:${ratio}%"></span></div><div class="kpi-foot"><span>${sub}</span><strong>${ratio}%</strong></div>`;
      });
      renderEnterprisePanels(values);
    });
    observer.observe(kpiHost,{childList:true});
  }

  function renderEnterprisePanels(values){
    const employees=values[0]||0, total=values[1]||0, complete=values[2]||0, incomplete=values[3]||0, absent=values[4]||0, review=values[5]||0;
    const completePct=pct(complete,total);
    if ($('attendanceDonut')) $('attendanceDonut').style.setProperty('--donut-angle', `${completePct*3.6}deg`);
    if ($('donutPercent')) $('donutPercent').textContent=`${completePct}%`;
    if ($('notificationCount')) $('notificationCount').textContent=review>99?'99+':String(review);
    if ($('dashboardUpdatedAt')) $('dashboardUpdatedAt').textContent=`อัปเดตล่าสุด ${new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}`;
    if ($('dashboardLegend')) $('dashboardLegend').innerHTML = [
      ['#2fb27d','ลงเวลาครบ',complete],['#f59e0b','เวลาไม่ครบ',incomplete],['#ef4444','ไม่พบเวลา',absent],['#2d7bd3','รอตรวจสอบ',review]
    ].map(x=>`<div class="legend-item"><i class="legend-dot" style="background:${x[0]}"></i><span>${x[1]}</span><strong>${fmt(x[2])}</strong></div>`).join('');
    if ($('operationalSummary')) $('operationalSummary').innerHTML = [
      ['อัตราลงเวลาครบ',`${completePct}%`,'เทียบรายการทั้งหมด'],
      ['เฉลี่ยรายการต่อคน',employees? (total/employees).toFixed(1):'0','วัน-พนักงานต่อคน'],
      ['รายการผิดปกติ',fmt(incomplete+absent),'ต้องตรวจสอบเวลา'],
      ['คงเหลือรอดำเนินการ',fmt(review),'รายการใน Review Queue']
    ].map(x=>`<div class="ops-card"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></div>`).join('');
    if ($('recentActivity')) $('recentActivity').innerHTML = [
      ['✓','โหลด Dashboard สำเร็จ',`${fmt(total)} รายการในช่วงวันที่`],
      ['⚠','พบรายการรอตรวจสอบ',`${fmt(review)} รายการต้องดำเนินการ`],
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
          const icons=['⚠','↥','↧','✓'];
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
      absent: values[4] || 0,
      review: values[5] || 0
    };
  }

  function renderExecutiveDashboard() {
    const d = readDashboardValues();
    if (!d.total && !d.employees) return;
    const completePct = percent(d.complete, d.total);
    const issueRows = d.incomplete + d.absent;
    const reviewPenalty = percent(d.review, d.total);
    const score = Math.max(0, Math.min(100, Math.round(completePct - reviewPenalty * .35)));
    const confirmed = num([...document.querySelectorAll('#dashboardQuick .badge')][3]?.textContent?.replace(/,/g, ''));
    const confirmedPct = percent(confirmed, d.total);

    $('executiveScore') && ($('executiveScore').textContent = score);
    $('executiveScoreRing')?.style.setProperty('--score-angle', `${score * 3.6}deg`);
    const status = score >= 90 ? ['ดีมาก','good'] : score >= 75 ? ['ควรติดตาม','warn'] : ['ต้องเร่งปรับปรุง','bad'];
    if ($('executiveScoreStatus')) {
      $('executiveScoreStatus').textContent = status[0];
      $('executiveScoreStatus').className = `health-status ${status[1]}`;
    }
    if ($('executiveScoreTitle')) $('executiveScoreTitle').textContent = score >= 90 ? 'ภาพรวมอยู่ในเกณฑ์ดีมาก' : score >= 75 ? 'ยังมีรายการที่ควรติดตาม' : 'พบประเด็นที่ควรเร่งดำเนินการ';
    if ($('executiveScoreText')) $('executiveScoreText').textContent = `ลงเวลาครบ ${completePct}% และมีรายการรอตรวจสอบ ${fmt(d.review)} รายการ`;

    if ($('executiveAttention')) $('executiveAttention').innerHTML = [
      ['เวลาไม่ครบ', d.incomplete, percent(d.incomplete,d.total)],
      ['ไม่พบเวลา', d.absent, percent(d.absent,d.total)],
      ['รอตรวจสอบ', d.review, percent(d.review,d.total)],
      ['รวมประเด็น', issueRows + d.review, percent(issueRows+d.review,d.total)]
    ].map(([label,value,p]) => `<button class="attention-tile ${p>=10?'high':p>=5?'medium':''}" data-go-page="review"><span>${label}</span><strong>${fmt(value)}</strong><small>${p}% ของรายการทั้งหมด</small></button>`).join('');

    if ($('scheduleReadiness')) $('scheduleReadiness').innerHTML = `
      <div class="readiness-number"><strong>${confirmedPct}%</strong><span>กะที่ยืนยันเทียบรายการทั้งหมด</span></div>
      <div class="readiness-track"><i style="width:${confirmedPct}%"></i></div>
      <div class="readiness-meta"><div><span>ยืนยันแล้ว</span><strong>${fmt(confirmed)}</strong></div><div><span>คงเหลือโดยประมาณ</span><strong>${fmt(Math.max(0,d.total-confirmed))}</strong></div></div>`;

    const insights = [];
    insights.push({type: completePct >= 90 ? 'good' : completePct >= 75 ? 'warn' : 'bad', icon:'✓', title:'ความครบถ้วนของเวลา', text:`ลงเวลาครบ ${fmt(d.complete)} จาก ${fmt(d.total)} รายการ`, value:`${completePct}%`});
    if (d.incomplete > 0) insights.push({type:'warn',icon:'!',title:'เวลาเข้า–ออกไม่ครบ',text:'ควรตรวจรายการก่อนปิดรอบเวลา',value:fmt(d.incomplete)});
    if (d.absent > 0) insights.push({type:'bad',icon:'×',title:'ไม่พบข้อมูลเวลา',text:'ตรวจสอบวันทำงาน วันลา หรือแหล่งข้อมูลเวลา',value:fmt(d.absent)});
    if (d.review === 0) insights.push({type:'good',icon:'✓',title:'Review Queue เป็นศูนย์',text:'ไม่พบรายการค้างตรวจสอบในชุดข้อมูลนี้',value:'0'});
    else insights.push({type:'warn',icon:'⚠',title:'Review Queue',text:'มีรายการที่ต้องพิจารณาหรือยืนยันเพิ่มเติม',value:fmt(d.review)});
    if ($('executiveInsights')) $('executiveInsights').innerHTML = insights.slice(0,4).map(i => `<div class="insight-row ${i.type}"><div class="insight-icon">${i.icon}</div><div><strong>${i.title}</strong><p>${i.text}</p></div><div class="insight-value">${i.value}</div></div>`).join('');

    const distribution = [
      ['ลงเวลาครบ',d.complete,'dist-complete'],['เวลาไม่ครบ',d.incomplete,'dist-missing'],['ไม่พบเวลา',d.absent,'dist-absent'],['รอตรวจสอบ',d.review,'dist-review']
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

  function updateHistoryButtons(){ $("scheduleUndoBtn") && ($("scheduleUndoBtn").disabled=!undoStack.length); $("scheduleRedoBtn") && ($("scheduleRedoBtn").disabled=!redoStack.length); }
  function updateSummary(){
    const counts={D:0,N:0,OFF:0,HOL:0,LV:0};
    (app()?.state?.schedule||[]).forEach(r=>{const c=currentCode(r); if(c in counts) counts[c]++;});
    Object.entries(counts).forEach(([c,n])=>{const el=$("sumShift"+c); if(el) el.textContent=n.toLocaleString("th-TH");});
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
    const before=payload.map(p=>{const x=rowForKey(`${p.emp_code}|${p.work_date}`);return {...p,shift_code:currentCode(x.row)};});
    app().showLoading(`กำลังบันทึก ${payload.length.toLocaleString("th-TH")} รายการ...`);
    try{
      await window.TimeClockShiftAPI.assignBulk(app(), payload, reason, confirmNow);
      undoStack.push({label:historyLabel,before,after:payload.map(x=>({...x}))}); if(undoStack.length>30)undoStack.shift(); redoStack.length=0; updateHistoryButtons();
      app().toast(`บันทึก ${payload.length.toLocaleString("th-TH")} รายการแล้ว`,"success"); await app().loadSchedule();
    }catch(err){app().toast(app().humanError(err),"error");}finally{app().hideLoading();}
  }
  async function bulkAssign(shiftCode,confirmNow=false){const rows=selectedRows();if(!rows.length)return app()?.toast("กรุณาเลือกช่องกะก่อน","error");await savePayload(rows.map(x=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:shiftCode,note:"กำหนดจาก Schedule Pro"})),`กำหนดกะ ${shiftCode} จาก Schedule Pro`,confirmNow,`กำหนด ${shiftCode}`);}
  function copySelection(){const rows=selectedRows();if(!rows.length)return app()?.toast("กรุณาเลือกช่องที่ต้องการคัดลอก","error");clipboard=rows.map(x=>currentCode(x.row)||"D");refreshSelectionUI();app().toast(`คัดลอก ${clipboard.length} กะแล้ว`,"success");}
  async function pasteSelection(){const targets=selectedRows();if(!clipboard.length)return app()?.toast("ยังไม่มีกะในคลิปบอร์ด","error");if(!targets.length)return app()?.toast("กรุณาเลือกช่องปลายทาง","error");await savePayload(targets.map((x,i)=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:clipboard[i%clipboard.length],note:"วางจากคลิปบอร์ด"})),"คัดลอกและวางกะจาก Schedule Pro",false,"วางกะ");}
  async function clearCells(){const rows=selectedRows();if(!rows.length)return app()?.toast("กรุณาเลือกช่องที่ต้องการล้าง","error");if(!confirm(`ล้างกะที่กำหนดจำนวน ${rows.length} ช่อง?`))return;await savePayload(rows.map(x=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:null,note:"ล้างกะจาก Schedule Pro"})),"ล้างกะจาก Schedule Pro",false,"ล้างกะ");}
  async function confirmSelected(){const rows=selectedRows();if(!rows.length)return app()?.toast("กรุณาเลือกกะที่ต้องการยืนยัน","error");if(!confirm(`ยืนยันกะ ${rows.length} ช่องที่เลือก?`))return;await savePayload(rows.map(x=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:currentCode(x.row),note:"ยืนยันจาก Schedule Pro"})).filter(x=>x.shift_code),"ยืนยันกะจาก Schedule Pro",true,"ยืนยันกะ");}
  async function applyHistory(item,mode){const payload=(mode==="undo"?item.before:item.after).map(x=>({...x,note:`${mode} ${item.label}`}));app().showLoading(`กำลัง ${mode==="undo"?"ย้อนกลับ":"ทำซ้ำ"}...`);try{await window.TimeClockShiftAPI.assignBulk(app(),payload,`${mode} ${item.label}`,false);(mode==="undo"?redoStack:undoStack).push(item);updateHistoryButtons();await app().loadSchedule();app().toast(mode==="undo"?"ย้อนกลับแล้ว":"ทำซ้ำแล้ว","success");}catch(err){app().toast(app().humanError(err),"error");}finally{app().hideLoading();}}
  function undo(){const x=undoStack.pop();if(x)applyHistory(x,"undo");}
  function redo(){const x=redoStack.pop();if(x)applyHistory(x,"redo");}
  function moveActive(dx,dy,extend=false){const c=getCell(activeKey)||cells()[0];if(!c)return;const td=c.closest("td"),tr=td.parentElement;const rows=[...tr.parentElement.children];let ri=rows.indexOf(tr)+dy;ri=Math.max(0,Math.min(rows.length-1,ri));const targetRow=rows[ri];const cellsRow=[...targetRow.querySelectorAll("[data-schedule-cell]")];const sourceCells=[...tr.querySelectorAll("[data-schedule-cell]")];let ci=sourceCells.indexOf(c)+dx;ci=Math.max(0,Math.min(cellsRow.length-1,ci));const target=cellsRow[ci];if(target){selectCell(target,false,extend);target.scrollIntoView({block:"nearest",inline:"nearest"});}}
  function shiftMonth(delta){const input=$("scheduleMonth");if(!input?.value)return;const [y,m]=input.value.split("-").map(Number);const d=new Date(y,m-1+delta,1);input.value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;app()?.loadSchedule();}
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
    document.querySelectorAll("[data-quick-shift]").forEach(b=>b.addEventListener("click",()=>bulkAssign(b.dataset.quickShift)));
    $("scheduleCopyBtn")?.addEventListener("click",copySelection); $("schedulePasteBtn")?.addEventListener("click",pasteSelection); $("scheduleClearCellsBtn")?.addEventListener("click",clearCells); $("scheduleClearSelectionBtn")?.addEventListener("click",clearSelection); $("scheduleConfirmSelectedBtn")?.addEventListener("click",confirmSelected); $("scheduleUndoBtn")?.addEventListener("click",undo); $("scheduleRedoBtn")?.addEventListener("click",redo);
    $("schedulePrevMonthBtn")?.addEventListener("click",()=>shiftMonth(-1)); $("scheduleNextMonthBtn")?.addEventListener("click",()=>shiftMonth(1)); $("scheduleTodayBtn")?.addEventListener("click",()=>{const d=new Date();$("scheduleMonth").value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;app()?.loadSchedule();});
    $("scheduleContextMenu")?.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.contextShift)bulkAssign(b.dataset.contextShift);if(b.dataset.contextAction==="copy")copySelection();if(b.dataset.contextAction==="paste")pasteSelection();if(b.dataset.contextAction==="clear")clearCells();closeContext();});
    document.addEventListener("click",e=>{if(!e.target.closest("#scheduleContextMenu"))closeContext();});
    document.addEventListener("keydown",e=>{if(!document.getElementById("page-schedule")?.classList.contains("active"))return;const tag=document.activeElement?.tagName;if(["INPUT","SELECT","TEXTAREA"].includes(tag)&&!(e.ctrlKey||e.metaKey))return;const k=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&k==="c"){e.preventDefault();copySelection();}else if((e.ctrlKey||e.metaKey)&&k==="v"){e.preventDefault();pasteSelection();}else if((e.ctrlKey||e.metaKey)&&k==="z"){e.preventDefault();e.shiftKey?redo():undo();}else if((e.ctrlKey||e.metaKey)&&k==="y"){e.preventDefault();redo();}else if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();clearCells();}else if(e.key==="Escape")clearSelection();else if(e.key==="ArrowLeft"){e.preventDefault();moveActive(-1,0,e.shiftKey);}else if(e.key==="ArrowRight"){e.preventDefault();moveActive(1,0,e.shiftKey);}else if(e.key==="ArrowUp"){e.preventDefault();moveActive(0,-1,e.shiftKey);}else if(e.key==="ArrowDown"){e.preventDefault();moveActive(0,1,e.shiftKey);}else if(["d","n"].includes(k)&&!e.ctrlKey&&!e.metaKey){e.preventDefault();bulkAssign(k.toUpperCase());}});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind);else bind();
})();

;

/* ===== js/review-center.js ===== */
"use strict";
(() => {
  const app = () => window.TimeClockApp;
  const $ = id => document.getElementById(id);
  const selected = new Set();
  let activeFilter = "";

  const issueOf = r => String(r.attendance_result || r.attendance_status || r.time_pair_status || r.schedule_status || "NEED_REVIEW").toUpperCase();
  const dateKey = r => `${r.emp_code}|${String(r.work_date).slice(0,10)}`;
  const esc = v => String(v ?? "").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const formatTime = v => { if(!v) return "-"; const s=String(v); if(s.includes("T")) return new Date(s).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",hour12:false}); return s.slice(0,5); };
  const formatDate = v => v ? new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString("th-TH",{day:"2-digit",month:"2-digit",year:"numeric"}) : "-";
  const label = s => ({NORMAL:"ปกติ",ABSENT:"ไม่มีเวลา",MISSING_IN:"ไม่พบเวลาเข้า",MISSING_OUT:"ไม่พบเวลาออก",WORKED_ON_OFFDAY:"ทำงานวันหยุด",NEED_REVIEW:"กะต้องตรวจสอบ",INVALID_TIME:"เวลาไม่ถูกต้อง",INCOMPLETE_TIME:"เวลาไม่ครบ"})[s] || s || "รอตรวจสอบ";
  const shiftClass = c => c === "D" ? "badge-blue" : c === "N" ? "badge-amber" : c === "HOL" ? "badge-orange" : "badge-gray";
  const badge = (t,c) => `<span class="badge ${c}">${esc(t || "-")}</span>`;

  function filteredRows(){
    const rows = app()?.state?.review || [];
    const q = ($("reviewSearch")?.value || "").trim().toLowerCase();
    return rows.filter(r => (!activeFilter || issueOf(r) === activeFilter) && (!q || [r.emp_code,r.full_name,r.department,r.zone,issueOf(r)].some(v=>String(v||"").toLowerCase().includes(q))));
  }
  function updateKpis(){
    const rows=app()?.state?.review||[];
    const counts={}; rows.forEach(r=>counts[issueOf(r)]=(counts[issueOf(r)]||0)+1);
    const put=(id,n)=>{if($(id))$(id).textContent=Number(n||0).toLocaleString("th-TH")};
    put("reviewKpiAll",rows.length);put("reviewKpiMissingIn",counts.MISSING_IN);put("reviewKpiMissingOut",counts.MISSING_OUT);put("reviewKpiAbsent",counts.ABSENT);put("reviewKpiShift",counts.NEED_REVIEW);put("reviewKpiOffday",counts.WORKED_ON_OFFDAY);
  }
  function render(){
    const body=$("reviewBody"); if(!body) return;
    const rows=filteredRows();
    body.innerHTML=rows.length?rows.map(r=>{
      const key=dateKey(r),issue=issueOf(r),conf=Math.max(0,Math.min(100,Number(r.suggestion_confidence||0)));
      return `<tr class="${selected.has(key)?"review-row-selected":""}" data-review-key="${esc(key)}"><td class="review-check-col"><input class="review-row-checkbox" type="checkbox" data-review-check="${esc(key)}" ${selected.has(key)?"checked":""}></td><td>${formatDate(r.work_date)}</td><td><strong>${esc(r.emp_code)}</strong></td><td class="nowrap">${esc(r.full_name)}</td><td>${esc(r.department||r.zone||"-")}</td><td>${badge(r.auto_shift_code,shiftClass(r.auto_shift_code))}</td><td>${badge(r.suggested_shift_code||"-",shiftClass(r.suggested_shift_code))}</td><td><div class="review-confidence"><strong>${conf.toLocaleString("th-TH")}%</strong><div class="review-confidence-track"><div class="review-confidence-fill" style="width:${conf}%"></div></div></div></td><td>${formatTime(r.actual_in_at||r.first_in)}</td><td>${formatTime(r.actual_out_at||r.last_out)}</td><td><span class="review-issue-chip">⚠ ${esc(label(issue))}</span></td><td><button class="btn btn-soft" data-review-assign="1" data-emp="${esc(r.emp_code)}" data-date="${esc(String(r.work_date).slice(0,10))}">จัดกะ</button></td></tr>`;
    }).join(""):`<tr><td colspan="12" class="review-empty">ไม่พบรายการตามเงื่อนไขที่เลือก</td></tr>`;
    if($("reviewVisibleCount")) $("reviewVisibleCount").textContent=`แสดง ${rows.length.toLocaleString("th-TH")} รายการ`;
    if($("reviewCount")) $("reviewCount").textContent=`${(app()?.state?.review?.length||0).toLocaleString("th-TH")} รายการ`;
    updateSelectionUI();
  }
  function updateSelectionUI(){
    const bar=$("reviewBulkBar"),count=$("reviewSelectedCount"),all=$("reviewSelectAll");
    if(bar) bar.classList.toggle("hidden",selected.size===0); if(count) count.textContent=selected.size.toLocaleString("th-TH");
    const visible=filteredRows().map(dateKey); if(all){all.checked=visible.length>0&&visible.every(k=>selected.has(k));all.indeterminate=visible.some(k=>selected.has(k))&&!all.checked;}
  }
  async function bulkAssign(){
    const a=app(); if(!a?.state?.client||!selected.size) return;
    const shift=$("reviewBulkShift").value, confirmNow=$("reviewBulkConfirm").checked;
    if(!confirm(`ยืนยันกำหนดกะ ${shift} จำนวน ${selected.size.toLocaleString("th-TH")} รายการ?`)) return;
    a.showLoading("กำลังกำหนดกะรายการที่เลือก..."); let done=0;
    try{
      const payload=[...selected].map(key=>{const [emp_code,work_date]=key.split("|");return {emp_code,work_date,shift_code:shift,note:"กำหนดจาก Review Center"};});
      await window.TimeClockShiftAPI.assignBulk(a,payload,"Bulk assign จาก Review Center",confirmNow);
      done=payload.length;
      selected.clear(); a.toast(`บันทึกกะสำเร็จ ${done.toLocaleString("th-TH")} รายการ`,"success"); await a.loadReview();
    }catch(e){a.toast(`บันทึกสำเร็จ ${done} รายการ ก่อนเกิดข้อผิดพลาด: ${a.humanError(e)}`,"error");}finally{a.hideLoading();}
  }
  function exportCsv(){
    const rows=filteredRows(); if(!rows.length) return app()?.toast("ไม่มีข้อมูลสำหรับส่งออก","error");
    const head=["วันที่","รหัสพนักงาน","ชื่อ-นามสกุล","หน่วยงาน","กะตั้งต้น","กะแนะนำ","ความมั่นใจ","เวลาเข้า","เวลาออก","ปัญหา"];
    const csv=[head,...rows.map(r=>[String(r.work_date).slice(0,10),r.emp_code,r.full_name,r.department||r.zone||"",r.auto_shift_code||"",r.suggested_shift_code||"",r.suggestion_confidence||0,formatTime(r.actual_in_at||r.first_in),formatTime(r.actual_out_at||r.last_out),label(issueOf(r))])].map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`Review_Center_${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);
  }
  function init(){
    const body=$("reviewBody"); if(!body) return;
    document.addEventListener("timeclock:review-rendered",()=>{ updateKpis(); render(); });
    document.querySelectorAll("[data-review-filter]").forEach(b=>b.addEventListener("click",()=>{activeFilter=b.dataset.reviewFilter||"";document.querySelectorAll("[data-review-filter]").forEach(x=>x.classList.toggle("active",x===b));if($("reviewIssue"))$("reviewIssue").value=activeFilter;render();}));
    $("reviewSearch")?.addEventListener("input",render);
    $("reviewSelectAll")?.addEventListener("change",e=>{filteredRows().forEach(r=>e.target.checked?selected.add(dateKey(r)):selected.delete(dateKey(r)));render();});
    body.addEventListener("change",e=>{const cb=e.target.closest("[data-review-check]");if(!cb)return;cb.checked?selected.add(cb.dataset.reviewCheck):selected.delete(cb.dataset.reviewCheck);render();});
    $("reviewClearSelectionBtn")?.addEventListener("click",()=>{selected.clear();render();});
    $("reviewBulkAssignBtn")?.addEventListener("click",bulkAssign);
    $("reviewExportBtn")?.addEventListener("click",exportCsv);
    $("reviewRefreshBtn")?.addEventListener("click",()=>$("loadReviewBtn")?.click());
  }
  document.addEventListener("DOMContentLoaded",init);
})();

;

/* ===== js/report-center.js ===== */
(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const app=()=>window.TimeClockApp;
  const safe=v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const STORAGE_KEY="timeclock_report_jobs_v60";
  const names={attendance:"รายละเอียดเวลาทำงาน",schedule:"ตารางจัดกะรายเดือน",review:"รายการรอตรวจสอบ",summary:"สรุป Dashboard",late:"มาสายและกลับก่อน"};
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
      const data=await rpc("ta_get_attendance_detail",{p_start_date:start,p_end_date:end,p_zone:zone,p_department:dept,p_emp_codes:null,p_attendance_statuses:null,p_schedule_statuses:null});
      const filtered=type==="late"?data.filter(r=>Number(r.late_minutes||0)>0||Number(r.early_leave_minutes||0)>0):data;
      const shiftTime=(r,side)=>app()?.attendanceShiftTime?.(r,side)||r[side==="start"?"shift_start_time":"shift_end_time"];
      return [["วันที่","รหัสพนักงาน","ชื่อ-นามสกุล","หน่วยงาน","พื้นที่","เวลาเริ่มกะ","เวลาสิ้นสุดกะ","กะ","เวลาเข้า","เวลาออก","ชั่วโมงสุทธิ","มาสาย(นาที)","กลับก่อน(นาที)","สถานะ"],...filtered.map(r=>[fmtDate(r.work_date),r.emp_code,r.full_name,r.department,r.zone||r.area,fmtTime(shiftTime(r,"start")),fmtTime(shiftTime(r,"end")),r.effective_shift_code||r.assigned_shift_code||r.shift_code||r.auto_shift_code,fmtTime(r.actual_in_at||r.first_in),fmtTime(r.actual_out_at||r.last_out),(Number(r.net_work_minutes||0)/60).toFixed(2),r.late_minutes||0,r.early_leave_minutes||0,r.attendance_result||r.attendance_status])];
    }
    if(type==="schedule"){
      const month=`${start.slice(0,7)}-01`;const data=await window.TimeClockShiftAPI.getMonthlySchedule(app(),{p_month:month,p_zone:zone,p_department:dept,p_emp_codes:null,p_schedule_statuses:null});
      return [["วันที่","รหัสพนักงาน","ชื่อ-นามสกุล","หน่วยงาน","พื้นที่","ประเภทวัน","กะอัตโนมัติ","กะแนะนำ","กะที่กำหนด","กะใช้งาน","สถานะ","ยืนยันแล้ว","เวลาเริ่มกะ","เวลาสิ้นสุดกะ"],...data.map(r=>[fmtDate(r.work_date),r.emp_code,r.full_name,r.department,r.zone||r.area,r.day_type||"WORKDAY",r.auto_shift_code,r.suggested_shift_code,r.assigned_shift_code,r.effective_shift_code,r.schedule_status,r.is_confirmed?"ใช่":"ไม่ใช่",fmtTime(r.shift_start_time),fmtTime(r.shift_end_time)])];
    }
    if(type==="review"){
      const data=await window.TimeClockShiftAPI.getReview(app(),{p_start_date:start,p_end_date:end,p_zone:zone,p_department:dept,p_emp_codes:null,p_issue_types:null});
      return [["วันที่","รหัสพนักงาน","ชื่อ-นามสกุล","หน่วยงาน","กะตั้งต้น","กะแนะนำ","ความมั่นใจ","เวลาเข้า","เวลาออก","ประเภทปัญหา"],...data.map(r=>[fmtDate(r.work_date),r.emp_code,r.full_name,r.department,r.auto_shift_code,r.suggested_shift_code,r.suggestion_confidence,fmtTime(r.actual_in_at||r.first_in),fmtTime(r.actual_out_at||r.last_out),r.issue_type||r.attendance_result||r.attendance_status])];
    }
    if(type==="summary"){
      const raw=await rpc("ta_get_dashboard_overview",{p_start_date:start,p_end_date:end,p_zone:zone,p_department:dept});const d=Array.isArray(raw)?raw[0]||{}:raw||{};
      return [["รายการ","จำนวน"],["พนักงานทั้งหมด",d.total_employees],["รายการทั้งหมด",d.total_rows],["ลงเวลาครบ",d.complete_time_rows],["ไม่พบเวลาเข้า",d.missing_in_rows],["ไม่พบเวลาออก",d.missing_out_rows],["ไม่มีข้อมูลเวลา",d.absent_rows??d.no_time_rows],["รอตรวจสอบ",d.need_review_rows],["ทำงานวันหยุด",d.worked_on_offday_rows],["กะยืนยันแล้ว",d.confirmed_rows]];
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
    systemName: "Time-Clock Management", companyName: "CP Retailink", environment: "Development", version: "4.0.0",
    footer: "Design by แผนกบริหารระบบข้อมูลบุคคล ซีพี รีเทลลิงค์", theme: "light", accent: "blue", font: "Noto Sans Thai",
    developerMode: false, viewAsRole: "HR_ADMIN",
    features: { dashboard:true, attendance:true, schedule:true, review:true, adminShifts:true, adminHolidays:true, adminUsers:true, adminImport:true },
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
    ["dashboard","Dashboard","ภาพรวมและ KPI"],["attendance","Attendance","รายละเอียดเวลาทำงาน"],["schedule","Schedule","ปฏิทินจัดกะ"],["review","Review Queue","รายการรอตรวจสอบ"],
    ["adminShifts","Shift Master","ตั้งค่ากะทำงาน"],["adminHolidays","Holiday","วันหยุดนักขัตฤกษ์"],["adminUsers","User & Scope","จัดการสิทธิ์ผู้ใช้"],["adminImport","Employee Import","นำเข้าข้อมูลพนักงาน"]
  ];
  const featurePage={dashboard:"dashboard",attendance:"attendance",schedule:"schedule",review:"review",adminShifts:"admin-shifts",adminHolidays:"admin-holidays",adminUsers:"admin-users",adminImport:"admin-import"};
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
  const VERSION="6.1.7";
  const menuItems=[
    ["dashboard","Dashboard","ภาพรวมการลงเวลา","▦"],["attendance","รายละเอียดเวลาทำงาน","ค้นหาและตรวจเวลาพนักงาน","◷"],["schedule","ปฏิทินจัดกะ","จัดกะรายเดือน","▣"],["review","รายการรอตรวจสอบ","Missing IN / OUT และรายการผิดปกติ","⚠"],["report","ศูนย์รายงาน","CSV Excel และ Print/PDF","▤"],["smart-assistant","ผู้ช่วยวิเคราะห์","สรุปข้อมูล Time-Clock","✦"],
    ["admin-center","HR Admin Center","ศูนย์บริหารระบบ","◆"],["admin-employees","ข้อมูลพนักงาน","Employee Directory","♟"],["admin-shifts","ตั้งค่ากะทำงาน","Shift Master","◫"],["admin-holidays","วันหยุดนักขัตฤกษ์","Holiday Master","◈"],["admin-users","User และ Scope","สิทธิ์ผู้ใช้งาน","♙"],["admin-import","นำเข้าพนักงาน","Import CSV","⇧"],["admin-time-import","นำเข้าข้อมูลลงเวลา","MobileTA Text Import","⇩"],["admin-attendance-rebuild","ประมวลผล Attendance","Progress และ Error Log","↻"],["admin-audit","Audit Log","ประวัติการเปลี่ยนแปลง","⌁"],["system-settings","System Settings","Theme Developer และ Connection","⚙"]
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
  function renderCommand(){const term=$("commandInput").value.trim().toLowerCase();selected=0;const visible=new Set(qa(".nav-item:not(.hidden)").map(x=>x.dataset.page));const menus=menuItems.filter(x=>visible.has(x[0])&&(!term||`${x[1]} ${x[2]} ${x[0]}`.toLowerCase().includes(term)));const employees=employeeItems(term);const res=$("commandResults");if(!menus.length&&!employees.length){res.innerHTML=`<div class="command-empty">ไม่พบข้อมูลที่ตรงกับ “${term}”</div>`;return;}res.innerHTML=`${menus.length?`<div class="command-section-label">เมนู</div>${menus.map((x,i)=>`<button class="command-item ${i===0?"active":""}" data-go="${x[0]}"><span class="command-item-icon">${x[3]}</span><span class="command-item-text"><strong>${x[1]}</strong><small>${x[2]}</small></span></button>`).join("")}`:""}${employees.length?`<div class="command-section-label">พนักงาน</div>${employees.map(x=>`<button class="command-item" data-command-employee="${x.emp}"><span class="command-item-icon">♙</span><span class="command-item-text"><strong>${x.emp} ${x.name}</strong><small>เปิดรายละเอียดเวลาทำงาน</small></span></button>`).join("")}`:""}`;qa("[data-go]",res).forEach(b=>b.onclick=()=>go(b.dataset.go));qa("[data-command-employee]",res).forEach(b=>b.onclick=async()=>{go("attendance");const input=$("attendanceGridSearch");if(input){input.value=b.dataset.commandEmployee;input.dispatchEvent(new Event("input"));}else if(app()?.loadAttendance)await app().loadAttendance();});}
  function openCommand(){if(!$("commandBackdrop"))return;$("commandBackdrop").classList.remove("hidden");$("commandInput").value="";renderCommand();setTimeout(()=>$("commandInput")?.focus(),20);}
  function closeCommand(){$("commandBackdrop")?.classList.add("hidden");}
  function mountDrawer(){if($("notificationDrawer"))return;const d=document.createElement("aside");d.id="notificationDrawer";d.className="notification-drawer";d.innerHTML=`<div class="drawer-head"><div><small>TIME-CLOCK V6</small><h3>การแจ้งเตือน</h3></div><button id="drawerClose" class="btn btn-light btn-icon">×</button></div><div class="drawer-tabs"><button class="drawer-tab active">ทั้งหมด</button><button class="drawer-tab" data-drawer-go="review">รอตรวจสอบ</button><button class="drawer-tab" data-drawer-go="schedule">ตารางกะ</button></div><div class="drawer-body"><div class="notification-empty">กำลังโหลดการแจ้งเตือน...</div></div>`;document.body.appendChild(d);$("drawerClose").onclick=()=>d.classList.remove("open");qa("[data-drawer-go]",d).forEach(b=>b.onclick=()=>{go(b.dataset.drawerGo);d.classList.remove("open");});}
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

  const VERSION = "6.2.0";
  const $ = id => document.getElementById(id);
  const qs = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => [...r.querySelectorAll(s)];
  const app = () => window.TimeClockApp;
  const esc = v => String(v ?? "").replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]));
  const fmtDate = v => v ? new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString("th-TH",{day:"2-digit",month:"2-digit",year:"numeric"}) : "-";
  const fmtDateTime = v => v ? new Date(v).toLocaleString("th-TH",{dateStyle:"short",timeStyle:"short"}) : "-";
  const fmtTime = v => { if(!v) return "-"; const s=String(v); if(s.includes("T")||s.includes(" ")){const d=new Date(v);if(!Number.isNaN(d.getTime()))return d.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit",hour12:false});} return s.slice(0,5); };
  const num = v => Number(v || 0).toLocaleString("th-TH");
  const codeOf = r => r?.assigned_shift_code || r?.effective_shift_code || r?.shift_code || r?.auto_shift_code || null;
  const issueOf = r => String(r?.issue_type || r?.attendance_result || r?.attendance_status || r?.time_pair_status || "NEED_REVIEW").toUpperCase();
  const statusLabel = s => ({NORMAL:"ปกติ",ABSENT:"ไม่มีเวลา",MISSING_IN:"ไม่พบเวลาเข้า",MISSING_OUT:"ไม่พบเวลาออก",INVALID_TIME:"เวลาไม่ถูกต้อง",LATE:"มาสาย",EARLY_LEAVE:"กลับก่อน",LATE_AND_EARLY:"สายและกลับก่อน",WORKED_ON_OFFDAY:"ทำงานวันหยุด",NEED_REVIEW:"รอตรวจสอบ",HOLIDAY:"นักขัตฤกษ์",WEEKLY_OFF:"วันหยุดประจำสัปดาห์",INCOMPLETE_TIME:"เวลาไม่ครบ",COMPLETE:"ครบ",NO_TIME:"ไม่มีเวลา"})[s] || s || "-";

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
      adminCards.insertAdjacentHTML("afterbegin",`<button class="admin-module-card" data-admin-open="admin-employees"><span class="admin-module-icon">♟</span><div><strong>ข้อมูลพนักงาน</strong><small>ค้นหาและตรวจสอบสถานะพนักงานจากฐานข้อมูล</small></div><em>เปิด ›</em></button><button class="admin-module-card" data-admin-open="admin-audit"><span class="admin-module-icon">⌁</span><div><strong>Audit Log</strong><small>ประวัติการจัดกะ การล็อกเดือน และการปิด Review</small></div><em>เปิด ›</em></button>`);
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
        const titles={"admin-employees":["ข้อมูลพนักงาน","ค้นหาและตรวจสอบข้อมูลพนักงาน"],"admin-audit":["Audit Log","ประวัติการเปลี่ยนแปลงและการใช้งานระบบ"],"smart-assistant":["ผู้ช่วยวิเคราะห์","สรุปข้อมูลจาก Dashboard, Attendance, Schedule และ Review"]};
        if($("pageTitle"))$("pageTitle").textContent=titles[page][0]; if($("pageSubtitle"))$("pageSubtitle").textContent=titles[page][1];
        if(page==="admin-employees") loadEmployees(); if(page==="admin-audit") loadAudit();
      });
    });
  }

  function reportPageHtml(){
    const cards=[
      ["attendance","◷","รายละเอียดเวลาทำงาน","เวลาเข้า–ออก กะ ชั่วโมงสุทธิ สาย และกลับก่อน"],
      ["schedule","▣","ตารางจัดกะรายเดือน","กะอัตโนมัติ กะที่กำหนด สถานะยืนยัน และประเภทวัน"],
      ["review","⚠","รายการรอตรวจสอบ","Missing IN/OUT ไม่มีเวลา และทำงานวันหยุด"],
      ["summary","▦","สรุป Dashboard","สรุปจำนวนพนักงานและสถานะสำคัญ"],
      ["late","◴","มาสายและกลับก่อน","เฉพาะรายการที่มีนาทีมาสายหรือกลับก่อน"]
    ];
    return `<section id="page-report" class="page report-center-page"><div class="report-hero"><div><span class="eyebrow">ENTERPRISE REPORT CENTER</span><h2>ศูนย์รายงาน Time-Clock</h2><p>สร้างรายงาน CSV, Excel และ Print/PDF โดยไม่กระทบหน้าการทำงานหลัก</p></div><button id="reportRefreshJobsBtn" class="btn btn-light">รีเฟรชประวัติ</button></div><div class="panel section-gap"><div class="panel-body"><div class="report-filter-grid"><div class="field"><label>วันที่เริ่มต้น</label><input id="reportStart" class="input" type="date"></div><div class="field"><label>วันที่สิ้นสุด</label><input id="reportEnd" class="input" type="date"></div><div class="field"><label>พื้นที่</label><select id="reportZone" class="select"><option value="">ทุกพื้นที่</option></select></div><div class="field"><label>หน่วยงาน</label><select id="reportDepartment" class="select"><option value="">ทุกหน่วยงาน</option></select></div></div></div></div><div class="report-card-grid section-gap">${cards.map(c=>`<article class="report-type-card"><div class="report-icon">${c[1]}</div><h3>${c[2]}</h3><p>${c[3]}</p><div class="report-format-actions"><button class="btn btn-light" data-run-report-format="${c[0]}|csv">CSV</button><button class="btn btn-success" data-run-report-format="${c[0]}|excel">Excel</button><button class="btn btn-orange" data-run-report-format="${c[0]}|print">PDF</button></div></article>`).join("")}</div><div class="panel section-gap"><div class="panel-header"><div><h3>ประวัติการส่งออก</h3><p>เก็บประวัติใน Browser และบันทึก Log ใน Supabase เมื่อพร้อมใช้งาน</p></div><button id="reportClearJobsBtn" class="btn btn-danger-soft">ล้างประวัติ</button></div><div class="panel-body"><div class="table-wrap"><table><thead><tr><th>วันเวลา</th><th>รายงาน</th><th>ช่วงข้อมูล</th><th>จำนวนแถว</th><th>สถานะ</th><th>ไฟล์</th></tr></thead><tbody id="reportJobsBody"></tbody></table></div></div></div></section>`;
  }
  function employeePageHtml(){return `<section id="page-admin-employees" class="page employee-directory-page"><div class="directory-hero"><div><span class="eyebrow">EMPLOYEE DIRECTORY</span><h2>ข้อมูลพนักงาน</h2><p>ค้นหาพนักงานตามรหัส ชื่อ ตำแหน่ง หน่วยงาน และสถานะการทำงาน</p></div><button id="employeeExportBtn" class="btn btn-success">Export Excel</button></div><div class="panel section-gap"><div class="panel-body"><div class="fc-toolbar"><div class="field"><label>ค้นหา</label><input id="employeeDirectorySearch" class="input" placeholder="รหัส ชื่อ ตำแหน่ง หรือหน่วยงาน"></div><div class="field"><label>พื้นที่</label><select id="employeeDirectoryZone" class="select"><option value="">ทุกพื้นที่</option></select></div><div class="field"><label>หน่วยงาน</label><select id="employeeDirectoryDepartment" class="select"><option value="">ทุกหน่วยงาน</option></select></div><div class="field"><label>สถานะ</label><select id="employeeDirectoryActive" class="select"><option value="true">กำลังปฏิบัติงาน</option><option value="false">ทุกสถานะ</option></select></div><div class="toolbar-actions"><button id="employeeDirectoryLoadBtn" class="btn btn-primary">ค้นหา</button></div></div></div></div><div class="fc-card-grid section-gap"><article class="fc-stat-card"><span>ผลการค้นหา</span><strong id="employeeDirectoryCount">0</strong><small>คน</small></article><article class="fc-stat-card"><span>กำลังปฏิบัติงาน</span><strong id="employeeDirectoryActiveCount">0</strong><small>คน</small></article><article class="fc-stat-card"><span>รอเริ่มงาน</span><strong id="employeeDirectoryWaitingCount">0</strong><small>คน</small></article><article class="fc-stat-card"><span>พ้นสภาพ</span><strong id="employeeDirectoryResignedCount">0</strong><small>คน</small></article></div><div class="panel section-gap"><div class="panel-header"><div><h3>รายชื่อพนักงาน</h3><p id="employeeDirectoryMeta">ยังไม่ได้โหลดข้อมูล</p></div></div><div class="panel-body"><div class="table-wrap directory-table-wrap"><table class="directory-table"><thead><tr><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>ตำแหน่ง</th><th>หน่วยงาน</th><th>PC</th><th>พื้นที่</th><th>พื้นที่ย่อย</th><th>วันที่เริ่มงาน</th><th>วันที่ลาออก</th><th>สถานะ</th></tr></thead><tbody id="employeeDirectoryBody"></tbody></table></div></div></div></section>`;}
  function auditPageHtml(){return `<section id="page-admin-audit" class="page audit-center-page"><div class="audit-hero"><div><span class="eyebrow">SYSTEM AUDIT CENTER</span><h2>ประวัติการเปลี่ยนแปลง</h2><p>ตรวจสอบการจัดกะ การยืนยัน/ล็อกตาราง และการปิดรายการ Review</p></div><button id="auditExportBtn" class="btn btn-success">Export Excel</button></div><div class="panel section-gap"><div class="panel-body"><div class="fc-toolbar"><div class="field"><label>วันที่เริ่มต้น</label><input id="auditStart" class="input" type="date"></div><div class="field"><label>วันที่สิ้นสุด</label><input id="auditEnd" class="input" type="date"></div><div class="field"><label>ประเภท</label><select id="auditType" class="select"><option value="">ทั้งหมด</option><option value="SHIFT_ASSIGNMENT">การจัดกะ</option><option value="SCHEDULE_MONTH">สถานะตารางกะ</option><option value="REVIEW">Review</option></select></div><div class="field"><label>ค้นหา</label><input id="auditSearch" class="input" placeholder="ผู้ดำเนินการ รหัส หรือรายละเอียด"></div><div class="toolbar-actions"><button id="auditLoadBtn" class="btn btn-primary">ค้นหา</button></div></div></div></div><div class="panel section-gap"><div class="panel-header"><div><h3>Audit Log</h3><p id="auditCount">0 รายการ</p></div></div><div class="panel-body"><div class="table-wrap" style="max-height:68vh"><table><thead><tr><th>วันเวลา</th><th>ประเภท</th><th>การทำงาน</th><th>ผู้ดำเนินการ</th><th>รายการ</th><th>รายละเอียด</th></tr></thead><tbody id="auditBody"></tbody></table></div></div></div></section>`;}
  function assistantPageHtml(){return `<section id="page-smart-assistant" class="page smart-assistant-page"><div class="assistant-hero"><div><span class="eyebrow">SMART DATA ASSISTANT</span><h2>ผู้ช่วยวิเคราะห์ Time-Clock</h2><p>สรุปจากข้อมูลที่ระบบโหลดจริง โดยไม่ส่งข้อมูลออกไปภายนอก</p></div><span class="fc-chip status-PUBLISHED">Local Insight Engine</span></div><div class="assistant-shell section-gap"><div class="assistant-chat"><div id="assistantMessages" class="assistant-messages"><div class="assistant-message bot"><strong>สวัสดีครับ</strong>ถามข้อมูล เช่น “วันนี้ Missing OUT กี่คน”, “หน่วยงานไหนมาสายมากสุด” หรือ “กะเดือนนี้ยืนยันแล้วกี่เปอร์เซ็นต์”</div></div><div class="assistant-inputbar"><input id="assistantInput" class="input" placeholder="พิมพ์คำถามเกี่ยวกับข้อมูล Time-Clock"><button id="assistantSendBtn" class="btn btn-primary">ถาม</button></div></div><aside><div class="panel"><div class="panel-header"><div><h3>คำถามแนะนำ</h3><p>กดเพื่อถามได้ทันที</p></div></div><div class="panel-body assistant-prompts"><button class="assistant-prompt">วันนี้ Missing IN กี่คน</button><button class="assistant-prompt">วันนี้ Missing OUT กี่คน</button><button class="assistant-prompt">หน่วยงานไหนมาสายมากที่สุด</button><button class="assistant-prompt">กะเดือนนี้ยืนยันแล้วกี่เปอร์เซ็นต์</button><button class="assistant-prompt">สรุปรายการรอตรวจสอบ</button><div class="assistant-disclaimer">รุ่นนี้เป็น Rule-based Insight จากข้อมูลในระบบ ไม่ได้เชื่อมบริการ AI ภายนอก</div></div></div></aside></div></section>`;}

  /* ------------------------------------------------------------------
     Attendance Enterprise Grid
     ------------------------------------------------------------------ */
  const attGrid={search:"",sortKey:"work_date",sortDir:"desc",page:1,pageSize:100,rows:[]};
  function enhanceAttendance(){
    const page=$("page-attendance"); if(!page || $("attendanceEnterpriseTools")) return;
    const tablePanel=qs(".panel.section-gap",page);
    tablePanel?.insertAdjacentHTML("beforebegin",`<div id="attendanceEnterpriseTools" class="panel attendance-enterprise-tools"><div class="panel-body"><div class="fc-toolbar"><div class="field" style="min-width:290px"><label>ค้นหารหัสพนักงาน / กรองผลลัพธ์</label><input id="attendanceGridSearch" class="input" placeholder="ใส่รหัสพนักงานแล้วกด Enter เพื่อค้นหาทั้งฐานข้อมูล"><small id="attendanceSearchHint" style="display:block;margin-top:6px;color:var(--slate-500)">รหัสตัวเลขจะค้นหาจาก Supabase โดยตรง ส่วนชื่อ/หน่วยงานจะกรองจากข้อมูลที่โหลดแล้ว</small></div><div class="field"><label>จำนวนต่อหน้า</label><select id="attendancePageSize" class="select"><option>50</option><option selected>100</option><option>200</option><option value="999999">ทั้งหมด</option></select></div><div class="fc-toolbar-spacer"></div><div class="fc-actions"><button id="attendanceServerSearchBtn" class="btn btn-primary">ค้นหาทั้งฐานข้อมูล</button><button id="attendanceRebuildBtn" class="btn btn-light">ประมวลผลใหม่</button><button id="attendanceExcelBtn" class="btn btn-success">Excel</button><button id="attendancePrintBtn" class="btn btn-orange">Print/PDF</button></div></div><div id="attendanceDataNotice" class="mobileta-import-warning hidden" style="margin-top:12px"></div><div class="attendance-grid-summary"><div class="attendance-mini-kpi"><span>ผลลัพธ์</span><strong id="attGridTotal">0</strong></div><div class="attendance-mini-kpi"><span>ปกติ</span><strong id="attGridNormal">0</strong></div><div class="attendance-mini-kpi"><span>ไม่มีเวลา</span><strong id="attGridAbsent">0</strong></div><div class="attendance-mini-kpi"><span>เวลาไม่ครบ</span><strong id="attGridMissing">0</strong></div><div class="attendance-mini-kpi"><span>มาสาย</span><strong id="attGridLate">0</strong></div><div class="attendance-mini-kpi"><span>ทำงานวันหยุด</span><strong id="attGridOffday">0</strong></div></div></div></div>`);
    const table=qs("table",tablePanel); table?.classList.add("attendance-grid-table");
    const keys=["work_date","emp_code","full_name","department","zone","sub_area","shift_start","shift_end","shift_code","first_in","last_out","net_work_minutes","late_minutes","early_leave_minutes","status"];
    qsa("thead th",table).forEach((th,i)=>{th.dataset.sortKey=keys[i]; if(i===0)th.classList.add("sticky-att-1"); if(i===1)th.classList.add("sticky-att-2");});
    qs(".panel-body",tablePanel)?.insertAdjacentHTML("beforeend",`<div class="attendance-pagination"><button id="attPrevPage" class="btn btn-light">‹ ก่อนหน้า</button><span id="attPageInfo" class="page-info">หน้า 1 / 1</span><button id="attNextPage" class="btn btn-light">ถัดไป ›</button></div>`);
    document.body.insertAdjacentHTML("beforeend",`<aside id="attendanceDetailDrawer" class="attendance-detail-drawer"><div class="attendance-detail-head"><div><small>ATTENDANCE DETAIL</small><h3 id="attendanceDetailTitle">รายละเอียดเวลา</h3></div><button id="attendanceDetailClose" class="btn btn-light btn-icon">×</button></div><div id="attendanceDetailBody" class="attendance-detail-body"></div></aside>`);

    $("attendanceGridSearch")?.addEventListener("input",e=>{attGrid.search=e.target.value.trim().toLowerCase();attGrid.page=1;renderAttendanceEnterprise();updateAttendanceSearchHint();});
    $("attendanceGridSearch")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();app()?.loadAttendance?.();}});
    $("attendanceServerSearchBtn")?.addEventListener("click",()=>app()?.loadAttendance?.());
    $("attendanceRebuildBtn")?.addEventListener("click",rebuildAttendanceCurrentFilter);
    $("attendancePageSize")?.addEventListener("change",e=>{attGrid.pageSize=Number(e.target.value);attGrid.page=1;renderAttendanceEnterprise();});
    $("attPrevPage")?.addEventListener("click",()=>{if(attGrid.page>1){attGrid.page--;renderAttendanceEnterprise();}});
    $("attNextPage")?.addEventListener("click",()=>{const max=Math.ceil(attGrid.rows.length/attGrid.pageSize)||1;if(attGrid.page<max){attGrid.page++;renderAttendanceEnterprise();}});
    $("attendanceExcelBtn")?.addEventListener("click",()=>exportAttendanceEnterprise("excel"));
    $("attendancePrintBtn")?.addEventListener("click",()=>exportAttendanceEnterprise("print"));
    $("attendanceDetailClose")?.addEventListener("click",()=>$("attendanceDetailDrawer")?.classList.remove("open"));
    table?.addEventListener("click",e=>{
      const th=e.target.closest("th[data-sort-key]"); if(th){const k=th.dataset.sortKey;attGrid.sortDir=attGrid.sortKey===k&&attGrid.sortDir==="asc"?"desc":"asc";attGrid.sortKey=k;renderAttendanceEnterprise();return;}
      const tr=e.target.closest("tbody tr[data-att-key]"); if(tr) openAttendanceDetail(tr.dataset.attKey);
    });
  }
  function attendanceExactEmpCode(){const term=String($("attendanceGridSearch")?.value||"").trim();return /^\d{4,20}$/.test(term)?term:null;}
  function updateAttendanceSearchHint(){const term=String($("attendanceGridSearch")?.value||"").trim(),hint=$("attendanceSearchHint");if(!hint)return;hint.textContent=/^\d{4,20}$/.test(term)?`รหัส ${term}: กด Enter หรือ “ค้นหาทั้งฐานข้อมูล” เพื่อไม่ติดข้อจำกัด 1,000 แถว`:`ชื่อ/หน่วยงานจะกรองเฉพาะข้อมูลที่โหลดแล้ว กรุณาใช้รหัสพนักงานเมื่อต้องการผลครบทุกวัน`;}
  async function rebuildAttendanceCurrentFilter(){
    const emp=attendanceExactEmpCode(),start=$("attStart")?.value,end=$("attEnd")?.value;
    if(!emp)return app()?.toast?.("กรุณาระบุรหัสพนักงานเป็นตัวเลขก่อนประมวลผลใหม่","error");
    if(!start||!end)return app()?.toast?.("กรุณาระบุวันที่เริ่มต้นและวันที่สิ้นสุด","error");
    if(!confirm(`ประมวลผล Attendance ใหม่ของรหัส ${emp} ช่วง ${start} ถึง ${end}?`))return;
    try{
      app()?.showLoading?.(`กำลังประมวลผล Attendance รหัส ${emp}...`);
      const data=await rpc("ta_rebuild_attendance_employee",{p_emp_code:emp,p_start_date:start,p_end_date:end});
      const r=Array.isArray(data)?data[0]:data||{};
      app()?.toast?.(`ประมวลผลแล้ว ลบ ${num(r.deleted_rows)} / สร้าง ${num(r.inserted_rows)} รายการ`,"success");
      await app()?.loadAttendance?.();
    }catch(e){app()?.toast?.(app()?.humanError?.(e)||e.message,"error");}
    finally{app()?.hideLoading?.();}
  }
  function renderAttendanceDataNotice(detail={}){
    const box=$("attendanceDataNotice");if(!box)return;
    const exact=detail.empCode||attendanceExactEmpCode();
    if(exact){box.classList.remove("hidden");box.innerHTML=`<strong>ค้นหาจากฐานข้อมูลโดยตรง: ${esc(exact)}</strong><div>ระบบโหลดข้อมูลของพนักงานรหัสนี้ตามช่วงวันที่ที่เลือกครบถ้วน โดยไม่ใช้การค้นหาเฉพาะ 1,000 แถวแรก</div>`;return;}
    if(detail.reachedLimit){box.classList.remove("hidden");box.innerHTML=`<strong>ข้อมูลที่โหลดถึงขีดจำกัด 1,000 รายการ</strong><div>เมื่อต้องการตรวจพนักงานรายบุคคล กรุณาใส่รหัสพนักงานแล้วกด Enter เพื่อค้นหาจากฐานข้อมูลโดยตรง</div>`;return;}
    box.classList.add("hidden");box.innerHTML="";
  }
  function attendanceStatus(r){return String(r.attendance_result||r.attendance_status||"").toUpperCase();}
  function attendanceRows(){
    const term=attGrid.search; let rows=[...(app()?.state?.attendance||[])];
    if(term) rows=rows.filter(r=>[r.emp_code,r.full_name,r.department,r.zone,r.sub_area,codeOf(r),statusLabel(attendanceStatus(r))].some(v=>String(v||"").toLowerCase().includes(term)));
    const key=attGrid.sortKey,dir=attGrid.sortDir==="asc"?1:-1;
    rows.sort((a,b)=>{let av,bv;if(key==="shift_start"){av=app()?.attendanceShiftTime?.(a,"start");bv=app()?.attendanceShiftTime?.(b,"start");}else if(key==="shift_end"){av=app()?.attendanceShiftTime?.(a,"end");bv=app()?.attendanceShiftTime?.(b,"end");}else if(key==="shift_code"){av=codeOf(a);bv=codeOf(b);}else if(key==="status"){av=attendanceStatus(a);bv=attendanceStatus(b);}else{av=a[key];bv=b[key];}if(typeof av==="number"||typeof bv==="number")return (Number(av||0)-Number(bv||0))*dir;return String(av||"").localeCompare(String(bv||""),"th")*dir;});
    return rows;
  }
  function renderAttendanceEnterprise(){
    if(!$("attendanceBody"))return; const all=attendanceRows();attGrid.rows=all;const max=Math.max(1,Math.ceil(all.length/attGrid.pageSize));attGrid.page=Math.min(attGrid.page,max);const start=(attGrid.page-1)*attGrid.pageSize;const rows=all.slice(start,start+attGrid.pageSize);
    const shifts=app()?.state?.filters?.shifts||[];const shiftTime=(r,side)=>app()?.attendanceShiftTime?.(r,side)||(()=>{const m=shifts.find(s=>String(s.shift_code).toUpperCase()===String(codeOf(r)||"").toUpperCase())||{};return side==="start"?m.start_time:m.end_time;})();
    $("attendanceBody").innerHTML=rows.length?rows.map(r=>{const s=attendanceStatus(r),key=`${r.emp_code}|${String(r.work_date).slice(0,10)}`;return `<tr data-att-key="${esc(key)}"><td class="nowrap sticky-att-1">${fmtDate(r.work_date)}</td><td class="sticky-att-2"><strong>${esc(r.emp_code)}</strong></td><td class="nowrap">${esc(r.full_name)}</td><td>${esc(r.department||"-")}</td><td>${esc(r.zone||r.area||"-")}</td><td>${esc(r.sub_area||"-")}</td><td>${fmtTime(shiftTime(r,"start"))}</td><td>${fmtTime(shiftTime(r,"end"))}</td><td><span class="badge badge-blue">${esc(codeOf(r)||"-")}</span></td><td>${fmtTime(r.actual_in_at||r.first_in)}</td><td>${fmtTime(r.actual_out_at||r.last_out)}</td><td class="text-right">${(Number(r.net_work_minutes||0)/60).toLocaleString("th-TH",{minimumFractionDigits:1,maximumFractionDigits:1})}</td><td class="text-right">${num(r.late_minutes)}</td><td class="text-right">${num(r.early_leave_minutes)}</td><td><span class="fc-badge ${["NORMAL","COMPLETE"].includes(s)?"active":["ABSENT","MISSING_IN","MISSING_OUT","NEED_REVIEW"].includes(s)?"danger":"warning"}">${esc(statusLabel(s))}</span></td></tr>`;}).join(""):`<tr><td colspan="15" class="fc-empty">ไม่พบข้อมูล</td></tr>`;
    $("attendanceCount").textContent=`${num(all.length)} รายการ`;$("attGridTotal").textContent=num(all.length);$("attGridNormal").textContent=num(all.filter(r=>["NORMAL","COMPLETE"].includes(attendanceStatus(r))).length);$("attGridAbsent").textContent=num(all.filter(r=>["ABSENT","NO_TIME"].includes(attendanceStatus(r))).length);$("attGridMissing").textContent=num(all.filter(r=>["MISSING_IN","MISSING_OUT","INCOMPLETE_TIME"].includes(attendanceStatus(r))).length);$("attGridLate").textContent=num(all.filter(r=>Number(r.late_minutes||0)>0).length);$("attGridOffday").textContent=num(all.filter(r=>attendanceStatus(r)==="WORKED_ON_OFFDAY").length);
    $("attPageInfo").textContent=`หน้า ${attGrid.page.toLocaleString("th-TH")} / ${max.toLocaleString("th-TH")} • แสดง ${rows.length.toLocaleString("th-TH")} จาก ${all.length.toLocaleString("th-TH")}`;$("attPrevPage").disabled=attGrid.page<=1;$("attNextPage").disabled=attGrid.page>=max;
    qsa("thead th[data-sort-key]",$("page-attendance")).forEach(th=>{th.classList.toggle("sort-asc",th.dataset.sortKey===attGrid.sortKey&&attGrid.sortDir==="asc");th.classList.toggle("sort-desc",th.dataset.sortKey===attGrid.sortKey&&attGrid.sortDir==="desc");});
  }
  function openAttendanceDetail(key){const [emp,date]=key.split("|");const r=(app()?.state?.attendance||[]).find(x=>String(x.emp_code)===emp&&String(x.work_date).slice(0,10)===date);if(!r)return;$("attendanceDetailTitle").textContent=`${r.emp_code} • ${r.full_name||""}`;const fields=[["วันที่",fmtDate(r.work_date)],["หน่วยงาน",r.department],["พื้นที่",r.zone||r.area],["พื้นที่ย่อย",r.sub_area],["กะ",codeOf(r)],["เวลาเริ่มกะ",fmtTime(app()?.attendanceShiftTime?.(r,"start"))],["เวลาสิ้นสุดกะ",fmtTime(app()?.attendanceShiftTime?.(r,"end"))],["เวลาเข้า",fmtTime(r.actual_in_at||r.first_in)],["เวลาออก",fmtTime(r.actual_out_at||r.last_out)],["ชั่วโมงสุทธิ",(Number(r.net_work_minutes||0)/60).toFixed(2)],["มาสาย",`${Number(r.late_minutes||0)} นาที`],["กลับก่อน",`${Number(r.early_leave_minutes||0)} นาที`],["สถานะ",statusLabel(attendanceStatus(r))],["แหล่งกะ",r.schedule_source||"-"],["หมายเหตุ",r.schedule_note||"-"]];$("attendanceDetailBody").innerHTML=`<div class="attendance-detail-grid">${fields.map(x=>`<div class="attendance-detail-item"><span>${esc(x[0])}</span><strong>${esc(x[1]??"-")}</strong></div>`).join("")}</div><div class="fc-actions"><button class="btn btn-primary" data-detail-open-schedule="${esc(emp)}|${esc(date)}">เปิดจัดกะวันนี้</button></div>`;$("attendanceDetailDrawer").classList.add("open");}
  function attendanceExportRows(){const rows=attendanceRows();return [["วันที่","รหัสพนักงาน","ชื่อ-นามสกุล","หน่วยงาน","พื้นที่","พื้นที่ย่อย","เวลาเริ่มกะ","เวลาสิ้นสุดกะ","กะ","เวลาเข้า","เวลาออก","ชั่วโมงสุทธิ","มาสาย(นาที)","กลับก่อน(นาที)","สถานะ"],...rows.map(r=>[fmtDate(r.work_date),r.emp_code,r.full_name,r.department,r.zone||r.area,r.sub_area,fmtTime(app()?.attendanceShiftTime?.(r,"start")),fmtTime(app()?.attendanceShiftTime?.(r,"end")),codeOf(r),fmtTime(r.actual_in_at||r.first_in),fmtTime(r.actual_out_at||r.last_out),(Number(r.net_work_minutes||0)/60).toFixed(2),r.late_minutes||0,r.early_leave_minutes||0,statusLabel(attendanceStatus(r))])];}
  function exportAttendanceEnterprise(format){const rows=attendanceExportRows();if(rows.length<=1)return app()?.toast("ไม่มีข้อมูลสำหรับส่งออก","error");const base=`Attendance_${$("attStart")?.value}_${$("attEnd")?.value}`;format==="excel"?exportExcel(`${base}.xls`,rows,"รายละเอียดเวลาทำงาน"):printRows(rows,"รายละเอียดเวลาทำงาน",`${$("attStart")?.value} ถึง ${$("attEnd")?.value}`);}

  /* ------------------------------------------------------------------
     Schedule completion
     ------------------------------------------------------------------ */
  let scheduleMonthStatus={status:"DRAFT"};
  function enhanceSchedule(){const workspace=qs("#page-schedule .schedule-workspace");if(!workspace||$("scheduleWorkflowBar"))return;qs(".schedule-summary-strip",workspace)?.insertAdjacentHTML("afterend",`<div id="scheduleWorkflowBar" class="schedule-workflow-bar"><div class="workflow-summary"><span id="scheduleMonthStatusChip" class="fc-chip status-DRAFT">DRAFT</span><div><strong id="scheduleMonthStatusText">ตารางกะฉบับร่าง</strong><div id="scheduleMonthStatusMeta" class="fc-note">ยังไม่ได้ประกาศ</div></div></div><div class="workflow-actions"><button id="scheduleFillDownBtn" class="btn btn-light">Fill Down</button><button id="scheduleFillRightBtn" class="btn btn-light">Fill Right</button><button id="schedulePatternBtn" class="btn btn-light">รูปแบบ 7 วัน</button><button id="schedulePrevWeekCopyBtn" class="btn btn-light">คัดลอกสัปดาห์ก่อน</button><button id="scheduleExportExcelBtn" class="btn btn-success">Excel</button><button id="schedulePrintBtn" class="btn btn-orange">Print/PDF</button><button id="scheduleHistoryBtn" class="btn btn-light">ประวัติ</button><button id="scheduleConfirmAllBtn" class="btn btn-success">ยืนยันกะที่จัดไว้ทั้งหมด</button><button id="schedulePublishBtn" class="btn btn-primary">ประกาศกะ</button><button id="scheduleLockBtn" class="btn btn-danger-soft">ล็อกเดือน</button></div></div>`);
    document.body.insertAdjacentHTML("beforeend",scheduleModalsHtml());
    $("scheduleFillDownBtn")?.addEventListener("click",()=>fillSchedule("down"));$("scheduleFillRightBtn")?.addEventListener("click",()=>fillSchedule("right"));$("schedulePatternBtn")?.addEventListener("click",openPatternModal);$("schedulePrevWeekCopyBtn")?.addEventListener("click",copyPreviousWeek);$("scheduleExportExcelBtn")?.addEventListener("click",()=>exportSchedule("excel"));$("schedulePrintBtn")?.addEventListener("click",()=>exportSchedule("print"));$("scheduleHistoryBtn")?.addEventListener("click",loadScheduleHistory);$("scheduleConfirmAllBtn")?.addEventListener("click",confirmAllAssigned);$("schedulePublishBtn")?.addEventListener("click",publishSchedule);$("scheduleLockBtn")?.addEventListener("click",toggleScheduleLock);$("applySchedulePatternBtn")?.addEventListener("click",applyPattern);$("scheduleHistoryClose")?.addEventListener("click",()=>$("scheduleHistoryModal")?.classList.add("hidden"));$("schedulePatternClose")?.addEventListener("click",()=>$("schedulePatternModal")?.classList.add("hidden"));
    document.addEventListener("click",e=>{const x=e.target.closest("[data-detail-open-schedule]");if(x){const [emp,date]=x.dataset.detailOpenSchedule.split("|");$("attendanceDetailDrawer")?.classList.remove("open");app()?.switchPage?.("schedule");const month=date.slice(0,7);if($("scheduleMonth"))$("scheduleMonth").value=month;app()?.loadSchedule?.().then(()=>app()?.openAssignment?.(emp,date));}});
    const guardLocked=e=>{if(scheduleMonthStatus.status!=="LOCKED")return;const blocked=e.target.closest("#page-schedule [data-quick-shift],#page-schedule #scheduleClearCellsBtn,#page-schedule #scheduleConfirmSelectedBtn,#page-schedule [data-schedule-cell],#saveAssignmentBtn,#deleteAssignmentBtn");if(blocked){e.preventDefault();e.stopImmediatePropagation();app()?.toast("ตารางกะเดือนนี้ถูกล็อก กรุณาปลดล็อกก่อนแก้ไข","error");}};
    document.addEventListener("click",guardLocked,true);document.addEventListener("dblclick",guardLocked,true);
  }
  function scheduleModalsHtml(){return `<div id="schedulePatternModal" class="modal-backdrop hidden fc-modal-wide"><div class="modal"><div class="modal-header"><h3>กำหนดรูปแบบกะ 7 วัน</h3><button id="schedulePatternClose" class="btn btn-light btn-icon">×</button></div><div class="modal-body"><p class="fc-note">เลือกรูปแบบตามวันในสัปดาห์ แล้วนำไปใช้กับช่องที่เลือก</p><div class="schedule-pattern-grid">${["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"].map((d,i)=>`<label class="schedule-pattern-day"><span>${d}</span><select class="select" data-pattern-dow="${i}"><option>D</option><option>N</option><option>OFF</option><option>HOL</option><option>LV</option></select></label>`).join("")}</div></div><div class="modal-footer"><button id="applySchedulePatternBtn" class="btn btn-primary">นำไปใช้กับช่องที่เลือก</button></div></div></div><div id="scheduleHistoryModal" class="modal-backdrop hidden fc-modal-wide"><div class="modal"><div class="modal-header"><h3>ประวัติการจัดกะ</h3><button id="scheduleHistoryClose" class="btn btn-light btn-icon">×</button></div><div class="modal-body"><div class="table-wrap" style="max-height:65vh"><table><thead><tr><th>วันเวลา</th><th>รหัส</th><th>วันที่</th><th>เดิม</th><th>ใหม่</th><th>การทำงาน</th><th>ผู้ดำเนินการ</th><th>เหตุผล</th></tr></thead><tbody id="scheduleHistoryBody"></tbody></table></div></div></div></div>`;}
  function selectedScheduleCells(){return qsa("#scheduleTableWrap .schedule-data-cell.cell-selected [data-schedule-cell],#scheduleTableWrap td.cell-selected [data-schedule-cell]");}
  function rowAt(emp,date){return (app()?.state?.schedule||[]).find(r=>String(r.emp_code)===String(emp)&&String(r.work_date).slice(0,10)===String(date).slice(0,10));}
  async function saveSchedulePayload(payload,reason,confirmNow=false){if(!payload.length)return app()?.toast("กรุณาเลือกช่องกะก่อน","error");if(scheduleMonthStatus.status==="LOCKED")return app()?.toast("ตารางกะเดือนนี้ถูกล็อก","error");app()?.showLoading?.(`กำลังบันทึก ${payload.length.toLocaleString("th-TH")} รายการ...`);try{await window.TimeClockShiftAPI.assignBulk(app(),payload,reason,confirmNow);app()?.toast(`บันทึก ${payload.length.toLocaleString("th-TH")} รายการแล้ว`,"success");await app()?.loadSchedule?.();}catch(e){app()?.toast(app()?.humanError?.(e)||e.message,"error");}finally{app()?.hideLoading?.();}}
  function selectedCellMeta(){return selectedScheduleCells().map(c=>{const td=c.closest("td"),tr=td.closest("tr");return {cell:c,td,tr,emp:c.dataset.emp,date:c.dataset.date,row:rowAt(c.dataset.emp,c.dataset.date),ri:[...tr.parentElement.children].indexOf(tr),ci:[...tr.children].indexOf(td)};});}
  async function fillSchedule(direction){const items=selectedCellMeta();if(!items.length)return app()?.toast("กรุณาเลือกช่วงกะก่อน","error");const groups=new Map();items.forEach(x=>{const k=direction==="down"?x.ci:x.ri;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);});const payload=[];groups.forEach(g=>{g.sort((a,b)=>direction==="down"?a.ri-b.ri:a.ci-b.ci);const source=codeOf(g[0].row)||g[0].cell.dataset.shift||"D";g.forEach(x=>payload.push({emp_code:x.emp,work_date:x.date,shift_code:source,note:`${direction==="down"?"Fill Down":"Fill Right"} จาก Schedule V6`}));});await saveSchedulePayload(payload,direction==="down"?"Fill Down จาก Schedule V6":"Fill Right จาก Schedule V6");}
  function openPatternModal(){if(!selectedScheduleCells().length)return app()?.toast("กรุณาเลือกช่องกะก่อน","error");$("schedulePatternModal")?.classList.remove("hidden");}
  async function applyPattern(){const patterns={};qsa("[data-pattern-dow]").forEach(s=>patterns[Number(s.dataset.patternDow)]=s.value);const payload=selectedCellMeta().map(x=>({emp_code:x.emp,work_date:x.date,shift_code:patterns[new Date(`${x.date}T00:00:00`).getDay()]||"D",note:"รูปแบบกะ 7 วัน"}));$("schedulePatternModal")?.classList.add("hidden");await saveSchedulePayload(payload,"กำหนดรูปแบบกะ 7 วัน");}
  async function copyPreviousWeek(){const items=selectedCellMeta();if(!items.length)return app()?.toast("กรุณาเลือกช่องปลายทางก่อน","error");const payload=items.map(x=>{const d=new Date(`${x.date}T00:00:00`);d.setDate(d.getDate()-7);const sourceDate=d.toISOString().slice(0,10);const source=rowAt(x.emp,sourceDate);return {emp_code:x.emp,work_date:x.date,shift_code:codeOf(source)||"D",note:`คัดลอกจาก ${sourceDate}`};});await saveSchedulePayload(payload,"คัดลอกกะจากสัปดาห์ก่อน");}
  function scheduleExportRows(){const rows=app()?.state?.schedule||[];return [["วันที่","รหัสพนักงาน","ชื่อ-นามสกุล","หน่วยงาน","พื้นที่","ประเภทวัน","กะอัตโนมัติ","กะที่กำหนด","กะใช้งาน","สถานะ","ยืนยันแล้ว","เวลาเริ่มกะ","เวลาสิ้นสุดกะ"],...rows.map(r=>[fmtDate(r.work_date),r.emp_code,r.full_name,r.department,r.zone||r.area,r.day_type||"WORKDAY",r.auto_shift_code||"",r.assigned_shift_code||"",codeOf(r)||"",r.schedule_status||"",r.is_confirmed?"ใช่":"ไม่ใช่",fmtTime(r.shift_start_time),fmtTime(r.shift_end_time)])];}
  function exportSchedule(format){const rows=scheduleExportRows();if(rows.length<=1)return app()?.toast("ไม่มีข้อมูลตารางกะ","error");const m=$("scheduleMonth")?.value||"month";format==="excel"?exportExcel(`Schedule_${m}.xls`,rows,`ตารางจัดกะ ${m}`):printRows(rows,`ตารางจัดกะ ${m}`,`สถานะ ${scheduleMonthStatus.status}`);}
  async function loadScheduleStatus(){if(!$("scheduleMonth")?.value)return;try{scheduleMonthStatus=await rpc("ta_get_schedule_month_status",{p_month:`${$("scheduleMonth").value}-01`,p_zone:$("scheduleZone")?.value||null,p_department:$("scheduleDepartment")?.value||null})||{status:"DRAFT"};}catch(e){scheduleMonthStatus={status:"DRAFT"};}renderScheduleStatus();}
  function renderScheduleStatus(){const s=scheduleMonthStatus.status||"DRAFT",chip=$("scheduleMonthStatusChip");if(chip){chip.textContent=s;chip.className=`fc-chip status-${s}`;}if($("scheduleMonthStatusText"))$("scheduleMonthStatusText").textContent=s==="LOCKED"?"ตารางกะถูกล็อก":s==="PUBLISHED"?"ประกาศตารางกะแล้ว":"ตารางกะฉบับร่าง";if($("scheduleMonthStatusMeta"))$("scheduleMonthStatusMeta").textContent=scheduleMonthStatus.updated_at?`ปรับปรุง ${fmtDateTime(scheduleMonthStatus.updated_at)}${scheduleMonthStatus.published_by_email?` โดย ${scheduleMonthStatus.published_by_email}`:""}`:"ยังไม่ได้ประกาศ";if($("schedulePublishBtn"))$("schedulePublishBtn").textContent=s==="PUBLISHED"||s==="LOCKED"?"กลับเป็นฉบับร่าง":"ประกาศกะ";if($("scheduleLockBtn"))$("scheduleLockBtn").textContent=s==="LOCKED"?"ปลดล็อกเดือน":"ล็อกเดือน";qs("#page-schedule .schedule-workspace")?.classList.toggle("schedule-locked-overlay",s==="LOCKED");qsa("#scheduleTableWrap [data-schedule-cell]").forEach(c=>{c.classList.toggle("is-published",s==="PUBLISHED");c.classList.toggle("is-locked",s==="LOCKED");});}
  async function setScheduleStatus(action){const label={PUBLISH:"ประกาศตารางกะ",DRAFT:"กลับเป็นฉบับร่าง",LOCK:"ล็อกตารางกะ",UNLOCK:"ปลดล็อกตารางกะ"}[action];if(!confirm(`${label} เดือน ${$("scheduleMonth")?.value}?`))return;try{app()?.showLoading?.(`กำลัง${label}...`);scheduleMonthStatus=await rpc("ta_set_schedule_month_status",{p_month:`${$("scheduleMonth").value}-01`,p_zone:$("scheduleZone")?.value||null,p_department:$("scheduleDepartment")?.value||null,p_action:action,p_note:`ดำเนินการจากหน้า Schedule V${VERSION}`});renderScheduleStatus();app()?.toast(`${label}เรียบร้อย`,"success");loadNotifications();}catch(e){app()?.toast(app()?.humanError?.(e)||e.message,"error");}finally{app()?.hideLoading?.();}}
  async function confirmAllAssigned(){const rows=(app()?.state?.schedule||[]).filter(r=>r.assigned_shift_code&&!r.is_confirmed);if(!rows.length)return app()?.toast("ไม่มีกะที่จัดไว้และรอยืนยัน","error");if(!confirm(`ยืนยันกะที่จัดไว้ทั้งหมด ${rows.length.toLocaleString("th-TH")} รายการ?`))return;await saveSchedulePayload(rows.map(r=>({emp_code:r.emp_code,work_date:String(r.work_date).slice(0,10),shift_code:r.assigned_shift_code,note:"ยืนยันกะทั้งหมดประจำเดือน"})),"ยืนยันกะที่จัดไว้ทั้งหมด",true);}
  function publishSchedule(){setScheduleStatus(["PUBLISHED","LOCKED"].includes(scheduleMonthStatus.status)?"DRAFT":"PUBLISH");}
  function toggleScheduleLock(){setScheduleStatus(scheduleMonthStatus.status==="LOCKED"?"UNLOCK":"LOCK");}
  async function loadScheduleHistory(){try{const rows=await rpc("ta_get_shift_assignment_history",{p_emp_code:null,p_work_date:null,p_limit:500})||[];$("scheduleHistoryBody").innerHTML=rows.length?rows.map(r=>`<tr><td>${fmtDateTime(r.changed_at)}</td><td>${esc(r.emp_code)}</td><td>${fmtDate(r.work_date)}</td><td>${esc(r.old_shift_code||"-")}</td><td>${esc(r.new_shift_code||"-")}</td><td>${esc(r.action_type)}</td><td>${esc(r.changed_by_email||"-")}</td><td>${esc(r.change_reason||r.note||"-")}</td></tr>`).join(""):`<tr><td colspan="8" class="fc-empty">ไม่พบประวัติ</td></tr>`;$("scheduleHistoryModal")?.classList.remove("hidden");}catch(e){app()?.toast(app()?.humanError?.(e)||e.message,"error");}}

  /* ------------------------------------------------------------------
     Review resolution
     ------------------------------------------------------------------ */
  function enhanceReview(){const controls=qs("#reviewBulkBar .review-bulk-controls");if(!controls||$("reviewResolveBtn"))return;controls.insertAdjacentHTML("afterbegin",`<input id="reviewResolutionNote" class="input review-note-input" placeholder="หมายเหตุการปิดรายการ"><button id="reviewResolveBtn" class="btn btn-success">ปิดรายการ</button><button id="reviewIgnoreBtn" class="btn btn-light">ละเว้น</button>`);qs("#page-review .review-hero-actions")?.insertAdjacentHTML("afterbegin",`<button id="reviewExcelBtn" class="btn btn-success">Excel</button><button id="reviewPrintBtn" class="btn btn-orange">Print/PDF</button>`);$("reviewResolveBtn")?.addEventListener("click",()=>resolveReview("RESOLVED"));$("reviewIgnoreBtn")?.addEventListener("click",()=>resolveReview("IGNORED"));$("reviewExcelBtn")?.addEventListener("click",()=>exportReview("excel"));$("reviewPrintBtn")?.addEventListener("click",()=>exportReview("print"));}
  function checkedReview(){return qsa("#reviewBody [data-review-check]:checked").map(cb=>{const [emp_code,work_date]=cb.dataset.reviewCheck.split("|");const r=(app()?.state?.review||[]).find(x=>String(x.emp_code)===emp_code&&String(x.work_date).slice(0,10)===work_date);return {emp_code,work_date,issue_type:issueOf(r),note:$("reviewResolutionNote")?.value||null};});}
  async function resolveReview(action){const rows=checkedReview();if(!rows.length)return app()?.toast("กรุณาเลือกรายการก่อน","error");if(!confirm(`${action==="RESOLVED"?"ปิด":"ละเว้น"} ${rows.length} รายการ?`))return;try{app()?.showLoading?.("กำลังบันทึกผลการตรวจสอบ...");await rpc("ta_resolve_review_items",{p_rows:rows,p_action:action,p_note:$("reviewResolutionNote")?.value||null});app()?.toast("บันทึกผลการตรวจสอบเรียบร้อย","success");await app()?.loadReview?.();loadNotifications();}catch(e){app()?.toast(app()?.humanError?.(e)||e.message,"error");}finally{app()?.hideLoading?.();}}
  function reviewExportRows(){const rows=app()?.state?.review||[];return [["วันที่","รหัสพนักงาน","ชื่อ-นามสกุล","หน่วยงาน","กะตั้งต้น","กะแนะนำ","ความมั่นใจ","เวลาเข้า","เวลาออก","ประเภทปัญหา"],...rows.map(r=>[fmtDate(r.work_date),r.emp_code,r.full_name,r.department,r.auto_shift_code,r.suggested_shift_code,r.suggestion_confidence,fmtTime(r.actual_in_at||r.first_in),fmtTime(r.actual_out_at||r.last_out),statusLabel(issueOf(r))])];}
  function exportReview(format){const rows=reviewExportRows();if(rows.length<=1)return app()?.toast("ไม่มีข้อมูล Review","error");format==="excel"?exportExcel(`Review_${$("reviewStart")?.value}_${$("reviewEnd")?.value}.xls`,rows,"รายการรอตรวจสอบ"):printRows(rows,"รายการรอตรวจสอบ",`${$("reviewStart")?.value} ถึง ${$("reviewEnd")?.value}`);}

  /* ------------------------------------------------------------------
     Employee Directory / Audit
     ------------------------------------------------------------------ */
  let employeeRows=[],auditRows=[];
  async function loadEmployees(){if((app()?.state?.profile?._realRole||app()?.state?.profile?.role)!=="HR_ADMIN")return;try{app()?.showLoading?.("กำลังโหลดข้อมูลพนักงาน...");employeeRows=await rpc("ta_get_employee_directory",{p_search:$("employeeDirectorySearch")?.value||null,p_zone:$("employeeDirectoryZone")?.value||null,p_department:$("employeeDirectoryDepartment")?.value||null,p_active_only:$("employeeDirectoryActive")?.value!=="false",p_limit:5000,p_offset:0})||[];renderEmployees();}catch(e){app()?.toast(app()?.humanError?.(e)||e.message,"error");}finally{app()?.hideLoading?.();}}
  function renderEmployees(){const body=$("employeeDirectoryBody");if(!body)return;body.innerHTML=employeeRows.length?employeeRows.map(r=>`<tr><td><strong>${esc(r.emp_code)}</strong></td><td class="employee-name-cell"><strong>${esc(r.full_name||"-")}</strong><small>${esc(r.position_name||"")}</small></td><td>${esc(r.position_name||"-")}</td><td>${esc(r.department||"-")}</td><td>${esc(r.pc||"-")}</td><td>${esc(r.zone||r.area||"-")}</td><td>${esc(r.sub_area||"-")}</td><td>${fmtDate(r.start_date)}</td><td>${fmtDate(r.resign_date)}</td><td><span class="fc-badge ${r.employment_status==="ACTIVE"?"active":r.employment_status==="WAITING_START"?"waiting":"resigned"}">${r.employment_status==="ACTIVE"?"ปฏิบัติงาน":r.employment_status==="WAITING_START"?"รอเริ่มงาน":"พ้นสภาพ"}</span></td></tr>`).join(""):`<tr><td colspan="10" class="fc-empty">ไม่พบข้อมูลพนักงาน</td></tr>`;const total=Number(employeeRows[0]?.total_count||employeeRows.length);$("employeeDirectoryCount").textContent=num(total);$("employeeDirectoryActiveCount").textContent=num(employeeRows.filter(r=>r.employment_status==="ACTIVE").length);$("employeeDirectoryWaitingCount").textContent=num(employeeRows.filter(r=>r.employment_status==="WAITING_START").length);$("employeeDirectoryResignedCount").textContent=num(employeeRows.filter(r=>r.employment_status==="RESIGNED").length);$("employeeDirectoryMeta").textContent=`แสดง ${employeeRows.length.toLocaleString("th-TH")} จาก ${total.toLocaleString("th-TH")} คน`;}
  function exportEmployees(){const rows=[["รหัสพนักงาน","ชื่อ-นามสกุล","ตำแหน่ง","หน่วยงาน","PC","พื้นที่","พื้นที่ย่อย","วันที่เริ่มงาน","วันที่ลาออก","สถานะ"],...employeeRows.map(r=>[r.emp_code,r.full_name,r.position_name,r.department,r.pc,r.zone||r.area,r.sub_area,fmtDate(r.start_date),fmtDate(r.resign_date),r.employment_status])];exportExcel(`Employee_Directory_${new Date().toISOString().slice(0,10)}.xls`,rows,"ข้อมูลพนักงาน");}
  async function loadAudit(){try{app()?.showLoading?.("กำลังโหลด Audit Log...");auditRows=await rpc("ta_get_system_audit",{p_start_date:$("auditStart")?.value,p_end_date:$("auditEnd")?.value,p_action_type:$("auditType")?.value||null,p_search:$("auditSearch")?.value||null,p_limit:2000})||[];renderAudit();}catch(e){app()?.toast(app()?.humanError?.(e)||e.message,"error");}finally{app()?.hideLoading?.();}}
  function renderAudit(){const body=$("auditBody");if(!body)return;body.innerHTML=auditRows.length?auditRows.map(r=>`<tr><td>${fmtDateTime(r.event_at)}</td><td><span class="fc-badge info">${esc(r.event_type)}</span></td><td>${esc(r.action_type||"-")}</td><td>${esc(r.actor_email||"-")}</td><td>${esc(r.entity_key||"-")}</td><td>${esc(r.detail||"-")}</td></tr>`).join(""):`<tr><td colspan="6" class="fc-empty">ไม่พบ Audit Log</td></tr>`;$("auditCount").textContent=`${auditRows.length.toLocaleString("th-TH")} รายการ`;}
  function exportAudit(){const rows=[["วันเวลา","ประเภท","การทำงาน","ผู้ดำเนินการ","รายการ","รายละเอียด"],...auditRows.map(r=>[fmtDateTime(r.event_at),r.event_type,r.action_type,r.actor_email,r.entity_key,r.detail])];exportExcel(`Audit_Log_${$("auditStart")?.value}_${$("auditEnd")?.value}.xls`,rows,"Audit Log");}

  /* ------------------------------------------------------------------
     Assistant
     ------------------------------------------------------------------ */
  function askAssistant(text){const q=String(text||"").trim();if(!q)return;appendAssistant(q,"user");const answer=answerAssistant(q);setTimeout(()=>appendAssistant(answer,"bot"),180);}
  function appendAssistant(text,type){const box=$("assistantMessages");if(!box)return;const el=document.createElement("div");el.className=`assistant-message ${type}`;el.innerHTML=type==="bot"?`<strong>ผลวิเคราะห์</strong>${esc(text).replace(/\n/g,"<br>")}`:esc(text);box.appendChild(el);box.scrollTop=box.scrollHeight;}
  function answerAssistant(question){const q=question.toLowerCase();const att=app()?.state?.attendance||[],review=app()?.state?.review||[],sch=app()?.state?.schedule||[],dash=app()?.state?.dashboard||{};
    if(q.includes("missing in")||q.includes("ไม่พบเวลาเข้า")){const n=review.filter(r=>issueOf(r)==="MISSING_IN").length||Number(dash.missing_in_rows||0);return `พบรายการไม่พบเวลาเข้า ${num(n)} รายการ ตามช่วงข้อมูลที่โหลดล่าสุด`;}
    if(q.includes("missing out")||q.includes("ไม่พบเวลาออก")){const n=review.filter(r=>issueOf(r)==="MISSING_OUT").length||Number(dash.missing_out_rows||0);return `พบรายการไม่พบเวลาออก ${num(n)} รายการ ตามช่วงข้อมูลที่โหลดล่าสุด`;}
    if(q.includes("ไม่มีเวลา")||q.includes("absent")){const n=review.filter(r=>["ABSENT","NO_TIME"].includes(issueOf(r))).length||Number(dash.absent_rows||dash.no_time_rows||0);return `พบพนักงาน/วันทำงานที่ไม่มีข้อมูลเวลา ${num(n)} รายการ`;}
    if(q.includes("มาสาย")&&q.includes("หน่วยงาน")){const m={};att.forEach(r=>{if(Number(r.late_minutes||0)>0){const k=r.department||"ไม่ระบุ";m[k]=(m[k]||0)+Number(r.late_minutes||0);}});const top=Object.entries(m).sort((a,b)=>b[1]-a[1])[0];return top?`หน่วยงานที่มีนาทีมาสายรวมสูงสุดคือ ${top[0]} จำนวน ${num(top[1])} นาที จากข้อมูลรายละเอียดเวลาที่โหลดล่าสุด`:`ยังไม่มีข้อมูลมาสายในรายละเอียดเวลาที่โหลดล่าสุด`;}
    if(q.includes("ยืนยัน")&&q.includes("กะ")){const total=sch.length,confirmed=sch.filter(r=>r.is_confirmed||r.schedule_status==="CONFIRMED").length,pct=total?confirmed/total*100:0;return `ตารางกะที่โหลดล่าสุดยืนยันแล้ว ${num(confirmed)} จาก ${num(total)} ช่อง คิดเป็น ${pct.toLocaleString("th-TH",{maximumFractionDigits:1})}%`;}
    if(q.includes("รอตรวจสอบ")||q.includes("review")){const counts={};review.forEach(r=>counts[issueOf(r)]=(counts[issueOf(r)]||0)+1);const detail=Object.entries(counts).map(([k,v])=>`${statusLabel(k)} ${num(v)}`).join(" • ");return review.length?`มีรายการรอตรวจสอบ ${num(review.length)} รายการ\n${detail}`:`ไม่พบรายการรอตรวจสอบในข้อมูลที่โหลดล่าสุด`;}
    if(q.includes("สรุป")||q.includes("dashboard")){return `พนักงาน ${num(dash.total_employees)} คน • รายการทั้งหมด ${num(dash.total_rows)} • ลงเวลาครบ ${num(dash.complete_time_rows)} • รอตรวจสอบ ${num(dash.need_review_rows)}`;}
    return "ยังไม่พบรูปแบบคำถามนี้ ลองถามเรื่อง Missing IN, Missing OUT, ไม่มีเวลา, หน่วยงานที่มาสาย, เปอร์เซ็นต์ยืนยันกะ หรือสรุปรายการรอตรวจสอบ";
  }

  /* ------------------------------------------------------------------
     Notifications
     ------------------------------------------------------------------ */
  async function loadNotifications(){const body=qs("#notificationDrawer .drawer-body");if(!body)return;try{const rows=await rpc("ta_get_notification_feed",{p_start_date:new Date(Date.now()-7*86400000).toISOString().slice(0,10),p_end_date:new Date().toISOString().slice(0,10),p_limit:50})||[];body.innerHTML=rows.length?rows.map(r=>`<button class="notice-card severity-${esc(r.severity)}" data-notice-page="${esc(r.target_page||"dashboard")}"><span class="notice-dot"></span><div><strong>${esc(r.title)}</strong><p>${esc(r.message)}</p><time>${fmtDate(r.event_date)}</time></div></button>`).join(""):`<div class="notification-empty">ไม่มีการแจ้งเตือนใหม่</div>`;const badge=$("notificationCount");if(badge)badge.textContent=rows.length;body.onclick=e=>{const b=e.target.closest("[data-notice-page]");if(b){app()?.switchPage?.(b.dataset.noticePage);$("notificationDrawer")?.classList.remove("open");}};}catch(e){body.innerHTML=`<div class="notification-empty">ไม่สามารถโหลดการแจ้งเตือนจากฐานข้อมูล<br><small>${esc(e.message||"")}</small></div>`;}}

  /* ------------------------------------------------------------------
     Init / Events
     ------------------------------------------------------------------ */
  function setDefaults(){const today=new Date(),end=today.toISOString().slice(0,10),start=new Date(today.getFullYear(),today.getMonth(),1).toISOString().slice(0,10),monthAgo=new Date(today);monthAgo.setDate(monthAgo.getDate()-30);if($("auditStart"))$("auditStart").value=monthAgo.toISOString().slice(0,10);if($("auditEnd"))$("auditEnd").value=end;if($("reportStart")&&!$("reportStart").value)$("reportStart").value=start;if($("reportEnd")&&!$("reportEnd").value)$("reportEnd").value=end;}
  function bindGlobal(){
    document.addEventListener("timeclock:attendance-rendered",renderAttendanceEnterprise);
    document.addEventListener("timeclock:attendance-loaded",e=>renderAttendanceDataNotice(e.detail||{}));
    document.addEventListener("timeclock:schedule-rendered",()=>{loadScheduleStatus();});
    document.addEventListener("timeclock:review-rendered",()=>loadNotifications());
    $("employeeDirectoryLoadBtn")?.addEventListener("click",loadEmployees);$("employeeExportBtn")?.addEventListener("click",exportEmployees);$("auditLoadBtn")?.addEventListener("click",loadAudit);$("auditExportBtn")?.addEventListener("click",exportAudit);
    $("assistantSendBtn")?.addEventListener("click",()=>{const q=$("assistantInput")?.value;askAssistant(q);$("assistantInput").value="";});$("assistantInput")?.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();$("assistantSendBtn")?.click();}});qsa(".assistant-prompt").forEach(b=>b.addEventListener("click",()=>askAssistant(b.textContent)));
    document.addEventListener("click",e=>{const b=e.target.closest('[data-admin-open="admin-employees"],[data-admin-open="admin-audit"]');if(!b)return;setTimeout(()=>{const page=b.dataset.adminOpen;const titles={"admin-employees":["ข้อมูลพนักงาน","ค้นหาและตรวจสอบข้อมูลพนักงาน"],"admin-audit":["Audit Log","ประวัติการเปลี่ยนแปลงและการใช้งานระบบ"]};if($("pageTitle"))$("pageTitle").textContent=titles[page][0];if($("pageSubtitle"))$("pageSubtitle").textContent=titles[page][1];page==="admin-employees"?loadEmployees():loadAudit();},0);});
    document.addEventListener("timeclock:profile-ready",loadNotifications);
    setTimeout(()=>{const f=app()?.state?.filters;if(f){fillNewSelect("employeeDirectoryZone",f.zones,"ทุกพื้นที่");fillNewSelect("employeeDirectoryDepartment",f.departments,"ทุกหน่วยงาน");}},2500);
  }
  function fillNewSelect(id,values,label){const el=$(id);if(!el)return;const old=el.value;el.innerHTML=`<option value="">${label}</option>`+(values||[]).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");el.value=old;}
  function init(){injectNavAndPages();enhanceAttendance();enhanceSchedule();enhanceReview();setDefaults();bindGlobal();document.documentElement.dataset.functionalVersion=VERSION;if($("aboutVersion"))$("aboutVersion").textContent=VERSION;if($("aboutBuild"))$("aboutBuild").textContent="Enterprise V6 Functional Complete";setTimeout(()=>{const f=app()?.state?.filters;if(f){fillNewSelect("employeeDirectoryZone",f.zones,"ทุกพื้นที่");fillNewSelect("employeeDirectoryDepartment",f.departments,"ทุกหน่วยงาน");}loadNotifications();},3000);}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();

  window.TimeClockFunctional={VERSION,loadEmployees,loadAudit,loadNotifications,renderAttendanceEnterprise,loadScheduleStatus};
})();

;

/* ===== js/mobileta-import.js ===== */
(() => {
  "use strict";
  const VERSION="6.1.5";
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
      if(app()?.state){app().state.attendance=[];app().state.review=[]}
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
      if(app()?.state){app().state.attendance=[];app().state.review=[]}
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
  const VERSION = "6.1.7";
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

;

/* ===== V6.2.0 CSV import + technician work patterns ===== */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const qsa = (sel, root=document) => [...root.querySelectorAll(sel)];
  const app = () => window.TimeClockApp;
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmt = v => Number(v || 0).toLocaleString('th-TH');
  const fmtDate = v => app()?.formatDate?.(v) || v || '-';
  const fmtDateTime = v => app()?.formatDateTime?.(v) || v || '-';
  const realRole = () => app()?.state?.profile?._realRole || app()?.state?.profile?.role || 'VIEWER';
  const client = () => app()?.state?.client;
  async function rpc(name, args={}) {
    const c = client(); if (!c) throw new Error('ยังไม่ได้เชื่อมต่อ Supabase');
    const started = performance.now();
    const {data,error} = await c.rpc(name,args);
    window.TimeClockSettings?.recordApi?.(name,performance.now()-started,Array.isArray(data)?data.length:(data?1:0),error);
    if (error) throw error;
    return data;
  }
  const csvCell = v => `"${String(v ?? '').replace(/"/g,'""')}"`;
  function download(name, content, type='text/csv;charset=utf-8') {
    const blob = new Blob([content],{type}); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=name; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1200);
  }
  function parseCsvText(text) {
    const rows=[]; let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const ch=text[i],next=text[i+1];
      if(ch==='"'&&quoted&&next==='"'){cell+='"';i++;}
      else if(ch==='"') quoted=!quoted;
      else if(ch===','&&!quoted){row.push(cell);cell='';}
      else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);row=[];cell='';}
      else cell+=ch;
    }
    row.push(cell); if(row.some(x=>x.trim()!==''))rows.push(row);
    return rows;
  }
  function normHeader(v){return String(v||'').replace(/^\uFEFF/,'').trim().toLowerCase().replace(/[ _-]/g,'');}
  function modeOf(v){const x=String(v||'').trim().toUpperCase();return ['IN','I','เข้า'].includes(x)?'IN':['OUT','O','ออก'].includes(x)?'OUT':null;}
  function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(`${v}T00:00:00`));}
  function validTime(v){return /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v);}
  function toHms(v){return v.length===5?`${v}:00`:v;}

  /* CSV Import ------------------------------------------------------- */
  const csvState={file:null,rows:[],errors:[],stats:null,batchId:null};
  function csvStatus(text,type='neutral'){
    const el=$('timeCsvFileStatus');if(!el)return;el.textContent=text;el.className=`mobileta-status-pill ${type}`;
  }
  function csvProgress(p,text){
    const n=Math.max(0,Math.min(100,Number(p)||0));
    $('timeCsvProgressPanel')?.classList.remove('hidden');
    if($('timeCsvProgressBar'))$('timeCsvProgressBar').style.width=`${n}%`;
    if($('timeCsvProgressPercent'))$('timeCsvProgressPercent').textContent=`${Math.round(n)}%`;
    if(text&&$('timeCsvProgressText'))$('timeCsvProgressText').textContent=text;
  }
  function resetCsv(){
    csvState.file=null;csvState.rows=[];csvState.errors=[];csvState.stats=null;csvState.batchId=null;
    if($('timeCsvFile'))$('timeCsvFile').value='';
    $('timeCsvPreviewPanel')?.classList.add('hidden');$('timeCsvProgressPanel')?.classList.add('hidden');
    if($('timeCsvResultPanel'))$('timeCsvResultPanel').innerHTML='';
    if($('timeCsvImportBtn'))$('timeCsvImportBtn').disabled=true;
    csvStatus('ยังไม่ได้เลือกไฟล์','neutral');
  }
  async function inspectCsv(){
    const file=$('timeCsvFile')?.files?.[0]; if(!file)return app()?.toast?.('กรุณาเลือกไฟล์ CSV','error');
    app()?.showLoading?.('กำลังตรวจสอบ CSV...');
    try{
      const matrix=parseCsvText(await file.text()); if(matrix.length<2)throw new Error('ไฟล์ไม่มีข้อมูล');
      const headers=matrix.shift().map(normHeader);
      const required={employeeid:['employeeid'],inoutdate:['inoutdate'],inouttime:['inouttime'],inoutmode:['inoutmode'],gpsname:['gpsname'],gpslocation:['gpslocation']};
      const idx={};
      for(const [key,aliases] of Object.entries(required)){idx[key]=headers.findIndex(h=>aliases.includes(h));if(idx[key]<0&&['gpsname','gpslocation'].includes(key))continue;if(idx[key]<0)throw new Error(`ไม่พบคอลัมน์ ${key}`);}
      const seen=new Set(),rows=[],errors=[],employees=new Set();let dup=0,minDate=null,maxDate=null;
      matrix.forEach((r,i)=>{
        const source_row_no=i+2,employee_id=String(r[idx.employeeid]??'').trim(),inout_date=String(r[idx.inoutdate]??'').trim();
        const rawTime=String(r[idx.inouttime]??'').trim(),inout_time=validTime(rawTime)?toHms(rawTime):rawTime;
        const inout_mode=modeOf(r[idx.inoutmode]); const gps_name=idx.gpsname>=0?String(r[idx.gpsname]??'').trim():'';
        const gps_location=idx.gpslocation>=0?String(r[idx.gpslocation]??'').trim():'';
        const problems=[];if(!employee_id)problems.push('ไม่พบ EmployeeId');if(!validDate(inout_date))problems.push('วันที่ต้องเป็น YYYY-MM-DD');if(!validTime(rawTime))problems.push('เวลาไม่ถูกต้อง');if(!inout_mode)problems.push('InOutMode ต้องเป็น เข้า/ออก หรือ IN/OUT');
        const raw={source_row_no,employee_id,inout_date,inout_time,inout_mode:inout_mode||String(r[idx.inoutmode]??''),gps_name,gps_location};
        if(problems.length){errors.push({...raw,error:problems.join('; ')});return;}
        const key=`${employee_id}|${inout_date}|${inout_time}|${inout_mode}`;
        if(seen.has(key)){dup++;return;}seen.add(key);employees.add(employee_id);minDate=!minDate||inout_date<minDate?inout_date:minDate;maxDate=!maxDate||inout_date>maxDate?inout_date:maxDate;
        rows.push({...raw,row_hash:key});
      });
      csvState.file=file;csvState.rows=rows;csvState.errors=errors;csvState.stats={rawRows:matrix.length,validRows:rows.length,fileDuplicates:dup,uniqueEmployees:employees.size,minDate,maxDate,invalidRows:errors.length,fileSize:file.size};
      renderCsvPreview();csvStatus(errors.length?'ตรวจสอบแล้ว มีรายการผิดรูปแบบ':'ไฟล์พร้อมนำเข้า',errors.length?'error':'ready');$('timeCsvImportBtn').disabled=!rows.length;
    }catch(e){app()?.toast?.(e.message||String(e),'error');csvStatus('ตรวจสอบไฟล์ไม่สำเร็จ','error');}
    finally{app()?.hideLoading?.();}
  }
  function renderCsvPreview(){
    const s=csvState.stats;if(!s)return;$('timeCsvPreviewPanel')?.classList.remove('hidden');
    [['timeCsvRawRows',s.rawRows],['timeCsvValidRows',s.validRows],['timeCsvFileDuplicates',s.fileDuplicates],['timeCsvEmployees',s.uniqueEmployees],['timeCsvInvalidRows',s.invalidRows]].forEach(([id,v])=>{if($(id))$(id).textContent=fmt(v)});
    if($('timeCsvDateRange'))$('timeCsvDateRange').textContent=s.minDate?`${fmtDate(s.minDate)}–${fmtDate(s.maxDate)}`:'-';
    if($('timeCsvPreviewBody'))$('timeCsvPreviewBody').innerHTML=csvState.rows.slice(0,20).map(r=>`<tr><td>${fmt(r.source_row_no)}</td><td><strong>${esc(r.employee_id)}</strong></td><td>${fmtDate(r.inout_date)}</td><td>${esc(r.inout_time)}</td><td><span class="fc-badge ${r.inout_mode==='IN'?'active':'warning'}">${r.inout_mode==='IN'?'เข้า':'ออก'}</span></td><td>${esc(r.gps_name||'-')}</td><td>${esc(r.gps_location||'-')}</td></tr>`).join('');
    $('timeCsvDownloadErrorsBtn')?.classList.toggle('hidden',!csvState.errors.length);
  }
  function downloadCsvErrors(){
    if(!csvState.errors.length)return;const rows=[['แถว','EmployeeId','InOutDate','InOutTime','InOutMode','GPSName','GpsLocation','Error'],...csvState.errors.map(r=>[r.source_row_no,r.employee_id,r.inout_date,r.inout_time,r.inout_mode,r.gps_name,r.gps_location,r.error])];
    download('TextTime_CSV_Errors.csv','\uFEFF'+rows.map(x=>x.map(csvCell).join(',')).join('\n'));
  }
  function downloadCsvTemplate(){
    const rows=[['EmployeeId','InOutDate','InOutTime','InOutMode','GPSName','GpsLocation'],['0043973','2026-06-02','08:30','เข้า','','สำนักงานใหญ่ วิภาวดี 62'],['0043973','2026-06-02','18:00','ออก','','สำนักงานใหญ่ วิภาวดี 62']];
    download('TextTime_CSV_Template.csv','\uFEFF'+rows.map(x=>x.map(csvCell).join(',')).join('\n'));
  }
  async function runAttendanceJob(startDate,endDate,batchId){
    csvProgress(72,'กำลังสร้าง Job ประมวลผล Attendance...');
    const job=await rpc('ta_create_attendance_rebuild_job',{p_start_date:startDate,p_end_date:endDate,p_batch_size:100,p_note:`สร้างจาก CSV Batch ${batchId}`});
    await rpc('ta_link_time_csv_rebuild_job',{p_batch_id:batchId,p_job_id:job.id});
    let current=job,guard=0;
    while(!['COMPLETED','COMPLETED_WITH_ERRORS','FAILED','CANCELLED'].includes(current.status)&&guard<20000){
      current=await rpc('ta_process_attendance_rebuild_step',{p_job_id:job.id});guard++;
      csvProgress(72+(Number(current.progress_percent||0)*.28),`Attendance ${current.processed_tasks||0}/${current.total_tasks||0} Task • ${current.current_work_date?fmtDate(current.current_work_date):''}`);
    }
    return current;
  }
  async function runCsvImport(){
    if(!csvState.rows.length||!csvState.stats)return app()?.toast?.('กรุณาตรวจสอบไฟล์ก่อน','error');
    $('timeCsvImportBtn').disabled=true;$('timeCsvPreviewBtn').disabled=true;app()?.showLoading?.('กำลังเริ่มนำเข้า CSV...');
    try{
      const s=csvState.stats;
      const begun=await rpc('ta_begin_time_csv_import',{p_file_name:csvState.file.name,p_file_size:csvState.file.size,p_raw_rows:s.rawRows,p_valid_rows:s.validRows,p_file_duplicate_rows:s.fileDuplicates,p_min_date:s.minDate,p_max_date:s.maxDate,p_note:$('timeCsvImportNote')?.value||null});
      const batchId=begun.id;csvState.batchId=batchId;let uploaded=0,inserted=0,dups=0,unmatched=0,conflicts=0;const size=1000;
      for(let i=0;i<csvState.rows.length;i+=size){
        const chunk=csvState.rows.slice(i,i+size);const r=await rpc('ta_import_time_csv_chunk',{p_batch_id:batchId,p_rows:chunk});
        uploaded+=chunk.length;inserted+=Number(r.inserted_rows||0);dups+=Number(r.existing_duplicate_rows||0);unmatched+=Number(r.unmatched_employee_rows||0);conflicts+=Number(r.gps_conflict_rows||0);
        csvProgress((uploaded/csvState.rows.length)*70,`ส่งข้อมูล ${fmt(uploaded)} / ${fmt(csvState.rows.length)} รายการ`);
        [['timeCsvUploadedRows',uploaded],['timeCsvInsertedRows',inserted],['timeCsvExistingDuplicates',dups],['timeCsvUnmatchedRows',unmatched],['timeCsvGpsConflicts',conflicts]].forEach(([id,v])=>{if($(id))$(id).textContent=fmt(v)});
      }
      const finished=await rpc('ta_finish_time_csv_import',{p_batch_id:batchId});let job=null;
      if($('timeCsvRebuildAttendance')?.checked)job=await runAttendanceJob(s.minDate,s.maxDate,batchId);else csvProgress(100,'นำเข้า CSV สำเร็จ');
      const warn=job?.status==='COMPLETED_WITH_ERRORS'?`<div class="mobileta-import-warning"><strong>Attendance สำเร็จบางส่วน</strong><div>ตรวจ Error Log ที่เมนูประมวลผล Attendance</div></div>`:'';
      $('timeCsvResultPanel').innerHTML=`<div class="mobileta-result-card"><h3>นำเข้าข้อมูลลงเวลา CSV เรียบร้อย</h3><p>ใช้ค่าเข้า/ออกจากไฟล์โดยตรง ไม่ต้องจำแนก ALL</p>${warn}<div class="mobileta-result-grid"><div><span>เพิ่มใหม่</span><strong>${fmt(finished.inserted_rows)}</strong></div><div><span>ซ้ำฐานข้อมูล</span><strong>${fmt(finished.existing_duplicate_rows)}</strong></div><div><span>ไม่พบพนักงาน</span><strong>${fmt(finished.unmatched_employee_rows)}</strong></div><div><span>GPS Conflict</span><strong>${fmt(finished.gps_conflict_rows)}</strong></div><div><span>Attendance Job</span><strong>${esc(job?.status||'ไม่ได้ประมวลผล')}</strong></div><div><span>ช่วงวันที่</span><strong>${fmtDate(finished.min_date)}–${fmtDate(finished.max_date)}</strong></div></div></div>`;
      csvProgress(100,'เสร็จสมบูรณ์');csvStatus('นำเข้าสำเร็จ','ready');app()?.toast?.('นำเข้า CSV และประมวลผลเรียบร้อย','success');await loadCsvHistory();
    }catch(e){$('timeCsvResultPanel').innerHTML=`<div class="mobileta-result-card error"><h3>นำเข้าข้อมูลไม่สำเร็จ</h3><p>${esc(e.message||String(e))}</p></div>`;csvStatus('นำเข้าไม่สำเร็จ','error');app()?.toast?.(e.message||String(e),'error');}
    finally{app()?.hideLoading?.();$('timeCsvImportBtn').disabled=!csvState.rows.length;$('timeCsvPreviewBtn').disabled=false;}
  }
  async function loadCsvHistory(){
    const body=$('timeCsvHistoryBody');if(!body||!client())return;body.innerHTML='<tr><td colspan="11" class="table-empty">กำลังโหลด...</td></tr>';
    try{const rows=await rpc('ta_get_time_csv_import_history',{p_limit:30})||[];body.innerHTML=rows.length?rows.map(r=>`<tr><td>${fmtDateTime(r.created_at)}</td><td><strong>${esc(r.file_name)}</strong></td><td>${fmtDate(r.min_date)}–${fmtDate(r.max_date)}</td><td>${fmt(r.raw_rows)}</td><td>${fmt(r.inserted_rows)}</td><td>${fmt(Number(r.file_duplicate_rows||0)+Number(r.existing_duplicate_rows||0))}</td><td>${fmt(r.unmatched_employee_rows)}</td><td>${fmt(r.gps_conflict_rows)}</td><td>${r.attendance_job_id?'<span class="mobileta-row-ok">สร้างแล้ว</span>':'-'}</td><td><span class="mobileta-status-pill ${r.status==='COMPLETED'?'ready':'error'}">${esc(r.status)}</span></td><td>${esc(r.created_by_email||'-')}</td></tr>`).join(''):'<tr><td colspan="11" class="table-empty">ยังไม่มีประวัติ</td></tr>';}
    catch(e){body.innerHTML=`<tr><td colspan="11" class="table-empty">${esc(e.message||String(e))}</td></tr>`;}
  }

  /* Work patterns ---------------------------------------------------- */
  const wp={patterns:[],templates:[],employees:[],editing:null};
  const dowNames=['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'];
  const dowText=a=>(a||[]).map(x=>dowNames[Number(x)]||x).join(', ')||'-';
  const hours=m=>(Number(m||0)/60).toLocaleString('th-TH',{maximumFractionDigits:2});
  function ensureWpModals(){
    if($('workPatternModal'))return;
    document.body.insertAdjacentHTML('beforeend',`<div id="workPatternModal" class="modal-backdrop hidden"><div class="modal"><div class="modal-header"><h3>พารามิเตอร์รูปแบบการทำงาน</h3><button class="btn btn-light btn-icon" data-close-wp="workPatternModal">×</button></div><div class="modal-body"><div class="form-row"><div class="field"><label>รหัสรูปแบบ</label><input id="wpCode" class="input"></div><div class="field"><label>ชื่อรูปแบบ</label><input id="wpName" class="input"></div></div><div class="form-row"><div class="field"><label>วันทำงาน/สัปดาห์</label><input id="wpDays" class="input" type="number" min="1" max="7"></div><div class="field"><label>นาทีต่อวันรวมพัก</label><input id="wpScheduled" class="input" type="number"></div><div class="field"><label>OT หลัง (นาที)</label><input id="wpOt" class="input" type="number"></div></div><div class="form-row"><div class="field"><label>เวลาเริ่มต้น</label><input id="wpStart" class="input" type="time"></div><div class="field"><label>เวลาสิ้นสุด</label><input id="wpEnd" class="input" type="time"></div><div class="field"><label>พัก (นาที)</label><input id="wpBreak" class="input" type="number"></div></div><div class="field"><label>วันหยุดตั้งต้น</label><div class="dow-checks">${dowNames.map((d,i)=>`<label><input type="checkbox" data-wp-dow="${i}"> ${d}</label>`).join('')}</div></div><div class="form-row"><div class="field"><label>ยกยอดข้ามเดือน</label><input id="wpCarry" class="input" type="number" min="0" max="24"></div><label class="mobileta-option-card"><input id="wpActive" type="checkbox" checked><span><strong>เปิดใช้งาน</strong><small>ใช้กำหนดรายบุคคลได้</small></span></label></div><div class="field"><label>หมายเหตุ</label><input id="wpNote" class="input"></div></div><div class="modal-footer"><button class="btn btn-light" data-close-wp="workPatternModal">ยกเลิก</button><button id="wpSaveBtn" class="btn btn-primary">บันทึก</button></div></div></div><div id="employeePatternModal" class="modal-backdrop hidden"><div class="modal"><div class="modal-header"><h3>กำหนดรูปแบบรายบุคคล</h3><button class="btn btn-light btn-icon" data-close-wp="employeePatternModal">×</button></div><div class="modal-body"><input id="epEmpCode" type="hidden"><div id="epEmployee" class="assignment-info"></div><div class="form-row"><div class="field"><label>รูปแบบการทำงาน</label><select id="epPattern" class="select"></select></div><div class="field"><label>Template เริ่มต้น</label><select id="epTemplate" class="select"></select></div></div><div class="form-row"><div class="field"><label>เริ่มใช้</label><input id="epFrom" type="date" class="input"></div><div class="field"><label>สิ้นสุด</label><input id="epTo" type="date" class="input"></div></div><div class="field"><label>Override วันหยุดตั้งต้น</label><div class="dow-checks">${dowNames.map((d,i)=>`<label><input type="checkbox" data-ep-dow="${i}"> ${d}</label>`).join('')}</div><small class="field-help">ไม่เลือก = ใช้ค่าจากกลุ่ม</small></div><div class="field"><label>หมายเหตุ</label><input id="epNote" class="input"></div></div><div class="modal-footer"><button class="btn btn-light" data-close-wp="employeePatternModal">ยกเลิก</button><button id="epSaveBtn" class="btn btn-primary">บันทึก</button></div></div></div>`);
    qsa('[data-close-wp]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.closeWp)?.classList.add('hidden')));
    $('wpSaveBtn')?.addEventListener('click',savePattern);$('epSaveBtn')?.addEventListener('click',saveEmployeePattern);
  }
  async function loadWorkPatterns(){
    if(!client())return;ensureWpModals();
    try{const [patterns,templates]=await Promise.all([rpc('ta_get_work_patterns'),rpc('ta_get_work_templates')]);wp.patterns=patterns||[];wp.templates=templates||[];renderPatterns();renderTemplates();fillPatternOptions();}
    catch(e){app()?.toast?.(e.message||String(e),'error');}
  }
  function renderPatterns(){
    const admin=realRole()==='HR_ADMIN';$('workPatternAdminPanel')?.classList.toggle('hidden',!admin);const body=$('workPatternBody');if(!body)return;
    body.innerHTML=wp.patterns.length?wp.patterns.map(r=>`<tr><td><strong>${esc(r.pattern_code)}</strong></td><td>${esc(r.pattern_name)}</td><td>${r.work_days_per_week}</td><td>${hours(r.scheduled_minutes_including_break)} ชม.</td><td>${hours(r.ot_threshold_minutes)} ชม.</td><td>${esc(dowText(r.weekly_off_dows))}</td><td>${r.carry_forward_months} เดือน</td><td><span class="fc-badge ${r.is_active?'active':'danger'}">${r.is_active?'ใช้งาน':'ปิด'}</span></td><td>${admin?`<button class="btn btn-light btn-sm" data-edit-pattern="${esc(r.pattern_code)}">แก้ไข</button>`:'-'}</td></tr>`).join(''):'<tr><td colspan="9" class="table-empty">ไม่พบข้อมูล</td></tr>';
  }
  function renderTemplates(){const box=$('workTemplateCards');if(!box)return;box.innerHTML=wp.templates.map(t=>`<article class="work-template-card"><div><span class="fc-badge active">${esc(t.template_type)}</span><h3>${esc(t.template_name)}</h3><small>${esc(t.template_code)}</small></div><p>${esc(t.note||'-')}</p><div class="work-template-segments">${(t.segments||[]).map(s=>`<span class="segment-${String(s.segment_type).toLowerCase()}"><b>${esc(s.segment_type)}</b> ${s.planned_start_time?String(s.planned_start_time).slice(0,5):'ยืดหยุ่น'}–${s.planned_end_time?String(s.planned_end_time).slice(0,5):'ไม่กำหนด'}</span>`).join('')}</div></article>`).join('');}
  function fillPatternOptions(){const pOpts=wp.patterns.filter(x=>x.is_active).map(x=>`<option value="${esc(x.pattern_code)}">${esc(x.pattern_name)}</option>`).join('');const tOpts=wp.templates.filter(x=>x.is_active).map(x=>`<option value="${esc(x.template_code)}">${esc(x.template_name)}</option>`).join('');if($('epPattern'))$('epPattern').innerHTML=pOpts;if($('epTemplate'))$('epTemplate').innerHTML=tOpts;if($('assignWorkTemplate'))$('assignWorkTemplate').innerHTML=tOpts;}
  function openPattern(code){ensureWpModals();const r=wp.patterns.find(x=>x.pattern_code===code)||{pattern_code:'',pattern_name:'',work_days_per_week:6,scheduled_minutes_including_break:540,ot_threshold_minutes:540,break_minutes:60,default_start_time:'08:30',default_end_time:'17:30',weekly_off_dows:[0],carry_forward_months:3,is_active:true,note:''};wp.editing=r;$('wpCode').value=r.pattern_code||'';$('wpCode').disabled=!!r.pattern_code;$('wpName').value=r.pattern_name||'';$('wpDays').value=r.work_days_per_week||6;$('wpScheduled').value=r.scheduled_minutes_including_break||540;$('wpOt').value=r.ot_threshold_minutes||540;$('wpBreak').value=r.break_minutes||60;$('wpStart').value=String(r.default_start_time||'08:30').slice(0,5);$('wpEnd').value=String(r.default_end_time||'17:30').slice(0,5);$('wpCarry').value=r.carry_forward_months??3;$('wpActive').checked=r.is_active!==false;$('wpNote').value=r.note||'';qsa('[data-wp-dow]').forEach(c=>c.checked=(r.weekly_off_dows||[]).map(Number).includes(Number(c.dataset.wpDow)));$('workPatternModal').classList.remove('hidden');}
  async function savePattern(){try{const weekly=qsa('[data-wp-dow]').filter(x=>x.checked).map(x=>Number(x.dataset.wpDow));if(!weekly.length)throw new Error('กรุณาเลือกวันหยุดตั้งต้นอย่างน้อย 1 วัน');await rpc('ta_upsert_work_pattern',{p_data:{pattern_code:$('wpCode').value,pattern_name:$('wpName').value,work_days_per_week:Number($('wpDays').value),scheduled_minutes_including_break:Number($('wpScheduled').value),standard_work_minutes:Number($('wpScheduled').value),break_minutes:Number($('wpBreak').value),ot_threshold_minutes:Number($('wpOt').value),weekly_off_dows:weekly,default_start_time:$('wpStart').value,default_end_time:$('wpEnd').value,allow_comp_off:true,carry_forward_months:Number($('wpCarry').value),is_active:$('wpActive').checked,note:$('wpNote').value}});$('workPatternModal').classList.add('hidden');app()?.toast?.('บันทึกรูปแบบการทำงานแล้ว','success');await loadWorkPatterns();}catch(e){app()?.toast?.(e.message||String(e),'error');}}
  async function loadEmployeePatterns(){const body=$('employeePatternBody');if(!body)return;body.innerHTML='<tr><td colspan="10" class="table-empty">กำลังโหลด...</td></tr>';try{const rows=await rpc('ta_get_employee_pattern_assignments',{p_search:$('employeePatternSearch')?.value||null,p_effective_date:$('employeePatternDate')?.value||new Date().toISOString().slice(0,10),p_limit:1000});wp.employees=rows||[];body.innerHTML=wp.employees.length?wp.employees.map(r=>`<tr><td><strong>${esc(r.emp_code)}</strong></td><td>${esc(r.full_name||'-')}</td><td>${esc(r.department||'-')}</td><td>${esc([r.area,r.sub_area].filter(Boolean).join(' / ')||'-')}</td><td>${esc(r.pc||'-')}</td><td>${esc(r.pattern_name||r.pattern_code)}</td><td>${esc(dowText(r.weekly_off_dows))}</td><td>${esc(r.default_template_code||'SINGLE_0830')}</td><td>${fmtDate(r.effective_from)||'-'}</td><td><button class="btn btn-light btn-sm" data-assign-pattern="${esc(r.emp_code)}">กำหนด</button></td></tr>`).join(''):'<tr><td colspan="10" class="table-empty">ไม่พบพนักงานใน Scope</td></tr>';}catch(e){body.innerHTML=`<tr><td colspan="10" class="table-empty">${esc(e.message||String(e))}</td></tr>`;}}
  function openEmployeePattern(emp){ensureWpModals();const r=wp.employees.find(x=>String(x.emp_code)===String(emp));if(!r)return;$('epEmpCode').value=r.emp_code;$('epEmployee').innerHTML=`<strong>${esc(r.emp_code)} • ${esc(r.full_name||'')}</strong><small>${esc(r.department||'-')}</small>`;$('epPattern').value=r.pattern_code||'TECH_6D';$('epTemplate').value=r.default_template_code||'SINGLE_0830';$('epFrom').value=new Date().toISOString().slice(0,10);$('epTo').value='';$('epNote').value='';qsa('[data-ep-dow]').forEach(c=>c.checked=(r.weekly_off_dows||[]).map(Number).includes(Number(c.dataset.epDow)));$('employeePatternModal').classList.remove('hidden');}
  async function saveEmployeePattern(){try{const weekly=qsa('[data-ep-dow]').filter(x=>x.checked).map(x=>Number(x.dataset.epDow));await rpc('ta_assign_employee_work_pattern',{p_emp_code:$('epEmpCode').value,p_pattern_code:$('epPattern').value,p_effective_from:$('epFrom').value,p_effective_to:$('epTo').value||null,p_override_weekly_off_dows:weekly.length?weekly:null,p_default_template_code:$('epTemplate').value,p_note:$('epNote').value||null});$('employeePatternModal').classList.add('hidden');app()?.toast?.('กำหนดรูปแบบรายบุคคลแล้ว','success');await loadEmployeePatterns();}catch(e){app()?.toast?.(e.message||String(e),'error');}}

  async function loadDailyPlanForModal(){const modal=$('assignModal');if(!modal||modal.classList.contains('hidden'))return;const emp=$('assignEmpCode')?.value,date=$('assignWorkDate')?.value;if(!emp||!date)return;try{const plan=await rpc('ta_get_daily_work_plan',{p_emp_code:emp,p_work_date:date});$('assignWorkTemplate').value=plan?.template_code||'SINGLE_0830';$('assignCustomerStart').value=plan?.customer_window_start?String(plan.customer_window_start).slice(0,5):'22:00';$('assignCustomerEnd').value=plan?.customer_window_end?String(plan.customer_window_end).slice(0,5):'';toggleCustomerWindow();}catch(e){/* permission or no plan: keep default */}}
  function toggleCustomerWindow(){const flexible=$('assignWorkTemplate')?.value!=='SINGLE_0830';$('assignCustomerWindowRow')?.classList.toggle('hidden',!flexible);}
  async function saveDailyPlanAfterShift(){const modal=$('assignModal');if(!modal||!modal.classList.contains('hidden'))return;const emp=$('assignEmpCode')?.value,date=$('assignWorkDate')?.value,template=$('assignWorkTemplate')?.value;if(!emp||!date||!template)return;try{await rpc('ta_save_daily_work_plan',{p_emp_code:emp,p_work_date:date,p_template_code:template,p_customer_window_start:$('assignCustomerStart')?.value||null,p_customer_window_end:$('assignCustomerEnd')?.value||null,p_status:$('assignConfirm')?.value==='true'?'CONFIRMED':'PLANNED',p_note:$('assignNote')?.value||null});}catch(e){app()?.toast?.(`บันทึกกะสำเร็จ แต่บันทึกรูปแบบช่วงงานไม่สำเร็จ: ${e.message||e}`,'error');}}

  function bindV620(){
    ensureWpModals();
    $('timeCsvPreviewBtn')?.addEventListener('click',inspectCsv);$('timeCsvImportBtn')?.addEventListener('click',runCsvImport);$('timeCsvResetBtn')?.addEventListener('click',resetCsv);$('timeCsvTemplateBtn')?.addEventListener('click',downloadCsvTemplate);$('timeCsvDownloadErrorsBtn')?.addEventListener('click',downloadCsvErrors);$('timeCsvRefreshHistoryBtn')?.addEventListener('click',loadCsvHistory);$('timeCsvFile')?.addEventListener('change',()=>csvStatus($('timeCsvFile')?.files?.[0]?.name||'ยังไม่ได้เลือกไฟล์','neutral'));
    $('workPatternRefreshBtn')?.addEventListener('click',async()=>{await loadWorkPatterns();await loadEmployeePatterns();});$('workPatternNewBtn')?.addEventListener('click',()=>openPattern(null));$('employeePatternLoadBtn')?.addEventListener('click',loadEmployeePatterns);$('employeePatternSearch')?.addEventListener('keydown',e=>{if(e.key==='Enter')loadEmployeePatterns();});
    document.addEventListener('click',e=>{const edit=e.target.closest('[data-edit-pattern]');if(edit)openPattern(edit.dataset.editPattern);const assign=e.target.closest('[data-assign-pattern]');if(assign)openEmployeePattern(assign.dataset.assignPattern);});
    qsa('[data-page="work-patterns"],[data-admin-open="work-patterns"]').forEach(b=>b.addEventListener('click',()=>setTimeout(async()=>{if($('pageTitle'))$('pageTitle').textContent='รูปแบบการทำงาน';if($('pageSubtitle'))$('pageSubtitle').textContent='กำหนดกลุ่ม 5/6 วัน วันหยุดตั้งต้น และรูปแบบช่วงงานรายบุคคล';await loadWorkPatterns();await loadEmployeePatterns();},0)));
    qsa('[data-page="admin-time-import"],[data-admin-open="admin-time-import"]').forEach(b=>b.addEventListener('click',()=>setTimeout(()=>{if($('pageTitle'))$('pageTitle').textContent='นำเข้าข้อมูลลงเวลา CSV';if($('pageSubtitle'))$('pageSubtitle').textContent='นำเข้า EmployeeId, วันที่, เวลา, เข้า/ออก และ GPS จาก CSV UTF-8';loadCsvHistory();},0)));
    $('assignWorkTemplate')?.addEventListener('change',toggleCustomerWindow);
    const assignModal=$('assignModal');if(assignModal)new MutationObserver(()=>{if(!assignModal.classList.contains('hidden'))setTimeout(loadDailyPlanForModal,30);}).observe(assignModal,{attributes:true,attributeFilter:['class']});
    $('saveAssignmentBtn')?.addEventListener('click',()=>setTimeout(saveDailyPlanAfterShift,900));
    $('deleteAssignmentBtn')?.addEventListener('click',()=>{const emp=$('assignEmpCode')?.value,date=$('assignWorkDate')?.value;setTimeout(async()=>{if($('assignModal')?.classList.contains('hidden')&&emp&&date){try{await rpc('ta_delete_daily_work_plan',{p_emp_code:emp,p_work_date:date});}catch(e){}}},900);});
    const today=new Date().toISOString().slice(0,10);if($('employeePatternDate'))$('employeePatternDate').value=today;
    if($('workPatternAdminPanel'))$('workPatternAdminPanel').classList.toggle('hidden',realRole()!=='HR_ADMIN');
  }
  document.readyState==='loading'?document.addEventListener('DOMContentLoaded',bindV620):bindV620();
})();
