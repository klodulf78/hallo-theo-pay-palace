import type {
  AgentAction,
  Exception,
  PaymentEvent,
  PaymentPlan,
  PaymentPlanPart,
  Tenant,
  TenantArchetype,
  TenantStatus,
} from "@/types";
import { createPaymentPlan, reconcilePayment } from "./stripeMock";

export const RISK_SCORES: Record<TenantArchetype, number> = {
  reliable: 10,
  soft_fail: 45,
  payment_plan: 72,
  critical: 91,
};

export type AgentDecision = "none" | "retry" | "payment_plan" | "escalate";

export function decideAction(riskScore: number): AgentDecision {
  if (riskScore < 30) return "none";
  if (riskScore <= 55) return "retry";
  if (riskScore <= 80) return "payment_plan";
  return "escalate";
}

let actionCounter = 0;
const nextActionId = () => `act_${++actionCounter}_${Date.now().toString(36)}`;

function makeAction(
  timestamp: string,
  action: string,
  reason: string,
  result: string,
  tenantId?: string,
): AgentAction {
  return { id: nextActionId(), timestamp, action, reason, result, tenantId };
}

const PLAN_PARTS = (tenant: Tenant): PaymentPlanPart[] => {
  const half = Math.round(tenant.rent / 2);
  return [
    { amount: half, dueDate: "today", label: "€" + half + " today", status: "scheduled" },
    {
      amount: tenant.rent - half,
      dueDate: "next Friday",
      label: "€" + (tenant.rent - half) + " next Friday",
      status: "scheduled",
    },
  ];
};

export interface AgentRunResult {
  event: PaymentEvent;
  tenantStatus: TenantStatus;
  actions: AgentAction[];
  exception?: Exception;
  plan?: PaymentPlan;
}

interface RunInput {
  tenant: Tenant;
  event: PaymentEvent;
  monthLabel: string;
  at: string;
}

export function runAgentForPaymentEvent({
  tenant,
  event,
  monthLabel,
  at,
}: RunInput): AgentRunResult {
  if (event.status === "succeeded") {
    return {
      event,
      tenantStatus: "paid",
      actions: [
        makeAction(
          at,
          `${tenant.name} paid successfully`,
          `${monthLabel} rent of €${event.amount} cleared on first attempt`,
          "Charge succeeded",
          tenant.id,
        ),
      ],
    };
  }

  const riskScore = RISK_SCORES[tenant.archetype];
  const decision = decideAction(riskScore);
  const actions: AgentAction[] = [];

  actions.push(
    makeAction(
      at,
      `${tenant.name} payment failed: ${event.failureReason ?? "unknown"}`,
      `Stripe returned failure on ${monthLabel} charge of €${event.amount}`,
      "Charge failed",
      tenant.id,
    ),
  );
  actions.push(
    makeAction(
      at,
      "Risk score updated",
      `Tenant archetype "${tenant.archetype}" → score ${riskScore}`,
      `Risk score = ${riskScore}`,
      tenant.id,
    ),
  );

  if (decision === "retry") {
    actions.push(
      makeAction(
        at,
        "Agent selected retry flow",
        `Risk ${riskScore} is in the 30–55 band — automatic retry with reminder`,
        "Flow: retry",
        tenant.id,
      ),
    );
    const retried = reconcilePayment(event, at);
    actions.push(
      makeAction(
        at,
        `${tenant.name} retry succeeded`,
        `Second charge attempt cleared`,
        "Recovered",
        tenant.id,
      ),
    );
    return {
      event: retried,
      tenantStatus: "retry_succeeded",
      actions,
    };
  }

  if (decision === "payment_plan") {
    actions.push(
      makeAction(
        at,
        "Agent selected payment-plan flow",
        `Risk ${riskScore} is in the 56–80 band — offer a payment plan`,
        "Flow: payment plan",
        tenant.id,
      ),
    );
    actions.push(
      makeAction(
        at,
        "Tenant reminder prepared",
        `Reminder queued for ${tenant.name} via tenant portal`,
        "Reminder ready",
        tenant.id,
      ),
    );
    const plan = createPaymentPlan(tenant, PLAN_PARTS(tenant));
    actions.push(
      makeAction(
        at,
        "Payment plan offered: €600 now, €600 next Friday",
        `2-part plan generated for ${tenant.name}`,
        "Plan offered",
        tenant.id,
      ),
    );
    const exception: Exception = {
      id: `exc_${tenant.id}`,
      tenantId: tenant.id,
      riskScore,
      status: "Payment plan offered",
      recommendedAction: "Offer 2-part plan",
      humanNeeded: false,
      createdAt: at,
    };
    return {
      event,
      tenantStatus: "payment_plan_offered",
      actions,
      exception,
      plan,
    };
  }

  // escalate
  actions.push(
    makeAction(
      at,
      `${tenant.name} escalated to human review`,
      `Risk ${riskScore} exceeded threshold (>80) — automated recovery not safe`,
      "Escalated",
      tenant.id,
    ),
  );
  const exception: Exception = {
    id: `exc_${tenant.id}`,
    tenantId: tenant.id,
    riskScore,
    status: "Escalated",
    recommendedAction: "Human review",
    humanNeeded: true,
    createdAt: at,
  };
  return {
    event,
    tenantStatus: "escalated",
    actions,
    exception,
  };
}
