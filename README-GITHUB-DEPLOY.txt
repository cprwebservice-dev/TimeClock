TimeClock Enterprise V6.15.29 — Scoped Team Enforcement Rollout

Frontend + backend rollout redesign on top of V6.15.28 FIX3.

Key changes
- HR Admin can enable Team Enforcement by selected TEAM, entire ORG, or GLOBAL.
- Effective Date determines which schedule dates are enforced.
- TEAM override has highest priority, then ORG, then GLOBAL.
- Pilot rollout can start with ready teams without waiting for every team in the organization.
- Team readiness is checked before activation.
- CAR remains 3–5 members, MOTORCYCLE team optional, SUPPORT minimum 1.
- Disable requires a reason and every change is kept in an immutable event ledger.
- Team Master shows current Enforcement status per team.
- Managers can view rollout status; only HR Admin can change it.
- Existing V6.15.25 RPC names remain as compatibility wrappers for GLOBAL mode.

Deploy
1) Run SQL_ที่ต้องรัน_V6.15.29_SCOPED_TEAM_ENFORCEMENT_ROLLOUT.sql in Supabase.
2) Run SQL_สำหรับตรวจสอบ_V6.15.29_SCOPED_TEAM_ENFORCEMENT_ROLLOUT.sql.
3) Upload all 13 web files in this folder to the GitHub repository root.
4) Hard Refresh the web app.

SQL files are distributed separately and are not included in this GitHub web package.
