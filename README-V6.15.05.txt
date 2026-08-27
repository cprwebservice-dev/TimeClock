TimeClock Enterprise V6.15.05
Employee Portal — Day-off Request / Swap + Remaining Quota

Fix
- ta_portal_get_my_dayoff_balance_v61494 is now VOLATILE.
- This fixes "cannot execute UPDATE in a read-only transaction" because
  Portal session validation updates last_seen_at.

Employee Portal
- Day-off request now has 2 modes:
  1) สลับวันหยุด
  2) ขอหยุดเพิ่ม
- ขอหยุดเพิ่ม is available only when requestable quota > 0.
- Pending ADD_DAYOFF requests reserve requestable quota so employees cannot
  submit more pending requests than remaining quota.
- Calendar selection:
  * SWAP: select existing off day -> select workday.
  * ADD: select one workday directly.
- Public holidays, leave days, and existing days off cannot be ADD targets.
- Modern quota cards show quota / used / balance / requestable.

Manager
- ADD_DAYOFF shows "ตรวจและจัดวันหยุด".
- Opens Shift Assignment directly on requested date in DYNAMIC_OFF mode.
- Existing scheduling quota guard remains the final approval-time guard.
- SWAP_DAYOFF retains the existing two-step workflow.

No automatic schedule change occurs when Employee submits a request.
