Time-Clock Enterprise V6.14.26
Monthly Personal Day-off UI Consistency + Modal Accessibility

สิ่งที่ตรวจพบ
1. Backend V6.14.25 ใช้ Day-off Source of Truth ชุดเดียวแล้ว
   - Work Pattern: ta_resolve_employee_work_pattern_v651
   - Day-off Balance: ta_get_dayoff_balance_v61425
   - Schedule Grid: ta_get_schedule_range_light_v61425
   - V6.13.4 compatibility names delegate ไป V6.14.25
2. จุดที่ยังไม่ตรงอยู่ที่ Frontend ของ MONTHLY PERSONAL OVERVIEW
   - KPI "วันหยุด" นับเองจาก scheduleRows
   - Logic เดิมตัดวันหยุดนักขัตฤกษ์ออกด้วย !isPublicHoliday
   - จึงไม่ตรงกับ used_days ของ Day-off quota ซึ่งนับวันหยุดประจำสัปดาห์ + นักขัตฤกษ์
     และยกเว้นวันที่มี Explicit Working Shift / LV / LEAVE
3. Console aria-hidden warning เกิดจากปิด employeeMonthScheduleModal ขณะที่ Focus
   ยังอยู่บนปุ่ม Close ภายใน Modal
4. Monthly Personal dedicated RPC มี timeout ฝั่ง Browser 15 วินาที จึง fallback แล้วขึ้น Warning
   แม้ fallback จะยังโหลดหน้าจอได้
5. ข้อความ "A listener indicated an asynchronous response..." ที่ source TimeClock/:1
   มีลักษณะเป็น browser extension/content-script messaging; ไม่ควร suppress จาก App

สิ่งที่ปรับใน V6.14.26
1. MONTHLY PERSONAL OVERVIEW > KPI วันหยุด
   - ใช้ ta_get_dayoff_balance_v61425 โดยตรง
   - ตัวเลขหลัก = used_days
   - แสดง metadata: โควต้า / ยกมา / คงเหลือ
   - ถ้า RPC quota ใช้งานไม่ได้ชั่วคราว จะ fallback จาก Effective Schedule
     โดยรวม Weekly Off + Public Holiday และให้ Explicit Working Shift ชนะ Natural Day-off
2. Cache Monthly Personal เก็บ dayoffBalance ด้วย เพื่อไม่ให้ตัวเลขกระโดดเมื่อเปิดซ้ำ/เปลี่ยนเดือน
3. Dedicated Monthly Personal RPC timeout เพิ่ม 15 -> 30 วินาที
   - Timeout ที่ fallback สำเร็จเปลี่ยนเป็น console.info แทน console.warn
   - Error จริงที่ไม่ใช่ timeout ยังเก็บ Warning ไว้เพื่อไม่ซ่อนปัญหา Backend
4. แก้ Accessibility ของ employeeMonthScheduleModal
   - จำ element ที่เปิด Modal
   - ก่อน aria-hidden=true ย้าย Focus กลับไปยัง element เดิม
   - ใช้ inert ตอน Modal ปิด และถอด inert ก่อนเปิด

แนวทางเดียวกันที่ตรวจแล้ว
- Person 15D / Person Full Month / Team / Time -> ta_get_schedule_range_light_v61425
- Monthly Personal schedule -> dedicated V6.13.4 RPC ซึ่งอ่าน V6.13.4 Grid; V6.13.4 Grid delegate V6.14.25
- Assignment Popup -> ta_get_dayoff_balance_v61425
- Single / Bulk / Fill / Paste / Copy / Pattern -> V6.14.3 quota guards ซึ่ง inherit V6.14.25 balance/consumption logic
- LV/LEAVE ไม่หัก quota
- Explicit working shift บน Weekly Off / Public Holiday ไม่หัก quota
- Natural Weekly Off / Public Holiday ที่ไม่มี working override นับ quota

การติดตั้ง
- ถ้ารัน V6.14.25 DAYOFF_CALCULATION_CONSISTENCY และ Verify ผ่านแล้ว: ไม่ต้องรัน SQL Migration เพิ่ม
- Deploy Web V6.14.26 ชุดนี้
- Ctrl + F5
- แนะนำรัน SQL_สำหรับตรวจสอบ_V6.14.26_MONTHLY_DAYOFF_UI_CONSISTENCY.sql เพื่อยืนยัน Backend prerequisite

การตรวจ Console หลัง Deploy
1. เปิด MONTHLY PERSONAL OVERVIEW
2. ปิดด้วยปุ่ม X / ปุ่มปิด / คลิก backdrop / Esc
   - ต้องไม่ขึ้น "Blocked aria-hidden ... retained focus"
3. ตรวจ KPI วันหยุดเทียบกับ Popup จัดกะ > วันหยุดคงเหลือ
   - used_days ต้องเป็นเลขเดียวกันกับ KPI วันหยุด
4. ถ้ายังเห็น "A listener indicated an asynchronous response..."
   - ทดสอบ Incognito หรือปิด Extension ชั่วคราว
   - ถ้าหาย แสดงว่าไม่ใช่ App Time-Clock
