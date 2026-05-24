import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getPortfolio } from "@/lib/portfolio.functions";
import { PortfolioKpiCards } from "@/components/portfolio-kpi-cards";
import { ResetDemoCard } from "@/components/reset-demo-card";

const PortfolioMap = lazy(() => import("@/components/portfolio-map"));

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio · hallo flow" },
      {
        name: "description",
        content: "Deutschlandweite Karte aller Properties mit Live-Status.",
      },
      { property: "og:title", content: "Portfolio · hallo flow" },
      {
        property: "og:description",
        content: "Deutschlandweite Karte aller Properties mit Live-Status.",
      },
    ],
  }),
  component: PortfolioPage,
});

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
          Portfolio · Deutschland
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Live-Übersicht aller verwalteten Objekte
        </p>
      </header>

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

      <ResetDemoCard />
    </div>
  );
}
