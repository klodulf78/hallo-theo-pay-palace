import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TenantStatus } from "@/types";

const STATUS_CONFIG: Record<TenantStatus, { label: string; className: string }> = {
  current: { label: "Current", className: "bg-slate-100 text-slate-700 border-slate-200" },
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  retry_succeeded: { label: "Recovered", className: "bg-blue-100 text-blue-700 border-blue-200" },
  payment_plan_offered: {
    label: "Plan offered",
    className: "bg-amber-100 text-amber-800 border-amber-200",
  },
  payment_plan_accepted: {
    label: "Plan accepted",
    className: "bg-violet-100 text-violet-700 border-violet-200",
  },
  escalated: { label: "Escalated", className: "bg-red-100 text-red-700 border-red-200" },
};

export function StatusBadge({ status, className }: { status: TenantStatus; className?: string }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={cn("font-medium", cfg.className, className)}>
      {cfg.label}
    </Badge>
  );
}
