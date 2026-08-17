Time-Clock Enterprise V6.11.43 — Time Certification Eligibility

ปรับเฉพาะ Time Certification
1) วันหยุด / กะ OFF / วันลา ไม่สามารถรับรองเวลา และไม่แสดงปุ่มรับรองเวลา
2) รับรองได้เฉพาะวันที่ปัจจุบันและย้อนหลัง
   - จำกัดที่ work_date
   - กะกลางคืนยังสามารถให้เวลาสิ้นสุดเป็นวันถัดไปได้
3) ไม่มีเวลาเข้า / ไม่มีเวลาออก / ไม่มีทั้งคู่ สามารถรับรองเวลาได้
   - หาก attendance_workday ยังไม่มี ระบบ Auto-Rebuild ก่อนบันทึก
4) เวลาสิ้นสุดรับรองยังเกินเวลาสิ้นสุดกะได้
5) Manager Scope / HR Admin / System Period / Audit / Raw Time คงเดิม

การติดตั้ง
1) รัน SQL_ที่ต้องรัน_V6.11.43_TIME_CERTIFICATION_ELIGIBILITY.sql
2) รัน SQL_สำหรับตรวจสอบ_V6.11.43_TIME_CERTIFICATION_ELIGIBILITY.sql
   ผลควร PASS 10 รายการ
3) Deploy ZIP
4) Ctrl + Shift + R
