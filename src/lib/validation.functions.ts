import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "./stripe.server";

export type ValidationState = {
  simulatedNow: string | null;
  counts: {
    tenants: number;
    rent_obligations: number;
    payment_events: number;
    exceptions: number;
    dunning_notices: number;
  };
  dunning: Array<{
    tenantId: string;
    tenantName: string;
    stage: number;
    defaultSince: string | null;
    accruedFees: number;
    accruedInterest: number;
  }>;
};

const DEMO_ANCHOR_DATE = "2026-05-01";

/** First working day (Mon–Fri) on or after the 1st of `monthStr` (YYYY-MM). */
function firstWorkingDayOfMonth(monthStr: string): string {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

/** Adds exactly 1 calendar month to a YYYY-MM-DD date (UTC), clamping the day. */
function addOneMonth(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const next = new Date(Date.UTC(y, m, d)); // m is 1-based → m as index = next month
  if (next.getUTCMonth() !== m % 12) {
    next.setUTCDate(0); // overflow → last day of intended month
  }
  return next.toISOString().slice(0, 10);
}

/** Ensures guardrails has simulated_now; initializes to the demo anchor on first read. */
async function ensureSimulatedNow(): Promise<string> {
  const { data: gr } = await supabaseAdmin
    .from("guardrails")
    .select("id, simulated_now")
    .maybeSingle();
  if (gr?.simulated_now) return gr.simulated_now as string;
  if (gr?.id) {
    await supabaseAdmin
      .from("guardrails")
      .update({ simulated_now: DEMO_ANCHOR_DATE })
      .eq("id", gr.id);
  } else {
    await supabaseAdmin
      .from("guardrails")
      .insert({ simulated_now: DEMO_ANCHOR_DATE });
  }
  return DEMO_ANCHOR_DATE;
}

export const getValidationState = createServerFn({ method: "GET" }).handler(
  async (): Promise<ValidationState> => {
    const simulatedNow = await ensureSimulatedNow();
    const [
      tenants,
      obligations,
      events,
      exceptions,
      dunning,
      dunningRows,
    ] = await Promise.all([
      supabaseAdmin.from("tenants").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("rent_obligations")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin.from("payment_events").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("exceptions").select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("dunning_notices")
        .select("id", { count: "exact", head: true }),
      supabaseAdmin
        .from("rent_obligations")
        .select(
          "tenant_id, dunning_stage, default_since, accrued_dunning_fees, accrued_default_interest",
        )
        .gt("dunning_stage", 0)
        .order("dunning_stage", { ascending: false }),
    ]);

    const tenantIds = Array.from(
      new Set((dunningRows.data ?? []).map((r) => r.tenant_id)),
    );
    const tenantMap = new Map<string, string>();
    if (tenantIds.length > 0) {
      const { data } = await supabaseAdmin
        .from("tenants")
        .select("id, name")
        .in("id", tenantIds);
      for (const t of data ?? []) tenantMap.set(t.id, t.name);
    }

    // Highest stage per tenant
    const byTenant = new Map<string, ValidationState["dunning"][number]>();
    for (const r of dunningRows.data ?? []) {
      const existing = byTenant.get(r.tenant_id);
      const row = {
        tenantId: r.tenant_id,
        tenantName: tenantMap.get(r.tenant_id) ?? "—",
        stage: r.dunning_stage,
        defaultSince: r.default_since,
        accruedFees: Number(r.accrued_dunning_fees ?? 0),
        accruedInterest: Number(r.accrued_default_interest ?? 0),
      };
      if (!existing || row.stage > existing.stage) byTenant.set(r.tenant_id, row);
    }

    return {
      simulatedNow,
      counts: {
        tenants: tenants.count ?? 0,
        rent_obligations: obligations.count ?? 0,
        payment_events: events.count ?? 0,
        exceptions: exceptions.count ?? 0,
        dunning_notices: dunning.count ?? 0,
      },
      dunning: Array.from(byTenant.values()).sort((a, b) => b.stage - a.stage),
    };
  },
);

/**
 * Returns a valid Stripe customer ID for the tenant. If the stored ID is
 * missing in Stripe (e.g. account/key rotation), recreates the customer and
 * updates `tenants.stripe_customer_id` in place.
 */
async function ensureStripeCustomer(
  stripe: ReturnType<typeof getStripe>,
  tenant: { id: string; name: string; stripe_customer_id: string | null },
): Promise<string> {
  if (tenant.stripe_customer_id) {
    try {
      const c = await stripe.customers.retrieve(tenant.stripe_customer_id);
      if (!(c as { deleted?: boolean }).deleted) {
        return tenant.stripe_customer_id;
      }
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!/No such customer|resource_missing/i.test(msg)) throw e;
      // fall through → recreate
    }
  }
  const fresh = await stripe.customers.create({
    name: tenant.name,
    metadata: { tenant_id: tenant.id, recreated: "true" },
  });
  await supabaseAdmin
    .from("tenants")
    .update({ stripe_customer_id: fresh.id })
    .eq("id", tenant.id);
  console.warn(
    `[runSepaRun] Recreated Stripe customer for ${tenant.name}: ${fresh.id}`,
  );
  return fresh.id;
}

export const runSepaRun = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ triggered: number; skipped: number; errors: string[] }> => {
    const stripe = getStripe();

    const simulatedNow = await ensureSimulatedNow();
    const today = new Date(simulatedNow);
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth();
    const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
    const dueDate = firstWorkingDayOfMonth(monthStr);

    // Tenants with stripe customer + active mandate
    const { data: tenants, error } = await supabaseAdmin
      .from("tenants")
      .select(
        "id, name, rent_amount, stripe_customer_id, unit_id, behavior_profile, sepa_mandates!inner(id, status)",
      )
      .not("stripe_customer_id", "is", null)
      .eq("sepa_mandates.status", "active");
    if (error) throw new Error(error.message);

    let triggered = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const t of tenants ?? []) {
      try {
        const { data: unit } = await supabaseAdmin
          .from("units")
          .select("property_id")
          .eq("id", t.unit_id)
          .maybeSingle();
        if (!unit?.property_id) {
          skipped++;
          continue;
        }

        // Idempotency: skip if rent_obligation already exists
        const { data: existing } = await supabaseAdmin
          .from("rent_obligations")
          .select("id")
          .eq("tenant_id", t.id)
          .eq("month", monthStr)
          .maybeSingle();

        let obligationId: string;
        if (existing) {
          obligationId = existing.id;
        } else {
          const { data: ins, error: insErr } = await supabaseAdmin
            .from("rent_obligations")
            .insert({
              tenant_id: t.id,
              unit_id: t.unit_id,
              property_id: unit.property_id,
              month: monthStr,
              due_date: dueDate,
              amount: t.rent_amount,
              status: "pending",
            })
            .select("id")
            .single();
          if (insErr) throw new Error(insErr.message);
          obligationId = ins.id;
        }

        // Self-heal stale customer
        const customerId = await ensureStripeCustomer(stripe, t);

        // Deterministic test PMs: critical profile → declined, else → success.
        // These Stripe-managed PaymentMethod tokens work without being attached
        // to the customer and are idempotent across runs.
        const pmToken =
          t.behavior_profile === "critical"
            ? "pm_card_chargeDeclined"
            : "pm_card_visa";
        const amount = Math.round(Number(t.rent_amount) * 100);

        try {
          const pi = await stripe.paymentIntents.create({
            customer: customerId,
            amount,
            currency: "eur",
            payment_method: pmToken,
            payment_method_types: ["card"],
            confirm: true,
            metadata: {
              tenant_id: t.id,
              rent_obligation_id: obligationId,
              month: monthStr,
            },
          });
          console.log(
            `[runSepaRun] ${t.name}: PaymentIntent ${pi.id} status=${pi.status}`,
          );
        } catch (piErr) {
          const msg = (piErr as Error).message;
          console.warn(
            `[runSepaRun] PaymentIntent failed (expected for critical): ${t.name}: ${msg}`,
          );
          // Record a payment_event so the failure surfaces in the UI even if
          // Stripe webhooks don't deliver to this dev preview.
          await supabaseAdmin.from("payment_events").insert({
            rent_obligation_id: obligationId,
            tenant_id: t.id,
            unit_id: t.unit_id,
            type: "charge_failed",
            amount: Number(t.rent_amount),
            failure_reason: msg.slice(0, 250),
            source: "sepa_run",
            occurred_at: new Date().toISOString(),
          });
        }

        triggered++;
      } catch (e) {
        errors.push(`${t.name}: ${(e as Error).message}`);
      }
    }

    return { triggered, skipped, errors };
  },
);


export const advanceSimulatedMonth = createServerFn({ method: "POST" }).handler(
  async (): Promise<{
    from: string;
    to: string;
    message: string;
    stripeAdvanced: boolean;
    dunning: { stages_issued?: number; error?: string } | null;
  }> => {
    const from = await ensureSimulatedNow();
    const to = addOneMonth(from);

    const { data: gr } = await supabaseAdmin
      .from("guardrails")
      .select("id, stripe_test_clock_id")
      .maybeSingle();
    if (gr?.id) {
      await supabaseAdmin
        .from("guardrails")
        .update({ simulated_now: to })
        .eq("id", gr.id);
    }

    // Best-effort: nudge the Stripe test clock to the new simulated date so
    // subscription invoices align with the demo timeline.
    let stripeAdvanced = false;
    if (gr?.stripe_test_clock_id) {
      try {
        const stripe = getStripe();
        const frozen = Math.floor(new Date(to + "T08:00:00Z").getTime() / 1000);
        await stripe.testHelpers.testClocks.advance(gr.stripe_test_clock_id, {
          frozen_time: frozen,
        });
        stripeAdvanced = true;
      } catch (e) {
        console.warn(
          `[advanceSimulatedMonth] stripe advance failed: ${(e as Error).message}`,
        );
      }
    }

    // Trigger dunning engine for the new "today".
    let dunning: { stages_issued?: number; error?: string } | null = null;
    try {
      const { data, error } = await supabaseAdmin.functions.invoke<{
        stages_issued?: number;
      }>("run-dunning", { body: { as_of: to } });
      if (error) dunning = { error: error.message };
      else dunning = data ?? null;
    } catch (e) {
      dunning = { error: (e as Error).message };
    }

    return {
      from,
      to,
      message: `Demo-Datum: ${from} → ${to}`,
      stripeAdvanced,
      dunning,
    };
  },
);
