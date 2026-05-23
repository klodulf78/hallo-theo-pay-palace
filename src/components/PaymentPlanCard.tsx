import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PaymentPlan } from "@/types";
import { Check, Clock } from "lucide-react";

const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

const STATUS_BADGE = {
  scheduled: {
    label: "Scheduled",
    className: "bg-slate-100 text-slate-700 border-slate-200",
    Icon: Clock,
  },
  accepted: {
    label: "Scheduled",
    className: "bg-blue-100 text-blue-700 border-blue-200",
    Icon: Clock,
  },
  paid: {
    label: "Paid",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
    Icon: Check,
  },
} as const;

export function PaymentPlanCard({ plan }: { plan: PaymentPlan | undefined }) {
  if (!plan) return null;
  return (
    <Card className="border-blue-100 bg-gradient-to-br from-white to-blue-50/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-slate-900">Recommended payment plan</CardTitle>
          {plan.acceptedAt ? (
            <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">Accepted</Badge>
          ) : (
            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-800">
              Pending
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {plan.parts.map((part, idx) => {
            const cfg = STATUS_BADGE[part.status];
            const Icon = cfg.Icon;
            return (
              <li
                key={idx}
                className={cn(
                  "flex items-center justify-between rounded-lg border p-3 bg-white/70",
                  part.status === "paid" ? "border-emerald-200" : "border-slate-200",
                )}
              >
                <div>
                  <div className="text-sm font-medium text-slate-900">{fmtEur(part.amount)}</div>
                  <div className="text-xs text-slate-500">Due {part.dueDate}</div>
                </div>
                <Badge variant="outline" className={cfg.className}>
                  <Icon className="size-3 mr-1" />
                  {cfg.label}
                </Badge>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
