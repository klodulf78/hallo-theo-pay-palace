import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "./stripe.server";

const CITIES = [
  { city: "Berlin", lat: 52.52, lng: 13.405 },
  { city: "München", lat: 48.1351, lng: 11.582 },
  { city: "Hamburg", lat: 53.5511, lng: 9.9937 },
  { city: "Köln", lat: 50.9375, lng: 6.9603 },
  { city: "Frankfurt", lat: 50.1109, lng: 8.6821 },
  { city: "Stuttgart", lat: 48.7758, lng: 9.1829 },
  { city: "Düsseldorf", lat: 51.2277, lng: 6.7735 },
  { city: "Leipzig", lat: 51.3397, lng: 12.3731 },
];

const NAMES = [
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

function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

export const seedDemoPortfolio = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ properties: number; units: number; tenants: number }> => {
    const stripe = getStripe();

    // Find or create demo owner
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

    let totalUnits = 0;
    let totalTenants = 0;
    let nameIdx = Math.floor(Math.random() * NAMES.length);
    let seq = Date.now() % 100000;

    for (const c of CITIES) {
      const jitter = () => (Math.random() - 0.5) * 0.04;
      const propName = `Hallo Theo · ${c.city} Portfolio`;

      const { data: prop, error: pErr } = await supabaseAdmin
        .from("properties")
        .insert({
          name: propName,
          owner_id: owner.id,
          city: c.city,
          lat: c.lat + jitter(),
          lng: c.lng + jitter(),
        })
        .select("id")
        .single();
      if (pErr) throw new Error(pErr.message);

      const unitCount = 3 + Math.floor(Math.random() * 6); // 3..8

      for (let i = 1; i <= unitCount; i++) {
        const label = `WE-${String(i).padStart(3, "0")}`;

        const { data: unit, error: uErr } = await supabaseAdmin
          .from("units")
          .insert({ property_id: prop.id, label })
          .select("id")
          .single();
        if (uErr) throw new Error(uErr.message);
        totalUnits++;

        const behavior = Math.random() < 0.2 ? "critical" : "reliable";
        const name = NAMES[nameIdx++ % NAMES.length];
        seq++;
        const email = `${slug(name)}.${seq}@demo.halloflow.local`;
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

        const iban = behavior === "critical" ? IBAN_CRITICAL : IBAN_RELIABLE;
        try {
          const customer = await stripe.customers.create({
            name,
            email,
            metadata: { tenant_id: tenant.id },
          });
          const pm = await stripe.paymentMethods.create({
            type: "sepa_debit",
            sepa_debit: { iban },
            billing_details: { name, email },
          });
          await stripe.paymentMethods.attach(pm.id, { customer: customer.id });
          await stripe.customers.update(customer.id, {
            invoice_settings: { default_payment_method: pm.id },
          });
          await supabaseAdmin
            .from("tenants")
            .update({ stripe_customer_id: customer.id })
            .eq("id", tenant.id);
          await supabaseAdmin.from("sepa_mandates").insert({
            tenant_id: tenant.id,
            iban,
            stripe_mandate_id: pm.id,
            mandate_reference: `MANDATE-${prop.id.slice(0, 8)}-${label}`,
            signed_date: new Date().toISOString().slice(0, 10),
            status: "active",
          });
        } catch (e) {
          // best-effort: don't abort entire seed on Stripe hiccup
          console.error("Stripe setup failed for", name, e);
        }
        totalTenants++;
      }
    }

    return {
      properties: CITIES.length,
      units: totalUnits,
      tenants: totalTenants,
    };
  },
);
