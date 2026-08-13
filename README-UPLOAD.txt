Time-Clock Enterprise V6.11.13 Compact Deploy

ไฟล์สำหรับอัปโหลด GitHub Pages
- index.html
- app.js
- app.css
- 404.html
- .nojekyll

ลำดับติดตั้งฐานข้อมูล
1) ติดตั้ง V6.2.4 ให้ข้อมูล CSV และ Attendance แสดงผลได้
2) ติดตั้ง V6.3.1 Technician Calculation Engine
3) ติดตั้ง V6.4.0 Calculation UI API
4) ติดตั้ง V6.5.0 Leave, Certificate & Manual Time Correction
5) ติดตั้ง V6.11.13 Shift Settings by Work Pattern
6) รัน V6.11.13_VERIFY.sql
7) อัปโหลดไฟล์ใน ZIP นี้แทนชุดเดิม แล้วกด Ctrl+F5

ฟังก์ชันหน้าเว็บ V6.11.13
- หน้า ตั้งค่ากะ แยกกะสำหรับรูปแบบทำงาน 5 วันและ 6 วันต่อสัปดาห์
- กะ 6 วันมาตรฐาน 08:30–17:30 รวมพัก 9 ชั่วโมง สุทธิ 8 ชั่วโมง
- กะ 5 วันมาตรฐาน 08:30–18:00 รวมพัก 9.5 ชั่วโมง สุทธิ 8.5 ชั่วโมง
- กะหนึ่งรายการใช้กับกลุ่ม 5 วัน, 6 วัน หรือทั้งสองกลุ่มได้
- กำหนดกะตั้งต้นแยกตามรูปแบบการทำงาน
- ระบบตรวจชั่วโมงรวมพัก ชั่วโมงสุทธิ และเวลาพักก่อนบันทึกกะตั้งต้น
- ปฏิทินจัดกะเลือกเฉพาะกะที่รองรับรูปแบบของพนักงาน
- ป้องกันการบันทึกกะข้ามกลุ่มรูปแบบการทำงาน
- มีคำสั่งคำนวณผลย้อนหลังเมื่อเปลี่ยนกะตั้งต้น
- คง Dashboard, Attendance, Work Pattern, Leave, Time Correction และ Exception Center เดิม

Design by แผนกบริหารระบบข้อมูลบุคคล ซีพี รีเทลลิงค์


V6.11.13 Statement Timeout Fix
- รัน V6.11.13_SHIFT_RECALC_JOB_TIMEOUT_FIX.sql หลัง V6.5.3
- ปุ่มคำนวณย้อนหลังแบ่งการทำงานเป็น Job ย่อย
- แต่ละ API Request คำนวณเฉพาะหนึ่งวันและพนักงานหนึ่งชุด
- ระบบลด Batch Size อัตโนมัติหากชุดปัจจุบันยังหนักเกินไป
- กดปุ่มเดิมเพื่อ Resume Job ช่วงวันและรูปแบบเดิมได้


V6.11.13 Employee Pattern UX
- ช่อง Template เริ่มต้นแสดง 3 รูปแบบเท่านั้น:
  1) กะปกติ
  2) กะปกติ + งานลูกค้าช่วงดึก
  3) ออกกะแรกก่อนเวลา + งานลูกค้า
- กะปกติเลือกเวลาให้อัตโนมัติตาม TECH_5D / TECH_6D
- ตัด Override วันหยุดตั้งต้นรายบุคคลทั้งหน้าเว็บและฐานข้อมูล
- ตารางรูปแบบรายบุคคลเพิ่มตำแหน่งต่อจากหน่วยงาน
- ตัดคอลัมน์ PC ออกจากตาราง


V6.11.13 Template & Parameter Security
- หน้า Template แสดง 3 รูปแบบเท่านั้น
- กะปกติรวมการแสดง 5 วันและ 6 วันไว้ในการ์ดเดียว
- ชื่อรูปแบบงานลูกค้าปรับให้ตรงกับตัวเลือกรายบุคคล
- พารามิเตอร์รูปแบบการทำงานแสดงเฉพาะ HR Admin
- เพิ่ม Backend Trigger ป้องกันผู้ใช้สิทธิ์อื่นแก้ไข ta_work_patterns


V6.11.13 HR Admin Parameter Visibility
- ซ่อนการ์ดพารามิเตอร์รูปแบบการทำงานทั้งส่วนเป็นค่าเริ่มต้น
- ตรวจสิทธิ์จาก RPC ฝั่งฐานข้อมูลก่อนแสดง
- แสดงเฉพาะ Profile ที่ Active และ role = HR_ADMIN
- สิทธิ์อื่นไม่เห็นหัวข้อ ตาราง ปุ่มเพิ่ม และปุ่มแก้ไข
- ไม่ใช้ค่า Role ฝั่ง Browser เป็นตัวตัดสินหลัก
- Template และการกำหนดรูปแบบรายบุคคลยังคงใช้งานตามสิทธิ์เดิม


V6.11.13 Effective Role Visibility Fix
- แก้กรณี HR Admin เปิด Developer Mode แล้ว View as Role = USER
- Badge USER จะซ่อนพารามิเตอร์รูปแบบการทำงานทันที
- ต้องผ่านทั้ง Backend HR_ADMIN และ Effective UI Role = HR_ADMIN
- Role USER / VIEWER ไม่เห็นหัวข้อ ตาราง ปุ่มเพิ่ม และปุ่มแก้ไข
- เปลี่ยน View as Role แล้วไม่ต้อง Reload หน้า


V6.11.13 Fortnight Schedule View
- Popup กำหนดกะ แสดงกะปกติเพียงตัวเดียวตามรูปแบบพนักงาน
- TECH_5D แสดงกะปกติ 5 วัน/สัปดาห์ 9.5 ชั่วโมงรวมพัก
- TECH_6D แสดงกะปกติ 6 วัน/สัปดาห์ 9 ชั่วโมงรวมพัก
- ยังคงตัวเลือกกะปกติ + งานลูกค้าช่วงดึก
- ยังคงตัวเลือกออกกะแรกก่อนเวลา + งานลูกค้า
- ปฏิทินแสดงเป็นช่วง 1–14, 15–28 และวันที่คงเหลือปลายเดือน
- ปุ่มช่วงก่อน/ช่วงถัดไปเปลี่ยนช่วงโดยไม่แสดงทั้งเดือน
- การประกาศและล็อกกะยังคงอ้างอิงสถานะรายเดือนเดิม


V6.11.13 Pattern-Aware Shift Assignment
- เพิ่มตัวกรองรูปแบบการทำงาน: ทั้งหมด, 5 วัน, 6 วัน, ยังไม่ได้กำหนด
- แสดง Badge 5D / 6D / ? ในแต่ละแถวพนักงาน
- แสดงจำนวนพนักงานแต่ละกลุ่มและกด Chip เพื่อกรองได้
- ปุ่มกะปกติ Mapping ไปยังกะตั้งต้นของ TECH_5D / TECH_6D อัตโนมัติ
- ปุ่มกะกลางคืนเลือกกะกลางคืนที่รองรับรูปแบบของแต่ละคน
- เมื่อเลือกหลายกลุ่ม ระบบแสดงสรุปจำนวนและรหัสกะก่อนบันทึก
- พนักงานที่ยังไม่ได้กำหนด Work Pattern จะถูกข้ามและแจ้งเหตุผล
- Paste / Fill / Copy ตรวจความเข้ากันได้ของกะกับ Work Pattern ก่อนบันทึก
- OFF / HOL / LV ยังคงกำหนดข้ามกลุ่มได้


V6.11.13 Schedule Name & Visual Fix
- รวมชื่อพนักงานจากทุกวันที่โหลดในเดือนก่อนสร้างแถว
- เติมชื่อจากทะเบียนพนักงาน, Work Pattern Assignment และ Attendance เมื่อ RPC ส่งชื่อว่าง
- ไม่ปล่อยช่องชื่อว่าง หากยังหาไม่พบจะแสดง “ไม่พบชื่อพนักงาน” เพื่อให้ตรวจสอบได้
- D5, D6 และกะกลางวันอื่นใช้สีฟ้ากลุ่มเดียวกัน
- กะกลางคืนใช้ม่วง, OFF ใช้เทา, HOL ใช้ส้ม, LV ใช้เขียว
- แถบรหัสกะเต็มความกว้างช่อง ขอบโค้งมน และลดเอฟเฟกต์ขยายเพื่อลดความลายตา
- คงสถานะยืนยัน, Review, OT, Waiting และวันหยุดชดเชยเดิม


V6.11.13 Schedule Helper Scope Fix
- แก้ mergeScheduleEmployeeMeta is not defined
- แก้ meaningfulScheduleName ซึ่งอยู่คนละ Scope เช่นเดียวกัน
- Export Helper ผ่าน window.TimeClockShiftAPI
- renderSchedule ใช้ Wrapper ที่ตรวจสอบ Function ก่อนเรียก
- หาก Browser โหลดไฟล์ Cache ปะปน ระบบยังโหลดตารางต่อได้โดยไม่ล้ม
- ไม่ต้องรัน SQL เพิ่ม


V6.11.13 Weekly Schedule & Shift Time
- ปฏิทินจัดกะแสดงครั้งละ 1 สัปดาห์ภายในเดือน
- แบ่งเป็น 1–7, 8–14, 15–21, 22–28 และ 29–สิ้นเดือน
- ปุ่มสัปดาห์ก่อน / สัปดาห์ปัจจุบัน / สัปดาห์ถัดไป
- รักษาสถานะประกาศและล็อกตารางกะแบบรายเดือนเดิม
- Label กะแสดงรหัสกะบรรทัดแรก
- แสดงเวลาเข้า–ออกบรรทัดที่สอง เช่น D6 / 08:30–17:30
- OFF, HOL และ LV ไม่แสดงเวลา
- Tooltip เพิ่มเวลากะ
- ไม่ต้องรัน SQL เพิ่ม


V6.11.13 Absence & Attendance Columns
- รูดบัตรไม่ครบขา = ขาดงานเต็มกะรวมพัก
- ไม่มีเข้า, ไม่มีออก หรือไม่มีทั้งสองขา ใช้หลักเดียวกัน
- ตัวอย่าง 08:30–18:00 = ขาดงาน 570 นาที
- สถานะย้ายมาต่อจากเวลาออก
- สถานะแสดง ขาดงาน / ลา / วันหยุด / ปกติ
- OT ไม่เปลี่ยนสถานะเป็น “มี OT”
- OT, รอคอย, พัก, มาสาย, กลับก่อน, ขาดงาน และวันหยุดชดเชยคงเหลือ ซ่อนเป็นค่าเริ่มต้น
- Checkbox เหนือตารางควบคุมทั้งหน้าเว็บและ Export Excel/Print/CSV
- ต้องรัน V6.11.13_ABSENCE_CALCULATION.sql ก่อนอัปโหลดหน้าเว็บ


V6.11.13 Attendance Columns & Template Code
- เพิ่ม Checkbox ซ่อน/แสดง พื้นที่, พื้นที่ย่อย และ Template
- ทั้ง 3 คอลัมน์ซ่อนเป็นค่าเริ่มต้น
- การเลือกคอลัมน์มีผลกับหน้าเว็บและ Export Excel/Print/CSV
- สถานะ ลา ใช้สีม่วง แตกต่างจากสถานะ ปกติ
- เปลี่ยนรหัส Template กะ 6 วันจาก SINGLE_0830 เป็น SINGLE_0830_1730
- SQL ย้ายข้อมูลเดิมและเพิ่ม Trigger รองรับฟังก์ชันรุ่นเก่า
- ต้องรัน V6.11.13_TEMPLATE_CODE_AND_ATTENDANCE_COLUMNS.sql ก่อนอัปโหลดหน้าเว็บ


V6.11.13 Attendance Detail Workspace
- Attendance Detail แสดงข้อมูลพื้นฐานทันที ไม่รอ Calculation RPC ก่อน
- จัดข้อมูลเป็น Summary, ข้อมูลพนักงาน, แผนกะ, ผลคำนวณ, Segment, ลา, แก้ไขเวลา และใบรับรอง
- เพิ่มปุ่มรายการก่อนหน้า/ถัดไปใน Drawer
- ปุ่ม “แก้ไขกะวันนี้” เปิด Popup จัดกะโดยตรง ไม่โหลดปฏิทินทั้งเดือน
- หลังบันทึกหรือลบกะ ระบบคำนวณวันนั้นใหม่ กลับ Tab รายละเอียดเวลาทำงาน และเปิด Attendance Detail รายการเดิม
- เพิ่มปุ่ม “เปิดปฏิทินสัปดาห์” เป็นทางเลือกรอง
- การเปิดปฏิทินจาก Attendance Detail กรองรหัสพนักงานตั้งแต่ Backend เพื่อลดข้อมูลที่โหลด
- ไม่ต้องรัน SQL เพิ่ม


V6.11.13 Employee Multi-Select Filter
- เพิ่ม Dropdown ชื่อพนักงานใน Tab รายละเอียดเวลาทำงาน
- รายการแสดงรหัสพนักงาน ชื่อ-นามสกุล หน่วยงาน พื้นที่ และพื้นที่ย่อย
- รายชื่อเปลี่ยนตามวันที่ พื้นที่ พื้นที่ย่อย และหน่วยงาน
- ค้นหาได้จากรหัสพนักงานและชื่อ-นามสกุล
- แสดงครั้งละ 50 รายชื่อ พร้อมหน้าก่อน/หน้าถัดไป
- เลือกหน้ารายชื่อได้
- เลือกทั้งหมดที่ตรงกับคำค้นหาได้
- เลือกพนักงานได้หลายคน
- รีเซ็ตเป็นพนักงานทั้งหมดได้
- ส่งรหัสที่เลือกไปกรองตั้งแต่ Attendance RPC
- ต้องรัน V6.11.13_ATTENDANCE_EMPLOYEE_FILTER.sql ก่อนอัปโหลดหน้าเว็บ


V6.11.13 Attendance Filter Layout Refinement
- ปรับช่องตัวกรองด้านบนให้ความสูงและสัดส่วนสมดุล
- วันที่ พื้นที่ พื้นที่ย่อย หน่วยงาน ชื่อพนักงาน และสถานะจัดแนวเดียวกัน
- จัดปุ่มค้นหาและ Export แยกเป็นแถวที่อ่านง่าย
- ปรับส่วนค้นหารหัสพนักงาน จำนวนต่อหน้า และปุ่มคำสั่งเป็น Grid
- ปรับ KPI ให้ขนาดและระยะห่างเท่ากัน
- ตัดแถบแจ้งเตือนสีเหลืองค้นหาจากฐานข้อมูลโดยตรงออกจากต้นทาง
- เปลี่ยนข้อความปุ่มเป็น “ค้นหาข้อมูล”
- รองรับ Desktop, Tablet และ Mobile
- ส่วนอื่นคงเดิม
- ไม่ต้องรัน SQL เพิ่ม


V6.11.13 Employee Dropdown Readability
- เพิ่มขนาดตัวอักษรรายชื่อพนักงานใน Dropdown
- แสดงรหัสพนักงานและชื่อ-นามสกุลในบรรทัดเดียว
- รูปแบบตัวอย่าง 7512172 • ชื่อ นามสกุล
- หน่วยงาน พื้นที่ และพื้นที่ย่อยคงไว้บรรทัดรอง
- เมื่อเลือกพนักงานคนเดียว ช่องด้านบนแสดงรหัสและชื่อแทนข้อความจำนวนคน
- ส่วนอื่นคงเดิม
- ไม่ต้องรัน SQL เพิ่ม


V6.11.13 Simplified Attendance Filters
- พื้นที่ พื้นที่ย่อย และหน่วยงานเป็น Dropdown ที่พิมพ์ค้นหาได้
- รายการพื้นที่ย่อยและหน่วยงานยังคงสัมพันธ์กับตัวกรองก่อนหน้า
- ปรับข้อความช่องชื่อพนักงานให้มีขนาดเท่ากับตัวกรองช่องอื่น
- ตัดช่องค้นหารหัสพนักงาน / กรองผลลัพธ์ออก
- ตัดปุ่มค้นหาข้อมูลและประมวลผลใหม่ออก
- ตัดปุ่ม Export CSV ออก
- ย้ายปุ่ม Excel และ Print/PDF มาไว้ต่อจากปุ่มค้นหาด้านบน
- ย้ายจำนวนต่อหน้าไปไว้ในส่วนสรุปผล
- คง KPI รายละเอียดเวลาทำงานและการทำงานส่วนอื่นทั้งหมด
- ไม่ต้องรัน SQL เพิ่ม


V6.11.13 Employee Filter Variable Fix
- แก้ exactEmpCode is not defined เมื่อกดค้นหา
- ใช้รหัสจากตัวกรองชื่อพนักงานแบบหลายรายการแทน
- รองรับเลือกพนักงาน 1 คน หลายคน และพนักงานทั้งหมด
- Event attendance-loaded ส่งทั้ง empCode และ empCodes
- ส่วนอื่นคงเดิม
- ไม่ต้องรัน SQL เพิ่ม


V6.11.13 Role & Manager Hierarchy
- Role เหลือ 3 กลุ่ม: HR_ADMIN, MANAGER, VIEWER
- USER เดิมถูกแปลงเป็น MANAGER
- Viewer เห็นเฉพาะข้อมูลของตนเองตาม ta_user_profiles.emp_code
- Viewer ไม่มีเมนูลา แก้ไขเวลา ใบรับรอง จัดกะ หรือรับรองเวลา
- Viewer ส่งคำขอแก้ไขกะของตนเองได้
- Manager ดูและจัดกะพนักงานตามสายบังคับบัญชา
- Manager รับรองเวลาทำงานแทนพนักงานได้
- Manager ไม่สามารถรับรองเวลาของตนเอง
- Manager Scope แยกจาก Employee Template และกำหนดได้หลายรายการต่อ Email
- ขอบเขตอ้างอิง manager_department, manager_division, manager_gm, manager_avp
- เพิ่มหน้า “คำขอแก้ไขกะ”
- HR Admin จัดการ Role, รหัสพนักงาน และ Manager Scope ตาม Email
- Employee Template เพิ่ม manager_gm และ manager_avp
- ต้องรัน V6.11.13_ROLE_MANAGER_HIERARCHY.sql ก่อนอัปโหลดหน้าเว็บ


V6.11.13 Manager Scope by Email
- Role มี 3 กลุ่ม: HR_ADMIN, MANAGER, VIEWER
- Manager Scope แยกจาก Employee Template โดยสมบูรณ์
- ใช้ Email เป็นตัวเชื่อม User กับ Scope
- รองรับหลาย Scope ต่อ Manager
- Scope: ALL, DEPARTMENT, ZONE, AREA, SUB_AREA, EMPLOYEE
- กำหนดสิทธิ์ราย Scope: ดูข้อมูล, บันทึกกะ, ยืนยันกะ, รับรองเวลา, พิจารณาคำขอแก้ไขกะ
- Upload Manager Scope CSV จากหน้า User และสิทธิ์
- รองรับ Upsert หรือแทนที่ Scope เดิมของ Email ในไฟล์
- Viewer ตรวจเฉพาะข้อมูลตนเองและส่งคำขอแก้ไขกะ
- Manager ตรวจข้อมูลทีม จัดกะ รับรองเวลา และพิจารณาคำขอตาม Scope
- หน้า Leave, Time Correction และ Certificate เป็น HR Admin เท่านั้น


V6.11.13 Organization Structure & Manager Assignment
- เพิ่มเมนูผังโครงสร้างองค์กรสำหรับ HR Admin
- Tree แบบหลายระดับ พร้อมค้นหา ขยายทั้งหมด และยุบทั้งหมด
- เพิ่ม แก้ไข ย้ายหน่วยงานด้วยการเปลี่ยนหน่วยงานแม่ และปิดใช้งาน
- แสดง Breadcrumb, พนักงาน, หน่วยงานลูก และ Manager ของแต่ละโหนด
- กำหนด Manager ด้วย Email ต่อหน่วยงาน
- เลือกครอบคลุมเฉพาะหน่วยงานหรือรวมหน่วยงานลูกทั้งหมด
- กำหนดสิทธิ์ดูข้อมูล จัดกะ ยืนยันกะ รับรองเวลา และพิจารณาคำขอราย Scope
- Upload ผังองค์กร CSV พร้อม Preview และ Error รายแถว
- Upload Organization Manager Scope CSV พร้อม Preview และ Error รายแถว
- เพิ่ม ORG_UNIT Scope Type และใช้ org_code เชื่อมพนักงานกับผังองค์กร
- Employee Template V6.11.13 เพิ่มคอลัมน์ org_code


V6.11.13 Organization Import Safe Update & Upload Modal
- แก้ Error UPDATE requires a WHERE clause
- แก้ทั้ง Upload ผังองค์กรและ Upload Manager Scope
- ขยาย Popup Upload ผังองค์กรเป็น 1480px / 98vw
- แสดง Preview ครบทุกคอลัมน์ของ Template
- Header ตารางติดด้านบนและเลขแถวติดด้านซ้าย
- จัดพื้นที่เลือกไฟล์ ตัวเลือก และปุ่มให้สมดุล


V6.11.13 Organization Tree Drag & Drop
- เพิ่ม Drag Handle ในแต่ละหน่วยงาน
- วางด้านบนเพื่อเรียงก่อนหน่วยงานเป้าหมาย
- วางตรงกลางเพื่อย้ายเข้าเป็นหน่วยงานลูก
- วางด้านล่างเพื่อเรียงหลังหน่วยงานเป้าหมาย
- เพิ่ม Drop Zone สำหรับย้ายเป็นหน่วยงานหลัก
- ย้ายทั้งโหนดและหน่วยงานลูกทั้งหมด
- ป้องกันการย้ายหน่วยงานไปใต้ตัวเองหรือใต้ Subtree ของตัวเอง
- แสดงเส้นและสีบอกตำแหน่งวางแบบ Real-Time
- ยืนยันก่อนบันทึก และบันทึก MOVE_ORG_UNIT ลง Change Log
- ฟังก์ชันนี้จำกัดเฉพาะ HR Admin


V6.11.13 Employee Import Template
- Employee Template ใช้ email และ org_code เป็นข้อมูลเชื่อมหลัก
- ตัด manager_department, manager_division, manager_gm และ manager_avp ออกจาก Template ใหม่
- Manager และขอบเขตสิทธิ์กำหนดแยกที่ Manager Scope
- org_code ต้องตรงกับรหัสในผังโครงสร้างองค์กร
- Email ต้องไม่ซ้ำระหว่างพนักงาน
- เพิ่มฟังก์ชัน ta_sync_employee_structure_v695
- ตรวจ Email ซ้ำ, org_code ไม่พบ และ org_code ปิดใช้งานก่อนบันทึก
- หน้า Import แสดงผล Email/ผังองค์กรและ Error รายแถว
- ยังคงรองรับไฟล์เก่าที่มีคอลัมน์ Manager โดยจะอัปเดตเฉพาะเมื่อคอลัมน์นั้นอยู่ในไฟล์


V6.11.13 Move Zone to Organization Structure
- ตัด zone ออกจาก Employee Template
- เพิ่ม zone ใน Organization Structure Template
- Zone เลือกได้เฉพาะ กรุงเทพฯ และ ตจว.
- หน้าเพิ่ม/แก้ไขหน่วยงานเพิ่ม Dropdown Zone
- Tree และรายละเอียดหน่วยงานแสดง Zone
- Upload ผังองค์กรแสดงและตรวจสอบ Zone
- Employee Import ใช้ org_code ค้นหา Zone จากผังองค์กรอัตโนมัติ
- พนักงานที่ org_code ว่าง หรือหน่วยงานยังไม่มี Zone จะไม่ผ่านการตรวจสอบ
- เมื่อแก้ไข Zone ของหน่วยงาน ระบบอัปเดต employees.zone ตาม org_code


V6.11.13 Organization Zone Popup Visibility
- ย้ายช่อง Zone ออกมาเป็นแถวเด่นแยกต่างหากใน Popup เพิ่ม/แก้ไขหน่วยงาน
- แสดงคำอธิบายว่า Employee Zone ดึงจาก org_code อัตโนมัติ
- Zone มีเฉพาะ กรุงเทพฯ และ ตจว.
- เพิ่ม Validation ก่อนบันทึก
- เพิ่ม Badge V6.11.13 ใน Popup เพื่อตรวจสอบชุด Deploy
- เพิ่ม Cache Busting app.css/app.js เป็น 6.10.2-20260806
- เพิ่ม window.__TIME_CLOCK_BUILD__ สำหรับตรวจสอบ Build ใน Console


V6.11.13 Add Office Zone
- Zone รองรับ 3 ค่า: กรุงเทพฯ, ตจว., สำนักงาน
- Popup เพิ่ม/แก้ไขหน่วยงานเพิ่มตัวเลือก สำนักงาน
- Upload ผังองค์กรรองรับค่า สำนักงาน
- Employee Import ดึง Zone สำนักงานจาก org_code ได้
- Preview แสดง Zone สำนักงานด้วย Badge สีม่วง


V6.11.13 Organization Structure UI Balance
- ปรับเฉพาะ Tab ผังโครงสร้างองค์กรและ Popup ที่เกี่ยวข้อง
- เพิ่มขนาดตัวอักษรชื่อหน่วยงาน รายละเอียดรอง ตาราง Manager และข้อมูลรายละเอียด
- ลดขนาดปุ่ม Hero, Toolbar, Detail Actions และ Row Actions
- ปรับ Tree Row, KPI, Breadcrumb, Child List และ Detail Card ให้สมดุลขึ้น
- ปรับ Popup หน่วยงาน/Manager/Upload ให้ Label และ Input อ่านง่าย
- คง Logic และ SQL เดิมทั้งหมด
- รองรับ Dark Mode และ Responsive


V6.11.13 Move Area/Sub-area to Organization Structure
- เพิ่ม area และ sub_area ใน Organization Structure Template
- ตัด area และ sub_area ออกจาก Employee Template
- Popup เพิ่ม/แก้ไขหน่วยงานรองรับ Area และ Sub-area
- รายละเอียดหน่วยงานแสดง Zone, Area และ Sub-area
- Upload ผังองค์กร Preview แสดง Area / Sub-area
- Employee Import ใช้ org_code ดึง Zone / Area / Sub-area จากผังองค์กรอัตโนมัติ
- employees.area และ employees.sub_area ยังคงอยู่เพื่อรองรับตัวกรองและระบบเดิม แต่เป็นข้อมูลที่ Sync จากผังองค์กร
- ส่วนอื่นคงเดิม


V6.11.13 Employee Directory Upgrade
- เพิ่ม Email ในตารางข้อมูลพนักงาน
- เอา PC ออกจากตารางและ Excel
- เปลี่ยนชื่อ พื้นที่ เดิมเป็น Zone
- เพิ่ม พื้นที่ (area) ก่อน พื้นที่ย่อย (sub_area)
- HR Admin แก้ไขข้อมูลพนักงานจาก Popup ได้
- การแก้ org_code จะดึง Zone / Area / Sub-area จากผังองค์กรอัตโนมัติ
- Filter Zone / พื้นที่ / พื้นที่ย่อย โหลดจากผังองค์กรจริง
- พื้นที่และพื้นที่ย่อยเป็นตัวกรองแบบสัมพันธ์กัน
- Directory โหลดข้อมูลจาก Supabase ทีละ 1,000 records แล้วรวมทั้งหมด
- ตารางรองรับ Pagination 100 / 250 / 500 / 1,000 / ทั้งหมด
- ปุ่ม Excel ส่งออกข้อมูลทั้งหมดที่ค้นหา ไม่จำกัด 1,000 records
- ปรับ UX/UI Hero, Filter, KPI, Table, Pagination และ Edit Modal
- ส่วนอื่นคงเดิม


V6.11.13 Employee Directory Layout & Cascading Organization Filter
- ตารางรายชื่อพนักงานปรับความกว้างแต่ละคอลัมน์ตามชนิดข้อมูล
- ชื่อ, Email, ตำแหน่ง, หน่วยงาน, Area, Sub-area ยืดหยุ่นและตัดบรรทัดได้
- รหัส, Zone, วันที่, สถานะ และปุ่มจัดการคงความกว้างกะทัดรัด
- ตัวกรองเป็น Zone -> Area -> Sub-area -> หน่วยงาน
- หน่วยงานใช้ org_code เป็นค่ากรองจริง และแสดงชื่อหน่วยงาน + org_code
- เมื่อเปลี่ยนพื้นที่ย่อย รายการหน่วยงานจะกรองตามพื้นที่ย่อยทันที
- เพิ่มปุ่มรีเซ็ตตัวกรอง
- ย้ายปุ่ม Excel ไปอยู่หัวตารางใกล้ตัวเลือกจำนวนแถวต่อหน้า
- ปรับ Search / Reset / Excel / Edit ให้ขนาดและตำแหน่งสมดุลขึ้น
- ส่วนอื่นคงเดิม


V6.11.13 Organization Manager Search & UX/UI
- Manager Candidate ดึงจาก employees
- รองรับเฉพาะ PC 4C,4B,4A,3C,3B,3A,2C,2B,2A,1A
- Email ต้องไม่เป็นค่าว่าง
- ช่องกำหนด Manager ค้นหาได้จากรหัสพนักงาน ชื่อ-นามสกุล และ Email
- ผลค้นหาแสดงรหัส ชื่อ Email PC ตำแหน่ง หน่วยงาน และจำนวน Scope เดิม
- ต้องเลือก Manager จากผลค้นหาก่อนบันทึก
- กรณีแก้ไข Scope เดิม Manager จะถูกล็อกไม่ให้เปลี่ยน Email
- ปรับ Organization Hero, ปุ่ม Action, Tree, KPI, Detail Card, Manager Card และ Manager Modal
- รองรับ Dark Mode และ Responsive
- ส่วนอื่นคงเดิม


V6.11.13 Fix Manager Profile Save
- แก้ ACTIVE_MANAGER_PROFILE_NOT_FOUND_FOR_EMAIL
- Candidate แสดงสถานะบัญชี User/Profile
- ถ้าไม่มี auth.users จะไม่ให้เลือก Manager
- ถ้ามี Auth User แต่ยังไม่มี Profile ระบบสร้าง MANAGER Profile อัตโนมัติ
- ถ้า Role เป็น VIEWER ระบบเปลี่ยนเป็น MANAGER อัตโนมัติเมื่อ HR Admin บันทึก
- ถ้า MANAGER Profile inactive ระบบเปิดใช้งานอัตโนมัติ
- HR_ADMIN ที่ Active สามารถผูก Manager Scope ได้โดยไม่เปลี่ยน Role
- หน้า Search แสดง Badge พร้อมใช้งาน / จะเตรียมสิทธิ์ / ยังไม่มีบัญชีผู้ใช้
- ส่วนอื่นคงเดิม


V6.11.13 User Account Management
- เพิ่มเมนู HR Admin: จัดการบัญชีผู้ใช้งาน
- HR Admin ค้นหาพนักงานจากรหัส/ชื่อ/Email และสร้างบัญชีด้วย Email
- การสร้าง Auth User ใช้ Supabase Edge Function เท่านั้น
- ระบบสร้าง Temporary Password แบบสุ่ม 16 ตัวอักษร
- Temporary Password ไม่เก็บ Database และไม่ส่งกลับ Browser
- ส่ง Welcome Email ผ่าน Resend API
- User Login ครั้งแรกถูกบังคับเปลี่ยน Password ก่อนโหลดข้อมูลระบบ
- เพิ่มลิงก์ ลืมรหัสผ่าน ที่หน้า Login
- Self-service reset ใช้ Supabase Auth resetPasswordForEmail
- เพิ่ม Account Status, KPI, Filter และตารางบัญชีผู้ใช้
- HR Admin แก้ Role / Employee Code / Active ได้
- เพิ่ม Account Audit Log
- ต้อง Deploy Edge Function admin-users และตั้ง Secrets ก่อนใช้งาน Create User


V6.11.13 Invite Link First Setup
- ตัด Temporary Password ออกทั้งหมด
- HR Admin ส่ง Supabase Invite Link
- User กด Invite -> หน้าเว็บแสดงปุ่มตอบรับ -> verifyOtp type invite
- หลังตอบรับ ระบบบังคับตั้งรหัสผ่านก่อนใช้งาน
- เพิ่มสถานะ INVITE_PENDING
- เพิ่ม KPI รอตอบรับ Invite
- เพิ่มปุ่มส่ง Invite ใหม่
- ปุ่มส่ง Invite ใหม่เรียก Edge Function admin-users action=resend_invite
- Forgot Password ยังใช้ Supabase Auth เหมือนเดิม
- แนะนำ Email OTP Expiration = 86400 วินาที (24 ชั่วโมง)
- ต้องตั้ง Custom SMTP และ Redirect URL Allow List
- ใช้ Invite Email Template V6.11.13 ที่แนบมา


V6.11.13 Account Button / Modal Fix
- แก้ปุ่มสร้างบัญชีผู้ใช้กดแล้วไม่เปิด Popup
- Export openModal / closeModal เข้า TimeClockApp
- เพิ่ม local modal helper เป็น fallback
- ปุ่มสร้างบัญชีเปิด Popup ทันที ก่อนโหลด Candidate
- ถ้า Candidate RPC ล้มเหลว จะแสดง Error ใน Popup และ Toast
- แก้ Popup แก้ไขบัญชี และ Forgot Password ให้เปิด/ปิดแน่นอน
- เพิ่ม fallback navigation ของ Tab จัดการบัญชีผู้ใช้งาน
- ถ้า SQL V6.10.7 ไม่พร้อม จะแสดงข้อความแทนการเงียบ
- ไม่เปลี่ยน SQL และ Edge Function


V6.11.13 Invite ConfirmationURL Fix
- เปลี่ยน Invite Flow หลักจาก client verifyOtp(token_hash) เป็น Supabase ConfirmationURL
- Email Link เปิดหน้า Time-Clock ก่อนเพื่อป้องกัน email prefetch
- User กดปุ่มตอบรับแล้วจึงไป Supabase /auth/v1/verify
- Supabase Auth ยืนยัน Invite และ Redirect กลับ Time-Clock พร้อม Session
- ระบบเดิม must_change_password=true จะบังคับตั้งรหัสผ่านต่อ
- รองรับ Email เก่า V6.10.7/V6.10.8 ด้วย token_hash เป็น fallback
- เพิ่มการแสดง Supabase Auth error code/message จริง
- SQL และ Edge Function เดิมไม่ต้องเปลี่ยน


V6.11.13 Default Supabase Connection
- Default Project URL: https://lryojaccbbbgdbpjstld.supabase.co
- Embed Publishable Key สำหรับ Browser
- User ใหม่ / Browser ใหม่เชื่อม Supabase อัตโนมัติ
- Invite flow ไม่ควรขึ้น Popup ตั้งค่าการเชื่อมต่ออีก
- Popup ตั้งค่าคงไว้สำหรับผู้ดูแลกรณีเปลี่ยน Project
- Service Role ไม่ถูกฝังใน frontend
- SQL และ Edge Function ไม่เปลี่ยน


V6.11.13 Password Setup Link
- INVITE_PENDING: ใช้ปุ่ม ↻ Invite
- FIRST_LOGIN_PASSWORD: ใช้ปุ่ม 🔑 ตั้งรหัสผ่าน
- Invite Link เดิมไม่ถูกนำกลับมาใช้หลัง Email confirmed แล้ว
- ปุ่มตั้งรหัสผ่านเรียก Edge Function action=send_password_setup
- Recovery Email จะพา User กลับ Time-Clock และเปิด Password Recovery Flow
- Forgot Password หน้า Login ยังใช้ได้เหมือนเดิม


V6.11.13 Prefetch-safe Password Recovery
- แยก Invite Error และ Password Recovery Error ออกจากกัน
- Recovery Link จะไม่แสดง Popup USER INVITATION อีก
- เพิ่ม Popup PASSWORD RECOVERY ก่อนยืนยันกับ Supabase Auth
- Recovery Email ใช้ ConfirmationURL ผ่านหน้า Time-Clock ก่อน
- User กด "ยืนยันและตั้งรหัสผ่าน" จึงไป /auth/v1/verify จริง
- ลดปัญหา Email Security Scanner consume recovery link
- Forgot Password redirect มี auth_flow=recovery
- SQL ไม่เปลี่ยน


V6.11.13 Recovery OTP Code
- เปลี่ยน Password Recovery หลักเป็น OTP code
- Recovery Email ไม่มี one-time ConfirmationURL ในปุ่มเปิดเว็บ
- Email แสดง {{ .Token }} ให้ User กรอกเอง
- ปุ่มใน Email เปิด Time-Clock ด้วย auth_flow=recovery_otp
- หน้าเว็บเปิด Popup กรอก Email + OTP
- verifyOtp({email, token, type:'recovery'})
- Verify สำเร็จ -> เปิด Popup ตั้งรหัสผ่านทันที
- ลดปัญหา Email Security Scanner / Safe Links consume token
- Invite Flow เดิมคงไว้
- SQL และ Edge Function ไม่ต้องเปลี่ยน


V6.11.13 Password Visibility Toggle
- เพิ่มปุ่ม แสดง/ซ่อน ในช่องรหัสผ่านใหม่
- เพิ่มปุ่ม แสดง/ซ่อน ในช่องยืนยันรหัสผ่านใหม่
- เมื่อเปิด Popup ใหม่ จะกลับเป็นสถานะซ่อนรหัสผ่านอัตโนมัติ
- รองรับ Keyboard / aria-pressed
- รองรับ Dark Mode และ Mobile
- Flow การเปลี่ยนรหัสผ่านเดิมคงเดิม
- SQL และ Edge Function ไม่เปลี่ยน


V6.11.13 Recovery Client / OTP Send Fix
- แก้ Cannot read properties of null (reading 'auth')
- แก้ Default Supabase config ให้ seed APP_CONFIG_KEY ที่ถูกต้อง
- getConfig fallback ไป Default Project URL/Publishable Key เสมอ
- เพิ่ม ensureSupabaseClient()
- Recovery OTP จะ Initialize Supabase Client ก่อน verifyOtp
- Session/User จาก Recovery OTP ถูก sync กลับ TimeClockApp
- เปลี่ยน Password ใช้ Client ที่ ensure แล้ว
- ปุ่มตั้งรหัสผ่านของ HR Admin มี Cooldown 60 วินาที
- หลัง Supabase รับคำขอส่ง OTP ปุ่มจะขึ้น "ส่งแล้ว • xx วิ"
- ลดการกดซ้ำที่ทำให้ได้รับ OTP หลายฉบับ
- SQL / Edge Function / Email Template ไม่เปลี่ยน


V6.11.13 Login Password Toggle
- เพิ่มปุ่ม แสดง/ซ่อนรหัสผ่าน ที่หน้า Login
- ใช้สไตล์เดียวกับหน้าเปลี่ยนรหัสผ่าน
- เมื่อ Logout หรือกลับหน้า Login ระบบจะซ่อนรหัสผ่านอัตโนมัติ
- ไม่ต้องรัน SQL
- ไม่ต้องแก้ Edge Function


V6.11.13 Global UX/UI Refresh
- ปรับ UX/UI ทั้งเว็บโดยใช้ Design System เดียวกัน
- เพิ่มขนาดตัวอักษรของ Form / Table / Panel / Modal / Button ให้สมดุล อ่านง่ายขึ้น
- ปรับ spacing, radius, border และ shadow ลดความแน่นของหน้าจอ
- ปรับตารางทุกหน้าให้หัว/ข้อมูลอ่านง่ายขึ้น แต่ยังรองรับ horizontal scroll
- ปรับ Modal ทุกหน้าขนาดและ typography ให้สม่ำเสมอ
- ปรับ Sidebar ใหม่ แบ่งกลุ่มเมนูชัดเจน
- Nav icon เป็น block ขนาดสม่ำเสมอ
- Active/Hover state อ่านง่ายขึ้น
- เพิ่ม user avatar ที่ footer ของ Sidebar
- Collapsed Sidebar กว้าง 86px และ Content ขยายเต็มจริง
- Collapsed Sidebar ซ่อนเฉพาะข้อความ ไม่ซ่อน badge
- Hover icon ตอน collapsed มี Tooltip ชื่อเมนู
- จำสถานะย่อ/ขยายด้วย localStorage
- Mobile Sidebar มี Scrim, กดพื้นที่นอก/ESC เพื่อปิด
- Mobile จะไม่ใช้ layout collapsed ของ desktop
- แก้ Login Show/Hide Password runtime scope จาก V6.10.16
- Dark Mode ปรับ panel/control/sidebar consistency
- ไม่เปลี่ยน Business Logic / SQL / Edge Function


V6.11.13 Attendance Employee Timeout Fix
- Search Attendance ไม่รอโหลดรายชื่อพนักงาน
- Employee selector เปลี่ยนเป็น Lazy Load
- โหลด Employee list เมื่อเปิด Dropdown เท่านั้น
- ใช้ RPC ta_get_attendance_employee_options_v61018
- SQL สรุป Employee ก่อนตรวจ Role/Scope
- HR Admin ไม่เรียก ta_can_access_employee_v680 ซ้ำทุก Attendance row
- เพิ่ม Index สำหรับ Employee selector / Manager scope
- หาก Employee selector timeout ใช้ Attendance ที่โหลดได้เป็น fallback
- ส่วนอื่นคงเดิม


V6.11.13 Remove Review / Leave / Correction / Exception Modules
- ตัดเมนู รายการรอตรวจสอบ
- ตัดเมนู ลาและใบรับรอง
- ตัดเมนู คำขอแก้ไขเวลา
- ตัดเมนู Exception Center
- ตัด Page / Modal / Frontend function ของ 4 Module
- ตัด Review Center JavaScript
- ตัด Leave / Certificate / Time Correction / Exception V650 JavaScript
- ตัด Review Report และ Feature Flag
- Dashboard shortcut ของ Missing IN/OUT เปลี่ยนไปหน้า รายละเอียดเวลาทำงาน
- Notification ที่ backend ส่ง target_page เป็น Module ที่ตัดออก จะ fallback ไป Attendance
- คง Employee datalist สำหรับ User Management ไว้
- ไม่ Drop Table / RPC ใน Supabase เพื่อรักษาข้อมูลเดิมและ Dependency
- ส่วนอื่นคงเดิม


V6.11.13 Attendance Main Search Timeout Fix
- แก้ Query หลักของ Tab รายละเอียดเวลาทำงาน
- เพิ่ม RPC ta_get_attendance_detail_v61020
- HR Admin ไม่เรียก ta_can_manage_employee_schedule ทีละ Attendance row
- Viewer query เฉพาะ Employee ของตนเองโดยตรง
- Manager คง Manager Scope logic เดิม แต่ Frontend แบ่งช่วงวันที่ให้เล็กลง
- Search แบ่งช่วงวันที่เป็น 14 วันต่อ Request จากวันที่ล่าสุดย้อนกลับ
- หาก Chunk ยัง timeout ระบบแบ่งครึ่งอัตโนมัติได้สูงสุด 4 ชั้น
- รวมผลลัพธ์และ de-duplicate ด้วย emp_code + work_date
- Limit รวมยังคง 5,000 รายการ
- Sub-area ถูกกรองใน SQL V6.11.13
- V6.10.19 การตัด 4 Module ยังคงเดิม
- ส่วนอื่นคงเดิม


V6.11.13 Attendance Chunk Runtime Fix
- แก้ Error: Assignment to constant variable.
- สาเหตุ: attendanceChunkRanges() ประกาศ chunkStart เป็น const
  แต่ช่วงสุดท้ายต้อง clamp วันที่กลับไปที่ start date
- เปลี่ยน chunkStart เป็น let
- SQL V6.10.20 ใช้ต่อได้ ไม่ต้องรันใหม่
- Logic แบ่งช่วง 14 วัน / adaptive timeout split คงเดิม
- 4 Module ที่ตัดใน V6.10.19 ยังคงถูกตัดออก
- ส่วนอื่นคงเดิม


V6.11.13 User Scope Hardening
- Global Filter ใช้ ta_get_filter_options_v61022
- Attendance Filter ใช้ ta_get_attendance_filter_options_v61022
- Schedule ใช้ ta_get_monthly_schedule_v61022
- Schedule Scope ถูกตรวจตาม Employee + Work Date
- Manager/Viewer ไม่อ่าน employees / attendance_workday / shift_calendar
  โดยตรงเพื่อ enrich ตารางกะอีกต่อไป
- HR_ADMIN ยังคง Full Access ตามสิทธิ์
- ลบ direct write fallback ของ Schedule
- การลบกะใช้ ta_delete_shift_assignments_bulk_v61022
- Report Attendance/Late ใช้ ta_get_attendance_detail_v61020
- แก้ V680 undefined hrOnly หลังตัด 4 Module ใน V6.10.19
- แก้ Build Version diagnostic เป็น V6.11.13
- ส่วนอื่นคงเดิม


V6.11.13 Weekly Schedule Scope Fix
- ใช้ ta_can_access_employee_v680() เป็น User Scope หลักของ Schedule
- Calendar ส่งเฉพาะวันที่ 7 วันที่กำลังแสดง
- ไม่ใช้ _ta_scope_employee_ranges_v61022 เป็นตัวตัดสิน Schedule อีก
- สร้าง Monthly engine เฉพาะ Employee Codes ที่มีสิทธิ์
- ตรวจ VIEW permission ต่อ work_date อีกครั้ง
- รองรับสัปดาห์ข้ามเดือน
- ถ้า Manager ได้ 0 คน จะแจ้งเตือนให้ตรวจ Scope / effective date

V6.11.13 Weekly Schedule Matrix + Scope Diagnostics


V6.11.13 Schedule Start Date Guard
- ตารางกะเพิ่ม วันเริ่มงาน ต่อจากชื่อ-นามสกุล
- ตารางกะเพิ่ม ตำแหน่ง ต่อจากวันเริ่มงาน
- 4 คอลัมน์ซ้ายเป็น Sticky: รหัส / ชื่อ / วันเริ่มงาน / ตำแหน่ง
- วันก่อน start_date แสดงเป็นช่อง disabled "ยังไม่เริ่ม"
- ช่องก่อนวันเริ่มงานไม่มี data-schedule-cell จึงเลือก/ลาก/Fill/Quick Shift ไม่ได้
- SQL ta_assign_shift_single_v651 ป้องกันการกำหนดกะก่อน Start Date
- SQL ta_assign_shifts_bulk_v651 ป้องกันการกำหนดกะแบบ Bulk ก่อน Start Date
- Excel Export ของ Schedule เพิ่ม วันเริ่มงาน และ ตำแหน่ง
- V6.10.24 FIX3 Set-based Schedule Engine คงเดิม
- User Scope และส่วนอื่นคงเดิม


V6.11.13 User Scope + Schedule Filter + Gap Fix
- Normalize legacy USER -> MANAGER on database side.
- Schedule filters no longer reuse Dashboard date filters.
- New ta_get_schedule_filter_options_v61026 uses exact visible week.
- Schedule filters and Schedule table use the same FIX3 access engine.
- Zone change refreshes Department options inside the same User Scope.
- Schedule RPC now returns resign_date.
- Before Start Date = ยังไม่เริ่ม.
- After Resign Date = ลาออก.
- Missing date while employed = นอก Scope.
- All three states are disabled and cannot be assigned.
- V6.10.24 FIX3 set-based performance remains unchanged.
- V6.10.25 Start Date assignment guard remains unchanged.


V6.11.13 Schedule UX
- Manager เห็นกะตนเองได้ แต่แถวตนเองเป็น View Only
- แถว Manager ตนเองไม่มี data-schedule-cell จึงไม่สามารถเลือก/ลาก/Fill/Paste/Quick Shift/Double-click แก้ไข
- openAssignment ป้องกัน Manager เปิด Modal จัดกะตนเอง
- SQL ป้องกัน Single / Bulk / Confirm / Clear / Delete กะตนเอง
- ชื่อ-นามสกุลและตำแหน่งใช้ Responsive clamp width
- Sticky offsets คำนวณจาก CSS variables
- เอา OT badge ออกจาก Label กะ แต่ข้อมูล OT ใน Tooltip/Report/Calculation ยังอยู่
- ปรับสี D / N / OFF / HOL / LV ให้เด่นและอ่านง่ายขึ้น
- Quick Shift buttons ใช้ชุดสีเดียวกับ Label
- Dark mode ปรับชุดสีให้ไปทางเดียวกัน
- User Scope, FIX3 Performance, Start Date Guard และส่วนอื่นคงเดิม


V6.11.13 Auto Attendance Recalculation after Shift Change
- Save / Change / Clear / Delete / Confirm shift automatically recalculates Attendance.
- SQL performs shift write + attendance calculation in the same transaction.
- If recalculation fails, the schedule write rolls back.
- Single edit recalculates one employee + one work date.
- Bulk edit recalculates affected employee set once across edited min/max date.
- Future dates with no attendance are marked deferred; when attendance is built,
  the existing attendance trigger calculates using the current shift.
- Removed duplicate browser-side manual recalc from Attendance return flow.
- Attendance Detail reload now reads freshly recalculated planned start/end.
- Existing V6.10.28 permission fix, Manager self guard, Start Date guard,
  User Scope, and Schedule FIX3 remain unchanged.


V6.11.13 System Period Management
- New HR Admin page: จัดการรอบระบบ
- Monthly period with Schedule Edit Deadline and Attendance Certification Deadline.
- Manual open/close switches for both processes.
- Copy previous period to next month while preserving deadline offset from month end.
- Audit history per period.
- Manager schedule edit/confirm/delete is blocked after deadline or manual close.
- Manager attendance certify/revoke is blocked after deadline or manual close.
- HR Admin is explicit override role.
- Unconfigured months remain open for backward compatibility.
- Schedule UI shows period status and disables closed-period cells.
- Attendance Detail disables certification action after certification deadline.
- V6.10.28 Permission Fix and V6.10.29 Auto Attendance Recalculation remain intact.


V6.11.13 System Period Realtime Sync
- HR Admin changes to ta_system_periods are pushed to logged-in users through Supabase Realtime when publication is available.
- Frontend also refreshes System Period state every 15 seconds as fallback.
- Period cache is cleared on schedule render, browser focus, visibility return, profile-ready and realtime events.
- Locked Schedule cells are restored automatically when HR Admin re-opens or extends the period. No full page refresh is required.
- Closed-period shift labels keep Shift Code and Start-End time visible.
- Text "ปิดรอบ" inside shift cells was replaced by a compact lock icon.
- Server-side deadline rules remain unchanged.


V6.11.13 System Period Modal Fix
- Fix +เพิ่มรอบระบบ button not opening modal.
- Button and modal actions explicitly use type=button.
- Direct click binding plus capture-phase delegated fallback.
- Delegation is installed immediately when the module loads.
- openNewPeriod is exposed on window.TimeClockSystemPeriods for diagnostics.
- Modal open/close is defensive and reports missing modal DOM instead of failing silently.
- System Period modal z-index increased to avoid being hidden behind other overlays.
- Clicking the modal backdrop closes it.
- No SQL/database changes required.


V6.11.13 System Period Loading Fix
- Fix System Period page stuck at "กำลังโหลดข้อมูล...".
- Removed silent early-return behavior.
- Waits briefly for Supabase client/profile readiness.
- Initializes Year filter before loading.
- RPC load has an 8-second timeout.
- If RPC fails or times out, frontend falls back to direct SELECT from ta_system_periods.
- If both paths fail, the table shows the real error and a "ลองใหม่" button.
- Removed duplicate System Period load call from nav binding.
- Replaced ta_list_system_periods_v6110 with a compact SQL set-based function.
- Added ta_system_period_health_v6113 for diagnostics.


V6.11.13 System Period Page Lifecycle Fix
- Root fix: System Period page now owns its load lifecycle instead of relying only on switchPage().
- MutationObserver watches page-admin-periods becoming active.
- Navigation click fallback listens to Sidebar and HR Admin Center.
- Role-ready, session-ready, browser focus and visibility return all trigger activation checks.
- If the page is already active when the module finishes loading, it loads immediately.
- Current year 2026 is present statically before JavaScript runs; JS expands year options normally.
- Concurrent load calls are de-duplicated.
- New window.TimeClockSystemPeriods.reload(), activate() and debugState() diagnostics.
- Small load-state text is shown above the table.
- No SQL/database changes required.


V6.11.13 Root Cause Fix
- Confirmed source bug: System Period helper functions were inserted into the Schedule Excel IIFE instead of the System Period IIFE.
- Moved Realtime Sync helpers into the correct System Period module.
- Moved System Period Event Delegation into the correct module.
- Moved System Period Page Lifecycle / MutationObserver into the correct module.
- Removed those misplaced functions from the Schedule Excel module.
- System Period module now sets data-system-period-module="6.11.13-ready" when it loads.
- bind() immediately changes the load status to "กำลังเตรียมข้อมูลรอบระบบ..." so runtime execution is visible.
- Prevents overlapping System Period load requests.
- Runtime harness validates both module initialization and DOMContentLoaded bind without ReferenceError.
- No SQL/database changes required.


V6.11.13 CSV Import + Work Pattern Restore
- Root cause 1: CSV Time Import HTML uses timeCsv* IDs, but V6.11.5 JavaScript used old mobileta* Text File IDs.
- Replaced the mismatched Text MobileTA module with the known-good CSV module that matches current timeCsv* HTML.
- CSV import now uses EmployeeId, InOutDate, InOutTime, InOutMode, GPSName, GpsLocation as shown on the page.
- Root cause 2: the Technician Work Pattern JavaScript module had disappeared from the compact bundle while the HTML page remained.
- Restored Work Pattern parameter loading, employee assignment, templates, modals and daily-plan integration.
- Central switchPage now directly calls TimeClockCsvImport.load() and TimeClockWorkPatterns.load().
- Added window.TimeClockCsvImport and window.TimeClockWorkPatterns runtime APIs.
- Added module-ready dataset markers.
- Added visible errors instead of blank Work Pattern panels.


V6.11.13 Remove Early Shift + Customer Template
- Removed the employee-facing third template: ออกกะแรกก่อนเวลา + งานลูกค้า.
- Work Pattern page now shows only 2 templates.
- Schedule/employee template options defensively discard any legacy EARLY category/code returned by an older RPC.
- Shared customer-window logic is retained because กะปกติ + งานลูกค้าช่วงดึก still uses it.
- SQL disables the legacy master and migrates current operational references to SPLIT_FLEX while preserving historical calculation rows.


V6.11.13 Work Pattern -> Schedule -> Attendance Linkage
- Employee Pattern default_template_code is now the Schedule Assignment default.
- Existing Daily Work Plan overrides the employee default only for that specific day.
- SPLIT_FLEX requires customer start/end.
- Schedule + Daily Work Plan saves atomically in ta_assign_shift_with_work_plan_v6118.
- Attendance recalculates after the Daily Work Plan is saved.
- SPLIT_FLEX calculation creates:
  Segment 1 WORK = assigned shift
  Segment 2 WAITING = shift end to customer start
  Segment 3 WORK = customer start to customer end.
- Schedule label shows two paid work rows: กะที่ 1 / กะที่ 2.
- Attendance main table adds รูปแบบช่วงงาน and shows the same two paid work segments.
- Attendance Detail Drawer shows กะที่ 1 / กะที่ 2 from calculated segments.
- Employee Pattern save invalidates Schedule cache so the next Schedule open reads the new default.
- V6.11.7 two-template policy remains unchanged.


V6.11.13 Employee Pattern + Locked Default Template + Shift Punch Columns
- Employee Pattern table now shows:
  Template เริ่มต้น / เริ่มใช้ / สิ้นสุด / วันที่บันทึก / ผู้บันทึก.
- Assignment metadata comes from ta_employee_work_patterns effective record.
- Employee Pattern edit modal reopens the current effective dates and note.
- Schedule Assignment popup shows ONE template only:
  the employee's default template.
- The template selector is read-only. To change it, edit รูปแบบการทำงาน.
- Server RPC ta_assign_shift_with_work_plan_v6119 rejects a different template.
- Attendance table replaces รูปแบบช่วงงาน + First In + Last Out with:
  เวลาเข้า กะที่ 1
  เวลาออก กะที่ 1
  เวลาเข้า กะที่ 2
  เวลาออก กะที่ 2.
- Actual punches are matched from time_logs IN/OUT to paid calculated work segments.
- Normal one-shift employees use Shift 1; Shift 2 stays blank.
- SPLIT_FLEX employees can show actual punches separately for both shifts.
- Excel export uses the same four punch columns.


V6.11.13
1) Employee Pattern table
- Fix blank metadata columns.
- Uses ta_get_employee_pattern_assignment_meta_v61110.
- Future saves use ta_assign_employee_work_pattern_v61110 and persist UI save audit.
- Columns: Template / Start / End / Recorded Date-Time / Recorder.

2) Schedule Assignment
- SPLIT_FLEX hides night-shift choices in the primary shift dropdown.
- Primary shift remains the normal/day shift.
- Customer Shift 2 comes from customer start/end settings.

3) Customer End
- New mode: ตามเวลาออกจริง (default) or กำหนดเวลา.
- ACTUAL_OUT stores customer_window_end = null.
- Calculation creates an open-ended paid Shift 2 and uses actual OUT when available.
- Schedule label shows "ตามเวลาออก".

4) Attendance table
- Replaces generic shift start/end with 8 grouped columns:
  Shift 1 Plan Start / Plan End / Actual In / Actual Out
  Shift 2 Plan Start / Plan End / Actual In / Actual Out.
- Shift 1 is blue; Shift 2 is orange.
- Open Shift 2 planned end shows "ตามเวลาออก".

V6.11.13: Employee Pattern metadata reliability + Work Pattern UX redesign.


V6.11.13 Schedule view switch
- Added TEAM and PERSON schedule views in the same page.
- Team summary view groups data by department/unit with weekly cards and quick open to person view.
- Person view keeps existing Excel-style scheduling interaction.


V6.11.13 Team daily summary + drill-down drawer
- Team day cells summarize day/night/off/leave counts instead of using one dominant shift color.
- Clicking a team/day cell opens a right-side drawer with employee names, shift, planned time, actual in/out, and attendance status.
- Drawer filters: all/normal/late/absence/off/leave.

- Future scheduled workdays show status รอทำงาน instead of ปกติ when no punch exists yet.
