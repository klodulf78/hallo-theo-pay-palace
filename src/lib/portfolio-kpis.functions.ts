import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PortfolioKpis = {
  simulatedNow: string | null;
  monthLabel: string;
  units: { total: number; properties: number; cities: number };
  occupancy: { assigned: number; total: number; percent: number };
  monthlyRent: number;
  inflow: {
    received: number;
    expected: number;
    open: number;
    percent: number;
    failed: number;
    failedPercent: number;
  };
  dunning: {
    tenants: number;
    mahnung: number;
    eskalation: number;
    maxStage: number;
  };
};

function monthKey(d: string): string {
  return d.slice(0, 7);
}

export const getPortfolioKpis = createServerFn({ method: "GET" }).handler(
  async (): Promise<PortfolioKpis> => {
    const [grRes, propsRes, unitsRes, tenantsRes, dunningObRes] =
      await Promise.all([
        supabaseAdmin.from("guardrails").select("simulated_now").maybeSingle(),
        supabaseAdmin.from("properties").select("id, city"),
        supabaseAdmin.from("units").select("id, target_rent"),
        supabaseAdmin.from("tenants").select("id, unit_id, rent_amount"),
        supabaseAdmin
          .from("rent_obligations")
          .select("tenant_id, dunning_stage")
          .gt("dunning_stage", 0),
      ]);

    const simulatedNow =
      (grRes.data?.simulated_now as string | null) ?? "2026-05-01";
    const month = monthKey(simulatedNow);
    const monthLabel = new Date(`${simulatedNow}T00:00:00Z`).toLocaleDateString(
      "de-DE",
      { month: "long", year: "numeric" },
    );

    const properties = propsRes.data ?? [];
    const units = unitsRes.data ?? [];
    const tenants = tenantsRes.data ?? [];

    const cities = new Set(properties.map((p) => p.city).filter(Boolean));
    const assignedUnits = new Set(
      tenants.map((t) => t.unit_id).filter(Boolean),
    );
    // Soll-Miete = full target potential across ALL units (occupied + vacant).
    const monthlyRent = units.reduce(
      (s, u) => s + Number(u.target_rent ?? 0),
      0,
    );

    const [obRes, payRes] = await Promise.all([
      supabaseAdmin
        .from("rent_obligations")
        .select("id, amount, status")
        .eq("month", month),
      supabaseAdmin
        .from("payment_events")
        .select("amount, occurred_at, type")
        .in("type", ["succeeded", "failed"])
        .gte("occurred_at", `${month}-01T00:00:00Z`)
        .lt("occurred_at", nextMonthIso(month)),
    ]);

    const expected = (obRes.data ?? []).reduce(
      (s, r) => s + Number(r.amount ?? 0),
      0,
    );
    const events = payRes.data ?? [];
    const received = events
      .filter((e) => e.type === "succeeded")
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const failedCount = events.filter((e) => e.type === "failed").length;
    const succeededCount = events.filter((e) => e.type === "succeeded").length;
    const totalAttempts = failedCount + succeededCount;
    const failedPercent =
      totalAttempts > 0 ? (failedCount / totalAttempts) * 100 : 0;

    const open = Math.max(expected - received, 0);
    const percentIn = expected > 0 ? (received / expected) * 100 : 0;

    // Group active dunning rent_obligations by tenant → highest stage per tenant.
    const tenantMaxStage = new Map<string, number>();
    for (const r of dunningObRes.data ?? []) {
      const s = Number(r.dunning_stage);
      const cur = tenantMaxStage.get(r.tenant_id) ?? 0;
      if (s > cur) tenantMaxStage.set(r.tenant_id, s);
    }
    let mahnung = 0;
    let eskalation = 0;
    let maxStage = 0;
    for (const s of tenantMaxStage.values()) {
      if (s >= 3) eskalation++;
      else if (s >= 1) mahnung++;
      if (s > maxStage) maxStage = s;
    }

    const totalUnits = units.length;
    const occupancyPct =
      totalUnits > 0 ? (assignedUnits.size / totalUnits) * 100 : 0;

    return {
      simulatedNow,
      monthLabel,
      units: {
        total: totalUnits,
        properties: properties.length,
        cities: cities.size,
      },
      occupancy: {
        assigned: assignedUnits.size,
        total: totalUnits,
        percent: occupancyPct,
      },
      monthlyRent,
      inflow: {
        received,
        expected,
        open,
        percent: percentIn,
        failed: failedCount,
        failedPercent,
      },
      dunning: {
        total: (dunningRes.data ?? []).length,
        stage1: stages[1],
        stage2: stages[2],
        stage3: stages[3],
      },
    };
  },
);

function nextMonthIso(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `${ny}-${String(nm).padStart(2, "0")}-01T00:00:00Z`;
}
