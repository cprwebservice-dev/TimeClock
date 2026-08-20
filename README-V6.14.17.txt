Time-Clock Enterprise V6.14.17
Position-aware Work Pattern + System Period Effective-Date Guard

สิ่งที่ปรับ
1. ผู้จัดการแผนก: บังคับ TECH_5D, วันหยุดเสาร์-อาทิตย์ + นักขัตฤกษ์
2. ช่างเทคนิค/ช่างเทคนิคอาวุโส: เลือก TECH_5D หรือ TECH_6D ได้ตามการจัดทีม
3. กะตั้งต้นเช้า/ดึกยังจับคู่ตาม Work Pattern: STD/S134 และ S043/S135
4. วันเริ่มใช้ Work Pattern ต้องไม่อยู่ก่อน/ในรอบที่ปิด Schedule หรือ Certification
5. ถ้า ก.ค. 2569 ปิดทั้งสองส่วน และ ส.ค. ยังเปิด ระบบเสนอวันเริ่มใช้ 01/08/2569
6. Backend ไม่มี HR Admin bypass สำหรับ Work Pattern ย้อนเข้ารอบปิด; หากต้องแก้ย้อนหลังให้เปิดรอบก่อน
7. Explicit historical assignment เดิมยังคงเป็นข้อมูลเดิม; Position-aware fallback ใช้เมื่อยังไม่มี Assignment

ติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.14.17_POSITION_PERIOD_POLICY.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.14.17_POSITION_PERIOD_POLICY.sql
3. Deploy web package V6.14.17
4. Ctrl + F5
