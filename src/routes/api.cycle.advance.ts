import { createFileRoute } from "@tanstack/react-router";
import { advanceMonthLive } from "@/lib/server/cycle";
import { getEnv } from "@/lib/server/env";

export const Route = createFileRoute("/api/cycle/advance")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const env = getEnv();
        if (env.DEMO_MODE !== "live") {
          return Response.json(
            { error: "DEMO_MODE is offline; live cycle disabled." },
            { status: 400 },
          );
        }
        let body: { cycle_month?: string } = {};
        try {
          body = (await request.json()) as { cycle_month?: string };
        } catch {
          body = {};
        }
        const cycleMonth = body.cycle_month ?? defaultCycleMonth();
        try {
          const result = await advanceMonthLive(cycleMonth);
          return Response.json(result);
        } catch (err) {
          console.error("Cycle advance failed:", err);
          return Response.json({ error: (err as Error).message }, { status: 500 });
        }
      },
    },
  },
});

function defaultCycleMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
