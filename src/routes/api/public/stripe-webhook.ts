import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe, getWebhookSecret } from "@/lib/stripe.server";

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const stripe = getStripe();
        const sig = request.headers.get("stripe-signature");
        const body = await request.text();

        let event: Stripe.Event;
        try {
          event = await stripe.webhooks.constructEventAsync(
            body,
            sig ?? "",
            getWebhookSecret(),
          );
        } catch (e) {
          return new Response(
            `Webhook signature verification failed: ${(e as Error).message}`,
            { status: 400 },
          );
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
    case "invoice.paid":
    case "invoice.payment_succeeded":
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

async function resolveTenantCtx(
  customerId: string | null,
): Promise<TenantCtx | null> {
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

function invoiceMonth(inv: Stripe.Invoice): string {
  const ts = (inv.period_end || inv.created) * 1000;
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
      status: "expected",
      stripe_invoice_id: inv.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return inserted.id;
}

async function onInvoicePaid(inv: Stripe.Invoice) {
  const obligationId = await upsertObligationFromInvoice(inv);
  const ctx = await resolveTenantCtx(
    typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? null),
  );
  if (!ctx || !obligationId) return;

  await supabaseAdmin
    .from("rent_obligations")
    .update({ status: "paid" })
    .eq("id", obligationId);

  await supabaseAdmin.from("payment_events").insert({
    tenant_id: ctx.tenant_id,
    unit_id: ctx.unit_id,
    rent_obligation_id: obligationId,
    type: "payment_succeeded",
    amount: (inv.amount_paid ?? 0) / 100,
    source: "stripe",
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
  const newStatus = attemptCount >= 3 ? "human_review" : "retry_scheduled";

  await supabaseAdmin
    .from("rent_obligations")
    .update({ status: newStatus })
    .eq("id", obligationId);

  // Failure reason from last_payment_error if available
  const charge = (inv as unknown as { last_finalization_error?: { message?: string } })
    .last_finalization_error;
  const reason = charge?.message ?? "card_declined";

  await supabaseAdmin.from("payment_events").insert({
    tenant_id: ctx.tenant_id,
    unit_id: ctx.unit_id,
    rent_obligation_id: obligationId,
    type: "payment_failed",
    amount: (inv.amount_due ?? 0) / 100,
    failure_reason: reason,
    source: "stripe",
    stripe_event_id: inv.id,
    occurred_at: new Date().toISOString(),
  });

  // Create / refresh exception
  const { data: existingExc } = await supabaseAdmin
    .from("exceptions")
    .select("id")
    .eq("rent_obligation_id", obligationId)
    .maybeSingle();

  const severity = attemptCount >= 3 ? "high" : "medium";
  const recommended =
    attemptCount >= 3 ? "escalate_to_human" : "schedule_retry";

  if (existingExc) {
    await supabaseAdmin
      .from("exceptions")
      .update({
        severity,
        recommended_action: recommended,
        human_needed: attemptCount >= 3,
        status: "open",
      })
      .eq("id", existingExc.id);
  } else {
    await supabaseAdmin.from("exceptions").insert({
      tenant_id: ctx.tenant_id,
      unit_id: ctx.unit_id,
      rent_obligation_id: obligationId,
      type: "payment_failed",
      severity,
      status: "open",
      human_needed: attemptCount >= 3,
      recommended_action: recommended,
      risk_score: 50 + attemptCount * 10,
    });
  }
}
