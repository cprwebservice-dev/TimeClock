TimeClock Enterprise V6.14.94
Employee Request Workflow & My Schedule UX

Employee Portal
- PENDING requests can be edited; cancellation remains soft-delete/CANCELLED for audit.
- Duplicate/conflict checks are enforced by backend.
- Day-off swap uses a monthly calendar picker:
  source = quota day-off, target = working day, same month, PH/Leave disabled.
- Displays canonical quota / used / remaining.
- My Schedule uses day/night/off/leave/PH/hour icons, shift start/end, and special-work segment 2.

Manager
- Special-work assignment shows the employee request details inside Shift Assignment.
- For NORMAL_LATE_CUSTOMER and SPLIT_WAIT_NIGHT, the employee-reported period is shown as "กะที่ 2".
- Time Certification shows employee issue type, raw-punch snapshot, and employee reason.
- Day-off Swap runs as a 2-step schedule workflow: source -> work, target -> day-off.
- Leave runs through LV assignment and supports sequential dates.

Backend
- Portal request update RPC.
- Active-request duplicate/conflict guard.
- Session-bound canonical day-off balance reader based on V6.14.25 rules.
- Portal calendar exposes schedule-rule/customer-window fields for special-shift display.
