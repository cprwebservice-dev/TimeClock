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
