(() => {
  const $ = (id) => document.getElementById(id);
  const q = (s, r=document) => r.querySelector(s);
  const qa = (s, r=document) => [...r.querySelectorAll(s)];
  const VERSION = '5.6.3';
  const menuItems = [
    ['dashboard','Dashboard','ภาพรวมการลงเวลา','▦'],['attendance','รายละเอียดเวลาทำงาน','ค้นหาและตรวจเวลาพนักงาน','◷'],['schedule','ปฏิทินจัดกะ','จัดกะรายเดือน','▣'],['review','รายการรอตรวจสอบ','Missing IN / OUT และรายการผิดปกติ','⚠'],['admin-shifts','ตั้งค่ากะทำงาน','Shift Master','◫'],['admin-holidays','วันหยุดนักขัตฤกษ์','Holiday Master','◈'],['admin-users','User และ Scope','สิทธิ์ผู้ใช้งาน','♙'],['admin-import','นำเข้าพนักงาน','Import CSV','⇧'],['system-settings','System Settings','Theme, Developer และ Connection','⚙']
  ];
  let selected = 0;

  function role(){ return ($('roleBadge')?.textContent || 'VIEWER').trim(); }
  function email(){ return ($('sidebarUserEmail')?.textContent || '-').trim(); }
  function name(){ return ($('sidebarUserName')?.textContent || email()).trim(); }
  function go(page){ const el=q(`.nav-item[data-page="${page}"]`); if(el && !el.classList.contains('hidden')) el.click(); closeCommand(); }

  function mountStatus(){
    if($('platformStatusbar')) return;
    const bar=document.createElement('div'); bar.id='platformStatusbar'; bar.className='platform-statusbar';
    bar.innerHTML=`<span id="sbConnDot" class="dot"></span><span id="sbEnv" class="status-pill">PROD</span><span id="sbRole">VIEWER</span><span id="sbEmail" class="hide-mobile">-</span><span class="status-spacer"></span><span id="sbRpc" class="hide-mobile">RPC -- ms</span><span>v${VERSION}</span>`;
    document.body.appendChild(bar);
    setInterval(()=>{ $('sbRole').textContent=role(); $('sbEmail').textContent=email(); const online=navigator.onLine; $('sbConnDot').classList.toggle('offline',!online); $('sbConnDot').title=online?'Connected':'Offline'; },800);
  }

  function mountCommand(){
    if($('commandBackdrop')) return;
    const el=document.createElement('div'); el.id='commandBackdrop'; el.className='command-backdrop hidden';
    el.innerHTML=`<div class="command-panel"><div class="command-input-wrap"><span>⌕</span><input id="commandInput" class="command-input" placeholder="ค้นหาเมนู รหัส หรือชื่อพนักงาน..." autocomplete="off"><span class="command-kbd">ESC</span></div><div id="commandResults" class="command-results"></div></div>`;
    document.body.appendChild(el);
    el.addEventListener('click',e=>{if(e.target===el) closeCommand()});
    $('commandInput').addEventListener('input',renderCommand);
    $('commandInput').addEventListener('keydown',e=>{
      const items=qa('.command-item',$('commandResults')); if(e.key==='ArrowDown'){e.preventDefault();selected=Math.min(selected+1,items.length-1);renderActive(items)} if(e.key==='ArrowUp'){e.preventDefault();selected=Math.max(selected-1,0);renderActive(items)} if(e.key==='Enter'&&items[selected]) items[selected].click();
    });
  }
  function renderActive(items){items.forEach((x,i)=>x.classList.toggle('active',i===selected));items[selected]?.scrollIntoView({block:'nearest'});}
  function renderCommand(){
    const term=$('commandInput').value.trim().toLowerCase(); selected=0;
    const visiblePages=new Set(qa('.nav-item:not(.hidden)').map(x=>x.dataset.page));
    const filtered=menuItems.filter(x=>visiblePages.has(x[0]) && (!term || `${x[1]} ${x[2]} ${x[0]}`.toLowerCase().includes(term)));
    const res=$('commandResults');
    if(!filtered.length){res.innerHTML=`<div class="command-empty">ไม่พบเมนูที่ตรงกับ “${term}”<br><small>ค้นหาพนักงานได้จากหน้ารายละเอียดเวลาทำงาน</small></div>`;return;}
    res.innerHTML=filtered.map((x,i)=>`<button class="command-item ${i===0?'active':''}" data-go="${x[0]}"><span class="command-item-icon">${x[3]}</span><span class="command-item-text"><strong>${x[1]}</strong><small>${x[2]}</small></span></button>`).join('');
    qa('[data-go]',res).forEach(b=>b.onclick=()=>go(b.dataset.go));
  }
  function openCommand(){ $('commandBackdrop').classList.remove('hidden'); $('commandInput').value=''; renderCommand(); setTimeout(()=>$('commandInput').focus(),20); }
  function closeCommand(){ $('commandBackdrop')?.classList.add('hidden'); }

  function mountDrawer(){
    if($('notificationDrawer')) return;
    const d=document.createElement('aside'); d.id='notificationDrawer'; d.className='notification-drawer';
    d.innerHTML=`<div class="drawer-head"><div><small>TIME-CLOCK</small><h3>การแจ้งเตือน</h3></div><button id="drawerClose" class="btn btn-light btn-icon">×</button></div><div class="drawer-tabs"><button class="drawer-tab active">ทั้งหมด</button><button class="drawer-tab">รอตรวจสอบ</button><button class="drawer-tab">ระบบ</button></div><div class="drawer-body"><div class="notice-card"><span class="notice-dot"></span><div><strong>พร้อมใช้งาน Enterprise Shell V5.6.3</strong><p>Command Palette, Status Bar และ Profile Center เปิดใช้งานแล้ว</p><time>ล่าสุด</time></div></div><div class="notice-card"><span class="notice-dot"></span><div><strong>ตรวจรายการรอตรวจสอบ</strong><p>กดเมนู Review Center เพื่อดู Missing IN / OUT</p><time>วันนี้</time></div></div><div class="notice-card"><span class="notice-dot"></span><div><strong>สิทธิ์ปัจจุบัน: <span id="noticeRole">VIEWER</span></strong><p>การมองเห็นเมนูขึ้นกับ Role และ Scope จริง</p><time>Session ปัจจุบัน</time></div></div></div>`;
    document.body.appendChild(d); $('drawerClose').onclick=()=>d.classList.remove('open');
  }

  function mountProfile(){
    if($('profileMenu')) return;
    const p=document.createElement('div'); p.id='profileMenu'; p.className='profile-menu hidden';
    p.innerHTML=`<div class="profile-head"><div class="profile-avatar" id="profileAvatar">TC</div><div class="profile-meta"><strong id="profileName">-</strong><span id="profileEmail">-</span><span id="profileRole">VIEWER</span></div></div><hr><button class="profile-action" data-profile-go="system-settings">⚙ System Settings</button><button class="profile-action" id="profileTheme">◐ เปลี่ยนธีม</button><button class="profile-action" id="profileLogout">↪ ออกจากระบบ</button>`;
    document.body.appendChild(p);
    q('[data-profile-go]',p).onclick=()=>{go('system-settings');p.classList.add('hidden')};
    $('profileTheme').onclick=()=>$('themeToggleBtn')?.click(); $('profileLogout').onclick=()=>$('logoutBtn')?.click();
  }

  function enhanceTopbar(){
    const old=q('.global-search'); if(old){old.classList.add('hidden-important');}
    const right=q('.topbar-right'); if(!right || $('shellSearchBtn')) return;
    const b=document.createElement('button');b.id='shellSearchBtn';b.className='btn btn-light shell-search-trigger desktop-only';b.innerHTML='<span>⌕ ค้นหาทั้งระบบ</span><kbd>Ctrl K</kbd>';b.onclick=openCommand;right.insertBefore(b,right.firstChild);
    const roleEl=$('roleBadge'); if(roleEl){roleEl.style.cursor='pointer';roleEl.title='เปิดโปรไฟล์ผู้ใช้งาน';roleEl.onclick=toggleProfile;}
  }
  function toggleProfile(){
    const p=$('profileMenu'); p.classList.toggle('hidden'); $('profileName').textContent=name(); $('profileEmail').textContent=email(); $('profileRole').textContent=role(); $('profileAvatar').textContent=(name().slice(0,2)||'TC').toUpperCase();
  }
  function bind(){
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openCommand()} if(e.key==='Escape'){closeCommand();$('notificationDrawer')?.classList.remove('open');$('profileMenu')?.classList.add('hidden')}});
    $('notificationBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();$('notificationDrawer').classList.toggle('open');$('noticeRole').textContent=role();},true);
    document.addEventListener('click',e=>{if(!e.target.closest('#profileMenu')&&!e.target.closest('#roleBadge')) $('profileMenu')?.classList.add('hidden')});
    window.addEventListener('online',()=>$('sbConnDot')?.classList.remove('offline'));window.addEventListener('offline',()=> $('sbConnDot')?.classList.add('offline'));
  }
  function init(){mountStatus();mountCommand();mountDrawer();mountProfile();enhanceTopbar();bind();document.documentElement.dataset.platformVersion=VERSION;}
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
