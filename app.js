
/* V6.10.2 deployment diagnostic */
window.__TIME_CLOCK_BUILD__ = "V6.15.29 FIX14B FINAL Temporary Assignment + Acting + Working Team Schedule";
document.documentElement.dataset.timeClockBuild = "6.15.29-fix16k-global-scope-contract";


/* ===== js/config.js ===== */
'use strict';

/**
 * Public frontend configuration only.
 * Never place a Supabase service_role key in this file.
 */
window.TIME_CLOCK_CONFIG = Object.freeze({
  appName: 'Time-Clock Management',
  version: '6.15.29 FIX14B FINAL',
  defaultRoute: 'dashboard',
  githubPagesBase: '/TimeClock/'
});

/* ===== V6.14.52 Calendar-Date Safety (retains V61448 utility name) =====
   Business dates are calendar dates, not UTC timestamps. Never derive YYYY-MM-DD
   from local-midnight Date objects with toISOString() in Thailand (+07).
*/
window.TimeClockCalendarV61448 = Object.freeze((()=>{
  const localISO=(value=new Date())=>{
    const d=value instanceof Date?value:new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const today=()=>localISO(new Date());
  const month=()=>today().slice(0,7);
  const addDays=(value,days=0)=>{
    const m=String(value||'').slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return String(value||'').slice(0,10);
    const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));
    d.setUTCDate(d.getUTCDate()+Number(days||0));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  };
  const monthStart=(value=new Date())=>{
    if(value instanceof Date)return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-01`;
    const v=String(value||today()).slice(0,7);
    return /^\d{4}-\d{2}$/.test(v)?`${v}-01`:today().slice(0,7)+'-01';
  };
  return {localISO,today,month,addDays,monthStart};
})());

/* ===== V6.11.57 Canonical Shift Codes =====
   Legacy -> Current
   D  -> STD
   N  -> S134
   D6 -> S043
   D5 -> S135
*/
window.TimeClockShiftCodesV61157 = Object.freeze({
  map: Object.freeze({
    D: 'STD',
    N: 'S134',
    D6: 'S043',
    D5: 'S135',
    ST5: 'STD',
    ST6: 'S043'
  }),

  canonical(value) {
    const code = String(value ?? '').trim().toUpperCase();
    if (!code) return code;
    return this.map[code] || code;
  },

  isNight(value) {
    const code = this.canonical(value);
    return ['S134','S135'].includes(code);
  },

  isDay(value) {
    const code = this.canonical(value);
    return ['STD','S043'].includes(code);
  },

  label(value) {
    return this.canonical(value);
  }
});

window.tcShiftCode = value =>
  window.TimeClockShiftCodesV61157.canonical(value);

window.tcIsNightShiftCode = value =>
  window.TimeClockShiftCodesV61157.isNight(value);

window.tcIsDayShiftCode = value =>
  window.TimeClockShiftCodesV61157.isDay(value);

;



/* ===== V6.11.35 Unified Modal UX ===== */
(() => {
  "use strict";

  let activeResolve = null;
  let activeMode = "confirm";
  let actionReturnFocus = null;
  let printReturnFocus = null;

  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/[&<>\"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'\"':"&quot;","'":"&#39;"}[c]));
  const nl2br = value => escapeHtml(value).replace(/\n/g,"<br>");

  function modalEls() {
    return {
      backdrop: $("globalActionModal"),
      title: $("globalActionModalTitle"),
      eyebrow: $("globalActionModalEyebrow"),
      icon: $("globalActionModalIcon"),
      message: $("globalActionModalMessage"),
      inputWrap: $("globalActionModalInputWrap"),
      inputLabel: $("globalActionModalInputLabel"),
      input: $("globalActionModalInput"),
      inputHelp: $("globalActionModalInputHelp"),
      cancel: $("globalActionModalCancel"),
      confirm: $("globalActionModalConfirm"),
      close: $("globalActionModalClose")
    };
  }

  function moveFocusOutside(container, preferredTarget) {
    if (!container) return;
    const active = document.activeElement;
    if (!active || !container.contains(active)) return;

    const target = preferredTarget && preferredTarget.isConnected && !container.contains(preferredTarget)
      ? preferredTarget
      : null;
    if (target && typeof target.focus === "function") {
      try { target.focus({ preventScroll: true }); } catch (_) { try { target.focus(); } catch (_) {} }
    }
    // Last-resort blur prevents Chrome from blocking aria-hidden when the
    // focused control is still inside the modal being closed.
    if (container.contains(document.activeElement) && typeof active.blur === "function") active.blur();
  }

  function settle(value) {
    const el = modalEls();
    // Accessibility: move focus OUT before applying aria-hidden/inert.
    moveFocusOutside(el.backdrop, actionReturnFocus);
    if (el.backdrop) el.backdrop.inert = true;
    el.backdrop?.classList.add("hidden");
    el.backdrop?.setAttribute("aria-hidden","true");
    document.body.classList.remove("modal-open-v61134");
    const resolve = activeResolve;
    activeResolve = null;
    actionReturnFocus = null;
    if (resolve) resolve(value);
  }

  function normalizeOptions(input, fallbackTitle) {
    if (typeof input === "string") return { message: input, title: fallbackTitle };
    return { ...(input || {}), title: input?.title || fallbackTitle };
  }

  function open(mode, input) {
    const options = normalizeOptions(input, mode === "prompt" ? "ระบุรายละเอียด" : "ยืนยันการดำเนินการ");
    const el = modalEls();
    if (!el.backdrop) {
      if (mode === "prompt") return Promise.resolve(window.prompt(options.message || options.title, options.defaultValue || ""));
      return Promise.resolve(window.confirm(options.message || options.title));
    }

    if (activeResolve) settle(mode === "prompt" ? null : false);
    actionReturnFocus = document.activeElement && !el.backdrop.contains(document.activeElement)
      ? document.activeElement
      : null;
    activeMode = mode;
    el.backdrop.dataset.tone = options.tone || (mode === "prompt" ? "primary" : "warning");
    el.title.textContent = options.title || "ยืนยันการดำเนินการ";
    el.eyebrow.textContent = options.eyebrow || (mode === "prompt" ? "กรอกข้อมูล" : "ยืนยันรายการ");
    el.message.innerHTML = nl2br(options.message || "กรุณาตรวจสอบข้อมูลก่อนดำเนินการ");
    el.icon.textContent = options.icon || (mode === "prompt" ? "✎" : (options.tone === "danger" ? "!" : "?"));
    el.cancel.textContent = options.cancelText || "ยกเลิก";
    el.confirm.textContent = options.confirmText || (mode === "prompt" ? "บันทึก" : "ยืนยัน");
    el.confirm.className = `btn ${options.tone === "danger" ? "btn-danger" : options.tone === "warning" ? "btn-orange" : "btn-primary"}`;

    if (mode === "prompt") {
      el.inputWrap.classList.remove("hidden");
      el.inputLabel.textContent = options.inputLabel || "หมายเหตุ";
      el.input.placeholder = options.placeholder || "ระบุรายละเอียด...";
      el.input.value = options.defaultValue || "";
      el.input.required = Boolean(options.required);
      el.inputHelp.textContent = options.helpText || (options.required ? "จำเป็นต้องระบุข้อมูล" : "สามารถเว้นว่างได้");
    } else {
      el.inputWrap.classList.add("hidden");
      el.input.value = "";
      el.input.required = false;
    }

    el.backdrop.inert = false;
    el.backdrop.classList.remove("hidden");
    el.backdrop.setAttribute("aria-hidden","false");
    document.body.classList.add("modal-open-v61134");

    return new Promise(resolve => {
      activeResolve = resolve;
      requestAnimationFrame(() => (mode === "prompt" ? el.input : el.confirm)?.focus());
    });
  }

  async function confirmModal(input, options = {}) {
    const merged = typeof input === "string" ? { ...options, message: input } : input;
    return Boolean(await open("confirm", merged));
  }

  async function promptModal(input, options = {}) {
    const merged = typeof input === "string" ? { ...options, message: input } : input;
    return await open("prompt", merged);
  }

  function printPreview(input = {}) {
    const modal = $("globalPrintModal");
    const frame = $("globalPrintFrame");
    if (!modal || !frame) return;
    printReturnFocus = document.activeElement && !modal.contains(document.activeElement)
      ? document.activeElement
      : null;
    $("globalPrintModalTitle").textContent = input.title || "ตัวอย่างก่อนพิมพ์";
    frame.srcdoc = input.html || "";
    modal.inert = false;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden","false");
    document.body.classList.add("modal-open-v61134");
  }

  function closePrint() {
    const modal = $("globalPrintModal");
    const frame = $("globalPrintFrame");
    moveFocusOutside(modal, printReturnFocus);
    if (modal) modal.inert = true;
    modal?.classList.add("hidden");
    modal?.setAttribute("aria-hidden","true");
    if (frame) frame.srcdoc = "";
    printReturnFocus = null;
    document.body.classList.remove("modal-open-v61134");
  }

  function bind() {
    const el = modalEls();
    el.cancel?.addEventListener("click", () => settle(activeMode === "prompt" ? null : false));
    el.close?.addEventListener("click", () => settle(activeMode === "prompt" ? null : false));
    el.confirm?.addEventListener("click", () => {
      if (activeMode === "prompt") {
        if (el.input.required && !el.input.value.trim()) {
          el.input.focus();
          el.input.classList.add("modal-input-invalid-v61134");
          return;
        }
        el.input.classList.remove("modal-input-invalid-v61134");
        settle(el.input.value);
      } else settle(true);
    });
    el.backdrop?.addEventListener("click", event => {
      if (event.target === el.backdrop) settle(activeMode === "prompt" ? null : false);
    });
    el.input?.addEventListener("input", () => el.input.classList.remove("modal-input-invalid-v61134"));

    $("globalPrintModalClose")?.addEventListener("click", closePrint);
    $("globalPrintModalCancel")?.addEventListener("click", closePrint);
    $("globalPrintModal")?.addEventListener("click", event => { if (event.target.id === "globalPrintModal") closePrint(); });
    $("globalPrintModalPrint")?.addEventListener("click", () => {
      try { $("globalPrintFrame")?.contentWindow?.focus(); $("globalPrintFrame")?.contentWindow?.print(); }
      catch (_) { window.TimeClockApp?.toast?.("ไม่สามารถเปิดหน้าพิมพ์ได้", "error"); }
    });

    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      if (!$("globalActionModal")?.classList.contains("hidden")) {
        event.preventDefault();
        settle(activeMode === "prompt" ? null : false);
      } else if (!$("globalPrintModal")?.classList.contains("hidden")) {
        event.preventDefault();
        closePrint();
      }
    }, true);
  }

  window.TimeClockModal = { confirm: confirmModal, prompt: promptModal, printPreview, closePrint };
  window.tcConfirm = confirmModal;
  window.tcPrompt = promptModal;
  window.tcPrintPreview = printPreview;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();

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

  // V6.14.15: direct shift_calendar client-write fallback removed.
  // All live schedule writes must pass the guarded RPC pipeline.

  async function assignSingle(app, params) {
    const client = app?.state?.client;
    if (!client) throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");
    const full = {
      p_emp_code: params.emp_code ?? params.p_emp_code,
      p_work_date: params.work_date ?? params.p_work_date,
      p_shift_code: (params.shift_code ?? params.p_shift_code) == null ? null : window.tcShiftCode(params.shift_code ?? params.p_shift_code),
      p_note: params.note ?? params.p_note ?? null,
      p_change_reason: params.change_reason ?? params.p_change_reason ?? "บันทึกกะจากหน้าเว็บ",
      p_confirm_now: Boolean(params.confirm_now ?? params.p_confirm_now)
    };

    const periodCheck = await window.TimeClockSystemPeriods?.checkScheduleDates?.(
      [full.p_work_date],
      true
    );
    if (periodCheck && !periodCheck.allowed) {
      throw new Error(periodCheck.message || "SYSTEM_PERIOD_SCHEDULE_CLOSED");
    }

    try {
      const readiness = await client.rpc("ta_validate_schedule_readiness_v616t", { p_rows:[{emp_code:full.p_emp_code,work_date:full.p_work_date}] });
      if (!readiness.error && readiness.data?.allowed === false) {
        const first=Array.isArray(readiness.data.blocked)?readiness.data.blocked[0]:null;
        throw new Error(first?.code || "SCHEDULE_READINESS_REQUIRED");
      }
      if (readiness.error && !missingFunction(readiness.error)) throw readiness.error;
    } catch(e) { if(!missingFunction(e)) throw e; }

    let response = await client.rpc("ta_assign_shift_single_v6143", full);
    if (!response.error) return response.data;
    if (!missingFunction(response.error)) throw response.error;

    throw new Error(
      "DAYOFF_QUOTA_GUARD_V6143_REQUIRED: กรุณาติดตั้ง Day-off Quota Guard V6.14.3 ก่อนจัดกะ"
    );
  }

  async function assignBulk(app, rows, changeReason, confirmNow = false) {
    const client = app?.state?.client;
    if (!client) throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");
    const cleanRows = (rows || []).map(row => ({
      emp_code: String(row.emp_code || "").trim(),
      work_date: String(row.work_date || "").slice(0, 10),
      shift_code: row.shift_code == null || row.shift_code === "" ? null : window.tcShiftCode(row.shift_code),
      note: row.note ?? null
    })).filter(row => row.emp_code && row.work_date);
    if (!cleanRows.length) return { saved_rows: 0 };

    // FIX16T: Auto Readiness = Employment Window + Operational Profile + Effective Working Team.
    try {
      const readiness=await client.rpc("ta_validate_schedule_readiness_v616t",{p_rows:cleanRows});
      if(!readiness.error&&readiness.data?.allowed===false){
        const first=Array.isArray(readiness.data.blocked)?readiness.data.blocked[0]:null;
        throw new Error(first?.code||"SCHEDULE_READINESS_REQUIRED");
      }
      if(readiness.error&&!missingFunction(readiness.error))throw readiness.error;
    }catch(e){if(!missingFunction(e))throw e;}

    // FIX16T: no legacy Team Enforcement preflight. Auto Readiness is the schedule prerequisite.

    const periodCheck = await window.TimeClockSystemPeriods?.checkScheduleDates?.(
      cleanRows.map(row => row.work_date),
      true
    );
    if (periodCheck && !periodCheck.allowed) {
      throw new Error(periodCheck.message || "SYSTEM_PERIOD_SCHEDULE_CLOSED");
    }

    // V6.14.24: use the write-only guarded bulk RPC.
    // V6.14.3 -> V6.11.17 bulk writer recalculates Attendance inside the
    // transaction, while V6.14.15+ finalizes/recalculates again after the
    // Scheduling Rule extension is saved. Large bulk actions can therefore hit
    // statement timeout / HTTP 500 before the final canonical refresh.
    // V6.14.24 keeps all write guards but defers Attendance to the existing
    // post-extension finalizer.
    let response = await client.rpc("ta_assign_shifts_bulk_v61424", {
      p_rows: cleanRows,
      p_change_reason: changeReason || "บันทึกกะแบบหลายรายการจากหน้าเว็บ",
      p_confirm_now: Boolean(confirmNow)
    });
    if (!response.error) return response.data;

    // Backward compatibility only when the new migration has not been run yet.
    // Do not retry old V6.14.3 on a real V6.14.24 database/runtime error,
    // otherwise the same mutation may be attempted twice.
    if (missingFunction(response.error)) {
      response = await client.rpc("ta_assign_shifts_bulk_v6143", {
        p_rows: cleanRows,
        p_change_reason: changeReason || "บันทึกกะแบบหลายรายการจากหน้าเว็บ",
        p_confirm_now: Boolean(confirmNow)
      });
      if (!response.error) return response.data;
      if (!missingFunction(response.error)) throw response.error;
      throw new Error(
        "BULK_SCHEDULE_V61424_REQUIRED: กรุณารัน SQL V6.14.24 เพื่อแก้ปัญหา Bulk Schedule 500 / Double Recalculation"
      );
    }

    throw response.error;
  }

  async function deleteBulk(app, empCodes, startDate, endDate, changeReason) {
    const client = app?.state?.client;
    if (!client) throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");

    const rangeDates = [];
    const start = new Date(`${String(startDate).slice(0,10)}T00:00:00`);
    const end = new Date(`${String(endDate).slice(0,10)}T00:00:00`);
    if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
      const from = start <= end ? start : end;
      const to = start <= end ? end : start;
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        rangeDates.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
      }
    }
    const periodCheck = await window.TimeClockSystemPeriods?.checkScheduleDates?.(
      rangeDates,
      true
    );
    if (periodCheck && !periodCheck.allowed) {
      throw new Error(periodCheck.message || "SYSTEM_PERIOD_SCHEDULE_CLOSED");
    }

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
    const suggested = expected === 0 ? "OFF" : firstHour != null && firstHour >= 18 ? "S134" : "STD";
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

  // V6.14.25: removed the unused browser-side PC/position day-off matrix fallback.
  // Schedule day type and paired day-off now come only from the canonical
  // config-driven Schedule RPC / Work Pattern resolver.


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
      "pc",
      "manager_department",
      "manager_division",
      "manager_gm",
      "manager_avp"
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

  // V6.14.63 — short-lived canonical Schedule read cache.
  // Month navigation repeatedly asks for the same immutable read window across
  // Schedule / Attendance calendar skeleton / Monthly Personal. Reuse only
  // successful reads; every schedule/attendance mutation clears this cache.
  const scheduleReadCacheV61463 = new Map();
  const SCHEDULE_READ_CACHE_TTL_V61463 = 60000;

  // FIX16N — org_id remains the canonical Department identity, and the
  // ALL/blank Department state now means "all Organization Units inside the
  // actor's authorized Scope". It must never fall back to the wider legacy
  // employee/day list for Manager/Acting runtime reads.
  const scheduleOrgEmployeeCodesCacheV616M = new Map();
  const ORG_UUID_RE_V616M = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function scheduleOrgIdentityValueV616M(value) {
    const text = String(value || '').trim();
    return ORG_UUID_RE_V616M.test(text) ? text : null;
  }

  async function scheduleOrgEmployeeCodesV616M(client,orgId,startDate,endDate) {
    const id = String(orgId || '').trim() || null;
    const key = `${id || 'ALL_SCOPE'}|${startDate}|${endDate}`;
    const hit = scheduleOrgEmployeeCodesCacheV616M.get(key);
    if (hit && Date.now() - hit.loadedAt <= 60000) return [...hit.codes];
    const {data,error} = await client.rpc('ta_get_org_employee_codes_v616m',{
      p_org_id:id,p_start_date:startDate,p_end_date:endDate
    });
    if (error) {
      if (missingFunction(error)) {
        throw new Error('ORG_SCOPE_SOURCE_OF_TRUTH_RPC_REQUIRED: กรุณารัน SQL FIX16O');
      }
      throw error;
    }
    const codes=[...new Set((data||[]).map(row=>scheduleText(row?.emp_code)).filter(Boolean))];
    scheduleOrgEmployeeCodesCacheV616M.set(key,{loadedAt:Date.now(),codes});
    return [...codes];
  }

  function scheduleReadCacheKeyV61463(args, disableRangePaging) {
    return JSON.stringify({
      start: args?.p_start_date || '',
      end: args?.p_end_date || '',
      zone: args?.p_zone || '',
      department: args?.p_department || '',
      orgId: args?.p_org_id || '',
      employees: Array.isArray(args?.p_emp_codes) ? [...args.p_emp_codes].map(String).sort() : null,
      statuses: Array.isArray(args?.p_schedule_statuses) ? [...args.p_schedule_statuses].map(String).sort() : null,
      onePage: Boolean(disableRangePaging)
    });
  }

  function cloneScheduleRowsV61463(rows) {
    return (rows || []).map(row => ({ ...row }));
  }

  function clearScheduleReadCacheV61463() {
    scheduleReadCacheV61463.clear();
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

    const rawDepartmentV616M = params.p_department ?? null;
    const orgIdV616M = String(params.p_org_id || scheduleOrgIdentityValueV616M(rawDepartmentV616M) || '').trim() || null;
    let effectiveEmpCodesV616M = params.p_emp_codes ?? null;

    // FIX16N: resolve the employee set even when Department is blank/ALL.
    // The backend returns all employees inside the authorized Organization
    // Scope for Manager/Acting, while Viewer compatibility remains own-access.
    const orgCodesV616M = await scheduleOrgEmployeeCodesV616M(
      client,orgIdV616M,rangeStartDate,rangeEndDate
    );
    const allowedV616M = new Set(orgCodesV616M || []);
    if (Array.isArray(effectiveEmpCodesV616M)) {
      effectiveEmpCodesV616M = effectiveEmpCodesV616M
        .map(scheduleText)
        .filter(code => code && allowedV616M.has(code));
    } else {
      effectiveEmpCodesV616M = [...allowedV616M];
    }
    // Empty array must never mean ALL employees to the canonical Schedule RPC.
    if (!effectiveEmpCodesV616M.length) return [];

    const rpcArgs = {
      p_start_date: rangeStartDate,
      p_end_date: rangeEndDate,
      p_zone: params.p_zone ?? null,
      p_department: orgIdV616M ? null : rawDepartmentV616M,
      p_org_id: orgIdV616M,
      p_emp_codes: effectiveEmpCodesV616M,
      p_schedule_statuses: params.p_schedule_statuses ?? null
    };

    const disableRangePaging = params.p_disable_range_paging === true;
    const scheduleCacheArgsV616M = {...rpcArgs,p_org_id:orgIdV616M};
    const scheduleCacheKeyV61463 = scheduleReadCacheKeyV61463(scheduleCacheArgsV616M, disableRangePaging);
    const scheduleCachedV61463 = scheduleReadCacheV61463.get(scheduleCacheKeyV61463);
    if (scheduleCachedV61463
        && Date.now() - Number(scheduleCachedV61463.savedAt || 0) <= SCHEDULE_READ_CACHE_TTL_V61463) {
      return cloneScheduleRowsV61463(scheduleCachedV61463.rows);
    }

    // V6.11.51:
    // Full-month PERSON view is batched by employee code before reaching this
    // function. Each request stays safely below 1,000 rows.
    const pageSize = 1000;
    const maxRows = disableRangePaging ? pageSize : 50000;
    const pagedRows = [];

    for (
      let from = 0;
      from < maxRows;
      from += pageSize
    ) {
      const scheduleRpcName = "ta_get_schedule_range_light_v616n";
      let request = client.rpc(scheduleRpcName,rpcArgs);

      if (!disableRangePaging) {
        if (typeof request?.order === "function") {
          request = request
            .order("emp_code", { ascending:true })
            .order("work_date", { ascending:true });
        }

        if (typeof request?.range === "function") {
          request = request.range(
            from,
            from + pageSize - 1
          );
        }
      }

      let response = await withTimeout(
        request,
        30000,
        `โหลดตารางกะ Day-off Consistency V6.14.25 ชุด ${Math.floor(from / pageSize) + 1}`
      );

      if(response.error) {
        if(missingFunction(response.error)) {
          throw new Error(
            "ORG_SCOPE_SOURCE_OF_TRUTH_RPC_REQUIRED: กรุณารัน SQL FIX16O เพื่อให้ Schedule ใช้ Organization Scope เดียวกับ Attendance"
          );
        }
        throw response.error;
      }

      const pageRows =
        Array.isArray(response.data)
          ? response.data
          : [];

      pagedRows.push(...pageRows);

      if (
        disableRangePaging
        || !pageRows.length
        || pageRows.length < pageSize
        || typeof request?.range !== "function"
      ) {
        break;
      }
    }

    // Defensive de-duplication in case database ordering changes between pages.
    const uniqueRows = new Map();
    pagedRows.forEach((row,index) => {
      const emp = scheduleText(row?.emp_code);
      const date = String(row?.work_date || "").slice(0,10);
      const key = emp && date
        ? `${emp}|${date}`
        : `__row_${index}`;
      uniqueRows.set(key, row);
    });

    const rows =
      [...uniqueRows.values()].map(
        row => ({
          ...row
        })
      );

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

    scheduleReadCacheV61463.set(scheduleCacheKeyV61463, {
      savedAt: Date.now(),
      rows: cloneScheduleRowsV61463(rows)
    });
    if (scheduleReadCacheV61463.size > 36) {
      const oldestKey = scheduleReadCacheV61463.keys().next().value;
      if (oldestKey) scheduleReadCacheV61463.delete(oldestKey);
    }

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
    const roleV616K = String(
      app?.state?.profile?._realRole || app?.state?.profile?.role || "VIEWER"
    ).toUpperCase();
    if (
      roleV616K !== "HR_ADMIN"
      && (!Array.isArray(exact.p_emp_codes) || !exact.p_emp_codes.length)
    ) {
      throw new Error(
        "SECURE_REVIEW_SCOPE_RPC_REQUIRED: ไม่อนุญาต Direct Table fallback โดยไม่มี Employee Scope"
      );
    }
    return withTimeout(directReview(client, exact), 30000, "โหลดรายการรอตรวจสอบสำรอง");
  }

  async function upsertShiftMaster(app, params) {
    const client = app?.state?.client;
    if (!client) throw new Error("ยังไม่ได้เชื่อมต่อ Supabase");
    const rpcArgs651 = {
      p_shift_code: window.tcShiftCode(params.shift_code),
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
      p_shift_code: window.tcShiftCode(params.shift_code),
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
      shift_code: window.tcShiftCode(params.shift_code),
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
    mergeScheduleEmployeeMeta,
    clearReadCache: clearScheduleReadCacheV61463
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
    const localISO = d => window.TimeClockCalendarV61448.localISO(d);
    const todayISO = () => window.TimeClockCalendarV61448.today();
    const monthISO = () => window.TimeClockCalendarV61448.month();
    const firstDayOfMonth = (d = new Date()) => window.TimeClockCalendarV61448.monthStart(d);
    const addCalendarDaysISO = (value,days) => window.TimeClockCalendarV61448.addDays(value,days);
    const parseLocalISO = value => {
      const [y,m,d] = String(value || "").slice(0,10).split("-").map(Number);
      return new Date(y, (m || 1)-1, d || 1);
    };
    const monthDays = (year, month) => new Date(year, month, 0).getDate();
    const scheduleWeekStarts = [1, 16]; // V6.14.8 Team View: half-month / ~15-day periods
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
      const cursor = parseLocalISO(startISO);
      const personMode =
        typeof scheduleCurrentView === "function"
        && scheduleCurrentView() === "PERSON";

      if (personMode) {
        const compact15 = String(scheduleViewState?.personDisplayMode || "MONTH").toUpperCase() === "15D";
        if (compact15) {
          const normalizedStart = parseLocalISO(scheduleBlockStartForDate(startISO));
          const lastDay = monthDays(normalizedStart.getFullYear(), normalizedStart.getMonth() + 1);
          const end = new Date(normalizedStart);
          end.setDate(normalizedStart.getDate() <= 1 ? Math.min(15,lastDay) : lastDay);
          const weekNumber = scheduleWeekStarts.indexOf(normalizedStart.getDate()) + 1;
          const dayCount = Math.max(0, Math.round((end-normalizedStart)/86400000)+1);
          return {
            startDate: localISO(normalizedStart),
            endDate: localISO(end),
            month:`${normalizedStart.getFullYear()}-${String(normalizedStart.getMonth()+1).padStart(2,"0")}`,
            weekNumber: weekNumber > 0 ? weekNumber : 1,
            viewMode:"PERSON",
            personDisplayMode:"15D",
            dates:Array.from({length:dayCount},(_,i)=>{const x=new Date(normalizedStart);x.setDate(normalizedStart.getDate()+i);return localISO(x);})
          };
        }

        const start = new Date(cursor.getFullYear(),cursor.getMonth(),1);
        const lastDay = monthDays(start.getFullYear(),start.getMonth()+1);
        const end = new Date(start.getFullYear(),start.getMonth(),lastDay);
        return {
          startDate: localISO(start),
          endDate: localISO(end),
          month:`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,"0")}`,
          weekNumber:null,
          viewMode:"PERSON",
          personDisplayMode:"MONTH",
          dates:Array.from({length:lastDay},(_,i)=>{const x=new Date(start);x.setDate(i+1);return localISO(x);})
        };
      }

      const start = cursor;
      const lastDay = monthDays(
        start.getFullYear(),
        start.getMonth() + 1
      );
      // V6.14.8: Team View is split into two practical half-month periods.
      // 1–15 is exactly 15 days; 16–month-end keeps day 31 visible when present.
      const end = new Date(start);
      end.setDate(
        start.getDate() <= 1
          ? Math.min(15, lastDay)
          : lastDay
      );
      const weekNumber =
        scheduleWeekStarts.indexOf(start.getDate()) + 1;

      return {
        startDate: localISO(start),
        endDate: localISO(end),
        month:
          `${start.getFullYear()}-`
          + `${String(start.getMonth()+1).padStart(2,"0")}`,
        weekNumber: weekNumber > 0 ? weekNumber : 1,
        viewMode: (typeof scheduleCurrentView === "function" && scheduleCurrentView() === "TIME") ? "TIME" : "TEAM",
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

    function scheduleTeamWeekOptionsV61151(monthValue) {
      const monthText = String(monthValue || "").slice(0,7);
      if (!/^\d{4}-\d{2}$/.test(monthText)) return [];

      const [year,month] = monthText.split("-").map(Number);
      const lastDay = monthDays(year,month);

      return scheduleWeekStarts
        .filter(startDay => startDay <= lastDay)
        .map((startDay,index) => {
          const start = new Date(year,month-1,startDay);
          const endDay = startDay === 1 ? Math.min(15,lastDay) : lastDay;
          const end = new Date(year,month-1,endDay);
          const startDate = localISO(start);
          const endDate = localISO(end);
          const dayCount =
            Math.round((end-start)/86400000)+1;

          return {
            weekNumber:index+1,
            startDate,
            endDate,
            dayCount,
            label:
              `ช่วงที่ ${index+1} • `
              + `${formatDate(startDate)} – ${formatDate(endDate)}`
              + ` • ${dayCount} วัน`
          };
        });
    }

    const syncSchedulePeriodUI = () => {
      const range = schedulePeriodRange();
      const personMode = range.viewMode === "PERSON";

      setVal("schedulePeriodStart", range.startDate);
      setVal("scheduleMonth", range.month);

      const startText = formatDate(range.startDate);
      const endText = formatDate(range.endDate);

      setText(
        "schedulePeriodLabel",
        personMode
          ? (range.personDisplayMode === "15D"
              ? `ช่วงที่ ${range.weekNumber} • ${startText} – ${endText} • ${range.dates.length} วัน`
              : `เต็มเดือน • ${startText} – ${endText} • ${range.dates.length} วัน`)
          : `ช่วงที่ ${range.weekNumber} • ${startText} – ${endText} • ${range.dates.length} วัน`
      );

      const caption = qs(".schedule-period-caption-v61118");
      if (caption) {
        caption.textContent = personMode
          ? (range.personDisplayMode === "15D" ? "ช่วง 15 วันที่แสดง" : "เดือนที่แสดง")
          : "ช่วง 15 วันที่แสดง";
      }

      if (personMode) {
        const monthDate = new Date(`${range.startDate}T00:00:00`);
        const thaiMonthYear = new Intl.DateTimeFormat(
          "th-TH",
          { month:"long", year:"numeric" }
        ).format(monthDate);

        const monthInline =
          $("schedulePersonMonthInlineV61152");

        if (monthInline) {
          monthInline.textContent =
            thaiMonthYear;
          monthInline.classList.remove("hidden");
        }
      } else {
        $("schedulePersonMonthInlineV61152")
          ?.classList.add("hidden");

        // V6.14.13: TEAM/TIME period context must follow the exact range used
        // by the grid. Never derive it from PERSON's remembered month.
        const selectedMonth =
          String(range.month || "").slice(0,7)
          || String(scheduleViewState.teamPeriodStart || "").slice(0,7)
          || monthISO();

        scheduleViewState.teamPeriodStart = range.startDate;

        const monthDate =
          new Date(`${selectedMonth}-01T00:00:00`);

        setText(
          "scheduleTeamWeekMonthV61152",
          new Intl.DateTimeFormat(
            "th-TH",
            { month:"long", year:"numeric" }
          ).format(monthDate)
        );

        setText(
          "scheduleTeamPeriodReadOnlyV6149",
          `ช่วงที่ ${range.weekNumber} • ${startText} – ${endText} • ${range.dates.length} วัน`
        );
      }

      const prev = $("schedulePrevMonthBtn");
      const next = $("scheduleNextMonthBtn");
      const current = $("scheduleTodayBtn");

      const person15 = personMode && range.personDisplayMode === "15D";
      const scheduleTableWrapV61420 = $("scheduleTableWrap");
      if (scheduleTableWrapV61420) {
        scheduleTableWrapV61420.classList.toggle(
          "schedule-person-full-month-v61420",
          personMode && !person15
        );
        scheduleTableWrapV61420.classList.toggle(
          "schedule-person-15-day-v61422",
          personMode && person15
        );
      }
      if (prev) {
        prev.title = personMode && !person15 ? "เดือนก่อน" : "ช่วงก่อน";
        prev.innerHTML = personMode && !person15
          ? "‹ <span>เดือนก่อน</span>"
          : "‹ <span>ช่วงก่อน</span>";
      }
      if (next) {
        next.title = personMode && !person15 ? "เดือนถัดไป" : "ช่วงถัดไป";
        next.innerHTML = personMode && !person15
          ? "<span>เดือนถัดไป</span> ›"
          : "<span>ช่วงถัดไป</span> ›";
      }
      if (current) {
        current.textContent = personMode && !person15 ? "เดือนปัจจุบัน" : "ช่วงปัจจุบัน";
      }

      document.querySelectorAll('[data-person-days-mode]').forEach(btn => {
        btn.classList.toggle('active', String(btn.dataset.personDaysMode || '').toUpperCase() === String(scheduleViewState.personDisplayMode || 'MONTH').toUpperCase());
      });
      document.querySelectorAll('[data-person-team-group-v616t]').forEach(btn => {
        btn.classList.toggle('active', String(btn.dataset.personTeamGroupV616t || '').toUpperCase() === String(scheduleViewState.personTeamGroupMode || 'TEAM').toUpperCase());
      });
      const personTitleV61412 = document.getElementById('schedulePersonTitleV61412');
      const personSubtitleV61412 = document.getElementById('schedulePersonSubtitleV61412');
      if (personTitleV61412) personTitleV61412.textContent = `ตารางกะรายบุคคล • ${range.personDisplayMode === '15D' ? '15 วัน' : 'เต็มเดือน'}`;
      if (personSubtitleV61412) personSubtitleV61412.textContent = range.personDisplayMode === '15D'
        ? 'แสดงช่วงประมาณ 15 วัน • ซ่อนคอลัมน์วันเริ่มงาน • Label แสดงเฉพาะ Icon • คัดลอก/วางกะได้เหมือนเดิม'
        : `แสดงทุกวันของเดือนในตารางเดียว • ${scheduleViewState.personTeamGroupMode==='TEAM'?'แบ่งตาม Working Team':'แสดงรายชื่อรวม'} • Label ใช้ Icon แบบ Minimal`;

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

    // V6.14.57 — Attendance duration display uses H.MM (hours.minutes), not
    // decimal hours. The Calculation Core remains minute-based. Examples:
    // 42 minutes -> 0.42, 180 minutes -> 3.00, 469 minutes -> 7.49.
    // This is a presentation/export formatter only; it does not change payroll
    // arithmetic or the canonical *_minutes values stored by the backend.
    function attendanceMinutesToHourMinuteV61457(value) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return "-";
      const sign = numeric < 0 ? "-" : "";
      const totalMinutes = Math.round(Math.abs(numeric));
      const hours = Math.floor(totalMinutes / 60);
      const minutes = totalMinutes % 60;
      return `${sign}${hours}.${String(minutes).padStart(2,"0")}`;
    }
    const attendanceShiftCode = r => normalizeTemplateCodeV665(
      r?.effective_shift_code
      || r?.assigned_shift_code
      || r?.shift_code
      || r?.auto_shift_code
      || null
    );
    function scheduleEffectiveShiftWindowV6133(row) {
      const code = window.tcShiftCode(
        row?.assigned_shift_code
        || row?.effective_shift_code
        || row?.auto_shift_code
        || row?.shift_code
        || ''
      );
      const master = (state.filters.shifts || []).find(
        shift => window.tcShiftCode(shift?.shift_code) === code
      ) || {};
      const ruleMode = String(
        row?.schedule_rule_mode
        || row?.work_mode_code
        || ''
      ).trim().toUpperCase();

      // Scheduling Rule owns the effective time window when the user selected
      // a dynamic/special mode. Do not fall back to a stale default shift time.
      if (ruleMode === 'HOUR_BASED') {
        return {
          code,
          start: row?.custom_start_time || row?.effective_shift_start_time || master.start_time || row?.shift_start_time || null,
          end: row?.custom_end_time || row?.effective_shift_end_time || master.end_time || row?.shift_end_time || null
        };
      }
      if (ruleMode === 'DYNAMIC_OFF') {
        return {
          code,
          start: row?.off_window_start || master.start_time || row?.effective_shift_start_time || row?.shift_start_time || null,
          end: row?.off_window_end || master.end_time || row?.effective_shift_end_time || row?.shift_end_time || null
        };
      }
      if (ruleMode === 'SPLIT_WAIT_NIGHT') {
        const basisCode = window.tcShiftCode(row?.base_shift_code || code);
        const basisMaster = (state.filters.shifts || []).find(
          shift => window.tcShiftCode(shift?.shift_code) === basisCode
        ) || {};
        return {
          code,
          start: row?.base_shift_start || row?.effective_shift_start_time || basisMaster.start_time || master.start_time || row?.shift_start_time || null,
          end: row?.second_segment_planned_end || row?.custom_end_time || row?.effective_shift_end_time || master.end_time || row?.shift_end_time || null
        };
      }

      // For a normal assigned shift, the assigned/effective code's Shift Master
      // is more reliable than row.shift_start_time/shift_end_time because those
      // fields can still contain the previous/default shift until a full reload.
      return {
        code,
        start: row?.effective_shift_start_time || row?.assigned_shift_start_time || master.start_time || row?.shift_start_time || null,
        end: row?.effective_shift_end_time || row?.assigned_shift_end_time || master.end_time || row?.shift_end_time || null
      };
    }

    function attendanceShiftTime(r, side) {
      const win = scheduleEffectiveShiftWindowV6133(r);
      return side === "start" ? win.start : win.end;
    }
    function normalizeTemplateCodeV665(value) {
      const code = String(value || "").trim().toUpperCase();
      if (["SINGLE_0830", "SINGLE_0830_1730", "ST6"].includes(code)) return "ST6";
      if (["SINGLE_0830_1800", "ST5"].includes(code)) return "ST5";
      if (code === "EARLY_SPLIT_FLEX") return "SPLIT_FLEX";
      return code;
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

    function attendancePunchStateV61120(r) {
      const certifiedActive = String(r?.certification_status || '').trim().toUpperCase() === 'CERTIFIED' && r?.certified_start_at && r?.certified_end_at;
      const shift1In = certifiedActive ? r.certified_start_at : (r?.shift_1_actual_in_at || r?.actual_in_at || r?.first_in);
      const shift1Out = certifiedActive ? r.certified_end_at : (r?.shift_1_actual_out_at || r?.actual_out_at || r?.last_out);
      const shift2Planned = Boolean(
        r?.shift_2_planned_start_at
        || r?.shift_2_planned_end_at
      );
      const paidSegmentCount = Number(r?.paid_segment_count || 0);
      const templateCode = String(
        r?.effective_work_template_code
        || r?.template_code
        || ''
      ).trim().toUpperCase();
      const shift2Required = certifiedActive ? false : (paidSegmentCount > 1
        || shift2Planned
        || templateCode === 'SPLIT_FLEX');
      const shift2In = r?.shift_2_actual_in_at
        || r?.actual_in_shift_2_at
        || r?.actual_in_2_at;
      const shift2Out = r?.shift_2_actual_out_at
        || r?.actual_out_shift_2_at
        || r?.actual_out_2_at;

      const shift1Complete = Boolean(shift1In && shift1Out);
      const shift2Complete = !shift2Required || Boolean(shift2In && shift2Out);
      const complete = shift1Complete && shift2Complete;

      return {
        shift1In,
        shift1Out,
        shift2In,
        shift2Out,
        shift2Required,
        shift1Complete,
        shift2Complete,
        complete,
        anyPunch: Boolean(shift1In || shift1Out || shift2In || shift2Out)
      };
    }

    function attendanceAbsenceMinutes(r) {
      const dayType = String(r?.day_type || '')
        .trim()
        .toUpperCase();
      const rawStatus = String(
        r?.calculation_status
        || r?.attendance_result
        || r?.attendance_status
        || ''
      ).toUpperCase();

      const isLeave =
        Boolean(r?.leave_request_id || r?.leave_type_code)
        || dayType === 'LEAVE'
        || [
          'LEAVE_APPROVED',
          'LEAVE_WITH_TIME',
          'PARTIAL_LEAVE',
          'PARTIAL_LEAVE_NO_TIME'
        ].includes(rawStatus);

      const workingShiftOverride = attendanceHasWorkingShiftOverrideV61155(r);

      if (
        isLeave
        || (dayType !== 'WORKDAY' && !workingShiftOverride)
      ) {
        return 0;
      }

      // V6.14.55 — "ขาดงาน(นาที)" has one canonical meaning in Attendance UI:
      //   • incomplete punch pair = full scheduled absence (existing rule)
      //   • complete punch pair + late >= 30 = the actual late minutes
      // Late 1–29 minutes remains LATE and contributes 0 absence minutes.
      const punchState = attendancePunchStateV61120(r);
      const lateMinutes = Math.max(0, Number(r?.late_minutes || 0) || 0);
      const backendValue = Number(r?.absence_minutes);

      if (punchState.complete) {
        if (lateMinutes >= ATTENDANCE_LATE_ABSENCE_THRESHOLD_V61428) {
          return Math.max(
            lateMinutes,
            Number.isFinite(backendValue) && backendValue > 0
              ? backendValue
              : 0
          );
        }
        return 0;
      }

      if (Number.isFinite(backendValue) && backendValue > 0) {
        return backendValue;
      }

      const start = attendanceClockMinutes(
        attendanceShiftTime(r,'start')
      );
      const end = attendanceClockMinutes(
        attendanceShiftTime(r,'end')
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

    // V6.14.48 — Canonical non-working shift resolver.
    // Paired OFF codes keep start/end times for schedule context, but those times
    // must never turn a day-off into a working shift in Attendance UI/statistics.
    function scheduleIsNonWorkingShiftV61447(codeValue, shiftMaster = null) {
      const code = window.tcShiftCode(codeValue || '');
      if (!code) return false;
      if (['OFF','HOL','LV','OSTD','OS043','OS134','OS135'].includes(code)) return true;
      if (/^OH[56]\d*/.test(code)) return true;
      if (shiftMaster?.is_workday === false) return true;
      return false;
    }

    function attendanceHasWorkingShiftOverrideV61155(r) {
      if (!r) return false;

      // V6.11.56:
      // Explicitly assigned shift is authoritative for the UI.
      // If Manager assigned OFF/HOL/LV, inherited effective/auto times from an
      // older/default schedule must never make the day look like a workday.
      const assignedCode = String(
        r?.assigned_shift_code
        || ''
      ).trim().toUpperCase();

      if (
        assignedCode
        && scheduleIsNonWorkingShiftV61447(assignedCode)
      ) {
        return false;
      }

      const shiftMeta =
        typeof scheduleResolveShiftMeta === 'function'
          ? scheduleResolveShiftMeta(r)
          : null;

      const code = String(
        shiftMeta?.code
        || assignedCode
        || r?.effective_shift_code
        || r?.shift_code
        || ''
      ).trim().toUpperCase();

      if (!code || scheduleIsNonWorkingShiftV61447(
        code,
        state.filters.shifts.find(
          shift => window.tcShiftCode(shift.shift_code) === window.tcShiftCode(code)
        ) || null
      ) || shiftMeta?.isWorking === false) {
        return false;
      }

      const hasTimes = Boolean(
        r?.shift_start_time
        || r?.effective_shift_start_time
        || r?.assigned_shift_start_time
        || r?.shift_1_planned_start_at
      ) && Boolean(
        r?.shift_end_time
        || r?.effective_shift_end_time
        || r?.assigned_shift_end_time
        || r?.shift_1_planned_end_at
      );

      return Boolean(
        hasTimes
        || shiftMeta?.isWorking === true
        || ['day','night','split'].includes(
          String(shiftMeta?.tone || '').toLowerCase()
        )
      );
    }

    const ATTENDANCE_LATE_ABSENCE_THRESHOLD_V61428 = 30;

    // V6.14.56 — The Attendance Detail column named "สาย" is intentionally
    // limited to the LATE policy band only (1–29 minutes). A delay of 30+
    // minutes is ABSENCE and its minutes are shown in "ขาดงาน(นาที)" instead,
    // preventing the same minutes from appearing in both columns.
    function attendanceLateMinutesForDisplayV61456(r) {
      const minutes = Math.max(0, Number(r?.late_minutes || 0) || 0);
      return minutes >= 1 && minutes < ATTENDANCE_LATE_ABSENCE_THRESHOLD_V61428
        ? minutes
        : 0;
    }

    // V6.14.28 canonical attendance display/statistics policy.
    // Primary status precedence: Leave / Day off / Absence / Late / Early / Normal.
    // Late >= 30 minutes is classified as ABSENCE and contributes the actual late
    // minutes to the canonical "ขาดงาน(นาที)" value. Missing punches remain full-shift
    // absence; Late 1–29 remains LATE.
    function attendancePolicyFlagsV61428(r) {
      const row = r || {};
      const dayType = String(row?.day_type || '').trim().toUpperCase();
      const rawStatus = String(
        row?.calculation_status
        || row?.attendance_result
        || row?.attendance_status
        || ''
      ).trim().toUpperCase();
      const backendStatus = String(row?.display_status || '').trim().toUpperCase();
      const leave = Boolean(
        row?.leave_request_id
        || row?.leave_type_code
        || dayType === 'LEAVE'
        || [
          'LEAVE','LEAVE_APPROVED','LEAVE_WITH_TIME',
          'PARTIAL_LEAVE','PARTIAL_LEAVE_NO_TIME'
        ].includes(rawStatus)
        || backendStatus === 'LEAVE'
      );

      const workingShiftOverride = attendanceHasWorkingShiftOverrideV61155(row);
      const attendanceShiftCodeV61447 = String(
        row?.assigned_shift_code
        || row?.effective_shift_code
        || row?.shift_code
        || ''
      ).trim();
      const attendanceShiftMasterV61447 = state.filters.shifts.find(
        shift => window.tcShiftCode(shift.shift_code) === window.tcShiftCode(attendanceShiftCodeV61447)
      ) || null;
      const explicitDayOffShiftV61447 = scheduleIsNonWorkingShiftV61447(
        attendanceShiftCodeV61447,
        attendanceShiftMasterV61447
      );
      const naturalDayOff = Boolean(
        !workingShiftOverride
        && (
          explicitDayOffShiftV61447
          || row?.is_weekly_off
          || row?.is_public_holiday
          || ['WEEKLY_OFF','COMP_OFF','HOLIDAY','PUBLIC_HOLIDAY','DAY_OFF'].includes(dayType)
        )
      );
      const dayOff = !leave && naturalDayOff;

      const punchState = attendancePunchStateV61120(row);
      const workDate = String(row?.work_date || '').slice(0,10);
      const future = Boolean(workDate && workDate > todayISO());
      const hasPlannedWindow = Boolean(attendanceShiftTime(row,'start') && attendanceShiftTime(row,'end'));
      const plannedWork = Boolean(
        !leave
        && !dayOff
        && (
          workingShiftOverride
          || dayType === 'WORKDAY'
          || Number(row?.expected_day || 0) === 1
          || hasPlannedWindow
        )
      );

      const lateMinutes = Math.max(0, Number(row?.late_minutes || 0) || 0);
      const earlyMinutes = Math.max(0, Number(row?.early_leave_minutes ?? row?.early_minutes ?? 0) || 0);

      let missingReason = null;
      if (plannedWork && !future && !punchState.complete) {
        if (!punchState.anyPunch) missingReason = 'MISSING_BOTH';
        else if (!punchState.shift1In) missingReason = 'MISSING_IN';
        else if (!punchState.shift1Out) missingReason = 'MISSING_OUT';
        else if (punchState.shift2Required && !punchState.shift2In) missingReason = 'MISSING_IN';
        else if (punchState.shift2Required && !punchState.shift2Out) missingReason = 'MISSING_OUT';
        else missingReason = 'MISSING_TIME';
      }

      const absenceByMissing = Boolean(missingReason);
      const absenceByLate = Boolean(
        plannedWork
        && !future
        && punchState.complete
        && lateMinutes >= ATTENDANCE_LATE_ABSENCE_THRESHOLD_V61428
      );
      const absence = absenceByMissing || absenceByLate;
      const late = Boolean(
        plannedWork
        && !future
        && punchState.complete
        && lateMinutes >= 1
        && lateMinutes < ATTENDANCE_LATE_ABSENCE_THRESHOLD_V61428
      );
      const early = Boolean(
        plannedWork
        && !future
        && punchState.complete
        && earlyMinutes > 0
      );
      const upcoming = Boolean(plannedWork && future);

      let primaryStatus = 'NORMAL';
      if (leave) primaryStatus = 'LEAVE';
      else if (dayOff) primaryStatus = 'DAY_OFF';
      else if (upcoming) primaryStatus = 'UPCOMING';
      else if (absence) primaryStatus = 'ABSENCE';
      else if (late && early) primaryStatus = 'LATE_AND_EARLY_LEAVE';
      else if (late) primaryStatus = 'LATE';
      else if (early) primaryStatus = 'EARLY_LEAVE';
      else if ([
        'WORKED_ON_WEEKLY_OFF','WORKED_ON_HOLIDAY',
        'WORKED_ON_COMP_OFF','WORKED_ON_OFFDAY'
      ].includes(rawStatus)) primaryStatus = rawStatus;
      else if (rawStatus === 'OVERTIME') primaryStatus = 'NORMAL';

      return {
        primaryStatus,
        leave,
        dayOff,
        upcoming,
        plannedWork,
        punchState,
        absence,
        absenceByMissing,
        absenceByLate,
        absenceReason: absenceByLate ? 'LATE_30_PLUS' : missingReason,
        late,
        lateMinutes,
        early,
        earlyMinutes,
        thresholdMinutes: ATTENDANCE_LATE_ABSENCE_THRESHOLD_V61428
      };
    }

    function attendanceDisplayStatus(r) {
      return attendancePolicyFlagsV61428(r).primaryStatus;
    }

    function normalizeAttendanceStatusFromPunchesV61120(r) {
      if (!r) return r;
      const originalStatus = String(r.display_status || '').trim().toUpperCase();
      const originalAbsence = Number(r.absence_minutes || 0);
      const flags = attendancePolicyFlagsV61428(r);

      // V6.14.55: Missing punches keep full-shift absence minutes;
      // complete-punch Late >=30 contributes the actual late minutes.
      r.absence_minutes = attendanceAbsenceMinutes(r);
      r.display_status = flags.primaryStatus;
      r.absence_reason = flags.absence ? flags.absenceReason : null;
      r.attendance_policy_version = 'V6.14.55';
      r.attendance_policy_threshold_minutes = ATTENDANCE_LATE_ABSENCE_THRESHOLD_V61428;

      r._attendance_status_corrected_by_punch_v61120 = Boolean(
        flags.punchState.complete
        && (
          ['ABSENCE','ABSENT','NO_TIME','MISSING_BOTH','MISSING_IN','MISSING_OUT'].includes(originalStatus)
          || originalAbsence > 0
          || flags.absenceByLate
        )
      );
      return r;
    }

    function attendanceDisplayLabel(r) {
      const status = typeof r === "string"
        ? r
        : attendanceDisplayStatus(r);

      return ({
        ABSENCE:"ขาดงาน",
        ABSENT:"ขาดงาน",
        LEAVE:"ลา",
        DAY_OFF:"วันหยุด",
        UPCOMING:"รอทำงาน",
        LATE:"มาสาย",
        EARLY_LEAVE:"กลับก่อน",
        LATE_AND_EARLY_LEAVE:"สายและกลับก่อน",
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

    function workTemplateLabelV6118(code) {
      const normalized =
        String(
          normalizeTemplateCodeV665(
            code
          )
          || code
          || ""
        )
          .trim()
          .toUpperCase();

      if(
        normalized ===
        "SPLIT_FLEX"
      ) {
        return "กะปกติ + งานลูกค้าช่วงดึก";
      }

      if(
        normalized ===
          "ST6"
        || normalized ===
          "ST5"
        || normalized ===
          "SINGLE_0830"
      ) {
        return "กะปกติ";
      }

      return normalized || "-";
    }

    function workSegmentTimeV6118(value) {
      if(!value) {
        return "-";
      }

      const text =
        String(value);

      if(
        text.includes("T")
      ) {
        return formatTime(
          text
        );
      }

      if(
        /^\d{4}-\d{2}-\d{2}\s/.test(
          text
        )
      ) {
        return text.slice(
          11,
          16
        );
      }

      return formatTime(
        text
      );
    }

    function attendancePlannedCellV61110(
      value,
      shiftNo,
      side,
      row
    ) {
      const time =
        workSegmentTimeV6118(
          value
        );

      const isOpenShift2End =
        shiftNo === 2
        && side === "END"
        && time === "-"
        && Boolean(
          row?.shift_2_planned_start_at
        )
        && String(
          row?.effective_work_template_code
          || row?.template_code
          || ""
        )
          .trim()
          .toUpperCase() ===
          "SPLIT_FLEX";

      if(isOpenShift2End) {
        return `<span class="attendance-planned-open-v61110">ตามเวลาออก</span>`;
      }

      if(time === "-") {
        return `<span class="attendance-punch-empty-v6119">-</span>`;
      }

      return `<span class="attendance-planned-value-v61110 shift-${shiftNo}"><b>${safe(time)}</b></span>`;
    }

    function attendancePunchCellV6119(
      value,
      shiftNo,
      side
    ) {
      const time =
        workSegmentTimeV6118(
          value
        );

      const label =
        side ===
          "IN"
          ? "เข้า"
          : "ออก";

      if(time === "-") {
        return `<span class="attendance-punch-empty-v6119">-</span>`;
      }

      return `<span class="attendance-punch-value-v6119 shift-${shiftNo} ${side.toLowerCase()}"><i>${label}</i><b>${safe(time)}</b></span>`;
    }

    function attendanceWorkSegmentsTextV6118(row) {
      const firstStart =
        workSegmentTimeV6118(
          row?.segment_1_start_at
        );

      const firstEnd =
        workSegmentTimeV6118(
          row?.segment_1_end_at
        );

      const secondStart =
        workSegmentTimeV6118(
          row?.segment_2_start_at
        );

      const secondEnd =
        workSegmentTimeV6118(
          row?.segment_2_end_at
        );

      const parts = [];

      if(
        firstStart !== "-"
        && firstEnd !== "-"
      ) {
        parts.push(
          `กะที่ 1 ${firstStart}-${firstEnd}`
        );
      }

      if(
        secondStart !== "-"
        && secondEnd !== "-"
      ) {
        parts.push(
          `กะที่ 2 ${secondStart}-${secondEnd}`
        );
      }

      return parts.length
        ? parts.join(" | ")
        : "-";
    }

    function attendanceWorkSegmentsHtmlV6118(row) {
      const text =
        attendanceWorkSegmentsTextV6118(
          row
        );

      if(text === "-") {
        return `<span class="work-segment-empty">-</span>`;
      }

      return `<div class="attendance-work-segment-lines">${
        text
          .split(" | ")
          .map(
            (line,index) => {
              const matched =
                line.match(
                  /^กะที่\s+(\d+)\s+(.+)$/
                );

              return `<span><b>กะที่ ${matched?.[1] || index+1}</b><em>${safe(
                matched?.[2]
                || line
              )}</em></span>`;
            }
          )
          .join("")
      }</div>`;
    }

    async function enrichAttendanceWorkSegmentsV6118(
      rows,
      startDate,
      endDate
    ) {
      if (!Array.isArray(rows) || !rows.length) return rows;

      rows.forEach(attendanceSeedSingleSegmentMetaV61463);

      if (!state.client) return rows;

      // V6.14.63: v61110 scans raw punch windows. Calling it for every employee
      // in a whole month caused the 500s shown in Console. Only special/multi-
      // segment work needs this second resolver; normal shifts already have the
      // canonical IN/OUT in Attendance Detail.
      const specialRows = rows.filter(attendanceNeedsPunchMetaV61463);
      const empCodes = [...new Set(
        specialRows.map(row => String(row.emp_code || '').trim()).filter(Boolean)
      )];

      if (!empCodes.length) {
        sanitizeCrossMidnightPunchOwnershipV61452(rows);
        return rows;
      }

      const metaMap = new Map();
      const chunks = [];
      for (let i = 0; i < empCodes.length; i += 30) chunks.push(empCodes.slice(i, i + 30));

      try {
        for (const chunk of chunks) {
          const { data, error } = await state.client.rpc(
            "ta_get_attendance_shift_punch_meta_v61110",
            { p_start_date:startDate, p_end_date:endDate, p_emp_codes:chunk }
          );
          if (error) throw error;
          (data || []).forEach(meta => {
            metaMap.set(`${String(meta.emp_code)}|${String(meta.work_date).slice(0,10)}`, meta);
          });
        }
      } catch (error) {
        // Do not make the whole page unusable when optional Shift-2 punch metadata
        // times out. Base Attendance remains canonical; special details can retry
        // when the user opens a narrower employee/day view.
        console.warn('Attendance special punch metadata V6.14.63 deferred:', error);
        sanitizeCrossMidnightPunchOwnershipV61452(rows);
        return rows;
      }

      specialRows.forEach(row => {
        const key = `${String(row.emp_code)}|${String(row.work_date).slice(0,10)}`;
        const meta = metaMap.get(key);
        if (!meta) return;
        Object.assign(row, meta);
        if (meta.effective_work_template_code) row.template_code = meta.effective_work_template_code;
      });

      sanitizeCrossMidnightPunchOwnershipV61452(rows);
      return rows;
    }

    function attendanceExportMatrix(rows) {
      const definitions = [
        ["work_date","วันที่",r => formatDate(r.work_date)],
        ["emp_code","รหัส",r => r.emp_code],
        ["full_name","ชื่อ-นามสกุล",r => r.full_name],
        ["department","หน่วยงาน",r => r.department],
        ["zone","พื้นที่",r => r.zone || r.area],
        ["sub_area","พื้นที่ย่อย",r => r.sub_area],
        ["pattern_code","รูปแบบงาน",r => r.pattern_code],
        ["template_code","รูปแบบช่วงงาน",r => workTemplateLabelV6118(r.template_code)],
        ["day_type","ประเภทวัน",r => attendanceLabel(r.day_type)],
        ["shift_code","กะ",r => attendanceShiftCode(r)],
        ["shift_1_start","กะที่ 1 • แผน เริ่มกะ",r => workSegmentTimeV6118(r.shift_1_planned_start_at)],
        ["shift_1_end","กะที่ 1 • แผน สิ้นสุดกะ",r => workSegmentTimeV6118(r.shift_1_planned_end_at)],
        ["shift_1_in","กะที่ 1 • ลงจริง เวลาเข้า",r => workSegmentTimeV6118(r.shift_1_actual_in_at)],
        ["shift_1_out","กะที่ 1 • ลงจริง เวลาออก",r => workSegmentTimeV6118(r.shift_1_actual_out_at)],
        ["shift_2_start","งานลูกค้าช่วงดึก • แผน เริ่ม",r => workSegmentTimeV6118(r.shift_2_planned_start_at)],
        ["shift_2_end","งานลูกค้าช่วงดึก • แผน สิ้นสุด",r => r.shift_2_planned_end_at ? workSegmentTimeV6118(r.shift_2_planned_end_at) : (r.shift_2_planned_start_at ? "ตามเวลาออก" : "-")],
        ["shift_2_in","งานลูกค้าช่วงดึก • ลงจริง เวลาเข้า",r => workSegmentTimeV6118(r.shift_2_actual_in_at)],
        ["shift_2_out","งานลูกค้าช่วงดึก • ลงจริง เวลาออก",r => workSegmentTimeV6118(r.shift_2_actual_out_at)],
        ["display_status","สถานะ",r => attendanceDisplayLabel(r)],
        ["net_work_minutes","ชม.สุทธิ",r => attendanceMinutesToHourMinuteV61457(r.net_work_minutes || 0)],
        ["regular_minutes","ชม.ปกติ",r => attendanceMinutesToHourMinuteV61457(r.regular_minutes || 0)],
        ["overtime_minutes","OT",r => attendanceMinutesToHourMinuteV61457(r.overtime_minutes || 0)],
        ["waiting_minutes","รอคอย",r => attendanceMinutesToHourMinuteV61457(r.waiting_minutes || 0)],
        ["break_deducted_minutes","พัก",r => (Number(r.break_deducted_minutes || 0)/60).toFixed(2)],
        ["late_minutes","สาย(นาที)",r => attendanceLateMinutesForDisplayV61456(r)],
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

    function assignmentWouldChangeStandardV61116() {
      const empCode = val("assignEmpCode");
      const workDate = val("assignWorkDate");
      const row = state.schedule.find(
        x => x.emp_code === empCode
          && String(x.work_date || '').slice(0,10) === workDate
      );
      if (!row) return false;
      return scheduleRequiresManagerConfirmationV61116({
        ...row,
        assigned_shift_code: val("assignShiftCode") || row.assigned_shift_code,
        daily_work_template_code: val("assignWorkTemplate") || row.daily_work_template_code
      });
    }

    function assignmentSaveIsAutoConfirmedV61117() {
      return Boolean(val("assignShiftCode"));
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
    function openModal(id) {
      const modal = $(id);
      if (!modal) return;
      modal.classList.remove("hidden");
      if (id === "assignModal") {
        document.body.classList.add("team-assignment-modal-open");
      }
    }
    function closeModal(id) {
      const modal = $(id);
      if (!modal) return;
      modal.classList.add("hidden");
      if (id === "assignModal") {
        document.body.classList.remove("team-assignment-modal-open");
      }
    }
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

        // FIX15B: keep Realtime authorization synchronized with the refreshed
        // access token. Run outside the auth callback tick to avoid auth-lock
        // re-entrancy while Supabase is persisting the new session.
        if (session?.access_token && state.client?.realtime?.setAuth) {
          setTimeout(() => {
            try {
              const result = state.client.realtime.setAuth(session.access_token);
              if (result?.catch) result.catch(() => {});
            } catch (_) {}
          }, 0);
        }

        if (event === "SIGNED_OUT") {
          window.dispatchEvent(new CustomEvent("timeclock:auth-signed-out"));
          showLogin();
        } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
          window.dispatchEvent(new CustomEvent("timeclock:auth-refreshed", { detail: { event } }));
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
      ["dashStart","reviewStart","leaveStart","correctionStart","exceptionStart"].forEach(id => setVal(id, start));
      ["dashEnd","reviewEnd","leaveEnd","correctionEnd","exceptionEnd"].forEach(id => setVal(id, end));

      // V6.14.62: Attendance Detail defaults to the complete calendar month.
      // Future planned days remain visible as UPCOMING instead of disappearing
      // simply because there is no punch yet. Other pages keep the old today-end.
      const attendanceMonthDate = new Date(`${start}T00:00:00`);
      const attendanceMonthEndDate = new Date(
        attendanceMonthDate.getFullYear(),
        attendanceMonthDate.getMonth() + 1,
        0
      );
      const attendanceMonthEnd = `${attendanceMonthEndDate.getFullYear()}-${String(attendanceMonthEndDate.getMonth()+1).padStart(2,"0")}-${String(attendanceMonthEndDate.getDate()).padStart(2,"0")}`;
      setVal("attStart", start);
      setVal("attEnd", attendanceMonthEnd);

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
      // FIX16K Scope Contract: USER is the technician/Portal role and must never
      // be promoted to MANAGER by the browser. Keep legacy Manager-Web access
      // read-only by treating USER as VIEWER; all write RPCs remain server-authoritative.
      const sourceRoleV616K = String(state.profile.role || "VIEWER").toUpperCase();
      state.profile._sourceRole = sourceRoleV616K;
      state.profile.role = sourceRoleV616K === "USER" ? "VIEWER" : sourceRoleV616K;
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
      $("teamPortalNavV61482")?.classList.toggle("hidden", String(p.role||"").toUpperCase()!=="MANAGER");
      $("teamMasterNavV61523")?.classList.toggle(
        "hidden",
        !["MANAGER","HR_ADMIN"].includes(String(p.role||"").toUpperCase())
        && window.TimeClockTemporaryAssignmentV61529F14B?.hasOperationalAuthority?.()!==true
      );
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
            "SECURE_SCOPE_FILTER_RPC_REQUIRED: กรุณารัน SQL V6.11.15"
          );
        }

        throw error;
      }

      const f = data || {};
      const orgContractV616L = await loadAuthorizedOrgContractV616L(
        val("dashStart"),
        val("dashEnd")
      );
      const rawZonesV616L = Array.isArray(f.zones) ? f.zones : [];
      const rawDepartmentsV616L = Array.isArray(f.departments) ? f.departments : [];
      const zonesV616L = scopedLocationValuesV616L(
        rawZonesV616L,
        orgContractV616L,
        ["zone","area"]
      );
      const departmentOptionsV616L = scopedDepartmentOptionsV616L(
        rawDepartmentsV616L,
        orgContractV616L
      );
      const departmentsV616L = departmentOptionsV616L.map(option => option.value);

      let shiftRows = Array.isArray(f.shifts) ? f.shifts : [];
      const shiftResponse = await state.client.rpc("ta_get_shift_master_v651");
      if (!shiftResponse.error && Array.isArray(shiftResponse.data)) shiftRows = shiftResponse.data;
      state.filters = {
        zones: zonesV616L,
        departments: departmentsV616L,
        departmentOptionsV616L,
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
      ["dashDepartment","scheduleDepartment","reportDepartment"].forEach(id =>
        fillScopedDepartmentSelectV616L(id, departmentOptionsV616L, "ทุกหน่วยงานใน Scope")
      );
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


    // V6.14.63 — successful Attendance chunks are reused briefly when users
    // move back/forward between months. Mutation/rebuild paths clear the cache.
    const attendanceReadCacheV61463 = new Map();
    const ATTENDANCE_READ_CACHE_TTL_V61463 = 60000;

    function attendanceReadCacheKeyV61463(range, requestEmployeeCodes) {
      return JSON.stringify({
        start: range?.start || '',
        end: range?.end || '',
        area: val("attZone") || '',
        subArea: val("attSubArea") || '',
        department: selectedOrgIdV616M("attDepartment") || val("attDepartment") || '',
        employees: Array.isArray(requestEmployeeCodes) ? [...requestEmployeeCodes].map(String).sort() : null
      });
    }

    function attendanceCloneRowsV61463(rows) {
      return (rows || []).map(row => ({ ...row }));
    }

    function clearAttendanceReadCacheV61463() {
      attendanceReadCacheV61463.clear();
    }

    function attendanceNeedsPunchMetaV61463(row) {
      const mode = String(
        row?.schedule_rule_mode
        || row?.work_mode_code
        || row?.effective_work_mode_code
        || ''
      ).trim().toUpperCase();
      const template = String(
        row?.daily_work_template_code
        || row?.effective_work_template_code
        || row?.template_code
        || row?.employee_default_template_code
        || ''
      ).trim().toUpperCase();
      return Number(row?.segment_count || row?.paid_segment_count || 0) > 1
        || ['NORMAL_LATE_CUSTOMER','SPLIT_WAIT_NIGHT','HOUR_BASED'].includes(mode)
        || ['SPLIT_FLEX','EARLY_SPLIT_FLEX'].includes(template)
        || Boolean(row?.shift_2_planned_start_at || row?.customer_window_start || row?.second_segment_start);
    }

    function attendanceClockValueV61463(value) {
      const raw = String(value ?? '').trim();
      if (!raw) return '';
      const timestampMatch = raw.match(/[T\s](\d{2}:\d{2}(?::\d{2})?)/);
      if (timestampMatch) return timestampMatch[1].length === 5 ? `${timestampMatch[1]}:00` : timestampMatch[1];
      const timeMatch = raw.match(/^(\d{1,2}:\d{2}(?::\d{2})?)/);
      if (!timeMatch) return '';
      const parts = timeMatch[1].split(':');
      return `${String(parts[0]).padStart(2,'0')}:${parts[1]}:${parts[2] || '00'}`;
    }

    function attendanceSeedSingleSegmentMetaV61463(row) {
      if (!row) return row;
      const workDate = String(row.work_date || '').slice(0,10);
      const start = attendanceClockValueV61463(row.effective_shift_start_time || row.shift_start_time || null);
      const end = attendanceClockValueV61463(row.effective_shift_end_time || row.shift_end_time || null);
      if (!row.shift_1_planned_start_at && workDate && start) {
        row.shift_1_planned_start_at = attendanceScheduleTimestampV61462(workDate, start, false);
      }
      if (!row.shift_1_planned_end_at && workDate && end) {
        const sm = attendanceClockMinutes(start);
        const em = attendanceClockMinutes(end);
        row.shift_1_planned_end_at = attendanceScheduleTimestampV61462(workDate, end, sm != null && em != null && em <= sm);
      }
      if (!row.shift_1_actual_in_at && (row.actual_in_at || row.first_in)) {
        const inTime = attendanceClockValueV61463(row.actual_in_at || row.first_in);
        if (inTime) row.shift_1_actual_in_at = `${workDate}T${inTime}`;
      }
      if (!row.shift_1_actual_out_at && (row.actual_out_at || row.last_out)) {
        const outTime = attendanceClockValueV61463(row.actual_out_at || row.last_out);
        const inM = attendanceClockMinutes(row.actual_in_at || row.first_in);
        const outM = attendanceClockMinutes(outTime);
        row.shift_1_actual_out_at = attendanceScheduleTimestampV61462(workDate, outTime, inM != null && outM != null && outM < inM);
      }
      return row;
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
        selectedOrgIdV616M("attDepartment") || val("attDepartment")
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

    // FIX16J: When the employee filter shows a small, scope-aware list, send
    // those employee codes explicitly to the attendance RPC. Previously the
    // UI displayed e.g. "พนักงานทั้งหมด • 5 คน" but translated that state to
    // p_emp_codes = null. On some Manager scopes / historical periods the
    // server returned no persisted attendance rows, and the calendar fallback
    // then had no employee codes to request, so the table stayed empty.
    // Keep null for large scopes to avoid oversized RPC payloads.
    function attendanceEmployeeCodesForLoadV616J() {
      const selected = attendanceEmployeeCodesForQuery();
      if (Array.isArray(selected) && selected.length) {
        return selected;
      }

      const optionCodes = [
        ...new Set(
          (attendanceEmployeeFilter.options || [])
            .map(employee => String(employee?.emp_code || "").trim())
            .filter(Boolean)
        )
      ];

      return optionCodes.length && optionCodes.length <= 250
        ? optionCodes
        : null;
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
      if (selectedOrgIdV616M("attDepartment")) return [];
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
          const orgIdV616M = selectedOrgIdV616M("attDepartment");
          const legacyDepartmentV616M = selectedLegacyDepartmentV616M("attDepartment");
          const argsV616M = {
            p_start_date: val("attStart"),
            p_end_date: val("attEnd"),
            p_area: val("attZone") || null,
            p_sub_area: val("attSubArea") || null,
            p_department: orgIdV616M ? null : legacyDepartmentV616M,
            p_org_id: orgIdV616M,
            p_search: null,
            p_limit: 5000
          };

          let response = await state.client.rpc(
            "ta_get_attendance_employee_options_v616m",argsV616M
          );

          if(response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
            if (orgIdV616M) throw new Error("ORG_SCOPE_SOURCE_OF_TRUTH_RPC_REQUIRED: กรุณารัน SQL FIX16O");
            const legacyArgs = {
              p_start_date:argsV616M.p_start_date,p_end_date:argsV616M.p_end_date,
              p_area:argsV616M.p_area,p_sub_area:argsV616M.p_sub_area,
              p_department:legacyDepartmentV616M,p_search:null,p_limit:5000
            };
            response = await state.client.rpc(
              "ta_get_attendance_employee_options_v61018",legacyArgs
            );
            if(response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
              response = await state.client.rpc("ta_get_attendance_employee_options_v671",legacyArgs);
            }
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
      const oldArea = preserve ? String(val("attZone") || "") : "";
      const oldSubArea = preserve ? String(val("attSubArea") || "") : "";
      const oldDepartment = preserve ? String(val("attDepartment") || "") : "";
      try {
        const orgContractV616L = await loadAuthorizedOrgContractV616L(
          val("attStart"),
          val("attEnd")
        );
        // Area-level scope first. Do not let a stale Sub-area constrain the parent list.
        let response = await state.client.rpc(
          "ta_get_attendance_filter_options_v61022",
          {
            p_start_date: val("attStart"),
            p_end_date: val("attEnd"),
            p_area: oldArea || null,
            p_sub_area: null
          }
        );
        if (response.error) {
          if (window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
            throw new Error(
              "SECURE_ATTENDANCE_FILTER_RPC_REQUIRED: กรุณารัน SQL V6.11.15"
            );
          }
          throw response.error;
        }

        let f = response.data || {};
        let areas = scopedLocationValuesV616L(
          Array.isArray(f.areas) ? f.areas : [],
          orgContractV616L,
          ["area","zone"]
        );
        let effectiveArea = oldArea && areas.some(v => String(v) === oldArea) ? oldArea : "";

        // If a manually typed/stale Area is invalid, reload the full authorized Area list.
        if (oldArea && !effectiveArea) {
          response = await state.client.rpc(
            "ta_get_attendance_filter_options_v61022",
            {
              p_start_date: val("attStart"),
              p_end_date: val("attEnd"),
              p_area: null,
              p_sub_area: null
            }
          );
          if (response.error) throw response.error;
          f = response.data || {};
          areas = scopedLocationValuesV616L(
            Array.isArray(f.areas) ? f.areas : [],
            orgContractV616L,
            ["area","zone"]
          );
        }

        let subAreas = scopedLocationValuesV616L(
          Array.isArray(f.sub_areas) ? f.sub_areas : [],
          orgContractV616L,
          ["sub_area"]
        );
        let departments = Array.isArray(f.departments) ? f.departments : [];

        // Employee options are the most concrete scope source for the hierarchy.
        // Use them to remove impossible Area/Sub-area/Department combinations.
        if (effectiveArea) {
          try {
            const areaEmployees = await attendanceHierarchyEmployeesV616K(effectiveArea,null);
            const derivedSubAreas = [...new Set(areaEmployees.map(r => r.sub_area).filter(Boolean))]
              .sort((a,b)=>a.localeCompare(b,"th",{numeric:true}));
            const derivedDepartments = [...new Set(areaEmployees.map(r => r.department).filter(Boolean))]
              .sort((a,b)=>a.localeCompare(b,"th",{numeric:true}));
            if (derivedSubAreas.length) subAreas = derivedSubAreas;
            if (areaEmployees.length) departments = derivedDepartments;
          } catch (hierarchyError) {
            console.warn("Attendance scope hierarchy area FIX16K:",hierarchyError);
          }
        }

        subAreas = scopedLocationValuesV616L(subAreas,orgContractV616L,["sub_area"]);
        let effectiveSubArea = oldSubArea && subAreas.some(v => String(v) === oldSubArea)
          ? oldSubArea
          : "";

        if (effectiveArea && effectiveSubArea) {
          try {
            const subEmployees = await attendanceHierarchyEmployeesV616K(effectiveArea,effectiveSubArea);
            departments = [...new Set(subEmployees.map(r => r.department).filter(Boolean))]
              .sort((a,b)=>a.localeCompare(b,"th",{numeric:true}));
          } catch (hierarchyError) {
            // Fall back to server filter RPC for the exact hierarchy.
            const child = await state.client.rpc(
              "ta_get_attendance_filter_options_v61022",
              {
                p_start_date: val("attStart"),
                p_end_date: val("attEnd"),
                p_area: effectiveArea,
                p_sub_area: effectiveSubArea
              }
            );
            if (!child.error) {
              departments = Array.isArray(child.data?.departments) ? child.data.departments : departments;
            }
          }
        }

        areas = scopedLocationValuesV616L(areas,orgContractV616L,["area","zone"]);
        subAreas = scopedLocationValuesV616L(subAreas,orgContractV616L,["sub_area"]);
        effectiveArea = effectiveArea && areas.includes(effectiveArea) ? effectiveArea : "";
        effectiveSubArea = effectiveSubArea && subAreas.includes(effectiveSubArea) ? effectiveSubArea : "";
        const attendanceDepartmentOptionsV616L = scopedDepartmentOptionsV616L(
          departments,
          orgContractV616L,
          {area:effectiveArea,sub_area:effectiveSubArea}
        );
        departments = attendanceDepartmentOptionsV616L.map(option => String(option?.label || option?.value || '').trim()).filter(Boolean);

        state.filters.attendance = {
          areas,
          sub_areas: subAreas,
          departments,
          departmentOptionsV616L: attendanceDepartmentOptionsV616L,
          employees: state.filters.attendance.employees || []
        };
        fillSearchableAttendanceFilter("attZone","attZoneOptions",areas,"ทุกพื้นที่");
        fillSearchableAttendanceFilter("attSubArea","attSubAreaOptions",subAreas,"ทุกพื้นที่ย่อย");
        fillSearchableDepartmentIdentityV616M(
          "attDepartment","attDepartmentOptions",attendanceDepartmentOptionsV616L,"ทุกหน่วยงานใน Scope"
        );

        setVal("attZone",effectiveArea);
        setVal("attSubArea",effectiveSubArea);
        let effectiveDepartment = departmentOptionPreservedValueV616M(
          oldDepartment,attendanceDepartmentOptionsV616L,{input:true}
        );
        // When Scope resolves to exactly one Organization Unit, show it
        // explicitly instead of leaving a misleading blank "all" field.
        if (!effectiveDepartment && attendanceDepartmentOptionsV616L.length === 1) {
          effectiveDepartment = String(attendanceDepartmentOptionsV616L[0]?.label || '').trim();
        }
        setVal("attDepartment",effectiveDepartment);
      } catch (err) {
        toast(`โหลดตัวกรองรายละเอียดเวลาไม่สำเร็จ: ${humanError(err)}`, "error");
      }

      invalidateAttendanceEmployeeOptions(preserve);
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

    // FIX16L — Organization Scope Contract. Organization Structure + Manager/Acting
    // scope is the UI source of truth. Legacy filter values remain the submitted
    // values so existing Dashboard/Attendance/Schedule readers stay compatible.
    const orgScopeContractV616L = {
      cache: new Map(),
      ttl: 60000
    };

    function orgScopeNormalizeV616L(value) {
      return String(value || "")
        .trim()
        .toLocaleLowerCase("th-TH")
        .replace(/\s+/g," ");
    }

    function orgScopeTextArrayV616L(value) {
      if (Array.isArray(value)) return value;
      if (value == null || value === "") return [];
      if (typeof value === "string") {
        const text = value.trim();
        if (!text) return [];
        if (text.startsWith("{") && text.endsWith("}")) {
          return text.slice(1,-1).split(",").map(v => v.replace(/^"|"$/g,"").trim()).filter(Boolean);
        }
      }
      return [value];
    }

    async function loadAuthorizedOrgContractV616L(startDate,endDate) {
      const start = String(startDate || todayISO()).slice(0,10);
      const end = String(endDate || start).slice(0,10);
      const key = `${start}|${end}`;
      const cached = orgScopeContractV616L.cache.get(key);
      if (cached && Date.now() - cached.loadedAt <= orgScopeContractV616L.ttl) {
        return cached;
      }

      // FIX16O: Organization Scope is resolved directly from Manager/Acting
      // scope + Org Master. Do not derive the UI contract from legacy
      // employee/day permission rows.
      let response = await state.client.rpc(
        "ta_get_authorized_org_units_v616o",
        { p_start_date:start, p_end_date:end }
      );
      let strict = true;
      let identity = true;
      if (response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
        response = await state.client.rpc(
          "ta_get_authorized_org_units_v616m",
          { p_start_date:start, p_end_date:end }
        );
      }
      if (response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
        identity = false;
        response = await state.client.rpc(
          "ta_get_authorized_org_units_v616l",
          { p_start_date:start, p_end_date:end }
        );
      }
      if (response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
        strict = false;
        identity = false;
        response = await state.client.rpc(
          "ta_get_schedule_org_units_v61529f15o",
          { p_start_date:start, p_end_date:end }
        );
      }
      if (response.error) throw response.error;

      const unitsV616O = Array.isArray(response.data) ? response.data : [];
      // Ordinary VIEWER keeps own-access compatibility. Acting users can still
      // enter strict mode because their authorized Organization list is non-empty.
      const runtimeRoleV616O = String(state.profile?._sourceRole || state.profile?.role || "VIEWER").toUpperCase();
      strict = strict && (
        ["MANAGER","HR_ADMIN"].includes(runtimeRoleV616O)
        || unitsV616O.length > 0
      );
      const contract = {
        loadedAt: Date.now(),
        strict,
        identity,
        start,
        end,
        units: unitsV616O
      };
      orgScopeContractV616L.cache.set(key,contract);
      return contract;
    }

    function orgUnitDepartmentAliasesV616L(unit) {
      return [
        unit?.org_name,
        unit?.org_code,
        ...orgScopeTextArrayV616L(unit?.department_filter_values)
      ].map(orgScopeNormalizeV616L).filter(Boolean);
    }

    function scopedDepartmentOptionsV616L(values,contract,context={}) {
      const raw = [...new Set((Array.isArray(values) ? values : [])
        .map(value => String(value || "").trim()).filter(Boolean))];
      if (!contract?.strict) {
        return raw.map(value => ({value,label:value,org_id:null,org_code:null,legacy_value:value,legacy_values:[value],identity:false}));
      }
      const units = Array.isArray(contract?.units) ? contract.units : [];
      if (!units.length) return [];

      // FIX16M: one option per org_id. A legacy department alias may intentionally
      // map to multiple Organization Units; both remain visible and are separated
      // by org_code in the label instead of collapsing to the first match.
      if (contract?.identity) {
        const zoneKey = orgScopeNormalizeV616L(context?.zone || context?.area || '');
        const subAreaKey = orgScopeNormalizeV616L(context?.sub_area || '');
        const rows = [];
        const seen = new Set();

        units.forEach(unit => {
          const aliasesRaw = [
            unit?.org_name,
            unit?.org_code,
            ...orgScopeTextArrayV616L(unit?.department_filter_values)
          ].map(value => String(value || '').trim()).filter(Boolean);
          const aliasKeys = aliasesRaw.map(orgScopeNormalizeV616L);
          const matchedRaw = raw.length
            ? raw.find(value => aliasKeys.includes(orgScopeNormalizeV616L(value)))
            : null;

          // FIX16M: Organization Structure is the source of identity choices.
          // Do not require a legacy department alias to exist in the current
          // Attendance/Schedule result. This keeps authorized parent units and
          // zero-row units selectable, and selecting a parent can aggregate its
          // authorized descendants by org_id.
          if (zoneKey) {
            const unitZones=[unit?.zone,unit?.area].map(orgScopeNormalizeV616L).filter(Boolean);
            if (unitZones.length && !unitZones.includes(zoneKey)) return;
          }
          if (subAreaKey) {
            const unitSub=orgScopeNormalizeV616L(unit?.sub_area);
            if (unitSub && unitSub!==subAreaKey) return;
          }

          const orgId=String(unit?.org_id || '').trim();
          if (!orgId || seen.has(orgId)) return;
          seen.add(orgId);
          const code=String(unit?.org_code || '').trim();
          const name=String(unit?.org_name || matchedRaw || code || '').trim();
          const label=String(unit?.identity_label || '').trim()
            || [code,name].filter(Boolean).join(' · ')
            || name
            || code;
          rows.push({
            value:orgId,
            label,
            org_id:orgId,
            org_code:code || null,
            legacy_value:String(matchedRaw || aliasesRaw[0] || '').trim() || null,
            legacy_values:aliasesRaw,
            alias_ambiguous:unit?.alias_ambiguous===true,
            identity:true
          });
        });

        return rows.sort((a,b)=>a.label.localeCompare(b.label,'th',{numeric:true}));
      }

      const aliasMap = new Map();
      units.forEach(unit => {
        orgUnitDepartmentAliasesV616L(unit).forEach(alias => {
          if (!aliasMap.has(alias)) aliasMap.set(alias,[]);
          aliasMap.get(alias).push(unit);
        });
      });

      return raw.map(value => {
        const matches = aliasMap.get(orgScopeNormalizeV616L(value)) || [];
        if (!matches.length) return null;
        const unit = matches[0];
        const duplicate = matches.length > 1;
        const name = String(unit?.org_name || value).trim() || value;
        const code = String(unit?.org_code || "").trim();
        return {
          value,
          label: duplicate && code ? `${name} (${code})` : name,
          org_id: unit?.org_id || null,
          org_code: code || null,
          legacy_value:value,
          legacy_values:[value],
          identity:false
        };
      }).filter(Boolean);
    }

    function scopedLocationValuesV616L(values,contract,fields=[]) {
      const raw = [...new Set((Array.isArray(values) ? values : [])
        .map(value => String(value || "").trim()).filter(Boolean))];
      if (!contract?.strict) return raw;
      const units = Array.isArray(contract?.units) ? contract.units : [];
      const allowedDisplay = new Map();
      units.forEach(unit => fields.forEach(field => {
        const display = String(unit?.[field] || "").trim();
        const key = orgScopeNormalizeV616L(display);
        if (key && !allowedDisplay.has(key)) allowedDisplay.set(key,display);
      }));
      // FIX16O: Org Contract is the source of the location choices too.
      // Legacy filter RPC may legitimately return zero rows before a Schedule
      // exists, so filtering only its values can make Area/Sub-area disappear.
      if (allowedDisplay.size) {
        return [...allowedDisplay.values()].sort((a,b)=>a.localeCompare(b,"th",{numeric:true}));
      }
      return raw;
    }

    function fillScopedDepartmentSelectV616L(id,options,allLabel) {
      const el = $(id);
      if (!el) return;
      const old = el.value;
      const rows = Array.isArray(options) ? options : [];
      el.innerHTML = `<option value="">${safe(allLabel)}</option>` + rows.map(option => {
        const value = String(option?.value ?? option ?? "").trim();
        const label = String(option?.label ?? value).trim() || value;
        const legacy = String(option?.legacy_value || '').trim();
        return `<option value="${safe(value)}" data-org-code="${safe(option?.org_code || "")}" data-org-id="${safe(option?.org_id || "")}" data-legacy-value="${safe(legacy)}" data-org-identity="${option?.identity ? '1':'0'}">${safe(label)}</option>`;
      }).join("");
      if ([...el.options].some(option => option.value === old)) el.value = old;
    }

    function departmentOptionPreservedValueV616M(oldValue,options,{input=false}={}) {
      const old=String(oldValue||'').trim();
      if(!old) return '';
      const rows=Array.isArray(options)?options:[];
      const oldKey=orgScopeNormalizeV616L(old);
      const matches=rows.filter(option=>{
        if(orgScopeNormalizeV616L(option?.value)===oldKey) return true;
        if(orgScopeNormalizeV616L(option?.label)===oldKey) return true;
        return (option?.legacy_values||[]).some(value=>orgScopeNormalizeV616L(value)===oldKey);
      });
      if(matches.length!==1) return '';
      return String(input ? matches[0].label : matches[0].value || '').trim();
    }

    function fillSearchableDepartmentIdentityV616M(inputId,listId,options,placeholder) {
      const input=$(inputId), list=$(listId);
      if(!input || !list) return;
      const rows=Array.isArray(options)?options:[];
      list.innerHTML=rows.map(option=>`<option value="${safe(String(option?.label||option?.value||''))}"></option>`).join('');
      input.placeholder=placeholder;
      input.dataset.options=JSON.stringify(rows.map(option=>String(option?.label||option?.value||'')).filter(Boolean));
      input.dataset.orgIdentityOptions=JSON.stringify(rows.map(option=>({
        label:String(option?.label||option?.value||''),
        value:String(option?.value||''),
        org_id:String(option?.org_id||''),
        org_code:String(option?.org_code||''),
        legacy_value:String(option?.legacy_value||''),
        legacy_values:Array.isArray(option?.legacy_values)?option.legacy_values:[]
      })));
    }

    function selectedOrgIdV616M(id) {
      const el=$(id);
      if(!el) return null;
      if(String(el.tagName||'').toUpperCase()==='SELECT') {
        const option=el.options?.[el.selectedIndex] || null;
        const direct=String(option?.dataset?.orgId || '').trim();
        if(direct) return direct;
        const value=String(el.value||'').trim();
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)?value:null;
      }
      const value=String(el.value||'').trim();
      if(!value) return null;
      try {
        const rows=JSON.parse(el.dataset.orgIdentityOptions||'[]');
        const key=orgScopeNormalizeV616L(value);
        const match=rows.find(row=>orgScopeNormalizeV616L(row?.label)===key || orgScopeNormalizeV616L(row?.value)===key);
        return String(match?.org_id||'').trim() || null;
      } catch(_) { return null; }
    }

    function selectedLegacyDepartmentV616M(id) {
      const el=$(id);
      if(!el) return null;
      const orgId=selectedOrgIdV616M(id);
      if(String(el.tagName||'').toUpperCase()==='SELECT') {
        const option=el.options?.[el.selectedIndex] || null;
        if(orgId) return String(option?.dataset?.legacyValue || '').trim() || null;
        return String(el.value||'').trim() || null;
      }
      const value=String(el.value||'').trim();
      if(!orgId) return value || null;
      try {
        const rows=JSON.parse(el.dataset.orgIdentityOptions||'[]');
        const key=orgScopeNormalizeV616L(value);
        const match=rows.find(row=>orgScopeNormalizeV616L(row?.label)===key || String(row?.org_id||'')===orgId);
        return String(match?.legacy_value||'').trim() || null;
      } catch(_) { return null; }
    }

    function selectedDepartmentDisplayV616M(id) {
      const el=$(id);
      if(!el) return '';
      if(String(el.tagName||'').toUpperCase()==='SELECT') {
        return String(el.options?.[el.selectedIndex]?.textContent || '').trim();
      }
      return String(el.value||'').trim();
    }

    async function loadOrgEmployeeCodesV616M(orgId,startDate,endDate) {
      const id=String(orgId||'').trim() || null;
      const start=String(startDate||todayISO()).slice(0,10);
      const end=String(endDate||start).slice(0,10);
      const key=`EMP|${id || 'ALL_SCOPE'}|${start}|${end}`;
      const hit=orgScopeContractV616L.cache.get(key);
      if(hit && Date.now()-hit.loadedAt<=orgScopeContractV616L.ttl) return [...hit.codes];
      const {data,error}=await state.client.rpc('ta_get_org_employee_codes_v616m',{p_org_id:id,p_start_date:start,p_end_date:end});
      if(error) {
        if(window.TimeClockShiftAPI?.missingFunction?.(error)) throw new Error('ORG_SCOPE_SOURCE_OF_TRUTH_RPC_REQUIRED: กรุณารัน SQL FIX16O');
        throw error;
      }
      const codes=[...new Set((data||[]).map(row=>String(row?.emp_code||'').trim()).filter(Boolean))];
      orgScopeContractV616L.cache.set(key,{loadedAt:Date.now(),codes});
      return [...codes];
    }


    async function loadScopeEmployeeOptionsV616O(orgId,startDate,endDate) {
      const id=String(orgId||'').trim() || null;
      const start=String(startDate||todayISO()).slice(0,10);
      const end=String(endDate||start).slice(0,10);
      const key=`EMP_OPTIONS_V616O|${id || 'ALL_SCOPE'}|${start}|${end}`;
      const hit=orgScopeContractV616L.cache.get(key);
      if(hit && Date.now()-hit.loadedAt<=orgScopeContractV616L.ttl) return hit.rows.map(row=>({...row}));
      const {data,error}=await state.client.rpc('ta_get_scope_employee_options_v616o',{
        p_org_id:id,p_start_date:start,p_end_date:end
      });
      if(error) {
        if(window.TimeClockShiftAPI?.missingFunction?.(error)) {
          throw new Error('ORG_SCOPE_SOURCE_OF_TRUTH_RPC_REQUIRED: กรุณารัน SQL FIX16O');
        }
        throw error;
      }
      const rows=(data||[]).map(row=>({
        ...row,
        emp_code:String(row?.emp_code||'').trim(),
        full_name:String(row?.full_name||'').trim(),
        position_name:String(row?.position_name||'').trim(),
        department:String(row?.department||row?.org_name||'').trim(),
        area:String(row?.area||'').trim(),
        sub_area:String(row?.sub_area||'').trim(),
        org_id:String(row?.org_id||'').trim(),
        org_code:String(row?.org_code||'').trim(),
        org_name:String(row?.org_name||'').trim()
      })).filter(row=>row.emp_code);
      orgScopeContractV616L.cache.set(key,{loadedAt:Date.now(),rows});
      return rows.map(row=>({...row}));
    }


    // FIX16Q — Canonical Organization display/filter binding.
    // Keep legacy `department` untouched for backward-compatible RPC/business rules;
    // UI pages use these canonical metadata fields instead.
    function canonicalScopeEmployeeMetaMapV616Q(rows = []) {
      const map = new Map();
      (Array.isArray(rows) ? rows : []).forEach(row => {
        const empCode = String(row?.emp_code || row?.EmployeeId || '').trim();
        if (empCode) map.set(empCode,row);
      });
      return map;
    }

    function applyCanonicalOrgMetaV616Q(row,meta) {
      if (!row || !meta) return row;
      const orgId=String(meta?.org_id || '').trim();
      const orgCode=String(meta?.org_code || '').trim();
      const orgName=String(meta?.org_name || '').trim();
      const area=String(meta?.area || '').trim();
      const subArea=String(meta?.sub_area || '').trim();
      if (orgId) row._canonical_org_id_v616q=orgId;
      if (orgCode) row._canonical_org_code_v616q=orgCode;
      if (orgName) row._canonical_org_name_v616q=orgName;
      if (area) row._canonical_area_v616q=area;
      if (subArea) row._canonical_sub_area_v616q=subArea;
      row._canonical_org_label_v616q=[orgCode,orgName].filter(Boolean).join(' · ') || orgName || orgCode || '';
      return row;
    }

    function canonicalOrgNameV616Q(row) {
      return String(
        row?._canonical_org_name_v616q
        || row?._team_org_name_v616l
        || row?.org_name
        || row?.department
        || ''
      ).trim();
    }

    function canonicalOrgCodeV616Q(row) {
      return String(
        row?._canonical_org_code_v616q
        || row?._team_org_code_v61123
        || row?.org_code
        || ''
      ).trim();
    }

    function canonicalOrgLabelV616Q(row) {
      const explicit=String(row?._canonical_org_label_v616q || '').trim();
      if (explicit) return explicit;
      const code=canonicalOrgCodeV616Q(row);
      const name=canonicalOrgNameV616Q(row);
      return [code,name].filter(Boolean).join(' · ') || name || code || 'ไม่ระบุหน่วยงาน';
    }

    function canonicalOrgIdentityV616Q(row) {
      return String(row?._canonical_org_id_v616q || row?.org_id || row?.department || '').trim();
    }

    function canonicalAreaV616Q(row) {
      return String(row?._canonical_area_v616q || row?.area || row?.zone || '').trim();
    }

    function canonicalSubAreaV616Q(row) {
      return String(row?._canonical_sub_area_v616q || row?.sub_area || '').trim();
    }

    // FIX16K — Scope Contract helpers. UI filters are only a convenience layer;
    // every data RPC remains the final permission boundary. These helpers prevent
    // impossible Area > Sub-area > Department combinations from being selectable.
    function attendanceRejectOutOfScopeValueV616K(inputId,label) {
      const value = String(val(inputId) || "").trim();
      if (!value || attendanceFilterHasOption(inputId,value)) return true;
      setVal(inputId,"");
      toast(`${label} “${value}” ไม่อยู่ใน Scope หรือไม่สัมพันธ์กับตัวกรองก่อนหน้า`,"warning");
      return false;
    }

    async function attendanceHierarchyEmployeesV616K(area,subArea) {
      const args = {
        p_start_date: val("attStart"),
        p_end_date: val("attEnd"),
        p_area: area || null,
        p_sub_area: subArea || null,
        p_department: null,
        p_search: null,
        p_limit: 5000
      };
      let response = await state.client.rpc(
        "ta_get_attendance_employee_options_v61018",
        args
      );
      if (
        response.error
        && window.TimeClockShiftAPI?.missingFunction?.(response.error)
      ) {
        response = await state.client.rpc(
          "ta_get_attendance_employee_options_v671",
          args
        );
      }
      if (response.error) throw response.error;
      return (response.data || [])
        .map(normalizeAttendanceEmployeeOption)
        .filter(row => row.emp_code);
    }

    async function loadScopedAreaDepartmentOptionsV616K({
      startId,
      endId,
      areaId,
      departmentId,
      preserve = true
    } = {}) {
      if (!state.client || !$(areaId) || !$(departmentId)) return null;
      const start = val(startId);
      const end = val(endId);
      const oldArea = preserve ? String(val(areaId) || "") : "";
      const oldDepartment = preserve ? String(val(departmentId) || "") : "";
      if (!start || !end) return null;
      try {
        let base = await state.client.rpc(
          "ta_get_attendance_filter_options_v61022",
          {
            p_start_date: start,
            p_end_date: end,
            p_area: null,
            p_sub_area: null
          }
        );
        if (base.error) throw base.error;
        const orgContractV616L = await loadAuthorizedOrgContractV616L(start,end);
        const areas = scopedLocationValuesV616L(
          Array.isArray(base.data?.areas) ? base.data.areas : [],
          orgContractV616L,
          ["area","zone"]
        );
        fillSelect(areaId,areas,"ทุกพื้นที่");
        const area = oldArea && areas.some(v => String(v) === oldArea) ? oldArea : "";
        setVal(areaId,area);

        let scoped = base.data || {};
        if (area) {
          const response = await state.client.rpc(
            "ta_get_attendance_filter_options_v61022",
            {
              p_start_date: start,
              p_end_date: end,
              p_area: area,
              p_sub_area: null
            }
          );
          if (response.error) throw response.error;
          scoped = response.data || {};
        }
        const departmentOptionsV616L = scopedDepartmentOptionsV616L(
          Array.isArray(scoped.departments) ? scoped.departments : [],
          orgContractV616L,
          {area}
        );
        const departments = departmentOptionsV616L.map(option => option.value);
        fillScopedDepartmentSelectV616L(departmentId,departmentOptionsV616L,"ทุกหน่วยงานใน Scope");
        const department = departmentOptionPreservedValueV616M(oldDepartment,departmentOptionsV616L);
        setVal(departmentId,department);
        return {areas,departments,departmentOptionsV616L,area,department};
      } catch (error) {
        console.warn("Scoped Area/Department options FIX16K:",error);
        return null;
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
      const departmentFilter = String(
        scheduleCurrentView() === "PERSON"
          ? (
              val("scheduleDepartment")
              || ""
            )
          : (
              val("scheduleDepartment")
              || val("scheduleTeamFocus")
              || ""
            )
      ).trim();
      const operationalTeamFilterV61526 = String(val("scheduleOperationalTeamV61526") || '').trim();
      const departmentOrgIdV616M = selectedOrgIdV616M("scheduleDepartment");

      return (rows || []).filter(row => {
        const pattern = scheduleRowPattern(row);
        if (filter && pattern !== filter) return false;
        if (
          departmentFilter
          && !departmentOrgIdV616M
          && scheduleUnitLabel(row) !== departmentFilter
        ) return false;
        if (operationalTeamFilterV61526) {
          const teamGroupV61526=scheduleOperationalTeamGroupV61526(row);
          if (teamGroupV61526.key !== operationalTeamFilterV61526) return false;
        }
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
    window.TimeClockScheduleConfirmation = Object.freeze({
      requiresConfirmation: scheduleRequiresManagerConfirmationV61116,
      status: scheduleChangeConfirmationStatusV61116
    });
    const SHIFT_PATTERN_META = {
      TECH_6D: { label: "6 วัน/สัปดาห์", short: "6 วัน", total: 540, net: 480, breakMinutes: 60, start: "08:30", end: "17:30" },
      TECH_5D: { label: "5 วัน/สัปดาห์", short: "5 วัน", total: 570, net: 510, breakMinutes: 60, start: "08:30", end: "18:00" }
    };

    function shiftPatternCodes(shift) {
      const code = String(shift?.shift_code || "").trim().toUpperCase();

      // V6.13.5: Core operational shift pairs are stable business mappings.
      // Do not let a stale applicable_pattern_codes value hide the paired night
      // shift from the assignment popup. Times may be edited later in Shift Master
      // without changing which weekly work pattern the shift belongs to.
      if (["STD","S134"].includes(code)) return ["TECH_5D"];
      if (["S043","S135"].includes(code)) return ["TECH_6D"];

      const raw = Array.isArray(shift?.applicable_pattern_codes)
        ? shift.applicable_pattern_codes
        : [];
      const values = raw.map(x => String(x || "").trim().toUpperCase()).filter(Boolean);
      return values.length ? values : ["TECH_5D","TECH_6D"];
    }

    window.tcShiftPatternCodesV6131 = shiftPatternCodes;

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
      const windowMinutes = shiftDurationMinutes(val("smStart"), val("smEnd"));
      if (!workday) {
        const start = val("smStart") || "--:--";
        const end = val("smEnd") || "--:--";
        target.innerHTML = `
          <article class="neutral"><span>ช่วงกะวันหยุด</span><strong>${safe(start)}–${safe(end)}</strong><small>ต้องตรงกับกะทำงานที่จับคู่</small></article>
          <article class="neutral"><span>ระยะช่วงวันหยุด</span><strong>${windowMinutes ? minutesToHours(windowMinutes) : "-"}</strong><small>ไม่นำไปคิดชั่วโมงทำงาน</small></article>
          <article class="neutral"><span>ผลตรวจรูปแบบ</span><strong>${start !== "--:--" && end !== "--:--" ? "พร้อมบันทึกเวลา OFF" : "กรุณาระบุเวลา"}</strong><small>เช่น OS135 ต้องเป็น 19:30–04:30</small></article>`;
        if ($("smDefault6")) { $("smDefault6").disabled = true; $("smDefault6").checked = false; }
        if ($("smDefault5")) { $("smDefault5").disabled = true; $("smDefault5").checked = false; }
        return;
      }
      const total = windowMinutes;
      const breakMinutes = Math.max(0, Number(val("smBreak") || 0));
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

      if (!await window.tcConfirm(
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

    function isNightShiftV61110(shift) {
      return Boolean(
        shift?.is_night_shift === true
        || window.tcIsNightShiftCode(
          shift?.shift_code
        )
        || String(
          shift?.shift_name
          || ""
        ).toLowerCase().includes("กลางคืน")
        || String(
          shift?.shift_name
          || ""
        ).toLowerCase().includes("กะดึก")
      );
    }

    function fillShiftSelect(
      patternCode = null,
      selectedValue = null,
      templateCode = null
    ) {
      const select = $("assignShiftCode");
      if (!select) return;

      const old =
        selectedValue
        || select.value;

      const activeTemplate =
        String(
          templateCode
          || $("assignWorkTemplate")
            ?.dataset
            ?.employeeDefaultTemplate
          || $("assignWorkTemplate")
            ?.value
          || ""
        )
          .trim()
          .toUpperCase();

      const splitCustomer =
        activeTemplate ===
        "SPLIT_FLEX";

      const active = state.filters.shifts.filter(s => {
        if (s.is_active === false) return false;

        // V6.12.6: the field is explicitly a WORK-SHIFT selector. Day-off
        // shifts (OSTD/OS043/OS134/OS135/other is_workday=false rows) are
        // resolved only by the Day-off mode and must never appear here.
        const codeV6125 = window.tcShiftCode(s.shift_code);
        if (s.is_workday === false || ['OFF','HOL','LV'].includes(codeV6125)) return false;

        const generatedV6120 = String(s.note || '').includes('[SYSTEM_GENERATED_V6120]');
        if (generatedV6120 && codeV6125 !== window.tcShiftCode(old)) return false;

        if(
          splitCustomer
          && isNightShiftV61110(s)
        ) {
          return false;
        }

        if (!patternCode) return true;
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
      const rows = (state.filters.shifts || []).filter(s => {
        if (String(s.note || '').includes('[SYSTEM_GENERATED_V6120]')) return false;
        return !filterPattern || shiftPatternCodes(s).includes(filterPattern);
      });
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
        await loadScopedAreaDepartmentOptionsV616K({
          startId:"dashStart",endId:"dashEnd",areaId:"dashZone",departmentId:"dashDepartment",preserve:true
        });
        const orgIdV616M = selectedOrgIdV616M("dashDepartment");
        const legacyDepartmentV616M = selectedLegacyDepartmentV616M("dashDepartment");
        const argsV616M = {
          p_start_date: val("dashStart"),p_end_date: val("dashEnd"),
          p_zone: val("dashZone") || null,
          p_department: orgIdV616M ? null : legacyDepartmentV616M,
          p_org_id: orgIdV616M
        };
        let response = await state.client.rpc("ta_get_dashboard_overview_v616m", argsV616M);
        const args = {
          p_start_date:argsV616M.p_start_date,p_end_date:argsV616M.p_end_date,
          p_zone:argsV616M.p_zone,p_department:legacyDepartmentV616M
        };
        if (response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
          if (orgIdV616M) throw new Error("ORG_SCOPE_SOURCE_OF_TRUTH_RPC_REQUIRED: กรุณารัน SQL FIX16O");
          response = await state.client.rpc("ta_get_dashboard_overview_v61463", args);
        }
        if (response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
          response = await state.client.rpc("ta_get_dashboard_overview_v650", args);
        }
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
        ["ลงเวลาครบคู่", d.complete_time_rows, "มีเวลาเข้าและออก", "✓", "green"],
        ["ขาดงาน", d.absent_rows ?? 0, "เวลาไม่ครบ หรือสาย ≥ 30 นาที", "×", "red"],
        ["มาสาย", d.late_rows ?? 0, "เข้าหลังเริ่มกะ 1–29 นาที", "!", "orange"],
        ["กลับก่อน", d.early_leave_rows ?? 0, "ออกก่อนเวลาสิ้นสุดกะ", "↙", "orange"]
      ];
      $("dashboardKpis").innerHTML = cards.map(c => `<div class="panel kpi-card ${c[4]}"><div class="kpi-label">${safe(c[0])}</div><div class="kpi-value">${formatNumber(c[1])}</div><div class="kpi-sub">${safe(c[2])}</div><div class="kpi-icon">${c[3]}</div></div>`).join("");

      const secondary = [
        ["เวลาไม่ครบ", Number(d.missing_in_rows||0)+Number(d.missing_out_rows||0), "รายการ", "…", "neutral"],
        ["ชั่วโมงสุทธิ", Number(d.paid_work_hours||0), "ชม.", "◷", "blue"],
        ["ชั่วโมงปกติ", Number(d.regular_hours||0), "ชม.", "◉", "green"],
        ["OT", Number(d.overtime_hours||0), "ชม.", "＋", "orange"],
        ["ช่วงรอคอย", Number(d.waiting_hours||0), "ชม.", "⌛", "neutral"],
        ["ทำงานวันหยุด", Number(d.offday_work_hours||0), "ชม.", "◆", "blue"],
        ["วันหยุดชดเชย", Number(d.comp_off_earned_rows||0), "วัน", "↺", "green"]
      ];
      const opsHost = $("dashboardOpsMetricsV616H");
      if (opsHost) opsHost.innerHTML = secondary.map(x => `<article class="dashboard-ops-card-v616h ${x[4]}"><span class="dashboard-ops-icon-v616h">${x[3]}</span><div><small>${safe(x[0])}</small><strong>${formatNumber(x[1])}<em>${x[2]}</em></strong></div></article>`).join("");

      const bars = [
        ["ขาดงาน", d.absent_rows, "red"],
        ["มาสาย 1–29 นาที", d.late_rows, "orange"],
        ["กลับก่อน", d.early_leave_rows, "orange"],
        ["ทำงานในวันหยุด", d.worked_on_offday_rows, "blue"]
      ];
      const max = Math.max(1, ...bars.map(x => Number(x[1]||0)));
      $("dashboardBars").innerHTML = bars.map(x => `<div class="status-row"><span>${safe(x[0])}</span><div class="bar-track"><div class="bar-fill ${x[2]}" style="width:${Math.max(2, Number(x[1]||0)/max*100)}%"></div></div><strong class="text-right">${formatNumber(x[1])}</strong></div>`).join("");
      $("dashboardQuick").innerHTML = [
        ["ขาดงาน", d.absent_rows, "attendance"],
        ["มาสาย 1–29 นาที", d.late_rows, "attendance"],
        ["กลับก่อน", d.early_leave_rows, "attendance"],
        ["กะที่หัวหน้างานบันทึก", d.confirmed_rows, "schedule"]
      ].map(x => `<button class="quick-item" data-go-page="${x[2]}"><div><strong>${safe(x[0])}</strong><span> คลิกเพื่อดูรายละเอียด</span></div><span class="badge badge-blue">${formatNumber(x[1])}</span></button>`).join("");
      document.dispatchEvent(new CustomEvent('timeclock:dashboard-rendered-v616h', { detail: { dashboard: d } }));
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
      const orgIdV616M = selectedOrgIdV616M("attDepartment");
      const legacyDepartmentV616M = selectedLegacyDepartmentV616M("attDepartment");
      const newArgs = {
        p_start_date:range.start,
        p_end_date:range.end,
        p_area:val("attZone") || null,
        p_sub_area:val("attSubArea") || null,
        p_department:orgIdV616M ? null : legacyDepartmentV616M,
        p_org_id:orgIdV616M,
        p_emp_codes:requestEmployeeCodes,
        p_attendance_statuses:null,
        p_schedule_statuses:null,
        p_limit:5000
      };

      const attendanceCacheKeyV61463 = depth === 0
        ? attendanceReadCacheKeyV61463(range, requestEmployeeCodes)
        : null;
      if (attendanceCacheKeyV61463) {
        const cached = attendanceReadCacheV61463.get(attendanceCacheKeyV61463);
        if (cached && Date.now() - Number(cached.savedAt || 0) <= ATTENDANCE_READ_CACHE_TTL_V61463) {
          return attendanceCloneRowsV61463(cached.rows);
        }
      }

      let response =
        await state.client.rpc(
          "ta_get_attendance_detail_v616m",
          newArgs
        );

      let source =
        "V6.15.29 FIX16M";

      let serverStatusFilter =
        false;

      let serverSubAreaFilter =
        true;

      if(
        response.error
        && window.TimeClockShiftAPI
          ?.missingFunction?.(
            response.error
          )
      ) {
        if (orgIdV616M) {
          throw new Error("ORG_SCOPE_SOURCE_OF_TRUTH_RPC_REQUIRED: กรุณารัน SQL FIX16O");
        }
        const legacyArgs = {
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
            legacyDepartmentV616M,

          p_emp_codes:
            requestEmployeeCodes,

          p_attendance_statuses:
            null,

          p_schedule_statuses:
            null,

          p_limit:
            5000
        };

        response =
          await state.client.rpc(
            "ta_get_attendance_detail_v61463",
            legacyArgs
          );

        source =
          "V6.14.63";

        serverSubAreaFilter =
          true;
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
            "ta_get_attendance_detail_v664",
            {
              p_start_date:range.start,p_end_date:range.end,
              p_zone:val("attZone") || null,
              p_department:legacyDepartmentV616M,
              p_emp_codes:requestEmployeeCodes,
              p_attendance_statuses:null,p_schedule_statuses:null,p_limit:5000
            }
          );

        source =
          "V6.6.4";

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
            "ta_get_attendance_detail_v640",
            {
              p_start_date:range.start,p_end_date:range.end,
              p_zone:val("attZone") || null,
              p_department:legacyDepartmentV616M,
              p_emp_codes:requestEmployeeCodes,
              p_attendance_statuses:null,p_schedule_statuses:null,p_limit:5000
            }
          );

        source = "V6.4.0";
        serverStatusFilter = false;
        serverSubAreaFilter = false;
      }

      if(response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
        response = await state.client.rpc(
          "ta_get_attendance_detail_v619",
          {
            p_start_date:range.start,p_end_date:range.end,
            p_area:val("attZone") || null,p_sub_area:val("attSubArea") || null,
            p_department:legacyDepartmentV616M,p_emp_codes:requestEmployeeCodes,
            p_attendance_statuses:null,p_schedule_statuses:null,p_limit:5000
          }
        );
        source = "V6.1.9";
        serverStatusFilter = false;
        serverSubAreaFilter = true;
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

      // V6.11.20: status filtering is intentionally deferred until after
      // punch-meta enrichment. This prevents stale backend ABSENCE values from
      // excluding rows that actually have complete IN/OUT punches.

      if (attendanceCacheKeyV61463) {
        attendanceReadCacheV61463.set(attendanceCacheKeyV61463, {
          savedAt: Date.now(),
          rows: attendanceCloneRowsV61463(rows)
        });
        if (attendanceReadCacheV61463.size > 48) {
          const oldestKey = attendanceReadCacheV61463.keys().next().value;
          if (oldestKey) attendanceReadCacheV61463.delete(oldestKey);
        }
      }

      return rows;
    }

    function attendanceScheduleTimestampV61462(workDate, timeValue, nextDay = false) {
      const dateText = String(workDate || '').slice(0,10);
      const timeText = String(timeValue || '').slice(0,5);
      if (!dateText || !/^\d{2}:\d{2}$/.test(timeText)) return null;
      let date = new Date(`${dateText}T00:00:00`);
      if (nextDay) date.setDate(date.getDate() + 1);
      const yyyy = date.getFullYear();
      const mm = String(date.getMonth()+1).padStart(2,'0');
      const dd = String(date.getDate()).padStart(2,'0');
      return `${yyyy}-${mm}-${dd}T${timeText}:00`;
    }

    function attendanceScheduleSkeletonRowV61462(row) {
      const result = { ...(row || {}) };
      const workDate = String(result.work_date || '').slice(0,10);
      const windowMeta = scheduleEffectiveShiftWindowV6133(result);
      const startTime = windowMeta?.start || result.shift_start_time || null;
      const endTime = windowMeta?.end || result.shift_end_time || null;
      const startMinutes = attendanceClockMinutes(startTime);
      const endMinutes = attendanceClockMinutes(endTime);
      const code = window.tcShiftCode(
        result.assigned_shift_code || result.effective_shift_code || result.auto_shift_code || result.shift_code || ''
      );
      const master = (state.filters.shifts || []).find(
        shift => window.tcShiftCode(shift?.shift_code) === code
      ) || null;
      const nonWorking = scheduleIsNonWorkingShiftV61447(code, master);
      const crossesMidnight = !nonWorking && startMinutes != null && endMinutes != null && endMinutes <= startMinutes;

      result.work_date = workDate;
      result.shift_code = result.shift_code || result.effective_shift_code || result.assigned_shift_code || result.auto_shift_code || null;
      result.template_code = result.template_code || result.daily_work_template_code || result.effective_work_template_code || result.employee_default_template_code || null;
      const rawDayType = result.calculation_day_type || result.day_type || '';
      const leaveDay = code === 'LV' || Boolean(result.leave_request_id || result.leave_type_code || result.is_full_day_leave) || String(result.day_override_type || '').toUpperCase() === 'LEAVE';
      result.day_type = leaveDay ? 'LEAVE' : (rawDayType || (result.is_public_holiday ? 'PUBLIC_HOLIDAY' : result.is_weekly_off ? 'WEEKLY_OFF' : 'WORKDAY'));
      result.shift_1_planned_start_at = result.shift_1_planned_start_at || attendanceScheduleTimestampV61462(workDate, startTime, false);
      result.shift_1_planned_end_at = result.shift_1_planned_end_at || attendanceScheduleTimestampV61462(workDate, endTime, crossesMidnight);
      result._attendance_calendar_row_v61462 = true;
      result._attendance_has_persisted_row_v61462 = false;
      return result;
    }

    async function fetchAttendanceCalendarRowsV61462(requestEmployeeCodes, persistedRows = []) {
      if (!window.TimeClockShiftAPI?.getMonthlySchedule) return [];
      const startDate = val('attStart');
      const endDate = val('attEnd');
      if (!startDate || !endDate) return [];
      const month = `${String(startDate).slice(0,7)}-01`;
      const startObj = attendanceParseDate(startDate);
      const endObj = attendanceParseDate(endDate);
      const dayCount = startObj && endObj ? Math.max(1, Math.floor((endObj-startObj)/86400000)+1) : 31;
      const maxEmployeeCount = Math.max(1, Math.floor(5000/dayCount));
      const persistedCodes = [...new Set((persistedRows || []).map(row=>String(row?.emp_code||'').trim()).filter(Boolean))];
      // FIX16J: Full-calendar fallback must not depend only on persisted
      // attendance rows. If there are no persisted rows yet, use the employee
      // options already resolved from the current Manager/User Scope so the
      // schedule calendar can still produce rows for workdays, OFF, leave and
      // no-punch dates.
      const optionCodesV616J = [...new Set(
        (attendanceEmployeeFilter.options || [])
          .map(employee => String(employee?.emp_code || '').trim())
          .filter(Boolean)
      )];
      let calendarEmpCodes = Array.isArray(requestEmployeeCodes) && requestEmployeeCodes.length
        ? [...new Set(requestEmployeeCodes.map(code=>String(code||'').trim()).filter(Boolean))]
        : (optionCodesV616J.length ? optionCodesV616J : persistedCodes);
      if (calendarEmpCodes.length > maxEmployeeCount) {
        state.attendanceCalendarScopeLimitedV61462 = true;
        calendarEmpCodes = calendarEmpCodes.slice(0,maxEmployeeCount);
      } else {
        state.attendanceCalendarScopeLimitedV61462 = false;
      }
      if (!calendarEmpCodes.length) return [];
      try {
        const rows = await window.TimeClockShiftAPI.getMonthlySchedule(
          window.TimeClockApp || { state },
          {
            p_month: month,
            p_start_date: startDate,
            p_end_date: endDate,
            p_zone: val('attZone') || null,
            p_department: val('attDepartment') || null,
            p_emp_codes: calendarEmpCodes,
            p_schedule_statuses: null
          }
        );
        const calendarRows = (rows || []).map(row => ({ ...row }));
        const period = { startDate, endDate, month: String(startDate).slice(0,7), viewMode:'ATTENDANCE', personDisplayMode:'MONTH' };
        await Promise.all([
          enrichScheduleWorkPlanMetaV6118(period, calendarRows),
          window.TimeClockSchedulingRulesV6120?.enrichScheduleRows?.(calendarRows)
        ]);
        const subArea = val('attSubArea');
        return calendarRows
          .filter(row => !subArea || String(row.sub_area || '') === String(subArea))
          .map(attendanceScheduleSkeletonRowV61462);
      } catch (error) {
        console.warn('Attendance full-calendar V6.14.63 fallback to persisted rows:', error);
        return [];
      }
    }

    function mergeAttendanceCalendarRowsV61462(calendarRows, attendanceRows) {
      const merged = new Map();
      (calendarRows || []).forEach((row,index) => {
        const key = `${String(row.emp_code || '')}|${String(row.work_date || '').slice(0,10)}`;
        if (key !== '|') merged.set(key, { ...row });
        else merged.set(`__calendar_${index}`, { ...row });
      });
      (attendanceRows || []).forEach((row,index) => {
        const key = `${String(row.emp_code || '')}|${String(row.work_date || '').slice(0,10)}`;
        const base = merged.get(key) || {};
        merged.set(key || `__attendance_${index}`, {
          ...base,
          ...row,
          full_name: row.full_name || base.full_name || '',
          department: row.department || base.department || '',
          zone: row.zone || row.area || base.zone || base.area || '',
          area: row.area || row.zone || base.area || base.zone || '',
          sub_area: row.sub_area || base.sub_area || '',
          pattern_code: row.pattern_code || base.pattern_code || base.resolved_pattern_code || '',
          template_code: row.template_code || base.template_code || base.daily_work_template_code || base.effective_work_template_code || '',
          _attendance_calendar_row_v61462: Boolean(base._attendance_calendar_row_v61462),
          _attendance_has_persisted_row_v61462: true
        });
      });
      return [...merged.values()].sort((a,b) =>
        String(b.work_date || '').localeCompare(String(a.work_date || '')) ||
        String(a.emp_code || '').localeCompare(String(b.emp_code || ''), 'th', {numeric:true})
      );
    }

    async function enrichRowsTeamContextV616T(rows,startDate,endDate,fallbackDate=null) {
      const list=Array.isArray(rows)?rows:[];
      const empCodes=[...new Set(list.map(r=>String(r?.emp_code||'').trim()).filter(Boolean))];
      if(!list.length||!empCodes.length||!state.client||!startDate||!endDate)return list;
      try{
        const all=[];
        for(let i=0;i<empCodes.length;i+=250){
          const args={p_emp_codes:empCodes.slice(i,i+250),p_start_date:startDate,p_end_date:endDate};
          let response=await state.client.rpc('ta_get_schedule_working_team_context_v61529f14b',args);
          if(response.error&&missingFunction(response.error))response=await state.client.rpc('ta_get_schedule_team_context_v61526',args);
          if(response.error)throw response.error;
          all.push(...(Array.isArray(response.data)?response.data:[]));
        }
        const map=new Map(all.map(x=>[`${String(x.emp_code||'').trim()}|${String(x.work_date||'').slice(0,10)}`,x]));
        list.forEach(row=>{
          const d=String(row?.work_date||fallbackDate||startDate).slice(0,10);
          row._team_context_v61526=map.get(`${String(row?.emp_code||'').trim()}|${d}`)||null;
        });
      }catch(error){console.warn('Team Context FIX16T:',error);}
      return list;
    }

    function teamOptionsFromRowsV616T(rows){
      const groups=new Map();
      (rows||[]).forEach(row=>{
        const g=scheduleOperationalTeamGroupV61526(row);
        if(g.legacy)return;
        if(!groups.has(g.key))groups.set(g.key,g);
      });
      return [...groups.values()].sort((a,b)=>{
        const aw=['TEAM','BORROW_CROSS_ORG','TEMP_TEAM_ASSIST'].includes(a.state)?1:9;
        const bw=['TEAM','BORROW_CROSS_ORG','TEMP_TEAM_ASSIST'].includes(b.state)?1:9;
        return aw-bw||a.label.localeCompare(b.label,'th',{numeric:true,sensitivity:'base'});
      });
    }

    function fillAttendanceTeamOptionsV616T(rows){
      const select=$('attTeamV616T');if(!select)return;
      const current=String(select.value||'');
      const groups=teamOptionsFromRowsV616T(rows);
      select.innerHTML='<option value="">ทุกทีม</option>'+groups.map(g=>`<option value="${safe(g.key)}">${safe(g.label)}</option>`).join('');
      if(groups.some(g=>g.key===current))select.value=current;else select.value='';
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

        // FIX16J: Resolve the employee scope before running the attendance
        // search. The dropdown previously loaded lazily, so pressing Search
        // without opening it could leave the loader with no employee scope for
        // the calendar fallback. The options RPC is cached by date/org filters.
        const employeeOptionKeyV616J = attendanceEmployeeFilterKey();
        if (
          attendanceEmployeeFilter.loadedKey !== employeeOptionKeyV616J
          || !attendanceEmployeeFilter.options.length
        ) {
          await loadAttendanceEmployeeOptions(true);
        }

        const requestEmployeeCodes =
          attendanceEmployeeCodesForLoadV616J();

        const ranges =
          attendanceChunkRanges(
            val("attStart"),
            val("attEnd"),
            14
          );

        const collected = [];

        // V6.14.63: at most two historical chunks in flight. This cuts month
        // navigation latency without opening the high-concurrency burst that used
        // to overload PostgREST / PostgreSQL.
        for (let index = 0; index < ranges.length; index += 2) {
          if (requestId !== attendanceLoadRequestId) return;
          const group = ranges.slice(index, index + 2);
          const groupRows = await Promise.all(
            group.map(range => fetchAttendanceChunk(range, requestEmployeeCodes, statuses))
          );
          if (requestId !== attendanceLoadRequestId) return;
          groupRows.forEach(rows => collected.push(...rows));
          if (collected.length >= 5000) break;
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

        const persistedAttendanceRows = [...unique.values()];
        const calendarRowsV61462 = await fetchAttendanceCalendarRowsV61462(
          requestEmployeeCodes,
          persistedAttendanceRows
        );
        const mergedAttendanceRowsV61462 = mergeAttendanceCalendarRowsV61462(
          calendarRowsV61462,
          persistedAttendanceRows
        );
        state.attendanceFullCalendarLimitedV61462 =
          Boolean(state.attendanceCalendarScopeLimitedV61462)
          || mergedAttendanceRowsV61462.length > 5000
          || collected.length >= 5000;
        state.attendance = mergedAttendanceRowsV61462.slice(0,5000);

        await enrichRowsTeamContextV616T(state.attendance,val("attStart"),val("attEnd"));
        fillAttendanceTeamOptionsV616T(state.attendance);
        const attendanceTeamFilterV616T=String(val("attTeamV616T")||'').trim();
        if(attendanceTeamFilterV616T){
          state.attendance=state.attendance.filter(row=>scheduleOperationalTeamGroupV61526(row).key===attendanceTeamFilterV616T);
        }

        await enrichAttendanceWorkSegmentsV6118(
          state.attendance,
          val("attStart"),
          val("attEnd")
        );

        state.attendance.forEach(
          normalizeAttendanceStatusFromPunchesV61120
        );

        if (val("attStatus")) {
          const wantedStatus = String(val("attStatus") || '').toUpperCase();
          state.attendance = state.attendance.filter(row => {
            const flags = attendancePolicyFlagsV61428(row);
            if (wantedStatus === 'ABSENCE') return flags.absence;
            if (wantedStatus === 'LATE') return flags.late;
            if (wantedStatus === 'EARLY_LEAVE') return flags.early;
            if (wantedStatus === 'LATE_AND_EARLY_LEAVE') return flags.late && flags.early;
            return flags.primaryStatus === wantedStatus;
          });
        }

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
                  Boolean(state.attendanceFullCalendarLimitedV61462)
                  || state.attendance.length >= 5000
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
          <td data-att-col="department"><span>${safe(r.department)}</span>${scheduleTeamContextMetaV61526(r)?`<small class="attendance-team-mini-v616t">${safe(scheduleOperationalTeamGroupV61526(r).label)}</small>`:""}</td>
          <td data-att-col="zone" class="${optionalClass("zone").trim()}">${safe(r.zone || r.area)}</td>
          <td data-att-col="sub_area" class="${optionalClass("sub_area").trim()}">${safe(r.sub_area)}</td>
          <td data-att-col="pattern_code">${badge(r.pattern_code||"-","badge-blue")}</td>
          <td data-att-col="template_code" class="${optionalClass("template_code").trim()}">${safe(workTemplateLabelV6118(r.template_code))}</td>
          <td data-att-col="day_type">${safe(attendanceLabel(r.day_type||"-"))}</td>
          <td data-att-col="shift_code">${badge(code, shiftBadgeClass(code))}</td>
          <td class="attendance-punch-cell-v6119 attendance-plan-cell-v61110 shift-1" data-att-col="shift_1_start">${attendancePlannedCellV61110(r.shift_1_planned_start_at,1,"START",r)}</td>
          <td class="attendance-punch-cell-v6119 attendance-plan-cell-v61110 shift-1" data-att-col="shift_1_end">${attendancePlannedCellV61110(r.shift_1_planned_end_at,1,"END",r)}</td>
          <td class="attendance-punch-cell-v6119 shift-1" data-att-col="shift_1_in">${attendancePunchCellV6119(r.shift_1_actual_in_at,1,"IN")}</td>
          <td class="attendance-punch-cell-v6119 shift-1" data-att-col="shift_1_out">${attendancePunchCellV6119(r.shift_1_actual_out_at,1,"OUT")}</td>
          <td class="attendance-punch-cell-v6119 attendance-plan-cell-v61110 shift-2" data-att-col="shift_2_start">${attendancePlannedCellV61110(r.shift_2_planned_start_at,2,"START",r)}</td>
          <td class="attendance-punch-cell-v6119 attendance-plan-cell-v61110 shift-2" data-att-col="shift_2_end">${attendancePlannedCellV61110(r.shift_2_planned_end_at,2,"END",r)}</td>
          <td class="attendance-punch-cell-v6119 shift-2" data-att-col="shift_2_in">${attendancePunchCellV6119(r.shift_2_actual_in_at,2,"IN")}</td>
          <td class="attendance-punch-cell-v6119 shift-2" data-att-col="shift_2_out">${attendancePunchCellV6119(r.shift_2_actual_out_at,2,"OUT")}</td>
          <td data-att-col="display_status">${badge(attendanceDisplayLabel(r), statusBadgeClass(displayStatus))}</td>
          <td data-att-col="net_work_minutes" class="text-right">${attendanceMinutesToHourMinuteV61457(r.net_work_minutes)}</td>
          <td data-att-col="regular_minutes" class="text-right">${attendanceMinutesToHourMinuteV61457(r.regular_minutes)}</td>
          <td data-att-col="overtime_minutes" class="text-right${optionalClass("overtime_minutes")}">${attendanceMinutesToHourMinuteV61457(r.overtime_minutes)}</td>
          <td data-att-col="waiting_minutes" class="text-right${optionalClass("waiting_minutes")}">${attendanceMinutesToHourMinuteV61457(r.waiting_minutes)}</td>
          <td data-att-col="break_deducted_minutes" class="text-right${optionalClass("break_deducted_minutes")}">${minutesToHours(r.break_deducted_minutes)}</td>
          <td data-att-col="late_minutes" class="text-right${optionalClass("late_minutes")}">${formatNumber(attendanceLateMinutesForDisplayV61456(r))}</td>
          <td data-att-col="early_leave_minutes" class="text-right${optionalClass("early_leave_minutes")}">${formatNumber(r.early_leave_minutes)}</td>
          <td data-att-col="absence_minutes" class="text-right${optionalClass("absence_minutes")}">${formatNumber(attendanceAbsenceMinutes(r))}</td>
          <td data-att-col="comp_off_balance" class="text-right${optionalClass("comp_off_balance")}">${r.comp_off_earned?"ได้รับ":""}${r.comp_off_balance!=null?` ${formatNumber(r.comp_off_balance)}`:"-"}</td>
        </tr>`;
      }).join("") : emptyRow(28);
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

    // V6.12.6: filter options (scope employee list / zone / department)
    // do not change when a shift cell is saved. A short cache avoids repeating
    // the same expensive RPC during save -> reload and zone-change -> reload.
    const scheduleFilterOptionsCacheV6125 = new Map();
    const SCHEDULE_FILTER_CACHE_TTL_V6125 = 30000;

    // FIX15O: server-side options are Working-Org aware. Borrow destination
    // visibility must not leak the employee's Home Department/Zone into filters.
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

      const cacheKeyV6125 = [
        String(period.startDate || ''),
        String(period.endDate || ''),
        oldZone
      ].join('|');
      const cachedV6125 = scheduleFilterOptionsCacheV6125.get(cacheKeyV6125);
      let result;

      if (cachedV6125 && Date.now() - cachedV6125.loadedAt < SCHEDULE_FILTER_CACHE_TTL_V6125) {
        result = cachedV6125.data || {};
      } else {
        const { data, error } =
          await state.client.rpc(
            "ta_get_schedule_filter_options_v61026",
            {
              p_start_date: period.startDate,
              p_end_date: period.endDate,
              p_zone: oldZone || null,
              p_department: null
            }
          );

        if(error) {
          throw error;
        }

        result = data || {};
        scheduleFilterOptionsCacheV6125.set(cacheKeyV6125, {
          loadedAt: Date.now(),
          data: result
        });
      }

      const orgContractV616L = await loadAuthorizedOrgContractV616L(
        period.startDate,
        period.endDate
      );
      const zones = scopedLocationValuesV616L(
        Array.isArray(result.zones) ? result.zones : [],
        orgContractV616L,
        ["zone","area"]
      );
      const zoneStillValid =
        !oldZone
        || zones.some(
          value =>
            String(value) ===
            oldZone
        );

      // Scope can change while a previously selected Zone remains in the UI.
      // If that Zone is no longer authorized, refetch once without it so the
      // employee list and Organization choices do not stay falsely empty.
      if (oldZone && !zoneStillValid) {
        setVal("scheduleZone","");
        return await loadScheduleFilterOptions(period,"");
      }

      const departmentOptionsV616L = scopedDepartmentOptionsV616L(
        Array.isArray(result.departments) ? result.departments : [],
        orgContractV616L,
        {zone:oldZone}
      );
      const departments = departmentOptionsV616L.map(option => option.value);

      fillSelect(
        "scheduleZone",
        zones,
        "ทุกพื้นที่"
      );

      setVal(
        "scheduleZone",
        oldZone
      );

      fillScopedDepartmentSelectV616L(
        "scheduleDepartment",
        departmentOptionsV616L,
        "ทุกหน่วยงานใน Scope"
      );

      let preservedDepartmentV616M = departmentOptionPreservedValueV616M(
        oldDepartment,departmentOptionsV616L
      );
      if (!preservedDepartmentV616M && departmentOptionsV616L.length === 1) {
        preservedDepartmentV616M = String(departmentOptionsV616L[0]?.value || '').trim();
      }
      setVal("scheduleDepartment",preservedDepartmentV616M);

      // FIX16O: Schedule employee options come directly from Organization
      // Scope Source of Truth. Never start from the legacy filter employee list
      // because an empty/older Scope interpretation there would erase valid rows.
      const selectedOrgIdV616MValue = selectedOrgIdV616M("scheduleDepartment");
      if (orgContractV616L?.strict) {
        const scopeEmployeesV616O = await loadScopeEmployeeOptionsV616O(
          selectedOrgIdV616MValue,period.startDate,period.endDate
        );
        result = {
          ...result,
          employees: scopeEmployeesV616O
        };
      } else if (Array.isArray(result.employees)) {
        const orgCodesV616M = new Set(await loadOrgEmployeeCodesV616M(
          selectedOrgIdV616MValue,period.startDate,period.endDate
        ));
        result = {
          ...result,
          employees: result.employees.filter(employee =>
            orgCodesV616M.has(String(employee?.emp_code || employee?.EmployeeId || '').trim())
          )
        };
      }

      return result;
    }

    const scheduleRpcHealthV6126 = window.TimeClockScheduleRpcHealthV6126 ||= {
      workPlanMetaFailed: false,
      dailyPlanFailed: false,
      orgDetailDisabled: false,
      logged: new Set()
    };

    function scheduleRpcErrorSummaryV6126(error) {
      return {
        code: error?.code || '',
        message: error?.message || String(error || ''),
        details: error?.details || '',
        hint: error?.hint || ''
      };
    }

    function scheduleLogRpcOnceV6126(key, label, error) {
      if (scheduleRpcHealthV6126.logged.has(key)) return;
      scheduleRpcHealthV6126.logged.add(key);
      console.warn(label, scheduleRpcErrorSummaryV6126(error));
    }

    async function enrichScheduleWorkPlanMetaV6118(
      period,
      rows
    ) {
      if(
        !state.client
        || !Array.isArray(rows)
        || !rows.length
      ) {
        return rows;
      }

      const empCodes =
        [...new Set(
          rows
            .map(
              row =>
                String(
                  row.emp_code
                  || ""
                ).trim()
            )
            .filter(Boolean)
        )];

      // V6.11.52:
      // Work-plan metadata is also Employee x Day. Loading a whole month for
      // all employees in one RPC can hit the 1,000-row response limit and make
      // SPLIT_FLEX/customer-window metadata disappear for some employees.
      const metaRows = [];
      // V6.12.1 performance:
      // 30 employees x 31 days <= 930 rows/request, still below the 1,000-row
      // response ceiling. Run a few batches concurrently instead of waiting
      // for every employee batch serially.
      const batchSize = 28;
      const batches = [];
      for (let offset = 0; offset < empCodes.length; offset += batchSize) {
        batches.push(empCodes.slice(offset, offset + batchSize));
      }

      if (scheduleRpcHealthV6126.workPlanMetaFailed || !batches.length) {
        return rows;
      }

      const callMetaBatchV6126 = batch => state.client.rpc(
        "ta_get_schedule_work_plan_meta_v6126",
        {
          p_start_date: period.startDate,
          p_end_date: period.endDate,
          p_emp_codes: batch
        }
      );

      // Probe one batch first to prevent a burst of identical 400 responses.
      const firstResponse = await callMetaBatchV6126(batches[0]);
      if (firstResponse?.error) {
        scheduleRpcHealthV6126.workPlanMetaFailed = true;
        scheduleLogRpcOnceV6126(
          'work-plan-meta',
          'Schedule work-plan metadata V6.12.6 disabled for this session:',
          firstResponse.error
        );
        return rows;
      }
      metaRows.push(...(firstResponse?.data || []));

      const remaining = batches.slice(1);
      const concurrency = 3;
      for (let cursor = 0; cursor < remaining.length; cursor += concurrency) {
        const group = remaining.slice(cursor, cursor + concurrency);
        const responses = await Promise.all(group.map(callMetaBatchV6126));
        for (const response of responses) {
          const { data, error } = response || {};
          if (error) {
            scheduleRpcHealthV6126.workPlanMetaFailed = true;
            scheduleLogRpcOnceV6126(
              'work-plan-meta',
              'Schedule work-plan metadata V6.12.6 disabled for this session:',
              error
            );
            return rows;
          }
          metaRows.push(...(data || []));
        }
      }

      const metaMap =
        new Map(
          metaRows.map(
            meta => [
              `${String(meta.emp_code)}|${String(meta.work_date).slice(0,10)}`,
              meta
            ]
          )
        );

      rows.forEach(
        row => {
          const key =
            `${String(row.emp_code)}|${String(row.work_date).slice(0,10)}`;

          const meta =
            metaMap.get(
              key
            );

          if(meta) {
            Object.assign(
              row,
              meta
            );
          }
        }
      );

      return rows;
    }

    function scheduleWorkTemplateCodeV6118(row) {
      return String(
        row?.daily_work_template_code
        || row?.effective_work_template_code
        || row?.template_code
        || row?.employee_default_template_code
        || ""
      )
        .trim()
        .toUpperCase();
    }

    function scheduleWorkTemplateLabelV6118(row) {
      const code =
        scheduleWorkTemplateCodeV6118(
          row
        );

      return code ===
        "SPLIT_FLEX"
          ? "กะปกติ + งานลูกค้าช่วงดึก"
          : code
            ? "กะปกติ"
            : "-";
    }

    function scheduleNormalizeTemplateCodeV61116(value) {
      const code = String(value || '').trim().toUpperCase();
      if (['SINGLE_0830','SINGLE_0830_1730','ST6'].includes(code)) return 'ST6';
      if (['SINGLE_0830_1800','ST5'].includes(code)) return 'ST5';
      if (code === 'EARLY_SPLIT_FLEX') return 'SPLIT_FLEX';
      return code;
    }

    function scheduleRequiresManagerConfirmationV61116(row) {
      const assignedShift = String(row?.assigned_shift_code || '').trim().toUpperCase();
      const autoShift = String(row?.auto_shift_code || '').trim().toUpperCase();
      const shiftChanged = Boolean(
        assignedShift
        && assignedShift !== autoShift
      );

      const dailyTemplate = scheduleNormalizeTemplateCodeV61116(
        row?.daily_work_template_code
      );
      const defaultTemplate = scheduleNormalizeTemplateCodeV61116(
        row?.employee_default_template_code
      );
      const templateChanged = Boolean(
        dailyTemplate
        && dailyTemplate !== defaultTemplate
      );

      const dayOverride = Boolean(
        String(row?.day_override_type || '').trim()
      );

      return shiftChanged || templateChanged || dayOverride;
    }

    function scheduleChangeConfirmationStatusV61116(row) {
      const requires = scheduleRequiresManagerConfirmationV61116(row);
      const status = String(row?.schedule_status || '').trim().toUpperCase();
      return {
        requires,
        confirmed: requires && status === 'CONFIRMED',
        pending: requires && status !== 'CONFIRMED'
      };
    }

    let scheduleLoadInFlightV61151 = false;
    let scheduleLoadQueuedV61151 = false;

    async function loadSchedule() {
      if (scheduleLoadInFlightV61151) {
        scheduleLoadQueuedV61151 = true;
        return;
      }

      scheduleLoadInFlightV61151 = true;

      const period=syncSchedulePeriodUI();
      const scheduleLoadStartedAtV6125 = (window.performance?.now?.() || Date.now());
      state.scheduleManagerEnrichTokenV6125 = Number(state.scheduleManagerEnrichTokenV6125 || 0) + 1;
      const managerEnrichTokenV6125 = state.scheduleManagerEnrichTokenV6125;
      const button=$("loadScheduleBtn");
      const idleButtonHtml='<span>↻</span> โหลดตารางกะ';

      if(button){
        button.disabled=true;
        button.setAttribute("aria-busy","true");
        button.innerHTML='<span>↻</span> กำลังโหลด...';
      }
      setScheduleLoadStatus("loading",`กำลังตรวจ User Scope และโหลดตารางกะ ${formatDate(period.startDate)}–${formatDate(period.endDate)}`);
      showLoading(`กำลังโหลดปฏิทินกะ ${formatDate(period.startDate)}–${formatDate(period.endDate)}...`);
      try{
        const filterOptions =
          await loadScheduleFilterOptions(
            period
          ) || {};

        const term=val("scheduleSearch").trim();
        const personMode=period.viewMode==="PERSON";
        const exactEmp=!personMode && /^\d{4,20}$/.test(term)?term:null;

        let data = [];

        if (personMode) {
          state.scheduleGuardBoundaryRowsV61431=[];
          const selectedDepartment =
            String(val("scheduleDepartment") || "").trim();

          // FIX14B FINAL: do not pre-filter by Employee Master department in Browser.
          // Borrowed technicians keep their Home Unit in Employee Master, while the
          // canonical Schedule RPC filters them by the effective Working Org.
          const scopeEmployees =
            (Array.isArray(filterOptions.employees)
              ? filterOptions.employees
              : []);

          const scopeEmpCodes =
            [...new Set(
              scopeEmployees
                .map(employee =>
                  String(employee?.emp_code || "").trim()
                )
                .filter(Boolean)
            )];

          // V6.11.51:
          // Do NOT page the 31-day cross-product RPC by HTTP Range.
          // The RPC is still subject to the server's max-rows behavior.
          // Instead fetch small employee batches:
          // 20 employees x 31 days <= 620 rows/request.
          // V6.12.6: 32 employees x 31 days <= 992 rows/request.
          // Load up to 5 employee batches concurrently. This changes only the
          // transport strategy; scope/filter/business rules remain unchanged.
          // V6.12.9: the grid RPC is lightweight, but keep each request small
          // and avoid a burst of concurrent PostgreSQL statements.
          // V6.14.35: fetch one hidden day on BOTH sides of the visible
          // PERSON range. The hidden rows are never rendered; they exist only
          // so the bidirectional Night Sequence guard can validate the first and
          // last visible day against the real previous/next effective schedule.
          const personGuardStartDateV61431 = addCalendarDaysISO(period.startDate,-1);
          const personGuardEndDateV61435 = addCalendarDaysISO(period.endDate,1);
          const employeeBatchSize = 28;
          const chunks = [];

          for (
            let offset = 0;
            offset < scopeEmpCodes.length;
            offset += employeeBatchSize
          ) {
            chunks.push(scopeEmpCodes.slice(offset, offset + employeeBatchSize));
          }

          if (!chunks.length) {
            data = [];
          } else {
            const collected = [];
            const concurrency = 3;
            let completed = 0;

            for (let cursor = 0; cursor < chunks.length; cursor += concurrency) {
              const group = chunks.slice(cursor, cursor + concurrency);
              setScheduleLoadStatus(
                "loading",
                `กำลังโหลดพนักงานตาม Scope • ${completed}/${chunks.length} ชุด`
              );

              const groupRows = await Promise.all(
                group.map(chunk => window.TimeClockShiftAPI.getMonthlySchedule(
                  window.TimeClockApp||{state},
                  {
                    p_month:`${period.month}-01`,
                    p_start_date:personGuardStartDateV61431,
                    p_end_date:personGuardEndDateV61435,
                    p_zone:val("scheduleZone")||null,
                    p_department:val("scheduleDepartment")||null,
                    p_emp_codes:chunk,
                    p_schedule_statuses:null,
                    p_disable_range_paging:true
                  }
                ))
              );

              groupRows.forEach(rows => collected.push(...(rows || [])));
              completed += group.length;
              setScheduleLoadStatus(
                "loading",
                `กำลังโหลดพนักงานตาม Scope • ${completed}/${chunks.length} ชุด`
              );
            }

            const unique = new Map();
            collected.forEach((row,index) => {
              const emp = String(row?.emp_code || "").trim();
              const date = String(row?.work_date || "").slice(0,10);
              const key = emp && date
                ? `${emp}|${date}`
                : `__row_${index}`;
              unique.set(key,row);
            });

            const personRowsV61431=[...unique.values()];
            state.scheduleGuardBoundaryRowsV61431=personRowsV61431.filter(row=>{const date=String(row?.work_date||'').slice(0,10);return date<period.startDate||date>period.endDate;});
            data = personRowsV61431.filter(row=>{
              const date=String(row?.work_date||'').slice(0,10);
              return date>=period.startDate&&date<=period.endDate;
            });
          }

          state.scheduleScopeEmployeesV61151 =
            scopeEmployees;
        } else {
          // V6.12.1 TEAM performance:
          // When filter options already provide the accessible employee list,
          // fetch 7-day rows by employee batches. This avoids re-running the
          // full cross-product RPC once per HTTP range page.
          const selectedDepartment = String(val("scheduleDepartment") || "").trim();
          // FIX14B FINAL: server-side Working Org filtering is authoritative.
          // Client-side Home department filtering would incorrectly hide BN5 staff
          // borrowed into BN6 before the Schedule RPC can resolve their Working Team.
          const availableScopeEmployees = (Array.isArray(filterOptions.employees)
            ? filterOptions.employees
            : []);
          const teamEmpCodes = [...new Set(
            availableScopeEmployees
              .map(employee => String(employee?.emp_code || "").trim())
              .filter(Boolean)
          )];

          if (!exactEmp && teamEmpCodes.length) {
            const daysInView = Math.max(Number(period?.dates?.length || 0), 1);
            const teamBatchSize = Math.max(20, Math.min(100, Math.floor(840 / daysInView)));
            const chunks = [];
            for (let offset = 0; offset < teamEmpCodes.length; offset += teamBatchSize) {
              chunks.push(teamEmpCodes.slice(offset, offset + teamBatchSize));
            }

            const collected = [];
            const concurrency = 3;
            let completed = 0;
            for (let cursor = 0; cursor < chunks.length; cursor += concurrency) {
              const group = chunks.slice(cursor, cursor + concurrency);
              setScheduleLoadStatus(
                "loading",
                `กำลังโหลดปฏิทินทีม • ${completed}/${chunks.length} ชุด`
              );
              const groupRows = await Promise.all(
                group.map(chunk => window.TimeClockShiftAPI.getMonthlySchedule(
                  window.TimeClockApp||{state},
                  {
                    p_month:`${period.month}-01`,
                    p_start_date:period.startDate,
                    p_end_date:period.endDate,
                    p_zone:val("scheduleZone")||null,
                    p_department:val("scheduleDepartment")||null,
                    p_emp_codes:chunk,
                    p_schedule_statuses:null,
                    p_disable_range_paging:true
                  }
                ))
              );
              groupRows.forEach(rows => collected.push(...(rows || [])));
              completed += group.length;
            }

            const unique = new Map();
            collected.forEach((row,index) => {
              const emp = String(row?.emp_code || "").trim();
              const date = String(row?.work_date || "").slice(0,10);
              unique.set(emp && date ? `${emp}|${date}` : `__row_${index}`, row);
            });
            data = [...unique.values()];
          } else {
            data =
              await window.TimeClockShiftAPI.getMonthlySchedule(
                window.TimeClockApp||{state},
                {
                  p_month:`${period.month}-01`,
                  p_start_date:period.startDate,
                  p_end_date:period.endDate,
                  p_zone:val("scheduleZone")||null,
                  p_department:val("scheduleDepartment")||null,
                  p_emp_codes:exactEmp?[exactEmp]:null,
                  p_schedule_statuses:null
                }
              );
          }
        }

        state.schedule=(data||[]).filter(row=>{
          const date=String(row.work_date||"").slice(0,10);
          return date>=period.startDate&&date<=period.endDate;
        });

        // V6.13.5: start/resign dates now come from the lightweight Grid RPC directly; Scope metadata remains a fallback.
        // Reuse it instead of making the base schedule RPC join extra historical tables.
        const scheduleEmployeeMetaMapV6129 = new Map(
          (Array.isArray(filterOptions.employees) ? filterOptions.employees : [])
            .map(employee => [
              String(employee?.emp_code || employee?.EmployeeId || '').trim(),
              employee
            ])
            .filter(([empCode]) => Boolean(empCode))
        );
        state.schedule.forEach(row => {
          const empCode = String(row?.emp_code || '').trim();
          const employeeMetaV616Q = scheduleEmployeeMetaMapV6129.get(empCode);
          scheduleMergeEmployeeMeta(row, employeeMetaV616Q);
          applyCanonicalOrgMetaV616Q(row,employeeMetaV616Q);
        });

        const expectedPersonEmployees =
          personMode
            ? (
                Array.isArray(state.scheduleScopeEmployeesV61151)
                  ? state.scheduleScopeEmployeesV61151.length
                  : 0
              )
            : 0;

        state.scheduleLoadMetaV61149={
          viewMode:period.viewMode,
          startDate:period.startDate,
          endDate:period.endDate,
          zone:String(val("scheduleZone")||""),
          department:String(val("scheduleDepartment")||""),
          fullScope:personMode ? true : !exactEmp,
          exactEmp:exactEmp||null,
          expectedEmployeeCount:expectedPersonEmployees,
          loadedAt:Date.now()
        };

        // V6.12.6 performance:
        // Render the base schedule immediately. Daily Work Plan / Scheduling Rule
        // metadata and team-manager names are enrichment layers, not prerequisites
        // for showing the calendar grid. Keeping them off the critical path removes
        // the long white/loading state on large scopes.
        renderSchedule();

        const scheduleRowsForEnrichmentV6125 = state.schedule;
        Promise.resolve().then(async () => {
          try {
            await enrichScheduleTeamContextV61526(scheduleRowsForEnrichmentV6125,period);
            if (managerEnrichTokenV6125 === state.scheduleManagerEnrichTokenV6125) renderSchedule();
          } catch (teamContextErrorV61526) {
            console.warn('Deferred Team Context V6.15.26:',teamContextErrorV61526);
          }
        });
        Promise.resolve().then(async () => {
          try {
            await Promise.all([
              enrichScheduleWorkPlanMetaV6118(period, scheduleRowsForEnrichmentV6125),
              window.TimeClockSchedulingRulesV6120?.enrichScheduleRows?.(scheduleRowsForEnrichmentV6125)
            ]);

            if (managerEnrichTokenV6125 === state.scheduleManagerEnrichTokenV6125) {
              renderSchedule();
            }
          } catch (metadataErrorV6125) {
            console.warn('Deferred schedule metadata enrichment V6.12.6:', metadataErrorV6125);
          }
        });

        if (!personMode) {
          Promise.resolve().then(async () => {
            try {
              await Promise.all([
                enrichScheduleManagerMetaV61122(scheduleRowsForEnrichmentV6125),
                enrichScheduleManagerMapV61124(scheduleRowsForEnrichmentV6125, period)
              ]);
              await enrichScheduleManagerNamesV61121(scheduleRowsForEnrichmentV6125);
              const unresolvedManagerRowsV61124 = scheduleRowsForEnrichmentV6125.filter(row =>
                !Array.isArray(row?._team_manager_names_v61123)
                || row._team_manager_names_v61123.length === 0
              );
              if (unresolvedManagerRowsV61124.length) {
                await enrichScheduleOrgManagersV61123(unresolvedManagerRowsV61124, period);
              }

              // Ignore stale background results if the user has already switched
              // period/filter/view and started a newer calendar load.
              if (managerEnrichTokenV6125 === state.scheduleManagerEnrichTokenV6125) {
                renderSchedule();
              }
            } catch (managerErrorV6125) {
              console.warn('Deferred schedule manager enrichment V6.12.6:', managerErrorV6125);
            }
          });
        }
        syncSchedulePeriodUI();
        const employeeCount=new Set(state.schedule.map(r=>String(r.emp_code||"")).filter(Boolean)).size;
        if(state.schedule.length){
          if (period.viewMode === "PERSON") {
            schedulePersonSearchRepairKeyV61150 = "";
          }

          const expectedEmployeeCount =
            Number(
              state.scheduleLoadMetaV61149?.expectedEmployeeCount
              || 0
            );

          const personComplete =
            period.viewMode !== "PERSON"
            || !expectedEmployeeCount
            || employeeCount === expectedEmployeeCount;

          setScheduleLoadStatus(
            personComplete ? "success" : "warning",
            period.viewMode==="PERSON"
              ? (
                  personComplete
                    ? `${period.personDisplayMode === "15D" ? "โหลดช่วง 15 วันครบแล้ว" : "โหลดเต็มเดือนครบแล้ว"} • พนักงาน ${employeeCount.toLocaleString("th-TH")}/${expectedEmployeeCount.toLocaleString("th-TH")} คน ตาม Scope • ${state.schedule.length.toLocaleString("th-TH")} วัน-พนักงาน • ${(((window.performance?.now?.() || Date.now()) - scheduleLoadStartedAtV6125)/1000).toLocaleString("th-TH",{maximumFractionDigits:1})} วิ`
                    : `ข้อมูลยังไม่ครบ • โหลดได้ ${employeeCount.toLocaleString("th-TH")}/${expectedEmployeeCount.toLocaleString("th-TH")} คน ตาม Scope • กรุณาตรวจ Scope/วันที่เริ่มงาน`
                )
              : `โหลดสำเร็จ • พนักงาน ${employeeCount.toLocaleString("th-TH")} คน • ${state.schedule.length.toLocaleString("th-TH")} วัน-พนักงาน • ${(((window.performance?.now?.() || Date.now()) - scheduleLoadStartedAtV6125)/1000).toLocaleString("th-TH",{maximumFractionDigits:1})} วิ`
          );
          return;
        }
        const debug=await window.TimeClockShiftAPI?.getScheduleScopeDebug?.(window.TimeClockApp||{state},period.startDate,period.endDate);
        const message=scheduleScopeMessage(debug,period);setScheduleLoadStatus("warning",message);toast(message,"warning");
      }catch(error){
        const message=humanError(error);
        setScheduleLoadStatus("error",`โหลดตารางกะไม่สำเร็จ: ${message}`);
        toast(message,"error");
      } finally {
        hideLoading();

        if(button){
          button.disabled=false;
          button.removeAttribute("aria-busy");
          button.innerHTML=idleButtonHtml;
        }

        scheduleLoadInFlightV61151 = false;

        if (scheduleLoadQueuedV61151) {
          scheduleLoadQueuedV61151 = false;
          setTimeout(() => loadSchedule(), 0);
        }
      }
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

    const scheduleViewState = {
      mode: (() => {
        try {
          const saved = String(localStorage.getItem("timeclock.schedule.view") || "TEAM").trim().toUpperCase();
          return ["TEAM","TIME","PERSON"].includes(saved) ? saved : "TEAM";
        } catch (_) {
          return "TEAM";
        }
      })(),
      teamPeriodStart: (() => {
        try {
          return String(
            localStorage.getItem("timeclock.schedule.teamPeriodStart")
            || scheduleBlockStartForDate(todayISO())
          ).slice(0,10);
        } catch (_) {
          return scheduleBlockStartForDate(todayISO());
        }
      })(),
      personMonth: (() => {
        try {
          return String(
            localStorage.getItem("timeclock.schedule.personMonth")
            || monthISO()
          ).slice(0,7);
        } catch (_) {
          return monthISO();
        }
      })(),
      personDisplayMode: (() => {
        try {
          const saved = String(localStorage.getItem("timeclock.schedule.personDisplayMode") || "MONTH").toUpperCase();
          return saved === "15D" ? "15D" : "MONTH";
        } catch (_) {
          return "MONTH";
        }
      })(),
      personTeamGroupMode: (() => {
        try {
          const saved = String(localStorage.getItem("timeclock.schedule.personTeamGroupMode") || "TEAM").toUpperCase();
          return saved === "FLAT" ? "FLAT" : "TEAM";
        } catch (_) {
          return "TEAM";
        }
      })(),
      personPeriodStart: (() => {
        try {
          const saved = String(localStorage.getItem("timeclock.schedule.personPeriodStart") || "").slice(0,10);
          return saved || `${monthISO()}-01`;
        } catch (_) {
          return `${monthISO()}-01`;
        }
      })()
    };

    function scheduleCurrentView() {
      return ["TEAM","TIME","PERSON"].includes(scheduleViewState.mode)
        ? scheduleViewState.mode
        : "TEAM";
    }

    // V6.15.26 — 4D.1D effective Team context.
    // Read-only enrichment; Team Enforcement remains authoritative in V6.15.25.
    const scheduleTeamContextStateV61526 = {
      key:'', loading:false, error:null, loadedAt:0
    };

    function scheduleTeamContextMetaV61526(row) {
      return row?._team_context_v61526 || null;
    }

    function scheduleOperationalTeamGroupV61526(row) {
      const meta = scheduleTeamContextMetaV61526(row);
      if (meta?.team_filter_key) {
        return {
          key:String(meta.team_filter_key),
          label:String(meta.team_display_label || meta.team_name || meta.team_code || 'ไม่ระบุทีม'),
          code:String(meta.team_code || ''),
          name:String(meta.team_name || ''),
          teamId:String(meta.team_id || ''),
          orgCode:String(meta.team_org_code || meta.employee_org_code || ''),
          category:String(meta.team_category || meta.car_category || 'UNCLASSIFIED').toUpperCase(),
          state:String(meta.assignment_state || 'TEAM').toUpperCase(),
          enforcementRequired:meta.enforcement_required === true,
          enforcementSatisfied:meta.enforcement_satisfied !== false,
          legacy:false
        };
      }
      const unit = scheduleUnitLabel(row);
      return {
        key:`LEGACY:${unit}`, label:unit, code:'', name:unit, teamId:'', orgCode:'',
        category:'UNCLASSIFIED', state:'LEGACY', enforcementRequired:false,
        enforcementSatisfied:true, legacy:true
      };
    }

    const schedulePersonCollapsedTeamsV616T = new Set();

    function scheduleTeamReadyV616T(row) {
      const meta = scheduleTeamContextMetaV61526(row);
      if (!meta) return true; // compatibility while context is loading/unavailable; DB guard remains final authority.
      const stateCode = String(meta.assignment_state || '').toUpperCase();
      const teamId = String(meta.team_id || '').trim();
      if (['UNCLASSIFIED','CAR_UNASSIGNED','MOTORCYCLE_UNASSIGNED','MOTORCYCLE_OPTIONAL','SUPPORT_UNASSIGNED'].includes(stateCode)) return false;
      return Boolean(teamId);
    }

    function scheduleTeamReadinessLabelV616T(row) {
      const meta = scheduleTeamContextMetaV61526(row);
      const stateCode = String(meta?.assignment_state || '').toUpperCase();
      if (stateCode === 'UNCLASSIFIED') return 'รอกำหนดรูปแบบ';
      if (stateCode === 'CAR_UNASSIGNED') return 'รถยนต์ • รอจัดทีม';
      if (['MOTORCYCLE_UNASSIGNED','MOTORCYCLE_OPTIONAL'].includes(stateCode)) return 'มอเตอร์ไซค์ • รอจัดทีม';
      if (stateCode === 'SUPPORT_UNASSIGNED') return 'สนับสนุน • รอจัดทีม';
      return 'พร้อมจัดกะ';
    }

    function schedulePersonTeamSectionsV616T(entries, period) {
      const list = Array.isArray(entries) ? entries : [];
      if (String(scheduleViewState.personTeamGroupMode || 'TEAM').toUpperCase() === 'FLAT') {
        return [{ key:'__ALL__', label:'พนักงานทั้งหมด', state:'FLAT', category:'ALL', entries:list }];
      }
      const groups = new Map();
      const ensure = group => {
        const key = String(group?.key || 'UNASSIGNED:UNCLASSIFIED');
        if (!groups.has(key)) groups.set(key, { ...group, key, entries:[] });
        return groups.get(key);
      };
      list.forEach(([emp,obj]) => {
        const byTeam = new Map();
        (period?.dates || []).forEach(date => {
          const row = obj?.days?.[date];
          if (!row) return;
          const group = scheduleOperationalTeamGroupV61526(row);
          const key = String(group?.key || 'UNASSIGNED:UNCLASSIFIED');
          if (!byTeam.has(key)) byTeam.set(key,{group,days:{},firstRow:row});
          byTeam.get(key).days[date]=row;
        });
        if (!byTeam.size) {
          const group={key:'UNASSIGNED:UNCLASSIFIED',label:'รอกำหนดรูปแบบ / ทีม',code:'',name:'',teamId:'',orgCode:'',category:'UNCLASSIFIED',state:'UNCLASSIFIED'};
          byTeam.set(group.key,{group,days:{},firstRow:null});
        }
        byTeam.forEach(part => {
          const section=ensure(part.group);
          section.entries.push([emp,{
            ...obj,
            meta:{...obj.meta,...(part.firstRow||{})},
            days:part.days,
            _personTeamGroupV616T:true,
            _personTeamGroupKeyV616T:part.group.key
          }]);
        });
      });
      const weight = stateCode => ['TEAM','BORROW_CROSS_ORG','TEMP_TEAM_ASSIST'].includes(String(stateCode||'').toUpperCase()) ? 1 : 9;
      return [...groups.values()].sort((a,b)=>weight(a.state)-weight(b.state)||String(a.label||'').localeCompare(String(b.label||''),'th',{numeric:true,sensitivity:'base'}));
    }

    function schedulePersonTeamHeaderV616T(section, colspan) {
      if (String(scheduleViewState.personTeamGroupMode || 'TEAM').toUpperCase() !== 'TEAM') return '';
      const key=String(section?.key||'');
      const collapsed=schedulePersonCollapsedTeamsV616T.has(key);
      const count=new Set((section?.entries||[]).map(([emp])=>String(emp))).size;
      const ready=Boolean(section?.teamId) && !['UNCLASSIFIED','CAR_UNASSIGNED','MOTORCYCLE_UNASSIGNED','MOTORCYCLE_OPTIONAL','SUPPORT_UNASSIGNED'].includes(String(section?.state||'').toUpperCase());
      const category=String(section?.category||'UNCLASSIFIED').toUpperCase();
      const categoryLabel=category==='CAR'?'CAR':category==='MOTORCYCLE'?'MOTORCYCLE':category==='SUPPORT'?'SUPPORT':'รอจัดข้อมูล';
      return `<tr class="schedule-person-team-section-v616t ${ready?'is-ready':'is-pending'}" data-person-team-section-v616t="${safe(key)}"><td colspan="${Number(colspan)||1}"><button type="button" class="schedule-person-team-toggle-v616t" data-person-team-toggle-v616t="${safe(key)}" aria-expanded="${collapsed?'false':'true'}"><span class="chev">${collapsed?'›':'⌄'}</span><strong>${safe(section?.label||'ไม่ระบุทีม')}</strong><small>${safe(categoryLabel)} · ${formatNumber(count)} คน</small></button><span class="schedule-person-team-ready-v616t">${ready?'พร้อมจัดกะ':'รอกำหนดรูปแบบ/ทีม'}</span></td></tr>`;
    }

    function scheduleTemporaryWorkingMetaV61529F14B(row) {
      const ctx = scheduleTeamContextMetaV61526(row);
      const stateCode = String(ctx?.assignment_state || ctx?.assignment_type || '').toUpperCase();
      if (!['BORROW_CROSS_ORG','TEMP_TEAM_ASSIST'].includes(stateCode)) return null;
      const homeOrg = String(ctx?.home_org_code || ctx?.employee_org_code || '').trim();
      const workingOrg = String(ctx?.team_org_code || '').trim();
      const canEdit = ctx?.can_edit_schedule === true;
      return {
        type:stateCode,
        isBorrow:stateCode === 'BORROW_CROSS_ORG',
        isAssist:stateCode === 'TEMP_TEAM_ASSIST',
        homeOrg,
        workingOrg,
        canEdit,
        canConfirm:ctx?.can_confirm_schedule === true,
        authorityType:String(ctx?.access_authority_type || '').toUpperCase(),
        label:stateCode === 'BORROW_CROSS_ORG'
          ? (canEdit ? `ยืมจาก ${homeOrg || '-'}` : `ยืมไป ${workingOrg || '-'}`)
          : (canEdit ? 'มาช่วยทีมชั่วคราว' : `ไปช่วย ${workingOrg || 'ทีมอื่น'} ชั่วคราว`)
      };
    }

    function scheduleBorrowDestinationWindowV61529F15L(days) {
      const entries=Object.entries(days||{}).filter(([,row])=>{
        const meta=scheduleTemporaryWorkingMetaV61529F14B(row);
        return meta?.isBorrow===true && meta?.canEdit===true;
      });
      if(!entries.length)return null;
      entries.sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
      const firstMeta=scheduleTemporaryWorkingMetaV61529F14B(entries[0][1])||{};
      return {
        from:String(entries[0][0]).slice(0,10),
        to:String(entries[entries.length-1][0]).slice(0,10),
        homeOrg:firstMeta.homeOrg||'',
        workingOrg:firstMeta.workingOrg||''
      };
    }

    function scheduleBorrowWindowBadgeV61529F15L(windowMeta) {
      if(!windowMeta)return '';
      const fromDay=Number(String(windowMeta.from||'').slice(8,10))||'';
      const toDay=Number(String(windowMeta.to||'').slice(8,10))||'';
      const compact=fromDay&&toDay?(fromDay===toDay?`${fromDay}`:`${fromDay}–${toDay}`):'ช่วงยืมตัว';
      const title=`ยืมตัว${windowMeta.homeOrg?`จาก ${windowMeta.homeOrg}`:''} • จัดกะได้ ${formatDate(windowMeta.from)}–${formatDate(windowMeta.to)}`;
      return `<span class="schedule-borrow-window-badge-v61529f15l" title="${safe(title)}"><span aria-hidden="true">↔</span><strong>ยืมตัว ${safe(compact)}</strong></span>`;
    }

    function scheduleWorkingTeamCanEditV61529F14B(row) {
      const ctx = scheduleTeamContextMetaV61526(row);
      return ctx?.can_edit_schedule !== false;
    }

    function fillScheduleOperationalTeamOptionsV61526(rows = state.schedule) {
      const select = $("scheduleOperationalTeamV61526");
      if (!select) return;
      const old = String(select.value || '');
      const groups = new Map();
      (rows || []).forEach(row => {
        const g = scheduleOperationalTeamGroupV61526(row);
        if (g.legacy) return;
        if (!groups.has(g.key)) groups.set(g.key,g);
      });
      const sorted = [...groups.values()].sort((a,b) => {
        const aw = a.state==='CAR_UNASSIGNED' ? 8 : a.state==='SUPPORT_UNASSIGNED' ? 9 : ['MOTORCYCLE_UNASSIGNED','MOTORCYCLE_OPTIONAL'].includes(a.state) ? 10 : a.state==='UNCLASSIFIED' ? 11 : 1;
        const bw = b.state==='CAR_UNASSIGNED' ? 8 : b.state==='SUPPORT_UNASSIGNED' ? 9 : ['MOTORCYCLE_UNASSIGNED','MOTORCYCLE_OPTIONAL'].includes(b.state) ? 10 : b.state==='UNCLASSIFIED' ? 11 : 1;
        return aw-bw || a.label.localeCompare(b.label,'th');
      });
      const mappedOptionsV61526 = sorted.map(g => {
        const suffix = g.state==='CAR_UNASSIGNED' ? ' ⚠' : g.state==='SUPPORT_UNASSIGNED' ? ' ⚠' : ['MOTORCYCLE_UNASSIGNED','MOTORCYCLE_OPTIONAL'].includes(g.state) ? ' ⚠' : g.state==='UNCLASSIFIED' ? ' ⚠' : '';
        return `<option value="${safe(g.key)}">${safe(g.label + suffix)}</option>`;
      }).join('');
      const keepPendingV61526 = old && !sorted.some(g => g.key===old) && scheduleTeamContextStateV61526.loading;
      select.innerHTML = '<option value="">ทุกทีมช่างเทคนิค</option>' + (keepPendingV61526 ? `<option value="${safe(old)}">กำลังจับคู่ทีม...</option>` : '') + mappedOptionsV61526;
      if ([...select.options].some(o => o.value === old)) select.value = old;
      const note = $("scheduleOperationalTeamMetaV61526");
      if (note) {
        const unassigned = sorted.filter(g => ['CAR_UNASSIGNED','MOTORCYCLE_UNASSIGNED','MOTORCYCLE_OPTIONAL','SUPPORT_UNASSIGNED'].includes(g.state)).length;
        note.textContent = scheduleTeamContextStateV61526.loading
          ? 'กำลังจับคู่ Effective Team...'
          : scheduleTeamContextStateV61526.error
            ? 'โหลด Team Context ไม่สำเร็จ • ตารางยังแสดงตามหน่วยงานเดิม'
            : `${sorted.filter(g=>['TEAM','BORROW_CROSS_ORG','TEMP_TEAM_ASSIST'].includes(g.state)).length} ทีม/รายการปฏิบัติงาน • ${unassigned} กลุ่มที่ยังต้องกำหนดทีม`;
      }
    }

    async function enrichScheduleTeamContextV61526(rows, period) {
      const list = Array.isArray(rows) ? rows : [];
      const empCodes = [...new Set(list.map(r => String(r?.emp_code || '').trim()).filter(Boolean))];
      if (!empCodes.length || !state.client || !period?.startDate || !period?.endDate) {
        fillScheduleOperationalTeamOptionsV61526(list);
        return;
      }
      const key = `${period.startDate}|${period.endDate}|${empCodes.join(',')}`;
      scheduleTeamContextStateV61526.key=key;
      scheduleTeamContextStateV61526.loading=true;
      scheduleTeamContextStateV61526.error=null;
      fillScheduleOperationalTeamOptionsV61526(list);
      try {
        const all=[];
        const chunkSize=250;
        for (let i=0;i<empCodes.length;i+=chunkSize) {
          const chunk=empCodes.slice(i,i+chunkSize);
          const args={p_emp_codes:chunk,p_start_date:period.startDate,p_end_date:period.endDate};
          let response=await state.client.rpc('ta_get_schedule_working_team_context_v61529f14b',args);
          if (response.error && missingFunction(response.error)) {
            response=await state.client.rpc('ta_get_schedule_team_context_v61526',args);
          }
          if (response.error) throw response.error;
          all.push(...(Array.isArray(response.data)?response.data:[]));
        }
        if (scheduleTeamContextStateV61526.key!==key) return;
        const map=new Map(all.map(x=>[`${String(x.emp_code||'').trim()}|${String(x.work_date||'').slice(0,10)}`,x]));
        list.forEach(row=>{
          const k=`${String(row?.emp_code||'').trim()}|${String(row?.work_date||'').slice(0,10)}`;
          row._team_context_v61526=map.get(k)||null;
        });
        scheduleTeamContextStateV61526.loadedAt=Date.now();
      } catch(error) {
        scheduleTeamContextStateV61526.error=error;
        console.warn('Schedule Team Context V6.15.26:',error);
      } finally {
        scheduleTeamContextStateV61526.loading=false;
        fillScheduleOperationalTeamOptionsV61526(list);
      }
    }

    function schedulePersonLoadMatchesV61149(period = null) {
      if (scheduleCurrentView() !== "PERSON") return true;

      const range = period || schedulePeriodRange();
      const meta = state.scheduleLoadMetaV61149 || null;
      if (!meta || meta.viewMode !== "PERSON" || meta.fullScope !== true) {
        return false;
      }

      return (
        meta.startDate === range.startDate
        && meta.endDate === range.endDate
        && String(meta.zone || "") === String(val("scheduleZone") || "")
        && String(meta.department || "") === String(val("scheduleDepartment") || "")
      );
    }

    let schedulePersonSearchReloadTimerV61149 = null;
    let schedulePersonSearchRepairKeyV61150 = "";

    function schedulePersonSearchHasMatchV61150(term) {
      const q = String(term || "").trim().toLowerCase();
      if (!q) return true;

      return (state.schedule || []).some(row =>
        `${row?.emp_code || ""} ${row?.full_name || ""}`
          .toLowerCase()
          .includes(q)
      );
    }

    function applyScheduleViewMode() {
      const mode = scheduleCurrentView();
      qsa('[data-schedule-view]').forEach(button => {
        button.classList.toggle(
          'active',
          String(button.dataset.scheduleView || '').toUpperCase() === mode
        );
      });

      $("scheduleTeamWorkspace")?.classList.toggle("hidden", mode === "PERSON");
      $("schedulePersonWorkspace")?.classList.toggle("hidden", mode !== "PERSON");

      const label = $("scheduleSelectedKpiLabel");
      if (label) {
        label.textContent = mode === "PERSON" ? "ช่องที่เลือก" : "ทีมที่แสดง";
      }

      const title = $("scheduleViewHintTitle");
      const text = $("scheduleViewHintText");
      if (title) {
        title.textContent = mode === "TIME"
          ? "สถิติการมาทำงานรายทีม"
          : mode === "TEAM"
            ? "สรุปข้อมูลรายทีมช่างเทคนิค"
            : "ปฏิทินจัดกะรายบุคคล";
      }
      if (text) {
        text.textContent = mode === "TIME"
          ? "ดูจำนวนพนักงานปกติ ขาดงาน มาสาย กลับก่อน และลารายทีม/รายวัน • คลิก Label เพื่อดูรายชื่อและเวลาเข้า–ออก"
          : mode === "TEAM"
            ? "ดูภาพรวมตาม Effective Team • แยกทีมรถยนต์/มอเตอร์ไซค์และกลุ่มยังไม่ได้กำหนดทีมตามวันที่"
            : "แสดงตารางรายบุคคลเต็มเดือน • Label แสดงเฉพาะไอคอน • วางเมาส์บนไอคอนเพื่อดูรหัสกะ เวลา และรายละเอียด • ยังเลือกหลายช่อง คัดลอก วาง และบันทึกได้เหมือนเดิม";
      }

      const teamTitleV6146 = $("scheduleTeamWorkspaceTitleV6146");
      const teamSubtitleV6146 = $("scheduleTeamWorkspaceSubtitleV6146");
      const teamLegendV6146 = $("scheduleTeamLegendV6146");
      const teamTipV6146 = $("scheduleTeamTipV6146");
      const teamAlertLabelV6146 = $("scheduleTeamAlertLabelV6146");
      if (teamTitleV6146) teamTitleV6146.textContent = mode === "TIME" ? "สรุปเวลาทำงานรายทีมช่างเทคนิค" : "ตารางกะสรุปรายทีมช่างเทคนิค";
      if (teamSubtitleV6146) teamSubtitleV6146.textContent = mode === "TIME"
        ? "สรุปสถานะการมาทำงานรายทีมในช่วงประมาณ 15 วันที่เลือก • คลิกแต่ละวันเพื่อดูรายชื่อ เวลาเข้า–ออก และรายละเอียด"
        : "สรุปตาม Effective Team ในช่วงประมาณ 15 วันที่เลือก • รวมกลุ่มรถยนต์/มอเตอร์ไซค์/สนับสนุนที่ยังไม่มีทีม และรอ Manager กำหนดประเภท";
      if (teamLegendV6146) teamLegendV6146.innerHTML = mode === "TIME"
        ? '<span class="badge time-legend-normal-v6146">ปกติ</span><span class="badge time-legend-absence-v6146">ขาดงาน</span><span class="badge time-legend-late-v6146">สาย</span><span class="badge time-legend-early-v6146">กลับก่อน</span><span class="badge time-legend-off-v61411">หยุด</span><span class="badge time-legend-leave-v6149">ลา</span>'
        : '<span class="badge shift-legend-day">กะกลางวัน</span><span class="badge shift-legend-night">กะกลางคืน</span><span class="badge badge-gray">หยุด / OFF</span><span class="badge badge-orange">HOL / นักขัตฤกษ์</span><span class="badge badge-red-soft">มีรายการต้องตรวจสอบ</span>';
      if (teamTipV6146) teamTipV6146.textContent = mode === "TIME"
        ? "มุมมองเวลาเหมาะสำหรับหัวหน้างานติดตามการมาทำงานรายวัน แล้วคลิกดูรายชื่อพนักงานที่ต้องติดตาม"
        : "มุมมองทีมเหมาะสำหรับดูภาพรวมการครอบคลุมกำลังคน ก่อนเจาะลงไปดูรายบุคคล";
      if (teamAlertLabelV6146) teamAlertLabelV6146.textContent = mode === "TIME" ? "รายการผิดปกติ" : "จุดที่ต้องตรวจสอบ";

      if (mode !== "PERSON") {
        const valueNode = $("scheduleTeamVisibleCount");
        if ($("scheduleSelectedKpi") && valueNode) {
          $("scheduleSelectedKpi").textContent = String(valueNode.dataset.value || valueNode.textContent || '0');
        }
      }
    }

    function setScheduleView(mode, persist = true) {
      const currentMode = scheduleCurrentView();
      const currentCursor =
        String(val("schedulePeriodStart") || "").slice(0,10);

      if (currentMode !== "PERSON" && currentCursor) {
        scheduleViewState.teamPeriodStart =
          scheduleBlockStartForDate(currentCursor);
      } else if (currentMode === "PERSON" && currentCursor) {
        scheduleViewState.personMonth = currentCursor.slice(0,7);
        scheduleViewState.personPeriodStart = scheduleBlockStartForDate(currentCursor);
      }

      const next = String(mode || "TEAM").trim().toUpperCase();
      scheduleViewState.mode = ["TEAM","TIME","PERSON"].includes(next) ? next : "TEAM";

      if (scheduleViewState.mode === "PERSON") {
        const sourceMonth = scheduleViewState.personMonth || currentCursor.slice(0,7) || monthISO();
        const sourceStart = String(scheduleViewState.personDisplayMode || 'MONTH').toUpperCase() === '15D'
          ? scheduleBlockStartForDate(scheduleViewState.personPeriodStart || `${sourceMonth}-01`)
          : `${sourceMonth}-01`;
        scheduleViewState.personPeriodStart = scheduleBlockStartForDate(sourceStart);
        setVal("schedulePeriodStart", sourceStart);
      } else {
        // V6.14.13: TEAM and TIME share their own remembered 15-day cursor.
        // PERSON month is intentionally independent and must not lock this view.
        const rememberedTeamStart =
          String(scheduleViewState.teamPeriodStart || "").slice(0,10);

        const fallbackTeamStart =
          currentMode !== "PERSON" && currentCursor
            ? scheduleBlockStartForDate(currentCursor)
            : `${(currentCursor.slice(0,7) || monthISO())}-01`;

        scheduleViewState.teamPeriodStart =
          scheduleBlockStartForDate(
            rememberedTeamStart || fallbackTeamStart
          );

        setVal(
          "schedulePeriodStart",
          scheduleViewState.teamPeriodStart
        );
      }

      if (persist) {
        try {
          localStorage.setItem(
            "timeclock.schedule.view",
            scheduleViewState.mode
          );
          localStorage.setItem(
            "timeclock.schedule.teamPeriodStart",
            scheduleViewState.teamPeriodStart
          );
          localStorage.setItem("timeclock.schedule.personMonth",scheduleViewState.personMonth);
          localStorage.setItem("timeclock.schedule.personDisplayMode",scheduleViewState.personDisplayMode);
          localStorage.setItem("timeclock.schedule.personPeriodStart",scheduleViewState.personPeriodStart);
        } catch (_) {}
      }

      applyScheduleViewMode();
      syncSchedulePeriodUI();

      return currentMode !== scheduleViewState.mode;
    }

    function scheduleUnitLabel(row) {
      return String(
        canonicalOrgNameV616Q(row)
        || row?.sub_area
        || row?.area
        || row?.zone
        || "ไม่ระบุหน่วยงาน"
      ).trim() || "ไม่ระบุหน่วยงาน";
    }


    const scheduleManagerNameCacheV61121 = new Map();

    async function enrichScheduleManagerMetaV61122(rows = []) {
      const empCodes = [...new Set(
        (rows || [])
          .map(row => String(row?.emp_code || row?.EmployeeId || '').trim())
          .filter(Boolean)
      )];
      if (!empCodes.length || !state.client) return;

      const metaByEmp = new Map();
      try {
        for (let i = 0; i < empCodes.length; i += 150) {
          const batch = empCodes.slice(i, i + 150);
          const { data, error } = await state.client
            .from('employees')
            .select('EmployeeId,org_code,manager_department,manager_division,manager_gm,manager_avp')
            .in('EmployeeId', batch);
          if (error) throw error;
          (data || []).forEach(employee => {
            const code = String(employee?.EmployeeId || '').trim();
            if (code) metaByEmp.set(code, employee);
          });
        }

        (rows || []).forEach(row => {
          const empCode = String(row?.emp_code || row?.EmployeeId || '').trim();
          const meta = metaByEmp.get(empCode);
          if (!meta) return;
          ['org_code','manager_department','manager_division','manager_gm','manager_avp'].forEach(field => {
            const current = String(row?.[field] || '').trim();
            const incoming = String(meta?.[field] || '').trim();
            if (!current && incoming) row[field] = incoming;
          });
        });
      } catch (error) {
        console.warn('Schedule manager metadata enrichment V6.11.22:', error);
      }
    }

    function scheduleManagerCodeV61121(row) {
      return String(
        row?.manager_department
        || row?.manager_division
        || row?.manager_gm
        || row?.manager_avp
        || ""
      ).trim();
    }

    async function enrichScheduleManagerNamesV61121(rows = []) {
      const managerCodes = [...new Set(
        (rows || [])
          .map(scheduleManagerCodeV61121)
          .filter(Boolean)
      )];
      if (!managerCodes.length) return;

      const rowNameMap = new Map(
        (rows || []).map(row => [
          String(row?.emp_code || '').trim(),
          String(row?.full_name || '').trim()
        ])
      );

      managerCodes.forEach(code => {
        const localName = rowNameMap.get(code);
        if (localName && scheduleHasMeaningfulName(localName, code)) {
          scheduleManagerNameCacheV61121.set(code, localName);
        }
      });

      const unresolved = managerCodes.filter(code => !scheduleManagerNameCacheV61121.has(code));
      if (!unresolved.length || !state.client) return;

      try {
        for (let i = 0; i < unresolved.length; i += 100) {
          const batch = unresolved.slice(i, i + 100);
          const { data, error } = await state.client
            .from('employees')
            .select('EmployeeId,full_name')
            .in('EmployeeId', batch);
          if (error) throw error;
          (data || []).forEach(employee => {
            const code = String(employee?.EmployeeId || '').trim();
            const name = String(employee?.full_name || '').trim();
            if (code && name) scheduleManagerNameCacheV61121.set(code, name);
          });
        }
      } catch (error) {
        console.warn('Schedule manager name enrichment:', error);
      }
    }

    const scheduleOrgManagerStateV61123 = {
      loadedUnits: false,
      loadedKey: "",
      units: [],
      byCode: new Map(),
      byName: new Map(),
      detailById: new Map(),
      employeeNameByCode: new Map()
    };

    function scheduleNormalizeOrgKeyV61123(value) {
      return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
    }

    function scheduleManagerEffectiveV61123(manager, workDate = null) {
      if (!manager || manager.is_active === false) return false;
      const date = String(workDate || todayISO()).slice(0,10);
      const from = String(manager.effective_from || '').slice(0,10);
      const to = String(manager.effective_to || '').slice(0,10);
      if (from && date < from) return false;
      if (to && date > to) return false;
      return true;
    }

    async function scheduleLoadOrgUnitsV61123(period = null) {
      const cache = scheduleOrgManagerStateV61123;
      if (!state.client) return cache.units;

      // FIX15O: Organization Master is a permission boundary. Never read the
      // complete ta_org_units table directly from a Manager/Viewer browser.
      // The server returns only organization metadata authorized for the
      // selected Schedule period (HR Admin remains unrestricted).
      const resolvedPeriod = period || syncSchedulePeriodUI();
      const startDate = String(resolvedPeriod?.startDate || todayISO()).slice(0,10);
      const endDate = String(resolvedPeriod?.endDate || startDate).slice(0,10);
      const cacheKey = `${startDate}|${endDate}`;

      if (cache.loadedUnits && cache.loadedKey === cacheKey) return cache.units;

      try {
        let response = await state.client.rpc(
          'ta_get_authorized_org_units_v616m',
          { p_start_date:startDate, p_end_date:endDate }
        );
        if (response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
          response = await state.client.rpc(
            'ta_get_authorized_org_units_v616l',
            { p_start_date:startDate, p_end_date:endDate }
          );
        }
        if (response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
          response = await state.client.rpc(
            'ta_get_schedule_org_units_v61529f15o',
            { p_start_date:startDate, p_end_date:endDate }
          );
        }
        if (response.error) throw response.error;

        cache.units = Array.isArray(response.data) ? response.data : [];
        cache.byCode.clear();
        cache.byName.clear();
        cache.units.forEach(unit => {
          const codeKey = scheduleNormalizeOrgKeyV61123(unit?.org_code);
          const nameKey = scheduleNormalizeOrgKeyV61123(unit?.org_name);
          if (codeKey) cache.byCode.set(codeKey, unit);
          if (nameKey && !cache.byName.has(nameKey)) cache.byName.set(nameKey, unit);
        });
        cache.loadedUnits = true;
        cache.loadedKey = cacheKey;
      } catch (error) {
        // Security-first fallback: do not fall back to an unscoped table read.
        cache.units = [];
        cache.byCode.clear();
        cache.byName.clear();
        cache.loadedUnits = false;
        cache.loadedKey = '';
        console.warn('Schedule scoped org metadata FIX15O:', error);
      }
      return cache.units;
    }

    async function scheduleGetOrgDetailV61123(orgId) {
      const id = String(orgId || '').trim();
      if (!id || !state.client) return null;

      // Administration RPC: do not call from Manager/Viewer calendar.
      const currentRole = String(
        state.profile?._realRole || state.profile?.role || ''
      ).trim().toUpperCase();
      if (currentRole !== 'HR_ADMIN' || scheduleRpcHealthV6126.orgDetailDisabled) {
        return null;
      }

      const cache = scheduleOrgManagerStateV61123;
      if (cache.detailById.has(id)) return cache.detailById.get(id);
      try {
        const { data, error } = await state.client.rpc('ta_get_org_unit_detail_v690', {
          p_org_id: id
        });
        if (error) throw error;
        cache.detailById.set(id, data || null);
        return data || null;
      } catch (error) {
        scheduleRpcHealthV6126.orgDetailDisabled = true;
        scheduleLogRpcOnceV6126(
          'org-unit-detail',
          'Optional schedule org-manager enrichment V6.12.6 disabled:',
          error
        );
        cache.detailById.set(id, null);
        return null;
      }
    }

    async function scheduleResolveScopeManagerNamesV61123(unit, workDate = null) {
      if (!unit) return [];
      const cache = scheduleOrgManagerStateV61123;
      const managerRows = [];
      let current = unit;
      let depth = 0;

      while (current && depth < 12) {
        const detail = await scheduleGetOrgDetailV61123(current.org_id);
        const direct = (detail?.managers || []).filter(manager =>
          scheduleManagerEffectiveV61123(manager, workDate)
          && (depth === 0 || manager.include_descendants === true)
        );
        if (direct.length) {
          managerRows.push(...direct);
          break;
        }
        const parentId = String(current.parent_org_id || '').trim();
        if (!parentId) break;
        current = cache.units.find(item => String(item?.org_id || '') === parentId) || null;
        depth += 1;
      }

      const missingCodes = [...new Set(managerRows
        .map(manager => String(manager?.emp_code || '').trim())
        .filter(code => code && !cache.employeeNameByCode.has(code))
      )];
      if (missingCodes.length && state.client) {
        try {
          for (let i = 0; i < missingCodes.length; i += 100) {
            const batch = missingCodes.slice(i, i + 100);
            const { data, error } = await state.client
              .from('employees')
              .select('EmployeeId,full_name')
              .in('EmployeeId', batch);
            if (error) throw error;
            (data || []).forEach(employee => {
              const code = String(employee?.EmployeeId || '').trim();
              const name = String(employee?.full_name || '').trim();
              if (code && name) cache.employeeNameByCode.set(code, name);
            });
          }
        } catch (error) {
          console.warn('Schedule manager employee-name fallback V6.11.24:', error);
        }
      }

      return [...new Set(managerRows.map(manager => {
        const code = String(manager?.emp_code || '').trim();
        return String(
          manager?.display_name
          || cache.employeeNameByCode.get(code)
          || manager?.manager_email
          || code
          || ''
        ).trim();
      }).filter(Boolean))];
    }

    async function enrichScheduleOrgManagersV61123(rows = [], period = null) {
      if (!rows?.length || !state.client) return;
      await scheduleLoadOrgUnitsV61123(period);
      const cache = scheduleOrgManagerStateV61123;
      if (!cache.units.length) return;

      const groupRequests = new Map();
      (rows || []).forEach(row => {
        const teamLabel = scheduleUnitLabel(row);
        const nameUnit = cache.byName.get(scheduleNormalizeOrgKeyV61123(teamLabel));
        const codeUnit = cache.byCode.get(scheduleNormalizeOrgKeyV61123(row?.org_code));
        const unit = nameUnit || codeUnit || null;
        if (!unit) return;
        const key = String(unit.org_id || '');
        if (!groupRequests.has(key)) {
          groupRequests.set(key, {
            unit,
            date: String(row?.work_date || period?.startDate || todayISO()).slice(0,10),
            rows: []
          });
        }
        groupRequests.get(key).rows.push(row);
      });

      const requests = [...groupRequests.values()];
      for (let i = 0; i < requests.length; i += 6) {
        const batch = requests.slice(i, i + 6);
        await Promise.all(batch.map(async request => {
          // Team header should show the current Manager assignment, not the historical
          // schedule date. This avoids a blank label when the viewed week is outside the
          // Manager Scope effective period.
          const names = await scheduleResolveScopeManagerNamesV61123(request.unit, todayISO());
          request.rows.forEach(row => {
            row._team_manager_names_v61123 = names;
            row._team_org_id_v61123 = request.unit.org_id;
            row._team_org_code_v61123 = request.unit.org_code;
            row._team_org_name_v616l = request.unit.org_name || row.department || "";
          });
        }));
      }
    }

    async function enrichScheduleManagerMapV61124(rows = [], period = null) {
      if (!rows?.length || !state.client) return 0;
      const empCodes = [...new Set(
        (rows || [])
          .map(row => String(row?.emp_code || row?.EmployeeId || '').trim())
          .filter(Boolean)
      )];
      if (!empCodes.length) return 0;

      const namesByEmp = new Map();
      try {
        for (let i = 0; i < empCodes.length; i += 200) {
          const batch = empCodes.slice(i, i + 200);
          const { data, error } = await state.client.rpc(
            'ta_get_schedule_manager_map_v61124',
            {
              p_emp_codes: batch,
              // Manager shown in the team header is the current organizational Manager.
              // Do not bind the label to the historical week being viewed.
              p_work_date: todayISO()
            }
          );
          if (error) throw error;
          (data || []).forEach(item => {
            const emp = String(item?.emp_code || '').trim();
            const managerCode = String(item?.manager_emp_code || '').trim();
            const name = String(item?.manager_name || item?.manager_email || '').trim();
            // A numeric employee code is not a display name. Leave that row unresolved so
            // the Org Unit Manager fallback can resolve display_name/email correctly.
            const isCodeOnly = !!name && (/^\d+$/.test(name) || (managerCode && name === managerCode));
            if (!emp || !name || isCodeOnly) return;
            if (!namesByEmp.has(emp)) namesByEmp.set(emp, new Set());
            namesByEmp.get(emp).add(name);
          });
        }
      } catch (error) {
        console.warn('Schedule team manager resolver V6.11.25:', error);
        return 0;
      }

      let resolvedRows = 0;
      (rows || []).forEach(row => {
        const emp = String(row?.emp_code || row?.EmployeeId || '').trim();
        const names = [...(namesByEmp.get(emp) || new Set())];
        if (!names.length) return;
        row._team_manager_names_v61123 = names;
        row._team_manager_source_v61124 = 'SERVER_CURRENT_MANAGER_RESOLVER';
        resolvedRows += 1;
      });
      return resolvedRows;
    }

    function scheduleTeamManagerLabelV61121(team) {
      const nameCounts = team?.managerNames instanceof Map ? [...team.managerNames.entries()] : [];
      if (nameCounts.length) {
        nameCounts.sort((a,b) => Number(b[1] || 0) - Number(a[1] || 0) || String(a[0]).localeCompare(String(b[0]), 'th'));
        const names = nameCounts.map(item => String(item[0] || '').trim()).filter(Boolean);
        if (names.length === 1) return names[0];
        if (names.length === 2) return names.join(' / ');
        if (names.length > 2) return `${names.slice(0,2).join(' / ')} +${names.length - 2}`;
      }

      const counts = team?.managers instanceof Map ? [...team.managers.entries()] : [];
      if (!counts.length) return '-';
      counts.sort((a,b) => Number(b[1] || 0) - Number(a[1] || 0) || String(a[0]).localeCompare(String(b[0]), 'th'));
      const code = String(counts[0]?.[0] || '').trim();
      if (!code) return '-';
      return scheduleManagerNameCacheV61121.get(code) || code;
    }

    function scheduleResolveShiftMeta(row) {
      const schedulingRuleDisplayV6120 = window.TimeClockSchedulingRulesV6120?.rowDisplay?.(row) || null;
      const code = window.tcShiftCode(
        row?.assigned_shift_code
        || row?.effective_shift_code
        || row?.auto_shift_code
        || row?.shift_code
        || "-"
      );

      const shiftMaster = state.filters.shifts.find(
        shift => window.tcShiftCode(shift.shift_code) === code
      );
      const effectiveWindowV6133 = scheduleEffectiveShiftWindowV6133(row);

      const shiftStart = formatTime(effectiveWindowV6133.start);
      const shiftEnd = formatTime(effectiveWindowV6133.end);

      const hasTime = !scheduleIsNonWorkingShiftV61447(code,shiftMaster)
        && shiftStart !== '-'
        && shiftEnd !== '-';

      const label = code === 'OFF'
        ? 'หยุด'
        : code === 'HOL'
          ? 'HOL'
          : code === 'LV'
            ? 'ลา'
            : hasTime
              ? `${shiftStart}–${shiftEnd}`
              : (code || '-');

      const nonWorkingShiftV61447 = scheduleIsNonWorkingShiftV61447(code, shiftMaster);
      const tone = code === 'HOL'
        ? 'holiday'
        : code === 'LV'
          ? 'leave'
          : nonWorkingShiftV61447
            ? 'off'
            : shiftMaster?.is_night_shift === true
              || window.tcIsNightShiftCode(code)
              || String(shiftMaster?.shift_name || '').toLowerCase().includes('กลางคืน')
              || String(shiftMaster?.shift_name || '').toLowerCase().includes('กะดึก')
              || String(label).includes('22')
              ? 'night'
              : 'day';

      if (schedulingRuleDisplayV6120) {
        const ruleTone = nonWorkingShiftV61447
          ? 'off'
          : (schedulingRuleDisplayV6120.tone || tone);
        return {
          code,
          label: schedulingRuleDisplayV6120.label || label,
          tone: ruleTone,
          isWorking: !['off','holiday','leave'].includes(ruleTone)
        };
      }

      return {
        code,
        label,
        tone,
        isWorking: ['day','night'].includes(tone)
      };
    }



    /* V6.13.7 — Person Full-Month icon-only shift labels.
       Presentation only: backend Shift Codes / rules / calculations stay unchanged. */
    function schedulePersonIconSvgV6136(kind) {
      const common = 'viewBox="0 0 24 24" aria-hidden="true" focusable="false"';
      const icons = {
        day: `<svg ${common}><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"></path></svg>`,
        night: `<svg ${common}><path d="M20.5 14.2A8.3 8.3 0 0 1 9.8 3.5 8.5 8.5 0 1 0 20.5 14.2Z"></path></svg>`,
        off: `<svg ${common} class="schedule-off-calendar-off-v61442"><path d="M7 2.5v3.5M17 2.5v3.5"></path><path d="M5 4.5h14a2 2 0 0 1 2 2v12.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2Z"></path><path d="M3 9h18"></path><path d="M8 18l8-7"></path></svg>`,
        leave: `<svg ${common}><path d="M7 3h7l4 4v14H7z"></path><path d="M14 3v5h5M10 12h5M10 16h4"></path></svg>`,
        holiday: `<svg ${common}><path d="m12 3 1.55 4.45L18 9l-4.45 1.55L12 15l-1.55-4.45L6 9l4.45-1.55L12 3Z"></path><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15ZM5 14l.7 1.8L7.5 16.5l-1.8.7L5 19l-.7-1.8-1.8-.7 1.8-.7L5 14Z"></path></svg>`,
        hour: `<svg ${common}><circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>`,
        split: `<svg ${common}><path d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5"></path><path d="M17 7l-2.5 2.5M7 17l2.5-2.5"></path></svg>`,
        unknown: `<svg ${common}><circle cx="12" cy="12" r="8"></circle><path d="M9.8 9a2.4 2.4 0 0 1 4.65.8c0 1.8-2.45 2-2.45 3.7M12 17h.01"></path></svg>`
      };
      return icons[kind] || icons.unknown;
    }

    function schedulePersonIconMetaV6136(row) {
      const shift = scheduleResolveShiftMeta(row || {});
      const code = window.tcShiftCode(
        row?.assigned_shift_code
        || row?.effective_shift_code
        || row?.auto_shift_code
        || row?.shift_code
        || shift?.code
        || ''
      );
      const dayType = String(row?.day_type || row?.calculation_day_type || '').trim().toUpperCase();
      const ruleMode = String(row?.schedule_rule_mode || row?.work_mode_code || '').trim().toUpperCase();
      const template = String(scheduleWorkTemplateCodeV6118(row) || '').trim().toUpperCase();
      const shiftMaster = state.filters.shifts.find(s => window.tcShiftCode(s.shift_code) === code);
      const assignedCodeV6141 = window.tcShiftCode(row?.assigned_shift_code || '');
      const assignedMasterV6141 = assignedCodeV6141
        ? state.filters.shifts.find(s => window.tcShiftCode(s.shift_code) === assignedCodeV6141)
        : null;
      // V6.14.8: a manually assigned WORKING shift must win over the natural
      // Saturday/Sunday/public-holiday classification. The day header can still
      // show the calendar holiday, but the label itself represents the shift
      // that will actually be worked.
      const assignedWorkingV6141 = Boolean(
        assignedCodeV6141
        && !scheduleIsNonWorkingShiftV61447(assignedCodeV6141,assignedMasterV6141)
      );
      const isLeave = Boolean(
        row?.leave_request_id
        || row?.leave_type_code
        || row?.leave_type_name
        || code === 'LV'
        || shift?.tone === 'leave'
        || dayType === 'LEAVE'
      );
      const isHoliday = Boolean(
        !assignedWorkingV6141
        && (
          row?.is_public_holiday
          || code === 'HOL'
          || shift?.tone === 'holiday'
          || ['PUBLIC_HOLIDAY','HOLIDAY'].includes(dayType)
        )
      );
      const isOff = Boolean(
        !assignedWorkingV6141
        && (
          ruleMode === 'DYNAMIC_OFF'
          || shiftMaster?.is_workday === false
          || shift?.tone === 'off'
          || ['WEEKLY_OFF','COMP_OFF','DAY_OFF'].includes(dayType)
        )
      );
      const isHour = ruleMode === 'HOUR_BASED';
      const isSplit = Boolean(
        ['SPLIT_WAIT_NIGHT','NORMAL_LATE_CUSTOMER'].includes(ruleMode)
        || template === 'SPLIT_FLEX'
        || row?.shift_2_planned_start_at
        || row?.shift_2_planned_end_at
        || row?.second_shift_code
      );

      if (isLeave) return { kind:'leave', label:'ลา', tone:'leave' };
      if (isHoliday) return { kind:'holiday', label:'วันหยุดนักขัตฤกษ์', tone:'holiday' };
      if (isOff) return { kind:'off', label:'วันหยุด', tone:'off' };
      if (isHour) return { kind:'hour', label:'กะนับชั่วโมง', tone:'hour' };
      if (isSplit) return {
        kind:'split',
        label:(ruleMode==='SPLIT_WAIT_NIGHT'||String(code||'').startsWith('SW'))?'กะเช้า + รอเข้ากะดึก':'กะปกติ + งานลูกค้าช่วงดึก',
        tone:'split'
      };
      if (shift?.tone === 'night' || window.tcIsNightShiftCode(code)) {
        return { kind:'night', label:'กะดึก', tone:'night' };
      }
      if (shift?.tone === 'day' || window.tcIsDayShiftCode(code)) {
        return { kind:'day', label:'กะเช้า', tone:'day' };
      }
      return { kind:'unknown', label:'กะทำงาน', tone:shift?.tone || 'day' };
    }

    /* V6.14.58 — Special work-mode icon colors must follow System Settings
       even when older shift-code/day-night CSS has higher/later specificity.
       Use CSS-variable-backed inline !important declarations only for the
       three special work modes; normal shift coloring remains unchanged. */
    function schedulePersonSpecialToneStyleV61458(tone) {
      const key = String(tone || '').trim().toLowerCase();
      if (key === 'split') {
        return 'background:var(--shift-split-soft,#eef0ff)!important;border-color:var(--shift-split-border,#bdc0f7)!important;color:var(--shift-split-text,#6366f1)!important;';
      }
      if (key === 'hour') {
        return 'background:var(--shift-hour-soft,#e6f7f2)!important;border-color:var(--shift-hour-border,#a8ddd4)!important;color:var(--shift-hour-text,#0f9488)!important;';
      }
      return '';
    }

    function schedulePersonSpecialIconStyleV61458(tone) {
      const key = String(tone || '').trim().toLowerCase();
      if (key === 'split') return 'color:var(--shift-split-text,#6366f1)!important;';
      if (key === 'hour') return 'color:var(--shift-hour-text,#0f9488)!important;';
      return '';
    }

    function schedulePersonIconHtmlV6136(row) {
      const meta = schedulePersonIconMetaV6136(row);
      const iconStyleV61458 = schedulePersonSpecialIconStyleV61458(meta.tone);
      return `<span class="schedule-shift-icon-v6136 icon-${safe(meta.kind)}"${iconStyleV61458 ? ` style="${iconStyleV61458}"` : ''} aria-hidden="true">${schedulePersonIconSvgV6136(meta.kind)}</span>`;
    }

    /* V6.14.59 — Special Work-Mode marker shared by every scheduling view.
       This is presentation/validation guidance only; it does not modify the
       saved shift, Work Mode, Attendance, Waiting or OT calculations. */
    function scheduleSpecialWorkModeMetaV61459(row) {
      if (!row) return null;
      const mode = String(row?.schedule_rule_mode || row?.work_mode_code || '').trim().toUpperCase();
      const template = String(scheduleWorkTemplateCodeV6118(row) || '').trim().toUpperCase();
      const code = window.tcShiftCode(
        row?.assigned_shift_code || row?.effective_shift_code || row?.generated_shift_code || row?.shift_code || ''
      );
      const secondStart = formatTime(row?.second_segment_start || row?.customer_window_start || row?.shift_2_planned_start_at);
      const secondEnd = formatTime(row?.second_segment_planned_end || row?.customer_window_end || row?.shift_2_planned_end_at);
      const firstEnd = formatTime(row?.first_segment_end || row?.shift_1_planned_end_at || (String(code||'').startsWith('SW') ? row?.shift_end_time : null));
      const shiftWindow = scheduleEffectiveShiftWindowV6133(row);
      const start = formatTime(row?.custom_start_time || shiftWindow?.start);
      const end = formatTime(row?.custom_end_time || shiftWindow?.end);
      const needsReview = String(row?.schedule_status || '').trim().toUpperCase() === 'NEED_REVIEW';
      const waiting = Number(row?.waiting_minutes || 0);
      const net = Number(row?.paid_work_minutes ?? row?.net_work_minutes ?? 0);
      const ot = Number(row?.overtime_minutes || 0);

      if (mode === 'HOUR_BASED' || /^H[56]/.test(String(code||''))) {
        const warning = needsReview || start === '-' || end === '-';
        return {
          key:'hour', tone:'hour', glyph:'◷', short:'นับชม.', label:'กะนับชั่วโมง', warning,
          tooltip:[
            'กะนับชั่วโมง',
            start !== '-' ? `เริ่ม ${start}` : null,
            end !== '-' ? `สิ้นสุด ${end}` : null,
            net > 0 ? `ชม.สุทธิ ${attendanceMinutesToHourMinuteV61457(net)}` : null,
            ot > 0 ? `OT ${attendanceMinutesToHourMinuteV61457(ot)}` : null,
            warning ? '⚠ ต้องตรวจสอบรายละเอียดเวลา' : 'รูปแบบพิเศษ • คำนวณเวลาสิ้นสุดตามชั่วโมง'
          ].filter(Boolean).join(' • ')
        };
      }

      if (mode === 'SPLIT_WAIT_NIGHT' || String(code||'').startsWith('SW')) {
        const warning = needsReview || firstEnd === '-' || secondStart === '-' || secondEnd === '-';
        return {
          key:'wait', tone:'split', glyph:'⌛', short:'รอดึก', label:'กะเช้า + รอเข้ากะดึก', warning,
          tooltip:[
            'กะเช้า + รอเข้ากะดึก',
            firstEnd !== '-' ? `ออกกะ 1 ${firstEnd}` : null,
            secondStart !== '-' ? `กลับเข้า ${secondStart}` : null,
            secondEnd !== '-' ? `กะ 2 สิ้นสุด ${secondEnd}` : null,
            waiting > 0 ? `รอ ${attendanceMinutesToHourMinuteV61457(waiting)} ชม.` : null,
            net > 0 ? `ชม.สุทธิ ${attendanceMinutesToHourMinuteV61457(net)}` : null,
            ot > 0 ? `OT ${attendanceMinutesToHourMinuteV61457(ot)}` : null,
            warning ? '⚠ ต้องตรวจสอบข้อมูลกะ 1 / ช่วงรอ / กะ 2' : 'รูปแบบพิเศษ • ช่วงรอไม่นับเป็นเวลาทำงาน'
          ].filter(Boolean).join(' • ')
        };
      }

      if (mode === 'NORMAL_LATE_CUSTOMER' || template === 'SPLIT_FLEX') {
        const warning = needsReview || secondStart === '-';
        return {
          key:'customer', tone:'split', glyph:'↗', short:'ต่อดึก', label:'กะปกติ + งานลูกค้าช่วงดึก', warning,
          tooltip:[
            'กะปกติ + งานลูกค้าช่วงดึก',
            secondStart !== '-' ? `กะ 2 เริ่ม ${secondStart}` : null,
            secondEnd !== '-' ? `กะ 2 สิ้นสุด ${secondEnd}` : 'กะ 2 สิ้นสุดตามเวลาออกจริง',
            waiting > 0 ? `รอ ${attendanceMinutesToHourMinuteV61457(waiting)} ชม.` : null,
            net > 0 ? `ชม.สุทธิ ${attendanceMinutesToHourMinuteV61457(net)}` : null,
            ot > 0 ? `OT ${attendanceMinutesToHourMinuteV61457(ot)}` : null,
            warning ? '⚠ ต้องตรวจสอบเวลาเริ่มงานลูกค้าช่วงดึก' : 'รูปแบบพิเศษ • กะที่ 2 เป็นงานช่วงดึก'
          ].filter(Boolean).join(' • ')
        };
      }
      return null;
    }

    function scheduleSpecialWorkModeBadgeHtmlV61459(row, options = {}) {
      // V6.14.60 concept reset: special Work Mode badges are intentionally not
      // rendered inside any schedule table/calendar. Raw punch evidence in
      // MONTHLY PERSONAL OVERVIEW is the Manager decision-support signal instead.
      return '';
    }

    function schedulePersonTooltipV6136(row, context = {}) {
      const meta = schedulePersonIconMetaV6136(row);
      const code = window.tcShiftCode(
        row?.assigned_shift_code
        || row?.effective_shift_code
        || row?.auto_shift_code
        || row?.shift_code
        || '-'
      );
      const windowMeta = scheduleEffectiveShiftWindowV6133(row);
      const start = formatTime(windowMeta.start);
      const end = formatTime(windowMeta.end);
      const hasTime = start !== '-' && end !== '-';
      const ruleMode = String(row?.schedule_rule_mode || row?.work_mode_code || '').trim().toUpperCase();
      const split = meta.kind === 'split';
      const customerStart = formatTime(row?.second_segment_start || row?.customer_window_start || row?.shift_2_planned_start_at);
      const customerEnd = formatTime(row?.second_segment_planned_end || row?.customer_window_end || row?.shift_2_planned_end_at);
      const leaveName = String(row?.leave_type_name || row?.leave_name || row?.leave_type_code || '').trim();
      const holidayName = String(row?.holiday_name || row?.public_holiday_name || '').trim();
      const lines = [
        `${meta.label}${code && code !== '-' ? ` • ${code}` : ''}`,
        holidayName && meta.kind === 'holiday' ? `ชื่อวันหยุด ${holidayName}` : null,
        leaveName && meta.kind === 'leave' ? `ประเภทการลา ${leaveName}` : null,
        hasTime ? `เวลาเริ่ม–สิ้นสุด ${start}–${end}` : null,
        ruleMode === 'HOUR_BASED' ? 'รูปแบบ กะนับชั่วโมง' : null,
        split && customerStart !== '-' ? `ช่วงที่ 2 ${customerStart}–${customerEnd !== '-' ? customerEnd : 'ตามเวลาออก'}` : null,
        context.statusLabel || null,
        context.patternLabel || null,
        Number(row?.waiting_minutes || 0) > 0 ? `ช่วงรอ ${attendanceMinutesToHourMinuteV61457(row.waiting_minutes)} ชม. (ไม่นับเวลาทำงาน)` : null,
        Number(row?.paid_work_minutes ?? row?.net_work_minutes ?? 0) > 0 ? `ชั่วโมงสุทธิ ${attendanceMinutesToHourMinuteV61457(row?.paid_work_minutes ?? row?.net_work_minutes ?? 0)} ชม.` : null,
        Number(row?.overtime_minutes || 0) > 0 ? `OT ${attendanceMinutesToHourMinuteV61457(row.overtime_minutes)} ชม.` : null,
        row?.comp_off_earned ? 'ได้รับวันหยุดชดเชย' : null
      ].filter(Boolean);
      return lines.join('|');
    }



    /* V6.13.7 — Compact Full-Month Fit
       Keeps all 28–31 dates visible on normal desktop widths without shrinking
       the shift icon to an unreadable size. Narrow screens keep horizontal scroll. */
    function scheduleFitPersonFullMonthV6137(period = null) {
      const workspace = $("schedulePersonWorkspace");
      const wrap = $("scheduleTableWrap");
      const table = wrap?.querySelector?.(".monthly-person-schedule-table-v61146");
      if (!workspace || !wrap || !table) return;

      const dayCount = Math.max(
        28,
        Number(period?.dates?.length || table.dataset.monthDays || table.querySelectorAll("thead th.day-col").length || 31)
      );
      const viewport = Math.floor(wrap.clientWidth || workspace.clientWidth || 0);
      if (!viewport) return;

      // Employee identity columns are intentionally compact only in full-month view.
      // Values are still available in title/tooltip and remain sticky.
      // V6.14.13: Start Date is hidden in Person View, so do not reserve its old
      // width. Reuse part of that space for the row checkbox without shrinking days.
      const fixed = viewport >= 1500
        ? { code:64, name:126, start:0, position:96 }
        : viewport >= 1250
          ? { code:60, name:110, start:0, position:88 }
          : { code:58, name:102, start:0, position:84 };

      const fixedWidth = fixed.code + fixed.name + fixed.position;
      const availableForDays = Math.max(0, viewport - fixedWidth - 4);
      const naturalDayWidth = Math.floor(availableForDays / dayCount);
      const canFitWholeMonth = naturalDayWidth >= 27;
      const dayWidth = canFitWholeMonth
        ? Math.min(36, naturalDayWidth)
        : 28;
      const iconBox = Math.max(24, Math.min(30, dayWidth - 2));
      const iconSize = Math.max(19, Math.min(24, iconBox - 5));

      table.style.setProperty('--schedule-code-col-v6137', `${fixed.code}px`);
      table.style.setProperty('--schedule-name-col-v6137', `${fixed.name}px`);
      table.style.setProperty('--schedule-start-col-v6137', `${fixed.start}px`);
      table.style.setProperty('--schedule-position-col-v6137', `${fixed.position}px`);
      table.style.setProperty('--schedule-day-col-v6137', `${dayWidth}px`);
      table.style.setProperty('--schedule-icon-box-v6137', `${iconBox}px`);
      table.style.setProperty('--schedule-icon-size-v6137', `${iconSize}px`);
      table.dataset.monthFit = canFitWholeMonth ? 'fit' : 'scroll';
      wrap.dataset.monthFit = canFitWholeMonth ? 'fit' : 'scroll';
    }

    if (!window.__schedulePersonFitResizeBoundV6137) {
      window.__schedulePersonFitResizeBoundV6137 = true;
      let resizeTimerV6137 = null;
      window.addEventListener('resize', () => {
        clearTimeout(resizeTimerV6137);
        resizeTimerV6137 = setTimeout(() => scheduleFitPersonFullMonthV6137(), 100);
      }, { passive:true });
    }

    function fillScheduleTeamFocusOptions(rows = []) {
      const select = $("scheduleTeamFocus");
      if (!select) return;
      const old = select.value || (selectedOrgIdV616M("scheduleDepartment") ? '' : val("scheduleDepartment")) || '';
      const units = [...new Set((rows || []).map(scheduleUnitLabel))].sort((a,b) => a.localeCompare(b, 'th'));
      select.innerHTML = `<option value="">ทุกทีม / ทุกหน่วยงาน</option>` + units.map(unit => `<option value="${safe(unit)}">${safe(unit)}</option>`).join('');
      if ([...select.options].some(option => option.value === old)) {
        select.value = old;
      }
    }

    const scheduleTeamDrawerState = {
      unit: '', groupKey:'',
      date: '',
      filter: 'ALL',
      rows: [],
      loading: false
    };

    function scheduleTeamAttendanceStatus(row) {
      const flags = attendancePolicyFlagsV61428(row);
      if (flags.leave) return 'LEAVE';
      if (flags.dayOff) return 'OFF';
      if (flags.upcoming) return 'UPCOMING';
      if (flags.absence) return 'ABSENCE';
      if (flags.late) return 'LATE';
      return 'NORMAL';
    }

    function scheduleTeamStatusMeta(status) {
      return ({
        NORMAL:{label:'ปกติ',tone:'normal'},
        LATE:{label:'สาย',tone:'late'},
        ABSENCE:{label:'ขาดงาน',tone:'absence'},
        OFF:{label:'หยุด',tone:'off'},
        LEAVE:{label:'ลา',tone:'leave'},
        UPCOMING:{label:'รอทำงาน',tone:'upcoming'}
      })[status] || {label:'ปกติ',tone:'normal'};
    }

    function scheduleTeamActualTime(row, side) {
      const shift2Out = row?.shift_2_actual_out_at
        || row?.actual_out_shift_2_at
        || row?.actual_out_2_at;
      const value = side === 'IN'
        ? (row?.shift_1_actual_in_at || row?.actual_in_at || row?.first_in)
        : (shift2Out || row?.shift_1_actual_out_at || row?.actual_out_at || row?.last_out);
      return formatTime(value);
    }

    function scheduleTeamSegmentActualTime(row, segmentNo, side) {
      const value = segmentNo === 2
        ? (side === 'IN'
          ? (row?.shift_2_actual_in_at || row?.actual_in_shift_2_at || row?.actual_in_2_at)
          : (row?.shift_2_actual_out_at || row?.actual_out_shift_2_at || row?.actual_out_2_at))
        : (side === 'IN'
          ? (row?.shift_1_actual_in_at || row?.actual_in_at || row?.first_in)
          : (row?.shift_1_actual_out_at || row?.actual_out_at || row?.last_out));
      return formatTime(value);
    }


    // V6.14.52 defensive UI ownership guard.
    // Backend is authoritative; this prevents an older/stale punch-meta payload from
    // visually reusing the previous work-date terminal OUT as the next date Shift-1 IN.
    function attendancePunchTimestampKeyV61452(value, fallbackDate, sourceDate = '') {
      if (value == null || value === '') return '';
      const raw = String(value).trim();
      const full = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
      if (full) return `${full[1]}T${full[2]}:${full[3]}`;
      const time = raw.match(/^(\d{1,2}):(\d{2})/);
      if (!time) return '';
      const date = String(sourceDate || fallbackDate || '').slice(0,10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
      return `${date}T${String(time[1]).padStart(2,'0')}:${time[2]}`;
    }

    function sanitizeCrossMidnightPunchOwnershipV61452(rows) {
      if (!Array.isArray(rows) || rows.length < 2) return rows;
      const groups = new Map();
      rows.forEach(row => {
        const emp = String(row?.emp_code || '').trim();
        const date = String(row?.work_date || '').slice(0,10);
        if (!emp || !date) return;
        if (!groups.has(emp)) groups.set(emp,new Map());
        groups.get(emp).set(date,row);
      });
      groups.forEach(byDate => {
        [...byDate.keys()].sort().forEach(date => {
          const row = byDate.get(date);
          const prevDate = window.TimeClockCalendarV61448.addDays(date,-1);
          const prev = byDate.get(prevDate);
          if (!prev || !row) return;

          const prevCandidates = [
            ['shift_2_actual_out_at', prev?.source_out_date],
            ['actual_out_shift_2_at', prev?.source_out_date],
            ['actual_out_2_at', prev?.source_out_date],
            ['shift_1_actual_out_at', prev?.source_out_date],
            ['actual_out_at', prev?.source_out_date],
            ['last_out', prev?.source_out_date]
          ];
          let previousTerminal = '';
          for (const [key,sourceDate] of prevCandidates) {
            const candidate = attendancePunchTimestampKeyV61452(prev?.[key],prevDate,sourceDate);
            if (candidate && candidate.slice(0,10) === date) {
              previousTerminal = candidate;
              break;
            }
          }
          if (!previousTerminal) return;

          const currentKeys = [
            'shift_1_actual_in_at','actual_in_shift_1_at','actual_in_1_at','actual_in_at','first_in'
          ];
          let removed = false;
          currentKeys.forEach(key => {
            const current = attendancePunchTimestampKeyV61452(row?.[key],date,row?.source_in_date);
            if (current && current === previousTerminal) {
              row[key] = null;
              removed = true;
            }
          });
          if (removed) {
            row.cross_midnight_ui_guard_v61452 = true;
            row.cross_midnight_removed_in_at_v61452 = previousTerminal;
          }
        });
      });
      return rows;
    }

    function scheduleTeamSegmentPlannedRange(row, segmentNo) {
      const startRaw = segmentNo === 2
        ? (row?.shift_2_planned_start_at || row?.customer_window_start)
        : (row?.shift_1_planned_start_at || row?.effective_shift_start_time || row?.shift_start_time);
      const endRaw = segmentNo === 2
        ? (row?.shift_2_planned_end_at || row?.customer_window_end)
        : (row?.shift_1_planned_end_at || row?.effective_shift_end_time || row?.shift_end_time);
      const start = formatTime(startRaw);
      const end = formatTime(endRaw);
      if (segmentNo === 2 && start !== '-' && !endRaw) return `${start}–ตามเวลาออก`;
      if (start === '-' && end === '-') return '-';
      return `${start}–${end}`;
    }

    function scheduleTeamPlannedTime(row) {
      const meta = scheduleResolveShiftMeta(row);
      if (!meta.isWorking) return meta.label;
      return meta.label || '-';
    }

    function schedulePersonSecondShiftCodeV61147(row) {
      const explicit = String(
        row?.shift_2_code
        || row?.shift_2_shift_code
        || row?.second_shift_code
        || row?.customer_shift_code
        || row?.effective_shift_2_code
        || ''
      ).trim().toUpperCase();

      if (explicit) return explicit;

      const segmentStart = formatTime(
        row?.shift_2_planned_start_at
        || row?.customer_window_start
      );
      const segmentEndRaw =
        row?.shift_2_planned_end_at
        || row?.customer_window_end;
      const segmentEnd = formatTime(segmentEndRaw);

      const pattern = String(
        row?.pattern_code
        || ''
      ).trim().toUpperCase();

      const shifts = Array.isArray(state?.filters?.shifts)
        ? state.filters.shifts
        : [];

      const candidates = shifts.filter(shift => {
        if (!shift || shift.is_active === false || shift.is_workday === false) {
          return false;
        }

        const patterns = Array.isArray(shift.applicable_pattern_codes)
          ? shift.applicable_pattern_codes
              .map(value => String(value || '').trim().toUpperCase())
              .filter(Boolean)
          : [];

        if (pattern && patterns.length && !patterns.includes(pattern)) {
          return false;
        }

        return true;
      });

      // Exact time match is the strongest signal.
      const exact = candidates.find(shift => {
        const start = formatTime(shift?.start_time);
        const end = formatTime(shift?.end_time);
        if (segmentStart === '-' || start !== segmentStart) return false;
        if (segmentEndRaw && segmentEnd !== '-' && end !== segmentEnd) return false;
        return true;
      });

      if (exact?.shift_code) {
        return String(exact.shift_code).trim().toUpperCase();
      }

      // SPLIT_FLEX second segment is the late/customer-work segment.
      // Use the configured night shift for the same work pattern when the
      // customer interval does not exactly match Shift Master times.
      const night = candidates
        .filter(shift => {
          const code = String(shift?.shift_code || '').trim().toUpperCase();
          const name = String(shift?.shift_name || '').trim().toLowerCase();
          return shift?.is_night_shift === true
            || window.tcIsNightShiftCode(code)
            || name.includes('กลางคืน')
            || name.includes('กะดึก');
        })
        .sort((a,b) =>
          Number(a?.display_order || 0) - Number(b?.display_order || 0)
        )[0];

      if (night?.shift_code) {
        return String(night.shift_code).trim().toUpperCase();
      }

      const primaryCode = window.tcShiftCode(
        row?.effective_shift_code
        || row?.assigned_shift_code
        || row?.shift_code
        || row?.auto_shift_code
        || ''
      );

      // Night shift must stay inside the employee's work pattern pair.
      if (pattern === 'TECH_6D' || primaryCode === 'S043' || primaryCode === 'S135') {
        return 'S135';
      }
      return 'S134';
    }


    const timeCertificationStateV61139 = {
      row: null,
      source: '',
      reasons: null,
      reasonLoadedAt: 0,
      actualOutLimit: null,
      shift1Only: false
    };

    function timeCertificationRoleV61139() {
      return String(state.profile?._realRole || state.profile?.role || '').trim().toUpperCase();
    }

    function timeCertificationCanActV61139(empCode) {
      const currentRole = timeCertificationRoleV61139();
      if (!['HR_ADMIN','MANAGER'].includes(currentRole)) return false;
      if (currentRole === 'MANAGER' && scheduleManagerOwnEmployee(empCode)) return false;
      return true;
    }

    function timeCertificationActiveV61139(row) {
      return String(row?.certification_status || '').trim().toUpperCase() === 'CERTIFIED'
        && Boolean(row?.certified_start_at && row?.certified_end_at);
    }

    function timeCertificationStaleV61144(row) {
      return String(row?.certification_status || '').trim().toUpperCase() === 'STALE';
    }

    function timeCertificationPeriodManagerClosedV61144(period) {
      if (!period?.configured) return false;
      return period?.can_certify_attendance === false
        || period?.certification_open === false
        || period?.certification_deadline_passed === true
        || ['CLOSED_MANUAL','CLOSED_DEADLINE'].includes(
          String(period?.certification_status || '').trim().toUpperCase()
        );
    }

    function timeCertificationPeriodDueSoonV61144(period) {
      return String(period?.certification_status || '').trim().toUpperCase() === 'DUE_SOON';
    }

    function timeCertificationHasSecondShiftV61145(row) {
      return Number(row?.paid_segment_count || 0) > 1
        || Boolean(
          row?.shift_2_planned_start_at
          || row?.shift_2_planned_end_at
          || row?.shift_2_actual_in_at
          || row?.shift_2_actual_out_at
        )
        || scheduleWorkTemplateCodeV6118(row) === 'SPLIT_FLEX';
    }

    function timeCertificationRangeTextV61145(row) {
      const start = timeCertificationTimeV61139(row?.certified_start_at);
      const end = timeCertificationTimeV61139(row?.certified_end_at);
      if (!start || !end) return '';

      const startDate = timeCertificationIsoDateV61139(
        row?.certified_start_at,
        String(row?.work_date || '').slice(0,10)
      );
      const endDate = timeCertificationIsoDateV61139(
        row?.certified_end_at,
        startDate
      );

      let suffix = '';
      if (startDate && endDate && endDate > startDate) {
        const days = Math.max(
          1,
          Math.round(
            (
              new Date(`${endDate}T00:00:00`).getTime()
              - new Date(`${startDate}T00:00:00`).getTime()
            ) / 86400000
          )
        );
        suffix = ` +${days}`;
      }
      return `${start}–${end}${suffix}`;
    }

    function timeCertificationShift1ActualOutV61145(row, workDate, shiftStartTime) {
      const hasSecondShift = timeCertificationHasSecondShiftV61145(row);
      const raw = row?.shift_1_actual_out_at
        || (!hasSecondShift ? (row?.actual_out_at || row?.last_out) : null);

      const time = timeCertificationTimeV61139(raw);
      if (!time) return null;

      let date = timeCertificationIsoDateV61139(raw, workDate);
      const outMin = attendanceClockMinutes(time);
      const startMin = attendanceClockMinutes(shiftStartTime);

      // For time-only night-shift values, infer next day from the shift start.
      if (
        date === workDate
        && outMin != null
        && startMin != null
        && outMin <= startMin
      ) {
        date = addCalendarDaysISO(workDate,1);
      }

      const ms = timeCertificationDateTimeMsV61139(date,time);
      if (ms == null) return null;
      return { raw, date, time, ms };
    }

    function updateTimeCertificationActualOutLimitV61145() {
      const limit = timeCertificationStateV61139.actualOutLimit;
      const endDate = $('timeCertificationEndDate');
      const endTime = $('timeCertificationEndTime');
      const hint = $('timeCertificationEndLimitHint');
      if (!endDate || !endTime) return;

      endDate.removeAttribute('max');
      endTime.removeAttribute('max');
      endDate.setCustomValidity('');
      endTime.setCustomValidity('');

      if (!limit) {
        if (hint) {
          hint.className = 'time-cert-end-limit-v61145 no-limit';
          hint.textContent = 'ไม่พบเวลาออกจริง • สามารถระบุเวลาสิ้นสุดรับรองได้';
        }
        updateTimeCertificationDurationV61139();
        return;
      }

      endDate.max = limit.date;
      if (endDate.value === limit.date) endTime.max = limit.time;

      const selectedMs = timeCertificationDateTimeMsV61139(
        endDate.value,
        endTime.value
      );
      const exceeded = selectedMs != null && selectedMs > limit.ms;

      if (exceeded) {
        endDate.setCustomValidity('เวลาสิ้นสุดรับรองเกินเวลาออกจริง');
        endTime.setCustomValidity('เวลาสิ้นสุดรับรองเกินเวลาออกจริง');
      }

      if (hint) {
        hint.className = `time-cert-end-limit-v61145 ${exceeded ? 'exceeded' : 'limited'}`;
        hint.textContent = exceeded
          ? `เกินเวลาออกจริง ${limit.time} • กรุณาปรับเวลาสิ้นสุด`
          : `สูงสุดตามเวลาออกจริง ${limit.time}${limit.date > String(timeCertificationStateV61139.row?.work_date || '').slice(0,10) ? ' • วันถัดไป' : ''}`;
      }

      updateTimeCertificationDurationV61139();
    }

    function timeCertificationBadgeV61139(row) {
      const status = String(row?.certification_status || '').trim().toUpperCase();
      if (status === 'CERTIFIED' && row?.certified_start_at && row?.certified_end_at) {
        const range = timeCertificationRangeTextV61145(row);
        return `<span class="time-cert-badge-v61139 certified"><b>✓ รับรองแล้ว</b>${range ? `<em>${safe(range)}</em>` : ''}</span>`;
      }
      if (status === 'STALE') {
        const oldRange = timeCertificationRangeTextV61145(row);
        return `<span class="time-cert-badge-v61139 stale"><b>! ต้องรับรองใหม่</b>${oldRange ? `<em>เดิม ${safe(oldRange)}</em>` : ''}</span>`;
      }
      if (status === 'REVOKED') return '<span class="time-cert-badge-v61139 revoked">ยกเลิกการรับรอง</span>';
      return '';
    }

    function timeCertificationBlockedReasonV61143(row) {
      if (!row) return 'NO_ROW';

      const workDate = String(row?.work_date || '').slice(0,10);
      if (!workDate) return 'NO_DATE';

      // Certification is allowed only for today or a past work date.
      // The certified end datetime may still cross to the next day for a night shift.
      if (workDate > todayISO()) return 'FUTURE';

      const dayType = String(row?.day_type || '').trim().toUpperCase();
      const rawStatus = String(
        row?.display_status
        || row?.attendance_result
        || row?.attendance_status
        || row?.calculation_status
        || ''
      ).trim().toUpperCase();

      const shiftMeta = scheduleResolveShiftMeta(row);

      const assignedShiftCode = String(
        row?.assigned_shift_code
        || ''
      ).trim().toUpperCase();

      const shiftCode = String(
        shiftMeta?.code
        || assignedShiftCode
        || row?.effective_shift_code
        || row?.shift_code
        || row?.auto_shift_code
        || ''
      ).trim().toUpperCase();

      // Explicit OFF/HOL/LV always wins. This check intentionally runs before
      // natural-holiday workday override logic.
      if (
        assignedShiftCode === 'LV'
        || shiftCode === 'LV'
        || attendanceDisplayStatus(row) === 'LEAVE'
        || Boolean(row?.leave_request_id || row?.leave_type_code)
        || dayType === 'LEAVE'
        || rawStatus.includes('LEAVE')
      ) {
        return 'LEAVE';
      }

      if (
        ['OFF','HOL'].includes(assignedShiftCode)
        || ['OFF','HOL'].includes(shiftCode)
        || ['off','holiday'].includes(
          String(shiftMeta?.tone || '').toLowerCase()
        )
      ) {
        return 'OFF';
      }

      const workingShiftOverride =
        attendanceHasWorkingShiftOverrideV61155(row);

      // Natural weekly off / public holiday is certifiable when a real
      // working shift was explicitly/effectively assigned for that date.
      if (
        !workingShiftOverride
        && (
          attendanceDisplayStatus(row) === 'DAY_OFF'
          || Boolean(row?.is_weekly_off || row?.is_public_holiday)
          || ['WEEKLY_OFF','COMP_OFF','DAY_OFF','HOLIDAY','PUBLIC_HOLIDAY'].includes(dayType)
        )
      ) {
        return 'OFF';
      }

      // Missing IN, missing OUT, or both missing are intentionally allowed.
      return '';
    }

    function timeCertificationButtonV61139(row, source) {
      const empCode = String(row?.emp_code || '').trim();
      const workDate = String(row?.work_date || '').slice(0,10);
      if (!empCode || !workDate || !timeCertificationCanActV61139(empCode)) return '';

      if (timeCertificationBlockedReasonV61143(row)) return '';

      const active = timeCertificationActiveV61139(row);
      const stale = timeCertificationStaleV61144(row);
      const stateClass = active ? 'is-certified' : stale ? 'is-stale' : '';
      const icon = active ? '✓' : stale ? '↻' : '◷';
      const label = active ? 'ดูการรับรอง' : stale ? 'รับรองใหม่' : 'รับรองเวลา';
      const compactMonth = String(source || '').trim().toLowerCase() === 'employee-month';

      if (compactMonth) {
        const aria = active
          ? 'ดูหรือแก้ไขการรับรองเวลา'
          : stale
            ? 'รับรองเวลาใหม่'
            : 'รับรองเวลา';
        return `<button type="button" class="time-cert-action-v61139 time-cert-icon-v61148 ${stateClass}" data-time-certify data-cert-source="${safe(source || '')}" data-emp="${safe(empCode)}" data-date="${safe(workDate)}" data-cert-state="${active ? 'CERTIFIED' : stale ? 'STALE' : 'NONE'}" title="${safe(aria)}" aria-label="${safe(aria)}"><span aria-hidden="true">${icon}</span></button>`;
      }

      return `<button type="button" class="time-cert-action-v61139 ${stateClass}" data-time-certify data-cert-source="${safe(source || '')}" data-emp="${safe(empCode)}" data-date="${safe(workDate)}" data-cert-state="${active ? 'CERTIFIED' : stale ? 'STALE' : 'NONE'}"><span>${icon}</span>${label}</button>`;
    }

    function timeCertificationIsoDateV61139(value, fallback = '') {
      const text = String(value || '');
      if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0,10);
      return fallback;
    }

    function timeCertificationTimeV61139(value) {
      const text = String(value || '');
      if (!text) return '';
      if (text.includes('T')) return text.slice(11,16);
      const match = text.match(/(\d{2}):(\d{2})/);
      return match ? `${match[1]}:${match[2]}` : '';
    }

    function timeCertificationDateTimeLocalV61139(date, time) {
      if (!date || !time) return '';
      return `${date}T${time}:00`;
    }

    function timeCertificationDateTimeMsV61139(date, time) {
      const value = timeCertificationDateTimeLocalV61139(date, time);
      const ms = value ? new Date(value).getTime() : NaN;
      return Number.isFinite(ms) ? ms : null;
    }

    async function loadTimeCertificationReasonsV61139(force = false) {
      if (!state.client) return [];
      if (!force && Array.isArray(timeCertificationStateV61139.reasons) && Date.now() - timeCertificationStateV61139.reasonLoadedAt < 120000) {
        return timeCertificationStateV61139.reasons;
      }
      const { data, error } = await state.client.rpc('ta_list_time_certification_reasons_v61139', { p_include_inactive: false });
      if (error) throw error;
      timeCertificationStateV61139.reasons = Array.isArray(data) ? data : [];
      timeCertificationStateV61139.reasonLoadedAt = Date.now();
      return timeCertificationStateV61139.reasons;
    }

    function renderTimeCertificationReasonOptionsV61139(reasons, selected = '') {
      const select = $('timeCertificationReason');
      if (!select) return;
      const current = String(selected || select.value || '').trim().toUpperCase();
      const query = String(val('timeCertificationReasonSearch') || '').trim().toLowerCase();
      const visible = (reasons || []).filter(reason => {
        const code = String(reason.reason_code || '').trim().toUpperCase();
        const text = `${code} ${String(reason.reason_name || '')}`.toLowerCase();
        return !query || text.includes(query) || code === current;
      });
      select.innerHTML = `<option value="">เลือกเหตุผลการรับรองเวลา${query ? ` • พบ ${visible.length}` : ''}</option>` + visible.map(reason => `<option value="${safe(reason.reason_code)}" ${current === String(reason.reason_code || '').toUpperCase() ? 'selected' : ''}>${safe(reason.reason_code)} · ${safe(reason.reason_name)}</option>`).join('');
      if (current && visible.some(reason => String(reason.reason_code || '').toUpperCase() === current)) select.value = current;
      updateTimeCertificationNoteRuleV61139();
    }

    function updateTimeCertificationNoteRuleV61139() {
      const code = String(val('timeCertificationReason') || '').trim().toUpperCase();
      const reason = (timeCertificationStateV61139.reasons || []).find(item => String(item.reason_code || '').toUpperCase() === code);
      const required = Boolean(reason?.requires_note);
      const marker = $('timeCertificationNoteRequired');
      if (marker) marker.textContent = required ? '• จำเป็น' : '• ไม่บังคับ';
      $('timeCertificationNote')?.classList.toggle('is-required', required);
    }

    function updateTimeCertificationDurationV61139() {
      const startDate = val('timeCertificationStartDate');
      const startTime = val('timeCertificationStartTime');
      const endDate = val('timeCertificationEndDate');
      const endTime = val('timeCertificationEndTime');
      const startMs = timeCertificationDateTimeMsV61139(startDate,startTime);
      const endMs = timeCertificationDateTimeMsV61139(endDate,endTime);
      const box = $('timeCertificationDuration');
      if (!box) return;
      if (startMs == null || endMs == null || endMs <= startMs) {
        box.className = 'time-cert-duration-v61139 invalid';
        box.innerHTML = '<span>!</span><b>ตรวจสอบช่วงเวลารับรอง</b>';
        return;
      }
      const mins = Math.round((endMs - startMs) / 60000);
      const nextDay = endDate > startDate;
      box.className = 'time-cert-duration-v61139 valid';
      box.innerHTML = `<span>✓</span><b>${safe(minutesToHours(mins))}</b><small>${nextDay ? `สิ้นสุดวันถัดไป +${Math.max(1,Math.round((new Date(endDate)-new Date(startDate))/86400000))} วัน` : 'ภายในวันเดียวกัน'}</small>`;
    }

    async function timeCertificationPeriodMetaV61139(workDate) {
      try {
        return await window.TimeClockSystemPeriods?.getForDate?.(
          String(workDate || '').slice(0,10),
          true
        ) || null;
      } catch (_) {
        return null;
      }
    }

    async function openTimeCertificationModalV61139(row, source = '') {
      if (!row) return;
      const empCode = String(row.emp_code || '').trim();
      const workDate = String(row.work_date || '').slice(0,10);
      if (!empCode || !workDate) return;
      if (!timeCertificationCanActV61139(empCode)) {
        return toast('บัญชีนี้ไม่มีสิทธิ์รับรองเวลาของพนักงานรายนี้','error');
      }

      const blockedReasonV61143 = timeCertificationBlockedReasonV61143(row);
      if (blockedReasonV61143 === 'FUTURE') {
        return toast('รับรองเวลาได้เฉพาะวันที่ปัจจุบันและย้อนหลังเท่านั้น','error');
      }
      if (blockedReasonV61143 === 'LEAVE') {
        return toast('วันลาไม่สามารถรับรองเวลาได้','error');
      }
      if (blockedReasonV61143 === 'OFF') {
        return toast('วันหยุด / กะ OFF ไม่สามารถรับรองเวลาได้','error');
      }

      const shiftStartRaw = row.shift_1_planned_start_at || row.effective_shift_start_time || row.shift_start_time;
      const shiftEndRaw = row.shift_1_planned_end_at || row.effective_shift_end_time || row.shift_end_time;
      const shiftStartTime = timeCertificationTimeV61139(shiftStartRaw);
      const shiftEndTime = timeCertificationTimeV61139(shiftEndRaw);
      if (!shiftStartTime || !shiftEndTime) {
        return toast('ไม่พบเวลาเริ่ม/สิ้นสุดกะ กรุณากำหนดหรือประมวลผลกะก่อนรับรองเวลา','error');
      }

      const shiftStartDate = timeCertificationIsoDateV61139(shiftStartRaw, workDate);
      let shiftEndDate = timeCertificationIsoDateV61139(shiftEndRaw, workDate);
      if (shiftEndDate === workDate) {
        const startMin = attendanceClockMinutes(shiftStartTime);
        const endMin = attendanceClockMinutes(shiftEndTime);
        if (startMin != null && endMin != null && endMin <= startMin) {
          shiftEndDate = addCalendarDaysISO(workDate,1);
        }
      }

      timeCertificationStateV61139.row = { ...row };
      timeCertificationStateV61139.source = source;
      setVal('timeCertificationEmpCode', empCode);
      setVal('timeCertificationWorkDate', workDate);
      setVal('timeCertificationStartDate', workDate);

      const rawIn = scheduleTeamSegmentActualTime(row,1,'IN');
      const rawOut = scheduleTeamSegmentActualTime(row,1,'OUT');
      const active = timeCertificationActiveV61139(row);
      const attendanceFlagsV61428 = attendancePolicyFlagsV61428(row);
      const late = attendanceFlagsV61428.late || attendanceFlagsV61428.absenceByLate;
      const missingIn = rawIn === '-';
      const missingOut = rawOut === '-';
      const hasSecondShift = timeCertificationHasSecondShiftV61145(row);
      const actualOutLimit = timeCertificationShift1ActualOutV61145(
        row,
        workDate,
        shiftStartTime
      );

      timeCertificationStateV61139.shift1Only = hasSecondShift;
      timeCertificationStateV61139.actualOutLimit = actualOutLimit;

      let defaultStartTime = active ? timeCertificationTimeV61139(row.certified_start_at) : '';
      if (!defaultStartTime) {
        defaultStartTime = (late || missingIn) ? shiftStartTime : (timeCertificationTimeV61139(row.shift_1_actual_in_at || row.actual_in_at || row.first_in) || shiftStartTime);
        const shiftStartMin = attendanceClockMinutes(shiftStartTime);
        const candidateMin = attendanceClockMinutes(defaultStartTime);
        if (shiftStartMin != null && candidateMin != null && candidateMin < shiftStartMin) defaultStartTime = shiftStartTime;
      }
      let defaultEndDate = active ? timeCertificationIsoDateV61139(row.certified_end_at, shiftEndDate) : shiftEndDate;
      let defaultEndTime = active ? timeCertificationTimeV61139(row.certified_end_at) : '';

      if (!defaultEndTime) {
        if (actualOutLimit) {
          defaultEndDate = actualOutLimit.date;
          defaultEndTime = actualOutLimit.time;
        } else {
          defaultEndDate = shiftEndDate;
          defaultEndTime = shiftEndTime;
        }
      }

      // New business rule: if a real Shift-1 OUT exists, certification cannot
      // end later than that punch. Keep legacy display intact until the user
      // edits/saves, but new entries default exactly to the real OUT.
      if (!active && actualOutLimit) {
        defaultEndDate = actualOutLimit.date;
        defaultEndTime = actualOutLimit.time;
      }

      setVal('timeCertificationStartTime', defaultStartTime);
      setVal('timeCertificationEndDate', defaultEndDate);
      setVal('timeCertificationEndTime', defaultEndTime);
      setVal('timeCertificationNote', row.certification_note || '');
      setVal('timeCertificationReasonSearch', '');
      setVal('timeCertificationApprover', state.profile?.display_name || state.profile?.email || state.user?.email || '-');

      const staleCertification = timeCertificationStaleV61144(row);
      setText(
        'timeCertificationTitle',
        active
          ? 'รายละเอียด / แก้ไขการรับรองเวลา'
          : staleCertification
            ? 'รับรองเวลาใหม่'
            : 'รับรองเวลาทำงาน'
      );
      setText('timeCertificationSubtitle', `${row.full_name || empCode} • ${formatDate(workDate)}`);
      $('timeCertificationContext').innerHTML = `<div><span>พนักงาน</span><strong>${safe(row.full_name || empCode)}</strong><small>${safe(empCode)}${row.position_name ? ` • ${safe(row.position_name)}` : ''}</small></div><div><span>วันที่</span><strong>${safe(formatDate(workDate))}</strong><small>${safe(row.department || '')}</small></div><div><span>${hasSecondShift ? 'กะที่รับรอง' : 'กะ'}</span><strong>${safe(row.effective_shift_code || row.assigned_shift_code || row.shift_code || '-')}</strong><small>${safe(shiftStartTime)}–${safe(shiftEndTime)}${shiftEndDate > workDate ? ' • +1 วัน' : ''}${hasSecondShift ? ' • กะที่ 1 เท่านั้น' : ''}</small></div>`;
      $('timeCertificationFacts').innerHTML = `<div><span>เวลาเข้า กะ 1 (จริง)</span><strong>${safe(rawIn)}</strong></div><div><span>เวลาออก กะ 1 (จริง)</span><strong>${safe(rawOut)}</strong></div><div><span>สถานะ Attendance</span><strong>${safe(employeeMonthStatusMetaV61121(row,workDate).label || attendanceDisplayLabel(row))}</strong></div><div><span>${hasSecondShift ? 'ขอบเขตการรับรอง' : 'กะมาตรฐาน'}</span><strong>${safe(hasSecondShift ? 'เฉพาะกะที่ 1' : `${shiftStartTime}–${shiftEndTime}`)}</strong>${hasSecondShift ? '<small>กะที่ 2 ใช้ Punch จริง ไม่ถูกแก้ไข</small>' : ''}</div>`;

      $('timeCertificationExisting')?.classList.toggle('hidden', !active && String(row.certification_status || '').toUpperCase() !== 'STALE');
      if ($('timeCertificationExisting')) {
        const oldCertifiedStart = timeCertificationTimeV61139(row.certified_start_at) || '-';
        const oldCertifiedEnd = timeCertificationTimeV61139(row.certified_end_at) || '-';
        const oldShiftStart = timeCertificationTimeV61139(row.certification_shift_start_at) || '-';
        const oldShiftEnd = timeCertificationTimeV61139(row.certification_shift_end_at) || '-';
        $('timeCertificationExisting').innerHTML = active
          ? `<span>✓</span><div><strong>รับรองแล้ว</strong><small>${safe(row.certification_reason_code || '-')} · ${safe(row.certification_reason_name || 'ไม่ระบุเหตุผล')} • ${safe(formatDateTime(row.certified_at || ''))}</small></div>`
          : `<span>!</span><div><strong>กะมีการเปลี่ยนแปลงหลังการรับรองครั้งล่าสุด</strong><small>การรับรองเดิม ${safe(oldCertifiedStart)}–${safe(oldCertifiedEnd)} • กะเดิม ${safe(row.certification_shift_code || '-')} ${safe(oldShiftStart)}–${safe(oldShiftEnd)} • กรุณาตรวจสอบกะปัจจุบันและรับรองใหม่</small></div>`;
      }
      $('timeCertificationRevokeBtn')?.classList.toggle('hidden', !active);

      try {
        const reasons = await loadTimeCertificationReasonsV61139();
        renderTimeCertificationReasonOptionsV61139(reasons, row.certification_reason_code || '');
      } catch (error) {
        renderTimeCertificationReasonOptionsV61139([], '');
        toast(humanError(error),'error');
      }

      const period = await timeCertificationPeriodMetaV61139(workDate);
      const currentRole = timeCertificationRoleV61139();
      const managerPeriodClosed = timeCertificationPeriodManagerClosedV61144(period);
      const closedForManager = currentRole === 'MANAGER' && managerPeriodClosed;
      const hrOverride = currentRole === 'HR_ADMIN' && managerPeriodClosed;
      const dueSoon = timeCertificationPeriodDueSoonV61144(period);
      const saveBtn = $('timeCertificationSaveBtn');

      if (saveBtn) {
        saveBtn.disabled = Boolean(closedForManager);
        saveBtn.classList.toggle('is-hr-override-v61144', hrOverride);
        saveBtn.classList.toggle('is-period-due-v61144', !closedForManager && dueSoon);
        saveBtn.textContent = closedForManager
          ? '🔒 ปิดรอบรับรองเวลา'
          : staleCertification
            ? '↻ บันทึกรับรองใหม่'
            : '✓ บันทึกการรับรอง';
      }

      if ($('timeCertificationRevokeBtn')) {
        $('timeCertificationRevokeBtn').disabled = Boolean(closedForManager);
      }

      const rule = $('timeCertificationRule');
      if (rule) {
        const deadline = period?.attendance_certify_deadline
          ? formatDate(period.attendance_certify_deadline)
          : '';
        rule.classList.toggle('is-closed', Boolean(closedForManager));
        rule.classList.toggle('is-override-v61144', Boolean(hrOverride));
        rule.classList.toggle('is-due-v61144', Boolean(!closedForManager && dueSoon));

        rule.querySelector('small').textContent = closedForManager
          ? `รอบรับรองเวลาปิดสำหรับ Manager${deadline ? ` • Deadline ${deadline}` : ''}`
          : hrOverride
            ? `รอบรับรองเวลาปิดสำหรับ Manager${deadline ? ` • Deadline ${deadline}` : ''} • HR Admin Override`
            : dueSoon
              ? `รอบรับรองเวลาใกล้ครบกำหนด${deadline ? ` • Deadline ${deadline}` : ''} • เวลาเริ่มต้องไม่ก่อน ${shiftStartTime}`
              : actualOutLimit
                ? `${hasSecondShift ? 'รับรองเฉพาะกะที่ 1 • ' : ''}เวลาเริ่มต้องไม่ก่อน ${shiftStartTime} • เวลาสิ้นสุดรับรองสูงสุดตามเวลาออกจริง ${actualOutLimit.time}`
                : `${hasSecondShift ? 'รับรองเฉพาะกะที่ 1 • ' : ''}เวลาเริ่มรับรองต้องไม่ก่อนเวลาเริ่มกะ (${shiftStartTime}) • ไม่พบเวลาออกจริง จึงสามารถระบุเวลาสิ้นสุดรับรองได้`;
      }

      updateTimeCertificationActualOutLimitV61145();

      // V6.11.40 — explicit modal stack state.
      // Time Certification can be opened from Team Daily Detail or Monthly Personal Overview,
      // both of which already use their own overlay layers.
      document.body.classList.add('time-certification-modal-open-v61140');

      $('timeCertificationModal')?.classList.remove('hidden');
      $('timeCertificationModal')?.setAttribute('aria-hidden','false');

      // Keep focus inside the top-most workflow.
      requestAnimationFrame(() => {
        $('timeCertificationStartTime')?.focus({ preventScroll: true });
      });
    }

    function closeTimeCertificationModalV61139() {
      $('timeCertificationModal')?.classList.add('hidden');
      $('timeCertificationModal')?.setAttribute('aria-hidden','true');
      document.body.classList.remove('time-certification-modal-open-v61140');
      timeCertificationStateV61139.row = null;
      timeCertificationStateV61139.source = '';
      timeCertificationStateV61139.actualOutLimit = null;
      timeCertificationStateV61139.shift1Only = false;
      const atomicCtxV61510 = window.TimeClockEmployeeRequestAtomicV61510;
      if (atomicCtxV61510?.type === 'TIME_ISSUE') {
        window.TimeClockEmployeeRequestAtomicV61510 = null;
      }
    }

    async function refreshTimeCertificationSourceV61139(empCode, workDate, source) {
      // V6.14.15: one refresh path for Attendance Detail, Monthly Personal,
      // TEAM DAILY DETAIL and TIME VIEW.
      return refreshCertificationViewsV61415(empCode, workDate, source);
    }

    async function saveTimeCertificationV61139() {
      const row = timeCertificationStateV61139.row;
      if (!row) return;
      const empCode = val('timeCertificationEmpCode');
      const workDate = val('timeCertificationWorkDate');
      const startDate = val('timeCertificationStartDate');
      const startTime = val('timeCertificationStartTime');
      const endDate = val('timeCertificationEndDate');
      const endTime = val('timeCertificationEndTime');
      const reasonCode = String(val('timeCertificationReason') || '').trim().toUpperCase();
      const note = String(val('timeCertificationNote') || '').trim();
      if (!startTime || !endDate || !endTime || !reasonCode) return toast('กรุณาระบุช่วงเวลาและเหตุผลการรับรองให้ครบ','error');
      const reason = (timeCertificationStateV61139.reasons || []).find(x => String(x.reason_code || '').toUpperCase() === reasonCode);
      if (reason?.requires_note && !note) return toast('เหตุผลนี้ต้องระบุหมายเหตุเพิ่มเติม','error');

      const blockedReasonV61143 = timeCertificationBlockedReasonV61143(row);
      if (blockedReasonV61143 === 'FUTURE') return toast('รับรองเวลาได้เฉพาะวันที่ปัจจุบันและย้อนหลังเท่านั้น','error');
      if (blockedReasonV61143 === 'LEAVE') return toast('วันลาไม่สามารถรับรองเวลาได้','error');
      if (blockedReasonV61143 === 'OFF') return toast('วันหยุด / กะ OFF ไม่สามารถรับรองเวลาได้','error');

      const startMs = timeCertificationDateTimeMsV61139(startDate,startTime);
      const endMs = timeCertificationDateTimeMsV61139(endDate,endTime);
      if (startMs == null || endMs == null || endMs <= startMs) return toast('เวลาสิ้นสุดรับรองต้องมากกว่าเวลาเริ่มรับรอง','error');

      const shiftStartTime = timeCertificationTimeV61139(row.shift_1_planned_start_at || row.effective_shift_start_time || row.shift_start_time);
      const shiftStartMs = timeCertificationDateTimeMsV61139(workDate,shiftStartTime);
      if (shiftStartMs != null && startMs < shiftStartMs) return toast(`เวลาเริ่มรับรองต้องไม่ก่อนเวลาเริ่มกะ ${shiftStartTime}`,'error');

      const actualOutLimit = timeCertificationStateV61139.actualOutLimit
        || timeCertificationShift1ActualOutV61145(row,workDate,shiftStartTime);
      if (actualOutLimit && endMs > actualOutLimit.ms) {
        return toast(`เวลาสิ้นสุดรับรองต้องไม่เกินเวลาออกจริง ${actualOutLimit.time}`,'error');
      }

      const source = timeCertificationStateV61139.source;
      try {
        showLoading('กำลังบันทึกและประมวลผล Attendance...');
        const atomicCtxV61510 = window.TimeClockEmployeeRequestAtomicV61510;
        const atomicRequestV61510 = Boolean(
          atomicCtxV61510
          && atomicCtxV61510.type === 'TIME_ISSUE'
          && String(atomicCtxV61510.empCode || '') === String(empCode || '')
          && String(atomicCtxV61510.workDate || '').slice(0,10) === String(workDate || '').slice(0,10)
        );

        let rpcResultV61510 = null;
        if (atomicRequestV61510) {
          const { data, error } = await state.client.rpc('ta_apply_employee_request_v61510', {
            p_request_id: atomicCtxV61510.requestId,
            p_action: {
              certified_start_at: timeCertificationDateTimeLocalV61139(startDate,startTime),
              certified_end_at: timeCertificationDateTimeLocalV61139(endDate,endTime),
              reason_code: reasonCode,
              note: note || null
            },
            p_note: note || atomicCtxV61510.requestReason || null
          });
          if (error) throw error;
          rpcResultV61510 = data;
          if (data?.applied === false) {
            throw new Error(data?.message || 'EMPLOYEE_REQUEST_ATOMIC_APPLY_NOT_COMPLETED');
          }
        } else {
          const { data, error } = await state.client.rpc('ta_save_time_certification_v61139', {
            p_emp_code: empCode,
            p_work_date: workDate,
            p_certified_start_at: timeCertificationDateTimeLocalV61139(startDate,startTime),
            p_certified_end_at: timeCertificationDateTimeLocalV61139(endDate,endTime),
            p_reason_code: reasonCode,
            p_note: note || null
          });
          if (error) throw error;
          rpcResultV61510 = data;
        }

        const atomicRequestIdV61510 = atomicRequestV61510 ? atomicCtxV61510.requestId : null;
        closeTimeCertificationModalV61139();
        toast(
          atomicRequestV61510
            ? 'รับรองเวลาและปิดคำขอเรียบร้อย • ทำรายการใน Transaction เดียว'
            : 'บันทึกรับรองเวลาและประมวลผล Attendance เรียบร้อย',
          'success'
        );
        await refreshTimeCertificationSourceV61139(empCode,workDate,source);
        document.dispatchEvent(new CustomEvent('timeclock:time-certification-saved-v61481', {
          detail: {
            empCode, workDate, source,
            atomicRequestApplied: atomicRequestV61510,
            requestId: atomicRequestIdV61510,
            atomicResult: rpcResultV61510
          }
        }));
      } catch (error) {
        toast(humanError(error),'error');
      } finally { hideLoading(); }
    }

    async function revokeTimeCertificationV61139() {
      const row = timeCertificationStateV61139.row;
      if (!row) return;
      const confirmed = await window.TimeClockModal?.confirm?.({ title:'ยกเลิกการรับรองเวลา', message:'ระบบจะยกเลิกเวลาที่รับรองและคำนวณ Attendance กลับจากข้อมูล Punch จริง ต้องการดำเนินการต่อหรือไม่?', confirmText:'ยกเลิกการรับรอง', tone:'danger' });
      if (!confirmed) return;
      const empCode = val('timeCertificationEmpCode');
      const workDate = val('timeCertificationWorkDate');
      const source = timeCertificationStateV61139.source;
      try {
        showLoading('กำลังยกเลิกการรับรองและประมวลผลใหม่...');
        const { error } = await state.client.rpc('ta_revoke_time_certification_v61139', { p_emp_code:empCode, p_work_date:workDate, p_note:'ยกเลิกจาก Time Certification Modal' });
        if (error) throw error;
        closeTimeCertificationModalV61139();
        toast('ยกเลิกการรับรองเวลาแล้ว','success');
        await refreshTimeCertificationSourceV61139(empCode,workDate,source);
      } catch (error) { toast(humanError(error),'error'); }
      finally { hideLoading(); }
    }

    // V6.14.15 — Single consistency pipeline for all schedule/certification mutations.
    // Every write path must invalidate the same derived caches. Schedule writers also
    // finish with one certification-aware Attendance refresh AFTER Work Plan / Rule
    // extensions have been committed.
    function normalizeMutationItemsV61415(items = []) {
      const unique = new Map();
      (items || []).forEach(item => {
        const emp_code = String(item?.emp_code || item?.empCode || '').trim();
        const work_date = String(item?.work_date || item?.workDate || '').slice(0,10);
        if (!emp_code || !work_date) return;
        unique.set(`${emp_code}|${work_date}`, { emp_code, work_date });
      });
      return [...unique.values()];
    }

    function invalidateMutationCachesV61415(items = []) {
      const rows = normalizeMutationItemsV61415(items);
      try { clearAttendanceReadCacheV61463(); } catch (_) {}
      try { window.TimeClockShiftAPI?.clearReadCache?.(); } catch (_) {}
      try {
        scheduleTimeAttendanceStateV6146.key = '';
        scheduleTimeAttendanceStateV6146.rows = [];
        scheduleTimeAttendanceStateV6146.error = null;
        scheduleTimeAttendanceStateV6146.loading = false;
        scheduleTimeAttendanceStateV6146.loadedAt = 0;
      } catch (_) {}
      const seen = new Set();
      rows.forEach(item => {
        const month = item.work_date.slice(0,7);
        const key = `${item.emp_code}|${month}`;
        if (seen.has(key)) return;
        seen.add(key);
        try { employeeMonthCacheInvalidateV61138(item.emp_code, month); } catch (_) {}
      });
      return rows;
    }

    function invalidateAllDerivedAttendanceCachesV61415() {
      try { clearAttendanceReadCacheV61463(); } catch (_) {}
      try { window.TimeClockShiftAPI?.clearReadCache?.(); } catch (_) {}
      try {
        scheduleTimeAttendanceStateV6146.key = '';
        scheduleTimeAttendanceStateV6146.rows = [];
        scheduleTimeAttendanceStateV6146.error = null;
        scheduleTimeAttendanceStateV6146.loading = false;
        scheduleTimeAttendanceStateV6146.loadedAt = 0;
      } catch (_) {}
      try { employeeMonthCacheV61138.clear(); } catch (_) {}

      // If a derived-data screen is visible while a CSV/Attendance rebuild finishes,
      // refresh it immediately instead of waiting for the user to leave and return.
      try { if (scheduleCurrentView() === 'TIME') renderSchedule(); } catch (_) {}
      try { if (state.currentPage === 'attendance') Promise.resolve(loadAttendance()).catch(()=>{}); } catch (_) {}
      try {
        if (!$('employeeMonthScheduleModal')?.classList.contains('hidden')
            && employeeMonthCalendarStateV61121.empCode
            && employeeMonthCalendarStateV61121.month) {
          Promise.resolve(openEmployeeMonthCalendarV61121(
            employeeMonthCalendarStateV61121.empCode,
            employeeMonthCalendarStateV61121.month,
            { forceFresh:true }
          )).catch(()=>{});
        }
      } catch (_) {}
      try {
        if (!$('scheduleTeamDrawer')?.classList.contains('hidden')
            && scheduleTeamDrawerState.unit
            && scheduleTeamDrawerState.date) {
          Promise.resolve(openScheduleTeamDrawer(
            scheduleTeamDrawerState.unit,
            scheduleTeamDrawerState.date
          )).catch(()=>{});
        }
      } catch (_) {}

      document.dispatchEvent(new CustomEvent('timeclock:mutation-consistency-v61415', {
        detail: { type:'CACHE_INVALIDATE_ALL', source:'attendance-rebuild' }
      }));
    }

    async function refreshAttendanceConsistencyRangeV61415(startDate, endDate, empCodes = []) {
      const cleanCodes = [...new Set((empCodes || []).map(x => String(x || '').trim()).filter(Boolean))];
      const response = await state.client.rpc('ta_refresh_attendance_consistency_v61415', {
        p_start_date: String(startDate || '').slice(0,10),
        p_end_date: String(endDate || startDate || '').slice(0,10),
        p_emp_codes: cleanCodes.length ? cleanCodes : null
      });
      if (response.error) throw response.error;
      return response.data || null;
    }

    async function finalizeScheduleMutationV61415(items = [], options = {}) {
      const rows = invalidateMutationCachesV61415(items);
      if (!rows.length) return { recalculated:false, reason:'NO_ROWS' };
      let result = null;
      try {
        const response = await state.client.rpc('ta_finalize_schedule_mutation_v61415', {
          p_rows: rows
        });
        if (response.error) throw response.error;
        result = response.data || null;
      } catch (error) {
        if (!window.TimeClockShiftAPI?.missingFunction?.(error)) throw error;
        // Compatibility fallback. It keeps the UI functional before the new SQL is
        // installed, but V6.14.15 SQL is required for the canonical certified-time path.
        const dates = rows.map(x => x.work_date).sort();
        const empCodes = [...new Set(rows.map(x => x.emp_code))];
        const fallback = await state.client.rpc('ta_recalculate_attendance_v640', {
          p_start_date: dates[0],
          p_end_date: dates[dates.length - 1],
          p_emp_codes: empCodes
        });
        if (fallback.error) throw fallback.error;
        result = { ...(fallback.data || {}), fallback:true, version:'V6.14.15-FALLBACK' };
        console.warn('V6.14.15 consistency finalizer SQL is not installed; used legacy recalc fallback.');
      }
      document.dispatchEvent(new CustomEvent('timeclock:mutation-consistency-v61415', {
        detail: { type:'SCHEDULE', rows, result, source:options.source || '' }
      }));
      return result;
    }

    async function refreshCertificationViewsV61415(empCode, workDate, source = '') {
      const rows = invalidateMutationCachesV61415([{ emp_code:empCode, work_date:workDate }]);
      // TIME VIEW reads derived Attendance and certification metadata. Re-render now;
      // the async loader will refill its invalidated cache from the canonical sources.
      try {
        if (scheduleCurrentView() === 'TIME') renderSchedule();
      } catch (_) {}

      if (source === 'employee-month') {
        await openEmployeeMonthCalendarV61121(empCode, workDate.slice(0,7), { forceFresh:true });
      } else if (source === 'team-daily') {
        await openScheduleTeamDrawer(scheduleTeamDrawerState.unit, scheduleTeamDrawerState.date || workDate);
      } else if (source === 'attendance-detail') {
        try { await loadAttendance(); } catch (_) {}
        try { await window.TimeClockAttendanceWorkspace?.openAttendanceDetail?.(`${empCode}|${workDate}`); } catch (_) {}
      } else if (state.currentPage === 'attendance') {
        try { await loadAttendance(); } catch (_) {}
      }

      document.dispatchEvent(new CustomEvent('timeclock:mutation-consistency-v61415', {
        detail: { type:'CERTIFICATION', rows, source }
      }));
    }

    window.TimeClockConsistencyV61415 = Object.freeze({
      finalizeSchedule: finalizeScheduleMutationV61415,
      refreshAttendanceRange: refreshAttendanceConsistencyRangeV61415,
      invalidate: invalidateMutationCachesV61415,
      invalidateAll: invalidateAllDerivedAttendanceCachesV61415,
      refreshCertification: refreshCertificationViewsV61415
    });
    window.TimeClockTimeCertificationV61415 = Object.freeze({
      open: openTimeCertificationModalV61139,
      close: closeTimeCertificationModalV61139
    });

    // V6.14.13: TEAM DAILY DETAIL and TIME VIEW must classify the exact same
    // merged attendance object. Keep schedule fields authoritative while enriching
    // with Attendance Detail, punch metadata and Time Certification.
    function scheduleMergeTeamAttendanceRowV61411(scheduleRow, attendanceRow = {}, punchRow = {}, certificationRow = {}) {
      const merged = {
        ...(scheduleRow || {}),
        ...(attendanceRow || {}),
        ...(punchRow || {}),
        ...(certificationRow || {}),
        emp_code: scheduleRow?.emp_code || attendanceRow?.emp_code || punchRow?.emp_code || certificationRow?.emp_code,
        full_name: attendanceRow?.full_name || scheduleRow?.full_name,
        department: attendanceRow?.department || scheduleRow?.department,
        assigned_shift_code: scheduleRow?.assigned_shift_code,
        effective_shift_code: scheduleRow?.effective_shift_code,
        auto_shift_code: scheduleRow?.auto_shift_code,
        shift_code: scheduleRow?.shift_code,
        shift_start_time: scheduleRow?.shift_start_time,
        shift_end_time: scheduleRow?.shift_end_time,
        effective_shift_start_time: scheduleRow?.effective_shift_start_time,
        effective_shift_end_time: scheduleRow?.effective_shift_end_time
      };
      return normalizeAttendanceStatusFromPunchesV61120(merged);
    }

    function scheduleTeamAttendanceFlagsV61411(row) {
      const normalized = normalizeAttendanceStatusFromPunchesV61120({ ...(row || {}) });
      const status = scheduleTeamAttendanceStatus(normalized);
      return {
        status,
        normal: status === 'NORMAL',
        absence: status === 'ABSENCE',
        late: status === 'LATE',
        early: scheduleTeamIsEarlyV6147(normalized),
        off: status === 'OFF',
        leave: status === 'LEAVE',
        pending: status === 'UPCOMING'
      };
    }

    async function fetchScheduleTeamDayAttendance(unit, date, baseRows) {
      const empCodes = [...new Set((baseRows || []).map(row => String(row.emp_code || '').trim()).filter(Boolean))];
      if (!empCodes.length) return [];

      const attempts = [
        ['ta_get_attendance_detail_v61463', {
          p_start_date: date,
          p_end_date: date,
          p_area: null,
          p_sub_area: null,
          p_department: null,
          p_emp_codes: empCodes,
          p_attendance_statuses: null,
          p_schedule_statuses: null,
          p_limit: 5000
        }],
        ['ta_get_attendance_detail_v664', {
          p_start_date: date,
          p_end_date: date,
          p_zone: null,
          p_department: null,
          p_emp_codes: empCodes,
          p_attendance_statuses: null,
          p_schedule_statuses: null,
          p_limit: 5000
        }],
        ['ta_get_attendance_detail_v640', {
          p_start_date: date,
          p_end_date: date,
          p_zone: null,
          p_department: null,
          p_emp_codes: empCodes,
          p_attendance_statuses: null,
          p_schedule_statuses: null,
          p_limit: 5000
        }]
      ];

      let data = [];
      for (const [fn,args] of attempts) {
        const response = await state.client.rpc(fn,args);
        if (!response.error) {
          data = Array.isArray(response.data) ? response.data : [];
          break;
        }
        if (!window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
          console.warn('Team drawer attendance detail:', response.error);
          break;
        }
      }

      let punchMetaRows = [];
      const specialPunchEmpCodesV61463 = [...new Set(
        (baseRows || []).filter(attendanceNeedsPunchMetaV61463)
          .map(row => String(row.emp_code || '').trim()).filter(Boolean)
      )];
      const punchAttempts = specialPunchEmpCodesV61463.length ? [
        ['ta_get_attendance_shift_punch_meta_v61110', {
          p_start_date: date,
          p_end_date: date,
          p_emp_codes: specialPunchEmpCodesV61463
        }],
        ['ta_get_attendance_shift_punch_meta_v6119', {
          p_start_date: date,
          p_end_date: date,
          p_emp_codes: specialPunchEmpCodesV61463
        }]
      ] : [];
      for (const [fn,args] of punchAttempts) {
        const response = await state.client.rpc(fn,args);
        if (!response.error) {
          punchMetaRows = Array.isArray(response.data) ? response.data : [];
          break;
        }
        if (!window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
          console.warn('Team drawer shift punch meta:', response.error);
          break;
        }
      }

      let certificationRows = [];
      const certificationResponse = await state.client.rpc(
        'ta_get_time_certification_range_v61139',
        { p_start_date: date, p_end_date: date, p_emp_codes: empCodes }
      );
      if (!certificationResponse.error) {
        certificationRows = Array.isArray(certificationResponse.data) ? certificationResponse.data : [];
      } else if (!window.TimeClockShiftAPI?.missingFunction?.(certificationResponse.error)) {
        console.warn('Team drawer time certification:', certificationResponse.error);
      }

      const byEmp = new Map(data.map(row => [String(row.emp_code || '').trim(), row]));
      const byEmpPunch = new Map(punchMetaRows.map(row => [String(row.emp_code || '').trim(), row]));
      const byEmpCertification = new Map(certificationRows.map(row => [String(row.emp_code || '').trim(), row]));
      return (baseRows || []).map(scheduleRow => {
        const key = String(scheduleRow.emp_code || '').trim();
        return scheduleMergeTeamAttendanceRowV61411(
          scheduleRow,
          byEmp.get(key) || {},
          byEmpPunch.get(key) || {},
          byEmpCertification.get(key) || {}
        );
      });
    }

    function scheduleTeamIsEarlyV6147(row) {
      return attendancePolicyFlagsV61428(row).early;
    }

    function scheduleTeamDrawerMatchesFilterV6147(row, filterKey) {
      const key = String(filterKey || 'ALL').toUpperCase();
      if (key === 'ALL') return true;
      if (key === 'EARLY') return scheduleTeamIsEarlyV6147(row);
      return scheduleTeamAttendanceStatus(row) === key;
    }

    function renderScheduleTeamDrawer() {
      const list = $('scheduleTeamDrawerList');
      const summary = $('scheduleTeamDrawerSummary');
      const filters = $('scheduleTeamDrawerFilter');
      if (!list || !summary || !filters) return;

      const rows = scheduleTeamDrawerState.rows || [];
      const counts = {ALL: rows.length, NORMAL:0, LATE:0, ABSENCE:0, EARLY:0, OFF:0, LEAVE:0, UPCOMING:0};
      rows.forEach(row => {
        const status = scheduleTeamAttendanceStatus(row);
        counts[status] = (counts[status] || 0) + 1;
        if (scheduleTeamIsEarlyV6147(row)) counts.EARLY += 1;
      });

      const cards = [
        ['ALL','ทั้งหมด','all'],
        ['NORMAL','ปกติ','normal'],
        ['LATE','สาย 1–29','late'],
        ['ABSENCE','ขาดงาน','absence'],
        ['EARLY','กลับก่อน','early'],
        ['OFF','หยุด','off'],
        ['LEAVE','ลา','leave'],
        ['UPCOMING','รอทำงาน','upcoming']
      ];
      summary.innerHTML = cards.slice(0,6).map(([key,label,tone]) => `<button type="button" class="team-drawer-kpi tone-${tone} ${scheduleTeamDrawerState.filter===key?'active':''}" data-team-drawer-filter="${key}"><span>${safe(label)}</span><strong>${safe(formatNumber(counts[key] || 0))}</strong></button>`).join('');
      filters.innerHTML = cards.map(([key,label,tone]) => `<button type="button" class="team-drawer-filter-chip tone-${tone} ${scheduleTeamDrawerState.filter===key?'active':''}" data-team-drawer-filter="${key}">${safe(label)} <b>${safe(formatNumber(counts[key] || 0))}</b></button>`).join('');

      const visible = rows.filter(row => scheduleTeamDrawerMatchesFilterV6147(row, scheduleTeamDrawerState.filter));
      if (!visible.length) {
        list.innerHTML = `<div class="team-drawer-empty">ไม่พบพนักงานในสถานะที่เลือก</div>`;
        document.dispatchEvent(new CustomEvent("timeclock:team-daily-rendered", {
          detail: { date: scheduleTeamDrawerState.date || null }
        }));
        return;
      }

      list.innerHTML = visible
        .sort((a,b) => {
          const order={ABSENCE:0,LATE:1,NORMAL:2,UPCOMING:3,LEAVE:4,OFF:5};
          const sa=scheduleTeamAttendanceStatus(a), sb=scheduleTeamAttendanceStatus(b);
          return (order[sa]??9)-(order[sb]??9) || String(a.full_name||'').localeCompare(String(b.full_name||''),'th');
        })
        .map(row => {
          const shift = scheduleResolveShiftMeta(row);
          const status = scheduleTeamAttendanceStatus(row);
          const statusMeta = scheduleTeamStatusMeta(status);
          const actualIn = scheduleTeamActualTime(row,'IN');
          const actualOut = scheduleTeamActualTime(row,'OUT');
          const initials = String(row.full_name || row.emp_code || '?').trim().slice(0,2);
          const lateText = status === 'LATE' && Number(row.late_minutes||0)>0 ? ` • สาย ${formatNumber(row.late_minutes)} นาที` : '';
          const templateCode = scheduleWorkTemplateCodeV6118(row);
          const shift1Plan = scheduleTeamSegmentPlannedRange(row, 1);
          const shift2Plan = scheduleTeamSegmentPlannedRange(row, 2);
          const shift1In = scheduleTeamSegmentActualTime(row, 1, 'IN');
          const shift1Out = scheduleTeamSegmentActualTime(row, 1, 'OUT');
          const shift2In = scheduleTeamSegmentActualTime(row, 2, 'IN');
          const shift2Out = scheduleTeamSegmentActualTime(row, 2, 'OUT');
          const specialModeV61459 = scheduleSpecialWorkModeMetaV61459(row);
          const tempWorkingV61529F14B = scheduleTemporaryWorkingMetaV61529F14B(row);
          const tempWorkingBadgeV61529F14B = tempWorkingV61529F14B
            ? `<span class="team-scope-chip-v61526 ${tempWorkingV61529F14B.isBorrow?'borrowed':'assist'} team-employee-temp-chip-v61529f14b">${safe(tempWorkingV61529F14B.label)}</span>`
            : '';
          const canEditWorkingV61529F14B = scheduleWorkingTeamCanEditV61529F14B(row);
          const splitWorkTemplate = Boolean(specialModeV61459 && ['customer','wait'].includes(specialModeV61459.key)) || templateCode === 'SPLIT_FLEX' || shift2Plan !== '-' || shift2In !== '-' || shift2Out !== '-';
          const splitModeLabelV61459 = specialModeV61459?.label || 'กะปกติ + งานลูกค้าช่วงดึก';
          const shiftDetailHtml = splitWorkTemplate
            ? `<div class="team-shift-stack"><small><b>กะ 1</b><span>${safe(shift1Plan)}</span></small><small class="secondary"><b>กะ 2</b><span>${safe(shift2Plan)}</span></small></div><small class="team-shift-meta">${safe(splitModeLabelV61459)}</small>`
            : `<strong class="team-shift-text tone-${safe(shift.tone)}">${safe(shift.code || '-')}</strong><small>${safe(scheduleTeamPlannedTime(row))}</small>`;
          return `<article class="team-employee-card status-${safe(statusMeta.tone)} ${splitWorkTemplate ? 'has-double-shift' : ''}">
            <div class="team-employee-main">
              <div class="team-employee-avatar">${safe(initials)}</div>
              <div class="team-employee-name"><strong>${safe(row.full_name || 'ไม่พบชื่อ')}</strong><small>${safe(row.emp_code || '-')} • ${safe(row.position_name || row.department || '')}</small>${tempWorkingBadgeV61529F14B}</div>
              <div class="team-employee-actions-v61118">
                <span class="team-att-status tone-${safe(statusMeta.tone)}">${safe(statusMeta.label)}${safe(lateText)}</span>
                ${timeCertificationBadgeV61139(row)}
                ${timeCertificationButtonV61139(row,'team-daily')}
                ${canEditWorkingV61529F14B
                  ? `<button type="button" class="team-assign-btn-v61118" data-team-assign data-emp="${safe(row.emp_code || '')}" data-date="${safe(String(row.work_date || scheduleTeamDrawerState.date || '').slice(0,10))}" title="จัดกะและประมวลผลเวลาทำงานใหม่"><span>✎</span> จัดกะ</button>`
                  : `<span class="team-working-readonly-v61529f14b" title="ช่วงยืมตัวนี้จัดกะโดย Manager/Acting ของทีมปลายทาง">ดูอย่างเดียว</span>`}
              </div>
            </div>
            <div class="team-employee-detail-grid segments-${splitWorkTemplate ? 'five' : 'three'} ${splitWorkTemplate ? 'double-shift' : ''}">
              <div class="team-detail-card is-shift"><span>กะทำงาน</span>${shiftDetailHtml}</div>
              <div class="team-detail-card tone-shift1"><span>เข้า กะ 1</span><strong>${safe(shift1In)}</strong><small>${safe(shift1Plan)}</small></div>
              <div class="team-detail-card tone-shift1"><span>ออก กะ 1</span><strong>${safe(shift1Out)}</strong><small>${safe(shift1Plan)}</small></div>
              <div class="team-detail-card tone-shift2 ${splitWorkTemplate ? '' : 'is-muted'}"><span>เข้า กะ 2</span><strong>${safe(splitWorkTemplate ? shift2In : '-')}</strong><small>${safe(splitWorkTemplate ? shift2Plan : 'ไม่มี')}</small></div>
              <div class="team-detail-card tone-shift2 ${splitWorkTemplate ? '' : 'is-muted'}"><span>ออก กะ 2</span><strong>${safe(splitWorkTemplate ? shift2Out : '-')}</strong><small>${safe(splitWorkTemplate ? shift2Plan : 'ไม่มี')}</small></div>
            </div>
            <div class="team-employee-summary-line">เวลาเข้า/ออกรวมวันนี้: <b>${safe(actualIn)}</b> · <b>${safe(actualOut)}</b></div>
          </article>`;
        }).join('');

      document.dispatchEvent(new CustomEvent("timeclock:team-daily-rendered", {
        detail: { date: scheduleTeamDrawerState.date || null }
      }));
    }

    async function openScheduleTeamDrawer(groupKey, date, displayLabel = null) {
      const drawer = $('scheduleTeamDrawer');
      const backdrop = $('scheduleTeamDrawerBackdrop');
      if (!drawer || !backdrop) return;

      const label=String(displayLabel || groupKey || 'ทีมช่างเทคนิค');
      scheduleTeamDrawerState.unit = label;
      scheduleTeamDrawerState.groupKey = String(groupKey || '');
      scheduleTeamDrawerState.date = date;
      scheduleTeamDrawerState.filter = 'ALL';
      scheduleTeamDrawerState.loading = true;
      drawer.dataset.periodDate = String(date || '').slice(0,10);

      const baseRows = scheduleFilteredRows(state.schedule).filter(row => scheduleOperationalTeamGroupV61526(row).key === scheduleTeamDrawerState.groupKey && String(row.work_date || '').slice(0,10) === date);
      $('scheduleTeamDrawerTitle').textContent = label;
      $('scheduleTeamDrawerSubtitle').textContent = `${formatDate(date)} • ${formatNumber(new Set(baseRows.map(row=>row.emp_code)).size)} คน`;
      $('scheduleTeamDrawerList').innerHTML = `<div class="team-drawer-loading"><span class="spinner"></span><strong>กำลังโหลดเวลาลงงาน...</strong></div>`;

      drawer.classList.remove('hidden');
      backdrop.classList.remove('hidden');
      drawer.setAttribute('aria-hidden','false');
      document.body.classList.add('schedule-drawer-open');

      try {
        scheduleTeamDrawerState.rows = await fetchScheduleTeamDayAttendance(null,date,baseRows);
      } catch (error) {
        console.error('Team drawer:', error);
        scheduleTeamDrawerState.rows = baseRows;
        $('scheduleTeamDrawerNote').textContent = 'โหลดรายละเอียดเวลาไม่สำเร็จบางส่วน จึงแสดงข้อมูลจากปฏิทินจัดกะที่มีอยู่';
      } finally {
        scheduleTeamDrawerState.loading = false;
        renderScheduleTeamDrawer();
      }
    }

    function closeScheduleTeamDrawer() {
      $('scheduleTeamDrawer')?.classList.add('hidden');
      $('scheduleTeamDrawerBackdrop')?.classList.add('hidden');
      $('scheduleTeamDrawer')?.setAttribute('aria-hidden','true');
      document.body.classList.remove('schedule-drawer-open');
    }


    const employeeMonthCalendarStateV61121 = {
      empCode: '',
      month: '',
      scheduleRows: [],
      attendanceRows: [],
      holidayRows: [],
      dayoffBalance: null,
      timePunchRows: [],
      timePunchLoading: false,
      timePunchError: null,
      timePunchMultiOnly: false,
      timePunchLoadToken: 0,
      returnFocusEl: null,
      loading: false,
      loadToken: 0,
      activeFilter: 'all'
    };

    // V6.11.38: short-lived cache + in-flight dedupe.
    // Keeps month navigation / reopen fast without keeping stale data for long.
    const employeeMonthCacheV61138 = new Map();
    const employeeMonthPendingV61138 = new Map();
    const EMPLOYEE_MONTH_CACHE_TTL_V61138 = 60000;

    function employeeMonthCacheKeyV61138(empCode, monthValue) {
      return `${String(empCode || '').trim()}|${employeeMonthBoundsV61121(monthValue).value}`;
    }

    function employeeMonthCloneRowsV61138(rows) {
      return (rows || []).map(row => ({ ...row }));
    }

    function employeeMonthCacheGetV61138(empCode, monthValue) {
      const key = employeeMonthCacheKeyV61138(empCode, monthValue);
      const cached = employeeMonthCacheV61138.get(key);
      if (!cached) return null;
      if ((Date.now() - Number(cached.savedAt || 0)) > EMPLOYEE_MONTH_CACHE_TTL_V61138) {
        employeeMonthCacheV61138.delete(key);
        return null;
      }
      return {
        scheduleRows: employeeMonthCloneRowsV61138(cached.scheduleRows),
        attendanceRows: employeeMonthCloneRowsV61138(cached.attendanceRows),
        holidayRows: employeeMonthCloneRowsV61138(cached.holidayRows),
        dayoffBalance: cached.dayoffBalance && typeof cached.dayoffBalance === 'object'
          ? { ...cached.dayoffBalance }
          : null,
        savedAt: cached.savedAt
      };
    }

    function employeeMonthCacheSetV61138(empCode, monthValue, scheduleRows, attendanceRows, dayoffBalance = null, holidayRows = []) {
      const key = employeeMonthCacheKeyV61138(empCode, monthValue);
      employeeMonthCacheV61138.set(key, {
        scheduleRows: employeeMonthCloneRowsV61138(scheduleRows),
        attendanceRows: employeeMonthCloneRowsV61138(attendanceRows),
        holidayRows: employeeMonthCloneRowsV61138(holidayRows),
        dayoffBalance: dayoffBalance && typeof dayoffBalance === 'object'
          ? { ...dayoffBalance }
          : null,
        savedAt: Date.now()
      });
    }

    function employeeMonthCacheInvalidateV61138(empCode, monthValue = null) {
      const emp = String(empCode || '').trim();
      if (!emp) return;
      if (monthValue) {
        employeeMonthCacheV61138.delete(employeeMonthCacheKeyV61138(emp, monthValue));
        return;
      }
      [...employeeMonthCacheV61138.keys()].forEach(key => {
        if (key.startsWith(`${emp}|`)) employeeMonthCacheV61138.delete(key);
      });
    }

    // V6.14.60 — Raw Punch evidence for MONTHLY PERSONAL OVERVIEW.
    // This is advisory data only. It never mutates Schedule / Work Mode / Attendance.
    const employeeMonthPunchCacheV61460 = new Map();
    const EMPLOYEE_MONTH_PUNCH_CACHE_TTL_V61460 = 60000;

    function employeeMonthPunchCacheKeyV61460(empCode, monthValue) {
      return `${String(empCode || '').trim()}|${String(monthValue || '').slice(0,7)}`;
    }

    function employeeMonthPunchCacheInvalidateV61460(empCode, monthValue = null) {
      const emp = String(empCode || '').trim();
      if (!emp) return;
      if (monthValue) {
        employeeMonthPunchCacheV61460.delete(employeeMonthPunchCacheKeyV61460(emp,monthValue));
        return;
      }
      [...employeeMonthPunchCacheV61460.keys()].forEach(key => {
        if (key.startsWith(`${emp}|`)) employeeMonthPunchCacheV61460.delete(key);
      });
    }

    function employeeMonthPunchModeV61460(row) {
      const mode = String(row?.normalized_mode || row?.inout_mode || '').trim().toUpperCase();
      if (['IN','I','เข้า'].includes(mode)) return 'IN';
      if (['OUT','O','ออก'].includes(mode)) return 'OUT';
      return 'UNKNOWN';
    }

    function employeeMonthPunchDayMapV61460(rows = employeeMonthCalendarStateV61121.timePunchRows) {
      const map = new Map();
      (rows || []).forEach(row => {
        const date = String(row?.inout_date || '').slice(0,10);
        if (!date) return;
        if (!map.has(date)) map.set(date,{date,rows:[],total:0,inCount:0,outCount:0,unknownCount:0,multiple:false});
        const day = map.get(date);
        day.rows.push(row);
        day.total += 1;
        const mode = employeeMonthPunchModeV61460(row);
        if (mode === 'IN') day.inCount += 1;
        else if (mode === 'OUT') day.outCount += 1;
        else day.unknownCount += 1;
      });
      map.forEach(day => {
        day.rows.sort((a,b) => String(a?.inout_time || '').localeCompare(String(b?.inout_time || '')) || Number(a?.punch_id||0)-Number(b?.punch_id||0));
        day.multiple = day.total > 2 || day.inCount > 1 || day.outCount > 1;
      });
      return map;
    }

    function employeeMonthPunchStatsV61460(rows = employeeMonthCalendarStateV61121.timePunchRows) {
      const byDay = employeeMonthPunchDayMapV61460(rows);
      const multipleDays = [...byDay.values()].filter(day => day.multiple);
      return { records:(rows||[]).length, days:byDay.size, multipleDays:multipleDays.length, byDay };
    }

    function employeeMonthUpdatePunchButtonV61460() {
      const btn = $('employeeMonthPunchLogBtn');
      const count = $('employeeMonthPunchAlertCount');
      const stats = employeeMonthPunchStatsV61460();
      if (btn) {
        btn.classList.toggle('is-loading',Boolean(employeeMonthCalendarStateV61121.timePunchLoading));
        btn.classList.toggle('has-multiple',stats.multipleDays>0);
        btn.disabled = Boolean(employeeMonthCalendarStateV61121.timePunchLoading);
        btn.title = employeeMonthCalendarStateV61121.timePunchError
          ? `โหลดข้อมูลการลงเวลาไม่สำเร็จ • ${humanError(employeeMonthCalendarStateV61121.timePunchError)}`
          : stats.multipleDays>0
            ? `ดู ${stats.records} Record • พบ ${stats.multipleDays} วันที่มีหลายรายการลงเวลา`
            : `ดูข้อมูลการลงเวลาทุก Record ในเดือนที่เลือก`;
      }
      if (count) {
        count.textContent = String(stats.multipleDays || 0);
        count.classList.toggle('hidden',stats.multipleDays<=0);
      }
    }

    function employeeMonthClosePunchPanelV61460() {
      const overlay = $('employeeMonthPunchOverlay');
      overlay?.classList.add('hidden');
      overlay?.setAttribute('aria-hidden','true');
    }

    function employeeMonthPunchDateLabelV61460(date) {
      const d = parseLocalISO(date);
      const days = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์','เสาร์'];
      return `${days[d.getDay()]} ${formatDate(date)}`;
    }

    function employeeMonthPunchRecordHtmlV61460(row) {
      const mode = employeeMonthPunchModeV61460(row);
      const modeLabel = mode === 'IN' ? 'เข้า' : mode === 'OUT' ? 'ออก' : 'ไม่ระบุ';
      const time = formatTime(row?.inout_time);
      const gpsLocation = String(row?.gps_location || '').trim();
      const source = [row?.source_sheet,row?.source_file].map(v=>String(v||'').trim()).filter(Boolean).join(' • ');
      return `<div class="employee-month-punch-record-v61460 mode-${safe(mode.toLowerCase())}">
        <time>${safe(time)}</time>
        <span class="employee-month-punch-mode-v61460 mode-${safe(mode.toLowerCase())}"><i></i>${safe(modeLabel)}</span>
        <div class="employee-month-punch-record-copy-v61460">
          <strong>${safe(gpsLocation || 'ไม่ระบุพิกัด/สถานที่')}</strong>
        </div>
        <span class="employee-month-punch-source-v61460">${safe(source || `Record #${row?.punch_id || '-'}`)}</span>
      </div>`;
    }

    function renderEmployeeMonthPunchPanelV61460(focusDate = null) {
      const list = $('employeeMonthPunchList');
      const summary = $('employeeMonthPunchSummary');
      const subtitle = $('employeeMonthPunchSubtitle');
      const multiCount = $('employeeMonthPunchMultiDayCount');
      const allDayCount = $('employeeMonthPunchAllDayCount');
      const allBtn = $('employeeMonthPunchAllBtn');
      const filterBtn = $('employeeMonthPunchMultiOnlyBtn');
      const viewStatus = $('employeeMonthPunchViewStatus');
      if (!list || !summary) return;

      const rows = employeeMonthCalendarStateV61121.timePunchRows || [];
      const stats = employeeMonthPunchStatsV61460(rows);
      const bounds = employeeMonthBoundsV61121(employeeMonthCalendarStateV61121.month);
      const monthNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
      if (subtitle) subtitle.textContent = `${employeeMonthCalendarStateV61121.empCode} • ${monthNames[bounds.month-1]} ${bounds.year+543} • ทุก Record ตามวัน/เวลาจริง`;
      if (multiCount) multiCount.textContent = String(stats.multipleDays || 0);
      if (allDayCount) allDayCount.textContent = String(stats.days || 0);
      const multiOnlyV61464 = Boolean(employeeMonthCalendarStateV61121.timePunchMultiOnly);
      if (allBtn) {
        allBtn.classList.toggle('active',!multiOnlyV61464);
        allBtn.setAttribute('aria-pressed',multiOnlyV61464?'false':'true');
      }
      if (filterBtn) {
        filterBtn.classList.toggle('active',multiOnlyV61464);
        filterBtn.setAttribute('aria-pressed',multiOnlyV61464?'true':'false');
      }
      summary.innerHTML = [
        ['Records',stats.records,'รายการลงเวลาทั้งหมด'],
        ['Days',stats.days,'วันที่มีข้อมูล'],
        ['Multi',stats.multipleDays,'วันที่มีหลายรายการ']
      ].map(([label,value,desc],index)=>`<div class="employee-month-punch-kpi-v61460 ${index===2&&Number(value)>0?'is-highlight':''}"><span>${safe(label)}</span><strong>${safe(formatNumber(value))}</strong><small>${safe(desc)}</small></div>`).join('');

      if (employeeMonthCalendarStateV61121.timePunchLoading) {
        if (viewStatus) {
          viewStatus.classList.remove('is-filtered-v61464');
          viewStatus.innerHTML = '<strong>กำลังโหลดข้อมูลครบทุก Record</strong><span>ระบบกำลังอ่าน Punch ดิบของเดือนที่เลือก</span>';
        }
        list.innerHTML = '<div class="employee-month-punch-loading-v61460"><span class="spinner"></span><strong>กำลังโหลดข้อมูลการลงเวลา...</strong><small>อ่าน Punch ดิบทุก Record ของเดือนที่เลือก</small></div>';
        return;
      }
      if (employeeMonthCalendarStateV61121.timePunchError) {
        if (viewStatus) {
          viewStatus.classList.remove('is-filtered-v61464');
          viewStatus.innerHTML = '<strong>โหลดข้อมูลไม่สำเร็จ</strong><span>ยังไม่สามารถยืนยันจำนวน Record ที่ครบถ้วนได้</span>';
        }
        list.innerHTML = `<div class="employee-month-punch-empty-v61460 is-error"><strong>โหลดข้อมูลการลงเวลาไม่สำเร็จ</strong><small>${safe(humanError(employeeMonthCalendarStateV61121.timePunchError))}</small></div>`;
        return;
      }
      if (!rows.length) {
        if (viewStatus) {
          viewStatus.classList.remove('is-filtered-v61464');
          viewStatus.innerHTML = '<strong>ไม่พบ Record</strong><span>เดือนที่เลือกไม่มีข้อมูล Punch ดิบใน Time Logs</span>';
        }
        list.innerHTML = '<div class="employee-month-punch-empty-v61460"><strong>ไม่พบข้อมูลการลงเวลา</strong><small>เดือนที่เลือกไม่มี Record ใน Time Logs</small></div>';
        return;
      }

      const allDaysV61464 = [...stats.byDay.values()].sort((a,b)=>a.date.localeCompare(b.date));
      let days = allDaysV61464.map(day=>({...day,isContextV61464:false}));
      if (multiOnlyV61464) {
        const byDateV61464 = new Map(allDaysV61464.map(day=>[day.date,day]));
        const selectedV61464 = new Set();
        const contextV61464 = new Set();
        const shiftDateV61464 = (date,delta) => {
          const d = parseLocalISO(date);
          d.setDate(d.getDate()+delta);
          return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        };
        allDaysV61464.filter(day=>day.multiple).forEach(day=>{
          selectedV61464.add(day.date);
          const ordered = day.rows || [];
          const firstMode = ordered.length ? employeeMonthPunchModeV61460(ordered[0]) : 'UNKNOWN';
          const lastMode = ordered.length ? employeeMonthPunchModeV61460(ordered[ordered.length-1]) : 'UNKNOWN';
          if (firstMode === 'OUT') {
            const prev = shiftDateV61464(day.date,-1);
            if (byDateV61464.has(prev)) { selectedV61464.add(prev); contextV61464.add(prev); }
          }
          if (lastMode === 'IN') {
            const next = shiftDateV61464(day.date,1);
            if (byDateV61464.has(next)) { selectedV61464.add(next); contextV61464.add(next); }
          }
        });
        days = allDaysV61464
          .filter(day=>selectedV61464.has(day.date))
          .map(day=>({...day,isContextV61464:contextV61464.has(day.date) && !day.multiple}));
      }
      const shownRecordsV61464 = days.reduce((sum,day)=>sum+Number(day.total||0),0);
      if (viewStatus) {
        viewStatus.classList.toggle('is-filtered-v61464',multiOnlyV61464);
        viewStatus.innerHTML = multiOnlyV61464
          ? `<strong>กำลังกรองวันที่มีหลายรายการ</strong><span>แสดง ${safe(formatNumber(shownRecordsV61464))}/${safe(formatNumber(stats.records))} Records • ${safe(formatNumber(days.length))}/${safe(formatNumber(stats.days))} วัน • ระบบเติมวันก่อน/หลังเมื่อจำเป็น เพื่อไม่ตัด Punch ข้ามเที่ยงคืน</span>`
          : `<strong>แสดงข้อมูลครบทุก Record</strong><span>${safe(formatNumber(stats.records))} Records • ${safe(formatNumber(stats.days))} วันที่มีข้อมูลในเดือนที่เลือก</span>`;
      }
      if (!days.length) {
        list.innerHTML = '<div class="employee-month-punch-empty-v61460"><strong>ไม่พบวันที่มีหลายรายการ</strong><small>ทุกวันที่มี Punch ในเดือนนี้มีรูปแบบปกติ 1 คู่หรือน้อยกว่า</small></div>';
        return;
      }
      list.innerHTML = days.map(day => `<section class="employee-month-punch-day-v61460 ${day.multiple?'has-multiple':''} ${day.isContextV61464?'is-context-v61464':''}" data-punch-day="${safe(day.date)}">
        <header>
          <div class="employee-month-punch-day-date-v61460"><strong>${safe(String(Number(day.date.slice(8,10))))}</strong><small>${safe(day.date.slice(5,7))}</small></div>
          <div class="employee-month-punch-day-copy-v61460"><strong>${safe(employeeMonthPunchDateLabelV61460(day.date))}</strong><small>${safe(`${day.total} รายการ • เข้า ${day.inCount} • ออก ${day.outCount}${day.unknownCount?` • ไม่ระบุ ${day.unknownCount}`:''}`)}</small></div>
          ${day.multiple?`<span class="employee-month-punch-candidate-v61460" title="มีการลงเวลาหลายรายการในวันเดียวกัน • ใช้ประกอบการพิจารณากะพิเศษ"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="4"></circle><path d="M8 6v2.5l1.8 1.2M14 6h7M14 10h7M4 16h17M4 20h17"></path></svg><span>หลายรายการ</span></span>`:day.isContextV61464?'<span class="employee-month-punch-context-badge-v61464">วันต่อเนื่อง</span>':''}
        </header>
        ${day.multiple?'<div class="employee-month-punch-advisory-v61460">อาจเป็นข้อมูลประกอบสำหรับ กะปกติ+งานลูกค้าช่วงดึก / กะเช้า+รอเข้ากะดึก / กะนับชั่วโมง • กรุณาตรวจสอบก่อนจัดกะ</div>':day.isContextV61464?'<div class="employee-month-punch-context-note-v61464">แสดงวันนี้เพิ่มเติมเพื่อให้เห็น Punch ต่อเนื่องก่อน/หลังเที่ยงคืนครบถ้วน</div>':''}
        <div class="employee-month-punch-records-v61460">${day.rows.map(employeeMonthPunchRecordHtmlV61460).join('')}</div>
      </section>`).join('');

      if (focusDate) {
        requestAnimationFrame(()=>{
          const node = list.querySelector(`[data-punch-day="${CSS.escape(String(focusDate))}"]`);
          node?.scrollIntoView?.({block:'start',behavior:'smooth'});
          node?.classList.add('is-focus-v61460');
          if (node) setTimeout(()=>node.classList.remove('is-focus-v61460'),1800);
        });
      }
    }

    function employeeMonthOpenPunchPanelV61460(focusDate = null) {
      const overlay = $('employeeMonthPunchOverlay');
      if (!overlay) return;
      overlay.classList.remove('hidden');
      overlay.setAttribute('aria-hidden','false');
      renderEmployeeMonthPunchPanelV61460(focusDate);
    }

    async function loadEmployeeMonthPunchesV61460(options = {}) {
      const empCode = String(employeeMonthCalendarStateV61121.empCode || '').trim();
      const month = String(employeeMonthCalendarStateV61121.month || '').slice(0,7);
      if (!empCode || !/^\d{4}-\d{2}$/.test(month)) return [];
      const key = employeeMonthPunchCacheKeyV61460(empCode,month);
      const forceFresh = Boolean(options?.forceFresh);
      if (!forceFresh) {
        const cached = employeeMonthPunchCacheV61460.get(key);
        if (cached && Date.now()-Number(cached.savedAt||0) <= EMPLOYEE_MONTH_PUNCH_CACHE_TTL_V61460) {
          employeeMonthCalendarStateV61121.timePunchRows = (cached.rows||[]).map(row=>({...row}));
          employeeMonthCalendarStateV61121.timePunchError = null;
          employeeMonthCalendarStateV61121.timePunchLoading = false;
          employeeMonthUpdatePunchButtonV61460();
          return employeeMonthCalendarStateV61121.timePunchRows;
        }
      }
      const token = ++employeeMonthCalendarStateV61121.timePunchLoadToken;
      employeeMonthCalendarStateV61121.timePunchLoading = true;
      employeeMonthCalendarStateV61121.timePunchError = null;
      employeeMonthUpdatePunchButtonV61460();
      try {
        const {data,error} = await state.client.rpc('ta_get_employee_time_punches_v61460',{
          p_emp_code:empCode,
          p_month:`${month}-01`
        });
        if (error) throw error;
        if (token !== employeeMonthCalendarStateV61121.timePunchLoadToken) return [];
        const rows = (Array.isArray(data)?data:[]).map(row=>({...row})).sort((a,b)=>String(a?.inout_date||'').localeCompare(String(b?.inout_date||'')) || String(a?.inout_time||'').localeCompare(String(b?.inout_time||'')) || Number(a?.punch_id||0)-Number(b?.punch_id||0));
        employeeMonthCalendarStateV61121.timePunchRows = rows;
        employeeMonthCalendarStateV61121.timePunchError = null;
        employeeMonthPunchCacheV61460.set(key,{rows:rows.map(row=>({...row})),savedAt:Date.now()});
        return rows;
      } catch (error) {
        if (token !== employeeMonthCalendarStateV61121.timePunchLoadToken) return [];
        employeeMonthCalendarStateV61121.timePunchRows = [];
        employeeMonthCalendarStateV61121.timePunchError = error;
        if (!window.TimeClockShiftAPI?.missingFunction?.(error)) console.warn('Monthly Personal raw time punches V6.14.60:',error);
        return [];
      } finally {
        if (token === employeeMonthCalendarStateV61121.timePunchLoadToken) {
          employeeMonthCalendarStateV61121.timePunchLoading = false;
          employeeMonthUpdatePunchButtonV61460();
          // Re-render once so raw-punch evidence icons appear on the calendar.
          if (!$('employeeMonthScheduleModal')?.classList.contains('hidden') && !employeeMonthCalendarStateV61121.loading) renderEmployeeMonthCalendarV61121();
          if (!$('employeeMonthPunchOverlay')?.classList.contains('hidden')) renderEmployeeMonthPunchPanelV61460();
        }
      }
    }

    function employeeMonthBoundsV61121(monthValue) {
      const match = String(monthValue || '').trim().match(/^(\d{4})-(\d{2})$/);
      const now = new Date();
      const year = match ? Number(match[1]) : now.getFullYear();
      const month = match ? Number(match[2]) : now.getMonth() + 1;
      const start = `${year}-${String(month).padStart(2,'0')}-01`;
      const endDate = new Date(year, month, 0);
      const end = `${year}-${String(month).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`;
      return {
        year,
        month,
        value: `${year}-${String(month).padStart(2,'0')}`,
        start,
        end,
        days: endDate.getDate()
      };
    }

    function employeeMonthShiftV61121(monthValue, delta) {
      const bounds = employeeMonthBoundsV61121(monthValue);
      const d = new Date(bounds.year, bounds.month - 1 + Number(delta || 0), 1);
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    }

    function employeeMonthCanEditV61121(empCode) {
      if (scheduleManagerOwnEmployee(empCode)) return false;
      const role = String(
        state.profile?._realRole
        || state.profile?.role
        || ''
      ).trim().toUpperCase();
      return ['HR_ADMIN','MANAGER','ADMIN','SUPER_ADMIN'].includes(role);
    }


    // V6.15.29 FIX15C — Borrow-aware Monthly Personal access gap.
    // The schedule RPC is intentionally date-scoped: a destination Manager gets
    // rows only while an APPROVED Borrow is effective. A missing active-date row
    // must therefore never be rendered as OFF / unprocessed, because that would
    // invent a schedule outside the Manager's authority window.
    function employeeMonthCurrentRoleV61529F15C() {
      return String(
        state.profile?._realRole
        || state.profile?.role
        || ''
      ).trim().toUpperCase();
    }

    function employeeMonthBorrowDestinationContextV61529F15C(empCode) {
      const code = String(empCode || '').trim();
      if (!code) return null;
      const pools = [
        ...(Array.isArray(state.schedule) ? state.schedule : []),
        ...(Array.isArray(employeeMonthCalendarStateV61121.scheduleRows)
          ? employeeMonthCalendarStateV61121.scheduleRows
          : [])
      ];
      const dates=[];
      const explicitFrom=[];
      const explicitTo=[];
      let result=null;
      for (const row of pools) {
        if (String(row?.emp_code || '').trim() !== code) continue;
        const ctx = scheduleTeamContextMetaV61526(row);
        const stateCode = String(ctx?.assignment_state || ctx?.assignment_type || '').trim().toUpperCase();
        if (stateCode !== 'BORROW_CROSS_ORG' || ctx?.can_edit_schedule !== true) continue;
        const workDate=String(row?.work_date||'').slice(0,10);
        if(workDate)dates.push(workDate);
        const from=String(ctx?.effective_from||ctx?.assignment_effective_from||ctx?.borrow_effective_from||'').slice(0,10);
        const to=String(ctx?.effective_to||ctx?.assignment_effective_to||ctx?.borrow_effective_to||'').slice(0,10);
        if(from)explicitFrom.push(from);
        if(to)explicitTo.push(to);
        if(!result){
          result={
            isBorrowDestination:true,
            homeOrg:String(ctx?.home_org_code || ctx?.employee_org_code || '').trim(),
            workingOrg:String(ctx?.team_org_code || '').trim(),
            teamCode:String(ctx?.team_code || '').trim()
          };
        }
      }
      if(!result)return null;
      dates.sort();explicitFrom.sort();explicitTo.sort();
      result.effectiveFrom=explicitFrom[0]||dates[0]||'';
      result.effectiveTo=explicitTo[explicitTo.length-1]||dates[dates.length-1]||'';
      return result;
    }

    function employeeMonthScopeGapMetaV61529F15C(
      scheduleRow,
      attendanceRow,
      workDate,
      employmentState = 'ACTIVE'
    ) {
      if (employmentState !== 'ACTIVE' || scheduleRow || attendanceRow) return null;
      const role = employeeMonthCurrentRoleV61529F15C();
      if (!['MANAGER','ADMIN','SUPER_ADMIN'].includes(role)) return null;
      const borrow = employeeMonthBorrowDestinationContextV61529F15C(
        employeeMonthCalendarStateV61121.empCode
      );
      if (borrow?.isBorrowDestination) {
        return {
          status:'OUTSIDE_BORROW_WINDOW',
          label:'นอกช่วงยืมตัว',
          tone:'scope',
          detail:'Manager ปลายทางดูและจัดกะได้เฉพาะวันที่รายการยืมตัวมีผล',
          borrow:true
        };
      }
      return {
        status:'OUTSIDE_MANAGER_SCOPE',
        label:'นอกขอบเขตการดูแล',
        tone:'scope',
        detail:'ไม่มีสิทธิ์ดูหรือจัดกะในวันที่นี้',
        borrow:false
      };
    }

    // V6.12.8: Attendance enrichment still uses adaptive date-splitting
    // strategy as Attendance Detail. The previous full-month attendance RPC could
    // hit PostgreSQL statement_timeout even for one employee when calculation / punch
    // metadata was large. Keep each request small and split again only when needed.
    function employeeMonthRangeSplitV6127(range) {
      const start = attendanceParseDate(range?.start);
      const end = attendanceParseDate(range?.end);
      if (!start || !end || start >= end) return null;

      const totalDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
      if (totalDays <= 1) return null;

      const leftDays = Math.ceil(totalDays / 2);
      const leftEnd = new Date(start.getTime());
      leftEnd.setUTCDate(leftEnd.getUTCDate() + leftDays - 1);

      const rightStart = new Date(leftEnd.getTime());
      rightStart.setUTCDate(rightStart.getUTCDate() + 1);

      return [
        { start: attendanceFormatDate(start), end: attendanceFormatDate(leftEnd) },
        { start: attendanceFormatDate(rightStart), end: attendanceFormatDate(end) }
      ];
    }

    async function fetchEmployeeMonthAttendanceChunkV6127(empCode, range, depth = 0) {
      const common = {
        p_start_date: range.start,
        p_end_date: range.end,
        p_emp_codes: [empCode],
        p_attendance_statuses: null,
        p_schedule_statuses: null,
        p_limit: 5000
      };

      let response = await state.client.rpc(
        'ta_get_attendance_detail_v61463',
        { ...common, p_area: null, p_sub_area: null, p_department: null }
      );

      if (response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
        response = await state.client.rpc(
          'ta_get_attendance_detail_v664',
          { ...common, p_zone: null, p_department: null }
        );
      }
      if (response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
        response = await state.client.rpc(
          'ta_get_attendance_detail_v640',
          { ...common, p_zone: null, p_department: null }
        );
      }
      if (response.error && window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
        response = await state.client.rpc(
          'ta_get_attendance_detail_v619',
          { ...common, p_area: null, p_sub_area: null, p_department: null }
        );
      }

      if (response.error && attendanceIsTimeout(response.error) && depth < 6) {
        const split = employeeMonthRangeSplitV6127(range);
        if (split) {
          const left = await fetchEmployeeMonthAttendanceChunkV6127(empCode, split[0], depth + 1);
          const right = await fetchEmployeeMonthAttendanceChunkV6127(empCode, split[1], depth + 1);
          return [...left, ...right];
        }
      }

      if (response.error) throw response.error;
      return response.data || [];
    }

    async function fetchEmployeeMonthAttendanceDetailV61138(empCode, bounds) {
      // Start with 14-day chunks (same proven size as Attendance Detail), then
      // recursively split 14 -> 7 -> 4 -> 2 -> 1 day only when the DB reports timeout.
      const ranges = attendanceChunkRanges(bounds.start, bounds.end, 14).reverse();
      const collected = [];

      for (const range of ranges) {
        const rows = await fetchEmployeeMonthAttendanceChunkV6127(empCode, range, 0);
        collected.push(...rows);
      }

      const unique = new Map();
      collected.forEach((row, index) => {
        const date = String(row?.work_date || '').slice(0,10);
        const key = date || `__row_${index}`;
        unique.set(key, row);
      });

      return [...unique.values()].sort((a,b) =>
        String(a?.work_date || '').localeCompare(String(b?.work_date || ''))
      );
    }

    async function fetchEmployeeMonthScheduleChunkV6127(empCode, bounds, range, depth = 0) {
      try {
        return await window.TimeClockShiftAPI.getMonthlySchedule(
          window.TimeClockApp || { state },
          {
            p_month: `${bounds.value}-01`,
            p_start_date: range.start,
            p_end_date: range.end,
            p_zone: null,
            p_department: null,
            p_emp_codes: [empCode],
            p_schedule_statuses: null,
            // one employee x <=14 days is always below the RPC page size
            p_disable_range_paging: true
          }
        );
      } catch (error) {
        if (attendanceIsTimeout(error) && depth < 6) {
          const split = employeeMonthRangeSplitV6127(range);
          if (split) {
            const left = await fetchEmployeeMonthScheduleChunkV6127(empCode, bounds, split[0], depth + 1);
            const right = await fetchEmployeeMonthScheduleChunkV6127(empCode, bounds, split[1], depth + 1);
            return [...left, ...right];
          }
        }
        throw error;
      }
    }

    async function fetchEmployeeMonthScheduleV6127(empCode, bounds) {
      // Legacy fallback retained only when V6.12.8 lightweight RPC has not been installed.
      const ranges = attendanceChunkRanges(bounds.start, bounds.end, 14).reverse();
      const collected = [];

      for (const range of ranges) {
        const rows = await fetchEmployeeMonthScheduleChunkV6127(empCode, bounds, range, 0);
        collected.push(...rows);
      }

      const unique = new Map();
      collected.forEach((row, index) => {
        const emp = String(row?.emp_code || '').trim();
        const date = String(row?.work_date || '').slice(0,10);
        const key = emp && date ? `${emp}|${date}` : `__row_${index}`;
        unique.set(key, row);
      });
      return [...unique.values()];
    }

    // V6.14.28: app-core does not share the private withTimeout helpers from
    // shift-api/system-period IIFEs. Keep a Monthly Personal scoped helper so
    // both the dedicated schedule RPC and canonical day-off balance can time out
    // without throwing `ReferenceError: withTimeout is not defined`.
    function employeeMonthWithTimeoutV61427(promise, milliseconds = 30000, label = 'คำขอ') {
      let timer = null;
      return Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`${label} ใช้เวลานานเกิน ${Math.round(milliseconds / 1000)} วินาที`)),
            milliseconds
          );
        })
      ]).finally(() => {
        if (timer !== null) clearTimeout(timer);
      });
    }

    async function fetchEmployeeMonthScheduleV6130(empCode, bounds) {
      // V6.14.30 consistency rule:
      // MONTHLY PERSONAL OVERVIEW must use the exact same canonical Schedule Grid
      // transport as "ตารางกะรายบุคคล • เต็มเดือน". The old dedicated RPC was
      // logically based on the same grid, but it could time out independently and
      // it created a second read path that was harder to prove identical at runtime.
      //
      // Base schedule = ta_get_schedule_range_light_v61425 through getMonthlySchedule.
      // Enrichment = the same Work Plan + Scheduling Rule enrichers used by Full Month.
      const rows = await window.TimeClockShiftAPI.getMonthlySchedule(
        window.TimeClockApp || { state },
        {
          p_month: `${bounds.value}-01`,
          p_start_date: bounds.start,
          p_end_date: bounds.end,
          p_zone: null,
          p_department: null,
          p_emp_codes: [empCode],
          p_schedule_statuses: null,
          p_disable_range_paging: true
        }
      );

      const canonicalRows = (rows || []).map(row => ({ ...row }));
      const period = {
        startDate: bounds.start,
        endDate: bounds.end,
        month: bounds.value,
        viewMode: 'PERSON',
        personDisplayMode: 'MONTH'
      };

      // Full Month renders base rows first and enriches asynchronously. Monthly
      // Personal has only one employee, so wait for both enrichers before drawing
      // the popup. That makes Shift Code / effective time / Work Template /
      // Scheduling Rule deterministic and equal to the final Full Month state.
      await Promise.all([
        enrichScheduleWorkPlanMetaV6118(period, canonicalRows),
        window.TimeClockSchedulingRulesV6120?.enrichScheduleRows?.(canonicalRows)
      ]);

      const unique = new Map();
      canonicalRows.forEach((row, index) => {
        const emp = String(row?.emp_code || '').trim();
        const date = String(row?.work_date || '').slice(0,10);
        const key = emp && date ? `${emp}|${date}` : `__row_${index}`;
        unique.set(key, row);
      });
      return [...unique.values()].sort((a,b) =>
        String(a?.work_date || '').localeCompare(String(b?.work_date || ''))
      );
    }

    // V6.14.30: Attendance/Punch/Certification enrich the personal calendar,
    // but they must never overwrite the canonical schedule fields. This mirrors
    // scheduleMergeTeamAttendanceRowV61411 and extends the protection to Work
    // Pattern, day classification, Work Template and Scheduling Rule metadata.
    const EMPLOYEE_MONTH_SCHEDULE_KEYS_V61429 = Object.freeze([
      'emp_code','full_name','start_date','resign_date','position_name','department','zone','area','sub_area','pc',
      'day_type','is_public_holiday','is_weekly_off','holiday_name','expected_day',
      'auto_shift_code','suggested_shift_code','suggestion_confidence','assigned_shift_code','effective_shift_code',
      'is_confirmed','schedule_status','shift_start_time','shift_end_time','schedule_note','schedule_source',
      'pattern_code','pattern_name','template_code','default_shift_code','employee_default_template_code',
      'daily_work_template_code','effective_work_template_code','template_category','customer_window_start','customer_window_end',
      'work_plan_status','schedule_rule_mode','work_mode_code','base_shift_code','generated_shift_code',
      'first_segment_end','second_segment_start','second_segment_planned_end','custom_start_time','custom_end_time',
      'off_window_start','off_window_end','off_basis_shift_code','planned_minutes',
      'pattern_scheduled_minutes','pattern_standard_work_minutes','shift_pattern_match'
    ]);

    function employeeMonthMergeCanonicalV61429(scheduleRow, attendanceRow) {
      if (!scheduleRow && !attendanceRow) return null;
      const merged = {
        ...(scheduleRow || {}),
        ...(attendanceRow || {})
      };
      if (scheduleRow) {
        EMPLOYEE_MONTH_SCHEDULE_KEYS_V61429.forEach(key => {
          if (Object.prototype.hasOwnProperty.call(scheduleRow,key)) {
            merged[key] = scheduleRow[key];
          }
        });
      }
      return normalizeAttendanceStatusFromPunchesV61120(merged);
    }

    function employeeMonthEmploymentStateV61429(scheduleRows, workDate) {
      const first = (scheduleRows || []).find(Boolean) || {};
      const startDate = String(first?.start_date || '').slice(0,10);
      const resignDate = String(first?.resign_date || '').slice(0,10);
      if (startDate && workDate < startDate) return 'BEFORE_START';
      if (resignDate && workDate >= resignDate) return 'AFTER_RESIGN';
      return 'ACTIVE';
    }

    function employeeMonthScheduleFallbackStatusV61429(scheduleRow, workDate, employmentState = 'ACTIVE') {
      if (employmentState === 'BEFORE_START') {
        return { status:'BEFORE_START', label:'ยังไม่เริ่มงาน', tone:'neutral' };
      }
      if (employmentState === 'AFTER_RESIGN') {
        return { status:'AFTER_RESIGN', label:'ลาออกแล้ว', tone:'neutral' };
      }
      if (!scheduleRow) {
        return {
          status:'UNPROCESSED',
          label: workDate > todayISO() ? 'รอทำงาน' : 'ยังไม่ประมวลผล',
          tone:'neutral'
        };
      }
      const shift = scheduleResolveShiftMeta(scheduleRow);
      const code = window.tcShiftCode(
        scheduleRow?.assigned_shift_code
        || scheduleRow?.effective_shift_code
        || scheduleRow?.auto_shift_code
        || scheduleRow?.shift_code
        || ''
      );
      if (code === 'LV' || shift?.tone === 'leave') {
        return { status:'LEAVE', label:'ลา', tone:'leave' };
      }
      if (!shift?.isWorking || shift?.tone === 'off' || shift?.tone === 'holiday') {
        return { status:'DAY_OFF', label:'วันหยุด', tone:'off' };
      }
      return {
        status:'UNPROCESSED',
        label: workDate > todayISO() ? 'รอทำงาน' : 'ยังไม่ประมวลผล',
        tone:'neutral'
      };
    }


    // V6.14.73 — Monthly Personal special-punch loader.
    // The V6.11.10 resolver is intentionally expensive because it resolves raw
    // punch ownership across midnight. Calling it for a whole month of normal
    // shifts caused HTTP 500 / statement-timeout errors. We now call it only for
    // special dates, in short contiguous ranges (max 3 days each).
    async function fetchEmployeeMonthSpecialPunchMetaV61473(empCode, scheduleRows = []) {
      const dates = [...new Set(
        (scheduleRows || [])
          .filter(attendanceNeedsPunchMetaV61463)
          .map(row => String(row?.work_date || '').slice(0,10))
          .filter(Boolean)
      )].sort();

      if (!dates.length) return { data: [], error: null, skipped: true };

      const parseDay = value => {
        const [y,m,d] = String(value).split('-').map(Number);
        return new Date(Date.UTC(y,m-1,d));
      };
      const dayDiff = (a,b) => Math.round((parseDay(b)-parseDay(a))/86400000);

      const ranges = [];
      let start = dates[0];
      let end = dates[0];
      let count = 1;
      for (let i=1;i<dates.length;i++) {
        const date = dates[i];
        if (dayDiff(end,date) === 1 && count < 3) {
          end = date;
          count += 1;
        } else {
          ranges.push({ start, end });
          start = end = date;
          count = 1;
        }
      }
      ranges.push({ start, end });

      const rows = [];
      let firstError = null;
      for (const range of ranges) {
        const response = await state.client.rpc(
          'ta_get_attendance_shift_punch_meta_v61110',
          {
            p_start_date: range.start,
            p_end_date: range.end,
            p_emp_codes: [empCode]
          }
        );
        if (response.error) {
          firstError ||= response.error;
          console.warn(
            'Monthly Personal special punch metadata V6.14.73 deferred:',
            range.start,
            range.end,
            response.error
          );
          continue;
        }
        rows.push(...(Array.isArray(response.data) ? response.data : []));
      }

      return { data: rows, error: firstError, skipped: false };
    }

    async function fetchEmployeeMonthBundleV61138(empCode, monthValue, forceFresh = false) {
      const bounds = employeeMonthBoundsV61121(monthValue);
      const cacheKey = employeeMonthCacheKeyV61138(empCode, bounds.value);

      if (!forceFresh) {
        const cached = employeeMonthCacheGetV61138(empCode, bounds.value);
        if (cached) return { ...cached, source: 'CACHE' };
        if (employeeMonthPendingV61138.has(cacheKey)) {
          return employeeMonthPendingV61138.get(cacheKey);
        }
      }

      const loadPromise = (async () => {
        // V6.11.38: all independent monthly reads start together.
        // First load is limited by the slowest query instead of a chain of RPC waits.
        const schedulePromise = fetchEmployeeMonthScheduleV6130(
          empCode,
          bounds
        );

        // V6.14.30 schedulePromise already runs the exact same Work Plan +
        // Scheduling Rule enrichers as Full Month. No second metadata RPC here.
        const workPlanPromise = Promise.resolve({ data: [], error: null });

        const attendancePromise =
          fetchEmployeeMonthAttendanceDetailV61138(empCode, bounds);

        // V6.14.73: Do not scan RAW punch metadata for every Monthly Personal
        // load. Normal STD/S043/S134/S135 days already have canonical IN/OUT in
        // Attendance Detail. Punch metadata is loaded later only for dates that
        // are truly special / multi-segment.
        const punchPromise = Promise.resolve({ data: [], error: null });

        const certificationPromise = state.client.rpc(
          'ta_get_time_certification_range_v61139',
          {
            p_start_date: bounds.start,
            p_end_date: bounds.end,
            p_emp_codes: [empCode]
          }
        );

        // V6.14.28: the Monthly Personal "วันหยุด" KPI must use the same
        // canonical day-off balance as Assignment / Bulk guards. This avoids a
        // browser-side recount that used to exclude public holidays.
        const dayoffBalancePromise = employeeMonthWithTimeoutV61427(
          state.client.rpc('ta_get_dayoff_balance_v61425', {
            p_emp_code: empCode,
            p_month: `${bounds.value}-01`
          }),
          15000,
          'โหลดโควต้าวันหยุด Monthly Personal V6.14.30'
        );

        // FIX15N: Public holidays must not depend on employee Schedule Scope.
        // This read-only calendar RPC contains no employee/team/schedule data.
        const holidayCalendarPromise = employeeMonthWithTimeoutV61427(
          state.client.rpc('ta_get_calendar_holidays_v61529f15n', {
            p_start_date: bounds.start,
            p_end_date: bounds.end
          }),
          10000,
          'โหลดวันหยุดนักขัตฤกษ์ Monthly Personal FIX15N'
        );

        const settled = await Promise.allSettled([
          schedulePromise,
          workPlanPromise,
          attendancePromise,
          punchPromise,
          certificationPromise,
          dayoffBalancePromise,
          holidayCalendarPromise
        ]);

        const [
          scheduleResult,
          workPlanResult,
          attendanceResult,
          punchResult,
          certificationResult,
          dayoffBalanceResult,
          holidayCalendarResult
        ] = settled;

        // Schedule is the structural source of the monthly calendar. After adaptive
        // splitting it should normally succeed; if it still fails, keep the real error.
        if (scheduleResult.status === 'rejected') throw scheduleResult.reason;

        const scheduleData = scheduleResult.value || [];
        const workPlanResponse = workPlanResult.status === 'fulfilled'
          ? workPlanResult.value
          : { data: [], error: workPlanResult.reason };
        const attendanceData = attendanceResult.status === 'fulfilled'
          ? (attendanceResult.value || [])
          : [];
        const punchResponse = punchResult.status === 'fulfilled'
          ? punchResult.value
          : { data: [], error: punchResult.reason };
        const certificationResponse = certificationResult.status === 'fulfilled'
          ? certificationResult.value
          : { data: [], error: certificationResult.reason };
        const dayoffBalanceResponse = dayoffBalanceResult.status === 'fulfilled'
          ? dayoffBalanceResult.value
          : { data: null, error: dayoffBalanceResult.reason };
        const holidayCalendarResponse = holidayCalendarResult.status === 'fulfilled'
          ? holidayCalendarResult.value
          : { data: [], error: holidayCalendarResult.reason };
        const holidayRows = !holidayCalendarResponse?.error
          ? (holidayCalendarResponse?.data || []).map(row => ({ ...row }))
          : [];
        const dayoffBalance = !dayoffBalanceResponse?.error
          && dayoffBalanceResponse?.data
          && typeof dayoffBalanceResponse.data === 'object'
          ? { ...dayoffBalanceResponse.data }
          : null;

        if (dayoffBalanceResponse?.error) {
          console.info(
            'Monthly Personal canonical day-off balance unavailable; effective-schedule fallback will be used.',
            scheduleRpcErrorSummaryV6126(dayoffBalanceResponse.error).message || 'DAYOFF_BALANCE_UNAVAILABLE'
          );
        }
        if (holidayCalendarResponse?.error) {
          console.info(
            'Monthly Personal FIX15N holiday calendar unavailable; schedule-row holiday fallback will be used.',
            scheduleRpcErrorSummaryV6126(holidayCalendarResponse.error).message || 'HOLIDAY_CALENDAR_UNAVAILABLE'
          );
        }

        // Attendance is enrichment for the personal overview. Do not blank the whole
        // calendar if only attendance detail is temporarily unavailable.
        if (attendanceResult.status === 'rejected') {
          scheduleLogRpcOnceV6126(
            'employee-month-attendance-v6127',
            'Employee month attendance detail V6.12.8 unavailable; rendering schedule without attendance:',
            attendanceResult.reason
          );
        }

        const scheduleRows = (scheduleData || [])
          .filter(row => {
            const date = String(row?.work_date || '').slice(0,10);
            return String(row?.emp_code || '') === String(empCode)
              && date >= bounds.start
              && date <= bounds.end;
          })
          .map(row => ({ ...row }));

        if (workPlanResponse.error) {
          scheduleRpcHealthV6126.workPlanMetaFailed = true;
          scheduleLogRpcOnceV6126(
            'employee-month-work-plan',
            'Employee month work-plan metadata V6.12.6 unavailable; rendering base schedule:',
            workPlanResponse.error
          );
        }

        const workPlanMap = new Map(
          (workPlanResponse.error ? [] : (workPlanResponse.data || [])).map(meta => [
            `${String(meta?.emp_code || '')}|${String(meta?.work_date || '').slice(0,10)}`,
            meta
          ])
        );
        scheduleRows.forEach(row => {
          const meta = workPlanMap.get(
            `${String(row?.emp_code || '')}|${String(row?.work_date || '').slice(0,10)}`
          );
          if (meta) Object.assign(row, meta);
        });

        // V6.14.73: after Schedule + Work Mode enrichment we know exactly which
        // dates need Shift-2/raw-punch metadata. Normal night shifts (S134/S135)
        // do NOT need this RPC.
        let punchResponseV61473 = punchResponse;
        try {
          punchResponseV61473 = await fetchEmployeeMonthSpecialPunchMetaV61473(
            empCode,
            scheduleRows
          );
        } catch (error) {
          punchResponseV61473 = { data: [], error };
          console.warn('Monthly Personal special punch metadata V6.14.73 unavailable:', error);
        }

        const byDate = new Map();
        (attendanceData || []).forEach(row => {
          const date = String(row?.work_date || '').slice(0,10);
          if (date) byDate.set(date, { ...row });
        });

        if (!punchResponseV61473.error || (punchResponseV61473.data || []).length) {
          (punchResponseV61473.data || []).forEach(meta => {
            const date = String(meta?.work_date || '').slice(0,10);
            if (!date) return;
            const row = byDate.get(date) || {
              emp_code: empCode,
              work_date: date
            };
            Object.assign(row, meta);
            byDate.set(date, row);
          });
        }

        if (!certificationResponse.error) {
          (certificationResponse.data || []).forEach(meta => {
            const date = String(meta?.work_date || '').slice(0,10);
            if (!date) return;
            const row = byDate.get(date) || { emp_code: empCode, work_date: date };
            Object.assign(row, meta);
            byDate.set(date, row);
          });
        }

        const mergedAttendanceRowsV61452 = [...byDate.values()]
          .sort((a,b) => String(a.work_date).localeCompare(String(b.work_date)));
        sanitizeCrossMidnightPunchOwnershipV61452(mergedAttendanceRowsV61452);
        const attendanceRows = mergedAttendanceRowsV61452
          .map(row => normalizeAttendanceStatusFromPunchesV61120(row))
          .sort((a,b) => String(a.work_date).localeCompare(String(b.work_date)));

        employeeMonthCacheSetV61138(
          empCode,
          bounds.value,
          scheduleRows,
          attendanceRows,
          dayoffBalance,
          holidayRows
        );

        return {
          scheduleRows,
          attendanceRows,
          holidayRows,
          dayoffBalance,
          savedAt: Date.now(),
          source: 'NETWORK'
        };
      })();

      employeeMonthPendingV61138.set(cacheKey, loadPromise);

      try {
        return await loadPromise;
      } finally {
        if (employeeMonthPendingV61138.get(cacheKey) === loadPromise) {
          employeeMonthPendingV61138.delete(cacheKey);
        }
      }
    }

    function employeeMonthStatusMetaV61121(row, workDate) {
      if (!row) {
        return {
          status: 'UNPROCESSED',
          label: workDate > todayISO() ? 'รอทำงาน' : 'ยังไม่ประมวลผล',
          tone: 'neutral'
        };
      }
      const flags = attendancePolicyFlagsV61428(row);
      if (flags.upcoming) return { status:'UNPROCESSED', label:'รอทำงาน', tone:'neutral' };
      if (flags.absence) return { status:'ABSENCE', label:'ขาดงาน', tone:'danger' };
      if (flags.leave) return { status:'LEAVE', label:'ลา', tone:'leave' };
      if (flags.dayOff) return { status:'DAY_OFF', label:'วันหยุด', tone:'off' };
      if (flags.late && flags.early) return { status:'LATE_AND_EARLY_LEAVE', label:'สายและกลับก่อน', tone:'late' };
      if (flags.late) return { status:'LATE', label:'สาย', tone:'late' };
      if (flags.early) return { status:'EARLY_LEAVE', label:'กลับก่อน', tone:'early' };
      return { status: flags.primaryStatus || 'NORMAL', label: 'ปกติ', tone: 'normal' };
    }

    // V6.14.67 — Monthly Personal must not label a past scheduled workday as
    // “ยังไม่ประมวลผล” merely because the Attendance enrichment response has no
    // row for that date. The canonical schedule already contains enough evidence
    // (working shift / planned window / leave / day-off) to apply the same
    // Missing-Punch policy used by Attendance Detail. A past planned workday with
    // no IN/OUT is therefore ABSENCE; a future planned workday remains UPCOMING.
    function employeeMonthCanonicalDayV61467(
      scheduleRow,
      attendanceRow,
      workDate,
      employmentState = 'ACTIVE'
    ) {
      const merged = employeeMonthMergeCanonicalV61429(scheduleRow, attendanceRow);

      if (employmentState !== 'ACTIVE') {
        return {
          merged,
          flags: merged ? attendancePolicyFlagsV61428(merged) : null,
          useCanonical: false,
          statusMeta: employeeMonthScheduleFallbackStatusV61429(
            scheduleRow,
            workDate,
            employmentState
          )
        };
      }

      if (!merged) {
        return {
          merged: null,
          flags: null,
          useCanonical: false,
          statusMeta: employeeMonthScheduleFallbackStatusV61429(
            scheduleRow,
            workDate,
            employmentState
          )
        };
      }

      const flags = attendancePolicyFlagsV61428(merged);
      const scheduleDefinesAttendanceState = Boolean(
        scheduleRow
        && (flags.plannedWork || flags.leave || flags.dayOff || flags.upcoming)
      );
      const useCanonical = Boolean(attendanceRow || scheduleDefinesAttendanceState);

      return {
        merged,
        flags,
        useCanonical,
        statusMeta: useCanonical
          ? employeeMonthStatusMetaV61121(merged, workDate)
          : employeeMonthScheduleFallbackStatusV61429(
              scheduleRow,
              workDate,
              employmentState
            )
      };
    }

    function employeeMonthAnomalyHtmlV61121(row) {
      if (!row) return '';
      const bits = [];
      const flags = attendancePolicyFlagsV61428(row);
      if (flags.absence) {
        const reasonText = ({
          MISSING_BOTH:'ไม่ลงเวลาทั้งเข้าและออก',
          MISSING_IN:'ไม่ลงเวลาเข้า',
          MISSING_OUT:'ไม่ลงเวลาออก',
          LATE_30_PLUS:`เข้าหลังเริ่มกะ ${formatNumber(flags.lateMinutes)} นาที`
        })[flags.absenceReason] || '';
        bits.push(`<span class="month-anomaly danger">ขาดงาน${reasonText ? ` • ${safe(reasonText)}` : ''}</span>`);
      } else if (flags.late) {
        bits.push(`<span class="month-anomaly late">สาย ${safe(formatNumber(flags.lateMinutes))} นาที</span>`);
      }
      if (flags.early) {
        bits.push(`<span class="month-anomaly early">กลับก่อน ${safe(formatNumber(flags.earlyMinutes))} นาที</span>`);
      }
      if (flags.leave) bits.push('<span class="month-anomaly leave">ลา</span>');
      return bits.join('');
    }

    function employeeMonthTemplateCodeV61127(row) {
      const raw = String(scheduleWorkTemplateCodeV6118(row) || '').trim().toUpperCase();
      // ST5/ST6 are internal Work Template codes, not Shift codes. Hiding them
      // prevents users from reading the old internal code as the current shift.
      if (['ST5','ST6','SINGLE_0830','SINGLE_0830_1730','SINGLE_0830_1800'].includes(raw)) return '-';
      if (raw === 'SPLIT_FLEX' || raw === 'EARLY_SPLIT_FLEX') return 'เช้า+ดึก';
      return raw || '-';
    }


    function employeeMonthFilterLabelV61480(filterKey = 'all') {
      return ({
        all: 'ทั้งหมด',
        work: 'วันทำงาน',
        dayoff: 'วันหยุด',
        leave: 'ลา',
        absence: 'ขาดงาน',
        late: 'มาสาย',
        early: 'กลับก่อน',
        split: 'งานลูกค้าช่วงดึก',
        anomaly: 'เวลาผิดปกติ',
        holiday: 'วันหยุดนักขัตฤกษ์',
        certified: 'รับรองแล้ว',
        multipunch: 'หลายรายการลงเวลา',
        pending: 'รอทำงาน / ยังไม่ประมวลผล'
      })[String(filterKey || 'all')] || 'ทั้งหมด';
    }

    function employeeMonthPublicHolidayV61480(scheduleRow, shift = null, holidayRow = null) {
      const row = scheduleRow || {};
      const dayType = String(row?.day_type || '').trim().toUpperCase();
      const resolvedShift = shift || (scheduleRow ? scheduleResolveShiftMeta(row) : null);
      const shiftCode = String(
        row?.assigned_shift_code
        || row?.effective_shift_code
        || row?.shift_code
        || ''
      ).trim().toUpperCase();
      return Boolean(
        holidayRow?.holiday_date
        || row?.is_public_holiday
        || dayType === 'PUBLIC_HOLIDAY'
        || resolvedShift?.tone === 'holiday'
        || shiftCode === 'HOL'
      );
    }

    function employeeMonthDayMatchesFilterV61480(filterKey, context = {}) {
      const key = String(filterKey || 'all').trim().toLowerCase();
      if (!key || key === 'all') return true;
      const scheduleRow = context.scheduleRow || null;
      const attendanceRow = context.attendanceRow || null;
      const canonical = context.canonicalDay || null;
      const employmentState = String(context.employmentState || 'ACTIVE').trim().toUpperCase();
      const specialMode = context.specialMode || null;
      const shift = context.shift || { isWorking:false };
      const rawPunchDay = context.rawPunchDay || null;
      const flags = canonical?.flags || null;
      const statusMeta = canonical?.statusMeta || null;
      const holidayRow = context.holidayRow || null;
      const publicHoliday = employeeMonthPublicHolidayV61480(scheduleRow, shift, holidayRow);
      const scopeGap = context.scopeGap || null;

      if (employmentState !== 'ACTIVE') return false;
      // FIX15N: Public Holiday is a company calendar fact, not employee schedule data.
      // It remains visible/filterable even when the destination Manager is outside
      // the effective Borrow window. Other employee-specific filters stay blocked.
      if (key === 'holiday') return publicHoliday;
      if (scopeGap) return false;

      if (key === 'work') {
        return Boolean(
          flags?.plannedWork
          || flags?.upcoming
          || (shift && shift.isWorking && !flags?.dayOff && !flags?.leave)
        );
      }
      if (key === 'dayoff') {
        return Boolean(
          !publicHoliday
          && (
            flags?.dayOff
            || shift?.tone === 'off'
            || scheduleRow?.is_weekly_off
            || ['WEEKLY_OFF','COMP_OFF','DAY_OFF'].includes(
              String(scheduleRow?.day_type || '').trim().toUpperCase()
            )
          )
        );
      }
      if (key === 'leave') return Boolean(flags?.leave);
      if (key === 'absence') return Boolean(flags?.absence);
      if (key === 'late') return Boolean(flags?.late);
      if (key === 'early') return Boolean(flags?.early);
      if (key === 'split') return Boolean(specialMode && ['customer','wait'].includes(String(specialMode.key || '')));
      if (key === 'anomaly') return Boolean(flags && (flags.absence || flags.late || flags.early));
      if (key === 'certified') return Boolean(timeCertificationActiveV61139(attendanceRow || canonical?.merged || {}));
      if (key === 'multipunch') return Boolean(rawPunchDay?.multiple);
      if (key === 'pending') return Boolean(flags?.upcoming || String(statusMeta?.status || '').toUpperCase() === 'UNPROCESSED');
      return true;
    }

    function renderEmployeeMonthHolidayListV61153(scheduleRows = [], holidayRows = []) {
      const root = $('employeeMonthHolidayItemsV61153');
      if (!root) return;

      const holidayMap = new Map();

      // FIX15N: Company holiday calendar is independent from employee visibility.
      // Load it first so Borrow dates outside destination scope still show HOL.
      (holidayRows || []).forEach(row => {
        const workDate = String(row?.holiday_date || row?.work_date || '').slice(0,10);
        if (!workDate) return;
        const name = String(row?.holiday_name || 'วันหยุดนักขัตฤกษ์').trim();
        holidayMap.set(workDate, {
          workDate,
          name: name || 'วันหยุดนักขัตฤกษ์'
        });
      });

      (scheduleRows || []).forEach(row => {
        const workDate = String(row?.work_date || '').slice(0,10);
        if (!workDate) return;

        const dayType = String(row?.day_type || '').trim().toUpperCase();
        const shift = scheduleResolveShiftMeta(row);
        const isHoliday = Boolean(
          row?.is_public_holiday
          || dayType === 'PUBLIC_HOLIDAY'
          || shift.tone === 'holiday'
          || String(
            row?.assigned_shift_code
            || row?.effective_shift_code
            || row?.shift_code
            || ''
          ).trim().toUpperCase() === 'HOL'
        );

        if (!isHoliday) return;

        const name = String(
          row?.holiday_name
          || row?.public_holiday_name
          || row?.holiday_label
          || 'วันหยุดนักขัตฤกษ์'
        ).trim();

        holidayMap.set(
          workDate,
          {
            workDate,
            name: name || 'วันหยุดนักขัตฤกษ์'
          }
        );
      });

      const holidays = [...holidayMap.values()]
        .sort((a,b) => a.workDate.localeCompare(b.workDate));

      if (!holidays.length) {
        root.innerHTML =
          '<span class="employee-month-holiday-empty-v61153">ไม่มีวันหยุดนักขัตฤกษ์ในเดือนนี้</span>';
        return;
      }

      root.innerHTML = holidays
        .map(item => {
          const date = new Date(`${item.workDate}T00:00:00`);
          const dayName = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'][date.getDay()];
          return `<div class="employee-month-holiday-item-v61153">
            <span class="employee-month-holiday-date-v61153">${safe(formatDate(item.workDate))}</span>
            <strong>${safe(item.name)}</strong>
            <small>${safe(dayName)}</small>
          </div>`;
        })
        .join('');
    }

    function employeeMonthConsumesDayoffFallbackV61426(scheduleRow) {
      if (!scheduleRow) return false;
      const assignedCode = window.tcShiftCode(scheduleRow?.assigned_shift_code || '');
      const effectiveCode = window.tcShiftCode(
        scheduleRow?.effective_shift_code
        || scheduleRow?.auto_shift_code
        || scheduleRow?.shift_code
        || ''
      );
      const code = assignedCode || effectiveCode;
      if (['LV','LEAVE'].includes(code)) return false;

      // scheduleResolveShiftMeta already gives an explicitly assigned working
      // shift precedence over a natural weekly-off/public-holiday date.
      const shift = scheduleResolveShiftMeta(scheduleRow);
      if (shift?.isWorking) return false;

      const dayType = String(scheduleRow?.day_type || '').trim().toUpperCase();
      return Boolean(
        shift?.tone === 'off'
        || shift?.tone === 'holiday'
        || scheduleRow?.is_weekly_off
        || scheduleRow?.is_public_holiday
        || ['WEEKLY_OFF','COMP_OFF','DAY_OFF','HOLIDAY','PUBLIC_HOLIDAY'].includes(dayType)
      );
    }

    function renderEmployeeMonthCalendarV61121() {
      const modal = $('employeeMonthScheduleModal');
      const grid = $('employeeMonthScheduleGrid');
      if (!modal || !grid) return;

      const bounds = employeeMonthBoundsV61121(employeeMonthCalendarStateV61121.month);
      const scheduleRows = employeeMonthCalendarStateV61121.scheduleRows || [];
      const attendanceRows = employeeMonthCalendarStateV61121.attendanceRows || [];
      const holidayRows = employeeMonthCalendarStateV61121.holidayRows || [];
      const scheduleByDate = new Map(scheduleRows.map(row => [String(row.work_date || '').slice(0,10), row]));
      const attendanceByDate = new Map(attendanceRows.map(row => [String(row.work_date || '').slice(0,10), row]));
      const holidayByDateV61529F15N = new Map(
        holidayRows
          .map(row => [String(row?.holiday_date || row?.work_date || '').slice(0,10), row])
          .filter(([date]) => Boolean(date))
      );
      const rawPunchStatsV61460 = employeeMonthPunchStatsV61460();
      const rawPunchByDateV61460 = rawPunchStatsV61460.byDay;
      employeeMonthUpdatePunchButtonV61460();
      const firstSchedule = scheduleRows[0] || {};
      const employeeName = firstSchedule.full_name
        || state.schedule.find(row => String(row.emp_code) === String(employeeMonthCalendarStateV61121.empCode))?.full_name
        || employeeMonthCalendarStateV61121.empCode;
      const position = firstSchedule.position_name || '';
      const department = firstSchedule.department || '';
      const canEdit = employeeMonthCanEditV61121(employeeMonthCalendarStateV61121.empCode);
      const patternCode = String(firstSchedule.pattern_code || firstSchedule.work_pattern_code || '').trim().toUpperCase();
      const defaultShiftCodeV6133 = window.tcShiftCode(
        firstSchedule.default_shift_code
        || (patternCode === 'TECH_5D' ? 'STD' : patternCode === 'TECH_6D' ? 'S043' : '')
      );
      const avatarText = String(employeeName || employeeMonthCalendarStateV61121.empCode || '?')
        .trim().replace(/\s+/g,'').slice(0,2);

      setText('employeeMonthScheduleAvatar', avatarText || 'พน');
      setText('employeeMonthScheduleTitle', employeeName);
      setText(
        'employeeMonthScheduleSubtitle',
        `${employeeMonthCalendarStateV61121.empCode}${position ? ` • ${position}` : ''}${department ? ` • ${department}` : ''}`
      );
      const monthNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
      setText('employeeMonthScheduleMonthLabel', `${monthNames[bounds.month-1]} ${bounds.year + 543}`);
      setText(
        'employeeMonthSchedulePatternMeta',
        [
          patternCode === 'TECH_5D' ? 'ทำงาน 5 วัน/สัปดาห์' : patternCode === 'TECH_6D' ? 'ทำงาน 6 วัน/สัปดาห์' : patternCode,
          defaultShiftCodeV6133 ? `กะตั้งต้น ${defaultShiftCodeV6133}` : ''
        ].filter(Boolean).join(' • ') || 'รูปแบบการทำงานตามข้อมูลพนักงาน'
      );
      const borrowDestinationContextV61529F15C = employeeMonthBorrowDestinationContextV61529F15C(
        employeeMonthCalendarStateV61121.empCode
      );
      const borrowScopeBannerV61529F15L=$('employeeMonthBorrowScopeBannerV61529F15L');
      if(borrowScopeBannerV61529F15L){
        if(borrowDestinationContextV61529F15C?.isBorrowDestination){
          const from=borrowDestinationContextV61529F15C.effectiveFrom||'';
          const to=borrowDestinationContextV61529F15C.effectiveTo||'';
          const range=from&&to?`${formatDate(from)} – ${formatDate(to)}`:'ตามช่วง Effective Date ของรายการยืมตัว';
          borrowScopeBannerV61529F15L.classList.remove('hidden');
          borrowScopeBannerV61529F15L.innerHTML=`<span class="employee-month-borrow-banner-icon-v61529f15l" aria-hidden="true">↔</span><div><strong>ช่วงที่ Manager ปลายทางจัดกะได้</strong><span>${safe(range)}${borrowDestinationContextV61529F15C.homeOrg?` • ยืมจาก ${safe(borrowDestinationContextV61529F15C.homeOrg)}`:''}${borrowDestinationContextV61529F15C.teamCode?` • ทีม ${safe(borrowDestinationContextV61529F15C.teamCode)}`:''}</span></div><small>วันนอกช่วงจะแสดงเป็นล็อก และไม่ถูกนับเป็นวันหยุดหรือรายการรอประมวลผล</small>`;
        }else{
          borrowScopeBannerV61529F15L.classList.add('hidden');
          borrowScopeBannerV61529F15L.innerHTML='';
        }
      }

      const headerMode = $('employeeMonthHeaderMode');
      if (headerMode) {
        headerMode.className = `employee-month-header-mode-v61127 ${canEdit ? 'editable' : 'readonly'}`;
        headerMode.textContent = canEdit
          ? (borrowDestinationContextV61529F15C?.isBorrowDestination
              ? 'แก้ไขได้เฉพาะช่วงยืมตัว'
              : 'แก้ไขกะได้')
          : 'ดูข้อมูลอย่างเดียว';
      }

      let workdays = 0;
      let scheduledOffDaysV61429 = 0;
      let absenceDays = 0;
      let lateDays = 0;
      let earlyDays = 0;
      let splitDays = 0;
      scheduleRows.forEach(scheduleRow => {
        const date = String(scheduleRow?.work_date || '').slice(0,10);
        if (!date || employeeMonthEmploymentStateV61429(scheduleRows,date) !== 'ACTIVE') return;
        const shift = scheduleResolveShiftMeta(scheduleRow);
        if (shift.isWorking) workdays += 1;
        if (employeeMonthConsumesDayoffFallbackV61426(scheduleRow)) {
          scheduledOffDaysV61429 += 1;
        }
        if (scheduleWorkTemplateCodeV6118(scheduleRow) === 'SPLIT_FLEX') splitDays += 1;
      });

      // Canonical source of truth: exactly the same RPC used by the Assignment
      // day-off quota panel and inherited by the V6.14.3 hard guard.
      const dayoffBalanceV61426 = employeeMonthCalendarStateV61121.dayoffBalance;
      const canonicalUsedV61426 = Number(dayoffBalanceV61426?.used_days);
      const hasCanonicalDayoffV61426 = Number.isFinite(canonicalUsedV61426);
      // The large number means "days shown as day-off in the canonical Full Month
      // schedule". Quota consumption remains canonical and is shown separately
      // underneath, avoiding the old ambiguity between calendar days and quota use.
      const offDays = scheduledOffDaysV61429;
      const quotaDaysV61426 = Number(dayoffBalanceV61426?.month_quota_days);
      const carriedDaysV61426 = Number(dayoffBalanceV61426?.carried_in_days);
      const balanceDaysV61426 = Number(dayoffBalanceV61426?.balance_days);
      const dayoffQuotaDisplayV61478 = Number.isFinite(quotaDaysV61426)
        ? formatNumber(quotaDaysV61426)
        : '-';
      const dayoffUsedDisplayV61478 = hasCanonicalDayoffV61426
        ? formatNumber(canonicalUsedV61426)
        : '-';
      const dayoffKpiValueV61478 = `${dayoffQuotaDisplayV61478}/${dayoffUsedDisplayV61478}`;
      const dayoffMetaV61426 = hasCanonicalDayoffV61426
        ? [
            `ตามตาราง ${formatNumber(offDays)} วัน`,
            Number.isFinite(balanceDaysV61426) ? `คงเหลือ ${formatNumber(balanceDaysV61426)} วัน` : '',
            Number.isFinite(carriedDaysV61426) && carriedDaysV61426 !== 0 ? `ยกมา ${formatNumber(carriedDaysV61426)} วัน` : ''
          ].filter(Boolean).join(' • ')
        : 'นับจากตารางกะเดียวกับรายบุคคลเต็มเดือน';
      // V6.14.67: KPI/anomaly counts use the same merged Calendar + Attendance
      // policy as each day card. This includes past scheduled workdays whose
      // Attendance enrichment row is missing but whose missing punches are still
      // canonically an absence.
      const attendancePolicyDatesV61467 = new Set([
        ...scheduleRows.map(row => String(row?.work_date || '').slice(0,10)),
        ...attendanceRows.map(row => String(row?.work_date || '').slice(0,10))
      ].filter(Boolean));
      const anomalyDateSetV61467 = new Set();
      attendancePolicyDatesV61467.forEach(workDate => {
        const scheduleRow = scheduleByDate.get(workDate) || null;
        const attendanceRow = attendanceByDate.get(workDate) || null;
        const employmentState = employeeMonthEmploymentStateV61429(scheduleRows,workDate);
        const canonical = employeeMonthCanonicalDayV61467(
          scheduleRow,
          attendanceRow,
          workDate,
          employmentState
        );
        if (!canonical.useCanonical || !canonical.flags) return;
        const flags = canonical.flags;
        if (flags.absence) absenceDays += 1;
        if (flags.late) lateDays += 1;
        if (flags.early) earlyDays += 1;
        if (flags.absence || flags.late || flags.early) anomalyDateSetV61467.add(workDate);
      });

      let leaveDays = 0;
      attendancePolicyDatesV61467.forEach(workDate => {
        const scheduleRow = scheduleByDate.get(workDate) || null;
        const attendanceRow = attendanceByDate.get(workDate) || null;
        const employmentState = employeeMonthEmploymentStateV61429(scheduleRows,workDate);
        const canonical = employeeMonthCanonicalDayV61467(
          scheduleRow,
          attendanceRow,
          workDate,
          employmentState
        );
        if (!canonical.useCanonical || !canonical.flags) return;
        if (canonical.flags.leave) leaveDays += 1;
      });

      const certifiedDateSetV61480 = new Set(
        attendanceRows
          .filter(row => timeCertificationActiveV61139(row))
          .map(row => String(row?.work_date || '').slice(0,10))
          .filter(Boolean)
      );
      const certifiedDays = certifiedDateSetV61480.size;
      const anomalyDays = anomalyDateSetV61467.size;

      let holidayDaysV61480 = 0;
      let pendingDaysV61480 = 0;
      for (let dayV61480 = 1; dayV61480 <= bounds.days; dayV61480 += 1) {
        const workDateV61480 = `${bounds.value}-${String(dayV61480).padStart(2,'0')}`;
        const scheduleRowV61480 = scheduleByDate.get(workDateV61480) || null;
        const attendanceRowV61480 = attendanceByDate.get(workDateV61480) || null;
        const employmentStateV61480 = employeeMonthEmploymentStateV61429(scheduleRows,workDateV61480);
        if (employmentStateV61480 !== 'ACTIVE') continue;
        const scopeGapV61529F15C = employeeMonthScopeGapMetaV61529F15C(
          scheduleRowV61480,
          attendanceRowV61480,
          workDateV61480,
          employmentStateV61480
        );
        const holidayRowV61529F15N = holidayByDateV61529F15N.get(workDateV61480) || null;
        const scheduleShiftV61529F15N = scheduleRowV61480
          ? scheduleResolveShiftMeta(scheduleRowV61480)
          : null;
        // FIX15N: count company holidays even outside destination Borrow Scope.
        if (employeeMonthPublicHolidayV61480(scheduleRowV61480, scheduleShiftV61529F15N, holidayRowV61529F15N)) {
          holidayDaysV61480 += 1;
        }
        if (scopeGapV61529F15C) continue;
        const canonicalV61480 = employeeMonthCanonicalDayV61467(
          scheduleRowV61480,
          attendanceRowV61480,
          workDateV61480,
          employmentStateV61480
        );
        const shiftV61480 = scheduleRowV61480
          ? scheduleShiftV61529F15N
          : (canonicalV61480?.merged ? scheduleResolveShiftMeta(canonicalV61480.merged) : { tone:'off', isWorking:false });
        if (
          canonicalV61480?.flags?.upcoming
          || String(canonicalV61480?.statusMeta?.status || '').toUpperCase() === 'UNPROCESSED'
        ) pendingDaysV61480 += 1;
      }

      const multiPunchDaysV61480 = Number(rawPunchStatsV61460?.multipleDays || 0);
      const activeMonthFilterV61480 = String(employeeMonthCalendarStateV61121.activeFilter || 'all').trim().toLowerCase() || 'all';
      const monthFilterKpiClassV61480 = (key, baseClass='') => `month-overview-kpi ${baseClass}`.trim() + (activeMonthFilterV61480===key ? ' is-active-filter-v61479' : '');
      const monthFilterInsightClassV61480 = `month-overview-insight-v61127 ${anomalyDays ? 'has-alert' : 'all-good'}${activeMonthFilterV61480==='anomaly' ? ' is-active-filter-v61479' : ''}`;
      $('employeeMonthScheduleSummary').innerHTML = `
        <button type="button" class="${safe(monthFilterKpiClassV61480('work','primary'))}" data-employee-month-filter="work" aria-pressed="${activeMonthFilterV61480==='work' ? 'true' : 'false'}" title="กดเพื่อกรองวันทำงาน"><div class="month-kpi-icon">ปฏิ</div><div><span>วันทำงาน</span><small>ตามตารางกะเดือนนี้</small></div><strong>${safe(formatNumber(workdays))}</strong></button>
        <button type="button" class="${safe(monthFilterKpiClassV61480('dayoff','off'))}" data-employee-month-filter="dayoff" aria-pressed="${activeMonthFilterV61480==='dayoff' ? 'true' : 'false'}" title="กดเพื่อกรองวันหยุด"><div class="month-kpi-icon">หยุด</div><div><span>โควต้าวันหยุด</span><small>${safe(dayoffMetaV61426)}</small></div><strong>${safe(dayoffKpiValueV61478)}</strong></button>
        <button type="button" class="${safe(monthFilterKpiClassV61480('leave','leave'))}" data-employee-month-filter="leave" aria-pressed="${activeMonthFilterV61480==='leave' ? 'true' : 'false'}" title="กดเพื่อกรองวันลา"><div class="month-kpi-icon">ลา</div><div><span>ลา</span><small>วันลาที่มีรายการอนุมัติ</small></div><strong>${safe(formatNumber(leaveDays))}</strong></button>
        <button type="button" class="${safe(monthFilterKpiClassV61480('absence','danger'))}" data-employee-month-filter="absence" aria-pressed="${activeMonthFilterV61480==='absence' ? 'true' : 'false'}" title="กดเพื่อกรองวันขาดงาน"><div class="month-kpi-icon">ขาด</div><div><span>ขาดงาน</span><small>เวลาไม่ครบ หรือ เข้าช้า ≥ 30 นาที</small></div><strong>${safe(formatNumber(absenceDays))}</strong></button>
        <button type="button" class="${safe(monthFilterKpiClassV61480('late','late'))}" data-employee-month-filter="late" aria-pressed="${activeMonthFilterV61480==='late' ? 'true' : 'false'}" title="กดเพื่อกรองวันมาสาย"><div class="month-kpi-icon">สาย</div><div><span>มาสาย</span><small>เข้าหลังเริ่มกะ 1–29 นาที</small></div><strong>${safe(formatNumber(lateDays))}</strong></button>
        <button type="button" class="${safe(monthFilterKpiClassV61480('early','early'))}" data-employee-month-filter="early" aria-pressed="${activeMonthFilterV61480==='early' ? 'true' : 'false'}" title="กดเพื่อกรองวันกลับก่อน"><div class="month-kpi-icon">ก่อน</div><div><span>กลับก่อน</span><small>จำนวนวันที่ออกก่อนกะ</small></div><strong>${safe(formatNumber(earlyDays))}</strong></button>
        <button type="button" class="${safe(monthFilterKpiClassV61480('split','split'))}" data-employee-month-filter="split" aria-pressed="${activeMonthFilterV61480==='split' ? 'true' : 'false'}" title="กดเพื่อกรองวันงานลูกค้าช่วงดึก"><div class="month-kpi-icon">ดึก</div><div><span>งานลูกค้าช่วงดึก</span><small>วันที่มีช่วงงานกะที่ 2</small></div><strong>${safe(formatNumber(splitDays))}</strong></button>
        <button type="button" class="${safe(monthFilterInsightClassV61480)}" data-employee-month-filter="anomaly" aria-pressed="${activeMonthFilterV61480==='anomaly' ? 'true' : 'false'}" title="กดเพื่อกรองวันที่มีเวลาผิดปกติ"><span>ภาพรวม</span><strong>${anomalyDays ? `พบเวลาผิดปกติ ${safe(formatNumber(anomalyDays))} วัน` : 'ไม่พบเวลาผิดปกติ'}</strong><small>รับรองแล้ว ${safe(formatNumber(certifiedDays))} วัน • กดการ์ดซ้ำเพื่อกลับไปดูทั้งหมด</small></button>`;

      const quickFiltersV61480 = $('employeeMonthQuickFiltersV61480');
      if (quickFiltersV61480) {
        const chipV61480 = (key,label,count,tone='neutral',icon='') => `
          <button type="button" class="employee-month-quick-filter-v61480 tone-${safe(tone)} ${activeMonthFilterV61480===key ? 'is-active-filter-v61480' : ''}" data-employee-month-filter="${safe(key)}" aria-pressed="${activeMonthFilterV61480===key ? 'true' : 'false'}" title="กรอง: ${safe(label)}">
            <span class="employee-month-quick-filter-icon-v61480">${safe(icon)}</span>
            <strong>${safe(label)}</strong>
            <b>${safe(formatNumber(count))}</b>
          </button>`;
        quickFiltersV61480.innerHTML = `
          <span class="employee-month-quick-filter-label-v61480">ตัวกรองเพิ่มเติม</span>
          <button type="button" class="employee-month-quick-filter-v61480 tone-all ${activeMonthFilterV61480==='all' ? 'is-active-filter-v61480' : ''}" data-employee-month-filter="all" aria-pressed="${activeMonthFilterV61480==='all' ? 'true' : 'false'}" title="แสดงทุกวัน"><span class="employee-month-quick-filter-icon-v61480">●</span><strong>ทั้งหมด</strong></button>
          ${chipV61480('holiday','นักขัตฤกษ์',holidayDaysV61480,'holiday','HOL')}
          ${chipV61480('certified','รับรองแล้ว',certifiedDays,'certified','✓')}
          ${chipV61480('multipunch','หลายรายการลงเวลา',multiPunchDaysV61480,'multi','≋')}
          ${chipV61480('pending','รอทำงาน / ยังไม่ประมวลผล',pendingDaysV61480,'pending','◷')}
          <small class="employee-month-quick-filter-help-v61480">เลือกได้ครั้งละ 1 เงื่อนไข • กดซ้ำหรือกด “ทั้งหมด” เพื่อยกเลิก</small>`;
      }

      renderEmployeeMonthHolidayListV61153(scheduleRows, holidayRows);

      const dowNames = ['อา','จ','อ','พ','พฤ','ศ','ส'];
      const firstDow = new Date(bounds.year, bounds.month - 1, 1).getDay();
      let html = dowNames.map((name,index) => `<div class="employee-month-dow ${index===0||index===6?'weekend':''}">${name}</div>`).join('');
      for (let blank = 0; blank < firstDow; blank += 1) {
        html += '<div class="employee-month-day is-blank"></div>';
      }

      for (let day = 1; day <= bounds.days; day += 1) {
        const workDate = `${bounds.value}-${String(day).padStart(2,'0')}`;
        const rawPunchDayV61460 = rawPunchByDateV61460.get(workDate) || null;
        const rawPunchIndicatorV61460 = rawPunchDayV61460?.multiple
          ? `<button type="button" class="employee-month-multi-punch-v61460" data-employee-month-punch-date="${safe(workDate)}" title="พบ ${safe(formatNumber(rawPunchDayV61460.total))} รายการลงเวลา • เข้า ${safe(formatNumber(rawPunchDayV61460.inCount))} / ออก ${safe(formatNumber(rawPunchDayV61460.outCount))} • คลิกดูข้อมูลดิบ" aria-label="ดูข้อมูลการลงเวลาหลายรายการวันที่ ${safe(formatDate(workDate))}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="8" r="4"></circle><path d="M8 6v2.5l1.8 1.2M14 6h7M14 10h7M4 16h17M4 20h17"></path></svg><span>${safe(formatNumber(rawPunchDayV61460.total))}</span></button>`
          : '';
        const scheduleRow = scheduleByDate.get(workDate) || null;
        const attendanceRow = attendanceByDate.get(workDate) || null;
        const holidayRowV61529F15N = holidayByDateV61529F15N.get(workDate) || null;
        const employmentStateV61429 = employeeMonthEmploymentStateV61429(scheduleRows,workDate);
        const scopeGapV61529F15C = employeeMonthScopeGapMetaV61529F15C(
          scheduleRow,
          attendanceRow,
          workDate,
          employmentStateV61429
        );
        const canonicalDayV61467 = employeeMonthCanonicalDayV61467(
          scheduleRow,
          attendanceRow,
          workDate,
          employmentStateV61429
        );
        if (scopeGapV61529F15C) {
          canonicalDayV61467.statusMeta = scopeGapV61529F15C;
          canonicalDayV61467.useCanonical = false;
        }
        const merged = canonicalDayV61467.merged;
        const d = new Date(`${workDate}T00:00:00`);
        const dow = d.getDay();
        const shift = scopeGapV61529F15C
          ? { code:'-', label:scopeGapV61529F15C.label, tone:'scope', isWorking:false }
          : scheduleRow
            ? scheduleResolveShiftMeta(scheduleRow)
            : (merged ? scheduleResolveShiftMeta(merged) : { code:'-', label:'-', tone:'off', isWorking:false });
        const statusMeta = canonicalDayV61467.statusMeta;
        const actualIn = merged ? scheduleTeamSegmentActualTime(merged, 1, 'IN') : '-';
        const actualOut = merged ? scheduleTeamSegmentActualTime(merged, 1, 'OUT') : '-';
        const splitSourceV61429 = scheduleRow || merged;
        const specialModeV61459 = scheduleSpecialWorkModeMetaV61459(splitSourceV61429);
        const split = Boolean(specialModeV61459 && ['customer','wait'].includes(specialModeV61459.key));
        const shift2In = split ? scheduleTeamSegmentActualTime(merged, 2, 'IN') : '-';
        const shift2Out = split ? scheduleTeamSegmentActualTime(merged, 2, 'OUT') : '-';
        const anomalyHtml = employeeMonthAnomalyHtmlV61121(
          canonicalDayV61467.useCanonical ? merged : null
        );
        const templateCode = (scheduleRow || merged) ? employeeMonthTemplateCodeV61127(scheduleRow || merged) : '-';
        const activeEmploymentV61429 = employmentStateV61429 === 'ACTIVE';
        const editButton = canEdit && scheduleRow && activeEmploymentV61429
          ? `<button type="button" class="employee-month-edit-btn" data-employee-month-edit-date="${safe(workDate)}" title="จัดกะ" aria-label="จัดกะ"><span>✎</span><em>กะ</em></button>`
          : '';
        const certificationButton = merged && activeEmploymentV61429 ? timeCertificationButtonV61139(merged,'employee-month') : '';
        const certificationBadge = merged ? timeCertificationBadgeV61139(merged) : '';
        const isToday = workDate === todayISO();
        const workingShiftOverride =
          attendanceHasWorkingShiftOverrideV61155(scheduleRow || merged);

        const calendarHoliday = Boolean(
          holidayRowV61529F15N?.holiday_date
          || scheduleRow?.is_public_holiday
          || scheduleRow?.day_type === 'PUBLIC_HOLIDAY'
        );
        const calendarHolidayNameV61529F15N = String(
          holidayRowV61529F15N?.holiday_name
          || scheduleRow?.holiday_name
          || scheduleRow?.public_holiday_name
          || 'วันหยุดนักขัตฤกษ์'
        ).trim() || 'วันหยุดนักขัตฤกษ์';

        const naturalWeeklyOff = Boolean(
          scheduleRow?.is_weekly_off
          || ['WEEKLY_OFF','COMP_OFF','DAY_OFF'].includes(
            String(scheduleRow?.day_type || '').trim().toUpperCase()
          )
        );

        // A real assigned work shift takes precedence over the natural
        // holiday/off calendar classification for attendance purposes.
        const holiday = Boolean(
          !scopeGapV61529F15C
          && !workingShiftOverride
          && (
            calendarHoliday
            || shift.tone === 'holiday'
          )
        );

        const weeklyOff = Boolean(
          !scopeGapV61529F15C
          && !workingShiftOverride
          && !holiday
          && (
            naturalWeeklyOff
            || shift.tone === 'off'
          )
        );

        const dayKindClass = scopeGapV61529F15C
          ? 'month-day-kind-scope-v61529f15c'
          : employmentStateV61429 === 'BEFORE_START'
            ? 'month-day-kind-inactive-v61429 month-day-before-start-v61429'
            : employmentStateV61429 === 'AFTER_RESIGN'
              ? 'month-day-kind-inactive-v61429 month-day-after-resign-v61429'
              : workingShiftOverride
              ? 'month-day-kind-work-v61153 month-day-work-override-v61155'
              : holiday
                ? 'month-day-kind-holiday-v61153'
                : weeklyOff
                  ? 'month-day-kind-off-v61153'
                  : 'month-day-kind-work-v61153';
        const dayName = ['อา.','จ.','อ.','พ.','พฤ.','ศ.','ส.'][dow];
        const activeMonthFilterV61480 = String(employeeMonthCalendarStateV61121.activeFilter || 'all').trim().toLowerCase() || 'all';
        const dayMatchesFilterV61480 = employeeMonthDayMatchesFilterV61480(activeMonthFilterV61480, {
          scheduleRow,
          attendanceRow,
          canonicalDay: canonicalDayV61467,
          workDate,
          employmentState: employmentStateV61429,
          shift,
          specialMode: specialModeV61459,
          rawPunchDay: rawPunchDayV61460,
          scopeGap: scopeGapV61529F15C,
          holidayRow: holidayRowV61529F15N
        });

        html += `<div class="employee-month-day employee-month-day-v61149 ${dayKindClass} ${dow===0||dow===6?'weekend':''} ${isToday?'is-today':''} ${holiday?'is-holiday':''} ${calendarHoliday?'is-calendar-public-holiday-v61529f15n':''} ${weeklyOff?'is-weekly-off':''} ${employmentStateV61429==='BEFORE_START'?'is-before-start-v61429':employmentStateV61429==='AFTER_RESIGN'?'is-after-resign-v61429':''} tone-${safe(statusMeta.tone)} ${activeMonthFilterV61480!=='all' && !dayMatchesFilterV61480 ? 'is-filter-muted-v61479' : ''} ${activeMonthFilterV61480!=='all' && dayMatchesFilterV61480 ? 'is-filter-hit-v61479' : ''}" data-month-date="${safe(workDate)}" data-filter-match="${dayMatchesFilterV61480 ? '1' : '0'}">
          <div class="employee-month-day-head">
            <div class="employee-month-date-v61127"><strong>${safe(String(day))}</strong><small>${safe(dayName)}</small></div>
            <div class="employee-month-day-head-actions-v61460">${rawPunchIndicatorV61460}${calendarHoliday ? `<span class="employee-month-calendar-holiday-badge-v61529f15n" title="${safe(calendarHolidayNameV61529F15N)}">HOL</span>` : ''}<span class="month-day-status-v61127 tone-${safe(statusMeta.tone)}"><i></i>${safe(statusMeta.label)}</span></div>
          </div>

          ${employmentStateV61429 !== 'ACTIVE' ? `
            <div class="employee-month-inactive-v61429">
              <strong>${safe(statusMeta.label)}</strong>
              <small>${employmentStateV61429==='BEFORE_START' ? 'ตรงกับช่วงก่อนวันเริ่มงานในตารางกะรายบุคคลเต็มเดือน' : 'ตรงกับช่วงหลังวันลาออกในตารางกะรายบุคคลเต็มเดือน'}</small>
            </div>
          ` : scopeGapV61529F15C ? `
            <div class="employee-month-scope-lock-v61529f15c employee-month-scope-lock-v61529f15l" title="${safe(scopeGapV61529F15C.detail)}">
              <div class="employee-month-scope-lock-icon-v61529f15c" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="3"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg></div>
              <strong>${safe(scopeGapV61529F15C.borrow?'นอกช่วงยืมตัว':'นอกขอบเขต')}</strong>
              ${calendarHoliday ? `<div class="employee-month-scope-holiday-v61529f15n" title="${safe(calendarHolidayNameV61529F15N)}"><span>HOL</span><b>${safe(calendarHolidayNameV61529F15N)}</b></div>` : ''}
            </div>
          ` : `
            <div class="employee-month-shift tone-${safe(shift.tone)} shift-color-category-${safe(
              shift.tone === 'night'
                ? 'NIGHT'
                : shift.tone === 'holiday'
                  ? 'HOL'
                  : shift.tone === 'leave'
                    ? 'LV'
                    : shift.tone === 'off'
                      ? 'OFF'
                      : 'DAY'
            )}">
              <div class="employee-month-shift-top-v61127"><b>${safe(shift.code || '-')}</b>${templateCode !== '-' ? `<span class="month-template-code-v61127">${safe(templateCode)}</span>` : ''}</div>
              <small>${safe(shift.label || '-')}</small>
              ${specialModeV61459?.key==='customer'?'<em>+ งานลูกค้าช่วงดึก</em>':specialModeV61459?.key==='wait'?'<em>+ รอเข้ากะดึก</em>':specialModeV61459?.key==='hour'?'<em>• นับชั่วโมง</em>':''}
            </div>

            <div class="employee-month-punch-grid-v61127">
              <div><span>เวลาเข้า</span><b>${safe(actualIn)}</b></div>
              <div><span>เวลาออก</span><b>${safe(actualOut)}</b></div>
            </div>

            ${split ? `<div class="employee-month-punch-grid-v61127 secondary"><div><span>กะ 2 เข้า</span><b>${safe(shift2In)}</b></div><div><span>กะ 2 ออก</span><b>${safe(shift2Out)}</b></div></div>` : ''}

            <div class="employee-month-anomalies">${anomalyHtml || `<span class="month-anomaly ${safe(statusMeta.tone)}">${safe(statusMeta.label)}</span>`}</div>
          `}

          <div class="employee-month-day-footer-v61149">
            <div class="employee-month-cert-slot-v61149">
              ${certificationBadge ? `<div class="employee-month-cert-badge-wrap-v61139">${certificationBadge}</div>` : ``}
            </div>
            <div class="employee-month-day-actions-v61139">${certificationButton}${editButton}</div>
          </div>
        </div>`;
      }

      grid.innerHTML = html;
      $('employeeMonthRecalcBtn')?.classList.toggle('hidden', !state.client);
      const editHintV61529F15C = $('employeeMonthEditHint');
      if (editHintV61529F15C) {
        editHintV61529F15C.classList.toggle('hidden', !canEdit);
        editHintV61529F15C.textContent = canEdit && borrowDestinationContextV61529F15C?.isBorrowDestination
          ? 'คลิก “จัดกะ” ได้เฉพาะวันที่อยู่ในช่วงยืมตัว • วันนอกช่วงจะแสดงเป็นล็อกและไม่ถูกนับเป็นวันหยุดประจำสัปดาห์/รอประมวลผล • วันหยุดนักขัตฤกษ์ยังแสดงตามปฏิทินบริษัท'
          : 'คลิก “จัดกะ” ในแต่ละวันเพื่อแก้ไข';
      }
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden','false');
      document.dispatchEvent(new CustomEvent("timeclock:employee-month-rendered", {
        detail: { month: bounds.value, empCode: employeeMonthCalendarStateV61121.empCode }
      }));
    }

    async function openEmployeeMonthCalendarV61121(
      empCode,
      monthValue = null,
      options = {}
    ) {
      const code = String(empCode || '').trim();
      if (!code) return;

      const month = employeeMonthBoundsV61121(
        monthValue || val('scheduleMonth') || todayISO().slice(0,7)
      ).value;
      const forceFresh = Boolean(options?.forceFresh);

      employeeMonthCalendarStateV61121.empCode = code;
      employeeMonthCalendarStateV61121.month = month;
      employeeMonthCalendarStateV61121.loading = true;
      employeeMonthCalendarStateV61121.timePunchRows = [];
      employeeMonthCalendarStateV61121.timePunchError = null;
      employeeMonthCalendarStateV61121.timePunchMultiOnly = false;
      employeeMonthCalendarStateV61121.activeFilter = 'all';
      employeeMonthClosePunchPanelV61460();
      const loadToken = ++employeeMonthCalendarStateV61121.loadToken;

      const employeeMonthModalV61426 = $('employeeMonthScheduleModal');
      const modalWasHiddenV61426 = Boolean(employeeMonthModalV61426?.classList.contains('hidden'));
      if (modalWasHiddenV61426) {
        const activeV61426 = document.activeElement;
        employeeMonthCalendarStateV61121.returnFocusEl =
          activeV61426 instanceof HTMLElement && !employeeMonthModalV61426?.contains(activeV61426)
            ? activeV61426
            : null;
      }
      employeeMonthModalV61426?.removeAttribute('inert');
      employeeMonthModalV61426?.classList.remove('hidden');
      employeeMonthModalV61426?.setAttribute('aria-hidden','false');
      // Raw punches are intentionally non-blocking so the Calendar remains fast.
      loadEmployeeMonthPunchesV61460({forceFresh}).catch(()=>{});

      const cached = !forceFresh
        ? employeeMonthCacheGetV61138(code, month)
        : null;

      if (cached) {
        employeeMonthCalendarStateV61121.scheduleRows = cached.scheduleRows;
        employeeMonthCalendarStateV61121.attendanceRows = cached.attendanceRows;
        employeeMonthCalendarStateV61121.holidayRows = cached.holidayRows || [];
        employeeMonthCalendarStateV61121.dayoffBalance = cached.dayoffBalance || null;
        renderEmployeeMonthCalendarV61121();
      } else if ($('employeeMonthScheduleGrid')) {
        $('employeeMonthScheduleGrid').innerHTML =
          '<div class="employee-month-loading"><span class="spinner"></span><strong>กำลังโหลดปฏิทินรายเดือน...</strong><small>โหลดตารางกะและ Attendance พร้อมกัน</small></div>';
      }

      try {
        const bundle = await fetchEmployeeMonthBundleV61138(
          code,
          month,
          forceFresh
        );

        // Ignore an older request when user changes month/employee quickly.
        if (loadToken !== employeeMonthCalendarStateV61121.loadToken) return;

        employeeMonthCalendarStateV61121.scheduleRows =
          employeeMonthCloneRowsV61138(bundle.scheduleRows);
        employeeMonthCalendarStateV61121.attendanceRows =
          employeeMonthCloneRowsV61138(bundle.attendanceRows);
        employeeMonthCalendarStateV61121.holidayRows =
          employeeMonthCloneRowsV61138(bundle.holidayRows);
        employeeMonthCalendarStateV61121.dayoffBalance =
          bundle.dayoffBalance && typeof bundle.dayoffBalance === 'object'
            ? { ...bundle.dayoffBalance }
            : null;

        // Manager enrichment is intentionally skipped here:
        // Monthly Personal Overview does not render manager data.
        renderEmployeeMonthCalendarV61121();
      } catch (error) {
        if (loadToken !== employeeMonthCalendarStateV61121.loadToken) return;
        console.error('Employee month calendar:', error);
        toast(humanError(error), 'error');
        if ($('employeeMonthScheduleGrid')) {
          $('employeeMonthScheduleGrid').innerHTML =
            `<div class="employee-month-error">โหลดปฏิทินรายเดือนไม่สำเร็จ<br><small>${safe(humanError(error))}</small></div>`;
        }
      } finally {
        if (loadToken === employeeMonthCalendarStateV61121.loadToken) {
          employeeMonthCalendarStateV61121.loading = false;
        }
      }
    }

    function closeEmployeeMonthCalendarV61121() {
      employeeMonthClosePunchPanelV61460();
      const modalV61426 = $('employeeMonthScheduleModal');
      const activeV61426 = document.activeElement;
      const returnFocusV61426 = employeeMonthCalendarStateV61121.returnFocusEl;

      // Move focus OUT of the modal before setting aria-hidden/inert. Chrome
      // otherwise blocks aria-hidden because the close button still owns focus.
      if (modalV61426?.contains(activeV61426)) {
        if (
          returnFocusV61426 instanceof HTMLElement
          && returnFocusV61426.isConnected
          && !modalV61426.contains(returnFocusV61426)
        ) {
          try { returnFocusV61426.focus({ preventScroll:true }); }
          catch (_) { activeV61426?.blur?.(); }
        } else {
          activeV61426?.blur?.();
        }
      }

      modalV61426?.setAttribute('inert','');
      modalV61426?.classList.add('hidden');
      modalV61426?.setAttribute('aria-hidden','true');
      employeeMonthCalendarStateV61121.returnFocusEl = null;
      window.TimeClockEmployeeMonthReturnContext = null;
    }

    async function recalculateEmployeeMonthV61121() {
      const code = employeeMonthCalendarStateV61121.empCode;
      const month = employeeMonthCalendarStateV61121.month;
      if (!code || !month) return;
      if (!await window.tcConfirm(`ประมวลผลเวลาทำงานใหม่ของ ${code} เดือน ${month} ทั้งเดือน?`)) return;
      const button = $('employeeMonthRecalcBtn');
      if (button) {
        button.disabled = true;
        button.textContent = 'กำลังประมวลผล...';
      }
      showLoading('กำลังประมวลผลเวลาทำงานทั้งเดือน...');
      try {
        const { data, error } = await state.client.rpc(
          'ta_recalculate_employee_month_v61136',
          {
            p_emp_code: code,
            p_month: `${month}-01`
          }
        );
        if (error) {
          if (window.TimeClockShiftAPI?.missingFunction?.(error)) {
            throw new Error('MONTHLY_EMPLOYEE_REBUILD_RPC_V61136_REQUIRED');
          }
          throw error;
        }
        const rebuiltRows = Number(data?.rebuild_inserted_rows || 0);
        const processedEnd = data?.processed_end_date || data?.end_date || '';
        // V6.14.15: the monthly rebuild historically used the pre-certification
        // calculation core. Finish through the canonical certification-aware
        // refresher so Monthly, Attendance Detail, Team Daily and Time View agree.
        if (data?.reason !== 'FUTURE_MONTH' && !data?.deferred && processedEnd) {
          await refreshAttendanceConsistencyRangeV61415(
            data?.start_date || `${month}-01`,
            processedEnd,
            [code]
          );
        }
        toast(
          data?.reason === 'FUTURE_MONTH'
            ? 'เดือนที่เลือกยังเป็นอนาคต จึงยังไม่สร้าง Attendance'
            : data?.deferred
              ? 'ประมวลผลแล้ว แต่ยังไม่มี Attendance ที่พร้อมคำนวณ'
              : `ประมวลผลเดือนนี้เรียบร้อย${rebuiltRows ? ` • Attendance ${formatNumber(rebuiltRows)} วัน` : ''}${processedEnd ? ` • ถึง ${formatDate(processedEnd)}` : ''}`,
          data?.deferred ? 'warning' : 'success'
        );
        employeeMonthCacheInvalidateV61138(code, month);
        await openEmployeeMonthCalendarV61121(code, month, { forceFresh: true });
      } catch (error) {
        toast(humanError(error), 'error');
      } finally {
        hideLoading();
        if (button) {
          button.disabled = false;
          button.textContent = '↻ ประมวลผลเดือนนี้';
        }
      }
    }

    window.TimeClockEmployeeMonthCalendarV61121 = {
      open: openEmployeeMonthCalendarV61121,
      close: closeEmployeeMonthCalendarV61121,
      refresh: () => openEmployeeMonthCalendarV61121(
        employeeMonthCalendarStateV61121.empCode,
        employeeMonthCalendarStateV61121.month,
        { forceFresh: true }
      )
    };

    function renderScheduleTeamView(rows, period, dateMeta) {
      const wrap = $("scheduleTeamWrap");
      if (!wrap) return;

      const focusTeam = String(
        val("scheduleDepartment")
        || val("scheduleTeamFocus")
        || ""
      ).trim();
      const selectedDepartmentV61529F14B=String(val("scheduleDepartment")||"").trim();
      const sourceRows = focusTeam && !selectedDepartmentV61529F14B
        ? (rows || []).filter(row => scheduleUnitLabel(row) === focusTeam)
        : (rows || []);

      const units = new Map();
      let alertCells = 0;
      const totalEmployees = new Set();

      for (const row of sourceRows) {
        const teamCtxV61526 = scheduleOperationalTeamGroupV61526(row);
        const unit = teamCtxV61526.label;
        const teamKeyV61526 = teamCtxV61526.key;
        const date = String(row.work_date || '').slice(0, 10);
        const shiftMeta = scheduleResolveShiftMeta(row);
        totalEmployees.add(String(row.emp_code || ''));

        if (!units.has(teamKeyV61526)) {
          units.set(teamKeyV61526, {
            unit, filterKey:teamKeyV61526, teamContext:teamCtxV61526,
            employees: new Set(),
            tempBorrowed: new Set(),
            tempAssist: new Set(),
            managers: new Map(),
            managerNames: new Map(),
            days: new Map()
          });
        }

        const group = units.get(teamKeyV61526);
        group.employees.add(String(row.emp_code || ''));
        if (teamCtxV61526.state === 'BORROW_CROSS_ORG') group.tempBorrowed.add(String(row.emp_code || ''));
        if (teamCtxV61526.state === 'TEMP_TEAM_ASSIST') group.tempAssist.add(String(row.emp_code || ''));
        const isTemporaryWorkingRowV61529F14B=['BORROW_CROSS_ORG','TEMP_TEAM_ASSIST'].includes(teamCtxV61526.state);
        const managerCodeV61121 = scheduleManagerCodeV61121(row);
        if (managerCodeV61121 && !isTemporaryWorkingRowV61529F14B) {
          group.managers.set(
            managerCodeV61121,
            Number(group.managers.get(managerCodeV61121) || 0) + 1
          );
        }
        const managerNamesV61123 = !isTemporaryWorkingRowV61529F14B && Array.isArray(row?._team_manager_names_v61123)
          ? row._team_manager_names_v61123
          : [];
        managerNamesV61123.forEach(name => {
          const managerName = String(name || '').trim();
          if (!managerName) return;
          group.managerNames.set(
            managerName,
            Number(group.managerNames.get(managerName) || 0) + 1
          );
        });

        if (!group.days.has(date)) {
          group.days.set(date, {
            total: 0,
            changed: 0,
            review: 0,
            working: 0,
            off: 0,
            holiday: 0,
            leave: 0,
            day: 0,
            night: 0,
            split: 0,
            specialCustomer: 0,
            specialWait: 0,
            specialHour: 0,
            specialWarning: 0,
            labels: new Map()
          });
        }

        const day = group.days.get(date);
        day.total += 1;
        if (scheduleRequiresManagerConfirmationV61116(row)) day.changed += 1;
        if (String(row.schedule_status || '').toUpperCase() === 'NEED_REVIEW') {
          day.review += 1;
        }
        if (shiftMeta.isWorking) {
          day.working += 1;
        }
        const templateCode = scheduleWorkTemplateCodeV6118(row);
        const splitWorkTemplate = templateCode === 'SPLIT_FLEX' && shiftMeta.isWorking;
        const specialModeV61459 = scheduleSpecialWorkModeMetaV61459(row);
        if (specialModeV61459?.key === 'customer') day.specialCustomer += 1;
        if (specialModeV61459?.key === 'wait') day.specialWait += 1;
        if (specialModeV61459?.key === 'hour') day.specialHour += 1;
        if (specialModeV61459?.warning) day.specialWarning += 1;
        if (shiftMeta.tone === 'off') day.off += 1;
        if (shiftMeta.tone === 'holiday') day.holiday += 1;
        if (shiftMeta.tone === 'leave') day.leave += 1;
        if (splitWorkTemplate) {
          day.split += 1;
        } else if (shiftMeta.tone === 'day') {
          day.day += 1;
        } else if (shiftMeta.tone === 'night') {
          day.night += 1;
        }

        const labelKey = `${splitWorkTemplate ? 'split' : shiftMeta.tone}||${splitWorkTemplate ? 'กะปกติ+ดึก' : shiftMeta.label}`;
        if (!day.labels.has(labelKey)) {
          day.labels.set(labelKey, {
            label: splitWorkTemplate ? 'กะปกติ+ดึก' : shiftMeta.label,
            tone: splitWorkTemplate ? 'split' : shiftMeta.tone,
            count: 0
          });
        }
        day.labels.get(labelKey).count += 1;
      }

      const teams = [...units.values()].sort((a,b) => a.unit.localeCompare(b.unit, 'th'));
      alertCells = teams.reduce((sum, team) => {
        return sum + [...team.days.values()].filter(day => day.review > 0).length;
      }, 0);

      setText('scheduleTeamEmployeeCount', formatNumber(totalEmployees.size));
      setText('scheduleTeamAlertCount', formatNumber(alertCells));
      setText('scheduleTeamVisibleCount', formatNumber(teams.length));
      if ($('scheduleTeamVisibleCount')) {
        $('scheduleTeamVisibleCount').dataset.value = String(teams.length || 0);
      }
      if (scheduleCurrentView() !== 'PERSON') {
        setText('scheduleSelectedKpi', formatNumber(teams.length));
      }

      const thaiDaysLong = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์','เสาร์'];
      const thaiMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];

      const headDays = period.dates.map(date => {
        const d = parseLocalISO(date);
        const dow = d.getDay();
        const meta = dateMeta.get(date) || {};
        return `<th class="schedule-team-head ${dow===0||dow===6?'weekend':''} ${meta.holiday?'public-holiday-head':''}"><small>${safe(thaiDaysLong[dow])}</small><strong>${safe(String(d.getDate()))}</strong><span>${safe(thaiMonths[d.getMonth()])}</span></th>`;
      }).join('');

      let html = `<table class="schedule-team-table"><thead><tr><th class="schedule-team-unit-head">ทีมช่างเทคนิค</th>${headDays}</tr></thead><tbody>`;

      if (!teams.length) {
        html += `<tr><td colspan="${period.dates.length + 1}" class="table-empty">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</td></tr>`;
      }

      for (const team of teams) {
        const teamCtxV61526=team.teamContext||{};
        const tempCountV61529F14B=Number(team.tempBorrowed?.size||0)+Number(team.tempAssist?.size||0);
        const managerLabelV61121=tempCountV61529F14B>=team.employees.size && team.employees.size>0
          ? 'Manager ทีมปลายทาง'
          : scheduleTeamManagerLabelV61121(team);
        const baseTeamPolicyV61526=teamCtxV61526.state==='CAR_UNASSIGNED'
          ? '<span class="team-scope-chip-v61526 warning">⚠ ต้องจัดทีม</span>'
          : ['MOTORCYCLE_UNASSIGNED','MOTORCYCLE_OPTIONAL'].includes(teamCtxV61526.state)
            ? '<span class="team-scope-chip-v61526 warning">⚠ มอเตอร์ไซค์ต้องมีทีม</span>'
            : teamCtxV61526.state==='UNCLASSIFIED'
              ? '<span class="team-scope-chip-v61526 warning">⚠ รอกำหนดประเภท</span>'
              : `<span class="team-scope-chip-v61526">${safe(teamCtxV61526.code||teamCtxV61526.category||'ทีม')}</span>`;
        const tempTeamPolicyV61529F14B=[
          team.tempBorrowed?.size ? `<span class="team-scope-chip-v61526 borrowed">↔ ยืมชั่วคราว ${safe(formatNumber(team.tempBorrowed.size))}</span>` : '',
          team.tempAssist?.size ? `<span class="team-scope-chip-v61526 assist">→ มาช่วย ${safe(formatNumber(team.tempAssist.size))}</span>` : ''
        ].filter(Boolean).join('');
        const teamPolicyV61526=baseTeamPolicyV61526+tempTeamPolicyV61529F14B;
        html += `<tr><td class="schedule-team-unit-cell"><div class="schedule-team-unit-card team-unit-card-v61115 team-unit-card-v61526"><div class="team-unit-copy-v61115"><span class="team-unit-mark-v61115"></span><div class="team-unit-text-v61121"><strong>${safe(team.unit)}</strong><small>${safe(formatNumber(team.employees.size))} คนในทีม</small>${teamPolicyV61526}<small class="team-unit-manager-v61121"><span>Manager</span><b>${safe(managerLabelV61121)}</b></small></div></div><button class="btn btn-light btn-sm schedule-team-open-btn team-unit-open-v61115" type="button" data-team-open-key-v61526="${safe(team.filterKey||'')}" data-team-open-label-v61526="${safe(team.unit)}">รายคน <span>›</span></button></div></td>`;

        for (const date of period.dates) {
          const day = team.days.get(date);
          if (!day) {
            html += `<td class="schedule-team-day empty"><div class="schedule-team-card empty"><strong>-</strong><small>ไม่มีข้อมูล</small></div></td>`;
            continue;
          }

          const offTotal = day.off + day.holiday;
          const visibleShiftChips = [
            day.day > 0 ? `<span class="team-day-count-v61115 tone-day"><i></i><small>เช้า</small><strong>${safe(formatNumber(day.day))}</strong></span>` : '',
            day.night > 0 ? `<span class="team-day-count-v61115 tone-night"><i></i><small>ดึก</small><strong>${safe(formatNumber(day.night))}</strong></span>` : '',
            day.split > 0 ? `<span class="team-day-count-v61115 tone-split"><i></i><small>ปกติ+ดึก</small><strong>${safe(formatNumber(day.split))}</strong></span>` : '',
            offTotal > 0 ? `<span class="team-day-count-v61115 tone-off"><i></i><small>หยุด</small><strong>${safe(formatNumber(offTotal))}</strong></span>` : ''
          ].filter(Boolean).join('');
          const extraBadges = [
            day.leave > 0
              ? `<span class="team-day-extra tone-leave"><i></i>ลา ${safe(formatNumber(day.leave))}</span>`
              : '',
            day.review > 0
              ? `<span class="team-day-extra tone-review"><i></i>ตรวจสอบ ${safe(formatNumber(day.review))}</span>`
              : ''
          ].filter(Boolean).join('');
          const changeBadge = day.changed > 0
            ? `<span class="team-day-manual-change-v61117"><i></i>ปรับกะ ${safe(formatNumber(day.changed))}</span>`
            : '';
          const specialModeBadgesV61459 = '';

          html += `<td class="schedule-team-day"><button type="button" class="schedule-team-summary-card team-day-card-v61115 ${day.review>0?'has-review':''} ${day.changed>0?'has-change-v61117':'is-standard-v61117'}" data-team-day-key-v61526="${safe(team.filterKey||'')}" data-team-day-label-v61526="${safe(team.unit)}" data-team-day-date="${safe(date)}" title="คลิกเพื่อดูรายชื่อและรายละเอียดกะ">
            ${changeBadge ? `<div class="team-day-top-v61115 team-day-top-manual-v61117">${changeBadge}</div>` : ''}
            <div class="team-day-counts-v61115 team-day-counts-dynamic-v61115 ${[day.day, day.night, day.split, offTotal].filter(value => value > 0).length <= 2 ? 'is-compact' : ''}">
              ${visibleShiftChips || '<span class="team-day-extra-empty">ไม่มีกะทำงาน</span>'}
            </div>
            ${extraBadges ? `<div class="team-day-bottom-v61115 team-day-bottom-extras-v61116"><span class="team-day-extras-v61115">${extraBadges}</span></div>` : ''}
          </button></td>`;
        }
        html += `</tr>`;
      }

      html += `</tbody></table>`;
      wrap.innerHTML = html;
    }

    const scheduleTimeAttendanceStateV6146 = {
      key:'', rows:[], loading:false, error:null, loadedAt:0
    };

    function scheduleTimeAttendanceKeyV6146(period, rows = []) {
      const codes = [...new Set((rows || []).map(row => String(row?.emp_code || '').trim()).filter(Boolean))].sort();
      return [period?.startDate || '', period?.endDate || '', val('scheduleZone') || '', val('scheduleDepartment') || '', codes.join(',')].join('|');
    }

    function scheduleTimeIsTimeoutV6146(error) {
      const message = String(error?.message || error?.details || error?.hint || error || '').toLowerCase();
      return message.includes('statement timeout') || message.includes('canceling statement');
    }

    async function fetchScheduleTimeAttendanceChunkV6146(startDate, endDate, empCodes, depth = 0) {
      if (!empCodes?.length) return [];
      const attempts = [
        ['ta_get_attendance_detail_v61463', {
          p_start_date:startDate,p_end_date:endDate,p_area:null,p_sub_area:null,p_department:null,
          p_emp_codes:empCodes,p_attendance_statuses:null,p_schedule_statuses:null,p_limit:5000
        }],
        ['ta_get_attendance_detail_v664', {
          p_start_date:startDate,p_end_date:endDate,p_zone:null,p_department:null,
          p_emp_codes:empCodes,p_attendance_statuses:null,p_schedule_statuses:null,p_limit:5000
        }],
        ['ta_get_attendance_detail_v640', {
          p_start_date:startDate,p_end_date:endDate,p_zone:null,p_department:null,
          p_emp_codes:empCodes,p_attendance_statuses:null,p_schedule_statuses:null,p_limit:5000
        }]
      ];

      let lastError = null;
      for (const [fn,args] of attempts) {
        const response = await state.client.rpc(fn,args);
        if (!response.error) return Array.isArray(response.data) ? response.data : [];
        lastError = response.error;
        if (!window.TimeClockShiftAPI?.missingFunction?.(response.error)) break;
      }

      if (lastError && scheduleTimeIsTimeoutV6146(lastError) && depth < 4) {
        if (empCodes.length > 1) {
          const mid = Math.ceil(empCodes.length / 2);
          const [left,right] = await Promise.all([
            fetchScheduleTimeAttendanceChunkV6146(startDate,endDate,empCodes.slice(0,mid),depth+1),
            fetchScheduleTimeAttendanceChunkV6146(startDate,endDate,empCodes.slice(mid),depth+1)
          ]);
          return [...left,...right];
        }
        const start = parseLocalISO(startDate);
        const end = parseLocalISO(endDate);
        const days = Math.round((end-start)/86400000)+1;
        if (days > 1) {
          const half = Math.floor(days/2);
          const leftEnd = new Date(start); leftEnd.setDate(start.getDate()+half-1);
          const rightStart = new Date(leftEnd); rightStart.setDate(leftEnd.getDate()+1);
          const [left,right] = await Promise.all([
            fetchScheduleTimeAttendanceChunkV6146(startDate,localISO(leftEnd),empCodes,depth+1),
            fetchScheduleTimeAttendanceChunkV6146(localISO(rightStart),endDate,empCodes,depth+1)
          ]);
          return [...left,...right];
        }
      }
      throw lastError || new Error('ATTENDANCE_TIME_VIEW_LOAD_FAILED');
    }

    async function fetchScheduleTimePunchMetaChunkV61411(startDate, endDate, empCodes) {
      if (!empCodes?.length) return [];
      const attempts = [
        ['ta_get_attendance_shift_punch_meta_v61110', {p_start_date:startDate,p_end_date:endDate,p_emp_codes:empCodes}],
        ['ta_get_attendance_shift_punch_meta_v6119', {p_start_date:startDate,p_end_date:endDate,p_emp_codes:empCodes}]
      ];
      for (const [fn,args] of attempts) {
        const response = await state.client.rpc(fn,args);
        if (!response.error) return Array.isArray(response.data) ? response.data : [];
        if (!window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
          console.warn('Schedule Time punch meta V6.14.13:', response.error);
          return [];
        }
      }
      return [];
    }

    async function fetchScheduleTimeCertificationChunkV61411(startDate, endDate, empCodes) {
      if (!empCodes?.length) return [];
      const response = await state.client.rpc('ta_get_time_certification_range_v61139', {
        p_start_date:startDate, p_end_date:endDate, p_emp_codes:empCodes
      });
      if (!response.error) return Array.isArray(response.data) ? response.data : [];
      if (!window.TimeClockShiftAPI?.missingFunction?.(response.error)) {
        console.warn('Schedule Time certification V6.14.13:', response.error);
      }
      return [];
    }

    async function ensureScheduleTimeAttendanceV6146(period, rows = []) {
      const key = scheduleTimeAttendanceKeyV6146(period, rows);
      if (scheduleTimeAttendanceStateV6146.key === key && (scheduleTimeAttendanceStateV6146.loading || scheduleTimeAttendanceStateV6146.loadedAt)) return;
      scheduleTimeAttendanceStateV6146.key = key;
      scheduleTimeAttendanceStateV6146.rows = [];
      scheduleTimeAttendanceStateV6146.error = null;
      scheduleTimeAttendanceStateV6146.loading = true;
      scheduleTimeAttendanceStateV6146.loadedAt = 0;

      const empCodes = [...new Set((rows || []).map(row => String(row?.emp_code || '').trim()).filter(Boolean))];
      if (!empCodes.length) {
        scheduleTimeAttendanceStateV6146.loading = false;
        scheduleTimeAttendanceStateV6146.loadedAt = Date.now();
        return;
      }

      const chunks = [];
      for (let i=0;i<empCodes.length;i+=45) chunks.push(empCodes.slice(i,i+45));
      const specialPunchSetV61463 = new Set(
        (rows || []).filter(attendanceNeedsPunchMetaV61463)
          .map(row => String(row?.emp_code || '').trim()).filter(Boolean)
      );
      const attendanceRows = [];
      const punchRows = [];
      const certificationRows = [];
      try {
        // V6.14.13: load the same enrichment layers used by TEAM DAILY DETAIL.
        // Keep requests batched to preserve the TIME VIEW performance profile.
        for (let cursor=0; cursor<chunks.length; cursor+=3) {
          const group = chunks.slice(cursor,cursor+3);
          const results = await Promise.all(group.map(async chunk => {
            const [attendance,punch,certification] = await Promise.all([
              fetchScheduleTimeAttendanceChunkV6146(period.startDate,period.endDate,chunk,0),
              fetchScheduleTimePunchMetaChunkV61411(
                period.startDate,
                period.endDate,
                chunk.filter(code => specialPunchSetV61463.has(String(code || '').trim()))
              ),
              fetchScheduleTimeCertificationChunkV61411(period.startDate,period.endDate,chunk)
            ]);
            return {attendance,punch,certification};
          }));
          results.forEach(result => {
            attendanceRows.push(...result.attendance);
            punchRows.push(...result.punch);
            certificationRows.push(...result.certification);
          });
        }

        const byAttendance = new Map();
        attendanceRows.forEach(row => {
          const emp=String(row?.emp_code||'').trim();
          const date=String(row?.work_date||'').slice(0,10);
          if (emp && date) byAttendance.set(`${emp}|${date}`,row);
        });
        const byPunch = new Map();
        punchRows.forEach(row => {
          const emp=String(row?.emp_code||'').trim();
          const date=String(row?.work_date||'').slice(0,10);
          if (emp && date) byPunch.set(`${emp}|${date}`,row);
        });
        const byCertification = new Map();
        certificationRows.forEach(row => {
          const emp=String(row?.emp_code||'').trim();
          const date=String(row?.work_date||'').slice(0,10);
          if (emp && date) byCertification.set(`${emp}|${date}`,row);
        });

        scheduleTimeAttendanceStateV6146.rows = (rows || []).map(scheduleRow => {
          const emp=String(scheduleRow?.emp_code||'').trim();
          const date=String(scheduleRow?.work_date||'').slice(0,10);
          const rowKey=`${emp}|${date}`;
          return scheduleMergeTeamAttendanceRowV61411(
            scheduleRow,
            byAttendance.get(rowKey)||{},
            byPunch.get(rowKey)||{},
            byCertification.get(rowKey)||{}
          );
        });
        sanitizeCrossMidnightPunchOwnershipV61452(scheduleTimeAttendanceStateV6146.rows);
        scheduleTimeAttendanceStateV6146.loadedAt = Date.now();
      } catch (error) {
        scheduleTimeAttendanceStateV6146.error = error;
        console.warn('Schedule Time View V6.14.13:', error);
      } finally {
        scheduleTimeAttendanceStateV6146.loading = false;
        if (scheduleCurrentView() === 'TIME' && scheduleTimeAttendanceStateV6146.key === key) renderSchedule();
      }
    }

    function scheduleTimeMetricsV6146(baseRow, attendanceRow) {
      // V6.14.13: use the exact TEAM DAILY DETAIL classifier. This keeps the
      // summary label and the drawer KPI counts identical for the same team/day.
      const merged = scheduleMergeTeamAttendanceRowV61411(baseRow || {}, attendanceRow || {}, {}, {});
      const flags = scheduleTeamAttendanceFlagsV61411(merged);
      return {
        eligible: !flags.off && !flags.leave,
        normal: flags.normal,
        absence: flags.absence,
        late: flags.late,
        early: flags.early,
        off: flags.off,
        leave: flags.leave,
        pending: flags.pending
      };
    }

    function renderScheduleTimeViewV6146(rows, period, dateMeta) {
      const wrap = $('scheduleTeamWrap');
      if (!wrap) return;
      const key = scheduleTimeAttendanceKeyV6146(period, rows);
      if (scheduleTimeAttendanceStateV6146.key !== key || (!scheduleTimeAttendanceStateV6146.loadedAt && !scheduleTimeAttendanceStateV6146.loading)) {
        ensureScheduleTimeAttendanceV6146(period, rows);
      }

      const attendanceMap = new Map();
      (scheduleTimeAttendanceStateV6146.rows || []).forEach(row => {
        const emp = String(row?.emp_code || '').trim();
        const date = String(row?.work_date || '').slice(0,10);
        if (emp && date) attendanceMap.set(`${emp}|${date}`,row);
      });

      const teams = new Map();
      const teamFilter = String(val('scheduleTeamFocus') || '').trim();
      const totalEmployees = new Set();
      for (const row of rows || []) {
        const teamCtxV61526=scheduleOperationalTeamGroupV61526(row);
        const unit=teamCtxV61526.label;
        const teamKeyV61526=teamCtxV61526.key;
        if (teamFilter && !String(val('scheduleDepartment')||'').trim() && scheduleUnitLabel(row) !== teamFilter) continue;
        const date = String(row?.work_date || '').slice(0,10);
        if (!period.dates.includes(date)) continue;
        const emp = String(row?.emp_code || '').trim();
        if (!teams.has(teamKeyV61526)) teams.set(teamKeyV61526,{unit,filterKey:teamKeyV61526,teamContext:teamCtxV61526,employees:new Set(),tempBorrowed:new Set(),tempAssist:new Set(),days:new Map(),managerNames:new Map()});
        const team = teams.get(teamKeyV61526); team.employees.add(emp); totalEmployees.add(emp);
        if (teamCtxV61526.state === 'BORROW_CROSS_ORG') team.tempBorrowed.add(emp);
        if (teamCtxV61526.state === 'TEMP_TEAM_ASSIST') team.tempAssist.add(emp);
        const names = ['BORROW_CROSS_ORG','TEMP_TEAM_ASSIST'].includes(teamCtxV61526.state)
          ? []
          : (Array.isArray(row?._team_manager_names_v61123) ? row._team_manager_names_v61123 : []);
        names.forEach(name => { const n=String(name||'').trim(); if(n) team.managerNames.set(n,(team.managerNames.get(n)||0)+1); });
        if (!team.days.has(date)) team.days.set(date,{normal:0,absence:0,late:0,early:0,off:0,leave:0,pending:0,eligible:0,specialCustomer:0,specialWait:0,specialHour:0,specialWarning:0});
        const metrics = scheduleTimeMetricsV6146(row, attendanceMap.get(`${emp}|${date}`));
        const day = team.days.get(date);
        const specialModeV61459 = scheduleSpecialWorkModeMetaV61459(row);
        if (specialModeV61459?.key === 'customer') day.specialCustomer += 1;
        if (specialModeV61459?.key === 'wait') day.specialWait += 1;
        if (specialModeV61459?.key === 'hour') day.specialHour += 1;
        if (specialModeV61459?.warning) day.specialWarning += 1;
        if (metrics.eligible) day.eligible += 1;
        if (metrics.normal) day.normal += 1;
        if (metrics.absence) day.absence += 1;
        if (metrics.late) day.late += 1;
        if (metrics.early) day.early += 1;
        if (metrics.off) day.off += 1;
        if (metrics.leave) day.leave += 1;
        if (metrics.pending) day.pending += 1;
      }

      const sorted = [...teams.values()].sort((a,b)=>a.unit.localeCompare(b.unit,'th'));
      const anomalyTotal = sorted.reduce((sum,team)=>sum+[...team.days.values()].reduce((x,d)=>x+d.absence+d.late+d.early,0),0);
      setText('scheduleTeamVisibleCount',formatNumber(sorted.length));
      if ($('scheduleTeamVisibleCount')) $('scheduleTeamVisibleCount').dataset.value=String(sorted.length||0);
      setText('scheduleTeamEmployeeCount',formatNumber(totalEmployees.size));
      setText('scheduleTeamAlertCount',formatNumber(anomalyTotal));
      setText('scheduleSelectedKpi',formatNumber(sorted.length));

      const thaiDaysLong=['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสฯ','ศุกร์','เสาร์'];
      const thaiMonths=['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      const headDays=period.dates.map(date=>{const d=parseLocalISO(date);const dow=d.getDay();const meta=dateMeta.get(date)||{};return `<th class="schedule-team-head ${dow===0||dow===6?'weekend':''} ${meta.holiday?'public-holiday-head':''}"><small>${safe(thaiDaysLong[dow])}</small><strong>${safe(String(d.getDate()))}</strong><span>${safe(thaiMonths[d.getMonth()])}</span></th>`}).join('');
      let html=`<table class="schedule-team-table schedule-time-table-v6146"><thead><tr><th class="schedule-team-unit-head">ทีมช่างเทคนิค</th>${headDays}</tr></thead><tbody>`;
      if (!sorted.length) html += `<tr><td colspan="${period.dates.length+1}" class="table-empty">ไม่พบข้อมูลตามเงื่อนไขที่เลือก</td></tr>`;
      for (const team of sorted) {
        const teamCtxV61526=team.teamContext||{};
        const tempCountV61529F14B=Number(team.tempBorrowed?.size||0)+Number(team.tempAssist?.size||0);
        const managerLabel=tempCountV61529F14B>=team.employees.size && team.employees.size>0
          ? 'Manager ทีมปลายทาง'
          : scheduleTeamManagerLabelV61121(team);
        const baseTeamPolicyV61526=teamCtxV61526.state==='CAR_UNASSIGNED'
          ? '<span class="team-scope-chip-v61526 warning">⚠ ต้องจัดทีม</span>'
          : ['MOTORCYCLE_UNASSIGNED','MOTORCYCLE_OPTIONAL'].includes(teamCtxV61526.state)
            ? '<span class="team-scope-chip-v61526 warning">⚠ มอเตอร์ไซค์ต้องมีทีม</span>'
            : teamCtxV61526.state==='UNCLASSIFIED'
              ? '<span class="team-scope-chip-v61526 warning">⚠ รอกำหนดประเภท</span>'
              : `<span class="team-scope-chip-v61526">${safe(teamCtxV61526.code||teamCtxV61526.category||'ทีม')}</span>`;
        const tempTeamPolicyV61529F14B=[
          team.tempBorrowed?.size ? `<span class="team-scope-chip-v61526 borrowed">↔ ยืมชั่วคราว ${safe(formatNumber(team.tempBorrowed.size))}</span>` : '',
          team.tempAssist?.size ? `<span class="team-scope-chip-v61526 assist">→ มาช่วย ${safe(formatNumber(team.tempAssist.size))}</span>` : ''
        ].filter(Boolean).join('');
        const teamPolicyV61526=baseTeamPolicyV61526+tempTeamPolicyV61529F14B;
        html += `<tr><td class="schedule-team-unit-cell"><div class="schedule-team-unit-card team-unit-card-v61115 team-unit-card-v61526"><div class="team-unit-copy-v61115"><span class="team-unit-mark-v61115"></span><div class="team-unit-text-v61121"><strong>${safe(team.unit)}</strong><small>${safe(formatNumber(team.employees.size))} คนในทีม</small>${teamPolicyV61526}<small class="team-unit-manager-v61121"><span>Manager</span><b>${safe(managerLabel)}</b></small></div></div><button class="btn btn-light btn-sm schedule-team-open-btn team-unit-open-v61115" type="button" data-team-open-key-v61526="${safe(team.filterKey||'')}" data-team-open-label-v61526="${safe(team.unit)}">รายคน <span>›</span></button></div></td>`;
        for (const date of period.dates) {
          const day=team.days.get(date)||{normal:0,absence:0,late:0,early:0,off:0,leave:0,pending:0,eligible:0,specialCustomer:0,specialWait:0,specialHour:0,specialWarning:0};
          const loading=scheduleTimeAttendanceStateV6146.loading && scheduleTimeAttendanceStateV6146.key===key;
          const error=scheduleTimeAttendanceStateV6146.error && scheduleTimeAttendanceStateV6146.key===key;
          const future=date>todayISO();
          let body='';
          if (loading) body='<span class="time-view-loading-v6146">กำลังโหลด...</span>';
          else if (error) body='<span class="time-view-error-v6146">โหลดเวลาไม่สำเร็จ</span>';
          else if (future && day.eligible>0) body=`<span class="time-view-pending-v6146">รอทำงาน ${safe(formatNumber(day.eligible))}</span>`;
          else {
            const timeRowsV6148 = [
              day.normal > 0 ? `<span class="team-day-count-v61115 time-team-row-v6148 tone-time-normal"><i></i><small>ปกติ</small><strong>${safe(formatNumber(day.normal))}</strong></span>` : '',
              day.absence > 0 ? `<span class="team-day-count-v61115 time-team-row-v6148 tone-time-absence"><i></i><small>ขาดงาน</small><strong>${safe(formatNumber(day.absence))}</strong></span>` : '',
              day.late > 0 ? `<span class="team-day-count-v61115 time-team-row-v6148 tone-time-late"><i></i><small>สาย</small><strong>${safe(formatNumber(day.late))}</strong></span>` : '',
              day.early > 0 ? `<span class="team-day-count-v61115 time-team-row-v6148 tone-time-early"><i></i><small>กลับก่อน</small><strong>${safe(formatNumber(day.early))}</strong></span>` : '',
              day.off > 0 ? `<span class="team-day-count-v61115 time-team-row-v6148 tone-time-off"><i></i><small>หยุด</small><strong>${safe(formatNumber(day.off))}</strong></span>` : '',
              day.leave > 0 ? `<span class="team-day-count-v61115 time-team-row-v6148 tone-time-leave"><i></i><small>ลา</small><strong>${safe(formatNumber(day.leave))}</strong></span>` : ''
            ].filter(Boolean);
            body = timeRowsV6148.length
              ? `<div class="team-day-counts-v61115 team-day-counts-dynamic-v61115 time-team-counts-v6148 ${timeRowsV6148.length <= 2 ? 'is-compact' : ''}">${timeRowsV6148.join('')}</div>`
              : '<span class="time-view-empty-v6147">—</span>';
          }
          const timeSpecialBadgesV61459 = '';
          html += `<td class="schedule-team-day"><button type="button" class="schedule-team-summary-card schedule-time-summary-card-v6146 ${(day.absence+day.late+day.early)>0?'has-time-alert-v6146':''}" data-team-day-key-v61526="${safe(team.filterKey||'')}" data-team-day-label-v61526="${safe(team.unit)}" data-team-day-date="${safe(date)}" title="คลิกเพื่อดูรายชื่อและรายละเอียดเวลาเข้า–ออก">${body}</button></td>`;
        }
        html+='</tr>';
      }
      html+='</tbody></table>';
      wrap.innerHTML=html;
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

      fillScheduleTeamFocusOptions(periodRows);
      fillScheduleOperationalTeamOptionsV61526(periodRows);
      if (scheduleCurrentView() === 'TIME') {
        renderScheduleTimeViewV6146(rows, period, dateMeta);
      } else {
        renderScheduleTeamView(rows, period, dateMeta);
      }
      applyScheduleViewMode();

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
        return `<th class="day-col ${classes}" data-select-date="${date}" title="${safe(title)}"><span>${d.getDate()}</span><small>${thaiDays[dow]}${meta.holiday?" •":""}</small></th>`;
      }).join("");

      let html = `<table class="schedule-table enterprise-schedule-table weekly-schedule-table monthly-person-schedule-table-v61146 month-fit-table-v6137 month-copy-table-v61413" data-month-days="${period.dates.length}"><thead><tr><th class="sticky-col-1 schedule-code-head"><label class="person-copy-head-v61413" title="เลือกพนักงานสำหรับคัดลอก/วางกะทั้งเดือน"><input type="checkbox" id="scheduleMonthCopySelectAllV61413" aria-label="เลือกพนักงานปลายทางทั้งหมด"><span>รหัส</span></label></th><th class="sticky-col-2 schedule-name-head">ชื่อ-นามสกุล</th><th class="sticky-col-3 schedule-position-head">ตำแหน่ง</th>${headDays}</tr></thead><tbody>`;

      if (!map.size) html += emptyRow(period.dates.length + 3);

      const today = todayISO();

      // V6.11.50:
      // For a logged-in Manager, keep the Manager's own employee row at the
      // top so it is immediately visible. Other employees preserve the
      // original order returned by the schedule dataset.
      const personEntriesV61150 = [...map.entries()]
        .map((entry,index) => ({
          entry,
          index,
          managerOwn:
            scheduleManagerOwnEmployee(
              entry[0]
            )
        }))
        .sort((a,b) => {
          if (a.managerOwn !== b.managerOwn) {
            return a.managerOwn ? -1 : 1;
          }
          return a.index - b.index;
        })
        .map(item => item.entry);

      const personSectionsV616T = schedulePersonTeamSectionsV616T(personEntriesV61150, period);
      for (const personSectionV616T of personSectionsV616T) {
        html += schedulePersonTeamHeaderV616T(personSectionV616T, period.dates.length + 3);
        if (String(scheduleViewState.personTeamGroupMode || 'TEAM').toUpperCase() === 'TEAM' && schedulePersonCollapsedTeamsV616T.has(String(personSectionV616T.key||''))) continue;
        for (const [emp, obj] of personSectionV616T.entries) {
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

        const borrowWindowV61529F15L = scheduleBorrowDestinationWindowV61529F15L(obj.days);
        const borrowWindowBadgeV61529F15L = scheduleBorrowWindowBadgeV61529F15L(borrowWindowV61529F15L);

        const managerOwnBadge =
          managerOwnEmployee
            ? `<span class="schedule-self-readonly-badge" title="ตนเอง • ดูอย่างเดียว — Manager ดูกะของตนเองได้ แต่ไม่สามารถจัดกะให้ตนเอง" aria-label="ตนเอง ดูอย่างเดียว"><svg class="schedule-self-readonly-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.75"></circle></svg></span>`
            : "";

        html += `<tr class="${managerOwnEmployee?"manager-self-schedule-row":""}" data-emp-row="${safe(emp)}" data-pattern-code="${safe(rowPattern)}" data-start-date="${safe(employeeStartDate)}" data-resign-date="${safe(employeeResignDate)}"><td class="sticky-col-1 schedule-emp-code" ${employeeSelectAttr} title="${managerOwnEmployee?"ข้อมูลของตนเอง • ดูอย่างเดียว":"เลือกทั้งแถว"}"><div class="person-row-select-v61413"><input type="checkbox" data-month-copy-emp="${safe(emp)}" data-manager-own="${managerOwnEmployee?'true':'false'}" aria-label="เลือก ${safe(displayName)} สำหรับคัดลอกหรือวางกะทั้งเดือน"><span>${safe(emp)}</span></div></td><td class="sticky-col-2 nowrap schedule-emp-name" ${employeeSelectAttr}><div class="schedule-name-line schedule-name-line-v61121"><div class="schedule-name-main-v61121"><strong class="${nameClass}">${safe(displayName)}</strong><span class="schedule-pattern-badge ${patternClass}" title="${safe(schedulePatternLabel(rowPattern))}">${safe(schedulePatternShort(rowPattern))}</span>${borrowWindowBadgeV61529F15L}${managerOwnBadge}</div><button type="button" class="schedule-month-calendar-btn-v61121" data-person-month-calendar="1" data-emp="${safe(emp)}" data-month="${safe(period.month)}" title="ดูปฏิทินกะและเวลาทำงานทั้งเดือน" aria-label="เปิดปฏิทินรายเดือน">▦</button></div><small>${safe(canonicalOrgNameV616Q(obj.meta) || obj.meta.zone || "")}</small></td><td class="sticky-col-3 nowrap schedule-emp-position" title="${safe(employeePosition || "-")}">${safe(employeePosition || "-")}</td>`;

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
              && date >= employeeResignDate
            );

          if(afterResign) {
            html += `<td class="day-col empty-schedule-day post-resign-day" title="ตั้งแต่วันลาออก ${safe(formatDate(employeeResignDate))}"><span class="schedule-cell disabled post-resign-cell">ลาออก</span></td>`;
            continue;
          }

          if (!r) {
            if (obj._personTeamGroupV616T) {
              html += `<td class="day-col empty-schedule-day team-other-context-day-v616t" title="วันที่นี้อยู่ใน Working Team อื่น"><span class="schedule-cell disabled team-other-context-cell-v616t">·</span></td>`;
              continue;
            }
            const borrowGapV61529F15L=Boolean(borrowWindowV61529F15L);
            const scopeLabelV61529F15L=borrowGapV61529F15L?'นอกช่วงยืมตัว':'นอกขอบเขตการดูแล';
            const scopeTitleV61529F15L=borrowGapV61529F15L
              ? `นอกช่วงยืมตัว • Manager ปลายทางจัดกะได้ ${formatDate(borrowWindowV61529F15L.from)}–${formatDate(borrowWindowV61529F15L.to)}`
              : 'ไม่มีสิทธิ์ดูหรือจัดกะในวันที่นี้';
            html += `<td class="day-col empty-schedule-day out-of-scope-day ${borrowGapV61529F15L?'borrow-out-of-scope-day-v61529f15l':''}" title="${safe(scopeTitleV61529F15L)}"><span class="schedule-cell disabled out-of-scope-cell out-of-scope-cell-v61529f15l" aria-label="${safe(scopeLabelV61529F15L)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="3"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg><span class="sr-only">${safe(scopeLabelV61529F15L)}</span></span></td>`;
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
          const normalizedCode =
            window.tcShiftCode(code);
          const schedulingRuleDisplayV6120 =
            window.TimeClockSchedulingRulesV6120?.rowDisplay?.(r) || null;

          const codeClass = normalizedCode.replace(
            /[^A-Z0-9_-]/g,
            ""
          );

          const shiftMaster = state.filters.shifts.find(
            shift =>
              window.tcShiftCode(
                shift.shift_code
              ) === normalizedCode
          );

          const effectiveWindowV6133 = scheduleEffectiveShiftWindowV6133(r);
          const shiftStart = formatTime(effectiveWindowV6133.start);
          const shiftEnd = formatTime(effectiveWindowV6133.end);
          const showShiftTime =
            !scheduleIsNonWorkingShiftV61447(normalizedCode,shiftMaster)
            && shiftStart !== "-"
            && shiftEnd !== "-";
          const shiftTimeLabel = showShiftTime
            ? `${shiftStart}–${shiftEnd}`
            : "";

          const effectiveWorkTemplate =
            scheduleWorkTemplateCodeV6118(
              r
            );

          const customerStart =
            formatTime(
              r.customer_window_start
            );

          const customerEnd =
            formatTime(
              r.customer_window_end
            );

          const customerEndLabel =
            customerEnd !== "-"
              ? customerEnd
              : (
                  r.work_plan_status
                    ? "ตามเวลาออก"
                    : "-"
                );

          const splitWorkTemplate =
            effectiveWorkTemplate === "SPLIT_FLEX"
            || Boolean(
              r?.shift_2_planned_start_at
              || r?.shift_2_planned_end_at
              || r?.shift_2_code
              || r?.shift_2_shift_code
              || r?.second_shift_code
            )
            || customerStart !== "-";

          const personShiftTooltipV61146 = [
            `กะ ${normalizedCode || "-"}`,
            showShiftTime
              ? `เวลาเริ่ม–สิ้นสุด ${shiftTimeLabel}`
              : (
                  normalizedCode === "OFF"
                    ? "วันหยุด / OFF"
                    : normalizedCode === "HOL"
                      ? "วันหยุดนักขัตฤกษ์ / HOL"
                      : normalizedCode === "LV"
                        ? "วันลา / LV"
                        : "ไม่พบเวลาเริ่ม–สิ้นสุดกะ"
                ),
            splitWorkTemplate
              ? `กะที่ 2 ${customerStart}–${customerEndLabel}`
              : null
          ].filter(Boolean).join("|");

          const scheduleTimeHtml = "";

          const shiftVisualClass =
            normalizedCode === "HOL"
              ? "shift-visual-holiday"
              : normalizedCode === "LV"
                ? "shift-visual-leave"
                : normalizedCode === "OFF"
                  || shiftMaster?.is_workday === false
                  ? "shift-visual-off"
                  : shiftMaster?.is_night_shift === true
                    || window.tcIsNightShiftCode(normalizedCode)
                    || String(shiftMaster?.shift_name || "")
                      .toLowerCase()
                      .includes("กลางคืน")
                    || String(shiftMaster?.shift_name || "")
                      .toLowerCase()
                      .includes("กะดึก")
                    ? "shift-visual-night"
                    : "shift-visual-day";

          const workingTeamMetaV61529F14B=scheduleTemporaryWorkingMetaV61529F14B(r);
          const workingTeamReadOnlyV61529F14B=!scheduleWorkingTeamCanEditV61529F14B(r);
          const cls = `shift-${codeClass} ${shiftVisualClass} ${r.schedule_status==='NEED_REVIEW'?'review':''} ${r.schedule_status==='CONFIRMED'?'confirmed':''}`;
          const tdCls = [
            "day-col",
            "schedule-data-cell",
            publicHoliday ? "public-holiday-cell" : "",
            weeklyOff ? "weekly-off-cell" : "",
            date > today ? "future-schedule-cell" : "",
            workingTeamMetaV61529F14B ? "temporary-working-cell-v61529f14b" : "",
            workingTeamReadOnlyV61529F14B ? "working-team-readonly-cell-v61529f14b" : ""
          ].filter(Boolean).join(" ");

          const dayLabel = publicHoliday
            ? (r.holiday_name || "วันหยุดนักขัตฤกษ์")
            : weeklyOff
              ? "วันหยุดประจำสัปดาห์"
              : "วันทำงาน";

          const changedFromStandardV61117 = scheduleRequiresManagerConfirmationV61116(r);
          const statusLabel = changedFromStandardV61117
            ? "หัวหน้างานกำหนด • บันทึกแล้ว"
            : "ตามกะมาตรฐาน";

          const calcBits = [
            schedulingRuleDisplayV6120?.label || null,
            shiftTimeLabel
              ? `เวลากะ ${shiftTimeLabel}`
              : null,
            r.pattern_code,
            scheduleWorkTemplateLabelV6118(r),
            splitWorkTemplate
              ? `กะที่ 2 ${customerStart}-${customerEndLabel}`
              : null,
            r.calculation_status,
            Number(r.overtime_minutes||0)>0 ? `OT ${attendanceMinutesToHourMinuteV61457(r.overtime_minutes)} ชม.` : null,
            Number(r.waiting_minutes||0)>0 ? `รอ ${attendanceMinutesToHourMinuteV61457(r.waiting_minutes)} ชม.` : null,
            r.comp_off_earned ? "ได้วันหยุดชดเชย" : null
          ].filter(Boolean).join(" | ");

          const calcFlags =
            `${Number(r.waiting_minutes||0)>0?'<small class="schedule-calc-flag wait">W</small>':''}` +
            `${r.comp_off_earned?'<small class="schedule-calc-flag comp">C</small>':''}`;

          const scheduleReadyV616T=scheduleTeamReadyV616T(r);
          const scheduleReadinessLabelV616T=scheduleTeamReadinessLabelV616T(r);
          const scheduleCellReadOnlyV61529F14B=managerOwnEmployee||workingTeamReadOnlyV61529F14B||!scheduleReadyV616T;
          const editAttrs =
            managerOwnEmployee
              ? `data-manager-self-readonly="1"`
              : workingTeamReadOnlyV61529F14B
                ? `data-working-team-readonly="1"`
                : !scheduleReadyV616T
                  ? `data-schedule-readiness-blocked-v616t="1"`
                  : `data-schedule-cell="1" data-emp="${safe(r.emp_code)}" data-date="${safe(date)}" data-shift="${safe(code)}" data-status="${safe(r.schedule_status)}"`;

          const cellTitle =
            managerOwnEmployee
              ? `${displayName} | ${dayLabel} | ${statusLabel}${calcBits?` | ${calcBits}`:""} | Manager ไม่สามารถจัดกะให้ตนเอง`
              : workingTeamReadOnlyV61529F14B
                ? `${displayName} | ${dayLabel} | ${statusLabel}${calcBits?` | ${calcBits}`:""} | ${workingTeamMetaV61529F14B?.label||'Working Team'} • ดูอย่างเดียว • Manager/Acting ทีมปลายทางเป็นผู้จัดกะ`
                : !scheduleReadyV616T
                  ? `${displayName} | ${scheduleReadinessLabelV616T} • ต้องกำหนดรูปแบบและจัดเข้าทีมก่อนจัดกะ`
                  : `${displayName} | ${dayLabel} | ${statusLabel}${calcBits?` | ${calcBits}`:""} | ดับเบิลคลิกเพื่อแก้ไข`;

          const secondShiftCodeV61147 =
            splitWorkTemplate
              ? schedulePersonSecondShiftCodeV61147(r)
              : '';

          const personShiftIconMetaV6136 = schedulePersonIconMetaV6136(r);
          const personShiftIconHtmlV6136 = schedulePersonIconHtmlV6136(r);
          const personShiftTooltipV6136 = schedulePersonTooltipV6136(r, {
            statusLabel,
            patternLabel: rowPattern ? `รูปแบบ ${schedulePatternLabel(rowPattern)}` : null
          });
          const iconAriaV6136 = `${personShiftIconMetaV6136.label}${normalizedCode && normalizedCode !== '-' ? ` ${normalizedCode}` : ''}${shiftTimeLabel ? ` ${shiftTimeLabel}` : ''}`;

          const personSpecialToneStyleV61458 = schedulePersonSpecialToneStyleV61458(personShiftIconMetaV6136.tone);
          html += `<td class="${tdCls} ${managerOwnEmployee?"manager-self-readonly-cell":""}" data-cell-key="${safe(r.emp_code)}|${safe(date)}"><span class="schedule-cell schedule-icon-only-v6136 ${cls} icon-tone-${safe(personShiftIconMetaV6136.tone)} ${scheduleCellReadOnlyV61529F14B?"working-team-readonly-v61529f14b":""} ${!scheduleReadyV616T?"schedule-readiness-blocked-v616t":""}" ${personSpecialToneStyleV61458 ? `style="${personSpecialToneStyleV61458}"` : ''} ${editAttrs} data-shift-tooltip="${safe(cellTitle)}" aria-label="${safe(iconAriaV6136)}">${personShiftIconHtmlV6136}</span></td>`;
        }

        html += `</tr>`;
        }
      }

      html += `</tbody></table>`;
      $("scheduleTableWrap").innerHTML = html;
      requestAnimationFrame(() => scheduleFitPersonFullMonthV6137(period));
      setText("scheduleEmployeeCount", formatNumber(map.size));
      const changedRowsV61117 = rows.filter(scheduleRequiresManagerConfirmationV61116);
      const splitRowsV61117 = rows.filter(r => scheduleWorkTemplateCodeV6118(r) === "SPLIT_FLEX");
      const reviewRowsV61117 = rows.filter(r => String(r.schedule_status || '').toUpperCase() === "NEED_REVIEW");
      setText("scheduleAssignedCount", formatNumber(changedRowsV61117.length));
      setText("scheduleConfirmedCount", formatNumber(splitRowsV61117.length));
      setText("scheduleReviewCount", formatNumber(reviewRowsV61117.length));
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
              ? "ST5"
              : "ST6",
            display_order: 1
          },
          {
            category_code: "NORMAL_LATE_CUSTOMER",
            category_name: "กะปกติ + งานลูกค้าช่วงดึก",
            template_code: "SPLIT_FLEX",
            display_order: 2
          }
        ];
      }

      const normalLabel = pattern === "TECH_5D"
        ? "กะปกติ 5 วัน/สัปดาห์ • 9.5 ชม.รวมพัก"
        : "กะปกติ 6 วัน/สัปดาห์ • 9 ชม.รวมพัก";

      const normalized = options
        .filter(
          o =>
            o?.template_code
            && !String(
              o.category_code
              || ""
            ).toUpperCase()
              .includes(
                "EARLY"
              )
            && !String(
              o.template_code
              || ""
            ).toUpperCase()
              .includes(
                "EARLY"
              )
        )
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

    async function fillAssignmentTemplateSelect(
      patternCode,
      selectedTemplate
    ) {
      const select =
        $("assignWorkTemplate");

      if(!select){
        return;
      }

      select.disabled =
        true;

      select.innerHTML =
        '<option value="">กำลังโหลดรูปแบบช่วงงาน...</option>';

      const options =
        await assignmentTemplateOptions(
          patternCode
        );

      const fallback =
        patternCode ===
          "TECH_5D"
          ? "ST5"
          : "ST6";

      const selected =
        String(
          selectedTemplate
          || fallback
        )
          .trim()
          .toUpperCase();

      const usable = options.filter(
        option => {
          const code = String(
            option?.template_code
            || ''
          ).trim().toUpperCase();
          return Boolean(code)
            && !code.includes('EARLY');
        }
      );

      let target =
        usable.find(
          option =>
            String(
              option.template_code
              || ""
            )
              .trim()
              .toUpperCase() ===
            selected
        );

      if(!target){
        target =
          usable.find(
            option =>
              String(
                option.template_code
                || ""
              )
                .trim()
                .toUpperCase() ===
              fallback
          )
          || usable.find(
            option =>
              String(
                option.category_code
                || ""
              )
                .trim()
                .toUpperCase() ===
              "NORMAL"
          )
          || usable[0];
      }

      if(!target?.template_code){
        select.innerHTML =
          '<option value="">ไม่พบรูปแบบช่วงงาน</option>';

        setText(
          "assignWorkTemplateHelp",
          "ไม่พบ Template ที่พร้อมใช้งาน กรุณาตรวจสอบ Tab รูปแบบการทำงาน"
        );

        return;
      }

      select.innerHTML = usable.map(option => {
        const code = String(option.template_code || '').trim().toUpperCase();
        const label = code === 'SPLIT_FLEX'
          ? 'กะปกติ + งานลูกค้าช่วงดึก (เฉพาะวันนี้)'
          : (option.category_name || option.template_name || 'กะปกติ');
        return `<option value="${safe(option.template_code)}">${safe(label)}</option>`;
      }).join('');

      select.value =
        target.template_code;

      select.dataset.patternCode =
        patternCode;

      select.dataset.employeeDefaultTemplate =
        fallback;

      setText(
        "assignWorkTemplateHelp",
        "เลือกเป็นรายวัน • ค่าเริ่มต้นคือกะปกติ • เลือกงานลูกค้าช่วงดึกเฉพาะวันที่มีงานจริง"
      );

      select.disabled =
        false;

      fillShiftSelect(
        patternCode,
        $("assignShiftCode")?.value
        || null,
        target.template_code
      );

      select.dispatchEvent(
        new Event(
          "change",
          {
            bubbles:true
          }
        )
      );
    }

    async function openAssignment(empCode, workDate) {
      const teamDailyContext = window.TimeClockTeamDailyReturnContext;
      if (
        teamDailyContext?.source === 'team-daily-detail'
        && (
          String(teamDailyContext.empCode || '') !== String(empCode || '')
          || String(teamDailyContext.workDate || '').slice(0,10) !== String(workDate || '').slice(0,10)
        )
      ) {
        window.TimeClockTeamDailyReturnContext = null;
      }
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
      ) || employeeMonthCalendarStateV61121.scheduleRows.find(
        x =>
          String(x.emp_code || '') === String(empCode || '')
          && String(x.work_date || '').slice(0,10) === String(workDate || '').slice(0,10)
      );
      const patternCode = r?.pattern_code || r?.resolved_pattern_code || (String(r?.pc || "").match(/4/) ? "TECH_5D" : "TECH_6D");
      const selectedShift = r?.assigned_shift_code || r?.suggested_shift_code || r?.effective_shift_code || r?.default_shift_code || (patternCode === "TECH_5D" ? "STD" : "S043");
      setVal("assignEmpCode", empCode); setVal("assignWorkDate", workDate);
      const assignmentInfoV61428 = $("assignEmployeeInfo");
      if (assignmentInfoV61428) {
        const employeeNameV61428 = r?.full_name || empCode;
        const currentShiftV61428 = r?.assigned_shift_code || r?.effective_shift_code || r?.auto_shift_code || "-";
        const patternLabelV61428 = SHIFT_PATTERN_META[patternCode]?.label || patternCode || '-';
        const initialsV61428 = String(employeeNameV61428 || empCode || '?').trim().replace(/\s+/g,'').slice(0,2);
        assignmentInfoV61428.innerHTML = `<span class="assignment-employee-avatar-v61428">${safe(initialsV61428 || 'พน')}</span><div class="assignment-employee-main-v61428"><strong>${safe(employeeNameV61428)}</strong><small>${safe(empCode)} • ${safe(formatDate(workDate))}</small></div><div class="assignment-employee-tags-v61428"><span>${safe(patternLabelV61428)}</span><span>กะปัจจุบัน <b>${safe(currentShiftV61428)}</b></span></div>`;
      }
      fillShiftSelect(patternCode, selectedShift);
      setVal("assignShiftCode", selectedShift);
      setVal("assignNote", r?.schedule_note || ""); setVal("assignReason", "กำหนดกะจากหน้าปฏิทิน");
      $("assignShiftCode").dataset.patternCode = patternCode;
      await fillAssignmentTemplateSelect(
        patternCode,
        r?.daily_work_template_code
        || (
          r?.work_plan_status
            ? r?.effective_work_template_code
            : null
        )
        || (
          patternCode ===
            "TECH_5D"
            ? "ST5"
            : "ST6"
        )
      );
      $("deleteAssignmentBtn").classList.toggle("hidden", !r?.assigned_shift_code);
      // V6.14.37: build neighbor rows from the SAME visible source as the
      // Assignment entry point. Monthly Personal may show an approved full-day
      // leave from Attendance while the structural Schedule still carries S043/STD.
      // Preserve that leave overlay so the popup preview matches the calendar.
      const assignmentNeighborRowsV61437 = [-1,1].map(offset => {
        const d = parseLocalISO(workDate);
        d.setDate(d.getDate()+offset);
        const neighborDate = localISO(d);
        const structural =
          state.schedule.find(x =>
            String(x.emp_code||'')===String(empCode||'')
            && String(x.work_date||'').slice(0,10)===neighborDate
          )
          || (
            String(employeeMonthCalendarStateV61121.empCode||'')===String(empCode||'')
              ? employeeMonthCalendarStateV61121.scheduleRows.find(x =>
                  String(x.emp_code||'')===String(empCode||'')
                  && String(x.work_date||'').slice(0,10)===neighborDate
                )
              : null
          )
          || null;
        const attendance =
          String(employeeMonthCalendarStateV61121.empCode||'')===String(empCode||'')
            ? employeeMonthCalendarStateV61121.attendanceRows.find(x =>
                String(x.emp_code||'')===String(empCode||'')
                && String(x.work_date||'').slice(0,10)===neighborDate
              )
            : null;
        return employeeMonthMergeCanonicalV61429(structural,attendance)
          || structural
          || attendance
          || null;
      }).filter(Boolean);

      await window.TimeClockSchedulingRulesV6120?.openAssignment?.({
        row:r, empCode, workDate, patternCode, selectedShift,
        neighborRowsV61437:assignmentNeighborRowsV61437
      });
      openModal("assignModal");
      document.dispatchEvent(new CustomEvent("timeclock:schedule-assignment-opened", {
        detail: { empCode, workDate }
      }));
    }

    let scheduleAssignmentSaveInFlightV61530 = false;

    async function saveAssignment() {
      const periodCheck = await window.TimeClockSystemPeriods?.checkScheduleDates?.(
        [val("assignWorkDate")],
        true
      );
      if (periodCheck && !periodCheck.allowed) {
        toast(periodCheck.message || "รอบระบบปิดการจัดกะสำหรับวันที่นี้", "warning");
        await window.TimeClockSystemPeriods?.refreshScheduleGuard?.(true);
        return;
      }

      const rulePreparationV6120 =
        await window.TimeClockSchedulingRulesV6120?.prepareSave?.();
      if (rulePreparationV6120 && rulePreparationV6120.allowed === false) return;

      const selectedTemplate =
        String(
          val("assignWorkTemplate")
          || ""
        )
          .trim()
          .toUpperCase();

      const splitTemplate =
        selectedTemplate ===
        "SPLIT_FLEX";

      const customerStart =
        splitTemplate
          ? val("assignCustomerStart")
          : null;

      const customerEndMode =
        splitTemplate
          ? (
              val("assignCustomerEndMode")
              || "ACTUAL_OUT"
            )
          : "NONE";

      const customerEnd =
        splitTemplate
        && customerEndMode ===
          "FIXED"
          ? val("assignCustomerEnd")
          : null;

      if(
        !selectedTemplate
      ) {
        toast(
          "กรุณาเลือกรูปแบบช่วงงาน",
          "error"
        );
        return;
      }

      if(
        splitTemplate
        && !customerStart
      ) {
        toast(
          "กะปกติ + งานลูกค้าช่วงดึก ต้องระบุคาดว่าจะเริ่มงานลูกค้า",
          "error"
        );
        return;
      }

      if(
        splitTemplate
        && customerEndMode ===
          "FIXED"
        && !customerEnd
      ) {
        toast(
          "กรุณาระบุเวลาคาดว่าจะสิ้นสุด หรือเลือก ตามเวลาออกจริง",
          "error"
        );
        return;
      }

      if (scheduleAssignmentSaveInFlightV61530) {
        toast("กำลังบันทึกกะ กรุณารอให้รายการปัจจุบันเสร็จก่อน", "info");
        return;
      }
      scheduleAssignmentSaveInFlightV61530 = true;
      const scheduleSaveButtonV61530 = $("saveAssignmentBtn");
      if (scheduleSaveButtonV61530) {
        scheduleSaveButtonV61530.disabled = true;
        scheduleSaveButtonV61530.setAttribute("aria-busy", "true");
      }

      const scheduleSaveStartedV6144 = performance.now();
      showLoading(
        window.TimeClockTeamDailyReturnContext?.source === 'team-daily-detail'
          ? "กำลังบันทึกกะและประมวลผลเวลาทำงาน..."
          : "กำลังบันทึกกะและรูปแบบช่วงงาน..."
      );

      try {
        const atomicCtxV61510 = window.TimeClockEmployeeRequestAtomicV61510;
        const atomicSpecialV61510 = Boolean(
          atomicCtxV61510
          && atomicCtxV61510.type === 'SPECIAL_WORK'
          && String(atomicCtxV61510.empCode || '') === String(val("assignEmpCode") || '')
          && String(atomicCtxV61510.workDate || '').slice(0,10) === String(val("assignWorkDate") || '').slice(0,10)
        );

        if (atomicSpecialV61510) {
          const workModeV61510 = String(
            rulePreparationV6120?.mode
            || atomicCtxV61510.requestSubtype
            || ''
          ).trim().toUpperCase();
          const selectedShiftV61510 = String(val("assignShiftCode") || '').trim().toUpperCase();
          const warning48AcknowledgedV61510 = Boolean(
            rulePreparationV6120?.server?.warning_48h === true
            || rulePreparationV6120?.guard?.warning48 === true
          );
          const generatedShiftV61510 = ['HOUR_BASED','SPLIT_WAIT_NIGHT'].includes(workModeV61510)
            ? selectedShiftV61510
            : null;
          const baseShiftV61510 = workModeV61510 === 'SPLIT_WAIT_NIGHT'
            ? (rulePreparationV6120?.baseShiftCode || null)
            : workModeV61510 === 'NORMAL_LATE_CUSTOMER'
              ? selectedShiftV61510
              : null;

          const atomicActionV61510 = {
            shift_code: selectedShiftV61510,
            template_code: selectedTemplate,
            customer_window_start: customerStart || null,
            customer_window_end: customerEnd || null,
            customer_end_mode: customerEndMode,
            work_mode_code: workModeV61510,
            proposed_start_time: rulePreparationV6120?.start || null,
            proposed_end_time: rulePreparationV6120?.end || null,
            planned_minutes: Number(rulePreparationV6120?.planned || 0),
            is_off: Boolean(rulePreparationV6120?.off),
            acknowledge_48h: warning48AcknowledgedV61510,
            base_shift_code: baseShiftV61510,
            generated_shift_code: generatedShiftV61510,
            first_segment_end: workModeV61510 === 'SPLIT_WAIT_NIGHT' ? (rulePreparationV6120?.firstEnd || null) : null,
            second_segment_start: workModeV61510 === 'SPLIT_WAIT_NIGHT' ? (rulePreparationV6120?.secondStart || null) : null,
            second_segment_planned_end: workModeV61510 === 'SPLIT_WAIT_NIGHT' ? (rulePreparationV6120?.end || null) : null,
            custom_start_time: workModeV61510 === 'HOUR_BASED' ? (rulePreparationV6120?.start || null) : null,
            custom_end_time: workModeV61510 === 'HOUR_BASED' ? (rulePreparationV6120?.end || null) : null,
            planned_validation_source: rulePreparationV6120?.source || null,
            validation_snapshot: {
              ui_guard: rulePreparationV6120?.guard || null,
              server_guard: rulePreparationV6120?.server || null,
              request_id: atomicCtxV61510.requestId,
              version: 'V6.15.11'
            }
          };

          const callAtomicSpecialV61510 = async acknowledge48h => {
            const payload = {
              ...atomicActionV61510,
              acknowledge_48h: Boolean(acknowledge48h)
            };
            const { data, error } = await state.client.rpc('ta_apply_employee_request_v61510', {
              p_request_id: atomicCtxV61510.requestId,
              p_action: payload,
              p_note: val("assignNote") || atomicCtxV61510.requestReason || null
            });
            if (error) throw error;
            return data;
          };

          let atomicResultV61510 = await callAtomicSpecialV61510(warning48AcknowledgedV61510);
          if (atomicResultV61510?.requires_48h_confirmation === true) {
            const continuous = Number(atomicResultV61510?.schedule_guard?.continuous_minutes_after || 0);
            const ok = await window.tcConfirm(
              `พนักงานจะมีชั่วโมงทำงานต่อเนื่องประมาณ ${(continuous/60).toLocaleString('th-TH',{maximumFractionDigits:1})} ชั่วโมง\n\nระบบแนะนำให้กำหนดวันหยุด แต่ยังสามารถจัดกะต่อได้\n\nต้องการยืนยันและปิดคำขอนี้หรือไม่?`
            );
            if (!ok) return;
            atomicResultV61510 = await callAtomicSpecialV61510(true);
          }
          if (atomicResultV61510?.applied === false) {
            throw new Error(atomicResultV61510?.message || 'EMPLOYEE_REQUEST_ATOMIC_APPLY_NOT_COMPLETED');
          }

          const savedEmpV61510 = val("assignEmpCode");
          const savedDateV61510 = val("assignWorkDate");
          const savedShiftV61510 = val("assignShiftCode");
          closeModal("assignModal");
          window.TimeClockEmployeeRequestAtomicV61510 = null;
          toast('จัดกะพิเศษและปิดคำขอเรียบร้อย • ทำรายการใน Transaction เดียว','success');
          document.dispatchEvent(new CustomEvent('timeclock:schedule-assignment-saved-v61481', {
            detail: {
              empCode: savedEmpV61510,
              workDate: savedDateV61510,
              shiftCode: savedShiftV61510,
              workMode: workModeV61510,
              atomicRequestApplied: true,
              requestId: atomicCtxV61510.requestId,
              atomicResult: atomicResultV61510
            }
          }));
          return;
        }

        const {
          data:
            saveResult,
          error:
            saveError
        } =
          await state.client.rpc(
            "ta_assign_shift_with_work_plan_v6144",
            {
              p_emp_code:
                val("assignEmpCode"),
              p_work_date:
                val("assignWorkDate"),
              p_shift_code:
                val("assignShiftCode"),
              p_template_code:
                selectedTemplate,
              p_customer_window_start:
                customerStart
                || null,
              p_customer_window_end:
                customerEnd
                || null,
              p_customer_end_mode:
                customerEndMode,
              p_note:
                val("assignNote")
                || null,
              p_change_reason:
                val("assignReason")
                || "กำหนดกะจากหน้าปฏิทิน",
              p_confirm_now:
                assignmentSaveIsAutoConfirmedV61117()
            }
          );

        if(saveError) {
          console.error(
            'Schedule save RPC V6.14.8:',
            scheduleRpcErrorSummaryV6126(saveError)
          );
          if (window.TimeClockShiftAPI?.missingFunction?.(saveError)) {
            throw new Error('SCHEDULE_SAVE_V6144_REQUIRED: กรุณาติดตั้ง Schedule Save V6.14.4 ก่อนใช้งานการบันทึกกะ');
          }
          throw saveError;
        }
        const scheduleSaveRpcMsV6144 = performance.now() - scheduleSaveStartedV6144;
        console.info('[Schedule Save V6.14.8]', {
          rpcMs: Math.round(scheduleSaveRpcMsV6144),
          server: saveResult?.performance || null,
          singleRecalculation: saveResult?.single_recalculation === true
        });
        showLoading("บันทึกกะแล้ว • กำลังอัปเดตข้อมูลหน้าจอ...");
        await window.TimeClockSchedulingRulesV6120?.saveExtension?.({
          saveResult, preparation:rulePreparationV6120
        });
        const savedEmp = val("assignEmpCode");
        const savedDate = val("assignWorkDate");
        // V6.14.15: V6.14.4 recalculates after Shift + Work Plan, but special
        // Scheduling Rule extensions are saved by the frontend immediately after it.
        // Finalize once more AFTER the extension so every screen reads the final rule.
        const consistencyRecalcV61415 = await finalizeScheduleMutationV61415([
          { emp_code:savedEmp, work_date:savedDate }
        ], { source:'assignment-modal' });
        const savedShift = val("assignShiftCode");
        const savedConfirm = assignmentSaveIsAutoConfirmedV61117();
        const currentRow = state.schedule.find(x => x.emp_code === savedEmp && String(x.work_date).slice(0,10) === savedDate);
        if (currentRow) {
          currentRow.assigned_shift_code = savedShift;
          currentRow.effective_shift_code = savedShift;
          const savedShiftMasterV6141 = state.filters.shifts.find(s => window.tcShiftCode(s.shift_code) === window.tcShiftCode(savedShift));
          if(savedShiftMasterV6141){
            currentRow.shift_start_time = savedShiftMasterV6141.start_time || currentRow.shift_start_time || null;
            currentRow.shift_end_time = savedShiftMasterV6141.end_time || currentRow.shift_end_time || null;
          }
          if(rulePreparationV6120?.mode){
            const savedModeV6143=String(rulePreparationV6120.mode||'').toUpperCase();
            currentRow.schedule_rule_mode = savedModeV6143==='LEAVE'?null:rulePreparationV6120.mode;
            currentRow.work_mode_code = savedModeV6143==='LEAVE'?null:rulePreparationV6120.mode;
          }
          currentRow.is_confirmed = savedConfirm;
          currentRow.schedule_status = savedConfirm ? "CONFIRMED" : "ASSIGNED";
          currentRow.daily_work_template_code =
            selectedTemplate;
          currentRow.effective_work_template_code =
            selectedTemplate;
          currentRow.customer_window_start =
            customerStart;
          currentRow.customer_window_end =
            customerEnd;
          currentRow.customer_end_mode =
            customerEndMode;
          currentRow.work_plan_status =
            savedConfirm
              ? "CONFIRMED"
              : "PLANNED";
          scheduleTimeAttendanceStateV6146.key = '';
          scheduleTimeAttendanceStateV6146.loadedAt = 0;
          renderSchedule();
        }
        closeModal("assignModal");
        const attendanceRecalc =
          saveResult
            ?.attendance_recalculation;

        toast(
          attendanceRecalc?.deferred
            ? `บันทึกกะ ${savedShift} เรียบร้อย • ยังไม่มีข้อมูลลงเวลา จึงรอคำนวณเมื่อมี Attendance`
            : `บันทึกกะ ${savedShift} • ${scheduleWorkTemplateLabelV6118({
                effective_work_template_code:
                  selectedTemplate
              })} และประมวลผลเวลาใหม่เรียบร้อย`,
          "success"
        );
        document.dispatchEvent(new CustomEvent('timeclock:schedule-assignment-saved-v61481', {
          detail: {
            empCode: savedEmp,
            workDate: savedDate,
            shiftCode: savedShift,
            workMode: String(rulePreparationV6120?.mode || '').toUpperCase() || 'NORMAL'
          }
        }));

        const returnContext =
          window.TimeClockAttendanceReturnContext;

        if (
          returnContext?.source ===
          "attendance-detail"
        ) {
          // V6.11.15:
          // Attendance was recalculated inside the same SQL transaction
          // that saved the shift. Reload only; do not calculate twice.

          hideLoading();
          switchPage("attendance");
          try{
            await loadAttendance();
          }catch(refreshErr){
            console.warn('Attendance refresh after schedule save V6.14.8:', refreshErr?.message || refreshErr);
            toast('บันทึกกะแล้ว แต่รีเฟรชหน้ารายละเอียดเวลาไม่สำเร็จ กรุณากดรีเฟรชอีกครั้ง','warning');
          }

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

        const teamReturnContext = window.TimeClockTeamDailyReturnContext;
        const monthReturnContext = window.TimeClockEmployeeMonthReturnContext;

        // V6.12.6 performance: a normal calendar save already updates the row in
        // memory. Do not reload the entire scope/month after every single cell save.
        // Refresh only the new scheduling-rule extension for that row. Full reload is
        // still used for drawers/month-calendar return flows that depend on fresh
        // aggregated data.
        if (!teamReturnContext && !monthReturnContext && currentRow) {
          // V6.14.8: the authoritative save has already committed. Do not keep the
          // blocking save overlay open while optional row enrichment runs.
          hideLoading();
          Promise.resolve(
            window.TimeClockSchedulingRulesV6120?.enrichScheduleRows?.([currentRow])
          ).then(() => renderSchedule()).catch(err =>
            console.warn('Schedule row enrichment V6.14.8:', err?.message || err)
          );
          return;
        }

        // Return-flow refreshes can be heavier than the save itself. The save is
        // already committed, so release the blocking overlay before refreshing.
        hideLoading();
        try{
          await loadSchedule();
          if (teamReturnContext?.source === 'team-daily-detail') {
            await openScheduleTeamDrawer(
              teamReturnContext.unit || scheduleUnitLabel(currentRow || {}),
              teamReturnContext.date || savedDate
            );
            scheduleTeamDrawerState.filter = teamReturnContext.filter || 'ALL';
            renderScheduleTeamDrawer();
            window.TimeClockTeamDailyReturnContext = null;
          }
          if (monthReturnContext?.source === 'employee-month-calendar') {
            employeeMonthCacheInvalidateV61138(
              monthReturnContext.empCode || savedEmp,
              monthReturnContext.month || savedDate.slice(0,7)
            );
            await openEmployeeMonthCalendarV61121(
              monthReturnContext.empCode || savedEmp,
              monthReturnContext.month || savedDate.slice(0,7),
              { forceFresh: true }
            );
            window.TimeClockEmployeeMonthReturnContext = null;
          }
        }catch(refreshErr){
          console.warn('Schedule return refresh V6.14.8:', refreshErr?.message || refreshErr);
          toast('บันทึกกะเรียบร้อยแล้ว แต่รีเฟรชหน้าจอไม่สำเร็จ กรุณากดรีเฟรชอีกครั้ง','warning');
        }
      } catch (err) { toast(humanError(err), "error"); }
      finally {
        scheduleAssignmentSaveInFlightV61530 = false;
        const scheduleSaveButtonAfterV61530 = $("saveAssignmentBtn");
        if (scheduleSaveButtonAfterV61530) {
          scheduleSaveButtonAfterV61530.disabled = false;
          scheduleSaveButtonAfterV61530.removeAttribute("aria-busy");
        }
        hideLoading();
      }
    }

    async function deleteAssignment() {
      const periodCheck = await window.TimeClockSystemPeriods?.checkScheduleDates?.(
        [val("assignWorkDate")],
        true
      );
      if (periodCheck && !periodCheck.allowed) {
        toast(periodCheck.message || "รอบระบบปิดการจัดกะสำหรับวันที่นี้", "warning");
        await window.TimeClockSystemPeriods?.refreshScheduleGuard?.(true);
        return;
      }
      const deleteSequenceGuardV61434=await window.TimeClockSchedulingRulesV6120?.validateBulk?.([{
        emp_code:val("assignEmpCode"),
        work_date:val("assignWorkDate"),
        shift_code:null,
        note:"ตรวจเงื่อนไขก่อนลบกะ"
      }]);
      if(deleteSequenceGuardV61434&&deleteSequenceGuardV61434.allowed===false)return;
      if (!await window.tcConfirm("ยืนยันการลบกะที่จัดไว้รายการนี้?")) return;
      showLoading(
        window.TimeClockTeamDailyReturnContext?.source === 'team-daily-detail'
          ? "กำลังลบกะและประมวลผลเวลาทำงาน..."
          : "กำลังลบกะ..."
      );
      try {
        const {
          data:
            deleteResult,
          error:
            deleteError
        } =
          await state.client.rpc(
            "ta_delete_shift_with_work_plan_v6118",
            {
              p_emp_code:
                val("assignEmpCode"),
              p_work_date:
                val("assignWorkDate"),
              p_change_reason:
                "ลบกะจากหน้าปฏิทิน"
            }
          );

        if(deleteError) {
          if(
            String(
              deleteError.message
              || ""
            ).includes(
              "ta_delete_shift_with_work_plan_v6118"
            )
          ) {
            throw new Error(
              "WORK_PLAN_LINKAGE_RPC_REQUIRED"
            );
          }

          throw deleteError;
        }

        await window.TimeClockSchedulingRulesV6120?.deleteExtension?.(
          val("assignEmpCode"),
          val("assignWorkDate")
        );
        await finalizeScheduleMutationV61415([
          { emp_code:val("assignEmpCode"), work_date:val("assignWorkDate") }
        ], { source:'assignment-delete' });

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

          // V6.11.15:
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

        const teamReturnContext = window.TimeClockTeamDailyReturnContext;
        const monthReturnContext = window.TimeClockEmployeeMonthReturnContext;
        await loadSchedule();
        if (teamReturnContext?.source === 'team-daily-detail') {
          await openScheduleTeamDrawer(
            teamReturnContext.unit,
            teamReturnContext.date || val("assignWorkDate")
          );
          scheduleTeamDrawerState.filter = teamReturnContext.filter || 'ALL';
          renderScheduleTeamDrawer();
          window.TimeClockTeamDailyReturnContext = null;
        }
        if (monthReturnContext?.source === 'employee-month-calendar') {
          employeeMonthCacheInvalidateV61138(
            monthReturnContext.empCode || val('assignEmpCode'),
            monthReturnContext.month || String(val('assignWorkDate') || '').slice(0,7)
          );
          await openEmployeeMonthCalendarV61121(
            monthReturnContext.empCode || val('assignEmpCode'),
            monthReturnContext.month || String(val('assignWorkDate') || '').slice(0,7),
            { forceFresh: true }
          );
          window.TimeClockEmployeeMonthReturnContext = null;
        }
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
      const isWorkday = $("smWorkday").checked;
      const startTime = val("smStart") || null;
      const endTime = val("smEnd") || null;
      const patterns = selectedShiftPatternCodes();
      const defaults = selectedShiftDefaultCodes();
      if (!val("smCode")) {
        toast("กรุณาระบุรหัสกะ", "error");
        return;
      }
      if (!startTime || !endTime) {
        toast(isWorkday ? "กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดกะ" : "กะวันหยุดต้องระบุเวลาเริ่มและเวลาสิ้นสุด เพื่อใช้จับคู่กับกะทำงาน", "error");
        return;
      }
      if (isWorkday && !patterns.length) {
        toast("กรุณาเลือกรูปแบบการทำงานอย่างน้อย 1 รูปแบบ", "error");
        return;
      }
      if (!isWorkday && defaults.length) {
        toast("กะวันหยุดไม่สามารถกำหนดเป็นกะตั้งต้นได้", "error");
        return;
      }
      const savePatterns = patterns.length ? patterns : ["TECH_5D","TECH_6D"];
      const autoNight = String(endTime) <= String(startTime);
      showLoading("กำลังบันทึกข้อมูลกะ...");
      try {
        const result = await window.TimeClockShiftAPI.upsertShiftMaster(window.TimeClockApp || { state }, {
          shift_code: val("smCode"),
          shift_name: val("smName"),
          start_time: startTime,
          end_time: endTime,
          is_night_shift: $("smNight").checked || autoNight,
          is_workday: isWorkday,
          break_minutes: isWorkday ? Number(val("smBreak")||0) : 0,
          display_order: Number(val("smOrder")||0),
          note: val("smNote") || null,
          is_active: val("smActive") === "true",
          applicable_pattern_codes: savePatterns,
          default_pattern_codes: isWorkday ? defaults : [],
          change_reason: "บันทึกจากหน้า HR Admin V6.12.6"
        });

        // V6.12.6: ยังคงยืนยันช่วงเวลากะวันหยุดหลังบันทึก เพื่อรองรับ Backend รุ่นเดิม
        // จึงยืนยันช่วงเวลาของ OFF หลังบันทึก Shift Master อีกครั้ง
        if (!isWorkday) {
          const offPatch = await state.client.rpc("ta_force_dayoff_shift_time_v6124", {
            p_shift_code: window.tcShiftCode(val("smCode")),
            p_start_time: startTime,
            p_end_time: endTime,
            p_is_night_shift: $("smNight").checked || autoNight
          });
          if (offPatch.error) throw offPatch.error;
        } else {
          // ถ้ากะทำงานนี้มี OFF คู่กันอยู่ ให้ตามเวลาใหม่อัตโนมัติ
          const pairSync = await state.client.rpc("ta_sync_paired_off_for_work_shift_v6124", {
            p_shift_code: window.tcShiftCode(val("smCode"))
          });
          if (pairSync.error && !window.TimeClockShiftAPI?.missingFunction?.(pairSync.error)) throw pairSync.error;
        }

        closeModal("shiftMasterModal");
        toast(defaults.length && isWorkday ? "บันทึกกะและปรับกะตั้งต้นเรียบร้อย" : "บันทึกข้อมูลกะเรียบร้อย", "success");
        await loadShiftMaster();
        if (result?.requires_recalculation && defaults.length && isWorkday) {
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
      if (!await window.tcConfirm(`ยืนยันการลบวันหยุด ${formatDate(date)}?`)) return;
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
        `<tr><td colspan="9" class="fc-empty">กำลังโหลด Scope...</td></tr>`;

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
          `<tr><td colspan="9" class="fc-empty">${safe(humanError(error))}</td></tr>`;
      }
    }

    function renderManagerScopes() {
      const body = $("umManagerScopeBody");
      if (!body) return;

      if (val("umRole") !== "MANAGER") {
        body.innerHTML =
          `<tr><td colspan="9" class="fc-empty">Scope ใช้เฉพาะ Role Manager</td></tr>`;
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
        : `<tr><td colspan="9" class="fc-empty">Manager นี้ยังไม่มี Scope — จะเห็นเฉพาะข้อมูลของตนเอง</td></tr>`;
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
              $("msCanEdit").checked,
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

      if (!await window.tcConfirm(
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
        `<tr><td colspan="8" class="fc-empty">ยังไม่มีข้อมูล Preview</td></tr>`;
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
          .map(row => {
            const normalized = Object.fromEntries(
              Object.entries(row).map(
                ([key,value]) => [
                  String(key || "").trim(),
                  String(value ?? "").trim()
                ]
              )
            );
            normalized.can_confirm_schedule = normalized.can_edit_schedule || "false";
            return normalized;
          })
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
                  <td>${safe(row.can_certify_attendance || "false")}</td>
                  <td>${safe(row.can_decide_shift_request || "false")}</td>
                </tr>`).join("")
            : `<tr><td colspan="8" class="fc-empty">ไม่พบข้อมูลในไฟล์</td></tr>`;

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
        "work-patterns",
        "team-portal",
        "team-master"
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
      const actingOperationalAuthority =
        window.TimeClockTemporaryAssignmentV61529F14B?.hasOperationalAuthority?.() === true;
      const actingOperationalPages = new Set(["schedule","team-master"]);
      const actingPageAllowed =
        actingOperationalAuthority
        && actingOperationalPages.has(page);
      if (
        managerPages.has(page)
        && !["HR_ADMIN","MANAGER"].includes(
          effectiveRole
        )
        && !actingPageAllowed
      ) {
        return toast(
          "ไม่มีสิทธิ์จัดการกะหรือทีมงานในขอบเขตนี้",
          "error"
        );
      }
      state.currentPage = page;
      qsa(".page").forEach(x => x.classList.toggle("active", x.id === `page-${page}`));
      qsa(".nav-item").forEach(x => x.classList.toggle("active", x.dataset.page === page));
      const titles = {
        dashboard:["Dashboard","ภาพรวมการลงเวลาและการจัดกะ"], attendance:["รายละเอียดเวลาทำงาน","ตรวจเวลาเข้า–ออกและผลการคำนวณ"], "shift-requests":["คำขอ / แจ้งข้อมูล","คำขอแก้ไขกะ • ปัญหาเวลา • งานกะพิเศษ และ Manager พิจารณาตามสายบังคับบัญชา"], "team-master":["ทีมช่างเทคนิค","สร้าง Team Master แบบ Auto Generate ตามหน่วยงานใน Scope ของ Manager"], "team-portal":["สมาชิกทีม / Portal","จัดการ QR/Link, Activation Code และ Reset PIN ของลูกทีม"], schedule:["ปฏิทินจัดกะ","สลับดูภาพรวมรายหน่วยงานหรือจัดกะรายบุคคลได้ในหน้าเดียว"], "work-patterns":["รูปแบบการทำงาน","จัดกลุ่ม 5/6 วัน และกะตั้งต้นเช้า/ดึกแบบหลายคน พร้อม Override รายบุคคล"], report:["ศูนย์รายงาน","สร้างและส่งออกรายงานจากข้อมูล Time-Clock"],
        "admin-center":["HR Admin Center","ศูนย์บริหารและตรวจสอบสถานะระบบ"], "admin-periods":["จัดการรอบระบบ","กำหนด Deadline การจัดกะและรับรองเวลาทำงานประจำเดือน"], "admin-certification-reasons":["เหตุผลรับรองเวลา","HR Admin จัดการเหตุผลที่ใช้ใน Time Certification"], "admin-attendance-rebuild":["ประมวลผล Attendance","ประมวลผลใหม่ตามช่วงวันที่ พร้อม Progress และ Error Log"], "admin-shifts":["ตั้งค่ากะทำงาน","จัดการข้อมูลกะมาตรฐาน"], "system-settings":["System Settings","ตั้งค่าระบบและ Developer Console"], "admin-holidays":["วันหยุดนักขัตฤกษ์","จัดการวันหยุดและประมวลผล Attendance"], "admin-org":["ผังโครงสร้างองค์กร","จัดการหน่วยงาน Manager และ Scope ตามลำดับชั้น"], "admin-accounts":["จัดการบัญชีผู้ใช้งาน","สร้างบัญชี กำหนด Role และติดตาม First Login"], "admin-employee-portal":["Employee Portal","เปิด/ระงับสิทธิ์ Portal ให้พนักงานแบบ Bulk โดยไม่ต้องมี Email"], "admin-users":["User และสิทธิ์","กำหนด Role และ Manager Scope ด้วย Email"], "admin-import":["นำเข้าพนักงาน","ตรวจสอบและนำเข้าข้อมูล CSV"], "admin-time-import":["นำเข้าข้อมูลลงเวลา CSV","นำเข้า EmployeeId วันที่ เวลา เข้า/ออก และ GPS จาก CSV UTF-8"]
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
      if (page === "team-master") window.TimeClockTeamMasterV61523?.load?.();
      if (page === "schedule") {
        const personNeedsFullMonth =
          scheduleCurrentView() === "PERSON"
          && !schedulePersonLoadMatchesV61149();

        if (!state.schedule.length || personNeedsFullMonth) {
          loadSchedule();
        } else {
          renderSchedule();
        }
      }

      if (page === "work-patterns") {
        window.TimeClockWorkPatterns
          ?.load?.();
      }

      if (page === "admin-time-import") {
        window.TimeClockCsvImport
          ?.load?.();
      }

      if (page === "admin-periods") window.TimeClockSystemPeriods?.load?.();
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
      ["dashStart","dashEnd"].forEach(id => $(id)?.addEventListener("change", async () => {
        await loadScopedAreaDepartmentOptionsV616K({startId:"dashStart",endId:"dashEnd",areaId:"dashZone",departmentId:"dashDepartment",preserve:true});
      }));
      $("dashZone")?.addEventListener("change", async () => {
        setVal("dashDepartment","");
        await loadScopedAreaDepartmentOptionsV616K({startId:"dashStart",endId:"dashEnd",areaId:"dashZone",departmentId:"dashDepartment",preserve:true});
      });
      $("loadAttendanceBtn").addEventListener("click", loadAttendance);
      $("attZone")?.addEventListener(
        "change",
        async () => {
          attendanceRejectOutOfScopeValueV616K("attZone","พื้นที่");
          setVal("attSubArea","");
          setVal("attDepartment","");
          await loadAttendanceFilterOptions(true);
        }
      );
      $("attSubArea")?.addEventListener(
        "change",
        async () => {
          attendanceRejectOutOfScopeValueV616K("attSubArea","พื้นที่ย่อย");
          setVal("attDepartment","");
          await loadAttendanceFilterOptions(true);
        }
      );
      $("attDepartment")?.addEventListener(
        "change",
        () => {
          attendanceRejectOutOfScopeValueV616K("attDepartment","หน่วยงาน");
          invalidateAttendanceEmployeeOptions(
            true
          );
        }
      );
      $("attTeamV616T")?.addEventListener("change",()=>loadAttendance());
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
      $("loadScheduleBtn").addEventListener("click", () => {
        scheduleFilterOptionsCacheV6125.clear();
        loadSchedule();
      });

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

            if (scheduleCurrentView() === "PERSON") {
              await loadSchedule();
            } else {
              renderSchedule();
            }
          } catch(error) {
            toast(
              humanError(error),
              "error"
            );
          }
        }
      );

      $("scheduleDepartment")?.addEventListener("change", async () => {
        setVal("scheduleTeamFocus", selectedOrgIdV616M("scheduleDepartment") ? "" : val("scheduleDepartment"));
        if (scheduleCurrentView() === "PERSON") {
          await loadSchedule();
        } else {
          renderSchedule();
        }
      });

      $("scheduleSearch").addEventListener("input", () => {
        renderSchedule();

        if (scheduleCurrentView() !== "PERSON") return;

        const term = val("scheduleSearch").trim();
        const exactEmp = /^\d{4,20}$/.test(term);

        if (
          exactEmp
          && schedulePersonLoadMatchesV61149()
          && !schedulePersonSearchHasMatchV61150(term)
        ) {
          setScheduleLoadStatus(
            "warning",
            `ไม่พบรหัสพนักงาน ${term} ใน User Scope / พื้นที่ / หน่วยงานของเดือนที่แสดง`
          );
        }
      });
      $("schedulePatternFilter")?.addEventListener("change", renderSchedule);
      $("scheduleTeamFocus")?.addEventListener("change", renderSchedule);
      $("scheduleOperationalTeamV61526")?.addEventListener("change", renderSchedule);
      document.querySelectorAll('[data-person-team-group-v616t]').forEach(btn=>btn.addEventListener('click',()=>{
        scheduleViewState.personTeamGroupMode=String(btn.dataset.personTeamGroupV616t||'TEAM').toUpperCase()==='FLAT'?'FLAT':'TEAM';
        try{localStorage.setItem('timeclock.schedule.personTeamGroupMode',scheduleViewState.personTeamGroupMode);}catch(_){}
        renderSchedule();
      }));
      $("scheduleViewSwitch")?.addEventListener("click", async event => {
        const button = event.target.closest('[data-schedule-view]');
        if (!button) return;

        const changed =
          setScheduleView(
            button.dataset.scheduleView || 'TEAM'
          );

        if (scheduleCurrentView() === 'TEAM') {
          setText(
            'scheduleSelectedKpi',
            $('scheduleTeamVisibleCount')?.dataset?.value
            || $('scheduleTeamVisibleCount')?.textContent
            || '0'
          );
        }

        if (changed) {
          await loadSchedule();
        }
      });
      $("scheduleTeamWrap")?.addEventListener("click", async event => {
        const dayTrigger = event.target.closest('[data-team-day-key-v61526][data-team-day-date]');
        if (dayTrigger) {
          openScheduleTeamDrawer(
            String(dayTrigger.dataset.teamDayKeyV61526 || ''),
            String(dayTrigger.dataset.teamDayDate || ''),
            String(dayTrigger.dataset.teamDayLabelV61526 || '')
          );
          return;
        }

        const trigger = event.target.closest('[data-team-open-key-v61526]');
        if (!trigger) return;
        const teamKey = String(trigger.dataset.teamOpenKeyV61526 || '');
        setVal('scheduleOperationalTeamV61526', teamKey);
        setScheduleView('PERSON');
        await loadSchedule();
      });
      function ensurePersonShiftTooltipV61146() {
        let tooltip = $("schedulePersonShiftTooltipV61146");
        if (tooltip) return tooltip;

        document.body.insertAdjacentHTML(
          "beforeend",
          '<div id="schedulePersonShiftTooltipV61146" class="schedule-person-shift-tooltip-v61146" role="tooltip" aria-hidden="true"></div>'
        );
        return $("schedulePersonShiftTooltipV61146");
      }

      function showPersonShiftTooltipV61146(target) {
        if (!target?.dataset?.shiftTooltip) return;
        const tooltip = ensurePersonShiftTooltipV61146();
        if (!tooltip) return;

        const lines = String(target.dataset.shiftTooltip || "")
          .split("|")
          .map(item => item.trim())
          .filter(Boolean);

        tooltip.innerHTML = lines
          .map((line,index) =>
            index === 0
              ? `<strong>${safe(line)}</strong>`
              : `<span>${safe(line)}</span>`
          )
          .join("");

        tooltip.classList.add("show");
        tooltip.setAttribute("aria-hidden","false");

        const rect = target.getBoundingClientRect();
        const tipRect = tooltip.getBoundingClientRect();

        let left =
          rect.left
          + rect.width / 2
          - tipRect.width / 2;
        left = Math.max(
          8,
          Math.min(
            left,
            window.innerWidth - tipRect.width - 8
          )
        );

        let top = rect.top - tipRect.height - 9;
        if (top < 8) {
          top = rect.bottom + 9;
          tooltip.classList.add("below");
        } else {
          tooltip.classList.remove("below");
        }

        tooltip.style.left = `${Math.round(left)}px`;
        tooltip.style.top = `${Math.round(top)}px`;
      }

      function hidePersonShiftTooltipV61146() {
        const tooltip = $("schedulePersonShiftTooltipV61146");
        if (!tooltip) return;
        tooltip.classList.remove("show","below");
        tooltip.setAttribute("aria-hidden","true");
      }

      $("scheduleTableWrap")?.addEventListener("mouseover", event => {
        const target = event.target.closest("[data-shift-tooltip]");
        if (target) showPersonShiftTooltipV61146(target);
      });

      $("scheduleTableWrap")?.addEventListener("mouseout", event => {
        if (event.target.closest("[data-shift-tooltip]")) {
          hidePersonShiftTooltipV61146();
        }
      });

      $("scheduleTableWrap")?.addEventListener("focusin", event => {
        const target = event.target.closest("[data-shift-tooltip]");
        if (target) showPersonShiftTooltipV61146(target);
      });

      $("scheduleTableWrap")?.addEventListener("focusout", event => {
        if (event.target.closest("[data-shift-tooltip]")) {
          hidePersonShiftTooltipV61146();
        }
      });

      $("scheduleTableWrap")?.addEventListener("scroll", hidePersonShiftTooltipV61146, { passive:true });

      $("scheduleTableWrap")?.addEventListener("click", event => {
        const teamToggleV616T=event.target.closest('[data-person-team-toggle-v616t]');
        if(teamToggleV616T){
          const key=String(teamToggleV616T.dataset.personTeamToggleV616t||'');
          if(schedulePersonCollapsedTeamsV616T.has(key))schedulePersonCollapsedTeamsV616T.delete(key);else schedulePersonCollapsedTeamsV616T.add(key);
          renderSchedule();
          return;
        }
        const calendarButton = event.target.closest('[data-person-month-calendar]');
        if (!calendarButton) return;
        event.preventDefault();
        event.stopPropagation();
        openEmployeeMonthCalendarV61121(
          String(calendarButton.dataset.emp || '').trim(),
          String(calendarButton.dataset.month || val('scheduleMonth') || '').slice(0,7)
        );
      }, true);

      $("employeeMonthScheduleClose")?.addEventListener("click", closeEmployeeMonthCalendarV61121);
      $("employeeMonthScheduleCloseFooter")?.addEventListener("click", closeEmployeeMonthCalendarV61121);
      $("employeeMonthScheduleModal")?.addEventListener("click", event => {
        if (event.target === $('employeeMonthScheduleModal')) {
          closeEmployeeMonthCalendarV61121();
          return;
        }
        const punchDate = event.target.closest('[data-employee-month-punch-date]');
        if (punchDate) {
          event.preventDefault();
          event.stopPropagation();
          employeeMonthOpenPunchPanelV61460(String(punchDate.dataset.employeeMonthPunchDate || '').slice(0,10));
          return;
        }
        const certify = event.target.closest('[data-time-certify]');
        if (certify) {
          const workDate = String(certify.dataset.date || '').slice(0,10);
          const scheduleRow = (employeeMonthCalendarStateV61121.scheduleRows || []).find(row => String(row.work_date || '').slice(0,10) === workDate) || {};
          const attendanceRow = (employeeMonthCalendarStateV61121.attendanceRows || []).find(row => String(row.work_date || '').slice(0,10) === workDate) || {};
          openTimeCertificationModalV61139({ ...scheduleRow, ...attendanceRow, emp_code: employeeMonthCalendarStateV61121.empCode, work_date: workDate },'employee-month');
          return;
        }
        const edit = event.target.closest('[data-employee-month-edit-date]');
        if (edit) {
          const workDate = String(edit.dataset.employeeMonthEditDate || '').slice(0,10);
          if (!workDate) return;
          window.TimeClockEmployeeMonthReturnContext = {
            source: 'employee-month-calendar',
            empCode: employeeMonthCalendarStateV61121.empCode,
            month: employeeMonthCalendarStateV61121.month,
            workDate
          };
          openAssignment(employeeMonthCalendarStateV61121.empCode, workDate);
          return;
        }
        const nav = event.target.closest('[data-employee-month-nav]');
        if (nav) {
          const action = String(nav.dataset.employeeMonthNav || '');
          const month = action === 'today'
            ? todayISO().slice(0,7)
            : employeeMonthShiftV61121(employeeMonthCalendarStateV61121.month, action === 'prev' ? -1 : 1);
          openEmployeeMonthCalendarV61121(employeeMonthCalendarStateV61121.empCode, month);
          return;
        }
        const summaryFilter = event.target.closest('[data-employee-month-filter]');
        if (summaryFilter) {
          const filterKey = String(summaryFilter.dataset.employeeMonthFilter || 'all').trim().toLowerCase() || 'all';
          employeeMonthCalendarStateV61121.activeFilter = filterKey === 'all'
            ? 'all'
            : (employeeMonthCalendarStateV61121.activeFilter === filterKey ? 'all' : filterKey);
          renderEmployeeMonthCalendarV61121();
          return;
        }
      });
      $("timeCertificationClose")?.addEventListener("click", closeTimeCertificationModalV61139);
      $("timeCertificationCancelBtn")?.addEventListener("click", closeTimeCertificationModalV61139);
      $("timeCertificationModal")?.addEventListener("click", event => { if (event.target === $("timeCertificationModal")) closeTimeCertificationModalV61139(); });
      $("timeCertificationReason")?.addEventListener("change", updateTimeCertificationNoteRuleV61139);
      $("timeCertificationReasonSearch")?.addEventListener("input", () => renderTimeCertificationReasonOptionsV61139(timeCertificationStateV61139.reasons || [], val("timeCertificationReason")));
      $("timeCertificationStartTime")?.addEventListener("input", updateTimeCertificationDurationV61139);
      ["timeCertificationEndDate","timeCertificationEndTime"].forEach(id => {
        $(id)?.addEventListener("input", updateTimeCertificationActualOutLimitV61145);
        $(id)?.addEventListener("change", updateTimeCertificationActualOutLimitV61145);
      });
      $("timeCertificationSaveBtn")?.addEventListener("click", saveTimeCertificationV61139);
      $("timeCertificationRevokeBtn")?.addEventListener("click", revokeTimeCertificationV61139);

      $("employeeMonthPunchLogBtn")?.addEventListener("click", () => {
        // V6.14.64: the primary Raw Time Records entry must always open the complete view.
        // A previously selected filter must never make the user think Punch records are missing.
        employeeMonthCalendarStateV61121.timePunchMultiOnly = false;
        employeeMonthOpenPunchPanelV61460();
        if (!employeeMonthCalendarStateV61121.timePunchRows.length && !employeeMonthCalendarStateV61121.timePunchLoading) {
          loadEmployeeMonthPunchesV61460().catch(()=>{});
        }
      });
      $("employeeMonthPunchOverlay")?.addEventListener("click", event => {
        if (event.target.closest('[data-employee-month-punch-close]')) {
          employeeMonthClosePunchPanelV61460();
        }
      });
      $("employeeMonthPunchAllBtn")?.addEventListener("click", () => {
        employeeMonthCalendarStateV61121.timePunchMultiOnly = false;
        renderEmployeeMonthPunchPanelV61460();
      });
      $("employeeMonthPunchMultiOnlyBtn")?.addEventListener("click", () => {
        employeeMonthCalendarStateV61121.timePunchMultiOnly = true;
        renderEmployeeMonthPunchPanelV61460();
      });

      $("employeeMonthRecalcBtn")?.addEventListener("click", recalculateEmployeeMonthV61121);
      $("employeeMonthRefreshBtn")?.addEventListener("click", () => {
        employeeMonthCacheInvalidateV61138(
          employeeMonthCalendarStateV61121.empCode,
          employeeMonthCalendarStateV61121.month
        );
        employeeMonthPunchCacheInvalidateV61460(
          employeeMonthCalendarStateV61121.empCode,
          employeeMonthCalendarStateV61121.month
        );
        openEmployeeMonthCalendarV61121(
          employeeMonthCalendarStateV61121.empCode,
          employeeMonthCalendarStateV61121.month,
          { forceFresh: true }
        );
      });

      $("scheduleTeamDrawerClose")?.addEventListener("click", closeScheduleTeamDrawer);
      $("scheduleTeamDrawerBackdrop")?.addEventListener("click", closeScheduleTeamDrawer);
      $("scheduleTeamDrawer")?.addEventListener("click", event => {
        const certify = event.target.closest('[data-time-certify]');
        if (certify) {
          const empCode = String(certify.dataset.emp || '').trim();
          const workDate = String(certify.dataset.date || scheduleTeamDrawerState.date || '').slice(0,10);
          const row = (scheduleTeamDrawerState.rows || []).find(item => String(item.emp_code || '').trim() === empCode && String(item.work_date || '').slice(0,10) === workDate);
          if (row) openTimeCertificationModalV61139(row,'team-daily');
          return;
        }
        const assign = event.target.closest('[data-team-assign]');
        if (assign) {
          const empCode = String(assign.dataset.emp || '').trim();
          const workDate = String(assign.dataset.date || scheduleTeamDrawerState.date || '').slice(0,10);
          if (!empCode || !workDate) return;
          window.TimeClockTeamDailyReturnContext = {
            source: 'team-daily-detail',
            unit: scheduleTeamDrawerState.unit,
            date: scheduleTeamDrawerState.date || workDate,
            filter: scheduleTeamDrawerState.filter || 'ALL',
            empCode,
            workDate
          };
          openAssignment(empCode, workDate);
          return;
        }
        const filter = event.target.closest('[data-team-drawer-filter]');
        if (!filter) return;
        scheduleTeamDrawerState.filter = String(filter.dataset.teamDrawerFilter || 'ALL');
        renderScheduleTeamDrawer();
      });
      $("schedulePatternSummary")?.addEventListener("click", event => {
        const chip = event.target.closest("[data-schedule-pattern-chip]");
        if (!chip) return;
        setVal(
          "schedulePatternFilter",
          chip.dataset.schedulePatternChip || ""
        );
        renderSchedule();
      });
      applyScheduleViewMode();
      document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        if (!$('assignModal')?.classList.contains('hidden')) return;
        if (!$('employeeMonthScheduleModal')?.classList.contains('hidden')) {
          closeEmployeeMonthCalendarV61121();
          return;
        }
        if (!$('scheduleTeamDrawer')?.classList.contains('hidden')) {
          closeScheduleTeamDrawer();
        }
      });
      $("saveAssignmentBtn").addEventListener("click", saveAssignment);
      $("deleteAssignmentBtn").addEventListener("click", deleteAssignment);
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
      if (window.tcIsDayShiftCode(value)) return "badge-blue";
      if (window.tcIsNightShiftCode(value)) return "badge-amber";
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
    function attendanceLabel(s) { return ({ NORMAL:"ปกติ",ABSENT:"ขาดงาน",ABSENCE:"ขาดงาน",DAY_OFF:"วันหยุด",MISSING_IN:"ไม่ลงเวลาเข้า",MISSING_OUT:"ไม่ลงเวลาออก",MISSING_BOTH:"ไม่ลงเวลาทั้งเข้าและออก",LATE_30_PLUS:"เข้าหลังเริ่มกะ ≥30 นาที",INVALID_TIME:"เวลาไม่ถูกต้อง",LATE:"มาสาย",EARLY_LEAVE:"กลับก่อน",LATE_AND_EARLY:"สายและกลับก่อน",WORKED_ON_OFFDAY:"ทำงานวันหยุด",WORKED_ON_WEEKLY_OFF:"ทำงานวันหยุดประจำสัปดาห์",WORKED_ON_HOLIDAY:"ทำงานวันหยุดนักขัตฤกษ์",WORKED_ON_COMP_OFF:"ทำงานวันหยุดชดเชย",OVERTIME:"มี OT",LATE_AND_EARLY_LEAVE:"สายและกลับก่อน",WORKDAY:"วันทำงาน",COMP_OFF:"วันหยุดชดเชย",LEAVE:"วันลา",NEED_REVIEW:"รอตรวจสอบ",HOLIDAY:"นักขัตฤกษ์",WEEKLY_OFF:"วันหยุดประจำสัปดาห์",INCOMPLETE_TIME:"เวลาไม่ครบ",COMPLETE:"ครบ",NO_TIME:"ไม่มีเวลา",LEAVE_APPROVED:"อนุมัติลา",LEAVE_WITH_TIME:"ลาแต่มีเวลา",PARTIAL_LEAVE:"ลาบางส่วน",PARTIAL_LEAVE_NO_TIME:"ลาบางส่วนแต่ไม่มีเวลา"})[s] || s || "-"; }
    function emptyRow(cols) { return `<tr><td colspan="${cols}" class="table-empty">ไม่พบข้อมูล</td></tr>`; }
    function humanError(err) {
      const msg = err?.message || err?.error_description || String(err || "เกิดข้อผิดพลาด");
      if (msg.includes("TEAM_REQUIRED_FOR_CAR")) return "พนักงานกลุ่มรถยนต์ยังไม่มีทีมที่มีผลในวันที่เลือก กรุณากำหนดทีมก่อนจัดกะ";
      if (msg.includes("TEAM_REQUIRED_FOR_MOTORCYCLE")) return "พนักงานกลุ่มมอเตอร์ไซค์ยังไม่มีทีมที่มีผลในวันที่เลือก กรุณาจัดเข้าทีมก่อนจัดกะ";
      if (msg.includes("TEAM_REQUIRED_FOR_SUPPORT")) return "พนักงานกลุ่มสนับสนุนยังไม่มีทีมที่มีผลในวันที่เลือก กรุณาจัดเข้าทีมก่อนจัดกะ";
      if (msg.includes("EMPLOYEE_RESIGNED") || msg.includes("EMPLOYEE_RESIGN_DATE_REACHED")) return "ไม่สามารถจัดกะตั้งแต่วันที่ลาออกเป็นต้นไป กรุณาตรวจวันที่ลาออกใน Employee Master";
      if (msg.includes("EMPLOYEE_NOT_STARTED")) return "ไม่สามารถจัดกะก่อนวันเริ่มงานพนักงานได้ กรุณาตรวจวันที่เริ่มงานและวันที่ของกะ";
      if (msg.includes("EMPLOYEE_START_DATE_REQUIRED")) return "ไม่พบวันเริ่มงานพนักงาน กรุณาตรวจ Employee Master ก่อนดำเนินการ";
      if (msg.includes("TEAM_ENFORCEMENT_NOT_READY")) return "ยังเปิด Team Enforcement ไม่ได้ กรุณาจัดทีมรถยนต์/ทีมสนับสนุน และกำหนดรูปแบบพนักงานที่รอดำเนินการให้ครบ";
      if (msg.includes("TEAM_ENFORCEMENT_CAR_UNASSIGNED")) return "ยังเปิด Team Enforcement ไม่ได้ เพราะยังมีช่างรถยนต์ที่ไม่ได้กำหนดทีม";
      if (msg.includes("OPERATIONAL_TYPE_REQUIRED")) return "พนักงานยังไม่ได้กำหนดรูปแบบการปฏิบัติงาน กรุณาให้ Manager กำหนดเป็น รถยนต์ / มอเตอร์ไซค์ / สนับสนุน ก่อนจัดกะ";
      if (msg.includes("OPERATIONAL_TYPE_UNCLASSIFIED") || msg.includes("CAR_TEAM_UNSPECIFIED")) return "พนักงานยังรอ Manager กำหนดประเภทการปฏิบัติงาน";
      if (msg.includes("SCHEDULE_HAS_UNCONFIRMED_SHIFTS")) {
        const count = msg.match(/SCHEDULE_HAS_UNCONFIRMED_SHIFTS:\s*(\d+)/)?.[1];
        return `พบรายการจัดกะเดิมที่สถานะยังไม่สมบูรณ์${count ? ` ${Number(count).toLocaleString("th-TH")} รายการ` : ""} กรุณาเปิดรายการและกดบันทึกใหม่ก่อนประกาศหรือล็อกเดือน`;
      }
      if (msg.includes("DAYOFF_REQUEST_PERIOD_CLOSED")) return "รอบระบบของวันที่เลือกปิดการจัดกะแล้ว ไม่สามารถส่งคำขอวันหยุดจาก Employee Portal ได้";
      if (msg.includes("DAYOFF_REQUEST_DATE_NO_LONGER_FUTURE")) return "วันที่ในคำขอไม่ใช่วันอนาคตแล้ว กรุณาให้ Manager ดำเนินการจากตารางกะโดยตรง";
      if (msg.includes("DAYOFF_EMPLOYEE_PORTAL_FUTURE_ONLY")) return "Employee Portal ขอหรือสลับวันหยุดได้เฉพาะวันที่หลังวันปัจจุบัน";
      if (msg.includes("REQUEST_DATE_CONFLICT")) return "วันที่เลือกมีคำขออื่นที่กำลังดำเนินการและมีผลต่อกะ วันหยุด หรือลาอยู่แล้ว";
      if (msg.includes("DAYOFF_SWAP_SOURCE_NOT_DAYOFF")) return "วันหยุดเดิมไม่ใช่วันหยุดตามข้อมูลตารางกะล่าสุด";
      if (msg.includes("DAYOFF_SWAP_TARGET_MUST_BE_WORKDAY")) return "วันที่ต้องการหยุดแทนต้องเป็นวันทำงานตามข้อมูลล่าสุด";
      if (msg.includes("DAYOFF_SWAP_PUBLIC_HOLIDAY_NOT_ALLOWED")) return "วันหยุดนักขัตฤกษ์ไม่สามารถนำมาสลับวันหยุดได้";
      if (msg.includes("DAYOFF_SWAP_SAME_MONTH_REQUIRED")) return "วันหยุดเดิมและวันที่หยุดแทนต้องอยู่ภายในเดือนเดียวกัน";
      if (msg.includes("DAYOFF_SWAP_DATE_MUST_DIFFER")) return "วันหยุดเดิมและวันที่หยุดแทนต้องเป็นคนละวัน";
      if (msg.includes("DAYOFF_ADD_NO_REQUESTABLE_BALANCE")) return "โควต้าวันหยุดที่สามารถขอเพิ่มได้หมดแล้ว หรือมีคำขออื่นจองโควต้าไว้";
      if (msg.includes("DAYOFF_ADD_TARGET_MUST_BE_WORKDAY")) return "ขอหยุดเพิ่มได้เฉพาะวันที่เป็นวันทำงาน";
      if (msg.includes("DAYOFF_ADD_PUBLIC_HOLIDAY_NOT_ALLOWED")) return "วันหยุดนักขัตฤกษ์ไม่สามารถใช้คำขอหยุดเพิ่มได้";
      if (msg.includes("DAYOFF_PAIRED_SHIFT_NOT_FOUND")) return "กะทำงานของวันที่เลือกยังไม่ได้จับคู่กับกะวันหยุด กรุณาตรวจ Shift Master / กฎจับคู่กะ";
      if (msg.includes("DAYOFF_SWAP_SOURCE_WORK_SHIFT_NOT_FOUND")) return "ระบบไม่พบกะทำงานที่จะใช้คืนให้วันหยุดเดิม กรุณาตรวจการจับคู่กะวันหยุด";
      if (msg.includes("DAYOFF_REQUEST_PREFLIGHT_BLOCKED")) return "ข้อมูลล่าสุดของคำขอไม่ผ่านเงื่อนไขก่อนอนุมัติ กรุณากดตรวจข้อมูลล่าสุดอีกครั้ง";
      if (msg.includes("DAYOFF_REQUEST_WORK_PATTERN_BLOCKED") || msg.includes("DAYOFF_WORK_PATTERN_BLOCKED")) return "กะที่จะใช้หลังอนุมัติไม่ตรงกับรูปแบบการทำงาน 5 วัน/6 วันของพนักงาน";
      if (msg.includes("DAYOFF_REQUEST_MINIMUM_REST_BLOCKED")) return "อนุมัติไม่ได้ เพราะเวลาพักจากกะก่อนหน้าต่ำกว่า 6 ชั่วโมง";
      if (msg.includes("DAYOFF_REQUEST_NIGHT_SEQUENCE_BLOCKED")) return "อนุมัติไม่ได้ เพราะผลลัพธ์หลังสลับวันหยุดขัดกับเงื่อนไขลำดับกะดึก";
      if (msg.includes("DAYOFF_REQUEST_QUOTA_BLOCKED")) return "อนุมัติไม่ได้ เพราะโควต้าวันหยุดไม่เพียงพอตามข้อมูลล่าสุด";
      if (msg.includes("DAYOFF_REQUEST_FINAL_STATE_MISMATCH")) return "ระบบตรวจผลหลังบันทึกแล้วพบว่าตารางกะไม่ตรงกับผลที่อนุมัติ จึง Rollback รายการทั้งหมดอัตโนมัติ";
      if (msg.includes("DAYOFF_REQUEST_FINAL_STATUS_MISMATCH")) return "ระบบไม่สามารถปิดคำขอหลังปรับตารางกะได้ จึง Rollback รายการทั้งหมดอัตโนมัติ";
      if (msg.includes("REQUEST_RETURN_NOTE_REQUIRED")) return "กรุณาระบุเหตุผลที่ส่งคำขอกลับให้พนักงานแก้ไข";
      if (msg.includes("REQUEST_RETURN_REQUIRES_EMPLOYEE_PORTAL")) return "ส่งกลับให้แก้ไขได้เฉพาะคำขอที่มาจาก Employee Portal";
      if (msg.includes("REQUEST_RETURN_ONLY_DAYOFF_SUPPORTED")||msg.includes("REQUEST_RETURN_TYPE_NOT_SUPPORTED")) return "รองรับการส่งกลับให้แก้ไขสำหรับคำขอวันหยุดและคำขอลาจาก Employee Portal";
      if (msg.includes("LEAVE_RANGE_NO_WORKDAY")) return "ช่วงวันที่เลือกไม่มีวันทำงานที่ต้องปรับตารางกะ";
      if (msg.includes("LEAVE_SYSTEM_PERIOD_SCHEDULE_CLOSED")) return "รอบระบบของวันที่ลาอย่างน้อย 1 วันปิดการแก้ไขตารางกะแล้ว";
      if (msg.includes("LEAVE_NOT_ALLOWED_NON_WORKDAY")) return "ลาบางส่วนใช้ได้เฉพาะวันที่เป็นวันทำงาน";
      if (msg.includes("PARTIAL_LEAVE_WINDOW_INVALID")) return "ช่วงลาบางส่วนไม่ผ่านเงื่อนไขกะล่าสุด";
      if (msg.includes("NIGHT_SEQUENCE_BLOCKED")) return "คำขอนี้ไม่ผ่านเงื่อนไขกะดึกหรือเวลาพักระหว่างกะ";
      if (msg.includes("DAYOFF_QUOTA_EXHAUSTED")) return "วันหยุดคงเหลือไม่เพียงพอ ไม่สามารถกำหนดกะวันหยุดเพิ่มได้ กรุณาตรวจวันหยุดที่ใช้ไปหรือเปลี่ยนวันหยุดเดิมเป็นวันทำงานก่อน";
      if (msg.includes("DAYOFF_QUOTA_GUARD_V6143_REQUIRED")) return "กรุณาติดตั้ง Day-off Quota Guard V6.14.3 เพื่อเปิดใช้การควบคุมโควต้าวันหยุดก่อนบันทึกกะ";
      if (msg.includes("SCHEDULE_MONTH_LOCKED")) return "ตารางกะเดือนนี้ถูกล็อก กรุณาปลดล็อกก่อนแก้ไข";
      if (msg.includes("SCHEDULE_PUBLISH_PERMISSION_DENIED")) return "บัญชีนี้ไม่มีสิทธิ์ประกาศหรือล็อกตารางกะ";
      if (msg.includes("HR_ADMIN_REQUIRED")) return "เมนูนี้สำหรับ HR_ADMIN เท่านั้น";
      if (msg.includes("SCHEDULE_LIGHTWEIGHT_RPC_REQUIRED")) return "กรุณารัน SQL V6.13.5 เพื่อเปิดใช้ Schedule Grid แบบ Lightweight";
      if (msg.includes("MONTHLY_PERSONAL_RPC_V6134_REQUIRED")) return "กรุณารัน SQL V6.13.5 เพื่อเปิดใช้ Monthly Personal Overview รุ่นใหม่";
      if (msg.includes("SECURE_SCHEDULE_RANGE_RPC_REQUIRED")) return "กรุณารัน SQL V6.11.15 เพื่อโหลดตารางกะตาม User Scope";
      if (msg.includes("SECURE_SCHEDULE_SCOPE_RPC_REQUIRED")) return "กรุณารัน SQL V6.11.15 เพื่อเปิดใช้งาน Schedule แบบกรอง User Scope";
      if (msg.includes("SECURE_SCHEDULE_RPC_REQUIRED")) return "กรุณารัน SQL V6.11.15 ก่อนบันทึกหรือแก้ไขกะ";
      if (msg.includes("SECURE_SCOPE_FILTER_RPC_REQUIRED")) return "กรุณารัน SQL V6.11.15 เพื่อโหลดตัวกรองตาม User Scope";
      if (msg.includes("SECURE_ATTENDANCE_FILTER_RPC_REQUIRED")) return "กรุณารัน SQL V6.11.15 เพื่อโหลดตัวกรอง Attendance ตาม User Scope";
      if (msg.includes("SECURE_REVIEW_SCOPE_RPC_REQUIRED")) return "ไม่อนุญาตโหลดรายการตรวจสอบแบบไม่จำกัด Scope กรุณาใช้ Secure Review RPC ตาม User Scope";
      if (msg.includes("SYSTEM_PERIOD_SCHEDULE_CLOSED")) return "รอบระบบปิดการแก้ไขตารางกะแล้ว กรุณาติดต่อ HR Admin หากจำเป็นต้องเปิดรอบหรือขยาย Deadline";
      if (msg.includes("SYSTEM_PERIOD_CERTIFICATION_CLOSED")) return "รอบระบบปิดการรับรองเวลาทำงานแล้ว กรุณาติดต่อ HR Admin หากจำเป็นต้องเปิดรอบหรือขยาย Deadline";
      if (msg.includes("TIME_CERTIFICATION_FUTURE_DATE_NOT_ALLOWED")) return "รับรองเวลาได้เฉพาะวันที่ปัจจุบันและย้อนหลังเท่านั้น";
      if (msg.includes("TIME_CERTIFICATION_LEAVE_NOT_ALLOWED")) return "วันลาไม่สามารถรับรองเวลาได้";
      if (msg.includes("TIME_CERTIFICATION_OFF_NOT_ALLOWED")) return "วันหยุด / กะ OFF ไม่สามารถรับรองเวลาได้";
      if (msg.includes("TIME_CERTIFICATION_SHIFT_REQUIRED")) return "ไม่พบเวลาเริ่ม/สิ้นสุดกะ กรุณากำหนดกะหรือประมวลผล Attendance ก่อนรับรองเวลา";
      if (msg.includes("TIME_CERTIFICATION_START_BEFORE_SHIFT")) return "เวลาเริ่มรับรองต้องไม่ก่อนเวลาเริ่มกะ";
      if (msg.includes("TIME_CERTIFICATION_END_AFTER_ACTUAL_OUT")) return "เวลาสิ้นสุดรับรองต้องไม่เกินเวลาออกจริงของกะที่ 1";
      if (msg.includes("TIME_CERTIFICATION_END_MUST_BE_AFTER_START")) return "เวลาสิ้นสุดรับรองต้องมากกว่าเวลาเริ่มรับรอง";
      if (msg.includes("TIME_CERTIFICATION_REASON_REQUIRED")) return "กรุณาเลือกเหตุผลการรับรองเวลา";
      if (msg.includes("TIME_CERTIFICATION_REASON_NOT_ACTIVE")) return "เหตุผลที่เลือกถูกปิดใช้งาน กรุณาเลือกเหตุผลอื่น";
      if (msg.includes("TIME_CERTIFICATION_NOTE_REQUIRED")) return "เหตุผลนี้ต้องระบุหมายเหตุเพิ่มเติม";
      if (msg.includes("TIME_CERTIFICATION_PERMISSION_DENIED") || msg.includes("TIME_CERTIFICATION_SCOPE_DENIED")) return "บัญชีนี้ไม่มีสิทธิ์รับรองเวลาของพนักงานรายนี้";
      if (msg.includes("TIME_CERTIFICATION_RPC_REQUIRED")) return "กรุณารัน SQL V6.11.39 Time Certification ก่อนใช้งานเมนูรับรองเวลา";
      if (msg.includes("SYSTEM_PERIOD_TARGET_ALREADY_EXISTS")) return "มีรอบของเดือนปลายทางอยู่แล้ว ไม่สามารถคัดลอกทับได้";
      if (msg.includes("SYSTEM_PERIOD_INVALID_SCHEDULE_DEADLINE")) return "วันสุดท้ายจัดกะต้องไม่ก่อนเดือนรอบการทำงาน";
      if (msg.includes("SYSTEM_PERIOD_INVALID_CERTIFICATION_DEADLINE")) return "วันสุดท้ายรับรองเวลาต้องไม่ก่อนเดือนรอบการทำงาน";
      if (msg.includes("MISSING_V61028")) return "กรุณารัน SQL V6.10.28 ก่อนติดตั้ง V6.11.15";
      if (msg.includes("ATTENDANCE_RECALC")) return "บันทึกกะไม่สำเร็จ เนื่องจากการประมวลผล Attendance ใหม่ไม่สำเร็จ ระบบไม่ได้บันทึกกะบางส่วน";
      if (msg.includes("MONTHLY_EMPLOYEE_RECALC_RPC_REQUIRED")) return "ยังไม่ได้ติดตั้ง SQL V6.11.21 สำหรับประมวลผลรายบุคคลทั้งเดือน กรุณารัน SQL ที่ต้องรัน V6.11.21 ก่อน";
      if (msg.includes("MANAGER_SELF_SCHEDULE_FORBIDDEN")) return "Manager สามารถดูตารางกะของตนเองได้ แต่ไม่สามารถจัดกะ แก้ไข ยืนยัน หรือลบกะของตนเอง";
      if (msg.includes("ACTIVE_MANAGER_PROFILE_NOT_FOUND_FOR_EMAIL")) return "ไม่พบ Profile ที่เป็น MANAGER และ Active สำหรับ Email นี้ กรุณาตรวจ Role ก่อนเพิ่ม Scope";
      if (msg.includes("SHIFT_BEFORE_EMPLOYEE_START_DATE")) return "ไม่สามารถกำหนดกะก่อนวันเริ่มงานของพนักงานได้ กรุณาเลือกวันที่ตั้งแต่วันเริ่มงานเป็นต้นไป";
      if (msg.includes("SHIFT_NOT_APPLICABLE_TO_WORK_PATTERN")) return "กะที่เลือกไม่รองรับรูปแบบการทำงาน 5 วัน/6 วันของพนักงาน กรุณาเลือกกะให้ตรงกลุ่ม";
      if (msg.includes("DEFAULT_SHIFT_DURATION_NOT_MATCH_PATTERN")) return "กะตั้งต้นต้องมีชั่วโมงรวมพักและชั่วโมงสุทธิตรงตามมาตรฐานของรูปแบบการทำงาน";
      if (msg.includes("SHIFT_REQUIRES_WORK_PATTERN")) return "กรุณาเลือกรูปแบบการทำงานอย่างน้อย 1 รูปแบบสำหรับกะนี้";
      if (msg.includes("WORKDAY_SHIFT_REQUIRES_START_AND_END")) return "กะวันทำงานต้องระบุเวลาเริ่มและเวลาสิ้นสุด";
      if (msg.includes("ta_get_employee_pattern_assignment_meta_v61111")) return "กรุณารัน SQL V6.11.15 เพื่อโหลดข้อมูล Template วันทำงานปกติ วันที่มีผล และผู้บันทึกให้ครบ";
      if (msg.includes("WORK_PLAN_LINKAGE_RPC_REQUIRED")) return "กรุณารัน SQL V6.11.15 เพื่อเชื่อมรูปแบบการทำงานรายบุคคลกับปฏิทินจัดกะและรายละเอียดเวลาทำงาน";
      if (msg.includes("INVALID_CUSTOMER_END_MODE")) return "รูปแบบเวลาสิ้นสุดงานลูกค้าไม่ถูกต้อง";
      if (msg.includes("CUSTOMER_WINDOW_START_REQUIRED_FOR_SPLIT_FLEX")) return "กรุณาระบุคาดว่าจะเริ่มงานลูกค้า";
      if (msg.includes("CUSTOMER_WINDOW_END_REQUIRED_FOR_FIXED_MODE")) return "กรุณาระบุเวลาสิ้นสุด หรือเลือก ตามเวลาออกจริง";
      if (msg.includes("WORK_TEMPLATE_MUST_MATCH_EMPLOYEE_DEFAULT")) return "ฐานข้อมูลยังใช้กฎล็อก Template แบบเดิม กรุณารัน SQL V6.11.16 DAILY WORK TEMPLATE FLEX ก่อนใช้งานรูปแบบรายวัน";
      if (msg.includes("EMPLOYEE_DEFAULT_TEMPLATE_NOT_FOUND")) return "ไม่พบรูปแบบการทำงานของพนักงาน กรุณากำหนด 5/6 วัน ที่ Tab รูปแบบการทำงานก่อน";
      if (msg.includes("CUSTOMER_WINDOW_REQUIRED_FOR_SPLIT_FLEX")) return "กะปกติ + งานลูกค้าช่วงดึก ต้องระบุเวลาเริ่มงานลูกค้าและเวลาสิ้นสุดให้ครบ";
      if (msg.includes("CUSTOMER_WINDOW_START_END_MUST_DIFFER")) return "เวลาเริ่มงานลูกค้าและเวลาสิ้นสุดต้องไม่เป็นเวลาเดียวกัน";
      if (msg.includes("WORK_TEMPLATE_REQUIRED")) return "กรุณาเลือกรูปแบบช่วงงาน";
      if (msg.includes("WORK_PATTERN_MONTH_START_REQUIRED")) return "รูปแบบการทำงานเป็น Monthly Baseline กรุณาเลือกเดือนเริ่มใช้ ระบบจะมีผลตั้งแต่วันที่ 1 ของเดือนเท่านั้น";
      if (msg.includes("WORK_PATTERN_MONTH_END_REQUIRED")) return "เดือนสิ้นสุดของรูปแบบการทำงานต้องมีผลถึงวันสุดท้ายของเดือน";
      if (msg.includes("WORK_PATTERN_NOT_FOUND")) return "ไม่พบรูปแบบการทำงานของพนักงานในวันที่เลือก";
      if (msg.includes("PARTIAL_LEAVE_SHIFT_REQUIRED")) return "ไม่พบเวลาเริ่ม/สิ้นสุดกะสำหรับลาบางส่วน กรุณาตรวจตารางกะก่อนอนุมัติ";
      if (msg.includes("PARTIAL_LEAVE_OUTSIDE_SHIFT")) return "ช่วงลาบางส่วนต้องอยู่ภายในช่วงกะทำงานของ Work Date ที่เลือก";
      if (msg.includes("PARTIAL_LEAVE_MUST_NOT_COVER_FULL_SHIFT")) return "ช่วงลาครอบคลุมทั้งกะ กรุณาใช้ลาเต็มวันแทน";
      if (msg.includes("PARTIAL_LEAVE_ACTIVE_OVERLAY_EXISTS")) return "วันที่นี้มีลาบางส่วนที่ Manager อนุมัติไว้แล้ว หากต้องการเปลี่ยนช่วงเวลาให้ตรวจรายการเดิมก่อน";
      if (msg.includes("LEAVE_PARTIAL_NOT_ALLOWED_FOR_TYPE")) return "ประเภทการลานี้กำหนดให้ลาเต็มวันเท่านั้น";
      if (msg.includes("PERSONAL_LEAVE_PARTIAL_MIN_60_MINUTES")) return "ลากิจบางส่วนกำหนดขั้นต่ำ 1 ชั่วโมง";
      if (msg.includes("VACATION_LEAVE_PARTIAL_MIN_180_MINUTES")) return "ลาพักร้อนบางส่วนกำหนดขั้นต่ำ 3 ชั่วโมง";
      if (msg.includes("LEAVE_NOT_ALLOWED_NON_WORKDAY")) return "ไม่สามารถอนุมัติลาในวันหยุด วันหยุดนักขัตฤกษ์ หรือวันที่ไม่ใช่วันทำงานได้";
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
      scheduleIsNonWorkingShift: scheduleIsNonWorkingShiftV61447,
      calendarTodayISO: todayISO,
      calendarAddDaysISO: addCalendarDaysISO,
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
      attendanceMinutesToHourMinuteV61457,
      attendanceShiftCode,
      attendanceShiftTime,
      normalizeTemplateCodeV665,
      attendancePunchStateV61120,
      attendancePolicyFlagsV61428,
      attendanceLateMinutesForDisplayV61456,
      normalizeAttendanceStatusFromPunchesV61120,
      attendanceAbsenceMinutes,
      attendanceDisplayStatus,
      attendanceDisplayLabel,
      attendanceIsColumnVisible,
      attendanceExportMatrix,
      workTemplateLabelV6118,
      attendanceWorkSegmentsTextV6118,
      attendanceWorkSegmentsHtmlV6118,
      attendancePunchCellV6119,
      attendancePlannedCellV61110,
      enrichAttendanceWorkSegmentsV6118,
      loadAttendanceFilterOptions,
      loadScopedAreaDepartmentOptionsV616K,
      loadAuthorizedOrgContractV616L,
      scopedDepartmentOptionsV616L,
      loadScopeEmployeeOptionsV616O,
      canonicalScopeEmployeeMetaMapV616Q,
      applyCanonicalOrgMetaV616Q,
      canonicalOrgNameV616Q,
      canonicalOrgCodeV616Q,
      canonicalOrgLabelV616Q,
      canonicalOrgIdentityV616Q,
      canonicalAreaV616Q,
      canonicalSubAreaV616Q,
      selectedOrgIdV616M,
      selectedLegacyDepartmentV616M,
      selectedDepartmentDisplayV616M,
      loadOrgEmployeeCodesV616M,
      loadAttendanceEmployeeOptions,
      attendanceEmployeeCodesForQuery,
      selectAttendanceEmployees,
      attendanceLabel,
      downloadFile,
      openModal,
      closeModal,
      ensureSupabaseClient,
      applyProfile,
      switchPage,
      openTimeCertificationModalV61139,
      loadTimeCertificationReasonsV61139
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
    const dark = theme === 'dark';
    document.body.classList.toggle('theme-dark', dark);
    document.body.classList.toggle('dark', dark);
    document.body.classList.toggle('dark-mode', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    const themeMeta = document.querySelector('meta[name=\"theme-color\"]');
    if (themeMeta) themeMeta.setAttribute('content', dark ? '#091522' : '#0b1f3a');
    localStorage.setItem('tc_theme', theme);
    try {
      const settingsKey = 'ta_enterprise_settings_v4';
      const storedSettings = JSON.parse(localStorage.getItem(settingsKey) || '{}');
      storedSettings.theme = theme;
      localStorage.setItem(settingsKey, JSON.stringify(storedSettings));
    } catch (_) {}
    if ($('themeToggleBtn')) $('themeToggleBtn').textContent = dark ? '☀' : '☾';
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
      const iso = d => window.TimeClockCalendarV61448.localISO(d);
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
    const dash = window.TimeClockApp?.state?.dashboard || {};
    const employees=Number(dash.total_employees||0), total=Number(dash.total_rows||0), complete=Number(dash.complete_time_rows||0);
    const incomplete=Number(dash.missing_in_rows||0)+Number(dash.missing_out_rows||0), absent=Number(dash.absent_rows||0);
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
      ['ชั่วโมงสุทธิ',fmt(dash.paid_work_hours||0),'ชั่วโมงหลังหักพัก/รอคอย'],
      ['OT',fmt(dash.overtime_hours||0),`${fmt(dash.overtime_rows||0)} รายการ`]
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
    const dash = window.TimeClockApp?.state?.dashboard || {};
    return {
      employees: num(dash.total_employees),
      total: num(dash.total_rows),
      complete: num(dash.complete_time_rows),
      incomplete: num(dash.missing_in_rows) + num(dash.missing_out_rows),
      absent: num(dash.absent_rows),
      late: num(dash.late_rows),
      early: num(dash.early_leave_rows)
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
            ?.includes('กะที่หัวหน้างานบันทึก')
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
      <div class="readiness-number"><strong>${confirmedPct}%</strong><span>สัดส่วนรายการที่หัวหน้างานกำหนดกะ</span></div>
      <div class="readiness-track"><i style="width:${confirmedPct}%"></i></div>
      <div class="readiness-meta"><div><span>หัวหน้างานบันทึก</span><strong>${fmt(confirmed)}</strong></div><div><span>กะมาตรฐาน / อื่น ๆ</span><strong>${fmt(Math.max(0,d.total-confirmed))}</strong></div></div>`;

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
  // V6.14.13 — Month-copy workflow is intentionally separate from cell clipboard.
  // SOURCE: choose exactly one employee. TARGET: choose one or more employees.
  let monthCopyPhaseV61413 = "SOURCE";
  let monthCopySourceCandidateV61413 = "";
  let monthCopySourceV61413 = "";
  let monthCopyMonthV61413 = "";
  let monthCopySourceRowsV61413 = [];
  const monthCopyTargetsV61413 = new Set();
  let monthCopyApplyingV61414 = false;
  const app = () => window.TimeClockApp;
  const wrap = () => document.getElementById("scheduleTableWrap");
  const $ = id => document.getElementById(id);
  const keyOf = cell => `${cell.dataset.emp}|${cell.dataset.date}`;
  const escapeCss = value => (window.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/g,"\\$&"));

  function cells(){ return [...(wrap()?.querySelectorAll("[data-schedule-cell]") || [])]; }
  function getCell(key){ const [emp,date]=key.split("|"); return wrap()?.querySelector(`[data-schedule-cell][data-emp="${escapeCss(emp)}"][data-date="${escapeCss(date)}"]`); }
  function rowForKey(key){ const [emp_code,work_date]=key.split("|"); const row=app()?.state?.schedule?.find(r=>String(r.emp_code)===emp_code&&String(r.work_date).slice(0,10)===work_date); return {key,emp_code,work_date,row}; }
  function selectedRows(){
    const order = new Map(cells().map((cell,index)=>[keyOf(cell),index]));
    return [...selected]
      .sort((a,b)=>(order.get(a)??Number.MAX_SAFE_INTEGER)-(order.get(b)??Number.MAX_SAFE_INTEGER))
      .map(rowForKey)
      .filter(x=>x.row);
  }
  function currentCode(row){ return window.tcShiftCode(row?.assigned_shift_code || row?.effective_shift_code || row?.auto_shift_code || row?.shift_code || null); }

  function rowPattern(row){
    return window.TimeClockSchedulePattern?.rowPattern?.(row)
      || String(row?.pattern_code || "").toUpperCase()
      || "UNASSIGNED";
  }

  function shiftMasterRows(){
    return app()?.state?.filters?.shifts || [];
  }

  function shiftPatterns(shift){
    const canonicalPatterns =
      window.tcShiftPatternCodesV6131?.(shift);

    if(Array.isArray(canonicalPatterns) && canonicalPatterns.length){
      return canonicalPatterns;
    }

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
      shift => window.tcShiftCode(shift.shift_code) === window.tcShiftCode(code)
    );
  }

  function defaultShiftForPattern(pattern, row=null){
    return shiftMasterRows()
      .filter(shift =>
        supportsPattern(shift, pattern)
        && (!row || window.TimeClockSchedulingRulesV6120?.isShiftAllowedForRow?.(shift.shift_code, row) !== false)
      )
      .sort(
        (a,b) =>
          Number(a.display_order || 0) - Number(b.display_order || 0)
      )
      .find(shift => defaultPatterns(shift).includes(pattern));
  }

  function nightShiftForPattern(pattern, row=null){
    const candidates = shiftMasterRows()
      .filter(
        shift =>
          supportsPattern(shift, pattern)
          && (!row || window.TimeClockSchedulingRulesV6120?.isShiftAllowedForRow?.(shift.shift_code, row) !== false)
          && shift.is_workday !== false
          && (
            shift.is_night_shift === true
            || window.tcIsNightShiftCode(shift.shift_code)
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

  // V6.14.30 — mixed 5D/6D quick actions must resolve per TARGET employee.
  // Core business mappings are stable and must not depend on whichever pattern
  // happens to be first in the visible table or on stale Shift Master metadata.
  const QUICK_SHIFT_BY_PATTERN_V61430 = Object.freeze({
    TECH_5D: Object.freeze({ NORMAL: "STD", NIGHT: "S134" }),
    TECH_6D: Object.freeze({ NORMAL: "S043", NIGHT: "S135" })
  });

  function semanticShiftForPattern(action, pattern, row=null){
    if (pattern === "UNASSIGNED") return null;

    const normalizedAction = String(action || "").trim().toUpperCase();
    const preferredCode = QUICK_SHIFT_BY_PATTERN_V61430?.[pattern]?.[normalizedAction] || null;
    if (preferredCode) {
      const preferred = configuredShift(preferredCode);
      if (
        preferred
        && preferred.is_active !== false
        && supportsPattern(preferred, pattern)
        && (!row || window.TimeClockSchedulingRulesV6120?.isShiftAllowedForRow?.(preferredCode, row) !== false)
      ) {
        return preferred;
      }
    }

    if (normalizedAction === "NORMAL") return window.TimeClockSchedulingRulesV6120?.resolveWorkingShift?.("NORMAL", pattern, row) || defaultShiftForPattern(pattern, row);
    if (normalizedAction === "NIGHT") return window.TimeClockSchedulingRulesV6120?.resolveWorkingShift?.("NIGHT", pattern, row) || nightShiftForPattern(pattern, row);
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
      .map(pattern => semanticShiftForPattern("NORMAL", pattern)?.shift_code)
      .filter(Boolean);

    const nightCodes = patterns
      .map(pattern => semanticShiftForPattern("NIGHT", pattern)?.shift_code)
      .filter(Boolean);

    if ($("scheduleQuickNormalCode")) {
      const unique = [...new Set(normalCodes)];
      $("scheduleQuickNormalCode").textContent =
        patterns.length > 1 && normalCodes.length > 1
          ? `5D→${QUICK_SHIFT_BY_PATTERN_V61430.TECH_5D.NORMAL} • 6D→${QUICK_SHIFT_BY_PATTERN_V61430.TECH_6D.NORMAL}`
          : unique.length === 1
            ? unique[0]
            : unique.length > 1
              ? unique.join(" / ")
              : "ยังไม่ตั้งค่า";
    }

    if ($("scheduleQuickNightCode")) {
      const unique = [...new Set(nightCodes)];
      $("scheduleQuickNightCode").textContent =
        patterns.length > 1 && nightCodes.length > 1
          ? `5D→${QUICK_SHIFT_BY_PATTERN_V61430.TECH_5D.NIGHT} • 6D→${QUICK_SHIFT_BY_PATTERN_V61430.TECH_6D.NIGHT}`
          : unique.length === 1
            ? unique[0]
            : unique.length > 1
              ? unique.join(" / ")
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

      // V6.14.13: Paired day-off codes are normalized for the TARGET employee
      // inside validateBulk(). Do not reject OSTD/OS043/OS134/OS135 here just
      // because the source employee belongs to another 5D/6D pattern.
      if (shift.is_workday === false) {
        valid.push(item);
        return;
      }

      const coreCode = window.tcShiftCode(item.shift_code);
      const stableCorePattern = ["STD","S134"].includes(coreCode)
        ? "TECH_5D"
        : ["S043","S135"].includes(coreCode)
          ? "TECH_6D"
          : null;

      if ((stableCorePattern && stableCorePattern !== pattern) || (!stableCorePattern && !supportsPattern(shift, pattern))) {
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
    await window.TimeClockSchedulingRulesV6120?.ensureRuntimeRules?.();
    const rows = selectedRows();
    if (!rows.length) {
      return app()?.toast("กรุณาเลือกช่องกะก่อน","error");
    }

    const mapped = [];
    const skipped = [];
    const summary = new Map();

    rows.forEach(item => {
      const pattern = rowPattern(item.row);
      const shift = semanticShiftForPattern(action, pattern, item.row);

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
        note: `กำหนด${smartActionLabel(action)}ตาม Work Pattern ${pattern} • V6.14.37 mixed-pattern + bidirectional-night-sequence + LV-compatible + minimum-rest smart quick shift`
      });

      const groupKey = `${pattern}|${shift.shift_code}`;
      summary.set(groupKey, (summary.get(groupKey) || 0) + 1);
    });

    // V6.14.35 — use the same minimum-rest transition logic as the Assignment
    // popup and the bulk guard before showing the quick-action confirmation.
    // This prevents one night→morning conflict from failing the whole 15-day /
    // full-month quick action after the user has already confirmed it.
    const restPrecheck = await window.TimeClockSchedulingRulesV6120?.precheckMinimumRestBulk?.(mapped) || {allowed: mapped, blocked: []};
    const restBlocked = Array.isArray(restPrecheck.blocked) ? restPrecheck.blocked : [];
    const blockedKeys = new Set(restBlocked.map(x => `${x.emp}|${x.date}`));
    const allowedMapped = mapped.filter(x => !blockedKeys.has(`${x.emp_code}|${x.work_date}`));
    mapped.length = 0;
    mapped.push(...allowedMapped);

    const finalSummary = new Map();
    mapped.forEach(item=>{
      const row=rowForKey(`${item.emp_code}|${item.work_date}`).row;
      const pattern=rowPattern(row);
      const key=`${pattern}|${item.shift_code}`;
      finalSummary.set(key,(finalSummary.get(key)||0)+1);
    });
    const lines = [...finalSummary.entries()].map(([key,count]) => {
      const [pattern,shiftCode] = key.split("|");
      return `• ${pattern === "TECH_5D" ? "5 วัน" : "6 วัน"}: ${count.toLocaleString("th-TH")} ช่อง → ${shiftCode}`;
    });

    if (skipped.length) {
      lines.push(`• ข้ามเพราะ Work Pattern/ตั้งค่า: ${skipped.length.toLocaleString("th-TH")} ช่อง`);
    }
    if (restBlocked.length) {
      const nightPolicy = restBlocked.filter(x=>x.nightSequenceBlock).length;
      const otherRest = restBlocked.length-nightPolicy;
      if(nightPolicy) lines.push(`• ข้ามเพราะลำดับกะดึกไม่ผ่าน: ${nightPolicy.toLocaleString("th-TH")} ช่อง (ตรวจทั้งวันก่อนหน้าและวันถัดไป)`);
      if(otherRest) lines.push(`• ข้ามเพราะพักต่ำกว่า 6 ชม.: ${otherRest.toLocaleString("th-TH")} ช่อง`);
      lines.push('  แนะนำ: กำหนดวันหยุดตามกะล่าสุด หรือเลือกกะกลางคืนแทน');
    }

    if (!mapped.length) {
      const firstRest=restBlocked[0];
      const restText=firstRest?.restMinutes!=null?(firstRest.restMinutes/60).toLocaleString('th-TH',{maximumFractionDigits:2}):'-';
      return app()?.toast(
        firstRest?.nightSequenceBlock
          ? (window.TimeClockSchedulingRulesV6120?.sequenceBlockMessage?.(firstRest) || 'กำหนดกะไม่ได้ตามเงื่อนไขลำดับกะดึก')
          : firstRest?.nightToMorning
            ? `กำหนดกะเช้าไม่ได้: วันก่อนหน้าเป็นกะดึก (${firstRest.previousCode||'-'}) ทำให้พักเพียง ${restText} ชม. ต่ำกว่า 6 ชม. • แนะนำให้กำหนดวันหยุด หรือเลือกกะกลางคืน`
            : (skippedSummary(skipped) || (firstRest?`กำหนดกะไม่ได้: เวลาพัก ${restText} ชม. ต่ำกว่า 6 ชม.`:"ไม่มีรายการที่สามารถกำหนดกะได้")),
        "error"
      );
    }

    const message = [
      `กำหนด${smartActionLabel(action)}จำนวน ${mapped.length.toLocaleString("th-TH")} ช่อง`,
      "",
      ...lines,
      (skipped.length || restBlocked.length)
        ? "\nรายการที่ไม่ผ่านเงื่อนไขจะถูกข้าม และไม่ถูกบันทึก"
        : ""
    ].join("\n");

    if (!await window.tcConfirm(message)) return;

    await savePayload(
      mapped,
      `กำหนด${smartActionLabel(action)}ตาม Work Pattern`,
      confirmNow,
      `กำหนด${smartActionLabel(action)}`
    );

    if (skipped.length || restBlocked.length) {
      app()?.toast(
        `บันทึกสำเร็จ ${mapped.length.toLocaleString("th-TH")} ช่อง • ข้าม ${(skipped.length+restBlocked.length).toLocaleString("th-TH")} ช่อง`,
        "info"
      );
    }
  }

  function updateHistoryButtons(){ $("scheduleUndoBtn") && ($("scheduleUndoBtn").disabled=!undoStack.length); $("scheduleRedoBtn") && ($("scheduleRedoBtn").disabled=!redoStack.length); }
  function updateSummary(){
    const counts={
      STD:0,
      S134:0,
      S043:0,
      S135:0,
      OFF:0,
      HOL:0,
      LV:0
    };

    cells().forEach(cell => {
      const row = rowForKey(keyOf(cell)).row;
      const code = window.tcShiftCode(
        currentCode(row)
      );
      const shiftForSummaryV6125 = configuredShift(code);
      const summaryCodeV6125 = (
        shiftForSummaryV6125?.is_workday === false &&
        !["HOL","LV"].includes(code)
      ) ? "OFF" : code;

      if (Object.prototype.hasOwnProperty.call(counts,summaryCodeV6125)) {
        counts[summaryCodeV6125]++;
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
    if(!payload.length) return false;

    const compatibility = payloadCompatibility(payload);
    const validPayload = compatibility.valid;

    if (!validPayload.length) {
      app()?.toast(
        skippedSummary(compatibility.skipped)
          || "ไม่มีรายการที่สามารถบันทึกได้",
        "error"
      );
      return false;
    }

    if (compatibility.skipped.length) {
      const proceed = await window.tcConfirm(
        `พบรายการที่ไม่รองรับ ${compatibility.skipped.length.toLocaleString("th-TH")} ช่อง

${skippedSummary(compatibility.skipped)}

ระบบจะข้ามรายการเหล่านี้และบันทึกเฉพาะรายการที่รองรับ ${validPayload.length.toLocaleString("th-TH")} ช่อง`
      );
      if (!proceed) return false;
    }

    const periodCheck = await window.TimeClockSystemPeriods?.checkScheduleDates?.(
      validPayload.map(item => item.work_date),
      true
    );
    if (periodCheck && !periodCheck.allowed) {
      app()?.toast(periodCheck.message || "มีวันที่อยู่ในรอบที่ปิดการจัดกะ", "warning");
      return false;
    }

    const ruleGuardV6120=await window.TimeClockSchedulingRulesV6120?.validateBulk?.(validPayload);
    if(ruleGuardV6120&&ruleGuardV6120.allowed===false)return false;

    const before=validPayload.map(p=>{const x=rowForKey(`${p.emp_code}|${p.work_date}`);return {...p,shift_code:currentCode(x.row)};});
    app().showLoading(`กำลังบันทึก ${validPayload.length.toLocaleString("th-TH")} รายการ...`);
    try{
      const autoConfirmOnSaveV61117 = validPayload.some(item =>
        item.shift_code !== null
        && item.shift_code !== undefined
        && String(item.shift_code).trim() !== ""
      );
      await window.TimeClockShiftAPI.assignBulk(app(), validPayload, reason, autoConfirmOnSaveV61117);
      await window.TimeClockSchedulingRulesV6120?.saveBulkExtensions?.(validPayload);
      await window.TimeClockConsistencyV61415?.finalizeSchedule?.(validPayload, { source:'schedule-pro-bulk' });
      undoStack.push({label:historyLabel,before,after:validPayload.map(x=>({...x}))}); if(undoStack.length>30)undoStack.shift(); redoStack.length=0; updateHistoryButtons();
      app().toast(
        `บันทึก ${validPayload.length.toLocaleString("th-TH")} รายการและประมวลผลเวลาใหม่แล้ว`,
        "success"
      );
      await app().loadSchedule();
      return true;
    }catch(err){app().toast(app().humanError(err),"error");return false;}finally{app().hideLoading();}
  }
  async function bulkAssign(shiftCode,confirmNow=false){const rows=selectedRows();if(!rows.length)return app()?.toast("กรุณาเลือกช่องกะก่อน","error");await savePayload(rows.map(x=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:shiftCode,note:"กำหนดจาก Schedule Pro"})),`กำหนดกะ ${shiftCode} จาก Schedule Pro`,confirmNow,`กำหนด ${shiftCode}`);}
  function copySelection(){
    const rows=selectedRows();
    if(!rows.length)return app()?.toast("กรุณาเลือกช่องที่ต้องการคัดลอก","error");
    clipboard=rows.map(x=>currentCode(x.row)||null);
    refreshSelectionUI();
    app().toast(`คัดลอก ${clipboard.length.toLocaleString("th-TH")} ช่องแล้ว • เลือกปลายทางแล้วกด วาง`,"success");
  }
  async function pasteSelection(){
    const targets=selectedRows();
    if(!clipboard.length)return app()?.toast("ยังไม่มีกะในคลิปบอร์ด","error");
    if(!targets.length)return app()?.toast("กรุณาเลือกช่องปลายทาง","error");
    if(targets.length!==clipboard.length){
      const ok=await window.tcConfirm(`คลิปบอร์ดมี ${clipboard.length.toLocaleString("th-TH")} ช่อง แต่เลือกปลายทาง ${targets.length.toLocaleString("th-TH")} ช่อง\n\nระบบจะวางตามลำดับจากซ้ายไปขวาและวนซ้ำเมื่อจำนวนไม่เท่ากัน ต้องการดำเนินการต่อหรือไม่?`);
      if(!ok)return;
    }
    await savePayload(targets.map((x,i)=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:clipboard[i%clipboard.length],note:"วางจากคลิปบอร์ด"})),"คัดลอกและวางกะจาก Schedule Pro",false,"วางกะ");
  }

  const monthCopyEscV61413 = value => String(value??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':'&quot;',"'":"&#39;"}[c]));

  function monthCopyEmployeeListV61413(){
    const fromScope = Array.isArray(app()?.state?.scheduleScopeEmployeesV61151) ? app().state.scheduleScopeEmployeesV61151 : [];
    const fromRows = [...new Map((app()?.state?.schedule||[]).map(r=>[String(r.emp_code||''),r])).values()];
    const rows = fromScope.length ? fromScope : fromRows;
    return rows.map(r=>({
      emp_code:String(r.emp_code||'').trim(),
      full_name:String(r.full_name||r.employee_name||r.name||'').trim(),
      department:String(r.department||'').trim(),
      start_date:String(r.start_date||'').slice(0,10),
      resign_date:String(r.resign_date||'').slice(0,10)
    })).filter(r=>r.emp_code).sort((a,b)=>(a.full_name||a.emp_code).localeCompare(b.full_name||b.emp_code,'th'));
  }

  function monthCopyEmployeeMetaV61413(emp){
    return monthCopyEmployeeListV61413().find(e=>e.emp_code===String(emp||''))||{emp_code:String(emp||''),full_name:''};
  }

  function monthCopyCurrentMonthV61413(){
    const range=window.TimeClockSchedulePeriod?.range?.()||{};
    return String(range.month||scheduleViewState.personMonth||$('schedulePeriodStart')?.value||window.TimeClockCalendarV61448.month()).slice(0,7);
  }

  function resetMonthCopyWorkflowV61413({silent=false}={}){
    monthCopyPhaseV61413='SOURCE';
    monthCopySourceCandidateV61413='';
    monthCopySourceV61413='';
    monthCopyMonthV61413='';
    monthCopySourceRowsV61413=[];
    monthCopyTargetsV61413.clear();
    updateMonthCopyWorkflowUIV61413();
    if(!silent)app()?.toast('ยกเลิกโหมดคัดลอกกะทั้งเดือนแล้ว','info');
  }

  function visibleMonthCopyCheckboxesV61413(){
    return [...(wrap()?.querySelectorAll('[data-month-copy-emp]')||[])];
  }

  function updateMonthCopyWorkflowUIV61413(){
    const currentMonth=monthCopyCurrentMonthV61413();
    if(monthCopySourceV61413 && monthCopyMonthV61413 && currentMonth!==monthCopyMonthV61413){
      // Never paste a copied month into a different visible month by accident.
      monthCopyPhaseV61413='SOURCE';
      monthCopySourceCandidateV61413='';
      monthCopySourceV61413='';
      monthCopyMonthV61413='';
      monthCopySourceRowsV61413=[];
      monthCopyTargetsV61413.clear();
    }

    const sourceMeta=monthCopyEmployeeMetaV61413(monthCopySourceV61413||monthCopySourceCandidateV61413);
    const status=$('scheduleMonthCopyWorkflowV61413');
    const copyBtn=$('scheduleCopyMonthBtnV61412');
    const pasteBtn=$('schedulePasteMonthBtnV61413');
    const cancelBtn=$('scheduleCancelMonthCopyBtnV61413');

    if(copyBtn){
      copyBtn.disabled=monthCopyPhaseV61413!=='SOURCE'||!monthCopySourceCandidateV61413;
      copyBtn.textContent=monthCopyPhaseV61413==='TARGET'?'คัดลอกแล้ว':'คัดลอกทั้งเดือน';
    }
    if(pasteBtn)pasteBtn.disabled=monthCopyPhaseV61413!=='TARGET'||monthCopyTargetsV61413.size===0;
    if(cancelBtn)cancelBtn.classList.toggle('hidden',!monthCopySourceCandidateV61413&&!monthCopySourceV61413&&!monthCopyTargetsV61413.size);

    if(status){
      if(monthCopyPhaseV61413==='TARGET'&&monthCopySourceV61413){
        status.classList.remove('hidden');
        status.innerHTML=`<div class="month-copy-status-source-v61413"><span>ต้นทางที่คัดลอก</span><strong>${monthCopyEscV61413(sourceMeta.emp_code)} • ${monthCopyEscV61413(sourceMeta.full_name||'-')}</strong><small>${monthCopyEscV61413(monthCopyMonthV61413)} • เลือก Checkbox ปลายทางได้หลายคน</small></div><div class="month-copy-status-target-v61413"><span>ปลายทาง</span><strong>${monthCopyTargetsV61413.size.toLocaleString('th-TH')} คน</strong><small>${monthCopyTargetsV61413.size?'พร้อมกด วางกะทั้งเดือน':'กรุณาเลือกพนักงานปลายทาง'}</small></div>`;
      }else if(monthCopySourceCandidateV61413){
        status.classList.remove('hidden');
        status.innerHTML=`<div class="month-copy-status-source-v61413 candidate"><span>ต้นทางที่เลือก</span><strong>${monthCopyEscV61413(sourceMeta.emp_code)} • ${monthCopyEscV61413(sourceMeta.full_name||'-')}</strong><small>กด “คัดลอกทั้งเดือน” เพื่อเข้าสู่ขั้นเลือกปลายทาง</small></div>`;
      }else{
        status.classList.add('hidden');
        status.innerHTML='';
      }
    }

    visibleMonthCopyCheckboxesV61413().forEach(box=>{
      const emp=String(box.dataset.monthCopyEmp||'');
      const row=box.closest('tr');
      const managerOwn=String(box.dataset.managerOwn||'')==='true';
      const isSource=monthCopyPhaseV61413==='TARGET'&&emp===monthCopySourceV61413;
      const isCandidate=monthCopyPhaseV61413==='SOURCE'&&emp===monthCopySourceCandidateV61413;
      const isTarget=monthCopyTargetsV61413.has(emp);
      box.checked=isSource||isCandidate||isTarget;
      box.disabled=monthCopyPhaseV61413==='TARGET'&&(isSource||managerOwn);
      box.title=isSource?'ต้นทางที่คัดลอกแล้ว':managerOwn&&monthCopyPhaseV61413==='TARGET'?'บัญชีตนเองเป็นดูอย่างเดียว ไม่สามารถเป็นปลายทางได้':monthCopyPhaseV61413==='TARGET'?'เลือกเป็นพนักงานปลายทาง':'เลือกเป็นพนักงานต้นทาง';
      row?.classList.toggle('month-copy-source-candidate-v61413',isCandidate);
      row?.classList.toggle('month-copy-source-v61413',isSource);
      row?.classList.toggle('month-copy-target-v61413',isTarget);
    });

    const all=$('scheduleMonthCopySelectAllV61413');
    if(all){
      const eligible=visibleMonthCopyCheckboxesV61413().filter(b=>!b.disabled&&String(b.dataset.monthCopyEmp||'')!==monthCopySourceV61413);
      const selectedCount=eligible.filter(b=>monthCopyTargetsV61413.has(String(b.dataset.monthCopyEmp||''))).length;
      all.disabled=monthCopyPhaseV61413!=='TARGET'||eligible.length===0;
      all.checked=monthCopyPhaseV61413==='TARGET'&&eligible.length>0&&selectedCount===eligible.length;
      all.indeterminate=monthCopyPhaseV61413==='TARGET'&&selectedCount>0&&selectedCount<eligible.length;
      all.title=monthCopyPhaseV61413==='TARGET'?'เลือก/ยกเลิกพนักงานปลายทางทั้งหมดที่แสดง':'เลือกต้นทางได้ทีละ 1 คน';
    }
  }

  function handleMonthCopyCheckboxV61413(box){
    const emp=String(box?.dataset?.monthCopyEmp||'').trim();
    if(!emp)return;
    if(monthCopyPhaseV61413==='SOURCE'){
      monthCopySourceCandidateV61413=box.checked?emp:'';
      // source is always single-select
      visibleMonthCopyCheckboxesV61413().forEach(other=>{if(other!==box)other.checked=false;});
    }else{
      if(emp===monthCopySourceV61413)return;
      if(box.checked)monthCopyTargetsV61413.add(emp);else monthCopyTargetsV61413.delete(emp);
    }
    updateMonthCopyWorkflowUIV61413();
  }

  function handleMonthCopySelectAllV61413(box){
    if(monthCopyPhaseV61413!=='TARGET')return;
    visibleMonthCopyCheckboxesV61413().forEach(item=>{
      if(item.disabled)return;
      const emp=String(item.dataset.monthCopyEmp||'');
      if(!emp||emp===monthCopySourceV61413)return;
      if(box.checked)monthCopyTargetsV61413.add(emp);else monthCopyTargetsV61413.delete(emp);
    });
    updateMonthCopyWorkflowUIV61413();
  }

  async function fetchMonthRowsForCopyV61413(empCodes,month){
    const codes=[...new Set((Array.isArray(empCodes)?empCodes:[empCodes]).map(x=>String(x||'').trim()).filter(Boolean))];
    if(!codes.length)return [];
    const [y,m]=String(month).split('-').map(Number);
    const last=new Date(y,m,0).getDate();
    const start=`${month}-01`,end=`${month}-${String(last).padStart(2,'0')}`;
    const out=[];
    // Keep requests moderate for large teams; source usually uses one batch.
    for(let i=0;i<codes.length;i+=12){
      const batch=codes.slice(i,i+12);
      const rows=await window.TimeClockShiftAPI.getMonthlySchedule(app(),{
        p_month:start,p_start_date:start,p_end_date:end,
        p_zone:document.getElementById('scheduleZone')?.value||null,
        p_department:document.getElementById('scheduleDepartment')?.value||null,
        p_emp_codes:batch,p_schedule_statuses:null,p_disable_range_paging:true
      })||[];
      out.push(...rows);
    }
    return out;
  }

  function mergeMonthRowsIntoStateV61413(rows=[]){
    const current=app()?.state?.schedule||[];
    const map=new Map(current.map(r=>[`${String(r.emp_code||'')}|${String(r.work_date||'').slice(0,10)}`,r]));
    rows.forEach(r=>map.set(`${String(r.emp_code||'')}|${String(r.work_date||'').slice(0,10)}`,r));
    if(app()?.state)app().state.schedule=[...map.values()];
  }

  async function copyMonthSourceV61413(){
    const source=String(monthCopySourceCandidateV61413||'').trim();
    if(!source)return app()?.toast('กรุณาเลือก Checkbox พนักงานต้นทาง 1 คนก่อน','warning');
    const month=monthCopyCurrentMonthV61413();
    app()?.showLoading('กำลังคัดลอกรูปแบบกะทั้งเดือน...');
    try{
      const rows=await fetchMonthRowsForCopyV61413([source],month);
      if(!rows.length)return app()?.toast('ไม่พบข้อมูลกะของพนักงานต้นทางในเดือนที่เลือก','warning');
      monthCopySourceV61413=source;
      monthCopyMonthV61413=month;
      monthCopySourceRowsV61413=rows.slice().sort((a,b)=>String(a.work_date||'').localeCompare(String(b.work_date||'')));
      monthCopyTargetsV61413.clear();
      monthCopyPhaseV61413='TARGET';
      mergeMonthRowsIntoStateV61413(rows);
      updateMonthCopyWorkflowUIV61413();
      const meta=monthCopyEmployeeMetaV61413(source);
      app()?.toast(`คัดลอกกะทั้งเดือนของ ${meta.full_name||source} แล้ว • เลือก Checkbox ปลายทางแล้วกด วางกะทั้งเดือน`,'success');
    }catch(e){app()?.toast(app()?.humanError?.(e)||e.message||String(e),'error');}
    finally{app()?.hideLoading();}
  }

  function monthCopyPasteModeV61413(){return String($('scheduleMonthCopyModeV61413')?.value||'EMPTY_ONLY');}

  async function buildMonthCopyPlanV61413(showLoading=false){
    const source=String(monthCopySourceV61413||'').trim();
    const targets=[...monthCopyTargetsV61413].filter(emp=>emp&&emp!==source);
    const month=String(monthCopyMonthV61413||monthCopyCurrentMonthV61413()).slice(0,7);
    const mode=monthCopyPasteModeV61413();
    if(!source||!targets.length||!month)return {payload:[],reason:'กรุณาคัดลอกต้นทางและเลือกพนักงานปลายทางอย่างน้อย 1 คน'};
    if(showLoading)app()?.showLoading('กำลังตรวจรูปแบบกะของพนักงานปลายทาง...');
    try{
      const sourceRows=(monthCopySourceRowsV61413.length&&monthCopyMonthV61413===month)
        ? monthCopySourceRowsV61413
        : await fetchMonthRowsForCopyV61413([source],month);
      const targetRows=await fetchMonthRowsForCopyV61413(targets,month);
      mergeMonthRowsIntoStateV61413([...sourceRows,...targetRows]);
      const rowsByTarget=new Map(targets.map(emp=>[emp,new Map()]));
      targetRows.forEach(r=>{
        const emp=String(r.emp_code||'');const date=String(r.work_date||'').slice(0,10);
        if(rowsByTarget.has(emp)&&date)rowsByTarget.get(emp).set(date,r);
      });
      const employees=monthCopyEmployeeListV61413();
      const payload=[];
      const targetSummary=[];
      const total={workCount:0,offCount:0,skipLeave:0,skipHol:0,skipLegacyOff:0,skipEmployment:0,skipExisting:0,skipSpecial:0};
      for(const target of targets){
        const targetMeta=employees.find(e=>e.emp_code===target)||{};
        const targetByDate=rowsByTarget.get(target)||new Map();
        const q={emp_code:target,full_name:targetMeta.full_name||'',ready:0,workCount:0,offCount:0,skipLeave:0,skipHol:0,skipLegacyOff:0,skipEmployment:0,skipExisting:0,skipSpecial:0};
        for(const row of sourceRows){
          const date=String(row.work_date||'').slice(0,10);
          let code=currentCode(row);
          if(!date||!code)continue;
          code=String(code).toUpperCase();
          if(code==='LV'){q.skipLeave++;continue;}
          if(code==='HOL'||(row.is_public_holiday===true&&code==='HOL')){q.skipHol++;continue;}
          if(code==='OFF'){q.skipLegacyOff++;continue;}
          const ruleMode=String(row.schedule_rule_mode||row.work_mode_code||'').toUpperCase();
          if(['HOUR_BASED','SPLIT_WAIT_NIGHT','NORMAL_LATE_CUSTOMER'].includes(ruleMode)||row.shift_2_planned_start_at||row.customer_window_start){q.skipSpecial++;continue;}
          if(targetMeta.start_date&&date<targetMeta.start_date){q.skipEmployment++;continue;}
          if(targetMeta.resign_date&&date>=targetMeta.resign_date){q.skipEmployment++;continue;}
          const targetRow=targetByDate.get(date);
          if(mode==='EMPTY_ONLY'&&String(targetRow?.assigned_shift_code||'').trim()){q.skipExisting++;continue;}
          const sm=configuredShift(code);
          if(sm?.is_workday===false)q.offCount++;else q.workCount++;
          q.ready++;
          payload.push({emp_code:target,work_date:date,shift_code:code,note:`คัดลอกรูปแบบกะทั้งเดือนจาก ${source}`});
        }
        ['workCount','offCount','skipLeave','skipHol','skipLegacyOff','skipEmployment','skipExisting','skipSpecial'].forEach(k=>total[k]+=q[k]);
        targetSummary.push(q);
      }
      return {payload,source,targets,month,mode,summary:{...total,targetCount:targets.length,ready:payload.length},targetSummary};
    }finally{if(showLoading)app()?.hideLoading();}
  }

  function renderMonthCopyTargetListV61413(plan){
    const host=$('scheduleMonthCopyTargetListV61413');if(!host)return;
    host.innerHTML=(plan?.targetSummary||[]).map(q=>{
      const skipped=q.skipLeave+q.skipHol+q.skipLegacyOff+q.skipEmployment+q.skipExisting+q.skipSpecial;
      return `<div class="month-copy-target-item-v61413"><div><strong>${monthCopyEscV61413(q.emp_code)} • ${monthCopyEscV61413(q.full_name||'-')}</strong><small>พร้อมวาง ${q.ready.toLocaleString('th-TH')} วัน${skipped?` • ข้าม ${skipped.toLocaleString('th-TH')} วัน`:''}</small></div><span class="${skipped?'has-skip':''}">${q.ready.toLocaleString('th-TH')}</span></div>`;
    }).join('')||'<div class="muted">ยังไม่ได้เลือกพนักงานปลายทาง</div>';
  }

  async function refreshMonthCopyPreviewV61413(){
    const box=$('scheduleMonthCopyPreviewV61413');if(!box)return;
    box.innerHTML='<span class="muted">กำลังสรุปรายการ...</span>';
    try{
      const plan=await buildMonthCopyPlanV61413(false);
      if(plan.reason){box.textContent=plan.reason;renderMonthCopyTargetListV61413(plan);return;}
      const q=plan.summary;
      const skipped=q.skipLeave+q.skipHol+q.skipLegacyOff+q.skipEmployment+q.skipExisting+q.skipSpecial;
      box.innerHTML=`<div class="month-copy-preview-grid-v61413"><span><b>${q.targetCount.toLocaleString('th-TH')}</b><small>พนักงานปลายทาง</small></span><span><b>${q.ready.toLocaleString('th-TH')}</b><small>รายการที่จะวาง</small></span><span><b>${q.workCount.toLocaleString('th-TH')}</b><small>กะทำงาน</small></span><span><b>${q.offCount.toLocaleString('th-TH')}</b><small>วันหยุด</small></span><span><b>${skipped.toLocaleString('th-TH')}</b><small>รายการข้าม</small></span></div><small>ข้ามรวม: ลา ${q.skipLeave} • HOL ${q.skipHol} • กะพิเศษ ${q.skipSpecial} • ก่อนเริ่ม/หลังลาออก ${q.skipEmployment} • มีการจัดกะเดิม ${q.skipExisting}</small>`;
      renderMonthCopyTargetListV61413(plan);
    }catch(e){box.textContent=app()?.humanError?.(e)||e.message||String(e);}
  }

  function openMonthCopyPasteV61413(){
    if(monthCopyPhaseV61413!=='TARGET'||!monthCopySourceV61413)return app()?.toast('กรุณาคัดลอกพนักงานต้นทางก่อน','warning');
    if(!monthCopyTargetsV61413.size)return app()?.toast('กรุณาเลือก Checkbox พนักงานปลายทางอย่างน้อย 1 คน','warning');
    const modal=$('scheduleMonthCopyModalV61413');if(!modal)return;
    const source=monthCopyEmployeeMetaV61413(monthCopySourceV61413);
    if($('scheduleMonthCopySourceSummaryV61413'))$('scheduleMonthCopySourceSummaryV61413').innerHTML=`<span>ต้นทาง</span><strong>${monthCopyEscV61413(source.emp_code)} • ${monthCopyEscV61413(source.full_name||'-')}</strong><small>${monthCopyEscV61413(monthCopyMonthV61413)}</small>`;
    if($('scheduleMonthCopyTargetSummaryV61413'))$('scheduleMonthCopyTargetSummaryV61413').innerHTML=`<span>ปลายทาง</span><strong>${monthCopyTargetsV61413.size.toLocaleString('th-TH')} คน</strong><small>ตรวจ Preview ก่อนยืนยัน</small>`;
    modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
    document.body.classList.add('month-copy-modal-open-v61414');
    refreshMonthCopyPreviewV61413();
  }

  function closeMonthCopyPasteV61413(){
    const modal=$('scheduleMonthCopyModalV61413');
    modal?.classList.add('hidden');
    modal?.setAttribute('aria-hidden','true');
    document.body.classList.remove('month-copy-modal-open-v61414');
  }

  // V6.14.14: The preview modal itself is the confirmation surface.
  // Do not open tcConfirm() on top of it. Close Preview first, then let
  // savePayload() display any rule-specific warning (6h/48h/quota/etc.) alone.
  async function applyMonthCopyV61413(){
    if(monthCopyApplyingV61414)return;
    const applyBtn=$('scheduleMonthCopyApplyV61413');
    const originalText=applyBtn?.textContent||'ยืนยันวางกะ';
    monthCopyApplyingV61414=true;
    if(applyBtn){applyBtn.disabled=true;applyBtn.textContent='กำลังตรวจสอบ...';}
    let modalClosed=false;
    try{
      // Keep validation inside the current preview modal; avoid a second
      // full-screen loading backdrop while the preview is still visible.
      const plan=await buildMonthCopyPlanV61413(false);
      if(plan.reason){app()?.toast(plan.reason,'error');return;}
      if(!plan.payload.length){app()?.toast('ไม่มีรายการกะที่สามารถวางได้','warning');return;}
      const q=plan.summary;

      // Clicking this button is the user's final confirmation of the Preview.
      // Close it BEFORE savePayload(), because savePayload may need to show a
      // business-rule confirm modal. This guarantees one modal at a time.
      closeMonthCopyPasteV61413();
      modalClosed=true;

      const saved=await savePayload(
        plan.payload,
        `คัดลอกรูปแบบกะทั้งเดือนจาก ${plan.source} ไป ${q.targetCount} คน`,
        false,
        'คัดลอกทั้งเดือน'
      );
      if(saved){
        resetMonthCopyWorkflowV61413({silent:true});
      }else if(monthCopyPhaseV61413==='TARGET'&&monthCopySourceV61413&&monthCopyTargetsV61413.size){
        // User may cancel a 48h/quota/compatibility warning. Return to Preview
        // instead of leaving the workflow in an unclear half-finished state.
        requestAnimationFrame(()=>openMonthCopyPasteV61413());
      }
    }catch(e){
      app()?.toast(app()?.humanError?.(e)||e.message||String(e),'error');
      if(modalClosed&&monthCopyPhaseV61413==='TARGET'&&monthCopySourceV61413&&monthCopyTargetsV61413.size){
        requestAnimationFrame(()=>openMonthCopyPasteV61413());
      }
    }finally{
      monthCopyApplyingV61414=false;
      if(applyBtn){applyBtn.disabled=false;applyBtn.textContent=originalText;}
    }
  }
  async function clearCells(){const rows=selectedRows();if(!rows.length)return app()?.toast("กรุณาเลือกช่องที่ต้องการล้าง","error");if(!await window.tcConfirm(`ล้างกะที่กำหนดจำนวน ${rows.length} ช่อง?`))return;await savePayload(rows.map(x=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:null,note:"ล้างกะจาก Schedule Pro"})),"ล้างกะจาก Schedule Pro",false,"ล้างกะ");}
  async function applyHistory(item,mode){
    const payload=(mode==="undo"?item.before:item.after).map(x=>({...x,note:`${mode} ${item.label}`}));
    const periodCheck=await window.TimeClockSystemPeriods?.checkScheduleDates?.(payload.map(x=>x.work_date),true);
    if(periodCheck&&!periodCheck.allowed){app()?.toast(periodCheck.message||"ไม่สามารถแก้ไขรายการย้อนหลังในรอบที่ปิดแล้ว","warning");return;}
    app().showLoading(`กำลัง ${mode==="undo"?"ย้อนกลับ":"ทำซ้ำ"}...`);
    try{
      const ruleGuardV6125=await window.TimeClockSchedulingRulesV6120?.validateBulk?.(payload);
      if(ruleGuardV6125&&ruleGuardV6125.allowed===false)return;
      const autoConfirmOnSaveV61117=payload.some(x=>x.shift_code!==null&&x.shift_code!==undefined&&String(x.shift_code).trim()!=="");
      await window.TimeClockShiftAPI.assignBulk(app(),payload,`${mode} ${item.label}`,autoConfirmOnSaveV61117);
      await window.TimeClockSchedulingRulesV6120?.saveBulkExtensions?.(payload);
      await window.TimeClockConsistencyV61415?.finalizeSchedule?.(payload, { source:`schedule-${mode}` });
      (mode==="undo"?redoStack:undoStack).push(item);updateHistoryButtons();await app().loadSchedule();app().toast(mode==="undo"?"ย้อนกลับและประมวลผลเวลาใหม่แล้ว":"ทำซ้ำและประมวลผลเวลาใหม่แล้ว","success");
    }catch(err){app().toast(app().humanError(err),"error");}finally{app().hideLoading();}
  }
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
    const range=window.TimeClockSchedulePeriod?.range?.()||{};
    const current=new Date(`${periodStartDate()}T00:00:00`);
    const personMode=range.viewMode==='PERSON';
    const personFull=personMode&&String(scheduleViewState.personDisplayMode||'MONTH').toUpperCase()!=='15D';
    if(personFull){
      const nextMonth=new Date(current.getFullYear(),current.getMonth()+delta,1);
      const next=scheduleBlockStart(nextMonth.getFullYear(),nextMonth.getMonth()+1,1);
      if($('schedulePeriodStart'))$('schedulePeriodStart').value=next;
      scheduleViewState.personMonth=next.slice(0,7);
      scheduleViewState.personPeriodStart=next;
      try{localStorage.setItem('timeclock.schedule.personMonth',scheduleViewState.personMonth);localStorage.setItem('timeclock.schedule.personPeriodStart',scheduleViewState.personPeriodStart);}catch(_){}
      window.TimeClockSchedulePeriod?.sync?.();app()?.loadSchedule();return;
    }
    const year=current.getFullYear(),month=current.getMonth()+1,day=current.getDate(),starts=[1,16],index=starts.indexOf(day);let next;
    if(delta>0){const candidate=starts[index+1];if(candidate&&candidate<=new Date(year,month,0).getDate())next=scheduleBlockStart(year,month,candidate);else{const following=new Date(year,month,1);next=scheduleBlockStart(following.getFullYear(),following.getMonth()+1,1);}}
    else{const candidate=starts[index-1];if(candidate)next=scheduleBlockStart(year,month,candidate);else{const previous=new Date(year,month-2,1);const previousLastDay=new Date(previous.getFullYear(),previous.getMonth()+1,0).getDate();const previousStart=[...starts].reverse().find(item=>item<=previousLastDay)||1;next=scheduleBlockStart(previous.getFullYear(),previous.getMonth()+1,previousStart);}}
    if($('schedulePeriodStart'))$('schedulePeriodStart').value=next;
    if(personMode){scheduleViewState.personPeriodStart=next;scheduleViewState.personMonth=next.slice(0,7);try{localStorage.setItem('timeclock.schedule.personPeriodStart',next);localStorage.setItem('timeclock.schedule.personMonth',scheduleViewState.personMonth);}catch(_){}}
    else{scheduleViewState.teamPeriodStart=next;try{localStorage.setItem('timeclock.schedule.teamPeriodStart',next);}catch(_){}}
    window.TimeClockSchedulePeriod?.sync?.();app()?.loadSchedule();
  }
  function openContext(e,cell){e.preventDefault();selectCell(cell,e.ctrlKey||e.metaKey,e.shiftKey);const menu=$("scheduleContextMenu");menu.hidden=false;menu.style.left=Math.min(e.clientX,innerWidth-190)+"px";menu.style.top=Math.min(e.clientY,innerHeight-310)+"px";}
  function closeContext(){const m=$("scheduleContextMenu");if(m)m.hidden=true;}
  function setPersonDaysModeV61412(mode){
    const next=String(mode||'MONTH').toUpperCase()==='15D'?'15D':'MONTH';
    if(String(scheduleViewState.personDisplayMode||'MONTH').toUpperCase()===next){window.TimeClockSchedulePeriod?.sync?.();return;}
    const current=String($('schedulePeriodStart')?.value||`${scheduleViewState.personMonth||window.TimeClockCalendarV61448.month()}-01`).slice(0,10);
    scheduleViewState.personDisplayMode=next;
    scheduleViewState.personMonth=current.slice(0,7);
    scheduleViewState.personPeriodStart=scheduleBlockStartForDate(current);
    const start=next==='15D'?scheduleViewState.personPeriodStart:`${scheduleViewState.personMonth}-01`;
    if($('schedulePeriodStart'))$('schedulePeriodStart').value=start;
    try{localStorage.setItem('timeclock.schedule.personDisplayMode',next);localStorage.setItem('timeclock.schedule.personMonth',scheduleViewState.personMonth);localStorage.setItem('timeclock.schedule.personPeriodStart',scheduleViewState.personPeriodStart);}catch(_){}
    window.TimeClockSchedulePeriod?.sync?.();app()?.loadSchedule();
  }

  async function loadEnforcement(){
    try{
      state.enforcement=await rpc('ta_get_team_enforcement_state_v61525',{});
      renderEnforcement();
    }catch(e){
      console.warn('Team Enforcement V6.15.25',e);
      const st=$('teamEnforcementStatusV61525');if(st)st.textContent='ยังไม่ได้ติดตั้ง SQL V6.15.25';
    }
  }
  function renderEnforcement(){
    const x=state.enforcement||{},total=Number(x.team_total||0),ready=Number(x.ready_team_count||0),notReady=Number(x.not_ready_team_count||0);
    const st=$('teamEnforcementStatusV61525');if(st){st.textContent=notReady===0&&total>0?'Auto Ready':'ตรวจอัตโนมัติ';st.className='badge '+(notReady===0&&total>0?'badge-green':'badge-blue');}
    const detail=$('teamEnforcementDetailV61525');if(detail)detail.textContent='ระบบตรวจรูปแบบการปฏิบัติงาน + Effective Team ตามวันที่อัตโนมัติ • HR Admin ไม่ต้องเปิด/ปิด Enforcement';
    const put=(id,v)=>{const n=$(id);if(n)n.textContent=Number(v||0).toLocaleString('th-TH');};
    put('teamEnforcementEnabledTeamsV61529',ready);
    put('teamEnforcementReadyTeamsV61529',notReady);
    put('teamEnforcementNotReadyTeamsV61529',x.unclassified_total);
    put('teamEnforcementTotalTeamsV61529',total);
    put('teamEnforcementMissingV61525',x.car_without_team);put('teamEnforcementSupportMissingV61528',x.support_without_team);put('teamEnforcementUnclassifiedV61527',x.unclassified_total);
    const org=selectedOrgId()?orgById(selectedOrgId()):null;const scope=$('teamEnforcementScopeLabelV61529');if(scope)scope.textContent=org?`${org.org_code} · ${org.org_name}`:'ทุกหน่วยงานใน Scope';
    const title=$('teamEnforcementReadyV61525');if(title)title.textContent=notReady===0&&Number(x.unclassified_total||0)===0?'✓ พร้อมจัดกะอัตโนมัติ':'ยังมีรายการต้องจัดข้อมูล';
    const txt=$('teamEnforcementRolloutTextV61529');if(txt)txt.textContent=notReady===0?'เมื่อสมาชิกมี Operational Profile และ Active Team ระบบอนุญาตจัดกะทันที':'จัดรูปแบบและสมาชิกทีมให้ครบ ระบบจะเปลี่ยนเป็นพร้อมจัดกะอัตโนมัติ';
    const btn=$('teamEnforcementToggleV61525');if(btn){btn.classList.add('hidden');btn.disabled=true;btn.setAttribute('aria-hidden','true');}
  }
  function toggleEnforcement(){openEnforcementRollout();}
  function enforcementModalDate(){return $('teamEnforcementEffectiveV61529')?.value||today();}
  function enforcementModalOrg(){return $('teamEnforcementOrgV61529')?.value||'';}
  function enforcementAction(){return String($('teamEnforcementActionV61529')?.value||'ENABLE').toUpperCase();}
  function enforcementFilter(){return String($('teamEnforcementTeamStatusV61529')?.value||'ALL').toUpperCase();}
  function enforcementSourceLabel(source){const x=String(source||'').toUpperCase();return x==='TEAM'?'เฉพาะทีม':x==='ORG'?'จากหน่วยงาน':x==='GLOBAL'?'จากทั้งระบบ':'ตามค่าเริ่มต้น';}
  function setEnforcementScope(mode){state.enforcementScope=String(mode||'TEAM').toUpperCase();document.querySelectorAll('[data-enforcement-scope-v61529]').forEach(b=>b.classList.toggle('active',b.dataset.enforcementScopeV61529===state.enforcementScope));document.querySelectorAll('[data-enforcement-scope-pane-v61529]').forEach(p=>p.classList.toggle('hidden',p.dataset.enforcementScopePaneV61529!==state.enforcementScope));state.enforcementSelected.clear();renderEnforcementModal();}
  function renderEnforcementScopeSummary(targetId,summary,mode){
    const box=$(targetId);if(!box)return;const s=summary||{};const blockers=Number(s.car_without_team||0)+Number(s.support_without_team||0)+Number(s.unclassified_total||0);const enabled=mode==='GLOBAL'?s.global_default_enabled===true:s.org_default_enabled===true;const label=mode==='GLOBAL'?'ทั้งระบบ':'หน่วยงานนี้';
    box.innerHTML=`<article><span>รถยนต์ยังไม่มีทีม</span><strong>${Number(s.car_without_team||0).toLocaleString('th-TH')}</strong></article><article><span>สนับสนุนยังไม่มีทีม</span><strong>${Number(s.support_without_team||0).toLocaleString('th-TH')}</strong></article><article><span>รอกำหนดรูปแบบ</span><strong>${Number(s.unclassified_total||0).toLocaleString('th-TH')}</strong></article><article><span>สถานะปัจจุบัน</span><strong>${enabled?'เปิด':'ปิด'}</strong></article><div class="scope-summary-message-v61529 ${blockers===0?'ok':'warn'}"><strong>${blockers===0?`✓ ${label} พร้อมสำหรับเปิด Enforcement`:`⚠ ${label} ยังไม่พร้อมเปิด`}</strong>${blockers===0?'<br><small>เมื่อเปิด จะครอบคลุมพนักงานทุกคนใน Scope ตามวันที่มีผล</small>':`<br><small>ต้องจัดข้อมูลให้ครบอีก ${blockers.toLocaleString('th-TH')} รายการก่อนเปิดระดับนี้</small>`}</div>`;
  }
  function rolloutRowsVisible(){const f=enforcementFilter(),action=enforcementAction();return (state.enforcementRows||[]).filter(r=>{if(f==='READY'&&!r.ready_to_enable)return false;if(f==='ENABLED'&&!r.enforcement_enabled)return false;if(f==='NOT_READY'&&r.ready_to_enable)return false;if(action==='ENABLE'&&f==='ALL'&&r.enforcement_enabled&&r.enforcement_source==='TEAM')return true;return true;});}
  function renderEnforcementTeamRows(){
    const box=$('teamEnforcementTeamListV61529');if(!box)return;const rows=rolloutRowsVisible();const action=enforcementAction();
    box.innerHTML=rows.length?rows.map(r=>{
      const id=String(r.team_id),selected=state.enforcementSelected.has(id);
      const canSelect=isHr()&&(action==='ENABLE'?(r.ready_to_enable===true&&!r.enforcement_enabled):r.enforcement_enabled===true);
      const max=r.max_members==null?'':` / ${r.max_members}`;
      const readiness=r.ready_to_enable?'<span class="team-enforcement-ready-v61529 ok">✓ พร้อม</span>':`<span class="team-enforcement-ready-v61529 warn">⚠ ${r.readiness_code==='TEAM_NOT_READY'?'สมาชิกยังไม่ครบ':'ข้อมูลยังไม่พร้อม'}</span>`;
      const src=enforcementSourceLabel(r.enforcement_source);
      const status=r.enforcement_enabled?`<span class="team-enforcement-ready-v61529 on">เปิด · ${esc(src)}</span>`:'<span class="badge badge-gray">ยังไม่เปิด</span>';
      const context=r.direct_team_override?'กำหนดที่ทีมนี้':r.enforcement_enabled?src:'ยังไม่มี Enforcement';
      const disabledReason=action==='ENABLE'&&r.enforcement_enabled?'เปิดใช้งานอยู่แล้ว':action==='ENABLE'&&!r.ready_to_enable?'ยังไม่พร้อมเปิด':'';
      return `<label class="team-enforcement-team-row-v61529 ${canSelect?'':'disabled'}"><input type="checkbox" data-enforcement-team-check-v61529="${esc(id)}" ${selected?'checked':''} ${canSelect?'':'disabled'}/><div class="team-enforcement-team-name-v61529"><strong>${catIcon(r.team_category)} ${esc(r.team_name)}</strong><code>${esc(r.team_code)} · ${esc(r.org_code)}</code>${disabledReason?`<small class="team-enforcement-disabled-reason-v61529f1">${esc(disabledReason)}</small>`:''}</div><div data-col-v61529="capacity"><strong>${Number(r.member_count||0)}${max} คน</strong><small>${esc(catLabel(r.team_category))}</small></div><div data-col-v61529="readiness">${readiness}<small>${esc(context)}</small></div><div data-col-v61529="effective">${status}<small>${r.enforcement_effective_from?`มีผล ${fmtDate(r.enforcement_effective_from)}`:'-'}</small></div></label>`;
    }).join(''):'<div class="fc-empty">ไม่พบทีมที่ตรงกับเงื่อนไข</div>';
    const count=$('teamEnforcementSelectedCountV61529');if(count)count.textContent=state.enforcementSelected.size.toLocaleString('th-TH');
  }
  function renderEnforcementModal(){
    const action=enforcementAction(),mode=state.enforcementScope,s=state.enforcementModalState||state.enforcement||{};renderEnforcementTeamRows();
    renderEnforcementScopeSummary('teamEnforcementOrgSummaryV61529',s,'ORG');renderEnforcementScopeSummary('teamEnforcementGlobalSummaryV61529',s,'GLOBAL');
    const noteLabel=$('teamEnforcementNoteLabelV61529'),noteHint=$('teamEnforcementNoteHintV61529'),note=$('teamEnforcementNoteV61529');
    const noteWrap=note?.closest('.team-enforcement-note-v61529');
    if(noteLabel)noteLabel.textContent=action==='DISABLE'?'เหตุผลการปิดใช้งาน *':'หมายเหตุ (ไม่บังคับ)';
    if(noteHint)noteHint.textContent=action==='DISABLE'?'ต้องระบุเหตุผลเพื่อเก็บ Audit':'ใช้ระบุรอบ Pilot หรือรายละเอียดเพิ่มเติมได้';
    if(note)note.placeholder=action==='DISABLE'?'เช่น ปรับโครงสร้างทีม / แก้ไขข้อมูล':'เช่น Pilot รอบเดือนกันยายน';
    noteWrap?.classList.toggle('required',action==='DISABLE');
    const bulk=$('teamEnforcementSelectReadyV61529');if(bulk)bulk.textContent=action==='ENABLE'?'เลือกทีมที่พร้อมทั้งหมด':'เลือกทีมที่เปิดอยู่ทั้งหมด';
    const summary=$('teamEnforcementActionSummaryV61529F1');
    const scopeText=mode==='TEAM'?'รายทีม':mode==='ORG'?'ทั้งหน่วยงาน':'ทั้งระบบ';
    if(summary){summary.className='team-enforcement-action-summary-v61529f1 '+(action==='ENABLE'?'enable':'disable');summary.innerHTML=`<strong>${action==='ENABLE'?'เปิดใช้งาน':'ปิดใช้งาน'} · ${scopeText}</strong><span>มีผล ${fmtDate(enforcementModalDate())}${mode==='TEAM'?` · เลือกแล้ว ${state.enforcementSelected.size} ทีม`:''}</span>`;}
    let valid=false,msg='';
    if(!isHr()){msg='ดูสถานะได้เท่านั้น · HR Admin เป็นผู้เปิด/ปิด Enforcement';}
    else if(mode==='TEAM'){valid=state.enforcementSelected.size>0;msg=valid?`${action==='ENABLE'?'พร้อมเปิดใช้งาน':'พร้อมปิดใช้งาน'} ${state.enforcementSelected.size} ทีม`:`กรุณาเลือกทีมที่ต้องการ${action==='ENABLE'?'เปิด':'ปิด'}`;}
    else if(mode==='ORG'){const org=enforcementModalOrg();const blockers=Number(s.car_without_team||0)+Number(s.support_without_team||0)+Number(s.unclassified_total||0);valid=!!org&&(action==='DISABLE'||blockers===0);msg=!org?'กรุณาเลือกหน่วยงาน':valid?`${action==='ENABLE'?'พร้อมเปิด':'พร้อมปิด'} Enforcement ทั้งหน่วยงาน`:`ยังเปิดไม่ได้ · มีข้อมูลไม่พร้อม ${blockers} รายการ`;}
    else{const blockers=Number(s.car_without_team||0)+Number(s.support_without_team||0)+Number(s.unclassified_total||0);valid=action==='DISABLE'||blockers===0;msg=valid?`${action==='ENABLE'?'พร้อมเปิด':'พร้อมปิด'} Enforcement ทั้งระบบ`:`ยังเปิดไม่ได้ · มีข้อมูลไม่พร้อม ${blockers} รายการ`;}
    if(action==='DISABLE'&&!String(note?.value||'').trim()){valid=false;msg='กรุณาระบุเหตุผลการปิดใช้งาน';}
    const foot=$('teamEnforcementFooterStatusV61529');if(foot){foot.textContent=msg;foot.className=valid?'ok':(action==='DISABLE'?'warning':'');}
    const btn=$('teamEnforcementApplyV61529');if(btn){btn.disabled=!valid;let label='ยืนยัน';if(mode==='TEAM')label=`ยืนยัน${action==='ENABLE'?'เปิด':'ปิด'} ${state.enforcementSelected.size||''} ทีม`.replace('  ',' ');else if(mode==='ORG')label=`ยืนยัน${action==='ENABLE'?'เปิด':'ปิด'}ทั้งหน่วยงาน`;else label=`ยืนยัน${action==='ENABLE'?'เปิด':'ปิด'}ทั้งระบบ`;btn.textContent=label;btn.className='btn '+(action==='ENABLE'?'btn-primary':'btn-danger-soft');}
  }
  async function loadEnforcementModal(){
    const date=enforcementModalDate(),org=enforcementModalOrg()||null,queryOrg=state.enforcementScope==='GLOBAL'?null:org;
    try{
      const rows=await rpc('ta_get_team_enforcement_rollout_v61529',{p_org_id:queryOrg,p_work_date:date});
      state.enforcementRows=rows||[];
      // State summary is supplementary. FIX2 backend returns a safe JSON result
      // instead of raising 500 when actor/session cannot be resolved.
      let sum=null;
      try{sum=await rpc('ta_get_team_enforcement_state_v61529',{p_org_id:queryOrg,p_work_date:date});}catch(e){console.info('Enforcement state summary fallback',e?.message||e);}
      state.enforcementModalState=deriveEnforcementState(state.enforcementRows,Object.assign({work_date:date},sum||{}));
      state.enforcementSelected.clear();renderEnforcementModal();
    }catch(e){toast(human(e),'error');}
  }
  async function openEnforcementRollout(){
    const modal=$('teamEnforcementRolloutModalV61529');if(!modal)return;const orgSel=$('teamEnforcementOrgV61529');if(orgSel){const selected=selectedOrgId()||'';orgSel.innerHTML=`<option value="">ทุกหน่วยงานใน Scope</option>${state.orgs.map(o=>`<option value="${esc(o.org_id)}">${esc(o.org_code)} · ${esc(o.org_name)}</option>`).join('')}`;orgSel.value=selected;}
    const date=$('teamEnforcementEffectiveV61529');if(date)date.value=today();const action=$('teamEnforcementActionV61529');if(action)action.value='ENABLE';const filter=$('teamEnforcementTeamStatusV61529');if(filter)filter.value='READY';const note=$('teamEnforcementNoteV61529');if(note)note.value='';state.enforcementSelected.clear();state.enforcementScope='TEAM';modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');setEnforcementScope('TEAM');await loadEnforcementModal();
  }
  function closeEnforcementRollout(){const m=$('teamEnforcementRolloutModalV61529');if(m){m.classList.add('hidden');m.setAttribute('aria-hidden','true');}state.enforcementSelected.clear();}
  function selectReadyEnforcementTeams(){const action=enforcementAction();state.enforcementSelected.clear();for(const r of rolloutRowsVisible()){if((action==='ENABLE'&&r.ready_to_enable&&!r.enforcement_enabled)||(action==='DISABLE'&&r.enforcement_enabled))state.enforcementSelected.add(String(r.team_id));}renderEnforcementModal();}
  async function applyEnforcementScope(){
    if(!isHr())return toast('รายการนี้สำหรับ HR Admin เท่านั้น','warning');const mode=state.enforcementScope,action=enforcementAction(),enabled=action==='ENABLE',date=enforcementModalDate(),note=String($('teamEnforcementNoteV61529')?.value||'').trim();let ids=null;
    if(mode==='TEAM')ids=[...state.enforcementSelected];else if(mode==='ORG'){const id=enforcementModalOrg();ids=id?[id]:[];}
    if(!enabled&&!note)return toast('กรุณาระบุเหตุผลการปิดใช้งาน','warning');
    const label=mode==='TEAM'?`${ids?.length||0} ทีม`:mode==='ORG'?'ทั้งหน่วยงาน':'ทั้งระบบ';const ok=await window.tcConfirm?.({title:`${enabled?'เปิด':'ปิด'} Team Enforcement`,message:`ขอบเขต: ${label}\nมีผลวันที่: ${fmtDate(date)}${note?`\nหมายเหตุ: ${note}`:''}`,confirmText:enabled?'เปิดใช้งาน':'ปิดใช้งาน',tone:enabled?'primary':'danger'});if(!ok)return;
    try{app()?.showLoading?.('กำลังบันทึก Team Enforcement...');await rpc('ta_set_team_enforcement_scope_v61529',{p_scope_type:mode,p_scope_ids:mode==='GLOBAL'?null:ids,p_enabled:enabled,p_effective_from:date,p_note:note||null});toast(`${enabled?'เปิด':'ปิด'} Team Enforcement เรียบร้อย`,'success');await loadEnforcementModal();await load();}catch(e){toast(human(e),'error');}finally{app()?.hideLoading?.();}
  }

  function setTab(tab){
    const t=String(tab||'OVERVIEW').toUpperCase();state.activeTab=t;
    document.querySelectorAll('[data-team-workspace-tab-v61528]').forEach(b=>b.classList.toggle('active',b.dataset.teamWorkspaceTabV61528===t));
    document.querySelectorAll('[data-team-workspace-pane-v61528]').forEach(p=>p.classList.toggle('hidden',p.dataset.teamWorkspacePaneV61528!==t));
    if(t==='HISTORY')loadAudit();if(t==='CHANGES'&&isHr())loadChangeInbox();
  }
  function handleNextAction(){const a=$('teamNextActionV61528')?.dataset.action||'CLASSIFY';if(a==='CLASSIFY')openOperationalProfile('UNCLASSIFIED',{mode:'ASSIGN'});else if(a==='ASSIGN_CAR_TEAM'){setTab('PEOPLE');$('teamMasterCategoryFilterV61524')&&($('teamMasterCategoryFilterV61524').value='CAR');renderTeams();}else if(a==='ASSIGN_MOTORCYCLE_TEAM'){setTab('PEOPLE');$('teamMasterCategoryFilterV61524')&&($('teamMasterCategoryFilterV61524').value='MOTORCYCLE');renderTeams();}else if(a==='ASSIGN_SUPPORT_TEAM'){setTab('PEOPLE');$('teamMasterCategoryFilterV61524')&&($('teamMasterCategoryFilterV61524').value='SUPPORT');renderTeams();}else if(a==='REVIEW_AND_ENABLE'){setTab('PEOPLE');$('teamMasterStatusFilterV61523')&&($('teamMasterStatusFilterV61523').value='ACTIVE');renderTeams();}else setTab('PEOPLE');}

  async function updateCreatePreview(){
    const orgId=$('teamMasterCreateOrgV61523')?.value||'',cat=$('teamMasterCreateCategoryV61524')?.value||'CAR';if(!orgId)return;
    try{const x=await rpc('ta_get_team_category_preview_v61528',{p_org_id:orgId,p_team_category:cat});$('teamMasterPreviewNameV61523')&&($('teamMasterPreviewNameV61523').textContent=x.team_name||'-');$('teamMasterPreviewCodeV61523')&&($('teamMasterPreviewCodeV61523').textContent=x.team_code||'-');$('teamMasterPreviewOrgV61523')&&($('teamMasterPreviewOrgV61523').textContent=`${x.org_code||'-'} · ${x.org_name||'-'} • ${catLabel(cat)} • ${policy(cat).label}`);$('teamMasterCreateConfirmV61523')&&($('teamMasterCreateConfirmV61523').disabled=false);}catch(e){$('teamMasterPreviewOrgV61523')&&($('teamMasterPreviewOrgV61523').textContent=human(e));$('teamMasterCreateConfirmV61523')&&($('teamMasterCreateConfirmV61523').disabled=true);}
  }
  function openCreate(){if(!state.orgs.length)return toast('ไม่พบหน่วยงานใน Scope','warning');const s=$('teamMasterCreateOrgV61523');if(s)s.value=selectedOrgId()||String(state.orgs[0]?.org_id||'');$('teamMasterCreateCategoryV61524')&&($('teamMasterCreateCategoryV61524').value='CAR');$('teamMasterCreateNoteV61523')&&($('teamMasterCreateNoteV61523').value='');$('teamMasterCreateModalV61523')?.classList.remove('hidden');updateCreatePreview();}
  function closeCreate(){$('teamMasterCreateModalV61523')?.classList.add('hidden');}
  async function createTeam(){const orgId=$('teamMasterCreateOrgV61523')?.value||'',cat=$('teamMasterCreateCategoryV61524')?.value||'';if(!orgId||!cat)return;const ok=await window.tcConfirm?.({title:'ยืนยันสร้างทีม',message:[`รูปแบบ: ${catLabel(cat)}`,`ทีม: ${$('teamMasterPreviewNameV61523')?.textContent||'-'}`,`Team Code: ${$('teamMasterPreviewCodeV61523')?.textContent||'-'}`,`Policy: ${policy(cat).label}`].join('\n'),confirmText:'สร้างทีม',tone:'primary'});if(!ok)return;try{app()?.showLoading?.('กำลังสร้างทีม...');await rpc('ta_create_team_v61524',{p_org_id:orgId,p_team_category:cat,p_note:$('teamMasterCreateNoteV61523')?.value?.trim()||null});closeCreate();setTab('PEOPLE');toast('สร้างทีมเรียบร้อย • พร้อมจัดสมาชิก','success');await load();}catch(e){toast(human(e),'error');}finally{app()?.hideLoading?.();}}
  function closureMovePayload(){return [...state.closureMoves.entries()].map(([emp,target])=>({emp_code:emp,target_team_id:target}));}
  function closureMembers(){return Array.isArray(state.closurePreview?.members)?state.closurePreview.members:[];}
  function closureTargets(){return Array.isArray(state.closurePreview?.target_teams)?state.closurePreview.target_teams:[];}
  function closureMemberByCode(code){return closureMembers().find(x=>String(x.emp_code)===String(code));}
  function closureTargetsFor(member){const type=String(member?.operational_type||'').toUpperCase();return closureTargets().filter(t=>String(t.team_category||'').toUpperCase()===type);}
  function closureTargetOptions(member,current){
    const type=String(member?.operational_type||'').toUpperCase();let html='<option value="">— เลือกปลายทาง —</option>';
    for(const t of closureTargetsFor(member)){const id=String(t.team_id),max=t.max_members==null?'':` / ${Number(t.max_members)}`,status=String(t.team_status||'').toUpperCase()==='DRAFT'?' · รอสมาชิก':'';html+=`<option value="${esc(id)}" ${String(current||'')===id?'selected':''}>${esc(t.team_code)} · ${Number(t.member_count||0)}${max} คน${status}</option>`;}
    return html;
  }
  function closureBlockerText(b){const c=String(b?.code||'');if(c==='TEAM_CLOSE_MEMBER_PLAN_INCOMPLETE')return `ยังมีสมาชิก ${Number(b.remaining_count||0)} คนที่ยังไม่ได้กำหนดปลายทาง`;if(c==='TEAM_CLOSE_DUPLICATE_MEMBER_PLAN')return 'พบรายการพนักงานซ้ำในแผนการย้าย';if(c==='TEAM_CLOSE_UNKNOWN_MEMBER_PLAN')return 'พบพนักงานที่ไม่ได้เป็นสมาชิกของทีมนี้ในรายการ';if(c==='TEAM_CLOSE_MEMBER_TARGET_INVALID')return 'ทีมปลายทางของพนักงานบางคนไม่ตรงรูปแบบ/หน่วยงาน หรือยังไม่ได้กำหนด';if(c==='TEAM_CLOSE_TARGET_CAPACITY_INVALID')return 'จำนวนสมาชิกของทีมปลายทางบางทีมไม่ผ่านเกณฑ์หลังการย้าย';return c||'ยังมีเงื่อนไขที่ต้องตรวจสอบ';}
  function renderClosureBulkTargets(){const s=$('teamClosureBulkTargetV61529F12');if(!s)return;const cat=String(state.closurePreview?.team?.team_category||'').toUpperCase();let html='<option value="">เลือกปลายทางสำหรับรายการที่เลือก</option>';for(const t of closureTargets().filter(x=>String(x.team_category||'').toUpperCase()===cat)){const max=t.max_members==null?'':` / ${Number(t.max_members)}`;html+=`<option value="${esc(t.team_id)}">${esc(t.team_code)} · ${Number(t.member_count||0)}${max} คน</option>`;}s.innerHTML=html;const b=$('teamClosureApplyBulkV61529F12');if(b)b.disabled=state.closurePicked.size===0||!s.value;}
  function renderTeamClosure(){
    const p=state.closurePreview||{},team=p.team||state.closureTeam||{},members=closureMembers(),moves=state.closureMoves,assigned=members.filter(m=>moves.has(String(m.emp_code))).length,total=Number(p.member_count??members.length??0),schedule=p.schedule_impact||{},enf=p.enforcement||{};
    const set=(id,v)=>{const n=$(id);if(n)n.textContent=v;};set('teamClosureTeamNameV61529F12',team.team_name||'-');set('teamClosureTeamCodeV61529F12',team.team_code||'-');set('teamClosureIconV61529F12',catIcon(team.team_category));set('teamClosureMemberCountV61529F12',Number(total).toLocaleString('th-TH'));set('teamClosureScheduleCountV61529F12',Number(schedule.schedule_count||0).toLocaleString('th-TH'));set('teamClosureEffectiveV61529F12',fmtDate(p.effective_date||today()));set('teamClosureProgressV61529F12',`${assigned} / ${total} คน`);
    const enOn=enf.enforcement_enabled===true;set('teamClosureEnforcementV61529F12',enOn?'เปิดอยู่':'ยังไม่เปิด');set('teamClosureEnforcementHintV61529F12',enOn?`${enforcementSourceLabel(enf.enforcement_source)}${String(enf.enforcement_source||'').toUpperCase()==='TEAM'?' · ปิดอัตโนมัติ':''}`:'ไม่ต้องดำเนินการเพิ่ม');
    const list=$('teamClosureMemberListV61529F12');if(list){list.innerHTML=members.length?members.map(m=>{const code=String(m.emp_code),picked=state.closurePicked.has(code),has=moves.has(code),cur=has?moves.get(code):undefined,target=has?(cur===null?'ไม่เข้าทีม':closureTargets().find(t=>String(t.team_id)===String(cur))?.team_code||'ทีมปลายทาง'):'ยังไม่กำหนด';return `<article class="team-closure-member-row-v61529f12 ${has?'planned':''}"><label class="team-closure-check-v61529f12"><input type="checkbox" data-team-closure-member-check-v61529f12="${esc(code)}" ${picked?'checked':''}/></label><div class="team-closure-person-v61529f12"><strong>${esc(code)} · ${esc(m.full_name||'-')}</strong><span>${esc(m.position_name||'ช่างเทคนิค')} · ${catIcon(m.operational_type)} ${esc(catLabel(m.operational_type))}</span><small>${m.future_only?'นัดหมายเข้า Team ในอนาคต · ':''}ย้ายมีผล ${fmtDate(m.move_effective_date)}</small></div><div class="team-closure-target-v61529f12"><label>ปลายทาง</label><select class="select" data-team-closure-target-v61529f12="${esc(code)}">${closureTargetOptions(m,cur)}</select><small class="${has?'ok':'warn'}">${has?`→ ${esc(target)}`:'ต้องกำหนดก่อนปิดทีม'}</small></div></article>`;}).join(''):'<div class="team-closure-empty-v61529f12"><span>✓</span><div><strong>ทีมนี้ไม่มีสมาชิกที่ต้องย้าย</strong><small>ระบบจะตรวจตารางกะและรายการไปช่วยทีม / ยืมตัวต่อด้านล่าง</small></div></div>';}
    renderClosureBulkTargets();
    const impacts=Array.isArray(p.target_impacts)?p.target_impacts:[],blockers=Array.isArray(p.blockers)?p.blockers:[],tempImpact=state.closureTempImpact||{},tempRows=Array.isArray(tempImpact.assignments)?tempImpact.assignments:[],tempBlocking=Number(tempImpact.blocking_count||0),impact=$('teamClosureImpactV61529F12');if(impact){const cap=impacts.length?`<div class="team-closure-target-impact-grid-v61529f12">${impacts.map(x=>`<div class="${x.blocked?'blocked':'ok'}"><span>${esc(x.team_code||'-')}</span><strong>${Number(x.min_after_count||0)}${x.max_after_count!==x.min_after_count?`–${Number(x.max_after_count||0)}`:''} คน</strong><small>${x.blocked?'ไม่ผ่าน Capacity':'ผ่าน Policy'}</small></div>`).join('')}</div>`:'';const sc=`<div class="team-closure-schedule-impact-v61529f12"><span>📅</span><div><strong>กะเดิม ${Number(schedule.schedule_count||0).toLocaleString('th-TH')} รายการจะถูกเก็บไว้</strong><small>${Number(schedule.employee_count||0).toLocaleString('th-TH')} คน · ระบบเปลี่ยน Team Context เท่านั้น ไม่ลบ Shift</small></div></div>`;const temp=tempBlocking?`<div class="team-closure-temp-impact-v61529f14b"><span>↔</span><div><strong>ยังมีไปช่วยทีม / ยืมตัว ${tempBlocking.toLocaleString('th-TH')} รายการ</strong><small>ต้องยกเลิก / สิ้นสุดรายการที่เกี่ยวข้องก่อนปิดทีม</small>${tempRows.slice(0,4).map(x=>`<em>${esc(x.emp_code||'-')} · ${esc(x.assignment_type==='BORROW_CROSS_ORG'?'ยืมต่างหน่วยงาน':'ไปช่วยทีม')} · ${esc(fmtDate(x.effective_from))}–${esc(fmtDate(x.effective_to))} · ${esc(x.status||'-')}</em>`).join('')}${tempRows.length>4?`<em>และอีก ${tempRows.length-4} รายการ</em>`:''}</div></div>`:'';const bl=blockers.length?`<div class="team-closure-blockers-v61529f12">${blockers.map(b=>`<p>• ${esc(closureBlockerText(b))}</p>`).join('')}</div>`:tempBlocking?'':`<div class="team-closure-ready-v61529f12">✓ สมาชิก ทีมปลายทาง และรายการยืมตัวผ่านเงื่อนไขทั้งหมด</div>`;impact.innerHTML=cap+sc+temp+bl;}
    const ready=p.allowed===true&&tempBlocking===0,reason=String($('teamClosureReasonV61529F12')?.value||'').trim(),allReady=ready&&!!reason;const badge=$('teamClosureReadinessV61529F12');if(badge){badge.textContent=tempBlocking>0?'ติดรายการยืมตัว':ready?'พร้อมปิดทีม':assigned<total?'รอจัดสมาชิก':'ต้องแก้ไข';badge.className='badge '+(tempBlocking>0?'badge-red':ready?'badge-green':assigned<total?'badge-amber':'badge-red');}const foot=$('teamClosureFooterStatusV61529F12');if(foot){foot.className=allReady?'ok':ready?'warning':'';foot.textContent=tempBlocking>0?`ต้องจัดการไปช่วยทีม / ยืมตัว ${tempBlocking} รายการก่อนปิดทีม`:!ready?(assigned<total?`กรุณากำหนดปลายทางอีก ${Math.max(0,total-assigned)} คน`:'กรุณาแก้ Impact ที่ไม่ผ่าน'):!reason?'กรุณาระบุเหตุผลการปิดทีม':'✓ พร้อมย้ายสมาชิกและปิดทีมเป็นรายการเดียว';}const btn=$('teamClosureConfirmV61529F12');if(btn){btn.disabled=!allReady;btn.textContent=tempBlocking>0?'จัดการรายการยืมตัวก่อน':total?`ยืนยันย้าย ${total} คนและปิดทีม`:'ยืนยันปิดทีม';}
  }
  let closurePreviewTimer=null;
  function scheduleClosurePreview(){clearTimeout(closurePreviewTimer);closurePreviewTimer=setTimeout(()=>refreshClosurePreview(),180);}
  async function refreshClosurePreview(){if(!state.closureTeam?.team_id)return;try{state.closureLoading=true;const [p,temp]=await Promise.all([rpc('ta_preview_team_closure_v61529f12',{p_team_id:state.closureTeam.team_id,p_member_moves:closureMovePayload()}),rpc('ta_get_team_temporary_assignment_impact_v61529f14',{p_team_id:state.closureTeam.team_id})]);state.closurePreview=p||{};state.closureTempImpact=temp||{};const valid=new Set(closureMembers().map(x=>String(x.emp_code)));state.closureMoves=new Map([...state.closureMoves].filter(([c])=>valid.has(String(c))));state.closurePicked=new Set([...state.closurePicked].filter(c=>valid.has(String(c))));renderTeamClosure();}catch(e){toast(human(e),'error');const impact=$('teamClosureImpactV61529F12');if(impact)impact.innerHTML=`<div class="fc-empty">ตรวจข้อมูลปิดทีมไม่สำเร็จ: ${esc(human(e))}</div>`;}finally{state.closureLoading=false;}}
  async function openTeamClosure(id){const t=state.teams.find(x=>String(x.team_id)===String(id));if(!t)return;state.closureReturnFocus=document.activeElement;state.closureTeam=t;state.closurePreview=null;state.closureTempImpact=null;state.closureMoves=new Map();state.closurePicked=new Set();const r=$('teamClosureReasonV61529F12');if(r)r.value='';const m=$('teamClosureModalV61529F12');if(!m)return;m.removeAttribute('inert');m.classList.remove('hidden');m.setAttribute('aria-hidden','false');renderTeamClosure();await refreshClosurePreview();setTimeout(()=>$('teamClosureSelectAllV61529F12')?.focus(),40);}
  function closeTeamClosure(){const m=$('teamClosureModalV61529F12');if(!m)return;const active=document.activeElement;if(active&&m.contains(active))active.blur();m.classList.add('hidden');m.setAttribute('aria-hidden','true');m.setAttribute('inert','');try{state.closureReturnFocus?.focus?.();}catch(_){}state.closureTeam=null;state.closurePreview=null;state.closureTempImpact=null;state.closureMoves=new Map();state.closurePicked=new Set();}
  function selectAllClosureMembers(){const rows=closureMembers();const all=rows.length>0&&rows.every(x=>state.closurePicked.has(String(x.emp_code)));state.closurePicked=all?new Set():new Set(rows.map(x=>String(x.emp_code)));renderTeamClosure();}
  function applyClosureBulkTarget(){const sel=$('teamClosureBulkTargetV61529F12'),v=sel?.value||'';if(!v||state.closurePicked.size===0)return;let applied=0,skipped=0;for(const code of state.closurePicked){const m=closureMemberByCode(code);if(!m)continue;if(v==='__NONE__'){skipped++;continue;}const t=closureTargets().find(x=>String(x.team_id)===v);if(t&&String(t.team_category).toUpperCase()===String(m.operational_type).toUpperCase()){state.closureMoves.set(code,v);applied++;}else skipped++;}state.closurePicked.clear();if(sel)sel.value='';if(skipped)toast(`กำหนดปลายทาง ${applied} คน · ข้าม ${skipped} คนที่รูปแบบไม่ตรง`,'warning');scheduleClosurePreview();renderTeamClosure();}
  async function confirmTeamClosure(){const p=state.closurePreview||{},tempBlocking=Number(state.closureTempImpact?.blocking_count||0),reason=String($('teamClosureReasonV61529F12')?.value||'').trim();if(tempBlocking>0)return toast(`ยังปิดทีมไม่ได้ มีรายการไปช่วยทีม / ยืมตัว ${tempBlocking} รายการที่ต้องจัดการก่อน`,'warning');if(p.allowed!==true)return toast('ยังปิดทีมไม่ได้ กรุณาตรวจ Impact Preview','warning');if(!reason)return toast('กรุณาระบุเหตุผลการปิดทีม','warning');const count=Number(p.member_count||0),sc=Number(p.schedule_impact?.schedule_count||0);const ok=await window.tcConfirm?.({title:`ปิด ${p.team?.team_name||'ทีมนี้'}?`,message:[`สมาชิกที่จัดการ: ${count} คน`,`กะเดิมที่จะคงไว้: ${sc} รายการ`,`มีผล: ${fmtDate(p.effective_date||today())}`,`เหตุผล: ${reason}`,'ระบบจะย้ายสมาชิกและปิดทีมใน Transaction เดียว'].join('\n'),confirmText:'ยืนยันปิดทีม',tone:'danger'});if(!ok)return;try{app()?.showLoading?.('กำลังย้ายสมาชิกและปิดทีม...');const out=await rpc('ta_close_team_v61529f12',{p_team_id:state.closureTeam.team_id,p_member_moves:closureMovePayload(),p_reason:reason});toast(`ปิดทีมเรียบร้อย${Number(out?.members_reassigned||0)?` · จัดสมาชิก ${Number(out.members_reassigned)} คน`:''}`,'success');closeTeamClosure();await load();}catch(e){toast(human(e),'error');await refreshClosurePreview();}finally{app()?.hideLoading?.();}}
  async function deactivateTeam(id){return openTeamClosure(id);}


  function membershipRowSearchMatch(r,q){
    if(!q)return true;
    return [r.emp_code,r.full_name,r.position_name,r.org_code,r.current_team_code,r.current_team_name]
      .some(v=>String(v||'').toLowerCase().includes(q));
  }
  function membershipSourceRows(){
    const q=String($('teamMembershipSearchV61524')?.value||'').toLowerCase().trim();
    const f=String($('teamMembershipSourceFilterV61528F1')?.value||'ALL').toUpperCase();
    return state.members.filter(r=>{
      const code=String(r.emp_code);
      if(state.selected.has(code)||!membershipRowSearchMatch(r,q))return false;
      const cur=String(r.current_team_code||'');
      const wasHere=state.initialMembership.has(code);
      if(f==='NO_TEAM'&&cur)return false;
      if(f==='OTHER_TEAM'&&(!cur||cur===String(state.activeTeam?.team_code||'')))return false;
      if(f==='REMOVED'&&!wasHere)return false;
      return true;
    });
  }
  function membershipTargetRows(){
    const map=new Map(state.members.map(r=>[String(r.emp_code),r]));
    return [...state.selected].map(c=>map.get(String(c))).filter(Boolean).sort((a,b)=>{
      const ai=state.initialMembership.has(String(a.emp_code))?0:1,bi=state.initialMembership.has(String(b.emp_code))?0:1;
      return ai-bi||String(a.emp_code).localeCompare(String(b.emp_code),'th');
    });
  }
  function membershipChangeCounts(){
    let added=0,removed=0;
    state.selected.forEach(c=>{if(!state.initialMembership.has(String(c)))added++;});
    state.initialMembership.forEach(c=>{if(!state.selected.has(String(c)))removed++;});
    return{added,removed,changed:added>0||removed>0};
  }
  function membershipHasChanges(){return membershipChangeCounts().changed;}
  function membershipWorkingRowsV61529F15Q(){return Array.isArray(state.workingMembers)?state.workingMembers:[];}
  function membershipBorrowInRowsV61529F15Q(){return membershipWorkingRowsV61529F15Q().filter(r=>String(r?.member_kind||'').toUpperCase()==='BORROWED_IN');}
  function membershipBorrowedOutMapV61529F15Q(){return new Map(membershipWorkingRowsV61529F15Q().filter(r=>String(r?.member_kind||'').toUpperCase()==='PERMANENT_BORROWED_OUT').map(r=>[String(r.emp_code),r]));}
  function membershipPermanentWorkingCountV61529F15Q(){
    const out=membershipBorrowedOutMapV61529F15Q();let n=0;
    state.selected.forEach(code=>{if(!out.has(String(code)))n++;});
    return n;
  }
  function membershipWorkingCountV61529F15Q(){return membershipPermanentWorkingCountV61529F15Q()+membershipBorrowInRowsV61529F15Q().length;}
  function membershipTemporaryLabelV61529F15Q(r){return String(r?.assignment_type||'').toUpperCase()==='BORROW_CROSS_ORG'?'ยืมตัว':'ชั่วคราว';}
  function memberSubline(r){
    const type=r.operational_type||r.car_category||state.activeTeam?.team_category;
    return `${r.position_name||'-'} · ${catIcon(type)} ${catLabel(type)}`;
  }
  function syncMembershipTransferControls(){
    const src=membershipSourceRows(),target=membershipTargetRows(),chg=membershipChangeCounts(),p=policy(state.activeTeam?.team_category);
    const moveR=$('teamMembershipMoveRightV61528F1'),moveL=$('teamMembershipMoveLeftV61528F1');
    if(moveR)moveR.disabled=state.membershipLeftPicked.size===0;
    if(moveL)moveL.disabled=state.membershipRightPicked.size===0;
    $('teamMembershipSourceCountV61528F1')&&($('teamMembershipSourceCountV61528F1').textContent=`${src.length.toLocaleString('th-TH')} คน`);
    $('teamMembershipTargetCountV61528F1')&&($('teamMembershipTargetCountV61528F1').textContent=`${target.length.toLocaleString('th-TH')} คน`);
    const borrowedIn=membershipBorrowInRowsV61529F15Q().length,workingCount=membershipWorkingCountV61529F15Q();
    $('teamMembershipCurrentV61528F1')&&($('teamMembershipCurrentV61528F1').textContent=`${state.initialMembership.size.toLocaleString('th-TH')} คน`);
    $('teamMembershipBorrowedInV61529F15Q')&&($('teamMembershipBorrowedInV61529F15Q').textContent=`${borrowedIn.toLocaleString('th-TH')} คน`);
    $('teamMembershipWorkingNowV61529F15Q')&&($('teamMembershipWorkingNowV61529F15Q').textContent=`${workingCount.toLocaleString('th-TH')} คน`);
    $('teamMembershipSelectedV61524')&&($('teamMembershipSelectedV61524').textContent=`${state.selected.size.toLocaleString('th-TH')} คน`);
    const delta=$('teamMembershipDeltaV61528F1');if(delta)delta.textContent=chg.changed?`เพิ่ม ${chg.added} · นำออก ${chg.removed}`:'ยังไม่มีการเปลี่ยนแปลง';
    const cap=$('teamMembershipCapacityV61528F1');if(cap){cap.textContent=p.max!=null?`ปฏิบัติงาน ${workingCount} / ${p.max}`:`ปฏิบัติงาน ${workingCount} คน`;cap.classList.toggle('full',p.max!=null&&workingCount>=p.max);cap.classList.toggle('blocked',p.max!=null&&workingCount>p.max);cap.title=p.max!=null&&workingCount>p.max?'จำนวนปฏิบัติงานรวมสมาชิกยืมตัวเกิน Capacity ของทีม กรุณาตรวจรายการยืมตัว':'จำนวนปฏิบัติงาน ณ วันที่อ้างอิง';}
    const strip=$('teamMembershipChangeStripV61528F1');if(strip){const nodes=strip.querySelectorAll('strong');if(nodes[0])nodes[0].textContent=chg.added;if(nodes[1])nodes[1].textContent=chg.removed;if(nodes[2])nodes[2].textContent=!chg.changed?'ยังไม่เปลี่ยน':state.membershipPreview?(state.membershipPreview.allowed?'ผ่าน':'ต้องแก้ไข'):'กำลังตรวจ';strip.classList.toggle('ok',chg.changed&&state.membershipPreview?.allowed===true);strip.classList.toggle('blocked',chg.changed&&state.membershipPreview?.allowed===false);}
    const foot=$('teamMembershipFooterStatusV61528F1');if(foot){if(!chg.changed)foot.textContent='ยังไม่มีการเปลี่ยนแปลง';else if(!state.membershipPreview)foot.textContent='กำลังตรวจผลกระทบ...';else foot.textContent=state.membershipPreview.allowed?'✓ พร้อมบันทึก':'! ยังบันทึกไม่ได้ — ตรวจ Impact Preview';}
  }
  function renderMemberList(){
    const left=$('teamMembershipListV61524'),right=$('teamMembershipTargetListV61528F1');if(!left||!right)return;
    const rows=membershipSourceRows(),target=membershipTargetRows();
    // keep only picks that are still visible / valid
    state.membershipLeftPicked=new Set([...state.membershipLeftPicked].filter(c=>rows.some(r=>String(r.emp_code)===String(c))));
    state.membershipRightPicked=new Set([...state.membershipRightPicked].filter(c=>target.some(r=>String(r.emp_code)===String(c))));
    left.innerHTML=rows.length?rows.map(r=>{
      const code=String(r.emp_code),wasHere=state.initialMembership.has(code),cur=String(r.current_team_code||'');
      const origin=wasHere?'นำออกจากทีมนี้':cur&&cur!==String(state.activeTeam?.team_code||'')?`อยู่ทีม ${cur}`:'ยังไม่มีทีม';
      const originCls=wasHere?'removed':cur?'other':'none';
      return `<label class="team-transfer-row-v61528f1 ${state.membershipLeftPicked.has(code)?'picked':''}"><input type="checkbox" data-team-membership-left-check-v61528f1="${esc(code)}" ${state.membershipLeftPicked.has(code)?'checked':''}/><div class="team-transfer-person-v61528f1"><strong>${esc(code)} · ${esc(r.full_name||'-')}</strong><span>${esc(memberSubline(r))}</span><small class="origin ${originCls}">${esc(origin)}</small></div></label>`;
    }).join(''):'<div class="fc-empty">ไม่พบพนักงานที่สามารถเลือกได้</div>';
    const borrowedOut=membershipBorrowedOutMapV61529F15Q();
    right.innerHTML=target.length?target.map(r=>{
      const code=String(r.emp_code),existing=state.initialMembership.has(code),cur=String(r.current_team_code||''),out=borrowedOut.get(code);
      let badge=existing?'สมาชิกเดิม':(cur&&cur!==String(state.activeTeam?.team_code||'')?`ย้ายจาก ${cur}`:'เพิ่มใหม่');
      let cls=existing?'existing':cur?'moved':'added';
      let extra='';
      if(existing&&out){badge=`สมาชิกประจำ · ยืมออก → ${out.destination_team_code||out.destination_org_code||'-'}`;cls='borrowed-out';extra=`<small class="team-borrow-period-v61529f15q">↗ ${esc(membershipTemporaryLabelV61529F15Q(out))} ${esc(fmtDate(out.effective_from))}–${esc(fmtDate(out.effective_to))} · วันนี้ไม่ปฏิบัติงานกับทีมนี้</small>`;}
      return `<label class="team-transfer-row-v61528f1 target ${state.membershipRightPicked.has(code)?'picked':''} ${out?'temporarily-away-v61529f15q':''}"><input type="checkbox" data-team-membership-right-check-v61528f1="${esc(code)}" ${state.membershipRightPicked.has(code)?'checked':''}/><div class="team-transfer-person-v61528f1"><strong>${esc(code)} · ${esc(r.full_name||'-')}</strong><span>${esc(memberSubline(r))}</span><small class="target-badge ${cls}">${esc(badge)}</small>${extra}</div></label>`;
    }).join(''):'<div class="fc-empty">ยังไม่มีสมาชิกประจำในทีมหลังบันทึก</div>';
    const borrowBox=$('teamMembershipBorrowListV61529F15Q'),borrowRows=membershipBorrowInRowsV61529F15Q();
    if(borrowBox){borrowBox.innerHTML=borrowRows.length?borrowRows.map(r=>`<article class="team-borrow-overlay-row-v61529f15q"><div class="team-borrow-overlay-icon-v61529f15q">↔</div><div><strong>${esc(r.emp_code||'-')} · ${esc(r.full_name||'-')}</strong><span>${esc(r.position_name||'-')} · ${catIcon(r.operational_type||state.activeTeam?.team_category)} ${esc(catLabel(r.operational_type||state.activeTeam?.team_category))}</span><small><b>${esc(membershipTemporaryLabelV61529F15Q(r))}</b> จาก ${esc(r.source_team_code||r.source_org_code||'-')} · ${esc(fmtDate(r.effective_from))}–${esc(fmtDate(r.effective_to))}</small></div><em>อ่านอย่างเดียว</em></article>`).join(''):'<div class="team-borrow-overlay-empty-v61529f15q">ไม่มีสมาชิกยืมตัวในวันที่อ้างอิง</div>';}
    const borrowHead=$('teamMembershipBorrowCountV61529F15Q');if(borrowHead)borrowHead.textContent=`${borrowRows.length.toLocaleString('th-TH')} คน`;
    syncMembershipTransferControls();
  }
  function moveMembershipRight(){
    if(!state.membershipLeftPicked.size)return;
    const p=policy(state.activeTeam?.team_category),next=state.selected.size+state.membershipLeftPicked.size;
    if(p.max!=null&&next>p.max){const slots=Math.max(0,p.max-state.selected.size);toast(`ทีม${catLabel(state.activeTeam?.team_category)}เพิ่มได้อีกสูงสุด ${slots} คน (สูงสุด ${p.max} คน/ทีม)`,'warning');return;}
    state.membershipLeftPicked.forEach(c=>state.selected.add(String(c)));state.membershipLeftPicked.clear();state.membershipRightPicked.clear();state.membershipPreview=null;renderMemberList();scheduleMembershipPreview();
  }
  function moveMembershipLeft(){
    if(!state.membershipRightPicked.size)return;
    state.membershipRightPicked.forEach(c=>state.selected.delete(String(c)));state.membershipRightPicked.clear();state.membershipLeftPicked.clear();state.membershipPreview=null;renderMemberList();scheduleMembershipPreview();
  }
  function selectAllMembershipLeft(){
    const rows=membershipSourceRows();if(!rows.length)return;
    const all=rows.every(r=>state.membershipLeftPicked.has(String(r.emp_code)));
    state.membershipLeftPicked=all?new Set():new Set(rows.map(r=>String(r.emp_code)));renderMemberList();
  }
  function renderMembershipPreview(){
    const box=$('teamMembershipImpactV61528'),p=state.membershipPreview;if(!box)return;
    const chg=membershipChangeCounts();
    if(!chg.changed){box.innerHTML='<div class="team-impact-placeholder-v61528">เลือกพนักงานด้านซ้ายแล้วกด “ย้ายเข้า →” หรือเลือกสมาชิกด้านขวาแล้วกด “← นำออก”</div>';const btn=$('teamMembershipSaveV61524');if(btn)btn.disabled=true;syncMembershipTransferControls();return;}
    if(!p){box.innerHTML='<div class="team-impact-placeholder-v61528">กำลังตรวจผลกระทบ...</div>';syncMembershipTransferControls();return;}
    const target=p.target||{},blockers=Array.isArray(p.blockers)?p.blockers:[],sources=Array.isArray(p.source_impacts)?p.source_impacts:[];
    const belowMin=blockers.find(b=>['SOURCE_TEAM_BELOW_MIN','TARGET_TEAM_BELOW_MIN'].includes(String(b?.code||'')));
    const aboveMax=blockers.find(b=>String(b?.code||'')==='TARGET_TEAM_ABOVE_MAX');
    let recovery='';
    if(belowMin){
      const min=Number(belowMin.min_members||policy(state.activeTeam?.team_category).min||0),after=Number(belowMin.after_count??belowMin.remaining??0),need=Math.max(1,min-after);
      recovery=`<div class="team-impact-recovery-v61529f2"><strong>ทำอย่างไรต่อ?</strong><span>เพิ่มสมาชิกให้ทีมอย่างน้อยอีก ${need} คน หรือถ้าต้องการปรับโครงสร้างทั้งทีม ให้ย้ายสมาชิกทั้งหมด/ปิดทีมเดิมเป็นรายการเดียว</span></div>`;
    }else if(aboveMax){
      const max=Number(aboveMax.max_members||policy(state.activeTeam?.team_category).max||5),after=Number(aboveMax.after_count||0),over=Math.max(1,after-max);
      recovery=`<div class="team-impact-recovery-v61529f2"><strong>ทีมเกินความจุ</strong><span>นำออกอย่างน้อย ${over} คน หรือเลือก Team ปลายทางอื่นก่อนบันทึก</span></div>`;
    }
    const workingCount=membershipWorkingCountV61529F15Q(),maxWorking=policy(state.activeTeam?.team_category).max,workingWarn=maxWorking!=null&&workingCount>maxWorking?`<div class="team-working-capacity-warning-v61529f15q"><span>⚠</span><div><strong>จำนวนผู้ปฏิบัติงานรวม ${workingCount} คน เกิน Capacity ${maxWorking} คน</strong><small>ตัวเลขนี้รวมสมาชิกยืมตัว ณ วันที่อ้างอิง · FIX15Q แสดงคำเตือนเพื่อให้ Manager ตรวจ Borrow Workflow โดยไม่แก้ Permanent Membership อัตโนมัติ</small></div></div>`:'';
    box.innerHTML=`<div class="team-impact-title-v61528"><strong>Impact Preview ก่อนบันทึก</strong><span class="${p.allowed?'ok':'blocked'}">${p.allowed?'✓ ผ่านทุกเงื่อนไข':'! ต้องแก้ไข'}</span></div><div class="team-impact-target-v61528"><span>${esc(p.team_code||state.activeTeam?.team_code||'-')}</span><strong>${Number(target.before_count??state.initialMembership.size)} → ${Number(target.after_count??state.selected.size)} คน</strong><small>สมาชิกประจำ · ขั้นต่ำ ${Number(target.min_members??policy(state.activeTeam?.team_category).min)}${target.max_members!=null?` · สูงสุด ${Number(target.max_members)}`:policy(state.activeTeam?.team_category).max!=null?` · สูงสุด ${policy(state.activeTeam?.team_category).max}`:' · ไม่จำกัดสูงสุด'} · ปฏิบัติงานรวมยืมตัว ${workingCount} คน</small></div>${workingWarn}${sources.length?`<div class="team-impact-sources-v61528">${sources.map(s=>`<div class="${s.blocked?'blocked':'ok'}"><span>${esc(s.team_code||'-')}</span><strong>${Number(s.before_count||0)} → ${Number(s.after_count||0)} คน</strong><small>${s.blocked?`ต่ำกว่าขั้นต่ำ ${Number(s.min_members||0)}`:Number(s.after_count||0)===0?'ทีมจะกลับเป็นรอสมาชิก':'ผ่าน'}</small></div>`).join('')}</div>`:''}${blockers.length?`<div class="team-impact-blockers-v61528">${blockers.map(b=>`<p>• ${esc(previewBlockerText(b))}</p>`).join('')}</div>`:''}${recovery}`;
    const btn=$('teamMembershipSaveV61524');if(btn)btn.disabled=p.allowed!==true||!chg.changed;syncMembershipTransferControls();
  }
  function previewBlockerText(b){const c=String(b?.code||'');if(c==='EMPLOYEE_START_DATE_REQUIRED')return `ไม่พบวันเริ่มงานของพนักงาน ${Number(b.count||0)>0?`${Number(b.count)} คน`:''} กรุณาตรวจ Employee Master`;if(c==='OPERATIONAL_ASSIGN_EFFECTIVE_MUST_CURRENT_MONTH_START')return `ฐานวันที่กำหนดครั้งแรกต้องเป็น ${fmtDate(b.required_date||operationalCurrentMonthStart())} • ระบบจะเลื่อนไปวันเริ่มงานรายคนเมื่อจำเป็น`;if(c==='OPERATIONAL_CHANGE_EFFECTIVE_BEFORE_CURRENT_MONTH')return `ไม่สามารถเปลี่ยนรูปแบบย้อนหลังไปก่อน ${fmtDate(b.minimum_effective_date||operationalCurrentMonthStart())}`;if(c==='OPERATIONAL_CHANGE_EFFECTIVE_BEFORE_START_DATE')return `วันที่มีผลต้องไม่ก่อนวันเริ่มงานพนักงาน • เร็วสุด ${fmtDate(b.minimum_effective_date||b.employee_start_date||operationalCurrentMonthStart())}`;if(c==='OPERATIONAL_CHANGE_EFFECTIVE_TOO_EARLY')return `วันที่มีผลต้องไม่ก่อนวันเริ่มงาน/วันที่กำหนดรูปแบบครั้งแรก • เร็วสุด ${fmtDate(b.minimum_effective_date||operationalCurrentMonthStart())}`;if(c==='OPERATIONAL_PROFILE_MIXED_ASSIGN_CHANGE_NOT_ALLOWED')return 'กรุณาแยก “กำหนดรูปแบบครั้งแรก” และ “เปลี่ยนรูปแบบ” เป็นคนละรายการ';if(c==='TARGET_TEAM_ABOVE_MAX')return `${b.team_code||'ทีม'} จะมี ${b.after_count} คน เกินสูงสุด ${b.max_members}`;if(c==='TARGET_TEAM_BELOW_MIN')return `${b.team_code||'ทีม'} จะมี ${b.after_count} คน ต่ำกว่าขั้นต่ำ ${b.min_members}`;if(c==='SOURCE_TEAM_BELOW_MIN')return b.team_code?`ทีมต้นทาง ${b.team_code} จะเหลือ ${b.after_count??b.remaining??'-'} คน ต่ำกว่าขั้นต่ำ ${b.min_members??'-'}`:'ทีมต้นทางบางทีมจะเหลือสมาชิกต่ำกว่าขั้นต่ำ';if(c==='TEAM_MEMBER_OPERATIONAL_TYPE_MISMATCH')return 'มีพนักงานที่รูปแบบการปฏิบัติงานไม่ตรงกับประเภททีม';if(c==='TEAM_MEMBER_ORG_MISMATCH')return 'มีพนักงานอยู่นอกหน่วยงานของทีม';return c||'ยังไม่ผ่านเงื่อนไข';}
  async function previewMembership(){
    if(!state.activeTeam)return;
    if(!membershipHasChanges()){state.membershipPreview=null;renderMembershipPreview();return;}
    const d=$('teamMembershipEffectiveV61524')?.value||today();state.membershipPreview=null;renderMembershipPreview();
    try{state.membershipPreview=await rpc('ta_preview_team_membership_change_v61528',{p_team_id:state.activeTeam.team_id,p_emp_codes:[...state.selected],p_effective_from:d});renderMembershipPreview();}catch(e){state.membershipPreview={allowed:false,blockers:[{code:human(e)}]};renderMembershipPreview();}
  }
  function scheduleMembershipPreview(){clearTimeout(membershipPreviewTimer);membershipPreviewTimer=setTimeout(previewMembership,180);}
  async function openMembership(teamId){
    const t=state.teams.find(x=>String(x.team_id)===String(teamId));if(!t)return;
    state.activeTeam=t;state.selected.clear();state.initialMembership.clear();state.membershipLeftPicked.clear();state.membershipRightPicked.clear();state.membershipPreview=null;
    $('teamMembershipTitleV61524')&&($('teamMembershipTitleV61524').textContent=`${t.team_name} · ${t.team_code}`);
    $('teamMembershipCategoryV61524')&&($('teamMembershipCategoryV61524').textContent=`${catIcon(t.team_category)} ${catLabel(t.team_category)}`);
    $('teamMembershipEffectiveV61524')&&($('teamMembershipEffectiveV61524').value=today());
    $('teamMembershipSearchV61524')&&($('teamMembershipSearchV61524').value='');$('teamMembershipSourceFilterV61528F1')&&($('teamMembershipSourceFilterV61528F1').value='ALL');
    const p=policy(t.team_category);$('teamMembershipPolicyV61524')&&($('teamMembershipPolicyV61524').innerHTML=`<div><strong>${catIcon(t.team_category)} ${catLabel(t.team_category)}</strong><span>${esc(p.label)}${t.team_category==='MOTORCYCLE'?' · ต้องมีทีมก่อนจัดกะ':''}</span></div><small>สมาชิกยืมตัวจะแสดงตามวันที่อ้างอิงแบบอ่านอย่างเดียว · การแก้ช่วงยืมทำที่เมนูยืมตัวช่าง</small>`);
    $('teamMembershipModalV61524')?.classList.remove('hidden');await loadMembershipCandidates();
  }
  function closeMembership(){
    $('teamMembershipModalV61524')?.classList.add('hidden');state.activeTeam=null;state.members=[];state.workingMembers=[];state.selected.clear();state.initialMembership.clear();state.membershipLeftPicked.clear();state.membershipRightPicked.clear();state.membershipPreview=null;
  }
  async function loadMembershipCandidates(){
    if(!state.activeTeam)return;
    try{
      app()?.showLoading?.('กำลังโหลดสมาชิก...');const d=$('teamMembershipEffectiveV61524')?.value||today();
      state.members=await rpc('ta_get_team_membership_candidates_v61524',{p_team_id:state.activeTeam.team_id,p_effective_date:d})||[];
      try{state.workingMembers=await rpc('ta_get_team_working_members_v61529f15q',{p_team_id:state.activeTeam.team_id,p_work_date:d})||[];}catch(overlayError){state.workingMembers=[];console.warn('[FIX15Q] Working member overlay unavailable:',overlayError);toast('โหลดสมาชิกประจำได้แล้ว แต่ข้อมูลยืมตัวของทีมยังโหลดไม่สำเร็จ','warning');}
      state.initialMembership=new Set(state.members.filter(r=>r.is_current_member).map(r=>String(r.emp_code)));state.selected=new Set(state.initialMembership);state.membershipLeftPicked.clear();state.membershipRightPicked.clear();state.membershipPreview=null;renderMemberList();$('teamMembershipMetaV61524')&&($('teamMembershipMetaV61524').textContent=`${catLabel(state.activeTeam.team_category)} • สมาชิกประจำ + สมาชิกยืมตัว ณ ${fmtDate(d)} • เลือกซ้าย → ย้ายเข้าขวา`);renderMembershipPreview();
    }catch(e){toast(human(e),'error');}finally{app()?.hideLoading?.();}
  }
  async function saveMembership(){
    if(!state.activeTeam||!membershipHasChanges())return toast('ยังไม่มีการเปลี่ยนแปลงสมาชิกทีม','warning');
    if(state.membershipPreview?.allowed!==true)return toast('กรุณาตรวจ Impact Preview ก่อนบันทึก','warning');
    const d=$('teamMembershipEffectiveV61524')?.value;if(!d)return;const chg=membershipChangeCounts();
    const ok=await window.tcConfirm?.({title:'ยืนยันการเปลี่ยนสมาชิกทีม',message:[`ทีม: ${state.activeTeam.team_name}`,`Team Code: ${state.activeTeam.team_code}`,`สมาชิก: ${state.initialMembership.size} → ${state.selected.size} คน`,`เพิ่มเข้า: ${chg.added} คน · นำออก: ${chg.removed} คน`,`วันที่มีผล: ${fmtDate(d)}`].join('\n'),confirmText:'บันทึกสมาชิกทีม',tone:'primary'});if(!ok)return;
    try{app()?.showLoading?.('กำลังบันทึกสมาชิกทีม...');await rpc('ta_set_team_members_v61524',{p_team_id:state.activeTeam.team_id,p_emp_codes:[...state.selected],p_effective_from:d,p_note:$('teamMembershipNoteV61524')?.value?.trim()||null});toast('บันทึกสมาชิกทีมเรียบร้อย','success');closeMembership();await load();}catch(e){toast(human(e),'error');}finally{app()?.hideLoading?.();}
  }

  function opStateLabel(v){const t=String(v||'').toUpperCase();return t==='CAR_NEEDS_TEAM'?'รถยนต์ • ยังไม่มีทีม':t==='MOTORCYCLE_NO_TEAM'?'มอเตอร์ไซค์ • ยังไม่มีทีม':t==='SUPPORT_NEEDS_TEAM'?'สนับสนุน • ยังไม่มีทีม':t==='READY'?'พร้อมใช้งาน':'รอ Manager กำหนดรูปแบบ';}
  const OPERATIONAL_TYPES=['CAR','MOTORCYCLE','SUPPORT'];
  function operationalMode(){return state.opMode==='CHANGE'?'CHANGE':'ASSIGN';}
  function operationalCurrentMonthStart(){const t=today();return `${t.slice(0,7)}-01`;}
  function syncOperationalEffectiveDatePolicy({reset=false}={}){
    const input=$('teamOperationalProfileEffectiveV61527'),label=$('teamOperationalEffectiveLabelV61529F6'),help=$('teamOperationalEffectiveHelpV61529F6');if(!input)return;
    const monthStart=operationalCurrentMonthStart(),mode=operationalMode();
    if(mode==='ASSIGN'){
      input.disabled=true;input.min=monthStart;input.max=monthStart;input.value=monthStart;input.classList.add('operational-effective-locked-v61529f6');
      if(label)label.textContent='วันที่มีผล (ระบบกำหนด)';
      if(help){help.className='operational-effective-help-v61529f6 locked start-date-aware-v61529f9';help.innerHTML=`<strong>ฐาน ${esc(fmtDate(monthStart))}</strong> • หากวันเริ่มงานอยู่หลังต้นเดือน ระบบจะใช้ <strong>วันเริ่มงานของแต่ละคน</strong> อัตโนมัติ`; }
      return;
    }
    input.disabled=false;input.classList.remove('operational-effective-locked-v61529f6');input.min=monthStart;input.removeAttribute('max');
    if(reset||!input.value||input.value<monthStart)input.value=today();
    if(label)label.textContent='วันที่มีผล';
    if(help){help.className='operational-effective-help-v61529f6';help.innerHTML=`เริ่มได้ <strong>${esc(fmtDate(monthStart))}</strong> • และต้องไม่ก่อนวันเริ่มงาน / วันที่กำหนดรูปแบบครั้งแรก`; }
  }
  function validateOperationalEffectiveDate({autoCorrect=true,showToast=true}={}){
    const input=$('teamOperationalProfileEffectiveV61527');if(!input)return true;const monthStart=operationalCurrentMonthStart();
    if(operationalMode()==='ASSIGN'){
      if(input.value!==monthStart&&autoCorrect)input.value=monthStart;
      input.min=monthStart;input.max=monthStart;return input.value===monthStart;
    }
    input.min=monthStart;input.removeAttribute('max');
    if(!input.value||input.value<monthStart){if(autoCorrect)input.value=today();if(showToast)toast(`ไม่สามารถเปลี่ยนรูปแบบย้อนหลังไปก่อนเดือนปัจจุบันได้ • วันที่เร็วสุด ${fmtDate(monthStart)}`,'warning');return false;}
    return true;
  }
  function operationalSourceType(){return operationalMode()==='ASSIGN'?'UNCLASSIFIED':String($('teamOperationalProfileShowV61527')?.value||'CAR').toUpperCase();}
  function operationalModeCopy(){
    const mode=operationalMode(),source=operationalSourceType();
    if(mode==='ASSIGN')return {title:'กำหนดรูปแบบการปฏิบัติงาน',guideTitle:'กำหนดครั้งแรก',guideText:'แสดงเฉพาะพนักงานที่ “รอกำหนดรูปแบบ” เลือกหลายคนพร้อมกันได้ และไม่ต้องระบุเหตุผล',metaAction:'กำหนดรูปแบบ'};
    return {title:'เปลี่ยนรูปแบบการปฏิบัติงาน',guideTitle:`เปลี่ยนจาก ${catLabel(source)}`,guideText:`เลือกปลายทางได้เฉพาะรูปแบบอื่น ระบบจะไม่แสดง ${catLabel(source)} ซ้ำ และ HR Admin จะได้รับแจ้งเมื่อบันทึก`,metaAction:'เปลี่ยนรูปแบบ'};
  }
  function renderOperationalTargetTypeOptions(){
    const sel=$('teamOperationalProfileTargetV61527');if(!sel)return;
    const mode=operationalMode(),source=operationalSourceType(),prev=String(sel.value||'').toUpperCase();
    const allowed=OPERATIONAL_TYPES.filter(t=>mode==='ASSIGN'||t!==source);
    sel.innerHTML=allowed.map(t=>`<option value="${t}">${catIcon(t)} ${esc(catLabel(t))}</option>`).join('');
    sel.value=allowed.includes(prev)?prev:(allowed[0]||'CAR');
  }
  function updateOperationalModeUI(){
    const mode=operationalMode(),source=operationalSourceType(),copy=operationalModeCopy();
    document.querySelectorAll('[data-operational-mode-v61529f5]').forEach(btn=>{const active=btn.dataset.operationalModeV61529f5===mode;btn.classList.toggle('active',active);btn.setAttribute('aria-selected',active?'true':'false');});
    $('teamOperationalSourceFixedV61529F5')?.classList.toggle('hidden',mode!=='ASSIGN');
    $('teamOperationalSourceSelectV61529F5')?.classList.toggle('hidden',mode!=='CHANGE');
    const title=$('teamOperationalProfileTitleV61529F5');if(title)title.textContent=copy.title;
    const targetLabel=$('teamOperationalTargetLabelV61529F5');if(targetLabel)targetLabel.textContent=mode==='ASSIGN'?'กำหนดเป็น':'เปลี่ยนเป็น';
    const guide=$('teamOperationalModeGuideV61529F5');if(guide){guide.classList.toggle('change',mode==='CHANGE');guide.innerHTML=`<div><strong>${esc(copy.guideTitle)}</strong><span>${esc(copy.guideText)}</span></div><span class="operational-mode-guide-chip-v61529f5">${mode==='ASSIGN'?'ขั้นตอนแนะนำ':'แจ้ง HR Admin'}</span>`;}
    $('teamOperationalSameTypeGuideV61529F5')?.classList.toggle('hidden',mode!=='CHANGE');
    const reasonBox=$('teamOperationalReasonBoxV61528F2');if(reasonBox&&mode==='ASSIGN')reasonBox.classList.add('hidden');else if(reasonBox)reasonBox.classList.remove('hidden');
    const alert=$('teamOperationalReasonAlertV61528F3');if(alert&&mode==='ASSIGN')alert.classList.add('hidden');
    renderOperationalTargetTypeOptions();
    syncOperationalEffectiveDatePolicy();
  }
  async function setOperationalMode(mode,source=null,{reload=true}={}){
    state.opMode=mode==='CHANGE'?'CHANGE':'ASSIGN';
    const show=$('teamOperationalProfileShowV61527');
    if(show){show.value=state.opMode==='ASSIGN'?'UNCLASSIFIED':(OPERATIONAL_TYPES.includes(String(source||'').toUpperCase())?String(source).toUpperCase():(OPERATIONAL_TYPES.includes(String(show.value||'').toUpperCase())?String(show.value).toUpperCase():'CAR'));}
    state.opSelected.clear();state.opLeftPicked.clear();state.opRightPicked.clear();state.opPreview=null;
    updateOperationalModeUI();syncOperationalEffectiveDatePolicy({reset:true});renderOpTeamOptions();
    if(reload)await loadOpPool();
  }
  function closeOperationalProfile(){$('teamOperationalProfileModalV61527')?.classList.add('hidden');state.opPool=[];state.opTeams=[];state.opSelected.clear();state.opLeftPicked.clear();state.opRightPicked.clear();state.opPreview=null;state.opPendingSearch='';const save=$('teamOperationalProfileSaveV61527');if(save){save.disabled=true;save.textContent='บันทึกการเปลี่ยนแปลง';}}
  function operationalTargetTeam(){const id=$('teamOperationalProfileTeamV61527')?.value||'';return state.opTeams.find(t=>String(t.team_id)===String(id))||null;}
  function operationalRowSearchMatch(r,q){if(!q)return true;return[r.emp_code,r.full_name,r.position_name,r.org_code,r.team_code,r.team_name].some(v=>String(v||'').toLowerCase().includes(q));}
  function operationalSourceRows(){const q=String($('teamOperationalProfileSearchV61527')?.value||'').toLowerCase().trim();return(state.opPool||[]).filter(r=>!state.opSelected.has(String(r.emp_code))&&operationalRowSearchMatch(r,q));}
  function operationalTargetRows(){return(state.opPool||[]).filter(r=>state.opSelected.has(String(r.emp_code)));}
  function operationalTargetLabel(){const type=String($('teamOperationalProfileTargetV61527')?.value||'CAR').toUpperCase(),team=operationalTargetTeam();return `${catIcon(type)} ${catLabel(type)}${team?` · ${team.team_code}`:''}`;}
  function operationalProjectedCount(){const type=String($('teamOperationalProfileTargetV61527')?.value||'CAR').toUpperCase(),team=operationalTargetTeam();if(!team)return null;if(state.opPreview?.target_team&&String(state.opPreview.target_team.team_id||team.team_id)===String(team.team_id))return Number(state.opPreview.target_team.after_count||0);const base=Number(team.active_member_count||0);const additions=operationalTargetRows().filter(r=>String(r.team_code||'')!==String(team.team_code||'')).length;return base+additions;}
  function operationalReasonValue(){return String($('teamOperationalProfileNoteV61527')?.value||'').trim();}
  function operationalReasonMissing(){return state.opPreview?.reason_required===true&&!operationalReasonValue();}
  function operationalReady(){return state.opPreview?.allowed===true&&!operationalReasonMissing();}
  function operationalEffectiveDateMap(){const m=new Map();for(const r of (state.opPreview?.employee_effective_dates||[])){if(r?.emp_code)m.set(String(r.emp_code),r);}return m;}
  function operationalEffectiveSummary(){const p=state.opPreview||{},a=String(p.effective_date_min||'').slice(0,10),b=String(p.effective_date_max||'').slice(0,10);if(!a&&!b)return operationalMode()==='ASSIGN'?`ระบบกำหนดจากต้นเดือน / วันเริ่มงาน`:`${fmtDate($('teamOperationalProfileEffectiveV61527')?.value||today())}`;if(a&&b&&a!==b)return `${fmtDate(a)} – ${fmtDate(b)} • รายบุคคล`;return fmtDate(a||b);}
  function syncOperationalTransferControls(){
    const src=operationalSourceRows(),target=operationalTargetRows(),type=String($('teamOperationalProfileTargetV61527')?.value||'CAR').toUpperCase(),p=policy(type),team=operationalTargetTeam();if(!target.length)syncOperationalEffectiveDatePolicy({reset:false});
    state.opLeftPicked=new Set([...state.opLeftPicked].filter(c=>src.some(r=>String(r.emp_code)===String(c))));state.opRightPicked=new Set([...state.opRightPicked].filter(c=>target.some(r=>String(r.emp_code)===String(c))));
    $('teamOperationalProfileSourceCountV61528F2')&&($('teamOperationalProfileSourceCountV61528F2').textContent=`${src.length.toLocaleString('th-TH')} คน`);$('teamOperationalProfileTargetCountV61528F2')&&($('teamOperationalProfileTargetCountV61528F2').textContent=`${target.length.toLocaleString('th-TH')} คน`);$('teamOperationalProfileSelectedV61527')&&($('teamOperationalProfileSelectedV61527').textContent=target.length?`การเปลี่ยนแปลง ${target.length.toLocaleString('th-TH')} คน`:'ยังไม่มีรายการ');$('teamOperationalTargetTypeV61528F2')&&($('teamOperationalTargetTypeV61528F2').textContent=operationalTargetLabel());
    const moveR=$('teamOperationalProfileMoveRightV61528F2'),moveL=$('teamOperationalProfileMoveLeftV61528F2');if(moveR)moveR.disabled=state.opLeftPicked.size===0||(p.required&&!team);if(moveL)moveL.disabled=state.opRightPicked.size===0;
    const cap=$('teamOperationalProfileCapacityV61528F2');if(cap){cap.classList.remove('full','blocked');if(!team){cap.textContent='เลือก Team';}else{const n=operationalProjectedCount();cap.textContent=p.max!=null?`${n??Number(team.active_member_count||0)} / ${p.max} คน`:`${n??Number(team.active_member_count||0)} คน`;if(p.max!=null&&Number(n)>p.max)cap.classList.add('blocked');else if(p.max!=null&&Number(n)>=p.max)cap.classList.add('full');}}
    const ready=operationalReady(),reasonMissing=operationalReasonMissing();
    const strip=$('teamOperationalTransferStatusV61528F2');if(strip){const nodes=strip.querySelectorAll('strong');if(nodes[0])nodes[0].textContent=target.length;if(nodes[1])nodes[1].textContent=team?team.team_code:'ยังไม่เลือก Team';if(nodes[2])nodes[2].textContent=!target.length?'รอรายการ':!state.opPreview?'กำลังตรวจ':reasonMissing?'รอเหตุผล':ready?'ผ่าน':'ต้องแก้ไข';strip.classList.toggle('ok',target.length>0&&ready);strip.classList.toggle('blocked',target.length>0&&state.opPreview&&(state.opPreview.allowed===false||reasonMissing));}
    const foot=$('teamOperationalFooterStatusV61528F2');if(foot){foot.classList.remove('warning','ok','blocked');if(!target.length)foot.textContent='ยังไม่มีรายการรอบันทึก';else if(!state.opPreview)foot.textContent='กำลังตรวจผลกระทบ...';else if(state.opPreview.allowed!==true){foot.textContent='! ยังบันทึกไม่ได้ — ตรวจ Impact Preview';foot.classList.add('blocked');}else if(reasonMissing){foot.textContent='⚠ กรุณาระบุเหตุผลการเปลี่ยน • HR Admin จะได้รับแจ้ง';foot.classList.add('warning');}else{foot.textContent=`✓ พร้อมบันทึก ${target.length} คน`;foot.classList.add('ok');}}
  }
  function renderOpTeamOptions(){
    renderOperationalTargetTypeOptions();const sel=$('teamOperationalProfileTeamV61527');if(!sel)return;const prev=sel.value,type=String($('teamOperationalProfileTargetV61527')?.value||'CAR').toUpperCase(),p=policy(type);
    const teams=state.opTeams.filter(t=>String(t.team_category||'').toUpperCase()===type&&teamLifecycle(t)!=='INACTIVE');
    const first=`<option value="">เลือกทีม${catLabel(type)} (บังคับ)</option>`;
    sel.innerHTML=first+teams.map(t=>{const n=Number(t.active_member_count||0),pp=policy(type),full=pp.max!=null&&n>=pp.max;return `<option value="${esc(t.team_id)}" ${full?'disabled':''}>${esc(t.team_code)} · ${esc(t.team_name)} • ${n}${pp.max!=null?`/${pp.max}`:''} คน${full?' · เต็ม':''}</option>`;}).join('');
    if(prev&&[...sel.options].some(o=>o.value===prev&&!o.disabled))sel.value=prev;
    $('teamOperationalProfileTeamHintV61527')&&($('teamOperationalProfileTeamHintV61527').textContent=type==='CAR'?'รถยนต์ต้องเลือกทีม · 3–5 คน/ทีม':type==='SUPPORT'?'ทีมสนับสนุนต้องเลือกทีม · ขั้นต่ำ 1 คน':'มอเตอร์ไซค์ต้องเลือกทีมก่อนจัดกะ · ขั้นต่ำ 1 คน');
    $('teamOperationalTargetTitleV61528F2')&&($('teamOperationalTargetTitleV61528F2').textContent=`รายการที่จะเปลี่ยนเป็น ${catLabel(type)}`);state.opPreview=null;renderOpPool();scheduleOperationalPreview();
  }
  function renderOpPool(){
    const left=$('teamOperationalProfileListV61527'),right=$('teamOperationalProfileTargetListV61528F2');if(!left||!right)return;const rows=operationalSourceRows(),target=operationalTargetRows(),type=String($('teamOperationalProfileTargetV61527')?.value||'CAR').toUpperCase(),destTeam=operationalTargetTeam();
    state.opLeftPicked=new Set([...state.opLeftPicked].filter(c=>rows.some(r=>String(r.emp_code)===String(c))));state.opRightPicked=new Set([...state.opRightPicked].filter(c=>target.some(r=>String(r.emp_code)===String(c))));
    left.innerHTML=rows.length?rows.map(r=>{const code=String(r.emp_code),curType=String(r.operational_type||'UNCLASSIFIED').toUpperCase();return `<label class="team-transfer-row-v61528f1 ${state.opLeftPicked.has(code)?'picked':''}"><input type="checkbox" data-operational-profile-left-check-v61528f2="${esc(code)}" ${state.opLeftPicked.has(code)?'checked':''}/><div class="team-transfer-person-v61528f1"><strong>${esc(code)} · ${esc(r.full_name||'-')}</strong><span>${esc(r.position_name||'-')}</span><small class="origin ${curType==='UNCLASSIFIED'?'none':r.team_code?'other':'none'}">${catIcon(curType)} ${esc(catLabel(curType))}${r.team_code?` · ${esc(r.team_code)}`:''}</small></div></label>`;}).join(''):'<div class="fc-empty">ไม่พบพนักงานตามเงื่อนไข</div>';
    right.innerHTML=target.length?target.map(r=>{const code=String(r.emp_code),curType=String(r.operational_type||'UNCLASSIFIED').toUpperCase(),fromTeam=r.team_code?` · ${r.team_code}`:'',toTeam=destTeam?` · ${destTeam.team_code}`:'';const eff=operationalEffectiveDateMap().get(code),effText=eff?.effective_date?` · มีผล ${fmtDate(eff.effective_date)}`:'';return `<label class="team-transfer-row-v61528f1 target ${state.opRightPicked.has(code)?'picked':''}"><input type="checkbox" data-operational-profile-right-check-v61528f2="${esc(code)}" ${state.opRightPicked.has(code)?'checked':''}/><div class="team-transfer-person-v61528f1"><strong>${esc(code)} · ${esc(r.full_name||'-')}</strong><span>${catIcon(curType)} ${esc(catLabel(curType))}${esc(fromTeam)} → ${catIcon(type)} ${esc(catLabel(type))}${esc(toTeam)}</span><small class="target-badge ${curType==='UNCLASSIFIED'?'added':'moved'}">${curType==='UNCLASSIFIED'?'กำหนดครั้งแรก':'เปลี่ยน / ย้าย'}${esc(effText)}</small></div></label>`;}).join(''):'<div class="fc-empty">ยังไม่มีรายการรอบันทึก</div>';
    syncOperationalTransferControls();
  }
  function selectAllOperationalLeft(){const rows=operationalSourceRows();if(!rows.length)return;const all=rows.every(r=>state.opLeftPicked.has(String(r.emp_code)));state.opLeftPicked=all?new Set():new Set(rows.map(r=>String(r.emp_code)));renderOpPool();}
  function moveOperationalRight(){
    if(!state.opLeftPicked.size)return;const type=String($('teamOperationalProfileTargetV61527')?.value||'CAR').toUpperCase(),p=policy(type),team=operationalTargetTeam();if(p.required&&!team)return toast(`กรุณาเลือก Team ${catLabel(type)} ปลายทางก่อน`,'warning');
    const addRows=(state.opPool||[]).filter(r=>state.opLeftPicked.has(String(r.emp_code)));if(team&&p.max!=null){const existingTarget=operationalTargetRows(),combined=[...existingTarget,...addRows.filter(r=>!state.opSelected.has(String(r.emp_code)))],base=Number(team.active_member_count||0),additions=combined.filter(r=>String(r.team_code||'')!==String(team.team_code||'')).length,after=base+additions;if(after>p.max){const currentAdds=existingTarget.filter(r=>String(r.team_code||'')!==String(team.team_code||'')).length,slots=Math.max(0,p.max-base-currentAdds);toast(`ทีม ${team.team_code} เพิ่มได้อีกสูงสุด ${slots} คน (รถยนต์สูงสุด ${p.max} คน/ทีม)`,'warning');return;}}
    state.opLeftPicked.forEach(c=>state.opSelected.add(String(c)));state.opLeftPicked.clear();state.opRightPicked.clear();state.opPreview=null;renderOpPool();scheduleOperationalPreview();
  }
  function moveOperationalLeft(){if(!state.opRightPicked.size)return;state.opRightPicked.forEach(c=>state.opSelected.delete(String(c)));state.opRightPicked.clear();state.opLeftPicked.clear();state.opPreview=null;renderOpPool();scheduleOperationalPreview();}
  async function loadOpPool(){
    if(state.opLoading)return;const orgId=$('teamOperationalProfileOrgV61527')?.value||'';if(!orgId)return;
    state.opLoading=true;const left=$('teamOperationalProfileListV61527'),right=$('teamOperationalProfileTargetListV61528F2');if(left)left.innerHTML='<div class="fc-empty">กำลังโหลดพนักงาน...</div>';if(right)right.innerHTML='<div class="fc-empty">กำลังเตรียมปลายทาง...</div>';
    try{
      const workDate=$('teamOperationalProfileEffectiveV61527')?.value||today(),show=operationalSourceType();
      const [pool,teams]=await Promise.all([rpc('ta_get_operational_profile_pool_v61527',{p_org_id:orgId,p_operational_type:show,p_search:null,p_work_date:workDate}),rpc('ta_get_team_master_v61526',{p_org_id:orgId,p_include_inactive:false,p_search:null,p_work_date:workDate})]);
      state.opPool=pool||[];state.opTeams=teams||[];state.opSelected.clear();state.opLeftPicked.clear();state.opRightPicked.clear();state.opPreview=null;
      updateOperationalModeUI();renderOpTeamOptions();
      if(state.opPendingSearch){const q=state.opPendingSearch;$('teamOperationalProfileSearchV61527')&&($('teamOperationalProfileSearchV61527').value=q);state.opPendingSearch='';}
      renderOpPool();
      const o=orgById(orgId),copy=operationalModeCopy();
      $('teamOperationalProfileMetaV61527')&&($('teamOperationalProfileMetaV61527').textContent=`${o?`${o.org_code} · ${o.org_name}`:'หน่วยงาน'} • ${copy.metaAction} • พบ ${state.opPool.length.toLocaleString('th-TH')} คน`);
    }catch(e){if(left)left.innerHTML=`<div class="fc-empty">โหลดไม่สำเร็จ: ${esc(human(e))}</div>`;if(right)right.innerHTML='<div class="fc-empty">ยังไม่มีรายการรอบันทึก</div>';toast(human(e),'error');}finally{state.opLoading=false;}
  }
  async function openOperationalProfile(show='UNCLASSIFIED',opts={}){
    if(!state.orgs.length)return toast('ไม่พบหน่วยงานใน Scope','warning');
    const requested=String(show||'UNCLASSIFIED').toUpperCase(),forcedMode=String(opts?.mode||'').toUpperCase();
    state.opMode=forcedMode==='CHANGE'||(forcedMode!=='ASSIGN'&&OPERATIONAL_TYPES.includes(requested))?'CHANGE':'ASSIGN';
    const source=state.opMode==='ASSIGN'?'UNCLASSIFIED':(OPERATIONAL_TYPES.includes(requested)?requested:(OPERATIONAL_TYPES.includes(String(opts?.source||'').toUpperCase())?String(opts.source).toUpperCase():'CAR'));
    const org=$('teamOperationalProfileOrgV61527');if(org)org.value=opts?.orgId||selectedOrgId()||String(state.orgs[0]?.org_id||'');
    const effectiveInput=$('teamOperationalProfileEffectiveV61527');if(effectiveInput)effectiveInput.value=state.opMode==='ASSIGN'?operationalCurrentMonthStart():(opts?.effectiveDate||today());
    $('teamOperationalProfileShowV61527')&&($('teamOperationalProfileShowV61527').value=source);
    $('teamOperationalProfileSearchV61527')&&($('teamOperationalProfileSearchV61527').value='');$('teamOperationalProfileNoteV61527')&&($('teamOperationalProfileNoteV61527').value='');
    state.opPendingSearch=String(opts?.search||'');state.opSelected.clear();state.opLeftPicked.clear();state.opRightPicked.clear();state.opPreview=null;
    updateOperationalModeUI();syncOperationalEffectiveDatePolicy({reset:false});$('teamOperationalProfileModalV61527')?.classList.remove('hidden');await loadOpPool();
  }

  async function previewOperational(){
    const box=$('teamOperationalImpactV61528'),orgId=$('teamOperationalProfileOrgV61527')?.value||'',type=$('teamOperationalProfileTargetV61527')?.value||'',d=$('teamOperationalProfileEffectiveV61527')?.value||'',teamId=$('teamOperationalProfileTeamV61527')?.value||null;
    if(!box)return;if(!orgId||!type||!d||state.opSelected.size===0){state.opPreview=null;box.innerHTML='<div class="team-impact-placeholder-v61528">เลือกพนักงานทางซ้ายแล้วกด “ย้ายเข้า →” เพื่อดู Preview</div>';const save=$('teamOperationalProfileSaveV61527');if(save){save.disabled=true;save.textContent='บันทึกการเปลี่ยนแปลง';}const alert=$('teamOperationalReasonAlertV61528F3');if(alert)alert.classList.add('hidden');syncOperationalTransferControls();return;}
    if(!validateOperationalEffectiveDate({autoCorrect:false,showToast:false})){state.opPreview={allowed:false,blockers:[{code:operationalMode()==='ASSIGN'?'OPERATIONAL_ASSIGN_EFFECTIVE_MUST_CURRENT_MONTH_START':'OPERATIONAL_CHANGE_EFFECTIVE_BEFORE_CURRENT_MONTH'}],minimum_effective_date:operationalCurrentMonthStart()};renderOperationalPreview();return;}
    if(policy(type).required&&!teamId){state.opPreview=null;box.innerHTML=`<div class="team-impact-blockers-v61528"><p>• ${esc(catLabel(type))} ต้องเลือก Team ปลายทางก่อนบันทึก</p></div>`;$('teamOperationalProfileSaveV61527')&&($('teamOperationalProfileSaveV61527').disabled=true);syncOperationalTransferControls();return;}
    try{state.opPreview=await rpc('ta_preview_operational_profile_change_v61528',{p_emp_codes:[...state.opSelected],p_org_id:orgId,p_operational_type:type,p_effective_from:d,p_team_id:teamId});const minDate=String(state.opPreview?.minimum_effective_date||'').slice(0,10),inp=$('teamOperationalProfileEffectiveV61527');if(inp&&operationalMode()==='CHANGE'&&minDate&&minDate>String(inp.min||''))inp.min=minDate;renderOperationalPreview();renderOpPool();}catch(e){state.opPreview={allowed:false,blockers:[{code:human(e)}]};renderOperationalPreview();}
  }
  function scheduleOperationalPreview(){clearTimeout(operationalPreviewTimer);operationalPreviewTimer=setTimeout(previewOperational,180);}
  function renderOperationalPreview(){
    const p=state.opPreview,box=$('teamOperationalImpactV61528');if(!box||!p){syncOperationalTransferControls();return;}const blockers=Array.isArray(p.blockers)?p.blockers:[],src=Array.isArray(p.source_impacts)?p.source_impacts:[],target=p.target_team;const notify=Number(p.hr_notification_count||0),note=operationalReasonValue(),reasonMissing=p.reason_required===true&&!note,ready=p.allowed===true&&!reasonMissing;const backendMin=String(p.minimum_effective_date||'').slice(0,10),effectiveInput=$('teamOperationalProfileEffectiveV61527'),effectiveHelp=$('teamOperationalEffectiveHelpV61529F6');if(operationalMode()==='CHANGE'&&backendMin){if(effectiveInput&&backendMin>String(effectiveInput.min||''))effectiveInput.min=backendMin;if(effectiveHelp&&backendMin>operationalCurrentMonthStart()){effectiveHelp.className='operational-effective-help-v61529f6 important';effectiveHelp.innerHTML=`รายการนี้เร็วสุด <strong>${esc(fmtDate(backendMin))}</strong> • ตามวันเริ่มงาน / วันที่กำหนดรูปแบบครั้งแรก`;}}
    const readinessLabel=p.allowed!==true?'! ต้องแก้ไข':reasonMissing?'⚠ รอระบุเหตุผล':'✓ ผ่านทุกเงื่อนไข',readinessClass=p.allowed!==true?'blocked':reasonMissing?'warning':'ok';
    const adjusted=Number(p.start_date_adjusted_count||0),effRows=Array.isArray(p.employee_effective_dates)?p.employee_effective_dates:[],effMin=String(p.effective_date_min||'').slice(0,10),effMax=String(p.effective_date_max||'').slice(0,10),effSummary=operationalEffectiveSummary();
    const effDetail=operationalMode()==='ASSIGN'?`<div class="operational-effective-summary-v61529f9"><div><span>วันที่เริ่มใช้ / เริ่มจัดกะ</span><strong>${esc(effSummary)}</strong><small>คำนวณจาก MAX(ต้นเดือนปัจจุบัน, วันเริ่มงาน) รายพนักงาน</small></div><span class="${adjusted>0?'adjusted':'base'}">${adjusted>0?`ปรับตามวันเริ่มงาน ${adjusted} คน`:'ทุกคนใช้ต้นเดือน'}</span></div>${effRows.length&&effRows.length<=6?`<div class="operational-effective-people-v61529f9">${effRows.map(r=>`<span><b>${esc(r.emp_code||'-')}</b> ${esc(fmtDate(r.effective_date))}${r.adjusted_by_start_date?' · ตามวันเริ่มงาน':''}</span>`).join('')}</div>`:''}`:`<div class="operational-effective-summary-v61529f9"><div><span>วันที่มีผล / Schedule Boundary</span><strong>${esc(effSummary)}</strong><small>กะก่อนวันมีผลใช้รูปแบบ/ทีมเดิม · ตั้งแต่วันมีผลใช้รูปแบบ/ทีมใหม่</small></div></div>`;
    box.innerHTML=`<div class="team-impact-title-v61528"><strong>Impact Preview ก่อนบันทึก</strong><span class="${readinessClass}">${readinessLabel}</span></div><div class="team-impact-summary-grid-v61528"><div><span>พนักงาน</span><strong>${Number(p.employee_count||state.opSelected.size)} คน</strong></div><div><span>ปลายทาง</span><strong>${catIcon(p.operational_type)} ${esc(catLabel(p.operational_type))}</strong></div><div><span>แจ้ง HR Admin</span><strong>${notify>0?`${notify} รายการ`:'ไม่ใช่การเปลี่ยนประเภท'}</strong></div></div>${effDetail}${target?`<div class="team-impact-target-v61528"><span>${esc(target.team_code||'-')}</span><strong>${Number(target.before_count??0)} → ${Number(target.after_count||0)} คน</strong><small>${esc(policy(p.operational_type).label)}</small></div>`:''}${src.length?`<div class="team-impact-sources-v61528">${src.map(s=>`<div class="${s.blocked?'blocked':'ok'}"><span>${esc(s.team_code||'-')}</span><strong>${Number(s.before_count||0)} → ${Number(s.after_count||0)} คน</strong><small>${s.blocked?'ต่ำกว่าขั้นต่ำ':Number(s.after_count||0)===0?'ทีมจะกลับเป็นรอสมาชิก':'ผ่าน'}</small></div>`).join('')}</div>`:''}${blockers.length?`<div class="team-impact-blockers-v61528">${blockers.map(b=>`<p>• ${esc(previewBlockerText(b))}</p>`).join('')}</div>`:''}<div class="operational-readiness-check-v61528f3"><span class="${p.allowed?'ok':'blocked'}">${p.allowed?'✓ Team / Capacity ผ่านเงื่อนไข':'✕ Team / Capacity ไม่ผ่านเงื่อนไข'}</span><span class="${blockers.some(b=>String(b.code)==='EMPLOYEE_START_DATE_REQUIRED')?'blocked':'ok'}">${blockers.some(b=>String(b.code)==='EMPLOYEE_START_DATE_REQUIRED')?'✕ วันเริ่มงานไม่ครบ':'✓ วันเริ่มงานสัมพันธ์กับ Effective Date'}</span><span class="${p.reason_required?(reasonMissing?'warning':'ok'):'muted'}">${p.reason_required?(reasonMissing?'⚠ กรุณาระบุเหตุผลการเปลี่ยน':'✓ ระบุเหตุผลแล้ว'):'• กำหนดครั้งแรกไม่บังคับเหตุผล'}</span><span class="${notify>0?'notify':'muted'}">${notify>0?'🔔 HR Admin จะได้รับแจ้งทันที':'• ไม่มีรายการแจ้ง HR Admin'}</span></div>${notify>0?'<div class="team-hr-notify-note-v61528">การเปลี่ยนประเภทเดิมจะสร้างประวัติ Effective Change และส่งรายการ “รอรับทราบ” ให้ HR Admin</div>':''}`;
    const reason=$('teamOperationalReasonRequiredV61528'),hint=$('teamOperationalReasonHintV61528F2'),boxReason=$('teamOperationalReasonBoxV61528F2'),alert=$('teamOperationalReasonAlertV61528F3'),textarea=$('teamOperationalProfileNoteV61527');if(reason)reason.textContent=p.reason_required?'* จำเป็น':'(ไม่บังคับ)';if(hint)hint.textContent=p.reason_required?'จำเป็นต้องระบุเหตุผล • HR Admin จะได้รับแจ้งทันทีหลังบันทึก':'กำหนดครั้งแรกไม่บังคับเหตุผล';if(boxReason){boxReason.classList.toggle('hidden',operationalMode()==='ASSIGN');boxReason.classList.toggle('required',p.reason_required===true);boxReason.classList.toggle('missing',reasonMissing);boxReason.classList.toggle('optional',p.reason_required!==true);}if(alert){alert.classList.toggle('hidden',operationalMode()==='ASSIGN'||p.reason_required!==true);alert.classList.toggle('complete',p.reason_required===true&&!reasonMissing);alert.innerHTML=reasonMissing?'🔔 <strong>ต้องระบุเหตุผลการเปลี่ยน</strong><span>HR Admin จะได้รับแจ้งทันทีหลังบันทึก</span>':'✓ <strong>ระบุเหตุผลแล้ว</strong><span>พร้อมสร้างรายการแจ้ง HR Admin</span>';}if(textarea){textarea.required=p.reason_required===true;textarea.placeholder=p.reason_required?'ระบุเหตุผล เช่น ปรับลักษณะงาน / พื้นที่รับผิดชอบ':'หมายเหตุเพิ่มเติม (ไม่บังคับ)';}const save=$('teamOperationalProfileSaveV61527');if(save){save.disabled=!ready;save.textContent=p.reason_required?`ยืนยันการเปลี่ยน ${state.opSelected.size} คน`:`บันทึก ${state.opSelected.size} คน`;}syncOperationalTransferControls();
  }
  async function saveOperational(){const orgId=$('teamOperationalProfileOrgV61527')?.value||'',type=$('teamOperationalProfileTargetV61527')?.value||'',d=$('teamOperationalProfileEffectiveV61527')?.value||'',teamId=$('teamOperationalProfileTeamV61527')?.value||null,note=$('teamOperationalProfileNoteV61527')?.value?.trim()||null;if(!validateOperationalEffectiveDate({autoCorrect:true,showToast:true}))return;if(state.opPreview?.allowed!==true)return toast('กรุณาตรวจ Impact Preview ก่อนบันทึก','warning');if(state.opPreview?.reason_required===true&&!note)return toast('กรุณาระบุเหตุผลการเปลี่ยนรูปแบบ','warning');const effLine=operationalMode()==='ASSIGN'?`วันที่มีผล: ${operationalEffectiveSummary()} (ตามวันเริ่มงานรายบุคคล)`:`วันที่มีผล: ${fmtDate(d)}`;const ok=await window.tcConfirm?.({title:operationalMode()==='ASSIGN'?'ยืนยันกำหนดรูปแบบการปฏิบัติงาน':'ยืนยันเปลี่ยนรูปแบบการปฏิบัติงาน',message:[`พนักงาน: ${state.opSelected.size} คน`,`ปลายทาง: ${operationalTargetLabel()}`,effLine,'Profile + Team Membership ใช้วันเดียวกันต่อพนักงาน',`แจ้ง HR Admin: ${Number(state.opPreview?.hr_notification_count||0)} รายการ`].join('\n'),confirmText:`บันทึก ${state.opSelected.size} คน`,tone:'primary'});if(!ok)return;try{app()?.showLoading?.('กำลังบันทึกการเปลี่ยนแปลง...');const result=await rpc('ta_assign_operational_profile_v61527',{p_emp_codes:[...state.opSelected],p_org_id:orgId,p_operational_type:type,p_effective_from:d,p_team_id:teamId,p_note:note});const range=result?.effective_date_min&&result?.effective_date_max&&result.effective_date_min!==result.effective_date_max?` • มีผล ${fmtDate(result.effective_date_min)}–${fmtDate(result.effective_date_max)}`:result?.effective_date_min?` • มีผล ${fmtDate(result.effective_date_min)}`:'';toast((Number(result?.change_event_count||0)>0?'บันทึกแล้ว • แจ้ง HR Admin เรียบร้อย':'บันทึกรูปแบบและทีมเรียบร้อย')+range,'success');closeOperationalProfile();await load();}catch(e){toast(human(e),'error');}finally{app()?.hideLoading?.();}}

  function changeTypeText(t){return `${catIcon(t)} ${catLabel(t)}`;}
  async function loadChangeInbox(){if(!allowedRole())return;const host=$('teamChangeInboxV61528');if(host)host.innerHTML='<div class="fc-empty">กำลังโหลด...</div>';try{const sel=$('teamChangeStatusV61528');let status=sel?.value||'ALL';state.changeRows=await rpc('ta_get_operational_change_inbox_v61528',{p_status:status,p_limit:150})||[];renderChangeInbox();}catch(e){if(isAuthFailure(e)||String(e?.message||e).includes('AUTH_SESSION_')){stopChangeRealtime();if(host)host.innerHTML='<div class="fc-empty">Session หมดอายุ • กรุณาเข้าสู่ระบบใหม่</div>';return;}if(host)host.innerHTML=`<div class="fc-empty">โหลดไม่สำเร็จ: ${esc(human(e))}</div>`;}}
  function renderChangeInbox(){
    const rows=state.changeRows||[],host=$('teamChangeInboxV61528');if(!host)return;
    const badge=$('teamChangesUnreadBadgeV61528');const badgeCount=rows.filter(r=>r.hr_status==='UNREAD').length;
    if(badge){badge.textContent=badgeCount;badge.classList.toggle('hidden',badgeCount===0||!isHr());}
    const panel=host.closest('.team-change-inbox-v61528');const title=panel?.querySelector('.panel-header h3'),desc=panel?.querySelector('.panel-header p'),statusSel=$('teamChangeStatusV61528');
    if(title)title.textContent=isHr()?'รายการแจ้งการเปลี่ยนรูปแบบการปฏิบัติงาน':'ประวัติการเปลี่ยนรูปแบบของฉัน';
    if(desc)desc.textContent=isHr()?'Manager บันทึกแล้วมีผลจริงตาม Effective Date · HR Admin มีหน้าที่รับทราบและติดตามประวัติ ไม่ใช่ผู้อนุมัติ':'แสดงรายการ Effective Change ที่คุณบันทึกไว้ และสถานะการรับทราบของ HR Admin';
    if(statusSel){statusSel.innerHTML=isHr()?'<option value="UNREAD">ยังไม่รับทราบ</option><option value="ALL">ทั้งหมด</option><option value="ACKNOWLEDGED">รับทราบแล้ว</option>':'<option value="ALL">ทั้งหมดของฉัน</option><option value="UNREAD">HR ยังไม่รับทราบ</option><option value="ACKNOWLEDGED">HR รับทราบแล้ว</option>';}
    host.innerHTML=rows.length?rows.map(r=>{const acked=r.hr_status==='ACKNOWLEDGED';const statusText=isHr()?(acked?'✓ รับทราบแล้ว':'● ใหม่ · รอรับทราบ'):(acked?'✓ HR รับทราบแล้ว':'● HR ยังไม่รับทราบ');return `<article class="team-change-card-v61528 ${!acked?'unread':''}"><div class="team-change-card-head-v61528"><div><span>${statusText}</span><strong>${esc(r.emp_code)} · ${esc(r.full_name||'-')}</strong><small>${esc(r.org_code||'-')} · ${esc(r.org_name||'-')}</small></div><time>${esc(fmtDateTime(r.changed_at))}</time></div><div class="team-change-flow-v61528"><div><small>เดิม</small><strong>${esc(changeTypeText(r.old_operational_type))}</strong><span>${esc(r.old_team_code||'ไม่ผูกทีม')}</span></div><b>→</b><div><small>ใหม่</small><strong>${esc(changeTypeText(r.new_operational_type))}</strong><span>${esc(r.new_team_code||'ไม่ผูกทีม')}</span></div></div><div class="team-change-meta-v61528"><span>มีผล ${esc(fmtDate(r.effective_date))}</span><span>โดย ${esc(r.changed_by_email||'-')}</span><span class="team-change-effective-badge-v61529f11">บันทึกแล้ว · ไม่รออนุมัติ</span></div><p class="team-change-reason-v61528"><strong>เหตุผล:</strong> ${esc(r.reason||'-')}</p><div class="team-change-card-actions-v61528">${isHr()&&!acked?`<button class="btn btn-primary btn-sm" data-team-change-ack-v61528="${esc(r.event_id)}">✓ รับทราบ</button>`:''}</div></article>`;}).join(''):'<div class="fc-empty">ไม่มีรายการตามสถานะที่เลือก</div>';
  }
  async function acknowledgeChange(id){try{await rpc('ta_acknowledge_operational_change_v61528',{p_event_id:id,p_action:'ACKNOWLEDGE',p_note:null});toast('รับทราบการเปลี่ยนแปลงแล้ว','success');await loadChangeInbox();}catch(e){toast(human(e),'error');}}
  async function enableBrowserNotification(){if(!('Notification'in window))return toast('Browser นี้ไม่รองรับ Notification','warning');const p=await Notification.requestPermission();toast(p==='granted'?'เปิด Browser Notification แล้ว':'ยังไม่ได้อนุญาต Notification',p==='granted'?'success':'warning');}
  function queueChangeNotification(payload){
    if(!('Notification'in window)||Notification.permission!=='granted')return;const n=payload?.new||{};
    if(isHr()&&payload?.eventType==='INSERT'){const key=String(n.batch_id||n.event_id||Date.now());const item=changeNotifyBatches.get(key)||{count:0,first:n,timer:null};item.count+=1;clearTimeout(item.timer);item.timer=setTimeout(()=>{try{new Notification('TimeAttendance · มีการเปลี่ยนรูปแบบการปฏิบัติงาน',{body:item.count>1?`Manager เปลี่ยนข้อมูล ${item.count} คน · เปิด Team Workspace เพื่อรับทราบ`:`${item.first.emp_code||'พนักงาน'}: ${catLabel(item.first.old_operational_type)} → ${catLabel(item.first.new_operational_type)}`});}catch{}changeNotifyBatches.delete(key);},650);changeNotifyBatches.set(key,item);return;}
  }
  async function setupChangeRealtime(){
    if(!allowedRole()||state.changeChannel||!app()?.state?.client?.channel)return;
    const c=app().state.client;
    try{
      await ensureFreshSession(false);
      state.changeChannel=c.channel('team-operational-change-v61528')
        .on('postgres_changes',{event:'*',schema:'public',table:'ta_operational_change_events_v61528'},payload=>{queueChangeNotification(payload);loadChangeInbox();})
        .subscribe(status=>{
          if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){
            try{c.removeChannel?.(state.changeChannel);}catch(_){}
            state.changeChannel=null;
          }
        });
    }catch(e){
      if(!isAuthFailure(e)&&!String(e?.message||e).includes('AUTH_SESSION_'))console.warn('Team change realtime fallback to polling',e);
    }
    clearInterval(state.changeTimer);
    state.changeTimer=setInterval(async()=>{
      if(!allowedRole())return;
      try{await ensureFreshSession(false);await loadChangeInbox();}
      catch(e){if(isAuthFailure(e)||String(e?.message||e).includes('AUTH_SESSION_'))stopChangeRealtime();}
    },60000);
  }


  function renderAudit(){const b=$('teamMasterAuditBodyV61523');if(b)b.innerHTML=state.audit.length?state.audit.map(a=>`<tr><td class="nowrap">${esc(fmtDateTime(a.created_at))}</td><td><code>${esc(a.team_code||'-')}</code></td><td>${esc(a.action_type||'-')}</td><td>${esc(a.actor_email||'-')}</td><td>${esc(a.reason||'-')}</td></tr>`).join(''):'<tr><td colspan="5" class="fc-empty">ยังไม่มีประวัติ</td></tr>';const e=$('teamEnforcementAuditBodyV61529');if(e)e.innerHTML=state.enforcementAudit.length?state.enforcementAudit.map(a=>`<tr><td class="nowrap">${esc(fmtDateTime(a.created_at))}</td><td><span class="badge badge-gray">${esc(a.scope_type||'-')}</span></td><td><strong>${esc(a.scope_code||'-')}</strong><small class="team-master-sub-v61523">${esc(a.scope_name||'')}</small></td><td>${esc(fmtDate(a.effective_from))}</td><td>${a.enabled?'<span class="badge badge-green">เปิด</span>':'<span class="badge badge-red">ปิด</span>'}</td><td>${esc(a.actor_email||'-')}</td><td>${esc(a.note||'-')}</td></tr>`).join(''):'<tr><td colspan="7" class="fc-empty">ยังไม่มีประวัติ Enforcement</td></tr>';}
  async function loadAudit(){try{const [teamAudit,enfAudit]=await Promise.all([rpc('ta_get_team_audit_v61524',{p_team_id:null,p_limit:150}),rpc('ta_get_team_enforcement_audit_v61529',{p_limit:150})]);state.audit=teamAudit||[];state.enforcementAudit=enfAudit||[];renderAudit();}catch(e){console.warn(e);}}

  async function load(){
    if(!allowedRole()||state.loading)return;
    if(!baseTeamRole()&&actingTeamAccess()){
      syncNav();setTab('ASSIGNMENTS');window.TimeClockTemporaryAssignmentV61529F14B?.load?.();return;
    }
    state.loading=true;syncNav();
    const body=$('teamMasterBodyV61523');if(body)body.innerHTML='<tr><td colspan="7" class="fc-empty">กำลังโหลดทีม...</td></tr>';
    try{
      const orgId=selectedOrgId()||null,search=null;
      const [orgs,teams,summary]=await Promise.all([
        rpc('ta_get_team_org_options_v61524',{p_include_inactive:false}),
        rpc('ta_get_team_master_v61526',{p_org_id:orgId,p_include_inactive:true,p_search:search,p_work_date:today()}),
        rpc('ta_get_team_workspace_summary_v61528',{p_org_id:orgId,p_work_date:today()})
      ]);
      state.orgs=orgs||[];state.teams=teams||[];state.summary=summary||{};renderOrgOptions();renderTeams();renderSummary();
      await loadEnforcement();
      if(allowedRole()){setupChangeRealtime();loadChangeInbox();}
      loadRuntimeDiagnostic({silent:true});
    }catch(e){state.lastError=e;toast(human(e),'error');if(body)body.innerHTML=`<tr><td colspan="7" class="fc-empty">โหลด Team Workspace ไม่สำเร็จ: ${esc(human(e))}</td></tr>`;}finally{state.loading=false;}
  }

  function bind(){
    syncNav();setTab('OVERVIEW');
    $('teamMasterRefreshV61523')?.addEventListener('click',load);$('teamMasterOrgFilterV61523')?.addEventListener('change',load);$('teamMasterCreateV61523')?.addEventListener('click',openCreate);$('teamMasterCreatePeopleV61528')?.addEventListener('click',openCreate);$('teamMasterSearchBtnV61523')?.addEventListener('click',renderTeams);$('teamMasterCategoryFilterV61524')?.addEventListener('change',renderTeams);$('teamMasterStatusFilterV61523')?.addEventListener('change',renderTeams);$('teamMasterSearchV61523')?.addEventListener('input',renderTeams);$('teamMasterCreateOrgV61523')?.addEventListener('change',updateCreatePreview);$('teamMasterCreateCategoryV61524')?.addEventListener('change',updateCreatePreview);$('teamMasterCreateConfirmV61523')?.addEventListener('click',createTeam);
    $('teamEnforcementRefreshV61525')?.addEventListener('click',()=>loadEnforcement());$('teamEnforcementToggleV61525')?.addEventListener('click',toggleEnforcement);$('teamNextActionBtnV61528')?.addEventListener('click',handleNextAction);$('teamQuickClassifyV61529F1')?.addEventListener('click',()=>openOperationalProfile('UNCLASSIFIED',{mode:'ASSIGN'}));$('teamQuickCreateV61529F1')?.addEventListener('click',openCreate);$('teamQuickPeopleV61529F1')?.addEventListener('click',()=>setTab('PEOPLE'));$('teamQuickEnforcementV61529F1')?.addEventListener('click',()=>{setTab('OVERVIEW');$('teamEnforcementStatusV61525')?.scrollIntoView({behavior:'smooth',block:'center'});});
    $('teamEnforcementEffectiveV61529')?.addEventListener('change',loadEnforcementModal);$('teamEnforcementOrgV61529')?.addEventListener('change',loadEnforcementModal);$('teamEnforcementActionV61529')?.addEventListener('change',()=>{state.enforcementSelected.clear();const f=$('teamEnforcementTeamStatusV61529');if(f)f.value=enforcementAction()==='ENABLE'?'READY':'ENABLED';renderEnforcementModal();});$('teamEnforcementTeamStatusV61529')?.addEventListener('change',renderEnforcementModal);$('teamEnforcementSelectReadyV61529')?.addEventListener('click',selectReadyEnforcementTeams);$('teamEnforcementNoteV61529')?.addEventListener('input',renderEnforcementModal);$('teamEnforcementApplyV61529')?.addEventListener('click',applyEnforcementScope);
    $('teamOperationalProfileOpenV61527')?.addEventListener('click',()=>openOperationalProfile('UNCLASSIFIED',{mode:'ASSIGN'}));$('teamOperationalProfileOpenPeopleV61528')?.addEventListener('click',()=>openOperationalProfile('UNCLASSIFIED',{mode:'ASSIGN'}));document.querySelectorAll('[data-operational-mode-v61529f5]').forEach(btn=>btn.addEventListener('click',()=>setOperationalMode(btn.dataset.operationalModeV61529f5)));$('teamOperationalProfileOrgV61527')?.addEventListener('change',loadOpPool);$('teamOperationalProfileEffectiveV61527')?.addEventListener('change',async()=>{validateOperationalEffectiveDate({autoCorrect:true,showToast:true});state.opPreview=null;await loadOpPool();});$('teamOperationalProfileShowV61527')?.addEventListener('change',()=>{renderOperationalTargetTypeOptions();loadOpPool();});$('teamOperationalProfileTargetV61527')?.addEventListener('change',()=>{state.opPreview=null;renderOpTeamOptions();});$('teamOperationalProfileTeamV61527')?.addEventListener('change',()=>{state.opPreview=null;renderOpPool();scheduleOperationalPreview();});$('teamOperationalProfileSearchBtnV61527')?.addEventListener('click',renderOpPool);$('teamOperationalProfileSearchV61527')?.addEventListener('input',renderOpPool);$('teamOperationalProfileSearchV61527')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();renderOpPool();}});$('teamOperationalProfileSelectAllLeftV61528F2')?.addEventListener('click',selectAllOperationalLeft);$('teamOperationalProfileMoveRightV61528F2')?.addEventListener('click',moveOperationalRight);$('teamOperationalProfileMoveLeftV61528F2')?.addEventListener('click',moveOperationalLeft);$('teamOperationalProfileNoteV61527')?.addEventListener('input',renderOperationalPreview);$('teamOperationalProfileSaveV61527')?.addEventListener('click',saveOperational);
    $('teamMembershipEffectiveV61524')?.addEventListener('change',loadMembershipCandidates);$('teamMembershipSearchV61524')?.addEventListener('input',renderMemberList);$('teamMembershipSourceFilterV61528F1')?.addEventListener('change',renderMemberList);$('teamMembershipMoveRightV61528F1')?.addEventListener('click',moveMembershipRight);$('teamMembershipMoveLeftV61528F1')?.addEventListener('click',moveMembershipLeft);$('teamMembershipSelectAllLeftV61528F1')?.addEventListener('click',selectAllMembershipLeft);$('teamMembershipSaveV61524')?.addEventListener('click',saveMembership);
    $('teamClosureSelectAllV61529F12')?.addEventListener('click',selectAllClosureMembers);$('teamClosureBulkTargetV61529F12')?.addEventListener('change',()=>{const b=$('teamClosureApplyBulkV61529F12');if(b)b.disabled=state.closurePicked.size===0||!$('teamClosureBulkTargetV61529F12')?.value;});$('teamClosureApplyBulkV61529F12')?.addEventListener('click',applyClosureBulkTarget);$('teamClosureReasonV61529F12')?.addEventListener('input',renderTeamClosure);$('teamClosureConfirmV61529F12')?.addEventListener('click',confirmTeamClosure);
    $('teamMasterAuditRefreshV61523')?.addEventListener('click',loadAudit);$('teamChangeRefreshV61528')?.addEventListener('click',loadChangeInbox);$('teamChangeStatusV61528')?.addEventListener('change',loadChangeInbox);$('teamBrowserNotificationV61528')?.addEventListener('click',enableBrowserNotification);
    document.addEventListener('change',e=>{const l=e.target.closest('[data-team-membership-left-check-v61528f1]');if(l){const c=String(l.dataset.teamMembershipLeftCheckV61528f1);l.checked?state.membershipLeftPicked.add(c):state.membershipLeftPicked.delete(c);renderMemberList();return;}const r=e.target.closest('[data-team-membership-right-check-v61528f1]');if(r){const c=String(r.dataset.teamMembershipRightCheckV61528f1);r.checked?state.membershipRightPicked.add(c):state.membershipRightPicked.delete(c);renderMemberList();return;}const ol=e.target.closest('[data-operational-profile-left-check-v61528f2]');if(ol){const c=String(ol.dataset.operationalProfileLeftCheckV61528f2);ol.checked?state.opLeftPicked.add(c):state.opLeftPicked.delete(c);renderOpPool();return;}const or=e.target.closest('[data-operational-profile-right-check-v61528f2]');if(or){const c=String(or.dataset.operationalProfileRightCheckV61528f2);or.checked?state.opRightPicked.add(c):state.opRightPicked.delete(c);renderOpPool();return;}const cc=e.target.closest('[data-team-closure-member-check-v61529f12]');if(cc){const c=String(cc.dataset.teamClosureMemberCheckV61529f12);cc.checked?state.closurePicked.add(c):state.closurePicked.delete(c);renderTeamClosure();return;}const ct=e.target.closest('[data-team-closure-target-v61529f12]');if(ct){const c=String(ct.dataset.teamClosureTargetV61529f12),v=ct.value;if(!v)state.closureMoves.delete(c);else if(v==='__NONE__')state.closureMoves.set(c,null);else state.closureMoves.set(c,v);renderTeamClosure();scheduleClosurePreview();return;}const en=e.target.closest('[data-enforcement-team-check-v61529]');if(en){const c=String(en.dataset.enforcementTeamCheckV61529);en.checked?state.enforcementSelected.add(c):state.enforcementSelected.delete(c);renderEnforcementModal();return;}});
    document.addEventListener('click',e=>{
      const scope=e.target.closest('[data-enforcement-scope-v61529]');if(scope){setEnforcementScope(scope.dataset.enforcementScopeV61529);loadEnforcementModal();return;}if(e.target.closest('[data-team-enforcement-close-v61529]')){closeEnforcementRollout();return;}if(e.target.closest('[data-team-closure-close-v61529f12]')){closeTeamClosure();return;}
      const tab=e.target.closest('[data-team-workspace-tab-v61528]');if(tab){setTab(tab.dataset.teamWorkspaceTabV61528);return;}
      const k=e.target.closest('[data-team-kpi-action-v61528]');if(k){const a=k.dataset.teamKpiActionV61528;if(a==='UNCLASSIFIED')openOperationalProfile('UNCLASSIFIED',{mode:'ASSIGN'});else{setTab('PEOPLE');if(['CAR','MOTORCYCLE','SUPPORT'].includes(a)&&$('teamMasterCategoryFilterV61524'))$('teamMasterCategoryFilterV61524').value=a;renderTeams();}return;}
      const mem=e.target.closest('[data-team-membership-v61524]');if(mem){openMembership(mem.dataset.teamMembershipV61524);return;}
      const de=e.target.closest('[data-team-master-deactivate-v61523]');if(de){deactivateTeam(de.dataset.teamMasterDeactivateV61523);return;}
      const ack=e.target.closest('[data-team-change-ack-v61528]');if(ack){acknowledgeChange(ack.dataset.teamChangeAckV61528);return;}
      if(e.target.closest('[data-team-master-close-v61523]')){closeCreate();return;}if(e.target.closest('[data-team-membership-close-v61524]')){closeMembership();return;}if(e.target.closest('[data-operational-profile-close-v61527]')){closeOperationalProfile();return;}if(e.target.closest('.nav-item[data-page="team-master"]'))setTimeout(load,0);
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeCreate();closeMembership();closeOperationalProfile();closeEnforcementRollout();closeTeamClosure();}});
    document.addEventListener('timeclock:effective-role-changed',()=>{syncNav();if(document.querySelector('#page-team-master.active'))setTimeout(load,0);});window.addEventListener('ta:session-ready',()=>{syncNav();if(document.querySelector('#page-team-master.active'))setTimeout(load,0);});
    window.addEventListener('timeclock:auth-signed-out',()=>{stopChangeRealtime();});
    window.addEventListener('timeclock:auth-refreshed',()=>{if(document.querySelector('#page-team-master.active')&&allowedRole()){stopChangeRealtime();setTimeout(()=>{setupChangeRealtime();loadChangeInbox();},50);}});
  }
  window.TimeClockTeamMasterV61524={load,openCreate,openMembership,openOperationalProfileV61527:openOperationalProfile,openTeamClosure,loadRuntimeDiagnostic,version:VERSION,state};
  window.TimeClockTeamEnforcementV61525={loadEnforcement,toggleEnforcement,openRollout:openEnforcementRollout,version:VERSION,state};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();


/* ============================================================================
   V6.15.29 FIX14B — Temporary Team Assignment / Borrow + Acting UX
   ============================================================================ */
(()=>{
  'use strict';
  const VERSION='6.15.29 FIX15I';
  const $=id=>document.getElementById(id);
  const app=()=>window.TimeClockApp;
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const role=()=>String(app()?.state?.profile?._realRole||app()?.state?.profile?.role||'VIEWER').toUpperCase();
  const isHr=()=>role()==='HR_ADMIN';
  const baseManager=()=>role()==='MANAGER';
  const toast=(m,t='info')=>app()?.toast?.(m,t);
  const state={
    access:null,rows:[],summary:{},loaded:false,loading:false,
    candidates:[],destinations:[],preview:null,selectedEmployee:'',
    action:null,actingRows:[],actingCandidates:[],actingOrgs:[],actingEdit:null,
    candidateTimer:null,previewTimer:null,accessLoading:false,
    workflowFilter:'ACTION'
  };
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const addDays=(iso,n)=>{const [y,m,d]=String(iso).slice(0,10).split('-').map(Number);const x=new Date(y,m-1,d);x.setDate(x.getDate()+n);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`;};
  const monthStart=iso=>String(iso||today()).slice(0,7)+'-01';
  const fmtDate=v=>{const m=String(v||'').slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:String(v||'-');};
  const fmtDateTime=v=>{if(!v)return '-';try{return new Intl.DateTimeFormat('th-TH',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));}catch{return String(v);}};
  async function rpc(name,args={}){const c=app()?.state?.client;if(!c)throw new Error('SUPABASE_CLIENT_NOT_READY');const {data,error}=await c.rpc(name,args);if(error)throw error;return data;}
  function human(error){
    const raw=String(app()?.humanError?.(error)||error?.message||error||'เกิดข้อผิดพลาด');
    const map=[
      ['TEMP_ASSIGNMENT_OPERATIONAL_MANAGER_REQUIRED','รายการยืมตัวต้องดำเนินการโดย Manager หรือ Acting Manager ที่มี Authority'],
      ['TEMP_ASSIGNMENT_AUTHORITY_DENIED','ไม่มีสิทธิ์ดำเนินการรายการยืมตัวนี้'],
      ['TEMP_ASSIGNMENT_COUNTERPART_AUTHORITY_DENIED','รายการนี้ต้องให้ Manager/Acting ต้นทางเป็นผู้ดำเนินการ'],
      ['BORROW_CROSS_DIVISION_NOT_ALLOWED','ไม่อนุญาตให้ยืมตัวข้ามระดับฝ่าย'],
      ['BORROW_DESTINATION_AUTHORITY_REQUIRED','คุณต้องมีสิทธิ์ Manager / Acting ของ Team ปลายทางจึงจะร้องขอยืมช่างได้'],
      ['BORROW_DESTINATION_MANAGER_REQUIRED','การยืมตัวต้องเริ่มจาก Manager / Acting ฝั่งปลายทาง'],
      ['SOURCE_MANAGER_NOT_FOUND','ไม่พบ Manager ต้นทางของพนักงาน กรุณาตรวจ Manager Scope'],
      ['BORROW_SAME_MANAGER_USE_TEAM_TRANSFER','ช่างคนนี้อยู่ภายใต้ Manager เดียวกับปลายทาง ให้ใช้ฟังก์ชัน “ย้ายทีม” ใน Team Membership'],
      ['BORROW_SOURCE_MANAGER_APPROVAL_REQUIRED','รายการนี้ต้องให้ Manager / Acting ต้นทางเป็นผู้อนุมัติ'],
      ['BORROW_NOT_WAITING_SOURCE','รายการนี้ไม่ได้อยู่ในสถานะรอ Manager ต้นทาง'],
      ['BORROW_PREVIEW_BLOCKED','คำขอยืมตัวไม่ผ่านเงื่อนไข'],
      ['TEMP_ASSIGNMENT_DATE_OVERLAP','พนักงานมีรายการยืมตัวที่ช่วงวันที่ซ้อนกันอยู่แล้ว'],
      ['HOME_TEAM_REQUIRED_BEFORE_TEMP_ASSIGNMENT','ต้องจัด Permanent Home Team ให้พนักงานก่อนทำรายการ'],
      ['DESTINATION_TEAM_NOT_ACTIVE_ON_EFFECTIVE_DATE','Team ปลายทางยังไม่พร้อมใช้งานในวันที่เริ่ม'],
      ['BORROW_OPERATIONAL_TYPE_MISMATCH','ช่างอยู่ต่างประเภทกับ Team ปลายทาง ระบบแสดงรายชื่อให้ตรวจสอบได้ แต่ Policy ปัจจุบันยังไม่อนุญาตให้ส่งคำขอ'],
      ['DESTINATION_TEAM_CATEGORY_MISMATCH','รูปแบบการปฏิบัติงานของพนักงานไม่ตรงกับประเภท Team ปลายทาง จึงยังส่งคำขอยืมไม่ได้'],
      ['TEMP_ASSIGNMENT_BACKDATE_NOT_ALLOWED','ไม่สามารถสร้างรายการย้อนหลังได้'],
      ['TEMP_ASSIGNMENT_BEFORE_EMPLOYEE_START_DATE','วันที่เริ่มยืม/ไปช่วยต้องไม่ก่อนวันเริ่มงาน'],
      ['TEMP_ASSIGNMENT_AFTER_EMPLOYEE_RESIGN_DATE','วันที่สิ้นสุดต้องไม่เกินวันลาออก'],
      ['TEMP_ASSIGNMENT_SAME_TEAM','Team ปลายทางต้องไม่ใช่ Home Team เดิม'],
      ['TEMP_ASSIGNMENT_DATE_RANGE_INVALID','วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่ม'],
      ['SYSTEM_PERIOD_SCHEDULE_CLOSED','ช่วงวันที่นี้อยู่ในรอบระบบที่ปิดการแก้ไขกะแล้ว'],
      ['ACTING_ASSIGNMENT_OVERLAP','Acting คนนี้มีช่วงรักษาการซ้อนกันใน Scope เดียวกัน'],
      ['HR_ADMIN_REQUIRED','รายการนี้สำหรับ HR Admin เท่านั้น']
    ];
    for(const [k,v] of map)if(raw.includes(k))return v;
    return raw.replace(/^Error:\s*/,'');
  }
  const assignmentLabel=t=>'ยืมตัว';
  const assignmentIcon=t=>'↔';
  function statusInfo(r){
    const l=String(r?.lifecycle_status||r?.status||'').toUpperCase();
    const m={
      PENDING_SOURCE:['รอ Manager ต้นทาง','pending'],PENDING_DESTINATION:['รอ Manager ปลายทาง','pending'],
      SCHEDULED:['อนุมัติแล้ว · รอเริ่ม','scheduled'],ACTIVE:['กำลังยืมตัว','active'],COMPLETED:['สิ้นสุดแล้ว','completed'],
      REJECTED:['ไม่อนุมัติ','rejected'],CANCELLED:['ยกเลิกแล้ว','cancelled'],APPROVED:['อนุมัติแล้ว','active']
    };
    const x=m[l]||[l||'-','neutral'];return {label:x[0],tone:x[1]};
  }
  function directionText(v){return v==='INBOUND'?'ยืมเข้าทีม':v==='OUTBOUND'?'ถูกยืมออก':v==='BOTH'?'เกี่ยวข้องทั้ง 2 ฝั่ง':v==='AUDIT'?'HR Audit':'-';}
  function authorityLabel(v){return String(v||'').toUpperCase()==='ACTING_MANAGER'?'Acting Manager':String(v||'').toUpperCase()==='MANAGER'?'Manager':String(v||'').toUpperCase()==='SOURCE_AND_DESTINATION'?'Manager ทั้ง 2 ฝั่ง':'-';}
  function hasOperationalAuthority(){return state.access?.is_operational_actor===true||state.access?.is_acting===true;}
  function actingOnly(){return !isHr()&&!baseManager()&&hasOperationalAuthority();}
  const actorEmail=()=>String(state.access?.actor_email||app()?.state?.profile?.email||'').trim().toLowerCase();
  function isoDayDiff(fromIso,toIso){
    const a=String(fromIso||'').slice(0,10),b=String(toIso||'').slice(0,10);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(a)||!/^\d{4}-\d{2}-\d{2}$/.test(b))return null;
    const [ay,am,ad]=a.split('-').map(Number),[by,bm,bd]=b.split('-').map(Number);
    return Math.round((Date.UTC(by,bm-1,bd)-Date.UTC(ay,am-1,ad))/86400000);
  }
  function isMyRequest(r){const me=actorEmail();return !!me&&String(r?.requested_by_email||'').trim().toLowerCase()===me;}
  function isExpiringSoon(r){
    const life=String(r?.lifecycle_status||r?.status||'').toUpperCase();
    if(life!=='ACTIVE')return false;
    const left=isoDayDiff(today(),r?.effective_to);return left!==null&&left>=0&&left<=3;
  }
  function workflowCounts(){
    const rows=state.rows||[];
    return {
      ACTION:rows.filter(r=>r.can_decide===true).length,
      REQUESTED:rows.filter(isMyRequest).length,
      ACTIVE:rows.filter(r=>String(r.lifecycle_status||r.status||'').toUpperCase()==='ACTIVE').length,
      EXPIRING:rows.filter(isExpiringSoon).length,
      COMPLETED:rows.filter(r=>String(r.lifecycle_status||r.status||'').toUpperCase()==='COMPLETED').length,
      ALL:rows.length
    };
  }
  function syncWorkflowFilterUI(){
    const counts=workflowCounts();
    document.querySelectorAll('[data-borrow-workflow-filter-v61529f15f]').forEach(btn=>{
      const key=String(btn.dataset.borrowWorkflowFilterV61529f15f||'ALL').toUpperCase();
      btn.classList.toggle('active',key===state.workflowFilter);
      btn.setAttribute('aria-pressed',key===state.workflowFilter?'true':'false');
      const count=btn.querySelector('[data-borrow-workflow-count-v61529f15f]');if(count)count.textContent=Number(counts[key]||0).toLocaleString('th-TH');
    });
  }
  function setWorkflowFilter(key,{render=true,resetStatus=true}={}){
    state.workflowFilter=String(key||'ALL').toUpperCase();
    if(resetStatus&&$('teamTempStatusV61529F14B'))$('teamTempStatusV61529F14B').value='ALL';
    syncWorkflowFilterUI();if(render)renderWorkspace();
  }

  async function loadAccess({silent=true}={}){
    if(state.accessLoading)return state.access;
    if(!app()?.state?.client)return null;
    state.accessLoading=true;
    try{
      const data=await rpc('ta_get_my_temporary_assignment_access_v61529f14b',{});
      state.access=data||{};
      if(app()?.state?.profile)app().state.profile._actingTeamAuthority=hasOperationalAuthority();
      syncAccessUI();
      return state.access;
    }catch(e){if(!silent)toast(human(e),'error');return null;}finally{state.accessLoading=false;}
  }

  function syncAccessUI(){
    const can=state.access?.can_access===true||isHr()||baseManager();
    $('teamTemporaryTabV61529F14B')?.classList.toggle('hidden',!can);
    if(can)$('teamMasterNavV61523')?.classList.remove('hidden');
    if(hasOperationalAuthority())document.querySelector('.nav-item[data-page="schedule"]')?.classList.remove('hidden');
    $('teamActingPanelV61529F14B')?.classList.toggle('hidden',!isHr());
    $('teamTempCreateV61529F14B')?.classList.toggle('hidden',isHr()||!hasOperationalAuthority());
    const badge=$('teamTempAuthorityBadgeV61529F14B');
    if(badge){
      if(isHr()){badge.textContent='HR Admin · Audit / Acting';badge.className='badge badge-blue';}
      else if(state.access?.is_acting){badge.textContent='Acting Manager · Operational Authority';badge.className='badge badge-purple';}
      else if(baseManager()){badge.textContent='Manager · Operational Authority';badge.className='badge badge-green';}
      else{badge.textContent='ไม่มี Operational Authority';badge.className='badge badge-gray';}
    }
    const page=$('page-team-master');page?.classList.toggle('acting-only-v61529f14b',actingOnly());
    if(actingOnly()){
      document.querySelectorAll('[data-team-workspace-tab-v61528]').forEach(b=>{if(b.dataset.teamWorkspaceTabV61528!=='ASSIGNMENTS')b.classList.add('acting-base-hidden-v61529f14b');});
      const title=page?.querySelector('.team-workspace-title-v61528 h2'),desc=page?.querySelector('.team-workspace-title-v61528 p');
      if(title)title.textContent='ยืมตัวช่างเทคนิค';if(desc)desc.textContent='Acting Manager · ร้องขอหรืออนุมัติการยืมตัวตาม Scope และช่วงวันที่ที่ได้รับมอบหมาย';
    }else{
      document.querySelectorAll('.acting-base-hidden-v61529f14b').forEach(b=>b.classList.remove('acting-base-hidden-v61529f14b'));
    }
  }

  function ensureAssignmentTabVisible(){
    document.querySelectorAll('[data-team-workspace-tab-v61528]').forEach(b=>b.classList.toggle('active',b.dataset.teamWorkspaceTabV61528==='ASSIGNMENTS'));
    document.querySelectorAll('[data-team-workspace-pane-v61528]').forEach(p=>p.classList.toggle('hidden',p.dataset.teamWorkspacePaneV61528!=='ASSIGNMENTS'));
  }

  function listRange(){return {from:$('teamTempFromV61529F14B')?.value||monthStart(today()),to:$('teamTempToV61529F14B')?.value||addDays(today(),90)};}
  function setDefaultRange(){const f=$('teamTempFromV61529F14B'),t=$('teamTempToV61529F14B');if(f&&!f.value)f.value=monthStart(today());if(t&&!t.value)t.value=addDays(today(),90);}
  function filteredRows(){
    const status=String($('teamTempStatusV61529F14B')?.value||'ALL').toUpperCase();
    const workflow=String(state.workflowFilter||'ALL').toUpperCase();
    const q=String($('teamTempSearchV61529F14B')?.value||'').toLowerCase().trim();
    return(state.rows||[]).filter(r=>{
      const life=String(r.lifecycle_status||r.status||'').toUpperCase();
      const statusOk=status==='ALL'||(status==='OPEN'&&['PENDING_SOURCE','PENDING_DESTINATION','SCHEDULED','ACTIVE'].includes(life))||(status==='PENDING'&&['PENDING_SOURCE','PENDING_DESTINATION'].includes(life))||life===status;
      const workflowOk=workflow==='ALL'
        ||(workflow==='ACTION'&&r.can_decide===true)
        ||(workflow==='REQUESTED'&&isMyRequest(r))
        ||(workflow==='ACTIVE'&&life==='ACTIVE')
        ||(workflow==='EXPIRING'&&isExpiringSoon(r))
        ||(workflow==='COMPLETED'&&life==='COMPLETED');
      const text=[r.emp_code,r.employee_name,r.source_org_code,r.source_org_name,r.source_team_code,r.destination_org_code,r.destination_org_name,r.destination_team_code,r.requested_by_email,assignmentLabel(r.assignment_type)].join(' ').toLowerCase();
      return statusOk&&workflowOk&&(!q||text.includes(q));
    });
  }
  function workflowStepperHtml(r){
    const life=String(r.lifecycle_status||r.status||'').toUpperCase();
    const rejected=life==='REJECTED',cancelled=life==='CANCELLED';
    const approved=['SCHEDULED','ACTIVE','COMPLETED','APPROVED'].includes(life);
    const working=['ACTIVE','COMPLETED'].includes(life);
    const completed=life==='COMPLETED';
    const steps=[
      {label:'ส่งคำขอ',state:'done'},
      {label:rejected?'ไม่อนุมัติ':'อนุมัติ',state:rejected?'stop':approved?'done':['PENDING_SOURCE','PENDING_DESTINATION'].includes(life)?'current':'idle'},
      {label:cancelled?'ยกเลิก':'ช่วงยืม',state:cancelled?'stop':working?'done':life==='SCHEDULED'?'current':'idle'},
      {label:'สิ้นสุด',state:completed?'done':life==='ACTIVE'?'current':'idle'}
    ];
    return `<div class="borrow-workflow-stepper-v61529f15f" aria-label="สถานะขั้นตอนการยืมตัว">${steps.map((x,i)=>`<div class="${x.state}"><span>${x.state==='done'?'✓':x.state==='stop'?'×':i+1}</span><small>${esc(x.label)}</small></div>`).join('')}</div>`;
  }
  function workflowMetaHtml(r){
    const tags=[];
    if(isMyRequest(r))tags.push('<span class="borrow-meta-chip-v61529f15f mine">คำขอของฉัน</span>');
    if(r.can_decide===true)tags.push('<span class="borrow-meta-chip-v61529f15f action">รอฉันอนุมัติ</span>');
    if(isExpiringSoon(r)){
      const left=isoDayDiff(today(),r.effective_to);tags.push(`<span class="borrow-meta-chip-v61529f15f expiring">${left===0?'ครบกำหนดวันนี้':`เหลือ ${left} วัน`}</span>`);
    }
    return tags.length?`<div class="borrow-meta-chips-v61529f15f">${tags.join('')}</div>`:'';
  }
  function rowActions(r){
    const out=[];
    if(r.can_decide){out.push(`<button class="btn btn-primary btn-sm" data-temp-approve-v61529f14b="${esc(r.assignment_id)}">อนุมัติ</button>`);out.push(`<button class="btn btn-danger-soft btn-sm" data-temp-reject-v61529f14b="${esc(r.assignment_id)}">ไม่อนุมัติ</button>`);}
    if(r.can_end){
      const l=String(r.lifecycle_status||'').toUpperCase();
      if(['PENDING_SOURCE','PENDING_DESTINATION','SCHEDULED'].includes(l))out.push(`<button class="btn btn-light btn-sm" data-temp-cancel-v61529f14b="${esc(r.assignment_id)}">ยกเลิก</button>`);
      else if(l==='ACTIVE')out.push(`<button class="btn btn-light btn-sm" data-temp-end-v61529f14b="${esc(r.assignment_id)}">จบก่อนกำหนด</button>`);
    }
    out.push(`<button class="btn btn-light btn-sm" type="button" data-borrow-audit-assignment-v61529f15i="${esc(r.assignment_id)}">⌁ ประวัติ</button>`);
    return out.join('');
  }
  function renderWorkspace(){
    const rows=filteredRows(),host=$('teamTempListV61529F14B');if(!host)return;
    const pendingMine=(state.rows||[]).filter(r=>r.can_decide).length;
    const expiring=(state.rows||[]).filter(isExpiringSoon).length;
    const put=(id,v)=>{if($(id))$(id).textContent=Number(v||0).toLocaleString('th-TH');};
    put('teamTempKpiPendingV61529F14B',pendingMine);put('teamTempKpiActiveV61529F14B',state.summary?.active);put('teamTempKpiScheduledV61529F14B',state.summary?.scheduled);put('teamTempKpiInboundV61529F14B',state.summary?.inbound);put('teamTempKpiOutboundV61529F14B',state.summary?.outbound);put('teamTempKpiExpiringV61529F15F',expiring);
    const badge=$('teamTempPendingBadgeV61529F14B');if(badge){badge.textContent=pendingMine;badge.classList.toggle('hidden',pendingMine===0);}
    syncWorkflowFilterUI();
    const resultLabel=$('teamTempResultLabelV61529F15F');if(resultLabel)resultLabel.textContent=`แสดง ${Number(rows.length).toLocaleString('th-TH')} จาก ${Number((state.rows||[]).length).toLocaleString('th-TH')} รายการ`;
    if(!rows.length){
      const emptyText=state.workflowFilter==='ACTION'?'ไม่มีรายการรอคุณอนุมัติ':state.workflowFilter==='REQUESTED'?'ยังไม่มีคำขอที่คุณเป็นผู้ร้องขอ':state.workflowFilter==='ACTIVE'?'ไม่มีช่างที่กำลังยืมตัวในช่วงนี้':state.workflowFilter==='EXPIRING'?'ไม่มีรายการที่จะครบกำหนดภายใน 3 วัน':state.workflowFilter==='COMPLETED'?'ยังไม่มีรายการที่สิ้นสุดในช่วงนี้':'ไม่มีรายการตามเงื่อนไข';
      host.innerHTML=`<div class="team-temp-empty-v61529f14b"><span>✓</span><div><strong>${esc(emptyText)}</strong><small>ลองเปลี่ยนช่วงวันที่ ตัวกรอง หรือคำค้นหา</small></div></div>`;return;
    }
    host.innerHTML=rows.map(r=>{
      const st=statusInfo(r),type=assignmentLabel(r.assignment_type),waiting=r.waiting_for==='SOURCE'?'ต้นทาง':r.waiting_for==='DESTINATION'?'ปลายทาง':'';
      const auth=r.source_authorized?'Manager/Acting ต้นทาง':r.destination_authorized?'Manager/Acting ปลายทาง':'Audit';
      return `<article class="team-temp-card-v61529f14b ${st.tone}" data-borrow-assignment-card-v61529f15g="${esc(r.assignment_id||'')}">
        <div class="team-temp-card-main-v61529f14b">
          <div class="team-temp-person-v61529f14b"><span class="team-temp-type-icon-v61529f14b">${assignmentIcon(r.assignment_type)}</span><div><strong>${esc(r.emp_code)} · ${esc(r.employee_name||'-')}</strong><small>${esc(r.position_name||'ช่างเทคนิค')}</small><span class="team-temp-type-chip-v61529f14b ${String(r.assignment_type||'').toLowerCase()}">${esc(type)}</span>${workflowMetaHtml(r)}</div></div>
          <div class="team-temp-flow-v61529f14b"><div><span>ต้นทาง</span><strong>${esc(r.source_org_code||'-')}</strong><small>${esc(r.source_team_code||'-')} · ${esc(r.source_team_name||'')}</small></div><b>→</b><div><span>Team ปลายทาง</span><strong>${esc(r.destination_org_code||'-')}</strong><small>${esc(r.destination_team_code||'-')} · ${esc(r.destination_team_name||'')}</small></div></div>
          <div class="team-temp-period-v61529f14b"><span>ช่วงยืมตัว</span><strong>${esc(fmtDate(r.effective_from))}</strong><small>ถึง ${esc(fmtDate(r.effective_to))}</small></div>
          <div class="team-temp-status-v61529f14b"><span class="team-temp-status-chip-v61529f14b ${st.tone}">${esc(st.label)}</span><small>${waiting?`รอการอนุมัติ${waiting} · `:''}${esc(directionText(r.direction))}</small><small>${esc(auth)}</small></div>
        </div>
        ${workflowStepperHtml(r)}
        <div class="team-temp-card-foot-v61529f14b"><p><strong>เหตุผล:</strong> ${esc(r.note||'-')}</p><div><span>ร้องขอโดย ${esc(r.requested_by_email||'-')} · ${esc(fmtDateTime(r.created_at))}</span><div class="team-temp-actions-v61529f14b">${rowActions(r)}</div></div></div>
      </article>`;
    }).join('');
  }
  async function load(){
    await loadAccess();if(!(state.access?.can_access||isHr()||baseManager()))return;
    if(state.loading)return;state.loading=true;setDefaultRange();const host=$('teamTempListV61529F14B');if(host)host.innerHTML='<div class="fc-empty">กำลังโหลดรายการยืมตัว...</div>';
    try{
      const range=listRange();const data=await rpc('ta_get_borrow_workspace_v61529f15',{p_from:range.from||null,p_to:range.to||null,p_org_id:null});
      state.rows=Array.isArray(data?.rows)?data.rows:[];state.summary=data?.summary||{};state.loaded=true;
      if(isHr()&&state.workflowFilter==='ACTION')state.workflowFilter='ALL';
      renderWorkspace();
      if(isHr())await loadActing();
    }catch(e){if(host)host.innerHTML=`<div class="fc-empty">โหลดไม่สำเร็จ: ${esc(human(e))}</div>`;toast(human(e),'error');}finally{state.loading=false;}
  }

  function selectedCandidate(){return state.candidates.find(r=>String(r.emp_code)===String($('teamTempEmployeeV61529F14B')?.value||''))||null;}
  function selectedDestination(){return state.destinations.find(r=>String(r.team_id)===String($('teamTempDestinationV61529F14B')?.value||''))||null;}
  function candidateCompatibility(r,d=selectedDestination()){
    const source=String(r?.operational_type||'').trim().toUpperCase(),target=String(d?.team_category||'').trim().toUpperCase();
    return {source,target,known:!!source&&!!target,match:!!source&&!!target&&source===target};
  }
  function renderCandidateOptions(keep=''){
    const s=$('teamTempEmployeeV61529F14B');if(!s)return;const old=keep||s.value;
    const destId=$('teamTempDestinationV61529F14B')?.value||'',dest=selectedDestination();
    if(!destId){s.disabled=true;s.innerHTML='<option value="">— เลือก Team ปลายทางก่อน —</option>';return;}
    s.innerHTML='<option value="">— เลือกช่างที่ต้องการยืม —</option>'+state.candidates.map(r=>{
      const c=candidateCompatibility(r,dest),compat=c.known?(c.match?'✓ ตรงประเภท':`⚠ ${c.source} → ${c.target}`):'⚠ ตรวจประเภทงาน';
      return `<option value="${esc(r.emp_code)}">${esc(r.emp_code)} · ${esc(r.full_name||'-')} · ${esc(r.home_org_code||'-')} · ${esc(r.home_team_code||'-')} · ${esc(r.operational_type||'-')} · ${esc(compat)} · Manager ${esc(r.source_manager_name||r.source_manager_email||'-')}</option>`;
    }).join('');
    s.disabled=false;if(state.candidates.some(r=>String(r.emp_code)===String(old)))s.value=old;
  }
  function renderHomeCard(){
    const r=selectedCandidate(),d=selectedDestination(),box=$('teamTempHomeCardV61529F14B');if(!box)return;
    if(!r){box.innerHTML='<span>ต้นทาง</span><strong>-</strong><small>เลือกช่างเพื่อดู Home Team, รูปแบบการปฏิบัติงาน และ Manager ต้นทาง</small>';return;}
    const c=candidateCompatibility(r,d),compat=c.known?(c.match?'<div class="team-temp-compat-v61529f15a ok">✓ รูปแบบการปฏิบัติงานตรงกับ Team ปลายทาง</div>':`<div class="team-temp-compat-v61529f15a warning">⚠ รูปแบบ ${esc(c.source)} ไม่ตรงกับ Team ปลายทาง ${esc(c.target)} · แสดงรายชื่อได้ แต่ต้องตรวจ Preview ก่อนส่งคำขอ</div>`):'';
    box.innerHTML=`<span>ต้นทาง · Permanent Home Team</span><strong>${esc(r.home_org_code||'-')} · ${esc(r.home_team_code||'-')}</strong><small>${esc(r.home_org_name||'')} · ${esc(r.home_team_name||'')} · ${esc(r.operational_type||'-')} · Manager: ${esc(r.source_manager_name||r.source_manager_email||'-')}</small>${compat}`;
  }
  async function loadDestinations(){
    const d=$('teamTempCreateFromV61529F14B')?.value||today(),s=$('teamTempDestinationV61529F14B'),keep=s?.value||'';state.destinations=[];state.preview=null;if(!s)return;
    s.disabled=true;s.innerHTML='<option value="">กำลังโหลด Team ปลายทางของคุณ...</option>';
    try{
      state.destinations=await rpc('ta_get_borrow_destination_teams_v61529f15',{p_work_date:d})||[];
      s.innerHTML='<option value="">— เลือก Team ปลายทาง —</option>'+state.destinations.map(r=>`<option value="${esc(r.team_id)}">${esc(r.org_code)} · ${esc(r.team_code)} · ${esc(r.team_name)} · ${Number(r.current_member_count||0)} คน · ${esc(r.team_category||'-')}</option>`).join('');
      s.disabled=false;if(state.destinations.some(r=>String(r.team_id)===String(keep)))s.value=keep;
      $('teamTempDestinationHintV61529F14B').textContent=state.destinations.length?'แสดงเฉพาะ Team ปลายทางที่คุณมี Manager / Acting Authority และพร้อมใช้งาน':'ไม่พบ Team ปลายทางที่คุณมีสิทธิ์ร้องขอยืมช่าง';
    }catch(e){s.innerHTML='<option value="">โหลด Team ไม่สำเร็จ</option>';toast(human(e),'error');}
    renderCandidateOptions();renderHomeCard();renderPreview();
  }
  async function loadCandidates(){
    const keep=$('teamTempEmployeeV61529F14B')?.value||'',q=$('teamTempCandidateSearchV61529F14B')?.value?.trim()||'',d=$('teamTempCreateFromV61529F14B')?.value||today(),dest=$('teamTempDestinationV61529F14B')?.value||'';
    state.candidates=[];state.preview=null;if(!dest){renderCandidateOptions();renderHomeCard();renderPreview();return;}
    try{state.candidates=await rpc('ta_get_borrow_candidates_v61529f15',{p_destination_team_id:dest,p_work_date:d,p_search:q||null,p_limit:500})||[];renderCandidateOptions(keep);renderHomeCard();if(!state.candidates.length)toast('ไม่พบช่างภายใต้ Manager อื่นในฝ่ายเดียวกันที่สามารถแสดงสำหรับการยืมได้','info');}catch(e){renderCandidateOptions();toast(human(e),'error');}
    renderPreview();
  }
  function blockerText(b){const c=String(b?.code||'');return human(c)||c;}
  function renderPreview(){
    const p=state.preview,box=$('teamTempPreviewV61529F14B'),save=$('teamTempCreateConfirmV61529F14B');if(!box||!save)return;const note=String($('teamTempNoteV61529F14B')?.value||'').trim();
    if(!p){box.innerHTML='<div class="team-temp-preview-placeholder-v61529f14b">เลือก Team ปลายทาง ช่าง และช่วงวันที่ เพื่อดูเส้นทางคำขอ</div>';save.disabled=true;save.textContent='ส่งคำขอยืมตัว';return;}
    const blockers=Array.isArray(p.blockers)?p.blockers:[],warnings=Array.isArray(p.warnings)?p.warnings:[],allowed=p.allowed===true,source=p.source_org||{},dest=p.destination_org||{},st=p.source_team||{},dt=p.destination_team||{},sm=p.source_manager||{},dm=p.destination_manager||{};
    const c=p.compatibility||candidateCompatibility(selectedCandidate(),selectedDestination()),sourceType=String(c.source_operational_type||c.source||selectedCandidate()?.operational_type||'-').toUpperCase(),destType=String(c.destination_team_category||c.target||dt.team_category||selectedDestination()?.team_category||'-').toUpperCase();
    const mismatch=c.team_category_match===false||(sourceType!=='-'&&destType!=='-'&&sourceType!==destType),warningRows=[...warnings];
    if(mismatch&&!warningRows.some(w=>String(w?.code||'')==='BORROW_OPERATIONAL_TYPE_MISMATCH'))warningRows.push({code:'BORROW_OPERATIONAL_TYPE_MISMATCH',operational_type:sourceType,destination_team_category:destType});
    const workflow='ปลายทางร้องขอ → รอ Manager / Acting ต้นทางอนุมัติ → เมื่ออนุมัติ ปลายทางเป็นผู้จัดกะตลอดช่วงยืม';
    box.innerHTML=`<div class="team-temp-preview-head-v61529f14b"><div><span>ประเภท</span><strong>↔ ยืมตัว · ต่าง Manager</strong></div><span class="${allowed?'ok':'blocked'}">${allowed?'✓ ผ่านเงื่อนไข':'! ยังส่งคำขอไม่ได้'}</span></div><div class="team-temp-preview-flow-v61529f14b"><div><small>ต้นทาง</small><strong>${esc(source.org_code||'-')} · ${esc(st.team_code||'-')}</strong><span>Manager: ${esc(sm.email||'-')} · ${esc(sourceType)}</span></div><b>→</b><div><small>Team ปลายทาง</small><strong>${esc(dest.org_code||'-')} · ${esc(dt.team_code||'-')}</strong><span>Manager: ${esc(dm.email||'-')} · ${esc(destType)}</span></div></div><div class="team-temp-workflow-v61529f14b"><strong>เส้นทางอนุมัติ</strong><span>${esc(workflow)}</span><small>Manager เดียวกันจะไม่เข้าหน้านี้ และต้องใช้ฟังก์ชันย้ายทีม</small></div>${warningRows.length?`<div class="team-temp-warnings-v61529f15a">${warningRows.map(w=>`<p>⚠ ${esc(blockerText(w))}${w?.operational_type||w?.destination_team_category?` · ${esc(w.operational_type||sourceType)} → ${esc(w.destination_team_category||destType)}`:''}</p>`).join('')}</div>`:''}${blockers.length?`<div class="team-temp-blockers-v61529f14b">${blockers.map(b=>`<p>• ${esc(blockerText(b))}</p>`).join('')}</div>`:''}`;
    save.disabled=!allowed||note.length<3;save.textContent='ส่งคำขอยืมตัว';
  }
  async function preview(){
    clearTimeout(state.previewTimer);const emp=$('teamTempEmployeeV61529F14B')?.value||'',dest=$('teamTempDestinationV61529F14B')?.value||'',from=$('teamTempCreateFromV61529F14B')?.value||'',to=$('teamTempCreateToV61529F14B')?.value||'';if(!emp||!dest||!from||!to){state.preview=null;renderPreview();return;}
    if(to<from){state.preview={allowed:false,blockers:[{code:'TEMP_ASSIGNMENT_DATE_RANGE_INVALID'}]};renderPreview();return;}
    try{state.preview=await rpc('ta_preview_borrow_request_v61529f15',{p_emp_code:emp,p_destination_team_id:dest,p_effective_from:from,p_effective_to:to});renderPreview();}catch(e){state.preview={allowed:false,blockers:[{code:human(e)}]};renderPreview();}
  }
  function schedulePreview(){clearTimeout(state.previewTimer);state.previewTimer=setTimeout(preview,180);}
  async function openCreate(){
    await loadAccess({silent:false});if(isHr())return toast('HR Admin ใช้หน้านี้เพื่อตรวจสอบและกำหนด Acting แต่ไม่ใช่ผู้ร้องขอ/อนุมัติยืมตัว','warning');if(!hasOperationalAuthority())return toast('ไม่มี Operational Authority สำหรับร้องขอยืมตัว','error');
    const modal=$('teamTempCreateModalV61529F14B');if(!modal)return;const f=$('teamTempCreateFromV61529F14B'),t=$('teamTempCreateToV61529F14B');if(f){f.value=today();f.min=today();}if(t){t.value=addDays(today(),7);t.min=today();}$('teamTempCandidateSearchV61529F14B')&&($('teamTempCandidateSearchV61529F14B').value='');$('teamTempNoteV61529F14B')&&($('teamTempNoteV61529F14B').value='');state.preview=null;state.destinations=[];state.candidates=[];modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');await loadDestinations();renderCandidateOptions();renderHomeCard();renderPreview();
  }
  function closeCreate(){const m=$('teamTempCreateModalV61529F14B');if(m){m.classList.add('hidden');m.setAttribute('aria-hidden','true');}state.preview=null;state.destinations=[];state.candidates=[];}
  async function createAssignment(){
    const emp=$('teamTempEmployeeV61529F14B')?.value||'',dest=$('teamTempDestinationV61529F14B')?.value||'',from=$('teamTempCreateFromV61529F14B')?.value||'',to=$('teamTempCreateToV61529F14B')?.value||'',note=String($('teamTempNoteV61529F14B')?.value||'').trim();if(state.preview?.allowed!==true)return toast('กรุณาตรวจ Preview ให้ผ่านก่อนส่งคำขอ','warning');if(note.length<3)return toast('กรุณาระบุเหตุผล / รายละเอียดงาน','warning');
    const sm=state.preview?.source_manager?.email||'-',dm=state.preview?.destination_manager?.email||'-';const ok=await window.tcConfirm?.({title:'ส่งคำขอยืมช่าง?',message:[`${emp} · ยืมตัว`,`Manager ต้นทาง: ${sm}`,`Manager ปลายทาง: ${dm}`,`${state.preview?.source_org?.org_code||'-'} → ${state.preview?.destination_org?.org_code||'-'}`,`${fmtDate(from)} – ${fmtDate(to)}`,'เมื่อส่งแล้ว ระบบจะรอ Manager / Acting ต้นทางอนุมัติ'].join('\n'),confirmText:'ส่งคำขอยืมตัว',tone:'primary'});if(!ok)return;
    try{app()?.showLoading?.('กำลังส่งคำขอยืมตัว...');await rpc('ta_create_borrow_request_v61529f15',{p_emp_code:emp,p_destination_team_id:dest,p_effective_from:from,p_effective_to:to,p_note:note});closeCreate();toast('ส่งคำขอให้ Manager ต้นทางอนุมัติแล้ว','success');await load();window.TimeClockFunctional?.loadNotifications?.();}catch(e){toast(human(e),'error');}finally{app()?.hideLoading?.();}
  }

  function rowById(id){return(state.rows||[]).find(r=>String(r.assignment_id)===String(id))||null;}
  async function approve(id){const r=rowById(id);if(!r)return;const ok=await window.tcConfirm?.({title:'อนุมัติการยืมตัวช่าง',message:[`${r.emp_code} · ${r.employee_name||'-'}`,`${r.source_org_code} → ${r.destination_org_code}`,`${fmtDate(r.effective_from)} – ${fmtDate(r.effective_to)}`].join('\n'),confirmText:'อนุมัติ',tone:'primary'});if(!ok)return;try{app()?.showLoading?.('กำลังอนุมัติ...');await rpc('ta_decide_borrow_request_v61529f15',{p_assignment_id:id,p_decision:'APPROVE',p_note:null});toast('อนุมัติเรียบร้อย','success');await load();window.TimeClockFunctional?.loadNotifications?.();}catch(e){toast(human(e),'error');}finally{app()?.hideLoading?.();}}
  function openAction(id,mode){const r=rowById(id);if(!r)return;state.action={id,mode,row:r};const modal=$('teamTempActionModalV61529F14B'),title=$('teamTempActionTitleV61529F14B'),sub=$('teamTempActionSubtitleV61529F14B'),sum=$('teamTempActionSummaryV61529F14B'),endBox=$('teamTempActionEndBoxV61529F14B'),end=$('teamTempActionEndDateV61529F14B'),btn=$('teamTempActionConfirmV61529F14B');if(!modal)return;const labels={REJECT:'ไม่อนุมัติคำขอยืมตัว',CANCEL:'ยกเลิกคำขอยืมตัว',END:'จบการยืมตัวก่อนกำหนด'};title.textContent=labels[mode]||'ดำเนินการ';sub.textContent=`${r.emp_code} · ${r.employee_name||'-'} · ${r.source_org_code} → ${r.destination_org_code}`;sum.innerHTML=`<div><span>ประเภท</span><strong>${esc(assignmentLabel(r.assignment_type))}</strong></div><div><span>ช่วงเดิม</span><strong>${esc(fmtDate(r.effective_from))} – ${esc(fmtDate(r.effective_to))}</strong></div>`;$('teamTempActionReasonV61529F14B')&&($('teamTempActionReasonV61529F14B').value='');endBox.classList.toggle('hidden',mode!=='END');if(mode==='END'&&end){end.min=today();end.max=addDays(r.effective_to,-1);end.value=today()<r.effective_to?today():addDays(r.effective_to,-1);}btn.textContent=mode==='REJECT'?'ยืนยันไม่อนุมัติ':mode==='CANCEL'?'ยืนยันยกเลิก':'ยืนยันวันสิ้นสุดใหม่';btn.className=mode==='END'?'btn btn-primary':'btn btn-danger';modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');}
  function closeAction(){const m=$('teamTempActionModalV61529F14B');if(m){m.classList.add('hidden');m.setAttribute('aria-hidden','true');}state.action=null;}
  async function confirmAction(){const a=state.action;if(!a)return;const reason=String($('teamTempActionReasonV61529F14B')?.value||'').trim();if(reason.length<3)return toast('กรุณาระบุเหตุผล','warning');try{app()?.showLoading?.('กำลังบันทึก...');if(a.mode==='REJECT')await rpc('ta_decide_borrow_request_v61529f15',{p_assignment_id:a.id,p_decision:'REJECT',p_note:reason});else{const end=a.mode==='END'?$('teamTempActionEndDateV61529F14B')?.value:today();if(a.mode==='END'&&!end)return toast('กรุณาระบุวันที่สิ้นสุดใหม่','warning');await rpc('ta_end_borrow_request_v61529f15',{p_assignment_id:a.id,p_effective_to:end,p_reason:reason});}closeAction();toast(a.mode==='REJECT'?'บันทึกไม่อนุมัติแล้ว':a.mode==='CANCEL'?'ยกเลิกรายการแล้ว':'ปรับวันสิ้นสุดเรียบร้อย','success');await load();window.TimeClockFunctional?.loadNotifications?.();}catch(e){toast(human(e),'error');}finally{app()?.hideLoading?.();}}

  async function loadActing(){if(!isHr())return;try{const range=listRange();state.actingRows=await rpc('ta_get_acting_manager_assignments_v61529f14b',{p_from:range.from||null,p_to:range.to||null,p_org_id:null})||[];renderActing();}catch(e){console.warn('Acting reader',e);}}
  function actingStatus(r){return String(r.lifecycle_status||'').toUpperCase()==='ACTIVE'?'<span class="badge badge-green">กำลังรักษาการ</span>':String(r.lifecycle_status||'').toUpperCase()==='SCHEDULED'?'<span class="badge badge-blue">รอเริ่ม</span>':String(r.lifecycle_status||'').toUpperCase()==='COMPLETED'?'<span class="badge badge-gray">สิ้นสุดแล้ว</span>':'<span class="badge badge-red">ปิดใช้งาน</span>';}
  function renderActing(){const b=$('teamActingBodyV61529F14B');if(!b)return;b.innerHTML=state.actingRows.length?state.actingRows.map(r=>`<tr><td><strong>${esc(r.acting_name||r.acting_email)}</strong><small class="team-master-sub-v61523">${esc(r.acting_emp_code||'-')} · ${esc(r.acting_email)}</small></td><td><strong>${esc(r.org_code||'-')}</strong><small class="team-master-sub-v61523">${esc(r.org_name||'')}${r.include_descendants?' · รวมหน่วยงานย่อย':''}</small></td><td>${esc(fmtDate(r.effective_from))}<small class="team-master-sub-v61523">ถึง ${esc(fmtDate(r.effective_to))}</small></td><td>${actingStatus(r)}</td><td>${esc(r.reason||'-')}</td><td><button class="btn btn-light btn-sm" data-acting-edit-v61529f14b="${esc(r.acting_id)}">แก้ไข</button></td></tr>`).join(''):'<tr><td colspan="6" class="fc-empty">ยังไม่มี Acting Assignment ในช่วงวันที่นี้</td></tr>';}
  async function loadActingOptions(search=''){if(!isHr())return;const [people,orgs]=await Promise.all([rpc('ta_get_acting_manager_candidates_v61529f14b',{p_search:search||null,p_limit:500}),state.actingOrgs.length?Promise.resolve(state.actingOrgs):rpc('ta_get_acting_org_options_v61529f14b',{})]);state.actingCandidates=people||[];state.actingOrgs=orgs||[];renderActingOptions();}
  function renderActingOptions(){const p=$('teamActingPersonV61529F14B'),o=$('teamActingOrgV61529F14B');if(p){const old=p.value;p.innerHTML='<option value="">— เลือกผู้รักษาการ —</option>'+state.actingCandidates.map(r=>`<option value="${esc(r.email)}" data-emp="${esc(r.emp_code||'')}">${esc(r.display_name||r.email)} · ${esc(r.email)}${r.emp_code?` · ${esc(r.emp_code)}`:''}</option>`).join('');if([...p.options].some(x=>x.value===old))p.value=old;}if(o){const old=o.value;o.innerHTML='<option value="">— เลือกหน่วยงาน —</option>'+state.actingOrgs.map(r=>`<option value="${esc(r.org_id)}">${esc(r.org_code)} · ${esc(r.org_name)}</option>`).join('');if([...o.options].some(x=>x.value===old))o.value=old;}}
  async function openActing(id=null){if(!isHr())return;state.actingEdit=id?(state.actingRows.find(r=>String(r.acting_id)===String(id))||null):null;const modal=$('teamActingModalV61529F14B');if(!modal)return;await loadActingOptions('');const r=state.actingEdit;$('teamActingModalTitleV61529F14B').textContent=r?'แก้ไข Acting Manager':'กำหนด Acting Manager';if(r&&!state.actingCandidates.some(x=>String(x.email).toLowerCase()===String(r.acting_email).toLowerCase()))state.actingCandidates.unshift({email:r.acting_email,emp_code:r.acting_emp_code,display_name:r.acting_name,role:'-'});renderActingOptions();if($('teamActingPersonV61529F14B'))$('teamActingPersonV61529F14B').value=r?.acting_email||'';if($('teamActingOrgV61529F14B'))$('teamActingOrgV61529F14B').value=r?.org_unit_id||'';$('teamActingDescendantsV61529F14B')&&($('teamActingDescendantsV61529F14B').checked=r?.include_descendants===true);$('teamActingFromV61529F14B')&&($('teamActingFromV61529F14B').value=r?.effective_from||today());$('teamActingToV61529F14B')&&($('teamActingToV61529F14B').value=r?.effective_to||addDays(today(),7));$('teamActingReasonV61529F14B')&&($('teamActingReasonV61529F14B').value=r?.reason||'');$('teamActingActiveV61529F14B')&&($('teamActingActiveV61529F14B').checked=r?r.is_active!==false:true);modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');}
  function closeActing(){const m=$('teamActingModalV61529F14B');if(m){m.classList.add('hidden');m.setAttribute('aria-hidden','true');}state.actingEdit=null;}
  async function saveActing(){if(!isHr())return;const person=$('teamActingPersonV61529F14B'),email=person?.value||'',emp=person?.selectedOptions?.[0]?.dataset?.emp||'',org=$('teamActingOrgV61529F14B')?.value||'',from=$('teamActingFromV61529F14B')?.value||'',to=$('teamActingToV61529F14B')?.value||'',reason=String($('teamActingReasonV61529F14B')?.value||'').trim(),active=$('teamActingActiveV61529F14B')?.checked!==false;if(!email||!org||!from||!to)return toast('กรุณาระบุผู้รักษาการ หน่วยงาน และช่วงวันที่','warning');if(to<from)return toast('วันที่สิ้นสุดต้องไม่น้อยกว่าวันเริ่ม','warning');if(reason.length<3)return toast('กรุณาระบุเหตุผลการรักษาการ','warning');try{app()?.showLoading?.('กำลังบันทึก Acting Manager...');await rpc('ta_set_acting_manager_assignment_v61529f14',{p_acting_id:state.actingEdit?.acting_id||null,p_acting_email:email,p_acting_emp_code:emp||null,p_org_id:org,p_include_descendants:$('teamActingDescendantsV61529F14B')?.checked===true,p_effective_from:from,p_effective_to:to,p_reason:reason,p_is_active:active});closeActing();toast('บันทึก Acting Manager เรียบร้อย','success');await loadActing();}catch(e){toast(human(e),'error');}finally{app()?.hideLoading?.();}}

  async function openFromNotification(context={}){
    const assignmentId=String(context.assignmentId||'');
    const from=String(context.effectiveFrom||'').slice(0,10);
    const to=String(context.effectiveTo||'').slice(0,10);
    const workflow=String(context.workflowFilter||'ALL').toUpperCase();
    ensureAssignmentTabVisible();
    const f=$('teamTempFromV61529F14B'),t=$('teamTempToV61529F14B');
    if(f&&/^\d{4}-\d{2}-\d{2}$/.test(from)&&(!f.value||from<f.value))f.value=from;
    if(t&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&(!t.value||to>t.value))t.value=to;
    state.workflowFilter=['ACTION','REQUESTED','ACTIVE','EXPIRING','COMPLETED','ALL'].includes(workflow)?workflow:'ALL';
    if($('teamTempStatusV61529F14B'))$('teamTempStatusV61529F14B').value='ALL';
    syncWorkflowFilterUI();
    await load();
    if(!assignmentId)return;
    const card=[...document.querySelectorAll('[data-borrow-assignment-card-v61529f15g]')]
      .find(el=>String(el.getAttribute('data-borrow-assignment-card-v61529f15g')||'')===assignmentId);
    if(card){
      card.classList.add('borrow-notification-highlight-v61529f15g');
      card.scrollIntoView({behavior:'smooth',block:'center'});
      setTimeout(()=>card.classList.remove('borrow-notification-highlight-v61529f15g'),3200);
    }
  }

  function bind(){
    setDefaultRange();
    $('teamBorrowBrowserNotificationV61529F15G')?.addEventListener('click',()=>window.TimeClockBorrowNotificationsV61529F15G?.requestPermission?.());
    $('teamTempRefreshV61529F14B')?.addEventListener('click',load);$('teamTempCreateV61529F14B')?.addEventListener('click',openCreate);$('teamTempStatusV61529F14B')?.addEventListener('change',()=>{state.workflowFilter='ALL';syncWorkflowFilterUI();renderWorkspace();});$('teamTempSearchV61529F14B')?.addEventListener('input',renderWorkspace);$('teamTempFromV61529F14B')?.addEventListener('change',load);$('teamTempToV61529F14B')?.addEventListener('change',load);
    $('teamTempCandidateSearchBtnV61529F14B')?.addEventListener('click',loadCandidates);$('teamTempCandidateSearchV61529F14B')?.addEventListener('input',()=>{clearTimeout(state.candidateTimer);state.candidateTimer=setTimeout(loadCandidates,280);});$('teamTempCandidateSearchV61529F14B')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();loadCandidates();}});
    $('teamTempDestinationV61529F14B')?.addEventListener('change',async()=>{if($('teamTempEmployeeV61529F14B'))$('teamTempEmployeeV61529F14B').value='';await loadCandidates();schedulePreview();});$('teamTempEmployeeV61529F14B')?.addEventListener('change',()=>{renderHomeCard();schedulePreview();});$('teamTempCreateFromV61529F14B')?.addEventListener('change',async e=>{if($('teamTempCreateToV61529F14B')&&$('teamTempCreateToV61529F14B').value<e.target.value)$('teamTempCreateToV61529F14B').value=e.target.value;if($('teamTempDestinationV61529F14B'))$('teamTempDestinationV61529F14B').value='';await loadDestinations();await loadCandidates();schedulePreview();});$('teamTempCreateToV61529F14B')?.addEventListener('change',schedulePreview);$('teamTempNoteV61529F14B')?.addEventListener('input',renderPreview);$('teamTempCreateConfirmV61529F14B')?.addEventListener('click',createAssignment);$('teamTempActionConfirmV61529F14B')?.addEventListener('click',confirmAction);
    $('teamActingRefreshV61529F14B')?.addEventListener('click',loadActing);$('teamActingCreateV61529F14B')?.addEventListener('click',()=>openActing(null));$('teamActingSearchBtnV61529F14B')?.addEventListener('click',()=>loadActingOptions($('teamActingSearchV61529F14B')?.value||''));$('teamActingSearchV61529F14B')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();loadActingOptions(e.target.value||'');}});$('teamActingSaveV61529F14B')?.addEventListener('click',saveActing);
    document.addEventListener('click',e=>{
      const wf=e.target.closest('[data-borrow-workflow-filter-v61529f15f]');if(wf){setWorkflowFilter(wf.dataset.borrowWorkflowFilterV61529f15f||'ALL');return;}
      const kpi=e.target.closest('[data-borrow-kpi-filter-v61529f15f]');if(kpi){setWorkflowFilter(kpi.dataset.borrowKpiFilterV61529f15f||'ALL');return;}
      const tab=e.target.closest('[data-team-workspace-tab-v61528="ASSIGNMENTS"]');if(tab){setTimeout(()=>{ensureAssignmentTabVisible();load();},0);return;}
      const ap=e.target.closest('[data-temp-approve-v61529f14b]');if(ap){approve(ap.dataset.tempApproveV61529f14b);return;}const rj=e.target.closest('[data-temp-reject-v61529f14b]');if(rj){openAction(rj.dataset.tempRejectV61529f14b,'REJECT');return;}const ca=e.target.closest('[data-temp-cancel-v61529f14b]');if(ca){openAction(ca.dataset.tempCancelV61529f14b,'CANCEL');return;}const en=e.target.closest('[data-temp-end-v61529f14b]');if(en){openAction(en.dataset.tempEndV61529f14b,'END');return;}const ae=e.target.closest('[data-acting-edit-v61529f14b]');if(ae){openActing(ae.dataset.actingEditV61529f14b);return;}
      if(e.target.closest('[data-team-temp-close-v61529f14b]')){closeCreate();return;}if(e.target.closest('[data-team-temp-action-close-v61529f14b]')){closeAction();return;}if(e.target.closest('[data-team-acting-close-v61529f14b]')){closeActing();return;}
    });
    document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeCreate();closeAction();closeActing();}});
    const init=async()=>{const a=await loadAccess();if(actingOnly()&&document.querySelector('#page-team-master.active')){ensureAssignmentTabVisible();load();}return a;};
    window.addEventListener('ta:session-ready',()=>setTimeout(init,0));document.addEventListener('timeclock:effective-role-changed',()=>setTimeout(init,0));setTimeout(init,450);
  }
  window.TimeClockTemporaryAssignmentV61529F14B={load,loadAccess,hasOperationalAuthority,openCreate,openFromNotification,state,version:VERSION};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();

/* ===== FIX15G Borrow Notifications + Expiry Reminder live sync ===== */
(() => {
  "use strict";
  const VERSION="V6.15.29 FIX15G";
  const app=()=>window.TimeClockApp;
  const $=id=>document.getElementById(id);
  const state={channel:null,timer:null,seen:new Set(),observed:false};

  function isAuthFailure(error){
    const status=Number(error?.status||error?.statusCode||0);
    const raw=String(error?.message||error?.details||error?.hint||error||'');
    return status===401||/unauthorized|invalid jwt|jwt expired|token.*expired|refresh[_ ]?token/i.test(raw)||String(error?.code||'').toUpperCase()==='PGRST301';
  }
  async function ensureFreshSession(force=false){
    const a=app(),c=a?.state?.client;
    if(!c?.auth)throw new Error('SUPABASE_CLIENT_NOT_READY');
    let session=a?.state?.session||null;
    if(!session?.access_token){const {data,error}=await c.auth.getSession();if(error)throw error;session=data?.session||null;}
    if(!session?.access_token)throw Object.assign(new Error('AUTH_SESSION_REQUIRED'),{status:401});
    const expiresAt=Number(session.expires_at||0)*1000;
    if(force||(expiresAt>0&&expiresAt-Date.now()<90000)){
      const {data,error}=await c.auth.refreshSession();if(error||!data?.session?.access_token)throw error||Object.assign(new Error('AUTH_SESSION_EXPIRED'),{status:401});
      session=data.session;if(a?.state){a.state.session=session;a.state.user=session.user||null;}
    }
    if(session?.access_token&&c?.realtime?.setAuth){try{const x=c.realtime.setAuth(session.access_token);if(x?.catch)x.catch(()=>{});}catch(_){}}
    return session;
  }
  async function rpc(name,args={},retry=true){
    const c=app()?.state?.client;if(!c)throw new Error('SUPABASE_CLIENT_NOT_READY');
    await ensureFreshSession(false);const {data,error}=await c.rpc(name,args);
    if(error&&retry&&isAuthFailure(error)){await ensureFreshSession(true);return rpc(name,args,false);}
    if(error)throw error;return data;
  }
  function buttonState(){
    const b=$('teamBorrowBrowserNotificationV61529F15G');if(!b)return;
    if(!('Notification' in window)){b.textContent='🔕 Browser ไม่รองรับ';b.disabled=true;return;}
    b.disabled=false;
    if(Notification.permission==='granted'){b.textContent='🔔 แจ้งเตือนเปิดอยู่';b.classList.add('borrow-notify-enabled-v61529f15g');}
    else if(Notification.permission==='denied'){b.textContent='🔕 Browser ปิดแจ้งเตือน';b.classList.remove('borrow-notify-enabled-v61529f15g');}
    else{b.textContent='🔔 เปิดแจ้งเตือน';b.classList.remove('borrow-notify-enabled-v61529f15g');}
  }
  async function requestPermission(){
    if(!('Notification' in window))return app()?.toast?.('Browser นี้ไม่รองรับ Notification','warning');
    const permission=await Notification.requestPermission();buttonState();
    app()?.toast?.(permission==='granted'?'เปิด Browser Notification สำหรับการยืมตัวแล้ว':'ยังไม่ได้อนุญาต Browser Notification',permission==='granted'?'success':'warning');
  }
  function showBrowser(row){
    if(!row||!('Notification' in window)||Notification.permission!=='granted')return;
    try{
      const n=new Notification(`TimeClock · ${row.title||'แจ้งเตือนการยืมตัว'}`,{body:String(row.message||''),tag:`borrow-${row.notification_id||row.assignment_id||Date.now()}`});
      n.onclick=()=>{
        try{window.focus();}catch(_){}
        app()?.switchPage?.('team-master');
        setTimeout(()=>window.TimeClockTemporaryAssignmentV61529F14B?.openFromNotification?.({
          assignmentId:row.assignment_id||'',workflowFilter:row.workflow_filter||'ALL',effectiveFrom:row.effective_from||'',effectiveTo:row.effective_to||''
        }),60);
        try{n.close();}catch(_){}
      };
    }catch(_){ }
  }
  function observeRows(rows=[]){
    const list=Array.isArray(rows)?rows:[];
    if(!state.observed){list.forEach(r=>state.seen.add(String(r.notification_id||'')));state.observed=true;buttonState();return;}
    const fresh=list.filter(r=>r?.is_read===false&&!state.seen.has(String(r.notification_id||'')));
    fresh.slice().reverse().forEach(r=>{state.seen.add(String(r.notification_id||''));showBrowser(r);});
    if(fresh.length){
      const first=fresh[0];
      app()?.toast?.(fresh.length===1?String(first.title||'มีแจ้งเตือนการยืมตัวใหม่'):`มีแจ้งเตือนการยืมตัวใหม่ ${fresh.length} รายการ`,fresh.some(r=>String(r.severity).toLowerCase()==='danger')?'warning':'info');
    }
    list.forEach(r=>state.seen.add(String(r.notification_id||'')));
    buttonState();
  }
  function stop(){
    clearInterval(state.timer);state.timer=null;
    const c=app()?.state?.client;if(state.channel){try{c?.removeChannel?.(state.channel);}catch(_){}state.channel=null;}
  }
  async function setupRealtime(){
    const c=app()?.state?.client;if(!c?.channel||state.channel)return;
    try{
      const session=await ensureFreshSession(false);const uid=String(session?.user?.id||'');if(!uid)return;
      state.channel=c.channel(`borrow-notification-v61529f15g-${uid.slice(0,8)}`)
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'ta_borrow_notifications_v61529f15g',filter:`target_user_id=eq.${uid}`},()=>window.TimeClockFunctional?.loadNotifications?.())
        .subscribe(status=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){try{c.removeChannel?.(state.channel);}catch(_){}state.channel=null;}});
    }catch(e){if(!isAuthFailure(e))console.warn('Borrow notification realtime fallback to polling:',e?.message||e);}
  }
  function setupPolling(){
    clearInterval(state.timer);
    state.timer=setInterval(()=>{if(document.visibilityState==='visible')window.TimeClockFunctional?.loadNotifications?.();},60000);
  }
  async function start(){
    buttonState();
    try{await setupRealtime();}catch(_){}
    setupPolling();
    setTimeout(()=>window.TimeClockFunctional?.loadNotifications?.(),80);
  }
  window.addEventListener('ta:session-ready',()=>setTimeout(start,80));
  window.addEventListener('timeclock:auth-signed-out',stop);
  window.addEventListener('timeclock:auth-refreshed',()=>{stop();setTimeout(start,80);});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')window.TimeClockFunctional?.loadNotifications?.();});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',buttonState);else buttonState();
  window.TimeClockBorrowNotificationsV61529F15G={VERSION,state,observeRows,requestPermission,start,stop,markAllRead:()=>rpc('ta_mark_all_borrow_notifications_read_v61529f15g',{})};
})();



/* ===== FIX15I Borrow Audit / History Report ===== */
(() => {
  "use strict";
  const VERSION="V6.15.29 FIX15I";
  const app=()=>window.TimeClockApp;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const state={rows:[],summary:{},assignmentId:null,loading:false};
  const pad=n=>String(n).padStart(2,'0');
  const localIso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const today=()=>localIso(new Date());
  const addDays=(iso,n)=>{const [y,m,d]=String(iso).slice(0,10).split('-').map(Number);const x=new Date(y,m-1,d);x.setDate(x.getDate()+n);return localIso(x);};
  const fmtDate=v=>{const m=String(v||'').slice(0,10).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}/${m[2]}/${m[1]}`:String(v||'-');};
  const fmtDateTime=v=>{if(!v)return '-';try{return new Intl.DateTimeFormat('th-TH',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));}catch{return String(v);}};
  function isMissing(error){const raw=String(error?.message||error?.details||error||'');return /ta_get_borrow_audit_v61529f15i|PGRST202|function.*does not exist/i.test(raw);}
  async function rpc(name,args={}){const c=app()?.state?.client;if(!c)throw new Error('SUPABASE_CLIENT_NOT_READY');const {data,error}=await c.rpc(name,args);if(error)throw error;return data;}
  function human(error){if(isMissing(error))return 'กรุณารัน SQL FIX15I Borrow Audit ก่อนใช้งานหน้านี้';return String(app()?.humanError?.(error)||error?.message||error||'เกิดข้อผิดพลาด').replace(/^Error:\s*/,'');}
  function actionInfo(action){
    const a=String(action||'').toUpperCase();
    const map={
      CREATE:['ส่งคำขอ','create'],DIRECT_APPROVE:['สร้างและอนุมัติทันที','approve'],APPROVE:['อนุมัติ','approve'],
      REJECT:['ไม่อนุมัติ','reject'],CANCEL:['ยกเลิก','cancel'],END_EARLY:['จบก่อนกำหนด','end']
    };
    const x=map[a]||[a||'-','neutral'];return {label:x[0],tone:x[1]};
  }
  function authority(v){
    const x=String(v||'').toUpperCase();
    if(x.includes('ACTING_MANAGER'))return 'Acting Manager';
    if(x==='MANAGER')return 'Manager';
    if(x==='SOURCE_AND_DESTINATION')return 'Manager ทั้ง 2 ฝั่ง';
    if(x==='HR_ADMIN')return 'HR Admin';
    return x||'-';
  }
  function setKpis(){
    const s=state.summary||{},put=(id,v)=>{if($(id))$(id).textContent=Number(v||0).toLocaleString('th-TH');};
    put('borrowAuditKpiTotalV61529F15I',s.total);put('borrowAuditKpiCreateV61529F15I',s.create);put('borrowAuditKpiApproveV61529F15I',s.approve);put('borrowAuditKpiRejectV61529F15I',s.reject);put('borrowAuditKpiCloseV61529F15I',Number(s.cancel||0)+Number(s.end_early||0));
  }
  function render(){
    setKpis();const body=$('borrowAuditBodyV61529F15I');if(!body)return;
    const rows=Array.isArray(state.rows)?state.rows:[];
    if(!rows.length){body.innerHTML='<tr><td colspan="8" class="fc-empty">ไม่พบประวัติตามเงื่อนไข</td></tr>';}
    else body.innerHTML=rows.map(r=>{
      const a=actionInfo(r.action_type);
      const source=[r.source_org_code,r.source_team_code].filter(Boolean).join(' · ')||'-';
      const dest=[r.destination_org_code,r.destination_team_code].filter(Boolean).join(' · ')||'-';
      return `<tr>
        <td><strong>${esc(fmtDateTime(r.created_at))}</strong></td>
        <td><strong>${esc(r.emp_code||'-')}</strong><small>${esc(r.employee_name||'-')}</small></td>
        <td><span class="borrow-audit-action-v61529f15i ${esc(a.tone)}">${esc(a.label)}</span></td>
        <td><strong>${esc(source)}</strong><small>→ ${esc(dest)}</small></td>
        <td><strong>${esc(fmtDate(r.effective_from))}</strong><small>ถึง ${esc(fmtDate(r.effective_to))}</small></td>
        <td><strong>${esc(r.actor_email||'-')}</strong><small>${esc(r.requested_by_email&&r.action_type==='CREATE'?`ผู้ร้องขอ: ${r.requested_by_email}`:'')}</small></td>
        <td>${esc(authority(r.authority_type))}</td>
        <td><div class="borrow-audit-note-v61529f15i">${esc(r.note||r.assignment_note||'-')}</div></td>
      </tr>`;
    }).join('');
    const foot=$('borrowAuditFooterV61529F15I');if(foot){const total=Number(state.summary?.total||0);foot.textContent=`แสดง ${rows.length.toLocaleString('th-TH')} รายการ${total>rows.length?` จากทั้งหมด ${total.toLocaleString('th-TH')} เหตุการณ์`:''} · Audit อ่านอย่างเดียว`;}
  }
  function selectedActions(){const v=String($('borrowAuditActionV61529F15I')?.value||'ALL').toUpperCase();if(v==='ALL')return null;if(v==='CREATE')return ['CREATE','DIRECT_APPROVE'];return [v];}
  async function load(){
    if(state.loading)return;state.loading=true;
    const body=$('borrowAuditBodyV61529F15I');if(body)body.innerHTML='<tr><td colspan="8" class="fc-empty">กำลังโหลดประวัติ...</td></tr>';
    const btn=$('borrowAuditLoadV61529F15I');if(btn)btn.disabled=true;
    try{
      const data=await rpc('ta_get_borrow_audit_v61529f15i',{
        p_from:$('borrowAuditFromV61529F15I')?.value||null,
        p_to:$('borrowAuditToV61529F15I')?.value||null,
        p_search:$('borrowAuditSearchV61529F15I')?.value?.trim()||null,
        p_actions:selectedActions(),
        p_assignment_id:state.assignmentId||null,
        p_limit:1500
      });
      state.rows=Array.isArray(data?.rows)?data.rows:[];state.summary=data?.summary||{};
      const scope=$('borrowAuditScopeV61529F15I');if(scope)scope.textContent=data?.is_hr_admin===true?'HR Admin · เห็นประวัติ Borrow ทั้งหมด · Audit อ่านอย่างเดียว':'Manager / Acting · แสดงเฉพาะรายการต้นทาง/ปลายทางที่อยู่ในขอบเขต Authority · Audit อ่านอย่างเดียว';
      render();
    }catch(e){if(body)body.innerHTML=`<tr><td colspan="8" class="fc-empty">โหลดไม่สำเร็จ: ${esc(human(e))}</td></tr>`;app()?.toast?.(human(e),'error');}
    finally{state.loading=false;if(btn)btn.disabled=false;}
  }
  function open(assignmentId=null){
    state.assignmentId=assignmentId?String(assignmentId):null;
    const modal=$('teamBorrowAuditModalV61529F15I');if(!modal)return;
    if(!$('borrowAuditToV61529F15I')?.value)$('borrowAuditToV61529F15I').value=today();
    if(!$('borrowAuditFromV61529F15I')?.value)$('borrowAuditFromV61529F15I').value=addDays(today(),-90);
    const title=$('teamBorrowAuditTitleV61529F15I'),sub=$('teamBorrowAuditSubtitleV61529F15I');
    if(title)title.textContent=state.assignmentId?'Timeline รายการยืมตัว':'ประวัติการยืมตัวช่าง';
    if(sub)sub.textContent=state.assignmentId?'แสดงทุกเหตุการณ์ของรายการที่เลือก · เปลี่ยนช่วงวันที่เพื่อค้นย้อนหลังได้':'ติดตามผู้ร้องขอ ผู้อนุมัติ การยกเลิก และการจบก่อนกำหนดแบบ Audit';
    modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');load();
  }
  function close(){const modal=$('teamBorrowAuditModalV61529F15I');if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}state.assignmentId=null;}
  function csvCell(v){const s=String(v??'');return /[",\n\r]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;}
  function exportCsv(){
    if(!state.rows.length)return app()?.toast?.('ไม่มีข้อมูล Audit สำหรับ Export','warning');
    const rows=[['วันเวลา','รหัสพนักงาน','ชื่อ','เหตุการณ์','หน่วยงานต้นทาง','ทีมต้นทาง','หน่วยงานปลายทาง','ทีมปลายทาง','วันที่เริ่ม','วันที่สิ้นสุด','ผู้ดำเนินการ','Authority','ผู้ร้องขอ','เหตุผล/หมายเหตุ']];
    state.rows.forEach(r=>rows.push([fmtDateTime(r.created_at),r.emp_code,r.employee_name,actionInfo(r.action_type).label,r.source_org_code,r.source_team_code,r.destination_org_code,r.destination_team_code,fmtDate(r.effective_from),fmtDate(r.effective_to),r.actor_email,authority(r.authority_type),r.requested_by_email,r.note||r.assignment_note||'']));
    const content='\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\n');const blob=new Blob([content],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`Borrow_Audit_${today()}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);app()?.toast?.('Export Borrow Audit เรียบร้อย','success');
  }
  function bind(){
    $('teamBorrowAuditOpenV61529F15I')?.addEventListener('click',()=>open(null));
    $('borrowAuditLoadV61529F15I')?.addEventListener('click',load);$('borrowAuditExportV61529F15I')?.addEventListener('click',exportCsv);
    $('borrowAuditSearchV61529F15I')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();load();}});
    document.addEventListener('click',e=>{const h=e.target.closest('[data-borrow-audit-assignment-v61529f15i]');if(h){e.preventDefault();open(h.dataset.borrowAuditAssignmentV61529f15i||null);return;}if(e.target.closest('[data-borrow-audit-close-v61529f15i]')){close();return;}});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('teamBorrowAuditModalV61529F15I')?.classList.contains('hidden'))close();});
  }
  window.TimeClockBorrowAuditV61529F15I={VERSION,state,open,close,load,exportCsv};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();


/* ===== FIX16H · Dashboard Dual View (Overview + Daily/Cumulative) ===== */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const fmt = value => new Intl.NumberFormat('th-TH', {maximumFractionDigits:1}).format(Number(value || 0));
  const pct = (n,d) => Number(d||0) > 0 ? Math.max(0,Math.min(100,Number(n||0)/Number(d)*100)) : 0;
  const cache = new Map();
  const CACHE_TTL = 120000;
  let currentView = 'overview';
  let loadToken = 0;

  function localISO(d){
    if (window.TimeClockCalendarV61448?.localISO) return window.TimeClockCalendarV61448.localISO(d);
    const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function parseISO(s){ const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12,0,0):null; }
  function addDays(s,n){ const d=parseISO(s); if(!d)return s; d.setDate(d.getDate()+n); return localISO(d); }
  function dateList(start,end){
    const a=parseISO(start),b=parseISO(end); if(!a||!b||a>b)return [];
    const out=[]; for(let d=new Date(a);d<=b;d.setDate(d.getDate()+1)) out.push(localISO(d)); return out;
  }
  function shortDate(s){ const d=parseISO(s); return d?d.toLocaleDateString('th-TH',{day:'numeric',month:'short'}):s; }
  function longDate(s){ const d=parseISO(s); return d?d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'}):s; }
  function safe(v){ return String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  function setView(view, load=true){
    currentView = view === 'daily' ? 'daily' : 'overview';
    document.querySelectorAll('[data-dashboard-view-v616h]').forEach(btn=>{
      const active=btn.dataset.dashboardViewV616h===currentView;
      btn.classList.toggle('active',active); btn.setAttribute('aria-selected',active?'true':'false');
    });
    $('dashboardViewOverviewV616H')?.classList.toggle('hidden',currentView!=='overview');
    $('dashboardViewOverviewV616H')?.classList.toggle('active',currentView==='overview');
    $('dashboardViewDailyV616H')?.classList.toggle('hidden',currentView!=='daily');
    $('dashboardViewDailyV616H')?.classList.toggle('active',currentView==='daily');
    localStorage.setItem('tc_dashboard_view_v616h',currentView);
    if(currentView==='daily' && load) loadDailySeries(false);
  }

  function rangePreset(code){
    const now=new Date(), end=new Date(now), start=new Date(now);
    if(code==='7D') start.setDate(start.getDate()-6);
    else if(code==='15D') start.setDate(start.getDate()-14);
    else if(code==='MONTH') start.setDate(1);
    $('dashStart') && ($('dashStart').value=localISO(start));
    $('dashEnd') && ($('dashEnd').value=localISO(end));
    document.querySelectorAll('[data-dashboard-range-v616h]').forEach(b=>b.classList.toggle('active',b.dataset.dashboardRangeV616h===code));
    $('loadDashboardBtn')?.click();
  }

  async function rpcOverview(date,zone,department){
    const client=window.TimeClockApp?.state?.client; if(!client) throw new Error('Supabase client not initialized');
    const orgId=window.TimeClockApp?.selectedOrgIdV616M?.('dashDepartment') || null;
    const legacyDept=window.TimeClockApp?.selectedLegacyDepartmentV616M?.('dashDepartment') || (orgId?null:department||null);
    const key=[date,zone||'',orgId||legacyDept||''].join('|');
    const hit=cache.get(key); if(hit && Date.now()-hit.at<CACHE_TTL) return hit.data;
    if(orgId){
      const res=await client.rpc('ta_get_dashboard_overview_v616m',{p_start_date:date,p_end_date:date,p_zone:zone||null,p_department:null,p_org_id:orgId});
      if(res.error) throw res.error;
      const data=Array.isArray(res.data)?(res.data[0]||{}):(res.data||{}); cache.set(key,{at:Date.now(),data}); return data;
    }
    const args={p_start_date:date,p_end_date:date,p_zone:zone||null,p_department:legacyDept};
    const names=['ta_get_dashboard_overview_v61463','ta_get_dashboard_overview_v650','ta_get_dashboard_overview_v640','ta_get_dashboard_overview'];
    let lastError=null;
    for(const name of names){
      const res=await client.rpc(name,args);
      if(!res.error){ const data=Array.isArray(res.data)?(res.data[0]||{}):(res.data||{}); cache.set(key,{at:Date.now(),data}); return data; }
      lastError=res.error;
      if(!window.TimeClockShiftAPI?.missingFunction?.(res.error)) break;
    }
    throw lastError || new Error('Dashboard RPC failed');
  }

  async function mapPool(items,limit,worker){
    const out=new Array(items.length); let cursor=0;
    async function run(){ while(true){ const i=cursor++; if(i>=items.length) return; out[i]=await worker(items[i],i); } }
    await Promise.all(Array.from({length:Math.min(limit,items.length)},run)); return out;
  }

  function seriesRow(date,d){
    const total=Number(d.total_rows||0), complete=Number(d.complete_time_rows||0), absent=Number(d.absent_rows||0), late=Number(d.late_rows||0), early=Number(d.early_leave_rows||0);
    return {date,total,employees:Number(d.total_employees||0),complete,completeRate:pct(complete,total),absent,late,early,issues:absent+late+early,missing:Number(d.missing_in_rows||0)+Number(d.missing_out_rows||0),paid:Number(d.paid_work_hours||0),regular:Number(d.regular_hours||0),ot:Number(d.overtime_hours||0),waiting:Number(d.waiting_hours||0),offday:Number(d.offday_work_hours||0)};
  }

  function cumulative(rows){
    let t=0,c=0,a=0,l=0,e=0,ot=0,paid=0,issues=0;
    return rows.map(r=>{t+=r.total;c+=r.complete;a+=r.absent;l+=r.late;e+=r.early;ot+=r.ot;paid+=r.paid;issues+=r.issues;return {...r,cumTotal:t,cumComplete:c,cumCompleteRate:pct(c,t),cumAbsent:a,cumLate:l,cumEarly:e,cumOT:ot,cumPaid:paid,cumIssues:issues};});
  }

  function lineChart(rows){
    if(!rows.length) return '<div class="dashboard-daily-empty-v616h">ไม่มีข้อมูลในช่วงวันที่</div>';
    const W=760,H=230,pL=46,pR=18,pT=16,pB=38,plotW=W-pL-pR,plotH=H-pT-pB;
    const x=i=>pL+(rows.length===1?plotW/2:(i/(rows.length-1))*plotW), y=v=>pT+(100-Math.max(0,Math.min(100,v)))/100*plotH;
    const pts=key=>rows.map((r,i)=>`${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ');
    const grid=[0,25,50,75,100].map(v=>`<g><line x1="${pL}" y1="${y(v)}" x2="${W-pR}" y2="${y(v)}" class="grid"/><text x="${pL-9}" y="${y(v)+4}" text-anchor="end">${v}%</text></g>`).join('');
    const labelIdx=[0,Math.floor((rows.length-1)/2),rows.length-1].filter((v,i,a)=>a.indexOf(v)===i);
    const labels=labelIdx.map(i=>`<text x="${x(i)}" y="${H-10}" text-anchor="middle">${safe(shortDate(rows[i].date))}</text>`).join('');
    const dots=rows.map((r,i)=>`<circle cx="${x(i)}" cy="${y(r.completeRate)}" r="2.5" class="daily-dot"><title>${safe(longDate(r.date))}: ${r.completeRate.toFixed(1)}%</title></circle>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="อัตราลงเวลาครบรายวันและสะสม"><g class="axis">${grid}${labels}</g><polyline points="${pts('cumCompleteRate')}" class="cum-line"/><polyline points="${pts('completeRate')}" class="daily-line"/>${dots}</svg>`;
  }

  function renderIssueBars(rows){
    const host=$('dashboardDailyIssueBarsV616H'); if(!host)return;
    if(!rows.length){host.innerHTML='<div class="dashboard-daily-empty-v616h">ไม่มีข้อมูล</div>';return;}
    const max=Math.max(1,...rows.map(r=>r.issues));
    host.innerHTML=rows.map(r=>{ const ah=r.absent/max*100,lh=r.late/max*100,eh=r.early/max*100; return `<div class="issue-day-v616h" title="${safe(longDate(r.date))} • ขาด ${fmt(r.absent)} • สาย ${fmt(r.late)} • กลับก่อน ${fmt(r.early)}"><div class="issue-stack-v616h"><i class="early" style="height:${eh}%"></i><i class="late" style="height:${lh}%"></i><i class="absent" style="height:${ah}%"></i></div><span>${safe(shortDate(r.date))}</span></div>`; }).join('');
  }

  function renderHeatmap(rows){
    const host=$('dashboardDailyHeatmapV616H'); if(!host)return;
    host.innerHTML=rows.length?rows.map(r=>{ const cls=r.total===0?'empty':r.completeRate>=90?'good':r.completeRate>=75?'warn':'bad'; return `<div class="heat-day-v616h ${cls}" title="${safe(longDate(r.date))} • ลงเวลาครบ ${r.completeRate.toFixed(1)}% • ${fmt(r.complete)}/${fmt(r.total)} รายการ"><span>${parseISO(r.date)?.getDate()||''}</span><strong>${r.total?`${r.completeRate.toFixed(0)}%`:'—'}</strong><small>${safe(shortDate(r.date))}</small></div>`;}).join(''):'<div class="dashboard-daily-empty-v616h">ไม่มีข้อมูล</div>';
  }

  function renderDaily(rows,originalStart,originalEnd,displayStart){
    const cumulativeRows=cumulative(rows), latest=cumulativeRows[cumulativeRows.length-1]||null;
    if($('dashboardDailyRangeV616H')) $('dashboardDailyRangeV616H').textContent = rows.length?`${longDate(rows[0].date)} – ${longDate(rows[rows.length-1].date)}`:'—';
    if($('dashboardDailyLoadStateV616H')) $('dashboardDailyLoadStateV616H').textContent=`${rows.length} วัน • อัปเดต ${new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}`;
    const notice=$('dashboardDailyNoticeV616H');
    if(notice){ const clipped=displayStart!==originalStart; notice.classList.toggle('hidden',!clipped); notice.textContent=clipped?`ช่วงที่เลือกยาวเกิน 31 วัน • มุมมองรายวันแสดง 31 วันล่าสุด (${longDate(displayStart)} – ${longDate(originalEnd)}) เพื่อให้โหลดเร็วและอ่านแนวโน้มได้ชัดเจน`:''; }
    const kpis=$('dashboardDailyKpisV616H');
    if(kpis){
      if(!latest) kpis.innerHTML='<div class="dashboard-daily-empty-v616h">ไม่มีข้อมูลรายวัน</div>';
      else kpis.innerHTML=[
        ['วัน-พนักงาน',latest.total,'รายการ',`วันที่ ${longDate(latest.date)}`,'neutral'],
        ['ลงเวลาครบ',latest.completeRate.toFixed(1),'%',`${fmt(latest.complete)} รายการ`,'good'],
        ['ขาดงาน',latest.absent,'รายการ','ตามเกณฑ์ Attendance','bad'],
        ['มาสาย',latest.late,'รายการ','1–29 นาที','warn'],
        ['กลับก่อน',latest.early,'รายการ','ก่อนสิ้นสุดกะ','warn'],
        ['OT',latest.ot,'ชม.','ของวันล่าสุด','accent']
      ].map(x=>`<article class="daily-kpi-v616h ${x[4]}"><span>${x[0]}</span><div><strong>${fmt(x[1])}</strong><em>${x[2]}</em></div><small>${x[3]}</small></article>`).join('');
    }
    if($('dashboardDailyRateChartV616H')) $('dashboardDailyRateChartV616H').innerHTML=lineChart(cumulativeRows);
    if($('dashboardDailyLatestRateV616H')) $('dashboardDailyLatestRateV616H').textContent=latest?`${latest.completeRate.toFixed(1)}% ล่าสุด`:'—';
    if($('dashboardDailyCumulativeV616H')) $('dashboardDailyCumulativeV616H').innerHTML=latest?[
      ['ลงเวลาครบสะสม',latest.cumComplete,'รายการ',`${latest.cumCompleteRate.toFixed(1)}% ของ ${fmt(latest.cumTotal)}`,'good'],
      ['ขาดงานสะสม',latest.cumAbsent,'รายการ','รวมตามวัน','bad'],
      ['มาสายสะสม',latest.cumLate,'รายการ','รวมตามวัน','warn'],
      ['กลับก่อนสะสม',latest.cumEarly,'รายการ','รวมตามวัน','warn'],
      ['OT สะสม',latest.cumOT,'ชม.','ช่วงวันที่ที่แสดง','accent'],
      ['ชั่วโมงสุทธิสะสม',latest.cumPaid,'ชม.','หลังหักพัก/รอคอย','neutral']
    ].map(x=>`<div class="cum-card-v616h ${x[4]}"><span>${x[0]}</span><strong>${fmt(x[1])}<em>${x[2]}</em></strong><small>${x[3]}</small></div>`).join(''):'<div class="dashboard-daily-empty-v616h">ไม่มีข้อมูล</div>';
    renderIssueBars(cumulativeRows); renderHeatmap(cumulativeRows);
    const body=$('dashboardDailyTableBodyV616H');
    if(body) body.innerHTML=cumulativeRows.length?cumulativeRows.map(r=>`<tr><td><strong>${safe(longDate(r.date))}</strong></td><td class="text-right">${fmt(r.total)}</td><td class="text-right"><span class="daily-rate-pill-v616h ${r.completeRate>=90?'good':r.completeRate>=75?'warn':'bad'}">${r.completeRate.toFixed(1)}%</span></td><td class="text-right">${fmt(r.absent)}</td><td class="text-right">${fmt(r.late)}</td><td class="text-right">${fmt(r.early)}</td><td class="text-right">${fmt(r.ot)}</td><td class="text-right">${r.cumCompleteRate.toFixed(1)}%</td><td class="text-right">${fmt(r.cumIssues)}</td><td class="text-right">${fmt(r.cumOT)}</td></tr>`).join(''):'<tr><td colspan="10" class="empty-cell">ไม่พบข้อมูลรายวัน</td></tr>';
  }

  async function loadDailySeries(force=false){
    if(currentView!=='daily') return;
    const start=$('dashStart')?.value,end=$('dashEnd')?.value,zone=$('dashZone')?.value||'',department=$('dashDepartment')?.value||'';
    if(!start||!end||start>end){ window.TimeClockApp?.toast?.('กรุณาเลือกช่วงวันที่ Dashboard ให้ถูกต้อง','error'); return; }
    let dates=dateList(start,end); if(!dates.length)return;
    let displayStart=start;
    if(dates.length>31){dates=dates.slice(-31);displayStart=dates[0];}
    const requestKey=[start,end,displayStart,zone,department].join('|');
    if(!force && $('dashboardViewDailyV616H')?.dataset.loadedKey===requestKey) return;
    const token=++loadToken;
    $('dashboardDailyLoadStateV616H') && ($('dashboardDailyLoadStateV616H').textContent='กำลังโหลดข้อมูลรายวัน…');
    $('dashboardDailyRateChartV616H') && ($('dashboardDailyRateChartV616H').innerHTML='<div class="dashboard-daily-loading-v616h"><i></i><span>กำลังสรุปข้อมูลรายวัน</span></div>');
    try{
      const rows=await mapPool(dates,4,async date=>seriesRow(date,await rpcOverview(date,zone,department)));
      if(token!==loadToken)return;
      $('dashboardViewDailyV616H').dataset.loadedKey=requestKey;
      renderDaily(rows,start,end,displayStart);
    }catch(err){
      console.error('FIX16H daily dashboard:',err);
      if(token!==loadToken)return;
      $('dashboardDailyLoadStateV616H') && ($('dashboardDailyLoadStateV616H').textContent='โหลดไม่สำเร็จ');
      $('dashboardDailyRateChartV616H') && ($('dashboardDailyRateChartV616H').innerHTML='<div class="dashboard-daily-empty-v616h">ไม่สามารถโหลดข้อมูลรายวันได้</div>');
      window.TimeClockApp?.toast?.(window.TimeClockApp?.humanError?.(err)||err?.message||'โหลด Dashboard รายวันไม่สำเร็จ','error');
    }
  }

  function bind(){
    document.querySelectorAll('[data-dashboard-view-v616h]').forEach(btn=>btn.addEventListener('click',()=>setView(btn.dataset.dashboardViewV616h,true)));
    document.querySelectorAll('[data-dashboard-range-v616h]').forEach(btn=>btn.addEventListener('click',()=>rangePreset(btn.dataset.dashboardRangeV616h)));
    ['dashStart','dashEnd','dashZone','dashDepartment'].forEach(id=>$(id)?.addEventListener('change',()=>{ $('dashboardViewDailyV616H')?.removeAttribute('data-loaded-key'); document.querySelectorAll('[data-dashboard-range-v616h]').forEach(b=>b.classList.remove('active')); }));
    $('loadDashboardBtn')?.addEventListener('click',()=>{ $('dashboardViewDailyV616H')?.removeAttribute('data-loaded-key'); });
    document.addEventListener('timeclock:dashboard-rendered-v616h',()=>{ if(currentView==='daily') loadDailySeries(true); });
    setView(localStorage.getItem('tc_dashboard_view_v616h')||'overview',false);
  }
  document.addEventListener('DOMContentLoaded',bind);
})();

;document.documentElement.dataset.orgCanonicalUi='V6.15.29-FIX16Q';
