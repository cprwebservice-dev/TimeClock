Time-Clock Enterprise V6.12.1 — Schedule Load Performance Fix
Date: 18 Aug 2026

ปรับจาก V6.12.0 โดยคง Business Rules / Scheduling Rules เดิม

สิ่งที่ปรับ
1. PERSON monthly calendar
   - batch จาก 20 เป็น 30 คน (30 x 31 <= 930 rows)
   - โหลดพร้อมกันสูงสุด 4 batches
2. Work Plan metadata
   - batch จาก 20 เป็น 30 คน
   - โหลดพร้อมกันสูงสุด 4 batches
3. TEAM calendar
   - ใช้ employee list จาก Scope/filter options เมื่อมี
   - batch ตามจำนวนวันที่แสดง โดยคุม <= 930 employee-day rows/request
   - โหลดพร้อมกันสูงสุด 4 batches
   - fallback ไปวิธีเดิมอัตโนมัติถ้า filter options ไม่มี employee list
4. Schedule enrichment
   - Work Plan + V6.12 Scheduling Rules + manager resolver ที่เป็นอิสระ โหลดพร้อมกัน
   - PERSON view ไม่รอ Team Manager metadata ซึ่งไม่ได้ใช้ในหน้ารายบุคคล
5. ไม่เปลี่ยน SQL Schema / RPC ของ V6.12.0
   - หากรัน SQL V6.12.0 แล้ว ไม่ต้องรัน SQL เพิ่มสำหรับ V6.12.1

ผลที่คาดหวัง
- ลดจำนวนรอบ network แบบ serial อย่างมาก โดยเฉพาะ Scope ที่มีพนักงานจำนวนมาก
- Calendar แสดงผลเร็วขึ้นโดย Business Rule เดิมไม่เปลี่ยน
