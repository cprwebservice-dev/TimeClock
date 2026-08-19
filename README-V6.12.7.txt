Time-Clock Enterprise V6.12.7 — Monthly Personal Overview Timeout Fix

ฐาน: V6.12.6 Console / RPC Stability Fix

แก้ไข:
1. Monthly Personal Overview ไม่ยิง Attendance Detail เต็มเดือนใน RPC เดียวอีกต่อไป
2. แบ่งช่วงเริ่มต้น 14 วัน และ Adaptive Split อัตโนมัติเมื่อพบ statement timeout: 14 -> 7 -> 4 -> 2 -> 1 วัน
3. Schedule ของปฏิทินรายบุคคลแบ่งเป็นช่วง 14 วันเช่นกัน และ Adaptive Split เมื่อ Query ช้า
4. Attendance/Punch/Certification เป็นข้อมูลเสริมแบบ fail-soft: ถ้าเฉพาะข้อมูลเวลาโหลดไม่ได้ จะไม่ทำให้ Calendar ทั้งหน้าว่าง
5. Schedule ยังเป็นข้อมูลโครงสร้างหลัก ถ้าหลัง Adaptive Split แล้วยังล้ม ระบบจะแสดง Error จริง
6. Cache รายเดือนและ Refresh/Recalculate เดิมยังคงทำงาน

การติดตั้ง:
- ไม่ต้องรัน SQL เพิ่มจาก V6.12.6
- Deploy ไฟล์ V6.12.7 ทั้งชุด
- Ctrl + Shift + R หรือ Ctrl + F5
- ตรวจ Footer/Build = V6.12.7
- เปิดปฏิทินจัดกะ > กดไอคอนปฏิทินรายบุคคล > Monthly Personal Overview

หมายเหตุ:
- V6.12.7 เป็น Frontend performance/resilience patch
- SQL V6.12.6 ใน package ยังคงอยู่เพื่อเป็นฐานสำหรับเครื่องที่ยังไม่ได้ติดตั้ง V6.12.6
