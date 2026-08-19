Time-Clock Enterprise V6.14.1 — Schedule Guard + Icon Accuracy

ฐาน: V6.14.0

แก้:
1. 48-hour warning ใช้ Effective Schedule backend V6.14.1 เป็นค่า authoritative
2. แก้กรณีข้อความเตือนแสดง 19 ชม. ทั้งที่ trigger มาจากค่า Local > 48 ชม.
3. Validator นับ Default Shift / Paired Day-off / Assigned Shift / Scheduling Rule ต่อเนื่องข้ามเดือน
4. วันหยุด OSTD/OS043/OS134/OS135 reset ชั่วโมงต่อเนื่อง
5. Assigned working shift บนวันหยุดตามปฏิทินแสดง icon กะทำงาน ไม่ค้าง icon หยุด
6. หลัง Save patch เวลาและ work mode ใน row ก่อน render
7. Icon tile และ SVG จัดกึ่งกลาง cell ทั้งแนวตั้ง/แนวนอน

ติดตั้ง:
1. รัน SQL_ที่ต้องรัน_V6.14.1_SCHEDULE_GUARD_FIX.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.14.1_SCHEDULE_GUARD_FIX.sql
3. Deploy ZIP
4. Ctrl + F5
