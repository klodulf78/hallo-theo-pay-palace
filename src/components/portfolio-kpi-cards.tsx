import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getPortfolioKpis, type PortfolioKpis } from "@/lib/portfolio-kpis.functions";

const fmt = (n: number) => n.toLocaleString("de-DE");
const fmtPct = (n: number) =>
  `${n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function StatCard({
  label,
  value,
  subtext,
  valueClass,
  subtextClass,
}: {
  label: string;
  value: string;
  subtext: React.ReactNode;
  valueClass?: string;
  subtextClass?: string;
}) {
  return (
    <Card className="p-4 bg-muted/30 border-border/60 shadow-none">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-2 text-3xl font-semibold tracking-tight tabular-nums", valueClass)}>
        {value}
      </div>
      <div className={cn("mt-1 text-xs text-muted-foreground", subtextClass)}>
        {subtext}
      </div>
    </Card>
  );
}

export function PortfolioKpiCards() {
  const fn = useServerFn(getPortfolioKpis);
  const { data } = useQuery<PortfolioKpis>({
    queryKey: ["portfolio-kpis"],
    queryFn: () => fn(),
    refetchInterval: 5000,
  });

  if (!data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4 h-[110px] bg-muted/30 border-border/60 shadow-none animate-pulse" />
        ))}
      </div>
    );
  }

  // Occupancy color
  const occPct = data.occupancy.percent;
  const occColor =
    data.occupancy.assigned === 0
      ? "text-muted-foreground"
      : occPct >= 100
        ? "text-emerald-600"
        : occPct >= 50
          ? "text-amber-600"
          : "text-red-600";

  const hasStage3 = data.dunning.maxStage >= 3;
  const hasAny = data.dunning.tenants > 0;
  const dunningValueClass = hasStage3
    ? "text-red-600"
    : hasAny
      ? "text-amber-600"
      : "text-muted-foreground";

  // Inflow card colors
  const failedCount = data.inflow.failed;
  const failedPct = data.inflow.failedPercent;
  const inflowSubColor =
    failedCount > 0 && failedPct > 25
      ? "text-red-600"
      : failedCount > 0
        ? "text-amber-600"
        : undefined;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <StatCard
        label="Einheiten gesamt"
        value={fmt(data.units.total)}
        subtext={`${data.units.properties} Gebäude`}
      />
      <StatCard
        label="Auslastung"
        value={`${fmt(data.occupancy.assigned)}/${fmt(data.occupancy.total)} vermietet`}
        valueClass={cn("text-2xl", occColor)}
        subtext="Mieter / Einheiten"
      />
      <StatCard
        label="Soll-Miete / Monat"
        value={fmt(Math.round(data.monthlyRent))}
        subtext="€ netto kalt"
      />
      <StatCard
        label={`Ist-Eingang ${data.monthLabel}`}
        value={fmt(Math.round(data.inflow.received))}
        subtext={
          <span className={inflowSubColor}>
            {fmtPct(data.inflow.percent)} von Soll · {fmt(failedCount)}×
            fehlgeschlagen
          </span>
        }
      />
      <StatCard
        label="Mieter im Verzug"
        value={fmt(data.dunning.tenants)}
        valueClass={dunningValueClass}
        subtext={
          <span className={hasStage3 ? "text-red-600 font-medium" : undefined}>
            {data.dunning.tenants === 0
              ? "Keine offenen Mahnverfahren"
              : `${data.dunning.stage1}× Stufe 1 · ${data.dunning.stage2}× Stufe 2 · ${data.dunning.stage3}× Stufe 3`}
          </span>
        }
      />
    </div>
  );
}
