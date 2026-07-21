<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0b1f3a" />
  <title>Time-Clock Enterprise V6.0 | CP Retailink</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Thai:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <link rel="stylesheet" href="./css/app.css?v=2.0.0" />
  <link rel="stylesheet" href="./css/dashboard-enterprise.css?v=2.0.0" />
  <link rel="stylesheet" href="./css/dashboard-executive.css?v=5.2.0" />
  <link rel="stylesheet" href="./css/schedule-enterprise.css?v=3.0.0" />
  <link rel="stylesheet" href="./css/schedule-pro.css?v=6.0.0" />
  <link rel="stylesheet" href="./css/review-center.css?v=5.4.1" />
  <link rel="stylesheet" href="./css/report-center.css?v=5.5.0" />
  <link rel="stylesheet" href="./css/functional-complete.css?v=6.0.0" />
  <link rel="stylesheet" href="./css/hr-admin-center.css?v=5.6.0" />
  <link rel="stylesheet" href="./css/settings-enterprise.css?v=4.0.0" />
  <link rel="stylesheet" href="./css/platform-shell.css?v=6.0.0" />
</head>
<body>
  <div id="toastStack" class="toast-stack"></div>
  <div id="loadingOverlay" class="loading-overlay hidden">
    <div class="loading-box"><div class="spinner"></div><span id="loadingText">กำลังประมวลผล...</span></div>
  </div>

  <!-- Login -->
  <section id="loginScreen" class="login-screen">
    <div class="login-hero">
      <div class="brand-lockup">
        <div class="brand-mark">TC</div>
        <div><div class="brand-title">Time-Clock Management</div><div class="brand-subtitle">CP Retailink Workforce Operations</div></div>
      </div>
      <h1>บริหารกะและเวลา<br /><span>ช่างเทคนิค</span>ในที่เดียว</h1>
      <p>ตรวจสอบเวลาเข้า–ออก จัดกะรายเดือน ติดตามรายการผิดปกติ และดู Dashboard ตามสิทธิ์พื้นที่แบบเรียลไทม์</p>
      <div class="feature-pills">
        <div class="feature-pill">✓ Dashboard ภาพรวม</div>
        <div class="feature-pill">✓ ปฏิทินจัดกะ</div>
        <div class="feature-pill">✓ ตรวจเวลาไม่ครบ</div>
        <div class="feature-pill">✓ Role &amp; Scope</div>
      </div>
    </div>
    <div class="login-panel-wrap">
      <form id="loginForm" class="login-card">
        <div class="brand-lockup" style="margin-bottom:22px;color:var(--navy-900)">
          <div class="brand-mark">TC</div>
          <div><div class="brand-title">ระบบ Time-Clock</div><div class="brand-subtitle" style="color:var(--slate-500)">เข้าสู่ระบบด้วยบัญชี Supabase</div></div>
        </div>
        <h2>ยินดีต้อนรับ</h2>
        <p>กรอกอีเมลและรหัสผ่านเพื่อเข้าสู่ระบบ</p>
        <div class="field"><label for="loginEmail">อีเมล</label><input id="loginEmail" class="input" type="email" autocomplete="username" required placeholder="name@company.com" /></div>
        <div class="field"><label for="loginPassword">รหัสผ่าน</label><input id="loginPassword" class="input" type="password" autocomplete="current-password" required placeholder="••••••••" /></div>
        <button class="btn btn-primary btn-block" type="submit">เข้าสู่ระบบ</button>
        <button id="openConfigFromLogin" class="btn btn-light btn-block" type="button" style="margin-top:10px">ตั้งค่าการเชื่อมต่อ Supabase</button>
        <div style="margin-top:18px;text-align:center;color:var(--slate-500);font-size:10px">Design by แผนกบริหารระบบข้อมูลบุคคล ซีพี รีเทลลิงค์</div>
      </form>
    </div>
  </section>

  <!-- App -->
  <div id="appShell" class="app-shell hidden">
    <aside id="sidebar" class="sidebar">
      <div class="sidebar-brand">
        <div class="brand-mark">TC</div>
        <div class="sidebar-brand-text"><strong>Time-Clock</strong><span>Technician Management</span></div>
      </div>
      <button id="sidebarCollapseBtn" class="sidebar-collapse-btn desktop-only" title="ย่อเมนู" aria-label="ย่อเมนู">‹</button>
      <nav class="sidebar-nav">
        <div class="nav-label">ภาพรวม</div>
        <button class="nav-item active" data-page="dashboard"><span class="nav-icon">▦</span><span>Dashboard</span></button>
        <button class="nav-item" data-page="attendance"><span class="nav-icon">◷</span><span>รายละเอียดเวลาทำงาน</span></button>
        <button class="nav-item" data-page="schedule"><span class="nav-icon">▣</span><span>ปฏิทินจัดกะ</span></button>
        <button class="nav-item" data-page="review"><span class="nav-icon">⚠</span><span>รายการรอตรวจสอบ</span></button>
        <button class="nav-item" data-page="report"><span class="nav-icon">▤</span><span>ศูนย์รายงาน</span></button>

        <div id="adminNavGroup" class="hidden">
          <div class="nav-label">HR ADMIN</div>
          <button class="nav-item" data-page="admin-center"><span class="nav-icon">◆</span><span>HR Admin Center</span></button>
          <button class="nav-item" data-page="admin-shifts"><span class="nav-icon">◫</span><span>ตั้งค่ากะทำงาน</span></button>
          <button class="nav-item" data-page="admin-holidays"><span class="nav-icon">◈</span><span>วันหยุดนักขัตฤกษ์</span></button>
          <button class="nav-item" data-page="admin-users"><span class="nav-icon">♙</span><span>User และ Scope</span></button>
          <button class="nav-item" data-page="admin-import"><span class="nav-icon">⇧</span><span>นำเข้าพนักงาน</span></button>
          <button id="systemSettingsNav" class="nav-item hidden" data-page="system-settings"><span class="nav-icon">⚙</span><span>System Settings</span></button>
        </div>
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-user"><strong id="sidebarUserName">-</strong><span id="sidebarUserEmail">-</span></div>
      </div>
    </aside>

    <main class="main-shell">
      <header class="topbar">
        <div class="topbar-left">
          <button id="mobileMenuBtn" class="btn btn-light btn-icon mobile-only" aria-label="เปิดเมนู">☰</button>
          <div class="page-heading"><strong id="pageTitle">Dashboard</strong><span id="pageSubtitle">ภาพรวมการลงเวลาและการจัดกะ</span></div>
        </div>
        <div class="topbar-right enterprise-actions">
          <div class="global-search desktop-only">
            <span>⌕</span><input id="globalSearch" type="search" placeholder="ค้นหาเมนูหรือพนักงาน" aria-label="ค้นหา" />
          </div>
          <button id="themeToggleBtn" class="btn btn-light btn-icon" title="เปลี่ยนธีม" aria-label="เปลี่ยนธีม">☾</button>
          <button id="notificationBtn" class="btn btn-light btn-icon notification-btn" title="การแจ้งเตือน" aria-label="การแจ้งเตือน">♢<span id="notificationCount" class="notification-count">0</span></button>
          <span id="roleBadge" class="role-badge">VIEWER</span>
          <button id="configBtn" class="btn btn-light btn-icon" title="ตั้งค่า Supabase">⚙</button>
          <button id="logoutBtn" class="btn btn-danger">ออกจากระบบ</button>
        </div>
      </header>

      <div class="content">
        <!-- Dashboard -->
        <section id="page-dashboard" class="page active enterprise-dashboard">
          <div class="dashboard-welcome">
            <div>
              <span class="eyebrow">WORKFORCE OPERATIONS</span>
              <h2>ภาพรวมการบริหารเวลาและกะทำงาน</h2>
              <p>ติดตามสถานะสำคัญ ตรวจรายการผิดปกติ และดำเนินการได้จากหน้าจอเดียว</p>
            </div>
            <div class="dashboard-welcome-actions">
              <span id="dashboardUpdatedAt" class="updated-chip">อัปเดตล่าสุด --:--</span>
              <button class="btn btn-soft" data-go-page="schedule">จัดกะรายเดือน</button>
              <button class="btn btn-primary" data-go-page="review">ตรวจรายการผิดปกติ</button>
            </div>
          </div>

          <div class="panel filter-panel">
            <div class="panel-body">
              <div class="toolbar enterprise-filterbar">
                <div class="field"><label>วันที่เริ่มต้น</label><input id="dashStart" class="input" type="date" /></div>
                <div class="field"><label>วันที่สิ้นสุด</label><input id="dashEnd" class="input" type="date" /></div>
                <div class="field"><label>พื้นที่</label><select id="dashZone" class="select"><option value="">ทุกพื้นที่</option></select></div>
                <div class="field"><label>หน่วยงาน</label><select id="dashDepartment" class="select"><option value="">ทุกหน่วยงาน</option></select></div>
                <div class="toolbar-actions">
                  <button id="clearDashboardFilterBtn" class="btn btn-light">ล้างตัวกรอง</button>
                  <button id="loadDashboardBtn" class="btn btn-primary">แสดงผล</button>
                </div>
              </div>
            </div>
          </div>

          <div id="dashboardKpis" class="kpi-grid section-gap enterprise-kpis"></div>

          <div class="executive-strip section-gap">
            <article class="executive-score-card">
              <div class="executive-score-head"><div><span class="eyebrow">ATTENDANCE HEALTH</span><h3>คะแนนสุขภาพการลงเวลา</h3></div><span id="executiveScoreStatus" class="health-status">กำลังประเมิน</span></div>
              <div class="executive-score-body">
                <div id="executiveScoreRing" class="score-ring"><div><strong id="executiveScore">0</strong><span>/100</span></div></div>
                <div class="score-copy"><strong id="executiveScoreTitle">รอข้อมูล Dashboard</strong><p id="executiveScoreText">ระบบจะประเมินจากความครบถ้วนของเวลาและรายการที่ต้องตรวจสอบ</p><div class="score-scale"><span>ต้องปรับปรุง</span><span>ดีมาก</span></div></div>
              </div>
            </article>
            <article class="executive-attention-card">
              <div class="executive-card-head"><div><span class="eyebrow">NEED ATTENTION</span><h3>ประเด็นที่ควรดำเนินการ</h3></div><button class="btn btn-light btn-sm" data-go-page="review">เปิด Review</button></div>
              <div id="executiveAttention" class="attention-matrix"></div>
            </article>
            <article class="executive-confirm-card">
              <div class="executive-card-head"><div><span class="eyebrow">SCHEDULE CONTROL</span><h3>ความพร้อมของแผนกะ</h3></div><button class="btn btn-light btn-sm" data-go-page="schedule">เปิดปฏิทิน</button></div>
              <div id="scheduleReadiness" class="schedule-readiness"></div>
            </article>
          </div>

          <div class="dashboard-main-grid section-gap">
            <div class="panel overview-card">
              <div class="panel-header"><div><h3>คุณภาพการลงเวลา</h3><p>สัดส่วนรายการลงเวลาครบเทียบกับรายการทั้งหมด</p></div><span class="panel-chip">Realtime</span></div>
              <div class="panel-body overview-body">
                <div id="attendanceDonut" class="attendance-donut" aria-label="กราฟสัดส่วนการลงเวลา"><div class="donut-center"><strong id="donutPercent">0%</strong><span>ลงเวลาครบ</span></div></div>
                <div id="dashboardLegend" class="metric-legend"></div>
              </div>
            </div>

            <div class="panel action-center">
              <div class="panel-header"><div><h3>ศูนย์ดำเนินการ</h3><p>รายการที่ควรได้รับการตรวจสอบก่อน</p></div><button class="btn btn-light btn-icon" data-go-page="review" title="เปิดรายการทั้งหมด">→</button></div>
              <div id="dashboardQuick" class="panel-body quick-list enterprise-quick-list"></div>
            </div>
          </div>

          <div class="dashboard-secondary-grid section-gap">
            <div class="panel">
              <div class="panel-header"><div><h3>สถานะการลงเวลา</h3><p>เปรียบเทียบรายการสำคัญตามช่วงวันที่</p></div></div>
              <div id="dashboardBars" class="panel-body status-bars"></div>
            </div>
            <div class="panel">
              <div class="panel-header"><div><h3>สรุปเชิงปฏิบัติการ</h3><p>ตัวชี้วัดสำหรับติดตามการดำเนินงาน</p></div></div>
              <div id="operationalSummary" class="panel-body operational-summary"></div>
            </div>
            <div class="panel">
              <div class="panel-header"><div><h3>กิจกรรมล่าสุด</h3><p>สรุปจากข้อมูลที่โหลดล่าสุด</p></div></div>
              <div id="recentActivity" class="panel-body activity-list"></div>
            </div>
          </div>

          <div class="executive-insights-grid section-gap">
            <div class="panel executive-insight-panel">
              <div class="panel-header"><div><h3>Executive Insights</h3><p>ข้อสังเกตที่คำนวณจากข้อมูลชุดล่าสุดโดยไม่สร้างข้อมูลสมมติ</p></div><span class="panel-chip">Auto analysis</span></div>
              <div id="executiveInsights" class="panel-body executive-insights"></div>
            </div>
            <div class="panel executive-distribution-panel">
              <div class="panel-header"><div><h3>Workforce Distribution</h3><p>สัดส่วนสถานะหลักจากรายการทั้งหมด</p></div></div>
              <div id="workforceDistribution" class="panel-body distribution-list"></div>
            </div>
          </div>
        </section>

        <!-- System Settings -->
        <section id="page-system-settings" class="page settings-page">
          <div class="settings-hero">
            <div><span class="eyebrow">ENTERPRISE CONTROL CENTER</span><h2>System Settings &amp; Developer Console</h2><p>กำหนดค่าระบบ ธีม Feature Flags สีของกะ และทดสอบสิทธิ์การใช้งานจากจุดเดียว</p></div>
            <div class="settings-version"><span>System Version</span><strong id="settingsVersionHero">4.0.0</strong><small id="settingsEnvironmentHero">Development</small></div>
          </div>
          <div class="settings-layout section-gap">
            <aside class="settings-tabs" aria-label="เมนูตั้งค่าระบบ">
              <button class="settings-tab active" data-settings-tab="general">◉ <span>General</span></button>
              <button class="settings-tab" data-settings-tab="theme">◐ <span>Theme</span></button>
              <button class="settings-tab" data-settings-tab="developer">⌘ <span>Developer</span></button>
              <button class="settings-tab" data-settings-tab="features">◆ <span>Feature Flags</span></button>
              <button class="settings-tab" data-settings-tab="shifts">▦ <span>Shift Colors</span></button>
              <button class="settings-tab" data-settings-tab="connection">⌁ <span>Connection</span></button>
              <button class="settings-tab" data-settings-tab="about">ⓘ <span>About</span></button>
            </aside>
            <div class="settings-content">
              <div class="settings-panel active" data-settings-panel="general">
                <div class="settings-panel-head"><div><h3>General</h3><p>ข้อมูลหลักและข้อความที่ใช้แสดงในระบบ</p></div><span class="settings-status-dot">Local configuration</span></div>
                <div class="settings-form-grid">
                  <div class="field"><label>ชื่อระบบ</label><input id="setSystemName" class="input" /></div>
                  <div class="field"><label>Environment</label><select id="setEnvironment" class="select"><option>Development</option><option>UAT</option><option>Production</option></select></div>
                  <div class="field"><label>Version</label><input id="setVersion" class="input" /></div>
                  <div class="field"><label>ชื่อบริษัท</label><input id="setCompanyName" class="input" /></div>
                  <div class="field settings-span-2"><label>ข้อความ Footer</label><input id="setFooter" class="input" /></div>
                </div>
                <div class="settings-actions"><button class="btn btn-light" data-reset-section="general">คืนค่าเริ่มต้น</button><button class="btn btn-primary" data-save-settings>บันทึกการตั้งค่า</button></div>
              </div>
              <div class="settings-panel" data-settings-panel="theme">
                <div class="settings-panel-head"><div><h3>Theme</h3><p>ปรับรูปแบบการแสดงผลสำหรับผู้ใช้เครื่องนี้</p></div></div>
                <div class="theme-choice-grid">
                  <button class="theme-choice" data-theme-choice="light"><span class="theme-preview theme-light"></span><strong>Light</strong><small>พื้นสว่าง อ่านง่าย</small></button>
                  <button class="theme-choice" data-theme-choice="dark"><span class="theme-preview theme-dark"></span><strong>Dark</strong><small>ลดแสงหน้าจอ</small></button>
                  <button class="theme-choice" data-theme-choice="system"><span class="theme-preview theme-system"></span><strong>System</strong><small>ตามอุปกรณ์</small></button>
                </div>
                <div class="settings-form-grid section-gap-small"><div class="field"><label>Accent Color</label><select id="setAccent" class="select"><option value="blue">Blue–Navy</option><option value="orange">Orange</option><option value="teal">Teal</option></select></div><div class="field"><label>Font</label><select id="setFont" class="select"><option value="Noto Sans Thai">Noto Sans Thai</option><option value="system">System UI</option></select></div></div>
                <div class="settings-actions"><button class="btn btn-primary" data-save-settings>นำ Theme ไปใช้</button></div>
              </div>
              <div class="settings-panel" data-settings-panel="developer">
                <div class="settings-panel-head"><div><h3>Developer Mode</h3><p>ใช้สำหรับจำลอง Role ฝั่งหน้าจอเท่านั้น โดย RLS ของ Supabase ยังควบคุมสิทธิ์จริงเหมือนเดิม</p></div><label class="switch"><input id="setDeveloperMode" type="checkbox"><span></span></label></div>
                <div class="developer-role-card"><div><span>สิทธิ์จริง</span><strong id="realRoleValue">-</strong></div><div class="role-arrow">→</div><div class="field"><label>View As</label><select id="setViewAsRole" class="select"><option value="HR_ADMIN">HR_ADMIN</option><option value="USER">USER</option><option value="VIEWER">VIEWER</option></select></div></div>
                <div class="developer-warning">การสลับ Role ไม่ได้ยกระดับสิทธิ์ในฐานข้อมูล ใช้สำหรับตรวจเมนูและ UX เท่านั้น หาก RPC ถูก RLS ปฏิเสธถือว่าเป็นผลที่ถูกต้อง</div>
                <div class="developer-tools"><button id="devClearCacheBtn" class="btn btn-light">Clear UI Cache</button><button id="devRefreshMetadataBtn" class="btn btn-light">Refresh Metadata</button><button id="devReloadBtn" class="btn btn-primary">Apply &amp; Reload UI</button></div>
              </div>
              <div class="settings-panel" data-settings-panel="features">
                <div class="settings-panel-head"><div><h3>Feature Flags</h3><p>เปิดหรือซ่อนเมนูระหว่างการพัฒนา</p></div></div>
                <div id="featureFlagList" class="feature-list"></div>
                <div class="settings-actions"><button class="btn btn-primary" data-save-settings>บันทึก Feature Flags</button></div>
              </div>
              <div class="settings-panel" data-settings-panel="shifts">
                <div class="settings-panel-head"><div><h3>Shift Colors</h3><p>กำหนดสีประจำรหัสกะ โดยไม่ต้องแก้ CSS</p></div></div>
                <div id="shiftColorGrid" class="shift-color-grid"></div>
                <div class="settings-actions"><button class="btn btn-light" id="resetShiftColorsBtn">คืนค่าสีเริ่มต้น</button><button class="btn btn-primary" data-save-settings>บันทึกสีของกะ</button></div>
              </div>
              <div class="settings-panel" data-settings-panel="connection">
                <div class="settings-panel-head"><div><h3>Supabase Connection</h3><p>แสดงข้อมูลเชื่อมต่อจาก Browser Storage โดยปิดบังค่า Key</p></div><span id="connectionStatus" class="connection-chip">Not tested</span></div>
                <div class="settings-form-grid"><div class="field settings-span-2"><label>Project URL</label><input id="setConnectionUrl" class="input" readonly /></div><div class="field settings-span-2"><label>Publishable / Anon Key</label><input id="setConnectionKey" class="input" readonly /></div><div class="field"><label>Project Reference</label><input id="setProjectRef" class="input" readonly /></div><div class="field"><label>Session</label><input id="setSessionStatus" class="input" readonly /></div></div>
                <div class="settings-actions"><button id="openLegacyConfigBtn" class="btn btn-light">แก้ไข Connection</button><button id="testConnectionBtn" class="btn btn-primary">Test Connection</button></div>
              </div>
              <div class="settings-panel" data-settings-panel="about">
                <div class="settings-panel-head"><div><h3>About</h3><p>ข้อมูล Build และสภาพแวดล้อมของระบบ</p></div></div>
                <div class="about-grid"><div><span>Application</span><strong id="aboutAppName">Time-Clock Management</strong></div><div><span>Version</span><strong id="aboutVersion">4.0.0</strong></div><div><span>Build</span><strong id="aboutBuild">Enterprise V4</strong></div><div><span>Frontend</span><strong>HTML / CSS / JavaScript</strong></div><div><span>Backend</span><strong>Supabase PostgreSQL</strong></div><div><span>Hosting</span><strong>GitHub Pages</strong></div></div>
              </div>
            </div>
          </div>
        </section>

        <!-- Attendance -->
        <section id="page-attendance" class="page">
          <div class="panel">
            <div class="panel-body">
              <div class="toolbar">
                <div class="field"><label>วันที่เริ่มต้น</label><input id="attStart" class="input" type="date" /></div>
                <div class="field"><label>วันที่สิ้นสุด</label><input id="attEnd" class="input" type="date" /></div>
                <div class="field"><label>พื้นที่</label><select id="attZone" class="select"><option value="">ทุกพื้นที่</option></select></div>
                <div class="field"><label>หน่วยงาน</label><select id="attDepartment" class="select"><option value="">ทุกหน่วยงาน</option></select></div>
                <div class="field"><label>สถานะ</label><select id="attStatus" class="select"><option value="">ทุกสถานะ</option><option value="NORMAL">ปกติ</option><option value="ABSENT">ไม่มีเวลา</option><option value="INCOMPLETE_TIME">เวลาไม่ครบ</option><option value="WORKED_ON_OFFDAY">ทำงานวันหยุด</option><option value="NEED_REVIEW">รอตรวจสอบ</option></select></div>
                <div class="toolbar-actions"><button id="loadAttendanceBtn" class="btn btn-primary">ค้นหา</button><button id="exportAttendanceBtn" class="btn btn-success">Export CSV</button></div>
              </div>
            </div>
          </div>
          <div class="panel section-gap">
            <div class="panel-header"><div><h3>รายละเอียดเวลาทำงาน</h3><p id="attendanceCount">0 รายการ</p></div></div>
            <div class="panel-body"><div class="table-wrap" style="max-height:68vh"><table><thead><tr><th>วันที่</th><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>หน่วยงาน</th><th>พื้นที่</th><th>เวลาเริ่มกะ</th><th>เวลาสิ้นสุดกะ</th><th>กะ</th><th>เวลาเข้า</th><th>เวลาออก</th><th>ชม.สุทธิ</th><th>สาย</th><th>กลับก่อน</th><th>สถานะ</th></tr></thead><tbody id="attendanceBody"></tbody></table></div></div>
          </div>
        </section>

        <!-- Schedule -->
        <section id="page-schedule" class="page">
          <div class="panel">
            <div class="panel-body">
              <div class="toolbar">
                <div class="field"><label>เดือน</label><input id="scheduleMonth" class="input" type="month" /></div>
                <div class="field"><label>พื้นที่</label><select id="scheduleZone" class="select"><option value="">ทุกพื้นที่</option></select></div>
                <div class="field"><label>หน่วยงาน</label><select id="scheduleDepartment" class="select"><option value="">ทุกหน่วยงาน</option></select></div>
                <div class="field"><label>ค้นหาพนักงาน</label><input id="scheduleSearch" class="input" placeholder="รหัสหรือชื่อ" /></div>
                <div class="toolbar-actions schedule-month-actions">
                  <button id="schedulePrevMonthBtn" class="btn btn-light" title="เดือนก่อน">‹</button>
                  <button id="scheduleTodayBtn" class="btn btn-light">เดือนปัจจุบัน</button>
                  <button id="scheduleNextMonthBtn" class="btn btn-light" title="เดือนถัดไป">›</button>
                  <button id="loadScheduleBtn" class="btn btn-primary">โหลดตารางกะ</button>
                </div>
              </div>
            </div>
          </div>
          <div class="schedule-kpi-grid section-gap">
            <div class="schedule-kpi"><span>พนักงาน</span><strong id="scheduleEmployeeCount">0</strong></div>
            <div class="schedule-kpi"><span>รายการจัดกะ</span><strong id="scheduleAssignedCount">0</strong></div>
            <div class="schedule-kpi"><span>ยืนยันแล้ว</span><strong id="scheduleConfirmedCount">0</strong></div>
            <div class="schedule-kpi warning"><span>รอตรวจสอบ</span><strong id="scheduleReviewCount">0</strong></div>
            <div class="schedule-kpi"><span>ช่องที่เลือก</span><strong id="scheduleSelectedKpi">0</strong></div>
          </div>
          <div class="panel section-gap schedule-workspace">
            <div class="panel-header schedule-panel-header">
              <div><h3>ตารางกะรายเดือนแบบ Excel</h3><p>จัดกะล่วงหน้าได้ทุกวัน รวมวันหยุดประจำสัปดาห์และวันหยุดนักขัตฤกษ์ • ลากเลือกหลายช่อง • Ctrl/Cmd + C และ Ctrl/Cmd + V</p></div>
              <div class="schedule-legend"><span class="badge badge-blue">D กลางวัน</span><span class="badge shift-legend-night">N กลางคืน</span><span class="badge badge-orange">HOL นักขัตฤกษ์</span><span class="badge badge-gray">OFF วันหยุด</span><span class="badge schedule-holiday-legend">กรอบส้ม = วันหยุดนักขัตฤกษ์</span><span class="badge schedule-weeklyoff-legend">พื้นเทา = วันหยุดประจำสัปดาห์</span></div>
            </div>
            <div class="schedule-commandbar">
              <div class="schedule-selection-info"><span id="scheduleSelectionCount">ยังไม่ได้เลือกช่อง</span><small id="scheduleClipboardInfo">เลือกช่องแล้วกดกะด่วน</small></div>
              <div class="schedule-quick-shifts">
                <button class="shift-command shift-D" data-quick-shift="D">D</button>
                <button class="shift-command shift-N" data-quick-shift="N">N</button>
                <button class="shift-command shift-OFF" data-quick-shift="OFF">OFF</button>
                <button class="shift-command shift-HOL" data-quick-shift="HOL">HOL</button>
                <button class="shift-command shift-LV" data-quick-shift="LV">LV</button>
              </div>
              <div class="schedule-command-actions">
                <button id="scheduleUndoBtn" class="btn btn-light" disabled>↶ Undo</button>
                <button id="scheduleRedoBtn" class="btn btn-light" disabled>↷ Redo</button>
                <button id="scheduleCopyBtn" class="btn btn-light">คัดลอก</button>
                <button id="schedulePasteBtn" class="btn btn-light">วาง</button>
                <button id="scheduleClearCellsBtn" class="btn btn-danger-soft">ล้างกะ</button>
                <button id="scheduleClearSelectionBtn" class="btn btn-light">ยกเลิกเลือก</button>
                <button id="scheduleConfirmSelectedBtn" class="btn btn-success">ยืนยันที่เลือก</button>
              </div>
            </div>
            <div class="schedule-summary-strip" id="scheduleSummaryStrip">
              <span><b>D</b><em id="sumShiftD">0</em></span><span><b>N</b><em id="sumShiftN">0</em></span><span><b>OFF</b><em id="sumShiftOFF">0</em></span><span><b>HOL</b><em id="sumShiftHOL">0</em></span><span><b>LV</b><em id="sumShiftLV">0</em></span>
              <small>ลากเมาส์เพื่อเลือกช่วง • Shift+คลิกเลือกต่อเนื่อง • ปุ่มลูกศรเลื่อนเซลล์ • Delete ล้างกะ</small>
            </div>
            <div class="panel-body schedule-grid-body"><div id="scheduleTableWrap" class="table-wrap schedule-grid-wrap" tabindex="0" style="max-height:70vh"></div></div>
            <div id="scheduleContextMenu" class="schedule-context-menu" hidden>
              <button data-context-action="copy">คัดลอก</button><button data-context-action="paste">วาง</button>
              <hr><button data-context-shift="D">กำหนด D</button><button data-context-shift="N">กำหนด N</button><button data-context-shift="OFF">กำหนด OFF</button><button data-context-shift="HOL">กำหนด HOL</button><button data-context-shift="LV">กำหนด LV</button>
              <hr><button class="danger" data-context-action="clear">ล้างกะ</button>
            </div>
          </div>
        </section>

        <!-- Review Center -->
        <section id="page-review" class="page review-center-page">
          <div class="review-hero">
            <div>
              <span class="eyebrow">ATTENDANCE REVIEW CENTER</span>
              <h2>ศูนย์ตรวจสอบรายการผิดปกติ</h2>
              <p>รวมรายการเวลาไม่ครบ ไม่มีเวลา ทำงานวันหยุด และกะที่ต้องตรวจสอบไว้ในหน้าเดียว</p>
            </div>
            <div class="review-hero-actions">
              <button id="reviewExportBtn" class="btn btn-light">ส่งออก CSV</button>
              <button id="reviewRefreshBtn" class="btn btn-primary">รีเฟรชข้อมูล</button>
            </div>
          </div>

          <div class="review-kpi-grid">
            <button class="review-kpi active" data-review-filter=""><span>ทั้งหมด</span><strong id="reviewKpiAll">0</strong><small>รายการที่ต้องตรวจสอบ</small></button>
            <button class="review-kpi danger" data-review-filter="MISSING_IN"><span>ไม่พบเวลาเข้า</span><strong id="reviewKpiMissingIn">0</strong><small>Missing IN</small></button>
            <button class="review-kpi danger" data-review-filter="MISSING_OUT"><span>ไม่พบเวลาออก</span><strong id="reviewKpiMissingOut">0</strong><small>Missing OUT</small></button>
            <button class="review-kpi warning" data-review-filter="ABSENT"><span>ไม่มีเวลา</span><strong id="reviewKpiAbsent">0</strong><small>Absent / No time</small></button>
            <button class="review-kpi info" data-review-filter="NEED_REVIEW"><span>กะต้องตรวจสอบ</span><strong id="reviewKpiShift">0</strong><small>Shift mismatch</small></button>
            <button class="review-kpi purple" data-review-filter="WORKED_ON_OFFDAY"><span>ทำงานวันหยุด</span><strong id="reviewKpiOffday">0</strong><small>Worked on off day</small></button>
          </div>

          <div class="panel review-filter-panel">
            <div class="panel-body">
              <div class="review-filter-grid">
                <div class="field"><label>วันที่เริ่มต้น</label><input id="reviewStart" class="input" type="date" /></div>
                <div class="field"><label>วันที่สิ้นสุด</label><input id="reviewEnd" class="input" type="date" /></div>
                <div class="field"><label>ประเภทปัญหา</label><select id="reviewIssue" class="select"><option value="">ทุกปัญหา</option><option value="NEED_REVIEW">กะไม่ตรงคำแนะนำ</option><option value="MISSING_IN">ไม่พบเวลาเข้า</option><option value="MISSING_OUT">ไม่พบเวลาออก</option><option value="ABSENT">ไม่มีเวลา</option><option value="WORKED_ON_OFFDAY">ทำงานวันหยุด</option></select></div>
                <div class="field review-search-field"><label>ค้นหาในผลลัพธ์</label><input id="reviewSearch" class="input" placeholder="รหัส ชื่อ หรือหน่วยงาน" /></div>
                <div class="toolbar-actions"><button id="loadReviewBtn" class="btn btn-primary">ค้นหา</button></div>
              </div>
            </div>
          </div>

          <div id="reviewBulkBar" class="review-bulk-bar hidden">
            <div><strong id="reviewSelectedCount">0</strong><span>รายการที่เลือก</span></div>
            <div class="review-bulk-controls">
              <select id="reviewBulkShift" class="select"><option value="D">D</option><option value="N">N</option><option value="OFF">OFF</option><option value="HOL">HOL</option><option value="LV">LV</option></select>
              <label class="checkbox-line"><input id="reviewBulkConfirm" type="checkbox" /> ยืนยันทันที</label>
              <button id="reviewBulkAssignBtn" class="btn btn-orange">กำหนดกะที่เลือก</button>
              <button id="reviewClearSelectionBtn" class="btn btn-light">ยกเลิกการเลือก</button>
            </div>
          </div>

          <div class="panel section-gap review-table-panel">
            <div class="panel-header">
              <div><h3>รายการรอตรวจสอบ</h3><p id="reviewCount">0 รายการ</p></div>
              <div class="review-table-meta"><span id="reviewVisibleCount">แสดง 0 รายการ</span></div>
            </div>
            <div class="panel-body review-table-body">
              <div class="table-wrap review-table-wrap">
                <table class="review-table"><thead><tr><th class="review-check-col"><input id="reviewSelectAll" type="checkbox" aria-label="เลือกทั้งหมด" /></th><th>วันที่</th><th>รหัส</th><th>ชื่อ-นามสกุล</th><th>หน่วยงาน</th><th>กะตั้งต้น</th><th>กะแนะนำ</th><th>ความมั่นใจ</th><th>เวลาเข้า</th><th>เวลาออก</th><th>ปัญหา</th><th>จัดการ</th></tr></thead><tbody id="reviewBody"></tbody></table>
              </div>
            </div>
          </div>
        </section>


        <!-- HR Admin Center -->
        <section id="page-admin-center" class="page hr-admin-center-page">
          <div class="admin-center-hero">
            <div>
              <span class="eyebrow">HR ADMIN CONTROL CENTER</span>
              <h2>ศูนย์บริหารระบบ Time-Clock</h2>
              <p>ตรวจสอบสถานะข้อมูล ผู้ใช้งาน กะ วันหยุด และการนำเข้าข้อมูลจากจุดเดียว</p>
            </div>
            <div class="admin-center-actions">
              <button id="adminCenterRefreshBtn" class="btn btn-primary">รีเฟรชสถานะ</button>
              <button id="adminCenterSettingsBtn" class="btn btn-light">System Settings</button>
            </div>
          </div>

          <div class="admin-health-grid">
            <article class="admin-health-card"><span>ผู้ใช้งานทั้งหมด</span><strong id="adminStatUsers">-</strong><small id="adminStatUsersSub">กำลังตรวจสอบ</small></article>
            <article class="admin-health-card"><span>ผู้ใช้งานที่เปิดใช้งาน</span><strong id="adminStatActiveUsers">-</strong><small id="adminStatActiveUsersSub">กำลังตรวจสอบ</small></article>
            <article class="admin-health-card"><span>กะที่เปิดใช้งาน</span><strong id="adminStatShifts">-</strong><small id="adminStatShiftsSub">กำลังตรวจสอบ</small></article>
            <article class="admin-health-card"><span>วันหยุดปีปัจจุบัน</span><strong id="adminStatHolidays">-</strong><small id="adminStatHolidaysSub">กำลังตรวจสอบ</small></article>
          </div>

          <div class="admin-module-grid">
            <button class="admin-module-card" data-admin-open="admin-users"><span class="admin-module-icon">♙</span><div><strong>User และ Scope</strong><small>กำหนด Role, สถานะ และขอบเขตข้อมูล</small></div><em>เปิด ›</em></button>
            <button class="admin-module-card" data-admin-open="admin-shifts"><span class="admin-module-icon">◫</span><div><strong>ตั้งค่ากะทำงาน</strong><small>จัดการรหัสกะ เวลาเริ่ม-สิ้นสุด และเวลาพัก</small></div><em>เปิด ›</em></button>
            <button class="admin-module-card" data-admin-open="admin-holidays"><span class="admin-module-icon">◈</span><div><strong>วันหยุดนักขัตฤกษ์</strong><small>เพิ่ม แก้ไข และตรวจผลกระทบต่อ Attendance</small></div><em>เปิด ›</em></button>
            <button class="admin-module-card" data-admin-open="admin-import"><span class="admin-module-icon">⇧</span><div><strong>นำเข้าพนักงาน</strong><small>ตรวจสอบไฟล์ CSV ก่อนนำเข้าฐานข้อมูล</small></div><em>เปิด ›</em></button>
            <button class="admin-module-card" data-admin-open="system-settings"><span class="admin-module-icon">⚙</span><div><strong>System Settings</strong><small>Theme, Developer Mode, Feature Flags และ Connection</small></div><em>เปิด ›</em></button>
            <button class="admin-module-card" data-admin-open="report"><span class="admin-module-icon">▤</span><div><strong>ศูนย์รายงาน</strong><small>ส่งออกรายงานและตรวจประวัติการดาวน์โหลด</small></div><em>เปิด ›</em></button>
          </div>

          <div class="admin-center-columns">
            <div class="panel">
              <div class="panel-header"><div><h3>System Health</h3><p>สถานะการเชื่อมต่อและสิทธิ์ปัจจุบัน</p></div><span id="adminHealthBadge" class="admin-health-badge">กำลังตรวจสอบ</span></div>
              <div class="panel-body admin-health-list">
                <div><span>Supabase Connection</span><strong id="adminHealthConnection">-</strong></div>
                <div><span>Actual Role</span><strong id="adminHealthRole">-</strong></div>
                <div><span>Session</span><strong id="adminHealthSession">-</strong></div>
                <div><span>Last Refresh</span><strong id="adminHealthRefresh">-</strong></div>
              </div>
            </div>
            <div class="panel">
              <div class="panel-header"><div><h3>ข้อแนะนำสำหรับผู้ดูแล</h3><p>รายการตรวจสอบก่อนเปิดใช้งานจริง</p></div></div>
              <div class="panel-body admin-checklist">
                <label><input type="checkbox" disabled checked> กำหนดบัญชี HR_ADMIN</label>
                <label><input id="adminCheckUsers" type="checkbox" disabled> มีผู้ใช้งานที่เปิดใช้งาน</label>
                <label><input id="adminCheckShifts" type="checkbox" disabled> มีกะมาตรฐานที่เปิดใช้งาน</label>
                <label><input id="adminCheckHolidays" type="checkbox" disabled> มีข้อมูลวันหยุดปีปัจจุบัน</label>
              </div>
            </div>
          </div>
        </section>

        <!-- Admin Shifts -->
        <section id="page-admin-shifts" class="page admin-page">
          <div class="panel">
            <div class="panel-header"><div><h3>ตั้งค่ากะทำงาน</h3><p>เพิ่ม แก้ไข หรือปิดการใช้งานกะ</p></div><button id="newShiftBtn" class="btn btn-orange">+ เพิ่มกะ</button></div>
            <div class="panel-body"><div class="table-wrap"><table><thead><tr><th>รหัสกะ</th><th>ชื่อกะ</th><th>เวลาเริ่ม</th><th>เวลาสิ้นสุด</th><th>พัก</th><th>ประเภท</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody id="shiftMasterBody"></tbody></table></div></div>
          </div>
        </section>

        <!-- Admin Holidays -->
        <section id="page-admin-holidays" class="page admin-page">
          <div class="panel">
            <div class="panel-header"><div><h3>วันหยุดนักขัตฤกษ์</h3><p>ข้อมูลวันหยุดที่ใช้คำนวณกะอัตโนมัติ</p></div><button id="newHolidayBtn" class="btn btn-orange">+ เพิ่มวันหยุด</button></div>
            <div class="panel-body"><div class="table-wrap"><table><thead><tr><th>วันที่</th><th>ชื่อวันหยุด</th><th>แหล่งข้อมูล</th><th>หมายเหตุ</th><th>รายการ Attendance</th><th>มีเวลาทำงาน</th><th>จัดการ</th></tr></thead><tbody id="holidayBody"></tbody></table></div></div>
          </div>
        </section>

        <!-- Admin Users -->
        <section id="page-admin-users" class="page admin-page">
          <div class="panel">
            <div class="panel-header"><div><h3>User และ Scope</h3><p>กำหนด Role และขอบเขตการดูข้อมูล</p></div><button id="reloadUsersBtn" class="btn btn-light">รีเฟรช</button></div>
            <div class="panel-body"><div class="table-wrap"><table><thead><tr><th>อีเมล</th><th>ชื่อแสดง</th><th>Role</th><th>สถานะ</th><th>เข้าใช้ล่าสุด</th><th>Scope</th><th>จัดการ</th></tr></thead><tbody id="userBody"></tbody></table></div></div>
          </div>
        </section>

        <!-- Admin Import -->
        <section id="page-admin-import" class="page admin-page">
          <div class="panel">
            <div class="panel-header"><div><h3>นำเข้าข้อมูลพนักงาน</h3><p>รองรับไฟล์ CSV UTF-8 ตามชื่อคอลัมน์ที่กำหนด</p></div></div>
            <div class="panel-body">
              <div class="form-row">
                <div class="field"><label>เลือกไฟล์ CSV</label><input id="employeeFile" class="input" type="file" accept=".csv,text/csv" /></div>
                <div class="field"><label>หมายเหตุ</label><input id="importNote" class="input" placeholder="เช่น ปรับปรุงข้อมูลประจำเดือน" /></div>
              </div>
              <div style="display:flex;gap:9px;flex-wrap:wrap"><button id="previewImportBtn" class="btn btn-light">ตรวจสอบก่อนนำเข้า</button><button id="runImportBtn" class="btn btn-primary">นำเข้าข้อมูล</button><button id="downloadTemplateBtn" class="btn btn-success">ดาวน์โหลด Template</button></div>
              <div class="section-gap" style="padding:14px;border-radius:12px;background:var(--slate-100);font-size:11px;color:var(--slate-700)">ชื่อคอลัมน์: employee_id, full_name, position_name, department, zone, pc, area, sub_area, car_team, manager_department, manager_division, start_date, resign_date</div>
              <div id="importResult" class="section-gap"></div>
            </div>
          </div>
        </section>

        <footer class="footer-credit">Design by แผนกบริหารระบบข้อมูลบุคคล ซีพี รีเทลลิงค์</footer>
      </div>
      <section id="developerConsole" class="developer-console hidden">
        <button id="developerConsoleToggle" class="developer-console-toggle"><span>⌘ Developer Console</span><strong id="devConsoleSummary">Ready</strong></button>
        <div id="developerConsoleBody" class="developer-console-body hidden">
          <div class="dev-stat"><span>Last API / RPC</span><strong id="devLastRpc">-</strong></div>
          <div class="dev-stat"><span>Execution Time</span><strong id="devExecTime">-</strong></div>
          <div class="dev-stat"><span>Rows</span><strong id="devRows">-</strong></div>
          <div class="dev-stat"><span>Status</span><strong id="devStatus">Ready</strong></div>
          <div class="dev-message"><span>Message</span><code id="devMessage">ยังไม่มีรายการเรียกใช้งาน</code></div>
          <button id="devConsoleClearBtn" class="btn btn-light btn-sm">ล้าง Log</button>
        </div>
      </section>
    </main>
  </div>

  <!-- Config Modal -->
  <div id="configModal" class="modal-backdrop hidden">
    <div class="modal">
      <div class="modal-header"><h3>ตั้งค่าการเชื่อมต่อ Supabase</h3><button class="btn btn-light btn-icon" data-close-modal="configModal">×</button></div>
      <div class="modal-body">
        <div class="field"><label>Supabase Project URL</label><input id="configUrl" class="input" placeholder="https://xxxxxxxx.supabase.co" /></div>
        <div class="field"><label>Publishable Key / Anon Key</label><textarea id="configKey" class="textarea" placeholder="sb_publishable_... หรือ anon key"></textarea></div>
        <div style="padding:12px;border-radius:10px;background:var(--amber-100);color:var(--amber-600);font-size:11px">ใช้เฉพาะ Publishable/Anon key สำหรับ Browser ห้ามใส่ Service Role key</div>
      </div>
      <div class="modal-footer"><button class="btn btn-light" data-close-modal="configModal">ยกเลิก</button><button id="saveConfigBtn" class="btn btn-primary">บันทึกการตั้งค่า</button></div>
    </div>
  </div>

  <!-- Shift Assignment Modal -->
  <div id="assignModal" class="modal-backdrop hidden">
    <div class="modal">
      <div class="modal-header"><h3>กำหนดกะทำงาน</h3><button class="btn btn-light btn-icon" data-close-modal="assignModal">×</button></div>
      <div class="modal-body">
        <input id="assignEmpCode" type="hidden" /><input id="assignWorkDate" type="hidden" />
        <div id="assignEmployeeInfo" style="padding:13px;border-radius:12px;background:var(--blue-100);color:var(--blue-700);margin-bottom:15px;font-weight:700"></div>
        <div class="form-row">
          <div class="field"><label>กะทำงาน</label><select id="assignShiftCode" class="select"></select></div>
          <div class="field"><label>สถานะการยืนยันกะ</label><select id="assignConfirm" class="select"><option value="false">ยังไม่ยืนยัน</option><option value="true">ยืนยันกะทันที</option></select><small id="assignConfirmHelp" class="field-help">ยังไม่ยืนยัน: บันทึกเป็นกะร่างสถานะ ASSIGNED และยังแก้ไขได้</small></div>
        </div>
        <div class="field"><label>หมายเหตุ</label><input id="assignNote" class="input" placeholder="หมายเหตุการจัดกะ" /></div>
        <div class="field"><label>เหตุผลการเปลี่ยนแปลง</label><input id="assignReason" class="input" value="กำหนดกะจากหน้าปฏิทิน" /></div>
      </div>
      <div class="modal-footer"><button id="deleteAssignmentBtn" class="btn btn-danger" style="margin-right:auto">ลบกะที่จัดไว้</button><button class="btn btn-light" data-close-modal="assignModal">ยกเลิก</button><button id="saveAssignmentBtn" class="btn btn-primary">บันทึกกะ</button></div>
    </div>
  </div>

  <!-- Shift Master Modal -->
  <div id="shiftMasterModal" class="modal-backdrop hidden">
    <div class="modal">
      <div class="modal-header"><h3>ข้อมูลกะทำงาน</h3><button class="btn btn-light btn-icon" data-close-modal="shiftMasterModal">×</button></div>
      <div class="modal-body">
        <div class="form-row"><div class="field"><label>รหัสกะ</label><input id="smCode" class="input" /></div><div class="field"><label>ชื่อกะ</label><input id="smName" class="input" /></div></div>
        <div class="form-row"><div class="field"><label>เวลาเริ่ม</label><input id="smStart" class="input" type="time" /></div><div class="field"><label>เวลาสิ้นสุด</label><input id="smEnd" class="input" type="time" /></div></div>
        <div class="form-row-3"><div class="field"><label>เวลาพัก (นาที)</label><input id="smBreak" class="input" type="number" min="0" value="0" /></div><div class="field"><label>ลำดับ</label><input id="smOrder" class="input" type="number" value="0" /></div><div class="field"><label>สถานะ</label><select id="smActive" class="select"><option value="true">ใช้งาน</option><option value="false">ปิดใช้งาน</option></select></div></div>
        <div style="display:flex;gap:18px;margin-bottom:16px"><label class="checkbox-line"><input id="smWorkday" type="checkbox" checked /> เป็นวันทำงาน</label><label class="checkbox-line"><input id="smNight" type="checkbox" /> กะกลางคืน</label></div>
        <div class="field"><label>หมายเหตุ</label><textarea id="smNote" class="textarea"></textarea></div>
      </div>
      <div class="modal-footer"><button class="btn btn-light" data-close-modal="shiftMasterModal">ยกเลิก</button><button id="saveShiftMasterBtn" class="btn btn-primary">บันทึก</button></div>
    </div>
  </div>

  <!-- Holiday Modal -->
  <div id="holidayModal" class="modal-backdrop hidden">
    <div class="modal">
      <div class="modal-header"><h3>ข้อมูลวันหยุด</h3><button class="btn btn-light btn-icon" data-close-modal="holidayModal">×</button></div>
      <div class="modal-body"><div class="field"><label>วันที่</label><input id="holDate" class="input" type="date" /></div><div class="field"><label>ชื่อวันหยุด</label><input id="holName" class="input" /></div><div class="field"><label>แหล่งข้อมูล</label><input id="holSource" class="input" value="HR_ADMIN" /></div><div class="field"><label>หมายเหตุ</label><textarea id="holNote" class="textarea"></textarea></div></div>
      <div class="modal-footer"><button class="btn btn-light" data-close-modal="holidayModal">ยกเลิก</button><button id="saveHolidayBtn" class="btn btn-primary">บันทึก</button></div>
    </div>
  </div>

  <!-- User Modal -->
  <div id="userModal" class="modal-backdrop hidden">
    <div class="modal large">
      <div class="modal-header"><h3>กำหนดสิทธิ์ผู้ใช้งาน</h3><button class="btn btn-light btn-icon" data-close-modal="userModal">×</button></div>
      <div class="modal-body">
        <input id="umUserId" type="hidden" />
        <div class="form-row-3"><div class="field"><label>อีเมล</label><input id="umEmail" class="input" disabled /></div><div class="field"><label>ชื่อแสดง</label><input id="umDisplayName" class="input" /></div><div class="field"><label>Role</label><select id="umRole" class="select"><option value="VIEWER">VIEWER</option><option value="USER">USER</option><option value="HR_ADMIN">HR_ADMIN</option></select></div></div>
        <label class="checkbox-line" style="margin-bottom:18px"><input id="umActive" type="checkbox" checked /> เปิดใช้งาน User</label>
        <div style="border-top:1px solid var(--slate-200);padding-top:16px"><h4 style="margin:0 0 12px">Scope หลัก</h4><div class="form-row-3"><div class="field"><label>ประเภท Scope</label><select id="umScopeType" class="select"><option value="ALL">ALL</option><option value="ZONE">ZONE</option><option value="AREA">AREA</option><option value="SUB_AREA">SUB_AREA</option><option value="DEPARTMENT">DEPARTMENT</option><option value="EMPLOYEE">EMPLOYEE</option></select></div><div class="field"><label>ค่า Scope</label><input id="umScopeValue" class="input" value="*" /></div><div class="field"><label>ชื่อแสดง Scope</label><input id="umScopeLabel" class="input" value="ทุกพื้นที่" /></div></div><div style="display:flex;gap:18px;flex-wrap:wrap"><label class="checkbox-line"><input id="umCanView" type="checkbox" checked /> ดูข้อมูล</label><label class="checkbox-line"><input id="umCanEdit" type="checkbox" /> จัดกะ</label><label class="checkbox-line"><input id="umCanConfirm" type="checkbox" /> ยืนยันกะ</label></div></div>
      </div>
      <div class="modal-footer"><button class="btn btn-light" data-close-modal="userModal">ยกเลิก</button><button id="saveUserBtn" class="btn btn-primary">บันทึกสิทธิ์</button></div>
    </div>
  </div>
  <script src="./js/config.js?v=6.0.0"></script>
  <script src="./js/shift-api.js?v=6.0.0"></script>
  <script src="./js/core/app-core.js?v=6.0.0"></script>
  <script src="./js/enhancements.js?v=2.0.0"></script>
  <script src="./js/dashboard-enterprise.js?v=2.0.0"></script>
  <script src="./js/dashboard-executive.js?v=5.2.0"></script>
  <script src="./js/schedule-pro.js?v=6.0.0"></script>
  <script src="./js/review-center.js?v=6.0.0"></script>
  <script src="./js/report-center.js?v=6.0.0"></script>
  <script src="./js/hr-admin-center.js?v=6.0.0"></script>
  <script src="./js/settings-enterprise.js?v=4.0.0"></script>
  <script src="./js/platform-shell.js?v=6.0.0"></script>
  <script src="./js/functional-complete.js?v=6.0.0"></script>
</body>
</html>
