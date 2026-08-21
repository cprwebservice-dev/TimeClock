Time-Clock Enterprise V6.14.19
Monthly Work Pattern + Save/Refresh Consistency

ปรับปรุงหลัก
1. หน้า รูปแบบการทำงานช่างเทคนิค ใช้เดือนเป็นหน่วยอ้างอิง
2. รูปแบบ 5 วัน / 6 วัน และกะตั้งต้นเป็น Monthly Baseline มีผลตั้งแต่วันที่ 1 ของเดือน
3. ไม่อนุญาตให้เริ่ม/สิ้นสุด Work Pattern กลางเดือน
4. Save ซ้ำพนักงาน + เดือนเดิม = Update แถวเดิม ไม่สร้างข้อมูลซ้ำ
5. เมื่อบันทึกเดือนเดิม ระบบล้างข้อมูล Legacy ที่เคยเริ่มกลางเดือนของเดือนนั้น
6. Work Pattern page ใช้ Canonical Reader RPC เดียว แทนการ Merge 3 RPC จึงลดกรณี Save แล้วหน้าแสดงค่าเก่า
7. หลัง Save ระบบย้ายเดือนอ้างอิงไปยังเดือนที่บันทึกและ Reload ตารางทันที
8. ล้าง Schedule / Time View / Monthly Attendance cache หลัง Save
9. หากเดือนที่บันทึกมีวันที่ผ่านมาแล้ว ระบบ Refresh Attendance ตั้งแต่วันที่ 1 ของเดือนถึงวันนี้แบบแบ่งกลุ่มพนักงาน
10. System Period Guard เดิมยังคงใช้: เดือนที่ปิดรอบแก้ไขกะหรือรับรองเวลาไม่สามารถเริ่ม Work Pattern ได้

ติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.14.19_MONTHLY_WORK_PATTERN_SAVE_CONSISTENCY.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.14.19_MONTHLY_WORK_PATTERN_SAVE_CONSISTENCY.sql
3. Deploy Web V6.14.19
4. Ctrl + F5
