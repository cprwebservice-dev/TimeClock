Time-Clock Enterprise V6.11.44
Time Certification — System Period + Re-certification after Shift Change

ปรับ:
1. ปุ่มรับรองเวลาใน TEAM DAILY DETAIL และ MONTHLY PERSONAL OVERVIEW
   สอดคล้องกับรอบ "รับรองเวลา" ในการจัดการรอบ
   - Manager รอบเปิด: รับรองได้
   - Manager ใกล้ Deadline: แสดงสถานะใกล้ครบกำหนด
   - Manager รอบปิด: ปุ่มเปลี่ยนเป็น "🔒 ปิดรอบรับรอง" และกดไม่ได้
   - HR Admin: Override ได้ตาม Backend เดิม

2. รับรองแล้ว แต่ภายหลังเปลี่ยนกะ
   - ถ้ากะจริงเปลี่ยนจาก snapshot ตอนรับรอง: CERTIFIED -> STALE
   - UI แสดง "! ต้องรับรองใหม่"
   - ปุ่มเปลี่ยนเป็น "↻ รับรองใหม่"
   - Attendance จะไม่ใช้เวลารับรองเดิมอีก
   - Modal แสดงกะ/เวลารับรองเดิมเพื่ออ้างอิง
   - เมื่อบันทึกรับรองใหม่ จะใช้กะปัจจุบันเป็น snapshot ใหม่

3. การแก้ข้อมูลอื่นของกะโดยไม่เปลี่ยน shift code/time
   จะไม่ทำให้ Certification STALE โดยไม่จำเป็น

4. Audit เก็บเหตุการณ์ STALE_SHIFT_CHANGED / STALE_SHIFT_MISMATCH

ส่วนอื่นคงเดิม

ติดตั้ง:
1) รัน SQL ที่ต้องรัน V6.11.44
2) รัน SQL สำหรับตรวจสอบ ควร PASS 10 รายการ
3) Deploy ZIP
4) Ctrl + Shift + R
