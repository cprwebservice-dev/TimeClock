Time-Clock Enterprise V6.15.28 FIX1 — Dual-pane Team Membership UX

GitHub deploy package (runtime only).
- Guided Team Workflow 1–5
- Operational types: CAR / MOTORCYCLE / SUPPORT
- CAR capacity: 3–5 members
- Manager-owned Operational Profile (no legacy employees.car_team seed)
- HR Admin immediate change inbox / acknowledgement
- Team Schedule context supports SUPPORT

Deploy all 13 files to repository root, then Hard Refresh.
Run the separate V6.15.28 SQL migration before using the new Team Workspace.


FIX1 frontend UX changes:
- TEAM MEMBERSHIP redesigned as dual-pane transfer workspace.
- Left pane = available/source employees; right pane = members after save.
- Multi-select transfer in/out, team capacity, change summary and impact preview before save.
- No additional SQL is required if V6.15.28 SQL has already been applied.
