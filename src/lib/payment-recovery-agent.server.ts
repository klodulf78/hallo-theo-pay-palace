/**
 * Payment-recovery agent. Invoked from the Stripe webhook on
 * invoice.payment_failed. Picks one of four recovery actions via tool use over
 * the Lovable AI gateway and dispatches DB writes + Stripe calls to match.
 *
 * Server-only (filename suffix). Writes to existing tables created in the
 * schema migrations under supabase/migrations/. No new schema needed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { recoverInvoiceWithGoodCard } from "@/lib/stripe.server";

type BehaviorProfile = "reliable" | "soft_fail" | "payment_plan" | "critical";

const RISK_BY_BEHAVIOR: Record<BehaviorProfile, number> = {
  reliable: 10,
  soft_fail: 45,
  payment_plan: 72,
  critical: 91,
};

// Critical-risk guardrail: at or above this score the agent must escalate.
export const CRITICAL_RISK_THRESHOLD = 80;

/**
 * Inputs to the explainable risk heuristic. Every field is optional so callers
 * can supply only what they know; missing signals contribute 0.
 */
export interface RiskSignals {
  daysOverdue?: number;
  failedAttempts?: number;
  priorLate?: number;
  noMandate?: boolean;
  outstandingAmount?: number;
  priorSuccessful?: number;
  /**
   * Risk-tier floor from the tenant's behavior profile (RISK_BY_BEHAVIOR).
   * The final score is never lower than this baseline, so the profile tier the
   * demo relies on always influences the decision even when granular signals
   * are sparse. Contributes 0 when omitted.
   */
  behaviorBaseline?: number;
}

export interface RiskFactor {
  label: string;
  points: number;
  detail: string;
}

export interface RiskBreakdown {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  factors: RiskFactor[];
  source: "heuristic" | "behavior_fallback";
  computed_at: string;
}

export interface RiskResult {
  score: number;
  breakdown: RiskBreakdown;
}

function riskLevel(score: number): RiskBreakdown["level"] {
  if (score <= 25) return "low";
  if (score <= 55) return "medium";
  if (score < CRITICAL_RISK_THRESHOLD) return "high";
  return "critical";
}

/**
 * Explainable risk score (0–100) per the PRD heuristic:
 *   risk = days_overdue_w + failed_attempts_w + prior_late_w + no_mandate_w
 *          + outstanding_w - prior_successful_w
 * Returns the clamped score plus a human-readable breakdown of every factor
 * (label, points, detail) so the queue / activity log can show the "why".
 */
export function computeRiskScore(signals: RiskSignals): RiskResult {
  const factors: RiskFactor[] = [];

  const daysOverdue = Math.max(0, signals.daysOverdue ?? 0);
  if (daysOverdue > 0) {
    // 2 pts/day overdue, capped at 20.
    const pts = Math.min(20, daysOverdue * 2);
    factors.push({
      label: "Days overdue",
      points: pts,
      detail: `${daysOverdue} day(s) past due`,
    });
  }

  const failedAttempts = Math.max(0, signals.failedAttempts ?? 0);
  if (failedAttempts > 0) {
    // 15 pts per failed charge attempt, capped at 45.
    const pts = Math.min(45, failedAttempts * 15);
    factors.push({
      label: "Failed attempts",
      points: pts,
      detail: `${failedAttempts} failed charge attempt(s)`,
    });
  }

  const priorLate = Math.max(0, signals.priorLate ?? 0);
  if (priorLate > 0) {
    // 8 pts per prior late month, capped at 24.
    const pts = Math.min(24, priorLate * 8);
    factors.push({
      label: "Prior late payments",
      points: pts,
      detail: `${priorLate} previously late month(s)`,
    });
  }

  if (signals.noMandate) {
    factors.push({
      label: "No active mandate",
      points: 20,
      detail: "No active SEPA mandate to auto-collect against",
    });
  }

  const outstanding = Math.max(0, signals.outstandingAmount ?? 0);
  if (outstanding > 0) {
    // Scale outstanding amount toward the €1,500 auto-cap: ~15 pts at the cap.
    const pts = Math.min(15, Math.round((outstanding / 1500) * 15));
    if (pts > 0) {
      factors.push({
        label: "Outstanding amount",
        points: pts,
        detail: `€${outstanding} outstanding (auto-cap €1,500)`,
      });
    }
  }

  const priorSuccessful = Math.max(0, signals.priorSuccessful ?? 0);
  if (priorSuccessful > 0) {
    // Good history lowers risk: -5 pts per prior on-time month, capped at -30.
    const pts = -Math.min(30, priorSuccessful * 5);
    factors.push({
      label: "Prior successful payments",
      points: pts,
      detail: `${priorSuccessful} on-time month(s) on record`,
    });
  }

  const raw = factors.reduce((sum, f) => sum + f.points, 0);
  const heuristicScore = Math.max(0, Math.min(100, raw));

  // Behavior-profile tier acts as a FLOOR on the risk score: the heuristic can
  // push higher (repeated failures, overdue, etc.) but never below the tier the
  // demo relies on. When the baseline is the binding constraint, record an
  // explicit factor so the breakdown still explains the "why".
  const behaviorBaseline = Math.max(0, signals.behaviorBaseline ?? 0);
  const finalScore = Math.max(0, Math.min(100, Math.max(heuristicScore, behaviorBaseline)));
  if (behaviorBaseline > heuristicScore) {
    factors.push({
      label: "Behavior baseline",
      points: behaviorBaseline,
      detail: "profile risk tier floor",
    });
  }

  return {
    score: finalScore,
    breakdown: {
      score: finalScore,
      level: riskLevel(finalScore),
      factors,
      source: "heuristic",
      computed_at: new Date().toISOString(),
    },
  };
}

/**
 * Behavior-profile fallback that still returns a breakdown shape, so the queue
 * always has a "why" even when no granular signals are available.
 */
function behaviorFallbackRisk(behavior: BehaviorProfile | null, failureReason: string): RiskResult {
  const score = behavior ? RISK_BY_BEHAVIOR[behavior] : 50;
  return {
    score,
    breakdown: {
      score,
      level: riskLevel(score),
      factors: [
        {
          label: "Behavior profile",
          points: score,
          detail: behavior
            ? `Profile "${behavior}" baseline; failure: ${failureReason}`
            : `Unknown profile baseline; failure: ${failureReason}`,
        },
      ],
      source: "behavior_fallback",
      computed_at: new Date().toISOString(),
    },
  };
}

const LOVABLE_ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_MODEL = "google/gemini-3-flash-preview";

const SYSTEM_PROMPT = `You are a payment-recovery agent for a property manager.

You receive a single failed rent payment. You must pick exactly ONE recovery action and call the matching tool.

Decision policy (soft guidance — use judgment):
- Risk < 30, transient failure: call retry_payment.
- Risk 30-55: call retry_payment; on first failure prefer retry over reminder.
- Risk 56-80: call offer_payment_plan with a 2-part split (half today, half next Friday).
- Risk > 80, or third+ attempt, or hard decline (closed account / fraud): call escalate_to_human.
- If the tenant just needs a nudge and risk is low, send_reminder is acceptable.

Call exactly one tool. Be decisive. Do not call multiple tools.`;

const TOOLS = [
  {
    type: "function",
    function: {
      name: "retry_payment",
      description:
        "Retry the failed Stripe invoice immediately. Best for transient failures, low-to-medium risk.",
      parameters: {
        type: "object",
        properties: {
          rationale: { type: "string", description: "Why a retry is the right call." },
        },
        required: ["rationale"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_reminder",
      description: "Send the tenant a payment reminder via their preferred channel.",
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string", enum: ["email", "sms", "portal"] },
          message: { type: "string", description: "Short, friendly reminder text." },
        },
        required: ["channel", "message"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "offer_payment_plan",
      description: "Offer the tenant a structured payment plan (typically 2 installments).",
      parameters: {
        type: "object",
        properties: {
          installments: {
            type: "array",
            description: "Plan installments in order.",
            items: {
              type: "object",
              properties: {
                amount: { type: "number", description: "Installment amount in euros." },
                due_label: {
                  type: "string",
                  description: "Human-readable due date label, e.g. 'today' or 'next Friday'.",
                },
                days_from_today: {
                  type: "integer",
                  description: "Days from today this installment is due.",
                  minimum: 0,
                },
              },
              required: ["amount", "due_label", "days_from_today"],
              additionalProperties: false,
            },
          },
        },
        required: ["installments"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description: "Escalate to the property manager. Only when automated recovery is unsafe.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "One-sentence reason." },
        },
        required: ["reason"],
        additionalProperties: false,
      },
    },
  },
] as const;

export interface AgentInput {
  exceptionId: string;
  tenantId: string;
  unitId: string;
  rentObligationId: string;
  invoiceId: string | null;
  invoiceAmount: number;
  failureReason: string;
  attemptCount: number;
}

interface TenantContext {
  name: string;
  behavior_profile: BehaviorProfile | null;
  rent_amount: number;
  risk_score: number | null;
}

export async function runPaymentRecoveryAgent(input: AgentInput): Promise<void> {
  const tenant = await loadTenantContext(input.tenantId);
  if (!tenant) {
    console.error("[recovery-agent] tenant not found", input.tenantId);
    return;
  }

  // Explainable risk first. Gather granular signals from the tenant's history
  // and fold in the behavior-profile tier as a floor (RISK_BY_BEHAVIOR), so the
  // profile the demo relies on always influences the score while the heuristic
  // can still push higher on repeated failures / overdue.
  const signals: RiskSignals = {
    ...(await loadRiskSignals(input)),
    behaviorBaseline: tenant.behavior_profile
      ? RISK_BY_BEHAVIOR[tenant.behavior_profile]
      : undefined,
  };
  const hasSignals =
    (signals.daysOverdue ?? 0) > 0 ||
    (signals.failedAttempts ?? 0) > 0 ||
    (signals.priorLate ?? 0) > 0 ||
    signals.noMandate === true ||
    (signals.outstandingAmount ?? 0) > 0 ||
    (signals.priorSuccessful ?? 0) > 0 ||
    (signals.behaviorBaseline ?? 0) > 0;

  // With a behavior baseline present hasSignals is effectively always true on a
  // real failure; the behaviorFallbackRisk path is kept for the no-profile edge.
  const risk = hasSignals
    ? computeRiskScore(signals)
    : behaviorFallbackRisk(tenant.behavior_profile, input.failureReason);
  const riskScore = risk.score;

  // Persist the breakdown immediately so the queue/log can show the "why" even
  // before the chosen action patches the exception again.
  await supabaseAdmin
    .from("exceptions")
    .update({
      risk_score: riskScore,
      risk_breakdown: risk.breakdown as unknown as Json,
    })
    .eq("id", input.exceptionId);

  await logAction(
    input,
    "charge",
    "pending",
    "Payment failed — agent invoked",
    `Risk ${riskScore} (${risk.breakdown.source}); reason: ${input.failureReason}; attempt ${input.attemptCount}`,
  );

  const decision = await chooseAction({
    tenant,
    input,
    riskScore,
  });

  if (!decision) {
    await executeEscalate(input, riskScore, "Agent could not decide — fallback escalation");
    return;
  }

  switch (decision.name) {
    case "retry_payment":
      await executeRetry(
        input,
        riskScore,
        attributeReason(
          decision,
          typeof decision.args.rationale === "string"
            ? decision.args.rationale
            : "Agent chose retry",
        ),
      );
      break;
    case "send_reminder":
      await executeReminder(
        input,
        riskScore,
        (decision.args.channel as "email" | "sms" | "portal") ?? "portal",
        (decision.args.message as string) ??
          `Hi ${tenant.name}, please review your recent payment.`,
      );
      break;
    case "offer_payment_plan":
      await executeOfferPlan(
        input,
        riskScore,
        tenant.rent_amount,
        (decision.args.installments as PlanInstallmentInput[]) ??
          defaultInstallments(input.invoiceAmount),
        attributeReason(
          decision,
          typeof decision.args.reason === "string" ? decision.args.reason : "structured plan",
        ),
      );
      break;
    case "escalate_to_human":
      await executeEscalate(
        input,
        riskScore,
        attributeReason(decision, (decision.args.reason as string) ?? "Risk too high"),
      );
      break;
    default:
      await executeEscalate(input, riskScore, `Unknown tool: ${decision.name}`);
  }
}

export interface PlanInstallmentInput {
  amount: number;
  due_label?: string;
  days_from_today?: number;
}

export function defaultInstallments(total: number): PlanInstallmentInput[] {
  const half = Math.round((total / 2) * 100) / 100;
  return [
    { amount: half, due_label: "today", days_from_today: 0 },
    { amount: total - half, due_label: "next Friday", days_from_today: 7 },
  ];
}

async function loadTenantContext(tenantId: string): Promise<TenantContext | null> {
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("name, behavior_profile, rent_amount, risk_score")
    .eq("id", tenantId)
    .maybeSingle();
  if (error || !data) return null;
  return data as TenantContext;
}

/**
 * Pulls the granular signals behind the explainable risk score from the
 * tenant's history: days overdue (this obligation), failed attempts (Stripe
 * attempt count + recorded failed events), prior late / prior successful months
 * (other obligations for the tenant), no-mandate flag (SEPA mandate status), and
 * the outstanding amount. Missing pieces simply contribute 0 — the heuristic is
 * tolerant of partial data.
 */
async function loadRiskSignals(input: AgentInput): Promise<RiskSignals> {
  const [{ data: obligation }, { data: mandate }, { data: history }, { count: failedEventCount }] =
    await Promise.all([
      supabaseAdmin
        .from("rent_obligations")
        .select("due_date")
        .eq("id", input.rentObligationId)
        .maybeSingle(),
      supabaseAdmin
        .from("sepa_mandates")
        .select("status")
        .eq("tenant_id", input.tenantId)
        .eq("status", "active")
        .maybeSingle(),
      supabaseAdmin
        .from("rent_obligations")
        .select("status")
        .eq("tenant_id", input.tenantId)
        .neq("id", input.rentObligationId),
      supabaseAdmin
        .from("payment_events")
        .select("id", { count: "exact", head: true })
        .eq("rent_obligation_id", input.rentObligationId)
        .eq("type", "failed"),
    ]);

  let daysOverdue = 0;
  if (obligation?.due_date) {
    const due = new Date(`${obligation.due_date}T00:00:00Z`).getTime();
    const now = Date.now();
    if (now > due) daysOverdue = Math.floor((now - due) / 86_400_000);
  }

  const rows = history ?? [];
  const priorSuccessful = rows.filter((r) =>
    ["paid", "reconciled", "auto_recovered"].includes(r.status),
  ).length;
  const priorLate = rows.filter((r) =>
    ["failed", "human_review", "payment_plan"].includes(r.status),
  ).length;

  // Use the larger of the Stripe attempt count and the count of recorded
  // failed events so the signal survives either source being sparse.
  const failedAttempts = Math.max(input.attemptCount ?? 0, failedEventCount ?? 0);

  return {
    daysOverdue,
    failedAttempts,
    priorLate,
    noMandate: !mandate,
    outstandingAmount: input.invoiceAmount,
    priorSuccessful,
  };
}

interface AgentDecision {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Deterministic policy engine — the "policy agent" brain that runs with ZERO API
 * calls. Implements the PRD policy table + guardrails (max 2 retries, 2-part
 * plan, €1,500 auto-approve cap, critical threshold 80). First match wins; each
 * branch carries a clear deterministic rationale string for the activity log.
 *
 * Returns the same `AgentDecision` shape the LLM path returns, so it can be used
 * interchangeably as the fallback inside `chooseAction`.
 */
export function decidePolicyAction(args: {
  riskScore: number;
  attemptCount: number;
  invoiceAmount: number;
}): AgentDecision {
  const { riskScore, attemptCount, invoiceAmount } = args;

  // Guardrail: amount above the €1,500 auto-approve cap is never auto-recovered.
  if (invoiceAmount > 1500) {
    return {
      name: "escalate_to_human",
      args: { reason: "amount over €1,500 auto-approve cap" },
    };
  }

  // Guardrail: critical risk (>= 80) always goes to a human.
  if (riskScore >= CRITICAL_RISK_THRESHOLD) {
    return {
      name: "escalate_to_human",
      args: { reason: "critical risk ≥ 80" },
    };
  }

  // Guardrail: max 2 retries — on the second (or later) failure, stop retrying
  // and offer a structured plan instead.
  if (attemptCount >= 2) {
    return {
      name: "offer_payment_plan",
      args: {
        installments: defaultInstallments(invoiceAmount),
        reason: "second failure → structured plan",
      },
    };
  }

  // High risk (56–79) on a first failure → proactively offer a 2-part plan.
  if (riskScore >= 56) {
    return {
      name: "offer_payment_plan",
      args: {
        installments: defaultInstallments(invoiceAmount),
        reason: "high risk → offer 2-part plan",
      },
    };
  }

  // Low/medium risk first failure → retry the charge.
  return {
    name: "retry_payment",
    args: { rationale: "low/medium risk first failure → retry" },
  };
}

/**
 * Marker added to a decision's args when it came from the deterministic policy
 * engine (not the LLM). The dispatcher reads this so the activity log is honest
 * about which brain decided.
 */
const POLICY_SOURCE_FLAG = "_deterministic_policy";

/** Tag a deterministic decision so the dispatcher/log can attribute it. */
function asPolicyDecision(decision: AgentDecision): AgentDecision {
  return { name: decision.name, args: { ...decision.args, [POLICY_SOURCE_FLAG]: true } };
}

/** Whether a decision was produced by the deterministic policy engine. */
function isPolicyDecision(decision: AgentDecision): boolean {
  return decision.args[POLICY_SOURCE_FLAG] === true;
}

/**
 * Prefix a reason string so the activity log clearly states the deciding brain.
 * Deterministic decisions read "Deterministic policy: ...", LLM ones are
 * returned unchanged.
 */
function attributeReason(decision: AgentDecision, reason: string): string {
  return isPolicyDecision(decision) ? `Deterministic policy: ${reason}` : reason;
}

async function chooseAction(args: {
  tenant: TenantContext;
  input: AgentInput;
  riskScore: number;
}): Promise<AgentDecision | null> {
  // Deterministic policy decision — computed up front so it is always available
  // as the fallback for every LLM failure path below (missing key, gateway
  // error, no tool call, bad JSON). This is the "policy agent" brain that works
  // with zero API calls.
  const policyDecision = decidePolicyAction({
    riskScore: args.riskScore,
    attemptCount: args.input.attemptCount,
    invoiceAmount: args.input.invoiceAmount,
  });

  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.warn("[recovery-agent] LOVABLE_API_KEY missing; using deterministic policy");
    return asPolicyDecision(policyDecision);
  }

  const userPrompt = `Failed payment event:
- tenant_name: ${args.tenant.name}
- behavior_profile: ${args.tenant.behavior_profile ?? "unknown"}
- rent_amount: €${args.tenant.rent_amount}
- risk_score: ${args.riskScore}
- invoice_amount: €${args.input.invoiceAmount}
- failure_reason: ${args.input.failureReason}
- attempt_count: ${args.input.attemptCount}

Pick exactly one recovery action and call its tool.`;

  let response: Response;
  try {
    response = await fetch(LOVABLE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: LOVABLE_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        tools: TOOLS,
        tool_choice: "required",
        parallel_tool_calls: false,
      }),
    });
  } catch (err) {
    console.error("[recovery-agent] Lovable fetch failed; using deterministic policy:", err);
    return asPolicyDecision(policyDecision);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[recovery-agent] Lovable returned", response.status, body.slice(0, 500));
    return asPolicyDecision(policyDecision);
  }

  const json = (await response.json().catch(() => null)) as {
    choices?: Array<{
      message?: {
        tool_calls?: Array<{
          function?: { name?: string; arguments?: string };
        }>;
      };
    }>;
  } | null;

  const call = json?.choices?.[0]?.message?.tool_calls?.[0]?.function;
  if (!call?.name) {
    console.warn("[recovery-agent] Lovable returned no tool call; using deterministic policy");
    return asPolicyDecision(policyDecision);
  }

  if (call.arguments) {
    try {
      const parsedArgs = JSON.parse(call.arguments) as Record<string, unknown>;
      return { name: call.name, args: parsedArgs };
    } catch {
      // Bad JSON from the model — don't trust the malformed call. Fall back to
      // the deterministic policy so the action still has sane arguments.
      console.warn("[recovery-agent] Lovable returned bad JSON args; using deterministic policy");
      return asPolicyDecision(policyDecision);
    }
  }

  // Tool name but no arguments — accept the LLM's chosen tool with empty args.
  return { name: call.name, args: {} };
}

export async function executeRetry(input: AgentInput, riskScore: number, rationale: string) {
  await updateException(input.exceptionId, {
    recommended_action: "retry",
    risk_score: riskScore,
    severity: riskScore > 55 ? "high" : "medium",
    human_needed: false,
    status: "in_progress",
  });

  let stripeResult: "success" | "failed" | "pending" = "pending";
  let resultDetail = "Retry queued";

  // Look up the tenant's Stripe customer so we can recover the invoice with a
  // working card (swaps the customer to a good card and pays the invoice).
  const { data: tenantRow } = await supabaseAdmin
    .from("tenants")
    .select("stripe_customer_id")
    .eq("id", input.tenantId)
    .maybeSingle();
  const customerId = tenantRow?.stripe_customer_id ?? null;

  if (customerId && input.invoiceId) {
    // recoverInvoiceWithGoodCard swallows errors and returns status:"error", so
    // we trust its return value rather than try/catch.
    const recovery = await recoverInvoiceWithGoodCard(customerId, input.invoiceId);
    if (recovery.paid) {
      stripeResult = "success";
      resultDetail = "Invoice recovered with working card on retry";
      await supabaseAdmin
        .from("rent_obligations")
        .update({ status: "auto_recovered" })
        .eq("id", input.rentObligationId);
      await updateException(input.exceptionId, { status: "resolved" });
    } else {
      stripeResult = recovery.status === "error" ? "failed" : "pending";
      resultDetail = `Retry did not settle (status: ${recovery.status ?? "unknown"})`;
    }
  } else {
    resultDetail = customerId
      ? "No invoice id; retry not attempted"
      : "No Stripe customer id; retry not attempted";
    stripeResult = "failed";
  }

  await logAction(input, "retry", stripeResult, rationale, resultDetail);
}

export async function executeReminder(
  input: AgentInput,
  riskScore: number,
  channel: "email" | "sms" | "portal",
  message: string,
) {
  await updateException(input.exceptionId, {
    recommended_action: "reminder",
    risk_score: riskScore,
    severity: "medium",
    human_needed: false,
    status: "in_progress",
  });

  await supabaseAdmin.from("communications").insert({
    tenant_id: input.tenantId,
    exception_id: input.exceptionId,
    channel,
    message_type: "reminder",
    body: message,
  });

  await logAction(input, "reminder", "success", `Reminder via ${channel}`, message.slice(0, 200));
}

export async function executeOfferPlan(
  input: AgentInput,
  riskScore: number,
  rentAmount: number,
  installments: PlanInstallmentInput[],
  reason = "Structured payment plan offered",
) {
  await updateException(input.exceptionId, {
    recommended_action: "payment_plan",
    risk_score: riskScore,
    severity: "medium",
    human_needed: false,
    status: "in_progress",
  });

  const total = installments.reduce((sum, p) => sum + (p.amount ?? 0), 0) || rentAmount;

  const { data: plan, error: planErr } = await supabaseAdmin
    .from("payment_plans")
    .insert({
      tenant_id: input.tenantId,
      rent_obligation_id: input.rentObligationId,
      total_amount: total,
      installment_count: installments.length,
      status: "offered",
    })
    .select("id")
    .single();
  if (planErr || !plan) {
    await logAction(
      input,
      "offer_payment_plan",
      "failed",
      "Could not create payment_plan row",
      planErr?.message ?? "unknown",
    );
    return;
  }

  const today = new Date();
  const rows = installments.map((p, idx) => {
    const days = p.days_from_today ?? idx * 7;
    const due = new Date(today.getTime() + days * 86_400_000);
    return {
      payment_plan_id: plan.id,
      sequence: idx + 1,
      amount: p.amount,
      due_date: due.toISOString().slice(0, 10),
      status: "upcoming" as const,
    };
  });
  await supabaseAdmin.from("payment_plan_installments").insert(rows);

  await supabaseAdmin
    .from("rent_obligations")
    .update({ status: "payment_plan" })
    .eq("id", input.rentObligationId);

  await supabaseAdmin.from("communications").insert({
    tenant_id: input.tenantId,
    exception_id: input.exceptionId,
    channel: "portal",
    message_type: "payment_plan_offer",
    body: `Payment plan offered: ${installments
      .map((p) => `€${p.amount} ${p.due_label ?? ""}`)
      .join(", ")}`,
  });

  await logAction(
    input,
    "offer_payment_plan",
    "success",
    `${reason} — offered ${installments.length}-part plan totaling €${total}`,
    rows.map((r) => `€${r.amount} on ${r.due_date}`).join("; "),
  );
}

export async function executeEscalate(input: AgentInput, riskScore: number, reason: string) {
  await updateException(input.exceptionId, {
    recommended_action: "escalate",
    risk_score: riskScore,
    severity: "high",
    human_needed: true,
    status: "escalated",
  });

  await supabaseAdmin
    .from("rent_obligations")
    .update({ status: "human_review" })
    .eq("id", input.rentObligationId);

  await supabaseAdmin.from("communications").insert({
    tenant_id: input.tenantId,
    exception_id: input.exceptionId,
    channel: "portal",
    message_type: "escalation_notice",
    body: `Case escalated to property manager: ${reason}`,
  });

  await logAction(input, "escalate", "success", reason, "Marked exception human_needed=true");
}

/**
 * Reconcile a recovered/settled obligation: move rent_obligations to
 * `reconciled`, resolve the exception (no human needed), and log a `reconcile`
 * agent_action. Used when a retry/plan settles the case or a manager closes it.
 */
export async function executeReconcile(
  input: AgentInput,
  riskScore: number,
  reason: string,
  policyBasis = "Obligation settled — reconciled by agent",
) {
  await updateException(input.exceptionId, {
    risk_score: riskScore,
    human_needed: false,
    status: "resolved",
  });

  await supabaseAdmin
    .from("rent_obligations")
    .update({ status: "reconciled" })
    .eq("id", input.rentObligationId);

  await logAction(input, "reconcile", "success", reason, policyBasis);
}

export async function updateException(
  exceptionId: string,
  patch: Partial<{
    recommended_action: "retry" | "reminder" | "payment_plan" | "escalate";
    risk_score: number;
    severity: "low" | "medium" | "high" | "critical";
    human_needed: boolean;
    status: "open" | "in_progress" | "resolved" | "escalated";
  }>,
) {
  await supabaseAdmin.from("exceptions").update(patch).eq("id", exceptionId);
}

export async function logAction(
  input: AgentInput,
  actionType: "charge" | "retry" | "reminder" | "offer_payment_plan" | "escalate" | "reconcile",
  result: "success" | "failed" | "pending",
  reason: string,
  policyBasis: string,
) {
  await supabaseAdmin.from("agent_actions").insert({
    exception_id: input.exceptionId,
    tenant_id: input.tenantId,
    unit_id: input.unitId,
    action_type: actionType,
    result,
    reason,
    policy_basis: policyBasis,
  });
}
