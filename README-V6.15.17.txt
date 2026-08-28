TimeClock Enterprise V6.15.17
4B.2A + 4B.2B — Day-off Request Submit Guard + Manager Review

Baseline
- Built on the V6.15.16 package, which itself is based on V6.15.15 End-to-End Consistency Audit.
- Existing V6.15.10 atomic request apply remains the authoritative Schedule writer.
- Existing V6.15.15 consistency protections remain intact.

4B.2A — Employee Portal Submit Request
- Adds a database-level guard on Employee Portal DAYOFF_SWAP requests.
- Applies to both new requests and Portal edits, so validation cannot be bypassed by a different client write path.
- Rechecks future-date rules, same-month swap, different source/target dates, System Period schedule-open state, duplicate/conflict rules, day-off quota, current source/target workday state, and shift-pair availability.
- ADD_DAYOFF uses the existing employee/month advisory lock so two simultaneous requests cannot reserve the final quota day.
- Stores a server-owned V6.15.17 validation snapshot inside request.detail for traceability.
- Existing Portal request flow still creates PENDING and routes the request to the active Manager.

4B.2B — Manager Review
- DAYOFF_SWAP / ADD_DAYOFF action is shown as “ตรวจและจัดวันหยุด”.
- Before any existing atomic apply, Manager receives a fresh Backend preflight card.
- Review uses the current Schedule and current quota rather than trusting the employee submit snapshot alone.
- Shows employee, request type, reason, source date/current shift/proposed replacement, target date/current shift/proposed OFF shift, monthly quota, used/balance, other pending ADD requests, and requestable balance for this request.
- Rechecks System Period, duplicate/conflict state, Schedule Guard, Day-off Quota Guard and Night/Rest validator when available.
- Blocking conditions disable the confirm action.
- Manager can refresh the review without closing the Request Center.
- Immediately before confirm, Backend preflight runs again; if shift/quota/eligibility changed, the refreshed review replaces the stale one.
- The V6.15.17 Review RPC itself is read-only: it does not write Schedule and does not resolve the request.
- After a clean review, the existing V6.15.10 atomic workflow remains the writer. Core atomic apply behavior is intentionally not rewritten in this version.

UI / Cache
- Main application build: V6.15.17
- Main app cache query: 6.15.17-20260828a
- Employee Portal: V6.15.17
- Portal Service Worker cache: V6.15.17a

Database deployment
1. Run: SQL_ที่ต้องรัน_V6.15.17_4B2A_4B2B_DAYOFF_REQUEST_MANAGER_REVIEW.sql
2. Run: SQL_สำหรับตรวจสอบ_V6.15.17_4B2A_4B2B_DAYOFF_REQUEST_MANAGER_REVIEW.sql
3. Verification rows should return PASS.

Next scope
- 4B.2C: audit/strengthen the actual Approve -> Schedule mutation path for 5D/6D compatibility, night/rest rules, atomic rollback, Change Log and post-apply refresh/sync.
