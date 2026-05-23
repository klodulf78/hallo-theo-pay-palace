# hallo flow

Autonomous rent-collection layer for property managers. A property manager runs the monthly rent cycle with almost no manual work: most payments auto-clear, the AI agent retries soft failures, offers a payment plan when a tenant can't pay in full, and only escalates true exceptions for a human to handle.

## Stack

- **Frontend / SSR:** TanStack Start (file-based routing) + React 19 + Tailwind v4 + shadcn/ui
- **Deployment:** Cloudflare Workers (via `wrangler.jsonc`, `nodejs_compat`)
- **Data:** Supabase Postgres (14-table schema), Supabase Auth for tenants and managers
- **Payments:** Stripe Subscriptions + Invoices in test mode, with Test Clocks driving the monthly cycle
- **AI:** Lovable AI Gateway (OpenAI-compatible) for both the cycle-summary writer and the payment-recovery agent

## Quick start

```sh
bun install        # or `npm install` if you don't have bun
cp .env.example .env   # then fill in keys (see below)
bun run dev
```

Open `http://localhost:8080/`. The app shell loads with these primary surfaces:

| Route | Purpose |
|---|---|
| `/` | Landing / dashboard overview |
| `/activity` | Agent activity log — every decision the agent made and why |
| `/exceptions` | Exception queue — payments that need attention, with risk score and recommended action |
| `/tenant-portal` | Tenant-facing view: see status, accept a payment plan |
| `/api/public/stripe-webhook` | Stripe webhook entry (no UI) |

Server-side data goes through TanStack Start server functions in `src/lib/*.functions.ts`: reads — `dashboard.functions.ts`, `exceptions.functions.ts`, `tenant-portal.functions.ts`, `owner.functions.ts`; actions — `stripe.functions.ts` (Stripe setup / Advance Month), `recovery-actions.functions.ts` (accept plan, exception-queue actions), `seed.functions.ts`; plus `ai-summary.functions.ts` (cycle narrative).

**To run the full demo end-to-end** (seed → Stripe setup → Advance Month → tenant accepts a plan), follow **[`DEMO.md`](./DEMO.md)**.

## Required environment variables

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | `src/integrations/supabase/client.server.ts` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `client.server.ts` | Service role — bypasses RLS, server-only |
| `VITE_SUPABASE_URL` | `src/integrations/supabase/client.ts` | Same as above, exposed to browser |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `client.ts` | Anon key for client-side queries |
| `Stripe_Sandbox` *(or `STRIPE_SECRET_KEY`)* | `src/lib/stripe.server.ts` | Stripe test-mode secret key |
| `Webhook_stripe` *(or `WEBHOOK_STRIPE` / `STRIPE_WEBHOOK_KEY`)* | `src/lib/stripe.server.ts` | Stripe webhook signing secret — use the `whsec_…` that `stripe listen` prints |
| `LOVABLE_API_KEY` | `ai-summary.functions.ts`, `payment-recovery-agent.server.ts` | Lovable AI gateway key. **Optional** — without it the agent uses a deterministic policy engine (retry/plan/escalate by risk); only the AI-written cycle summary is skipped |

The env var name capitalization here (`Stripe_Sandbox`, `Webhook_stripe`) reflects how the existing `stripe.server.ts` wrapper looks them up.

## Stripe + Test Clocks

The demo uses Stripe Test Clocks to fast-forward time deterministically. `src/lib/stripe.server.ts` exposes `DEMO_START_UNIX` (anchored to 2026-05-01 UTC) plus `paymentMethodForBehavior(behavior)`, which picks a Stripe test PM token based on the tenant's `behavior_profile` column:

| Tenant `behavior_profile` | Stripe test PM | Outcome on charge |
|---|---|---|
| `reliable` | `pm_card_visa` | Succeeds |
| `soft_fail` | `pm_card_chargeDeclinedInsufficientFunds` | Declines → agent retries with a good card → recovers |
| `payment_plan` | `pm_card_chargeDeclinedInsufficientFunds` | Declines → agent offers a 2-part plan (high risk) |
| `critical` | `pm_card_chargeCustomerFail` | Always fails → agent escalates |

`soft_fail` and `payment_plan` use the **same declining card**; the agent differentiates them by risk score (low → retry to recovery; high → offer plan). The retry uses `recoverInvoiceWithGoodCard` to swap to a working card so the soft-fail clears.

This produces deterministic real-Stripe outcomes the agent can react to.

To exercise the webhook locally:

```sh
stripe listen --forward-to localhost:8080/api/public/stripe-webhook
```

Note the signing secret it prints and set it as `Webhook_stripe` (or `STRIPE_WEBHOOK_KEY`).

## The payment-recovery agent

`src/lib/payment-recovery-agent.server.ts` runs on every `invoice.payment_failed` webhook. It:

1. Loads tenant context from `tenants` and computes an **explainable risk score** (`computeRiskScore`) from granular signals (overdue days, failed attempts, prior history, mandate, outstanding amount), floored by the tenant's behavior-profile tier so the score reflects the known risk band. The breakdown is persisted to `exceptions.risk_breakdown`.
2. Chooses one action. The **deterministic policy engine** (`decidePolicyAction`) is the baseline — `risk/attempt/amount → retry | offer_payment_plan | escalate` within guardrails (max 2 retries, 2-part plan, €1,500 auto-cap, critical ≥ 80). If `LOVABLE_API_KEY` is set, an LLM tool-use loop (`google/gemini-3-flash-preview`, `tool_choice: "required"`) runs first; on any failure (no key, gateway error, no tool call, bad JSON) it falls back to the deterministic decision, and ultimately to escalation, so a case is never lost.
3. Executes the action: `retry_payment` swaps to a working card and pays via `recoverInvoiceWithGoodCard(...)` (so soft-fails actually recover); `offer_payment_plan` creates a `payment_plans` row + installments; `send_reminder` / `escalate_to_human` write `communications` / flip `human_needed`.
4. Updates the `exceptions` row and logs every step to `agent_actions` (with `reason` + `policy_basis`) so `/activity` shows what happened and why.

The agent is invoked from `src/routes/api/public/stripe-webhook.ts` inside `onInvoiceFailed`, idempotent against the `rent_obligation_id` lookup. Tenant- and manager-initiated actions reuse the same `execute*` helpers via `src/lib/recovery-actions.functions.ts`: `acceptPaymentPlan(planId)` (tenant accepts an offered plan) and `runExceptionAction(exceptionId, action)` (the Exception Queue's retry / reminder / offer-plan / escalate / resolve buttons).

## Database schema

Migrations live in `supabase/migrations/`. Key tables:

| Table | Role |
|---|---|
| `properties` / `units` / `owners` | Real-estate hierarchy |
| `tenants` | One per unit, with `behavior_profile`, `risk_score`, `stripe_customer_id`, `stripe_subscription_id` |
| `sepa_mandates` | SEPA Direct Debit mandates |
| `rent_obligations` | Per-month rent; status moves `pending → paid / auto_recovered / payment_plan / human_review / reconciled` |
| `payment_events` | Every charge attempt and outcome |
| `exceptions` | Failures that need attention; carries `recommended_action`, `risk_score`, `human_needed` |
| `agent_actions` | Audit log of agent decisions |
| `payment_plans` + `payment_plan_installments` | Multi-part plans the agent can offer |
| `communications` | Outbound messages (reminders, plan offers, escalation notices) |
| `owner_payouts`, `guardrails` | Owner-side accounting and policy bounds |

Aggregate views (`property_kpis`, `portfolio_kpis`, `unit_kpis`) exist, but `getDashboardKpis` computes the KPI cards directly from `rent_obligations` for the **active month** (the latest month present), so the dashboard stays correct as the Test Clock advances.

## Scripts

```sh
bun run dev          # vite dev server (port 8080)
bun run build        # production build (client + worker SSR bundle)
bun run preview      # preview the built worker
bun run lint         # eslint
bun run format       # prettier
npx tsc --noEmit     # typecheck
bun scripts/verify-agent.ts   # offline check of the agent's risk + decision policy
```

`bun` is the primary package manager (`bun.lock`). `bunfig.toml` enforces a 24-hour supply-chain guard (`minimumReleaseAge = 86400`); confirm before adding any freshly published dependency.

## Project layout (high level)

```
src/
├── components/               # AppShell + cards/widgets (shadcn/ui composition)
├── integrations/supabase/    # client.ts (browser anon), client.server.ts (service role)
├── lib/
│   ├── stripe.server.ts                  # Stripe SDK wrapper + behavior→PM map + recoverInvoiceWithGoodCard
│   ├── stripe.functions.ts               # setupStripeDemo / advanceStripeMonth / getStripeStatus
│   ├── seed.functions.ts                 # seedDemoData (12-tenant roster, idempotent)
│   ├── dashboard.functions.ts            # getDashboardKpis + getActiveMonth
│   ├── exceptions.functions.ts           # getExceptions / getAgentActions
│   ├── tenant-portal.functions.ts        # getTenantPortal
│   ├── owner.functions.ts                # getOwnerPreview
│   ├── recovery-actions.functions.ts     # acceptPaymentPlan / runExceptionAction
│   ├── ai-summary.functions.ts           # Cycle-narrative generator via Lovable AI
│   ├── payment-recovery-agent.server.ts  # ← the agent (risk + policy + execute* helpers)
│   └── cycle-store.ts                    # Client-side cycle state
├── routes/                   # TanStack file-routes: index/activity/exceptions/tenant-portal + api/public/stripe-webhook.ts
└── server.ts                 # Cloudflare Workers entry — wraps TanStack Start
scripts/verify-agent.ts       # offline checks of the agent's risk + decision policy
supabase/migrations/          # Schema (3 migrations: tables, views)
```

## Out of scope (intentionally)

This is a focused demo, not a full property-management system. Things explicitly **not** built:

- Owner payouts — only a read-only **preview** (`getOwnerPreview` + dashboard card); no real Connect transfers
- Email/SMS delivery — the agent's reminder tool only logs into `communications`
- Production deployment / custom domain setup
- Legal dunning workflows
- Tax/withholding reporting

## License

Hackathon project, no license declared.
