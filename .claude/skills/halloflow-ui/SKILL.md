---
name: halloflow-ui
description: >-
  Frontend conventions and surface-by-surface requirements for hallo flow's two
  judge-facing screens (Admin Dashboard, Tenant Portal) plus the Exception Queue,
  Agent Activity Log, KPI cards, and Time-Machine button. Use when building or
  editing any route under src/routes, any component under src/components, or
  wiring server-function data into the UI with TanStack Start + shadcn/ui +
  Tailwind v4.
---

# hallo flow UI (TanStack Start + shadcn/ui)

The story is **autonomy made visible**: the manager clicks one button, the system runs the
cycle, and the screens prove almost nothing was done by hand. Build for a <5-minute demo.

## Stack & conventions
- **TanStack Start** file routes in `src/routes/`. React 19, **Tailwind v4**,
  **shadcn/ui** primitives already vendored in `src/components/ui/` — compose them, don't
  hand-roll. `recharts` for charts, `sonner` for toasts, `lucide-react` for icons.
- Shared chrome: `src/components/app-shell.tsx`. Build feature widgets as small components.
- **Data via server functions**, not raw client queries. Call `getDashboardKpis`
  (`dashboard.functions.ts`), `getStripeStatus` / `advanceStripeMonth` (`stripe.functions.ts`).
  Browser-side reads use the anon client only.
- After a mutating action (Advance Month, accept plan, retry), re-query and re-render. Use
  `@tanstack/react-query` if you need caching/invalidation.

## Routes / surfaces
| Route | Surface | Must render |
|---|---|---|
| `/` (`index.tsx`) | Admin Dashboard | KPI cards + **Advance Month** button + final KPI banner |
| `/activity` | Agent Activity Log | one row per `agent_actions`: timestamp, event, decision, reason, result |
| `/exceptions` | Exception Queue | only cases needing attention or where the agent acted |
| `/tenant-portal` | Tenant Portal | rent status, amount due, retry, accept plan |

### Admin Dashboard (`/`)
10-second read of payment health. Cards: Expected Rent, Collected, Recovered by Agent, In
Payment Plan, Human Review, Auto-cleared %, Auto-recovered %, Human-review %. Source fields
from the `DashboardKpis` shape (expected, collected, recovered, paymentPlan, humanReview,
autoClearedPct, supportTickets…). The **Advance Month** button calls `advanceStripeMonth` —
show a spinner (clock poll can take ~30s), then refresh KPIs. Headline numbers as cards;
optional small chart via recharts.

### Exception Queue (`/exceptions`)
Card/table per exception: tenant · unit · property · rent month · amount · status · risk score
· recommended action · action history. Buttons: retry, send reminder, offer plan, escalate,
resolve. Show the risk movement (e.g. `72 → 38`) and `Human Needed: No/Yes`. Empty state when
the queue is clear is itself a selling point.

### Agent Activity Log (`/activity`)
Make the system trustworthy: timestamp, event, agent decision, **reason / policy basis**,
action taken, result — read from `agent_actions`. Chronological; the reason strings are the
star. Group by tenant or show a flat timeline.

### Tenant Portal (`/tenant-portal`)
Self-service recovery so no support ticket is created. Show: current rent status, SEPA/mandate/
payment-method status, amount due, and options — (1) Retry payment now, (2) Update payment
method, (3) Accept the offered N-part plan ("€600 today, €600 next Friday"), plus the agent's
message. Wire **Accept Plan** and **Retry** to their server functions and reflect the result
on the Admin Dashboard.

## The closing KPI banner (don't skip)
A prominent banner: **92% auto-cleared · 6% auto-recovered · 2% human review · 0 support
tickets**. This is the line judges remember.

## Quality bar
- Loading / empty / error states only where they affect the demo path.
- Cards for headline numbers, tables for queues/logs.
- `npx tsc --noEmit` and `bun run lint` clean before done.

(For data shapes see the **`supabase-data`** skill; for the Advance Month mechanics see
**`stripe-test-ops`**.)
