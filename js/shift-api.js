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
      note: full.p_note
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
      rows.push(...(data || []));
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

    const response = await withTimeout(
      client.rpc("ta_get_monthly_schedule", exact),
      30000,
      "โหลดปฏิทินกะ"
    );
    if (response.error) throw response.error;

    const rows = Array.isArray(response.data) ? response.data.map(row => ({ ...row })) : [];
    const monthStart = String(params.p_month || "").slice(0, 10);
    if (!monthStart) return rows;
    const start = new Date(`${monthStart}T00:00:00`);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;

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
      const response = await withTimeout(client.rpc("ta_get_review_queue", exact), 30000, "โหลดรายการรอตรวจสอบ");
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
