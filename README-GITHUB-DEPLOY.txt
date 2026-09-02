TimeClock Enterprise V6.15.29 FIX3 — Compact Team Workspace

TimeClock Enterprise V6.15.29 FIX2
Enforcement Reader Stable + Membership Guidance

Base: V6.15.29 FIX1 Modern Team Workspace

Changes:
- Team Workspace background load no longer calls ta_get_team_enforcement_state_v61529 repeatedly.
- Main Enforcement status derives from rollout rows, reducing redundant RPC calls.
- Rollout modal uses state summary as supplemental data and falls back safely.
- Membership Impact Preview gives an actionable next step when CAR team falls below minimum 3 or exceeds maximum 5.
- Backend SQL patch changes ta_get_team_enforcement_state_v61529 to return safe JSON instead of HTTP 500 when actor/session cannot be resolved.

Deploy all 13 files to the repository root, run the FIX2 SQL patch, then Hard Refresh.


V6.15.29 FIX5 — Readable Compact Team Workspace
- Increased Team Workspace typography for comfortable daily use.
- Kept compact layout and existing backend behavior unchanged.
- No additional SQL required if V6.15.29 FIX2 backend is already installed.

V6.15.29 FIX5: Operational Profile แยกโหมด “กำหนดรูปแบบ” และ “เปลี่ยนรูปแบบ”; โหมดเปลี่ยนจะไม่ให้เลือกปลายทางซ้ำกับต้นทาง และแนะนำให้ใช้ TEAM MEMBERSHIP สำหรับการย้ายทีมในรูปแบบเดิม
