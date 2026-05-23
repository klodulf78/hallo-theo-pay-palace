import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SeedResult = {
  ownersCreated: number;
  propertiesCreated: number;
  unitsCreated: number;
  tenantsCreated: number;
  mandatesCreated: number;
  skipped: boolean;
};

const OWNER_NAME = "Demo Owner GmbH";
const PROPERTY_NAME = "hallo theo Berlin Mitte Portfolio";

// The locked demo roster — labels, names, rents and behavior profiles must match
// the time-machine-cycle skill exactly. Rents total €14,800 (PRD expected rent).
const ROSTER: {
  label: string;
  name: string;
  rent: number;
  behavior: "reliable" | "soft_fail" | "payment_plan" | "critical";
}[] = [
  { label: "1A", name: "Müller", rent: 1100, behavior: "reliable" },
  { label: "1B", name: "Weber", rent: 1250, behavior: "reliable" },
  { label: "2A", name: "Schneider", rent: 980, behavior: "reliable" },
  { label: "2B", name: "Fischer", rent: 1300, behavior: "reliable" },
  { label: "3A", name: "Wagner", rent: 1050, behavior: "reliable" },
  { label: "3B", name: "Becker", rent: 1400, behavior: "reliable" },
  { label: "4A", name: "Hoffmann", rent: 1200, behavior: "soft_fail" },
  { label: "4B", name: "Kaya", rent: 1200, behavior: "payment_plan" },
  { label: "5A", name: "Nowak", rent: 1350, behavior: "soft_fail" },
  { label: "5B", name: "Braun", rent: 1100, behavior: "reliable" },
  { label: "6A", name: "Richter", rent: 1470, behavior: "critical" },
  { label: "6B", name: "Klein", rent: 1400, behavior: "reliable" },
];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");

const floorFor = (label: string) => label.slice(0, 1);

/**
 * Seeds the demo dataset (1 owner, 1 property, 12 units, 12 tenants, 12 active
 * SEPA mandates + a default guardrails row). Idempotent: the property is matched
 * by name, units by label, tenants by unit, and mandates by tenant — anything
 * already present is left untouched, so re-running is safe. Stripe provisioning
 * (customers/subscriptions/test clock) is handled separately by setupStripeDemo.
 */
export const seedDemoData = createServerFn({ method: "POST" }).handler(
  async (): Promise<SeedResult> => {
    let ownersCreated = 0;
    let propertiesCreated = 0;
    let unitsCreated = 0;
    let tenantsCreated = 0;
    let mandatesCreated = 0;

    // 1) Owner — match by name.
    const { data: existingOwner, error: ownerSelErr } = await supabaseAdmin
      .from("owners")
      .select("id")
      .eq("name", OWNER_NAME)
      .maybeSingle();
    if (ownerSelErr) throw new Error(ownerSelErr.message);

    let ownerId = existingOwner?.id ?? null;
    if (!ownerId) {
      const { data: owner, error } = await supabaseAdmin
        .from("owners")
        .insert({
          name: OWNER_NAME,
          payout_iban: "DE89370400440532013000",
          management_fee_rate: 0.08, // 8% management fee
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      ownerId = owner.id;
      ownersCreated++;
    }

    // 2) Property — match by name, linked to the owner.
    const { data: existingProperty, error: propSelErr } = await supabaseAdmin
      .from("properties")
      .select("id")
      .eq("name", PROPERTY_NAME)
      .maybeSingle();
    if (propSelErr) throw new Error(propSelErr.message);

    let propertyId = existingProperty?.id ?? null;
    if (!propertyId) {
      const { data: property, error } = await supabaseAdmin
        .from("properties")
        .insert({
          name: PROPERTY_NAME,
          owner_id: ownerId,
          street: "Torstraße 1",
          city: "Berlin",
          postal_code: "10119",
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      propertyId = property.id;
      propertiesCreated++;
    }

    // 3) Units — match by label within the property.
    const { data: existingUnits, error: unitSelErr } = await supabaseAdmin
      .from("units")
      .select("id, label")
      .eq("property_id", propertyId);
    if (unitSelErr) throw new Error(unitSelErr.message);

    const unitByLabel = new Map<string, string>((existingUnits ?? []).map((u) => [u.label, u.id]));

    const unitsToInsert = ROSTER.filter((r) => !unitByLabel.has(r.label)).map((r) => ({
      property_id: propertyId!,
      label: r.label,
      floor: floorFor(r.label),
    }));
    if (unitsToInsert.length > 0) {
      const { data: inserted, error } = await supabaseAdmin
        .from("units")
        .insert(unitsToInsert)
        .select("id, label");
      if (error) throw new Error(error.message);
      for (const u of inserted ?? []) unitByLabel.set(u.label, u.id);
      unitsCreated += inserted?.length ?? 0;
    }

    // 4) Tenants — one per unit, match by unit_id.
    const unitIds = Array.from(unitByLabel.values());
    const { data: existingTenants, error: tenantSelErr } = await supabaseAdmin
      .from("tenants")
      .select("id, unit_id")
      .in("unit_id", unitIds);
    if (tenantSelErr) throw new Error(tenantSelErr.message);

    const tenantByUnit = new Map<string, string>(
      (existingTenants ?? []).map((t) => [t.unit_id, t.id]),
    );

    const tenantsToInsert = ROSTER.filter((r) => {
      const unitId = unitByLabel.get(r.label);
      return unitId && !tenantByUnit.has(unitId);
    }).map((r) => ({
      unit_id: unitByLabel.get(r.label)!,
      name: r.name,
      email: `${slug(r.name)}@demo.halloflow.local`,
      phone: "+49 30 1234 5678",
      rent_amount: r.rent,
      due_day: 1,
      behavior_profile: r.behavior,
      risk_score: 0, // the recovery agent updates this during the cycle
    }));
    if (tenantsToInsert.length > 0) {
      const { data: inserted, error } = await supabaseAdmin
        .from("tenants")
        .insert(tenantsToInsert)
        .select("id, unit_id");
      if (error) throw new Error(error.message);
      for (const t of inserted ?? []) tenantByUnit.set(t.unit_id, t.id);
      tenantsCreated += inserted?.length ?? 0;
    }

    // 5) SEPA mandates — one active mandate per tenant, match by tenant_id.
    const tenantIds = Array.from(tenantByUnit.values());
    let existingMandateTenantIds = new Set<string>();
    if (tenantIds.length > 0) {
      const { data: existingMandates, error: mandateSelErr } = await supabaseAdmin
        .from("sepa_mandates")
        .select("tenant_id")
        .in("tenant_id", tenantIds);
      if (mandateSelErr) throw new Error(mandateSelErr.message);
      existingMandateTenantIds = new Set((existingMandates ?? []).map((m) => m.tenant_id));
    }

    const mandatesToInsert = ROSTER.map((r) => {
      const unitId = unitByLabel.get(r.label);
      const tenantId = unitId ? tenantByUnit.get(unitId) : undefined;
      return { r, tenantId };
    })
      .filter(
        (x): x is { r: (typeof ROSTER)[number]; tenantId: string } =>
          !!x.tenantId && !existingMandateTenantIds.has(x.tenantId),
      )
      .map(({ r, tenantId }) => ({
        tenant_id: tenantId,
        mandate_reference: `HF-MNDT-${r.label}`,
        iban: "DE89370400440532013000",
        status: "active" as const,
        signed_date: "2026-01-01",
      }));
    if (mandatesToInsert.length > 0) {
      const { error } = await supabaseAdmin.from("sepa_mandates").insert(mandatesToInsert);
      if (error) throw new Error(error.message);
      mandatesCreated += mandatesToInsert.length;
    }

    // 6) Guardrails — insert a default row only if none exists. Never touch an
    // existing row's stripe_test_clock_id (setupStripeDemo owns that).
    const { data: existingGuardrails, error: grSelErr } = await supabaseAdmin
      .from("guardrails")
      .select("id")
      .maybeSingle();
    if (grSelErr) throw new Error(grSelErr.message);
    if (!existingGuardrails) {
      const { error } = await supabaseAdmin.from("guardrails").insert({
        max_retry_attempts: 2,
        max_installments: 2,
        max_auto_plan_amount: 1500,
        critical_risk_threshold: 80,
        stripe_test_clock_id: null,
      });
      if (error) throw new Error(error.message);
    }

    return {
      ownersCreated,
      propertiesCreated,
      unitsCreated,
      tenantsCreated,
      mandatesCreated,
      skipped:
        ownersCreated === 0 &&
        propertiesCreated === 0 &&
        unitsCreated === 0 &&
        tenantsCreated === 0 &&
        mandatesCreated === 0,
    };
  },
);
