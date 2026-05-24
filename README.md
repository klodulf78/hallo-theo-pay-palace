# 🏠 hallo flow — Autonomous Rent Collection for German Property Managers

> *Set-and-forget payment infrastructure for residential property operations.*
> *Built for the Stripe "Autonomous Payment Operations" track.*

[![Demo](https://img.shields.io/badge/Demo-Live-success)](https://hallo-theo-pay-palace.lovable.app)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Stripe](https://img.shields.io/badge/Stripe-SEPA%20Direct%20Debit-635bff)](https://stripe.com)
[![Supabase](https://img.shields.io/badge/Supabase-Edge%20Functions-3ecf8e)](https://supabase.com)

---

## 🎯 The Problem

German property managers lose **weeks every month** tracking rent payments, writing dunning letters, calculating default interest, and chasing arrears. At 100+ residential units the manual overhead becomes unsustainable — yet German tenancy law (§ 286, § 288, § 543 BGB) demands **precise legal compliance** at every step. One missed working-day deadline, one miscalculated interest figure, and a tenant termination case falls apart in court.

## 💡 Our Solution

**hallo flow** is an autonomous rent-collection agent that handles the full payment lifecycle for German residential rentals:

1. **Collects rent** via Stripe SEPA Direct Debit
2. **Detects defaults** automatically — handles SEPA chargebacks (Rücklastschriften), insufficient funds, and invalid mandates with proper § 286 BGB grace logic
3. **Issues dunning notices** through legally-correct stages (1 → 2 → 3) with **working-day deadlines** (German Werktage, BGH-compliant)
4. **Calculates default interest** per § 288 Abs. 1 BGB (Bundesbank base rate + 5% surcharge, simple interest, calendar days)
5. **Generates court-defensible Verzugsnachweise** — full audit snapshots (jsonb) per stage including expected vs. received amount, basiszinssatz used, interest formula, and trigger reason
6. **Escalates to humans** only when arrears ≥ 2 monthly rents AND Stage 2 deadline expired — the property manager gets a structured case file ready for termination (§ 543 / § 569 BGB) or attorney engagement
7. **Generates downloadable Mahnungsbriefe** in German legal format (Stage 1, 2, 3) ready to print

The property manager's job shifts from "chase payments" to "approve escalations".

---

## ✨ Key Features

| Feature | Detail |
|---|---|
| 🤖 **Autonomous dunning state machine** | Stages 0 → 1 → 2 → 3 with idempotent re-runs (`UNIQUE(rent_obligation_id, stage)`) |
| ⚖️ **Legal compliance** | § 286 BGB (default), § 288 BGB (interest), § 543/569 BGB (termination), § 556b BGB (due date), German Werktage |
| 📊 **Portfolio dashboard** | Live map of properties across Germany (Leaflet + TopoJSON), drill-down to units |
| 💳 **Stripe SEPA Direct Debit** | Customers, PaymentMethods, PaymentIntents, Webhooks — full lifecycle |
| ⚡ **SEPA Rücklastschrift handling** | Immediate Stage 1 trigger on returned debits with chargeback fee |
| 📅 **Time-machine simulation** | Demo controls let you simulate months instantly to show escalation behavior |
| 📄 **Downloadable dunning letters** | Stage 1/2/3 German letters with print/PDF export |
| 🔍 **Verzugsnachweis modal** | Court-ready proof of default per stage |
| 🌐 **Bilingual UI** | German / English toggle (legal documents always stay German) |
| 🔄 **Demo reset + seed** | Repeatable demos with realistic German portfolios across Berlin, München, Frankfurt |

---

## 🎬 Demo Walkthrough

Open the app and switch to the **Dashboard** view. The 4 Demo Controls walk through the entire rent-collection lifecycle:

| Button | What it does | Backend effect |
|---|---|---|
| 🏢 **Hausverwaltung onboarden** | Seeds 9 demo properties in Berlin / München / Frankfurt with empty units | `properties` + `units` inserted |
| 📋 **Mietverträge abschließen** | Batch-onboards tenants into 90% of empty units (~10% intentional vacancy) | `tenants` + Stripe Customers + `sepa_mandates` created |
| 💳 **SEPA-Mandate & Einzug** | Triggers SEPA Direct Debits via Stripe for all active tenants | `rent_obligations` + `payment_events` populated; ~85% succeed, ~15% fail |
| 📅 **Monatsabschluss** | Advances simulated time +1 month, auto-runs SEPA collection + dunning engine | `dunning_notices` issued cascade Stage 1→2→3; `exceptions` for Stage 3 |

After 3–4 month-end clicks: navigate to **Eskalationen** → click on any critical tenant → click **Verzugsnachweis ansehen** to see the full legal audit trail.

---

## 🛠 Tech Stack

### Frontend
- **React 19** + **TypeScript** (strict mode)
- **TanStack Start** (full-stack framework, file-based routing)
- **TanStack Router** + **TanStack React Query**
- **Tailwind CSS 4** + **shadcn/ui** + **lucide-react**
- **react-leaflet** + **topojson-client** for the Germany map
- **jspdf** + **docx** for document generation
- **Vite 7** + **vite-tsconfig-paths**

### Backend
- **Supabase** (Postgres + Edge Functions + Row-Level Security)
- **Deno** runtime for Edge Functions
- **TanStack Server Functions** for thin server API
- **Vitest** for unit tests (32 tests covering dunning state machine + working-day math)

### Payments
- **Stripe API** (`stripe@22.1.1`) — Sandbox mode
  - `customers` — Customer per tenant
  - `paymentMethods` — SEPA Direct Debit (with card fallback)
  - `paymentIntents` — Monthly rent collection
  - `testHelpers.testClocks` — Time-machine support
  - Webhooks: `payment_intent.succeeded`, `payment_intent.payment_failed`

### Hosting
- **Lovable Cloud** (managed Supabase + frontend hosting)
- **Cloudflare Workers** ready (`wrangler.jsonc` configured)

---

## 🌐 APIs & Integrations

### External APIs
| API | Purpose | Library |
|---|---|---|
| **Stripe** | Customers, PaymentMethods, PaymentIntents, Webhooks, Test Clocks | `stripe@22.1.1` |
| **Supabase** | Postgres queries, RLS, Edge Function invocation | `@supabase/supabase-js@2.106.1` |
| **OpenStreetMap** (via CARTO + Natural Earth) | Map tiles (CartoDB Positron) + country borders (TopoJSON) | `react-leaflet@5`, `topojson-client@3` |

### Internal Edge Function
```
POST  /functions/v1/run-dunning
      Body: { "as_of"?: "YYYY-MM-DD" }
      Auth: Supabase service role key

Response:
{
  "as_of": "2026-08-01",
  "scanned": 38,
  "stages_issued": 12,
  "stages_by_stage": { "1": 4, "2": 4, "3": 4 },
  "resets": 2,
  "exceptions_created": 4,
  "skipped": 16
}
```

### Stripe Webhook Endpoint
```
POST  /api/public/stripe-webhook
      Handles: payment_intent.succeeded, payment_intent.payment_failed,
               invoice.paid, invoice.payment_failed, customer.created, charge.refunded
```

---

## 🏗 Architecture

```
                            ┌──────────────────────┐
                            │   Property Manager   │
                            │      (Browser)       │
                            └──────────┬───────────┘
                                       │
                              TanStack Start App
                              (React 19 + Tailwind)
                                       │
                ┌──────────────────────┼──────────────────────┐
                │                      │                      │
        Server Functions       Supabase Client         Map Renderer
        (rent setup,          (Postgres queries        (Leaflet +
         time-machine)         via REST/realtime)      TopoJSON)
                │                      │
                ▼                      ▼
        ┌───────────────┐      ┌─────────────────┐
        │ Stripe API    │      │ Supabase        │
        │ (Sandbox)     │      │ Postgres + RLS  │
        │               │      │                 │
        │ Customers     │      │ properties      │
        │ SEPA Mandates │      │ units           │
        │ PaymentIntents│      │ tenants         │
        │ Webhooks      │      │ rent_obligations│
        └──────┬────────┘      │ payment_events  │
               │               │ dunning_notices │
               │  webhooks     │ exceptions      │
               └──────────────►│ ...             │
                               └────────┬────────┘
                                        │
                                        │ scheduled / on-month-end
                                        ▼
                               ┌────────────────────┐
                               │  Edge Function     │
                               │  run-dunning       │
                               │  (Deno)            │
                               │                    │
                               │  • State machine   │
                               │  • Werktag math    │
                               │  • § 288 interest  │
                               │  • Idempotent      │
                               └────────────────────┘
```

---

## ⚖️ Legal Foundation

| Paragraph | Applied as |
|---|---|
| **§ 286 BGB** | Verzugseintritt — debtor in default after first reminder OR 30 days past due (we use stricter: T+1 working day per common lease) |
| **§ 288 Abs. 1 BGB** | Verzugszinsen — consumer rate = Bundesbank base rate (currently 3.27%) + 5 percentage points |
| **§ 556b BGB** | Mietfälligkeit — fallback to 3rd working day of the month if lease has no due day |
| **§ 543 Abs. 2 Nr. 3 BGB** | Fristlose Kündigung — grounds for termination when arrears ≥ 2 monthly rents |
| **§ 569 Abs. 3 BGB** | Schonfrist — Stage 3 case file preserves the proof for legal action |

> All financial calculations use **simple interest, calendar days, rounded to 2 decimals** as required by § 288. All deadlines use **German working days (Werktage: Mon–Fri)** with the BGH simplification that holidays are not separately modeled (declared demo simplification).

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+ or Bun 1.0+
- A Supabase project ([create one free](https://supabase.com))
- A Stripe sandbox account ([sign up free](https://stripe.com))

### 1. Clone & install
```bash
git clone https://github.com/klodulf78/hallo-theo-pay-palace.git
cd hallo-theo-pay-palace
bun install   # or: npm install
```

### 2. Configure environment
Copy `.env.example` to `.env` and fill in your credentials:
```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Stripe (sandbox keys, prefixed sk_test_)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 3. Apply database migrations
```bash
npx supabase link --project-ref your-project-ref
npx supabase db push
```

### 4. Deploy Edge Function
```bash
npx supabase functions deploy run-dunning
```

### 5. Configure Stripe webhook
In your Stripe sandbox dashboard, add a webhook endpoint pointing to:
```
https://your-app-domain/api/public/stripe-webhook
```
Subscribe to: `payment_intent.succeeded`, `payment_intent.payment_failed`, `customer.created`, `charge.refunded`

### 6. Run dev server
```bash
bun dev
```
Open [http://localhost:3000](http://localhost:3000).

### 7. Run the demo
Click **Hausverwaltung onboarden** → **Mietverträge abschließen** → **SEPA-Mandate & Einzug** → **Monatsabschluss** (3–4 times).
Then explore **Eskalationen** → open a tenant card → click **Verzugsnachweis ansehen**.

---

## 🧪 Testing

```bash
bun test           # Run all vitest tests
```

Test coverage:
- 14 unit tests for working-day helpers (Werktage, German calendar edge cases)
- 18 unit tests for the dunning state machine (all 1→2→3 transitions, idempotency, SEPA chargeback, payment reset, exclusions)
- Hand-checked § 288 BGB interest calculation against a known reference

---

## 📁 Repository Structure

```
hallo-theo-pay-palace/
├── src/
│   ├── routes/                  # File-based routes (TanStack Router)
│   │   ├── dashboard/           # Main portfolio view with map + KPIs
│   │   ├── exceptions/          # Escalations inbox (Stage-3 cases)
│   │   ├── demo-flow/           # Visual explainer page
│   │   └── api/public/stripe-webhook.ts   # Webhook handler
│   ├── components/              # Shadcn UI + custom components
│   ├── lib/
│   │   ├── stripe.functions.ts  # Server functions for Stripe ops
│   │   ├── stripe.server.ts     # Stripe SDK initialization
│   │   ├── translations.ts      # DE / EN i18n strings
│   │   └── use-language.tsx     # Language context + hook
│   └── integrations/supabase/   # Generated DB types + client
├── supabase/
│   ├── functions/
│   │   ├── _shared/
│   │   │   ├── dunning-logic.ts        # Pure state machine (+ tests)
│   │   │   └── working-days.ts         # Werktag math (+ tests)
│   │   └── run-dunning/index.ts        # Edge Function entry point
│   ├── migrations/              # Postgres schema migrations
│   └── config.toml
└── package.json
```

---

## 🏆 Competition Track

Submitted to **Stripe — Autonomous Payment Operations**.

How we address the challenge prompts:

> *"What would a fully autonomous rent collection system look like?"*

→ Our `run-dunning` Edge Function. One scheduled cron and the entire German rent-collection lifecycle handles itself, including legally compliant escalation paths.

> *"How do we eliminate payment-related support tickets entirely?"*

→ Smart SEPA chargeback handling, automatic dunning, and a Stage-3 inbox that surfaces only the cases that genuinely need human judgment.

> *"Can payments adapt dynamically to tenant or vendor behavior?"*

→ Tenant `behavior_profile` (reliable / soft_fail / payment_plan / critical) drives risk-aware Stripe simulation. Payment plan exclusion logic pauses dunning for tenants on agreed schedules.

---

## 👥 Team

Built at the hackathon by team **hallo theo** in ~36 hours.

---

## 📄 License

MIT
