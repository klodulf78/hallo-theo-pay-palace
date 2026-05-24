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

export type DunningNoticeRow = {
  id: string;
  stage: 1 | 2 | 3;
  issuedDate: string;
  deadlineDate: string;
  mahngebuehr: number;
  defaultInterestSnapshot: number;
  rentObligationId: string;
  month: string;
  amount: number;
  dueDate: string;
  snapshot: Verzugsnachweis | null;
};

export type TenantCase = {
  tenantId: string;
  tenantName: string;
  unitLabel: string;
  propertyName: string;
  propertyStreet: string | null;
  propertyPostalCode: string | null;
  propertyCity: string | null;
  severity: "critical" | "high" | "medium" | "low";
  hauptforderung: number;
  mahngebuehren: number;
  verzugszinsen: number;
  gesamtsaldo: number;
  notices: DunningNoticeRow[];
  stage3ExceptionId: string | null;
  stage3ExceptionStatus: string | null;
};

const SEVERITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function severityFromStage(stage: number): TenantCase["severity"] {
  if (stage >= 3) return "critical";
  if (stage === 2) return "high";
  if (stage === 1) return "medium";
  return "low";
}

export const listTenantCases = createServerFn({ method: "GET" }).handler(
  async (): Promise<TenantCase[]> => {
    // 1. Tenants with active dunning OR open exceptions
    const { data: dunningObls } = await supabaseAdmin
      .from("rent_obligations")
      .select("tenant_id")
      .gt("dunning_stage", 0);

    const { data: openExceptions } = await supabaseAdmin
      .from("exceptions")
      .select("tenant_id")
      .eq("human_needed", true)
      .in("status", ["open", "in_progress"]);

    const tenantIds = [
      ...new Set([
        ...(dunningObls ?? []).map((r) => r.tenant_id),
        ...(openExceptions ?? []).map((r) => r.tenant_id),
      ].filter(Boolean)),
    ];
    if (tenantIds.length === 0) return [];

    // 2. Tenants + units + properties
    const { data: tenants } = await supabaseAdmin
      .from("tenants")
      .select("id, name, unit_id")
      .in("id", tenantIds);

    const unitIds = [...new Set((tenants ?? []).map((t) => t.unit_id).filter(Boolean))];
    const { data: units } = await supabaseAdmin
      .from("units")
      .select("id, label, property_id")
      .in("id", unitIds);

    const propIds = [...new Set((units ?? []).map((u) => u.property_id).filter(Boolean))];
    const { data: properties } = await supabaseAdmin
      .from("properties")
      .select("id, name, street, postal_code, city")
      .in("id", propIds);

    const unitMap = new Map((units ?? []).map((u) => [u.id, u]));
    const propMap = new Map((properties ?? []).map((p) => [p.id, p]));

    // 3. All rent_obligations for these tenants (for balance + notice metadata)
    const { data: allObls } = await supabaseAdmin
      .from("rent_obligations")
      .select(
        "id, tenant_id, month, due_date, amount, status, dunning_stage, accrued_dunning_fees, accrued_default_interest",
      )
      .in("tenant_id", tenantIds);

    const oblMap = new Map((allObls ?? []).map((o) => [o.id, o]));

    // 4. All dunning_notices for these tenants
    const { data: notices } = await supabaseAdmin
      .from("dunning_notices")
      .select(
        "id, tenant_id, rent_obligation_id, stage, issued_date, deadline_date, mahngebuehr, default_interest_snapshot, verzugsnachweis",
      )
      .in("tenant_id", tenantIds)
      .order("issued_date", { ascending: true });

    // 5. Open Stage-3 exceptions per tenant (for action buttons)
    const { data: stage3Excs } = await supabaseAdmin
      .from("exceptions")
      .select("id, tenant_id, status, severity")
      .in("tenant_id", tenantIds)
      .eq("human_needed", true)
      .in("status", ["open", "in_progress"]);

    const stage3Map = new Map<string, { id: string; status: string | null }>();
    for (const e of stage3Excs ?? []) {
      if (!stage3Map.has(e.tenant_id)) {
        stage3Map.set(e.tenant_id, { id: e.id, status: e.status });
      }
    }

    // 6. Build cases
    const cases: TenantCase[] = (tenants ?? []).map((t) => {
      const unit = unitMap.get(t.unit_id);
      const prop = unit ? propMap.get(unit.property_id) : null;

      const tenantObls = (allObls ?? []).filter((o) => o.tenant_id === t.id);
      const unpaid = tenantObls.filter(
        (o) => o.status !== "paid" && o.status !== "refunded",
      );

      const hauptforderung = unpaid.reduce((s, o) => s + Number(o.amount ?? 0), 0);
      const mahngebuehren = tenantObls.reduce(
        (s, o) => s + Number(o.accrued_dunning_fees ?? 0),
        0,
      );
      const verzugszinsen = tenantObls.reduce(
        (s, o) => s + Number(o.accrued_default_interest ?? 0),
        0,
      );

      const tenantNotices = (notices ?? [])
        .filter((n) => n.tenant_id === t.id)
        .map((n): DunningNoticeRow => {
          const obl = oblMap.get(n.rent_obligation_id);
          const rb = n.verzugsnachweis as unknown;
          return {
            id: n.id,
            stage: n.stage as 1 | 2 | 3,
            issuedDate: n.issued_date,
            deadlineDate: n.deadline_date,
            mahngebuehr: Number(n.mahngebuehr ?? 0),
            defaultInterestSnapshot: Number(n.default_interest_snapshot ?? 0),
            rentObligationId: n.rent_obligation_id,
            month: obl?.month ?? "",
            amount: Number(obl?.amount ?? 0),
            dueDate: obl?.due_date ?? "",
            snapshot: rb && typeof rb === "object" ? (rb as Verzugsnachweis) : null,
          };
        });

      const maxStage = tenantNotices.reduce((m, n) => Math.max(m, n.stage), 0);
      const stage3 = stage3Map.get(t.id) ?? null;
      const severity = stage3
        ? "critical"
        : severityFromStage(maxStage);

      return {
        tenantId: t.id,
        tenantName: t.name,
        unitLabel: unit?.label ?? "—",
        propertyName: prop?.name ?? "—",
        propertyStreet: prop?.street ?? null,
        propertyPostalCode: prop?.postal_code ?? null,
        propertyCity: prop?.city ?? null,
        severity,
        hauptforderung,
        mahngebuehren,
        verzugszinsen,
        gesamtsaldo: hauptforderung + mahngebuehren + verzugszinsen,
        notices: tenantNotices,
        stage3ExceptionId: stage3?.id ?? null,
        stage3ExceptionStatus: stage3?.status ?? null,
      };
    });

    // Sort: highest severity → highest balance first
    cases.sort((a, b) => {
      const sd = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
      if (sd !== 0) return sd;
      return b.gesamtsaldo - a.gesamtsaldo;
    });

    return cases;
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
