(() => {
  const $ = id => document.getElementById(id);
  const fmt = n => new Intl.NumberFormat('th-TH').format(Number(n || 0));
  const pct = (n,d) => d > 0 ? Math.max(0, Math.min(100, Math.round(Number(n||0) / Number(d||1) * 100))) : 0;

  function applyTheme(theme){
    document.body.classList.toggle('theme-dark', theme === 'dark');
    localStorage.setItem('tc_theme', theme);
    if ($('themeToggleBtn')) $('themeToggleBtn').textContent = theme === 'dark' ? '☀' : '☾';
  }
  function bootEnterprise(){
    applyTheme(localStorage.getItem('tc_theme') || 'light');
    $('themeToggleBtn')?.addEventListener('click', () => applyTheme(document.body.classList.contains('theme-dark') ? 'light' : 'dark'));
    $('sidebarCollapseBtn')?.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem('tc_sidebar_collapsed', document.body.classList.contains('sidebar-collapsed') ? '1' : '0');
    });
    if (localStorage.getItem('tc_sidebar_collapsed') === '1') document.body.classList.add('sidebar-collapsed');
    $('clearDashboardFilterBtn')?.addEventListener('click', () => {
      const end = new Date();
      const start = new Date(end); start.setDate(start.getDate()-30);
      const iso = d => d.toISOString().slice(0,10);
      if ($('dashStart')) $('dashStart').value = iso(start);
      if ($('dashEnd')) $('dashEnd').value = iso(end);
      if ($('dashZone')) $('dashZone').value = '';
      if ($('dashDepartment')) $('dashDepartment').value = '';
      $('loadDashboardBtn')?.click();
    });
    $('globalSearch')?.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      const q = e.currentTarget.value.trim().toLowerCase();
      const map = [
        [['dashboard','ภาพรวม'], 'dashboard'], [['เวลา','attendance','รายละเอียด'], 'attendance'],
        [['กะ','schedule','ปฏิทิน'], 'schedule'], [['ตรวจ','review','ผิดปกติ'], 'review'],
        [['ผู้ใช้','user','scope'], 'admin-users'], [['วันหยุด','holiday'], 'admin-holidays'], [['นำเข้า','import'], 'admin-import']
      ];
      const found = map.find(([keys]) => keys.some(k => q.includes(k)));
      if (found) document.querySelector(`[data-page="${found[1]}"]`)?.click();
    });
  }

  function enhanceDashboard(){
    const kpiHost = $('dashboardKpis');
    if (!kpiHost) return;
    const observer = new MutationObserver(() => {
      const cards = [...kpiHost.querySelectorAll('.kpi-card')];
      if (!cards.length || cards[0].dataset.enterprise === '1') return;
      const values = cards.map(c => Number((c.querySelector('.kpi-value')?.textContent || '0').replace(/,/g,'')) || 0);
      const total = Math.max(values[1] || 1, 1);
      cards.forEach((card,i) => {
        card.dataset.enterprise='1';
        const value = values[i] || 0;
        const ratio = i===0 ? 100 : pct(value,total);
        const unit = i===0 ? 'คน' : 'รายการ';
        const label = card.querySelector('.kpi-label')?.textContent || '';
        const icon = card.querySelector('.kpi-icon')?.outerHTML || '';
        const sub = card.querySelector('.kpi-sub')?.textContent || '';
        card.innerHTML = `<div class="kpi-topline"><div class="kpi-label">${label}</div>${icon}</div><div class="kpi-value-row"><div class="kpi-value">${fmt(value)}</div><span class="kpi-unit">${unit}</span></div><div class="kpi-progress"><span style="width:${ratio}%"></span></div><div class="kpi-foot"><span>${sub}</span><strong>${ratio}%</strong></div>`;
      });
      renderEnterprisePanels(values);
    });
    observer.observe(kpiHost,{childList:true});
  }

  function renderEnterprisePanels(values){
    const employees=values[0]||0, total=values[1]||0, complete=values[2]||0, incomplete=values[3]||0, absent=values[4]||0, review=values[5]||0;
    const completePct=pct(complete,total);
    if ($('attendanceDonut')) $('attendanceDonut').style.setProperty('--donut-angle', `${completePct*3.6}deg`);
    if ($('donutPercent')) $('donutPercent').textContent=`${completePct}%`;
    if ($('notificationCount')) $('notificationCount').textContent=review>99?'99+':String(review);
    if ($('dashboardUpdatedAt')) $('dashboardUpdatedAt').textContent=`อัปเดตล่าสุด ${new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}`;
    if ($('dashboardLegend')) $('dashboardLegend').innerHTML = [
      ['#2fb27d','ลงเวลาครบ',complete],['#f59e0b','เวลาไม่ครบ',incomplete],['#ef4444','ไม่พบเวลา',absent],['#2d7bd3','รอตรวจสอบ',review]
    ].map(x=>`<div class="legend-item"><i class="legend-dot" style="background:${x[0]}"></i><span>${x[1]}</span><strong>${fmt(x[2])}</strong></div>`).join('');
    if ($('operationalSummary')) $('operationalSummary').innerHTML = [
      ['อัตราลงเวลาครบ',`${completePct}%`,'เทียบรายการทั้งหมด'],
      ['เฉลี่ยรายการต่อคน',employees? (total/employees).toFixed(1):'0','วัน-พนักงานต่อคน'],
      ['รายการผิดปกติ',fmt(incomplete+absent),'ต้องตรวจสอบเวลา'],
      ['คงเหลือรอดำเนินการ',fmt(review),'รายการใน Review Queue']
    ].map(x=>`<div class="ops-card"><span>${x[0]}</span><strong>${x[1]}</strong><small>${x[2]}</small></div>`).join('');
    if ($('recentActivity')) $('recentActivity').innerHTML = [
      ['✓','โหลด Dashboard สำเร็จ',`${fmt(total)} รายการในช่วงวันที่`],
      ['⚠','พบรายการรอตรวจสอบ',`${fmt(review)} รายการต้องดำเนินการ`],
      ['◷','ตรวจคุณภาพเวลา',`${fmt(complete)} รายการลงเวลาครบ`]
    ].map((x,i)=>`<div class="activity-item"><div class="activity-icon">${x[0]}</div><div class="activity-text"><strong>${x[1]}</strong><span>${x[2]}</span></div><div class="activity-time">${i===0?'ล่าสุด':'สรุป'}</div></div>`).join('');
    const quick=$('dashboardQuick');
    if (quick && !quick.dataset.enterprise){
      quick.dataset.enterprise='1';
      const mo=new MutationObserver(()=>{
        [...quick.querySelectorAll('.quick-item')].forEach((b,i)=>{
          if(b.dataset.enhanced) return; b.dataset.enhanced='1';
          const title=b.querySelector('strong')?.textContent||'';
          const badge=b.querySelector('.badge')?.outerHTML||'';
          const icons=['⚠','↥','↧','✓'];
          b.innerHTML=`<div class="quick-leading"><div class="quick-icon">${icons[i]||'•'}</div><div><strong>${title}</strong><span class="quick-meta">คลิกเพื่อดูรายละเอียด</span></div></div>${badge}`;
        });
      }); mo.observe(quick,{childList:true});
    }
  }

  document.addEventListener('DOMContentLoaded',()=>{ bootEnterprise(); enhanceDashboard(); });
})();
