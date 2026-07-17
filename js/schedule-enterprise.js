(() => {
  "use strict";
  const selected = new Set();
  let clipboard = [];
  const app = () => window.TimeClockApp;
  const wrap = () => document.getElementById("scheduleTableWrap");
  const $ = id => document.getElementById(id);

  function keyOf(cell) { return `${cell.dataset.emp}|${cell.dataset.date}`; }
  function getCell(key) {
    const [emp,date] = key.split("|");
    return wrap()?.querySelector(`[data-schedule-cell][data-emp="${CSS.escape(emp)}"][data-date="${CSS.escape(date)}"]`);
  }
  function selectedRows() {
    return [...selected].map(key => {
      const [emp_code, work_date] = key.split("|");
      const row = app()?.state?.schedule?.find(r => r.emp_code === emp_code && String(r.work_date).slice(0,10) === work_date);
      return { key, emp_code, work_date, row };
    }).filter(x => x.row);
  }
  function refreshSelectionUI() {
    wrap()?.querySelectorAll(".schedule-data-cell.cell-selected").forEach(td => td.classList.remove("cell-selected"));
    selected.forEach(key => getCell(key)?.closest("td")?.classList.add("cell-selected"));
    const count = selected.size;
    if ($("scheduleSelectionCount")) $("scheduleSelectionCount").textContent = count ? `เลือกแล้ว ${count.toLocaleString("th-TH")} ช่อง` : "ยังไม่ได้เลือกช่อง";
    if ($("scheduleClipboardInfo")) $("scheduleClipboardInfo").textContent = clipboard.length ? `คลิปบอร์ด ${clipboard.length} กะ` : "เลือกช่องแล้วกดกะด่วน";
  }
  function clearSelection() { selected.clear(); refreshSelectionUI(); }
  function toggleCell(cell, additive) {
    const key = keyOf(cell);
    if (!additive && !selected.has(key)) selected.clear();
    selected.has(key) ? selected.delete(key) : selected.add(key);
    refreshSelectionUI();
  }
  function selectByEmp(emp) {
    selected.clear();
    wrap()?.querySelectorAll(`[data-schedule-cell][data-emp="${CSS.escape(emp)}"]`).forEach(c => selected.add(keyOf(c)));
    refreshSelectionUI();
  }
  function selectByDate(date) {
    selected.clear();
    wrap()?.querySelectorAll(`[data-schedule-cell][data-date="${CSS.escape(date)}"]`).forEach(c => selected.add(keyOf(c)));
    refreshSelectionUI();
  }

  async function bulkAssign(shiftCode, confirmNow = false) {
    const rows = selectedRows();
    if (!rows.length) return app()?.toast("กรุณาเลือกช่องกะก่อน", "error");
    app().showLoading(`กำลังบันทึกกะ ${shiftCode} จำนวน ${rows.length} รายการ...`);
    try {
      const payload = rows.map(x => ({ emp_code:x.emp_code, work_date:x.work_date, shift_code:shiftCode, note:"กำหนดกะแบบหลายรายการ" }));
      const { error } = await app().state.client.rpc("ta_assign_shifts_bulk", {
        p_rows: payload,
        p_change_reason: "กำหนดกะจากตารางรายเดือนแบบหลายรายการ",
        p_confirm_now: confirmNow
      });
      if (error) throw error;
      app().toast(`บันทึกกะ ${shiftCode} จำนวน ${rows.length} รายการแล้ว`, "success");
      clearSelection();
      await app().loadSchedule();
    } catch (err) { app().toast(app().humanError(err), "error"); }
    finally { app().hideLoading(); }
  }

  function copySelection() {
    const rows = selectedRows();
    if (!rows.length) return app()?.toast("กรุณาเลือกช่องที่ต้องการคัดลอก", "error");
    clipboard = rows.map(x => x.row.effective_shift_code || x.row.auto_shift_code || "D");
    wrap()?.querySelectorAll(".cell-copied").forEach(x => x.classList.remove("cell-copied"));
    rows.forEach(x => getCell(x.key)?.closest("td")?.classList.add("cell-copied"));
    refreshSelectionUI();
    app().toast(`คัดลอก ${clipboard.length} กะแล้ว`, "success");
  }

  async function pasteSelection() {
    const targets = selectedRows();
    if (!clipboard.length) return app()?.toast("ยังไม่มีกะในคลิปบอร์ด", "error");
    if (!targets.length) return app()?.toast("กรุณาเลือกช่องปลายทาง", "error");
    app().showLoading(`กำลังวางกะ ${targets.length} รายการ...`);
    try {
      const payload = targets.map((x,i) => ({ emp_code:x.emp_code, work_date:x.work_date, shift_code:clipboard[i % clipboard.length], note:"วางกะจากคลิปบอร์ด" }));
      const { error } = await app().state.client.rpc("ta_assign_shifts_bulk", {
        p_rows: payload,
        p_change_reason: "คัดลอกและวางกะจากตารางรายเดือน",
        p_confirm_now: false
      });
      if (error) throw error;
      app().toast(`วางกะ ${targets.length} รายการแล้ว`, "success");
      clearSelection();
      await app().loadSchedule();
    } catch (err) { app().toast(app().humanError(err), "error"); }
    finally { app().hideLoading(); }
  }

  async function confirmSelected() {
    const rows = selectedRows();
    if (!rows.length) return app()?.toast("กรุณาเลือกกะที่ต้องการยืนยัน", "error");
    if (!confirm(`ยืนยันกะเฉพาะ ${rows.length} ช่องที่เลือก?`)) return;
    app().showLoading("กำลังยืนยันกะที่เลือก...");
    try {
      for (const x of rows) {
        const shiftCode = x.row.assigned_shift_code || x.row.effective_shift_code || x.row.auto_shift_code;
        if (!shiftCode) continue;
        const { error } = await app().state.client.rpc("ta_assign_shift_single", {
          p_emp_code: x.emp_code,
          p_work_date: x.work_date,
          p_shift_code: shiftCode,
          p_note: "ยืนยันกะจากตารางรายเดือน",
          p_change_reason: "ยืนยันกะเฉพาะช่องที่เลือก",
          p_confirm_now: true
        });
        if (error) throw error;
      }
      app().toast(`ยืนยันกะ ${rows.length} ช่องเรียบร้อย`, "success");
      clearSelection();
      await app().loadSchedule();
    } catch (err) { app().toast(app().humanError(err), "error"); }
    finally { app().hideLoading(); }
  }

  function bind() {
    document.addEventListener("timeclock:schedule-rendered", () => { selected.clear(); refreshSelectionUI(); });
    wrap()?.addEventListener("click", e => {
      const emp = e.target.closest("[data-select-emp]");
      if (emp) { e.preventDefault(); e.stopPropagation(); selectByEmp(emp.dataset.selectEmp); return; }
      const date = e.target.closest("[data-select-date]");
      if (date) { e.preventDefault(); e.stopPropagation(); selectByDate(date.dataset.selectDate); return; }
      const cell = e.target.closest("[data-schedule-cell]");
      if (cell) { e.preventDefault(); e.stopPropagation(); toggleCell(cell, e.ctrlKey || e.metaKey); }
    }, true);
    wrap()?.addEventListener("dblclick", e => {
      const cell = e.target.closest("[data-schedule-cell]");
      if (!cell) return;
      e.preventDefault(); e.stopPropagation(); app()?.openAssignment(cell.dataset.emp, cell.dataset.date);
    }, true);
    document.querySelectorAll("[data-quick-shift]").forEach(b => b.addEventListener("click", () => bulkAssign(b.dataset.quickShift)));
    $("scheduleCopyBtn")?.addEventListener("click", copySelection);
    $("schedulePasteBtn")?.addEventListener("click", pasteSelection);
    $("scheduleClearSelectionBtn")?.addEventListener("click", clearSelection);
    $("scheduleConfirmSelectedBtn")?.addEventListener("click", confirmSelected);
    document.addEventListener("keydown", e => {
      const scheduleVisible = document.getElementById("page-schedule")?.classList.contains("active");
      if (!scheduleVisible) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") { e.preventDefault(); copySelection(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") { e.preventDefault(); pasteSelection(); }
      if (e.key === "Escape") clearSelection();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind); else bind();
})();
