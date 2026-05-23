import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export type ExceptionRow = {
  id: string;
  severity: string | null;
  recommendedAction: string | null;
  createdAt: string;
  status: string | null;
  riskBreakdown: string | null;
  tenantName: string;
  propertyName: string;
};

export const listOpenExceptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<ExceptionRow[]> => {
    const { data, error } = await supabaseAdmin
      .from("exceptions")
      .select(
        "id, severity, recommended_action, status, human_needed, created_at, risk_breakdown, tenant_id, unit_id",
      )
      .eq("human_needed", true)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter(Boolean))];
    const unitIds = [...new Set(rows.map((r) => r.unit_id).filter(Boolean))];

    const [{ data: tenants }, { data: units }] = await Promise.all([
      supabaseAdmin.from("tenants").select("id, name").in("id", tenantIds),
      supabaseAdmin.from("units").select("id, property_id").in("id", unitIds),
    ]);
    const propIds = [
      ...new Set((units ?? []).map((u) => u.property_id).filter(Boolean)),
    ];
    const { data: properties } = await supabaseAdmin
      .from("properties")
      .select("id, name")
      .in("id", propIds);

    const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t.name]));
    const unitMap = new Map((units ?? []).map((u) => [u.id, u.property_id]));
    const propMap = new Map((properties ?? []).map((p) => [p.id, p.name]));

    return rows.map((r) => ({
      id: r.id,
      severity: r.severity,
      recommendedAction: r.recommended_action,
      status: r.status,
      createdAt: r.created_at,
      riskBreakdown: r.risk_breakdown,
      tenantName: tenantMap.get(r.tenant_id) ?? "—",
      propertyName: propMap.get(unitMap.get(r.unit_id) ?? "") ?? "—",
    }));
  },
);

export const markExceptionInProgress = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("exceptions")
      .update({ status: "in_progress" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
