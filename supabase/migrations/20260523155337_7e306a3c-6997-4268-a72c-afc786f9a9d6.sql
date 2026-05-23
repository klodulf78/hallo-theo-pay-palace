-- Dunning automation (German Mahnprozess) — Stages 1–3 per rent_obligation.
-- Adds dunning state to rent_obligations, a dunning_notices audit table,
-- and policy values + simulated_now (Time-Machine date) on guardrails.

-- ============ rent_obligations: per-claim dunning state ============
ALTER TABLE public.rent_obligations
  ADD COLUMN dunning_stage int NOT NULL DEFAULT 0
    CHECK (dunning_stage BETWEEN 0 AND 3),
  ADD COLUMN default_since date,
  ADD COLUMN accrued_dunning_fees numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN accrued_default_interest numeric(10,2) NOT NULL DEFAULT 0;

-- ============ dunning_notices: one row per stage issued ============
CREATE TABLE public.dunning_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rent_obligation_id uuid NOT NULL REFERENCES public.rent_obligations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  stage int NOT NULL CHECK (stage BETWEEN 1 AND 3),
  issued_date date NOT NULL,
  deadline_date date NOT NULL,
  mahngebuehr numeric(10,2) NOT NULL DEFAULT 0,
  default_interest_snapshot numeric(10,2) NOT NULL DEFAULT 0,
  verzugsnachweis jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rent_obligation_id, stage)
);

CREATE INDEX dunning_notices_tenant_id_idx
  ON public.dunning_notices (tenant_id);
CREATE INDEX dunning_notices_rent_obligation_id_idx
  ON public.dunning_notices (rent_obligation_id);

ALTER TABLE public.dunning_notices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read dunning_notices"
  ON public.dunning_notices FOR SELECT USING (true);

-- ============ guardrails: dunning policy + Time-Machine date ============
ALTER TABLE public.guardrails
  -- Bundesbank Basiszinssatz (decimal, e.g. 0.0327 = 3.27%). § 247 BGB.
  ADD COLUMN basiszinssatz numeric(6,4) NOT NULL DEFAULT 0.0327,
  -- § 288 Abs. 1 BGB consumer surcharge — 5 percentage points above base rate.
  ADD COLUMN default_interest_surcharge numeric(6,4) NOT NULL DEFAULT 0.0500,
  -- Stage fees (Mahngebühren).
  ADD COLUMN dunning_stage1_fee numeric(10,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN dunning_stage2_fee numeric(10,2) NOT NULL DEFAULT 10.00,
  -- Deadline per stage, in Werktage (Mon–Fri).
  ADD COLUMN dunning_stage1_deadline_working_days int NOT NULL DEFAULT 14,
  ADD COLUMN dunning_stage2_deadline_working_days int NOT NULL DEFAULT 14,
  -- Stage 3 only fires when cumulative arrears ≥ N monthly rents.
  ADD COLUMN dunning_stage3_arrears_threshold int NOT NULL DEFAULT 2,
  -- Extra fee on SEPA Rücklastschrift (returned debit).
  ADD COLUMN sepa_chargeback_fee numeric(10,2) NOT NULL DEFAULT 5.00,
  -- "+1 Werktag joker" — buffer after the contractual deadline before default.
  ADD COLUMN default_grace_working_days int NOT NULL DEFAULT 1,
  -- Default contractual due day if tenants.due_day is null
  -- (§ 556b BGB → 3rd working day of the month).
  ADD COLUMN default_due_working_day int NOT NULL DEFAULT 3,
  -- Time-Machine "today" — updated by the Advance-Month flow.
  ADD COLUMN simulated_now date;

-- Touch the existing singleton row so the defaults are applied immediately.
UPDATE public.guardrails SET updated_at = now();
