Time-Clock Enterprise V6.15.23
4D.1A — Team Master + Auto Generate Team
============================================================

ฐานการพัฒนา
- Built on V6.15.22 (4C complete)
- Day-off / Leave / Request / Schedule atomic flows เดิมไม่ถูกเปลี่ยน

4D.1A รอบนี้
1. เพิ่มเมนู Manager/HR Admin: ทีมช่างเทคนิค
2. Team Master ผูกกับ ta_org_units เดิม
3. Manager เห็นเฉพาะ Org Unit ที่อยู่ในสิทธิ์ EDIT_SCHEDULE ของตน
4. HR Admin สามารถดู/สร้าง Team Master ในทุก Org Unit ที่มี Employee Master
5. Manager ไม่กรอกชื่อทีมและ Team Code เอง
6. Backend Auto Generate ตัวอย่าง:
   - Team Name: ทีม 01
   - Team Code: BE5-T01
   - Full Label: BE5 · ทีม 01
7. Running Number แยกตาม Org Unit และ serialize ด้วย Advisory Lock
8. Team ที่ปิดใช้งานใช้ Soft Deactivate เท่านั้น เลขเดิมไม่ถูกนำกลับมาใช้
9. เก็บ Audit CREATE_TEAM / DEACTIVATE_TEAM
10. หน้า Team Master มี Org Scope, KPI, Team list และ Audit ล่าสุด

สำคัญ
- 4D.1A ยังไม่มี Team Membership
- ยังไม่บังคับสมาชิกขั้นต่ำ 3 คน
- ยังไม่เปิด Team Enforcement ก่อนจัดกะ
- Schedule Writer / Request 4B / Leave 4C ยังทำงานเหมือน V6.15.22
- Membership จะทำใน 4D.1B และ Enforcement ใน 4D.1C

การติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.15.23_4D1A_TEAM_MASTER_AUTO_GENERATE.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.15.23_4D1A_TEAM_MASTER_AUTO_GENERATE.sql
3. ผลตรวจหลักควร PASS ทั้ง 16 รายการ
4. Upload Full Package และ Hard Refresh

Static validation ก่อนส่ง
- node --check app.js
- node --check portal.js
- HTML parse / duplicate IDs
- CSS brace balance
- Portal Service Worker cache version
- ZIP integrity
