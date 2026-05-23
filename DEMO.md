# hallo flow — demo runbook

One cycle. One failure. One recovery. One escalation. **Zero manual work.**

## 0. Prerequisites (env)

Set these in `.env` (values **unquoted**) before a live run:

| Variable | Why |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | **Required** — must be the real **`service_role`** secret (its JWT `role` claim is `service_role`), NOT the anon/publishable key. Every server function writes via this client; with the anon key all writes are silently blocked by RLS. |
| `Stripe_Sandbox` (or `STRIPE_SECRET_KEY`) | Stripe test-mode secret key. |
| `Webhook_stripe` *(or `STRIPE_WEBHOOK_KEY`)* | Stripe webhook signing secret — the `whsec_…` that `stripe listen` prints (see below). |
| `LOVABLE_API_KEY` | **Optional.** AI cycle summary + LLM recovery decisions. Without it the agent uses a deterministic policy engine (still retries / offers plans / escalates correctly by risk); only the AI-written summary text is skipped. |

## 1. Start

```sh
bun install
bun run dev          # http://localhost:8080

# in a second terminal — forward Stripe events to the webhook.
# Use ./stripe.exe if the Stripe CLI isn't on PATH; authenticate with the secret
# key (or run `stripe login` once):
stripe listen --api-key "$STRIPE_SECRET_KEY" \
  --forward-to localhost:8080/api/public/stripe-webhook
# copy the printed "whsec_..." into .env as Webhook_stripe (or STRIPE_WEBHOOK_KEY),
# then restart `bun run dev` so it picks up the secret
```

> Sanity-check the agent's risk + decision policy offline anytime (no DB/Stripe):
> `bun scripts/verify-agent.ts`

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

> Note: with the current Test Clock anchor the first billed cycle is the month **after**
> `DEMO_START_UNIX` (≈ June 2026); the dashboard follows whatever month the obligations land in.
> Shift `DEMO_START_UNIX` if you want the label to read "May".

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
- **LLM/agent down:** with no `LOVABLE_API_KEY` the recovery agent uses its deterministic policy
  engine (retry / plan / escalate by risk); present it as a policy-controlled agent.
- **Supabase down:** restate with seeded data; the schema shape is the contract.
- **Deploy down:** demo locally on `localhost:8080`.
