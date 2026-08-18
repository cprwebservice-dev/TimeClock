Time-Clock Enterprise V6.11.50
Full Scope Paging + Manager Own Row First

แก้ตามเคสที่พบจากหน้าจอจริง

1) ตารางกะรายบุคคล • เต็มเดือน ค้นหาพนักงานไม่พบจนต้องกดโหลด
สาเหตุ:
- Supabase/PostgREST จำกัดผลลัพธ์ Set-returning RPC ได้ประมาณ 1,000 แถว
- ตัวอย่างเดือน ก.ค. 2569 มี 31 วัน
- 33 คน x 31 วัน = 1,023 วัน-พนักงาน
- หน้าจอเดิมแสดง 33 คน แต่ได้เพียง 1,000 วัน-พนักงาน จึงเป็นข้อมูลที่ถูกตัดปลาย
- นอกจากนี้ Person View ยังมีโอกาสรับค่า Team Focus ที่ซ่อนอยู่มาช่วยกรองโดยไม่ตั้งใจ

V6.11.50:
- ta_get_schedule_range_v61024 โหลดแบบ Pagination 1,000 แถว/หน้าอัตโนมัติ
- รวมผลทุกหน้าสูงสุด 50,000 แถว
- De-duplicate ด้วย emp_code + work_date
- Person View ไม่ใช้ hidden Team Focus เป็นตัวกรองอีก
- Search รหัสพนักงานเป็น Client-side บน Full Scope
- ถ้าค้นรหัสพนักงานแบบ exact แล้วยังไม่พบ ระบบ Auto Reload Full Scope ให้ 1 ครั้ง
- ไม่ต้องกด "โหลดตารางกะ" เพื่อให้ค้นเจอ

2) แถวของ Manager
- ถ้าผู้ใช้งานจริงเป็น MANAGER และมีรหัสพนักงานของตนเองอยู่ในตาราง
  แถวของ Manager จะถูกย้ายขึ้นแถวแรก
- ยังคง Badge "ตนเอง • ดูอย่างเดียว"
- พนักงานคนอื่นคงลำดับเดิม
- Manager ยังไม่สามารถจัดกะให้ตนเองตาม Logic เดิม

3) ส่วนอื่นคงเดิม
- Team View คงเดิม
- Monthly Personal Overview คง V6.11.49
- Time Certification / Attendance / System Period / Database คงเดิม

ไม่ต้องรัน SQL
