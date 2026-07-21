(() => {
  const $ = id => document.getElementById(id);
  const fmt = value => new Intl.NumberFormat('th-TH').format(Number(value || 0));
  const num = value => Number(value || 0);
  const percent = (value, total) => total > 0 ? Math.max(0, Math.min(100, Math.round(value / total * 100))) : 0;

  function readDashboardValues() {
    const cards = [...document.querySelectorAll('#dashboardKpis .kpi-card')];
    const values = cards.map(card => num((card.querySelector('.kpi-value')?.textContent || '0').replace(/,/g, '')));
    return {
      employees: values[0] || 0,
      total: values[1] || 0,
      complete: values[2] || 0,
      incomplete: values[3] || 0,
      absent: values[4] || 0,
      review: values[5] || 0
    };
  }

  function renderExecutiveDashboard() {
    const d = readDashboardValues();
    if (!d.total && !d.employees) return;
    const completePct = percent(d.complete, d.total);
    const issueRows = d.incomplete + d.absent;
    const reviewPenalty = percent(d.review, d.total);
    const score = Math.max(0, Math.min(100, Math.round(completePct - reviewPenalty * .35)));
    const confirmed = num([...document.querySelectorAll('#dashboardQuick .badge')][3]?.textContent?.replace(/,/g, ''));
    const confirmedPct = percent(confirmed, d.total);

    $('executiveScore') && ($('executiveScore').textContent = score);
    $('executiveScoreRing')?.style.setProperty('--score-angle', `${score * 3.6}deg`);
    const status = score >= 90 ? ['ดีมาก','good'] : score >= 75 ? ['ควรติดตาม','warn'] : ['ต้องเร่งปรับปรุง','bad'];
    if ($('executiveScoreStatus')) {
      $('executiveScoreStatus').textContent = status[0];
      $('executiveScoreStatus').className = `health-status ${status[1]}`;
    }
    if ($('executiveScoreTitle')) $('executiveScoreTitle').textContent = score >= 90 ? 'ภาพรวมอยู่ในเกณฑ์ดีมาก' : score >= 75 ? 'ยังมีรายการที่ควรติดตาม' : 'พบประเด็นที่ควรเร่งดำเนินการ';
    if ($('executiveScoreText')) $('executiveScoreText').textContent = `ลงเวลาครบ ${completePct}% และมีรายการรอตรวจสอบ ${fmt(d.review)} รายการ`;

    if ($('executiveAttention')) $('executiveAttention').innerHTML = [
      ['เวลาไม่ครบ', d.incomplete, percent(d.incomplete,d.total)],
      ['ไม่พบเวลา', d.absent, percent(d.absent,d.total)],
      ['รอตรวจสอบ', d.review, percent(d.review,d.total)],
      ['รวมประเด็น', issueRows + d.review, percent(issueRows+d.review,d.total)]
    ].map(([label,value,p]) => `<button class="attention-tile ${p>=10?'high':p>=5?'medium':''}" data-go-page="review"><span>${label}</span><strong>${fmt(value)}</strong><small>${p}% ของรายการทั้งหมด</small></button>`).join('');

    if ($('scheduleReadiness')) $('scheduleReadiness').innerHTML = `
      <div class="readiness-number"><strong>${confirmedPct}%</strong><span>กะที่ยืนยันเทียบรายการทั้งหมด</span></div>
      <div class="readiness-track"><i style="width:${confirmedPct}%"></i></div>
      <div class="readiness-meta"><div><span>ยืนยันแล้ว</span><strong>${fmt(confirmed)}</strong></div><div><span>คงเหลือโดยประมาณ</span><strong>${fmt(Math.max(0,d.total-confirmed))}</strong></div></div>`;

    const insights = [];
    insights.push({type: completePct >= 90 ? 'good' : completePct >= 75 ? 'warn' : 'bad', icon:'✓', title:'ความครบถ้วนของเวลา', text:`ลงเวลาครบ ${fmt(d.complete)} จาก ${fmt(d.total)} รายการ`, value:`${completePct}%`});
    if (d.incomplete > 0) insights.push({type:'warn',icon:'!',title:'เวลาเข้า–ออกไม่ครบ',text:'ควรตรวจรายการก่อนปิดรอบเวลา',value:fmt(d.incomplete)});
    if (d.absent > 0) insights.push({type:'bad',icon:'×',title:'ไม่พบข้อมูลเวลา',text:'ตรวจสอบวันทำงาน วันลา หรือแหล่งข้อมูลเวลา',value:fmt(d.absent)});
    if (d.review === 0) insights.push({type:'good',icon:'✓',title:'Review Queue เป็นศูนย์',text:'ไม่พบรายการค้างตรวจสอบในชุดข้อมูลนี้',value:'0'});
    else insights.push({type:'warn',icon:'⚠',title:'Review Queue',text:'มีรายการที่ต้องพิจารณาหรือยืนยันเพิ่มเติม',value:fmt(d.review)});
    if ($('executiveInsights')) $('executiveInsights').innerHTML = insights.slice(0,4).map(i => `<div class="insight-row ${i.type}"><div class="insight-icon">${i.icon}</div><div><strong>${i.title}</strong><p>${i.text}</p></div><div class="insight-value">${i.value}</div></div>`).join('');

    const distribution = [
      ['ลงเวลาครบ',d.complete,'dist-complete'],['เวลาไม่ครบ',d.incomplete,'dist-missing'],['ไม่พบเวลา',d.absent,'dist-absent'],['รอตรวจสอบ',d.review,'dist-review']
    ];
    if ($('workforceDistribution')) $('workforceDistribution').innerHTML = distribution.map(([label,value,cls]) => { const p=percent(value,d.total); return `<div class="distribution-row"><span>${label}</span><div class="distribution-track"><i class="${cls}" style="width:${p}%"></i></div><strong>${p}%</strong></div>`; }).join('');
  }

  function bindDynamicNavigation() {
    document.addEventListener('click', event => {
      const target = event.target.closest('[data-go-page]');
      if (!target || !target.closest('.executive-strip')) return;
      document.querySelector(`.nav-item[data-page="${target.dataset.goPage}"]`)?.click();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    bindDynamicNavigation();
    const host = $('dashboardKpis');
    if (!host) return;
    const observer = new MutationObserver(() => window.requestAnimationFrame(renderExecutiveDashboard));
    observer.observe(host, {childList:true, subtree:true});
    window.setTimeout(renderExecutiveDashboard, 600);
  });
})();
