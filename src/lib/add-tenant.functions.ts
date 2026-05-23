import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "./stripe.server";

const GERMAN_NAMES = [
  "Anna Schmidt",
  "Lukas Müller",
  "Sophie Weber",
  "Maximilian Fischer",
  "Marie Becker",
  "Felix Hoffmann",
  "Laura Schulz",
  "Jonas Wagner",
  "Hannah Bauer",
  "Paul Richter",
  "Lena Klein",
  "Tim Wolf",
  "Sarah Neumann",
  "David Schwarz",
  "Julia Zimmermann",
];

const IBAN_RELIABLE = "DE89370400440532013000";
const IBAN_CRITICAL = "DE62370400440532013001";

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\\.|\\.$/g, "");
}

export const addTenant = createServerFn({ method: "POST" }).handler(
  async (): Promise<{
    tenantId: string;
    tenantName: string;
    unitLabel: string;
    stripeCustomerId: string;
  }> => {
    const stripe = getStripe();

    // 1. Find or create owner
    let { data: owner } = await supabaseAdmin
      .from("owners")
      .select("id")
      .eq("name", "Hallo Theo Demo Owner")
      .maybeSingle();
    if (!owner) {
      const { data, error } = await supabaseAdmin
        .from("owners")
        .insert({ name: "Hallo Theo Demo Owner", management_fee_rate: 0.05 })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      owner = data;
    }

    // 2. Find or create property
    let { data: property } = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("name", "Berlin Mitte Portfolio")
      .maybeSingle();
    if (!property) {
      const { data, error } = await supabaseAdmin
        .from("properties")
        .insert({
          name: "Berlin Mitte Portfolio",
          owner_id: owner.id,
          city: "Berlin",
          street: "Unter den Linden 1",
          postal_code: "10117",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      property = data;
    }

    // 3. Determine next unit label (within this property)
    const { data: existingUnits } = await supabaseAdmin
      .from("units")
      .select("label")
      .eq("property_id", property.id);
    let maxNum = 0;
    for (const u of existingUnits ?? []) {
      const m = /^WE-(\d+)$/.exec(u.label);
      if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
    }
    const nextNum = maxNum + 1;
    const unitLabel = `WE-${String(nextNum).padStart(3, "0")}`;

    const { data: unit, error: unitErr } = await supabaseAdmin
      .from("units")
      .insert({ property_id: property.id, label: unitLabel })
      .select("id")
      .single();
    if (unitErr) throw new Error(unitErr.message);

    // 4. Determine behavior + tenant identity. Use total tenant count to cycle.
    const { count: tenantCount } = await supabaseAdmin
      .from("tenants")
      .select("id", { count: "exact", head: true });
    const cycle = ["reliable", "reliable", "reliable", "critical"] as const;
    const behavior = cycle[(tenantCount ?? 0) % cycle.length];

    const name = GERMAN_NAMES[(tenantCount ?? 0) % GERMAN_NAMES.length];
    const slug = slugifyName(name);
    // Add suffix to keep email unique
    const email = `${slug}.${nextNum}@demo.halloflow.local`;
    const rent = Math.round((800 + Math.random() * 400) / 10) * 10;

    const { data: tenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        name,
        email,
        unit_id: unit.id,
        rent_amount: rent,
        due_day: 1,
        behavior_profile: behavior,
      })
      .select("id")
      .single();
    if (tErr) throw new Error(tErr.message);

    // 5. Stripe customer + SEPA payment method
    const { data: gr } = await supabaseAdmin
      .from("guardrails")
      .select("stripe_test_clock_id")
      .maybeSingle();

    const customer = await stripe.customers.create({
      name,
      email,
      ...(gr?.stripe_test_clock_id ? { test_clock: gr.stripe_test_clock_id } : {}),
      metadata: { tenant_id: tenant.id },
    });

    const iban = behavior === "critical" ? IBAN_CRITICAL : IBAN_RELIABLE;
    const pm = await stripe.paymentMethods.create({
      type: "sepa_debit",
      sepa_debit: { iban },
      billing_details: { name, email },
    });
    await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });

    // 6. Persist
    await supabaseAdmin
      .from("tenants")
      .update({ stripe_customer_id: customer.id })
      .eq("id", tenant.id);

    await supabaseAdmin.from("sepa_mandates").insert({
      tenant_id: tenant.id,
      iban,
      stripe_mandate_id: pm.id,
      mandate_reference: `MANDATE-${unitLabel}`,
      signed_date: new Date().toISOString().slice(0, 10),
      status: "active",
    });

    return {
      tenantId: tenant.id,
      tenantName: name,
      unitLabel,
      stripeCustomerId: customer.id,
    };
  },
);
