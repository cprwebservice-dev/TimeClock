TimeClock Enterprise V6.15.26 FIX1 — Team Runtime Session / Loading Error State

GitHub Deploy Slim — 13 files

FIX1:
- Team Module ตรวจ Supabase auth session ก่อนโหลดข้อมูล
- Runtime diagnostic แสดง Actor / Role / Scope / Employee count
- Backend actor resolver fallback จาก auth.uid() -> JWT email อย่างปลอดภัย
- หน้า Team Master ไม่ค้างคำว่า กำลังโหลด เมื่อ RPC ผิดพลาด
- Error card แสดงสาเหตุและปุ่มลองใหม่
- ไม่เปลี่ยน Team Policy / Membership / Schedule Enforcement เดิม

ต้องรัน SQL V6.15.26 FIX1 ก่อน Deploy Web App แล้ว Hard Refresh
