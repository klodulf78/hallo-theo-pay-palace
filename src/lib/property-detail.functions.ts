import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PropertyUnitRow = {
  unitId: string;
  label: string;
  floor: string | null;
  tenantId: string | null;
  tenantName: string | null;
  rentAmount: number | null;
  dunningStage: number;
  lastPaymentAt: string | null;
};

export type PropertyDetail = {
  id: string;
  name: string;
  street: string | null;
  city: string | null;
  postalCode: string | null;
  kpis: {
    units: number;
    occupied: number;
    monthlyRent: number;
    activeDunning: number;
  };
  units: PropertyUnitRow[];
};

export const getPropertyDetail = createServerFn({ method: "GET" })
  .inputValidator((data: { propertyId: string }) => data)
  .handler(async ({ data }): Promise<PropertyDetail | null> => {
    const { data: prop } = await supabaseAdmin
      .from("properties")
      .select("id, name, street, city, postal_code")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (!prop) return null;

    const { data: units } = await supabaseAdmin
      .from("units")
      .select("id, label, floor")
      .eq("property_id", prop.id)
      .order("label");
    const unitList = units ?? [];
    const unitIds = unitList.map((u) => u.id);

    const [tenantsRes, obsRes, payRes] = await Promise.all([
      unitIds.length
        ? supabaseAdmin
            .from("tenants")
            .select("id, name, unit_id, rent_amount")
            .in("unit_id", unitIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string; unit_id: string; rent_amount: number }> }),
      unitIds.length
        ? supabaseAdmin
            .from("rent_obligations")
            .select("tenant_id, unit_id, dunning_stage")
            .in("unit_id", unitIds)
        : Promise.resolve({ data: [] as Array<{ tenant_id: string; unit_id: string; dunning_stage: number }> }),
      unitIds.length
        ? supabaseAdmin
            .from("payment_events")
            .select("unit_id, occurred_at, type")
            .in("unit_id", unitIds)
            .eq("type", "succeeded")
            .order("occurred_at", { ascending: false })
        : Promise.resolve({ data: [] as Array<{ unit_id: string; occurred_at: string | null; type: string }> }),
    ]);

    const tenantByUnit = new Map<string, { id: string; name: string; rent: number }>();
    for (const t of tenantsRes.data ?? []) {
      tenantByUnit.set(t.unit_id, {
        id: t.id,
        name: t.name,
        rent: Number(t.rent_amount ?? 0),
      });
    }

    const stageByUnit = new Map<string, number>();
    for (const o of obsRes.data ?? []) {
      const cur = stageByUnit.get(o.unit_id) ?? 0;
      const s = o.dunning_stage ?? 0;
      if (s > cur) stageByUnit.set(o.unit_id, s);
    }

    const lastPayByUnit = new Map<string, string>();
    for (const p of payRes.data ?? []) {
      if (!p.occurred_at) continue;
      if (!lastPayByUnit.has(p.unit_id)) lastPayByUnit.set(p.unit_id, p.occurred_at);
    }

    const rows: PropertyUnitRow[] = unitList.map((u) => {
      const t = tenantByUnit.get(u.id);
      return {
        unitId: u.id,
        label: u.label,
        floor: u.floor ?? null,
        tenantId: t?.id ?? null,
        tenantName: t?.name ?? null,
        rentAmount: t?.rent ?? null,
        dunningStage: stageByUnit.get(u.id) ?? 0,
        lastPaymentAt: lastPayByUnit.get(u.id) ?? null,
      };
    });

    const occupied = rows.filter((r) => r.tenantId).length;
    const monthlyRent = rows.reduce((s, r) => s + (r.rentAmount ?? 0), 0);
    const activeDunning = rows.filter((r) => r.dunningStage > 0).length;

    return {
      id: prop.id,
      name: prop.name,
      street: prop.street ?? null,
      city: prop.city ?? null,
      postalCode: prop.postal_code ?? null,
      kpis: {
        units: rows.length,
        occupied,
        monthlyRent,
        activeDunning,
      },
      units: rows,
    };
  });
