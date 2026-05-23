import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | undefined;

export function getBrowserSupabase(): SupabaseClient | undefined {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anon) return undefined;
  if (cached) return cached;
  cached = createClient(url, anon, {
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return cached;
}

export function isLiveMode(): boolean {
  return (import.meta.env.VITE_DEMO_MODE as string | undefined) === "live";
}
