import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PropertyMarker = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  unitCount: number;
  dunningCount: number;
  status: "red" | "yellow" | "green";
};

export type PortfolioData = {
  summary: {
    properties: number;
    tenants: number;
    mrr: number;
    activeExceptions: number;
  };
  markers: PropertyMarker[];
};

export const getPortfolio = createServerFn({ method: "GET" }).handler(
  async (): Promise<PortfolioData> => {
    const [propsRes, unitsRes, tenantsRes, obsRes, excRes] = await Promise.all([
      supabaseAdmin.from("properties").select("id, name, lat, lng"),
      supabaseAdmin.from("units").select("id, property_id"),
      supabaseAdmin.from("tenants").select("id, unit_id, rent_amount"),
      supabaseAdmin.from("rent_obligations").select("tenant_id, dunning_stage"),
      supabaseAdmin.from("exceptions").select("tenant_id, severity, status"),
    ]);

    const properties = propsRes.data ?? [];
    const units = unitsRes.data ?? [];
    const tenants = tenantsRes.data ?? [];
    const obligations = obsRes.data ?? [];
    const exceptions = excRes.data ?? [];

    const unitToProperty = new Map<string, string>(
      units.map((u) => [u.id, u.property_id]),
    );
    const tenantToProperty = new Map<string, string | undefined>();
    let mrr = 0;
    for (const t of tenants) {
      mrr += Number(t.rent_amount ?? 0);
      tenantToProperty.set(t.id, unitToProperty.get(t.unit_id));
    }

    const unitCountByProp = new Map<string, number>();
    for (const u of units) {
      unitCountByProp.set(
        u.property_id,
        (unitCountByProp.get(u.property_id) ?? 0) + 1,
      );
    }

    const dunningByProp = new Map<string, number>();
    for (const o of obligations) {
      if ((o.dunning_stage ?? 0) > 0) {
        const p = tenantToProperty.get(o.tenant_id);
        if (p) dunningByProp.set(p, (dunningByProp.get(p) ?? 0) + 1);
      }
    }

    const criticalProps = new Set<string>();
    let activeExceptions = 0;
    for (const e of exceptions) {
      const isOpen = !e.status || e.status === "open" || e.status === "pending";
      if (isOpen) activeExceptions++;
      if (isOpen && e.severity === "critical") {
        const p = tenantToProperty.get(e.tenant_id);
        if (p) criticalProps.add(p);
      }
    }

    const markers: PropertyMarker[] = properties
      .filter((p) => p.lat != null && p.lng != null)
      .map((p) => {
        const dunningCount = dunningByProp.get(p.id) ?? 0;
        const status: "red" | "yellow" | "green" = criticalProps.has(p.id)
          ? "red"
          : dunningCount > 0
            ? "yellow"
            : "green";
        return {
          id: p.id,
          name: p.name,
          lat: Number(p.lat),
          lng: Number(p.lng),
          unitCount: unitCountByProp.get(p.id) ?? 0,
          dunningCount,
          status,
        };
      });

    return {
      summary: {
        properties: properties.length,
        tenants: tenants.length,
        mrr: Math.round(mrr),
        activeExceptions,
      },
      markers,
    };
  },
);
