TimeClock Enterprise V6.15.27 FIX1
4D.1E Operational Profile Ownership — Fresh Manager Classification

GitHub FULL deploy package.
- HR Employee upload no longer seeds Operational Profile from legacy employees.car_team.
- Existing legacy car_team remains audit/legacy data only.
- Manager classifies technicians into CAR / MOTORCYCLE and manages team membership.
- Runtime source of truth is Operational Profile + Team Membership.

Upload all files in this folder to the repository root.
Run the V6.15.27 FIX1 SQL migration separately in Supabase before use.
