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
- Candidate แสดงเฉพาะช่างใน Division เดียวกัน + ประเภทการปฏิบัติงานตรงกับ Team ปลายทาง
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
