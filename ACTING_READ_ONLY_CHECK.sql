-- OPTIONAL: run only if Acting is still empty after deploying FIX16CD.
-- Read-only; no assignment dates, role, or status are changed.
-- Return exported results. Does not request names, emails, or employee records.
SELECT timezone('Asia/Bangkok',now())::date AS today_bangkok,
 count(*) AS total_assignments,
 count(*) FILTER(WHERE effective_to<date_trunc('month',timezone('Asia/Bangkok',now()))::date) AS ended_before_current_month,
 count(*) FILTER(WHERE coalesce(is_active,true) AND timezone('Asia/Bangkok',now())::date BETWEEN effective_from AND effective_to) AS currently_active,
 count(*) FILTER(WHERE effective_from>timezone('Asia/Bangkok',now())::date) AS future_assignments,
 count(*) FILTER(WHERE is_active=false) AS disabled_assignments,
 count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM public.ta_org_units o WHERE o.org_id=a.org_unit_id)) AS missing_org_reference
FROM public.ta_acting_manager_assignments_v61529f14 a;
SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname='ta_get_acting_manager_assignments_v61529f14b';
