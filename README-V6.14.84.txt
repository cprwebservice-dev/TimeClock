TimeClock Enterprise V6.14.84
Employee Portal >1000 Search + pgcrypto Search Path Fix

Changes
- HR Admin Employee Portal search now loads results in pages of 800 rows and combines them.
- Supports more than 1,000 employees without relying on one oversized PostgREST response.
- "เลือกกลุ่มช่างเทคนิค" can therefore select technicians across all loaded pages.
- Fixed Manager > สมาชิกทีม / Portal error:
  function gen_random_bytes(integer) does not exist
- Portal crypto functions now use search_path public, extensions, pg_catalog,
  compatible with Supabase pgcrypto installed in the extensions schema.
- No Attendance, Shift, Work Pattern, Manager Scope, PIN policy, or Request logic changed.

Required
1) Run SQL V6.14.84 migration.
2) Run verification SQL.
3) Deploy this V6.14.84 package.
