Time-Clock Enterprise V6.15.24
4D.1A.1 + 4D.1B — Team Category + Team Membership

สิ่งที่เพิ่ม
- Team Category: CAR / MOTORCYCLE
- Auto-generated names/codes: ทีมรถยนต์ 01 / BE5-C01, ทีมมอเตอร์ไซค์ 01 / BE5-M01
- Running number แยกตาม Org + Category และไม่ reuse
- Team Membership แบบ Effective Date
- Bulk member assignment ขั้นต่ำ 3 คน
- พนักงาน 1 คนมี Home Team ได้เพียง 1 ทีมต่อวัน
- สมาชิกต้องอยู่ Org เดียวกับ Team และ car_team ต้องตรง Team Category
- Dashboard readiness: รถยนต์ยังไม่มีทีม / มอเตอร์ไซค์ไม่มีทีม / ไม่ระบุ car_team
- MOTORCYCLE ไม่ถูกบังคับให้มี Team ก่อนจัดกะ (Enforcement ยังไม่เปิดใน V6.15.24)
- UNSPECIFIED ยังจัดกะได้ในอนาคตตาม policy ที่กำหนดไว้ และไม่สามารถเข้าทีมจนกว่าจะปรับ Employee Master
- Team / Membership audit

ยังไม่ทำในรุ่นนี้
- Team Enforcement ก่อนจัดกะ (4D.1C)
- Borrow Technician
- Acting Manager
- Employee Org Transfer Reconciliation

วิธีติดตั้ง
1) รัน SQL_ที่ต้องรัน_V6.15.24_4D1A1_4D1B_TEAM_CATEGORY_MEMBERSHIP.sql
2) รัน SQL_สำหรับตรวจสอบ_V6.15.24_4D1A1_4D1B_TEAM_CATEGORY_MEMBERSHIP.sql และตรวจ 20 รายการ
3) Deploy Web App ทั้ง package
4) Hard Refresh Browser
