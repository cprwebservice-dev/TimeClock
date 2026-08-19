Time-Clock Enterprise V6.14.3 — Day-off Quota Hard Guard

สิ่งที่เพิ่ม
- วันหยุดคงเหลือ 0 วัน: ห้ามกำหนดวันหยุดเพิ่ม
- ตรวจแบบ projected quota ไม่ Block การบันทึกวันหยุดเดิมซ้ำ
- เปลี่ยนวันหยุดเดิมเป็นวันทำงาน: คืนสิทธิ์
- Bulk / Fill / Paste / Copy Week คิดผลกระทบสุทธิ รองรับย้ายวันหยุดในชุดเดียว
- Popup ปิดตัวเลือกวันหยุดเมื่อสิทธิ์หมด (ถ้าวันนั้นยังไม่ได้ใช้สิทธิ์)
- Backend wrappers V6.14.3 ตรวจซ้ำก่อนเขียนจริง

ติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.14.3_DAYOFF_QUOTA_HARD_GUARD.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.14.3_DAYOFF_QUOTA_HARD_GUARD.sql
3. Deploy ไฟล์ V6.14.3
4. Ctrl + F5


V6.14.3
- วันหยุดคงเหลือติดลบยังสามารถเปลี่ยนวันหยุดเดิมกลับเป็นกะทำงานได้ (คืนสิทธิ์)
- เพิ่มตัวเลือก ลา (LV) ใน Popup กำหนดกะกลาง ใช้ร่วมกับรายทีม/Monthly Personal/ดับเบิลคลิก Cell
- Full-month Quick, Context Menu และรูปแบบ 7 วันรองรับ LV ต่อเนื่องเหมือนเดิม

การกำหนดลา (LV) ใน V6.14.3
- ตารางกะรายบุคคลเต็มเดือน: ปุ่มด่วน “ลา / LV”
- Context Menu ของ Cell: “กำหนดลา (LV)”
- รูปแบบกะ 7 วัน: ตัวเลือก “ลา”
- Popup กำหนดกะกลาง: เพิ่ม Card “ลา” (ใช้จาก Double click, รายทีม, Monthly Personal และหน้าอื่นที่เปิด Popup เดียวกัน)
- LV ไม่หักโควต้าวันหยุด

ลำดับติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.14.3_DAYOFF_QUOTA_LEAVE_FIX.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.14.3_DAYOFF_QUOTA_LEAVE_FIX.sql
3. Deploy V6.14.3
4. Ctrl + F5
