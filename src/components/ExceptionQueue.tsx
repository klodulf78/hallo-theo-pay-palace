import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useHalloFlow } from "@/lib/store";
import { AlertTriangle, Inbox, ShieldCheck } from "lucide-react";

const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

export function ExceptionQueue() {
  const { state } = useHalloFlow();

  return (
    <Card className="border-slate-200/80 h-full">
      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base text-slate-900">Exception Queue</CardTitle>
        <Badge variant="outline" className="text-xs">
          {state.exceptions.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.exceptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500">
            <Inbox className="size-8 text-slate-300 mb-2" />
            <div className="text-sm">No exceptions yet</div>
            <div className="text-xs text-slate-400">Advance the month to start a rent cycle.</div>
          </div>
        ) : (
          state.exceptions.map((exc) => {
            const tenant = state.tenants.find((t) => t.id === exc.tenantId);
            if (!tenant) return null;
            return (
              <div
                key={exc.id}
                className={cn(
                  "rounded-lg border p-4 transition-colors",
                  exc.humanNeeded
                    ? "border-red-200 bg-red-50/40"
                    : "border-amber-200 bg-amber-50/40",
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {tenant.name}{" "}
                      <span className="text-slate-400 font-normal">/ Unit {tenant.unit}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      May Rent: {fmtEur(tenant.rent)}
                    </div>
                  </div>
                  {exc.humanNeeded ? (
                    <Badge className="bg-red-600 hover:bg-red-600 text-white">
                      <AlertTriangle className="size-3 mr-1" />
                      Human needed
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-emerald-200 bg-emerald-50 text-emerald-700"
                    >
                      <ShieldCheck className="size-3 mr-1" />
                      Agent handling
                    </Badge>
                  )}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-y-1.5 gap-x-4 text-xs">
                  <dt className="text-slate-500">Status</dt>
                  <dd className="text-slate-800 font-medium">{exc.status}</dd>

                  <dt className="text-slate-500">Risk score</dt>
                  <dd className="text-slate-800 font-medium">{exc.riskScore}</dd>

                  <dt className="text-slate-500">Recommended action</dt>
                  <dd className="text-slate-800 font-medium">{exc.recommendedAction}</dd>

                  <dt className="text-slate-500">Human needed</dt>
                  <dd className="text-slate-800 font-medium">{exc.humanNeeded ? "Yes" : "No"}</dd>
                </dl>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
