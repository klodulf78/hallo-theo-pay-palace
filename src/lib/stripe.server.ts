import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key =
    process.env.Stripe_Sandbox || process.env.STRIPE_SANDBOX || process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe secret key missing (expected env var Stripe_Sandbox)");
  }
  _stripe = new Stripe(key, { apiVersion: "2025-06-30.basil" as never });
  return _stripe;
}

export function getWebhookSecret(): string {
  const sec =
    process.env.Webhook_stripe || process.env.WEBHOOK_STRIPE || process.env.STRIPE_WEBHOOK_KEY;
  if (!sec) throw new Error("Stripe webhook secret missing (Webhook_stripe / STRIPE_WEBHOOK_KEY)");
  return sec;
}

/**
 * Pick a deterministic Stripe test PaymentMethod token based on tenant behavior.
 * These tokens auto-attach test cards to customers; the test clock + subscription
 * billing produces the same success/failure behaviour we'd see with SEPA in prod.
 *
 * Note: BOTH `soft_fail` and `payment_plan` decline on the initial charge (same
 * insufficient-funds card). The cards are identical on purpose — the recovery
 * AGENT differentiates them by risk score, not by card:
 *   - low risk  (soft_fail)    → retry/recover (tenant switches to a good card,
 *                                see `recoverInvoiceWithGoodCard`)
 *   - high risk (payment_plan) → offer a payment plan instead of an immediate retry
 * `reliable` always succeeds; `critical` always fails (no recovery path).
 */
export function paymentMethodForBehavior(behavior: string | null): string {
  switch (behavior) {
    case "critical":
      return "pm_card_chargeCustomerFail"; // always fails
    case "soft_fail":
    case "payment_plan":
      return "pm_card_chargeDeclinedInsufficientFunds"; // declines initially
    case "reliable":
    default:
      return "pm_card_visa"; // succeeds
  }
}

/**
 * Recover a failed invoice by switching the customer onto a working test card,
 * then paying the invoice with it. This models a tenant who, after a soft
 * decline, supplies a valid card so the retry clears. The recovery agent calls
 * this for its retry action on low-risk (soft_fail) tenants.
 *
 * Steps: create a PaymentMethod from `tok_visa`, attach it to the customer, set
 * it as the customer's default invoice payment method, then pay the invoice
 * with the new PM. Returns whether the invoice ended up paid plus its status.
 * Never throws — on error returns `{ paid: false, status: "error" }` and lets
 * the caller log.
 */
export async function recoverInvoiceWithGoodCard(
  customerId: string,
  invoiceId: string,
): Promise<{ paid: boolean; status: string | null }> {
  try {
    const stripe = getStripe();

    // Working test card so the retry succeeds.
    const pm = await stripe.paymentMethods.create({
      type: "card",
      card: { token: "tok_visa" },
    });
    await stripe.paymentMethods.attach(pm.id, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: pm.id },
    });

    const invoice = await stripe.invoices.pay(invoiceId, {
      payment_method: pm.id,
    });

    return { paid: invoice.status === "paid", status: invoice.status ?? null };
  } catch {
    return { paid: false, status: "error" };
  }
}

export const DEMO_START_UNIX = Math.floor(new Date("2026-05-01T00:00:00Z").getTime() / 1000);
