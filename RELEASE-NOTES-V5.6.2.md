# Time-Clock Enterprise V5.6.2

## Schedule display consistency fix

- ช่องกะจะแสดงรหัสกะที่บันทึก เช่น D, N, OFF, HOL หรือ LV ทันที
- ปรับลำดับการแสดงผลเป็น Assigned Shift > Effective Shift > Auto Shift
- โหลดข้อมูลจาก `shift_calendar` มาซ้อนทับผล RPC เพื่อรองรับฐานข้อมูลที่ใช้ `ta_get_monthly_schedule` รุ่นเก่า
- ป้องกันกรณีบันทึกสำเร็จ แต่หลัง Refresh ช่องกลับเป็น `-`
- แสดง Toast พร้อมรหัสกะที่บันทึก
- ส่วนอื่นคงเดิมจาก V5.6.1
