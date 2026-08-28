TimeClock Enterprise V6.15.26 — GitHub Deploy Slim
4D.1D Team Schedule View

อัปโหลดไฟล์ในชุด GitHub Deploy Slim ทับไฟล์เดิมใน Repository ได้โดยตรง
จำนวนไฟล์ Web App ต่ำกว่า 100 ไฟล์

เพิ่มใน V6.15.26:
- ปฏิทิน TEAM/TIME ใช้ Effective Team ตามวันที่
- Filter ทีมช่างเทคนิคแยกจาก Filter หน่วยงาน
- ทีมรถยนต์/มอเตอร์ไซค์แสดง Team Code + Team Name
- รถยนต์ไม่มี Team แสดงกลุ่ม "ยังไม่ได้กำหนดทีมรถยนต์"
- มอเตอร์ไซค์ไม่มี Team แสดง "ไม่บังคับทีม"
- ไม่ระบุ car_team แสดงกลุ่มเตือนแยก
- กด รายคน จาก Team View แล้วกรองพนักงานตาม Team เดิม

ต้องรัน SQL V6.15.26 แยกก่อน/พร้อม Deploy Web App
