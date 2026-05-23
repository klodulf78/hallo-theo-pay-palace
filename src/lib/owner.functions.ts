import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getActiveMonth } from "@/lib/dashboard.functions";

export type OwnerPreview = {
  month: string;
  ownerName: string | null;
  propertyName: string | null;
  grossCollected: number;
  inPlan: number;
  unresolved: number;
  managementFeeRate: number;
  managementFee: number;
  expectedPayout: number;
};

const num = (v: unknown) => (v == null ? 0 : Number(v));

type ObligationRow = { status: string; amount: number };

/**
 * Owner payout preview (PRD §7.5) — lightweight, read-only. Computes the
 * owner-facing money split for the active month straight from rent_obligations.
 * Preview only: this is NOT a real payout flow. Returns zeros on empty data.
 */
export const getOwnerPreview = createServerFn({ method: "GET" }).handler(
  async (): Promise<OwnerPreview> => {
    const month = await getActiveMonth();

    const { data: rows, error: rowsErr } = await supabaseAdmin
      .from("rent_obligations")
      .select("status, amount")
      .eq("month", month);

    if (rowsErr) throw new Error(rowsErr.message);

    const all = (rows ?? []) as ObligationRow[];
    const sum = (...statuses: string[]) =>
      all.filter((r) => statuses.includes(r.status)).reduce((acc, r) => acc + num(r.amount), 0);

    const grossCollected = sum("paid", "reconciled", "auto_recovered");
    const inPlan = sum("payment_plan");
    const unresolved = sum("human_review", "failed");

    // First owner row → name + fee rate. Defensive: there may be none.
    const { data: owner } = await supabaseAdmin
      .from("owners")
      .select("name, management_fee_rate")
      .limit(1)
      .maybeSingle();

    // First property row → display name. Defensive: there may be none.
    const { data: property } = await supabaseAdmin
      .from("properties")
      .select("name")
      .limit(1)
      .maybeSingle();

    const managementFeeRate = num(owner?.management_fee_rate ?? 0);
    const managementFee = Math.round(grossCollected * managementFeeRate);
    const expectedPayout = grossCollected - managementFee;

    return {
      month,
      ownerName: owner?.name ?? null,
      propertyName: property?.name ?? null,
      grossCollected,
      inPlan,
      unresolved,
      managementFeeRate,
      managementFee,
      expectedPayout,
    };
  },
);
