TimeClock Enterprise V6.15.27 — 4D.1E Operational Profile Ownership

GitHub Deploy Slim
- Main Web App: Manager-owned CAR / MOTORCYCLE Operational Profile
- Existing Employee.car_team is migration-only; future HR uploads do not own this field
- CAR assignment requires Effective Team in same transaction
- MOTORCYCLE may be assigned without Team
- UNCLASSIFIED employees stay in Manager work queue
- Team Enforcement uses Operational Profile as Source of Truth

Deploy: upload these files to the existing GitHub Pages repository root, replacing files with the same names.
Run the V6.15.27 SQL migration in Supabase before using the new Manager classification UI.
