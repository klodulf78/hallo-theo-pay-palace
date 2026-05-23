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
      simulatedNow: gr?.simulated_now ?? null,
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

export const runSepaRun = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ triggered: number; skipped: number; errors: string[] }> => {
    const stripe = getStripe();

    const { data: gr } = await supabaseAdmin
      .from("guardrails")
      .select("simulated_now")
      .maybeSingle();
    const today = gr?.simulated_now
      ? new Date(gr.simulated_now)
      : new Date();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth(); // 0-indexed
    const monthStr = `${year}-${String(month + 1).padStart(2, "0")}`;
    const dueDate = `${monthStr}-01`;

    // Tenants with stripe customer + active mandate
    const { data: tenants, error } = await supabaseAdmin
      .from("tenants")
      .select(
        "id, name, rent_amount, stripe_customer_id, unit_id, sepa_mandates!inner(id, status)",
      )
      .not("stripe_customer_id", "is", null)
      .eq("sepa_mandates.status", "active");
    if (error) throw new Error(error.message);

    let triggered = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const t of tenants ?? []) {
      try {
        // unit -> property
        const { data: unit } = await supabaseAdmin
          .from("units")
          .select("property_id")
          .eq("id", t.unit_id)
          .maybeSingle();
        if (!unit?.property_id) {
          skipped++;
          continue;
        }

        // Idempotency: skip if rent_obligation already exists for this tenant+month
        const { data: existing } = await supabaseAdmin
          .from("rent_obligations")
          .select("id")
          .eq("tenant_id", t.id)
          .eq("month", monthStr)
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        const { error: insErr } = await supabaseAdmin
          .from("rent_obligations")
          .insert({
            tenant_id: t.id,
            unit_id: t.unit_id,
            property_id: unit.property_id,
            month: monthStr,
            due_date: dueDate,
            amount: t.rent_amount,
            status: "pending",
          });
        if (insErr) throw new Error(insErr.message);

        // Try SEPA first, fall back to card
        let pmType: "sepa_debit" | "card" = "sepa_debit";
        try {
          await stripe.paymentIntents.create({
            customer: t.stripe_customer_id!,
            amount: Math.round(Number(t.rent_amount) * 100),
            currency: "eur",
            payment_method_types: [pmType],
            confirm: true,
            mandate_data: {
              customer_acceptance: {
                type: "online",
                online: {
                  ip_address: "127.0.0.1",
                  user_agent: "hallo-flow-demo",
                },
              },
            },
            metadata: { tenant_id: t.id, month: monthStr },
          });
        } catch (sepaErr) {
          pmType = "card";
          console.warn(
            `[runSepaRun] SEPA failed for ${t.name}, falling back to card: ${(sepaErr as Error).message}`,
          );
          await stripe.paymentIntents.create({
            customer: t.stripe_customer_id!,
            amount: Math.round(Number(t.rent_amount) * 100),
            currency: "eur",
            payment_method_types: ["card"],
            confirm: true,
            metadata: { tenant_id: t.id, month: monthStr },
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
