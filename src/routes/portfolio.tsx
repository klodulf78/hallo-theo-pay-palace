import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPortfolio } from "@/lib/portfolio.functions";
import { getPortfolioKpis } from "@/lib/portfolio-kpis.functions";
import { PortfolioKpiCards } from "@/components/portfolio-kpi-cards";
import { ResetDemoCard } from "@/components/reset-demo-card";
import { DemoControlsCard } from "@/components/demo-controls-card";
import { DunningStatusCard } from "@/components/validation-panels";
import { RecentEventsCard } from "@/components/recent-events-card";

const PortfolioMap = lazy(() => import("@/components/portfolio-map"));

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Dashboard · hallo flow" },
      {
        name: "description",
        content: "Deutschlandweite Karte aller Properties mit Live-Status.",
      },
      { property: "og:title", content: "Dashboard · hallo flow" },
      {
        property: "og:description",
        content: "Deutschlandweite Karte aller Properties mit Live-Status.",
      },
    ],
  }),
  component: PortfolioPage,
});

function fmtDemoDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function DemoDateStrip() {
  const fn = useServerFn(getPortfolioKpis);
  const { data } = useQuery({
    queryKey: ["portfolio-kpis"],
    queryFn: () => fn(),
    refetchInterval: 5000,
  });
  return (
    <div className="rounded-lg border border-border bg-card px-6 py-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Demo-Datum
      </div>
      <div className="mt-1 text-2xl md:text-3xl font-bold tracking-tight text-primary">
        {fmtDemoDate(data?.simulatedNow)}
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">
        Simulationszeitpunkt
      </div>
    </div>
  );
}

function PortfolioPage() {
  const fn = useServerFn(getPortfolio);
  const { data } = useQuery({
    queryKey: ["portfolio"],
    queryFn: () => fn(),
    refetchInterval: 5000,
  });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">
          Dashboard · Deutschland
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live-Übersicht aller verwalteten Objekte
        </p>
      </header>

      <DemoDateStrip />

      <PortfolioKpiCards />

      <div className="rounded-lg overflow-hidden border border-border shadow-sm bg-muted h-[70vh]">
        {mounted && data ? (
          <Suspense
            fallback={
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                Lade Karte…
              </div>
            }
          >
            <PortfolioMap markers={data.markers} />
          </Suspense>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            Lade Karte…
          </div>
        )}
      </div>

      <DunningStatusCard />

      <DemoControlsCard includeSeed />

      <RecentEventsCard />

      <ResetDemoCard simple />
    </div>
  );
}
