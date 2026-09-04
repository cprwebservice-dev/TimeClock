TimeClock Enterprise — V6.15.29 FIX14B FINAL
Temporary Team Assignment / Borrow + Acting + Working-Team Schedule Authority

BASE
- Frontend base: V6.15.29 FIX12 Safe Team Closure UX (ZIP ล่าสุดที่ผู้ใช้ส่ง)
- Database prerequisite: FIX14 Temporary Team Assignment / Borrow Foundation ติดตั้งแล้ว
- FIX14B FINAL SQL รวม UI-support backend + Motorcycle min1 policy + Working Team Schedule Authority ไว้ในไฟล์เดียว

ลำดับติดตั้ง
1) Supabase SQL Editor: รัน
   SQL_ที่ต้องรัน_V6.15.29_FIX14B_FINAL_TEMP_ASSIGNMENT_ACTING_SCHEDULE_INTEGRATION.sql

2) Supabase SQL Editor: รัน
   SQL_สำหรับตรวจสอบ_V6.15.29_FIX14B_FINAL_TEMP_ASSIGNMENT_ACTING_SCHEDULE_INTEGRATION.sql
   - Check 1–20 ต้อง PASS
   - Query ตรวจ Temporary Assignment overlap ต้องได้ 0 แถว
   - Query ตรวจ Acting overlap ต้องได้ 0 แถว

3) Deploy ไฟล์ Web จาก ZIP GitHub FULL ไปที่ repository root

4) Hard Refresh: Ctrl + Shift + R และ Login ใหม่

กติกาที่ใช้หลัง FIX14B FINAL
- Home Unit = Employee Master / Permanent Home Team ไม่ถูกแก้จากการยืมตัว
- Home Unit = Destination Unit + ช่วงชั่วคราว => ไปช่วยทีมภายในหน่วยงาน
- Home Unit != Destination Unit แต่ Division เดียวกัน => ยืมตัวต่างหน่วยงาน
- ต่าง Division => Block
- Temporary Assignment ต้องมีวันที่เริ่ม–สิ้นสุด และหมดช่วงแล้วกลับ Home Team อัตโนมัติ
- Manager คนเดียวกันมี Authority ทั้งต้นทางและปลายทาง => Direct Approve
- Manager คนละคน => Counterpart Approval
- Acting Manager อนุมัติและจัดกะได้เทียบเท่า Manager เฉพาะ Scope + ช่วง Acting ที่มีผล
- HR Admin จัด Acting / ดู Audit ได้ แต่ไม่ใช่ Operational Approver ของ Borrow

Schedule / Calendar หลังแก้
- ช่างที่ BN5 ถูกยืมไป BN6 จะถูกจัดกลุ่มอยู่ใต้ Working Team ของ BN6 ในวันที่ยืม
- ไม่สร้าง Team row แยกตาม Assignment อีกแล้ว
- Destination Manager/Acting: VIEW + EDIT/CONFIRM Schedule ระหว่างช่วงยืม
- Source Manager: ยัง VIEW ได้ แต่เป็น Read-only ระหว่างช่วงยืม เพื่อไม่ให้จัดกะซ้ำกับปลายทาง
- ถ้า Manager เป็นคนเดียวกันทั้ง 2 หน่วยงาน ระบบยังแก้กะได้ เพราะมี Destination Authority ด้วย
- Employee badge แสดงตามมุมผู้ใช้งาน เช่น “ยืมจาก BN5” ฝั่งที่จัดกะได้ และ “ยืมไป BN6” ฝั่งต้นทางที่ Read-only
- Team card แสดงจำนวน “ยืมชั่วคราว” / “มาช่วย” โดยรวมอยู่กับทีมปลายทาง
- Safe Team Closure ยังคงตรวจ Temporary Assignment ก่อนปิดทีม

Team Policy
- CAR: ต้องมี Team, Permanent Member 3–5 คน
- MOTORCYCLE: ต้องมี Team, ขั้นต่ำ 1 คน
- SUPPORT: ต้องมี Team, ขั้นต่ำ 1 คน
- Temporary/Borrowed Member ไม่เปลี่ยน Permanent Team Membership และไม่ถูกใช้แทนจำนวนสมาชิกประจำของ Home Team

Runtime Test ที่แนะนำ
A) Manager คนละคน
   BN5 ช่าง A -> BN6 ช่วง 10–15/09
   - Manager BN5 เห็น A แต่จัดกะช่วง 10–15/09 ไม่ได้
   - Manager BN6 เห็น A ใต้ Team BN6 และจัดกะได้

B) Manager คนเดียวกัน
   - สร้างรายการแล้ว Direct Approve
   - Manager จัดกะ A ใน Working Team ปลายทางได้

C) Acting
   - Acting ของ BN6 ที่ Effective ครอบช่วงงาน เห็นและจัดกะ A ได้
   - นอกช่วง Acting ไม่มีสิทธิ์ดังกล่าว

D) หลังวันสิ้นสุด
   - A กลับ Home Team เดิมอัตโนมัติ
   - Manager BN6 ไม่มี Borrow Schedule Authority ต่อ

E) Team Calendar
   - Borrowed technician ต้องรวมใน Team BN6 เดียวกับสมาชิกปลายทาง
   - ไม่ควรมีแถว TEMP:<assignment_id> แยกต่างหาก
