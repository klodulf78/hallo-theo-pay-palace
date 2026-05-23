import type { PaymentEvent, PaymentPlan, PaymentPlanPart, Tenant } from "@/types";

let counter = 0;
const nextId = (prefix: string) => `${prefix}_${++counter}_${Date.now().toString(36)}`;

export function createRentCharge(tenant: Tenant, at: string): PaymentEvent {
  return {
    id: nextId("evt"),
    tenantId: tenant.id,
    amount: tenant.rent,
    status: "pending",
    createdAt: at,
  };
}

// Deterministic by archetype — keeps the demo narrative repeatable.
export function simulatePaymentResult(
  tenant: Tenant,
  event: PaymentEvent,
  at: string,
): PaymentEvent {
  if (tenant.archetype === "reliable") {
    return { ...event, status: "succeeded", settledAt: at };
  }
  const reason =
    tenant.archetype === "payment_plan"
      ? "insufficient funds"
      : tenant.archetype === "critical"
        ? "card declined (do_not_honor)"
        : "temporary network error";
  return { ...event, status: "failed", failureReason: reason };
}

export function reconcilePayment(event: PaymentEvent, at: string): PaymentEvent {
  return { ...event, status: "retried_succeeded", settledAt: at, failureReason: undefined };
}

export function createPaymentPlan(tenant: Tenant, parts: PaymentPlanPart[]): PaymentPlan {
  return {
    id: nextId("plan"),
    tenantId: tenant.id,
    parts,
  };
}
