Time-Clock Enterprise V6.14.18
Config-Driven Technician Work Pattern + System Period Guard

ปรับจาก V6.14.17
1. ยกเลิก Position Policy ที่บังคับตำแหน่งผู้จัดการแผนกเป็น TECH_5D
2. ทุกตำแหน่งใช้ค่าที่ User กำหนดจากหน้ารูปแบบการทำงานช่างเทคนิคเหมือนกัน
3. วันหยุดประจำสัปดาห์อ่านจาก ta_work_patterns.weekly_off_dows ของรูปแบบที่เลือก
4. กะตั้งต้นเช้า/ดึกยังสัมพันธ์กับ 5D/6D:
   TECH_5D DAY=STD, NIGHT=S134
   TECH_6D DAY=S043, NIGHT=S135
5. Manual Schedule ยังมีลำดับความสำคัญสูงกว่า Auto Schedule
6. Guard วันเริ่มใช้ตาม System Period จาก V6.14.17 ยังคงเดิม
7. Compatibility RPC V6.14.17 ถูก neutralize ให้เรียก Logic V6.14.18 เพื่อไม่ให้จุดเก่าบังคับตำแหน่ง

ติดตั้ง
1. รัน SQL_ที่ต้องรัน_V6.14.18_CONFIG_DRIVEN_WORK_PATTERN.sql
2. รัน SQL_สำหรับตรวจสอบ_V6.14.18_CONFIG_DRIVEN_WORK_PATTERN.sql
3. Deploy Web V6.14.18
4. Ctrl + F5
