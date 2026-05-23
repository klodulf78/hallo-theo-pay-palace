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

export const getDashboardKpis = createServerFn({ method: "GET" }).handler(
  async (): Promise<DashboardKpis> => {
    const month = "2026-05";
    const { data, error } = await supabaseAdmin
      .from("rent_obligations")
      .select("amount, status")
      .eq("month", month);

    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const sum = (pred: (r: { status: string }) => boolean) =>
      rows
        .filter(pred)
        .reduce((acc, r) => acc + Number(r.amount), 0);
    const count = (pred: (r: { status: string }) => boolean) =>
      rows.filter(pred).length;

    const expected = rows.reduce((acc, r) => acc + Number(r.amount), 0);
    const collected = sum((r) => r.status === "paid");
    const recovered = sum((r) => r.status === "auto_recovered");
    const paymentPlan = sum((r) => r.status === "payment_plan");
    const humanReview = sum((r) => r.status === "human_review");

    const autoCleared = count(
      (r) =>
        r.status === "paid" ||
        r.status === "auto_recovered" ||
        r.status === "payment_plan",
    );
    const total = rows.length;
    const autoClearedPct =
      total > 0 ? Math.round((autoCleared / total) * 100) : 0;

    return {
      month,
      tenantCount: total,
      expected,
      collected,
      collectedCount: count((r) => r.status === "paid"),
      recovered,
      recoveredCount: count((r) => r.status === "auto_recovered"),
      paymentPlan,
      paymentPlanCount: count((r) => r.status === "payment_plan"),
      humanReview,
      humanReviewCount: count((r) => r.status === "human_review"),
      autoClearedPct,
      autoClearedNumerator: autoCleared,
      autoClearedDenominator: total,
      supportTickets: 0,
    };
  },
);
