
DROP VIEW IF EXISTS public.portfolio_kpis;
DROP VIEW IF EXISTS public.property_kpis;
DROP VIEW IF EXISTS public.unit_kpis;

CREATE VIEW public.property_kpis WITH (security_invoker = true) AS
SELECT
  property_id,
  count(*) AS unit_count,
  sum(amount) AS expected_rent,
  sum(amount) FILTER (WHERE status IN ('paid','reconciled')) AS collected,
  sum(amount) FILTER (WHERE status='auto_recovered') AS recovered_by_agent,
  sum(amount) FILTER (WHERE status='payment_plan') AS in_payment_plan,
  sum(amount) FILTER (WHERE status='human_review') AS needs_human_review,
  round(100.0*count(*) FILTER (WHERE status<>'human_review')/count(*),0) AS auto_cleared_rate,
  round(100.0*count(*) FILTER (WHERE status='auto_recovered')/count(*),0) AS auto_recovered_rate,
  round(100.0*count(*) FILTER (WHERE status='human_review')/count(*),0) AS human_review_rate
FROM public.rent_obligations
WHERE month='2026-05'
GROUP BY property_id;

CREATE VIEW public.portfolio_kpis WITH (security_invoker = true) AS
SELECT
  count(*) AS unit_count,
  sum(amount) AS expected_rent,
  sum(amount) FILTER (WHERE status IN ('paid','reconciled')) AS collected,
  sum(amount) FILTER (WHERE status='auto_recovered') AS recovered_by_agent,
  sum(amount) FILTER (WHERE status='payment_plan') AS in_payment_plan,
  sum(amount) FILTER (WHERE status='human_review') AS needs_human_review,
  round(100.0*count(*) FILTER (WHERE status<>'human_review')/count(*),0) AS auto_cleared_rate,
  round(100.0*count(*) FILTER (WHERE status='auto_recovered')/count(*),0) AS auto_recovered_rate,
  round(100.0*count(*) FILTER (WHERE status='human_review')/count(*),0) AS human_review_rate
FROM public.rent_obligations
WHERE month='2026-05';

CREATE VIEW public.unit_kpis WITH (security_invoker = true) AS
SELECT unit_id, sum(amount) AS expected_rent, max(status) AS status
FROM public.rent_obligations
WHERE month='2026-05'
GROUP BY unit_id;
