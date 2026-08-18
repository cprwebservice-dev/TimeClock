Time-Clock Enterprise V6.12.2 - Work Mode Scope Selection Fix

ปรับจาก V6.12.1 โดยคง Business Rule และ Performance เดิม

แก้ไข:
- แก้ Event bug เมื่อเปลี่ยนขอบเขตหน่วยงานเป็น “เฉพาะหน่วยงานที่เลือก” แล้วรายการหน่วยงานไม่แสดง
- renderDeptScope รับเฉพาะ Array สำหรับ selected values ป้องกัน DOM Event ทำให้ JavaScript หยุด
- โหลดรายการหน่วยงานได้จากหน้าตั้งค่าเอง ไม่ต้องเปิดหน้าปฏิทินจัดกะก่อน
- ใช้ ta_get_filter_options_v61022 และ fallback ta_get_schedule_filter_options_v61026 เมื่อ cache รายการหน่วยงานยังว่าง
- แสดงจำนวนหน่วยงานในรายการเลือก

ไม่ต้องรัน SQL เพิ่ม หากรัน SQL V6.12.0 Scheduling Rules แล้ว
