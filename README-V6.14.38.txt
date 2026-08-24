Time-Clock Enterprise V6.14.38
Work Template Access Detail

Frontend-only update. No SQL migration is required.
Backend prerequisite: keep the current V6.14.37 R1 canonical neighbor / leave-aware night guard already installed.

Changes
1. Work Template section now shows only work modes/templates that are active and allowed in the user's accessible scope.
2. Supported cards:
   - NORMAL: กะปกติ (ST6 / ST5)
   - NORMAL_LATE_CUSTOMER: กะปกติ + งานลูกค้าช่วงดึก (SPLIT_FLEX)
   - SPLIT_WAIT_NIGHT: กะเช้า + รอเข้ากะดึก
   - HOUR_BASED: กะนับชั่วโมง
3. DYNAMIC_OFF and LEAVE are not shown as Work Templates because they are day status/actions, not work templates.
4. Each card shows the permission/scope label from Scheduling Rules.
5. HR Admin uses ta_get_work_mode_admin_v6120 as the canonical config source.
6. Non-HR users resolve allowed modes through representative employees in departments already visible in their scope via ta_get_work_modes_for_employee_v6120.
7. Changing Work Mode active/scope settings refreshes the Work Template cards immediately.
8. Existing schedule/night-sequence/day-off/attendance logic is unchanged.

Deploy
- Replace web files with this package.
- Hard refresh: Ctrl+F5 / Ctrl+Shift+R.
- No SQL needs to be run for V6.14.38.
