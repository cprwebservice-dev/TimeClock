V6.15.29 FIX15L Borrow UX Modernization — Frontend only; no SQL required.
TimeClock Enterprise V6.15.29 FIX15G — Borrow Notification + Expiry Reminder

ติดตั้ง FIX15G
1) รัน SQL_ที่ต้องรัน_V6.15.29_FIX15G_BORROW_NOTIFICATION_EXPIRY_REMINDER.sql
2) รัน SQL_สำหรับตรวจสอบ_V6.15.29_FIX15G_BORROW_NOTIFICATION_EXPIRY_REMINDER.sql
   - Check 1–18 ต้อง PASS
   - Diagnostic Query ท้าย 4 ชุดต้องได้ 0 rows
3) Deploy Web ZIP ไปที่ repository root
4) Ctrl + Shift + R และ Login ใหม่
5) หน้า ยืมตัวช่าง: กด “🔔 เปิดแจ้งเตือน” หากต้องการ Browser Notification

FIX15G Notification
- ปลายทางส่งคำขอ -> แจ้ง Manager/Acting ต้นทาง + แจ้ง HR Admin เพื่อรับทราบ
- ต้นทางอนุมัติ/ไม่อนุมัติ -> แจ้ง Manager/Acting ปลายทาง
- Cancel / End Early -> แจ้งทั้งสองฝ่าย
- ก่อนครบกำหนด -> แจ้ง 3 วัน, 1 วัน และวันครบกำหนด
- Notification ถูกเก็บในฐานข้อมูลและรวมกับกระดิ่งแจ้งเตือนเดิมของ TimeClock
- คลิก Notification จะเปิด Team Workspace > Borrow และ Focus รายการนั้น
- Realtime เมื่อใช้งานได้ + polling fallback 60 วินาที
- Browser Notification ทำงานเมื่อ Browser/App session ยังทำงานและผู้ใช้อนุญาต Notification
- ไม่ส่ง Notification การยืมตัวให้ HR Admin ในฐานะ Operational Actor

V6.15.29 FIX15C — Borrow Effective Window Monthly Personal Display

TimeClock Enterprise — V6.15.29 FIX15
Manager-based Borrow Workflow + FIX14F Typography

BASE
- Frontend base: V6.15.29 FIX14F LINE Seed Sans TH KPI Style
- Database prerequisite: FIX14 / FIX14B / FIX14C installed and verified
- FIX15 changes only Borrow business logic + Borrow UX. Permanent Team, Schedule, Acting, Safe Team Closure remain intact.

ลำดับติดตั้ง
1) Supabase SQL Editor: รัน
   SQL_ที่ต้องรัน_V6.15.29_FIX15_MANAGER_BASED_BORROW_WORKFLOW.sql
2) Supabase SQL Editor: รัน
   SQL_สำหรับตรวจสอบ_V6.15.29_FIX15_MANAGER_BASED_BORROW_WORKFLOW.sql
   - Check 1–21 ต้อง PASS
   - Query ท้าย 2 ชุดต้องได้ 0 rows
3) Deploy Web ZIP ไปที่ repository root
4) Logout/Login หรือ Ctrl + Shift + R

กติกา Borrow หลัง FIX15
- การยืมตัวตัดสินจาก Manager ไม่ใช่ Home Org vs Destination Org
- ปลายทางเป็นผู้ร้องขอเสมอ
- ปลายทางเลือก Team ของตนก่อน
- Candidate แสดงช่างใน Division เดียวกัน + ต่าง Manager; ประเภททีมที่ไม่ตรงจะแสดง Warning และยัง Block ที่ Preview ตาม Team policy
- Source Manager != Destination Manager => Borrow
- Source Manager = Destination Manager => ไม่สร้าง Borrow; ใช้ Team Membership > ย้ายทีม
- เมื่อส่งคำขอ => PENDING_SOURCE
- Manager / Acting ต้นทางเป็นผู้อนุมัติหรือไม่อนุมัติ
- เมื่อ Approved: Working Team = Team ปลายทางเฉพาะช่วง Effective Date
- Permanent Home Team ไม่เปลี่ยน
- ครบกำหนดกลับ Home Team อัตโนมัติ
- Destination Manager/Acting จัดกะได้ในช่วงยืม; Source Manager เป็น Read-only ตาม Schedule Authority ที่มีอยู่แล้ว
- HR Admin ดู Audit / จัด Acting แต่ไม่ใช่ Operational Approver

Backward compatibility
- Historical TEMP_TEAM_ASSIST records ไม่ถูกลบ แต่ไม่แสดงใน Borrow Module ใหม่
- Existing BORROW_CROSS_ORG rows ยังอ่านได้เพื่อประวัติ
- Working Team resolver เดิมยังรองรับ Approved Borrow ตาม Effective Date

Typography
- ภาษาไทย: LINE Seed Sans TH
- English + ตัวเลข: Inter / system-ui / Segoe UI / Arial / sans-serif
- ไม่ bundle font binary ใน ZIP


V6.15.29 FIX15A
- Borrow Candidate Pool = same Division + different Manager; no longer hidden by destination Team category.
- Operational Type mismatch is shown as a warning and remains blocked at Preview by current Team policy.
- Same Manager continues to use Team Membership > ย้ายทีม.


FIX15B AUTH SESSION HARDENING
- Refresh/validate Supabase session before Team Workspace RPC
- Retry one time on HTTP 401 after refreshSession
- Synchronize Realtime token after SIGNED_IN/TOKEN_REFRESHED
- Stop Realtime/polling on SIGNED_OUT or expired session
- No database/SQL change required

FIX15I:
- Run SQL_ที่ต้องรัน_V6.15.29_FIX15I_BORROW_AUDIT_HISTORY_REPORT.sql
- Run SQL_สำหรับตรวจสอบ_V6.15.29_FIX15I_BORROW_AUDIT_HISTORY_REPORT.sql (12/12 PASS)
- Deploy this ZIP and Ctrl+Shift+R
- Borrow > ประวัติ / Audit is read-only and scoped by HR/Manager/Acting authority.


FIX15M:
- Frontend-only Schedule Workspace Header Modernization.
- No SQL required. Deploy over FIX15L and hard refresh.


FIX15N:
- Run FIX15N SQL + Verify before deploying this ZIP.
- Public Holiday calendar remains visible on Borrow dates outside destination schedule scope.
- Source schedule remains hidden/locked outside Borrow effective dates.
