import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type {
  AgentAction,
  DashboardMetrics,
  Exception,
  ExceptionRecommendedAction,
  PaymentEvent,
  PaymentPlan,
  PaymentPlanPart,
  Property,
  Tenant,
  TenantArchetype,
  TenantStatus,
} from "@/types";
import { INITIAL_DATE, INITIAL_PROPERTY, INITIAL_TENANTS } from "./seed";
import { createRentCharge, simulatePaymentResult } from "./stripeMock";
import { runAgentForPaymentEvent } from "./agentEngine";
import { getBrowserSupabase, isLiveMode } from "./client/supabase";

interface HalloFlowState {
  property: Property;
  tenants: Tenant[];
  currentDate: string;
  monthsAdvanced: number;
  events: PaymentEvent[];
  log: AgentAction[];
  exceptions: Exception[];
  plans: PaymentPlan[];
  mode: "offline" | "live";
  liveLoaded: boolean;
}

const offlineInitial: HalloFlowState = {
  property: INITIAL_PROPERTY,
  tenants: INITIAL_TENANTS,
  currentDate: INITIAL_DATE,
  monthsAdvanced: 0,
  events: [],
  log: [],
  exceptions: [],
  plans: [],
  mode: "offline",
  liveLoaded: false,
};

type Action =
  | { type: "ADVANCE_MONTH" }
  | { type: "TENANT_ACCEPT_PLAN"; tenantId: string }
  | { type: "RESET" }
  | { type: "SET_MODE"; mode: "offline" | "live" }
  | {
      type: "LIVE_HYDRATE";
      tenants: Tenant[];
      log: AgentAction[];
      exceptions: Exception[];
      plans: PaymentPlan[];
    }
  | { type: "LIVE_UPSERT_TENANT"; tenant: Tenant }
  | { type: "LIVE_APPEND_ACTION"; action: AgentAction }
  | { type: "LIVE_UPSERT_EXCEPTION"; exception: Exception }
  | { type: "LIVE_UPSERT_PLAN"; plan: PaymentPlan };

const MONTH_LABELS = ["May", "June", "July", "August", "September", "October"];

function reducer(state: HalloFlowState, action: Action): HalloFlowState {
  switch (action.type) {
    case "RESET":
      return { ...offlineInitial, mode: state.mode };

    case "SET_MODE":
      return { ...state, mode: action.mode };

    case "LIVE_HYDRATE":
      return {
        ...state,
        tenants: action.tenants,
        log: action.log,
        exceptions: action.exceptions,
        plans: action.plans,
        liveLoaded: true,
      };

    case "LIVE_UPSERT_TENANT":
      return {
        ...state,
        tenants: state.tenants.map((t) => (t.id === action.tenant.id ? action.tenant : t)),
      };

    case "LIVE_APPEND_ACTION":
      if (state.log.some((a) => a.id === action.action.id)) return state;
      return { ...state, log: [...state.log, action.action] };

    case "LIVE_UPSERT_EXCEPTION":
      return {
        ...state,
        exceptions: [
          ...state.exceptions.filter((e) => e.tenantId !== action.exception.tenantId),
          action.exception,
        ],
      };

    case "LIVE_UPSERT_PLAN":
      return {
        ...state,
        plans: [
          ...state.plans.filter((p) => p.tenantId !== action.plan.tenantId),
          action.plan,
        ],
      };

    case "ADVANCE_MONTH": {
      if (state.mode === "live") return state;
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
      if (state.mode === "live") return state;
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
  mode: "offline" | "live";
  advanceMonth: () => Promise<void> | void;
  acceptPlan: (tenantId: string) => Promise<void> | void;
  reset: () => void;
}

const HalloFlowContext = createContext<HalloFlowContextValue | undefined>(undefined);

interface DbTenantRow {
  id: string;
  name: string;
  unit: string;
  rent_cents: number;
  archetype: TenantArchetype;
  status: TenantStatus;
}

interface DbAgentActionRow {
  id: string;
  timestamp: string;
  tenant_id: string | null;
  action: string;
  reason: string;
  result: string;
}

interface DbExceptionRow {
  id: string;
  tenant_id: string;
  risk_score: number;
  status: string;
  recommended_action: string;
  human_needed: boolean;
  created_at: string;
}

interface DbPlanRow {
  id: string;
  tenant_id: string;
  accepted_at: string | null;
  parts?: DbPlanPartRow[];
}

interface DbPlanPartRow {
  id: string;
  amount_cents: number;
  due_date: string;
  label: string;
  status: PaymentPlanPart["status"];
  position: number;
}

function rowToTenant(r: DbTenantRow): Tenant {
  return {
    id: r.id,
    name: r.name,
    unit: r.unit,
    rent: r.rent_cents / 100,
    archetype: r.archetype,
    status: r.status,
  };
}

function rowToAction(r: DbAgentActionRow): AgentAction {
  return {
    id: r.id,
    timestamp: r.timestamp,
    tenantId: r.tenant_id ?? undefined,
    action: r.action,
    reason: r.reason,
    result: r.result,
  };
}

function rowToException(r: DbExceptionRow): Exception {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    riskScore: r.risk_score,
    status: r.status,
    recommendedAction: r.recommended_action as ExceptionRecommendedAction,
    humanNeeded: r.human_needed,
    createdAt: r.created_at,
  };
}

function rowToPlan(r: DbPlanRow, parts: DbPlanPartRow[]): PaymentPlan {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    acceptedAt: r.accepted_at ?? undefined,
    parts: parts
      .sort((a, b) => a.position - b.position)
      .map((p) => ({
        amount: p.amount_cents / 100,
        dueDate: p.due_date,
        label: p.label,
        status: p.status,
      })),
  };
}

export function HalloFlowProvider({ children }: { children: ReactNode }) {
  const live = typeof window !== "undefined" && isLiveMode();
  const [state, dispatch] = useReducer(reducer, {
    ...offlineInitial,
    mode: live ? "live" : "offline",
  });

  useEffect(() => {
    if (!live) return;
    const sb = getBrowserSupabase();
    if (!sb) return;

    let cancelled = false;

    async function hydrate() {
      const [tenantsRes, logRes, exceptionsRes, plansRes, partsRes] = await Promise.all([
        sb!.from("tenants").select("*").order("unit"),
        sb!.from("agent_actions").select("*").order("timestamp", { ascending: true }).limit(500),
        sb!.from("exceptions").select("*"),
        sb!.from("payment_plans").select("*"),
        sb!.from("payment_plan_parts").select("*"),
      ]);
      if (cancelled) return;

      const tenants = (tenantsRes.data ?? []).map(rowToTenant);
      const log = (logRes.data ?? []).map(rowToAction);
      const exceptions = (exceptionsRes.data ?? []).map(rowToException);
      const partsByPlan = new Map<string, DbPlanPartRow[]>();
      for (const part of partsRes.data ?? []) {
        const arr = partsByPlan.get(part.plan_id) ?? [];
        arr.push(part);
        partsByPlan.set(part.plan_id, arr);
      }
      const plans = (plansRes.data ?? []).map((p: DbPlanRow) =>
        rowToPlan(p, partsByPlan.get(p.id) ?? []),
      );

      dispatch({ type: "LIVE_HYDRATE", tenants, log, exceptions, plans });
    }
    hydrate().catch((err) => console.error("Live hydrate failed:", err));

    const channel = sb
      .channel("hallo-flow")
      .on("postgres_changes", { event: "*", schema: "public", table: "tenants" }, (payload) => {
        const row = payload.new as DbTenantRow | null;
        if (row) dispatch({ type: "LIVE_UPSERT_TENANT", tenant: rowToTenant(row) });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "agent_actions" }, (payload) => {
        const row = payload.new as DbAgentActionRow;
        dispatch({ type: "LIVE_APPEND_ACTION", action: rowToAction(row) });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "exceptions" }, (payload) => {
        const row = payload.new as DbExceptionRow | null;
        if (row) dispatch({ type: "LIVE_UPSERT_EXCEPTION", exception: rowToException(row) });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "payment_plans" }, () => {
        hydrate().catch(() => {});
      })
      .subscribe();

    return () => {
      cancelled = true;
      sb.removeChannel(channel);
    };
  }, [live]);

  const advanceMonth = useCallback(async () => {
    if (live) {
      const cycleMonth = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}`;
      await fetch("/api/cycle/advance", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cycle_month: cycleMonth }),
      });
    } else {
      dispatch({ type: "ADVANCE_MONTH" });
    }
  }, [live]);

  const acceptPlan = useCallback(
    async (tenantId: string) => {
      if (live) {
        await fetch("/api/tenant/accept-plan", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tenant_id: tenantId }),
        });
      } else {
        dispatch({ type: "TENANT_ACCEPT_PLAN", tenantId });
      }
    },
    [live],
  );

  const value = useMemo<HalloFlowContextValue>(
    () => ({
      state,
      metrics: computeMetrics(state),
      mode: state.mode,
      advanceMonth,
      acceptPlan,
      reset: () => dispatch({ type: "RESET" }),
    }),
    [state, advanceMonth, acceptPlan],
  );

  return <HalloFlowContext.Provider value={value}>{children}</HalloFlowContext.Provider>;
}

export function useHalloFlow(): HalloFlowContextValue {
  const ctx = useContext(HalloFlowContext);
  if (!ctx) throw new Error("useHalloFlow must be used inside <HalloFlowProvider>");
  return ctx;
}
