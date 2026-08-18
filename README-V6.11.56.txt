Time-Clock Enterprise V6.11.56
OFF Certification Guard

แก้จากภาพ MONTHLY PERSONAL OVERVIEW:
- วันแสดงกะ OFF แต่ยังเห็น Icon รับรองเวลา

สาเหตุ:
- V6.11.55 helper ตรวจ effective_shift_code ก่อน assigned_shift_code
- บาง row มี assigned_shift_code = OFF แต่ยังมี effective/default shift/time เดิม
- จึงถูกตีความผิดว่าเป็น working-shift override และแสดงปุ่มรับรอง

V6.11.56:
1) assigned_shift_code มี Priority สูงสุด
2) ถ้า assigned/displayed shift = OFF -> ไม่แสดงปุ่มรับรอง
3) ถ้า HOL -> ไม่แสดงปุ่มรับรอง
4) ถ้า LV/วันลา -> ไม่แสดงปุ่มรับรอง
5) เฉพาะกรณี Natural OFF / Public Holiday ที่ถูกจัดเป็นกะทำงานจริง
   เช่น D5/D6/N5/N6 จึงถือเป็นวันทำงานและรับรองได้
6) Backend V6.11.55 มี guard OFF/HOL อยู่แล้ว จึงไม่ต้องแก้ SQL เพิ่ม
7) ส่วนอื่นคงเดิม

ไม่ต้องรัน SQL
