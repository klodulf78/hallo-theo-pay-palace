import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DashboardKpis = {
  month: string;
  tenantCount: number;
  expected: number;
  collected: number;
  collectedCount: number;
  recovered: number;
  recoveredCount: number;
  paymentPlan: number;
  paymentPlanCount: number;
  humanReview: number;
  humanReviewCount: number;
  autoClearedPct: number;
  autoClearedNumerator: number;
  autoClearedDenominator: number;
  supportTickets: number;
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

export const getDashboardKpis = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardKpis> => {
    const { data: kpi, error: kpiErr } = await supabaseAdmin
      .from("portfolio_kpis")
      .select("*")
      .maybeSingle();
    if (kpiErr) throw new Error(kpiErr.message);

    const month =
      (kpi?.month as string | undefined) ??
      new Date().toISOString().slice(0, 7);

    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from("rent_obligations")
      .select("status")
      .eq("month", month);
    if (rowsErr) throw new Error(rowsErr.message);


    const all = rows ?? [];
    const cnt = (s: string) => all.filter((r) => r.status === s).length;
    const total = all.length;
    const autoCleared =
      cnt("paid") + cnt("reconciled") + cnt("auto_recovered") + cnt("payment_plan");

    return {
      month,
      tenantCount: num(kpi?.unit_count) || total,
      expected: num(kpi?.expected_rent),
      collected: num(kpi?.collected),
      collectedCount: cnt("paid") + cnt("reconciled"),
      recovered: num(kpi?.recovered_by_agent),
      recoveredCount: cnt("auto_recovered"),
      paymentPlan: num(kpi?.in_payment_plan),
      paymentPlanCount: cnt("payment_plan"),
      humanReview: num(kpi?.needs_human_review),
      humanReviewCount: cnt("human_review"),
      autoClearedPct: num(kpi?.auto_cleared_rate),
      autoClearedNumerator: autoCleared,
      autoClearedDenominator: total,
      supportTickets: 0,
    };
  },
);
