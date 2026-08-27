(function(){
  "use strict";
  const VERSION="6.14.99";
  const CFG_KEY="ta_supabase_config_v1";
  const SESSION_KEY="ta_employee_portal_session_v61482";
  const TEAM_KEY="ta_employee_portal_team_v61482";
  const DEFAULT={url:"https://lryojaccbbbgdbpjstld.supabase.co",key:"sb_publishable_xxYLeNtxgeWoE0o5GNOwDg_QXfiFy_Y"};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  let client=null,me=null,calendar=[],requests=[],notifications=[],scheduleMonth=new Date();let requestFilter="";
  let editingRequestId=null,dayoffPickerMonth=new Date(),dayoffRows=[],dayoffBalance=null,dayoffSource="",dayoffTarget="";
  const urlTeam=new URLSearchParams(location.search).get("team")||"";
  let teamToken=urlTeam||localStorage.getItem(TEAM_KEY)||"";
  if(urlTeam)localStorage.setItem(TEAM_KEY,urlTeam);
  const session=()=>localStorage.getItem(SESSION_KEY)||"";
  const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const addDays=(s,n)=>{const d=new Date(`${s}T00:00:00`);d.setDate(d.getDate()+n);return iso(d);};
  const fmtDate=s=>{if(!s)return"-";const d=new Date(`${String(s).slice(0,10)}T00:00:00`);return d.toLocaleDateString("th-TH",{day:"numeric",month:"short",year:"2-digit"});};
  const fmtDateTime=s=>{if(!s)return"-";const d=new Date(s);return Number.isNaN(d.getTime())?String(s):d.toLocaleString("th-TH",{dateStyle:"short",timeStyle:"short"});};
  const fmtTime=v=>{if(!v)return"-";const x=String(v);const m=x.match(/(?:T|\s)(\d{2}:\d{2})/)||x.match(/^(\d{2}:\d{2})/);return m?m[1]:x.slice(0,5);};
  function config(){try{return {...DEFAULT,...JSON.parse(localStorage.getItem(CFG_KEY)||"{}")};}catch(_){return DEFAULT;}}
  function toast(msg,type="info"){const el=$("portalToast");el.textContent=msg;el.className=`portal-toast ${type}`;clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.add("hidden"),3500);}
  function loading(on,text="กำลังโหลด..."){const el=$("portalLoading");$("portalLoadingText").textContent=text;el.classList.toggle("hidden",!on);}
  function friendly(e){const m=String(e?.message||e||"");if(m.includes("PORTAL_LOGIN_INVALID"))return"รหัสพนักงานหรือ PIN ไม่ถูกต้อง";if(m.includes("PORTAL_LOCKED_15_MINUTES"))return"กรอก PIN ผิดเกินกำหนด ระบบล็อกชั่วคราว 15 นาที";if(m.includes("ACTIVATION_CODE_INVALID"))return"Activation Code ไม่ถูกต้อง";if(m.includes("ACTIVATION_CODE_EXPIRED"))return"Activation Code หมดอายุ กรุณาขอ Code ใหม่จาก Manager";if(m.includes("PORTAL_EMPLOYEE_NOT_IN_TEAM"))return"รหัสพนักงานไม่อยู่ในทีมของ Link นี้";if(m.includes("PORTAL_NOT_ENABLED"))return"HR ยังไม่ได้เปิดสิทธิ์ Employee Portal";if(m.includes("PIN_TOO_EASY"))return"PIN ง่ายเกินไป กรุณาตั้งเลขอื่น";if(m.includes("PIN_CANNOT_MATCH_EMPLOYEE_ID"))return"PIN ห้ามตรงกับเลขท้ายรหัสพนักงาน";if(m.includes("PIN_MUST_BE_6_DIGITS"))return"PIN ต้องเป็นตัวเลข 6 หลัก";if(m.includes("PORTAL_SESSION_INVALID_OR_EXPIRED"))return"Session หมดอายุ กรุณาเข้าสู่ระบบใหม่";if(m.includes("PORTAL_DATE_RANGE_MAX_63_DAYS"))return"ช่วงวันที่ปฏิทินกว้างเกินกำหนด กรุณารีเฟรชหน้าเว็บ";if(m.includes("DUPLICATE_TIME_ISSUE_REQUEST"))return"มีคำขอปัญหาเวลาประเภทนี้ของวันเดียวกันที่ยังรอดำเนินการอยู่แล้ว";if(m.includes("REQUEST_DATE_CONFLICT"))return"วันที่เลือกมีคำขออื่นที่กำลังดำเนินการและมีผลต่อกะ/วันหยุด/ลาอยู่แล้ว";if(m.includes("DAYOFF_SWAP_SOURCE_NOT_DAYOFF"))return"วันที่ต้นทางไม่ใช่วันหยุดที่ใช้โควต้า";if(m.includes("DAYOFF_SWAP_TARGET_MUST_BE_WORKDAY"))return"วันที่ต้องการหยุดแทนต้องเป็นวันทำงาน";if(m.includes("DAYOFF_SWAP_PUBLIC_HOLIDAY_NOT_ALLOWED"))return"วันหยุดนักขัตฤกษ์ไม่สามารถนำมาสลับวันหยุดได้";if(m.includes("DAYOFF_SWAP_SAME_MONTH_REQUIRED"))return"การสลับวันหยุดต้องอยู่ภายในเดือนเดียวกัน";if(m.includes("REQUEST_EDIT_NOT_ALLOWED"))return"แก้ไขไม่ได้ เพราะ Manager เริ่มพิจารณาหรือคำขอนี้ปิดแล้ว";return m||"เกิดข้อผิดพลาด";}
  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
  function setAuthTab(tab){document.querySelectorAll("[data-auth-tab]").forEach(b=>b.classList.toggle("active",b.dataset.authTab===tab));$("portalActivateForm").classList.toggle("hidden",tab!=="activate");$("portalLoginForm").classList.toggle("hidden",tab!=="login");}
  function deviceLabel(){return `${navigator.platform||"Mobile"} • ${String(navigator.userAgent||"").slice(0,80)}`;}
  async function checkTeam(){if(!teamToken){$("portalTeamName").textContent="เปิดจาก Link/QR ของ Manager เพื่อ Activate ครั้งแรก";return false;}try{const d=await rpc("ta_portal_team_public_v61482",{p_team_token:teamToken});if(d?.valid){$("portalTeamName").textContent=`ทีมของ ${d.manager_display_name||"Manager"}`;return true;}$("portalTeamName").textContent="Link ทีมไม่ถูกต้องหรือถูกเปลี่ยนแล้ว";return false;}catch(e){$("portalTeamName").textContent="ตรวจสอบ Link ไม่สำเร็จ";return false;}}
  function showAuth(){me=null;$("portalApp").classList.add("hidden");$("portalAuth").classList.remove("hidden");}
  function showApp(){renderProfile();$("portalAuth").classList.add("hidden");$("portalApp").classList.remove("hidden");navigate("home");}
  function renderProfile(){const name=me?.full_name||me?.emp_code||"พนักงาน";$("portalEmployeeName").textContent=name;$("portalEmployeeMeta").textContent=[me?.emp_code,me?.position_name,me?.department].filter(Boolean).join(" • ");$("portalAvatar").textContent=String(name).replace(/\s+/g,"").slice(0,2)||"พน";$("portalTodayDate").textContent=new Date().toLocaleDateString("th-TH",{weekday:"long",day:"numeric",month:"long",year:"numeric"});}
  async function restore(){const t=session();if(!t)return false;try{me=await rpc("ta_portal_me_v61482",{p_session_token:t});showApp();await refreshAll();return true;}catch(e){localStorage.removeItem(SESSION_KEY);showAuth();return false;}}
  async function activate(e){e.preventDefault();if(!teamToken)return toast("กรุณาเปิดจาก Link/QR ของ Manager","warning");const pin=$("portalNewPin").value,confirm=$("portalConfirmPin").value;if(pin!==confirm)return toast("PIN และยืนยัน PIN ไม่ตรงกัน","error");loading(true,"กำลังเปิดใช้งาน Employee Portal...");try{const r=await rpc("ta_portal_activate_v61482",{p_team_token:teamToken,p_emp_code:$("portalActivateEmp").value.trim(),p_activation_code:$("portalActivationCode").value.trim(),p_new_pin:pin,p_device_label:deviceLabel()});localStorage.setItem(SESSION_KEY,r.session_token);me=r;toast("เปิดใช้งานเรียบร้อย","success");showApp();await refreshAll();}catch(err){toast(friendly(err),"error");}finally{loading(false);}}
  async function login(e){e.preventDefault();loading(true,"กำลังเข้าสู่ระบบ...");try{const r=await rpc("ta_portal_login_v61482",{p_team_token:null,p_emp_code:$("portalLoginEmp").value.trim(),p_pin:$("portalLoginPin").value.trim(),p_device_label:deviceLabel()});localStorage.setItem(SESSION_KEY,r.session_token);me=r;showApp();await refreshAll();}catch(err){toast(friendly(err),"error");}finally{loading(false);}}
  async function logout(){const t=session();localStorage.removeItem(SESSION_KEY);try{if(t)await rpc("ta_portal_logout_v61482",{p_session_token:t});}catch(_){}showAuth();setAuthTab("login");}
  function dayMeta(r){const day=String(r?.day_type||"").toUpperCase(),code=String(r?.effective_shift_code||"").toUpperCase();if(day==="LEAVE"||code==="LV")return{label:"ลา",tone:"leave"};if(r?.is_public_holiday||day==="PUBLIC_HOLIDAY"||code==="HOL")return{label:"นักขัตฤกษ์",tone:"holiday"};if(r?.is_weekly_off||day==="WEEKLY_OFF"||String(r?.is_workday)==="false")return{label:"วันหยุด",tone:"off"};const st=String(r?.calculation_status||"").toUpperCase();if(st.includes("ABSEN"))return{label:"ขาดงาน",tone:"danger"};if(Number(r?.late_minutes||0)>0)return{label:`สาย ${Number(r.late_minutes)} นาที`,tone:"late"};if(Number(r?.early_leave_minutes||0)>0)return{label:`กลับก่อน ${Number(r.early_leave_minutes)} นาที`,tone:"early"};return{label:"ปกติ",tone:"normal"};}
  function specialLabel(r){const m=String(r?.work_mode_code||"").toUpperCase();return({NORMAL_LATE_CUSTOMER:"กะปกติ + งานลูกค้าช่วงดึก",SPLIT_WAIT_NIGHT:"กะเช้า + รอเข้ากะดึก",HOUR_BASED:"กะนับชั่วโมง"})[m]||"";}
  function row(date){return calendar.find(x=>String(x.work_date).slice(0,10)===String(date).slice(0,10));}
  function renderToday(){
    const r=row(today()),box=$("portalTodayCard");
    if(!r){box.innerHTML='<div class="portal-empty">ยังไม่พบข้อมูลกะวันนี้</div>';return;}
    const meta=dayMeta(r),special=specialLabel(r),v=shiftVisual(r),second=specialSecondLine(r);
    const topCaption = special || r.shift_name || ({"เช้า":"กะเช้า","ดึก":"กะดึก","หยุด":"วันหยุด","ลา":"วันลา","นักขัตฯ":"วันหยุดนักขัตฤกษ์","กะนับชม.":"กะนับชั่วโมง"})[v.display] || "-";
    box.innerHTML=`<div class="portal-today-main"><div class="portal-today-shift"><span>${esc(meta.label)}</span><strong><i class="portal-today-shift-icon">${esc(v.icon)}</i>${esc(v.display||"-")}</strong><small>${esc(topCaption)}</small></div><span class="portal-shift-pill">${v.time?`◷ ${esc(v.time)}`:`รหัสกะ ${esc(v.code||"-")}`}</span></div><div class="portal-today-times"><div><span>เวลาเข้า</span><strong>${esc(fmtTime(r.first_in||r.actual_in_at))}</strong><small>${(r.first_in||r.actual_in_at)?"บันทึกแล้ว":"ยังไม่เข้า"}</small></div><div><span>เวลาออก</span><strong>${esc(fmtTime(r.last_out||r.actual_out_at))}</strong><small>${(r.last_out||r.actual_out_at)?"บันทึกแล้ว":"ยังไม่ออก"}</small></div></div>${second?`<div class="portal-today-special"><i>☾</i><div><span>งานกะพิเศษ</span><strong>${esc(second.replace(/^☾\s*/,''))}</strong></div></div>`:""}<div class="portal-status-line"><span class="portal-status-dot"></span><b>${esc(v.display||"-")}</b> • ${special?`รูปแบบงาน: ${esc(special)} • `:""}${esc(meta.label)}</div>`;
  }
  function isNightShiftCode(code=""){
    const c=String(code||"").toUpperCase();
    return ["S134","S135","N","NS","NIGHT","OS134","OS135"].includes(c) || /134|135/.test(c);
  }
  function primaryShiftLabel(r={}){
    const m=dayMeta(r),mode=String(r.work_mode_code||"").toUpperCase(),code=String(r.effective_shift_code||"").toUpperCase();
    if(m.tone==="leave")return"ลา";
    if(m.tone==="holiday")return"นักขัตฯ";
    if(m.tone==="off")return"หยุด";
    if(mode==="HOUR_BASED")return"กะนับชม.";
    return (r.is_night_shift||isNightShiftCode(code))?"ดึก":"เช้า";
  }
  function shiftVisual(r={}){
    const m=dayMeta(r),code=String(r.effective_shift_code||"-"),mode=String(r.work_mode_code||"").toUpperCase(),display=primaryShiftLabel(r);
    if(m.tone==="leave")return{icon:"▤",display,code,label:"ลา",time:"",metaCode:code};
    if(m.tone==="holiday")return{icon:"⌂",display,code,label:"นักขัตฯ",time:"",metaCode:code};
    if(m.tone==="off")return{icon:"☂",display,code,label:"วันหยุด",time:"",metaCode:code};
    if(mode==="HOUR_BASED")return{icon:"◷",display,code,label:"กะนับชั่วโมง",time:`${fmtTime(r.custom_start_time||r.shift_start_time)}–${fmtTime(r.custom_end_time||r.shift_end_time)}`,metaCode:code};
    return{icon:(r.is_night_shift||isNightShiftCode(code))?"☾":"☀",display,code,label:m.label,time:`${fmtTime(r.shift_start_time)}–${fmtTime(r.shift_end_time)}`,metaCode:code};
  }
  function specialSecondLine(r={}){
    const mode=String(r.work_mode_code||"").toUpperCase();
    if(mode==="NORMAL_LATE_CUSTOMER"){
      const s=r.customer_window_start||r.schedule?.customer_window_start;
      const em=String(r.customer_end_mode||r.schedule?.customer_end_mode||"").toUpperCase();
      const e=r.customer_window_end||r.schedule?.customer_window_end;
      return s?`☾ กะ 2 • งานลูกค้า ${fmtTime(s)}–${em==="ACTUAL_OUT"||!e?"ตาม OUT จริง":fmtTime(e)}`:"☾ กะ 2 • งานลูกค้าช่วงดึก";
    }
    if(mode==="SPLIT_WAIT_NIGHT"){
      return `☾ กะ 2 • ${fmtTime(r.second_segment_start)}–${fmtTime(r.second_segment_planned_end)}`;
    }
    return "";
  }
  function renderWeek(){
    const box=$("portalWeekStrip"),days=[];
    for(let i=0;i<7;i++){
      const d=addDays(today(),i),r=row(d)||{},v=shiftVisual(r),dt=new Date(`${d}T00:00:00`),second=specialSecondLine(r);
      days.push(`<div class="portal-day-chip ${dayMeta(r).tone} ${d===today()?"today":""}"><span>${dt.toLocaleDateString("th-TH",{weekday:"short"})} ${dt.getDate()}</span><strong><i class="portal-shift-icon">${esc(v.icon)}</i>${esc(v.display||v.code)}</strong><small>${esc(v.time||v.label)}</small>${second?`<small class="portal-special-line">${esc(second)}</small>`:""}</div>`);
    }
    box.innerHTML=days.join("");
  }
  function monthBounds(d){const y=d.getFullYear(),m=d.getMonth();return{start:`${y}-${String(m+1).padStart(2,"0")}-01`,end:iso(new Date(y,m+1,0)),days:new Date(y,m+1,0).getDate(),first:new Date(y,m,1).getDay(),title:new Date(y,m,1).toLocaleDateString("th-TH",{month:"long",year:"numeric"})};}
  function renderScheduleSummary(){
    const box=$("portalScheduleSummary");
    if(!box)return;
    box.innerHTML=`
      <div class="portal-shift-legend morning"><i>☀</i><span>เช้า</span></div>
      <div class="portal-shift-legend night"><i>☾</i><span>ดึก</span></div>
      <div class="portal-shift-legend off"><i>☂</i><span>หยุด</span></div>
      <div class="portal-shift-legend leave"><i>▤</i><span>ลา</span></div>
      <div class="portal-shift-legend holiday"><i>⌂</i><span>นักขัตฯ</span></div>`;
  }

  function calendarSpecialCompact(r={}){
    const mode=String(r.work_mode_code||"").toUpperCase();
    if(mode==="NORMAL_LATE_CUSTOMER"){
      const s=r.customer_window_start||r.schedule?.customer_window_start;
      const e=r.customer_window_end||r.schedule?.customer_window_end;
      if(s)return `กะพิเศษ ${fmtTime(s)}–${e?fmtTime(e):"ตาม OUT"}`;
      return "กะพิเศษ";
    }
    if(mode==="SPLIT_WAIT_NIGHT")return `กะพิเศษ ${fmtTime(r.second_segment_start)}–${fmtTime(r.second_segment_planned_end)}`;
    if(mode==="HOUR_BASED")return "กะพิเศษ • นับชั่วโมง";
    return "";
  }

  function renderCalendar(){
    const b=monthBounds(scheduleMonth);
    $("portalScheduleMonthTitle").textContent=b.title;
    let html=["อา.","จ.","อ.","พ.","พฤ.","ศ.","ส."].map(x=>`<div class="portal-cal-head">${x}</div>`).join("");
    const totalCells=Math.ceil((b.first+b.days)/7)*7;
    const firstDate=new Date(`${b.start}T00:00:00`);
    firstDate.setDate(firstDate.getDate()-b.first);
    for(let i=0;i<totalCells;i++){
      const dt=new Date(firstDate);dt.setDate(firstDate.getDate()+i);
      const date=iso(dt),r=row(date)||{},m=dayMeta(r),v=shiftVisual(r),special=calendarSpecialCompact(r);
      const inMonth=date.slice(0,7)===b.start.slice(0,7);
      html+=`<div class="portal-cal-day ${m.tone} ${inMonth?"":"outside"} ${date===today()?"today":""}"><span>${dt.getDate()}</span><strong class="portal-cal-shift-label"><i class="portal-shift-icon">${esc(v.icon)}</i>${esc(v.display||v.code)}</strong><small class="portal-cal-time">${esc(v.time||v.label)}</small>${special?`<small class="portal-special-line">${esc(special)}</small>`:""}</div>`;
    }
    $("portalCalendar").innerHTML=html;
    renderScheduleSummary();
  }

  function renderTime(){
    const rows=calendar.filter(r=>String(r.work_date)<=today()).sort((a,b)=>String(b.work_date).localeCompare(String(a.work_date))).slice(0,31),box=$("portalTimeList");
    box.innerHTML=rows.length?rows.map(r=>{const m=dayMeta(r),v=shiftVisual(r);return `<article class="portal-time-item"><div class="portal-time-head"><div class="portal-time-title"><i>${esc(v.icon)}</i><div><strong>${esc(fmtDate(r.work_date))}</strong><small>${esc(v.display||v.code)} • ${esc(v.time||m.label)} • รหัสกะ ${esc(v.code||"-")}</small></div></div><span class="portal-time-status">${esc(m.label)}</span></div><div class="portal-time-grid"><div><span>เวลาเข้า</span><strong>${esc(fmtTime(r.first_in||r.actual_in_at))}</strong></div><div><span>เวลาออก</span><strong>${esc(fmtTime(r.last_out||r.actual_out_at))}</strong></div><div><span>สาย</span><strong>${Number(r.late_minutes||0).toLocaleString("th-TH")} นาที</strong></div><div><span>กลับก่อน</span><strong>${Number(r.early_leave_minutes||0).toLocaleString("th-TH")} นาที</strong></div></div></article>`;}).join(""):'<div class="portal-empty portal-empty-card">ยังไม่มีข้อมูลเวลาทำงาน</div>';
  }
  function requestStatus(s){const x=String(s||"").toUpperCase();if(["APPROVED","RESOLVED"].includes(x))return["ดำเนินการแล้ว","done"];if(["REJECTED","CANCELLED"].includes(x))return[x==="REJECTED"?"ไม่อนุมัติ":"ยกเลิก","reject"];if(x==="IN_REVIEW")return["กำลังตรวจสอบ","pending"];return["รอดำเนินการ","pending"];}
  function requestType(r){return({TIME_ISSUE:"ปัญหาเวลาทำงาน",SPECIAL_WORK:"งานกะพิเศษ",DAYOFF_SWAP:"สลับวันหยุด",LEAVE_REQUEST:"ลา"})[r.request_type]||r.request_type||"-";}
  function subtype(r){return({MISSING_IN:"ไม่มีเวลาเข้า",MISSING_OUT:"ไม่มีเวลาออก",WRONG_TIME:"เวลาไม่ถูกต้อง",NORMAL_LATE_CUSTOMER:"กะปกติ + งานลูกค้าช่วงดึก",SPLIT_WAIT_NIGHT:"กะเช้า + รอเข้ากะดึก",HOUR_BASED:"กะนับชั่วโมง",SWAP_DAYOFF:"สลับวันหยุด",FULL_DAY:"ลาเต็มวัน",PARTIAL_DAY:"ลาบางส่วน"})[r.request_subtype]||r.request_subtype||"-";}
  function requestDetail(r){const d=r.detail||{};if(r.request_type==="SPECIAL_WORK")return[d.reported_start_time&&d.reported_end_time?`กะ 2 ${fmtTime(d.reported_start_time)}–${fmtTime(d.reported_end_time)}`:"",d.customer_location||""].filter(Boolean).join(" • ");if(r.request_type==="DAYOFF_SWAP")return`${fmtDate(r.work_date)} → ${fmtDate(d.target_date)}${d.quota_snapshot?` • โควต้า ${d.quota_snapshot.month_quota_days}/${d.quota_snapshot.used_days}`:""}`;if(r.request_type==="LEAVE_REQUEST")return`${d.leave_type||"ลา"} • ${fmtDate(r.work_date)}${d.end_date&&String(d.end_date)!==String(r.work_date)?` – ${fmtDate(d.end_date)}`:""}`;return"";}
  function renderRequests(){let rows=requests;if(requestFilter==="PENDING")rows=rows.filter(r=>["PENDING","IN_REVIEW"].includes(String(r.status).toUpperCase()));if(requestFilter==="DONE")rows=rows.filter(r=>["APPROVED","RESOLVED","REJECTED","CANCELLED"].includes(String(r.status).toUpperCase()));const box=$("portalRequestList");box.innerHTML=rows.length?rows.map(r=>{const [sl,sc]=requestStatus(r.status),detail=requestDetail(r),pending=String(r.status).toUpperCase()==="PENDING",typeClass=`type-${String(r.request_type||"generic").toLowerCase()}`,typeIcon=({TIME_ISSUE:"◷",SPECIAL_WORK:"☾",DAYOFF_SWAP:"⇄",LEAVE_REQUEST:"▤"})[r.request_type]||"•";return `<article class="portal-request-item ${typeClass}"><div class="portal-request-head"><div class="portal-request-title-wrap"><i class="portal-request-type-icon">${esc(typeIcon)}</i><div><span class="portal-request-kicker">${esc(requestType(r))}</span><strong>${esc(r.request_no||"คำขอ")}</strong><small>${esc(fmtDate(r.work_date))} • ${esc(subtype(r))}</small></div></div><span class="portal-request-status ${sc}">${esc(sl)}</span></div>${detail?`<p class="portal-request-detail">${esc(detail)}</p>`:""}<p class="portal-request-reason">${esc(r.reason||"-")}</p>${r.decision_note?`<p class="portal-manager-note"><b>Manager:</b> ${esc(r.decision_note)}</p>`:""}${pending?`<div class="portal-request-actions"><button data-edit-request="${esc(r.request_id)}">✎ แก้ไข</button><button class="danger" data-cancel-request="${esc(r.request_id)}">⌫ ยกเลิก</button></div>`:""}</article>`;}).join(""):'<div class="portal-empty portal-empty-card">ยังไม่มีคำขอ / แจ้งข้อมูล</div>';}
  function renderNotifications(){const box=$("portalNotificationList");box.innerHTML=notifications.length?notifications.map(n=>`<article class="portal-notification-item ${n.is_read?"":"unread"}" data-read-notification="${esc(n.notification_id)}"><div class="portal-notification-head"><strong>${esc(n.title||"แจ้งเตือน")}</strong><span>${esc(fmtDateTime(n.created_at))}</span></div><p>${esc(n.message||"")}</p></article>`).join(""):'<div class="portal-empty">ยังไม่มีแจ้งเตือน</div>';const unread=notifications.filter(n=>!n.is_read).length;$("portalNotifBadge").textContent=unread;$("portalNotifBadge").classList.toggle("hidden",!unread);}
  async function loadCalendar(){
    const b=monthBounds(scheduleMonth);
    const homeRange={start:addDays(today(),-31),end:addDays(today(),14)};
    const monthRange={start:addDays(b.start,-6),end:addDays(b.end,12)};

    // V6.14.89:
    // Backend intentionally limits one Portal calendar request to 63 days.
    // The previous UI created one large continuous range between "today" and
    // whichever month the user opened. When browsing an older/newer month that
    // span could exceed 63 days and the whole Portal showed
    // PORTAL_DATE_RANGE_MAX_63_DAYS.
    //
    // Load the home/time window and the selected calendar month independently,
    // then merge by work_date. Each request stays well below the backend limit.
    const overlaps=!(monthRange.end<homeRange.start || monthRange.start>homeRange.end);
    const ranges=overlaps
      ? [{
          start:[homeRange.start,monthRange.start].sort()[0],
          end:[homeRange.end,monthRange.end].sort().reverse()[0]
        }]
      : [homeRange,monthRange];

    const pages=await Promise.all(ranges.map(r=>rpc(
      "ta_portal_get_my_calendar_v61482",
      {
        p_session_token:session(),
        p_start_date:r.start,
        p_end_date:r.end
      }
    )));

    const merged=new Map();
    pages.flatMap(x=>Array.isArray(x)?x:[]).forEach(r=>{
      const key=String(r?.work_date||"").slice(0,10);
      if(key)merged.set(key,r);
    });
    calendar=[...merged.values()].sort((a,b)=>String(a.work_date).localeCompare(String(b.work_date)));

    renderToday();
    renderWeek();
    renderCalendar();
    renderTime();
  }
  async function loadRequests(){requests=await rpc("ta_portal_get_my_requests_v61482",{p_session_token:session(),p_start_date:addDays(today(),-180),p_end_date:addDays(today(),180)})||[];renderRequests();}
  async function loadNotifications(){notifications=await rpc("ta_portal_get_notifications_v61482",{p_session_token:session(),p_limit:100})||[];renderNotifications();}
  async function refreshAll(){loading(true,"กำลังโหลดข้อมูลของคุณ...");try{await Promise.all([loadCalendar(),loadRequests(),loadNotifications()]);}catch(e){if(String(e?.message||"").includes("PORTAL_SESSION_INVALID")){localStorage.removeItem(SESSION_KEY);showAuth();toast("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่","warning");}else toast(friendly(e),"error");}finally{loading(false);}}
  function navigate(name){document.querySelectorAll(".portal-view").forEach(v=>v.classList.toggle("active",v.id===`portalView${name.charAt(0).toUpperCase()+name.slice(1)}`));document.querySelectorAll("[data-portal-nav]").forEach(b=>b.classList.toggle("active",b.dataset.portalNav===name));if(name==="notifications")loadNotifications().catch(()=>{});if(name==="requests")loadRequests().catch(()=>{});}
  async function loadDayoffPickerV61494(monthDate){
    dayoffPickerMonth=new Date(`${String(monthDate).slice(0,7)}-01T00:00:00`);
    const b=monthBounds(dayoffPickerMonth);
    loading(true,"กำลังโหลดวันหยุดและโควต้า...");
    try{
      const [rows,balance]=await Promise.all([
        rpc("ta_portal_get_my_calendar_v61482",{p_session_token:session(),p_start_date:b.start,p_end_date:b.end}),
        rpc("ta_portal_get_my_dayoff_balance_v61494",{p_session_token:session(),p_month:b.start})
      ]);
      dayoffRows=Array.isArray(rows)?rows:[];
      dayoffBalance=balance||null;
      renderDayoffPickerV61494();
    }catch(e){toast(friendly(e),"error");}
    finally{loading(false);}
  }
  function dayoffRowV61494(date){return dayoffRows.find(x=>String(x.work_date).slice(0,10)===date);}
  function dayoffKindV61494(r){if(!r)return"none";if(r.is_public_holiday||String(r.effective_shift_code).toUpperCase()==="HOL")return"ph";if(dayMeta(r).tone==="leave")return"leave";if(dayMeta(r).tone==="off")return"off";return"work";}
  function renderDayoffPickerV61494(){
    const box=$("portalDayoffCalendarV61494");if(!box)return;
    const b=monthBounds(dayoffPickerMonth);
    $("portalDayoffMonthV61494").textContent=b.title;
    const q=dayoffBalance||{};
    $("portalDayoffQuotaV61494").innerHTML=`<span>โควต้า <b>${Number(q.month_quota_days||0)}</b></span><span>ใช้ไป <b>${Number(q.used_days||0)}</b></span><span>คงเหลือ <b>${Number(q.balance_days||0)}</b></span>`;
    let html=["อา","จ","อ","พ","พฤ","ศ","ส"].map(x=>`<div class="portal-swap-head">${x}</div>`).join("");
    for(let i=0;i<b.first;i++)html+='<div class="portal-swap-day blank"></div>';
    for(let n=1;n<=b.days;n++){
      const date=`${b.start.slice(0,8)}${String(n).padStart(2,"0")}`,r=dayoffRowV61494(date),kind=dayoffKindV61494(r),v=shiftVisual(r||{});
      const selectable=dayoffSource ? kind==="work" : kind==="off";
      html+=`<button type="button" class="portal-swap-day ${kind} ${selectable?"selectable":""} ${date===dayoffSource?"source":""} ${date===dayoffTarget?"target":""}" data-dayoff-date="${date}" ${selectable||date===dayoffSource||date===dayoffTarget?"":"disabled"}><span>${n}</span><strong>${esc(v.icon)} ${esc(v.code)}</strong><small>${kind==="off"?"วันหยุด":kind==="work"?"วันทำงาน":kind==="ph"?"PH":"ลา"}</small></button>`;
    }
    box.innerHTML=html;
    $("portalDayoffPreviewV61494").innerHTML=dayoffSource
      ? dayoffTarget
        ? `<b>ตัวอย่างหลังสลับ</b><span>${fmtDate(dayoffSource)} • วันหยุด → วันทำงาน ${esc(dayoffRowV61494(dayoffSource)?.default_shift_code||"กะปกติ")}</span><span>${fmtDate(dayoffTarget)} • ${esc(dayoffRowV61494(dayoffTarget)?.effective_shift_code||"กะทำงาน")} → วันหยุด</span><small>เป็นการย้ายวันหยุด โควต้าใช้ไปไม่เพิ่ม</small>`
        : `<b>เลือกวันที่ต้องการหยุดแทน</b><span>เลือกวันทำงานภายในเดือนเดียวกัน</span>`
      : `<b>เลือกวันหยุดเดิม</b><span>ระบบแสดงเฉพาะวันหยุดตามโควต้าที่สามารถเลือกได้</span>`;
  }
  function selectDayoffDateV61494(date){
    const kind=dayoffKindV61494(dayoffRowV61494(date));
    if(!dayoffSource){
      if(kind!=="off")return;
      dayoffSource=date;dayoffTarget="";
    }else if(date===dayoffSource){
      dayoffSource="";dayoffTarget="";
    }else if(kind==="work"){
      dayoffTarget=date;
    }
    $("portalRequestDate").value=dayoffSource||"";
    $("portalDayoffTargetV61491").value=dayoffTarget||"";
    renderDayoffPickerV61494();renderEvidence();
  }

  function fillSubtype(){
    const type=$("portalRequestType").value;
    const sel=$("portalRequestSubtype");
    const map={
      TIME_ISSUE:[
        ["MISSING_IN","ไม่มีเวลาเข้า"],
        ["MISSING_OUT","ไม่มีเวลาออก"],
        ["WRONG_TIME","เวลาไม่ถูกต้อง"]
      ],
      SPECIAL_WORK:[
        ["NORMAL_LATE_CUSTOMER","กะปกติ + งานลูกค้าช่วงดึก"],
        ["SPLIT_WAIT_NIGHT","กะเช้า + รอเข้ากะดึก"],
        ["HOUR_BASED","กะนับชั่วโมง"]
      ],
      DAYOFF_SWAP:[
        ["SWAP_DAYOFF","สลับวันหยุด"]
      ],
      LEAVE_REQUEST:[
        ["FULL_DAY","ลาเต็มวัน"],
        ["PARTIAL_DAY","ลาบางส่วน"]
      ]
    };
    sel.innerHTML=(map[type]||[]).map(([v,l])=>`<option value="${v}">${l}</option>`).join("");

    $("portalSpecialFields")?.classList.toggle("hidden",type!=="SPECIAL_WORK");
    $("portalDayoffFieldsV61491")?.classList.toggle("hidden",type!=="DAYOFF_SWAP");
    $("portalLeaveFieldsV61491")?.classList.toggle("hidden",type!=="LEAVE_REQUEST");
    $("portalRequestDateLabel")?.classList.toggle("hidden",type==="DAYOFF_SWAP");

    const title={
      TIME_ISSUE:"แจ้งปัญหาเวลาทำงาน",
      SPECIAL_WORK:"แจ้งทำงานกะพิเศษ",
      DAYOFF_SWAP:"ขอสลับวันหยุด",
      LEAVE_REQUEST:"ขอลา"
    }[type]||"คำขอ / แจ้งข้อมูล";
    $("portalRequestModalTitle").textContent=title;

    updateLeavePartialFieldsV61493();
    renderEvidence();
  }

  function updateLeavePartialFieldsV61493(){
    const isPartial=$("portalRequestType")?.value==="LEAVE_REQUEST"
      && $("portalRequestSubtype")?.value==="PARTIAL_DAY";
    $("portalLeavePartialFieldsV61493")?.classList.toggle("hidden",!isPartial);
  }

  function portalEvidenceRowV61493(date){
    return date ? row(String(date).slice(0,10)) : null;
  }

  function portalEvidenceLineV61493(date,label){
    const r=portalEvidenceRowV61493(date);
    if(!date)return `${label}: -`;
    if(!r)return `${label}: ${fmtDate(date)} • ยังไม่พบข้อมูลกะ`;
    return `${label}: ${fmtDate(date)} • ${r.effective_shift_code||"-"} ${fmtTime(r.shift_start_time)}–${fmtTime(r.shift_end_time)}`;
  }

  function renderEvidence(){
    const type=$("portalRequestType").value;
    const d=$("portalRequestDate").value;
    const r=portalEvidenceRowV61493(d);
    const box=$("portalRequestEvidence");

    if(!d){
      box.textContent="เลือกวันที่เพื่อดูข้อมูลกะในระบบ";
      return;
    }

    if(type==="DAYOFF_SWAP"){
      const target=$("portalDayoffTargetV61491")?.value||"";
      box.innerHTML=`<b>ตรวจวันหยุดที่จะสลับ</b><br>${esc(portalEvidenceLineV61493(d,"วันเดิม"))}<br>${esc(portalEvidenceLineV61493(target,"วันที่ต้องการหยุดแทน"))}<br><small>คำขอจะไม่แก้กะเอง Manager ต้องตรวจโควต้าและเงื่อนไขกะก่อนอนุมัติ</small>`;
      return;
    }

    if(type==="LEAVE_REQUEST"){
      box.innerHTML=r
        ? `<b>${esc(fmtDate(d))}</b> • กะ ${esc(r.effective_shift_code||"-")} ${esc(fmtTime(r.shift_start_time))}–${esc(fmtTime(r.shift_end_time))}<br><small>ใช้ข้อมูลกะของวันที่ขอลาเพื่อประกอบการพิจารณา</small>`
        : `${esc(fmtDate(d))} • ยังไม่พบข้อมูลกะ`;
      return;
    }

    if(type==="SPECIAL_WORK"){
      box.innerHTML=r
        ? `<b>${esc(fmtDate(d))}</b> • กะเดิม ${esc(r.effective_shift_code||"-")} ${esc(fmtTime(r.shift_start_time))}–${esc(fmtTime(r.shift_end_time))}<br>เวลาเข้า ${esc(fmtTime(r.first_in||r.actual_in_at))} • เวลาออก ${esc(fmtTime(r.last_out||r.actual_out_at))}<br><small>เวลาที่แจ้งด้านล่างเป็นข้อมูลประกอบ ไม่แก้ Raw Punch</small>`
        : `${esc(fmtDate(d))} • ยังไม่พบข้อมูลกะ/Attendance`;
      return;
    }

    box.innerHTML=r
      ? `<b>${esc(fmtDate(d))}</b> • กะ ${esc(r.effective_shift_code||"-")} ${esc(fmtTime(r.shift_start_time))}–${esc(fmtTime(r.shift_end_time))}<br>ระบบพบเวลาเข้า <b>${esc(fmtTime(r.first_in||r.actual_in_at))}</b> • เวลาออก <b>${esc(fmtTime(r.last_out||r.actual_out_at))}</b><br><small>ข้อมูลนี้อ่านอย่างเดียว User ไม่สามารถแก้ Raw Punch จากหน้านี้</small>`
      : `${esc(fmtDate(d))} • ยังไม่พบข้อมูลกะ/Attendance`;
  }

  function resetRequestFieldsV61493(date){
    editingRequestId=null;dayoffSource="";dayoffTarget="";
    $("portalRequestDate").value=date||today();$("portalRequestReason").value="";
    $("portalSpecialStart").value="";$("portalSpecialEnd").value="";$("portalSpecialLocation").value="";
    if($("portalDayoffTargetV61491"))$("portalDayoffTargetV61491").value="";
    if($("portalLeaveTypeV61491"))$("portalLeaveTypeV61491").value="";
    if($("portalLeaveEndV61491"))$("portalLeaveEndV61491").value=date||today();
    if($("portalLeaveStartV61491"))$("portalLeaveStartV61491").value="";
    if($("portalLeaveEndTimeV61491"))$("portalLeaveEndTimeV61491").value="";
    $("portalRequestSubmitBtnV61494").textContent="ส่งให้ Manager";
  }
  async function openRequest(type="TIME_ISSUE",date=today(),existing=null){
    resetRequestFieldsV61493(date);
    if(existing){
      editingRequestId=existing.request_id;
      type=existing.request_type;date=String(existing.work_date).slice(0,10);
      $("portalRequestDate").value=date;$("portalRequestReason").value=existing.reason||"";
      const d=existing.detail||{};
      $("portalSpecialStart").value=(d.reported_start_time||"").slice(0,5);
      $("portalSpecialEnd").value=(d.reported_end_time||"").slice(0,5);
      $("portalSpecialLocation").value=d.customer_location||"";
      $("portalLeaveTypeV61491").value=d.leave_type||"";
      $("portalLeaveEndV61491").value=d.end_date||date;
      $("portalLeaveStartV61491").value=(d.leave_start_time||"").slice(0,5);
      $("portalLeaveEndTimeV61491").value=(d.leave_end_time||"").slice(0,5);
      $("portalRequestSubmitBtnV61494").textContent="บันทึกการแก้ไข";
      dayoffSource=date;dayoffTarget=d.target_date||"";
    }
    $("portalRequestType").value=type;fillSubtype();
    if(existing)$("portalRequestSubtype").value=existing.request_subtype||$("portalRequestSubtype").value;
    if(type==="DAYOFF_SWAP"){
      await loadDayoffPickerV61494(date);
      $("portalRequestDate").value=dayoffSource;$("portalDayoffTargetV61491").value=dayoffTarget;
      renderDayoffPickerV61494();
    }
    updateLeavePartialFieldsV61493();renderEvidence();
    $("portalRequestModal").classList.remove("hidden");
  }

  function closeRequest(){$("portalRequestModal").classList.add("hidden");}
  async function submitRequest(e){
    e.preventDefault();
    const type=$("portalRequestType").value,workDate=$("portalRequestDate").value;
    const detail={source:"EMPLOYEE_PORTAL_V61494"};
    const evidence=row(workDate)||dayoffRowV61494(workDate)||null;
    if(type==="TIME_ISSUE"){
      detail.punch_snapshot={in:evidence?.first_in||evidence?.actual_in_at||null,out:evidence?.last_out||evidence?.actual_out_at||null};
    }
    if(type==="SPECIAL_WORK"){
      detail.reported_start_time=$("portalSpecialStart").value||null;
      detail.reported_end_time=$("portalSpecialEnd").value||null;
      detail.customer_location=$("portalSpecialLocation").value.trim()||null;
      detail.reported_time_is_reference_only=true;
    }
    if(type==="DAYOFF_SWAP"){
      detail.target_date=dayoffTarget||$("portalDayoffTargetV61491").value||null;
      if(!dayoffSource||!detail.target_date)return toast("กรุณาเลือกวันหยุดเดิมและวันที่ต้องการหยุดแทน","warning");
      detail.source_shift_code=dayoffRowV61494(dayoffSource)?.effective_shift_code||null;
      detail.source_replacement_shift_code=dayoffRowV61494(dayoffSource)?.default_shift_code||null;
      detail.target_work_shift_code=dayoffRowV61494(detail.target_date)?.effective_shift_code||null;
      detail.quota_snapshot=dayoffBalance?{month_quota_days:dayoffBalance.month_quota_days,used_days:dayoffBalance.used_days,balance_days:dayoffBalance.balance_days}:null;
    }
    if(type==="LEAVE_REQUEST"){
      detail.leave_type=$("portalLeaveTypeV61491")?.value.trim()||"";
      detail.end_date=$("portalLeaveEndV61491")?.value||workDate;
      detail.leave_start_time=$("portalLeaveStartV61491")?.value||null;
      detail.leave_end_time=$("portalLeaveEndTimeV61491")?.value||null;
      if(!detail.leave_type)return toast("กรุณาระบุประเภทการลา","warning");
    }
    loading(true,editingRequestId?"กำลังบันทึกการแก้ไข...":"กำลังส่งให้ Manager...");
    try{
      const args={p_session_token:session(),p_work_date:workDate,p_request_type:type,p_request_subtype:$("portalRequestSubtype").value,p_reason:$("portalRequestReason").value.trim(),p_detail:detail};
      if(editingRequestId)await rpc("ta_portal_update_request_v61494",{...args,p_request_id:editingRequestId});
      else await rpc("ta_portal_submit_request_v61482",args);
      closeRequest();toast(editingRequestId?"แก้ไขคำขอแล้ว":"ส่งให้ Manager แล้ว","success");editingRequestId=null;await loadRequests();navigate("requests");
    }catch(err){toast(friendly(err),"error");}
    finally{loading(false);}
  }
  async function cancelRequest(id){if(!confirm("ยืนยันยกเลิกคำขอนี้?"))return;try{await rpc("ta_portal_cancel_request_v61482",{p_session_token:session(),p_request_id:id});toast("ยกเลิกคำขอแล้ว","success");await loadRequests();}catch(e){toast(friendly(e),"error");}}
  async function markRead(id){try{await rpc("ta_portal_mark_notification_read_v61482",{p_session_token:session(),p_notification_id:id});const n=notifications.find(x=>x.notification_id===id);if(n)n.is_read=true;renderNotifications();}catch(_){}}
  function bind(){document.querySelectorAll("[data-auth-tab]").forEach(b=>b.addEventListener("click",()=>setAuthTab(b.dataset.authTab)));$("portalActivateForm").addEventListener("submit",activate);$("portalLoginForm").addEventListener("submit",login);$("portalLogoutBtn").addEventListener("click",logout);$("portalRefreshBtn").addEventListener("click",refreshAll);document.addEventListener("click",async e=>{const n=e.target.closest("[data-portal-nav]");if(n){navigate(n.dataset.portalNav);return;}const q=e.target.closest("[data-request-quick]");if(q){openRequest(q.dataset.requestQuick,today());return;}if(e.target.closest("[data-close-request]")){closeRequest();return;}const ed=e.target.closest("[data-edit-request]");if(ed){const req=requests.find(x=>String(x.request_id)===String(ed.dataset.editRequest));if(req)await openRequest(req.request_type,String(req.work_date).slice(0,10),req);return;}const dd=e.target.closest("[data-dayoff-date]");if(dd){selectDayoffDateV61494(dd.dataset.dayoffDate);return;}const dm=e.target.closest("[data-dayoff-month-nav]");if(dm){dayoffPickerMonth=new Date(dayoffPickerMonth.getFullYear(),dayoffPickerMonth.getMonth()+Number(dm.dataset.dayoffMonthNav||0),1);dayoffSource="";dayoffTarget="";await loadDayoffPickerV61494(iso(dayoffPickerMonth));return;}const c=e.target.closest("[data-cancel-request]");if(c){cancelRequest(c.dataset.cancelRequest);return;}const r=e.target.closest("[data-read-notification]");if(r){markRead(r.dataset.readNotification);return;}});$("portalNewRequestBtn").addEventListener("click",()=>openRequest("TIME_ISSUE",today()));$("portalRequestType").addEventListener("change",fillSubtype);$("portalRequestSubtype").addEventListener("change",()=>{updateLeavePartialFieldsV61493();renderEvidence();});$("portalRequestDate").addEventListener("change",()=>{if($("portalRequestType").value==="LEAVE_REQUEST"&&!$("portalLeaveEndV61491").value)$("portalLeaveEndV61491").value=$("portalRequestDate").value;renderEvidence();});$("portalDayoffTargetV61491")?.addEventListener("change",renderEvidence);$("portalRequestForm").addEventListener("submit",submitRequest);document.querySelectorAll("[data-request-filter]").forEach(b=>b.addEventListener("click",()=>{requestFilter=b.dataset.requestFilter;document.querySelectorAll("[data-request-filter]").forEach(x=>x.classList.toggle("active",x===b));renderRequests();}));$("portalPrevMonth").addEventListener("click",async()=>{scheduleMonth=new Date(scheduleMonth.getFullYear(),scheduleMonth.getMonth()-1,1);await loadCalendar();});$("portalNextMonth").addEventListener("click",async()=>{scheduleMonth=new Date(scheduleMonth.getFullYear(),scheduleMonth.getMonth()+1,1);await loadCalendar();});$("portalThisMonth").addEventListener("click",async()=>{scheduleMonth=new Date();await loadCalendar();});}
  async function init(){const c=config();client=window.supabase.createClient(c.url,c.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});bind();await checkTeam();if(!(await restore())){showAuth();setAuthTab(teamToken?"activate":"login");}if("serviceWorker" in navigator)navigator.serviceWorker.register("./portal-sw.js").catch(()=>{});}
  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",init):init();
})();
