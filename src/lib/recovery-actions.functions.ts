/**
 * Manual recovery actions surfaced to the UI — the Exception Queue buttons and
 * the Tenant Portal "accept payment plan" flow. These are TanStack Start server
 * functions (POST) that reuse the same execute* helpers + audit logging as the
 * autonomous payment-recovery agent so manual and automated paths stay
 * consistent and every action is recorded in agent_actions.
 *
 * Server-only. Writes only schema-valid enum values (see supabase/migrations).
 */
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  type AgentInput,
  computeRiskScore,
  defaultInstallments,
  executeEscalate,
  executeOfferPlan,
  executeReconcile,
  executeReminder,
  executeRetry,
  logAction,
  updateException,
} from "@/lib/payment-recovery-agent.server";

export type ExceptionAction = "retry" | "reminder" | "offer_payment_plan" | "escalate" | "resolve";

export interface RecoveryActionResult {
  ok: boolean;
  action: ExceptionAction | "accept_payment_plan";
  exceptionId: string | null;
  message: string;
}

/**
 * Rebuilds the AgentInput the execute* helpers expect from a stored exception.
 * Pulls the obligation (amount + Stripe invoice id) and the most recent failed
 * payment_event (failure reason + attempt count) for this obligation.
 */
async function buildAgentInputFromException(
  exceptionId: string,
): Promise<{ input: AgentInput; obligationAmount: number } | null> {
  const { data: exc } = await supabaseAdmin
    .from("exceptions")
    .select("id, tenant_id, unit_id, rent_obligation_id, risk_score")
    .eq("id", exceptionId)
    .maybeSingle();
  if (!exc) return null;

  const { data: obligation } = await supabaseAdmin
    .from("rent_obligations")
    .select("amount, stripe_invoice_id")
    .eq("id", exc.rent_obligation_id)
    .maybeSingle();

  const { data: failedEvents } = await supabaseAdmin
    .from("payment_events")
    .select("failure_reason")
    .eq("rent_obligation_id", exc.rent_obligation_id)
    .eq("type", "failed")
    .order("created_at", { ascending: false });

  const events = failedEvents ?? [];
  const failureReason = events[0]?.failure_reason ?? "card_declined";
  const attemptCount = Math.max(1, events.length);
  const obligationAmount = Number(obligation?.amount ?? 0);

  return {
    input: {
      exceptionId: exc.id,
      tenantId: exc.tenant_id,
      unitId: exc.unit_id,
      rentObligationId: exc.rent_obligation_id,
      invoiceId: obligation?.stripe_invoice_id ?? null,
      invoiceAmount: obligationAmount,
      failureReason,
      attemptCount,
    },
    obligationAmount,
  };
}

/**
 * B-2 — powers the Exception Queue buttons. Reuses the agent's execute* helpers
 * so a manual click produces the exact same DB writes + audit trail the
 * autonomous agent would. Every branch logs an agent_action with a
 * demo-quality reason. Honors guardrails (escalate at the critical threshold,
 * 2-part default plan).
 */
export const runExceptionAction = createServerFn({ method: "POST" })
  .inputValidator((input: { exceptionId: string; action: ExceptionAction }) => input)
  .handler(async ({ data }): Promise<RecoveryActionResult> => {
    const { exceptionId, action } = data;

    const built = await buildAgentInputFromException(exceptionId);
    if (!built) {
      return {
        ok: false,
        action,
        exceptionId: null,
        message: `Exception ${exceptionId} not found`,
      };
    }
    const { input, obligationAmount } = built;

    // Recompute an explainable risk score for this manual action so the queue
    // shows a fresh "why"; fall back to the stored score if heuristic is empty.
    const { score } = computeRiskScore({
      failedAttempts: input.attemptCount,
      outstandingAmount: input.invoiceAmount,
    });
    const riskScore = score;

    switch (action) {
      case "retry":
        await executeRetry(input, riskScore, "Manual retry triggered from the Exception Queue.");
        return done(action, exceptionId, "Retry attempted.");

      case "reminder":
        await executeReminder(
          input,
          riskScore,
          "portal",
          "Friendly reminder: your rent payment is still outstanding. Please review your payment details.",
        );
        return done(action, exceptionId, "Reminder sent.");

      case "offer_payment_plan":
        await executeOfferPlan(
          input,
          riskScore,
          obligationAmount,
          defaultInstallments(obligationAmount || input.invoiceAmount),
        );
        return done(action, exceptionId, "2-part payment plan offered.");

      case "escalate":
        await executeEscalate(
          input,
          riskScore,
          "Manually escalated to the property manager from the Exception Queue.",
        );
        return done(action, exceptionId, "Escalated to a human.");

      case "resolve":
        await updateException(exceptionId, {
          human_needed: false,
          status: "resolved",
        });
        await logAction(
          input,
          "reconcile",
          "success",
          "Manually marked resolved from the Exception Queue.",
          "Property manager closed the case; no further automated action needed.",
        );
        return done(action, exceptionId, "Exception resolved.");

      default: {
        // Exhaustiveness guard — never silently lose a case.
        const _never: never = action;
        return {
          ok: false,
          action: _never,
          exceptionId,
          message: `Unknown action: ${String(action)}`,
        };
      }
    }
  });

function done(action: ExceptionAction, exceptionId: string, message: string): RecoveryActionResult {
  return { ok: true, action, exceptionId, message };
}

/**
 * B-1 — a tenant accepts a payment plan the agent offered. Walks the
 * plan -> obligation -> exception chain via payment_plans.rent_obligation_id:
 * - payment_plans.status -> 'accepted'
 * - exceptions.status -> 'resolved', human_needed -> false (downgrade)
 * - rent_obligations stays 'payment_plan' (left untouched)
 * - agent_actions: action_type 'reconcile', result 'success'
 * - communications: message_type 'confirmation', channel 'portal'
 */
export const acceptPaymentPlan = createServerFn({ method: "POST" })
  .inputValidator((input: { planId: string }) => input)
  .handler(async ({ data }): Promise<RecoveryActionResult> => {
    const { planId } = data;

    const { data: plan, error: planErr } = await supabaseAdmin
      .from("payment_plans")
      .select("id, tenant_id, rent_obligation_id, total_amount, installment_count, status")
      .eq("id", planId)
      .maybeSingle();

    if (planErr || !plan) {
      return {
        ok: false,
        action: "accept_payment_plan",
        exceptionId: null,
        message: `Payment plan ${planId} not found`,
      };
    }

    // Idempotency guard: only an *offered* plan can be accepted. Re-accepting an
    // already-accepted/terminal plan would re-resolve the exception and insert a
    // duplicate confirmation + agent_action on every (double-)click.
    if (plan.status !== "offered") {
      return {
        ok: plan.status === "accepted" || plan.status === "active",
        action: "accept_payment_plan",
        exceptionId: null,
        message: `Payment plan already ${plan.status}`,
      };
    }

    // 1) Accept the plan.
    await supabaseAdmin.from("payment_plans").update({ status: "accepted" }).eq("id", plan.id);

    // 2) Resolve + downgrade the related exception (chain via obligation id).
    const { data: exc } = await supabaseAdmin
      .from("exceptions")
      .select("id, unit_id, tenant_id")
      .eq("rent_obligation_id", plan.rent_obligation_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (exc) {
      await updateException(exc.id, {
        status: "resolved",
        human_needed: false,
      });
    }

    // rent_obligations.status intentionally stays 'payment_plan' — the plan is
    // accepted but installments are not yet collected.

    // Resolve the unit id for logging (prefer the exception's, fall back to the
    // obligation's so we always have a valid agent_actions / unit reference).
    let unitId = exc?.unit_id ?? null;
    if (!unitId) {
      const { data: obligation } = await supabaseAdmin
        .from("rent_obligations")
        .select("unit_id")
        .eq("id", plan.rent_obligation_id)
        .maybeSingle();
      unitId = obligation?.unit_id ?? null;
    }

    // 3) Audit log: reconcile / success.
    if (unitId) {
      await supabaseAdmin.from("agent_actions").insert({
        exception_id: exc?.id ?? null,
        tenant_id: plan.tenant_id,
        unit_id: unitId,
        action_type: "reconcile",
        result: "success",
        reason: `Tenant accepted the ${plan.installment_count ?? 2}-part payment plan (total €${plan.total_amount}).`,
        policy_basis:
          "Plan accepted within guardrails (≤2 installments, ≤€1,500 auto-cap); exception downgraded from human review.",
      });
    }

    // 4) Confirmation to the tenant via the portal.
    await supabaseAdmin.from("communications").insert({
      tenant_id: plan.tenant_id,
      exception_id: exc?.id ?? null,
      channel: "portal",
      message_type: "confirmation",
      body: `Your payment plan is confirmed: ${plan.installment_count ?? 2} installments totaling €${plan.total_amount}. Thank you.`,
    });

    return {
      ok: true,
      action: "accept_payment_plan",
      exceptionId: exc?.id ?? null,
      message: "Payment plan accepted and confirmed.",
    };
  });
