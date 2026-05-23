import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";
import type {
  AgentAction,
  DashboardMetrics,
  Exception,
  PaymentEvent,
  PaymentPlan,
  Property,
  Tenant,
} from "@/types";
import { INITIAL_DATE, INITIAL_PROPERTY, INITIAL_TENANTS } from "./seed";
import { createRentCharge, simulatePaymentResult } from "./stripeMock";
import { runAgentForPaymentEvent } from "./agentEngine";

interface HalloFlowState {
  property: Property;
  tenants: Tenant[];
  currentDate: string;
  monthsAdvanced: number;
  events: PaymentEvent[];
  log: AgentAction[];
  exceptions: Exception[];
  plans: PaymentPlan[];
}

const initialState: HalloFlowState = {
  property: INITIAL_PROPERTY,
  tenants: INITIAL_TENANTS,
  currentDate: INITIAL_DATE,
  monthsAdvanced: 0,
  events: [],
  log: [],
  exceptions: [],
  plans: [],
};

type Action =
  | { type: "ADVANCE_MONTH" }
  | { type: "TENANT_ACCEPT_PLAN"; tenantId: string }
  | { type: "RESET" };

const MONTH_LABELS = ["May", "June", "July", "August", "September", "October"];

function reducer(state: HalloFlowState, action: Action): HalloFlowState {
  switch (action.type) {
    case "RESET":
      return initialState;

    case "ADVANCE_MONTH": {
      const monthLabel = MONTH_LABELS[state.monthsAdvanced] ?? `Month ${state.monthsAdvanced + 1}`;
      const baseAt = new Date(state.currentDate);
      const at = baseAt.toISOString();

      const newEvents: PaymentEvent[] = [];
      const newActions: AgentAction[] = [
        {
          id: `act_charge_${state.monthsAdvanced}`,
          timestamp: at,
          action: `Charged ${monthLabel} rent for all active tenants`,
          reason: `Monthly cycle started for ${state.property.name}`,
          result: `${state.tenants.length} charges created`,
        },
      ];
      const newExceptions: Exception[] = [];
      const newPlans: PaymentPlan[] = [];
      const tenantStatusUpdates = new Map<string, Tenant["status"]>();

      for (const tenant of state.tenants) {
        const pending = createRentCharge(tenant, at);
        const settled = simulatePaymentResult(tenant, pending, at);
        const result = runAgentForPaymentEvent({ tenant, event: settled, monthLabel, at });
        newEvents.push(result.event);
        newActions.push(...result.actions);
        if (result.exception) newExceptions.push(result.exception);
        if (result.plan) newPlans.push(result.plan);
        tenantStatusUpdates.set(tenant.id, result.tenantStatus);
      }

      return {
        ...state,
        monthsAdvanced: state.monthsAdvanced + 1,
        events: [...state.events, ...newEvents],
        log: [...state.log, ...newActions],
        exceptions: [
          ...state.exceptions.filter((e) => !newExceptions.some((n) => n.tenantId === e.tenantId)),
          ...newExceptions,
        ],
        plans: [
          ...state.plans.filter((p) => !newPlans.some((n) => n.tenantId === p.tenantId)),
          ...newPlans,
        ],
        tenants: state.tenants.map((t) =>
          tenantStatusUpdates.has(t.id) ? { ...t, status: tenantStatusUpdates.get(t.id)! } : t,
        ),
      };
    }

    case "TENANT_ACCEPT_PLAN": {
      const at = new Date().toISOString();
      const tenant = state.tenants.find((t) => t.id === action.tenantId);
      if (!tenant) return state;

      const plans = state.plans.map((p) =>
        p.tenantId === action.tenantId
          ? {
              ...p,
              acceptedAt: at,
              parts: p.parts.map((part, idx) => ({
                ...part,
                status: idx === 0 ? ("paid" as const) : ("accepted" as const),
              })),
            }
          : p,
      );

      const exceptions = state.exceptions.map((e) =>
        e.tenantId === action.tenantId ? { ...e, status: "Payment plan accepted" } : e,
      );

      const tenants = state.tenants.map((t) =>
        t.id === action.tenantId ? { ...t, status: "payment_plan_accepted" as const } : t,
      );

      const log: AgentAction[] = [
        ...state.log,
        {
          id: `act_accept_${action.tenantId}_${Date.now()}`,
          timestamp: at,
          tenantId: action.tenantId,
          action: `${tenant.name} accepted 2-part payment plan`,
          reason: "Tenant clicked Accept Payment Plan in the tenant portal",
          result: "First installment marked paid, second scheduled",
        },
      ];

      return { ...state, plans, exceptions, tenants, log };
    }
  }
}

export function computeMetrics(state: HalloFlowState): DashboardMetrics {
  const expectedRent = state.tenants.reduce((sum, t) => sum + t.rent, 0);
  let collectedRent = 0;
  let autoRecoveredAmount = 0;
  let paymentPlanAmount = 0;
  let humanReviewAmount = 0;

  for (const tenant of state.tenants) {
    switch (tenant.status) {
      case "paid":
        collectedRent += tenant.rent;
        break;
      case "retry_succeeded":
        collectedRent += tenant.rent;
        autoRecoveredAmount += tenant.rent;
        break;
      case "payment_plan_offered":
      case "payment_plan_accepted":
        paymentPlanAmount += tenant.rent;
        if (tenant.status === "payment_plan_accepted") {
          // Half collected immediately on accept.
          collectedRent += Math.round(tenant.rent / 2);
        }
        break;
      case "escalated":
        humanReviewAmount += tenant.rent;
        break;
    }
  }

  const pct = (n: number) => (expectedRent > 0 ? Math.round((n / expectedRent) * 1000) / 10 : 0);

  return {
    expectedRent,
    collectedRent,
    autoRecoveredAmount,
    paymentPlanAmount,
    humanReviewAmount,
    autoClearedPct: pct(collectedRent - autoRecoveredAmount),
    autoRecoveredPct: pct(autoRecoveredAmount),
    humanReviewPct: pct(humanReviewAmount),
    supportTickets: 0,
  };
}

interface HalloFlowContextValue {
  state: HalloFlowState;
  metrics: DashboardMetrics;
  advanceMonth: () => void;
  acceptPlan: (tenantId: string) => void;
  reset: () => void;
}

const HalloFlowContext = createContext<HalloFlowContextValue | undefined>(undefined);

export function HalloFlowProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const value = useMemo<HalloFlowContextValue>(
    () => ({
      state,
      metrics: computeMetrics(state),
      advanceMonth: () => dispatch({ type: "ADVANCE_MONTH" }),
      acceptPlan: (tenantId: string) => dispatch({ type: "TENANT_ACCEPT_PLAN", tenantId }),
      reset: () => dispatch({ type: "RESET" }),
    }),
    [state],
  );

  return <HalloFlowContext.Provider value={value}>{children}</HalloFlowContext.Provider>;
}

export function useHalloFlow(): HalloFlowContextValue {
  const ctx = useContext(HalloFlowContext);
  if (!ctx) throw new Error("useHalloFlow must be used inside <HalloFlowProvider>");
  return ctx;
}
