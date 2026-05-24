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

  const occColor =
    data.occupancy.percent > 90
      ? "text-emerald-600"
      : data.occupancy.percent >= 70
        ? "text-amber-600"
        : "text-red-600";

  const hasOpen = data.inflow.open > 0.01;
  const hasStage3 = data.dunning.stage3 > 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <StatCard
        label="Einheiten gesamt"
        value={fmt(data.units.total)}
        subtext={`${data.units.properties} Gebäude · ${data.units.cities} Städte`}
      />
      <StatCard
        label="Auslastung"
        value={fmtPct(data.occupancy.percent)}
        valueClass={occColor}
        subtext={`${data.occupancy.assigned}/${data.occupancy.total} vermietet`}
      />
      <StatCard
        label="Soll-Miete / Monat"
        value={fmt(Math.round(data.monthlyRent))}
        subtext="€ netto kalt"
      />
      <StatCard
        label={`Eingang ${data.monthLabel}`}
        value={fmt(Math.round(data.inflow.received))}
        subtext={
          <span className={hasOpen ? "text-amber-600" : undefined}>
            {fmtPct(data.inflow.percent)} —{" "}
            {fmt(Math.round(data.inflow.open))} € offen
          </span>
        }
      />
      <StatCard
        label="Offene Posten"
        value={fmt(data.dunning.total)}
        valueClass={hasStage3 ? "text-red-600" : undefined}
        subtext={
          <span className={hasStage3 ? "text-red-600 font-medium" : undefined}>
            {data.dunning.stage1}× Stufe 1 · {data.dunning.stage2}× Stufe 2 ·{" "}
            {data.dunning.stage3}× Stufe 3
          </span>
        }
      />
    </div>
  );
}
