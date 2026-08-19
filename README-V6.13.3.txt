Time-Clock Enterprise V6.13.3
Schedule Accuracy + Day-off Quota Fix

ปรับปรุง:
1) ตารางกะรายบุคคลเต็มเดือน: Tooltip ใช้เวลา Effective/Assigned Shift ที่ถูกต้อง
   และรองรับ HOUR_BASED / SPLIT_WAIT_NIGHT / DYNAMIC_OFF
2) Monthly Personal Overview: ไม่แสดง ST5/ST6 เป็นรหัสกะอีกต่อไป
   Header แสดงกะตั้งต้นจาก Shift Code จริง เช่น STD / S043
3) Day-off Quota: ใช้ไปนับกะวันหยุดทุก Shift ที่ is_workday=false และ Paired OFF
   รวม OSTD / OS043 / OS134 / OS135 ไม่จำกัดเฉพาะ OFF/HOL
4) Assignment Popup: Loading/Toast/Confirm เรียง z-index ใหม่ ไม่ถูก Popup ซ้อนทับ

ติดตั้ง:
1. รัน SQL_ที่ต้องรัน_V6.13.3_SCHEDULE_ACCURACY_DAYOFF_QUOTA_FIX.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.13.3_SCHEDULE_ACCURACY_DAYOFF_QUOTA_FIX.sql
3. Deploy ไฟล์เว็บชุด V6.13.3
4. Ctrl + F5
