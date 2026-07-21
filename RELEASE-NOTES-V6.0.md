# Time-Clock Enterprise V6.0 – Functional Complete

ฐานพัฒนา: V5.6.3 Advance Schedule

## 1. Schedule Workflow
- จัดกะล่วงหน้าและจัดกะวันหยุดได้เหมือน V5.6.3
- Fill Down และ Fill Right
- รูปแบบกะ 7 วัน
- คัดลอกกะจากสัปดาห์ก่อน
- ยืนยันกะที่จัดไว้ทั้งหมด
- สถานะตารางรายเดือน: DRAFT, PUBLISHED และ LOCKED
- ไม่อนุญาตให้ประกาศ/ล็อก หากยังมีกะที่จัดไว้แต่ยังไม่ยืนยัน
- เมื่อเดือนถูกล็อก ป้องกันการแก้ไขทั้งหน้าเว็บและฐานข้อมูล
- ประวัติการจัดกะ พร้อมผู้ดำเนินการ วันเวลา เหตุผล และค่าเดิม/ค่าใหม่
- Export Excel และ Print/Save as PDF

## 2. Attendance Detail
- ค้นหาและกรองผลในตารางที่โหลดแล้ว
- เรียงข้อมูล และแบ่งหน้า
- KPI จำนวนรายการ ครบเวลา เวลาไม่ครบ และมาสาย
- Drawer รายละเอียดรายวัน
- แสดงเวลาเริ่มกะและเวลาสิ้นสุดกะก่อนช่องกะ
- Export Excel และ Print/Save as PDF

## 3. Review Center
- ปิดรายการและละเว้นรายการที่ตรวจสอบแล้ว
- บันทึกหมายเหตุ ผู้ดำเนินการ และวันเวลา
- รายการที่ปิด/ละเว้นจะไม่แสดงในคิวหลัก
- ตรวจสิทธิ์ตาม Role และ Scope
- Export Excel และ Print/Save as PDF

## 4. Report Center
- รายละเอียดเวลาทำงาน
- ตารางจัดกะรายเดือน
- รายการรอตรวจสอบ
- สรุป Dashboard
- รายงานมาสายและกลับก่อน
- ส่งออก CSV, Excel และ Print/Save as PDF
- ประวัติการสร้างรายงานใน Browser
- บันทึก Export Log ใน Supabase

## 5. HR Admin
- Employee Directory ค้นหาด้วยรหัส ชื่อ ตำแหน่ง หน่วยงาน พื้นที่ และสถานะ
- Export รายชื่อพนักงานเป็น Excel
- Audit Center รวมประวัติการจัดกะ สถานะตารางรายเดือน และ Review Resolution

## 6. Notification และ Smart Assistant
- Notification Feed จากรายการ Review และสถานะตารางกะจริง
- ผู้ช่วยวิเคราะห์แบบ Rule-based ภายใน Browser
- รองรับคำถาม Missing IN, Missing OUT, ไม่มีเวลา, มาสาย, การยืนยันกะ และรายการ Review
- ไม่มีการส่งข้อมูลไปบริการ AI ภายนอก

## ข้อสังเกต
- ปุ่ม PDF ใช้หน้าต่าง Print ของ Browser แล้วเลือก Save as PDF
- Report Job รุ่นนี้สร้างไฟล์ใน Browser และบันทึก Log ใน Supabase ยังไม่ใช่ Server Worker
- ต้องรัน SQL V6.0 ก่อนใช้งาน Schedule Publish/Lock, Review Resolution, Employee Directory, Audit และ Notification Feed
