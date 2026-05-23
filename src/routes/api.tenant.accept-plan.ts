import { createFileRoute } from "@tanstack/react-router";
import { acceptPlanLive } from "@/lib/server/cycle";
import { getEnv } from "@/lib/server/env";

export const Route = createFileRoute("/api/tenant/accept-plan")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getEnv();
        if (env.DEMO_MODE !== "live") {
          return Response.json(
            { error: "DEMO_MODE is offline; live accept-plan disabled." },
            { status: 400 },
          );
        }
        const body = (await request.json()) as { tenant_id?: string };
        if (!body.tenant_id) {
          return Response.json({ error: "tenant_id required" }, { status: 400 });
        }
        try {
          const result = await acceptPlanLive(body.tenant_id);
          return Response.json(result);
        } catch (err) {
          console.error("Accept plan failed:", err);
          return Response.json({ error: (err as Error).message }, { status: 500 });
        }
      },
    },
  },
});
