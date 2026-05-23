# hallo flow

An autonomous rent-collection layer for property managers. Built as a hackathon demo.

A property manager runs a monthly rent cycle with almost no manual work: most payments auto-clear, the agent retries soft failures, offers a payment plan when a tenant can't pay in full, and only escalates true exceptions for a human. The whole flow is visible end-to-end in a polished admin dashboard plus a tenant portal.

```
/                  → Landing page (links to demo surfaces)
/admin             → Property-manager dashboard — Advance Month runs the cycle
/tenant/kaya       → Tenant portal — Kaya accepts the agent-offered payment plan
```

## Two modes

The app runs in either of two modes, selected by env vars:

| Mode | Stripe | Supabase | Claude | What happens when you click "Advance Month" |
|---|---|---|---|---|
| **offline** (default) | Mock | None | Rule engine | A deterministic in-memory reducer simulates the cycle. No external calls. Works instantly with no setup. |
| **live** | Test mode + SEPA + Test Clocks | Postgres + Realtime | `claude-opus-4-7` with tool use | Real PaymentIntents fire; webhooks call the agent; the agent picks a tool; DB writes stream back to the UI via Supabase Realtime. |

Use offline mode to explore the UX or run the demo without keys. Use live mode to see the real moving parts.

## Quick start — offline mode

No keys needed.

```sh
npm install
npm run dev
```

Open `http://localhost:8080/admin` and click **Advance Month**. You should see:

- Expected rent **€14,800** across 12 tenants
- 8 tenants paid immediately (~€9,580)
- 2 soft failures auto-recovered by retry (~€2,550)
- 1 tenant (Kaya) offered a 2-part payment plan (€1,200)
- 1 tenant (Richter) escalated to human review (€1,470)

Then visit `/tenant/kaya` and click **Accept Payment Plan** — the admin dashboard updates in real time.

## Quick start — live mode

You need:

- A Supabase project (free tier is fine)
- A Stripe account in **test mode** with SEPA Direct Debit enabled
- An Anthropic API key
- The `stripe` CLI for local webhook forwarding

### 1. Set up Supabase

In the Supabase SQL editor, run:

1. `supabase/migrations/0001_init.sql` — creates 7 tables and enables Realtime on the relevant ones.
2. `supabase/seed.sql` — inserts the 12 demo tenants.

### 2. Configure env

```sh
cp .dev.vars.example .dev.vars        # worker secrets (gitignored)
cp .env.local.example .env.local      # browser env (gitignored)
```

Fill in both files with your real keys. `DEMO_MODE=live` must be set in `.dev.vars` **and** `VITE_DEMO_MODE=live` must be set in `.env.local`.

### 3. Bootstrap Stripe customers + mandates

This creates a Stripe customer, attaches a SEPA test mandate, and provisions a Test Clock for each tenant. Idempotent — safe to re-run.

```sh
npx tsx scripts/setup-live.ts
```

### 4. Run

In two terminals:

```sh
# Terminal 1
npm run dev

# Terminal 2 — note the signing secret it prints; paste it into .dev.vars as STRIPE_WEBHOOK_SECRET
stripe listen --forward-to localhost:8080/api/stripe/webhook
```

Click **Advance Month** on `/admin`. Watch the activity log fill in over the next few seconds as Stripe webhooks fire and the Claude agent picks recovery actions.

## Architecture

**Stack:** TanStack Start (SSR, file-based routing) + React 19 + TanStack Query + Tailwind v4 + shadcn/ui, deployed to Cloudflare Workers.

```
                ┌─────────────────────────────────────────────────┐
                │  /admin  (React UI + Supabase Realtime listen)  │
                └─────────────────────────────────────────────────┘
                                       ▲
                                       │ realtime upserts
                                       │
┌──────────────┐   click   ┌───────────┴─────────────┐
│  Advance     ├──────────▶│ POST /api/cycle/advance │
│  Month       │           └───────────┬─────────────┘
└──────────────┘                       │  for each tenant:
                                       ▼
                          ┌────────────────────────┐    ┌──────────┐
                          │ Stripe PaymentIntents  │───▶│  Stripe  │
                          │ (off-session, SEPA)    │    │  Test    │
                          └────────────┬───────────┘    │  Mode    │
                                       │ webhook        └──────────┘
                                       ▼
                       ┌──────────────────────────────────┐
                       │ POST /api/stripe/webhook         │
                       │  - signature verify              │
                       │  - idempotency via stripe_events │
                       │  - on payment_failed →           │
                       └──────────────────┬───────────────┘
                                          │
                                          ▼
                          ┌────────────────────────────────┐
                          │ runAgentForPaymentEventLlm     │
                          │  claude-opus-4-7 + tool use:   │
                          │  retry / reminder / plan /     │
                          │  escalate                      │
                          └────────────────┬───────────────┘
                                           │ DB writes
                                           ▼
                                   ┌──────────────┐
                                   │   Supabase   │
                                   │   Postgres   │
                                   └──────────────┘
```

Key files:

| Path | Role |
|---|---|
| `src/server.ts` | Worker entry. Wraps fetch in `runWithEnv` (AsyncLocalStorage) so any server module can call `getEnv()`. Also normalizes h3-swallowed SSR errors. |
| `src/lib/server/env.ts` | Typed `getEnv()` accessor. The foundation everything else builds on. |
| `src/lib/server/stripe.ts` | Stripe SDK wrapper — customers, SEPA mandates, Test Clocks, idempotent `chargeRent`, webhook verification. |
| `src/lib/server/supabase.ts` | Service-role Supabase client + tenant loaders. |
| `src/lib/server/agentLlm.ts` | Claude tool-use loop. System prompt + tool definitions are prompt-cached. |
| `src/lib/server/cycle.ts` | Orchestrator. `advanceMonthLive`, `acceptPlanLive`, plus the tool executors. |
| `src/routes/api.stripe.webhook.ts` | Webhook handler — signature verify, dedupe, dispatch. |
| `src/routes/api.cycle.advance.ts` | Live-mode cycle trigger. |
| `src/routes/api.tenant.accept-plan.ts` | Tenant accepts the agent-offered plan. |
| `src/lib/store.tsx` | React reducer + provider. Branches on mode: offline runs the local pipeline; live dispatches to API routes and listens for Supabase Realtime upserts. |
| `src/lib/agentEngine.ts` | Offline-mode deterministic agent (used as fallback and for type compatibility). |

Per-mode behavior is hidden behind the `useHalloFlow()` hook — components don't know which mode they're in.

For deeper architectural notes (the SSR error layer, why Cloudflare env access needs AsyncLocalStorage, how the realtime subscriptions are wired), see `CLAUDE.md`.

## Tenant archetypes (the demo's narrative engine)

Seed data uses 4 archetypes that drive deterministic outcomes in both modes:

| Archetype | Risk score | Outcome |
|---|---|---|
| `reliable` | 10 | Pays first try |
| `soft_fail` | 45 | Fails once, agent retries, recovered |
| `payment_plan` | 72 | Fails, agent offers a 2-part plan |
| `critical` | 91 | Fails, agent escalates to human review |

In live mode, archetypes map to Stripe SEPA test IBANs that produce matching real-test-mode outcomes (success vs. declined). Risk scores are passed to Claude as input; the agent picks the recovery tool itself.

## Scripts

```sh
npm run dev          # vite dev server (port 8080)
npm run build        # production build (client + worker SSR bundle)
npm run preview      # preview the built worker
npm run lint         # eslint
npm run format       # prettier
npx tsc --noEmit     # typecheck
npx tsx scripts/setup-live.ts   # one-shot Stripe + Supabase bootstrap (live mode only)
```

The package manager is **bun** in CI (see `bun.lock`, `bunfig.toml`), but `npm` works locally if you don't have bun installed. `bunfig.toml` enforces a 24-hour supply-chain guard — don't add freshly published packages without confirming.

## Out of scope (intentionally)

This is a hackathon demo, not a full property-management system. Things deliberately not built:

- Real tenant authentication (tenant portal is URL-keyed)
- Owner payouts via Stripe Connect
- Email/SMS notifications (the `send_reminder` agent tool just logs)
- Production deployment to a custom domain
- Legal dunning workflows
- Owner accounting

## License

Hackathon project, no license declared.
