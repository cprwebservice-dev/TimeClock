(() => {
  "use strict";
  const VERSION="6.1.0";
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

  async function runImport(){
    if(!state.rows.length||!state.stats)return app()?.toast?.("กรุณาตรวจสอบไฟล์ก่อนนำเข้า","error");if(state.importing)return;
    if(!confirm(`ยืนยันนำเข้าข้อมูลลงเวลา ${fmt(state.rows.length)} รายการ?`))return;
    state.importing=true;status("กำลังนำเข้าข้อมูล","working");$("mobiletaImportBtn").disabled=true;$("mobiletaPreviewBtn").disabled=true;$("mobiletaProgressPanel")?.classList.remove("hidden");setProgress(1,"กำลังเปิดรายการนำเข้า...");
    let inserted=0,existingDup=0,unmatched=0,uploaded=0;
    try{
      const batch=await rpc("ta_begin_mobileta_import",{p_file_name:state.file.name,p_file_size:state.stats.fileSize,p_raw_rows:state.stats.rawRows,p_valid_rows:state.stats.validRows,p_file_duplicate_rows:state.stats.fileDuplicates,p_min_date:state.stats.minDate,p_max_date:state.stats.maxDate,p_note:$("mobiletaImportNote")?.value||null});
      state.batchId=typeof batch==="string"?batch:(batch?.batch_id||batch?.id);if(!state.batchId)throw new Error("ไม่พบ Batch ID จากระบบ");
      if(state.errors.length){await rpc("ta_log_mobileta_import_errors",{p_batch_id:state.batchId,p_errors:state.errors.slice(0,1000)})}
      const chunkSize=2000,total=state.rows.length;
      for(let start=0;start<total;start+=chunkSize){
        const chunk=state.rows.slice(start,start+chunkSize);const result=await rpc("ta_import_mobileta_chunk",{p_batch_id:state.batchId,p_rows:chunk});const r=Array.isArray(result)?result[0]:result||{};
        uploaded+=chunk.length;inserted+=Number(r.inserted_rows||0);existingDup+=Number(r.duplicate_rows||0);unmatched+=Number(r.unmatched_rows||0);
        const pct=5+(uploaded/total)*85;setProgress(pct,`ส่งข้อมูล ${fmt(uploaded)} จาก ${fmt(total)} รายการ`);setText("mobiletaUploadedRows",fmt(uploaded));setText("mobiletaInsertedRows",fmt(inserted));setText("mobiletaExistingDuplicates",fmt(existingDup));setText("mobiletaUnmatchedRows",fmt(unmatched));
      }
      setProgress(92,"กำลังกำหนด IN/OUT และประมวลผล Attendance...");const finish=await rpc("ta_finish_mobileta_import",{p_batch_id:state.batchId,p_rebuild_attendance:!!$("mobiletaRebuildAttendance")?.checked});const r=Array.isArray(finish)?finish[0]:finish||{};setProgress(100,"นำเข้าข้อมูลเรียบร้อย");renderResult(r,false);status("นำเข้าข้อมูลสำเร็จ","ready");app().state.attendance=[];app().state.review=[];app()?.toast?.("นำเข้าข้อมูลลงเวลา MobileTA เรียบร้อย","success");await loadHistory();
    }catch(err){
      if(state.batchId){try{await rpc("ta_cancel_mobileta_import",{p_batch_id:state.batchId,p_reason:app()?.humanError?.(err)||String(err),p_rollback:true})}catch(_){}}
      renderResult({error:app()?.humanError?.(err)||String(err)},true);status("นำเข้าไม่สำเร็จ","error");app()?.toast?.(app()?.humanError?.(err)||String(err),"error");
    }finally{state.importing=false;$("mobiletaImportBtn").disabled=!state.rows.length;$("mobiletaPreviewBtn").disabled=false}
  }

  function renderResult(r,isError){
    const el=$("mobiletaResultPanel");if(!el)return;if(isError){el.innerHTML=`<div class="mobileta-result-card error"><h3>นำเข้าข้อมูลไม่สำเร็จ</h3><p>${esc(r.error||"เกิดข้อผิดพลาด")}</p><small>ระบบพยายาม Rollback ข้อมูลของ Batch นี้แล้ว</small></div>`;return}
    el.innerHTML=`<div class="mobileta-result-card"><h3>นำเข้าข้อมูลลงเวลาเรียบร้อย</h3><p>ระบบกำหนดประเภท IN/OUT จากลำดับเวลาและกะกลางคืนที่จัดไว้ พร้อมอัปเดตรายละเอียดเวลาทำงานตามตัวเลือก</p><div class="mobileta-result-grid"><div><span>เพิ่มใหม่</span><strong>${fmt(r.inserted_rows)}</strong></div><div><span>ซ้ำในฐานข้อมูล</span><strong>${fmt(r.existing_duplicate_rows)}</strong></div><div><span>ไม่พบพนักงาน</span><strong>${fmt(r.unmatched_employee_rows)}</strong></div><div><span>Attendance ลบ/สร้าง</span><strong>${fmt(r.rebuild_deleted_rows)} / ${fmt(r.rebuild_inserted_rows)}</strong></div><div><span>ช่วงวันที่</span><strong>${fmtDate(r.min_date)}–${fmtDate(r.max_date)}</strong></div></div></div>`;
  }

  async function loadHistory(){
    const body=$("mobiletaHistoryBody");if(!body||!client())return;body.innerHTML='<tr><td colspan="10" class="table-empty">กำลังโหลด...</td></tr>';
    try{const data=await rpc("ta_get_mobileta_import_history",{p_limit:30});const rows=Array.isArray(data)?data:[];body.innerHTML=rows.length?rows.map(r=>`<tr><td>${fmtDateTime(r.created_at)}</td><td><strong>${esc(r.file_name)}</strong><small style="display:block;color:var(--slate-500)">${fmt(Number(r.file_size||0)/1024)} KB</small></td><td>${fmtDate(r.min_date)}–${fmtDate(r.max_date)}</td><td>${fmt(r.raw_rows)}</td><td>${fmt(r.inserted_rows)}</td><td>${fmt(Number(r.file_duplicate_rows||0)+Number(r.existing_duplicate_rows||0))}</td><td>${fmt(r.unmatched_employee_rows)}</td><td>${r.rebuild_attendance?'<span class="mobileta-row-ok">ประมวลผลแล้ว</span>':'-'}</td><td><span class="mobileta-status-pill ${r.status==='COMPLETED'?'ready':r.status==='FAILED'||r.status==='CANCELLED'?'error':'working'}">${esc(r.status)}</span></td><td>${esc(r.created_by_email||'-')}</td></tr>`).join(""):'<tr><td colspan="10" class="table-empty">ยังไม่มีประวัติการนำเข้า</td></tr>'}
    catch(err){body.innerHTML=`<tr><td colspan="10" class="table-empty">${esc(app()?.humanError?.(err)||String(err))}</td></tr>`}
  }

  function init(){
    $("mobiletaPreviewBtn")?.addEventListener("click",parseFile);$("mobiletaImportBtn")?.addEventListener("click",runImport);$("mobiletaResetBtn")?.addEventListener("click",reset);$("mobiletaDownloadErrorsBtn")?.addEventListener("click",downloadErrors);$("mobiletaRefreshHistoryBtn")?.addEventListener("click",loadHistory);$("mobiletaFile")?.addEventListener("change",()=>{state.rows=[];state.errors=[];state.stats=null;$("mobiletaImportBtn").disabled=true;status($("mobiletaFile")?.files?.[0]?.name||"ยังไม่ได้เลือกไฟล์","neutral")});
    document.querySelectorAll('[data-page="admin-time-import"]').forEach(b=>b.addEventListener("click",()=>{setTimeout(()=>{setText("pageTitle","นำเข้าข้อมูลลงเวลา");setText("pageSubtitle","นำเข้า Text File MobileTA ตรวจข้อมูลซ้ำ และประมวลผล Attendance");loadHistory()},0)}));
    document.querySelectorAll('[data-admin-open="admin-time-import"]').forEach(b=>b.addEventListener("click",()=>{setTimeout(()=>{setText("pageTitle","นำเข้าข้อมูลลงเวลา");setText("pageSubtitle","นำเข้า Text File MobileTA ตรวจข้อมูลซ้ำ และประมวลผล Attendance");loadHistory()},0)}));
    window.TimeClockMobileTAImport={loadHistory,parseFile,version:VERSION};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
