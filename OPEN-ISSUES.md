# hallo flow — open issues / unsolved problems

_Last updated: 2026-05-24. Tracks what still blocks a live end-to-end demo. Code is built,
typechecks, and bundles; the remaining items are credentials/tooling and a data reset._

## 🔴 Blockers (need action before the live cycle can run)

1. **Real Supabase `service_role` key.** `SUPABASE_SERVICE_ROLE_KEY` in `.env` currently holds
   the **anon** key (JWT `role: anon`). Anon can read (public-read RLS) but **all server-side
   writes are silently blocked by RLS** — seed, Stripe setup, webhook obligation/exception
   writes, and agent actions all fail. The app writes only via the service-role client
   (`src/integrations/supabase/client.server.ts`), which bypasses RLS.
   - **Fix:** Dashboard → Project Settings → API → reveal the **`service_role` `secret`** key
     (or a newer `sb_secret_…` key) → paste into `.env` as `SUPABASE_SERVICE_ROLE_KEY`,
     unquoted. Verify its JWT decodes to `role: service_role`.
   - Link: https://supabase.com/dashboard/project/nyftqbzxhlenszmeinwe/settings/api

2. **Webhook signing secret must match `stripe listen`.** `stripe listen` mints its **own**
   `whsec_…` each session; the current `STRIPE_WEBHOOK_KEY` value likely won't match its
   signature, so webhook verification will 400. At run time, set `STRIPE_WEBHOOK_KEY` to the
   `whsec_…` that `stripe listen --forward-to localhost:8080/api/public/stripe-webhook` prints.
   (`getWebhookSecret()` already accepts `STRIPE_WEBHOOK_KEY`.)

## 🟡 Blocked on #1 (will do once the key is valid)

3. **Reset stale demo data + run the cycle.** Supabase still has 5 leftover tenants
   (Anna Schmidt, etc. / `WE-001…` units / property "Berlin Mitte Portfolio") from an earlier
   session — they don't match the 12-tenant roster and would pollute the dashboard. Plan once
   writes work: reset → `seedDemoData` (12 tenants) → `setupStripeDemo` → `stripe listen` →
   `advanceStripeMonth` → verify scripted outcome (8 paid, 2 recovered, Kaya on a plan, Richter
   escalated). _My earlier delete attempt was a silent no-op because of the anon key, so nothing
   was lost._

## 🟢 Minor / optional

4. **`LOVABLE_API_KEY` not set.** Optional — the agent uses the deterministic policy engine
   without it; only the AI-written cycle-summary text is skipped.
5. **Pre-existing CRLF lint errors.** `bun run lint` reports ~6700 `Delete ␍` errors across
   untouched files (Windows CRLF checkout vs LF prettier config). Run a `prettier --write` pass
   to clear. Not introduced by recent work.
6. **`.env` values are quoted.** Store secrets unquoted to avoid runtime parsing surprises
   (the URL parse failed on quotes in standalone checks).

## 🔎 Deferred code-review findings (low impact, 2026-05-24)

Fixed in the review pass: `payment_events` `payment_failed`→`failed` read mismatch (risk + manual
actions); auto-cleared KPI counting pending/failed; double-processing of `invoice.paid` +
`invoice.payment_succeeded`; `acceptPaymentPlan` idempotency guard; tenant portal treating
`pending`/`expected` as outstanding; `invoiceMonth` using `period_end`. Still open, low impact:

- `recoverInvoiceWithGoodCard` doesn't pre-check invoice status → an already-paid/void invoice is
  reported as a failed retry; a non-paid "open" result leaves the obligation in no terminal state.
- `stripe_event_id` stores the invoice id, not the Stripe event id → webhook redeliveries aren't deduped.
- `failure_reason` is read from `last_finalization_error` (usually empty on charge declines) → nearly
  always defaults to `insufficient_funds` (cosmetic for the demo).
- `setupStripeDemo`/seed read `guardrails` with `.maybeSingle()` → would throw if >1 guardrails row exists.
- `runExceptionAction` recomputes risk without the behavior baseline (manual-action risk is heuristic-only).
- AI cycle-summary `KpiSchema` omits failedAmount/autoRecoveredPct/humanReviewPct (zod strips them).
- Demo month resolves to **June** (Stripe trial anchor), not the PRD's "May" — update copy or shift
  `DEMO_START_UNIX` if the label matters for the pitch.

## ⏳ Pending decision

- **Full-repo `prettier --write`?** Only our changed files were formatted (focused diff). The
  rest of the repo (Lovable export, `src/components/ui/*`) still has pre-existing prettier
  violations, so `bun run lint` over the whole tree still reports them. A separate chore commit
  could zero it out if desired.
- **Rotate keys** once convenient — `.env` was tracked in history (`37bb3a1`); the Stripe test
  secret + Supabase keys should be considered exposed.

## ✅ Verified working (for context)
Stripe secret-key auth · `stripe.exe` v1.41.2 · webhook var lookup accepts `STRIPE_WEBHOOK_KEY` ·
`npx tsc --noEmit` clean · `npx vite build` clean · deterministic agent + card-map/retry-recovery
fixes · all 4 demo surfaces built.
