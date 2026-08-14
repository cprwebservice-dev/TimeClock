Time-Clock Enterprise V6.11.23

Manager Name Fix
- มุมมองทีม ดึง Manager จากผังโครงสร้างองค์กร / ta_manager_scopes (ORG_UNIT)
- จับคู่หน่วยงานด้วย org_name ก่อน และ org_code ของพนักงานเป็น fallback
- รองรับ Manager ที่กำหนดระดับหน่วยงานแม่และ include_descendants=true
- ถ้า Profile ไม่มี display_name จะค้นชื่อจาก Employee Master ด้วย emp_code
- ไม่ต้องรัน SQL เพิ่มจาก V6.11.21 / V6.11.17 FIX1
