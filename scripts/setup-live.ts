// One-shot bootstrap for live demo mode. Run with:
//   npx tsx scripts/setup-live.ts
//
// Reads env from process.env (load via dotenv or shell). Idempotent: it skips
// tenants that already have a Stripe customer + payment method + test clock.
import "dotenv/config";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing env. Need STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  typescript: true,
});
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface TenantRow {
  id: string;
  name: string;
  unit: string;
  rent_cents: number;
  archetype: "reliable" | "soft_fail" | "payment_plan" | "critical";
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  stripe_test_clock_id: string | null;
}

const SEPA_TEST_IBAN_BY_ARCHETYPE: Record<TenantRow["archetype"], string> = {
  reliable: "DE89370400440532013000",
  soft_fail: "DE89370400440532013000",
  payment_plan: "DE62370400440532013001",
  critical: "DE62370400440532013001",
};

async function bootstrapTenant(tenant: TenantRow): Promise<void> {
  if (tenant.stripe_customer_id && tenant.stripe_payment_method_id && tenant.stripe_test_clock_id) {
    console.log(`[${tenant.id}] already bootstrapped — skipping`);
    return;
  }

  console.log(`[${tenant.id}] creating test clock + customer + SEPA mandate`);

  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(new Date("2026-05-01T00:00:00Z").getTime() / 1000),
    name: `tenant_${tenant.id}_${tenant.unit}`,
  });

  const customer = await stripe.customers.create({
    name: tenant.name,
    email: `${tenant.id}@hallo-flow.demo`,
    test_clock: clock.id,
    metadata: { tenant_id: tenant.id, unit: tenant.unit, archetype: tenant.archetype },
  });

  const pm = await stripe.paymentMethods.create({
    type: "sepa_debit",
    sepa_debit: { iban: SEPA_TEST_IBAN_BY_ARCHETYPE[tenant.archetype] },
    billing_details: {
      name: tenant.name,
      email: `${tenant.id}@hallo-flow.demo`,
    },
    metadata: { archetype: tenant.archetype },
  });
  await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
  await stripe.customers.update(customer.id, {
    invoice_settings: { default_payment_method: pm.id },
  });

  await sb
    .from("tenants")
    .update({
      stripe_customer_id: customer.id,
      stripe_payment_method_id: pm.id,
      stripe_test_clock_id: clock.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tenant.id);

  console.log(`[${tenant.id}] ✓ customer=${customer.id} pm=${pm.id} clock=${clock.id}`);
}

async function main(): Promise<void> {
  const { data: tenants, error } = await sb.from("tenants").select("*").order("unit");
  if (error) throw error;
  if (!tenants || tenants.length === 0) {
    console.error("No tenants found. Did you run supabase/seed.sql?");
    process.exit(1);
  }

  for (const tenant of tenants as TenantRow[]) {
    try {
      await bootstrapTenant(tenant);
    } catch (err) {
      console.error(`[${tenant.id}] failed:`, (err as Error).message);
    }
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("setup-live failed:", err);
  process.exit(1);
});
