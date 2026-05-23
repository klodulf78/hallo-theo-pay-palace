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
