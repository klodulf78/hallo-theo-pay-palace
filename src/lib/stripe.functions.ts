import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getStripe,
  paymentMethodForBehavior,
  DEMO_START_UNIX,
} from "./stripe.server";

type SetupResult = {
  testClockId: string;
  testClockNow: number;
  tenantsProvisioned: number;
  tenantsSkipped: number;
  errors: string[];
};

/**
 * Provisions a Stripe Test Clock, plus a Customer + PaymentMethod + monthly
 * Subscription per tenant. Idempotent: tenants with a stripe_customer_id are
 * skipped. Stores the test clock id in guardrails.
 */
export const setupStripeDemo = createServerFn({ method: "POST" }).handler(
  async (): Promise<SetupResult> => {
    const stripe = getStripe();
    const errors: string[] = [];

    // 1) Ensure a single test clock exists in guardrails
    const { data: gr } = await supabaseAdmin
      .from("guardrails")
      .select("id, stripe_test_clock_id")
      .maybeSingle();

    let testClockId = gr?.stripe_test_clock_id ?? null;
    if (!testClockId) {
      const clock = await stripe.testHelpers.testClocks.create({
        frozen_time: DEMO_START_UNIX,
        name: "hallo flow demo clock",
      });
      testClockId = clock.id;
      if (gr?.id) {
        await supabaseAdmin
          .from("guardrails")
          .update({ stripe_test_clock_id: testClockId })
          .eq("id", gr.id);
      } else {
        await supabaseAdmin
          .from("guardrails")
          .insert({ stripe_test_clock_id: testClockId });
      }
    }

    const clock = await stripe.testHelpers.testClocks.retrieve(testClockId);
    const clockNow = clock.frozen_time;

    // 2) Load tenants that still need provisioning
    const { data: tenants, error } = await supabaseAdmin
      .from("tenants")
      .select("id, name, email, rent_amount, behavior_profile, stripe_customer_id");
    if (error) throw new Error(error.message);

    let provisioned = 0;
    let skipped = 0;

    for (const t of tenants ?? []) {
      if (t.stripe_customer_id) {
        skipped++;
        continue;
      }
      try {
        // Customer attached to the test clock
        const customer = await stripe.customers.create({
          name: t.name,
          email: t.email ?? `${t.id}@demo.halloflow.local`,
          test_clock: testClockId,
          metadata: { tenant_id: t.id },
        });

        // Attach a deterministic test PaymentMethod
        const pmToken = paymentMethodForBehavior(t.behavior_profile);
        const pm = await stripe.paymentMethods.create({ type: "card", card: { token: pmToken === "pm_card_visa" ? "tok_visa" : pmToken === "pm_card_chargeDeclinedInsufficientFunds" ? "tok_chargeDeclinedInsufficientFunds" : "tok_chargeCustomerFail" } });
        await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
        await stripe.customers.update(customer.id, {
          invoice_settings: { default_payment_method: pm.id },
        });

        // Monthly subscription = rent. Bills immediately at clock time.
        const sub = await stripe.subscriptions.create({
          customer: customer.id,
          items: [
            {
              price_data: {
                currency: "eur",
                product_data: { name: `Miete – ${t.name}` },
                unit_amount: Math.round(Number(t.rent_amount) * 100),
                recurring: { interval: "month" },
              },
            },
          ],
          collection_method: "charge_automatically",
          payment_behavior: "allow_incomplete",
          metadata: { tenant_id: t.id },
        });

        await supabaseAdmin
          .from("tenants")
          .update({
            stripe_customer_id: customer.id,
            stripe_subscription_id: sub.id,
          })
          .eq("id", t.id);

        provisioned++;
      } catch (e) {
        errors.push(`${t.name}: ${(e as Error).message}`);
      }
    }

    return {
      testClockId,
      testClockNow: clockNow,
      tenantsProvisioned: provisioned,
      tenantsSkipped: skipped,
      errors,
    };
  },
);

type AdvanceResult = {
  testClockId: string | null;
  fromUnix: number | null;
  toUnix: number | null;
  status: string | null;
  message: string;
};

/**
 * Advances the demo test clock by ~32 days. Stripe re-bills every active
 * subscription, runs payment attempts, and fires webhooks — which our
 * /api/public/stripe-webhook route translates into rent_obligations,
 * payment_events and exceptions.
 */
export const advanceStripeMonth = createServerFn({ method: "POST" }).handler(
  async (): Promise<AdvanceResult> => {
    const stripe = getStripe();
    const { data: gr } = await supabaseAdmin
      .from("guardrails")
      .select("stripe_test_clock_id")
      .maybeSingle();

    const id = gr?.stripe_test_clock_id;
    if (!id) {
      return {
        testClockId: null,
        fromUnix: null,
        toUnix: null,
        status: null,
        message: "No test clock — run setup first.",
      };
    }

    const current = await stripe.testHelpers.testClocks.retrieve(id);
    const target = current.frozen_time + 60 * 60 * 24 * 32; // ~1 month + buffer
    const advanced = await stripe.testHelpers.testClocks.advance(id, {
      frozen_time: target,
    });

    // Poll until clock finishes processing (max ~30s)
    let final = advanced;
    for (let i = 0; i < 30; i++) {
      if (final.status === "ready" || final.status === "internal_failure") break;
      await new Promise((r) => setTimeout(r, 1000));
      final = await stripe.testHelpers.testClocks.retrieve(id);
    }

    return {
      testClockId: id,
      fromUnix: current.frozen_time,
      toUnix: final.frozen_time,
      status: final.status,
      message: `Clock advanced to ${new Date(final.frozen_time * 1000).toISOString().slice(0, 10)}`,
    };
  },
);

type StripeStatus = {
  testClockId: string | null;
  testClockTime: number | null;
  testClockStatus: string | null;
  tenantsTotal: number;
  tenantsProvisioned: number;
  paymentEvents: number;
};

export const getStripeStatus = createServerFn({ method: "GET" }).handler(
  async (): Promise<StripeStatus> => {
    const stripe = getStripe();
    const [{ data: gr }, { count: total }, { count: provisioned }, { count: evCount }] =
      await Promise.all([
        supabaseAdmin
          .from("guardrails")
          .select("stripe_test_clock_id")
          .maybeSingle(),
        supabaseAdmin.from("tenants").select("id", { count: "exact", head: true }),
        supabaseAdmin
          .from("tenants")
          .select("id", { count: "exact", head: true })
          .not("stripe_customer_id", "is", null),
        supabaseAdmin
          .from("payment_events")
          .select("id", { count: "exact", head: true }),
      ]);

    let time: number | null = null;
    let status: string | null = null;
    if (gr?.stripe_test_clock_id) {
      try {
        const c = await stripe.testHelpers.testClocks.retrieve(
          gr.stripe_test_clock_id,
        );
        time = c.frozen_time;
        status = c.status;
      } catch {
        // clock may have been deleted in Stripe; ignore
      }
    }

    return {
      testClockId: gr?.stripe_test_clock_id ?? null,
      testClockTime: time,
      testClockStatus: status,
      tenantsTotal: total ?? 0,
      tenantsProvisioned: provisioned ?? 0,
      paymentEvents: evCount ?? 0,
    };
  },
);
