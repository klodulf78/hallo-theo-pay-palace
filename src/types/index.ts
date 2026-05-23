export type TenantArchetype = "reliable" | "soft_fail" | "payment_plan" | "critical";

export type TenantStatus =
  | "current"
  | "paid"
  | "retry_succeeded"
  | "payment_plan_offered"
  | "payment_plan_accepted"
  | "escalated";

export interface Tenant {
  id: string;
  name: string;
  unit: string;
  rent: number;
  archetype: TenantArchetype;
  status: TenantStatus;
}

export interface Property {
  id: string;
  name: string;
  units: number;
  expectedMonthlyRent: number;
}

export interface RentObligation {
  tenantId: string;
  amount: number;
  dueDate: string;
}

export type PaymentEventStatus = "pending" | "succeeded" | "failed" | "retried_succeeded";

export interface PaymentEvent {
  id: string;
  tenantId: string;
  amount: number;
  status: PaymentEventStatus;
  failureReason?: string;
  createdAt: string;
  settledAt?: string;
}

export type PaymentPlanPartStatus = "scheduled" | "accepted" | "paid";

export interface PaymentPlanPart {
  amount: number;
  dueDate: string;
  label: string;
  status: PaymentPlanPartStatus;
}

export interface PaymentPlan {
  id: string;
  tenantId: string;
  parts: PaymentPlanPart[];
  acceptedAt?: string;
}

export type ExceptionRecommendedAction = "Retry payment" | "Offer 2-part plan" | "Human review";

export interface Exception {
  id: string;
  tenantId: string;
  riskScore: number;
  status: string;
  recommendedAction: ExceptionRecommendedAction;
  humanNeeded: boolean;
  createdAt: string;
}

export interface AgentAction {
  id: string;
  timestamp: string;
  tenantId?: string;
  action: string;
  reason: string;
  result: string;
}

export interface DashboardMetrics {
  expectedRent: number;
  collectedRent: number;
  autoRecoveredAmount: number;
  paymentPlanAmount: number;
  humanReviewAmount: number;
  autoClearedPct: number;
  autoRecoveredPct: number;
  humanReviewPct: number;
  supportTickets: number;
}
