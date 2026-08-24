TimeAttendance V6.14.45 — Generated Shift Cache + Work Mode RPC 400 Fix

1. กะเช้า + รอเข้ากะดึก (SPLIT_WAIT_NIGHT)
   - Backend ta_resolve_split_wait_shift_v6120 creates SWxxxxxxx in shift_master.
   - Frontend now hydrates the returned generated row into the current Shift Master cache immediately.
   - Fixes false error: ไม่พบรหัสกะ SW08301500 ใน Shift Master.

2. กะนับชั่วโมง
   - Applies the same generated-shift cache hydration to H5/H6 generated codes.

3. Generated paired day-off
   - Adds a safe cache fallback for generated day-off codes returned by the day-off resolver.

4. DevTools HTTP 400: ta_get_work_mode_admin_v6120
   - Work Template access no longer calls the HR-only admin RPC for Manager/User/Viewer roles.
   - Non-HR roles go directly to ta_get_work_modes_for_employee_v6120.
   - HR Admin behavior remains unchanged.

No SQL migration required. Scheduling rules, Night Sequence, permissions, quotas, and backend writer remain unchanged.
