import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "./stripe.server";

export type ResetResult = {
  stripeDeleted: number;
  stripeError: string | null;
  propertiesDeleted: number;
};

const TABLES_IN_ORDER = [
  "agent_actions",
  "dunning_notices",
  "exceptions",
  "communications",
  "payment_events",
  "payment_plan_installments",
  "payment_plans",
  "rent_obligations",
  "sepa_mandates",
  "tenants",
  "units",
] as const;

export const resetDemo = createServerFn({ method: "POST" }).handler(
  async (): Promise<ResetResult> => {
    // 1. Delete tenant-side data in FK-safe order
    for (const table of TABLES_IN_ORDER) {
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .not("id", "is", null);
      if (error) {
        throw new Error(`Failed to clear ${table}: ${error.message}`);
      }
    }

    // 2. Delete seeded properties (preserve the original demo property)
    let propertiesDeleted = 0;
    const { data: seedProps } = await supabaseAdmin
      .from("properties")
      .select("id")
      .like("name", "Hallo Theo · %")
      .neq("name", "Hallo Theo · Berlin Mitte Portfolio");
    const seedIds = (seedProps ?? []).map((p) => p.id);
    if (seedIds.length > 0) {
      // Units already cleared above, but ensure any straggler units are gone
      await supabaseAdmin.from("units").delete().in("property_id", seedIds);
      const { error: pErr } = await supabaseAdmin
        .from("properties")
        .delete()
        .in("id", seedIds);
      if (pErr) {
        throw new Error(`Failed to delete seed properties: ${pErr.message}`);
      }
      propertiesDeleted = seedIds.length;
    }

    // 3. Reset simulated_now + clear stripe_test_clock_id reference
    const { error: grErr } = await supabaseAdmin
      .from("guardrails")
      .update({ simulated_now: "2026-05-01", stripe_test_clock_id: null })
      .not("id", "is", null);
    if (grErr) {
      throw new Error(`Failed to reset guardrails: ${grErr.message}`);
    }

    // 4. Stripe cleanup — delete all customers in sandbox
    let stripeDeleted = 0;
    let stripeError: string | null = null;
    try {
      const stripe = getStripe();
      try {
        for await (const clock of stripe.testHelpers.testClocks.list({
          limit: 100,
        })) {
          try {
            await (stripe.testHelpers.testClocks as unknown as { delete: (id: string) => Promise<unknown> }).delete(clock.id);
          } catch {
            // ignore individual failures
          }
        }
      } catch {
        // ignore — listing may not be supported in all modes
      }

      for await (const customer of stripe.customers.list({ limit: 100 })) {
        try {
          await stripe.customers.del(customer.id);
          stripeDeleted++;
        } catch (e) {
          stripeError = (e as Error).message;
        }
      }
    } catch (e) {
      stripeError = (e as Error).message;
    }

    return { stripeDeleted, stripeError, propertiesDeleted };
  },
);
