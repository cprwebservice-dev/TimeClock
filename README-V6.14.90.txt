TimeClock Enterprise V6.14.90
Employee Portal -> Manager Request Center Scope Alignment

Fixes
- Manager Request Center now finds requests by canonical Manager Scope instead of relying only on the one manager_email stored in the request.
- Approve / Reject / In Review authorization uses the same canonical scope.
- This aligns Employee Portal requests with Manager > สมาชิกทีม / Portal.
- Request Center default end date is today +31 days so advance special-work requests are visible.
- Existing requests do not need to be recreated.
- No Attendance or Shift calculation logic changed.

Required
1. Run V6.14.90 SQL.
2. Run verification SQL.
3. Deploy V6.14.90 web package.
