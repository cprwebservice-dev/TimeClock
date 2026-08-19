Time-Clock Enterprise V6.12.6 — Console / RPC Stability Fix

แก้ไขหลัก
- แก้ ReferenceError: ow is not defined ในปฏิทินรายบุคคล
- เพิ่ม Work Plan RPC V6.12.6 แยกจาก legacy V6.11.8/V6.11.10
- บันทึกกะใช้ ta_assign_shift_with_work_plan_v6126
- Work Plan metadata fail-soft สำหรับการแสดงปฏิทิน แต่การบันทึกยังแจ้ง error จริง
- ลด 400 ซ้ำจาก ta_get_org_unit_detail_v690; Manager/Viewer ไม่เรียก RPC HR Admin
- System Period ใช้ ta_get_system_period_for_date_v6126 และ dedupe request รายเดือน
- เพิ่ม favicon.svg แก้ favicon.ico 404

ลำดับติดตั้ง
1) รัน SQL_ที่ต้องรัน_V6.12.6_CONSOLE_RPC_FIX.sql
2) รัน SQL_สำหรับตรวจสอบ_V6.12.6_CONSOLE_RPC_FIX.sql
3) Deploy ไฟล์เว็บทั้งหมด
4) Ctrl+F5
