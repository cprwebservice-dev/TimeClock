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
      for(const key of selected){ const [emp,date]=key.split("|"); const {error}=await a.state.client.rpc("ta_assign_shift_single",{p_emp_code:emp,p_work_date:date,p_shift_code:shift,p_note:"กำหนดจาก Review Center",p_change_reason:"Bulk assign จาก Review Center",p_confirm_now:confirmNow}); if(error) throw error; done++; }
      selected.clear(); a.toast(`บันทึกกะสำเร็จ ${done.toLocaleString("th-TH")} รายการ`,"success"); document.getElementById("loadReviewBtn")?.click();
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
    new MutationObserver(()=>{updateKpis();render();}).observe(body,{childList:true});
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
