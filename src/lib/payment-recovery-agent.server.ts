/**
 * Payment-recovery agent. Invoked from the Stripe webhook on
 * invoice.payment_failed. Picks one of four recovery actions via tool use over
 * the Lovable AI gateway and dispatches DB writes + Stripe calls to match.
 *
 * Server-only (filename suffix). Writes to existing tables created in the
 * schema migrations under supabase/migrations/. No new schema needed.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStripe } from "@/lib/stripe.server";

type BehaviorProfile = "reliable" | "soft_fail" | "payment_plan" | "critical";

const RISK_BY_BEHAVIOR: Record<BehaviorProfile, number> = {
  reliable: 10,
  soft_fail: 45,
  payment_plan: 72,
  critical: 91,
};

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
      description:
        "Send the tenant a payment reminder via their preferred channel.",
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
      description:
        "Offer the tenant a structured payment plan (typically 2 installments).",
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
                  description:
                    "Human-readable due date label, e.g. 'today' or 'next Friday'.",
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
      description:
        "Escalate to the property manager. Only when automated recovery is unsafe.",
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

interface AgentInput {
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

  const riskScore =
    tenant.risk_score ??
    (tenant.behavior_profile ? RISK_BY_BEHAVIOR[tenant.behavior_profile] : 50);

  await logAction(input, "charge", "pending", "Payment failed — agent invoked", `Risk ${riskScore}; reason: ${input.failureReason}; attempt ${input.attemptCount}`);

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
        typeof decision.args.rationale === "string" ? decision.args.rationale : "Agent chose retry",
      );
      break;
    case "send_reminder":
      await executeReminder(
        input,
        riskScore,
        (decision.args.channel as "email" | "sms" | "portal") ?? "portal",
        (decision.args.message as string) ?? `Hi ${tenant.name}, please review your recent payment.`,
      );
      break;
    case "offer_payment_plan":
      await executeOfferPlan(
        input,
        riskScore,
        tenant.rent_amount,
        (decision.args.installments as PlanInstallmentInput[]) ?? defaultInstallments(input.invoiceAmount),
      );
      break;
    case "escalate_to_human":
      await executeEscalate(input, riskScore, (decision.args.reason as string) ?? "Risk too high");
      break;
    default:
      await executeEscalate(input, riskScore, `Unknown tool: ${decision.name}`);
  }
}

interface PlanInstallmentInput {
  amount: number;
  due_label?: string;
  days_from_today?: number;
}

function defaultInstallments(total: number): PlanInstallmentInput[] {
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

interface AgentDecision {
  name: string;
  args: Record<string, unknown>;
}

async function chooseAction(args: {
  tenant: TenantContext;
  input: AgentInput;
  riskScore: number;
}): Promise<AgentDecision | null> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    console.warn("[recovery-agent] LOVABLE_API_KEY missing; falling back to escalation");
    return null;
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
    console.error("[recovery-agent] Lovable fetch failed:", err);
    return null;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[recovery-agent] Lovable returned", response.status, body.slice(0, 500));
    return null;
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
    console.warn("[recovery-agent] Lovable returned no tool call");
    return null;
  }

  let parsedArgs: Record<string, unknown> = {};
  if (call.arguments) {
    try {
      parsedArgs = JSON.parse(call.arguments) as Record<string, unknown>;
    } catch {
      // bad JSON from model; fall through with empty args
    }
  }
  return { name: call.name, args: parsedArgs };
}

async function executeRetry(input: AgentInput, riskScore: number, rationale: string) {
  await updateException(input.exceptionId, {
    recommended_action: "retry",
    risk_score: riskScore,
    severity: riskScore > 55 ? "high" : "medium",
    human_needed: false,
    status: "in_progress",
  });

  let stripeResult: "success" | "failed" | "pending" = "pending";
  let resultDetail = "Retry queued";
  if (input.invoiceId) {
    try {
      const invoice = await getStripe().invoices.pay(input.invoiceId);
      stripeResult = invoice.status === "paid" ? "success" : "pending";
      resultDetail =
        stripeResult === "success" ? "Invoice paid on retry" : `Invoice status: ${invoice.status}`;
      if (stripeResult === "success") {
        await supabaseAdmin
          .from("rent_obligations")
          .update({ status: "auto_recovered" })
          .eq("id", input.rentObligationId);
        await updateException(input.exceptionId, { status: "resolved" });
      }
    } catch (err) {
      stripeResult = "failed";
      resultDetail = `Stripe retry failed: ${(err as Error).message}`;
    }
  } else {
    resultDetail = "No invoice id; retry not attempted";
    stripeResult = "failed";
  }

  await logAction(input, "retry", stripeResult, rationale, resultDetail);
}

async function executeReminder(
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

  await logAction(
    input,
    "reminder",
    "success",
    `Reminder via ${channel}`,
    message.slice(0, 200),
  );
}

async function executeOfferPlan(
  input: AgentInput,
  riskScore: number,
  rentAmount: number,
  installments: PlanInstallmentInput[],
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
    `Offered ${installments.length}-part plan totaling €${total}`,
    rows.map((r) => `€${r.amount} on ${r.due_date}`).join("; "),
  );
}

async function executeEscalate(input: AgentInput, riskScore: number, reason: string) {
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

async function updateException(
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

async function logAction(
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
