---
name: time-machine-cycle
description: >-
  The hallo flow demo backbone — seed roster, the monthly rent-cycle narrative,
  the 6-scene demo script, the pitch, target final-state numbers, and the backup
  plan. Use when building or editing the seed dataset, defining what "Advance
  Month" should produce, writing the demo script or pitch, checking integration
  against the locked demo path, or deciding what to cut.
---

# Time-Machine rent cycle, seed & demo (hallo flow)

The winning demo is one button — **Advance Month** — that runs a full rent cycle across seeded
tenants and leaves the manager with almost nothing to do. Build everything to serve that.

## Locked demo path (don't let it drift)
`Advance Month → payment failure → agent action → tenant accepts plan → reconciliation →
dashboard KPI`. Mantra: **one cycle, one failure, one recovery, one escalation, zero manual work.**

## Seed roster — 1 property, 12 tenants
Property: **hallo theo Berlin Mitte Portfolio** · Owner: Demo Owner GmbH · Expected €14,800.

| Tenant | Unit | Rent | behavior_profile | Expected result |
|---|---|---|---|---|
| Müller | 1A | €1,100 | reliable | paid |
| Weber | 1B | €1,250 | reliable | paid |
| Schneider | 2A | €980 | reliable | paid |
| Fischer | 2B | €1,300 | reliable | paid |
| Wagner | 3A | €1,050 | reliable | paid |
| Becker | 3B | €1,400 | reliable | paid |
| Hoffmann | 4A | €1,200 | soft_fail | recovered after retry |
| Kaya | 4B | €1,200 | payment_plan | 2-part plan accepted |
| Nowak | 5A | €1,350 | soft_fail | recovered after retry |
| Braun | 5B | €1,100 | reliable | paid |
| Richter | 6A | €1,470 | critical | human review |
| Klein | 6B | €1,400 | reliable | paid |

`behavior_profile` MUST match the Stripe test-PM mapping (see **`stripe-test-ops`**) so live
outcomes equal the script: reliable succeeds; soft_fail and payment_plan both decline initially
(the agent retries the soft_fail to recovery and offers the payment_plan tenant a plan, by
risk); critical always fails. Seed via SQL under `supabase/` and/or a setup server function; insert columns per
the **`supabase-data`** skill.

## Target final state (the seed + cycle must reproduce this)
Expected €14,800 · Paid immediately €10,580 · Recovered after retry €2,550 · Payment plan
€1,200 (Kaya) · Human review €1,470 (Richter) · Support tickets **0**.
Closing KPI: ~92% auto-cleared · ~6% auto-recovered · ~2% human review.

## How the cycle runs (real, not faked)
1. `setupStripeDemo()` provisions the test clock + per-tenant customer/PM/subscription.
2. **Advance Month** = `advanceStripeMonth()` advances the Stripe Test Clock ~32 days; Stripe
   re-bills and fires webhooks.
3. The webhook writes `payment_events` / `rent_obligations` / `exceptions`; on failure the
   recovery agent picks an action and logs it to `agent_actions`.
4. Tenant accepts the plan in the portal → reconciliation; dashboard KPIs update.

## 6-scene demo (<5 min)
1. Dashboard shows seeded rent roll + payment readiness.
2. Click **Advance Month** — cycle runs in seconds (12 charged, 8 paid, 2 recovered, 1 plan,
   1 escalated, 0 tickets).
3. Activity Log proves autonomy — timestamped decisions + reasons.
4. Tenant Portal: tenant self-serves (retry / update method / accept 2-part plan).
5. Exception Queue: exactly **one** true human exception remains (Richter).
6. Closing KPI banner.

## Pitch (open / close)
- Open: "Property managers don't need another payment dashboard. They need rent collection to
  stop creating work. hallo flow is the autonomous rent-collection operator — it runs the
  monthly cycle, detects failures, retries, reminds, offers plans, reconciles, and escalates
  only true exceptions."
- Demo beat: "Notice what the manager did **not** do: no chasing, no bank-reference checking,
  no support ticket, no spreadsheet."
- Close: "The future of property payment ops isn't a prettier dashboard — it's an
  exception-driven autopilot."

## Scope discipline
- **P0 (must ship):** seed roll, dashboard, Advance Month, simulated/real cycle, failure
  detection, risk score, activity log, exception queue, tenant plan acceptance, reconciliation,
  one real Stripe touchpoint.
- **P1 (only if P0 done by hour 4):** real Billing subscription, Test Clock, Claude tool-use
  wrap, tenant chat, owner payout preview.
- **P2 (cut first):** real Connect transfer, Sigma, real SEPA end-to-end, voice agent, vendor
  payouts, real auth, real email/SMS, ML model.

## Backup plan
- Stripe live fails → show a pre-created Stripe object + simulated Stripe-shaped events; explain
  the event contract mirrors Stripe webhooks.
- Claude/LLM fails → deterministic policy agent, presented as policy-controlled agentic flow.
- Supabase fails → local JSON/in-memory store with the same shape, restart with seed.
- Deployment fails → demo locally (`bun run dev`, port 8080).
