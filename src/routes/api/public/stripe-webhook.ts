import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe, getWebhookSecret } from "@/lib/stripe.server";
import { runPaymentRecoveryAgent } from "@/lib/payment-recovery-agent.server";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const stripe = getStripe();
        const sig = request.headers.get("stripe-signature");
        const body = await request.text();

        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(body, sig ?? "", getWebhookSecret());
        } catch (e) {
          return new Response(`Webhook signature verification failed: ${(e as Error).message}`, {
            status: 400,
          });
        }

        try {
          await handleEvent(event);
        } catch (e) {
          console.error("stripe-webhook handler error", event.type, e);
          return new Response(`handler error: ${(e as Error).message}`, {
            status: 500,
          });
        }

        return new Response("ok");
      },
    },
  },
});

async function handleEvent(event: Stripe.Event) {
  switch (event.type) {
    case "invoice.payment_succeeded":
      // Only handle payment_succeeded (Stripe also fires invoice.paid for the
      // same invoice — handling both would double-insert payment_events).
      await onInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_failed":
      await onInvoiceFailed(event.data.object as Stripe.Invoice);
      break;
    case "invoice.created":
      await upsertObligationFromInvoice(event.data.object as Stripe.Invoice);
      break;
    default:
      // ignore other events for the demo
      break;
  }
}

type TenantCtx = {
  tenant_id: string;
  unit_id: string;
  property_id: string;
};

async function resolveTenantCtx(customerId: string | null): Promise<TenantCtx | null> {
  if (!customerId) return null;
  const { data: tenant } = await supabaseAdmin
    .from("tenants")
    .select("id, unit_id, units!inner(property_id)")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (!tenant) return null;
  // supabase typing for inner join returns array — normalize
  const unit = Array.isArray((tenant as { units: unknown }).units)
    ? (tenant as unknown as { units: { property_id: string }[] }).units[0]
    : (tenant as unknown as { units: { property_id: string } }).units;
  return {
    tenant_id: tenant.id,
    unit_id: tenant.unit_id,
    property_id: unit.property_id,
  };
}

// payment_events.failure_reason CHECK enum: insufficient_funds|invalid_mandate|chargeback_dispute
type FailureReason = "insufficient_funds" | "invalid_mandate" | "chargeback_dispute";

/**
 * Map a free-text Stripe decline message/code to the 3-value DB enum.
 * Defaults to "insufficient_funds" for recognized decline-ish text; returns
 * null when truly unknown so we write NULL rather than violate the CHECK.
 */
function mapFailureReason(raw: string | null | undefined): FailureReason | null {
  if (!raw) return "insufficient_funds";
  const s = raw.toLowerCase();
  if (
    s.includes("mandate") ||
    s.includes("authorization") ||
    s.includes("authorisation") ||
    s.includes("debit not authorized")
  ) {
    return "invalid_mandate";
  }
  if (s.includes("dispute") || s.includes("chargeback")) {
    return "chargeback_dispute";
  }
  if (
    s.includes("insufficient") ||
    s.includes("funds") ||
    s.includes("declin") ||
    s.includes("card") ||
    s.includes("nsf")
  ) {
    return "insufficient_funds";
  }
  // Unknown -> let the column be NULL instead of writing free text.
  return null;
}

function invoiceMonth(inv: Stripe.Invoice): string {
  // Use period_start = the month the rent is FOR (period_end is the next
  // boundary, which would label obligations a month ahead).
  const ts = ((inv.period_start ?? inv.period_end ?? inv.created) as number) * 1000;
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function invoiceDueDate(inv: Stripe.Invoice): string {
  const ts = ((inv.due_date ?? inv.period_end ?? inv.created) as number) * 1000;
  return new Date(ts).toISOString().slice(0, 10);
}

async function upsertObligationFromInvoice(inv: Stripe.Invoice) {
  if (!inv.id) return null;
  const ctx = await resolveTenantCtx(
    typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null),
  );
  if (!ctx) return null;

  const amount = (inv.amount_due ?? 0) / 100;
  const month = invoiceMonth(inv);
  const due = invoiceDueDate(inv);

  // Check for existing obligation by stripe_invoice_id
  const { data: existing } = await supabaseAdmin
    .from("rent_obligations")
    .select("id, status")
    .eq("stripe_invoice_id", inv.id)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: inserted, error } = await supabaseAdmin
    .from("rent_obligations")
    .insert({
      tenant_id: ctx.tenant_id,
      unit_id: ctx.unit_id,
      property_id: ctx.property_id,
      amount,
      month,
      due_date: due,
      // schema CHECK: pending|paid|reconciled|failed|auto_recovered|payment_plan|human_review
      status: "pending",
      stripe_invoice_id: inv.id,
    })
    .select("id")
    .single();
  // Resilience: a single bad insert must not 500 the whole handler and block
  // every downstream event. Log and bail out for this invoice only.
  if (error) {
    console.error("upsertObligationFromInvoice insert failed", inv.id, error.message);
    return null;
  }
  return inserted.id;
}

async function onInvoicePaid(inv: Stripe.Invoice) {
  const obligationId = await upsertObligationFromInvoice(inv);
  const ctx = await resolveTenantCtx(
    typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null),
  );
  if (!ctx || !obligationId) return;

  await supabaseAdmin.from("rent_obligations").update({ status: "paid" }).eq("id", obligationId);

  await supabaseAdmin.from("payment_events").insert({
    tenant_id: ctx.tenant_id,
    unit_id: ctx.unit_id,
    rent_obligation_id: obligationId,
    // schema CHECK type: charged|succeeded|failed|retry
    type: "succeeded",
    amount: (inv.amount_paid ?? 0) / 100,
    // schema CHECK source: stripe_webhook|simulation
    source: "stripe_webhook",
    stripe_event_id: inv.id,
    occurred_at: new Date().toISOString(),
  });

  // Clear any open exception for this obligation
  await supabaseAdmin
    .from("exceptions")
    .update({ status: "resolved" })
    .eq("rent_obligation_id", obligationId);
}

async function onInvoiceFailed(inv: Stripe.Invoice) {
  const obligationId = await upsertObligationFromInvoice(inv);
  const ctx = await resolveTenantCtx(
    typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null),
  );
  if (!ctx || !obligationId) return;

  const attemptCount = inv.attempt_count ?? 1;
  // schema CHECK status: ...|failed|...|human_review. Pre-agent we only mark the
  // obligation failed (or human_review once retries are exhausted). The recovery
  // agent owns any later transition to auto_recovered / payment_plan / human_review.
  const newStatus = attemptCount >= 3 ? "human_review" : "failed";

  await supabaseAdmin.from("rent_obligations").update({ status: newStatus }).eq("id", obligationId);

  // Failure reason from last_finalization_error if available, mapped to the enum.
  const finErr = (
    inv as unknown as { last_finalization_error?: { message?: string; code?: string } }
  ).last_finalization_error;
  const rawReason = finErr?.code ?? finErr?.message ?? null;
  const failureReason = mapFailureReason(rawReason);

  await supabaseAdmin.from("payment_events").insert({
    tenant_id: ctx.tenant_id,
    unit_id: ctx.unit_id,
    rent_obligation_id: obligationId,
    // schema CHECK type: charged|succeeded|failed|retry
    type: "failed",
    amount: (inv.amount_due ?? 0) / 100,
    // omit the field (NULL) when we couldn't map to the enum
    ...(failureReason ? { failure_reason: failureReason } : {}),
    // schema CHECK source: stripe_webhook|simulation
    source: "stripe_webhook",
    stripe_event_id: inv.id,
    occurred_at: new Date().toISOString(),
  });

  // Hand off to the AI recovery agent. ensureExceptionForObligation creates a
  // single schema-valid exception row; the agent then overwrites
  // recommended_action / human_needed / status / risk_score with its decision
  // and performs the chosen side effects (retry, plan offer, reminder, escalate).
  const exceptionId = await ensureExceptionForObligation({
    obligationId,
    tenantId: ctx.tenant_id,
    unitId: ctx.unit_id,
    attemptCount,
  });
  if (exceptionId) {
    await runPaymentRecoveryAgent({
      exceptionId,
      tenantId: ctx.tenant_id,
      unitId: ctx.unit_id,
      rentObligationId: obligationId,
      invoiceId: inv.id ?? null,
      invoiceAmount: (inv.amount_due ?? 0) / 100,
      failureReason: failureReason ?? "insufficient_funds",
      attemptCount,
    });
  }
}

async function ensureExceptionForObligation(args: {
  obligationId: string;
  tenantId: string;
  unitId: string;
  attemptCount: number;
}): Promise<string | null> {
  const { data: found } = await supabaseAdmin
    .from("exceptions")
    .select("id")
    .eq("rent_obligation_id", args.obligationId)
    .maybeSingle();
  if (found) return found.id;

  // Create a schema-valid exception row so the agent always has something to
  // update. All values below satisfy the CHECK constraints:
  //   type ∈ payment_failed|repeated_failure|invalid_mandate|dispute
  //   severity ∈ low|medium|high|critical
  //   status ∈ open|in_progress|resolved|escalated
  //   recommended_action ∈ retry|reminder|payment_plan|escalate
  const escalating = args.attemptCount >= 3;
  const { data: inserted, error } = await supabaseAdmin
    .from("exceptions")
    .insert({
      tenant_id: args.tenantId,
      unit_id: args.unitId,
      rent_obligation_id: args.obligationId,
      type: escalating ? "repeated_failure" : "payment_failed",
      severity: escalating ? "high" : "medium",
      status: "open",
      human_needed: escalating,
      recommended_action: escalating ? "escalate" : "retry",
      risk_score: 50 + args.attemptCount * 10,
    })
    .select("id")
    .single();
  if (error) {
    console.error("ensureExceptionForObligation insert failed", args.obligationId, error.message);
    return null;
  }
  return inserted?.id ?? null;
}
