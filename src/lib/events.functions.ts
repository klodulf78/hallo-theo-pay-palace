import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type WebhookEvent = {
  id: string;
  type: string;
  amount: number;
  failureReason: string | null;
  occurredAt: string;
  tenantName: string | null;
};

export const getRecentWebhookEvents = createServerFn({ method: "GET" }).handler(
  async (): Promise<WebhookEvent[]> => {
    const { data, error } = await supabaseAdmin
      .from("payment_events")
      .select("id, type, amount, failure_reason, occurred_at, created_at, tenants(name)")
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) throw new Error(error.message);

    return (data ?? []).map((r) => {
      const tenantRel = (r as { tenants: unknown }).tenants;
      const tenant = Array.isArray(tenantRel)
        ? (tenantRel[0] as { name: string } | undefined)
        : (tenantRel as { name: string } | null);
      return {
        id: r.id,
        type: r.type,
        amount: Number(r.amount ?? 0),
        failureReason: r.failure_reason,
        occurredAt: (r.occurred_at ?? r.created_at) as string,
        tenantName: tenant?.name ?? null,
      };
    });
  },
);
