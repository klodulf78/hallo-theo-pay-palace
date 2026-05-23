import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getActiveMonth } from "@/lib/dashboard.functions";

/** One agent action in an exception's history (oldest → newest). */
export type AgentActionEntry = {
  id: string;
  actionType: string | null;
  result: string | null;
  reason: string | null;
  policyBasis: string | null;
  createdAt: string;
};

/** Explainable risk factors persisted by the recovery agent (jsonb). */
export type RiskBreakdown = {
  score: number;
  level: "low" | "medium" | "high" | "critical";
  factors: { label: string; points: number; detail?: string }[];
  source: "heuristic" | "behavior_fallback";
  computed_at: string;
};

/** A single row for the Exception Queue, fully denormalized for the UI. */
export type ExceptionWithContext = {
  id: string;
  tenantId: string;
  tenantName: string;
  unitId: string;
  unitLabel: string | null;
  propertyName: string | null;
  rentObligationId: string;
  month: string;
  amount: number;
  obligationStatus: string;
  status: string | null;
  severity: string | null;
  riskScore: number | null;
  recommendedAction: string | null;
  humanNeeded: boolean | null;
  type: string | null;
  riskBreakdown: RiskBreakdown | null;
  createdAt: string;
  actions: AgentActionEntry[];
};

/**
 * Exceptions for the active month, each joined with tenant name, unit label,
 * property name, rent month/amount, plus its ordered agent_actions history.
 * Returned newest-exception-first; each `actions` array is oldest → newest.
 */
export const getExceptions = createServerFn({ method: "GET" }).handler(
  async (): Promise<ExceptionWithContext[]> => {
    const month = await getActiveMonth();

    // 1) Obligations for the active month → the set of in-scope obligation ids.
    const { data: obligations, error: obErr } = await supabaseAdmin
      .from("rent_obligations")
      .select("id, month, amount, status, tenant_id, unit_id, property_id")
      .eq("month", month);
    if (obErr) throw new Error(obErr.message);

    const obById = new Map((obligations ?? []).map((o) => [o.id as string, o]));
    const obligationIds = [...obById.keys()];
    if (obligationIds.length === 0) return [];

    // 2) Exceptions tied to those obligations.
    const { data: exceptions, error: exErr } = await supabaseAdmin
      .from("exceptions")
      .select(
        "id, tenant_id, unit_id, rent_obligation_id, type, severity, risk_score, risk_breakdown, recommended_action, status, human_needed, created_at",
      )
      .in("rent_obligation_id", obligationIds)
      .order("created_at", { ascending: false });
    if (exErr) throw new Error(exErr.message);
    if (!exceptions || exceptions.length === 0) return [];

    const exceptionIds = exceptions.map((e) => e.id as string);
    const tenantIds = [...new Set(exceptions.map((e) => e.tenant_id as string))];
    const unitIds = [...new Set(exceptions.map((e) => e.unit_id as string))];

    // 3) Lookups: tenants, units (+ property name via property_id), agent_actions.
    const [{ data: tenants }, { data: units }, { data: actions }] = await Promise.all([
      supabaseAdmin.from("tenants").select("id, name").in("id", tenantIds),
      supabaseAdmin.from("units").select("id, label, property_id").in("id", unitIds),
      supabaseAdmin
        .from("agent_actions")
        .select("id, exception_id, action_type, result, reason, policy_basis, created_at")
        .in("exception_id", exceptionIds)
        .order("created_at", { ascending: true }),
    ]);

    const propertyIds = [...new Set((units ?? []).map((u) => u.property_id as string))];
    const { data: properties } = await supabaseAdmin
      .from("properties")
      .select("id, name")
      .in("id", propertyIds);

    const tenantById = new Map((tenants ?? []).map((t) => [t.id, t]));
    const unitById = new Map((units ?? []).map((u) => [u.id, u]));
    const propertyById = new Map((properties ?? []).map((p) => [p.id, p]));

    const actionsByException = new Map<string, AgentActionEntry[]>();
    for (const a of actions ?? []) {
      const key = a.exception_id as string;
      if (!key) continue;
      const list = actionsByException.get(key) ?? [];
      list.push({
        id: a.id as string,
        actionType: a.action_type,
        result: a.result,
        reason: a.reason,
        policyBasis: a.policy_basis,
        createdAt: a.created_at as string,
      });
      actionsByException.set(key, list);
    }

    return exceptions.map((e) => {
      const ob = obById.get(e.rent_obligation_id as string);
      const unit = unitById.get(e.unit_id as string);
      const property = unit ? propertyById.get(unit.property_id as string) : undefined;
      return {
        id: e.id as string,
        tenantId: e.tenant_id as string,
        tenantName: tenantById.get(e.tenant_id as string)?.name ?? "Unknown",
        unitId: e.unit_id as string,
        unitLabel: unit?.label ?? null,
        propertyName: property?.name ?? null,
        rentObligationId: e.rent_obligation_id as string,
        month: (ob?.month as string) ?? month,
        amount: Number(ob?.amount ?? 0),
        obligationStatus: (ob?.status as string) ?? "unknown",
        status: e.status,
        severity: e.severity,
        riskScore: e.risk_score,
        recommendedAction: e.recommended_action,
        humanNeeded: e.human_needed,
        type: e.type,
        riskBreakdown: (e.risk_breakdown as RiskBreakdown | null) ?? null,
        createdAt: e.created_at as string,
        actions: actionsByException.get(e.id as string) ?? [],
      };
    });
  },
);

/** One row of the Agent Activity Log (flat chronological timeline). */
export type AgentActionLogEntry = {
  id: string;
  timestamp: string;
  tenantId: string;
  tenantName: string;
  unitId: string;
  unitLabel: string | null;
  actionType: string | null;
  result: string | null;
  reason: string | null;
  policyBasis: string | null;
  exceptionId: string | null;
};

/**
 * Flat chronological list of every agent action for the activity log,
 * newest first, denormalized with tenant name + unit label.
 */
export const getAgentActions = createServerFn({ method: "GET" }).handler(
  async (): Promise<AgentActionLogEntry[]> => {
    const { data: actions, error } = await supabaseAdmin
      .from("agent_actions")
      .select(
        "id, exception_id, tenant_id, unit_id, action_type, result, reason, policy_basis, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    if (!actions || actions.length === 0) return [];

    const tenantIds = [...new Set(actions.map((a) => a.tenant_id as string))];
    const unitIds = [...new Set(actions.map((a) => a.unit_id as string))];

    const [{ data: tenants }, { data: units }] = await Promise.all([
      supabaseAdmin.from("tenants").select("id, name").in("id", tenantIds),
      supabaseAdmin.from("units").select("id, label").in("id", unitIds),
    ]);

    const tenantById = new Map((tenants ?? []).map((t) => [t.id, t]));
    const unitById = new Map((units ?? []).map((u) => [u.id, u]));

    return actions.map((a) => ({
      id: a.id as string,
      timestamp: a.created_at as string,
      tenantId: a.tenant_id as string,
      tenantName: tenantById.get(a.tenant_id as string)?.name ?? "Unknown",
      unitId: a.unit_id as string,
      unitLabel: unitById.get(a.unit_id as string)?.label ?? null,
      actionType: a.action_type,
      result: a.result,
      reason: a.reason,
      policyBasis: a.policy_basis,
      exceptionId: a.exception_id,
    }));
  },
);
