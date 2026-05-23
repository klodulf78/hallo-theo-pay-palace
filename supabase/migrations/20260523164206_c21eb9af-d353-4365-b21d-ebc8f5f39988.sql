CREATE OR REPLACE VIEW public.portfolio_kpis
WITH (security_invoker = true) AS
SELECT count(*) AS unit_count,
    COALESCE(sum(amount), 0) AS expected_rent,
    COALESCE(sum(amount) FILTER (WHERE status = ANY (ARRAY['paid'::text, 'reconciled'::text])), 0) AS collected,
    COALESCE(sum(amount) FILTER (WHERE status = 'auto_recovered'::text), 0) AS recovered_by_agent,
    COALESCE(sum(amount) FILTER (WHERE status = 'payment_plan'::text), 0) AS in_payment_plan,
    COALESCE(sum(amount) FILTER (WHERE status = 'human_review'::text), 0) AS needs_human_review,
    COALESCE(round(100.0 * count(*) FILTER (WHERE status <> 'human_review'::text)::numeric / NULLIF(count(*), 0)::numeric, 0), 0) AS auto_cleared_rate,
    COALESCE(round(100.0 * count(*) FILTER (WHERE status = 'auto_recovered'::text)::numeric / NULLIF(count(*), 0)::numeric, 0), 0) AS auto_recovered_rate,
    COALESCE(round(100.0 * count(*) FILTER (WHERE status = 'human_review'::text)::numeric / NULLIF(count(*), 0)::numeric, 0), 0) AS human_review_rate
FROM rent_obligations
WHERE month = '2026-05'::text;