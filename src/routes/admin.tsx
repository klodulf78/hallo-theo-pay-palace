import { createFileRoute, Link } from "@tanstack/react-router";
import { AgentActivityLog } from "@/components/AgentActivityLog";
import { DashboardKpiCards } from "@/components/DashboardKpiCards";
import { ExceptionQueue } from "@/components/ExceptionQueue";
import { TenantTable } from "@/components/TenantTable";
import { TimeMachinePanel } from "@/components/TimeMachinePanel";
import { useHalloFlow } from "@/lib/store";
import { Building2, Sparkles } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "hallo flow — admin dashboard" },
      { name: "description", content: "Autonomous rent collection — admin dashboard." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { state, metrics } = useHalloFlow();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-6 py-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-gradient-to-br from-blue-600 to-violet-600 grid place-items-center text-white">
              <Sparkles className="size-4" />
            </div>
            <div>
              <Link to="/" className="text-xs text-slate-500 hover:text-slate-900">
                hallo flow
              </Link>
              <div className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Building2 className="size-4 text-slate-400" />
                {state.property.name}
              </div>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            {state.property.units} units · €
            {state.property.expectedMonthlyRent.toLocaleString("de-DE")} expected / mo
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        <TimeMachinePanel />
        <DashboardKpiCards metrics={metrics} />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ExceptionQueue />
          <AgentActivityLog />
        </div>

        <TenantTable />

        {state.monthsAdvanced > 0 ? (
          <div className="rounded-xl border border-blue-100 bg-gradient-to-br from-blue-50 to-violet-50 p-5 text-sm text-slate-700">
            <strong className="text-slate-900">Demo narrative:</strong> Most payments were handled
            automatically. Two failed payments were recovered. One tenant was offered a payment
            plan. Only one true exception requires human review.{" "}
            <Link to="/tenant/kaya" className="text-blue-700 font-medium hover:underline">
              Open Kaya&apos;s tenant portal →
            </Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}
