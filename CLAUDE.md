# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Package manager is **bun** (see `bun.lock`, `bunfig.toml`). Scripts:

- `bun run dev` — Vite dev server
- `bun run build` — production build (Cloudflare worker output via `@cloudflare/vite-plugin`)
- `bun run build:dev` — build in development mode
- `bun run preview` — preview the built worker locally
- `bun run lint` — ESLint over the repo
- `bun run format` — Prettier write

There is no test runner configured.

`bunfig.toml` enforces a 24-hour supply-chain guard (`minimumReleaseAge = 86400`). Before adding a freshly-published dependency to `minimumReleaseAgeExcludes`, confirm with the user.

## Architecture

**Stack:** TanStack Start (SSR) + TanStack Router (file-based) + React 19 + TanStack Query + Tailwind v4 + shadcn/ui, deployed to **Cloudflare Workers** via `wrangler.jsonc`. TypeScript strict mode; path alias `@/*` → `src/*`.

### Vite config is non-obvious

`vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, which **already bundles** `tanstackStart`, `viteReact`, `tailwindcss`, `tsConfigPaths`, the Cloudflare plugin (build-only), `componentTagger` (dev-only), `VITE_*` env injection, the `@` path alias, React/TanStack dedupe, the error-logger plugins, and sandbox port/host settings. **Do not re-add these plugins** — duplicates break the app. Extra config goes through `defineConfig({ vite: { ... } })`.

The config also redirects TanStack Start's server bundle entry to `src/server.ts` (see below). `wrangler.jsonc`'s `main` alone is not sufficient — `@cloudflare/vite-plugin` builds from the TanStack Start entry, so both must point at `server.ts`.

### SSR error handling is layered

Three pieces cooperate because h3 (TanStack Start's underlying server) swallows in-handler throws into opaque `{"unhandled":true,"message":"HTTPError"}` 500 JSON responses that a normal `try/catch` cannot see:

1. **`src/start.ts`** — registers a `requestMiddleware` that wraps `next()` in try/catch and returns the branded HTML error page for non-HTTP errors. This catches throws that propagate normally.
2. **`src/server.ts`** — the actual worker entry. Wraps the TanStack Start server-entry, and `normalizeCatastrophicSsrResponse` inspects 5xx JSON bodies that match the h3-swallowed shape and replaces them with the branded error page.
3. **`src/lib/error-capture.ts`** — installs global `error` / `unhandledrejection` listeners that record the most recent error (5s TTL) so `server.ts` can log the real stack when h3 has already discarded it.

When adding server logic, preserve this flow: throw real `Error`s (the capture layer will surface them), and don't intercept 500s upstream of `server.ts`.

### Routing

File-based via TanStack Router. Route files live in `src/routes/` (`__root.tsx`, `index.tsx`, etc.). `src/routeTree.gen.ts` is **generated** by the router plugin — do not hand-edit. Router is constructed in `src/router.tsx` with a `QueryClient` injected via route context; the root route's `RootComponent` provides the `QueryClientProvider`.

### UI components

shadcn/ui (style: `new-york`, base color `slate`, `tsx`) under `src/components/ui/`. Component aliases follow `components.json` — use `@/components/ui/*`, `@/lib/utils`, `@/hooks`. Icon library is `lucide-react`.

### `server-only` is banned

ESLint blocks `import "server-only"` — TanStack Start does not use Next.js's package. Mark server modules with the `.server.ts` suffix or `@tanstack/react-start/server-only` instead.

### Two-mode demo: offline vs live

The app is **hallo flow**, a property-manager rent-collection demo. It has two runtime modes selected by env:

- **Offline** (`DEMO_MODE=offline` / `VITE_DEMO_MODE` unset): everything is local. `src/lib/agentEngine.ts` runs a deterministic switch by `archetype`; `src/lib/stripeMock.ts` returns canned `PaymentEvent`s; the store reducer in `src/lib/store.tsx` handles `ADVANCE_MONTH` synchronously. No external calls.
- **Live** (`DEMO_MODE=live` and `VITE_DEMO_MODE=live`): real Stripe Test Mode (SEPA + Test Clocks), real Supabase Postgres, real Claude tool-use via `@anthropic-ai/sdk`. The reducer's `ADVANCE_MONTH` is a no-op; clicking the button POSTs to `/api/cycle/advance`, which iterates tenants → real PaymentIntents → Stripe webhooks → `runAgentForPaymentEventLlm` → DB writes → Supabase Realtime → store dispatches `LIVE_*` upsert actions.

Both share the same reducer state shape; components don't know which mode they're in.

### Cloudflare env access (server-only)

TanStack Start handlers don't auto-receive Workers `env`. `src/server.ts` wraps the fetch handler in `runWithEnv(env, ...)` which stashes `env` in `AsyncLocalStorage` (available because `nodejs_compat` is on). Any server module gets typed env via `getEnv()` from `src/lib/server/env.ts`. This is the foundation for `src/lib/server/{supabase,stripe,agentLlm,cycle}.ts` — none of them work without it.

### Live-mode wiring (when adding features)

- **API route** for live work: `src/routes/api.<resource>.<verb>.ts` with `createFileRoute(...)({ server: { handlers: { POST: ... } } })`. Read raw body via `await request.text()` before any parsing (needed for Stripe signature verification).
- **DB writes** → `src/lib/server/cycle.ts` (uses service-role Supabase client from `getServiceClient()`).
- **Stripe calls** → `src/lib/server/stripe.ts`. `chargeRent` takes an idempotency key keyed by `{tenant_id}_{cycle_month}` so retries are safe.
- **Agent decisions** → `src/lib/server/agentLlm.ts` calls Claude (model `claude-opus-4-7`) with a tool-use loop. System prompt + tools are cached via `cache_control: {type: "ephemeral"}`. Four tools: `retry_payment`, `send_reminder`, `offer_payment_plan`, `escalate_to_human` — each maps to an executor in `cycle.ts`.
- **Webhook idempotency** → `stripe_events` table; check before processing, insert on first receipt.
- **Client realtime** → `src/lib/client/supabase.ts` exposes the browser anon-key client; `HalloFlowProvider` subscribes to `tenants` / `agent_actions` / `exceptions` / `payment_plans` channels when `live` and dispatches `LIVE_UPSERT_*` actions to the reducer.

### Live-mode setup (must run before first live demo)

1. Apply `supabase/migrations/0001_init.sql` and `supabase/seed.sql` to the Supabase project. Realtime is enabled on the relevant tables by the migration.
2. Copy `.dev.vars.example` → `.dev.vars` and `.env.local.example` → `.env.local`; fill in keys.
3. `npx tsx scripts/setup-live.ts` — one-shot. Creates Stripe customers, SEPA test mandates (success/decline by archetype), and per-tenant Test Clocks; writes IDs back to Supabase. Idempotent.
4. `npm run dev` + `stripe listen --forward-to localhost:8080/api/stripe/webhook` in another terminal.

For production: `wrangler secret put STRIPE_SECRET_KEY` etc. (don't commit secrets). `wrangler.jsonc` only declares `DEMO_MODE`.
