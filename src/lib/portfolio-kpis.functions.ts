import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PortfolioKpis = {
  simulatedNow: string | null;
  monthLabel: string;
  units: { total: number; properties: number; cities: number };
  occupancy: { assigned: number; total: number; percent: number };
  monthlyRent: number;
  inflow: { received: number; expected: number; open: number; percent: number };
  dunning: { total: number; stage1: number; stage2: number; stage3: number };
};

function monthKey(d: string): string {
  return d.slice(0, 7);
}

export const getPortfolioKpis = createServerFn({ method: "GET" }).handler(
  async (): Promise<PortfolioKpis> => {
    const [grRes, propsRes, unitsRes, tenantsRes, dunningRes] =
      await Promise.all([
        supabaseAdmin.from("guardrails").select("simulated_now").maybeSingle(),
        supabaseAdmin.from("properties").select("id, city"),
        supabaseAdmin.from("units").select("id"),
        supabaseAdmin.from("tenants").select("id, unit_id, rent_amount"),
        supabaseAdmin.from("dunning_notices").select("stage"),
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
    const monthlyRent = tenants.reduce(
      (s, t) => s + Number(t.rent_amount ?? 0),
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
        .eq("type", "succeeded")
        .gte("occurred_at", `${month}-01T00:00:00Z`)
        .lt("occurred_at", nextMonthIso(month)),
    ]);

    const expected = (obRes.data ?? []).reduce(
      (s, r) => s + Number(r.amount ?? 0),
      0,
    );
    const received = (payRes.data ?? []).reduce(
      (s, r) => s + Number(r.amount ?? 0),
      0,
    );
    const open = Math.max(expected - received, 0);
    const percentIn = expected > 0 ? (received / expected) * 100 : 0;

    const stages = { 1: 0, 2: 0, 3: 0 } as Record<number, number>;
    for (const d of dunningRes.data ?? []) {
      const s = Number(d.stage);
      if (stages[s] != null) stages[s]++;
    }

    const totalUnits = units.length;
    const occupancyPct = totalUnits > 0 ? (assignedUnits.size / totalUnits) * 100 : 0;

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
