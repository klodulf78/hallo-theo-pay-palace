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

Server-side data goes through TanStack Start server functions in `src/lib/*.functions.ts` (e.g. `dashboard.functions.ts`, `stripe.functions.ts`, `ai-summary.functions.ts`).

## Required environment variables

| Variable | Used by | Notes |
|---|---|---|
| `SUPABASE_URL` | `src/integrations/supabase/client.server.ts` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | `client.server.ts` | Service role — bypasses RLS, server-only |
| `VITE_SUPABASE_URL` | `src/integrations/supabase/client.ts` | Same as above, exposed to browser |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `client.ts` | Anon key for client-side queries |
| `Stripe_Sandbox` *(or `STRIPE_SECRET_KEY`)* | `src/lib/stripe.server.ts` | Stripe test-mode secret key |
| `Webhook_stripe` *(or `WEBHOOK_STRIPE`)* | `src/lib/stripe.server.ts` | Stripe webhook signing secret |
| `LOVABLE_API_KEY` | `ai-summary.functions.ts`, `payment-recovery-agent.server.ts` | Lovable AI gateway key |

The env var name capitalization here (`Stripe_Sandbox`, `Webhook_stripe`) reflects how the existing `stripe.server.ts` wrapper looks them up.

## Stripe + Test Clocks

The demo uses Stripe Test Clocks to fast-forward time deterministically. `src/lib/stripe.server.ts` exposes `DEMO_START_UNIX` (anchored to 2026-05-01 UTC) plus `paymentMethodForBehavior(behavior)`, which picks a Stripe test PM token based on the tenant's `behavior_profile` column:

| Tenant `behavior_profile` | Stripe test PM | Outcome on charge |
|---|---|---|
| `reliable` | `pm_card_visa` | Succeeds |
| `soft_fail` | `pm_card_chargeDeclinedInsufficientFunds` | Declines |
| `payment_plan` | `pm_card_visa` | Succeeds (used for plan installments) |
| `critical` | `pm_card_chargeCustomerFail` | Always fails |

This produces deterministic real-Stripe outcomes the agent can react to.

To exercise the webhook locally:

```sh
stripe listen --forward-to localhost:8080/api/public/stripe-webhook
```

Note the signing secret it prints and set it as `Webhook_stripe`.

## The payment-recovery agent

`src/lib/payment-recovery-agent.server.ts` runs on every `invoice.payment_failed` webhook. It:

1. Loads tenant context (`name`, `behavior_profile`, `rent_amount`, `risk_score`) from `tenants`.
2. Calls Lovable AI (`google/gemini-3-flash-preview`) with four tools and `tool_choice: "required"`:
   - `retry_payment` — re-attempts the Stripe invoice via `stripe.invoices.pay(...)`
   - `send_reminder` — inserts a `communications` row (channel: email/sms/portal)
   - `offer_payment_plan` — creates a `payment_plans` row + N `payment_plan_installments`
   - `escalate_to_human` — marks the exception `human_needed = true`
3. Updates the relevant `exceptions` row to reflect the chosen action.
4. Logs every step into `agent_actions` so the `/activity` route can show what happened and why.
5. On any failure (no API key, gateway error, no tool call, JSON parse error) falls back to escalation so a case is never lost.

The agent is invoked from `src/routes/api/public/stripe-webhook.ts` inside `onInvoiceFailed`, after the existing exception/payment-event write. It's idempotent against the existing `rent_obligation_id` lookup.

## Database schema

Migrations live in `supabase/migrations/`. Key tables:

| Table | Role |
|---|---|
| `properties` / `units` / `owners` | Real-estate hierarchy |
| `tenants` | One per unit, with `behavior_profile`, `risk_score`, `stripe_customer_id`, `stripe_subscription_id` |
| `sepa_mandates` | SEPA Direct Debit mandates |
| `rent_obligations` | Per-month expected rent; status moves through `expected → paid / auto_recovered / payment_plan / human_review` |
| `payment_events` | Every charge attempt and outcome |
| `exceptions` | Failures that need attention; carries `recommended_action`, `risk_score`, `human_needed` |
| `agent_actions` | Audit log of agent decisions |
| `payment_plans` + `payment_plan_installments` | Multi-part plans the agent can offer |
| `communications` | Outbound messages (reminders, plan offers, escalation notices) |
| `owner_payouts`, `guardrails` | Owner-side accounting and policy bounds |

Aggregate views (`property_kpis`, `portfolio_kpis`, `unit_kpis`) feed the dashboard KPI cards.

## Scripts

```sh
bun run dev          # vite dev server (port 8080)
bun run build        # production build (client + worker SSR bundle)
bun run preview      # preview the built worker
bun run lint         # eslint
bun run format       # prettier
npx tsc --noEmit     # typecheck
```

`bun` is the primary package manager (`bun.lock`). `bunfig.toml` enforces a 24-hour supply-chain guard (`minimumReleaseAge = 86400`); confirm before adding any freshly published dependency.

## Project layout (high level)

```
src/
├── components/               # AppShell + cards/widgets (shadcn/ui composition)
├── integrations/supabase/    # client.ts (browser anon), client.server.ts (service role)
├── lib/
│   ├── stripe.server.ts                # Stripe SDK wrapper + behavior → PM mapping
│   ├── stripe.functions.ts             # TanStack server functions (setup, sync, etc.)
│   ├── dashboard.functions.ts          # KPI queries for the dashboard
│   ├── ai-summary.functions.ts         # Cycle-narrative generator via Lovable AI
│   ├── payment-recovery-agent.server.ts  # ← the agent
│   └── cycle-store.ts                  # Client-side cycle state
├── routes/                   # TanStack file-routes (incl. api/public/stripe-webhook.ts)
└── server.ts                 # Cloudflare Workers entry — wraps TanStack Start
supabase/migrations/          # Schema (3 migrations: tables, views)
```

## Out of scope (intentionally)

This is a focused demo, not a full property-management system. Things explicitly **not** built:

- Owner payouts (table exists, no wiring)
- Email/SMS delivery — the agent's reminder tool only logs into `communications`
- Production deployment / custom domain setup
- Legal dunning workflows
- Tax/withholding reporting

## License

Hackathon project, no license declared.
