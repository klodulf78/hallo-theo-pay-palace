---
name: supabase-data
description: >-
  Data layer for the hallo flow app — Supabase Postgres schema, the
  rent_obligation status state machine, KPI views, the service-role vs anon
  client split, and the TanStack Start server-function (*.functions.ts) pattern.
  Use when reading/writing any table (tenants, rent_obligations, exceptions,
  agent_actions, payment_plans, communications, …), adding a migration, wiring a
  server function, or shaping data for the UI.
---

# Supabase data layer (hallo flow)

## Two clients — pick the right one
- **Server, service-role (bypasses RLS):** `import { supabaseAdmin } from
  "@/integrations/supabase/client.server"`. Use in every `*.functions.ts` server function and
  in `*.server.ts` modules. Driven by `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- **Browser, anon (RLS-bound):** `src/integrations/supabase/client.ts`, from
  `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`. Read-only public-read policies exist
  on `properties` / `tenants` / `rent_obligations`. Never expose the service-role key client-side.
- Generated types: `src/integrations/supabase/types.ts`.

## Server-function pattern (how data reaches the UI)
Use TanStack Start server functions, not raw client queries from components:
```ts
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getThing = createServerFn({ method: "GET" }).handler(async () => { /* ... */ });
```
Examples to follow: `dashboard.functions.ts` (`getDashboardKpis`), `stripe.functions.ts`
(`setupStripeDemo`, `advanceStripeMonth`, `getStripeStatus`). The dashboard returns the
`DashboardKpis` shape — extend that type rather than inventing parallel shapes.

## Schema (migrations in `supabase/migrations/`)
Core real-estate + payment tables (key columns):
- `properties` (id, name, address, owner_name)
- `units` / `owners` — hierarchy; `owner_payouts` — owner-side preview only.
- `tenants` (id, property_id, unit, name, email, rent_amount, **behavior_profile** ∈
  reliable|soft_fail|payment_plan|critical, **risk_score**, mandate_status,
  stripe_customer_id, stripe_subscription_id)
- `sepa_mandates` — SEPA Direct Debit mandates.
- `rent_obligations` (id, tenant_id, property_id, month e.g. `"2026-05"`, amount, due_date,
  **status**) — see state machine below.
- `payment_events` — every charge attempt + outcome.
- `exceptions` (recommended_action ∈ retry|reminder|payment_plan|escalate, risk_score,
  severity ∈ low|medium|high|critical, **human_needed**, status ∈ open|in_progress|resolved|escalated)
- `agent_actions` (exception_id, tenant_id, unit_id, action_type ∈
  charge|retry|reminder|offer_payment_plan|escalate|reconcile, result ∈ success|failed|pending,
  reason, policy_basis) — the audit log behind `/activity`.
- `payment_plans` (tenant_id, rent_obligation_id, total_amount, installment_count, status) +
  `payment_plan_installments` (payment_plan_id, sequence, amount, due_date, status).
- `communications` (tenant_id, exception_id, channel ∈ email|sms|portal, message_type, body) —
  the reminder/plan-offer/escalation tool only **logs** here; no real email/SMS is sent.
- `guardrails` — policy bounds + `stripe_test_clock_id`.

## rent_obligation status state machine
`pending`/`expected` → on event:
- success → `paid` → `reconciled`
- retry succeeds → `auto_recovered` (then reconciled)
- plan offered/accepted → `payment_plan`
- repeated failure / over guardrail → `human_review`
- hard failure with no recovery → `failed`

Allowed values (check constraint): `paid, auto_recovered, payment_plan, human_review, pending,
failed, reconciled`.

## KPI views (feed the dashboard — don't recompute by hand where a view exists)
- `portfolio_kpis` (single row): `unit_count, expected_rent, collected, recovered_by_agent,
  in_payment_plan, needs_human_review, auto_cleared_rate`.
- `property_kpis`, `unit_kpis` — same idea, grouped.

## Conventions
- Migrations are timestamp-named SQL files in `supabase/migrations/`; add a new file rather
  than editing an applied one. RLS is enabled — add a public-read policy for any new
  client-readable table.
- Money is stored in euros as `numeric` (Stripe wants integer cents — multiply by 100 at the
  Stripe boundary only).
- Fallback per PRD: if Supabase is unavailable, an in-memory/JSON store with the **same shape**
  keeps the demo alive.
