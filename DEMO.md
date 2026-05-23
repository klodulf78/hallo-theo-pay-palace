# hallo flow — demo runbook

One cycle. One failure. One recovery. One escalation. **Zero manual work.**

## 0. Prerequisites (env)

Only the Supabase URL + anon key are currently in `.env`. Before a live run, also set:

| Variable | Why |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** — every server function uses the service-role client; nothing works without it. |
| `Stripe_Sandbox` (or `STRIPE_SECRET_KEY`) | Stripe test-mode secret key. |
| `Webhook_stripe` | Stripe webhook signing secret (printed by `stripe listen`, see below). |
| `LOVABLE_API_KEY` | **Optional.** AI cycle summary + LLM recovery decisions. Without it the agent uses a deterministic policy engine (still retries / offers plans / escalates correctly by risk); only the AI-written summary text is skipped. |

## 1. Start

```sh
bun install
bun run dev          # http://localhost:8080
# in a second terminal — forward Stripe events to the webhook:
stripe listen --forward-to localhost:8080/api/public/stripe-webhook
# copy the printed "whsec_..." into .env as Webhook_stripe, then restart dev
```

## 2. Arm the demo (one-time, from the dashboard `/`)

The Stripe setup card has two buttons — **run them in order**:

1. **Seed demo data** → inserts the portfolio: 1 owner, 1 property (*hallo theo Berlin Mitte
   Portfolio*), 12 units, the 12 tenants with behavior profiles, an active SEPA mandate each,
   and the guardrails row. Idempotent — safe to click again. Expected rent total **€14,800**.
2. **Set up Stripe** → provisions a Test Clock + a Customer/PaymentMethod/monthly Subscription
   per tenant. Subscriptions are anchored so **no charge fires yet** — Scene 1 shows readiness.

The payment method per tenant is deterministic (via `behavior_profile`): `reliable` → succeeds;
`soft_fail` and `payment_plan` → decline initially (the agent then retries the soft-fail to
recovery and offers the payment-plan tenant a 2-part plan, based on risk); `critical` → always
fails (escalates).

## 3. The 5-minute script

| # | Action | What the audience sees |
|---|---|---|
| 1 | Open `/` | Seeded rent roll + payment readiness. KPI cards, €14,800 expected, nothing collected yet. |
| 2 | Click **Advance Month** | The Stripe Test Clock jumps ~1 month; Stripe bills every subscription and fires webhooks. The dashboard refetches. |
| 3 | Open `/activity` | The **Agent Activity Log** — every charge, failure, risk score, decision, **reason + policy basis**, and result. Proof of autonomy. |
| 4 | Open `/exceptions` | The **Exception Queue** — soft-fails recovered on retry, Kaya offered a 2-part plan; hover a risk score to see the explainable breakdown. |
| 5 | Open `/tenant-portal` (Kaya) | Tenant self-service: status, amount due, agent message, the offered plan. Click **Accept 2-Part Plan** → toast, exception downgrades. |
| 6 | Back to `/` | Closing **KPI banner**: auto-cleared / auto-recovered / human-review % + 0 support tickets. Exactly one human exception (Richter / 6A) remains. |

## 4. Target final state (after one Advance Month + Kaya accepts)

Expected €14,800 · Paid immediately €10,580 · Recovered after retry €2,550 · Payment plan
€1,200 (Kaya 4B) · Human review €1,470 (Richter 6A) · **Support tickets 0**.
Headline: ~92% auto-cleared · ~6% auto-recovered · ~2% human review.

## 5. Integration checklist (Definition of Done §20)

- [ ] Seed → 12 tenants exist; Set up Stripe → 12 provisioned, 0 errors.
- [ ] **Advance Month processes with no 500s / no CHECK-constraint errors** (watch the dev log).
- [ ] Dashboard KPIs populate for the active month; cards + closing banner render live numbers.
- [ ] `/activity` shows agent decisions with reasons; `/exceptions` shows risk + action history.
- [ ] Tenant Portal **Accept 2-Part Plan** downgrades the exception and the dashboard updates.
- [ ] Exactly one true human exception (Richter) remains; 0 support tickets.
- [ ] `npx tsc --noEmit` clean · `npx vite build` clean.

## 6. Fallbacks (PRD §21)

- **Stripe live flaky:** the event contract mirrors Stripe webhooks — a Stripe-shaped fake-event
  path can drive the same handler; or show a pre-created Stripe test object.
- **LLM/agent down:** the recovery agent falls back to deterministic escalation automatically;
  present it as a policy-controlled agent.
- **Supabase down:** restate with seeded data; the schema shape is the contract.
- **Deploy down:** demo locally on `localhost:8080`.
