"use strict";
(() => {
  const KEY = "ta_enterprise_settings_v4";
  const defaults = {
    systemName: "Time-Clock Management", companyName: "CP Retailink", environment: "Development", version: "4.0.0",
    footer: "Design by แผนกบริหารระบบข้อมูลบุคคล ซีพี รีเทลลิงค์", theme: "light", accent: "blue", font: "Noto Sans Thai",
    developerMode: false, viewAsRole: "HR_ADMIN",
    features: { dashboard:true, attendance:true, schedule:true, review:true, adminShifts:true, adminHolidays:true, adminUsers:true, adminImport:true },
    shiftColors: { D:"#2563eb", N:"#7c3aed", OFF:"#64748b", HOL:"#ea580c", LV:"#0f766e", OT:"#ca8a04" }
  };
  const $ = id => document.getElementById(id);
  const qs = (s,r=document)=>r.querySelector(s);
  const qsa = (s,r=document)=>[...r.querySelectorAll(s)];
  let settings = load();
  let profile = null;
  function deepMerge(a,b){ return {...a,...b,features:{...a.features,...(b?.features||{})},shiftColors:{...a.shiftColors,...(b?.shiftColors||{})}}; }
  function load(){ try{return deepMerge(defaults,JSON.parse(localStorage.getItem(KEY)||"{}"));}catch{return structuredClone(defaults);} }
  function save(){ localStorage.setItem(KEY,JSON.stringify(settings)); applyVisuals(); applyFeatureFlags(); }
  function getRuntimeSettings(){ return settings; }
  function applyVisuals(){
    document.documentElement.style.fontFamily = settings.font === "system" ? "system-ui,sans-serif" : "'Noto Sans Thai',sans-serif";
    document.body.classList.toggle("accent-orange",settings.accent==="orange"); document.body.classList.toggle("accent-teal",settings.accent==="teal");
    let dark=settings.theme==="dark" || (settings.theme==="system"&&matchMedia("(prefers-color-scheme: dark)").matches); document.body.classList.toggle("dark-mode",dark);
    qsa("[data-theme-choice]").forEach(x=>x.classList.toggle("active",x.dataset.themeChoice===settings.theme));
    Object.entries(settings.shiftColors).forEach(([k,v])=>document.documentElement.style.setProperty(`--shift-${k.toLowerCase()}`,v));
    document.title=`${settings.systemName} | ${settings.companyName}`;
  }
  const featureMeta=[
    ["dashboard","Dashboard","ภาพรวมและ KPI"],["attendance","Attendance","รายละเอียดเวลาทำงาน"],["schedule","Schedule","ปฏิทินจัดกะ"],["review","Review Queue","รายการรอตรวจสอบ"],
    ["adminShifts","Shift Master","ตั้งค่ากะทำงาน"],["adminHolidays","Holiday","วันหยุดนักขัตฤกษ์"],["adminUsers","User & Scope","จัดการสิทธิ์ผู้ใช้"],["adminImport","Employee Import","นำเข้าข้อมูลพนักงาน"]
  ];
  const featurePage={dashboard:"dashboard",attendance:"attendance",schedule:"schedule",review:"review",adminShifts:"admin-shifts",adminHolidays:"admin-holidays",adminUsers:"admin-users",adminImport:"admin-import"};
  function applyFeatureFlags(){ for(const [k,p] of Object.entries(featurePage)){ const el=qs(`.nav-item[data-page="${p}"]`); if(el) el.classList.toggle("feature-hidden",settings.features[k]===false); } }
  function renderFeatureFlags(){ const root=$("featureFlagList"); if(!root)return; root.innerHTML=featureMeta.map(([k,n,d])=>`<div class="feature-row"><div><strong>${n}</strong><small>${d}</small></div><label class="switch"><input type="checkbox" data-feature-key="${k}" ${settings.features[k]!==false?"checked":""}><span></span></label></div>`).join(""); }
  function renderShiftColors(){ const root=$("shiftColorGrid"); if(!root)return; root.innerHTML=Object.entries(settings.shiftColors).map(([k,v])=>`<div class="shift-color-card"><label class="shift-color-swatch" style="background:${v}"><input type="color" data-shift-color="${k}" value="${v}"></label><div><strong>${k}</strong><small>${({D:"กะกลางวัน",N:"กะกลางคืน",OFF:"วันหยุด",HOL:"นักขัตฤกษ์",LV:"ลา",OT:"ล่วงเวลา"})[k]}</small></div></div>`).join(""); }
  function fillForm(){
    const map={setSystemName:"systemName",setEnvironment:"environment",setVersion:"version",setCompanyName:"companyName",setFooter:"footer",setAccent:"accent",setFont:"font"};
    for(const [id,k] of Object.entries(map)) if($(id)) $(id).value=settings[k];
    if($("setDeveloperMode")) $("setDeveloperMode").checked=settings.developerMode;
    if($("setViewAsRole")) $("setViewAsRole").value=settings.viewAsRole;
    if($("settingsVersionHero")) $("settingsVersionHero").textContent=settings.version;
    if($("settingsEnvironmentHero")) $("settingsEnvironmentHero").textContent=settings.environment;
    if($("aboutAppName")) $("aboutAppName").textContent=settings.systemName;
    if($("aboutVersion")) $("aboutVersion").textContent=settings.version;
    const cfg=JSON.parse(localStorage.getItem("ta_supabase_config_v1")||"null");
    if(cfg){ $("setConnectionUrl").value=cfg.url||""; $("setConnectionKey").value=maskKey(cfg.key||""); try{$("setProjectRef").value=new URL(cfg.url).hostname.split(".")[0]}catch{} }
    $("setSessionStatus").value=window.TimeClockApp?.state?.session?"Authenticated":"No active session";
    renderFeatureFlags(); renderShiftColors(); applyVisuals(); applyFeatureFlags();
  }
  function maskKey(k){ return k.length<14?"••••••":`${k.slice(0,8)}••••••••${k.slice(-6)}`; }
  function collect(){
    const map={setSystemName:"systemName",setEnvironment:"environment",setVersion:"version",setCompanyName:"companyName",setFooter:"footer",setAccent:"accent",setFont:"font"};
    for(const [id,k] of Object.entries(map)) if($(id)) settings[k]=$(id).value;
    settings.developerMode=$("setDeveloperMode")?.checked||false; settings.viewAsRole=$("setViewAsRole")?.value||"HR_ADMIN";
    qsa("[data-feature-key]").forEach(x=>settings.features[x.dataset.featureKey]=x.checked);
    qsa("[data-shift-color]").forEach(x=>settings.shiftColors[x.dataset.shiftColor]=x.value);
  }
  function syncProfile(p){ profile=p; if($("realRoleValue")) $("realRoleValue").textContent=p._realRole||p.role; $("developerConsole")?.classList.toggle("hidden",!(p._realRole==="HR_ADMIN"&&settings.developerMode)); fillForm(); }
  async function testConnection(){
    const chip=$("connectionStatus"); chip.textContent="Testing..."; chip.className="connection-chip";
    const t=performance.now(); try{ const c=window.TimeClockApp?.state?.client; if(!c)throw new Error("Supabase client not initialized"); const {data,error}=await c.auth.getSession(); if(error)throw error; chip.textContent=`Connected • ${Math.round(performance.now()-t)} ms`; chip.className="connection-chip success"; $("setSessionStatus").value=data.session?"Authenticated":"Connected / No session"; }
    catch(e){chip.textContent="Connection failed";chip.className="connection-chip error"; window.TimeClockApp?.toast?.(e.message,"error");}
  }
  function setDebug(name,ms,rows,status,msg){ if(!$("devLastRpc"))return; $("devLastRpc").textContent=name||"-"; $("devExecTime").textContent=ms==null?"-":`${Math.round(ms)} ms`; $("devRows").textContent=rows==null?"-":rows; $("devStatus").textContent=status; $("devMessage").textContent=msg||"-"; $("devConsoleSummary").textContent=`${status} • ${name}`; }
  function instrumentClient(client){
    if(!client||client.__taInstrumented)return; client.__taInstrumented=true; const original=client.rpc.bind(client);
    client.rpc=async function(name,args,opts){ const t=performance.now(); try{const res=await original(name,args,opts); const rows=Array.isArray(res.data)?res.data.length:(res.data?1:0); setDebug(name,performance.now()-t,rows,res.error?"Error":"Success",res.error?.message||"เรียก RPC สำเร็จ"); return res;}catch(e){setDebug(name,performance.now()-t,0,"Exception",e.message);throw e;} };
  }
  function bind(){
    qsa("[data-settings-tab]").forEach(b=>b.addEventListener("click",()=>{qsa("[data-settings-tab]").forEach(x=>x.classList.toggle("active",x===b));qsa("[data-settings-panel]").forEach(x=>x.classList.toggle("active",x.dataset.settingsPanel===b.dataset.settingsTab));}));
    qsa("[data-theme-choice]").forEach(b=>b.addEventListener("click",()=>{settings.theme=b.dataset.themeChoice;applyVisuals();fillForm();}));
    qsa("[data-save-settings]").forEach(b=>b.addEventListener("click",()=>{collect();save();fillForm();window.TimeClockApp?.toast?.("บันทึกการตั้งค่าแล้ว","success");}));
    $("setDeveloperMode")?.addEventListener("change",e=>{settings.developerMode=e.target.checked;});
    $("devReloadBtn")?.addEventListener("click",()=>{collect();save();window.TimeClockApp?.applyProfile?.();window.TimeClockApp?.toast?.(`กำลังทดสอบหน้าจอด้วย Role ${settings.viewAsRole}`,"success");});
    $("devClearCacheBtn")?.addEventListener("click",()=>{sessionStorage.clear();window.TimeClockApp?.toast?.("ล้าง UI cache แล้ว","success");});
    $("devRefreshMetadataBtn")?.addEventListener("click",async()=>{await window.TimeClockApp?.state?.client?.auth?.refreshSession();window.TimeClockApp?.toast?.("Refresh session metadata แล้ว","success");});
    $("resetShiftColorsBtn")?.addEventListener("click",()=>{settings.shiftColors={...defaults.shiftColors};renderShiftColors();applyVisuals();});
    $("testConnectionBtn")?.addEventListener("click",testConnection); $("openLegacyConfigBtn")?.addEventListener("click",()=>document.getElementById("configModal")?.classList.remove("hidden"));
    $("developerConsoleToggle")?.addEventListener("click",()=>$("developerConsoleBody").classList.toggle("hidden"));
    $("devConsoleClearBtn")?.addEventListener("click",()=>setDebug("-",null,null,"Ready","ล้าง Log แล้ว"));
  }
  window.TimeClockSettings={getRuntimeSettings,syncProfile,instrumentClient};
  document.addEventListener("DOMContentLoaded",()=>{bind();fillForm();applyVisuals();});
})();
