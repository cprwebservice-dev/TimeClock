"use strict";

    const APP_CONFIG_KEY = "ta_supabase_config_v1";
    const state = {
      client: null,
      session: null,
      user: null,
      profile: null,
      filters: { zones: [], departments: [], employees: [], shifts: [] },
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
      ["dashZone","attZone","scheduleZone","reportZone"].forEach(id => fillSelect(id, state.filters.zones, "ทุกพื้นที่"));
      ["dashDepartment","attDepartment","scheduleDepartment","reportDepartment"].forEach(id => fillSelect(id, state.filters.departments, "ทุกหน่วยงาน"));
      fillShiftSelect();
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
        const { data, error } = await state.client.rpc("ta_get_attendance_detail", {
          p_start_date: val("attStart"), p_end_date: val("attEnd"), p_zone: val("attZone") || null,
          p_department: val("attDepartment") || null, p_emp_codes: null, p_attendance_statuses: statuses, p_schedule_statuses: null
        });
        if (error) throw error;
        state.attendance = data || [];
        renderAttendance();
      } catch (err) { toast(humanError(err), "error"); }
      finally { hideLoading(); }
    }

    function renderAttendance() {
      setText("attendanceCount", `${formatNumber(state.attendance.length)} รายการ`);
      $("attendanceBody").innerHTML = state.attendance.length ? state.attendance.map(r => {
        const code = attendanceShiftCode(r);
        return `<tr data-attendance-row="1" data-emp="${safe(r.emp_code)}" data-date="${safe(String(r.work_date).slice(0,10))}"><td class="nowrap">${formatDate(r.work_date)}</td><td>${safe(r.emp_code)}</td><td class="nowrap">${safe(r.full_name)}</td><td>${safe(r.department)}</td><td>${safe(r.zone)}</td><td class="nowrap">${formatTime(attendanceShiftTime(r,"start"))}</td><td class="nowrap">${formatTime(attendanceShiftTime(r,"end"))}</td><td>${badge(code, shiftBadgeClass(code))}</td><td>${formatTime(r.actual_in_at || r.first_in)}</td><td>${formatTime(r.actual_out_at || r.last_out)}</td><td class="text-right">${minutesToHours(r.net_work_minutes)}</td><td class="text-right">${formatNumber(r.late_minutes)}</td><td class="text-right">${formatNumber(r.early_leave_minutes)}</td><td>${badge(attendanceLabel(r.attendance_result || r.attendance_status), statusBadgeClass(r.attendance_result || r.attendance_status))}</td></tr>`;
      }).join("") : emptyRow(14);
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
      const headers = ["วันที่","รหัสพนักงาน","ชื่อ-นามสกุล","หน่วยงาน","พื้นที่","เวลาเริ่มกะ","เวลาสิ้นสุดกะ","กะ","เวลาเข้า","เวลาออก","ชั่วโมงสุทธิ","มาสาย(นาที)","กลับก่อน(นาที)","สถานะ"];
      const rows = state.attendance.map(r => [formatDate(r.work_date),r.emp_code,r.full_name,r.department,r.zone,formatTime(attendanceShiftTime(r,"start")),formatTime(attendanceShiftTime(r,"end")),attendanceShiftCode(r),formatTime(r.actual_in_at||r.first_in),formatTime(r.actual_out_at||r.last_out),minutesToHours(r.net_work_minutes),r.late_minutes||0,r.early_leave_minutes||0,attendanceLabel(r.attendance_result||r.attendance_status)]);
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
        dashboard:["Dashboard","ภาพรวมการลงเวลาและการจัดกะ"], attendance:["รายละเอียดเวลาทำงาน","ตรวจเวลาเข้า–ออกและผลการคำนวณ"], schedule:["ปฏิทินจัดกะ","จัดกะล่วงหน้าได้ทุกวัน รวมวันหยุดประจำสัปดาห์และวันหยุดนักขัตฤกษ์"], review:["รายการรอตรวจสอบ","ตรวจสอบกะและเวลาที่ผิดปกติ"], report:["ศูนย์รายงาน","สร้างและส่งออกรายงานจากข้อมูล Time-Clock"],
        "admin-center":["HR Admin Center","ศูนย์บริหารและตรวจสอบสถานะระบบ"], "admin-shifts":["ตั้งค่ากะทำงาน","จัดการข้อมูลกะมาตรฐาน"], "system-settings":["System Settings","ตั้งค่าระบบและ Developer Console"], "admin-holidays":["วันหยุดนักขัตฤกษ์","จัดการวันหยุดและประมวลผล Attendance"], "admin-users":["User และ Scope","กำหนดสิทธิ์ผู้ใช้งาน"], "admin-import":["นำเข้าพนักงาน","ตรวจสอบและนำเข้าข้อมูล CSV"]
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
      attendanceLabel,
      downloadFile,
      applyProfile,
      switchPage
    });

    document.addEventListener("DOMContentLoaded", boot);
