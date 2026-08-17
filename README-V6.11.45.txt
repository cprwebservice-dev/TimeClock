Time-Clock Enterprise V6.11.45
Time Certification — Shift 1 Only + Actual OUT Guard

ปรับตามเงื่อนไขล่าสุด
1. เมื่อรับรองเวลาแล้ว แสดงช่วง "เริ่ม–สิ้นสุด" บน Badge
   ทั้ง TEAM DAILY DETAIL และ MONTHLY PERSONAL OVERVIEW
2. วันที่มี 2 กะ / SPLIT_FLEX
   - รับรองเฉพาะกะที่ 1
   - Modal ระบุชัดว่า "เฉพาะกะที่ 1"
   - กะที่ 2 ใช้ Punch จริง และไม่ถูก Time Certification แทนค่า
3. ถ้ากะที่ 1 มีเวลาออกจริง
   - ค่าเริ่มต้นเวลาสิ้นสุด = เวลาออกจริง
   - Frontend จำกัดวันที่/เวลาไม่ให้เกิน
   - Backend ตรวจซ้ำ ไม่สามารถบันทึกเกินเวลาออกจริง
4. ถ้ากะที่ 1 ไม่มีเวลาออกจริง
   - ยังสามารถกรอกเวลาสิ้นสุดรับรองได้
5. OFF / วันลา / วันอนาคต / System Period / STALE หลังเปลี่ยนกะ
   คง Logic เดิม

ติดตั้ง
1) รัน SQL ที่ต้องรัน V6.11.45
2) รัน SQL สำหรับตรวจสอบ ผลควร PASS 10 รายการ
3) Deploy ZIP
4) Ctrl + Shift + R
