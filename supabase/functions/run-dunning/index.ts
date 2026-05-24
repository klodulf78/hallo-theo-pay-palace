// run-dunning — Supabase Edge Function.
//
// Iterates open rent_obligations, evaluates the Mahnstufen state machine against
// the current Time-Machine date, advances stages, accrues Mahngebühren and
// Verzugszinsen, writes dunning_notices + agent_actions, and creates Stage-3 /
// human-review exceptions.
//
// Idempotent: re-running for the same as_of date must not double-issue a stage,
// double-charge a fee, or duplicate rows. Idempotency is enforced by the
// UNIQUE(rent_obligation_id, stage) constraint on dunning_notices.
//
// Trigger:
//   - Automatically from src/lib/stripe.functions.ts:advanceStripeMonth after
//     the test clock has settled.
//   - Manually via POST { as_of?: "YYYY-MM-DD" } for testing.

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.1";
import {
  type ClaimInput,
  type DunningPolicy,
  decideClaimAction,
} from "../_shared/dunning-logic.ts";
import { toIsoDate } from "../_shared/working-days.ts";

declare const Deno: {
  env: { get(key: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): void;
};

type DunningRunResult = {
  as_of: string;
  scanned: number;
  stages_issued: number;
  stages_by_stage: Record<string, number>;
  resets: number;
  exceptions_created: number;
  skipped: number;
};

Deno.serve(async (req: Request) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      return jsonResponse({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }
    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let bodyAsOf: string | undefined;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body && typeof body.as_of === "string") bodyAsOf = body.as_of;
      } catch {
        // Empty body is fine — fall through to guardrails.simulated_now.
      }
    }

    const result = await runDunning(db, bodyAsOf);
    return jsonResponse(result, 200);
  } catch (err) {
    console.error("run-dunning failed:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// ---------- Engine ----------

async function runDunning(db: any, bodyAsOf?: string): Promise<DunningRunResult> {
  // 1) Resolve policy + Time-Machine date from guardrails.
  const { data: gr, error: grErr } = await db
    .from("guardrails")
    .select(
      `id, basiszinssatz, default_interest_surcharge,
       dunning_stage1_fee, dunning_stage2_fee,
       dunning_stage1_deadline_working_days, dunning_stage2_deadline_working_days,
       dunning_stage3_arrears_threshold, sepa_chargeback_fee,
       default_grace_working_days, default_due_working_day,
       simulated_now`,
    )
    .maybeSingle();
  if (grErr) throw new Error(`guardrails read failed: ${grErr.message}`);
  if (!gr) throw new Error("guardrails row missing — run setup first");

  const asOf = bodyAsOf ?? gr.simulated_now ?? toIsoDate(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    throw new Error(`invalid as_of date: ${asOf}`);
  }

  const policy: DunningPolicy = {
    basiszinssatz: Number(gr.basiszinssatz),
    defaultInterestSurcharge: Number(gr.default_interest_surcharge),
    stage1Fee: Number(gr.dunning_stage1_fee),
    stage2Fee: Number(gr.dunning_stage2_fee),
    stage1DeadlineWorkingDays: Number(gr.dunning_stage1_deadline_working_days),
    stage2DeadlineWorkingDays: Number(gr.dunning_stage2_deadline_working_days),
    stage3ArrearsThreshold: Number(gr.dunning_stage3_arrears_threshold),
    sepaChargebackFee: Number(gr.sepa_chargeback_fee),
    defaultGraceWorkingDays: Number(gr.default_grace_working_days),
    defaultDueWorkingDay: Number(gr.default_due_working_day),
  };

  // 2) Load all rent_obligations that could be affected (everything except
  //    reconciled — we still need to see "paid" claims so we can reset state).
  const { data: claims, error: claimsErr } = await db.from("rent_obligations").select(
    `id, tenant_id, unit_id, amount, due_date, status,
       dunning_stage, default_since, accrued_dunning_fees, accrued_default_interest,
       tenant:tenants ( id, due_day, rent_amount )`,
  );
  if (claimsErr) throw new Error(`rent_obligations read failed: ${claimsErr.message}`);

  // 3) Pre-load arrears per tenant (sum of open principal across all unpaid claims).
  const arrearsByTenant = new Map<string, number>();
  for (const c of claims ?? []) {
    if (c.status === "paid" || c.status === "reconciled") continue;
    arrearsByTenant.set(c.tenant_id, (arrearsByTenant.get(c.tenant_id) ?? 0) + Number(c.amount));
  }

  // 4) Pre-load existing dunning_notices per claim (for idempotency + deadline math).
  const claimIds = (claims ?? []).map((c: any) => c.id);
  const { data: notices } = await db
    .from("dunning_notices")
    .select("rent_obligation_id, stage, issued_date")
    .in("rent_obligation_id", claimIds.length > 0 ? claimIds : ["__none__"]);
  const noticesByClaim = new Map<string, Record<1 | 2 | 3, string | undefined>>();
  for (const n of notices ?? []) {
    const entry =
      noticesByClaim.get(n.rent_obligation_id) ??
      ({ 1: undefined, 2: undefined, 3: undefined } as Record<1 | 2 | 3, string | undefined>);
    entry[n.stage as 1 | 2 | 3] = n.issued_date;
    noticesByClaim.set(n.rent_obligation_id, entry);
  }

  // 5) Pre-load active payment_plans per claim (status accepted/active).
  const { data: plans } = await db
    .from("payment_plans")
    .select("rent_obligation_id, status")
    .in("status", ["accepted", "active"])
    .in("rent_obligation_id", claimIds.length > 0 ? claimIds : ["__none__"]);
  const hasPlan = new Set<string>((plans ?? []).map((p: any) => p.rent_obligation_id));

  // 6) Pre-load open human-needed exceptions per claim.
  const { data: openExceptions } = await db
    .from("exceptions")
    .select("rent_obligation_id")
    .eq("human_needed", true)
    .in("status", ["open", "in_progress"])
    .in("rent_obligation_id", claimIds.length > 0 ? claimIds : ["__none__"]);
  const hasOpenException = new Set<string>(
    (openExceptions ?? []).map((e: any) => e.rent_obligation_id),
  );

  // 7) Pre-load SEPA chargeback events per claim (earliest occurrence wins,
  //    so Stage 1 / default_since can be backdated to the real chargeback day).
  const { data: chargebacks } = await db
    .from("payment_events")
    .select("rent_obligation_id, occurred_at")
    .eq("type", "failed")
    .in("failure_reason", ["chargeback_dispute", "insufficient_funds", "invalid_mandate"])
    .in("rent_obligation_id", claimIds.length > 0 ? claimIds : ["__none__"]);
  const sepaChargebackClaims = new Set<string>();
  const sepaChargebackDateByClaim = new Map<string, string>();
  for (const e of chargebacks ?? []) {
    if (!e.rent_obligation_id) continue;
    sepaChargebackClaims.add(e.rent_obligation_id);
    const iso = String(e.occurred_at ?? "").slice(0, 10);
    if (!iso) continue;
    const prev = sepaChargebackDateByClaim.get(e.rent_obligation_id);
    if (!prev || iso < prev) sepaChargebackDateByClaim.set(e.rent_obligation_id, iso);
  }

  // 8) Iterate.
  const result: DunningRunResult = {
    as_of: asOf,
    scanned: claims?.length ?? 0,
    stages_issued: 0,
    stages_by_stage: { "1": 0, "2": 0, "3": 0 },
    resets: 0,
    exceptions_created: 0,
    skipped: 0,
  };

  for (const c of claims ?? []) {
    const tenant = c.tenant as { id: string; due_day: number | null; rent_amount: number } | null;
    if (!tenant) {
      result.skipped++;
      continue;
    }

    // Mutable per-claim view that we update between cascade iterations so the
    // next decideClaimAction() sees the just-issued stage.
    const notices: Record<1 | 2 | 3, string | undefined> =
      noticesByClaim.get(c.id) ??
      ({ 1: undefined, 2: undefined, 3: undefined } as Record<1 | 2 | 3, string | undefined>);
    let dunningStage = (c.dunning_stage ?? 0) as 0 | 1 | 2 | 3;
    let defaultSince: string | null = c.default_since ?? null;
    let accruedFees = Number(c.accrued_dunning_fees ?? 0);
    let accruedInterest = Number(c.accrued_default_interest ?? 0);
    let cascadeIssued = 0;
    let cascadeReset = false;

    // Loop: a single dunning run can promote a claim through multiple stages
    // when accurate historical dates show enough WT have already elapsed.
    for (let i = 0; i < 4; i++) {
      const input: ClaimInput = {
        id: c.id,
        tenantId: c.tenant_id,
        amount: Number(c.amount),
        monthlyRent: Number(tenant.rent_amount),
        dueDate: c.due_date,
        status: c.status,
        dunningStage,
        defaultSince,
        accruedDunningFees: accruedFees,
        accruedDefaultInterest: accruedInterest,
        hadSepaChargeback: sepaChargebackClaims.has(c.id),
        existingNotices: { ...notices },
        hasActivePaymentPlan: hasPlan.has(c.id),
        hasOpenHumanException: hasOpenException.has(c.id),
      };

      const action = decideClaimAction(
        input,
        { openArrearsAmount: arrearsByTenant.get(c.tenant_id) ?? 0 },
        policy,
        tenant.due_day ?? null,
        asOf,
      );

      if (action.kind === "noop") break;

      if (action.kind === "reset") {
        const { error: updErr } = await db
          .from("rent_obligations")
          .update({
            dunning_stage: 0,
            default_since: null,
            accrued_dunning_fees: 0,
            accrued_default_interest: 0,
          })
          .eq("id", c.id);
        if (updErr) console.error(`reset failed for ${c.id}: ${updErr.message}`);
        else cascadeReset = true;
        break;
      }

      // kind === "issue_stage"
      const { error: insErr } = await db.from("dunning_notices").insert({
        rent_obligation_id: c.id,
        tenant_id: c.tenant_id,
        stage: action.stage,
        issued_date: action.issuedDate,
        deadline_date: action.deadlineDate,
        mahngebuehr: action.mahngebuehr,
        default_interest_snapshot: action.defaultInterestSnapshot,
        verzugsnachweis: action.verzugsnachweis,
      });
      if (insErr) {
        if (insErr.code !== "23505") {
          console.error(`dunning_notices insert failed for ${c.id}: ${insErr.message}`);
        }
        break;
      }

      const { error: updClaimErr } = await db
        .from("rent_obligations")
        .update({
          dunning_stage: action.newDunningStage,
          default_since: action.newDefaultSince,
          accrued_dunning_fees: action.newAccruedFees,
          accrued_default_interest: action.newAccruedInterest,
        })
        .eq("id", c.id);
      if (updClaimErr) {
        console.error(`rent_obligations update failed for ${c.id}: ${updClaimErr.message}`);
      }

      // Stage 3 → also create an exceptions case-file row.
      let exceptionId: string | null = null;
      if (action.requiresHumanException) {
        const { data: exRow, error: exErr } = await db
          .from("exceptions")
          .insert({
            rent_obligation_id: c.id,
            unit_id: c.unit_id,
            tenant_id: c.tenant_id,
            type: "repeated_failure",
            severity: "critical",
            risk_breakdown: action.verzugsnachweis,
            recommended_action: "escalate",
            status: "open",
            human_needed: true,
          })
          .select("id")
          .maybeSingle();
        if (exErr) {
          console.error(`exception insert failed for ${c.id}: ${exErr.message}`);
        } else {
          exceptionId = exRow?.id ?? null;
          result.exceptions_created++;
        }
      }

      const actionType = action.stage === 3 ? "escalate" : "reminder";
      const { error: actErr } = await db.from("agent_actions").insert({
        exception_id: exceptionId,
        unit_id: c.unit_id,
        tenant_id: c.tenant_id,
        action_type: actionType,
        reason: `Mahnstufe ${action.stage} ausgestellt (${action.verzugsnachweis.trigger})`,
        policy_basis: action.stage === 3 ? "§ 543 / § 569 BGB" : "§ 286, § 288 BGB",
        result: "success",
      });
      if (actErr) console.error(`agent_actions insert failed for ${c.id}: ${actErr.message}`);

      // Update local view so next loop iteration sees this stage as issued.
      notices[action.stage] = action.issuedDate;
      dunningStage = action.newDunningStage;
      defaultSince = action.newDefaultSince;
      accruedFees = action.newAccruedFees;
      accruedInterest = action.newAccruedInterest;
      cascadeIssued++;
      result.stages_issued++;
      result.stages_by_stage[String(action.stage)]++;

      if (action.stage === 3) break;
    }

    if (cascadeReset) result.resets++;
    else if (cascadeIssued === 0) result.skipped++;
  }

  return result;
}
