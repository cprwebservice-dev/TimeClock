/* ================================================================
   Time-Clock Enterprise V6.0 - Functional Complete
   ================================================================ */

:root {
  --fc-shadow: 0 14px 40px rgba(15, 23, 42, .12);
  --fc-radius: 16px;
}

/* Shared */
.fc-hidden { display:none !important; }
.fc-toolbar { display:flex; gap:10px; flex-wrap:wrap; align-items:end; }
.fc-toolbar .field { min-width:150px; }
.fc-toolbar-spacer { flex:1; }
.fc-chip { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--slate-200); background:var(--surface, #fff); border-radius:999px; padding:6px 10px; font-size:11px; font-weight:800; }
.fc-chip.status-DRAFT { color:#475569; background:#f8fafc; }
.fc-chip.status-PUBLISHED { color:#0369a1; background:#e0f2fe; border-color:#bae6fd; }
.fc-chip.status-LOCKED { color:#9f1239; background:#ffe4e6; border-color:#fecdd3; }
.fc-note { font-size:11px; color:var(--slate-500); }
.fc-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
.fc-card-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; }
.fc-stat-card { border:1px solid var(--slate-200); background:var(--surface,#fff); border-radius:var(--fc-radius); padding:16px; box-shadow:0 4px 16px rgba(15,23,42,.05); }
.fc-stat-card span { display:block; color:var(--slate-500); font-size:11px; font-weight:700; }
.fc-stat-card strong { display:block; font-size:25px; line-height:1.25; margin-top:5px; }
.fc-stat-card small { color:var(--slate-500); }
.fc-panel-grid { display:grid; grid-template-columns:minmax(0,1.55fr) minmax(320px,.8fr); gap:16px; }
.fc-empty { padding:30px 12px; text-align:center; color:var(--slate-500); }
.fc-badge { display:inline-flex; align-items:center; min-height:24px; padding:4px 8px; border-radius:8px; font-size:10px; font-weight:900; }
.fc-badge.active { background:#dcfce7; color:#166534; }
.fc-badge.resigned { background:#fee2e2; color:#991b1b; }
.fc-badge.waiting { background:#fef3c7; color:#92400e; }
.fc-badge.info { background:#e0f2fe; color:#075985; }
.fc-badge.warning { background:#ffedd5; color:#9a3412; }
.fc-badge.danger { background:#fee2e2; color:#991b1b; }
.fc-badge.neutral { background:#f1f5f9; color:#475569; }

/* Schedule workflow */
.schedule-workflow-bar {
  display:flex; flex-wrap:wrap; align-items:center; gap:10px;
  padding:12px 14px; border-top:1px solid var(--slate-200);
  background:linear-gradient(135deg,rgba(239,246,255,.9),rgba(255,247,237,.9));
}
.schedule-workflow-bar .workflow-summary { display:flex; align-items:center; gap:8px; margin-right:auto; }
.schedule-workflow-bar .workflow-summary strong { font-size:12px; }
.schedule-workflow-bar .workflow-actions { display:flex; gap:7px; flex-wrap:wrap; }
.schedule-workflow-bar .btn { min-height:34px; }
.schedule-locked-overlay { position:relative; }
.schedule-locked-overlay::after { content:"ตารางกะเดือนนี้ถูกล็อก"; position:absolute; inset:0; z-index:20; display:grid; place-items:center; background:rgba(248,250,252,.73); backdrop-filter:blur(2px); font-size:18px; font-weight:900; color:#9f1239; pointer-events:none; }
.schedule-cell.is-published::after { content:"•"; position:absolute; right:3px; bottom:-2px; color:#0284c7; font-size:16px; }
.schedule-cell.is-locked { outline:2px solid #e11d48; outline-offset:-2px; }

/* Attendance enterprise grid */
.attendance-enterprise-tools { margin-top:14px; }
.attendance-enterprise-tools .panel-body { padding:12px 14px; }
.attendance-grid-summary { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:10px; margin-top:12px; }
.attendance-mini-kpi { border:1px solid var(--slate-200); border-radius:12px; padding:10px 12px; background:var(--surface,#fff); }
.attendance-mini-kpi span { display:block; font-size:10px; color:var(--slate-500); }
.attendance-mini-kpi strong { display:block; font-size:19px; margin-top:2px; }
.attendance-grid-table th[data-sort-key] { cursor:pointer; user-select:none; }
.attendance-grid-table th[data-sort-key]::after { content:"↕"; opacity:.35; margin-left:6px; font-size:10px; }
.attendance-grid-table th.sort-asc::after { content:"↑"; opacity:1; }
.attendance-grid-table th.sort-desc::after { content:"↓"; opacity:1; }
.attendance-grid-table tbody tr { cursor:pointer; }
.attendance-grid-table tbody tr:hover { background:rgba(219,234,254,.55); }
.attendance-grid-table .sticky-att-1 { position:sticky; left:0; z-index:3; background:var(--surface,#fff); }
.attendance-grid-table .sticky-att-2 { position:sticky; left:94px; z-index:3; background:var(--surface,#fff); }
.attendance-grid-table thead .sticky-att-1,
.attendance-grid-table thead .sticky-att-2 { z-index:7; background:var(--slate-100); }
.attendance-pagination { display:flex; gap:8px; align-items:center; justify-content:flex-end; padding:11px 14px; border-top:1px solid var(--slate-200); }
.attendance-pagination .page-info { min-width:160px; text-align:center; font-size:11px; color:var(--slate-600); }
.attendance-detail-drawer { position:fixed; top:0; right:-480px; width:min(460px,95vw); height:100vh; background:var(--surface,#fff); z-index:1400; box-shadow:-20px 0 50px rgba(15,23,42,.2); transition:right .24s ease; display:flex; flex-direction:column; }
.attendance-detail-drawer.open { right:0; }
.attendance-detail-head { padding:18px; border-bottom:1px solid var(--slate-200); display:flex; align-items:center; justify-content:space-between; }
.attendance-detail-body { padding:18px; overflow:auto; display:grid; gap:12px; }
.attendance-detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
.attendance-detail-item { padding:11px; border:1px solid var(--slate-200); border-radius:11px; }
.attendance-detail-item span { display:block; font-size:10px; color:var(--slate-500); }
.attendance-detail-item strong { display:block; margin-top:4px; }

/* Report Center */
.report-center-page .report-hero { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:22px; border-radius:18px; color:#fff; background:linear-gradient(135deg,#0f4c81,#0b2f55 70%,#ea580c); box-shadow:var(--fc-shadow); }
.report-center-page .report-hero h2 { margin:4px 0 5px; }
.report-filter-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
.report-card-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
.report-type-card { border:1px solid var(--slate-200); border-radius:16px; padding:16px; background:var(--surface,#fff); min-height:188px; display:flex; flex-direction:column; gap:9px; box-shadow:0 5px 18px rgba(15,23,42,.05); }
.report-type-card .report-icon { width:44px; height:44px; border-radius:12px; display:grid; place-items:center; background:#dbeafe; color:#1d4ed8; font-size:20px; }
.report-type-card h3 { margin:0; }
.report-type-card p { margin:0; color:var(--slate-500); font-size:11px; flex:1; }
.report-format-actions { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; }
.report-format-actions .btn { padding-inline:8px; }
.report-job-error { color:#b91c1c; font-size:10px; display:block; margin-top:3px; }

/* Review additions */
.review-resolution-actions { display:flex; gap:7px; flex-wrap:wrap; }
.review-note-input { min-width:240px; }

/* Employee Directory */
.employee-directory-page .directory-hero,
.audit-center-page .audit-hero,
.smart-assistant-page .assistant-hero { display:flex; justify-content:space-between; align-items:center; gap:18px; padding:20px 22px; border-radius:18px; background:linear-gradient(135deg,#eff6ff,#fff7ed); border:1px solid #dbeafe; }
.directory-table-wrap { max-height:68vh; }
.directory-table th { position:sticky; top:0; z-index:2; }
.employee-name-cell strong { display:block; }
.employee-name-cell small { display:block; color:var(--slate-500); }

/* Audit */
.audit-event { display:flex; align-items:flex-start; gap:10px; }
.audit-event-icon { width:30px; height:30px; border-radius:9px; display:grid; place-items:center; background:#e0f2fe; color:#0369a1; flex:0 0 auto; }
.audit-event-detail strong { display:block; }
.audit-event-detail small { display:block; color:var(--slate-500); margin-top:3px; }

/* Smart assistant */
.smart-assistant-page { min-height:calc(100vh - 180px); }
.assistant-shell { display:grid; grid-template-columns:minmax(0,1fr) 300px; gap:16px; }
.assistant-chat { border:1px solid var(--slate-200); border-radius:18px; background:var(--surface,#fff); overflow:hidden; min-height:560px; display:flex; flex-direction:column; }
.assistant-messages { flex:1; overflow:auto; padding:18px; display:flex; flex-direction:column; gap:12px; }
.assistant-message { max-width:82%; padding:11px 13px; border-radius:14px; line-height:1.6; font-size:12px; }
.assistant-message.user { align-self:flex-end; background:#1d4ed8; color:#fff; border-bottom-right-radius:4px; }
.assistant-message.bot { align-self:flex-start; background:#f1f5f9; color:#0f172a; border-bottom-left-radius:4px; }
.assistant-message.bot strong { display:block; margin-bottom:4px; }
.assistant-inputbar { display:flex; gap:8px; padding:12px; border-top:1px solid var(--slate-200); }
.assistant-inputbar input { flex:1; }
.assistant-prompts { display:grid; gap:8px; }
.assistant-prompt { text-align:left; border:1px solid var(--slate-200); border-radius:12px; background:var(--surface,#fff); padding:11px; cursor:pointer; font-size:11px; }
.assistant-prompt:hover { border-color:#60a5fa; background:#eff6ff; }
.assistant-disclaimer { padding:10px 12px; border-radius:11px; background:#fff7ed; color:#9a3412; font-size:10px; }

/* Notification drawer dynamic */
.notification-drawer .notice-card.severity-HIGH .notice-dot { background:#ef4444; }
.notification-drawer .notice-card.severity-MEDIUM .notice-dot { background:#f97316; }
.notification-drawer .notice-card.severity-INFO .notice-dot { background:#0ea5e9; }
.notification-empty { text-align:center; color:var(--slate-500); padding:30px 12px; }

/* Modals */
.fc-modal-wide .modal { width:min(880px,95vw); }
.schedule-pattern-grid { display:grid; grid-template-columns:repeat(7,minmax(72px,1fr)); gap:8px; }
.schedule-pattern-day { border:1px solid var(--slate-200); border-radius:10px; padding:8px; }
.schedule-pattern-day span { display:block; font-size:10px; color:var(--slate-500); margin-bottom:5px; }

/* Dark */
[data-theme="dark"] .schedule-workflow-bar,
body.dark .schedule-workflow-bar { background:linear-gradient(135deg,rgba(30,41,59,.95),rgba(67,20,7,.5)); }
[data-theme="dark"] .assistant-message.bot,
body.dark .assistant-message.bot { background:#1e293b; color:#e2e8f0; }

@media (max-width:1100px) {
  .fc-card-grid,.attendance-grid-summary { grid-template-columns:repeat(3,minmax(0,1fr)); }
  .report-card-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .fc-panel-grid,.assistant-shell { grid-template-columns:1fr; }
}
@media (max-width:720px) {
  .fc-card-grid,.attendance-grid-summary,.report-card-grid,.report-filter-grid { grid-template-columns:1fr 1fr; }
  .schedule-workflow-bar { align-items:flex-start; }
  .schedule-workflow-bar .workflow-summary { width:100%; }
  .attendance-detail-grid { grid-template-columns:1fr; }
  .assistant-message { max-width:94%; }
}
@media (max-width:480px) {
  .fc-card-grid,.attendance-grid-summary,.report-card-grid,.report-filter-grid { grid-template-columns:1fr; }
}

@media print {
  .sidebar,.topbar,.platform-statusbar,.footer-credit,.btn,.developer-console,.notification-drawer,.profile-menu,.command-backdrop { display:none !important; }
  .main,.content,.page { margin:0 !important; padding:0 !important; }
  .panel { box-shadow:none !important; border:0 !important; }
}
