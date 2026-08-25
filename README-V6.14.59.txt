TimeAttendance V6.14.59 — Special Work-Mode Badges / Scheduling UX

Frontend-only release. No SQL required.

Added visual markers for:
- กะปกติ + งานลูกค้าช่วงดึก = ↗ ต่อดึก (SPLIT color family)
- กะเช้า + รอเข้ากะดึก = ⌛ รอดึก (SPLIT color family)
- กะนับชั่วโมง = ◷ นับชม. (HOUR color family)

Applied to:
- Person Schedule 15-day / Full Month
- Team View
- Time View
- Team Daily Detail drawer
- Monthly Personal Overview
- Shift Assignment popup

A small ! marker is shown only when the special-mode metadata is incomplete or schedule_status=NEED_REVIEW.
All badge colors follow System Settings. Business logic and calculations are unchanged.
