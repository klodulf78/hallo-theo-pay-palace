import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key =
    process.env.Stripe_Sandbox ||
    process.env.STRIPE_SANDBOX ||
    process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "Stripe secret key missing (expected env var Stripe_Sandbox)",
    );
  }
  _stripe = new Stripe(key, { apiVersion: "2025-06-30.basil" as never });
  return _stripe;
}

export function getWebhookSecret(): string {
  const sec = process.env.Webhook_stripe || process.env.WEBHOOK_STRIPE;
  if (!sec) throw new Error("Stripe webhook secret missing (Webhook_stripe)");
  return sec;
}

/**
 * Pick a deterministic Stripe test PaymentMethod token based on tenant behavior.
 * These tokens auto-attach test cards to customers; the test clock + subscription
 * billing produces the same success/failure behaviour we'd see with SEPA in prod.
 */
export function paymentMethodForBehavior(behavior: string | null): string {
  switch (behavior) {
    case "critical":
      return "pm_card_chargeCustomerFail"; // always fails
    case "soft_fail":
      return "pm_card_chargeDeclinedInsufficientFunds"; // declines
    case "payment_plan":
    case "reliable":
    default:
      return "pm_card_visa"; // succeeds
  }
}

export const DEMO_START_UNIX = Math.floor(
  new Date("2026-05-01T00:00:00Z").getTime() / 1000,
);
