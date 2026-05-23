# hallo flow — open issues / unsolved problems

_Last updated: 2026-05-24. Code is built, typechecks, bundles, and is committed
(`7f6928e`). **One hard blocker** remains before a live end-to-end demo can run: a valid
Supabase service-role key. Everything else below is a runtime step, a low-impact polish item,
or a pending decision._

## 🔴 Hard blocker (must fix before the live cycle can run)

1. **Real Supabase `service_role` key.** `SUPABASE_SERVICE_ROLE_KEY` in `.env` currently holds
   the **anon** key (confirmed: JWT `role: anon`). Anon can read (public-read RLS) but **all
   server-side writes are silently blocked by RLS** — seed, Stripe setup, webhook
   obligation/exception writes, and agent actions all fail (a delete attempt was a silent
   no-op). The app writes only via the service-role client
   (`src/integrations/supabase/client.server.ts`), which bypasses RLS.
   - **Fix:** Dashboard → Project Settings → API → reveal the **`service_role` `secret`** key
     (or a newer `sb_secret_…` key) → paste into `.env` as `SUPABASE_SERVICE_ROLE_KEY`,
     unquoted. Confirm it decodes to `role: service_role`.
   - Link: https://supabase.com/dashboard/project/nyftqbzxhlenszmeinwe/settings/api

## 🟡 Runtime steps (ready; just need to be done at run time, after #1)

2. **Set the webhook secret to `stripe listen`'s value.** `stripe listen` mints its **own**
   `whsec_…` each session. Run `./stripe.exe listen --api-key "$STRIPE_SECRET_KEY"
   --forward-to localhost:8080/api/public/stripe-webhook`, then put the printed `whsec_…` into
   `.env` as `STRIPE_WEBHOOK_KEY` (or `Webhook_stripe`) and restart `bun run dev`.
   _(Code already accepts `STRIPE_WEBHOOK_KEY`; `stripe.exe` v1.41.2 is present.)_
3. **Reset stale demo data + run the cycle.** Supabase still has 5 leftover tenants
   (Anna Schmidt, etc. / `WE-001…` units / property "Berlin Mitte Portfolio") from an earlier
   session that don't match the 12-tenant roster. Once #1 is fixed: reset → `seedDemoData` →
   `setupStripeDemo` → `stripe listen` → `advanceStripeMonth` → verify the scripted outcome
   (8 paid, 2 recovered, Kaya on a plan, Richter escalated). See `DEMO.md`.

## 🟢 Low-impact / optional

- **`LOVABLE_API_KEY` not set** — optional; the agent uses the deterministic policy engine
  without it, only the AI-written cycle-summary text is skipped.
- **Deferred code-review findings** (none demo-breaking):
  - `recoverInvoiceWithGoodCard` doesn't pre-check invoice status → an already-paid/void invoice
    is reported as a failed retry; a non-paid "open" result leaves the obligation non-terminal.
  - `stripe_event_id` stores the invoice id, not the Stripe event id → redeliveries aren't deduped.
  - `failure_reason` is read from `last_finalization_error` (usually empty on charge declines) →
    nearly always defaults to `insufficient_funds` (cosmetic).
  - `setupStripeDemo`/seed read `guardrails` with `.maybeSingle()` → would throw if >1 row exists.
  - `runExceptionAction` recomputes risk without the behavior baseline (manual-action risk is
    heuristic-only).
  - AI cycle-summary `KpiSchema` omits failedAmount/autoRecoveredPct/humanReviewPct (zod strips them).
  - Demo month resolves to **June** (Stripe trial anchor), not the PRD's "May" — update copy or
    shift `DEMO_START_UNIX` if the label matters for the pitch.

## ⏳ Pending decisions

- **Full-repo `prettier --write`?** `endOfLine: "auto"` + formatting of our changed files made
  them lint-clean, but the rest of the repo (Lovable export, `src/components/ui/*`) still has
  pre-existing prettier violations, so `bun run lint` over the whole tree still reports them. A
  separate chore commit could zero it out.
- **Rotate keys** once convenient — `.env` was tracked in history (`37bb3a1`); the Stripe test
  secret + Supabase keys should be considered exposed. (`.env` is now untracked + gitignored.)
- **Push / PR?** Work is committed locally on `feature/payment-recovery-agent`; not pushed.

## ✅ Resolved this session
Pipeline enum violations that 500'd the webhook · month-dynamic dashboard + Advance-Month anchor ·
deterministic recovery agent (risk + behavior-tier floor + policy) with LLM fallback ·
card map + `recoverInvoiceWithGoodCard` (soft-fails recover, Kaya fails into a plan) ·
Exception Queue / Activity Log / Tenant Portal built · Dashboard KPIs + closing banner + owner
preview · seed + accept-plan + queue-action server functions · 7 code-review bug fixes ·
offline `scripts/verify-agent.ts` (all checks pass) · `.env` untracked + secrets/binary/lockfile
gitignored · `endOfLine: auto` (lint noise ~6700→clean on our files) · committed `7f6928e` ·
README.md + DEMO.md synced to the shipped MVP · `tsc` + `vite build` clean.
