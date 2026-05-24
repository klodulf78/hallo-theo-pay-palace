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
  "Niklas Braun",
  "Emma Krüger",
  "Leon Hartmann",
  "Mia Lange",
  "Finn Schmitt",
  "Clara Werner",
  "Ben Krause",
  "Lina Albrecht",
  "Noah Vogel",
];

const IBAN_RELIABLE = "DE89370400440532013000";
const IBAN_CRITICAL = "DE62370400440532013001";

const TARGET_OCCUPANCY = 0.9;

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.|\.$/g, "");
}

function pickBehavior(): "reliable" | "soft_fail" | "critical" {
  const r = Math.random();
  if (r < 0.85) return "reliable";
  if (r < 0.95) return "soft_fail";
  return "critical";
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type AddTenantResult = {
  onboarded: number;
  occupiedUnits: number;
  totalUnits: number;
  occupancyPercent: number;
  vacantUnits: number;
  tenantNames: string[];
  errors: string[];
  skippedReason?: string;
};

export const addTenant = createServerFn({ method: "POST" }).handler(
  async (): Promise<AddTenantResult> => {
    const stripe = getStripe();

    // 1. Get all units + tenant occupancy.
    const { data: allUnits, error: uErr } = await supabaseAdmin
      .from("units")
      .select("id, label, target_rent");
    if (uErr) throw new Error(uErr.message);
    const totalUnits = (allUnits ?? []).length;

    if (totalUnits === 0) {
      return {
        onboarded: 0,
        occupiedUnits: 0,
        totalUnits: 0,
        occupancyPercent: 0,
        vacantUnits: 0,
        tenantNames: [],
        errors: [],
        skippedReason: "Keine Einheiten vorhanden — bitte zuerst Demo-Portfolio seeden.",
      };
    }

    const { data: tenants, error: tErr } = await supabaseAdmin
      .from("tenants")
      .select("id, unit_id");
    if (tErr) throw new Error(tErr.message);

    const occupiedIds = new Set(
      (tenants ?? []).map((t) => t.unit_id).filter(Boolean),
    );
    const emptyUnits = (allUnits ?? []).filter((u) => !occupiedIds.has(u.id));
    const occupiedCount = totalUnits - emptyUnits.length;
    const currentPct = (occupiedCount / totalUnits) * 100;

    const targetOccupied = Math.ceil(totalUnits * TARGET_OCCUPANCY);
    const toFill = Math.max(0, targetOccupied - occupiedCount);

    if (toFill === 0 || emptyUnits.length === 0) {
      return {
        onboarded: 0,
        occupiedUnits: occupiedCount,
        totalUnits,
        occupancyPercent: currentPct,
        vacantUnits: emptyUnits.length,
        tenantNames: [],
        errors: [],
        skippedReason: `Portfolio bereits zu ${currentPct.toFixed(0)}% belegt — kein Onboarding nötig.`,
      };
    }

    const picks = shuffle(emptyUnits).slice(0, toFill);
    const tenantCountStart = (tenants ?? []).length;

    const created: string[] = [];
    const errors: string[] = [];

    for (let i = 0; i < picks.length; i++) {
      const unit = picks[i];
      const idx = tenantCountStart + i;
      const name = GERMAN_NAMES[idx % GERMAN_NAMES.length];
      const slug = slugifyName(name);
      const email = `${slug}.${idx}@demo.halloflow.local`;
      const behavior = pickBehavior();
      const rent = Number(unit.target_rent ?? 1000);

      const { data: tenant, error: insErr } = await supabaseAdmin
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
      if (insErr) {
        errors.push(`${name}: ${insErr.message}`);
        continue;
      }

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
          mandate_reference: `MANDATE-${unit.label}`,
          signed_date: new Date().toISOString().slice(0, 10),
          status: "active",
        });
        created.push(name);
      } catch (e) {
        await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
        errors.push(`${name}: ${(e as Error).message}`);
      }
    }

    const newOccupied = occupiedCount + created.length;
    const newPct = (newOccupied / totalUnits) * 100;
    const newVacant = totalUnits - newOccupied;

    return {
      onboarded: created.length,
      occupiedUnits: newOccupied,
      totalUnits,
      occupancyPercent: newPct,
      vacantUnits: newVacant,
      tenantNames: created,
      errors,
    };
  },
);
