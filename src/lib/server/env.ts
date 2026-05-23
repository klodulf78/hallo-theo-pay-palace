import { AsyncLocalStorage } from "node:async_hooks";

export interface HalloFlowEnv {
  DEMO_MODE: "offline" | "live";
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ANTHROPIC_API_KEY: string;
}

const storage = new AsyncLocalStorage<HalloFlowEnv>();

export function runWithEnv<T>(env: HalloFlowEnv, fn: () => T): T {
  return storage.run(env, fn);
}

export function getEnv(): HalloFlowEnv {
  const env = storage.getStore();
  if (!env) {
    throw new Error(
      "Cloudflare env not available in this context. Did the request go through src/server.ts?",
    );
  }
  return env;
}

export function tryGetEnv(): HalloFlowEnv | undefined {
  return storage.getStore();
}

export function isLiveMode(): boolean {
  return tryGetEnv()?.DEMO_MODE === "live";
}
