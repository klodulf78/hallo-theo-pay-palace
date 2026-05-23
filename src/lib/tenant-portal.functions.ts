import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getActiveMonth } from "@/lib/dashboard.functions";

const InputSchema = z.object({ tenantId: z.string().optional() }).optional().nullable();

export type TenantPortalInstallment = {
  id: string;
  sequence: number;
  amount: number;
  dueDate: string | null;
  status: string | null;
};

export type TenantPortalPlan = {
  id: string;
  totalAmount: number;
  installmentCount: number | null;
  status: string | null;
  createdAt: string;
  installments: TenantPortalInstallment[];
};

export type TenantPortalData = {
  tenant: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    rentAmount: number;
    behaviorProfile: string | null;
    riskScore: number | null;
    unitId: string;
    unitLabel: string | null;
    propertyName: string | null;
  };
  month: string;
  obligation: {
    id: string;
    status: string;
    amountDue: number;
    dueDate: string;
    stripeInvoiceId: string | null;
  } | null;
  /** Latest open/active exception for the active-month obligation, if any. */
  exceptionId: string | null;
  sepaMandate: {
    status: string | null;
    mandateReference: string | null;
    iban: string | null;
    signedDate: string | null;
  } | null;
  plans: TenantPortalPlan[];
  latestMessage: {
    id: string;
    channel: string | null;
    messageType: string | null;
    body: string | null;
    createdAt: string;
  } | null;
};

/**
 * Tenant Portal payload: tenant + their active-month rent obligation
 * (status / amount due), SEPA mandate status, any offered payment plans with
 * installments, and the latest communications message. If no tenantId is given,
 * defaults to the tenant whose behavior_profile = 'payment_plan' (Kaya).
 * Returns null if no matching tenant exists.
 */
export const getTenantPortal = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }): Promise<TenantPortalData | null> => {
    const month = await getActiveMonth();
    const wantedId = data?.tenantId;

    // 1) Resolve the tenant. The generated supabase types fight the dynamic
    // query builder here, so cast the row through `unknown` to a local shape.
    type TenantRow = {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      rent_amount: number;
      behavior_profile: string | null;
      risk_score: number | null;
      unit_id: string;
    };

    const tenantQuery = wantedId
      ? supabaseAdmin
          .from("tenants")
          .select("id, name, email, phone, rent_amount, behavior_profile, risk_score, unit_id")
          .eq("id", wantedId)
          .maybeSingle()
      : supabaseAdmin
          .from("tenants")
          .select("id, name, email, phone, rent_amount, behavior_profile, risk_score, unit_id")
          .eq("behavior_profile", "payment_plan")
          .limit(1)
          .maybeSingle();

    const { data: tenantData } = await tenantQuery;
    const tenant = (tenantData as unknown as TenantRow | null) ?? null;

    if (!tenant) return null;

    // 2) Unit + property labels.
    const { data: unit } = await supabaseAdmin
      .from("units")
      .select("id, label, property_id")
      .eq("id", tenant.unit_id)
      .maybeSingle();
    let propertyName: string | null = null;
    if (unit?.property_id) {
      const { data: property } = await supabaseAdmin
        .from("properties")
        .select("name")
        .eq("id", unit.property_id)
        .maybeSingle();
      propertyName = property?.name ?? null;
    }

    // 3) Active-month obligation for this tenant.
    const { data: obligation } = await supabaseAdmin
      .from("rent_obligations")
      .select("id, status, amount, due_date, stripe_invoice_id")
      .eq("tenant_id", tenant.id)
      .eq("month", month)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3b) Latest exception for this obligation (for portal action wiring).
    let exceptionId: string | null = null;
    if (obligation?.id) {
      const { data: exc } = await supabaseAdmin
        .from("exceptions")
        .select("id")
        .eq("rent_obligation_id", obligation.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      exceptionId = (exc?.id as string | undefined) ?? null;
    }

    // 4) SEPA mandate (latest).
    const { data: mandate } = await supabaseAdmin
      .from("sepa_mandates")
      .select("status, mandate_reference, iban, signed_date")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 5) Payment plans + installments for this tenant.
    const { data: planRows } = await supabaseAdmin
      .from("payment_plans")
      .select("id, total_amount, installment_count, status, created_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false });

    const planIds = (planRows ?? []).map((p) => p.id as string);
    let installmentsByPlan = new Map<string, TenantPortalInstallment[]>();
    if (planIds.length > 0) {
      const { data: insts } = await supabaseAdmin
        .from("payment_plan_installments")
        .select("id, payment_plan_id, sequence, amount, due_date, status")
        .in("payment_plan_id", planIds)
        .order("sequence", { ascending: true });
      installmentsByPlan = (insts ?? []).reduce((map, i) => {
        const key = i.payment_plan_id as string;
        const list = map.get(key) ?? [];
        list.push({
          id: i.id as string,
          sequence: i.sequence as number,
          amount: Number(i.amount),
          dueDate: i.due_date,
          status: i.status,
        });
        map.set(key, list);
        return map;
      }, new Map<string, TenantPortalInstallment[]>());
    }

    const plans: TenantPortalPlan[] = (planRows ?? []).map((p) => ({
      id: p.id as string,
      totalAmount: Number(p.total_amount),
      installmentCount: p.installment_count,
      status: p.status,
      createdAt: p.created_at as string,
      installments: installmentsByPlan.get(p.id as string) ?? [],
    }));

    // 6) Latest communication message.
    const { data: msg } = await supabaseAdmin
      .from("communications")
      .select("id, channel, message_type, body, created_at")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        email: tenant.email,
        phone: tenant.phone,
        rentAmount: Number(tenant.rent_amount),
        behaviorProfile: tenant.behavior_profile,
        riskScore: tenant.risk_score,
        unitId: tenant.unit_id,
        unitLabel: unit?.label ?? null,
        propertyName,
      },
      month,
      obligation: obligation
        ? {
            id: obligation.id as string,
            status: obligation.status as string,
            amountDue: Number(obligation.amount),
            dueDate: obligation.due_date as string,
            stripeInvoiceId: obligation.stripe_invoice_id,
          }
        : null,
      exceptionId,
      sepaMandate: mandate
        ? {
            status: mandate.status,
            mandateReference: mandate.mandate_reference,
            iban: mandate.iban,
            signedDate: mandate.signed_date,
          }
        : null,
      plans,
      latestMessage: msg
        ? {
            id: msg.id as string,
            channel: msg.channel,
            messageType: msg.message_type,
            body: msg.body,
            createdAt: msg.created_at as string,
          }
        : null,
    };
  });
