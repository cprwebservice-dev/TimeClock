Time-Clock Enterprise V6.11.18
Schedule UX + Team Daily Assignment

สิ่งที่ปรับใน Frontend:
1) ปฏิทินจัดกะ: ย้าย “สัปดาห์ที่แสดง” มาอยู่ในกลุ่มควบคุมสัปดาห์ใกล้ปุ่ม สัปดาห์ก่อน
2) ปรับ Toolbar / ตัวกรอง / Navigation สัปดาห์ / ปุ่มโหลด ให้กระชับและอ่านง่ายขึ้น
3) Team Daily Detail: เพิ่มปุ่ม “จัดกะ” ที่รายชื่อพนักงานแต่ละคน
4) เมื่อบันทึกกะจาก Team Daily Detail ระบบใช้ RPC เดิมที่บันทึกกะ + Recalculate Attendance ใน transaction เดียว
5) หลังบันทึก ระบบโหลดปฏิทินและ Team Daily Detail ใหม่ เพื่อแสดงผลเวลาเข้า-ออกหลังประมวลผลล่าสุด

การติดตั้ง:
- ถ้ารัน V6.11.17 FIX1 สำเร็จและ Verify PASS แล้ว: Deploy ไฟล์ Frontend ชุดนี้ได้เลย ไม่ต้องรัน SQL เพิ่ม
- ถ้ายังไม่ได้รัน V6.11.17 FIX1: ใช้ SQL FIX1 ที่แนบใน ZIP ก่อน แล้ว Verify ให้ PASS
- หลัง Deploy กด Ctrl+Shift+R
