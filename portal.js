(function(){
  "use strict";
  const VERSION="6.15.22";
  const CFG_KEY="ta_supabase_config_v1";
  const SESSION_KEY="ta_employee_portal_session_v61482";
  const TEAM_KEY="ta_employee_portal_team_v61482";
  const DEFAULT={url:"https://lryojaccbbbgdbpjstld.supabase.co",key:"sb_publishable_xxYLeNtxgeWoE0o5GNOwDg_QXfiFy_Y"};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  let client=null,me=null,calendar=[],requests=[],notifications=[],scheduleMonth=new Date();let requestFilter="";
  const requestConsistencyV61515=new Map();
  let editingRequestId=null,editingRequestStatusV61519="",dayoffPickerMonth=new Date(),dayoffRows=[],dayoffBalance=null,dayoffSource="",dayoffTarget="",selectedCalendarDate="";
  let dayoffLoadStateV61512={loading:false,error:"",calendarError:"",balanceError:"",usedCalendarFallback:false,loadedMonth:""};
  const rawPunchCacheV61501=new Map();
  const attendanceByDateV61503=new Map();
  let attendanceLoadErrorV61504="";
  let lastScheduleSyncV61507=0;
  let scheduleSyncingV61507=false;

  let homeFocusDateV61509="";
  const sameShiftTeamCacheV61509=new Map();
  let sameShiftTeamLoadingV61509=false;

  const certificationStateCacheV61509=new Map();
  const partialLeaveByDateV61511=new Map();
  let leavePreviewV61520=null;
  let leavePreviewLoadingV61520=false;
  let leavePreviewTimerV61520=null;
  let leavePreviewSeqV61520=0;

  let portalSyncSnapshotV61513=null;
  let portalSyncTimerV61513=null;
  let portalSyncBusyV61513=false;
  let portalSyncLastCheckV61513=0;
  const PORTAL_SYNC_INTERVAL_V61513=20000;

  let portalHydratedV61514=false;
  let attendanceLoadPromiseV61514=null;
  let sameShiftLoadPromiseV61514=null;
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
  function friendly(e){const m=String(e?.message||e||"");if(m.includes("PORTAL_LOGIN_INVALID"))return"รหัสพนักงานหรือ PIN ไม่ถูกต้อง";if(m.includes("PORTAL_LOCKED_15_MINUTES"))return"กรอก PIN ผิดเกินกำหนด ระบบล็อกชั่วคราว 15 นาที";if(m.includes("ACTIVATION_CODE_INVALID"))return"Activation Code ไม่ถูกต้อง";if(m.includes("ACTIVATION_CODE_EXPIRED"))return"Activation Code หมดอายุ กรุณาขอ Code ใหม่จาก Manager";if(m.includes("PORTAL_EMPLOYEE_NOT_IN_TEAM"))return"รหัสพนักงานไม่อยู่ในทีมของ Link นี้";if(m.includes("PORTAL_NOT_ENABLED"))return"HR ยังไม่ได้เปิดสิทธิ์ Employee Portal";if(m.includes("PIN_TOO_EASY"))return"PIN ง่ายเกินไป กรุณาตั้งเลขอื่น";if(m.includes("PIN_CANNOT_MATCH_EMPLOYEE_ID"))return"PIN ห้ามตรงกับเลขท้ายรหัสพนักงาน";if(m.includes("PIN_MUST_BE_6_DIGITS"))return"PIN ต้องเป็นตัวเลข 6 หลัก";if(m.includes("PORTAL_SESSION_INVALID_OR_EXPIRED"))return"Session หมดอายุ กรุณาเข้าสู่ระบบใหม่";if(m.includes("PORTAL_DATE_RANGE_MAX_63_DAYS"))return"ช่วงวันที่ปฏิทินกว้างเกินกำหนด กรุณารีเฟรชหน้าเว็บ";if(m.includes("DUPLICATE_TIME_CERTIFICATION_REQUEST"))return"วันที่นี้มีคำขอรับรองเวลาที่ยังรอดำเนินการอยู่แล้ว";if(m.includes("DUPLICATE_TIME_ISSUE_REQUEST"))return"วันที่นี้มีคำขอรับรองเวลาที่ยังรอดำเนินการอยู่แล้ว";if(m.includes("TIME_CERTIFICATION_NOT_ALLOWED_NON_WORKDAY"))return"วันหยุด วันหยุดนักขัตฤกษ์ และวันลา ไม่สามารถขอรับรองเวลาได้";if(m.includes("TIME_CERTIFICATION_SCHEDULE_NOT_FOUND"))return"ไม่พบข้อมูลกะของวันที่เลือก กรุณาตรวจสอบตารางกะก่อน";if(m.includes("TIME_CERTIFICATION_FUTURE_NOT_ALLOWED"))return"ไม่สามารถขอรับรองเวลาล่วงหน้าได้";if(m.includes("TIME_CERTIFICATION_PERIOD_CLOSED_MANUAL"))return"รอบรับรองเวลาของเดือนนี้ถูกปิดแล้ว กรุณาติดต่อ Manager/HR";if(m.includes("TIME_CERTIFICATION_PERIOD_CLOSED_DEADLINE"))return"พ้นกำหนดรับรองเวลาของรอบระบบแล้ว กรุณาติดต่อ Manager/HR";if(m.includes("TIME_CERTIFICATION_PERIOD_NOT_AVAILABLE"))return"รอบรับรองเวลายังไม่พร้อมใช้งาน";if(m.includes("PORTAL_HOME_TEAM_DATE_RANGE"))return"หน้าแรกดูเพื่อนร่วมกะได้เฉพาะวันนี้และเมื่อวาน";if(m.includes("WORK_DATE_REQUIRED"))return"กรุณาเลือกวันที่ก่อนดูข้อมูลการลงเวลา";if(m.includes("REQUEST_DATE_CONFLICT"))return"วันที่เลือกมีคำขออื่นที่กำลังดำเนินการและมีผลต่อกะ/วันหยุด/ลาอยู่แล้ว";if(m.includes("DAYOFF_SWAP_SOURCE_NOT_DAYOFF"))return"วันที่ต้นทางไม่ใช่วันหยุดที่ใช้โควต้า";if(m.includes("DAYOFF_SWAP_TARGET_MUST_BE_WORKDAY"))return"วันที่ต้องการหยุดแทนต้องเป็นวันทำงาน";if(m.includes("DAYOFF_SWAP_PUBLIC_HOLIDAY_NOT_ALLOWED"))return"วันหยุดนักขัตฤกษ์ไม่สามารถนำมาสลับวันหยุดได้";if(m.includes("DAYOFF_SWAP_SAME_MONTH_REQUIRED"))return"การสลับวันหยุดต้องอยู่ภายในเดือนเดียวกัน";if(m.includes("REQUEST_EDIT_NOT_ALLOWED"))return"แก้ไขไม่ได้ เพราะ Manager เริ่มพิจารณาหรือคำขอนี้ปิดแล้ว";if(m.includes("REQUEST_RETURN_NOTE_REQUIRED"))return"Manager ต้องระบุเหตุผลก่อนส่งกลับให้แก้ไข";if(m.includes("DAYOFF_ADD_NO_REQUESTABLE_BALANCE"))return"โควต้าวันหยุดที่สามารถขอเพิ่มได้หมดแล้ว";if(m.includes("DAYOFF_ADD_TARGET_MUST_BE_WORKDAY"))return"ขอหยุดเพิ่มได้เฉพาะวันที่เป็นวันทำงาน";if(m.includes("DAYOFF_ADD_PUBLIC_HOLIDAY_NOT_ALLOWED"))return"วันหยุดนักขัตฤกษ์ไม่สามารถใช้คำขอหยุดเพิ่มได้";if(m.includes("DAYOFF_REQUEST_PERIOD_CLOSED"))return"รอบระบบของวันที่เลือกปิดการจัดกะแล้ว ไม่สามารถส่งหรือแก้คำขอวันหยุดได้";if(m.includes("DAYOFF_PAIRED_SHIFT_NOT_FOUND"))return"กะทำงานของวันที่เลือกยังไม่ได้จับคู่กับกะวันหยุด กรุณาแจ้ง Manager/HR ตรวจการตั้งค่ากะ";if(m.includes("DAYOFF_SWAP_SOURCE_WORK_SHIFT_NOT_FOUND"))return"ระบบไม่พบกะทำงานที่จะใช้คืนให้วันหยุดเดิม กรุณาแจ้ง Manager/HR ตรวจการตั้งค่ากะ";if(m.includes("DAYOFF_SWAP_DATE_MUST_DIFFER"))return"วันหยุดเดิมและวันที่หยุดแทนต้องเป็นคนละวัน";if(m.includes("DAYOFF_SWAP_TARGET_DATE_REQUIRED")||m.includes("DAYOFF_SWAP_TARGET_DATE_INVALID"))return"กรุณาเลือกวันที่ต้องการหยุดแทนใหม่";if(m.includes("DAYOFF_EMPLOYEE_PORTAL_FUTURE_ONLY"))return"Employee Portal ขอวันหยุดได้เฉพาะวันที่หลังวันปัจจุบัน หากต้องการดำเนินการย้อนหลังให้แจ้ง Manager";if(m.includes("DAYOFF_REQUEST_SAME_MONTH_REQUIRED"))return"ขอสลับวันหยุดได้เฉพาะภายในเดือนเดียวกัน";if(m.includes("DAYOFF_ADD_TARGET_MUST_MATCH_REQUEST_DATE"))return"วันที่ขอหยุดเพิ่มไม่สอดคล้องกับเดือนที่เลือก กรุณาเลือกใหม่";if(m.includes("DAYOFF_SWAP_SOURCE_NOT_DAYOFF"))return"กรุณาเลือกวันหยุดเดิมก่อน";if(m.includes("DAYOFF_SWAP_TARGET_MUST_BE_WORKDAY"))return"วันที่ต้องการหยุดแทนต้องเป็นวันทำงาน";if(m.includes("DAYOFF_SWAP_PUBLIC_HOLIDAY_NOT_ALLOWED"))return"ไม่สามารถสลับกับวันหยุดนักขัตฤกษ์ได้";if(m.includes("LEAVE_EMPLOYEE_PORTAL_NO_PAST_DATE"))return"ไม่สามารถขอลาย้อนหลังได้ หากต้องการปรับตารางย้อนหลังให้แจ้ง Manager";if(m.includes("LEAVE_NOT_ALLOWED_NON_WORKDAY"))return"ไม่สามารถขอลาในวันหยุดหรือวันหยุดนักขัตฤกษ์ได้";if(m.includes("LEAVE_TYPE_NOT_ALLOWED"))return"กรุณาเลือกประเภทการลาตามรายการที่ระบบกำหนด";if(m.includes("LEAVE_PARTIAL_NOT_ALLOWED_FOR_TYPE"))return"ประเภทการลานี้กำหนดให้ลาเต็มวันเท่านั้น";if(m.includes("LEAVE_PARTIAL_SINGLE_DAY_ONLY"))return"ลาบางส่วนต้องอยู่ภายในวันเดียวกัน";if(m.includes("LEAVE_PARTIAL_TIME_REQUIRED"))return"กรุณาระบุเวลาเริ่มและเวลาสิ้นสุดของการลาบางส่วน";if(m.includes("LEAVE_PARTIAL_END_AFTER_START_REQUIRED"))return"เวลาสิ้นสุดการลาต้องมากกว่าเวลาเริ่ม";if(m.includes("PERSONAL_LEAVE_PARTIAL_MIN_60_MINUTES"))return"ลากิจบางส่วนกำหนดขั้นต่ำ 1 ชั่วโมง";if(m.includes("VACATION_LEAVE_PARTIAL_MIN_180_MINUTES"))return"ลาพักร้อนบางส่วนกำหนดขั้นต่ำ 3 ชั่วโมง";if(m.includes("ORDINATION_MIN_SERVICE_1_YEAR"))return"ลาอุปสมบทกำหนดอายุงาน 1 ปีขึ้นไป";if(m.includes("ORDINATION_EMPLOYEE_START_DATE_REQUIRED"))return"ระบบไม่พบวันเริ่มงาน จึงยังตรวจสิทธิ์ลาอุปสมบทไม่ได้ กรุณาติดต่อ Manager/HR";if(m.includes("PARTIAL_LEAVE_SHIFT_REQUIRED"))return"ไม่พบเวลาเริ่ม/สิ้นสุดกะของวันที่เลือก กรุณาตรวจตารางกะก่อน";if(m.includes("PARTIAL_LEAVE_OUTSIDE_SHIFT"))return"ช่วงลาบางส่วนต้องอยู่ภายในกะทำงานของ Work Date ที่เลือก";if(m.includes("PARTIAL_LEAVE_MUST_NOT_COVER_FULL_SHIFT"))return"ช่วงลาครอบคลุมทั้งกะ กรุณาเลือกลาเต็มวัน";if(m.includes("PARTIAL_LEAVE_ACTIVE_OVERLAY_EXISTS"))return"วันที่นี้มีลาบางส่วนที่ Manager อนุมัติไว้แล้ว กรุณาติดต่อ Manager หากต้องการเปลี่ยนช่วงเวลา";if(m.includes("LEAVE_RANGE_NO_WORKDAY"))return"ช่วงวันที่เลือกไม่มีวันทำงานที่ต้องปรับตารางกะ";if(m.includes("LEAVE_SYSTEM_PERIOD_SCHEDULE_CLOSED")||m.includes("SYSTEM_PERIOD_SCHEDULE_CLOSED"))return"รอบระบบของวันที่ลาอย่างน้อย 1 วันปิดการแก้ไขตารางกะแล้ว กรุณาติดต่อ Manager/HR";if(m.includes("PARTIAL_LEAVE_WINDOW_INVALID"))return"ช่วงลาบางส่วนไม่ผ่านเงื่อนไขกะล่าสุด กรุณาตรวจเวลาอีกครั้ง";return m||"เกิดข้อผิดพลาด";}
  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}
  function setAuthTab(tab){document.querySelectorAll("[data-auth-tab]").forEach(b=>b.classList.toggle("active",b.dataset.authTab===tab));$("portalActivateForm").classList.toggle("hidden",tab!=="activate");$("portalLoginForm").classList.toggle("hidden",tab!=="login");}
  function deviceLabel(){return `${navigator.platform||"Mobile"} • ${String(navigator.userAgent||"").slice(0,80)}`;}
  async function checkTeam(){if(!teamToken){$("portalTeamName").textContent="เปิดจาก Link/QR ของ Manager เพื่อ Activate ครั้งแรก";return false;}try{const d=await rpc("ta_portal_team_public_v61482",{p_team_token:teamToken});if(d?.valid){$("portalTeamName").textContent=`ทีมของ ${d.manager_display_name||"Manager"}`;return true;}$("portalTeamName").textContent="Link ทีมไม่ถูกต้องหรือถูกเปลี่ยนแล้ว";return false;}catch(e){$("portalTeamName").textContent="ตรวจสอบ Link ไม่สำเร็จ";return false;}}
  function showAuth(){stopPortalSyncV61513();portalHydratedV61514=false;attendanceLoadPromiseV61514=null;sameShiftLoadPromiseV61514=null;me=null;$("portalApp").classList.add("hidden");$("portalAuth").classList.remove("hidden");}
  function showApp(){renderProfile();$("portalAuth").classList.add("hidden");$("portalApp").classList.remove("hidden");navigate("home");}
  function renderProfile(){const name=me?.full_name||me?.emp_code||"พนักงาน";$("portalEmployeeName").textContent=name;$("portalEmployeeMeta").textContent=[me?.emp_code,me?.position_name,me?.department].filter(Boolean).join(" • ");$("portalAvatar").textContent=String(name).replace(/\s+/g,"").slice(0,2)||"พน";if(!homeFocusDateV61509)homeFocusDateV61509=today();renderHomeDateHeaderV61509();}
  async function restore(){const t=session();if(!t)return false;try{me=await rpc("ta_portal_me_v61482",{p_session_token:t});showApp();await refreshAll();return true;}catch(e){localStorage.removeItem(SESSION_KEY);showAuth();return false;}}
  async function activate(e){e.preventDefault();if(!teamToken)return toast("กรุณาเปิดจาก Link/QR ของ Manager","warning");const pin=$("portalNewPin").value,confirm=$("portalConfirmPin").value;if(pin!==confirm)return toast("PIN และยืนยัน PIN ไม่ตรงกัน","error");loading(true,"กำลังเปิดใช้งาน Employee Portal...");try{const r=await rpc("ta_portal_activate_v61482",{p_team_token:teamToken,p_emp_code:$("portalActivateEmp").value.trim(),p_activation_code:$("portalActivationCode").value.trim(),p_new_pin:pin,p_device_label:deviceLabel()});localStorage.setItem(SESSION_KEY,r.session_token);me=r;toast("เปิดใช้งานเรียบร้อย","success");showApp();await refreshAll();}catch(err){toast(friendly(err),"error");}finally{loading(false);}}
  async function login(e){e.preventDefault();loading(true,"กำลังเข้าสู่ระบบ...");try{const r=await rpc("ta_portal_login_v61482",{p_team_token:null,p_emp_code:$("portalLoginEmp").value.trim(),p_pin:$("portalLoginPin").value.trim(),p_device_label:deviceLabel()});localStorage.setItem(SESSION_KEY,r.session_token);me=r;showApp();await refreshAll();}catch(err){toast(friendly(err),"error");}finally{loading(false);}}
  async function logout(){const t=session();localStorage.removeItem(SESSION_KEY);try{if(t)await rpc("ta_portal_logout_v61482",{p_session_token:t});}catch(_){}showAuth();setAuthTab("login");}
  function dayMeta(r){
    const day=String(r?.day_type||"").toUpperCase();
    const code=String(r?.effective_shift_code||"").toUpperCase();
    const workFlag=String(r?.is_workday);

    if(day==="LEAVE"||["LV","LEAVE"].includes(code))return{label:"ลา",tone:"leave"};
    if(day==="PUBLIC_HOLIDAY"||code==="HOL")return{label:"นักขัตฤกษ์",tone:"holiday"};
    if(day==="WEEKLY_OFF"||workFlag==="false")return{label:"วันหยุด",tone:"off"};

    const st=String(r?.calculation_status||"").toUpperCase();
    if(st.includes("ABSEN"))return{label:"ขาดงาน",tone:"danger"};
    if(Number(r?.late_minutes||0)>0)return{label:`สาย ${Number(r.late_minutes)} นาที`,tone:"late"};
    if(Number(r?.early_leave_minutes||0)>0)return{label:`กลับก่อน ${Number(r.early_leave_minutes)} นาที`,tone:"early"};
    return{label:"ปกติ",tone:"normal"};
  }
  function specialLabel(r){const m=String(r?.work_mode_code||"").toUpperCase();return({NORMAL_LATE_CUSTOMER:"กะปกติ + งานลูกค้าช่วงดึก",SPLIT_WAIT_NIGHT:"กะเช้า + รอเข้ากะดึก",HOUR_BASED:"กะนับชั่วโมง"})[m]||"";}
  function partialLeaveV61511(r={}){return r?.partial_leave_overlay||partialLeaveByDateV61511.get(String(r?.work_date||"").slice(0,10))||null;}
  function partialLeaveTextV61511(r={}){const o=partialLeaveV61511(r);if(!o)return"";const label=o.leave_type_label||"ลาบางส่วน";const time=`${fmtTime(o.leave_start_time||o.leave_start_at)}–${fmtTime(o.leave_end_time||o.leave_end_at)}`;return `${o.is_stale?"⚠ ":"▤ "}${label} ${time}${o.is_stale?" • รอตรวจสอบกะ":""}`;}
  function row(date){return calendar.find(x=>String(x.work_date).slice(0,10)===String(date).slice(0,10));}
  function renderHomeDateHeaderV61509(){
    const d=homeFocusDateV61509||today();
    const isYesterday=d===addDays(today(),-1);
    const kicker=$("portalHomeDateKickerV61509");
    if(kicker)kicker.textContent=isYesterday?"เมื่อวาน":"วันนี้";

    const dt=new Date(`${d}T00:00:00`);
    $("portalTodayDate").textContent=dt.toLocaleDateString(
      "th-TH",
      {
        weekday:"long",
        day:"numeric",
        month:"long",
        year:"numeric"
      }
    );

    document.querySelectorAll("[data-home-day-v61509]").forEach(btn=>{
      const target=Number(btn.dataset.homeDayV61509||0)===-1
        ? addDays(today(),-1)
        : today();
      btn.classList.toggle("active",target===d);
    });
  }

  function homePunchCaptionV61509(hasPunch,isPast,kind){
    if(hasPunch)return"บันทึกแล้ว";
    if(isPast)return kind==="in"?"ไม่มีเวลาเข้า":"ไม่มีเวลาออก";
    return kind==="in"?"ยังไม่เข้า":"ยังไม่ออก";
  }

  function renderToday(){
    const focus=homeFocusDateV61509||today();
    const r=row(focus),box=$("portalTodayCard");
    renderHomeDateHeaderV61509();

    if(!r){
      box.innerHTML='<div class="portal-empty portal-home-empty-v61509">ยังไม่พบข้อมูลกะของวันที่เลือก</div>';
      return;
    }

    const meta=dayMeta(r);
    const special=specialLabel(r);
    const v=shiftVisual(r);
    const second=specialSecondLine(r);
    const partial=partialLeaveTextV61511(r);
    const isPast=focus<today();

    const inValue=r.first_in||r.actual_in_at;
    const outValue=r.last_out||r.actual_out_at;

    const topCaption=
      special
      || r.shift_name
      || ({
        "เช้า":"กะเช้า",
        "ดึก":"กะดึก",
        "หยุด":"วันหยุด",
        "ลา":"วันลา",
        "นักขัตฯ":"วันหยุดนักขัตฤกษ์",
        "กะนับชม.":"กะนับชั่วโมง"
      })[v.display]
      || "-";

    box.innerHTML=`
      <div class="portal-today-main">
        <div class="portal-today-shift">
          <span>${esc(meta.label)}</span>
          <strong>
            <i class="portal-today-shift-icon">${esc(v.icon)}</i>
            ${esc(v.display||"-")}
          </strong>
          <small>${esc(topCaption)}</small>
        </div>
        <span class="portal-shift-pill">
          ${v.time?`◷ ${esc(v.time)}`:`รหัสกะ ${esc(v.code||"-")}`}
        </span>
      </div>

      <div class="portal-today-times">
        <div>
          <span>เวลาเข้า</span>
          <strong>${esc(fmtTime(inValue))}</strong>
          <small>${esc(homePunchCaptionV61509(!!inValue,isPast,"in"))}</small>
        </div>
        <div>
          <span>เวลาออก</span>
          <strong>${esc(fmtTime(outValue))}</strong>
          <small>${esc(homePunchCaptionV61509(!!outValue,isPast,"out"))}</small>
        </div>
      </div>

      ${second?`
        <div class="portal-today-special">
          <i>☾</i>
          <div>
            <span>งานกะพิเศษ</span>
            <strong>${esc(second.replace(/^☾\s*/,''))}</strong>
          </div>
        </div>
      `:""}

      ${partial?`
        <div class="portal-today-partial-leave-v61511 ${partialLeaveV61511(r)?.is_stale?"stale":""}">
          <i>▤</i>
          <div><span>ลาบางส่วน</span><strong>${esc(partial.replace(/^[▤⚠]\s*/,''))}</strong></div>
        </div>
      `:""}

      <div class="portal-status-line">
        <span class="portal-status-dot"></span>
        <b>${esc(v.display||"-")}</b>
        • ${special?`รูปแบบงาน: ${esc(special)} • `:""}${partial?`ลาบางส่วน • `:""}
        ${esc(meta.label)}
      </div>`;
  }

  function sameShiftInitialsV61509(name){
    const parts=String(name||"")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if(!parts.length)return"ชท";
    return parts.slice(0,2).map(x=>x.slice(0,1)).join("");
  }

  function renderSameShiftTeamV61509(data,date){
    const box=$("portalSameShiftTeamV61509");
    if(!box)return;

    const focus=date||homeFocusDateV61509||today();
    const self=row(focus)||{};
    const visual=shiftVisual(self);

    if(sameShiftTeamLoadingV61509){
      box.innerHTML=`
        <div class="portal-same-shift-loading-v61509">
          <span class="portal-mini-spinner"></span>
          <strong>กำลังตรวจสอบช่างเทคนิคที่เข้ากะเดียวกับคุณ...</strong>
        </div>`;
      return;
    }

    if(!data){
      box.innerHTML=`
        <div class="portal-same-shift-empty-v61509">
          <i>👥</i>
          <div>
            <strong>ทีมร่วมกะ</strong>
            <span>ยังไม่พบข้อมูลทีมของวันที่เลือก</span>
          </div>
        </div>`;
      return;
    }

    const members=Array.isArray(data.members)?data.members:[];
    const total=Number(data.total_members||members.length||0);
    const selfWork=String(self.is_workday)!=="false"
      && !["off","holiday","leave"].includes(dayMeta(self).tone);

    if(!selfWork){
      box.innerHTML=`
        <div class="portal-same-shift-empty-v61509 nonwork">
          <i>${esc(visual.icon)}</i>
          <div>
            <strong>วันนี้ไม่ใช่วันทำงาน</strong>
            <span>จึงไม่แสดงรายชื่อช่างเทคนิคที่เข้ากะเดียวกัน</span>
          </div>
        </div>`;
      return;
    }

    const memberHtml=members.map(m=>`
      <div class="portal-same-shift-member-v61509">
        <span class="portal-same-shift-avatar-v61509">
          ${esc(sameShiftInitialsV61509(m.full_name))}
        </span>
        <div>
          <strong>${esc(m.full_name||m.emp_code||"-")}</strong>
          <small>${esc([m.position_name,m.department].filter(Boolean).join(" • ")||"ช่างเทคนิค")}</small>
        </div>
        <span class="portal-same-shift-badge-v61509">${esc(visual.display||"กะเดียวกัน")}</span>
      </div>
    `).join("");

    box.innerHTML=`
      <div class="portal-same-shift-head-v61509">
        <div>
          <span>ทีมร่วมกะ</span>
          <strong>ช่างเทคนิคที่เข้ากะเดียวกับคุณ</strong>
          <small>
            ${esc(fmtDate(focus))}
            • ${esc(visual.display||data.self_shift_code||"-")}
            ${visual.time?` • ${esc(visual.time)}`:""}
          </small>
        </div>
        <b>${total} คน</b>
      </div>

      ${members.length
        ? `<div class="portal-same-shift-grid-v61509">${memberHtml}</div>`
        : `<div class="portal-same-shift-none-v61509">ไม่พบช่างเทคนิคในทีมที่จัดกะเดียวกับคุณในวันนี้</div>`
      }

      <div class="portal-same-shift-foot-v61509">
        แสดงเฉพาะช่างเทคนิคที่มีสาย Manager ร่วมกัน และจัดกะรหัสเดียวกันในวันที่เลือก
      </div>`;
  }

  async function loadSameShiftTeamV61509(
    date=homeFocusDateV61509||today(),
    {force=false}={}
  ){
    const key=String(date||"").slice(0,10);
    if(!key)return null;

    if(!force&&sameShiftTeamCacheV61509.has(key)){
      const cached=sameShiftTeamCacheV61509.get(key);
      if(key===homeFocusDateV61509)renderSameShiftTeamV61509(cached,key);
      return cached;
    }

    if(sameShiftLoadPromiseV61514){
      return sameShiftLoadPromiseV61514;
    }

    sameShiftTeamLoadingV61509=true;
    if(key===homeFocusDateV61509)renderSameShiftTeamV61509(null,key);

    sameShiftLoadPromiseV61514=(async()=>{
      try{
        const data=await rpc(
          "ta_portal_get_same_shift_team_v61509",
          {
            p_session_token:session(),
            p_work_date:key
          }
        );
        sameShiftTeamCacheV61509.set(key,data||null);
        return data||null;
      }catch(e){
        console.warn("V6.15.14 same-shift team",e);
        const fallback={
          work_date:key,
          total_members:0,
          members:[],
          error:friendly(e)
        };
        sameShiftTeamCacheV61509.set(key,fallback);
        return fallback;
      }finally{
        sameShiftTeamLoadingV61509=false;
        sameShiftLoadPromiseV61514=null;
        if(key===homeFocusDateV61509){
          renderSameShiftTeamV61509(
            sameShiftTeamCacheV61509.get(key)||null,
            key
          );
        }
      }
    })();

    return sameShiftLoadPromiseV61514;
  }

  async function setHomeFocusDateV61509(offset){
    const next=Number(offset||0)===-1
      ? addDays(today(),-1)
      : today();

    if(homeFocusDateV61509===next){
      renderToday();
      renderSameShiftTeamV61509(
        sameShiftTeamCacheV61509.get(next)||null,
        next
      );
      return;
    }

    homeFocusDateV61509=next;
    renderToday();
    renderSameShiftTeamV61509(
      sameShiftTeamCacheV61509.get(next)||null,
      next
    );
    await loadSameShiftTeamV61509(next);
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
      const d=addDays(today(),i),r=row(d)||{},v=shiftVisual(r),dt=new Date(`${d}T00:00:00`),second=specialSecondLine(r),partial=partialLeaveTextV61511(r);
      days.push(`<div class="portal-day-chip ${dayMeta(r).tone} ${d===today()?"today":""}"><span>${dt.toLocaleDateString("th-TH",{weekday:"short"})} ${dt.getDate()}</span><strong><i class="portal-shift-icon">${esc(v.icon)}</i>${esc(v.display||v.code)}</strong><small>${esc(v.time||v.label)}</small>${second?`<small class="portal-special-line">${esc(second)}</small>`:""}${partial?`<small class="portal-partial-leave-line-v61511">${esc(partial)}</small>`:""}</div>`);
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
    const items=[];
    const mode=String(r.work_mode_code||"").toUpperCase();
    if(mode==="NORMAL_LATE_CUSTOMER"){
      const s=r.customer_window_start||r.schedule?.customer_window_start;
      const e=r.customer_window_end||r.schedule?.customer_window_end;
      items.push(s?`กะพิเศษ ${fmtTime(s)}–${e?fmtTime(e):"ตาม OUT"}`:"กะพิเศษ");
    }else if(mode==="SPLIT_WAIT_NIGHT")items.push(`กะพิเศษ ${fmtTime(r.second_segment_start)}–${fmtTime(r.second_segment_planned_end)}`);
    else if(mode==="HOUR_BASED")items.push("กะพิเศษ • นับชั่วโมง");
    const partial=partialLeaveTextV61511(r);if(partial)items.push(partial);
    return items.join(" · ");
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
      html+=`<button type="button" class="portal-cal-day ${m.tone} ${inMonth?"":"outside"} ${date===today()?"today":""} ${date===selectedCalendarDate?"selected":""}" data-calendar-date="${date}"><span>${dt.getDate()}</span><strong class="portal-cal-shift-label"><i class="portal-shift-icon">${esc(v.icon)}</i>${esc(v.display||v.code)}</strong><small class="portal-cal-time">${esc(v.time||v.label)}</small>${special?`<small class="portal-special-line">${esc(special)}</small>`:""}</button>`;
    }
    $("portalCalendar").innerHTML=html;
    renderScheduleSummary();
    if(selectedCalendarDate)renderCalendarPunchDetailV61501(selectedCalendarDate);
  }

  function rawPunchModeV61501(row={}){
    const mode=String(row.punch_mode||row.normalized_mode||row.inout_mode||"").trim().toUpperCase();
    if(["IN","I","เข้า"].includes(mode))return"IN";
    if(["OUT","O","ออก"].includes(mode))return"OUT";
    return"UNKNOWN";
  }

  function rawPunchTimeLabelV61501(row={}){
    const time=fmtTime(row.inout_time);
    return Number(row.day_offset||0)>0 ? `${time} (+1 วัน)` : time;
  }

  function rawPunchRecordLocationV61501(row={}){
    return [row.gps_name,row.gps_location,row.reader_name,row.project_name]
      .map(v=>String(v||"").trim())
      .filter(Boolean)
      .filter((v,i,a)=>a.indexOf(v)===i)
      .slice(0,2)
      .join(" • ");
  }

  function rawPunchGroupV61501(rows=[],calendarRow={}){
    const ordered=(rows||[]).slice().sort((a,b)=>{
      const da=String(a.inout_date||""),db=String(b.inout_date||"");
      if(da!==db)return da.localeCompare(db);
      const ta=String(a.inout_time||""),tb=String(b.inout_time||"");
      if(ta!==tb)return ta.localeCompare(tb);
      return Number(a.punch_id||0)-Number(b.punch_id||0);
    });

    const shiftStart=String(calendarRow?.shift_start_time||"").slice(0,5);
    const shiftStartMin=shiftStart&&shiftStart.includes(":")
      ? Number(shiftStart.slice(0,2))*60+Number(shiftStart.slice(3,5))
      : null;

    const previous=[];
    const workRows=[];
    ordered.forEach(r=>{
      const mode=rawPunchModeV61501(r);
      const t=String(r.inout_time||"").slice(0,5);
      const mins=t&&t.includes(":")?Number(t.slice(0,2))*60+Number(t.slice(3,5)):null;
      const likelyPrevious=
        Number(r.day_offset||0)===0
        && mode==="OUT"
        && shiftStartMin!==null
        && mins!==null
        && mins<shiftStartMin
        && mins<12*60;
      (likelyPrevious?previous:workRows).push(r);
    });

    const groups=[];
    const extras=[];
    let current=null;

    workRows.forEach(r=>{
      const mode=rawPunchModeV61501(r);

      if(mode==="IN"){
        if(current&&current.rows.length){
          groups.push(current);
        }
        current={rows:[r],hasIn:true,hasOut:false};
        return;
      }

      if(mode==="OUT"){
        if(current){
          current.rows.push(r);
          current.hasOut=true;
          groups.push(current);
          current=null;
        }else{
          extras.push(r);
        }
        return;
      }

      if(current)current.rows.push(r);
      else extras.push(r);
    });

    if(current&&current.rows.length)groups.push(current);

    // Never hide records. If IN/OUT modes are incomplete, preserve them as
    // extra records instead of guessing and dropping evidence.
    return{previous,groups,extras,ordered};
  }

  function rawPunchRecordHtmlV61501(row={}){
    const mode=rawPunchModeV61501(row);
    const label=mode==="IN"?"เข้า":mode==="OUT"?"ออก":"ไม่ระบุ";
    const icon=mode==="IN"?"→":mode==="OUT"?"←":"•";
    const location=rawPunchRecordLocationV61501(row);
    const fallback=mode==="IN"?"บันทึกเวลาเข้า":mode==="OUT"?"บันทึกเวลาออก":"บันทึกเวลา";
    const recordNo=row.record_no||row.punch_id||"-";
    return `<div class="portal-raw-record mode-${mode.toLowerCase()}">
      <div class="portal-raw-record-time"><i>${esc(icon)}</i><strong>${esc(rawPunchTimeLabelV61501(row))}</strong></div>
      <span class="portal-raw-record-mode">${esc(label)}</span>
      <div class="portal-raw-record-copy">
        <strong>${esc(location||fallback)}</strong>
        <small>${esc(fmtDate(row.inout_date))} • Record ${esc(recordNo)}</small>
      </div>
    </div>`;
  }

  function renderCalendarPunchRowsV61501(date,rows=[]){
    const box=$("portalCalendarPunchDetail");
    if(!box)return;

    const cal=row(date)||{};
    const v=shiftVisual(cal);
    const special=specialSecondLine(cal);
    const partial=partialLeaveTextV61511(cal);
    const grouped=rawPunchGroupV61501(rows,cal);

    const total=rows.length;
    const inCount=rows.filter(r=>rawPunchModeV61501(r)==="IN").length;
    const outCount=rows.filter(r=>rawPunchModeV61501(r)==="OUT").length;

    const sections=[];

    if(grouped.previous.length){
      sections.push(`<section class="portal-raw-shift-group previous">
        <header><div><span>ต่อเนื่องจากวันก่อน</span><strong>รายการก่อนเริ่มกะวันนี้</strong></div><b>${grouped.previous.length} Record</b></header>
        <div class="portal-raw-record-list">${grouped.previous.map(rawPunchRecordHtmlV61501).join("")}</div>
      </section>`);
    }

    grouped.groups.forEach((g,index)=>{
      const label=index===0?"กะที่ 1":index===1?"กะที่ 2":`ชุดลงเวลาที่ ${index+1}`;
      const tone=index===0?"shift1":index===1?"shift2":"extra";
      sections.push(`<section class="portal-raw-shift-group ${tone}">
        <header>
          <div><span>RAW PUNCH</span><strong>${esc(label)}</strong></div>
          <b>${g.rows.length} Record</b>
        </header>
        <div class="portal-raw-record-list">${g.rows.map(rawPunchRecordHtmlV61501).join("")}</div>
      </section>`);
    });

    if(grouped.extras.length){
      sections.push(`<section class="portal-raw-shift-group extra">
        <header><div><span>ตรวจสอบเพิ่มเติม</span><strong>รายการที่ยังจับคู่ IN / OUT ไม่ได้</strong></div><b>${grouped.extras.length} Record</b></header>
        <div class="portal-raw-record-list">${grouped.extras.map(rawPunchRecordHtmlV61501).join("")}</div>
      </section>`);
    }

    box.classList.remove("hidden");
    box.innerHTML=`<div class="portal-punch-detail-head">
      <div>
        <span>RAW TIME RECORDS</span>
        <strong>${esc(fmtDate(date))}</strong>
        <small>${esc(v.display||"-")} • ${esc(v.time||v.label||"-")}</small>
      </div>
      <span class="portal-punch-shift">${esc(v.icon)} ${esc(v.display||"-")}</span>
    </div>
    <div class="portal-raw-summary">
      <div><span>ทั้งหมด</span><strong>${total}</strong><small>Records</small></div>
      <div><span>เข้า</span><strong>${inCount}</strong><small>ครั้ง</small></div>
      <div><span>ออก</span><strong>${outCount}</strong><small>ครั้ง</small></div>
    </div>
    ${special?`<div class="portal-punch-special">${esc(special)}</div>`:""}
    ${partial?`<div class="portal-punch-partial-v61511 ${partialLeaveV61511(cal)?.is_stale?"stale":""}">${esc(partial)}</div>`:""}
    ${total?`<div class="portal-raw-groups">${sections.join("")}</div>`:'<div class="portal-empty portal-raw-empty">ยังไม่มี Raw Punch ในวันที่เลือก</div>'}
    <small class="portal-punch-note">แสดง Raw Punch ทุก Record ตามลำดับเวลา • รองรับกะที่ 1 / กะที่ 2 และ Punch ข้ามเที่ยงคืน • การจัดกลุ่มเป็นเพียงรูปแบบการแสดงผล ไม่เปลี่ยน Attendance หรือผลคำนวณ</small>`;
  }

  function renderCalendarPunchLoadingV61501(date){
    const box=$("portalCalendarPunchDetail");
    if(!box)return;
    const cal=row(date)||{},v=shiftVisual(cal);
    box.classList.remove("hidden");
    box.innerHTML=`<div class="portal-punch-detail-head">
      <div><span>RAW TIME RECORDS</span><strong>${esc(fmtDate(date))}</strong><small>${esc(v.display||"-")} • ${esc(v.time||v.label||"-")}</small></div>
      <span class="portal-punch-shift">${esc(v.icon)} ${esc(v.display||"-")}</span>
    </div>
    <div class="portal-raw-loading"><span class="portal-mini-spinner"></span><strong>กำลังโหลดข้อมูลการลงเวลาทุก Record...</strong></div>`;
  }

  function renderCalendarPunchDetailV61501(date){
    const key=String(date||"").slice(0,10);
    if(!key)return;
    if(rawPunchCacheV61501.has(key)){
      renderCalendarPunchRowsV61501(key,rawPunchCacheV61501.get(key)||[]);
    }else{
      renderCalendarPunchLoadingV61501(key);
    }
  }

  async function loadCalendarPunchDetailV61501(date,{force=false}={}){
    const key=String(date||"").slice(0,10);
    if(!key)return[];
    if(!force&&rawPunchCacheV61501.has(key)){
      const cached=rawPunchCacheV61501.get(key)||[];
      renderCalendarPunchRowsV61501(key,cached);
      return cached;
    }

    renderCalendarPunchLoadingV61501(key);
    try{
      const data=await rpc("ta_portal_get_my_raw_punches_v61501",{
        p_session_token:session(),
        p_work_date:key
      });
      const rows=Array.isArray(data)?data:[];
      rawPunchCacheV61501.set(key,rows);
      if(selectedCalendarDate===key)renderCalendarPunchRowsV61501(key,rows);
      return rows;
    }catch(err){
      if(selectedCalendarDate===key){
        const box=$("portalCalendarPunchDetail");
        box?.classList.remove("hidden");
        if(box)box.innerHTML=`<div class="portal-punch-detail-head"><div><span>RAW TIME RECORDS</span><strong>${esc(fmtDate(key))}</strong></div></div><div class="portal-empty portal-raw-error">${esc(friendly(err))}</div>`;
      }
      return[];
    }
  }

  function attendanceStatusMetaV61503(status){
    const s=String(status||"").toUpperCase();
    if(s==="ABSENCE"||s==="ABSENT")return{label:"ขาดงาน",tone:"absence",icon:"!"};
    if(s==="LATE_AND_EARLY_LEAVE")return{label:"สาย + กลับก่อน",tone:"mixed",icon:"!"};
    if(s==="LATE")return{label:"สาย",tone:"late",icon:"◷"};
    if(s==="EARLY_LEAVE")return{label:"กลับก่อน",tone:"early",icon:"↙"};
    if(s==="NORMAL"||s==="OVERTIME")return{label:"ปกติ",tone:"normal",icon:"✓"};
    return{label:"-",tone:"neutral",icon:"•"};
  }

  function attendanceAbsenceReasonV61503(reason){
    return({
      MISSING_IN:"ไม่มีเวลาเข้า",
      MISSING_OUT:"ไม่มีเวลาออก",
      MISSING_BOTH:"ไม่มีเวลาเข้าและออก",
      LATE_30_PLUS:"เข้าสายตั้งแต่ 30 นาที",
      ABSENCE:"ขาดงาน"
    })[String(reason||"").toUpperCase()]||"";
  }

  function timeMetricV61503(label,value,tone="neutral",suffix="นาที"){
    const n=Math.max(0,Number(value||0)||0);
    const active=n>0;
    return `<div class="portal-att-metric ${tone} ${active?"active":""}">
      <span>${esc(label)}</span>
      <strong>${n.toLocaleString("th-TH")}</strong>
      <small>${esc(suffix)}</small>
    </div>`;
  }

  function timeShiftPanelV61503(shift,index,calendarRow={}){
    if(!shift)return"";
    const plannedStart=fmtTime(shift.planned_start_at);
    const plannedEnd=fmtTime(shift.planned_end_at);
    const actualIn=fmtTime(shift.actual_in_at);
    const actualOut=fmtTime(shift.actual_out_at);
    const status=attendanceStatusMetaV61503(shift.status);
    const absenceReason=attendanceAbsenceReasonV61503(shift.absence_reason);
    const isSecond=index===2;
    const planText=
      plannedStart!=="-" || plannedEnd!=="-"
        ? `${plannedStart}–${plannedEnd}`
        : "-";

    return `<section class="portal-att-shift shift-${index}">
      <div class="portal-att-shift-head">
        <div>
          <span>${isSecond?"SECOND SHIFT":"WORK SHIFT"}</span>
          <strong>กะที่ ${index}</strong>
          <small>ตามแผน ${esc(planText)}</small>
        </div>
        <span class="portal-att-status ${status.tone}">
          <i>${esc(status.icon)}</i>${esc(status.label)}
        </span>
      </div>

      <div class="portal-att-punch-grid">
        <div>
          <span>เวลาเข้า</span>
          <strong>${esc(actualIn)}</strong>
          <small>${shift.actual_in_at?"บันทึกแล้ว":"ไม่มีเวลาเข้า"}</small>
        </div>
        <div>
          <span>เวลาออก</span>
          <strong>${esc(actualOut)}</strong>
          <small>${shift.actual_out_at?"บันทึกแล้ว":"ไม่มีเวลาออก"}</small>
        </div>
      </div>

      <div class="portal-att-metrics">
        ${timeMetricV61503("สาย",shift.late_minutes,"late")}
        ${timeMetricV61503("ขาดงาน",shift.absence_minutes,"absence")}
        ${timeMetricV61503("กลับก่อน",shift.early_leave_minutes,"early")}
      </div>

      ${absenceReason?`<div class="portal-att-reason absence"><i>!</i><span>${esc(absenceReason)}</span></div>`:""}
      ${isSecond?`<div class="portal-att-second-note"><i>☾</i><span>กะที่ 2 ใช้เวลา Punch จริงของช่วงงานที่ 2</span></div>`:""}
    </section>`;
  }

  function overallAttendanceMetaV61503(detail,calendarRow){
    const nonwork=dayMeta(calendarRow||{});
    if(["off","holiday","leave"].includes(nonwork.tone)){
      return{label:nonwork.label,tone:nonwork.tone};
    }
    const statuses=[
      detail?.shift_1?.status,
      detail?.shift_2?.status
    ].filter(Boolean).map(x=>String(x).toUpperCase());

    if(statuses.includes("ABSENCE"))return{label:"ขาดงาน",tone:"absence"};
    if(statuses.includes("LATE_AND_EARLY_LEAVE"))return{label:"สาย + กลับก่อน",tone:"mixed"};
    if(statuses.includes("LATE"))return{label:"สาย",tone:"late"};
    if(statuses.includes("EARLY_LEAVE"))return{label:"กลับก่อน",tone:"early"};
    return{label:"ปกติ",tone:"normal"};
  }

  function renderTime(){
    const rows=calendar
      .filter(r=>String(r.work_date)<=today())
      .sort((a,b)=>String(b.work_date).localeCompare(String(a.work_date)))
      .slice(0,31);
    const box=$("portalTimeList");

    box.innerHTML=rows.length?rows.map(r=>{
      const key=String(r.work_date).slice(0,10);
      const detail=attendanceByDateV61503.get(key);
      const v=shiftVisual(r);
      const meta=dayMeta(r);
      const overall=overallAttendanceMetaV61503(detail,r);
      const nonwork=["off","holiday","leave"].includes(meta.tone);

      if(nonwork){
        return `<article class="portal-time-item portal-att-day nonwork ${meta.tone}">
          <div class="portal-time-head portal-att-day-head">
            <div class="portal-time-title">
              <i>${esc(v.icon)}</i>
              <div>
                <strong>${esc(fmtDate(r.work_date))}</strong>
                <small>${esc(v.display||meta.label)} • รหัสกะ ${esc(v.code||"-")}</small>
              </div>
            </div>
            <span class="portal-time-status ${meta.tone}">${esc(meta.label)}</span>
          </div>
          <div class="portal-att-nonwork">
            <i>${esc(v.icon)}</i>
            <div><strong>${esc(meta.label)}</strong><span>ไม่มีการคำนวณ สาย / ขาดงาน / กลับก่อน</span></div>
          </div>
        </article>`;
      }

      if(!detail){
        if(attendanceLoadErrorV61504){
          return `<article class="portal-time-item portal-att-day portal-att-load-error">
            <div class="portal-time-head portal-att-day-head">
              <div class="portal-time-title"><i>${esc(v.icon)}</i><div><strong>${esc(fmtDate(r.work_date))}</strong><small>${esc(v.display||v.code)} • ${esc(v.time||meta.label)} • รหัสกะ ${esc(v.code||"-")}</small></div></div>
              <span class="portal-time-status absence">โหลดไม่สำเร็จ</span>
            </div>
            <div class="portal-att-error-row">
              <div><strong>ไม่สามารถโหลดผลเวลาทำงาน</strong><span>${esc(attendanceLoadErrorV61504)}</span></div>
              <button type="button" data-retry-attendance-v61504>ลองใหม่</button>
            </div>
          </article>`;
        }
        return `<article class="portal-time-item portal-att-day">
          <div class="portal-time-head portal-att-day-head">
            <div class="portal-time-title"><i>${esc(v.icon)}</i><div><strong>${esc(fmtDate(r.work_date))}</strong><small>${esc(v.display||v.code)} • ${esc(v.time||meta.label)} • รหัสกะ ${esc(v.code||"-")}</small></div></div>
            <span class="portal-time-status neutral">รอข้อมูล</span>
          </div>
          <div class="portal-att-loading-row"><span class="portal-mini-spinner"></span>กำลังโหลดผลเวลาทำงาน...</div>
        </article>`;
      }

      return `<article class="portal-time-item portal-att-day">
        <div class="portal-time-head portal-att-day-head">
          <div class="portal-time-title">
            <i>${esc(v.icon)}</i>
            <div>
              <strong>${esc(fmtDate(r.work_date))}</strong>
              <small>${esc(v.display||v.code)} • ${esc(v.time||meta.label)} • รหัสกะ ${esc(v.code||"-")}</small>
            </div>
          </div>
          <span class="portal-time-status ${overall.tone}">${esc(overall.label)}</span>
        </div>

        ${partialLeaveTextV61511(r)?`<div class="portal-time-partial-v61511 ${partialLeaveV61511(r)?.is_stale?"stale":""}"><i>▤</i><span>${esc(partialLeaveTextV61511(r))}</span></div>`:""}
        <div class="portal-att-shift-list">
          ${timeShiftPanelV61503(detail.shift_1,1,r)}
          ${detail.has_shift_2&&detail.shift_2?timeShiftPanelV61503(detail.shift_2,2,r):""}
        </div>
      </article>`;
    }).join(""):'<div class="portal-empty portal-empty-card">ยังไม่มีข้อมูลเวลาทำงาน</div>';
  }

  async function loadAttendanceRangeV61503({force=false}={}){
    const startDate=addDays(today(),-31);
    const endDate=today();

    if(!force&&attendanceByDateV61503.size){
      attendanceLoadErrorV61504="";
      renderTime();
      return attendanceByDateV61503;
    }

    if(attendanceLoadPromiseV61514){
      return attendanceLoadPromiseV61514;
    }

    attendanceLoadErrorV61504="";
    renderTime();

    attendanceLoadPromiseV61514=(async()=>{
      try{
        const data=await rpc("ta_portal_get_my_attendance_range_v61503",{
          p_session_token:session(),
          p_start_date:startDate,
          p_end_date:endDate
        });
        attendanceByDateV61503.clear();
        (Array.isArray(data)?data:[]).forEach(r=>{
          const key=String(r?.work_date||"").slice(0,10);
          if(key)attendanceByDateV61503.set(key,r);
        });
        attendanceLoadErrorV61504="";
        renderTime();
        return attendanceByDateV61503;
      }catch(err){
        console.warn("V6.15.14 attendance detail",err);
        attendanceLoadErrorV61504=friendly(err);
        renderTime();
        return null;
      }finally{
        attendanceLoadPromiseV61514=null;
      }
    })();

    return attendanceLoadPromiseV61514;
  }

  function requestStatus(s){const x=String(s||"").toUpperCase();if(["APPROVED","RESOLVED"].includes(x))return["ดำเนินการแล้ว","done"];if(x==="RETURNED")return["ส่งกลับให้แก้ไข","returned"];if(["REJECTED","CANCELLED"].includes(x))return[x==="REJECTED"?"ไม่อนุมัติ":"ยกเลิก","reject"];if(x==="IN_REVIEW")return["กำลังตรวจสอบ","pending"];return["รอดำเนินการ","pending"];}
  function leaveTypeLabelV61508(value){
    const key=String(value||"").trim().toUpperCase();
    return ({
      PERSONAL:"ลากิจ",
      "ลากิจ":"ลากิจ",
      VACATION:"ลาพักร้อน",
      "ลาพักร้อน":"ลาพักร้อน",
      ORDINATION:"ลาอุปสมบท",
      "ลาอุปสมบท":"ลาอุปสมบท",
      NEWBORN_CARE:"ลาดูแลบุตรที่คลอดใหม่",
      "ลาดูแลบุตรที่คลอดใหม่":"ลาดูแลบุตรที่คลอดใหม่"
    })[key] || value || "ลา";
  }

  function normalizeLeaveTypeV61508(value){
    const raw=String(value||"").trim();
    const key=raw.toUpperCase();
    if(key==="PERSONAL"||raw==="ลากิจ")return"PERSONAL";
    if(key==="VACATION"||raw==="ลาพักร้อน")return"VACATION";
    if(key==="ORDINATION"||raw==="ลาอุปสมบท")return"ORDINATION";
    if(key==="NEWBORN_CARE"||raw==="ลาดูแลบุตรที่คลอดใหม่")return"NEWBORN_CARE";
    return"";
  }

  function leaveRuleV61508(value){
    const type=normalizeLeaveTypeV61508(value);
    return ({
      PERSONAL:{
        label:"ลากิจ",
        partial:true,
        minMinutes:60,
        note:"ลาบางส่วนขั้นต่ำ 1 ชั่วโมง"
      },
      VACATION:{
        label:"ลาพักร้อน",
        partial:true,
        minMinutes:180,
        note:"ลาบางส่วนขั้นต่ำ 3 ชั่วโมง"
      },
      ORDINATION:{
        label:"ลาอุปสมบท",
        partial:false,
        minMinutes:0,
        note:"ลาเต็มวันเท่านั้น • อายุงาน 1 ปีขึ้นไป"
      },
      NEWBORN_CARE:{
        label:"ลาดูแลบุตรที่คลอดใหม่",
        partial:false,
        minMinutes:0,
        note:"ลาเต็มวันเท่านั้น"
      }
    })[type] || {
      label:"เลือกประเภทการลา",
      partial:true,
      minMinutes:0,
      note:"เลือกประเภทการลาเพื่อดูเงื่อนไข"
    };
  }

  function requestType(r){return({TIME_ISSUE:"รับรองเวลา",SPECIAL_WORK:"งานกะพิเศษ",DAYOFF_SWAP:"วันหยุด",LEAVE_REQUEST:"ลา"})[r.request_type]||r.request_type||"-";}
  function subtype(r){return({MISSING_IN:"รับรองเวลา-เข้า",MISSING_OUT:"รับรองเวลา-ออก",WRONG_TIME:"รับรอง-เต็มวัน",NORMAL_LATE_CUSTOMER:"กะปกติ + งานลูกค้าช่วงดึก",SPLIT_WAIT_NIGHT:"กะเช้า + รอเข้ากะดึก",HOUR_BASED:"กะนับชั่วโมง",SWAP_DAYOFF:"สลับวันหยุด",ADD_DAYOFF:"ขอหยุดเพิ่ม",FULL_DAY:"ลาเต็มวัน",PARTIAL_DAY:"ลาบางส่วน"})[r.request_subtype]||r.request_subtype||"-";}
  function dayoffOutcomeV61519(r){
    if(String(r?.request_type||"").toUpperCase()!=="DAYOFF_SWAP")return null;
    const outcome=r?.detail?.manager_apply_result_v61519;
    return outcome&&outcome.applied===true?outcome:null;
  }

  function portalShiftCodeLabelV61519(code){
    const c=String(code||"").trim().toUpperCase();
    if(!c)return"-";
    if(["STD","S043"].includes(c))return"กะเช้า";
    if(["S134","S135"].includes(c))return"กะดึก";
    if(["OSTD","OS043","OS134","OS135","OFF"].includes(c))return"หยุด";
    if(c==="HOL")return"นักขัตฯ";
    if(["LV","LEAVE"].includes(c))return"ลา";
    return c;
  }

  function portalDayoffOutcomeHtmlV61519(r){
    const outcome=dayoffOutcomeV61519(r);
    if(!outcome)return"";
    const changes=Array.isArray(outcome.schedule_changes)?outcome.schedule_changes:[];
    const rows=changes.map(change=>{
      const role=String(change?.role||"").toUpperCase();
      const title=role==="SOURCE"?"วันหยุดเดิม":"วันที่หยุด";
      const before=portalShiftCodeLabelV61519(change?.before_shift_code);
      const after=portalShiftCodeLabelV61519(change?.after_shift_code);
      const beforeCode=String(change?.before_shift_code||"").toUpperCase();
      const afterCode=String(change?.after_shift_code||"").toUpperCase();
      const codeLine=[beforeCode,afterCode].filter(Boolean).join(" → ");
      return `<div class="portal-dayoff-outcome-row-v61519"><span>${esc(title)} • ${esc(fmtDate(change?.work_date))}</span><strong>${esc(before)} → ${esc(after)}</strong>${codeLine?`<small>${esc(codeLine)}</small>`:""}</div>`;
    }).join("");
    return `<div class="portal-dayoff-outcome-v61519"><div class="portal-dayoff-outcome-head-v61519"><i>✓</i><div><span>ผลที่ระบบปรับจริง</span><strong>${esc(outcome.summary||"ตารางกะอัปเดตแล้ว")}</strong></div></div>${rows?`<div class="portal-dayoff-outcome-grid-v61519">${rows}</div>`:""}</div>`;
  }

  function leaveOutcomeV61522(r){
    if(String(r?.request_type||"").toUpperCase()!=="LEAVE_REQUEST")return null;
    const outcome=r?.detail?.manager_leave_apply_result_v61522;
    return outcome&&outcome.applied===true?outcome:null;
  }

  function portalLeaveOutcomeRowV61522(change){
    const action=String(change?.action||"").toUpperCase();
    const beforeCode=String(change?.before_shift_code||"").trim().toUpperCase();
    const afterCode=String(change?.after_shift_code||"").trim().toUpperCase();
    const before=portalShiftCodeLabelV61519(beforeCode);
    const after=portalShiftCodeLabelV61519(afterCode);
    const date=fmtDate(change?.work_date);
    const skipped=action==="SKIP";
    const partial=action==="PARTIAL_OVERLAY";
    const title=partial?"ลาบางส่วน":skipped?"คงตารางเดิม":"ปรับเป็นลา";
    const result=partial
      ?`${before} • กะเดิมคงอยู่`
      :skipped
        ?`${before} • ไม่เปลี่ยน`
        :`${before} → ${after}`;
    const codeLine=partial
      ?beforeCode
      :skipped
        ?beforeCode
        :[beforeCode,afterCode].filter(Boolean).join(" → ");
    const note=skipped
      ?(change?.current_day_type||change?.skip_reason||"วันหยุด / PH / ลาเดิม")
      :"";
    return `<div class="portal-leave-outcome-row-v61522 ${skipped?"skip":""} ${partial?"partial":""}"><div><span>${esc(title)} • ${esc(date)}</span><strong>${esc(result)}</strong>${codeLine?`<small>${esc(codeLine)}</small>`:""}${note?`<em>${esc(note)}</em>`:""}</div></div>`;
  }

  function portalLeavePartialTimelineV61522(outcome){
    const p=outcome?.partial_leave||{};
    if(!p.leave_start_time&&!p.leave_end_time)return"";
    return `<div class="portal-leave-partial-result-v61522"><div class="portal-leave-partial-line-v61522"><span class="work"></span><span class="leave"></span></div><div class="portal-leave-partial-times-v61522"><span>กะ ${esc(fmtTime(p.shift_start_time)||"-")}</span><strong>ลา ${esc(fmtTime(p.leave_start_time)||"-")}–${esc(fmtTime(p.leave_end_time)||"-")}</strong><span>${esc(fmtTime(p.shift_end_time)||"-")}</span></div><small>กะเดิมยังคงอยู่ • ระบบใช้ Partial Leave Overlay เฉพาะช่วงเวลาที่ Manager ดำเนินการ</small></div>`;
  }

  function portalLeaveOutcomeHtmlV61522(r){
    const outcome=leaveOutcomeV61522(r);
    if(!outcome)return"";
    const changes=Array.isArray(outcome.schedule_changes)?outcome.schedule_changes:[];
    const primary=changes.slice(0,4).map(portalLeaveOutcomeRowV61522).join("");
    const more=changes.length>4
      ?`<details class="portal-leave-outcome-more-v61522"><summary>ดูรายละเอียดอีก ${changes.length-4} วัน</summary><div>${changes.slice(4).map(portalLeaveOutcomeRowV61522).join("")}</div></details>`
      :"";
    const partial=String(outcome.mode||"").toUpperCase()==="PARTIAL_DAY"?portalLeavePartialTimelineV61522(outcome):"";
    const reminder=outcome.hr_connect_reminder||"การลาอย่างเป็นทางการยังต้องดำเนินการใน HR Connect ตามขั้นตอนของบริษัท";
    return `<div class="portal-leave-outcome-v61522"><div class="portal-leave-outcome-head-v61522"><i>✓</i><div><span>ผลการปรับตารางกะ</span><strong>${esc(outcome.summary||"Manager ดำเนินการแล้ว")}</strong></div></div>${partial}${primary?`<div class="portal-leave-outcome-grid-v61522">${primary}</div>`:""}${more}<div class="portal-leave-hr-reminder-v61522"><i>HR</i><span>${esc(reminder)}</span></div></div>`;
  }

  function requestDetail(r){const d=r.detail||{};if(r.request_type==="SPECIAL_WORK")return[d.reported_start_time&&d.reported_end_time?`กะ 2 ${fmtTime(d.reported_start_time)}–${fmtTime(d.reported_end_time)}`:"",d.customer_location||""].filter(Boolean).join(" • ");if(r.request_type==="DAYOFF_SWAP"){const outcome=dayoffOutcomeV61519(r);if(outcome?.summary)return outcome.summary;if(String(r.request_subtype||"").toUpperCase()==="ADD_DAYOFF")return`ขอหยุดเพิ่ม ${fmtDate(r.work_date)}${d.quota_snapshot?` • คงเหลือ ${d.quota_snapshot.balance_days??"-"} วัน`:""}`;return`${fmtDate(r.work_date)} → ${fmtDate(d.target_date)}${d.quota_snapshot?` • โควต้า ${d.quota_snapshot.month_quota_days}/${d.quota_snapshot.used_days}`:""}`;}if(r.request_type==="LEAVE_REQUEST"){const outcome=leaveOutcomeV61522(r);if(outcome?.summary)return outcome.summary;const partial=String(r.request_subtype||"").toUpperCase()==="PARTIAL_DAY";const effect=!partial&&d.affected_workday_count!=null?` • ปรับกะ ${d.affected_workday_count} วัน${Number(d.skipped_nonworkday_count||0)>0?` / ไม่เปลี่ยน ${d.skipped_nonworkday_count} วัน`:""}`:"";return`${leaveTypeLabelV61508(d.leave_type_label||d.leave_type)} • ${fmtDate(r.work_date)}${d.end_date&&String(d.end_date)!==String(r.work_date)?` – ${fmtDate(d.end_date)}`:""}${partial&&d.leave_start_time&&d.leave_end_time?` • ${fmtTime(d.leave_start_time)}–${fmtTime(d.leave_end_time)}`:""}${effect}`;}return"";}
  function portalConsistencyBadgeV61515(r){
    if(String(r?.status||"").toUpperCase()!=="RESOLVED")return"";
    const audit=requestConsistencyV61515.get(String(r.request_id));

    if(!audit){
      return`<span class="portal-consistency-v61515 pending">◷ กำลังตรวจสอบ</span>`;
    }

    const status=String(audit.overall_status||"").toUpperCase();

    if(status==="PASS"){
      return`<span class="portal-consistency-v61515 pass">✓ ตารางและระบบตรงกัน</span>`;
    }
    if(status==="FAIL"){
      return`<span class="portal-consistency-v61515 fail">! กรุณาให้ Manager ตรวจสอบ</span>`;
    }
    return`<span class="portal-consistency-v61515 warn">△ กำลัง Sync ข้อมูล</span>`;
  }

  async function loadMyRequestConsistencyV61515(){
    const ids=requests
      .filter(r=>String(r.status||"").toUpperCase()==="RESOLVED")
      .map(r=>r.request_id)
      .filter(Boolean);

    requestConsistencyV61515.clear();

    if(!ids.length){
      renderRequests();
      return;
    }

    try{
      const rows=await rpc(
        "ta_portal_get_my_request_consistency_v61515",
        {
          p_session_token:session(),
          p_request_ids:ids.slice(0,300)
        }
      );

      (Array.isArray(rows)?rows:[]).forEach(row=>{
        if(row?.request_id){
          requestConsistencyV61515.set(String(row.request_id),row);
        }
      });
    }catch(e){
      const m=String(e?.message||e||"");
      if(
        !m.includes("ta_portal_get_my_request_consistency_v61515")
        && !m.includes("PGRST202")
      ){
        console.warn("V6.15.15 portal request consistency",e);
      }
    }

    renderRequests();
  }

  function renderRequests(){
    let rows=requests;
    if(requestFilter==="PENDING")rows=rows.filter(r=>["PENDING","IN_REVIEW","RETURNED"].includes(String(r.status).toUpperCase()));
    if(requestFilter==="DONE")rows=rows.filter(r=>["APPROVED","RESOLVED","REJECTED","CANCELLED"].includes(String(r.status).toUpperCase()));
    const box=$("portalRequestList");
    box.innerHTML=rows.length?rows.map(r=>{
      const [sl,sc]=requestStatus(r.status),detail=requestDetail(r);
      const status=String(r.status||"").toUpperCase();
      const editable=status==="PENDING"||status==="RETURNED";
      const returned=status==="RETURNED";
      const typeClass=`type-${String(r.request_type||"generic").toLowerCase()}`;
      const typeIcon=({TIME_ISSUE:"◷",SPECIAL_WORK:"☾",DAYOFF_SWAP:"⇄",LEAVE_REQUEST:"▤"})[r.request_type]||"•";
      return `<article class="portal-request-item ${typeClass} ${returned?"returned-v61519":""}" data-portal-request-id="${esc(r.request_id)}"><div class="portal-request-head"><div class="portal-request-title-wrap"><i class="portal-request-type-icon">${esc(typeIcon)}</i><div><span class="portal-request-kicker">${esc(requestType(r))}</span><strong>${esc(r.request_no||"คำขอ")}</strong><small>${esc(fmtDate(r.work_date))} • ${esc(subtype(r))}</small></div></div><span class="portal-request-status ${sc}">${esc(sl)}</span></div>${detail?`<p class="portal-request-detail">${esc(detail)}</p>`:""}<p class="portal-request-reason">${esc(r.reason||"-")}</p>${r.decision_note?`<p class="portal-manager-note ${returned?"returned-v61519":""}"><b>${returned?"Manager ส่งกลับ:":"Manager:"}</b> ${esc(r.decision_note)}</p>`:""}${portalDayoffOutcomeHtmlV61519(r)}${portalLeaveOutcomeHtmlV61522(r)}${portalConsistencyBadgeV61515(r)}${editable?`<div class="portal-request-actions"><button data-edit-request="${esc(r.request_id)}">✎ ${returned?"แก้ไขและส่งใหม่":"แก้ไข"}</button><button class="danger" data-cancel-request="${esc(r.request_id)}">⌫ ยกเลิก</button></div>`:""}</article>`;
    }).join(""):'<div class="portal-empty portal-empty-card">ยังไม่มีคำขอ / แจ้งข้อมูล</div>';
  }
  function renderNotifications(){
    const box=$("portalNotificationList");
    box.innerHTML=notifications.length?notifications.map(n=>{
      const severity=String(n.severity||"info").toLowerCase();
      const linked=!!n.request_id;
      return `<article class="portal-notification-item severity-${esc(severity)} ${n.is_read?"":"unread"}" data-read-notification="${esc(n.notification_id)}" ${linked?`data-notification-request-v61519="${esc(n.request_id)}"`:""}><div class="portal-notification-head"><strong>${esc(n.title||"แจ้งเตือน")}</strong><span>${esc(fmtDateTime(n.created_at))}</span></div><p>${esc(n.message||"")}</p>${linked?`<small class="portal-notification-link-v61519">แตะเพื่อดูคำขอ</small>`:""}</article>`;
    }).join(""):'<div class="portal-empty">ยังไม่มีแจ้งเตือน</div>';
    const unread=notifications.filter(n=>!n.is_read).length;
    $("portalNotifBadge").textContent=unread;
    $("portalNotifBadge").classList.toggle("hidden",!unread);
  }

  async function loadPartialLeaveRangeV61511(range){
    try{
      const data=await rpc("ta_portal_get_my_partial_leave_overlays_v61511",{
        p_session_token:session(),p_start_date:range.start,p_end_date:range.end
      });
      return Array.isArray(data)?data:[];
    }catch(e){
      const m=String(e?.message||e||"");
      if(m.includes("ta_portal_get_my_partial_leave_overlays_v61511")||m.includes("PGRST202")){
        console.warn("V6.15.11 partial leave reader is not installed yet");
        return[];
      }
      throw e;
    }
  }

  async function loadCalendar(){
    const b=monthBounds(scheduleMonth);
    const homeRange={start:addDays(today(),-31),end:addDays(today(),14)};
    const monthRange={start:addDays(b.start,-6),end:addDays(b.end,12)};

    // V6.15.02
    // NEVER merge the Home range with the selected-month range.
    // Both individual calls are < 63 days, while the union can exceed 63 days
    // when Manager/User browses the adjacent month (e.g. Aug -> Sep).
    // That union was the remaining source of PORTAL_DATE_RANGE_MAX_63_DAYS.
    const ranges=[homeRange,monthRange];

    const [pages,overlayPages]=await Promise.all([
      Promise.all(ranges.map(r=>rpc(
        "ta_portal_get_my_calendar_v61482",
        {p_session_token:session(),p_start_date:r.start,p_end_date:r.end}
      ))),
      Promise.all(ranges.map(r=>loadPartialLeaveRangeV61511(r)))
    ]);

    partialLeaveByDateV61511.clear();
    overlayPages.flatMap(x=>Array.isArray(x)?x:[]).forEach(o=>{
      const key=String(o?.work_date||"").slice(0,10);
      if(key)partialLeaveByDateV61511.set(key,o);
    });

    const merged=new Map();
    pages.flatMap(x=>Array.isArray(x)?x:[]).forEach(r=>{
      const key=String(r?.work_date||"").slice(0,10);
      if(key)merged.set(key,{...r,partial_leave_overlay:partialLeaveByDateV61511.get(key)||null});
    });
    calendar=[...merged.values()].sort((a,b)=>String(a.work_date).localeCompare(String(b.work_date)));

    lastScheduleSyncV61507=Date.now();
    renderToday();
    renderWeek();
    renderCalendar();
    renderTime();
    updateScheduleSyncLabelV61507();
  }
  function scheduleViewActiveV61507(){
    return $("portalViewSchedule")?.classList.contains("active");
  }

  function updateScheduleSyncLabelV61507(){
    const el=$("portalScheduleSyncV61507");
    if(!el)return;

    if(scheduleSyncingV61507){
      el.textContent="กำลังซิงก์...";
      el.classList.add("syncing");
      return;
    }

    el.classList.remove("syncing");

    if(!lastScheduleSyncV61507){
      el.textContent="แตะเพื่ออัปเดต";
      return;
    }

    el.textContent=`อัปเดต ${new Date(lastScheduleSyncV61507).toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"})}`;
  }

  async function syncScheduleV61507({force=false,quiet=false}={}){
    if(scheduleSyncingV61507)return;
    if(!force&&Date.now()-lastScheduleSyncV61507<10000)return;

    scheduleSyncingV61507=true;
    updateScheduleSyncLabelV61507();

    try{
      await loadCalendar();
      if(!quiet)toast("อัปเดตตารางกะล่าสุดแล้ว","success");
    }catch(e){
      if(!quiet)toast(friendly(e),"error");
    }finally{
      scheduleSyncingV61507=false;
      updateScheduleSyncLabelV61507();
    }
  }

  function portalActiveViewV61513(){
    const active=document.querySelector(".portal-view.active");
    return String(active?.id||"")
      .replace(/^portalView/,"")
      .toLowerCase();
  }

  function portalSyncStatusV61513(state,text){
    const el=$("portalLiveSyncV61513");
    if(!el)return;
    el.className=`portal-live-sync-v61513 ${state||"ready"}`;
    const label=el.querySelector("em");
    if(label)label.textContent=text||"พร้อม";
  }

  async function getPortalSyncStateV61513(){
    if(!session())return null;
    return await rpc(
      "ta_portal_get_sync_state_v61513",
      {p_session_token:session()}
    );
  }

  function syncNumV61513(state,key){
    return Number(state?.[key]||0)||0;
  }

  function setNotificationBadgeCountV61513(count){
    const unread=Math.max(0,Number(count||0)||0);
    const badge=$("portalNotifBadge");
    if(!badge)return;
    badge.textContent=unread;
    badge.classList.toggle("hidden",!unread);
  }

  async function setPortalSyncBaselineV61513(){
    try{
      const state=await getPortalSyncStateV61513();
      if(state){
        portalSyncSnapshotV61513=state;
        setNotificationBadgeCountV61513(
          state.unread_notifications
        );
        portalSyncStatusV61513("ready","พร้อม");
      }
      return state;
    }catch(e){
      const m=String(e?.message||e||"");
      if(
        m.includes("ta_portal_get_sync_state_v61513")
        || m.includes("PGRST202")
      ){
        portalSyncStatusV61513("legacy","Manual");
        return null;
      }
      portalSyncStatusV61513("error","ตรวจไม่สำเร็จ");
      return null;
    }
  }

  async function applyPortalSyncDeltaV61513(
    next,
    prev,
    {quiet=false}={}
  ){
    if(!next||!prev)return false;

    const dataChanged=
      syncNumV61513(next,"data_revision")
      !==syncNumV61513(prev,"data_revision");

    const requestChanged=
      syncNumV61513(next,"request_revision")
      !==syncNumV61513(prev,"request_revision");

    const notificationChanged=
      syncNumV61513(next,"notification_revision")
      !==syncNumV61513(prev,"notification_revision");

    if(
      !dataChanged
      && !requestChanged
      && !notificationChanged
    ){
      setNotificationBadgeCountV61513(
        next.unread_notifications
      );
      return false;
    }

    portalSyncStatusV61513(
      "syncing",
      "อัปเดต"
    );

    const active=portalActiveViewV61513();
    const jobs=[];

    if(dataChanged){
      attendanceByDateV61503.clear();
      attendanceLoadErrorV61504="";
      sameShiftTeamCacheV61509.clear();
      certificationStateCacheV61509.clear();
      partialLeaveByDateV61511.clear();
      rawPunchCacheV61501.clear();

      jobs.push(
        loadCalendar()
      );

      if(active==="time"){
        jobs.push(
          loadAttendanceRangeV61503(
            {force:true}
          )
        );
      }

      if(
        active==="schedule"
        && selectedCalendarDate
      ){
        jobs.push(
          loadCalendarPunchDetailV61501(
            selectedCalendarDate,
            {force:true}
          )
        );
      }

      if(
        active==="home"
        || homeFocusDateV61509
      ){
        jobs.push(
          loadSameShiftTeamV61509(
            homeFocusDateV61509||today(),
            {force:true}
          )
        );
      }
    }

    if(requestChanged){
      jobs.push(
        loadRequests()
      );
    }

    if(notificationChanged){
      jobs.push(
        loadNotifications()
      );
    }else{
      setNotificationBadgeCountV61513(
        next.unread_notifications
      );
    }

    const results=await Promise.allSettled(jobs);
    const failed=results.some(
      r=>r.status==="rejected"
    );

    if(!quiet&&!failed){
      if(
        dataChanged
        && (requestChanged||notificationChanged)
      ){
        toast(
          "Manager ดำเนินการแล้ว • ตารางกะและสถานะอัปเดตล่าสุด",
          "success"
        );
      }else if(dataChanged){
        toast(
          "ตารางกะ / เวลาทำงานมีการอัปเดต",
          "info"
        );
      }else if(requestChanged||notificationChanged){
        toast(
          "สถานะคำขอมีการอัปเดต",
          "info"
        );
      }
    }

    portalSyncStatusV61513(
      failed?"error":"ready",
      failed?"บางส่วน":"ล่าสุด"
    );

    return true;
  }

  async function checkPortalSyncV61513(
    {force=false,quiet=false}={}
  ){
    if(
      portalSyncBusyV61513
      || !session()
      || document.visibilityState==="hidden"
    ){
      return false;
    }

    if(
      !force
      && Date.now()-portalSyncLastCheckV61513
         <PORTAL_SYNC_INTERVAL_V61513-1000
    ){
      return false;
    }

    portalSyncBusyV61513=true;
    portalSyncLastCheckV61513=Date.now();

    try{
      const next=await getPortalSyncStateV61513();

      if(!next){
        return false;
      }

      if(!portalSyncSnapshotV61513){
        portalSyncSnapshotV61513=next;
        setNotificationBadgeCountV61513(
          next.unread_notifications
        );
        portalSyncStatusV61513(
          "ready",
          "พร้อม"
        );
        return true;
      }

      const prev=portalSyncSnapshotV61513;

      await applyPortalSyncDeltaV61513(
        next,
        prev,
        {quiet}
      );

      portalSyncSnapshotV61513=next;
      setNotificationBadgeCountV61513(
        next.unread_notifications
      );

      return true;
    }catch(e){
      const m=String(e?.message||e||"");

      if(m.includes("PORTAL_SESSION_INVALID")){
        localStorage.removeItem(SESSION_KEY);
        showAuth();
        toast(
          "Session หมดอายุ กรุณาเข้าสู่ระบบใหม่",
          "warning"
        );
        return false;
      }

      if(
        m.includes("ta_portal_get_sync_state_v61513")
        || m.includes("PGRST202")
      ){
        portalSyncStatusV61513(
          "legacy",
          "Manual"
        );
        return false;
      }

      portalSyncStatusV61513(
        "error",
        "รอตรวจใหม่"
      );
      return false;
    }finally{
      portalSyncBusyV61513=false;
    }
  }

  function startPortalSyncV61513(){
    if(portalSyncTimerV61513)return;

    portalSyncTimerV61513=setInterval(
      ()=>{
        checkPortalSyncV61513(
          {quiet:false}
        ).catch(()=>{});
      },
      PORTAL_SYNC_INTERVAL_V61513
    );
  }

  function stopPortalSyncV61513(){
    if(portalSyncTimerV61513){
      clearInterval(
        portalSyncTimerV61513
      );
      portalSyncTimerV61513=null;
    }
    portalSyncSnapshotV61513=null;
    portalSyncBusyV61513=false;
    portalSyncLastCheckV61513=0;
  }

  async function loadRequests(){requests=await rpc("ta_portal_get_my_requests_v61482",{p_session_token:session(),p_start_date:addDays(today(),-180),p_end_date:addDays(today(),180)})||[];renderRequests();loadMyRequestConsistencyV61515().catch(()=>{});}
  async function loadNotifications(){notifications=await rpc("ta_portal_get_notifications_v61482",{p_session_token:session(),p_limit:100})||[];renderNotifications();}
  async function refreshAll(){loading(true,"กำลังโหลดข้อมูลของคุณ...");try{attendanceByDateV61503.clear();attendanceLoadErrorV61504="";sameShiftTeamCacheV61509.clear();certificationStateCacheV61509.clear();partialLeaveByDateV61511.clear();rawPunchCacheV61501.clear();if(!homeFocusDateV61509)homeFocusDateV61509=today();await Promise.all([loadCalendar(),loadRequests(),loadNotifications()]);await loadSameShiftTeamV61509(homeFocusDateV61509,{force:true});portalHydratedV61514=true;await setPortalSyncBaselineV61513();startPortalSyncV61513();}catch(e){if(String(e?.message||"").includes("PORTAL_SESSION_INVALID")){localStorage.removeItem(SESSION_KEY);showAuth();toast("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่","warning");}else toast(friendly(e),"error");}finally{loading(false);renderToday();renderSameShiftTeamV61509(sameShiftTeamCacheV61509.get(homeFocusDateV61509)||null,homeFocusDateV61509);}}
  function navigate(name){
    document.querySelectorAll(".portal-view").forEach(v=>v.classList.toggle("active",v.id===`portalView${name.charAt(0).toUpperCase()+name.slice(1)}`));
    document.querySelectorAll("[data-portal-nav]").forEach(b=>b.classList.toggle("active",b.dataset.portalNav===name));

    if(name==="notifications")loadNotifications().catch(()=>{});
    if(name==="requests")loadRequests().catch(()=>{});
    if(name==="home"){
      renderToday();
      if(portalHydratedV61514){
        loadSameShiftTeamV61509(
          homeFocusDateV61509||today()
        ).catch(()=>{});
      }
    }
    if(name==="schedule"){
      if(portalSyncSnapshotV61513){
        renderCalendar();
        updateScheduleSyncLabelV61507();
        checkPortalSyncV61513(
          {force:true,quiet:true}
        ).catch(()=>{});
      }else{
        syncScheduleV61507(
          {force:true,quiet:true}
        );
      }
    }
    if(name==="time"){
      checkPortalSyncV61513(
        {force:true,quiet:true}
      ).catch(()=>{});
      loadAttendanceRangeV61503(
        {force:false}
      ).catch(()=>{});
    }
  }
  function normalizeDayoffMonthV61512(monthDate){
    const raw=String(monthDate||"").slice(0,10);
    const month=/^\d{4}-\d{2}/.test(raw)?raw.slice(0,7):today().slice(0,7);
    const d=new Date(`${month}-01T00:00:00`);
    return Number.isNaN(d.getTime())?new Date(`${today().slice(0,7)}-01T00:00:00`):d;
  }

  function dayoffFallbackRowsV61512(b){
    if(!Array.isArray(calendar)||!calendar.length)return[];
    return calendar.filter(r=>{
      const d=String(r?.work_date||"").slice(0,10);
      return d>=b.start&&d<=b.end;
    });
  }

  function renderDayoffLoadingStateV61512(){
    const state=$("portalDayoffLoadStateV61512");
    const box=$("portalDayoffCalendarV61494");
    const quota=$("portalDayoffQuotaV61494");
    if(state){
      state.className="portal-dayoff-loadstate-v61512 loading";
      state.innerHTML='<span class="portal-dayoff-mini-spinner-v61512"></span><div><strong>กำลังโหลดตารางกะและวันหยุด...</strong><small>กำลังตรวจข้อมูลเดือนที่เลือกจากระบบ</small></div>';
    }
    if(quota){
      quota.innerHTML=Array.from({length:4},()=>'<span class="portal-dayoff-quota-skeleton-v61512"><em>&nbsp;</em><b>&nbsp;</b></span>').join("");
    }
    if(box){
      box.innerHTML=Array.from({length:21},(_,i)=>`<div class="portal-dayoff-cell-skeleton-v61512" style="--i:${i}"></div>`).join("");
    }
  }

  function showDayoffLoadMessageV61512(){
    const state=$("portalDayoffLoadStateV61512");
    if(!state)return;
    const s=dayoffLoadStateV61512||{};
    if(s.loading){
      state.className="portal-dayoff-loadstate-v61512 loading";
      return;
    }
    if(s.calendarError&&dayoffRows.length===0){
      state.className="portal-dayoff-loadstate-v61512 error";
      state.innerHTML=`<div><strong>โหลดข้อมูลวันหยุดไม่สำเร็จ</strong><small>${esc(s.calendarError)}</small></div><button type="button" data-dayoff-retry-v61512>ลองใหม่</button>`;
      return;
    }
    if(s.calendarError&&s.usedCalendarFallback){
      state.className="portal-dayoff-loadstate-v61512 warning";
      state.innerHTML=`<div><strong>กำลังแสดงข้อมูลกะที่โหลดไว้ล่าสุด</strong><small>เชื่อมต่อข้อมูลวันหยุดล่าสุดไม่สำเร็จ • กดลองใหม่ก่อนส่งคำขอ</small></div><button type="button" data-dayoff-retry-v61512>ลองใหม่</button>`;
      return;
    }
    if(s.balanceError){
      state.className="portal-dayoff-loadstate-v61512 warning";
      state.innerHTML=`<div><strong>ตารางกะแสดงได้ แต่โควต้าวันหยุดยังโหลดไม่สำเร็จ</strong><small>สลับวันหยุดยังเลือกดูได้ • ขอหยุดเพิ่มจะปิดไว้จนกว่าจะโหลดโควต้าสำเร็จ</small></div><button type="button" data-dayoff-retry-v61512>โหลดโควต้าใหม่</button>`;
      return;
    }
    state.className="portal-dayoff-loadstate-v61512 hidden";
    state.innerHTML="";
  }

  async function loadDayoffPickerV61494(monthDate,{quiet=false}={}){
    dayoffPickerMonth=normalizeDayoffMonthV61512(monthDate);
    const b=monthBounds(dayoffPickerMonth);
    dayoffLoadStateV61512={loading:true,error:"",calendarError:"",balanceError:"",usedCalendarFallback:false,loadedMonth:b.start.slice(0,7)};

    const title=$("portalDayoffMonthV61494");
    if(title)title.textContent=b.title;
    renderDayoffLoadingStateV61512();

    const token=session();
    if(!token){
      dayoffRows=[];
      dayoffBalance=null;
      dayoffLoadStateV61512={...dayoffLoadStateV61512,loading:false,calendarError:"Session หมดอายุ กรุณาเข้าสู่ระบบใหม่"};
      renderDayoffPickerV61494();
      if(!quiet)toast("Session หมดอายุ กรุณาเข้าสู่ระบบใหม่","warning");
      return false;
    }

    const [calendarResult,balanceResult]=await Promise.allSettled([
      rpc("ta_portal_get_my_calendar_v61482",{p_session_token:token,p_start_date:b.start,p_end_date:b.end}),
      rpc("ta_portal_get_my_dayoff_balance_v61494",{p_session_token:token,p_month:b.start})
    ]);

    if(calendarResult.status==="fulfilled"){
      dayoffRows=Array.isArray(calendarResult.value)?calendarResult.value:[];
    }else{
      const fallback=dayoffFallbackRowsV61512(b);
      dayoffRows=fallback;
      dayoffLoadStateV61512.calendarError=friendly(calendarResult.reason);
      dayoffLoadStateV61512.usedCalendarFallback=fallback.length>0;
    }

    if(balanceResult.status==="fulfilled"){
      dayoffBalance=balanceResult.value||null;
    }else{
      dayoffBalance=null;
      dayoffLoadStateV61512.balanceError=friendly(balanceResult.reason);
    }

    dayoffLoadStateV61512.loading=false;
    dayoffLoadStateV61512.error=dayoffLoadStateV61512.calendarError||dayoffLoadStateV61512.balanceError||"";
    renderDayoffPickerV61494();

    if(!quiet&&dayoffLoadStateV61512.calendarError&&!dayoffLoadStateV61512.usedCalendarFallback){
      toast("โหลดข้อมูลวันหยุดไม่สำเร็จ กรุณากดลองใหม่","error");
    }
    return !dayoffLoadStateV61512.calendarError;
  }
  function dayoffRowV61494(date){return dayoffRows.find(x=>String(x.work_date).slice(0,10)===date);}
  function dayoffKindV61494(r){if(!r)return"none";if(r.is_public_holiday||String(r.effective_shift_code).toUpperCase()==="HOL")return"ph";if(dayMeta(r).tone==="leave")return"leave";if(dayMeta(r).tone==="off")return"off";return"work";}
  function dayoffRowLockedV61512(r){
    if(!r)return false;
    const period=String(r.round_status||r.period_status||r.system_period_status||"").toUpperCase();
    return r.is_locked===true||r.is_period_closed===true||r.period_closed===true||["CLOSED","LOCKED","FINALIZED"].includes(period);
  }
  function dayoffRowRequestAllowedV61512(r){
    if(!r)return false;
    if(dayoffRowLockedV61512(r))return false;
    if(r.can_swap===false||r.can_request_dayoff===false||r.request_allowed===false)return false;
    return true;
  }
  function dayoffRequestModeV61505(){
    return String($("portalRequestSubtype")?.value||"SWAP_DAYOFF").toUpperCase();
  }

  function dayoffRequestableV61505(){
    if(dayoffLoadStateV61512?.balanceError||!dayoffBalance)return 0;
    const q=dayoffBalance||{};
    const value=q.requestable_balance_days??q.balance_days??0;
    return Math.max(0,Number(value)||0);
  }

  function dayoffFutureOnlyV61506(date){
    const d=String(date||"").slice(0,10);
    return !!d && d>today();
  }

  function sameMonthV61506(a,b){
    const x=String(a||"").slice(0,7);
    const y=String(b||"").slice(0,7);
    return !!x && !!y && x===y;
  }

  function dayoffCurrentMonthStartV61506(){
    return `${today().slice(0,7)}-01`;
  }

  function dayoffPickerIsPastMonthV61506(){
    return iso(new Date(dayoffPickerMonth.getFullYear(),dayoffPickerMonth.getMonth(),1))
      < dayoffCurrentMonthStartV61506();
  }

  function dayoffRequestDateBlockedV61506(){
    const mode=dayoffRequestModeV61505();
    if(mode==="ADD_DAYOFF"){
      if(dayoffTarget&&!dayoffFutureOnlyV61506(dayoffTarget))return true;
      if(dayoffTarget&&!dayoffRowRequestAllowedV61512(dayoffRowV61494(dayoffTarget)))return true;
      return false;
    }
    if(dayoffSource&&!dayoffFutureOnlyV61506(dayoffSource))return true;
    if(dayoffTarget&&!dayoffFutureOnlyV61506(dayoffTarget))return true;
    if(dayoffSource&&dayoffTarget&&!sameMonthV61506(dayoffSource,dayoffTarget))return true;
    if(dayoffSource&&!dayoffRowRequestAllowedV61512(dayoffRowV61494(dayoffSource)))return true;
    if(dayoffTarget&&!dayoffRowRequestAllowedV61512(dayoffRowV61494(dayoffTarget)))return true;
    return false;
  }

  function renderDayoffPickerV61494(){
    const box=$("portalDayoffCalendarV61494");
    if(!box)return;

    const b=monthBounds(dayoffPickerMonth);
    $("portalDayoffMonthV61494").textContent=b.title;
    showDayoffLoadMessageV61512();

    const q=dayoffBalance||{};
    const mode=dayoffRequestModeV61505();
    const isAdd=mode==="ADD_DAYOFF";
    const requestable=dayoffRequestableV61505();
    const pending=Math.max(0,Number(q.pending_add_dayoff_requests||0)||0);
    const balance=Math.max(0,Number(q.balance_days||0)||0);
    const balanceReady=!!dayoffBalance&&!dayoffLoadStateV61512.balanceError;
    const quotaText=v=>balanceReady?String(Number(v||0)):"—";

    $("portalDayoffQuotaV61494").innerHTML=`
      <span class="${balanceReady?"":"unavailable"}"><em>โควต้า</em><b>${quotaText(q.month_quota_days)}</b></span>
      <span class="${balanceReady?"":"unavailable"}"><em>ใช้ไป</em><b>${quotaText(q.used_days)}</b></span>
      <span class="${balanceReady?"":"unavailable"}"><em>คงเหลือ</em><b>${balanceReady?balance:"—"}</b></span>
      <span class="${!balanceReady?"unavailable":requestable>0?"available":"empty"}"><em>ขอได้อีก</em><b>${balanceReady?requestable:"—"}</b></span>`;

    const guide=$("portalDayoffModeGuideV61505");
    if(guide){
      guide.className=`portal-dayoff-mode-guide ${isAdd?"add":"swap"} ${isAdd&&requestable<=0?"blocked":""}`;
      guide.innerHTML=isAdd
        ? !balanceReady
          ? `<i>!</i><div><strong>กำลังรอข้อมูลโควต้า</strong><span>ยังไม่เปิดให้เลือก “ขอหยุดเพิ่ม” จนกว่าจะตรวจโควต้าจากระบบสำเร็จ</span><small>กด “โหลดโควต้าใหม่” ด้านล่างได้ทันที</small></div>`
          : requestable>0
            ? `<i>＋</i><div><strong>ขอหยุดเพิ่มจากโควต้าคงเหลือ</strong><span>เลือกวันทำงานที่อยู่หลังวันปัจจุบัน • ขอได้อีก ${requestable} วัน${pending?` • รออนุมัติ ${pending} วัน`:""}</span><small>ย้อนหลังให้แจ้ง Manager เป็นผู้ดำเนินการ</small></div>`
            : `<i>!</i><div><strong>ยังขอหยุดเพิ่มไม่ได้</strong><span>โควต้าที่ขอได้อีกเป็น 0${pending?` • มีคำขอรออนุมัติ ${pending} วัน`:""} • ยังสามารถเลือก “สลับวันหยุด” ได้</span></div>`
        : `<i>⇄</i><div><strong>สลับวันหยุด</strong><span>เลือกวันหยุดเดิมและวันทำงานใหม่ที่อยู่หลังวันปัจจุบัน และต้องอยู่ในเดือนเดียวกัน</span><small>ย้อนหลังหรือข้ามเดือน ให้แจ้ง Manager เป็นผู้ดำเนินการ</small></div>`;
    }

    const monthStart=iso(new Date(dayoffPickerMonth.getFullYear(),dayoffPickerMonth.getMonth(),1));
    const currentMonthStart=dayoffCurrentMonthStartV61506();
    const prevBtn=document.querySelector('[data-dayoff-month-nav="-1"]');
    const nextBtn=document.querySelector('[data-dayoff-month-nav="1"]');
    if(prevBtn){
      prevBtn.disabled=monthStart<=currentMonthStart || (!!dayoffSource && !isAdd);
      prevBtn.title=dayoffSource&&!isAdd
        ?"เลือกวันหยุดแทนภายในเดือนเดียวกันก่อน หรือยกเลิกวันหยุดเดิม"
        :monthStart<=currentMonthStart
          ?"Employee Portal ไม่รองรับการขอย้อนหลัง"
          :"";
    }
    if(nextBtn){
      nextBtn.disabled=!!dayoffSource && !isAdd;
      nextBtn.title=dayoffSource&&!isAdd
        ?"วันที่หยุดแทนต้องอยู่ในเดือนเดียวกับวันหยุดเดิม"
        :"";
    }

    let html=["อา","จ","อ","พ","พฤ","ศ","ส"]
      .map(x=>`<div class="portal-swap-head">${x}</div>`)
      .join("");

    if(!dayoffRows.length){
      html+=`<div class="portal-dayoff-empty-v61512">
        <strong>${dayoffLoadStateV61512.calendarError?"ยังโหลดข้อมูลกะไม่ได้":"ไม่พบข้อมูลกะในเดือนนี้"}</strong>
        <span>${dayoffLoadStateV61512.calendarError?"กด “ลองใหม่” ด้านบนเพื่อเชื่อมข้อมูลอีกครั้ง":"กรุณาตรวจสอบตารางกะกับ Manager ก่อนส่งคำขอวันหยุด"}</span>
      </div>`;
    }else{
      for(let i=0;i<b.first;i++){
        html+='<div class="portal-swap-day blank"></div>';
      }

      for(let n=1;n<=b.days;n++){
        const date=`${b.start.slice(0,8)}${String(n).padStart(2,"0")}`;
        const r=dayoffRowV61494(date);
        const kind=dayoffKindV61494(r);
        const v=shiftVisual(r||{});
        const rowAllowed=dayoffRowRequestAllowedV61512(r);
        const rowLocked=dayoffRowLockedV61512(r);

        const isFuture=dayoffFutureOnlyV61506(date);
        let selectable=false;
        if(isAdd){
          selectable=balanceReady
            && requestable>0
            && kind==="work"
            && isFuture
            && rowAllowed;
        }else{
          selectable=isFuture
            && rowAllowed
            && (
              dayoffSource
                ? kind==="work"
                  && sameMonthV61506(dayoffSource,date)
                : kind==="off"
            );
        }

        const selected=isAdd
          ? date===dayoffTarget
          : date===dayoffSource || date===dayoffTarget;

        const stateClass=isAdd && date===dayoffTarget
          ? "target"
          : date===dayoffSource
            ? "source"
            : date===dayoffTarget
              ? "target"
              : "";

        const baseSub=
          rowLocked
            ? "ปิดรอบแล้ว"
            : kind==="off"
              ? "วันหยุด"
              : kind==="work"
                ? (v.time||"วันทำงาน")
                : kind==="ph"
                  ? "นักขัตฯ"
                  : kind==="leave"
                    ? "ลา"
                    : "ไม่มีข้อมูลกะ";
        const sub=!isFuture&&!rowLocked
          ? `${baseSub} • Manager`
          : baseSub;

        html+=`<button type="button"
          class="portal-swap-day ${kind} ${isFuture?"future":"past-locked"} ${rowLocked?"period-locked":""} ${selectable?"selectable":""} ${stateClass}"
          data-dayoff-date="${date}"
          ${selectable||selected?"":"disabled"}>
          <span>${n}</span>
          <strong>${esc(v.icon)} ${esc(v.display||v.code||(r?"-":"ไม่มีข้อมูล"))}</strong>
          <small>${esc(sub)}</small>
        </button>`;
      }
    }

    box.innerHTML=html;

    const preview=$("portalDayoffPreviewV61494");
    if(isAdd){
      preview.innerHTML=!balanceReady
        ? `<b>ยังเลือกขอหยุดเพิ่มไม่ได้</b><span>ระบบกำลังรอข้อมูลโควต้าจาก Backend</span><small>กดโหลดใหม่ แล้วระบบจะเปิดวันที่ที่เลือกได้อัตโนมัติ</small>`
        : dayoffTarget
          ? `<b>คำขอหยุดเพิ่ม</b><span>${fmtDate(dayoffTarget)} • ${esc(dayoffRowV61494(dayoffTarget)?.effective_shift_code||"กะทำงาน")} → วันหยุด</span><small>เมื่อ Manager อนุมัติ จะใช้โควต้า 1 วัน • คงเหลือโดยประมาณหลังอนุมัติ ${Math.max(0,requestable-1)} วัน</small>`
          : requestable>0
            ? `<b>เลือกวันที่ต้องการหยุดเพิ่ม</b><span>แตะวันที่เป็น “วันทำงาน” และอยู่หลังวันปัจจุบัน</span><small>ระบบจะตรวจโควต้าอีกครั้งตอน Manager จัดวันหยุด</small>`
            : `<b>โควต้าที่ขอได้อีก 0 วัน</b><span>ไม่สามารถเลือกวันทำงานเพื่อขอหยุดเพิ่มได้</span><small>เปลี่ยนรายการเป็น “สลับวันหยุด” ได้โดยไม่ใช้โควต้าเพิ่ม</small>`;
    }else{
      preview.innerHTML=dayoffSource
        ? dayoffTarget
          ? `<b>ตัวอย่างหลังสลับ</b><span>${fmtDate(dayoffSource)} • วันหยุด → วันทำงาน ${esc(dayoffRowV61494(dayoffSource)?.default_shift_code||"กะปกติ")}</span><span>${fmtDate(dayoffTarget)} • ${esc(dayoffRowV61494(dayoffTarget)?.effective_shift_code||"กะทำงาน")} → วันหยุด</span><small>เป็นการย้ายวันหยุด • โควต้าใช้ไปไม่เพิ่ม</small>`
          : `<b>วันหยุดเดิม ${fmtDate(dayoffSource)}</b><span>ต่อไปเลือกวันทำงานที่จะหยุดแทน</span>`
        : `<b>เริ่มจากเลือกวันหยุดเดิม</b><span>วันที่เลือกได้จะแสดงเฉพาะวันหยุดของคุณ</span>`;
    }

    const foot=$("portalDayoffFootnoteV61505");
    if(foot){
      foot.textContent=isAdd
        ? "ขอหยุดเพิ่มได้เฉพาะวันทำงานในเดือนที่เลือกและต้องเป็นวันถัดจากวันปัจจุบัน • หากย้อนหลังให้ Manager ดำเนินการ"
        : "สลับวันหยุด: วันหยุดเดิมและวันหยุดแทนต้องอยู่หลังวันปัจจุบันและภายในเดือนเดียวกัน • ย้อนหลังให้ Manager ดำเนินการ";
    }

    refreshTimeCertificationSubmitStateV61500();
  }

  function selectDayoffDateV61494(date){
    const mode=dayoffRequestModeV61505();
    const isAdd=mode==="ADD_DAYOFF";
    const selectedRow=dayoffRowV61494(date);
    const kind=dayoffKindV61494(selectedRow);

    if(!selectedRow){
      toast("วันที่นี้ยังไม่มีข้อมูลกะในระบบ กรุณาตรวจสอบกับ Manager","warning");
      return;
    }
    if(!dayoffRowRequestAllowedV61512(selectedRow)){
      toast(dayoffRowLockedV61512(selectedRow)?"เดือน/วันที่นี้ปิดรอบแล้ว ไม่สามารถส่งคำขอจาก Employee Portal":"วันที่นี้ไม่เปิดให้ขอเปลี่ยนวันหยุด","warning");
      return;
    }
    if(!dayoffFutureOnlyV61506(date)){
      toast("Employee Portal ไม่รองรับการขอวันหยุดย้อนหลังหรือวันปัจจุบัน กรุณาแจ้ง Manager","warning");
      return;
    }

    if(isAdd){
      if(dayoffLoadStateV61512.balanceError||!dayoffBalance){
        toast("ยังตรวจโควต้าวันหยุดไม่สำเร็จ กรุณาโหลดข้อมูลใหม่ก่อน","warning");
        return;
      }
      if(dayoffRequestableV61505()<=0){
        toast("โควต้าวันหยุดที่สามารถขอเพิ่มได้เป็น 0","warning");
        return;
      }
      if(kind!=="work"){
        toast("ขอหยุดเพิ่มได้เฉพาะวันที่เป็นวันทำงาน","warning");
        return;
      }
      dayoffSource="";
      dayoffTarget=dayoffTarget===date?"":date;
      $("portalRequestDate").value=dayoffTarget||"";
      $("portalDayoffTargetV61491").value=dayoffTarget||"";
      renderDayoffPickerV61494();
      renderEvidence();
      return;
    }

    if(!dayoffSource){
      if(kind!=="off"){
        toast("กรุณาเลือกวันหยุดเดิมก่อน","warning");
        return;
      }
      dayoffSource=date;
      dayoffTarget="";
    }else if(date===dayoffSource){
      dayoffSource="";
      dayoffTarget="";
    }else{
      if(!sameMonthV61506(dayoffSource,date)){
        toast("วันหยุดเดิมและวันที่หยุดแทนต้องอยู่ภายในเดือนเดียวกัน","warning");
        return;
      }
      if(kind!=="work"){
        toast("วันที่ต้องการหยุดแทนต้องเป็นวันทำงาน","warning");
        return;
      }
      dayoffTarget=date;
    }

    $("portalRequestDate").value=dayoffSource||"";
    $("portalDayoffTargetV61491").value=dayoffTarget||"";
    renderDayoffPickerV61494();
    renderEvidence();
  }

  function fillSubtype(){
    const type=$("portalRequestType").value;
    const sel=$("portalRequestSubtype");
    const map={
      TIME_ISSUE:[
        ["MISSING_IN","รับรองเวลา-เข้า"],
        ["MISSING_OUT","รับรองเวลา-ออก"],
        ["WRONG_TIME","รับรอง-เต็มวัน"]
      ],
      SPECIAL_WORK:[
        ["NORMAL_LATE_CUSTOMER","กะปกติ + งานลูกค้าช่วงดึก"],
        ["SPLIT_WAIT_NIGHT","กะเช้า + รอเข้ากะดึก"],
        ["HOUR_BASED","กะนับชั่วโมง"]
      ],
      DAYOFF_SWAP:[
        ["SWAP_DAYOFF","สลับวันหยุด"],
        ["ADD_DAYOFF","ขอหยุดเพิ่ม"]
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
      TIME_ISSUE:"ขอรับรองเวลา",
      SPECIAL_WORK:"แจ้งทำงานกะพิเศษ",
      DAYOFF_SWAP:"วันหยุด / สลับวันหยุด",
      LEAVE_REQUEST:"ขอลา"
    }[type]||"คำขอ / แจ้งข้อมูล";
    $("portalRequestModalTitle").textContent=title;

    updateLeavePartialFieldsV61493();
    renderEvidence();
  }

  function leaveWindowClientV61511(){
    const date=$('portalRequestDate')?.value||"";
    const start=$('portalLeaveStartV61491')?.value||"";
    const end=$('portalLeaveEndTimeV61491')?.value||"";
    if(!date||!start||!end)return{minutes:null,error:"กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด"};
    const r=portalEvidenceRowV61493(date)||row(date)||{};
    const shiftStart=String(r.shift_start_time||"").slice(0,5);
    const shiftEnd=String(r.shift_end_time||"").slice(0,5);
    if(!shiftStart||!shiftEnd)return{minutes:null,error:"ไม่พบเวลาเริ่ม/สิ้นสุดกะของวันที่เลือก"};
    const toMin=v=>{const [h,m]=String(v).split(":").map(Number);return h*60+m;};
    const ss=toMin(shiftStart),se0=toMin(shiftEnd),ls0=toMin(start),le0=toMin(end);
    const cross=se0<=ss;
    const se=se0+(cross?1440:0);
    let ls=ls0;if(cross&&ls<ss)ls+=1440;
    let le=le0;if(cross&&le<ss)le+=1440;
    if(le<=ls)le+=1440;
    if(ls<ss||le>se)return{minutes:le-ls,error:`ช่วงลาต้องอยู่ภายในกะ ${shiftStart}–${shiftEnd}`};
    if(ls===ss&&le===se)return{minutes:le-ls,error:"ช่วงลาครอบคลุมทั้งกะ กรุณาเลือกลาเต็มวัน"};
    return{minutes:le-ls,error:"",crossMidnight:cross,shiftStart,shiftEnd};
  }
  function leaveDurationMinutesV61508(){return leaveWindowClientV61511().minutes;}
  function leaveKnownDayBlockedV61508(date){
    const r=portalEvidenceRowV61493(date);
    if(!r)return null;
    const meta=dayMeta(r);
    if(meta.tone==="holiday")return"วันหยุดนักขัตฤกษ์";
    if(meta.tone==="off")return"วันหยุด";
    if(meta.tone==="leave")return"วันลา";
    if(String(r.is_workday)==="false")return"วันหยุด";
    return false;
  }

  function leaveDateRangeV61508(start,end){
    const out=[];
    if(!start||!end||end<start)return out;
    let d=start,guard=0;
    while(d<=end&&guard<40){
      out.push(d);
      d=addDays(d,1);
      guard++;
    }
    return out;
  }

  function ordinationEligibleV61508(workDate){
    const start=String(me?.start_date||"").slice(0,10);
    if(!start||!workDate)return null;
    const anniversary=new Date(`${start}T00:00:00`);
    anniversary.setFullYear(anniversary.getFullYear()+1);
    return workDate>=iso(anniversary);
  }

  function leaveValidationErrorV61508(){
    if($("portalRequestType")?.value!=="LEAVE_REQUEST")return"";

    const workDate=$("portalRequestDate")?.value||"";
    const endDate=$("portalLeaveEndV61491")?.value||workDate;
    const leaveType=normalizeLeaveTypeV61508($("portalLeaveTypeV61491")?.value);
    const subtype=$("portalRequestSubtype")?.value||"FULL_DAY";
    const rule=leaveRuleV61508(leaveType);

    if(!workDate)return"กรุณาเลือกวันที่เริ่มลา";
    if(workDate<today())return"ไม่สามารถขอลาย้อนหลังได้ • หากต้องการปรับตารางย้อนหลังให้แจ้ง Manager";
    if(!leaveType)return"กรุณาเลือกประเภทการลา";
    if(!endDate)return"กรุณาเลือกวันสิ้นสุด";
    if(endDate<workDate)return"วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่มลา";

    const dates=leaveDateRangeV61508(workDate,endDate);
    if(subtype==="PARTIAL_DAY"){
      const blocked=leaveKnownDayBlockedV61508(workDate);
      if(blocked)return`${fmtDate(workDate)} เป็น${blocked} • ลาบางส่วนใช้ได้เฉพาะวันทำงาน`;
    }else{
      const knownWorkdays=dates.filter(d=>leaveKnownDayBlockedV61508(d)===false).length;
      const knownBlocked=dates.filter(d=>!!leaveKnownDayBlockedV61508(d)).length;
      if(dates.length&&knownBlocked===dates.length&&knownWorkdays===0){
        return"ช่วงวันที่เลือกไม่มีวันทำงานที่ต้องปรับตารางกะ";
      }
    }

    if(leaveType==="ORDINATION"){
      const eligible=ordinationEligibleV61508(workDate);
      if(eligible===false)return"ลาอุปสมบทกำหนดอายุงาน 1 ปีขึ้นไป";
    }

    if(subtype==="PARTIAL_DAY"){
      if(!rule.partial)return`${rule.label} กำหนดให้ลาเต็มวันเท่านั้น`;
      if(endDate!==workDate)return"ลาบางส่วนต้องอยู่ภายในวันเดียวกัน";

      const window=leaveWindowClientV61511();
      const mins=window.minutes;
      if(window.error)return window.error;
      if(mins===null)return"กรุณาระบุเวลาเริ่มและเวลาสิ้นสุด";
      if(mins<=0)return"เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม";
      if(mins<rule.minMinutes)return`${rule.label}บางส่วนขั้นต่ำ ${rule.minMinutes===60?"1 ชั่วโมง":"3 ชั่วโมง"}`;
    }

    return"";
  }

  function syncLeavePolicyUIV61508(){
    const isLeave=$("portalRequestType")?.value==="LEAVE_REQUEST";
    const typeEl=$("portalLeaveTypeV61491");
    const subtypeEl=$("portalRequestSubtype");
    const endEl=$("portalLeaveEndV61491");
    const startDate=$("portalRequestDate")?.value||"";

    if($("portalRequestDate")){
      $("portalRequestDate").min=isLeave?today():"";
    }

    if(endEl){
      endEl.min=isLeave?(startDate||today()):"";
    }

    if(!isLeave){
      $("portalLeavePartialFieldsV61493")?.classList.add("hidden");
      return;
    }

    const rule=leaveRuleV61508(typeEl?.value);
    const partialOption=[...(subtypeEl?.options||[])].find(o=>o.value==="PARTIAL_DAY");

    if(partialOption){
      partialOption.disabled=!rule.partial;
      partialOption.textContent=rule.partial
        ?"ลาบางส่วน"
        :"ลาบางส่วน • ไม่รองรับ";
    }

    if(!rule.partial&&subtypeEl?.value==="PARTIAL_DAY"){
      subtypeEl.value="FULL_DAY";
    }

    const isPartial=subtypeEl?.value==="PARTIAL_DAY";

    if(endEl){
      if(isPartial&&startDate){
        endEl.value=startDate;
      }
      endEl.disabled=isPartial;
    }

    $("portalLeavePartialFieldsV61493")?.classList.toggle("hidden",!isPartial);

    const hint=$("portalLeaveRuleHintV61508");
    if(hint){
      let extra="";
      if(normalizeLeaveTypeV61508(typeEl?.value)==="ORDINATION"){
        const eligible=ordinationEligibleV61508(startDate);
        if(eligible===false)extra=" • อายุงานยังไม่ครบ 1 ปี";
        else if(eligible===true)extra=" • อายุงานผ่านเงื่อนไข";
      }
      hint.className=`portal-leave-rule-v61508 ${rule.partial?"partial":"full-only"}`;
      hint.innerHTML=`<strong>${esc(rule.label)}</strong><span>${esc(rule.note+extra)}</span>`;
    }

    refreshTimeCertificationSubmitStateV61500();
  }

  function updateLeavePartialFieldsV61493(){
    syncLeavePolicyUIV61508();
  }

  function leavePreviewArgsV61520(){
    const start=$("portalRequestDate")?.value||"";
    const subtype=$("portalRequestSubtype")?.value||"FULL_DAY";
    const leaveType=normalizeLeaveTypeV61508($("portalLeaveTypeV61491")?.value);
    const end=$("portalLeaveEndV61491")?.value||start;
    return {
      p_session_token:session(),
      p_work_date:start||null,
      p_request_subtype:subtype||null,
      p_leave_type:leaveType||null,
      p_end_date:end||start||null,
      p_leave_start_time:subtype==="PARTIAL_DAY"?($("portalLeaveStartV61491")?.value||null):null,
      p_leave_end_time:subtype==="PARTIAL_DAY"?($("portalLeaveEndTimeV61491")?.value||null):null,
      p_exclude_request_id:editingRequestId||null
    };
  }

  function leavePreviewIssueTextV61520(issue){
    const raw=String(issue?.message||issue?.code||"");
    return raw?friendly({message:raw}):"-";
  }

  function leaveDayTypeLabelV61520(value){
    const code=String(value||"").toUpperCase();
    return ({PUBLIC_HOLIDAY:"นักขัตฤกษ์",WEEKLY_OFF:"วันหยุด",LEAVE:"ลาเดิม",WORKDAY:"วันทำงาน",DAY_OFF:"วันหยุด",OFF:"วันหยุด"})[code]||value||"-";
  }

  function leaveTimelineV61520(partial){
    if(!partial)return"";
    const parse=v=>{if(!v)return NaN;const d=new Date(String(v).replace(" ","T"));return d.getTime();};
    const ss=parse(partial.shift_start_at),se=parse(partial.shift_end_at),ls=parse(partial.leave_start_at),le=parse(partial.leave_end_at);
    let before=35,leave=30,after=35;
    if([ss,se,ls,le].every(Number.isFinite)&&se>ss){
      const total=se-ss;
      before=Math.max(0,Math.min(100,((ls-ss)/total)*100));
      leave=Math.max(4,Math.min(100-before,((le-ls)/total)*100));
      after=Math.max(0,100-before-leave);
    }
    return `<div class="portal-leave-timeline-v61520" aria-label="ช่วงทำงานและช่วงลา">
      ${before>1?`<span class="work" style="width:${before.toFixed(2)}%">ทำงาน</span>`:""}
      <span class="leave" style="width:${leave.toFixed(2)}%">ลา</span>
      ${after>1?`<span class="work" style="width:${after.toFixed(2)}%">ทำงาน</span>`:""}
    </div>`;
  }

  function renderLeavePreviewV61520(){
    const box=$("portalLeavePreviewV61520");
    if(!box)return;
    if($("portalRequestType")?.value!=="LEAVE_REQUEST"){box.innerHTML="";return;}
    if(leavePreviewLoadingV61520){
      box.innerHTML=`<div class="portal-leave-preview-loading-v61520"><i></i><span>กำลังตรวจตารางกะ รอบระบบ และคำขอที่ทับซ้อน...</span></div>`;
      return;
    }
    const p=leavePreviewV61520;
    if(!p){
      box.innerHTML=`<div class="portal-leave-preview-empty-v61520">เลือกประเภท รูปแบบ และช่วงวันที่ลา เพื่อดูผลต่อตารางกะ</div>`;
      return;
    }
    const blockers=Array.isArray(p.blockers)?p.blockers:[];
    const warnings=Array.isArray(p.warnings)?p.warnings:[];
    const ok=p.allowed===true;
    const subtype=String(p.request_subtype||"").toUpperCase();
    const head=`<div class="portal-leave-preview-head-v61520 ${ok?"pass":"block"}"><div><i>${ok?"✓":"!"}</i><span><strong>${ok?"พร้อมส่งให้ Manager":"พบเงื่อนไขที่ต้องแก้"}</strong><small>${esc(p.leave_type_label||"การลา")} • Backend ตรวจล่าสุด ${esc(fmtDateTime(p.checked_at))}</small></span></div><b>${subtype==="PARTIAL_DAY"?"ลาบางส่วน":"ลาเต็มวัน"}</b></div>`;
    let main="";
    if(subtype==="PARTIAL_DAY"){
      const q=p.partial||{};
      const mins=Number(q.leave_minutes||0);
      const duration=mins?`${Math.floor(mins/60)} ชม.${mins%60?` ${mins%60} นาที`:""}`:"-";
      main=`<div class="portal-leave-partial-card-v61520">
        <div class="portal-leave-partial-meta-v61520"><div><span>กะปัจจุบัน</span><strong>${esc(q.shift_code||"-")} • ${esc(fmtTime(q.shift_start_at))}–${esc(fmtTime(q.shift_end_at))}</strong></div><div><span>ช่วงลา</span><strong>${esc(fmtTime(q.leave_start_at))}–${esc(fmtTime(q.leave_end_at))} • ${esc(duration)}</strong></div></div>
        ${leaveTimelineV61520(q)}
        <small>กะเดิมยังคงอยู่ • Manager จะใช้ Partial Leave Overlay เฉพาะช่วงเวลาที่ลา</small>
      </div>`;
    }else{
      const days=Array.isArray(p.days)?p.days:[];
      main=`<div class="portal-leave-summary-v61520"><div><span>วันที่ปรับเป็นลา</span><strong>${Number(p.affected_workday_count||0).toLocaleString("th-TH")}</strong></div><div><span>วันหยุด / PH / ลาเดิม</span><strong>${Number(p.skipped_nonworkday_count||0).toLocaleString("th-TH")}</strong></div></div>
      <div class="portal-leave-days-v61520">${days.map(d=>{const apply=d.action==="SET_LV";return `<article class="${apply?"apply":"skip"}"><span>${esc(fmtDate(d.work_date))}</span><strong>${esc(d.current_shift_code||leaveDayTypeLabelV61520(d.current_day_type))} ${apply?"→ LV":"→ ไม่เปลี่ยน"}</strong><small>${apply?`${esc(fmtTime(d.shift_start_time))}–${esc(fmtTime(d.shift_end_time))}`:esc(leaveDayTypeLabelV61520(d.current_day_type))}</small></article>`;}).join("")}</div>`;
    }
    const issues=(blockers.length||warnings.length)?`<div class="portal-leave-issues-v61520">${blockers.map(x=>`<div class="block"><i>!</i><span>${esc(leavePreviewIssueTextV61520(x))}</span></div>`).join("")}${warnings.map(x=>`<div class="warn"><i>△</i><span>${esc(leavePreviewIssueTextV61520(x))}</span></div>`).join("")}</div>`:"";
    box.innerHTML=head+main+issues+`<div class="portal-leave-hr-note-v61520"><i>HR</i><span><strong>TimeAttendance ใช้เพื่อปรับตารางกะ</strong><small>การลาอย่างเป็นทางการยังต้องดำเนินการใน HR Connect และเป็นไปตามสายอนุมัติของบริษัท</small></span></div>`;
  }

  async function loadLeavePreviewV61520({force=false,quiet=false}={}){
    if($("portalRequestType")?.value!=="LEAVE_REQUEST")return null;
    const args=leavePreviewArgsV61520();
    const localError=leaveValidationErrorV61508();
    if(!args.p_work_date||!args.p_leave_type||!args.p_request_subtype){
      leavePreviewV61520=null;leavePreviewLoadingV61520=false;renderLeavePreviewV61520();return null;
    }
    if(args.p_request_subtype==="PARTIAL_DAY"&&(!args.p_leave_start_time||!args.p_leave_end_time)){
      leavePreviewV61520=null;leavePreviewLoadingV61520=false;renderLeavePreviewV61520();return null;
    }
    if(localError&&/กรุณาเลือก|กรุณาระบุ/.test(localError)){
      leavePreviewV61520=null;leavePreviewLoadingV61520=false;renderLeavePreviewV61520();return null;
    }
    const seq=++leavePreviewSeqV61520;
    leavePreviewLoadingV61520=true;renderLeavePreviewV61520();
    try{
      const data=await rpc("ta_portal_preview_leave_request_v61520",args);
      if(seq!==leavePreviewSeqV61520)return leavePreviewV61520;
      leavePreviewV61520=data||null;
      return leavePreviewV61520;
    }catch(e){
      if(seq!==leavePreviewSeqV61520)return leavePreviewV61520;
      leavePreviewV61520={allowed:false,blockers:[{code:"LEAVE_PREVIEW_LOAD_ERROR",message:friendly(e)}],warnings:[],request_subtype:args.p_request_subtype,leave_type_label:leaveTypeLabelV61508(args.p_leave_type),checked_at:new Date().toISOString(),version:"V6.15.21"};
      if(!quiet)toast("ตรวจเงื่อนไขการลากับ Backend ไม่สำเร็จ • "+friendly(e),"error");
      return leavePreviewV61520;
    }finally{
      if(seq===leavePreviewSeqV61520){leavePreviewLoadingV61520=false;renderLeavePreviewV61520();if($("portalRequestType")?.value==="LEAVE_REQUEST")renderEvidence();refreshTimeCertificationSubmitStateV61500();}
    }
  }

  function scheduleLeavePreviewV61520(){
    if(leavePreviewTimerV61520)clearTimeout(leavePreviewTimerV61520);
    leavePreviewV61520=null;
    renderLeavePreviewV61520();
    if($("portalRequestType")?.value!=="LEAVE_REQUEST")return;
    leavePreviewTimerV61520=setTimeout(()=>loadLeavePreviewV61520({quiet:true}),260);
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

  function certificationStateV61509(date){
    return certificationStateCacheV61509.get(
      String(date||"").slice(0,10)
    )||null;
  }

  function certificationStateMessageV61509(state){
    if(!state)return"";

    const reason=String(state.reason||"").toUpperCase();
    const deadline=state.attendance_certify_deadline
      ? fmtDate(state.attendance_certify_deadline)
      : "";

    if(reason==="FUTURE_DATE"){
      return"ไม่สามารถขอรับรองเวลาล่วงหน้าได้";
    }

    if(reason==="CLOSED_MANUAL"){
      return deadline
        ? `รอบรับรองเวลาถูกปิดโดย HR • กำหนดเดิม ${deadline}`
        : "รอบรับรองเวลาถูกปิดโดย HR";
    }

    if(reason==="CLOSED_DEADLINE"){
      return deadline
        ? `พ้นกำหนดรับรองเวลา ${deadline}`
        : "พ้นกำหนดรับรองเวลาของรอบระบบแล้ว";
    }

    if(reason==="DUE_SOON"){
      return deadline
        ? `รอบรับรองเวลาเปิดถึง ${deadline} • เหลือ ${Number(state.remaining_days||0)} วัน`
        : "รอบรับรองเวลาใกล้ครบกำหนด";
    }

    if(reason==="OPEN"&&deadline){
      return `รอบรับรองเวลาเปิดถึง ${deadline}`;
    }

    return"";
  }

  async function loadCertificationStateV61509(
    date,
    {force=false}={}
  ){
    const key=String(date||"").slice(0,10);
    if(!key)return null;

    if(!force&&certificationStateCacheV61509.has(key)){
      return certificationStateCacheV61509.get(key);
    }

    try{
      const state=await rpc(
        "ta_portal_get_time_certification_state_v61509",
        {
          p_session_token:session(),
          p_work_date:key
        }
      );
      certificationStateCacheV61509.set(key,state||null);
      return state||null;
    }catch(e){
      const state={
        allowed:false,
        reason:"STATE_LOAD_ERROR",
        error:friendly(e)
      };
      certificationStateCacheV61509.set(key,state);
      return state;
    }finally{
      if(
        $("portalRequestType")?.value==="TIME_ISSUE"
        && $("portalRequestDate")?.value===key
      ){
        renderEvidence();
      }
    }
  }

  function timeCertificationAllowedV61500(r){
    if(!r)return true;
    const dayType=String(r.day_type||"").toUpperCase();
    const shift=String(r.effective_shift_code||"").toUpperCase();
    if(r.is_public_holiday===true||r.is_weekly_off===true||r.is_workday===false)return false;
    if(["WEEKLY_OFF","PUBLIC_HOLIDAY","HOLIDAY","LEAVE","DAY_OFF","OFF"].includes(dayType))return false;
    if(["LV","LEAVE","HOL","OFF","OSTD","OS043","OS134","OS135"].includes(shift))return false;
    return true;
  }

  function refreshTimeCertificationSubmitStateV61500(){
    const type=$("portalRequestType")?.value;
    const btn=$("portalRequestSubmitBtnV61494");
    const requestDate=$("portalRequestDate")?.value||"";
    const r=portalEvidenceRowV61493(requestDate);
    const timeBlocked=type==="TIME_ISSUE"&&r&&!timeCertificationAllowedV61500(r);
    const certState=type==="TIME_ISSUE"
      ? certificationStateV61509(requestDate)
      : null;
    const certPeriodBlocked=
      type==="TIME_ISSUE"
      && certState
      && certState.allowed===false;
    const dayoffCalendarLoadBlocked=
      type==="DAYOFF_SWAP"
      && !!dayoffLoadStateV61512.calendarError;
    const dayoffBalanceLoadBlocked=
      type==="DAYOFF_SWAP"
      && dayoffRequestModeV61505()==="ADD_DAYOFF"
      && (!!dayoffLoadStateV61512.balanceError||!dayoffBalance);
    const addDayoffBlocked=
      type==="DAYOFF_SWAP"
      && dayoffRequestModeV61505()==="ADD_DAYOFF"
      && !!dayoffBalance
      && dayoffRequestableV61505()<=0;
    const dayoffDateBlocked=
      type==="DAYOFF_SWAP"
      && dayoffRequestDateBlockedV61506();
    const leaveError=
      type==="LEAVE_REQUEST"
        ? leaveValidationErrorV61508()
        : "";
    const leaveBlocked=!!leaveError;
    const leaveBackendBlocked=type==="LEAVE_REQUEST"&&!!leavePreviewV61520&&leavePreviewV61520.allowed===false;
    const leavePreviewBusy=type==="LEAVE_REQUEST"&&leavePreviewLoadingV61520;
    const blocked=
      timeBlocked
      || certPeriodBlocked
      || dayoffCalendarLoadBlocked
      || dayoffBalanceLoadBlocked
      || addDayoffBlocked
      || dayoffDateBlocked
      || leaveBlocked
      || leaveBackendBlocked
      || leavePreviewBusy;
    if(btn){
      btn.disabled=!!blocked;
      btn.classList.toggle("disabled",!!blocked);
      btn.title=timeBlocked
        ?"วันหยุด วันนักขัตฤกษ์ และวันลา ไม่สามารถขอรับรองเวลาได้"
        :certPeriodBlocked
          ?(certificationStateMessageV61509(certState)||certState.error||"รอบรับรองเวลาไม่เปิดใช้งาน")
        :dayoffCalendarLoadBlocked
          ?"กรุณาโหลดข้อมูลตารางกะล่าสุดให้สำเร็จก่อนส่งคำขอ"
          :dayoffBalanceLoadBlocked
            ?"กรุณาโหลดข้อมูลโควต้าวันหยุดให้สำเร็จก่อนส่งคำขอหยุดเพิ่ม"
            :addDayoffBlocked
              ?"โควต้าวันหยุดที่สามารถขอเพิ่มได้เป็น 0"
              :dayoffDateBlocked
                ?"วันที่เลือกไม่ผ่านเงื่อนไข Employee Portal หรือรอบระบบถูกล็อก"
                :leaveBlocked
              ?leaveError
              :leavePreviewBusy
                ?"กำลังตรวจเงื่อนไขการลากับ Backend"
                :leaveBackendBlocked
                  ?leavePreviewIssueTextV61520((leavePreviewV61520.blockers||[])[0])
                  :"";
    }
  }

  function renderEvidence(){
    const type=$("portalRequestType").value;
    const d=$("portalRequestDate").value;
    const r=portalEvidenceRowV61493(d);
    const box=$("portalRequestEvidence");
    box.classList.remove("blocked");

    if(!d){
      box.textContent="เลือกวันที่เพื่อดูข้อมูลกะในระบบ";
      return;
    }

    refreshTimeCertificationSubmitStateV61500();

    if(type==="DAYOFF_SWAP"){
      const mode=dayoffRequestModeV61505();
      const target=$("portalDayoffTargetV61491")?.value||"";
      if(mode==="ADD_DAYOFF"){
        const q=dayoffBalance||{};
        box.innerHTML=target
          ? `<b>ขอหยุดเพิ่ม</b><br>${esc(portalEvidenceLineV61493(target,"วันที่ต้องการหยุด"))}<br><small>โควต้าคงเหลือ ${Number(q.balance_days||0)} วัน • ขอได้อีก ${dayoffRequestableV61505()} วัน • Manager จะตรวจโควต้าอีกครั้งก่อนจัดวันหยุด</small>`
          : `<b>ขอหยุดเพิ่มจากโควต้าคงเหลือ</b><br><small>เลือกวันทำงานจากปฏิทินด้านล่าง</small>`;
      }else{
        box.innerHTML=`<b>ตรวจวันหยุดที่จะสลับ</b><br>${esc(portalEvidenceLineV61493(d,"วันเดิม"))}<br>${esc(portalEvidenceLineV61493(target,"วันที่ต้องการหยุดแทน"))}<br><small>คำขอจะไม่แก้กะเอง Manager ต้องตรวจโควต้าและเงื่อนไขกะก่อนอนุมัติ</small>`;
      }
      return;
    }

    if(type==="LEAVE_REQUEST"){
      const err=leaveValidationErrorV61508();
      const leaveType=leaveTypeLabelV61508($("portalLeaveTypeV61491")?.value);
      const subtype=$("portalRequestSubtype")?.value||"FULL_DAY";
      if(err){
        box.classList.add("blocked");
        box.innerHTML=`<b>${esc(fmtDate(d))}</b> • ${esc(leaveType)}<br><strong>${esc(err)}</strong><br><small>Employee Portal ใช้เพื่อแจ้งปรับตารางกะเท่านั้น • การลาจริงต้องคีย์ใน HR Connect</small>`;
      }else if(leavePreviewV61520){
        box.classList.toggle("blocked",leavePreviewV61520.allowed!==true);
        box.innerHTML=`<b>${esc(subtype==="PARTIAL_DAY"?"ลาบางส่วน":"ลาเต็มวัน")}</b> • ${esc(leaveType)}<br><strong>${leavePreviewV61520.allowed===true?"Backend ตรวจเงื่อนไขพร้อมส่ง":"พบเงื่อนไขที่ต้องแก้"}</strong><br><small>รายละเอียดผลต่อตารางกะแสดงด้านล่าง</small>`;
      }else{
        box.innerHTML=r
          ? `<b>${esc(fmtDate(d))}</b> • กะ ${esc(r.effective_shift_code||"-")} ${esc(fmtTime(r.shift_start_time))}–${esc(fmtTime(r.shift_end_time))}<br><small>${esc(leaveType)} • ระบบจะตรวจช่วงวันที่และรอบระบบกับ Backend ก่อนส่ง</small>`
          : `${esc(fmtDate(d))} • ${esc(leaveType)} • กำลังรอข้อมูลกะ`;
      }
      renderLeavePreviewV61520();
      refreshTimeCertificationSubmitStateV61500();
      return;
    }

    if(type==="TIME_ISSUE"){
      const periodState=certificationStateV61509(d);
      const periodMessage=certificationStateMessageV61509(periodState);

      if(periodState&&periodState.allowed===false){
        box.classList.add("blocked");
        box.innerHTML=`
          <b>${esc(fmtDate(d))}</b>
          ${r?` • ${esc(primaryShiftLabel(r))}`:""}
          <br>
          <strong>ไม่สามารถขอรับรองเวลาได้</strong>
          <br>
          <small>${esc(periodMessage||periodState.error||"รอบรับรองเวลาไม่เปิดใช้งาน")}</small>`;
      }else if(r&&!timeCertificationAllowedV61500(r)){
        box.classList.add("blocked");
        box.innerHTML=`<b>${esc(fmtDate(d))}</b> • ${esc(primaryShiftLabel(r))}<br><strong>ไม่สามารถขอรับรองเวลาได้</strong><br><small>วันหยุด วันหยุดนักขัตฤกษ์ และวันลา ไม่สามารถใช้ Time Certification ได้</small>`;
      }else{
        box.innerHTML=r
          ? `<b>${esc(fmtDate(d))}</b> • ${esc(primaryShiftLabel(r))} ${esc(fmtTime(r.shift_start_time))}–${esc(fmtTime(r.shift_end_time))}<br>Raw Punch เข้า <b>${esc(fmtTime(r.first_in))}</b> • ออก <b>${esc(fmtTime(r.last_out))}</b>${periodMessage?`<br><span class="portal-cert-period-note-v61509">${esc(periodMessage)}</span>`:""}<br><small>ข้อมูลนี้อ่านอย่างเดียว Manager จะเป็นผู้รับรองเวลา</small>`
          : `${esc(fmtDate(d))} • ยังไม่พบข้อมูลกะ/Attendance`;
      }
      refreshTimeCertificationSubmitStateV61500();
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
    editingRequestId=null;dayoffSource="";dayoffTarget="";leavePreviewV61520=null;leavePreviewLoadingV61520=false;leavePreviewSeqV61520++;if(leavePreviewTimerV61520)clearTimeout(leavePreviewTimerV61520);
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
    editingRequestStatusV61519="";
    if(existing){
      editingRequestId=existing.request_id;
      editingRequestStatusV61519=String(existing.status||"").toUpperCase();
      type=existing.request_type;date=String(existing.work_date).slice(0,10);
      $("portalRequestDate").value=date;$("portalRequestReason").value=existing.reason||"";
      const d=existing.detail||{};
      $("portalSpecialStart").value=(d.reported_start_time||"").slice(0,5);
      $("portalSpecialEnd").value=(d.reported_end_time||"").slice(0,5);
      $("portalSpecialLocation").value=d.customer_location||"";
      $("portalLeaveTypeV61491").value=normalizeLeaveTypeV61508(d.leave_type||d.leave_type_label)||"";
      $("portalLeaveEndV61491").value=d.end_date||date;
      $("portalLeaveStartV61491").value=(d.leave_start_time||"").slice(0,5);
      $("portalLeaveEndTimeV61491").value=(d.leave_end_time||"").slice(0,5);
      $("portalRequestSubmitBtnV61494").textContent=editingRequestStatusV61519==="RETURNED"?"ส่งกลับให้ Manager":"บันทึกการแก้ไข";
      if(type==="DAYOFF_SWAP"){
        if(String(existing.request_subtype||"").toUpperCase()==="ADD_DAYOFF"){
          dayoffSource="";
          dayoffTarget=date;
        }else{
          dayoffSource=date;
          dayoffTarget=d.target_date||"";
        }
      }
    }
    $("portalRequestType").value=type;fillSubtype();
    if(existing)$("portalRequestSubtype").value=existing.request_subtype||$("portalRequestSubtype").value;
    if(type==="DAYOFF_SWAP"){
      await loadDayoffPickerV61494(date);
      if(dayoffRequestModeV61505()==="ADD_DAYOFF"){
        $("portalRequestDate").value=dayoffTarget||date;
        $("portalDayoffTargetV61491").value=dayoffTarget||date;
      }else{
        $("portalRequestDate").value=dayoffSource;
        $("portalDayoffTargetV61491").value=dayoffTarget;
      }
      renderDayoffPickerV61494();
    }
    if(type==="TIME_ISSUE"){
      await loadCertificationStateV61509(
        $("portalRequestDate").value,
        {force:true}
      );
    }
    updateLeavePartialFieldsV61493();
    if(type==="LEAVE_REQUEST")await loadLeavePreviewV61520({force:true,quiet:true});
    renderEvidence();
    $("portalRequestModal").classList.remove("hidden");
  }

  function closeRequest(){$("portalRequestModal").classList.add("hidden");editingRequestId=null;editingRequestStatusV61519="";}
  async function submitRequest(e){
    e.preventDefault();
    const type=$("portalRequestType").value,workDate=$("portalRequestDate").value;
    const detail={source:"EMPLOYEE_PORTAL_V61494"};
    const evidence=row(workDate)||dayoffRowV61494(workDate)||null;
    if(type==="TIME_ISSUE"){
      const certState=await loadCertificationStateV61509(
        workDate,
        {force:true}
      );

      if(certState&&certState.allowed===false){
        return toast(
          certificationStateMessageV61509(certState)
          || certState.error
          || "รอบรับรองเวลาไม่เปิดใช้งาน",
          "warning"
        );
      }

      if(evidence&&!timeCertificationAllowedV61500(evidence)){
        return toast("วันหยุด วันหยุดนักขัตฤกษ์ และวันลา ไม่สามารถขอรับรองเวลาได้","warning");
      }
      detail.punch_snapshot={in:evidence?.first_in||null,out:evidence?.last_out||null};
      detail.certification_request_label=subtype({request_subtype:$("portalRequestSubtype").value});
    }
    if(type==="SPECIAL_WORK"){
      detail.reported_start_time=$("portalSpecialStart").value||null;
      detail.reported_end_time=$("portalSpecialEnd").value||null;
      detail.customer_location=$("portalSpecialLocation").value.trim()||null;
      detail.reported_time_is_reference_only=true;
    }
    if(type==="DAYOFF_SWAP"){
      const mode=dayoffRequestModeV61505();
      if(dayoffLoadStateV61512.calendarError)return toast("กรุณาโหลดข้อมูลตารางกะล่าสุดให้สำเร็จก่อนส่งคำขอ","warning");
      if(mode==="ADD_DAYOFF"&&(dayoffLoadStateV61512.balanceError||!dayoffBalance))return toast("กรุณาโหลดข้อมูลโควต้าวันหยุดให้สำเร็จก่อนส่งคำขอหยุดเพิ่ม","warning");
      detail.target_date=dayoffTarget||$("portalDayoffTargetV61491").value||null;
      detail.dayoff_request_mode=mode==="ADD_DAYOFF"?"ADD":"SWAP";
      detail.quota_snapshot=dayoffBalance?{
        month_quota_days:dayoffBalance.month_quota_days,
        used_days:dayoffBalance.used_days,
        balance_days:dayoffBalance.balance_days,
        pending_add_dayoff_requests:dayoffBalance.pending_add_dayoff_requests,
        requestable_balance_days:dayoffBalance.requestable_balance_days
      }:null;

      if(mode==="ADD_DAYOFF"){
        if(dayoffRequestableV61505()<=0)return toast("โควต้าวันหยุดที่สามารถขอเพิ่มได้เป็น 0","warning");
        if(!detail.target_date)return toast("กรุณาเลือกวันที่ต้องการหยุดเพิ่ม","warning");
        if(!dayoffFutureOnlyV61506(detail.target_date))return toast("ขอหยุดเพิ่มได้เฉพาะวันที่หลังวันปัจจุบัน หากย้อนหลังให้แจ้ง Manager","warning");
        if(!dayoffRowRequestAllowedV61512(dayoffRowV61494(detail.target_date)))return toast("วันที่เลือกไม่เปิดให้ส่งคำขอ หรือรอบระบบถูกปิดแล้ว","warning");
        if(dayoffKindV61494(dayoffRowV61494(detail.target_date))!=="work")return toast("ขอหยุดเพิ่มได้เฉพาะวันที่เป็นวันทำงาน","warning");
        detail.target_work_shift_code=dayoffRowV61494(detail.target_date)?.effective_shift_code||null;
      }else{
        if(!dayoffSource||!detail.target_date)return toast("กรุณาเลือกวันหยุดเดิมและวันที่ต้องการหยุดแทน","warning");
        if(!dayoffFutureOnlyV61506(dayoffSource)||!dayoffFutureOnlyV61506(detail.target_date))return toast("สลับวันหยุดได้เฉพาะวันที่หลังวันปัจจุบัน หากย้อนหลังให้แจ้ง Manager","warning");
        if(!sameMonthV61506(dayoffSource,detail.target_date))return toast("วันหยุดเดิมและวันที่หยุดแทนต้องอยู่ภายในเดือนเดียวกัน","warning");
        if(!dayoffRowRequestAllowedV61512(dayoffRowV61494(dayoffSource))||!dayoffRowRequestAllowedV61512(dayoffRowV61494(detail.target_date)))return toast("วันใดวันหนึ่งไม่เปิดให้สลับ หรือรอบระบบถูกปิดแล้ว","warning");
        if(dayoffKindV61494(dayoffRowV61494(dayoffSource))!=="off")return toast("วันหยุดเดิมไม่ใช่วันหยุดที่สามารถสลับได้","warning");
        if(dayoffKindV61494(dayoffRowV61494(detail.target_date))!=="work")return toast("วันที่ต้องการหยุดแทนต้องเป็นวันทำงาน","warning");
        detail.source_shift_code=dayoffRowV61494(dayoffSource)?.effective_shift_code||null;
        detail.source_replacement_shift_code=dayoffRowV61494(dayoffSource)?.default_shift_code||null;
        detail.target_work_shift_code=dayoffRowV61494(detail.target_date)?.effective_shift_code||null;
      }
    }
    if(type==="LEAVE_REQUEST"){
      const leaveError=leaveValidationErrorV61508();
      if(leaveError)return toast(leaveError,"warning");

      const leavePreview=await loadLeavePreviewV61520({force:true});
      if(!leavePreview||leavePreview.allowed!==true){
        const issue=(leavePreview?.blockers||[])[0];
        return toast(issue?leavePreviewIssueTextV61520(issue):"คำขอลายังไม่ผ่านการตรวจสอบจาก Backend","warning");
      }

      detail.leave_type=normalizeLeaveTypeV61508($("portalLeaveTypeV61491")?.value);
      detail.leave_type_label=leaveTypeLabelV61508(detail.leave_type);
      detail.end_date=$("portalLeaveEndV61491")?.value||workDate;
      detail.leave_start_time=$("portalLeaveStartV61491")?.value||null;
      detail.leave_end_time=$("portalLeaveEndTimeV61491")?.value||null;
      Object.assign(detail,leavePreview.submit_detail_patch||{});
      detail.leave_preview_snapshot={
        allowed:true,
        affected_workday_count:leavePreview.affected_workday_count||0,
        skipped_nonworkday_count:leavePreview.skipped_nonworkday_count||0,
        canonical_conflict_ok:leavePreview.canonical_conflict_ok!==false,
        checked_at:leavePreview.checked_at||null,
        version:leavePreview.version||"V6.15.21"
      };
      detail.leave_schedule_notice_only=true;
      detail.leave_hr_system="HR Connect";
      detail.leave_hr_approval_level="หัวหน้างานระดับฝ่าย";
    }
    loading(true,editingRequestId?"กำลังบันทึกการแก้ไข...":"กำลังส่งให้ Manager...");
    try{
      const args={p_session_token:session(),p_work_date:workDate,p_request_type:type,p_request_subtype:$("portalRequestSubtype").value,p_reason:$("portalRequestReason").value.trim(),p_detail:detail};
      if(editingRequestId)await rpc("ta_portal_update_request_v61494",{...args,p_request_id:editingRequestId});
      else await rpc("ta_portal_submit_request_v61482",args);
      const wasEditing=!!editingRequestId;
      const wasReturned=editingRequestStatusV61519==="RETURNED";
      closeRequest();
      toast(wasReturned?"แก้ไขและส่งกลับให้ Manager แล้ว":(wasEditing?"แก้ไขคำขอแล้ว":"ส่งให้ Manager แล้ว"),"success");
      await loadRequests();await setPortalSyncBaselineV61513();navigate("requests");
    }catch(err){toast(friendly(err),"error");}
    finally{loading(false);}
  }
  async function cancelRequest(id){if(!confirm("ยืนยันยกเลิกคำขอนี้?"))return;try{await rpc("ta_portal_cancel_request_v61482",{p_session_token:session(),p_request_id:id});toast("ยกเลิกคำขอแล้ว","success");await loadRequests();await setPortalSyncBaselineV61513();}catch(e){toast(friendly(e),"error");}}
  async function markRead(id){try{await rpc("ta_portal_mark_notification_read_v61482",{p_session_token:session(),p_notification_id:id});const n=notifications.find(x=>x.notification_id===id);if(n)n.is_read=true;renderNotifications();await setPortalSyncBaselineV61513();}catch(_){}}

  async function focusPortalRequestV61519(requestId){
    if(!requestId)return;
    navigate("requests");
    await loadRequests();
    requestFilter="";
    document.querySelectorAll("[data-request-filter]").forEach(x=>x.classList.toggle("active",!x.dataset.requestFilter));
    renderRequests();
    requestAnimationFrame(()=>{
      const card=document.querySelector(`[data-portal-request-id="${CSS.escape(String(requestId))}"]`);
      if(!card)return;
      card.classList.add("focus-v61519");
      card.scrollIntoView({behavior:"smooth",block:"center"});
      setTimeout(()=>card.classList.remove("focus-v61519"),2200);
    });
  }

  function bind(){document.querySelectorAll("[data-auth-tab]").forEach(b=>b.addEventListener("click",()=>setAuthTab(b.dataset.authTab)));$("portalActivateForm").addEventListener("submit",activate);$("portalLoginForm").addEventListener("submit",login);$("portalLogoutBtn").addEventListener("click",logout);$("portalRefreshBtn").addEventListener("click",refreshAll);document.addEventListener("click",async e=>{const homeDay=e.target.closest("[data-home-day-v61509]");if(homeDay){await setHomeFocusDateV61509(Number(homeDay.dataset.homeDayV61509||0));return;}const n=e.target.closest("[data-portal-nav]");if(n){navigate(n.dataset.portalNav);return;}const q=e.target.closest("[data-request-quick]");if(q){openRequest(q.dataset.requestQuick,today());return;}const cal=e.target.closest("[data-calendar-date]");if(cal){selectedCalendarDate=cal.dataset.calendarDate;renderCalendar();await loadCalendarPunchDetailV61501(selectedCalendarDate);return;}const syncSchedule=e.target.closest("[data-schedule-sync-v61507]");if(syncSchedule){await syncScheduleV61507({force:true});return;}const retryAtt=e.target.closest("[data-retry-attendance-v61504]");if(retryAtt){attendanceByDateV61503.clear();attendanceLoadErrorV61504="";renderTime();await loadAttendanceRangeV61503({force:true});return;}if(e.target.closest("[data-close-request]")){closeRequest();return;}const ed=e.target.closest("[data-edit-request]");if(ed){const req=requests.find(x=>String(x.request_id)===String(ed.dataset.editRequest));if(req)await openRequest(req.request_type,String(req.work_date).slice(0,10),req);return;}const retryDayoff=e.target.closest("[data-dayoff-retry-v61512]");if(retryDayoff){retryDayoff.disabled=true;const ok=await loadDayoffPickerV61494(iso(dayoffPickerMonth),{quiet:true});if(ok&&!dayoffLoadStateV61512.balanceError)toast("อัปเดตข้อมูลวันหยุดล่าสุดแล้ว","success");return;}const dd=e.target.closest("[data-dayoff-date]");if(dd){selectDayoffDateV61494(dd.dataset.dayoffDate);return;}const dm=e.target.closest("[data-dayoff-month-nav]");if(dm){const delta=Number(dm.dataset.dayoffMonthNav||0);if(dayoffSource&&dayoffRequestModeV61505()==="SWAP_DAYOFF"){toast("วันที่หยุดแทนต้องอยู่ในเดือนเดียวกับวันหยุดเดิม กรุณาเลือกวันหยุดแทนหรือยกเลิกวันเดิมก่อน","info");return;}const candidate=new Date(dayoffPickerMonth.getFullYear(),dayoffPickerMonth.getMonth()+delta,1);if(iso(candidate)<dayoffCurrentMonthStartV61506()){toast("Employee Portal ไม่รองรับการขอย้อนหลัง กรุณาแจ้ง Manager","warning");return;}dayoffPickerMonth=candidate;dayoffSource="";dayoffTarget="";await loadDayoffPickerV61494(iso(dayoffPickerMonth));return;}const c=e.target.closest("[data-cancel-request]");if(c){cancelRequest(c.dataset.cancelRequest);return;}const r=e.target.closest("[data-read-notification]");if(r){await markRead(r.dataset.readNotification);const requestId=r.getAttribute("data-notification-request-v61519");if(requestId)await focusPortalRequestV61519(requestId);return;}});$("portalNewRequestBtn").addEventListener("click",()=>openRequest("TIME_ISSUE",today()));$("portalRequestType").addEventListener("change",async()=>{fillSubtype();if($("portalRequestType").value==="TIME_ISSUE"&&$("portalRequestDate").value){await loadCertificationStateV61509($("portalRequestDate").value,{force:true});renderEvidence();}if($("portalRequestType").value==="LEAVE_REQUEST")scheduleLeavePreviewV61520();});$("portalRequestSubtype").addEventListener("change",async()=>{updateLeavePartialFieldsV61493();if($("portalRequestType").value==="DAYOFF_SWAP"){dayoffSource="";dayoffTarget="";$("portalRequestDate").value="";$("portalDayoffTargetV61491").value="";await loadDayoffPickerV61494(iso(dayoffPickerMonth));renderDayoffPickerV61494();}if($("portalRequestType").value==="LEAVE_REQUEST")scheduleLeavePreviewV61520();renderEvidence();});$("portalRequestDate").addEventListener("change",async()=>{if($("portalRequestType").value==="LEAVE_REQUEST"){if(!$("portalLeaveEndV61491").value||$("portalRequestSubtype").value==="PARTIAL_DAY")$("portalLeaveEndV61491").value=$("portalRequestDate").value;syncLeavePolicyUIV61508();scheduleLeavePreviewV61520();}if($("portalRequestType").value==="TIME_ISSUE"&&$("portalRequestDate").value){await loadCertificationStateV61509($("portalRequestDate").value,{force:true});}renderEvidence();});$("portalLeaveTypeV61491")?.addEventListener("change",()=>{syncLeavePolicyUIV61508();scheduleLeavePreviewV61520();renderEvidence();});$("portalLeaveEndV61491")?.addEventListener("change",()=>{syncLeavePolicyUIV61508();scheduleLeavePreviewV61520();renderEvidence();});$("portalLeaveStartV61491")?.addEventListener("change",()=>{syncLeavePolicyUIV61508();scheduleLeavePreviewV61520();renderEvidence();});$("portalLeaveEndTimeV61491")?.addEventListener("change",()=>{syncLeavePolicyUIV61508();scheduleLeavePreviewV61520();renderEvidence();});$("portalDayoffTargetV61491")?.addEventListener("change",renderEvidence);$("portalRequestForm").addEventListener("submit",submitRequest);document.querySelectorAll("[data-request-filter]").forEach(b=>b.addEventListener("click",()=>{requestFilter=b.dataset.requestFilter;document.querySelectorAll("[data-request-filter]").forEach(x=>x.classList.toggle("active",x===b));renderRequests();}));$("portalPrevMonth").addEventListener("click",async()=>{selectedCalendarDate="";$("portalCalendarPunchDetail")?.classList.add("hidden");scheduleMonth=new Date(scheduleMonth.getFullYear(),scheduleMonth.getMonth()-1,1);await loadCalendar();});$("portalNextMonth").addEventListener("click",async()=>{selectedCalendarDate="";$("portalCalendarPunchDetail")?.classList.add("hidden");scheduleMonth=new Date(scheduleMonth.getFullYear(),scheduleMonth.getMonth()+1,1);await loadCalendar();});$("portalThisMonth").addEventListener("click",async()=>{selectedCalendarDate="";$("portalCalendarPunchDetail")?.classList.add("hidden");scheduleMonth=new Date();await loadCalendar();});}
  function bindScheduleAutoRefreshV61507(){
    window.addEventListener(
      "focus",
      ()=>{
        if(session()){
          checkPortalSyncV61513(
            {force:true,quiet:true}
          ).catch(()=>{});
        }
      }
    );

    document.addEventListener(
      "visibilitychange",
      ()=>{
        if(
          document.visibilityState==="visible"
          && session()
        ){
          checkPortalSyncV61513(
            {force:true,quiet:true}
          ).catch(()=>{});
        }
      }
    );

    window.addEventListener(
      "online",
      ()=>{
        portalSyncStatusV61513(
          "syncing",
          "เชื่อมต่อ"
        );
        checkPortalSyncV61513(
          {force:true,quiet:true}
        ).catch(()=>{});
      }
    );

    window.addEventListener(
      "offline",
      ()=>{
        portalSyncStatusV61513(
          "offline",
          "ออฟไลน์"
        );
      }
    );
  }

  async function init(){
    const c=config();
    client=window.supabase.createClient(c.url,c.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    bind();
    bindScheduleAutoRefreshV61507();
    await checkTeam();
    if(!(await restore())){showAuth();setAuthTab(teamToken?"activate":"login");}
    if("serviceWorker" in navigator){
      try{
        const reg=await navigator.serviceWorker.register("./portal-sw.js?v=6.15.22a",{updateViaCache:"none"});
        await reg.update();
      }catch(_){}
    }
  }

  window.addEventListener("unhandledrejection",event=>{
    const m=String(event?.reason?.message||event?.reason||"");
    if(m.includes("PORTAL_DATE_RANGE_MAX_63_DAYS")){
      event.preventDefault();
      toast("ช่วงวันที่ปฏิทินเกินกำหนด กรุณารีเฟรชหน้าเว็บ","warning");
    }
  });

  document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>init().catch(e=>toast(friendly(e),"error"))):init().catch(e=>toast(friendly(e),"error"));
})();
