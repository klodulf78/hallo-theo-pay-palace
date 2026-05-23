import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

export type Verzugsnachweis = {
  rent_obligation_id: string;
  tenant_id: string;
  stage: 1 | 2 | 3;
  expected_amount: number;
  received_amount: number;
  open_amount: number;
  basiszinssatz: number;
  default_interest_surcharge: number;
  default_since: string;
  as_of: string;
  default_days_calendar: number;
  default_interest: number;
  mahngebuehr: number;
  trigger: string;
};

export type ExceptionRow = {
  id: string;
  severity: string | null;
  recommendedAction: string | null;
  createdAt: string;
  status: string | null;
  riskBreakdownRaw: string | null;
  snapshot: Verzugsnachweis | null;
  tenantName: string;
  propertyName: string;
  unitLabel: string;
  month: string | null;
  dueDate: string | null;
  totalAccruedFees: number;
};

export const listOpenExceptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<ExceptionRow[]> => {
    const { data, error } = await supabaseAdmin
      .from("exceptions")
      .select(
        "id, severity, recommended_action, status, human_needed, created_at, risk_breakdown, tenant_id, unit_id, rent_obligation_id",
      )
      .eq("human_needed", true)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) return [];

    const tenantIds = [...new Set(rows.map((r) => r.tenant_id).filter(Boolean))];
    const unitIds = [...new Set(rows.map((r) => r.unit_id).filter(Boolean))];
    const obligationIds = [
      ...new Set(rows.map((r) => r.rent_obligation_id).filter(Boolean)),
    ];

    const [{ data: tenants }, { data: units }, { data: obligations }] =
      await Promise.all([
        supabaseAdmin.from("tenants").select("id, name").in("id", tenantIds),
        supabaseAdmin
          .from("units")
          .select("id, label, property_id")
          .in("id", unitIds),
        supabaseAdmin
          .from("rent_obligations")
          .select("id, month, due_date, accrued_dunning_fees")
          .in("id", obligationIds),
      ]);
    const propIds = [
      ...new Set((units ?? []).map((u) => u.property_id).filter(Boolean)),
    ];
    const { data: properties } = await supabaseAdmin
      .from("properties")
      .select("id, name")
      .in("id", propIds);

    const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t.name]));
    const unitMap = new Map((units ?? []).map((u) => [u.id, u]));
    const propMap = new Map((properties ?? []).map((p) => [p.id, p.name]));
    const oblMap = new Map((obligations ?? []).map((o) => [o.id, o]));

    return rows.map((r) => {
      const unit = unitMap.get(r.unit_id);
      const obl = oblMap.get(r.rent_obligation_id);
      const rb = r.risk_breakdown as unknown;
      return {
        id: r.id,
        severity: r.severity,
        recommendedAction: r.recommended_action,
        status: r.status,
        createdAt: r.created_at,
        riskBreakdownRaw:
          rb == null ? null : JSON.stringify(rb, null, 2),
        snapshot:
          rb && typeof rb === "object" ? (rb as Verzugsnachweis) : null,
        tenantName: tenantMap.get(r.tenant_id) ?? "—",
        propertyName: unit ? (propMap.get(unit.property_id) ?? "—") : "—",
        unitLabel: unit?.label ?? "—",
        month: obl?.month ?? null,
        dueDate: obl?.due_date ?? null,
        totalAccruedFees: Number(obl?.accrued_dunning_fees ?? 0),
      };
    });
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
