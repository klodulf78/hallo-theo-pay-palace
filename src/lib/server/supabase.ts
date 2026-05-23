import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "./env";

let cached: SupabaseClient | undefined;
let cachedUrl = "";

export function getServiceClient(): SupabaseClient {
  const env = getEnv();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase env vars not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  if (cached && cachedUrl === env.SUPABASE_URL) return cached;
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  cachedUrl = env.SUPABASE_URL;
  return cached;
}

export interface TenantRow {
  id: string;
  name: string;
  unit: string;
  rent_cents: number;
  archetype: "reliable" | "soft_fail" | "payment_plan" | "critical";
  status:
    | "current"
    | "paid"
    | "retry_succeeded"
    | "payment_plan_offered"
    | "payment_plan_accepted"
    | "escalated";
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  stripe_test_clock_id: string | null;
}

export async function loadTenants(): Promise<TenantRow[]> {
  const sb = getServiceClient();
  const { data, error } = await sb.from("tenants").select("*").order("unit");
  if (error) throw error;
  return (data ?? []) as TenantRow[];
}

export async function loadTenant(id: string): Promise<TenantRow | null> {
  const sb = getServiceClient();
  const { data, error } = await sb.from("tenants").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return (data ?? null) as TenantRow | null;
}
