import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getPortfolioKpis, type PortfolioKpis } from "@/lib/portfolio-kpis.functions";
import { useLang, formatCurrency, formatNumber, formatPercent } from "@/lib/use-language";

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
  const { lang, t } = useLang();
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
        label={t("kpi.unitsTotal")}
        value={formatNumber(data.units.total, lang)}
        subtext={`${data.units.properties} ${t("kpi.buildings")}`}
      />
      <StatCard
        label={t("kpi.occupancy")}
        value={`${formatNumber(data.occupancy.assigned, lang)}/${formatNumber(data.occupancy.total, lang)} ${t("kpi.rented")}`}
        valueClass={cn("text-2xl", occColor)}
        subtext={t("kpi.tenantsPerUnits")}
      />
      <StatCard
        label={t("kpi.targetRent")}
        value={formatCurrency(Math.round(data.monthlyRent), lang)}
        subtext={t("kpi.netCold")}
      />
      <StatCard
        label={`${t("kpi.actualIncome")} ${data.monthLabel}`}
        value={formatCurrency(Math.round(data.inflow.received), lang)}
        subtext={
          <span className={inflowSubColor}>
            {formatPercent(data.inflow.percent, lang)} {t("kpi.ofTarget")} · {formatNumber(failedCount, lang)}× {t("kpi.failed")}
          </span>
        }
      />
      <StatCard
        label={t("kpi.tenantsInArrears")}
        value={formatNumber(data.dunning.tenants, lang)}
        valueClass={dunningValueClass}
        subtext={
          <span className={hasStage3 ? "text-red-600 font-medium" : undefined}>
            {data.dunning.tenants === 0
              ? t("kpi.noDunning")
              : `${data.dunning.stage1}× ${t("kpi.stage")} 1 · ${data.dunning.stage2}× ${t("kpi.stage")} 2 · ${data.dunning.stage3}× ${t("kpi.stage")} 3`}
          </span>
        }
      />
    </div>
  );
}
