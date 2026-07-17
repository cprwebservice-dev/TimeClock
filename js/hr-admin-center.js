"use strict";
(function(){
  const $=id=>document.getElementById(id);
  const app=()=>window.TimeClockApp;
  const num=v=>Number(v||0).toLocaleString("th-TH");
  const text=(id,v)=>{if($(id))$(id).textContent=v};
  async function refreshAdminCenter(){
    const A=app();
    if(!A?.state?.client)return;
    const client=A.state.client;
    text("adminHealthRole",A.state.profile?.role||"-");
    text("adminHealthSession",A.state.session?"Active":"Not active");
    text("adminHealthConnection","กำลังตรวจสอบ...");
    const badge=$("adminHealthBadge");
    if(badge){badge.className="admin-health-badge";badge.textContent="กำลังตรวจสอบ"}
    try{
      const year=new Date().getFullYear();
      const [usersRes,shiftsRes,holidaysRes]=await Promise.all([
        client.rpc("ta_get_user_management"),
        client.from("shift_master").select("shift_code,is_active"),
        client.rpc("ta_get_holiday_management",{p_start_date:`${year}-01-01`,p_end_date:`${year}-12-31`})
      ]);
      if(usersRes.error)throw usersRes.error;
      if(shiftsRes.error)throw shiftsRes.error;
      if(holidaysRes.error)throw holidaysRes.error;
      const users=usersRes.data||[], shifts=shiftsRes.data||[], holidays=holidaysRes.data||[];
      const activeUsers=users.filter(x=>x.is_active!==false).length;
      const activeShifts=shifts.filter(x=>x.is_active!==false).length;
      text("adminStatUsers",num(users.length));text("adminStatUsersSub",`${activeUsers.toLocaleString("th-TH")} บัญชีเปิดใช้งาน`);
      text("adminStatActiveUsers",num(activeUsers));text("adminStatActiveUsersSub",users.length?`${Math.round(activeUsers/users.length*100)}% ของทั้งหมด`:"ยังไม่มีข้อมูล");
      text("adminStatShifts",num(activeShifts));text("adminStatShiftsSub",`${shifts.length.toLocaleString("th-TH")} กะทั้งหมด`);
      text("adminStatHolidays",num(holidays.length));text("adminStatHolidaysSub",`ปี ${year+543}`);
      if($("adminCheckUsers"))$("adminCheckUsers").checked=activeUsers>0;
      if($("adminCheckShifts"))$("adminCheckShifts").checked=activeShifts>0;
      if($("adminCheckHolidays"))$("adminCheckHolidays").checked=holidays.length>0;
      text("adminHealthConnection","Connected");
      if(badge){badge.className="admin-health-badge ok";badge.textContent="ระบบพร้อมใช้งาน"}
    }catch(err){
      text("adminHealthConnection","Error");
      if(badge){badge.className="admin-health-badge error";badge.textContent="ต้องตรวจสอบ"}
      A.toast?.(A.humanError?.(err)||String(err),"error");
    }finally{
      text("adminHealthRefresh",new Date().toLocaleString("th-TH"));
    }
  }
  document.addEventListener("click",e=>{
    const open=e.target.closest("[data-admin-open]");
    if(open)app()?.switchPage?.(open.dataset.adminOpen);
  });
  document.addEventListener("DOMContentLoaded",()=>{
    $("adminCenterRefreshBtn")?.addEventListener("click",refreshAdminCenter);
    $("adminCenterSettingsBtn")?.addEventListener("click",()=>app()?.switchPage?.("system-settings"));
    document.querySelector('[data-page="admin-center"]')?.addEventListener("click",()=>setTimeout(refreshAdminCenter,0));
    window.addEventListener("ta:session-ready",refreshAdminCenter);
  });
  window.TimeClockAdminCenter={refresh:refreshAdminCenter};
})();
