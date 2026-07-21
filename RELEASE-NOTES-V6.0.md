# Time-Clock Enterprise V5.3.1

ฐานการพัฒนา: **V5.2 Executive Dashboard**

## สิ่งที่คงไว้จาก V5.2
- Executive Dashboard
- Attendance Health Score
- Need Attention Matrix
- Schedule Readiness
- Executive Insights
- Workforce Distribution
- Enterprise Shell, Status Bar, Command Palette และ Notification Drawer
- System Settings และ Developer Console

## สิ่งที่เพิ่มในหน้าจัดกะ
- ลากเมาส์เลือกหลายช่อง
- Shift + Click เพื่อเลือกช่วง
- Ctrl/Cmd + C และ Ctrl/Cmd + V
- Undo / Redo สูงสุด 30 ขั้น
- ปุ่มลูกศรเลื่อนตำแหน่งเซลล์
- Delete / Backspace ล้างกะ
- คลิกขวาเปิดเมนูจัดกะ
- ปุ่มกะ D, N, OFF, HOL และ LV
- สรุปจำนวนแต่ละกะ
- ปุ่มเดือนก่อน เดือนปัจจุบัน และเดือนถัดไป
- ยืนยันเฉพาะช่องที่เลือก

## หมายเหตุ
การล้างกะส่ง `shift_code = null` ผ่าน RPC `ta_assign_shifts_bulk` หากฐานข้อมูลไม่รองรับค่า null จะต้องเปลี่ยนไปใช้ RPC ลบ Assignment โดยเฉพาะ
