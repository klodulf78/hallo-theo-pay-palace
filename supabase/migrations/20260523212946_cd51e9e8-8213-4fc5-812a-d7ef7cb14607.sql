ALTER TABLE public.rent_obligations
  ADD COLUMN IF NOT EXISTS dunning_stage int NOT NULL DEFAULT 0 CHECK (dunning_stage BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS default_since date,
  ADD COLUMN IF NOT EXISTS accrued_dunning_fees numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accrued_default_interest numeric(10,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.dunning_notices (
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

CREATE INDEX IF NOT EXISTS dunning_notices_tenant_id_idx ON public.dunning_notices (tenant_id);
CREATE INDEX IF NOT EXISTS dunning_notices_rent_obligation_id_idx ON public.dunning_notices (rent_obligation_id);

ALTER TABLE public.dunning_notices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public read dunning_notices" ON public.dunning_notices;
CREATE POLICY "public read dunning_notices" ON public.dunning_notices FOR SELECT USING (true);

ALTER TABLE public.guardrails
  ADD COLUMN IF NOT EXISTS basiszinssatz numeric(6,4) NOT NULL DEFAULT 0.0327,
  ADD COLUMN IF NOT EXISTS default_interest_surcharge numeric(6,4) NOT NULL DEFAULT 0.0500,
  ADD COLUMN IF NOT EXISTS dunning_stage1_fee numeric(10,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS dunning_stage2_fee numeric(10,2) NOT NULL DEFAULT 10.00,
  ADD COLUMN IF NOT EXISTS dunning_stage1_deadline_working_days int NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS dunning_stage2_deadline_working_days int NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS dunning_stage3_arrears_threshold int NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS sepa_chargeback_fee numeric(10,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS default_grace_working_days int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS default_due_working_day int NOT NULL DEFAULT 3;

UPDATE public.guardrails SET updated_at = now();