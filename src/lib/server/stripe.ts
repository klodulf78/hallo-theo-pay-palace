import Stripe from "stripe";
import { getEnv } from "./env";
import type { TenantRow } from "./supabase";

// SEPA Direct Debit test PMs (Stripe test-mode tokens). Lets us deterministically
// produce success / failure cases per tenant archetype without real bank info.
const TEST_PAYMENT_METHOD_BY_ARCHETYPE: Record<TenantRow["archetype"], string> = {
  reliable: "pm_sepa_debit",
  soft_fail: "pm_sepa_debit_open",
  payment_plan: "pm_sepa_debit_insufficient_funds",
  critical: "pm_sepa_debit_account_closed",
};

const SEPA_TEST_IBAN_BY_ARCHETYPE: Record<TenantRow["archetype"], string> = {
  reliable: "DE89370400440532013000",
  soft_fail: "DE89370400440532013000",
  payment_plan: "DE62370400440532013001",
  critical: "DE62370400440532013001",
};

let cached: Stripe | undefined;
let cachedKey = "";

export function getStripe(): Stripe {
  const env = getEnv();
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY not configured");
  }
  if (cached && cachedKey === env.STRIPE_SECRET_KEY) return cached;
  cached = new Stripe(env.STRIPE_SECRET_KEY, {
    typescript: true,
  });
  cachedKey = env.STRIPE_SECRET_KEY;
  return cached;
}

export async function createTestClock(name: string): Promise<Stripe.TestHelpers.TestClock> {
  const stripe = getStripe();
  return stripe.testHelpers.testClocks.create({
    frozen_time: Math.floor(new Date("2026-05-01T00:00:00Z").getTime() / 1000),
    name,
  });
}

export async function advanceClockByDays(
  clockId: string,
  days: number,
): Promise<Stripe.TestHelpers.TestClock> {
  const stripe = getStripe();
  const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
  const next = clock.frozen_time + days * 86400;
  return stripe.testHelpers.testClocks.advance(clockId, { frozen_time: next });
}

export async function ensureCustomerForTenant(
  tenant: TenantRow,
): Promise<{ customerId: string; clockId: string }> {
  const stripe = getStripe();

  if (tenant.stripe_customer_id && tenant.stripe_test_clock_id) {
    return {
      customerId: tenant.stripe_customer_id,
      clockId: tenant.stripe_test_clock_id,
    };
  }

  const clock = await createTestClock(`tenant_${tenant.id}_${tenant.unit}`);
  const customer = await stripe.customers.create({
    name: tenant.name,
    email: `${tenant.id}@hallo-flow.demo`,
    metadata: { tenant_id: tenant.id, unit: tenant.unit, archetype: tenant.archetype },
    test_clock: clock.id,
  });

  return { customerId: customer.id, clockId: clock.id };
}

export async function attachTestSepaMandate(
  customerId: string,
  archetype: TenantRow["archetype"],
): Promise<string> {
  const stripe = getStripe();
  // For SEPA test mode, Stripe provides token-backed PMs. Use the predefined
  // success/failure tokens by archetype.
  const token = TEST_PAYMENT_METHOD_BY_ARCHETYPE[archetype];
  const pm = await stripe.paymentMethods.create({
    type: "sepa_debit",
    sepa_debit: { iban: SEPA_TEST_IBAN_BY_ARCHETYPE[archetype] },
    billing_details: {
      name: customerId,
      email: `${customerId}@hallo-flow.demo`,
    },
    metadata: { archetype, test_token_ref: token },
  });
  await stripe.paymentMethods.attach(pm.id, { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
  return pm.id;
}

export async function chargeRent(
  tenant: TenantRow,
  cycleMonth: string,
): Promise<Stripe.PaymentIntent> {
  const stripe = getStripe();
  if (!tenant.stripe_customer_id || !tenant.stripe_payment_method_id) {
    throw new Error(`Tenant ${tenant.id} not bootstrapped (missing customer or PM)`);
  }
  return stripe.paymentIntents.create(
    {
      amount: tenant.rent_cents,
      currency: "eur",
      customer: tenant.stripe_customer_id,
      payment_method: tenant.stripe_payment_method_id,
      payment_method_types: ["sepa_debit"],
      confirm: true,
      off_session: true,
      mandate_data: {
        customer_acceptance: {
          type: "offline",
        },
      },
      metadata: { tenant_id: tenant.id, cycle_month: cycleMonth },
    },
    { idempotencyKey: `rent_${tenant.id}_${cycleMonth}` },
  );
}

export function verifyWebhookSignature(rawBody: string, signature: string): Stripe.Event {
  const stripe = getStripe();
  const env = getEnv();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET not configured");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}
