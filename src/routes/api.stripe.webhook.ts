import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookSignature } from "@/lib/server/stripe";
import { getServiceClient, loadTenant } from "@/lib/server/supabase";
import { recordPayment, updateTenantStatus, logAction } from "@/lib/server/cycle";
import { runAgentForPaymentEventLlm } from "@/lib/server/agentLlm";

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();
        const sig = request.headers.get("stripe-signature");
        if (!sig) {
          return new Response("Missing signature", { status: 400 });
        }

        let event;
        try {
          event = verifyWebhookSignature(rawBody, sig);
        } catch (err) {
          console.error("Webhook signature verification failed:", err);
          return new Response("Bad signature", { status: 400 });
        }

        const sb = getServiceClient();

        const { data: seen } = await sb
          .from("stripe_events")
          .select("id")
          .eq("id", event.id)
          .maybeSingle();
        if (seen) {
          return new Response("Already processed", { status: 200 });
        }
        await sb.from("stripe_events").insert({ id: event.id, type: event.type });

        try {
          if (event.type === "payment_intent.succeeded") {
            const pi = event.data.object as {
              id: string;
              amount: number;
              status: string;
              metadata: { tenant_id?: string; cycle_month?: string };
            };
            const tenantId = pi.metadata.tenant_id;
            const cycleMonth = pi.metadata.cycle_month ?? "unknown";
            if (tenantId) {
              const tenant = await loadTenant(tenantId);
              if (tenant) {
                await recordPayment(tenantId, pi.id, "succeeded", pi.amount, cycleMonth);
                await updateTenantStatus(tenantId, "paid");
                await logAction(
                  `${tenant.name} paid successfully`,
                  `${cycleMonth} rent of €${(pi.amount / 100).toFixed(0)} cleared via Stripe`,
                  "Charge succeeded",
                  tenantId,
                );
              }
            }
          } else if (event.type === "payment_intent.payment_failed") {
            const pi = event.data.object as {
              id: string;
              amount: number;
              status: string;
              last_payment_error?: { message?: string; code?: string };
              metadata: { tenant_id?: string; cycle_month?: string };
            };
            const tenantId = pi.metadata.tenant_id;
            const cycleMonth = pi.metadata.cycle_month ?? "unknown";
            const failureReason =
              pi.last_payment_error?.message ?? pi.last_payment_error?.code ?? "unknown";
            if (tenantId) {
              const tenant = await loadTenant(tenantId);
              if (tenant) {
                await recordPayment(tenantId, pi.id, "failed", pi.amount, cycleMonth, failureReason);
                await runAgentForPaymentEventLlm({ tenant, failureReason, cycleMonth });
              }
            }
          }
        } catch (err) {
          console.error("Webhook handler error:", err);
          return new Response("Internal error", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
