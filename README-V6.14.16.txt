Time-Clock Enterprise V6.14.16
Bulk Technician Work Pattern + Employee Default Day/Night Shift
================================================================

ฐานระบบ
- ใช้ต่อจาก V6.14.15 Schedule + Time Certification Consistency

สิ่งที่ปรับ
1. หน้า “รูปแบบการทำงานช่างเทคนิค” เปลี่ยน Employee Assignment เป็น Bulk Table
   - Checkbox เลือกหลายคน / เลือกทั้งหมดที่กรองอยู่
   - กรองตามหน่วยงานก่อนเลือกได้
   - เลือก 5 วัน / 6 วัน
   - เลือกกะตั้งต้น เช้า / ดึก
   - วันที่เริ่มใช้
   - ยืนยันครั้งเดียวและบันทึกหลายคนใน Transaction เดียว

2. Mapping Auto Shift รายบุคคล
   TECH_5D + กะเช้า = STD   08:30–18:00  / วันหยุด OSTD
   TECH_5D + กะดึก = S134  19:30–05:00  / วันหยุด OS134
   TECH_6D + กะเช้า = S043  08:30–17:30  / วันหยุด OS043
   TECH_6D + กะดึก = S135  19:30–04:30  / วันหยุด OS135

3. Auto Schedule
   - employee default shift มี Priority เหนือ Pattern-wide default
   - Manual Shift ที่จัดไว้ใน shift_calendar ยังมี Priority สูงสุด ไม่ถูก Bulk ทับ
   - Weekly Off ใช้ Paired Day-off ตามกะตั้งต้น
   - HOL / LV / Daily Override / Hour-based / Split ยังคง Logic เดิม

4. รายบุคคลเดิมยังอยู่
   - เปลี่ยนบทบาทเป็น “แก้ไขรายบุคคล / Override”
   - เลือก 5/6 วัน + กะเช้า/ดึกได้จาก Card
   - ไม่ต้องเลือก Template ปกติเอง ระบบกำหนดจาก 5/6 วันอัตโนมัติ

5. UX/UI
   - Summary: จำนวน 5D / 6D / กะเช้า / กะดึก
   - Filter หน่วยงาน + รูปแบบ + กะตั้งต้น
   - Sticky Bulk Action Bar
   - Highlight แถวที่เลือก
   - Blue–Navy–Orange theme + Dark Mode support

6. สิทธิ์และความปลอดภัย
   - การบันทึก Bulk/รายบุคคลใช้ EDIT_SCHEDULE scope ชุดเดียวกับหน้าจัดกะ
   - Reader ใช้ VIEW scope เพื่อให้ Manager เห็นเฉพาะพนักงานใน Scope

7. Attendance
   - Auto Schedule เปลี่ยนทันทีจาก Resolver โดยไม่ต้องสร้าง Shift Calendar ทุกวัน
   - หาก Assignment มีผล “วันนี้” จะ Refresh Attendance วันนี้แบบ Certification-aware
   - ถ้ากำหนดย้อนหลัง ระบบไม่ประมวลผลประวัติหลายวันอัตโนมัติ เพื่อไม่ให้ Bulk ช้า
     หากต้องการคำนวณย้อนหลัง ให้ใช้เมนู “ประมวลผล Attendance ใหม่”

ติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.14.16_BULK_TECH_PATTERN_DEFAULT_SHIFT.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.14.16_BULK_TECH_PATTERN_DEFAULT_SHIFT.sql
3. ผล Verify ควร PASS (OFF = CHECK เฉพาะกรณีที่ OFF ยังเปิดใช้งาน ซึ่งควรปิด)
4. Deploy Web V6.14.16
5. Ctrl + F5
6. ตรวจ Footer / About = V6.14.16
