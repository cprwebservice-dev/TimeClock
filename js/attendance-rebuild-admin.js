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
