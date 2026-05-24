import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "./stripe.server";

export type ValidationState = {
  simulatedNow: string | null;
  counts: {
    properties: number;
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

async function obligationHasPaymentEvent(obligationId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("payment_events")
    .select("id")
    .eq("rent_obligation_id", obligationId)
    .maybeSingle();
  return Boolean(data);
}

type SepaRunResult = {
  triggered: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: string[];
};

async function runSepaForMonth(simulatedNow: string): Promise<SepaRunResult> {
  const stripe = getStripe();

  const today = new Date(simulatedNow);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
  const dueDate = firstWorkingDayOfMonth(monthStr);

  const { data: tenants, error } = await supabaseAdmin
    .from("tenants")
    .select(
      "id, name, rent_amount, stripe_customer_id, unit_id, behavior_profile, sepa_mandates!inner(id, status)",
    )
    .not("stripe_customer_id", "is", null)
    .eq("sepa_mandates.status", "active");
  if (error) throw new Error(error.message);

  let triggered = 0;
  let succeeded = 0;
  let failed = 0;
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

      // Idempotency: if this obligation already has a payment_event, don't
      // re-charge — prevents duplicate Stripe PaymentIntents on double-click.
      if (await obligationHasPaymentEvent(obligationId)) {
        skipped++;
        continue;
      }

      const customerId = await ensureStripeCustomer(stripe, t);

      const pmToken =
        t.behavior_profile === "critical"
          ? "pm_card_chargeDeclined"
          : "pm_card_visa";
      const amount = Math.round(Number(t.rent_amount) * 100);

      try {
        const pi = await stripe.paymentIntents.create(
          {
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
          },
          {
            // Idempotency key prevents Stripe-side duplication if the call
            // is replayed within 24h for the same obligation.
            idempotencyKey: `sepa-${obligationId}`,
          },
        );
        console.log(
          `[runSepaForMonth] ${t.name}: PaymentIntent ${pi.id} status=${pi.status}`,
        );
        if (
          pi.status === "succeeded" &&
          !(await obligationHasPaymentEvent(obligationId))
        ) {
          await supabaseAdmin.from("payment_events").insert({
            rent_obligation_id: obligationId,
            tenant_id: t.id,
            unit_id: t.unit_id,
            type: "succeeded",
            amount: Number(t.rent_amount),
            source: "simulation",
            stripe_event_id: pi.id,
            occurred_at: new Date(pi.created * 1000).toISOString(),
          });
          await supabaseAdmin
            .from("rent_obligations")
            .update({
              status: "paid",
              dunning_stage: 0,
              default_since: null,
              accrued_dunning_fees: 0,
              accrued_default_interest: 0,
            })
            .eq("id", obligationId);
          succeeded++;
        }
      } catch (piErr) {
        const msg = (piErr as Error).message;
        console.warn(
          `[runSepaForMonth] PaymentIntent failed (expected for critical): ${t.name}: ${msg}`,
        );
        await supabaseAdmin.from("payment_events").insert({
          rent_obligation_id: obligationId,
          tenant_id: t.id,
          unit_id: t.unit_id,
          type: "failed",
          amount: Number(t.rent_amount),
          failure_reason: "insufficient_funds",
          source: "simulation",
          occurred_at: new Date().toISOString(),
        });
        await supabaseAdmin
          .from("rent_obligations")
          .update({ status: "failed" })
          .eq("id", obligationId);
        failed++;
      }

      triggered++;
    } catch (e) {
      errors.push(`${t.name}: ${(e as Error).message}`);
    }
  }

  return { triggered, succeeded, failed, skipped, errors };
}

export const runSepaRun = createServerFn({ method: "POST" }).handler(
  async (): Promise<SepaRunResult> => {
    const simulatedNow = await ensureSimulatedNow();
    return runSepaForMonth(simulatedNow);
  },
);

export const advanceSimulatedMonth = createServerFn({ method: "POST" }).handler(
  async (): Promise<{
    from: string;
    to: string;
    message: string;
    stripeAdvanced: boolean;
    sepa: SepaRunResult;
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

    // Best-effort: nudge the Stripe test clock to the new simulated date.
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

    // Run SEPA-Lauf for the new month (idempotent).
    const sepa = await runSepaForMonth(to);

    // Brief settle window for webhooks (synchronous path already recorded events).
    await new Promise((r) => setTimeout(r, 2000));

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

    const monthLabel = new Date(`${to}T00:00:00Z`).toLocaleDateString("de-DE", {
      month: "long",
      year: "numeric",
    });
    const stages = dunning?.stages_issued ?? 0;
    const message =
      `Monat ${monthLabel} simuliert: ${sepa.triggered} neue Mieten · ` +
      `${sepa.succeeded} erfolgreich · ${sepa.failed} fehlgeschlagen · ` +
      `${stages} neue Mahnungen.`;

    return {
      from,
      to,
      message,
      stripeAdvanced,
      sepa,
      dunning,
    };
  },
);

