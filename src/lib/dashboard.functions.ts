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
  failedAmount: number;
  autoClearedPct: number;
  autoClearedNumerator: number;
  autoClearedDenominator: number;
  autoRecoveredPct: number;
  humanReviewPct: number;
  supportTickets: number;
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

const DEFAULT_MONTH = "2026-05";

/**
 * The "active" demo month = the latest `month` present in rent_obligations.
 * Falls back to DEFAULT_MONTH before any obligations exist (e.g. Scene 1, after
 * setup but before the first Advance Month). Reusable by other read functions
 * (exceptions, tenant portal) so every surface agrees on the current month.
 */
export async function getActiveMonth(): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("rent_obligations")
    .select("month")
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.month) return DEFAULT_MONTH;
  return data.month;
}

type ObligationRow = { status: string; amount: number };

export const getDashboardKpis = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardKpis> => {
    const month = await getActiveMonth();

    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from("rent_obligations")
      .select("status, amount")
      .eq("month", month);

    if (rowsErr) throw new Error(rowsErr.message);

    const all = (rows ?? []) as ObligationRow[];
    const total = all.length;

    // Count + euro-sum helpers, computed straight from rent_obligations for the
    // active month (do NOT use the hard-coded-month KPI views).
    const cnt = (...statuses: string[]) => all.filter((r) => statuses.includes(r.status)).length;
    const sum = (...statuses: string[]) =>
      all.filter((r) => statuses.includes(r.status)).reduce((acc, r) => acc + num(r.amount), 0);

    const collectedCount = cnt("paid", "reconciled");
    const recoveredCount = cnt("auto_recovered");
    const paymentPlanCount = cnt("payment_plan");
    const humanReviewCount = cnt("human_review");

    const expected = all.reduce((acc, r) => acc + num(r.amount), 0);
    const collected = sum("paid", "reconciled");
    const recovered = sum("auto_recovered");
    const paymentPlan = sum("payment_plan");
    const humanReview = sum("human_review");
    const failedAmount = sum("failed");

    // Auto-cleared = obligations the agent actually resolved without a human:
    // paid/reconciled, recovered on retry, or moved onto a payment plan. (Do NOT
    // count still-pending/failed rows — they aren't cleared yet.)
    const autoClearedNumerator = cnt("paid", "reconciled", "auto_recovered", "payment_plan");
    const autoClearedDenominator = total;
    const pct = (n: number) => (total > 0 ? Math.round((100 * n) / total) : 0);

    return {
      month,
      tenantCount: total,
      expected,
      collected,
      collectedCount,
      recovered,
      recoveredCount,
      paymentPlan,
      paymentPlanCount,
      humanReview,
      humanReviewCount,
      failedAmount,
      autoClearedPct: pct(autoClearedNumerator),
      autoClearedNumerator,
      autoClearedDenominator,
      autoRecoveredPct: pct(recoveredCount),
      humanReviewPct: pct(humanReviewCount),
      supportTickets: 0,
    };
  },
);
