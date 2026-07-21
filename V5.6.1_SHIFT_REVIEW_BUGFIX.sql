(() => {
  "use strict";
  const selected = new Set();
  let clipboard = [];
  let anchorKey = null;
  let activeKey = null;
  let dragging = false;
  let dragMode = "add";
  const undoStack = [];
  const redoStack = [];
  const app = () => window.TimeClockApp;
  const wrap = () => document.getElementById("scheduleTableWrap");
  const $ = id => document.getElementById(id);
  const keyOf = cell => `${cell.dataset.emp}|${cell.dataset.date}`;
  const escapeCss = value => (window.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/g,"\\$&"));

  function cells(){ return [...(wrap()?.querySelectorAll("[data-schedule-cell]") || [])]; }
  function getCell(key){ const [emp,date]=key.split("|"); return wrap()?.querySelector(`[data-schedule-cell][data-emp="${escapeCss(emp)}"][data-date="${escapeCss(date)}"]`); }
  function rowForKey(key){ const [emp_code,work_date]=key.split("|"); const row=app()?.state?.schedule?.find(r=>String(r.emp_code)===emp_code&&String(r.work_date).slice(0,10)===work_date); return {key,emp_code,work_date,row}; }
  function selectedRows(){ return [...selected].map(rowForKey).filter(x=>x.row); }
  function currentCode(row){ return row?.assigned_shift_code || row?.effective_shift_code || row?.auto_shift_code || null; }

  function updateHistoryButtons(){ $("scheduleUndoBtn") && ($("scheduleUndoBtn").disabled=!undoStack.length); $("scheduleRedoBtn") && ($("scheduleRedoBtn").disabled=!redoStack.length); }
  function updateSummary(){
    const counts={D:0,N:0,OFF:0,HOL:0,LV:0};
    (app()?.state?.schedule||[]).forEach(r=>{const c=currentCode(r); if(c in counts) counts[c]++;});
    Object.entries(counts).forEach(([c,n])=>{const el=$("sumShift"+c); if(el) el.textContent=n.toLocaleString("th-TH");});
  }
  function refreshSelectionUI(){
    wrap()?.querySelectorAll(".schedule-data-cell.cell-selected,.schedule-data-cell.cell-active").forEach(td=>td.classList.remove("cell-selected","cell-active"));
    selected.forEach(key=>getCell(key)?.closest("td")?.classList.add("cell-selected"));
    if(activeKey) getCell(activeKey)?.closest("td")?.classList.add("cell-active");
    const count=selected.size;
    if($("scheduleSelectionCount")) $("scheduleSelectionCount").textContent=count?`เลือกแล้ว ${count.toLocaleString("th-TH")} ช่อง`:"ยังไม่ได้เลือกช่อง";
    if($("scheduleSelectedKpi")) $("scheduleSelectedKpi").textContent=count.toLocaleString("th-TH");
    if($("scheduleClipboardInfo")) $("scheduleClipboardInfo").textContent=clipboard.length?`คลิปบอร์ด ${clipboard.length} กะ`:"เลือกช่องแล้วกดกะด่วน";
  }
  function clearSelection(){ selected.clear(); anchorKey=null; activeKey=null; refreshSelectionUI(); }
  function setActive(key,scroll=true){ activeKey=key; anchorKey=anchorKey||key; if(!selected.size) selected.add(key); refreshSelectionUI(); if(scroll) getCell(key)?.scrollIntoView({block:"nearest",inline:"nearest"}); }
  function selectCell(cell, additive=false, range=false){
    const key=keyOf(cell);
    if(range&&anchorKey){ selectRectangle(anchorKey,key,additive); }
    else { if(!additive) selected.clear(); selected.add(key); anchorKey=key; }
    activeKey=key; refreshSelectionUI();
  }
  function selectRectangle(fromKey,toKey,additive=false){
    const all=cells(); const matrix=new Map();
    all.forEach(c=>{const tr=c.closest("tr"); const ri=[...tr.parentElement.children].indexOf(tr); const ci=[...tr.children].indexOf(c.closest("td")); matrix.set(keyOf(c),{c,ri,ci});});
    const a=matrix.get(fromKey),b=matrix.get(toKey); if(!a||!b)return; if(!additive)selected.clear();
    const r1=Math.min(a.ri,b.ri),r2=Math.max(a.ri,b.ri),c1=Math.min(a.ci,b.ci),c2=Math.max(a.ci,b.ci);
    matrix.forEach((v,k)=>{if(v.ri>=r1&&v.ri<=r2&&v.ci>=c1&&v.ci<=c2)selected.add(k);});
  }
  function selectByEmp(emp){ selected.clear(); wrap()?.querySelectorAll(`[data-schedule-cell][data-emp="${escapeCss(emp)}"]`).forEach(c=>selected.add(keyOf(c))); activeKey=[...selected][0]||null; anchorKey=activeKey; refreshSelectionUI(); }
  function selectByDate(date){ selected.clear(); wrap()?.querySelectorAll(`[data-schedule-cell][data-date="${escapeCss(date)}"]`).forEach(c=>selected.add(keyOf(c))); activeKey=[...selected][0]||null; anchorKey=activeKey; refreshSelectionUI(); }

  async function savePayload(payload, reason, confirmNow=false, historyLabel="แก้ไขกะ"){
    if(!payload.length) return;
    const before=payload.map(p=>{const x=rowForKey(`${p.emp_code}|${p.work_date}`);return {...p,shift_code:currentCode(x.row)};});
    app().showLoading(`กำลังบันทึก ${payload.length.toLocaleString("th-TH")} รายการ...`);
    try{
      await window.TimeClockShiftAPI.assignBulk(app(), payload, reason, confirmNow);
      undoStack.push({label:historyLabel,before,after:payload.map(x=>({...x}))}); if(undoStack.length>30)undoStack.shift(); redoStack.length=0; updateHistoryButtons();
      app().toast(`บันทึก ${payload.length.toLocaleString("th-TH")} รายการแล้ว`,"success"); await app().loadSchedule();
    }catch(err){app().toast(app().humanError(err),"error");}finally{app().hideLoading();}
  }
  async function bulkAssign(shiftCode,confirmNow=false){const rows=selectedRows();if(!rows.length)return app()?.toast("กรุณาเลือกช่องกะก่อน","error");await savePayload(rows.map(x=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:shiftCode,note:"กำหนดจาก Schedule Pro"})),`กำหนดกะ ${shiftCode} จาก Schedule Pro`,confirmNow,`กำหนด ${shiftCode}`);}
  function copySelection(){const rows=selectedRows();if(!rows.length)return app()?.toast("กรุณาเลือกช่องที่ต้องการคัดลอก","error");clipboard=rows.map(x=>currentCode(x.row)||"D");refreshSelectionUI();app().toast(`คัดลอก ${clipboard.length} กะแล้ว`,"success");}
  async function pasteSelection(){const targets=selectedRows();if(!clipboard.length)return app()?.toast("ยังไม่มีกะในคลิปบอร์ด","error");if(!targets.length)return app()?.toast("กรุณาเลือกช่องปลายทาง","error");await savePayload(targets.map((x,i)=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:clipboard[i%clipboard.length],note:"วางจากคลิปบอร์ด"})),"คัดลอกและวางกะจาก Schedule Pro",false,"วางกะ");}
  async function clearCells(){const rows=selectedRows();if(!rows.length)return app()?.toast("กรุณาเลือกช่องที่ต้องการล้าง","error");if(!confirm(`ล้างกะที่กำหนดจำนวน ${rows.length} ช่อง?`))return;await savePayload(rows.map(x=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:null,note:"ล้างกะจาก Schedule Pro"})),"ล้างกะจาก Schedule Pro",false,"ล้างกะ");}
  async function confirmSelected(){const rows=selectedRows();if(!rows.length)return app()?.toast("กรุณาเลือกกะที่ต้องการยืนยัน","error");if(!confirm(`ยืนยันกะ ${rows.length} ช่องที่เลือก?`))return;await savePayload(rows.map(x=>({emp_code:x.emp_code,work_date:x.work_date,shift_code:currentCode(x.row),note:"ยืนยันจาก Schedule Pro"})).filter(x=>x.shift_code),"ยืนยันกะจาก Schedule Pro",true,"ยืนยันกะ");}
  async function applyHistory(item,mode){const payload=(mode==="undo"?item.before:item.after).map(x=>({...x,note:`${mode} ${item.label}`}));app().showLoading(`กำลัง ${mode==="undo"?"ย้อนกลับ":"ทำซ้ำ"}...`);try{await window.TimeClockShiftAPI.assignBulk(app(),payload,`${mode} ${item.label}`,false);(mode==="undo"?redoStack:undoStack).push(item);updateHistoryButtons();await app().loadSchedule();app().toast(mode==="undo"?"ย้อนกลับแล้ว":"ทำซ้ำแล้ว","success");}catch(err){app().toast(app().humanError(err),"error");}finally{app().hideLoading();}}
  function undo(){const x=undoStack.pop();if(x)applyHistory(x,"undo");}
  function redo(){const x=redoStack.pop();if(x)applyHistory(x,"redo");}
  function moveActive(dx,dy,extend=false){const c=getCell(activeKey)||cells()[0];if(!c)return;const td=c.closest("td"),tr=td.parentElement;const rows=[...tr.parentElement.children];let ri=rows.indexOf(tr)+dy;ri=Math.max(0,Math.min(rows.length-1,ri));const targetRow=rows[ri];const cellsRow=[...targetRow.querySelectorAll("[data-schedule-cell]")];const sourceCells=[...tr.querySelectorAll("[data-schedule-cell]")];let ci=sourceCells.indexOf(c)+dx;ci=Math.max(0,Math.min(cellsRow.length-1,ci));const target=cellsRow[ci];if(target){selectCell(target,false,extend);target.scrollIntoView({block:"nearest",inline:"nearest"});}}
  function shiftMonth(delta){const input=$("scheduleMonth");if(!input?.value)return;const [y,m]=input.value.split("-").map(Number);const d=new Date(y,m-1+delta,1);input.value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;app()?.loadSchedule();}
  function openContext(e,cell){e.preventDefault();selectCell(cell,e.ctrlKey||e.metaKey,e.shiftKey);const menu=$("scheduleContextMenu");menu.hidden=false;menu.style.left=Math.min(e.clientX,innerWidth-190)+"px";menu.style.top=Math.min(e.clientY,innerHeight-310)+"px";}
  function closeContext(){const m=$("scheduleContextMenu");if(m)m.hidden=true;}

  function bind(){
    document.addEventListener("timeclock:schedule-rendered",()=>{selected.clear();activeKey=null;anchorKey=null;refreshSelectionUI();updateSummary();updateHistoryButtons();});
    wrap()?.addEventListener("mousedown",e=>{const cell=e.target.closest("[data-schedule-cell]");if(!cell||e.button!==0)return;e.preventDefault();dragging=true;dragMode=(e.ctrlKey||e.metaKey)&&selected.has(keyOf(cell))?"remove":"add";if(!e.shiftKey&&!e.ctrlKey&&!e.metaKey)selected.clear();selectCell(cell,e.ctrlKey||e.metaKey,e.shiftKey);wrap()?.focus();});
    wrap()?.addEventListener("mouseover",e=>{if(!dragging)return;const cell=e.target.closest("[data-schedule-cell]");if(!cell)return;const k=keyOf(cell);dragMode==="remove"?selected.delete(k):selected.add(k);activeKey=k;refreshSelectionUI();});
    document.addEventListener("mouseup",()=>dragging=false);
    wrap()?.addEventListener("click",e=>{const emp=e.target.closest("[data-select-emp]");if(emp){selectByEmp(emp.dataset.selectEmp);return;}const date=e.target.closest("[data-select-date]");if(date){selectByDate(date.dataset.selectDate);return;}});
    wrap()?.addEventListener("dblclick",e=>{const c=e.target.closest("[data-schedule-cell]");if(c)app()?.openAssignment(c.dataset.emp,c.dataset.date);});
    wrap()?.addEventListener("contextmenu",e=>{const c=e.target.closest("[data-schedule-cell]");if(c)openContext(e,c);});
    document.querySelectorAll("[data-quick-shift]").forEach(b=>b.addEventListener("click",()=>bulkAssign(b.dataset.quickShift)));
    $("scheduleCopyBtn")?.addEventListener("click",copySelection); $("schedulePasteBtn")?.addEventListener("click",pasteSelection); $("scheduleClearCellsBtn")?.addEventListener("click",clearCells); $("scheduleClearSelectionBtn")?.addEventListener("click",clearSelection); $("scheduleConfirmSelectedBtn")?.addEventListener("click",confirmSelected); $("scheduleUndoBtn")?.addEventListener("click",undo); $("scheduleRedoBtn")?.addEventListener("click",redo);
    $("schedulePrevMonthBtn")?.addEventListener("click",()=>shiftMonth(-1)); $("scheduleNextMonthBtn")?.addEventListener("click",()=>shiftMonth(1)); $("scheduleTodayBtn")?.addEventListener("click",()=>{const d=new Date();$("scheduleMonth").value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;app()?.loadSchedule();});
    $("scheduleContextMenu")?.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.contextShift)bulkAssign(b.dataset.contextShift);if(b.dataset.contextAction==="copy")copySelection();if(b.dataset.contextAction==="paste")pasteSelection();if(b.dataset.contextAction==="clear")clearCells();closeContext();});
    document.addEventListener("click",e=>{if(!e.target.closest("#scheduleContextMenu"))closeContext();});
    document.addEventListener("keydown",e=>{if(!document.getElementById("page-schedule")?.classList.contains("active"))return;const tag=document.activeElement?.tagName;if(["INPUT","SELECT","TEXTAREA"].includes(tag)&&!(e.ctrlKey||e.metaKey))return;const k=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&k==="c"){e.preventDefault();copySelection();}else if((e.ctrlKey||e.metaKey)&&k==="v"){e.preventDefault();pasteSelection();}else if((e.ctrlKey||e.metaKey)&&k==="z"){e.preventDefault();e.shiftKey?redo():undo();}else if((e.ctrlKey||e.metaKey)&&k==="y"){e.preventDefault();redo();}else if(e.key==="Delete"||e.key==="Backspace"){e.preventDefault();clearCells();}else if(e.key==="Escape")clearSelection();else if(e.key==="ArrowLeft"){e.preventDefault();moveActive(-1,0,e.shiftKey);}else if(e.key==="ArrowRight"){e.preventDefault();moveActive(1,0,e.shiftKey);}else if(e.key==="ArrowUp"){e.preventDefault();moveActive(0,-1,e.shiftKey);}else if(e.key==="ArrowDown"){e.preventDefault();moveActive(0,1,e.shiftKey);}else if(["d","n"].includes(k)&&!e.ctrlKey&&!e.metaKey){e.preventDefault();bulkAssign(k.toUpperCase());}});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",bind);else bind();
})();
