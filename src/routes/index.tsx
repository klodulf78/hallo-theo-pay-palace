import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, LayoutDashboard, User } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "hallo flow — autonomous rent collection" },
      { name: "description", content: "Autonomous rent collection demo for property managers." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-violet-50 px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/70 px-3 py-1 text-xs font-medium text-blue-700">
          Hackathon demo
        </div>
        <h1 className="mt-6 text-5xl font-semibold tracking-tight text-slate-900">hallo flow</h1>
        <p className="mt-3 text-lg text-slate-600">
          An autonomous rent-collection layer that runs the full monthly cycle — charging, retrying,
          offering payment plans, and only escalating true exceptions.
        </p>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            to="/admin"
            className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
          >
            <div>
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <LayoutDashboard className="size-4 text-blue-600" />
                Admin dashboard
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Run the monthly cycle and watch the agent work.
              </div>
            </div>
            <ArrowRight className="size-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
          </Link>

          <Link
            to="/tenant/kaya"
            className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
          >
            <div>
              <div className="flex items-center gap-2 font-semibold text-slate-900">
                <User className="size-4 text-violet-600" />
                Tenant portal — Kaya
              </div>
              <div className="text-xs text-slate-500 mt-1">
                Accept the agent-offered 2-part payment plan.
              </div>
            </div>
            <ArrowRight className="size-4 text-slate-400 group-hover:text-violet-600 transition-colors" />
          </Link>
        </div>
      </div>
    </main>
  );
}
