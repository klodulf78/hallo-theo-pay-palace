
-- Drop old demo tables
DROP TABLE IF EXISTS public.rent_obligations CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;
DROP TABLE IF EXISTS public.properties CASCADE;

-- ============ TABLES ============

CREATE TABLE public.owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  payout_iban text,
  management_fee_rate numeric(5,4),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  street text,
  city text,
  postal_code text,
  lat numeric(9,6),
  lng numeric(9,6),
  owner_id uuid REFERENCES public.owners(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  label text NOT NULL,
  floor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  rent_amount numeric(10,2) NOT NULL,
  due_day int,
  behavior_profile text CHECK (behavior_profile IN ('reliable','soft_fail','payment_plan','critical')),
  risk_score int,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sepa_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  mandate_reference text,
  iban text,
  status text CHECK (status IN ('active','pending','revoked','expired')),
  signed_date date,
  stripe_mandate_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rent_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  month text NOT NULL,
  amount numeric(10,2) NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','paid','reconciled','failed','auto_recovered','payment_plan','human_review')),
  stripe_invoice_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rent_obligation_id uuid NOT NULL REFERENCES public.rent_obligations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('charged','succeeded','failed','retry')),
  amount numeric(10,2),
  failure_reason text CHECK (failure_reason IN ('insufficient_funds','invalid_mandate','chargeback_dispute')),
  source text CHECK (source IN ('stripe_webhook','simulation')),
  stripe_event_id text,
  occurred_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rent_obligation_id uuid NOT NULL REFERENCES public.rent_obligations(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type text CHECK (type IN ('payment_failed','repeated_failure','invalid_mandate','dispute')),
  severity text CHECK (severity IN ('low','medium','high','critical')),
  risk_score int,
  risk_breakdown jsonb,
  recommended_action text CHECK (recommended_action IN ('retry','reminder','payment_plan','escalate')),
  status text CHECK (status IN ('open','in_progress','resolved','escalated')),
  human_needed boolean,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id uuid REFERENCES public.exceptions(id) ON DELETE SET NULL,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  action_type text CHECK (action_type IN ('charge','retry','reminder','offer_payment_plan','escalate','reconcile')),
  reason text,
  policy_basis text,
  result text CHECK (result IN ('success','failed','pending')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rent_obligation_id uuid NOT NULL REFERENCES public.rent_obligations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  total_amount numeric(10,2) NOT NULL,
  installment_count int,
  status text CHECK (status IN ('offered','accepted','active','completed','defaulted')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.payment_plan_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_plan_id uuid NOT NULL REFERENCES public.payment_plans(id) ON DELETE CASCADE,
  sequence int NOT NULL,
  amount numeric(10,2) NOT NULL,
  due_date date,
  status text CHECK (status IN ('upcoming','paid','overdue')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  exception_id uuid REFERENCES public.exceptions(id) ON DELETE SET NULL,
  channel text CHECK (channel IN ('email','sms','portal')),
  message_type text CHECK (message_type IN ('reminder','payment_plan_offer','confirmation','escalation_notice')),
  body text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.owner_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES public.owners(id) ON DELETE CASCADE,
  month text NOT NULL,
  gross_collected numeric(10,2),
  management_fee numeric(10,2),
  withheld_amount numeric(10,2),
  expected_payout numeric(10,2),
  status text CHECK (status IN ('pending','scheduled','paid')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.guardrails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  max_retry_attempts int,
  max_installments int,
  max_auto_plan_amount numeric(10,2),
  critical_risk_threshold int,
  escalation_rules jsonb,
  stripe_test_clock_id text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ RLS ============
ALTER TABLE public.owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sepa_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rent_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_plan_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardrails ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read owners" ON public.owners FOR SELECT USING (true);
CREATE POLICY "public read properties" ON public.properties FOR SELECT USING (true);
CREATE POLICY "public read units" ON public.units FOR SELECT USING (true);
CREATE POLICY "public read tenants" ON public.tenants FOR SELECT USING (true);
CREATE POLICY "public read sepa_mandates" ON public.sepa_mandates FOR SELECT USING (true);
CREATE POLICY "public read rent_obligations" ON public.rent_obligations FOR SELECT USING (true);
CREATE POLICY "public read payment_events" ON public.payment_events FOR SELECT USING (true);
CREATE POLICY "public read exceptions" ON public.exceptions FOR SELECT USING (true);
CREATE POLICY "public read agent_actions" ON public.agent_actions FOR SELECT USING (true);
CREATE POLICY "public read payment_plans" ON public.payment_plans FOR SELECT USING (true);
CREATE POLICY "public read payment_plan_installments" ON public.payment_plan_installments FOR SELECT USING (true);
CREATE POLICY "public read communications" ON public.communications FOR SELECT USING (true);
CREATE POLICY "public read owner_payouts" ON public.owner_payouts FOR SELECT USING (true);
CREATE POLICY "public read guardrails" ON public.guardrails FOR SELECT USING (true);

-- ============ VIEWS ============
CREATE OR REPLACE VIEW public.property_kpis AS
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

CREATE OR REPLACE VIEW public.portfolio_kpis AS
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

CREATE OR REPLACE VIEW public.unit_kpis AS
SELECT unit_id, sum(amount) AS expected_rent, max(status) AS status
FROM public.rent_obligations
WHERE month='2026-05'
GROUP BY unit_id;
