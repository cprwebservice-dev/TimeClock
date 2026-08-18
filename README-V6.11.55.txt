Time-Clock Enterprise V6.11.55
Assigned Work Shift Overrides OFF / Public Holiday

Business Rule
- วันหยุดประจำสัปดาห์และวันหยุดนักขัตฤกษ์เป็นสถานะตามปฏิทิน
- ถ้า Manager/ผู้มีสิทธิ์จัดกะวันนั้นเป็นกะทำงานจริง เช่น D5, D6, N5, N6
  หรือกะทำงานอื่นที่มีเวลาเริ่ม/สิ้นสุด ระบบถือวันนั้นเป็น "วันทำงาน"
- กะที่จัดไว้มี Priority เหนือ Natural OFF / Public Holiday
- จึงสามารถรับรองเวลาทำงานได้
- ถ้ากะยังเป็น OFF / HOL หรือไม่มีช่วงเวลากะทำงาน จะยังรับรองไม่ได้
- วันลา ยังคงรับรองไม่ได้

Frontend
- MONTHLY PERSONAL OVERVIEW แสดงวันดังกล่าวเป็นวันทำงาน
- ปุ่ม Time Certification แสดงได้
- รายการวันหยุดนักขัตฤกษ์ใต้ปฏิทินยังคงแสดง เพราะเป็นข้อมูลปฏิทิน
- Attendance Status ฝั่ง UI ไม่บังคับเป็น DAY_OFF ถ้ามีกะทำงานจริง

Backend
- ta_save_time_certification_v61139 ใช้ Effective Shift เป็นตัวตัดสิน
- Natural weekly off / public holiday จะไม่ block certification ถ้ามีกะทำงานจริง
- System Period / Scope / Missing IN-OUT / Shift 1 only / Actual OUT cap /
  STALE เมื่อกะเปลี่ยนจริง คงเดิม

ติดตั้ง
1) รัน SQL ที่ต้องรัน V6.11.55
2) รัน SQL สำหรับตรวจสอบ -> PASS 8 รายการ
3) Deploy ZIP
4) Ctrl + Shift + R
