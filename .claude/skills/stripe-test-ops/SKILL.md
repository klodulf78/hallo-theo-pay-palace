---
name: stripe-test-ops
description: >-
  Stripe test-mode operations for the hallo flow rent-collection demo. Use when
  creating Stripe customers, subscriptions, invoices or payment links; setting up
  or advancing Test Clocks ("Advance Month"); verifying webhook signatures;
  mapping a tenant behavior_profile to a deterministic test payment method; or
  building the fake-event fallback simulator. Trigger on anything touching the
  Stripe SDK, webhooks, test clocks, or the env vars Stripe_Sandbox / Webhook_stripe.
---

# Stripe test-mode ops (hallo flow)

The demo's credibility depends on **real money moving through Stripe test mode**, with
deterministic outcomes the agent can react to. Reuse the existing wrappers; do not re-init
the SDK ad hoc.

## Env vars (non-standard names — match the existing code)
- Secret key: `Stripe_Sandbox` (fallbacks `STRIPE_SANDBOX`, then `STRIPE_SECRET_KEY`).
- Webhook signing secret: `Webhook_stripe` (fallback `WEBHOOK_STRIPE`).
- Read via the wrappers in `src/lib/stripe.server.ts`: `getStripe()`, `getWebhookSecret()`.
  These are server-only — never import into browser code.

## Deterministic behavior → payment method
`paymentMethodForBehavior(behavior)` in `src/lib/stripe.server.ts` returns:

| `behavior_profile` | test PM token | card token used | outcome |
|---|---|---|---|
| `reliable` | `pm_card_visa` | `tok_visa` | succeeds |
| `payment_plan` | `pm_card_chargeDeclinedInsufficientFunds` | `tok_chargeDeclinedInsufficientFunds` | declines → agent offers 2-part plan (high risk) |
| `soft_fail` | `pm_card_chargeDeclinedInsufficientFunds` | `tok_chargeDeclinedInsufficientFunds` | declines |
| `critical` | `pm_card_chargeCustomerFail` | `tok_chargeCustomerFail` | always fails |

This makes the 12-tenant cycle reproducible: 8 pay, 2 soft-fail then recover, 1 plan, 1 escalates.

## Test Clocks = the Time-Machine (the real "Advance Month")
The cycle is driven by a single Stripe Test Clock, **not** a pure simulator. See
`src/lib/stripe.functions.ts`:
- `DEMO_START_UNIX` anchors the clock to `2026-05-01T00:00:00Z`.
- `setupStripeDemo()` — creates the clock (stored in `guardrails.stripe_test_clock_id`), one
  shared product, then per tenant: a Customer attached to the test clock, a deterministic
  PaymentMethod, and a monthly EUR Subscription (`charge_automatically`,
  `payment_behavior: "allow_incomplete"`). Idempotent — tenants with a `stripe_customer_id`
  are skipped.
- `advanceStripeMonth()` — advances the clock by ~32 days, then **polls** the clock until
  `status === "ready"` (or `internal_failure`), up to ~30s. Stripe re-bills every active
  subscription and fires webhooks. The UI button must show a loading state for this poll.
- `getStripeStatus()` — clock id/time/status + tenant/payment-event counts for the dashboard.

## Webhook handling
- Entry: `src/routes/api/public/stripe-webhook.ts` (public route, no auth/UI).
- Verify with `stripe.webhooks.constructEvent(rawBody, sig, getWebhookSecret())` — you need the
  **raw** request body, not parsed JSON.
- Handle at minimum `invoice.paid` (→ mark obligation paid/reconciled, write `payment_events`)
  and `invoice.payment_failed` (→ write `payment_events` + an `exceptions` row, then call
  `runPaymentRecoveryAgent`). Keep handlers idempotent via the `rent_obligation_id` lookup.
- Retry a failed invoice with `stripe.invoices.pay(invoiceId)`; `invoice.status === "paid"`
  means recovered → set obligation `auto_recovered`.

## Run the webhook locally
```sh
stripe listen --forward-to localhost:8080/api/public/stripe-webhook
```
Use the signing secret it prints as `Webhook_stripe`.

## Minimum vs better vs fallback (PRD §8.3 / §15)
- **Minimum:** one real customer + invoice/payment link, one real paid/failed event shown.
- **Better:** Billing subscriptions + Test Clock advancing the period (this is what's built).
- **Fallback:** if a live path is flaky, expose a button/endpoint that emits a **Stripe-shaped
  fake event** into the same webhook handler so the demo never depends on a fragile live call.
  Keep the fake payload identical in shape to the real `invoice.*` event.

## Conventions
- `bun` is the package manager; `bunfig.toml` holds new deps 24h — confirm before adding any.
- Stripe API version pinned to `2025-06-30.basil` in the wrapper.
- Always `npx tsc --noEmit` before declaring a change done.
