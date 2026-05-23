import type {
  AgentAction,
  Exception,
  PaymentEvent,
  PaymentPlan,
  Tenant,
  TenantStatus,
} from "@/types";
import { RISK_SCORES } from "../agentEngine";
import { getServiceClient, loadTenant, loadTenants, type TenantRow } from "./supabase";
import { chargeRent } from "./stripe";

const HALF = (n: number) => Math.round(n / 2);

interface ToolContext {
  tenant: TenantRow;
  cycleMonth: string;
}

function tenantFromRow(row: TenantRow): Tenant {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    rent: row.rent_cents / 100,
    archetype: row.archetype,
    status: row.status,
  };
}

async function logAction(action: string, reason: string, result: string, tenantId?: string) {
  const sb = getServiceClient();
  await sb.from("agent_actions").insert({ action, reason, result, tenant_id: tenantId ?? null });
}

async function updateTenantStatus(tenantId: string, status: TenantStatus) {
  const sb = getServiceClient();
  await sb.from("tenants").update({ status, updated_at: new Date().toISOString() }).eq("id", tenantId);
}

export async function executeRetry(ctx: ToolContext): Promise<{ success: boolean; reason: string }> {
  // Real retry: call Stripe again. For demo's soft_fail archetype the second attempt succeeds in test mode.
  try {
    const pi = await chargeRent(ctx.tenant, `${ctx.cycleMonth}_retry`);
    const success = pi.status === "succeeded" || pi.status === "processing";
    if (success) {
      await updateTenantStatus(ctx.tenant.id, "retry_succeeded");
    }
    return { success, reason: success ? "Retry charge initiated" : `Retry status: ${pi.status}` };
  } catch (err) {
    return { success: false, reason: (err as Error).message };
  }
}

export async function executeReminder(ctx: ToolContext, channel: string): Promise<{ delivered: boolean }> {
  await logAction(
    `Tenant reminder prepared`,
    `Reminder queued for ${ctx.tenant.name} via ${channel}`,
    "Reminder ready",
    ctx.tenant.id,
  );
  return { delivered: true };
}

export async function executeOfferPlan(
  ctx: ToolContext,
  parts: Array<{ amount: number; due_date: string; label: string }>,
): Promise<{ plan_id: string }> {
  const sb = getServiceClient();
  const { data: plan, error: planErr } = await sb
    .from("payment_plans")
    .insert({ tenant_id: ctx.tenant.id })
    .select()
    .single();
  if (planErr) throw planErr;

  const rows = parts.map((p, idx) => ({
    plan_id: plan.id,
    amount_cents: p.amount,
    due_date: p.due_date,
    label: p.label,
    position: idx,
    status: "scheduled",
  }));
  const { error: partsErr } = await sb.from("payment_plan_parts").insert(rows);
  if (partsErr) throw partsErr;

  await sb.from("exceptions").upsert({
    id: `exc_${ctx.tenant.id}`,
    tenant_id: ctx.tenant.id,
    risk_score: RISK_SCORES[ctx.tenant.archetype],
    status: "Payment plan offered",
    recommended_action: "Offer 2-part plan",
    human_needed: false,
  });

  await updateTenantStatus(ctx.tenant.id, "payment_plan_offered");
  return { plan_id: plan.id };
}

export async function executeEscalate(ctx: ToolContext, reason: string): Promise<{ exception_id: string }> {
  const sb = getServiceClient();
  const id = `exc_${ctx.tenant.id}`;
  await sb.from("exceptions").upsert({
    id,
    tenant_id: ctx.tenant.id,
    risk_score: RISK_SCORES[ctx.tenant.archetype],
    status: `Escalated: ${reason}`,
    recommended_action: "Human review",
    human_needed: true,
  });
  await updateTenantStatus(ctx.tenant.id, "escalated");
  return { exception_id: id };
}

export async function recordPayment(tenantId: string, paymentIntentId: string, status: string, amountCents: number, cycleMonth: string, failureReason?: string) {
  const sb = getServiceClient();
  await sb.from("payments").upsert({
    tenant_id: tenantId,
    amount_cents: amountCents,
    status: status === "succeeded" ? "succeeded" : status === "requires_payment_method" || status === "canceled" ? "failed" : "pending",
    failure_reason: failureReason,
    stripe_payment_intent_id: paymentIntentId,
    cycle_month: cycleMonth,
    settled_at: status === "succeeded" ? new Date().toISOString() : null,
  });
}

export async function advanceMonthLive(cycleMonth: string): Promise<{ chargedCount: number; cycleMonth: string }> {
  const tenants = await loadTenants();
  await logAction(
    `Charged ${cycleMonth} rent for all active tenants`,
    `Monthly cycle started for ${tenants.length} tenants`,
    `${tenants.length} charges created`,
  );

  let charged = 0;
  for (const tenant of tenants) {
    if (!tenant.stripe_customer_id || !tenant.stripe_payment_method_id) continue;
    try {
      const pi = await chargeRent(tenant, cycleMonth);
      await recordPayment(tenant.id, pi.id, pi.status, tenant.rent_cents, cycleMonth);
      charged++;
    } catch (err) {
      const stripeErr = err as { message?: string; payment_intent?: { id: string; status: string } };
      const pi = stripeErr.payment_intent;
      if (pi) {
        await recordPayment(tenant.id, pi.id, pi.status, tenant.rent_cents, cycleMonth, stripeErr.message);
      }
      await logAction(
        `${tenant.name} charge errored at creation`,
        stripeErr.message ?? "Unknown",
        "Will retry via webhook",
        tenant.id,
      );
    }
  }

  return { chargedCount: charged, cycleMonth };
}

export async function acceptPlanLive(tenantId: string): Promise<{ ok: boolean }> {
  const sb = getServiceClient();
  const tenant = await loadTenant(tenantId);
  if (!tenant) throw new Error(`Tenant ${tenantId} not found`);

  const { data: plan } = await sb
    .from("payment_plans")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plan) throw new Error(`No payment plan exists for ${tenantId}`);

  await sb
    .from("payment_plans")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", plan.id);

  const { data: parts } = await sb
    .from("payment_plan_parts")
    .select("*")
    .eq("plan_id", plan.id)
    .order("position");

  if (parts && parts.length > 0) {
    await sb.from("payment_plan_parts").update({ status: "paid" }).eq("id", parts[0].id);
    for (const p of parts.slice(1)) {
      await sb.from("payment_plan_parts").update({ status: "accepted" }).eq("id", p.id);
    }
  }

  await sb
    .from("exceptions")
    .update({ status: "Payment plan accepted" })
    .eq("tenant_id", tenantId);

  await updateTenantStatus(tenantId, "payment_plan_accepted");

  await logAction(
    `${tenant.name} accepted 2-part payment plan`,
    "Tenant clicked Accept Payment Plan in the tenant portal",
    "First installment marked paid, second scheduled",
    tenantId,
  );

  return { ok: true };
}

export interface AgentRunOutcome {
  tenantStatus: TenantStatus;
  actions: AgentAction[];
  exception?: Exception;
  plan?: PaymentPlan;
}

export interface AgentRunInput {
  tenant: TenantRow;
  event: PaymentEvent;
  cycleMonth: string;
}

export { tenantFromRow, logAction, updateTenantStatus };
