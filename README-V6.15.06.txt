TimeClock Enterprise V6.15.06
Employee Portal — Future-only Day-off Request / Same-month Guard

Employee Portal
- สลับวันหยุด:
  * วันหยุดเดิมต้อง > วันปัจจุบัน
  * วันที่หยุดแทนต้อง > วันปัจจุบัน
  * ทั้งสองวันต้องอยู่เดือนเดียวกัน
- ขอหยุดเพิ่ม:
  * วันที่ขอหยุดต้อง > วันปัจจุบัน
  * ใช้โควต้าของเดือนวันที่เลือกเท่านั้น
- วันนี้และวันที่ย้อนหลังจะแสดงเป็น disabled / Manager.
- เมื่อเลือกวันหยุดเดิมแล้ว ปุ่มเปลี่ยนเดือนถูกล็อกจนกว่าจะเลือกวันหยุดแทน
  หรือยกเลิกวันหยุดเดิม เพื่อป้องกันการสลับข้ามเดือน.
- Past-month navigation is disabled in Employee Portal.
- Historical changes are directed to Manager.

Backend
- Trigger validates Employee Portal requests independently from UI.
- Trigger fires only when request date/type/subtype/detail/source changes.
- Manager status-only updates remain unaffected.
- Manager direct scheduling remains unchanged and can handle historical cases.
