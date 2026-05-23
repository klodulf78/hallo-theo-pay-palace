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
    case "customer.created":
    case "customer.updated":
      await onCustomerUpsert(event.data.object as Stripe.Customer);
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await onSubscriptionUpsert(event.data.object as Stripe.Subscription);
      break;
    case "customer.subscription.deleted":
      await onSubscriptionDeleted(event.data.object as Stripe.Subscription);
      break;
    case "invoice.created":
      await upsertObligationFromInvoice(event.data.object as Stripe.Invoice);
      break;
    case "invoice.paid":
    case "invoice.payment_succeeded":
      await onInvoicePaid(event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_failed":
      await onInvoiceFailed(event.data.object as Stripe.Invoice);
      break;
    case "payment_intent.succeeded":
      await onPaymentIntentSucceeded(
        event.data.object as Stripe.PaymentIntent,
        event.id,
      );
      break;
    case "payment_intent.payment_failed":
      await onPaymentIntentFailed(
        event.data.object as Stripe.PaymentIntent,
        event.id,
      );
      break;
    case "charge.refunded":
      await onChargeRefunded(event.data.object as Stripe.Charge, event.id);
      break;
    default:
      break;
  }
}

/* ----------------------------- helpers ----------------------------- */

const DEFAULT_PROPERTY_NAME = "Stripe Webhook Imports";

async function ensureDefaultProperty(): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("properties")
    .select("id")
    .eq("name", DEFAULT_PROPERTY_NAME)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: inserted, error } = await supabaseAdmin
    .from("properties")
    .insert({ name: DEFAULT_PROPERTY_NAME, city: "Berlin" })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return inserted.id;
}

async function ensureUnitFor(propertyId: string, label: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("units")
    .select("id")
    .eq("property_id", propertyId)
    .eq("label", label)
    .maybeSingle();
  if (existing) return existing.id;

  const { data: inserted, error } = await supabaseAdmin
    .from("units")
    .insert({ property_id: propertyId, label })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return inserted.id;
}

type TenantCtx = {
  tenant_id: string;
  unit_id: string;
  property_id: string;
};

/**
 * Lookup tenant by stripe_customer_id. If missing, auto-provision tenant +
 * unit + default property from the Stripe customer record.
 */
async function ensureTenantCtx(
  customerId: string | null,
): Promise<TenantCtx | null> {
  if (!customerId) return null;

  const { data: existing } = await supabaseAdmin
    .from("tenants")
    .select("id, unit_id, units!inner(property_id)")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (existing) {
    const unit = Array.isArray((existing as { units: unknown }).units)
      ? (existing as unknown as { units: { property_id: string }[] }).units[0]
      : (existing as unknown as { units: { property_id: string } }).units;
    return {
      tenant_id: existing.id,
      unit_id: existing.unit_id,
      property_id: unit.property_id,
    };
  }

  // Fetch the customer from Stripe so we have name/email
  const stripe = getStripe();
  const customer = (await stripe.customers.retrieve(customerId)) as Stripe.Customer;
  return provisionTenantFromCustomer(customer);
}

async function provisionTenantFromCustomer(
  customer: Stripe.Customer,
): Promise<TenantCtx> {
  const propertyId = await ensureDefaultProperty();
  const label =
    customer.name ?? customer.email ?? `Tenant ${customer.id.slice(-6)}`;
  const unitId = await ensureUnitFor(propertyId, label);

  const { data: inserted, error } = await supabaseAdmin
    .from("tenants")
    .insert({
      name: customer.name ?? customer.email ?? `Tenant ${customer.id.slice(-6)}`,
      email: customer.email ?? null,
      unit_id: unitId,
      rent_amount: 0,
      stripe_customer_id: customer.id,
    })
    .select("id, unit_id")
    .single();
  if (error) throw new Error(error.message);

  return {
    tenant_id: inserted.id,
    unit_id: inserted.unit_id,
    property_id: propertyId,
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

function customerIdFromInvoice(inv: Stripe.Invoice): string | null {
  return typeof inv.customer === "string"
    ? inv.customer
    : (inv.customer?.id ?? null);
}

function customerIdFromPaymentIntent(pi: Stripe.PaymentIntent): string | null {
  return typeof pi.customer === "string"
    ? pi.customer
    : (pi.customer?.id ?? null);
}

function failureReasonFromPaymentIntent(pi: Stripe.PaymentIntent): string {
  const code = pi.last_payment_error?.code ?? pi.last_payment_error?.decline_code;
  if (code === "insufficient_funds" || code === "invalid_mandate") return code;
  return "insufficient_funds";
}

async function eventAlreadyRecorded(eventId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("payment_events")
    .select("id")
    .eq("stripe_event_id", eventId)
    .maybeSingle();
  return Boolean(data);
}

async function obligationHasEvent(
  obligationId: string,
  type: "succeeded" | "failed",
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("payment_events")
    .select("id")
    .eq("rent_obligation_id", obligationId)
    .eq("type", type)
    .maybeSingle();
  return Boolean(data);
}

/* ----------------------------- handlers ----------------------------- */

async function onCustomerUpsert(customer: Stripe.Customer) {
  // Provision tenant if missing; if present, refresh name/email.
  const { data: existing } = await supabaseAdmin
    .from("tenants")
    .select("id")
    .eq("stripe_customer_id", customer.id)
    .maybeSingle();

  if (!existing) {
    await provisionTenantFromCustomer(customer);
    return;
  }

  await supabaseAdmin
    .from("tenants")
    .update({
      name: customer.name ?? customer.email ?? `Tenant ${customer.id.slice(-6)}`,
      email: customer.email ?? null,
    })
    .eq("id", existing.id);
}

async function onSubscriptionUpsert(sub: Stripe.Subscription) {
  const customerId =
    typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const ctx = await ensureTenantCtx(customerId);
  if (!ctx) return;

  // Derive monthly rent from the subscription's first item
  const item = sub.items.data[0];
  const rent = item?.price.unit_amount
    ? Number(item.price.unit_amount) / 100
    : 0;

  await supabaseAdmin
    .from("tenants")
    .update({
      stripe_subscription_id: sub.id,
      rent_amount: rent,
    })
    .eq("id", ctx.tenant_id);
}

async function onSubscriptionDeleted(sub: Stripe.Subscription) {
  await supabaseAdmin
    .from("tenants")
    .update({ stripe_subscription_id: null })
    .eq("stripe_subscription_id", sub.id);
}

async function upsertObligationFromInvoice(inv: Stripe.Invoice) {
  if (!inv.id) return null;
  const ctx = await ensureTenantCtx(customerIdFromInvoice(inv));
  if (!ctx) return null;

  const amount = (inv.amount_due ?? 0) / 100;
  const month = invoiceMonth(inv);
  const due = invoiceDueDate(inv);

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
  const ctx = await ensureTenantCtx(customerIdFromInvoice(inv));
  if (!ctx || !obligationId) return;

  await supabaseAdmin
    .from("rent_obligations")
    .update({ status: "paid" })
    .eq("id", obligationId);

  await supabaseAdmin.from("payment_events").insert({
    tenant_id: ctx.tenant_id,
    unit_id: ctx.unit_id,
    rent_obligation_id: obligationId,
    type: "succeeded",
    amount: (inv.amount_paid ?? 0) / 100,
    source: "stripe_webhook",
    stripe_event_id: inv.id,
    occurred_at: new Date().toISOString(),
  });

  await supabaseAdmin
    .from("exceptions")
    .update({ status: "resolved" })
    .eq("rent_obligation_id", obligationId);
}

async function onInvoiceFailed(inv: Stripe.Invoice) {
  const obligationId = await upsertObligationFromInvoice(inv);
  const ctx = await ensureTenantCtx(customerIdFromInvoice(inv));
  if (!ctx || !obligationId) return;

  const attemptCount = inv.attempt_count ?? 1;

  await supabaseAdmin
    .from("rent_obligations")
    .update({ status: attemptCount >= 3 ? "human_review" : "failed" })
    .eq("id", obligationId);

  const charge = (inv as unknown as { last_finalization_error?: { message?: string } })
    .last_finalization_error;
  const reason = /mandate/i.test(charge?.message ?? "")
    ? "invalid_mandate"
    : "insufficient_funds";

  await supabaseAdmin.from("payment_events").insert({
    tenant_id: ctx.tenant_id,
    unit_id: ctx.unit_id,
    rent_obligation_id: obligationId,
    type: "failed",
    amount: (inv.amount_due ?? 0) / 100,
    failure_reason: reason,
    source: "stripe_webhook",
    stripe_event_id: inv.id,
    occurred_at: new Date().toISOString(),
  });

  const { data: existingExc } = await supabaseAdmin
    .from("exceptions")
    .select("id")
    .eq("rent_obligation_id", obligationId)
    .maybeSingle();

  const severity = attemptCount >= 3 ? "high" : "medium";
  const recommended = attemptCount >= 3 ? "escalate_to_human" : "schedule_retry";

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

async function onPaymentIntentSucceeded(
  pi: Stripe.PaymentIntent,
  eventId: string,
) {
  if (await eventAlreadyRecorded(eventId)) return;

  const obligationId = pi.metadata?.rent_obligation_id;
  const ctx = await ensureTenantCtx(customerIdFromPaymentIntent(pi));
  if (!ctx || !obligationId) return;

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

  if (await obligationHasEvent(obligationId, "succeeded")) return;

  await supabaseAdmin.from("payment_events").insert({
    tenant_id: ctx.tenant_id,
    unit_id: ctx.unit_id,
    rent_obligation_id: obligationId,
    type: "succeeded",
    amount: pi.amount_received / 100,
    source: "stripe_webhook",
    stripe_event_id: eventId,
    occurred_at: new Date(pi.created * 1000).toISOString(),
  });

  await supabaseAdmin
    .from("exceptions")
    .update({ status: "resolved" })
    .eq("rent_obligation_id", obligationId);
}

async function onPaymentIntentFailed(
  pi: Stripe.PaymentIntent,
  eventId: string,
) {
  if (await eventAlreadyRecorded(eventId)) return;

  const obligationId = pi.metadata?.rent_obligation_id;
  const ctx = await ensureTenantCtx(customerIdFromPaymentIntent(pi));
  if (!ctx || !obligationId) return;

  await supabaseAdmin
    .from("rent_obligations")
    .update({ status: "failed" })
    .eq("id", obligationId);

  if (await obligationHasEvent(obligationId, "failed")) return;

  await supabaseAdmin.from("payment_events").insert({
    tenant_id: ctx.tenant_id,
    unit_id: ctx.unit_id,
    rent_obligation_id: obligationId,
    type: "failed",
    amount: pi.amount / 100,
    failure_reason: failureReasonFromPaymentIntent(pi),
    source: "stripe_webhook",
    stripe_event_id: eventId,
    occurred_at: new Date(pi.created * 1000).toISOString(),
  });
}

async function onChargeRefunded(charge: Stripe.Charge, eventId: string) {
  const customerId =
    typeof charge.customer === "string"
      ? charge.customer
      : (charge.customer?.id ?? null);
  const ctx = await ensureTenantCtx(customerId);
  if (!ctx) return;

  // Try to associate with an obligation via the related invoice
  let obligationId: string | null = null;
  const invRef = (charge as unknown as { invoice?: string | { id: string } | null }).invoice;
  const invoiceId =
    typeof invRef === "string" ? invRef : (invRef?.id ?? null);
  if (invoiceId) {
    const { data: ob } = await supabaseAdmin
      .from("rent_obligations")
      .select("id")
      .eq("stripe_invoice_id", invoiceId)
      .maybeSingle();
    obligationId = ob?.id ?? null;
  }

  // rent_obligation_id is NOT NULL — skip event if we can't tie it to an obligation
  if (!obligationId) return;

  await supabaseAdmin.from("payment_events").insert({
    tenant_id: ctx.tenant_id,
    unit_id: ctx.unit_id,
    rent_obligation_id: obligationId,
    type: "refund",
    amount: (charge.amount_refunded ?? 0) / 100,
    source: "stripe",
    stripe_event_id: eventId,
    occurred_at: new Date().toISOString(),
  });
}

