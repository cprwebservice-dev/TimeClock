TimeClock Enterprise V6.15.02
Portal Calendar Date Range + Cache + Raw Punch RPC Hotfix

Fixes
1) PORTAL_DATE_RANGE_MAX_63_DAYS
   - Home range and selected-month range are now ALWAYS queried separately.
   - They are never unioned into a request wider than 63 days.

2) Stale Portal build/cache
   - portal.js/css bumped to 6.15.02a.
   - Service Worker uses skipWaiting + clients.claim.
   - register() uses updateViaCache:'none'.
   - Old portal caches are removed immediately on activation.

3) Raw Punch RPC
   - SQL is self-contained and recreates ta_portal_get_my_raw_punches_v61501
     as VOLATILE + SECURITY DEFINER + anon/authenticated EXECUTE.
   - PostgREST schema cache reload notification included.

No changes to Attendance calculations, Schedule rules, Time Certification calculations,
Raw Punch records, or Manager scope.
