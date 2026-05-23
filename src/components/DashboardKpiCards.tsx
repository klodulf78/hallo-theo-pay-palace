import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DashboardMetrics } from "@/types";
import {
  ArrowDownToLine,
  ArrowUpRight,
  CircleHelp,
  HandCoins,
  ShieldAlert,
  Sparkles,
  Ticket,
  TrendingUp,
  Wallet,
} from "lucide-react";

const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone?: "neutral" | "primary" | "success" | "warn" | "danger";
}

const TONE: Record<NonNullable<KpiProps["tone"]>, string> = {
  neutral: "from-slate-50 to-white text-slate-700",
  primary: "from-blue-50 to-violet-50 text-blue-700",
  success: "from-emerald-50 to-white text-emerald-700",
  warn: "from-amber-50 to-white text-amber-700",
  danger: "from-red-50 to-white text-red-700",
};

function Kpi({ label, value, hint, Icon, tone = "neutral" }: KpiProps) {
  return (
    <Card className="overflow-hidden border-slate-200/80">
      <CardContent className="p-5">
        <div
          className={cn(
            "flex items-start justify-between bg-gradient-to-br rounded-lg -m-1 p-4",
            TONE[tone],
          )}
        >
          <div>
            <div className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</div>
            <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
            {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
          </div>
          <Icon className="size-5 opacity-80" />
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardKpiCards({ metrics }: { metrics: DashboardMetrics }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      <Kpi
        label="Expected Rent"
        value={fmtEur(metrics.expectedRent)}
        Icon={Wallet}
        tone="primary"
      />
      <Kpi
        label="Collected"
        value={fmtEur(metrics.collectedRent)}
        Icon={ArrowDownToLine}
        tone="success"
      />
      <Kpi
        label="Auto-Recovered"
        value={fmtEur(metrics.autoRecoveredAmount)}
        Icon={Sparkles}
        tone="primary"
      />
      <Kpi
        label="Payment Plan"
        value={fmtEur(metrics.paymentPlanAmount)}
        Icon={HandCoins}
        tone="warn"
      />
      <Kpi
        label="Human Review"
        value={fmtEur(metrics.humanReviewAmount)}
        Icon={ShieldAlert}
        tone="danger"
      />

      <Kpi
        label="Auto-Cleared"
        value={`${metrics.autoClearedPct}%`}
        hint="First-attempt success"
        Icon={TrendingUp}
        tone="success"
      />
      <Kpi
        label="Auto-Recovered"
        value={`${metrics.autoRecoveredPct}%`}
        hint="Agent retry"
        Icon={ArrowUpRight}
        tone="primary"
      />
      <Kpi
        label="Human Review"
        value={`${metrics.humanReviewPct}%`}
        hint="Escalations"
        Icon={CircleHelp}
        tone="danger"
      />
      <Kpi
        label="Support Tickets"
        value={`${metrics.supportTickets}`}
        hint="Tenant-raised"
        Icon={Ticket}
        tone="neutral"
      />
    </div>
  );
}
